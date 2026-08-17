// 팝업 겹침 스택 검증 (QA 9차 모달 스택 버그 4건):
// 나중에 연 팝업은 index.html 선언 순서와 무관하게 **항상 먼저 열린 팝업 위**에 그려지고 눌려야 한다.
//  ① 승천 × 대장간 정보  ② 제작 비교 × 진행 패스  ③ 탈것 × 플레이어 정보  ④ 스텁 × 프로필
// 판정 — 위 팝업 카드 사각형 안 40점(5×8 격자)의 elementFromPoint가 전부 위 팝업 안쪽이어야 통과.
//        (아래 팝업이 한 점이라도 잡히면 그만큼 사용자에게 '죽은 버튼'으로 보인다)
//        + 위 팝업의 대표 버튼 중앙 히트테스트가 그 버튼이어야 통과.
// 사용: node probe-modal-stack.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CASES = [
    {
        name: '승천 × 대장간 정보',
        under: '#forge-info-modal', over: '#ascend-modal',
        open: () => { S.forgeLevel = 35; UI.openForgeInfo(); UI.openAscension('forge'); },
        btn: '#ascend-modal .btn.primary',
    },
    {
        name: '제작 비교 × 진행 패스',
        under: '#pass-modal', over: '#craft-modal',
        open: () => { UI.openPass(); UI.showCraftModal(Forge.rollItem()); },
        btn: '#craft-modal .btn.equip',
    },
    {
        name: '탈것 × 플레이어 정보',
        under: '#player-info-modal', over: '#mount-modal',
        open: () => { UI.openPlayerInfo(); UI.openMounts(); },
        btn: '#mount-modal button',
    },
    {
        name: '스텁 × 프로필',
        under: '#profile-modal', over: '#stub-modal',
        open: () => { UI.openProfile(); UI.openStub('파워 랭킹', '서버 내 전투력 랭킹은 준비 중입니다.'); },
        btn: '#stub-modal .btn',
    },
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [], rows = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.coins = 1e9; S.gems = 1e6; S.hammers = 1e6;
        S.mounts = S.mounts || {}; S.mounts.horse = 1; S.activeMount = 'horse';
    });

    for (const c of CASES) {
        const r = await page.evaluate(cs => {
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            try { new Function('return (' + cs.openSrc + ')')()(); } catch (e) { return { err: e.message }; }
            const over = document.querySelector(cs.over), under = document.querySelector(cs.under);
            if (!over || over.classList.contains('hidden')) return { err: '위 팝업이 열리지 않음: ' + cs.over };
            if (!under || under.classList.contains('hidden')) return { err: '아래 팝업이 닫힘: ' + cs.under };
            const card = over.querySelector('.modal-card, .sr-wrap, div') || over;
            const b = card.getBoundingClientRect();
            let hit = 0, total = 0, stolen = null;
            for (let i = 1; i <= 5; i++) for (let j = 1; j <= 8; j++) {
                const x = b.left + b.width * i / 6, y = b.top + b.height * j / 9;
                const el = document.elementFromPoint(x, y);
                total++;
                if (el && over.contains(el)) hit++;
                else if (!stolen) stolen = el ? (el.id || el.className || el.tagName) : 'null';
            }
            const btnEl = document.querySelector(cs.btn);
            let btnHit = null;
            if (btnEl) {
                const r2 = btnEl.getBoundingClientRect();
                const el = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
                btnHit = !!(el && (el === btnEl || btnEl.contains(el)));
            }
            return {
                hit, total, stolen, btnHit,
                zOver: getComputedStyle(over).zIndex, zUnder: getComputedStyle(under).zIndex,
            };
        }, { over: c.over, under: c.under, btn: c.btn, openSrc: c.open.toString() });

        if (r.err) { fails.push(`${c.name}: ${r.err}`); rows.push(`${c.name}: ERROR ${r.err}`); continue; }
        const pass = r.hit === r.total && r.btnHit !== false;
        if (!pass) fails.push(`${c.name}: 히트 ${r.hit}/${r.total}${r.stolen ? ` (가로챈 요소 ${r.stolen})` : ''}, 버튼 히트=${r.btnHit}`);
        rows.push(`${pass ? 'PASS' : 'FAIL'} ${c.name} — 카드 히트 ${r.hit}/${r.total}, 버튼 히트 ${r.btnHit}, z(위/아래)=${r.zOver}/${r.zUnder}`);
    }

    // 회귀: 단독으로 열면 인라인 z-index가 비워져 CSS 기본층으로 돌아간다(값 누적 방지)
    const solo = await page.evaluate(() => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        UI.openProfile();
        const p = document.querySelector('#profile-modal');
        return { inline: p.style.zIndex, computed: getComputedStyle(p).zIndex };
    });
    if (solo.inline !== '' || solo.computed !== '20') fails.push(`단독 열기 z 복원 실패: inline="${solo.inline}" computed=${solo.computed}`);
    rows.push(`${solo.inline === '' && solo.computed === '20' ? 'PASS' : 'FAIL'} 단독 열기 z 복원 — inline="${solo.inline}" computed=${solo.computed}`);

    console.log(rows.join('\n'));
    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n'));
    console.log(fails.length || errs.length ? `\nFAIL (${fails.length}건)\n` + fails.join('\n') : '\n전부 통과');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
