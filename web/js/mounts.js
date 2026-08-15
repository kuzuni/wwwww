// ===== 마운트: 와인더 소환(원본 확률표) → 수집/장착 → 데미지·체력 부스트 (BALANCE.md 스펙) =====
const Mounts = {
    MAX_LEVEL: 50,

    ensure() {
        if (S.winders === undefined) S.winders = 0;
        if (S.mountOpens === undefined) S.mountOpens = 0;
        if (!S.mounts) S.mounts = {};          // name → {rarity, count}
        if (S.activeMount === undefined) S.activeMount = null; // name | null
    },

    // 누적 오픈 수(S.mountOpens)로부터 현재 마운트 레벨 산출 (원본: Lv1→2 2회, 이후 +3, Lv34부터 +34, Lv50 MAX)
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

    summon() {
        this.ensure();
        if (!this.canSummon()) return null;
        S.winders -= WINDERS_PER_SUMMON;
        S.mountOpens++;
        const rarity = U.weightedPick(this.rates());
        const name = U.choice(mountNames[rarity]);

        const owned = S.mounts[name];
        const isNew = !owned;
        if (owned) owned.count++;
        else S.mounts[name] = { rarity, count: 1 };

        // 새로 얻은 마운트가 현재 장착 중인 것보다 등급이 높으면 자동 장착
        const cur = S.activeMount ? S.mounts[S.activeMount] : null;
        if (!cur || mountBoosts[rarity] > mountBoosts[cur.rarity]) this.equip(name);

        SFX.gacha(rarity);
        saveGame();
        return { name, rarity, isNew, count: S.mounts[name].count };
    },

    equip(name) {
        if (!S.mounts[name]) return false;
        S.activeMount = name;
        Combat.recalcHero();
        saveGame();
        return true;
    },

    // 장착 중인 마운트의 데미지·체력 배율 (없으면 1배)
    boostMult() {
        this.ensure();
        const m = S.activeMount ? S.mounts[S.activeMount] : null;
        return m ? 1 + mountBoosts[m.rarity] / 100 : 1;
    },
};
