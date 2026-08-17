// 사망 연출이 로직 틱 캐치업 버스트에 견디는지 확인 (브라우저 불필요 — node test-death-burst.js)
// main.js:  let elapsed = Math.min(5000, now - logicLast);  while (elapsed >= 100) { Combat.tick(0.1); ... }
//  → 탭 스톨/긴 프레임 뒤 한 번의 인터벌 발화로 최대 50틱(5초치)이 연속 실행된다.
const fs = require('fs'), vm = require('vm');
const W = require('path').resolve(__dirname, '../js') + '/';
const ctx = { console, Math, Date, Object, Array, JSON, Number, String, Boolean };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(W + 'bignum.js', 'utf8'), ctx);
ctx.Big = vm.runInContext('Big', ctx);
const calls = [];
Object.assign(ctx, {
    U: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), chance: () => false, rand: (a, b) => (a + b) / 2, now: () => Date.now(), fmt: String },
    S: { equipment: {}, equippedSkills: [], autoCast: false, chapter: 1, stage: 1, clearedBosses: {}, kills: 0, coins: 0, hammers: 0, bestChapter: 1, bestStage: 1, tickets: 0, winders: 0 },
    Forge: { heroStats: () => ({ hp: ctx.Big.of(100), atk: ctx.Big.of(10), attacksPerSec: 1, critCh: 0, critDmg: 0, block: 0, lifesteal: 0, hpRegen: 0, dblAtk: 0, meleeDmg: 0, rangedDmg: 0 }) },
    UI: new Proxy({}, { get: () => () => {} }),
    SFX: new Proxy({}, { get: () => () => {} }),
    Dungeons: { run: null },
    Skills: { def: () => ({}) },
    WEAPON_TYPES: { sword: { kind: 'melee', motion: 'slash', impact: 0.2 } },
    saveGame: () => {}, stageKey: () => '1-1',
    Scene3D: new Proxy({}, { get: (o, k) => (typeof k === 'string' && k !== 'walking' ? (...a) => calls.push(k) : undefined), set: () => true }),
});
vm.runInContext(fs.readFileSync(W + 'combat.js', 'utf8'), ctx);
const C = vm.runInContext('Combat', ctx);
C.recalcHero(); C.hero.hp = C.hero.maxHp; C.phase = 'fight'; C.enemies = [];

const t0 = Date.now();
C.onDefeat();
calls.length = 0;
// 한 번의 인터벌 발화 = 최대 50틱. 실제 경과 시간은 수 ms 뿐이다.
for (let i = 0; i < 50; i++) C.tick(0.1);
const realElapsed = Date.now() - t0;

console.log(`실제 경과 시간: ${realElapsed}ms (플레이어가 본 시간)`);
console.log(`버스트 중 호출된 Scene3D: ${[...new Set(calls)].join(', ') || '(없음)'}`);
console.log(`phase=${C.phase} phaseTimer=${C.phaseTimer.toFixed(2)}`);
const revived = calls.includes('heroRevive');
const stageRestarted = calls.includes('clearEnemies') || calls.includes('spawnEnemy');
console.log(`\n판정: 사망 연출 ${revived ? '건너뜀 ❌' : '유지됨 ✅'} — ` +
    (revived ? `실제 ${realElapsed}ms 만에 기상까지 끝남 (의도: 2400ms)` : '버스트에도 쓰러진 채 유지'));
if (stageRestarted) console.log('       스테이지까지 재시작됨 — 사망 화면이 통째로 지나감 ❌');
process.exit(revived ? 1 : 0);
