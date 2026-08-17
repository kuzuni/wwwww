// 원본 shot-042120 메인 장비 셀 안에서 '아이콘 그림'이 차지하는 비율 실측.
// 1) 셀 격자 검출: 하단 패널 밝은 회색(#e8e4e0 계열)이 아닌 = 셀 영역으로 보고 행/열 런을 잡는다.
// 2) 셀 안에서 배경(시대색+스트라이프)/테두리/Lv배지/별이 아닌 픽셀 = 아이콘 그림.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
// 인자로 다른 PNG(클론 캡처)도 잴 수 있다 — 원본/클론을 같은 자로 재야 비교가 성립한다.
const IMG = path.resolve(process.argv[2] || path.join(__dirname, '../ref/screens/shot-042120.png'));

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
    const d64 = 'data:image/png;base64,' + fs.readFileSync(IMG).toString('base64');
    const out = await page.evaluate(async (src) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const D = g.getImageData(0, 0, c.width, c.height).data;
        const px = (x, y) => { const i = (y * c.width + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
        // 패널 바탕(밝은 회색/베이지)
        const isPanel = ([r, gg, b]) => r > 195 && gg > 190 && b > 185;

        // --- 행 밴드: 패널이 아닌 픽셀이 폭 전체에 걸쳐 많은 행 ---
        const rowNon = [];
        for (let y = 490; y < 690; y++) {
            let n = 0;
            for (let x = 55; x < 445; x++) if (!isPanel(px(x, y))) n++;
            rowNon.push([y, n]);
        }
        const bands = []; let cur = null;
        for (const [y, n] of rowNon) {
            if (n > 200) { if (!cur) cur = [y, y]; else cur[1] = y; }
            else { if (cur && cur[1] - cur[0] > 25) bands.push(cur); cur = null; }
        }
        if (cur && cur[1] - cur[0] > 25) bands.push(cur);

        // --- 각 밴드 안 열 런 ---
        const cells = [];
        for (const [y0, y1] of bands) {
            const cols = [];
            for (let x = 0; x < c.width; x++) {
                let n = 0;
                for (let y = y0; y <= y1; y++) if (!isPanel(px(x, y))) n++;
                cols.push(n > (y1 - y0) * 0.6 ? 1 : 0);
            }
            let s = null;
            for (let x = 0; x <= c.width; x++) {
                const v = x < c.width ? cols[x] : 0;
                if (v && s === null) s = x;
                else if (!v && s !== null) { if (x - s > 30) cells.push({ x0: s, x1: x - 1, y0, y1 }); s = null; }
            }
        }

        // --- 셀 안 아이콘 바운딩 박스 ---
        const res = cells.map(cell => {
            const w = cell.x1 - cell.x0 + 1, h = cell.y1 - cell.y0 + 1;
            const ix0 = cell.x0 + 5, ix1 = cell.x1 - 5, iy0 = cell.y0 + 5, iy1 = cell.y1 - 5;
            // 셀 배경색 = 셀 좌상단 안쪽 영역의 최빈색으로 추정
            const hist = {};
            for (let y = iy0; y < iy0 + 8; y++) for (let x = ix0; x < ix0 + 8; x++) {
                const p = px(x, y); const k = p.join(','); hist[k] = (hist[k] || 0) + 1;
            }
            const bg = Object.entries(hist).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
            const near = (p, q, t) => Math.abs(p[0] - q[0]) < t && Math.abs(p[1] - q[1]) < t && Math.abs(p[2] - q[2]) < t;
            // 스트라이프는 bg를 약간 어둡게 한 색 → bg 대비 밝기만 낮은 계열도 배경 취급
            const isBg = p => near(p, bg, 26) || (Math.abs(p[0] - bg[0] * 0.82) < 22 && Math.abs(p[1] - bg[1] * 0.82) < 22 && Math.abs(p[2] - bg[2] * 0.82) < 22);
            let minx = 1e9, maxx = -1, miny = 1e9, maxy = -1, cnt = 0;
            const rowHit = {};
            for (let y = iy0; y <= iy1; y++) {
                for (let x = ix0; x <= ix1; x++) {
                    const p = px(x, y);
                    if (isBg(p)) continue;
                    cnt++; rowHit[y] = (rowHit[y] || 0) + 1;
                    if (x < minx) minx = x; if (x > maxx) maxx = x;
                    if (y < miny) miny = y; if (y > maxy) maxy = y;
                }
            }
            return {
                cell: { x: cell.x0, y: cell.y0, w, h }, bg,
                icon: maxx < 0 ? null : { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 },
                fillW: maxx < 0 ? 0 : +(((maxx - minx + 1) / w) * 100).toFixed(1),
                fillH: maxy < 0 ? 0 : +(((maxy - miny + 1) / h) * 100).toFixed(1),
                rowHit,
            };
        });
        return { imgW: c.width, imgH: c.height, bands, cells: res };
    }, d64);

    console.log('image', out.imgW + 'x' + out.imgH, 'bands', JSON.stringify(out.bands));
    out.cells.forEach((r, i) => {
        console.log(`#${i} cell ${r.cell.w}x${r.cell.h} @${r.cell.x},${r.cell.y} bg[${r.bg}]  icon ${r.icon ? r.icon.w + 'x' + r.icon.h + ' @' + r.icon.x + ',' + r.icon.y : '-'}  fillW ${r.fillW}%  fillH ${r.fillH}%`);
    });
    if (process.env.ROWS) {
        const t = out.cells[+process.env.ROWS];
        console.log('rowHit', JSON.stringify(t.rowHit));
    }
    await browser.close();
})();
