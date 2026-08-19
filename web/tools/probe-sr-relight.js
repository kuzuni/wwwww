// 소환 결과 — **셀마다 광원이 다시 켜지는가** 실측 (11차 비평가 A 1순위 [높음]).
// 사용: node probe-sr-relight.js
//
// A 지적: "2~5번째 아이템은 꺼진 광원에서 나온다 — 인과가 첫 개와 주역에만 걸려 있다."
// A 실측(원점 = 광원 중심 ±20px 평균 휘도): t0840 48.8 / t1080 48.7 / t1260 45.1 / t1440 51.3 /
// t1620 51.4 / t1740 51.8 — **시작 프레임 baseline 53.3 보다도 낮다.** 그 900ms 동안
// 2·3·4번 셀이 전부 사출된다.
//
// 이 도구가 재는 것 — **각 셀의 등장 시각에 광원 자리가 실제로 밝아지는가.**
//   ⓐ baseline: 연출 시작 전(t=0) 광원 자리 평균 휘도
//   ⓑ 셀 i 의 등장 직후(_srDelays[i] + LAG) 같은 자리 평균 휘도
//   ⓒ 게이트: 모든 셀에서 ⓑ 가 baseline 보다 충분히 높을 것(RELIGHT_MIN 배)
//
// ⚠️ 광원 자리를 손으로 베끼지 말 것(TODO 함정 ④) — `.sr-wrap` 의 실제 bounding box 중심을
//    페이지에서 읽는다. 레이아웃이 바뀌면 좌표도 따라 움직여야 한다.
// ⚠️ 첫 셀은 설계상 정점(SR_CHARGE_MS)에 뜨므로 원래 밝다 — 문제는 **2번째부터**다.
//    그래서 판정은 '전 셀'이지만 회귀를 보는 눈은 2번째 이후에 둔다(출력에 표시한다).
// ⚠️ 헤드리스에서 rAF 가 안 도는 문제(TODO 함정 ③)를 피하려 시크로 세운다 — 다른 sr 프로브와
//    같은 SEEK 규약(오름차순·두 번 호출)을 쓴다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; S.summonCount = 5000; saveGame();
`;

// 등급이 섞인 판 하나(사다리) — 등급별 --glow 가 플래시 세기에 물리므로 한 판에서 같이 본다.
const MAKE = `(() => {
    const byR = r => SKILL_DEFS.filter(d => d.rarity === r);
    const want = ['common', 'rare', 'epic', 'legendary', 'mythic'];
    const rolls = [];
    for (const r of want) { const p = byR(r); if (!p.length) return 'pool-empty:' + r; rolls.push({ def: p[0], isNew: false }); }
    UI.openSummonResult('skill', rolls);
    return 'ok';
})()`;

const SEEK = `(T => {
    const cells = [...UI._srCells], d = UI._srDelays;
    cells.forEach((c, i) => c.classList.toggle('on', d[i] <= T));
    for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        if (!el || !el.closest) continue;
        const cell = el.closest('.sr-cell');
        a.pause();
        try { a.currentTime = Math.max(0, T - (cell ? (d[cells.indexOf(cell)] || 0) : 0)); } catch (e) { /* 무시 */ }
    }
    return cells.filter(c => c.classList.contains('on')).length;
})`;

const LAG = 70;              // 등장 시각 + 이만큼 뒤를 본다(플래시 정점이 22% 지점 ≈ 66ms)
const RELIGHT_MIN = 1.35;    // 광원 자리 휘도 / baseline. A 실측은 0.85~0.97(= 오히려 어두웠다)

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', e => { if (e.type() === 'error') errors.push('console ' + e.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal && typeof Scene3D !== 'undefined', null, { timeout: 20000 });
    await page.evaluate(SEED);
    await page.evaluate(() => { Scene3D.update = function () { }; });
    await page.waitForTimeout(400);

    const made = await page.evaluate(MAKE);
    if (made !== 'ok') { console.log('판을 못 만들었다: ' + made); await browser.close(); process.exit(2); }
    await page.evaluate('UI.clearSummonTimers()');
    await page.waitForTimeout(150);

    const info = await page.evaluate(() => {
        const w = UI.els.summonResultModal.querySelector('.sr-wrap').getBoundingClientRect();
        return { cx: w.left + w.width / 2, cy: w.top + w.height / 2, delays: [...UI._srDelays] };
    });

    // 광원 자리 ±R px 평균 휘도
    const R = 20;
    const sample = async () => {
        const b64 = (await page.screenshot({ timeout: 90000 })).toString('base64');
        return page.evaluate(async ({ b64, cx, cy, R }) => {
            const im = new Image();
            await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
            const c = document.createElement('canvas');
            c.width = im.width; c.height = im.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            const x0 = Math.max(0, Math.round(cx - R)), y0 = Math.max(0, Math.round(cy - R));
            const d = g.getImageData(x0, y0, R * 2, R * 2).data;
            let s = 0, n = 0;
            for (let i = 0; i < d.length; i += 4) { s += d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114; n++; }
            return s / n;
        }, { b64, cx: info.cx, cy: info.cy, R });
    };

    await page.evaluate(`(${SEEK})(0), (${SEEK})(0)`);
    const base = await sample();

    const rows = [];
    for (let i = 0; i < info.delays.length; i++) {
        const T = info.delays[i] + LAG;
        await page.evaluate(`(${SEEK})(${T}), (${SEEK})(${T})`);
        rows.push({ i, T, lum: await sample() });
    }

    console.log('== 셀별 광원 재점화 실측 (광원 ±' + R + 'px 평균 휘도) ==');
    console.log(`baseline(t=0) ${base.toFixed(1)}`);
    let fail = 0;
    for (const r of rows) {
        const ratio = r.lum / base;
        const ok = ratio >= RELIGHT_MIN;
        if (!ok) fail++;
        console.log(`  셀 ${r.i}  t${String(r.T).padStart(4, '0')}  휘도 ${r.lum.toFixed(1).padStart(6)}  baseline 대비 ${ratio.toFixed(2)}x  ${ok ? 'PASS' : 'FAIL'}${r.i === 0 ? '   (첫 셀은 설계상 정점과 같은 시각)' : ''}`);
    }
    console.log(`게이트: 모든 셀에서 광원 휘도 ≥ baseline × ${RELIGHT_MIN} (A 실측 원본은 0.85~0.97 — 오히려 어두웠다)`);
    console.log(errors.length ? `콘솔/페이지 에러 ${errors.length}건:\n  ` + errors.join('\n  ') : '콘솔/페이지 에러 0건');
    console.log(fail ? `판정: FAIL (${fail}/${rows.length} 셀)` : `판정: PASS (${rows.length}/${rows.length} 셀)`);
    await browser.close();
    process.exit(fail || errors.length ? 1 : 0);
})();
