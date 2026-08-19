// 손상 세이브를 물려도 게임이 **부팅을 완주하는가** — QA 18차가 등재한 세이브 함정들의 회귀 가드.
//
// 왜 필요한가: 이 결함들은 전부 "값 하나가 표에 없다" 수준인데 **화면 절반이 사라지거나 전투가
//   시작조차 안 되는** 데까지 번진다. 게다가 콘솔이 조용한 경우가 있어(코인 NaN) 눈으로는 못 본다.
//
// 재는 것(각 사례는 세이브를 심고 부팅한 뒤 화면·상태를 실측한다):
//  ① save-bad-age-kills-ui — 장착 장비의 `age` 가 `AGE_COLORS` 에 없다
//     → 장비 시트(.equip-cell 9칸)와 모루가 **그대로 있어야** 한다(종전엔 0칸으로 증발했다).
//  ② save-item-no-subs-kills-boot — 장착 장비에 `subs` 키가 아예 없다
//     → `Combat.start()` 가 끊기지 않아야 한다: 적 ≥1마리 · 스테이지 라벨이 비어 있지 않음.
//     ⚠️ ① 과 **별건**이다(등재 실측): age 만 이상하면 UI 가 죽고 전투는 살고, subs 만 없으면
//        UI 는 살고 전투가 죽는다. 한쪽만 고치면 다른 쪽이 그대로 남으므로 둘 다 잰다.
//  ③ state-stage-forge-no-upper-clamp — `stage`/`bestStage`/`forgeLevel` 이 상한을 한참 넘는다
//     → 클램프돼야 한다(스테이지 ≤ 10 · 대장간 ≤ `Forge.MAX_LEVEL`). 안 깎이면 라벨이
//       "어려움 3-99999" 로 찍히고 **패스 16종·던전 4종이 통째로 해금**된 채 남는다
//       (절대 진행도 보정이 위로만 움직이는 단방향이라 스스로는 절대 안 내려온다).
//  ④ 대조군 — 성한 세이브도 같은 잣대로 통과하는가(자가 헐거워서 나는 공짜 PASS 방지).
//
// ⚠️ **세이브는 `addInitScript` 로 심는다** — `goto` 뒤에 심고 `reload()` 하면 **떠나는 페이지의
//    자동 저장이 덮어써서** 심은 값이 사라진다(TODO 1034행 항목이 남긴 계측 함정 ⓐ 와 같은 자리).
// ⚠️ 부팅 완주는 `waitBootDone` 으로 기다린다 — `UI`·`S` 만 보면 셰이더 워밍업 전에 재게 된다.
//
// 사용: node probe-save-corrupt-boot.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const KEY = 'forgeclone_save_v1';

const GOOD_ITEM = { name: '헌 검', slot: 'weapon', age: 'primitive', ageIdx: 0, rarity: 'common', level: 1, main: 'atk', value: 10, subs: [] };

const CASES = [
    {
        id: '① 시대 키가 표에 없다 (save-bad-age-kills-ui)',
        save: { version: 1, equipment: { weapon: Object.assign({}, GOOD_ITEM, { age: 'nope' }) } },
        // 모르는 시대는 기본색으로 떨어뜨리고 화면은 정상이어야 한다. 조용히 넘어가면 안 되므로
        // console.error 는 **나는 게 정상**이다(그래서 이 판정기는 콘솔 에러를 실패로 안 센다).
        expectAgeRepaired: true,
    },
    {
        id: '② subs 키가 없다 (save-item-no-subs-kills-boot)',
        // `subs` 만 뺀다 — 시대는 성하다(①과 갈라 재려는 것이 이 사례의 전부다)
        save: { version: 1, equipment: { weapon: { name: '헌 검', slot: 'weapon', age: 'primitive', ageIdx: 0, rarity: 'common', level: 1, main: 'atk', value: 10 } } },
        expectAgeRepaired: false,
    },
    {
        id: '③ 좌표·대장간 레벨이 상한을 넘는다 (state-stage-forge-no-upper-clamp)',
        save: { version: 1, chapter: 3, stage: 99999, bestChapter: 3, bestStage: 99999, forgeLevel: 9999,
                equipment: { weapon: Object.assign({}, GOOD_ITEM) } },
        expectAgeRepaired: false,
    },
    {
        id: '④ 대조군 — 성한 세이브',
        save: { version: 1, equipment: { weapon: Object.assign({}, GOOD_ITEM) } },
        expectAgeRepaired: false,
    },
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };

    for (const c of CASES) {
        const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
        const perrs = [];
        page.on('pageerror', e => perrs.push(String(e)));
        await page.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) {} }, [KEY, JSON.stringify(c.save)]);
        await page.goto(INDEX, { waitUntil: 'load' });
        await waitBootDone(page, { timeout: 180000 });
        await page.waitForTimeout(600);

        const st = await page.evaluate(() => ({
            eqCells: document.querySelectorAll('.equip-cell').length,
            anvil: !!document.querySelector('.anvil-btn'),
            appNodes: document.getElementById('app').querySelectorAll('*').length,
            weaponAge: (S.equipment && S.equipment.weapon || {}).age,
            weaponKept: !!(S.equipment && S.equipment.weapon),
            agesHas: typeof AGES !== 'undefined' && AGES.includes((S.equipment && S.equipment.weapon || {}).age),
            enemies: (typeof Combat !== 'undefined' && Combat.enemies || []).length,
            stageLabel: (document.getElementById('stage-label') || {}).textContent || '',
            subsIsArray: Array.isArray((S.equipment && S.equipment.weapon || {}).subs),
            stage: S.stage, bestStage: S.bestStage, forgeLevel: S.forgeLevel,
            forgeMax: (typeof Forge !== 'undefined' && Forge.MAX_LEVEL) || 35,
            stageMax: typeof STAGES_PER_CHAPTER !== 'undefined' ? STAGES_PER_CHAPTER : 10,
            // 확률표가 **레벨 1 표로 되돌아갔는가** — `ageProbsAt` 은 없는 레벨이면 조용히 1레벨 표를
            // 돌려준다. 그래서 만렙을 한참 넘긴 세이브에서 "레벨 9999 ▶ 최고"인데 원시적 100% 가 됐다.
            probsFellBack: (() => {
                const p = Forge.ageProbsAt(S.forgeLevel), p1 = Forge.ageProbsAt(1);
                return JSON.stringify(p) === JSON.stringify(p1) && S.forgeLevel !== 1;
            })(),
        }));

        ok(st.eqCells === 9, `${c.id} — 장비 칸이 9개여야 하는데 ${st.eqCells}개다(UI.init 이 죽었다)`);
        // 전투 축 — UI 가 멀쩡해도 `Combat.start()` 가 끊기면 적이 영원히 안 나온다(오진하기 쉬운 쪽)
        ok(st.enemies >= 1, `${c.id} — 적이 ${st.enemies}마리다(Combat.start 가 끊겼다)`);
        ok(st.stageLabel.trim().length > 0, `${c.id} — 스테이지 라벨이 비었다("${st.stageLabel}")`);
        ok(st.subsIsArray, `${c.id} — 장비의 subs 가 배열로 보정되지 않았다`);
        // 좌표·레벨 상한 — 아래로는 스스로 안 내려오는 값들이라 로드 시점이 유일한 관문이다
        ok(st.stage >= 1 && st.stage <= st.stageMax, `${c.id} — S.stage=${st.stage} (상한 ${st.stageMax})`);
        ok(st.bestStage >= 1 && st.bestStage <= st.stageMax, `${c.id} — S.bestStage=${st.bestStage} (상한 ${st.stageMax})`);
        ok(st.forgeLevel >= 1 && st.forgeLevel <= st.forgeMax, `${c.id} — S.forgeLevel=${st.forgeLevel} (상한 ${st.forgeMax})`);
        ok(!st.probsFellBack, `${c.id} — 확률표가 레벨 1 표로 되돌아갔다(레벨 ${st.forgeLevel} 이 표에 없다)`);
        ok(st.anvil, `${c.id} — 모루 버튼이 화면에 없다`);
        ok(!perrs.length, `${c.id} — pageerror ${perrs.length}건: ${perrs.slice(0, 2).join(' | ')}`);
        // 장비를 **버리지 않고** 시대만 고친다(사용자가 끼고 있던 장비를 빼앗지 않는다)
        ok(st.weaponKept, `${c.id} — 장착 장비가 통째로 사라졌다(시대 키만 이상했을 뿐이다)`);
        ok(st.agesHas, `${c.id} — 보정 뒤에도 시대 키가 표에 없다 (${st.weaponAge})`);
        if (c.expectAgeRepaired) ok(st.weaponAge !== 'nope', `${c.id} — 시대 키가 안 고쳐졌다 (${st.weaponAge})`);
        else ok(st.weaponAge === 'primitive', `${c.id} — 시대가 성한 세이브인데 시대 키가 바뀌었다 (${st.weaponAge})`);

        console.log(`${c.id}\n    장비칸 ${st.eqCells} · 모루 ${st.anvil ? '있음' : '없음'} · #app 노드 ${st.appNodes} · weapon.age=${st.weaponAge} · subs배열 ${st.subsIsArray} · 적 ${st.enemies}마리 · 라벨 "${st.stageLabel}" · stage ${st.stage}/best ${st.bestStage} · 대장간 Lv.${st.forgeLevel} · pageerror ${perrs.length}`);
        await page.close();
    }

    await browser.close();
    if (fails.length) { console.log('\nFAIL\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('\nPASS — 손상 세이브에도 부팅 완주');
})();
