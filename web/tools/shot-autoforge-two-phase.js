// 눈 확인용: 망치 10개 자동 제련 — ①단계(카드가 줄줄이) → ②단계(팝업 큐) 프레임 캡처
// (autoforge-show-all-cards 3차 사양 2026-08-19: "망치애니 → 카드 10장 다 → 팝업 몰아서")
// 매 0.4초 카드/팝업/큐/망치를 찍어 타임라인으로 뱉고, 카드 구간과 첫 팝업을 스크린샷으로 남긴다.
// 순서 판정 자체는 probe-autoforge-default ②-b / probe-autocraft-seq ⑶⑸ 가 단언한다.
// 사용: node shot-autoforge-two-phase.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const OUT = __dirname;
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 5; S.bestStage = 9; S.forgeLevel = 20;
        S.autoForge = { keepAges: AGES.slice(), filterOn: false, filterSubs: [], hammersPerBatch: 10, stopOnTarget: false };
        S.hammers = 10;
        S.autoForgeOn = false; UI._autoSeq = null; UI.clearPendingCraft();
        S.autoMatchQueue = [];
        UI.els.craftModal.classList.add('hidden');
        UI.switchTab('forge');
        UI.onToggleAutoForge();
    });
    const log = [];
    for (let i = 0; i < 26; i++) {
        await page.waitForTimeout(400);
        const st = await page.evaluate(() => ({
            card: !!document.querySelector('.auto-drop-card'),
            modal: !UI.els.craftModal.classList.contains('hidden'),
            q: (S.autoMatchQueue || []).length,
            h: S.hammers,
        }));
        log.push(`t=${(i + 1) * 0.4}s 카드=${st.card ? 'O' : '.'} 팝업=${st.modal ? 'O' : '.'} 큐=${st.q} 망치=${st.h}`);
        if (i === 6) await page.screenshot({ path: OUT + '/autoforge-phase1-cards.png' });
        if (st.modal) { await page.screenshot({ path: OUT + '/autoforge-phase2-popup.png' }); break; }
    }
    console.log(log.join('\n'));
    console.log('errs=', errs.length, errs.slice(0, 3));
    await browser.close();
})();
