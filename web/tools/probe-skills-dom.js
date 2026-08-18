// 스킬 화면(원본 shot-042340) 클론 DOM 실측 — 요소별 %W/%H 를 원본 목표치와 Δ 표로 비교하고 ±2%p PASS 판정.
// 사용: PW_PATH=<playwright> node probe-skills-dom.js
//
// ⚠️ 기준계
//   · 원본 PNG 는 496x890 이고 **앱 상자도 496** 이다(탭바 남색이 x=0..495 를 다 덮는다).
//     상점(500 이미지 / 497 앱)과 달리 이 샷은 이미지 = 앱이다 — 샷마다 다르니 매번 확인할 것.
//   · 클론은 뷰포트가 아니라 `#app` 상자 기준으로 잰다.
//   · 캡처 시드·상태는 shot-skills.js 와 같아야 한다(소환 배수 x5, 토스트·보류 제작 팝업 차단).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const { SEED_SRC } = require('./shot-screens-seed.js');

const REF_W = 496, REF_H = 890;
const T = [
    // key            라벨                    x     w     y     h
    ['statBar',   '스탯 요약바',              87,  319,   53,   19],
    ['orb11',     '오브 1행1열',              66,   50,   92,   50],
    ['orb15',     '오브 1행5열',             373,   50,   92,   50],
    ['orb31',     '오브 3행1열',              66,   50,  268,   50],
    ['gauge11',   '조각 게이지1',             59,   65,  151,   15],
    ['equipBar',  '장착됨 바',                67,  352,  500,   54],
    ['btn1',      '모두 업그레이드',          133,  104,  571,   43],
    ['btn2',      '빠른 장착',               256,  104,  571,   43],
    ['back',      '◀ 뒤로가기',               10,   35,  690,   29],
    ['multPill',  'x5 배수 pill',            127,   40,  700,   18],
    ['summonBtn', '소환 버튼',               177,  169,  653,   68],
    ['summonInfo', '소환 info 열',            349,   46,  661,   59],
    ['subtabBar', '서브탭 바',                 0,  496,  732,   84],
    ['subtabAct', '서브탭 활성(스킬)',         20,  153,  754,   30],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && S && S.forgeLevel === 29', { label: '시드 상태 로드' });
    await page.evaluate(() => {
        UI.toast = () => { }; UI.showCraftModal = () => { }; UI.resolvePendingCraft = () => { };
        S.autoForgeOn = false; S.pendingCraft = null; UI._pendingItem = null;
        UI.els.craftModal.classList.add('hidden');
        S.summonMult = { skill: 5, pet: 1, mount: 1 };
        UI.switchTab('summon'); UI.switchSummonSub('skills');
    });
    await page.waitForTimeout(600);
    // ⚠️ `.opening` 을 벗긴 **직후에 재면 안 된다** — 패널이 아래에서 올라오는 트랜지션이 다시 돌아
    // 모든 y 가 앱 높이 밖(+95%p)으로 찍힌다(첫 판에서 13요소가 전부 그 값으로 FAIL 났다).
    await page.evaluate(() => document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening')));
    // 🚨 소환 패널은 **아래에서 올라오는 데 1초 남짓 걸린다** — 600ms 에 재면 패널이 아직
    // 앱 상자 아래(#panel-skills top ≈ +860px)라 모든 y 가 +95%p 로 찍힌다(실측: 600ms 860px → 1200ms 16px).
    // 고정 대기는 런마다 성패가 갈렸으므로 패널 rect 로 폴링한다.
    await page.waitForFunction(() => {
        const el = document.getElementById('panel-skills'), a = document.getElementById('app');
        if (!el || !a) return false;
        const r = el.getBoundingClientRect(), ar = a.getBoundingClientRect();
        return r.height > 100 && (r.top - ar.top) < ar.height * 0.5;
    }, null, { timeout: 150000 });   // 병렬 3D 세션이 도는 컨테이너는 부팅+시드에 67초가 걸린다 (인계 메모 하네스 ⑵)
    await page.waitForTimeout(250);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left - app.left, y: r.top - app.top, w: r.width, h: r.height }; };
        const q = s => R(document.querySelector(s));
        const cells = [...document.querySelectorAll('.sk-cell')];
        const orbs = cells.map(c => R(c.querySelector('.sk-orb')));
        const btns = [...document.querySelectorAll('.sk-action-btn')].map(R);
        return {
            app: { w: app.width, h: app.height },
            statBar: q('.passive-banner'),
            orb11: orbs[0] || null, orb15: orbs[4] || null, orb31: orbs[10] || null,
            gauge11: cells[0] ? R(cells[0].querySelector('.sk-shard')) : null,
            equipBar: q('.equipped-row'),
            btn1: btns[0] || null, btn2: btns[1] || null,
            back: q('.summon-bar .back-btn'),
            multPill: q('.summon-bar .x5-toggle'),
            summonBtn: q('.summon-bar .summon-btn'),
            summonInfo: q('.summon-bar .summon-info'),
            subtabBar: q('#summon-subtabs'),
            subtabAct: q('#summon-subtabs .on') || q('#summon-subtabs .active') || q('#summon-subtabs button'),
            cellCount: cells.length,
            starCount: document.querySelectorAll('.sk-cell .sk-star').length,
        };
    });
    await browser.close();

    console.log(`클론 #app ${m.app.w.toFixed(1)}x${m.app.h.toFixed(1)} · 원본 앱 ${REF_W}x${REF_H}`);
    console.log(`오브 셀 ${m.cellCount}개(원본 15) · 별 배지 ${m.starCount}개 (원본은 셀마다 오브 아래 주황 별이 하나씩 붙는다)`);
    console.log('');
    console.log('요소                 원본x   클론x     Δ  |  원본w   클론w     Δ  |  원본y   클론y     Δ  |  원본h   클론h     Δ');
    let fail = 0;
    for (const [key, label, rx, rw, ry, rh] of T) {
        const c = m[key];
        if (!c) { console.log(`${label.padEnd(18)} — 클론에 없음`); fail++; continue; }
        const cells = [];
        let bad = false;
        for (const [refPx, cloPx, denom] of [[rx, c.x, REF_W], [rw, c.w, REF_W], [ry, c.y, REF_H], [rh, c.h, REF_H]]) {
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
})();
