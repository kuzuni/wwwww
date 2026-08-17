// 자동 제련 ✕ 버튼이 탭바에 가리지 않는지 히트테스트 — 카드를 원본 높이로 되돌리면서 ✕가
// 탭바 영역까지 내려왔다(시트 화면의 ◀와 같은 함정). 버튼 중앙이 실제로 ✕로 잡히는지 확인한다.
// 사용: node probe-af-xbtn.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(() => {
        S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9; S.forgeLevel = 29;
        UI.openAutoForge();
    });
    await page.waitForTimeout(500);
    const hit = await page.evaluate(() => {
        const b = document.querySelector('#autoforge-modal .x-btn');
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const el = document.elementFromPoint(cx, cy);
        const tab = document.getElementById('tabbar').getBoundingClientRect();
        return {
            xbtn: [+r.left.toFixed(1), +r.top.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
            tabbar: [+tab.left.toFixed(1), +tab.top.toFixed(1), +tab.width.toFixed(1), +tab.height.toFixed(1)],
            overlapsTabbar: r.bottom > tab.top,
            hitIsXbtn: el === b || b.contains(el),
            hitEl: el ? (el.tagName + '.' + el.className) : null,
        };
    });
    // 실제로 눌러서 닫히는지까지 확인 — 히트테스트만으로는 pointer-events 를 못 걸러낸다
    await page.click('#autoforge-modal .x-btn');
    await page.waitForTimeout(250);
    const closed = await page.evaluate(() => document.getElementById('autoforge-modal').classList.contains('hidden'));
    console.log(JSON.stringify({ ...hit, closedByClick: closed, errors }, null, 2));
    const ok = hit.hitIsXbtn && closed && errors.length === 0;
    console.log(ok ? 'PASS — ✕가 탭바 위에 있고 클릭으로 닫힌다' : 'FAIL');
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
