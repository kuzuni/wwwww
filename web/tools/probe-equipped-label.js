// '장착됨' 흰 깃발(`.equipped-label`) 판정기 — 원본 PNG 스캔 + 클론 DOM 실측을 **한 런에서**.
//
// 왜 새로 만드나: `probe-pets-dom` 은 **장착됨 '바'**(`.equipped-row`)만 재고 그 위에 얹힌
// **흰 깃발 라벨 자체**는 아무 판정기도 안 봤다. 그래서 2026-08-19 R4 채점에서 비평가 2인이
// **독립적으로 같은 결함**(깃발이 좁다 + 바 위로 떠 있다)을 pets·pets-2 양쪽에서 짚을 때까지
// 전수 스윕은 조용히 초록이었다. `probe-pinfo-px` 의 '6칸 누적'과 같은 계열의 사각지대다.
//
// 재는 것(원본 = 흰 화소, 클론 = DOM rect):
//   ⓐ 깃발 폭(%AW)  ⓑ 깃발 좌단(%AW)  ⓒ 깃발 높이(%H)
//   ⓓ 깃발 중심 − 바 중심(%H, 부호 있음)  ← 원본은 거의 0(바에 세로 중앙), 음수면 위로 이탈
// ⓓ 를 '바 중심 기준'으로 잡은 이유: 절대 y 로 재면 바 자체가 몇 %p 어긋난 화면에서
//    깃발이 바에 정상 정렬돼 있어도 불통과가 난다. 이 판정기가 보려는 건 **바 안에서의 정렬**이다.
//
// 🚨 원본 스캔 함정(둘 다 밟았다, 남긴다):
//  ⑴ **펫 시트 바탕이 흰색이다** — 바 왼쪽/위쪽의 배경이 깃발과 같은 흰색이라, 창을 안 씌우고
//     '왼쪽 절반의 최장 흰 런'으로 찾으면 배경을 깃발로 문다(첫 판에서 폭이 앱 폭의 50%로 나왔다).
//     그래서 **바 좌단을 먼저 찾고**(깃발이 없는 바 아래쪽 행에서) 그 언저리로 창을 좁힌다.
//  ⑵ 깃발 아래쪽 바 안쪽 행에도 바 **왼쪽 배경**이 흰 런으로 잡힌다 — 창이 이것도 막는다.
//
// 🚨 자기검증: 원본 깃발은 ⑴ 폭이 바 폭의 15~45% ⑵ 높이가 바 높이의 25~75% ⑶ 좌단이 바 좌단
//    ±5%AW 안. 어긋나면 수치를 인쇄하지 않고 exit 2(측정기 고장)로 끊는다.
//
// 사용: node tools/probe-equipped-label.js              (원본 042356 pets)
//       REF=042445 node tools/probe-equipped-label.js   (pets-2 컷으로 교차검증)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_ID = process.env.REF || '042356';
const REF_PNG = path.resolve(__dirname, `../ref/screens/shot-${REF_ID}.png`);
const TOL = 2.0;

const SCAN_REF = function (src) {
    return new Promise(async (resolve) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const white = p => p[0] > 232 && p[1] > 232 && p[2] > 232;
        const dark = p => p[0] < 70 && p[1] < 70 && p[2] < 70;

        // 앱 좌우 끝 — 맨 아래 행에서 여백(거의 검정) 아닌 최장 구간
        const yBot = H - 3;
        let appL = 0, appR = W - 1, best = null, r = -1;
        for (let x = 0; x <= W; x++) {
            const p = x < W ? at(x, yBot) : null;
            const on = !!p && p[0] + p[1] + p[2] > 40;
            if (on && r < 0) r = x;
            if (!on && r >= 0) { if (!best || x - r > best[1] - best[0]) best = [r, x - 1]; r = -1; }
        }
        if (best) { appL = best[0]; appR = best[1]; }
        const AW = appR - appL + 1;

        // ── 장착됨 '바' 세로 범위 — 앱 가로 중앙 열의 첫 어두운 런(깃발은 왼쪽이라 안 걸린다)
        const xMid = appL + Math.round(AW * 0.5);
        const bars = [];
        {
            let s = -1;
            for (let y = Math.floor(H * 0.35); y <= Math.floor(H * 0.68); y++) {
                const on = dark(at(xMid, y));
                if (on && s < 0) s = y;
                if (!on && s >= 0) { if (y - s >= 20) bars.push([s, y - 1]); s = -1; }
            }
        }
        const bar = bars[0] || null;
        if (!bar) return resolve({ W, H, appL, appR, AW, bar: null, flag: null });

        // ── 바 좌우 끝 — **깃발이 없는 아래쪽 행**에서 어두운 최장 구간으로 잡는다
        //    (깃발 행에서 재면 깃발이 바를 좌우로 갈라 반쪽만 잡힌다)
        let barL = null, barR = null;
        {
            const yb = bar[1] - 4;
            let b2 = null, s = -1;
            for (let x = appL; x <= appR + 1; x++) {
                const on = x <= appR && dark(at(x, yb));
                if (on && s < 0) s = x;
                if (!on && s >= 0) { if (!b2 || x - s > b2[1] - b2[0]) b2 = [s, x - 1]; s = -1; }
            }
            if (b2) { barL = b2[0]; barR = b2[1]; }
        }
        if (barL == null) return resolve({ W, H, appL, appR, AW, bar, barL, barR, flag: null });
        const barW = barR - barL + 1;

        // ── 흰 깃발 — 바 좌단 언저리로 창을 좁혀 배경을 배제한다(함정 ⑴⑵)
        // 창 왼쪽 끝은 **바 안쪽**(barL+2)에서 시작한다 — 바 왼쪽 배경(흰색)을 아예 안 보게 한다.
        const winL = Math.min(appR, barL + 2);
        const winR = Math.min(appR, barL + Math.round(barW * 0.45));   // 0.6 이면 오른쪽 Lv 배지의 흰 글자를 문다(밟았다)
        // 🚨 '최장 흰 런'으로 재면 안 된다 — 깃발 안의 검은 '장착됨' 글자가 흰 띠를 토막 내서
        //    글자 있는 행이 통째로 떨어져 나가고 깃발 높이가 1/5 로 나온다(밟았다).
        //    창 안 흰 화소의 **개수 + min/max x** 로 재면 글자 사이 공백이 메워진다.
        const rowRun = y => {
            let n = 0, lo = Infinity, hi = -1;
            for (let x = winL; x <= winR; x++) {
                if (white(at(x, y))) { n++; if (x < lo) lo = x; if (x > hi) hi = x; }
            }
            return n >= 25 ? [lo, hi] : null;
        };
        const seed = [];
        for (let y = bar[0] + 3; y <= bar[1] - 3; y++) { const rr = rowRun(y); if (rr) seed.push({ y, a: rr[0], b: rr[1] }); }
        if (!seed.length) return resolve({ W, H, appL, appR, AW, bar, barL, barR, flag: null });
        const groups = [];
        for (const row of seed) {
            const g = groups[groups.length - 1];
            if (g && row.y <= g.y1 + 2) { g.y1 = row.y; g.rows.push(row); }
            else groups.push({ y0: row.y, y1: row.y, rows: [row] });
        }
        groups.sort((p, q) => (q.y1 - q.y0) - (p.y1 - p.y0));
        const g = groups[0];
        // 좌단 — 창을 바 안쪽에서 시작했으므로 깃발의 진짜 왼쪽 끝은 창 밖일 수 있다.
        // 글자가 없는 행(깃발 위 2px)에서 흰 화소를 왼쪽으로 따라가 검정 키라인에서 멈춘다.
        let l = Math.min(...g.rows.map(v => v.a));
        {
            const yProbe = Math.min(g.y1, g.y0 + 2);
            for (let x = l - 1; x >= appL && white(at(x, yProbe)); x--) l = x;
        }
        const flag = { top: g.y0, bot: g.y1, l, rr: Math.max(...g.rows.map(v => v.b)) };
        resolve({ W, H, appL, appR, AW, bar, barL, barR, flag });
    });
};

const MEASURE_CLONE = () => {
    const R = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const row = document.querySelector('#panel-pets .equipped-row');
    const lab = document.querySelector('#panel-pets .equipped-label');
    if (!row || !lab) return { err: '장착됨 바/라벨을 못 찾았다' };
    const ar = document.getElementById('app').getBoundingClientRect();
    // 🚨 원본은 **흰 화소**로 재는데 `getBoundingClientRect()` 는 검정 키라인(테두리)까지 포함한다 —
    //    그대로 비교하면 테두리 두 겹(≈6px ≈ 1.2%AW)만큼 클론이 넓게 잡혀 결함이 축소된다.
    //    흰 바탕이 차지하는 건 패딩+콘텐츠 상자이므로 테두리를 빼고 같은 자로 맞춘다.
    const cs = getComputedStyle(lab);
    const bl = parseFloat(cs.borderLeftWidth) || 0, br = parseFloat(cs.borderRightWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth) || 0, bb = parseFloat(cs.borderBottomWidth) || 0;
    const lr = R(lab);
    const ink = { x: lr.x + bl, y: lr.y + bt, w: lr.w - bl - br, h: lr.h - bt - bb };
    return { bar: R(row), label: ink, app: { x: ar.x, w: ar.width, h: ar.height } };
};

(async () => {
    if (!fs.existsSync(REF_PNG)) { console.log(`원본 컷이 없다: ${REF_PNG}`); process.exit(2); }
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    // 뷰포트는 원본 컷과 같은 크기로 — probe-pets-dom 과 같은 규약(다르면 rem 반올림이 갈린다)
    const refDim = { '042356': [490, 882], '042445': [490, 876] }[REF_ID] || [490, 882];
    const page = await browser.newPage({ viewport: { width: refDim[0], height: refDim[1] }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('CONSOLE ' + m.text()); });

    const ref = await page.evaluate(SCAN_REF, 'data:image/png;base64,' + fs.readFileSync(REF_PNG).toString('base64'));

    const broken = [];
    if (!ref.bar) broken.push('원본에서 장착됨 바를 못 잡았다');
    else if (ref.barL == null) broken.push('원본에서 바 좌우 끝을 못 잡았다');
    else if (!ref.flag) broken.push('원본에서 흰 깃발을 못 잡았다');
    else {
        const barH = ref.bar[1] - ref.bar[0] + 1, barW = ref.barR - ref.barL + 1;
        const fw = ref.flag.rr - ref.flag.l + 1, fh = ref.flag.bot - ref.flag.top + 1;
        if (!(fw / barW >= 0.15 && fw / barW <= 0.45)) broken.push(`깃발 폭이 바 폭의 ${(fw / barW * 100).toFixed(0)}% 다(15~45% 밖)`);
        if (!(fh / barH >= 0.25 && fh / barH <= 0.75)) broken.push(`깃발 높이가 바 높이의 ${(fh / barH * 100).toFixed(0)}% 다(25~75% 밖)`);
        if (Math.abs(ref.flag.l - ref.barL) / ref.AW > 0.05) broken.push(`깃발 좌단이 바 좌단에서 ${((ref.flag.l - ref.barL) / ref.AW * 100).toFixed(1)}%AW 떨어져 있다(±5% 밖)`);
    }
    if (broken.length) {
        console.log(`측정기 고장(BROKEN) — 수치를 인쇄하지 않는다:\n  · ${broken.join('\n  · ')}`);
        await browser.close(); process.exit(2);
    }

    // 클론 — probe-pets-dom 과 **같은 순서**로 띄운다(`PETS_STATE_SRC` 가 펫 화면까지 연다).
    // `UI.els` 까지 기다리는 이유: `UI` 는 선언 즉시 보이지만 `els` 는 `UI.init()` 안에서야 생긴다.
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!UI.els && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(PETS_STATE_SRC);
    // 🚨 폰트가 안 붙은 프레임에서 재면 글자 폭이 달라져 런마다 수치가 바뀐다(probe-pets-dom 판례).
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const clone = await page.evaluate(MEASURE_CLONE);
    if (clone.err) { console.log('측정기 고장(BROKEN) — ' + clone.err); await browser.close(); process.exit(2); }
    await browser.close();

    const rw = px => px / ref.AW * 100, rh = px => px / ref.H * 100;
    const cw = px => px / clone.app.w * 100, ch = px => px / clone.app.h * 100;
    const rows = [
        ['깃발 폭', rw(ref.flag.rr - ref.flag.l + 1), cw(clone.label.w)],
        ['깃발 좌단', rw(ref.flag.l - ref.appL), cw(clone.label.x - clone.app.x)],
        ['깃발 높이', rh(ref.flag.bot - ref.flag.top + 1), ch(clone.label.h)],
        ['깃발중심−바중심', rh((ref.flag.top + ref.flag.bot) / 2 - (ref.bar[0] + ref.bar[1]) / 2),
            ch((clone.label.y + clone.label.h / 2) - (clone.bar.y + clone.bar.h / 2))],
    ];

    console.log(`원본 ${REF_ID} ${ref.W}x${ref.H} 앱 ${ref.appL}~${ref.appR} · 바 y${ref.bar[0]}~${ref.bar[1]} x${ref.barL}~${ref.barR} · 깃발 y${ref.flag.top}~${ref.flag.bot} x${ref.flag.l}~${ref.flag.rr}`);
    let over = 0, max = 0;
    for (const [name, a, b] of rows) {
        const dd = b - a;
        if (Math.abs(dd) > Math.abs(max)) max = dd;
        const bad = Math.abs(dd) > TOL;
        if (bad) over++;
        console.log(`  ${bad ? '✗' : '·'} ${name.padEnd(16)} 원본 ${a.toFixed(2)}  클론 ${b.toFixed(2)}  Δ${dd >= 0 ? '+' : ''}${dd.toFixed(2)}%p${bad ? '  ← ±2%p 초과' : ''}`);
    }
    if (errors.length) console.log('콘솔 에러:\n' + errors.join('\n'));
    console.log(`\n판정: ${over === 0 && !errors.length ? '통과' : '불통과'} — 초과 ${over}건 · 최대 편차 ${max >= 0 ? '+' : ''}${max.toFixed(2)}%p · 콘솔 에러 ${errors.length}건`);
    process.exit(over === 0 && !errors.length ? 0 : 1);
})();
