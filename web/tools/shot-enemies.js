// 적 7종 정지 샷 — Box3 자동 피팅 + Combat 틱 동결 (5차 인계 ⑴)
// 사용: node shot-enemies.js [kind...]  (기본: 7종 전부)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2)
    : ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html') + '';
const OUT = __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== "undefined" && Scene3D.scene && typeof Combat !== "undefined", null, { timeout: 60000 });
        await page.evaluate(([z, k]) => { window.__zoomFace = z; window.__zoomK = k; }, [process.env.ZOOM === 'face', +(process.env.ZOOM_K || 2.4)]);
        await page.evaluate((kind) => {
            // 전투 동결: 논리 틱 정지 + 걷기 정지
            Combat.tick = () => {};
            Scene3D.walking = false;
            Scene3D.heroG.visible = false;
            Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
            if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
            if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
            Scene3D.petGroups.forEach(p => p.visible = false);
            // 기존 적 제거 후 단일 적 스폰 (MELEE_X 정지 위치)
            Scene3D.clearEnemies();
            const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100 };
            Combat.enemies = [e];
            Scene3D.heroAttack = () => {}; // 동결 후 잔여 setTimeout발 공격 차단
            Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(999);
            // 진행 중 연출 전부 즉시 완료(onDone 실행 — 이펙트 메시 잔류 방지) + 낙하 스킵
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
            Scene3D.anims = [];
            m.g.position.y = 0; m.g.userData.landed = true;
            m.g.position.x = e.x + Scene3D.worldX;
            if (kind === 'wolf') m.g.rotation.y = -1.15; // 사족보행은 3/4 측면이 실루엣 판독에 유리
            m.g.updateMatrixWorld(true);
            // 적 주변 소품 숨김 — 배경 바위/나무가 겹쳐 '몸에 붙은 혹/흰 뿔'로 오독되던 문제 (비평가 6.4 9번의 실체:
            // 늑대 이마 '흰 뿔'은 카메라 시차로 머리에 겹친 배경 바위였음). 근·중경 전부 + 프레임 밖 그림자 원인까지 제거
            for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
                if (Math.abs(o.position.x - m.g.position.x) < 4.5 && o.position.z > -6) o.visible = false;
                o.traverse(mm => { if (mm.isMesh) mm.castShadow = false; }); // 프레임 밖 소품 그림자 침입 차단 (비평가 6.4 10번 '소용돌이 그림자')
            }
            // Box3 자동 피팅: HP바 제외하고 몸통만
            const hpG = m.g.children.find(c => c.children && c.children.some(cc => cc.geometry && cc.geometry.type === 'PlaneGeometry'));
            if (hpG) hpG.visible = false;
            const box = new THREE.Box3().setFromObject(m.g);
            const c = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const r = Math.max(size.x, size.y, size.z);
            const dist = r * 1.75 + 0.4;
            Scene3D.camLock = {
                pos: new THREE.Vector3(c.x - dist * 0.55, c.y + dist * 0.35, c.z + dist * 0.95),
                look: c.clone()
            };
            // ZOOM=face 면 이목구비 클로즈업 — 전신 샷의 눈은 몇 px 이라 파이컷 판독이 안 된다
            //   (`cute-art-direction` 적 눈 개편 확인용). 얼굴 = 몸통 상단 대역으로 잡는다.
            if (window.__zoomFace) {
                // 눈 자체(`userData.pieEye` 태그가 붙은 흰자)의 bbox 로 겨눈다 — 몸통 비율로 어림하면
                // 종마다 머리 높이가 달라 슬라임처럼 눈이 화면 밖으로 나간다(실제로 그랬다).
                const eb = new THREE.Box3(); let found = 0;
                m.g.traverse(o => { if (o.userData && o.userData.pieEye) { eb.expandByObject(o); found++; } });
                const look = found ? eb.getCenter(new THREE.Vector3()) : new THREE.Vector3(c.x, box.max.y - size.y * 0.15, c.z);
                const eyeSpan = found ? Math.max(eb.getSize(new THREE.Vector3()).x, 0.06) : size.x * 0.4;
                const d2 = eyeSpan * window.__zoomK + 0.14;   // 환경변수 ZOOM_K 로 배율 조절 (기본 2.4)
                Scene3D.camLock = { pos: look.clone().add(new THREE.Vector3(-d2 * 0.28, d2 * 0.16, d2 * 0.95)), look };
            }
        }, kind);
        // 애니메이션 한 사이클 대기 (idle 포즈 안정)
        await page.waitForTimeout(700);
        await page.evaluate(() => {
            for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
                document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
            if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden'; // 코인 토스트('+3')가 검증샷 오염 (비평가 7.1 8번 부수)
        });
        const rect = await page.evaluate(() => { // 캔버스 영역만 크롭 — 데드스페이스/탭바 제거
            const r = document.querySelector('canvas').getBoundingClientRect();
            return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
        });
        await page.screenshot({ path: `${OUT}/enemy-${kind}${process.env.ZOOM === 'face' ? '-face' : ''}.png`, clip: rect });
        console.log(`enemy-${kind}${process.env.ZOOM === 'face' ? '-face' : ''}.png` + (errors.length ? '  CONSOLE ERRORS: ' + errors.join(' | ') : '  (no console errors)'));
        await page.close();
    }
    await browser.close();
})();
