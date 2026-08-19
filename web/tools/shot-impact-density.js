// hp-juicy ② 접점 임팩트 밀도 — 연속 프레임 캡처(연출은 정지 화면이 아니라 타이밍으로 본다).
// 일반/크리 각각 임팩트 순간부터 등간격으로 찍어 **스파이크가 뻗고 링이 퍼지는지**를 눈으로 확인한다.
//
// ⚠️ 벽시계로 기다리지 말 것 — 이 컨테이너는 프레임이 고르게 안 흐른다(TODO 함정 ③).
//    `Scene3D.update` 를 손으로 흘려 프레임을 만들고 그 사이사이에 찍는다.
//
// 사용: node shot-impact-density.js  → tools/impact-{normal,crit}-<i>.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof Scene3D !== "undefined" && !!Scene3D.heroG && typeof Combat !== "undefined"').catch(() => false);
        if (ready) break;
        if (w > 900) throw new Error('부팅 대기 초과');
        await page.waitForTimeout(200);
    }

    for (const crit of [false, true]) {
        await page.evaluate((isCrit) => {
            Combat.tick = () => { };
            let e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
            if (!e) { Combat.setupStage(); e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id)); }
            window.__real = Scene3D.update.bind(Scene3D);
            Scene3D.update = () => { };            // rAF 가 제멋대로 흘리지 못하게 막고 손으로만 돌린다
            Scene3D.hitEnemy(e.id, Big.of(30), isCrit, null, false);
        }, crit);
        const tag = crit ? 'crit' : 'normal';
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(120);
            await page.screenshot({ path: path.join(OUT, `impact-${tag}-${i}.png`) });
            await page.evaluate(() => { for (let j = 0; j < 3; j++) window.__real(1 / 120); });
        }
        await page.evaluate(() => { Scene3D.update = window.__real; for (let j = 0; j < 60; j++) window.__real(1 / 60); });
        await page.waitForTimeout(300);
    }
    console.log('캡처 완료: impact-normal-0..4.png · impact-crit-0..4.png');
    await browser.close();
})();
