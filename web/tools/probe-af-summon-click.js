// `af-overlay-summon-click` 진단 프로브 — `check-autoforge-batch-overlay` ② 의
// '소환 버튼 실제 클릭 성공'이 4초 타임아웃으로 죽는 자리를 **무엇이 덮었는지**까지 찍는다.
//
// 왜 따로 만드는가: 판정기는 실패를 `String(e).split('\n')[0].slice(0,90)` 으로 줄여 두는데,
// Playwright 가 정작 범인을 적어 주는 `<div class="…"> intercepts pointer events` 줄은
// **두 번째 줄 이후**라 통째로 버려진다. 그래서 로그만 보면 '못 눌렸다'까지만 알고
// 누가 덮었는지는 매번 다시 재현해야 했다.
//
// 사용: node probe-af-summon-click.js [자동제련_노출초]
//   기본 12초(판정기와 동일). 인자를 키우면 자동 제련이 더 오래 돌아 진행 팝업이 뜰 창이 커진다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitUiReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SOAK_MS = Math.round((parseFloat(process.argv[2]) || 12) * 1000);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // 고정 대기가 아니라 `UI.els` 가 실제로 찬 뒤에 만진다 — 이 프로브가 재는 부하 구간에서는
    // 부팅도 같이 늦어지므로 상수 대기는 정확히 여기서 먼저 배신한다(`probe-tools-wait-guard` 게이트).
    await waitUiReady(page);

    await page.evaluate(() => {
        UI.cancelAnvilStrike(); UI._autoSeq = null;
        S.autoBatch = null; S.autoMatchQueue = []; S.autoMatchHeld = false;
        UI._pendingItem = null; S.pendingCraft = null;
        UI.els.craftModal.classList.add('hidden');
        const cfg = Forge.autoForgeConfig();
        cfg.keepAges = []; cfg.filterOn = false; cfg.filterSubs = []; cfg.hammersPerBatch = 10;
        S.hammers = 5000; S.autoForgeOn = true; UI.startAutoSeq();
    });
    await page.evaluate(() => UI.onTabClick('summon'));
    await page.waitForTimeout(400);

    // 소환 화면을 보는 동안 **떠 있는 오버레이 전부**를 시간축으로 기록한다.
    const seen = new Map();   // key → 처음 본 시각(ms)
    const t0 = Date.now();
    const btnPt = await page.evaluate(() => {
        const b = [...document.querySelectorAll('#panel-summon button')].find(x => /소환/.test(x.textContent));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), label: b.textContent.trim().slice(0, 12) };
    });
    console.log(`소환 버튼: ${btnPt ? btnPt.label + ' @' + btnPt.x + ',' + btnPt.y : '못 찾음'}`);

    while (Date.now() - t0 < SOAK_MS) {
        const r = await page.evaluate((p) => {
            // 버튼 중앙을 실제로 누가 받는가
            const el = p ? document.elementFromPoint(p.x, p.y) : null;
            const hit = el ? (el.id ? '#' + el.id : '') + '.' + (el.className + '').split(' ').filter(Boolean).join('.') : null;
            // 화면을 덮을 수 있는 후보 = 보이는 .modal + #app 직속 오버레이
            const overlays = [];
            document.querySelectorAll('.modal').forEach(m => { if (!m.classList.contains('hidden')) overlays.push('modal:' + (m.id || '?')); });
            [...(document.getElementById('app')?.children || [])].forEach(c => {
                if (['game-area', 'equip-sheet', 'tabbar', 'topbar'].includes(c.id)) return;
                const cs = getComputedStyle(c);
                if (cs.display === 'none' || cs.visibility === 'hidden') return;
                overlays.push('app>' + (c.id ? '#' + c.id : '.' + (c.className + '').split(' ')[0]));
            });
            return { hit, overlays };
        }, btnPt);
        const stamp = Date.now() - t0;
        if (r.hit && !seen.has('HIT ' + r.hit)) { seen.set('HIT ' + r.hit, stamp); }
        for (const o of r.overlays) if (!seen.has(o)) seen.set(o, stamp);
        await page.waitForTimeout(200);
    }

    console.log(`\n${(SOAK_MS / 1000).toFixed(0)}초 동안 관측된 것 (처음 본 시각):`);
    for (const [k, v] of [...seen.entries()].sort((a, b) => a[1] - b[1])) console.log(`  ${String(v).padStart(6)}ms  ${k}`);

    // 메인 스레드가 얼마나 막혀 있나 — rAF 간격 최대치. 클릭 타임아웃의 진짜 원인 후보다.
    const frame = await page.evaluate(() => new Promise(res => {
        let last = performance.now(), max = 0, n = 0;
        const tick = () => {
            const t = performance.now(); max = Math.max(max, t - last); last = t; n++;
            if (t - start < 3000) requestAnimationFrame(tick); else res({ maxGap: Math.round(max), frames: n });
        };
        const start = performance.now();
        requestAnimationFrame(tick);
    }));
    console.log(`\nrAF 3초: ${frame.frames}프레임 · 최대 간격 ${frame.maxGap}ms`);

    // 실제 클릭 — 실패하면 Playwright 가 주는 **전문**을 그대로 찍는다(범인 줄이 여기 있다).
    // 타임아웃을 판정기(4초)보다 길게 잡아 **'영영 안 눌린다'와 '느려서 못 눌렸다'를 가른다.**
    let ok = true, msg = '', ms = 0;
    const started = Date.now();
    try {
        const btns = await page.$$('#panel-summon button');
        for (const x of btns) { if (/소환/.test((await x.textContent()) || '')) { await x.click({ timeout: 20000 }); break; } }
    } catch (e) { ok = false; msg = String(e); }
    ms = Date.now() - started;
    console.log(`\n클릭: ${ok ? 'OK' : 'FAIL'} (${ms}ms) — 판정기 한도 4000ms ${ms > 4000 ? '초과' : '안'}`);
    if (!ok) console.log(msg.split('\n').slice(0, 14).map(l => '    ' + l).join('\n'));

    console.log(`\n콘솔/페이지 에러 ${errors.length}건`);
    errors.slice(0, 5).forEach(e => console.log('  ' + e.slice(0, 160)));
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
