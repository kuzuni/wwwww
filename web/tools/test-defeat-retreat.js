// 사망 시 1스테이지 후퇴 회귀 테스트 — combat.js의 onDefeat만 vm 샌드박스에서 돌린다.
// 브라우저 없이 로직만 검증한다(3D·UI는 스텁). node tools/test-defeat-retreat.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 최상위 `const Combat`은 vm 컨텍스트의 전역 프로퍼티가 되지 않으므로 꼬리에 노출 한 줄을 붙인다.
const src = fs.readFileSync(path.join(__dirname, '../js/combat.js'), 'utf8') + '\n;globalThis.Combat = Combat;';

function makeCtx() {
    const toasts = [];
    const calls = { topBar: 0, stageLabel: 0, save: 0, heroDown: 0, dungeonFail: 0 };
    const ctx = {
        S: { chapter: 1, stage: 1, bestChapter: 1, bestStage: 1 },
        UI: {
            toast: m => toasts.push(m),
            renderTopBar: () => calls.topBar++,
            updateStageLabel: () => calls.stageLabel++,
        },
        Dungeons: { run: null, onFail: () => calls.dungeonFail++ },
        Scene3D: { heroDown: () => calls.heroDown++, heroRevive() {}, clearEnemies() {} },
        SFX: { setMusicMode() {} },
        U: { now: () => 1000, clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
        Big: { of: v => v, ONE: 1 },
        saveGame: () => calls.save++,
        console,
    };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    // hero.maxHp 대입은 Big을 타지 않게 숫자로 스텁
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
