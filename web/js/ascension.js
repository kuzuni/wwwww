// ===== 승천(별) 시스템: 장비/스킬/펫/탈것이 각각 개별로 승천 (UI-SPEC '승천(별) 시스템' 섹션) =====
// 원본 승천 배율·조건 미확보 → 자체 설계: 별 1개당 해당 대상 능력치 ×(1+STAR_POWER), 만렙 후 중복분으로 승천.
// (기존에 있던 "전체 리셋형" 승천은 이 스펙으로 완전히 대체됨 — S.ascension 등 리셋 상태는 더 이상 없음)
const Ascension = {
    STAR_POWER: 1.0, // 별 1개당 +100%

    starMult(stars) { return 1 + (stars || 0) * this.STAR_POWER; },

    // 카테고리별 별 합계 (장비/스킬/펫/탈것) — 메뉴·승천 팝업 공용
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
