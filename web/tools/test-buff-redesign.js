// 버프 재설계 검증 — `buff-redesign-heal-atk-fixed` (사용자 지시 2026-08-19)
//   "hp회복은 몇 초 동안 회복하게, 피가 깎여있어야 발동되는 거 말고 그냥 쿨타임 풀리면 써지게, hp회복은 고정값으로.
//    공격력 업도 되게 하고 그것도 고정값. 버프는 hp회복, 공격력 업만 되게 하고 공속업 이딴 거 넣지 마셈."
//
// 브라우저 없이 **진짜 게임 코드**(bignum·util·gamedata·state·ascension·skills·forge·combat)를 한 vm
// 스크립트로 이어 붙여 돌린다. 한 스크립트로 합치는 이유는 test-chapter-cycle.js 와 같다(최상위 렉시컬 바인딩).
// ⚠️ 수치를 여기 손으로 베끼지 말 것 — 전부 게임 코드가 준 값끼리 비교한다(TODO '함정 ④').
//
// node tools/test-buff-redesign.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js/', f), 'utf8');
// TechTree 는 스텁 대신 진짜를 태운다 — 스킬 패시브·장비 배율이 전부 여길 거치는데, 손으로 스텁을 세우면
// 배율이 바뀔 때마다 테스트가 조용히 낡는다(TODO '함정 ④').
const FILES = ['bignum.js', 'util.js', 'gamedata.js', 'state.js', 'techtree.js', 'ascension.js', 'skills.js', 'forge.js', 'combat.js'];
const src = FILES.map(read).join('\n;\n') + `
;globalThis.api = {
    get S() { return S; }, set S(v) { S = v; },
    Big, U, Combat, Forge, Skills, Ascension, TechTree, defaultState, ensureStateShape,
    SKILL_DEFS, SKILL_BASE_HEAL, SKILL_BASE_BUFF_ATK, SKILL_BASE_PASSIVE, SUBSTATS,
};`;

const toasts = [];
const floats = [];
const ctx = {
    window: {}, console, document: undefined,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { reload() {} },
    DEFAULT_AVATAR: '🙂', installMountCompat: o => o,
    UNLOCKS: [],
    Dungeons: { run: null, ensure() {}, onFail() {}, def: () => ({}), monsterHp: () => 1 },
    Quests: { bump() {} },
    SFX: { setMusicMode() {}, hit() {}, gacha() {} },
    Scene3D: { skillEffect() {}, setChapterTheme() {}, clearEnemies() {}, heroRevive() {}, heroDown() {}, deathFade: () => true, bossEntrance() {}, sceneCut: fn => fn(), scene: null, spawnEnemy() {}, walking: false },
    UI: {
        toast: m => toasts.push(m), skillCutin() {}, floatLoot() {},
        floatTextAtHero: (t, k) => floats.push({ t, k }),
        renderTopBar() {}, renderMenu() {}, updateStageLabel() {}, updateWavePips() {}, updateSkillBar() {}, renderPass() {},
        els: { passModal: { classList: { contains: () => true } } },
    },
    // 스탯 기여자는 이 테스트의 관심사가 아니다 — 0으로 눌러 버프 항만 남긴다
    Pets: { activeBonus: () => ({ atk: 0, hp: 0, subs: [] }), MAX_ACTIVE: 3 },
    Mounts: { activeBonus: () => ({ atk: 0, hp: 0, subs: [] }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const api = ctx.api;
const { Big, U } = api;

let fail = 0;
const check = (name, cond, detail) => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} — ${detail}`); fail++; }
};
const num = b => Big.of(b).toNumber ? Big.of(b).toNumber() : Number(Big.of(b).m) * Math.pow(10, Big.of(b).e);

// 벽시계를 손에 쥔다 — 버프·HoT 의 만료는 U.now() 기준이라, 동기 루프로 tick 만 돌리면 시간이 안 흘러
// "지속시간이 끝났는데도 안 끝난다"는 유령 결과가 나온다(실제로 처음 돌렸을 때 그랬다).
let CLOCK = 1755000000000;
api.U.now = () => CLOCK;
// dt 만큼 전투 틱을 돌리면서 벽시계도 같이 민다 — 게임에서 실제로 일어나는 것과 같은 순서
function advance(sec) {
    const dt = api.Combat.TICK;
    for (let t = 0; t < sec - 1e-9; t += dt) { CLOCK += dt * 1000; api.Combat.tick(dt); }
}
// 회복 총량이 maxHp 를 넘으면 상한에 걸려 '얼마나 흘러들어왔는지'를 못 잰다 — 체력 장비로 그릇을 키운다
function giveBigHp() {
    api.S.equipment.armor = { main: 'hp', slot: 'armor', age: 'primitive', ageIdx: 0, rarity: 'mythic', level: 90, value: 1e9, subs: [] };
    api.Combat.recalcHero();
}
function reset(skills = {}) {
    api.S = api.defaultState();
    api.ensureStateShape();
    api.S.skills = {};
    for (const [id, lv] of Object.entries(skills)) api.S.skills[id] = { level: lv, dupes: 0, stars: 0 };
    api.S.equippedSkills = Object.keys(skills);
    api.S.autoCast = true;
    api.TechTree.ensure();   // S.tech 는 defaultState 가 아니라 여기서 선다(기술 배율 1.0 기준선)
    api.Combat.buffs = []; api.Combat.hots = []; api.Combat.cooldowns = {};
    api.Combat.recalcHero();
    toasts.length = 0; floats.length = 0;
}
const def = id => api.SKILL_DEFS.find(d => d.id === id);

console.log('buff-redesign-heal-atk-fixed — 버프 재설계(HP회복 HoT 고정값 / 공격력 고정 가산 / 공속 버프 폐기)');

// ⑤ 먼저 데이터부터: 버프 종류가 정말 둘뿐인가
const buffish = api.SKILL_DEFS.filter(d => d.type === 'heal' || d.type === 'buff');
check('⑤ 공속(atkSpd) 버프가 한 개도 없다',
    !api.SKILL_DEFS.some(d => JSON.stringify(d).includes('atkSpd')), api.SKILL_DEFS.filter(d => JSON.stringify(d).includes('atkSpd')).map(d => d.id));
check('⑤ 옛 비율 필드(healPct/buff:{}) 잔재 없음',
    !api.SKILL_DEFS.some(d => 'healPct' in d || 'buff' in d), api.SKILL_DEFS.filter(d => 'healPct' in d || 'buff' in d).map(d => d.id));
check('⑤ 버프 계열 = heal/buff 두 종류뿐', new Set(buffish.map(d => d.type)).size === 2, [...new Set(buffish.map(d => d.type))]);
check('⑤ 모든 heal/buff 스킬에 dur·mult 가 있다',
    buffish.every(d => d.dur > 0 && d.mult > 0), buffish.filter(d => !(d.dur > 0 && d.mult > 0)).map(d => d.id));
check('⑤ 성역·시간 왜곡이 회복/공격력으로 교체됨',
    def('sanctuary').type === 'heal' && def('timeWarp').type === 'buff', `${def('sanctuary').type}/${def('timeWarp').type}`);
// 장비 서브스탯 atkSpd 는 별개 시스템 — 같이 지우면 안 된다
check('⑤ 장비 서브스탯 "공격 속도"는 그대로 살아 있다',
    api.SUBSTATS.some(s => s[0] === 'atkSpd'), api.SUBSTATS.map(s => s[0]).join(','));

// ① HP 게이트 제거 — 만피에서도 회복 스킬이 발동한다
reset({ firstAid: 1 });
api.Combat.hero.hp = api.Combat.hero.maxHp;             // 만피
const castFull = api.Combat.tryCast('firstAid', true);
check('① 만피에서도 회복 스킬 발동', castFull !== false && api.Combat.hots.length === 1,
    `cast=${castFull} hots=${api.Combat.hots.length}`);
check('① "체력이 충분합니다" 거절 토스트가 더 안 뜬다', !toasts.some(t => /충분/.test(t)), toasts);

// ② HoT — 즉시 일시불이 아니라 dur 초에 걸쳐 들어온다
reset({ blessing: 1 });
giveBigHp();
api.Combat.hero.hp = api.Combat.hero.maxHp.mul(0.05);   // 회복 여지를 크게
const hpAtCast = api.Combat.hero.hp;
api.Combat.tryCast('blessing');
check('② 시전 직후에는 아직 아무것도 안 들어왔다', num(api.Combat.hero.hp) === num(hpAtCast),
    `${num(api.Combat.hero.hp)} vs ${num(hpAtCast)}`);
const total = api.Skills.healAmt('blessing');
const durB = def('blessing').dur;
// ⚠️ 자연 회복(1%/s)이 같은 틱에 섞여 든다 — HoT 몫만 보려고 그걸 빼고 잰다(스텟에서 끄지 않고 실제 경로 유지)
const regenPerSec = num(api.Combat.hero.maxHp) * (0.01 + api.Combat.hero.stats.hpRegen / 100);
const healedBy = (t0, sec) => num(api.Combat.hero.hp) - num(t0) - regenPerSec * sec;
advance(durB / 2);
const half = healedBy(hpAtCast, durB / 2);
check('② 절반 시점에 총량의 절반쯤 들어온다', Math.abs(half / num(total) - 0.5) < 0.08, `${(half / num(total) * 100).toFixed(1)}%`);
check('② 진행 중에도 HoT 가 살아 있다', api.Combat.hots.length === 1, api.Combat.hots.length);
advance(durB / 2 + 0.4);
const whole = healedBy(hpAtCast, durB + 0.4);
check('② dur 이 지나면 총량이 다 들어오고 HoT 가 사라진다',
    Math.abs(whole / num(total) - 1) < 0.03 && api.Combat.hots.length === 0,
    `${(whole / num(total) * 100).toFixed(1)}% / hots=${api.Combat.hots.length}`);
check('② 회복 숫자가 여러 번 나눠 뜬다(일시불 1회가 아니다)', floats.filter(f => f.k === 'heal').length >= 3,
    floats.filter(f => f.k === 'heal').length);

// ③ 고정값 — maxHp 가 100배가 돼도 회복량은 그대로
reset({ blessing: 1 });
const healSmall = num(api.Skills.healAmt('blessing'));
api.S.equipment.weapon = { main: 'hp', slot: 'weapon', age: 'primitive', ageIdx: 0, rarity: 'mythic', level: 90, value: 1e6, subs: [] };
api.Combat.recalcHero();
const grown = num(api.Combat.hero.maxHp);
const healBig = num(api.Skills.healAmt('blessing'));
check('③ maxHp 가 커져도 회복량은 불변(고정값)', healSmall === healBig, `${healSmall} vs ${healBig}`);
check('③ (전제) maxHp 는 실제로 크게 늘었다', grown > 1e5, grown);
// 대신 레벨·승천엔 붙는다
reset({ blessing: 10 });
const healL10 = num(api.Skills.healAmt('blessing'));
check('③ 레벨에는 비례한다(L1 → L10)', healL10 > healSmall * 2, `${healSmall} → ${healL10}`);
api.S.skills.blessing.stars = 2;
check('③ 승천(별)에도 비례한다', num(api.Skills.healAmt('blessing')) > healL10, num(api.Skills.healAmt('blessing')));
check('③ 회복 기준치가 등급 순으로 오른다',
    ['common', 'rare', 'epic', 'legendary', 'ultimate', 'mythic'].every((r, i, a) => i === 0 || api.SKILL_BASE_HEAL[r] > api.SKILL_BASE_HEAL[a[i - 1]]),
    api.SKILL_BASE_HEAL);

// ④ 공격력 업 = 고정 가산 · 지속시간이 끝나면 원복 · 공속은 그대로
reset({ warCry: 1 });
const atk0 = num(api.Combat.hero.stats.atk);
const aps0 = api.Combat.hero.stats.attacksPerSec;
api.Combat.tryCast('warCry');
const atk1 = num(api.Combat.hero.stats.atk);
const want = num(api.Skills.buffAtk('warCry'));
check('④ 공격력이 정확히 고정량만큼 오른다', Math.abs((atk1 - atk0) - want) < Math.max(1e-6, want * 1e-9),
    `+${atk1 - atk0} (기대 +${want})`);
check('④ 공속은 버프로 안 변한다', api.Combat.hero.stats.attacksPerSec === aps0, `${aps0} → ${api.Combat.hero.stats.attacksPerSec}`);
check('④ 버프 항목에 atkSpd 가 없다', api.Combat.buffs.every(b => !('atkSpd' in b.buff)), JSON.stringify(api.Combat.buffs.map(b => Object.keys(b.buff))));
// 만료 — 지속시간이 실제로 지나가게 벽시계를 민다
advance(def('warCry').dur + 0.2);
check('④ 지속시간이 끝나면 공격력이 원복', Math.abs(num(api.Combat.hero.stats.atk) - atk0) < Math.max(1e-6, atk0 * 1e-9),
    `${num(api.Combat.hero.stats.atk)} (기대 ${atk0})`);
check('④ 만료된 버프는 목록에서 빠진다', api.Combat.buffs.length === 0, api.Combat.buffs.length);

// ④-b 고정 가산이 장비 % 배율에 휩쓸리지 않는다 (그러면 '고정'이 아니다)
reset({ warCry: 1 });
const flat = num(api.Skills.buffAtk('warCry'));
api.S.equipment.weapon = { main: 'atk', slot: 'weapon', age: 'primitive', ageIdx: 0, rarity: 'mythic', level: 90, value: 1e6, subs: [{ key: 'dmgPct', label: '피해량', value: 300 }] };
api.Combat.recalcHero();
const gearedAtk = num(api.Combat.hero.stats.atk);
api.Combat.tryCast('warCry');
check('④-b (전제) 장비 피해% 가 실제로 걸려 있다', api.Combat.hero.stats.subs.dmgPct === 300, api.Combat.hero.stats.subs.dmgPct);
check('④-b 가산량은 장비 피해% 배율에 안 곱해진다',
    Math.abs((num(api.Combat.hero.stats.atk) - gearedAtk) - flat) < Math.max(1e-6, flat * 1e-9),
    `+${num(api.Combat.hero.stats.atk) - gearedAtk} (기대 +${flat})`);

// 중첩 금지 — 같은 스킬을 다시 쓰면 갱신이지 쌓이지 않는다 (버프·HoT 둘 다)
reset({ warCry: 1, blessing: 1 });
api.Combat.tryCast('warCry'); api.Combat.cooldowns.warCry = 0; api.Combat.tryCast('warCry');
check('⑥ 같은 공격력 버프 재시전 = 갱신(중첩 아님)', api.Combat.buffs.length === 1, api.Combat.buffs.length);
api.Combat.tryCast('blessing'); api.Combat.cooldowns.blessing = 0; api.Combat.tryCast('blessing');
check('⑥ 같은 회복 재시전 = 갱신(중첩 아님)', api.Combat.hots.length === 1, api.Combat.hots.length);

// ⑧ 캐치업(탭 스톨 뒤 밀린 틱 몰아 돌기) — 벽시계가 이미 지속시간을 지나 있어도 총량은 다 들어와야 한다.
//    🚨 이 경로에서 회복 대부분이 증발하던 걸 헤드리스 실측으로 잡았다(main.js의 while 캐치업 구간에서는
//       U.now()가 얼어 있어 모든 틱이 '이미 만료' 상태로 들어온다). 그 회귀를 여기서 못 박는다.
reset({ blessing: 1 });
giveBigHp();
api.Combat.hero.hp = api.Combat.hero.maxHp.mul(0.05);
const hpStall = api.Combat.hero.hp;
const totalStall = num(api.Skills.healAmt('blessing'));
api.Combat.tryCast('blessing');
CLOCK += (def('blessing').dur + 3) * 1000;   // 탭이 8초 멈춰 있었다
api.Combat.tick(api.Combat.TICK);            // 그리고 밀린 틱이 들어온다(벽시계는 이 사이 안 움직인다)
// 자연 회복 몫은 빼고 본다 — 체력 그릇을 키워 놨으므로 한 틱 자연 회복도 무시할 수 없다
const regenTick = num(api.Combat.hero.maxHp) * (0.01 + api.Combat.hero.stats.hpRegen / 100) * api.Combat.TICK;
const stallGot = num(api.Combat.hero.hp) - num(hpStall) - regenTick;
check('⑧ 캐치업 한 틱에도 회복 총량이 다 들어온다', Math.abs(stallGot / totalStall - 1) < 0.02,
    `${(stallGot / totalStall * 100).toFixed(1)}%`);
check('⑧ 그 뒤 HoT 는 정리된다', api.Combat.hots.length === 0, api.Combat.hots.length);

// 만피 상한 — 고정값이라도 maxHp 를 넘기지 않고, 넘친 몫은 숫자로도 안 띄운다
reset({ divineShield: 1 });
api.Combat.hero.hp = api.Combat.hero.maxHp;
api.Combat.tryCast('divineShield');
advance(def('divineShield').dur + 0.4);
check('⑦ 만피 상한을 안 넘는다', num(api.Combat.hero.hp) <= num(api.Combat.hero.maxHp), `${num(api.Combat.hero.hp)} / ${num(api.Combat.hero.maxHp)}`);
check('⑦ 안 들어간 회복은 숫자로도 안 뜬다', floats.filter(f => f.k === 'heal').length === 0, floats.length);

console.log(fail === 0 ? '\n■ 전부 PASS' : `\n■ ${fail}건 FAIL`);
process.exit(fail ? 1 : 0);
