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
        document.documentElement.style.fontSize = Math.max(12, h / 844 * 16) + 'px';
        if (Scene3D.renderer) Scene3D.resize();
    }

    function boot() {
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

        UI.init();
        // 브라우저 자동재생 정책: 최초 사용자 입력 시 AudioContext 활성화
        document.addEventListener('pointerdown', () => { SFX.resume(); SFX.startMusic(); }, { once: true });
        Scene3D.init(
            document.getElementById('game3d'),
            document.getElementById('fx-layer'),
            document.getElementById('game-area')
        );
        fitLayout();
        window.addEventListener('resize', fitLayout);

        Combat.start();
        League.ensure(); // 전투력 계산이 끝난 뒤 봇 생성 (combatPower 참조)
        UI.renderTopBar(); // UI.init()에서 먼저 그린 상단바(전투력 0)를 실제 계산치로 갱신
        UI.updateStageLabel();

        if (offlinePending && offlinePending.elapsed >= 60) UI.showOffline(offlinePending); // 1분 미만 경과는 팝업 생략

        // 디버그: ?tab=summon|pets|skills|menu|debug 등으로 패널 바로 열기, ?debug=craft로 제작 모달 확인
        const params = new URLSearchParams(location.search);
        // 디버그 탭은 ?debug=* 또는 ?tab=debug일 때만 노출 — 기본 5탭이 원본 레이아웃(042120)
        if (!params.get('debug') && params.get('tab') !== 'debug') {
            const dbgBtn = document.querySelector('#tabbar button[data-tab="debug"]');
            if (dbgBtn) dbgBtn.style.display = 'none';
        }
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
        let renderLast = performance.now();
        function frame(t) {
            const dt = Math.min(0.1, (t - renderLast) / 1000);
            renderLast = t;
            Scene3D.update(dt);
            requestAnimationFrame(frame);
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

        // 오토 포지: 3초마다 1회 사이클(설정된 망치 수만큼 제작) 후 자동 처리
        // 탭이 백그라운드일 때도 건너뜀 — 로직 틱과 동일하게 해머 소비·장비 교체가 오프라인 보상과 별도로 시뮬레이션되는 것을 막음
        setInterval(() => {
            if (document.hidden) return;
            if (S.autoForgeOn && isUnlocked('autoForge') && S.hammers >= 1) {
                const cfg = Forge.autoForgeConfig();
                const items = Forge.craft(Math.min(cfg.hammersPerBatch, S.hammers));
                let foundTarget = false;
                for (const item of items) {
                    // 장착 중인 장비와 정확히 일치(승천 대상)하는 아이템은 유지 시대/옵션 필터와 무관하게 항상 승천 판정으로 보냄 — 필터 때문에 무료 승천 재료가 팔려나가는 것 방지
                    const isAscendTarget = Forge.isMatchingGear(item, S.equipment[item.slot]);
                    if (!isAscendTarget && !Forge.passesAutoFilter(item)) { Forge.sell(item); continue; }
                    const r = Forge.autoResolve(item);
                    if (r.equipped) { UI.floatLoot(`🛠 ${item.name} 자동 장착!`); foundTarget = true; }
                }
                // 목표 발견 시 계속하기 미체크면 이번 배치를 전부 처리한 뒤에 정지 (남은 아이템 유실 방지)
                if (foundTarget && !cfg.continueOnTarget) S.autoForgeOn = false;
                UI.renderEquipSheet();
                // 열려 있는 플레이어 정보/장비 세부정보 팝업도 함께 갱신 — 안 그러면 오토포지 중 스탯이 멈춰 보임
                if (!UI.els.playerInfoModal.classList.contains('hidden')) UI.renderPlayerInfo();
                if (!UI.els.gearDetailModal.classList.contains('hidden') && UI._gearDetailSlot) UI.openGearDetail(UI._gearDetailSlot);
            }
        }, 3000);

        // 자동 저장: 30초 + 탭 이탈 시
        setInterval(saveGame, 30000);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) saveGame();
        });
        window.addEventListener('beforeunload', saveGame);
    }

    document.addEventListener('DOMContentLoaded', boot);
})();
