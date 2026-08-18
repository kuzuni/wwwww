// 메인 스테이지 맵 25종 컨택트 시트 — 사용: node shot-maps25.js [출력.png] [시작챕터] [끝챕터]
// `main-stage-25-maps` 검수용. `shot-biomes.js` 는 바이옴 6종 전용이라 챕터 팔레트가 안 실린다
// (같은 바이옴이라도 하늘·안개·지면 색이 달라 실제 화면은 전혀 다르게 보인다) — 여기서는
// `CHAPTER_THEMES` 를 그대로 태워 **게임에서 실제로 보게 될 25장**을 굽는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || 'maps25.png';
const FROM = parseInt(process.argv[3] || '1', 10);
const TO = parseInt(process.argv[4] || '25', 10);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // 결정론적 배치 — 프롭 위치·크기·변형이 전부 Math.random 이라 시드 없이는 전/후 대조가 안 된다
    await page.addInitScript(() => {
        let s = 0x51f3a7d;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof CHAPTER_THEMES !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(2000);

    const shots = [];
    for (let ch = FROM; ch <= TO; ch++) {
        const label = await page.evaluate((ch) => {
            Combat.tick = () => {};
            if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
            const t = CHAPTER_THEMES[ch - 1];
            Scene3D.setTheme(t);
            Scene3D.walking = false; Scene3D.worldX = 0;
            return ch + ' ' + (t.biome || 'forest');
        }, ch);
        await page.waitForTimeout(650);
        shots.push({ label, buf: await page.locator('#game3d').screenshot() });
    }

    const cols = Math.min(5, shots.length);
    const rows = Math.ceil(shots.length / cols);
    // 축소율은 SHEET_S 로 조절 — 25장 일람은 0.30, 결함 판독은 0.6~1.0 으로 올려 다시 굽는다.
    // ⚠️ page.evaluate 안은 브라우저 컨텍스트라 process.env 가 없다 — 반드시 인자로 넘길 것.
    const scale = +(process.env.SHEET_S || 0.30);
    const sheet = await page.evaluate(async ({ imgs, cols, rows, scale }) => {
        const W = 480, H = 854, S = scale;
        const tw = Math.round(W * S), th = Math.round(H * S), pad = 16;
        const cv = document.createElement('canvas');
        cv.width = tw * cols; cv.height = (th + pad) * rows;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#12161c'; cx.fillRect(0, 0, cv.width, cv.height);
        for (let i = 0; i < imgs.length; i++) {
            const im = new Image();
            await new Promise(r => { im.onload = r; im.src = imgs[i].src; });
            const x = (i % cols) * tw, y = Math.floor(i / cols) * (th + pad);
            cx.drawImage(im, x, y + pad, tw, th);
            cx.fillStyle = '#dfe6ee';
            cx.font = '11px sans-serif';
            cx.fillText(imgs[i].label, x + 4, y + 12);
        }
        return cv.toDataURL('image/png');
    }, { imgs: shots.map(s => ({ label: s.label, src: 'data:image/png;base64,' + s.buf.toString('base64') })), cols, rows, scale });
    fs.writeFileSync(OUT, Buffer.from(sheet.split(',')[1], 'base64'));
    await browser.close();
    console.log(`${OUT} 저장 · 맵 ${shots.length} · 콘솔 에러 ${errors.length}`);
    if (errors.length) { errors.slice(0, 8).forEach(e => console.log('  ' + e)); process.exit(1); }
})();
