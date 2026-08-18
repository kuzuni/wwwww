// 펫 칸·탈것 칸 제한 해제 검증 (TODO `pet-mount-slot-unlimited`, 사용자 지시 2026-08-18 "펫칸 제한없게 해라, 탈것도")
// node tools/test-slot-unlimited.js
//
// 브라우저 없이 돌린다 — state.js / pets.js / mounts.js / scene3d.js 를 최소 스텁 위에서 그대로 평가하고,
// ① 구세이브 이관 ② activeMount 호환 접근자 ③ 무제한 장착 ④ 스탯 합산 ⑤ 대열 좌표를 검사한다.
// scene3d.js는 THREE·DOM에 걸려 있어 통째로는 못 올리므로, 대열 함수(formationSpot·PET_*/MOUNT_ARC)만
// 소스에서 떼어내 평가한다 — 검사 대상이 순수 기하 계산이라 그걸로 충분하고, 떼어낸 부분이 원본과
// 어긋나면 아래 SNIP 어서션이 먼저 터진다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const NOW = 1755000000000;
const store = {};
let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

// ── 샌드박스: state/pets/mounts 가 기대는 최소 전역만 세운다 ────────────────────────
const RARITIES = ['common', 'rare', 'epic', 'legendary', 'ultimate', 'mythic'];
const big = n => ({ n, add(o) { return big(this.n + o.n); }, mul(k) { return big(this.n * (k.n !== undefined ? k.n : k)); } });
const sandbox = {
    window: {}, console, RARITIES,
    U: {
        now: () => NOW, clamp: (v, a, b) => Math.min(b, Math.max(a, v)),
        rollSubs: () => [{ key: 'atk', value: 1 }], choice: a => a[0],
        weightedPick: r => Object.keys(r)[0], chance: () => false, rand: (a, b) => (a + b) / 2,
    },
    Big: { ZERO: big(0) },
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
    },
    location: { reload() {} },
    SKILL_DEFS: [{ id: 'powerStrike' }],
    Skills: { MAX_ACTIVE: 3 },
    TechTree: {
        offlineCapMult: () => 1, offlineCoinMult: () => 1, offlineHammerMult: () => 1,
        petDmgMult: () => 1, petHpMult: () => 1, mountDmgMult: () => 1, mountHpMult: () => 1,
        mountCostMult: () => 1, extraEggChance: () => 0, extraMountChance: () => 0, hatchSpeedMult: () => 1,
    },
    // 펫 1마리 = 장비 8부위 합의 1/POWER_DIV, 탈것 1마리 = 8부위 합 전체. 등급별 기준치는 10^등급으로 단순화.
    Forge: { levelMult: lv => 1 + (lv - 1) * 0.01, gearSumAtkAt: r => 100 * (RARITIES.indexOf(r) + 1), gearSumHpAt: r => 200 * (RARITIES.indexOf(r) + 1) },
    Ascension: { count: () => 0, starMult: () => big(1) },
    Combat: { recalcHero() {} },
    SFX: { gacha() {} },
    UI: { toast() {} },
    UNLOCKS: [],
    mountSummonRates: { 1: { needed: 2, common: 1 }, 50: { needed: 'MAX', common: 1 } },
    mountNames: { common: ['Brown Horse', 'Bike', 'Pig'] },
    WINDERS_PER_SUMMON: 1,
    baseHatchingTimes: { common: 1 },
    petStats: { common: [{ name: 'Dog' }] },
    skillRatesData: { 1: [1, 0, 0, 0, 0, 0] },
    eggDropRates: { '10-10': { common: 1 } },
    RARITY_KR: { common: '일반' }, PET_KR: {}, MOUNT_KR: {},
    // icongen.js 는 이 하네스가 안 싣는데 state.js 의 defaultState() 가 이 상수를 쓴다 —
    // 안 넣으면 `DEFAULT_AVATAR is not defined` 로 하네스가 통째로 죽는다(2026-08-18 실제로 그랬다).
    DEFAULT_AVATAR: '🛡️',
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
const J = f => path.join(__dirname, '..', 'js', f);
// ⚠️ 이 파일들은 `const Pets = {...}` 형태라 vm 컨텍스트의 **렉시컬 스코프**에 들어간다 — sandbox의
//    프로퍼티가 되지 않아 `sandbox.Pets`로는 안 잡힌다. 한 스크립트로 이어 붙이고 끝에서 값을 꺼낸다.
const SRC = ['state.js', 'pets.js', 'mounts.js'].map(f => fs.readFileSync(J(f), 'utf8')).join('\n;\n');
const { Pets, Mounts } = vm.runInContext(`${SRC}\n;({ Pets, Mounts });`, sandbox, { filename: 'game-modules.js' });
const S = () => sandbox.window.S;
const setS = raw => { store['forgeclone_save_v1'] = raw; sandbox.loadGame(); };

// ── ① 구세이브 이관 + 호환 접근자 ─────────────────────────────────────────────
console.log('■ 구세이브 이관(activeMount 문자열 → activeMounts 배열)');
setS(JSON.stringify({ version: 1, mounts: { 'Brown Horse': { rarity: 'common', level: 3, dupes: 0, subs: [] } }, activeMount: 'Brown Horse' }));
check('이관-a 구세이브의 장착 탈것이 배열로 살아남는다', JSON.stringify(S().activeMounts) === '["Brown Horse"]', S().activeMounts);
check('이관-b 호환 접근자 읽기 = 타고 있는 탈것', S().activeMount === 'Brown Horse', S().activeMount);
check('이관-c Mounts.ridden()도 같은 값', Mounts.ridden() === 'Brown Horse', Mounts.ridden());
// 저장에는 activeMounts만 남아야 한다 — 접근자가 enumerable이면 구 필드가 되살아나 이관이 매번 재실행된다
sandbox.saveGame();
const saved = JSON.parse(store['forgeclone_save_v1']);
check('이관-d 세이브에 구 필드(activeMount)가 안 실린다', !('activeMount' in saved), Object.keys(saved).filter(k => k.startsWith('activeMount')));
check('이관-e 세이브에 activeMounts가 실린다', JSON.stringify(saved.activeMounts) === '["Brown Horse"]', saved.activeMounts);
// 검증 스크립트들이 쓰는 쓰기 경로
S().activeMount = 'Bike';
check('이관-f 접근자 쓰기 = 그 한 마리만 장착', JSON.stringify(S().activeMounts) === '["Bike"]', S().activeMounts);
S().activeMount = null;
check('이관-g 접근자에 null 쓰기 = 전부 해제', S().activeMounts.length === 0, S().activeMounts);
// 이관 후 다시 로드해도 값이 유지돼야 한다(두 번째 부팅 회귀)
setS(JSON.stringify({ version: 1, mounts: { 'Pig': { rarity: 'common', level: 1, dupes: 0, subs: [] } }, activeMounts: ['Pig'] }));
check('이관-h 신형 세이브는 그대로 통과', JSON.stringify(S().activeMounts) === '["Pig"]', S().activeMounts);

// ── ② 참조 정리: 없는 탈것 이름·중복 ────────────────────────────────────────
console.log('■ 참조 정리');
setS(JSON.stringify({
    version: 1, mounts: { 'Bike': { rarity: 'common', level: 1, dupes: 0, subs: [] } },
    activeMounts: ['Bike', 'Bike', 'GhostMount', 42, null],
}));
check('참조-a 없는 이름·중복·비문자열 제거', JSON.stringify(S().activeMounts) === '["Bike"]', S().activeMounts);

// ── ③ 펫: **출전은 3마리까지**, 보유는 무제한 ───────────────────────────────
// ⚠️ 2026-08-18 사용자 지시(`pet-equip-max3`)로 출전 상한이 3으로 돌아왔다 —
//    "제한 없다는 건 인벤토리 얘기고, 3개까지만 장착". 보유(S.pets)는 계속 무제한이다.
console.log('■ 펫 출전 3마리 상한 + 보유 무제한');
setS(JSON.stringify({ version: 1, pets: Array.from({ length: 9 }, (_, i) => ({ name: 'p' + i, rarity: 'common', level: 1, dupes: 0, xp: 0, subs: [] })) }));
for (let i = 0; i < 3; i++) check(`펫-장착 ${i + 1}번째 성공`, Pets.toggleActive(i) === true, i);
check('펫-a0 4번째는 상한에 막힌다', Pets.toggleActive(3) === false && S().activePets.length === 3, S().activePets);
check('펫-a1 canActivate 가 상한을 미리 알려 준다', Pets.canActivate(3) === false && Pets.canActivate(0) === true);
check('펫-a 보유는 9마리 그대로(상한은 출전에만)', S().pets.length === 9, S().pets.length);
check('펫-b 재클릭은 해제(해제는 상한과 무관)', Pets.toggleActive(1) === true && S().activePets.indexOf(1) < 0, S().activePets);
check('펫-b1 한 칸 비면 새 펫이 들어간다', Pets.toggleActive(3) === true && S().activePets.length === 3, S().activePets);
check('펫-c 없는 펫은 실패', Pets.toggleActive(99) === false);
// 마리당 기여도는 출전 수와 무관해야 한다(나눗수를 출전 수에 연동하면 늘릴수록 손해가 된다)
const one = Pets.petPower(S().pets[0]).atk.n;
check('펫-d 마리당 공격력이 출전 수에 흔들리지 않는다', Math.abs(one - 100 / Pets.POWER_DIV) < 1e-9, one);
check('펫-e 합산은 마리 수에 비례', Math.abs(Pets.activeBonus().atk.n - one * S().activePets.length) < 1e-9, Pets.activeBonus().atk.n);
// 재로드해도 3마리가 유지된다(상한 자르기가 멀쩡한 3마리를 더 깎으면 여기서 걸린다)
sandbox.saveGame(); setS(store['forgeclone_save_v1']);
check('펫-f 재로드해도 3마리 유지', S().activePets.length === 3, S().activePets.length);
// **4마리 이상 출전 중이던 기존 세이브**는 로드에서 3마리로 잘려야 한다(상한을 우회하는 유일한 구멍)
setS(JSON.stringify({ version: 1, pets: Array.from({ length: 6 }, (_, i) => ({ name: 'q' + i, rarity: 'common', level: 1, dupes: 0, xp: 0, subs: [] })), activePets: [0, 1, 2, 3, 4] }));
check('펫-g 옛 5마리 출전 세이브를 로드가 3마리로 자른다', S().activePets.length === 3 && S().activePets[0] === 0, S().activePets);

// ── ④ 탈것: **장착은 1마리** + 스탯 합산 ────────────────────────────────────
// ⚠️ 2026-08-18 사용자 지시(`mount-single-equip`)로 **탈것 장착만** 1마리로 되돌아갔다 —
//    "개수 제한 없다는 건 인벤토리(보유) 얘기고, 장착은 1개". 보유(`S.mounts`)와 펫 출전은 그대로 무제한.
console.log('■ 탈것 장착 1마리 + 합산');
const mk = (r, lv) => ({ rarity: r, level: lv, dupes: 0, stars: 0, xp: 0, subs: [{ key: 'atk', value: 1 }] });
setS(JSON.stringify({ version: 1, mounts: { A: mk('common', 1), B: mk('rare', 1), C: mk('epic', 1) }, activeMounts: [] }));
Mounts.ensure();
check('탈것-a 연달아 장착해도 1마리(마지막 것으로 교체)', ['A', 'B', 'C'].every(n => Mounts.equip(n)) && S().activeMounts.length === 1, S().activeMounts);
check('탈것-b 그 1마리가 타는 놈', Mounts.ridden() === 'C', Mounts.ridden());
const bonus = Mounts.activeBonus();
check('탈것-c 합산 = 장착한 1마리 몫 (epic 300)', Math.abs(bonus.atk.n - 300) < 1e-9, bonus.atk.n);
check('탈것-d 서브옵션도 1마리 몫', bonus.subs.length === 1, bonus.subs.length);
check('탈것-e setRidden 은 그 한 마리로 교체', Mounts.setRidden('A') && Mounts.ridden() === 'A' && S().activeMounts.length === 1, S().activeMounts);
check('탈것-f 보유는 그대로 3종(장착 제한과 무관)', Object.keys(S().mounts).length === 3, Object.keys(S().mounts));
check('탈것-g 재클릭 해제', Mounts.equip('A') && S().activeMounts.length === 0, S().activeMounts);
check('탈것-h 해제하면 합산도 0', Math.abs(Mounts.activeBonus().atk.n - 0) < 1e-9, Mounts.activeBonus().atk.n);
// 여러 마리가 장착된 **기존 세이브**는 ensure() 가 1마리로 줄인다(안 하면 제한을 넣어도 옛 목록이 남는다)
S().activeMounts = ['A', 'B', 'C'];
Mounts.ensure();
check('탈것-i 옛 다중 장착 세이브를 ensure()가 1마리로', S().activeMounts.length === 1 && S().activeMounts[0] === 'A', S().activeMounts);
// 흡수(업그레이드 재료)로 사라진 탈것은 장착 목록에서도 빠져야 한다
Mounts.equip('B');
Mounts.absorbMaterials('C', ['B']);
check('탈것-i 재료로 흡수된 탈것은 장착 해제된다', S().activeMounts.indexOf('B') < 0 && !S().mounts.B, S().activeMounts);

// ── ⑤ 대열 좌표: 마리 수가 늘어도 자리가 생기고 서로 안 겹치는가 ─────────────
console.log('■ 대열 좌표(formationSpot)');
// scene3d.js에서 대열 부분만 떼어내 평가한다. 원본과 어긋나면 여기서 먼저 터진다.
const scene = fs.readFileSync(J('scene3d.js'), 'utf8');
const cut = (from, to) => {
    const a = scene.indexOf(from), b = scene.indexOf(to);
    if (a < 0 || b < 0 || b <= a) throw new Error(`scene3d.js에서 대열 코드를 못 떼어냈다 (${from} → ${to}). 발췌 기준이 바뀌었으면 이 스크립트도 같이 고칠 것.`);
    return scene.slice(a, b);
};
const SNIP = cut('    PET_ROW0: {', '    refreshPets() {');
const geom = vm.runInNewContext(`const Scene3D = {\n${SNIP}\n};\nScene3D;`, { Math });
check('대열-0 scene3d.js에서 대열 코드를 떼어냈다', typeof geom.formationSpot === 'function' && !!geom.PET_ARC && !!geom.MOUNT_ARC);

function spots(n, arc, row0) { return Array.from({ length: n }, (_, i) => geom.formationSpot(i, arc, row0)); }
function minGap(list) {
    let m = Infinity;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        m = Math.min(m, Math.hypot(list[i][0] - list[j][0], list[i][1] - list[j][1]));
    }
    return m;
}
// 펫은 최대 25마리(petStats 고유 이름 수), 탈것은 최대 15마리 → 따라오는 무리 최대 14
for (const [label, row0] of [['탈것 없음', geom.PET_ROW0.unmounted], ['탈것 탑승', geom.PET_ROW0.mounted]]) {
    const arc = label === '탈것 탑승'
        ? { ...geom.PET_ARC, rx0: geom.PET_ARC.rx0 + geom.PET_ARC.mountedRx, rz0: geom.PET_ARC.rz0 + geom.PET_ARC.mountedRz }
        : geom.PET_ARC;
    const pts = spots(25, arc, row0);
    check(`대열-펫(${label}) 25자리 전부 유한한 좌표`, pts.every(p => Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1])), pts.filter(p => !p || !isFinite(p[0])).length);
    check(`대열-펫(${label}) 앞 3자리는 예전 값 그대로`, JSON.stringify(pts.slice(0, 3)) === JSON.stringify(row0), pts.slice(0, 3));
    const g = minGap(pts);
    check(`대열-펫(${label}) 서로 겹치지 않는다 (최소 간격 ${g.toFixed(2)} ≥ 0.60)`, g >= 0.60, g);
    // 카메라는 z 8.2에 있다 — 앞으로 너무 나오면 화면을 가리고, 뒤로 가면 영웅에 가린다
    check(`대열-펫(${label}) 전부 영웅 앞쪽(z>0)에 선다`, pts.every(p => p[1] > 0), pts.filter(p => p[1] <= 0));
    check(`대열-펫(${label}) 카메라를 밀고 들어오지 않는다 (z<5)`, pts.every(p => p[1] < 5), Math.max(...pts.map(p => p[1])));
}
const mpts = spots(14, geom.MOUNT_ARC, null);
check('대열-탈것 14자리 전부 유한한 좌표', mpts.every(p => isFinite(p[0]) && isFinite(p[1])));
const mg = minGap(mpts);
check(`대열-탈것 서로 겹치지 않는다 (최소 간격 ${mg.toFixed(2)} ≥ 0.90)`, mg >= 0.90, mg);
check('대열-탈것 전부 영웅 뒤쪽(z<0)에 선다', mpts.every(p => p[1] < 0), mpts.filter(p => p[1] >= 0));
// 뒤에 서더라도 영웅 몸통에 가리면 안 된다 — 정면(|x| 작은 자리)에 서는 놈이 없어야 한다
check('대열-탈것 영웅 등 뒤 정면에 겹치는 자리가 없다 (|x| ≥ 0.8)', mpts.every(p => Math.abs(p[0]) >= 0.8), mpts.filter(p => Math.abs(p[0]) < 0.8));
// 펫 자리(앞)와 탈것 자리(뒤)가 서로 침범하지 않아야 한다
const petAll = spots(25, geom.PET_ARC, geom.PET_ROW0.unmounted);
check('대열-혼합 펫 자리와 탈것 자리가 섞이지 않는다', minGap([...petAll, ...mpts]) >= 0.60, minGap([...petAll, ...mpts]));
// 결정적이어야 한다(Math.random 미사용) — 같은 입력에 같은 좌표
check('대열-결정적(같은 인덱스는 항상 같은 자리)', JSON.stringify(spots(25, geom.PET_ARC, geom.PET_ROW0.unmounted)) === JSON.stringify(petAll));

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
