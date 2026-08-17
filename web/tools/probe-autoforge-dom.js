// 자동 제련 팝업(shot-043117 / autoforge = 필터 OFF) 요소 실측 — 클론을 DOM rect 로 재서 원본 PNG
// 픽셀 실측치와 %W/%H 로 나란히 대조한다(전 UI 비율 전수 검증 패스).
//
// ⚠️ 짝이 한 번 뒤집혔던 화면이다 — 042950 이 필터 **ON**, 043117 이 **OFF** 다(shot-screens.js 주석).
//    기본 시드는 filterOn=false 이므로 이 프로브는 043117 과 대조한다.
// ⚠️ 측정 전에 애니메이션 무효화(swiftshader 에서 cardpop 이 scale(.7) 로 얼어붙는다).
//
// 🚨 **재교정 (2026-08-17 UI 세션) — 종전 REF 는 프레임과 카드 바닥 두 군데가 틀렸다.**
//  ⑴ 분모로 이미지 크기(494×896)를 썼는데 **앱은 491×885** 다. 043117 은 앱을 왼쪽 2px·위 13px
//     파고든 크롭이라 appL=-2 · appT=13 이다. 이 값을 넣으면 042950(필터 ON)에서 잰 것과
//     **[시작] 34.22/31.57 · ✕ 44.81/10.39 · ✕상단 89.04 · 구분선 63.84 · 시대바 13.24/73.52/15.59 가
//     소수점까지 일치**한다 — 두 컷이 같은 팝업이니 이게 프레임이 맞다는 증거다(자세한 유도는
//     `probe-affilter-dom.js` 머리말).
//  ⑵ **카드 하단 824(91.96%H)는 카드가 아니라 그 아래 탭바 요소였다.** 카드 흰 바닥은 797,
//     검정 테두리가 798~800 이라 바깥 상자는 y75~801 = **726px** 이고, 042950 의 카드(62~788)도
//     정확히 **726px** 이다. 종전 748px 은 카드를 22px 길게 본 값이고, 그 헛값에 맞춰 CSS 높이가
//     .8452 로 부풀어 [시작] 아래 흰 여백이 원본 22px 대비 51px 이었다.
//
// 원본 실측(앱 491×885 환산 · 전부 테두리 포함 바깥 상자):
//   카드        x 56~434 (11.41~88.60%W, 폭 77.19) · y 62~788 (7.01~89.04%H, 높이 82.03)
//   시대 막대    x 65~425 (13.24%W, 폭 73.52)      · 1행 y 138~167 (15.59%H, 높이 3.39 · 피치 37.25 = 4.21%H)
//   구분선       y 565 (63.84%H)
//   망치 수 상자  x 285~422 (58.04%W, 폭 28.11)     · y 576~610 (65.08%H, 높이 3.95)
//   [시작]      x 168~322 (34.22%W, 폭 31.57)      · y 688~765 (77.74%H, 높이 8.81)
//   ✕          x 217~273 (44.19%W, 폭 11.61)      · y 785~841 (88.70%H, 높이 6.44)  ← 검정 링 포함
//
// 사용: PW_PATH=<playwright> node tools/probe-autoforge-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const REF = {
    '카드 좌': { v: 11.41, unit: 'W' },
    '카드 우': { v: 88.60, unit: 'W' },
    '카드 폭': { v: 77.19, unit: 'W' },
    '카드 상단': { v: 7.01, unit: 'H' },
    '카드 하단': { v: 89.04, unit: 'H' },
    '카드 높이': { v: 82.03, unit: 'H' },
    '시대바 좌': { v: 13.24, unit: 'W' },
    '시대바 폭': { v: 73.52, unit: 'W' },
    '시대바 1행상단': { v: 15.59, unit: 'H' },
    '시대바 높이': { v: 3.39, unit: 'H' },
    '시대바 피치': { v: 4.21, unit: 'H' },
    '구분선 상단': { v: 63.84, unit: 'H' },
    '망치상자 좌': { v: 58.04, unit: 'W' },
    '망치상자 폭': { v: 28.11, unit: 'W' },
    '망치상자 상단': { v: 65.08, unit: 'H' },
    '망치상자 높이': { v: 3.95, unit: 'H' },
    '시작버튼 좌': { v: 34.22, unit: 'W' },
    '시작버튼 폭': { v: 31.57, unit: 'W' },
    '시작버튼 상단': { v: 77.74, unit: 'H' },
    '시작버튼 높이': { v: 8.81, unit: 'H' },
    '✕ 좌': { v: 44.19, unit: 'W' },
    '✕ 폭': { v: 11.61, unit: 'W' },
    '✕ 상단': { v: 88.70, unit: 'H' },
    '✕ 높이': { v: 6.44, unit: 'H' },
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 494, height: 896 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 150000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 150000 });
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

    console.log('\n자동 제련 팝업(shot-043117 · 필터 OFF) — 원본 vs 클론  [원본 앱 491×885]\n');
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
