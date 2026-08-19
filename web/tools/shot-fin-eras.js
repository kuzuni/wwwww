// `fin` 5변종(FIN_VARIANT)만 크게 — 시대별 조형이 실제로 갈렸는지 눈으로 보는 시트.
// 왜 따로 두는가: `shot-era-gear-zoom.js` 는 시대 한 줄에 5칸을 늘어놓아 셀이 작고, 시대를
// 넘나드는 **같은 스타일끼리의 비교**(= 이 항목의 핵심 질문 '색만 다른 같은 물건인가')가 안 된다.
// 여기서는 galea(중세) · combat(현대) · antenna(우주) · mech(항성간) · hellforged(지하)를
// 한 줄에 나란히 놓는다.
// 사용: node shot-fin-eras.js [출력경로]   → 기본 /tmp/fin.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const WEB = path.resolve(__dirname, '..');
const INDEX = 'file://' + path.resolve(WEB, 'index.html');
const { waitReady } = require('./wait-ready.js');
const OUT = process.argv[2] || path.join(__dirname, 'fin-eras.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.itemThumb');
    await page.evaluate(() => {
        Scene3D.itemThumb({ slot: 'helmet', age: 'medieval', ageIdx: 1, rarity: 'common', nameIdx: 0 });
        Scene3D._thumbR.setSize(420, 420); Scene3D._thumbCache = {};
        const hex = n => '#' + n.toString(16).padStart(6, '0');
        const cellBg = age => {
            const rc = hex(AGE_COLORS[age] !== undefined ? AGE_COLORS[age] : 0x6b3538);
            return `background: color-mix(in srgb, ${rc} 58%, #17181a);
                border:3px solid color-mix(in srgb, ${rc} 80%, #000); border-radius:12px;`;
        };
        const OUTF = 'filter: drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000);';
        const CELLS = [['medieval', 1], ['modern', 2], ['space', 4], ['interstellar', 3], ['underworld', 0]];
        const html = CELLS.map(([age, i]) => {
            const ai = AGES.indexOf(age);
            const t = Scene3D.itemThumb({ slot: 'helmet', age, ageIdx: ai, rarity: 'common', level: 1, main: 'hp', value: 1, subs: [], nameIdx: i });
            return `<div style="width:292px;text-align:center"><div style="${cellBg(age)}width:286px;height:286px;display:flex;align-items:center;justify-content:center"><img src="${t}" style="width:272px;height:272px;${OUTF}"></div><div style="font:13px sans-serif;color:#111">${AGE_KR[age]} · ${itemNameOf({ slot: 'helmet', age, nameIdx: i })}</div></div>`;
        }).join('');
        for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); cancelAnimationFrame(i); }
        document.body.innerHTML = `<div id="sheet" style="background:#f2f2f2;padding:6px;width:1470px;display:flex;gap:4px">${html}</div>`;
        const keep = document.createElement('div');
        keep.id = 'app';
        keep.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
        document.body.appendChild(keep);
    });
    await page.locator('#sheet').screenshot({ path: OUT });
    await browser.close();
    console.log('→ ' + OUT + ' · 콘솔 에러 ' + errors.length + '건');
    errors.slice(0, 6).forEach(e => console.log('  ! ' + String(e).slice(0, 300)));
})();
