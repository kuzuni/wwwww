// 장비 시대 상세 팝업(shot-042931 / forge-detail) 요소 실측 — 클론을 DOM rect로 재서
// 원본 PNG 픽셀 실측치와 %W/%H로 나란히 대조한다(전 UI 비율 전수 검증 패스).
//
// 원본 기준값은 아래 REF에 박아 뒀다(492×881 픽셀 실측).
// ⚠️ **잉크(글자) 위치와 DOM 박스를 섞어 비교하지 말 것** — 글자 줄의 잉크 상단은 박스 상단보다
// (line-height − 잉크높이)/2 만큼 아래라, 리드/옵션 줄을 잉크 기준으로 재면 늘 −2%p쯤 어긋난 것처럼 보인다.
// 그래서 **테두리가 보이는 상자**(카드 · 아이콘 상자 · 회색 옵션 패널)만 박스로 대조하고,
// 글자 줄은 위치 대신 **피치**(잉크 피치 = 박스 피치)로만 본다. 이 넷이 레이아웃을 전부 결정한다.
//   원본 컬럼 스캔(x=20%W): 카드 25.20~72.76 · 아이콘 상자 26.33~33.71 · 회색 패널 38.48~71.28
//   카드 x 15.65~84.55(폭 68.90%W) · 옵션 13줄 피치 1.87%H
// ⚠️ 원본은 492×881, 클론 뷰포트는 499×892라 픽셀을 직접 비교하면 안 된다 — 전부 %로 환산해서 본다.
//
// 사용: node tools/probe-forge-detail-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 원본 실측치 (%W는 폭 492 기준, %H는 높이 881 기준)
const REF = {
    '카드 좌':        { v: 15.65, unit: 'W' },
    '카드 우':        { v: 84.55, unit: 'W' },
    '카드 폭':        { v: 68.90, unit: 'W' },
    '카드 상단':      { v: 25.20, unit: 'H' },
    '카드 하단':      { v: 72.76, unit: 'H' },
    '카드 높이':      { v: 47.56, unit: 'H' },
    '아이콘 상단':    { v: 26.33, unit: 'H' },
    '아이콘 하단':    { v: 33.71, unit: 'H' },
    '아이콘 높이':    { v: 7.38, unit: 'H' },
    '패널 상단':      { v: 38.48, unit: 'H' },
    '패널 하단':      { v: 71.28, unit: 'H' },
    '패널 높이':      { v: 32.80, unit: 'H' },
    '옵션 행 피치':   { v: 1.87, unit: 'H' },
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
    // 3D 렌더 루프 정지 — DOM만 재는 도구라 캔버스는 필요 없고, 켜두면 evaluate 한 번이 수 초 걸린다
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; });
    await page.waitForTimeout(600);

    await page.evaluate(() => {
        UI.openForgeInfo(); UI.openForgeList();
        UI.openForgeDetail(AGES[0], 'weapon', Object.keys(WEAPON_TYPES)[0]);
    });
    // ⚠️ 애니메이션 무효화 — 팝업 열림(`cardpop .25s`)이 `from { scale(.7) }`인데 이 환경(swiftshader)에서는
    // 애니메이션이 진행되지 않고 첫 프레임에 얼어붙는 일이 있다. 그대로 재면 카드가 실제보다 30% 작게 잡혀
    // '폭이 −19%p' 같은 가짜 불일치가 나온다(probe-league-dom.js도 같은 이유로 무효화한다).
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(400);

    const m = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const pw = v => +(v / W * 100).toFixed(2);
        const ph = v => +(v / H * 100).toFixed(2);
        const q = s => document.querySelector('#forge-item-modal ' + s);
        const r = s => { const e = q(s); return e ? e.getBoundingClientRect() : null; };
        const card = r('.modal-card.item-detail');
        const icon = r('.idet-icon');
        const panel = r('.idet-subs');
        const rows = [...document.querySelectorAll('#forge-item-modal .substat-row')].map(e => e.getBoundingClientRect());
        const pitch = rows.length > 1 ? (rows[rows.length - 1].top - rows[0].top) / (rows.length - 1) : 0;
        return {
            rowCount: rows.length,
            '카드 좌': pw(card.left - app.left), '카드 우': pw(card.right - app.left), '카드 폭': pw(card.width),
            '카드 상단': ph(card.top - app.top), '카드 하단': ph(card.bottom - app.top), '카드 높이': ph(card.height),
            '아이콘 상단': ph(icon.top - app.top), '아이콘 하단': ph(icon.bottom - app.top), '아이콘 높이': ph(icon.height),
            '패널 상단': ph(panel.top - app.top), '패널 하단': ph(panel.bottom - app.top), '패널 높이': ph(panel.height),
            '옵션 행 피치': ph(pitch),
            _iconW: pw(icon.width),
        };
    });

    console.log(`\n장비 시대 상세(shot-042931) — 원본 vs 클론 (부가옵션 ${m.rowCount}줄, 원본 13줄)\n`);
    console.log('요소'.padEnd(18) + '원본'.padStart(8) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0, ng = [];
    for (const [k, ref] of Object.entries(REF)) {
        const got = m[k];
        const d = +(got - ref.v).toFixed(2);
        if (Math.abs(d) > Math.abs(worst)) worst = d;
        const ok = Math.abs(d) <= 2;
        if (!ok) ng.push(`${k} ${d > 0 ? '+' : ''}${d}%p`);
        console.log(k.padEnd(16) + `%${ref.unit}`.padStart(3) + String(ref.v.toFixed(2)).padStart(8) + String(got.toFixed(2)).padStart(9) + `${d > 0 ? '+' : ''}${d}`.padStart(9) + (ok ? '  ok' : '  ← ±2%p 초과'));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
