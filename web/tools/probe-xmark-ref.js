// 팝업 닫기 버튼의 **X 잉크 기하** 원본 실측 — icon-gen 슬라이스(글리프 → 캔버스 아이콘)용.
//
// 재는 것: 빨간 원형 닫기 버튼 안의 흰 X 표시.
//   ① 빨간 원반 바운딩 박스(지름) ② 그 안 흰 잉크 바운딩 박스 ③ 획 두께(원 중심 행의 흰 런 폭)
//   ④ 원 지름 대비 X 폭/높이 비 — **이 비가 캔버스 아이콘이 맞춰야 할 계약이다.**
//
// ⚠️ 함정 ⑴ 빨간 원은 화면에 여럿 있다(탭바 X·가격 배지·리본). 그래서 '거의 원형'(폭/높이 0.9~1.1)
//    이고 **지름이 24px 이상**인 덩어리만 본다. 리본·배지는 가로로 길어 걸러진다.
// ⚠️ 함정 ⑵ 원 안 흰 픽셀에는 **아래쪽 안쪽 그림자 위 밝은 띠**가 섞일 수 있다 → 흰 판정을
//    3채널 모두 220 이상으로 좁히고, 원 **안쪽 78%** 반경만 본다(테두리 검정·바깥 배경 배제).
// ⚠️ 함정 ⑶ 원본 이미지 폭 ≠ 앱 폭인 컷이 있다. 여기서 내는 값은 전부 **원 지름 대비 비**라
//    앱 폭 환산이 필요 없다(그래서 이 지표를 골랐다).
//
// 사용: node probe-xmark-ref.js [png경로 ...]   (인자 없으면 ref/screens/*.png 전수)
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
            // 원본 빨강 실측대: pp-red 계열(R 압도적, G·B 낮음)
            const isRed = (p) => p[0] > 150 && p[0] - p[1] > 70 && p[0] - p[2] > 70;
            const isWhite = (p) => p[0] > 220 && p[1] > 220 && p[2] > 220;

            // 빨간 픽셀 연결요소 라벨링(4방향, 스택)
            const seen = new Uint8Array(W * H);
            const blobs = [];
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i0 = y * W + x;
                if (seen[i0] || !isRed(at(x, y))) continue;
                let x0 = x, x1 = x, y0 = y, y1 = y, n = 0;
                const st = [i0]; seen[i0] = 1;
                while (st.length) {
                    const i = st.pop(), px = i % W, py = (i - px) / W;
                    n++;
                    if (px < x0) x0 = px; if (px > x1) x1 = px;
                    if (py < y0) y0 = py; if (py > y1) y1 = py;
                    const nb = [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]];
                    for (const [nx, ny] of nb) {
                        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
                        const j = ny * W + nx;
                        if (seen[j] || !isRed(at(nx, ny))) continue;
                        seen[j] = 1; st.push(j);
                    }
                }
                const w = x1 - x0 + 1, h = y1 - y0 + 1;
                // 거의 원형 + 충분히 큰 것만. 채움률로 리본·사각 배지를 한 번 더 거른다.
                if (w >= 24 && h >= 24 && w / h > 0.82 && w / h < 1.25 && n / (w * h) > 0.45) blobs.push({ x0, y0, x1, y1, w, h });
            }
            if (!blobs.length) return null;

            return blobs.map(b => {
                const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, R = Math.min(b.w, b.h) / 2;
                const rin = R * 0.78;
                let ix0 = 1e9, iy0 = 1e9, ix1 = -1, iy1 = -1, ink = 0;
                for (let y = Math.floor(cy - rin); y <= Math.ceil(cy + rin); y++) {
                    for (let x = Math.floor(cx - rin); x <= Math.ceil(cx + rin); x++) {
                        if (x < 0 || y < 0 || x >= W || y >= H) continue;
                        if ((x - cx) ** 2 + (y - cy) ** 2 > rin * rin) continue;
                        if (!isWhite(at(x, y))) continue;
                        ink++;
                        if (x < ix0) ix0 = x; if (x > ix1) ix1 = x;
                        if (y < iy0) iy0 = y; if (y > iy1) iy1 = y;
                    }
                }
                if (ix1 < 0) return { d: b.w, cx, cy, ink: 0 };
                // 획 두께 — **팔(arm) 하나의 가로 단면**을 쓴다. 중심 행은 두 획이 겹쳐 교차부
                // 폭(획 두께가 아님)을 재고, 그 값이 중심이 어느 행에 앉느냐에 따라 심하게 튄다
                // (원본 25장에서도 0.059~0.098 로 흔들렸다). 잉크 위쪽 28% 행에서는 두 팔이 아직
                // 갈라져 있어 **왼쪽 팔의 첫 흰 런**이 곧 획의 가로 단면(≈두께·√2)이다 — 위치에
                // 둔감해 원본·클론이 안정적으로 같은 값을 준다.
                const armRow = (getRow) => {
                    const yy = Math.round(iy0 + (iy1 - iy0) * 0.28);
                    let run = 0, seen = false;
                    for (let x = ix0; x <= ix1; x++) {
                        const on = isWhite(at(x, yy));
                        if (on) { run++; seen = true; }
                        else if (seen) break;   // 첫 런이 끝나면 멈춘다(왼쪽 팔만)
                    }
                    return run;
                };
                const best = armRow();
                // 면 색 = 원 위쪽 1/3 의 최빈 빨강 · 아래턱 색 = 원 아래 가장자리 안쪽의 최빈 빨강.
                // (전역 `.x-btn` 승격의 근거를 만든다 — style.css ㉣ 가 "알 상세·탈것 상세를 재면
                //  셋을 묶어 전역으로 올릴 것"으로 남겨 둔 숙제다.)
                const modeAt = (y0f, y1f) => {
                    const tally = {};
                    for (let y = Math.round(cy + R * y0f); y <= Math.round(cy + R * y1f); y++) {
                        for (let x = Math.round(cx - R * 0.5); x <= Math.round(cx + R * 0.5); x++) {
                            if (x < 0 || y < 0 || x >= W || y >= H) continue;
                            const p = at(x, y);
                            // 아래턱(#4a0709 급)은 isRed 문턱 아래라 여기선 '붉은 계열' 로 넓힌다.
                            if (!(p[0] > 40 && p[0] - p[1] > 25 && p[0] - p[2] > 20)) continue;
                            const k = p.join(',');
                            tally[k] = (tally[k] || 0) + 1;
                        }
                    }
                    let best = '', bn = 0;
                    for (const k in tally) if (tally[k] > bn) { bn = tally[k]; best = k; }
                    return best;
                };
                const hex = (s) => s ? '#' + s.split(',').map(v => (+v).toString(16).padStart(2, '0')).join('') : '—';
                return {
                    d: b.w, cx: +cx.toFixed(1), cy: +cy.toFixed(1), ink,
                    iw: ix1 - ix0 + 1, ih: iy1 - iy0 + 1, core: best,
                    face: hex(modeAt(-0.75, -0.35)), bevel: hex(modeAt(1.02, 1.30)),
                };
            });
        }, dataUrl);
        if (found) for (const f of found) rows.push({ png: path.basename(png), ...f });
    }
    await browser.close();

    const good = rows.filter(r => r.iw);
    if (process.env.DBG) console.log(JSON.stringify(rows));
    console.log(`원본 ${PNGS.length}장 · 빨간 원형 버튼 ${rows.length}개 (X 잉크 검출 ${good.length}개)\n`);
    console.log('  png             지름   중심(x,y)      X폭×높이   폭/지름  높이/지름  중심획/지름   면       아래턱');
    for (const r of good) {
        console.log(`  ${r.png.padEnd(15)} ${String(r.d).padStart(4)}  (${String(r.cx).padStart(5)},${String(r.cy).padStart(6)})  ${String(r.iw).padStart(3)}×${String(r.ih).padStart(3)}` +
            `      ${(r.iw / r.d).toFixed(3)}     ${(r.ih / r.d).toFixed(3)}      ${(r.core / r.d).toFixed(3)}    ${r.face}  ${r.bevel}`);
    }
    if (good.length) {
        const avg = (k) => good.reduce((s, r) => s + r[k] / r.d, 0) / good.length;
        const tally = (k) => {
            const t = {};
            for (const r of good) t[r[k]] = (t[r[k]] || 0) + 1;
            return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v}×${n}`).join(' · ');
        };
        console.log(`\n  평균 — X폭/지름 ${avg('iw').toFixed(3)} · X높이/지름 ${avg('ih').toFixed(3)} · 중심획/지름 ${avg('core').toFixed(3)}`);
        console.log(`  면 색 — ${tally('face')}`);
        console.log(`  아래턱 — ${tally('bevel')}`);
    }
})();
