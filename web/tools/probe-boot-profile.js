// 부츠 측면 실루엣 실측 — 비평가 지적 "밑창 슬래브 없음 / 뒤꿈치 블록 없음 / 발목 잘록함 없음"
// (부츠를 타원체에서 4파츠로 갈아엎은 커밋 직후에 나온 지적이라 **교차검증이 필수**다.
//  TODO 상단 '비평가 채점 함정' 규칙: 오측정을 좇아 멀쩡한 값을 건드리면 오히려 원본에서 멀어진다.)
//
// 세 가지를 수치로 가른다:
//  ① 발목 잘록함  = 실루엣 폭의 국소 최소가 정강이~발 사이에 실제로 있는가 (있으면 몇 % 조이는가)
//  ② 접지선 평탄도 = 바닥 윤곽에서 최저점 ±1px 안에 드는 가로 길이 ÷ 발 길이
//                    (슬래브면 크게, 둥근 콩이면 0에 가깝다 — 지적의 핵심은 사실 이것이다)
//  ③ 뒤꿈치 수직면 = 발 뒤쪽 윤곽이 수직에 가까운 구간의 세로 길이
//
// ⚠️ 지형·안개·그림자를 끄고 평면 배경에 다리 하나만 렌더한다 — 부츠는 니어블랙이라
//    제 그림자 안에서는 배경과 분리되지 않아 윤곽 스캔이 통째로 틀린다.
// ⚠️ 포즈를 고정한다(ProChar.update 차단) — 걷기 위상에 따라 발 각도가 달라진다.
//
// 사용: node probe-boot-profile.js
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
        ProChar.update = () => {};
        const R = Scene3D.heroRig;
        R._t = 0; R._idleT = 0;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;

        // 다리 하나만 남긴다 — 반대쪽 다리가 뒤에 겹치면 윤곽이 두 발의 합집합이 된다
        const hidden = [];
        const hide = o => { if (o && o.visible) { o.visible = false; hidden.push(o); } };
        if (R.arms) for (const a of R.arms) hide(a.shoulder);
        hide(R.bones && R.bones.cape);
        hide(R.shield); hide(Scene3D.weaponG);
        hide(R.bones && R.bones.neck);
        hide(R.bones && R.bones.spine);
        if (R.legs && R.legs[1]) hide(R.legs[1].hip);
        Scene3D.heroG.updateMatrixWorld(true);

        const leg = R.legs[0].knee;
        const box = new THREE.Box3().setFromObject(leg);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        // 정측면(yaw 90°) — 발가락·굽은 측면에서만 판독된다
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.set(-fwd.z, 0, fwd.x).normalize();
        const dist = Math.max(size.x, size.y, size.z) * 1.6 + 0.25;
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)), look: c.clone() }; // 수평 시선 — 원근으로 바닥이 기울지 않게
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(Scene3D.camLock.look);

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        for (const ch of Scene3D.scene.children) if (ch !== Scene3D.heroG && !ch.isLight) hide(ch);
        const savedFog = Scene3D.scene.fog; Scene3D.scene.fog = null;
        const savedShadow = Rr.shadowMap.enabled; Rr.shadowMap.enabled = false;
        const savedClear = new THREE.Color(); Rr.getClearColor(savedClear);
        Rr.setClearColor(0xff00ff);
        Rr.render(Scene3D.scene, Scene3D.camera);
        const fg = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, fg);
        Rr.setClearColor(savedClear); Scene3D.scene.fog = savedFog; Rr.shadowMap.enabled = savedShadow;
        for (const o of hidden) o.visible = true;

        // readPixels: row 0 = 화면 최하단
        const isFg = (x, y) => { const i = (y * w + x) * 4; return !(fg[i] > 200 && fg[i + 1] < 60 && fg[i + 2] > 200); };
        const lo = new Array(h).fill(-1), hi = new Array(h).fill(-1);
        let yMin = 1e9, yMax = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isFg(x, y)) {
            if (lo[y] < 0) lo[y] = x; hi[y] = x;
            if (y < yMin) yMin = y; if (y > yMax) yMax = y;
        }
        if (yMax < 0) return { error: 'mask empty' };
        const span = y => (lo[y] < 0 ? 0 : hi[y] - lo[y] + 1);

        // ② 접지선 평탄도 — 바닥에서 위로 1px(=최저 행 ±1) 안에 드는 가로 길이
        const groundRows = [yMin, yMin + 1];
        let gx0 = 1e9, gx1 = -1;
        for (const y of groundRows) { if (lo[y] >= 0) { gx0 = Math.min(gx0, lo[y]); gx1 = Math.max(gx1, hi[y]); } }
        const contactLen = gx1 < 0 ? 0 : gx1 - gx0 + 1;
        // 발 길이 = 발 구간(바닥에서 위로 발높이만큼) 중 최대 가로폭
        let footLen = 0, footLenRow = -1;
        const footTop = Math.min(h - 1, yMin + Math.round((yMax - yMin) * 0.22)); // 아래 22% = 발
        for (let y = yMin; y <= footTop; y++) if (span(y) > footLen) { footLen = span(y); footLenRow = y; }

        // ① 발목 잘록함 — 발 위(22%~45% 구간)에서 폭의 국소 최소
        const aLo = footTop, aHi = Math.min(h - 1, yMin + Math.round((yMax - yMin) * 0.45));
        let ankleW = 1e9, ankleRow = -1;
        for (let y = aLo; y <= aHi; y++) { const s = span(y); if (s > 0 && s < ankleW) { ankleW = s; ankleRow = y; } }
        // 발목 위(정강이) 폭 — 조임 비율의 분모
        let shinW = 0;
        for (let y = aHi; y <= Math.min(h - 1, yMin + Math.round((yMax - yMin) * 0.62)); y++) shinW = Math.max(shinW, span(y));

        // ③ 뒤꿈치 수직면 — 발 뒤쪽 윤곽(lo 또는 hi 중 뒤쪽)이 세로로 곧은 구간
        // 발끝 방향 판정: 접지 행에서 무게중심이 어느 쪽으로 치우쳤는지로 앞/뒤를 가른다
        let sum = 0, n = 0;
        for (let y = yMin; y <= footTop; y++) if (lo[y] >= 0) { sum += (lo[y] + hi[y]) / 2; n++; }
        const footMid = n ? sum / n : 0;
        let shinMid = 0, sn = 0;
        for (let y = aHi; y <= Math.min(h - 1, yMin + Math.round((yMax - yMin) * 0.62)); y++) if (lo[y] >= 0) { shinMid += (lo[y] + hi[y]) / 2; sn++; }
        shinMid = sn ? shinMid / sn : footMid;
        const toeRight = footMid > shinMid;              // 발끝이 오른쪽이면 뒤꿈치는 왼쪽(lo)
        const backEdge = y => (toeRight ? lo[y] : hi[y]);
        let vRun = 0, vBest = 0;
        for (let y = yMin; y <= footTop; y++) {
            if (lo[y] < 0 || lo[y + 1] < 0) { vRun = 0; continue; }
            if (Math.abs(backEdge(y) - backEdge(y + 1)) <= 1) { vRun++; if (vRun > vBest) vBest = vRun; } else vRun = 0;
        }

        return {
            px: { w, h }, legRows: { yMin, yMax },
            footLen, footLenRow, contactLen,
            flatness: footLen ? +(contactLen / footLen).toFixed(3) : null,
            ankleW, ankleRow, shinW,
            ankleCinch: shinW ? +(1 - ankleW / shinW).toFixed(3) : null,
            heelVerticalPx: vBest, toeSide: toeRight ? 'right' : 'left',
        };
    });

    if (out.error) { console.log('ERROR: ' + out.error); await browser.close(); process.exit(1); }
    console.log('canvas', JSON.stringify(out.px), '· 다리 행범위', JSON.stringify(out.legRows), '· 발끝 방향', out.toeSide);
    console.log('① 발목 조임   :', `발목 ${out.ankleW}px / 정강이 ${out.shinW}px → ${(out.ankleCinch * 100).toFixed(1)}% 조임`,
        out.ankleCinch >= 0.12 ? '✅ 잘록함 있음' : '❌ 잘록함 없음(둥근 포드)');
    console.log('② 접지선 평탄도:', `${out.contactLen}px / 발길이 ${out.footLen}px = ${out.flatness}`,
        out.flatness >= 0.35 ? '✅ 슬래브로 읽힘' : '❌ 둥근 바닥(접지가 선이 아니라 점)');
    console.log('③ 뒤꿈치 수직면:', out.heelVerticalPx + 'px',
        out.heelVerticalPx >= 6 ? '✅ 수직 뒷면 있음' : '❌ 뒤가 둥글게 말림');
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
