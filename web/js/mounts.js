// ===== 마운트: 태엽(클록와인더) 소환(원본 확률표) → 수집/장착 → 고정 데미지·체력+옵션 부스트 =====
const Mounts = {
    MAX_LEVEL: 50,
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

    // 현재 레벨의 등급 확률표 (needed 필드 제외)
    rates() {
        const r = mountSummonRates[Math.min(this.MAX_LEVEL, this.level())];
        const out = {};
        for (const k in r) if (k !== 'needed') out[k] = r[k];
        return out;
    },

    canSummon() { return S.winders >= WINDERS_PER_SUMMON; },

    rollSubs(rarity) { return U.rollSubs(rarity, 2); },

    // 개체 레벨(합성으로만 상승)에 따른 고정 스탯 배율 — pets.js와 동일 자체 설계 곡선
    levelMult(m) { return 1 + 0.12 * (m.level - 1); },

    // 등급별 고정 데미지·체력 기준치 (레벨 배율 반영 전)
    baseStat(rarity) {
        const pct = mountBoosts[rarity];
        return { atk: this.BASE_ATK * pct / 100, hp: this.BASE_HP * pct / 100 };
    },

    // 장착 시 이 탈것 1마리가 기여하는 고정 데미지·체력
    mountPower(m) {
        const base = this.baseStat(m.rarity);
        const mult = this.levelMult(m);
        return { atk: base.atk * mult, hp: base.hp * mult };
    },

    summon() {
        this.ensure();
        if (!this.canSummon()) return null;
        S.winders -= WINDERS_PER_SUMMON;
        S.mountOpens++;
        const rarity = U.weightedPick(this.rates());
        const name = U.choice(mountNames[rarity]);

        const owned = S.mounts[name];
        const isNew = !owned;
        let leveled = false;
        if (owned) {
            owned.dupes++;
            // 중복 → 자동 합성 레벨업 (레벨 N→N+1에 중복 N개, 펫과 동일 방식)
            while (owned.dupes >= owned.level) {
                owned.dupes -= owned.level;
                owned.level++;
                leveled = true;
            }
        } else {
            S.mounts[name] = { rarity, level: 1, dupes: 0, subs: this.rollSubs(rarity) };
            // 장착 중인 탈것이 없으면 자동 장착
            if (!S.activeMount) this.equip(name);
        }

        SFX.gacha(rarity);
        saveGame();
        return { name, rarity, isNew, leveled, level: S.mounts[name].level };
    },

    equip(name) {
        if (!S.mounts[name]) return false;
        S.activeMount = name;
        Combat.recalcHero();
        saveGame();
        return true;
    },

    // 장착 중인 탈것의 고정 공격력·체력 + 서브스탯 보너스 (없으면 전부 0)
    activeBonus() {
        const b = { atk: 0, hp: 0, atkPct: 0, hpPct: 0, critCh: 0, critDmg: 0, atkSpd: 0, dblAtk: 0 };
        const m = S.activeMount ? S.mounts[S.activeMount] : null;
        if (!m) return b;
        const pw = this.mountPower(m);
        b.atk = pw.atk;
        b.hp = pw.hp;
        for (const s of (m.subs || [])) {
            if (s.key === 'atkPct') b.atkPct += s.value;
            else if (s.key === 'hpPct') b.hpPct += s.value;
            else if (s.key === 'critCh') b.critCh += s.value;
            else if (s.key === 'critDmg') b.critDmg += s.value;
            else if (s.key === 'atkSpd') b.atkSpd += s.value;
            else if (s.key === 'dblAtk') b.dblAtk += s.value;
        }
        return b;
    },
};
