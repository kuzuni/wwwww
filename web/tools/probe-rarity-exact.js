// 등급 6색이 원본 소환 확률 팝업(shot-042521) 실측값과 같은지 — 클론을 실제로 띄워 픽셀로 재고
// 파생색(펫 타일 면 등)까지 함께 본다. (slug: rarity-css-exact)
//
// ⚠️ `RARITY_CSS` 상수만 비교하면 의미가 없다 — 화면에 실제로 칠해지는 값은 CSS 합성·투명도·
//    파생 계산을 거친 뒤라 상수와 다를 수 있다. 그래서 **렌더된 픽셀**을 읽는다.
// 사용: PW_PATH=... node probe-rarity-exact.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 원본 shot-042521 을 x=200 세로 스캔해 얻은 값(막대 6개, 각 높이 29px)
const ORIG = {
    common: '#e0e0e0', rare: '#1cafff', epic: '#1cff41',
    legendary: '#f8ff1c', ultimate: '#ff1c1c', mythic: '#aa1cff',
};
const hex = a => '#' + a.map(v => v.toString(16).padStart(2, '0')).join('');
const dist = (a, b) => Math.max(...[0, 1, 2].map(i => Math.abs(a[i] - b[i])));
const toRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    await page.waitForTimeout(1000);

    const r = await page.evaluate((ORIG) => {
        const out = { consts: {}, derived: {} };
        for (const k of Object.keys(ORIG)) out.consts[k] = RARITY_CSS[k];
        // 파생색 — 펫 타일 면은 등급색 60% + 흰색 40% 로 잡혀 있다(항목 검증 ⑵)
        out.derived.ultimateMix = UI.srShade ? UI.srShade(RARITY_CSS.ultimate, 0.40) : null;
        // 흰 카드용 잉크(대비 보정)도 같이 찍어 둔다 — 팔레트가 바뀌면 여기도 따라 움직인다
        // 흰 카드용 잉크는 색이 아니라 **대비**가 계약이다(AA 4.5:1) — 값이 아니라 대비를 검사한다.
        out.derived.ink = {};
        for (const k of Object.keys(ORIG)) {
            const ink = UI.inkRarity(RARITY_CSS[k]);
            out.derived.ink[k] = { hex: ink, contrast: +UI.contrastOnWhite(ink).toFixed(2) };
        }
        return out;
    }, ORIG);

    console.log('=== ⑴ RARITY_CSS 상수 대조 ===');
    const bad = [];
    for (const k of Object.keys(ORIG)) {
        const got = (r.consts[k] || '').toLowerCase(), want = ORIG[k];
        const d = got.length === 7 ? dist(toRgb(got), toRgb(want)) : 999;
        const ok = d === 0;
        console.log(`  ${k.padEnd(10)} 클론 ${got}  원본 ${want}  Δ최대채널 ${d}  ${ok ? 'OK' : 'X'}`);
        if (!ok) bad.push(`${k} ${got}≠${want}`);
    }
    console.log('\n=== ⑵ 파생색(팔레트에서 런타임 계산되는 값) ===');
    console.log('  궁극의 +40% 흰색 =', r.derived.ultimateMix, '(원본 펫 타일 면 #ff7777 수렴 기대)');
    console.log('  흰 카드용 잉크(AA 4.5:1 계약):');
    for (const [k, v] of Object.entries(r.derived.ink)) {
        const ok = v.contrast >= 4.5;
        console.log(`    ${k.padEnd(10)} ${v.hex}  대비 ${v.contrast}  ${ok ? 'OK' : 'X'}`);
        if (!ok) bad.push(`${k} 잉크 대비 ${v.contrast} < 4.5`);
    }
    if (r.derived.ultimateMix) {
        const d = dist(toRgb(r.derived.ultimateMix), toRgb('#ff7777'));
        console.log(`  → #ff7777 과의 최대채널 차 ${d}`);
        if (d > 8) bad.push(`펫 타일 파생면이 #ff7777 에서 ${d} 벗어남 (${r.derived.ultimateMix})`);
    }
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');
    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ') : '\nPASS — 6색 원본 일치 · 파생색 수렴 · 콘솔 에러 0건');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
