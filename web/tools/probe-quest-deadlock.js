// 만렙 대장간에서 반복 퀘스트 슬롯이 영구 미완료로 막히는지 검증 — slug: quest-deadlock-maxforge
//
// 배경: 게임에서 코인이 나가는 지점은 대장간 강화 단 하나(`S.coins -=` 는 forge.js 한 줄이 전부)라
//       Lv.35(만렙)에서는 `coinSpend`·`gearUpgrade` 의 진행도가 영원히 0이다. 3슬롯짜리 반복 퀘스트에
//       이 둘이 끼면(포기·재추첨 버튼도 없다) 실질 슬롯이 1칸으로 줄어든다.
//
// 재는 것:
//   ⑴ 만렙에서 200회 재추첨해도 두 퀘스트가 한 번도 안 뽑힌다 + 슬롯은 항상 3칸을 채운다
//   ⑵ 만렙 도달 시점에 **이미 박혀 있던** 슬롯도 정리된다(roll 필터만으로는 안 빠진다)
//   ⑶ 깨 놓고 수령 전에 만렙이 된 퀘스트는 **뺏기지 않는다**(수령 가능 상태로 남는다)
//   ⑷ 만렙 이전에는 필터가 아무것도 안 걸러낸다 — 두 퀘스트가 정상적으로 뽑힌다(회귀 방지)
//   ⑸ 승천으로 Lv.1 로 돌아가면 다시 뽑힌다
//   ⑹ 만렙 상태에서 실제로 놀아도 막히지 않는다: 슬롯의 모든 퀘스트를 행동으로 깨서 20회 연속 수령
//
// ⚠️ 이 저장소의 Playwright 는 문자열 화살표 함수를 식으로 평가해 undefined 를 준다 —
//    반드시 `page.evaluate('(' + FN + ')()')` 로 즉시호출할 것.
//
// 사용: node probe-quest-deadlock.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const ev = (page, body) => page.evaluate(`(() => { ${body} })()`);
const LOCKED = ['coinSpend', 'gearUpgrade'];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Quests !== 'undefined', null, { timeout: 60000 });
    await ev(page, `if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; Combat.tick = function () {};`);

    const fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };

    // ⑴ 만렙 재추첨 200회
    const maxRoll = await ev(page, `
        S.forgeLevel = 35; S.forgeUpgradeEndsAt = 0; S.quests = []; S.questsCleared = 0;
        Quests.ensure();
        const seen = {}; let minSlots = 99;
        for (let i = 0; i < 200; i++) {
            S.quests = []; Quests.ensure();
            minSlots = Math.min(minSlots, S.quests.length);
            for (const q of S.quests) seen[q.id] = (seen[q.id] || 0) + 1;
        }
        return { seen, minSlots, ids: Object.keys(seen) };`);
    for (const id of LOCKED) ok(!maxRoll.seen[id], `만렙인데 '${id}' 가 ${maxRoll.seen[id]}회 뽑혔다`);
    ok(maxRoll.minSlots === 3, `만렙에서 슬롯이 ${maxRoll.minSlots}칸까지 줄었다(3칸이어야 한다)`);
    console.log(`  ⑴ 만렙 200회 재추첨 — 뽑힌 종류 ${maxRoll.ids.length}종, 슬롯 최소 ${maxRoll.minSlots}칸, 막힌 2종 0회`);

    // ⑵ 이미 박혀 있던 슬롯 정리 (진행도 0)
    const stuck = await ev(page, `
        S.forgeLevel = 35; S.forgeUpgradeEndsAt = 0;
        S.quests = [{ id: 'coinSpend', need: 2000, prog: 0, rw: { cur: 'hammers', amt: 10 } },
                    { id: 'gearUpgrade', need: 1, prog: 0, rw: { cur: 'hammers', amt: 10 } },
                    { id: 'craft', need: 10, prog: 2, rw: { cur: 'coins', amt: 400 } }];
        Quests.ensure();
        return { ids: S.quests.map(q => q.id), craftProg: (S.quests.find(q => q.id === 'craft') || {}).prog };`);
    for (const id of LOCKED) ok(stuck.ids.indexOf(id) < 0, `만렙 도달 시 이미 박힌 '${id}' 가 안 빠졌다`);
    ok(stuck.ids.length === 3, `정리 후 슬롯이 ${stuck.ids.length}칸이다`);
    ok(stuck.craftProg === 2, `무관한 퀘스트의 진행도가 ${stuck.craftProg} 로 날아갔다`);
    console.log(`  ⑵ 박힌 슬롯 정리 → ${stuck.ids.join(', ')} (craft 진행도 ${stuck.craftProg} 보존)`);

    // ⑶ 깨 놓고 수령 전에 만렙이 된 것은 남긴다
    const keepDone = await ev(page, `
        S.forgeLevel = 35; S.forgeUpgradeEndsAt = 0; S.hammers = 0;
        S.quests = [{ id: 'gearUpgrade', need: 1, prog: 1, rw: { cur: 'hammers', amt: 10 } }];
        Quests.ensure();
        const idx = S.quests.findIndex(q => q.id === 'gearUpgrade');
        const claimable = idx >= 0 && Quests.canClaim(idx);
        const got = claimable ? Quests.claim(idx) : null;
        return { kept: idx >= 0, claimable, got, hammers: S.hammers };`);
    ok(keepDone.kept && keepDone.claimable, '깬 상태의 gearUpgrade 가 만렙 정리에 휩쓸려 사라졌다(보상 강탈)');
    ok(keepDone.hammers === 10, `수령 보상이 안 들어왔다(해머 ${keepDone.hammers})`);
    console.log(`  ⑶ 깬 퀘스트 보존 → 수령 성공, 해머 +${keepDone.hammers}`);

    // ⑷ 만렙 이전 회귀 — 두 퀘스트가 정상적으로 뽑힌다
    const preMax = await ev(page, `
        S.forgeLevel = 20; S.forgeUpgradeEndsAt = 0; S.questsCleared = 0;
        const seen = {};
        for (let i = 0; i < 200; i++) { S.quests = []; Quests.ensure(); for (const q of S.quests) seen[q.id] = (seen[q.id] || 0) + 1; }
        return seen;`);
    for (const id of LOCKED) ok(preMax[id] > 0, `만렙 이전(Lv.20)인데 '${id}' 가 한 번도 안 뽑혔다 — 필터가 과하다`);
    console.log(`  ⑷ Lv.20 회귀 — coinSpend ${preMax.coinSpend}회 · gearUpgrade ${preMax.gearUpgrade}회 뽑힘`);

    // ⑸ 승천으로 Lv.1 복귀
    const afterAscend = await ev(page, `
        S.forgeLevel = 35; S.forgeUpgradeEndsAt = 0; S.quests = []; Quests.ensure();
        const before = S.quests.map(q => q.id);
        Ascension.ensure(); Ascension.ascend('forge');
        const seen = {};
        for (let i = 0; i < 120; i++) { S.quests = []; Quests.ensure(); for (const q of S.quests) seen[q.id] = (seen[q.id] || 0) + 1; }
        return { forgeLevel: S.forgeLevel, seen, before };`);
    ok(afterAscend.forgeLevel === 1, `승천 후 대장간 레벨이 ${afterAscend.forgeLevel} 이다`);
    for (const id of LOCKED) ok(afterAscend.seen[id] > 0, `승천으로 만렙이 풀렸는데 '${id}' 가 다시 안 뽑힌다`);
    console.log(`  ⑸ 승천 후 Lv.${afterAscend.forgeLevel} — coinSpend ${afterAscend.seen.coinSpend}회 · gearUpgrade ${afterAscend.seen.gearUpgrade}회 복귀`);

    // ⑹ 만렙 실사용 — 슬롯의 퀘스트를 행동으로 깨서 20회 연속 수령
    const play = await ev(page, `
        S.forgeLevel = 35; S.forgeUpgradeEndsAt = 0; S.quests = []; S.questsCleared = 0; Quests.ensure();
        let claims = 0, blocked = 0;
        for (let i = 0; i < 200 && claims < 20; i++) {
            const ids = Quests.list().map(q => q.id);
            // 막힌 2종은 bump 해도 안 오르는 게 정상이다 — 슬롯에 있으면 그게 곧 교착이다
            if (ids.some(id => ${JSON.stringify(LOCKED)}.indexOf(id) >= 0)) blocked++;
            for (const id of ids) Quests.bump(id, 1000000);
            for (let k = Quests.list().length - 1; k >= 0; k--) if (Quests.canClaim(k)) { Quests.claim(k); claims++; }
        }
        return { claims, blocked, slots: S.quests.length };`);
    ok(play.blocked === 0, `만렙 실사용 중 막힌 퀘스트가 ${play.blocked}회 슬롯에 올라왔다`);
    ok(play.claims >= 20, `만렙에서 ${play.claims}회밖에 못 깼다(교착)`);
    console.log(`  ⑹ 만렙 실사용 — 연속 ${play.claims}회 수령, 막힌 퀘스트 노출 ${play.blocked}회, 슬롯 ${play.slots}칸`);

    await browser.close();
    if (errs.length) { console.log('\n콘솔 에러:'); errs.slice(0, 8).forEach(e => console.log('  ' + e)); }
    console.log('\n' + (fails.length || errs.length ? `FAIL ${fails.length + errs.length}건` : 'PASS — 만렙에서도 3슬롯 전부 달성 가능'));
    fails.forEach(f => console.log('  ✗ ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ✗ 콘솔 ' + e));
    process.exit(fails.length || errs.length ? 1 : 0);
})();
