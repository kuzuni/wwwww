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
        if (a.animationName && HERO_ANIM.indexOf(a.animationName) >= 0) base = last;
        else if (cell) base = d[cells.indexOf(cell)] || 0;
        else if (el.classList && el.classList.contains('sr-flash')) base = last;
        a.pause();
        try { a.currentTime = Math.max(0, T - base); } catch (e) { /* 무한 반복 외 예외 무시 */ }
    }
})`;

// [이름, 소환 실행 소스, 연속 캡처할 시각(ms)]
const CASES = [
    ['skill-x5', `S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`,
        [120, 380, 620, 900, 1400, 3400]],
    ['pet-x5', `S.summonMult = {pet:5}; UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.onSummonPetEgg();`, [900, 3400]],
    ['mount-x5', `S.summonMult = {mount:5}; UI.openMounts(); UI.onSummonMount();`, [900, 3400]],
    ['skill-x1', `S.summonMult = {skill:1}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, [900, 3400]],
    ['skill-x75', `S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, [900, 3400]],
    // 고등급 광채/광선 확인 — 소환 레벨을 만렙으로 올려 전설 이상이 나오게 한다
    ['skill-x5-hi', `S.summonCount = 5000; S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, [1400, 3400]],
    ['mount-x1-hi', `S.mountOpens = 5000; S.summonMult = {mount:1}; UI.openMounts(); UI.onSummonMount();`, [1400, 3400]],
];

// 연속 프레임으로 훑을 케이스 — [이름, 소환 소스, 프레임 간격, 마지막 시각]
const TIMELINES = [
    ['tl-x5-hi', `S.summonCount = 5000; S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 60, 2760],
    ['tl-x75', `S.summonCount = 5000; S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 90, 3060],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const newPage = async (tag) => {
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

    for (const [name, open, times] of CASES) {
        const page = await newPage(name);
        const t0 = Date.now();
        await page.evaluate(open);
        for (const t of times) {
            const wait = t - (Date.now() - t0);
            if (wait > 0) await page.waitForTimeout(wait);
            await page.screenshot({ path: path.join(OUT, `${name}-${t}.png`) });
        }
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
    }

    // 연속 프레임 — 연출을 ms 단위로 세워 놓고 훑는다. 실시간 캡처는 스크린샷 한 장이
    // 연출보다 오래 걸려 중간 프레임을 놓치므로 타임라인을 직접 감는다.
    for (const [name, open, step, end] of TIMELINES) {
        const dir = path.join(OUT, name);
        fs.mkdirSync(dir, { recursive: true });
        const page = await newPage(name);
        await page.evaluate(open);
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
