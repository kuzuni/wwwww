// 반복 퀘스트 검증 (사용자 지시 2026-08-18 `quest-tab` → `quest-day1to5-full`·`quest-fixed-repeat`)
//
// 판정 항목
//   ① 행동 풀 **전체**가 DEFS 순서 그대로 상시 노출되고 중복 id가 없다 (3슬롯 로테이션 폐기)
//   ② **날짜·요일·일차 개념이 코드에 없다** — 사용자 재확인 사양. quests.js 소스에 시계/날짜 API가
//      없어야 하고, 시스템 시각을 하루 앞으로 돌려도 퀘스트 목록·진행도가 그대로여야 한다
//   ③ 각 행동 훅이 진행도를 올린다 — 14종 전부 실제 행동을 일으켜 확인(정의만 있고 훅이 없는 행동 색출)
//   ④ 완료 전 [수령] 불가 · 완료 후 수령하면 보상 재화가 정확히 늘고 **같은 퀘스트가 제자리에서
//      진행도 0으로 반복**된다(재추첨 아님 — 펫합성 자리는 계속 펫합성)
//   ⑤ 진행도는 need에서 멈춘다(초과 누적 없음)
//   ⑥ 저장·재부팅을 넘어 유지된다
//   ⑦ 콘솔 에러 0건 · 시트 DOM이 전 항목 행을 그린다
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

    // ① 전 항목 고정 노출 · DEFS 순서 · 중복 없음 (만렙 아님 → 필터가 아무것도 안 걸러야 한다)
    const slots = await page.evaluate(() => {
        S.quests = []; S.questsCleared = 0; Quests.ensure();
        const l = Quests.list();
        return {
            n: l.length, defs: Quests.DEFS.length,
            ids: l.map(q => q.id), uniq: new Set(l.map(q => q.id)).size,
            inOrder: l.every((q, k) => q.id === Quests.DEFS[k].id),
        };
    });
    check('① 행동 풀 전체가 노출됨 (로테이션 폐기)', slots.n === slots.defs && slots.n >= 14, `${slots.n}/${slots.defs}개`);
    check('① DEFS 순서 고정 배치 · id 중복 없음', slots.inOrder && slots.uniq === slots.n, slots.ids.join('|'));

    // ③ 행동 훅 — 정의된 행동 전부를 실제 행동으로 하나씩 일으켜 진행도가 오르는지 본다.
    //    퀘스트 슬롯을 그 행동 하나로 강제 세팅한 뒤 행동을 일으키고 prog 를 읽는다.
    //    ⚠️ bump→ensure 가 목록을 DEFS 전체로 다시 깔므로 **prog 는 반드시 id 로 찾아 읽는다**
    //    (인덱스 0 은 항상 craft 가 돼 다른 행동의 판정이 통째로 헛돈다).
    const HOOKS = [
        ['craft', () => { S.hammers = 50; Forge.craft(2); }, 2],
        ['sellGear', () => { Forge.sell(Forge.rollItem()); }, 1],
        ['equipGear', () => { Forge.equip(Forge.rollItem()); }, 1],
        ['coinSpend', () => { S.coins = 1e9; S.forgeUpgradeEndsAt = null; Forge.startUpgrade(); }, null],
        ['upgradeStart', () => { S.coins = 1e9; S.forgeUpgradeEndsAt = null; Forge.startUpgrade(); }, 1],
        ['gearUpgrade', () => { S.forgeUpgradeEndsAt = 1; Forge.tickUpgrade(); }, 1],
        ['skillSummon', () => { S.tickets = 1e6; Skills.summon(false, 3); }, 3],
        ['techDone', () => { S.techResearch = { id: TechTree.BRANCHES[0].types[0] + '@1', endsAt: 1 }; TechTree.tick(); }, 1],
        ['petHatch', () => { S.hatching = [{ rarity: 'common', endsAt: 1 }]; Pets.tick(); }, 1],
        ['petMerge', () => {
            S.pets = [{ name: petStats.common[0].name, rarity: 'common', level: 1, dupes: 3, xp: 0, stars: 0, subs: [] }];
            S.eggs = []; Pets.merge('common');
        }, 1],
        ['mountSummon', () => { S.winders = 1e6; Mounts.summon(2); }, 2],
        ['mountMerge', () => {
            const a = mountNames.common[0], b = mountNames.common[1];
            S.mounts = {}; S.activeMounts = [];
            S.mounts[a] = { rarity: 'common', level: 1, xp: 0 };
            S.mounts[b] = { rarity: 'common', level: 1, xp: 0 };
            Mounts.absorbMaterials(a, [b]);
        }, 1],
        ['dungeonClear', () => {
            Dungeons.ensure();
            const id = Dungeons.DEFS[0].id;
            S.dungeons.keys[id] = 2;
            Dungeons.run = { id, stage: 1 };
            Dungeons.onClear();
        }, 1],
        // 열쇠 사용은 클리어·소탕 양쪽에서 세야 한다 — 여기서는 소탕 경로로 확인한다
        // (클리어 경로는 위 dungeonClear 트리거가 keySpend 도 같이 올리므로 별도 케이스가 겹친다)
        ['keySpend', () => {
            Dungeons.ensure();
            const id = Dungeons.DEFS[0].id;
            S.dungeons.best[id] = 1; S.dungeons.keys[id] = 2;
            Dungeons.sweep(id);
        }, 1],
    ];
    for (const [action, , expect] of HOOKS) {
        const r = await page.evaluate(({ action, body }) => {
            // 슬롯을 이 행동으로 채워 다른 행동이 섞여도 판정이 흐려지지 않게 한다
            const def = Quests.def(action);
            S.quests = [{ id: action, need: 1e9, prog: 0, rw: { cur: def.rw.cur, amt: 1 } }];
            S.questsCleared = 0;
            // eslint-disable-next-line no-new-func
            (new Function(body))();
            const q = S.quests.find(x => x.id === action);
            return { prog: q && q.prog, need: q && q.need };
        }, { action, body: '(' + HOOKS.find(h => h[0] === action)[1].toString() + ')()' });
        const ok = expect === null ? r.prog > 0 : r.prog === expect;
        check(`③ 훅 ${action} 진행도 상승`, ok, `prog=${r.prog}${expect === null ? ' (>0 기대)' : ` (기대 ${expect})`}`);
    }
    // 클리어 경로도 열쇠 1개로 세는지 (소탕과 이중 계산이 아니라 '열쇠가 나간 횟수'와 일치해야 한다)
    const keyClear = await page.evaluate(() => {
        const def = Quests.def('keySpend');
        S.quests = [{ id: 'keySpend', need: 1e9, prog: 0, rw: { cur: def.rw.cur, amt: 1 } }];
        Dungeons.ensure();
        const id = Dungeons.DEFS[0].id;
        S.dungeons.keys[id] = 2;
        Dungeons.run = { id, stage: 1 };
        Dungeons.onClear();
        const q = S.quests.find(x => x.id === 'keySpend');
        return q && q.prog;
    });
    check('③ 훅 keySpend — 클리어 소모분도 1로 셈', keyClear === 1, `prog=${keyClear}`);

    // ⑤ need 에서 멈춘다
    const cap = await page.evaluate(() => {
        S.quests = [{ id: 'craft', need: 2, prog: 0, rw: { cur: 'coins', amt: 10 } }];
        S.hammers = 50; Forge.craft(9);
        return S.quests.find(q => q.id === 'craft').prog;
    });
    check('⑤ 진행도가 need 를 넘지 않음', cap === 2, `prog=${cap}`);

    // ④ 수령: 완료 전 불가 → 완료 후 보상 지급 + **같은 퀘스트가 제자리 리셋**(재추첨 아님)
    const claim = await page.evaluate(() => {
        S.quests = []; S.questsCleared = 0; Quests.ensure();
        const i = S.quests.findIndex(q => q.id === 'craft');
        S.quests[i] = { id: 'craft', need: 1, prog: 0, rw: { cur: 'coins', amt: 777 } };
        const beforeClaimable = Quests.canClaim(i);
        S.hammers = 10; S.coins = 1000;
        Forge.craft(1);
        const afterClaimable = Quests.canClaim(i);
        const others = S.quests.filter(q => q.id !== 'craft').map(q => q.id + ':' + q.prog).join('|');
        const coins0 = S.coins;
        const got = Quests.claim(i);
        const q = S.quests[i];
        return {
            beforeClaimable, afterClaimable,
            coinDelta: S.coins - coins0, rewarded: got && got.amt,
            sameId: q && q.id === 'craft', newProg: q && q.prog,
            // tier 가 1 올랐으니 요구치는 def.need + def.step (10+3)
            newNeed: q && q.need, expectNeed: Quests.def('craft').need + Quests.def('craft').step,
            othersKept: others === S.quests.filter(x => x.id !== 'craft').map(x => x.id + ':' + x.prog).join('|'),
            cleared: S.questsCleared,
            noDupe: new Set(S.quests.map(x => x.id)).size === S.quests.length,
        };
    });
    check('④ 미완료 상태에서는 수령 불가', claim.beforeClaimable === false);
    check('④ 완료 후 수령 가능', claim.afterClaimable === true);
    check('④ 보상 재화가 정확히 지급됨', claim.coinDelta === 777 && claim.rewarded === 777, `+${claim.coinDelta}`);
    check('④ 같은 퀘스트가 제자리에서 진행도 0으로 반복 (재추첨 아님)', claim.sameId && claim.newProg === 0, `id=craft 유지, prog=${claim.newProg}`);
    check('④ 반복분 요구치는 tier 를 따라 상승', claim.newNeed === claim.expectNeed, `need=${claim.newNeed} (기대 ${claim.expectNeed})`);
    check('④ 다른 퀘스트는 그대로 유지', claim.othersKept);
    check('④ 반복 후에도 id 중복 없음', claim.noDupe);
    check('④ 누적 완료 수 +1', claim.cleared === 1, `cleared=${claim.cleared}`);

    // ② 시간을 하루 앞으로 돌려도 아무것도 리셋되지 않는다 (날짜 무관 사양의 동적 검증)
    const timeShift = await page.evaluate(() => {
        S.quests = []; S.questsCleared = 0; Quests.ensure();
        S.quests[0].prog = 4; S.quests[1].prog = 1;
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
        S.quests = []; S.questsCleared = 5; Quests.ensure();
        const i = S.quests.findIndex(q => q.id === 'craft');
        S.quests[i] = { id: 'craft', need: 42, prog: 7, rw: { cur: 'coins', amt: 123 } };
        saveGame();
    });
    await page.reload();
    await page.waitForFunction(() => window.UI && UI.els && UI.els.topbar, null, { timeout: 30000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () {}; Combat.tick = function () {}; });
    const persisted = await page.evaluate(() => {
        const l = Quests.list();
        return { n: l.length, defs: Quests.DEFS.length, craft: l.find(q => q.id === 'craft'), cleared: S.questsCleared };
    });
    check('⑥ 재부팅 후 진행도·요구치 유지',
        persisted.n === persisted.defs && persisted.craft && persisted.craft.prog === 7 && persisted.craft.need === 42 && persisted.cleared === 5,
        JSON.stringify(persisted.craft) + ` n=${persisted.n} cleared=${persisted.cleared}`);

    // ⑦ 시트 DOM — 탭으로 열어 전 항목 행 + 진행바 + 수령 버튼
    const dom = await page.evaluate(async () => {
        UI.closeOpened();
        document.querySelector('#tabbar button[data-tab="quest"]').click();
        await new Promise(r => setTimeout(r, 250));
        const m = document.getElementById('quest-modal');
        const rows = [...m.querySelectorAll('.qst-row')];
        const w = m.querySelector('.qst-row') ? m.querySelector('.qst-row').getBoundingClientRect().width : 0;
        return {
            open: !m.classList.contains('hidden'),
            defs: Quests.DEFS.length,
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
    check('⑦ 퀘스트 시트가 전 항목 행 · 진행바 · 수령 버튼 · 아이콘을 그림',
        dom.open && dom.rows === dom.defs && dom.bars === dom.defs && dom.btns === dom.defs && dom.icons === dom.defs && dom.title === '퀘스트',
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
