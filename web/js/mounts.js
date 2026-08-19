// ===== 마운트: 태엽(클록와인더) 소환(원본 확률표) → 수집/장착 → 고정 데미지·체력+옵션 부스트 =====
const Mounts = {
    MAX_LEVEL: 50, // 소환 레벨(등급 확률표) 상한
    INDIV_MAX_LEVEL: 100, // 승천은 Lv.100 도달부터 (사용자 확정 스펙 2026-08-17) — 경험치 커브는 기존 곡선 연장
    // 등급별 기준치는 Forge의 장비 8부위 합에서 파생된다(baseStat 참고) — 별도 기준값 상수 불필요.

    // 보유(인벤토리) 상한 — 펫·탈것 **각각 250** (사용자 지시 2026-08-19).
    // ⚠️ 출전(장착) 제한과 다른 개념이다: 탈것은 장착 1마리, 펫은 3마리로 그대로 두고 여기는 '몇 개까지 갖고 있느냐'다.
    INV_CAP: 250,
    MAX_ACTIVE_MOUNTS: 1,   // 출전(장착) 상한 — 보유 상한(INV_CAP)과 **다른 개념**이니 합치지 말 것

    ensure() {
        if (S.winders === undefined) S.winders = 0;
        if (S.mountOpens === undefined) S.mountOpens = 0;
        this.migrateInventory();               // 종류당 1개 맵 → 펫과 같은 **인스턴스 배열**
        this.migrateSpecies();                 // 폐기된 종(나뭇잎·뗏목) → 새 종으로 이름만 갈아 끼운다
        // 장착은 **1마리**다 (사용자 지시 2026-08-18 "탈것은 한 개만 장착 가능해야 하는데 여러 개 장착 가능하더라").
        // ⚠️ 같은 날의 '제한 없음' 지시와 헷갈리지 말 것 — 그건 **보유(인벤토리)** 얘기이고, 보유는 계속 무제한이다.
        //    자료 구조는 배열 그대로 두되(세이브 호환·`ridden()`/`setRidden` 경로가 배열 전제) **길이를 1로 못박는다.**
        // 구세이브(문자열 1개)는 loadGame의 migrateActiveMounts가 이관하지만, 세이브를 안 거치고
        // 직접 상태를 세우는 경로(검증 스크립트·새 게임)도 있어 여기서 한 번 더 방어한다.
        if (!Array.isArray(S.activeMounts)) S.activeMounts = [];
        // 장착 목록은 이제 **인덱스**다(펫과 동일). 없는 개체·중복을 걷고 1마리로 줄인다 —
        // 안 하면 제한을 넣어도 이미 장착된 목록이 그대로 남아 계속 합산 보정을 받는다.
        const seen = new Set();
        S.activeMounts = S.activeMounts.filter(i => {
            if (!Number.isInteger(i) || !S.mounts[i] || seen.has(i)) return false;
            seen.add(i);
            return true;
        });
        if (S.activeMounts.length > 1) S.activeMounts = [S.activeMounts[0]];
        if (typeof installMountCompat === 'function') installMountCompat(S);
    },

    // ===== 인벤토리 = 인스턴스 배열 (사용자 지시 2026-08-19) =====
    // 사용자 원문: "탈것 인벤토리가 펫처럼 되어야 함. (…) [신화]호버보드,[신화]호버보드,… 이렇게 같은
    // 종류도 여러 개 있을 수 있게. (…) 같은 생쥐여도 옵션 다 다를 수 있고, 그것들 다 합성해서 업글해야 함."
    // 그래서 `S.mounts` 는 `{이름: 1개}` 맵이 아니라 **펫과 똑같은 개체 배열**이고, 장착·재료 지정은
    // 이름이 아니라 **인덱스**로 한다(같은 이름이 여럿이라 이름으로는 개체를 못 가린다).
    migrateInventory() {
        if (Array.isArray(S.mounts)) { this.clampInventory(); return; }
        // 구세이브: {name: {rarity, level, dupes, stars, xp, subs}} — `dupes`(중복 적립분)는
        // 그만큼의 **실제 개체**로 펼쳐 플레이어가 뽑아 둔 수량을 잃지 않게 한다.
        // 펼친 개체의 옵션은 새로 굴린다 — "같은 종류라도 옵션이 다르다"가 이 지시의 요지라서다.
        const old = S.mounts && typeof S.mounts === 'object' ? S.mounts : {};
        // ⚠️ 펼친 개체까지 더하면 보유 상한(250)을 넘길 수 있다. 그때 뒤에서 그냥 자르면 **키워 둔 원본이
        //    잘려 나간다** — 원본(레벨·경험치·승천을 가진 그 개체)을 앞에 모으고, 펼친 중복은 뒤에 붙여
        //    잘리더라도 중복부터 잘리게 한다.
        const firsts = [], extras = [];
        const firstIdx = {};
        for (const name of Object.keys(old)) {
            const m = old[name] || {};
            const rarity = m.rarity || 'common';
            firstIdx[name] = firsts.length;   // 원본이 배열 앞쪽을 그대로 차지하므로 이 인덱스가 최종 인덱스다
            firsts.push({ name, rarity, level: m.level || 1, xp: m.xp || 0, stars: m.stars || 0, subs: m.subs || this.rollSubs() });
            for (let d = 0; d < (m.dupes || 0); d++) {
                extras.push({ name, rarity, level: 1, xp: 0, stars: m.stars || 0, subs: this.rollSubs() });
            }
        }
        S.mounts = firsts.concat(extras).slice(0, this.INV_CAP);
        // 장착 목록도 이름 → 인덱스로 (구세이브는 이름 배열이다)
        if (Array.isArray(S.activeMounts)) {
            S.activeMounts = S.activeMounts
                .map(n => (typeof n === 'string' ? firstIdx[n] : n))
                .filter(i => Number.isInteger(i));
        }
        this.clampInventory();
    },
    // ===== 폐기된 종 이관 (mount-animal-machine-dynamic ① 2026-08-19) =====
    // 사용자 지시로 common 의 나뭇잎·연잎·뗏목 5종을 동물·기계로 갈아 끼웠다. 이미 그걸 뽑아 둔
    // 세이브는 **이름만** 새 종으로 옮긴다 — 레벨·경험치·승천·옵션은 그 개체의 성과라 그대로 둔다.
    // ⚠️ 개체를 지우면 안 된다. 키워 둔 탈것이 통째로 증발하고, 장착 인덱스도 어긋난다.
    // ⚠️ 이름을 안 옮기면 더 나쁘다 — `MOUNT_KR`·`MOUNT_ICONS`·`makeMountMesh` 어디에도 없는 이름이라
    //    한글명이 원문 그대로 뜨고 3D 는 quad 기본 몸통으로 떨어져 '이름 없는 초록 짐승'이 된다.
    // 같은 계열끼리 짝지었다(잎 3종 → 동물 3종, 판때기 2종 → 태엽 기계 2종).
    LEGACY_SPECIES: {
        'Brown Leaf': 'Pony', 'Lily Leaf': 'Donkey', 'Oak Leaf': 'Alpaca',
        'Lily Pad': 'Clockwork Mouse', 'Log Raft': 'Clockwork Beetle',
    },
    migrateSpecies() {
        if (!Array.isArray(S.mounts)) return 0;
        let moved = 0;
        for (const m of S.mounts) {
            const to = m && this.LEGACY_SPECIES[m.name];
            if (to) { m.name = to; moved++; }
        }
        return moved;
    },

    // 상한 초과분은 뒤에서 자른다(정상 경로에서는 소환이 이미 막아 여기 걸릴 일이 없다 — 손상 세이브 방어).
    clampInventory() { if (S.mounts.length > this.INV_CAP) S.mounts.length = this.INV_CAP; },

    count() { return Array.isArray(S.mounts) ? S.mounts.length : 0; },
    space() { return Math.max(0, this.INV_CAP - this.count()); },
    inst(idx) { return (Array.isArray(S.mounts) ? S.mounts[idx] : null) || null; },

    // 영웅이 실제로 올라타는 탈것 = 장착 목록의 첫 번째.
    riddenIdx() { return S.activeMounts && S.activeMounts.length ? S.activeMounts[0] : null; },
    riddenInst() { const i = this.riddenIdx(); return i === null || i === undefined ? null : this.inst(i); },
    // 🔁 `ridden()` 은 예전처럼 **이름**을 돌려준다 — 3D(메시 선택)와 여러 표시 경로가 이름을 묻는다.
    //    개체가 필요하면 `riddenInst()` 를 쓸 것(같은 이름이 여럿이라 이름으로 되찾으면 엉뚱한 개체가 잡힌다).
    ridden() { const m = this.riddenInst(); return m ? m.name : null; },
    isActive(idx) { return !!S.activeMounts && S.activeMounts.indexOf(idx) >= 0; },

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
    addXp(idx, amount) {
        const m = this.inst(idx);
        if (!m) return;
        m.xp = (m.xp || 0) + amount;
        while (m.level < this.INDIV_MAX_LEVEL && m.xp >= this.xpNeeded(m.level)) {
            m.xp -= this.xpNeeded(m.level);
            m.level++;
        }
        if (m.level >= this.INDIV_MAX_LEVEL) m.xp = 0; // 만렙 도달분 잉여 경험치는 버림 (승천은 별도 시스템)
    },
    // 선택한 다른 탈것들을 흡수해 대상 탈것에 경험치로 환산 (재료는 소모되어 사라짐).
    // 🔑 배열에서 개체를 지우면 **뒤 인덱스가 전부 한 칸씩 당겨진다** — 펫(`Pets.absorbMaterials`)과 같이
    //    ⓐ 재료를 **내림차순**으로 지우고 ⓑ 대상·장착 인덱스를 그때마다 보정한다.
    //    (오름차순으로 지우면 두 번째 재료부터 엉뚱한 개체가 사라진다.)
    absorbMaterials(targetIdx, materialIdxs) {
        let target = this.inst(targetIdx);
        if (!target) return false;
        const idxs = [...new Set(materialIdxs)]
            .filter(i => Number.isInteger(i) && i !== targetIdx && this.inst(i))
            .sort((a, b) => b - a);
        let totalXp = 0, consumed = 0;
        for (const idx of idxs) {
            const m = this.inst(idx);
            totalXp += this.xpValue(m.rarity) * this.levelMult(m);
            consumed++;
            S.mounts.splice(idx, 1);
            S.activeMounts = S.activeMounts.filter(a => a !== idx).map(a => (a > idx ? a - 1 : a));
            if (idx < targetIdx) targetIdx--;
        }
        if (consumed) Quests.bump('mountMerge');     // 반복 퀘스트 '탈것 흡수 강화' — 실제 재료가 소모된 흡수만 센다
        this.addXp(targetIdx, totalXp);
        Combat.recalcHero();
        if (typeof Scene3D !== 'undefined' && Scene3D.refreshMount) Scene3D.refreshMount();
        saveGame();
        return true;
    },

    // 개별 탈것 승천은 폐기 — 승천은 소환 라인 단위(Ascension.ascend('mount'))이며,
    // 소환 레벨 만렙에서 소환 버튼이 승천 안내로 전환된다 (사용자 확정 2026-08-17).

    // 보관함 여유가 요청 수보다 적으면 남은 칸만큼만 소환한다(펫 알과 같은 규약) —
    // 배수 버튼이 죽는 대신 실제로 소환될 개수로 줄고, 과금도 그 개수만큼만 한다.
    summonCount(count = 1) { return Math.min(Math.max(1, Math.floor(count) || 1), this.space()); },

    summon(count = 1) {
        this.ensure();
        const n = this.summonCount(count);
        if (!n || !this.canSummon(n)) return null;
        S.winders -= this.winderCost(n);
        const results = [];
        // 기술트리 '추가 탈것 확률'(+2%/업): 소환 1회당 확률만큼 추가 소환 (비용 없음)
        let rolls = n;
        for (let i = 0; i < n; i++) if (U.chance(TechTree.extraMountChance())) rolls++;
        for (let i = 0; i < rolls; i++) {
            if (this.space() <= 0) break;            // 보너스 추가분이 보유 상한을 넘기지 않게
            S.mountOpens++;
            const rarity = U.weightedPick(this.rates());
            const name = U.choice(mountNames[rarity]);
            // 🔑 중복도 **개체 하나**로 들어온다(옛 `dupes` 적립 폐기) — 같은 종류를 여러 개 갖고
            //    각자 다른 옵션을 가지며 서로 합성 재료가 되는 게 이 지시의 요지다.
            S.mounts.push({ name, rarity, level: 1, xp: 0, stars: Ascension.count('mount'), subs: this.rollSubs() });
            const idx = S.mounts.length - 1;
            const isNew = !S.mounts.some((m, k) => k !== idx && m.name === name);   // 이 **종류**를 처음 얻었나
            // 장착 중인 탈것이 하나도 없을 때만 자동 장착 — 이미 타고 있으면 소환 결과가
            // 멋대로 갈아타게 하지 않는다(장착은 1마리라 자동 장착은 곧 교체가 된다).
            if (!S.activeMounts.length) this.equip(idx);
            results.push({ name, rarity, isNew, level: 1 });
        }
        if (!results.length) return null;            // 상한이 꽉 차 한 마리도 안 나온 경우

        const bestRarity = results.reduce((best, r) =>
            RARITIES.indexOf(r.rarity) > RARITIES.indexOf(best) ? r.rarity : best, results[0].rarity);
        SFX.gacha(bestRarity);
        Quests.bump('mountSummon', results.length);   // 반복 퀘스트 '탈것 소환'
        saveGame();
        return { results };
    },

    // 장착/해제 토글. **장착은 1마리** (사용자 지시 2026-08-18) — 보유(인벤토리)는 무제한 그대로다.
    // 다른 탈것을 장착하면 **이전 것은 자동으로 해제**된다(슬롯이 하나뿐이라 '교체'가 곧 장착이다).
    equip(idx) {
        this.ensure();
        if (!this.inst(idx)) return false;
        const pos = S.activeMounts.indexOf(idx);
        if (pos >= 0) S.activeMounts.splice(pos, 1);   // 장착 중 재클릭 = 해제 (상세 팝업 [해제] 버튼)
        else S.activeMounts = [idx];                   // 새로 장착 = 단일 슬롯 교체 (push 아님)
        Combat.recalcHero();
        if (typeof Scene3D !== 'undefined' && Scene3D.refreshMount) Scene3D.refreshMount();
        saveGame();
        return true;
    },

    // 타고 있는 탈것을 이 탈것으로 바꾼다. 슬롯이 하나뿐이라 `equip` 과 같은 결과지만,
    // 호출부(상세 팝업의 '타기')가 '해제 토글'을 원하지 않으므로 별도로 남긴다.
    setRidden(idx) {
        this.ensure();
        if (!this.inst(idx)) return false;
        S.activeMounts = [idx];
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
        for (const idx of S.activeMounts) {
            const m = this.inst(idx);
            if (!m) continue;
            const pw = this.mountPower(m);
            b.atk = b.atk.add(pw.atk);
            b.hp = b.hp.add(pw.hp);
            b.subs.push(...(m.subs || []));
        }
        return b;
    },
};
