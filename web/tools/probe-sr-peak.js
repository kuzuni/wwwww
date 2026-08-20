// 소환 결과 — 빛 모임 **정점(480ms)의 광량**과 **배수별 에너지 상승** 실측.
// 사용: node probe-sr-peak.js
//
// 9차 비평가 A ⑵ [치명]: "480ms 정점이 화면을 못 먹는다 — 정점 프레임 t0480의 플레이영역
// 평균 휘도 37.0, 휘도>200 픽셀 **2.05%**뿐이고, ×5와 ×75의 정점 광량이 같아 **배수에
// 따른 에너지 상승이 0**."
//
// 두 가지를 따로 잰다(A가 한 문장에 묶어 놨지만 원인이 다르다):
//  ⒜ **정점 광량** — 정점 프레임의 플레이영역 평균 휘도와 고휘도(>200) 픽셀 비율.
//     '화면을 먹는다'는 건 고휘도 픽셀이 넓게 퍼진다는 뜻이라, 평균만 보면 안 되고 면적을 봐야 한다.
//  ⒝ **배수별 에너지** — x1 < x5 < x75 로 정점 광량이 **단조 증가**해야 한다.
//     75개를 뽑는데 1개 뽑을 때와 같은 빛이 터지면 배수 선택이 연출상 아무 의미가 없다.
//
// ⚠️ 정점 시각은 `UI.SR_CHARGE_MS`(480ms)다 — 하드코딩하지 말고 페이지에서 읽는다.
// ⚠️ **그 시각에 첫 셀 1개는 켜져 있는 게 정상이다** — 설계상 첫 아이콘의 등장 시각이 곧
//    정점(`_srDelays[0] === SR_CHARGE_MS`)이고, 그 순간 셀은 광원 자리에서 opacity .34·scale .3
//    이라 면적이 무시할 수준이다("백색 오버슛이 감쇠하는 동안 아이콘을 꺼낸다"는 인과 설계).
//    처음엔 이걸 '셀 0개'로 못 박아 **멀쩡한 설계를 전제 위반으로 떨어뜨렸다** — 2개 이상일
//    때만 실패로 본다(그때는 구체 밝기가 섞여 '빛 모임 광량'이 아니게 된다).
// ⚠️ 시크는 오름차순으로만, 두 번 부른다(재생성된 애니메이션은 첫 호출 목록에 없다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; S.summonCount = 5000; saveGame();
`;

// 굴림 수만 다르고 등급 구성은 같게 만든다 — 등급 예고(--pre-k)가 섞이면 배수 효과를 못 가른다.
const MAKE = (n) => `(() => {
    const lows = SKILL_DEFS.filter(d => d.rarity === 'common');
    if (!lows.length) return 'pool-empty';
    const rolls = [];
    for (let i = 0; i < ${n}; i++) rolls.push({ def: lows[i % lows.length], isNew: false });
    UI.openSummonResult('skill', rolls);
    return 'ok';
})()`;

const SEEK = `(T => {
    const m = UI.els.summonResultModal;
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

const ROLLS = [1, 5, 25, 75];
// 판정 기준 — 아래 '기준선' 주석 참조
const MIN_HOT = 0.08;      // ⒜ 정점의 고휘도(>200) 픽셀 비율 하한. A 실측 0.0205 의 약 4배
const MIN_MEAN = 55;       // ⒜ 정점의 플레이영역 평균 휘도(0~255). A 실측 37.0
const MIN_STEP = 1.12;     // ⒝ 배수 한 단계당 고휘도 면적 증가 배율(x1→x5→x25→x75)

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', e => { if (e.type() === 'error') errors.push('console ' + e.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal && typeof Scene3D !== 'undefined', null, { timeout: 20000 });
    await page.evaluate(SEED);
    await page.evaluate(() => { Scene3D.update = function () { }; const bl = document.getElementById('boot-loading'); if (bl) bl.remove(); });
    await page.waitForTimeout(450);
    const peakT = await page.evaluate(() => UI.SR_CHARGE_MS);

    const fails = [];
    const rows = [];
    for (const n of ROLLS) {
        const made = await page.evaluate(MAKE(n));
        if (made !== 'ok') { fails.push(`x${n}: 판을 못 만들었다 (${made})`); continue; }
        await page.evaluate(`UI.clearSummonTimers()`);
        await page.waitForTimeout(120);
        // 정점 직전(-50ms)과 정점 — 오름차순
        const out = {};
        for (const T of [peakT - 50, peakT]) {
            const onCells = await page.evaluate(`(${SEEK})(${T}), (${SEEK})(${T})`);
            const b64 = (await page.screenshot({ timeout: 90000 })).toString('base64');
            const px = await page.evaluate(async ({ b64 }) => {
                const im = new Image();
                await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
                const c = document.createElement('canvas');
                c.width = im.width; c.height = im.height;
                const g = c.getContext('2d'); g.drawImage(im, 0, 0);
                const y0 = Math.round(im.height * .13), y1 = Math.round(im.height * .87);
                const d = g.getImageData(0, y0, im.width, y1 - y0).data;
                let s = 0, n2 = 0, hot = 0, mid = 0;
                for (let i = 0; i < d.length; i += 4) {
                    const v = d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114;
                    s += v; n2++; if (v > 200) hot++; if (v > 110) mid++;
                }
                return { mean: +(s / n2).toFixed(2), hot: +(hot / n2).toFixed(5), mid: +(mid / n2).toFixed(5) };
            }, { b64 });
            out[T] = { ...px, onCells };
        }
        rows.push({ n, cells: await page.evaluate(() => UI._srCells.length), ...out[peakT], pre: out[peakT - 50] });
        await page.evaluate(() => UI.closeSummonResult());
        await page.waitForTimeout(130);
    }
    await browser.close();

    console.log(`정점 시각 = UI.SR_CHARGE_MS = ${peakT}ms\n`);
    console.log(' 굴림  셀  정점평균휘도  고휘도>200  중휘도>110   정점직전평균  셀수(정점)');
    for (const r of rows) {
        console.log(`  x${String(r.n).padEnd(3)} ${String(r.cells).padStart(3)} ${r.mean.toFixed(2).padStart(12)} `
            + `${(r.hot * 100).toFixed(2).padStart(10)}% ${(r.mid * 100).toFixed(2).padStart(10)}% `
            + `${r.pre.mean.toFixed(2).padStart(13)} ${String(r.onCells).padStart(10)}`);
    }

    // 전제: 정점 프레임에 셀이 떠 있으면 구체 밝기가 섞여 '빛 모임 광량'이 아니다
    for (const r of rows) if (r.onCells > 1) fails.push(`x${r.n}: 정점 프레임에 셀이 ${r.onCells}개 떠 있다 — 구체 밝기가 섞여 '빛 모임 광량'이 아니다(1개는 정상 — 위 주석 참조)`);

    // ⒜ 정점 광량
    for (const r of rows) {
        if (r.hot < MIN_HOT) fails.push(`x${r.n}: 정점 고휘도(>200) 면적 ${(r.hot * 100).toFixed(2)}% < 기준 ${MIN_HOT * 100}% — 정점이 화면을 못 먹는다(A ⑵)`);
        if (r.mean < MIN_MEAN) fails.push(`x${r.n}: 정점 평균 휘도 ${r.mean} < 기준 ${MIN_MEAN} (A 실측 37.0)`);
    }
    // ⒝ 배수별 에너지 — 단조 증가 + 단계당 최소 배율
    for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1], b = rows[i];
        const ratio = a.hot > 0 ? b.hot / a.hot : Infinity;
        if (ratio < MIN_STEP) {
            fails.push(`x${a.n}→x${b.n}: 정점 고휘도 면적이 ${(a.hot * 100).toFixed(2)}% → ${(b.hot * 100).toFixed(2)}% `
                + `(×${ratio.toFixed(2)}) — 기준 ×${MIN_STEP} 미달. 배수에 따른 에너지 상승이 없다(A ⑵)`);
        }
    }

    console.log('');
    if (errors.length) { console.log(`콘솔/페이지 에러 ${errors.length}건:`); errors.slice(0, 6).forEach(e => console.log('   ' + e)); }
    if (fails.length) { console.log(`FAIL ${fails.length}건`); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
    if (errors.length) process.exit(1);
    console.log(`PASS — 정점이 화면을 먹고(고휘도 ≥${MIN_HOT * 100}%, 평균 ≥${MIN_MEAN}) 배수마다 에너지가 오른다(단계당 ×${MIN_STEP} 이상)`);
})();
