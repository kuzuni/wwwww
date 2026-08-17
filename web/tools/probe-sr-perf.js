// 소환 결과 팝업 렌더 비용 측정 — 연출 구간에서 스크린샷 1장이 얼마나 걸리는지.
// 무거운 레이어(스케일 셰이크·블러·블렌드)를 넣으면 swiftshader에서 캡처가 타임아웃한다.
// 사용: PW_PATH=<playwright 경로> node probe-sr-perf.js
const { chromium } = require(process.env.PW_PATH || 'playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || '/tmp/sr-perf';
require('fs').mkdirSync(OUT, { recursive: true });

const SEED = `S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; saveGame();`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && UI.els');
    await page.evaluate(SEED);
    await page.waitForTimeout(300);
    // 팝업 열기 전 기준선
    let t = Date.now();
    await page.screenshot({ path: path.join(OUT, 'base.png'), timeout: 60000 });
    console.log('팝업 없음:', Date.now() - t, 'ms');
    // 3D 렌더를 멈추면 캡처가 얼마나 빨라지는지 (팝업은 불투명 풀스크린이라 화면은 동일)
    await page.evaluate(`Scene3D.update = function () {};`);
    t = Date.now();
    await page.screenshot({ path: path.join(OUT, 'base-nogl.png'), timeout: 60000 });
    console.log('3D 정지·팝업 없음:', Date.now() - t, 'ms');
    await page.addStyleTag({ content: '#scene canvas, canvas { visibility: hidden !important; }' });
    t = Date.now();
    await page.screenshot({ path: path.join(OUT, 'base-nocanvas.png'), timeout: 60000 });
    console.log('캔버스 숨김:', Date.now() - t, 'ms');
    await page.evaluate(`S.summonMult = {skill:5}; UI.switchTab('summon');
        UI.switchSummonSub('skills'); UI.onSummon(false);`);
    for (const label of ['charge', 'cascade', 'done']) {
        t = Date.now();
        await page.screenshot({ path: path.join(OUT, label + '.png'), timeout: 60000 });
        console.log(label + ':', Date.now() - t, 'ms');
    }
    await browser.close();
})();
