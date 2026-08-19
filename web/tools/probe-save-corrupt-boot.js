// 손상 세이브를 물려도 게임이 **부팅을 완주하는가** — QA 18차가 등재한 세이브 함정들의 회귀 가드.
//
// 왜 필요한가: 이 결함들은 전부 "값 하나가 표에 없다" 수준인데 **화면 절반이 사라지거나 전투가
//   시작조차 안 되는** 데까지 번진다. 게다가 콘솔이 조용한 경우가 있어(코인 NaN) 눈으로는 못 본다.
//
// 재는 것(각 사례는 세이브를 심고 부팅한 뒤 화면·상태를 실측한다):
//  ① save-bad-age-kills-ui — 장착 장비의 `age` 가 `AGE_COLORS` 에 없다
//     → 장비 시트(.equip-cell 9칸)와 모루가 **그대로 있어야** 한다(종전엔 0칸으로 증발했다).
//  ② 대조군 — 성한 세이브도 같은 잣대로 통과하는가(자가 헐거워서 나는 공짜 PASS 방지).
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
        id: '② 대조군 — 성한 세이브',
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
        }));

        ok(st.eqCells === 9, `${c.id} — 장비 칸이 9개여야 하는데 ${st.eqCells}개다(UI.init 이 죽었다)`);
        ok(st.anvil, `${c.id} — 모루 버튼이 화면에 없다`);
        ok(!perrs.length, `${c.id} — pageerror ${perrs.length}건: ${perrs.slice(0, 2).join(' | ')}`);
        // 장비를 **버리지 않고** 시대만 고친다(사용자가 끼고 있던 장비를 빼앗지 않는다)
        ok(st.weaponKept, `${c.id} — 장착 장비가 통째로 사라졌다(시대 키만 이상했을 뿐이다)`);
        ok(st.agesHas, `${c.id} — 보정 뒤에도 시대 키가 표에 없다 (${st.weaponAge})`);
        if (c.expectAgeRepaired) ok(st.weaponAge !== 'nope', `${c.id} — 시대 키가 안 고쳐졌다 (${st.weaponAge})`);
        else ok(st.weaponAge === 'primitive', `${c.id} — 성한 세이브의 시대 키가 바뀌었다 (${st.weaponAge})`);

        console.log(`${c.id} — 장비칸 ${st.eqCells} · 모루 ${st.anvil ? '있음' : '없음'} · #app 노드 ${st.appNodes} · weapon.age=${st.weaponAge} · pageerror ${perrs.length}`);
        await page.close();
    }

    await browser.close();
    if (fails.length) { console.log('\nFAIL\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('\nPASS — 손상 세이브에도 부팅 완주');
})();
