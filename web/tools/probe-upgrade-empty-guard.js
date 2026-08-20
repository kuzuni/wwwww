// 보유 0마리/낡은 인덱스로 연 업그레이드 팝업이 '내용 없는 검은 딤'으로 화면을 덮지 않는가
// (slug: upgrade-modal-empty-guard) — QA 2026-08-20 재현 절차 그대로.
//
// 종전 결함: `render*` 가 대상이 없다고 팝업을 닫아도 `open*` 이 **다음 줄에서 무조건**
//   `showModal` 을 불러 빈 모달이 다시 떴다. 펫 쪽은 `z-index:40` 이라 탭바(z 30)까지 덮어
//   **새로고침 말고는 빠져나갈 수 없었다.**
//
// 판정 기준은 'hidden 클래스가 있나'가 아니라 **화면이 막혔나**다:
//   ⓐ 모달이 안 보인다  ⓑ 탭바 자리의 최상단 엘리먼트가 모달이 아니다(= 눌린다)
//   ⓒ 화면 한복판의 최상단 엘리먼트가 모달이 아니다  ⓓ 조용히 넘기지 않고 콘솔에 짖는다
//
// 사용: node probe-upgrade-empty-guard.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

let bad = 0;
const chk = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const warns = [], errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Mounts !== 'undefined' && UI.els && UI.els.petUpgradeModal, null, { timeout: 20000 });
    await page.evaluate(() => { if (typeof Combat !== 'undefined') Combat.tick = () => {}; });

    // 모달이 화면을 막고 있나 — 보이는가 + 두 지점의 히트테스트
    const blocked = (modalId) => page.evaluate((id) => {
        const m = document.getElementById(id);
        const r = m.getBoundingClientRect();
        const cs = getComputedStyle(m);
        const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        const owns = (el) => { for (let e = el; e; e = e.parentElement) if (e === m) return true; return false; };
        const tabbar = document.getElementById('tabbar');
        const tb = tabbar ? tabbar.getBoundingClientRect() : null;
        const atTab = tb ? document.elementFromPoint(tb.left + tb.width / 2, tb.top + tb.height / 2) : null;
        const atMid = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        return {
            shown, empty: m.innerHTML.trim().length === 0,
            rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            z: cs.zIndex, pe: cs.pointerEvents,
            tabBlocked: !!(atTab && owns(atTab)), midBlocked: !!(atMid && owns(atMid)),
            atTab: atTab ? (atTab.id || atTab.className || atTab.tagName) : null,
        };
    }, modalId);

    // ── ① 펫: 보유 0마리에서 열기 ──────────────────────────────────
    console.log('── ① 펫 업그레이드 — 보유 0마리 ──');
    await page.evaluate(() => { S.pets = []; S.activePets = []; S.eggs = []; });
    let n0 = warns.length;
    await page.evaluate(() => UI.openPetUpgrade(0));
    let b = await blocked('pet-upgrade-modal');
    chk(!b.shown, `팝업이 안 뜬다 (shown=${b.shown} rect=[${b.rect}])`);
    chk(!b.tabBlocked, `탭바가 안 막힌다 — 그 자리 최상단 엘리먼트: ${b.atTab}`);
    chk(!b.midBlocked, '화면 한복판도 안 막힌다');
    chk(warns.length > n0 && /대상 펫이 없다/.test(warns[warns.length - 1]), `조용히 넘기지 않고 짖는다: "${(warns[warns.length - 1] || '(없음)').slice(0, 70)}"`);

    // ── ② 펫: 범위 밖 인덱스(낡은 인덱스 흉내) ────────────────────
    console.log('\n── ② 펫 — 낡은 인덱스(999) ──');
    await page.evaluate(() => {
        S.pets = [{ name: '달팽이', rarity: 'common', level: 1, xp: 0, stars: 0, subs: [] }];
        UI.openPetUpgrade(999);
    });
    b = await blocked('pet-upgrade-modal');
    chk(!b.shown && !b.tabBlocked && !b.midBlocked, `범위 밖 인덱스로도 화면이 안 막힌다 (shown=${b.shown})`);

    // ── ③ 회귀: 대상이 있으면 종전대로 열린다 ─────────────────────
    console.log('\n── ③ 회귀: 정상 대상이면 그대로 열린다 ──');
    const okOpen = await page.evaluate(() => {
        UI.openPetUpgrade(0);
        const m = document.getElementById('pet-upgrade-modal');
        return { hidden: m.classList.contains('hidden'), len: m.innerHTML.trim().length,
                 hasX: !!m.querySelector('.x-btn') };
    });
    chk(!okOpen.hidden && okOpen.len > 0, `정상 대상 → 팝업이 열리고 내용이 있다 (${okOpen.len}자)`);
    chk(okOpen.hasX, '닫기(X) 버튼이 있다 — 빈 모달의 탈출 불가와 대비되는 지점');
    const closed = await page.evaluate(() => { UI.closePetUpgrade(); return document.getElementById('pet-upgrade-modal').classList.contains('hidden'); });
    chk(closed, '닫기가 동작한다');

    // ── ④ 탈것: 같은 뿌리 ─────────────────────────────────────────
    console.log('\n── ④ 탈것 업그레이드 — 보유 0마리 / 낡은 인덱스 ──');
    await page.evaluate(() => { Mounts.ensure(); S.mounts = []; S.activeMounts = []; });
    n0 = warns.length;
    await page.evaluate(() => UI.openMountUpgrade(0));
    b = await blocked('mount-upgrade-modal');
    chk(!b.shown, `보유 0마리 — 팝업이 안 뜬다 (shown=${b.shown})`);
    chk(!b.tabBlocked && !b.midBlocked, '화면이 안 막힌다');
    chk(warns.length > n0 && /대상 탈것이 없다/.test(warns[warns.length - 1]), `짖는다: "${(warns[warns.length - 1] || '(없음)').slice(0, 70)}"`);

    await page.evaluate(() => {
        S.mounts = [{ name: '당나귀', rarity: 'common', level: 1, xp: 0, stars: 0, subs: [] }];
        UI.openMountUpgrade(999);
    });
    b = await blocked('mount-upgrade-modal');
    chk(!b.shown, `낡은 인덱스(999) — 팝업이 안 뜬다 (shown=${b.shown})`);

    const mOk = await page.evaluate(() => {
        UI.openMountUpgrade(0);
        const m = document.getElementById('mount-upgrade-modal');
        return { hidden: m.classList.contains('hidden'), len: m.innerHTML.trim().length };
    });
    chk(!mOk.hidden && mOk.len > 0, `회귀: 정상 대상이면 그대로 열린다 (${mOk.len}자)`);

    chk(errors.length === 0, `콘솔 에러 ${errors.length}건${errors.length ? ' — ' + errors[0].slice(0, 120) : ''}`);

    await browser.close();
    console.log(bad ? `\n실패 ${bad}건` : '\n전부 통과');
    process.exit(bad ? 1 : 0);
})();
