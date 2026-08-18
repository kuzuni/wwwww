// 소환 결과 연출 팝업 캡처 — 등장 연출 타이밍(연속 프레임) + x1/x5/x75 그리드 확인
// 사용: PW_PATH=<playwright 경로> node shot-summon-result.js [출력디렉터리]
//
// ⚠️ 캡처 속도: 3D 렌더 루프(Scene3D.update)가 도는 동안에는 swiftshader에서 스크린샷 한 장이
// 15~30초가 걸려 기본 30s 타임아웃에 걸린다. 팝업은 불투명 풀스크린 오버레이라 3D 화면이
// 보이지 않으므로, 캡처 전에 Scene3D.update를 비워 루프를 멈춘다 — 한 장 18s → 0.15s.
// 그 덕에 아래 '타임라인' 섹션에서 연출을 ms 단위로 세워 놓고 연속 프레임을 뽑을 수 있다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.join(__dirname, 'summon-result');
fs.mkdirSync(OUT, { recursive: true });

// 소환이 실제로 굴러가도록 재화를 채운다 (밸런스 수치는 건드리지 않고 세이브 값만 주입)
const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9;
    saveGame();
`;
const FREEZE_3D = `Scene3D.update = function () {};`;

// 뽑기 결과를 재현 가능하게 고정한다 — 예전에는 `S.summonCount = 5000`으로 확률만 올려 놓고
// 실제 등급은 Math.random에 맡겼다. 그래서 같은 케이스가 실행할 때마다 다른 등급을 뽑아
// **주역(전설↑) 단독 행·신화 착지 비트가 뜨는 회차와 안 뜨는 회차가 갈렸다** — 회차 간
// 채점을 비교할 수 없고, '주역 행이 사라졌다'는 회귀 오판까지 났다(실제로 9차에서 났다).
// mulberry32를 Math.random에 심어 케이스마다 고정 시드를 준다. 아래 시드는 탐색으로 고른 값:
//   14 → x5가 [희귀한·서사시·전설·궁극의·신화] 등급 사다리 (금속/유리/보석 3재질 전부)
//    9 → 탈것 x1 단독 신화        3 → x75 18종 전 등급 분포
const RNG = seed => `(() => { let a = ${seed} >>> 0; Math.random = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; })()`;

// 연출을 절대 시각 T(ms)로 세운다 — 셀 등장은 클래스로, CSS 애니메이션은 currentTime으로.
// 셀 애니메이션은 그 셀이 뜬 시각(_srDelays[i])이 원점이므로 그만큼 빼 준다.
const SEEK = `(T => {
    const m = UI.els.summonResultModal;
    const cells = [...UI._srCells], d = UI._srDelays, last = d[d.length - 1];
    cells.forEach((c, i) => c.classList.toggle('on', d[i] <= T));
    m.classList.toggle('flash', !!UI._srHoldback && last <= T);
    // 주역 비트(.hero)와 홀드백 축적 구간(.charging)도 시각으로 재현한다 —
    // 실시간으로는 fireSummonHero가 걸지만, 시크할 때는 T로 직접 판정해야 프레임이 맞는다
    m.classList.toggle('hero', UI._srHeroIdx >= 0 && last <= T);
    m.classList.toggle('charging', !!UI._srHoldback && d[d.length - 2] !== undefined
        && d[d.length - 2] <= T && T < last);
    m.classList.toggle('done', T >= last + UI.SR_TAIL_MS);
    // 바닥 반사는 finishSummonResult가 만든다 — 시크 경로는 타이머를 죽여 놓으므로 직접 부른다
    if (m.classList.contains('done')) UI.buildSummonReflection();
    else { const r = m.querySelector('.sr-reflect'); if (r) r.remove(); }
    for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        if (!el || !el.getRootNode) continue;
        let base = 0;
        const cell = el.closest ? el.closest('.sr-cell') : null;
        // 주역 비트 계열은 셀 등장 시각이 아니라 '마지막 셀 착지 시각'이 원점이다
        const HERO_ANIM = ['srrecede', 'srheropop', 'srbeam', 'srheroring', 'srshakehit', 'srgridlift'];
        // 🚨 축적 구간(.charging) 애니메이션의 원점은 0이 아니라 '마지막 셀 하나만 남은 시각'
        //    = d[n-2]다. 예전엔 이걸 0으로 두는 바람에 currentTime이 1680ms처럼 지속시간(550ms)을
        //    한참 넘겨 **전부 마지막 프레임에 고정**됐고, 그래서 캡처상 대기 구간이 통째로
        //    정지 프레임으로 찍혔다. 회차마다 '홀드백이 죽어 있다'가 1순위 지적으로 올라온
        //    원인의 상당 부분이 이 계측 버그다 — 연출을 고치기 전에 원점부터 맞출 것.
        const CHARGE_ANIM = ['srfloorcharge', 'srtickup', 'srhalocharge', 'srvig'];
        if (a.animationName && HERO_ANIM.indexOf(a.animationName) >= 0) base = last;
        else if (a.animationName && CHARGE_ANIM.indexOf(a.animationName) >= 0) base = d[d.length - 2] || 0;
        else if (cell) base = d[cells.indexOf(cell)] || 0;
        else if (el.classList && el.classList.contains('sr-flash')) base = last;
        a.pause();
        try { a.currentTime = Math.max(0, T - base); } catch (e) { /* 무한 반복 외 예외 무시 */ }
    }
})`;

// [이름, 소환 실행 소스, 연속 캡처할 시각(ms), RNG 시드]
const CASES = [
    ['skill-x5', `S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`,
        [120, 380, 620, 900, 1400, 3400], 7],
    ['pet-x5', `S.summonMult = {pet:5}; UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.onSummonPetEgg();`, [900, 3400], 7],
    ['mount-x5', `S.summonMult = {mount:5}; UI.openMounts(); UI.onSummonMount();`, [900, 3400], 7],
    ['skill-x1', `S.summonMult = {skill:1}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, [900, 3400], 7],
    ['skill-x75', `S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, [900, 3400], 7],
    // 고등급 광채/광선 확인 — 소환 레벨을 만렙으로 올리고 시드를 고정해 매 회차 같은 등급이 나오게 한다
    ['skill-x5-hi', `S.summonCount = 5000; S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, [1400, 3400], 14],
    ['mount-x1-hi', `S.mountOpens = 5000; S.summonMult = {mount:1}; UI.openMounts(); UI.onSummonMount();`, [1400, 3400], 9],
];

// 연속 프레임으로 훑을 케이스 — [이름, 소환 소스, 프레임 간격, 마지막 시각, RNG 시드]
const TIMELINES = [
    ['tl-x5-hi', `S.summonCount = 5000; S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 60, 2760, 14],
    ['tl-x75', `S.summonCount = 5000; S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 90, 3060, 3],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const newPage = async (tag, seed) => {
        const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
        page.on('pageerror', e => errors.push(`${tag} PAGEERROR ${e}`));
        page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} CONSOLE ${m.text()}`); });
        await page.goto(INDEX);
        await page.waitForFunction('typeof UI !== "undefined" && UI.els');
        await page.evaluate(SEED);
        await page.evaluate(FREEZE_3D);
        await page.waitForTimeout(200);
        return page;
    };

    for (const [name, open, times, seed] of CASES) {
        const page = await newPage(name, seed);
        const t0 = Date.now();
        // ⚠️ 시드 주입과 소환 실행은 **한 evaluate 안**에 있어야 한다 — 따로 부르면 그 사이
        // 게임 루프(챗봇·전투 틱)가 난수를 먹어 같은 시드가 회차마다 다른 등급을 낸다.
        await page.evaluate((seed ? RNG(seed) + ';' : '') + open);
        // 🚨 **정지 프레임의 파일명 시각은 근사값이다 — 채점에서 프레임 간 타이밍 비교에 쓰지 말 것.**
        // swiftshader 에서 스크린샷 한 장이 150~220ms 걸리는데 프레임 간격이 그보다 좁으면
        // (예: 120 → 380 = 260ms) 다음 캡처가 밀려 **실제 시각이 파일명보다 늦는다.**
        // 10차 비평가 A ⓼ 가 "카테고리마다 연출 속도가 다르다(같은 t=900 에 skill 3개 vs mount 1개)"
        // 라고 지적했는데, 세 kind 의 `_srDelays` 는 [480,730,980,1230,1480] 로 **완전히 동일**하고
        // evaluate 반환 시각 차이도 32ms 뿐이었다 — 즉 연출이 아니라 **이 밀림이 원인**이다
        // (스틸이 6장인 skill 만 뒤쪽 프레임이 크게 밀린다). 그래서 실제 경과를 같이 찍는다.
        // 타이밍을 정확히 봐야 하면 아래 TIMELINES 의 시크 캡처를 쓸 것 — 그쪽은 결정론적이다.
        const actual = [];
        for (const t of times) {
            const wait = t - (Date.now() - t0);
            if (wait > 0) await page.waitForTimeout(wait);
            actual.push(`${t}→${Date.now() - t0}`);
        }
        console.log(`${name} 실시간 경과였다면(ms): ${actual.join(' · ')}`);
        // 상태 점검: 연출 종료 여부 + 셀 수 + 확인 버튼 노출 + 행 분포(고아 행 확인)
        const st = await page.evaluate(`(() => {
            const m = UI.els.summonResultModal;
            const ok = m.querySelector('.sr-ok');
            const cells = [...m.querySelectorAll('.sr-body > .sr-grid > .sr-cell')]; // 반사 복제본 제외
            const rows = {};
            for (const c of cells) { const y = Math.round(c.getBoundingClientRect().top); rows[y] = (rows[y] || 0) + 1; }
            return {
                open: !m.classList.contains('hidden'),
                done: m.classList.contains('done'),
                cells: cells.length,
                revealed: m.querySelectorAll('.sr-body > .sr-grid > .sr-cell.on').length,
                cols: m.querySelector('.sr-body > .sr-grid').style.getPropertyValue('--cols'),
                rows: Object.values(rows),
                mats: [...new Set(cells.map(c => c.dataset.mat))],
                tiers: cells.map(c => +c.dataset.tier), // 시드 고정 여부를 회차마다 눈으로 확인
                okVisible: !!(ok && ok.offsetParent !== null),
                okRect: ok ? ok.getBoundingClientRect().toJSON() : null,
                appRect: document.getElementById('app').getBoundingClientRect().toJSON(),
            };
        })()`);
        console.log(name, JSON.stringify(st));
        // 탭으로 닫히는지 확인
        await page.evaluate(`UI.onSummonResultTap()`);
        const closed = await page.evaluate(`UI.els.summonResultModal.classList.contains('hidden')`);
        console.log(`${name} closed-by-tap: ${closed}`);
        await page.close();

        // 🚨 **스틸은 두 번째 패스에서 시크로 찍는다 — 실시간 캡처의 파일명 시각은 거짓이다.**
        // swiftshader 에서 스크린샷 한 장이 150~220ms 인데 프레임 간격이 그보다 좁으면
        // (120 → 380 = 260ms) 다음 캡처가 밀리고, **밀린 양이 그 케이스의 스틸 장수에 비례**한다.
        // 실측: 스틸 6장인 `skill-x5` 는 `-900.png` 가 실제로 **1512ms**(612ms 늦음), 스틸 2장인
        // `mount-x5` 는 **1134ms**(234ms). 10차 비평가 A ⓼ 가 "카테고리마다 연출 속도가 다르다
        // (같은 t=900 에 skill 3개 vs mount 1개 안착)"고 지적한 것의 정체가 이것이다 — 세 kind 의
        // `_srDelays` 는 [480,730,980,1230,1480] 로 **완전히 동일**하고 evaluate 반환 차이도 32ms 뿐이다.
        // 즉 **연출은 같은데 파일명만 거짓말**을 하고 있었고, 회차마다 스틸로 타이밍을 비교한
        // 채점이 전부 이 왜곡을 먹었다. 위 라인의 '실시간 경과였다면' 로그가 그 왜곡량이다.
        const sp = await newPage(name + ':seek', seed);
        await sp.evaluate((seed ? RNG(seed) + ';' : '') + open);
        await sp.evaluate(`UI.clearSummonTimers()`);
        for (const t of times) {
            await sp.evaluate(`(${SEEK})(${t})`);
            await sp.evaluate(`(${SEEK})(${t})`); // 클래스가 바뀌는 시각은 두 번 — 새 애니메이션은 첫 호출의 목록에 없다
            await sp.screenshot({ path: path.join(OUT, `${name}-${t}.png`) });
        }
        await sp.close();
    }

    // 연속 프레임 — 연출을 ms 단위로 세워 놓고 훑는다. 실시간 캡처는 스크린샷 한 장이
    // 연출보다 오래 걸려 중간 프레임을 놓치므로 타임라인을 직접 감는다.
    for (const [name, open, step, end, seed] of TIMELINES) {
        const dir = path.join(OUT, name);
        fs.mkdirSync(dir, { recursive: true });
        const page = await newPage(name, seed);
        await page.evaluate((seed ? RNG(seed) + ';' : '') + open);
        await page.evaluate(`UI.clearSummonTimers()`);
        for (let t = 0; t <= end; t += step) {
            await page.evaluate(`(${SEEK})(${t})`);
            await page.screenshot({ path: path.join(dir, `t${String(t).padStart(4, '0')}.png`) });
        }
        console.log(`${name}: ${Math.floor(end / step) + 1} frames → ${dir}`);
        await page.close();
    }
    await browser.close();
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE/PAGE ERRORS');
})();
