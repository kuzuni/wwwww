// 퀘스트 일괄수령 검증 (`quest-claim-all`, 사용자 지시 2026-08-18 "퀘스트 부분에 일괄수령 버튼도 만들라").
//
// 판정
//   ① 완료가 0개면 버튼이 비활성(.disabled)이고, 눌러도 재화가 안 늘고 퀘스트도 안 바뀐다
//   ② 완료가 여러 개면 버튼에 개수가 뜨고, 한 번 눌러 **전부** 수령된다(남은 완료 0개)
//   ③ 지급액이 개별 수령과 **정확히 같다** — 완료분 보상 합계와 재화 증가분이 일치
//   ④ 토스트는 재화별 합계로 **한 줄**(개수만큼 쌓이지 않는다)
//   ⑤ `questsCleared` 가 수령한 개수만큼 오른다
//   ⑥ 🚨 젬은 절대 안 준다 — 슬롯에 젬 보상이 박혀 있어도 대체 재화로 지급(quests.js 젬 방어 가드)
//   ⑦ 콘솔 에러 0건
// 사용: node probe-quest-claim-all.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

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
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; Combat.tick = function () {}; });

    // ---- ① 완료 0개 ----
    const none = await page.evaluate(() => {
        S.quests.forEach(q => { q.prog = 0; });
        UI.openQuests();
        const btn = document.querySelector('.qst-allbar button');
        const before = { coins: S.coins, cleared: S.questsCleared || 0, ids: S.quests.map(q => q.id).join(',') };
        btn.click();
        return {
            disabled: btn.className.includes('disabled'),
            label: btn.textContent.trim(),
            changed: S.coins !== before.coins || (S.questsCleared || 0) !== before.cleared
                || S.quests.map(q => q.id).join(',') !== before.ids,
        };
    });
    ok(none.disabled, `완료 0개인데 일괄수령 버튼이 활성이다 ("${none.label}")`);
    ok(!none.changed, '완료 0개인데 일괄수령이 뭔가를 바꿨다');
    console.log(`  ① 완료 0개 → 버튼 "${none.label}" 비활성=${none.disabled} · 상태 변화=${none.changed}`);

    // ---- ②③⑤⑥ 여러 개 완료 ----
    const many = await page.evaluate(() => {
        // 앞 3칸을 완료 상태로 만들고, 그중 하나에는 **젬 보상을 일부러 박아** 방어 가드를 시험한다
        const n = Math.min(3, S.quests.length);
        for (let i = 0; i < n; i++) S.quests[i].prog = S.quests[i].need;
        S.quests[0].rw = { cur: 'gems', amt: 999 };

        // ⚠️ 기대값은 **openQuests() 뒤에** 읽는다. `Quests.list()` 가 부르는 `ensure()` 가 젬이 박힌
        // 슬롯을 그 자리에서 정상 보상으로 갈아끼우기 때문이다 — 심어 둔 값(999젬)으로 기대값을 세우면
        // 멀쩡한 지급이 '개별과 합계가 다르다'로 뜬다(첫 실행에서 실제로 그렇게 오검출했다).
        // 젬 가드 자체는 아래 `gemsDelta === 0` 이 따로 못 박는다.
        UI.openQuests();
        const expect = {};
        for (let i = 0; i < n; i++) {
            const q = S.quests[i];
            const cur = Quests.curOf({ rw: q.rw });
            expect[cur] = (expect[cur] || 0) + q.rw.amt;
        }
        const before = {};
        Object.keys(expect).forEach(c => { before[c] = S[c] || 0; });
        const gemsBefore = S.gems || 0;
        const clearedBefore = S.questsCleared || 0;
        const btn = document.querySelector('.qst-allbar button');
        const label = btn.textContent.trim();
        const rowsDoneBefore = document.querySelectorAll('.qst-row.done').length;
        document.querySelectorAll('#toasts .toast').forEach(t => t.remove());
        btn.click();

        const got = {};
        Object.keys(expect).forEach(c => { got[c] = (S[c] || 0) - before[c]; });
        return {
            n, label, rowsDoneBefore,
            expect, got,
            gemsDelta: (S.gems || 0) - gemsBefore,
            clearedDelta: (S.questsCleared || 0) - clearedBefore,
            readyAfter: Quests.readyCount(),
            toasts: [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent.trim()),
            rowsDoneAfter: document.querySelectorAll('.qst-row.done').length,
            slots: S.quests.length,
        };
    });
    ok(many.label.includes(String(many.n)), `버튼에 수령 가능 개수가 안 보인다 ("${many.label}", 완료 ${many.n}개)`);
    ok(many.readyAfter === 0, `일괄수령 뒤에도 완료 퀘스트가 ${many.readyAfter}개 남았다`);
    ok(many.clearedDelta === many.n, `questsCleared 가 ${many.clearedDelta} 만큼만 올랐다 (수령 ${many.n}개)`);
    for (const cur of Object.keys(many.expect)) {
        ok(many.got[cur] === many.expect[cur], `${cur} 지급이 ${many.got[cur]} (기대 ${many.expect[cur]}) — 개별 수령과 합계가 다르다`);
    }
    ok(many.gemsDelta === 0, `🚨 젬이 ${many.gemsDelta} 지급됐다 — 젬 보상 금지 가드가 일괄수령 경로에서 샌다`);
    ok(many.toasts.length === 1, `토스트가 ${many.toasts.length}개다 — 재화별 합계로 한 줄이어야 한다`);
    console.log(`  ② 완료 ${many.n}개 → 버튼 "${many.label}" · 수령 후 남은 완료 ${many.readyAfter}개 · 슬롯 ${many.slots}칸 유지`);
    console.log(`  ③ 지급 ${JSON.stringify(many.got)} (기대 ${JSON.stringify(many.expect)}) · 젬 증가 ${many.gemsDelta}`);
    console.log(`  ④ 토스트 ${many.toasts.length}줄 — "${many.toasts[0] || ''}"`);

    // ---- 개별 수령과 같은 결과인지 교차 확인 ----
    // 같은 상태에서 [수령]을 하나씩 눌렀을 때의 합계와 일괄수령 합계가 같아야 한다.
    const cross = await page.evaluate(() => {
        S.quests.forEach(q => { q.prog = q.need; });
        const n = S.quests.length;
        const expect = {};
        S.quests.forEach(q => { const c = Quests.curOf({ rw: q.rw }); expect[c] = (expect[c] || 0) + q.rw.amt; });
        const before = {}; Object.keys(expect).forEach(c => { before[c] = S[c] || 0; });
        // ⚠️ 매번 0번을 누르면 안 된다 — 수령한 칸은 **진행도 0짜리 새 퀘스트**로 채워져 그 다음
        // `canClaim(0)` 이 false 다. 그래서 1회만 먹히고 나머지는 조용히 무시된다(첫 실행에서 실제로
        // 그렇게 오검출했다). 매번 '아직 완료인 칸'을 다시 찾아 누른다.
        for (let k = 0; k < n; k++) {
            const i = S.quests.findIndex(q => Quests.isDone(q));
            if (i < 0) break;
            UI.onClaimQuest(i);
        }
        const one = {}; Object.keys(expect).forEach(c => { one[c] = (S[c] || 0) - before[c]; });
        return { n, expect, one };
    });
    for (const cur of Object.keys(cross.expect)) {
        ok(cross.one[cur] === cross.expect[cur], `개별 수령 합계 ${cur}=${cross.one[cur]} (기대 ${cross.expect[cur]}) — 교차 확인 실패`);
    }
    console.log(`  교차 확인  개별 ${cross.n}회 수령 합계 ${JSON.stringify(cross.one)} = 기대 ${JSON.stringify(cross.expect)}`);

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
