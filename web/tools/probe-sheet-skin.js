// 시트 바탕 · 장비 셀 · 팝업 카드 · 퀘스트 행 스킨 패스 검증 — `ui-quality-up` 2·3·4차 슬라이스.
// 짝: css/style.css 말미 '시트 바탕 · 장비 셀 AAA 스킨' + '일반 팝업 카드 바탕 AAA 스킨' 블록(같이 고칠 것).
//
// 스킨 패스의 절대 조건은 1차(probe-tile-skin.js)와 같다: **레이아웃이 한 픽셀도 안 움직여야 한다.**
// 비평가 게이트가 요소 박스 ±2%p 라서, 칠하는 속성(background-image/box-shadow)만 건드렸다면
// 박스는 그대로여야 하고 그건 눈이 아니라 좌표로 확인한다.
//
// 🚨 두 번 실행해서 before/after 를 비교하면 안 된다(1차에서 실측으로 밟은 함정) — 게임이 도는 동안
//    알·타이머가 쌓여 유령 이동이 잡힌다. **한 번의 페이지 로드 안에서** 스킨을 껐다 켜고 잰다.
// 🚨 두 측정 사이에 스크린샷을 끼우지 말 것 — 캡처하는 수백 ms 동안 시트가 다시 그려져 스크롤이
//    되감기고 무리가 통째로 밀린다. 캡처는 두 측정이 끝난 뒤에 몰아서 한다.
//
// 추가로 이 슬라이스에서만 필요한 판정 2건:
//  ⓐ **어두운 시트 제외 확인** — .league-sheet/.shop-sheet 에 흰 그라디언트가 새면 바탕이 회색으로 뜬다.
//     두 시트의 실제 렌더 배경색을 재서 원래 어두운 값(#0e111b / #200219)인지 본다.
//  ⓑ **장비 셀 크로스해치 보존** — background 단축을 background-image 로 다시 쌓았으므로,
//     원래 있던 다이아 크로스해치 2겹이 살아 있는지 background-image 층 수로 확인한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TOL = 0.5;   // px — 서브픽셀 반올림만 허용

// 스킨을 끄고 예전 값으로 되돌리는 오버라이드 (style.css 의 새 블록과 짝이다)
const KILL_SKIN = `
.modal-card.sheet:not(.league-sheet):not(.shop-sheet) { background-image: none !important; box-shadow: none !important; }
.equip-cell:not(.egg-cell) {
    background-image:
        repeating-linear-gradient(45deg, rgba(0,0,0,.13) 0 2px, transparent 2px 12px),
        repeating-linear-gradient(-45deg, rgba(0,0,0,.13) 0 2px, transparent 2px 12px) !important;
    box-shadow: none !important; transition: none !important;
}
.equip-cell.empty { box-shadow: none !important; }
.modal-card:not(.sheet) { background-image: none !important; box-shadow: 0 .5rem 0 rgba(0,0,0,.25) !important; }
.qst-row { background-image: none !important; box-shadow: 0 .25rem 0 rgba(0,0,0,.3) !important; }
/* 5차 슬라이스 — 버튼 면 광택(background-image 하나만 쓰므로 그것만 되돌린다) */
.btn.btn:not(.silver):not(.ascend-ready) { background-image: none !important; }
/* 6차 슬라이스 — 상단바·탭바·재화 바 밴드 */
#topbar, #tabbar { background-image: none !important; box-shadow: none !important; }
.currency-pills .pill { background-image: none !important; box-shadow: none !important; }
`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    // 상태를 못박는다 — 알·부화가 시간에 따라 쌓이면 그리드 행이 밀려 유령 이동이 잡힌다(1차 함정 ⓐ).
    await page.evaluate(() => {
        S.eggs = []; S.hatching = []; S.coins = 1e9; S.gems = 1e6; S.tickets = 500;
        for (const slot of Object.keys(S.equipment)) { if (!S.equipment[slot]) { const r = Forge.rollItem(); if (r.slot === slot) S.equipment[slot] = r; } }
    });

    const SCREENS = [
        ['main-equip', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();`, '.equip-cell, .equip-grid'],
        // 6차 슬라이스 — 늘 떠 있는 세 밴드(상단바·탭바·재화 바). 탭바 밴드 높이는 probe-tabbar 의
        // 판정 대상이라 여기서 1px 이라도 움직이면 그 화면 판정이 통째로 무효가 된다.
        ['frame-bands', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();`,
            '#topbar, #tabbar, #tabbar button, .currency-pills .pill, .profile-card'],
        ['quests', `UI.openQuests && UI.openQuests()`, '#quest-modal .modal-card.sheet, #quest-modal .qst-row'],
        ['dungeons', `UI.openDungeons()`, '#dungeon-modal .modal-card.sheet, #dungeon-modal .dg-banner'],
        ['pets', `UI.switchTab('summon'); UI.switchSummonSub('pets')`, '#panel-pets .sk-grid, #panel-pets .pet-tile'],
        // 3차 슬라이스 — 가운데 정렬 팝업 카드(.modal-card:not(.sheet)) 바탕
        ['player-info', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.openPlayerInfo()`,
            '#player-info-modal .modal-card, #player-info-modal .modal-card .equip-cell, #player-info-modal .modal-card .btn'],
        ['forge-info', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.openForgeInfo()`,
            '.modal:not(.hidden) .modal-card:not(.sheet), .modal:not(.hidden) .modal-card:not(.sheet) .btn'],
    ];
    const boxesOf = sel => page.evaluate(s => {
        const R = e => { const r = e.getBoundingClientRect(); return [+r.left.toFixed(2), +r.top.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]; };
        return [...document.querySelectorAll(s)].map(R);
    }, sel);
    const setSkin = on => page.evaluate(([css, want]) => {
        let el = document.getElementById('kill-sheet-skin');
        if (want) { if (el) el.remove(); return; }
        if (!el) { el = document.createElement('style'); el.id = 'kill-sheet-skin'; document.head.appendChild(el); }
        el.textContent = css;
    }, [KILL_SKIN, on]);

    let fail = 0;
    for (const [label, setup, sel] of SCREENS) {
        await page.evaluate(`(() => { try { ${setup} } catch (e) { console.error(e); } })()`);
        await page.waitForTimeout(700);
        await setSkin(true); await page.waitForTimeout(120);
        const withSkin = await boxesOf(sel);
        await setSkin(false); await page.waitForTimeout(120);
        const without = await boxesOf(sel);
        await setSkin(true); await page.waitForTimeout(150);
        // screenshot 내부의 폰트 대기가 30s 로 터진다 — 상한을 먼저 소화하고 자체 타임아웃도 올린다(shot-screens.js 와 같은 처방).
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => { });
        await page.screenshot({ path: path.resolve(__dirname, `sheet-skin-${label}.png`), timeout: 180000 });

        if (!withSkin.length) { console.log(`  FAIL ${label}: 요소를 못 찾음(${sel})`); fail++; continue; }
        if (withSkin.length !== without.length) { console.log(`  FAIL ${label}: 요소 수 ${without.length} → ${withSkin.length}`); fail++; continue; }
        // 무리 전체가 같이 밀리는 것(스크롤)은 레이아웃 변화가 아니다 — 첫 요소 기준 상대 좌표로 비교한다.
        const norm = arr => arr.map(b => [b[0] - arr[0][0], b[1] - arr[0][1], b[2], b[3]]);
        const A = norm(withSkin), B = norm(without);
        let worst = 0, worstAt = -1;
        A.forEach((box, i) => box.forEach((v, k) => { const d = Math.abs(v - B[i][k]); if (d > worst) { worst = d; worstAt = i; } }));
        const ok = worst <= TOL;
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label}: 박스 ${withSkin.length}개 · 스킨 유무 최대 이동 ${worst.toFixed(2)}px${ok ? '' : ` (요소 #${worstAt})`}`);
        if (!ok) fail++;
    }

    // ⓐ 어두운 시트가 흰 그라디언트에 오염되지 않았는가 — 실제 렌더 배경색으로 확인한다.
    const dark = await page.evaluate(() => {
        const out = {};
        for (const [k, open] of [['league', 'openLeague'], ['shop', 'openShop']]) {
            try { UI[open] && UI[open](); } catch (e) { }
            const el = document.querySelector(k === 'league' ? '.modal-card.sheet.league-sheet' : '.modal-card.sheet.shop-sheet');
            if (el) { const cs = getComputedStyle(el); out[k] = { bg: cs.backgroundColor, img: cs.backgroundImage }; }
        }
        return out;
    });
    for (const [k, want] of [['league', 'rgb(14, 17, 27)'], ['shop', 'rgb(32, 2, 25)']]) {
        const got = dark[k];
        if (!got) { console.log(`  SKIP 어두운 시트 ${k}: 열지 못함`); continue; }
        const ok = got.bg === want && got.img === 'none';
        if (!ok) fail++;
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} 어두운 시트 ${k}: 배경 ${got.bg} · 이미지 ${got.img === 'none' ? '없음' : '있음(오염)'}`);
    }

    // ⓒ 5차 슬라이스(버튼 면 광택)가 **원본 색 아래턱을 덮지 않았는가.**
    //    이 게임의 버튼 두께는 `inset 0 -.22rem 0 var(--pp-*-dk)` 이고 그 색은 원본 픽셀에서 뽑은 값이다 —
    //    광택 규칙이 box-shadow 까지 건드리면 여기서 턱이 사라진 채로 잡힌다(첫 판에서 실제로 잡았다).
    await page.evaluate(`(() => { try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.openPlayerInfo(); } catch (e) { } })()`);
    await page.waitForTimeout(500);
    const ledge = await page.evaluate(() => {
        const out = {};
        const q = s => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); return { img: cs.backgroundImage, shadow: cs.boxShadow }; };
        out.any = q('#player-info-modal .btn') || q('.modal-card .btn') || q('.panel .btn');
        return out;
    });
    const L = ledge.any;
    const ledgeOk = !!L && /inset/.test(L.shadow) && L.img.includes('linear-gradient');
    if (!ledgeOk) fail++;
    console.log(`  ${ledgeOk ? 'OK  ' : 'FAIL'} 버튼 아래턱 보존 + 광택 적용: shadow=${L ? L.shadow.slice(0, 44) : '요소 없음'} / img=${L ? L.img.slice(0, 30) : '-'}`);

    // ⓑ 장비 셀 크로스해치 2겹 보존 — background-image 층이 4개(광택·명암·해치·해치)여야 한다.
    await page.evaluate(`(() => { try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { } })()`);
    await page.waitForTimeout(400);
    const layers = await page.evaluate(() => {
        const el = document.querySelector('.equip-cell:not(.egg-cell)');
        if (!el) return null;
        const img = getComputedStyle(el).backgroundImage;
        return { hatch45: (img.match(/repeating-linear-gradient/g) || []).length, img: img.slice(0, 60) };
    });
    const hatchOk = layers && layers.hatch45 >= 2;
    if (!hatchOk) fail++;
    console.log(`  ${hatchOk ? 'OK  ' : 'FAIL'} 장비 셀 크로스해치: repeating-gradient ${layers ? layers.hatch45 : 0}겹(2겹 이상이어야 함)`);

    if (errors.length) { console.log('콘솔 에러:'); errors.slice(0, 6).forEach(e => console.log('   ' + e)); }
    console.log(fail || errors.length ? '\nFAIL' : '\nPASS — 스킨이 레이아웃을 안 움직이고, 어두운 시트도 안 오염됐다 (스샷 sheet-skin-*.png)');
    await browser.close();
    process.exit(fail || errors.length ? 1 : 0);
})();
