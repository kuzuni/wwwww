// 소환 결과 팝업 — **등장(사출·착지) 중 인접 셀이 서로 침범하는가** 실측.
// 사용: node tools/probe-sr-crowd.js
//
// 왜: 10차 비평가 잔여 ① [2인 일치]. B — `skill-x5-1400` 에서 4·5번 **이름칩이 x=265~347에
// 연속 단일 덩어리로 융합**(안정 상태는 각 60~62px·간격 16~17px), `skill-x5-900` 에서 4번 셀이
// 3번 셀 위에 **13px 상호침투**. 원인은 구조다 — 사출 경로가 전 셀을 **같은 광원 한 점**에서
// 꺼내므로 비행 중에는 이웃과 같은 자리를 지난다(경로 자체는 의도한 연출이다).
//
// ⚠️ 캡처가 아니라 **rAF 로 rect 를 훑는다**. 이유 두 가지:
//   ⒜ swiftshader 스크린샷은 장당 초 단위라 250ms 간격 캐스케이드의 중간을 못 잡는다.
//   ⒝ 시크(currentTime) 방식은 앞 세션들이 원점을 두 번 놓쳐 틀린 결론을 냈다 — 실제 재생을
//      그대로 훑으면 원점 문제가 원리적으로 없다.
// 판정은 **화면에 실제로 그려진 상자**(getBoundingClientRect = transform 반영)로 한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; saveGame();
`;
const FREEZE_3D = `Scene3D.update = function () {};
    // 🚨 부팅 오버레이(#boot-loading)를 지운다 — 소등이 CSS transition 이라 시크의
    // getAnimations() 일괄 pause 에 걸리면 t0 프레임이 통째로 로딩 화면이 된다(실제로
    // tl-*/t0000 두 세트가 그렇게 구워졌고, 11차 B 9번 't0000 이 완전히 같은 프레임'
    // 지적의 정체가 이것이다). 경쟁이라 회차마다 걸리기도 안 걸리기도 한다.
    const bl = document.getElementById('boot-loading'); if (bl) bl.remove();`;
// shot-summon-result.js 와 같은 mulberry32 — 시드 14 는 x5 가 [희귀한·서사시·전설·궁극의·신화]
const RNG = seed => `(() => { let a = ${seed} >>> 0; Math.random = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; })()`;

const CASES = [
    ['skill-x5-hi', `S.summonCount = 5000; S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 14],
    ['skill-x5',    `S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 14],
    ['skill-x75',   `S.summonCount = 5000; S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 3],
];

// 같은 행(세로 중심이 8px 이내)에서 가로로 이웃한 두 상자의 **간격**(음수 = 침범).
// 행이 다르면 비교하지 않는다 — 다른 줄끼리는 겹칠 일이 구조적으로 없다.
const SAMPLER = `(() => {
    const grid = UI.els.summonResultModal.querySelector('.sr-body > .sr-grid');
    const cells = [...grid.querySelectorAll(':scope > .sr-cell')];
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, cy: (r.top + r.bottom) / 2 }; };
    const zOf = c => +getComputedStyle(c).zIndex || 0;
    // '아직 비행 중인가' — srpop **진행률 56% 미만**. 56% 는 keyframes 상 '슬롯으로 감속' 마디다.
    // ⚠️ 경계를 두 번 잘못 잡았다(다음 세션이 되풀이하지 말 것):
    //    ㉠ 'srpop 이 running 인가'로 재면 76~100% 의 **착지 오버슛 구간**(translate 0, scale > 1)이
    //       비행으로 세어져 '앞으로 오는 쪽이 더 작다'가 구조적으로 위반된다.
    //    ㉡ 0.76 으로 좁혀도 56~76% 는 이미 경로의 34% 지점에서 슬롯으로 내려앉으며 스케일이
    //       .72 → 1.1x 로 커지는 구간이라 같은 위반이 산발적으로 났다(x75 에서 실행마다 0~1건).
    //    원근 단서가 성립해야 하는 건 **실제로 이동 중인 구간**뿐이다 — 도착 후 커지는 것은
    //    오히려 올바른 착지 팝이다. 그래서 감속 마디(56%)를 경계로 쓴다.
    const flyingOf = c => c.getAnimations().some(a =>
        a.animationName === 'srpop' && a.playState === 'running' &&
        (a.effect.getComputedTiming().progress || 0) < 0.56);
    // 🚨 가시성은 **셀 자체**로 판정해야 한다. .sr-cell 기본값이 opacity:0 이고 보이게 만드는
    //    것은 오직 .on + srpop 의 forwards 필인데, opacity 는 상속되는 값이 아니라 합성되는
    //    값이라 자식(.sr-orbwrap)의 computed opacity 는 부모가 0이어도 1이다. 자식만 보고 재면
    //    ⚠️ 이 문자열은 템플릿 리터럴이다 — 주석에도 백틱을 쓰지 말 것(리터럴이 거기서 끊긴다).
    //    **아직 등장하지도 않은 셀**(scale .35 로 웅크린 상태)을 비교 대상에 넣게 된다 —
    //    처음에 그렇게 재서 '착지한 이웃 폭 23px' 같은 유령 값이 원근 위반으로 잡혔다.
    const shown = c => c.classList.contains('on') && +getComputedStyle(c).opacity > 0.06;
    const visible = el => el && getComputedStyle(el).visibility !== 'hidden' && +getComputedStyle(el).opacity > 0.06;
    // 어떤 셀이든 '등장 중'이면 표본을 남긴다(전부 착지한 뒤는 안정 상태 = 기준선).
    const rows = { name: [], orb: [] };
    for (const kind of ['name', 'orb']) {
        const sel = kind === 'name' ? '.sr-name' : '.sr-orbwrap';
        const bs = cells.map(c => { const e = c.querySelector(sel); return (shown(c) && visible(e)) ? box(e) : null; });
        for (let i = 0; i < bs.length - 1; i++) {
            const a = bs[i], b = bs[i + 1];
            if (!a || !b) continue;
            if (Math.abs(a.cy - b.cy) > 8) continue;   // 다른 행
            // 겹칠 때는 '누가 앞인가'와 '앞엣것이 더 작은가(=아직 멀다)'를 함께 남긴다.
            rows[kind].push({ i, gap: b.l - a.r, za: zOf(cells[i]), zb: zOf(cells[i + 1]), wa: a.w, wb: b.w,
                              fa: flyingOf(cells[i]), fb: flyingOf(cells[i + 1]) });
        }
    }
    const on = cells.filter(c => c.classList.contains('on')).length;
    const settled = cells.every(c => c.getAnimations().every(a => a.playState === 'finished' || a.effect.getTiming().iterations === Infinity));
    return { t: Math.round(performance.now() - window.__t0), on, settled,
             name: rows.name, orb: rows.orb };
})()`;

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const out = [];
    const ok = (c, m) => { out.push((c ? 'PASS ' : 'FAIL ') + m); return c; };
    const errors = [];

    for (const [tag, src, seed] of CASES) {
        const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
        p.on('pageerror', e => errors.push(`${tag}: ${e}`));
        p.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`${tag}: ${m.text()}`); });
        await p.goto(INDEX, { waitUntil: 'load' });
        await p.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.summonResultModal, null, { timeout: 20000 });
        await p.evaluate(SEED);
        await p.evaluate(FREEZE_3D);

        // ⚠️ RNG 는 **소환을 부르기 직전 같은 evaluate 안에서** 심는다 — 먼저 심으면 챗·파티클이
        //    난수를 몇 개 뽑아 가 판이 달라진다(앞 세션이 기록한 재현성 함정).
        await p.evaluate(`(() => { ${RNG(seed)}; ${src} window.__t0 = performance.now(); })()`);

        // 캐스케이드가 끝날 때까지 매 프레임 표본
        const samples = await p.evaluate(`new Promise(res => {
            const s = [];
            const step = () => {
                s.push(${SAMPLER});
                const last = s[s.length - 1];
                if (last.t < 4200 && !(last.settled && last.t > 2600)) requestAnimationFrame(step);
                else res(s);
            };
            requestAnimationFrame(step);
        })`);

        const during = samples.filter(s => !s.settled);
        const stable = samples.filter(s => s.settled).slice(-6);
        const minGap = (arr, kind) => arr.reduce((m, s) => Math.min(m, ...s[kind].map(x => x.gap).concat([Infinity])), Infinity);
        const nameMin = minGap(during, 'name'), orbMin = minGap(during, 'orb');
        const nameStable = minGap(stable, 'name');

        // ① 이름칩은 **어느 순간에도** 이웃과 붙으면 안 된다(융합 = 한 덩어리로 읽힘).
        //    안정 상태 간격이 16~17px이므로 등장 중에도 최소 4px는 남기게 잡는다.
        ok(nameMin >= 4, `[${tag}] 등장 중 이름칩 최소 간격 ${nameMin === Infinity ? 'n/a' : nameMin.toFixed(1)}px (기준 ≥4, 안정 ${nameStable === Infinity ? 'n/a' : nameStable.toFixed(1)}px)`);
        // ② 구체 겹침은 **0으로 못 만든다** — 사출은 전 셀을 같은 광원 한 점에서 꺼내는 연출이라
        //    비행 중 이웃 자리를 지나는 것이 설계다(경로 계수를 낮춰 겹침을 없애면 A ⑴ [치명]
        //    "사출이 화면에 없다"로 되돌아간다). 그래서 자를 '겹침 0'이 아니라 **'그 겹침이
        //    지나감으로 읽히는가'** 로 벼린다. 겹친 순간마다 두 가지가 성립해야 한다:
        //      G2 z 순서 — 나중에 뜬 셀이 위. 같은 z면 교차가 융합으로 읽힌다.
        //      G3 원근   — 앞으로 오는(겹치는) 셀이 착지한 이웃보다 작다. 크면 '멀리서 온다'가 뒤집힌다.
        //    ⚠️ 겹침 깊이(orbMin)는 **진단값으로만** 찍는다 — 값으로 게이트를 세우면 경로 계수를
        //       깎아 통과시키고 싶어지고, 그건 이 연출을 죽이는 방향이다.
        const overlapping = during.flatMap(s => s.orb).filter(x => x.gap < 0);
        const zBad = overlapping.filter(x => x.zb <= x.za);
        // 원근은 **한쪽만 비행 중인 쌍**에만 적용한다 — 둘 다 날고 있으면 크기가 같은 게 정상이다.
        // 그리고 **지각 가능한 겹침**(2px 이상)만 본다 — 착지 직전 0.4px 스침은 어느 쪽이 크든
        // 화면에서 아무것도 말해 주지 않는다(이 한 건 때문에 자가 계속 빨간불이었다).
        const mixed = overlapping.filter(x => x.fa !== x.fb && x.gap <= -2);
        const perspBad = mixed.filter(x => (x.fa ? x.wa : x.wb) >= (x.fa ? x.wb : x.wa) * 0.98);
        ok(zBad.length === 0,
            `[${tag}] 겹친 순간 ${overlapping.length}건 중 z 역전 ${zBad.length}건 — 겹침 최대 깊이 ${orbMin === Infinity ? 'n/a' : Math.max(0, -orbMin).toFixed(1)}px`);
        ok(perspBad.length === 0,
            `[${tag}] 착지 셀을 지나는 비행 셀 ${mixed.length}건 전부 더 작다(원근 위반 ${perspBad.length}건)`);
        if (perspBad.length) console.log('    DBG', JSON.stringify(perspBad.slice(0, 4)));
        await p.close();
    }

    out.forEach(l => console.log('  ' + l));
    if (errors.length) console.log('  콘솔 에러:', errors.slice(0, 5));
    else console.log('  콘솔 에러 0건');
    const fail = out.filter(l => l.startsWith('FAIL')).length + errors.length;
    console.log(fail ? `\n실패 ${fail}건` : '\n전체 통과');
    await b.close();
    process.exit(fail ? 1 : 0);
})();
