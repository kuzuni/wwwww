// 소환 결과 — 아이콘 사출이 **캡처 프레임에 실제로 잡히는가** 실측.
// 사용: node probe-sr-eject-visible.js
//
// ── 왜 프로브가 하나 더 필요한가 (9차 채점 ④ 교차검증) ──
// 9차 비평가 A ⑴ [치명]: "아이콘 사출이 화면에 없다 — 셀 이동량이 31~45px인데 광원까지
// 거리는 170px(비행 82% 소실), 스트레치·잔상 꼬리가 확대 크롭에서 안 보인다."
// 그런데 `probe-sr-eject.js`는 같은 화면에서 이동량 131~158px(슬롯-광원 거리의 77~84%)로
// **5/5 PASS**를 낸다. 앞 세션 메모는 "어느 한쪽이 틀렸다"고 적었다.
//
// 🚨 **결론: 둘 다 자기 질문에는 맞다 — 재는 게 서로 다르다.**
//   `probe-sr-eject.js`는 **셀 등장 시각에 맞춰** 20ms 간격으로 감는다 → "경로가 존재하는가".
//   A는 **60ms 절대 격자**(t0600, t0660, …)로 찍은 캡처를 봤다 → "비행이 프레임에 남는가".
//   셀 i의 등장 시각은 480+i*250ms인데 절대 격자는 그 시각과 안 맞으므로, 첫 표본이 이미
//   비행 중반(또는 착지 후)에 떨어진다. 비행 구간(--pop의 0→58%)이 tier0에서 128ms뿐이라
//   60ms 격자에는 **2프레임 이하**만 걸리고, 그중 첫 프레임이 늦게 떨어지면 남은 이동량이
//   절반 이하로 줄어든다. A가 본 31~45px이 바로 그 값이다.
//   ⇒ 그러므로 A의 지적은 '경로가 없다'로는 틀렸지만 **'비행이 안 보인다'로는 맞다.**
//      고칠 대상은 경로 **길이**(이미 77~84%로 충분)가 아니라 비행이 점유하는 **시간**이었다.
//
// 판정: 비(非)주역 셀마다 ⒜ 읽히는 비행 시간 ≥ 180ms ⒝ 60ms 격자 포착 경로 ≥ 45%.
//       (아래 '판정 기준을 무엇으로 둘지' 주석 — 프레임 **수**는 위상에 ±1로 흔들려 자로 못 쓴다.)
//
// ⚠️ 시크는 오름차순으로만, 그리고 **두 번** 부른다(클래스가 바뀌며 재생성된 애니메이션은
//    첫 호출의 getAnimations() 목록에 없어 직전 상태에 멈춘 채 찍힌다 — 앞 세션이 두 번 밟았다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; S.summonCount = 5000; saveGame();
`;

// A가 본 두 화면 — 저등급 x5와 신화 포함 x5(홀드백/주역 판)
const CASES = [
    ['skill-x5-low', `(() => {
        const lows = SKILL_DEFS.filter(d => d.rarity === 'common' || d.rarity === 'rare');
        UI.openSummonResult('skill', [0,1,2,0,1].map((k,i) => ({ def: lows[k % lows.length], isNew: false })));
    })()`],
    ['skill-x5-hi', `(() => {
        const lows = SKILL_DEFS.filter(d => d.rarity === 'common');
        const hi = SKILL_DEFS.filter(d => d.rarity === 'mythic');
        UI.openSummonResult('skill', [lows[0],lows[1%lows.length],lows[2%lows.length],lows[0],hi[0]]
            .map(d => ({ def: d, isNew: false })));
    })()`],
];

const FRAME_MS = 60;      // A의 캡처 간격
const FINE_MS = 20;       // 물리량(읽히는 비행 시간)을 재는 고운 격자
const FLIGHT_FRAC = 0.15; // '비행 중' 판정 — 슬롯에서 경로의 이 비율 이상 떨어져 있으면
// ── 판정 기준을 무엇으로 둘지 (⚠️ 여기서 한 번 잘못 골랐다. 다음 세션은 되돌리지 말 것) ──
// 처음엔 '60ms 격자에서 비행 프레임 3장 이상'으로 뒀는데, **그 수는 위상에 따라 ±1로 흔들린다**:
// 셀 등장 시각(480+i*250ms)이 60ms 격자와 안 맞으므로 셀마다 첫 표본이 비행의 다른 지점에
// 떨어진다. 실제로 셀 1만 2장이 나왔는데 표본이 50·110·170ms에 떨어져 마지막 표본이 90%
// 착지한 뒤였던 것뿐이고, 연출에는 아무 문제가 없었다 — **자가 위상에 흔들리면 그 자를 쓰면 안 된다.**
// ⇒ 게이트는 위상과 무관한 두 물리량으로 잡는다(60ms 프레임 수는 'A가 캡처했을 그림'을
//    재현하는 진단값으로만 찍는다):
//    ⒜ 읽히는 비행 시간 — 보이면서 슬롯에서 경로의 15% 이상 떨어져 있는 구간의 길이(20ms 격자).
//       60ms 캡처로 최소 3장이 걸리려면 180ms를 넘어야 한다.
//    ⒝ 60ms 격자 포착 경로 비율 — A의 표현("비행 82% 소실")을 그대로 뒤집은 값.
const MIN_FLIGHT_MS = 180;    // ⒜ 읽히는 비행 시간
const MIN_CAPTURED = 0.45;    // ⒝ 60ms 격자에 남는 경로 비율(= 소실 55% 이하)

const SEEK = `(T => {
    const m = UI.els.summonResultModal;
    const cells = [...UI._srCells], d = UI._srDelays, last = d[d.length - 1];
    cells.forEach((c, i) => c.classList.toggle('on', d[i] <= T));
    m.classList.toggle('hero', UI._srHeroIdx >= 0 && last <= T);
    for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        if (!el || !el.closest) continue;
        const cell = el.closest('.sr-cell');
        if (!cell) continue;
        const i = cells.indexOf(cell);
        if (i < 0) continue;
        const heroBeat = ['srrecede', 'srheropop', 'srbeam', 'srheroring'].indexOf(a.animationName) >= 0;
        a.pause();
        try { a.currentTime = Math.max(0, T - (heroBeat ? last : d[i])); } catch (e) { /* 무시 */ }
    }
})`;

// 구체 중심 + 가시성. 셀 박스는 이름판까지 물어 중심이 흐려지므로 .sr-orbwrap 을 잰다.
const SAMPLE = `(() => {
    const m = UI.els.summonResultModal;
    const wrap = m.querySelector('.sr-wrap').getBoundingClientRect();
    const ox = wrap.left + wrap.width / 2, oy = wrap.top + wrap.height / 2;
    return [...UI._srCells].map(c => {
        const o = c.querySelector('.sr-orbwrap') || c;
        const r = o.getBoundingClientRect();
        const gh = c.querySelector('.sr-ghost');
        return {
            x: r.left + r.width / 2 - ox, y: r.top + r.height / 2 - oy,
            vis: +getComputedStyle(c).opacity,
            ghost: gh ? +getComputedStyle(gh).opacity : 0,
        };
    });
})()`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && UI.els');
    await page.evaluate(SEED);
    await page.evaluate(`Scene3D.update = function () {};`);
    await page.waitForTimeout(250);

    const fails = [];
    for (const [name, src] of CASES) {
        await page.evaluate(src);
        await page.evaluate(`UI.clearSummonTimers()`);
        const info = await page.evaluate(`({ delays: UI._srDelays, hero: UI._srHeroIdx,
            tiers: [...UI._srCells].map(c => c.dataset.tier),
            pops: [...UI._srCells].map(c => getComputedStyle(c).getPropertyValue('--pop').trim()) })`);
        const last = info.delays[info.delays.length - 1];

        // 절대 60ms 격자(A가 본 것) + 고운 20ms 격자(물리량). 둘 다 오름차순으로만 감는다.
        const t0 = Math.floor((info.delays[0] - FRAME_MS) / FRAME_MS) * FRAME_MS;
        const t1 = last + 700;
        const grab = async (step) => {
            const out = [];
            for (let T = t0; T <= t1; T += step) {
                const sm = await page.evaluate(`(${SEEK})(${T}), (${SEEK})(${T}), ${SAMPLE}`);
                out.push({ T, s: sm });
            }
            return out;
        };
        const fine = await grab(FINE_MS);
        const frames = fine.filter(f => (f.T - t0) % FRAME_MS === 0);   // 60ms 격자는 고운 격자의 부분집합
        const settled = await page.evaluate(`(${SEEK})(${t1 + 3000}), (${SEEK})(${t1 + 3000}), ${SAMPLE}`);

        console.log(`\n― ${name} (20ms 격자 ${fine.length}장 / 그중 60ms 격자 ${frames.length}장, 셀 ${info.delays.length}개, 주역 ${info.hero}) ―`);
        console.log(' 셀 등급 --pop   경로   읽히는비행  60ms포착  (진단)프레임  최대1프레임  잔상피크');
        for (let i = 0; i < info.delays.length; i++) {
            const slot = settled[i];
            const pathLen = Math.hypot(slot.x, slot.y);   // 슬롯-광원 거리 = 사출 경로의 기준
            const off = (c) => Math.hypot(c.x - slot.x, c.y - slot.y);
            const inFlight = (c) => c.vis > 0.05 && pathLen > 20 && off(c) > pathLen * FLIGHT_FRAC;
            // ⒜ 읽히는 비행 시간 — 20ms 격자에서 비행 중인 표본 수 × 간격
            const flightMs = fine.filter(f => inFlight(f.s[i])).length * FINE_MS;
            // ⒝ 60ms 격자 포착 경로 비율 + 진단용 프레임 수
            let sum = 0, maxStep = 0, ghostPeak = 0, prev = null, gframes = 0;
            for (const f of frames) {
                const c = f.s[i];
                if (c.vis > 0.05) {
                    if (inFlight(c)) gframes++;
                    if (prev) { const st = Math.hypot(c.x - prev.x, c.y - prev.y); sum += st; maxStep = Math.max(maxStep, st); }
                    prev = c;
                    ghostPeak = Math.max(ghostPeak, c.ghost);
                }
            }
            const captured = pathLen > 20 ? sum / pathLen : 0;
            const atSource = pathLen < 20;   // 주역(단독 행)은 슬롯이 곧 광원 자리 — 사출 판정 대상 아님
            const okMs = atSource || flightMs >= MIN_FLIGHT_MS;
            const okCap = atSource || captured >= MIN_CAPTURED;
            if (!okMs) fails.push(`${name} 셀${i}(T${info.tiers[i]}, --pop ${info.pops[i]}): 읽히는 비행 ${flightMs}ms < 기준 ${MIN_FLIGHT_MS}ms — 60ms 캡처로는 비행이 3장 미만이라 '제자리에서 태어난 것'으로 읽힌다`);
            if (!okCap) fails.push(`${name} 셀${i}(T${info.tiers[i]}): 60ms 격자 포착 경로 ${(captured * 100).toFixed(0)}% < 기준 ${MIN_CAPTURED * 100}% — 경로 ${pathLen.toFixed(1)}px 중 ${sum.toFixed(1)}px만 프레임에 남는다(A의 '비행 82% 소실'이 이 값)`);
            console.log(`  ${i}  T${info.tiers[i]}  ${info.pops[i].padStart(5)} ${pathLen.toFixed(1).padStart(7)}px `
                + `${String(flightMs).padStart(9)}ms ${(captured * 100).toFixed(0).padStart(8)}% ${String(gframes).padStart(11)}장 `
                + `${maxStep.toFixed(1).padStart(11)}px ${ghostPeak.toFixed(2).padStart(9)}   `
                + (atSource ? 'N/A(광원 자리)' : (okMs && okCap) ? 'PASS' : 'FAIL'));
        }
        await page.evaluate(() => UI.closeSummonResult());
        await page.waitForTimeout(140);
    }
    await browser.close();

    console.log('');
    if (errors.length) { console.log(`콘솔/페이지 에러 ${errors.length}건:`); errors.slice(0, 6).forEach(e => console.log('   ' + e)); }
    if (fails.length) {
        console.log(`FAIL ${fails.length}건`);
        fails.forEach(f => console.log('  ✗ ' + f));
        process.exit(1);
    }
    if (errors.length) process.exit(1);
    console.log(`PASS — 전 비주역 셀의 읽히는 비행 ≥ ${MIN_FLIGHT_MS}ms · 60ms 격자 포착 경로 ≥ ${MIN_CAPTURED * 100}%`);
})();
