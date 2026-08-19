// 모루 버튼을 **네이티브 크기(1배)로 찍고 최근접 확대**해 본다 — `anvil-ref` 판독성 확인용.
// 사용: node tools/shot-anvil-native.js  → tools/anvil-native-zoom.png
// 🚨 왜 따로 만드는가: 기존 `shot-anvil.js` 는 deviceScaleFactor 5 로 찍는다. 5배 그림에서
//    멋있는 디테일이 92px 에서는 통째로 사라지는 게 이 항목이 반복해서 밟은 함정이다
//    (TODO 메모: "캡처 도구가 92px 이 아니라 113px 로 찍고 있었다"). 여기서는 1배로 찍은
//    **진짜 픽셀**을 그대로 두고 확대만 해서, 눈이 네이티브 판독성을 그대로 보게 한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await p.waitForSelector('.anvil-btn', { timeout: 30000 });
    await p.waitForTimeout(900);

    const btn = await p.$('.anvil-btn');
    const bb = await btn.boundingBox();
    const shot = (await btn.screenshot({ timeout: 60000 })).toString('base64');
    console.log('네이티브 모루 버튼 %dx%d px', Math.round(bb.width), Math.round(bb.height));

    await p.evaluate(async (src) => {
        const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
        const Z = 6;
        const cv = document.createElement('canvas');
        cv.id = 'zoom'; cv.width = im.width * Z; cv.height = im.height * Z;
        Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, background: '#2a2f36' });
        const ctx = cv.getContext('2d');
        ctx.imageSmoothingEnabled = false;      // 최근접 — 보간하면 없는 디테일이 생긴 것처럼 보인다
        ctx.drawImage(im, 0, 0, cv.width, cv.height);
        document.body.appendChild(cv);
    }, shot);

    const el = await p.$('#zoom');
    const zb = await el.boundingBox();
    await p.setViewportSize({ width: Math.ceil(zb.width), height: Math.ceil(zb.height) });
    await el.screenshot({ path: path.resolve(__dirname, 'anvil-native-zoom.png'), timeout: 60000 });
    console.log('anvil-native-zoom.png 저장 ' + (errors.length ? '⚠️ 콘솔 에러 ' + errors.length : '(no console errors)'));
    await b.close();
    process.exit(errors.length ? 1 : 0);
})();
