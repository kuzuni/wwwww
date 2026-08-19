// 부화 슬롯 타이머 글자 크기 원본-클론 대조 — slug: ui-ratio-audit (다음 세션 착수 지점 ⓐ)
//
// 왜 별도 판정기인가: `probe-pets2-dom` 은 타이머 **줄의 y** 만 보고 **글자 크기는 아무도 안 봤다.**
// 그 사이 글자가 원본의 3/4 크기로 죽어 있었고 비평가 2인이 각각 독립으로 짚었다(A 폭 −2.74~−3.05%p ·
// B 결함 ①). 이 항목의 반복 교훈("판정기에 안 걸린 값은 조용히 어긋난다" — player-info 줄 피치 건)
// 그대로라 크기를 상시 단언하는 자를 새로 세운다.
//
// 재는 것: 원본/클론 **양쪽 PNG 를 같은 픽셀 코드로** 훑어 타이머 3칸의
//   ⑴ 흰 잉크 폭 ⑵ 흰 잉크 높이 ⑶ 1칸 중심x ⑷ 칸 피치 — 전부 **앱 폭 대비 %** (등방).
// ⚠️ DOM rect 로 재면 안 된다 — 글자 **상자**는 글리프 잉크가 아니고(줄높이·자간이 섞인다),
//    이 결함은 상자가 아니라 잉크가 작았던 건이다. 반드시 캡처 PNG 를 잰다.
// ⚠️ 외곽선(검정 테)은 폭에 안 넣는다 — `paint-order: stroke fill` 이라 흰 코어는 스트로크 굵기에
//    안 흔들리고, 원본 쪽도 흰 화소만 세면 같은 기준이 된다.
//
// 🚨 측정 함정 3개(전부 밟아 보고 막아 뒀다):
//  ⑴ 부화 패널을 '남색이 가로로 길게 이어지는 행'으로 잡으면 안 된다 — 램프·빛기둥·알이 가로 연속을
//     끊어서 패널 중간이 통째로 빠지고(원본 실측: 패널이 691~728 두 조각으로만 잡혔다) 타이머 줄이
//     패널 **밖**으로 밀려 검색조차 안 된다. 행의 남색 **개수**로 보고, 40행까지의 빈틈은 잇는다.
//  ⑵ 슬롯 **위** 비용 배지(◇51)도 '같은 폭 3덩어리'라 타이머와 똑같이 걸린다 — 타이머는 알 **아래**
//     이므로 후보 띠 중 **맨 아래**를 쓴다.
//  ⑶ 좌하단 ◀ 뒤로 버튼이 타이머와 같은 높이에 있어 그냥 묶으면 4덩어리가 된다 — '비슷한 폭 +
//     등간격' 3연속만 골라낸다. 못 고르면 수치를 **인쇄하지 않고 exit 2(측정기 고장)** 로 끊는다.
//
// 사용: node probe-pets-timer-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const REF = path.resolve(__dirname, '../ref/screens');
const CLONE = path.join(__dirname, 'ref-cmp/clone');
const PAIRS = [
    ['pets', 'shot-042356.png'],
    ['pets-2', 'shot-042445.png'],
];
const TOL = 2.0;   // ±2%p (TODO 통과 기준)

const scan = `(img) => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

    // ── 1) 부화 패널(짙은 남색 띠) — 함정 ⑴ 대비로 '개수' 기준 + 빈틈 잇기
    const isNavy = (r, g, b) => b > r + 18 && b < 130 && r < 70 && g < 80;
    const cnt = [];
    for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) { const [r, g, b] = at(x, y); if (isNavy(r, g, b)) n++; } cnt.push(n); }
    let s = -1, e = -1, best = -1, bT = -1, bB = -1;
    for (let y = 0; y < H; y++) {
        if (cnt[y] > W * 0.5) { if (s < 0) s = y; e = y; }
        else if (s >= 0 && y - e > 40) { if (e - s > best) { best = e - s; bT = s; bB = e; } s = -1; }
    }
    if (s >= 0 && e - s > best) { best = e - s; bT = s; bB = e; }
    if (bT < 0) return { err: '부화 패널을 못 찾았다' };

    // 앱 가로 범위 = 패널 행에서 남색이 가장 길게 이어지는 구간(원본 이미지 폭 ≠ 앱 폭 함정 대비)
    let appL = 0, appR = W - 1, bw = 0;
    for (let y = bT; y <= bB; y++) {
        let run = 0, st = -1;
        for (let x = 0; x < W; x++) {
            const [r, g, b] = at(x, y);
            if (isNavy(r, g, b)) { if (!run) st = x; run++; if (run > bw) { bw = run; appL = st; appR = x; } }
            else run = 0;
        }
    }
    const AW = appR - appL + 1;

    // ── 2) 타이머 줄 후보 = '비슷한 폭 + 등간격' 밝은 덩어리 3개가 나오는 연속 행
    const isLight = (r, g, b) => r > 170 && g > 170 && b > 170 && Math.max(r, g, b) - Math.min(r, g, b) <= 45;
    const groupRow = y => {
        const g = [];
        for (let x = appL; x <= appR; x++) { const [r, gg, b] = at(x, y); if (!isLight(r, gg, b)) continue;
            if (g.length && x - g[g.length - 1].e <= 20) g[g.length - 1].e = x; else g.push({ s: x, e: x }); }
        return g.filter(q => q.e - q.s + 1 >= 10);
    };
    const triple = g => {
        for (let i = 0; i + 2 < g.length; i++) {
            const t = g.slice(i, i + 3), w = t.map(q => q.e - q.s + 1);
            if (Math.max(...w) - Math.min(...w) > 8) continue;
            if (Math.abs((t[1].s - t[0].s) - (t[2].s - t[1].s)) > 4) continue;
            return t;
        }
        return null;
    };
    const bands = []; let cur = null;
    for (let y = bT; y <= bB; y++) { const g = groupRow(y); if (g.length === 3 && triple(g)) { if (!cur) { cur = { t: y, b: y }; bands.push(cur); } cur.b = y; } else cur = null; }
    if (!bands.length) return { err: '타이머 줄을 못 찾았다' };
    bands.sort((a, b) => b.t - a.t);          // 함정 ⑵ — 알 위 비용 배지 말고 맨 아래(타이머) 띠
    const band = bands[0];

    // ── 3) 띠 위아래 12행까지 넓힌 창에서 3덩어리를 확정하고 각자의 잉크 상자를 잰다 (함정 ⑶)
    const wT = Math.max(0, band.t - 12), wB = Math.min(H - 1, band.b + 12);
    const cols = [];
    for (let x = appL; x <= appR; x++) { let hit = false;
        for (let y = wT; y <= wB; y++) { const [r, g, b] = at(x, y); if (isLight(r, g, b)) { hit = true; break; } }
        if (hit) cols.push(x); }
    const gs = [];
    for (const x of cols) { if (gs.length && x - gs[gs.length - 1].e <= 20) gs[gs.length - 1].e = x; else gs.push({ s: x, e: x }); }
    const t3 = triple(gs);
    if (!t3) return { err: '타이머 3덩어리를 못 골랐다 (덩어리 ' + gs.length + '개)' };

    const boxes = t3.map(g => {
        let t = 1e9, b2 = -1, n = 0;
        for (let y = wT; y <= wB; y++) for (let x = g.s; x <= g.e; x++) { const [r, gg, bb] = at(x, y); if (isLight(r, gg, bb)) { n++; if (y < t) t = y; if (y > b2) b2 = y; } }
        return { x0: g.s, x1: g.e, w: g.e - g.s + 1, h: b2 - t + 1, yt: t, px: n };
    });
    const pc = v => +(v / AW * 100).toFixed(2);
    const avgW = boxes.reduce((a, q) => a + q.w, 0) / 3;
    return {
        px: { AW, appL, bandT: bT, timeY: boxes[0].yt, w: boxes.map(q => q.w).join('/'), h: boxes[0].h },
        m: {
            '타이머 잉크 폭': pc(avgW),
            '타이머 잉크 높이': pc(boxes[0].h),
            '1칸 타이머 중심x': pc((boxes[0].x0 + boxes[0].x1) / 2 - appL),
            '타이머 칸 피치': pc(boxes[1].x0 - boxes[0].x0)
        }
    };
}`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.setContent('<body></body>');
    const read = async file => {
        if (!fs.existsSync(file)) return { err: '파일 없음: ' + path.basename(file) };
        const url = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
        return page.evaluate(async ([src, fn]) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = src; });
            return eval('(' + fn + ')')(img);
        }, [url, scan]);
    };

    let fail = 0, broke = 0;
    for (const [name, refFile] of PAIRS) {
        const ref = await read(path.join(REF, refFile));
        const clone = await read(path.join(CLONE, name + '.png'));
        console.log(`\n── ${name}  (원본 ${refFile})`);
        if (ref.err || clone.err) {           // 측정기 고장은 수치를 인쇄하지 않고 끊는다
            console.log(`  BROKEN 원본:${ref.err || 'ok'} / 클론:${clone.err || 'ok'}`);
            broke++; continue;
        }
        console.log(`  원본 ${JSON.stringify(ref.px)}`);
        console.log(`  클론 ${JSON.stringify(clone.px)}`);
        for (const k of Object.keys(ref.m)) {
            const a = ref.m[k], b = clone.m[k], dd = +(b - a).toFixed(2), ok = Math.abs(dd) <= TOL;
            if (!ok) fail++;
            console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${k.padEnd(18)} 원본 ${String(a).padStart(6)} → 클론 ${String(b).padStart(6)}  Δ${dd > 0 ? '+' : ''}${dd}%p`);
        }
    }
    await browser.close();
    if (broke) { console.log(`\n=> BROKEN — 측정기 고장 ${broke}건 (수치 미출력)`); process.exit(2); }
    console.log(`\n=> 판정: ${fail ? `FAIL — 초과 ${fail}건` : `PASS — 전 항목 ±${TOL}%p 이내`}`);
    process.exit(fail ? 1 : 0);
})();
