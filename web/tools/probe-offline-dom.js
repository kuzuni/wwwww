// 오프라인 보상 팝업(shot-042110 / offline) 요소 실측 — 클론을 DOM rect로 재서 원본 PNG 픽셀
// 실측치와 %W/%H로 나란히 대조한다(전 UI 비율 전수 검증 패스).
//
// ⚠️ 이 패스에서 두 번 데인 함정 둘은 여기서도 그대로 적용한다(probe-forge-detail-dom.js 참조):
//   ㉠ 측정 전에 애니메이션을 무효화한다 — swiftshader에서 `cardpop`이 첫 프레임(scale .7)에 얼어붙는다.
//   ㉡ 잉크(글자)와 DOM 박스를 섞어 비교하지 않는다 — 색 경계가 뚜렷한 상자만 박스로 대조한다.
//     이 화면에서 그런 상자는 넷이다: 카드 · 짙은 상단부 · 흰 하단부 · 파란 [수집] 버튼.
//
// 원본 실측(500×893, 컬럼 x=30%W + 행 스캔):
//   카드 x 15.20~84.20%W(폭 69.00) · 짙은 상단 22.93~45.75%H · 흰 하단 46.20~77.29%H
//   [수집] 버튼 x 34.40~64.80%W · 카드 전체 22.93~77.29%H(높이 54.36)
//
// 사용: node tools/probe-offline-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const REF = {
    '카드 좌':       { v: 15.20, unit: 'W' },
    '카드 우':       { v: 84.20, unit: 'W' },
    '카드 폭':       { v: 69.00, unit: 'W' },
    '카드 상단':     { v: 22.93, unit: 'H' },
    '카드 하단':     { v: 77.29, unit: 'H' },
    '카드 높이':     { v: 54.36, unit: 'H' },
    '짙은부 하단':   { v: 45.75, unit: 'H' },
    '짙은부 높이':   { v: 22.82, unit: 'H' },
    '흰부 상단':     { v: 46.20, unit: 'H' },
    '흰부 높이':     { v: 31.09, unit: 'H' },
    '수집버튼 좌':   { v: 34.40, unit: 'W' },
    '수집버튼 우':   { v: 64.80, unit: 'W' },
    '수집버튼 폭':   { v: 30.40, unit: 'W' },
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
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

    // 원본과 같은 상태: 4시간 누적분 미리보기 (shot-screens.js의 offline 오프너와 동일)
    await page.evaluate(() => { UI.closeAllTabSurfaces(); UI.showOffline(offlineRewardFor(4 * 3600)); });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const pw = v => +(v / W * 100).toFixed(2);
        const ph = v => +(v / H * 100).toFixed(2);
        const r = s => { const e = document.querySelector('#offline-modal ' + s); return e ? e.getBoundingClientRect() : null; };
        const card = r('.offline-card'), top = r('.offline-top'), bot = r('.offline-bottom'), btn = r('.offline-collect-btn');
        return {
            '카드 좌': pw(card.left - app.left), '카드 우': pw(card.right - app.left), '카드 폭': pw(card.width),
            '카드 상단': ph(card.top - app.top), '카드 하단': ph(card.bottom - app.top), '카드 높이': ph(card.height),
            '짙은부 하단': ph(top.bottom - app.top), '짙은부 높이': ph(top.height),
            '흰부 상단': ph(bot.top - app.top), '흰부 높이': ph(bot.height),
            '수집버튼 좌': pw(btn.left - app.left), '수집버튼 우': pw(btn.right - app.left), '수집버튼 폭': pw(btn.width),
        };
    });

    console.log('\n오프라인 보상 팝업(shot-042110) — 원본 vs 클론\n');
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
