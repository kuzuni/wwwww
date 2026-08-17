// 근접 대열(Combat.restackMelee) 로직 단위 테스트 — 브라우저 없이 node로만 돈다.
// 사용: node test-melee-formation.js   (종료 코드 0=PASS, 1=FAIL)
//
// probe-enemy-spacing.js는 "화면에서 겹쳐 보이나"를 재는 렌더 쪽 게이트고(뷰포트당 1분+),
// 이 테스트는 그 앞단 **대열 산수**만 본다: 자리가 서로 안 겹치게 나오는가, 앞자리가 비면
// 다시 당겨 서는가, 보스는 늘 정면인가. 회귀는 대부분 여기서 먼저 잡히고 3초면 끝난다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.resolve(__dirname, '../js/combat.js'), 'utf8');

// combat.js는 전역 스크립트라 필요한 이웃만 최소 스텁으로 세워 준다.
const halfW = new Map();   // id → 반폭 (테스트가 지정)
const sandbox = {
    Big: { of: v => v, ONE: 1 },
    U: { rand: (a, b) => (a + b) / 2, clamp: (v, a, b) => Math.min(b, Math.max(a, v)), chance: () => false, now: () => 0, fmt: String },
    S: { chapter: 1, stage: 1, equippedSkills: [], equipment: {} },
    UI: new Proxy({}, { get: () => () => { } }),
    SFX: new Proxy({}, { get: () => () => { } }),
    Forge: { heroStats: () => ({}) },
    Skills: {}, TechTree: {}, Dungeons: {}, WEAPON_TYPES: { sword: { kind: 'melee', impact: 0.2 } },
    Scene3D: {
        BOSS_SPAWN_X: 1.75,
        enemyHalfW: id => (halfW.has(id) ? halfW.get(id) : 0.5),
        spawnEnemy() { }, clearEnemies() { }, enemyMap: new Map(),
    },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
// combat.js는 `const Combat = {...}`이라 렉시컬 스코프에 묶인다 — 샌드박스 전역에 안 올라오므로
// 스크립트 마지막 식으로 값을 꺼내 받는다(파일을 건드리지 않고 그대로 로드하기 위해서다).
const Combat = vm.runInContext(SRC + '\n;Combat;', sandbox);

let fails = 0;
const check = (name, cond, detail) => {
    if (cond) { console.log(`  ok   ${name}`); return; }
    fails++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`);
};

// 적을 손으로 세운다 (spawnWave를 안 거치므로 UI/Scene3D 의존이 없다)
const mk = (id, x, hw, isBoss) => { halfW.set(id, hw); return { id, x, alive: true, isBoss: !!isBoss, speed: 1 }; };

console.log('① 자리가 서로 겹치지 않는다 (앞 적 뒷면 ~ 뒤 적 앞면)');
{
    Combat.enemies = [mk(1, 3.1, 0.82), mk(2, 4.3, 0.62), mk(3, 5.5, 0.5)];
    Combat.restackMelee();
    const q = Combat.enemies;
    check('맨 앞은 정지선 그 자체', q[0].stopX === Combat.MELEE_X, `stopX=${q[0].stopX}`);
    check('순서대로 뒤로 물러선다', q[0].stopX < q[1].stopX && q[1].stopX < q[2].stopX,
        q.map(e => e.stopX.toFixed(3)).join(' < '));
    // x로 벌린 간격이 (반폭합 × PACK + GAP) 규칙과 일치하는가
    for (let i = 1; i < q.length; i++) {
        const want = (Combat.MELEE_PACK * (sandbox.Scene3D.enemyHalfW(q[i - 1].id) + sandbox.Scene3D.enemyHalfW(q[i].id))) + Combat.MELEE_GAP;
        const got = q[i].stopX - q[i - 1].stopX;
        check(`간격 ${i - 1}→${i} 가 규칙대로`, Math.abs(got - want) < 1e-9, `got=${got.toFixed(4)} want=${want.toFixed(4)}`);
    }
    check('깊이 레인이 슬롯별로 다르다', new Set(q.map(e => e.z)).size === q.length, q.map(e => e.z).join(','));
    check('맨 앞은 z=0 (영웅 돌진선과 정렬)', q[0].z === 0);
}

console.log('② 앞자리가 비면 남은 적이 당겨 선다');
{
    Combat.enemies = [mk(1, 3.1, 0.82), mk(2, 4.3, 0.62), mk(3, 5.5, 0.5)];
    Combat.restackMelee();
    const before = Combat.enemies.map(e => e.stopX);
    // 맨 앞이 죽었다고 치고 재편성 — 도착 순서는 x로 정해지므로 x도 정지 자리로 옮겨 둔다
    Combat.enemies.forEach(e => { e.x = e.stopX; });
    Combat.enemies[0].alive = false;
    Combat.restackMelee();
    const q = Combat.enemies.filter(e => e.alive);
    check('둘째가 맨 앞자리로 승격', q[0].stopX === Combat.MELEE_X, `stopX=${q[0].stopX}`);
    check('셋째도 함께 당겨진다', q[1].stopX < before[2], `${q[1].stopX.toFixed(3)} < ${before[2].toFixed(3)}`);
    check('승격한 적의 레인이 z=0', q[0].z === 0);
}

console.log('③ 폭이 넓은 적일수록 더 넓게 자리를 받는다');
{
    Combat.enemies = [mk(1, 3.1, 0.3), mk(2, 4.3, 0.3)];
    Combat.restackMelee();
    const narrow = Combat.enemies[1].stopX - Combat.enemies[0].stopX;
    Combat.enemies = [mk(1, 3.1, 0.9), mk(2, 4.3, 0.9)];
    Combat.restackMelee();
    const wide = Combat.enemies[1].stopX - Combat.enemies[0].stopX;
    check('넓은 몸 간격 > 좁은 몸 간격', wide > narrow, `wide=${wide.toFixed(3)} narrow=${narrow.toFixed(3)}`);
}

console.log('④ 보스는 혼자이므로 늘 정면 한가운데');
{
    Combat.enemies = [mk(9, 1.75, 1.6, true)];
    Combat.restackMelee();
    check('보스 stopX = MELEE_X', Combat.enemies[0].stopX === Combat.MELEE_X);
    check('보스 z = 0', Combat.enemies[0].z === 0);
}

console.log('⑤ 대열이 안 짜인 적도 예전 동작으로 안전하게 폴백한다');
{
    check('stopXOf 폴백 = MELEE_X', Combat.stopXOf({ id: 99 }) === Combat.MELEE_X);
}

console.log(fails ? `\nFAIL ${fails}건` : '\n전부 PASS');
process.exit(fails ? 1 : 0);
