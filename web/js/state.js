// ===== 게임 상태 + 저장/로드 + 오프라인 보상 =====
const SAVE_KEY = 'forgeclone_save_v1';
const OFFLINE_CAP_SEC = 4 * 3600;   // 원본: 기본 4시간 캡
const OFFLINE_COIN_PER_SEC = 1;     // 원본: 초당 코인 1
const OFFLINE_HAMMER_PER_MIN = 1;   // 원본: 분당 해머 1

// ===== 난이도 순환 (chapter-cycle-difficulty, 사용자 지시 2026-08-19) =====
// "25챕터 넘어가서 26챕터 되어야 할 때 (어려움)1-1 이걸로 시작해서 맵 순환하게 하기. 어려움→매우어려움→헬."
// 26챕터라는 별도 챕터가 있는 게 아니라, **맵 25종을 한 바퀴 돌면 난이도 티어를 한 칸 올리고
// 챕터를 1로 되감는다** — 그 자리가 '어려움 1-1'이다. 맵(CHAPTER_THEMES)은 티어와 무관하게 재사용된다.
// 사이클 길이 = **맵 종류 수**(gamedata.js CHAPTER_THEMES, main-stage-25-maps 로 25종). 상수를 따로 박으면
// 맵을 더 늘렸을 때 두 값이 갈라져 ⓐ 상한이 작으면 그 위 챕터 맵을 영영 못 보고 ⓑ 크면 없는 테마를
// (chapter-1)%len 으로 되풀이한다. vm 로직 테스트가 gamedata.js 없이 state.js만 태울 때를 위한 폴백이 25.
const CHAPTERS_PER_CYCLE = (typeof CHAPTER_THEMES !== 'undefined' && CHAPTER_THEMES.length) || 25;
// 인덱스 = S.difficulty. 0은 기본 순환(라벨을 챕터에서 뽑던 옛 규칙 그대로 — UI.difficultyLabel).
// 1~3만 티어 이름을 그대로 접두로 쓴다. '헬'이 마지막이라 그 뒤로는 더 순환하지 않는다.
const DIFFICULTY_NAMES = ['', '어려움', '매우 어려움', '헬'];
const MAX_DIFFICULTY = DIFFICULTY_NAMES.length - 1;
// 챕터 하나의 스테이지 수. `combat.js` 가 `S.stage >= 10` 으로 되감던 그 10 이고, 손상 세이브
// 클램프도 이 값을 쓴다 (2026-08-19 QA 18차 state-stage-forge-no-upper-clamp — 상한이 없어
// `stage: 99999` 가 그대로 살아 라벨이 "어려움 3-99999" 로 찍히고 패스·던전이 전부 해금됐다).
const STAGES_PER_CHAPTER = 10;

// 난이도 티어를 포함한 '절대 챕터' — 티어가 올라가도 적 스펙·보상 커브가 끊기지 않게
// 챕터 축을 1..∞ 로 편다 (티어 0 챕터 1 = 1, 티어 1 챕터 1 = 26, 티어 3 챕터 25 = 100).
// 적 HP·코인·해머는 전부 이 값을 지수로 쓰므로 티어가 오르면 스펙이 그대로 이어서 오른다.
function absChapter(tier, chapter) { return U.clamp(tier || 0, 0, MAX_DIFFICULTY) * CHAPTERS_PER_CYCLE + chapter; }
function curAbsChapter() { return absChapter(S.difficulty, S.chapter); }
function bestAbsChapter() { return absChapter(S.bestDifficulty, S.bestChapter); }
// 진행도 비교용 단조 랭크 — 옛 `chapter*100 + stage` 를 절대 챕터로 갈아끼운 것.
// ⚠️ 티어가 생긴 뒤로 `S.chapter*100+S.stage` 직접 비교는 전부 틀린다(티어 1 의 1-1 이 티어 0 의 25-10 보다 작아진다).
function progressRank(tier, chapter, stage) { return absChapter(tier, chapter) * 100 + stage; }
function curRank() { return progressRank(S.difficulty, S.chapter, S.stage); }
function bestRank() { return progressRank(S.bestDifficulty, S.bestChapter, S.bestStage); }

// 챕터 기준 난이도 표기. 원본 실측 근거: shot-042705(진행 패스)의 마일스톤 라벨이
// '어려움 3-1'·'어려움 4-15' — 챕터 3·4 가 둘 다 '어려움'이다(상단바 '어려움 4-1'과도 일치).
// 챕터 1·2 와 상한 임계값은 원본 미확보라 자체 설계 유지(쉬움/보통 한 챕터씩).
// 티어(chapter-cycle-difficulty)가 붙으면 **티어 이름이 곧 난이도 표기**다 — 사용자가 '어려움→매우어려움→헬'로
// 못 박았으므로 챕터에서 뽑지 않는다. 티어 0(기본 순환)만 위 원본 근거대로 챕터에서 뽑는다.
function stageDifficultyLabel(chapter, tier = 0) {
    if (tier > 0) return DIFFICULTY_NAMES[U.clamp(tier, 1, MAX_DIFFICULTY)];
    if (chapter <= 1) return '쉬움';
    if (chapter <= 2) return '보통';
    if (chapter <= 8) return '어려움';
    return '매우 어려움';
}

// 사람이 읽는 스테이지 표기 "어려움 3-5". 상단 라벨·토스트·사망 배너가 전부 이걸 쓴다 —
// 티어가 붙은 뒤로 `${S.chapter}-${S.stage}`만 찍으면 어느 순환인지 화면에서 사라진다.
function stageName(chapter = S.chapter, stage = S.stage, tier = S.difficulty) {
    return `${stageDifficultyLabel(chapter, tier)} ${chapter}-${stage}`;
}

let S = null;

/* 캡처 하네스 지원: `let S` / `const UI` 같은 최상위 렉시컬 전역은 window 프로퍼티가 아니라서
   Playwright의 waitForFunction(격리 컨텍스트)에서 안 보인다 — 검증 스크립트들이 20초 타임아웃으로
   전부 멈추던 원인. window에 접근자를 걸어 두면(S는 재할당되므로 getter) 두 세계에서 똑같이 보인다.
   게임 코드는 계속 렉시컬 `S`를 참조하므로(렉시컬이 window 프로퍼티를 가림) 동작 변화는 없다. */
Object.defineProperty(window, 'S', { get: () => S, configurable: true });

function defaultState() {
    return installMountCompat({
        version: 1,
        createdAt: U.now(),
        lastSeen: U.now(),
        nickname: '용사', // 프로필 카드 표시명 (프로필 팝업에서 편집 가능 — UI-SPEC 19번)
        avatarEmoji: DEFAULT_AVATAR, // 프로필 아바타 (프로필 팝업에서 이모지 선택 가능)
        gender: '♂', // 프로필 성별 표시 (더미 토글, UI-SPEC 19번)
        musicOn: true, // 설정 팝업 음악 토글 (실동작 — SFX 프로시저럴 앰비언트)
        settingsDummy: { vibration: true, chatShow: true, chatDark: false, clanChatPreview: true }, // 설정 팝업 더미 토글 4종
        lastOfflineClaim: U.now(), // 오프라인 보상 마지막 수령 시각 (자동 모달 + 수동 버튼 공용)
        // 진행
        chapter: 1, stage: 1,           // 현재 도전 스테이지 (챕터는 사이클 안에서만 1~25)
        difficulty: 0,                  // 난이도 티어(0=기본, 1=어려움, 2=매우 어려움, 3=헬) — 25챕터 완주마다 +1
        bestChapter: 1, bestStage: 1, bestDifficulty: 0,
        kills: 0, totalCrafts: 0,
        clearedBosses: {},              // "1-5": true → 첫 클리어 보상용
        // 재화
        hammers: 80, coins: 500, gems: 0, tickets: 40, winders: 0, potions: 0, eggCurrency: 0,
        petSummonCount: 0,              // 누적 펫 소환 수 → 소환 레벨 상승
        summonMult: { skill: 1, pet: 1, mount: 1 }, // 소환 배수 (x1→x5→x25→x75 순환, 사용자 지시 — 구세이브는 UI.summonMult()가 1로 폴백)
        hatchSlotBonus: 0,               // 부화장 슬롯 젬 구매 수 (기본 2칸 + 이 값)
        techResearch: null,             // 기술 트리 연구 중: {id, endsAt} | null (전역 1건)
        // 승천(라인 단위 프레스티지) — 라인별 승천 횟수 = 이후 그 라인 획득물의 별 개수
        lineAscend: { forge: 0, skill: 0, pet: 0, mount: 0 },
        // 대장간
        forgeLevel: 1,
        rollLevel: {},                  // 시대(age) → 그 시대의 현재 뽑기 레벨. 빈 객체면 Forge.ensureRollLevels()가 전부 1로 채움 (원본 규칙 ①③)
        forgeUpgradeEndsAt: null,       // 절대시각(ms). null이면 미진행
        // 판매/장착을 아직 고르지 않은 제작품. 비교 팝업은 닫기 버튼이 없는 강제 선택 팝업이라
        // 여기 남겨 두지 않으면 새로고침·탭 종료 때 해머만 소모되고 결과물이 사라진다(부팅 시 팝업 복원).
        pendingCraft: null,
        // 자동 제련에서 필터를 통과했지만 아직 비교 팝업으로 처리하지 않은 장비들 (autoforge-show-all-cards
        // 3차 사양 2026-08-19: 사이클 카드를 다 보여준 뒤 팝업을 몰아서 처리). 대기품 1슬롯과 달리 여러 개가
        // 될 수 있어 배열이고, 여기 안 남기면 연출 도중 새로고침에 해머만 먹고 통과분이 증발한다.
        autoMatchQueue: [],
        // 자동 제련 한 배치로 **한꺼번에** 뽑아 카드판에 펴고 있는 장비들 (autoforge-cards-at-once
        // 사용자 지시 2026-08-20: "10개 망치 썼으면 카드 10개 한 번에"). 종전엔 1개씩 뽑아
        // pendingCraft 1슬롯에 담았기에 이 배열이 필요 없었는데, N개를 미리 뽑는 순간
        // **카드가 떠 있는 동안 새로고침하면 해머만 먹고 N개가 통째로 증발**한다 — 그걸 막는 자리다.
        // 제작과 같은 저장에 묶여 적재되고, 비우는 곳은 UI.drainAutoBatch 하나뿐이다.
        autoBatch: null,
        // 위 큐가 '처리 대기열'이 아니라 **사용자가 손으로 멈춰 둔 보류 목록**인 상태 (autoforge-dim-hold-all
        // 2026-08-19). 자동 제련 비교 팝업의 딤을 누르면 켜진다: 남은 통과분을 자동으로 열지 않고
        // 모루 자리 카드로만 두었다가, 카드를 누를 때 하나씩 비교 팝업을 다시 연다. 자동 제련을 다시
        // 켜면 꺼진다. 큐와 별도 플래그인 이유 — 큐 자체는 두 모드가 같은 배열을 쓰고, 다른 건
        // '자동으로 팝업을 여는가'뿐이라 항목을 옮기면 새로고침 복원 경로가 두 벌이 된다.
        autoMatchHeld: false,
        autoForgeOn: false,
        autoForge: {                    // 자동 제련 설정 (UI-SPEC 21~24번 자동 제련 팝업)
            keepAges: [],                // 유지 시대 체크 목록 (빈 배열 = 전체 허용)
            filterOn: false,             // 옵션 필터 켜짐 여부
            filterSubs: [],              // 필터 통과 조건 서브스탯 키 목록
            hammersPerBatch: 10,         // 1회 제련 사이클당 소모 망치 수 (1~22)
            stopOnTarget: false,         // 켜면 목표 장비를 찾는 순간 배치 정지 + 비교 팝업. 기본은 예산 끝까지 계속
                                         // (옛 필드 continueOnTarget은 forge.js autoForgeConfig()가 마이그레이션)
        },
        // 장비: slot → item | null
        equipment: { weapon: null, helmet: null, armor: null, gloves: null, necklace: null, ring: null, shoes: null, belt: null },
        // 펫 (시작 알 1개 지급)
        eggs: [{ rarity: 'common' }],   // 미부화 알: {rarity}
        hatching: [],                   // 부화 중: {rarity, endsAt} 최대 2슬롯
        pets: [],                       // {name, rarity, level, dupes}
        activePets: [],                 // 출전 중인 pets 배열 인덱스. **출전은 3마리까지**(`Pets.MAX_ACTIVE`, 사용자 지시 2026-08-18) — 보유는 무제한
        // 스킬 (시작 스킬: 강타)
        skills: { powerStrike: { level: 1, dupes: 0, stars: 0 } },
        equippedSkills: ['powerStrike'],
        autoCast: true,
        sfxOn: true,
        summonCount: 0,                 // 소환 누적 → 소환 레벨 상승
        // 마운트
        mountOpens: 0,                  // 누적 소환 수 → 마운트 레벨 상승
        // 탈것 인벤 = **펫과 같은 개체 배열** (사용자 지시 2026-08-19: 같은 종류를 여러 개, 개체마다 옵션 차등, 합성 업글).
        // ⚠️ 기본값의 **타입**이 곧 shape 검사 기준이다 — `{}` 로 두면 배열 세이브가 매번 초기화된다.
        mounts: [],                     // [{name, rarity, level, xp, stars, subs}] — 장착은 이 배열의 인덱스로 가리킨다
        // 장착 중인 마운트 이름 목록. 개수 제한 없음 (사용자 지시 2026-08-18 "탈것도").
        // [0]이 영웅이 실제로 올라타는 탈것이고, 나머지는 3D에서 뒤쪽에 따라다닌다(Scene3D.refreshMount).
        activeMounts: [],
        // 반복 퀘스트 (사용자 지시 2026-08-18) — 날짜·일차 개념 없음. 항상 3개가 떠 있고
        // 수령한 자리만 즉시 새로 뽑힌다. 형태는 Quests.ensure()가 잡는다.
        quests: [],                     // [{id, need, prog, rw:{cur, amt}}]
        questsCleared: 0,               // 누적 수령 수 → 요구치·보상 배수
    });
}

// 구 필드 `S.activeMount`(문자열 1개) 호환 접근자.
// 정식 상태는 이제 `S.activeMounts` 배열이지만, tools/ 아래 검증 스크립트 12개가 `S.activeMount = 'x'`로
// 장면을 세팅한다 — 그쪽을 전부 고치는 대신 읽기/쓰기를 배열로 옮겨 주는 얇은 층을 둔다.
//   읽기: 타고 있는 탈것(=activeMounts[0]) | null    쓰기: null → 전부 해제, 이름 → 그 하나만 장착
// enumerable:false 라 JSON.stringify(S)에 안 실린다 — 세이브에는 activeMounts만 남는다.
function installMountCompat(st) {
    if (!st || Object.getOwnPropertyDescriptor(st, 'activeMount')?.get) return st;
    delete st.activeMount;
    // ⚠️ 인벤이 개체 배열이 되면서(2026-08-19) `activeMounts` 는 **인덱스**를 담는다.
    //    tools/ 검증 스크립트는 여전히 `S.activeMount = '이름'` 으로 장면을 세우므로, 이 층에서
    //    이름 ↔ 인덱스를 옮겨 준다(읽기는 이름, 쓰기는 이름·인덱스 둘 다 받는다).
    //    쓰기에서 그 이름의 개체가 아직 없으면 하나 만들어 준다 — 스크립트가 인벤을 안 세우고
    //    바로 장착만 하는 경우가 있어서다(예전엔 맵이라 그래도 동작했다).
    Object.defineProperty(st, 'activeMount', {
        get() {
            const i = this.activeMounts && this.activeMounts.length ? this.activeMounts[0] : null;
            const m = i === null || i === undefined ? null : (this.mounts || [])[i];
            return m ? m.name : null;
        },
        set(v) {
            if (!v) { this.activeMounts = []; return; }
            if (Number.isInteger(v)) { this.activeMounts = [v]; return; }
            if (!Array.isArray(this.mounts)) this.mounts = [];
            let i = this.mounts.findIndex(m => m && m.name === v);
            if (i < 0) { this.mounts.push({ name: v, rarity: 'common', level: 1, xp: 0, stars: 0, subs: [] }); i = this.mounts.length - 1; }
            this.activeMounts = [i];
        },
        enumerable: false, configurable: true,
    });
    return st;
}

// 구세이브·손상 세이브 필드 보정 (QA 10차 버그: 필드가 빠진 세이브가 부팅을 통째로 죽였다).
// 다른 시스템은 전부 자기 `ensure()`로 자기 필드를 메꾸는데(Dungeons·TechTree·Mounts·Ascension·
// Forge·Pass·Chat) **코어 상태에는 그게 없어서**, `version`만 있고 나머지가 빠진 세이브가
// `if (!S.version)` 가드를 그대로 통과해 `S.equippedSkills[0]`에서 TypeError로 `UI.init()`이 끊기고
// boot()의 나머지(3D·전투·틱·자동저장)가 통째로 실행되지 않았다. 그 자리를 여기서 막는다.
//
// 판정 규칙: 기본값 형태(shape)와 **다르면** 기본값으로 되돌린다.
//   · `undefined` → 기본값 (필드 자체가 없는 세이브)
//   · `null` → 기본값. 단 **기본값이 원래 null인 필드**(techResearch·pendingCraft·activeMount·장비 슬롯 등)는
//     null이 정상이므로 그대로 둔다 — 여기서 되돌리면 "장비를 벗은 상태"가 못 저장된다.
//   · 타입 불일치(배열이어야 하는데 객체, 숫자여야 하는데 문자열 등) → 기본값
// 중첩은 **고정 형태 레코드만** 재귀로 메꾼다. `rollLevel`/`mounts`/`skills`/`clearedBosses`처럼
// 키가 플레이 중 늘어나는 사전은 재귀 대상이 아니다 — 기본값에 있는 항목을 도로 살려낼 수 있다.
const STATE_SHAPE_KEYS = ['summonMult', 'autoForge', 'lineAscend', 'settingsDummy', 'equipment'];
// 0이 될 수 없는 진행 수치 — 손상 세이브의 0·음수는 1로 올린다(나머지 수치는 0 하한)
const STATE_MIN_ONE_KEYS = ['version', 'chapter', 'stage', 'bestChapter', 'bestStage', 'forgeLevel'];

// 형태 보정만으로는 안 잡히는 나머지 한 갈래: **타입은 맞는데 가리키는 대상이 없는 참조**.
// `equippedSkills:["ghostSkill"]`은 배열이라 위 검사를 통과하지만 `Skills.def()`가 undefined를
// 돌려줘 `renderSkillBar()`의 `d.color`에서 똑같이 UI.init()이 끊긴다(펫도 `S.pets[i].rarity`로 동형).
// 형태가 아니라 '실재 여부'를 보는 검사라 ensureStateShape()와 분리해 둔다.
function pruneDanglingRefs() {
    if (typeof SKILL_DEFS !== 'undefined') {
        const max = typeof Skills !== 'undefined' ? Skills.MAX_ACTIVE : 3;
        S.equippedSkills = S.equippedSkills
            .filter(id => typeof id === 'string' && SKILL_DEFS.some(def => def.id === id))
            .slice(0, max);
    }
    S.pets = S.pets.filter(p => p && typeof p === 'object' && !Array.isArray(p));
    S.eggs = S.eggs.filter(e => e && typeof e === 'object' && !Array.isArray(e));
    S.hatching = S.hatching.filter(h => h && typeof h === 'object' && !Array.isArray(h));
    // 출전 펫: 중복·범위 밖 인덱스를 걷어내고 **상한(3)까지 자른다**(사용자 지시 2026-08-18 `pet-equip-max3`).
    // ⚠️ 자르기가 없으면 4마리 이상 출전 중이던 **기존 세이브**가 상한을 그대로 우회한다(로드 경로가 유일한 관문).
    //    상한 값은 `Pets.MAX_ACTIVE` 가 원본이지만 state.js 는 pets.js 보다 먼저 실행될 수 있어 방어적으로 읽는다.
    const seen = new Set();
    const petCap = (typeof Pets !== 'undefined' && Pets.MAX_ACTIVE) || 3;
    S.activePets = S.activePets.filter(i => {
        if (!Number.isInteger(i) || i < 0 || i >= S.pets.length || seen.has(i)) return false;
        seen.add(i);
        return true;
    }).slice(0, petCap);
    // 장착 탈것도 같은 갈래. 인벤이 개체 배열이 되면서(2026-08-19) 장착 목록도 **인덱스**다 —
    // 없는 개체를 가리키면 3D·스탯 합산에서 터진다. 이름이 남아 있는 구세이브는 Mounts.migrateInventory 가
    // 인덱스로 옮기지만, 여기까지 문자열이 흘러오면 그냥 버린다(그 뒤 ensure 가 다시 정리한다).
    const seenMounts = new Set();
    const mountCap = (typeof Mounts !== 'undefined' && Mounts.MAX_ACTIVE_MOUNTS) || 1;
    S.activeMounts = S.activeMounts.filter(i => {
        if (!Number.isInteger(i) || i < 0 || !Array.isArray(S.mounts) || i >= S.mounts.length || seenMounts.has(i)) return false;
        seenMounts.add(i);
        return true;
    }).slice(0, mountCap);
    // 진행 좌표 상한: ensureStateShape는 하한(0/1)만 보고 위쪽은 안 본다. 난이도 티어가 범위를 넘으면
    // DIFFICULTY_NAMES 조회가 undefined 가 되어 스테이지 라벨이 "undefined 1-1"로 찍히고, 챕터가 25를
    // 넘으면 그 사이클에 존재하지 않는 좌표라 다음 클리어에서 티어가 안 오른다(전진이 영원히 막힌다).
    S.difficulty = U.clamp(Math.floor(S.difficulty), 0, MAX_DIFFICULTY);
    S.bestDifficulty = U.clamp(Math.floor(S.bestDifficulty), 0, MAX_DIFFICULTY);
    S.chapter = U.clamp(Math.floor(S.chapter), 1, CHAPTERS_PER_CYCLE);
    S.bestChapter = U.clamp(Math.floor(S.bestChapter), 1, CHAPTERS_PER_CYCLE);
    // 스테이지·대장간 레벨도 같은 규약 — 위 티어·챕터만 넣던 시점의 누락이다.
    // ⚠️ `bestStage` 를 안 깎으면 절대 진행도가 부풀려진 채 **내려오지 않는다**(아래 보정은
    //    `bestRank() < curRank()` 일 때만 끌어올리는 단방향이라 위로만 움직인다) — 그래서
    //    패스 마일스톤 16종과 던전 4종이 통째로 해금된 채 남는다.
    S.stage = U.clamp(Math.floor(S.stage), 1, STAGES_PER_CHAPTER);
    S.bestStage = U.clamp(Math.floor(S.bestStage), 1, STAGES_PER_CHAPTER);
    // 만렙 값은 `Forge` 에서 읽는다 — 여기 35 를 또 적으면 만렙이 바뀔 때 이 줄만 남는다.
    // (state.js 가 forge.js 보다 먼저 실행되는 vm 테스트를 위해 방어적으로 읽는다.)
    const forgeMax = (typeof Forge !== 'undefined' && Forge.MAX_LEVEL) || 35;
    S.forgeLevel = U.clamp(Math.floor(S.forgeLevel), 1, forgeMax);
    // 최고 기록이 현재 진행보다 뒤처져 있으면(구세이브·손상) 현재 좌표로 끌어올린다 — 해금·패스가 되감기지 않게
    if (bestRank() < curRank()) { S.bestDifficulty = S.difficulty; S.bestChapter = S.chapter; S.bestStage = S.stage; }
    // 장비 슬롯은 STATE_SHAPE_KEYS 재귀가 '기본값이 null'이라 어떤 값이든 통과시킨다 —
    // 문자열·배열이 들어 있으면 장비 시트가 터지므로 여기서 null로 되돌린다.
    for (const slot of Object.keys(S.equipment)) {
        const it = S.equipment[slot];
        if (it !== null && (typeof it !== 'object' || Array.isArray(it))) { S.equipment[slot] = null; continue; }
        // 타입만 보던 그물을 **객체이면서 시대 키가 표에 없는 경우**가 그대로 빠져나갔다
        // (2026-08-19 QA 18차 save-bad-age-kills-ui — `UI.ageHex` 가 죽어 장비 시트·모루가 통째로 증발).
        // ⚠️ **슬롯을 null 로 버리지 않는다** — 시대 이름이 한 번 바뀐 것뿐인데 사용자가 끼고 있던
        //    장비를 통째로 빼앗는 셈이 된다. `ageIdx` 가 성하면 그걸로 되살리고, 그마저 아니면
        //    첫 시대로 떨어뜨린다(장비는 남고 색만 기본이 된다). 조용히 고치지 않고 짖는다.
        // `subs` 가 배열이 아니면(구세이브·반쯤 쓰인 세이브) `Forge.allSubsBag` 의 전개에서 죽는다 —
        // 그 한 줄이 `Combat.start()` 를 끊어 전투가 통째로 안 돈다(save-item-no-subs-kills-boot).
        // 여기서 배열로 정규화해 **세이브를 실제로 고친다**.
        if (it && !Array.isArray(it.subs)) {
            console.error('[state] 장착 장비의 subs 가 배열이 아니다 — 빈 배열로 보정한다:', slot, it.subs);
            it.subs = [];
        }
        if (it && typeof AGES !== 'undefined' && !AGES.includes(it.age)) {
            const byIdx = Number.isInteger(it.ageIdx) && it.ageIdx >= 0 && it.ageIdx < AGES.length ? AGES[it.ageIdx] : null;
            console.error('[state] 장착 장비의 시대 키가 표에 없다 — 보정한다:', slot, it.age, '→', byIdx || AGES[0]);
            it.age = byIdx || AGES[0];
            it.ageIdx = AGES.indexOf(it.age);
        }
    }
}

// 구세이브 이관: `activeMount: "Brown Horse"`(문자열 1개) → `activeMounts: ["Brown Horse"]`.
// ⚠️ ensureStateShape()보다 **먼저** 불러야 한다 — 나중이면 shape 보정이 없는 activeMounts를
//    기본값 []로 먼저 채워 버려서, 구세이브에 장착돼 있던 탈것이 조용히 벗겨진다.
// 접근자를 걸기 전에 원본 데이터 프로퍼티를 읽어야 하므로 순서도 이 함수 안에서 고정한다.
function migrateActiveMounts() {
    const legacy = typeof S.activeMount === 'string' && S.activeMount ? S.activeMount : null;
    if (!Array.isArray(S.activeMounts)) S.activeMounts = legacy ? [legacy] : [];
    // 🔑 인벤 구조 이관(맵 → 개체 배열)을 **여기서** 돌린다. ensureStateShape 의 activeMounts 검사가
    //    이제 '정수 인덱스'만 통과시키므로, 그 전에 이름 배열을 인덱스로 옮겨 두지 않으면 구세이브의
    //    장착 탈것이 조용히 벗겨진다(바로 위 ⚠️ 와 같은 갈래의 순서 함정이다).
    if (typeof Mounts !== 'undefined' && Mounts.migrateInventory) Mounts.migrateInventory();
    installMountCompat(S);   // 데이터 프로퍼티였던 activeMount를 접근자로 교체(= 세이브에서 제거)
}

function ensureStateShape() {
    const d = defaultState();
    const kind = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
    let fixed = 0;
    for (const k of Object.keys(d)) {
        const want = d[k], got = S[k];
        // 기본값이 null인 필드는 아무 값이나 받는다(구조상 '없음'이 정상 상태)
        if (want === null) { if (got === undefined) { S[k] = null; fixed++; } continue; }
        if (got === undefined || got === null || kind(got) !== kind(want)) { S[k] = want; fixed++; continue; }
        // 타입은 'number'로 맞는데 값이 못 쓰는 수인 경우 — QA가 실측한 사망 케이스 2종을 여기서 잡는다.
        // ⑴ 비유한값: `1e400`은 JSON.parse에서 Infinity가 되고 NaN도 kind()로는 그냥 'number'라
        //    통과한다. 재화가 Infinity면 이후 연산이 전부 Infinity/NaN으로 번진다.
        // ⑵ 음수: 재화·카운터는 0 하한, 진행 수치(chapter·stage·forgeLevel 등)는 1 하한.
        //    **유한한 초대형값(coins:1e308)은 승천 반복으로 실제 도달 가능하므로 건드리지 않는다.**
        if (typeof want === 'number') {
            if (!Number.isFinite(got)) { S[k] = want; fixed++; continue; }
            const min = STATE_MIN_ONE_KEYS.includes(k) ? 1 : 0;
            if (got < min) { S[k] = min; fixed++; continue; }
        }
        if (STATE_SHAPE_KEYS.includes(k)) {
            for (const sk of Object.keys(want)) {
                const sw = want[sk], sg = got[sk];
                if (sw === null) { if (sg === undefined) { got[sk] = null; fixed++; } continue; }
                if (sg === undefined || sg === null || kind(sg) !== kind(sw)) { got[sk] = sw; fixed++; }
            }
        }
    }
    return fixed;
}

function saveGame() {
    if (!S) return;
    S.lastSeen = U.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 저장 실패 무시 */ }
}

function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (raw) {
            S = JSON.parse(raw);
            // 통짜 교체라 세이브가 객체가 아니면(배열·숫자·문자열·null) 그 뒤가 전부 무너진다
            if (!S || typeof S !== 'object' || Array.isArray(S)) { S = defaultState(); return false; }
            if (!S.version) S = defaultState();
            migrateActiveMounts(); // 구세이브의 activeMount(문자열 1개) → activeMounts(배열). ensureStateShape보다 먼저!
            ensureStateShape();   // 빠진/망가진 코어 필드를 기본값으로 메꾼다 (부팅 중단 방지)
            pruneDanglingRefs();  // 형태는 맞지만 대상이 없는 참조(없는 스킬 id·허공 펫 인덱스)를 끊는다
            if (!S.lastOfflineClaim) S.lastOfflineClaim = S.lastSeen || U.now();
            // 폐기된 보관함(S.inventory)·보류 큐(S.heldCrafts) 데이터는 조용히 버린다 —
            // 사용자가 원하지 않은 시스템이라 안에 있던 장비를 되살리지 않는다(사용자 확정 2026-08-17).
            // 보류는 이제 pendingCraft 1슬롯이 전부다.
            delete S.inventory;
            if (S.heldCrafts) {
                if (!S.pendingCraft && Array.isArray(S.heldCrafts) && S.heldCrafts[0]) S.pendingCraft = S.heldCrafts[0];
                delete S.heldCrafts;
            }
            return true;
        }
    } catch (e) { /* 파싱 실패 → 새 게임 */ }
    S = defaultState();
    return false;
}

function resetGame() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 저장소 접근 실패 무시 */ }
    location.reload();
}

// 오프라인 보상 수급률 계산 (수급률 기반, 원본 방식)
// 기본 수급률(골드 1/초·해머 1/분)에 기술트리 배율을 곱해 소수점 단위로 누적하되,
// 재화는 정수부만 지급한다 — 소수부는 버리고 이월하지 않는다 (사용자 지시 2026-08-17).
// 내림을 여기 한 곳에서 하는 이유: 팝업 미리보기와 실제 지급이 같은 값을 쓰게 해
// "603.87로 보여 놓고 603을 준다" 같은 표시·지급 불일치가 구조적으로 생기지 않게 하려는 것.
// coinRate/hammerRate는 재화가 아니라 '수급률' 표시값이라 실수 그대로 둔다.
function offlineRewardFor(elapsedSec) {
    const cap = OFFLINE_CAP_SEC * TechTree.offlineCapMult();
    const t = Math.min(elapsedSec, cap);
    const coinRate = OFFLINE_COIN_PER_SEC * TechTree.offlineCoinMult();     // /초
    const hammerRate = OFFLINE_HAMMER_PER_MIN * TechTree.offlineHammerMult(); // /분
    const coins = Math.floor(t * coinRate);
    const hammers = Math.floor((t / 60) * hammerRate);
    return { counted: t, coins, hammers, coinRate, hammerRate };
}

// 미수집 누적분 조회 — 상태를 건드리지 않는다(순수 계산).
// 팝업은 이 값을 '미리보기'로 보여주고, 실제 지급은 [수집]을 눌러 claimOfflineNow()가 할 때만 일어난다.
// 그래서 팝업을 X로 닫아도 보상이 사라지지 않고, 게임을 켜둔 채로도 누적이 계속 자란다.
function pendingOffline() {
    const elapsed = Math.floor((U.now() - S.lastOfflineClaim) / 1000);
    if (elapsed < 1) return null;
    return { elapsed, ...offlineRewardFor(elapsed) };
}

// [수집] 전용 — 여기서만 재화가 지급되고 누적 기준 시각이 리셋된다
function claimOfflineNow() {
    const r = pendingOffline();
    if (!r) return null;
    // 정수 내림 결과가 전부 0이면 수집을 성립시키지 않는다. 지급할 게 없는데 기준 시각만
    // 리셋되면 소수부가 통째로 날아가, 짧은 간격으로 [수집]을 누를수록 손해를 보게 된다
    // (특히 해머는 1/분이라 60초 미만 수집이면 매번 0). 소수부 이월 없이 이 함정만 막는다.
    if (r.coins <= 0 && r.hammers <= 0) return null;
    S.coins += r.coins;
    S.hammers += r.hammers;
    S.lastOfflineClaim = U.now();
    return r;
}

// 현재 스테이지 키 "1-3" (난이도 티어가 붙으면 "d1:1-3")
// ⚠️ 티어 0 은 옛 키와 **글자까지 동일**하게 남긴다 — 구세이브의 clearedBosses 첫 클리어 기록이 무효가 되면
//    이미 깬 스테이지의 첫 클리어 보너스가 통째로 다시 지급된다. 티어별로는 첫 클리어가 다시 성립하는 게 맞다.
function stageKey() { return S.difficulty > 0 ? `d${S.difficulty}:${S.chapter}-${S.stage}` : `${S.chapter}-${S.stage}`; }

// 기능 해금 여부 (스테이지 도달 기준)
function isUnlocked(key) {
    const def = UNLOCKS.find(u => u.key === key);
    if (!def) return true;
    const [c, s] = def.stage.split('-').map(Number);
    // 해금 기준 스테이지는 전부 기본 순환(티어 0)의 좌표라 c 를 그대로 절대 챕터로 쓴다.
    return bestRank() >= c * 100 + s;
}
