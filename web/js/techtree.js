// ===== 기술 트리 (대장간 연구) — 원본 포지마스터 방식 이식 (사용자 확정 2026-08-17) =====
// 분기 3개: ① 힘·탈것 ② 대장간 ③ 스킬·펫&기술. 원본의 ANIMALS 분기와 길드(Guild)는 사용자 지시로 제외.
// 노드 구성·효과 수치는 개발자 가이드(1vcian.me/ForgeMasterCalculator) + 사용자가 원본 게임에서 직접 확인한 값.
// 노드당 상한은 5티어 × 티어당 5업 = 25업 (사용자 지시 2026-08-17 — 원본 guide.html "5× per tier,
// 25 upgrades per node"로 복귀. 그전 세션의 "5업 상한" 해석을 폐기한다).
// 연구는 대장간 업그레이드와 동일하게 물약 선결제 + 실시간 타이머(전체 트리 통틀어 동시 1건) 방식.
const TechTree = {
    TIERS: 5,        // 티어 I~V
    PER_TIER: 5,     // 티어당 업그레이드 수
    MAX_LEVEL: 25,   // = TIERS × PER_TIER

    BRANCHES: [
        { id: 'power',    name: '힘 · 탈것',       icon: '💪', nodes: [
            'weaponMastery', 'armorMastery', 'gearMaxLevel', 'mountDmg', 'mountHp', 'mountCost', 'extraMount'] },
        { id: 'forge',    name: '대장간',          icon: '⚒️', nodes: [
            'forgeTimer', 'forgeCost', 'sellPrice', 'thiefHammer', 'thiefCoin',
            'autoForgeSlot', 'freeForge', 'offlineCap', 'offlineCoin', 'offlineHammer'] },
        { id: 'skillpet', name: '스킬, 펫 & 기술', icon: '✨', nodes: [
            'techTimer', 'skillDmg', 'skillPassiveDmg', 'skillPassiveHp', 'techCost', 'petHp', 'petDmg',
            'skillSummonCost', 'hatchTimer', 'extraEgg', 'dungeonTicket', 'dungeonPotion'] },
    ],

    // per = 1업당 수치. 단위는 대부분 %지만 gearMaxLevel(레벨)·autoForgeSlot(개)은 절대 수치다.
    NODES: {
        // ① 힘 · 탈것
        weaponMastery:   { name: '무기 마스터리',   desc: '무기·장갑·목걸이·반지 피해 증가', icon: '⚔️', per: 2,  base: 50 },
        armorMastery:    { name: '방어구 마스터리', desc: '투구·갑옷·신발·벨트 체력 증가',   icon: '🛡️', per: 2,  base: 50 },
        gearMaxLevel:    { name: '장비 레벨업',     desc: '장비 최대 강화 레벨 증가',        icon: '🔺', per: 2,  base: 60, unit: '레벨' },
        mountDmg:        { name: '탈것 데미지 마스터리', desc: '탈것 피해 증가',             icon: '🐎', per: 2,  base: 55 },
        mountHp:         { name: '탈것 체력 마스터리',   desc: '탈것 체력 증가',             icon: '🐴', per: 2,  base: 55 },
        mountCost:       { name: '탈것 소환 비용',  desc: '탈것 소환 태엽 비용 감소',        icon: '⚙️', per: 1,  base: 55 },
        extraMount:      { name: '추가 탈것 확률',  desc: '탈것 소환 시 추가 획득 확률',      icon: '🎰', per: 2,  base: 55 },
        // ② 대장간
        forgeTimer:      { name: '제련 타이머',     desc: '대장간 업그레이드 시간 단축',      icon: '⏱️', per: 4,  base: 40 },
        forgeCost:       { name: '제련 업그레이드 비용', desc: '대장간 업그레이드 비용 감소', icon: '🪙', per: 2,  base: 40 },
        sellPrice:       { name: '장비 판매가',     desc: '장비 판매 가격 증가',             icon: '💰', per: 2,  base: 50 },
        thiefHammer:     { name: '해머도둑 해머 보너스', desc: '해머 도둑 던전 해머 보상 증가', icon: '🔨', per: 2, base: 50 },
        thiefCoin:       { name: '해머도둑 코인 보너스', desc: '해머 도둑 던전 코인 보상 증가', icon: '🏦', per: 2, base: 50 },
        // 원본 사양이 '티어당 +1'이라 perTier: true — 티어를 완성(5업)해야 +1이 붙고 최대 +5다.
        autoForgeSlot:   { name: '오토포지',        desc: '자동 제련 1회 동시 해머 수 증가',  icon: '🤖', per: 1,  base: 60, unit: '개', perTier: true },
        freeForge:       { name: '무료 제련 확률',  desc: '제련 시 해머를 소모하지 않을 확률', icon: '🍀', per: 1,  base: 60 },
        offlineCap:      { name: '최대 오프라인 시간', desc: '오프라인 보상 누적 상한 증가',  icon: '⌛', per: 16, base: 60 },
        offlineCoin:     { name: '코인 오프라인 보상', desc: '오프라인 코인 수급 증가',       icon: '🪙', per: 2,  base: 60 },
        offlineHammer:   { name: '해머 오프라인 보상', desc: '오프라인 해머 수급 증가',       icon: '🔨', per: 2,  base: 60 },
        // ③ 스킬 · 펫 & 기술
        techTimer:       { name: '기술 연구 타이머', desc: '기술 연구 시간 단축',            icon: '🔬', per: 4,  base: 45 },
        skillDmg:        { name: '스킬 피해',       desc: '스킬 발동 피해 증가',             icon: '💥', per: 2,  base: 55 },
        skillPassiveDmg: { name: '패시브 스킬 피해', desc: '보유 스킬 패시브 기본 피해 증가', icon: '🗡️', per: 2,  base: 55 },
        skillPassiveHp:  { name: '패시브 스킬 체력', desc: '보유 스킬 패시브 기본 체력 증가', icon: '❤️', per: 2,  base: 55 },
        techCost:        { name: '기술 연구 비용',  desc: '기술 노드 업그레이드 비용 감소',   icon: '🧪', per: 2,  base: 45 },
        petHp:           { name: '펫 보너스 체력',  desc: '펫 체력 증가',                    icon: '🐾', per: 2,  base: 55 },
        petDmg:          { name: '펫 보너스 피해',  desc: '펫 피해 증가',                    icon: '🐕', per: 2,  base: 55 },
        skillSummonCost: { name: '스킬 소환 비용',  desc: '스킬 소환 티켓 비용 감소',         icon: '🎫', per: 1,  base: 55 },
        hatchTimer:      { name: '알 부화 타이머',  desc: '알 부화 시간 단축',               icon: '🥚', per: 10, base: 40 },
        extraEgg:        { name: '추가 알 소환 기회', desc: '알 소환 시 추가 획득 확률',      icon: '🎁', per: 2,  base: 55 },
        dungeonTicket:   { name: '던전 티켓 보너스', desc: '던전 클리어 스킬 티켓 보상 증가',  icon: '🎟️', per: 1,  base: 50 },
        dungeonPotion:   { name: '던전 물약 보너스', desc: '던전 클리어 기술 물약 보상 증가',  icon: '⚗️', per: 1,  base: 50 },
    },

    // 구세이브 마이그레이션: 폐기된 4분기 노드 id → 새 노드 id.
    // 뜻이 그대로 이어지는 것만 옮기고, 한 노드가 둘로 쪼개진 건(오프라인 수급·펫·탈것) 양쪽에 같은 레벨을 준다
    // — 플레이어가 산 효과를 뺏지 않기 위해서다. 원본에 없는 eggGain(알 화폐 획득량)은 대응 노드가 없어 폐기.
    LEGACY_MAP: {
        forgeSpeed:  ['forgeTimer'],
        forgeCost:   ['forgeCost'],
        sellBonus:   ['sellPrice'],
        gearPower:   ['weaponMastery', 'armorMastery'],
        offlineCap:  ['offlineCap'],
        offlineGain: ['offlineCoin', 'offlineHammer'],
        petPower:    ['petDmg', 'petHp'],
        mountPower:  ['mountDmg', 'mountHp'],
        hatchSpeed:  ['hatchTimer'],
    },

    // 비용·시간 커브 — 티어 안에서는 완만하게, 티어가 오를 때 한 번 크게 뛴다
    // (사용자 지시 "티어 올라갈수록 비용·연구시간 증가"). 25업으로 늘어난 만큼 업당 증가율은
    // 낮추고(1.55 → 1.16) 티어 배수를 따로 곱해 초반이 5업 시절보다 빡세지지 않게 했다.
    // 결과(base 50 노드): Lv5 91 → Lv6 195(티어 II 진입) → Lv15 1,367 → Lv25 20,638 물약,
    // 한 노드 만렙까지 물약 105,440 / 실시간 26.7시간. 전 구간 단조 증가 확인.
    LV_MULT: 1.16,      // 티어 안에서 1업당 비용 증가율
    TIER_MULT: 1.85,    // 티어가 오를 때 붙는 추가 배수
    TIME_BASE: 20, // 초
    TIME_LV_MULT: 1.26,
    TIME_TIER_MULT: 1.45,

    ensure() {
        if (!S.tech) S.tech = {};
        // 구세이브의 폐기 노드 레벨을 새 노드로 이관 (한 번만 — 이관 후 옛 키는 지운다)
        for (const oldId in this.LEGACY_MAP) {
            if (this.NODES[oldId] || S.tech[oldId] === undefined) continue; // 이름이 그대로 살아남은 노드는 건너뜀
            const lv = S.tech[oldId] || 0;
            for (const newId of this.LEGACY_MAP[oldId]) {
                if (this.NODES[newId]) S.tech[newId] = Math.max(S.tech[newId] || 0, lv);
            }
            delete S.tech[oldId];
        }
        // 폐기 노드 잔여 키 제거 (LEGACY_MAP에 없는 옛 노드 — 예: 원본에 대응이 없는 eggGain)
        for (const id in S.tech) if (!this.NODES[id]) delete S.tech[id];
        for (const id in this.NODES) if (S.tech[id] === undefined) S.tech[id] = 0;
        // 상한 밖 값 방어 (상한이 5 → 25로 올라가 잘릴 일은 없지만, 손상된 세이브 대비)
        for (const id in this.NODES) S.tech[id] = U.clamp(S.tech[id], 0, this.MAX_LEVEL);
        // 진행 중이던 연구가 폐기된 노드면 취소하고 선결제한 물약을 돌려준다 (개편 때문에 플레이어가 손해 보지 않게).
        // 옛 노드의 비용 커브는 사라졌으므로 LEGACY_MAP으로 효과를 이어받은 새 노드의 다음 단계 비용으로 환산한다.
        // 이어받은 노드가 없는 폐기 노드(예: eggGain)는 환산 기준이 없어 취소만 한다.
        if (S.techResearch && !this.NODES[S.techResearch.id]) {
            const heir = (this.LEGACY_MAP[S.techResearch.id] || []).find(nid => this.NODES[nid]);
            if (heir) S.potions += this.cost(heir, Math.min(this.level(heir) + 1, this.MAX_LEVEL));
            S.techResearch = null;
        }
        if (S.techResearch === undefined) S.techResearch = null; // {id, endsAt} — 전체 트리 통틀어 동시 1건
    },

    level(id) { return S.tech[id] || 0; },
    isMax(id) { return this.level(id) >= this.MAX_LEVEL; },
    branchOf(id) { return this.BRANCHES.find(b => b.nodes.includes(id)); },

    // ===== 티어 표기 =====
    // 화면에는 '다음에 살 업그레이드'가 속한 티어와 그 티어 안 진행도를 보여준다 —
    // Lv0 → I 0/5, Lv4 → I 4/5, Lv5 → II 0/5, Lv24 → V 4/5, 만렙 → V 5/5.
    tierOf(level) { return U.clamp(Math.ceil(level / this.PER_TIER), 1, this.TIERS); }, // 업그레이드 번호(1-based)가 속한 티어
    curTier(id) { return this.isMax(id) ? this.TIERS : this.tierOf(this.level(id) + 1); },
    tierPos(id) { return this.isMax(id) ? this.PER_TIER : this.level(id) % this.PER_TIER; },
    ROMAN: ['I', 'II', 'III', 'IV', 'V'],
    roman(tier) { return this.ROMAN[tier - 1] || 'I'; },
    tierLabel(id) { return this.roman(this.curTier(id)); },

    // 분기 진행률(%): 분기 내 모든 노드 레벨 합 ÷ (노드 수 × MAX_LEVEL)
    branchProgress(branchId) {
        const b = this.BRANCHES.find(x => x.id === branchId);
        const sum = b.nodes.reduce((s, id) => s + this.level(id), 0);
        return sum / (b.nodes.length * this.MAX_LEVEL) * 100;
    },

    // 레벨 하나(1-based)를 구매하는 데 드는 물약 비용 — '기술 연구 비용' 노드로 할인된다
    cost(id, level) {
        const def = this.NODES[id];
        if (!def) return null; // 폐기된 노드 id로 물어와도 화면이 죽지 않게 (노드 개편 시 stale 참조 방어)
        const raw = def.base * Math.pow(this.LV_MULT, level - 1) * Math.pow(this.TIER_MULT, this.tierOf(level) - 1);
        return Math.max(1, Math.ceil(raw * this.techCostMult()));
    },

    // 레벨 하나를 연구하는 데 걸리는 실시간(초) — '기술 연구 타이머' 노드로 단축된다
    time(id, level) {
        if (!this.NODES[id]) return null;
        const raw = this.TIME_BASE * Math.pow(this.TIME_LV_MULT, level - 1) * Math.pow(this.TIME_TIER_MULT, this.tierOf(level) - 1);
        return Math.max(1, Math.ceil(raw * this.techTimeMult()));
    },

    nextCost(id) {
        if (!this.NODES[id]) return null;
        const lv = this.level(id);
        return lv >= this.MAX_LEVEL ? null : this.cost(id, lv + 1);
    },
    nextTime(id) {
        if (!this.NODES[id]) return null;
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
    pct(id) { const d = this.NODES[id]; return d ? this.level(id) * d.per : 0; }, // 없는 노드 id는 0 (노드 개편 중 stale 참조 방어)

    // ===== 노드 효과 표기 =====
    // 대부분 업당 per씩 쌓이지만 perTier 노드(오토포지)는 원본대로 '티어당' 증가라
    // 완성한 티어 수만 센다 — 화면 표기도 '(티어당 +1개)'로 달라진다.
    totalOf(id) {
        const d = this.NODES[id];
        if (!d) return 0;
        return d.perTier ? Math.floor(this.level(id) / this.PER_TIER) * d.per : this.pct(id);
    },
    unitOf(id) { const d = this.NODES[id]; return (d && d.unit) || '%'; },
    gainNote(id) { const d = this.NODES[id]; return d && d.perTier ? '티어당' : '업당'; },

    // ===== 다른 모듈에서 참조하는 효과 배율 =====
    // 규칙: 증가형은 (1 + %/100), 단축·감소형은 시간이면 ÷(1+%), 비용이면 ×(1-%) — 원본 표기가 "타이머 속도 +N%"라
    // 시간 단축은 나눗셈(속도 증가), "비용 -N%"는 곱셈(직접 감산)으로 맞췄다.
    // ① 힘 · 탈것
    gearAtkMult() { return 1 + this.pct('weaponMastery') / 100; },   // 무기·장갑·목걸이·반지 (주스탯 atk 장비)
    gearHpMult() { return 1 + this.pct('armorMastery') / 100; },     // 투구·갑옷·신발·벨트 (주스탯 hp 장비)
    gearMaxLevelBonus() { return this.pct('gearMaxLevel'); },        // 장비 최대 강화 레벨 +2/업 (레벨 수, %가 아님)
    mountDmgMult() { return 1 + this.pct('mountDmg') / 100; },
    mountHpMult() { return 1 + this.pct('mountHp') / 100; },
    mountCostMult() { return Math.max(0.1, 1 - this.pct('mountCost') / 100); },
    extraMountChance() { return this.pct('extraMount') / 100; },     // 소환 1회당 추가 1마리 확률
    // ② 대장간
    forgeTimeMult() { return 1 / (1 + this.pct('forgeTimer') / 100); },
    forgeCostMult() { return Math.max(0.1, 1 - this.pct('forgeCost') / 100); },
    sellPriceMult() { return 1 + this.pct('sellPrice') / 100; },
    thiefHammerMult() { return 1 + this.pct('thiefHammer') / 100; },
    thiefCoinMult() { return 1 + this.pct('thiefCoin') / 100; },
    // 상한이 25업(5티어)로 복귀했으므로 원본 사양 "티어당 동시 해머 +1"(최대 +5)을 그대로 쓴다
    // — 5업 상한 시절의 임시 해석(업당 +1)은 폐기.
    autoForgeSlotBonus() { return this.totalOf('autoForgeSlot'); },
    freeForgeChance() { return this.pct('freeForge') / 100; },
    offlineCapMult() { return 1 + this.pct('offlineCap') / 100; },
    offlineCoinMult() { return 1 + this.pct('offlineCoin') / 100; },
    offlineHammerMult() { return 1 + this.pct('offlineHammer') / 100; },
    // ③ 스킬 · 펫 & 기술
    techTimeMult() { return 1 / (1 + this.pct('techTimer') / 100); },
    techCostMult() { return Math.max(0.1, 1 - this.pct('techCost') / 100); },
    skillDmgMult() { return 1 + this.pct('skillDmg') / 100; },
    skillPassiveDmgMult() { return 1 + this.pct('skillPassiveDmg') / 100; },
    skillPassiveHpMult() { return 1 + this.pct('skillPassiveHp') / 100; },
    petDmgMult() { return 1 + this.pct('petDmg') / 100; },
    petHpMult() { return 1 + this.pct('petHp') / 100; },
    skillSummonCostMult() { return Math.max(0.1, 1 - this.pct('skillSummonCost') / 100); },
    hatchSpeedMult() { return 1 / (1 + this.pct('hatchTimer') / 100); },
    extraEggChance() { return this.pct('extraEgg') / 100; },         // 소환 1회당 추가 1개 확률
    dungeonTicketMult() { return 1 + this.pct('dungeonTicket') / 100; },
    dungeonPotionMult() { return 1 + this.pct('dungeonPotion') / 100; },
};
