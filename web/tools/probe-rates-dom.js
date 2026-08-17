// 소환 확률 팝업(shot-042521 / summon-rates) 요소 실측 — 클론을 DOM rect 로 재서 원본 PNG 픽셀
// 실측치와 %W/%H 로 나란히 대조한다(전 UI 비율 전수 검증 패스).
//
// ⚠️ 측정 전에 애니메이션 무효화(swiftshader 에서 cardpop 이 scale(.7) 로 얼어붙는다).
// ⚠️ 원본은 **펫** 확률표(레벨 69 · '달걀을 소환하여')다 — 스킬로 열면 배경 그리드·문구가 달라진다.
//    그래서 이 프로브도 `openSummonRates('pet')` 로 연다(shot-screens.js 오프너도 같이 맞췄다).
//
// 원본 실측(499×894, 행/열 색 구간 스캔):
//   카드     x 60~430 (12.02~86.17%W, 폭 74.35) · y 200~689 (22.37~77.07%H, 높이 54.81)
//   ◀ 버튼   x 85~114 (17.03%W, 폭  6.01)       · y 219~253 (24.50%H, 높이  3.91)
//   ⓘ       x 393~413 (78.76%W, 폭  4.21)       · y 278~298 (31.10%H)
//   등급 바   x 77~413 (15.43%W, 폭 67.53)       · 1행 y 306~334 (34.23%H, 높이 3.24 · 피치 33 = 3.69%H)
//   진행 바   x 85~406 (17.03%W, 폭 64.53)       · y 596~621 (66.67%H, 높이  2.91)
//   ✕       x 217~273 (43.49%W, 폭 11.42)       · y 664~716 (74.27%H, 높이  5.93)
//
// 사용: PW_PATH=<playwright> node tools/probe-rates-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const REF = {
    '카드 좌': { v: 12.02, unit: 'W' },
    '카드 우': { v: 86.17, unit: 'W' },
    '카드 폭': { v: 74.35, unit: 'W' },
    '카드 상단': { v: 22.37, unit: 'H' },
    '카드 하단': { v: 77.07, unit: 'H' },
    '카드 높이': { v: 54.81, unit: 'H' },
    '◀ 좌': { v: 17.03, unit: 'W' },
    '◀ 폭': { v: 6.01, unit: 'W' },
    '◀ 상단': { v: 24.50, unit: 'H' },
    '◀ 높이': { v: 3.91, unit: 'H' },
    'ⓘ 좌': { v: 78.76, unit: 'W' },
    'ⓘ 폭': { v: 4.21, unit: 'W' },
    'ⓘ 상단': { v: 31.10, unit: 'H' },
    '등급바 좌': { v: 15.43, unit: 'W' },
    '등급바 폭': { v: 67.53, unit: 'W' },
    '등급바 1행상단': { v: 34.23, unit: 'H' },
    '등급바 높이': { v: 3.24, unit: 'H' },
    '등급바 피치': { v: 3.69, unit: 'H' },
    '진행바 좌': { v: 17.03, unit: 'W' },
    '진행바 폭': { v: 64.53, unit: 'W' },
    '진행바 상단': { v: 66.67, unit: 'H' },
    '진행바 높이': { v: 2.91, unit: 'H' },
    '✕ 좌': { v: 43.49, unit: 'W' },
    '✕ 폭': { v: 11.42, unit: 'W' },
    '✕ 상단': { v: 74.27, unit: 'H' },
    '✕ 높이': { v: 5.93, unit: 'H' },
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 894 }, deviceScaleFactor: 1 });
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

    await page.evaluate(() => { UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.openSummonRates('pet'); });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const pw = v => +(v / W * 100).toFixed(2);
        const ph = v => +(v / H * 100).toFixed(2);
        const q = s => document.querySelector('#detail-modal ' + s);
        const card = q('.rates-card').getBoundingClientRect();
        const tri = q('.tri-btn').getBoundingClientRect();
        const info = q('.rates-i').getBoundingClientRect();
        const bars = [...document.querySelectorAll('#detail-modal .rate-bar')].map(e => e.getBoundingClientRect());
        const prog = q('.rates-prog').getBoundingClientRect();
        const x = q('.x-btn').getBoundingClientRect();
        return {
            '카드 좌': pw(card.left - app.left), '카드 우': pw(card.right - app.left), '카드 폭': pw(card.width),
            '카드 상단': ph(card.top - app.top), '카드 하단': ph(card.bottom - app.top), '카드 높이': ph(card.height),
            '◀ 좌': pw(tri.left - app.left), '◀ 폭': pw(tri.width),
            '◀ 상단': ph(tri.top - app.top), '◀ 높이': ph(tri.height),
            'ⓘ 좌': pw(info.left - app.left), 'ⓘ 폭': pw(info.width), 'ⓘ 상단': ph(info.top - app.top),
            '등급바 좌': pw(bars[0].left - app.left), '등급바 폭': pw(bars[0].width),
            '등급바 1행상단': ph(bars[0].top - app.top), '등급바 높이': ph(bars[0].height),
            '등급바 피치': ph(bars[1].top - bars[0].top),
            '진행바 좌': pw(prog.left - app.left), '진행바 폭': pw(prog.width),
            '진행바 상단': ph(prog.top - app.top), '진행바 높이': ph(prog.height),
            '✕ 좌': pw(x.left - app.left), '✕ 폭': pw(x.width),
            '✕ 상단': ph(x.top - app.top), '✕ 높이': ph(x.height),
        };
    });

    console.log('\n소환 확률 팝업(shot-042521) — 원본 vs 클론\n');
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
