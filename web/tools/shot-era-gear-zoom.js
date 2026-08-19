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
        // ⚠️ 잣대 정합(2차 채점 후 수정): 예전 시트는 #f2f2f2 맨바닥에 투명 PNG 를 그대로 얹어
        //    실게임에 없는 밝은 배경으로 채점됐다 — 천상(크림·금)이 통째로 '빈 칸'으로 오독된 원인.
        //    실게임 셀은 .equip-cell 의 어두운 시대색 해칭(color-mix(rc 58%, #17181a)) + 검정
        //    아웃라인 드롭섀도(css .fl-face img) 위다. 그 배경을 그대로 재현해 찍는다.
        const hex = n => '#' + n.toString(16).padStart(6, '0');
        const cellBg = age => {
            const rc = hex(AGE_COLORS[age] !== undefined ? AGE_COLORS[age] : 0x6b3538);
            return `background:
                repeating-linear-gradient(45deg, rgba(0,0,0,.13) 0 2px, transparent 2px 12px),
                repeating-linear-gradient(-45deg, rgba(0,0,0,.13) 0 2px, transparent 2px 12px),
                color-mix(in srgb, ${rc} 58%, #17181a);
                border:3px solid color-mix(in srgb, ${rc} 80%, #000); border-radius:12px;`;
        };
        const OUT = 'filter: drop-shadow(2px 0 0 #000) drop-shadow(-2px 0 0 #000) drop-shadow(0 2px 0 #000) drop-shadow(0 -2px 0 #000) drop-shadow(0 3px 2px rgba(0,0,0,.28));';
        const row = (age, slot) => {
            const ai = AGES.indexOf(age);
            const styles = (slot === 'helmet' ? HELMET_STYLES : ARMOR_STYLES)[age] || [];
            const cells = styles.map((st, i) => {
                const t = Scene3D.itemThumb({ slot, age, ageIdx: ai, rarity: 'common', level: 1, main: 'atk', value: 1, subs: [], nameIdx: i });
                return `<div style="width:200px;text-align:center"><div style="${cellBg(age)}width:194px;height:194px;display:flex;align-items:center;justify-content:center"><img src="${t}" style="width:182px;height:182px;${OUT}"></div><div style="font:12px sans-serif;color:#222">${st} · ${itemNameOf({ slot, age, nameIdx: i })}</div></div>`;
            }).join('');
            return `<div style="display:flex;align-items:center;border-bottom:1px solid #ccc">
                <div style="width:76px;font:bold 13px sans-serif;color:#111">${AGE_KR[age]}<br>${slot}</div>${cells}</div>`;
        };
        // ⚠️ body 를 갈아엎기 전에 게임 타이머를 먼저 끊는다 — 안 그러면 UI 주기 갱신이
        //    사라진 노드를 잡아 `Cannot set properties of null` 을 계속 뱉는다(프로브가 만든
        //    가짜 콘솔 에러라 진짜 회귀를 덮는다).
        for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); cancelAnimationFrame(i); }
        document.body.innerHTML = `<div id="sheet" style="background:#f2f2f2;padding:6px;width:1160px">${
            ages.map(a => row(a, 'helmet') + row(a, 'armor')).join('')}</div>`;
        // ⚠️ 타이머를 끊어도 **resize 리스너**는 남는다 — 시대를 4개 이상 넘기면 시트가 뷰포트보다
        //    길어져 Playwright 가 element 스크린샷을 찍으려고 뷰포트를 늘리고, 그때 `main.js` 의
        //    `fitLayout` 이 사라진 `#app` 을 잡아 `Cannot read properties of null (reading 'style')` 을
        //    뱉는다(실측: 3시대 0건 → 4시대 1건, 스택으로 확인). **게임 회귀가 아니라 이 도구가 만든
        //    가짜 에러**라 진짜 회귀를 덮는다 — 빈 `#app` 을 남겨 fitLayout 이 조용히 지나가게 한다.
        const keep = document.createElement('div');
        keep.id = 'app';
        keep.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden';
        document.body.appendChild(keep);
    }, ARG);
    await page.locator('#sheet').screenshot({ path: require('path').join(__dirname, 'era-gear-zoom.png') });
    await browser.close();
    console.log('→ tools/era-gear-zoom.png · 콘솔 에러 ' + errors.length + '건');
    errors.slice(0, 6).forEach(e => console.log('  ! ' + String(e).slice(0, 300)));
})();
