// 모루 버튼만 잘라 확대 캡처한다 — 원본(shot-042120)의 모루와 형태·비율을 나란히 대조하기 위한 것.
// 사용: PW_PATH=<playwright 경로> node shot-anvil.js [out.png]
//
// ⚠️ 3D 렌더 루프가 도는 동안에는 swiftshader에서 스크린샷 한 장이 15~30초라 기본 타임아웃에
// 걸린다. 모루는 DOM 오버레이라 3D가 필요 없으므로 캡처 전에 루프를 멈춘다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, 'anvil-clone.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    // 확대 캡처 — 원본 크롭(5배)과 눈으로 맞대 보려면 클론도 배율을 올려야 한다
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 5 });
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'));
    await page.waitForFunction('typeof UI !== "undefined" && UI.els');
    await page.evaluate(`S.hammers = 41307; S.bestChapter = 20; S.bestStage = 9; saveGame(); UI.renderEquipSheet();`);
    await page.evaluate(`Scene3D.update = function () {};`);
    await page.waitForTimeout(400);

    const btn = await page.$('.anvil-btn');
    if (!btn) { console.log('모루 버튼 없음'); await browser.close(); return; }
    const box = await btn.boundingBox();
    console.log('모루 버튼 박스', JSON.stringify(box));
    await btn.screenshot({ path: OUT, timeout: 60000 });
    // 실루엣 스캔용으로 배율 1배 판도 한 장 — probe-anvil-ref.js에 그대로 먹인다
    const page1 = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
    await page1.goto('file://' + path.resolve(__dirname, '../index.html'));
    await page1.waitForFunction('typeof UI !== "undefined" && UI.els');
    await page1.evaluate(`S.hammers = 41307; saveGame(); UI.renderEquipSheet(); Scene3D.update = function () {};`);
    await page1.waitForTimeout(300);
    const b1 = await page1.$('.anvil-btn');
    const box1 = await b1.boundingBox();
    await page1.screenshot({ path: OUT.replace(/\.png$/, '-1x.png'), timeout: 60000 });
    console.log('1배 전체화면 저장 — 모루 버튼 박스', JSON.stringify(box1));
    console.log('wrote', OUT);
    console.log(errors.length ? errors.join('\n') : 'NO CONSOLE/PAGE ERRORS');
    await browser.close();
})();
