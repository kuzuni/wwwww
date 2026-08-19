// 자동 제련 결과 카드판(`.craft-batch`)이 **남의 화면을 덮지 않는다** 회귀 검사
// — `autoforge-batch-overlay` (2026-08-19 QA 플레이 세션 등재)
//
// 기대: 자동 제련은 뒤에서 계속 돌더라도 결과 카드판은 **모루가 보이는 기본 화면에서만** 뜬다.
//       다른 탭 패널·팝업을 가리거나 그 화면의 조작을 막으면 안 된다.
//       (선례: `autoforge-toast-suppress` — 자동 제련 토스트가 남의 화면을 침범했던 그 지시)
//
// 검증 항목 (QA 등재 메모의 실측을 그대로 판정기로 옮겼다):
//  ① 모루 화면에서는 카드판이 **여전히 뜬다** — `autoforge-cards-at-once` 지시 본체를 지킨다
//  ② 소환▸스킬 패널: 12초 샘플링 동안 카드판 노출 0 + `[소환 x1]` 히트테스트가 항상 버튼
//  ③ 퀘스트 팝업(z 20): 팝업 카드 9점 히트테스트 9/9 이 팝업 것 (카드판에 안 가림)
//  ④ 🔑 **결과물이 증발하지 않는다** — 카드를 생략해도 해머만큼 뽑힌 장비가 판매/큐로 회수된다
//  ⑤ 카드판이 떠 있는 **도중에** 탭을 옮기면 즉시 걷힌다(남은 1.6초 동안 새 화면을 덮지 않는다)
//  ⑥ 콘솔/페이지 에러 0
//
// 사용: node check-autoforge-batch-overlay.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const fails = [];
    const check = (name, ok, detail) => {
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
        if (!ok) fails.push(name + (detail ? ' (' + detail + ')' : ''));
    };

    // 자동 제련을 넉넉한 해머로 켠다. 필터는 미설정 = 전부 탈락 = 팝업이 안 껴서 배치만 계속 돈다.
    const arm = () => page.evaluate(() => {
        UI.cancelAnvilStrike();
        UI._autoSeq = null;
        S.autoBatch = null; S.autoMatchQueue = []; S.autoMatchHeld = false;
        UI._pendingItem = null; S.pendingCraft = null;
        UI.els.craftModal.classList.add('hidden');
        const cfg = Forge.autoForgeConfig();
        cfg.keepAges = []; cfg.filterOn = false; cfg.filterSubs = []; cfg.hammersPerBatch = 10;
        S.hammers = 5000;
        S.autoForgeOn = true;
        UI.startAutoSeq();
    });

    // 화면을 보는 채로 ms 동안 200ms 간격 샘플 — 카드판이 몇 번 보였고, 그때 지정 좌표가 누구였나
    const sample = async (ms, pt) => {
        const shots = [];
        for (let i = 0; i < Math.round(ms / 200); i++) {
            shots.push(await page.evaluate((p) => {
                const cb = document.querySelector('.craft-batch');
                let hit = null;
                if (p) { const el = document.elementFromPoint(p.x, p.y); hit = el ? (el.className || el.tagName) + '' : null; }
                return { up: !!cb, hit };
            }, pt));
            await page.waitForTimeout(200);
        }
        return shots;
    };

    // ── ① 모루 화면에서는 카드판이 여전히 뜬다 (본래 지시를 안 깨뜨렸는가) ──
    console.log('① 모루 화면 — 카드판은 그대로 떠야 한다');
    await page.evaluate(() => UI.switchTab(null));
    await arm();
    let s = await sample(6000, null);
    const upOnForge = s.filter(x => x.up).length;
    check('모루 화면에서 카드판 노출됨', upOnForge > 0, `${upOnForge}/${s.length} 샘플`);

    // ── ② 소환▸스킬 패널을 보는 중 ──
    console.log('② 소환▸스킬 패널을 보는 중 — 카드판 0 + 소환 버튼이 안 먹힌다');
    await page.evaluate(() => UI.onTabClick('summon'));
    await page.waitForTimeout(400);
    const btnPt = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('#panel-summon button')];
        const b = btns.find(x => /소환/.test(x.textContent)) || btns[0];
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: b.textContent.trim().slice(0, 12) };
    });
    check('준비 — 소환 버튼 좌표', !!btnPt, btnPt ? `${btnPt.label} @${btnPt.x},${btnPt.y}` : '못 찾음');
    s = await sample(12000, btnPt);
    const upOnSummon = s.filter(x => x.up).length;
    const blocked = s.filter(x => x.hit && /craft-batch/.test(x.hit)).length;
    check('카드판 노출 0', upOnSummon === 0, `${upOnSummon}/${s.length} 샘플에서 노출`);
    check('소환 버튼이 카드판에 안 가림', blocked === 0, `${blocked}/${s.length} 샘플에서 가림`);
    // 실제 클릭까지 — 히트테스트가 통과해도 실클릭이 막히면 의미가 없다
    let clickOk = true, clickErr = '';
    try {
        const btns = await page.$$('#panel-summon button');
        for (const b of btns) { if (/소환/.test((await b.textContent()) || '')) { await b.click({ timeout: 4000 }); break; } }
    } catch (e) { clickOk = false; clickErr = String(e).split('\n')[0].slice(0, 90); }
    check('소환 버튼 실제 클릭 성공', clickOk, clickErr);

    // ── ③ 퀘스트 팝업(z 20)을 열어 둔 채 ──
    console.log('③ 퀘스트 팝업을 보는 중 — 팝업 9점이 안 가린다');
    await page.evaluate(() => UI.onTabClick('quest'));
    await page.waitForTimeout(400);
    await arm();                                  // 팝업 위에서 다시 켠다(팝업 여는 경로가 자동을 끌 수 있어서)
    await page.evaluate(() => { UI.els.questModal.classList.remove('hidden'); });
    const grid = await page.evaluate(() => {
        const m = document.getElementById('quest-modal');
        const card = m && !m.classList.contains('hidden') ? (m.querySelector('.modal-card, .card, div') || m) : null;
        if (!card) return null;
        const r = card.getBoundingClientRect();
        const pts = [];
        for (const fy of [.25, .5, .75]) for (const fx of [.25, .5, .75]) pts.push({ x: Math.round(r.left + r.width * fx), y: Math.round(r.top + r.height * fy) });
        return pts;
    });
    check('준비 — 퀘스트 팝업 9점', !!grid && grid.length === 9, grid ? `${grid.length}점` : '팝업 못 열음');
    let worstCover = 0, qUp = 0;
    for (let i = 0; i < 50 && grid; i++) {
        const r = await page.evaluate((pts) => {
            const up = !!document.querySelector('.craft-batch');
            const cov = pts.filter(p => { const el = document.elementFromPoint(p.x, p.y); return el && /craft-batch/.test(el.className + ''); }).length;
            return { up, cov };
        }, grid);
        if (r.up) qUp++;
        worstCover = Math.max(worstCover, r.cov);
        await page.waitForTimeout(200);
    }
    check('팝업 위 카드판 노출 0', qUp === 0, `${qUp}/50 샘플`);
    check('9점 중 가려진 점 0', worstCover === 0, `최악 ${worstCover}/9`);

    // ── ④ 🔑 결과물이 증발하지 않는다 (카드를 생략해도 판매/큐로 회수된다) ──
    console.log('④ 카드 생략 구간에서도 결과물 회수');
    const drain = await page.evaluate(async () => {
        UI.onTabClick('summon');                                  // 남의 화면
        const cfg = Forge.autoForgeConfig();
        cfg.keepAges = []; cfg.filterOn = false; cfg.filterSubs = []; cfg.hammersPerBatch = 10;
        S.hammers = 40; S.coins = 0; S.autoBatch = null; S.autoMatchQueue = [];
        UI._pendingItem = null; S.pendingCraft = null;
        UI._autoSeq = null; S.autoForgeOn = true;
        UI.startAutoSeq();
        await new Promise(r => setTimeout(r, 9000));
        return { hammers: S.hammers, coins: S.coins, batch: (S.autoBatch || []).length, crafts: S.totalCrafts };
    });
    check('해머가 실제로 나갔다', drain.hammers < 40, `망치 40 → ${drain.hammers}`);
    check('뽑힌 장비가 코인으로 회수됐다', drain.coins > 0, `+${drain.coins} 코인`);
    check('배치가 남아 고이지 않았다', drain.batch === 0, `S.autoBatch=${drain.batch}`);

    // ── ⑤ 카드판이 떠 있는 도중 탭 이동 → 즉시 걷힌다 ──
    console.log('⑤ 카드판 노출 중 탭 이동 → 즉시 걷힘');
    const mid = await page.evaluate(async () => {
        // ⚠️ 앞 항목에서 실제로 [소환 x1] 을 눌렀으므로 결과 팝업이 열려 있을 수 있다 — 그대로 두면
        //    `forgeScreenVisible()` 이 (정상적으로) false 라 카드판이 안 떠서 이 검사의 준비가 실패한다.
        const openBefore = [...document.querySelectorAll('.modal:not(.hidden)')].map(m => m.id);
        UI.closeOpened();                                         // 모든 팝업 정리 + 탭 null
        S.hammers = 500;
        UI.cancelAnvilStrike(); UI._autoSeq = null; S.autoBatch = null; S.autoMatchQueue = [];
        UI._pendingItem = null; S.pendingCraft = null;
        S.autoForgeOn = true; UI.startAutoSeq();
        // 카드판이 뜰 때까지 기다린다(모루 타격 연출 뒤)
        for (let i = 0; i < 60 && !document.querySelector('.craft-batch'); i++) await new Promise(r => setTimeout(r, 100));
        const before = !!document.querySelector('.craft-batch');
        UI.onTabClick('summon');                                  // 뜬 채로 화면 이동
        const after = !!document.querySelector('.craft-batch');
        return { before, after, openBefore };
    });
    check('준비 — 카드판이 떠 있었다', mid.before === true, `before=${mid.before} · 직전 열린 팝업=${mid.openBefore.join(',') || '없음'}`);
    check('탭 이동 즉시 걷혔다', mid.after === false, `after=${mid.after}`);

    // ── ⑥ 에러 0 ──
    console.log('⑥ 콘솔/페이지 에러');
    check('에러 0건', errors.length === 0, errors.slice(0, 3).join(' | '));

    await browser.close();
    console.log(fails.length ? `\n❌ FAIL ${fails.length}건\n - ` + fails.join('\n - ') : '\n✅ ALL PASS');
    process.exit(fails.length ? 1 : 0);
})();
