// ===== 기술 트리 (대장간 연구) — BALANCE.md 스펙 =====
// 3분기(대장간/힘/스킬&펫) × 노드당 5업×5티어(총 25업). 재화: 블러드(좀비 러시 던전).
// 노드별 비용 커브는 원본 미확보 → 자체 설계(티어당 급증 + 티어 내 완만한 증가).
const TechTree = {
    MAX_LEVEL: 25,   // 노드당 총 업그레이드 수 (5업 × 5티어)
    PER_TIER: 5,

    BRANCHES: [
        { id: 'forge',    name: '대장간', icon: '⚒️', nodes: ['forgeSpeed', 'forgeCost'] },
        { id: 'power',    name: '힘',     icon: '💪', nodes: ['gearPower', 'sellBonus'] },
        { id: 'skillpet', name: '스킬&펫', icon: '✨', nodes: ['offlineCap', 'offlineGain'] },
    ],

    NODES: {
        forgeSpeed:  { name: '대장간 가속',  desc: '업그레이드 시간 단축', per: 4,  base: 40, tierMult: 7 },
        forgeCost:   { name: '제련 효율',    desc: '업그레이드 비용 감소', per: 2,  base: 40, tierMult: 7 },
        gearPower:   { name: '장비 숙련',    desc: '장비 공격력·체력 증가', per: 2,  base: 50, tierMult: 7 },
        sellBonus:   { name: '상인의 눈',    desc: '장비 판매가 증가',     per: 2,  base: 50, tierMult: 7 },
        offlineCap:  { name: '시간 압축',    desc: '오프라인 보상 캡 증가', per: 16, base: 60, tierMult: 7 },
        offlineGain: { name: '숙련된 부관',  desc: '오프라인 보상량 증가', per: 2,  base: 60, tierMult: 7 },
    },

    LV_MULT: 1.28, // 같은 티어 내 레벨당 비용 증가율

    ensure() {
        if (!S.tech) S.tech = {};
        for (const id in this.NODES) if (S.tech[id] === undefined) S.tech[id] = 0;
    },

    level(id) { return S.tech[id] || 0; },
    isMax(id) { return this.level(id) >= this.MAX_LEVEL; },
    tierOf(level) { return Math.min(5, Math.ceil(level / this.PER_TIER) || 1); },

    // 레벨 하나(1-based)를 구매하는 데 드는 블러드 비용
    cost(id, level) {
        const def = this.NODES[id];
        const tier = Math.ceil(level / this.PER_TIER);
        const posInTier = ((level - 1) % this.PER_TIER) + 1;
        const tierBase = def.base * Math.pow(def.tierMult, tier - 1);
        return Math.ceil(tierBase * Math.pow(this.LV_MULT, posInTier - 1));
    },

    nextCost(id) {
        const lv = this.level(id);
        return lv >= this.MAX_LEVEL ? null : this.cost(id, lv + 1);
    },

    canUpgrade(id) {
        const c = this.nextCost(id);
        return c !== null && S.blood >= c;
    },

    upgrade(id) {
        if (!this.canUpgrade(id)) return false;
        S.blood -= this.nextCost(id);
        S.tech[id] = this.level(id) + 1;
        saveGame();
        return true;
    },

    // 포인트당 수치 × 레벨 = 노드 총 효과(%)
    pct(id) { return this.level(id) * this.NODES[id].per; },

    // ===== 다른 모듈에서 참조하는 효과 배율 =====
    forgeTimeMult() { return 1 / (1 + this.pct('forgeSpeed') / 100); },      // 시간 = base ÷ (1+tech%)
    forgeCostMult() { return Math.max(0.1, 1 - this.pct('forgeCost') / 100); }, // 비용 = base × (1-tech%)
    gearPowerMult() { return 1 + this.pct('gearPower') / 100; },
    sellPriceMult() { return 1 + this.pct('sellBonus') / 100; },
    offlineCapMult() { return 1 + this.pct('offlineCap') / 100; },
    offlineGainMult() { return 1 + this.pct('offlineGain') / 100; },
};
