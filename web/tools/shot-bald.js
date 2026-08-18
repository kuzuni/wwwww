// 무장착(대머리 치비) 기본형 정면/측면 샷 — `hero-chibi` 기본형 규약 확인용.
//   사용자 규약: "아무것도 장착 안 했을 때 대머리 치비 캐릭터가 기본형". 투구가 없으면 커진
//   머리가 고젯 칼라·목과 직접 만나므로, 장비 착용 샷(shot-hero.js)만으로는 판독이 안 된다.
//   `shot-hero.js` 의 궤도 카메라·UI 숨김·스프라이트 소거 규약을 그대로 따른다.
// 사용: node shot-bald.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });

    // 장비 전부 해제 — 투구·갑옷·무기·방패를 비워 기본형(대머리 치비)으로 만든다.
    await page.evaluate(() => {
        if (Scene3D.setHeroGear) Scene3D.setHeroGear({});
        if (Scene3D.setHeroWeapon) Scene3D.setHeroWeapon(null);
        if (Scene3D.helmetG) Scene3D.helmetG.visible = false;
        if (Scene3D.weaponG) Scene3D.weaponG.visible = false;
        const R = Scene3D.heroRig;
        if (R && R.shield) R.shield.visible = false;
    });

    const fit = async (mult, orbit, hOff = 0.3) => page.evaluate(([mult, orbit, hOff]) => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D.heroG.updateMatrixWorld(true);
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z);
        const dist = r * mult + 0.3;
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
        Scene3D.camLock = {
            pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * hOff, 0)),
            look: c.clone(),
        };
    }, [mult, orbit, hOff]);

    const hideUI = () => page.evaluate(() => {
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
    });

    const shot = async (file) => {
        await page.evaluate(() => {
            const loose = [];
            Scene3D.scene.traverse(o => { if (o.isSprite) loose.push(o); });
            for (const s of loose) if (s !== Scene3D.sunDisc && s !== Scene3D.moonDisc && !(Scene3D.clouds || []).includes(s)) s.visible = false;
        });
        const rect = await page.evaluate(() => {
            const r = document.querySelector('canvas').getBoundingClientRect();
            return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
        });
        await page.screenshot({ path: OUT + '/' + file, clip: rect });
        console.log('saved ' + file);
    };

    await fit(1.15, 0.35); await page.waitForTimeout(600); await hideUI();
    await shot('bald-front.png');
    await fit(1.15, -0.9); await page.waitForTimeout(300);
    await shot('bald-side.png');

    console.log(errors.length ? ('콘솔 에러 ' + errors.length + '건: ' + errors.slice(0, 3).join(' | ')) : '(no console errors)');
    await browser.close();
})();
