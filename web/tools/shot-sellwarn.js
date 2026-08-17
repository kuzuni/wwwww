// 판매 경고 팝업 육안 검증 — 시대 칩 + 주스탯 ▲▼ 대조가 좁은 폭에서도 안 깨지는지 본다.
// 케이스: ⑴ 천상 팔고 원시 남김(9시대 차) ⑵ 근세 팔고 중세 남김(1시대 차, 파는 쪽이 더 약함)
// 사용: node shot-sellwarn.js  → tools/sellwarn-0.png(430×932) · sellwarn-1.png(360×640)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const CASES = [
    { w: 430, h: 932, sell: 'divine', keep: 'primitive', sellLv: 12, keepLv: 60 },
    { w: 360, h: 640, sell: 'earlyModern', keep: 'medieval', sellLv: 6, keepLv: 88 },
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    for (let i = 0; i < CASES.length; i++) {
        const c = CASES[i];
        const page = await browser.newPage({ viewport: { width: c.w, height: c.h } });
        page.on('pageerror', e => errs.push(e.message));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
        await page.waitForTimeout(400);
        const text = await page.evaluate(cc => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            Combat.tick = function () {};
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const mk = (age, level) => {
                const it = Forge.rollItem();
                it.slot = 'armor'; it.main = SLOT_MAIN.armor; it.age = age; it.ageIdx = AGES.indexOf(age); it.level = level;
                it.value = Math.floor(Forge.tierBaseHp(it.ageIdx) * Forge.levelMult(level));
                return it;
            };
            const kept = mk(cc.keep, cc.keepLv), sold = mk(cc.sell, cc.sellLv);
            S.equipment.armor = kept;
            UI.showSellConfirm({ sold, kept });
            return document.getElementById('detail-modal').innerText.replace(/\s+/g, ' ').trim();
        }, c);
        await page.waitForTimeout(300);
        const out = path.resolve(__dirname, `sellwarn-${i}.png`);
        await page.screenshot({ path: out });
        console.log(`[${c.w}x${c.h}] ${c.sell} 팔고 ${c.keep} 남김 → ${out}`);
        console.log(`   "${text}"`);
        await page.close();
    }
    console.log(`콘솔 에러 ${errs.length}건`);
    errs.slice(0, 5).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(errs.length ? 1 : 0);
})();
