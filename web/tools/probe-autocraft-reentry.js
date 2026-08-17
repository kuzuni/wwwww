// 자동 제작 순차 시퀀스 — '탈락 카드 노출' 구간의 재진입(수동 재클릭) 유실 검증
// 시퀀스는 망치질(0.72초) 뒤 _anvilBusy를 풀고 탈락 카드를 0.62초 더 띄운다. 그 구간에는
// 대기품이 아직 살아 있는데 모루가 다시 눌리므로, 재클릭이 대기품을 덮어쓰면
// 앞 장비는 해머만 먹고 판매도 안 된 채 사라진다. 그 구간이 막혀 있는지 실측한다.
// 사용: node probe-autocraft-reentry.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined' && UI.els && UI.els.craftModal, null, { timeout: 20000 });
    await page.evaluate(() => {
        if (typeof Combat !== 'undefined') Combat.tick = () => {};
        if (typeof Scene3D !== 'undefined' && Scene3D.update) Scene3D.update = () => {};
        S.hammers = 200; S.coins = 0; S.bestChapter = 9; S.bestStage = 10;
        S.autoForge = { keepAges: [], filterOn: false, filterSubs: [], hammersPerBatch: 6, continueOnTarget: true };
        Forge.passesAutoFilter = () => false;    // 전부 탈락 → 카드 노출 → 코인 판매 경로만 돈다
        Forge.isMatchingGear = () => false;
        S.autoForgeOn = false;
    });

    let bad = 0;
    const chk = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };
    const until = async (fn, ms = 4000) => {
        try { await page.waitForFunction(fn, null, { timeout: ms, polling: 30 }); return true; }
        catch { return false; }
    };

    // 시퀀스를 켜고 '탈락 카드가 떠 있는' 순간을 정확히 잡는다
    await page.evaluate(() => UI.onToggleAutoForge());
    const onCard = await until(() => !!document.querySelector('.auto-drop-card, .craft-reveal'), 5000);
    chk(onCard, '탈락 카드 노출 구간 진입');

    // 그 구간에서 모루를 다시 누른다 — 대기품이 덮어써지면 앞 장비가 유실된다
    const r = await page.evaluate(() => {
        const before = { pending: S.pendingCraft && S.pendingCraft.name, hammers: S.hammers, coins: Number(S.coins) || 0 };
        UI.onCraft();                                    // 사용자가 카드 노출 중에 모루를 한 번 더 누른 상황
        const after = { pending: S.pendingCraft && S.pendingCraft.name, hammers: S.hammers };
        return { before, after };
    });
    chk(r.before.pending === r.after.pending,
        `카드 노출 중 재클릭이 대기품을 덮어쓰지 않음 (${r.before.pending} → ${r.after.pending})`);
    chk(r.before.hammers === r.after.hammers,
        `카드 노출 중 재클릭으로 해머가 새지 않음 (${r.before.hammers} → ${r.after.hammers})`);

    // 노출이 끝나면 그 장비는 정상적으로 판매돼 코인이 들어와야 한다(조용히 사라지면 안 됨)
    const sold = await until(() => (Number(S.coins) || 0) > 0, 4000);
    chk(sold, '노출이 끝난 탈락 장비는 판매되어 코인으로 회수됨');

    await page.evaluate(() => { S.autoForgeOn = false; UI.stopAutoSeq && UI.stopAutoSeq(); });
    chk(errors.length === 0, `콘솔/페이지 에러 없음 (${errors.length}건)${errors.length ? ' — ' + errors.slice(0, 2).join(' | ') : ''}`);
    console.log(bad === 0 ? '\n모두 통과' : `\n실패 ${bad}건`);
    await browser.close();
    process.exit(bad ? 1 : 0);
})();
