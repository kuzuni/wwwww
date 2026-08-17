// 자동 제작 순차 애니메이션 시퀀스 검증 (사용자 지시 2026-08-17, TODO ①~⑦)
//  ⑴ 자동제작 시작 시 설정 팝업이 닫힌다
//  ⑵ 제작마다 망치질(.striking) 연출이 돈다
//  ⑶ 필터 통과분은 비교 팝업으로 뜨고, 고르기 전에는 다음 제작으로 넘어가지 않는다
//  ⑷ 필터 탈락분은 카드가 잠깐 보였다가 코인 판매 연출(#coin-burst)이 난다
//  ⑸ 여러 개가 통과하면 비교 팝업이 그 수만큼 순차로
//  ⑹ '계속하기' ON + 예산 N → 해머 N개를 다 쓸 때까지 돌고 정지 / OFF면 첫 통과 선택 후 정지
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
        S.autoForge.continueOnTarget = true;
        Forge.passesAutoFilter = () => false;   // 전부 탈락시켜 코인 연출 경로만 본다
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

    // ---- ⑶⑸ 통과분은 비교 팝업으로 뜨고, 고르기 전에는 다음 제작이 없다 ----
    const gate = await page.evaluate(async () => {
        Forge.passesAutoFilter = () => true;    // 전부 통과시켜 비교 팝업 경로만 본다
        S.autoForge.hammersPerBatch = 3; S.autoForge.continueOnTarget = true;
        S.autoForgeOn = false; UI._autoSeq = null;
        const h0 = S.hammers;
        UI.onToggleAutoForge();
        // 첫 비교 팝업이 뜰 때까지 기다린다
        for (let i = 0; i < 200 && UI.els.craftModal.classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 50));
        const openedAt = { h: S.hammers, modal: !UI.els.craftModal.classList.contains('hidden') };
        // 고르지 않고 2초 기다려도 다음 제작이 시작되면 안 된다
        await new Promise(r => setTimeout(r, 2000));
        return { h0, openedAt, hAfterWait: S.hammers, stillOpen: !UI.els.craftModal.classList.contains('hidden') };
    });
    ok(gate.openedAt.modal, '필터 통과분이 비교 팝업으로 뜨지 않았다');
    ok(gate.hAfterWait === gate.openedAt.h && gate.stillOpen,
        `선택 대기 중에 다음 제작이 진행됐다 (해머 ${gate.openedAt.h} → ${gate.hAfterWait})`);
    console.log(`⑶ 비교 팝업 대기 중 다음 제작 없음: 해머 ${gate.openedAt.h} 유지(2초 대기)`);

    // 선택하면 다음 제작으로 이어지고, 예산만큼 팝업이 순차로 뜬다
    const seqCount = await page.evaluate(async () => {
        let picks = 0;
        for (let n = 0; n < 6; n++) {
            for (let i = 0; i < 200 && UI.els.craftModal.classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 50));
            if (UI.els.craftModal.classList.contains('hidden')) break;
            UI.resolveCraft('sell');            // 같은 등급 경고가 떠도 이 경로는 판매로 확정된다
            if (!document.getElementById('detail-modal').classList.contains('hidden')) UI.onSellConfirm();
            picks++;
            if (!S.autoForgeOn) break;
        }
        return { picks, on: S.autoForgeOn };
    });
    ok(seqCount.picks >= 2, `비교 팝업이 순차로 뜨지 않았다 (선택 ${seqCount.picks}회)`);
    console.log(`⑸ 비교 팝업 순차 선택 ${seqCount.picks}회 후 자동제작 ${seqCount.on ? '진행 중' : '정지'}`);

    // ---- ⑹-b '계속하기' OFF면 첫 선택 후 정지 ----
    const offCase = await page.evaluate(async () => {
        S.hammers = 200; S.autoForgeOn = false; UI._autoSeq = null;
        UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
        S.autoForge.continueOnTarget = false; S.autoForge.hammersPerBatch = 10;
        Forge.passesAutoFilter = () => true;
        UI.onToggleAutoForge();
        for (let i = 0; i < 200 && UI.els.craftModal.classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 50));
        UI.resolveCraft('sell');
        if (!document.getElementById('detail-modal').classList.contains('hidden')) UI.onSellConfirm();
        await new Promise(r => setTimeout(r, 1500));
        return { on: S.autoForgeOn, seq: !!UI._autoSeq };
    });
    ok(!offCase.on && !offCase.seq, "'계속하기' OFF인데 첫 선택 후에도 자동제작이 계속됐다");
    console.log(`⑹-b 계속하기 OFF → 첫 선택 후 정지 ${!offCase.on}`);

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
