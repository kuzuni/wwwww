// 펫 상세 팝업(shot-042449 / pet-detail) 요소 실측 — 클론을 DOM rect 로 재서 원본 PNG 픽셀
// 실측치와 %W/%H 로 나란히 대조한다(전 UI 비율 전수 검증 패스).
//
// ⚠️ 이 패스에서 반복된 함정 둘은 여기서도 그대로 적용한다(probe-forge-detail-dom.js 참조):
//   ㉠ 측정 전에 애니메이션을 무효화한다 — swiftshader 에서 `cardpop` 이 첫 프레임(scale .7)에 얼어붙는다.
//   ㉡ 잉크(글자)와 DOM 박스를 섞어 비교하지 않는다 — 색 경계가 뚜렷한 상자만 박스로 대조한다.
//     이 화면에서 그런 상자는 넷이다: 흰 카드 · 등급색 타일 · 파란[업그레이드] · 빨간[제거] · 빨간 ✕.
//
// 원본 실측(490×886, 행/열 색 구간 스캔):
//   카드      x  51~421 (10.41~86.12%W, 폭 75.71) · y 362~653 (40.86~73.81%H, 높이 32.96)
//   타일      x  68~128 (13.88~26.33%W, 폭 12.45) · y 390~451 (44.02~50.90%H, 높이  7.00)
//   업그레이드 x  87~225 (17.76~46.12%W, 폭 28.37) · y 521~583 (58.80~65.92%H, 높이  7.11)  ※ 아래 6px 은 베벨턱
//   제거      x 247~385 (50.41~78.78%W, 폭 28.37) · (세로는 업그레이드와 동일)
//   ✕        x 208~264 (42.45~53.88%W, 폭 11.63) · y 627~680 (70.77~76.75%H, 높이  5.98)
//
// 사용: PW_PATH=<playwright> node tools/probe-petdetail-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const REF = {
    '카드 좌': { v: 10.41, unit: 'W' },
    '카드 우': { v: 86.12, unit: 'W' },
    '카드 폭': { v: 75.71, unit: 'W' },
    '카드 상단': { v: 40.86, unit: 'H' },
    '카드 하단': { v: 73.81, unit: 'H' },
    '카드 높이': { v: 32.96, unit: 'H' },
    '타일 좌': { v: 13.88, unit: 'W' },
    '타일 폭': { v: 12.45, unit: 'W' },
    '타일 상단': { v: 44.02, unit: 'H' },
    '타일 높이': { v: 7.00, unit: 'H' },
    '업글버튼 좌': { v: 17.76, unit: 'W' },
    '업글버튼 폭': { v: 28.37, unit: 'W' },
    '업글버튼 상단': { v: 58.80, unit: 'H' },
    '업글버튼 높이': { v: 7.11, unit: 'H' },
    '제거버튼 좌': { v: 50.41, unit: 'W' },
    '제거버튼 우': { v: 78.78, unit: 'W' },
    '✕ 좌': { v: 42.45, unit: 'W' },
    '✕ 폭': { v: 11.63, unit: 'W' },
    '✕ 상단': { v: 70.77, unit: 'H' },
    '✕ 높이': { v: 5.98, unit: 'H' },
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 490, height: 886 }, deviceScaleFactor: 1 });
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

    // 원본과 같은 상태: 펫 탭 → 첫 펫 상세 (shot-screens.js 의 pet-detail 오프너와 동일)
    await page.evaluate(() => { UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.openPetDetail(0); });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const pw = v => +(v / W * 100).toFixed(2);
        const ph = v => +(v / H * 100).toFixed(2);
        const q = s => document.querySelector('#detail-modal ' + s);
        const card = q('.petd-card').getBoundingClientRect();
        const tile = q('.petd-tile').getBoundingClientRect();
        const btns = [...document.querySelectorAll('#detail-modal .petd-btn')].map(e => e.getBoundingClientRect());
        const x = q('.x-btn').getBoundingClientRect();
        return {
            '카드 좌': pw(card.left - app.left), '카드 우': pw(card.right - app.left), '카드 폭': pw(card.width),
            '카드 상단': ph(card.top - app.top), '카드 하단': ph(card.bottom - app.top), '카드 높이': ph(card.height),
            '타일 좌': pw(tile.left - app.left), '타일 폭': pw(tile.width),
            '타일 상단': ph(tile.top - app.top), '타일 높이': ph(tile.height),
            '업글버튼 좌': pw(btns[0].left - app.left), '업글버튼 폭': pw(btns[0].width),
            '업글버튼 상단': ph(btns[0].top - app.top), '업글버튼 높이': ph(btns[0].height),
            '제거버튼 좌': pw(btns[1].left - app.left), '제거버튼 우': pw(btns[1].right - app.left),
            '✕ 좌': pw(x.left - app.left), '✕ 폭': pw(x.width),
            '✕ 상단': ph(x.top - app.top), '✕ 높이': ph(x.height),
        };
    });

    console.log('\n펫 상세 팝업(shot-042449) — 원본 vs 클론\n');
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

    // ── 크롭 보정 열 — 원본 캡처는 앱보다 오른쪽으로 ~18px 넓다(x 488~489 는 앱이 아닌 밝은 띠).
    // 앱 중심은 x≈236(카드 236.5 · ✕ 236 · 탭바 아이콘 232.5)인데 이미지 중심은 244.5 라, 원본 쪽 x 가
    // 통째로 9px(=1.84%W) 작게 나온다. 폭은 영향이 없다(카드 폭 Δ −0.01%p). 가로 위치의 +1.5~1.9%p 는
    // 전부 이 계통 오차이므로, 중심을 맞춰 다시 뺀 값을 함께 남긴다 — 이게 실제 어긋남이다.
    const SHIFT = 1.84;
    const posKeys = Object.keys(REF).filter(k => REF[k].unit === 'W' && !k.includes('폭'));
    console.log('\n[크롭 보정] 원본 x + 1.84%p (앱 중심 정렬) 기준 — 가로 위치의 진짜 어긋남');
    let cw = 0;
    for (const k of posKeys) {
        const d = +(m[k] - (REF[k].v + SHIFT)).toFixed(2);
        if (Math.abs(d) > Math.abs(cw)) cw = d;
        console.log('  ' + k.padEnd(12) + (REF[k].v + SHIFT).toFixed(2).padStart(8) + m[k].toFixed(2).padStart(9) + `${d > 0 ? '+' : ''}${d}`.padStart(9));
    }
    console.log(`  → 보정 후 최대 ${cw > 0 ? '+' : ''}${cw}%p`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
