// 얼굴 클로즈업 샷 — `cute-art-direction`(1930s 러버호스 카툰) 이목구비 판독용.
//   `shot-bald.js` 의 궤도 카메라·UI 숨김·스프라이트 소거 규약을 그대로 따르되, 바운딩 박스를
//   **머리(headG)** 로 잡아 이목구비가 화면을 채우게 한다 — 전신 샷으로는 눈 몇 픽셀이라 판독이 안 된다.
//   투구는 벗긴다(풀커버 투구는 faceMesh 를 통째로 숨기는 규약이라 얼굴이 안 보인다).
// 사용: node shot-face.js
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

    await page.evaluate(() => {
        if (Scene3D.setHeroGear) Scene3D.setHeroGear({});
        if (Scene3D.setHeroWeapon) Scene3D.setHeroWeapon(null);
        if (Scene3D.helmetG) Scene3D.helmetG.visible = false;
        if (Scene3D.weaponG) Scene3D.weaponG.visible = false;
        const R = Scene3D.heroRig;
        if (R && R.shield) R.shield.visible = false;
    });

    // 머리 기준 프레이밍. orbit = 좌우 회전(rad), hOff = 카메라 높이 배수.
    const fit = async (mult, orbit, hOff = 0.08) => page.evaluate(([mult, orbit, hOff]) => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        // 밀린 연출 백로그를 먼저 배수한다 (TODO 함정 ③ — 헤드리스에선 rAF 가 안 돌아 수십 개가 쌓인다)
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D.heroG.updateMatrixWorld(true);
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        const R = Scene3D.heroRig;
        const head = (R && R.bones && R.bones.head) || Scene3D.heroG;   // 리그 본 이름은 `R.bones.head` (prochar.js:1204)
        const box = new THREE.Box3().setFromObject(head);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z);
        const dist = r * mult + 0.12;
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

    await fit(1.5, 0.0); await page.waitForTimeout(600); await hideUI();
    await shot('face-front.png');
    // 얼굴이 보이는 투구 스타일별 정면 — 챙이 눈을 덮는지 눈으로 확인한다
    //   (수치 게이트는 `probe-face-helmet-clear.js`, 여기는 그 수치를 눈으로 교차검증하는 자리다).
    for (const style of (process.env.FACE_HELMETS || '').split(',').filter(Boolean)) {
        await page.evaluate((style) => {
            const slot = Scene3D.helmetG;
            while (slot.children.length) slot.remove(slot.children[0]);
            slot.add(Scene3D.makeHelmet(0, 'common', style, style));
            slot.visible = true;
            Scene3D.heroG.updateMatrixWorld(true);
        }, style);
        await page.waitForTimeout(200);
        await shot('face-helm-' + style + '.png');
    }
    await page.evaluate(() => { Scene3D.helmetG.visible = false; });
    await fit(1.5, 0.6); await page.waitForTimeout(300);
    await shot('face-3q.png');
    await fit(1.5, 1.25); await page.waitForTimeout(300);
    await shot('face-side.png');

    console.log(errors.length ? ('콘솔 에러 ' + errors.length + '건: ' + errors.slice(0, 3).join(' | ')) : '(no console errors)');
    await browser.close();
})();
