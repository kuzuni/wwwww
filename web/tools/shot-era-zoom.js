// 시대 실루엣 판독용 확대 콘택트 시트 (equip-era-theming).
// age-weapons.png 는 88px 이라 '이게 뗀석기인가/십자가인가'를 눈으로 못 가른다 —
// 사용자 지시가 가리키는 세 시대(원시·중세·천상)만 크게 찍어 실루엣을 본다.
// 사용: node shot-era-zoom.js [age...]  → tools/era-zoom.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const AGES_ARG = process.argv.slice(2).length ? process.argv.slice(2) : ['primitive', 'medieval', 'divine'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1720, height: 1000 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG');
    await page.evaluate((ages) => {
        const rows = ages.map(age => {
            const cells = weaponsOfAge(age).map((w, i) => {
                const d = WEAPON_TYPES[w];
                const t = Scene3D.itemThumb({ name: d.kr, slot: 'weapon', age, ageIdx: AGES.indexOf(age), rarity: 'common', level: 1, main: 'atk', value: 1, subs: [], wtype: w, nameIdx: i });
                return `<div style="width:220px;text-align:center"><img src="${t}" style="width:212px;height:212px;image-rendering:auto"><div style="font:13px sans-serif;color:#222">${d.kr}</div></div>`;
            }).join('');
            return `<div style="display:flex;align-items:center;gap:4px;border-bottom:1px solid #ccc;padding:3px 0">
                <div style="width:64px;font:bold 14px sans-serif;color:#111">${AGE_KR[age]}</div>${cells}</div>`;
        }).join('');
        document.body.innerHTML = `<div id="sheet" style="background:#f2f2f2;padding:6px;width:1706px">${rows}</div>`;
    }, AGES_ARG);
    await page.locator('#sheet').screenshot({ path: require('path').join(__dirname, 'era-zoom.png') });
    await browser.close();
    console.log('→ tools/era-zoom.png');
})();
