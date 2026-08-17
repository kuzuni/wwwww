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
    await page.evaluate(() => { UI.closeGearDetail(); UI._autoSeq = null; UI.setPendingCraft(Forge.craft(1)[0]); UI.showCraftModal(UI._pendingItem); });
    await run('⑤ 제작 비교 [장착](유지)', '#craft-modal', `() => UI.resolveCraft('equip')`, true);

    // ⑤-b 장착이 실제로 됐는지 + 그 상태에서 딤 클릭이면 닫히는지 (유일한 닫기 경로)
    const after = await page.evaluate(() => {
        const el = document.querySelector('#craft-modal');
        const before = { open: !el.classList.contains('hidden'), btns: [...el.querySelectorAll('.btn')].map(b => b.textContent.trim()) };
        el.click();   // 딤(모달 자신) 클릭
        return { before, closedByDim: el.classList.contains('hidden') };
    });
    ok(after.before.open, '⑤-b 장착 직후 제작 비교 팝업이 닫혔다 (열린 채여야 한다)');
    ok(!after.before.btns.some(t => /^판매/.test(t)), `⑤-b 장착 후에도 [판매] 버튼이 살아 있다 (${after.before.btns.join(' / ')})`);
    ok(after.closedByDim, '⑤-b 딤을 눌러도 안 닫힌다 — 장착 후 팝업에 갇힌다');
    rows.push(`⑤-b 장착 후 상태            열림=${after.before.open} 버튼=[${after.before.btns.join(' / ')}] 딤닫힘=${after.closedByDim}`);

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
