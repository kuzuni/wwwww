// 보스 등장 워닝 연출 연속 프레임 촬영 — 사용: node shot-bosswarn.js [outDir]
// 로직 틱과 렌더를 같은 1/120 서브스텝으로 수동 구동해 연출 시간축을 정확히 통제하고,
// 배너(#boss-warning)의 CSS 애니메이션도 같은 시뮬 시각으로 시크·정지시켜 3D와 DOM이 어긋나지 않게 한다.
// (실시간으로 두면 소프트웨어 GL의 느린 렌더 때문에 DOM은 이미 끝나 있고 3D만 초반인 프레임이 나온다.)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || __dirname;

// 연출 박자에 맞춘 촬영 시각(초): 점멸 3회(0/.42/.84) → 임팩트(1.55) → 스케일 인 → 배너 닫힘
const FRAMES = [0.02, 0.12, 0.42, 0.84, 1.26, 1.52, 1.58, 1.70, 1.90, 2.10];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
        const realTick = Combat.tick.bind(Combat);
        const realUpdate = Scene3D.update.bind(Scene3D);
        Combat.tick = () => {};
        Scene3D.update = () => {};
        Scene3D.__t = 0;
        window.__step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { Scene3D.__t += 1 / 120; realTick(1 / 120); realUpdate(1 / 120); }
            // 배너의 CSS 애니메이션을 시뮬 시각으로 시크 후 정지. UI가 건 2초 setTimeout은 실시간이라
            // 스크린샷 대기 사이에 배너를 먼저 지워버리므로 표시 여부도 여기서 시뮬 시각으로 다시 결정한다.
            const el = document.getElementById('boss-warning');
            if (el.__born === undefined) el.__born = 0;
            const age = Scene3D.__t - el.__born;
            if (age >= 0 && age < Scene3D.BOSS_WARN_DUR) el.classList.remove('hidden');
            else el.classList.add('hidden');
            for (const node of [el, ...el.querySelectorAll('*')]) {
                for (const a of node.getAnimations()) { a.pause(); a.currentTime = Math.max(0, age * 1000); }
            }
        };
        // 4웨이브 종료 직후 상태로 맞춘 뒤 한 스텝 밀어 보스 경고에 진입시킨다
        Scene3D.clearEnemies();
        Combat.enemies = []; Combat.pending = [];
        Combat.wave = 4; Combat.phase = 'waveDelay'; Combat.phaseTimer = 0.005;
        window.__step(0.02);
        Scene3D.__t = 0;
    });

    let prev = 0;
    for (const t of FRAMES) {
        await page.evaluate(d => window.__step(d), t - prev);
        prev = t;
        const name = `bosswarn-${String(Math.round(t * 1000)).padStart(4, '0')}ms.png`;
        await page.screenshot({ path: path.join(OUT, name) });
        const st = await page.evaluate(() => ({
            phase: Combat.phase, n: Combat.enemies.length,
            push: +Scene3D.camPush.toFixed(3),
            bannerH: +document.querySelector('#boss-warning .bw-banner').getBoundingClientRect().height.toFixed(1),
            shown: !document.getElementById('boss-warning').classList.contains('hidden'),
        }));
        console.log(name, JSON.stringify(st));
    }
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '콘솔 에러 0건');
    await browser.close();
})();
