// '모든 장비의 목록' 팝업 — 셀 프레임이 시대(등급)색인지 + 아이콘에 검정 아웃라인이 걸렸는지
// (사용자 지시 2026-08-19 `forge-list-frame-color`: "장비들 프레임 색깔이 실제 프레임 색과 달리
//  다 회색으로 되어 있음... 그 부분에 장비들 다 검정 아웃라인도 없고")
// 검사 항목
//  ① 셀 테두리색 = `color-mix(in srgb, 시대색 72%, #000)` = 시대색 ×0.72 (채널 ±4)
//  ② 안쪽 링(box-shadow inset)이 시대색 그대로 들어간다
//  ③ 시대 10종의 테두리색이 서로 갈린다(8종 이상 서로 다름 = '전부 회색' 회귀 방지)
//  ④ 아이콘(img·.ico)에 검정 drop-shadow 4패스(상하좌우)가 폭 >0 으로 걸린다 — 두께 노브는
//     슬롯과 공유하는 `--slot-out`(outline-halve-egg-none 로 절반)
//  ⑤ 장비 상세 팝업도 같은 언어(프레임 시대색 + 아이콘 아웃라인)
//  ⑥ 콘솔 에러 0
// 사용: node probe-forge-list-frame.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { SEED_SRC } = require('./shot-screens-seed.js');

// 크롬은 color-mix 결과를 `color(srgb 0.07 0.49 0.72)`(0~1 실수)로, 보통 색은 `rgb(20, 126, 184)`로 준다.
// 문자열에서 **첫 색 토큰**만 뽑아 0~255 정수 3개로 정규화한다(box-shadow 는 앞에 오프셋 숫자가 붙는다).
const rgb = (str) => {
    const m = String(str).match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
        || String(str).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    if (!m) return [NaN, NaN, NaN];
    const v = [m[1], m[2], m[3]].map(Number);
    return v.every(n => n <= 1.0001) && /color\(srgb/.test(String(str).slice(String(str).indexOf(m[0])))
        ? v.map(n => Math.round(n * 255)) : v.map(n => Math.round(n));
};

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX);
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 30000 });
    await page.evaluate(SEED_SRC);
    await page.reload();
    await page.waitForFunction(() => typeof UI !== 'undefined' && S && S.forgeLevel === 29, null, { timeout: 30000 });
    await page.evaluate(`Scene3D && (Scene3D.update = function(){}); UI.toast = function(){}; S.autoForgeOn = false; UI.showCraftModal = function(){};`);
    await page.waitForTimeout(1200);
    await page.evaluate(`UI.openForgeInfo(); UI.openForgeList();`);
    await page.waitForTimeout(1500);

    const rows = await page.evaluate(() => {
        return [...document.querySelectorAll('.forge-age-section')].map(sec => {
            const face = sec.querySelector('.fl-face');
            const icon = sec.querySelector('.fl-face img, .fl-face .ico');
            const cs = getComputedStyle(face);
            return {
                age: face.dataset.age,
                hex: UI.ageHex(face.dataset.age),
                border: cs.borderTopColor,
                shadow: cs.boxShadow,
                filter: icon ? getComputedStyle(icon).filter : '(아이콘 없음)',
            };
        });
    });
    ok(rows.length >= 10, `시대 섹션이 ${rows.length}개다(10개 기대)`);

    const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const seen = new Set();
    for (const r of rows) {
        const want = hexRgb(r.hex).map(v => Math.round(v * 0.72));
        const got = rgb(r.border);
        const dev = Math.max(...want.map((v, i) => Math.abs(v - got[i])));
        ok(dev <= 4, `① ${r.age}: 테두리 ${r.border} — 시대색 ${r.hex} ×0.72 = rgb(${want}) 여야 한다 (최대 편차 ${dev})`);
        // ② 안쪽 링에 시대색 원본이 들어갔는지 (box-shadow 첫 inset)
        const ring = rgb(r.shadow);
        const wantRing = hexRgb(r.hex);
        ok(Math.max(...wantRing.map((v, i) => Math.abs(v - ring[i]))) <= 4,
            `② ${r.age}: 안쪽 링 색이 시대색이 아니다 (${r.shadow.slice(0, 40)})`);
        seen.add(got.join(','));
        // ④ 아이콘 검정 아웃라인 4패스
        const passes = (r.filter.match(/drop-shadow\(rgb\(0,\s*0,\s*0\)[^)]*\)/g) || []).length;
        ok(passes >= 4, `④ ${r.age}: 아이콘 검정 아웃라인 패스가 ${passes}개다(4개 기대) — filter=${r.filter.slice(0, 90)}`);
        const widths = (r.filter.match(/drop-shadow\(rgb\(0,\s*0,\s*0\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g) || []);
        ok(widths.some(w => /[1-9]/.test(w.replace(/rgb\(0,\s*0,\s*0\)/, ''))), `④ ${r.age}: 아웃라인 폭이 0이다`);
    }
    ok(seen.size >= 8, `③ 시대 테두리색이 ${seen.size}종뿐 — '전부 회색' 회귀 의심(8종 이상 기대)`);

    // ⑤ 장비 상세 팝업
    const det = await page.evaluate(async () => {
        UI.openForgeDetail('interstellar', 'weapon', 'sword');
        await new Promise(r => setTimeout(r, 500));
        const box = document.querySelector('#forge-item-modal .idet-icon');
        const icon = document.querySelector('#forge-item-modal .idet-icon img, #forge-item-modal .idet-icon .ico');
        return {
            hex: UI.ageHex('interstellar'),
            border: box ? getComputedStyle(box).borderTopColor : null,
            filter: icon ? getComputedStyle(icon).filter : '(아이콘 없음)',
        };
    });
    if (det.border) {
        const want = hexRgb(det.hex).map(v => Math.round(v * 0.72));
        const got = rgb(det.border);
        ok(Math.max(...want.map((v, i) => Math.abs(v - got[i]))) <= 4,
            `⑤ 상세 팝업 프레임 ${det.border} — 시대색 ×0.72 rgb(${want}) 기대`);
        ok((det.filter.match(/drop-shadow\(rgb\(0,\s*0,\s*0\)[^)]*\)/g) || []).length >= 4,
            `⑤ 상세 팝업 아이콘에 검정 아웃라인이 없다 (filter=${det.filter.slice(0, 90)})`);
    } else ok(false, '⑤ 상세 팝업 아이콘 상자를 못 읽었다');

    ok(errs.length === 0, `⑥ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    console.log('시대별 셀 테두리색:');
    rows.forEach(r => console.log(`  ${String(r.age).padEnd(13)} 시대색 ${r.hex} → 테 ${r.border}`));
    console.log(fails.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n')
        : `\n✅ PASS — 목록 셀 프레임이 시대색(${seen.size}종) · 아이콘 검정 아웃라인 · 상세 팝업 동일`);
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
