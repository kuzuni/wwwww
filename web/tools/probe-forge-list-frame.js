// '모든 장비의 목록' 팝업 — 타일이 **메인 장비 슬롯(.equip-cell)과 같은 디자인**인지
// (사용자 재지적 2026-08-19 `forge-list-frame-color` 재오픈: "아웃라인 부분만 등급색이고 프레임
//  안쪽이 등급색이 아님... 메인에 장비 슬롯이랑 레벨 표시된 거 빼고는 디자인이 같아야 함")
// 검사 항목
//  ① 셀 테두리색 = `color-mix(in srgb, 시대색 80%, #000)` = 시대색 ×0.80 (채널 ±4, 슬롯과 같은 식)
//  ② 셀 안쪽 면(배경색) = `color-mix(시대색 58%, #17181a)` (채널 ±4, 슬롯 해칭 바탕과 같은 식)
//  ②b 슬롯과 동일 디자인: 타일 background-image·border-radius·테 두께가 메인 .equip-cell 과
//     문자열/수치로 같고, 타일 안에 레벨 배지(.cell-lv)가 **없다**(유일하게 허용된 차이)
//  ③ 시대 10종의 테두리색이 서로 갈린다(8종 이상 서로 다름 = '전부 회색' 회귀 방지)
//  ④ 아이콘(img·.ico)에 검정 drop-shadow 4패스(상하좌우)가 폭 >0 으로 걸린다 — 두께 노브는
//     슬롯과 공유하는 `--slot-out`(outline-halve-egg-none 로 절반)
//  ⑤ 장비 상세 팝업도 같은 언어(테 ×0.80 + 면 58% 틴트 + 아이콘 아웃라인)
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
                bg: cs.backgroundColor,
                bgImage: cs.backgroundImage,
                radius: cs.borderTopLeftRadius,
                borderW: cs.borderTopWidth,
                isEquipCell: face.classList.contains('equip-cell'),
                hasLv: !!face.querySelector('.cell-lv'),
                filter: icon ? getComputedStyle(icon).filter : '(아이콘 없음)',
            };
        });
    });
    ok(rows.length >= 10, `시대 섹션이 ${rows.length}개다(10개 기대)`);
    // ②b 비교 기준 = 메인 하단 장비 그리드의 실제 슬롯 (모달 아래 DOM에 그대로 있다)
    const slotRef = await page.evaluate(() => {
        const cell = document.querySelector('#equip-sheet .equip-grid .equip-cell:not(.egg-cell)');
        if (!cell) return null;
        const cs = getComputedStyle(cell);
        return { bgImage: cs.backgroundImage, radius: cs.borderTopLeftRadius, borderW: cs.borderTopWidth };
    });
    ok(!!slotRef, '②b 비교할 메인 장비 슬롯(.equip-cell)을 못 찾았다');

    const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const seen = new Set();
    // 슬롯 면 혼합 상수: color-mix(in srgb, rc 58%, #17181a)
    const faceMix = h => hexRgb(h).map((v, i) => Math.round(v * 0.58 + [23, 24, 26][i] * 0.42));
    for (const r of rows) {
        const want = hexRgb(r.hex).map(v => Math.round(v * 0.80));
        const got = rgb(r.border);
        const dev = Math.max(...want.map((v, i) => Math.abs(v - got[i])));
        ok(dev <= 4, `① ${r.age}: 테두리 ${r.border} — 시대색 ${r.hex} ×0.80 = rgb(${want}) 여야 한다 (최대 편차 ${dev})`);
        // ② 안쪽 면 = 시대색 58% + #17181a 42% (슬롯 해칭 바탕과 같은 식)
        const wantFace = faceMix(r.hex);
        const gotFace = rgb(r.bg);
        ok(Math.max(...wantFace.map((v, i) => Math.abs(v - gotFace[i]))) <= 4,
            `② ${r.age}: 안쪽 면 ${r.bg} — color-mix(시대색 58%, #17181a) = rgb(${wantFace}) 여야 한다`);
        // ②b 슬롯과 동일 디자인 + 레벨 배지만 없음
        ok(r.isEquipCell, `②b ${r.age}: 타일에 equip-cell 클래스가 없다(슬롯 CSS 재사용이 풀렸다)`);
        ok(!r.hasLv, `②b ${r.age}: 타일 안에 레벨 배지(.cell-lv)가 있다 — 목록은 레벨 표시를 빼야 한다`);
        if (slotRef) {
            ok(r.bgImage === slotRef.bgImage, `②b ${r.age}: background-image 가 메인 슬롯과 다르다`);
            ok(r.radius === slotRef.radius, `②b ${r.age}: 라운드 ${r.radius} ≠ 슬롯 ${slotRef.radius}`);
            ok(r.borderW === slotRef.borderW, `②b ${r.age}: 테 두께 ${r.borderW} ≠ 슬롯 ${slotRef.borderW}`);
        }
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
            bg: box ? getComputedStyle(box).backgroundColor : null,
            filter: icon ? getComputedStyle(icon).filter : '(아이콘 없음)',
        };
    });
    if (det.border) {
        const want = hexRgb(det.hex).map(v => Math.round(v * 0.80));
        const got = rgb(det.border);
        ok(Math.max(...want.map((v, i) => Math.abs(v - got[i]))) <= 4,
            `⑤ 상세 팝업 프레임 ${det.border} — 시대색 ×0.80 rgb(${want}) 기대`);
        const wantFace = faceMix(det.hex);
        const gotFace = rgb(det.bg);
        ok(Math.max(...wantFace.map((v, i) => Math.abs(v - gotFace[i]))) <= 4,
            `⑤ 상세 팝업 안쪽 면 ${det.bg} — color-mix(시대색 58%, #17181a) rgb(${wantFace}) 기대`);
        ok((det.filter.match(/drop-shadow\(rgb\(0,\s*0,\s*0\)[^)]*\)/g) || []).length >= 4,
            `⑤ 상세 팝업 아이콘에 검정 아웃라인이 없다 (filter=${det.filter.slice(0, 90)})`);
    } else ok(false, '⑤ 상세 팝업 아이콘 상자를 못 읽었다');

    ok(errs.length === 0, `⑥ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    console.log('시대별 셀 테두리색:');
    rows.forEach(r => console.log(`  ${String(r.age).padEnd(13)} 시대색 ${r.hex} → 테 ${r.border}`));
    console.log(fails.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n')
        : `\n✅ PASS — 타일 = 메인 슬롯 동일 디자인(테 ×0.80·면 58% 틴트·${seen.size}종 색 분화·레벨 배지 없음) · 아이콘 검정 아웃라인 · 상세 팝업 동일`);
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
