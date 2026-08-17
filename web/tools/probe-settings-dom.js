// 설정 화면 DOM 실측 — 픽셀 스캔(probe-settings.js)과 짝. 픽셀 스캔이 테두리/둥근 모서리 때문에
// 몇 px 덜 잡히는 만큼을 알아내고, CSS를 고칠 때 목표값을 rect로 직접 확인하는 용도.
// 사용: PW_PATH=... node probe-settings-dom.js
const { chromium } = require(process.env.PW_PATH || 'playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 20000 });
    await page.evaluate(() => { UI.openProfile(); UI._profileView = 'settings'; UI.renderProfile(); });
    // ⚠️ 팝업 열림 애니메이션이 카드에 transform: scale(.7)→1 을 건다. 덜 기다리면 rect가
    //    레이아웃 크기의 0.7배로 잡혀 clientHeight 와 1.4배 어긋난다(직접 밟은 함정).
    await page.waitForTimeout(1200);
    const out = await page.evaluate(() => {
        // ⚠️ #app 은 fitLayout 이 transform: scale 로 레터박스한다 — getBoundingClientRect 는 '축소된 px',
        //    clientHeight 는 '레이아웃 px'이라 둘을 섞으면 값이 1.4배 어긋난다. 기준을 #app rect로 통일한다.
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +((r.x - app.x) / W * 100).toFixed(2), y: +((r.y - app.y) / H * 100).toFixed(2), w: +(r.width / W * 100).toFixed(2), h: +(r.height / H * 100).toFixed(2), px: `${Math.round(r.width)}x${Math.round(r.height)}` }; };
        const card = document.querySelector('#profile-modal .modal-card') || document.querySelector('.profile-sheet');
        const rows = [...document.querySelectorAll('.settings-row')];
        const cs = getComputedStyle(document.documentElement);
        return {
            viewport: [window.innerWidth, window.innerHeight],
            appRect: [+W.toFixed(1), +H.toFixed(1), +app.x.toFixed(1), +app.y.toFixed(1)],
            appH: cs.getPropertyValue('--app-h').trim(), appW: cs.getPropertyValue('--app-w').trim(),
            rootFont: getComputedStyle(document.documentElement).fontSize,
            card: R(card),
            cardBorder: card ? getComputedStyle(card).borderTopWidth : null,
            list: R(document.querySelector('.settings-list')),
            row0: R(rows[0]), rowN: rows.length,
            rowBg: rows.slice(0, 3).map(r => getComputedStyle(r).backgroundColor),
            toggle: R(document.querySelector('.settings-toggle')),
            tabs: R(document.querySelector('.profile-sheet .profile-tabs')),
            xbtn: R(document.querySelector('#profile-modal .x-btn')),
            scroll: (() => { const l = document.querySelector('.settings-list'); const p = l && l.parentElement; return p ? { sh: p.scrollHeight, ch: p.clientHeight, cls: p.className } : null; })(),
        };
    });
    console.log(JSON.stringify(out, null, 1));
    await browser.close();
})();
