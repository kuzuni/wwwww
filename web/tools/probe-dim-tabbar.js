// 팝업이 열렸을 때 탭바가 딤에 덮이는지 — **원본과 같은 갈래로** 갈리는지 본다. (slug: modal-dim-tabbar)
//
// 원본을 전수 실측하면 팝업이 두 부류다(y=862 픽셀):
//   ⓐ 탭 화면  — 탭바가 그대로 보인다(`#0e111b`). 메인·던전 목록·상점·리그 목록·제작 비교·장비 상세·소환 시트
//   ⓑ 진짜 팝업 — 탭바까지 새까맣다(`#000000`~`#010203`).
//
// 🚨 **ⓐ 를 같이 덮으면 게임이 갇힌다.** 그 화면들은 **탭바의 빨간 ✕ 가 유일한 닫기 어포던스**다
//    (`probe-popup-close.js` 가 상점·던전 목록·채팅·탈것·제작 비교 6개를 '탭바 ✕' 로 확인해 준다).
//    그래서 이 프로브는 '덮였나'가 아니라 **'원본과 같은 쪽으로 갈렸나'** 를 판정한다.
//
// 사용: node probe-dim-tabbar.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 원본 실측 결과 — true = 탭바가 딤에 덮인다(ⓑ), false = 탭바가 보인다(ⓐ)
const EXPECT = {
    main: false, dungeons: false, shop: false, 'craft-compare': false, 'gear-detail': false,
    skills: false, pets: false, 'pets-2': false, 'tech-overview': false, 'tech-branch': false,
    league: false,
    offline: true, 'league-rewards': true, 'league-challenge': true, 'dungeon-detail': true,
    'skill-detail': true, 'pet-detail': true, 'pet-upgrade': true, 'summon-rates': true,
    'tech-node': true, pass: true, profile: true, settings: true, 'forge-info': true,
    'forge-list': true, 'forge-detail': true, autoforge: true, 'autoforge-filter': true,
    'player-info': true,
};

const SRC = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
const SCREENS = [...SRC.matchAll(/^\s*\['([\w-]+)',\s*(?:'[\d]+'|null),\s*(`[^`]*`|[A-Z_][\w]*)\],/gm)].map(m => {
    const raw = m[2];
    if (raw[0] === '`') return [m[1], raw.slice(1, -1)];
    const req = SRC.match(new RegExp(`const\\s*\\{[^}]*\\b${raw}\\b[^}]*\\}\\s*=\\s*require\\('([^']+)'\\)`));
    const val = req && require(req[1])[raw];
    if (typeof val !== 'string') throw new Error(`오프너 상수 ${raw} 를 못 풀었다`);
    return [m[1], val];
});

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 497, height: 897 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 150000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; });
    await page.evaluate(() => {
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => {}; UI.resolvePendingCraft = () => {}; UI.autoSeqStep = () => {};
    });
    const seedAt = SRC.indexOf('const SEED = () => {');
    await page.evaluate(s => { try { eval('(' + s + ')()'); } catch (e) {} },
        SRC.slice(seedAt + 'const SEED = '.length, SRC.indexOf('\n};', seedAt) + 2));

    const rows = [];
    for (const [name, opener] of SCREENS) {
        if (!(name in EXPECT)) continue;               // 원본 실측이 없는 화면은 판정하지 않는다
        const r = await page.evaluate((src) => {
            try {
                UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();
                UI.closeDetail && UI.closeDetail();
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                eval(src);
            } catch (e) { return { err: e.message }; }
            const tb = document.getElementById('tabbar');
            const tr = tb.getBoundingClientRect();
            const cx = tr.left + tr.width * 0.5, cy = tr.top + tr.height * 0.5;
            // 탭바 한가운데에서 가장 위에 있는 요소가 탭바(또는 그 자식)면 안 덮인 것,
            // 모달이면 덮인 것 — 픽셀이 아니라 **적중 판정**으로 본다(딤 색은 별도 항목 소관).
            const top = document.elementFromPoint(cx, cy);
            const modal = top && top.closest && top.closest('.modal');
            const openIds = [...document.querySelectorAll('.modal')]
                .filter(m => !m.classList.contains('hidden')).map(m => m.id);
            return { covered: !!modal, by: modal ? modal.id : (top ? (top.id || top.className) : null), openIds };
        }, opener);
        await page.waitForTimeout(120);
        if (r.err) { errs.push(`[${name}] ${r.err}`); continue; }
        rows.push([name, r]);
    }

    const bad = [];
    for (const [name, r] of rows) {
        const want = EXPECT[name];
        const ok = r.covered === want;
        console.log(`  ${ok ? 'OK ' : 'X  '} ${name.padEnd(18)} 탭바 덮임=${String(r.covered).padEnd(5)} (원본 ${want})  ${r.covered ? '← ' + r.by : ''}`);
        if (!ok) bad.push(`${name}: 탭바 덮임 ${r.covered} 인데 원본은 ${want}`);
    }
    console.log(`\n  판정한 화면 ${rows.length}개 (원본 실측이 있는 것만)`);
    if (rows.length < 20) bad.push(`판정한 화면이 ${rows.length}개뿐이다 — 오프너 목록이 갈라졌다`);
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));

    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ')
        : `\nPASS — ${rows.length}개 화면이 전부 원본과 같은 쪽으로 갈렸다 · 콘솔 에러 0건`);
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
