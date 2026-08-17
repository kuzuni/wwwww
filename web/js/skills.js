// ===== 스킬: 소환(원본 확률표), 조각 적립→업그레이드, 장착 시 고정 패시브 =====
const Skills = {
    SUMMON_TICKET_COST: 32, // UI-SPEC 45번 줄 실측 "소환 x5 🎫160"을 역산(160/5) — 기존 20은 원본 미확보 자체 설계 추정치였음
    // 기술트리 '스킬 소환 비용'(-1%/업) 반영 실제 티켓 비용 — 표시·차감 양쪽이 이 함수를 쓴다
    ticketCost(count = 1) { return Math.max(1, Math.ceil(this.SUMMON_TICKET_COST * count * TechTree.skillSummonCostMult())); },
    SUMMON_GEM_COST: 200, // 원본 젬 소환가
    MAX_LEVEL: 100, // 승천은 Lv.100 도달부터 (사용자 확정 스펙 2026-08-17) — 조각 커브는 기존 곡선 연장(60+ = 8개)
    MAX_ACTIVE: 3, // 장착 스킬 슬롯 수 (UI-SPEC: 스킬 버튼 3개, Pets.MAX_ACTIVE와 동일 패턴)

    // 소환 레벨: 누적 소환 수로 성장 (원본 고스트타운 레벨 대응)
    summonLevel() { return Math.min(100, Math.floor((S.summonCount || 0) / 5) + 1); },

    rates(level) {
        const r = skillRatesData[U.clamp(level || this.summonLevel(), 1, 100)];
        return { common: r[0], rare: r[1], epic: r[2], legendary: r[3], ultimate: r[4], mythic: r[5] };
    },

    // 펫/마운트와 동일한 패턴 — 버튼 비활성화 표시용 (Pets.canSummon/Mounts.canSummon 참고)
    canSummon(useGems, count = 1) {
        return useGems ? S.gems >= this.SUMMON_GEM_COST * count : S.tickets >= this.ticketCost(count);
    },

    // count번 연속 소환(UI-SPEC "소환 x5" 배치) — 비용은 선결제로 한 번에 확인·차감, 결과는 배열로 반환
    summon(useGems, count = 1) {
        const cost = useGems ? this.SUMMON_GEM_COST * count : this.ticketCost(count);
        if (useGems) {
            if (S.gems < cost) return null;
            S.gems -= cost;
        } else {
            if (S.tickets < cost) return null;
            S.tickets -= cost;
        }
        const results = [];
        for (let i = 0; i < count; i++) {
            S.summonCount = (S.summonCount || 0) + 1;
            const rarity = U.weightedPick(this.rates());
            const pool = SKILL_DEFS.filter(d => d.rarity === rarity);
            const def = U.choice(pool);

            const cur = S.skills[def.id];
            if (cur) {
                cur.dupes++; // 조각 적립 (레벨업은 UI.onUpgradeSkill 등 수동 업그레이드로만)
            } else {
                S.skills[def.id] = { level: 1, dupes: 0, stars: Ascension.count('skill') };
                if (S.equippedSkills.length < this.MAX_ACTIVE) S.equippedSkills.push(def.id);
                Combat.recalcHero(); // 신규 보유 스킬은 장착 여부와 무관하게 패시브를 더하므로 항상 재계산
            }
            results.push({ def, isNew: !cur, level: S.skills[def.id].level });
        }
        // 배치 소환 시 마지막 굴림이 아니라 가장 높은 등급 기준으로 효과음 재생
        const bestRarity = results.reduce((best, r) =>
            RARITIES.indexOf(r.def.rarity) > RARITIES.indexOf(best) ? r.def.rarity : best, results[0].def.rarity);
        SFX.gacha(bestRarity);
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
        // 승천 배율이 곱해지면 Number 한계를 넘으므로 Big 반환 (전투 데미지도 Big으로 흐른다)
        return Ascension.starMult(sk && sk.stars).mul(SKILL_BASE_DMG[d.rarity] * (d.mult || 0) * this.levelMult(id));
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
        Combat.recalcHero(); // 레벨은 패시브 배율(levelMult)에 곧장 들어가므로 미장착 스킬도 재계산 대상
        saveGame();
        return true;
    },
    // 개별 스킬 승천은 폐기 — 승천은 소환 라인 단위(Ascension.ascend('skill'))이며,
    // 소환 레벨 만렙에서 소환 버튼이 승천 안내로 전환된다 (사용자 확정 2026-08-17).
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

    // 스킬 1개의 고정 패시브 (기본 피해·기본 체력) — 상세 팝업 표시용
    passiveOf(id) {
        const d = this.def(id), sk = S.skills[id];
        if (!d || !sk) return { atk: Big.ZERO, hp: Big.ZERO };
        const base = SKILL_BASE_PASSIVE[d.rarity];
        const mult = Ascension.starMult(sk.stars).mul(this.levelMult(id));
        return { atk: mult.mul(base.atk * TechTree.skillPassiveDmgMult()), hp: mult.mul(base.hp * TechTree.skillPassiveHpMult()) };
    },

    // 보유한 모든 스킬의 고정 패시브 합계 (기본 피해·기본 체력).
    // 스킬 패시브는 '보유 효과' — 3개 장착 슬롯에 넣지 않아도 가지고만 있으면 합산된다
    // (사용자 확정 2026-08-17, 원본 포지마스터 방식). 장착이 결정하는 건 '발동'뿐:
    // 액티브 시전은 Combat이 S.equippedSkills만 돌린다.
    // 펫·탈것은 이와 달리 출전/장착 효과라 activeBonus()로 유지.
    ownedPassive() {
        let atk = Big.ZERO, hp = Big.ZERO;
        for (const id of Object.keys(S.skills)) {
            const p = this.passiveOf(id);
            atk = atk.add(p.atk);
            hp = hp.add(p.hp);
        }
        return { atk, hp };
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
