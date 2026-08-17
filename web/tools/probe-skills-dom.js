// 스킬 화면(shot-042340) 비율 실측 — 전 UI 비율 전수 검증 패스(TODO ②)용.
// 클론 DOM rect를 `#app` 박스 기준 %H로 환산해 **원본 목표치와 나란히** Δ%p로 찍는다.
//   · 원본 목표치는 앞 세션이 원본 PNG(496×890) 픽셀 스캔으로 등재한 값이다(TODO 항목 메모).
//   · 열림 애니메이션(scale .7→1)이 헤드리스에서 스로틀링되면 rect가 레이아웃값의 0.694배로
//     잡히는 함정이 있으므로(TODO 메모), 기다리지 말고 animation/transition을 죽이고 잰다.
//   · 스킬 시드는 캡처 하네스와 같은 15/18(3줄 그리드)로 맞춘다 — 소환으로는 확률 때문에
//     4~6종에서 멈춰 원본과 줄 수가 달라지고, 그러면 아래 줄 수치가 통째로 어긋난다.
// 사용: node probe-skills-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 원본 %H (앞 세션 픽셀 실측 등재분). [이름, 목표top, 목표bottom|null]
const TARGET = [
    ['제목줄 상단', 1.91, null],
    ['스탯 요약바', 6.07, 8.09],
    ['1행 오브', 10.34, 15.73],
    ['1행 조각게이지 상단', 16.97, null],
    ['2행 오브 상단', 20.22, null],
    ['3행 오브 상단', 30.22, null],
    ['장착됨 바', 56.29, 62.13],
    ['버튼줄 상단', 64.16, null],
    ['소환바 상단', 74.49, null],
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 496, height: 890 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        UI.toast = function () {};
        S.tickets = 4400;
        // 캡처 하네스와 같은 시드: 앞 15종을 직접 세워 3줄 그리드를 만든다
        S.skills = {};
        SKILL_DEFS.slice(0, 15).forEach((d, i) => { S.skills[d.id] = { level: 1 + (i % 3), dupes: i % 4, stars: 0 }; });
        S.equippedSkills = SKILL_DEFS.slice(0, Skills.MAX_ACTIVE).map(d => d.id);
        UI.switchTab('summon'); UI.switchSummonSub('skills');
    });
    await page.waitForTimeout(500);

    const got = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const pct = (v) => (v - app.top) / app.height * 100;
        const box = (sel, root) => {
            const el = (root || document).querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { top: pct(r.top), bot: pct(r.bottom) };
        };
        const p = document.getElementById('panel-summon') || document;
        const cells = [...document.querySelectorAll('#panel-skills .sk-cell')];
        const orbTop = (i) => {
            const c = cells[i]; if (!c) return null;
            const o = c.querySelector('.sk-orb').getBoundingClientRect();
            return { top: pct(o.top), bot: pct(o.bottom) };
        };
        return {
            '제목줄 상단': box('#panel-skills .sheet-title'),
            '스탯 요약바': box('#panel-skills .passive-banner'),
            '1행 오브': orbTop(0),
            '1행 조각게이지 상단': cells[0] ? (() => { const r = cells[0].querySelector('.sk-shard').getBoundingClientRect(); return { top: pct(r.top), bot: pct(r.bottom) }; })() : null,
            '2행 오브 상단': orbTop(5),
            '3행 오브 상단': orbTop(10),
            '장착됨 바': box('#panel-skills .equipped-row'),
            '버튼줄 상단': box('#panel-skills .row.center'),
            '소환바 상단': box('#panel-skills .summon-bar'),
            rows: cells.length,
            _diag: {
                gridScroll: box('#panel-skills .grid-scroll'),
                skGrid: box('#panel-skills .sk-grid'),
                lastShard: (() => { const c = cells[cells.length - 1]; if (!c) return null; const r = c.querySelector('.sk-shard').getBoundingClientRect(); return { top: pct(r.top), bot: pct(r.bottom) }; })(),
                equippedLabel: box('#panel-skills .equipped-label'),
                miniBtn: box('#panel-skills .sk-mini'),
                actionBtn: box('#panel-skills .sk-action-btn'),
                panel: box('#panel-skills'),
            },
        };
    });

    console.log(`스킬 셀 ${got.rows}개 (원본 15 = 5열 3줄)`);
    console.log('요소'.padEnd(22) + '원본%H'.padStart(9) + '클론%H'.padStart(9) + 'Δ%p'.padStart(8) + '   원본h    클론h    Δh');
    let worst = 0, worstName = '';
    for (const [name, tTop, tBot] of TARGET) {
        const g = got[name];
        if (!g) { console.log(`${name.padEnd(22)}  (요소를 못 찾음)`); worst = 99; worstName = name; continue; }
        const d = g.top - tTop;
        if (Math.abs(d) > Math.abs(worst)) { worst = d; worstName = name; }
        let hCol = '';
        if (tBot != null) {
            const oh = tBot - tTop, ch = g.bot - g.top, dh = ch - oh;
            if (Math.abs(dh) > Math.abs(worst)) { worst = dh; worstName = name + ' 높이'; }
            hCol = `   ${oh.toFixed(2).padStart(6)}  ${ch.toFixed(2).padStart(6)}  ${dh >= 0 ? '+' : ''}${dh.toFixed(2)}`;
        }
        console.log(`${name.padEnd(22)}${tTop.toFixed(2).padStart(9)}${g.top.toFixed(2).padStart(9)}${(d >= 0 ? '+' : '') + d.toFixed(2)}`.padEnd(50) + hCol);
    }
    console.log('\n-- 진단(원본 목표 없음, 원인 추적용) --');
    for (const [k, v] of Object.entries(got._diag)) console.log(`  ${k.padEnd(14)} ${v ? v.top.toFixed(2).padStart(7) + ' ~ ' + v.bot.toFixed(2).padStart(7) + '  h=' + (v.bot - v.top).toFixed(2) : '(없음)'}`);
    console.log(`\n최대 어긋남 ${worst >= 0 ? '+' : ''}${worst.toFixed(2)}%p (${worstName})`);
    console.log(errs.length ? '콘솔 에러:\n' + errs.join('\n') : '콘솔 에러 0건');
    const pass = Math.abs(worst) <= 2 && !errs.length;
    console.log(pass ? '\n✅ PASS — 전 요소 ±2%p 이내' : '\n❌ FAIL — ±2%p 초과');
    await browser.close();
    process.exit(pass ? 0 : 1);
})();
