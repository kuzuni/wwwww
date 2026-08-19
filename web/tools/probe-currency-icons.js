// 상단바 재화 아이콘(코인·젬 + 초록 `+` 배지)을 원본과 **같은 기준**으로 잰다.
//
// 왜 따로 있나: `probe-icon-style.js` 는 탭바 밴드 전용이다. 재화 아이콘은 표시 크기가 24px 로
// 탭바(53px)의 절반이라 **화풍 규약이 다르다** — 같은 키라인 비율을 쓰면 여기서는 1px 미만이
// 되어 축소 보간에 녹는다. 그래서 이 화면만의 실측치가 따로 필요하다.
//
// 재는 것: ① 잉크 bbox(%W×%H, ±2%p 판정) ② 키라인 두께(경계에서 이어지는 '거의 검정' 길이)
//         ③ 키라인 평균색 ④ 채움 채도 ⑤ 순검정 비율.
// ⚠️ 양쪽 다 **native 499px 폭**에서 잰다(확대 합성본에서 재면 보간 차로 두께가 어긋나 보인다).
// 사용: node probe-currency-icons.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const REF = path.resolve(__dirname, '../ref/screens/shot-042120.png');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const VW = 499, VH = 892, BOX = 40;

// 원본 코인·젬 중심(shot-042120 실측). 배지까지 한 덩어리로 재려면 중심에서 ±BOX/2 를 본다.
const REF_AT = { coin: { x: 312, y: 30 }, gem: { x: 407, y: 30 } };

const MEASURE = function (data, W, cx, cy, box, bgHint) {
    const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const x0 = Math.round(cx - box / 2), x1 = Math.round(cx + box / 2);
    const y0 = Math.round(cy - box / 2), y1 = Math.round(cy + box / 2);
    // 배경은 상자 테두리 최빈색. ⚠️ 재화 pill 은 **어두운 알약 위에 얹혀** 있어서 배경이 두 가지다
    // (필드색 + pill 색). 한 색만 배경으로 잡으면 pill 면이 통째로 잉크가 되어 bbox 가 오른쪽으로
    // 번진다 — 그래서 테두리 최빈 2색을 다 배경으로 본다(bgHint 로 pill 색을 하나 더 준다).
    const freq = {};
    for (let x = x0; x < x1; x++) for (const y of [y0, y0 + 1, y1 - 2, y1 - 1]) { const k = at(x, y).join(','); freq[k] = (freq[k] || 0) + 1; }
    for (let y = y0; y < y1; y++) for (const x of [x0, x0 + 1, x1 - 2, x1 - 1]) { const k = at(x, y).join(','); freq[k] = (freq[k] || 0) + 1; }
    const bgs = Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 2).map(k => k.split(',').map(Number));
    if (bgHint) bgs.push(bgHint);
    const near = (p, q, t) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) <= t;
    // 🚨 **허용치를 60 으로 두면 원본에서 키라인이 통째로 사라진다(실제로 밟았다).**
    //    원본 pill 바탕은 `rgb(2,25,14)` 인 짙은 초록이라 **순검정과의 L1 거리가 41 밖에 안 된다** —
    //    60 이면 검정 픽셀이 전부 '배경'으로 분류돼 `키라인 0px · 순검정 0%` 라는, 원본에 키라인이
    //    없다는 뜻의 유령 수치가 나온다(원본은 육안으로 가장 두꺼운 검정 테를 가진 아이콘이다).
    //    26 이면 검정(41)은 잉크로 남고 바탕 픽셀(0)은 배경으로 빠진다.
    const isInk = (x, y) => { const p = at(x, y); return !bgs.some(b => near(p, b, 26)); };
    const isKey = (x, y) => { const p = at(x, y); return p[0] < 46 && p[1] < 46 && p[2] < 46; };

    let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1, inkPx = 0, blackPx = 0;
    const keyRuns = [], keyPx = [], sats = [];
    for (let y = y0; y < y1; y++) {
        let L = -1, R = -1;
        for (let x = x0; x < x1; x++) if (isInk(x, y)) { if (L < 0) L = x; R = x; }
        if (L < 0) continue;
        if (L < bx0) bx0 = L; if (R > bx1) bx1 = R;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
        for (const [start, dir] of [[L, 1], [R, -1]]) {
            let n = 0, x = start;
            while (x >= x0 && x < x1 && isKey(x, y)) { n++; x += dir; }
            if (n > 0) keyRuns.push(n);
        }
        for (let x = L; x <= R; x++) {
            if (!isInk(x, y)) continue;
            inkPx++;
            const p = at(x, y);
            if (isKey(x, y)) { keyPx.push(p); if (p[0] < 12 && p[1] < 12 && p[2] < 12) blackPx++; continue; }
            const mx = Math.max(p[0], p[1], p[2]), mn = Math.min(p[0], p[1], p[2]);
            sats.push(mx ? (mx - mn) / mx : 0);
        }
    }
    keyRuns.sort((a, b) => a - b);
    const avg = (arr, i) => arr.length ? arr.reduce((a, v) => a + (i === undefined ? v : v[i]), 0) / arr.length : 0;
    return {
        w: bx1 - bx0 + 1, h: by1 - by0 + 1, inkPx,
        keyMedian: keyRuns.length ? keyRuns[Math.floor(keyRuns.length / 2)] : 0,
        keyRGB: keyPx.length ? [0, 1, 2].map(i => Math.round(avg(keyPx, i))) : null,
        satAvg: +avg(sats).toFixed(3),
        pureBlackPct: inkPx ? +((blackPx / inkPx) * 100).toFixed(2) : 0,
    };
};

const inPage = (page, src, cx, cy, bgHint) => page.evaluate(async ([s, code, a, b, box, hint]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = s; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    return (new Function('return ' + code)())(d, img.width, a, b, box, hint);
}, [src, MEASURE.toString(), cx, cy, BOX, bgHint]);

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

    await page.setContent('<div></div>');
    const refSrc = 'data:image/png;base64,' + fs.readFileSync(REF).toString('base64');
    const ref = {};
    for (const k of ['coin', 'gem']) ref[k] = await inPage(page, refSrc, REF_AT[k].x, REF_AT[k].y, [2, 25, 14]);

    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined"');
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () { }; if (typeof Combat !== 'undefined') Combat.tick = function () { }; });
    await page.waitForTimeout(400);
    const at = await page.evaluate(() => {
        const o = {};
        for (const k of ['coin', 'gem']) {
            const b = document.querySelector(`.currency-pills .pill.${k} .ico`).getBoundingClientRect();
            o[k] = { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b.width };
        }
        return o;
    });
    const shot = 'data:image/png;base64,' + (await page.screenshot({ clip: { x: 0, y: 0, width: VW, height: 80 } })).toString('base64');
    const clone = {};
    for (const k of ['coin', 'gem']) clone[k] = await inPage(page, shot, at[k].x, at[k].y, null);
    await browser.close();

    const pctW = v => (v / VW) * 100, pctH = v => (v / VH) * 100;
    let fail = 0;
    console.log(`재화 아이콘 화풍 대조 (양쪽 native ${VW}px 폭 · 아이콘 중심 ±${BOX / 2}px 상자)\n`);
    for (const k of ['coin', 'gem']) {
        const r = ref[k], c = clone[k];
        const dw = pctW(c.w) - pctW(r.w), dh = pctH(c.h) - pctH(r.h);
        const ok = Math.abs(dw) <= 2 && Math.abs(dh) <= 2;
        if (!ok) fail++;
        console.log(`  ${k}`);
        console.log(`    잉크 bbox  원본 ${pctW(r.w).toFixed(2)}×${pctH(r.h).toFixed(2)} (${r.w}×${r.h}px)` +
            ` → 클론 ${pctW(c.w).toFixed(2)}×${pctH(c.h).toFixed(2)} (${c.w}×${c.h}px)` +
            `  Δ ${dw >= 0 ? '+' : ''}${dw.toFixed(2)} / ${dh >= 0 ? '+' : ''}${dh.toFixed(2)}%p  ${ok ? 'OK' : 'FAIL'}`);
        console.log(`    키라인     원본 ${r.keyMedian}px rgb(${r.keyRGB}) → 클론 ${c.keyMedian}px rgb(${c.keyRGB})`);
        console.log(`    채움 채도  원본 ${r.satAvg} → 클론 ${c.satAvg}   · 순검정 원본 ${r.pureBlackPct}% → 클론 ${c.pureBlackPct}%`);
    }
    console.log(`\n콘솔/페이지 에러: ${errs.length}건`);
    if (errs.length) { fail++; errs.slice(0, 5).forEach(e => console.log('  ' + e)); }
    console.log(fail ? `\n=> FAIL ${fail}건` : '\n=> PASS');
    process.exit(fail ? 1 : 0);
})();
