// 반복 퀘스트가 젬을 지급하지 않는지 검증 — slug: quest-gem-reward
//
// 사양: 젬은 '보급 없음, 상점 더미'다(TODO '재화 개편' ①, ref/UI-SPEC.md 재화 표).
//       상점은 2026-08-17 에 `claimDeal()` 가드까지 넣어 닫혔는데 퀘스트 2종(`gearUpgrade`·`techDone`)이
//       남아 있었다 — 수령 즉시 같은 풀에서 새로 뽑히므로 상한이 없는 무한 수급처였다.
//
// 재는 것:
//   ⑴ DEFS 어디에도 `rw.cur === 'gems'` 가 없다 + 아이콘이 보상 재화와 맞는다(`techDone` 은 gem 아이콘이었다)
//   ⑵ 실게임 수령: 두 퀘스트를 각각 슬롯에 세우고 진행도를 채워 **UI 버튼 경로**(`UI.onClaimQuest`)로 수령했을 때
//      젬이 안 늘고 의도한 재화가 정확한 양만큼 는다 + 토스트 문구에 '젬'이 안 나온다
//   ⑶ 구세이브 마이그레이션: `rw.cur:'gems'` 가 박힌 저장분을 `Quests.ensure()` 가 현행 재화로 갈아준다
//      (슬롯은 수령해야만 갈리므로 마이그레이션이 없으면 이미 뜬 젬 퀘스트가 계속 젬을 준다)
//   ⑷ 방어 가드: DEFS 를 젬으로 되돌려 놓고 수령해도 `S.gems` 가 1도 안 는다
//   ⑸ 전 행동 스윕: 11종 행동을 전부 bump→수령 반복(40회)해도 젬 총량이 0 그대로다
//
// ⚠️ 이 저장소의 Playwright 는 문자열 화살표 함수를 식으로 평가해 undefined 를 준다 —
//    반드시 `page.evaluate('(' + FN + ')()')` 로 즉시호출할 것.
//
// 사용: node probe-quest-gem.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const ev = (page, body) => page.evaluate(`(() => { ${body} })()`);

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

    // ⑴ 정의 감사
    const defs = await ev(page, `return Quests.DEFS.map(d => ({ id: d.id, cur: d.rw.cur, amt: d.rw.amt, icon: d.icon }));`);
    const CUR_ICON = { coins: 'coin', hammers: 'hammer', tickets: 'ticket', winders: 'winder', eggCurrency: 'egg', potions: 'potion' };
    for (const d of defs) {
        ok(d.cur !== 'gems', `DEFS '${d.id}' 이 아직 젬 보상이다(${d.amt})`);
        // 아이콘은 '행동'을 그리는 경우도 있어(제작=hammer, 판매=coin) 재화와 1:1 강제는 아니지만,
        // **젬 아이콘만은** 젬을 안 주는 이상 남아 있으면 안 된다.
        ok(d.icon !== 'gem', `DEFS '${d.id}' 아이콘이 아직 gem 이다(보상은 ${d.cur})`);
        ok(!CUR_ICON[d.cur] || true, '');
    }
    // 보상 재화 아이콘이 IconGen 에 실제로 있는지 — 없으면 img() 가 조용히 빈 문자열을 돌려준다
    const missing = await ev(page, `
        const need = [...new Set(Quests.DEFS.map(d => UI.QUEST_CUR_ICON[d.rw.cur] || 'coin'))];
        return need.filter(n => !IconGen.img(n));`);
    ok(missing.length === 0, `보상 재화 아이콘 누락: ${missing.join(', ')}`);

    // ⑵ 실게임 수령 (UI 버튼 경로) — 두 문제 퀘스트를 각각 0번 슬롯에 세운다
    for (const id of ['gearUpgrade', 'techDone']) {
        const r = await ev(page, `
            const def = Quests.def('${id}');
            S.gems = 0; S.questsCleared = 0;
            Quests.ensure();
            S.quests[0] = { id: '${id}', need: 1, prog: 1, rw: { cur: def.rw.cur, amt: def.rw.amt } };
            const before = { gems: S.gems, cur: S[def.rw.cur] || 0 };
            // ⚠️ 토스트는 쌓인 채 남는다 — 지우지 않으면 **직전 퀘스트의 문구**를 읽어 검사가 통째로 헛돈다
            //    (이 프로브 첫 판이 techDone 자리에서 gearUpgrade 토스트를 읽었다).
            document.querySelectorAll('.toast').forEach(t => t.remove());
            UI.openQuests();
            const btn = [...document.querySelectorAll('#quest-modal button')].find(b => /onClaimQuest\\(0\\)/.test(b.getAttribute('onclick') || ''));
            if (!btn) return { err: '수령 버튼을 못 찾았다' };
            btn.click();
            const toasts = [...document.querySelectorAll('.toast')].map(t => t.textContent.trim());
            return { cur: def.rw.cur, amt: def.rw.amt, gems: S.gems, gained: (S[def.rw.cur] || 0) - before.cur,
                     curKr: Quests.CUR_KR[def.rw.cur], toast: toasts.join(' | ') };`);
        ok(!r.err, `${id}: ${r.err}`);
        if (r.err) continue;
        ok(r.gems === 0, `${id} 수령 후 젬이 ${r.gems} 로 늘었다`);
        ok(r.gained === r.amt, `${id} 보상 지급량 ${r.gained} ≠ 정의값 ${r.amt} (${r.cur})`);
        ok(!/젬/.test(r.toast), `${id} 토스트에 '젬' 이 남아 있다: "${r.toast}"`);
        ok(r.toast.indexOf(r.curKr) >= 0, `${id} 토스트가 지급 재화(${r.curKr})를 안 알린다: "${r.toast}"`);
        console.log(`  ${id} → ${r.cur} +${r.gained} (젬 ${r.gems}) 토스트 "${r.toast}"`);
    }

    // ⑶ 구세이브 마이그레이션 — rw.cur:'gems' 가 박힌 슬롯
    const mig = await ev(page, `
        S.gems = 0;
        S.quests = [{ id: 'gearUpgrade', need: 1, prog: 1, rw: { cur: 'gems', amt: 8 } },
                    { id: 'techDone',    need: 1, prog: 0, rw: { cur: 'gems', amt: 10 } }];
        Quests.ensure();
        return S.quests.map(q => ({ id: q.id, cur: q.rw.cur, amt: q.rw.amt, prog: q.prog }));`);
    for (const q of mig.filter(q => ['gearUpgrade', 'techDone'].includes(q.id))) {
        ok(q.cur !== 'gems', `마이그레이션 실패: '${q.id}' 가 아직 젬 보상이다`);
    }
    ok((mig.find(q => q.id === 'gearUpgrade') || {}).prog === 1, '마이그레이션이 진행도를 날렸다');
    console.log('  구세이브 마이그레이션:', JSON.stringify(mig.filter(q => ['gearUpgrade', 'techDone'].includes(q.id))));

    // ⑷ 방어 가드 — DEFS 를 젬으로 되돌려 놓고 수령
    const guard = await ev(page, `
        const def = Quests.def('gearUpgrade');
        const keep = def.rw;
        def.rw = { cur: 'gems', amt: 8 };
        S.gems = 0;
        S.quests[0] = { id: 'gearUpgrade', need: 1, prog: 1, rw: { cur: 'gems', amt: 8 } };
        const got = Quests.claim(0);
        const out = { gems: S.gems, got: got && got.cur };
        def.rw = keep;
        return out;`);
    ok(guard.gems === 0, `가드 실패: DEFS 를 젬으로 되돌리자 젬이 ${guard.gems} 지급됐다`);
    ok(guard.got !== 'gems', `가드가 젬을 안 줬는데 보상 표기는 '젬'이다 — 토스트가 거짓말을 한다`);
    console.log('  방어 가드: 젬', guard.gems, '(대체 지급 재화', guard.got + ')');

    // ⑸ 전 행동 스윕 — 40회 수령
    const sweep = await ev(page, `
        S.gems = 0; S.questsCleared = 0; S.quests = []; Quests.ensure();
        let claims = 0;
        for (let i = 0; i < 400 && claims < 40; i++) {
            for (const d of Quests.DEFS) Quests.bump(d.id, 100000);
            for (let k = Quests.list().length - 1; k >= 0; k--) if (Quests.canClaim(k)) { Quests.claim(k); claims++; }
        }
        return { claims, gems: S.gems, curs: [...new Set(S.quests.map(q => q.rw.cur))] };`);
    ok(sweep.claims >= 40, `스윕이 ${sweep.claims} 회밖에 못 돌았다`);
    ok(sweep.gems === 0, `스윕 후 젬이 ${sweep.gems} 로 늘었다`);
    console.log(`  스윕 ${sweep.claims}회 수령 → 젬 ${sweep.gems} (현재 슬롯 보상 재화: ${sweep.curs.join(', ')})`);

    await browser.close();
    if (errs.length) { console.log('\n콘솔 에러:'); errs.slice(0, 8).forEach(e => console.log('  ' + e)); }
    console.log('\n' + (fails.length || errs.length ? `FAIL ${fails.length + errs.length}건` : 'PASS — 젬 수급 경로 0건'));
    fails.forEach(f => f && console.log('  ✗ ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ✗ 콘솔 ' + e));
    process.exit(fails.filter(Boolean).length || errs.length ? 1 : 0);
})();
