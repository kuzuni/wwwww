// '보관함 제거 + 보류 1슬롯' 모델 검증 (사용자 확정 2026-08-17 — 보관함은 만든 적 없는 시스템이라 폐기)
//  ⑴ 보관함 UI·배지·목록·API가 화면과 코드 어디에도 없다
//  ⑵ [장착] → 이전 장비는 그냥 사라진다(코인 0, 어디에도 안 남음)
//  ⑶ 제작 후 결정 전에는 보류 카드가 모루 자리를 차지하고, 처리 전엔 다음 제작 불가
//  ⑷ 보류 카드 클릭 → 비교 팝업 재등장
//  ⑸ 필터에서 제외되는 보류 카드는 자동제작을 켜면 자동 판매되고 진행된다
//  ⑹ 구세이브의 S.inventory·S.heldCrafts는 로드 시 조용히 폐기된다
// 사용: node probe-hold-slot.js
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
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.hammers = 1e6; S.forgeLevel = 30; S.bestChapter = 5; S.bestStage = 9;
        UI.playAnvilStrike = cb => cb();   // 연출 0.72초 건너뛰기
    });

    // ⑴ 보관함 흔적이 없다
    const gone = await page.evaluate(() => ({
        forgeApi: ['ensureInventory', 'inventoryOf', 'store', 'equipStored', 'sellStored', 'INVENTORY_CAP']
            .filter(k => Forge[k] !== undefined),
        uiApi: ['storedListHTML', 'onEquipStored', 'onSellStored', 'heldCrafts'].filter(k => UI[k] !== undefined),
        state: ['inventory', 'heldCrafts'].filter(k => S[k] !== undefined),
    }));
    ok(!gone.forgeApi.length && !gone.uiApi.length && !gone.state.length,
        `보관함 잔재가 남아 있다 ${JSON.stringify(gone)}`);

    // ⑵ [장착] — 이전 장비 소멸, 코인 0
    const eq = await page.evaluate(() => {
        const a = Forge.rollItem(); a.slot = 'weapon'; Forge.equip(a);
        const b = Forge.rollItem(); b.slot = 'weapon';
        const coins0 = S.coins;
        UI.setPendingCraft(b); UI.showCraftModal(b);
        UI.resolveCraft('equip');
        const save = JSON.parse(localStorage.getItem('forgeclone_save_v1')) || {};
        return {
            equipped: S.equipment.weapon === b, coinDelta: S.coins - coins0,
            prevAnywhere: JSON.stringify(save).indexOf(a.name) >= 0 && S.equipment.weapon.name !== a.name,
            invKey: save.inventory !== undefined,
        };
    });
    ok(eq.equipped, '[장착] 후 새 장비가 장착되지 않았다');
    ok(eq.coinDelta === 0, `[장착]인데 코인이 늘었다 (+${eq.coinDelta})`);
    ok(!eq.invKey, '세이브에 inventory 키가 남아 있다');
    console.log(`⑵ [장착]: 장착 ${eq.equipped} · 코인 +${eq.coinDelta} · 세이브 inventory 키 ${eq.invKey}`);

    // ⑶ 제작 → 보류 카드가 모루 자리 점유, 처리 전엔 재제작 불가
    const hold = await page.evaluate(() => {
        UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden'); UI.renderEquipSheet();
        UI.onCraft();                                     // 1회 제작 → 비교 팝업
        const modalOpen = !UI.els.craftModal.classList.contains('hidden');
        // 딤 클릭 대신 같은 경로(보류)를 직접 태운다
        UI.onCraftDimClick({ target: UI.els.craftModal });
        const card = document.querySelector('.anvil-btn.held-slot');
        const h0 = S.hammers;
        UI.onCraft();                                     // 보류 중 재제작 시도
        return {
            modalOpen, card: !!card, pending: !!S.pendingCraft,
            hammerSpent: h0 - S.hammers,
            reopened: !UI.els.craftModal.classList.contains('hidden'),
        };
    });
    ok(hold.modalOpen, '제작했는데 비교 팝업이 안 떴다');
    ok(hold.card && hold.pending, '보류 카드가 모루 자리에 놓이지 않았다');
    ok(hold.hammerSpent === 0, `보류 중인데 재제작으로 해머가 ${hold.hammerSpent}개 나갔다`);
    ok(hold.reopened, '보류 중 모루를 누르면 그 카드의 비교 팝업이 떠야 한다');
    console.log(`⑶⑷ 보류: 카드 ${hold.card} · 재제작 해머 소모 ${hold.hammerSpent} · 모루 클릭 시 팝업 재등장 ${hold.reopened}`);

    // ⑸ 필터에서 빠지는 보류 카드는 자동제작 시 자동 판매
    const auto = await page.evaluate(async () => {
        UI.els.craftModal.classList.add('hidden');
        if (!S.pendingCraft) { const it = Forge.rollItem(); UI.setPendingCraft(it); }
        UI.renderEquipSheet();
        const held = S.pendingCraft, coins0 = S.coins;
        Forge.passesAutoFilter = () => false;      // 보류품이 필터에서 빠지는 상황
        Forge.isMatchingGear = () => false;
        S.autoForge.hammersPerBatch = 1; S.autoForge.continueOnTarget = false;
        S.autoForgeOn = false; UI._autoSeq = null;
        UI.onToggleAutoForge();                    // 자동제작 시작
        await new Promise(r => setTimeout(r, 600));
        return {
            heldName: held.name, sold: S.coins > coins0, stillPending: S.pendingCraft && S.pendingCraft.name === held.name,
            card: !!document.querySelector('.anvil-btn.held-slot'),
        };
    });
    ok(auto.sold && !auto.stillPending, `필터 제외 보류품이 자동 판매되지 않았다 ${JSON.stringify(auto)}`);
    console.log(`⑸ 자동제작: 필터 제외 보류품(${auto.heldName}) 자동 판매 ${auto.sold}`);

    // ⑹ 구세이브 마이그레이션 — inventory·heldCrafts가 조용히 사라진다
    const migrated = await page.evaluate(async () => {
        const save = JSON.parse(localStorage.getItem('forgeclone_save_v1'));
        save.inventory = { weapon: [{ name: '옛보관품', slot: 'weapon', rarity: 'common', age: 'primitive', level: 1, value: 1, subs: [], main: 'atk' }] };
        save.heldCrafts = [{ name: '옛보류품', slot: 'helmet', rarity: 'common', age: 'primitive', level: 1, value: 1, subs: [], main: 'hp' }];
        save.pendingCraft = null;
        localStorage.setItem('forgeclone_save_v1', JSON.stringify(save));
        loadGame();
        return { inv: S.inventory, held: S.heldCrafts, pendingName: S.pendingCraft && S.pendingCraft.name };
    });
    ok(migrated.inv === undefined && migrated.held === undefined, '구세이브의 보관함/보류 큐가 남았다');
    console.log(`⑹ 구세이브: inventory ${migrated.inv} · heldCrafts ${migrated.held} · 보류 1슬롯 복원 "${migrated.pendingName}"`);

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
