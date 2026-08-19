// 타격 화면 흔들림 실측 — 비평가 지적 ⓐ("Scene3D.shake 는 시트 뒤 3D 씬만 흔들어 이 연출에선
// 아무도 못 본다")를 고치면서 앞 세션이 보류한 **부작용 3종**을 먼저 재는 검증기.
//   ⑴ `#equip-sheet` 에 transform 을 걸면 **position:fixed 자손의 기준 상자가 시트로 바뀐다** —
//      시트 안에 fixed 자손이 하나라도 있으면 연출 중 그 요소가 통째로 어긋난다.
//   ⑵ 스크롤 컨테이너의 scrollTop 이 흔들림으로 밀리지 않는지(시트 안팎 모두).
//   ⑶ 연출이 끝난 뒤 모든 요소가 **정확히 원위치**로 돌아오는지(잔류 변위 0).
// 그리고 정작 목적인 ⑷ "실제로 눈에 보이는 진폭인가"를 타격 프레임에서 잰다.
// 사용: node probe-anvil-shake.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// ⚠️ 클럭·타격 시각은 **페이지에서 읽는다**(부팅 뒤 대입). 상수로 베껴 두면 클럭이 바뀔 때
//    엉뚱한 프레임을 재고 '흔들림이 0px' 이라는 유령 실패가 난다(TODO '함정 ④').
let DUR = 1500, HITPCT = [20.0, 43.333, 73.333];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push((e.stack || String(e)).split('\n').slice(0, 2).join(' | ')));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal, null, { timeout: 30000 });
    // 생성원(UI)에서 클럭·타격 시각을 되풀어 온다
    {
        const clk = await page.evaluate(() => ({ dur: UI.ANVIL_FX_MS, hits: UI.ANVIL_HITS }));
        DUR = clk.dur;
        HITPCT = clk.hits.map(t => t / clk.dur * 100);
        console.log(`(클럭 ${DUR}ms · 타격 ${clk.hits.join('/')}ms = ${HITPCT.map(p => p.toFixed(3)).join('/')}%)`);
    }
    await page.evaluate(() => { if (typeof Combat !== 'undefined') Combat.tick = () => {}; if (typeof Scene3D !== 'undefined' && Scene3D.renderer) Scene3D.renderer.render = () => {}; });
    await page.evaluate(() => { UI.openSheet && UI.openSheet('equip'); });
    await page.waitForSelector('.anvil-btn .anvil-svg', { timeout: 20000 });

    let fail = 0;
    const say = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fail++; };

    // ── ⑴ fixed 자손 조사 (연출 전에 미리 — transform 이 걸리면 값이 이미 오염된다) ──
    const fixed = await page.evaluate(() => {
        const sheet = document.getElementById('equip-sheet');
        const out = [];
        sheet.querySelectorAll('*').forEach(n => {
            if (getComputedStyle(n).position === 'fixed') out.push(n.className || n.tagName);
        });
        return out;
    });
    say(fixed.length === 0, `⑴ #equip-sheet 안의 position:fixed 자손 ${fixed.length}개${fixed.length ? ' — ' + fixed.join(', ') : ''} (있으면 transform 이 기준 상자를 뺏는다)`);

    // ── 기준 좌표 + 스크롤 상태 ──
    const SEL = ['.anvil-btn', '.equip-grid', '.forge-actions', '#equip-sheet'];
    const base = await page.evaluate((SEL) => {
        const rect = {};
        SEL.forEach(s => { const e = document.querySelector(s); if (e) { const r = e.getBoundingClientRect(); rect[s] = [r.x, r.y, r.width, r.height]; } });
        const scr = [];
        document.querySelectorAll('*').forEach(n => { if (n.scrollHeight > n.clientHeight + 2) scr.push([n.id || n.className || n.tagName, n.scrollTop]); });
        return { rect, scr };
    }, SEL);

    // ── 연출 시작 (제거 타이머는 걷고 오버레이는 남겨 프레임을 자유롭게 옮긴다) ──
    await page.evaluate(() => {
        UI._anvilBusy = false; UI.playAnvilStrike(() => {});
        (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
    });
    await page.waitForSelector('.anvil-fx .af-hammer', { timeout: 15000 });

    const at = async (pct) => page.evaluate(({ pct, DUR, SEL }) => {
        document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n =>
            n.getAnimations().forEach(a => { a.pause(); a.currentTime = DUR * pct / 100; }));
        const rect = {};
        SEL.forEach(s => { const e = document.querySelector(s); if (e) { const r = e.getBoundingClientRect(); rect[s] = [r.x, r.y, r.width, r.height]; } });
        const scr = [];
        document.querySelectorAll('*').forEach(n => { if (n.scrollHeight > n.clientHeight + 2) scr.push([n.id || n.className || n.tagName, n.scrollTop]); });
        return { rect, scr };
    }, { pct, DUR, SEL });

    // ── ⑷ 진폭: 흔들림은 **시트 전체**가 움직여야 의미가 있다(모루만 움직이면 기존 anvilbump 와 같다) ──
    const rest = await at((HITPCT[0] + HITPCT[1]) / 2);   // 1·2타 사이 정지 구간
    const amps = [];
    for (const [name, pct, min] of [['hit1', HITPCT[0], 0.8], ['hit2', HITPCT[1], 0.8], ['hit3', HITPCT[2], 1.6]]) {
        const m = await at(pct);
        const dy = Math.abs(m.rect['#equip-sheet'][1] - rest.rect['#equip-sheet'][1]);
        const dx = Math.abs(m.rect['#equip-sheet'][0] - rest.rect['#equip-sheet'][0]);
        amps.push([name, dx, dy]);
        say(Math.hypot(dx, dy) >= min, `⑷ ${name}: 시트 변위 ${Math.hypot(dx, dy).toFixed(2)}px (기준 ≥${min}px — 지각 한계)`);
    }
    say(Math.hypot(amps[2][1], amps[2][2]) > Math.hypot(amps[0][1], amps[0][2]) * 1.3,
        `⑷ 위계: 3타 변위 ${Math.hypot(amps[2][1], amps[2][2]).toFixed(2)}px > 1타 ${Math.hypot(amps[0][1], amps[0][2]).toFixed(2)}px ×1.3`);
    // 상한 — 흔들림이 커지면 '연출'이 아니라 '레이아웃 버그'로 읽힌다
    const maxAmp = Math.max(...amps.map(a => Math.hypot(a[1], a[2])));
    say(maxAmp <= 4.5, `⑷ 최대 변위 ${maxAmp.toFixed(2)}px ≤ 4.5px (넘으면 흔들림이 아니라 레이아웃 붕괴로 읽힌다)`);

    // ── ⑵ 스크롤 밀림 ──
    const hit3 = await at(HITPCT[2]);
    // ⚠️ 목록 전체를 비교하면 안 된다 — 연출 중에는 오버레이가 붙은 `.anvil-btn.striking` 같은
    //    컨테이너가 목록에 새로 나타나 **밀리지도 않았는데 FAIL** 이 난다. 값으로만 비교한다.
    const beforeTop = Object.fromEntries(base.scr), afterTop = Object.fromEntries(hit3.scr);
    const moved = Object.keys(beforeTop).filter(k => k in afterTop && beforeTop[k] !== afterTop[k]);
    say(moved.length === 0, `⑵ 스크롤 컨테이너 ${Object.keys(beforeTop).length}개 중 scrollTop 이 밀린 것 ${moved.length}개${moved.length ? ' — ' + moved.join(', ') : ''}`);

    // ── ⑸ 크기 불변 — translate 만 써야 한다. scale 이 섞이면 글자가 흐려지고 밴드 실측이 흔들린다 ──
    const szOK = SEL.every(s => !base.rect[s] || (Math.abs(base.rect[s][2] - hit3.rect[s][2]) < 0.05 && Math.abs(base.rect[s][3] - hit3.rect[s][3]) < 0.05));
    say(szOK, `⑸ 흔들림 중 폭·높이 불변(translate 전용) — ${szOK ? '전부 동일' : '변형됨'}`);

    // ── ⑶ 잔류 변위: 연출을 정상 종료시키고 원위치 확인 ──
    await page.evaluate(() => { UI.cancelAnvilStrike(); });
    await page.waitForTimeout(120);
    const after = await page.evaluate((SEL) => {
        const rect = {};
        SEL.forEach(s => { const e = document.querySelector(s); if (e) { const r = e.getBoundingClientRect(); rect[s] = [r.x, r.y, r.width, r.height]; } });
        return rect;
    }, SEL);
    const resid = SEL.filter(s => base.rect[s]).map(s => Math.hypot(after[s][0] - base.rect[s][0], after[s][1] - base.rect[s][1]));
    say(Math.max(...resid) < 0.05, `⑶ 연출 종료 후 잔류 변위 ${Math.max(...resid).toFixed(3)}px < 0.05px`);

    say(errors.length === 0, `⑹ 콘솔 에러 ${errors.length}건${errors.length ? ' — ' + errors[0] : ''}`);
    console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
