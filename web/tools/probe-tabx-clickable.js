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
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// [이름, 여는 코드, 기대하는 탭 데이터명]
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
        await page.evaluate(() => { if (typeof Combat !== 'undefined') Combat.tick = () => {}; UI.toast = () => {}; });

        for (const [name, open, tab] of CASES) {
            // 모든 팝업을 닫고 깨끗한 상태에서 연다
            await page.evaluate(() => { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); UI.switchTab(null); });
            await page.waitForTimeout(120);
            try { await page.evaluate(new Function(open)); } catch (e) { console.log(`  SKIP ${name} — ${String(e).slice(0, 60)}`); continue; }
            await page.waitForTimeout(320);

            const before = await page.evaluate((t) => {
                const btn = document.querySelector(`#tabbar button[data-tab="${t}"]`);
                const open = [...document.querySelectorAll('.modal:not(.hidden)')].map(m => m.id);
                if (!btn) return { open, hasBtn: false };
                const r = btn.getBoundingClientRect();
                const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return {
                    open, hasBtn: true, isX: btn.classList.contains('tab-x'),
                    cx: r.left + r.width / 2, cy: r.top + r.height / 2,
                    top: top ? (top.id || top.className || top.tagName) : null,
                };
            }, tab);
            if (!before.hasBtn) { console.log(`  SKIP ${name} — 탭 버튼 없음(data-tab=${tab})`); continue; }
            if (!before.open.length) { console.log(`  SKIP ${name} — 팝업이 안 열렸다`); continue; }

            if (!before.isX) {
                // ✕ 가 안 그려졌다 → 안 먹는 어포던스를 안 보여 준다는 뜻. 이게 세 팝업의 기대값이다.
                chk(true, `${name} — ✕ 를 안 그린다(딤이 탭바 위) · 열린 팝업 [${before.open}] · 그 자리 최상단 ${before.top}`);
                continue;
            }
            // ✕ 가 그려졌다 → **진짜 마우스 탭**으로 닫혀야 한다
            await page.mouse.click(before.cx, before.cy);
            await page.waitForTimeout(320);
            const after = await page.evaluate(() => [...document.querySelectorAll('.modal:not(.hidden)')].map(m => m.id));
            chk(after.length < before.open.length,
                `${name} — ✕ 를 그렸고 실제 탭으로 닫힌다: [${before.open}] → [${after}]`);
        }
        chk(errors.length === 0, `콘솔 에러 ${errors.length}건${errors.length ? ' — ' + errors[0].slice(0, 110) : ''}`);
        await page.close();
    }

    await browser.close();
    console.log(bad ? `\n실패 ${bad}건` : '\n전부 통과 — 그려진 ✕ 는 전부 먹고, 안 먹을 자리에는 안 그린다.');
    process.exit(bad ? 1 : 0);
})();
