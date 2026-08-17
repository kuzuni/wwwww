// 행별 '어두운 픽셀 비율' 프로파일 — 흰 카드 위의 텍스트/버튼처럼 얇은 요소의 세로 위치를 잡는다.
// probe-segments.js는 행 평균색이 바뀌는 지점만 잡아 얇은 글자 줄을 놓치므로, 글자 줄을 재려면 이걸 쓴다.
// 사용: node probe-rows-dark.js <이미지.png> [x시작=0.30] [x끝=0.70] [밝기임계=140] [비율임계=0.02]
//   출력: 어두운 픽셀 비율이 임계를 넘는 연속 구간을 %H로 나열 (시작·끝·높이·최대비율)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

(async () => {
    const [file, x0 = '0.30', x1 = '0.70', lum = '140', ratio = '0.02'] = process.argv.slice(2);
    if (!file) { console.error('사용: node probe-rows-dark.js <이미지.png> [x0] [x1] [밝기] [비율]'); process.exit(2); }
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    const out = await page.evaluate(async ({ dataUrl, x0, x1, lum, ratio }) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = dataUrl; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
        const xa = Math.round(W * x0), xb = Math.round(W * x1);
        const prof = [];
        for (let y = 0; y < H; y++) {
            let dark = 0;
            for (let x = xa; x < xb; x++) {
                const i = (y * W + x) * 4;
                if ((d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) < lum) dark++;
            }
            prof.push(dark / (xb - xa));
        }
        const bands = [];
        let s = -1, peak = 0;
        for (let y = 0; y < H; y++) {
            if (prof[y] >= ratio) { if (s < 0) { s = y; peak = 0; } peak = Math.max(peak, prof[y]); }
            else if (s >= 0) { bands.push([s, y - 1, peak]); s = -1; }
        }
        if (s >= 0) bands.push([s, H - 1, peak]);
        return { W, H, bands };
    }, { dataUrl, x0: +x0, x1: +x1, lum: +lum, ratio: +ratio });
    console.log(`${file}  ${out.W}x${out.H}  x=${x0}~${x1} 밝기<${lum} 비율≥${ratio}`);
    for (const [a, b, p] of out.bands) {
        console.log(`  ${(a / out.H * 100).toFixed(2)}% ~ ${((b + 1) / out.H * 100).toFixed(2)}%  h=${(b - a + 1)}px (${((b - a + 1) / out.H * 100).toFixed(2)}%H)  최대비율 ${(p * 100).toFixed(1)}%`);
    }
    await browser.close();
})();
