// 판매 코인 연출 순서 실측 — 사용: node probe-coin-total-delay.js
// 사용자 지시(2026-08-17): "코인이 폭발하자마자 가격이 뜨면 안 된다 — 터짐 → 비행 → 착지 → 착지 자리에서 금액이 떠오름".
//
// ⚠️ 계측 방식 주의: 이 저장소의 헤드리스 환경은 소프트웨어 GL로 3D를 그리느라 메인 스레드가 막혀
//    50ms 타이머가 100~900ms 뒤에 깨어난다(실측). 벽시계로 "몇 ms에 무엇이 떴나"를 재면 전부 뭉개져서
//    폭발·착지·총액이 같은 시각에 찍힌다. 그래서 **가상 시계**로 잰다 —
//    `setTimeout`을 가짜 스케줄러로 바꿔치기해 예약된 지연값 그대로 순서대로 실행하고,
//    각 노드가 '가상 시각 몇 ms에' 생겼는지 스탬프를 찍는다. 스로틀링과 무관하게 결정적이다.
//    스크린샷도 같은 가상 시각으로 맞춘다(Web Animations의 currentTime을 직접 세팅 후 pause).
//
// 판정: ① 폭발~첫 착지 구간에는 금액 텍스트(.coin-amt/.coin-total)가 하나도 없다
//       ② 착지 금액은 모루 원점이 아니라 흩어진 '착지 자리'에 뜬다
//       ③ .coin-total(총액)은 **마지막 착지 금액보다 뒤에** 뜬다(= 모든 코인이 착지한 뒤)
//       ④ 착지 금액의 합 = 총액
//       ⑤ 연속 프레임 캡처에서 폭발 프레임 텍스트 0개 / 착지 이후 프레임에 금액 있음
//       ⑥ 콘솔 에러 0건
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, '../ref/shots');
const TOTAL = 12345;
const MARKS = [40, 200, 420, 560, 700, 860, 1000, 1250];

// 페이지 안에 심는 가상 시계 — setTimeout을 가로채 예약 지연값대로 순서 실행하고 노드에 가상 시각을 스탬프한다.
function installVirtualClock() {
    const W = window;
    W.__vc = {
        // bind 필수 — window에서 떼어내 호출하면 Illegal invocation
        now: 0, seq: 1, timers: [], realST: W.setTimeout.bind(W), realCT: W.clearTimeout.bind(W), realRandom: Math.random,
    };
    const vc = W.__vc;
    W.setTimeout = function (fn, d) {
        const t = { id: vc.seq++, fn, at: vc.now + (Number(d) || 0) };
        vc.timers.push(t);
        return t.id;
    };
    W.clearTimeout = function (id) {
        const i = vc.timers.findIndex(t => t.id === id);
        if (i >= 0) vc.timers.splice(i, 1);
    };
    // 난수 고정 — 프레임이 실행마다 달라지면 비교가 안 된다 (간단한 LCG)
    let seed = 20260817;
    Math.random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

    vc.stamp = () => {
        const layer = document.getElementById('coin-burst');
        if (!layer) return;
        for (const el of layer.children) if (!el.dataset.vt) el.dataset.vt = String(vc.now);
    };
    vc.advanceTo = (T) => {
        for (let guard = 0; guard < 5000; guard++) {
            let due = null;
            for (const t of vc.timers) if (t.at <= T && (!due || t.at < due.at || (t.at === due.at && t.id < due.id))) due = t;
            if (!due) break;
            vc.timers.splice(vc.timers.indexOf(due), 1);
            vc.now = due.at;
            try { due.fn(); } catch (e) { /* 프로브가 게임 타이머를 삼켜도 판정에 영향 없음 */ }
            vc.stamp();
        }
        vc.now = T;
        vc.stamp();
    };
    vc.restore = () => {
        W.setTimeout = vc.realST; W.clearTimeout = vc.realCT; Math.random = vc.realRandom;
        for (const t of vc.timers) vc.realST(t.fn, 0); // 삼킨 게임 타이머는 즉시 흘려보낸다
        vc.timers.length = 0;
    };
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && document.querySelector('.anvil-btn'), null, { timeout: 20000 });

    // ---- ① 가상 시계 타임라인: 각 노드가 가상 시각 몇 ms에 생겼는지 ----
    const timeline = await page.evaluate(({ install, TOTAL }) => {
        eval('(' + install + ')()');
        const vc = window.__vc;
        const host = document.getElementById('app'), btn = document.querySelector('.anvil-btn');
        const hb = host.getBoundingClientRect(), bb = btn.getBoundingClientRect();
        const anvil = { x: bb.left - hb.left + bb.width / 2, y: bb.top - hb.top + bb.height * 0.4 };

        UI.coinBurst(TOTAL);
        vc.stamp();                 // 폭발 즉시(가상 0ms) 만들어진 노드들
        vc.advanceTo(4000);         // 연출이 끝날 때까지 가상 시간을 흘린다

        const layer = document.getElementById('coin-burst');
        // advanceTo 중 remove된 노드도 있으므로, 살아 있던 시점의 스탬프를 모으기 위해 재실행 대신
        // 스탬프를 별도 기록으로 남긴다 — 아래 nodes는 '아직 남아 있는' 노드뿐이라 부족하다.
        return { anvil, flyMs: UI.COIN_FLY_MS, landK: UI.COIN_LAND_K, beat: UI.COIN_TOTAL_BEAT, leftover: layer ? layer.children.length : -1 };
    }, { install: installVirtualClock.toString(), TOTAL });

    // 위 실행은 노드가 지워져 기록이 남지 않는다 → 두 번째 실행에서 '생성 순간'을 훅으로 잡는다.
    const events = await page.evaluate(({ TOTAL }) => {
        const vc = window.__vc;
        vc.now = 0; vc.timers.length = 0;
        const layer0 = document.getElementById('coin-burst');
        if (layer0) layer0.innerHTML = '';
        const rec = [];
        // U.fmt는 큰 수를 '1.2K'로 줄여 쓴다 — 합계 검산을 위해 이 실행에서만 원수를 그대로 찍게 한다
        const realFmt = U.fmt;
        U.fmt = (n) => String(n);
        const realAppend = Element.prototype.appendChild;
        Element.prototype.appendChild = function (node) {
            const r = realAppend.call(this, node);
            if (node.nodeType === 1 && this.id === 'coin-burst') {
                rec.push({
                    cls: node.className, t: vc.now,
                    left: parseFloat(node.style.left) || 0, top: parseFloat(node.style.top) || 0,
                    text: (node.textContent || '').trim(),
                });
            }
            return r;
        };
        UI.coinBurst(TOTAL);
        vc.advanceTo(4000);
        Element.prototype.appendChild = realAppend;
        U.fmt = realFmt;
        return rec;
    }, { TOTAL });

    const { anvil, flyMs, landK, beat } = timeline;
    const landAt = flyMs * landK;
    const flies = events.filter(e => e.cls === 'coin-fly');
    const amts = events.filter(e => e.cls === 'coin-amt');
    const totals = events.filter(e => e.cls === 'coin-total');

    const fail = [];
    const ok = (cond, msg) => { if (!cond) fail.push(msg); return cond; };

    ok(flies.length >= 3, `코인이 3개 미만 (${flies.length}개)`);
    ok(flies.every(e => e.t === 0), '코인이 동시에 터지지 않는다(폭발은 0ms)');
    ok(amts.length === flies.length, `착지 금액 개수(${amts.length}) ≠ 코인 개수(${flies.length})`);
    ok(totals.length === 1, `총액 표시가 1개가 아님 (${totals.length}개)`);

    // ① 폭발 직후 ~ 첫 착지 전에는 금액 텍스트가 하나도 없다
    const texts = events.filter(e => e.cls !== 'coin-fly');
    const firstText = texts.length ? Math.min(...texts.map(e => e.t)) : -1;
    ok(firstText >= landAt * 0.95,
        `폭발 직후에 금액 텍스트가 떴다 — 첫 텍스트 ${firstText}ms < 착지 ${Math.round(landAt)}ms`);

    // ② 착지 자리에 흩어져 뜬다(모루 원점 뭉침이 아님)
    const spread = amts.map(a => Math.abs(a.left - anvil.x));
    ok(Math.max(...spread) > 30, `착지 금액이 모루 자리에 뭉쳐 있다 (최대 x편차 ${Math.max(...spread).toFixed(1)}px)`);
    ok(amts.every(a => a.top > anvil.y), '착지 금액이 모루보다 위에서 떴다 (착지 지점이 아님)');

    // ③ 총액은 마지막 착지 금액보다 뒤
    const lastAmt = Math.max(...amts.map(a => a.t));
    const totalT = totals.length ? totals[0].t : -1;
    ok(totalT > lastAmt, `총액이 마지막 착지(${lastAmt}ms)보다 먼저/동시에 떴다 (총액 ${totalT}ms)`);
    ok(Math.abs(totalT - (lastAmt + beat)) < 1, `총액이 '마지막 착지 + 한 박자'(${lastAmt + beat}ms)가 아님 (${totalT}ms)`);

    // ④ 금액 합 = 총액
    const sum = amts.reduce((s, a) => s + Number(a.text.replace(/[^0-9]/g, '') || 0), 0);
    ok(sum === TOTAL, `착지 금액 합(${sum}) ≠ 총액(${TOTAL})`);

    // ---- ⑤ 연속 프레임 캡처 (가상 시각 고정) ----
    fs.mkdirSync(OUT, { recursive: true });
    const frames = [];
    for (const m of MARKS) {
        const st = await page.evaluate(({ TOTAL, m }) => {
            const vc = window.__vc;
            vc.now = 0; vc.timers.length = 0;
            const layer0 = document.getElementById('coin-burst');
            if (layer0) layer0.innerHTML = '';
            UI.coinBurst(TOTAL);
            vc.stamp();
            vc.advanceTo(m);
            // CSS 애니메이션도 같은 가상 시각으로 맞추고 정지 — 스로틀링된 실시간 진행을 무시한다
            const layer = document.getElementById('coin-burst');
            if (layer) for (const el of layer.querySelectorAll('*')) {
                const born = Number(el.closest('[data-vt]')?.dataset.vt || 0);
                for (const a of el.getAnimations()) { try { a.currentTime = Math.max(0, m - born); a.pause(); } catch (e) {} }
            }
            return {
                t: m,
                flies: document.querySelectorAll('.coin-fly').length,
                amts: document.querySelectorAll('.coin-amt').length,
                totals: document.querySelectorAll('.coin-total').length,
            };
        }, { TOTAL, m });
        frames.push(st);
        await page.screenshot({ path: path.join(OUT, `coinsell-${String(m).padStart(4, '0')}ms.png`) });
    }
    await page.evaluate(() => { window.__vc.restore(); const l = document.getElementById('coin-burst'); if (l) l.innerHTML = ''; });

    const burstFrames = frames.filter(f => f.t < landAt * 0.95);
    ok(burstFrames.length > 0 && burstFrames.every(f => f.amts === 0 && f.totals === 0),
        `폭발 프레임에 금액 텍스트가 보인다: ${JSON.stringify(burstFrames)}`);
    ok(frames.some(f => f.amts > 0), '착지 이후 프레임에 착지 금액이 없다');
    const totalFrames = frames.filter(f => f.totals > 0);
    ok(totalFrames.length > 0, '총액이 끝까지 안 떴다');
    ok(totalFrames.every(f => f.t > lastAmt), '총액이 마지막 착지 전 프레임에 이미 보인다');

    ok(errors.length === 0, `콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

    console.log('착지 시각(첫 코인, 계산):', Math.round(landAt), 'ms · 한 박자:', beat, 'ms');
    console.log('코인', flies.length, '개 · 착지 금액', amts.length, '개 · 총액', totals.length, '개 · 합계', sum);
    console.log('첫 텍스트', firstText, 'ms · 마지막 착지 금액', lastAmt, 'ms · 총액', totalT, 'ms');
    console.log('착지 시각들:', amts.map(a => a.t).join(', '));
    console.log('프레임:', frames.map(f => `${f.t}ms[코인${f.flies}/금액${f.amts}/총액${f.totals}]`).join(' '));
    if (fail.length) { console.log('\nFAIL ' + fail.length + '건:'); fail.forEach(f => console.log(' ✗ ' + f)); }
    else console.log('\nPASS — 폭발 프레임 금액 없음, 착지 자리에서 금액 솟음, 총액은 전원 착지 뒤');
    await browser.close();
    process.exit(fail.length ? 1 : 0);
})();
