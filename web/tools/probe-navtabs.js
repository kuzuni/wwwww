// 하단 네비 탭 재구성 검증 (TODO '하단 네비 탭을 PVP·던전·소환·상점 순으로 + 방 탭 제거', 사용자 지시 2026-08-18)
//
// 판정 항목
//   ① 보이는 탭이 정확히 5개, 라벨 순서가 PVP · 던전 · 소환 · 퀘스트 · 상점
//      (2026-08-18 사용자 지시 `quest-tab`: "하단 네비에 소환이랑 상점 사이에 퀘스트 부분 넣어라"로
//       기대값이 4개 → 5개로 바뀌었다. 기대값이 뒤집혔으니 검증기를 같이 고친 것 — 안 고치면
//       다음 세션이 멀쩡한 코드를 회귀로 오인한다.)
//   ② data-tab="menu"('방') 버튼이 DOM에 아예 없음
//   ③ 디버그 탭은 기본 숨김(display:none)이고 ?tab=debug 로는 다시 보임 — 훅 보존
//   ④ 각 탭 클릭이 정상 동작: PVP=리그 팝업 · 던전=던전 팝업 · 소환=소환 시트 · 퀘스트=퀘스트 팝업 · 상점=상점 팝업
//   ⑤ 열린 탭 버튼이 빨간 ✕로 바뀌고, 그걸 다시 누르면 닫혀 전투(홈)로 복귀
//   ⑥ 설정·초기화 도달 가능: 상단바 프로필 → 설정 탭에 resetGame/saveGame 진입점이 살아 있음
//   ⑦ 콘솔 에러 0건
//
// 사용: node tools/probe-navtabs.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const URL0 = 'file://' + path.resolve(__dirname, '..', 'index.html');
const EXPECT = ['PVP', '던전', '소환', '퀘스트', '상점'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errs = [];
    let pass = 0, fail = 0;
    const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(URL0);
    await page.waitForFunction(() => window.UI && UI.els && UI.els.topbar, null, { timeout: 20000 });
    // 3D 렌더 루프를 멈춰 스크린샷/평가가 초 단위로 걸리지 않게 한다 (인계 메모의 캡처 요령)
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () {}; });
    await page.waitForTimeout(400);

    // ① 보이는 탭 순서
    const visible = await page.evaluate(() => [...document.querySelectorAll('#tabbar button')]
        .filter(b => getComputedStyle(b).display !== 'none')
        .map(b => ({ tab: b.dataset.tab, label: (b.querySelector('span') || {}).textContent })));
    check('① 보이는 탭 5개 · 순서 PVP·던전·소환·퀘스트·상점',
        visible.length === 5 && visible.every((v, i) => v.label === EXPECT[i]),
        visible.map(v => v.label).join('|'));

    // ② '방' 탭 부재
    const menuBtn = await page.evaluate(() => !!document.querySelector('#tabbar button[data-tab="menu"]') || !!document.getElementById('panel-menu'));
    check('② 방(menu) 탭·패널 부재', !menuBtn, menuBtn ? '아직 남아 있음' : '없음');

    // ③ 디버그 탭 기본 숨김
    const dbgHidden = await page.evaluate(() => {
        const b = document.querySelector('#tabbar button[data-tab="debug"]');
        return b ? getComputedStyle(b).display === 'none' : null;
    });
    check('③ 디버그 탭 기본 숨김', dbgHidden === true, String(dbgHidden));

    // ④ 각 탭 동작
    const cases = [
        ['pvp', 'league-modal'],
        ['dungeon', 'dungeon-modal'],
        ['quest', 'quest-modal'],
        ['shop', 'shop-modal'],
    ];
    for (const [tab, modal] of cases) {
        const r = await page.evaluate(async ({ tab, modal }) => {
            UI.closeOpened();
            document.querySelector(`#tabbar button[data-tab="${tab}"]`).click();
            await new Promise(r => setTimeout(r, 250));
            const m = document.getElementById(modal);
            const btn = document.querySelector(`#tabbar button[data-tab="${tab}"]`);
            return { open: m && !m.classList.contains('hidden'), x: btn.classList.contains('tab-x') };
        }, { tab, modal });
        check(`④ ${tab} 탭 → ${modal} 열림`, r.open, JSON.stringify(r));
        // ⑤ 열린 탭은 빨간 ✕ → 다시 누르면 닫힘
        const closed = await page.evaluate(async ({ tab, modal }) => {
            document.querySelector(`#tabbar button[data-tab="${tab}"]`).click();
            await new Promise(r => setTimeout(r, 250));
            const m = document.getElementById(modal);
            return { closed: m.classList.contains('hidden'), active: UI.activeTab };
        }, { tab, modal });
        check(`⑤ ${tab} ✕ 재클릭 → 닫히고 홈 복귀`, r.x && closed.closed && closed.active === null, JSON.stringify({ ...r, ...closed }));
    }
    // 소환은 팝업이 아니라 하단 시트
    const sm = await page.evaluate(async () => {
        UI.closeOpened();
        document.querySelector('#tabbar button[data-tab="summon"]').click();
        await new Promise(r => setTimeout(r, 250));
        const open = document.getElementById('panel-summon').classList.contains('open');
        const x = document.querySelector('#tabbar button[data-tab="summon"]').classList.contains('tab-x');
        document.querySelector('#tabbar button[data-tab="summon"]').click();
        await new Promise(r => setTimeout(r, 250));
        return { open, x, closed: !document.getElementById('panel-summon').classList.contains('open') };
    });
    check('④ 소환 탭 → 소환 시트 열림', sm.open, JSON.stringify(sm));
    check('⑤ 소환 ✕ 재클릭 → 시트 닫힘', sm.x && sm.closed, JSON.stringify(sm));

    // ⑥ 설정·초기화 도달 경로 (상단바 프로필 → 설정)
    const settings = await page.evaluate(async () => {
        UI.closeOpened();
        document.querySelector('#topbar .profile-card').click();
        await new Promise(r => setTimeout(r, 200));
        const opened = !document.getElementById('profile-modal').classList.contains('hidden');
        UI.switchProfileView('settings');
        await new Promise(r => setTimeout(r, 200));
        const html = document.getElementById('profile-modal').innerHTML;
        return { opened, reset: html.includes('resetGame'), save: html.includes('saveGame') };
    });
    check('⑥ 프로필 팝업 열림', settings.opened);
    check('⑥ 설정 탭에 초기화(resetGame) 존재', settings.reset);
    check('⑥ 설정 탭에 수동 저장(saveGame) 존재', settings.save);

    // ③-b ?tab=debug 로는 디버그 탭이 보임
    // 첫 페이지를 닫고 연다 — WebGL 컨텍스트가 둘이면 swiftshader 부팅이 20초를 넘겨 오검출이 난다
    await page.close();
    const page2 = await browser.newPage({ viewport: { width: 499, height: 892 } });
    page2.on('console', m => { if (m.type() === 'error') errs.push('[debug] ' + m.text()); });
    page2.on('pageerror', e => errs.push('[debug] ' + String(e)));
    await page2.goto(URL0 + '?tab=debug');
    await page2.waitForFunction(() => window.UI && UI.els && UI.els.topbar, null, { timeout: 60000 });
    await page2.evaluate(() => { if (window.Scene3D) Scene3D.update = function () {}; });
    await page2.waitForTimeout(400);
    const dbgShown = await page2.evaluate(() => {
        const b = document.querySelector('#tabbar button[data-tab="debug"]');
        return b && getComputedStyle(b).display !== 'none' && document.getElementById('panel-debug').classList.contains('open');
    });
    check('③ ?tab=debug 로 디버그 탭 노출·패널 열림', dbgShown === true, String(dbgShown));

    // ⑦ 콘솔 에러
    check('⑦ 콘솔 에러 0건', errs.length === 0, errs.slice(0, 5).join(' / '));

    console.log(`\n합계: PASS ${pass} / FAIL ${fail}`);
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
