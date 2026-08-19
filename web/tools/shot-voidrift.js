// 공허의 창 '공간 균열' 연속 프레임 캡처 — skill-unique-signature 눈 대조용.
// 헤드리스는 rAF 가 안 돌아 Scene3D.update 를 손으로 흘리고 renderFrame 을 직접 부른다.
// 사용: node shot-voidrift.js
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
        Scene3D.skillEffect('voidrift', 0x9575cd, ids, { rarity: 'ultimate' });
    });
    // 프레임 시각(초) — **절대 시각**이라 시전 박자(궁극 tier4 = 90+4*26 = 194ms)가 선행한다.
    // 그 뒤 개열 0.30(→0.494) · 돌출 0.14(→0.634) · 관통 0.10(→0.734) · 여운 0.55(→1.284).
    const stamps = [0.10, 0.30, 0.42, 0.49, 0.60, 0.70, 0.77, 0.95, 1.15, 1.32];
    let done = 0;
    for (let i = 0; i < stamps.length; i++) {
        const steps = Math.round((stamps[i] - done) * 60);
        await page.evaluate((n) => {
            for (let f = 0; f < n; f++) window.__step(1 / 60);
            Scene3D.renderFrame();
        }, steps);
        done = stamps[i];
        await page.screenshot({ path: path.join(__dirname, `voidrift-${i}.png`) });
    }
    console.log('캡처 완료: voidrift-0..' + (stamps.length - 1) + '.png (t=' + stamps.join(',') + 's)');
    await browser.close();
})();
