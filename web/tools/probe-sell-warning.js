// 판매 경고 규칙 검증 (사용자 재확인 2026-08-17): 비교 기준은 **오직 등급 인덱스**다.
//  ① 같은 등급 → 무경고 (시대·레벨·전투력이 아무리 달라도)
//  ② 파는 쪽 등급이 더 높을 때만 경고
//  ③ 더 낮으면 무경고  ④ 빈 부위는 비교 대상이 없으니 무경고
//  ⑤ [장착]은 파는 게 없으므로 언제나 무경고
// 경고 없이 바로 팔리는지는 '팝업이 떴는가 + 코인이 늘었는가'로 함께 본다.
// 사용: node probe-sell-warning.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// [팔 장비 등급, 장착 중 등급, 경고 기대] — 시대/레벨은 일부러 어긋나게 준다
const CASES = [
    ['common', 'common', false, '같은 등급(일반↔일반)'],
    ['mythic', 'mythic', false, '같은 등급(신화↔신화, 시대·레벨 다름)'],
    ['epic', 'epic', false, '같은 등급(영웅↔영웅)'],
    ['rare', 'common', true, '한 단계 높음(희귀>일반)'],
    ['mythic', 'common', true, '많이 높음(신화>일반)'],
    ['common', 'mythic', false, '낮음(일반<신화)'],
    ['epic', 'legendary', false, '낮음(영웅<전설)'],
];

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
        Combat.tick = function () {};   // 전투 수입이 코인 델타를 오염시키지 않게
        S.hammers = 1e6; S.forgeLevel = 30;
    });

    for (const [sellR, keepR, expect, label] of CASES) {
        const r = await page.evaluate(({ sellR, keepR }) => {
            UI.closeDetail();
            // 장착품: 낮은 시대·높은 레벨 / 파는 것: 높은 시대·낮은 레벨 — 등급 외 축을 일부러 어긋냄
            const cur = Forge.rollItem(); cur.slot = 'weapon'; cur.rarity = keepR; cur.age = AGES[0]; cur.level = 90;
            S.equipment.weapon = cur;
            const it = Forge.rollItem(); it.slot = 'weapon'; it.rarity = sellR; it.age = AGES[AGES.length - 1]; it.level = 1;
            const coins0 = S.coins;
            UI.setPendingCraft(it); UI.showCraftModal(it);
            UI.resolveCraft('sell');
            const warned = !document.getElementById('detail-modal').classList.contains('hidden');
            const text = warned ? document.getElementById('detail-modal').innerText.replace(/\s+/g, ' ').slice(0, 40) : '';
            if (warned) UI.onSellCancel();
            UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
            return { warned, coinDelta: S.coins - coins0, text };
        }, { sellR, keepR });
        ok(r.warned === expect, `${label}: 경고 ${r.warned ? '떴다' : '안 떴다'} (기대 ${expect ? '뜸' : '안 뜸'})`);
        // 경고가 안 떠야 하는 경우는 그 자리에서 바로 팔려야 한다(그냥 무시되면 안 됨)
        if (!expect) ok(r.coinDelta > 0, `${label}: 경고 없이 판매가 이뤄지지 않음 (코인 +${r.coinDelta})`);
        else ok(r.coinDelta === 0, `${label}: 경고가 떴는데 이미 팔렸다 (코인 +${r.coinDelta})`);
        console.log(`  ${expect ? '경고O' : '경고X'} ${label} → ${r.warned ? '경고' : `즉시 판매 +${r.coinDelta}`}`);
    }

    // ④ 빈 부위 — 무경고
    const empty = await page.evaluate(() => {
        UI.closeDetail(); S.equipment.weapon = null;
        const it = Forge.rollItem(); it.slot = 'weapon'; it.rarity = 'mythic';
        const coins0 = S.coins;
        UI.setPendingCraft(it); UI.showCraftModal(it); UI.resolveCraft('sell');
        const warned = !document.getElementById('detail-modal').classList.contains('hidden');
        if (warned) UI.onSellCancel();
        UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
        return { warned, coinDelta: S.coins - coins0 };
    });
    ok(!empty.warned, '빈 부위인데 경고가 떴다');
    ok(empty.coinDelta > 0, '빈 부위에서 판매가 이뤄지지 않음');
    console.log(`  경고X 빈 부위(신화 판매) → ${empty.warned ? '경고' : `즉시 판매 +${empty.coinDelta}`}`);

    // ⑤ [장착]은 언제나 무경고 (파는 게 없다)
    const eq = await page.evaluate(() => {
        UI.closeDetail();
        const cur = Forge.rollItem(); cur.slot = 'weapon'; cur.rarity = 'mythic'; S.equipment.weapon = cur;
        const it = Forge.rollItem(); it.slot = 'weapon'; it.rarity = 'common';
        const coins0 = S.coins;
        UI.setPendingCraft(it); UI.showCraftModal(it); UI.resolveCraft('equip');
        const warned = !document.getElementById('detail-modal').classList.contains('hidden');
        if (warned) UI.onSellCancel();
        return { warned, coinDelta: S.coins - coins0, storedMythic: Forge.inventoryOf('weapon').indexOf(cur) >= 0 };
    });
    ok(!eq.warned, '[장착]에 경고가 떴다 (파는 게 없는데)');
    ok(eq.coinDelta === 0 && eq.storedMythic, '[장착]에서 신화 장비가 팔렸다 (보관돼야 한다)');
    console.log(`  경고X [장착](신화→일반 교체) → 경고 ${eq.warned} · 코인 +${eq.coinDelta} · 신화 보관 ${eq.storedMythic}`);

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
