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

        // ── ②의 **월드 좌표 실측** (2026-08-19 신설, slug `boot-profile-threshold`) ─────────────
        // 🚨 화소 판정만으로는 ②를 잴 수 없다 — 임계가 낡은 게 아니라 **자가 원리적으로 틀렸다.**
        //    아래 화소 스캔의 카메라는 시선축만 수평일 뿐 **다리 bbox 중심 높이**에 있다. 밑창은 그보다
        //    0.35 쯤 아래에 있으므로, 수평 시선이어도 원근 때문에 **평평한 원판의 가까운 테두리가 가장
        //    낮게** 맺힌다. 그래서 '최저행 ±1px' 창은 밑창의 길이가 아니라 **그 근접 테두리 호**를 잰다 —
        //    실측 윤곽(최저행부터 위로): 31px → 58 → 126 → 143 … 17행 위에서야 169px(발길이). 밑창이
        //    완벽히 평평해도 이 모양이 나오므로 화소 ②는 임계를 어떻게 잡아도 참을 못 말한다.
        //    (형상 자체는 평평한 게 확실하다 — `prochar.js` 의 sole·heel 은 둘 다 축이 수직인
        //     CylinderGeometry 라 밑면이 수평면이고, 바닥이 −0.3676/−0.3675 로 같은 높이다.)
        // → 투영을 안 거치는 자로 바꾼다: 발 밑에서 **위로 레이캐스트**해 그 자리의 밑면 높이를 읽고,
        //    최저 높이에서 eps 안에 드는 구간의 길이 ÷ 밑면이 존재하는 구간의 길이.
        //    eps 는 발길이의 1%(화소 자의 ±1px/169px ≈ 0.6% 에 테셀레이션 여유를 더한 값).
        const ground = (() => {
            const fwd0 = new THREE.Vector3();
            Scene3D.heroG.getWorldDirection(fwd0);          // 발의 긴 축 = 영웅 정면
            fwd0.y = 0; fwd0.normalize();
            const c0 = box.getCenter(new THREE.Vector3());
            const L = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 1.6;
            const rc = new THREE.Raycaster(); rc.far = 3;
            const N = 400, hits = [];
            for (let i = 0; i < N; i++) {
                const t = (i / (N - 1) - 0.5) * L;
                const p = c0.clone().addScaledVector(fwd0, t);
                rc.set(new THREE.Vector3(p.x, box.min.y - 0.2, p.z), new THREE.Vector3(0, 1, 0));
                const h2 = rc.intersectObject(leg, true);
                hits.push({ t, y: h2.length ? h2[0].point.y : null });
            }
            const on = hits.filter(h => h.y != null);
            if (!on.length) return null;
            const minY = Math.min(...on.map(h => h.y));
            const step = L / (N - 1);
            const footLenW = (Math.max(...on.map(h => h.t)) - Math.min(...on.map(h => h.t))) + step;
            const eps = footLenW * 0.01;
            // ⚠️ 접지 길이를 **양 끝점 간격**으로 재면 안 된다 — 앞꿈치 끝과 뒤꿈치 끝만 닿는 로커
            //    밑창(=지적이 말한 '접지가 점')이 100% 로 나온다. 실제로 sole·heel 은 분리돼 있고
            //    그 사이는 아치라 닿지 않는다. **닿은 표본 수 × 간격**(덮은 길이)으로 재고,
            //    '한 장의 슬래브인가 두 점인가'는 **최장 연속 구간**으로 따로 본다.
            const flatMask = on.map(h => h.y <= minY + eps);
            const contactW = flatMask.filter(Boolean).length * step;
            let run = 0, runBest = 0;
            for (const f of flatMask) { run = f ? run + 1 : 0; if (run > runBest) runBest = run; }
            const runW = runBest * step;
            return {
                footLenW: +footLenW.toFixed(4), contactW: +contactW.toFixed(4),
                runW: +runW.toFixed(4), runFrac: footLenW ? +(runW / footLenW).toFixed(3) : null,
                flatnessW: footLenW ? +(contactW / footLenW).toFixed(3) : null,
                eps: +eps.toFixed(4), minY: +minY.toFixed(4),
                // 밑면 높이의 최저~최저+eps 밖 구간이 얼마나 솟았는지(참고): 접지 구간 밖 평균 높이차
                riseOut: +( (on.filter(h => h.y > minY + eps).reduce((a, h) => a + (h.y - minY), 0) /
                             Math.max(1, on.filter(h => h.y > minY + eps).length)) ).toFixed(4),
            };
        })();
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
            heelVerticalPx: vBest, toeSide: toeRight ? 'right' : 'left', ground,
        };
    });

    if (out.error) { console.log('ERROR: ' + out.error); await browser.close(); process.exit(1); }
    console.log('canvas', JSON.stringify(out.px), '· 다리 행범위', JSON.stringify(out.legRows), '· 발끝 방향', out.toeSide);
    console.log('① 발목 조임   :', `발목 ${out.ankleW}px / 정강이 ${out.shinW}px → ${(out.ankleCinch * 100).toFixed(1)}% 조임`,
        out.ankleCinch >= 0.12 ? '✅ 잘록함 있음' : '❌ 잘록함 없음(둥근 포드)');
    // ② 는 **월드 실측**으로 판정한다. 화소값은 참고로만 남긴다 — 카메라가 밑창보다 위에 있는 한
    //    화소 최저행은 평평한 원판의 근접 테두리 호를 재므로, 임계를 어떻게 잡아도 참을 못 말한다.
    const G = out.ground;
    console.log('② 접지선 평탄도(월드 실측):', G ? `접지 ${G.contactW} / 발길이 ${G.footLenW} = ${G.flatnessW}` +
        ` (eps ${G.eps} = 발길이 1% · 접지 밖 평균 융기 ${G.riseOut})` : '측정 실패(레이가 발을 못 맞혔다)',
        G && G.flatnessW >= 0.35 ? '✅ 슬래브로 읽힘' : '❌ 둥근 바닥(접지가 선이 아니라 점)');
    if (G) console.log('   최장 연속 접지:', `${G.runW} / 발길이 ${G.footLenW} = ${G.runFrac}`,
        G.runFrac >= 0.20 ? '✅ 한 장의 슬래브가 닿는다' : '❌ 끝점만 닿는 로커(점 접지)');
    console.log('   (참고) 화소 스캔값:', `${out.contactLen}px / 발길이 ${out.footLen}px = ${out.flatness}`,
        '— 판정에 쓰지 않는다(위 주석: 근접 테두리 호를 잰다)');
    console.log('③ 뒤꿈치 수직면:', out.heelVerticalPx + 'px',
        out.heelVerticalPx >= 6 ? '✅ 수직 뒷면 있음' : '❌ 뒤가 둥글게 말림');
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
