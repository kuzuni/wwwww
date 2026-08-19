// 상점 화면(원본 shot-042632) 클론 DOM 실측 — 요소별 %W/%H 를 원본 목표치와 Δ 표로 비교하고 ±2%p PASS 판정.
// 사용: PW_PATH=<playwright> node probe-shop-dom.js
//
// ⚠️ 기준계 (probe-fi-dom.js 와 같은 규약)
//   · 원본 PNG 는 500x878 이지만 **앱 상자는 497x877** 이다 — 탭바 남색(14,17,27)이 x=0..496 까지만 깔리고
//     x=497 부터 다른 남색(35,38,66)으로 바뀐다(= 앱 바깥). 이미지 폭으로 %W 를 내면 가로마다 가짜 오차가 붙는다.
//   · 리본 태그 폭 196px 은 '글자 뒤 빈 구간까지' 포함한 값이다 — 첫 판에 189 로 적었다가 Δ+1.41 이 났다.
//     제비꼬리 홈 때문에 **세로 중앙 행에서 재면 8px 짧게** 나온다(홈이 가장 깊은 행이라서다).
//   · 원본 특가 카드는 앱 중심(248.5)이 아니라 245 에 앉는다 — 오른쪽에 스크롤바 몫 6px 이 빠져서다.
//     그래서 **카드 좌/우 여백을 따로 적는다**(좌 61px · 우 67px).
//   · 클론도 뷰포트가 아니라 `#app` 상자 기준으로 잰다.
//   · 카드 열림 애니메이션(`cardpop`)이 scale(.7)에서 시작하므로 `.opening` 을 벗기고 잰다(probe-af-dom 함정).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

// 원본 실측치(px, 앱 497x877 기준) — probe-shop-ref.js + 색면 스캔으로 뽑았다.
const REF_W = 497, REF_H = 877;
const T = [
    // key                    라벨              x     w     y     h
    ['banner1',   '배너1 오늘의 특가',          61,  369,   60,   39],
    ['deal1',     '특가카드1',                  61,  369,  162,  134],
    ['deal2',     '특가카드2',                  61,  369,  304,  134],
    ['deal3',     '특가카드3',                  61,  369,  446,  134],
    ['tag1',      '리본 태그1',                 55,  196,  172,   24],
    ['pill1',     '보상 pill1',                 77,   99,  212,   22],
    ['pill2',     '보상 pill2',                 77,   99,  235,   22],
    ['btn1',      '가격 버튼1',                341,   79,  244,   42],
    ['banner2',   '배너2 보석',                 61,  369,  607,   40],
    // 보석 카드 h 는 **null** — 원본에서 카드 아래가 탭바에 덮여 바닥선을 볼 수 없다(126px 은 잘린 값).
    // 카드 높이를 그 잘린 값으로 고정했더니 클론에서 가격 버튼이 카드 밖으로 잘려 나갔다.
    ['gem1',      '보석카드1',                  65,  110,  669, null],
    ['gem2',      '보석카드2',                 190,  110,  669, null],
    ['gem3',      '보석카드3',                 316,  110,  669, null],
    ['back',      '◀ 뒤로가기',                  8,   34,  745,   29],
    ['gemAmt1',   '보석 수량줄1',                null, null, 677,   28],
    ['gemIco1',   '보석 그림1',                  null, null, 707,   60],
    ['gemBtn1',   '보석 가격버튼1',               75,   90,  770,   23],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof S !== "undefined" && typeof Shop !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(() => { S.coins = 782000; S.gems = 62; UI.toast = () => { }; UI.onTabClick('shop'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(150);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const box = sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height }; };
        const banners = [...document.querySelectorAll('.shop-banner')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height }; });
        const deals = [...document.querySelectorAll('.shop-deal-card')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height }; });
        const gems = [...document.querySelectorAll('.shop-gem-card')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height }; });
        const pills = [...document.querySelectorAll('.shop-deal-card:first-child .shop-reward-pill')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height }; });
        const sheet = document.querySelector('.shop-sheet');
        return {
            app: { w: app.width, h: app.height },
            banner1: banners[0] || null, banner2: banners[1] || null,
            deal1: deals[0] || null, deal2: deals[1] || null, deal3: deals[2] || null,
            gem1: gems[0] || null, gem2: gems[1] || null, gem3: gems[2] || null,
            tag1: box('.shop-deal-card:first-child .shop-deal-tag'),
            pill1: pills[0] || null, pill2: pills[1] || null,
            btn1: box('.shop-deal-card:first-child .shop-price-btn'),
            back: box('.shop-sheet .sheet-back-btn'),
            gemAmt1: box('.shop-gem-card:first-child .shop-gem-amt'),
            gemIco1: box('.shop-gem-card:first-child .shop-gem-icon .ico'),
            gemBtn1: box('.shop-gem-card:first-child .shop-price-btn'),
            pillCount: pills.length,
            scroll: sheet ? { top: sheet.scrollTop, h: sheet.scrollHeight, client: sheet.clientHeight } : null,
        };
    });
    await browser.close();

    console.log(`클론 #app ${m.app.w.toFixed(1)}x${m.app.h.toFixed(1)} · 원본 앱 ${REF_W}x${REF_H}`);
    console.log(`특가 카드1 보상 pill ${m.pillCount}개 (원본 3개 — 젬 제거는 클론 사양)`);
    if (m.scroll) console.log(`시트 스크롤: ${m.scroll.h.toFixed(0)}px / 보이는 높이 ${m.scroll.client.toFixed(0)}px (원본은 한 화면에 다 들어온다)`);
    console.log('');
    console.log('※ — 은 원본에서 잴 수 없어 대조하지 않는 칸이다(보석 카드 높이 = 탭바에 덮여 바닥선이 없음,');
    console.log('   보석 수량줄·그림의 가로 = 카드 안에서 가운데 정렬이라 카드 폭 대조로 갈음).');
    console.log('요소                 원본x   클론x     Δ  |  원본w   클론w     Δ  |  원본y   클론y     Δ  |  원본h   클론h     Δ');
    let fail = 0;
    for (const [key, label, rx, rw, ry, rh] of T) {
        const c = m[key];
        if (!c) { console.log(`${label.padEnd(18)} — 클론에 없음`); fail++; continue; }
        const cells = [];
        let bad = false;
        for (const [refPx, cloPx, denom] of [[rx, c.x, REF_W], [rw, c.w, REF_W], [ry, c.y, REF_H], [rh, c.h, REF_H]]) {
            if (refPx === null) { cells.push('        —         '.padEnd(22)); continue; }
            const cd = denom === REF_W ? m.app.w : m.app.h;
            const r = refPx / denom * 100, cl = cloPx / cd * 100, dd = cl - r;
            if (Math.abs(dd) > 2) bad = true;
            cells.push(`${r.toFixed(2).padStart(6)} ${cl.toFixed(2).padStart(7)} ${(dd >= 0 ? '+' : '') + dd.toFixed(2)}`.padEnd(22));
        }
        if (bad) fail++;
        console.log(`${label.padEnd(18)} ${cells.join('| ')} ${bad ? '  ✗' : ''}`);
    }
    console.log('');
    console.log(fail ? `판정: FAIL — ±2%p 초과 요소 ${fail}건` : '판정: PASS — 전 요소 ±2%p 이내');
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    // 🚨 이 도구는 판정문만 찍고 **exit 코드를 안 냈다**(2026-08-19 비율 스윕에서 발견).
    //    인계 메모 ㉡ 이 짚은 "`exit 0` = 통과가 아니다"의 실물이다 — 자동 스윕에 넣으면
    //    ±2%p 를 넘겨도 초록으로 찍힌다. 판정을 종료 코드로도 내보낸다.
    process.exit(fail || errs.length ? 1 : 0);
})();
