// 모루 타격 연속 프레임 — 0~920ms 를 40ms 간격 24컷으로 **결정론적으로** 찍는다(비평가 채점용).
// 자고 찍으면 소프트웨어 GL 에서 프레임 시각이 통째로 거짓이 되므로, 모든 애니메이션을 pause 한 뒤
// currentTime 을 절대 시각으로 밀어 넣는다(afswing·afexit·anvilbump·sheetshake·링/섬광/불티가
// 전부 같은 시각에 시작하므로 절대 ms 하나로 맞는다).
// ⚠️ playAnvilStrike 의 900ms 제거 타이머는 반드시 걷을 것 — 안 걷으면 뒤쪽 컷이 찍힐 때
//    오버레이가 이미 지워져 망치가 사라진 채 찍힌다(실제로 그렇게 찍힌 적이 있다).
// 사용: node shot-anvil-seq.js  → tools/anvil-seq.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const STEP = 40, N = 24;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 4 });
    const errors = [];
    page.on('pageerror', e => errors.push((e.stack || String(e)).split('\n').slice(0, 2).join(' | ')));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal, null, { timeout: 30000 });
    await page.evaluate(() => { if (typeof Combat !== 'undefined') Combat.tick = () => {}; if (typeof Scene3D !== 'undefined' && Scene3D.renderer) Scene3D.renderer.render = () => {}; });
    await page.evaluate(() => { UI.openSheet && UI.openSheet('equip'); });
    await page.waitForSelector('.anvil-btn .anvil-svg', { timeout: 20000 });
    await page.evaluate(() => {
        UI._anvilBusy = false; UI.playAnvilStrike(() => {});
        (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = [];
    });
    await page.waitForSelector('.anvil-fx .af-hammer', { timeout: 15000 });

    // 크롭은 **정지 상태**의 모루 상자에서 따고 고정한다 — 프레임마다 다시 재면 흔들림만큼
    // 크롭이 같이 따라가 화면 흔들림이 캡처에서 사라진다(연출을 못 보게 만드는 자책골).
    await page.evaluate(() => document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n => n.getAnimations().forEach(a => { a.pause(); a.currentTime = 0; })));
    const box = await page.locator('.anvil-btn').boundingBox();
    const clip = { x: Math.max(0, box.x - 26), y: Math.max(0, box.y - 46), width: box.width + 52, height: box.height + 62 };

    const shots = [];
    for (let i = 0; i < N; i++) {
        const t = i * STEP;
        await page.evaluate((t) => document.querySelectorAll('#equip-sheet, #equip-sheet *').forEach(n =>
            n.getAnimations().forEach(a => { a.pause(); a.currentTime = t; })), t);
        shots.push([`${t}ms`, await page.screenshot({ clip })]);
    }

    const b64 = shots.map(([l, b]) => [l, 'data:image/png;base64,' + b.toString('base64')]);
    const sheet = await page.evaluate(async (items) => {
        const imgs = await Promise.all(items.map(([l, src]) => new Promise(r => { const i = new Image(); i.onload = () => r([l, i]); i.src = src; })));
        const W = imgs[0][1].width, H = imgs[0][1].height, COLS = 6, LBL = 34;
        const c = document.createElement('canvas');
        c.width = W * COLS; c.height = (H + LBL) * Math.ceil(imgs.length / COLS);
        const x = c.getContext('2d');
        x.fillStyle = '#0f1319'; x.fillRect(0, 0, c.width, c.height);
        imgs.forEach(([l, im], i) => {
            const cx = (i % COLS) * W, cy = Math.floor(i / COLS) * (H + LBL);
            x.fillStyle = '#dce6f2'; x.font = '600 22px system-ui'; x.textAlign = 'center';
            x.fillText(l, cx + W / 2, cy + 24);
            x.drawImage(im, cx, cy + LBL);
        });
        return c.toDataURL('image/png');
    }, b64);
    fs.writeFileSync(path.join(__dirname, 'anvil-seq.png'), Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(errors.length ? '✗ 콘솔 에러 ' + errors.length + '건: ' + errors[0] : '✓ 콘솔 에러 0건');
    console.log(`→ tools/anvil-seq.png (${N}컷 × ${STEP}ms)`);
    await browser.close();
})();
