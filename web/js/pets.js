// ===== 펫: 알 드랍(원본 확률) → 부화(원본 시간) → 전투 참여/합성 =====
const Pets = {
    BASE_HATCH_SLOTS: 3, // 원본 스크린샷 기준 부화장 기본 슬롯 3개 (UI-SPEC.md 53번 줄)
    MAX_HATCH_SLOTS_CAP: 5, // 젬 구매로 늘릴 수 있는 상한 (원본 상한 미확보 → 자체 설계)
    SLOT_GEM_COST: 400, // 원본 확인된 단가(◆400) — 이후 구매는 회당 누적 증가(자체 설계)
    // ⚠️ 예전엔 `MAX_ACTIVE: 3` **하나가 세 뜻으로 겹쳐** 있었다 — 출전 상한 / 부화 시 자동 출전 수 /
    //    밸런스 등가 나눗수. 그래서 "펫칸 제한없게 해라"(2026-08-18) 지시로 상한만 풀려는데 나머지 둘까지
    //    같이 흔들렸고, 뜻대로 세 상수로 쪼갰다. 그 뒤 같은 날 **출전 상한은 3으로 되돌아왔다**
    //    (`pet-equip-max3`: "제한 없다는 건 인벤토리 얘기고, 3개까지만 장착") — 쪼개 둔 덕에 상한만
    //    되살리면 됐다. **셋은 값이 같아도 같은 개념이 아니다. 하나로 합치지 말 것.**
    // ⚠️ **보유(인벤토리)는 무제한 그대로** — 상한은 출전(장착)에만 걸린다.
    MAX_ACTIVE: 3,   // 동시에 출전(장착)할 수 있는 최대 마리 수
    AUTO_ACTIVE: 3,  // 부화로 새 펫이 나왔을 때 자동으로 출전시키는 최대 마리 수(그 뒤로는 사용자가 고름)
    POWER_DIV: 3,    // 밸런스 등가 나눗수 — 펫 1마리 = 같은 등급 장비 8부위 합의 1/3 (사용자 확정 2026-08-17)
    // 알 보관 상한. 예전 값 20은 공통 소환 배수(UI.SUMMON_MULTS 최대 x75)보다 작아서
    // x25·x75가 빈 보관함에서도 항상 실패했다 — "제공되는 배수는 반드시 사용 가능해야 한다"에 맞춰
    // 최대 배수를 빈 보관함에서 한 번에 받을 수 있는 크기로 올린다.
    EGG_CAP: 100,
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
        if (S.eggs.length >= this.EGG_CAP) return false;
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
    eggSpace() { return Math.max(0, this.EGG_CAP - S.eggs.length); },
    // 보관함 여유가 요청 수보다 적으면 남은 칸만큼만 소환한다 — 배수 버튼이 죽는 대신
    // 실제로 소환될 개수로 줄어들고, 과금도 그 개수만큼만 한다.
    summonCount(count = 1) { return Math.min(Math.max(1, Math.floor(count) || 1), this.eggSpace()); },
    summonCost(count = 1) { return this.SUMMON_EGG_COST * this.summonCount(count); },
    canSummon(count = 1) {
        const n = this.summonCount(count);
        return n >= 1 && (S.eggCurrency || 0) >= this.SUMMON_EGG_COST * n;
    },
    summon(count = 1) {
        const n = this.summonCount(count);
        if (n < 1 || (S.eggCurrency || 0) < this.SUMMON_EGG_COST * n) return null;
        S.eggCurrency -= this.SUMMON_EGG_COST * n;
        const results = [];
        for (let i = 0; i < n; i++) {
            S.petSummonCount = (S.petSummonCount || 0) + 1;
            const rarity = U.weightedPick(this.rates());
            // 방어: 여유가 사라졌으면 남은 유료분은 소환하지 않고 그만큼 환불한다(아래 보너스 예약 규칙상 실제로는 발생하지 않음)
            if (!this.addEgg(rarity)) { S.eggCurrency += this.SUMMON_EGG_COST * (n - i); break; }
            results.push({ rarity });
            // 기술트리 '추가 알 소환 기회'(+2%/업): 비용 없이 알 1개 더.
            // 남은 유료분(n-1-i개) 자리를 보너스가 잡아먹으면 과금한 알이 사라지므로, 그만큼은 예약해 두고 남을 때만 준다.
            if (U.chance(TechTree.extraEggChance()) && this.eggSpace() > (n - 1 - i)) {
                const extra = U.weightedPick(this.rates());
                if (this.addEgg(extra)) results.push({ rarity: extra, extra: true });
            }
        }
        const bestRarity = results.reduce((best, r) =>
            RARITIES.indexOf(r.rarity) > RARITIES.indexOf(best) ? r.rarity : best, results[0].rarity);
        SFX.gacha(bestRarity);
        saveGame();
        // summoned/clamped = 요청 배수보다 적게 나갔는지(보관함 여유 부족) — UI가 안내 토스트에 쓴다
        return { results, requested: count, summoned: results.filter(r => !r.extra).length, clamped: n < count };
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
                    // 자동 출전도 출전 상한을 넘길 수 없다 — 둘 다 3이라 지금은 같은 결과지만,
                    // AUTO_ACTIVE 만 올리면 상한을 우회해 4마리가 나가 버린다(개념이 다른 두 값이다).
                    if (S.activePets.length < Math.min(this.AUTO_ACTIVE, this.MAX_ACTIVE)) {
                        S.activePets.push(S.pets.length - 1);
                        if (typeof Scene3D !== 'undefined') Scene3D.refreshPets();
                    }
                    UI.toast(`🎉 새 펫: ${PET_KR[def.name] || def.name} (${RARITY_KR[h.rarity]})`);
                }
                Combat.recalcHero();
                Quests.bump('petHatch');             // 반복 퀘스트 '알 부화'
                UI.renderPets();
                UI.renderEquipSheet();
                saveGame();
            }
        }
    },

    // 개체별 원본 수치(damage/health)는 밸런스 규칙이 우선이라 스탯 계산에서 빠졌고,
    // petStats는 이제 '어떤 등급에 어떤 펫이 있는가'(부화 풀·이름)만 담당해 petDef가 필요 없어졌다.
    // 레벨 배율 — 장비와 동일 커브(1.01^(lvl-1))로 통일. 전에는 1+0.12×(lvl-1)이라
    // L100에서 12.88배 vs 장비 2.68배로 어긋나, 특정 레벨에서만 등가가 성립했다 (사용자 확정 2026-08-17)
    levelMult(p) { return Forge.levelMult(p.level); },

    // 펫 1마리 = 같은 등급 장비 8부위 합의 1/3 (사용자 확정 2026-08-17).
    // 출전 슬롯 제한이 없어진 뒤로도 **마리당 기여도는 그대로** 둔다 — 나눗수를 출전 수에 연동하면
    // 펫을 더 장착할수록 마리당 값이 줄어 "칸을 늘렸는데 세지지 않는다"가 되기 때문.
    // 등급↔시대 매핑은 Forge.ageOfRarity가 담당하고, 여기선 개수 등가만 나눈다.
    baseStat(rarity) {
        return {
            atk: Forge.gearSumAtkAt(rarity) / this.POWER_DIV,
            hp: Forge.gearSumHpAt(rarity) / this.POWER_DIV,
        };
    },

    // 옵션 2개: 장비와 동일한 서브스탯 풀(등급 무관 1%~최대치)에서 굴림
    rollSubs() { return U.rollSubs(2); },

    // 장착(출전) 시 펫 1마리가 기여하는 고정 데미지·체력 = 등급 기준치 × 레벨 배율 × 승천 배율.
    // petStats의 개체별 damage/health는 밸런스 규칙(등급↔시대 매핑·개수 등가)이 우선이라 더 이상 쓰지 않는다
    // — 탈것이 원래 등급 기준(baseStat)이었던 것과 같은 방식으로 맞췄다 (사용자 확정 2026-08-17).
    petPower(p) {
        const base = this.baseStat(p.rarity);
        const mult = Ascension.starMult(p.stars).mul(this.levelMult(p));
        return { atk: mult.mul(base.atk * TechTree.petDmgMult()), hp: mult.mul(base.hp * TechTree.petHpMult()) };
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
        const b = { atk: Big.ZERO, hp: Big.ZERO, subs: [] };
        for (const idx of S.activePets) {
            const p = S.pets[idx];
            if (!p) continue;
            const pw = this.petPower(p);
            b.atk = b.atk.add(pw.atk);
            b.hp = b.hp.add(pw.hp);
            b.subs.push(...(p.subs || []));
        }
        return b;
    },

    // 출전/해제 토글. **출전은 MAX_ACTIVE(3)마리까지** (사용자 지시 2026-08-18 `pet-equip-max3`).
    // 보유는 무제한이라 목록에는 몇 마리든 있고, 그중 3마리만 나간다. 해제는 언제나 허용.
    // ⚠️ 상한에 걸린 것과 '그런 펫이 없다'를 호출부가 구분할 수 있어야 안내 문구가 갈린다 —
    //    실패는 둘 다 false 로 두되, 호출부는 `canActivate()` 로 미리 물어보고 문구를 고른다
    //    (반환값에 문자열 코드를 섞으면 `if (!toggleActive(i))` 로 쓰던 기존 호출부가 조용히 깨진다).
    canActivate(petIdx) {
        return !!S.pets[petIdx] && (S.activePets.indexOf(petIdx) >= 0 || S.activePets.length < this.MAX_ACTIVE);
    },
    toggleActive(petIdx) {
        if (!S.pets[petIdx]) return false;
        const pos = S.activePets.indexOf(petIdx);
        if (pos >= 0) S.activePets.splice(pos, 1);
        else if (S.activePets.length >= this.MAX_ACTIVE) return false;   // 상한 — 해제부터 하고 다시
        else S.activePets.push(petIdx);
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
        if (S.eggs.length >= this.EGG_CAP) { UI.toast('🥚 알 보관함이 가득 차 합성할 수 없습니다'); return false; }
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
        Quests.bump('petMerge');                     // 반복 퀘스트 '펫 합성'
        saveGame();
        return true;
    },
};
