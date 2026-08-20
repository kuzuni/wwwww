// 갑옷 **스타일 하나**를 배정된 시대 전부에 걸쳐 한 시트에 — 시대별 조형이 실제로 갈렸는지 보는 눈.
// 사용: node shot-style-eras.js <스타일> [출력경로]   예: node shot-style-eras.js cape
//       기본 출력 tools/<스타일>-eras.png
//
// `shot-vest-eras.js` 를 스타일 인자로 일반화한 것이다. 왜 필요한가: `equip-era-theming` 의 핵심
// 질문은 늘 "색만 다른 같은 물건인가"이고, 그건 **같은 스타일끼리 시대를 넘나들며 나란히 놓아야만**
// 답이 나온다(시대 한 줄에 5칸을 늘어놓는 시트로는 그 비교가 안 된다). 스타일을 하나 갈 때마다
// 시트를 새로 짜는 게 반복이라 인자로 뺐다 — `probe-armor-era-silhouette.js` 가 뽑아 주는
// '다음에 칠 스타일' 목록을 그대로 이 인자에 넣으면 된다.
// ⚠️ `shot-vest-eras.js` 는 지우지 말 것 — 다른 메모·인계가 그 이름으로 참조한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const WEB = path.resolve(__dirname, '..');
const INDEX = 'file://' + path.resolve(WEB, 'index.html');
const { waitReady } = require('./wait-ready.js');
const STYLE = process.argv[2];
if (!STYLE) { console.log('사용: node shot-style-eras.js <스타일> [출력경로]'); process.exit(1); }
const OUT = process.argv[3] || path.join(__dirname, STYLE + '-eras.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.itemThumb');
    const info = await page.evaluate((STYLE) => {
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'common', nameIdx: 0 });
        Scene3D._thumbR.setSize(420, 420); Scene3D._thumbCache = {};
        const hex = n => '#' + n.toString(16).padStart(6, '0');
        const cellBg = age => {
            const rc = hex(AGE_COLORS[age] !== undefined ? AGE_COLORS[age] : 0x6b3538);
            return `background: color-mix(in srgb, ${rc} 58%, #17181a);
                border:3px solid color-mix(in srgb, ${rc} 80%, #000); border-radius:12px;`;
        };
        const OUTF = 'filter: drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000);';
        // 시대마다 그 스타일이 몇 번 칸인지는 ARMOR_STYLES 에서 직접 찾는다 — 표가 바뀌어도 시트가 안 틀어진다.
        const miss = [];
        const CELLS = AGES.map(age => {
            const i = (ARMOR_STYLES[age] || []).indexOf(STYLE);
            if (i < 0) { miss.push(age); return null; }
            return [age, i];
        }).filter(Boolean);
        // 변종 표시는 스타일마다 접근자 이름이 다르다 — 있는 것만 붙인다(없으면 빈칸).
        const variantOf = age => {
            const fn = Scene3D[STYLE + 'Variant'];
            return typeof fn === 'function' ? fn.call(Scene3D, age) : '';
        };
        const html = CELLS.map(([age, i]) => {
            const ai = AGES.indexOf(age);
            const t = Scene3D.itemThumb({ slot: 'armor', age, ageIdx: ai, rarity: 'common', level: 1, main: 'hp', value: 1, subs: [], nameIdx: i });
            const v = variantOf(age);
            return `<div style="width:288px;text-align:center"><div style="${cellBg(age)}width:282px;height:282px;display:flex;align-items:center;justify-content:center"><img src="${t}" style="width:268px;height:268px;${OUTF}"></div><div style="font:13px sans-serif;color:#111">${AGE_KR[age]} · ${itemNameOf({ slot: 'armor', age, nameIdx: i })}${v ? ' <b>[' + v + ']</b>' : ''}</div></div>`;
        }).join('');
        for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); cancelAnimationFrame(i); }
        document.body.innerHTML = `<div id="sheet" style="background:#f2f2f2;padding:6px;width:1470px;display:flex;flex-wrap:wrap;gap:4px">${html}</div>`;
        const keep = document.createElement('div');
        keep.id = 'app';
        keep.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
        document.body.appendChild(keep);
        return { miss, n: CELLS.length };
    }, STYLE);
    if (!info.n) { console.log('FAIL — ' + STYLE + ' 이 배정된 시대가 0곳이다(스타일 이름을 확인할 것)'); await browser.close(); process.exit(1); }
    await page.locator('#sheet').screenshot({ path: OUT });
    await browser.close();
    console.log('→ ' + OUT + ' · ' + STYLE + ' ' + info.n + '칸 · 미배정 시대 ' + info.miss.length + '건' + (info.miss.length ? ' (' + info.miss.join(',') + ')' : '') + ' · 콘솔 에러 ' + errors.length + '건');
    errors.slice(0, 6).forEach(e => console.log('  ! ' + String(e).slice(0, 300)));
})();
