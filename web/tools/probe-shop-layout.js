// 상점 시트 아래 여백(padding-bottom) 추가가 '스크롤 최상단' 레이아웃을 건드리지 않는지
// 확인하는 대조 도구 — 원본 비율 대조의 기준점이 scrollTop=0 화면이라서다.
// 주요 요소 rect를 앱 높이/폭 대비 %로 찍는다. 수정 전후 값을 비교해 ±0.0%p 여야 통과.
// 사용: node probe-shop-layout.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const VIEWPORTS = [
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
];

const TARGETS = [
    '.shop-sheet .sheet-head', '.shop-sheet .shop-title', '.shop-banner',
    '.shop-sub', '.shop-deals', '.shop-deal-card', '.shop-gems', '.shop-gem-card',
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp });
        page.on('pageerror', e => errs.push(`${vp.width}x${vp.height} ${e.message}`));
        page.on('console', m => {
            if (m.type() === 'error') errs.push(`${vp.width}x${vp.height} ${m.text()}`);
            if (m.text().startsWith('APPRECT')) console.log(`  [${m.text()}]`);
        });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
        await page.waitForTimeout(400);
        await page.evaluate(() => { UI.onTabClick('shop'); });
        await page.waitForFunction(() => !document.querySelector('.modal.opening'), null, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(250);

        // #app 은 9:16 레터박스라 fitLayout()이 돌아야 최종 크기가 나온다 — 비율의 분모가
        // 흔들리면 수정 전후 비교가 통째로 어긋나므로, 크기가 안정될 때까지 기다린다.
        await page.waitForFunction(() => {
            const a = document.getElementById('app');
            if (!a) return false;
            const r = a.getBoundingClientRect();
            return r.width > 0 && Math.abs(r.width - Math.min(window.innerWidth, window.innerHeight * 9 / 16)) < 1.5;
        }, null, { timeout: 25000 });

        const rows = await page.evaluate((sels) => {
            const app = document.getElementById('app') || document.body;
            const ar = app.getBoundingClientRect();
            console.info(`APPRECT ${Math.round(ar.width)}x${Math.round(ar.height)} @${window.innerWidth}x${window.innerHeight}`);
            const sh = document.querySelector('.modal-card.sheet.shop-sheet');
            sh.scrollTop = 0; // 비율 기준점은 항상 최상단
            return sels.map(s => {
                const el = document.querySelector(s);
                if (!el) return { sel: s, missing: true };
                const r = el.getBoundingClientRect();
                return {
                    sel: s,
                    top: ((r.top - ar.top) / ar.height * 100).toFixed(2),
                    left: ((r.left - ar.left) / ar.width * 100).toFixed(2),
                    w: (r.width / ar.width * 100).toFixed(2),
                    h: (r.height / ar.height * 100).toFixed(2),
                };
            });
        }, TARGETS);

        console.log(`\n== ${vp.width}x${vp.height} ==`);
        rows.forEach(r => console.log(r.missing ? `  MISSING ${r.sel}`
            : `  ${r.sel.padEnd(28)} top=${r.top}% left=${r.left}% w=${r.w}% h=${r.h}%`));
        await page.close();
    }
    console.log(`\n콘솔 에러 ${errs.length}건`);
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(errs.length ? 1 : 0);
})();
