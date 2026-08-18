// 원본 스크린샷(ref/screens/shot-042120.png)의 '셀 대비 장비 아이콘 크기' 실측
// 사용: PW_PATH=<playwright 경로> node measure-ref-cells.js [png경로]
// 방법: 셀 박스를 좌표로 주고, 셀 안에서
//   - 배경 = 진한 적갈색(줄무늬 두 톤) / 밝은 패널
//   - Lv 텍스트·⭐ = 흰(또는 노랑) 코어 + 주변 3px 아웃라인 → 마스킹해서 제외
//   - 나머지 = 아이콘 잉크 → bbox
// 출력: 셀(테두리 포함) 대비 아이콘 폭·높이 %
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const PNG = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042120.png');
// 원본 shot-042120 장비 그리드 셀 박스(테두리 포함, 자동 검출 결과)
const CELLS = [
    ['1-1 발톱', 62, 514, 67, 68], ['1-2 갑옷', 137, 514, 68, 68], ['1-3 총', 215, 514, 67, 68],
    ['1-4 투구', 292, 514, 67, 68], ['1-5 목걸이', 369, 514, 67, 68],
    ['2-1 삼지창', 62, 591, 67, 68], ['2-2 건틀릿', 137, 591, 68, 68], ['2-3 가면', 215, 591, 67, 68],
];

(async () => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(PNG).toString('base64');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const res = await page.evaluate(async ([src, cells, MASKPX]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.getElementById('c');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const D = ctx.getImageData(0, 0, c.width, c.height).data;
        const W = c.width;
        const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
        const maroon = (x, y) => { const [r, g, b] = at(x, y); return r > g + 10 && r > b + 10 && r >= 50 && r <= 165 && g < 115 && b < 115; };
        const lightp = (x, y) => { const [r, g, b] = at(x, y); return r > 172 && g > 172 && b > 172 && Math.abs(r - g) < 25 && Math.abs(g - b) < 25; };
        const textCore = (x, y) => {
            const [r, g, b] = at(x, y);
            const white = r > 200 && g > 200 && b > 200;
            const star = r > 200 && g > 140 && g < 205 && b < 110; // ⭐ 주황
            return white || star;
        };
        return cells.map(([name, X, Y, Wc, Hc]) => {
            // 텍스트 마스크(코어 + 3px 팽창)
            const M = MASKPX;
            const mask = new Uint8Array(Wc * Hc);
            for (let y = 0; y < Hc; y++) for (let x = 0; x < Wc; x++) {
                if (textCore(X + x, Y + y)) {
                    for (let dy = -M; dy <= M; dy++) for (let dx = -M; dx <= M; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && ny >= 0 && nx < Wc && ny < Hc) mask[ny * Wc + nx] = 1;
                    }
                }
            }
            // 테두리 두께: 좌측 중앙에서 어두운 픽셀이 이어지는 길이
            const midY = Y + (Hc >> 1);
            let bw = 0;
            while (bw < 10) { const [r, g, b] = at(X + bw, midY); if (r < 60 && g < 60 && b < 60) bw++; else break; }
            const pad = bw + 1;
            const il = X + pad, ir = X + Wc - 1 - pad, it = Y + pad, ib = Y + Hc - 1 - pad;
            const ink = (x, y) => !maroon(x, y) && !lightp(x, y) && !mask[(y - Y) * Wc + (x - X)];
            let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
            const rowN = [];
            for (let y = it; y <= ib; y++) {
                let rn = 0;
                for (let x = il; x <= ir; x++) if (ink(x, y)) rn++;
                rowN.push(rn);
            }
            // 잡음 억제: 한 줄에 2px 미만이면 무시
            for (let y = it; y <= ib; y++) {
                if (rowN[y - it] < 2) continue;
                for (let x = il; x <= ir; x++) if (ink(x, y)) {
                    n++;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
            }
            const iw = maxX - minX + 1, ih = maxY - minY + 1;
            return {
                name, cellW: Wc, cellH: Hc, border: bw, ink: n,
                iconW: iw, iconH: ih,
                pctW: +((iw / Wc) * 100).toFixed(1), pctH: +((ih / Hc) * 100).toFixed(1),
                topPct: +(((minY - Y) / Hc) * 100).toFixed(1), botPct: +(((maxY - Y + 1) / Hc) * 100).toFixed(1),
                pctInnerW: +((iw / (Wc - 2 * pad)) * 100).toFixed(1), pctInnerH: +((ih / (Hc - 2 * pad)) * 100).toFixed(1),
            };
        });
    }, [dataUrl, CELLS, +(process.env.MASK || 5)]);
    await browser.close();
    let sw = 0, sh = 0;
    for (const r of res) {
        console.log(`${r.name.padEnd(10)} cell ${r.cellW}x${r.cellH} border=${r.border} icon ${r.iconW}x${r.iconH}  셀대비 W=${r.pctW}% H=${r.pctH}%  (내부대비 ${r.pctInnerW}%x${r.pctInnerH}%)  top=${r.topPct}% bot=${r.botPct}%`);
        sw += r.pctW; sh += r.pctH;
    }
    console.log(`\n평균: 셀 대비 폭 ${(sw / res.length).toFixed(1)}%, 높이 ${(sh / res.length).toFixed(1)}%`);
    const ws = res.map(r => r.pctW).sort((a, b) => a - b), hs = res.map(r => r.pctH).sort((a, b) => a - b);
    console.log(`중앙값: 폭 ${ws[ws.length >> 1]}%, 높이 ${hs[hs.length >> 1]}%   최대: 폭 ${ws[ws.length - 1]}%, 높이 ${hs[hs.length - 1]}%`);
})();
