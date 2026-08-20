// 진행 패스(shot-042705 / pass) 요소 실측 — 원본 PNG 와 클론 캡처를 **같은 픽셀 코드**로 재서
// 대조한다(전 UI 비율 전수 검증, `ui-ratio-audit`). 이 화면은 요소 프로브가 없던 곳이다.
//
// 🚨 자(단위)는 **무료|프리미엄 탭 줄**(파랑 스팬 좌단 → 주황 스팬 우단)이다 — %TW.
//  · 이미지 %W 를 못 쓰는 이유: 이 컷도 오른쪽에 여분 띠가 있어(리본·필 중심이 이미지 중심에서
//    4.5px 왼쪽) 앱 폭 ≠ 이미지 폭이다(인계 메모 ㉣⑵ 계열).
//  · 카드(남색) 성분을 못 쓰는 이유: 원본 카드 바탕은 (14,17,27), 클론은 aaa-skin 리스킨으로
//    (40,47,109) — **색 고정 술어가 양쪽에서 같은 것을 못 집는다**(실측). 탭 줄은 파랑/주황
//    고채도라 스킨이 달라도 같은 술어로 잡힌다.
//  · 허용치는 앱 ±2%p 환산 **±2.8%TW**(탭 줄 ≈ 앱 70.8%W).
//
// 🚨 판정하지 않는 것(내용 차이): 마일스톤 간격 — 원본 필은 `X-1`·`X-15`, 클론은 `X-5`·`X-10`
//    (패스 보상 스케줄은 gamedata 도메인). 보상 아이콘·수량도 같은 이유로 미판정.
//    보상 행의 **기하**(박스 좌/폭/높이/피치)는 간격과 무관하니 판정한다.
//
// 측정 방식(원본·클론 탐색으로 검증):
//  · 탭 줄 = 파랑 스팬(>15%W)과 주황 스팬(>15%W)이 **같은 행에 공존**하는 첫 밴드.
//  · 리본 = 탭 줄 위의 파랑 밴드(진행 패스). ₩ 배지 = 탭 줄 위의 주황 밴드.
//  · 흰 패널 = 탭 줄 아래의 큰 흰(≥238) 성분들의 **합집합 bbox** — 성분 수를 전제하면 안 된다:
//    원본은 중앙 트렁크가 패널 상단까지 닿아 좌우 2성분, 클론은 첫 필 위에 흰 띠가 이어져
//    1성분이다(둘 다 밟았다).
//  · 🚨 **중앙 트렁크(스파인)를 직접 잡으려 하지 말 것** — '중앙 부근 저백색 연속 열' 방식은
//    원본(파란 트렁크)에서만 통하고 클론은 **트렁크가 흰색이라**(리스킨 상태) 옆의 필 열이
//    잡혀 +8%TW 가짜 스파인이 나왔다(밟았다). 대신 **보상 박스의 좌우 런**에서 중앙 통로
//    (좌 박스 우단 ↔ 우 박스 좌단)를 계산한다 — 박스는 양쪽 다 확실히 어둡거나 회색이다.
//  · 보상 행 = '25%TW 초과 런이 **2개**(좌·우 박스)'인 행 — 필 행은 런이 1개(중앙)라 걸러진다.
//  · 보상 행 = 좌 패널 안 비흰 밴드 중 **런 폭 > 패널 65%** 인 것(필 조각·체크 마크가 걸러진다).
//  · X 버튼 = 패널 하단 아래 · 탭 줄 중앙 ±25%TW 창의 빨강 bbox(보석 아이콘 오염 방지 — 창을
//    안 좁히면 우측 열의 빨간 보석이 딸려 온다, 밟았다).
//
// 사용: node tools/probe-pass-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042705.png');
const TOL = 2.8;   // 앱 ±2%p 를 탭 줄 폭 단위로 환산

const MEASURE = (async (srcs) => {
    const out = [];
    for (const src of srcs) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const blue = p => p[2] > 180 && p[0] < 110 && p[1] < 130;
        const orange = p => p[0] > 200 && p[1] > 110 && p[1] < 200 && p[2] < 90;
        const rowSpan = (y, pred) => {
            let n = 0, f = -1, l = -1;
            for (let x = 0; x < W; x++) if (pred(at(x, y))) { n++; if (f < 0) f = x; l = x + 1; }
            return { n, f, l };
        };
        // 탭 줄: 파랑·주황 공존 행
        let tab = null;
        for (let y = 0; y < H; y++) {
            const b = rowSpan(y, blue), o = rowSpan(y, orange);
            if (b.n > W * 0.15 && o.n > W * 0.15) {
                if (!tab) tab = { top: y, bot: y, bL: b.f, bR: b.l, oL: o.f, oR: o.l };
                tab.bot = y;
                tab.bL = Math.min(tab.bL, b.f); tab.bR = Math.max(tab.bR, b.l);
                tab.oL = Math.min(tab.oL, o.f); tab.oR = Math.max(tab.oR, o.l);
            } else if (tab) break;
        }
        if (!tab) { out.push({ err: '탭 줄 없음' }); continue; }
        const TW = tab.oR - tab.bL;   // 자: 무료 좌단 → 프리미엄 우단
        const X0 = tab.bL;
        // 리본(탭 위 파랑 밴드) · ₩ 배지(탭 위 주황 밴드)
        // gapTol: 밴드 안 결손 행 허용 — ₩ 배지는 검정 금액 글자가 주황을 좌우 귀퉁이만 남겨
        //         가운데 13행이 끊긴다(원본 실측). 안 이으면 배지가 반쪽 높이로 잡힌다.
        const bandAbove = (pred, minW, gapTol) => {
            let best = null, cur = null, gap = 0;
            const flush = () => { if (cur && (!best || (cur.bot - cur.top) > (best.bot - best.top))) best = cur; cur = null; };
            for (let y = 0; y < tab.top - 2; y++) {
                const s = rowSpan(y, pred);
                if (s.n > minW) {
                    if (!cur) cur = { top: y, bot: y, f: s.f, l: s.l };
                    cur.bot = y; cur.f = Math.min(cur.f, s.f); cur.l = Math.max(cur.l, s.l);
                    gap = 0;
                } else if (cur && ++gap > gapTol) flush();
            }
            flush();
            return best;
        };
        const ribbon = bandAbove(blue, W * 0.3, 2);
        const badge = bandAbove(orange, W * 0.05, 20);
        // 흰 패널 2개(탭 아래)
        const white = (x, y) => { const p = at(x, y); return Math.min(...p) >= 238 && (Math.max(...p) - Math.min(...p)) <= 10; };
        const lab = new Int32Array(W * H).fill(-1);
        const comps = [];
        for (let y0 = tab.bot + 1; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
            const i0 = y0 * W + x0;
            if (lab[i0] !== -1 || !white(x0, y0)) continue;
            const id = comps.length, st = [i0]; lab[i0] = id;
            let n = 0, a = W, b2 = -1, t = H, bo = -1;
            while (st.length) {
                const i = st.pop(); n++;
                const x = i % W, y = (i - x) / W;
                if (x < a) a = x; if (x > b2) b2 = x; if (y < t) t = y; if (y > bo) bo = y;
                if (x > 0 && lab[i - 1] === -1 && white(x - 1, y)) { lab[i - 1] = id; st.push(i - 1); }
                if (x < W - 1 && lab[i + 1] === -1 && white(x + 1, y)) { lab[i + 1] = id; st.push(i + 1); }
                if (y > tab.bot && lab[i - W] === -1 && white(x, y - 1)) { lab[i - W] = id; st.push(i - W); }
                if (y < H - 1 && lab[i + W] === -1 && white(x, y + 1)) { lab[i + W] = id; st.push(i + W); }
            }
            comps.push({ id, n, x1: a, x2: b2, y1: t, y2: bo });
        }
        const big = comps.filter(p => p.n > 8000);
        if (!big.length) { out.push({ err: '흰 패널 없음' }); continue; }
        const bigIds = new Set(big.map(p => p.id));
        const U = {
            x1: Math.min(...big.map(p => p.x1)), x2: Math.max(...big.map(p => p.x2)),
            y1: Math.min(...big.map(p => p.y1)), y2: Math.max(...big.map(p => p.y2)),
        };
        const isPanelWhite = (x, y) => bigIds.has(lab[y * W + x]);
        // 보상 행: '25%TW 초과 비흰 런이 2개(좌·우 박스)'인 행을 묶는다 — 필 행은 런 1개라 빠진다
        const rows = [];
        let cur = null, gap = 0;
        for (let y = U.y1; y <= U.y2; y++) {
            const runs = [];
            let run = 0, s = -1;
            for (let x = U.x1; x <= U.x2; x++) {
                if (!isPanelWhite(x, y)) { if (!run) s = x; run++; }
                else { if (run > TW * 0.25) runs.push([s, s + run]); run = 0; }
            }
            if (run > TW * 0.25) runs.push([s, s + run]);
            if (runs.length === 2) {
                if (!cur) cur = { top: y, bot: y, lf: runs[0][0], ll: runs[0][1], rf: runs[1][0], rl: runs[1][1] };
                cur.bot = y;
                cur.lf = Math.min(cur.lf, runs[0][0]); cur.ll = Math.max(cur.ll, runs[0][1]);
                cur.rf = Math.min(cur.rf, runs[1][0]); cur.rl = Math.max(cur.rl, runs[1][1]);
                gap = 0;
            } else if (cur && ++gap > 2) { rows.push(cur); cur = null; }
        }
        if (cur) rows.push(cur);
        // X 버튼(패널 하단 아래, 탭 줄 중앙 ±25%TW)
        const cx = X0 + TW / 2;
        // 🚨 **합집합으로 재지 않는다 — 2026-08-20 `probe-techov-px` 가 이 꼴로 터졌다.**
        //    크로미엄이 흰 글자를 파란 면 위에 그리면 서브픽셀 렌더링이 글자 모서리에 붉은
        //    프린지(`151,71,52` 류)를 남긴다. 그 화소 몇 개가 밴드에 들어오면 합집합 상자가
        //    버튼 29px → 382px 로 늘어 `+70.31%p` 짜리 유령 불통과가 난다(실측). 원본 PNG 엔
        //    프린지가 없어 **클론에서만** 터지고, **캡처를 다시 구운 세션에서만** 보인다.
        //    이 화면도 같은 구조(넓은 밴드 · 색 문턱 · 합집합)라 미리 닫는다 — 게다가 이 밴드
        //    바로 위가 파란 탭 줄이라 프린지가 생기는 조건이 그대로 갖춰져 있다.
        //    (`comps` 는 위에서 흰 패널용으로 이미 쓰고 있어 이름을 `compsIn` 으로 둔다.)
        const compsIn = (pred, x1, y1, x2, y2) => {
            const seen = new Uint8Array(W * H), list = [];
            for (let yy = y1; yy <= y2; yy++) for (let xx = x1; xx <= x2; xx++) {
                const i0 = yy * W + xx;
                if (seen[i0] || !pred(xx, yy)) continue;
                const st = [i0]; seen[i0] = 1;
                let n = 0, a = W, b2 = -1, t = H, bo = -1;
                while (st.length) {
                    const i = st.pop(); n++;
                    const x = i % W, y = (i - x) / W;
                    if (x < a) a = x; if (x > b2) b2 = x; if (y < t) t = y; if (y > bo) bo = y;
                    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < x1 || nx > x2 || ny < y1 || ny > y2) continue;
                        const ni = ny * W + nx;
                        if (!seen[ni] && pred(nx, ny)) { seen[ni] = 1; st.push(ni); }
                    }
                }
                list.push({ n, x1: a, x2: b2, y1: t, y2: bo });
            }
            return list;
        };
        const xComps = compsIn((x, y) => { const p = at(x, y); return p[0] > 190 && p[1] < 90 && p[2] < 90; },
            Math.max(0, Math.round(cx - TW * 0.25)), U.y2 + 3,
            Math.min(W - 1, Math.round(cx + TW * 0.25) - 1), H - 1).sort((a, b) => b.n - a.n);
        const xbtn = xComps.length ? { x1: xComps[0].x1, x2: xComps[0].x2 + 1, y1: xComps[0].y1, y2: xComps[0].y2 + 1 } : null;
        out.push({ W, H, TW, X0, tab, ribbon, badge, U, rows, xbtn });
    }
    return out;
});

const dataUrl = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        const bw = document.getElementById('boss-warning'); if (bw) bw.classList.add('hidden');
        const df = document.getElementById('dmg-flash'); if (df) { df.classList.remove('on'); df.style.display = 'none'; }
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
        UI.clearPendingCraft(); UI.renderEquipSheet();
        UI.coinBurst = () => { };
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.waitForTimeout(150);
    // shot-screens.js 의 pass 오프너 그대로(도달 경계 4-1 · 수령 6줄 · 3-5 로 스크롤)
    await page.evaluate(() => {
        const bc = S.bestChapter, bs = S.bestStage, pc = S.passClaimed;
        S.bestChapter = 4; S.bestStage = 1;
        S.passClaimed = { '1-5': true, '1-10': true, '2-5': true, '2-10': true, '3-5': true, '3-10': true };
        UI.openPass();
        S.bestChapter = bc; S.bestStage = bs; S.passClaimed = pc;
        const track = document.querySelector('.pass-track');
        const lab = [...track.querySelectorAll('.pass-milestone-label')].find(l => l.textContent.includes('3-5'));
        if (lab) track.scrollTop = lab.offsetTop - 6;
    });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(500);
    const shot = await page.screenshot({ timeout: 180000 });

    const [ref, clone] = await page.evaluate(MEASURE,
        [dataUrl(REF_PNG), 'data:image/png;base64,' + shot.toString('base64')]);
    if (ref.err || clone.err) {
        console.log('측정 실패:', ref.err || '', clone.err || '');
        await browser.close();
        process.exit(2);
    }
    console.log(`\n진행 패스(shot-042705) — 원본 ${ref.W}×${ref.H} 탭줄 ${ref.TW}px vs 클론 ${clone.W}×${clone.H} 탭줄 ${clone.TW}px · 같은 픽셀 코드`);
    console.log(`보상 행 ${ref.rows.length} vs ${clone.rows.length} · 마일스톤 간격은 내용 차이라 미판정(머리말)\n`);
    const pctTW = (m, v) => +(v / m.TW * 100).toFixed(2);
    const mode = arr => { const m = new Map(); let bv = null, bc = 0; for (const v of arr) { const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bc) { bc = n; bv = v; } } return bv; };
    const ROWS = [
        ['무료 탭 폭', m => m.tab.bR - m.tab.bL],
        ['프리미엄 탭 폭', m => m.tab.oR - m.tab.oL],
        ['탭 사이 틈', m => m.tab.oL - m.tab.bR],
        ['탭 줄 높이', m => m.tab.bot + 1 - m.tab.top],
        ['리본 좌(탭좌 기준)', m => m.ribbon ? m.ribbon.f - m.X0 : null],
        ['리본 폭', m => m.ribbon ? m.ribbon.l - m.ribbon.f : null],
        ['리본 높이', m => m.ribbon ? m.ribbon.bot + 1 - m.ribbon.top : null],
        ['리본 하단→탭 상단', m => m.ribbon ? m.tab.top - m.ribbon.bot : null],
        ['₩배지 좌(탭좌 기준)', m => m.badge ? m.badge.f - m.X0 : null],
        ['₩배지 폭', m => m.badge ? m.badge.l - m.badge.f : null],
        ['₩배지 높이', m => m.badge ? m.badge.bot + 1 - m.badge.top : null],
        ['패널 좌(탭좌 기준)', m => m.U.x1 - m.X0],
        ['패널 우(탭좌 기준)', m => m.U.x2 + 1 - m.X0],
        ['패널 상단(탭 하단 기준)', m => m.U.y1 - m.tab.bot],
        ['좌 박스 좌(탭좌 기준)', m => m.rows.length ? mode(m.rows.map(r => r.lf)) - m.X0 : null],
        ['좌 박스 폭', m => m.rows.length ? mode(m.rows.map(r => r.ll - r.lf)) : null],
        ['우 박스 좌(탭좌 기준)', m => m.rows.length ? mode(m.rows.map(r => r.rf)) - m.X0 : null],
        ['우 박스 폭', m => m.rows.length ? mode(m.rows.map(r => r.rl - r.rf)) : null],
        ['중앙 통로 폭(좌박스우↔우박스좌)', m => m.rows.length ? mode(m.rows.map(r => r.rf - r.ll)) : null],
        ['보상 박스 높이', m => m.rows.length ? mode(m.rows.map(r => r.bot + 1 - r.top)) : null],
        ['보상 행 피치', m => m.rows.length >= 2 ? mode(m.rows.slice(1).map((r, i) => r.top - m.rows[i].top)) : null],
        ['X 지름', m => m.xbtn ? m.xbtn.x2 - m.xbtn.x1 : null],
        ['X 중심(탭줄 중심 기준)', m => m.xbtn ? (m.xbtn.x1 + m.xbtn.x2) / 2 - (m.X0 + m.TW / 2) : null],
        ['X 상단(패널 하단 기준)', m => m.xbtn ? m.xbtn.y1 - m.U.y2 : null],
    ];
    console.log('요소'.padEnd(20) + '원본'.padStart(9) + '클론'.padStart(9) + 'Δ%TW'.padStart(9) + '  판정  (단위: 탭줄 폭 %)');
    let worst = 0; const ng = [];
    for (const [label, get] of ROWS) {
        const ra = get(ref), rb = get(clone);
        if (ra == null || rb == null) { console.log(label.padEnd(20) + '  — 측정 불가(미판정: 없는 기준을 지어내지 않는다)'); continue; }
        const a = pctTW(ref, ra), b = pctTW(clone, rb);
        const dd = +(b - a).toFixed(2);
        if (Math.abs(dd) > Math.abs(worst)) worst = dd;
        const ok = Math.abs(dd) <= TOL;
        if (!ok) ng.push(`${label} ${dd > 0 ? '+' : ''}${dd}%TW`);
        console.log(label.padEnd(20) + a.toFixed(2).padStart(9) + b.toFixed(2).padStart(9) + `${dd > 0 ? '+' : ''}${dd}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%TW 초과`));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%TW · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(`판정: ${ng.length ? '불통과' : '통과'}`);
    console.log(`(원본 탭줄 x${ref.X0}~${ref.X0 + ref.TW} y${ref.tab.top}~${ref.tab.bot} · 클론 x${clone.X0}~${clone.X0 + clone.TW} y${clone.tab.top}~${clone.tab.bot})`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
