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
        await page.waitForFunction(() => typeof Scene3D !== "undefined" && Scene3D.scene && typeof Combat !== "undefined", null, { timeout: 15000 });
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
        }, kind);
        // 애니메이션 한 사이클 대기 (idle 포즈 안정)
        await page.waitForTimeout(700);
        await page.evaluate(() => {
            for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
                document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        });
        const rect = await page.evaluate(() => { // 캔버스 영역만 크롭 — 데드스페이스/탭바 제거
            const r = document.querySelector('canvas').getBoundingClientRect();
            return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
        });
        await page.screenshot({ path: `${OUT}/enemy-${kind}.png`, clip: rect });
        console.log(`enemy-${kind}.png` + (errors.length ? '  CONSOLE ERRORS: ' + errors.join(' | ') : '  (no console errors)'));
        await page.close();
    }
    await browser.close();
})();
