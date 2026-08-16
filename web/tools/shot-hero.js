// 영웅 근접 샷 — camLock + Box3 피팅, Idle/걷기/공격 중간 프레임
// 사용: node shot-hero.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html') + '';
const OUT = __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?debug=gear', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== "undefined" && Scene3D.heroG && typeof Combat !== "undefined", null, { timeout: 15000 });

    const fit = async (mult, yaw) => page.evaluate(([mult, yaw]) => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D.heroG.updateMatrixWorld(true);
        const hpG = Scene3D.heroHpG; if (hpG) hpG.visible = false;
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z);
        const dist = r * mult + 0.3;
        Scene3D.camLock = {
            pos: new THREE.Vector3(c.x + Math.sin(yaw) * dist, c.y + dist * 0.3, c.z + Math.cos(yaw) * dist),
            look: c.clone()
        };
    }, [mult, yaw]);

    const hideUI = () => page.evaluate(() => {
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
    });

    // 1) Idle 정면/측면 근접
    await fit(1.15, 0.45); await page.waitForTimeout(600); await hideUI();
    await page.screenshot({ path: OUT + '/hero-idle-front.png' });
    await fit(1.15, 1.4); await page.waitForTimeout(300);
    await page.screenshot({ path: OUT + '/hero-idle-side.png' });

    // 2) 걷기 중간 프레임 — 전진 동결 + 클립 위상 고정(스트라이드 극점) — 걷는 동안 영웅이 락 카메라 밖으로 나가던 문제
    await page.evaluate(() => { window.__wx = Scene3D.worldX; Scene3D.walking = true; });
    await page.waitForTimeout(250); // Walking 클립 전환 대기
    await page.evaluate(() => {
        Object.defineProperty(Scene3D, 'worldX', { get() { return window.__wx; }, set() {}, configurable: true });
        if (Scene3D.heroRig) { Scene3D.heroRig._speed = 0; Scene3D.heroRig._t = 0; } // t=0 = 발 교차 최대 극점
    });
    await fit(1.3, 2.1); // 3/4 측면 — 걷기 중 영웅이 +x(진행 방향)를 보므로 yaw를 크게 (팔꿈치·무릎 위상 판독용)
    await page.waitForTimeout(150);
    await page.screenshot({ path: OUT + '/hero-walk.png' });
    await page.evaluate(() => {
        delete Scene3D.worldX; Scene3D.worldX = window.__wx;
        if (Scene3D.heroRig) Scene3D.heroRig._speed = 1;
        Scene3D.walking = false;
    });

    // 3) 공격 스윙 중간 프레임 (트레일 포함)
    await page.evaluate(() => {
        const e = { id: 999, x: Combat.MELEE_X, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e]; Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = []; m.g.position.y = 0; m.g.userData.landed = true;
    });
    await fit(1.6, 0.45);
    await page.evaluate(() => Scene3D.heroAttack(999));
    await page.waitForTimeout(220);
    await page.screenshot({ path: OUT + '/hero-attack-mid.png' });
    await page.waitForTimeout(900);

    // 4) 전신 룩 (조금 멀리)
    await fit(1.5, 0.6); await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '/hero-full.png' });

    console.log('hero shots done' + (errors.length ? '  CONSOLE ERRORS: ' + errors.join(' | ') : '  (no console errors)'));
    await browser.close();
})();
