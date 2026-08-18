// hp-juicy ㉢ 병목 판정용 **자(尺)** — 6차 메모가 "다음 세션이 먼저 할 일은 처방이 아니라 자 세우기다"
// 로 남긴 그 자다. 앞 세션은 `page.screenshot({clip})` 로 A/B 를 돌려 '후보 ⑴⑵⑶ 전부 기각'이라는
// 표를 얻었는데, **그 자가 적을 보고 있는지부터 확인하지 않아** 표 전체가 무효가 됐다(적을 통째로
// 숨겼다 켜도 그 영역 휘도가 0.017 밖에 안 움직였다 = 적이 없는 자리를 재고 있었다).
//
// 이 자가 그때와 다른 점 셋 — 셋 다 그 실패를 직접 겨냥한다:
//   ⓐ **스크린샷을 안 쓴다.** 메인 렌더러는 `preserveDrawingBuffer:false` 라, `renderFrame()` 직후
//      캔버스를 찍으면 합성기가 마지막으로 물고 있던 프레임이 돌아올 수 있다(=내 렌더가 안 잡힌다).
//      대신 `renderer.readRenderTargetPixels()` 로 **렌더 타깃에서 직접** 읽는다.
//      · 포스트 전(씬 원본) = `Scene3D._rtScene` 을 그대로 읽는다.
//      · 포스트 후(채점자가 본 그림) = `renderFrame()` 이 세팅해 둔 `_compMat` 유니폼 그대로
//        합성 패스만 캡처 RT 에 한 번 더 그려 읽는다(캔버스 경로와 동일한 셰이더·동일한 입력).
//        캡처 RT 의 `texture.encoding` 을 sRGB 로 두는 게 핵심 — r128 은 렌더 타깃일 때
//        `outputEncoding` 대신 그 타깃의 encoding 을 쓴다. 안 맞추면 채도·감마가 통째로 달라진다.
//   ⓑ **좌표를 섞지 않는다.** `Scene3D.project()` 는 캔버스 로컬 CSS 좌표다. 여기에 뷰포트
//      오프셋(`rect.left/top`)을 더하지 않고, 드로잉버퍼 배율만 곱한 뒤 **GL 은 원점이 아래**라
//      y 를 뒤집는다. 앞 세션이 밟은 함정이 정확히 이 자리다.
//   ⓒ 🚨 **적 마스크를 눈짐작(휘도 임계값)으로 안 뜬다.** 적을 `visible=false` 로 껐다 켜서
//      **실제로 달라지는 픽셀**을 마스크로 삼는다. 이러면 마스크가 곧 자가검증이다 —
//      마스크 픽셀 수가 너무 적거나 휘도 변화가 없으면 **판정하지 않고 exit 2 로 죽는다.**
//      (임계값 마스크는 '몸이 어두워지면 마스크에서 빠져나가' 델타를 항상 과소평가한다 —
//       `probe-hitflash-delta.js` 가 자기 한계로 적어 둔 그 문제도 같이 없어진다.)
//
// 재는 것 — ㉢('일반 타격의 몸 플래시가 프레임에 안 남는다', 델타 2.5%)의 병목 후보 판정:
//   ⑴ 림 셸/아웃라인이 몸통 색을 덮는가        → 림 셸을 끈 채/켠 채 같은 플래시를 재 비교
//   ⑵ 조명·블룸이 알베도/발광 변화를 씻어내는가 → **포스트 전 델타 vs 포스트 후 델타**를 같이 낸다
//   ⑶ 하네스가 플래시 구간을 비껴가는가         → 플래시 전 구간을 훑어 **최대 델타 프레임**을 찾는다
// 그리고 처방 설계에 필요한 응답 곡선: 같은 코드 경로에 peak 를 올려 가며 델타가 **얼마나 붙는지**.
//
// ⚠️ 인자를 손으로 베끼지 않는다(TODO 함정 ④⑴). `hitEnemy` 를 한 번 진짜로 태워 `flashMesh` 가
//    받는 (peak, dur) 를 **가로채 기록**하고, 이후 격리 실험은 그 기록값으로 진짜 함수를 재생한다.
//
// 사용: node tools/probe-flash-gl.js [enemyKind]
// exit 0 = 판정 성공(표 출력) · 2 = 자 고장(적 유/무가 안 잡힘 — 아무것도 판정하지 않음) · 1 = 실행 실패
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KIND = process.argv[2] || 'golem';

// 자가검증 하한 — 적을 껐다 켰을 때 이만큼도 안 변하면 그 자는 적을 안 보고 있는 것이다.
const SELFCHECK_MIN_PIX = 800;      // 마스크 픽셀 수(드로잉버퍼 기준)
const SELFCHECK_MIN_LUM = 0.02;     // 마스크 영역 평균 휘도 변화

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 180000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive && Scene3D.enemyMap.get(e.id)), null, { timeout: 180000 });

    const out = await page.evaluate(() => {
        // ---- 연출 시간을 손으로 흘린다 (TODO 함정 ③: 헤드리스에서 rAF 는 사실상 안 돈다) ----
        Combat.tick = () => { };
        Scene3D.walking = false;
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (sec) => { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) realUpdate(1 / 120); };
        Scene3D.anims.length = 0;          // 밀린 백로그를 비운다(같은 좌표를 서로 덮어써 톱니가 된다)
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        step(0.5);                          // 잔여 상태 안정화

        if (!Scene3D.postOn || !Scene3D._rtScene) return { fatal: 'postOn 이 꺼져 있다 — 이 자는 포스트 스택을 전제한다' };

        const r = Scene3D.renderer;
        const db = new THREE.Vector2(); r.getDrawingBufferSize(db);
        const W = Math.floor(db.x), H = Math.floor(db.y);
        const cap = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
        cap.texture.encoding = THREE.sRGBEncoding;   // 캔버스 경로와 같은 색으로 기록 (r128: RT 일 땐 outputEncoding 대신 이 값을 쓴다)

        // 포스트 후(=채점자가 보는 그림). renderFrame 이 세팅해 둔 유니폼 그대로 합성만 한 번 더.
        const grabPost = () => {
            Scene3D.renderFrame();
            Scene3D._fsQuad.material = Scene3D._compMat;
            r.setRenderTarget(cap); r.render(Scene3D._fsScene, Scene3D._fsCam);
            r.setRenderTarget(null);
            const b = new Uint8Array(W * H * 4);
            r.readRenderTargetPixels(cap, 0, 0, W, H, b);
            return b;
        };
        // 포스트 전(씬 원본). renderFrame 이 이미 _rtScene 에 씬을 그려 뒀다.
        const grabPre = () => {
            Scene3D.renderFrame();
            const b = new Uint8Array(W * H * 4);
            r.readRenderTargetPixels(Scene3D._rtScene, 0, 0, W, H, b);
            return b;
        };

        // ---- 적 화면 bbox: 캔버스 로컬 CSS → 드로잉버퍼, y 뒤집기 (좌표계를 섞지 않는다) ----
        const e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
        const m = Scene3D.enemyMap.get(e.id);
        const cv = r.domElement, rect = cv.getBoundingClientRect();
        const sx = W / rect.width, sy = H / rect.height;
        const projGL = (v) => {
            const p = v.clone().project(Scene3D.camera);
            const lx = (p.x * 0.5 + 0.5) * rect.width;      // 캔버스 로컬 CSS x
            const ly = (0.5 - p.y * 0.5) * rect.height;     // 캔버스 로컬 CSS y (아래로 증가)
            return [lx * sx, H - ly * sy];                  // GL 은 원점이 좌하단
        };
        const target = m.body || m.g;
        target.updateWorldMatrix(true, true);
        const bb = new THREE.Box3().setFromObject(target);
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const xi of [bb.min.x, bb.max.x]) for (const yi of [bb.min.y, bb.max.y]) for (const zi of [bb.min.z, bb.max.z]) {
            const [px, py] = projGL(new THREE.Vector3(xi, yi, zi));
            x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
        }
        const pad = 8;
        x0 = Math.max(0, Math.floor(x0 - pad)); x1 = Math.min(W, Math.ceil(x1 + pad));
        y0 = Math.max(0, Math.floor(y0 - pad)); y1 = Math.min(H, Math.ceil(y1 + pad));

        // ---- 자가검증 = 적 마스크 생성. 적을 껐다 켠 차분이 곧 '적 픽셀'이다 ----
        const wasVisible = m.g.visible;
        m.g.visible = false; const off = grabPost();
        m.g.visible = wasVisible; const on = grabPost();

        const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const lumAt = (b, i) => 0.2126 * srgb(b[i]) + 0.7152 * srgb(b[i + 1]) + 0.0722 * srgb(b[i + 2]);
        const satAt = (b, i) => {
            const R = b[i] / 255, G = b[i + 1] / 255, B = b[i + 2] / 255;
            const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
            return mx <= 0 ? 0 : (mx - mn) / mx;
        };

        const maskFrom = (a, b) => {
            const out = [];
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const i = (y * W + x) * 4;
                if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) out.push(i);
            }
            return out;
        };
        const mask = maskFrom(off, on);
        // 🚨 **프레임마다 그 프레임의 마스크를 다시 뜬다.** 타격에는 넉백·스케일 펀치가 붙어 적이
        //    움직이므로, 타격 전 자리로 뜬 **고정 마스크**로 뒤 프레임을 재면 적이 마스크 밖으로
        //    걸어나가 '어두워졌다'가 찍힌다(6차 메모가 앞 자에서 이미 밟은 함정 — 그땐 −0.0776 이
        //    나왔다). 이 자는 적을 껐다 켤 수 있으므로 **매 프레임 실측 마스크**를 만들 수 있다.
        const liveStats = () => {
            const v = m.g.visible;
            m.g.visible = false; const a = grabPost();
            m.g.visible = v; const b = grabPost();
            const mk = maskFrom(a, b);
            if (!mk.length) return { lum: 0, sat: 0, n: 0 };
            let L = 0, S = 0;
            for (const i of mk) { L += lumAt(b, i); S += satAt(b, i); }
            return { lum: L / mk.length, sat: S / mk.length, n: mk.length, buf: b };
        };
        const stats = (b) => {
            if (!mask.length) return { lum: 0, sat: 0 };
            let L = 0, S = 0;
            for (const i of mask) { L += lumAt(b, i); S += satAt(b, i); }
            return { lum: L / mask.length, sat: S / mask.length };
        };
        // 앞 자(`probe-hitflash-delta.js`)가 쓰던 **휘도 임계값 마스크**를 같은 프레임에 나란히 걸어
        // 두 자가 얼마나 다른 값을 내는지 본다 — 그 자가 스스로 '하한'이라고 적어 둔 편향의 크기다.
        const statsThresh = (b) => {
            let L = 0, n = 0;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                const i = (y * W + x) * 4, l = lumAt(b, i);
                if (l > 0.45) { L += l; n++; }
            }
            return { lum: n ? L / n : 0, n };
        };
        const selfLum = Math.abs(stats(off).lum - stats(on).lum);
        const selfcheck = { pixels: mask.length, lumDelta: selfLum, box: [x0, y0, x1, y1], W, H, offLum: stats(off).lum, onLum: stats(on).lum };
        if (mask.length < 800 || selfLum < 0.02) return { selfcheck, fatal: 'SELFCHECK' };

        // ---- 진짜 코드 경로에서 (peak, dur) 를 가로챈다 (인자를 손으로 베끼지 않는다) ----
        const origFlash = Scene3D.flashMesh.bind(Scene3D);
        let spy = null;
        Scene3D.flashMesh = function (mm, peak, dur) { if (mm === m && !spy) spy = { peak, dur }; return origFlash(mm, peak, dur); };
        // ⚠️ **타격 전 프레임을 기준선으로 먼저 뜬다.** 타격 후 첫 프레임을 기준 삼으면 그 프레임에
        //    이미 플래시가 최고조로 들어 있어 프로파일이 플래시의 상승을 통째로 못 본다(0 을 기준으로
        //    깔고 '변화 없음'으로 읽힌다). 이 한 줄이 없으면 아래 표 전체가 플래시를 놓친다.
        const pre = liveStats(), preTh = statsThresh(pre.buf);

        Scene3D.hitEnemy(e.id, 140, false, null, false);   // 일반 타격 (crit=false) — 전체 타격의 90%
        Scene3D.flashMesh = origFlash;

        // 전체 타격(모든 레이어 켜짐)의 시간 프로파일 = 후보 ⑶ 판정.
        // 프레임마다 **그 프레임의 마스크를 다시 떠**(liveStats) 넉백 변위가 델타에 안 섞이게 하고,
        // 같은 프레임을 앞 자(임계값 마스크)로도 재 두 자의 차이를 나란히 남긴다.
        const full = [{ t: -16, post: pre.lum, sat: pre.sat, n: pre.n, thresh: preTh.lum, threshN: preTh.n }];
        for (let t = 0; t <= 200; t += 16) {
            const s = liveStats(), th = statsThresh(s.buf);
            full.push({ t, post: s.lum, sat: s.sat, n: s.n, thresh: th.lum, threshN: th.n });
            step(0.016);
        }

        // ---- 격리 실험 준비: 방금 타격이 만든 것을 전부 걷어 원상복귀 ----
        const reset = () => {
            Scene3D.anims.length = 0;
            Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
            Scene3D.particles.length = 0;
            if (m.rimShell) m.rimShell.visible = false;
            for (const mat of (m.flashMats || [])) {
                const e0 = mat.userData._em0;
                if (mat.emissive && e0) { mat.emissive.setHex(e0.hex); mat.emissiveIntensity = e0.i; }
            }
            m.g.position.copy(m.homePos || m.g.position);
            m.g.scale.setScalar(m.baseScale || 1);
            step(0.4);
        };
        reset();

        // 격리 측정 1회: 플래시만(진짜 함수 + 가로챈 진짜 인자), 림 셸은 옵션
        const measureFlash = (peak, withRim) => {
            reset();
            const base = { post: grabPost(), pre: grabPre() };
            origFlash(m, peak, spy.dur);
            if (withRim && m.rimShell) m.rimShell.visible = true;
            const hit = { post: grabPost(), pre: grabPre() };
            const bp = stats(base.post), hp = stats(hit.post), bq = stats(base.pre), hq = stats(hit.pre);
            reset();
            return {
                peak,
                postLum: hp.lum - bp.lum, preLum: hq.lum - bq.lum,
                postSat: hp.sat - bp.sat, preSat: hq.sat - bq.sat,
                basePostLum: bp.lum, basePreLum: bq.lum,
            };
        };

        // ⑵ 포스트 전/후 + 응답 곡선: 코드값(spy.peak)부터 상한까지
        const curve = [spy.peak, spy.peak * 2, spy.peak * 5, 1.0, 2.0].map(p => measureFlash(p, false));

        // ⑶-b 플래시 **혼자만**의 시간 모양. 전체 타격 프로파일은 플레어·파편·림이 섞여 있어
        // 플래시 자신의 어택/디케이를 못 본다. `flashMesh` 는 emissiveIntensity 를 선형으로 내리는데
        // 화면 휘도 응답이 강하게 압축적(아래 곡선)이라, **선형 감쇠가 화면에서는 평평한 고원**으로
        // 읽힐 수 있다 — 5차 지적 ⓖ('비네트가 최대 강도로 60ms 이상 평평')와 같은 계열의 결함이다.
        // 그게 실제로 일어나는지를 여기서 잰다.
        reset();
        const soloBase = liveStats().lum;
        origFlash(m, spy.peak, spy.dur);
        const solo = [];
        for (let t = 0; t <= Math.round(spy.dur * 1000) + 48; t += 16) {
            solo.push({ t, d: liveStats().lum - soloBase });
            step(0.016);
        }
        reset();

        // ⑴ 림 셸이 몸통 색을 덮는가 — 같은 peak 로 림만 켰다/껐다
        reset();
        const rimOff = measureFlash(spy.peak, false);
        const rimOn = measureFlash(spy.peak, true);

        // 참고: 마스크가 덮는 재질 커버리지(코드에서 직접 센 값 — 화면 판독과 무관)
        let meshN = 0, flashCov = 0;
        m.g.traverse(o => { if (o.isMesh) { meshN++; if ((m.flashMats || []).includes(o.material)) flashCov++; } });

        return { selfcheck, spy, full, solo, curve, rim: { off: rimOff, on: rimOn }, cov: { meshN, flashCov, mats: (m.flashMats || []).length }, kind: m.kind };
    });

    const f = (v, n = 4) => (v === undefined || v === null) ? 'n/a' : (+v).toFixed(n);
    if (out.fatal === 'SELFCHECK') {
        const s = out.selfcheck;
        console.log('\n🚨 자 고장 — 적을 껐다 켜도 그 영역이 안 변한다. 아무것도 판정하지 않는다.');
        console.log('   마스크 픽셀 %d (하한 %d) · 휘도 변화 %s (하한 %s) · bbox %s · 드로잉버퍼 %dx%d',
            s.pixels, SELFCHECK_MIN_PIX, f(s.lumDelta), SELFCHECK_MIN_LUM, JSON.stringify(s.box), s.W, s.H);
        await browser.close(); process.exit(2);
    }
    if (out.fatal) { console.log('\n🚨 %s', out.fatal); await browser.close(); process.exit(1); }

    const s = out.selfcheck;
    console.log('\n== 자가검증 (이게 통과해야 아래 표가 의미를 가진다) ==');
    console.log('  적 마스크 %d px · 적 껐을 때 휘도 %s → 켰을 때 %s (변화 %s) · bbox %s · 드로잉버퍼 %dx%d',
        s.pixels, f(s.offLum), f(s.onLum), f(s.lumDelta), JSON.stringify(s.box), s.W, s.H);
    console.log('  적 종류=%s · 메시 %d개 중 flashMats 재질을 쓰는 메시 %d개 (재질 %d종)', out.kind, out.cov.meshN, out.cov.flashCov, out.cov.mats);
    console.log('  코드가 준 일반 타격 플래시 인자: peak=%s dur=%s (가로챈 값 — 손으로 베끼지 않았다)', out.spy.peak, out.spy.dur);

    const pad = (v, n) => String(v).padStart(n);
    const padR = (v, n) => String(v).padEnd(n);
    const sgn = (v) => (v >= 0 ? '+' : '') + f(v);

    console.log('\n== ⑶ 전체 타격 시간 프로파일 — 하네스가 플래시 구간을 비껴가는가 ==');
    console.log('   (같은 프레임을 두 자로 나란히: 토글 마스크 = 이 자 · 임계값 마스크 = 앞 자가 쓰던 것)');
    const b0 = out.full[0].post, t0 = out.full[0].thresh;   // 기준 = **타격 전** 프레임
    console.log('   시각      토글마스크 휘도  Δ         마스크px  임계값마스크 휘도  Δ         임계px');
    for (const r of out.full) {
        console.log('  %sms  %s  %s  %s  %s  %s  %s',
            pad(r.t < 0 ? '타격전' : '+' + r.t, 6), padR(f(r.post), 14), padR(sgn(r.post - b0), 8), pad(r.n, 7),
            padR(f(r.thresh), 16), padR(sgn(r.thresh - t0), 8), pad(r.threshN, 6));
    }
    const peakRow = out.full.reduce((a, b) => Math.abs(b.post - b0) > Math.abs(a.post - b0) ? b : a);
    console.log('  → 토글 마스크 최대 이탈 = +%dms (%s)', peakRow.t, sgn(peakRow.post - b0));

    console.log('\n== ⑶-b 플래시 혼자만의 시간 모양 — 선형 감쇠가 화면에서도 선형인가 ==');
    const sPk = out.solo.reduce((a, b) => Math.abs(b.d) > Math.abs(a.d) ? b : a).d;
    console.log('   시각    Δ휘도      최대 대비');
    for (const r of out.solo) {
        const pct = Math.abs(sPk) > 1e-6 ? (r.d / sPk * 100) : 0;
        console.log('  +%sms  %s  %s%%  %s', pad(r.t, 4), padR(sgn(r.d), 9), pad(pct.toFixed(0), 4), '█'.repeat(Math.max(0, Math.round(pct / 4))));
    }

    console.log('\n== ⑵ 포스트 전 vs 포스트 후 — 조명·블룸이 씻어내는가 (플래시만 격리) ==');
    console.log('   peak     포스트전 Δ휘도   포스트후 Δ휘도   통과율     포스트후 Δ채도');
    for (const c of out.curve) {
        const ratio = Math.abs(c.preLum) > 1e-6 ? (c.postLum / c.preLum) : NaN;
        console.log('  %s  %s  %s  %s  %s', padR(f(c.peak, 3), 7), padR(f(c.preLum), 14), padR(f(c.postLum), 14),
            padR(isNaN(ratio) ? 'n/a' : (ratio * 100).toFixed(0) + '%', 9), f(c.postSat));
    }
    const code = out.curve[0];
    console.log('  기준 휘도(플래시 없음) 포스트전 %s → 포스트후 %s', f(code.basePreLum), f(code.basePostLum));

    console.log('\n== ⑴ 림 셸이 몸통 색을 덮는가 ==');
    console.log('  림 끔  Δ휘도 %s · Δ채도 %s', f(out.rim.off.postLum), f(out.rim.off.postSat));
    console.log('  림 켬  Δ휘도 %s · Δ채도 %s', f(out.rim.on.postLum), f(out.rim.on.postSat));
    console.log('  → 림을 켜서 몸통 델타가 %s%% 움직인다', ((out.rim.on.postLum / out.rim.off.postLum - 1) * 100).toFixed(1));

    console.log('\n콘솔 에러 %d건%s', errors.length, errors.length ? ': ' + errors.slice(0, 3).join(' | ') : '');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
