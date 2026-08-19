// 자동 제작 순차 애니메이션 시퀀스 검증 (사용자 지시 2026-08-17, TODO ①~⑦
//  + 2026-08-18 재지적 autoforge-show-all-cards: 배치는 팝업에서 멈추지 않고 카드 N장이 다 보여야)
//  ⑴ 자동제작 시작 시 설정 팝업이 닫힌다
//  ⑵ 망치질(.striking) 연출이 돈다 — 사이클(설정 N개)마다 1회 (autoforge-hammer-per-cycle 2026-08-18)
//  ⑶ 목표 통과분은 비교 팝업으로 뜨고(자동장착 금지), 사용자가 처리하면 배치가 남은 망치로 이어진다
//  ⑷ 필터 탈락분은 카드가 잠깐 보였다가 코인 판매 연출(#coin-burst)이 난다
//  ⑸ 망치 N개 배치면 결과 카드가 정확히 N회 노출된다 (통과·탈락이 섞여도)
//  ⑹ 배치 1회 후 멈추지 않고 **망치가 다 없어질 때까지** 사이클을 반복한 뒤 정지
//     (autoforge-hammer-per-cycle 2026-08-18) / '목표를 찾으면 정지'(stopOnTarget) ON이면
//     첫 통과분이 비교 팝업으로 뜨고 선택 후 정지, 남은 망치는 쓰지 않는다
//  ⑺ 비교 팝업 딤 클릭 = 보류 → 모루 자리에 카드, 그 카드를 누르면 비교 팝업 재등장, 세이브 보존
// 사용: node probe-autocraft-seq.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
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
// 조건이 참이 될 때까지 기다린다(연출이 실시간이라 고정 sleep은 불안정하다)
async function until(page, fnSrc, ms = 8000) {
    const t0 = Date.now();
    for (;;) {
        if (await page.evaluate(fnSrc).catch(() => false)) return true;
        if (Date.now() - t0 > ms) return false;
        await page.waitForTimeout(50);
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
    // 🚨 `UI.els.*` 를 만지기 전에 **부팅 완주**를 기다린다. `UI` 가 떴다고 화면이 준비된 게 아니고
    //    (`UI.init()` 은 boot() 사슬의 24% 지점), 헤드리스에서는 evaluate 를 한 번만 부르고 폴링을
    //    멈추면 rAF 펌프가 죽어 **부팅이 그 자리에서 굳는다** — 그래서 고정 대기도, 한 번짜리
    //    대기도 답이 아니다. 실측표는 `wait-ready.js` 의 `waitBootDone` 머리말에 있다.
    await waitBootDone(page);
    await waitBooted(page);
    await page.waitForTimeout(400);
    // 해금·재화 세팅 + 망치질 연출 관찰을 위해 3D만 정지(연출 타이밍 자체는 실제 값을 쓴다)
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 5; S.bestStage = 9; S.hammers = 500; S.forgeLevel = 20;
        S.autoForge.keepAges = []; S.autoForge.filterOn = false; S.autoForge.filterSubs = [];
    });

    // ---- ⑴ 시작하면 설정 팝업이 닫힌다 ----
    const start = await page.evaluate(() => {
        UI.openAutoForge();
        const openedBefore = !UI.els.autoForgeModal.classList.contains('hidden');
        S.autoForge.hammersPerBatch = 3;
        S.autoForge.stopOnTarget = false;
        Forge.passesAutoFilter = () => false;   // 전부 탈락시켜 코인 연출 경로만 본다
        // 🚨 탈락시키는 것만으로는 **판매되지 않는다** — 탈락분의 처리는 `UI.autoDispose`가 정하는데,
        //    목표(필터 대상)가 하나도 없으면 `Forge.autoResolve`로 넘어가 **빈 슬롯이면 자동 장착**한다.
        //    새 세이브는 8칸이 전부 비어 있어 앞 6~8개가 전부 장착으로 흘러가고, 예산 3개짜리 이 시나리오는
        //    판매에 **한 번도 도달하지 못한다** — 그래서 '코인 연출이 안 뜬다'가 게임 결함처럼 보였다.
        //    (실측 교차검증: 장착 6건 뒤 7번째부터 gained 20으로 판매되고 #coin-burst에 코인 5개가 실제로 찍힌다.)
        //    이 프로브가 보려는 건 '탈락 → 판매 → 코인 연출' 경로이므로 목표가 있는 상태로 고정한다.
        Forge.hasAutoTarget = () => true;
        S.hammers = 5;                          // 소진 정지 사양(hammer-per-cycle) — 사이클 3+2 뒤 소진 정지
        const h0 = S.hammers;                   // 소모는 '시작 직전' 값과 비교해야 한다
        UI.onToggleAutoForge();
        return { openedBefore, closedAfter: UI.els.autoForgeModal.classList.contains('hidden'), on: S.autoForgeOn, h0 };
    });
    ok(start.openedBefore && start.closedAfter, '자동제작 시작 시 설정 팝업이 닫히지 않았다');
    ok(start.on, '자동제작이 켜지지 않았다');

    // ---- ⑵ 망치질 연출 ----
    ok(await until(page, `document.querySelector('.anvil-btn.striking') !== null`, 3000),
        '망치질 연출(.striking)이 관측되지 않았다');
    // ---- ⑷ 탈락분: 카드 노출 + 코인 연출 ----
    // 🚨 **2026-08-20 `autoforge-cards-at-once` 로 자동 경로의 카드가 카드판이 됐다** — 한 장짜리
    //    `.auto-drop-card` 가 아니라 `.craft-batch` 에 N장이 한꺼번에 뜬다. 둘 다 인정한다
    //    ('뽑힌 걸 보여준다'가 계약이고, 몇 장씩 보여주는가는 그 뒤 지시로 갈린 표현이다).
    ok(await until(page, `document.querySelector('.auto-drop-card, .craft-batch') !== null`, 4000),
        '필터 탈락 장비 카드(.auto-drop-card / .craft-batch)가 뜨지 않았다');
    ok(await until(page, `!!document.getElementById('coin-burst') && document.getElementById('coin-burst').children.length > 0`, 6000),
        '판매 코인 연출(#coin-burst)이 나지 않았다');

    // ---- ⑹ 망치 소진까지 반복 후 정지 (사이클 3개씩, 망치 5 → 3+2) ----
    ok(await until(page, `S.autoForgeOn === false`, 15000), '망치를 다 써도 자동제작이 멈추지 않았다');
    const after = await page.evaluate(() => ({ h: S.hammers, seq: !!UI._autoSeq }));
    ok(after.h === 0, `망치가 다 없어질 때까지 계속 돌아야 하는데 ${after.h}개를 남기고 멈췄다 (1배치 후 자동 OFF 회귀?)`);
    ok(!after.seq, '정지 후에도 시퀀스가 남아 있다');
    console.log(`⑴⑵⑷⑹ 설정팝업 닫힘·망치질·탈락카드·코인연출 확인 · 해머 ${start.h0} → ${after.h}(소진 후 정지)`);

    // ---- ⑶⑸ 목표 통과분은 비교 팝업으로(자동장착 금지), 처리하면 배치가 이어져 망치 N개 = 카드 N회 ----
    //      (autoforge-show-all-cards 재지적 2026-08-18: "해당되면 비교팝업이 떠야 하는데 자동장착을 해버린다")
    //      ⚠️ **두 번 뒤집힌 자리다 — 지금 계약은 아래가 최종**:
    //        · `autoforge-cards-at-once`(2026-08-20): 카드를 1장씩 흘리지 않고 **카드판 한 판에
    //          N장 동시**. 그래서 카드 수는 `buildCraftCard` **호출 횟수**가 아니라 **카드판이 편 장수**다
    //          (`showCraftBatch` 로 센다 — `probe-autoforge-default` ②-b 와 같은 방식).
    //        · `autoforge-fill-matches-to-batch`(2026-08-20): '계속하기' + 목표가 있으면 배치의 뜻이
    //          '망치 N개'가 아니라 **'통과분 N개'** 다. 탈락분은 그 자리에서 팔리고 **카드판에는
    //          통과분만** 오른다. 그래서 망치 6개·통과율 1/2 이면 카드는 6장이 아니라 **3장**이다.
    //      🚨 **필터 스텁은 호출 횟수로 세면 안 된다** — 채우기 루프와 `drainAutoBatch` 가 같은 장비를
    //        두 번 판정하는데, 호출 횟수 스텁은 그때 답이 뒤집혀 통과분이 팔린다(실측으로 팝업이
    //        3→2 로 줄었다). 아이템에 표식을 박고 판정은 그 표식만 본다.
    const flow = await page.evaluate(async () => {
        // 통과·탈락을 번갈아 섞는다 — 뽑는 순간 표식을 박아 재판정에도 답이 흔들리지 않게 한다.
        const roll = Forge.rollItem.bind(Forge);
        let nth = 0;
        Forge.rollItem = function () { const it = roll(); it.__pass = (nth++ % 2 === 0); return it; };
        Forge.passesAutoFilter = (it) => !!(it && it.__pass);
        window.__cards = 0;
        window.__order = '';                    // 실제 노출 순서 (C=결과 카드 1장, P=비교 팝업)
        const origBatch = UI.showCraftBatch.bind(UI);
        UI.showCraftBatch = function (items, done) {
            window.__cards += items.length; window.__order += 'C'.repeat(items.length);
            return origBatch(items, done);
        };
        let opens = 0;
        const origModal = UI.showCraftModal.bind(UI);
        UI.showCraftModal = function (item) { opens++; window.__order += 'P'; return origModal(item); };
        S.autoForge.hammersPerBatch = 6; S.autoForge.stopOnTarget = false;
        S.hammers = 6;                          // 소진 정지 사양 — 망치 6개로 정확히 소진
        S.autoForgeOn = false; UI._autoSeq = null;
        const h0 = S.hammers;
        UI.onToggleAutoForge();
        // 통과분이 뜨는 팝업을 사용자 대신 판매로 처리하면 남은 망치로 배치가 이어진다
        for (let i = 0; i < 900 && S.autoForgeOn; i++) {
            if (!UI.els.craftModal.classList.contains('hidden')) UI.doResolveCraft('sell');
            await new Promise(r => setTimeout(r, 50));
        }
        UI.showCraftBatch = origBatch;
        UI.showCraftModal = origModal;
        Forge.rollItem = roll;
        return { spent: h0 - S.hammers, cards: window.__cards, opens, on: S.autoForgeOn, order: window.__order };
    });
    ok(!flow.on, '⑶ 배치가 스스로 정지하지 않았다');
    ok(flow.opens === 3, `⑶ 통과분 3개가 비교 팝업으로 떠야 한다(자동장착 금지) — 팝업 ${flow.opens}회`);
    ok(flow.spent === 6, `⑸ 망치 6개를 다 써야 하는데 ${flow.spent}개 소모`);
    ok(flow.cards === 3, `⑸ 통과율 1/2 · 망치 6개 → 카드판에 통과분 3장이 떠야 한다 — ${flow.cards}장`);
    ok(flow.order === 'CCCPPP',
        `⑸ 순서 — 카드판이 통과분 3장을 한 번에 편 뒤에야 팝업 3개가 와야 한다. 실측: ${flow.order}`);
    console.log(`⑶⑸ 통과·탈락 혼합 배치: 통과분 팝업 ${flow.opens}회 · 해머 ${flow.spent}개 · 카드판 ${flow.cards}장 · 순서 ${flow.order}`);

    // ---- ⑹-b '목표를 찾으면 정지' ON → 첫 통과분이 비교 팝업, 선택 후 정지 + 남은 예산 미소모 ----
    const stopCase = await page.evaluate(async () => {
        S.hammers = 200; S.autoForgeOn = false; UI._autoSeq = null;
        UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
        S.autoForge.stopOnTarget = true; S.autoForge.hammersPerBatch = 10;
        Forge.passesAutoFilter = () => true;
        const h0 = S.hammers;
        UI.onToggleAutoForge();
        for (let i = 0; i < 200 && UI.els.craftModal.classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 50));
        const modal = !UI.els.craftModal.classList.contains('hidden');
        // 🚨 **배치 하나의 통과분을 다 처리해야 정지한다** — 배치화 이전엔 첫 선택 = 즉시 정지였지만
        //    지금은 배치 10개가 전부 통과분이라 팝업이 10번 온다(`stopAfterPick` 은 '이 배치를 끝내고
        //    정지'라는 뜻이다). 한 번만 고르고 재면 '아직 안 멈췄다'가 나오는 게 당연하다.
        for (let i = 0; i < 200 && (S.autoForgeOn || !UI.els.craftModal.classList.contains('hidden')); i++) {
            if (!UI.els.craftModal.classList.contains('hidden')) {
                UI.resolveCraft('sell');        // 같은 등급 경고가 떠도 이 경로는 판매로 확정된다
                if (!document.getElementById('detail-modal').classList.contains('hidden')) UI.onSellConfirm();
            }
            await new Promise(r => setTimeout(r, 50));
        }
        await new Promise(r => setTimeout(r, 500));
        return { modal, spent: h0 - S.hammers, on: S.autoForgeOn, seq: !!UI._autoSeq };
    });
    ok(stopCase.modal, "'정지' ON인데 첫 통과분이 비교 팝업으로 뜨지 않았다");
    ok(!stopCase.on && !stopCase.seq, "'정지' ON인데 배치의 통과분을 다 처리한 뒤에도 자동제작이 계속됐다");
    // 🚨 **'망치 1개만'은 배치화(2026-08-19 `autoforge-cards-at-once` 1차) 이전 계약이다** —
    //    지금은 한 배치가 원자적이라 `hammersPerBatch` 만큼 먼저 쓰고, 그 배치의 통과분을 다 처리한
    //    뒤에 정지한다(같은 계약을 `probe-autoforge-default` ③ 도 쓴다). 배치 크기를 넘겨 쓰면 결함.
    ok(stopCase.spent === 10, `'정지' ON이면 배치 하나(망치 10개)까지만 써야 하는데 ${stopCase.spent}개 소모`);
    console.log(`⑹-b 목표 정지 ON → 첫 통과 팝업·선택 후 정지 (해머 ${stopCase.spent}개 = 배치 1회분 소모)`);

    // ---- ⑺ 딤 클릭 = 보류 → 모루 자리 카드 → 다시 열기 ----
    await page.evaluate(() => {
        S.autoForgeOn = false; UI._autoSeq = null;
        UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden');
        const it = Forge.rollItem(); UI.setPendingCraft(it); UI.showCraftModal(it);
    });
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
        const m = document.getElementById('craft-modal').getBoundingClientRect();
        return { x: m.left + 12, y: m.top + 12 };   // 카드 바깥 = 딤 영역
    });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    // 보류는 pendingCraft 1슬롯이 전부다 (보관함·큐 없음 — 사용자 확정 2026-08-17)
    const held = await page.evaluate(() => ({
        modalClosed: document.getElementById('craft-modal').classList.contains('hidden'),
        pending: !!S.pendingCraft,
        cardOnAnvil: !!document.querySelector('.anvil-btn.held-slot'),
        saved: !!(JSON.parse(localStorage.getItem('forgeclone_save_v1')) || {}).pendingCraft,
    }));
    ok(held.modalClosed && held.pending && held.cardOnAnvil,
        `딤 클릭 보류가 동작하지 않았다 ${JSON.stringify(held)}`);
    ok(held.saved, '보류품이 세이브에 남지 않았다(새로고침 시 유실)');
    const reopened = await page.evaluate(() => {
        document.querySelector('.anvil-btn.held-slot').click();
        return {
            modalOpen: !document.getElementById('craft-modal').classList.contains('hidden'),
            pending: !!S.pendingCraft,
            anvilBack: !document.querySelector('.anvil-btn.held-slot'),
        };
    });
    ok(reopened.modalOpen && reopened.pending && reopened.anvilBack,
        `보류 카드 클릭으로 비교 팝업이 다시 뜨지 않았다 ${JSON.stringify(reopened)}`);
    console.log(`⑺ 보류: 딤 클릭 → 모루 자리 카드(세이브 보존) → 카드 클릭 → 비교 팝업 재등장·모루 복귀`);

    // ---- ⑻ 보류 카드가 모루 자리를 대신해도 레이아웃이 흔들리면 안 된다 (원본 비율 유지) ----
    const geo = await page.evaluate(() => {
        const m = () => {
            const app = document.getElementById('app').getBoundingClientRect();
            const r = document.querySelector('.anvil-row').getBoundingClientRect();
            const s = document.getElementById('equip-sheet').getBoundingClientRect();
            return { row: +(r.height / app.height * 100).toFixed(2), top: +((r.top - app.top) / app.height * 100).toFixed(2),
                     sheet: +(s.height / app.height * 100).toFixed(2) };
        };
        UI.clearPendingCraft(); UI.els.craftModal.classList.add('hidden'); UI.renderEquipSheet();
        const normal = m();
        UI.setPendingCraft(Forge.rollItem()); UI.els.craftModal.classList.add('hidden'); UI.renderEquipSheet();
        const held = m();
        UI.clearPendingCraft(); UI.renderEquipSheet();
        return { normal, held };
    });
    const dRow = Math.abs(geo.held.row - geo.normal.row), dSheet = Math.abs(geo.held.sheet - geo.normal.sheet);
    ok(dRow < 0.05 && dSheet < 0.05 && Math.abs(geo.held.top - geo.normal.top) < 0.05,
        `보류 카드가 레이아웃을 밀었다 (행 ${dRow.toFixed(2)}%p · 시트 ${dSheet.toFixed(2)}%p)`);
    console.log(`⑻ 보류 카드 레이아웃: 모루 ${JSON.stringify(geo.normal)} vs 보류 ${JSON.stringify(geo.held)}`);

    // ---- ⑼ 큐(통과분 대기열)는 새로고침을 견딘다 (3차 사양 2026-08-19) ----
    //      카드 단계에서 통과분은 대기품 슬롯을 비우고 큐로 가므로, 메모리에만 두면 연출 도중
    //      새로고침에 **해머만 먹고 통과분이 통째로 증발한다**. 세이브에 남아 부팅 때 이어서 떠야 한다.
    await page.evaluate(() => {
        S.autoForgeOn = false; UI._autoSeq = null; UI.clearPendingCraft();
        UI.els.craftModal.classList.add('hidden');
        // 🚨 앞 ⑺(딤 클릭 = 보류)이 `S.autoMatchHeld` 를 켜 두고 간다 — 보류 모드에서는 복원이
        //    **팝업을 안 여는 게 사양**(모루 자리 카드로만 올린다, autoforge-dim-hold-all)이라
        //    그대로 두면 이 검사가 정상 동작을 '유실'로 찍는다. 여기서 재는 건 평시 경로다.
        S.autoMatchHeld = false;
        S.autoMatchQueue = [
            Object.assign(Forge.rollItem(), { name: '큐테스트A', slot: 'ring' }),
            Object.assign(Forge.rollItem(), { name: '큐테스트B', slot: 'belt' }),
        ];
        saveGame();
    });
    await page.reload({ waitUntil: 'load' });
    // 🚨 `waitBooted`(UI·S 가 있는가)만으로는 이르다 — 큐 복원은 `main.js` 의 `boot()` **끝**에서
    //    `restorePendingCraft()` 가 하는데, 그 앞에 셰이더 워밍업이 있어 이 환경에선 수 초가 걸린다.
    //    600ms 만 기다리던 종전 코드는 **아직 복원이 안 돈 시점을 재고 '유실'로 찍고 있었다**
    //    (red-probes-4 ⑴ 의 마지막 두 건 — 제품 결함이 아니라 대기 부족).
    await waitBootDone(page);
    await waitBooted(page);
    await page.waitForTimeout(600);
    const q1 = await page.evaluate(() => ({
        modal: !UI.els.craftModal.classList.contains('hidden'),
        pending: UI._pendingItem && UI._pendingItem.name,
        left: (S.autoMatchQueue || []).length,
    }));
    ok(q1.modal && q1.pending === '큐테스트A' && q1.left === 1,
        `⑼ 새로고침 후 큐의 첫 통과분이 비교 팝업으로 복원돼야 한다 ${JSON.stringify(q1)}`);
    const q2 = await page.evaluate(async () => {
        UI.doResolveCraft('sell');
        await new Promise(r => setTimeout(r, 400));
        return {
            modal: !UI.els.craftModal.classList.contains('hidden'),
            pending: UI._pendingItem && UI._pendingItem.name,
            left: (S.autoMatchQueue || []).length,
        };
    });
    ok(q2.modal && q2.pending === '큐테스트B' && q2.left === 0,
        `⑼ 앞 통과분을 처리하면 큐의 다음 통과분이 이어서 떠야 한다 ${JSON.stringify(q2)}`);
    await page.evaluate(async () => { UI.doResolveCraft('sell'); await new Promise(r => setTimeout(r, 200)); });
    console.log(`⑼ 큐 세이브 복원: 새로고침 → ${q1.pending}(잔여 ${q1.left}) → 처리 → ${q2.pending}(잔여 ${q2.left})`);

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
