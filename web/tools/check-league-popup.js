// 리그 팝업 스택 기능 회귀 확인 — 보상 팝업이 리그 시트를 **덮는지(정답)** 아니면
// **대체하는지(과거 결함)** 를 DOM 으로 검사한다.
//
// 왜 이 검사가 필요한가: 원본(shot-042208)은 보상 팝업 뒤에 리그 시트가 딤 처리돼 비친다.
// 예전 `renderLeagueRewards()` 는 `leagueModal.innerHTML` 을 통째로 갈아끼워 시트를 지웠고,
// 그 결과 팝업 뒤가 전투 화면이 돼 **비율 대조 자체가 성립하지 않았다**(캡처만 보면 팝업은
// 멀쩡해 보여서 놓치기 쉽다). 레이아웃을 건드릴 때 이 구조가 되돌아가지 않는지 지킨다.
//
// 사용: PW_PATH=... node check-league-popup.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof League !== 'undefined', null, { timeout: 20000 });

    const snap = () => page.evaluate(() => {
        const m = document.getElementById('league-modal');
        const ov = m.querySelector('.lgr-overlay');
        return {
            sheet: !!m.querySelector('.league-sheet'),
            overlay: !!ov,
            overlays: m.querySelectorAll('.lgr-overlay').length,
            tiers: m.querySelectorAll('.league-reward-tier').length,
            challenge: !!m.querySelector('.league-challenge-row'),
            // 딤이 회색 밴드 위로 덮이는지 — z-index 를 안 주면 밴드만 밝게 남는다
            dimZ: ov ? getComputedStyle(ov).zIndex : null,
            footZ: m.querySelector('.league-foot') ? getComputedStyle(m.querySelector('.league-foot')).zIndex : null,
        };
    });

    const fails = [];
    const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : '  → ' + JSON.stringify(got)}`); if (!ok) fails.push(name); };

    await page.evaluate(() => UI.openLeague());
    let s = await snap();
    check('① 리그 시트가 열린다', s.sheet && !s.overlay, s);

    await page.click('.league-season-bar');
    s = await snap();
    check('② 시즌바 → 보상 팝업이 시트 "위에" 뜬다(시트 유지)', s.sheet && s.overlay && s.tiers > 0, s);
    check('③ 딤이 회색 밴드(z-index 1)보다 위다', +s.dimZ > +s.footZ, s);

    await page.click('.lgr-overlay .x-btn');
    s = await snap();
    check('④ ✕ → 리그 시트로 복귀(오버레이 제거)', s.sheet && !s.overlay, s);

    await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); UI.onWaypointLeague(); });
    s = await snap();
    check('⑤ 웨이포인트 진입도 시트를 깔고 연다', s.sheet && s.overlay, s);

    await page.evaluate(() => { UI.openLeagueRewards(); UI.openLeagueRewards(); });
    s = await snap();
    check('⑥ 연속 2회 열어도 오버레이가 쌓이지 않는다', s.overlays === 1, s);

    await page.evaluate(() => UI.openLeagueChallenge());
    s = await snap();
    check('⑦ 도전 팝업 경로가 안 깨졌다', s.challenge && !s.overlay, s);

    await page.evaluate(() => UI.openLeague());
    s = await snap();
    check('⑧ 도전 ✕ → 리그 시트', s.sheet && !s.challenge, s);

    console.log('\n콘솔/페이지 에러: ' + (errors.length ? '\n  ' + errors.join('\n  ') : '0건'));
    await browser.close();
    const bad = fails.length + errors.length;
    console.log(bad ? `FAIL — ${fails.length}건 실패, 에러 ${errors.length}건` : 'PASS — 8경로 정상, 에러 0');
    process.exit(bad ? 1 : 0);
})();
