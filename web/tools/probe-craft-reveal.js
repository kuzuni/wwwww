// 제작 결과 리빌 카드 검증 (사용자 지시 2026-08-18 `craft-reveal-card`)
//   "여전히 망치질→카드보여줌→비교팝업 이렇게 안 되고 카드를 안 보여준다."
// 검사 항목
//  ⑴ 수동 제작: 망치질(.striking) 중에는 리빌 카드도 비교 팝업도 없다
//  ⑵ 망치질이 끝나면 **리빌 카드(.auto-drop-card.craft-reveal)가 먼저** 뜨고, 그동안 비교 팝업은 닫혀 있다
//  ⑶ 카드가 걷힌 **뒤에** 비교 팝업이 뜬다 (순서 역전·동시 노출 금지)
//  ⑷ 카드는 화면 안, 모루 버튼 위쪽에 뜬다(보이지 않는 곳에 그리면 '보여줌'이 아니다)
//  ⑸ 자동 제작 통과분도 같은 순서(카드 → 팝업)를 탄다
//     ⚠️ **2026-08-20 사양 변경 반영(red-probes-4 ⑵)**: 자동 경로의 카드는 `autoforge-cards-at-once`
//        지시로 **카드판(`.craft-batch`, N장 동시)** 이 됐다. 종전 이 판정기는 한 장짜리
//        `.auto-drop-card.craft-reveal` 만 찾아서 **사양대로 도는 코드를 FAIL 로 찍고 있었다**
//        (코드 회귀가 아니라 자가 낡은 것 — 같은 HEAD 에서 `probe-autoforge-batch` 는 PASS 한다).
//        순서 계약('카드가 걷힌 뒤 팝업')은 그대로 살려 둔다.
//  ⑹ 카드가 떠 있는 동안 모루를 다시 눌러도 대기품이 덮어써지지 않는다(해머만 녹는 사고 방지)
//  ⑺ 콘솔 에러 0건
// 사용: node probe-craft-reveal.js
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
async function until(page, fnSrc, ms = 8000) {
    const t0 = Date.now();
    for (;;) {
        if (await page.evaluate(fnSrc).catch(() => false)) return true;
        if (Date.now() - t0 > ms) return false;
        await page.waitForTimeout(25);
    }
}

// 제작 한 벌을 16ms 간격으로 샘플링해 '카드'와 '팝업'이 각각 언제 보였는지 구간을 뽑는다.
// 순서 검증은 스냅샷 한 장이 아니라 이 타임라인으로 한다(연출은 시간축 위에 있다).
// ⚠️ 샘플러는 **페이지 안에서** 돈다 — Node에서 page.evaluate로 폴링하면 왕복 지연이 샘플 간격을
// 수십~수백 ms로 벌려 0.72초 망치질 구간이 통째로 빠진다(실측: striking 프레임이 한 번도 안 잡혔다).
async function recordTimeline(page, trigger, ms = 2200) {
    await page.evaluate(() => {
        window.__tl = [];
        window.__rec = setInterval(() => {
            const card = document.querySelector('.auto-drop-card.craft-reveal');
            const r = card ? card.getBoundingClientRect() : null;
            window.__tl.push({
                t: Math.round(performance.now()),
                striking: !!document.querySelector('.anvil-btn.striking'),
                card: !!card,
                // 자동 경로의 '결과 보여주기'는 2026-08-20 `autoforge-cards-at-once` 로 **카드판**이 됐다 —
                // 한 장짜리 리빌 카드(`.auto-drop-card`)가 아니라 `.craft-batch` 에 N장이 한꺼번에 뜬다.
                // 수동 경로는 그대로 리빌 카드라 두 축을 따로 기록한다(⑸ 만 카드판을 본다).
                batch: !!document.querySelector('.craft-batch'),
                // rect는 crpop 첫 프레임 scale(.62)이 섞이므로, 크기 판정용으로 변환 무관한 레이아웃 크기(lw/lh)도 같이 기록
                cardBox: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), lw: card.offsetWidth, lh: card.offsetHeight } : null,
                modal: !!(UI.els.craftModal && !UI.els.craftModal.classList.contains('hidden')),
            });
        }, 16);
    });
    await page.evaluate(trigger);
    await page.waitForTimeout(ms);
    return await page.evaluate(() => { clearInterval(window.__rec); return window.__tl; });
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
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 5; S.bestStage = 9; S.hammers = 500; S.forgeLevel = 20;
        S.autoForge.keepAges = []; S.autoForge.filterOn = false; S.autoForge.filterSubs = [];
        UI.switchTab(null);           // 모루가 있는 메인 화면
    });
    await page.waitForTimeout(300);

    // ================= ⑴~⑷ 수동 제작 =================
    await page.evaluate(() => { UI.resolvePendingCraft(); });
    // ⚠️ 관측 창은 **망치질 길이에서 되풀어** 잡는다. 예전엔 3000ms 상수였는데(망치질 0.72초 기준),
    //    망치질이 3초로 늘어난 뒤(anvil-anim-3s-juicy) 그 창 안에서는 카드가 아직 뜨지도 않아
    //    "카드를 안 보여준다"는 **유령 실패**가 났다 — 프로브가 제 코드보다 낡은 전형(함정 ④).
    // 🚨 여유분(뒤의 상수)은 **클럭에 비례하지 않는다** — 헤드리스에서 망치질 시작~카드까지 붙는
    //    지연은 부팅·페인트·병렬 세션 부하에서 오는 고정비다(실측: 3초판 639ms · 1.5초판 972ms).
    //    900ms 로는 1.5초 축소(anvil-anim-3s-juicy 재오픈) 뒤 팝업이 창 밖으로 27ms 밀려
    //    "팝업이 끝내 안 떴다"는 유령 실패가 났다. 클럭을 줄일수록 여유분은 **더** 필요하다.
    const WIN = await page.evaluate(() => UI.ANVIL_FX_MS + UI.REVEAL_CARD_MS + 2200);
    const tl = await recordTimeline(page, () => { UI.onCraft(); }, WIN);

    const idx = p => tl.findIndex(p);
    const firstStrike = idx(r => r.striking);
    const firstCard = idx(r => r.card);
    const lastCard = tl.map(r => r.card).lastIndexOf(true);
    const firstModal = idx(r => r.modal);

    ok(firstStrike >= 0, '⑴ 망치질(.striking) 프레임이 한 번도 안 잡혔다');
    ok(firstCard >= 0, '⑵ 리빌 카드(.auto-drop-card.craft-reveal)가 끝내 안 떴다 — 카드를 안 보여준다(사용자 지적 그대로)');
    ok(firstModal >= 0, '⑶ 비교 팝업이 끝내 안 떴다');
    if (firstCard >= 0 && firstStrike >= 0) {
        // 망치질 중에는 카드가 없어야 한다(망치질 → 카드 순서)
        ok(!tl.slice(0, firstCard).some(r => r.card && r.striking) && tl[firstCard].striking === false,
            '⑵ 리빌 카드가 망치질이 끝나기 전에 떴다 (순서: 망치질 → 카드)');
    }
    if (firstCard >= 0 && firstModal >= 0) {
        ok(firstCard < firstModal, `⑶ 팝업이 카드보다 먼저/같이 떴다 (카드 idx=${firstCard}, 팝업 idx=${firstModal})`);
        ok(lastCard < firstModal, `⑶ 카드가 걷히기 전에 팝업이 겹쳐 떴다 (카드 끝 idx=${lastCard}, 팝업 idx=${firstModal})`);
        const shownMs = (tl[lastCard].t - tl[firstCard].t);
        ok(shownMs >= 300, `⑵ 카드 노출이 너무 짧다 (${shownMs}ms) — 읽을 시간이 없다`);
    }
    if (firstCard >= 0) {
        const b = tl[firstCard].cardBox || (tl.find(r => r.cardBox) || {}).cardBox;
        const anvil = await page.evaluate(() => {
            const el = document.querySelector('.anvil-btn');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        });
        if (b && anvil) {
            // craft-card-slot-look(2026-08-18): 카드는 장비 슬롯 룩의 정사각(3.7rem)이다 — 레이아웃 크기로 판정
            ok(b.lw > 40 && b.lh > 40 && Math.abs(b.lw - b.lh) <= 2, `⑷ 카드가 슬롯형 정사각이 아니다 (${b.lw}x${b.lh})`);
            ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 430 && b.y + b.h <= 932, `⑷ 카드가 화면 밖 (${JSON.stringify(b)})`);
            ok(b.y + b.h <= anvil.y + anvil.h, `⑷ 카드가 모루 위쪽이 아니다 (card.bottom=${b.y + b.h}, anvil.bottom=${anvil.y + anvil.h})`);
        } else ok(false, '⑷ 카드/모루 박스를 못 읽었다');
    }

    // ================= ⑹ 카드 노출 중 재클릭 방어 =================
    await page.evaluate(() => { UI.resolvePendingCraft(); });
    await page.waitForTimeout(200);
    const reclick = await page.evaluate(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        UI.onCraft();
        await sleep(UI.ANVIL_FX_MS + 60);           // 망치질이 끝나 카드가 떠 있는 시점
        const cardUp = !!document.querySelector('.auto-drop-card.craft-reveal');
        const before = UI._pendingItem;
        const hammersBefore = S.hammers;
        UI.onCraft();                                // 카드가 떠 있는 사이 재클릭
        return { cardUp, same: UI._pendingItem === before, hammersSpent: hammersBefore - S.hammers };
    });
    ok(reclick.cardUp, '⑹ 망치질 직후 카드가 떠 있지 않았다(타이밍 전제 실패)');
    ok(reclick.same, '⑹ 카드가 떠 있는 사이 재클릭이 대기품을 덮어썼다');
    ok(reclick.hammersSpent === 0, `⑹ 카드 노출 중 재클릭이 해머를 ${reclick.hammersSpent}개 먹었다`);

    // ================= ⑸ 자동 제작 통과분 =================
    await until(page, `!!(UI.els.craftModal && !UI.els.craftModal.classList.contains('hidden'))`, 3000);
    await page.evaluate(() => { UI.resolvePendingCraft(); });
    await page.waitForTimeout(200);
    const tl2 = await recordTimeline(page, () => {
        Forge.passesAutoFilter = () => true;          // 전부 통과시켜 '통과분 → 카드 → 팝업'만 본다
        S.autoForge.hammersPerBatch = 2;
        // 통과분(목표)은 어느 모드든 비교 팝업으로 뜬다(autoforge-show-all-cards 재지적: 자동장착 금지).
        // stopOnTarget ON 이면 그 팝업이 배치의 마지막이라, '카드가 걷힌 뒤 팝업' 순서를 안정적으로 본다.
        S.autoForge.stopOnTarget = true;
        S.autoForgeOn = true;
        UI.startAutoSeq();
    }, WIN);   // 자동 배치도 같은 이유로 클럭에서 되풀어 쓴다(2600ms 상수는 0.72초 망치질 시절 값)
    // ⑸ 는 카드판(.craft-batch)이 정답이다 — 한 장짜리 리빌 카드로도 보여 줄 수는 있으니 둘 다 인정한다.
    const shown = tl2.map(r => r.card || r.batch);
    const aCard = shown.indexOf(true);
    const aLastCard = shown.lastIndexOf(true);
    const aModal = tl2.findIndex(r => r.modal);
    ok(aCard >= 0, '⑸ 자동 제작 통과분에 결과 카드(카드판 .craft-batch 또는 리빌 카드)가 없다');
    ok(aModal >= 0, '⑸ 자동 제작 통과분에 비교 팝업이 안 떴다');
    if (aCard >= 0 && aModal >= 0) {
        ok(aCard < aModal, `⑸ 자동 통과분에서 팝업이 카드보다 먼저 떴다 (카드 ${aCard}, 팝업 ${aModal})`);
        ok(aLastCard < aModal, `⑸ 자동 통과분에서 카드와 팝업이 겹쳤다 (카드 끝 ${aLastCard}, 팝업 ${aModal})`);
    }
    await page.evaluate(() => { UI.stopAutoSeq(); UI.resolvePendingCraft(); });

    ok(errs.length === 0, `⑺ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);

    const ms = (rows, i) => (i >= 0 && rows[i] ? rows[i].t - rows[0].t : -1);
    console.log('--- 제작 리빌 카드 검증 ---');
    console.log(`수동   : 망치질 ${ms(tl, firstStrike)}ms~ · 카드 ${ms(tl, firstCard)}~${ms(tl, lastCard)}ms(노출 ${ms(tl, lastCard) - ms(tl, firstCard)}ms) · 팝업 ${ms(tl, firstModal)}ms`);
    console.log(`자동   : 카드 ${ms(tl2, aCard)}~${ms(tl2, aLastCard)}ms · 팝업 ${ms(tl2, aModal)}ms`);
    console.log(`재클릭 : 카드노출=${reclick.cardUp} 대기품유지=${reclick.same} 해머소모=${reclick.hammersSpent}`);
    if (fails.length) { console.log('FAIL ' + fails.length + '건'); fails.forEach(f => console.log('  ✗ ' + f)); }
    else console.log('PASS — 망치질 → 카드 → 비교팝업 순서 확인');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
