// 팝업 흰 카드의 바운딩 박스를 색으로 찾아 %W/%H로 찍는다 — 비율 전수 검증 패스에서
// '카드가 원본과 같은 자리·같은 크기인가'를 원본 PNG와 클론 PNG 양쪽에서 같은 방법으로 재는 도구.
// (probe-segments.js는 가로 밴드만, probe-rows-dark.js는 글자줄만 준다. 카드 자체의 x·폭은 이걸로 잰다.)
// 방법: 밝기 ≥ 임계인 픽셀이 '가로로 길게 이어지는' 행만 카드 행으로 보고, 그 행들의 흰 구간 x범위를 모은다.
// 사용: node probe-card-box.js <이미지.png> [밝기임계=232] [행최소흰비율=0.22]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

(async () => {
    const [file, lum = '232', minFrac = '0.22'] = process.argv.slice(2);
    if (!file) { console.error('사용: node probe-card-box.js <이미지.png> [밝기임계] [행최소흰비율]'); process.exit(2); }
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    const out = await page.evaluate(async ({ dataUrl, lum, minFrac }) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = dataUrl; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
        const rows = [];
        for (let y = 0; y < H; y++) {
            let n = 0, min = -1, max = -1;
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                if ((d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) >= lum) { n++; if (min < 0) min = x; max = x; }
            }
            rows.push({ n: n / W, min, max });
        }
        // 흰 비율이 임계를 넘는 연속 행 구간 중 가장 긴 것 = 카드
        const bands = [];
        let s = -1;
        for (let y = 0; y < H; y++) {
            if (rows[y].n >= minFrac) { if (s < 0) s = y; }
            else if (s >= 0) { bands.push([s, y - 1]); s = -1; }
        }
        if (s >= 0) bands.push([s, H - 1]);
        bands.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
        const [y0, y1] = bands[0] || [0, 0];
        let x0 = W, x1 = 0;
        for (let y = y0; y <= y1; y++) { if (rows[y].min >= 0) { x0 = Math.min(x0, rows[y].min); x1 = Math.max(x1, rows[y].max); } }
        return { W, H, y0, y1, x0, x1, others: bands.slice(1, 4).map(([a, b]) => [a, b]) };
    }, { dataUrl, lum: +lum, minFrac: +minFrac });
    const { W, H } = out;
    const pc = (v, t) => (v / t * 100).toFixed(2);
    console.log(`${file}  ${W}x${H}  밝기≥${lum} 행흰비율≥${minFrac}`);
    console.log(`  카드  x ${pc(out.x0, W)}% ~ ${pc(out.x1 + 1, W)}%  (폭 ${pc(out.x1 + 1 - out.x0, W)}%W)`);
    console.log(`        y ${pc(out.y0, H)}% ~ ${pc(out.y1 + 1, H)}%  (높이 ${pc(out.y1 + 1 - out.y0, H)}%H)`);
    if (out.others.length) console.log('  (다른 흰 구간: ' + out.others.map(([a, b]) => `${pc(a, H)}~${pc(b + 1, H)}%`).join(', ') + ')');
    await browser.close();
})();
