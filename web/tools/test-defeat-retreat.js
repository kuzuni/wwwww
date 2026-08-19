// 사망 시 1스테이지 후퇴 회귀 테스트 — combat.js의 onDefeat만 vm 샌드박스에서 돌린다.
// 브라우저 없이 로직만 검증한다(3D·UI는 스텁). node tools/test-defeat-retreat.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 최상위 `const Combat`은 vm 컨텍스트의 전역 프로퍼티가 되지 않으므로 꼬리에 노출 한 줄을 붙인다.
// state.js를 **같은 스크립트로 이어 붙인다** — 사망 배너 문구가 `stageName()`(난이도 티어 표기,
// chapter-cycle-difficulty)를 타는데, 그 함수와 `S`는 state.js의 최상위 렉시컬 바인딩이라
// 스크립트를 나눠 실행하면 combat.js 쪽에서 안 보인다. 문구 규칙을 여기 손으로 베끼면
// TODO '함정 ④'(자가 코드보다 낡은 프로브)가 그대로 재발하므로 진짜 함수를 태운다.
const src = [
    fs.readFileSync(path.join(__dirname, '../js/state.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '../js/combat.js'), 'utf8'),
].join('\n;\n') + '\n;globalThis.__api = { Combat, get S() { return S; }, set S(v) { S = v; }, defaultState, ensureStateShape };';

function makeCtx() {
    const toasts = [];
    const calls = { topBar: 0, stageLabel: 0, save: 0, heroDown: 0, dungeonFail: 0, wipeEnemies: 0 };
    const ctx = {
        // 진행 상태 스텁은 뺐다 — state.js의 진짜 defaultState()가 아래에서 세운다.
        // `ctx.S`는 그 진짜 S로 연결되는 접근자로 다시 깔린다(기존 단언들이 t.ctx.S를 그대로 쓴다).
        DEFAULT_AVATAR: '🙂',
        installMountCompat: o => o,   // mounts.js 소관 — 구세이브 이관은 이 테스트 대상이 아니다
        SKILL_DEFS: [], Skills: { MAX_ACTIVE: 3 }, UNLOCKS: [],
        TechTree: { offlineCapMult: () => 1, offlineCoinMult: () => 1, offlineHammerMult: () => 1 },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        UI: {
            toast: m => toasts.push(m),
            renderTopBar: () => calls.topBar++,
            updateStageLabel: () => calls.stageLabel++,
            updateWavePips() {}, renderMenu() {}, floatLoot() {},
        },
        Dungeons: { run: null, onFail: () => calls.dungeonFail++ },
        // deathFade는 death-fade-popup(2026-08-18)이 들여온 사망 배너 — 스텁이 없어 이 테스트는
        // 한동안 첫 케이스에서 TypeError로 통째로 죽어 있었다(이번에 발견해 복구).
        // true를 돌려주는 게 실제 경로다(배너를 띄웠으면 옛 토스트로 강등하지 않는다) — 문구 단언은
        // 강등 경로를 봐야 하므로 배너를 못 띄운 환경(false)으로 둔다.
        Scene3D: {
            heroDown: () => calls.heroDown++, heroRevive() {}, clearEnemies() {}, deathFade: () => false,
            // death-enemy-remnant: 사망 순간 남은 적을 암전 뒤에서 녹여 없앤다 — 정리 호출 자체를
            // 이 테스트가 세지는 않지만, 스텁이 없으면 onDefeat 이 TypeError로 통째로 죽는다.
            deathWipeEnemies: () => calls.wipeEnemies++,
            scene: null, setChapterTheme() {}, setTheme() {},   // 던전 실패 경로의 본대 복귀 컷
        },
        SFX: { setMusicMode() {} },
        U: { now: () => 1000, clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
        Big: { of: v => v, ONE: 1 },
        window: {}, location: { reload() {} },
        console,
    };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx.__api;
    api.S = api.defaultState();
    api.ensureStateShape();
    // state.js의 진짜 `S`(최상위 렉시컬)로 연결되는 접근자 — 기존 단언들이 t.ctx.S를 그대로 쓰고,
    // Object.assign(t.ctx.S, …)도 같은 객체를 건드린다.
    Object.defineProperty(ctx, 'S', { get: () => api.S, set: v => { api.S = v; }, configurable: true });
    // state.js가 진짜 saveGame을 전역에 얹으므로(같은 스크립트) 호출 횟수만 세는 대역으로 덮는다
    ctx.saveGame = () => calls.save++;
    // hero.maxHp 대입은 Big을 타지 않게 숫자로 스텁
    ctx.Combat = api.Combat;
    ctx.Combat.hero.maxHp = 100;
    return { ctx, toasts, calls };
}

let fail = 0;
function check(name, cond, detail) {
    if (cond) console.log(`  ok   ${name}`);
    else { console.log(`  FAIL ${name} — ${detail}`); fail++; }
}

function defeat(setup) {
    const t = makeCtx();
    Object.assign(t.ctx.S, setup.S || {});
    if (setup.dungeon) t.ctx.Dungeons.run = { id: 'hammer', stage: 3 };
    t.ctx.Combat.onDefeat();
    return t;
}

console.log('사망 시 1스테이지 후퇴 — 회귀 테스트');

// ① 4-10에서 사망 → 4-9 (챕터 유지)
let t = defeat({ S: { chapter: 4, stage: 10, bestChapter: 4, bestStage: 10 } });
check('4-10 사망 → 4-9', t.ctx.S.chapter === 4 && t.ctx.S.stage === 9, `${t.ctx.S.chapter}-${t.ctx.S.stage}`);
check('4-10 사망: 최고 기록 불변', t.ctx.S.bestChapter === 4 && t.ctx.S.bestStage === 10,
    `best ${t.ctx.S.bestChapter}-${t.ctx.S.bestStage}`);
check('4-10 사망: 후퇴 토스트', /4-9로 한 스테이지 후퇴/.test(t.toasts[0] || ''), t.toasts[0]);

// ② 3-1에서 사망 → 3-1 유지 (챕터 절대 안 깎임)
t = defeat({ S: { chapter: 3, stage: 1, bestChapter: 5, bestStage: 4 } });
check('3-1 사망 → 3-1 유지(2-10 아님)', t.ctx.S.chapter === 3 && t.ctx.S.stage === 1, `${t.ctx.S.chapter}-${t.ctx.S.stage}`);
check('3-1 사망: 최고 기록 불변', t.ctx.S.bestChapter === 5 && t.ctx.S.bestStage === 4,
    `best ${t.ctx.S.bestChapter}-${t.ctx.S.bestStage}`);
check('3-1 사망: 후퇴 문구 없음', !/후퇴/.test(t.toasts[0] || ''), t.toasts[0]);

// ③ 1-1에서 사망 → 1-1 유지 (하한)
t = defeat({ S: { chapter: 1, stage: 1 } });
check('1-1 사망 → 1-1 유지', t.ctx.S.chapter === 1 && t.ctx.S.stage === 1, `${t.ctx.S.chapter}-${t.ctx.S.stage}`);

// ④ 던전 실패는 후퇴 없음 + Dungeons.onFail로 위임
t = defeat({ dungeon: true, S: { chapter: 6, stage: 7 } });
check('던전 실패: 스테이지 불변', t.ctx.S.chapter === 6 && t.ctx.S.stage === 7, `${t.ctx.S.chapter}-${t.ctx.S.stage}`);
check('던전 실패: Dungeons.onFail 호출', t.calls.dungeonFail === 1, `${t.calls.dungeonFail}회`);
check('던전 실패: 후퇴 토스트 없음', t.toasts.length === 0, JSON.stringify(t.toasts));

// ⑤ 공통 후처리 — 세이브·사망 연출·페이즈·기상 예약
t = defeat({ S: { chapter: 2, stage: 5 } });
check('저장 1회', t.calls.save === 1, `${t.calls.save}회`);
check('사망 연출 호출', t.calls.heroDown === 1, `${t.calls.heroDown}회`);
check('상단바·스테이지 라벨 즉시 갱신', t.calls.topBar === 1 && t.calls.stageLabel === 1,
    `topBar ${t.calls.topBar} / label ${t.calls.stageLabel}`);
check('phase=stageDelay + 쓰러짐 벽시계 예약', t.ctx.Combat.phase === 'stageDelay' && t.ctx.Combat.downUntil > 1000,
    `${t.ctx.Combat.phase} / downUntil ${t.ctx.Combat.downUntil}`);
check('HP 회복', t.ctx.Combat.hero.hp === 100, `${t.ctx.Combat.hero.hp}`);

// ⑥ 연속 사망 — 챕터 경계에서 멈추는지 (2-3에서 3번 죽으면 2-1에서 정지)
t = makeCtx();
Object.assign(t.ctx.S, { chapter: 2, stage: 3 });
for (let i = 0; i < 3; i++) t.ctx.Combat.onDefeat();
check('2-3에서 3연속 사망 → 2-1에서 정지', t.ctx.S.chapter === 2 && t.ctx.S.stage === 1,
    `${t.ctx.S.chapter}-${t.ctx.S.stage}`);

console.log(fail ? `\n실패 ${fail}건` : '\n전체 통과');
process.exit(fail ? 1 : 0);
