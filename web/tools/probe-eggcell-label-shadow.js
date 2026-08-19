// 메인 장비 그리드 탈것 셀(.egg-cell)의 '탈것' 라벨에 외곽선(text-shadow)이 실제로 그려지는지 검증
// (slug: eggcell-slotname-noshadow).
//
// 버그: `.equip-cell.egg-cell .slot-name` 이 `var(--olc)`(형제 스코프에만 정의)를 참조해
//   text-shadow 선언 전체가 무효(computed=none)가 됐다 — 흰 라벨의 검정 외곽선이 통째로 사라짐.
// 판정: computed text-shadow 가 'none' 이 아니고 **검정 그림자 색을 실제로 담고** 있어야 한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined"');
    await page.evaluate(() => { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); });
    await page.waitForTimeout(300);

    const r = await page.evaluate(() => {
        const el = document.querySelector('.equip-cell.egg-cell .slot-name');
        if (!el) return { missing: true };
        const cs = getComputedStyle(el);
        return { text: el.textContent, shadow: cs.textShadow, color: cs.color };
    });
    await browser.close();

    let fail = 0;
    if (r.missing) { console.log('  ✗ .egg-cell .slot-name 을 못 찾음(마크업이 바뀌었나?)'); fail++; }
    else {
        console.log(`  라벨 "${r.text}" · color ${r.color} · text-shadow: ${r.shadow}`);
        // computed 는 rgb(a) 로 정규화된다. 'none' 이 아니고 어두운 그림자 색이 있어야 한다.
        const hasShadow = r.shadow && r.shadow !== 'none';
        // 검정(또는 거의 검정) 그림자 색이 실제로 담겼는지 — rgb(0, 0, 0) / rgba(0, 0, 0, ..) 존재.
        const hasBlack = /rgba?\(0,\s*0,\s*0/.test(r.shadow);
        if (!hasShadow) { console.log('  ✗ text-shadow 가 none — var() 미정의로 선언이 무효화됐다'); fail++; }
        else if (!hasBlack) { console.log('  ✗ text-shadow 에 검정 외곽선 색이 없다'); fail++; }
        else console.log('  ✓ 검정 외곽선 text-shadow 정상');
    }
    if (errs.length) { console.log(`  🚨 콘솔 에러 ${errs.length}건:`); errs.slice(0, 5).forEach(e => console.log('     · ' + e)); fail++; }
    console.log(fail ? `\n결과: FAIL ${fail}건` : '\n결과: PASS');
    process.exit(fail ? 2 : 0);
})();
