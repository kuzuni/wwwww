// ===== 진행 패스 (UI-SPEC 18번) — 스테이지 도달 마일스톤. 무료만 실지급, 프리미엄은 잠금 표시(더미) =====
// 마일스톤 보상 수치는 원본 미확보 → 자체 설계 (스테이지 진행도에 비례해 완만히 증가).
const Pass = {
    MILESTONES: [
        // 원본(042705): 무료 칸 2줄(주보상+보조), 프리미엄 칸도 2줄(주보상 상위판+젬)
        { stage: '1-5',  free: { coins: 500, hammers: 50 },     premium: { coins: 500, gems: 5 } },
        { stage: '1-10', free: { hammers: 100, coins: 300 },    premium: { hammers: 150, gems: 5 } },
        { stage: '2-5',  free: { tickets: 20, hammers: 100 },   premium: { tickets: 25, gems: 8 } },
        { stage: '2-10', free: { potions: 30, hammers: 100 },   premium: { potions: 40, gems: 8 } },
        { stage: '3-5',  free: { coins: 1500, hammers: 150 },   premium: { coins: 2000, gems: 10 } },
        { stage: '3-10', free: { hammers: 300, coins: 900 },    premium: { hammers: 400, gems: 10 } },
        { stage: '4-5',  free: { eggCurrency: 80, hammers: 200 }, premium: { eggCurrency: 110, gems: 15 } },
        { stage: '4-10', free: { winders: 40, hammers: 200 },   premium: { winders: 55, gems: 15 } },
        { stage: '5-5',  free: { coins: 4000, hammers: 300 },   premium: { coins: 5500, gems: 20 } },
        { stage: '5-10', free: { hammers: 800, coins: 2500 },   premium: { hammers: 1100, gems: 20 } },
        { stage: '6-5',  free: { potions: 100, hammers: 400 },  premium: { potions: 140, gems: 25 } },
        { stage: '6-10', free: { tickets: 80, hammers: 400 },   premium: { tickets: 110, gems: 25 } },
        { stage: '7-5',  free: { coins: 9000, hammers: 600 },   premium: { coins: 12000, gems: 30 } },
        { stage: '8-5',  free: { hammers: 1800, coins: 6000 },  premium: { hammers: 2500, gems: 35 } },
        { stage: '9-5',  free: { eggCurrency: 300, hammers: 900 }, premium: { eggCurrency: 420, gems: 40 } },
        { stage: '10-5', free: { coins: 20000, hammers: 1300 }, premium: { coins: 28000, gems: 50 } },
    ],
    PREMIUM_PRICE_KR: '₩13,900', // 표시용(더미) — 실결제 없음

    ensure() { if (!S.passClaimed) S.passClaimed = {}; },

    stageValue(key) { const [c, s] = key.split('-').map(Number); return (c - 1) * 10 + s; },
    // 최고 도달 스테이지 기준 (현재 스테이지가 아님 — 던전 등으로 되돌아가도 마일스톤 유지)
    reached(key) { return (S.bestChapter - 1) * 10 + S.bestStage >= this.stageValue(key); },
    claimed(key) { return !!S.passClaimed[key]; },
    canClaim(key) { return this.reached(key) && !this.claimed(key); },

    claim(key) {
        const m = this.MILESTONES.find(x => x.stage === key);
        if (!m || !this.canClaim(key)) return false;
        for (const k in m.free) S[k] = (S[k] || 0) + m.free[k];
        S.passClaimed[key] = true;
        saveGame();
        return true;
    },
};
