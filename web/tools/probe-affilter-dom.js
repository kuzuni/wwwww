// 자동 제련 팝업 — **필터 ON**(shot-042950 / autoforge-filter) 요소 실측.
// 클론을 DOM rect 로 재서 원본 PNG 픽셀 실측치와 %W/%H 로 나란히 대조한다(전 UI 비율 전수 검증 패스).
//
// ⚠️ 짝이 한 번 뒤집혔던 화면이다 — 042950 이 필터 **ON**, 043117 이 **OFF** 다(shot-screens.js 주석).
//    필터 OFF 쪽은 `probe-autoforge-dom.js` 가 043117 로 따로 잰다.
//
// 🚨 **원본의 앱 폭은 이미지 폭이 아니다 — 491px 이다** (인계 메모 ㉠ '원본 이미지가 앱보다 넓은 사례'의 4번째).
//    이미지는 503×885 인데 **x 497~502 의 6px 은 전 행(885/885)이 rgb(35,38,66) 한 색**으로, 게임 화면이 아니라
//    캡처 기기의 세로 띠다. 앱 폭은 **가운데 정렬된 요소 3개가 전부 같은 중심**을 가리켜 확정했다:
//      카드 58~432(중심 245) · [시작] 171~319(중심 245) · ✕ 220~270(중심 245)  → appL=0 이면 appW=491.
//    같은 팝업의 다른 컷(043117, 494×896)으로 교차검증하면 **카드/✕/[시작]의 픽셀 크기가 셋 다 완전히 같고**
//    (카드 375 · ✕ 51 · 버튼 149) 중심만 243 이다 = 그 컷은 왼쪽을 2px 더 파고든 크롭이라 appL=-2,
//    따라서 -2+(w-1)/2=243 → **w=491 로 두 컷이 같은 값**에 떨어진다.
//    → 이미지 폭(503 또는 494)을 분모로 쓰면 가로가 통째로 2~2.5%p 좁게 나온다. 이 프로브는 491 을 쓴다.
//
// 원본 실측(앱 491×885 기준 · 전부 '보이는 잉크' = 테두리 포함 바깥 상자):
//   카드        x  56~434 (11.41%W, 폭 77.19) · y  62~787 ( 7.01%H, 높이 82.03)   ← 검정 2px 테두리 포함
//   시대 막대    x  65~425 (13.24%W, 폭 73.52) · 1행 y 138~167 (15.59%H, 높이 3.39 · 피치 37.25 = 4.21%H)
//   필터 토글    x 383~426 (78.00%W, 폭  8.96) · y 332~358 (37.51%H, 높이 3.05)   ← 트랙+노브 합집합(노브가 밖으로 튄다)
//   옵션 pill    x  63~427 (12.83%W, 폭 74.34) · 1행 y 371~399 (41.92%H, 높이 3.28 · 피치 37.25 = 4.21%H)
//   구분선       y 565 (63.84%H)                                                  ← .af-bottom 위 검정 2px
//   망치 스피너   x 285~422 (58.04%W, 폭 28.11) · y 576~610 (65.08%H, 높이 3.95)
//   목표행 체크   x 399~421 (81.26%W, 폭  4.68) · y 637~660 (71.98%H, 높이 2.71)
//   [시작]      x 168~322 (34.22%W, 폭 31.57) · y 688~765 (77.74%H, 높이 8.81)
//   ✕          x 217~273 (44.19%W, 폭 11.61) · y 785~841 (88.70%H, 높이 6.44)
//     ⚠️ ✕ 는 **검정 링까지 포함한 바깥 원**으로 잰다(채점 함정 ① '한쪽만 부속 포함').
//        색으로 잡히는 건 빨강 원(220~270 = 51px)뿐이고 링은 딤 배경과 같은 검정이라 안 잡힌다 —
//        x=245 열이 785(51,51,51)·786~787(0,0,0)·788부터 빨강이라 링은 3px, 바깥 원 = 51+6 = 57px 이다.
//
// 사용: PW_PATH=<playwright> node tools/probe-affilter-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 이 컨테이너는 병렬 세션이 소프트웨어 GL 로 붙어 있어 부팅이 60초를 넘는 일이 잦다 — 20초로는 못 잰다.
const T = 150000;

const REF = {
    '카드 좌': { v: 11.41, unit: 'W' },
    '카드 폭': { v: 77.19, unit: 'W' },
    '카드 상단': { v: 7.01, unit: 'H' },
    '카드 높이': { v: 82.03, unit: 'H' },
    '시대바 좌': { v: 13.24, unit: 'W' },
    '시대바 폭': { v: 73.52, unit: 'W' },
    '시대바 1행상단': { v: 15.59, unit: 'H' },
    '시대바 높이': { v: 3.39, unit: 'H' },
    '시대바 피치': { v: 4.21, unit: 'H' },
    '토글 좌': { v: 78.00, unit: 'W' },
    '토글 폭': { v: 8.96, unit: 'W' },
    '토글 상단': { v: 37.51, unit: 'H' },
    '토글 높이': { v: 3.05, unit: 'H' },
    '옵션 좌': { v: 12.83, unit: 'W' },
    '옵션 폭': { v: 74.34, unit: 'W' },
    '옵션 1행상단': { v: 41.92, unit: 'H' },
    '옵션 높이': { v: 3.28, unit: 'H' },
    '옵션 피치': { v: 4.21, unit: 'H' },
    '구분선 상단': { v: 63.84, unit: 'H' },
    '스피너 좌': { v: 58.04, unit: 'W' },
    '스피너 폭': { v: 28.11, unit: 'W' },
    '스피너 상단': { v: 65.08, unit: 'H' },
    '스피너 높이': { v: 3.95, unit: 'H' },
    '목표체크 좌': { v: 81.26, unit: 'W' },
    '목표체크 폭': { v: 4.68, unit: 'W' },
    '목표체크 상단': { v: 71.98, unit: 'H' },
    '목표체크 높이': { v: 2.71, unit: 'H' },
    '시작 좌': { v: 34.22, unit: 'W' },
    '시작 폭': { v: 31.57, unit: 'W' },
    '시작 상단': { v: 77.74, unit: 'H' },
    '시작 높이': { v: 8.81, unit: 'H' },
    '✕ 좌': { v: 44.19, unit: 'W' },
    '✕ 폭': { v: 11.61, unit: 'W' },
    '✕ 상단': { v: 88.70, unit: 'H' },
    '✕ 높이': { v: 6.44, unit: 'H' },
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: T });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: T });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; });
    await page.waitForTimeout(600);

    await page.evaluate(() => { S.autoForge.filterOn = true; UI.openAutoForge(); });
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
        const subs = [...document.querySelectorAll('#autoforge-modal .af-sub-row')].map(e => e.getBoundingClientRect());
        // 토글은 트랙 밖으로 튀어나온 노브까지가 '보이는 잉크'다 — 원본도 그렇게 쟀다.
        const tg = q('.af-toggle').getBoundingClientRect(), kn = q('.af-toggle .knob').getBoundingClientRect();
        const tog = {
            left: Math.min(tg.left, kn.left), right: Math.max(tg.right, kn.right),
            top: Math.min(tg.top, kn.top), bottom: Math.max(tg.bottom, kn.bottom),
        };
        const bottom = q('.af-bottom').getBoundingClientRect();
        const dd = q('.af-spinner').getBoundingClientRect();
        const tchk = q('.af-row:last-of-type .af-check').getBoundingClientRect();
        const start = q('.af-start').getBoundingClientRect();
        const x = q('.x-btn').getBoundingClientRect();
        return {
            '카드 좌': pw(card.left - app.left), '카드 폭': pw(card.width),
            '카드 상단': ph(card.top - app.top), '카드 높이': ph(card.height),
            '시대바 좌': pw(bars[0].left - app.left), '시대바 폭': pw(bars[0].width),
            '시대바 1행상단': ph(bars[0].top - app.top), '시대바 높이': ph(bars[0].height),
            '시대바 피치': ph(bars[1].top - bars[0].top),
            '토글 좌': pw(tog.left - app.left), '토글 폭': pw(tog.right - tog.left),
            '토글 상단': ph(tog.top - app.top), '토글 높이': ph(tog.bottom - tog.top),
            '옵션 좌': pw(subs[0].left - app.left), '옵션 폭': pw(subs[0].width),
            '옵션 1행상단': ph(subs[0].top - app.top), '옵션 높이': ph(subs[0].height),
            '옵션 피치': ph(subs[1].top - subs[0].top),
            '구분선 상단': ph(bottom.top - app.top),
            '스피너 좌': pw(dd.left - app.left), '스피너 폭': pw(dd.width),
            '스피너 상단': ph(dd.top - app.top), '스피너 높이': ph(dd.height),
            '목표체크 좌': pw(tchk.left - app.left), '목표체크 폭': pw(tchk.width),
            '목표체크 상단': ph(tchk.top - app.top), '목표체크 높이': ph(tchk.height),
            '시작 좌': pw(start.left - app.left), '시작 폭': pw(start.width),
            '시작 상단': ph(start.top - app.top), '시작 높이': ph(start.height),
            '✕ 좌': pw(x.left - app.left), '✕ 폭': pw(x.width),
            '✕ 상단': ph(x.top - app.top), '✕ 높이': ph(x.height),
            _sub: subs.length, _bar: bars.length,
        };
    });

    console.log('\n자동 제련 팝업 · 필터 ON(shot-042950) — 원본 vs 클론  [원본 앱 491×885]\n');
    console.log('요소'.padEnd(16) + '원본'.padStart(8) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0, ng = [];
    for (const [k, ref] of Object.entries(REF)) {
        const got = m[k], d = +(got - ref.v).toFixed(2);
        if (Math.abs(d) > Math.abs(worst)) worst = d;
        const ok = Math.abs(d) <= 2;
        if (!ok) ng.push(`${k} ${d > 0 ? '+' : ''}${d}%p`);
        console.log(k.padEnd(14) + `%${ref.unit}`.padStart(3) + ref.v.toFixed(2).padStart(8) + got.toFixed(2).padStart(9) + `${d > 0 ? '+' : ''}${d}`.padStart(9) + (ok ? '  ok' : '  ← ±2%p 초과'));
    }
    console.log(`\n시대 막대 ${m._bar}줄 · 옵션 행 ${m._sub}줄`);
    console.log(`최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
