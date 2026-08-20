// 손상된 대기품(S.pendingCraft)이 boot()를 끊는지 검증 (slug: boot-pending-craft-unguarded)
// TODO QA 20차 재현 절차·대조 실험 8종을 그대로 회귀표로 옮긴 것.
//
// 🚨 **`page.reload()` 를 쓰지 말 것** — `beforeunload → saveGame()` 이 메모리 상태로 세이브를
//    덮어써서 심어 둔 오염이 사라진다(QA 19차 메모 ⓙ 와 같은 함정). 매 케이스마다 새 컨텍스트를
//    열고 `addInitScript` 로 오염 세이브를 심는다.
//
// 판정 기준은 '콘솔이 조용한가'가 아니라 **게임이 도는가**다:
//   ⓐ 전투 생존 — 5초에 kills/wave 가 는다
//   ⓑ 자동 저장 등록 — 세이브 키를 지우고 35초 뒤 다시 써진다(이 항목의 진짜 심각도)
//   ⓒ 회귀 — 정상 대기품은 종전대로 비교 팝업이 복원된다
//
// 사용: node probe-boot-pending-craft.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const SAVE_KEY = 'forgeclone_save_v1';

const READY = () => typeof UI !== 'undefined' && typeof Combat !== 'undefined' && UI.els && UI.els.craftModal;

let bad = 0;
const chk = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });

    // 한 케이스를 부팅해 관찰한다. seed(save) 로 세이브를 손본 뒤 심는다.
    async function boot(seed, { watchMs = 5000, autosave = false } = {}) {
        const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
        const page = await ctx.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} },
            [SAVE_KEY, JSON.stringify(seed)]);
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(READY, null, { timeout: 20000 });

        const t0 = await page.evaluate(() => ({ kills: S.kills, coins: S.coins, wave: Combat.wave, phase: Combat.phase }));
        await page.waitForTimeout(watchMs);
        const t1 = await page.evaluate(() => ({ kills: S.kills, coins: S.coins, wave: Combat.wave, phase: Combat.phase }));

        // 비교 팝업 복원 여부(정상 대기품 회귀용)
        const modal = await page.evaluate(() => ({
            open: !UI.els.craftModal.classList.contains('hidden'),
            pending: S.pendingCraft && S.pendingCraft.name || null,
            mem: UI._pendingItem && UI._pendingItem.name || null,
        }));

        let saved = null;
        if (autosave) {
            // 자동 저장 등록 확인 — 키를 지우고 35초 기다린다(30초 주기 + 여유).
            await page.evaluate((k) => localStorage.removeItem(k), SAVE_KEY);
            await page.waitForTimeout(35000);
            saved = await page.evaluate((k) => !!localStorage.getItem(k), SAVE_KEY);
        }

        const alive = (t1.kills > t0.kills) || (t1.wave > t0.wave) || (t1.coins > t0.coins);
        // beforeunload 저장이 세이브를 건드리지 않도록 컨텍스트째 닫는다
        await ctx.close();
        return { t0, t1, alive, modal, saved, errors };
    }

    // ── 기준 세이브 만들기: 한 번 정상 부팅해 실제 제작품을 대기품으로 남긴다 ───────
    const seedCtx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const seedPage = await seedCtx.newPage();
    await seedPage.goto(INDEX, { waitUntil: 'load' });
    await seedPage.waitForFunction(READY, null, { timeout: 20000 });
    const GOOD = await seedPage.evaluate((k) => {
        S.equipment.weapon = null;
        UI.onCraft();                 // 대기품을 하나 만든다(타격 연출 전에 세이브에 남는다)
        saveGame();
        return JSON.parse(localStorage.getItem(k));
    }, SAVE_KEY);
    await seedCtx.close();
    const clone = () => JSON.parse(JSON.stringify(GOOD));
    if (!GOOD.pendingCraft || !GOOD.pendingCraft.slot) { console.log('✗ 기준 세이브에 대기품이 안 생겼다 — 프로브 전제 실패'); process.exit(1); }
    console.log(`기준 세이브 준비: pendingCraft=${GOOD.pendingCraft.name} (subs ${GOOD.pendingCraft.subs.length}개)\n`);

    // ── 대조 실험 8종 (TODO 표 그대로) ──────────────────────────────
    // 죽이는 것 2종 + 안 죽이는 것 6종. 고친 뒤에는 **8종 전부 살아야** 한다.
    const CASES = [
        ['정상 대조군',                    (s) => s],
        ['pendingCraft.subs 삭제 ⭐',      (s) => { delete s.pendingCraft.subs; return s; }],
        ['pendingCraft = {slot:"ring"} ⭐', (s) => { s.pendingCraft = { slot: 'ring' }; return s; }],
        ['pendingCraft.age 삭제',          (s) => { delete s.pendingCraft.age; return s; }],
        ['pendingCraft.main 삭제',         (s) => { delete s.pendingCraft.main; return s; }],
        ['autoMatchQueue=[{slot:"ring"}]',  (s) => { s.autoMatchQueue = [{ slot: 'ring' }]; return s; }],
        ['skills = null',                  (s) => { s.skills = null; return s; }],
        ['skills = []',                    (s) => { s.skills = []; return s; }],
        // ⑼ 표에 없던 잠복 케이스 — 대기품이 없어야 큐가 `openNextAutoMatch → showCraftModal`
        //    까지 실제로 흘러간다. TODO 표의 ⑹ 는 대기품이 살아 있어 큐를 건드리지도 못했다.
        ['대기품 없음 + 큐=[{slot:"ring"}] ⭐', (s) => { s.pendingCraft = null; s.autoMatchQueue = [{ slot: 'ring' }]; return s; }],
    ];

    console.log('── ⓐ 부팅 생존 (5초에 kills/wave/coins 가 느는가) ──');
    for (const [name, mut] of CASES) {
        const r = await boot(mut(clone()));
        chk(r.alive, `${name} — kills ${r.t0.kills}→${r.t1.kills} · wave ${r.t0.wave}→${r.t1.wave} · coins ${r.t0.coins}→${r.t1.coins}`);
        const fatal = r.errors.filter(e => /boot\(\) 실패/.test(e));
        if (fatal.length) console.log(`   ↳ boot() 중단 로그: ${fatal[0].slice(0, 120)}`);
    }

    console.log('\n── ⓑ 자동 저장 등록 (키 삭제 후 35초) ──');
    for (const [name, mut] of [CASES[0], CASES[1]]) {
        const r = await boot(mut(clone()), { watchMs: 1000, autosave: true });
        chk(r.saved === true, `${name} — 35초 뒤 세이브 ${r.saved ? 'SAVED' : 'NOT-SAVED'}`);
    }

    console.log('\n── ⓒ 회귀: 정상 대기품은 비교 팝업이 복원된다 ──');
    {
        const r = await boot(clone(), { watchMs: 1500 });
        chk(r.modal.open, `비교 팝업 복원됨 (pending=${r.modal.pending})`);
        chk(r.modal.mem === GOOD.pendingCraft.name, `메모리 대기품 보존 (${r.modal.mem})`);
    }

    console.log('\n── ⓓ 손상 대기품은 조용히 사라지지 않는다(경고를 남긴다) ──');
    {
        const r = await boot(CASES[1][1](clone()), { watchMs: 1500 });
        const warned = r.errors.some(e => /대기품/.test(e)) ;
        chk(warned, `버릴 때 콘솔에 남김: ${r.errors.filter(e => /대기품/.test(e))[0] || '(없음)'}`);
        chk(!r.modal.open, '못 알아먹을 대기품으로 비교 팝업을 띄우지 않는다');
    }

    await browser.close();
    console.log(bad ? `\n실패 ${bad}건` : '\n전부 통과');
    process.exit(bad ? 1 : 0);
})();
