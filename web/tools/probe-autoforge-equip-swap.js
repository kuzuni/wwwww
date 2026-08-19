// 자동 제련 비교 팝업의 [장착] 강제 연쇄 검증 (autoforge-cards-at-once ⑵, 사용자 지시 2026-08-20).
//
// 무엇을 재는가 — 자동 제련 중 뜬 비교 팝업에서 [장착]을 눌렀을 때:
//  ⑴ 팝업이 **닫히지 않는다** (수동 제작과 같은 결: 두 카드가 맞바뀐다)
//  ⑵ 그때까지 끼고 있던 **옛 장비가 아래로 내려와 새 대기품**이 된다 — 소멸하지 않는다.
//     세이브(S.pendingCraft)에도 같이 남아 새로고침에 증발하지 않는다.
//  ⑶ 자동 시퀀스가 **혼자 다음 팝업으로 튀지 않는다** — 큐가 남아 있어도 이 팝업 앞에서 기다린다
//     (강제 연쇄 제거. 다음으로 넘어가는 건 사용자가 [판매]하거나 딤을 눌렀을 때뿐이다)
//  ⑷ 그 자리에서 [판매]하면 **큐의 다음 항목으로 이어진다** — 즉 시퀀스가 멈춰 죽지 않는다
//     (ui.js 3447~3449의 옛 주석이 걱정하던 '스왑을 반복하면 시퀀스가 안 나간다'의 반대 증명)
//  ⑸ 내려온 옛 장비에서 [장착]을 다시 누르면 **되돌아간다**(수동과 동일, `_swapped` 라벨)
//
// 사용: node probe-autoforge-equip-swap.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitUiReady } = require('./wait-ready.js');
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
    await waitUiReady(page);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 5; S.bestStage = 9; S.forgeLevel = 20;
    });

    // ── 준비: 전 부위에 장비를 채워 둔다(어느 슬롯이 뽑히든 '내려올 옛 장비'가 있게) ──
    // 그 뒤 배치 3개를 돌려 카드가 다 지나가고 **첫 비교 팝업이 뜬 상태**까지 진행한다.
    const armed = await page.evaluate(async () => {
        S.autoForgeOn = false; UI._autoSeq = null; UI.clearPendingCraft();
        S.autoMatchQueue = []; S.autoMatchHeld = false; S.autoBatch = null;
        UI.els.craftModal.classList.add('hidden');
        for (const s of SLOTS) { const it = Forge.rollItem(); it.slot = s; Forge.equip(it); }
        S.autoForge = { keepAges: AGES.slice(), filterOn: false, filterSubs: [], hammersPerBatch: 3, stopOnTarget: false };
        S.hammers = 3;                       // 배치 1회(3장) → 카드 3장 → 팝업 3개가 큐로 대기
        UI.onToggleAutoForge();
        for (let i = 0; i < 400; i++) {
            if (!UI.els.craftModal.classList.contains('hidden')) break;
            await new Promise(r => setTimeout(r, 50));
        }
        return {
            open: !UI.els.craftModal.classList.contains('hidden'),
            seq: !!UI._autoSeq, on: S.autoForgeOn,
            queued: (S.autoMatchQueue || []).length,
            pending: UI._pendingItem && UI._pendingItem.name,
        };
    });
    ok(armed.open && armed.seq, `준비 실패 — 자동 시퀀스(${armed.seq}) 중 비교 팝업(${armed.open})이 떠야 한다`);
    ok(armed.queued >= 1, `준비 실패 — 뒤에 대기하는 큐가 있어야 '강제 연쇄'를 잴 수 있다 (큐 ${armed.queued})`);
    console.log(`준비 — 자동 시퀀스 중 비교 팝업 열림(대기품 ${armed.pending} · 뒤에 큐 ${armed.queued}개)`);

    // ── ⑴⑵⑶ [장착] 을 누른 직후의 상태 ──────────────────────────────
    const eq = await page.evaluate(() => {
        const slot = UI._pendingItem.slot;
        const newName = UI._pendingItem.name;
        const prevName = S.equipment[slot] && S.equipment[slot].name;
        const q0 = (S.autoMatchQueue || []).length, h0 = S.hammers;
        // ⚠️ '팝업이 열려 있다'만 보면 안 된다 — 강제 연쇄는 이 팝업을 닫고 **큐의 다음 것**을 여는
        //    것이라 열림 여부만으로는 구별이 안 된다(실측: 옛 코드에서도 열림=true). 그래서 이 한 번의
        //    선택 동안 팝업이 **어떤 장비로 몇 번** 다시 열렸는지를 센다.
        const origModal = UI.showCraftModal;
        window.__reopen = [];
        UI.showCraftModal = function (it) { window.__reopen.push(it && it.name); return origModal.call(this, it); };
        UI.doResolveCraft('equip');
        UI.showCraftModal = origModal;
        const saved = JSON.parse(localStorage.getItem('forgeclone_save_v1')) || {};
        return {
            slot, newName, prevName, reopen: window.__reopen.slice(),
            modalOpen: !UI.els.craftModal.classList.contains('hidden'),
            equipped: S.equipment[slot] && S.equipment[slot].name === newName,
            pending: UI._pendingItem && UI._pendingItem.name,
            pendingSwapped: !!(UI._pendingItem && UI._pendingItem._swapped),
            savedPending: saved.pendingCraft && saved.pendingCraft.name,
            q0, q1: (S.autoMatchQueue || []).length, h0, h1: S.hammers,
            seq: !!UI._autoSeq,
        };
    });
    ok(eq.equipped, `[장착] 인데 새 장비가 장착되지 않았다 (${eq.newName})`);
    ok(eq.modalOpen, '⑴ 자동 제련 중 [장착] 뒤 팝업이 통째로 닫혔다');
    ok(eq.reopen.length === 1 && eq.reopen[0] === eq.prevName,
        `⑴ [장착] 이 큐의 다음 장비로 튕겼다 — 강제 연쇄가 남아 있다. 이번 선택 동안 열린 팝업: ${JSON.stringify(eq.reopen)} (기대: 내려온 옛 장비 ${eq.prevName} 하나뿐)`);
    ok(eq.pending === eq.prevName, `⑵ 내려온 옛 장비가 대기품이 되지 않았다 (기대 ${eq.prevName} · 실제 ${eq.pending})`);
    ok(eq.pendingSwapped, '⑵ 내려온 옛 장비에 _swapped 표식이 없다 (라벨이 "새로운!"으로 되돌아간다)');
    ok(eq.savedPending === eq.prevName, `⑵ 세이브에 옛 장비가 안 남았다 (새로고침에 증발) — saved=${eq.savedPending}`);
    ok(eq.q1 === eq.q0, `⑶ [장착] 이 큐를 스스로 한 칸 소비했다 (${eq.q0} → ${eq.q1}) — 다음 팝업으로 자동 진행한 흔적`);
    ok(eq.h1 === eq.h0, `⑶ [장착] 이 곧바로 다음 망치질을 시작했다 (${eq.h0} → ${eq.h1})`);
    console.log(`⑴⑵⑶ [장착] → 팝업 유지 ${eq.modalOpen} · 옛 장비(${eq.prevName})가 대기품 ${eq.pending === eq.prevName}(세이브 ${eq.savedPending === eq.prevName}) · 큐 ${eq.q0}→${eq.q1} · 망치 ${eq.h0}→${eq.h1}`);

    // ── ⑸ 내려온 옛 장비에서 [장착] 재차 → 되돌아간다(수동과 동일) ──
    const back = await page.evaluate(() => {
        const slot = UI._pendingItem.slot, oldName = UI._pendingItem.name;
        const curName = S.equipment[slot] && S.equipment[slot].name;
        UI.doResolveCraft('equip');
        return {
            restored: S.equipment[slot] && S.equipment[slot].name === oldName,
            pending: UI._pendingItem && UI._pendingItem.name, curName,
            modalOpen: !UI.els.craftModal.classList.contains('hidden'),
        };
    });
    ok(back.restored && back.pending === back.curName,
        `⑸ 되장착이 안 된다 (되돌림 ${back.restored} · 대기품 ${back.pending} / 기대 ${back.curName})`);
    ok(back.modalOpen, '⑸ 되장착에서 팝업이 닫혔다');
    console.log(`⑸ 되장착 — 옛 장비 복귀 ${back.restored} · 새 것이 다시 대기품 ${back.pending === back.curName}`);

    // ── ⑷ [판매] 로 이 팝업을 끝내면 큐의 다음 항목으로 이어진다 ──
    const nextUp = await page.evaluate(() => {
        window.__opens = 0;
        const orig = UI.showCraftModal;
        UI.showCraftModal = function (it) { window.__opens++; return orig.call(this, it); };
        const q0 = (S.autoMatchQueue || []).length;
        UI.doResolveCraft('sell');
        UI.showCraftModal = orig;
        return { q0, q1: (S.autoMatchQueue || []).length, opens: window.__opens,
                 modalOpen: !UI.els.craftModal.classList.contains('hidden'),
                 pending: UI._pendingItem && UI._pendingItem.name };
    });
    ok(nextUp.opens === 1 && nextUp.modalOpen && nextUp.q1 === nextUp.q0 - 1,
        `⑷ [판매] 뒤 큐의 다음 항목이 안 열렸다 (팝업 ${nextUp.opens}회 · 열림 ${nextUp.modalOpen} · 큐 ${nextUp.q0}→${nextUp.q1}) — 시퀀스가 멈춰 죽었다`);
    console.log(`⑷ [판매] → 다음 큐 항목 팝업 ${nextUp.opens}회 · 큐 ${nextUp.q0}→${nextUp.q1} · 대기품 ${nextUp.pending}`);

    // ── 잔여 배치가 끝까지 흘러가는지(막다른 골목 없음) ──
    const drain = await page.evaluate(async () => {
        for (let i = 0; i < 400 && (S.autoForgeOn || (S.autoMatchQueue || []).length || UI._pendingItem); i++) {
            if (!UI.els.craftModal.classList.contains('hidden')) UI.doResolveCraft('sell');
            await new Promise(r => setTimeout(r, 50));
        }
        return { on: S.autoForgeOn, q: (S.autoMatchQueue || []).length, pending: !!UI._pendingItem, hammers: S.hammers };
    });
    ok(!drain.on && drain.q === 0 && !drain.pending,
        `잔여가 안 빠졌다 — 진행중 ${drain.on} · 큐 ${drain.q} · 대기품 ${drain.pending}`);
    console.log(`잔여 — 자동 정지 ${!drain.on} · 큐 ${drain.q} · 대기품 ${drain.pending} · 망치 ${drain.hammers}`);

    await browser.close();
    if (errs.length) fails.push(`콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    if (fails.length) { console.log('\n❌ FAIL'); fails.forEach(f => console.log(' - ' + f)); process.exit(1); }
    console.log('\n✅ PASS — 자동 제련 [장착]이 강제 연쇄 없이 수동과 같은 결로 동작한다');
})();
