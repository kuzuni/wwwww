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

    // 장비 1개의 최종 능력치 = 티어 기본치 × 레벨 배율 × 등급 배율 × 승천 배율.
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

    // 등급 가중치: 대장간 레벨에 따라 고등급 확률 상승 (자체 설계 — 원본 미공개)
    rarityWeights(fl) {
        return {
            common: 60, rare: 22 + fl * 0.3, epic: 9 + fl * 0.35,
            legendary: 3 + fl * 0.22, ultimate: 0.6 + fl * 0.1, mythic: 0.08 + fl * 0.04,
        };
    },
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

    // 아이템 롤: 시대(원본 확률표) + 등급 + 레벨 + 서브스탯
    rollItem() {
        const probs = forgeProbabilities[S.forgeLevel] || forgeProbabilities[1];
        const age = U.weightedPick(probs);
        const ageIdx = AGES.indexOf(age);

        const rarity = U.weightedPick(this.rarityWeights(S.forgeLevel));

        // 레벨: 그 시대의 현재 뽑기 레벨을 그대로 쓰고, 뽑은 뒤 랜덤워크로 다음 레벨을 굴린다.
        // (뽑기 전이 아니라 뽑은 뒤에 굴려야 그 시대의 첫 장비가 1레벨로 나온다 — 원본 규칙 ①)
        const level = this.rollLevelOf(age);
        this.advanceRollLevel(age);

        const slot = U.choice(SLOTS);
        const lvMult = Math.pow(1.01, level - 1);
        const rMult = RARITY_MULT[rarity];
        const main = SLOT_MAIN[slot];
        const value = Math.floor((main === 'atk' ? this.tierBaseAtk(ageIdx) : this.tierBaseHp(ageIdx)) * lvMult * rMult);

        // 서브스탯: 등급 순번+1개까지 랜덤
        const numSubs = U.randInt(1, Math.min(4, RARITIES.indexOf(rarity) + 1));
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

        return { name, slot, age, ageIdx, rarity, level, main, value, subs, wtype, nameIdx, stars: Ascension.count('forge') };
    },

    // 장비 비교용 종합 위력 (Big) — 승천 별이 붙으면 Number로는 표현이 안 돼 Big으로 반환한다.
    itemPower(item) {
        if (!item) return Big.ZERO;
        let sub = 1;
        for (const s of item.subs) sub *= (1 + s.value / 200); // 서브스탯 대략 환산 (배율이라 Number로 충분)
        return this.itemValue(item).mul(sub);
    },

    // 장착 중인 장비와 슬롯·등급·이름이 같은지 (비교 팝업의 '같은 장비' 표기용)
    isMatchingGear(a, b) {
        return !!a && !!b && a.slot === b.slot && a.rarity === b.rarity && a.name === b.name;
    },
    // 개별 장비 승천은 폐기 — 승천은 대장간 라인 단위(Ascension.ascend('forge'))로만 일어나고,
    // 제작되는 장비가 그 승천 횟수만큼 별을 달고 나온다 (사용자 확정 2026-08-17).

    sellPrice(item) {
        // 원본 공식: 20 × 1.01^(레벨-1), 등급 배수 반영 + 기술트리 판매가 보너스
        return Math.floor(20 * Math.pow(1.01, item.level - 1) * RARITY_MULT[item.rarity] * TechTree.sellPriceMult());
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
        // 🚨 **지급 직전 마지막 방어선** (autobatch-partial-item-nan-coins).
        //    `sellPrice` 는 `item.level`·`item.rarity` 를 읽는데, 손상 세이브에서 온 반쪽 항목은
        //    둘 다 없어 NaN 을 낸다. 그대로 더하면 `S.coins` 가 **영구히** NaN 이 되고
        //    (이후 모든 `S.coins += …` 가 NaN 을 물고 간다) 화면·저장 어디에도 티가 안 난다.
        //    호출부(`UI.isForgeShaped`)에서 이미 거르지만, 판매 경로는 자동 제련 말고도
        //    보관 덱·일괄 판매 등 여럿이라 **지급하는 자리에서 한 번 더** 본다.
        if (!Number.isFinite(price)) {
            console.error('Forge.sell: 판매가가 유한하지 않아 지급을 건너뛴다 —', JSON.stringify(item), 'price=' + price);
            return 0;
        }
        S.coins += price;
        Quests.bump('sellGear');                // 반복 퀘스트 '장비 판매'
        return price;
    },

    // 자동 경로로 들어온 장비의 처리 = **무조건 판매**. 반환: {equipped, gained}
    // 🚫 **자동 장착은 기능 자체가 삭제됐다 (사용자 지시 2026-08-20 autoforge-no-auto-equip:
    //    "자동제련 할 때 자동장착 되면 안 됨. 절대로." / "자동장착 기능 걍 빼버려라 아예").**
    //    종전엔 여기서 '장착품보다 강하고 장착품에 승천 별이 없으면' 자동으로 갈아입혔는데,
    //    그 분기를 통째로 걷었다. **장착은 언제나 플레이어가 비교 팝업 [장착]을 눌러야만 일어난다.**
    //    ⚠️ 되살리지 말 것 — '더 좋으면 갈아입혀 주는 게 친절하다'는 판단이 바로 사용자가 세 번
    //    막은 동작이다. 강한 장비를 놓치는 게 걱정이면 자동 장착이 아니라 **비교 팝업으로** 보낼 것.
    // `equipped` 는 항상 false 지만 반환 모양은 유지한다 — 호출부(코인 연출 분기)가 이 모양을 읽는다.
    autoResolve(item) {
        return { equipped: false, gained: this.sell(item) };
    },

    // ===== 자동 제련 설정 (UI-SPEC 21~24번 '자동 제련' 팝업) =====
    autoForgeConfig() {
        if (!S.autoForge) S.autoForge = { keepAges: [], filterOn: false, filterSubs: [], hammersPerBatch: 10, stopOnTarget: false };
        // 옛 필드 마이그레이션: continueOnTarget(기본 false = 첫 목표에서 정지)은 기본 설정에서
        // 배치를 카드 1장으로 끊어 "망치 10개인데 카드 1개"(autoforge-show-all-cards) 재지적을 낳았다.
        // 새 기본은 '예산 끝까지 계속'이고, 정지는 stopOnTarget을 켠 경우에만 한다.
        // 옛 값은 참/거짓 모두 '계속'으로 넘긴다 — 참은 원래 계속이었고, 거짓은 기본값이라
        // 사용자가 고른 적 없는 상태다(정지를 원하면 팝업에서 다시 켜면 된다).
        if ('continueOnTarget' in S.autoForge) { delete S.autoForge.continueOnTarget; S.autoForge.stopOnTarget = false; }
        if (S.autoForge.stopOnTarget === undefined) S.autoForge.stopOnTarget = false;
        return S.autoForge;
    },
    // 유지 시대나 옵션 필터를 하나라도 켜 뒀는가 = '목표 장비'라는 개념이 정의돼 있는가.
    // 기본값(유지 시대 전부 미체크 + 필터 OFF)은 목표가 없는 상태다.
    hasAutoTarget() {
        const cfg = this.autoForgeConfig();
        return cfg.keepAges.length > 0 || (cfg.filterOn && cfg.filterSubs.length > 0);
    },
    // 유지 시대·옵션 필터를 통과하는 아이템만 **비교 팝업 후보**로 인정 (탈락 시 즉시 판매).
    // ⚠️ 예전 주석은 '자동 장착 후보'라고 적혀 있었지만 자동 장착은 삭제됐다(autoforge-no-auto-equip).
    // 통과의 뜻은 '플레이어에게 물어본다'이지 '입혀 준다'가 아니다.
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
        Quests.bump('upgradeStart');            // 반복 퀘스트 '대장간 강화 시작'
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
            // ⚠️ `subs` 가 없는 장비 하나가 `boot()` 를 끊어 **전투가 시작조차 안 되던** 자리다
            //    (2026-08-19 QA 18차 save-item-no-subs-kills-boot — `it.subs is not iterable` →
            //     heroStats → recalcHero → Combat.start → main.js). UI 는 멀쩡히 그려져서
            //     '화면은 정상인데 적이 영원히 안 나오는' 오진하기 쉬운 그림이 됐다.
            //    세이브 자체는 `pruneDanglingRefs` 가 배열로 정규화하지만, 여기도 막는다 —
            //    이 함수는 세이브를 안 거친 임시 아이템(제작 중·비교 팝업 대상)도 받는다.
            if (it) gearSubs.push(...(Array.isArray(it.subs) ? it.subs : []));
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
        // ⚠️ 버프는 **고정 공격력 가산 하나뿐**이다 (사용자 지시 2026-08-19 buff-redesign-heal-atk-fixed).
        //    옛 `atkPct`(%)·`atkSpd`(공속) 버프는 폐기 — 여기에 공속 항을 되살리면 그 지시를 어기는 것이다.
        //    아래 `bag.atkSpd`는 **장비 서브스탯**이라 별개 시스템이고 그대로 남는다.
        let buffAtkFlat = Big.ZERO;
        for (const b of Combat.buffs) {
            if (b.buff && b.buff.atkFlat) buffAtkFlat = buffAtkFlat.add(b.buff.atkFlat);
        }

        // 합산은 Big — 승천한 장비/펫/탈것/스킬이 하나라도 섞이면 Number로는 담기지 않는다.
        atk = atk.add(gearAtk.mul(TechTree.gearAtkMult())).add(pb.atk).add(mb.atk).add(sb.atk);
        hp = hp.add(gearHp.mul(TechTree.gearHpMult())).add(pb.hp).add(mb.hp).add(sb.hp);
        return {
            // atk·hp만 Big. 나머지(확률·%·공속)는 승천과 무관하게 작은 값이라 Number 그대로 둔다.
            // 버프 가산은 서브스탯 % 배율 **뒤에** 더한다 — 고정값이라 장비 %에 휩쓸려 불어나면 '고정'이 아니다
            atk: atk.mul(1 + bag.dmgPct / 100).add(buffAtkFlat),
            hp: hp.mul(1 + bag.hpPct / 100),
            critCh: Math.min(80, 5 + bag.critCh),
            critDmg: 100 + bag.critDmg,
            attacksPerSec: 1.1 * (1 + bag.atkSpd / 100), // 버프 항 제거 — 공속 버프는 폐기됐고 장비 서브스탯만 남는다
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
