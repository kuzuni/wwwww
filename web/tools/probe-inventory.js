// '장착은 장착만, 판매는 판매 버튼으로만' 검증 (사용자 지시 2026-08-17)
//  ① 비교 팝업 [장착] → 새 장비 장착 + 기존 장비는 **보관함으로**(코인 증가 0)
//  ② 비교 팝업 [판매] → 새 장비만 팔리고 장착 중인 것은 그대로
//  ③ 보관함에서 재장착(맞교환) · 판매(그때만 코인 증가)
//  ④ 보관함 상한 초과분만 자동 판매 · 빈 부위도 보관품이 있으면 도달 가능
//  ⑤ 자동 경로(오토포지/탭 전환 자동 판정)도 밀려난 장비를 팔지 않음
// 전투 수입이 코인 델타를 오염시키므로 Combat.tick을 무력화하고 잰다.
// 사용: node probe-inventory.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

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
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 15000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};       // 전투 수입이 코인 델타를 오염시키지 않게
        S.hammers = 1e6; S.forgeLevel = 30;
        UI.playAnvilStrike = cb => cb();     // 제작 연출 0.72초 건너뛰기
    });

    // ① [장착] — 기존 장비는 팔리지 않고 보관함으로
    const r1 = await page.evaluate(() => {
        const a = Forge.rollItem(); a.slot = 'weapon'; Forge.equip(a);
        const b = Forge.rollItem(); b.slot = 'weapon';
        const coins0 = S.coins, inv0 = Forge.inventoryOf('weapon').length;
        UI.setPendingCraft(b); UI.showCraftModal(b);
        UI.resolveCraft('equip');
        const inv = Forge.inventoryOf('weapon');
        return {
            coinDelta: S.coins - coins0, invDelta: inv.length - inv0,
            equippedIsB: S.equipment.weapon === b, storedHasA: inv.indexOf(a) >= 0,
            warnShown: !document.getElementById('detail-modal').classList.contains('hidden'),
        };
    });
    ok(r1.equippedIsB, '[장착] 후 새 장비가 장착되지 않음');
    ok(r1.storedHasA && r1.invDelta === 1, '[장착] 후 기존 장비가 보관함에 없음');
    ok(r1.coinDelta === 0, `[장착]인데 코인이 늘었다 (+${r1.coinDelta}) — 기존 장비가 팔렸다`);
    ok(!r1.warnShown, '[장착]에 판매 경고가 떴다 (파는 게 없는데)');

    // ② [판매] — 새 장비만 팔리고 장착 중인 것은 그대로
    const r2 = await page.evaluate(() => {
        const cur = S.equipment.weapon;
        const c = Forge.rollItem(); c.slot = 'weapon'; c.rarity = cur.rarity; // 같은 등급 → 경고 없음
        const coins0 = S.coins, inv0 = Forge.inventoryOf('weapon').length;
        UI.setPendingCraft(c); UI.showCraftModal(c);
        UI.resolveCraft('sell');
        return {
            coinDelta: S.coins - coins0, price: Forge.sellPrice(c),
            stillEquipped: S.equipment.weapon === cur, invDelta: Forge.inventoryOf('weapon').length - inv0,
        };
    });
    ok(r2.coinDelta === r2.price, `[판매] 코인 증가 ${r2.coinDelta} ≠ 판매가 ${r2.price}`);
    ok(r2.stillEquipped, '[판매]인데 장착 장비가 바뀌었다');
    ok(r2.invDelta === 0, '[판매]인데 보관함이 늘었다');

    // ③ 보관함 재장착(맞교환) — 실클릭으로
    await page.evaluate(() => { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.openGearDetail('weapon'); });
    await page.waitForTimeout(150);
    const box = await page.evaluate(() => {
        const btn = document.querySelector('#gear-detail-modal .inv-row .btn.equip');
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, self: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === btn || btn.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) };
    });
    ok(box && box.self, '보관함 [장착] 버튼이 없거나 다른 요소에 덮임');
    const before3 = await page.evaluate(() => ({ eq: S.equipment.weapon.name, inv: Forge.inventoryOf('weapon').map(i => i.name), coins: S.coins }));
    if (box) await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(150);
    const r3 = await page.evaluate(() => ({ eq: S.equipment.weapon.name, inv: Forge.inventoryOf('weapon').map(i => i.name), coins: S.coins }));
    ok(r3.eq !== before3.eq || before3.inv[0] === before3.eq, '보관함 [장착]이 장착을 바꾸지 않음');
    ok(r3.inv.length === before3.inv.length, `보관함 [장착]이 맞교환이 아님 (${before3.inv.length} → ${r3.inv.length})`);
    ok(r3.coins === before3.coins, '보관함 [장착]에서 코인이 늘었다 (판매가 일어남)');
    ok(r3.inv.indexOf(before3.eq) >= 0, '쓰던 장비가 보관함에 들어가지 않음');

    // ④ 보관함 [판매] — 이때만 코인 증가
    const r4 = await page.evaluate(() => {
        const list = Forge.inventoryOf('weapon');
        const target = list[0], price = Forge.sellPrice(target), n0 = list.length, coins0 = S.coins;
        UI.onSellStored('weapon', 0);
        return { gone: Forge.inventoryOf('weapon').indexOf(target) < 0, n0, n: Forge.inventoryOf('weapon').length, delta: S.coins - coins0, price };
    });
    ok(r4.gone && r4.n === r4.n0 - 1, '보관함 [판매] 후에도 목록에 남아 있음');
    ok(r4.delta === r4.price, `보관함 [판매] 코인 ${r4.delta} ≠ 판매가 ${r4.price}`);

    // ⑤ 상한 초과 — 가장 약한 것만 자동 판매되고 상한이 유지되는지
    const r5 = await page.evaluate(() => {
        S.inventory.helmet = [];
        const mk = v => { const it = Forge.rollItem(); it.slot = 'helmet'; it.value = v; return it; };
        for (let i = 0; i < Forge.INVENTORY_CAP; i++) Forge.store(mk(1000 + i));
        const weakest = Forge.inventoryOf('helmet').slice().sort((a, b) => Forge.itemValue(a).cmp(Forge.itemValue(b)))[0];
        const coins0 = S.coins;
        const overflow = Forge.store(mk(9999));
        const list = Forge.inventoryOf('helmet');
        return { len: list.length, cap: Forge.INVENTORY_CAP, weakestGone: list.indexOf(weakest) < 0, overflow, coinDelta: S.coins - coins0 };
    });
    ok(r5.len === r5.cap, `보관함 상한 초과 (${r5.len} > ${r5.cap})`);
    ok(r5.weakestGone && r5.overflow > 0 && r5.coinDelta === r5.overflow, '상한 초과 시 가장 약한 장비가 팔리지 않음');

    // ⑥ 빈 부위도 보관품이 있으면 열린다
    const r6 = await page.evaluate(() => {
        UI.closeGearDetail();
        S.equipment.belt = null; S.inventory.belt = [];
        const it = Forge.rollItem(); it.slot = 'belt'; Forge.store(it);
        UI.renderEquipSheet();
        const cell = [...document.querySelectorAll('.equip-cell.empty')].find(c => (c.getAttribute('onclick') || '').includes("'belt'"));
        if (cell) cell.click();
        const open = !document.getElementById('gear-detail-modal').classList.contains('hidden');
        const rows = document.querySelectorAll('#gear-detail-modal .inv-row').length;
        return { hasCell: !!cell, open, rows };
    });
    ok(r6.hasCell, '보관품이 있는 빈 부위 칸이 눌리지 않는다');
    ok(r6.open && r6.rows === 1, `빈 부위 보관함이 열리지 않음 (open=${r6.open}, rows=${r6.rows})`);

    // ⑦ 자동 경로(오토포지/탭 전환 자동 판정)도 밀려난 장비를 팔지 않는다
    const r7 = await page.evaluate(() => {
        S.inventory.armor = []; S.equipment.armor = null;
        const weak = Forge.rollItem(); weak.slot = 'armor'; weak.value = 10; weak.stars = 0; Forge.equip(weak);
        const strong = Forge.rollItem(); strong.slot = 'armor'; strong.value = 1e9;
        const coins0 = S.coins;
        const r = Forge.autoResolve(strong);
        return { equipped: r.equipped, coinDelta: S.coins - coins0, stored: Forge.inventoryOf('armor').indexOf(weak) >= 0 };
    });
    ok(r7.equipped && r7.stored, '자동 장착에서 밀려난 장비가 보관되지 않음');
    ok(r7.coinDelta === 0, `자동 장착인데 코인이 늘었다 (+${r7.coinDelta})`);

    // ⑧ 세이브 왕복 — 보관함이 살아남는지
    const r8 = await page.evaluate(() => {
        saveGame();
        const raw = JSON.parse(localStorage.getItem('forgeclone_save_v1'));
        return { saved: !!(raw.inventory && raw.inventory.weapon), n: (raw.inventory.helmet || []).length };
    });
    ok(r8.saved && r8.n === 20, `세이브에 보관함이 안 남음 (${JSON.stringify(r8)})`);

    console.log(`① [장착]: 코인 +${r1.coinDelta} · 보관 +${r1.invDelta} · 경고 ${r1.warnShown ? '뜸' : '없음'}`);
    console.log(`② [판매]: 코인 +${r2.coinDelta}(판매가 ${r2.price}) · 보관 +${r2.invDelta} · 장착 유지 ${r2.stillEquipped}`);
    console.log(`③ 보관함 재장착: 장착 ${before3.eq} → ${r3.eq} · 보관 ${before3.inv.length}→${r3.inv.length} · 코인 +${r3.coins - before3.coins}`);
    console.log(`④ 보관함 판매: ${r4.n0}→${r4.n} · 코인 +${r4.delta}(판매가 ${r4.price})`);
    console.log(`⑤ 상한: ${r5.len}/${r5.cap} · 초과 자동판매 +${r5.overflow}`);
    console.log(`⑥ 빈 부위 보관함: 열림 ${r6.open} · 줄 ${r6.rows}`);
    console.log(`⑦ 자동 장착: 보관 ${r7.stored} · 코인 +${r7.coinDelta}`);
    console.log(`⑧ 세이브 왕복: inventory 저장 ${r8.saved} · helmet ${r8.n}개`);
    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
