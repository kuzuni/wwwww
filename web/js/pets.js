// ===== 펫: 알 드랍(원본 확률) → 부화(원본 시간) → 전투 참여/합성 =====
const Pets = {
    BASE_HATCH_SLOTS: 3, // 원본 스크린샷 기준 부화장 기본 슬롯 3개 (UI-SPEC.md 53번 줄)
    MAX_HATCH_SLOTS_CAP: 5, // 젬 구매로 늘릴 수 있는 상한 (원본 상한 미확보 → 자체 설계)
    SLOT_GEM_COST: 400, // 원본 확인된 단가(◆400) — 이후 구매는 회당 누적 증가(자체 설계)
    MAX_ACTIVE: 3,
    MAX_LEVEL: 100, // 승천은 Lv.100 도달부터 (사용자 확정 스펙 2026-08-17) — 경험치 커브는 기존 곡선 연장

    // 현재 부화장 슬롯 수 (기본 2 + 젬 구매분, UI-SPEC 9번 "슬롯+1 ◆400")
    maxHatchSlots() { return Math.min(this.MAX_HATCH_SLOTS_CAP, this.BASE_HATCH_SLOTS + (S.hatchSlotBonus || 0)); },
    slotCost() { return this.SLOT_GEM_COST * (1 + (S.hatchSlotBonus || 0)); },
    canBuySlot() { return this.maxHatchSlots() < this.MAX_HATCH_SLOTS_CAP; },
    buySlot() {
        if (!this.canBuySlot()) return false;
        const cost = this.slotCost();
        if (S.gems < cost) return false;
        S.gems -= cost;
        S.hatchSlotBonus = (S.hatchSlotBonus || 0) + 1;
        saveGame();
        return true;
    },

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

    // 알 소환 (UI-SPEC 9번 "[소환 x1 🥚100]") — 소환 레벨에 따른 등급 확률로 알 1개 획득
    // 원본 펫 전용 소환 확률표 미확보 → 스킬 소환 확률 곡선(skillRatesData)을 재사용해 자체 설계
    SUMMON_EGG_COST: 100,
    summonLevel() { return Math.min(100, Math.floor((S.petSummonCount || 0) / 5) + 1); },
    rates(level) {
        const r = skillRatesData[U.clamp(level || this.summonLevel(), 1, 100)];
        return { common: r[0], rare: r[1], epic: r[2], legendary: r[3], ultimate: r[4], mythic: r[5] };
    },
    // count번 연속 소환(UI-SPEC "소환 x5" 배치, 스킬과 동일 패턴) — 비용·보관함 여유를 선결제로 한 번에 확인, 결과는 배열로 반환
    canSummon(count = 1) { return (S.eggCurrency || 0) >= this.SUMMON_EGG_COST * count && S.eggs.length + count <= 20; },
    summon(count = 1) {
        if (!this.canSummon(count)) return null;
        S.eggCurrency -= this.SUMMON_EGG_COST * count;
        const results = [];
        for (let i = 0; i < count; i++) {
            S.petSummonCount = (S.petSummonCount || 0) + 1;
            const rarity = U.weightedPick(this.rates());
            this.addEgg(rarity);
            results.push({ rarity });
        }
        const bestRarity = results.reduce((best, r) =>
            RARITIES.indexOf(r.rarity) > RARITIES.indexOf(best) ? r.rarity : best, results[0].rarity);
        SFX.gacha(bestRarity);
        saveGame();
        return { results };
    },

    hatchTimeSec(rarity) { return baseHatchingTimes[rarity] * 60 * TechTree.hatchSpeedMult(); }, // ANIMALS 분기 '부화 가속'

    startHatch(eggIdx) {
        if (S.hatching.length >= this.maxHatchSlots()) return false;
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
                    // 중복 → 합성/승천 재료(dupes)로만 적립. 레벨업은 '업그레이드' 팝업에서 경험치 흡수로만 진행
                    existing.dupes++;
                    UI.toast(`🥚 ${PET_KR[def.name] || def.name} 중복 획득 (재료 ${existing.dupes})`);
                } else {
                    S.pets.push({ name: def.name, rarity: h.rarity, level: 1, dupes: 0, xp: 0, stars: Ascension.count('pet'), subs: this.rollSubs() });
                    if (S.activePets.length < this.MAX_ACTIVE) {
                        S.activePets.push(S.pets.length - 1);
                        if (typeof Scene3D !== 'undefined') Scene3D.refreshPets();
                    }
                    UI.toast(`🎉 새 펫: ${PET_KR[def.name] || def.name} (${RARITY_KR[h.rarity]})`);
                }
                Combat.recalcHero();
                UI.renderPets();
                UI.renderEquipSheet();
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

    // 옵션 2개: 장비와 동일한 서브스탯 풀(등급 무관 1%~최대치)에서 굴림
    rollSubs() { return U.rollSubs(2); },

    // 장착(출전) 시 펫 1마리가 기여하는 고정 데미지·체력 (petStats 원본 수치 × 레벨 배율 × 승천 배율)
    petPower(p) {
        const def = this.petDef(p);
        const mult = this.levelMult(p) * Ascension.starMult(p.stars) * TechTree.petPowerMult();
        return { atk: def.damage * mult, hp: def.health * mult };
    },

    // 경험치 흡수형 업그레이드 (UI-SPEC '펫 업그레이드 팝업') — 원본 수치 미확보로 자체 설계 커브
    xpNeeded(level) { return Math.floor(80 * Math.pow(level, 1.6)); },
    // 재료로 흡수될 때 주는 경험치: 등급이 오를수록 크게 증가
    xpValue(rarity) { return 30 * Math.pow(3, RARITIES.indexOf(rarity)); },
    addXp(idx, amount) {
        const p = S.pets[idx];
        if (!p) return;
        p.xp = (p.xp || 0) + amount;
        while (p.level < this.MAX_LEVEL && p.xp >= this.xpNeeded(p.level)) {
            p.xp -= this.xpNeeded(p.level);
            p.level++;
        }
        if (p.level >= this.MAX_LEVEL) p.xp = 0; // 만렙 도달분 잉여 경험치는 버림 (승천은 별도 시스템)
    },
    // 선택한 펫/알을 흡수해 대상 펫에 경험치로 환산 (재료는 소모되어 사라짐, 개수 무제한 — 다중 레벨업은 addXp가 처리)
    absorbMaterials(target, materialPets, materialEggs) {
        if (!target) return false;
        let totalXp = 0;
        for (const p of materialPets) {
            if (p === target) continue;
            totalXp += this.xpValue(p.rarity) * this.levelMult(p);
            const idx = S.pets.indexOf(p);
            if (idx < 0) continue;
            S.activePets = S.activePets.filter(a => a !== idx).map(a => a > idx ? a - 1 : a);
            S.pets.splice(idx, 1);
        }
        for (const e of materialEggs) {
            totalXp += this.xpValue(e.rarity);
            const idx = S.eggs.indexOf(e);
            if (idx >= 0) S.eggs.splice(idx, 1);
        }
        const targetIdx = S.pets.indexOf(target);
        if (targetIdx < 0) return false;
        this.addXp(targetIdx, totalXp);
        if (typeof Scene3D !== 'undefined') Scene3D.refreshPets();
        Combat.recalcHero();
        saveGame();
        return true;
    },

    // 개별 펫 승천은 폐기 — 승천은 소환 라인 단위(Ascension.ascend('pet'))이며,
    // 소환 레벨 만렙에서 소환 버튼이 승천 안내로 전환된다 (사용자 확정 2026-08-17).

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

    // 합성: 같은 등급 여분 조각(dupes) 3개 → 상위 등급 랜덤 알. 레벨업·장착·승천된 펫 개체는 절대 소모하지 않음(조각만 소비)
    canMerge(rarity) {
        const ri = RARITIES.indexOf(rarity);
        if (ri >= RARITIES.length - 1) return false;
        return this.dupesOfRarity(rarity) >= 3;
    },

    dupesOfRarity(rarity) {
        return S.pets.filter(p => p.rarity === rarity).reduce((s, p) => s + p.dupes, 0);
    },

    merge(rarity) {
        if (!this.canMerge(rarity)) return false;
        if (S.eggs.length >= 20) { UI.toast('🥚 알 보관함이 가득 차 합성할 수 없습니다'); return false; }
        let need = 3;
        for (let i = 0; i < S.pets.length && need > 0; i++) {
            const p = S.pets[i];
            if (p.rarity !== rarity || p.dupes <= 0) continue;
            const useDupes = Math.min(p.dupes, need);
            p.dupes -= useDupes; need -= useDupes;
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
