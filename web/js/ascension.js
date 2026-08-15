// ===== 승천(Ascension): 진행 리셋 → 영구 파워 배율 (BALANCE.md 스펙) =====
// 원본: 리셋(레벨/장비/펫/스킬/마운트/알) / 유지(골드·해머·블러드·티켓·와인더·기술트리)
// 원본 권장 시점 포지 Lv35 → 최소 요구치는 테스트 편의상 낮춰서 설계(자체 설계, 미확보 수치)
const Ascension = {
    MIN_FORGE_LEVEL: 10,
    RECOMMENDED_FORGE_LEVEL: 35,
    POWER_PER_ASCEND: 0.5, // 승천 1회당 공격력·체력 +50% (원본: A1 Multiverse ≈ 승천 전 Divine 근사)

    ensure() {
        if (!S.ascension) S.ascension = { count: 0 };
    },

    count() { this.ensure(); return S.ascension.count; },
    powerMult() { return 1 + this.count() * this.POWER_PER_ASCEND; },

    canAscend() { return S.forgeLevel >= this.MIN_FORGE_LEVEL; },

    ascend() {
        if (!this.canAscend()) return false;
        this.ensure();
        S.ascension.count++;

        // 리셋 대상 (BALANCE.md: 캐릭터 레벨, 장비, 펫, 스킬, 마운트, 알)
        S.forgeLevel = 1;
        S.forgeUpgradeEndsAt = null;
        S.autoForgeOn = false;
        S.equipment = { weapon: null, helmet: null, armor: null, gloves: null, necklace: null, ring: null, shoes: null, belt: null };
        S.eggs = [{ rarity: 'common' }];
        S.hatching = [];
        S.pets = [];
        S.activePets = [];
        S.skills = { powerStrike: { level: 1, dupes: 0 } };
        S.equippedSkills = ['powerStrike'];
        S.summonCount = 0;
        S.mountOpens = 0;
        S.mounts = {};
        S.activeMount = null;
        S.chapter = 1;
        S.stage = 1;
        S.farming = false;

        Scene3D.refreshHeroEquip(false);
        Scene3D.refreshPets();
        Combat.recalcHero();
        Combat.setupStage();
        saveGame();
        return true;
    },
};
