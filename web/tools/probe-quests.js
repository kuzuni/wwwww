// 반복 퀘스트 검증 (사용자 지시 2026-08-18 `quest-tab`)
//
// 판정 항목
//   ① 항상 3개가 떠 있고 서로 중복 id가 없다
//   ② **날짜·요일·일차 개념이 코드에 없다** — 사용자 재확인 사양. quests.js 소스에 시계/날짜 API가
//      없어야 하고, 시스템 시각을 하루 앞으로 돌려도 퀘스트 목록·진행도가 그대로여야 한다
//   ③ 각 행동 훅이 진행도를 올린다 — 11종 전부 실제 행동을 일으켜 확인(정의만 있고 훅이 없는 행동 색출)
//   ④ 완료 전 [수령] 불가 · 완료 후 수령하면 보상 재화가 정확히 늘고 **그 자리만** 새 퀘스트로 교체
//   ⑤ 진행도는 need에서 멈춘다(초과 누적 없음)
//   ⑥ 저장·재부팅을 넘어 유지된다
//   ⑦ 콘솔 에러 0건 · 시트 DOM이 3행을 그린다
//
// 사용: node tools/probe-quests.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const URL0 = 'file://' + path.resolve(__dirname, '..', 'index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errs = [];
    let pass = 0, fail = 0;
    const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };

    // ② 소스 정적 검사 — 날짜/시계 API가 한 개라도 있으면 사양 위반이다.
    //    ⚠️ 주석은 반드시 걷어내고 본다: quests.js 머리말이 '날짜 개념을 넣지 말라'는 사양과
    //    '`resetDateKey()`를 쓰면 위반'이라는 경고를 그대로 적고 있어, 원문을 그냥 스캔하면
    //    **금지어를 설명하는 문장이 위반으로 잡힌다**(첫 실행에서 실제로 그렇게 오검출했다).
    const raw = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'quests.js'), 'utf8');
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    const dateHits = (src.match(/new Date|Date\.now|getDay|getDate|toDateString|resetDateKey|endsAt|U\.now/g) || []);
    check('② quests.js 코드에 날짜·시계 API 없음(주석 제외)', dateHits.length === 0, dateHits.join(',') || '없음');
    check('② 코드에 일차/요일 문구 없음(주석 제외)', !/일차|요일|오늘|Day\s*\d/.test(src));

    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(URL0);
    await page.waitForFunction(() => window.UI && UI.els && UI.els.topbar, null, { timeout: 30000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () {}; Combat.tick = function () {}; });
    await page.waitForTimeout(300);

    // ① 슬롯 3개 · 중복 없음
    const slots = await page.evaluate(() => {
        const l = Quests.list();
        return { n: l.length, ids: l.map(q => q.id), uniq: new Set(l.map(q => q.id)).size };
    });
    check('① 퀘스트 3개 · id 중복 없음', slots.n === 3 && slots.uniq === 3, slots.ids.join('|'));

    // ③ 행동 훅 — 정의된 11종을 실제 행동으로 하나씩 일으켜 진행도가 오르는지 본다.
    //    퀘스트 슬롯을 그 행동 하나로 강제 세팅한 뒤 행동을 일으키고 prog 를 읽는다.
    const HOOKS = [
        ['craft', () => { S.hammers = 50; Forge.craft(2); }, 2],
        ['sellGear', () => { Forge.sell(Forge.rollItem()); }, 1],
        ['equipGear', () => { Forge.equip(Forge.rollItem()); }, 1],
        ['coinSpend', () => { S.coins = 1e9; S.forgeUpgradeEndsAt = null; Forge.startUpgrade(); }, null],
        ['gearUpgrade', () => { S.forgeUpgradeEndsAt = 1; Forge.tickUpgrade(); }, 1],
        ['skillSummon', () => { S.tickets = 1e6; Skills.summon(false, 3); }, 3],
        ['techDone', () => { S.techResearch = { id: TechTree.BRANCHES[0].types[0] + '@1', endsAt: 1 }; TechTree.tick(); }, 1],
        ['petHatch', () => { S.hatching = [{ rarity: 'common', endsAt: 1 }]; Pets.tick(); }, 1],
        ['petMerge', () => {
            S.pets = [{ name: petStats.common[0].name, rarity: 'common', level: 1, dupes: 3, xp: 0, stars: 0, subs: [] }];
            S.eggs = []; Pets.merge('common');
        }, 1],
        ['mountSummon', () => { S.winders = 1e6; Mounts.summon(2); }, 2],
        ['dungeonClear', () => {
            Dungeons.ensure();
            const id = Dungeons.DEFS[0].id;
            S.dungeons.keys[id] = 2;
            Dungeons.run = { id, stage: 1 };
            Dungeons.onClear();
        }, 1],
    ];
    for (const [action, , expect] of HOOKS) {
        const r = await page.evaluate(({ action, body }) => {
            // 슬롯 전부를 이 행동으로 채워 다른 행동이 섞여도 판정이 흐려지지 않게 한다
            const def = Quests.def(action);
            S.quests = [{ id: action, need: 1e9, prog: 0, rw: { cur: def.rw.cur, amt: 1 } }];
            S.questsCleared = 0;
            // eslint-disable-next-line no-new-func
            (new Function(body))();
            return { prog: S.quests[0] && S.quests[0].prog, need: S.quests[0] && S.quests[0].need };
        }, { action, body: '(' + HOOKS.find(h => h[0] === action)[1].toString() + ')()' });
        const ok = expect === null ? r.prog > 0 : r.prog === expect;
        check(`③ 훅 ${action} 진행도 상승`, ok, `prog=${r.prog}${expect === null ? ' (>0 기대)' : ` (기대 ${expect})`}`);
    }

    // ⑤ need 에서 멈춘다
    const cap = await page.evaluate(() => {
        S.quests = [{ id: 'craft', need: 2, prog: 0, rw: { cur: 'coins', amt: 10 } }];
        S.hammers = 50; Forge.craft(9);
        return S.quests[0].prog;
    });
    check('⑤ 진행도가 need 를 넘지 않음', cap === 2, `prog=${cap}`);

    // ④ 수령: 완료 전 불가 → 완료 후 보상 지급 + 그 슬롯만 교체
    const claim = await page.evaluate(() => {
        S.quests = [
            { id: 'craft', need: 1, prog: 0, rw: { cur: 'coins', amt: 777 } },
            { id: 'sellGear', need: 5, prog: 2, rw: { cur: 'hammers', amt: 3 } },
            { id: 'mountSummon', need: 5, prog: 1, rw: { cur: 'winders', amt: 9 } },
        ];
        S.questsCleared = 0;
        const beforeClaimable = Quests.canClaim(0);
        S.hammers = 10; S.coins = 1000;
        Forge.craft(1);
        const afterClaimable = Quests.canClaim(0);
        const others = [JSON.stringify(S.quests[1]), JSON.stringify(S.quests[2])];
        const coins0 = S.coins;
        const got = Quests.claim(0);
        return {
            beforeClaimable, afterClaimable,
            coinDelta: S.coins - coins0, rewarded: got && got.amt,
            replaced: S.quests[0].id !== 'craft' || S.quests[0].prog === 0,
            newProg: S.quests[0].prog, newId: S.quests[0].id,
            othersKept: others[0] === JSON.stringify(S.quests[1]) && others[1] === JSON.stringify(S.quests[2]),
            cleared: S.questsCleared,
            noDupe: new Set(S.quests.map(q => q.id)).size === 3,
        };
    });
    check('④ 미완료 상태에서는 수령 불가', claim.beforeClaimable === false);
    check('④ 완료 후 수령 가능', claim.afterClaimable === true);
    check('④ 보상 재화가 정확히 지급됨', claim.coinDelta === 777 && claim.rewarded === 777, `+${claim.coinDelta}`);
    check('④ 수령한 슬롯만 새 퀘스트로 교체 (진행도 0)', claim.replaced && claim.newProg === 0, `새 퀘스트=${claim.newId}`);
    check('④ 다른 슬롯은 그대로 유지', claim.othersKept);
    check('④ 교체 후에도 id 중복 없음', claim.noDupe);
    check('④ 누적 완료 수 +1', claim.cleared === 1, `cleared=${claim.cleared}`);

    // ② 시간을 하루 앞으로 돌려도 아무것도 리셋되지 않는다 (날짜 무관 사양의 동적 검증)
    const timeShift = await page.evaluate(() => {
        S.quests = [{ id: 'craft', need: 9, prog: 4, rw: { cur: 'coins', amt: 50 } },
                    { id: 'sellGear', need: 9, prog: 1, rw: { cur: 'hammers', amt: 5 } },
                    { id: 'petHatch', need: 9, prog: 0, rw: { cur: 'eggCurrency', amt: 5 } }];
        const before = JSON.stringify(S.quests);
        const realNow = U.now;
        U.now = () => realNow() + 26 * 3600 * 1000;   // +26시간
        Quests.ensure(); Quests.list();
        const after = JSON.stringify(S.quests);
        U.now = realNow;
        return { same: before === after, before, after };
    });
    check('② 시각을 +26h 해도 퀘스트·진행도 불변', timeShift.same, timeShift.same ? '' : `${timeShift.before} → ${timeShift.after}`);

    // ⑥ 저장 → 재부팅 유지
    await page.evaluate(() => {
        S.quests = [{ id: 'craft', need: 42, prog: 7, rw: { cur: 'coins', amt: 123 } },
                    { id: 'sellGear', need: 9, prog: 2, rw: { cur: 'hammers', amt: 4 } },
                    { id: 'mountSummon', need: 9, prog: 3, rw: { cur: 'winders', amt: 30 } }];
        S.questsCleared = 5;
        saveGame();
    });
    await page.reload();
    await page.waitForFunction(() => window.UI && UI.els && UI.els.topbar, null, { timeout: 30000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () {}; Combat.tick = function () {}; });
    const persisted = await page.evaluate(() => {
        const l = Quests.list();
        return { n: l.length, first: l[0], cleared: S.questsCleared };
    });
    check('⑥ 재부팅 후 진행도·요구치 유지',
        persisted.n === 3 && persisted.first.id === 'craft' && persisted.first.prog === 7 && persisted.first.need === 42 && persisted.cleared === 5,
        JSON.stringify(persisted.first) + ` cleared=${persisted.cleared}`);

    // ⑦ 시트 DOM — 탭으로 열어 3행 + 진행바 + 수령 버튼
    const dom = await page.evaluate(async () => {
        UI.closeOpened();
        document.querySelector('#tabbar button[data-tab="quest"]').click();
        await new Promise(r => setTimeout(r, 250));
        const m = document.getElementById('quest-modal');
        const rows = [...m.querySelectorAll('.qst-row')];
        const w = m.querySelector('.qst-row') ? m.querySelector('.qst-row').getBoundingClientRect().width : 0;
        return {
            open: !m.classList.contains('hidden'),
            rows: rows.length,
            bars: m.querySelectorAll('.qst-bar i').length,
            btns: m.querySelectorAll('.qst-right .btn').length,
            icons: m.querySelectorAll('.qst-icon .ico').length,
            title: (m.querySelector('.sheet-title') || {}).textContent,
            noDateWord: !/일차|요일|오늘|남은 시간/.test(m.innerText),
            // 폭은 **시트 카드 기준**으로 잰다 — 던전 배너의 77.6%W 도 카드 기준 수치다
            // (뷰포트 기준으로 재면 54%가 나와 멀쩡한 값을 어긋난 것으로 오판한다).
            rowW: +(w / m.querySelector('.modal-card').getBoundingClientRect().width * 100).toFixed(2),
            overflow: rows.some(r => r.scrollWidth > r.clientWidth + 1),
        };
    });
    // 같은 페이지에서 던전 배너 폭을 재서 '두 시트의 카드 폭이 실제로 같은가'를 직접 견준다
    const dgW = await page.evaluate(async () => {
        UI.closeOpened(); UI.openDungeons();
        await new Promise(r => setTimeout(r, 200));
        const el = document.querySelector('.dg-banner');
        const w = el.getBoundingClientRect().width;
        const cw = document.querySelector('#dungeon-modal .modal-card').getBoundingClientRect().width;
        UI.closeDungeons();
        return { pct: +(w / cw * 100).toFixed(2), px: +w.toFixed(1) };
    });
    check('⑦ 퀘스트 시트 3행 · 진행바 · 수령 버튼 · 아이콘',
        dom.open && dom.rows === 3 && dom.bars === 3 && dom.btns === 3 && dom.icons === 3 && dom.title === '퀘스트',
        JSON.stringify(dom));
    check('⑦ 화면 문구에 날짜·일차 표기 없음', dom.noDateWord);
    check('⑦ 행 가로 넘침 없음 · 폭 = 던전 배너와 같은 77.6%W±2 (카드 기준)',
        !dom.overflow && Math.abs(dom.rowW - 77.6) <= 2 && Math.abs(dom.rowW - dgW.pct) <= 0.5,
        `퀘스트 ${dom.rowW}%W · 던전 ${dgW.pct}%W(${dgW.px}px)`);

    check('⑦ 콘솔 에러 0건', errs.length === 0, errs.slice(0, 4).join(' / '));
    console.log(`\n합계: PASS ${pass} / FAIL ${fail}`);
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
