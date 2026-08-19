// buff-redesign-heal-atk-fixed 라이브 판정 — 로직은 tools/test-buff-redesign.js(vm)가 다 보고,
// 여기서는 **브라우저에서만 드러나는 것**만 본다:
//   ① 스킬 상세 팝업 설명문이 % 가 아니라 고정 수치 + 지속시간으로 찍히는가(옛 '공격 속도' 문구 소멸)
//   ② 회복 스킬이 만피에서도 실제로 발동하고, 회복 숫자가 한 번이 아니라 여러 번 떠오르는가
//   ③ 공격력 버프가 상단 전투력 표시까지 실제로 올리는가
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것 (probe-death-fade 와 같은 규약).
//
// 사용: node probe-buff-redesign-live.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // 🚨 `UI.els.*` 를 만지기 전에 **부팅 완주**를 기다린다. `UI` 가 떴다고 화면이 준비된 게 아니고
    //    (`UI.init()` 은 boot() 사슬의 24% 지점), 헤드리스에서는 evaluate 를 한 번만 부르고 폴링을
    //    멈추면 rAF 펌프가 죽어 **부팅이 그 자리에서 굳는다** — 그래서 고정 대기도, 한 번짜리
    //    대기도 답이 아니다. 실측표는 `wait-ready.js` 의 `waitBootDone` 머리말에 있다.
    await waitBootDone(page);
    // 부팅 대기는 Node 측 폴링으로 (이 컨테이너에서 waitForFunction 이 죽는다)
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Combat !== 'undefined' && typeof S !== 'undefined' && !!S && !!UI.els.stageLabel)) break;
        await page.waitForTimeout(200);
    }

    // 검사에 쓸 스킬을 손에 쥔다(회복 1 · 공격력 버프 1)
    const setup = await page.evaluate(() => {
        S.skills = { blessing: { level: 1, dupes: 0, stars: 0 }, warCry: { level: 1, dupes: 0, stars: 0 } };
        S.equippedSkills = ['blessing', 'warCry'];
        // 회복 총량(고정값)이 maxHp 를 넘으면 첫 0.5초에 만피로 차 버려 '나눠 뜨는지'를 못 본다 —
        // 체력 장비로 그릇을 키워 회복이 실제로 흐르는 구간을 만든다.
        S.equipment.armor = { main: 'hp', slot: 'armor', age: 'primitive', ageIdx: 0, rarity: 'mythic', level: 90, value: 1e9, subs: [] };
        Combat.buffs = []; Combat.hots = []; Combat.cooldowns = {};
        Combat.recalcHero();
        return { heal: U.fmt(Skills.healAmt('blessing')), atk: U.fmt(Skills.buffAtk('warCry')) };
    });

    // ① 상세 팝업 설명문
    const desc = await page.evaluate(() => {
        UI.openSkillDetail('blessing');
        const a = UI.els.detailModal.textContent;
        UI.openSkillDetail('warCry');
        return { heal: a, buff: UI.els.detailModal.textContent };
    });

    // ② 회복 시전 → 지속 중 차오르고 숫자가 나눠 뜬다
    // 🚨 벽시계로 기다리면 안 된다(TODO 함정 ③): 이 헤드리스 컨테이너는 페이지가 수 초씩 멈췄다 풀리고,
    //    그때 main.js 로직 루프가 밀린 틱을 한 발화에 몰아 돌아 5초짜리 연출이 한 틱에 끝나 버린다
    //    (실측: waitForTimeout(900) 뒤에 이미 만료 시각을 3.7초 지나 있었다). 그래서 **틱을 직접 태운다** —
    //    실제 게임 루프가 부르는 것과 같은 Combat.tick(TICK) 을 같은 간격으로.
    const healRun = await page.evaluate(() => {
        Combat.cooldowns.blessing = 0;
        Combat.hero.hp = Combat.hero.maxHp.mul(0.05);   // 회복이 실제로 들어갈 여지
        window.__floats = 0;
        const orig = UI.floatTextAtHero.bind(UI);
        UI.floatTextAtHero = (t, k) => { if (k === 'heal') window.__floats++; return orig(t, k); };
        const cast = Combat.tryCast('blessing', true);
        return { cast, hots: Combat.hots.length, hpAfterCastPct: Combat.hero.hp.ratioTo(Combat.hero.maxHp) };
    });
    const healMid = await page.evaluate(() => {
        const dur = SKILL_DEFS.find(d => d.id === 'blessing').dur;
        // 시전과 이 블록 사이에 페이지가 몇 초 멈춰 있었으면 만료 시각이 이미 지나 있다 — 그러면 첫 틱에
        // 잔량이 통째로 들어와 '나눠 뜨는지'를 못 본다. 만료 시각을 지금 기준으로 다시 세워 결정적으로 만든다.
        Combat.hots.forEach(h => { h.until = U.now() + dur * 1000; });
        for (let t = 0; t < dur / 2; t += Combat.TICK) Combat.tick(Combat.TICK);
        return { floats: window.__floats, hots: Combat.hots.length, pct: Combat.hero.hp.ratioTo(Combat.hero.maxHp) };
    });
    const healEnd = await page.evaluate(() => {
        Combat.hots.forEach(h => { h.until = U.now() - 1; });   // 지속시간 종료 시점을 결정적으로 만든다
        Combat.tick(Combat.TICK);
        return { floats: window.__floats, hots: Combat.hots.length };
    });

    // ②-b 만피에서도 발동하는가(옛 게이트 제거)
    const fullHp = await page.evaluate(() => {
        Combat.cooldowns.blessing = 0; Combat.hots = [];
        Combat.hero.hp = Combat.hero.maxHp;
        const toastsBefore = document.querySelectorAll('.toast').length;
        const cast = Combat.tryCast('blessing', true);
        return { cast, hots: Combat.hots.length, newToasts: document.querySelectorAll('.toast').length - toastsBefore };
    });

    // ③ 공격력 버프가 실제 전투력까지 올린다
    const buffRun = await page.evaluate(() => {
        Combat.buffs = []; Combat.cooldowns.warCry = 0; Combat.recalcHero();
        const before = Combat.hero.stats.atk.toString();
        const cpBefore = Combat.combatPower().toString();
        const aps = Combat.hero.stats.attacksPerSec;
        Combat.tryCast('warCry', true);
        return {
            before, after: Combat.hero.stats.atk.toString(),
            grew: Combat.hero.stats.atk.gt(Big.of(before)),
            cpGrew: Combat.combatPower().gt(Big.of(cpBefore)),
            apsSame: Combat.hero.stats.attacksPerSec === aps,
            buffKeys: Combat.buffs.map(b => Object.keys(b.buff).join(',')).join('|'),
        };
    });

    const ok = (n, c, d) => console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d === undefined ? '' : ` — ${d}`}`);
    console.log('buff-redesign-heal-atk-fixed 라이브 판정');
    ok('① 회복 설명에 지속시간 + 고정 수치', desc.heal.includes('초 동안') && desc.heal.includes(setup.heal),
        `기대 수치 ${setup.heal}`);
    ok('① 회복 설명에 "%" 회복 문구 없음', !/체력을 \d+% 회복/.test(desc.heal));
    ok('① 공격력 버프 설명에 고정 수치', desc.buff.includes('공격력 +' + setup.atk), `기대 +${setup.atk}`);
    ok('① 옛 "공격 속도 +N%" 버프 문구 소멸', !/공격 속도 \+\d+%/.test(desc.buff + desc.heal));
    ok('② 시전 즉시 HoT 가 걸린다(일시불 아님)', healRun.cast !== false && healRun.hots === 1,
        `cast=${healRun.cast} hots=${healRun.hots}`);
    ok('② 시전 직후에는 체력이 아직 안 찼다', healRun.hpAfterCastPct < 0.1, healRun.hpAfterCastPct);
    ok('② 지속 중 체력이 실제로 차오른다', healMid.pct > healRun.hpAfterCastPct, `${healRun.hpAfterCastPct} → ${healMid.pct}`);
    ok('② 회복 숫자가 여러 번 나눠 뜬다', healMid.floats >= 3, `${healMid.floats}회`);
    ok('② 지속시간이 끝나면 HoT 가 사라진다', healEnd.hots === 0, healEnd.hots);
    ok('②-b 만피에서도 회복 스킬이 발동한다', fullHp.cast !== false && fullHp.hots === 1,
        `cast=${fullHp.cast} hots=${fullHp.hots}`);
    ok('②-b "체력이 충분합니다" 거절 토스트 없음', fullHp.newToasts === 0, fullHp.newToasts);
    ok('③ 공격력이 오른다', buffRun.grew, `${buffRun.before} → ${buffRun.after}`);
    ok('③ 상단 전투력도 같이 오른다', buffRun.cpGrew);
    ok('③ 공속은 안 변한다', buffRun.apsSame);
    ok('③ 버프 페이로드가 atkFlat 하나뿐', buffRun.buffKeys === 'atkFlat', buffRun.buffKeys);
    ok('콘솔 에러 0건', errs.length === 0, errs.slice(0, 3).join(' / '));

    await browser.close();
})();
