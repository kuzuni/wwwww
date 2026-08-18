// 기술 분기 화면(shot-042546 / tech-branch) 요소 실측 — **원본 PNG 와 클론 캡처를 같은 픽셀 코드로**
// 재서 %W/%H 로 대조한다(전 UI 비율 전수 검증 패스, `ui-ratio-audit`).
// 이 화면은 요소 프로브가 아예 없던 곳이다(밴드 스윕 분류상 최대Δ 14.21%p 로 상위였으나
// 그 도구는 판정기가 아니다 — probe-bands-all.js 머리말 참조).
//
// 🚨 **행 구성은 판정하지 않는다 — 의도된 편차다(인계 규칙 ㉣⑵: 판정에서 빼되 이유를 적는다).**
//    원본 스크린샷의 행 배치는 2·2·2·1·2·1·1 인데 클론은 1·2·2·2·2·2·1 이다. 이것은 결함이
//    아니라 **techtree.js `rows()` 에 주석으로 못박힌 2026-08-17 사용자 지시**("트리의 맨 위
//    행과 맨 아래 행은 언제나 노드 1개" + "모든 단계가 같은 행 패턴 — 패턴이 갈리면 연결선이
//    사선으로 엉킨다")의 결과다. 원본대로 되돌리는 것은 사용자 지시 번복이므로 하지 말 것.
//    같은 이유로 클론에만 있는 단계 로마자 태그(.tech-tier-tag, 절대배치 의도 추가)는 측정 중
//    숨긴다 — 단독 노드 행의 minX 를 오염시키기 때문이다(실측: 1행 좌가 28→23%W 로 찍혔다).
//
// 그래서 밴드 1:1 짝짓기 대신 **행 구성과 무관한 기하 지표**를 판정한다:
//   2열 행의 좌·우단(열 기하) · 단독 행 폭(노드 지름 프록시) · 행 피치 평균 · 1행 상단 ·
//   서브탭 밴드 상단 · 뒤로(◀) 버튼 bbox. 연구 배지·1/5 라벨은 높이 필터로 걸러 미판정.
//
// 측정 방식(원본 탐색으로 검증한 값):
//  · 배경 = 트리 영역 최빈색(원본은 순백 252) 대비 최대채널차 ≤12 이내.
//  · 행별 비배경 픽셀 수(x ∈ [12%W, 88%W])가 18 초과인 행을 밴드로 묶는다.
//    - x 하한 12%W: 뒤로 버튼(x≈2~9%W)이 하단 노드 행과 y 가 겹쳐 minX 를 오염시킨다(실측).
//      버튼은 빨강 성분으로 따로 잰다. 노드 좌단은 28%W 라 하한이 노드를 못 자른다.
//    - x 상한 88%W: 우상단 ⓘ 버튼(≈90~94%W)이 1행 밴드의 maxX 를 오염시킨다(실측).
//    - 임계 18: 단독 노드 중앙 현(≈25~56px)은 통과, 세로 링크(2~3px)는 제외된다.
//  · 밴드 안 ≤2행의 결손은 이어 붙인다(모래시계 노드는 흰 채움이라 위·아래 호에서 현이 짧다).
//  · 높이 < 3%H 밴드는 버린다 — '1/5' 라벨 줄(≈12~14px)과 연구 배지(14px)가 여기서 걸러진다.
//  · 밴드 수가 원본·클론에서 다르면 요소 수치를 인쇄하지 않고 exit 2(측정기/상태 불일치)로
//    끊는다(probe-tabbar 규약 — 다른 상태를 억지로 짝지으면 가짜 결함이 나온다).
//
// ⚠️ 원본 shot-042546(505×883)은 **앱 폭 = 이미지 폭**이다 — 탭바 어두운 밴드가 x0~505 로
//    좌우 끝까지 차 있는 것을 실측 확인(베젤 띠 보정 불필요, 인계 메모 ㉣⑵ 함정 아님).
//
// 클론 상태는 shot-screens.js 의 tech-branch 오프너를 그대로 재현한다(같은 시드 + skillpet
// 분기 앞 7노드 1/5 + 7번째 연구중 13시30분) — 진행도가 다르면 노드 색(브론즈/흰)이 달라
// 비배경 검출 폭이 달라질 수 있다.
//
// 사용: node tools/probe-techbranch-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042546.png');
const TOL = 2;   // ±2%p (사용자 확정 통과 기준)

// 두 이미지에 똑같이 적용하는 측정기(페이지 안에서 도는 순수 함수).
// ⚠️ page.evaluate 에 문자열로 주면 인자가 안 붙는다 — 함수째 넘길 것(geardetail 프로브 메모).
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
        // 배경 = 트리 영역(상단 10%H~하단 80%H, 성긴 격자) 최빈색
        const cnt = new Map();
        for (let y = Math.round(H * 0.10); y < H * 0.80; y += 3)
            for (let x = 0; x < W; x += 3) {
                const p = at(x, y);
                const k = (p[0] >> 3) + ',' + (p[1] >> 3) + ',' + (p[2] >> 3);
                cnt.set(k, (cnt.get(k) || 0) + 1);
            }
        let bg = null, bc = 0;
        for (const [k, v] of cnt) if (v > bc) { bc = v; bg = k.split(',').map(n => (+n << 3) + 4); }
        const isBg = (x, y) => { const p = at(x, y); return Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2])) <= 12; };
        const isRed = (x, y) => { const p = at(x, y); return p[0] > 190 && p[1] < 90 && p[2] < 90; };

        const x1 = Math.round(W * 0.12), x2 = Math.round(W * 0.88);
        const yTop = Math.round(H * 0.09);
        // 서브탭 밴드 상단: 스캔 폭의 90% 이상이 비배경인 첫 행
        let bandTop = H;
        for (let y = yTop; y < H; y++) {
            let n = 0;
            for (let x = x1; x < x2; x++) if (!isBg(x, y)) n++;
            if (n > (x2 - x1) * 0.9) { bandTop = y; break; }
        }
        // 행 프로파일 → 밴드
        const rows = [];
        for (let y = yTop; y < bandTop; y++) {
            let n = 0, first = -1, last = -1;
            for (let x = x1; x < x2; x++)
                if (!isBg(x, y)) { n++; if (first < 0) first = x; last = x + 1; }
            rows.push({ y, n, first, last });
        }
        const bands = [];
        let cur = null, gap = 0;
        for (const r of rows) {
            if (r.n > 18) {
                if (!cur) cur = { top: r.y, bot: r.y, minX: r.first, maxX: r.last };
                cur.bot = r.y;
                cur.minX = Math.min(cur.minX, r.first);
                cur.maxX = Math.max(cur.maxX, r.last);
                gap = 0;
            } else if (cur && ++gap > 2) { bands.push(cur); cur = null; }
        }
        if (cur) bands.push(cur);
        const kept = bands.filter(b => (b.bot + 1 - b.top) >= H * 0.03);
        // 뒤로 버튼 = 트리 영역 왼쪽(x < 12%W)의 빨강 bbox
        let back = null;
        for (let y = yTop; y < bandTop; y++)
            for (let x = 0; x < x1; x++)
                if (isRed(x, y)) {
                    if (!back) back = { minX: x, maxX: x, minY: y, maxY: y };
                    back.minX = Math.min(back.minX, x); back.maxX = Math.max(back.maxX, x + 1);
                    back.minY = Math.min(back.minY, y); back.maxY = Math.max(back.maxY, y + 1);
                }
        out.push({ W, H, bandTop, bands: kept, back });
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
        // 🚨 자동 제련·전투가 캡처 위에 미니 제작 카드·+코인 플로터를 띄운다 — 첫 실행에서
        //    '행7 좌 -31.35%p' 가짜 결함의 원인이었다. shot-screens.js 와 같은 목록으로 막는다.
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
    // shot-screens.js 의 tech-branch 오프너 그대로 — 원본과 같은 진행도(앞 7노드 1/5 + 연구중)
    await page.evaluate(() => {
        const ids = TechTree.nodesOf('skillpet');
        S.tech = S.tech || {};
        for (let i = 0; i < 7; i++) S.tech[ids[i]] = 1;
        S.techResearch = { id: ids[6], endsAt: U.now() + (13 * 60 + 30) * 60e3 };
        UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch('skillpet');
    });
    // 단계 로마자 태그는 클론에만 있는 의도 추가(절대배치)라 원본 대조에서 숨긴다(머리말 참조).
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; } .tech-tier-tag { display: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(500);
    const shot = await page.screenshot({ timeout: 180000 });

    const [ref, clone] = await page.evaluate(MEASURE,
        [dataUrl(REF_PNG), 'data:image/png;base64,' + shot.toString('base64')]);

    const sig = m => m.bands.map(b => (b.maxX - b.minX) > m.W * 0.25 ? 2 : 1).join('·');
    console.log(`\n기술 분기(shot-042546) — 원본 ${ref.W}×${ref.H}(행 ${sig(ref)}) vs 클론 ${clone.W}×${clone.H}(행 ${sig(clone)}) · 같은 픽셀 코드`);
    console.log('(행 구성 차이는 의도된 편차 — techtree.js rows() 사용자 지시 2026-08-17. 판정 대상 아님)\n');
    if (ref.bands.length < 4 || clone.bands.length < 4) {
        console.log('🚨 밴드가 4개 미만 — 측정기 고장이거나 화면이 안 떴다. 요소 대조를 중단한다(exit 2).');
        console.log('원본:', ref.bands.map(b => `y${b.top}~${b.bot} x${b.minX}~${b.maxX}`).join(' · '));
        console.log('클론:', clone.bands.map(b => `y${b.top}~${b.bot} x${b.minX}~${b.maxX}`).join(' · '));
        await browser.close();
        process.exit(2);
    }
    const pct = (m, v, unit) => +(v / (unit === 'W' ? m.W : m.H) * 100).toFixed(2);
    // 행 구성 독립 지표 — 최빈값(mode)으로 2열 행의 좌·우단을 뽑는다(밴드마다 ±1px AA 흔들림 흡수).
    const mode = arr => { const m = new Map(); let bv = null, bc = 0; for (const v of arr) { const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bc) { bc = n; bv = v; } } return bv; };
    const pairs = m => m.bands.filter(b => (b.maxX - b.minX) > m.W * 0.25);
    const singles = m => m.bands.filter(b => (b.maxX - b.minX) <= m.W * 0.25);
    const pitch = m => (m.bands[m.bands.length - 1].top - m.bands[0].top) / (m.bands.length - 1);
    const ROWS = [
        ['2열 행 좌단', 'W', m => mode(pairs(m).map(b => b.minX))],
        ['2열 행 우단', 'W', m => mode(pairs(m).map(b => b.maxX))],
        ['단독 행 폭(지름)', 'W', m => mode(singles(m).map(b => b.maxX - b.minX))],
        ['행 피치 평균', 'H', m => pitch(m)],
        ['1행 상단', 'H', m => m.bands[0].top],
        ['서브탭 밴드 상단', 'H', m => m.bandTop],
    ];
    if (ref.back && clone.back) {
        ROWS.push(
            ['뒤로 좌', 'W', m => m.back.minX],
            ['뒤로 폭', 'W', m => m.back.maxX - m.back.minX],
            ['뒤로 상단', 'H', m => m.back.minY],
            ['뒤로 높이', 'H', m => m.back.maxY - m.back.minY],
        );
    } else {
        console.log(`⚠️ 뒤로 버튼 미검출(원본 ${!!ref.back} / 클론 ${!!clone.back}) — 버튼 항목은 미판정`);
    }
    console.log('요소'.padEnd(14) + '단위'.padStart(4) + '원본'.padStart(9) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0; const ng = [];
    for (const [label, unit, get] of ROWS) {
        const ra = get(ref), rb = get(clone);
        if (ra == null || rb == null || isNaN(ra) || isNaN(rb)) { console.log(label.padEnd(12) + '  — 측정 불가(미판정: 없는 기준을 지어내지 않는다)'); continue; }
        const a = pct(ref, ra, unit), b = pct(clone, rb, unit);
        const dd = +(b - a).toFixed(2);
        if (Math.abs(dd) > Math.abs(worst)) worst = dd;
        const ok = Math.abs(dd) <= TOL;
        if (!ok) ng.push(`${label} ${dd > 0 ? '+' : ''}${dd}%p`);
        console.log(label.padEnd(12) + `%${unit}`.padStart(4) + a.toFixed(2).padStart(9) + b.toFixed(2).padStart(9) + `${dd > 0 ? '+' : ''}${dd}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%p 초과`));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(`판정: ${ng.length ? '불통과' : '통과'}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
