// 견갑·고젯 칼라 근접 샷 — "견갑이 문자 그대로 구 2개"(비평가 잔여 지적 ⓔ) 판독 전용.
// 전신샷(shot-hero.js)에서는 견갑이 40px 남짓이라 라메 밴드 경계·칼라 높이가 육안으로 안 잡힌다.
// 사용: node shot-shoulder.js
//
// ⚠️ shot-hero.js 의 공격 컷(슬로모 90초 대기)은 이 컨테이너에서 상시 타임아웃이라 여기선 아예 안 찍는다
//    — 이 스크립트는 정지 포즈 3각(정면/45°/측면) 근접만 찍고 끝낸다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 60000 });

    await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        ProChar.update = () => {};                 // 포즈 고정 — 팔이 흔들리면 견갑 각도가 컷마다 달라진다
        const R = Scene3D.heroRig; R._t = 0; R._idleT = 0;
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
    });

    // 어깨 높이를 화면 중앙에 두고 바짝 붙는다 — 기준점은 어깨 그룹의 월드 좌표(바운딩 박스 중심이 아니라)
    const aim = (orbit) => page.evaluate((orbit) => {
        const R = Scene3D.heroRig;
        // 조준점 = 목(고젯 칼라) — 좌우 견갑이 대칭으로 프레임에 들어오고 칼라 높이도 같이 판독된다.
        // 한쪽 어깨를 조준하면 반대쪽이 프레임 밖으로 나가고, 오른팔은 검이 견갑을 가린다.
        const nk = R.bones && R.bones.neck;
        const c = new THREE.Vector3();
        if (nk && nk.getWorldPosition) nk.getWorldPosition(c);
        else new THREE.Box3().setFromObject(Scene3D.heroG).getCenter(c);
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
        const dist = 2.1;                           // 어깨~머리만 프레임에 담기는 거리(1.15는 카메라가 몸 속으로 들어간다)
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.12, 0)), look: c.clone() };
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(Scene3D.camLock.look);
    }, orbit);

    for (const [name, orbit] of [['front', 0], ['q45', -Math.PI / 4], ['side', -Math.PI / 2]]) { // 음수 = 방패쪽(왼팔) — 검이 견갑을 가리지 않는 각
        await aim(orbit);
        await page.waitForTimeout(500);
        const box = await page.evaluate(() => { const r = Scene3D.renderer.domElement.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        await page.screenshot({ path: OUT + '/shoulder-' + name + '.png', clip: box });
        console.log('shoulder-' + name + '.png');
    }
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
