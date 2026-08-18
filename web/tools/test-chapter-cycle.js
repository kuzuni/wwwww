// 25챕터 완주 → 난이도 순환(어려움 → 매우 어려움 → 헬) 로직 검증 — `chapter-cycle-difficulty`
// 사용자 지시(2026-08-19): "25챕터 넘어가서 26챕터 되어야 할 때 (어려움)1-1 이걸로 시작해서 맵 순환하게 하기."
//
// 브라우저 없이 **진짜 게임 코드**(state.js + pass.js + dungeons.js + combat.js)를 하나의 vm 스크립트로
// 이어 붙여 돌린다. 한 스크립트로 합치는 이유: state.js 의 `let S`·헬퍼는 최상위 렉시컬 바인딩이라
// 스크립트를 나눠 실행하면 combat.js 쪽에서 아예 안 보인다(컨텍스트 프로퍼티가 아니다).
// ⚠️ 규칙을 테스트에 손으로 베껴 두지 말 것 — TODO '함정 ④'(자가 코드보다 낡은 프로브)가 그대로 재발한다.
//    라벨·전진 규칙은 전부 게임 코드가 계산한 값을 그대로 읽어서 비교한다.
//
// node tools/test-chapter-cycle.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js/', f), 'utf8');
// gamedata.js 를 같이 태우는 이유: 사이클 길이가 CHAPTER_THEMES.length 를 그대로 받으므로,
// 빼면 state.js 의 폴백(25)만 재게 되어 "맵을 늘렸는데 상한이 안 따라왔다"를 못 잡는다.
const src = [read('gamedata.js'), read('state.js'), read('pass.js'), read('dungeons.js'), read('combat.js')].join('\n;\n') + `
;globalThis.api = {
    get S() { return S; }, set S(v) { S = v; },
    Combat, Pass, Dungeons, defaultState, ensureStateShape, pruneDanglingRefs,
    stageKey, stageName, stageDifficultyLabel, isUnlocked,
    absChapter, curAbsChapter, bestAbsChapter, progressRank, curRank, bestRank,
    CHAPTERS_PER_CYCLE, MAX_DIFFICULTY, DIFFICULTY_NAMES, CHAPTER_THEMES,
};`;

// --- 스텁: 로직에 영향을 주지 않는 표시·연출·저장 계층만 대역을 세운다 ---
const toasts = [];
const mkBig = v => ({
    v,
    mul(o) { return mkBig(this.v * (o && o.v !== undefined ? o.v : o)); },
    pow(n) { return mkBig(Math.pow(this.v, n)); },
    isZero() { return this.v === 0; },
    isPos() { return this.v > 0; },
});
const ctx = {
    window: {}, console,
    U: {
        now: () => 1755000000000,
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        fmt: v => String(v),
        chance: () => false,
    },
    Big: { of: mkBig, ONE: mkBig(1), ZERO: mkBig(0) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    location: { reload() {} },
    DEFAULT_AVATAR: '🙂',
    installMountCompat: o => o,          // mounts.js 소관 — 구세이브 이관은 이 테스트 대상이 아니다
    SKILL_DEFS: [], Skills: { MAX_ACTIVE: 3 },
    TechTree: { offlineCapMult: () => 1, offlineCoinMult: () => 1, offlineHammerMult: () => 1 },
    UNLOCKS: [{ key: 'dungeon', stage: '2-10' }],
    SFX: { setMusicMode() {}, hit() {} },
    Scene3D: { setChapterTheme() {}, clearEnemies() {}, heroRevive() {}, heroDown() {}, deathFade: () => true, bossEntrance() {}, sceneCut: fn => fn() },
    UI: {
        toast: m => toasts.push(m),
        renderTopBar() {}, updateStageLabel() {}, updateWavePips() {}, renderMenu() {}, renderPass() {},
        floatLoot() {},
        els: { passModal: { classList: { contains: () => true } } },  // 패스 팝업은 닫힌 상태
    },
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

function reset() {
    api.S = api.defaultState();
    api.ensureStateShape();
    api.Dungeons.run = null;
    api.Combat.hero.maxHp = mkBig(100);
    toasts.length = 0;
}
// 스테이지 클리어 한 번 = 전진 한 칸. 클리어 보상 경로를 통째로 태운다(첫 클리어 판정·베스트 갱신 포함).
const clearOnce = () => api.Combat.stageClear();
const at = () => `${api.S.difficulty}:${api.S.chapter}-${api.S.stage}`;

console.log('chapter-cycle-difficulty — 25챕터 순환 + 난이도 티어 로직');

// ① 기본값: 티어 0 / 1-1 에서 시작
reset();
check('신규 세이브는 기본 순환 1-1', at() === '0:1-1', at());
check('사이클 길이 25', api.CHAPTERS_PER_CYCLE === 25, api.CHAPTERS_PER_CYCLE);
check('사이클 길이 = 맵 종류 수(둘이 갈라지면 못 보는 맵이 생긴다)',
    api.CHAPTERS_PER_CYCLE === api.CHAPTER_THEMES.length, `${api.CHAPTERS_PER_CYCLE} vs 맵 ${api.CHAPTER_THEMES.length}종`);
check('티어 이름 = 어려움/매우 어려움/헬', api.DIFFICULTY_NAMES.slice(1).join('/') === '어려움/매우 어려움/헬', api.DIFFICULTY_NAMES);

// ② 사이클 안에서는 옛 규칙 그대로 — 10스테이지마다 챕터 +1
reset();
for (let i = 0; i < 10; i++) clearOnce();
check('1-10 클리어 → 2-1', at() === '0:2-1', at());

// ③ 25-10 클리어 → 어려움 1-1 (26챕터가 아니다)
reset();
api.S.chapter = 25; api.S.stage = 10; api.S.bestChapter = 25; api.S.bestStage = 10;
clearOnce();
check('25-10 클리어 → 어려움 1-1', at() === '1:1-1', at());
check('26챕터는 생기지 않는다', api.S.chapter === 1, api.S.chapter);
check('난이도 상승 토스트', toasts.some(t => /난이도 상승/.test(t) && /어려움 1-1/.test(t)), toasts);
check('상단 라벨 = "어려움 1-1"', api.stageName() === '어려움 1-1', api.stageName());

// ④ 티어 사슬 전체: 어려움 → 매우 어려움 → 헬, 그리고 헬에서 멈춤
reset();
const seen = [];
for (let t = 0; t <= api.MAX_DIFFICULTY; t++) {
    api.S.difficulty = t; api.S.chapter = 25; api.S.stage = 10;
    clearOnce();
    seen.push(api.stageName());
}
check('티어 사슬 = 어려움→매우 어려움→헬→(헬 유지)',
    seen.join(' | ') === '어려움 1-1 | 매우 어려움 1-1 | 헬 1-1 | 헬 25-10', seen);
check('헬 25-10 은 종점(더 안 넘어간다)', api.S.difficulty === api.MAX_DIFFICULTY && at() === '3:25-10', at());

// ⑤ 적 스펙은 티어 경계에서 끊기지 않고 계속 오른다 (절대 챕터 축)
reset();
api.S.chapter = 25; api.S.stage = 10;
const hpEndOfCycle = api.Combat.monsterBaseHp().v;
api.S.difficulty = 1; api.S.chapter = 1; api.S.stage = 1;
const hpNextTier = api.Combat.monsterBaseHp().v;
check('어려움 1-1 몬스터 HP > 기본 25-10 HP', hpNextTier > hpEndOfCycle, `${hpNextTier} vs ${hpEndOfCycle}`);
check('절대 챕터: 어려움 1-1 = 26', api.curAbsChapter() === 26, api.curAbsChapter());
check('절대 챕터: 헬 25-10 = 100', api.absChapter(3, 25) === 100, api.absChapter(3, 25));
// 100 스테이지를 한 줄로 훑어 단조 증가인지 본다(경계 4곳 전부 포함)
let prevHp = -1, mono = true, monoAt = '';
for (let t = 0; t <= api.MAX_DIFFICULTY && mono; t++)
    for (let c = 1; c <= api.CHAPTERS_PER_CYCLE && mono; c++)
        for (let s = 1; s <= 10 && mono; s++) {
            api.S.difficulty = t; api.S.chapter = c; api.S.stage = s;
            const hp = api.Combat.monsterBaseHp().v;
            if (!(hp > prevHp) || !Number.isFinite(hp)) { mono = false; monoAt = `${t}:${c}-${s} → ${hp} (직전 ${prevHp})`; }
            prevHp = hp;
        }
check('1000스테이지 전 구간 몬스터 HP 단조 증가 + 유한', mono, monoAt);

// ⑥ 1장 보스 완화는 기본 순환 1-1 에서만 — 어려움 1-1 은 완화 없음
reset();
check('기본 1-1 보스 완화 적용', api.Combat.bossEase() < 1, api.Combat.bossEase());
api.S.difficulty = 1;
check('어려움 1-1 은 완화 없음', api.Combat.bossEase() === 1, api.Combat.bossEase());

// ⑦ 첫 클리어 키: 티어 0 은 옛 글자 그대로, 티어가 붙으면 접두가 생겨 티어별로 다시 성립
reset();
api.S.chapter = 3; api.S.stage = 5;
check('티어 0 키는 구세이브와 동일한 "3-5"', api.stageKey() === '3-5', api.stageKey());
api.S.difficulty = 2;
check('티어 2 키는 "d2:3-5"', api.stageKey() === 'd2:3-5', api.stageKey());
reset();
api.S.clearedBosses['1-1'] = true;     // 기본 순환 1-1 은 이미 깬 구세이브
api.S.difficulty = 1;
clearOnce();
check('어려움 1-1 은 첫 클리어가 다시 성립', toasts.some(t => /첫 클리어/.test(t)), toasts);
reset();
api.S.clearedBosses['1-1'] = true;
clearOnce();
check('기본 1-1 재클리어는 보너스 없음(구세이브 보존)', !toasts.some(t => /첫 클리어/.test(t)), toasts);

// ⑧ 해금·마일스톤이 되감기지 않는다 — 티어가 오르면 챕터는 1로 돌아가지만 진행도는 오른다
reset();
api.S.difficulty = 1; api.S.chapter = 1; api.S.stage = 1;
api.S.bestDifficulty = 1; api.S.bestChapter = 1; api.S.bestStage = 1;
check('어려움 1-1 에서도 2-10 해금 유지', api.isUnlocked('dungeon'), api.bestRank());
check('어려움 1-1 에서도 10-5 패스 마일스톤 도달', api.Pass.reached('10-5'), api.bestAbsChapter());
check('어려움 1-1 에서도 던전(2-10) 해금 유지', api.Dungeons.unlocked('hammer'), api.bestRank());

// ⑨ 최고 기록은 절대 랭크로 갱신된다(생 챕터 비교였으면 티어 상승에서 멈춘다)
reset();
api.S.chapter = 25; api.S.stage = 10; api.S.bestChapter = 25; api.S.bestStage = 10;
clearOnce();
check('티어 상승 뒤 best 가 따라 올라간다',
    api.S.bestDifficulty === 1 && api.S.bestChapter === 1 && api.S.bestStage === 1 && api.bestRank() === 2601,
    `${api.S.bestDifficulty}:${api.S.bestChapter}-${api.S.bestStage} rank=${api.bestRank()}`);

// ⑩ 손상 세이브 보정: 범위 밖 티어·챕터가 라벨/전진을 깨지 않게 잘린다
reset();
api.S.difficulty = 99; api.S.bestDifficulty = 99; api.S.chapter = 400; api.S.bestChapter = 400;
api.pruneDanglingRefs ? api.pruneDanglingRefs() : null;
check('티어 상한 클램프', api.S.difficulty === api.MAX_DIFFICULTY, api.S.difficulty);
check('챕터 상한 클램프', api.S.chapter === api.CHAPTERS_PER_CYCLE, api.S.chapter);
check('클램프 뒤 라벨이 온전', api.stageName() === `헬 25-${api.S.stage}`, api.stageName());
reset();
api.S.difficulty = -5;
api.pruneDanglingRefs();
check('음수 티어는 0으로', api.S.difficulty === 0, api.S.difficulty);

// ⑪ 사망 후퇴는 티어를 절대 안 깎는다 (어려움 1-1 에서 죽어도 기본 25-10 으로 안 넘어간다)
reset();
api.S.difficulty = 1; api.S.chapter = 1; api.S.stage = 1;
api.Combat.hero.hp = mkBig(0);
api.Combat.onDefeat();
check('어려움 1-1 사망 → 어려움 1-1 유지', at() === '1:1-1', at());
reset();
api.S.difficulty = 2; api.S.chapter = 4; api.S.stage = 7;
api.Combat.onDefeat();
check('매우 어려움 4-7 사망 → 4-6', at() === '2:4-6', at());

// ⑫ 라벨: 기본 순환은 옛 규칙(원본 근거 shot-042705 '어려움 3-1') 그대로 유지
reset();
check('기본 1장 = 쉬움', api.stageDifficultyLabel(1, 0) === '쉬움', api.stageDifficultyLabel(1, 0));
check('기본 3장 = 어려움(원본 근거)', api.stageDifficultyLabel(3, 0) === '어려움', api.stageDifficultyLabel(3, 0));
check('기본 4장 = 어려움(원본 근거)', api.stageDifficultyLabel(4, 0) === '어려움', api.stageDifficultyLabel(4, 0));
check('기본 25장 = 매우 어려움', api.stageDifficultyLabel(25, 0) === '매우 어려움', api.stageDifficultyLabel(25, 0));

console.log(fail === 0 ? '\n■ 전부 PASS' : `\n■ ${fail}건 FAIL`);
process.exit(fail ? 1 : 0);
