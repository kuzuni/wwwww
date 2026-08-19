// 메인 화면 장비 슬롯의 '아이콘이 셀에서 차지하는 비율'을 원본과 같은 기준으로 실측한다.
// 기준 = **아이콘 그림의 잉크 바운딩박스 / 셀 크기** (컨테이너 박스가 아니라 실제로 보이는 그림).
//   원본 shot-042120 실측(499×892, 셀 67×67px, 장비 9칸):
//     잉크 bbox **긴 변** 평균 82.9% (칸별 73.1~88.1%) · 가로 평균 79.4% · 세로 평균 82.1%
//   기준을 '긴 변'으로 잡는 이유 — 실루엣이 칸마다 달라(반지=작고 둥글, 검=길고 얇다)
//   짧은 변까지 맞추려 들면 길쭉한 장비가 셀 밖으로 삐져나온다. 사용자가 '크기'로 읽는 건 긴 변이다.
//   (세로 평균은 Lv 배지 흰 글자의 **검정 외곽선**이 잉크로 잡혀 위로 조금 부풀어 있다 — 참고치)
// 셀 스크린샷을 떠서 배경(시대색 그라디언트)·Lv 배지 흰 글자·⭐ 주황을 제외한 잉크 bbox를 잰다.
// 사용: node probe-cell-icon-size.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, '../ref/cell-icons.png');
const { waitReady } = require('./wait-ready.js');

const VIEWPORTS = [[430, 932], [499, 892], [360, 800], [412, 915]];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], rows = [];
    for (const [w, h] of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        page.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${w}x${h}: ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        // waitForFunction 은 three.js+swiftshader 로 메인 스레드가 포화되면 내부 폴링이 못 돌아
        // 멀쩡한 페이지에서도 타임아웃한다(wait-ready.js 헤더 ② — 이 프로브도 그걸로 2연속 죽었다).
        await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"');
        // 🚨 `UI` 가 정의됐다고 **화면이 준비된 건 아니다.** `UI.init()` 이 `els` 를 채우기 전에
        //    `renderEquipSheet()` 를 부르면 `this.els.equipSheet` 가 undefined 라 통째로 터진다
        //    ("Cannot set properties of undefined (setting 'innerHTML')" — 2026-08-19 실측으로
        //    이 프로브가 4뷰포트 전부 못 돌고 죽어 있었다. **게임 결함이 아니라 프로브 경합이다**;
        //    `probe-grid-empty` 가 같은 꼴로 죽어 있던 것과 같은 계열이다). 실제로 쓸 핸들을 기다린다.
        await waitReady(page, 'UI.els && UI.els.equipSheet', { label: 'UI.els 채워짐' });
        await page.evaluate(() => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            Combat.tick = function () {};
            S.hammers = 1e6; S.forgeLevel = 20;
            for (const slot of SLOTS) { const it = Forge.rollItem(); it.slot = slot; it.stars = 1; S.equipment[slot] = it; }
            Combat.recalcHero(); UI.renderEquipSheet();
        });
        await page.waitForTimeout(900);   // 3D 썸네일 생성 대기
        const box = await page.evaluate(async () => {
            // 썸네일 dataURL을 캔버스에 그려 **불투명 픽셀 bbox**(= 실제로 보이는 그림)를 잰다.
            // object-fit:contain이라 화면 잉크 크기 = 컨테이너 박스 × 썸네일 채움비.
            const fill = async src => await new Promise(res => {
                const im = new Image();
                im.onload = () => {
                    const cv = document.createElement('canvas');
                    cv.width = im.naturalWidth; cv.height = im.naturalHeight;
                    const cx = cv.getContext('2d');
                    cx.drawImage(im, 0, 0);
                    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
                    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
                    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
                        if (d[(y * cv.width + x) * 4 + 3] > 24) {
                            if (x < x0) x0 = x; if (x > x1) x1 = x;
                            if (y < y0) y0 = y; if (y > y1) y1 = y;
                        }
                    }
                    res(x1 < 0 ? null : [(x1 - x0 + 1) / cv.width, (y1 - y0 + 1) / cv.height]);
                };
                im.onerror = () => res(null);
                im.src = src;
            });
            const cells = [...document.querySelectorAll('.equip-grid .equip-cell')];
            const out = [];
            for (const c of cells) {
                const cb = c.getBoundingClientRect();
                const img = c.querySelector('.cell-img');
                const ib = img ? img.getBoundingClientRect() : null;
                const f = img && img.src ? await fill(img.src) : null;
                // contain 박스 안에서 그림이 차지하는 변 길이 (정사각 썸네일 가정)
                const side = ib ? Math.min(ib.width, ib.height) : 0;
                out.push({
                    cell: [cb.x, cb.y, cb.width, cb.height],
                    img: ib ? [ib.x, ib.y, ib.width, ib.height] : null,
                    boxPct: ib ? [100 * ib.width / cb.width, 100 * ib.height / cb.height] : null,
                    inkPct: f ? [100 * side * f[0] / cb.width, 100 * side * f[1] / cb.height] : null,
                });
            }
            return out;
        });
        if (w === 430) await page.screenshot({ path: OUT, clip: { x: 0, y: box[0].cell[1] - 6, width: w, height: 200 } });
        const withImg = box.filter(b => b.img);
        const withInk = box.filter(b => b.inkPct);
        const avg = (arr, f) => arr.reduce((s, b) => s + f(b), 0) / arr.length;
        rows.push({
            vp: `${w}x${h}`, cells: box.length, imgs: withImg.length, cell: box[0].cell[2],
            boxW: avg(withImg, b => b.boxPct[0]), boxH: avg(withImg, b => b.boxPct[1]),
            inkW: withInk.length ? avg(withInk, b => b.inkPct[0]) : NaN,
            inkH: withInk.length ? avg(withInk, b => b.inkPct[1]) : NaN,
            inkLong: withInk.length ? avg(withInk, b => Math.max(b.inkPct[0], b.inkPct[1])) : NaN,
            inkMax: withInk.length ? Math.max(...withInk.map(b => Math.max(b.inkPct[0], b.inkPct[1]))) : NaN,
        });
        await page.close();
    }
    // 기준값 — ⚠️ 의도된 원본 이탈(slot-item-size-down): 원본 실측은 82.9(최대 88.1, 위 헤더 참조)지만
    // 사용자 지시 "슬롯에 장비가 너무 크게 되어 있음 약간만 줄여"(2026-08-18)로 UI.THUMB_INK 를
    // 0.83 → 0.76 으로 내렸고, 목표치도 같은 비(76/82.9)로 함께 내렸다. 0.83 기준으로 되돌리려면
    // 사용자 지시 철회가 먼저다 — 프로브만 되돌리면 그게 가짜 FAIL 의 출처가 된다.
    const REF_LONG = 76.0, TOL = 2.0, MAX_LONG = 80.8;
    let bad = 0;
    for (const r of rows) {
        const okLong = Math.abs(r.inkLong - REF_LONG) <= TOL;
        const okBound = r.inkMax <= MAX_LONG + TOL;     // 원본 최대 칸보다 크게 삐져나오면 안 된다
        if (!okLong || !okBound) bad++;
        console.log(`${okLong && okBound ? 'PASS' : 'FAIL'} ${r.vp} — 셀 ${r.cell.toFixed(1)}px · 잉크 긴변 평균 ${r.inkLong.toFixed(1)}% (원본 ${REF_LONG}% ±${TOL}%p) · 최대칸 ${r.inkMax.toFixed(1)}% (상한 ${(MAX_LONG + TOL).toFixed(1)}%) · 참고 가로 ${r.inkW.toFixed(1)}% 세로 ${r.inkH.toFixed(1)}%`);
    }
    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n')); else console.log('콘솔 에러 0건');
    console.log('캡처: ref/cell-icons.png');
    console.log(bad || errs.length ? `\n❌ FAIL (${bad} 뷰포트)` : '\n✅ PASS — 전 뷰포트 원본 비율 ±2%p');
    await browser.close();
    process.exit(bad || errs.length ? 1 : 0);
})();
