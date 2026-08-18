// 자동 제작 순차 애니메이션 시퀀스 검증 (사용자 지시 2026-08-17, TODO ①~⑦
//  + 2026-08-18 재지적 autoforge-show-all-cards: 배치는 팝업에서 멈추지 않고 카드 N장이 다 보여야)
//  ⑴ 자동제작 시작 시 설정 팝업이 닫힌다
//  ⑵ 제작마다 망치질(.striking) 연출이 돈다
//  ⑶ 기본값에서는 목표 통과분도 배치 도중 비교 팝업 없이 카드 → 자동 판정으로 흘러간다
//  ⑷ 필터 탈락분은 카드가 잠깐 보였다가 코인 판매 연출(#coin-burst)이 난다
//  ⑸ 망치 N개 배치면 결과 카드가 정확히 N회 노출된다 (통과·탈락이 섞여도)
//  ⑹ 예산 N → 해머 N개를 다 쓸 때까지 돌고 정지 / '목표를 찾으면 정지'(stopOnTarget) ON이면
//     첫 통과분이 비교 팝업으로 뜨고 선택 후 정지, 남은 예산은 쓰지 않는다
//  ⑺ 비교 팝업 딤 클릭 = 보류 → 모루 자리에 카드, 그 카드를 누르면 비교 팝업 재등장, 세이브 보존
// 사용: node probe-autocraft-seq.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

async function waitBooted(page, timeout = 20000) {
    const t0 = Date.now();
    for (;;) {
        const ok = await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S).catch(() => false);
        if (ok) return;
        if (Date.now() - t0 > timeout) throw new Error('부팅 대기 시간 초과');
        await page.waitForTimeout(100);
    }
}
// 조건이 참이 될 때까지 기다린다(연출이 실시간이라 고정 sleep은 불안정하다)
async function until(page, fnSrc, ms = 8000) {
    const t0 = Date.now();
    for (;;) {
        if (await page.evaluate(fnSrc).catch(() => false)) return true;
        if (Date.now() - t0 > ms) return false;
        await page.waitForTimeout(50);
    }
}

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await waitBooted(page);
    await page.waitForTimeout(400);
    // 해금·재화 세팅 + 망치질 연출 관찰을 위해 3D만 정지(연출 타이밍 자체는 실제 값을 쓴다)
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 5; S.bestStage = 9; S.hammers = 500; S.forgeLevel = 20;
        S.autoForge.keepAges = []; S.autoForge.filterOn = false; S.autoForge.filterSubs = [];
    });

    // ---- ⑴ 시작하면 설정 팝업이 닫힌다 ----
    const start = await page.evaluate(() => {
        UI.openAutoForge();
        const openedBefore = !UI.els.autoForgeModal.classList.contains('hidden');
        S.autoForge.hammersPerBatch = 3;
        S.autoForge.stopOnTarget = false;
        Forge.passesAutoFilter = () => false;   // 전부 탈락시켜 코인 연출 경로만 본다
        // 🚨 탈락시키는 것만으로는 **판매되지 않는다** — 탈락분의 처리는 `UI.autoDispose`가 정하는데,
        //    목표(필터 대상)가 하나도 없으면 `Forge.autoResolve`로 넘어가 **빈 슬롯이면 자동 장착**한다.
        //    새 세이브는 8칸이 전부 비어 있어 앞 6~8개가 전부 장착으로 흘러가고, 예산 3개짜리 이 시나리오는
        //    판매에 **한 번도 도달하지 못한다** — 그래서 '코인 연출이 안 뜬다'가 게임 결함처럼 보였다.
        //    (실측 교차검증: 장착 6건 뒤 7번째부터 gained 20으로 판매되고 #coin-burst에 코인 5개가 실제로 찍힌다.)
        //    이 프로브가 보려는 건 '탈락 → 판매 → 코인 연출' 경로이므로 목표가 있는 상태로 고정한다.
        Forge.hasAutoTarget = () => true;
        const h0 = S.hammers;                   // 예산 소모는 '시작 직전' 값과 비교해야 한다
        UI.onToggleAutoForge();
        return { openedBefore, closedAfter: UI.els.autoForgeModal.classList.contains('hidden'), on: S.autoForgeOn, h0 };
    });
    ok(start.openedBefore && start.closedAfter, '자동제작 시작 시 설정 팝업이 닫히지 않았다');
    ok(start.on, '자동제작이 켜지지 않았다');

    // ---- ⑵ 망치질 연출 ----
    ok(await until(page, `document.querySelector('.anvil-btn.striking') !== null`, 3000),
        '망치질 연출(.striking)이 관측되지 않았다');
    // ---- ⑷ 탈락분: 카드 노출 + 코인 연출 ----
    ok(await until(page, `document.querySelector('.auto-drop-card') !== null`, 4000),
        '필터 탈락 장비 카드(.auto-drop-card)가 뜨지 않았다');
    ok(await until(page, `!!document.getElementById('coin-burst') && document.getElementById('coin-burst').children.length > 0`, 6000),
        '판매 코인 연출(#coin-burst)이 나지 않았다');

    // ---- ⑹ 예산 소진 후 정지 (계속하기 ON, 예산 3) ----
    ok(await until(page, `S.autoForgeOn === false`, 15000), '예산을 다 써도 자동제작이 멈추지 않았다');
    const after = await page.evaluate(() => ({ h: S.hammers, seq: !!UI._autoSeq }));
    ok(start.h0 - after.h === 3, `예산 3개만 써야 하는데 ${start.h0 - after.h}개 소모`);
    ok(!after.seq, '정지 후에도 시퀀스가 남아 있다');
    console.log(`⑴⑵⑷⑹ 설정팝업 닫힘·망치질·탈락카드·코인연출 확인 · 해머 ${start.h0} → ${after.h}(예산 3 소진 후 정지)`);

    // ---- ⑶⑸ 배치 도중 비교 팝업 없음 + 망치 N개 → 카드 N회 노출 (autoforge-show-all-cards) ----
    const flow = await page.evaluate(async () => {
        // 통과·탈락을 번갈아 섞는다 — 통과분이 팝업으로 배치를 막으면 카드가 N장에서 끊긴다
        let nth = 0;
        Forge.passesAutoFilter = () => (nth++ % 2 === 0);
        // 카드 노출 횟수는 카드 생성 단일 통로(buildCraftCard)에서 센다
        window.__cards = 0;
        const orig = UI.buildCraftCard;
        UI.buildCraftCard = function (item, cls) { window.__cards++; return orig.call(this, item, cls); };
        let modalSeen = false;
        const watch = setInterval(() => { if (!UI.els.craftModal.classList.contains('hidden')) modalSeen = true; }, 50);
        S.autoForge.hammersPerBatch = 6; S.autoForge.stopOnTarget = false;
        S.autoForgeOn = false; UI._autoSeq = null;
        const h0 = S.hammers;
        UI.onToggleAutoForge();
        for (let i = 0; i < 600 && S.autoForgeOn; i++) await new Promise(r => setTimeout(r, 50));
        clearInterval(watch);
        UI.buildCraftCard = orig;
        return { spent: h0 - S.hammers, cards: window.__cards, modalSeen, on: S.autoForgeOn };
    });
    ok(!flow.on, '⑶ 배치가 스스로 정지하지 않았다');
    ok(!flow.modalSeen, '⑶ 기본값인데 배치 도중 비교 팝업이 떠서 시퀀스를 막았다');
    ok(flow.spent === 6, `⑸ 망치 6개를 다 써야 하는데 ${flow.spent}개 소모`);
    ok(flow.cards === 6, `⑸ 망치 6개 → 카드 6회여야 하는데 ${flow.cards}회 노출`);
    console.log(`⑶⑸ 통과·탈락 혼합 배치: 팝업 차단 없음 · 해머 ${flow.spent}개 = 카드 ${flow.cards}회`);

    // ---- ⑹-b '목표를 찾으면 정지' ON → 첫 통과분이 비교 팝업, 선택 후 정지 + 남은 예산 미소모 ----
    const stopCase = await page.evaluate(async () => {
        S.hammers = 200; S.autoForgeOn = false; UI._autoSeq = null;
        UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
        S.autoForge.stopOnTarget = true; S.autoForge.hammersPerBatch = 10;
        Forge.passesAutoFilter = () => true;
        const h0 = S.hammers;
        UI.onToggleAutoForge();
        for (let i = 0; i < 200 && UI.els.craftModal.classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 50));
        const modal = !UI.els.craftModal.classList.contains('hidden');
        UI.resolveCraft('sell');                // 같은 등급 경고가 떠도 이 경로는 판매로 확정된다
        if (!document.getElementById('detail-modal').classList.contains('hidden')) UI.onSellConfirm();
        await new Promise(r => setTimeout(r, 1500));
        return { modal, spent: h0 - S.hammers, on: S.autoForgeOn, seq: !!UI._autoSeq };
    });
    ok(stopCase.modal, "'정지' ON인데 첫 통과분이 비교 팝업으로 뜨지 않았다");
    ok(!stopCase.on && !stopCase.seq, "'정지' ON인데 첫 선택 후에도 자동제작이 계속됐다");
    ok(stopCase.spent === 1, `'정지' ON이면 망치 1개만 써야 하는데 ${stopCase.spent}개 소모`);
    console.log(`⑹-b 목표 정지 ON → 첫 통과 팝업·선택 후 정지 (해머 ${stopCase.spent}개 소모)`);

    // ---- ⑺ 딤 클릭 = 보류 → 모루 자리 카드 → 다시 열기 ----
    await page.evaluate(() => {
        S.autoForgeOn = false; UI._autoSeq = null;
        UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
        const it = Forge.rollItem(); UI.setPendingCraft(it); UI.showCraftModal(it);
    });
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
        const m = document.getElementById('craft-modal').getBoundingClientRect();
        return { x: m.left + 12, y: m.top + 12 };   // 카드 바깥 = 딤 영역
    });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    // 보류는 pendingCraft 1슬롯이 전부다 (보관함·큐 없음 — 사용자 확정 2026-08-17)
    const held = await page.evaluate(() => ({
        modalClosed: document.getElementById('craft-modal').classList.contains('hidden'),
        pending: !!S.pendingCraft,
        cardOnAnvil: !!document.querySelector('.anvil-btn.held-slot'),
        saved: !!(JSON.parse(localStorage.getItem('forgeclone_save_v1')) || {}).pendingCraft,
    }));
    ok(held.modalClosed && held.pending && held.cardOnAnvil,
        `딤 클릭 보류가 동작하지 않았다 ${JSON.stringify(held)}`);
    ok(held.saved, '보류품이 세이브에 남지 않았다(새로고침 시 유실)');
    const reopened = await page.evaluate(() => {
        document.querySelector('.anvil-btn.held-slot').click();
        return {
            modalOpen: !document.getElementById('craft-modal').classList.contains('hidden'),
            pending: !!S.pendingCraft,
            anvilBack: !document.querySelector('.anvil-btn.held-slot'),
        };
    });
    ok(reopened.modalOpen && reopened.pending && reopened.anvilBack,
        `보류 카드 클릭으로 비교 팝업이 다시 뜨지 않았다 ${JSON.stringify(reopened)}`);
    console.log(`⑺ 보류: 딤 클릭 → 모루 자리 카드(세이브 보존) → 카드 클릭 → 비교 팝업 재등장·모루 복귀`);

    // ---- ⑻ 보류 카드가 모루 자리를 대신해도 레이아웃이 흔들리면 안 된다 (원본 비율 유지) ----
    const geo = await page.evaluate(() => {
        const m = () => {
            const app = document.getElementById('app').getBoundingClientRect();
            const r = document.querySelector('.anvil-row').getBoundingClientRect();
            const s = document.getElementById('equip-sheet').getBoundingClientRect();
            return { row: +(r.height / app.height * 100).toFixed(2), top: +((r.top - app.top) / app.height * 100).toFixed(2),
                     sheet: +(s.height / app.height * 100).toFixed(2) };
        };
        UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden'); UI.renderEquipSheet();
        const normal = m();
        UI.setPendingCraft(Forge.rollItem()); UI.els.craftModal.classList.add('hidden'); UI.renderEquipSheet();
        const held = m();
        UI.clearPendingCraft(); UI.renderEquipSheet();
        return { normal, held };
    });
    const dRow = Math.abs(geo.held.row - geo.normal.row), dSheet = Math.abs(geo.held.sheet - geo.normal.sheet);
    ok(dRow < 0.05 && dSheet < 0.05 && Math.abs(geo.held.top - geo.normal.top) < 0.05,
        `보류 카드가 레이아웃을 밀었다 (행 ${dRow.toFixed(2)}%p · 시트 ${dSheet.toFixed(2)}%p)`);
    console.log(`⑻ 보류 카드 레이아웃: 모루 ${JSON.stringify(geo.normal)} vs 보류 ${JSON.stringify(geo.held)}`);

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
