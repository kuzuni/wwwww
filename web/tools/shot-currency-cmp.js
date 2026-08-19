// 상단바 재화 아이콘(코인·젬) 원본↔클론 대조 — 양쪽 다 native 499px 캡처에서 같은 크기로 잘라
// 14배 최근접 확대해 나란히 붙인다. 화풍(키라인 두께·평면 채움)은 이 배율에서만 눈으로 갈린다.
// ⚠️ 확대는 **눈으로 볼 때만** 쓴다. 수치는 native 줄에서 재라(확대 보간이 두께를 흐린다).
// 사용: node shot-currency-cmp.js  → tools/currency-cmp.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const REF = path.resolve(__dirname, '../ref/screens/shot-042120.png');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, 'currency-cmp.png');
const VW = 499, VH = 892, Z = 14, CW = 40, CH = 40;

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
    // 클론 아이콘의 실제 자리는 DOM 에서 읽는다(pill 폭이 바뀌면 하드코딩 좌표가 조용히 어긋난다).
    const at = await page.evaluate(() => ['coin', 'gem'].map(k => {
        const el = document.querySelector(`.currency-pills .pill.${k} .ico`);
        const b = el.getBoundingClientRect();
        return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }));
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: VW, height: 70 } });

    const png = await page.evaluate(async ([refSrc, cloneSrc, spots, cw, ch, z]) => {
        const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
        const [ri, ci] = [await load(refSrc), await load(cloneSrc)];
        // 원본 코인·젬 중심(shot-042120 실측)
        const refAt = [{ x: 312, y: 30 }, { x: 407, y: 30 }];
        const c = document.createElement('canvas');
        c.width = cw * z * 2 + 24; c.height = ch * z * 2 + 24;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = false;
        x.fillStyle = '#20242c'; x.fillRect(0, 0, c.width, c.height);
        refAt.forEach((p, i) => x.drawImage(ri, p.x - cw / 2, p.y - ch / 2, cw, ch, i * (cw * z + 24), 0, cw * z, ch * z));
        spots.forEach((p, i) => x.drawImage(ci, p.x - cw / 2, p.y - ch / 2, cw, ch, i * (cw * z + 24), ch * z + 24, cw * z, ch * z));
        return c.toDataURL('image/png');
    }, ['data:image/png;base64,' + fs.readFileSync(REF).toString('base64'),
        'data:image/png;base64,' + shot.toString('base64'), at, CW, CH, Z]);
    fs.writeFileSync(OUT, Buffer.from(png.split(',')[1], 'base64'));
    console.log('wrote', OUT, '· 클론 아이콘 중심', JSON.stringify(at));
    await browser.close();
})();
