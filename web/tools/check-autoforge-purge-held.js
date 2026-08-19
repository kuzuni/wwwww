// 자동 제련 [시작] = **현재 필터로 기존 보류품 일괄 재판정 → 탈락분 조용히 판매** 회귀 검사
// — `autoforge-purge-held-nonmatch-on-start` (사용자 지시 2026-08-20)
//
// 사용자 원문: "만약에 원시적 같은 게 존나 뽑혔었는데 보류돼 있다 쳤을 때, 내가 자동제련에 '현대의'만
// 체크했다 치고 시작 돌리면, 기존 원시적 보류돼 있는 거는 필터에 안 걸리니까 싹 다 판매되고 자동제련
// 돌려지게 하면 됨. 지금은 그런 상황이면 비교팝업 뜨면서 판매·장착할지 선택하라더라."
//
// 검증 항목:
//  ① 큐(S.autoMatchQueue)에 옛 필터로 통과해 쌓인 탈락분이 **비교 팝업 없이 판매**된다(코인 증가)
//  ② 통과분은 그대로 남아 종전대로 비교 팝업으로 흐른다
//  ③ 모루 자리 대기품(_pendingItem)이 탈락이면 **떠 있던 비교 팝업이 접히고** 같이 판매된다
//  ④ 보류 모드(S.autoMatchHeld=true)로 쌓아 둔 것에도 같은 규칙이 적용된다
//  ⑤ 대기품·큐가 전부 통과면 아무것도 안 판다(무해한 no-op)
//  ⑥ 콘솔/페이지 에러 0
//
// ⚠️ 망치는 0으로 두고 잰다 — 재판정 직후 `autoSeqStep`이 새 배치를 뽑으면 코인·큐가 섞여 측정이 무의미해진다.
//
// 사용: node check-autoforge-purge-held.js
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

    // 한 시나리오를 통째로 세우고 [시작]을 눌러 결과를 돌려준다.
    //   heldAge  = 모루 자리 대기품의 시대(null 이면 대기품 없음) / popup = 그 팝업을 띄워 둘지
    //   queueAges = 큐에 쌓아 둘 통과분들의 시대 / keepAges = '지금' 체크돼 있는 유지 시대
    const run = (opt) => page.evaluate((o) => {
        UI.switchTab(null);
        // 이전 시나리오 잔재를 완전히 걷어낸다
        UI.cancelAnvilStrike();
        UI.els.craftModal.classList.add('hidden');
        UI._autoSeq = null;
        S.autoForgeOn = false;
        S.autoBatch = null;
        S.autoMatchQueue = [];
        S.autoMatchHeld = !!o.heldMode;
        UI._pendingItem = null; S.pendingCraft = null;

        // 재료 뽑기용으로만 망치를 잠깐 준다 — 잰 뒤 0으로 되돌려 새 배치가 못 돌게 한다.
        S.hammers = 60;
        const mk = (age) => { const it = Forge.craft(1)[0]; it.age = age; return it; };
        const queued = (o.queueAges || []).map(mk);
        const held = o.heldAge ? mk(o.heldAge) : null;
        for (const it of queued) S.autoMatchQueue.push(it);
        if (held) { UI.setPendingCraft(held); if (o.popup) UI.showCraftModal(held); }

        // '지금' 필터 = 사용자가 방금 체크한 유지 시대
        const cfg = Forge.autoForgeConfig();
        cfg.keepAges = o.keepAges.slice();
        cfg.filterOn = false; cfg.filterSubs = [];

        S.hammers = 0;                 // ⚠️ 여기서부터 새 제작은 일어날 수 없다
        const before = { coins: S.coins, queue: S.autoMatchQueue.length, held: !!UI._pendingItem };

        S.autoForgeOn = true;          // onToggleAutoForge 가 켠 것과 같은 상태로 진입
        UI.startAutoSeq();

        return {
            before,
            coins: S.coins,
            coinGain: S.coins - before.coins,
            queue: S.autoMatchQueue.length,
            queueAges: S.autoMatchQueue.map(i => i.age),
            pendingAge: UI._pendingItem ? UI._pendingItem.age : null,
            modalHidden: UI.els.craftModal.classList.contains('hidden'),
            heldMode: S.autoMatchHeld,
        };
    }, opt);

    // `const AGES`(gamedata.js)는 스크립트 스코프라 window 에 안 붙는다 — 맨이름으로 읽는다.
    const AGE_LIST = await page.evaluate(() => AGES.slice(0, 4));
    const [A0, A1] = AGE_LIST;   // A0 = '원시적'류(탈락시킬 시대) · A1 = '현대의'류(체크한 시대)
    console.log(`시대: 탈락=${A0} · 유지체크=${A1}\n`);

    // ── ① 큐에 쌓인 탈락분 3개 → 팝업 없이 전부 판매 ──
    console.log('① 큐의 탈락분은 팝업 없이 전부 판매');
    let r = await run({ queueAges: [A0, A0, A0], keepAges: [A1] });
    check('큐가 비워졌다', r.queue === 0, `${r.before.queue} → ${r.queue}`);
    check('판매 대금이 들어왔다', r.coinGain > 0, `+${r.coinGain} 코인`);
    check('비교 팝업이 안 떴다', r.modalHidden === true, `modalHidden=${r.modalHidden}`);
    check('대기품도 안 남았다', r.pendingAge === null, `pending=${r.pendingAge}`);

    // ── ② 통과분은 그대로 남아 비교 팝업으로 흐른다 ──
    console.log('② 통과분은 살아남아 종전대로 팝업');
    r = await run({ queueAges: [A0, A1, A0], keepAges: [A1] });
    check('탈락 2개만 팔렸다', r.coinGain > 0, `+${r.coinGain} 코인`);
    check('통과 1개가 대기품으로 올라왔다', r.pendingAge === A1, `pending=${r.pendingAge}`);
    check('그 통과분의 비교 팝업이 떴다', r.modalHidden === false, `modalHidden=${r.modalHidden}`);
    check('큐에 남은 게 없다', r.queue === 0, `queue=${r.queue}`);

    // ── ③ 떠 있던 팝업의 대기품이 탈락이면 팝업이 접히고 같이 팔린다 ──
    console.log('③ 떠 있던 탈락 팝업은 접히고 판매');
    r = await run({ heldAge: A0, popup: true, queueAges: [A0], keepAges: [A1] });
    check('팝업이 접혔다', r.modalHidden === true, `modalHidden=${r.modalHidden}`);
    check('대기품이 팔려 비었다', r.pendingAge === null, `pending=${r.pendingAge}`);
    check('큐도 비었다', r.queue === 0, `queue=${r.queue}`);
    check('둘 다 판매 대금', r.coinGain > 0, `+${r.coinGain} 코인`);

    // ── ④ 보류 모드로 쌓아 둔 것도 같은 규칙 ──
    console.log('④ 보류 모드(딤으로 전부 보류)로 쌓인 것도 재판정');
    r = await run({ heldMode: true, queueAges: [A0, A0, A1], keepAges: [A1] });
    check('보류 모드가 풀렸다', r.heldMode === false, `held=${r.heldMode}`);
    check('탈락 2개가 팔렸다', r.coinGain > 0, `+${r.coinGain} 코인`);
    check('통과 1개만 남아 팝업', r.pendingAge === A1 && r.modalHidden === false, `pending=${r.pendingAge} modalHidden=${r.modalHidden}`);

    // ── ⑤ 전부 통과면 아무것도 안 판다 ──
    console.log('⑤ 전부 통과면 no-op (판매 0)');
    r = await run({ heldAge: A1, popup: true, queueAges: [A1, A1], keepAges: [A1] });
    check('코인 변화 없음', r.coinGain === 0, `+${r.coinGain} 코인`);
    check('대기품 유지 + 팝업 유지', r.pendingAge === A1 && r.modalHidden === false, `pending=${r.pendingAge} modalHidden=${r.modalHidden}`);
    check('큐 2개 그대로', r.queue === 2, `queue=${r.queue}`);

    // ── ⑥ 에러 0 ──
    console.log('⑥ 콘솔/페이지 에러');
    check('에러 0건', errors.length === 0, errors.slice(0, 3).join(' | '));

    await browser.close();
    console.log(fails.length ? `\n❌ FAIL ${fails.length}건\n - ` + fails.join('\n - ') : '\n✅ ALL PASS');
    process.exit(fails.length ? 1 : 0);
})();
