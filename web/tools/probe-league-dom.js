// 리그 화면 DOM 실측 — 비율 전수 검증 패스(TODO ②)에서 league(shot-042149)를 판정/교정할 때 쓴다.
// 픽셀 스캔(probe-segments.js)이 '원본 몇 %H에 무엇이 있나'를 주고, 이 도구가 클론 쪽 목표값을 rect로 준다.
// 사용: PW_PATH=... node probe-league-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SC = require('./shot-screens-seed.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 150000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 150000 });
    // ⚠️ 팝업 열림 애니메이션(scale .7→1)을 아예 끈다. 헤드리스에서는 페이지가 쉬는 동안 CSS 애니메이션이
    //    스로틀링돼 1200ms를 기다려도 카드가 중간 프레임(scale≈.69)에 멈춰 있다 — 실제로 밟은 함정이다:
    //    rect 42px vs computed height 60.5px(=0.694배)로 어긋나 모든 %가 0.7배로 나온다.
    //    기다리는 대신 애니메이션/트랜지션을 무효화해 rect == 레이아웃값이 되게 한다.
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => UI.openLeague());
    await page.waitForTimeout(400);
    const out = await page.evaluate(() => {
        // ⚠️ #app 은 fitLayout 이 transform: scale 로 레터박스한다 — 기준을 #app rect로 통일한다.
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +((r.x - app.x) / W * 100).toFixed(2), y: +((r.y - app.y) / H * 100).toFixed(2), w: +(r.width / W * 100).toFixed(2), h: +(r.height / H * 100).toFixed(2), bot: +((r.bottom - app.y) / H * 100).toFixed(2), px: `${Math.round(r.width)}x${Math.round(r.height)}` }; };
        const rows = [...document.querySelectorAll('.league-list .league-row')];
        const list = document.querySelector('.league-list');
        const btn = document.querySelector('.league-actions .btn.primary');
        return {
            appRect: [+W.toFixed(1), +H.toFixed(1)],
            rootFont: getComputedStyle(document.documentElement).fontSize,
            sheet: R(document.querySelector('.league-sheet')),
            sheetBg: getComputedStyle(document.querySelector('.league-sheet')).backgroundColor,
            emblem: R(document.querySelector('.league-emblem')),
            title: R(document.querySelector('.league-title')),
            seasonBar: R(document.querySelector('.league-season-bar')),
            list: R(list),
            listScroll: list ? { sh: list.scrollHeight, ch: list.clientHeight } : null,
            rowN: rows.length,
            row0: R(rows[0]), row1: R(rows[1]), rowLast: R(rows[rows.length - 1]),
            rowPitch: rows.length > 1 ? +(((rows[1].getBoundingClientRect().y - rows[0].getBoundingClientRect().y) / H * 100).toFixed(2)) : null,
            rowBg: rows.slice(0, 2).map(r => getComputedStyle(r).backgroundColor),
            rowPad: rows[0] ? getComputedStyle(rows[0]).padding : null,
            rankColor: rows[0] ? getComputedStyle(rows[0].querySelector('.league-rank')).color : null,
            foot: R(document.querySelector('.league-foot')),
            footBg: getComputedStyle(document.querySelector('.league-foot')).backgroundColor,
            pinned: R(document.querySelector('.league-pinned .league-row')),
            actions: R(document.querySelector('.league-actions')),
            btn: R(btn),
            btnStyle: btn ? { minH: getComputedStyle(btn).minHeight, flex: getComputedStyle(btn).flex, h: getComputedStyle(btn).height } : null,
            backBtn: R(document.querySelector('.league-back-btn')),
        };
    });
    console.log(JSON.stringify(out, null, 1));
    console.log(errors.length ? errors.join('\n') : '(no console errors)');
    await browser.close();
})();
