// 화면 캡처의 한 구역을 잘라 정수배 확대해 저장한다 — 비평가 지적을 **눈이 아니라 확대 픽셀로**
// 교차검증할 때 쓴다(TODO '비평가 채점 함정': 현상은 맞아도 원인 귀속이 틀린 경우가 잦다).
// 사용: node crop-zoom.js <입력.png> <x> <y> <w> <h> <배율> <출력.png>
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

(async () => {
    const [file, x, y, w, h, k = '4', out = 'zoom.png'] = process.argv.slice(2);
    if (!file) { console.error('사용: node crop-zoom.js <입력.png> <x> <y> <w> <h> <배율> <출력.png>'); process.exit(2); }
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    const b64 = await page.evaluate(async (a) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = a.dataUrl; });
        const c = document.createElement('canvas');
        c.width = a.w * a.k; c.height = a.h * a.k;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;   // 최근접 — 원 픽셀을 그대로 키운다
        g.drawImage(img, a.x, a.y, a.w, a.h, 0, 0, c.width, c.height);
        return c.toDataURL('image/png').split(',')[1];
    }, { dataUrl, x: +x, y: +y, w: +w, h: +h, k: +k });
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log(`저장 ${out} — ${file} (${x},${y}) ${w}x${h} ×${k}`);
    await browser.close();
})();
