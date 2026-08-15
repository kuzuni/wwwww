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
        Ascension.ensure();
        const offline = applyOffline();

        UI.init();
        // 브라우저 자동재생 정책: 최초 사용자 입력 시 AudioContext 활성화
        document.addEventListener('pointerdown', () => SFX.resume(), { once: true });
        Scene3D.init(
            document.getElementById('game3d'),
            document.getElementById('fx-layer'),
            document.getElementById('game-area')
        );
        fitLayout();
        window.addEventListener('resize', fitLayout);

        Combat.start();
        UI.updateHeroHp();
        UI.updateStageLabel();

        if (offline) UI.showOffline(offline);

        // 디버그: ?tab=forge 등으로 패널 바로 열기, ?debug=craft로 제작 모달 확인
        const params = new URLSearchParams(location.search);
        const dbgTab = params.get('tab');
        if (dbgTab) UI.switchTab(dbgTab);
        if (params.get('debug') === 'craft') { S.hammers += 10; UI.onCraft(1); }
        if (params.get('debug') === 'pets') {
            // 펫 모델 검증: 지정 3마리 출전 (등급은 실제 데이터에서 역조회)
            const findRarity = n => RARITIES.find(r => petStats[r].some(d => d.name === n)) || 'common';
            const names = (params.get('names') || 'Scorpion,Turtle,Baby Dragon').split(',');
            S.pets = names.map(n => {
                const rarity = findRarity(n.trim());
                return { name: n.trim(), rarity, level: 1, dupes: 0, subs: Pets.rollSubs(rarity) };
            });
            S.activePets = [0, 1, 2].slice(0, S.pets.length);
            Scene3D.refreshPets();
            Combat.recalcHero();
        }
        if (params.get('debug') === 'gear') {
            // 외형 검증: ?debug=gear&h=2&a=2 (이름 인덱스 지정 가능)
            const hi = parseInt(params.get('h') || '0'), ai = parseInt(params.get('a') || '0');
            const hAge = params.get('hage') || 'quantum', aAge = params.get('aage') || 'underworld';
            const mk = (slot, age, wtype, nameIdx) => ({ name: 'test', slot, age, ageIdx: AGES.indexOf(age), rarity: 'legendary', level: 50, main: SLOT_MAIN[slot], value: 1000, subs: [], wtype, nameIdx });
            Forge.equip(mk('weapon', 'divine', params.get('w') || 'staff'));
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
            // 승천 검증: ?debug=ascend → 요구 레벨 충족 후 모달
            S.forgeLevel = Math.max(S.forgeLevel, Ascension.MIN_FORGE_LEVEL);
            UI.openAscension();
        }

        // 로직: 고정 100ms 틱 (탭 복귀 시 밀린 틱 따라잡기, 최대 5초분)
        let logicLast = performance.now();
        setInterval(() => {
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
            Pets.tick();
            Dungeons.ensure(); // 자정 열쇠 리셋 감지
            UI.tickSecond();
            UI.updateHeroHp();
        }, 1000);

        // 오토 포지: 3초마다 1회 제작 후 자동 처리
        setInterval(() => {
            if (S.autoForgeOn && isUnlocked('autoForge') && S.hammers >= 1) {
                const item = Forge.craft(1)[0];
                const r = Forge.autoResolve(item);
                if (r.equipped) UI.floatLoot(`🛠 ${item.name} 자동 장착!`);
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
