// 펫 업그레이드 팝업(shot-042503 / pet-upgrade) 요소 실측 — 클론을 DOM rect 로 재서 원본 PNG 픽셀
// 실측치와 %W/%H 로 나란히 대조한다(전 UI 비율 전수 검증 패스).
//
// ⚠️ 측정 전에 애니메이션을 무효화한다 — swiftshader 에서 `cardpop` 이 첫 프레임(scale .7)에 얼어붙는다.
// ⚠️ 잉크(글자)와 DOM 박스를 섞지 않는다 — 테두리가 보이는 상자만 대조한다.
// ✅ 이 원본은 pet-detail(shot-042449)과 달리 **크롭 쏠림이 없다**(카드 중심 250 vs 이미지 중심 252).
//
// 원본 실측(505×889, 행/열 색 구간 스캔):
//   카드      x  65~435 (12.87~86.14%W, 폭 73.47) · y  97~790 (10.91~88.86%H, 높이 78.07)
//   회색 패널  x  74~426 (14.65%W, 폭 69.70)      · y 108~294 (12.15%H, 높이 21.03)
//     ↑ 3px 검은 테두리까지 포함한 값이다(회색 면만 재면 77~423). 클론 DOM rect 는 테두리 포함이므로
//       양쪽 기준을 맞춰야 한다 — 한쪽만 부속 포함이 TODO 상단 '채점 함정 ①' 그 자체다.
//   경험치 바  x  88~411 (17.43%W, 폭 64.16)      · y 201~230 (22.61%H, 높이  3.37)
//   업그레이드 x 334~410 (66.14%W, 폭 15.25)      · y 249~287 (28.01%H, 높이  4.39)
//   그리드 타일 x 85~139 (16.83%W, 폭 10.89, 피치 69 = 13.66%W) · y 400~450 (45.00%H, 높이 5.62)
//   ✕        x 222~278 (43.96%W, 폭 11.29)      · y 766~815 (86.16%H, 높이  5.62)
//
// 🚨 그리드 **세로 위치**는 게이트 대상이 아니다 — 원본의 '선택 슬롯 1칸 + 밑줄 5개' 행을 클론은
//    사용자 지시로 '등급별 일괄 선택 버튼 행 + 구분선'으로 대체했다(renderPetUpgrade 주석). 의도된 차이라
//    참고로만 찍는다. 가로(좌·폭·피치)는 같은 그리드이므로 그대로 게이트에 넣는다.
//
// 사용: PW_PATH=<playwright> node tools/probe-petupgrade-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const REF = {
    '카드 좌': { v: 12.87, unit: 'W' },
    '카드 우': { v: 86.14, unit: 'W' },
    '카드 폭': { v: 73.47, unit: 'W' },
    '카드 상단': { v: 10.91, unit: 'H' },
    '카드 하단': { v: 88.86, unit: 'H' },
    '카드 높이': { v: 78.07, unit: 'H' },
    '패널 좌': { v: 14.65, unit: 'W' },
    '패널 폭': { v: 69.70, unit: 'W' },
    '패널 상단': { v: 12.15, unit: 'H' },
    '패널 높이': { v: 21.03, unit: 'H' },
    '경험치바 좌': { v: 17.43, unit: 'W' },
    '경험치바 폭': { v: 64.16, unit: 'W' },
    '경험치바 상단': { v: 22.61, unit: 'H' },
    '경험치바 높이': { v: 3.37, unit: 'H' },
    '업글버튼 좌': { v: 66.14, unit: 'W' },
    '업글버튼 폭': { v: 15.25, unit: 'W' },
    '업글버튼 상단': { v: 28.01, unit: 'H' },
    '업글버튼 높이': { v: 4.39, unit: 'H' },
    '타일 좌': { v: 16.83, unit: 'W' },
    '타일 폭': { v: 10.89, unit: 'W' },
    '타일 피치': { v: 13.66, unit: 'W' },
    '타일 높이': { v: 5.62, unit: 'H' },
    '✕ 좌': { v: 43.96, unit: 'W' },
    '✕ 폭': { v: 11.29, unit: 'W' },
    '✕ 상단': { v: 86.16, unit: 'H' },
    '✕ 높이': { v: 5.62, unit: 'H' },
};
// 게이트에서 빼고 참고로만 찍는 항목(위 🚨 참조)
const INFO = { '타일 상단': { v: 45.00, unit: 'H' } };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 505, height: 889 }, deviceScaleFactor: 1 });
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

    // 원본과 같은 상태 (shot-screens.js 의 pet-upgrade 오프너와 동일)
    await page.evaluate(() => { UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.openPetUpgrade(0); });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const pw = v => +(v / W * 100).toFixed(2);
        const ph = v => +(v / H * 100).toFixed(2);
        const q = s => document.querySelector('#pet-upgrade-modal ' + s);
        const card = q('.petup-card').getBoundingClientRect();
        const panel = q('.petup-panel').getBoundingClientRect();
        const bar = q('.petup-xpbar').getBoundingClientRect();
        const btn = q('.petup-selrow .btn').getBoundingClientRect();
        const tiles = [...document.querySelectorAll('#pet-upgrade-modal .mat-grid .pet-tile')].map(e => e.getBoundingClientRect());
        const x = q('.x-btn').getBoundingClientRect();
        // 타일 피치 = 같은 행에서 이웃한 두 타일의 좌 간격
        const t0 = tiles[0], t1 = tiles.find(t => t.top === t0.top && t.left > t0.left);
        return {
            '카드 좌': pw(card.left - app.left), '카드 우': pw(card.right - app.left), '카드 폭': pw(card.width),
            '카드 상단': ph(card.top - app.top), '카드 하단': ph(card.bottom - app.top), '카드 높이': ph(card.height),
            '패널 좌': pw(panel.left - app.left), '패널 폭': pw(panel.width),
            '패널 상단': ph(panel.top - app.top), '패널 높이': ph(panel.height),
            '경험치바 좌': pw(bar.left - app.left), '경험치바 폭': pw(bar.width),
            '경험치바 상단': ph(bar.top - app.top), '경험치바 높이': ph(bar.height),
            '업글버튼 좌': pw(btn.left - app.left), '업글버튼 폭': pw(btn.width),
            '업글버튼 상단': ph(btn.top - app.top), '업글버튼 높이': ph(btn.height),
            '타일 좌': pw(t0.left - app.left), '타일 폭': pw(t0.width),
            '타일 피치': t1 ? pw(t1.left - t0.left) : NaN, '타일 높이': ph(t0.height),
            '타일 상단': ph(t0.top - app.top),
            '✕ 좌': pw(x.left - app.left), '✕ 폭': pw(x.width),
            '✕ 상단': ph(x.top - app.top), '✕ 높이': ph(x.height),
        };
    });

    console.log('\n펫 업그레이드 팝업(shot-042503) — 원본 vs 클론\n');
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
    console.log('\n[참고 · 게이트 제외] 원본의 슬롯행을 클론이 일괄선택행으로 바꾼 자리라 세로가 다르다');
    for (const [k, ref] of Object.entries(INFO))
        console.log('  ' + k.padEnd(12) + ref.v.toFixed(2).padStart(8) + m[k].toFixed(2).padStart(9) + `${(m[k] - ref.v).toFixed(2)}`.padStart(9));
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
