// 판매 코인 '착지 금액' 겹침 실측 — 사용: node probe-coin-overlap.js
// TODO의 QA 발견 버그: `+1.23K` 10개가 좁은 띠 안에 뭉쳐 글자가 서로 위에 겹쳐 하나도 안 읽힌다.
//
// 계측: probe-coin-total-delay.js와 같은 가상 시계(setTimeout 가로채기 + Math.random 고정)로
//       연출을 결정적으로 재생하고, 각 가상 시각에 **살아 있는 .coin-amt의 실제 렌더 사각형**을
//       getBoundingClientRect로 재서 두 개씩 교차 넓이를 센다. CSS 애니메이션은 각 노드의 출생
//       시각을 빼 currentTime을 맞춘 뒤 pause — 스로틀링과 무관하게 같은 그림이 나온다.
//
// 판정: ① 어떤 프레임에서도 착지 금액끼리 '읽기를 방해하는' 겹침이 없다
//          (교차 넓이가 작은 쪽 넓이의 OVERLAP_TOL 이상이면 겹침 1건)
//       ② 라벨이 화면(app) 안에 들어온다 — 좌우/아래로 잘려나가지 않는다
//       ③ 총액(.coin-total)도 착지 금액과 겹치지 않는다
//       ④ 콘솔 에러 0건
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, '../ref/shots');
const TOTALS = [12345, 987654321];   // 코인 개수 상한(10개)이 나오는 금액 두 종
const MARKS = [620, 700, 780, 860, 940, 1020, 1120];
// 간격을 px 상수로 박으면 좁은 폭에서 도로 겹친다 — 실기 3종 폭에서 전부 잰다
const VIEWPORTS = [{ width: 480, height: 854 }, { width: 430, height: 860 }, { width: 360, height: 640 }];
const OVERLAP_TOL = 0.06;            // 작은 쪽 넓이의 6% 이상 겹치면 글자가 서로를 먹는다

function installVirtualClock() {
    const W = window;
    W.__vc = { now: 0, seq: 1, timers: [], realST: W.setTimeout.bind(W), realCT: W.clearTimeout.bind(W), realRandom: Math.random };
    const vc = W.__vc;
    W.setTimeout = function (fn, d) { const t = { id: vc.seq++, fn, at: vc.now + (Number(d) || 0) }; vc.timers.push(t); return t.id; };
    W.clearTimeout = function (id) { const i = vc.timers.findIndex(t => t.id === id); if (i >= 0) vc.timers.splice(i, 1); };
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
            try { due.fn(); } catch (e) { /* 게임 타이머를 삼켜도 판정 무관 */ }
            vc.stamp();
        }
        vc.now = T; vc.stamp();
    };
    vc.restore = () => {
        W.setTimeout = vc.realST; W.clearTimeout = vc.realCT; Math.random = vc.realRandom;
        for (const t of vc.timers) vc.realST(t.fn, 0);
        vc.timers.length = 0;
    };
}

// 두 사각형의 교차 넓이 / 작은 쪽 넓이
function overlapRatio(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w <= 0 || h <= 0) return 0;
    const inter = w * h;
    const small = Math.min(a.width * a.height, b.width * b.height);
    return small > 0 ? inter / small : 0;
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const fail = [];
    const ok = (cond, msg) => { if (!cond) fail.push(msg); return cond; };
    const report = [];

    for (const VP of VIEWPORTS) {
    const page = await browser.newPage({ viewport: VP });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && document.querySelector('.anvil-btn'), null, { timeout: 20000 });
    await page.evaluate(({ install }) => { eval('(' + install + ')()'); }, { install: installVirtualClock.toString() });

    for (const TOTAL of TOTALS) {
        for (const m of MARKS) {
            const st = await page.evaluate(({ TOTAL, m }) => {
                const vc = window.__vc;
                vc.now = 0; vc.timers.length = 0;
                const layer0 = document.getElementById('coin-burst');
                if (layer0) layer0.innerHTML = '';
                UI.coinBurst(TOTAL);
                vc.stamp();
                vc.advanceTo(m);
                const layer = document.getElementById('coin-burst');
                if (layer) for (const el of layer.querySelectorAll('*')) {
                    const born = Number(el.closest('[data-vt]')?.dataset.vt || 0);
                    for (const a of el.getAnimations()) { try { a.currentTime = Math.max(0, m - born); a.pause(); } catch (e) {} }
                }
                const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, text: (el.textContent || '').trim() }; };
                const app = document.getElementById('app').getBoundingClientRect();
                return {
                    amts: [...document.querySelectorAll('.coin-amt')].map(box),
                    totals: [...document.querySelectorAll('.coin-total')].map(box),
                    app: { left: app.left, top: app.top, right: app.right, bottom: app.bottom },
                };
            }, { TOTAL, m });

            let worst = 0, pairs = 0;
            for (let i = 0; i < st.amts.length; i++) for (let j = i + 1; j < st.amts.length; j++) {
                const r = overlapRatio(st.amts[i], st.amts[j]);
                if (r > worst) worst = r;
                if (r >= OVERLAP_TOL) pairs++;
            }
            let tWorst = 0;
            for (const t of st.totals) for (const a of st.amts) tWorst = Math.max(tWorst, overlapRatio(t, a));

            // 화면 밖으로 잘린 라벨
            const clipped = st.amts.filter(a => a.left < st.app.left - 1 || a.right > st.app.right + 1 || a.bottom > st.app.bottom + 1).length;

            const tag = `${VP.width}px ${TOTAL} @${m}ms`;
            report.push({ vw: VP.width, TOTAL, m, n: st.amts.length, pairs, worst: +worst.toFixed(3), tWorst: +tWorst.toFixed(3), clipped });
            ok(pairs === 0, `[${tag}] 착지 금액 ${pairs}쌍이 겹친다 (최대 겹침률 ${(worst * 100).toFixed(1)}%)`);
            ok(clipped === 0, `[${tag}] 라벨 ${clipped}개가 화면 밖으로 잘렸다`);
            ok(tWorst < OVERLAP_TOL, `[${tag}] 총액이 착지 금액과 겹친다 (${(tWorst * 100).toFixed(1)}%)`);

            if (TOTAL === TOTALS[0] && VP.width === 480) {
                fs.mkdirSync(OUT, { recursive: true });
                await page.screenshot({ path: path.join(OUT, `coinsell-${String(m).padStart(4, '0')}ms.png`) });
            }
        }
    }
    await page.evaluate(() => { window.__vc.restore(); const l = document.getElementById('coin-burst'); if (l) l.innerHTML = ''; });
    await page.close();
    }

    ok(errors.length === 0, `콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);

    for (const r of report) console.log(`${String(r.vw).padStart(4)}px ${String(r.TOTAL).padStart(10)} @${String(r.m).padStart(5)}ms  라벨 ${r.n}개 · 겹침 ${r.pairs}쌍 (최대 ${(r.worst * 100).toFixed(1)}%) · 총액겹침 ${(r.tWorst * 100).toFixed(1)}% · 잘림 ${r.clipped}`);
    console.log('');
    if (fail.length) { console.log('FAIL\n - ' + fail.join('\n - ')); await browser.close(); process.exit(1); }
    console.log('PASS — 착지 금액이 서로 겹치지 않고 화면 안에 들어온다');
    await browser.close();
})();
