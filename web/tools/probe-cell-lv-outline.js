// 장비 셀 `Lv. N` 글자가 밝은 아이콘 위에서도 읽히는지 검증 (QA 2026-08-17).
// 아이콘을 셀만큼 키운 뒤, 아래 1px 그림자뿐이던 글자가 발광·금속 파츠 위에서 씻겨나갔다.
// 지표 = **글자 테두리 링의 어두운 픽셀 비율**.
//   글자 마스크(휘도>200)를 2px 팽창한 뒤 글자 본체를 뺀 '링'에서 어두운 픽셀(휘도<80) 비율.
//   bbox 전체를 재는 방식은 글자 **사이 배경**이 결과를 지배해(원본은 어두운 마룬 배경,
//   우리는 이제 밝은 아이콘) 아웃라인 품질을 못 잰다 — 그래서 글자에 붙은 링만 본다.
//   **같은 식으로 원본 shot-042120을 재면 평균 80%(칸별 75~88%)** 다.
//   (TODO의 57~71%는 비평가가 쓴 또 다른 측정식이라 그대로 못 쓴다 — 원본과 클론을
//    같은 식으로 재야 비교가 성립한다.)
// 상한도 본다: 링이 100%에 가까우면서 두꺼우면 '통짜 검은 라벨 칩'이라 원본의
//   '아이콘 위에 얹힌 글자' 인상이 깨진다(비평가 감점 이력).
// 사용: node probe-cell-lv-outline.js   (측정 자체는 아래 measure()가 페이지 안에서 캔버스로 수행)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const REF_AVG = 80, TOL = 8, CHIP = 97;   // 원본 평균 80%(75~88) · ±8%p 허용 · 97% 초과는 '검은 칩'

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], fails = [], rows = [];
    for (const [w, h] of [[430, 932], [499, 892], [360, 800], [412, 915]]) {
        const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
        page.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${w}x${h}: ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
        await page.evaluate(() => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            Combat.tick = function () {};
            // 가장 불리한 조건: 밝은 미래 시대 + 최고 등급 = 발광/금속 파츠
            for (const slot of SLOTS) {
                const it = Forge.rollItem();
                it.slot = slot; it.age = AGES[AGES.length - 1]; it.rarity = 'mythic'; it.level = 107; it.stars = 1;
                S.equipment[slot] = it;
            }
            Combat.recalcHero(); UI.renderEquipSheet();
        });
        await page.waitForTimeout(900);

        // 셀별로 스크린샷을 떠서(devicePixelRatio 2) 글자 주변 어두운 픽셀 비율을 잰다
        const cells = await page.$$('.equip-grid .equip-cell:not(.egg-cell)');
        const perCell = [];
        for (const c of cells) {
            const lv = await c.$('.cell-lv');
            if (!lv) continue;
            const box = await lv.boundingBox();
            const cb = await c.boundingBox();
            if (!box || !cb) continue;
            const PAD = 3;
            const clip = {
                x: Math.max(cb.x, box.x - PAD), y: Math.max(cb.y, box.y - PAD),
                width: Math.min(cb.x + cb.width, box.x + box.width + PAD) - Math.max(cb.x, box.x - PAD),
                height: Math.min(cb.y + cb.height, box.y + box.height + PAD) - Math.max(cb.y, box.y - PAD),
            };
            if (clip.width <= 0 || clip.height <= 0) continue;
            const buf = await page.screenshot({ clip });
            const stat = await page.evaluate(async b64 => {
                const im = new Image();
                await new Promise(r => { im.onload = r; im.src = 'data:image/png;base64,' + b64; });
                const cv = document.createElement('canvas');
                cv.width = im.naturalWidth; cv.height = im.naturalHeight;
                cv.getContext('2d').drawImage(im, 0, 0);
                const W = cv.width, H = cv.height;
                const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
                const L = new Float32Array(W * H);
                for (let i = 0, p = 0; i < d.length; i += 4, p++) L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                const glyph = new Uint8Array(W * H);
                for (let p = 0; p < L.length; p++) if (L[p] > 200) glyph[p] = 1;
                // devicePixelRatio 2로 찍으므로 원본(1배) 기준 2px = 여기서 4px
                const R = 4;
                let ring = 0, dark = 0;
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const p = y * W + x;
                    if (glyph[p]) continue;
                    let near = 0;
                    for (let dy = -R; dy <= R && !near; dy++) for (let dx = -R; dx <= R; dx++) {
                        const yy = y + dy, xx = x + dx;
                        if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue;
                        if (glyph[yy * W + xx]) { near = 1; break; }
                    }
                    if (!near) continue;
                    ring++;
                    if (L[p] < 80) dark++;
                }
                return { ring, dark };
            }, buf.toString('base64'));
            perCell.push(stat.ring ? 100 * stat.dark / stat.ring : 0);
        }
        const avg = perCell.reduce((a, b) => a + b, 0) / (perCell.length || 1);
        const min = Math.min(...perCell), max = Math.max(...perCell);
        rows.push({ vp: `${w}x${h}`, n: perCell.length, avg, min, max });
        await page.close();
    }

    for (const r of rows) {
        const okLo = r.avg >= REF_AVG - TOL;
        const okHi = r.avg <= CHIP;
        if (!okLo) fails.push(`${r.vp}: 글자 주변 어두운 픽셀 ${r.avg.toFixed(0)}% — 원본 평균(${REF_AVG}%)보다 ${TOL}%p 넘게 옅다`);
        if (!okHi) fails.push(`${r.vp}: 글자 주변 어두운 픽셀 ${r.avg.toFixed(0)}% — ${CHIP}% 초과라 통짜 검은 칩으로 읽힌다`);
        console.log(`${okLo && okHi ? 'PASS' : 'FAIL'} ${r.vp} — 셀 ${r.n}칸 평균 ${r.avg.toFixed(0)}% (칸별 ${r.min.toFixed(0)}~${r.max.toFixed(0)}%) · 원본 평균 ${REF_AVG}% (허용 ${REF_AVG - TOL}~${CHIP}%)`);
    }
    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n')); else console.log('콘솔 에러 0건');
    console.log(fails.length || errs.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n') : '\n✅ PASS — Lv 글자 대비가 원본대');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
