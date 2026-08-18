// 던전 상세 팝업 난이도 표기(`dgd-difficulty-format`) 기능 검증 —
// 원본 shot-042304 은 `20-9` 두 수를 하이픈으로 잇는데 클론은 `N단계` 한 수만 찍었다.
// TODO 항목의 검증 조항 그대로: **◀▶ 로 1단계~최고+1 까지 전부 훑어** 표기와 '입장' 이 넘기는
// 정수 stage 가 서로 어긋나지 않는지, 소탕 뒤에도 유지되는지 본다.
//
// ⚠️ 표기만 보고 통과시키지 않는 이유(TODO 함정 ㉣ '자가 코드보다 낡으면 판정이 무효'):
//   기대 문자열을 손으로 베껴 두면 매핑을 바꿔도 옛 값으로 재게 된다. 그래서 기대값은
//   **DOM 에서 읽은 표기**와 **버튼 onclick 에 실제로 박힌 정수**를 맞대 보는 방식으로만 만든다
//   (챕터당 10단계는 combat.js `S.stage >= 10`·pass.js `(bestChapter-1)*10+bestStage` 규약).
//
// 사용: PW_PATH=... node probe-dgd-difficulty.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const BEST = 198;          // 최고 클리어 198 → 기본 표기가 원본과 같은 199단계(=20-9)가 된다
const EXPECT_TOP = '20-9'; // 원본 shot-042304 의 난이도 두 수

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    // 병렬 3D 세션이 도는 컨테이너에서는 부팅에 60초 넘게 걸린다(인계 메모) — 타임아웃을 넉넉히.
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Dungeons !== 'undefined', null, { timeout: 150000 });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    const out = await page.evaluate(([best]) => {
        UI.toast = () => { };
        Dungeons.ensure();
        S.bestChapter = 20; S.bestStage = 10;      // 던전 해금 조건 충족용
        S.dungeons.best.hammer = best;
        S.dungeons.keys.hammer = Dungeons.MAX_KEYS;
        UI.openDungeonDetail('hammer');

        // 표기(`.dgd-stage b`)와 '입장' 버튼이 실제로 넘기는 정수를 **같은 프레임에서** 함께 읽는다.
        const read = () => {
            const root = document.getElementById('dungeon-detail-modal');
            const label = root.querySelector('.dgd-stage b').textContent.trim();
            const enter = root.querySelector('.dgd-btns .dgd-btn:last-child').getAttribute('onclick');
            const m = /UI\.onEnterDungeon\('hammer',\s*(\d+)\)/.exec(enter);
            const tri = root.querySelectorAll('.dgd-stage-row .tri-btn');
            return {
                label,
                arg: m ? +m[1] : null,
                internal: UI._dgDetailStage,
                leftShown: tri[0].style.visibility !== 'hidden',
                rightShown: tri[1].style.visibility !== 'hidden',
            };
        };

        const rows = [];
        rows.push(read());
        // ◀ 를 눌러 1단계까지 내려간다 (최고+1 = best+1 회 미만)
        for (let i = 0; i < best + 5; i++) {
            UI.onDungeonStageStep(-1);
            rows.push(read());
            if (UI._dgDetailStage === 1 && rows.length > best) break;
        }
        // 다시 ▶ 로 끝까지 올려 양방향이 대칭인지 본다
        const up = [];
        for (let i = 0; i < best + 5; i++) {
            UI.onDungeonStageStep(1);
            up.push(read());
            if (UI._dgDetailStage === best + 1) break;
        }

        // 소탕 뒤에도 표기가 유지되는지 (소탕은 열쇠만 소모하고 단계는 안 건드린다)
        const beforeSweep = read();
        const sweptOk = Dungeons.sweep('hammer');
        UI.renderDungeonDetail();
        const afterSweep = read();

        return { rows, up, beforeSweep, afterSweep, sweptOk, keysLeft: S.dungeons.keys.hammer };
    }, [BEST]);

    await browser.close();

    // ---- 판정: 표기 = 챕터-스테이지 쌍, 내부 정수·입장 인자와 1:1 ----
    const pair = n => `${Math.floor((n - 1) / 10) + 1}-${(n - 1) % 10 + 1}`;
    const fails = [];
    const seen = new Set();
    const check = (r, where) => {
        seen.add(r.internal);
        if (r.arg !== r.internal) fails.push(`${where}: 입장 인자 ${r.arg} ≠ 내부 단계 ${r.internal}`);
        if (r.label !== pair(r.internal)) fails.push(`${where}: 표기 "${r.label}" ≠ 기대 "${pair(r.internal)}" (단계 ${r.internal})`);
        if (/단계/.test(r.label)) fails.push(`${where}: 표기에 '단계'가 남아 있다 — "${r.label}"`);
    };
    out.rows.forEach((r, i) => check(r, `내림 ${i}`));
    out.up.forEach((r, i) => check(r, `올림 ${i}`));

    const top = out.rows[0];
    if (top.label !== EXPECT_TOP) fails.push(`기본 표기 "${top.label}" ≠ 원본 "${EXPECT_TOP}" (최고 ${BEST} + 1)`);
    if (top.rightShown) fails.push('최고+1 인데 ▶ 가 보인다 (원본은 이 상태에서 ◀ 만 있다)');
    const bottom = out.rows[out.rows.length - 1];
    if (bottom.internal !== 1) fails.push(`◀ 로 1단계까지 못 내려갔다 — 마지막 ${bottom.internal}`);
    if (bottom.leftShown) fails.push('1단계인데 ◀ 가 보인다');
    // 1..best+1 을 하나도 빠짐없이 훑었는지 (항목의 "1단계~최고+1 까지 훑으며")
    for (let n = 1; n <= BEST + 1; n++) if (!seen.has(n)) { fails.push(`단계 ${n} 을 훑지 못했다`); break; }
    if (!out.sweptOk) fails.push('소탕이 실패했다 (열쇠·최고기록 전제 확인)');
    if (out.afterSweep.label !== out.beforeSweep.label || out.afterSweep.arg !== out.beforeSweep.arg)
        fails.push(`소탕 후 표기가 바뀌었다 — ${out.beforeSweep.label}/${out.beforeSweep.arg} → ${out.afterSweep.label}/${out.afterSweep.arg}`);

    console.log(`훑은 단계 수: ${seen.size} (1..${BEST + 1})`);
    console.log(`기본(최고+1=${BEST + 1}): "${top.label}"  입장 인자 ${top.arg}  ◀${top.leftShown ? '보임' : '숨김'} ▶${top.rightShown ? '보임' : '숨김'}`);
    console.log(`경계 표본: ${[1, 9, 10, 11, 20, 21, 100, 101, 199].map(n => `${n}→${pair(n)}`).join(' · ')}`);
    console.log(`1단계: "${bottom.label}"  ◀${bottom.leftShown ? '보임' : '숨김'}`);
    console.log(`소탕: ${out.sweptOk ? '성공' : '실패'} · 열쇠 ${out.keysLeft} · 표기 ${out.beforeSweep.label} → ${out.afterSweep.label}`);
    console.log('콘솔 에러:', errors.length, errors.slice(0, 5).join(' | '));

    if (fails.length || errors.length) {
        console.log('\nFAIL ' + (fails.length + errors.length) + '건');
        fails.forEach(f => console.log('  ✗ ' + f));
        errors.slice(0, 5).forEach(e => console.log('  ✗ ' + e));
        process.exit(1);
    }
    console.log('\nPASS — 표기·입장 인자·◀▶ 경계·소탕 유지 전부 일치');
})();
