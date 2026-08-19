// 소환 결과 — '아이콘이 광원에서 사출되는가' 실측
// 6차 비평가 A의 1순위 지적이 "셀이 최종 슬롯에 그대로 태어나 이동 경로가 없다"였고,
// 근거로 든 수치가 **1번 셀 중심이 t0540→t0840 사이에 11px밖에 안 움직였다**는 것이었다.
// 같은 방식(셀 등장 구간에서 구체 중심을 추적)으로 이동량을 재고, 그 경로가 실제로
// 광원(.sr-wrap 중심 = .sr-charge 방사 원점) 쪽에서 시작하는지까지 확인한다.
//
// 사용: PW_PATH=<playwright 경로> node probe-sr-eject.js
//
// 판정: 셀마다 ① 총 이동거리가 슬롯-광원 거리의 30% 이상 ② 시작점이 슬롯보다 광원에 가까움
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; S.summonCount = 5000;
    saveGame();
`;
const FREEZE_3D = `Scene3D.update = function () {};`;

// 셀 등장 애니메이션만 시크하면 되므로 SEEK를 셀 계열로 좁힌다 — 축적/주역 비트는 무관.
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

// 구체 중심(px) — 셀이 아니라 .sr-orbwrap을 잰다. 셀 박스는 이름판까지 포함해 중심이 흐려진다.
const CENTERS = `(() => {
    const m = UI.els.summonResultModal;
    const wrap = m.querySelector('.sr-wrap').getBoundingClientRect();
    const ox = wrap.left + wrap.width / 2, oy = wrap.top + wrap.height / 2;
    return [...UI._srCells].map(c => {
        const r = (c.querySelector('.sr-orbwrap') || c).getBoundingClientRect();
        return { x: r.left + r.width / 2 - ox, y: r.top + r.height / 2 - oy, w: r.width };
    });
})()`;

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

    await page.evaluate(`S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`);
    await page.evaluate(`UI.clearSummonTimers()`);
    const info = await page.evaluate(`({ delays: UI._srDelays, hero: UI._srHeroIdx,
        tiers: [...UI._srCells].map(c => c.dataset.tier), eject: UI.SR_EJECT })`);

    // ⚠️ 시크는 **시간순으로만** 감을 것. 정착 상태(T=9999)를 먼저 재고 등장 시각으로 되감으면,
    //    되감는 순간 .hero가 꺼지며 srrecede→srpop 재생성이 일어나는데 그 프레임의 애니메이션은
    //    아직 이번 시크의 currentTime을 못 받아 **정착 위치에 그대로 멈춘 것처럼 찍힌다**
    //    (실제로 왼쪽 두 셀만 '이동량 0.0px'로 나와 구현이 아니라 계측이 틀렸다).
    //    그래서 셀 추적을 먼저 시간순으로 돌고, 슬롯 위치는 맨 끝에서 잰다.
    const tracks = [];
    const last = info.delays[info.delays.length - 1];
    for (let i = 0; i < info.delays.length; i++) {
        const track = [];
        // 셀 등장 순간부터 20ms 간격으로 추적 — --pop 최대 .52s를 덮는다.
        // ⚠️ 비주역 셀의 추적 창이 주역 시각(last)을 넘으면 안 된다 — .hero가 켜졌다가
        //    다음 셀 추적에서 되감기며 위 주석의 '정착 위치 0px' 함정이 그대로 재발한다
        //    (summon-anim-halve 로 타임라인이 절반이 되자 실제로 셀 2·3이 0px로 찍혔다).
        const cap = i === info.delays.length - 1 ? 540 : Math.min(540, last - info.delays[i] - 20);
        for (let dt = 0; dt <= cap; dt += 20) {
            // 🚨 시크는 두 번 부른다 — 클래스가 바뀌며 **새로 만들어진** 애니메이션은 그 호출의
            //    getAnimations() 목록에 아직 없어서 currentTime을 못 받고, 직전 상태(정착 위치)에
            //    멈춘 채로 찍힌다. 두 번째 호출이 그 애니메이션들에 시각을 심는다.
            const c = await page.evaluate(`(${SEEK})(${info.delays[i] + dt}), (${SEEK})(${info.delays[i] + dt}), ${CENTERS}`);
            track.push(c[i]);
        }
        tracks.push(track);
    }
    const settled = await page.evaluate(`(${SEEK})(9999), (${SEEK})(9999), ${CENTERS}`);

    console.log(`사출 계수 SR_EJECT=${info.eject} / 주역 인덱스 ${info.hero}`);
    console.log('\n 셀  등급  슬롯-광원거리   경로시작거리   총이동   슬롯대비   판정');
    let fail = 0;
    for (let i = 0; i < info.delays.length; i++) {
        const slot = settled[i];
        const slotDist = Math.hypot(slot.x, slot.y);
        const track = tracks[i];
        let travel = 0;
        for (let k = 1; k < track.length; k++) travel += Math.hypot(track[k].x - track[k - 1].x, track[k].y - track[k - 1].y);
        const startDist = Math.hypot(track[0].x, track[0].y);
        // 슬롯이 곧 광원 자리인 셀(단독 히어로 행의 주역)은 '날아올 거리' 자체가 없다 —
        // 광원에서 태어나는 게 정상이라 사출 판정 대상이 아니다(N/A). 20px = 구체 반지름 훨씬 아래.
        const atSource = slotDist < 20;
        // ① 이동량이 슬롯-광원 거리의 30% 이상 ② 시작점이 슬롯보다 광원에 가까움(여유 4px)
        const ok = atSource || (travel >= slotDist * 0.30 && startDist < slotDist - 4);
        if (!ok) fail++;
        console.log(`  ${i}   T${info.tiers[i]}   ${slotDist.toFixed(1).padStart(8)}px `
            + `${startDist.toFixed(1).padStart(11)}px ${travel.toFixed(1).padStart(8)}px `
            + `${(travel / slotDist * 100).toFixed(0).padStart(7)}%   `
            + (atSource ? 'N/A (광원 자리 — 주역)' : ok ? 'PASS' : 'FAIL'));
    }
    console.log(`\n판정: ${info.delays.length - fail}/${info.delays.length} PASS/N-A`
        + (fail ? '  ← 사출 경로가 없거나 슬롯에서 시작하는 셀이 있다' : ''));
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE/PAGE ERRORS');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
