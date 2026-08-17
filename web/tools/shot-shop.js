// 상점 화면 한 장만 캡처 (원본 shot-042632 대조용) — 전체 31화면 캡처보다 빠른 반복용
// 사용: PW_PATH=<playwright> node shot-shop.js [출력png]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const OUT = process.argv[2] || path.join(__dirname, 'ref-cmp/clone/shop.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Shop !== "undefined"', { label: '스크립트 로드' });
    // 원본과 같은 보유량(코인 782k · 젬 62)으로 맞춘다
    await page.evaluate(() => { S.coins = 782000; S.gems = 62; UI.toast = () => { }; UI.onTabClick('shop'); });
    await page.waitForTimeout(600);
    // 열림 애니메이션(cardpop)이 scale(.7)에서 시작하므로 벗기고 찍는다
    await page.evaluate(() => document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(200);
    await page.screenshot({ path: OUT });
    console.log('wrote ' + OUT);
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    await browser.close();
})();
