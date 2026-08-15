// ===== 스킬: 소환(원본 확률표), 조각 적립→업그레이드, 장착 시 고정 패시브 =====
const Skills = {
    SUMMON_TICKET_COST: 20,
    SUMMON_GEM_COST: 200, // 원본 젬 소환가

    // 소환 레벨: 누적 소환 수로 성장 (원본 고스트타운 레벨 대응)
    summonLevel() { return Math.min(100, Math.floor(S.summonCount / 5) + 1); },

    rates() {
        const r = skillRatesData[this.summonLevel()];
        return { common: r[0], rare: r[1], epic: r[2], legendary: r[3], ultimate: r[4], mythic: r[5] };
    },

    summon(useGems) {
        if (useGems) {
            if (S.gems < this.SUMMON_GEM_COST) return null;
            S.gems -= this.SUMMON_GEM_COST;
        } else {
            if (S.tickets < this.SUMMON_TICKET_COST) return null;
            S.tickets -= this.SUMMON_TICKET_COST;
        }
        S.summonCount++;
        const rarity = U.weightedPick(this.rates());
        const pool = SKILL_DEFS.filter(d => d.rarity === rarity);
        const def = U.choice(pool);

        const cur = S.skills[def.id];
        if (cur) {
            cur.dupes++; // 조각 적립 (레벨업은 UI.onUpgradeSkill 등 수동 업그레이드로만)
        } else {
            S.skills[def.id] = { level: 1, dupes: 0 };
            if (S.equippedSkills.length < 4) { S.equippedSkills.push(def.id); Combat.recalcHero(); }
        }
        SFX.gacha(rarity);
        saveGame();
        return { def, isNew: !cur, level: S.skills[def.id].level };
    },

    def(id) { return SKILL_DEFS.find(d => d.id === id); },
    level(id) { return S.skills[id] ? S.skills[id].level : 0; },
    // 레벨당 위력 +15%
    levelMult(id) { return 1 + 0.15 * (this.level(id) - 1); },

    // 고정 데미지 = 등급 기준치 × 스킬 상대 위력(mult) × 레벨 배율 (더 이상 영웅 공격력에 비례하지 않음)
    dmg(id) {
        const d = this.def(id);
        return SKILL_BASE_DMG[d.rarity] * (d.mult || 0) * this.levelMult(id);
    },
    effHeal(id) {
        const d = this.def(id);
        return Math.min(1, (d.healPct || 0) * (1 + 0.1 * (this.level(id) - 1)));
    },

    // 레벨업에 필요한 조각 수 (레벨 오를수록 증가: 저레벨 2 → 고레벨 8)
    shardsRequired(level) {
        if (level < 10) return 2;
        if (level < 30) return 3;
        if (level < 60) return 6;
        return 8;
    },
    canUpgrade(id) {
        const sk = S.skills[id];
        return !!sk && sk.dupes >= this.shardsRequired(sk.level);
    },
    upgrade(id) {
        const sk = S.skills[id];
        if (!sk || !this.canUpgrade(id)) return false;
        sk.dupes -= this.shardsRequired(sk.level);
        sk.level++;
        if (S.equippedSkills.includes(id)) Combat.recalcHero();
        saveGame();
        return true;
    },
    // 보유한 모든 스킬을 조각이 허용하는 한 최대한 업그레이드
    upgradeAll() {
        let count = 0;
        for (const id of Object.keys(S.skills)) {
            while (this.upgrade(id)) count++;
        }
        return count;
    },
    // 보유 스킬 중 등급·레벨이 높은 순으로 4개 장착
    quickEquip() {
        const owned = Object.keys(S.skills).sort((a, b) => {
            const da = this.def(a), db = this.def(b);
            const ra = RARITIES.indexOf(da.rarity), rb = RARITIES.indexOf(db.rarity);
            if (ra !== rb) return rb - ra;
            return S.skills[b].level - S.skills[a].level;
        });
        S.equippedSkills = owned.slice(0, 4);
        UI.renderSkillBar();
        Combat.recalcHero();
        saveGame();
    },

    // 장착 중인 모든 스킬의 고정 패시브 합계 (기본 피해·기본 체력)
    activeBonus() {
        const b = { atk: 0, hp: 0 };
        for (const id of S.equippedSkills) {
            const d = this.def(id);
            if (!d) continue;
            const base = SKILL_BASE_PASSIVE[d.rarity];
            const mult = this.levelMult(id);
            b.atk += base.atk * mult;
            b.hp += base.hp * mult;
        }
        return b;
    },

    toggleEquip(id) {
        const pos = S.equippedSkills.indexOf(id);
        if (pos >= 0) S.equippedSkills.splice(pos, 1);
        else if (S.equippedSkills.length < 4) S.equippedSkills.push(id);
        else return false;
        UI.renderSkillBar();
        Combat.recalcHero();
        saveGame();
        return true;
    },
};
