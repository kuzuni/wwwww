// 채팅 화면(shot-043500) 가로 비율 실측 — 비율 전수 검증 패스(TODO ②)
//
// 왜 전용 도구인가: 채팅 원본은 **499×804**로 다른 shot(499×892)과 세로가 달라(하단 크롭)
// %H를 그대로 비교하면 계통 오차가 난다. 가로는 양쪽 499로 같으므로 **%W가 유일하게 신뢰할 수 있는 축**이고,
// 이 화면의 알려진 결함(좌우 여백 비대칭)도 가로 문제다. 그래서 '지정한 y행의 색 구간(x-run)'만 뽑는다.
//
// 사용: PW_PATH=... node probe-chat.js <이미지.png> <y1,y2,...> [최소길이=6]
//   각 y행에 대해 색이 바뀌는 x 경계를 %W와 px로 나열한다.
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs'), path = require('path');

const FILE = process.argv[2];
const YS = (process.argv[3] || '').split(',').filter(Boolean).map(Number);
const MINLEN = +(process.argv[4] || 6);
if (!FILE || !YS.length) { console.error('사용: node probe-chat.js <이미지.png> <y1,y2,...> [최소길이]'); process.exit(1); }

(async () => {
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(path.resolve(FILE)).toString('base64');
    const out = await page.evaluate(async ({ dataUrl, YS, MINLEN }) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = dataUrl; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const near = (a, b, t) => Math.abs(a[0] - b[0]) <= t && Math.abs(a[1] - b[1]) <= t && Math.abs(a[2] - b[2]) <= t;
        const res = { W, H, rows: [] };
        for (const y of YS) {
            if (y < 0 || y >= H) { res.rows.push({ y, err: '범위 밖' }); continue; }
            const runs = [];
            let start = 0, cur = at(0, y);
            for (let x = 1; x <= W; x++) {
                const px = x < W ? at(x, y) : null;
                if (px && near(px, cur, 10)) continue;
                if (x - start >= MINLEN) runs.push({ x0: start, x1: x - 1, len: x - start, rgb: cur });
                start = x; cur = px;
            }
            res.rows.push({ y, runs });
        }
        return res;
    }, { dataUrl, YS, MINLEN });
    const pw = v => (v / out.W * 100).toFixed(2);
    console.log(`${path.basename(FILE)}  ${out.W}×${out.H}`);
    for (const r of out.rows) {
        if (r.err) { console.log(` y=${r.y}: ${r.err}`); continue; }
        console.log(` y=${r.y} (${(r.y / out.H * 100).toFixed(2)}%H)`);
        for (const s of r.runs) console.log(`   x ${String(s.x0).padStart(3)}~${String(s.x1).padStart(3)}  ${pw(s.x0).padStart(6)}~${pw(s.x1 + 1).padStart(6)}%W  w=${pw(s.len).padStart(5)}%W  rgb(${s.rgb.join(',')})`);
    }
    await browser.close();
})();
