// 설정 화면 요소 실측 — '전 UI 비율 전수 검증 패스'(TODO ②)용.
// 원본 shot-042744.png 과 클론 settings.png 에서 같은 방법으로
// ① 흰 카드 박스 ② 줄무늬 행 경계 ③ 토글 트랙/노브 ④ 하단 [프로필][설정] 버튼줄 ⑤ 빨간 ✕
// 을 색 조건으로 스캔해 화면 폭·높이 대비 %로 뽑는다. 눈대중 금지 규칙(TODO 15줄)용 도구.
//
// ⚠️ 측정 함정 메모(직접 밟은 것):
//  · 카드 하단을 '가로로 긴 밝은 구간'으로 잡으면 [프로필][설정] 버튼줄이 흰 픽셀을 끊어
//    카드가 거기서 끝난 것으로 잡힌다 → 카드 좌우 안쪽 '기둥 컬럼'의 세로 연속 구간으로 잡을 것.
//  · 빨간 ✕를 화면 전체에서 찾으면 클론은 탭바의 빨간 버튼·체력바까지 한 덩어리로 묶인다
//    → 카드 하단 근처 + 가로 중앙 부근으로 한정하고 가장 넓은 행 덩어리만 쓸 것.
// 사용: PW_PATH=... node probe-settings.js
const { chromium } = require(process.env.PW_PATH || 'playwright');
const path = require('path'), fs = require('fs');
// 인자로 원본·클론 경로를 주면 같은 카드 문법을 쓰는 다른 화면(프로필 등)에도 그대로 쓸 수 있다.
const A = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042744.png');
const B = process.argv[3] || path.join(__dirname, 'ref-cmp/clone/settings.png');

const measure = (page, file) => page.evaluate(async (dataUrl) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const d = x.getImageData(0, 0, W, H).data;
    const at = (px, y) => { const i = (y * W + px) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const bright = (px, y) => { const [r, g, b] = at(px, y); return r > 218 && g > 218 && b > 218 && Math.max(r, g, b) - Math.min(r, g, b) < 16; };

    // ① 카드 좌우 — 가장 긴 밝은 가로 구간이 나오는 행(제목/여백 줄)에서 잡는다
    let cx0 = 0, cx1 = 0, bestRun = 0;
    for (let y = 0; y < H; y++) {
        let run = 0, s = -1;
        for (let px = 0; px < W; px++) {
            if (bright(px, y)) { if (!run) s = px; run++; if (run > bestRun) { bestRun = run; cx0 = s; cx1 = px; } }
            else run = 0;
        }
    }
    // 카드 상·하 — 좌우 가장자리 안쪽 '기둥 컬럼' 두 개의 세로 연속 구간.
    // ⚠️ 여기서 `bright`(>218)를 쓰면 원본의 회색 줄무늬 행(≈213)이 기둥을 끊어 카드가 하단
    //    흰 여백만으로 잡힌다 — 카드 소속 판정은 '어두운 배경이 아님'(밝기>140·저채도)으로 한다.
    const cardish = (px, y) => { const [r, g, b] = at(px, y); return (r + g + b) / 3 > 140 && Math.max(r, g, b) - Math.min(r, g, b) < 42; };
    // ⚠️ 카드 상·하를 '가장자리 안쪽 기둥 컬럼'으로 잡으면 둥근 모서리(반지름 1.1rem)만큼 안쪽에서
    //    시작해 카드가 실제보다 짧게 잡히고, 그 편향이 원본·클론의 모서리 반지름 차이만큼 남아
    //    높이 차이를 2%p씩 뻥튀기한다(직접 밟은 함정). 행마다 카드 x구간의 밝은 화소 '비율'을 세고
    //    50%를 넘는 첫/마지막 행으로 잡으면 모서리 2~3px만 영향받는다.
    const rowFill = (y) => {
        let n = 0; for (let px = cx0; px <= cx1; px++) if (cardish(px, y)) n++;
        return n / (cx1 - cx0 + 1);
    };
    let cy0 = -1, cy1 = -1;
    for (let y = 0; y < H; y++) if (rowFill(y) > 0.5) { if (cy0 < 0) cy0 = y; cy1 = y; }
    const card = { x: cx0, y: cy0, w: cx1 - cx0 + 1, h: cy1 - cy0 + 1 };

    // 행 히트 목록을 세로로 끊어 덩어리로 묶고, 최소 높이를 넘는 첫 덩어리를 돌려준다.
    // (1px짜리 구분선·글자 획을 요소로 오인하는 걸 막는 장치)
    const firstBlob = (hits, minH) => {
        let grp = [];
        for (const h of hits) {
            if (grp.length && h.y - grp[grp.length - 1].y > 2) {
                if (grp[grp.length - 1].y - grp[0].y + 1 >= minH) break;
                grp = [];
            }
            grp.push(h);
        }
        if (!grp.length || grp[grp.length - 1].y - grp[0].y + 1 < minH) return null;
        const xs = Math.min(...grp.map(h => h.x)), xe = Math.max(...grp.map(h => h.x + h.w));
        return { x: xs, y: grp[0].y, w: xe - xs, h: grp[grp.length - 1].y - grp[0].y + 1 };
    };

    // ② 카드 안 가로 밴드 경계 (행 줄무늬) — 라벨 글자를 피해 좌측 5~55% 구간 평균
    const bands = [];
    {
        const xa = card.x + Math.round(card.w * 0.05), xb = card.x + Math.round(card.w * 0.55);
        const rows = [];
        for (let y = card.y; y < card.y + card.h; y++) {
            let s = 0; for (let px = xa; px < xb; px++) { const [r, g, b] = at(px, y); s += (r + g + b) / 3; }
            rows.push(s / (xb - xa));
        }
        for (let i = 1; i < rows.length; i++) {
            const dl = Math.abs(rows[i] - rows[i - 1]);
            if (dl > 3) { const last = bands[bands.length - 1]; if (last && (card.y + i) - last.y <= 4) { if (dl > last.d) { last.y = card.y + i; last.d = dl; } } else bands.push({ y: card.y + i, d: dl }); }
        }
    }
    // ②-b 줄무늬 대비 — 짝/홀 행 배경색 차이(원본은 뚜렷한 회색/흰색 교대)
    const stripe = (() => {
        const xa = card.x + Math.round(card.w * 0.30), xb = card.x + Math.round(card.w * 0.50);
        const vals = [];
        for (let y = card.y; y < card.y + card.h; y++) {
            let s = 0; for (let px = xa; px < xb; px++) { const [r, g, b] = at(px, y); s += (r + g + b) / 3; }
            vals.push(s / (xb - xa));
        }
        const inList = vals.filter(v => v > 150);
        if (!inList.length) return null;
        const lo = [...inList].sort((p, q) => p - q)[Math.round(inList.length * 0.15)];
        const hi = [...inList].sort((p, q) => p - q)[Math.round(inList.length * 0.85)];
        return { lo: +lo.toFixed(1), hi: +hi.toFixed(1), delta: +(hi - lo).toFixed(1) };
    })();

    // ③ 토글 — 카드 오른쪽 45% 안, 첫 행(진동)의 '배경이 아닌' 덩어리 전체(트랙+노브)
    const firstToggle = (() => {
        const xm = Math.round(card.x + card.w * 0.55), xe = card.x + card.w;
        const rowsHit = [];
        for (let y = card.y + Math.round(card.h * 0.08); y < card.y + card.h * 0.6; y++) {
            let run = 0, s = -1, seg = null;
            for (let px = xm; px < xe; px++) {
                const [r, g, b] = at(px, y);
                const bg = (r > 200 && g > 200 && b > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 18);
                if (!bg) { if (!run) s = px; run++; if (!seg || run > seg.w) seg = { x: s, w: run }; }
                else run = 0;
            }
            if (seg && seg.w > 22) rowsHit.push({ y, ...seg });
        }
        return firstBlob(rowsHit, 10);
    })();

    // ④ 하단 버튼줄 — 카드 아래쪽 절반에서 '어두운 픽셀이 가로로 길게' 있는 구간
    const btnrow = (() => {
        const ys = card.y + Math.round(card.h * 0.5);
        const hit = [];
        for (let y = ys; y < card.y + card.h; y++) {
            let dark = 0, x0 = 1e9, x1 = -1;
            for (let px = card.x; px < card.x + card.w; px++) {
                const [r, g, b] = at(px, y);
                if (r < 110 && g < 110 && b < 140 || (b > 140 && b - r > 55)) { dark++; if (px < x0) x0 = px; if (px > x1) x1 = px; }
            }
            if (dark > card.w * 0.3) hit.push({ y, x: x0, w: x1 - x0 + 1 });
        }
        return firstBlob(hit, 8);
    })();

    // ⑤ 빨간 ✕ — 카드 하단 ±12%H, 가로 중앙 40% 안에서만
    const xbtn = (() => {
        const yA = card.y + card.h - Math.round(H * 0.05), yB = Math.min(H, card.y + card.h + Math.round(H * 0.12));
        const xa = Math.round(W * 0.3), xb = Math.round(W * 0.7);
        // 행마다 '가장 긴 연속 빨강 구간'만 쓴다 — 좌우로 떨어진 다른 빨강(탭바 버튼·배지)을
        // 한 덩어리로 묶어 폭이 2배로 잡히는 함정(TODO 21줄 '덩어리 분리 확인')을 피한다.
        const hits = [];
        for (let y = yA; y < yB; y++) {
            let run = 0, s = -1, seg = null;
            for (let px = xa; px < xb; px++) {
                const [r, g, b] = at(px, y);
                if (r > 165 && g < 95 && b < 95) { if (!run) s = px; run++; if (!seg || run > seg.w) seg = { x: s, w: run }; }
                else run = 0;
            }
            if (seg && seg.w > 10) hits.push({ y, ...seg });
        }
        return firstBlob(hits, 10);
    })();

    // ②-c 목록 행 — 줄무늬 밝기의 중간값을 기준으로 회색/흰색을 갈라 행 경계와 행 높이를 뽑는다
    const listRows = (() => {
        if (!stripe) return null;
        const mid = (stripe.lo + stripe.hi) / 2;
        const xa = card.x + Math.round(card.w * 0.30), xb = card.x + Math.round(card.w * 0.50);
        const cls = [];
        for (let y = card.y; y < card.y + card.h; y++) {
            let s = 0; for (let px = xa; px < xb; px++) { const [r, g, b] = at(px, y); s += (r + g + b) / 3; }
            const v = s / (xb - xa);
            cls.push(v > 150 ? (v > mid ? 1 : 0) : -1); // 1=흰, 0=회색, -1=목록 아님
        }
        const seg = [];
        for (let i = 0; i < cls.length; i++) {
            const last = seg[seg.length - 1];
            if (last && last.c === cls[i]) last.h++;
            else seg.push({ c: cls[i], y: card.y + i, h: 1 });
        }
        const rows = seg.filter(s => s.c >= 0 && s.h >= 8);
        return { top: rows[0] ? rows[0].y : null, heights: rows.map(r => r.h), n: rows.length };
    })();

    return { W, H, card, stripe, listRows, bands: bands.map(b => ({ pct: +(b.y / H * 100).toFixed(2), d: +b.d.toFixed(1) })), toggle: firstToggle, btnrow, xbtn };
}, 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'));

const pct = (v, tot) => (v / tot * 100).toFixed(2);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.goto('about:blank');
    const [a, b] = [await measure(page, A), await measure(page, B)];
    await browser.close();
    const show = (label, m) => {
        console.log(`\n[${label}] ${m.W}x${m.H}`);
        const box = (n, r) => console.log(r ? `  ${n.padEnd(8)} x=${pct(r.x, m.W)}%W y=${pct(r.y, m.H)}%H w=${pct(r.w, m.W)}%W h=${pct(r.h, m.H)}%H (${r.w}x${r.h}px, 비=${(r.w / r.h).toFixed(2)})` : `  ${n.padEnd(8)} 미검출`);
        box('카드', m.card); box('토글', m.toggle); box('버튼줄', m.btnrow); box('✕', m.xbtn);
        console.log('  줄무늬 밝기 ' + JSON.stringify(m.stripe));
        if (m.listRows) console.log(`  목록 시작 ${pct(m.listRows.top, m.H)}%H · 행 ${m.listRows.n}개 · 행높이px [${m.listRows.heights.join(',')}] · 행높이%H ${(m.listRows.heights.reduce((s, v) => s + v, 0) / m.listRows.n / m.H * 100).toFixed(2)}`);
        console.log('  강한 밴드%H: ' + m.bands.filter(x => x.d > 6).map(x => x.pct).join(', '));
    };
    show('원본', a); show('클론', b);
    console.log('\n[차이 %p — 화면 대비, |Δ|>2 이면 불통과]');
    const cmp = (n, ra, rb) => {
        if (!ra || !rb) return console.log(`  ${n}: 한쪽 미검출`);
        const f = (v1, t1, v2, t2) => { const v = (v2 / t2 * 100 - v1 / t1 * 100); return (v.toFixed(2) + (Math.abs(v) > 2 ? '!' : ' ')).padStart(8); };
        console.log(`  ${n.padEnd(8)} x${f(ra.x, a.W, rb.x, b.W)} y${f(ra.y, a.H, rb.y, b.H)} w${f(ra.w, a.W, rb.w, b.W)} h${f(ra.h, a.H, rb.h, b.H)}  가로세로비 ${(ra.w / ra.h).toFixed(2)}→${(rb.w / rb.h).toFixed(2)}`);
    };
    cmp('카드', a.card, b.card); cmp('토글', a.toggle, b.toggle); cmp('버튼줄', a.btnrow, b.btnrow); cmp('✕', a.xbtn, b.xbtn);
})();
