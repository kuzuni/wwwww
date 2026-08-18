// 큰사슴 뿔 재스윕 + 별고래 이마 하강 검증 촬영 (elk-antler-clear)
// 사용: node shot-elk-whale.js [outDir] — 근접 3/4 / 측면 / 인게임 기본 카메라 연속 2프레임
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || __dirname;
const MOUNTS = [['elk', 'Elk'], ['whale', 'Star Whale']];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        window.__step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) real(1 / 120);
        };
        window.__setMount = (name) => {
            S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = name;
            Scene3D.refreshMount();
            Scene3D._clock = 0;
            Scene3D.mountGroup.userData.phase = 0;
        };
        window.__camera = (yawDeg, dist, camY, lookY) => {
            const hx = Scene3D.heroG.position.x, hy = Scene3D.heroG.position.y;
            const a = yawDeg * Math.PI / 180;
            Scene3D.camLock = {
                pos: new THREE.Vector3(hx + Math.sin(a) * dist, hy + camY, Math.cos(a) * dist),
                look: new THREE.Vector3(hx, hy + lookY, 0),
            };
        };
        Scene3D.clearEnemies(); Combat.enemies = []; Combat.phase = 'walk';
        Scene3D.walking = false;
        __step(0.5);
    });

    const clip = await page.evaluate(() => {
        const r = document.getElementById('game-area').getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
    const shot = async (name) => {
        await page.screenshot({ path: path.join(OUT, name + '.png'), clip, timeout: 60000 });
        console.log('shot ' + name);
    };

    for (const [key, name] of MOUNTS) {
        await page.evaluate((n) => { __setMount(n); __camera(0, 3.4, 1.7, 0.95); __step(0.9); }, name);
        await shot(`ew-${key}-near`);
        await page.evaluate(() => { __camera(-78, 3.2, 1.35, 0.9); __step(0.05); });
        await shot(`ew-${key}-side`);
        // 인게임 기본 카메라(가림 판정과 같은 시점) 연속 프레임 — 부유 위상에 따른 차이 확인
        await page.evaluate(() => { Scene3D.camLock = null; __step(0.3); });
        await shot(`ew-${key}-game-a`);
        await page.evaluate(() => { __step(0.45); });
        await shot(`ew-${key}-game-b`);
    }
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no page errors)');
    await browser.close();
})();
