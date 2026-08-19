// 장비 상세 팝업(shot-043244 / gear-detail) 요소 실측 — **원본 PNG 와 클론 캡처를 같은 픽셀 코드로**
// 재서 %W/%H 로 대조한다(전 UI 비율 전수 검증 패스, `ui-ratio-audit`).
//
// 왜 픽셀인가 — 앞 세션이 이 화면에서 두 번 오측정하고 결함 등재 직전에 되돌린 기록이 있다:
//   ㉠ `document.querySelector('.modal-card')` 는 **문서의 첫 모달 카드**를 집는다. 이 화면엔 숨은 모달이
//      여럿이라 엉뚱한 노드(제작 비교 카드 `.cmp-card-wrap.cur`, x127 w244)가 걸려 '카드가 18.8%p 좁다'는
//      가짜 결함이 나왔다. 여기서는 DOM 을 아예 안 쓰고 **보이는 잉크**를 잰다.
//   ㉡ 원본 등재 수치를 베껴 두면 코드가 바뀐 뒤에도 옛 값으로 재게 된다 → 원본도 이 런에서 다시 스캔한다.
//   ㉢ DOM 폭과 PNG 흰 본체 폭은 테두리·AA 때문에 1.46%p 어긋난다(style.css 1169행 기록). 원본은 PNG 로만
//      잴 수 있으므로 클론도 PNG 로 재야 **같은 자**가 된다.
//
// 클론 상태는 `shot-screens.js` 의 gear-detail 오프너 경로를 그대로 재현한다(시드 → 리로드 → 탭·모달 정리
// → `UI.openGearDetail('weapon')`). 맨 시드에서 곧장 열면 원본과 다른 화면이 뜬다는 게 위 ㉠ 의 뿌리였다.
//
// ⚠️ 원본 shot-043244(497×897)은 **크롭이 앱과 같다** — 탭바(y=880)와 장비 시트(y=700)가 좌우 끝까지
//    같은 색으로 차 있어 앞 화면들(042449 는 오른쪽에 18px 여분 띠) 같은 중심 보정이 필요 없다.
//
// 사용: PW_PATH=<playwright> node tools/probe-geardetail-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-043244.png');
const TOL = 2;   // ±2%p (사용자 확정 통과 기준)

// 두 이미지에 **똑같이** 적용하는 측정기. 페이지 안에서 도는 순수 함수라 원본/클론 경로가 갈리지 않는다.
// ⚠️ `page.evaluate` 에 **문자열**을 주면 인자가 안 붙는다(문자열은 표현식으로 평가될 뿐이고, 결과가
//    함수여도 호출해 주지 않아 `undefined` 가 돌아온다 — 실제로 `is not iterable` 로 밟았다).
//    그래서 진짜 함수로 두고 함수째 넘긴다.
const MEASURE = (async (srcs) => {
    const out = [];
    for (const src of srcs) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const W = img.width, H = img.height;
        const d = ctx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        // 카드 본체는 '배경보다 압도적으로 밝은 거의 무채색' 면이다. 배경(밝은 전투 씬·장비 시트)에도
        // 밝은 픽셀은 있지만 아래의 **연결 성분** 판정이 카드만 남긴다.
        // 🚨 임계를 `>=238 · 스프레드<=8`(순백 전제)로 두면 **클론만** 틀리게 잰다 — 이 자를 그대로 두고
        //    2026-08-19 에 `.modal-card` 종이 스킨(ui-quality-up 3차 슬라이스: `#fff → #fbfbfc 46% →
        //    #efeef2 100%` 그라디언트 + `rgba(23,24,26,.014)` 종이 결 + 아래 안쪽 그늘)이 들어가자
        //    **카드 폭이 68.74 → 61.52%W 로 '−6.69%p 불통과'** 가 났다. 레이아웃은 한 줄도 안 바뀌었고,
        //    카드 가장자리 띠가 순백 임계 밑(예: 236,235,232 · 229,225,218)으로 내려가면서 성분이 끊겨
        //    **안쪽 순백 덩어리만** 카드로 잡힌 것이다. 현상은 맞고 원인 귀속이 틀린 전형(‘채점 함정’).
        // 임계 근거 — 열 프로파일 실측(클론 x390): 카드 맨 아랫줄 `229,225,218`(최소 218 · 스프레드 11),
        //    바로 아래 배경 `23,24,26`. 즉 카드와 배경 사이엔 200 이상의 간격이 있어 `>=214 · <=18` 은
        //    **카드 바닥 띠는 살리고 배경은 절대 못 넘는** 자리다(따뜻한 띠라 스프레드도 같이 풀어야 한다).
        // ✅ 이 완화가 '답을 맞춘 것'이 아니라는 독립 증거 — 임계를 238→214 로 훑는 동안 **원본 측정치는
        //    x80~419 · 68.21%W · y535~692 로 한 픽셀도 안 움직였다**(원본 카드는 순백이고 배경이 근흑이라
        //    자를 바꿔도 같은 값이 나온다). 움직인 건 클론뿐이고, 그게 이 자가 낡았다는 증거다.
        // ✅ 성분 분리도 실측: 최대 성분 44608px vs 2위 389px(클론) / 42946 vs 1546(원본) — 배경 유입 없음.
        const white = (x, y) => { const p = at(x, y); return p[0] >= 214 && p[1] >= 214 && p[2] >= 214 && (Math.max(...p) - Math.min(...p)) <= 18; };
        // 🚨 행 단위 판정(최장 연속 구간이든 흰 픽셀 총량이든)은 이 화면에서 **둘 다 틀렸다**.
        //    카드 안에는 등급색 타일과 검은 글자가 있어 흰 픽셀이 여러 토막으로 갈린다:
        //    ⑴ '최장 토막' 기준 — 글자 줄에서 최장 토막이 카드 폭의 30% 밑으로 떨어져 **카드 중간에서
        //       행 묶음이 끊기고**(원본 h157 → 49), 타일 줄에서는 최장 토막이 '타일 오른쪽~카드 오른쪽'이라
        //       **좌단이 타일 뒤로 밀렸다**(클론 카드 좌 16.3 → 31.3%W 로 +15%p 가짜 결함).
        //    ⑵ '흰 픽셀 총량 ≥ 40%W' 기준 — 좌단은 고쳤지만, 타일과 스탯 글자를 **함께** 지나는 행은
        //       흰 픽셀이 27%W 까지 떨어져 여전히 위쪽이 잘렸다(원본 카드 상단 535 → 599, 높이 157 → 93).
        //    카드 바탕은 글자·타일을 **둘러싸고** 이어져 있으므로(구멍이지 칸막이가 아니다) 행이 아니라
        //    **4-연결 성분**으로 잡는다 — 가장 큰 흰 덩어리가 카드다. 이건 토막 수와 무관하다.
        const lab = new Int32Array(W * H).fill(-1);
        let bestId = -1, bestN = 0, comp = [];
        for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
            const i0 = y0 * W + x0;
            if (lab[i0] !== -1 || !white(x0, y0)) continue;
            const id = comp.length, st = [i0];
            lab[i0] = id;
            let n = 0, minY = H, maxY = -1;
            while (st.length) {
                const i = st.pop(); n++;
                const x = i % W, y = (i - x) / W;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (x > 0 && lab[i - 1] === -1 && white(x - 1, y)) { lab[i - 1] = id; st.push(i - 1); }
                if (x < W - 1 && lab[i + 1] === -1 && white(x + 1, y)) { lab[i + 1] = id; st.push(i + 1); }
                if (y > 0 && lab[i - W] === -1 && white(x, y - 1)) { lab[i - W] = id; st.push(i - W); }
                if (y < H - 1 && lab[i + W] === -1 && white(x, y + 1)) { lab[i + W] = id; st.push(i + W); }
            }
            comp.push({ id, n, minY, maxY });
            if (n > bestN) { bestN = n; bestId = id; }
        }
        if (bestId < 0) { out.push({ err: '카드를 못 찾음' }); continue; }
        const cc = comp[bestId];
        const bs = cc.minY, bl = cc.maxY + 1 - cc.minY;
        // 성분에 속한 픽셀만 보고 행별 첫/마지막을 낸다(카드 밖의 흰 점은 다른 성분이라 자동으로 빠진다).
        const band = [];
        for (let y = bs; y <= cc.maxY; y++) {
            let first = -1, last = -1;
            for (let x = 0; x < W; x++) if (lab[y * W + x] === bestId) { if (first < 0) first = x; last = x + 1; }
            if (first >= 0) band.push([first, last]);
        }
        // 좌/우는 **최빈값**으로 — 카드 좌상단의 '장착됨' 리본이 카드보다 왼쪽으로 튀어나와 있어
        // 그 행들만 첫 흰 픽셀이 더 왼쪽이다. min/max 를 쓰면 리본이 카드 폭을 오염시킨다.
        const mode = (arr) => { const m = new Map(); let bv = null, bc = 0; for (const v of arr) { const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bc) { bc = n; bv = v; } } return bv; };
        const cl = mode(band.map(r => r[0])), cr = mode(band.map(r => r[1]));
        const card = { left: cl, right: cr, top: bs, bottom: bs + bl };
        // 등급색 타일 = 카드 안 왼쪽의 '흰색이 아닌' 가장 큰 덩어리. 원본은 시대색이 아이템마다 달라
        // 색으로 못 찾으므로 **흰색의 여집합**으로 잡는다(양쪽에 같은 자를 댄다).
        // 🚨 한 줄 스캔(첫~마지막 비백색)으로는 안 된다 — 타일 오른쪽의 **스탯 글자까지 한 덩어리로 묶여**
        //    클론 타일 폭이 25.45%W(원본 13.08)로 나오고, 그 중심 x 가 타일 밖 흰 여백에 떨어져
        //    세로 스캔이 2px 만 잡았다(높이 0.22%H). 카드와 같은 이유로 **연결 성분**으로 잡는다:
        //    안쪽 아이콘·레벨 배지가 희어도 구멍일 뿐 덩어리를 가르지 않는다.
        const cw = cr - cl;
        const inLeft = (x, y) => x > cl + 1 && x < cl + cw * 0.45 && y > card.top + 1 && y < card.bottom - 1;
        const lab2 = new Int32Array(W * H).fill(-1);
        let tBest = null, tid = 0;
        for (let y0 = card.top + 2; y0 < card.bottom - 1; y0++) for (let x0 = cl + 2; x0 < cl + cw * 0.45; x0++) {
            const i0 = y0 * W + x0;
            if (lab2[i0] !== -1 || white(x0, y0)) continue;
            const id = tid++, st = [i0];
            lab2[i0] = id;
            let n = 0, x1 = W, x2 = -1, y1 = H, y2 = -1;
            while (st.length) {
                const i = st.pop(); n++;
                const x = i % W, y = (i - x) / W;
                if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
                for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const nx = x + dx, ny = y + dy, ni = ny * W + nx;
                    if (inLeft(nx, ny) && lab2[ni] === -1 && !white(nx, ny)) { lab2[ni] = id; st.push(ni); }
                }
            }
            if (!tBest || n > tBest.n) tBest = { n, left: x1, right: x2 + 1, top: y1, bottom: y2 + 1 };
        }
        const tl = tBest ? tBest.left : -1, tr = tBest ? tBest.right : -1;
        const tt = tBest ? tBest.top : -1, tb = tBest ? tBest.bottom : -1;
        out.push({ W, H, card, tile: { left: tl, right: tr, top: tt, bottom: tb } });
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
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    // 캡처를 오염시키는 연출만 끈다 — shot-screens.js 와 같은 목록
    await page.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        const bw = document.getElementById('boss-warning'); if (bw) bw.classList.add('hidden');
        const df = document.getElementById('dmg-flash'); if (df) { df.classList.remove('on'); df.style.display = 'none'; }
    });
    await page.waitForTimeout(800);
    // shot-screens.js 의 화면 간 오염 제거 + 오프너 (이 두 줄이 이 화면의 핵심이다)
    await page.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        try { UI.switchTab && UI.switchTab(null); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.waitForTimeout(150);
    // 🚨 카드 내용을 **원본과 같은 글자로 고정**한다 — 안 하면 런마다 판정이 달라진다(실측).
    //    시드의 무기는 `Forge.rollItem()` 이 굴린 랜덤이라 이름 길이가 매번 다르고, 이름이 두 줄로
    //    감기면 카드가 한 줄(≈22px)만큼 길어진다: 같은 코드로 두 번 돌렸더니 클론 카드 상단이
    //    y530 ↔ y552 로 뛰어 '카드 높이 −2.14%p 불통과' 와 '+0.33%p 통과' 가 번갈아 나왔다.
    //    시드가 이미 서브옵션을 2줄로 못박아 둔 것과 **같은 이유·같은 처방**이다(shot-screens.js 주석 참조).
    //    원본(shot-043244)은 `[지하 세계] 파충의 펠트` · 체력 1줄 · 서브 2줄 · 별 1개짜리 카드다.
    await page.evaluate(() => {
        const w = S.equipment.weapon;
        w.age = 'underworld'; w.ageIdx = AGES.indexOf('underworld');
        w.name = '파충의 펠트'; w.level = 106; w.main = 'hp'; w.stars = 1;
        w.subs = [{ key: 'double', label: '더블 찬스', value: 7.48 }, { key: 'critDmg', label: '치명타 피해', value: 71.4 }];
    });
    await page.evaluate(() => UI.openGearDetail('weapon'));
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(500);
    const shot = await page.screenshot({ timeout: 180000 });

    const [ref, clone] = await page.evaluate(MEASURE,
        [dataUrl(REF_PNG), 'data:image/png;base64,' + shot.toString('base64')]);

    if (ref.err || clone.err) { console.log('측정 실패:', ref.err || '', clone.err || ''); await browser.close(); process.exit(2); }

    const pct = (m, v, unit) => +(v / (unit === 'W' ? m.W : m.H) * 100).toFixed(2);
    const ROWS = [
        ['카드 좌', 'W', m => m.card.left],
        ['카드 우', 'W', m => m.card.right],
        ['카드 폭', 'W', m => m.card.right - m.card.left],
        ['카드 상단', 'H', m => m.card.top],
        ['카드 하단', 'H', m => m.card.bottom],
        ['카드 높이', 'H', m => m.card.bottom - m.card.top],
        ['타일 좌', 'W', m => m.tile.left],
        ['타일 폭', 'W', m => m.tile.right - m.tile.left],
        ['타일 상단', 'H', m => m.tile.top],
        ['타일 높이', 'H', m => m.tile.bottom - m.tile.top],
    ];
    console.log(`\n장비 상세(shot-043244) — 원본 ${ref.W}×${ref.H} vs 클론 ${clone.W}×${clone.H} · 같은 픽셀 코드\n`);
    console.log('요소'.padEnd(14) + '단위'.padStart(4) + '원본'.padStart(9) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0; const ng = [];
    for (const [label, unit, get] of ROWS) {
        const a = pct(ref, get(ref), unit), b = pct(clone, get(clone), unit);
        const dd = +(b - a).toFixed(2);
        if (Math.abs(dd) > Math.abs(worst)) worst = dd;
        const ok = Math.abs(dd) <= TOL;
        if (!ok) ng.push(`${label} ${dd > 0 ? '+' : ''}${dd}%p`);
        console.log(label.padEnd(12) + `%${unit}`.padStart(4) + a.toFixed(2).padStart(9) + b.toFixed(2).padStart(9) + `${dd > 0 ? '+' : ''}${dd}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%p 초과`));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(`판정: ${ng.length ? '불통과' : '통과'}`);
    console.log(`(원본 카드 px  x${ref.card.left}~${ref.card.right} y${ref.card.top}~${ref.card.bottom} · 클론 x${clone.card.left}~${clone.card.right} y${clone.card.top}~${clone.card.bottom})`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
