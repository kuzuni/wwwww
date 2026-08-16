// 무기 그립 검증 샷 — 무기 10종 × (Idle 근접 + 공격 중간 프레임) + 원거리 걷기 자세
// 사용: node shot-grip.js [출력디렉토리]  (기본: 이 디렉토리)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = process.argv[2] || __dirname;
const WEAPONS = ['sword', 'axe', 'spear', 'hammer', 'dagger', 'bow', 'crossbow', 'gun', 'staff', 'thrown'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&hage=medieval', { waitUntil: 'load' }); // 개방형 투구 — 자세 판독용
    await page.waitForFunction(() => typeof Scene3D !== "undefined" && Scene3D.heroG && typeof Combat !== "undefined", null, { timeout: 15000 });

    await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        const hpG = Scene3D.heroHpG; if (hpG) hpG.visible = false;
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
    });

    const equip = w => page.evaluate(w => {
        const mk = { name: 'test', slot: 'weapon', age: 'divine', ageIdx: AGES.indexOf('divine'), rarity: 'legendary', level: 50, main: SLOT_MAIN.weapon, value: 1000, subs: [], wtype: w };
        Forge.equip(mk);
    }, w);

    const fit = (mult, yaw) => page.evaluate(([mult, yaw]) => {
        Scene3D.heroG.updateMatrixWorld(true);
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

    for (const w of WEAPONS) {
        await equip(w);
        // Idle 근접 — 전방 3/4 (무기·손 관계 판독) — 이전 공격용 적 제거 후
        await page.evaluate(() => { Scene3D.clearEnemies(); Combat.enemies = []; });
        await fit(1.2, 0.5); await page.waitForTimeout(450);
        await page.screenshot({ path: `${OUT}/grip-${w}-idle.png` });

        // 공격 중간 프레임 — 임팩트 직전 스윙/조준 판독
        await page.evaluate(() => {
            const e = { id: 999, x: Combat.MELEE_X, alive: true, hp: 1e9, maxHp: 1e9 };
            Combat.enemies = [e];
            if (!Scene3D.enemyMap.get(999)) Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(999);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
            Scene3D.anims = []; m.g.position.y = 0; m.g.userData.landed = true;
        });
        await fit(1.55, 0.5);
        const impact = await page.evaluate(() => (WEAPON_TYPES[Scene3D.wtypeId].impact * 1000 / 1.8) | 0);
        await page.evaluate(() => Scene3D.heroAttack(999));
        await page.waitForTimeout(Math.max(90, impact - 20));
        await page.screenshot({ path: `${OUT}/grip-${w}-atk.png` });
        await page.waitForTimeout(1000); // 공격 종료·파지 복원 대기
    }

    // 원거리 걷기 자세 (활·총) — 걷는 중 조준 유지 확인
    for (const w of ['bow', 'gun']) {
        await equip(w);
        await page.evaluate(() => { window.__wx = Scene3D.worldX; Scene3D.walking = true; });
        await page.waitForTimeout(250);
        await page.evaluate(() => {
            Object.defineProperty(Scene3D, 'worldX', { get() { return window.__wx; }, set() {}, configurable: true });
            if (Scene3D.heroRig) { Scene3D.heroRig._speed = 0; Scene3D.heroRig._t = 0; }
        });
        await fit(1.35, 2.0); await page.waitForTimeout(150);
        await page.screenshot({ path: `${OUT}/grip-${w}-walk.png` });
        await page.evaluate(() => {
            delete Scene3D.worldX; Scene3D.worldX = window.__wx;
            if (Scene3D.heroRig) Scene3D.heroRig._speed = 1;
            Scene3D.walking = false;
        });
    }

    console.log('grip shots done' + (errors.length ? '  CONSOLE ERRORS: ' + errors.join(' | ') : '  (no console errors)'));
    await browser.close();
})();
