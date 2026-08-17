// 원본 스크린샷 일부를 잘라 확대 저장 (실측 눈확인용)
// 사용: PW_PATH=... node crop-ref.js <png> <x> <y> <w> <h> <scale> <out.png>
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const [png, x, y, w, h, scale, out] = process.argv.slice(2);
(async () => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(png).toString('base64');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const b64 = await page.evaluate(async ([src, x, y, w, h, s]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.getElementById('c');
        c.width = w * s; c.height = h * s;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x, y, w, h, 0, 0, w * s, h * s);
        return c.toDataURL('image/png').split(',')[1];
    }, [dataUrl, +x, +y, +w, +h, +scale]);
    await browser.close();
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log('wrote', out);
})();
