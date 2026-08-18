// 스킬 상세 팝업(shot-042426 / skill-detail) 요소 실측 — 클론을 DOM rect 로 재서 원본 PNG 픽셀
// 실측치와 %W/%H 로 나란히 대조한다(전 UI 비율 전수 검증 패스).
//
// ⚠️ 측정 전에 애니메이션 무효화(swiftshader 에서 cardpop 이 scale(.7) 로 얼어붙는다).
// ⚠️ 테두리가 보이는 상자만 대조한다 — 글자 줄은 위치 대신 피치로 본다.
// ✅ 이 원본은 크롭 쏠림 없음(카드 중심 246 vs 이미지 중심 247).
//
// 원본 실측(495×882, 행/열 색 구간 스캔):
//   카드        x  61~431 (12.32~87.07%W, 폭 74.95) · y 309~645 (35.03~73.13%H, 높이 38.21)
//   오브        x  80~129 (16.16%W, 폭 10.10)
//   패시브 pill  x 103~389 (20.81%W, 폭 57.98)      · y 499~515 (56.58%H, 높이 1.93)
//   [업그레이드] x  97~234 (19.60%W, 폭 27.88)      · y 537~596 (60.88%H, 높이 6.80)
//   [장착]      x 257~394 (51.92~79.60%W)
//   ✕          x 218~274 (44.04%W, 폭 11.52)       · y 619~672 (70.18%H, 높이 6.12)
//
// 사용: PW_PATH=<playwright> node tools/probe-skilldetail-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const REF = {
    '카드 좌': { v: 12.32, unit: 'W' },
    '카드 우': { v: 87.07, unit: 'W' },
    '카드 폭': { v: 74.95, unit: 'W' },
    '카드 상단': { v: 35.03, unit: 'H' },
    '카드 하단': { v: 73.13, unit: 'H' },
    '카드 높이': { v: 38.21, unit: 'H' },
    '오브 좌': { v: 16.16, unit: 'W' },
    '오브 폭': { v: 10.10, unit: 'W' },
    '패시브 라벨 좌': { v: 22.83, unit: 'W' },   // 원본 '패시브:' 글자 시작 113px — **왼쪽 정렬**이다
    '패시브 좌': { v: 20.81, unit: 'W' },
    '패시브 폭': { v: 57.98, unit: 'W' },
    '패시브 상단': { v: 56.58, unit: 'H' },
    '패시브 높이': { v: 1.93, unit: 'H' },
    '업글버튼 좌': { v: 19.60, unit: 'W' },
    '업글버튼 폭': { v: 27.88, unit: 'W' },
    '업글버튼 상단': { v: 60.88, unit: 'H' },
    '업글버튼 높이': { v: 6.80, unit: 'H' },
    '장착버튼 좌': { v: 51.92, unit: 'W' },
    '장착버튼 우': { v: 79.60, unit: 'W' },
    '✕ 좌': { v: 44.04, unit: 'W' },
    '✕ 폭': { v: 11.52, unit: 'W' },
    '✕ 상단': { v: 70.18, unit: 'H' },
    '✕ 높이': { v: 6.12, unit: 'H' },
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 495, height: 882 }, deviceScaleFactor: 1 });
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

    await page.evaluate(() => { UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.openSkillDetail(Object.keys(S.skills)[0]); });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const pw = v => +(v / W * 100).toFixed(2);
        const ph = v => +(v / H * 100).toFixed(2);
        const q = s => document.querySelector('#detail-modal ' + s);
        const card = q('.skd-card').getBoundingClientRect();
        const orb = q('.sk-orb').getBoundingClientRect();
        const pass = q('.skd-passive').getBoundingClientRect();
        const passLabel = q('.skd-passive-label').getBoundingClientRect();
        const btns = [...document.querySelectorAll('#detail-modal .skd-btn')].map(e => e.getBoundingClientRect());
        const x = q('.x-btn').getBoundingClientRect();
        return {
            '카드 좌': pw(card.left - app.left), '카드 우': pw(card.right - app.left), '카드 폭': pw(card.width),
            '카드 상단': ph(card.top - app.top), '카드 하단': ph(card.bottom - app.top), '카드 높이': ph(card.height),
            '오브 좌': pw(orb.left - app.left), '오브 폭': pw(orb.width),
            '패시브 라벨 좌': pw(passLabel.left - app.left + parseFloat(getComputedStyle(q('.skd-passive-label')).paddingLeft)),
            '패시브 좌': pw(pass.left - app.left), '패시브 폭': pw(pass.width),
            '패시브 상단': ph(pass.top - app.top), '패시브 높이': ph(pass.height),
            '업글버튼 좌': pw(btns[0].left - app.left), '업글버튼 폭': pw(btns[0].width),
            '업글버튼 상단': ph(btns[0].top - app.top), '업글버튼 높이': ph(btns[0].height),
            '장착버튼 좌': pw(btns[1].left - app.left), '장착버튼 우': pw(btns[1].right - app.left),
            '✕ 좌': pw(x.left - app.left), '✕ 폭': pw(x.width),
            '✕ 상단': ph(x.top - app.top), '✕ 높이': ph(x.height),
        };
    });

    console.log('\n스킬 상세 팝업(shot-042426) — 원본 vs 클론\n');
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
