// 아포칼립스 '화염룡 강림' 연속 프레임 캡처 — skill-unique-signature 눈 대조용.
// 헤드리스는 rAF 가 안 돌아 Scene3D.update 를 손으로 흘리고 renderFrame 을 직접 부른다.
// 사용: node shot-dragonfire.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    await page.goto(INDEX);
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && !!Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForTimeout(800);

    await page.evaluate(() => {
        Combat.tick = () => {};                      // 전투 정지 — 적이 안 죽고 좌표가 안 흔들리게
        Scene3D.anims.length = 0;
        // ⚠️ 간헐 rAF 가 스크린샷 사이에 실시간 dt 로 update 를 불러 연출을 앞질러 소화해 버린다
        //    (shot-pet-joints 가 기록한 함정) — rAF 경로의 update 를 끊고 수동 스텝만 시간을 민다.
        window.__step = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => {};
        const ids = [...Scene3D.enemyMap.keys()];
        Scene3D.skillEffect('dragonfire', 0xef5350, ids, { rarity: 'mythic' });
    });
    // 프레임 시각(초) — 강림 0.42 / 예비 0.2 / 브레스 0.78 / 퇴장 0.4
    const stamps = [0.05, 0.25, 0.5, 0.68, 0.95, 1.25, 1.6, 2.0];
    let done = 0;
    for (let i = 0; i < stamps.length; i++) {
        const steps = Math.round((stamps[i] - done) * 60);
        await page.evaluate((n) => {
            for (let f = 0; f < n; f++) window.__step(1 / 60);
            Scene3D.renderFrame();
        }, steps);
        done = stamps[i];
        await page.screenshot({ path: path.join(__dirname, `dragonfire-${i}.png`) });
    }
    console.log('캡처 완료: dragonfire-0..' + (stamps.length - 1) + '.png (t=' + stamps.join(',') + 's)');
    await browser.close();
})();
