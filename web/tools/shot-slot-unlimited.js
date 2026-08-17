// 펫·탈것 무제한 장착의 **그림**을 본다 — TODO `pet-mount-slot-unlimited` 시각 판정용.
// 사용: node tools/shot-slot-unlimited.js [outDir]
// 연속 프레임(행군 중 0.25초 간격)으로 찍어 한 순간만 우연히 괜찮은 배치를 통과시키지 않는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        window.__step = t => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        window.__setup = (nPets, nMounts) => {
            Scene3D.clearEnemies(); Combat.enemies = []; Combat.phase = 'walk';
            const petPool = Object.keys(PET_ICONS);
            S.pets = petPool.slice(0, nPets).map(nm => ({ name: nm, rarity: 'epic', level: 1, dupes: 0, xp: 0, subs: [] }));
            S.activePets = S.pets.map((_, i) => i);
            const mPool = Object.values(mountNames).flat();
            S.mounts = {};
            const names = mPool.slice(0, nMounts);
            for (const nm of names) S.mounts[nm] = { rarity: 'epic', level: 1, dupes: 0, stars: 0, xp: 0, subs: [] };
            S.activeMounts = names.slice();
            Scene3D.refreshMount(); Scene3D.refreshPets();
        };
        window.__walk = on => { Scene3D.walking = !!on; };
    });

    const cases = [['pets12-mounts0', 12, 0], ['pets12-mounts8', 12, 8], ['pets25-mounts15', 25, 15], ['pets3-mounts1', 3, 1]];
    for (const [label, np, nm] of cases) {
        await page.evaluate(([a, b]) => { window.__setup(a, b); window.__step(0.8); }, [np, nm]);
        // 연속 프레임 4장 — 행군 중 배치가 계속 읽히는지 본다
        await page.evaluate(() => window.__walk(true));
        for (let f = 0; f < 4; f++) {
            await page.evaluate(() => window.__step(0.25));
            await page.screenshot({ path: path.join(OUT, `slot-${label}-f${f}.png`) });
        }
        await page.evaluate(() => window.__walk(false));
        console.log(`찍음: slot-${label}-f0..3.png`);
    }
    console.log(errors.length ? errors.join('\n') : '(no console errors)');
    await browser.close();
})();
