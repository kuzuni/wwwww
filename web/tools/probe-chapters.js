// 전 챕터 값 구조 실측 — 전역 값 그레이드(Scene3D.VALUE)가 어느 챕터도 붕괴시키지 않는지 확인한다.
// 밝은 챕터는 다크 엔드가 생겨야 하고(darkPct↑, 중간값↓), 이미 어두운 챕터(7 마법·9 용암)는
// 니어블랙으로 뭉개지면 안 된다(crushPct = 명도 0.04 이하 비율 감시).
// 사용: node probe-chapters.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const rows = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        ProChar.update = () => {};
        const R = Scene3D.renderer, gl = R.getContext();
        const w = R.domElement.width, h = R.domElement.height;
        const lum = (d, i) => (Math.max(d[i], d[i + 1], d[i + 2]) / 255 + Math.min(d[i], d[i + 1], d[i + 2]) / 255) / 2;
        const stat = () => {
            R.render(Scene3D.scene, Scene3D.camera);
            const d = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
            const lums = []; let dark = 0, crush = 0, blow = 0;
            for (let p = 0; p < w * h; p++) {
                const l = lum(d, p * 4);
                lums.push(l);
                if (l <= 0.18) dark++;
                if (l <= 0.04) crush++;
                if (l >= 0.96) blow++;
            }
            lums.sort((a, b) => a - b);
            return {
                median: +lums[Math.floor(lums.length / 2)].toFixed(3),
                p05: +lums[Math.floor(lums.length * 0.05)].toFixed(3),
                p95: +lums[Math.floor(lums.length * 0.95)].toFixed(3),
                darkPct: +(dark / (w * h) * 100).toFixed(2),
                crushPct: +(crush / (w * h) * 100).toFixed(2),
                blowPct: +(blow / (w * h) * 100).toFixed(2),
            };
        };
        const out = [];
        const keep = Object.assign({}, Scene3D.VALUE);
        const off = { groundK: 0, groundMax: 0, foliageK: 0, foliageMax: 0, satK: 0, farDesat: 0 };
        for (let i = 0; i < CHAPTER_THEMES.length; i++) {
            Object.assign(Scene3D.VALUE, off); Scene3D.setTheme(CHAPTER_THEMES[i]);
            const before = stat();
            Object.assign(Scene3D.VALUE, keep); Scene3D.setTheme(CHAPTER_THEMES[i]);
            const after = stat();
            out.push({ ch: i + 1, biome: CHAPTER_THEMES[i].biome, before, after });
        }
        return out;
    });
    console.log('ch  biome    | before: med  dark%  crush% | after: med  dark%  crush%  blow%  p05→p95');
    for (const r of rows) {
        console.log(
            String(r.ch).padEnd(3), String(r.biome).padEnd(8), '|',
            String(r.before.median).padEnd(5), String(r.before.darkPct).padEnd(6), String(r.before.crushPct).padEnd(7), '|',
            String(r.after.median).padEnd(5), String(r.after.darkPct).padEnd(6), String(r.after.crushPct).padEnd(7),
            String(r.after.blowPct).padEnd(6), `${r.after.p05}→${r.after.p95}`);
    }
    console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
