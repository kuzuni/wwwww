// 바이옴 소품 컨택트 시트 — 사용: node shot-biomes.js [출력파일] [바이옴]
// TODO '맵 프롭 퀄리티 업'(slug: map-props) 전용 검수 도구.
// 챕터 테마를 갈아끼워 6개 바이옴(forest·desert·rock·snow·magic·lava)의 실제 인게임 화면을
// 한 장으로 굽는다. 프롭은 `buildProps()` 가 Math.random 으로 배치하므로 **시드를 고정**하지 않으면
// 전/후 비교가 성립하지 않는다(같은 코드로 찍어도 나무 위치가 매번 달라진다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || 'biomes.png';
const ONLY = process.argv[3] || '';

const BIOMES = [
    { biome: 'forest', sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 },
    { biome: 'desert', sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b },
    { biome: 'rock', sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x6b6157 },
    { biome: 'snow', sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, celestial: 'moon' },
    { biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, celestial: 'moon' },
    { biome: 'lava', sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17 },
];

(async () => {
    const list = ONLY ? BIOMES.filter(b => b.biome === ONLY) : BIOMES;
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
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(2000);

    const shots = [];
    for (const t of list) {
        await page.evaluate((t) => {
            Combat.tick = () => {};
            if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
            Scene3D.setTheme(t);
            Scene3D.walking = false; Scene3D.worldX = 0;
        }, t);
        await page.waitForTimeout(700);
        shots.push({ biome: t.biome, buf: await page.locator('#game3d').screenshot() });
    }

    // 세로 480×854 를 6장 → 3열 2행
    const cols = Math.min(3, shots.length);
    const rows = Math.ceil(shots.length / cols);
    const sheet = await page.evaluate(async ({ imgs, cols, rows }) => {
        const W = 480, H = 854, S = 0.62;   // 62% 축소 — 6장이 한 화면에 들어오게
        const cv = document.createElement('canvas');
        cv.width = W * S * cols; cv.height = H * S * rows;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#12161c'; cx.fillRect(0, 0, cv.width, cv.height);
        for (let i = 0; i < imgs.length; i++) {
            const im = new Image();
            await new Promise(res => { im.onload = res; im.onerror = res; im.src = imgs[i].url; });
            cx.drawImage(im, (i % cols) * W * S, ((i / cols) | 0) * H * S, W * S, H * S);
            cx.fillStyle = '#ffe082'; cx.font = 'bold 20px sans-serif';
            cx.fillText(imgs[i].biome, (i % cols) * W * S + 8, ((i / cols) | 0) * H * S + 24);
        }
        return cv.toDataURL();
    }, { imgs: shots.map(s => ({ biome: s.biome, url: 'data:image/png;base64,' + s.buf.toString('base64') })), cols, rows });

    fs.writeFileSync(path.resolve(__dirname, OUT), Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(OUT + ' 저장 · 바이옴 ' + shots.length + ' · 콘솔 에러 ' + errors.length);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    await browser.close();
})();
