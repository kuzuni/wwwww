// 지중 습격 '거대 아가리' 연속 프레임 캡처 — voxel 전환(voxMawGeo) 눈 대조용.
// shot-dragonfire.js 와 같은 수동 스텝 문법(헤드리스 rAF 함정 회피).
// 사용: node shot-maw.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    await page.goto(INDEX);
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && !!Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForFunction(() => {
        const el = document.getElementById('boot-loading');
        return !el || el.classList.contains('bl-done');       // 부팅 베일이 남으면 화면 전체가 어둡다(TODO 함정)
    }, null, { timeout: 60000 });
    await page.waitForTimeout(400);

    await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.anims.length = 0;
        window.__step = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => {};
        const ids = [...Scene3D.enemyMap.keys()];
        Scene3D.skillEffect('breath', 0xba68c8, ids, { rarity: 'legendary' });
    });
    // 예고(흙더미) 0.23 → 솟구침 0.26 → 포식 0.16 → 퇴장 0.34
    const stamps = [0.1, 0.2, 0.32, 0.45, 0.58, 0.72, 0.9, 1.15];
    let done = 0;
    for (let i = 0; i < stamps.length; i++) {
        const steps = Math.round((stamps[i] - done) * 60);
        await page.evaluate((n) => {
            for (let f = 0; f < n; f++) window.__step(1 / 60);
            Scene3D.renderFrame();
        }, steps);
        done = stamps[i];
        await page.screenshot({ path: path.join(__dirname, `maw-${i}.png`) });
    }
    console.log('캡처 완료: maw-0..' + (stamps.length - 1) + '.png (t=' + stamps.join(',') + 's)');
    await browser.close();
})();
