// 소환 결과 팝업 — **주역 착지 정점의 세기**를 배수별로 잰다. 사용: node tools/probe-sr-hero-punch.js
//
// 왜: 10차 비평가 B ⓶ [치명] "x75 신화가 x5 신화보다 약하다 — 위계 역전. 가장 비싼 뽑기가
// 가장 약한 순간이 된다." B 실측 — x5-hi 는 t1740→t1800 **60ms에 전역 휘도 +111%**, x75 는
// t2430~t3060 **450ms에 걸쳐 +32%**(단일 프레임 최대 +3.1). 서서히 밝아지는 배경은 '사건'이 아니다.
//
// 원인은 코드 한 줄이었다(이 프로브의 ⓐ 판정이 그걸 못 박는다): `_srHoldback` 이
// '마지막 항목의 qty === 1' 을 요구하는데 대량 소환은 같은 항목을 한 셀로 묶어 마지막 신화 셀이
// `×5` 가 된다 → holdback=false → `.flash` 가 아예 안 걸린다.
//
// 판정:
//   ⓐ 주역이 있는 판이면 **정점 클래스가 반드시 하나는 걸린다**(holdback → .flash / 아니면 .wipe)
//   ⓑ 주역 착지 부근에서 **단일 스텝 전역 휘도 상승률**이 배수와 무관하게 임계 이상
//   ⓒ 정점 프레임에서 **위쪽 셀들이 하얗게 뭉개지지 않는다**(x75에 전 화면 섬광을 쓰면 안 되는 이유)
//
// ⚠️ 시크(SEEK)로 절대 시각에 세워 찍는다 — 실시간으로는 swiftshader 스크린샷 지연 때문에
//    40ms 격자를 못 만든다. 원점 규칙은 shot-summon-result.js 의 SEEK 와 같다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `S.tickets=999999;S.gems=999999;S.eggCurrency=999999;S.winders=999999;S.bestChapter=20;S.bestStage=9;saveGame();`;
const FREEZE_3D = `Scene3D.update = function () {};`;
const RNG = seed => `(() => { let a = ${seed} >>> 0; Math.random = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; })()`;

// 시크 — shot-summon-result.js 와 같은 규칙 + 이번에 추가된 .wipe 도 시각으로 재현한다.
const SEEK = `(T => {
    const m = UI.els.summonResultModal;
    const cells = [...UI._srCells], d = UI._srDelays, last = d[d.length - 1];
    cells.forEach((c, i) => c.classList.toggle('on', d[i] <= T));
    const heroOn = UI._srHeroIdx >= 0 && last <= T;
    m.classList.toggle('flash', !!UI._srHoldback && last <= T);
    m.classList.toggle('wipe', heroOn && !UI._srHoldback);
    m.classList.toggle('hero', heroOn);
    m.classList.toggle('charging', !!UI._srHoldback && d[d.length - 2] !== undefined
        && d[d.length - 2] <= T && T < last);
    m.classList.toggle('done', T >= last + UI.SR_TAIL_MS);
    if (m.classList.contains('done')) UI.buildSummonReflection();
    else { const r = m.querySelector('.sr-reflect'); if (r) r.remove(); }
    for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        if (!el || !el.getRootNode) continue;
        let base = 0;
        const cell = el.closest ? el.closest('.sr-cell') : null;
        const HERO_ANIM = ['srrecede', 'srheropop', 'srbeam', 'srheroring', 'srshakehit', 'srgridlift', 'srwipe'];
        const CHARGE_ANIM = ['srfloorcharge', 'srtickup', 'srhalocharge', 'srvig'];
        if (a.animationName && HERO_ANIM.indexOf(a.animationName) >= 0) base = last;
        else if (a.animationName && CHARGE_ANIM.indexOf(a.animationName) >= 0) base = d[d.length - 2] || 0;
        else if (cell) base = d[cells.indexOf(cell)] || 0;
        else if (el.classList && (el.classList.contains('sr-flash') || el.classList.contains('sr-wipe'))) base = last;
        a.pause();
        try { a.currentTime = Math.max(0, T - base); } catch (e) { /* 무한 반복 외 예외 무시 */ }
    }
})`;

const CASES = [
    ['x5-hi', `S.summonCount=5000; S.summonMult={skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 14],
    ['x25',   `S.summonCount=5000; S.summonMult={skill:25}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 3],
    ['x75',   `S.summonCount=5000; S.summonMult={skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 3],
];

const STEP = 40;      // ms — B 가 쓴 60/90ms 격자보다 촘촘히(단일 프레임 상승을 놓치지 않게)
const BEFORE = 120;   // 착지 이전 구간
const AFTER = 520;    // 착지 이후 구간

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const out = [];
    const ok = (c, m) => { out.push((c ? 'PASS ' : 'FAIL ') + m); return c; };
    const errors = [];
    const rows = [];

    for (const [tag, src, seed] of CASES) {
        const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
        p.on('pageerror', e => errors.push(`${tag}: ${e}`));
        p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
        await p.goto(INDEX, { waitUntil: 'load' });
        await p.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.summonResultModal, null, { timeout: 20000 });
        await p.evaluate(SEED);
        await p.evaluate(FREEZE_3D);
        await p.evaluate(`(() => { ${RNG(seed)}; ${src} })()`);
        await p.waitForTimeout(250);
        // 3D 캔버스를 숨겨 캡처 비용을 없앤다(팝업은 불투명 풀스크린이라 화면은 같다)
        await p.evaluate(`{ const c = document.querySelector('#scene canvas') || document.querySelector('canvas'); if (c) c.style.visibility = 'hidden'; }`);

        const meta = await p.evaluate(`({ last: UI._srDelays[UI._srDelays.length - 1], hero: UI._srHeroIdx,
                                          holdback: !!UI._srHoldback, cells: UI._srCells.length })`);
        // 🚨 **실재생 경로를 따로 확인한다.** 아래 SEEK 는 .flash/.wipe 를 직접 토글하므로,
        //    fireSummonHero() 가 실제로 그 클래스를 거는지는 시크 경로가 절대 못 잡는다 —
        //    이 지적의 근인이 바로 그 함수의 분기였으니(holdback=false 면 아무것도 안 걸림)
        //    거기가 되돌아가도 프로브가 초록불이면 자로서 쓸모가 없다.
        const liveCls = await p.evaluate(`(() => {
            UI.fireSummonHero();
            return UI.els.summonResultModal.className;
        })()`);
        const shots = [];
        for (let t = meta.last - BEFORE; t <= meta.last + AFTER; t += STEP) {
            await p.evaluate(`(${SEEK})(${t})`);
            const buf = await p.screenshot({ clip: { x: 0, y: 91, width: 412, height: 732 } });
            shots.push({ t, buf });
        }
        const cls = await p.evaluate(`UI.els.summonResultModal.className`);

        // 전역 평균 휘도 — B 의 자와 같다
        // ⚠️ Promise.all 은 **페이지 안에서** 해야 한다 — 배열에 Promise 를 담아 반환하면
        //    Playwright 가 직렬화하면서 빈 객체가 되고, 전부 NaN 으로 나온다(처음에 그렇게 나왔다).
        const lum = await p.evaluate(bufs => Promise.all(bufs.map(b64 => new Promise(res => {
            const img = new Image();
            img.onload = () => {
                const cv = document.createElement('canvas');
                cv.width = img.width; cv.height = img.height;
                const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
                const d = g.getImageData(0, 0, cv.width, cv.height).data;
                let s = 0, n = 0, blown = 0;
                for (let i = 0; i < d.length; i += 4) {
                    const v = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
                    s += v; n++; if (v > 244) blown++;
                }
                res({ mean: s / n, blown: blown / n });
            };
            img.src = 'data:image/png;base64,' + b64;
        }))), shots.map(s => s.buf.toString('base64')));

        let bestRise = 0, bestAt = 0;
        for (let i = 1; i < lum.length; i++) {
            const r = (lum[i].mean - lum[i - 1].mean) / Math.max(1e-6, lum[i - 1].mean);
            if (r > bestRise) { bestRise = r; bestAt = shots[i].t - meta.last; }
        }
        const blownMax = Math.max(...lum.map(l => l.blown));
        rows.push({ tag, meta, cls, liveCls, bestRise, bestAt, blownMax });
        await p.close();
    }

    for (const r of rows) {
        console.log(`  ${r.tag.padEnd(6)} 셀 ${String(r.meta.cells).padStart(2)} · holdback ${r.meta.holdback ? 'O' : 'X'}`
            + ` · classes "${r.cls.replace('modal ', '')}" · 단일 ${STEP}ms 최대 상승 ${(r.bestRise * 100).toFixed(1)}%`
            + ` (착지 ${r.bestAt >= 0 ? '+' : ''}${r.bestAt}ms) · 포화 픽셀 최대 ${(r.blownMax * 100).toFixed(2)}%`);
    }
    // 위계 진단 — 가장 비싼 뽑기의 정점이 가장 싼 것에 비해 얼마나 되는가(B 지적의 본체)
    if (rows.length > 1) {
        const first = rows[0].bestRise, last = rows[rows.length - 1].bestRise;
        console.log(`  위계: ${rows[rows.length - 1].tag} 정점 / ${rows[0].tag} 정점 = ${(last / Math.max(1e-6, first) * 100).toFixed(0)}%`);
    }
    for (const r of rows) {
        // ⓐ 주역이 있으면 정점 클래스가 반드시 하나는 걸린다 — 이게 이 지적의 근인이었다
        ok(r.meta.hero < 0 || /\b(flash|wipe)\b/.test(r.liveCls),
            `[${r.tag}] fireSummonHero()가 실제로 정점 클래스를 건다: "${r.liveCls.replace('modal ', '')}"`);
        // ⓑ 단일 스텝 상승률 — **holdback 경로(.flash)와 같은 급**을 요구한다. 실측 x5-hi 186% ·
        //    x25 107% · x75 102%(수정 전 x75는 B 실측 단일 최대 +3.1%). 60%로 잡으면 셋 다
        //    여유 있게 통과하면서, '작은 원반' 같은 어중간한 구현(첫 판 20.6%)은 걸러진다.
        //    ⚠️ 이 값을 내리려거든 수정 전 빌드로 여전히 FAIL 인지부터 확인할 것.
        ok(r.bestRise >= 0.60, `[${r.tag}] 단일 ${STEP}ms 상승 ${(r.bestRise * 100).toFixed(1)}% (기준 ≥60%)`);
        // ⓒ 위쪽 셀이 하얗게 뭉개지면 안 된다 — x75에 전 화면 섬광을 그대로 쓰면 여기서 걸린다
        ok(r.blownMax <= 0.12, `[${r.tag}] 정점 포화 픽셀 ${(r.blownMax * 100).toFixed(2)}% (기준 ≤12%)`);
    }

    out.forEach(l => console.log('  ' + l));
    if (errors.length) console.log('  콘솔 에러:', errors.slice(0, 5));
    else console.log('  콘솔 에러 0건');
    const fail = out.filter(l => l.startsWith('FAIL')).length + errors.length;
    console.log(fail ? `\n실패 ${fail}건` : '\n전체 통과');
    await b.close();
    process.exit(fail ? 1 : 0);
})();
