// 투구 3종(tech/visor/mask) 근접 검증
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html') + '';
(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    for (const [name, h] of [['tech', 0], ['visor', 1], ['mask', 2]]) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`${INDEX}?debug=gear&h=${h}&w=sword`, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 15000 });
        await page.evaluate(() => {
            Combat.tick = () => {}; Scene3D.walking = false;
            Scene3D.clearEnemies(); Combat.enemies = [];
            Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
            if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
            Scene3D._attacking = false; // 공격 대시 중이면 위치가 어긋남 — 정지 포즈로 리셋
            Scene3D.heroG.position.x = Combat.HERO_X + Scene3D.worldX;
        });
        await page.waitForTimeout(600); // 포즈 안정 후 카메라 피팅
        await page.evaluate(() => {
            Scene3D.heroG.updateMatrixWorld(true);
            const c = new THREE.Vector3();
            Scene3D.heroRig.headMount.getWorldPosition(c);
            const fwd = new THREE.Vector3();
            Scene3D.heroG.getWorldDirection(fwd); // 영웅 로컬 +z(정면)의 월드 방향
            const pos = c.clone().add(fwd.multiplyScalar(1.0));
            pos.y += 0.18;
            Scene3D.camLock = { pos, look: c.clone() };
        });
        await page.waitForTimeout(300);
        await page.evaluate(() => {
            for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
                document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        });
        await page.screenshot({ path: `${__dirname}/helm-${name}.png` });
        console.log(`helm-${name}.png` + (errors.length ? '  ERRORS: ' + errors.join(' | ') : '  (clean)'));
        await page.close();
    }
    await browser.close();
})();
