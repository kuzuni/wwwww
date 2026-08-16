// ===== 대장간: 제작(뽑기), 장비, 판매, 업그레이드 =====
const Forge = {
    // 장비 티어 기본치: 시대가 오를수록 ×6 (펫 성장 커브에 맞춘 근사)
    tierBaseAtk(ageIdx) { return 12 * Math.pow(6, ageIdx); },
    tierBaseHp(ageIdx) { return 70 * Math.pow(6, ageIdx); },

    maxItemLevel() { return Math.min(100, S.forgeLevel * 3); },

    // 등급 가중치: 대장간 레벨에 따라 고등급 확률 상승 (자체 설계 — 원본 미공개)
    rarityWeights(fl) {
        return {
            common: 60, rare: 22 + fl * 0.3, epic: 9 + fl * 0.35,
            legendary: 3 + fl * 0.22, ultimate: 0.6 + fl * 0.1, mythic: 0.08 + fl * 0.04,
        };
    },
    // 시대별 확률표 (지정 레벨, 없으면 1레벨)
    ageProbsAt(level) { return forgeProbabilities[level] || forgeProbabilities[1]; },

    // 부위별 외형 변형 개수 (무기=10종 고정, 투구/갑옷=시대별 이름 수, 장신구=3종 고정)
    variantCount(age, slot) {
        if (slot === 'weapon') return Object.keys(WEAPON_TYPES).length;
        if (slot === 'helmet' || slot === 'armor') return (ITEM_NAMES[age] && ITEM_NAMES[age][slot] && ITEM_NAMES[age][slot].length) || 1;
        return (ACC_NAMES[slot] || []).length || 1;
    },
    // 특정 시대·부위의 개별 아이템(등급 무관) 1개가 나올 확률(%) — rollItem 추첨 로직을 그대로 역산
    itemDropChance(age, slot) {
        const ageP = (this.ageProbsAt(S.forgeLevel)[age] || 0) / 100;
        const slotP = 1 / SLOTS.length;
        const variantP = 1 / this.variantCount(age, slot);
        return ageP * slotP * variantP * 100;
    },

    // 아이템 롤: 시대(원본 확률표) + 등급 + 레벨 + 서브스탯
    rollItem() {
        const probs = forgeProbabilities[S.forgeLevel] || forgeProbabilities[1];
        const age = U.weightedPick(probs);
        const ageIdx = AGES.indexOf(age);

        const rarity = U.weightedPick(this.rarityWeights(S.forgeLevel));

        // 레벨: 원본 방식 — 일반 티어는 max-5~max, 최저확률 티어는 1부터
        const maxLv = this.maxItemLevel();
        const probsVals = Object.values(probs);
        const isLowestTier = probs[age] === Math.min(...probsVals) && probsVals.length > 1;
        const level = isLowestTier ? U.randInt(1, maxLv) : U.randInt(Math.max(1, maxLv - 5), maxLv);

        const slot = U.choice(SLOTS);
        const lvMult = Math.pow(1.01, level - 1);
        const rMult = RARITY_MULT[rarity];
        const main = SLOT_MAIN[slot];
        const value = Math.floor((main === 'atk' ? this.tierBaseAtk(ageIdx) : this.tierBaseHp(ageIdx)) * lvMult * rMult);

        // 서브스탯: 등급 순번+1개까지 랜덤
        const numSubs = U.randInt(1, Math.min(4, RARITIES.indexOf(rarity) + 1));
        const subs = U.rollSubs(numSubs);

        // 무기: 타입 10종(근거리 5/원거리 5) 중 랜덤 — 모델·모션 결정
        // 투구/갑옷: 카탈로그 이름 인덱스 저장 — 이름별 3D 디자인 결정
        let wtype = null, name, nameIdx = -1;
        if (slot === 'weapon') {
            wtype = U.choice(Object.keys(WEAPON_TYPES));
            name = `${AGE_KR[age]} ${WEAPON_TYPES[wtype].kr}`;
        } else {
            const cat = ITEM_NAMES[age];
            if (cat && cat[slot]) {
                nameIdx = U.randInt(0, cat[slot].length - 1);
                name = cat[slot][nameIdx];
            } else {
                // 장신구류: 부위당 3종 변형 (이름+프리뷰 모델 상이)
                const accs = ACC_NAMES[slot] || [SLOT_KR[slot]];
                nameIdx = U.randInt(0, accs.length - 1);
                name = `${AGE_KR[age]} ${accs[nameIdx]}`;
            }
        }

        return { name, slot, age, ageIdx, rarity, level, main, value, subs, wtype, nameIdx, stars: 0 };
    },

    itemPower(item) {
        if (!item) return 0;
        let p = item.value;
        for (const s of item.subs) p *= (1 + s.value / 200); // 서브스탯 대략 환산
        return p * Ascension.starMult(item.stars);
    },

    // 승천(별) 대상 판별: 이미 장착 중인 장비와 슬롯·등급·이름이 같은 장비를 다시 획득 (원본 조건 미확보 → 자체 설계)
    isMatchingGear(a, b) {
        return !!a && !!b && a.slot === b.slot && a.rarity === b.rarity && a.name === b.name;
    },
    // 장착 중인 장비에 별 1개 추가 (중복 장비를 흡수)
    ascendGear(slot) {
        const it = S.equipment[slot];
        if (!it) return false;
        it.stars = (it.stars || 0) + 1;
        Combat.recalcHero();
        saveGame();
        return true;
    },

    sellPrice(item) {
        // 원본 공식: 20 × 1.01^(레벨-1), 등급 배수 반영 + 기술트리 판매가 보너스
        return Math.floor(20 * Math.pow(1.01, item.level - 1) * RARITY_MULT[item.rarity] * TechTree.sellPriceMult());
    },

    craft(count) {
        const results = [];
        for (let i = 0; i < count; i++) {
            if (S.hammers < 1) break;
            S.hammers -= 1;
            S.totalCrafts++;
            results.push(this.rollItem());
        }
        if (results.length) SFX.craft();
        return results;
    },

    equip(item) {
        const prev = S.equipment[item.slot];
        S.equipment[item.slot] = item;
        if (typeof Scene3D !== 'undefined') Scene3D.refreshHeroEquip(true); // 교체 연출 포함
        Combat.recalcHero();
        return prev; // 이전 장비 (자동판매용)
    },

    sell(item) {
        const price = this.sellPrice(item);
        S.coins += price;
        return price;
    },

    // 동일 장비면 승천(별 흡수), 더 좋으면 장착하고 이전 장비 판매, 아니면 그대로 판매. 반환: {equipped, ascended, gained}
    autoResolve(item) {
        const cur = S.equipment[item.slot];
        if (this.isMatchingGear(item, cur)) {
            this.ascendGear(item.slot);
            return { equipped: false, ascended: true, gained: 0 };
        }
        // 승천 별을 쌓은 장착 중 장비는 오토포지가 임의로 교체·판매하지 않음(별은 판매가에 반영되지 않아 무경고로 영구 손실됨) — 교체는 항상 수동(비교 팝업)에서만
        if ((!cur || !cur.stars) && this.itemPower(item) > this.itemPower(cur)) {
            const prev = this.equip(item);
            const gained = prev ? this.sell(prev) : 0;
            return { equipped: true, gained };
        }
        return { equipped: false, gained: this.sell(item) };
    },

    // ===== 자동 제련 설정 (UI-SPEC 21~24번 '자동 제련' 팝업) =====
    autoForgeConfig() {
        if (!S.autoForge) S.autoForge = { keepAges: [], filterOn: false, filterSubs: [], hammersPerBatch: 10, continueOnTarget: false };
        return S.autoForge;
    },
    // 유지 시대·옵션 필터를 통과하는 아이템만 자동 장착 후보로 인정 (탈락 시 즉시 판매)
    passesAutoFilter(item) {
        const cfg = this.autoForgeConfig();
        if (cfg.keepAges.length && !cfg.keepAges.includes(item.age)) return false;
        if (cfg.filterOn && cfg.filterSubs.length && !item.subs.some(s => cfg.filterSubs.includes(s.key))) return false;
        return true;
    },

    // ===== 대장간 업그레이드 (원본 비용/시간 테이블, 실시간 타이머) =====
    upgradeInfo() {
        const next = S.forgeLevel + 1;
        if (next > 35) return null;
        return forgeUpgrades[next];
    },

    upgradeCost(info) { return Math.max(1, Math.floor(info.cost * TechTree.forgeCostMult())); },
    upgradeTime(info) { return info.time * TechTree.forgeTimeMult(); },

    canStartUpgrade() {
        const info = this.upgradeInfo();
        return info && !S.forgeUpgradeEndsAt && S.coins >= this.upgradeCost(info);
    },

    startUpgrade() {
        const info = this.upgradeInfo();
        if (!this.canStartUpgrade()) return false;
        S.coins -= this.upgradeCost(info); // 업그레이드는 골드로 (해머는 제작 전용)
        S.forgeUpgradeEndsAt = U.now() + this.upgradeTime(info) * 1000;
        saveGame();
        return true;
    },

    gemSkipCost() {
        if (!S.forgeUpgradeEndsAt) return 0;
        const remainMin = Math.max(0, (S.forgeUpgradeEndsAt - U.now()) / 60000);
        return Math.ceil(remainMin / 10); // 10분당 젬 1
    },

    gemSkip() {
        const cost = this.gemSkipCost();
        if (S.gems < cost || !S.forgeUpgradeEndsAt) return false;
        S.gems -= cost;
        S.forgeUpgradeEndsAt = U.now() - 1;
        this.tickUpgrade();
        return true;
    },

    tickUpgrade() {
        if (S.forgeUpgradeEndsAt && U.now() >= S.forgeUpgradeEndsAt) {
            S.forgeLevel = Math.min(35, S.forgeLevel + 1);
            S.forgeUpgradeEndsAt = null;
            SFX.levelUp();
            UI.toast(`⚒️ 대장간 레벨 ${S.forgeLevel} 달성!`);
            UI.renderEquipSheet();
            if (!UI.els.forgeInfoModal.classList.contains('hidden')) UI.renderForgeInfo(); // 열린 확률 정보 팝업도 새 레벨로 즉시 갱신
            saveGame();
        }
    },

    // 장비+출전 펫+장착 탈것의 서브스탯 13종 합계 (플레이어 정보 팝업 '옵션 합계 리스트'에도 공용)
    allSubsBag() {
        const gearSubs = [];
        for (const slot of SLOTS) {
            const it = S.equipment[slot];
            if (it) gearSubs.push(...it.subs);
        }
        return U.sumSubs(gearSubs, Pets.activeBonus().subs, Mounts.activeBonus().subs);
    },

    // 영웅 종합 스탯 (장비 + 서브스탯 + 버프) — 서브스탯 13종은 U.sumSubs로 공용 집계
    heroStats() {
        let atk = 15, hp = 150; // 맨몸 기본치
        let gearAtk = 0, gearHp = 0; // 기술트리 '장비 숙련' 보너스가 적용되는 부분
        for (const slot of SLOTS) {
            const it = S.equipment[slot];
            if (!it) continue;
            const starM = Ascension.starMult(it.stars); // 승천(별): 장비 1개당 별 개수만큼 능력치 배율 상승
            if (it.main === 'atk') gearAtk += it.value * starM; else gearHp += it.value * starM;
        }
        // 출전 펫 + 장착 탈것: 고정 데미지·체력 + 서브스탯 (전투에 직접 참여하지 않고 스탯만 기여)
        const pb = Pets.activeBonus();
        const mb = Mounts.activeBonus();
        const sb = Skills.activeBonus(); // 장착 스킬 패시브: 고정 데미지·체력만 기여 (서브스탯 없음)
        const bag = this.allSubsBag();

        // 전투 중 버프 반영 (스킬 버프는 서브스탯 풀과 별개의 임시 효과)
        let buffAtkPct = 0, buffAtkSpd = 0;
        for (const b of Combat.buffs) {
            if (b.buff.atkPct) buffAtkPct += b.buff.atkPct;
            if (b.buff.atkSpd) buffAtkSpd += b.buff.atkSpd;
        }

        atk += gearAtk * TechTree.gearPowerMult() + pb.atk + mb.atk + sb.atk;
        hp += gearHp * TechTree.gearPowerMult() + pb.hp + mb.hp + sb.hp;
        return {
            atk: atk * (1 + (bag.dmgPct + buffAtkPct) / 100),
            hp: hp * (1 + bag.hpPct / 100),
            critCh: Math.min(80, 5 + bag.critCh),
            critDmg: 100 + bag.critDmg,
            attacksPerSec: 1.1 * (1 + (bag.atkSpd + buffAtkSpd) / 100),
            dblAtk: Math.min(50, bag.dblAtk),
            block: Math.min(80, bag.block),
            hpRegen: bag.hpRegen,
            lifesteal: bag.lifesteal,
            meleeDmg: bag.meleeDmg,
            rangedDmg: bag.rangedDmg,
            skillDmg: bag.skillDmg,
            skillCd: Math.min(80, bag.skillCd),
            subs: bag, // 장비+펫+탈것 서브스탯 합계 원본 (플레이어 정보 팝업 '옵션 합계 리스트'용)
        };
    },
};
