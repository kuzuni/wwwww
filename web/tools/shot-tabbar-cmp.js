// 탭바 아이콘 원본↔클론 나란히 대조 시트 — **양쪽 다 native 499px 폭**에서 잘라 붙이고,
// 판정용으로 3배 확대한 줄을 아래에 덧붙인다(확대는 눈으로 볼 때만 쓰고 수치는 native 줄에서 잰다.
// 확대 보간이 원본은 흐리게·클론은 선명하게 만들어 두께가 어긋나 보이는 게 화풍 오측정의 단골 원인이다).
// 사용: node shot-tabbar-cmp.js  → tools/tabbar-cmp.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const REF = path.resolve(__dirname, '../ref/screens/shot-042120.png');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, 'tabbar-cmp.png');
const VW = 499, VH = 892, ZOOM = 3;

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined"');
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () { }; if (typeof Combat !== 'undefined') Combat.tick = function () { }; });
    await page.waitForTimeout(400);
    await page.addStyleTag({ content: '#tabbar button span{visibility:hidden!important}' });
    const bar = await page.evaluate(() => { const b = document.getElementById('tabbar').getBoundingClientRect(); return { y: b.top, h: b.height }; });
    const shot = await page.screenshot({ clip: { x: 0, y: bar.y, width: VW, height: bar.h } });

    const png = await page.evaluate(async ([refSrc, cloneSrc, W, z]) => {
        const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
        const [ri, ci] = [await load(refSrc), await load(cloneSrc)];
        const rh = 81, ry = 808;                       // 원본 탭바 밴드
        const c = document.createElement('canvas');
        c.width = W * z;
        c.height = (rh + ci.height) * z + (rh + ci.height) + 24;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = false;               // 확대는 최근접 — 보간이 두께를 흐리지 않게
        x.fillStyle = '#20242c'; x.fillRect(0, 0, c.width, c.height);
        let y = 0;
        x.drawImage(ri, 0, ry, W, rh, 0, y, W, rh); y += rh + 4;          // native 원본
        x.drawImage(ci, 0, 0, W, ci.height, 0, y, W, ci.height); y += ci.height + 16;  // native 클론
        x.drawImage(ri, 0, ry, W, rh, 0, y, W * z, rh * z); y += rh * z + 4;           // ×3 원본
        x.drawImage(ci, 0, 0, W, ci.height, 0, y, W * z, ci.height * z);               // ×3 클론
        return c.toDataURL('image/png');
    }, ['data:image/png;base64,' + fs.readFileSync(REF).toString('base64'),
        'data:image/png;base64,' + shot.toString('base64'), VW, ZOOM]);
    fs.writeFileSync(OUT, Buffer.from(png.split(',')[1], 'base64'));
    console.log('wrote', OUT);
    await browser.close();
})();
