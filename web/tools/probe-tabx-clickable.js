// 탭바의 빨간 ✕ 가 **그려졌으면 실제로 먹는가** (slug: tabx-dead-under-dim)
//
// 종전 결함: `modal-dim-tabbar` 가 '진짜 팝업'을 `z-index:40` 으로 올렸는데 `#tabbar` 는 30 이라,
//   그 계열과 `UI.MODAL_TAB` 이 겹치는 셋(던전 상세·진행 패스·펫 업그레이드)에서 ✕ 가 딤 아래
//   깔렸다. **그림은 멀쩡히 보이는데 안 먹는 버튼**이 됐다.
//
// 🚨 **기존 검증기가 왜 못 잡았나 — 이 자가 필요한 이유다.**
//   · `probe-dim-tabbar.js` 는 '딤이 탭바를 덮는가'만 본다(덮는 게 기대값이라 PASS).
//   · `probe-popup-close.js` 는 '닫는 길이 하나라도 있는가'만 본다(셋 다 자체 ✕ 가 있어 PASS).
//   즉 **'화면에 그려진 어포던스가 실제로 먹는가'** 를 보는 검사가 없었다. 이 자가 그걸 본다.
//
// 판정: 팝업을 연 뒤 탭바를 보고 — ⓐ ✕ 가 그려졌으면 **진짜 마우스 탭**(page.mouse.click,
//   신뢰 이벤트)으로 팝업이 닫혀야 한다 ⓑ 닫을 수 없는 자리면 ✕ 가 **아예 안 그려져야** 한다.
//   열린 모달 목록(`.modal:not(.hidden)` id 배열)을 탭 전후로 비교해 판정한다.
//
// 사용: node probe-tabx-clickable.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// [이름, 여는 코드, 기대하는 탭 데이터명 — null 이면 '✕ 가 붙은 탭'을 화면에서 찾아 쓴다]
const CASES = [
    // ⚠️ 던전 id 는 **문자열**('hammer' 등)이다 — 숫자를 넣으면 `Dungeons.def(id)` 가 undefined 를
    //    돌려주고 `unlocked` 가 그 자리에서 던진다. 해금 조건(2-10)도 미리 넘겨 둬야 팝업이 열린다.
    ['던전 상세',   `UI.switchTab(null); Dungeons.ensure();
                     S.bestChapter = 9; S.bestStage = 10; S.chapter = 9; S.stage = 10;
                     UI.openDungeons(); UI.openDungeonDetail('hammer');`,                                 'dungeon'],
    ['진행 패스',   `UI.switchTab(null); UI.openPass();`,                                                 'pvp'],
    ['펫 업그레이드', `UI.switchTab('summon'); UI.switchSummonSub('pets');
                     S.pets = [{name:'달팽이',rarity:'common',level:1,xp:0,stars:0,subs:[]}];
                     S.activePets = []; UI.openPetUpgrade(0);`,                                           'summon'],
    // 대조군 — 종전부터 정상이던 것들. 여기서 ✕ 가 먹는 게 이 항목의 기준선이다.
    ['상점(대조군)',      `UI.switchTab(null); UI.openShop();`,      'shop'],
    ['던전 목록(대조군)', `UI.switchTab(null); UI.openDungeons();`,  'dungeon'],
    ['퀘스트(대조군)',    `UI.switchTab(null); UI.openQuests();`,    'quest'],
    ['리그 목록(대조군)', `UI.switchTab(null); UI.openLeague();`,    'pvp'],
];

// ── 전수 census — 위 7개는 '이 항목의 세 팝업 + 대조군'을 못 박은 것이고, 여기서 **화면 전체**를 쓸어
//    같은 계약을 건다. 손으로 고른 목록만 보면 새 팝업이 조용히 빠진다: 실제로 이 census 가
//    **`league-rewards`·`league-challenge` 두 건을 더 찾아냈다** — `#league-modal` 은 한 요소가
//    `.dim-tabbar` 토글로 두 얼굴이라(목록 z20 / 보상·도전 z40) id 만 보면 안 보이는 사례다.
//    (둘 다 계산된 z 를 읽는 이번 수정으로 이미 함께 고쳐졌다. 여기 있는 건 회귀 방지용이다.)
// 🚨 **오프너를 정규식으로 한 줄씩 긁지 말 것.** 이 저장소의 다른 프로브들이 쓰는
//    `/\['(\w+)', '\d+', (`…`|CONST)\],/` 형태는 `PETS_STATE_SRC + \`…\`` 같은 **연결식 오프너를
//    조용히 건너뛴다** — 그래서 `pet-detail`·`pet-upgrade` 두 화면이 `probe-popup-close.js`·
//    `probe-dim-tabbar.js` 의 검사에서 통째로 빠져 있었다(이 항목의 세 팝업 중 하나가 `pet-upgrade` 다).
//    배열 소스를 그대로 평가하고, ⓧ 로 **줄 수와 항목 수가 맞는지 단언**해 다음에 형태가 바뀌어도
//    조용히 빠지지 않게 한다.
const { PETS_STATE_SRC } = require('./shot-pets.js');
const SRC = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
const CENSUS = (() => {
    const at = SRC.indexOf('const SCREENS = [');
    if (at < 0) throw new Error('shot-screens.js 에서 SCREENS 배열을 못 찾았다');
    const arr = SRC.slice(at + 'const SCREENS = '.length, SRC.indexOf('\n];', at) + 3);
    void PETS_STATE_SRC;                                   // eval 안에서 참조된다
    const rows = eval(arr);                                // eslint-disable-line no-eval
    const lines = (arr.match(/^\s*\['/gm) || []).length;   // ⓧ 항목 수 대조
    if (rows.length !== lines) throw new Error(`화면이 조용히 빠졌다 — 줄 ${lines}개 vs 항목 ${rows.length}개`);
    return rows.map(r => [`census:${r[0]}`, `UI.switchTab(null); ${r[2]}`, null]);
})();
CASES.push(...CENSUS);
// census 가 실제로 열어야 하는 팝업 — 하나라도 못 열면 검사가 조용히 빈 채로 통과한다.
const MUST_COVER = ['dungeon-modal', 'dungeon-detail-modal', 'shop-modal', 'quest-modal',
    'league-modal', 'pass-modal', 'pet-upgrade-modal'];
const seen = new Set();
// SEED 는 shot-screens.js 것을 그대로 쓴다 — 상점·대장간 목록 오프너가 이 상태에 기댄다.
const SEED_SRC = (() => {
    const at = SRC.indexOf('const SEED = () => {');
    return SRC.slice(at + 'const SEED = '.length, SRC.indexOf('\n};', at) + 2);
})();

let bad = 0;
const chk = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });

    for (const [w, h] of [[390, 844], [360, 640]]) {
        console.log(`\n===== 뷰포트 ${w}×${h} =====`);
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && document.getElementById('tabbar'), null, { timeout: 20000 });
        await page.evaluate(() => {
            if (typeof Combat !== 'undefined') Combat.tick = () => {};
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            UI.toast = () => {};
            // census 오프너 중 `craft-compare` 가 `_realShowCraftModal` 에 기댄다(shot-screens.js 와 같은 계약).
            UI._realShowCraftModal = UI.showCraftModal;
            UI.showCraftModal = () => {}; UI.resolvePendingCraft = () => {}; UI.autoSeqStep = () => {};
        });
        await page.evaluate(s => { try { eval('(' + s + ')()'); } catch (e) {} }, SEED_SRC);

        for (const [name, open, tab] of CASES) {
            // 모든 팝업을 닫고 깨끗한 상태에서 연다
            await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); UI.switchTab(null); });
            await page.waitForTimeout(120);
            try { await page.evaluate(new Function(open)); } catch (e) { console.log(`  SKIP ${name} — ${String(e).slice(0, 60)}`); continue; }
            await page.waitForTimeout(320);

            const before = await page.evaluate((t) => {
                // t 가 null(census)이면 **✕ 가 실제로 붙은 탭**을 찾는다 — 화면마다 소유 탭이 다르고,
                // 하단 시트(소환)처럼 팝업 없이 ✕ 만 뜨는 경우도 있어 기대값을 손으로 못 적는다.
                const xb = document.querySelector('#tabbar button.tab-x');
                const btn = t ? document.querySelector(`#tabbar button[data-tab="${t}"]`)
                    : (xb || document.querySelector('#tabbar button'));
                const mods = [...document.querySelectorAll('.modal:not(.hidden)')];
                const open = mods.map(m => m.id);
                if (!btn) return { open, hasBtn: false };
                // ✕ 가 없는 이유를 갈라 적기 위한 실측 — 딤이 탭바 위라서인가, 그냥 소유 탭이 없어서인가.
                const zi = el => { const v = parseInt(getComputedStyle(el).zIndex, 10); return Number.isNaN(v) ? 0 : v; };
                const zBar = zi(document.getElementById('tabbar'));
                const covered = mods.some(m => zi(m) > zBar);
                const r = btn.getBoundingClientRect();
                const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return {
                    open, hasBtn: true, covered, isX: btn.classList.contains('tab-x'),
                    cx: r.left + r.width / 2, cy: r.top + r.height / 2,
                    top: top ? (top.id || top.className || top.tagName) : null,
                };
            }, tab);
            if (!before.hasBtn) { console.log(`  SKIP ${name} — 탭 버튼 없음(data-tab=${tab})`); continue; }
            before.open.forEach(id => seen.add(id));
            // census 는 팝업 없이 ✕ 만 뜨는 하단 시트(소환·디버그)도 대상이다 — ✕ 가 있으면 검사한다.
            if (!before.open.length && !(tab === null && before.isX)) {
                console.log(`  SKIP ${name} — 팝업이 안 열렸다`); continue;
            }

            if (!before.isX) {
                // ✕ 가 안 그려졌다 → 안 먹는 어포던스를 안 보여 준다는 뜻. 이게 세 팝업의 기대값이다.
                chk(true, `${name} — ✕ 를 안 그린다(${before.covered ? '딤이 탭바 위' : '소유 탭 없음 · 딤 아래'})`
                    + ` · 열린 팝업 [${before.open}] · 그 자리 최상단 ${before.top}`);
                continue;
            }
            // ✕ 가 그려졌다 → **진짜 마우스 탭**으로 닫혀야 한다
            await page.mouse.click(before.cx, before.cy);
            await page.waitForTimeout(320);
            const after = await page.evaluate(() => ({
                open: [...document.querySelectorAll('.modal:not(.hidden)')].map(m => m.id),
                stillX: !!document.querySelector('#tabbar button.tab-x'),
            }));
            // ✕ 는 팝업뿐 아니라 **하단 시트**(소환·디버그)도 닫는데 시트는 `.modal` 이 아니다 —
            // 모달 수만 보면 시트 화면이 전부 거짓 실패한다. ✕ 어포던스가 사라진 것도 닫힌 증거다.
            chk(after.open.length < before.open.length || !after.stillX,
                `${name} — ✕ 를 그렸고 실제 탭으로 닫힌다: [${before.open}] → [${after.open}]`);
        }
        chk(errors.length === 0, `콘솔 에러 ${errors.length}건${errors.length ? ' — ' + errors[0].slice(0, 110) : ''}`);
        await page.close();
    }

    await browser.close();
    const missed = MUST_COVER.filter(id => !seen.has(id));
    chk(!missed.length, `census 가 MODAL_TAB 팝업을 전부 열었다${missed.length ? ' — 못 연 것: ' + missed.join(', ') : ''}`);
    console.log(bad ? `\n실패 ${bad}건` : `\n전부 통과 — 그려진 ✕ 는 전부 먹고, 안 먹을 자리에는 안 그린다 (고정 ${CASES.length - CENSUS.length}건 + census ${CENSUS.length}화면 × 뷰포트 2종).`);
    process.exit(bad ? 1 : 0);
})();
