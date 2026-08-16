// ===== PvP 리그 (플래티넘 리그, UI-SPEC 3~5번) — 봇 기반 오프라인 구현 =====
// 서버 없이 가짜 랭커 20명을 생성해 전투력 비교로 승패를 가르는 방식. 원본 매칭/보상 수치 미확보 → 자체 설계.
const League = {
    TICKET_MAX: 5,
    BOT_COUNT: 20,
    CHALLENGE_COUNT: 5,          // "상대 선택" 팝업에 뜨는 도전 가능 상대 수
    SEASON_MS: 3 * 24 * 3600 * 1000, // 시즌 3일
    START_SCORE: 50,

    NAME_POOL: ['loui', 'Sarah21', 'Robson', 'EN', 'Asteryth', 'BlandBuddy22667', 'moonzzanf', 'Kite', 'Draven',
        'Yumi', 'Torval', 'Pixelbee', 'Nova', 'Rax', 'Sable', 'Junho', 'Milkteeth', 'Orin', 'Zephyr', 'Quill'],
    AVATAR_POOL: ['🧑‍🚀', '🦖', '🥷', '🧙', '🧛', '🧟', '🦸', '🧑‍🎤', '👽', '🤠',
        '🧑‍🌾', '🧑‍🚒', '🧑‍✈️', '🧑‍🔬', '🧑‍🎨', '🥋', '🎃', '👑', '🐺', '🦊'],

    ensure() {
        if (!S.league || !S.league.bots) this.startSeason();
        this.checkTicketReset();
        this.checkSeasonEnd();
    },

    // resetScore: 시즌 갱신(3일 종료) 시 true — 봇 점수가 매번 새로 뽑히는 것과 맞춰 내 점수도 함께 리셋
    startSeason(resetScore) {
        const myCp = Combat.combatPower();
        S.league = {
            score: resetScore ? this.START_SCORE : ((S.league && S.league.score) || this.START_SCORE),
            tickets: this.TICKET_MAX,
            lastTicketReset: Dungeons.resetDateKey(),
            seasonEndsAt: U.now() + this.SEASON_MS,
            bots: this.genBots(myCp),
        };
        saveGame();
    },

    genBots(myCp) {
        const shuffled = [...this.NAME_POOL].sort(() => Math.random() - 0.5);
        const bots = Array.from({ length: this.BOT_COUNT }, (_, i) => ({
            name: shuffled[i] || `Guest${i}`,
            avatar: U.choice(this.AVATAR_POOL),
            cp: Math.max(1, myCp * U.rand(0.4, 2.5)),
            score: Math.round(U.rand(20, 200)),
            server: U.randInt(1, 30),
        }));
        // 상위 5명을 "도전 상대" 후보로 고정 (전투력 강한 순 — 강할수록 ⭐보상 큼, UI-SPEC 5번)
        bots.sort((a, b) => b.cp - a.cp);
        return bots;
    },

    checkTicketReset() {
        const today = Dungeons.resetDateKey();
        if (S.league.lastTicketReset !== today) {
            S.league.lastTicketReset = today;
            S.league.tickets = this.TICKET_MAX;
            saveGame();
        }
    },

    checkSeasonEnd() {
        if (U.now() < S.league.seasonEndsAt) return;
        const reward = this.rewardForRank(this.myRank());
        for (const k in reward) S[k] = (S[k] || 0) + reward[k];
        UI.toast(`🏆 리그 시즌 종료! 순위 보상을 획득했습니다`);
        this.startSeason(true);
        // 봇/점수가 전면 재생성되므로, 열려 있는 리그 화면(랭킹/보상/도전 어느 뷰든)은 최신 랭킹 보드로 재진입
        if (!UI.els.leagueModal.classList.contains('hidden')) UI.openLeague();
    },

    // 나를 포함한 전체 랭킹(점수 내림차순)
    board() {
        const me = { name: S.nickname || '용사', avatar: '🛡️', cp: Combat.combatPower(), score: S.league.score, server: '나', isMe: true };
        return [...S.league.bots, me].sort((a, b) => b.score - a.score);
    },
    myRank() { return this.board().findIndex(e => e.isMe) + 1; },

    // 도전 상대 5명 (봇 목록 앞 5개 = 강한 순) — 순서대로 ⭐+5~+1
    challengeList() {
        return S.league.bots.slice(0, this.CHALLENGE_COUNT).map((b, i) => ({ ...b, starReward: this.CHALLENGE_COUNT - i }));
    },

    canChallenge(idx) { return S.league.tickets > 0 && !!S.league.bots[idx]; },

    // 전투력 비교 + 약간의 랜덤으로 승패 판정 (완전결정이 아니라 이변 여지를 둠)
    challenge(idx) {
        if (!this.canChallenge(idx)) return null;
        const bot = S.league.bots[idx];
        const starReward = this.CHALLENGE_COUNT - idx;
        const myCp = Combat.combatPower();
        const winChance = U.clamp(0.15 + (myCp / (myCp + bot.cp)) * 0.7, 0.05, 0.95);
        const win = U.chance(winChance);
        S.league.tickets--;
        if (win) S.league.score += starReward;
        saveGame();
        return { win, bot, starReward: win ? starReward : 0 };
    },

    // 순위별 시즌 종료 보상 (재화 6종) — 원본 수치 미확보 → 자체 설계 (순위 낮을수록 감소)
    rewardMult(rank) {
        if (rank === 1) return 3; if (rank === 2) return 2.4; if (rank === 3) return 2;
        if (rank <= 5) return 1.6; if (rank <= 10) return 1.2; if (rank <= 20) return 1;
        return 0.6;
    },
    rewardForRank(rank) {
        const m = this.rewardMult(rank);
        return {
            hammers: Math.round(300 * m), coins: Math.round(6000 * m), tickets: Math.round(40 * m),
            eggCurrency: Math.round(120 * m), potions: Math.round(150 * m), winders: Math.round(60 * m),
        };
    },
    // 리그 보상 팝업에 표시할 순위 구간 테이블
    REWARD_TIERS: [
        { label: '1위', rank: 1 }, { label: '2위', rank: 2 }, { label: '3위', rank: 3 },
        { label: '4-5위', rank: 5 }, { label: '6-10위', rank: 10 }, { label: '11-20위', rank: 20 }, { label: '21위 이하', rank: 21 },
    ],
};
