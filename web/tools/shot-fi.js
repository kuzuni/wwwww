// 확률 정보 팝업 한 장만 캡처 (원본 shot-042831 대조용) — 전체 31화면 캡처보다 빠른 반복용
// 사용: PW_PATH=<playwright> node shot-fi.js [출력png]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const OUT = process.argv[2] || path.join(__dirname, 'ref-cmp/clone/forge-info.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(() => {
        S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9;
        S.forgeLevel = 29; S.coins = 2.71e7; S.gems = 8150;
        S.forgeUpgradeEndsAt = U.now() + 98 * 3600e3;   // 원본과 같은 "4일 2시" 진행 상태
        UI.toast = () => { };
        UI.showCraftModal = () => { };                  // 자동 제련이 캡처 위로 비교 팝업을 띄우는 것 방지
        UI.openForgeInfo();
    });
    await page.waitForTimeout(450);
    await page.screenshot({ path: OUT });
    console.log('wrote ' + OUT);
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    await browser.close();
})();
