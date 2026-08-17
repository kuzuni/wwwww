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
// 기본 수급률(골드 1/초·해머 1/분)에 기술트리 배율을 곱해 소수점 단위로 계산·누적한다.
// 정수로 내림하는 건 실제 소비 시점(해머 차감 등)뿐 — 여기선 실수를 그대로 반환한다.
function offlineRewardFor(elapsedSec) {
    const cap = OFFLINE_CAP_SEC * TechTree.offlineCapMult();
    const gainMult = TechTree.offlineGainMult();
    const t = Math.min(elapsedSec, cap);
    const coinRate = OFFLINE_COIN_PER_SEC * gainMult;   // /초
    const hammerRate = OFFLINE_HAMMER_PER_MIN * gainMult; // /분
    const coins = t * coinRate;
    const hammers = (t / 60) * hammerRate;
    return { counted: t, coins, hammers, coinRate, hammerRate };
}

// 부팅 시 자동 지급 (마지막 수령 시각 기준). 1분 미만 경과는 무시하고 누적 유지. 반환값: 보상 요약 or null
function applyOffline() {
    const elapsed = Math.floor((U.now() - S.lastOfflineClaim) / 1000);
    if (elapsed < 60) return null;
    const r = offlineRewardFor(elapsed);
    S.coins += r.coins;
    S.hammers += r.hammers;
    S.lastOfflineClaim = U.now();
    return { elapsed, ...r };
}

// 전투 화면 오프라인 보상 버튼: 접속 중에도 마지막 수령 시각부터의 누적분을 즉시 수령
function claimOfflineNow() {
    const elapsed = Math.floor((U.now() - S.lastOfflineClaim) / 1000);
    if (elapsed < 1) return null;
    const r = offlineRewardFor(elapsed);
    S.coins += r.coins;
    S.hammers += r.hammers;
    S.lastOfflineClaim = U.now();
    return { elapsed, ...r };
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
