// 던전 목록(원본 shot-042251 대응) 캡처 — `dungeon-row-quality` 잔여 결함(ⓐ~ⓔ) 눈대조용.
// 기하(±2%p) 판정은 `probe-dungeons-px.js` 가 한다 — 여기는 아트만 본다.
//
// 캡처 절차는 probe-dungeons-px.js 와 같은 레시피다: `Scene3D.update` 를 비워 rAF 루프를 세우고
// 애니메이션을 CSS 로 끈다. 안 그러면 page.screenshot 이 합성 대기로 타임아웃한다(실제로 밟았다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    p.on('pageerror', e => errs.push('PAGEERROR ' + e));
    await p.goto(INDEX, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await p.evaluate(SC.SEED_SRC);
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    await p.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        UI.showCraftModal = () => { }; UI.resolvePendingCraft = () => { }; UI.autoSeqStep = () => { };
        UI.coinBurst = () => { };
    });
    await p.waitForTimeout(700);
    await p.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await p.evaluate(() => UI.openDungeons());
    await p.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await p.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.resolve(__dirname, 'dungeon-rows.png'), timeout: 180000 });
    console.log('콘솔 에러', errs.length, errs.slice(0, 5));
    await b.close();
})();
