// 채팅 전투 공유 배지(📹 자리) 클론 캡처 — 원본 shot-043500 의 같은 자리와 나란히 보려고 확대해 찍는다.
// 사용: PW_PATH=... node shot-chatcam.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const Z = 12;   // 확대 배율(원본 크롭과 같게)

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    await page.waitForTimeout(900);
    await page.evaluate(() => { UI.openChat(); });
    await page.waitForTimeout(700);
    // 공유 카드가 있는 행까지 스크롤
    await page.evaluate(() => {
        const cam = document.querySelector('.chat-share-cam');
        if (cam) cam.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(400);
    const box = await page.evaluate(() => {
        const cam = document.querySelector('.chat-share-cam');
        const card = document.querySelector('.chat-share-card');
        if (!cam) return null;
        const c = cam.getBoundingClientRect(), k = card.getBoundingClientRect();
        return { cam: [c.x, c.y, c.width, c.height], card: [k.x, k.y, k.width, k.height] };
    });
    if (!box) { console.log('공유 카드가 있는 행을 못 찾았다'); await browser.close(); process.exit(1); }
    const [cx, cy, cw, ch] = box.cam;
    console.log(`클론 배지  x${cx.toFixed(1)} y${cy.toFixed(1)} ${cw.toFixed(2)}×${ch.toFixed(2)}px`
        + ` = ${(cw / 499 * 100).toFixed(2)}×${(ch / 499 * 100).toFixed(2)}%W  (원본 19×19px = 3.81×3.81%W)`);
    const [kx, ky, kw, kh] = box.card;
    console.log(`클론 카드  x${kx.toFixed(1)} y${ky.toFixed(1)} ${kw.toFixed(2)}×${kh.toFixed(2)}px`
        + `  → 배지 우 오프셋 ${(cx + cw - (kx + kw)).toFixed(2)}px(원본 15) · 위 ${(ky - cy).toFixed(2)}px(원본 4)`);
    // 배지 주변을 원본 크롭과 같은 40×36 창으로 잘라 확대
    const X = Math.round(cx - 10), Y = Math.round(cy - 8);
    await page.screenshot({ path: '/tmp/_cam_raw.png', clip: { x: X, y: Y, width: 40, height: 36 } });
    const raw = 'data:image/png;base64,' + fs.readFileSync('/tmp/_cam_raw.png').toString('base64');
    const b64 = await page.evaluate(async ([src, z]) => {
        const img = new Image(); await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width * z; c.height = img.height * z;
        const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
        x.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL('image/png').split(',')[1];
    }, [raw, Z]);
    fs.writeFileSync(path.join(__dirname, 'chatcam-clone.png'), Buffer.from(b64, 'base64'));
    console.log('wrote tools/chatcam-clone.png · 콘솔 에러', errs.length, '건');
    await browser.close();
})();
