// 인게임 컷 — HUD 포함 실플레이 화면 (스토어 스크린샷용, 인계 ⑺). hideUI 없이 기본 카메라·전투 그대로 촬영
// 사용: node shot-ingame.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== "undefined" && Scene3D.heroG && typeof Combat !== "undefined", null, { timeout: 60000 });
    // 적이 화면에 자리잡고 전투가 벌어지는 순간까지 대기 (스폰 직후 낙하/미배치 프레임 회피)
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.filter(e => e.alive).length >= 2, null, { timeout: 20000 });
    await page.waitForTimeout(2500); // 접근·교전 진입
    await page.screenshot({ path: OUT + '/ingame-hud.png' }); // 풀 뷰포트 — HUD/탑바/장비 시트 포함
    console.log('ingame shot done' + (errors.length ? '  CONSOLE ERRORS: ' + errors.join(' | ') : '  (no console errors)'));
    await browser.close();
})();
