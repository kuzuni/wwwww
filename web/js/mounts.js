// ===== 마운트: 태엽(클록와인더) 소환(원본 확률표) → 수집/장착 → 고정 데미지·체력+옵션 부스트 =====
const Mounts = {
    MAX_LEVEL: 50, // 소환 레벨(등급 확률표) 상한
    INDIV_MAX_LEVEL: 100, // 승천은 Lv.100 도달부터 (사용자 확정 스펙 2026-08-17) — 경험치 커브는 기존 곡선 연장
    // 등급별 기준치는 Forge의 장비 8부위 합에서 파생된다(baseStat 참고) — 별도 기준값 상수 불필요.

    ensure() {
        if (S.winders === undefined) S.winders = 0;
        if (S.mountOpens === undefined) S.mountOpens = 0;
        if (!S.mounts) S.mounts = {};          // name → {rarity, level, dupes, subs}
        // 장착은 **1마리**다 (사용자 지시 2026-08-18 "탈것은 한 개만 장착 가능해야 하는데 여러 개 장착 가능하더라").
        // ⚠️ 같은 날의 '제한 없음' 지시와 헷갈리지 말 것 — 그건 **보유(인벤토리)** 얘기이고, 보유는 계속 무제한이다.
        //    자료 구조는 배열 그대로 두되(세이브 호환·`ridden()`/`setRidden` 경로가 배열 전제) **길이를 1로 못박는다.**
        // 구세이브(문자열 1개)는 loadGame의 migrateActiveMounts가 이관하지만, 세이브를 안 거치고
        // 직접 상태를 세우는 경로(검증 스크립트·새 게임)도 있어 여기서 한 번 더 방어한다.
        if (!Array.isArray(S.activeMounts)) S.activeMounts = [];
        // 여러 마리를 장착해 둔 **기존 세이브**는 여기서 1마리로 줄인다 — 안 하면 제한을 넣어도
        // 이미 장착된 목록이 그대로 남아 계속 합산 보정을 받는다(타고 있던 맨 앞 1마리를 남긴다).
        if (S.activeMounts.length > 1) S.activeMounts = [S.activeMounts[0]];
        if (typeof installMountCompat === 'function') installMountCompat(S);
    },

    // 영웅이 실제로 올라타는 탈것 = 장착 목록의 첫 번째. 나머지는 3D에서 뒤를 따라다닌다.
    ridden() { return S.activeMounts && S.activeMounts.length ? S.activeMounts[0] : null; },
    isActive(name) { return !!S.activeMounts && S.activeMounts.indexOf(name) >= 0; },

    // 누적 오픈 수(S.mountOpens)로부터 현재 "소환 레벨"(등급 확률표 결정용) 산출
    // 원본: Lv1→2 2회, 이후 +3, Lv34부터 +34, Lv50 MAX
    level() {
        let lvl = 1;
        for (let l = 1; l < this.MAX_LEVEL; l++) {
            const need = mountSummonRates[l].needed;
            if (need === 'MAX' || S.mountOpens < need) break;
            lvl = l + 1;
        }
        return lvl;
    },

    // 다음 레벨까지 필요한 누적 오픈 수 (MAX면 null)
    nextNeeded() {
        const need = mountSummonRates[this.level()].needed;
        return need === 'MAX' ? null : need;
    },

    // 현재 레벨 시작 시점의 누적 오픈 수 (게이지가 레벨 내 진행률을 표시하도록 기준점 제공, 레벨 1이면 0)
    prevNeeded() {
        const lvl = this.level();
        return lvl > 1 ? mountSummonRates[lvl - 1].needed : 0;
    },

    // 현재 레벨의 등급 확률표 (needed 필드 제외)
    rates() {
        const r = mountSummonRates[Math.min(this.MAX_LEVEL, this.level())];
        const out = {};
        for (const k in r) if (k !== 'needed') out[k] = r[k];
        return out;
    },

    // 기술트리 '탈것 소환 비용'(-1%/업) 반영 실제 태엽 비용 — 표시·차감 양쪽이 이 함수를 쓴다
    winderCost(count = 1) { return Math.max(1, Math.ceil(WINDERS_PER_SUMMON * count * TechTree.mountCostMult())); },
    canSummon(count = 1) { return S.winders >= this.winderCost(count); },

    rollSubs() { return U.rollSubs(2); },

    // 레벨 배율 — 장비·펫과 동일 커브(1.01^(lvl-1))로 통일 (사용자 확정 2026-08-17)
    levelMult(m) { return Forge.levelMult(m.level); },

    // 장착 슬롯 1칸 = 장비 8부위와 등가 → 탈것 1마리는 같은 등급 장비 8부위 합 전체 (사용자 확정 2026-08-17).
    // 원본 mountBoosts(%) 기반 환산은 이 밸런스 규칙이 우선이라 폐기.
    baseStat(rarity) {
        return { atk: Forge.gearSumAtkAt(rarity), hp: Forge.gearSumHpAt(rarity) };
    },

    // 장착 시 이 탈것 1마리가 기여하는 고정 데미지·체력 (레벨 배율 × 승천 배율)
    mountPower(m) {
        const base = this.baseStat(m.rarity);
        const mult = Ascension.starMult(m.stars).mul(this.levelMult(m));
        return { atk: mult.mul(base.atk * TechTree.mountDmgMult()), hp: mult.mul(base.hp * TechTree.mountHpMult()) };
    },

    // 경험치 흡수형 업그레이드 (펫과 동일 방식) — 원본 수치 미확보로 자체 설계 커브
    xpNeeded(level) { return Math.floor(80 * Math.pow(level, 1.6)); },
    // 재료로 흡수될 때 주는 경험치: 등급이 오를수록 크게 증가
    xpValue(rarity) { return 30 * Math.pow(3, RARITIES.indexOf(rarity)); },
    addXp(name, amount) {
        const m = S.mounts[name];
        if (!m) return;
        m.xp = (m.xp || 0) + amount;
        while (m.level < this.INDIV_MAX_LEVEL && m.xp >= this.xpNeeded(m.level)) {
            m.xp -= this.xpNeeded(m.level);
            m.level++;
        }
        if (m.level >= this.INDIV_MAX_LEVEL) m.xp = 0; // 만렙 도달분 잉여 경험치는 버림 (승천은 별도 시스템)
    },
    // 선택한 다른 탈것들을 흡수해 대상 탈것에 경험치로 환산 (재료는 소모되어 사라짐, 최대 5개)
    absorbMaterials(targetName, materialNames) {
        const target = S.mounts[targetName];
        if (!target) return false;
        let totalXp = 0;
        for (const name of materialNames) {
            if (name === targetName) continue;
            const m = S.mounts[name];
            if (!m) continue;
            totalXp += this.xpValue(m.rarity) * this.levelMult(m);
            delete S.mounts[name];
            S.activeMounts = S.activeMounts.filter(n => n !== name);
        }
        this.addXp(targetName, totalXp);
        Combat.recalcHero();
        if (typeof Scene3D !== 'undefined' && Scene3D.refreshMount) Scene3D.refreshMount();
        saveGame();
        return true;
    },

    // 개별 탈것 승천은 폐기 — 승천은 소환 라인 단위(Ascension.ascend('mount'))이며,
    // 소환 레벨 만렙에서 소환 버튼이 승천 안내로 전환된다 (사용자 확정 2026-08-17).

    summon(count = 1) {
        this.ensure();
        if (!this.canSummon(count)) return null;
        S.winders -= this.winderCost(count);
        const results = [];
        // 기술트리 '추가 탈것 확률'(+2%/업): 소환 1회당 확률만큼 추가 소환 (비용 없음)
        let rolls = count;
        for (let i = 0; i < count; i++) if (U.chance(TechTree.extraMountChance())) rolls++;
        for (let i = 0; i < rolls; i++) {
            S.mountOpens++;
            const rarity = U.weightedPick(this.rates());
            const name = U.choice(mountNames[rarity]);

            const owned = S.mounts[name];
            const isNew = !owned;
            if (owned) {
                // 중복은 합성/승천 재료(dupes)로만 적립. 레벨업은 '업그레이드' 팝업에서 다른 탈것을 흡수해서만 진행 (펫과 동일 방식)
                owned.dupes++;
            } else {
                S.mounts[name] = { rarity, level: 1, dupes: 0, stars: Ascension.count('mount'), xp: 0, subs: this.rollSubs() };
                // 장착 중인 탈것이 하나도 없을 때만 자동 장착 — 이미 타고 있으면 소환 결과가
                // 멋대로 갈아타게 하지 않는다(장착은 1마리라 자동 장착은 곧 교체가 된다).
                if (!S.activeMounts.length) this.equip(name);
            }
            results.push({ name, rarity, isNew, level: S.mounts[name].level });
        }

        const bestRarity = results.reduce((best, r) =>
            RARITIES.indexOf(r.rarity) > RARITIES.indexOf(best) ? r.rarity : best, results[0].rarity);
        SFX.gacha(bestRarity);
        Quests.bump('mountSummon', results.length);   // 반복 퀘스트 '탈것 소환'
        saveGame();
        return { results };
    },

    // 장착/해제 토글. **장착은 1마리** (사용자 지시 2026-08-18) — 보유(인벤토리)는 무제한 그대로다.
    // 다른 탈것을 장착하면 **이전 것은 자동으로 해제**된다(슬롯이 하나뿐이라 '교체'가 곧 장착이다).
    equip(name) {
        this.ensure();
        if (!S.mounts[name]) return false;
        const pos = S.activeMounts.indexOf(name);
        if (pos >= 0) S.activeMounts.splice(pos, 1);   // 장착 중 재클릭 = 해제 (상세 팝업 [해제] 버튼)
        else S.activeMounts = [name];                  // 새로 장착 = 단일 슬롯 교체 (push 아님)
        Combat.recalcHero();
        if (typeof Scene3D !== 'undefined' && Scene3D.refreshMount) Scene3D.refreshMount();
        saveGame();
        return true;
    },

    // 타고 있는 탈것을 이 탈것으로 바꾼다. 슬롯이 하나뿐이라 `equip` 과 같은 결과지만,
    // 호출부(상세 팝업의 '타기')가 '해제 토글'을 원하지 않으므로 별도로 남긴다.
    setRidden(name) {
        this.ensure();
        if (!S.mounts[name]) return false;
        S.activeMounts = [name];
        Combat.recalcHero();
        if (typeof Scene3D !== 'undefined' && Scene3D.refreshMount) Scene3D.refreshMount();
        saveGame();
        return true;
    },

    // 장착 탈것의 고정 공격력·체력 + 서브스탯 (없으면 전부 0).
    // 장착은 1마리라 사실상 0~1회 도는 루프다(배열 구조는 세이브 호환으로 남겨 둔 것).
    // 'ⓐ 탈것 1마리 = 같은 등급 장비 8부위 합' 등가 규칙은 원래 1마리 기준이라 이 제한과 맞는다 —
    // 무제한 합산으로 부풀던 값이 정상으로 돌아온다(`web/BALANCE.md` 에는 탈것 항목이 없어 상충하는 기술 없음).
    activeBonus() {
        const b = { atk: Big.ZERO, hp: Big.ZERO, subs: [] };
        if (!Array.isArray(S.activeMounts)) return b;
        for (const name of S.activeMounts) {
            const m = S.mounts[name];
            if (!m) continue;
            const pw = this.mountPower(m);
            b.atk = b.atk.add(pw.atk);
            b.hp = b.hp.add(pw.hp);
            b.subs.push(...(m.subs || []));
        }
        return b;
    },
};
