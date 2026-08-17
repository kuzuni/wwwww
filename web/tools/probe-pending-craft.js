// 제작 비교 팝업 대기품 유실 검증 (TODO QA 7차 재현 절차 그대로)
// ① 제작 → 비교 팝업이 뜬 상태로 새로고침 → 해머만 소모되고 장비가 사라지지 않아야 한다
// ② 복원된 팝업에서 [장착]/[판매]을 고르면 정상 반영 ③ 탭 전환 자동 판정은 종전대로
// 사용: node probe-pending-craft.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    const ready = () => page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined' && UI.els && UI.els.craftModal, null, { timeout: 20000 });
    // 전투 수입이 코인·장비 수를 흔들지 않도록 틱 정지
    const freeze = () => page.evaluate(() => { if (typeof Combat !== 'undefined') Combat.tick = () => {}; });

    await page.goto(INDEX, { waitUntil: 'load' }); await ready(); await freeze();

    let bad = 0;
    const chk = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };

    // ── ① 비교 팝업이 뜬 채 새로고침 ──────────────────────────────
    // 제작 → 모루 타격 연출(0.72초) → 비교 팝업. 대기품은 연출 '전에' 세이브에 남아야 한다
    // (연출 도중 새로고침해도 유실되지 않는 것이 이 항목의 핵심).
    const before = await page.evaluate(() => {
        S.equipment.weapon = null;                       // 빈 슬롯에서 시작 — 장착/판매 판정이 명확
        UI.onCraft();
        return { hammers: S.hammers, pending: S.pendingCraft && S.pendingCraft.name,
                 saved: (JSON.parse(localStorage.getItem(SAVE_KEY)).pendingCraft || {}).name,
                 modal: !UI.els.craftModal.classList.contains('hidden') };
    });
    chk(!!before.pending && before.saved === before.pending && !before.modal,
        `제작 직후(타격 연출 중): 팝업은 아직 안 뜨고 대기품만 세이브에 기록(${before.pending})`);

    await page.reload({ waitUntil: 'load' }); await ready(); await freeze();
    const after = await page.evaluate(() => ({
        hammers: S.hammers, pending: S.pendingCraft && S.pendingCraft.name,
        modal: !UI.els.craftModal.classList.contains('hidden'), mem: UI._pendingItem && UI._pendingItem.name,
    }));
    // 해머는 분당 1개 자연 수급이라 새로고침 사이에 늘 수 있다 — '줄지 않는가'가 이 버그의 조건
    chk(after.hammers >= before.hammers, `새로고침 후 해머 손실 없음 ${before.hammers} → ${after.hammers}`);
    chk(after.pending === before.pending && after.mem === before.pending, `대기품 보존: ${after.pending}`);
    chk(after.modal, '비교 팝업이 그대로 복원됨 (자동 판정으로 뺏지 않음)');

    // ── ② 복원된 팝업에서 [장착] 선택 ─────────────────────────────
    const equipped = await page.evaluate(() => {
        const slot = UI._pendingItem.slot, name = UI._pendingItem.name;
        UI.doResolveCraft('equip');
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
        return { ok: S.equipment[slot] && S.equipment[slot].name === name,
                 cleared: S.pendingCraft === null, savedCleared: saved.pendingCraft === null,
                 modal: !UI.els.craftModal.classList.contains('hidden'), name };
    });
    chk(equipped.ok, `복원 팝업에서 [장착] → 실제 장착됨 (${equipped.name})`);
    chk(equipped.cleared && equipped.savedCleared && !equipped.modal, '선택 후 대기품이 메모리·세이브 양쪽에서 비워지고 팝업 닫힘');

    // ── ③ 선택 없이 새로고침 → 판매 선택도 정상인지 ────────────────
    await page.evaluate(() => { UI.onCraft(); });
    await page.waitForTimeout(900);   // 모루 타격 연출이 끝나 팝업이 뜰 때까지
    await page.reload({ waitUntil: 'load' }); await ready(); await freeze();
    const sold = await page.evaluate(() => {
        const before = S.coins, name = UI._pendingItem && UI._pendingItem.name;
        UI.doResolveCraft('sell');
        return { gained: S.coins - before, name, cleared: S.pendingCraft === null };
    });
    chk(sold.gained > 0 && sold.cleared, `복원 팝업에서 [판매] → 코인 +${sold.gained} (${sold.name})`);

    // ── ④ 탭 전환 자동 판정(기존 동작)이 유지되는지 ────────────────
    // 연출이 '끝난 뒤' 탭 전환 + 연출 '도중' 탭 전환 둘 다 대기품이 정리돼야 한다
    const tab = await page.evaluate(async () => {
        S.equipment.helmet = null;
        UI.onCraft();
        await new Promise(r => setTimeout(r, 900));
        const name = UI._pendingItem.name;
        UI.closeAllTabSurfaces();
        const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
        return { name, cleared: S.pendingCraft === null && saved.pendingCraft === null,
                 modal: !UI.els.craftModal.classList.contains('hidden') };
    });
    chk(tab.cleared && !tab.modal, `연출 종료 후 탭 전환 자동 판정 — 대기품 정리됨 (${tab.name})`);

    // 타격 연출 '도중' 탭 전환 — 모달 기준으로 판정하면 이 경로가 새어 나가 연출이 끝난 뒤
    // 엉뚱한 탭 위에 팝업이 떴다(대기품 기준으로 바꿔 막은 회귀).
    const mid = await page.evaluate(async () => {
        UI.onCraft();
        await new Promise(r => setTimeout(r, 200));      // 아직 타격 중
        UI.closeAllTabSurfaces();
        const clearedNow = S.pendingCraft === null && UI._pendingItem === null;
        await new Promise(r => setTimeout(r, 900));      // 연출이 끝났을 시각까지 기다린다
        return { clearedNow, modalAfter: !UI.els.craftModal.classList.contains('hidden'),
                 fx: document.querySelectorAll('.anvil-fx').length };
    });
    chk(mid.clearedNow && !mid.modalAfter && mid.fx === 0,
        '타격 연출 도중 탭 전환 — 즉시 자동 판정되고, 연출이 끝나도 팝업이 뒤늦게 뜨지 않음');

    // ── ⑤ 구세이브(pendingCraft 키 없음) 부팅 ──────────────────────
    await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem(SAVE_KEY));
        delete s.pendingCraft;
        localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    });
    await page.reload({ waitUntil: 'load' }); await ready();
    const legacy = await page.evaluate(() => ({ modal: !UI.els.craftModal.classList.contains('hidden') }));
    chk(!legacy.modal, '구세이브(pendingCraft 키 없음) 부팅 — 빈 팝업 안 뜸');

    console.log(errors.length ? '✗ 콘솔 에러 ' + errors.length + '건: ' + errors.slice(0, 5).join(' | ') : '✓ 콘솔 에러 0건');
    await browser.close();
    process.exit(bad || errors.length ? 1 : 0);
})();
