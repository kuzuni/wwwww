// '모든 장비의 목록' 시대 헤더 막대(.fl-head) 원본-클론 대조 — slug: gearlist-age-header
//
// 재는 것: 첫 시대(원시적) 헤더 막대의 ⑴ 상자 ⑵ 시대명 뒤 주황 별의 위치·크기 ⑶ 우측 확률 잉크.
//
// 🚨 프레임을 '흰 카드 폭'으로 잡는 이유 — 원본 이미지 폭이 앱 폭과 다른 사례가 이 저장소에서 4번 나왔고
//    (TODO 인계 메모 ㉠), 이 컷도 앱이 좌우로 잘려 있어 이미지 폭으로 나누면 통째로 어긋난다.
//    카드(.fl-card)는 앞 세션이 원본 71.3% 로 이미 맞춰 둔 요소라 두 그림에 공통으로 있는 자로 쓸 수 있다.
//    세로도 같은 단위(카드 폭)로 재서 등방으로 비교한다 — 앱 높이를 몰라도 성립한다.
// ⚠️ DOM rect 로 재면 안 된다: 팝업 등장 transform 이 걸린 프레임에서는 상자가 **0.73배로 축소돼** 나온다
//    (이 항목 작업 중 실측: PNG 28px 인 막대가 DOM 20.3px 로 잡혔다). 반드시 캡처 PNG 를 잰다.
// ⚠️ 주황 별을 색으로 잡으면 아래 아이템 셀의 ⭐ 배지가 같이 걸린다 — 헤더 막대 행 범위로 먼저 자른다.
//
// 사용: PW_PATH=<playwright> node probe-fl-head.js [원본png] [클론png]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const REF = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042905.png');
const CLONE = process.argv[3] || path.resolve(__dirname, 'ref-cmp/clone/forge-list.png');
const TOL = 2.0;   // ±2%p (TODO 통과 기준)

const scan = `(img) => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const rowRun = (y, pred) => {           // 그 행에서 조건을 만족하는 가장 긴 연속 구간
        let run = 0, s = -1, bR = 0, bS = -1;
        for (let x = 0; x < W; x++) {
            const [r, g, b] = at(x, y);
            if (pred(r, g, b)) { if (!run) s = x; run++; if (run > bR) { bR = run; bS = s; } } else run = 0;
        }
        return { w: bR, x0: bS, x1: bS + bR - 1 };
    };

    // ── 1) 흰 카드 상자 ────────────────────────────────────────────────
    // ⚠️ '흰 화소가 처음 길게 이어지는 행'을 카드 폭으로 쓰면 안 된다 — 그 행은 **라운드 모서리 안쪽**이라
    //    카드보다 좁다(이 항목 작업 중 실측: 원본 331 / 클론 319 로 각각 18·35px 좁게 읽혔다).
    //    카드가 걸린 행 전체에서 **가장 넓은 행**을 골라야 진짜 카드 폭이 나온다.
    const isWhite = (r, g, b) => r > 246 && g > 246 && b > 246;
    let cardTop = -1, cardBot = -1, cardW = 0, cardL = 0;
    for (let y = 0; y < H; y++) {
        const rr = rowRun(y, isWhite);
        if (rr.w > W * 0.5) {
            if (cardTop < 0) cardTop = y;
            cardBot = y;
            if (rr.w > cardW) { cardW = rr.w; cardL = rr.x0; }
        } else if (cardTop >= 0 && y - cardBot > 60) break;   // 카드 아래 다른 흰 덩어리로 넘어가기 전에 끊는다
    }
    if (cardTop < 0) return { err: '흰 카드를 못 찾았다' };

    // ── 2) 첫 시대 헤더 막대 ──────────────────────────────────────────
    // 흰 카드 위에 얹힌 옅은 회색 면(원시적 시대색). 카드 안쪽만 보고, 카드 폭의 80% 이상 덮는 첫 행.
    const isGrey = (r, g, b) => r >= 190 && r <= 244 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12;
    let bar = null;
    for (let y = cardTop; y <= cardBot; y++) {
        const rr = rowRun(y, isGrey);
        if (rr.w > cardW * 0.8) { bar = { t: y, x0: rr.x0, x1: rr.x1, w: rr.w }; break; }
    }
    if (!bar) return { err: '헤더 막대를 못 찾았다' };
    // 세로 범위: 막대 중앙 열에서 아래로 회색이 이어지는 만큼 (막대 아래 드롭섀도는 제외됨 — 임계 밖)
    const bcx = Math.round((bar.x0 + bar.x1) / 2);
    let bot = bar.t;
    while (bot < H - 1) { const [r, g, b] = at(bcx, bot + 1); if (!isGrey(r, g, b)) break; bot++; }
    const barH = bot - bar.t + 1;

    // ── 3) 막대 안 주황 별 ────────────────────────────────────────────
    const isOrange = (r, g, b) => r > 195 && g > 105 && g < 210 && b < 100 && (r - b) > 110;
    let sx0 = 1e9, sx1 = -1, sy0 = 1e9, sy1 = -1, sn = 0;
    for (let y = bar.t; y <= bot; y++) for (let x = bar.x0; x <= bar.x1; x++) {
        const [r, g, b] = at(x, y);
        if (isOrange(r, g, b)) { sn++; if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
    }

    // ── 4) 우측 확률 잉크 ('0%' vs '0.00%' 는 잉크 폭이 확연히 다르다) ──
    const isInk = (r, g, b) => r < 90 && g < 90 && b < 90;
    let px0 = 1e9, px1 = -1, pn = 0;
    for (let y = bar.t; y <= bot; y++) for (let x = bar.x0 + Math.round(bar.w * 0.55); x <= bar.x1; x++) {
        const [r, g, b] = at(x, y);
        if (isInk(r, g, b)) { pn++; if (x < px0) px0 = x; if (x > px1) px1 = x; }
    }

    // ── 5) 시대명 끝 ↔ 별 사이 간격 ────────────────────────────────────
    // 별의 절대 x 는 앞의 아이콘 폭(AGE_ICON, IconGen 소관)에 끌려다닌다. 이 항목이 실제로 정하는 값은
    // **이름 끝에서 별까지의 간격**(.fi-age-star 의 margin-left)이므로 그것만 따로 잰다.
    // ⚠️ '별 왼쪽에서 왼쪽으로 걸어가 처음 만나는 잉크'를 이름 끝으로 쓰면 되지만, 이름 **시작**을 같은 식으로
    //    찾으면 안 된다 — 원본의 나무 몽둥이 아이콘은 어두워서 잉크 임계에 걸리고(x93 부터), 클론의 밝은
    //    아이콘은 안 걸린다. 그러면 '아이콘 자리 폭'이 원본 0.6% / 클론 6.9% 로 갈려 유령 편차가 뜬다.
    //    그래서 잉크 열을 **덩어리로 끊어** 별 바로 왼쪽 덩어리만 시대명으로 삼는다.
    const inkCol = [];
    for (let x = bar.x0; x < (sn >= 12 ? sx0 : bar.x1); x++) {
        let hit = false;
        for (let y = bar.t; y <= bot; y++) { const [r, g, b] = at(x, y); if (isInk(r, g, b)) { hit = true; break; } }
        inkCol.push(hit ? x : -1);
    }
    const groups = [];
    for (let i = 0; i < inkCol.length; i++) {
        if (inkCol[i] < 0) continue;
        if (groups.length && inkCol[i] - groups[groups.length - 1].e <= 5) groups[groups.length - 1].e = inkCol[i];   // 글자 사이 빈 열이 최대 4px 까지 벌어진다(클론 폰트) — 3 으로 두면 '원시적'이 조각난다
        else groups.push({ s: inkCol[i], e: inkCol[i] });
    }
    // ⚠️ 별의 **검정 외곽선**도 잉크라 별 왼쪽에 2~3px 짜리 덩어리로 잡힌다(원본에서 실제로 걸렸다 —
    //    그걸 시대명으로 읽으면 '이름 폭 0.59%' 라는 헛값이 나온다). 별에 붙은 가는 덩어리는 버린다.
    while (groups.length) {
        const g = groups[groups.length - 1];
        if (g.e - g.s + 1 <= 5 && sx0 - g.e <= 5) groups.pop(); else break;
    }
    const nameG = groups.length ? groups[groups.length - 1] : null;   // 별 바로 왼쪽 덩어리 = 시대명
    const nameStart = nameG ? nameG.s : -1, nameEnd = nameG ? nameG.e : -1;

    const pc = v => +(v / cardW * 100).toFixed(2);   // 단위 = 카드 폭
    return {
        px: { cardW, cardL, barT: bar.t, barH, barW: bar.w, nameStart, nameEnd, starL: sx0 },
        m: {
            '막대 좌(카드좌 기준)': pc(bar.x0 - cardL),
            '막대 폭': pc(bar.w),
            '막대 높이': pc(barH),
            '시대명 잉크 폭': nameG ? pc(nameEnd - nameStart + 1) : null,
            '시대명 시작 x (막대좌 기준)*': nameG ? pc(nameStart - bar.x0) : null,
            '별 왼쪽 x (막대좌 기준)*': sn < 12 ? null : pc(sx0 - bar.x0),
            '이름 끝 → 별 간격': (sn < 12 || nameEnd < 0) ? null : pc(sx0 - nameEnd - 1),
            '별 폭': sn < 12 ? null : pc(sx1 - sx0 + 1),
            '별 높이': sn < 12 ? null : pc(sy1 - sy0 + 1),
            '별 중심 y (막대상단 기준)': sn < 12 ? null : pc((sy0 + sy1) / 2 - bar.t),
            '확률 잉크 폭': pn < 8 ? null : pc(px1 - px0 + 1),
            '확률 잉크 우측 여백': pn < 8 ? null : pc(bar.x1 - px1)
        },
        starPx: sn
    };
}`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.setContent('<body></body>');
    const read = async file => {
        const url = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
        return page.evaluate(async ([src, fn]) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = src; });
            return eval('(' + fn + ')')(img);
        }, [url, scan]);
    };
    const ref = await read(REF), clone = await read(CLONE);
    await browser.close();

    if (ref.err || clone.err) { console.log('FAIL', ref.err || '', clone.err || ''); process.exit(1); }
    console.log('원본 ', path.basename(REF), JSON.stringify(ref.px));
    console.log('클론 ', path.basename(CLONE), JSON.stringify(clone.px));
    console.log('\n단위 = 흰 카드 폭 대비 % (등방)');

    let fail = 0, miss = 0;
    for (const k of Object.keys(ref.m)) {
        const a = ref.m[k], b = clone.m[k];
        if (a == null || b == null) {
            miss++;
            console.log(`  MISS ${k.padEnd(24)} 원본 ${a} / 클론 ${b}`);
            continue;
        }
        const dd = +(b - a).toFixed(2), ok = Math.abs(dd) <= TOL;
        // 이름 끝에 * 가 붙은 값은 **참고치**다 — 이 항목(별·확률 표기)이 정하는 값이 아니라 앞선
        // 시대 아이콘 글리프 폭(AGE_ICON, icon-gen 항목 소관)에 끌려다니는 값이라 게이트에 넣지 않는다.
        const info = k.endsWith('*');
        if (!ok && !info) fail++;
        console.log(`  ${info ? (ok ? '·ok ' : '·참고') : (ok ? 'ok  ' : 'FAIL')} ${k.padEnd(26)} 원본 ${String(a).padStart(6)} → 클론 ${String(b).padStart(6)}  Δ${dd > 0 ? '+' : ''}${dd}%p`);
    }
    console.log(`\n별 화소수: 원본 ${ref.starPx} / 클론 ${clone.starPx}`);
    const verdict = fail || miss ? `FAIL — 초과 ${fail}건 / 미검출 ${miss}건` : `PASS — 전 항목 ±${TOL}%p 이내`;
    console.log(verdict);
    process.exit(fail || miss ? 1 : 0);
})();
