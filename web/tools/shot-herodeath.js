// 영웅 사망→기상 연속 프레임 촬영 — 사용: node shot-herodeath.js [outDir]
// 로직 틱과 렌더를 같은 1/120 서브스텝으로 수동 구동해, 사망 포즈가 실제로 유지되는지 시간축을 통제해 찍는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || __dirname;

// 사망 클립 1.45초(무릎 접지 0.55 → 몸통 접지 1.13) → 누운 채 유지 → 2.4초에 기상(0.85초) → 스테이지 재시작
const FRAMES = [0.25, 0.58, 0.90, 1.15, 1.45, 2.20, 2.65, 3.10, 3.40];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
        const realTick = Combat.tick.bind(Combat);
        const realUpdate = Scene3D.update.bind(Scene3D);
        Combat.tick = () => {}; Scene3D.update = () => {};
        // 사망 구간은 벽시계(U.now)로 재므로 가상 시계도 스텝과 같이 밀어야 한다.
        // 안 그러면 스크린샷 한 장에 수 초씩 걸리는 소프트웨어 GL에서 실제 시간만 앞서 달려,
        // 라벨이 250ms인 프레임에 이미 기상이 시작돼 있는 식으로 시간축이 어긋난다.
        let vt = Date.now();
        U.now = () => vt;
        window.__step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { vt += 1000 / 120; realTick(1 / 120); realUpdate(1 / 120); }
        };
        Scene3D.clearEnemies();
        Combat.enemies = []; Combat.pending = [];
        Combat.phase = 'fight';
        Combat.hero.hp = Big.of(1);
        Combat.damageHero(Big.of(999999)); // → onDefeat → heroDown
    });

    let prev = 0;
    for (const t of FRAMES) {
        await page.evaluate(d => window.__step(d), t - prev);
        prev = t;
        const name = `herodeath-${String(Math.round(t * 1000)).padStart(4, '0')}ms.png`;
        await page.screenshot({ path: path.join(OUT, name) });
        const st = await page.evaluate(() => ({
            dead: Scene3D.heroDead,
            rootRx: +Scene3D.heroRig.root.rotation.x.toFixed(3),
            rootPy: +Scene3D.heroRig.root.position.y.toFixed(3),
            phase: Combat.phase,
        }));
        console.log(name, JSON.stringify(st));
    }
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '콘솔 에러 0건');
    await browser.close();
})();
