// 던전 상세 팝업(shot-042304) 클론 DOM 실측 — 원본 픽셀 실측값과 나란히 %W/%H(#app 기준)로 찍는다.
// ⚠️ 팝업 열림 애니메이션(scale .7→1)이 헤드리스에서 스로틀링돼 rect 가 0.694배로 잡히는 함정이 있어
//    (TODO 리그 메모) 기다리지 않고 animation/transition 을 무효화한 뒤 잰다.
// 사용: PW_PATH=... node probe-dgd-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SC = require('./shot-screens-seed.js');

// 원본 shot-042304(498×888) 픽셀 실측 목표치 — %W/%H
// ⚠️ DOM rect 는 테두리를 포함한 '박스', 원본 픽셀 실측은 색 '채움'이다 — 카드(테두리 2px)·버튼(3px)·✕(3px)은
//    박스 기준으로 환산한 값을 목표로 둔다. 최종 합격 판정은 probe-dungeon-detail.js 의 채움-대-채움 비교로 한다.
const REF = {
    '카드 상단 y': { v: 25.11, ax: 'H' },      // 채움 226px − 테두리 2px
    '카드 하단 y': { v: 75.11, ax: 'H' },      // 채움 665px + 테두리 2px
    '카드 높이  ': { v: 50.00, ax: 'H' },      // 444px(채움 439 + 테두리 4)
    '카드 x     ': { v: 14.26, ax: 'W' },      // 채움 73px − 테두리 2px
    '카드 폭    ': { v: 70.08, ax: 'W' },      // 349px(채움 345 + 테두리 4)
    '배너 높이  ': { v: 15.32, ax: 'H' },      // 226..361 = 136px
    '난이도블록y': { v: 42.68, ax: 'H' },      // 글자 밴드 379..414
    '난이도블록h': { v: 4.05, ax: 'H' },
    'pill y     ': { v: 49.21, ax: 'H' },      // 437..470
    'pill 높이  ': { v: 3.83, ax: 'H' },       // 34px
    'pill x     ': { v: 21.89, ax: 'W' },      // 109..381
    'pill 폭    ': { v: 54.62, ax: 'W' },      // 273px
    '열쇠줄 y   ': { v: 55.86, ax: 'H' },      // 496..517
    '버튼줄 y   ': { v: 60.92, ax: 'H' },      // 채움 544 − 테두리 3
    '버튼 높이  ': { v: 7.43, ax: 'H' },       // 66px(채움 60 + 테두리 6)
    '좌버튼 x   ': { v: 18.88, ax: 'W' },      // 채움 97 − 3
    '좌버튼 폭  ': { v: 28.11, ax: 'W' },      // 140px(채움 134 + 6)
    '우버튼 x   ': { v: 51.61, ax: 'W' },      // 채움 260 − 3
    '우버튼 폭  ': { v: 28.11, ax: 'W' },
    '✕ y       ': { v: 71.96, ax: 'H' },      // 채움 642 − 테두리 3
    '✕ 높이    ': { v: 6.31, ax: 'H' },       // 56px — 원본 밝은 빨강 45px + 아래 진한 그림자·테두리
    '✕ x       ': { v: 43.58, ax: 'W' },
    '✕ 폭      ': { v: 11.45, ax: 'W' },      // 57px(채움 51 + 테두리 6)
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => { UI.toast = () => { }; UI.openDungeons(); UI.openDungeonDetail('hammer'); });
    // 🚨 폰트가 붙기 전 프레임에서 재면 글자 폭이 달라 **같은 페이지인데 런마다 수치가 바뀐다**
    //    (2026-08-18 펫 화면에서 통과 판정이 통째로 무효가 된 실제 사례). 반드시 기다린다.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const got = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const q = s => document.querySelector(s);
        const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: (r.left - app.left) / app.width * 100, y: (r.top - app.top) / app.height * 100, w: r.width / app.width * 100, h: r.height / app.height * 100, bot: (r.bottom - app.top) / app.height * 100 }; };
        const card = R(q('#dungeon-detail-modal .dgd-card'));
        const hero = R(q('#dungeon-detail-modal .dg-detail-hero'));
        const stage = R(q('#dungeon-detail-modal .dgd-stage-row'));
        const pill = R(q('#dungeon-detail-modal .dgd-reward-pill'));
        const keys = R(q('#dungeon-detail-modal .dgd-keys'));
        const btns = document.querySelectorAll('#dungeon-detail-modal .dgd-btn');
        const b0 = R(btns[0]), b1 = R(btns[1]);
        const x = R(q('#dungeon-detail-modal .x-btn'));
        return {
            app: [app.width, app.height],
            '카드 상단 y': card.y, '카드 하단 y': card.bot, '카드 높이  ': card.h, '카드 x     ': card.x, '카드 폭    ': card.w,
            '배너 높이  ': hero.h,
            '난이도블록y': stage.y, '난이도블록h': stage.h,
            'pill y     ': pill.y, 'pill 높이  ': pill.h, 'pill x     ': pill.x, 'pill 폭    ': pill.w,
            '열쇠줄 y   ': keys.y,
            '버튼줄 y   ': b0.y, '버튼 높이  ': b0.h,
            '좌버튼 x   ': b0.x, '좌버튼 폭  ': b0.w, '우버튼 x   ': b1.x, '우버튼 폭  ': b1.w,
            '✕ y       ': x.y, '✕ 높이    ': x.h, '✕ x       ': x.x, '✕ 폭      ': x.w,
        };
    });
    console.log('#app', got.app.join('x'));
    console.log('요소            원본     클론      Δ%p');
    let worst = 0, worstK = '';
    for (const [k, spec] of Object.entries(REF)) {
        const c = got[k];
        const dv = +(c - spec.v).toFixed(2);
        if (Math.abs(dv) > Math.abs(worst)) { worst = dv; worstK = k.trim(); }
        console.log(`${k}  ${spec.v.toFixed(2).padStart(6)}  ${c.toFixed(2).padStart(7)}  ${(dv > 0 ? '+' : '') + dv.toFixed(2)}${Math.abs(dv) > 2 ? '  ← 불통과' : ''}`);
    }
    console.log(`\n최대 어긋남: ${worstK} ${worst > 0 ? '+' : ''}${worst}%p`);
    console.log(errors.length ? errors.slice(0, 8).join('\n') : '(콘솔 에러 없음)');
    await browser.close();
})();
