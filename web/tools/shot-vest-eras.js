// `vest`(조끼) 가 배정된 **10시대 전부**를 한 시트에 — 시대별 조형이 실제로 갈렸는지 보는 눈.
// 왜 따로 두는가: 이 항목(`equip-era-theming`)의 핵심 질문은 "색만 다른 같은 물건인가"이고,
// 그건 **같은 스타일끼리 시대를 넘나들며 나란히 놓아야만** 답이 나온다. 시대 한 줄에 5칸을
// 늘어놓는 시트(`shot-era-gear-zoom.js`)로는 그 비교가 안 된다. `shot-fin-eras.js` 와 같은 결이되,
// `vest` 는 10시대 전부에 배정돼 있어 2줄 5칸으로 깐다.
// 사용: node shot-vest-eras.js [출력경로]   → 기본 tools/vest-eras.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const WEB = path.resolve(__dirname, '..');
const INDEX = 'file://' + path.resolve(WEB, 'index.html');
const { waitReady } = require('./wait-ready.js');
const OUT = process.argv[2] || path.join(__dirname, 'vest-eras.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.itemThumb');
    const missing = await page.evaluate(() => {
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'common', nameIdx: 0 });
        Scene3D._thumbR.setSize(420, 420); Scene3D._thumbCache = {};
        const hex = n => '#' + n.toString(16).padStart(6, '0');
        const cellBg = age => {
            const rc = hex(AGE_COLORS[age] !== undefined ? AGE_COLORS[age] : 0x6b3538);
            return `background: color-mix(in srgb, ${rc} 58%, #17181a);
                border:3px solid color-mix(in srgb, ${rc} 80%, #000); border-radius:12px;`;
        };
        const OUTF = 'filter: drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000);';
        // 시대마다 vest 가 몇 번 칸인지는 ARMOR_STYLES 에서 직접 찾는다 — 표가 바뀌어도 시트가 안 틀어진다.
        const miss = [];
        const CELLS = AGES.map(age => {
            const i = (ARMOR_STYLES[age] || []).indexOf('vest');
            if (i < 0) { miss.push(age); return null; }
            return [age, i];
        }).filter(Boolean);
        const html = CELLS.map(([age, i]) => {
            const ai = AGES.indexOf(age);
            const t = Scene3D.itemThumb({ slot: 'armor', age, ageIdx: ai, rarity: 'common', level: 1, main: 'hp', value: 1, subs: [], nameIdx: i });
            const v = Scene3D.vestVariant ? Scene3D.vestVariant(age) : '?';
            return `<div style="width:288px;text-align:center"><div style="${cellBg(age)}width:282px;height:282px;display:flex;align-items:center;justify-content:center"><img src="${t}" style="width:268px;height:268px;${OUTF}"></div><div style="font:13px sans-serif;color:#111">${AGE_KR[age]} · ${itemNameOf({ slot: 'armor', age, nameIdx: i })} <b>[${v}]</b></div></div>`;
        }).join('');
        for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); cancelAnimationFrame(i); }
        document.body.innerHTML = `<div id="sheet" style="background:#f2f2f2;padding:6px;width:1470px;display:flex;flex-wrap:wrap;gap:4px">${html}</div>`;
        const keep = document.createElement('div');
        keep.id = 'app';
        keep.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
        document.body.appendChild(keep);
        return miss;
    });
    await page.locator('#sheet').screenshot({ path: OUT });
    await browser.close();
    console.log('→ ' + OUT + ' · vest 미배정 시대 ' + missing.length + '건' + (missing.length ? ' (' + missing.join(',') + ')' : '') + ' · 콘솔 에러 ' + errors.length + '건');
    errors.slice(0, 6).forEach(e => console.log('  ! ' + String(e).slice(0, 300)));
})();
