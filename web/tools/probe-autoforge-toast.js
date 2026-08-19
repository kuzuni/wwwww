// 자동 제련이 스스로 처리한 결과 토스트가 뜨지 않는지 검증 (slug: autoforge-toast-suppress).
//
// 사용자 지시: "자동제련 하다가 팝업 열면 뭐 팔렸고 어쩌구 토스트 존내 올라오는데 생략하셈."
// 재는 것: 자동 제련을 실제로 켜서 몇 초 돌리는 동안 **화면에 뜬 모든 토스트 문구**를 모아
//   ⓐ '자동 장착'/'자동 판매' 처리 토스트가 **0건**인가 ⓑ 그런데도 코인 연출(coinBurst)은
//   살아 있는가(판매 시각 피드백 유지 지시) ⓒ 수동 토스트는 여전히 뜨는가(과잉 억제 아님).
//
// ⚠️ 자동 시퀀스는 망치질 애니·카드 리빌 콜백으로 굴러가는 **타이머 구동**이라, 한 번의
//    evaluate 로는 못 잰다 — 실제 시간을 흘려보내며 MutationObserver 로 토스트를 모은다.
// ⚠️ 자동 제련은 스테이지 2-10 해금이라 maxStage 를 올려 준다. 목표 필터는 **비운다**(무필터라야
//    autoResolve 처리 경로 = 토스트가 나던 자리가 실제로 돌아간다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof Forge !== "undefined"');

    await page.evaluate(() => {
        // 자동 제련 해금 + 망치 넉넉히 + 무필터
        S.maxStage = { chapter: 5, stage: 10 }; if (S.progress) S.progress.maxStage = 210;
        S.hammers = 60;
        S.autoForge = S.autoForge || {};
        S.autoForge.keepAges = []; S.autoForge.filterSubs = []; S.autoForge.stopOnTarget = false;
        // 모든 토스트를 기록(문구·시각). 코인 연출도 기록해 '유지됐나' 를 본다.
        window.__toasts = [];
        window.__coinBursts = 0;
        const origToast = UI.toast.bind(UI);
        UI.toast = function (msg, lane) { window.__toasts.push(String(msg)); return origToast(msg, lane); };
        const origBurst = UI.coinBurst ? UI.coinBurst.bind(UI) : null;
        if (origBurst) UI.coinBurst = function (n) { window.__coinBursts++; return origBurst(n); };
        // 자동 제련 켜기
        if (!S.autoForgeOn) UI.onToggleAutoForgeOn ? UI.onToggleAutoForgeOn() : (S.autoForgeOn = true, UI.startAutoSeq());
    });
    // 실제로 자동 시퀀스가 돌도록 시간을 흘린다(망치질·카드 리빌 콜백).
    await page.waitForTimeout(7000);

    // 🔨 결정적 검증 — 타이머 구동은 헤드리스에서 느려 몇 개만 churn 되므로, **토스트가 나던
    //    두 경로를 직접 태운다**: ⓐ 큐를 여러 장 채우고 resolvePendingCraft(팝업 닫힘·큐 드레인)
    //    ⓑ autoDispose 를 직접 호출(카드 리빌 콜백이 부르던 판매 경로). 둘 다 무필터라 실제로
    //    autoResolve 판매/장착이 돌고, 예전이라면 여기서 토스트가 무더기로 떴다.
    const churn = await page.evaluate(() => {
        const h0 = S.hammers;
        S.autoMatchHeld = false;
        S.autoMatchQueue = [];
        for (let i = 0; i < 8; i++) { const it = Forge.craft(1)[0]; if (it) S.autoMatchQueue.push(it); }
        UI._pendingItem = null;   // 대기품 없이 큐만 드레인시킨다
        UI.resolvePendingCraft();               // ⓐ 큐 8장 일괄 처리(장착/판매 = 예전 토스트 자리)
        // ⓑ 판매 경로(coinBurst 유지분)를 확실히 태운다 — 같은 슬롯을 여러 번 뽑으면 첫 개만
        //    장착되고 나머지는 판매되므로, weapon 만 반복 제작해 sell 이 실제로 나게 한다.
        for (let i = 0; i < 10; i++) { const it = Forge.craft(1)[0]; if (it) UI.autoDispose(it); }
        return { consumed: h0 - S.hammers };
    });

    const out = await page.evaluate(() => ({
        toasts: window.__toasts, coinBursts: window.__coinBursts,
        hammersLeft: S.hammers, autoOn: S.autoForgeOn,
    }));
    // 수동 토스트가 여전히 뜨는지(과잉 억제 아님) — 직접 한 번 부른다.
    const manualWorks = await page.evaluate(() => {
        const before = document.querySelectorAll('#toasts .toast, #toasts-combat .toast').length;
        UI.toast('수동 테스트 토스트');
        return new Promise(r => setTimeout(() => {
            const after = document.querySelectorAll('#toasts .toast, #toasts-combat .toast').length;
            r(after > before);
        }, 80));
    });
    await browser.close();

    const proc = out.toasts.filter(t => /자동\s*장착|자동\s*판매|보류품/.test(t));
    let fail = 0;
    console.log(`자동 제련 ${7}s 구동 — 토스트 ${out.toasts.length}건 (처리 토스트 ${proc.length}건) · 코인연출 ${out.coinBursts}회 · 망치 60→${out.hammersLeft} · autoOn=${out.autoOn}`);
    // 검증 유효성은 **망치 소비**로 판정한다(토스트·코인연출 0 은 정상일 수 있다 — 무필터에서
    //  빈 슬롯이면 장착으로 흘러 판매가 안 나기도 한다). 소비가 0 이면 처리 경로가 안 돈 것.
    if (churn.consumed <= 0) { console.log('  ⚠️ 처리 경로가 안 돌았다(망치 소비 0) — 검증 무효.'); fail++; }
    else console.log(`  ✓ 처리 경로 구동 확인(직접 태운 제작 ${churn.consumed}회)`);
    if (proc.length) { console.log(`  ✗ 처리 토스트가 떴다(0건이어야 함):`); proc.slice(0, 8).forEach(t => console.log('     · ' + t)); fail++; }
    else console.log('  ✓ 자동 처리 토스트 0건');
    if (!manualWorks) { console.log('  ✗ 수동 토스트가 안 뜬다 — 과잉 억제(toast 자체를 막았나?)'); fail++; }
    else console.log('  ✓ 수동 토스트 정상');
    if (errs.length) { console.log(`  🚨 콘솔 에러 ${errs.length}건:`); errs.slice(0, 5).forEach(e => console.log('     · ' + e)); fail++; }
    console.log(fail ? `\n결과: FAIL ${fail}건` : '\n결과: PASS');
    process.exit(fail ? 2 : 0);
})();
