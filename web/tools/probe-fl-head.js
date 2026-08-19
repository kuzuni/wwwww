// '모든 장비의 목록' 시대 헤더 막대(.fl-head) 원본-클론 대조 — slug: gearlist-age-header
//
// 재는 것: 첫 시대(원시적) 헤더 막대의 ⑴ 상자 ⑵ 시대명 잉크 폭 ⑶ 우측 확률 잉크.
// ⚠️ 시대명 뒤 ★ 은 2026-08-19(age-bar-star-ascension)부터 **장비 라인 승천 횟수**에 연동돼 원본의
//    고정 별과 갈라진다 — 별 기하(위치·크기)는 전부 참고치(*)로만 출력하고 게이트에서 뺐다.
//    기본 상태(승천 0)의 클론엔 별이 없으므로(sn<12) 이 값들은 null 이 되며 실패로 치지 않는다.
//
// 🚨 프레임을 '흰 카드 폭'으로 잡는 이유 — 원본 이미지 폭이 앱 폭과 다른 사례가 이 저장소에서 4번 나왔고
//    (TODO 인계 메모 ㉠), 이 컷도 앱이 좌우로 잘려 있어 이미지 폭으로 나누면 통째로 어긋난다.
//    카드(.fl-card)는 앞 세션이 원본 71.3% 로 이미 맞춰 둔 요소라 두 그림에 공통으로 있는 자로 쓸 수 있다.
//    세로도 같은 단위(카드 폭)로 재서 등방으로 비교한다 — 앱 높이를 몰라도 성립한다.
// ⚠️ DOM rect 로 재면 안 된다: 팝업 등장 transform 이 걸린 프레임에서는 상자가 **0.73배로 축소돼** 나온다
//    (이 항목 작업 중 실측: PNG 28px 인 막대가 DOM 20.3px 로 잡혔다). 반드시 캡처 PNG 를 잰다.
// ⚠️ 주황 별을 색으로 잡으면 아래 아이템 셀의 ⭐ 배지가 같이 걸린다 — 헤더 막대 행 범위로 먼저 자른다.
//
// 🔧 2026-08-19 수리(slug: probe-fl-head-broken) — `FAIL 헤더 막대를 못 찾았다` 로 죽던 것을 고쳤다.
//    **화면이 아니라 판정기가 낡았다**는 등재 메모의 추정이 맞았다. AAA 스킨이 들어오며 클론 쪽 그림이
//    셋 다 바뀌었는데 판정기는 '순백 카드 + 평평한 회색 막대' 시절 임계를 그대로 쓰고 있었다:
//    ⓐ **카드 바탕이 순백이 아니다** — 따뜻한 미색(246,245,243)에 대각 줄무늬(240,239,236)가 깔려서
//       옛 판정(`모든 채널 > 246`)에 걸리는 행이 카드 맨 윗 2줄뿐이었다. 그래서 `cardBot` 이 146 에서
//       멈췄고(원본은 257) 막대가 있는 y=215 는 **카드 범위 밖**이라 아예 검색되지 않았다. ← 죽은 직접 원인.
//    ⓑ **그 미색 바탕이 옛 회색 판정(190~244)에 그대로 걸린다** — ⓐ 만 고치면 이번엔 제목 밑 구분선
//       (y=189, 카드 폭 전체)을 막대로 오인한다. 그래서 '카드 바탕보다 어두운 띠 + 최소 두께' 로 바꿨다.
//    ⓒ **막대가 평평하지 않고 금속 그라디언트다** — 위 214 → 아래 59 로 떨어진다. 옛 방식(중앙 열에서
//       회색이 이어지는 만큼)은 높이를 17px 로 짧게 읽고, 옛 잉크 임계(<90)는 막대 **바닥 띠를 통째로**
//       확률 잉크로 집어삼킨다. 그래서 높이는 띠 범위로 재고, 잉크 스캔은 '바탕이 아직 밝은 행' 으로 자른다.
//    ⚠️ 이 수리로 **막대 폭 기준이 바뀌었다**: 옛 코드는 띠의 **첫 행** 폭을 썼는데 그 행은 라운드 모서리
//       안쪽이라 좁다(원본 305px = 90.5%). 카드 폭에 이미 적용돼 있던 같은 논거대로 **띠에서 가장 넓은 행**
//       으로 바꿨다(원본 311px = 92.28%). 원본·클론에 같이 적용되므로 Δ 비교는 그대로 성립하지만,
//       **2026-08-19 이전 기록의 '막대 폭 90.5%' 와는 직접 비교하지 말 것**(같은 막대의 다른 자다).
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

    // ── 1) 카드 상자 ──────────────────────────────────────────────────
    // ⚠️ '카드 바탕이 처음 길게 이어지는 행'을 카드 폭으로 쓰면 안 된다 — 그 행은 **라운드 모서리 안쪽**이라
    //    카드보다 좁다(이 항목 작업 중 실측: 원본 331 / 클론 319 로 각각 18·35px 좁게 읽혔다).
    //    카드가 걸린 행 전체에서 **가장 넓은 행**을 골라야 진짜 카드 폭이 나온다.
    // ⚠️ '순백'으로 잡지 말 것 — 클론 카드는 따뜻한 미색에 대각 줄무늬가 깔려 있어 옛 판정
    //    ('모든 채널 > 246')에는 맨 윗 2줄만 걸렸다(위 헤더 🔧 ⓐ). 밝고 거의 무채색이면 카드 바탕으로 본다.
    const isCardBg = (r, g, b) => r >= 238 && g >= 236 && b >= 230 && Math.max(r, g, b) - Math.min(r, g, b) <= 16;
    let cardTop = -1, cardBot = -1, cardW = 0, cardL = 0;
    for (let y = 0; y < H; y++) {
        const rr = rowRun(y, isCardBg);
        if (rr.w > W * 0.5) {
            if (cardTop < 0) cardTop = y;
            cardBot = y;
            if (rr.w > cardW) { cardW = rr.w; cardL = rr.x0; }
        } else if (cardTop >= 0 && y - cardBot > 60) break;   // 카드 아래 다른 흰 덩어리로 넘어가기 전에 끊는다
    }
    if (cardTop < 0) return { err: '카드를 못 찾았다' };

    // ── 2) 첫 시대 헤더 막대 ──────────────────────────────────────────
    // 카드 위에 얹힌 면(원시적 시대색). **고정 회색 구간으로 잡지 않는다** — 클론 카드 바탕(미색)이
    // 옛 회색 임계(190~244)에 그대로 걸리기 때문(위 헤더 🔧 ⓑ). 대신 '카드 바탕보다 확실히 어두운,
    // 카드 폭 80% 이상을 덮는, 일정 두께 이상의 가로 띠' 로 정의한다 — 제목 밑 1px 구분선은 두께에서 걸러진다.
    const lum = (r, g, b) => (r * 299 + g * 587 + b * 114) / 1000;
    const rowMed = y => {
        const a = [];
        for (let x = cardL + 8; x < cardL + cardW - 8; x++) { const [r, g, b] = at(x, y); a.push(lum(r, g, b)); }
        a.sort((p, q) => p - q);
        return a[a.length >> 1];
    };
    // 카드 바탕 밝기 기준선 = 행 중앙값들의 상위 사분위(막대·구분선 행에 끌려 내려가지 않게)
    const meds = []; for (let y = cardTop; y <= cardBot; y++) meds.push(rowMed(y));
    meds.sort((p, q) => p - q);
    const bgLum = meds[Math.min(meds.length - 1, Math.floor(meds.length * 0.75))];
    // 막대 채움 = 바탕보다 10 이상 어둡고(=면), 글자만큼 어둡지는 않고(≥30), 거의 무채색.
    const isBarFill = (r, g, b) => { const l = lum(r, g, b); return l >= 30 && l <= bgLum - 10 && Math.max(r, g, b) - Math.min(r, g, b) <= 20; };
    const MINH = Math.max(6, Math.round(cardW * 0.02));   // 원본·클론 막대는 29~30px, 제목 밑 구분선은 1px
    let bar = null, bot = -1;
    for (let y = cardTop; y <= cardBot; y++) {
        const rr = rowRun(y, isBarFill);
        if (rr.w <= cardW * 0.8) continue;
        // 띠 아래로 확장. 글자가 있는 행은 채움이 끊기므로 계속 조건은 40% 로 느슨하게 본다.
        let end = y, widest = rr;
        while (end + 1 <= cardBot) {
            const nr = rowRun(end + 1, isBarFill);
            if (nr.w <= cardW * 0.4) break;
            end++;
            if (nr.w > widest.w) widest = nr;
        }
        if (end - y + 1 >= MINH) { bar = { t: y, x0: widest.x0, x1: widest.x1, w: widest.w }; bot = end; break; }
        y = end;   // 너무 얇은 띠(구분선)는 버리고 그 아래부터 다시 본다
    }
    if (!bar) return { err: '헤더 막대를 못 찾았다' };
    const barH = bot - bar.t + 1;

    // 잉크 스캔 행 범위 — 막대 안에서 **바탕이 아직 밝은** 행만 쓴다. 클론 막대는 아래로 갈수록 어두워지는
    // 금속 그라디언트라(바닥 행 휘도 59) 잉크 임계(<90)에 막대 바닥이 통째로 걸린다(위 헤더 🔧 ⓒ).
    const lightRow = y => {
        let n = 0, c = 0;
        for (let x = bar.x0; x <= bar.x1; x++) { const [r, g, b] = at(x, y); if (lum(r, g, b) >= 150) n++; c++; }
        return n / c >= 0.6;
    };
    let inkT = bar.t, inkB = bot;
    while (inkB > inkT && !lightRow(inkB)) inkB--;
    while (inkT < inkB && !lightRow(inkT)) inkT++;

    // ── 3) 막대 안 주황 별 ────────────────────────────────────────────
    const isOrange = (r, g, b) => r > 195 && g > 105 && g < 210 && b < 100 && (r - b) > 110;
    let sx0 = 1e9, sx1 = -1, sy0 = 1e9, sy1 = -1, sn = 0;
    for (let y = inkT; y <= inkB; y++) for (let x = bar.x0; x <= bar.x1; x++) {
        const [r, g, b] = at(x, y);
        if (isOrange(r, g, b)) { sn++; if (x < sx0) sx0 = x; if (x > sx1) sx1 = x; if (y < sy0) sy0 = y; if (y > sy1) sy1 = y; }
    }

    // ── 4) 우측 확률 잉크 ('0%' vs '0.00%' 는 잉크 폭이 확연히 다르다) ──
    const isInk = (r, g, b) => r < 90 && g < 90 && b < 90;
    let px0 = 1e9, px1 = -1, pn = 0;
    for (let y = inkT; y <= inkB; y++) for (let x = bar.x0 + Math.round(bar.w * 0.55); x <= bar.x1; x++) {
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
    // 별이 있으면 별 왼쪽까지, 없으면(승천 0 = age-bar-star-ascension 신사양) 막대 좌측 50%까지만 훑는다.
    // (오른쪽 절반엔 확률 % 잉크가 있어 여기까지 넓히면 그 덩어리를 시대명으로 오인한다 — 확률 잉크 스캔은
    //  아래에서 bar.w*0.55 부터 시작하므로 시대명은 좌측 절반 안에 있다.)
    const nameRight = sn >= 12 ? sx0 : bar.x0 + Math.round(bar.w * 0.5);
    const inkCol = [];
    for (let x = bar.x0; x < nameRight; x++) {
        let hit = false;
        for (let y = inkT; y <= inkB; y++) { const [r, g, b] = at(x, y); if (isInk(r, g, b)) { hit = true; break; } }
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
            // 시대 막대 별은 이제 **장비 라인 승천 횟수**에 연동된다(age-bar-star-ascension, 사용자 확정
            // 2026-08-19) — 원본의 시대별 고정 별과 갈라지므로 별 기하는 전부 참고치(*)로 강등, 게이트에서 뺀다.
            // 기본 상태(승천 0)의 클론엔 별이 없어 sn<12 → null 이 되며, 참고치라 MISS 로도 실패하지 않는다.
            '별 왼쪽 x (막대좌 기준)*': sn < 12 ? null : pc(sx0 - bar.x0),
            '이름 끝 → 별 간격*': (sn < 12 || nameEnd < 0) ? null : pc(sx0 - nameEnd - 1),
            '별 폭*': sn < 12 ? null : pc(sx1 - sx0 + 1),
            '별 높이*': sn < 12 ? null : pc(sy1 - sy0 + 1),
            '별 중심 y (막대상단 기준)*': sn < 12 ? null : pc((sy0 + sy1) / 2 - bar.t),
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
        // 이름 끝에 * 가 붙은 값은 **참고치**다 — 시대 아이콘 글리프 폭(AGE_ICON, icon-gen 소관)이나
        // 승천 연동 별(age-bar-star-ascension)처럼 이 레이아웃 항목이 정하지 않는 값이라 게이트에서 뺀다.
        const info = k.endsWith('*');
        if (a == null || b == null) {
            if (!info) miss++;   // 참고치가 null(승천 0이라 별 없음 등)인 건 결함이 아니다
            console.log(`  ${info ? 'miss' : 'MISS'} ${k.padEnd(24)} 원본 ${a} / 클론 ${b}`);
            continue;
        }
        const dd = +(b - a).toFixed(2), ok = Math.abs(dd) <= TOL;
        if (!ok && !info) fail++;
        console.log(`  ${info ? (ok ? '·ok ' : '·참고') : (ok ? 'ok  ' : 'FAIL')} ${k.padEnd(26)} 원본 ${String(a).padStart(6)} → 클론 ${String(b).padStart(6)}  Δ${dd > 0 ? '+' : ''}${dd}%p`);
    }
    console.log(`\n별 화소수: 원본 ${ref.starPx} / 클론 ${clone.starPx}`);
    const verdict = fail || miss ? `FAIL — 초과 ${fail}건 / 미검출 ${miss}건` : `PASS — 전 항목 ±${TOL}%p 이내`;
    console.log(verdict);
    process.exit(fail || miss ? 1 : 0);
})();
