// 망치 조형 검수 — 타격/윈드업 자세를 **네이티브 92px** 과 **8배 확대** 로 나란히 찍는다.
// 비평가 지적 ⓑ(92px에서 외곽선이 머리 폭의 33%)·ⓒ(머리가 세로 블록이라 맬릿)를 눈으로 재보려면
// 확대만으로는 안 된다 — 판독성은 네이티브 크기에서만 판정되고, 조형은 확대에서만 보인다.
// 사용: node shot-hammer-form.js  → tools/hammer-form.png (+ hammer-form-1x.png)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const DUR = 720;                       // afswing 길이
const POSES = [                        // [라벨, afswing 진행률 %]
    ['windup1 8%', 8], ['hit1 24%', 24], ['recoil 29%', 29],
    ['windup3 74%', 74], ['hit3 90%', 90], ['dwell3 93%', 93],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 8 });
    const errors = [];
    page.on('pageerror', e => errors.push((e.stack || String(e)).split('\n').slice(0, 2).join(' | ')));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal, null, { timeout: 30000 });
    await page.evaluate(() => { if (typeof Combat !== 'undefined') Combat.tick = () => {}; });
    await page.evaluate(() => new Promise(res => {
        let last = performance.now(), stable = 0;
        const w = () => { const n = performance.now(); stable = (n - last) < 220 ? stable + 1 : 0; last = n;
            if (stable >= 10 || n > 20000) res(); else requestAnimationFrame(w); };
        requestAnimationFrame(w);
    }));
    // 3D 렌더를 비운다 — 소프트웨어 GL이 rAF마다 ~250ms를 잡아 캡처가 통째로 느려진다
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined' && Scene3D.renderer) Scene3D.renderer.render = () => {}; });
    await page.evaluate(() => { UI.openSheet && UI.openSheet('equip'); });
    await page.waitForSelector('.anvil-btn .anvil-svg', { timeout: 15000 });

    // 연출을 띄우고 애니메이션을 멈춘 뒤 자세만 갈아끼운다(자고 찍으면 프레임 시각이 거짓이 된다)
    await page.evaluate(() => { UI._anvilBusy = false; UI.playAnvilStrike(() => {});
        // ⚠️ 애니메이션만 pause 해선 부족하다 — playAnvilStrike 의 900ms 제거 타이머는 벽시계로 돌아,
        //    8배 캡처처럼 느린 촬영에서는 **뒤쪽 프레임이 찍힐 때 오버레이가 이미 지워져** 망치가
        //    통째로 사라진 채 찍힌다(실제로 그렇게 찍혔다). 타이머만 걷고 오버레이는 남긴다.
        (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = []; });
    await page.waitForSelector('.anvil-fx .af-hammer', { timeout: 10000 });

    const box = await page.locator('.anvil-btn').boundingBox();
    const pad = 30;
    const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad - 26), width: box.width + pad * 2, height: box.height + pad * 2 + 26 };
    const shots = [];
    for (const [label, pct] of POSES) {
        await page.evaluate(({ pct, DUR }) => {
            document.querySelectorAll('.anvil-fx *, .anvil-btn .anvil-svg').forEach(n =>
                n.getAnimations().forEach(a => { a.pause(); a.currentTime = DUR * pct / 100; }));
        }, { pct, DUR });
        shots.push([label, await page.screenshot({ clip })]);
    }
    // 네이티브 1배 — 판독성은 여기서만 판정한다
    const page1 = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    await page1.goto(INDEX, { waitUntil: 'load' });
    await page1.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal, null, { timeout: 30000 });
    await page1.evaluate(() => { if (typeof Combat !== 'undefined') Combat.tick = () => {}; });
    await page1.evaluate(() => { UI.openSheet && UI.openSheet('equip'); });
    await page1.waitForSelector('.anvil-btn .anvil-svg', { timeout: 15000 });
    await page1.evaluate(() => { UI._anvilBusy = false; UI.playAnvilStrike(() => {});
        // ⚠️ 애니메이션만 pause 해선 부족하다 — playAnvilStrike 의 900ms 제거 타이머는 벽시계로 돌아,
        //    8배 캡처처럼 느린 촬영에서는 **뒤쪽 프레임이 찍힐 때 오버레이가 이미 지워져** 망치가
        //    통째로 사라진 채 찍힌다(실제로 그렇게 찍혔다). 타이머만 걷고 오버레이는 남긴다.
        (UI._anvilTimers || []).forEach(clearTimeout); UI._anvilTimers = []; });
    await page1.waitForSelector('.anvil-fx .af-hammer', { timeout: 10000 });
    await page1.evaluate(({ DUR }) => {
        document.querySelectorAll('.anvil-fx *, .anvil-btn .anvil-svg').forEach(n =>
            n.getAnimations().forEach(a => { a.pause(); a.currentTime = DUR * 0.24; }));
    }, { DUR });
    const b1 = await page1.locator('.anvil-btn').boundingBox();
    await page1.screenshot({ path: path.join(__dirname, 'hammer-form-1x.png'),
        clip: { x: Math.max(0, b1.x - 8), y: Math.max(0, b1.y - 34), width: b1.width + 16, height: b1.height + 42 } });

    // 시트 조립
    const b64 = shots.map(([l, b]) => [l, 'data:image/png;base64,' + b.toString('base64')]);
    const sheet = await page.evaluate(async (items) => {
        const imgs = await Promise.all(items.map(([l, src]) => new Promise(r => { const i = new Image(); i.onload = () => r([l, i]); i.src = src; })));
        const W = imgs[0][1].width, H = imgs[0][1].height, COLS = 3, LBL = 46;
        const c = document.createElement('canvas');
        c.width = W * COLS; c.height = (H + LBL) * Math.ceil(imgs.length / COLS);
        const x = c.getContext('2d');
        x.fillStyle = '#12161c'; x.fillRect(0, 0, c.width, c.height);
        imgs.forEach(([l, im], i) => {
            const cx = (i % COLS) * W, cy = Math.floor(i / COLS) * (H + LBL);
            x.fillStyle = '#e8eef6'; x.font = '600 30px system-ui'; x.textAlign = 'center';
            x.fillText(l, cx + W / 2, cy + 32);
            x.drawImage(im, cx, cy + LBL);
        });
        return c.toDataURL('image/png');
    }, b64);
    fs.writeFileSync(path.join(__dirname, 'hammer-form.png'), Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(errors.length ? '✗ 콘솔 에러 ' + errors.length + '건: ' + errors[0] : '✓ 콘솔 에러 0건');
    console.log('→ tools/hammer-form.png (8×) / tools/hammer-form-1x.png (네이티브)');
    await browser.close();
})();
