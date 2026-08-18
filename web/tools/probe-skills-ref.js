// 스킬 화면(shot-042340) **원본 PNG 픽셀 실측** — 클론 DOM 실측(probe-skills-dom.js)의 목표치를 뽑는다.
// 사용: PW_PATH=<playwright> node probe-skills-ref.js [png경로]
//
// 이 화면은 배경이 **흰색**이라 상점(다크 마룬)과 달리 '비(非)흰색 = 잉크' 마스크가 잘 통한다.
// ⚠️ 대신 밟기 쉬운 함정 2개:
//   ① 오브는 **원**이라 행 투영으로 잡으면 위/아래 끝의 가느다란 호까지 딸려와 폭이 커진다 —
//      오브 세로 중앙 행에서 재야 지름이 나온다.
//   ② 오브 아래 조각 게이지 pill 과 위 '장착됨' 리본이 같은 열에 있어, 열 투영만으로는
//      셀 높이가 오브 지름이 아니라 '리본~게이지' 전체가 된다. 둘을 따로 잡는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PNG = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042340.png');

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

        const isWhite = p => p[0] >= 240 && p[1] >= 240 && p[2] >= 240;
        const isInk = p => !isWhite(p);
        const isBlue = p => p[2] > 170 && p[0] < 80 && p[1] < 130;
        const isRed = p => p[0] > 180 && p[1] < 80 && p[2] < 80;
        const isGray = p => Math.abs(p[0] - p[1]) < 10 && Math.abs(p[1] - p[2]) < 10 && p[0] > 100 && p[0] < 200;
        const bbox = (pred, y0, y1, x0, x1) => {
            let t = -1, b = -1, l = 1e9, r = -1, n = 0;
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                if (!pred(at(x, y))) continue;
                n++; if (t < 0) t = y; b = y; if (x < l) l = x; if (x > r) r = x;
            }
            return n ? { t, b, l, r, w: r - l + 1, h: b - t + 1, n } : null;
        };
        // 행/열 투영으로 덩어리 나누기
        const runs = (vals, min, gap) => {
            const g = [];
            for (let i = 0; i < vals.length; i++) {
                if (vals[i] < min) continue;
                const last = g[g.length - 1];
                if (last && i - last.b <= gap) last.b = i; else g.push({ t: i, b: i });
            }
            return g;
        };

        const R = { W, H };

        // ── 앱 상자: 탭바 남색 띠가 깔린 가로 범위
        const tabY = H - 40;
        let appL = 1e9, appR = -1;
        for (let x = 0; x < W; x++) { const p = at(x, tabY); if (p[0] < 45 && p[2] > p[0]) { if (x < appL) appL = x; if (x > appR) appR = x; } }
        R.app = { l: appL, r: appR, w: appR - appL + 1 };

        // ── 스탯 요약 바(회색 pill) — 상단 1/10 안에서
        R.statBar = bbox(isGray, Math.round(H * 0.04), Math.round(H * 0.10), 0, W - 1);

        // ── 오브 그리드 — 스탯 바 아래 ~ 화면 45% 사이의 잉크를 행/열로 투영
        const gy0 = (R.statBar ? R.statBar.b : Math.round(H * 0.08)) + 6, gy1 = Math.round(H * 0.44);
        const rowInk = [], colInk = [];
        for (let y = gy0; y <= gy1; y++) { let n = 0; for (let x = 0; x < W; x++) if (isInk(at(x, y))) n++; rowInk.push(n); }
        for (let x = 0; x < W; x++) { let n = 0; for (let y = gy0; y <= gy1; y++) if (isInk(at(x, y))) n++; colInk.push(n); }
        R.gridRows = runs(rowInk, 12, 4).map(g => ({ t: g.t + gy0, b: g.b + gy0, h: g.b - g.t + 1 }));
        R.gridCols = runs(colInk, 6, 4).map(g => ({ l: g.t, r: g.b, w: g.b - g.t + 1 }));

        // ── 오브 지름: 첫 행의 세로 중앙 행에서 첫 열의 잉크 폭
        if (R.gridRows[0] && R.gridCols[0]) {
            const row = R.gridRows[0];
            // 셀 안에서 '가장 넓은 잉크 런'이 나오는 행 = 오브 지름 행
            let best = { len: 0, y: -1, l: 0 };
            for (let y = row.t; y <= row.b; y++) {
                let cur = 0, s = -1, bl = 0, bs = -1;
                for (let x = R.gridCols[0].l - 4; x <= R.gridCols[0].r + 4; x++) {
                    if (isInk(at(x, y))) { if (!cur) s = x; cur++; if (cur > bl) { bl = cur; bs = s; } } else cur = 0;
                }
                if (bl > best.len) best = { len: bl, y, l: bs };
            }
            R.orb = { d: best.len, midY: best.y, l: best.l };
        }

        // ── '장착됨' 바(어두운 큰 띠) — 화면 50~68%
        R.equipBar = bbox(p => p[0] < 60 && p[1] < 60 && p[2] < 70, Math.round(H * 0.52), Math.round(H * 0.66), 0, W - 1);

        // ── 파란 버튼 2개(모두 업그레이드 · 빠른 장착) — 장착됨 바 아래
        const btnBand = [Math.round(H * 0.63), Math.round(H * 0.71)];
        const bcol = [];
        for (let x = 0; x < W; x++) { let n = 0; for (let y = btnBand[0]; y <= btnBand[1]; y++) if (isBlue(at(x, y))) n++; bcol.push(n); }
        const bg = runs(bcol, 3, 8);
        R.buttons = bg.map(g => {
            const bb = bbox(isBlue, btnBand[0], btnBand[1], g.t, g.b);
            return bb && { l: bb.l, r: bb.r, w: bb.w, t: bb.t, b: bb.b, h: bb.h };
        }).filter(Boolean);

        // ── 하단 줄: ◀(빨강) · x5 pill(파랑) · 소환 버튼(회색)
        const botBand = [Math.round(H * 0.73), Math.round(H * 0.82)];
        R.back = bbox(isRed, botBand[0], botBand[1], 0, Math.round(W * 0.18));
        R.multPill = bbox(isBlue, botBand[0], botBand[1], Math.round(W * 0.18), Math.round(W * 0.38));
        R.summonBtn = bbox(isGray, botBand[0], botBand[1], Math.round(W * 0.34), Math.round(W * 0.68));

        // ── 서브탭 바(스킬|펫|기술 트리) — 화면 82~92%
        R.subtabs = bbox(isInk, Math.round(H * 0.82), Math.round(H * 0.90), 0, W - 1);
        R.subtabActive = bbox(isBlue, Math.round(H * 0.82), Math.round(H * 0.90), 0, W - 1);
        return R;
    }, dataUrl);
    await browser.close();

    const AW = out.app.w, AH = out.H;
    const pw = v => (v / AW * 100).toFixed(2) + '%W';
    const ph = v => (v / AH * 100).toFixed(2) + '%H';
    const line = (name, b) => b && console.log(`${name.padEnd(14)} x ${b.l}~${b.r} (${pw(b.l)} w ${pw(b.w)}) · y ${b.t}~${b.b} (${ph(b.t)} h ${ph(b.h)})`);
    console.log(`원본 ${out.W}x${out.H} · 앱 상자 x ${out.app.l}~${out.app.r} (w ${AW})`);
    line('스탯 요약바', out.statBar);
    out.gridRows.forEach((r, i) => console.log(`그리드 ${i + 1}행   y ${r.t}~${r.b} (${ph(r.t)} h ${ph(r.h)})${i ? ' · 행 피치 ' + (r.t - out.gridRows[i - 1].t) + 'px' : ''}`));
    out.gridCols.forEach((c, i) => console.log(`그리드 ${i + 1}열   x ${c.l}~${c.r} (${pw(c.l)} w ${pw(c.w)})${i ? ' · 열 피치 ' + (c.l - out.gridCols[i - 1].l) + 'px' : ''}`));
    if (out.orb) console.log(`오브 지름     ${out.orb.d}px (${pw(out.orb.d)}) · 중앙행 y ${out.orb.midY} · 좌 x ${out.orb.l}`);
    line('장착됨 바', out.equipBar);
    out.buttons.forEach((b, i) => line(`버튼${i + 1}`, b));
    line('◀ 뒤로', out.back);
    line('x5 pill', out.multPill);
    line('소환 버튼', out.summonBtn);
    line('서브탭 바', out.subtabs);
    line('서브탭 활성', out.subtabActive);
})();
