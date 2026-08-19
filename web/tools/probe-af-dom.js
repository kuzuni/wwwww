// 자동 제련 화면 요소 실측 — 원본(shot-042950 = 필터 ON / shot-043117 = 필터 OFF)의 목표치와 %W·%H 로 나란히 대조.
// 원본 PNG 는 503x885 라 클론 뷰포트(499x892)와 기준이 다르다 — 양쪽 다 자기 화면 크기 대비 %로 환산해 비교한다.
// 사용: node probe-af-dom.js [on|off]   (기본 on = 필터 켠 상태)
//
// 🚨 **2026-08-18 UI 세션에서 '측정 덤프' → '판정기'로 승격했다** — 그전까지 Δ만 찍고 exit 0 이라
//    `exit 0` 을 통과로 읽으면 속는 6개 화면 중 하나였다(인계 메모 ㉡).
//    ⚠️ 다만 이 화면은 **원본 목표치가 카드 하나뿐**이라, 판정도 그 하나에만 건다. 나머지 요소는
//    목표치가 없으니 **지어내지 않고 미판정으로 찍는다**(없는 기준을 만들면 그게 가짜 FAIL 의 출처다).
//    이 화면의 나머지 계약은 `probe-affilter-dom.js`(행 기하)와 `probe-af-toggle-knob.js`(토글 기하)가 든다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const FILTER_ON = (process.argv[2] || 'on') !== 'off';

// 원본 실측 목표치(%) — **앱 폭 기준**이다.
// 🚨 **여기 있던 옛 값(x 11.53 · w 74.55 · y 7.23 · h 84.52)은 이미지 폭(503) 기준이라 틀렸다.**
//    이 컷은 오른쪽 6px 이 기기 띠라 **앱 폭이 491 이고 이미지 폭 503 이 아니다**(인계 메모 ㉣⑵ 의 그 함정).
//    같은 자를 쓰면 멀쩡한 카드가 'w +2.64%p · h −3.77%p 불통과'로 찍힌다 — 2026-08-18 UI 세션이
//    이 도구에 판정문을 붙이자마자 그 가짜 FAIL 을 받았고, **CSS 를 건드리기 전에 원본을 다시 재서** 걸렀다.
//    (교차검증도 한 번 헛짚었다: '밝은 최장 구간'으로 카드를 잡으면 **빨간 ✕ 가 카드 하단을 갈라**
//     하단이 y784 로 27px 일찍 끝난 것처럼 나온다 — 실제 카드 하단은 y811 이다. 함정 ② 의 재판이다.)
//    확정 실측치는 `css/style.css` 의 `.af-card` 주석(3320행 부근)에 근거와 함께 남아 있다 —
//    두 컷(042950 · 043117)에서 카드·✕·[시작] 픽셀 크기가 셋 다 같고 중심만 달라 앱 폭 491 로 떨어진다.
const TARGET = {
    // 앱 491x885 기준, 테두리 포함 바깥 상자
    // 🚨 bottom 89.04(=y788) 는 ✕ 링 상단을 카드 바닥으로 읽은 화석이었다(2026-08-18 채점 1라운드
    //    교차검증으로 정정). ✕가 안 지나는 좌변(x70) 스캔은 흰색이 y812(042950)/y825(043117)까지
    //    이어진다 — 카드 높이는 두 컷 다 84.52%H, 하단 91.75%H(885 기준). 위 주석의 y811 교차검증과도
    //    일치한다. 이 정정으로 '카드 높이 의도적 축소(.812)'도 철회됐다(style.css .af-card 주석 참조).
    'card': { x: 11.41, w: 77.19, y: 7.01, bottom: 91.75, h: 84.52 },
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof S !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate((on) => {
        S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9; S.forgeLevel = 29;
        S.autoForge.filterOn = on; S.autoForge.hammersPerBatch = 22;
        UI.openAutoForge();
    }, FILTER_ON);
    await page.waitForTimeout(350);
    // ⚠️ 열림 애니메이션(cardpop)은 scale(.7) 에서 시작한다. getBoundingClientRect 는 transform 을
    // 포함하므로 애니메이션이 끝나기 전에 재면 카드가 통째로 70% 로 찍힌다(실제로 한 번 속았다).
    // .opening 을 벗기고 애니메이션을 무효화한 뒤 잰다 — 여기서 볼 것은 레이아웃이지 연출이 아니다.
    await page.evaluate(() => {
        document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening'));
        document.querySelectorAll('.modal-card').forEach(c => { c.style.animation = 'none'; c.style.transform = 'none'; });
    });
    await page.evaluate(() => document.fonts.ready);   // ⚠️ 폰트 전 프레임 실측 금지(인계 메모 ㉠)
    await page.waitForTimeout(120);
    const rows = await page.evaluate(() => {
        const W = innerWidth, H = innerHeight;
        const pick = (sel, label) => {
            const el = document.querySelector(sel); if (!el) return null;
            const r = el.getBoundingClientRect();
            return { label, x: +(r.left / W * 100).toFixed(2), w: +(r.width / W * 100).toFixed(2), y: +(r.top / H * 100).toFixed(2), h: +(r.height / H * 100).toFixed(2), bottom: +(r.bottom / H * 100).toFixed(2) };
        };
        const bars = [...document.querySelectorAll('.af-age-bar')].map(el => el.getBoundingClientRect());
        const out = [pick('.af-card', 'card'), pick('.af-title', 'title'), pick('.af-label', 'label-유지')];
        if (bars.length) {
            out.push({ label: 'age-bar1', x: +(bars[0].left / W * 100).toFixed(2), w: +(bars[0].width / W * 100).toFixed(2), y: +(bars[0].top / H * 100).toFixed(2), h: +(bars[0].height / H * 100).toFixed(2) });
            out.push({ label: 'age-bar-pitch', x: 0, w: 0, y: 0, h: bars.length > 1 ? +((bars[1].top - bars[0].top) / H * 100).toFixed(2) : 0 });
            out.push({ label: 'age-bar-count', x: 0, w: 0, y: 0, h: bars.length });
        }
        out.push(pick('.af-toggle', 'filter-toggle'), pick('.af-sub-row', 'sub-row1'),
            pick('.af-bottom', 'bottom'), pick('.af-spinner', 'spinner'), pick('.af-start', 'start-btn'),
            pick('.x-btn', 'x-btn'));
        return out.filter(Boolean);
    });
    console.log(`필터 ${FILTER_ON ? 'ON (원본 shot-042950)' : 'OFF (원본 shot-043117)'} — 클론 499x892 기준 %`);
    console.log('요소'.padEnd(16) + 'x%W'.padStart(8) + 'w%W'.padStart(8) + 'y%H'.padStart(8) + 'h%H'.padStart(8) + '   원본대비Δ');
    const TOL = 2.0;          // 저장소 공통 통과 기준: 요소 ±2%p
    const fails = [];
    let worst = 0, judged = 0;
    for (const r of rows) {
        const t = TARGET[r.label];
        if (!t) {
            console.log(r.label.padEnd(16) + String(r.x).padStart(8) + String(r.w).padStart(8) + String(r.y).padStart(8) + String(r.h).padStart(8) + '   (원본 목표치 없음 · 미판정)');
            continue;
        }
        judged++;
        let bad = false;
        const parts = [];
        for (const k of Object.keys(t)) {          // TARGET 에 적힌 항목만 판정한다(h 는 의도적으로 빠져 있다)
            const d = +(r[k] - t[k]).toFixed(2);
            worst = Math.max(worst, Math.abs(d));
            if (Math.abs(d) > TOL) { bad = true; fails.push(`${r.label} ${k} Δ${d}%p (원본 ${t[k]} vs 클론 ${r[k]})`); }
            parts.push(`Δ${k} ${d}`);
        }
        console.log(r.label.padEnd(16) + String(r.x).padStart(8) + String(r.w).padStart(8) + String(r.y).padStart(8) + String(r.h).padStart(8) + '   ' + parts.join('  ') + (bad ? '  ✗' : '  ✓'));
        console.log(' '.repeat(16) + `(하단 ${r.bottom}%H · 높이 ${r.h}%H — 2026-08-18 정정 후 판정 대상)`);
    }
    await browser.close();

    console.log(`\n판정 대상 ${judged}요소 · 최대 편차 ${worst.toFixed(2)}%p (기준 ±${TOL.toFixed(2)}%p) · 콘솔 에러 ${errors.length}건`);
    console.log('(이 화면의 나머지 계약: probe-affilter-dom.js · probe-af-toggle-knob.js)');
    if (fails.length || errors.length) {
        console.log(`\nFAIL ${fails.length + errors.length}건`);
        fails.forEach(f => console.log('  ✗ ' + f));
        errors.slice(0, 3).forEach(e => console.log('  ✗ 콘솔: ' + e));
        process.exit(1);
    }
    console.log('\nPASS — 목표치가 있는 요소 전부 ±2%p 이내');
})();
