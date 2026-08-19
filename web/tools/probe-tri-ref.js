// 뒤로가기 ◀ / 좌우 스텝 ◀▶ 의 **삼각형 잉크 기하** 원본 실측 — icon-gen 슬라이스
// (남은 폰트 글리프 → 캔버스 아이콘) 용. `probe-xmark-ref.js` 의 자매 도구다.
//
// 재는 것 ①: **빨간 뒤로가기 버튼** 안의 흰 삼각형.
//   빨간 라운드 사각 덩어리(원형이 아니라 **가로가 살짝 넓다** — style.css 실측 주석 35×29)를
//   찾아 그 안의 흰 잉크 바운딩과, 삼각형 둘레에 **검정 테가 있는지**를 센다.
//   → 계약: 흰 잉크 폭/버튼폭 · 높이/버튼높이 · 테 유무.
//
// 재는 것 ②: **파란 삼각형**(소환 확률 팝업·던전 상세의 ◀▶). 파란 덩어리를 찾아 같은 값을 낸다.
//
// ⚠️ 함정 ⑴ 닫기 ✕ 도 빨간 덩어리다 → **폭/높이 0.9~1.1 의 정원은 뺀다**(뒤로 버튼은 1.15~1.35).
//    반대로 리본·가격 배지는 훨씬 가로로 길어 상한으로 걸러진다.
// ⚠️ 함정 ⑵ 버튼 아래턱(어두운 빨강 띠)은 `isRed` 문턱 아래라 덩어리에 안 들어온다 —
//    그래서 여기서 내는 '버튼 높이'는 **밝은 면만의 높이**다. 잉크 비를 그 면 기준으로 읽을 것.
// ⚠️ 함정 ⑶ 흰 판정을 220 이상 3채널로 좁힌다(안쪽 그림자 위 밝은 띠 배제, xmark 프로브와 동일).
//
// 사용: node probe-tri-ref.js [png경로 ...]   (인자 없으면 ref/screens/*.png 전수)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const REFDIR = path.resolve(__dirname, '../ref/screens');
const PNGS = process.argv.length > 2 ? process.argv.slice(2)
    : fs.readdirSync(REFDIR).filter(f => f.endsWith('.png')).map(f => path.join(REFDIR, f));

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');

    const rows = [];
    for (const png of PNGS) {
        const dataUrl = 'data:image/png;base64,' + fs.readFileSync(png).toString('base64');
        const found = await page.evaluate(async (src) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = src; });
            const W = img.width, H = img.height;
            const c = document.getElementById('c');
            c.width = W; c.height = H;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, W, H).data;
            const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
            const isRed = (p) => p[0] > 150 && p[0] - p[1] > 70 && p[0] - p[2] > 70;
            const isBlue = (p) => p[2] > 130 && p[2] - p[0] > 55 && p[2] - p[1] > 30;
            const isWhite = (p) => p[0] > 220 && p[1] > 220 && p[2] > 220;
            const isBlack = (p) => p[0] < 70 && p[1] < 70 && p[2] < 70;

            const blobsOf = (pred) => {
                const seen = new Uint8Array(W * H);
                const out = [];
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const i0 = y * W + x;
                    if (seen[i0] || !pred(at(x, y))) continue;
                    let x0 = x, x1 = x, y0 = y, y1 = y, n = 0;
                    const st = [i0]; seen[i0] = 1;
                    while (st.length) {
                        const i = st.pop(), px = i % W, py = (i - px) / W;
                        n++;
                        if (px < x0) x0 = px; if (px > x1) x1 = px;
                        if (py < y0) y0 = py; if (py > y1) y1 = py;
                        for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
                            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                            const j = ny * W + nx;
                            if (seen[j] || !pred(at(nx, ny))) continue;
                            seen[j] = 1; st.push(j);
                        }
                    }
                    const w = x1 - x0 + 1, h = y1 - y0 + 1;
                    out.push({ x0, y0, x1, y1, w, h, n });
                }
                return out;
            };

            // 잉크(흰/파랑) 바운딩 + 테 검사. 덩어리 안쪽만 훑는다.
            const inkOf = (b, pred) => {
                let ix0 = 1e9, iy0 = 1e9, ix1 = -1, iy1 = -1, n = 0;
                for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
                    if (!pred(at(x, y))) continue;
                    n++;
                    if (x < ix0) ix0 = x; if (x > ix1) ix1 = x;
                    if (y < iy0) iy0 = y; if (y > iy1) iy1 = y;
                }
                if (ix1 < 0) return null;
                // 테 유무 — 잉크 바운딩의 세로 중앙 행에서 **잉크 왼쪽 바로 바깥** 3px 에
                // 거의-검정이 있는지. 삼각형은 왼쪽이 꼭짓점(◀)이거나 밑변(▶)이라 어느 쪽이든
                // 중앙 행에서는 잉크가 가장 넓어 바깥이 곧 테/배경이다.
                const my = Math.round((iy0 + iy1) / 2);
                let rim = 0;
                for (let k = 1; k <= 3; k++) {
                    const x = ix0 - k;
                    if (x >= 0 && isBlack(at(x, my))) rim++;
                }
                return { ix0, iy0, ix1, iy1, iw: ix1 - ix0 + 1, ih: iy1 - iy0 + 1, n, rim };
            };

            const res = [];
            // ① 빨간 뒤로 버튼 — 가로가 넓은 라운드 사각(정원인 닫기 ✕ 는 뺀다)
            for (const b of blobsOf(isRed)) {
                if (b.w < 20 || b.h < 16) continue;
                const ar = b.w / b.h;
                if (ar < 1.12 || ar > 1.45) continue;
                if (b.n / (b.w * b.h) < 0.55) continue;
                const ink = inkOf(b, isWhite);
                if (!ink || ink.n < 30) continue;
                res.push({ kind: 'red', bw: b.w, bh: b.h, bx: b.x0, by: b.y0, ...ink });
            }
            // ② 파란 삼각형 — 버튼 배경이 없어 덩어리 자체가 잉크다(테는 그 바깥).
            for (const b of blobsOf(isBlue)) {
                if (b.w < 12 || b.h < 12 || b.w > 60 || b.h > 60) continue;
                // 삼각형 채움률은 ≈0.5 다(사각형/원과 갈린다)
                const fill = b.n / (b.w * b.h);
                if (fill < 0.34 || fill > 0.66) continue;
                const my = Math.round((b.y0 + b.y1) / 2);
                let rim = 0;
                for (let k = 1; k <= 3; k++) {
                    const x = b.x0 - k;
                    if (x >= 0 && isBlack(at(x, my))) rim++;
                }
                res.push({ kind: 'blue', bw: b.w, bh: b.h, bx: b.x0, by: b.y0, iw: b.w, ih: b.h, n: b.n, rim, fill: +fill.toFixed(3) });
            }
            return res;
        }, dataUrl);
        if (found) for (const f of found) rows.push({ png: path.basename(png), ...f });
    }
    await browser.close();

    const red = rows.filter(r => r.kind === 'red');
    const blue = rows.filter(r => r.kind === 'blue');
    console.log(`원본 ${PNGS.length}장 — 빨간 뒤로 버튼 ${red.length}개 · 파란 삼각형 ${blue.length}개\n`);
    if (red.length) {
        console.log('[빨간 뒤로가기] png             버튼 w×h   흰잉크 w×h   폭비    높이비   좌테(0~3)');
        for (const r of red) {
            console.log(`  ${r.png.padEnd(15)} ${String(r.bw).padStart(3)}×${String(r.bh).padStart(3)}    ` +
                `${String(r.iw).padStart(3)}×${String(r.ih).padStart(3)}    ${(r.iw / r.bw).toFixed(3)}   ${(r.ih / r.bh).toFixed(3)}      ${r.rim}`);
        }
        const f = (k) => { const v = red.map(k).sort((a, b) => a - b); return [v[0], v[v.length - 1]]; };
        const [w0, w1] = f(r => r.iw / r.bw), [h0, h1] = f(r => r.ih / r.bh);
        console.log(`  → 폭비 ${w0.toFixed(3)}~${w1.toFixed(3)} · 높이비 ${h0.toFixed(3)}~${h1.toFixed(3)} · 테 있는 컷 ${red.filter(r => r.rim >= 2).length}/${red.length}`);
    }
    if (blue.length) {
        console.log('\n[파란 삼각형]   png             잉크 w×h   채움률  가로세로비  좌테(0~3)');
        for (const r of blue) {
            console.log(`  ${r.png.padEnd(15)} ${String(r.iw).padStart(3)}×${String(r.ih).padStart(3)}    ${r.fill}   ${(r.iw / r.ih).toFixed(3)}       ${r.rim}`);
        }
        console.log(`  → 테 있는 컷 ${blue.filter(r => r.rim >= 2).length}/${blue.length}`);
    }
    if (!red.length && !blue.length) { console.log('검출 0 — 술어/필터를 의심할 것(측정기 고장).'); process.exit(2); }
})();
