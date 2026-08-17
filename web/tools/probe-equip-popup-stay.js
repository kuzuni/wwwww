// "장착하면 팝업이 꺼진다" 재현/회귀 검증 (사용자 재지적 2026-08-17).
// 장착 버튼을 누른 뒤 **연속 프레임**(rAF)으로 팝업 상태를 기록해 ⑴ 닫힘 ⑵ 깜빡임(투명해졌다 복귀)을 구분한다.
//   측정값/프레임 = { hidden, opacity, cardW, opening } — opacity가 1 미만이거나 카드가 사라진 프레임이 하나라도
//   있으면 깜빡임으로 본다. .opening 클래스가 재렌더 뒤에 다시 붙어도 (열림 애니메이션 재시작) 깜빡임이다.
// 경로: ① 탈것 상세 [장착] ② 탈것 목록 재렌더 ③ 펫 상세 [출전] ④ 장비 상세(장착됨) 팝업이 제작 틱에도 유지되는지
//       ⑤ 제작 비교 팝업 [장착] — **열린 채 유지**가 정상이다(사용자 지시 2026-08-18로 뒤집혔다:
//         닫히는 경로는 [판매]와 딤 클릭 둘뿐). 자동 제련 시퀀스 중에만 닫고 다음 제작으로 넘어간다.
// 사용: node probe-equip-popup-stay.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 페이지 안에서: act()를 실행하고 ms 동안 매 프레임 sel 팝업 상태를 기록한다
const WATCH = `(sel, act, ms) => new Promise(res => {
    const el = document.querySelector(sel);
    const frames = [];
    const t0 = performance.now();
    const grab = () => {
        const cs = getComputedStyle(el);
        const card = el.querySelector('.modal-card');
        frames.push({
            t: Math.round(performance.now() - t0),
            hidden: el.classList.contains('hidden'),
            opening: el.classList.contains('opening'),
            op: +cs.opacity,
            cardOp: card ? +getComputedStyle(card).opacity : -1,
            cardW: card ? Math.round(card.getBoundingClientRect().width) : -1,
        });
    };
    grab(); act(); grab();
    const loop = () => { grab(); (performance.now() - t0 < ms) ? requestAnimationFrame(loop) : res(frames); };
    requestAnimationFrame(loop);
})`;

const verdict = (frames, { mustStayOpen }) => {
    const closed = frames.some(f => f.hidden);
    const dim = frames.filter(f => !f.hidden && (f.op < 0.99 || f.cardOp < 0.99));
    const gone = frames.filter(f => !f.hidden && f.cardW <= 0);
    const reopened = frames.slice(2).some(f => f.opening);
    return {
        closed, reopened, dimN: dim.length, goneN: gone.length,
        minOp: Math.min(...frames.filter(f => !f.hidden).map(f => Math.min(f.op, f.cardOp === -1 ? 1 : f.cardOp)), 1),
        bad: (mustStayOpen && closed) || dim.length || gone.length || reopened,
    };
};

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [], rows = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.coins = 1e12; S.hammers = 1e6; S.winders = 1e6; S.eggCurrency = 1e6; S.tickets = 1e6; S.forgeLevel = 20;
        Mounts.summon(6);
        // 펫은 소환→부화 대기라 시간이 걸린다 — 부화 완료 경로가 만드는 것과 같은 모양으로 바로 세워 둔다
        for (let r = 0; r < 3; r++) {
            Pets.summon(2);
            while (S.eggs.length && S.hatching.length < Pets.maxHatchSlots()) Pets.startHatch(0);
            S.hatching.forEach(h => { h.endsAt = U.now() - 1; });
            Pets.tick();
        }
    });

    const run = async (label, sel, actSrc, mustStayOpen) => {
        await page.waitForTimeout(500);   // 직전에 연 팝업의 열림 애니메이션(.opening 300ms)이 끝나고 나서 측정
        const frames = await page.evaluate(`(${WATCH})('${sel}', ${actSrc}, 700)`);
        const v = verdict(frames, { mustStayOpen });
        rows.push(`${label.padEnd(22)} 닫힘=${v.closed} 재오픈애니=${v.reopened} 투명프레임=${v.dimN} 카드소실=${v.goneN} 최소opacity=${v.minOp} (${frames.length}프레임)`);
        if (mustStayOpen) {
            ok(!v.closed, `${label}: 장착 후 팝업이 닫혔다`);
            ok(!v.reopened, `${label}: 재렌더가 열림 애니메이션(.opening)을 다시 켰다 — 깜빡임`);
            ok(!v.dimN, `${label}: 투명해진 프레임 ${v.dimN}개 (최소 opacity ${v.minOp})`);
            ok(!v.goneN, `${label}: 카드가 사라진 프레임 ${v.goneN}개`);
        } else {
            ok(v.closed, `${label}: 닫혀야 하는데 열린 채로 남았다`);
        }
        return v;
    };

    // ① 탈것 상세 [장착] — 상세는 열린 채 갱신돼야 한다
    await page.evaluate(() => { const n = Object.keys(S.mounts)[0]; UI.openMounts(); UI.openMountDetail(n); });
    await run('① 탈것 상세 [장착]', '#detail-modal',
        `() => { const n = Object.keys(S.mounts)[0]; UI.onEquipMount(n); UI.openMountDetail(n); }`, true);

    // ② 탈것 목록 팝업 — 장착으로 목록이 다시 그려지는 동안 유지돼야 한다
    await page.evaluate(() => { UI.closeDetail(); UI.openMounts(); });
    await run('② 탈것 목록 재렌더', '#mount-modal',
        `() => { const n = Object.keys(S.mounts)[0]; UI.onEquipMount(n); }`, true);

    // ③ 펫 상세 [출전] — 펫 상세도 같은 구조
    const hasPet = await page.evaluate(() => { UI.closeMounts(); return (S.pets || []).length > 0; });
    if (hasPet) {
        await page.evaluate(() => { UI.switchTab('summon'); UI.openPetDetail(0); });
        await run('③ 펫 상세 [출전]', '#detail-modal',
            `() => { UI.onTogglePet(0); UI.openPetDetail(0); }`, true);
    } else rows.push('③ 펫 상세 — 펫이 없어 건너뜀');

    // ③-2 스킬 상세 [장착] — 스킬도 같은 '핸들러 + 다시 열기' 구조
    const hasSkill = await page.evaluate(() => {
        UI.closeDetail(); S.tickets = 1e6; Skills.summon(5);
        const id = Object.keys(S.skills)[0];
        if (id) { UI.switchTab('summon'); UI.openSkillDetail(id); }
        return !!id;
    });
    if (hasSkill) {
        await run('③-2 스킬 상세 [장착]', '#detail-modal',
            `() => { const id = Object.keys(S.skills)[0]; UI.onToggleSkill(id); UI.openSkillDetail(id); }`, true);
    } else rows.push('③-2 스킬 상세 — 스킬이 없어 건너뜀');

    // ④ 장비 상세(장착됨) 팝업이 제작·재렌더 틱에 유지되는지
    await page.evaluate(() => {
        UI.closeDetail();
        SLOTS.forEach(() => { const it = Forge.craft(1)[0]; if (it) Forge.equip(it); });
        const slot = SLOTS.find(s => S.equipment[s]);
        if (slot) UI.openGearDetail(slot);
    });
    await run('④ 장비 상세 유지', '#gear-detail-modal',
        `() => { UI.renderEquipSheet(); UI.tickSecond(); UI.renderGearDetail(); }`, true);

    // ⑥ 실제 클릭 경로 — 핸들러 직접 호출이 아니라 버튼을 진짜로 누른다(항목 지시)
    await page.evaluate(() => {
        UI.closeGearDetail(); UI.closeDetail();
        const n = Object.keys(S.mounts).find(k => k !== S.activeMount) || Object.keys(S.mounts)[0];
        UI.openMounts(); UI.openMountDetail(n);
    });
    await run('⑥ 탈것 상세 버튼 실클릭', '#detail-modal',
        `() => { const b = [...document.querySelectorAll('#detail-modal .btn')].find(x => /장착|해제/.test(x.textContent)); b.click(); }`, true);

    // ⑤ 제작 비교 팝업 [장착] — 수동 제작에서는 **열린 채 유지**(사용자 지시 2026-08-18)
    // 스왑을 보려면 그 부위가 비어 있으면 안 된다(빈 부위는 내려올 옛 장비가 없어 닫히는 게 정상) →
    // 대기품과 같은 슬롯에 옛 장비를 확정적으로 끼워 둔다.
    await page.evaluate(() => {
        UI.closeGearDetail(); UI._autoSeq = null;
        const it = Forge.craft(1)[0];
        let old = Forge.craft(1)[0];
        for (let i = 0; i < 60 && old.slot !== it.slot; i++) old = Forge.craft(1)[0];
        old.name = '옛장비-표식'; S.equipment[it.slot] = old;
        window.__swap = { newName: it.name, oldName: old.name, slot: it.slot };
        UI.setPendingCraft(it); UI.showCraftModal(it);
    });
    await run('⑤ 제작 비교 [장착](유지)', '#craft-modal', `() => UI.resolveCraft('equip')`, true);

    // ⑤-b 장착 = 두 카드 스왑 (사용자 지시 2026-08-18): 위=방금 장착한 새 것, 아래=내려온 옛 것,
    //      판매 버튼은 그대로 살아 있어 옛 장비를 그 자리에서 팔 수 있어야 한다.
    const after = await page.evaluate(() => {
        const el = document.querySelector('#craft-modal');
        const s = window.__swap;
        const nameOf = (q) => (el.querySelector(q + ' .cmp-name') || {}).textContent || '';
        return {
            open: !el.classList.contains('hidden'),
            btns: [...el.querySelectorAll('.btn')].map(b => b.textContent.trim()),
            topName: nameOf('.cmp-card-wrap.cur'), botName: nameOf('.cmp-card-wrap.new'),
            botTag: (el.querySelector('.cmp-newtag') || {}).textContent || '',
            equippedName: (S.equipment[s.slot] || {}).name,
            pendingName: (UI._pendingItem || {}).name,
            savedPending: (S.pendingCraft || {}).name,
            s,
        };
    });
    ok(after.open, '⑤-b 장착 직후 제작 비교 팝업이 닫혔다 (열린 채여야 한다)');
    ok(after.btns.some(t => /^판매/.test(t)), `⑤-b 장착 후 [판매] 버튼이 사라졌다 — 내려온 옛 장비를 팔 수 없다 (${after.btns.join(' / ')})`);
    ok(after.btns.some(t => /^장착/.test(t)), `⑤-b 장착 후 [장착] 버튼이 사라졌다 — 스왑백을 못 한다 (${after.btns.join(' / ')})`);
    ok(after.equippedName === after.s.newName, `⑤-b 새 장비가 실제로 장착되지 않았다 (장착됨=${after.equippedName})`);
    ok(after.topName.includes(after.s.newName), `⑤-b 위 카드가 새로 장착된 장비가 아니다 (${after.topName})`);
    ok(after.botName.includes(after.s.oldName), `⑤-b 아래 카드로 옛 장비가 내려오지 않았다 (${after.botName})`);
    ok(after.botTag === '교체됨', `⑤-b 아래 카드 리본이 '교체됨'이 아니다 (${after.botTag})`);
    ok(after.pendingName === after.s.oldName, `⑤-b 옛 장비가 새 대기품이 아니다 (${after.pendingName})`);
    ok(after.savedPending === after.s.oldName, `⑤-b 스왑된 대기품이 세이브에 안 남았다 — 새로고침하면 옛 장비 유실 (${after.savedPending})`);
    rows.push(`⑤-b 장착 스왑              위=${after.topName.trim()} 아래=${after.botName.trim()}(${after.botTag}) 버튼=[${after.btns.join(' / ')}]`);

    // ⑤-b2 스왑백 — 내려온 옛 장비에 [장착]을 다시 누르면 원래대로 되돌아간다(무한 왕복 가능)
    const back = await page.evaluate(() => {
        const s = window.__swap;
        UI.resolveCraft('equip');
        const el = document.querySelector('#craft-modal');
        return {
            open: !el.classList.contains('hidden'),
            equippedName: (S.equipment[s.slot] || {}).name,
            pendingName: (UI._pendingItem || {}).name,
            hasSell: [...el.querySelectorAll('.btn')].some(b => /^판매/.test(b.textContent.trim())),
        };
    });
    ok(back.open && back.hasSell, '⑤-b2 스왑백 후 팝업/판매 버튼이 유지되지 않았다');
    ok(back.equippedName === after.s.oldName, `⑤-b2 스왑백으로 옛 장비가 다시 장착되지 않았다 (${back.equippedName})`);
    ok(back.pendingName === after.s.newName, `⑤-b2 스왑백에서 새 장비가 아래로 안 내려왔다 (${back.pendingName})`);
    rows.push(`⑤-b2 스왑백                장착됨=${back.equippedName} 대기=${back.pendingName} 판매버튼=${back.hasSell}`);

    // ⑤-b3 내려온 장비를 그 자리에서 판매 → 팔리고 팝업이 닫힌다(판매는 닫는 경로)
    const sold = await page.evaluate(() => {
        const s = window.__swap, before = S.coins;
        UI.doResolveCraft('sell');   // 등급 경고 팝업을 건너뛰고 판매 자체를 본다
        return {
            closed: document.querySelector('#craft-modal').classList.contains('hidden'),
            gained: S.coins > before, pending: UI._pendingItem, equippedName: (S.equipment[s.slot] || {}).name,
        };
    });
    ok(sold.closed, '⑤-b3 내려온 장비를 팔았는데 팝업이 안 닫혔다');
    ok(sold.gained, '⑤-b3 판매인데 코인이 안 늘었다');
    ok(!sold.pending, '⑤-b3 판매 후에도 대기품이 남았다');
    ok(sold.equippedName === after.s.oldName, `⑤-b3 판매가 장착 중인 장비를 건드렸다 (${sold.equippedName})`);
    rows.push(`⑤-b3 내려온 장비 판매       닫힘=${sold.closed} 코인증가=${sold.gained} 장착유지=${sold.equippedName}`);

    // ⑤-b4 빈 부위 장착 — 내려올 옛 장비가 없으니 스왑할 게 없다 → 닫힌다
    const empty = await page.evaluate(() => {
        const it = Forge.craft(1)[0];
        S.equipment[it.slot] = null;
        UI._autoSeq = null; UI.setPendingCraft(it); UI.showCraftModal(it);
        UI.resolveCraft('equip');
        return {
            closed: document.querySelector('#craft-modal').classList.contains('hidden'),
            equipped: (S.equipment[it.slot] || {}).name === it.name, pending: UI._pendingItem,
        };
    });
    ok(empty.closed, '⑤-b4 빈 부위에 장착했는데 팝업이 안 닫혔다 (스왑할 옛 장비가 없다)');
    ok(empty.equipped, '⑤-b4 빈 부위 장착이 실제로 안 됐다');
    ok(!empty.pending, '⑤-b4 빈 부위 장착 후 대기품이 남았다');
    rows.push(`⑤-b4 빈 부위 장착           닫힘=${empty.closed} 장착됨=${empty.equipped}`);

    // ⑤-b5 딤 클릭 = 보류 — 스왑으로 내려온 옛 장비가 모루 자리 카드로 남아야 한다(유실 금지)
    const held = await page.evaluate(() => {
        const it = Forge.craft(1)[0];
        let old = Forge.craft(1)[0];
        for (let i = 0; i < 60 && old.slot !== it.slot; i++) old = Forge.craft(1)[0];
        old.name = '보류될-옛장비'; S.equipment[it.slot] = old;
        UI._autoSeq = null; UI.setPendingCraft(it); UI.showCraftModal(it);
        UI.resolveCraft('equip');                       // 스왑 — 아래 카드 = old
        const el = document.querySelector('#craft-modal');
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));   // 딤 클릭 = 보류
        return {
            closedByDim: el.classList.contains('hidden'),
            heldName: (UI.heldItem() || {}).name, savedName: (S.pendingCraft || {}).name,
        };
    });
    ok(held.closedByDim, '⑤-b5 스왑 상태에서 딤을 눌러도 안 닫힌다 — 팝업에 갇힌다');
    ok(held.heldName === '보류될-옛장비', `⑤-b5 보류하니 내려온 옛 장비가 사라졌다 (보류품=${held.heldName})`);
    ok(held.savedName === '보류될-옛장비', `⑤-b5 보류된 옛 장비가 세이브에 안 남았다 (${held.savedName})`);
    rows.push(`⑤-b5 스왑 후 딤 보류        닫힘=${held.closedByDim} 보류품=${held.heldName}`);

    // ⑤-c 자동 제련 시퀀스 중에는 장착이 팝업을 닫고 다음으로 넘어간다(예외 경로)
    const autoClosed = await page.evaluate(() => {
        UI._autoSeq = { left: 1, stopAfterPick: false };
        S.autoForgeOn = false;                    // autoSeqStep이 곧바로 다음 제작을 띄우지 않게 정지
        UI.setPendingCraft(Forge.craft(1)[0]); UI.showCraftModal(UI._pendingItem);
        UI.resolveCraft('equip');
        const closed = document.querySelector('#craft-modal').classList.contains('hidden');
        UI._autoSeq = null;
        return closed;
    });
    ok(autoClosed, '⑤-c 자동 제련 시퀀스에서 장착했는데 팝업이 안 닫혔다 (시퀀스가 멈춘다)');
    rows.push(`⑤-c 자동 시퀀스 장착         닫힘=${autoClosed}`);

    console.log(rows.join('\n'));
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    console.log(fails.length ? '❌ FAIL\n - ' + fails.join('\n - ') : '✅ PASS — 장착 후 팝업 유지·무깜빡임');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
