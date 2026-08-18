// 판매 경고 규칙 검증 (**비교 축 확정 2026-08-18**): 비교 기준은 **오직 시대(AGES) 인덱스**다.
//   사용자 확정 — "장비는 AGE 가 등급이고, 일반/서사시 이런 건 펫·탈것·스킬의 등급이다.
//   장비는 그런 등급(rarity)을 안 쓰니 폐기해야 한다." 그래서 rarity 는 판정에서 완전히 빠졌다.
//  ① 같은 시대 → 무경고 (rarity·레벨·전투력이 아무리 달라도)
//  ② 파는 쪽 시대가 더 최신일 때만 경고 (rarity 가 더 낮아도 경고 — ⓐ 사용자 예시가 이 케이스)
//  ③ 더 이전이면 무경고 (rarity 가 더 높아도 무경고)
//  ④ 빈 부위는 비교 대상이 없으니 무경고  ⑤ [장착]은 파는 게 없으므로 언제나 무경고
// 경고 없이 바로 팔리는지는 '팝업이 떴는가 + 코인이 늘었는가'로 함께 본다.
// 사용: node probe-sell-warning.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// [파는 것 시대, 파는 것 rarity, 장착 중 시대, 장착 중 rarity, 경고 기대, 설명]
// rarity 는 **판정을 뒤집으려는 방향으로 일부러 어긋나게** 준다 — 옛 rarity 규칙이 살아 있으면
// 아래 ⓐ·ⓑ·ⓕ 중 하나는 반드시 실패한다(그게 이 케이스 표의 존재 이유다).
const CASES = [
    // ⓐ 사용자 원문 케이스: "원시 장착하고 중세의 팔려고 하면 경고 안 뜨더라" — rarity 는 파는 쪽이 더 낮다
    ['medieval', 'common', 'primitive', 'mythic', true, '최신 시대(중세의>원시적) · rarity 는 파는 쪽이 낮음'],
    ['divine', 'common', 'primitive', 'mythic', true, '많이 최신(천상>원시적) · rarity 는 파는 쪽이 낮음'],
    ['medieval', 'mythic', 'primitive', 'common', true, '최신 시대(중세의>원시적) · rarity 도 높음'],
    // ⓑ 같은 시대면 rarity 가 아무리 갈려도 무경고
    ['primitive', 'mythic', 'primitive', 'common', false, '같은 시대(원시적↔원시적) · rarity 는 신화>일반'],
    ['divine', 'common', 'divine', 'mythic', false, '같은 시대(천상↔천상) · rarity 는 일반<신화'],
    // ⓕ 이전 시대면 rarity 가 높아도 무경고
    ['primitive', 'mythic', 'divine', 'common', false, '이전 시대(원시적<천상) · rarity 는 신화>일반'],
    ['medieval', 'legendary', 'modern', 'common', false, '이전 시대(중세의<현대의) · rarity 는 전설>일반'],
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
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};   // 전투 수입이 코인 델타를 오염시키지 않게
        S.hammers = 1e6; S.forgeLevel = 30;
    });

    for (const [sellAge, sellR, keepAge, keepR, expect, label] of CASES) {
        const r = await page.evaluate(({ sellAge, sellR, keepAge, keepR }) => {
            UI.closeDetail();
            // 레벨도 시대와 반대로 준다 — 시대 외 축(rarity·레벨)이 판정에 새어 들어오면 잡히도록
            const cur = Forge.rollItem(); cur.slot = 'weapon'; cur.rarity = keepR; cur.age = keepAge; cur.level = 90;
            S.equipment.weapon = cur;
            const it = Forge.rollItem(); it.slot = 'weapon'; it.rarity = sellR; it.age = sellAge; it.level = 1;
            const coins0 = S.coins;
            UI.setPendingCraft(it); UI.showCraftModal(it);
            UI.resolveCraft('sell');
            const warned = !document.getElementById('detail-modal').classList.contains('hidden');
            const text = warned ? document.getElementById('detail-modal').innerText.replace(/\s+/g, ' ').slice(0, 40) : '';
            if (warned) UI.onSellCancel();
            UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
            return { warned, coinDelta: S.coins - coins0, text };
        }, { sellAge, sellR, keepAge, keepR });
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
        // 보관함은 폐기됐다 — [장착] 시 이전 장비는 그냥 사라진다(코인이 안 늘어야 한다는 것만 본다)
        return { warned, coinDelta: S.coins - coins0, equippedNew: S.equipment.weapon === it };
    });
    ok(!eq.warned, '[장착]에 경고가 떴다 (파는 게 없는데)');
    ok(eq.coinDelta === 0 && eq.equippedNew, '[장착]에서 신화 장비가 팔렸다 (그냥 사라져야 한다)');
    console.log(`  경고X [장착](신화→일반 교체) → 경고 ${eq.warned} · 코인 +${eq.coinDelta} · 새 장비 장착 ${eq.equippedNew}`);

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
