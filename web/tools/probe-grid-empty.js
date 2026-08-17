// 빈 상태 문구가 .sk-grid 타일 한 칸(≈49px)에 갇혀 4줄로 쪼개지던 버그의 검증 도구.
// 탈것·펫·스킬 3화면을 각각 보유 0으로 만들고, 문구가 1~2줄로 그리드 폭 전체에
// 중앙 정렬되는지 getClientRects().length와 rect 대조로 잰다.
// 사용: node probe-grid-empty.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const VIEWPORTS = [
    { width: 412, height: 915 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
    { width: 480, height: 850 },
];

// 3화면: 보유분을 0으로 비우고 해당 패널을 그린 뒤, 그 안의 .grid-empty를 잰다.
const SCREENS = [
    { id: 'mount', open: () => { S.mounts = {}; S.activeMount = null; UI.openMounts(); } },
    { id: 'pet', open: () => { S.pets = []; S.eggs = []; S.activePets = []; UI.renderPets(); } },
    { id: 'skill', open: () => { S.skills = {}; S.equippedSkills = []; UI.renderSkills(); } },
];

// UI·S는 최상위 `const`/`let`이라 window의 속성이 아니다(`window.UI === undefined`).
// page.waitForFunction의 술어는 이 렉시컬 전역을 못 보고 타임아웃 나는 경우가 있어
// (같은 술어가 어떤 실행에서는 통과하고 어떤 실행에서는 15초를 다 쓴다) 신뢰할 수 없다.
// page.evaluate는 항상 보이므로 evaluate 폴링으로 부팅을 기다린다.
async function waitBooted(page, timeout = 20000) {
    const t0 = Date.now();
    for (;;) {
        const ready = await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S)
            .catch(() => false);
        if (ready) return;
        if (Date.now() - t0 > timeout) throw new Error('부팅 대기 시간 초과 (UI/S 미정의)');
        await page.waitForTimeout(100);
    }
}

// 등장 트랜지션이 끝날 때까지 (같은 이유로 evaluate 폴링).
async function waitNoOpening(page, timeout = 5000) {
    const t0 = Date.now();
    for (;;) {
        const done = await page.evaluate(() => !document.querySelector('.modal.opening')).catch(() => true);
        if (done) return;
        if (Date.now() - t0 > timeout) return; // 트랜지션이 안 끝나도 측정은 진행(아래 250ms 여유)
        await page.waitForTimeout(50);
    }
}

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    const rows = [];

    for (const vp of VIEWPORTS) {
        for (const sc of SCREENS) {
            // 화면마다 새 페이지를 쓴다: 앞 화면의 모달이 남아 있으면 .grid-empty가
            // 두 개 잡혀 엉뚱한 쪽을 재게 된다.
            const page = await browser.newPage({ viewport: vp });
            page.on('pageerror', e => errs.push(`${vp.width}x${vp.height} ${e}`));
            page.on('console', m => { if (m.type() === 'error') errs.push(`${vp.width}x${vp.height} ${m.text()}`); });
            await page.goto(INDEX, { waitUntil: 'load' });
            await waitBooted(page);

            await page.evaluate((screenId) => {
                // 펫·스킬은 소환 탭의 서브탭이라 switchSummonSub로 실제로 띄워야 한다 —
                // render*만 부르면 패널이 summon-visible이 아니라 rect가 0이다.
                if (screenId === 'mount') { S.mounts = {}; S.activeMount = null; UI.openMounts(); }
                else if (screenId === 'pet') { S.pets = []; S.eggs = []; S.activePets = []; UI.switchSummonSub('pets'); }
                else { S.skills = {}; S.equippedSkills = []; UI.switchSummonSub('skills'); }
            }, sc.id);
            // 등장 트랜지션(.modal.opening)은 transform: scale을 걸어 rect를 줄인다 —
            // 애니메이션이 끝나야 실제 레이아웃 폭이 나온다. 여기서 안 기다리면 rect는 축소된
            // 값이 나오는데 getComputedStyle의 padding은 축소되지 않아, 둘을 섞어 계산하는
            // contentW가 어긋나 멀쩡한 화면이 FAIL로 찍힌다(스케일 0.70에서 실측 확인).
            await waitNoOpening(page);
            await page.waitForTimeout(250);

            const r = await page.evaluate((screenId) => {
                // 화면에 실제로 붙어 있는(보이는) .grid-empty 하나를 고른다.
                const cands = [...document.querySelectorAll('.sk-grid .grid-empty')]
                    .filter(el => el.getClientRects().length > 0);
                if (cands.length !== 1) return { found: false, count: cands.length };
                const el = cands[0];
                const grid = el.closest('.sk-grid');
                const er = el.getBoundingClientRect(), gr = grid.getBoundingClientRect();
                const cs = getComputedStyle(grid);
                // 그리드 콘텐츠 폭 = 전체 폭 - 좌우 패딩(.sk-grid는 padding 0 12.5%)
                const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight);
                const contentW = gr.width - padL - padR;
                return {
                    found: true,
                    lines: el.getClientRects().length,
                    elW: +er.width.toFixed(1),
                    elH: +er.height.toFixed(1),
                    gridW: +gr.width.toFixed(1),
                    contentW: +contentW.toFixed(1),
                    // 전 열을 차지하는가: 요소 폭이 그리드 콘텐츠 폭과 일치
                    spansAllCols: Math.abs(er.width - contentW) <= 1,
                    // 중앙 정렬: 요소 중심과 그리드 중심이 일치
                    centerOff: +((er.left + er.width / 2) - (gr.left + gr.width / 2)).toFixed(2),
                    textAlign: getComputedStyle(el).textAlign,
                };
            }, sc.id);
            rows.push({ vp: `${vp.width}x${vp.height}`, screen: sc.id, ...r });
            await page.close();
        }
    }
    await browser.close();

    console.log('viewport   screen  lines  elW     contentW  spansAll  centerOff  align');
    let pass = true;
    for (const r of rows) {
        if (!r.found) { console.log(`${r.vp}  ${r.screen}  — .grid-empty 없음 (FAIL)`); pass = false; continue; }
        const ok = r.lines <= 2 && r.spansAllCols && Math.abs(r.centerOff) <= 1 && r.textAlign === 'center';
        if (!ok) pass = false;
        console.log(`${r.vp.padEnd(9)}  ${r.screen.padEnd(6)}  ${String(r.lines).padEnd(5)}  ${String(r.elW).padEnd(6)}  ${String(r.contentW).padEnd(8)}  ${String(r.spansAllCols).padEnd(8)}  ${String(r.centerOff).padEnd(9)}  ${r.textAlign}  ${ok ? '' : '<< FAIL'}`);
    }
    console.log(`\n콘솔 에러 ${errs.length}건`);
    errs.slice(0, 10).forEach(e => console.log('  ' + e));
    console.log(pass && !errs.length ? '\nPASS' : '\nFAIL');
    process.exit(pass && !errs.length ? 0 : 1);
})();
