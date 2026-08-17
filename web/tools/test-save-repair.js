// 손상/부분 누락 세이브 보정 로직 검증 (QA 10차: '필드가 빠진 세이브를 읽으면 부팅이 통째로 죽는다')
// node tools/test-save-repair.js
// state.js를 브라우저 없이 돌리기 위해 최소 스텁(U·localStorage·window)만 세우고 파일을 그대로 평가한다.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const NOW = 1755000000000;
const store = {};
const sandbox = {
    window: {},
    console,
    U: { now: () => NOW, clamp: (v, a, b) => Math.min(b, Math.max(a, v)) },
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
    },
    location: { reload() {} },
    // 참조 무결성 검사용 실제 데이터 대역
    SKILL_DEFS: [{ id: 'powerStrike' }, { id: 'fireball' }],
    Skills: { MAX_ACTIVE: 3 },
    // Pets 스텁은 뺐다 — 출전 슬롯 제한이 없어져(2026-08-18) pruneDanglingRefs가 Pets를 더 안 본다.
    // 상수 스텁을 남겨 두면 "아직 상한이 있다"로 읽혀 다음 세션을 헷갈리게 한다.
    TechTree: { offlineCapMult: () => 1, offlineCoinMult: () => 1, offlineHammerMult: () => 1 },
    UNLOCKS: [],
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
// STATE_PATH로 다른 state.js를 지목할 수 있다 — 수정 전 코드로 돌려 '정말 FAIL이 나던 검사인지'
// 역방향 교차검증할 때 쓴다(검사가 통과만 하도록 쓰인 게 아님을 확인하는 용도).
const STATE_PATH = process.env.STATE_PATH || path.join(__dirname, '../js/state.js');
vm.runInContext(fs.readFileSync(STATE_PATH, 'utf8'), sandbox, { filename: 'state.js' });

const { defaultState, ensureStateShape } = sandbox;
let pass = 0, fail = 0;
function check(name, cond, detail) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

// 부팅 시 실제로 터지던 지점을 그대로 재현한다(ui.js renderSkillBar / renderPets 계열).
// 보정된 상태로 이걸 돌려서 예외가 안 나야 '정상 부팅한다'가 성립한다.
function renderProbe(S) {
    for (let i = 0; i < 3; i++) { const id = S.equippedSkills[i]; if (id) { const d = SKILL_DEFS_LOOKUP(id); void d.id; } }
    S.activePets.forEach(i => { void S.pets[i].rarity; });
    for (const slot of ['weapon', 'helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt']) {
        const it = S.equipment[slot]; if (it) void it.level;
    }
    void S.skills; void S.eggs.length; void S.hatching.length;
    void (S.summonMult.skill + S.lineAscend.forge + S.autoForge.hammersPerBatch);
    void S.settingsDummy.vibration;
    return true;
}
const SKILL_DEFS_LOOKUP = id => sandbox.SKILL_DEFS.find(d => d.id === id);

function boots(raw, label) {
    store['forgeclone_save_v1'] = raw;
    let ok = false, err = null;
    try { sandbox.loadGame(); renderProbe(sandbox.window.S); ok = true; } catch (e) { err = e; }
    check(`${label} — 부팅(렌더 프로브 통과)`, ok, err && String(err.message));
    return sandbox.window.S;
}

console.log('■ QA 10차 실측 5종 (수정 전에는 전부 같은 지점에서 죽었다)');
// ① 필드 누락 — QA 재현 절차의 세이브 그대로
let S = boots('{"version":1,"chapter":2,"stage":3,"coins":100,"hammers":5}', '① 필드 누락');
check('①-a 보존: 저장돼 있던 값은 안 덮인다', S.chapter === 2 && S.stage === 3 && S.coins === 100 && S.hammers === 5,
    { chapter: S.chapter, stage: S.stage, coins: S.coins, hammers: S.hammers });
check('①-b 보충: equippedSkills가 기본값으로 채워진다', Array.isArray(S.equippedSkills) && S.equippedSkills[0] === 'powerStrike', S.equippedSkills);
check('①-c 보충: equipment 8슬롯이 전부 생긴다', Object.keys(S.equipment).length === 8, Object.keys(S.equipment));
check('①-d 보충: skills/pets/eggs 존재', !!S.skills.powerStrike && Array.isArray(S.pets) && Array.isArray(S.eggs));

// ② equippedSkills:null
S = boots('{"version":1,"equippedSkills":null}', '② equippedSkills:null');
check('②-a null 배열이 기본값으로 교체된다', Array.isArray(S.equippedSkills) && S.equippedSkills.length === 1, S.equippedSkills);

// ③ 타입 오염
S = boots('{"version":1,"chapter":"x","pets":"nope","equipment":123,"skills":[],"autoCast":"yes"}', '③ 타입 오염');
check('③-a chapter:"x" → 숫자 기본값', S.chapter === 1, S.chapter);
check('③-b pets:"nope" → 배열', Array.isArray(S.pets) && S.pets.length === 0, S.pets);
check('③-c equipment:123 → 8슬롯 객체', S.equipment && S.equipment.weapon === null, S.equipment);
check('③-d skills:[] → 객체(배열은 객체가 아니다)', !Array.isArray(S.skills) && typeof S.skills === 'object', S.skills);
check('③-e autoCast:"yes" → 불리언', typeof S.autoCast === 'boolean', S.autoCast);

// ④ 음수값
S = boots('{"version":1,"coins":-500,"hammers":-1,"stage":-3,"chapter":0,"forgeLevel":-9,"gems":-2}', '④ 음수값');
check('④-a 재화 음수 → 0', S.coins === 0 && S.hammers === 0 && S.gems === 0, { coins: S.coins, hammers: S.hammers, gems: S.gems });
check('④-b 진행 수치 0·음수 → 1', S.stage === 1 && S.chapter === 1 && S.forgeLevel === 1, { stage: S.stage, chapter: S.chapter, forgeLevel: S.forgeLevel });

// ⑤ 초대형값 / 비유한값
S = boots('{"version":1,"coins":1e308,"gems":1e400,"tickets":null}', '⑤ 초대형값');
check('⑤-a 유한한 초대형값은 그대로 둔다(플레이로 도달 가능)', S.coins === 1e308, S.coins);
check('⑤-b Infinity(1e400) → 기본값', Number.isFinite(S.gems), S.gems);
check('⑤-c tickets:null → 숫자 기본값', typeof S.tickets === 'number' && S.tickets === 40, S.tickets);

console.log('■ 이미 정상 동작하던 경로가 그대로인지 (회귀)');
for (const [raw, label] of [['{not valid json', '깨진 JSON'], ['', '빈 문자열'], ['[]', '배열'], ['null', 'null'], ['{"version":0}', 'version:0']]) {
    S = boots(raw, `회귀 ${label}`);
    check(`회귀 ${label} → 새 게임 기본값`, S.coins === 500 && S.chapter === 1, { coins: S.coins, chapter: S.chapter });
}
// 세이브가 아예 없을 때
delete store['forgeclone_save_v1'];
check('회귀 세이브 없음 → loadGame() false + 기본값', sandbox.loadGame() === false && sandbox.window.S.coins === 500);

console.log('■ 정상 세이브를 건드리지 않는지 (가장 중요한 비회귀)');
const full = defaultState();
full.coins = 12345; full.chapter = 7; full.stage = 4; full.autoCast = false; full.summonMult = { skill: 5, pet: 25, mount: 1 };
full.skills = { fireball: { level: 9, dupes: 3, stars: 1 } };
full.equippedSkills = ['fireball'];
full.pets = [{ name: 'Turtle', rarity: 'rare', level: 3, dupes: 0 }];
full.activePets = [0];
full.equipment.weapon = { name: 'sword', level: 50 };
full.dungeons = { keys: 3 };            // 다른 모듈 ensure()가 붙인 키
full.techResearch = { id: 'atk', endsAt: NOW + 1000 };
S = boots(JSON.stringify(full), '정상 세이브');
check('정상-a 값 전부 보존', S.coins === 12345 && S.chapter === 7 && S.stage === 4 && S.autoCast === false, { coins: S.coins, chapter: S.chapter, autoCast: S.autoCast });
check('정상-b 기본 스킬이 되살아나지 않는다(skills는 지도)', !S.skills.powerStrike && S.skills.fireball.level === 9, S.skills);
check('정상-c equippedSkills 유지', S.equippedSkills.length === 1 && S.equippedSkills[0] === 'fireball', S.equippedSkills);
check('정상-d 다른 모듈 키(dungeons) 보존', S.dungeons && S.dungeons.keys === 3, S.dungeons);
check('정상-e nullable(techResearch) 객체 보존', S.techResearch && S.techResearch.id === 'atk', S.techResearch);
check('정상-f 고정 모양 안쪽 값 보존', S.summonMult.skill === 5 && S.summonMult.pet === 25, S.summonMult);
check('정상-g 장착 장비 보존', S.equipment.weapon.level === 50, S.equipment.weapon);
check('정상-h 활성 펫 보존', S.activePets.length === 1 && S.activePets[0] === 0, S.activePets);

console.log('■ 참조 무결성 (타입은 맞는데 대상이 없어 렌더가 터지던 케이스)');
S = boots('{"version":1,"equippedSkills":["ghostSkill",42,"fireball"],"pets":[],"activePets":[0,1,2]}', '참조 깨진 세이브');
check('참조-a 없는 스킬 id·숫자 제거, 실재 스킬만 남음', S.equippedSkills.length === 1 && S.equippedSkills[0] === 'fireball', S.equippedSkills);
check('참조-b pets가 빈데 activePets가 가리키면 비운다', S.activePets.length === 0, S.activePets);
S = boots('{"version":1,"pets":[{"name":"a"},null,{"name":"b"}],"activePets":[2,2,5,-1,1.5,0]}', '펫 배열 오염');
check('참조-c null 펫 제거', S.pets.length === 2, S.pets);
check('참조-d 중복·범위밖·소수 인덱스 제거', JSON.stringify(S.activePets) === '[0]', S.activePets);
S = boots('{"version":1,"equipment":{"weapon":"sword","helmet":[],"armor":{"level":3}}}', '장비 슬롯 오염');
check('참조-e 문자열·배열 슬롯 → null, 정상 슬롯 유지', S.equipment.weapon === null && S.equipment.helmet === null && S.equipment.armor.level === 3 && S.equipment.belt === null, S.equipment);

console.log('■ 보정 결과가 저장에 반영되는지 (새로고침해도 안 죽어야 한다)');
store['forgeclone_save_v1'] = '{"version":1,"chapter":2,"stage":3,"coins":100,"hammers":5}';
sandbox.loadGame();
sandbox.saveGame();
const written = JSON.parse(store['forgeclone_save_v1']);
check('저장-a 누락 필드가 세이브에 실제로 기록된다', 'equippedSkills' in written && 'skills' in written && 'equipment' in written,
    Object.keys(written).length);
check('저장-b 두 번째 로드도 정상', (() => { sandbox.loadGame(); try { return renderProbe(sandbox.window.S); } catch (e) { return false; } })());
check('저장-c 두 번째 로드 후에도 값 보존', sandbox.window.S.chapter === 2 && sandbox.window.S.coins === 100, { chapter: sandbox.window.S.chapter, coins: sandbox.window.S.coins });

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
