// 아이콘 '화풍'을 수치로 잰다 — 키라인 두께 / 키라인 검정도 / 팔레트 채도·명도.
//
// 왜 필요한가: 아이콘 채점에서 비평가가 "키라인이 3배 두껍다", "채도가 낮다"처럼 **화풍을
// 수치로 지적**하는데, 합성 이미지(원본은 확대·클론은 축소)에서 재면 보간 차이 때문에 두께가
// 그대로 어긋나 보인다. 그래서 **양쪽을 각자의 native 해상도(499px 폭)에서** 재야 한다.
// TODO '비평가 채점 함정'이 요구하는 교차검증 도구.
//
// 방법: 탭바 밴드에서 셀별로 아이콘 잉크를 찾고,
//   ① 키라인 두께 = 잉크 경계에서 안쪽으로 들어갈 때 '거의 검정'인 픽셀의 연속 길이(행별 중앙값)
//   ② 키라인 검정도 = 그 픽셀들의 평균 RGB
//   ③ 팔레트 = 잉크 중 '거의 검정'이 아닌 픽셀의 HSV 평균·최대채도, 순백/순검정 픽셀 비율
// 사용: node probe-icon-style.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const fs = require('fs');
const REF = path.resolve(__dirname, '../ref/screens/shot-042120.png');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const VW = 499, VH = 892;

// 페이지 안에서 돌 측정 함수(문자열로 주입) — 원본/클론에 완전히 같은 코드를 쓴다.
const MEASURE = function (data, W, y0, y1, cells) {
    const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const rgb2hsv = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0;
        if (d) {
            if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
            else if (mx === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return [h, mx ? d / mx : 0, mx];
    };
    const out = [];
    for (let c = 0; c < cells; c++) {
        const cx0 = Math.round((c * W) / cells), cx1 = Math.round(((c + 1) * W) / cells);
        const freq = {};
        for (let x = cx0; x < cx1; x++) for (const y of [y0, y0 + 1, y1 - 2, y1 - 1]) { const k = at(x, y).join(','); freq[k] = (freq[k] || 0) + 1; }
        for (let y = y0; y < y1; y++) for (const x of [cx0, cx0 + 1, cx1 - 2, cx1 - 1]) { const k = at(x, y).join(','); freq[k] = (freq[k] || 0) + 1; }
        const bg = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0].split(',').map(Number);
        const isInk = (x, y) => { const p = at(x, y); return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 40; };
        // '거의 검정' = 세 채널 모두 낮음. 배경이 이미 어두우면(#0e111b 계열) 배경과 구분되도록
        // 배경보다 더 어둡거나 같은 수준인 픽셀만 센다.
        const isKey = (x, y) => { const p = at(x, y); return p[0] < 46 && p[1] < 46 && p[2] < 46; };

        const keyRuns = [];       // 잉크 왼쪽/오른쪽 경계에서 안쪽으로 이어지는 검정 길이
        const keyPx = [];
        const colors = [];
        let whitePx = 0, blackPx = 0, inkPx = 0;
        for (let y = y0; y < y1; y++) {
            let rowInk = 0;
            for (let x = cx0; x < cx1; x++) if (isInk(x, y)) rowInk++;
            if (!rowInk || rowInk > (cx1 - cx0) * 0.8) continue;   // 빈 행·구조선 제외
            let L = -1, R = -1;
            for (let x = cx0; x < cx1; x++) if (isInk(x, y)) { if (L < 0) L = x; R = x; }
            for (const [start, dir] of [[L, 1], [R, -1]]) {
                let n = 0, x = start;
                while (x >= cx0 && x < cx1 && isKey(x, y)) { n++; x += dir; }
                if (n > 0) keyRuns.push(n);
            }
            for (let x = L; x <= R; x++) {
                if (!isInk(x, y)) continue;
                inkPx++;
                const p = at(x, y);
                if (isKey(x, y)) { keyPx.push(p); if (p[0] < 12 && p[1] < 12 && p[2] < 12) blackPx++; continue; }
                if (p[0] > 246 && p[1] > 246 && p[2] > 246) whitePx++;
                colors.push(rgb2hsv(p[0], p[1], p[2]));
            }
        }
        keyRuns.sort((a, b) => a - b);
        const med = keyRuns.length ? keyRuns[Math.floor(keyRuns.length / 2)] : 0;
        const avg = (arr, i) => arr.length ? arr.reduce((a, v) => a + v[i], 0) / arr.length : 0;
        const sat = colors.map(c => c[1]).sort((a, b) => b - a);
        out.push({
            keyMedian: med,
            keyRGB: keyPx.length ? [Math.round(avg(keyPx, 0)), Math.round(avg(keyPx, 1)), Math.round(avg(keyPx, 2))] : null,
            satAvg: +(avg(colors, 1)).toFixed(3),
            satTop10: +(sat.slice(0, Math.max(1, Math.round(sat.length * 0.1))).reduce((a, v) => a + v, 0) / Math.max(1, Math.round(sat.length * 0.1))).toFixed(3),
            valAvg: +(avg(colors, 2) / 255).toFixed(3),
            purePureWhitePct: inkPx ? +((whitePx / inkPx) * 100).toFixed(2) : 0,
            pureBlackPct: inkPx ? +((blackPx / inkPx) * 100).toFixed(2) : 0,
            inkPx,
        });
    }
    return out;
};

const inPage = async (page, src, y0, y1, cells) => page.evaluate(async ([s, code, a, b, n]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = s; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data;
    const m = new Function('return ' + code)();
    return { W: img.width, H: img.height, cells: m(d, img.width, a === null ? 0 : a, b === null ? img.height : b, n) };
}, [src, MEASURE.toString(), y0, y1, cells]);

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    await page.setContent('<div></div>');
    const ref = await inPage(page, 'data:image/png;base64,' + fs.readFileSync(REF).toString('base64'), 808, 889, 5);

    // 클론은 **native 해상도(deviceScaleFactor 1)** 로 찍어야 원본과 같은 기준이 된다.
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined"');   // waitForFunction 은 3D 포화 구간에서 기아 타임아웃(wait-ready.js 헤더 ②)
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () { }; if (typeof Combat !== 'undefined') Combat.tick = function () { }; });
    await page.waitForTimeout(400);
    await page.addStyleTag({ content: '#tabbar button span{visibility:hidden!important}' });
    const bar = await page.evaluate(() => {
        const b = document.getElementById('tabbar').getBoundingClientRect();
        return { y: b.top, h: b.height, tabs: [...document.querySelectorAll('#tabbar button')].map(x => x.dataset.tab) };
    });
    const shot = await page.screenshot({ clip: { x: 0, y: bar.y, width: VW, height: bar.h } });
    // 🚨 칸 수는 **DOM 의 버튼 수에서 읽는다.** 4 로 박아 두면(탭이 4개이던 시절의 값) 6버튼 탭바를
    //    4등분해 **칸마다 아이콘 1.5개**를 한 덩어리로 재고, 그 덩어리에 낀 배경까지 잉크로 세서
    //    '순검정 비율이 원본의 절반'·'잉크가 1.5배' 같은 유령 수치가 나온다(실측으로 확인).
    const clone = await inPage(page, 'data:image/png;base64,' + shot.toString('base64'), null, null, bar.tabs.length);
    await browser.close();

    const REFN = ['해골+단검', '방(삭제)', '소환', '방패깃발(폐기)', '상점'];
    const LABEL = { pvp: 'PVP', dungeon: '던전', summon: '소환', quest: '퀘스트', shop: '상점', debug: '디버그' };
    const CLN = bar.tabs.map(t => LABEL[t] || t);
    // 원본↔클론 짝. `pvp-dungeon-icon-swap`(2026-08-19) 이후 **해골+단검 그림이 PVP 칸으로 옮겨졌다.**
    // 던전은 원본 1번 칸('방', 삭제된 탭)의 아치문을 그대로 옮겨 그린 것이라 그 칸이 짝이다.
    // 짝이 없는 칸은 퀘스트(두루마리)·디버그(무당벌레) 둘뿐 — 원본에 대응 그림이 아예 없다.
    const PAIR = { pvp: 0, dungeon: 1, summon: 2, shop: 4 };
    const row = (n, c) => `  ${n.padEnd(9)} 키라인 ${String(c.keyMedian).padStart(2)}px ${c.keyRGB ? 'rgb(' + c.keyRGB.join(',') + ')' : '없음'}` +
        ` · 채도 평균 ${c.satAvg} 상위10% ${c.satTop10} · 명도 ${c.valAvg}` +
        ` · 순백 ${c.purePureWhitePct}% 순검정 ${c.pureBlackPct}% · 잉크 ${c.inkPx}px`;
    console.log(`원본 (shot-042120 native 499px 폭, 탭바 y808~889):`);
    ref.cells.forEach((c, i) => console.log(row(REFN[i], c)));
    console.log(`\n클론 (native 499px 폭 캡처):`);
    clone.cells.forEach((c, i) => console.log(row(CLN[i], c)));

    // 요약은 **짝이 있는 칸끼리만** 평균낸다. 짝 없는 칸(던전·퀘스트·디버그)을 섞으면
    // 원본에 없는 그림의 화풍이 평균을 흔들어 '원본과 얼마나 다른가'가 안 나온다.
    const mean = (arr, k) => +(arr.reduce((a, c) => a + c[k], 0) / arr.length).toFixed(3);
    const pairs = Object.entries(PAIR)
        .map(([tab, ri]) => ({ tab, r: ref.cells[ri], c: clone.cells[bar.tabs.indexOf(tab)] }))
        .filter(p => p.r && p.c);
    console.log(`\n짝 있는 ${pairs.length}칸 대조 (원본 → 클론):`);
    for (const k of ['keyMedian', 'satAvg', 'satTop10', 'valAvg', 'purePureWhitePct', 'pureBlackPct', 'inkPx']) {
        const rv = mean(pairs.map(p => p.r), k), cv = mean(pairs.map(p => p.c), k);
        const per = pairs.map(p => `${LABEL[p.tab]} ${p.r[k]}→${p.c[k]}`).join(' · ');
        console.log(`  ${k.padEnd(17)} 평균 ${rv} → ${cv}   [${per}]`);
    }
})();
