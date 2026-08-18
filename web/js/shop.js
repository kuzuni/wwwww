// ===== 상점 탭 (UI-SPEC 17번): 오늘의 특가 3종 + 보석 패키지 =====
// 원본은 실결제. 클론은 특가 3종만 "무료 수령 1회/일"로 대체(UI-SPEC 지시), 보석 패키지는 결제 더미(토스트)만.
const Shop = {
    DEALS: [
        // 수량은 원본(shot-042632) 표기 그대로. 단 원본 3번째 줄의 젬은 제거 —
        // '젬 보급 전면 제거'(TODO 재화 개편) · UI-SPEC 재화 표 "젬 = 보급 없음, 상점 더미"에 따라
        // 젬은 어떤 경로로도 지급되지 않는다. reward가 카드 pill 표기의 원본이므로 필드 자체를 뺀다.
        { key: 'tech',  name: '기술 거래', icon: '🔧', reward: { potions: 150, hammers: 300 },  priceKR: '₩2,800' },
        { key: 'pet',   name: '펫 거래',   icon: '🐾', reward: { eggCurrency: 660, hammers: 200 }, priceKR: '₩9,500' },
        { key: 'mount', name: '탈것 거래', icon: '⚙️', reward: { winders: 2150, hammers: 4000 }, priceKR: '₩69,000' },
    ],
    GEM_PACKS: [
        { gems: 60, priceKR: '₩2,800' },
        { gems: 220, priceKR: '₩9,500' },
        { gems: 800, priceKR: '₩34,500' },
        // 3,300개 ₩140,000 — 사용자 지시 2026-08-18 (shop-gem-pack-3300). 원본 3종엔 없는 클론 전용 4번째.
        { gems: 3300, priceKR: '₩140,000' },
    ],

    ensure() {
        if (!S.shop) S.shop = { lastReset: Dungeons.resetDateKey(), claimed: {} };
        const today = Dungeons.resetDateKey();
        if (S.shop.lastReset !== today) {
            S.shop.lastReset = today;
            S.shop.claimed = {};
            // 매일 09:00 리셋이 열려 있는 상점 팝업에도 즉시 반영되도록 (던전/리그와 동일 패턴)
            if (UI.els.shopModal && !UI.els.shopModal.classList.contains('hidden')) UI.renderShop();
        }
    },

    claimed(key) { return !!S.shop.claimed[key]; },
    canClaim(key) { return !this.claimed(key); },

    claimDeal(key) {
        const d = this.DEALS.find(x => x.key === key);
        if (!d || !this.canClaim(key)) return false;
        // 젬은 보급 경로가 없어야 하므로, reward에 실수로 되살아나도 가산되지 않게 방어한다.
        for (const k in d.reward) { if (k === 'gems') continue; S[k] = (S[k] || 0) + d.reward[k]; }
        S.shop.claimed[key] = true;
        saveGame();
        return true;
    },
};
