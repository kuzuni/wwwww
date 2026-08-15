// ===== 대장간: 제작(뽑기), 장비, 판매, 업그레이드 =====
const Forge = {
    // 장비 티어 기본치: 시대가 오를수록 ×6 (펫 성장 커브에 맞춘 근사)
    tierBaseAtk(ageIdx) { return 12 * Math.pow(6, ageIdx); },
    tierBaseHp(ageIdx) { return 70 * Math.pow(6, ageIdx); },

    maxItemLevel() { return Math.min(100, S.forgeLevel * 3); },

    // 아이템 롤: 시대(원본 확률표) + 등급 + 레벨 + 서브스탯
    rollItem() {
        const probs = forgeProbabilities[S.forgeLevel] || forgeProbabilities[1];
        const age = U.weightedPick(probs);
        const ageIdx = AGES.indexOf(age);

        // 등급: 대장간 레벨에 따라 고등급 확률 상승 (자체 설계 — 원본 미공개)
        const fl = S.forgeLevel;
        const rarityW = {
            common: 60, rare: 22 + fl * 0.3, epic: 9 + fl * 0.35,
            legendary: 3 + fl * 0.22, ultimate: 0.6 + fl * 0.1, mythic: 0.08 + fl * 0.04
        };
        const rarity = U.weightedPick(rarityW);

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
        const subs = U.rollSubs(rarity, numSubs);

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

        return { name, slot, age, ageIdx, rarity, level, main, value, subs, wtype, nameIdx };
    },

    itemPower(item) {
        if (!item) return 0;
        let p = item.value;
        for (const s of item.subs) p *= (1 + s.value / 200); // 서브스탯 대략 환산
        return p;
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

    // 더 좋으면 장착하고 이전 장비 판매, 아니면 그대로 판매. 반환: {equipped, gained}
    autoResolve(item) {
        const cur = S.equipment[item.slot];
        if (this.itemPower(item) > this.itemPower(cur)) {
            const prev = this.equip(item);
            const gained = prev ? this.sell(prev) : 0;
            return { equipped: true, gained };
        }
        return { equipped: false, gained: this.sell(item) };
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
            UI.renderForge();
            saveGame();
        }
    },

    // 영웅 종합 스탯 (장비 + 서브스탯 + 버프)
    heroStats() {
        let atk = 15, hp = 150; // 맨몸 기본치
        let gearAtk = 0, gearHp = 0; // 기술트리 '장비 숙련' 보너스가 적용되는 부분
        let atkPct = 0, hpPct = 0, critCh = 5, critDmg = 100, atkSpd = 0, dblAtk = 0;
        for (const slot of SLOTS) {
            const it = S.equipment[slot];
            if (!it) continue;
            if (it.main === 'atk') gearAtk += it.value; else gearHp += it.value;
            for (const s of it.subs) {
                if (s.key === 'atkPct') atkPct += s.value;
                else if (s.key === 'hpPct') hpPct += s.value;
                else if (s.key === 'critCh') critCh += s.value;
                else if (s.key === 'critDmg') critDmg += s.value;
                else if (s.key === 'atkSpd') atkSpd += s.value;
                else if (s.key === 'dblAtk') dblAtk += s.value;
            }
        }
        // 전투 중 버프 반영
        for (const b of Combat.buffs) {
            if (b.buff.atkPct) atkPct += b.buff.atkPct;
            if (b.buff.atkSpd) atkSpd += b.buff.atkSpd;
        }
        // 출전 펫 + 장착 탈것: 고정 데미지·체력 + 서브스탯 (전투에 직접 참여하지 않고 스탯만 기여)
        const pb = Pets.activeBonus();
        const mb = Mounts.activeBonus();
        atkPct += pb.atkPct + mb.atkPct; hpPct += pb.hpPct + mb.hpPct;
        critCh += pb.critCh + mb.critCh; critDmg += pb.critDmg + mb.critDmg;
        atkSpd += pb.atkSpd + mb.atkSpd; dblAtk += pb.dblAtk + mb.dblAtk;
        atk += gearAtk * TechTree.gearPowerMult() + pb.atk + mb.atk;
        hp += gearHp * TechTree.gearPowerMult() + pb.hp + mb.hp;
        return {
            atk: atk * (1 + atkPct / 100) * Ascension.powerMult(),
            hp: hp * (1 + hpPct / 100) * Ascension.powerMult(),
            critCh: Math.min(80, critCh),
            critDmg,
            attacksPerSec: 1.1 * (1 + atkSpd / 100),
            dblAtk: Math.min(50, dblAtk),
        };
    },
};
