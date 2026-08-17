// 화면 2종만 다시 찍기 — 전수 검증 패스에서 한 화면 고치고 즉시 재대조할 때 쓴다(30화면 전체는 4분 걸린다).
// 사용: PW_PATH=... node shot-two.js <이름:오프너소스> [...]
const { chromium } = require(process.env.PW_PATH || 'playwright');
const path = require('path'), fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.join(__dirname, 'ref-cmp/clone');
const SC = require('./shot-screens-seed.js');
(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 20000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 20000 });
    // 캡처 중에는 토스트를 아예 막는다 — innerHTML 비우기만으로는 부족하다: 전투 틱이 clear 와
    // screenshot 사이에 새 토스트를 띄워 원본에 없는 알림 pill 이 화면에 찍힌다(리그 캡처에서
    // 시즌 종료 pill 위에 '첫 클리어' 토스트가 겹쳐 찍힌 사례). 채점용 캡처가 오염되면 안 된다.
    await page.evaluate(() => { UI.toast = () => { }; });
    await page.waitForTimeout(2500);
    for (const arg of process.argv.slice(2)) {
        const i = arg.indexOf(':'); const name = arg.slice(0, i), src = arg.slice(i + 1);
        await page.evaluate(() => {
            try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
            try { UI.switchTab && UI.switchTab(null); } catch (e) { }
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
        });
        await page.waitForTimeout(150);
        await page.evaluate(new Function(src));
        await page.waitForTimeout(900);
        await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
        await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 60000 });
        console.log('shot ' + name);
    }
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no console errors)');
    await browser.close();
})();
