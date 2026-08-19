// 진행 패스 화면 캡처 — `aaa-skin` ⑧ pass 재작업 눈대조용.
// 상태 세팅·스크롤은 probe-pass-px.js 와 **같은 레시피**다(도달 경계 4-1 · 수령 6줄 · 3-5 로 스크롤).
// 판정은 probe-pass-px.js 가 한다 — 여기는 눈으로 볼 그림만 뽑는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        const bw = document.getElementById('boss-warning'); if (bw) bw.classList.add('hidden');
        const df = document.getElementById('dmg-flash'); if (df) { df.classList.remove('on'); df.style.display = 'none'; }
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
        UI.clearPendingCraft(); UI.renderEquipSheet();
        UI.coinBurst = () => { };
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.waitForTimeout(150);
    // shot-screens.js 의 pass 오프너 그대로(도달 경계 4-1 · 수령 6줄 · 3-5 로 스크롤)
    await page.evaluate(() => {
        const bc = S.bestChapter, bs = S.bestStage, pc = S.passClaimed;
        S.bestChapter = 4; S.bestStage = 1;
        S.passClaimed = { '1-5': true, '1-10': true, '2-5': true, '2-10': true, '3-5': true, '3-10': true };
        UI.openPass();
        S.bestChapter = bc; S.bestStage = bs; S.passClaimed = pc;
        const track = document.querySelector('.pass-track');
        const lab = [...track.querySelectorAll('.pass-milestone-label')].find(l => l.textContent.includes('3-5'));
        if (lab) track.scrollTop = lab.offsetTop - 6;
    });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(500);
    const shot = await page.screenshot({ timeout: 180000 });

    require('fs').writeFileSync(path.resolve(__dirname, 'pass-screen.png'), shot);
    console.log('콘솔 에러', errors.length, errors.slice(0, 5));
    await browser.close();
})();
