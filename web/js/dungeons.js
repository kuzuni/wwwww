// ===== 던전 4종: 열쇠 2/2 매일 09:00 리셋, 완료 시 소모, 최고 클리어 단계 소탕 (원본: BALANCE.md) =====
const Dungeons = {
    MAX_KEYS: 2,
    run: null, // 진행 중이면 {id, stage, waves}

    // 던전 한 판의 웨이브 수 — 1~3 (사용자 지시 2026-08-18 "던전은 웨이브 수 1~3개로 해줘").
    // 메인 스테이지의 5웨이브는 그대로 두고 던전만 짧게 간다. 마지막 웨이브가 보스라
    // waves=1이면 보스 단판이 된다(구조는 메인과 같고 길이만 다르다).
    // 값은 **입장할 때 한 번** 뽑아 run.waves에 굳힌다 — Combat.totalWaves가 매 판정마다 부르는
    // 자리라, 여기서 매번 뽑으면 pip 개수와 클리어 판정이 같은 판 안에서 어긋난다.
    MIN_WAVES: 1,
    MAX_WAVES: 3,
    DEFAULT_WAVES: 3,   // run.waves가 없는 구버전 진행 상태용 폴백
    rollWaves() { return this.MIN_WAVES + Math.floor(Math.random() * (this.MAX_WAVES - this.MIN_WAVES + 1)); },

    DEFS: [
        { id: 'hammer',   name: 'Hammer Thief', kr: '해머 도둑',  icon: '🔨', unlock: '2-10', reward: '해머 · 코인',
          theme: { sky: 0x5d4037, fog: 0x795548, ground: 0x4e342e, biome: 'rock', celestial: 'none' } },
        { id: 'ghost',    name: 'Ghost Town',   kr: '유령 마을',  icon: '👻', unlock: '2-8',  reward: '스킬 티켓',
          theme: { sky: 0x37474f, fog: 0x546e7a, ground: 0x455a64, biome: 'rock', celestial: 'moon' } },
        { id: 'invasion', name: 'Invasion',     kr: '침공',       icon: '🥚', unlock: '3-1',  reward: '알 화폐 (펫 소환용)',
          theme: { sky: 0x4a148c, fog: 0x6a1b9a, ground: 0x38006b, biome: 'magic', celestial: 'moon' } },
        { id: 'zombie',   name: 'Zombie Rush',  kr: '좀비 러시',  icon: '🧟', unlock: '4-1',  reward: '물약 (기술 재화)',
          theme: { sky: 0x1b5e20, fog: 0x2e7d32, ground: 0x1b3a1e, biome: 'forest', celestial: 'none' } },
    ],

    def(id) { return this.DEFS.find(d => d.id === id); },

    // 매일 09:00 리셋 기준 "날짜 키" — 09:00 이전이면 전날로 취급 (시계를 9시간 앞으로 당겨서 날짜만 비교)
    resetDateKey() { return new Date(Date.now() - 9 * 3600 * 1000).toDateString(); },

    // 저장 슬롯 보정 + 매일 09:00 열쇠 리셋
    ensure() {
        if (!S.dungeons) S.dungeons = { keys: {}, best: {}, lastReset: '' };
        if (S.potions === undefined) S.potions = 0;
        const today = this.resetDateKey();
        if (S.dungeons.lastReset !== today) {
            S.dungeons.lastReset = today;
            for (const d of this.DEFS) S.dungeons.keys[d.id] = this.MAX_KEYS;
            // 매일 09:00 리셋이 열려 있는 던전 목록/상세 팝업에도 즉시 반영되도록 (UI.init() 이전 부팅 시점 호출 대비 가드)
            if (UI.els.dungeonModal && !UI.els.dungeonModal.classList.contains('hidden')) UI.openDungeons();
            if (UI.els.dungeonDetailModal && !UI.els.dungeonDetailModal.classList.contains('hidden')) UI.renderDungeonDetail();
        }
        for (const d of this.DEFS) {
            if (S.dungeons.keys[d.id] === undefined) S.dungeons.keys[d.id] = this.MAX_KEYS;
            if (S.dungeons.best[d.id] === undefined) S.dungeons.best[d.id] = 0;
        }
    },

    unlocked(id) {
        const [c, s] = this.def(id).unlock.split('-').map(Number);
        return S.bestChapter * 100 + S.bestStage >= c * 100 + s;
    },

    // 단계 n 몬스터 HP: 해금 챕터 수준에서 시작해 단계당 ×1.35 (원본 커브 미확보 → 근사)
    monsterHp(id, stage) {
        const unlockCh = Number(this.def(id).unlock.split('-')[0]);
        return 55 * Math.pow(5.6, unlockCh - 1) * Math.pow(1.35, stage - 1);
    },

    // 단계 n 클리어 보상 — **선형**(사용자 지시 2026-08-18):
    //   "클리어하고 다음 난이도 깨는 보상은 +2개 추가되는 식으로 하면 되고, 맨 처음 보상은 100개로 하면 됨."
    // 즉 1단계 100개, 단계마다 +2개. 던전별 지수 스케일(1.25^n · 600·1.5^n · 150+100n · 10n)을 전부 이 식으로 갈았다.
    // 보상 '종류'는 그대로 두고 **수량만** 통일한다.
    // 기술트리 배율 노드(thiefHammerMult·dungeonTicketMult·dungeonPotionMult)는 남긴다 — 플레이어가
    // 이미 투자한 노드라 여기서 떼면 그 노드들이 아무 효과 없는 죽은 칸이 된다. 선형화는 '단계 스케일'만이다.
    BASE_REWARD: 100,
    PER_STAGE: 2,
    rewardAmount(stage) { return this.BASE_REWARD + this.PER_STAGE * (Math.max(1, stage) - 1); },
    rewards(id, stage) {
        const n = this.rewardAmount(stage);
        // 해머 도둑은 **망치 + 골드 2종만** 준다 (사용자 지시 2026-08-18 — 붙어 있던 태엽 ⚙️ 보상 제거).
        // ⚠️ 태엽 수급이 여기서 사라져 리그 시즌 보상·진행 패스 4-10 마일스톤만 남는다.
        if (id === 'hammer')   return { hammers: Math.ceil(n * TechTree.thiefHammerMult()),
                                        coins: Math.ceil(n * TechTree.thiefCoinMult()) };
        if (id === 'ghost')    return { tickets: Math.ceil(n * TechTree.dungeonTicketMult()) }; // '던전 티켓 보너스'
        // 알 화폐(🥚)의 유일한 수급처 (사용자 확정 — 사냥 지급 전면 삭제)
        if (id === 'invasion') return { eggCurrency: n };
        return { potions: Math.ceil(n * TechTree.dungeonPotionMult()) };                        // '던전 물약 보너스'
    },
    rewardText(id, stage) {
        const r = this.rewards(id, stage);
        if (r.hammers) return `🔨 ${U.fmt(r.hammers)} · 🪙 ${U.fmt(r.coins)}`;
        if (r.tickets) return `🎫 ${U.fmt(r.tickets)}`;
        if (r.eggCurrency) return `🥚 ${U.fmt(r.eggCurrency)}`;
        return `🧪 ${U.fmt(r.potions)}`;
    },
    grantRewards(id, stage) {
        const r = this.rewards(id, stage);
        if (r.hammers) { S.hammers += r.hammers; S.coins += r.coins; }
        if (r.tickets) S.tickets += r.tickets;
        if (r.potions) S.potions += r.potions;
        // 침공(펫 던전) 보상 = 알 화폐 — 알은 펫 화면 [소환]으로만 획득 (사용자 확정).
        // 별도 토스트를 띄우지 않는다: 알 직접 지급이던 시절엔 '보관함 가득'으로 실패할 수 있어
        // 실제 결과를 여기서 따로 알렸지만, 알 화폐는 실패 경로가 없어 완료 배너 한 줄이면 충분하다
        // (남겨 두면 다른 던전과 달리 침공만 토스트가 2개 뜬다 — QA 4차 지적).
        if (r.eggCurrency) S.eggCurrency = (S.eggCurrency || 0) + r.eggCurrency;
        return r;
    },

    // 열쇠는 입장 시점이 아니라 완료(클리어) 시점에 소모 — 실패해도 같은 열쇠로 재도전 가능
    enter(id, stage) {
        this.ensure();
        if (this.run) { UI.toast('⚔️ 이미 던전에 진행 중입니다'); return false; }
        if (!this.unlocked(id)) { UI.toast(`🔒 스테이지 ${this.def(id).unlock} 도달 시 해금`); return false; }
        if (S.dungeons.keys[id] <= 0) { UI.toast('🗝 열쇠가 없습니다 (매일 09:00 리셋)'); return false; }
        const best = S.dungeons.best[id];
        this.run = { id, stage: U.clamp(stage || best + 1, 1, best + 1), waves: this.rollWaves() };
        UI.toast(`${this.def(id).icon} ${this.def(id).kr} ${this.run.stage}단계 입장!`);
        saveGame();
        Combat.hero.hp = Combat.hero.maxHp;
        Combat.setupStage();
        return true;
    },

    // 소탕: 최고 클리어 단계 보상 즉시 수령 (열쇠 1개 소모)
    sweep(id) {
        this.ensure();
        if (this.run) { UI.toast('⚔️ 이미 던전에 진행 중입니다'); return false; }
        if (S.dungeons.best[id] < 1) { UI.toast('먼저 1단계를 클리어해야 소탕할 수 있습니다'); return false; }
        if (S.dungeons.keys[id] <= 0) { UI.toast('🗝 열쇠가 없습니다 (매일 09:00 리셋)'); return false; }
        S.dungeons.keys[id]--;
        const st = S.dungeons.best[id];
        const r = this.grantRewards(id, st);
        UI.toast(`⚡ ${this.def(id).kr} ${st}단계 소탕 — ${this.rewardText(id, st)}`);
        saveGame();
        UI.renderTopBar();
        if (r.eggCurrency) UI.renderPets(); // 침공 알 화폐 보상이 열려 있는 펫 패널(🥚 pill·[소환] 버튼)에도 즉시 반영되도록
        return true;
    },

    onClear() {
        const { id, stage } = this.run;
        this.run = null;
        S.dungeons.keys[id] = Math.max(0, S.dungeons.keys[id] - 1); // 완료 시점 열쇠 소모
        S.dungeons.best[id] = Math.max(S.dungeons.best[id], stage);
        const r = this.grantRewards(id, stage);
        UI.toast(`🏆 ${this.def(id).kr} ${stage}단계 클리어! ${this.rewardText(id, stage)}`);
        saveGame();
        UI.renderTopBar();
        if (r.eggCurrency) UI.renderPets(); // 침공 알 화폐 보상이 열려 있는 펫 패널(🥚 pill·[소환] 버튼)에도 즉시 반영되도록
    },

    onFail() {
        const d = this.def(this.run.id);
        this.run = null;
        UI.toast(`💀 ${d.kr} 실패... 본대로 복귀합니다`);
        saveGame();
    },
};
