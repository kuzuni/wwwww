// 자동 제련 팝업(shot-043117 / autoforge = 필터 OFF) 요소 실측 — 클론을 DOM rect 로 재서 원본 PNG
// 픽셀 실측치와 %W/%H 로 나란히 대조한다(전 UI 비율 전수 검증 패스).
//
// ⚠️ 짝이 한 번 뒤집혔던 화면이다 — 042950 이 필터 **ON**, 043117 이 **OFF** 다(shot-screens.js 주석).
//    기본 시드는 filterOn=false 이므로 이 프로브는 043117 과 대조한다.
// ⚠️ 측정 전에 애니메이션 무효화(swiftshader 에서 cardpop 이 scale(.7) 로 얼어붙는다).
//
// 원본 실측(494×896, 행/열 색 구간 스캔):
//   카드        x 56~430 (11.34~87.04%W, 폭 75.91) · y 77~824 (8.59~91.96%H, 높이 83.48)
//   시대 막대    x 62~424 (12.55%W, 폭 73.48)      · 1행 y 152~180 (16.96%H, 높이 3.24 · 피치 37 = 4.13%H)
//   구분선       y 574 (64.06%H)
//   망치 수 상자  x 283~420 (57.29%W, 폭 27.94)     · y 589~623 (65.74%H, 높이 3.91)
//   [시작]      x 166~320 (33.60%W, 폭 31.38)      · y 700~770 (78.13%H, 높이 7.92)
//   ✕          x 215~271 (43.52%W, 폭 11.54)      · y 797~851 (88.95%H, 높이 6.14)
//
// 사용: PW_PATH=<playwright> node tools/probe-autoforge-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const REF = {
    '카드 좌': { v: 11.34, unit: 'W' },
    '카드 우': { v: 87.04, unit: 'W' },
    '카드 폭': { v: 75.91, unit: 'W' },
    '카드 상단': { v: 8.59, unit: 'H' },
    '카드 하단': { v: 91.96, unit: 'H' },
    '카드 높이': { v: 83.48, unit: 'H' },
    '시대바 좌': { v: 12.55, unit: 'W' },
    '시대바 폭': { v: 73.48, unit: 'W' },
    '시대바 1행상단': { v: 16.96, unit: 'H' },
    '시대바 높이': { v: 3.24, unit: 'H' },
    '시대바 피치': { v: 4.13, unit: 'H' },
    '구분선 상단': { v: 64.06, unit: 'H' },
    '망치상자 좌': { v: 57.29, unit: 'W' },
    '망치상자 폭': { v: 27.94, unit: 'W' },
    '망치상자 상단': { v: 65.74, unit: 'H' },
    '망치상자 높이': { v: 3.91, unit: 'H' },
    '시작버튼 좌': { v: 33.60, unit: 'W' },
    '시작버튼 폭': { v: 31.38, unit: 'W' },
    '시작버튼 상단': { v: 78.13, unit: 'H' },
    '시작버튼 높이': { v: 7.92, unit: 'H' },
    '✕ 좌': { v: 43.52, unit: 'W' },
    '✕ 폭': { v: 11.54, unit: 'W' },
    '✕ 상단': { v: 88.95, unit: 'H' },
    '✕ 높이': { v: 6.14, unit: 'H' },
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 494, height: 896 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 30000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 30000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; });
    await page.waitForTimeout(600);

    await page.evaluate(() => { UI.openAutoForge(); });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const pw = v => +(v / W * 100).toFixed(2);
        const ph = v => +(v / H * 100).toFixed(2);
        const q = s => document.querySelector('#autoforge-modal ' + s);
        const card = q('.af-card').getBoundingClientRect();
        const bars = [...document.querySelectorAll('#autoforge-modal .af-age-bar')].map(e => e.getBoundingClientRect());
        const bottom = q('.af-bottom').getBoundingClientRect();
        const dd = q('.af-dd').getBoundingClientRect();
        const start = q('.af-start').getBoundingClientRect();
        const x = q('.x-btn').getBoundingClientRect();
        return {
            '카드 좌': pw(card.left - app.left), '카드 우': pw(card.right - app.left), '카드 폭': pw(card.width),
            '카드 상단': ph(card.top - app.top), '카드 하단': ph(card.bottom - app.top), '카드 높이': ph(card.height),
            '시대바 좌': pw(bars[0].left - app.left), '시대바 폭': pw(bars[0].width),
            '시대바 1행상단': ph(bars[0].top - app.top), '시대바 높이': ph(bars[0].height),
            '시대바 피치': ph(bars[1].top - bars[0].top),
            '구분선 상단': ph(bottom.top - app.top),
            '망치상자 좌': pw(dd.left - app.left), '망치상자 폭': pw(dd.width),
            '망치상자 상단': ph(dd.top - app.top), '망치상자 높이': ph(dd.height),
            '시작버튼 좌': pw(start.left - app.left), '시작버튼 폭': pw(start.width),
            '시작버튼 상단': ph(start.top - app.top), '시작버튼 높이': ph(start.height),
            '✕ 좌': pw(x.left - app.left), '✕ 폭': pw(x.width),
            '✕ 상단': ph(x.top - app.top), '✕ 높이': ph(x.height),
        };
    });

    console.log('\n자동 제련 팝업(shot-043117 · 필터 OFF) — 원본 vs 클론\n');
    console.log('요소'.padEnd(16) + '원본'.padStart(8) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0, ng = [];
    for (const [k, ref] of Object.entries(REF)) {
        const got = m[k], d = +(got - ref.v).toFixed(2);
        if (Math.abs(d) > Math.abs(worst)) worst = d;
        const ok = Math.abs(d) <= 2;
        if (!ok) ng.push(`${k} ${d > 0 ? '+' : ''}${d}%p`);
        console.log(k.padEnd(14) + `%${ref.unit}`.padStart(3) + ref.v.toFixed(2).padStart(8) + got.toFixed(2).padStart(9) + `${d > 0 ? '+' : ''}${d}`.padStart(9) + (ok ? '  ok' : '  ← ±2%p 초과'));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
