// 던전 목록(shot-042251 / dungeons) 요소 실측 — 원본 PNG 와 클론 캡처를 **같은 픽셀 코드**로
// 재서 %W/%H 로 대조한다(전 UI 비율 전수 검증, `ui-ratio-audit`). 이 화면은 요소 프로브가 없던 곳.
//
// 판정하지 않는 것(내용/아트 차이): 카드 배경 일러스트(원본 그림 vs 클론 그라디언트+이모지 —
// 스킨·아트 도메인), 던전 이름 표기(망치/해머 도둑), 열쇠 보유 수(0/2 vs 2/2 — 시드 상태).
// 재는 것은 **카드 4장의 기하**(좌우·상단·높이·피치)와 [열기] 버튼·뒤로(◀) 버튼이다.
//
// 측정 방식:
//  · 카드 = 비흰 픽셀 수 > 50%W 인 행 밴드(부제 글줄은 잉크 총량이 적어 안 걸린다).
//    y 범위는 제목 아래(6%H)부터 탭바 위까지 — 탭바 상단은 '거의 전 폭 어두움' 행으로 찾는다.
//  · [열기] = 1번 카드 안 파랑 성분 bbox(카드 좌상단 기준 상대 좌표로 판정).
//  · 뒤로 = 카드 아래~탭바 사이 왼쪽 1/4 의 빨강 bbox.
//  · 앱 폭 = 이미지 폭(탭바 어두운 밴드가 좌우 끝까지 차는지 두 그림 다 검사해 다르면 exit 2).
//
// 사용: node tools/probe-dungeons-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042251.png');
const TOL = 2;   // ±2%p

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
        const nonWhite = (x, y) => { const p = at(x, y); return !(Math.min(...p) >= 238 && (Math.max(...p) - Math.min(...p)) <= 10); };
        const dark = (x, y) => Math.max(...at(x, y)) < 90;
        // 밴드 스캔(전 높이) → 상단 80%H 앞은 카드, 뒤는 탭바로 분류
        // (⚠️ '어두운 픽셀 92%W' 식 탭바 상단 검출은 아이콘·라벨 색이 끼어 중간 행에 걸린다 — 밟았다)
        const bands = [];
        let cur = null, gap = 0;
        for (let y = Math.round(H * 0.06); y < H - 2; y++) {
            let n = 0, first = -1, last = -1;
            for (let x = 0; x < W; x++) if (nonWhite(x, y)) { n++; if (first < 0) first = x; last = x + 1; }
            if (n > W * 0.5) {
                if (!cur) cur = { top: y, bot: y, minX: first, maxX: last };
                cur.bot = y; cur.minX = Math.min(cur.minX, first); cur.maxX = Math.max(cur.maxX, last);
                gap = 0;
            } else if (cur && ++gap > 3) { bands.push(cur); cur = null; }
        }
        if (cur) bands.push(cur);
        const cards = bands.filter(b => (b.bot - b.top) > H * 0.05 && b.top < H * 0.8);
        const tabBand = bands.find(b => b.top >= H * 0.8);
        const tabbarTop = tabBand ? tabBand.top : H - 1;
        // 앱 폭 검사: 탭바 밴드가 좌우 끝까지 차는가(어두운 픽셀 기준)
        let f = -1, l = -1;
        {
            const y = Math.min(H - 2, tabbarTop + 4);
            for (let x = 0; x < W; x++) if (dark(x, y)) { if (f < 0) f = x; l = x + 1; }
        }
        const fullWidth = f <= 2 && l >= W - 2;
        // [열기] 버튼: 1번 카드 안 파랑 bbox. ⚠️ b>180 짜리 느슨한 파랑은 **남색 카드 위 흰 제목
        // 글자의 AA 픽셀**(96,118,184)까지 걸어 버튼 폭이 +48%p 로 터진다(밟았다) — b>210 로 조인다.
        const blue = p => p[2] > 210 && p[0] < 110 && p[1] < 150;
        let open1 = null;
        if (cards.length) {
            const cd = cards[0];
            for (let y = cd.top; y <= cd.bot; y++) for (let x = cd.minX; x < cd.maxX; x++) {
                if (blue(at(x, y))) {
                    if (!open1) open1 = { x1: x, x2: x, y1: y, y2: y };
                    open1.x1 = Math.min(open1.x1, x); open1.x2 = Math.max(open1.x2, x + 1);
                    open1.y1 = Math.min(open1.y1, y); open1.y2 = Math.max(open1.y2, y + 1);
                }
            }
        }
        // 뒤로 버튼: 카드 아래 ~ 탭바 사이, 왼쪽 1/4 의 빨강
        let back = null;
        const yFrom = cards.length ? cards[cards.length - 1].bot + 3 : Math.round(H * 0.6);
        for (let y = yFrom; y < tabbarTop - 1; y++) for (let x = 0; x < W / 4; x++) {
            const p = at(x, y);
            if (p[0] > 190 && p[1] < 90 && p[2] < 90) {
                if (!back) back = { x1: x, x2: x, y1: y, y2: y };
                back.x1 = Math.min(back.x1, x); back.x2 = Math.max(back.x2, x + 1);
                back.y1 = Math.min(back.y1, y); back.y2 = Math.max(back.y2, y + 1);
            }
        }
        out.push({ W, H, tabbarTop, fullWidth, cards, open1, back });
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
    await page.evaluate(() => UI.openDungeons());
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(500);
    const shot = await page.screenshot({ timeout: 180000 });

    const [ref, clone] = await page.evaluate(MEASURE,
        [dataUrl(REF_PNG), 'data:image/png;base64,' + shot.toString('base64')]);
    console.log(`\n던전 목록(shot-042251) — 원본 ${ref.W}×${ref.H}(카드 ${ref.cards.length}) vs 클론 ${clone.W}×${clone.H}(카드 ${clone.cards.length}) · 같은 픽셀 코드`);
    if (!ref.fullWidth || !clone.fullWidth) {
        console.log(`🚨 탭바가 좌우 끝까지 안 찬다(원본 ${ref.fullWidth} / 클론 ${clone.fullWidth}) — 앱 폭 ≠ 이미지 폭. %W 판정이 무효라 중단한다(exit 2).`);
        await browser.close(); process.exit(2);
    }
    if (ref.cards.length !== 4 || clone.cards.length !== 4) {
        console.log('🚨 카드 4장이 안 잡혔다 — 측정기/상태 문제. 중단(exit 2).');
        console.log('원본:', ref.cards.map(b => `y${b.top}~${b.bot}`).join(' · '));
        console.log('클론:', clone.cards.map(b => `y${b.top}~${b.bot}`).join(' · '));
        await browser.close(); process.exit(2);
    }
    const pct = (m, v, unit) => +(v / (unit === 'W' ? m.W : m.H) * 100).toFixed(2);
    const mode = arr => { const m = new Map(); let bv = null, bc = 0; for (const v of arr) { const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bc) { bc = n; bv = v; } } return bv; };
    const ROWS = [
        ['카드 좌', 'W', m => mode(m.cards.map(b => b.minX))],
        ['카드 우', 'W', m => mode(m.cards.map(b => b.maxX))],
        ['1카드 상단', 'H', m => m.cards[0].top],
        ['카드 높이', 'H', m => mode(m.cards.map(b => b.bot + 1 - b.top))],
        ['카드 피치', 'H', m => mode(m.cards.slice(1).map((b, i) => b.top - m.cards[i].top))],
        ['탭바 상단', 'H', m => m.tabbarTop],
        ['열기 우측여백(카드우 기준)', 'W', m => m.open1 ? mode(m.cards.map(b => b.maxX)) - m.open1.x2 : null],
        ['열기 폭', 'W', m => m.open1 ? m.open1.x2 - m.open1.x1 : null],
        ['열기 상단(카드상단 기준)', 'H', m => m.open1 ? m.open1.y1 - m.cards[0].top : null],
        ['열기 높이', 'H', m => m.open1 ? m.open1.y2 - m.open1.y1 : null],
        ['뒤로 좌', 'W', m => m.back ? m.back.x1 : null],
        ['뒤로 폭', 'W', m => m.back ? m.back.x2 - m.back.x1 : null],
        ['뒤로 상단', 'H', m => m.back ? m.back.y1 : null],
        ['뒤로 높이', 'H', m => m.back ? m.back.y2 - m.back.y1 : null],
    ];
    console.log('');
    console.log('요소'.padEnd(20) + '단위'.padStart(4) + '원본'.padStart(9) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0; const ng = [];
    for (const [label, unit, get] of ROWS) {
        const ra = get(ref), rb = get(clone);
        if (ra == null || rb == null) { console.log(label.padEnd(20) + '  — 측정 불가(미판정)'); continue; }
        const a = pct(ref, ra, unit), b = pct(clone, rb, unit);
        const dd = +(b - a).toFixed(2);
        if (Math.abs(dd) > Math.abs(worst)) worst = dd;
        const ok = Math.abs(dd) <= TOL;
        if (!ok) ng.push(`${label} ${dd > 0 ? '+' : ''}${dd}%p`);
        console.log(label.padEnd(20) + `%${unit}`.padStart(4) + a.toFixed(2).padStart(9) + b.toFixed(2).padStart(9) + `${dd > 0 ? '+' : ''}${dd}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%p 초과`));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(`판정: ${ng.length ? '불통과' : '통과'}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
