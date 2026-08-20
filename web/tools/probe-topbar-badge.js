// 상단 프로필 배지 바 — **아바타 타일과 알약의 관계**를 원본과 대조한다 (ui-ratio-audit R6 ⓒ).
//
// 왜 이 자가 필요했나: R6 비평가 A 가 "아바타가 바보다 커서 위아래로 오버행하고 바 좌단에 flush"
// 라 지적했는데, **이 관계를 보는 자가 하나도 없었다.** `probe-main-px` 에 `프로필 좌/상단/하단`
// 이 있어 다 보는 것처럼 읽히지만 그 `profile` 은 좌상단 밝은 잉크 union(= 아바타 판)일 뿐이고,
// **알약과 타일이 어떻게 겹치는지는 아무 축도 안 잰다.** (`probe-equipped-label` 이 '바'만 보고
// 깃발을 안 봤던 것과 같은 계열의 사각지대다.)
//
// 🚨 **원본 측정의 핵심 = 열 구간을 갈라서 재는 것.** 알약(근흑)과 타일의 **검정 키라인**이 둘 다
//    어두워서, `lum<0.22` 같은 단일 술어로 한 번에 재면 **한 덩어리로 붙는다.** 그렇게 재면
//    '타일이 알약 안에 2~3px 여백을 두고 들어가 있다'는 **정반대 결론**이 나온다(실제로 처음에
//    그렇게 읽었다). 그래서:
//      · 알약 세로 = **타일 오른쪽 열(x70~170)** 만 본다 → 거기엔 알약과 흰 글자뿐이다.
//      · 타일 = 열별 '비초록' 행 수가 **알약 높이보다 확연히 큰** 열들 = 타일이 서 있는 열.
//    원본은 배경이 **초록 필드**라 '비초록'이 깨끗한 술어가 된다(클론은 어두운 띠라 안 된다 —
//    아래 참고).
//
// 🚨 **클론은 DOM 으로 잰다.** 클론 상단바는 **어두운 띠**이고 알약도 근흑이라(띠 rgb(45,50,57) ↔
//    알약 rgb(34,39,46), 13계조 차이) 원본의 '초록 위 어두운 알약' 술어가 그대로는 안 먹는다.
//    띠의 유무·색은 `aaa-skin` 소관으로 이미 확정된 사항이라 여기서 건드릴 것이 아니다.
//    ⚠️ 그래서 이 자는 **원본=픽셀 / 클론=DOM** 이다. 이 조합은 폭·좌표 같은 **절대값**을 재면
//       '잉크 대 박스' 오측정이 된다(이 항목이 세 번 밟은 함정). 그래서 여기서는 **상대량만**
//       판정한다 — gap·오버행·높이는 양쪽 다 **그려진 것의 바깥 모서리** 기준이라 그 편향이 상쇄된다.
//
// 📌 **일부러 판정하지 않는 것 = 바의 폭.** 이 바는 **콘텐츠 hug** 다(앞 세션이 클론 닉네임을
//    원본과 같은 `moonzzanf` 로 바꿔 25.21%W → 27.45%W 를 실측해 확정했다). 원본 161px(32.26%W)
//    ↔ 클론 99px(19.9%W) 의 차이는 **닉네임 길이·전투력 자릿수라는 상태 차이**이지 비율 결함이
//    아니다. 판정에 넣으면 상태 차이를 영원히 못 닫는 빨간 줄로 세우게 된다 — 참고로만 인쇄한다.
//
// 사용: node tools/probe-topbar-badge.js  [--selftest]
//   --selftest: 교정 전 CSS(높이 auto · 좌 패딩 .3rem)를 페이지에 다시 먹여 **이 자가 빨개지는지**
//               확인한다. 안 빨개지면 자가 이 값을 안 보고 있다는 뜻이다(clone-fresh 머리말의 교훈).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF = path.resolve(__dirname, '../ref/screens/shot-042120.png');
const TOL = 2.0;
const SELFTEST = process.argv.includes('--selftest');

// ---- 원본 PNG 스캔 (페이지 안에서 캔버스로) ----
const SCAN = async (src) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const W = img.width, H = img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const D = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    // 필드 초록: 배지 바 오른쪽 위 빈 자리에서 딴다(원본 상단바는 불투명 띠가 아니라 필드가 비친다 —
    // 이건 이 저장소가 `[2026-08-18 UI] main` 메모에서 이미 확정한 사실이다).
    const green = at(Math.round(W * 0.40), 4);
    const isGreen = (x, y) => {
        const q = at(x, y);
        return Math.abs(q[0] - green[0]) + Math.abs(q[1] - green[1]) + Math.abs(q[2] - green[2]) < 40;
    };
    const YMAX = Math.round(H * 0.09);          // 배지 바만 담기는 높이(그 아래 요소를 안 삼키게)

    // ① 알약 세로 — 타일 오른쪽 열만 본다
    const PX0 = 70, PX1 = 170;
    let py0 = -1, py1 = -1;
    for (let y = 0; y < YMAX; y++) {
        let n = 0;
        for (let x = PX0; x <= PX1; x++) if (!isGreen(x, y)) n++;
        if (n > (PX1 - PX0 + 1) * 0.5) { if (py0 < 0) py0 = y; py1 = y; }
    }
    // ② 알약 가로 — 알약 세로 한가운데 행 대역에서
    const my0 = Math.round(py0 + (py1 - py0) * 0.3), my1 = Math.round(py0 + (py1 - py0) * 0.7);
    let px0 = -1, px1 = -1;
    for (let x = 0; x < Math.round(W * 0.45); x++) {
        let n = 0;
        for (let y = my0; y <= my1; y++) if (!isGreen(x, y)) n++;
        if (n > (my1 - my0 + 1) * 0.8) { if (px0 < 0) px0 = x; px1 = x; }
    }
    // ③ 타일 — **알약 밖으로 삐져나온 화소가 있는 열**이 곧 타일이 선 열이다.
    //    ⚠️ '열별 비초록 행 수가 알약 높이보다 크다'로 잡으면 안 된다 — 알약 아래쪽 창(YMAX)에
    //       걸린 다른 요소 몇 행이 더해져 **순수 알약 열까지 타일로 잡힌다**(실측: 타일이
    //       x16~72 로 14px 넓게 나왔다 = 폭 Δ−2.8%p 짜리 유령). 오버행 자체를 술어로 쓰면
    //       '알약만 있는 열'은 정의상 0 이라 섞일 수가 없다.
    const pillH = py1 - py0 + 1;
    const MB = Math.max(4, Math.round(pillH * 0.35));       // 오버행을 찾을 위·아래 여유 띠
    let tx0 = -1, tx1 = -1;
    for (let x = 0; x < Math.round(W * 0.2); x++) {
        let n = 0;
        for (let y = Math.max(0, py0 - MB); y < py0; y++) if (!isGreen(x, y)) n++;
        for (let y = py1 + 1; y <= Math.min(H - 1, py1 + MB); y++) if (!isGreen(x, y)) n++;
        if (n >= 3) { if (tx0 < 0) tx0 = x; tx1 = x; }
    }
    // 타일 세로 — 타일 열 대역에서 비초록 행
    let ty0 = -1, ty1 = -1;
    for (let y = 0; y < YMAX; y++) {
        let n = 0;
        for (let x = tx0; x <= tx1; x++) if (!isGreen(x, y)) n++;
        if (n > (tx1 - tx0 + 1) * 0.5) { if (ty0 < 0) ty0 = y; ty1 = y; }
    }
    return { W, H, pill: { x0: px0, x1: px1, y0: py0, y1: py1 }, tile: { x0: tx0, x1: tx1, y0: ty0, y1: ty1 } };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));

    await page.setContent('<body style="margin:0">');
    const ref = await page.evaluate(SCAN, 'data:image/png;base64,' + fs.readFileSync(REF).toString('base64'));

    // ---- 측정기 자기검증: 원본에서 뽑은 기하가 말이 되는가 ----
    // (숫자를 인쇄하기 전에 끊는다 — probe-techoverview-dom 규약. 헛수치를 좇으면 멀쩡한 걸 망가뜨린다.)
    const tw = ref.tile.x1 - ref.tile.x0 + 1, th = ref.tile.y1 - ref.tile.y0 + 1;
    const ph = ref.pill.y1 - ref.pill.y0 + 1, pwid = ref.pill.x1 - ref.pill.x0 + 1;
    const bad = [];
    if (!(tw >= 30 && tw <= 60)) bad.push(`타일 폭 ${tw}px (30~60 밖)`);
    if (!(th >= 30 && th <= 64)) bad.push(`타일 높이 ${th}px (30~64 밖)`);
    if (!(ph >= 25 && ph <= 55)) bad.push(`알약 높이 ${ph}px (25~55 밖)`);
    if (!(pwid >= 100 && pwid <= 260)) bad.push(`알약 폭 ${pwid}px (100~260 밖)`);
    if (!(th > ph)) bad.push(`타일(${th})이 알약(${ph})보다 안 크다 — 오버행 전제가 깨졌다`);
    if (bad.length) {
        console.log('원본 스캔:', JSON.stringify(ref));
        console.log('❌ 측정기 고장(exit 2) — 원본 기하가 말이 안 된다:\n  ' + bad.join('\n  '));
        await browser.close();
        process.exit(2);
    }

    // ---- 클론 DOM ----
    await page.goto(INDEX);
    await page.waitForTimeout(1500);
    for (const k of Object.keys(SC)) if (typeof SC[k] === 'function') { try { await SC[k](page); } catch (e) { /* 시드 일부 실패는 이 화면과 무관 */ } }
    await page.waitForTimeout(400);
    if (SELFTEST) {
        await page.addStyleTag({ content: `.profile-card { height: auto !important; padding: .25rem .7rem .25rem .3rem !important; }` });
        await page.waitForTimeout(200);
    }
    const clone = await page.evaluate(() => {
        const card = document.querySelector('#topbar .profile-card');
        if (!card) return { err: '#topbar .profile-card 없음' };
        const av = card.querySelector('.avatar');
        if (!av) return { err: '.profile-card .avatar 없음' };
        const R = e => { const b = e.getBoundingClientRect(); return { x0: b.left, x1: b.right, y0: b.top, y1: b.bottom }; };
        return { pill: R(card), tile: R(av), appW: document.getElementById('app').getBoundingClientRect().width,
                 appH: document.getElementById('app').getBoundingClientRect().height };
    });
    if (clone.err) { console.log('❌ 측정기 고장(exit 2) — ' + clone.err); await browser.close(); process.exit(2); }

    const RW = ref.W, RH = ref.H, CW = clone.appW, CH = clone.appH;
    const rpw = v => +(v / RW * 100).toFixed(2), rph = v => +(v / RH * 100).toFixed(2);
    const cpw = v => +(v / CW * 100).toFixed(2), cph = v => +(v / CH * 100).toFixed(2);

    // 원본은 픽셀 인덱스(포함 구간)이므로 폭 = x1-x0+1, 클론은 실수 경계라 폭 = x1-x0.
    const R = {
        '타일좌 − 알약좌':   [rpw(ref.tile.x0 - ref.pill.x0),                 cpw(clone.tile.x0 - clone.pill.x0)],
        '위 오버행':         [rph(ref.pill.y0 - ref.tile.y0),                 cph(clone.pill.y0 - clone.tile.y0)],
        '아래 오버행':       [rph(ref.tile.y1 - ref.pill.y1),                 cph(clone.tile.y1 - clone.pill.y1)],
        '알약 높이':         [rph(ref.pill.y1 - ref.pill.y0 + 1),             cph(clone.pill.y1 - clone.pill.y0)],
        '타일 높이':         [rph(ref.tile.y1 - ref.tile.y0 + 1),             cph(clone.tile.y1 - clone.tile.y0)],
        '타일 폭':           [rpw(ref.tile.x1 - ref.tile.x0 + 1),             cpw(clone.tile.x1 - clone.tile.x0)],
    };

    console.log(`원본 shot-042120 ${RW}×${RH} · 클론 앱 ${CW.toFixed(0)}×${CH.toFixed(0)}${SELFTEST ? '  [SELFTEST: 교정 전 CSS 재적용]' : ''}`);
    console.log(`  원본 알약 x${ref.pill.x0}~${ref.pill.x1} y${ref.pill.y0}~${ref.pill.y1} · 타일 x${ref.tile.x0}~${ref.tile.x1} y${ref.tile.y0}~${ref.tile.y1}`);
    console.log(`  클론 알약 x${clone.pill.x0.toFixed(1)}~${clone.pill.x1.toFixed(1)} y${clone.pill.y0.toFixed(1)}~${clone.pill.y1.toFixed(1)} · 타일 x${clone.tile.x0.toFixed(1)}~${clone.tile.x1.toFixed(1)} y${clone.tile.y0.toFixed(1)}~${clone.tile.y1.toFixed(1)}`);
    console.log('\n요소'.padEnd(20) + '원본'.padStart(8) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    const ng = []; let worst = 0;
    for (const [k, [o, c]] of Object.entries(R)) {
        const d = +(c - o).toFixed(2);
        if (Math.abs(d) > Math.abs(worst)) worst = d;
        const ok = Math.abs(d) <= TOL;
        if (!ok) ng.push(`${k} ${d > 0 ? '+' : ''}${d}%p`);
        console.log(k.padEnd(18) + o.toFixed(2).padStart(11) + c.toFixed(2).padStart(9) + `${d > 0 ? '+' : ''}${d}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%p 초과`));
    }
    /* ---- 구조 판정 (±%p 게이트와 **별개**) ----
       🚨 **이 결함은 %p 로는 안 잡힌다 — 실측으로 확인했다.** 교정 전 상태를 `--selftest` 로 재면
          여섯 축이 **전부 게이트 안**이다(최대 +1.87%p, 알약 높이). 그런데도 화면은 명백히 틀렸다:
          원본은 타일이 알약 **밖으로** 나와 있고 클론은 알약 **안에** 잠겨 있었다 — 즉 오버행의
          **부호가 반대**였는데, 부호가 뒤집혀도 두 값의 차는 1%p 남짓이라 어떤 허용오차도 못 잡는다.
          (이 저장소가 `probe-hatch-cone`·`probe-fl-body` 에서 '임계 하나로 부호가 뒤집힌다'를
           배운 것의 반대편 사례다 — 거기선 자가 부호를 착각했고, 여기선 자가 부호를 안 봤다.)
       👉 그래서 크기 대조와 **따로**, 원본이 만족하는 구조 명제를 클론도 만족하는지 본다.
          값이 아니라 **관계**라 상태(닉네임 길이)나 1~2px 차이에 흔들리지 않는다. */
    const struct = [];
    const chk = (name, refOk, cloneOk, detail) => {
        if (refOk && !cloneOk) struct.push(`${name} — ${detail}`);
    };
    const rOverTop = ref.pill.y0 - ref.tile.y0, cOverTop = clone.pill.y0 - clone.tile.y0;
    const rOverBot = ref.tile.y1 - ref.pill.y1, cOverBot = clone.tile.y1 - clone.pill.y1;
    const rTileH = ref.tile.y1 - ref.tile.y0 + 1, cTileH = clone.tile.y1 - clone.tile.y0;
    const rPillH = ref.pill.y1 - ref.pill.y0 + 1, cPillH = clone.pill.y1 - clone.pill.y0;
    const rGap = ref.tile.x0 - ref.pill.x0, cGap = clone.tile.x0 - clone.pill.x0;
    chk('타일이 알약 위로 넘친다', rOverTop > 0, cOverTop > 0, `원본 +${rOverTop}px ↔ 클론 ${cOverTop.toFixed(1)}px (음수 = 알약 안에 잠김)`);
    chk('타일이 알약 아래로 넘친다', rOverBot > 0, cOverBot > 0, `원본 +${rOverBot}px ↔ 클론 ${cOverBot.toFixed(1)}px (음수 = 알약 안에 잠김)`);
    chk('타일이 알약보다 높다', rTileH > rPillH, cTileH > cPillH, `원본 ${rTileH}>${rPillH} ↔ 클론 ${cTileH.toFixed(1)}>${cPillH.toFixed(1)} 아님`);
    chk('타일이 알약 좌단에 붙는다', rGap <= 3, cGap <= 3, `원본 ${rGap}px ↔ 클론 ${cGap.toFixed(1)}px (좌 패딩이 남아 있다)`);
    console.log('\n구조 판정 (원본이 만족하는 명제를 클론도 만족하는가 — %p 게이트가 못 잡는 축):');
    console.log(struct.length ? '  ❌ ' + struct.join('\n  ❌ ') : '  ✅ 4건 전부 만족');

    // 참고(판정 안 함) — 콘텐츠 hug 라 상태 차이다
    console.log(`\n[미판정 참고] 바 폭 원본 ${rpw(ref.pill.x1 - ref.pill.x0 + 1)}%W ↔ 클론 ${cpw(clone.pill.x1 - clone.pill.x0)}%W`
        + ` — 이 바는 **콘텐츠 hug** 라 닉네임 길이·전투력 자릿수에 따라 변한다(앞 세션 실측 확정). 비율 결함 아님.`);
    console.log(`콘솔/페이지 에러: ${errs.length}건`);
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ':\n  ' + ng.join('\n  ') : ''} · 구조 위반 ${struct.length}건`);
    const fail = ng.length + struct.length;
    console.log(fail ? 'FAIL' : `PASS — 전 요소 ±${TOL}%p 이내 + 구조 4건 만족`);
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
