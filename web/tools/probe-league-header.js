// 리그 화면 머리 블록(문장·제목·시즌 종료 바) 실측 — 원본 shot-042149 목표치와 ±2%p 대조.
// 사용: PW_PATH=<playwright> node probe-league-header.js
//
// 원본 실측(498x896, 시트 배경 rgb(14,17,27) 기준 '비배경 잉크' 행 프로파일):
//   문장(방패)   y  34~101 (3.79%H · h 7.59%H) · x 194~295 (w 20.48%W)
//   제목         y 118~139 (13.17%H · h 2.46%H)
//   시즌 종료 바  y 145~167 (16.18%H · h 2.57%H) · x 126~354 (w 45.98%W)
//   첫 행 상단   y 174      (19.42%H)
// ⚠️ 원본 랭킹 행의 **속은 시트 배경과 같은 색**이라 잉크 프로파일에서 행 안쪽이 '빈 줄'로 나온다.
//   (첫 행이 174~179 / 190~246 두 토막으로 잡힌다 — 174 가 행 상단, 190 은 행 안 내용물이다.)
//   앞 세션이 목록 상단을 21.21%H 로 적어 둔 것은 **내용물** 기준이고, 여기 19.42%H 는 행 상자 기준이다.
// ⚠️ 카드 열림 애니(cardpop scale .7)가 끝나기 전에 재면 전부 0.7배로 잡힌다 — `.opening` 을 벗기고 잰다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { SEED_SRC } = require('./shot-screens-seed.js');

const REF_H = 896, REF_W = 498;
const T = [
    // 문장은 **상자 기준**으로 대조한다 — 아이콘 캔버스 세로 0.1325~0.885 에만 그림이 있어
    // 상자 = 잉크가 아니다. 원본 잉크(x194~295 · y34~101)를 내는 상자는 102x102 이고 상단 20.5px 이다.
    ['emblemIco', '문장 상자',   197, 102,  20, 102],
    ['title',     '제목',        null, null, 118, 22],
    ['season',    '시즌 종료 바', 126, 229, 145, 23],
    ['list',      '목록 상단',    null, null, 174, null],
    // 회색 밴드 상단은 **왼쪽 가장자리 x=6 열 스캔**으로 잡았다 — y=667 부터 rgb(175,175,175).
    // ⚠️ `probe-league-px.js` 의 `grayFoot` 은 629(70.2%H)로 나오는데 **오염된 값이다**(회색 마스크가
    //   행 안의 밝은 아바타까지 잡는다). 머리 블록을 고치다 그 값을 좇으면 밴드가 2.1%p 올라간다.
    ['foot',      '회색 밴드 상단', null, null, 667, null],
    ['btn',       '[도전] 버튼',   177,  135, 739,  59],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 150000 });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 150000 });
    await page.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
    await page.evaluate(() => { UI.toast = () => { }; UI.openLeague(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelectorAll('.opening').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(300);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height }; };
        const q = s => R(document.querySelector(s));
        return {
            app: { w: app.width, h: app.height },
            emblemIco: q('.league-emblem .ico'),
            title: q('.league-title'),
            season: q('.league-season-bar'),
            list: q('.league-list .lg-row') || q('.league-list > *'),
            foot: q('.league-foot'),
            btn: q('.league-foot .btn.primary') || q('.league-foot .btn'),
        };
    });
    await browser.close();

    console.log(`클론 #app ${m.app.w.toFixed(1)}x${m.app.h.toFixed(1)} · 원본 앱 ${REF_W}x${REF_H}`);
    console.log('요소             원본x   클론x     Δ  |  원본w   클론w     Δ  |  원본y   클론y     Δ  |  원본h   클론h     Δ');
    let fail = 0;
    for (const [key, label, rx, rw, ry, rh] of T) {
        const c = m[key];
        if (!c) { console.log(`${label.padEnd(14)} — 클론에 없음`); fail++; continue; }
        const cells = []; let bad = false;
        for (const [refPx, cloPx, denom] of [[rx, c.x, REF_W], [rw, c.w, REF_W], [ry, c.y, REF_H], [rh, c.h, REF_H]]) {
            if (refPx === null) { cells.push('        —         '.padEnd(22)); continue; }
            const cd = denom === REF_W ? m.app.w : m.app.h;
            const r = refPx / denom * 100, cl = cloPx / cd * 100, dd = cl - r;
            if (Math.abs(dd) > 2) bad = true;
            cells.push(`${r.toFixed(2).padStart(6)} ${cl.toFixed(2).padStart(7)} ${(dd >= 0 ? '+' : '') + dd.toFixed(2)}`.padEnd(22));
        }
        if (bad) fail++;
        console.log(`${label.padEnd(14)} ${cells.join('| ')} ${bad ? '  ✗' : ''}`);
    }
    console.log(fail ? `판정: FAIL — ±2%p 초과 ${fail}건` : '판정: PASS — 전 요소 ±2%p 이내');
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
})();
