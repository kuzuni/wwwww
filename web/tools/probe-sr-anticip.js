// 주역(최고 등급) 등장 직전의 '들이쉼' 구간이 실제로 조여드는지 실측한다.
//
// 10차 비평가 A ⓷ · B ⓹ 가 **독립적으로 같은 구간**을 짚었다(2인 일치):
//   A: t0840~t1740 내내 전역 평균 휘도가 31~33 에 갇혀 있고, t1620~t1800 에 축적이 없다
//   B: t1620→t1680 중앙 41,800px 중 **35px만 변화(0.08%)**, t1680→t1740 에서야 코너 비네트가
//      15.14 → 12.28(−19%)로 처음 어두워지고 60ms 뒤 바로 폭발 — 흡기가 짧고 약하다
//
// 🚨 **자 선택이 이 항목의 핵심이다.** 처음엔 `probe-sr-timeline` 의 '전역 평균 휘도의 프레임 간
// 변화'로 재려 했는데, 그 자로는 개선이 **후퇴로 나온다**(실측 0.00899 → 0.00648). 이유가 있다 —
// 흡기는 **가장자리를 어둡게 하면서 중앙을 밝게** 하는 연출이라 두 성분이 전역 평균에서 서로
// 상쇄된다. 즉 전역 평균은 '무대가 조여드는가'를 원리적으로 못 재는 자다. B 가 실제로 쓴 자도
// 전역 평균이 아니라 **코너 휘도**였다. 그래서 여기서는 공간 대비로 잰다:
//   ⑴ 코너 휘도 감쇠율 (게이트: −30% 이상 어두워질 것 — B 요구치 −35% 언저리)
//   ⑵ 중앙/코너 대비비 상승률 (무대가 조여든 정도)
//   ⑶ 구간 내 어느 120ms 창에서도 코너 휘도가 멈추지 않을 것(정지 프레임 금지 — 앞 회차 교훈)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9;
    saveGame();
`;
const RNG = seed => `(() => { let a = ${seed} >>> 0; Math.random = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; })()`;
const OPEN = `S.summonCount = 5000; S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`;

// 흡기 구간을 시각으로 재현한다 — `.charging` 의 원점은 **마지막 셀 하나만 남은 시각** d[n-2] 다
// (0 으로 두면 currentTime 이 지속시간을 넘겨 전부 끝 프레임에 고정된다 — 7차에서 밟은 함정).
const SEEK = `((T, base) => {
    const m = UI.els.summonResultModal;
    const cells = [...UI._srCells], d = UI._srDelays, last = d[d.length - 1];
    cells.forEach((c, i) => c.classList.toggle('on', d[i] <= T));
    m.classList.toggle('charging', !!UI._srHoldback && base <= T && T < last);
    m.classList.toggle('hero', UI._srHeroIdx >= 0 && last <= T);
    const CHARGE_ANIM = ['srfloorcharge', 'srtickup', 'srhalocharge', 'srvig', 'srinhale'];
    for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        let b = 0;
        if (a.animationName && CHARGE_ANIM.indexOf(a.animationName) >= 0) b = base;
        else if (el && el.closest && el.closest('.sr-cell')) b = d[cells.indexOf(el.closest('.sr-cell'))] || 0;
        a.pause();
        try { a.currentTime = Math.max(0, T - b); } catch (e) { /* 무한 반복 예외 무시 */ }
    }
})`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(`PAGEERROR ${e}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && UI.els');
    await page.evaluate(SEED);
    await page.evaluate(`Scene3D.update = function () {};`);
    await page.evaluate(RNG(14) + ';' + OPEN);
    await page.evaluate(`UI.clearSummonTimers()`);

    const t = await page.evaluate(`({ d: UI._srDelays, hold: UI._srHoldback })`);
    if (!t.hold) { console.log('홀드백이 없는 판이다 — 흡기 구간 자체가 없음'); await browser.close(); process.exit(1); }
    const base = t.d[t.d.length - 2], last = t.d[t.d.length - 1];
    const TIMES = [];
    for (let T = base; T <= last; T += (process.env.SR_STEP ? +process.env.SR_STEP : 60)) TIMES.push(T);
    if (TIMES[TIMES.length - 1] !== last) TIMES.push(last);

    console.log(`== 주역 등장 직전 '들이쉼' 구간 실측 (t${base}~t${last}, ${last - base}ms) ==`);
    console.log('  코너 = 앱 네 귀퉁이 각 64×64 평균 · 중앙 = 화면 중심 128×128 평균\n');
    console.log('    시각   코너휘도   중앙휘도   중앙/코너   코너변화');
    const rows = [];
    for (const T of TIMES) {
        await page.evaluate(`(${SEEK})(${T}, ${base})`);
        const b64 = (await page.screenshot({ timeout: 60000 })).toString('base64');
        const r = await page.evaluate(async ({ b64 }) => {
            const im = new Image();
            await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
            const c = document.createElement('canvas');
            c.width = im.width; c.height = im.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            const app = document.getElementById('app').getBoundingClientRect();
            const sc = im.height / window.innerHeight;
            const box = (x, y, w, h) => {
                x = Math.max(0, Math.round(x * sc)); y = Math.max(0, Math.round(y * sc));
                w = Math.round(w * sc); h = Math.round(h * sc);
                const d = g.getImageData(x, y, w, h).data;
                let s = 0, n = 0;
                for (let i = 0; i < d.length; i += 4) { s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; n++; }
                return s / n;
            };
            const L = app.left, R = app.right, TP = app.top, B = app.bottom;
            const corner = (box(L, TP, 64, 64) + box(R - 64, TP, 64, 64) + box(L, B - 64, 64, 64) + box(R - 64, B - 64, 64, 64)) / 4;
            const centre = box((L + R) / 2 - 64, (TP + B) / 2 - 64, 128, 128);
            return { corner, centre };
        }, { b64 });
        rows.push({ T, ...r });
    }
    let prev = null, minStep = Infinity, minAt = 0;
    for (const r of rows) {
        const dlt = prev === null ? 0 : r.corner - prev;
        if (prev !== null) { const a = Math.abs(dlt); if (a < minStep) { minStep = a; minAt = r.T; } }
        console.log(`  t${String(r.T).padStart(4, '0')}   ${r.corner.toFixed(2).padStart(7)}   ${r.centre.toFixed(2).padStart(7)}   ${(r.centre / Math.max(.01, r.corner)).toFixed(2).padStart(8)}   ${(prev === null ? '—' : dlt.toFixed(2)).padStart(7)}`);
        prev = r.corner;
    }
    const c0 = rows[0].corner, c1 = rows[rows.length - 1].corner;
    const k0 = rows[0].centre / Math.max(.01, c0), k1 = rows[rows.length - 1].centre / Math.max(.01, c1);
    const drop = (c0 - c1) / Math.max(.01, c0) * 100;
    const lift = (k1 / Math.max(.01, k0) - 1) * 100;
    console.log('');
    console.log(`  ⑴ 코너 휘도 ${c0.toFixed(2)} → ${c1.toFixed(2)}  = ${drop.toFixed(1)}% 감쇠   (게이트 ≥ 30%)`);
    console.log(`  ⑵ 중앙/코너 대비비 ${k0.toFixed(2)} → ${k1.toFixed(2)}  = +${lift.toFixed(1)}%   (게이트 ≥ +40%)`);
    console.log(`  ⑶ 최소 60ms 코너 변화 ${minStep.toFixed(3)} (t${minAt})   (게이트 > 0.05 — 정지 프레임 금지)`);
    const pass = drop >= 30 && lift >= 40 && minStep > 0.05;
    console.log(errors.length ? errors.join('\n') : '콘솔/페이지 에러 0건');
    console.log('판정: ' + (pass ? 'PASS' : 'FAIL — 흡기가 약하다'));
    await browser.close();
    process.exit(pass ? 0 : 1);
})();
