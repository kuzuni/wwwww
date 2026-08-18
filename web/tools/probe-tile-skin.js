// 타일 스킨 패스 검증 — `ui-quality-up` (사용자 지시 2026-08-19 "UI 퀄리티 올려야 할 거 같음 … 원신급으로").
//
// 스킨 패스의 절대 조건: **레이아웃이 한 픽셀도 안 움직여야 한다.**
// 비평가 게이트가 요소 박스 ±2%p 이므로, 칠하는 속성(background-image / box-shadow / filter)만
// 건드렸다면 박스는 그대로여야 하고, 그게 지켜졌는지는 눈이 아니라 좌표로 확인한다.
//
// 🚨 두 번 실행해서 before/after 를 비교하면 **안 된다** — 실측으로 밟았다: 펫 업그레이드 팝업의
//    재료 그리드는 `S.eggs`(부화 대기 알)를 같이 그리는데 알은 게임이 도는 동안 계속 쌓여서,
//    두 실행의 경과 시간 차이만으로 행이 밀려 48px 이동이 잡혔다(스킨과 무관한 유령 실패).
//    그래서 **한 번의 페이지 로드 안에서** 스킨을 껐다 켜고 잰다 — 상태가 완전히 같아 차이는
//    오직 내가 넣은 칠 속성에서만 나온다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TOL = 0.5;   // px — 서브픽셀 반올림만 허용한다

// 스킨을 끄고 예전 값으로 되돌리는 오버라이드 (이 파일의 style.css 규칙과 짝이다 — 같이 고칠 것)
const KILL_SKIN = `
.pet-tile .tile-face { background-image: none !important; transition: none !important;
    box-shadow: inset 0 -.2rem 0 rgba(0,0,0,.25) !important; }
.pet-tile:active .tile-face { transform: none !important; filter: none !important; }
.pet-tile.selected .tile-face { box-shadow: inset 0 -.2rem 0 rgba(0,0,0,.25), 0 0 0 .16rem var(--pp-blue) !important; }
`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    // 인벤을 6등급 × 2개로 못박는다. 알·부화도 비워 재료 그리드가 시간에 안 흔들리게 한다.
    await page.evaluate(() => {
        Mounts.ensure();
        S.mounts = []; S.activeMounts = []; S.winders = 1e9; S.mountOpens = 0;
        RARITIES.forEach((r, k) => {
            for (let n = 0; n < 2; n++) S.mounts.push({ name: mountNames[r][n % mountNames[r].length], rarity: r, level: 1 + k, xp: 0, stars: k % 3, subs: Mounts.rollSubs() });
        });
        Mounts.equip(0);
        S.pets = []; S.activePets = [0, 1, 2]; S.eggs = []; S.hatching = [];
        RARITIES.forEach((r, k) => {
            const def = petStats[r][0];
            for (let n = 0; n < 2; n++) S.pets.push({ name: def.name, rarity: r, level: 1 + k, dupes: 0, xp: 0, stars: k % 3, subs: Pets.rollSubs() });
        });
    });

    const SCREENS = [
        ['mounts', () => { UI.openMounts(); }, '#mount-modal .pet-tile, #mount-modal .pet-tile .tile-face, #mount-modal .sk-grid'],
        ['pets', () => { UI.closeMounts(); UI.switchTab('summon'); UI.switchSummonSub('pets'); }, '#panel-pets .pet-tile, #panel-pets .pet-tile .tile-face, #panel-pets .sk-grid'],
        ['petupg', () => { UI.openPetUpgrade(0); }, '#pet-upgrade-modal .pet-tile, #pet-upgrade-modal .pet-tile .tile-face'],
    ];
    const boxesOf = sel => page.evaluate(s => {
        const R = e => { const r = e.getBoundingClientRect(); return [+r.left.toFixed(2), +r.top.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]; };
        return [...document.querySelectorAll(s)].map(R);
    }, sel);
    const setSkin = on => page.evaluate(([css, want]) => {
        let el = document.getElementById('kill-skin');
        if (want) { if (el) el.remove(); return; }
        if (!el) { el = document.createElement('style'); el.id = 'kill-skin'; document.head.appendChild(el); }
        el.textContent = css;
    }, [KILL_SKIN, on]);

    let fail = 0;
    for (const [label, setup, sel] of SCREENS) {
        await page.evaluate(setup);
        await page.waitForTimeout(700);
        // 🚨 두 측정 사이에 **스크린샷을 끼우지 말 것** — 캡처가 수백 ms 걸리는 동안 게임이 시트를
        //    다시 그려 스크롤이 되감기고, 그러면 무리가 통째로 밀려 843px 이동으로 잡힌다(실측).
        //    캡처는 두 측정이 끝난 뒤에 몰아서 한다.
        await setSkin(true);  await page.waitForTimeout(120);
        const withSkin = await boxesOf(sel);
        await setSkin(false); await page.waitForTimeout(120);
        const without = await boxesOf(sel);
        await setSkin(false); await page.waitForTimeout(150);
        await page.screenshot({ path: path.resolve(__dirname, `tile-skin-before-${label}.png`) });
        await setSkin(true);  await page.waitForTimeout(150);
        await page.screenshot({ path: path.resolve(__dirname, `tile-skin-after-${label}.png`) });

        if (withSkin.length !== without.length) { console.log(`  FAIL ${label}: 요소 수 ${without.length} → ${withSkin.length}`); fail++; continue; }
        // 🔑 무리 전체가 같이 밀리는 것(스크롤·패널 오프셋)은 레이아웃 변화가 아니다 —
        //    **첫 요소 기준 상대 좌표 + 크기**로 비교해 스크롤이 유령 실패를 만들지 못하게 한다.
        const norm = arr => arr.map(b => [b[0] - arr[0][0], b[1] - arr[0][1], b[2], b[3]]);
        const A = norm(withSkin), B = norm(without);
        let worst = 0, worstAt = -1;
        A.forEach((box, i) => box.forEach((v, k) => {
            const d = Math.abs(v - B[i][k]);
            if (d > worst) { worst = d; worstAt = i; }
        }));
        const ok = worst <= TOL;
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}: 박스 ${withSkin.length}개 · 스킨 유무 최대 이동 ${worst.toFixed(2)}px${ok ? '' : ` (요소 #${worstAt})`}`);
        if (!ok) fail++;
    }

    if (errors.length) { console.log('콘솔 에러:'); errors.slice(0, 6).forEach(e => console.log('   ' + e)); }
    console.log(fail || errors.length ? '\nFAIL' : '\nPASS — 스킨이 레이아웃을 한 픽셀도 안 움직인다 (before/after 스샷 tile-skin-*.png)');
    await browser.close();
    process.exit(fail || errors.length ? 1 : 0);
})();
