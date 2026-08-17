// 원본 리그 스크린샷(shot-042149)에서 요소 바운딩 박스를 색으로 직접 찾아 %W/%H로 뽑는다.
// probe-segments.js 는 '가로 밴드'만 주므로 x/폭(버튼 폭 등)을 못 잰다 — 이 도구가 그걸 채운다.
// 클론 쪽 대응값은 probe-league-dom.js(DOM rect)로 재서 나란히 비교할 것.
// 사용: PW_PATH=... node probe-league-px.js [이미지=ref/screens/shot-042149.png]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');

const FILE = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042149.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(FILE).toString('base64');
    const out = await page.evaluate(async (dataUrl) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = dataUrl; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const near = (p, q, tol) => Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol;
        // 색 하나의 바운딩 박스 — y구간을 제한해 같은 색이 여러 곳에 있어도 원하는 것만 잡는다.
        const box = (rgb, tol, y0, y1) => {
            let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
            for (let y = Math.round(y0 * H); y < Math.round(y1 * H); y++)
                for (let x = 0; x < W; x++)
                    if (near(at(x, y), rgb, tol)) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
            if (n === 0) return null;
            return {
                px: `x${minX}..${maxX} y${minY}..${maxY} (${maxX - minX + 1}x${maxY - minY + 1})`,
                x: +(minX / W * 100).toFixed(2), w: +((maxX - minX + 1) / W * 100).toFixed(2),
                y: +(minY / H * 100).toFixed(2), h: +((maxY - minY + 1) / H * 100).toFixed(2),
                bot: +((maxY + 1) / H * 100).toFixed(2), n,
            };
        };
        // 특정 y행에서 색이 바뀌는 x 지점 나열 — 버튼 좌우 끝을 눈으로 짝지어 확인할 때 쓴다.
        const rowRuns = (yFrac, minRun) => {
            const y = Math.round(yFrac * H), runs = [];
            let sx = 0, cur = at(0, y);
            for (let x = 1; x <= W; x++) {
                const p = x < W ? at(x, y) : null;
                if (!p || !near(p, cur, 10)) {
                    if (x - sx >= minRun) runs.push({ x: +(sx / W * 100).toFixed(2), w: +((x - sx) / W * 100).toFixed(2), rgb: cur.join(',') });
                    sx = x; cur = p;
                }
            }
            return runs;
        };
        return {
            size: [W, H],
            // 랭킹 행(어두운 카드) 전체 덩어리 — 목록 좌우 인셋과 상/하단
            rowsDark: box([5, 6, 10], 6, 0.15, 0.74),
            // 내 행(파랑) — 목록 안 + 하단 고정 두 군데라 y로 나눠 잡는다
            meInList: box([0, 93, 255], 12, 0.40, 0.52),
            mePinned: box([0, 93, 255], 12, 0.72, 0.82),
            // 회색 푸터 밴드
            grayFoot: box([175, 175, 175], 6, 0.70, 0.95),
            // 도전 버튼(파랑) — 회색 밴드 안
            btn: box([0, 93, 255], 12, 0.815, 0.905),
            // 버튼 y중앙 가로 스캔 / 랭킹 행 y중앙 가로 스캔
            runsBtn: rowRuns(0.86, 6),
            runsRow: rowRuns(0.24, 6),
            runsFootTop: rowRuns(0.755, 6),
        };
    }, dataUrl);
    console.log(JSON.stringify(out, null, 1));
    await browser.close();
})();
