// craft-equip-swap 육안 확인 — [장착] 전/후 비교 팝업을 나란히 찍는다.
// 전: 위=장착됨(옛), 아래=새로운!(새) / 후: 위=장착됨(새), 아래=교체됨(옛) + 판매 버튼 유지.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.coins = 1e12; S.hammers = 1e6; S.forgeLevel = 20;
        UI._autoSeq = null;
        // 같은 부위의 옛/새 장비를 확정적으로 세운다
        const it = Forge.craft(1)[0];
        let old = Forge.craft(1)[0];
        for (let i = 0; i < 60 && old.slot !== it.slot; i++) old = Forge.craft(1)[0];
        S.equipment[it.slot] = old;
        UI.setPendingCraft(it); UI.showCraftModal(it);
    });
    await page.waitForTimeout(500);
    await page.locator('#craft-modal .modal-card').screenshot({ path: __dirname + '/craft-swap-before.png' });
    await page.evaluate(() => UI.resolveCraft('equip'));
    await page.waitForTimeout(500);
    await page.locator('#craft-modal .modal-card').screenshot({ path: __dirname + '/craft-swap-after.png' });
    console.log('저장: craft-swap-before.png / craft-swap-after.png');
    await browser.close();
})();
