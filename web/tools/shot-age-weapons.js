// 시대별 무기 60종 썸네일 콘택트 시트 — 재질 계열(stone/bone/steel/blackpowder/gunmetal/energy/holy)과 shape 계열이 눈으로 구분되는지 판독용
// 사용: node shot-age-weapons.js  → tools/age-weapons.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 760, height: 1500 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.evaluate(() => {
        const rows = AGES.map(age => {
            const cells = weaponsOfAge(age).map((w, i) => {
                const d = WEAPON_TYPES[w];
                const t = Scene3D.itemThumb({ name: d.kr, slot: 'weapon', age, ageIdx: AGES.indexOf(age), rarity: 'common', level: 1, main: 'atk', value: 1, subs: [], wtype: w, nameIdx: i });
                return `<div style="width:96px;text-align:center"><img src="${t}" style="width:88px;height:88px"><div style="font:11px sans-serif;color:#222">${d.kr}</div><div style="font:9px sans-serif;color:#888">${d.shape}/${d.mat}</div></div>`;
            }).join('');
            return `<div style="display:flex;align-items:center;gap:6px;border-bottom:1px solid #ccc;padding:3px 0">
                <div style="width:70px;font:bold 13px sans-serif;color:#111">${AGE_KR[age]}</div>${cells}</div>`;
        }).join('');
        document.body.innerHTML = `<div id="sheet" style="background:#f2f2f2;padding:6px;width:746px">${rows}</div>`;
    });
    await page.locator('#sheet').screenshot({ path: require('path').join(__dirname, 'age-weapons.png') });
    await browser.close();
    console.log('→ tools/age-weapons.png');
})();
