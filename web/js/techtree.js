// ===== 기술 트리 (대장간 연구) — BALANCE.md 스펙 + UI-SPEC 10·15~16번 =====
// 4분기(대장간/힘/스킬·펫&기술/ANIMALS) × 노드당 5업×5티어(총 25업). 재화: 물약(포션, 좀비 러시 던전).
// 노드별 비용·시간 커브는 원본 미확보 → 자체 설계(티어당 급증 + 티어 내 완만한 증가).
// 연구는 대장간 업그레이드와 동일하게 물약 선결제 + 실시간 타이머(전체 트리 통틀어 동시 1건) 방식.
const TechTree = {
    MAX_LEVEL: 25,   // 노드당 총 업그레이드 수 (5업 × 5티어)
    PER_TIER: 5,

    // UI-SPEC: 카드 4개 [대장간][힘][스킬,펫&기술][ANIMALS] — 스펙 스크린샷에 영문 그대로 표기됨
    BRANCHES: [
        { id: 'forge',    name: '대장간',        icon: '⚒️', nodes: ['forgeSpeed', 'forgeCost'] },
        { id: 'power',    name: '힘',           icon: '💪', nodes: ['gearPower', 'sellBonus'] },
        { id: 'skillpet', name: '스킬, 펫 & 기술', icon: '✨', nodes: ['offlineCap', 'offlineGain'] },
        { id: 'animals',  name: 'ANIMALS',      icon: '🐾', nodes: ['petPower', 'mountPower', 'eggGain', 'hatchSpeed'] },
    ],

    NODES: {
        forgeSpeed:  { name: '대장간 가속',  desc: '업그레이드 시간 단축', per: 4,  base: 40, tierMult: 7 },
        forgeCost:   { name: '제련 효율',    desc: '업그레이드 비용 감소', per: 2,  base: 40, tierMult: 7 },
        gearPower:   { name: '장비 숙련',    desc: '장비 공격력·체력 증가', per: 2,  base: 50, tierMult: 7 },
        sellBonus:   { name: '상인의 눈',    desc: '장비 판매가 증가',     per: 2,  base: 50, tierMult: 7 },
        offlineCap:  { name: '시간 압축',    desc: '오프라인 보상 캡 증가', per: 16, base: 60, tierMult: 7 },
        offlineGain: { name: '숙련된 부관',  desc: '오프라인 보상량 증가', per: 2,  base: 60, tierMult: 7 },
        petPower:    { name: '야생의 감각',  desc: '펫 전투 능력치(고정 피해·체력) 증가', per: 2, base: 55, tierMult: 7 },
        mountPower:  { name: '조련술',       desc: '탈것 전투 능력치(고정 피해·체력) 증가', per: 2, base: 55, tierMult: 7 },
        eggGain:     { name: '알 채집꾼',    desc: '펫 던전(침공) 알 화폐 획득량 증가', per: 8, base: 40, tierMult: 7 },
        hatchSpeed:  { name: '부화 가속',    desc: '알 부화 시간 단축',    per: 4,  base: 40, tierMult: 7 },
    },

    LV_MULT: 1.28, // 같은 티어 내 레벨당 비용 증가율
    TIME_BASE: 20, // 초. 티어당 급증 + 티어 내 완만한 증가 (대장간 업그레이드 시간 커브와 동일 methodology)
    TIME_TIER_MULT: 6,
    TIME_LV_MULT: 1.22,

    ensure() {
        if (!S.tech) S.tech = {};
        for (const id in this.NODES) if (S.tech[id] === undefined) S.tech[id] = 0;
        if (S.techResearch === undefined) S.techResearch = null; // {id, endsAt} — 전체 트리 통틀어 동시 1건
    },

    level(id) { return S.tech[id] || 0; },
    isMax(id) { return this.level(id) >= this.MAX_LEVEL; },
    branchOf(id) { return this.BRANCHES.find(b => b.nodes.includes(id)); },

    // 분기 진행률(%): 분기 내 모든 노드 레벨 합 ÷ (노드 수 × MAX_LEVEL)
    branchProgress(branchId) {
        const b = this.BRANCHES.find(x => x.id === branchId);
        const sum = b.nodes.reduce((s, id) => s + this.level(id), 0);
        return sum / (b.nodes.length * this.MAX_LEVEL) * 100;
    },

    // 레벨 하나(1-based)를 구매하는 데 드는 물약 비용
    cost(id, level) {
        const def = this.NODES[id];
        const tier = Math.ceil(level / this.PER_TIER);
        const posInTier = ((level - 1) % this.PER_TIER) + 1;
        const tierBase = def.base * Math.pow(def.tierMult, tier - 1);
        return Math.ceil(tierBase * Math.pow(this.LV_MULT, posInTier - 1));
    },

    // 레벨 하나를 연구하는 데 걸리는 실시간(초)
    time(id, level) {
        const tier = Math.ceil(level / this.PER_TIER);
        const posInTier = ((level - 1) % this.PER_TIER) + 1;
        const tierBase = this.TIME_BASE * Math.pow(this.TIME_TIER_MULT, tier - 1);
        return Math.ceil(tierBase * Math.pow(this.TIME_LV_MULT, posInTier - 1));
    },

    nextCost(id) {
        const lv = this.level(id);
        return lv >= this.MAX_LEVEL ? null : this.cost(id, lv + 1);
    },
    nextTime(id) {
        const lv = this.level(id);
        return lv >= this.MAX_LEVEL ? null : this.time(id, lv + 1);
    },

    // 현재 연구 중인 노드 id (없으면 null)
    researchingId() { return S.techResearch ? S.techResearch.id : null; },

    canStart(id) {
        if (S.techResearch) return false; // 트리 전체 동시 1건
        const c = this.nextCost(id);
        return c !== null && S.potions >= c;
    },

    start(id) {
        if (!this.canStart(id)) return false;
        S.potions -= this.nextCost(id);
        S.techResearch = { id, endsAt: U.now() + this.nextTime(id) * 1000 };
        saveGame();
        return true;
    },

    // 진행 중인 연구를 취소하고 물약을 환불
    cancel() {
        if (!S.techResearch) return false;
        S.potions += this.cost(S.techResearch.id, this.level(S.techResearch.id) + 1);
        S.techResearch = null;
        saveGame();
        return true;
    },

    gemSkipCost() {
        if (!S.techResearch) return 0;
        const remainMin = Math.max(0, (S.techResearch.endsAt - U.now()) / 60000);
        return Math.ceil(remainMin / 10); // 10분당 젬 1 (대장간과 동일 규칙)
    },

    gemSkip() {
        const cost = this.gemSkipCost();
        if (!S.techResearch || S.gems < cost) return false;
        S.gems -= cost;
        S.techResearch.endsAt = U.now() - 1;
        this.tick();
        return true;
    },

    tick() {
        if (S.techResearch && U.now() >= S.techResearch.endsAt) {
            const id = S.techResearch.id;
            S.tech[id] = this.level(id) + 1;
            S.techResearch = null;
            SFX.levelUp();
            UI.toast(`🔬 ${this.NODES[id].name} Lv.${this.level(id)} 연구 완료!`);
            Combat.recalcHero();
            saveGame();
            UI.renderTechTree(); // 열려 있는 기술 트리 개요/분기 화면도 즉시 갱신 (자체 가드 있음)
            if (UI.isTechNodeOpen(id)) UI.renderTechNodeModal();
        }
    },

    // 포인트당 수치 × 레벨 = 노드 총 효과(%)
    pct(id) { return this.level(id) * this.NODES[id].per; },

    // ===== 다른 모듈에서 참조하는 효과 배율 =====
    forgeTimeMult() { return 1 / (1 + this.pct('forgeSpeed') / 100); },      // 시간 = base ÷ (1+tech%)
    forgeCostMult() { return Math.max(0.1, 1 - this.pct('forgeCost') / 100); }, // 비용 = base × (1-tech%)
    gearPowerMult() { return 1 + this.pct('gearPower') / 100; },
    // 장비 뽑기 레벨 캡 보너스(레벨 수, %가 아님) — 힘·탈것 분기 '장비 레벨업' 노드(+2/pt).
    // 그 노드는 기술 트리 원본화 작업에서 추가되므로, 아직 없으면 0을 돌려줘 캡 100을 유지한다.
    gearMaxLevelBonus() { return this.NODES.gearMaxLevel ? this.pct('gearMaxLevel') : 0; },
    sellPriceMult() { return 1 + this.pct('sellBonus') / 100; },
    offlineCapMult() { return 1 + this.pct('offlineCap') / 100; },
    offlineGainMult() { return 1 + this.pct('offlineGain') / 100; },
    petPowerMult() { return 1 + this.pct('petPower') / 100; },
    mountPowerMult() { return 1 + this.pct('mountPower') / 100; },
    eggGainMult() { return 1 + this.pct('eggGain') / 100; },        // ANIMALS: 펫 던전(침공) 알 화폐 획득량
    hatchSpeedMult() { return 1 / (1 + this.pct('hatchSpeed') / 100); }, // ANIMALS: 부화 시간 단축
};
