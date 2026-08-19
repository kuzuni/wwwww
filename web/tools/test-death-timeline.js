// 사망 연출 타임라인 회귀 테스트 — slug: death-enemy-remnant
//
// 지키는 불변식: **`setupStage`(옛 적 정리 + 새 스테이지 구성)는 사망 암전이 다시 걷히기
// 시작하기 전에 끝나야 한다.** 안 지켜지면 사용자가 본 그 결함 — 걷힌 화면에 직전 스테이지
// 적이 그대로 서 있는 상태 — 가 그대로 돌아온다.
//
// 왜 브라우저가 아니라 vm 인가: 이건 **벽시계 산술**이라 렌더링이 필요 없고, 렌더가 끼면
// 오히려 판정이 흐려진다(swiftshader 3fps 환경에서 실측했더니 로직 루프까지 굶어 ms 가
// 통째로 밀렸다). 화면 쪽 증거는 `probe-death-remnant.js` 가 따로 댄다.
//
// 🚨 상수를 손으로 베끼지 않는다(TODO '함정 ④' — 자가 코드보다 낡은 프로브). Combat 의
//    DEATH_* 는 vm 에서 진짜 객체로 읽고, Scene3D.DEATH_FADE 는 scene3d.js 원문에서 뽑는다
//    (15k 줄 파일 전체를 vm 에 태우면 THREE 스텁만 산더미다).
//
// 사용: node tools/test-death-timeline.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const read = f => fs.readFileSync(path.join(__dirname, '../js', f), 'utf8');

// ---- Scene3D.DEATH_FADE 를 원문에서 뽑는다 ----
const s3 = read('scene3d.js');
const mFade = s3.match(/DEATH_FADE:\s*\{([^}]*)\}/);
if (!mFade) { console.log('FAIL — scene3d.js 에서 DEATH_FADE 를 못 찾았다(이름이 바뀌었나?)'); process.exit(1); }
const FADE = {};
for (const [, k, v] of mFade[1].matchAll(/(\w+)\s*:\s*(\d+)/g)) FADE[k] = +v;

// ---- Combat 을 vm 에 올린다(상태·틱 로직 실물) ----
const src = [read('bignum.js'), read('state.js'), read('combat.js')].join('\n;\n')
    + '\n;globalThis.__api = { Combat, defaultState, ensureStateShape, get S() { return S; }, set S(v) { S = v; } };';

let clock = 100000;                       // 가짜 벽시계(ms) — 테스트가 직접 굴린다
const calls = { setupStage: 0, setupAt: -1, heroRevive: 0, reviveAt: -1, wipe: 0, wipeAt: -1 };
const ctx = {
    DEFAULT_AVATAR: '🙂',
    installMountCompat: o => o,
    SKILL_DEFS: [], Skills: { MAX_ACTIVE: 3 }, UNLOCKS: [],
    TechTree: { offlineCapMult: () => 1, offlineCoinMult: () => 1, offlineHammerMult: () => 1 },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    UI: {
        toast() {}, renderTopBar() {}, updateStageLabel() {}, updateWavePips() {},
        renderMenu() {}, floatLoot() {}, updateSkillBar() {}, renderTechTree() {},
    },
    Dungeons: { run: null, onFail() {}, def: () => ({ theme: {} }), DEFAULT_WAVES: 3 },
    Scene3D: {
        walking: false, heroDown() {}, clearEnemies() {}, deathFade: () => true,
        heroRevive() { calls.heroRevive++; if (calls.reviveAt < 0) calls.reviveAt = clock; },
        deathWipeEnemies() { calls.wipe++; if (calls.wipeAt < 0) calls.wipeAt = clock; },
        spawnEnemy() {}, enemyHalfW: () => 0.5, setTheme() {}, setChapterTheme() {},
        bossEntrance() {}, BOSS_IMPACT: 1, BOSS_SPAWN_X: 2, scene: null,
    },
    SFX: { setMusicMode() {}, hit() {} },
    U: {
        now: () => clock,
        clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
        rand: (a, b) => (a + b) / 2,
        chance: () => false,
    },
    window: {}, location: { reload() {} }, console,
};
vm.createContext(ctx);
vm.runInContext(src, ctx);
const api = ctx.__api;
api.S = api.defaultState();
api.ensureStateShape();
Object.defineProperty(ctx, 'S', { get: () => api.S, set: v => { api.S = v; }, configurable: true });
ctx.saveGame = () => {};

const C = api.Combat;
// setupStage 가 **언제** 불렸는지만 잡고 원본을 그대로 태운다(가짜 구현으로 갈면 그 안의
// clearEnemies·nextWave 순서까지 같이 검증에서 빠진다).
const realSetup = C.setupStage.bind(C);
C.setupStage = function () { calls.setupStage++; if (calls.setupAt < 0) calls.setupAt = clock; return realSetup(); };

// ---- 사망시키고 벽시계를 100ms 씩 굴린다 (main.js 로직 루프와 같은 틱) ----
api.S.chapter = 2; api.S.stage = 5;
C.setupStage();                      // 정상 스테이지 하나를 세워 fight 로 들어간다
calls.setupStage = 0; calls.setupAt = -1; calls.heroRevive = 0; calls.reviveAt = -1;
const t0 = clock;
C.onDefeat();
// 사망 **직후** 상태를 잡아 둔다 — 아래 루프의 setupStage 가 어차피 다시 채우므로 나중엔 못 본다.
const justAfter = { enemies: C.enemies.length, pending: C.pending.length };
for (let i = 0; i < 100 && calls.setupStage === 0; i++) { clock += 100; C.tick(0.1); }

const rel = ms => (ms < 0 ? null : ms - t0);
const blackAt = FADE.delay + FADE.fadeIn;                      // 암전 완전 폐쇄
const revealAt = FADE.delay + FADE.fadeIn + FADE.hold;         // 여기서부터 다시 걷힌다
const setupAt = rel(calls.setupAt);

let fail = 0;
const check = (name, cond, detail) => {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} — ${detail}`); fail++; }
};

console.log('사망 연출 타임라인 — 회귀 테스트 (death-enemy-remnant)');
console.log(`  암전: 투명 0~${FADE.delay} · 완전 폐쇄 ${blackAt} · 걷히기 시작 ${revealAt} · 끝 ${revealAt + FADE.fadeOut} (ms)`);
console.log(`  실측: 적 정리 ${rel(calls.wipeAt)}ms · 기상 ${rel(calls.reviveAt)}ms · setupStage ${setupAt}ms`);

check('① 사망 순간 옛 적을 걷는 호출이 한 번 난다', calls.wipe === 1 && rel(calls.wipeAt) === 0,
    `${calls.wipe}회 / ${rel(calls.wipeAt)}ms`);
check('② 논리 적·지연 큐도 같은 프레임에 비워진다',
    justAfter.enemies === 0 && justAfter.pending === 0,
    `enemies ${justAfter.enemies} / pending ${justAfter.pending}`);
check('③ setupStage 가 실제로 돈다(무한 대기 없음)', calls.setupStage === 1, `${calls.setupStage}회`);
check(`④ 🚨 setupStage(${setupAt}ms) 가 암전이 걷히기 전(${revealAt}ms)에 끝난다`,
    setupAt !== null && setupAt <= revealAt, `${setupAt}ms > ${revealAt}ms — 리빌 화면에 옛 스테이지가 남는다`);
check('⑤ 기상(heroRevive)도 암전 안에서 지나간다',
    rel(calls.reviveAt) !== null && rel(calls.reviveAt) >= blackAt - FADE.fadeIn && rel(calls.reviveAt) <= revealAt,
    `${rel(calls.reviveAt)}ms`);
check('⑥ 여유 ≥ 300ms (한 프레임 밀려도 안 새게)', setupAt !== null && revealAt - setupAt >= 300,
    `여유 ${revealAt - setupAt}ms`);
check('⑦ 사망 읽기 구간 보존: 쓰러짐 유지 ≥ 쓰러짐 클립 1.3초', C.DEATH_DOWN_MS >= 1300, `${C.DEATH_DOWN_MS}ms`);

console.log(fail ? `\n실패 ${fail}건` : '\n전체 통과');
process.exit(fail ? 1 : 0);
