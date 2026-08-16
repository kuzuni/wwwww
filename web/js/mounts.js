// ===== 마운트: 태엽(클록와인더) 소환(원본 확률표) → 수집/장착 → 고정 데미지·체력+옵션 부스트 =====
const Mounts = {
    MAX_LEVEL: 50, // 소환 레벨(등급 확률표) 상한
    INDIV_MAX_LEVEL: 100, // 승천은 Lv.100 도달부터 (사용자 확정 스펙 2026-08-17) — 경험치 커브는 기존 곡선 연장
    ASCEND_DUPES: 30, // 승천 1회당 중복 요구치 — 만렙 상향(30→100)과 무관하게 기존 요구치 유지 (밸런스 보존)
    // 원본 스탯부스트 곡선(+10%~+400%, mountBoosts)을 고정치로 환산하는 기준값.
    // 원본은 상대적 %였을 뿐 고정 데미지/체력 원본 수치가 없어(BALANCE.md 미확보) 자체 설계 —
    // 영웅 맨몸 기본치(forge.js: atk 15 / hp 150)에 등급별 %를 곱해 절대 수치로 환산한다.
    BASE_ATK: 15,
    BASE_HP: 150,

    ensure() {
        if (S.winders === undefined) S.winders = 0;
        if (S.mountOpens === undefined) S.mountOpens = 0;
        if (!S.mounts) S.mounts = {};          // name → {rarity, level, dupes, subs}
        if (S.activeMount === undefined) S.activeMount = null; // name | null
    },

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

    canSummon(count = 1) { return S.winders >= WINDERS_PER_SUMMON * count; },

    rollSubs() { return U.rollSubs(2); },

    // 개체 레벨(합성으로만 상승)에 따른 고정 스탯 배율 — pets.js와 동일 자체 설계 곡선
    levelMult(m) { return 1 + 0.12 * (m.level - 1); },

    // 등급별 고정 데미지·체력 기준치 (레벨 배율 반영 전)
    baseStat(rarity) {
        const pct = mountBoosts[rarity];
        return { atk: this.BASE_ATK * pct / 100, hp: this.BASE_HP * pct / 100 };
    },

    // 장착 시 이 탈것 1마리가 기여하는 고정 데미지·체력 (레벨 배율 × 승천 배율)
    mountPower(m) {
        const base = this.baseStat(m.rarity);
        const mult = this.levelMult(m) * Ascension.starMult(m.stars) * TechTree.mountPowerMult();
        return { atk: base.atk * mult, hp: base.hp * mult };
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
            if (S.activeMount === name) S.activeMount = null;
        }
        this.addXp(targetName, totalXp);
        Combat.recalcHero();
        if (typeof Scene3D !== 'undefined' && Scene3D.refreshMount) Scene3D.refreshMount();
        saveGame();
        return true;
    },

    // 승천(별): Lv.100(만렙) 도달 후 중복 30개를 소모해 별 1개 획득
    canAscend(name) {
        const m = S.mounts[name];
        return !!m && m.level >= this.INDIV_MAX_LEVEL && m.dupes >= this.ASCEND_DUPES;
    },
    ascend(name) {
        const m = S.mounts[name];
        if (!this.canAscend(name)) return false;
        m.dupes -= this.ASCEND_DUPES;
        m.stars = (m.stars || 0) + 1;
        Combat.recalcHero();
        saveGame();
        return true;
    },

    summon(count = 1) {
        this.ensure();
        if (!this.canSummon(count)) return null;
        S.winders -= WINDERS_PER_SUMMON * count;
        const results = [];
        for (let i = 0; i < count; i++) {
            S.mountOpens++;
            const rarity = U.weightedPick(this.rates());
            const name = U.choice(mountNames[rarity]);

            const owned = S.mounts[name];
            const isNew = !owned;
            if (owned) {
                // 중복은 합성/승천 재료(dupes)로만 적립. 레벨업은 '업그레이드' 팝업에서 다른 탈것을 흡수해서만 진행 (펫과 동일 방식)
                owned.dupes++;
            } else {
                S.mounts[name] = { rarity, level: 1, dupes: 0, stars: 0, xp: 0, subs: this.rollSubs() };
                // 장착 중인 탈것이 없으면 자동 장착
                if (!S.activeMount) this.equip(name);
            }
            results.push({ name, rarity, isNew, level: S.mounts[name].level });
        }

        const bestRarity = results.reduce((best, r) =>
            RARITIES.indexOf(r.rarity) > RARITIES.indexOf(best) ? r.rarity : best, results[0].rarity);
        SFX.gacha(bestRarity);
        saveGame();
        return { results };
    },

    equip(name) {
        if (!S.mounts[name]) return false;
        S.activeMount = name;
        Combat.recalcHero();
        if (typeof Scene3D !== 'undefined' && Scene3D.refreshMount) Scene3D.refreshMount();
        saveGame();
        return true;
    },

    // 장착 중인 탈것의 고정 공격력·체력 + 서브스탯 보너스 (없으면 전부 0)
    activeBonus() {
        const b = { atk: 0, hp: 0, subs: [] };
        const m = S.activeMount ? S.mounts[S.activeMount] : null;
        if (!m) return b;
        const pw = this.mountPower(m);
        b.atk = pw.atk;
        b.hp = pw.hp;
        b.subs = m.subs || [];
        return b;
    },
};
