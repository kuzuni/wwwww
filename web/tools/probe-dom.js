// 클론 화면의 임의 요소를 #app 기준 %W/%H 로 재는 범용 도구 — 비율 전수 검증 패스(TODO ②)용.
// 원본 PNG 쪽은 probe-box.js / probe-segments.js 로 재고, 클론 쪽은 이 도구로 재서 나란히 비교한다.
//
// 사용: PW_PATH=... node probe-dom.js "<화면 여는 JS>" <선택자> [선택자...]
//   예) node probe-dom.js "UI.openGearDetail('weapon')" ".idet-card" ".idet-wrap" ".idet-badge"
//
// ⚠️ 두 가지 함정을 도구가 대신 막는다(둘 다 실제로 밟은 것):
//  ① 팝업 열림 애니메이션이 카드에 transform: scale(.7)→1 을 건다. 헤드리스에서는 페이지가 쉬는 동안
//     CSS 애니메이션이 스로틀링돼 1200ms 를 기다려도 중간 프레임(≈0.694배)에 멈춰 있다 —
//     기다리는 대신 animation/transition 을 통째로 무효화한 뒤 잰다.
//  ② #app 은 fitLayout 이 transform: scale 로 레터박스한다. getBoundingClientRect 는 '축소된 px',
//     clientHeight 는 '레이아웃 px' 이라 섞으면 어긋난다 — 기준을 #app rect 하나로 통일한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SC = require('./shot-screens-seed.js');

const SRC = process.argv[2];
const SELS = process.argv.slice(3);
if (!SRC || !SELS.length) { console.error('사용: node probe-dom.js "<화면 여는 JS>" <선택자> [선택자...]'); process.exit(1); }

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 20000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 20000 });
    await page.evaluate(() => { UI.toast = () => { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(new Function(SRC));
    await page.waitForTimeout(500);
    const out = await page.evaluate((sels) => {
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const res = { appRect: [+W.toFixed(1), +H.toFixed(1)], rootFont: getComputedStyle(document.documentElement).fontSize, els: {} };
        for (const s of sels) {
            const el = document.querySelector(s);
            if (!el) { res.els[s] = null; continue; }
            const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
            res.els[s] = {
                x: +((r.x - app.x) / W * 100).toFixed(2), y: +((r.y - app.y) / H * 100).toFixed(2),
                w: +(r.width / W * 100).toFixed(2), h: +(r.height / H * 100).toFixed(2),
                bot: +((r.bottom - app.y) / H * 100).toFixed(2), right: +((r.right - app.x) / W * 100).toFixed(2),
                px: `${Math.round(r.width)}x${Math.round(r.height)}`, bg: cs.backgroundColor, color: cs.color,
            };
        }
        return res;
    }, SELS);
    console.log(JSON.stringify(out, null, 1));
    console.log(errors.length ? errors.join('\n') : '(no console errors)');
    await browser.close();
})();
