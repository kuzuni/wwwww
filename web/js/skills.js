// ===== 스킬: 소환(원본 확률표), 조각 적립→업그레이드, 장착 시 고정 패시브 =====
const Skills = {
    SUMMON_TICKET_COST: 32, // UI-SPEC 45번 줄 실측 "소환 x5 🎫160"을 역산(160/5) — 기존 20은 원본 미확보 자체 설계 추정치였음
    SUMMON_GEM_COST: 200, // 원본 젬 소환가
    MAX_LEVEL: 60, // 만렙 후 조각은 승천(별)으로 전환 (원본 상한 미확보 → 자체 설계)
    MAX_ACTIVE: 3, // 장착 스킬 슬롯 수 (UI-SPEC: 스킬 버튼 3개, Pets.MAX_ACTIVE와 동일 패턴)

    // 소환 레벨: 누적 소환 수로 성장 (원본 고스트타운 레벨 대응)
    summonLevel() { return Math.min(100, Math.floor(S.summonCount / 5) + 1); },

    rates() {
        const r = skillRatesData[this.summonLevel()];
        return { common: r[0], rare: r[1], epic: r[2], legendary: r[3], ultimate: r[4], mythic: r[5] };
    },

    // count번 연속 소환(UI-SPEC "소환 x5" 배치) — 비용은 선결제로 한 번에 확인·차감, 결과는 배열로 반환
    summon(useGems, count = 1) {
        const cost = (useGems ? this.SUMMON_GEM_COST : this.SUMMON_TICKET_COST) * count;
        if (useGems) {
            if (S.gems < cost) return null;
            S.gems -= cost;
        } else {
            if (S.tickets < cost) return null;
            S.tickets -= cost;
        }
        const results = [];
        for (let i = 0; i < count; i++) {
            S.summonCount++;
            const rarity = U.weightedPick(this.rates());
            const pool = SKILL_DEFS.filter(d => d.rarity === rarity);
            const def = U.choice(pool);

            const cur = S.skills[def.id];
            if (cur) {
                cur.dupes++; // 조각 적립 (레벨업은 UI.onUpgradeSkill 등 수동 업그레이드로만)
            } else {
                S.skills[def.id] = { level: 1, dupes: 0, stars: 0 };
                if (S.equippedSkills.length < this.MAX_ACTIVE) { S.equippedSkills.push(def.id); Combat.recalcHero(); }
            }
            results.push({ def, isNew: !cur, level: S.skills[def.id].level });
        }
        SFX.gacha(results[results.length - 1].def.rarity);
        saveGame();
        return { results, count };
    },

    def(id) { return SKILL_DEFS.find(d => d.id === id); },
    level(id) { return S.skills[id] ? S.skills[id].level : 0; },
    // 레벨당 위력 +15%
    levelMult(id) { return 1 + 0.15 * (this.level(id) - 1); },

    // 고정 데미지 = 등급 기준치 × 스킬 상대 위력(mult) × 레벨 배율 × 승천 배율 (더 이상 영웅 공격력에 비례하지 않음)
    dmg(id) {
        const d = this.def(id);
        const sk = S.skills[id];
        return SKILL_BASE_DMG[d.rarity] * (d.mult || 0) * this.levelMult(id) * Ascension.starMult(sk && sk.stars);
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
        return !!sk && sk.level < this.MAX_LEVEL && sk.dupes >= this.shardsRequired(sk.level);
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
    // 승천(별): 만렙 도달 후 조각(만렙 요구치만큼)을 소모해 별 1개 획득
    canAscend(id) {
        const sk = S.skills[id];
        return !!sk && sk.level >= this.MAX_LEVEL && sk.dupes >= this.shardsRequired(this.MAX_LEVEL);
    },
    ascend(id) {
        const sk = S.skills[id];
        if (!this.canAscend(id)) return false;
        sk.dupes -= this.shardsRequired(this.MAX_LEVEL);
        sk.stars = (sk.stars || 0) + 1;
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
    // 보유 스킬 중 등급·레벨이 높은 순으로 MAX_ACTIVE개 장착
    quickEquip() {
        const owned = Object.keys(S.skills).sort((a, b) => {
            const da = this.def(a), db = this.def(b);
            const ra = RARITIES.indexOf(da.rarity), rb = RARITIES.indexOf(db.rarity);
            if (ra !== rb) return rb - ra;
            return S.skills[b].level - S.skills[a].level;
        });
        S.equippedSkills = owned.slice(0, this.MAX_ACTIVE);
        UI.renderSkillBar();
        Combat.recalcHero();
        saveGame();
    },

    // 장착 중인 모든 스킬의 고정 패시브 합계 (기본 피해·기본 체력)
    activeBonus() {
        const b = { atk: 0, hp: 0 };
        for (const id of S.equippedSkills) {
            const d = this.def(id);
            const sk = S.skills[id];
            if (!d) continue;
            const base = SKILL_BASE_PASSIVE[d.rarity];
            const mult = this.levelMult(id) * Ascension.starMult(sk && sk.stars);
            b.atk += base.atk * mult;
            b.hp += base.hp * mult;
        }
        return b;
    },

    toggleEquip(id) {
        const pos = S.equippedSkills.indexOf(id);
        if (pos >= 0) S.equippedSkills.splice(pos, 1);
        else if (S.equippedSkills.length < this.MAX_ACTIVE) S.equippedSkills.push(id);
        else return false;
        UI.renderSkillBar();
        Combat.recalcHero();
        saveGame();
        return true;
    },
};
