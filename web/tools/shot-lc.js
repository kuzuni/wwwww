// 리그 도전(상대 선택) 팝업 한 장만 캡처 — shot-screens.js 전체보다 빠른 반복용
// 사용: PW_PATH=<playwright> node shot-lc.js [출력png]   (규약은 shot-league.js 와 동일)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const OUT = process.argv[2] || path.join(__dirname, 'ref-cmp/clone/league-challenge.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && S && S.forgeLevel === 29', { label: '시드 상태 로드' });
    await page.evaluate(() => {
        UI.toast = () => { };
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        S.autoForgeOn = false; S.pendingCraft = null; UI._pendingItem = null;
        UI.els.craftModal.classList.add('hidden');
        UI.openLeague(); UI.openLeagueChallenge();
    });
    await page.waitForTimeout(650);
    await page.evaluate(() => {
        document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => { });
    await page.screenshot({ path: OUT, timeout: 60000 });
    console.log('wrote ' + OUT);
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    await browser.close();
})();
