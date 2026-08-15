// ===== 펫: 알 드랍(원본 확률) → 부화(원본 시간) → 전투 참여/합성 =====
const Pets = {
    MAX_HATCH_SLOTS: 2,
    MAX_ACTIVE: 3,
    MAX_LEVEL: 30, // 만렙 후 중복은 승천(별)으로 전환 (원본 레벨 상한 미확보 → 자체 설계)

    // 스테이지 키에 해당하는 알 등급 롤 (원본 eggDropRates)
    rollEggRarity(key) {
        const rates = eggDropRates[key] || eggDropRates['10-10'];
        return U.weightedPick(rates);
    },

    addEgg(rarity) {
        if (S.eggs.length >= 20) return false;
        S.eggs.push({ rarity });
        return true;
    },

    hatchTimeSec(rarity) { return baseHatchingTimes[rarity] * 60; },

    startHatch(eggIdx) {
        if (S.hatching.length >= this.MAX_HATCH_SLOTS) return false;
        const egg = S.eggs.splice(eggIdx, 1)[0];
        if (!egg) return false;
        S.hatching.push({ rarity: egg.rarity, endsAt: U.now() + this.hatchTimeSec(egg.rarity) * 1000 });
        saveGame();
        return true;
    },

    gemSkipCost(h) {
        const remainMin = Math.max(0, (h.endsAt - U.now()) / 60000);
        return Math.ceil(remainMin / 10);
    },

    gemSkip(idx) {
        const h = S.hatching[idx];
        if (!h) return false;
        const cost = this.gemSkipCost(h);
        if (S.gems < cost) return false;
        S.gems -= cost;
        h.endsAt = U.now() - 1;
        this.tick();
        return true;
    },

    // 부화 완료 처리
    tick() {
        for (let i = S.hatching.length - 1; i >= 0; i--) {
            const h = S.hatching[i];
            if (U.now() >= h.endsAt) {
                S.hatching.splice(i, 1);
                const def = U.choice(petStats[h.rarity]);
                const existing = S.pets.find(p => p.name === def.name);
                if (existing) {
                    existing.dupes++;
                    // 중복 → 자동 레벨업 (레벨 N→N+1에 중복 N개), 만렙 도달 후에는 중복만 쌓여 승천 재료가 됨
                    while (existing.dupes >= existing.level && existing.level < this.MAX_LEVEL) {
                        existing.dupes -= existing.level;
                        existing.level++;
                    }
                    UI.toast(`🥚 ${PET_KR[def.name] || def.name} 중복! → Lv.${existing.level}`);
                } else {
                    S.pets.push({ name: def.name, rarity: h.rarity, level: 1, dupes: 0, stars: 0, subs: this.rollSubs(h.rarity) });
                    if (S.activePets.length < this.MAX_ACTIVE) {
                        S.activePets.push(S.pets.length - 1);
                        if (typeof Scene3D !== 'undefined') Scene3D.refreshPets();
                    }
                    UI.toast(`🎉 새 펫: ${PET_KR[def.name] || def.name} (${RARITY_KR[h.rarity]})`);
                }
                Combat.recalcHero();
                UI.renderPets();
                saveGame();
            }
        }
    },

    petDef(p) {
        let d = (petStats[p.rarity] || []).find(x => x.name === p.name);
        if (!d) for (const r of RARITIES) { d = (petStats[r] || []).find(x => x.name === p.name); if (d) break; }
        return d || { name: p.name, damage: 50, health: 500 };
    },
    // 레벨(합성으로만 상승)에 따른 고정 스탯 배율 — 원본 레벨 커브 미확보, 자체 설계
    levelMult(p) { return 1 + 0.12 * (p.level - 1); },

    // 옵션 2개: 장비와 동일한 서브스탯 풀에서 등급 상한치 기준으로 굴림
    rollSubs(rarity) { return U.rollSubs(rarity, 2); },

    // 장착(출전) 시 펫 1마리가 기여하는 고정 데미지·체력 (petStats 원본 수치 × 레벨 배율 × 승천 배율)
    petPower(p) {
        const def = this.petDef(p);
        const mult = this.levelMult(p) * Ascension.starMult(p.stars);
        return { atk: def.damage * mult, hp: def.health * mult };
    },

    // 승천(별): 만렙 도달 후 중복(레벨 수만큼)을 소모해 별 1개 획득
    canAscend(idx) {
        const p = S.pets[idx];
        return !!p && p.level >= this.MAX_LEVEL && p.dupes >= this.MAX_LEVEL;
    },
    ascend(idx) {
        const p = S.pets[idx];
        if (!this.canAscend(idx)) return false;
        p.dupes -= this.MAX_LEVEL;
        p.stars = (p.stars || 0) + 1;
        Combat.recalcHero();
        saveGame();
        return true;
    },

    // 출전 중인 모든 펫의 합산 보너스 (고정 공격력·체력 + 서브스탯 원본 배열)
    activeBonus() {
        const b = { atk: 0, hp: 0, subs: [] };
        for (const idx of S.activePets) {
            const p = S.pets[idx];
            if (!p) continue;
            const pw = this.petPower(p);
            b.atk += pw.atk;
            b.hp += pw.hp;
            b.subs.push(...(p.subs || []));
        }
        return b;
    },

    toggleActive(petIdx) {
        const pos = S.activePets.indexOf(petIdx);
        if (pos >= 0) S.activePets.splice(pos, 1);
        else if (S.activePets.length < this.MAX_ACTIVE) S.activePets.push(petIdx);
        else return false;
        if (typeof Scene3D !== 'undefined') Scene3D.refreshPets();
        Combat.recalcHero();
        saveGame();
        return true;
    },

    // 합성: 같은 등급 펫 3마리(중복 포함 수량) → 상위 등급 랜덤 알
    canMerge(rarity) {
        const ri = RARITIES.indexOf(rarity);
        if (ri >= RARITIES.length - 1) return false;
        return this.countOfRarity(rarity) >= 3;
    },

    countOfRarity(rarity) {
        return S.pets.filter(p => p.rarity === rarity).reduce((s, p) => s + 1 + p.dupes, 0);
    },

    merge(rarity) {
        if (!this.canMerge(rarity)) return false;
        let need = 3;
        // 중복분부터 소모, 부족하면 개체 제거 (활성 목록 보정)
        for (let i = S.pets.length - 1; i >= 0 && need > 0; i--) {
            const p = S.pets[i];
            if (p.rarity !== rarity) continue;
            const useDupes = Math.min(p.dupes, need);
            p.dupes -= useDupes; need -= useDupes;
            if (need > 0) {
                S.activePets = S.activePets.filter(ai => ai !== i).map(ai => ai > i ? ai - 1 : ai);
                S.pets.splice(i, 1);
                need--;
            }
        }
        const next = RARITIES[RARITIES.indexOf(rarity) + 1];
        this.addEgg(next);
        if (typeof Scene3D !== 'undefined') Scene3D.refreshPets();
        Combat.recalcHero();
        UI.toast(`✨ 합성 성공! ${RARITY_KR[next]} 알 획득`);
        saveGame();
        return true;
    },
};
