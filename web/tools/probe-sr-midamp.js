// 소환 결과 x75 — **중반 진폭** 실측 게이트 (11차 비평가 2인 일치 ⑴ 의 자를 상설화).
// A C: x75 t0990~t2520 17프레임 연속 프레임차가 정점의 3~5% = 1530ms 죽은 화면.
// B 4번: x75 t0900~t2520 1620ms meanAbsDiff 1.25~2.45 고정.
// 처방(행 단위 웨이브 + 등급 챕터 정지/링 플래시)이 실제로 중반을 살렸는지 같은 자로 잰다.
//
// 사용: PW_PATH=<playwright 경로> node probe-sr-midamp.js
//
// 판정(둘 다 만족):
//   G1 중반 창(**절대 900~2520ms** — A·B 가 잰 바로 그 창. 캐스케이드가 일찍 끝나면 그 뒤의
//      죽은 idle 이 그대로 평균을 깎는다 — 창을 캐스케이드 끝에서 자르면 원지적이 안 잡힌다)
//      프레임 간 변화 평균 ≥ 0.15 × REF_PEAK(0.1443)
//      (비평가 목표 '정점의 15~25%' 의 하한. ⚠️ 분모는 이 프로브가 재는 값이 아니라
//       11차 세션이 문서화한 정점 상수 0.1443 이다 — 자기 회차의 Δ 정점(0.35대)이나 휘도
//       레벨 정점(0.47대)으로 나누면 회차마다 분모가 흔들리고, 무엇보다 앞 세션의
//       '6.0% = 0.00871' 절대 눈금과 이어지지 않는다. 0.15×0.1443=0.02165 는 그 눈금의
//       연속이다. 이 자로 수정 전 빌드가 FAIL 나는 것을 확인하고 세웠다)
//   G2 중반 창 안에서 'Δ 정점 5% 미만'이 연속되는 최장 구간 ≤ 480ms
//      (평균만 보면 플래시 한 방이 긴 정지를 가릴 수 있다 — 죽은 스트레치 자체를 잰다)
//
// ⚠️ 시크(60ms 절대 격자)는 결정론적이다 — 실시간 캡처의 밀림·위상 표집이 없다.
// ⚠️ RNG 시드 3 = shot-summon-result.js tl-x75 와 같은 판(18종 전 등급 분포). 시드를 바꾸면
//    등급 경계 수가 달라져 회차 간 비교가 무너진다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; S.summonCount = 5000;
    saveGame();
`;
const FREEZE_3D = `Scene3D.update = function () {};
    // 🚨 부팅 오버레이(#boot-loading)를 지운다 — 소등이 CSS transition 이라 시크의
    // getAnimations() 일괄 pause 에 걸리면 t0 프레임이 통째로 로딩 화면이 된다(실제로
    // tl-*/t0000 두 세트가 그렇게 구워졌고, 11차 B 9번 't0000 이 완전히 같은 프레임'
    // 지적의 정체가 이것이다). 경쟁이라 회차마다 걸리기도 안 걸리기도 한다.
    const bl = document.getElementById('boot-loading'); if (bl) bl.remove();`;
const RNG = seed => `(() => { let a = ${seed} >>> 0; Math.random = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; })()`;

// shot-summon-result.js 와 같은 시크 — 셀 클래스 + 상태 클래스 + 애니메이션 currentTime.
const SEEK = `(T => {
    const m = UI.els.summonResultModal;
    const cells = [...UI._srCells], d = UI._srDelays, last = d[d.length - 1];
    cells.forEach((c, i) => c.classList.toggle('on', d[i] <= T));
    m.classList.toggle('flash', !!UI._srHoldback && last <= T);
    m.classList.toggle('hero', UI._srHeroIdx >= 0 && last <= T);
    m.classList.toggle('charging', !!UI._srHoldback && d[d.length - 2] !== undefined
        && d[d.length - 2] <= T && T < last);
    m.classList.toggle('done', T >= last + UI.SR_TAIL_MS);
    if (m.classList.contains('done')) UI.buildSummonReflection();
    else { const r = m.querySelector('.sr-reflect'); if (r) r.remove(); }
    const HERO_ANIM = ['srrecede', 'srheropop', 'srbeam', 'srheroring', 'srshakehit', 'srgridlift'];
    const CHARGE_ANIM = ['srfloorcharge', 'srtickup', 'srhalocharge', 'srvig'];
    for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        if (!el || !el.getRootNode) continue;
        let base = 0;
        const cell = el.closest ? el.closest('.sr-cell') : null;
        if (a.animationName && HERO_ANIM.indexOf(a.animationName) >= 0) base = last;
        else if (a.animationName && CHARGE_ANIM.indexOf(a.animationName) >= 0) base = d[d.length - 2] || 0;
        else if (cell) base = d[cells.indexOf(cell)] || 0;
        else if (el.classList && el.classList.contains('sr-flash')) base = last;
        a.pause();
        try { a.currentTime = Math.max(0, T - base); } catch (e) { /* 무한 반복 외 예외 무시 */ }
    }
})`;

const STATS = `(async (b64, prev) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, diff = 0, sum = 0;
    const cur = [];
    for (let i = 0; i < px.length; i += 16) { // 4픽셀 간격
        const l = (px[i] * .2126 + px[i + 1] * .7152 + px[i + 2] * .0722) / 255;
        n++; cur.push(l); sum += l;
        if (prev) diff += Math.abs(l - prev[n - 1]);
    }
    return { diff: prev ? diff / n : null, mean: sum / n, cur };
})`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && UI.els');
    await page.evaluate(SEED);
    await page.evaluate(FREEZE_3D);
    await page.waitForTimeout(200);

    // 시드 주입과 소환은 한 evaluate 안 — 사이에 게임 루프가 난수를 먹으면 판이 바뀐다
    await page.evaluate(`${RNG(3)}; S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`);
    await page.evaluate(`UI.clearSummonTimers()`);
    const info = await page.evaluate(`({
        delays: UI._srDelays, breaks: UI._srTierBreaks, tail: UI.SR_TAIL_MS,
        tiers: [...UI._srCells].map(c => +c.dataset.tier),
    })`);
    const last = info.delays[info.delays.length - 1];
    console.log(`셀 ${info.delays.length}개 · 캐스케이드 끝 ${last}ms · 챕터 경계 ${(info.breaks || []).length}건`);
    console.log('delays', JSON.stringify(info.delays));
    console.log('breaks', JSON.stringify(info.breaks));

    const shot = await browser.newPage();
    await shot.goto('about:blank');

    const END = Math.max(last + info.tail + 300, 2580);
    const rows = [];
    let prev = null;
    for (let t = 0; t <= END; t += 60) {
        // 시크 두 번 — 클래스 변경으로 새로 생긴 애니메이션은 첫 호출의 getAnimations()에 없다
        await page.evaluate(`(${SEEK})(${t}), (${SEEK})(${t})`);
        const buf = await page.screenshot();
        const st = await shot.evaluate(`(${STATS})(${JSON.stringify(buf.toString('base64'))}, ${prev ? JSON.stringify(prev) : 'null'})`);
        prev = st.cur;
        rows.push({ t, diff: st.diff, mean: st.mean });
    }

    const peak = rows.reduce((m, r) => Math.max(m, r.diff || 0), 0);       // Δ 정점 — G2 의 분모
    const peakLvl = rows.reduce((m, r) => Math.max(m, r.mean || 0), 0);    // 휘도 레벨 정점 — G1 의 분모
    const winEnd = 2520; // A·B 의 절대 창 — 캐스케이드 끝과 무관하게 고정
    const win = rows.filter(r => r.t >= 900 && r.t <= winEnd && r.diff !== null);
    const mean = win.reduce((s, r) => s + r.diff, 0) / win.length;
    // 죽은 스트레치 — 정점 5% 미만이 연속되는 최장 구간(ms)
    let dead = 0, run = 0;
    for (const r of win) {
        run = r.diff < peak * 0.05 ? run + 60 : 0;
        if (run > dead) dead = run;
    }

    console.log('\n  t(ms)   mean     Δ(직전)   /Δ정점');
    for (const r of rows) {
        if (r.diff === null) continue;
        console.log(`  ${String(r.t).padStart(4)}   ${r.mean.toFixed(4)}   ${r.diff.toFixed(5)}   ${(r.diff / peak * 100).toFixed(1).padStart(5)}%`);
    }
    console.log(`\nΔ 정점 ${peak.toFixed(5)} · 휘도 레벨 정점 ${peakLvl.toFixed(4)} / 중반 창 900~${winEnd}ms (${win.length}프레임)`);
    console.log(`중반 평균 Δ ${mean.toFixed(5)} = 레벨 정점의 ${(mean / peakLvl * 100).toFixed(1)}% (Δ 정점의 ${(mean / peak * 100).toFixed(1)}%)`);
    console.log(`중반 최장 죽은 스트레치(Δ정점 5% 미만 연속) ${dead}ms`);

    const REF_PEAK = 0.1443; // 11차 세션이 문서화한 정점 눈금 — 위 머리말 참조
    const out = [];
    const ok = (c, m) => { out.push((c ? 'PASS ' : 'FAIL ') + m); return c; };
    ok(mean >= REF_PEAK * 0.15, `G1 중반 평균 Δ ${mean.toFixed(5)} = 기준 정점(${REF_PEAK})의 ${(mean / REF_PEAK * 100).toFixed(1)}% (기준 ≥15%)`);
    ok(dead <= 480, `G2 최장 죽은 스트레치 ${dead}ms (기준 ≤480ms)`);
    console.log('\n' + out.join('\n'));
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE/PAGE ERRORS');
    if (out.some(l => l.startsWith('FAIL')) || errors.length) process.exitCode = 1;
    await browser.close();
})();
