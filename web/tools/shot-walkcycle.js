// 걷기 사이클 관절 검증 샷 — 영웅·고블린(이족)·늑대(사족) 각 0.1초 간격 연속 8프레임 클로즈업
// 사용: node shot-walkcycle.js [출력디렉토리]  (기본: 이 디렉토리)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = process.argv[2] || __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&hage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== "undefined" && Scene3D.heroG && typeof Combat !== "undefined", null, { timeout: 15000 });

    await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.clearEnemies(); Combat.enemies = [];
        const hpG = Scene3D.heroHpG; if (hpG) hpG.visible = false;
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
    });

    // 대상 그룹에 카메라 락 (하체 중심 클로즈업: cy만큼 중심 내림)
    const fitObj = (expr, mult, yaw, cy) => page.evaluate(([expr, mult, yaw, cy]) => {
        const obj = eval(expr);
        obj.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obj);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z);
        const dist = r * mult + 0.3;
        c.y += cy;
        Scene3D.camLock = {
            pos: new THREE.Vector3(c.x + Math.sin(yaw) * dist, c.y + dist * 0.18, c.z + Math.cos(yaw) * dist),
            look: c.clone()
        };
    }, [expr, mult, yaw, cy]);

    // ── 1) 영웅: Walking 클립 위상을 0.1s 간격으로 직접 스텝 (전진 동결) ──
    await page.evaluate(() => { window.__wx = Scene3D.worldX; Scene3D.walking = true; });
    await page.waitForTimeout(300); // Walking 클립 전환 대기
    await page.evaluate(() => {
        Object.defineProperty(Scene3D, 'worldX', { get() { return window.__wx; }, set() {}, configurable: true });
        if (Scene3D.heroRig) Scene3D.heroRig._speed = 0;
    });
    for (let i = 0; i < 8; i++) {
        await page.evaluate(t => { if (Scene3D.heroRig) Scene3D.heroRig._t = t; }, i * 0.1);
        await fitObj('Scene3D.heroG', 0.95, 2.0, -0.12); // 측면 3/4 — 무릎·팔꿈치 각 판독
        await page.waitForTimeout(120);
        await page.screenshot({ path: `${OUT}/walk-hero-f${i}.png` });
    }
    await page.evaluate(() => {
        delete Scene3D.worldX; Scene3D.worldX = window.__wx;
        if (Scene3D.heroRig) Scene3D.heroRig._speed = 1;
        Scene3D.walking = false;
    });

    // ── 2) 적: 씬 클록을 0.1s 간격으로 직접 스텝 (고블린 이족 → 늑대 사족) ──
    await page.evaluate(() => {
        window.__clk = Scene3D._clock;
        Object.defineProperty(Scene3D, '_clock', { get() { return window.__clk; }, set() {}, configurable: true });
    });
    for (const [kind, name] of [['goblin', 'goblin'], ['wolf', 'wolf']]) {
        await page.evaluate(kind => {
            Scene3D.clearEnemies();
            // 종은 (id + 챕터*2) % 7로 결정되므로 원하는 종이 나오는 id를 역산 (700은 7의 배수 — 잔차 유지)
            const kinds = ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
            const id = ((kinds.indexOf(kind) - S.chapter * 2) % 7 + 7) % 7 + 700;
            window.__eid = id;
            const e = { id, x: Combat.MELEE_X + 3, alive: true, hp: 1e9, maxHp: 1e9 };
            Combat.enemies = [e]; Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(id);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
            Scene3D.anims = []; m.g.position.y = 0; m.g.userData.landed = true;
        }, kind);
        for (let i = 0; i < 8; i++) {
            await page.evaluate(t => { window.__clk = t; }, 10 + i * 0.1);
            await fitObj('Scene3D.enemyMap.get(window.__eid).g', 1.05, 1.05, -0.05); // 프로필(측면) — 적 요 -0.55 기준 +90°에서 무릎 각 판독
            await page.waitForTimeout(120);
            await page.screenshot({ path: `${OUT}/walk-${name}-f${i}.png` });
        }
    }

    console.log('walkcycle shots done' + (errors.length ? '  CONSOLE ERRORS: ' + errors.join(' | ') : '  (no console errors)'));
    await browser.close();
})();
