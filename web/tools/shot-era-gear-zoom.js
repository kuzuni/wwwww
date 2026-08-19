// 시대별 방어구 실루엣 판독 시트 (equip-era-theming ②).
// age-gear.png 는 **스타일 인덱스 0·3 만** 찍어서, 시대 안에 5종씩 있는 투구/갑옷 형태 중
// 두 개만 보여 준다 — '중세 투구가 기사 투구인가'를 그걸로는 판정할 수 없다.
// 여기서는 시대 하나마다 투구 5종 · 갑옷 5종을 전부 크게 찍는다.
// 사용: node shot-era-gear-zoom.js [age...]   → tools/era-gear-zoom.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const ARG = process.argv.slice(2).length ? process.argv.slice(2) : ['primitive', 'medieval', 'divine'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1180, height: 1400 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.itemThumb');
    await page.evaluate((ages) => {
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'common', nameIdx: 0 });
        Scene3D._thumbR.setSize(200, 200); Scene3D._thumbCache = {};
        const row = (age, slot) => {
            const ai = AGES.indexOf(age);
            const styles = (slot === 'helmet' ? HELMET_STYLES : ARMOR_STYLES)[age] || [];
            const cells = styles.map((st, i) => {
                const t = Scene3D.itemThumb({ slot, age, ageIdx: ai, rarity: 'common', level: 1, main: 'atk', value: 1, subs: [], nameIdx: i });
                return `<div style="width:200px;text-align:center"><img src="${t}" style="width:196px;height:196px"><div style="font:12px sans-serif;color:#222">${st} · ${itemNameOf({ slot, age, nameIdx: i })}</div></div>`;
            }).join('');
            return `<div style="display:flex;align-items:center;border-bottom:1px solid #ccc">
                <div style="width:76px;font:bold 13px sans-serif;color:#111">${AGE_KR[age]}<br>${slot}</div>${cells}</div>`;
        };
        // ⚠️ body 를 갈아엎기 전에 게임 타이머를 먼저 끊는다 — 안 그러면 UI 주기 갱신이
        //    사라진 노드를 잡아 `Cannot set properties of null` 을 계속 뱉는다(프로브가 만든
        //    가짜 콘솔 에러라 진짜 회귀를 덮는다).
        for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); }
        document.body.innerHTML = `<div id="sheet" style="background:#f2f2f2;padding:6px;width:1160px">${
            ages.map(a => row(a, 'helmet') + row(a, 'armor')).join('')}</div>`;
    }, ARG);
    await page.locator('#sheet').screenshot({ path: require('path').join(__dirname, 'era-gear-zoom.png') });
    await browser.close();
    console.log('→ tools/era-gear-zoom.png · 콘솔 에러 ' + errors.length + '건');
    errors.slice(0, 6).forEach(e => console.log('  ! ' + String(e).slice(0, 300)));
})();
