// 사망→기상 연속 프레임 **영웅 확대** 촬영 — 접지/붕괴 자세를 비평가가 눈으로 판정할 수 있는 크기로 찍는다.
// 사용: node shot-herodeath-zoom.js [outDir]
// 시간축은 shot-herodeath.js와 동일하게 가상 시계로 통제(1/120 서브스텝). 클립 영역은 영웅 발밑을
// 스크린 좌표로 투영해 잡으므로 카메라가 흔들려도 몸이 프레임 밖으로 나가지 않는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || __dirname;
const FRAMES = [0.20, 0.45, 0.58, 0.80, 1.00, 1.12, 1.25, 1.45, 2.20, 2.60, 2.95, 3.30];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 3 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
        const realTick = Combat.tick.bind(Combat);
        const realUpdate = Scene3D.update.bind(Scene3D);
        Combat.tick = () => { }; Scene3D.update = () => { };
        let vt = Date.now();
        U.now = () => vt;
        window.__step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { vt += 1000 / 120; realTick(1 / 120); realUpdate(1 / 120); }
        };
        // 영웅 발밑 → 스크린 좌표(CSS px) 투영
        window.__heroScreen = () => {
            const v = Scene3D.heroG.position.clone().add(new THREE.Vector3(0, 0.35, 0));
            v.project(Scene3D.camera);
            const el = Scene3D.renderer.domElement;
            const r = el.getBoundingClientRect();
            return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height };
        };
        Scene3D.clearEnemies();
        Combat.enemies = []; Combat.pending = [];
        Combat.phase = 'fight';
        Combat.hero.hp = Big.of(1);
        Combat.damageHero(Big.of(999999));
    });

    const W = 210, H = 155;
    let prev = 0;
    for (const t of FRAMES) {
        await page.evaluate(d => window.__step(d), t - prev);
        prev = t;
        const c = await page.evaluate(() => window.__heroScreen());
        const clip = {
            x: Math.max(0, Math.round(c.x - W / 2)), y: Math.max(0, Math.round(c.y - H * 0.62),),
            width: W, height: H,
        };
        const name = `hd-${String(Math.round(t * 1000)).padStart(4, '0')}ms.png`;
        await page.screenshot({ path: path.join(OUT, name), clip });
        console.log(name, JSON.stringify(await page.evaluate(() => ({
            rootRx: +Scene3D.heroRig.root.rotation.x.toFixed(2),
            rootPy: +Scene3D.heroRig.root.position.y.toFixed(2),
            dead: Scene3D.heroDead,
        }))));
    }
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '콘솔 에러 0건');
    await browser.close();
})();
