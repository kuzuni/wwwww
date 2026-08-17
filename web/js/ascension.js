// ===== 승천(별) 시스템: 라인(계열) 단위 프레스티지 (사용자 확정 2026-08-17) =====
// 개별 아이템 승천은 폐기. 라인(장비/스킬/펫/탈것)마다 도달 조건을 채우면 그 라인을 승천시키고,
// 승천 횟수 = 이후 그 라인에서 새로 획득하는 아이템에 찍히는 별 개수.
//   · 장비  — 대장간 Lv.35 → 대장간 정보 팝업 [승천] → 대장간 레벨 초기화, 이후 제작 장비가 ⭐N
//   · 스킬/펫/탈것 — 소환 레벨 만렙 → 소환 버튼이 승천 안내로 전환 → [승천] → 소환 레벨 초기화, 이후 소환물이 ⭐N
// 별 배율(STAR_POWER)과 이미 보유한 아이템의 별은 그대로 유지된다 (소급 회수 없음).
const Ascension = {
    STAR_POWER: 1.0, // 별 1개당 +100%

    LINES: ['forge', 'skill', 'pet', 'mount'],
    LINE_KR: { forge: '장비', skill: '스킬', pet: '펫', mount: '탈것' },
    LINE_ICON: { forge: '⚒️', skill: '🎫', pet: '🥚', mount: '⚙️' },
    // 승천 조건이 걸리는 지표 — 장비만 대장간 레벨, 나머지는 각 소환 레벨
    FORGE_LEVEL: 35, // 대장간 승천 도달 레벨 (사용자 확정 스펙)

    starMult(stars) { return 1 + (stars || 0) * this.STAR_POWER; },

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

    // 라인 승천 — 지표를 초기화하고 승천 횟수를 1 올린다. 성공 시 true
    ascend(line) {
        this.ensure();
        if (!this.ready(line)) return false;
        if (line === 'forge') {
            S.forgeLevel = 1;
            S.forgeUpgradeEndsAt = null; // 진행 중이던 대장간 업그레이드는 프레스티지와 함께 취소
        } else if (line === 'skill') {
            S.summonCount = 0;
        } else if (line === 'pet') {
            S.petSummonCount = 0;
        } else if (line === 'mount') {
            S.mountOpens = 0;
        }
        S.lineAscend[line] = (S.lineAscend[line] || 0) + 1;
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
