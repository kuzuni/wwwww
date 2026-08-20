// 펫 화면 부화장 상태(shot-042445 / pets-2) 요소 실측 — '전 UI 비율 전수 검증 패스'(ui-ratio-audit).
//
// pets(042356)는 `probe-pets-dom.js` 가 이미 판정했다(20요소 PASS). 이 컷은 같은 화면의 **다른 상태** —
// 부화 슬롯 3칸이 전부 돌고 있고 [슬롯 +1] 이 떠 있는 상태라, 밴드 안쪽 기하가 새로 생긴다.
// 규약은 probe-tn-dom.js 와 같다: **원본 PNG 스캔 + 클론 DOM rect 를 한 런에서**.
//
// 재는 요소: 부화장 밴드 상단/높이 · 부화 칸 3개의 중심x·피치 · 빛기둥(콘) 폭 · 타이머 글자줄 상단 ·
//            ◀ 버튼 좌/폭/중심y.
// 🚨 미판정(사양·화풍 차이라 비율 결함이 아니다):
//   · **[슬롯 +1]**: 원본은 '슬롯 +1' 흰 글자 + 그 아래 ◆400 은색 알약 **2단**인데 클론은 두 줄이 한
//     버튼 안에 든다 — 같은 상자가 아니라 폭·높이 대조가 성립하지 않는다(값만 참고로 찍는다).
//   · 알 그림·램프 화풍(3D 썸네일 vs 픽셀 아트) — equip/icon 계열.
//
// 사용: node tools/probe-pets2-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042445.png');
const TOL = 2.0;

const SCAN = (async (src) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const W = img.width, H = img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

    // ── 앱 폭: 맨 아래 탭바 행에서 '바탕이 아닌' 최장 구간
    const yBot = H - 3, bg = at(1, yBot);
    const sameBg = p => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 24;
    let appL = 0, appR = W - 1, best = 0, run = -1;
    for (let x = 0; x <= W; x++) {
        const on = x < W && !sameBg(at(x, yBot));
        if (on && run < 0) run = x;
        if (!on && run >= 0) { if (x - run > best) { best = x - run; appL = run; appR = x - 1; } run = -1; }
    }
    if (best < W * 0.5) { appL = 0; appR = W - 1; }
    const AW = appR - appL + 1;

    // ── 부화장 밴드 = 남색(#1b2340 계열) 대역.
    //    🚨 '행의 대부분이 남색' 조건으로는 안 된다 — 알·빛기둥·타이머가 있는 행은 남색 비율이 뚝 떨어져
    //    밴드가 62px(실제 ≈170px)로 잘렸다. 밴드 **왼쪽 여백 열**은 위에서 아래까지 순수 남색이므로
    //    그 열의 최장 남색 구간을 밴드로 쓴다(◀ 버튼을 피해 x = appL+3 을 본다).
    const navy = p => p[2] > p[0] + 12 && p[2] < 110 && p[0] < 70 && p[1] < 80;
    //    ⚠️ 왼쪽 여백만 보면 안 된다 — 거기엔 ◀ 버튼과 그 그림자가 있어 밴드가 y682 에서 잘렸다
    //    (110px, 실제 ≈170px). 좌·우 여백 열을 다 훑어 **가장 긴 남색 구간**을 쓴다.
    let bandTop = -1, bandBot = -1;
    for (const probeX of [appL + 2, appL + 3, appR - 2, appR - 3]) {
        let s = -1;
        for (let y = 0; y <= H; y++) {
            const on = y < H && navy(at(probeX, y));
            if (on && s < 0) s = y;
            if (!on && s >= 0) { if (y - 1 - s > bandBot - bandTop) { bandTop = s; bandBot = y - 1; } s = -1; }
        }
    }

    // ── 부화 칸: 밴드 안 '노랑~연두'(빛기둥+전구) 화소를 열 히스토그램으로 뭉쳐 3덩어리로 가른다.
    //    성분 분석 대신 열 프로파일을 쓰는 이유 — 전구와 콘이 붙었다 떨어졌다 해서 성분 수가 흔들린다.
    const warm = p => p[0] > 105 && p[1] > 105 && p[1] - p[2] > 45;
    const colN = new Array(W).fill(0);
    for (let y = bandTop; y <= bandBot; y++) for (let x = appL; x <= appR; x++) if (warm(at(x, y))) colN[x]++;
    const cells = []; let cs = -1;
    for (let x = appL; x <= appR + 1; x++) {
        const on = x <= appR && colN[x] > 0;
        if (on && cs < 0) cs = x;
        if (!on && cs >= 0) { if (x - cs >= 10) cells.push({ x1: cs, x2: x - 1 }); cs = -1; }
    }

    // ── 타이머 글자줄 = 밴드 아래쪽 절반에서 흰 화소가 잡히는 첫 행
    const white = p => Math.min(...p) >= 225;
    const midY = Math.round((bandTop + bandBot) / 2);
    let timeTop = -1;
    for (let y = midY; y <= bandBot; y++) {
        let n = 0;
        for (let x = appL; x <= appR; x++) if (white(at(x, y))) n++;
        if (n > AW * 0.03) { timeTop = y; break; }
    }

    // ── ◀ 버튼: 밴드 안 왼쪽 1/4 의 빨강 덩어리
    // 🚨 **주석은 '덩어리'였는데 코드는 합집합이었다 — 2026-08-20 `probe-techov-px` 가 이 꼴로 터졌다.**
    //    크로미엄이 흰 글자를 파란 면 위에 그리면 서브픽셀 렌더링이 글자 모서리에 붉은
    //    프린지(`151,71,52` 류)를 남기고, 그 화소 몇 개가 밴드에 들어오면 합집합 상자가
    //    버튼 29px → 382px 로 늘어 `+70.31%p` 짜리 유령 불통과가 난다(실측). 원본 PNG 엔
    //    프린지가 없어 **클론에서만**, 그것도 **캡처를 다시 구운 세션에서만** 보인다.
    //    → 주석대로 진짜 '가장 큰 연결 성분'을 쓴다(`probe-fl-body`·`probe-lgr-dom` 관용구).
    const red = p => p[0] > 175 && p[1] < 90 && p[2] < 90;
    const bx1 = appL, bx2 = Math.round(appL + AW * 0.25);
    const seen = new Uint8Array(W * H);
    let backBlob = null;
    for (let y = bandTop; y <= bandBot; y++) for (let x = bx1; x <= bx2; x++) {
        const i0 = y * W + x;
        if (seen[i0] || !red(at(x, y))) continue;
        const st = [i0]; seen[i0] = 1;
        let n = 0, a = 1e9, b = -1, t = 1e9, bo = -1;
        while (st.length) {
            const i = st.pop(); n++;
            const cx = i % W, cy = (i - cx) / W;
            if (cx < a) a = cx; if (cx > b) b = cx; if (cy < t) t = cy; if (cy > bo) bo = cy;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < bx1 || nx > bx2 || ny < bandTop || ny > bandBot) continue;
                const ni = ny * W + nx;
                if (!seen[ni] && red(at(nx, ny))) { seen[ni] = 1; st.push(ni); }
            }
        }
        if (!backBlob || n > backBlob.n) backBlob = { n, x1: a, x2: b, y1: t, y2: bo };
    }
    const back = backBlob ? { x1: backBlob.x1, x2: backBlob.x2, y1: backBlob.y1, y2: backBlob.y2 } : null;
    return { W, H, appL, appR, AW, bandTop, bandBot, cells, timeTop, back };
});

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal && typeof Pets !== 'undefined', null, { timeout: 90000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 90000 });

    const ref = await page.evaluate(SCAN, 'data:image/png;base64,' + fs.readFileSync(REF_PNG).toString('base64'));

    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; UI.bossWarning = () => { }; });
    await page.evaluate(PETS_STATE_SRC);
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);

    const clone = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const R = e => { const r = e.getBoundingClientRect(); return { x: r.x - app.x, y: r.y - app.y, w: r.width, h: r.height }; };
        const vis = e => e && e.offsetParent !== null;
        const q = s => { const e = document.querySelector(s); return vis(e) ? R(e) : null; };
        return {
            app: { w: app.width, h: app.height },
            band: q('.hatchery'),
            cones: [...document.querySelectorAll('.hatchery .hatch-cone')].filter(vis).map(R),
            times: [...document.querySelectorAll('.hatchery .hatch-time')].filter(vis).map(R),
            back: q('.hatchery .hatch-back'),
            slotBuy: q('.hatchery .slot-buy'),
        };
    });
    await browser.close();

    console.log(`원본 ${ref.W}×${ref.H} · 앱 x${ref.appL}~${ref.appR}(폭 ${ref.AW}) / 클론 앱 ${clone.app.w.toFixed(1)}×${clone.app.h.toFixed(1)}`);
    console.log(`원본 밴드 y${ref.bandTop}~${ref.bandBot} · 칸 ${JSON.stringify(ref.cells)} · 타이머줄 y${ref.timeTop} · ◀ ${JSON.stringify(ref.back)}`);
    console.log(`클론 콘 ${clone.cones.length}개 · 타이머 ${clone.times.length}개`);

    const bad = [];
    if (ref.bandTop < 0 || ref.bandBot - ref.bandTop < ref.H * 0.08) bad.push('원본 부화장 밴드를 못 잡았다');
    if (ref.cells.length !== 3) bad.push(`원본 부화 칸이 3개가 아니다(${ref.cells.length}개)`);
    if (!ref.back) bad.push('원본 ◀ 버튼을 못 잡았다');
    if (!clone.band || clone.cones.length !== 3 || !clone.back) bad.push(`클론 셀렉터 실패(밴드=${!!clone.band} 콘=${clone.cones.length} ◀=${!!clone.back})`);
    if (bad.length) { console.log('\n=> 측정기 고장(exit 2): ' + bad.join(' · ')); process.exit(2); }

    const rw = v => (v / ref.AW) * 100, rh = v => (v / ref.H) * 100;
    const cw = v => (v / clone.app.w) * 100, ch = v => (v / clone.app.h) * 100;
    const rows = [];
    const add = (name, a, b) => rows.push({ name, a, b, d: b - a });
    // 🚨 밴드 자체의 세로(상단·높이)는 여기서 판정하지 않는다 — `probe-pets-dom.js` 가 042356 으로
    //    이미 판정했고(PASS), 이 컷은 밴드 **아래 테두리가 남색이 아니라** 열 스캔이 20px쯤 짧게
    //    끊긴다(같은 화면인데 042356 은 19.27%H, 이 컷 스캔은 16.89%H — 자가 다르면 판정이 거짓이 된다).
    //    여기서는 밴드 안쪽 가로 기하만 잰다. 참고로만 찍는다.
    console.log(`[미판정 참고] 밴드 원본 상단 ${rh(ref.bandTop).toFixed(2)}%H(스캔 높이 ${rh(ref.bandBot + 1 - ref.bandTop).toFixed(2)}%H) / 클론 ${ch(clone.band.y).toFixed(2)}%H·${ch(clone.band.h).toFixed(2)}%H — 세로는 probe-pets-dom 소관`);
    const rc = ref.cells.map(c => (c.x1 + c.x2) / 2 - ref.appL);
    const cc = clone.cones.map(c => c.x + c.w / 2);
    for (let i = 0; i < 3; i++) add(`${i + 1}칸 중심x`, rw(rc[i]), cw(cc[i]));
    add('칸 피치', rw((rc[2] - rc[0]) / 2), cw((cc[2] - cc[0]) / 2));
    add('빛기둥 폭', rw(ref.cells[0].x2 + 1 - ref.cells[0].x1), cw(clone.cones[0].w));
    // 타이머 글자줄은 밴드 상단 기준으로 잰다 — 밴드 세로 자체가 위 사유로 미판정이라 절대 %H 로
    // 비교하면 밴드 오차가 그대로 얹힌다.
    if (ref.timeTop > 0 && clone.times.length) add('타이머 글자(밴드상단 대비)', rh(ref.timeTop - ref.bandTop), ch(clone.times[0].y - clone.band.y));
    add('◀ 좌', rw(ref.back.x1 - ref.appL), cw(clone.back.x));
    add('◀ 폭', rw(ref.back.x2 + 1 - ref.back.x1), cw(clone.back.w));
    add('◀ 높이', rh(ref.back.y2 + 1 - ref.back.y1), ch(clone.back.h));
    add('◀ 중심y', rh((ref.back.y1 + ref.back.y2) / 2), ch(clone.back.y + clone.back.h / 2));

    console.log('\n요소별 대조 (원본 → 클론, Δ%p · 기준 ±2.0%p):');
    let fails = 0;
    for (const r of rows) {
        const ok = Math.abs(r.d) <= TOL;
        if (!ok) fails++;
        console.log(`  ${r.name.padEnd(12)} 원본 ${r.a.toFixed(2).padStart(6)}  클론 ${r.b.toFixed(2).padStart(6)}  Δ ${(r.d >= 0 ? '+' : '') + r.d.toFixed(2)}%p  ${ok ? 'OK' : 'FAIL'}`);
    }
    if (clone.slotBuy) console.log(`\n[미판정 참고] [슬롯 +1] 클론 좌 ${cw(clone.slotBuy.x).toFixed(2)}%W 폭 ${cw(clone.slotBuy.w).toFixed(2)}%W 상단 ${ch(clone.slotBuy.y).toFixed(2)}%H — 원본은 흰 글자 + ◆ 알약 2단이라 같은 상자가 아니다(머리말)`);
    console.log(`\n콘솔/페이지 에러: ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`=> 판정: ${fails === 0 && errors.length === 0 ? 'PASS' : `FAIL — 불통과 ${fails}건`}`);
    process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
})();
