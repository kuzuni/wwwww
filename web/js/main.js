// ===== 부트스트랩 + 메인 루프 =====
(function () {
    const LOGIC_TICK_MS = 100;

    function fitLayout() {
        // 9:16 레터박스 + 루트 폰트 스케일 (기준 높이 844px)
        const app = document.getElementById('app');
        const vw = window.innerWidth, vh = window.innerHeight;
        let h = vh, w = h * 9 / 16;
        if (w > vw) { w = vw; h = w * 16 / 9; }
        app.style.width = w + 'px';
        app.style.height = h + 'px';
        // ⚠️ 여기에 하한(예전 `Math.max(12, …)`)을 두면 안 된다 — 레이아웃 폭은 전부 rem 기반이라
        // 폰트만 축소를 멈추면 그림이 앱 상자보다 커져 `#app{overflow:hidden}` 에 잘려 나간다.
        // 실측(QA 15차): 가로 932x430 은 비례값 8.15px 인데 하한 12px 이 걸려 47% 과대 → [자동🔄] 버튼이
        // 오른쪽으로 4~39px 이탈하고 [대장간 레벨 N] 이 6줄로 쪼개졌다. 세로 320x568 도 같은 이유로 깨졌다.
        document.documentElement.style.fontSize = (h / 844 * 16) + 'px';
        // 레터박스 때문에 #app 높이 ≠ 브라우저 뷰포트 높이다(9:16보다 세로로 긴 폰에서 h < vh).
        // 팝업 카드 높이를 vh로 잡으면 앱보다 큰 카드가 나와 하단 버튼이 탭바 밑으로 밀린다 —
        // 실제 앱 높이를 CSS 변수로 내려 팝업이 이 값을 기준으로 크기를 잡게 한다.
        document.documentElement.style.setProperty('--app-h', h + 'px');
        document.documentElement.style.setProperty('--app-w', w + 'px');
        if (Scene3D.renderer) Scene3D.resize();
        // 기술트리 연결선은 노드 중심을 **실측**해 그린 SVG라 화면 크기가 바뀌면 다시 그려야 한다
        if (typeof UI !== 'undefined' && UI.drawTechLinks) UI.drawTechLinks();
    }

    // ---- 부팅 로딩 오버레이 (startup-lag-loading, 사용자 지시 2026-08-19) ----
    // 시작 렉의 지배 비용은 첫 렌더의 셰이더 컴파일(수 초, 없앨 수 없음)이라 로딩창 아래에서 소화한다.
    // 부팅을 단계로 쪼개 단계 사이마다 이벤트 루프에 양보(rAF+setTimeout)해야 오버레이가 실제로
    // 칠해지고 진행률이 갱신된다 — 통짜 동기 블록이면 로딩창을 넣어도 첫 페인트가 끝까지 밀린다.
    const blSet = (pct, label) => {
        const f = document.getElementById('bl-fill'), s = document.getElementById('bl-stage');
        if (f) f.style.width = pct + '%';
        if (s && label) s.textContent = label;
    };
    // rAF(페인트 기회) 뒤 setTimeout(태스크 경계)까지 기다려야 진행률이 화면에 반영된다.
    const blYield = () => new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
    const blDone = () => {
        const el = document.getElementById('boot-loading');
        if (!el) return;
        el.classList.add('bl-done');
        setTimeout(() => el.remove(), 450); // 인라인 CSS transition .4s와 맞춤
    };

    async function boot() {
        blSet(8, '세이브 불러오는 중…');
        loadGame();
        Dungeons.ensure();
        TechTree.ensure();
        Mounts.ensure();
        Ascension.ensure(); // 라인 승천 횟수 필드 보정 (구세이브 마이그레이션)
        Forge.ensureRollLevels(); // 시대별 뽑기 레벨 필드 보정 (구세이브는 전 시대 1레벨부터 시작)
        Pass.ensure();
        Chat.ensure();
        // 부팅 시 자동 지급은 폐기 — 누적분은 그대로 두고 팝업으로 보여주기만 한다(수집은 [수집] 버튼에서만).
        const offlinePending = pendingOffline();
        // 브라우저 자동재생 정책: 최초 사용자 입력 시 AudioContext 활성화
        // (로딩 중의 탭도 유효하도록 오버레이가 떠 있는 동안 먼저 등록한다)
        document.addEventListener('pointerdown', () => { SFX.resume(); SFX.startMusic(); }, { once: true });
        await blYield();

        blSet(24, '인터페이스 조립 중…');
        // 렌더 한 곳이 터져도 그 뒤(3D·전투·틱·자동저장 등록)가 통째로 날아가면 안 된다 —
        // QA 10차 버그가 정확히 그 모양이었다(세이브 필드 누락 → renderSkillBar TypeError →
        // boot() 중단 → 화면이 얇은 띠로 붕괴 + 게임 내 초기화 버튼조차 안 그려져 탈출 불가).
        // 세이브 쪽 원인은 loadGame()의 ensureStateShape()가 막지만, 어떤 렌더 실패도 같은 사고를
        // 다시 일으키지 못하게 여기서 한 겹 더 끊는다. 조용히 삼키지는 않는다(콘솔에 남긴다).
        try { UI.init(); } catch (e) { console.error('UI.init() 실패 — 나머지 부팅은 계속한다', e); }
        await blYield();

        blSet(42, '전장 짓는 중…');
        // 🚨 UI.init 과 같은 이유로 한 겹 끊는다 (mobile-combat-scene-blank). 여기서 예외가 새면
        //    boot() 가 이 줄에서 끝나 **Combat.start()·논리 틱·rAF 루프·자동저장이 통째로 등록되지
        //    않는다** — 화면은 "UI 는 멀쩡한데 전장만 검정"이 되고 게임 진행도 멈춘다(사용자 신고와
        //    같은 그림). Scene3D 는 GL 을 못 얻어도 씬 그래프를 끝까지 지어 두므로, 여기서 끊어도
        //    Combat 이 부르는 spawnEnemy·hitEnemy 는 전부 정상 동작한다.
        try {
            Scene3D.init(
                document.getElementById('game3d'),
                document.getElementById('fx-layer'),
                document.getElementById('game-area')
            );
        } catch (e) { console.error('Scene3D.init() 실패 — 나머지 부팅은 계속한다', e); }
        fitLayout();
        window.addEventListener('resize', fitLayout);
        await blYield();

        blSet(58, '전투 준비 중…');
        // ⚠️ `UI.init()` 과 같은 이유로 격리한다 (save-item-no-subs-kills-boot): 손상 세이브 한 칸
        //    때문에 `recalcHero` 가 던지면 종전에는 **여기서 boot() 가 통째로 끊겨** 논리 틱·자동
        //    저장·디버그 진입까지 전부 등록되지 않았다(화면만 멀쩡하고 게임이 멈춘 그림).
        //    조용히 삼키지는 않는다 — 콘솔에 남겨 프로브의 '콘솔 에러 0건' 판정에 걸리게 한다.
        try { Combat.start(); } catch (e) { console.error('Combat.start() 실패 — 나머지 부팅은 계속한다', e); }
        // 진행 중이던 던전을 이어 연다(dungeon-run-lost-on-reload). `Combat.start()` 뒤여야 한다 —
        // 안에서 `Combat.setupStage()` 를 던전 모드로 다시 태우기 때문이다.
        try { Dungeons.restoreRun(); } catch (e) { console.error('Dungeons.restoreRun() 실패 — 나머지 부팅은 계속한다', e); }
        League.ensure(); // 전투력 계산이 끝난 뒤 봇 생성 (combatPower 참조)
        UI.renderTopBar(); // UI.init()에서 먼저 그린 상단바(전투력 0)를 실제 계산치로 갱신
        UI.updateStageLabel();
        await blYield();

        // 셰이더 워밍업 — 시작 렉의 본체. 영웅·적·맵·포스트 스택의 셰이더 프로그램 컴파일과
        // 첫 프레임 렌더를 로딩창이 덮고 있는 동안 전부 소화한다(안 하면 오버레이가 사라진 직후
        // 첫 rAF 프레임에서 수 초짜리 프리즈가 사용자 눈앞에서 터진다 — probe-startup-lag 실측).
        blSet(74, '용광로 데우는 중…');
        try { Scene3D.warmup(); } catch (e) { console.error('Scene3D.warmup() 실패 — 부팅은 계속한다', e); }
        blSet(96, '마무리 중…');
        await blYield();

        if (offlinePending && offlinePending.elapsed >= 60) UI.showOffline(offlinePending); // 1분 미만 경과는 팝업 생략

        // 지난 세션이 판매/장착을 고르지 않고 떠난 제작품 복원 — 오프라인 팝업보다 뒤에 띄워 위로 오게 한다
        UI.restorePendingCraft();
        // 자동 제작이 켜진 채로 저장됐으면 순차 시퀀스를 이어서 시작한다
        if (S.autoForgeOn && isUnlocked('autoForge')) UI.startAutoSeq();

        // 디버그: ?tab=summon|pets|skills|debug 등으로 패널 바로 열기, ?debug=craft로 제작 모달 확인
        const params = new URLSearchParams(location.search);
        // 🚨 디버그 탭은 **기본 노출**이다 — 하단 네비 6번째 칸 (사용자 지시 2026-08-18, `nav-6th-keep-debug`:
        // "하단 네비에 6번째는 디버그로 냅두라"). 같은 날 앞선 지시("기본 노출은 4탭")로 여기서
        // `display:none` 을 걸어 숨기고 있었는데, **뒤 지시가 그걸 번복**했다. 되돌리지 말 것 —
        // 다시 숨기려면 사용자 지시가 한 번 더 있어야 한다.
        // (`?tab=debug` 딥링크는 아래 switchTab 이 그대로 처리한다. 숨김 코드가 없어도 무해하다.)
        const dbgTab = params.get('tab');
        if (dbgTab) UI.switchTab(dbgTab);
        if (params.get('debug') === 'craft') { S.hammers += 10; UI.onCraft(); }
        if (params.get('debug') === 'pets') {
            // 펫 모델 검증: 지정 3마리 출전 (등급은 실제 데이터에서 역조회)
            const findRarity = n => RARITIES.find(r => petStats[r].some(d => d.name === n)) || 'common';
            const names = (params.get('names') || 'Scorpion,Turtle,Baby Dragon').split(',');
            S.pets = names.map(n => {
                const rarity = findRarity(n.trim());
                return { name: n.trim(), rarity, level: 1, dupes: 0, xp: 0, stars: 0, subs: Pets.rollSubs() };
            });
            S.activePets = [0, 1, 2].slice(0, S.pets.length);
            Scene3D.refreshPets();
            Combat.recalcHero();
        }
        if (params.get('debug') === 'gear') {
            // 외형 검증: ?debug=gear&h=2&a=2 (이름 인덱스 지정 가능)
            const hi = parseInt(params.get('h') || '0'), ai = parseInt(params.get('a') || '0');
            const hAge = params.get('hage') || 'quantum', aAge = params.get('aage') || 'underworld';
            const wAge = params.get('wage') || 'divine', rar = params.get('rar') || 'legendary'; // 검증샷용 — 발광 링·오브 없는 저시대·저등급 지정 가능
            const mk = (slot, age, wtype, nameIdx) => ({ name: 'test', slot, age, ageIdx: AGES.indexOf(age), rarity: rar, level: 50, main: SLOT_MAIN[slot], value: 1000, subs: [], wtype, nameIdx });
            Forge.equip(mk('weapon', wAge, params.get('w') || 'staff'));
            Forge.equip(mk('helmet', hAge, null, hi));
            Forge.equip(mk('armor', aAge, null, ai));
        }

        if (params.get('debug') === 'dungeon') {
            // 던전 검증: ?debug=dungeon → 모달, &d=hammer 즉시 입장
            S.bestChapter = 5; S.bestStage = 1;
            Dungeons.ensure();
            const d = params.get('d');
            if (d) Dungeons.enter(d); else UI.openDungeons();
        }
        if (params.get('debug') === 'tech') {
            // 기술트리 검증: ?debug=tech → 물약 지급 후 모달
            S.potions += 999999;
            UI.openTechTree();
        }
        if (params.get('debug') === 'mount') {
            // 마운트 검증: ?debug=mount → 태엽 지급 후 모달
            S.winders += 999999;
            UI.openMounts();
        }
        if (params.get('debug') === 'ascend') {
            // 승천(별) 검증: ?debug=ascend → 승천 팝업(카테고리별 별 합계) 표시
            UI.openAscension();
        }

        // 로직: 고정 100ms 틱 (탭 복귀 시 밀린 틱 따라잡기, 최대 5초분)
        // 탭이 백그라운드인 동안은 건너뜀 — 안 그러면 브라우저가 스로틀링된 채로도 계속 틱을 돌려
        // 몬스터 처치·스테이지 클리어 보상이 시뮬레이션되고, 이후 오프라인 보상까지 같은 시간에 또 지급됨.
        // 탭이 다시 보일 때 logicLast를 리셋해 백그라운드 구간은 전부 오프라인 보상 계산으로 넘김.
        let logicLast = performance.now();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) logicLast = performance.now();
        });
        setInterval(() => {
            if (document.hidden) return;
            const now = performance.now();
            let elapsed = Math.min(5000, now - logicLast);
            logicLast = now;
            while (elapsed >= LOGIC_TICK_MS) {
                Combat.tick(LOGIC_TICK_MS / 1000);
                elapsed -= LOGIC_TICK_MS;
            }
            logicLast -= elapsed; // 남은 시간 이월
        }, LOGIC_TICK_MS);

        // 렌더: rAF
        // 🚨 `update()` 의 예외가 **루프를 죽이지 못하게** 한다 (mobile-combat-scene-blank).
        //    예전 구조는 `Scene3D.update(dt); requestAnimationFrame(frame);` 라, update 가 한 번만
        //    던져도 다음 프레임이 예약되지 않아 화면이 그 프레임에 영구히 멈춘다(부팅 직후면 검정).
        //    한 기기에서만 터지는 예외 하나가 전장을 통째로 못 쓰게 만드는 건 과한 대가다.
        let renderLast = performance.now();
        let frameErrs = 0;
        function frame(t) {
            const dt = Math.min(0.1, (t - renderLast) / 1000);
            renderLast = t;
            requestAnimationFrame(frame);   // 먼저 예약 — 아래가 어떻게 터지든 루프는 산다
            try {
                Scene3D.update(dt);
            } catch (e) {
                // 매 프레임 같은 예외를 콘솔에 쏟으면 그 자체가 렉이 된다 — 앞 5회만 남긴다.
                if (++frameErrs <= 5) console.error('Scene3D.update() 예외 — 렌더 루프는 계속한다', e);
            }
        }
        requestAnimationFrame(frame);

        // 1초 주기: 타이머/UI/부화/업그레이드 완료 체크
        setInterval(() => {
            Forge.tickUpgrade();
            TechTree.tick();
            Pets.tick();
            Dungeons.ensure(); // 매일 09:00 열쇠 리셋 감지
            League.ensure(); // 매일 09:00 도전 티켓 리셋 + 시즌 종료 감지
            Shop.ensure(); // 매일 09:00 특가 수령 상태 리셋 감지
            if (Chat.tick()) { // 봇 채팅 새 메시지 생성 시 하단 미리보기 + (열려있다면) 전체화면 채팅 갱신
                UI.renderChatPreview();
                if (!UI.els.chatModal.classList.contains('hidden')) UI.renderChatFull();
            }
            UI.tickSecond();
        }, 1000);

        // 오토 포지: 예전에는 여기서 3초마다 배치로 즉시 처리해 아무 연출이 없었다.
        // 이제 UI.autoSeqStep()이 한 개씩 '망치질 → 카드 → 비교 팝업/코인 판매'로 돌린다(사용자 지시 2026-08-17).
        // 이 틱은 시퀀스가 어떤 이유로든(탭 백그라운드 복귀, 팝업 대기 해제 누락) 멈춰 있으면 다시 밀어 주는 안전망이다.
        setInterval(() => {
            if (document.hidden) return;
            if (!S.autoForgeOn || !isUnlocked('autoForge')) return;
            // 망치가 떨어져도 **아직 처리 안 한 통과분 큐가 남아 있으면 시퀀스를 죽이지 않는다**
            // (autoforge-show-all-cards 3차 사양: 카드 N장 뒤에 팝업 N개). 여기서 먼저 죽이면
            // 카드를 다 보여준 뒤 팝업이 한 번도 안 뜨고 배치가 끝난다(실측 확인).
            // ⚠️ **펴 놓은 카드판(S.autoBatch)도 같은 이유로 지켜야 한다** (autoforge-cards-at-once
            //    2026-08-20): 배치는 망치를 **먼저 다 쓰고** 카드를 펴므로, 카드가 떠 있는 동안은
            //    `hammers=0` 인데 통과분은 아직 큐로 안 갔다 — 이 줄이 그 창을 못 보면 카드판 한복판에서
            //    시퀀스를 죽여 **팝업이 한 번도 안 뜬다**(실측: 순서가 PPPCCCCCCCCCC 로 뒤집혔다).
            const batchUp = Array.isArray(S.autoBatch) && S.autoBatch.length;
            if (S.hammers < 1 && !(Array.isArray(S.autoMatchQueue) && S.autoMatchQueue.length) && !batchUp) { UI.stopAutoSeq(); return; }
            if (!UI._autoSeq) UI.startAutoSeq(); else UI.autoSeqStep();
            // 열려 있는 플레이어 정보/장비 세부정보 팝업도 함께 갱신 — 안 그러면 오토포지 중 스탯이 멈춰 보임
            if (!UI.els.playerInfoModal.classList.contains('hidden')) UI.renderPlayerInfo();
            if (!UI.els.gearDetailModal.classList.contains('hidden') && UI._gearDetailSlot) UI.renderGearDetail();
        }, 3000);

        // 자동 저장: 30초 + 탭 이탈 시
        setInterval(saveGame, 30000);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) saveGame();
        });
        window.addEventListener('beforeunload', saveGame);

        blSet(100);
        blDone();
    }

    document.addEventListener('DOMContentLoaded', () => {
        // 부팅이 어디서 죽더라도 로딩 오버레이는 반드시 치운다 — 안 치우면 z-200 오버레이가
        // UI.init 폴백이 그려 둔 초기화 버튼까지 가려 탈출 불가가 된다(QA 10차와 같은 급의 사고).
        boot().catch(e => { console.error('boot() 실패', e); }).finally(blDone);
    });
})();
