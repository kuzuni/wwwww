// ===== 게임 상태 + 저장/로드 + 오프라인 보상 =====
const SAVE_KEY = 'forgeclone_save_v1';
const OFFLINE_CAP_SEC = 4 * 3600;   // 원본: 기본 4시간 캡
const OFFLINE_COIN_PER_SEC = 1;     // 원본: 초당 코인 1
const OFFLINE_HAMMER_PER_MIN = 1;   // 원본: 분당 해머 1

let S = null;

function defaultState() {
    return {
        version: 1,
        createdAt: U.now(),
        lastSeen: U.now(),
        nickname: '용사', // 프로필 카드 표시명 (프로필 팝업에서 편집 가능 — UI-SPEC 19번)
        avatarEmoji: '🛡️', // 프로필 아바타 (프로필 팝업에서 이모지 선택 가능)
        gender: '♂', // 프로필 성별 표시 (더미 토글, UI-SPEC 19번)
        musicOn: true, // 설정 팝업 음악 토글 (실동작 — SFX 프로시저럴 앰비언트)
        settingsDummy: { vibration: true, chatShow: true, chatDark: false, clanChatPreview: true }, // 설정 팝업 더미 토글 4종
        lastOfflineClaim: U.now(), // 오프라인 보상 마지막 수령 시각 (자동 모달 + 수동 버튼 공용)
        // 진행
        chapter: 1, stage: 1,           // 현재 도전 스테이지
        bestChapter: 1, bestStage: 1,
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
        autoForgeOn: false,
        autoForge: {                    // 자동 제련 설정 (UI-SPEC 21~24번 자동 제련 팝업)
            keepAges: [],                // 유지 시대 체크 목록 (빈 배열 = 전체 허용)
            filterOn: false,             // 옵션 필터 켜짐 여부
            filterSubs: [],              // 필터 통과 조건 서브스탯 키 목록
            hammersPerBatch: 10,         // 1회 제련 사이클당 소모 망치 수 (1~22)
            continueOnTarget: false,     // 체크 시 장착 성공해도 계속, 미체크면 장착 성공 시 정지
        },
        // 장비: slot → item | null
        equipment: { weapon: null, helmet: null, armor: null, gloves: null, necklace: null, ring: null, shoes: null, belt: null },
        // 보관함: slot → 장착하지 않은 장비 배열 (사용자 지시 2026-08-17 — [장착]은 장착만 하고
        // 기존 장비는 팔지 않고 여기 보관한다. 판매는 [판매] 버튼을 눌렀을 때만.)
        inventory: {},
        // 펫 (시작 알 1개 지급)
        eggs: [{ rarity: 'common' }],   // 미부화 알: {rarity}
        hatching: [],                   // 부화 중: {rarity, endsAt} 최대 2슬롯
        pets: [],                       // {name, rarity, level, dupes}
        activePets: [],                 // pets 배열 인덱스, 최대 3
        // 스킬 (시작 스킬: 강타)
        skills: { powerStrike: { level: 1, dupes: 0, stars: 0 } },
        equippedSkills: ['powerStrike'],
        autoCast: true,
        sfxOn: true,
        summonCount: 0,                 // 소환 누적 → 소환 레벨 상승
        // 마운트
        mountOpens: 0,                  // 누적 소환 수 → 마운트 레벨 상승
        mounts: {},                     // name → {rarity, count}
        activeMount: null,              // 장착 중인 마운트 이름
    };
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
            if (!S.version) S = defaultState();
            if (!S.lastOfflineClaim) S.lastOfflineClaim = S.lastSeen || U.now();
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

// 현재 스테이지 키 "1-3"
function stageKey() { return `${S.chapter}-${S.stage}`; }

// 기능 해금 여부 (스테이지 도달 기준)
function isUnlocked(key) {
    const def = UNLOCKS.find(u => u.key === key);
    if (!def) return true;
    const [c, s] = def.stage.split('-').map(Number);
    const best = S.bestChapter * 100 + S.bestStage;
    return best >= c * 100 + s;
}
