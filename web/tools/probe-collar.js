// 스탠딩 고젯 칼라 기여도 실측 — "목 기둥 부재: 요크와 투구가 2~3px 어두운 이음선으로 만난다"
// (비평가 잔여 지적 ⓔ) 를 고쳤는지 판정한다.
//
// ⚠️ 눈으로 "칼라가 보인다"고 판단하면 안 된다 — 투구·턱·카울이 겹치는 구간이라 새로 넣은 판금이
//    통째로 다른 파츠 뒤에 숨어도 스크린샷은 멀쩡해 보인다(tassetStrap 이 정확히 그렇게 죽어 있었다).
//    그래서 **칼라를 껐다 켠 두 프레임을 차분**해 실제로 화면에 기여한 픽셀만 센다.
//
// 지표 ① 기여 픽셀 수(0 이면 완전 매몰 = 죽은 지오메트리) ② 기여 영역의 세로 범위(px)
//      = 요크 윗선과 투구 밑선 사이에 실제로 생긴 '기둥'의 높이. 지적이 말한 2~3px 이음선을
//        넘어섰는지 이 값으로 본다.
//
// 사용: node probe-collar.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    const out = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); if (typeof Combat !== 'undefined') Combat.enemies = [];
        ProChar.update = () => {};                       // 포즈 고정 — 안 하면 같은 코드로 값이 흔들린다
        const R = Scene3D.heroRig;
        R._t = 0; R._idleT = 0;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;

        // 칼라 3파츠를 이름 대신 **기하 특징**으로 찾는다 — spine 직속 자식 중 y 0.43~0.55 에 걸치는 것.
        // (LatheGeometry 2개 + Torus 1개를 spine.add(collar, collarIn, collarRim) 했다.)
        const spine = R.bones.spine;
        const collar = spine.children.filter(o => o.isMesh && o.position.y === 0.547
            || (o.isMesh && o.geometry && o.geometry.type === 'LatheGeometry' && o.geometry.boundingBox === null
                && (o.geometry.computeBoundingBox(), o.geometry.boundingBox.max.y > 0.52 && o.geometry.boundingBox.min.y > 0.40)));
        if (!collar.length) return { error: '칼라 파츠를 못 찾음 — 판정 불가' };

        // 정면 카메라, 어깨~머리 근접
        const nk = R.bones.neck, c = new THREE.Vector3();
        nk.getWorldPosition(c);
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = 1.6;
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)), look: c.clone() };
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(Scene3D.camLock.look);

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        const on = grab();
        for (const o of collar) o.visible = false;
        const off = grab();
        for (const o of collar) o.visible = true;

        let n = 0, yMin = 1e9, yMax = -1, xMin = 1e9, xMax = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
            if (d > 12) { n++; if (y < yMin) yMin = y; if (y > yMax) yMax = y; if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
        }
        return { px: { w, h }, parts: collar.length, contribPx: n, spanY: yMax < 0 ? 0 : yMax - yMin + 1, spanX: xMax < 0 ? 0 : xMax - xMin + 1 };
    });

    if (out.error) { console.log('ERROR: ' + out.error); await browser.close(); process.exit(1); }
    console.log('canvas', JSON.stringify(out.px), '· 칼라 파츠', out.parts + '개');
    console.log('기여 픽셀   :', out.contribPx + 'px', out.contribPx === 0 ? '❌ 완전 매몰(죽은 지오메트리)' : '✅ 화면에 보임');
    console.log('기둥 세로높이:', out.spanY + 'px', '(지적한 이음선 2~3px 대비)');
    console.log('기둥 가로폭 :', out.spanX + 'px');
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
