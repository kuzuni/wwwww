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
        // 진행
        chapter: 1, stage: 1,           // 현재 도전 스테이지
        bestChapter: 1, bestStage: 1,
        farming: false,                 // true면 현재 스테이지 반복
        kills: 0, totalCrafts: 0,
        clearedBosses: {},              // "1-5": true → 첫 클리어 보상용
        // 재화
        hammers: 80, coins: 500, gems: 300, tickets: 40, winders: 0,
        // 대장간
        forgeLevel: 1,
        forgeUpgradeEndsAt: null,       // 절대시각(ms). null이면 미진행
        autoForgeOn: false,
        // 장비: slot → item | null
        equipment: { weapon: null, helmet: null, armor: null, gloves: null, necklace: null, ring: null, shoes: null, belt: null },
        // 펫 (시작 알 1개 지급)
        eggs: [{ rarity: 'common' }],   // 미부화 알: {rarity}
        hatching: [],                   // 부화 중: {rarity, endsAt} 최대 2슬롯
        pets: [],                       // {name, rarity, level, dupes}
        activePets: [],                 // pets 배열 인덱스, 최대 3
        // 스킬 (시작 스킬: 강타)
        skills: { powerStrike: { level: 1, dupes: 0 } },
        equippedSkills: ['powerStrike'],
        autoCast: true,
        sfxOn: true,
        summonCount: 0,                 // 소환 누적 → 소환 레벨 상승
        // 마운트
        mountOpens: 0,                  // 누적 소환 수 → 마운트 레벨 상승
        mounts: {},                     // name → {rarity, count}
        activeMount: null,              // 장착 중인 마운트 이름
        // 승천
        ascension: { count: 0 },        // 승천 횟수 → 영구 파워 배율
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
            return true;
        }
    } catch (e) { /* 파싱 실패 → 새 게임 */ }
    S = defaultState();
    return false;
}

function resetGame() {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
}

// 오프라인 보상 계산 (수급률 기반, 원본 방식). 반환값: 보상 요약 or null
function applyOffline() {
    const elapsed = Math.floor((U.now() - S.lastSeen) / 1000);
    if (elapsed < 60) return null; // 1분 미만은 무시
    const cap = OFFLINE_CAP_SEC * TechTree.offlineCapMult();
    const gainMult = TechTree.offlineGainMult();
    const t = Math.min(elapsed, cap);
    const coins = Math.floor(t * OFFLINE_COIN_PER_SEC * gainMult);
    const hammers = Math.floor(t / 60 * OFFLINE_HAMMER_PER_MIN * gainMult);
    S.coins += coins;
    S.hammers += hammers;
    return { elapsed, counted: t, coins, hammers };
}

// 현재 스테이지 키 "1-3"
function stageKey() { return `${S.chapter}-${S.stage}`; }
function globalStage() { return (S.chapter - 1) * 10 + S.stage; }

// 기능 해금 여부 (스테이지 도달 기준)
function isUnlocked(key) {
    const def = UNLOCKS.find(u => u.key === key);
    if (!def) return true;
    const [c, s] = def.stage.split('-').map(Number);
    const best = S.bestChapter * 100 + S.bestStage;
    return best >= c * 100 + s;
}
