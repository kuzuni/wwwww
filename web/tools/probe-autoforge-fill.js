// 자동 제련 '목표장비 찾으면 제련 계속하기' — **통과분이 배치 수만큼 쌓일 때까지 계속 뽑는다**
// (사용자 지시 2026-08-20 `autoforge-fill-matches-to-batch`:
//  "한 번에 사용된 망치 수가 10이면 필터링 된 거 10개 될 때까지 계속 뽑고, 10개 됐을 때 비교 팝업")
//
// 재는 것:
//  ① 채우기 — 통과율 1/3 · 배치 5 → 제작은 15회로 늘고 **카드판에 뜨는 건 통과분 5장**, 팝업도 5회
//  ② 망치 예산이 채우기보다 먼저다 — 망치 7개뿐이면 7개까지만 뽑고 그때까지 모은 통과분으로 진행
//  ③ '정지'(stopOnTarget) 모드는 종전 그대로 — 배치 수만큼만 제작한다(채우기 금지)
//  ④ 목표 미설정(기본값)은 종전 그대로 — 여기에 채우기를 걸면 통과가 영영 안 생겨 망치를 다 태운다
//  ⑤ 지속성 — 채우는 도중의 통과분이 `S.autoBatch` 에 적재돼 있다(죽어도 안 증발)
//
// ⚠️ 통과 판정을 스텁으로 갈아끼운다 — 실제 등급 확률로는 '1/3 통과'를 못 고정해 회차마다 수가
//    흔들린다. 대신 **아이템에 표식을 박아** `passesAutoFilter` 가 그 표식만 보게 한다:
//    그래야 `drainAutoBatch` 가 나중에 같은 아이템을 다시 판정할 때도 같은 답이 나온다
//    (호출 횟수로 세는 스텁을 쓰면 재판정에서 답이 뒤집혀 통과분이 팔린다 — 실제로 겪은 함정이다).
// 사용: node probe-autoforge-fill.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined" && UI.els && UI.els.craftModal', { timeout: 180000 });
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 5; S.bestStage = 9; S.forgeLevel = 20;
        UI.playAnvilStrike = cb => cb();            // 망치질 연출 0.72초 건너뛰기
        // 통과율을 정확히 1/3 로 고정한다 — 뽑는 순간 표식을 박고, 판정은 표식만 본다.
        const roll = Forge.rollItem.bind(Forge);
        window.__rolls = 0;
        Forge.rollItem = function () { const it = roll(); it.__pass = (++window.__rolls % 3 === 0); return it; };
        Forge.passesAutoFilter = function (it) { return !!(it && it.__pass); };
        // ⚠️ 팝업 '횟수'가 아니라 **팝업에 뜬 서로 다른 장비 수**를 센다 — 헤드리스에서 모달이
        //    한 틱 늦게 닫히면 같은 장비가 한 번 더 열려 횟수가 1 튄다(실측으로 6/5 가 번갈아 났다).
        //    사용자가 보는 계약은 '통과분 하나당 한 번 물어본다'이므로 장비 수로 재는 게 맞다.
        UI._probeCraftItems = new Set();
        const om = UI.showCraftModal.bind(UI);
        UI.showCraftModal = function (it) { if (it) UI._probeCraftItems.add(it); return om(it); };
    });

    // 한 배치를 돌리고 카드판에 뜬 장수·제작 횟수·팝업 수를 잰다.
    const run = (cfg, hammers) => page.evaluate(async ([cfg, hammers]) => {
        S.autoForgeOn = false; UI._autoSeq = null; UI.clearPendingCraft();
        S.autoMatchQueue = []; S.autoBatch = null; S.autoMatchHeld = false;
        UI.els.craftModal.classList.add('hidden');
        Object.assign(Forge.autoForgeConfig(), cfg);
        S.hammers = hammers; window.__rolls = 0; UI._probeCraftItems = new Set();
        const c0 = S.totalCrafts, coin0 = S.coins;
        let cards = 0, midBatch = -1;
        const ob = UI.showCraftBatch.bind(UI);
        UI.showCraftBatch = function (items, done) {
            cards += items.length;
            midBatch = Array.isArray(S.autoBatch) ? S.autoBatch.length : -1;   // 카드가 뜬 시점의 적재분
            return ob(items, done);
        };
        UI.onToggleAutoForge();
        // 팝업이 뜨면 사용자를 대신해 판매로 넘긴다 — 큐의 다음 항목이 이어 열린다.
        for (let i = 0; i < 400 && (S.autoForgeOn || !UI.els.craftModal.classList.contains('hidden')); i++) {
            if (!UI.els.craftModal.classList.contains('hidden')) UI.doResolveCraft('sell');
            await new Promise(r => setTimeout(r, 25));
        }
        UI.showCraftBatch = ob;
        S.autoForgeOn = false; UI._autoSeq = null;
        return { crafted: S.totalCrafts - c0, cards, opens: UI._probeCraftItems.size, midBatch, coins: S.coins - coin0, left: S.hammers };
    }, [cfg, hammers]);

    const base = { keepAges: ['primitive'], filterOn: false, filterSubs: [], hammersPerBatch: 5, stopOnTarget: false };

    // ① 채우기 — 통과 5개를 채울 때까지 제작(1/3 통과 → 15회), 카드는 통과분 5장.
    //    망치를 딱 15개만 줘 **한 배치만** 돌게 한다(넉넉히 주면 자동 제련이 배치를 계속 돌려
    //    수가 배수로 불어난다 — 이 항목이 재는 건 '한 배치의 뜻'이다).
    const a = await run(base, 15);
    ok(a.cards === 5, `① 카드판에 통과분 5장이 떠야 한다 — ${a.cards}장`);
    ok(a.crafted === 15, `① 통과 5개를 채우려면 1/3 통과율에서 15회 제작해야 한다 — ${a.crafted}회`);
    ok(a.opens === 5, `① 통과분 5개가 다 모인 뒤 비교 팝업이 5개 장비에 대해 떠야 한다 — ${a.opens}개`);
    ok(a.midBatch === 5, `⑤ 카드가 뜬 시점에 S.autoBatch 에 통과분 5개가 적재돼 있어야 한다 — ${a.midBatch}`);
    console.log(`① 채우기 — 제작 ${a.crafted}회 · 카드 ${a.cards}장 · 팝업 ${a.opens}회 · 적재 ${a.midBatch} · 남은 망치 ${a.left}`);

    // ② 망치 예산 우선 — 7개뿐이면 7회에서 끊기고 그때까지의 통과분(2개)으로 진행
    const b = await run(base, 7);
    ok(b.crafted === 7 && b.left === 0, `② 망치 7개를 다 쓰고 멈춰야 한다 — 제작 ${b.crafted}회 · 남은 ${b.left}`);
    ok(b.cards === 2, `② 7회 중 통과분은 2개(3·6번째)다 — 카드 ${b.cards}장`);
    console.log(`② 예산 우선 — 제작 ${b.crafted}회 · 카드 ${b.cards}장 · 팝업 ${b.opens}회`);

    // ⑥ 통과가 하나도 없는 배치라도 **뽑힌 건 보여준다** — 필터가 빡빡하면 통과 0인 사이클이 흔한데
    //    그때 카드판이 아예 안 뜨면 망치만 조용히 줄어든다(이 계열 지시의 뿌리가 "뭐 뽑았는지 보여줘").
    //    통과율 0 + 망치 5 → 5회 뽑고 전부 팔지만 카드판에는 마지막으로 뽑은 것들이 오른다.
    const e = await page.evaluate(async () => {
        Forge.passesAutoFilter = () => false;
        return null;
    }).then(() => run(base, 5));
    ok(e.crafted === 5 && e.cards > 0,
        `⑥ 통과 0인 배치에서도 카드판이 떠야 한다 — 제작 ${e.crafted}회 · 카드 ${e.cards}장`);
    console.log(`⑥ 통과 0 — 제작 ${e.crafted}회 · 카드 ${e.cards}장(마지막 뽑은 것)`);
    await page.evaluate(() => { Forge.passesAutoFilter = (it) => !!(it && it.__pass); });

    // ③ '정지' 모드는 채우지 않는다 — 배치 수(5)만큼만 제작
    const c = await run({ ...base, stopOnTarget: true }, 500);
    ok(c.crafted === 5, `③ 정지 모드에서는 배치 수 5회만 제작해야 한다(채우기 금지) — ${c.crafted}회`);
    console.log(`③ 정지 모드 — 제작 ${c.crafted}회 · 카드 ${c.cards}장`);

    // ④ 목표 미설정(기본값)은 종전 그대로 — 채우기를 걸면 통과가 영영 안 나 망치를 다 태운다
    const d = await run({ keepAges: [], filterOn: false, filterSubs: [], hammersPerBatch: 5, stopOnTarget: false }, 5);
    // (팝업 수는 여기서 안 잰다 — 통과 판정 스텁이 `hasAutoTarget` 과 무관하게 표식만 보므로
    //  목표 미설정에서도 표식 달린 장비가 큐로 간다. 이 ④가 재는 건 **제작 횟수**다.)
    ok(d.crafted === 5, `④ 목표 미설정이면 배치 수만큼만 제작해야 한다(채우기 금지) — ${d.crafted}회`);
    console.log(`④ 목표 미설정 — 제작 ${d.crafted}회 · 카드 ${d.cards}장 · 팝업 ${d.opens}회`);

    ok(!errs.length, `콘솔/페이지 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    await browser.close();
    if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('PASS — 통과분 채우기 전 항목 통과');
})();
