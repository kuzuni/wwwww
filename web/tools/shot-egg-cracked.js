// pet-currency-cracked-egg 육안 확인 — 진짜 알(egg) vs 화폐 아이콘(eggCracked)을 나란히 크게 찍고,
// 실제 쓰이는 크기(펫 패널 화폐 pill·소환 비용)에서도 균열이 읽히는지 본다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof IconGen !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);

    // ① 아이콘 대조판 — 큰 크기와 실사용 크기(1.05rem≈17px)를 같이
    await page.evaluate(() => {
        const box = document.createElement('div');
        box.id = 'icocmp';
        box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#f3ece0;display:flex;'
            + 'flex-direction:column;align-items:center;justify-content:center;gap:14px;font:600 13px sans-serif;color:#3a2c1c';
        const row = (label, name, px) =>
            `<div style="display:flex;align-items:center;gap:12px"><img src="${IconGen.url(name)}" `
            + `style="width:${px}px;height:${px}px;image-rendering:auto"><span>${label} (${px}px)</span></div>`;
        box.innerHTML = row('진짜 알 egg', 'egg', 128) + row('화폐 eggCracked', 'eggCracked', 128)
            + row('진짜 알 egg', 'egg', 34) + row('화폐 eggCracked', 'eggCracked', 34)
            + row('진짜 알 egg', 'egg', 17) + row('화폐 eggCracked', 'eggCracked', 17);
        document.body.appendChild(box);
    });
    await page.waitForTimeout(200);
    await page.locator('#icocmp').screenshot({ path: __dirname + '/egg-cracked-cmp.png' });

    // ② 펫 패널 실화면 — 화폐 pill·소환 비용은 깨진 알, 그리드의 미부화 알은 그대로
    await page.evaluate(() => {
        document.getElementById('icocmp').remove();
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.eggCurrency = 12345; S.gems = 999;
        S.eggs = [{ rarity: 'common' }, { rarity: 'epic' }, { rarity: 'legend' }];
        UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.renderPets();
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: __dirname + '/egg-cracked-pets.png' });
    console.log('저장: egg-cracked-cmp.png / egg-cracked-pets.png');
    await browser.close();
})();
