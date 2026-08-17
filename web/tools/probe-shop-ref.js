// 상점(shot-042632) **원본 PNG 픽셀 실측** — 클론 DOM 실측(probe-shop-dom.js)의 목표치를 뽑는다.
// 사용: PW_PATH=<playwright> node probe-shop-ref.js [png경로]
//
// ⚠️ 이 화면에서 실제로 밟은 함정 — 다음 세션이 같은 임계값을 재사용하기 전에 읽을 것:
//   ① **배경이 다크 마룬 풀스크린**이라 '흰 픽셀 런'으로 카드를 찾는 건 잘 통하지만,
//      특가 카드 3장 사이 간격이 좁아(≈14px) 흰 런이 끊기는 행을 기준으로 카드를 갈라야 한다.
//   ② **빨간 마스크는 하단 ✕ 버튼과 리본 태그를 함께 잡는다.** 리본만 보려면 카드 y 범위로 자를 것.
//   ③ **파란 마스크는 가격 버튼과 탭바 아이콘을 함께 잡는다.** 가격 버튼도 카드 y 범위로 자른다.
//   ④ 앱 폭 = 이미지 폭인지 먼저 확인한다(다른 화면에서 이미지가 앱보다 넓은 사례가 3건 있었다).
//      여기선 상단바 잉크 좌우 끝과 탭바 최하단 행으로 교차 확인한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PNG = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042632.png');

(async () => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(PNG).toString('base64');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const out = await page.evaluate(async (src) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.getElementById('c');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

        const isWhite = p => p[0] >= 232 && p[1] >= 232 && p[2] >= 232;
        const isRed = p => p[0] > 180 && p[1] < 90 && p[2] < 90;
        const isBlue = p => p[2] > 170 && p[0] < 90 && p[1] < 130;
        const isOrange = p => p[0] > 210 && p[1] > 120 && p[1] < 205 && p[2] < 90;
        const isGrayPill = p => Math.abs(p[0] - p[1]) < 12 && Math.abs(p[1] - p[2]) < 12 && p[0] > 145 && p[0] < 205;

        const rowRun = (y, pred, x0, x1) => {
            let best = 0, bs = -1, cur = 0, s = -1;
            for (let x = x0; x <= x1; x++) {
                if (pred(at(x, y))) { if (cur === 0) s = x; cur++; if (cur > best) { best = cur; bs = s; } }
                else cur = 0;
            }
            return { len: best, x0: bs, x1: bs + best - 1 };
        };
        // 마스크 bbox — y0..y1, x0..x1 범위 안에서만
        const bbox = (pred, y0, y1, x0, x1) => {
            let t = -1, b = -1, l = 1e9, r = -1, n = 0;
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                if (!pred(at(x, y))) continue;
                n++; if (t < 0) t = y; b = y; if (x < l) l = x; if (x > r) r = x;
            }
            return n ? { t, b, l, r, w: r - l + 1, h: b - t + 1, n } : null;
        };

        const R = { W, H, notes: [] };

        // ── ④ 앱 폭 확인: 상단바 잉크(비배경 픽셀) 좌우 끝
        // 배경 다크 마룬을 배경색으로 잡고, 그와 다른 픽셀을 잉크로 본다.
        // 배경은 다크 마룬 **그라디언트**라 좁은 허용치로는 비네트가 통째로 '잉크'로 잡힌다
        // (첫 판에서 잉크 오른쪽 끝이 이미지 끝 499 로 나와 중심이 23.5px 틀어졌다). 넉넉히 잡는다.
        const bg = at(3, 3);
        const isBg = p => Math.abs(p[0] - bg[0]) < 46 && Math.abs(p[1] - bg[1]) < 46 && Math.abs(p[2] - bg[2]) < 46;
        let inkL = 1e9, inkR = -1;
        for (let y = 6; y < 44; y++) for (let x = 0; x < W; x++) {
            if (isBg(at(x, y))) continue;
            if (x < inkL) inkL = x; if (x > inkR) inkR = x;
        }
        R.bgColor = bg; R.topbarInk = { l: inkL, r: inkR, center: (inkL + inkR) / 2 };

        // ── 배너 2개(주황 리본) — 전체 세로에서 주황 덩어리를 찾아 y로 묶는다
        // ⚠️ 배너 중앙의 **검정 제목 글자**가 주황 런을 토막내 한 배너가 2~3덩어리로 잡힌다
        // (첫 판에서 배너 2개가 4개로 나왔다). 세로 간격 30px 까지는 같은 배너로 묶는다.
        const orangeRows = [];
        for (let y = 0; y < H; y++) { const r = rowRun(y, isOrange, 0, W - 1); if (r.len > 60) orangeRows.push({ y, ...r }); }
        const groups = [];
        for (const r of orangeRows) {
            const g = groups[groups.length - 1];
            if (g && r.y - g.b <= 30) { g.b = r.y; g.l = Math.min(g.l, r.x0); g.r = Math.max(g.r, r.x1); }
            else groups.push({ t: r.y, b: r.y, l: r.x0, r: r.x1 });
        }
        R.banners = groups.map(g => ({ ...g, w: g.r - g.l + 1, h: g.b - g.t + 1 }));

        // ── 흰 카드들(특가 3장 + 보석 3장) — 넓은 흰 런이 있는 행을 묶는다
        // ⚠️ '가장 긴 흰 런'으로 카드를 찾으면 안 된다 — 카드 안을 리본·회색 pill·상품 그림·파란 버튼이
        // 가로로 가로질러 런을 토막내는 행이 있어 카드 한 장이 2~4조각으로 갈린다(첫 판에서 실제로 갈렸다).
        // 대신 **행별 흰 픽셀 총량**을 쓰고, x 범위는 흰 픽셀의 min/max 로 잡는다.
        const whiteRows = [];
        for (let y = 0; y < H; y++) {
            let n = 0, l = 1e9, r = -1;
            for (let x = 0; x < W; x++) if (isWhite(at(x, y))) { n++; if (x < l) l = x; if (x > r) r = x; }
            if (n > 150) whiteRows.push({ y, x0: l, x1: r });
        }
        const cards = [];
        for (const r of whiteRows) {
            const g = cards[cards.length - 1];
            if (g && r.y - g.b <= 4) { g.b = r.y; g.l = Math.min(g.l, r.x0); g.r = Math.max(g.r, r.x1); }
            else cards.push({ t: r.y, b: r.y, l: r.x0, r: r.x1 });
        }
        R.whiteCards = cards.map(g => ({ ...g, w: g.r - g.l + 1, h: g.b - g.t + 1 }));

        // ── 특가 카드 3장 = 배너1 아래 ~ 배너2 위 사이의 흰 카드
        const b1 = R.banners[0], b2 = R.banners[1];
        const deals = R.whiteCards.filter(k => b1 && b2 && k.t > b1.b && k.b < b2.t && k.h > 60);
        R.deals = deals.map((k, i) => {
            const y0 = k.t, y1 = k.b;
            const tag = bbox(isRed, y0, y1, 0, W - 1);
            const btn = bbox(isBlue, y0, y1, 0, W - 1);
            // 회색 pill 3줄: 카드 왼쪽 절반에서만
            const pillRows = [];
            for (let y = y0; y <= y1; y++) { const r = rowRun(y, isGrayPill, k.l, k.l + Math.round(k.w * 0.55)); if (r.len > 60) pillRows.push({ y, ...r }); }
            const pills = [];
            for (const r of pillRows) {
                const g = pills[pills.length - 1];
                if (g && r.y - g.b <= 2) { g.b = r.y; g.l = Math.min(g.l, r.x0); g.r = Math.max(g.r, r.x1); }
                else pills.push({ t: r.y, b: r.y, l: r.x0, r: r.x1 });
            }
            return {
                idx: i, card: k,
                tag: tag && { t: tag.t, b: tag.b, l: tag.l, r: tag.r, w: tag.w, h: tag.h },
                btn: btn && { t: btn.t, b: btn.b, l: btn.l, r: btn.r, w: btn.w, h: btn.h },
                pills: pills.map(p => ({ ...p, w: p.r - p.l + 1, h: p.b - p.t + 1 })),
            };
        });

        // ── 보석 카드 = 배너2 아래 흰 카드
        R.gemCards = R.whiteCards.filter(k => b2 && k.t > b2.b).map(k => ({ ...k }));

        // ── 하단 ✕ (빨간 원) — 화면 아래 12%
        R.xBtn = bbox(isRed, Math.round(H * 0.88), H - 1, Math.round(W * 0.7), W - 1);
        // ── 좌하단 ◀ (빨간 사각) — 탭바 위
        R.backBtn = bbox(isRed, Math.round(H * 0.80), Math.round(H * 0.90), 0, Math.round(W * 0.25));
        return R;
    }, dataUrl);
    await browser.close();

    const W = out.W, H = out.H;
    const pw = v => (v / W * 100).toFixed(2) + '%W';
    const ph = v => (v / H * 100).toFixed(2) + '%H';
    console.log(`원본 ${W}x${H} · 배경 rgb(${out.bgColor}) · 상단바 잉크 ${out.topbarInk.l}~${out.topbarInk.r} (중심 ${out.topbarInk.center})`);
    console.log(`  → 이미지 중심 ${W / 2} · 잉크 중심 ${out.topbarInk.center} · 차이 ${(out.topbarInk.center - W / 2).toFixed(1)}px`);
    out.banners.forEach((b, i) => console.log(`배너${i + 1}  x ${b.l}~${b.r} (${pw(b.l)} w ${pw(b.w)}) · y ${b.t}~${b.b} (${ph(b.t)} h ${ph(b.h)})`));
    out.deals.forEach(d => {
        const k = d.card;
        console.log(`특가카드${d.idx + 1} x ${k.l}~${k.r} (${pw(k.l)} w ${pw(k.w)}) · y ${k.t}~${k.b} (${ph(k.t)} h ${ph(k.h)})`);
        if (d.tag) console.log(`   리본  x ${d.tag.l}~${d.tag.r} (${pw(d.tag.l)} w ${pw(d.tag.w)}) · y ${d.tag.t}~${d.tag.b} (${ph(d.tag.t)} h ${ph(d.tag.h)}) · 카드좌대비 ${d.tag.l - k.l}px`);
        if (d.btn) console.log(`   가격버튼 x ${d.btn.l}~${d.btn.r} (${pw(d.btn.l)} w ${pw(d.btn.w)}) · y ${d.btn.t}~${d.btn.b} (${ph(d.btn.t)} h ${ph(d.btn.h)}) · 카드우여백 ${k.r - d.btn.r}px · 카드하여백 ${k.b - d.btn.b}px`);
        d.pills.forEach((p, i) => console.log(`   pill${i + 1} x ${p.l}~${p.r} (${pw(p.l)} w ${pw(p.w)}) · y ${p.t}~${p.b} (h ${ph(p.h)}) · 피치 ${i ? p.t - d.pills[i - 1].t : '-'}px`));
    });
    out.gemCards.forEach((k, i) => console.log(`보석카드${i + 1} x ${k.l}~${k.r} (${pw(k.l)} w ${pw(k.w)}) · y ${k.t}~${k.b} (${ph(k.t)} h ${ph(k.h)})`));
    if (out.xBtn) console.log(`✕     x ${out.xBtn.l}~${out.xBtn.r} (${pw(out.xBtn.l)} w ${pw(out.xBtn.w)}) · y ${out.xBtn.t}~${out.xBtn.b} (${ph(out.xBtn.t)} h ${ph(out.xBtn.h)})`);
    if (out.backBtn) console.log(`◀     x ${out.backBtn.l}~${out.backBtn.r} (${pw(out.backBtn.l)} w ${pw(out.backBtn.w)}) · y ${out.backBtn.t}~${out.backBtn.b} (${ph(out.backBtn.t)} h ${ph(out.backBtn.h)})`);
})();
