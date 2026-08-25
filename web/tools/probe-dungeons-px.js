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
        // 연결 성분(4-이웃) — `probe-fl-body` 와 같은 관용구. 색 문턱으로 요소를 찾을 때
        // '합집합'이 아니라 '가장 큰 덩어리'를 쓰기 위한 것이다(아래 뒤로 버튼 주석 참조).
        const comps = (pred, x1, y1, x2, y2) => {
            const lab = new Int32Array(W * H).fill(-1);
            const list = [];
            for (let yy = y1; yy <= y2; yy++) for (let xx = x1; xx <= x2; xx++) {
                const i0 = yy * W + xx;
                if (lab[i0] !== -1 || !pred(xx, yy)) continue;
                const id = list.length, st = [i0]; lab[i0] = id;
                let n = 0, a = W, b2 = -1, t = H, bo = -1;
                while (st.length) {
                    const i = st.pop(); n++;
                    const x = i % W, y = (i - x) / W;
                    if (x < a) a = x; if (x > b2) b2 = x; if (y < t) t = y; if (y > bo) bo = y;
                    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < x1 || nx > x2 || ny < y1 || ny > y2) continue;
                        const ni = ny * W + nx;
                        if (lab[ni] === -1 && pred(nx, ny)) { lab[ni] = id; st.push(ni); }
                    }
                }
                list.push({ n, x1: a, x2: b2, y1: t, y2: bo });
            }
            return list;
        };
        // 밴드 스캔(전 높이) → 상단 80%H 앞은 카드, 뒤는 탭바로 분류
        // (⚠️ '어두운 픽셀 92%W' 식 탭바 상단 검출은 아이콘·라벨 색이 끼어 중간 행에 걸린다 — 밟았다)
        /* 🚨 **행 분류를 '비흰색 50%' → '어두운 키라인이 카드 폭만큼 뻗는가' 로 바꿨다**
           (2026-08-25 UI 스트림 실측. 되돌리기 전에 아래 수치를 전부 읽을 것 — 나는 한 번 헛짚었다).
           종전 술어는 '비흰색(= `min<238` 또는 색 편차>10) 화소가 50%W 를 넘으면 카드 행' 이었다.
           흰 여백 위에 놓인 카드에는 맞지만, **`dg_` 배너가 블록 화법을 타면서 깨졌다**(라운드2에
           `BLOCK_SKIP` 에서 `dg_` 를 뺐다): 하늘 그라디언트가 `PAL_MAX` 접기까지 지나 **완전 평평한
           순백 (255,255,255)** 덩어리가 돼, **배너 속살이 흰 여백과 같은 술어에 걸린다.**
           실측(클론) — 하늘이 흰 배너로 시작하는 카드 3(`dg_invasion`)·4(`dg_zombie`) 에서 카드 4의
           참 상단은 y485 인데 y486~516 행이 흰 화소 **52~72%** 라 문턱을 못 넘고, 47.5% 로 떨어지는
           **y519** 에서야 밴드가 열린다(**34px 지각**). 카드 3 은 같은 이유로 **17px 지각**.
           → 피치 mode 가 122 → **140px**, `+2.04%p` **거짓 FAIL**.
           🚨 **제품은 멀쩡했다** — 같은 판에서 `.dg-banner` 4장의 DOM 상단이 13.08 / 26.83 / 40.58 /
           54.33 %H = **피치 122.6px 로 완전 균일**(원본 122px 대비 **+0.09%p**). 카드 간격은 안 변했다.
           ⚠️ **이걸 제품 결함으로 읽고 카드 여백을 좁히면 진짜 비율을 그때 깨뜨린다.**
           ❌ **막다른 길 하나(다시 파지 말 것)**: *"배경색을 그 판에서 재서(좌측 여백 샘플) 그 색만
              배경으로 보면 된다"* — **안 된다.** 시트 배경은 균일한 오프화이트가 아니라 **종이 결
              텍스처**라, 좌측 여백 한 줄만 훑어도 (253,250,244)·(254,252,250)·**(255,255,255)** 가
              섞여 나온다(실측 x0~25 @y268). 즉 **배경 자체가 순백 화소를 품고 있어** 색으로는
              배너 하늘과 원리적으로 못 가른다. 톨러런스를 넓히면 배너가 걸리고 좁히면 배경이 깨진다.
           👉 되는 술어: **카드의 검은 키라인**이다. 카드 행에는 좌·우 테두리가 항상 있어 어두운
              화소가 **카드 폭(≈366px = 73%W)만큼 벌어지고**, 갭 행에는 어두운 화소가 **0개**다.
              실측(클론): 참 상단 y117·239·362·485 에서 전부 `dark=367 · span=366`, 갭 y230·233·236·
              238·352·355·360·361·475·480·483·484 에서 전부 `dark=0`. **한 점의 모호함도 없다.**
              원본 PNG 은 카드가 남색이라 카드 행 전체가 어둡다 — 같은 술어가 그대로 성립한다
              (좌우를 **같은 픽셀 코드로** 잰다는 이 자의 규약 유지).
           ⚠️ `minX/maxX`(카드 좌·우)도 이제 **어두운 화소 기준**이다: 클론은 키라인 = 카드 모서리,
              원본은 남색 카드 몸통 = 카드 모서리로, 양쪽 다 재려던 그 모서리다(수치 무변동 확인). */
        const bands = [];
        let cur = null, gap = 0;
        for (let y = Math.round(H * 0.06); y < H - 2; y++) {
            let n = 0, first = -1, last = -1;
            for (let x = 0; x < W; x++) if (dark(x, y)) { n++; if (first < 0) first = x; last = x + 1; }
            if (first >= 0 && (last - first) > W * 0.5) {
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
        /* ⚠️ 한 픽셀이라도 걸리면 bbox 가 거기까지 늘어난다 — 임계를 조이는 것만으로는 못 막는다.
           2026-08-19 실측: 제목 글자의 **서브픽셀 AA 프린지** 한 점(x157, rgb(91,149,211) — b 가 겨우
           211, g 가 겨우 149)이 통과해 버튼 폭이 15.73%W → 53.71%W(+37.98%p)로 터졌다. 배경 아트를
           바꾸면 글자가 1px 밀리는 것만으로 재발한다.
           [열기] 는 폭 60px 이 넘는 **꽉 찬 파랑 덩어리**이므로, 가로로 RUN 개 이상 연속인 구간만
           센다. 1~2px 짜리 프린지·점은 이 조건에서 전부 떨어진다. */
        const RUN = 6;
        let open1 = null;
        if (cards.length) {
            const cd = cards[0];
            for (let y = cd.top; y <= cd.bot; y++) {
                let run = 0;
                for (let x = cd.minX; x <= cd.maxX; x++) {
                    const isBlue = x < cd.maxX && blue(at(x, y));
                    if (isBlue) { run++; continue; }
                    if (run >= RUN) {
                        const x1 = x - run, x2 = x;
                        if (!open1) open1 = { x1, x2, y1: y, y2: y };
                        open1.x1 = Math.min(open1.x1, x1); open1.x2 = Math.max(open1.x2, x2);
                        open1.y1 = Math.min(open1.y1, y); open1.y2 = Math.max(open1.y2, y + 1);
                    }
                    run = 0;
                }
            }
        }
        // 뒤로 버튼: 카드 아래 ~ 탭바 사이, 왼쪽 1/4 의 빨강
        // 🚨 **합집합으로 재지 않는다 — 2026-08-20 `probe-techov-px` 가 이 꼴로 터졌다.**
        //    크로미엄이 흰 글자를 파란 면 위에 그리면 서브픽셀 렌더링이 글자 모서리에 붉은
        //    프린지(`151,71,52` 류)를 남긴다. 그 화소 몇 개가 밴드에 들어오면 합집합 상자가
        //    버튼 29px → 382px 로 늘어 `+70.31%p` 짜리 유령 불통과가 난다(실측). 원본 PNG 엔
        //    프린지가 없어 **클론에서만** 터지고, **캡처를 다시 구운 세션에서만** 보인다.
        //    → 이 화면도 같은 구조(넓은 밴드 · 색 문턱 · 합집합)라 미리 닫는다. `probe-fl-body`
        //    가 이미 쓰는 관용구(연결 성분 중 최대)로 맞춰 두어 처방이 갈라지지 않게 한다.
        const backComps = comps((x, y) => { const p = at(x, y); return p[0] > 190 && p[1] < 90 && p[2] < 90; },
            0, cards.length ? cards[cards.length - 1].bot + 3 : Math.round(H * 0.6),
            Math.round(W / 4) - 1, tabbarTop - 2).sort((a, b) => b.n - a.n);
        const back = backComps.length ? { x1: backComps[0].x1, x2: backComps[0].x2 + 1, y1: backComps[0].y1, y2: backComps[0].y2 + 1 } : null;
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
