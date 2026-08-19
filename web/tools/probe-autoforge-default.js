// 자동 제련이 '기본 설정 그대로'도 자동으로 도는지 검증 (QA 9차 결함).
// 기존 probe-autocraft-seq.js는 Forge.passesAutoFilter를 스텁으로 갈아끼워 재현되지 않던 구간이다 —
// 여기서는 **실제 설정값**으로만 돌린다.
//  ① 기본값(유지 시대 미체크·필터 OFF·정지 미설정·망치 N) → 손대지 않아도 망치 N개를 다 쓰고 정지,
//     그 사이 비교 팝업이 한 번도 뜨지 않는다(= 진짜 '자동')
//  ② 기본값에서도 **자동 장착은 절대 일어나지 않는다** — 자동 경로로 나온 장비는 전부 판매된다
//     (사용자 지시 2026-08-20 autoforge-no-auto-equip: "자동제련 할 때 자동장착 되면 안 됨. 절대로."
//      → 종전의 '업그레이드면 자동 장착' 계약을 **뒤집은** 자리다. 장착은 비교 팝업 [장착]뿐이다.)
//  ③ 유지 시대 + '목표를 찾으면 정지'(stopOnTarget) ON → 목표가 뽑히는 순간 비교 팝업이 뜨고 거기서 멈춘다
//  ④ 유지 시대를 켠 상태의 탈락품은 (자동 장착이 아니라) 판매된다 — 사용자 지시 우선
// 사용: node probe-autoforge-default.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

async function until(page, fnSrc, ms = 30000) {
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
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal && typeof S !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 5; S.bestStage = 9; S.hammers = 500; S.forgeLevel = 20;
        // 비교 팝업이 뜬 적이 있는지 세는 계수기 (뜨자마자 닫지 않고 그대로 둔다 — 멈춤도 관찰 대상)
        UI._probeCraftOpens = 0;
        const orig = UI.showCraftModal.bind(UI);
        UI.showCraftModal = function (item) { UI._probeCraftOpens++; return orig(item); };
    });

    // ---- ① 기본 설정 그대로 시작 (autoforge-hammer-per-cycle 2026-08-18: 배치 1회 후 정지가 아니라
    //      망치질 1회 = 설정 N개 사이클을 **망치가 다 없어질 때까지** 반복해야 한다) ----
    const N = 6, H0 = 13;                      // 13개 ÷ 사이클 6개 → 망치질 3회(6·6·1) 뒤 소진 정지
    const a = await page.evaluate(([n, h0]) => {
        S.autoForge = { keepAges: [], filterOn: false, filterSubs: [], hammersPerBatch: n, stopOnTarget: false };
        S.hammers = h0;
        S.autoForgeOn = false; UI._autoSeq = null; UI.clearPendingCraft();
        UI.els.craftModal.classList.add('hidden');
        UI._probeCraftOpens = 0;
        window.__strikes = 0;
        if (!UI.__strikeOrig) UI.__strikeOrig = UI.playAnvilStrike;
        UI.playAnvilStrike = function (done) { window.__strikes++; return UI.__strikeOrig.call(this, done); };
        UI.onToggleAutoForge();
        return { h0, on: S.autoForgeOn };
    }, [N, H0]);
    ok(a.on, '기본 설정에서 자동 제련이 켜지지 않았다');
    const stopped = await until(page, `S.autoForgeOn === false`, 60000);
    const a2 = await page.evaluate(() => ({ h: S.hammers, opens: UI._probeCraftOpens, seq: !!UI._autoSeq, strikes: window.__strikes }));
    ok(stopped, `망치 소진까지 돌지 않았다 (해머 ${a.h0} → ${a2.h}, 비교 팝업 ${a2.opens}회)`);
    ok(a2.h === 0, `망치가 다 없어질 때까지 계속 돌아야 하는데 ${a2.h}개를 남기고 멈췄다 (1배치 후 자동 OFF 회귀?)`);
    ok(a2.strikes === Math.ceil(H0 / N), `망치질 1회 = ${N}개 사이클이어야 한다 (망치 ${H0}개면 망치질 ${Math.ceil(H0 / N)}회, 실측 ${a2.strikes}회)`);
    ok(a2.opens === 0, `기본 설정인데 비교 팝업이 ${a2.opens}회 떴다 (손이 가야 하면 '자동'이 아니다)`);
    ok(!a2.seq, '배치 종료 후에도 시퀀스가 남아 있다');
    console.log(`① 기본 설정 무개입 — 해머 ${a.h0} → ${a2.h} (소진 정지), 망치질 ${a2.strikes}회(사이클 ${N}개씩), 비교 팝업 ${a2.opens}회, 정지=${!a2.on}`);

    // ---- ② 기본 설정에서도 자동 장착이 **일어나지 않는다** (autoforge-no-auto-equip) ----
    // 빈 슬롯(무기)을 비워 두고 돌린다 — 종전 계약이라면 '장착품보다 강하니' 반드시 자동 장착되던
    // 조건이다. 그 자리가 비어 있어야 자동 장착이 정말 사라졌다고 말할 수 있다(가장 센 음성 조건).
    const b = await page.evaluate(async () => {
        S.equipment.weapon = null;
        Combat.recalcHero();
        S.autoForge.hammersPerBatch = 3;
        S.hammers = 9;                          // 소진 정지 사양이라 예산을 작게 (3개 사이클 ×3)
        S.autoForgeOn = false; UI._autoSeq = null; UI.clearPendingCraft();
        const c0 = S.coins;
        UI.onToggleAutoForge();
        for (let i = 0; i < 800 && S.autoForgeOn; i++) await new Promise(r => setTimeout(r, 50));
        return { weapon: !!S.equipment.weapon, spent: 9 - S.hammers, coinGain: S.coins - c0 };
    });
    ok(!b.weapon, `자동 제련이 빈 무기 슬롯에 장비를 **자동 장착**했다 — 사용자 지시상 절대 금지 (무기 ${b.weapon})`);
    ok(b.coinGain > 0, `자동 장착을 없앴으면 뽑힌 장비는 전부 판매돼 코인이 늘어야 한다 (증가 ${b.coinGain})`);
    console.log(`② 자동 장착 없음 — 망치 ${b.spent}개 소모 · 무기 슬롯 비어 있음(${b.weapon}) · 판매 코인 +${b.coinGain}`);

    // ---- ②-b 사용자 재현(autoforge-show-all-cards 재지적 2026-08-18 + 3차 2026-08-19): 유지 시대를 켜
    //      목표가 족족 뽑히면 **자동 장착하지 말고 비교 팝업으로 사용자 선택을 받아야 한다**("해당되면
    //      비교팝업이 떠야 하는데 자동장착을 해버린다"). 정지 미설정(기본값)이면 망치 10개 = 카드 10회 ·
    //      팝업 10회 · 배치 완주가 된다. **순서는 3차 재지적이 최종**: 카드 10장을 먼저 다 보여준 뒤에야
    //      팝업이 시작돼야 한다(카드↔팝업 교차 = 사용자가 세 번 틀렸다고 한 그 동작).
    //      ⚠️ **4차(autoforge-cards-at-once 2026-08-20)로 '카드 10장'의 뜻이 바뀌었다**: 종전엔
    //      `buildCraftCard` 10회(1장씩 순차)였지만 이제 카드판 1개에 10장이 **동시에** 뜬다.
    //      그래서 카드 수는 호출 횟수가 아니라 **카드판이 편 장수**로 센다. '카드가 다 나온 뒤 팝업'
    //      이라는 순서 계약 자체는 그대로 살아 있다(C 10개 뒤 P 10개). ----
    const rb = await page.evaluate(async () => {
        S.autoForge.keepAges = AGES.slice();     // 뽑는 족족 목표 — 재지적 당시 사용자 설정의 유력 경로
        S.autoForge.stopOnTarget = false; S.autoForge.hammersPerBatch = 10;
        S.hammers = 10;                          // 소진 정지 사양 — 망치 10개 = 카드 10회 = 팝업 10회 뒤 정지
        S.autoForgeOn = false; UI._autoSeq = null; UI.clearPendingCraft();
        UI.els.craftModal.classList.add('hidden');
        UI._probeCraftOpens = 0;
        window.__cards = 0;
        window.__order = '';                     // 카드/팝업이 실제로 난 순서 (C=카드, P=팝업)
        const orig = UI.showCraftBatch;
        // 카드판 한 번 = 그 안의 장수만큼 카드가 '동시에' 났다 — 순서 문자열에도 그만큼 C 를 적는다.
        UI.showCraftBatch = function (items, done) { window.__cards += items.length; window.__order += 'C'.repeat(items.length); return orig.call(this, items, done); };
        const origModal = UI.showCraftModal;
        UI.showCraftModal = function (item) { window.__order += 'P'; return origModal.call(this, item); };
        const h0 = S.hammers;
        UI.onToggleAutoForge();
        // 카드 10장이 다 지나간 뒤 팝업이 몰려 뜬다 — 사용자를 대신해 판매로 처리하면 큐의 다음 항목이 열린다.
        for (let i = 0; i < 1400 && S.autoForgeOn; i++) {
            if (!UI.els.craftModal.classList.contains('hidden')) UI.doResolveCraft('sell');
            await new Promise(r => setTimeout(r, 50));
        }
        UI.showCraftBatch = orig;
        UI.showCraftModal = origModal;
        return { spent: h0 - S.hammers, cards: window.__cards, opens: UI._probeCraftOpens, on: S.autoForgeOn, order: window.__order };
    });
    ok(!rb.on && rb.spent === 10 && rb.cards === 10 && rb.opens === 10,
        `목표가 뽑히면 팝업으로 받고(자동장착 금지) 처리하면 이어져 망치 10개 = 카드 10장 = 팝업 10회여야 한다 (소모 ${rb.spent} · 카드 ${rb.cards}장 · 팝업 ${rb.opens}회 · 진행중 ${rb.on})`);
    ok(rb.order === 'C'.repeat(10) + 'P'.repeat(10),
        `②-b 순서 — 카드 10장을 (한 번에) 다 보여준 **뒤에** 팝업 10개가 와야 한다. 실측 순서: ${rb.order}`);
    console.log(`②-b 유지 시대 ON + 기본값 — 망치 ${rb.spent}개 = 카드 ${rb.cards}장(동시) = 비교 팝업 ${rb.opens}회 · 순서 ${rb.order}`);

    // ---- ③ 유지 시대 + '목표를 찾으면 정지' ON → 목표는 비교 팝업으로 (거기서 정지) ----
    const c = await page.evaluate(async () => {
        S.autoForgeOn = false; UI._autoSeq = null; UI.clearPendingCraft();
        UI.els.craftModal.classList.add('hidden');
        UI._probeCraftOpens = 0;
        S.autoForge.keepAges = AGES.slice();     // 전 시대 유지 = 뽑는 족족 목표
        S.autoForge.stopOnTarget = true;         // 정지 모드에서만 비교 팝업이 뜬다 (기본값은 카드 → 자동 판정으로 계속)
        S.autoForge.hammersPerBatch = 5;
        S.hammers = 500;
        UI.onToggleAutoForge();
        for (let i = 0; i < 400 && UI.els.craftModal.classList.contains('hidden'); i++) await new Promise(r => setTimeout(r, 50));
        return { opened: !UI.els.craftModal.classList.contains('hidden'), opens: UI._probeCraftOpens };
    });
    ok(c.opened && c.opens >= 1, '유지 시대를 켰는데 목표 장비가 비교 팝업으로 뜨지 않았다');
    console.log(`③ 유지 시대 ON — 목표 장비 비교 팝업 ${c.opens}회 (선택 대기)`);

    // ---- ④ 유지 시대 ON일 때 탈락품은 판매(자동 장착 아님) ----
    const d = await page.evaluate(() => {
        S.autoForge.keepAges = ['primitive'];
        S.autoForge.filterOn = false; S.autoForge.filterSubs = [];
        const target = Forge.hasAutoTarget();
        const item = Object.assign(Forge.rollItem(), { age: 'future', slot: 'weapon' });
        S.equipment.weapon = null; Combat.recalcHero();
        const r = UI.autoDispose(item);           // 탈락품 처리 경로만 직접 검사
        return { target, equipped: r.equipped, gained: r.gained > 0, still: !S.equipment.weapon };
    });
    ok(d.target, '유지 시대를 켰는데 hasAutoTarget()가 false다');
    ok(!d.equipped && d.gained && d.still, '유지 시대 지정 상태인데 탈락품이 자동 장착됐다 (사용자 지시 무시)');
    console.log(`④ 유지 시대 지정 시 탈락품 — 자동장착=${d.equipped} 판매수익=${d.gained}`);

    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n'));
    console.log(fails.length || errs.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n') : '\n✅ PASS — 기본 설정에서도 자동 제련이 예산만큼 자동으로 돈다');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
