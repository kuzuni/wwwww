// ===== 스킬: 소환(원본 확률표), 레벨업(중복), 장착 =====
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
        let leveled = false;
        if (cur) {
            cur.dupes++;
            while (cur.dupes >= cur.level) { cur.dupes -= cur.level; cur.level++; leveled = true; }
        } else {
            S.skills[def.id] = { level: 1, dupes: 0 };
            if (S.equippedSkills.length < 4) S.equippedSkills.push(def.id);
        }
        saveGame();
        return { def, isNew: !cur, leveled, level: S.skills[def.id].level };
    },

    def(id) { return SKILL_DEFS.find(d => d.id === id); },
    level(id) { return S.skills[id] ? S.skills[id].level : 0; },
    // 레벨당 위력 +15%
    effMult(id) {
        const d = this.def(id);
        return (d.mult || 0) * (1 + 0.15 * (this.level(id) - 1));
    },
    effHeal(id) {
        const d = this.def(id);
        return Math.min(1, (d.healPct || 0) * (1 + 0.1 * (this.level(id) - 1)));
    },

    toggleEquip(id) {
        const pos = S.equippedSkills.indexOf(id);
        if (pos >= 0) S.equippedSkills.splice(pos, 1);
        else if (S.equippedSkills.length < 4) S.equippedSkills.push(id);
        else return false;
        UI.renderSkillBar();
        saveGame();
        return true;
    },
};
