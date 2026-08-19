// 스킬 쿨타임 통일 검증 — `skill-cooldown-uniform` (사용자 지시 2026-08-19)
//   "스킬 쿨타임이 너무 길다. 전부 10~14초 내외로 해라 모든 스킬. 등급별로 쿨타임 다르지도 마라."
//
// 브라우저 없이 **진짜 게임 코드**(bignum·util·gamedata·state·techtree·ascension·skills·forge·combat)를
// 한 vm 스크립트로 이어 붙여 돌린다(test-buff-redesign.js 와 같은 방식 — 최상위 렉시컬 바인딩 때문).
// ⚠️ 기대값을 여기 손으로 베끼지 말 것(TODO '함정 ④'). 유일하게 손으로 적는 상수는 **사용자가 말한
//    대역 10~14초**뿐이고, 나머지(type→cd 배정, 등급 평탄도, 실제 발동 후 남은 쿨)는 전부 코드가 준
//    값끼리 비교한다. 그래서 gamedata 의 cd 를 하나만 바꿔도 여기서 잡힌다.
//
// node tools/test-skill-cooldown.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js/', f), 'utf8');
const FILES = ['bignum.js', 'util.js', 'gamedata.js', 'state.js', 'techtree.js', 'ascension.js', 'skills.js', 'forge.js', 'combat.js'];
const src = FILES.map(read).join('\n;\n') + `
;globalThis.api = {
    get S() { return S; }, set S(v) { S = v; },
    Big, U, Combat, Forge, Skills, Ascension, TechTree, defaultState, ensureStateShape,
    SKILL_DEFS, RARITIES, SUBSTATS,
};`;

const toasts = [];
const ctx = {
    window: {}, console, document: undefined,
    localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
    location: { reload() { } },
    DEFAULT_AVATAR: '🙂', installMountCompat: o => o,
    UNLOCKS: [],
    Dungeons: { run: null, ensure() { }, onFail() { }, def: () => ({}), monsterHp: () => 1 },
    Quests: { bump() { } },
    SFX: { setMusicMode() { }, hit() { }, gacha() { } },
    Scene3D: {
        skillEffect() { }, setChapterTheme() { }, setTheme() { }, clearEnemies() { }, heroRevive() { }, heroDown() { },
        deathFade: () => true, bossEntrance() { }, sceneCut: fn => fn(), scene: null, spawnEnemy() { }, walking: false,
        heroAttack() { }, enemyAttack() { }, shake() { }, enemyHalfW: () => 0.35, BOSS_IMPACT: 900, BOSS_SPAWN_X: 2.2,
        heroHit() { }, hitEnemy() { }, killEnemy() { }, update() { },
    },
    UI: {
        toast: m => toasts.push(m), skillCutin() { }, floatLoot() { }, floatTextAtHero() { }, skillFlash() { },
        floatDmg() { }, hpFlash() { }, renderQuests() { }, renderSkills() { },
        renderTopBar() { }, renderMenu() { }, updateStageLabel() { }, updateWavePips() { }, updateSkillBar() { }, renderPass() { },
        els: { passModal: { classList: { contains: () => true } } },
    },
    Pets: { activeBonus: () => ({ atk: 0, hp: 0, subs: [] }), MAX_ACTIVE: 3 },
    Mounts: { activeBonus: () => ({ atk: 0, hp: 0, subs: [] }) },
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const api = ctx.api;

let fail = 0;
const check = (name, cond, detail) => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} — ${detail}`); fail++; }
};

// 사용자가 말한 대역. 이 두 숫자만이 이 파일에 손으로 적힌 기대값이다.
const CD_MIN = 10, CD_MAX = 14;

const DEFS = api.SKILL_DEFS;
const rarityOrder = (api.RARITIES && Array.isArray(api.RARITIES) ? api.RARITIES : null);
// RARITIES 형태를 모르면 정의 등장 순서에서 등급 서열을 뽑는다(코드가 준 순서 — 손으로 안 적는다)
const rarities = [];
for (const d of DEFS) if (!rarities.includes(d.rarity)) rarities.push(d.rarity);

console.log('skill-cooldown-uniform — 전 스킬 쿨타임 10~14초 통일 / 등급 차등 금지');
console.log(`  (등급 서열 = ${rarities.join(' < ')})`);

// ── ① 대역: 모든 스킬 cd 가 10~14초 안에 있는가
const outOfBand = DEFS.filter(d => !(d.cd >= CD_MIN && d.cd <= CD_MAX));
check(`① 전 스킬 cd 가 ${CD_MIN}~${CD_MAX}초 대역 안 (${DEFS.length}종)`,
    outOfBand.length === 0, outOfBand.map(d => `${d.id}=${d.cd}`).join(', '));

// ── ② 등급 차등 금지 (a): cd 는 rarity 의 함수가 아니다 —
//    같은 type 이면 등급이 달라도 cd 가 같아야 한다.
const byType = {};
for (const d of DEFS) (byType[d.type] ||= []).push(d);
for (const [type, list] of Object.entries(byType)) {
    const set = [...new Set(list.map(d => d.cd))];
    check(`② 같은 type(${type})은 등급이 달라도 cd 동일`,
        set.length === 1, list.map(d => `${d.rarity}:${d.id}=${d.cd}`).join(', '));
}

// ── ③ 등급 차등 금지 (b): 등급별 평균 cd 가 평평한가(단조 증가/감소 없음)
const meanOf = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const rMean = rarities.map(r => ({ r, m: meanOf(DEFS.filter(d => d.rarity === r).map(d => d.cd)) }));
const spread = Math.max(...rMean.map(x => x.m)) - Math.min(...rMean.map(x => x.m));
check('③ 등급별 평균 cd 편차 ≤ 0.5초',
    spread <= 0.5, rMean.map(x => `${x.r}=${x.m.toFixed(2)}`).join(' / ') + ` (편차 ${spread.toFixed(2)})`);
// 단조성까지 본다 — 편차가 작아도 '높은 등급일수록 길다'는 방향이 남아 있으면 지시 위반이다
const rIdx = rarities.map((_, i) => i);
const mm = rMean.map(x => x.m);
const mMean = meanOf(mm), iMean = meanOf(rIdx);
const cov = rIdx.reduce((a, i) => a + (i - iMean) * (mm[i] - mMean), 0);
const sdI = Math.sqrt(rIdx.reduce((a, i) => a + (i - iMean) ** 2, 0));
const sdM = Math.sqrt(mm.reduce((a, m) => a + (m - mMean) ** 2, 0));
const corr = (sdI === 0 || sdM === 0) ? 0 : cov / (sdI * sdM);
check('③ 등급 서열 ↔ 평균 cd 상관계수 |r| ≤ 0.5 (등급이 높다고 길지 않다)',
    Math.abs(corr) <= 0.5, `r=${corr.toFixed(3)} · ${rMean.map(x => `${x.r}=${x.m.toFixed(2)}`).join(' ')}`);

// ── ④ 옛 값 회귀 방지: 최고 등급 스킬이 대역 상한을 넘던 시절(timeWarp 24·divineShield 22·apocalypse 20)로
//    되돌아가지 않았는가. 특정 값을 적지 않고, "가장 긴 cd 를 가진 스킬이 최하위 등급에도 있다"로 본다.
const maxCd = Math.max(...DEFS.map(d => d.cd));
const holdersOfMax = DEFS.filter(d => d.cd === maxCd);
const topRarity = rarities[rarities.length - 1];
check('④ 최장 쿨타임이 최고 등급 전유물이 아니다',
    !holdersOfMax.every(d => d.rarity === topRarity),
    `최장 ${maxCd}초 보유자 = ${holdersOfMax.map(d => `${d.rarity}:${d.id}`).join(', ')}`);

// ── ⑤ 실제 코드 경로: 발동하면 정의값 그대로 쿨이 걸리는가(서브스탯 감소 0일 때)
// ⚠️ 데미지 스킬(single/aoe)은 **사거리 안에 산 적이 없으면 쿨을 걸지 않고 false 로 빠진다**(tryCast).
//    그래서 빈 전장에서 재면 전부 '쿨 0' 으로 보여 시험이 통째로 무의미해진다 — 진짜 전투를 세운다.
let CLOCK = 1755000000000;
api.U.now = () => CLOCK;
function reset(skills) {
    api.S = api.defaultState();
    api.ensureStateShape();
    api.S.skills = {};
    for (const id of skills) api.S.skills[id] = { level: 1, dupes: 0, stars: 0 };
    api.S.equippedSkills = skills.slice();
    api.S.autoCast = false;   // 자동 발동이 끼어들어 쿨을 다시 걸지 않게 — 이 시험은 수동 시전만 본다
    api.TechTree.ensure();
    api.Combat.buffs = []; api.Combat.hots = []; api.Combat.cooldowns = {};
    api.Combat.start();       // phase='fight' + 적 스폰까지 진짜 코드로
    pinArena();
    toasts.length = 0;
}
// 전장을 고정한다 — 적이 죽으면 웨이브가 넘어가고(phase 가 waveDelay 로 빠져 쿨 감소 루프가 멈춘다),
// 영웅이 죽어도 마찬가지다. 적 공격력을 0으로 눌러 두고 매 틱 양쪽 체력을 채워 '계속 싸우는 중'을 유지한다.
function pinArena() {
    for (const e of api.Combat.enemies) {
        e.alive = true;
        e.hp = e.maxHp = api.Big.of(1e30);
        e.atk = api.Big.of(0);
        e.x = 2.0;             // 스킬 사거리(3.2) 안 · 근접 정지선 밖
    }
    api.Combat.hero.hp = api.Combat.hero.maxHp;
}
function advance(sec) {
    const dt = api.Combat.TICK;
    for (let t = 0; t < sec - 1e-9; t += dt) { CLOCK += dt * 1000; api.Combat.tick(dt); pinArena(); }
}

const allIds = DEFS.map(d => d.id);
reset(allIds);
check('⑤-0 전장 전제: 전투 중 + 사거리 안에 적이 있다',
    api.Combat.phase === 'fight' && api.Combat.aliveEnemies().some(e => e.x < 3.2),
    `phase=${api.Combat.phase} alive=${api.Combat.aliveEnemies().length}`);
const castMismatch = [];
for (const d of DEFS) {
    api.Combat.cooldowns[d.id] = 0;
    const ok = api.Combat.tryCast(d.id, true);
    const left = api.Combat.cooldowns[d.id];
    if (!ok) castMismatch.push(`${d.id}: 시전 실패(${toasts[toasts.length - 1] || '이유 없음'})`);
    else if (Math.abs(left - d.cd) > 1e-6) castMismatch.push(`${d.id}: 정의 ${d.cd} → 실제 ${left}`);
}
check('⑤ 발동 직후 남은 쿨 = 정의 cd (서브스탯 감소 0)', castMismatch.length === 0, castMismatch.join(' / '));

// ── ⑥ 대역 상한만큼 흘리면 전 스킬이 다시 발동 가능해진다(= 실제 대기시간도 14초 이내)
reset(allIds);
for (const d of DEFS) { api.Combat.cooldowns[d.id] = 0; api.Combat.tryCast(d.id, true); }
advance(CD_MAX);
const stillOnCd = DEFS.filter(d => (api.Combat.cooldowns[d.id] || 0) > 1e-6);
check(`⑥ ${CD_MAX}초 뒤 전 스킬 재발동 가능`,
    stillOnCd.length === 0, stillOnCd.map(d => `${d.id}=${api.Combat.cooldowns[d.id].toFixed(2)}`).join(', '));
// 음성 대조 — 대역 하한 직전에는 아직 아무도 안 풀려 있어야 한다(cd 가 10 미만으로 새면 여기서 잡힌다)
reset(allIds);
for (const d of DEFS) { api.Combat.cooldowns[d.id] = 0; api.Combat.tryCast(d.id, true); }
advance(CD_MIN - 0.5);
const readyEarly = DEFS.filter(d => (api.Combat.cooldowns[d.id] || 0) <= 1e-6);
check(`⑥ ${CD_MIN - 0.5}초 시점엔 아직 아무도 안 풀림 (하한 ${CD_MIN}초 보증)`,
    readyEarly.length === 0, readyEarly.map(d => d.id).join(', '));

// ── ⑦ 서브스탯 '스킬 재사용 대기시간' 감소는 그대로 살아 있다(별개 시스템 — 같이 죽이면 안 된다)
check('⑦ 서브스탯 skillCd 가 여전히 존재',
    api.SUBSTATS.some(s => s[0] === 'skillCd'), api.SUBSTATS.map(s => s[0]).join(','));

console.log(fail === 0 ? '\n전부 PASS' : `\n${fail}건 FAIL`);
process.exit(fail === 0 ? 0 : 1);
