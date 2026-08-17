// ===== 대장간: 제작(뽑기), 장비, 판매, 업그레이드 =====
const Forge = {
    // 장비 티어 기본치: 시대가 오를수록 ×6
    TIER_BASE_ATK: 12,
    TIER_BASE_HP: 70,
    TIER_STEP: 6,          // 시대당 배수
    ATK_SLOTS: 4,          // 무기·장갑·목걸이·반지
    HP_SLOTS: 4,           // 투구·갑옷·신발·벨트
    LEVEL_STEP: 1.01,      // 레벨당 배수 — 펫·탈것도 이 커브로 통일 (사용자 확정 2026-08-17)
    tierBaseAtk(ageIdx) { return this.TIER_BASE_ATK * Math.pow(this.TIER_STEP, ageIdx); },
    tierBaseHp(ageIdx) { return this.TIER_BASE_HP * Math.pow(this.TIER_STEP, ageIdx); },
    // 레벨 배율 — 장비·펫·탈것 공용 (등가가 특정 레벨에서만 성립하지 않게 커브를 하나로 통일)
    levelMult(level) { return Math.pow(this.LEVEL_STEP, (level || 1) - 1); },

    // ===== 펫·탈것 밸런스 기준축 (사용자 확정 2026-08-17) =====
    // 펫/탈것 등급 6단계를 장비 시대 10단계에 양끝 맞춤: 일반=원시(0), 신화=디바인(9).
    // 중간은 등급당 ×6^(9/5)≈24.6이라 일반→신화 총 스팬이 장비의 6^9와 정확히 같아진다.
    ageOfRarity(rarity) { return RARITIES.indexOf(rarity) * (AGES.length - 1) / (RARITIES.length - 1); },
    // 같은 등급·레벨에서 장비 8부위 합 — 펫·탈것 기준치는 전부 이 값에서 나온다
    gearSumAtkAt(rarity, level = 1) { return this.ATK_SLOTS * this.tierBaseAtk(this.ageOfRarity(rarity)) * this.levelMult(level); },
    gearSumHpAt(rarity, level = 1) { return this.HP_SLOTS * this.tierBaseHp(this.ageOfRarity(rarity)) * this.levelMult(level); },

    // 장비 1개의 최종 능력치 = 티어 기본치 × 레벨 배율 × 승천 배율 (등급 배율 없음 — rollItem 메모 참조).
    // 승천 배율(Ascension.STAR_MULT^별)이 곱해지는 순간 Number 한계를 넘으므로 Big으로 계산한다.
    itemValue(item) {
        if (!item) return Big.ZERO;
        return Big.of(item.value).mul(Ascension.starMult(item.stars));
    },

    // ===== 시대별 뽑기 레벨 (원본 포지마스터 방식, 사용자 원본 확인 2026-08-17) =====
    // 대장간 레벨로 장비 레벨을 산정하던 방식(forgeLevel×3, max-5~max)은 추측이라 폐기.
    // 각 시대는 자기만의 "현재 뽑기 레벨"(S.rollLevel[age])을 갖고, 그 시대 장비가 나올 때마다
    // 랜덤워크로 오르내린다 — 그래서 오래 뽑은 시대는 100레벨, 방금 열린 시대는 1레벨부터 나온다.
    ROLL_BASE_CAP: 100,   // 기본 레벨 캡 (기술트리 '장비 레벨업' 노드로 상향)
    ROLL_UP_PCT: 70,      // +1레벨 확률(%)
    ROLL_SAME_PCT: 20,    // 동일 확률(%) — 나머지 10%가 −1레벨

    // 레벨 캡 = 100 + 기술트리 보너스. '장비 레벨업' 노드(+2/pt)는 기술 트리 원본화 작업에서
    // 추가될 예정이라, 노드가 아직 없으면 gearMaxLevelBonus()가 0을 돌려줘 기본 캡 100이 된다.
    maxItemLevel() { return this.ROLL_BASE_CAP + TechTree.gearMaxLevelBonus(); },

    // 구세이브 보정 + 신규 시대 lazy 초기화. 처음 열린 시대는 1레벨부터 시작한다.
    ensureRollLevels() {
        if (!S.rollLevel || typeof S.rollLevel !== 'object') S.rollLevel = {};
        for (const age of AGES) {
            const v = S.rollLevel[age];
            if (typeof v !== 'number' || !isFinite(v) || v < 1) S.rollLevel[age] = 1;
        }
    },

    // 그 시대의 현재 뽑기 레벨 (캡으로 잘라서 반환 — 기술트리 캡이 내려가는 경우 대비)
    rollLevelOf(age) {
        this.ensureRollLevels();
        return U.clamp(S.rollLevel[age], 1, this.maxItemLevel());
    },

    // 그 시대 장비를 1개 뽑은 뒤의 랜덤워크: +1(70%) / 동일(20%) / −1(10%), [1, 캡]으로 제한
    advanceRollLevel(age) {
        this.ensureRollLevels();
        const roll = Math.random() * 100;
        const delta = roll < this.ROLL_UP_PCT ? 1
            : roll < this.ROLL_UP_PCT + this.ROLL_SAME_PCT ? 0
                : -1;
        S.rollLevel[age] = U.clamp(S.rollLevel[age] + delta, 1, this.maxItemLevel());
        return S.rollLevel[age];
    },

    // 라인 승천 시 호출 — 모든 시대의 뽑기 레벨을 1로 되돌린다(승천 1회차에도 원시부터 1레벨).
    resetRollLevels() {
        S.rollLevel = {};
        this.ensureRollLevels();
    },

    // ⚠️ 장비 등급 롤(`rarityWeights`)은 폐기됐다 (사용자 확정 2026-08-18 "ⓑ로 해라 롤 없애고").
    //    장비의 등급 축은 시대(AGES)뿐이고, 예전엔 그 위에 **화면에 안 보이는** 등급을 하나 더
    //    굴려 주스탯을 최대 6.5배(RARITY_MULT) 흔들었다 — 같은 시대·이름·레벨 장비 둘의 전력이
    //    이유 없이 달라 보이던 원인. 이제 변동폭은 **시대·레벨·서브스탯 개수**만 만든다.
    //    RARITY_* 상수는 펫·알·탈것·스킬 전용으로 남는다(장비에서 참조 금지 — TODO 제약 참조).
    // 시대별 확률표 (지정 레벨, 없으면 1레벨)
    ageProbsAt(level) { return forgeProbabilities[level] || forgeProbabilities[1]; },

    // 부위별 외형 변형 개수 (무기=그 시대의 등장 무기 수, 투구/갑옷=시대별 이름 수, 장신구=3종 고정)
    variantCount(age, slot) {
        if (slot === 'weapon') return weaponsOfAge(age).length;
        if (slot === 'helmet' || slot === 'armor') return (ITEM_NAMES[age] && ITEM_NAMES[age][slot] && ITEM_NAMES[age][slot].length) || 1;
        return accNames(age, slot).length || 1;
    },
    // 특정 시대·부위의 개별 아이템(등급 무관) 1개가 나올 확률(%) — rollItem 추첨 로직을 그대로 역산
    itemDropChance(age, slot) {
        const ageP = (this.ageProbsAt(S.forgeLevel)[age] || 0) / 100;
        const slotP = 1 / SLOTS.length;
        const variantP = 1 / this.variantCount(age, slot);
        return ageP * slotP * variantP * 100;
    },

    // 아이템 롤: 시대(원본 확률표) + 레벨 + 서브스탯 — **등급 롤 없음**(위 메모 참조)
    rollItem() {
        const probs = forgeProbabilities[S.forgeLevel] || forgeProbabilities[1];
        const age = U.weightedPick(probs);
        const ageIdx = AGES.indexOf(age);

        // 레벨: 그 시대의 현재 뽑기 레벨을 그대로 쓰고, 뽑은 뒤 랜덤워크로 다음 레벨을 굴린다.
        // (뽑기 전이 아니라 뽑은 뒤에 굴려야 그 시대의 첫 장비가 1레벨로 나온다 — 원본 규칙 ①)
        const level = this.rollLevelOf(age);
        this.advanceRollLevel(age);

        const slot = U.choice(SLOTS);
        const lvMult = Math.pow(1.01, level - 1);
        const main = SLOT_MAIN[slot];
        // 주스탯 = 시대 티어 × 레벨 배율. 등급 배율이 빠지면서 **같은 시대·레벨·부위 장비의
        // 주스탯은 항상 같다** — 차이는 서브스탯과 승천 별에서만 난다.
        // 이 식은 펫·탈것 밸런스 기준축(gearSumAtkAt/gearSumHpAt)이 이미 쓰던 값과 정확히 일치한다
        // (그 축엔 원래 등급 배율이 없었다 — 즉 이번 제거로 실제 장비가 기준축과 맞아떨어졌다).
        const value = Math.floor((main === 'atk' ? this.tierBaseAtk(ageIdx) : this.tierBaseHp(ageIdx)) * lvMult);

        // 서브스탯: 1~4개 랜덤 (예전엔 등급 순번+1이 상한이었다 — 등급이 사라지며 변동폭을 여기가 받는다)
        const numSubs = U.randInt(1, 4);
        const subs = U.rollSubs(numSubs);

        // 무기: 그 시대에 실제로 존재한 무기 중에서만 랜덤 — 모델·모션 결정
        //       (시대 무관 전체 풀에서 뽑으면 원시 시대에 총이 나온다 — 사용자 지시 2026-08-17)
        // 투구/갑옷: 카탈로그 이름 인덱스 저장 — 이름별 3D 디자인 결정
        let wtype = null, name, nameIdx = -1;
        if (slot === 'weapon') {
            const pool = weaponsOfAge(age);
            nameIdx = U.randInt(0, pool.length - 1);
            wtype = pool[nameIdx];
            // 무기 이름은 이제 시대 전용이므로(몽둥이=원시, 세라핌의 활=천상) 시대 접두사를 붙이지 않는다.
            // 표시하는 쪽이 이미 '[시대] 이름'으로 감싸서 '[원시] 원시 몽둥이'가 됐다 — 투구·갑옷·장신구와 같은 규칙으로 통일.
            name = WEAPON_TYPES[wtype].kr;
        } else {
            const cat = ITEM_NAMES[age];
            if (cat && cat[slot]) {
                nameIdx = U.randInt(0, cat[slot].length - 1);
                name = cat[slot][nameIdx];
            } else {
                // 장신구류: 부위당 3종 변형 (이름+프리뷰 모델 상이) — 이름은 시대 테마를 따른다
                const accs = accNames(age, slot);
                nameIdx = U.randInt(0, accs.length - 1);
                name = accs[nameIdx];
            }
        }

        return { name, slot, age, ageIdx, level, main, value, subs, wtype, nameIdx, stars: Ascension.count('forge') };
    },

    // 장비 비교용 종합 위력 (Big) — 승천 별이 붙으면 Number로는 표현이 안 돼 Big으로 반환한다.
    itemPower(item) {
        if (!item) return Big.ZERO;
        let sub = 1;
        for (const s of item.subs) sub *= (1 + s.value / 200); // 서브스탯 대략 환산 (배율이라 Number로 충분)
        return this.itemValue(item).mul(sub);
    },

    // 장착 중인 장비와 슬롯·시대·이름이 같은지 (비교 팝업의 '같은 장비' 표기용)
    // 등급 롤 폐기로 `a.rarity === b.rarity` 조건이 사라졌다 — 이제 같은 이름·같은 시대면 같은 장비다
    // (이름은 시대 카탈로그에서 나오므로 시대까지 보면 동일 디자인이 보장된다).
    isMatchingGear(a, b) {
        return !!a && !!b && a.slot === b.slot && a.age === b.age && a.name === b.name;
    },
    // 개별 장비 승천은 폐기 — 승천은 대장간 라인 단위(Ascension.ascend('forge'))로만 일어나고,
    // 제작되는 장비가 그 승천 횟수만큼 별을 달고 나온다 (사용자 확정 2026-08-17).

    // 판매가 = **원본 공식 그대로** `20 × 1.01^(레벨-1) × (1 + 판매보너스%)` (BALANCE.md '대장간' 절).
    // 우리 클론만 여기에 등급 배수(RARITY_MULT 1~6.5)를 얹고 있었는데, 원본에는 그런 축이 없다 —
    // 원본도 장비를 시대 티어 10단계로만 구분한다(BALANCE.md '등급 체계'). 등급 롤을 없애면서
    // 배수도 원본대로 되돌린다: 시대가 뒤일수록 뽑기 레벨이 높아 판매가는 레벨을 타고 자연히 오른다.
    sellPrice(item) {
        return Math.floor(20 * Math.pow(1.01, item.level - 1) * TechTree.sellPriceMult());
    },

    craft(count) {
        const results = [];
        for (let i = 0; i < count; i++) {
            if (S.hammers < 1) break;
            // 기술트리 '무료 제련 확률'(+1%/업): 해머를 소모하지 않고 제련
            if (!U.chance(TechTree.freeForgeChance())) S.hammers -= 1;
            S.totalCrafts++;
            results.push(this.rollItem());
        }
        if (results.length) SFX.craft();
        Quests.bump('craft', results.length);   // 반복 퀘스트 '장비 제작'
        return results;
    },

    equip(item) {
        const prev = S.equipment[item.slot];
        S.equipment[item.slot] = item;
        if (typeof Scene3D !== 'undefined') Scene3D.refreshHeroEquip(true); // 교체 연출 포함
        Combat.recalcHero();
        Quests.bump('equipGear');               // 반복 퀘스트 '장비 장착'
        return prev; // 이전 장비 — 호출부는 참조만 하고 버린다(보관·판매 없음)
    },

    sell(item) {
        const price = this.sellPrice(item);
        S.coins += price;
        Quests.bump('sellGear');                // 반복 퀘스트 '장비 판매'
        return price;
    },

    // 더 좋으면 장착, 아니면 새 것을 판매. 반환: {equipped, gained}
    // **장착으로 밀려난 이전 장비는 그냥 사라진다** — 판매도 보관도 없다(사용자 확정 2026-08-17:
    // "보관함 이런 거 만들라 한 적 없다". 원본 포지마스터에도 창고가 없다).
    // (동일 장비 '별 흡수' 경로는 라인 승천 도입으로 폐기 — 중복 장비는 일반 판매)
    autoResolve(item) {
        const cur = S.equipment[item.slot];
        // 승천 별을 쌓은 장착 중 장비는 오토포지가 임의로 교체하지 않음 — 교체는 항상 수동(비교 팝업)에서만
        // itemPower는 Big — '>'로 비교하면 객체가 문자열로 강제 변환돼 "1.2e5" > "3.4e2" 같은 사전식 비교가 된다. 반드시 gt()로.
        if ((!cur || !cur.stars) && this.itemPower(item).gt(this.itemPower(cur))) {
            this.equip(item);   // 이전 장비는 소멸
            return { equipped: true, gained: 0 };
        }
        return { equipped: false, gained: this.sell(item) };
    },

    // ===== 자동 제련 설정 (UI-SPEC 21~24번 '자동 제련' 팝업) =====
    autoForgeConfig() {
        if (!S.autoForge) S.autoForge = { keepAges: [], filterOn: false, filterSubs: [], hammersPerBatch: 10, continueOnTarget: false };
        return S.autoForge;
    },
    // 유지 시대나 옵션 필터를 하나라도 켜 뒀는가 = '목표 장비'라는 개념이 정의돼 있는가.
    // 기본값(유지 시대 전부 미체크 + 필터 OFF)은 목표가 없는 상태다.
    hasAutoTarget() {
        const cfg = this.autoForgeConfig();
        return cfg.keepAges.length > 0 || (cfg.filterOn && cfg.filterSubs.length > 0);
    },
    // 유지 시대·옵션 필터를 통과하는 아이템만 자동 장착 후보로 인정 (탈락 시 즉시 판매)
    // 목표 미설정(기본값)이면 **무엇도 목표가 아니다** — 예전엔 여기서 무조건 true를 돌려줘
    // 뽑히는 족족 '목표 장비'로 판정됐고, 그래서 비교 팝업이 뜬 채 배치가 첫 제작에서 멈춰
    // '한 번에 사용된 망치 수' 설정이 통째로 무의미했다 (QA 9차).
    passesAutoFilter(item) {
        const cfg = this.autoForgeConfig();
        if (!this.hasAutoTarget()) return false;
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
        const spent = this.upgradeCost(info);
        S.coins -= spent; // 업그레이드는 골드로 (해머는 제작 전용)
        Quests.bump('coinSpend', spent);        // 반복 퀘스트 '코인 소비' — 게임에서 코인이 나가는 유일한 지점
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
            Quests.bump('gearUpgrade');          // 반복 퀘스트 '대장간 강화 완료'
            SFX.levelUp();
            UI.toast(`⚒️ 대장간 레벨 ${S.forgeLevel} 달성!`);
            UI.renderEquipSheet();
            if (!UI.els.forgeInfoModal.classList.contains('hidden')) UI.renderForgeInfo(); // 열린 확률 정보 팝업도 새 레벨로 즉시 갱신
            if (!UI.els.autoForgeModal.classList.contains('hidden')) UI.renderAutoForge(); // 자동 제련 시대 목록도 새 시대 반영
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
        let atk = Big.of(15), hp = Big.of(150); // 맨몸 기본치
        let gearAtk = Big.ZERO, gearHp = Big.ZERO; // 기술트리 '장비 숙련' 보너스가 적용되는 부분
        for (const slot of SLOTS) {
            const it = S.equipment[slot];
            if (!it) continue;
            const v = this.itemValue(it); // 승천(별): 장비 1개당 별 개수만큼 능력치 배율 상승
            if (it.main === 'atk') gearAtk = gearAtk.add(v); else gearHp = gearHp.add(v);
        }
        // 출전 펫 + 장착 탈것: 고정 데미지·체력 + 서브스탯 (전투에 직접 참여하지 않고 스탯만 기여)
        const pb = Pets.activeBonus();
        const mb = Mounts.activeBonus();
        const sb = Skills.ownedPassive(); // 보유 스킬 패시브: 장착 여부와 무관, 고정 데미지·체력만 기여 (서브스탯 없음)
        const bag = this.allSubsBag();

        // 전투 중 버프 반영 (스킬 버프는 서브스탯 풀과 별개의 임시 효과)
        let buffAtkPct = 0, buffAtkSpd = 0;
        for (const b of Combat.buffs) {
            if (b.buff.atkPct) buffAtkPct += b.buff.atkPct;
            if (b.buff.atkSpd) buffAtkSpd += b.buff.atkSpd;
        }

        // 합산은 Big — 승천한 장비/펫/탈것/스킬이 하나라도 섞이면 Number로는 담기지 않는다.
        atk = atk.add(gearAtk.mul(TechTree.gearAtkMult())).add(pb.atk).add(mb.atk).add(sb.atk);
        hp = hp.add(gearHp.mul(TechTree.gearHpMult())).add(pb.hp).add(mb.hp).add(sb.hp);
        return {
            // atk·hp만 Big. 나머지(확률·%·공속)는 승천과 무관하게 작은 값이라 Number 그대로 둔다.
            atk: atk.mul(1 + (bag.dmgPct + buffAtkPct) / 100),
            hp: hp.mul(1 + bag.hpPct / 100),
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

/* 캡처 하네스 지원(state.js 주석 참고): 렉시컬 전역을 window에도 노출 — Playwright 격리 컨텍스트용 */
window.Forge = Forge;
