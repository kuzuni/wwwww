// 모든 장비의 목록 팝업 한 장만 캡처 (원본 shot-042905 대조용) — 전체 31화면 캡처보다 빠른 반복용
// 사용: PW_PATH=<playwright> node shot-fi.js [출력png]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const OUT = process.argv[2] || path.join(__dirname, 'ref-cmp/clone/forge-list.png');
const { stampFresh } = require('./clone-fresh.js');

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
        UI.openForgeInfo(); UI.openForgeList();
    });
    await page.waitForTimeout(2500);   // 목록은 셀 썸네일을 3D 로 굽는다 — 소프트웨어 GL 컨테이너에서 유독 느리다
    await page.screenshot({ path: OUT, timeout: 150000 });
    stampFresh(OUT);   // 재굽기 스탬프 — 캡처가 바이트 동일해도 '다시 구웠다'가 커밋에 남는다
    console.log('wrote ' + OUT);
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    await browser.close();
})();
