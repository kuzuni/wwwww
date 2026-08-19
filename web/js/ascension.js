// ===== 승천(별) 시스템: 라인(계열) 단위 프레스티지 (사용자 확정 2026-08-17) =====
// 개별 아이템 승천은 폐기. 라인(장비/스킬/펫/탈것)마다 도달 조건을 채우면 그 라인을 승천시키고,
// 승천 횟수 = 이후 그 라인에서 새로 획득하는 아이템에 찍히는 별 개수.
//   · 장비  — 대장간 Lv.35 → 대장간 정보 팝업 [승천] → 대장간 레벨 초기화, 이후 제작 장비가 ⭐N
//   · 스킬/펫/탈것 — 소환 레벨 만렙 → 소환 버튼이 승천 안내로 전환 → [승천] → 소환 레벨 초기화, 이후 소환물이 ⭐N
// ⚠️ 승천하면 그 라인의 **기존 보유 아이템은 전부 사라진다** (ascend-wipe-line-items, 사용자 지시
// 2026-08-19) — 다른 라인의 아이템·별은 건드리지 않는다. 별 배율(STAR_MULT) 규칙 자체는 유지.
const Ascension = {
    // 별 1개당 능력치 배율 (원본 규칙 ⑤, 사용자 확정 2026-08-17).
    // 요구 조건: "승천1 원시장비 > 승천0 디바인 100레벨 장비". 승천0에서 가장 약한 장비와 가장 센
    // 장비의 격차 = 시대 스팬 6^9 × 레벨 스팬 1.01^99 × 등급 스팬 6.5 ≈ 1.75e8 이므로,
    // 별 1개 배율이 그보다 커야 낮은 시대라도 상위 승천이면 무조건 더 강해진다. 여유를 둬 1e9로 잡았다(약 5.7배 여유).
    // 이 배율 때문에 값이 승천 횟수에 지수적으로 커져서(승천 2회차부터 2^53 초과) 스탯은 Big으로 다룬다.
    STAR_MULT: 1e9,

    LINES: ['forge', 'skill', 'pet', 'mount'],
    LINE_KR: { forge: '장비', skill: '스킬', pet: '펫', mount: '탈것' },
    LINE_ICON: { forge: '⚒️', skill: '🎫', pet: '🥚', mount: '⚙️' },
    // 승천 조건이 걸리는 지표 — 장비만 대장간 레벨, 나머지는 각 소환 레벨
    FORGE_LEVEL: 35, // 대장간 승천 도달 레벨 (사용자 확정 스펙)

    // 별 N개 → 배율 STAR_MULT^N (Big). 별 0이면 1이라 승천 전에는 기존 수치와 동일하다.
    starMult(stars) {
        const n = stars || 0;
        return n <= 0 ? Big.ONE : Big.of(this.STAR_MULT).pow(n);
    },

    // 라인별 소환 레벨 상한 — 스킬·펫은 100, 탈것은 확률표(mountSummonRates)가 50까지라 그 상한이 만렙
    summonMax(line) {
        if (line === 'mount') return Mounts.MAX_LEVEL;
        return 100;
    },

    ensure() {
        if (!S.lineAscend) S.lineAscend = { forge: 0, skill: 0, pet: 0, mount: 0 };
        for (const l of this.LINES) if (typeof S.lineAscend[l] !== 'number') S.lineAscend[l] = 0;
    },

    // 승천 횟수 = 앞으로 그 라인에서 획득할 아이템의 별 개수
    count(line) {
        if (!S || !S.lineAscend) return 0; // 부팅 초기(ensure 이전) 호출 대비
        return S.lineAscend[line] || 0;
    },

    // 진행도 {cur, max} — 승천 게이지·안내 문구 공용
    progress(line) {
        if (line === 'forge') return { cur: S.forgeLevel, max: this.FORGE_LEVEL };
        const max = this.summonMax(line);
        const cur = line === 'skill' ? Skills.summonLevel()
            : line === 'pet' ? Pets.summonLevel()
                : Mounts.level();
        return { cur: Math.min(cur, max), max };
    },

    ready(line) {
        const p = this.progress(line);
        return p.cur >= p.max;
    },

    // 라인 승천 — 지표를 초기화하고 **그 라인의 기존 보유 아이템을 전부 지운 뒤** 승천 횟수를 1 올린다.
    // (ascend-wipe-line-items, 사용자 지시 2026-08-19: "승천했으면 기존에 있었던 거 각각 다 사라져야 함"
    //  — 깨끗한 프레스티지. 승천 전 별 0개 아이템과 승천 후 별 N개 아이템이 섞이지 않는다.) 성공 시 true
    ascend(line) {
        this.ensure();
        if (!this.ready(line)) return false;
        if (line === 'forge') {
            S.forgeLevel = 1;
            S.forgeUpgradeEndsAt = null; // 진행 중이던 대장간 업그레이드는 프레스티지와 함께 취소
            Forge.resetRollLevels();     // 전 시대 뽑기 레벨 1로 리셋 — 승천 후에도 원시부터 1레벨 (원본 규칙 ④)
            for (const slot of SLOTS) S.equipment[slot] = null; // 착용 장비 8슬롯 전부 소멸 (인벤 없음 — 착용분이 보유 전부)
            if (typeof Scene3D !== 'undefined' && Scene3D.refreshHeroEquip) Scene3D.refreshHeroEquip();
        } else if (line === 'skill') {
            S.summonCount = 0;
            S.skills = {};          // 초기 상태(powerStrike)로도 안 돌린다 — 첫 화면과 같은 '빈 손'이 아니라 소환으로 다시 채우는 게 프레스티지
            S.equippedSkills = [];
        } else if (line === 'pet') {
            S.petSummonCount = 0;
            S.pets = [];
            S.activePets = [];
            // 알(S.eggs)·부화 중(S.hatching)은 남긴다 — 펫 별은 **부화 시점**의 Ascension.count 로 찍히므로
            // (pets.js hatch) 남은 알은 승천 후 부화해도 ⭐N 으로 나와 '이후 획득물' 규칙과 정합한다.
            if (typeof Scene3D !== 'undefined' && Scene3D.refreshPets) Scene3D.refreshPets();
        } else if (line === 'mount') {
            S.mountOpens = 0;
            S.mounts = [];          // 개체 배열(mount-inventory-like-pet-250 정합) — 통째로 비움
            S.activeMounts = [];    // 인덱스 배열이라 mounts 를 비우면 반드시 같이 비워야 한다 (유령 인덱스 방지)
            if (typeof Scene3D !== 'undefined' && Scene3D.refreshMount) Scene3D.refreshMount();
        }
        S.lineAscend[line] = (S.lineAscend[line] || 0) + 1;
        if (typeof Combat !== 'undefined' && Combat.recalcHero) Combat.recalcHero(); // 장비·스킬·펫·탈것 어느 라인이든 스탯 기여가 사라졌다
        saveGame();
        return true;
    },

    // 카테고리별 별 합계 (보유 아이템 기준) — 메뉴·승천 팝업 표시용
    starBreakdown() {
        return {
            gear: SLOTS.reduce((s, slot) => s + ((S.equipment[slot] && S.equipment[slot].stars) || 0), 0),
            skill: Object.values(S.skills).reduce((s, sk) => s + (sk.stars || 0), 0),
            pet: S.pets.reduce((s, p) => s + (p.stars || 0), 0),
            mount: Object.values(S.mounts).reduce((s, m) => s + (m.stars || 0), 0),
        };
    },
    totalStars() {
        const b = this.starBreakdown();
        return b.gear + b.skill + b.pet + b.mount;
    },
};
