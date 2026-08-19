// 자동 제련 비교 팝업 딤 = **남은 것 전부 보류** 회귀 검사 — `autoforge-dim-hold-all` (사용자 지시 2026-08-19)
//
// 사용자 원문: "자동제련 모드에서 비교팝업 떴는데 딤 누르면 그 1개만 보류되는 게 아니라 남은 것들 다
// 보류돼야 함. 그래서 보류했다가 다시 클릭 시 해당 꺼 비교팝업 떠서 선택 다시 할 수 있게."
//
// 검증 항목:
//  ① 딤 클릭 → 통과분 큐가 하나도 소비/자동판정되지 않고 그대로 남는다 + 자동 제련이 멈춘다
//  ② 모루 자리에 보류 카드 + 총 보류 개수 배지, 비교 팝업은 닫혀 있다
//  ③ 보류 카드 클릭 → **그 장비의** 비교 팝업이 다시 뜬다(다시 선택 가능)
//  ④ 하나 고르면(판매) 다음 보류품이 카드 자리로 올라오고 **팝업은 저절로 뜨지 않는다**
//  ⑤ 보류 중 탭을 옮겨도 보류품이 자동 판매되지 않는다(보류의 뜻이 '나중에 내가 고른다')
//  ⑥ 마지막 하나까지 고르면 보류 모드가 풀린다 / 자동 제련을 다시 켜면 보류 모드가 풀린다
//
// 사용: PW_PATH=... node check-autoforge-dim-hold.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const fails = [];
    const check = (name, ok, detail) => {
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
        if (!ok) fails.push(name + (detail ? ' (' + detail + ')' : ''));
    };

    // ── 준비: 통과분 3개가 큐에 쌓이고 첫 장이 비교 팝업으로 떠 있는 상태(②단계 한복판) ──
    const setup = await page.evaluate(() => {
        UI.switchTab(null);                       // 장비 시트(모루 행)가 보이는 기본 화면
        S.hammers = 50;
        S.autoMatchQueue = [];
        S.autoMatchHeld = false;
        const made = [];
        for (let i = 0; i < 3; i++) made.push(Forge.craft(1)[0]);
        UI.setPendingCraft(made[0]);              // 첫 장 = 지금 팝업에 떠 있는 것
        for (let i = 1; i < made.length; i++) S.autoMatchQueue.push(made[i]);
        S.autoForgeOn = true;
        UI._autoSeq = { stopAfterPick: false };   // 자동 시퀀스 한복판 (배치화 후 inCycle 없음)
        UI.showCraftModal(made[0]);
        UI.renderEquipSheet();
        return { names: made.map(m => m.name), queue: S.autoMatchQueue.length };
    });
    check('준비 — 팝업 1 + 큐 2', setup.queue === 2, `queue=${setup.queue} / ${setup.names.join(', ')}`);

    // ── ① 딤 클릭 = 남은 것 전부 보류 + 자동 정지 ──
    await page.evaluate(() => UI.els.craftModal.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(200);
    const afterDim = await page.evaluate(() => ({
        held: S.autoMatchHeld,
        queue: S.autoMatchQueue.length,
        autoOn: S.autoForgeOn,
        seq: !!UI._autoSeq,
        modalHidden: UI.els.craftModal.classList.contains('hidden'),
        pending: UI._pendingItem && UI._pendingItem.name,
        tag: (document.querySelector('.anvil-btn.held-slot .held-tag') || {}).textContent,
        cardName: (document.querySelector('.anvil-btn.held-slot .held-name') || {}).textContent,
        coins: S.coins,
    }));
    check('① 보류 모드 진입', afterDim.held === true);
    check('① 큐가 그대로 남는다(자동 판정 없음)', afterDim.queue === 2, `queue=${afterDim.queue}`);
    check('① 자동 제련 정지', afterDim.autoOn === false && afterDim.seq === false, `autoOn=${afterDim.autoOn} seq=${afterDim.seq}`);
    check('② 비교 팝업 닫힘', afterDim.modalHidden === true);
    check('② 모루 자리에 보류 카드', afterDim.cardName === setup.names[0], `card=${afterDim.cardName}`);
    check('② 보류 개수 배지 = 3', (afterDim.tag || '').trim() === '보류 3', `tag=${JSON.stringify(afterDim.tag)}`);

    // ── ③ 보류 카드 클릭 → 그 장비의 비교 팝업 재개 ──
    await page.click('.anvil-btn.held-slot');
    await page.waitForTimeout(200);
    const reopened = await page.evaluate(() => ({
        modalHidden: UI.els.craftModal.classList.contains('hidden'),
        pending: UI._pendingItem && UI._pendingItem.name,
        text: UI.els.craftModal.textContent || '',
    }));
    check('③ 카드 클릭 → 비교 팝업 재개', reopened.modalHidden === false);
    check('③ 그 장비의 팝업', reopened.pending === setup.names[0] && reopened.text.includes(setup.names[0]),
        `pending=${reopened.pending}`);

    // ── ④ 하나 판매 → 다음 보류품이 카드 자리로. 팝업은 저절로 안 뜬다 ──
    await page.evaluate(() => UI.resolveCraft('sell'));
    await page.waitForTimeout(300);
    const afterPick = await page.evaluate(() => ({
        modalHidden: UI.els.craftModal.classList.contains('hidden'),
        detailHidden: UI.els.detailModal.classList.contains('hidden'),
        pending: UI._pendingItem && UI._pendingItem.name,
        queue: S.autoMatchQueue.length,
        tag: (document.querySelector('.anvil-btn.held-slot .held-tag') || {}).textContent,
        held: S.autoMatchHeld,
    }));
    check('④ 선택 뒤 팝업이 저절로 뜨지 않는다', afterPick.modalHidden === true && afterPick.detailHidden === true);
    check('④ 다음 보류품이 카드로 승격', afterPick.pending === setup.names[1] && afterPick.queue === 1,
        `pending=${afterPick.pending} queue=${afterPick.queue}`);
    check('④ 배지 = 보류 2', (afterPick.tag || '').trim() === '보류 2', `tag=${JSON.stringify(afterPick.tag)}`);

    // ── ⑤ 탭 이동해도 보류품이 자동 판매되지 않는다 ──
    const beforeTab = await page.evaluate(() => ({ coins: S.coins, pending: UI._pendingItem && UI._pendingItem.name, queue: S.autoMatchQueue.length }));
    await page.evaluate(() => { UI.switchTab('pets'); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { UI.switchTab(null); });
    await page.waitForTimeout(200);
    const afterTab = await page.evaluate(() => ({
        coins: S.coins,
        pending: UI._pendingItem && UI._pendingItem.name,
        queue: S.autoMatchQueue.length,
        card: (document.querySelector('.anvil-btn.held-slot .held-name') || {}).textContent,
    }));
    check('⑤ 탭 이동에도 보류품 유지', afterTab.pending === beforeTab.pending && afterTab.queue === beforeTab.queue && afterTab.coins === beforeTab.coins,
        `pending=${afterTab.pending} queue=${afterTab.queue} coins=${beforeTab.coins}→${afterTab.coins}`);
    check('⑤ 돌아오면 보류 카드 그대로', afterTab.card === setup.names[1], `card=${afterTab.card}`);

    // ── ⑥ 마지막까지 고르면 보류 모드 해제 ──
    await page.evaluate(async () => {
        for (let i = 0; i < 4 && UI._pendingItem; i++) {
            UI.onOpenHeld();
            UI.resolveCraft('sell');
            if (!UI.els.detailModal.classList.contains('hidden')) UI.onSellConfirm();   // 시대 경고가 뜨면 확인
        }
    });
    await page.waitForTimeout(300);
    const drained = await page.evaluate(() => ({
        held: S.autoMatchHeld, queue: S.autoMatchQueue.length, pending: !!UI._pendingItem,
        anvil: !!document.querySelector('.anvil-btn') && !document.querySelector('.anvil-btn.held-slot'),
    }));
    check('⑥ 다 고르면 보류 모드 해제', drained.held === false && drained.queue === 0 && drained.pending === false,
        `held=${drained.held} queue=${drained.queue} pending=${drained.pending}`);
    check('⑥ 모루가 돌아온다', drained.anvil === true);

    // ── ⑥-2 자동 제련을 다시 켜면 보류 모드가 풀린다 ──
    const restart = await page.evaluate(() => {
        S.autoMatchHeld = true;
        S.autoForgeOn = true;
        UI.startAutoSeq();
        const r = { held: S.autoMatchHeld };
        UI.stopAutoSeq();
        return r;
    });
    check('⑥ 자동 재시작 시 보류 해제', restart.held === false);

    // ── ⑦ 보류 상태로 새로고침해도 팝업이 저절로 뜨지 않고 카드로 복원된다 ──
    //    (대기품 복원 경로 restorePendingCraft 는 원래 팝업을 바로 띄운다 — 보류만 예외)
    const names7 = await page.evaluate(() => {
        S.hammers = 50; S.autoMatchQueue = [];
        const made = [Forge.craft(1)[0], Forge.craft(1)[0]];
        UI.setPendingCraft(made[0]);
        S.autoMatchQueue.push(made[1]);
        S.autoMatchHeld = true;
        S.autoForgeOn = false;
        saveGame();
        return made.map(m => m.name);
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const restored = await page.evaluate(() => ({
        modalHidden: UI.els.craftModal.classList.contains('hidden'),
        held: S.autoMatchHeld,
        queue: S.autoMatchQueue.length,
        card: (document.querySelector('.anvil-btn.held-slot .held-name') || {}).textContent,
        tag: (document.querySelector('.anvil-btn.held-slot .held-tag') || {}).textContent,
    }));
    check('⑦ 새로고침 후 팝업 자동 노출 없음', restored.modalHidden === true && restored.held === true);
    check('⑦ 보류 카드·개수 복원', restored.card === names7[0] && restored.queue === 1 && (restored.tag || '').trim() === '보류 2',
        `card=${restored.card} queue=${restored.queue} tag=${JSON.stringify(restored.tag)}`);

    // 배지 글자가 카드 밖으로 새지 않는지(가로 폭) 실측 + 확인용 캡처
    const box = await page.evaluate(() => {
        const c = document.querySelector('.anvil-btn.held-slot'), t = c && c.querySelector('.held-tag');
        if (!c || !t) return null;
        const cb = c.getBoundingClientRect(), tb = t.getBoundingClientRect();
        return { cardW: +cb.width.toFixed(1), tagW: +tb.width.toFixed(1), overflow: +(tb.width - cb.width).toFixed(1) };
    });
    check('⑦ 개수 배지가 카드 폭 안', !!box && box.tagW <= box.cardW, box ? `tag ${box.tagW}px / card ${box.cardW}px` : 'no card');
    const anvilRow = await page.$('.anvil-row');
    if (anvilRow) await anvilRow.screenshot({ path: path.resolve(__dirname, 'autoforge-dim-hold-card.png') });

    // ── ⑧ 손으로 만든 상태가 아니라 **진짜 자동 제련 사이클**을 돌려서 같은 것을 확인한다 ──
    //    (망치질 → 카드 3장 → ②단계 팝업. 그 첫 팝업에서 딤을 누른다)
    await page.evaluate(() => {
        S.pendingCraft = null; UI._pendingItem = null; S.autoMatchQueue = []; S.autoMatchHeld = false;
        UI.els.craftModal.classList.add('hidden');
        S.hammers = 3;
        S.autoForge.keepAges = AGES.slice();     // 전부 목표 = 뽑는 족족 통과분(큐 적재)
        S.autoForge.hammersPerBatch = 3;
        S.autoForge.stopOnTarget = false;
        S.autoForgeOn = true;
        UI.renderEquipSheet();
        UI.startAutoSeq();
    });
    await page.waitForFunction(() => !UI.els.craftModal.classList.contains('hidden'), null, { timeout: 45000 })
        .catch(() => {});
    const realSeq = await page.evaluate(() => ({
        modalOpen: !UI.els.craftModal.classList.contains('hidden'),
        pending: !!UI._pendingItem,
        queue: S.autoMatchQueue.length,
    }));
    check('⑧ 실제 사이클 — 카드 3장 뒤 팝업 + 큐 2', realSeq.modalOpen && realSeq.pending && realSeq.queue === 2,
        `modal=${realSeq.modalOpen} queue=${realSeq.queue}`);
    await page.evaluate(() => UI.els.craftModal.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.waitForTimeout(400);
    const realDim = await page.evaluate(() => ({
        held: S.autoMatchHeld, queue: S.autoMatchQueue.length, autoOn: S.autoForgeOn, seq: !!UI._autoSeq,
        modalHidden: UI.els.craftModal.classList.contains('hidden'),
        tag: (document.querySelector('.anvil-btn.held-slot .held-tag') || {}).textContent,
    }));
    check('⑧ 실제 사이클에서도 전부 보류 + 정지',
        realDim.held === true && realDim.queue === 2 && realDim.autoOn === false && realDim.seq === false && realDim.modalHidden,
        `held=${realDim.held} queue=${realDim.queue} autoOn=${realDim.autoOn} seq=${realDim.seq}`);
    check('⑧ 배지 = 보류 3', (realDim.tag || '').trim() === '보류 3', `tag=${JSON.stringify(realDim.tag)}`);
    // 자동이 정말 멈췄는지 — 안전망 틱(3초)을 두 번 넘겨도 큐가 그대로여야 한다
    await page.waitForTimeout(7000);
    const stayed = await page.evaluate(() => ({ queue: S.autoMatchQueue.length, modalHidden: UI.els.craftModal.classList.contains('hidden'), held: S.autoMatchHeld }));
    check('⑧ 안전망 틱이 자동을 되살리지 않는다', stayed.queue === 2 && stayed.modalHidden && stayed.held,
        `queue=${stayed.queue} modalHidden=${stayed.modalHidden}`);

    console.log(errors.length ? '\n콘솔 에러:\n' + errors.join('\n') : '\n콘솔 에러 0');
    if (errors.length) fails.push('콘솔 에러 ' + errors.length + '건');
    console.log(fails.length ? `\n실패 ${fails.length}건:\n- ` + fails.join('\n- ') : '\n전부 통과');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
