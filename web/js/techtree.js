// ===== 기술 트리 (대장간 연구) — 원본 포지마스터 방식 이식 (사용자 확정 2026-08-17) =====
// 분기 3개: ① 힘·탈것 ② 대장간 ③ 스킬·펫&기술. 원본의 ANIMALS 분기와 길드(Guild)는 사용자 지시로 제외.
// 노드 구성·효과 수치는 개발자 가이드(1vcian.me/ForgeMasterCalculator) + 사용자가 원본 게임에서 직접 확인한 값.
//
// ===== 트리 구조 (사용자 재정정 2026-08-17, 4회차 — '타입이 한 단계에만 있다'는 배치를 폐기) =====
// 분기의 **모든 타입이 매 단계마다 반복**된다. 「힘·탈것」이면 7타입 × 5단계 = 35노드이고
// '무기 마스터리 1단계'와 '무기 마스터리 2단계'는 서로 다른 노드다(노드 id = `타입@단계`).
//   ① 노드 하나는 최대 5레벨(원본 shot-042546의 'N/5').
//   ② 해금: **바로 위 단계의 같은 타입 노드가 1레벨 이상**이면 열린다(직속 부모 1개, 1레벨이면 충분).
//      1단계는 부모가 없어 항상 열려 있다.
//   ③ 단계 사이에 연결선을 그린다 — 같은 타입이 단계를 위→아래로 잇는 세로 골격이다.
//   ④ 보너스는 **그 타입의 5개 단계 노드 레벨을 전부 합산**한다(pct()가 타입 단위로 센다).
//   ⑤ 비용·시간은 단계가 높을수록 비싸고 오래 걸린다(단계 배수) + 노드 안 레벨마다 증가.
// 연구는 대장간 업그레이드와 동일하게 물약 선결제 + 실시간 타이머(전체 트리 통틀어 동시 1건) 방식.
const TechTree = {
    TIERS: 5,        // 트리 단계 I~V
    MAX_LEVEL: 5,    // 노드당 최대 레벨 (원본 'N/5')

    // types = 그 분기의 타입 목록. 이 타입들이 1~5단계에 **똑같이 반복**돼 노드 인스턴스가 된다.
    BRANCHES: [
        { id: 'power',    name: '힘 · 탈것',       icon: '💪', types: [
            'weaponMastery', 'armorMastery', 'gearMaxLevel', 'mountDmg', 'mountHp', 'mountCost', 'extraMount'] },
        { id: 'forge',    name: '대장간',          icon: '⚒️', types: [
            'forgeTimer', 'forgeCost', 'sellPrice', 'thiefHammer', 'thiefCoin',
            'autoForgeSlot', 'freeForge', 'offlineCap', 'offlineCoin', 'offlineHammer'] },
        { id: 'skillpet', name: '스킬, 펫 & 기술', icon: '✨', types: [
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
        // 노드 상한이 5레벨이 된 뒤로는 '업당 +1'이 곧 원본 사양의 상한 +5와 같다(레벨당 +1개, 최대 +5개).
        autoForgeSlot:   { name: '오토포지',        desc: '자동 제련 1회 동시 해머 수 증가',  icon: '🤖', per: 1,  base: 60, unit: '개' },
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

    // ===== ⓘ '총 보너스' 팝업 줄 구성 (사용자 지시 2026-08-17, 원본 스크린샷 제공) =====
    // 원본은 누적 보너스를 '부위별로 한 줄씩' 나눠 보여준다 — "무기 보너스 피해 +14%",
    // "장갑 보너스 피해 +14%", "무기 최대 레벨 +12", "헬멧 최대 레벨 +12" …
    // 우리 트리는 여러 부위를 한 노드로 묶었으므로(마스터리 2종·장비 레벨업), expand로 걸리는
    // 부위 수만큼 줄을 펼쳐 원본과 같은 모양을 만든다. expand 없는 노드는 한 줄.
    //   expand: 'atk'(공격 4부위) | 'hp'(체력 4부위) | 'all'(8부위) — label은 부위명 뒤에 붙는 접미사
    BONUS: {
        weaponMastery:   { label: '보너스 피해', expand: 'atk' },
        armorMastery:    { label: '보너스 체력', expand: 'hp' },
        gearMaxLevel:    { label: '최대 레벨',   expand: 'all' },
        mountDmg:        { label: '탈것 보너스 피해' },
        mountHp:         { label: '탈것 보너스 체력' },
        mountCost:       { label: '탈것 소환 비용 감소' },
        extraMount:      { label: '추가 탈것 확률' },
        forgeTimer:      { label: '대장간 업그레이드 속도' },
        forgeCost:       { label: '대장간 업그레이드 비용 감소' },
        sellPrice:       { label: '장비 판매가' },
        thiefHammer:     { label: '해머 도둑 해머 보상' },
        thiefCoin:       { label: '해머 도둑 코인 보상' },
        autoForgeSlot:   { label: '자동 제련 동시 해머' },
        freeForge:       { label: '무료 제련 확률' },
        offlineCap:      { label: '최대 오프라인 시간' },
        offlineCoin:     { label: '오프라인 코인 보상' },
        offlineHammer:   { label: '오프라인 해머 보상' },
        techTimer:       { label: '기술 연구 속도' },
        skillDmg:        { label: '스킬 피해' },
        skillPassiveDmg: { label: '패시브 스킬 피해' },
        skillPassiveHp:  { label: '패시브 스킬 체력' },
        techCost:        { label: '기술 연구 비용 감소' },
        petHp:           { label: '펫 보너스 체력' },
        petDmg:          { label: '펫 보너스 피해' },
        skillSummonCost: { label: '스킬 소환 비용 감소' },
        hatchTimer:      { label: '알 부화 속도' },
        extraEgg:        { label: '추가 알 소환 확률' },
        dungeonTicket:   { label: '던전 티켓 보상' },
        dungeonPotion:   { label: '던전 물약 보상' },
    },
    EXPAND_SLOTS: {
        atk: () => SLOTS.filter(s => SLOT_MAIN[s] === 'atk'),
        hp:  () => SLOTS.filter(s => SLOT_MAIN[s] === 'hp'),
        all: () => SLOTS.slice(),
    },

    // 현재 연구 상태에서 실제로 붙어 있는 누적 보너스만 한 줄씩 모아 반환한다 (값 0인 노드는 제외).
    // 분기 정의 순서를 그대로 따라 같은 계열 보너스가 붙어 나온다.
    totalBonuses() {
        const out = [];
        for (const b of this.BRANCHES) {
            for (const id of b.types) {   // 타입 단위 — 그 타입의 5개 단계 노드 합산이 실제 보너스다
                const meta = this.BONUS[id];
                const value = this.totalOf(id);
                if (!meta || !value) continue;
                const unit = this.unitOf(id) === '%' ? '%' : '';
                const mk = label => out.push({ id, label, text: '+' + U.fmt(value) + unit });
                if (meta.expand) for (const slot of this.EXPAND_SLOTS[meta.expand]()) mk(SLOT_KR[slot] + ' ' + meta.label);
                else mk(meta.label);
            }
        }
        return out;
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

    // 비용·시간 커브 — 노드 안에서는 레벨마다(1~5), 트리에서는 **아래 단계로 내려갈수록** 뛴다
    // (사용자 지시 "티어 올라갈수록 비용·연구시간 증가"). 단계 배수는 노드가 속한 단계에서 나온다.
    // 결과(base 50 노드): 1단계 50→288 물약 / 5단계 3,441→19,850 물약,
    // 연구 시간은 1단계 20초→188초 / 5단계 45분→6.9시간(한 노드 만렙 기준 최장 12.4시간).
    // 25업 시절의 끝값(레벨당 20,638 물약 · 6.9시간)을 그대로 이어받아 후반 체감이 얕아지지 않게 맞췄다.
    LV_MULT: 1.55,      // 노드 안에서 1레벨당 비용 증가율
    TIER_MULT: 2.88,    // 트리 단계가 하나 내려갈 때 붙는 추가 배수
    TIME_BASE: 20, // 초
    TIME_LV_MULT: 1.75,
    TIME_TIER_MULT: 3.4,

    ensure() {
        if (!S.tech) S.tech = {};
        // 구세이브의 폐기 노드 레벨을 살아남은 타입으로 이관 (한 번만 — 이관 후 옛 키는 지운다)
        for (const oldId in this.LEGACY_MAP) {
            if (this.NODES[oldId] || S.tech[oldId] === undefined) continue;
            const lv = S.tech[oldId] || 0;
            for (const newId of this.LEGACY_MAP[oldId]) {
                if (this.NODES[newId]) S.tech[newId] = Math.max(S.tech[newId] || 0, lv);
            }
            delete S.tech[oldId];
        }
        // 구조 이관: 예전에는 저장 키가 타입 이름 하나(`weaponMastery`)였다. 이제 타입이 5단계에
        // 반복되므로 키가 `타입@단계`다 — 옛 레벨은 **1단계 노드**로 옮긴다(위 단계는 거기서 열린다).
        for (const id of Object.keys(S.tech)) {
            if (id.indexOf('@') >= 0) continue;
            const lv = U.clamp(S.tech[id] || 0, 0, this.MAX_LEVEL);
            if (this.NODES[id]) {
                const first = this.nid(id, 1);
                S.tech[first] = Math.max(S.tech[first] || 0, lv);
            }
            delete S.tech[id];
        }
        // 전 분기 × 전 단계 인스턴스를 채우고, 목록에 없는 키는 지운다
        const valid = {};
        for (const b of this.BRANCHES) for (const id of this.nodesOf(b.id)) {
            valid[id] = true;
            S.tech[id] = U.clamp(S.tech[id] || 0, 0, this.MAX_LEVEL);
        }
        for (const id of Object.keys(S.tech)) if (!valid[id]) delete S.tech[id];
        // 진행 중이던 연구가 사라진 노드면 취소하고 선결제한 물약을 돌려준다.
        // (구조가 바뀌어 id가 달라졌을 뿐이면 같은 타입 1단계로 옮겨 환불 기준을 잡는다.)
        if (S.techResearch && !valid[S.techResearch.id]) {
            const heir = this.NODES[this.typeOf(S.techResearch.id)] ? this.nid(this.typeOf(S.techResearch.id), 1) : null;
            if (heir) S.potions += this.cost(heir, Math.min(this.level(heir) + 1, this.MAX_LEVEL));
            S.techResearch = null;
        }
        if (S.techResearch === undefined) S.techResearch = null; // {id, endsAt} — 전체 트리 통틀어 동시 1건
    },

    // ===== 노드 인스턴스 = 타입@단계 =====
    // 같은 타입이 5단계에 반복되므로 노드의 정체성은 '타입 + 단계'다. 저장 키도 이 id를 쓴다.
    nid(type, tier) { return type + '@' + tier; },
    typeOf(id) { return String(id).split('@')[0]; },
    tierOf(id) { const t = +String(id).split('@')[1]; return t >= 1 && t <= this.TIERS ? t : 1; },
    def(id) { return this.NODES[this.typeOf(id)]; },
    // 분기의 전 노드(그리는 순서 = 1단계 타입 전부 → 2단계 …)
    nodesOf(branchId) {
        const b = this.BRANCHES.find(x => x.id === branchId);
        if (!b) return [];
        const out = [];
        for (let t = 1; t <= this.TIERS; t++) for (const ty of b.types) out.push(this.nid(ty, t));
        return out;
    },
    level(id) { return S.tech[id] || 0; },
    isMax(id) { return this.level(id) >= this.MAX_LEVEL; },
    branchOf(id) { const ty = this.typeOf(id); return this.BRANCHES.find(b => b.types.indexOf(ty) >= 0); },
    tierNodes(branchId, tier) {
        const b = this.BRANCHES.find(x => x.id === branchId);
        return b ? b.types.map(ty => this.nid(ty, tier)) : [];
    },

    // ===== 해금 = 바로 위 단계의 '같은 타입' 노드가 1레벨 이상 (사용자 재정정 2026-08-17 4회차) =====
    // 부모는 언제나 한 개(같은 타입 한 단계 위)이고, 1단계는 부모가 없어 항상 열려 있다.
    parentsOf(id) {
        const tier = this.tierOf(id);
        return tier <= 1 ? [] : [this.nid(this.typeOf(id), tier - 1)];
    },
    isUnlocked(id) { return this.parentsOf(id).every(p => this.level(p) >= 1); },
    // 해금 대기 중인 노드가 '무엇을 올려야 열리는지' — 아직 0레벨인 부모 노드 id 목록
    lockedBy(id) { return this.parentsOf(id).filter(p => this.level(p) < 1); },

    // ===== 그리기 골격 =====
    // 사용자가 준 그림대로 **단계가 가로 블록**이다: 한 단계에 그 분기의 타입이 전부 놓이고,
    // 단계와 단계 사이에만 연결선을 그린다. 폭이 좁아 한 줄에 다 못 넣으므로 2개씩 흘려 쌓는다
    // (항목 ⑦이 허용한 배치). 타입 순서는 모든 단계에서 같아서 같은 타입이 같은 자리에 온다.
    // 트리의 **맨 위 행과 맨 아래 행은 언제나 노드 1개**다 (사용자 지시 2026-08-17):
    // 연결선이 한 점에서 퍼지고 한 점으로 모여야 위·아래 끝이 지저분해지지 않는다.
    // 그래서 1단계는 첫 타입을 단독 행으로 떼고, 마지막 단계는 마지막 타입을 단독 행으로 뗀다.
    // 가운데 단계는 예전 그대로 2개씩 흘려 쌓는다(단계 안 타입 배치는 유지 — 지시).
    chunk2(types, tier) {
        const g = [];
        for (let i = 0; i < types.length; i += 2) g.push(types.slice(i, i + 2));
        return g.map(ids => ids.map(ty => this.nid(ty, tier)));
    },
    rows(branchId) {
        const b = this.BRANCHES.find(x => x.id === branchId);
        if (!b) return [];
        const out = [];
        for (let t = 1; t <= this.TIERS; t++) {
            const ty = b.types;
            // 모든 단계가 **같은 행 패턴**('첫 타입 단독 → 나머지 2개씩')을 쓴다.
            // 패턴이 단계마다 같아야 같은 타입이 항상 같은 x에 오고, 부모→자식 연결선이
            // 꺾임 없는 세로 레일이 된다(패턴이 갈리면 연결선이 전부 사선/ㄱ자로 엉킨다).
            let groups = ty.length > 1
                ? [[this.nid(ty[0], t)], ...this.chunk2(ty.slice(1), t)]
                : this.chunk2(ty, t);
            // 타입이 홀수면 이 패턴의 마지막 행이 2노드로 끝난다 — 마지막 단계에서만
            // 그 행을 한 노드씩 두 행으로 쪼개 **트리의 맨 아래가 노드 1개로 수렴**하게 한다.
            const tail = groups[groups.length - 1];
            if (t === this.TIERS && tail.length === 2) {
                groups = [...groups.slice(0, -1), [tail[0]], [tail[1]]];
            }
            groups.forEach((ids, i) => out.push({
                ids, tier: t, first: i === 0, lastOfTier: i === groups.length - 1,
            }));
        }
        return out;
    },
    // 연결선은 단계와 단계 사이에만 (같은 단계 안의 행들은 서로 부모-자식이 아니다)
    tierBreak(upper, lower) { return !!upper && !!lower && upper.tier !== lower.tier; },

    ROMAN: ['I', 'II', 'III', 'IV', 'V'],
    roman(tier) { return this.ROMAN[tier - 1] || 'I'; },
    tierLabel(id) { return this.roman(this.tierOf(id)); },

    // 분기 진행률(%): 분기 내 모든 노드 레벨 합 ÷ (노드 수 × MAX_LEVEL)
    branchProgress(branchId) {
        const ids = this.nodesOf(branchId);
        if (!ids.length) return 0;
        const sum = ids.reduce((s, id) => s + this.level(id), 0);
        return sum / (ids.length * this.MAX_LEVEL) * 100;
    },

    // 레벨 하나(1-based)를 구매하는 데 드는 물약 비용 — '기술 연구 비용' 노드로 할인된다
    cost(id, level) {
        const def = this.def(id);
        if (!def) return null; // 폐기된 노드 id로 물어와도 화면이 죽지 않게 (노드 개편 시 stale 참조 방어)
        const raw = def.base * Math.pow(this.LV_MULT, level - 1) * Math.pow(this.TIER_MULT, this.tierOf(id) - 1);
        return Math.max(1, Math.ceil(raw * this.techCostMult()));
    },

    // 레벨 하나를 연구하는 데 걸리는 실시간(초) — '기술 연구 타이머' 노드로 단축된다
    time(id, level) {
        if (!this.def(id)) return null;
        const raw = this.TIME_BASE * Math.pow(this.TIME_LV_MULT, level - 1) * Math.pow(this.TIME_TIER_MULT, this.tierOf(id) - 1);
        return Math.max(1, Math.ceil(raw * this.techTimeMult()));
    },

    nextCost(id) {
        if (!this.def(id)) return null;
        const lv = this.level(id);
        return lv >= this.MAX_LEVEL ? null : this.cost(id, lv + 1);
    },
    nextTime(id) {
        if (!this.def(id)) return null;
        const lv = this.level(id);
        return lv >= this.MAX_LEVEL ? null : this.time(id, lv + 1);
    },

    // 현재 연구 중인 노드 id (없으면 null)
    researchingId() { return S.techResearch ? S.techResearch.id : null; },

    canStart(id) {
        if (S.techResearch) return false; // 트리 전체 동시 1건
        if (!this.isUnlocked(id)) return false; // 위 단계를 완료해야 열린다
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
            UI.toast(`🔬 ${this.def(id).name} ${this.roman(this.tierOf(id))}단계 Lv.${this.level(id)} 연구 완료!`);
            Combat.recalcHero();
            saveGame();
            UI.renderTechTree(); // 열려 있는 기술 트리 개요/분기 화면도 즉시 갱신 (자체 가드 있음)
            if (UI.isTechNodeOpen(id)) UI.renderTechNodeModal();
        }
    },

    // 타입 총 레벨 = 그 타입의 5개 단계 노드 레벨 합 (사용자 재정정 ⑥: 보너스는 전 단계 합산)
    typeLevel(type) {
        let sum = 0;
        for (let t = 1; t <= this.TIERS; t++) sum += this.level(this.nid(type, t));
        return sum;
    },
    // 포인트당 수치 × 총 레벨 = 그 타입의 총 효과(%). 인자로 노드 id(`타입@단계`)를 줘도 타입으로 본다.
    pct(idOrType) {
        const type = this.typeOf(idOrType);
        const d = this.NODES[type];
        return d ? this.typeLevel(type) * d.per : 0;   // 없는 타입은 0 (개편 중 stale 참조 방어)
    },
    // 노드 하나가 지금 내고 있는 몫 (팝업에서 '이 노드'의 기여를 보여줄 때)
    nodeTotal(id) { const d = this.def(id); return d ? this.level(id) * d.per : 0; },

    // ===== 노드 효과 표기 =====
    // 노드 상한이 5레벨이 된 뒤로는 전부 '레벨당 per'로 통일된다(오토포지의 옛 '티어당' 예외 폐기).
    totalOf(idOrType) { return this.pct(idOrType); },
    unitOf(idOrType) { const d = this.NODES[this.typeOf(idOrType)]; return (d && d.unit) || '%'; },
    gainNote() { return '레벨당'; },

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
    // 노드 상한이 5레벨이라 '레벨당 +1'이 원본 사양의 상한 +5와 그대로 맞는다
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

