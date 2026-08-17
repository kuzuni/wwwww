// 이미지에서 '어떤 색 덩어리'의 바운딩 박스를 %W/%H로 뽑는 범용 도구 — 비율 전수 검증 패스(TODO ②)에서
// 원본 PNG의 팝업 카드·버튼·밴드 위치를 재는 데 쓴다(클론 쪽은 DOM rect로 재는 게 더 정확하다).
//
// probe-segments.js 는 '가로 밴드'만 주므로 x·폭을 못 잰다. 이 도구가 그걸 채운다.
// probe-bands-all.js 는 분류용 점수일 뿐 판정 도구가 아니다(TODO ⚠️ 참조).
//
// 사용: PW_PATH=... node probe-box.js <이미지.png> <r,g,b> [허용오차=8] [y시작=0] [y끝=1] [최소면적=400]
//   예) 흰 팝업 카드:  node probe-box.js ref/screens/shot-043244.png 255,255,255 10 0.5 0.95
//   여러 덩어리가 잡히면 면적 큰 순으로 상위 5개를 찍는다 — 원하는 것을 골라 쓰면 된다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');

const FILE = process.argv[2];
if (!FILE) { console.error('사용: node probe-box.js <이미지.png> <r,g,b> [허용오차] [y0] [y1] [최소면적]'); process.exit(1); }
const RGB = (process.argv[3] || '255,255,255').split(',').map(Number);
const TOL = +(process.argv[4] || 8);
const Y0 = +(process.argv[5] || 0), Y1 = +(process.argv[6] || 1);
const MINA = +(process.argv[7] || 400);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(path.resolve(FILE)).toString('base64');
    const out = await page.evaluate(async ({ dataUrl, RGB, TOL, Y0, Y1, MINA }) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = dataUrl; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
        const y0 = Math.round(Y0 * H), y1 = Math.round(Y1 * H);
        const hit = new Uint8Array(W * H);
        for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (Math.abs(d[i] - RGB[0]) <= TOL && Math.abs(d[i + 1] - RGB[1]) <= TOL && Math.abs(d[i + 2] - RGB[2]) <= TOL) hit[y * W + x] = 1;
        }
        // 연결 성분(4방향 flood fill, 스택 기반 — 재귀는 큰 영역에서 스택이 터진다)
        const seen = new Uint8Array(W * H), out = [];
        for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
            const s = y * W + x;
            if (!hit[s] || seen[s]) continue;
            let minX = x, maxX = x, minY = y, maxY = y, n = 0;
            const st = [s]; seen[s] = 1;
            while (st.length) {
                const p = st.pop(), px = p % W, py = (p - px) / W;
                n++;
                if (px < minX) minX = px; if (px > maxX) maxX = px;
                if (py < minY) minY = py; if (py > maxY) maxY = py;
                if (px > 0 && hit[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; st.push(p - 1); }
                if (px < W - 1 && hit[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; st.push(p + 1); }
                if (py > y0 && hit[p - W] && !seen[p - W]) { seen[p - W] = 1; st.push(p - W); }
                if (py < y1 - 1 && hit[p + W] && !seen[p + W]) { seen[p + W] = 1; st.push(p + W); }
            }
            if (n >= MINA) out.push({
                n, px: `x${minX}..${maxX} y${minY}..${maxY} (${maxX - minX + 1}x${maxY - minY + 1})`,
                x: +(minX / W * 100).toFixed(2), w: +((maxX - minX + 1) / W * 100).toFixed(2),
                y: +(minY / H * 100).toFixed(2), h: +((maxY - minY + 1) / H * 100).toFixed(2),
                bot: +((maxY + 1) / H * 100).toFixed(2), right: +((maxX + 1) / W * 100).toFixed(2),
            });
        }
        out.sort((a, b) => b.n - a.n);
        return { size: [W, H], found: out.length, top: out.slice(0, 5) };
    }, { dataUrl, RGB, TOL, Y0, Y1, MINA });
    console.log(JSON.stringify(out, null, 1));
    await browser.close();
})();
