// ===== 던전 4종: 열쇠 2/2 매일 09:00 리셋, 완료 시 소모, 최고 클리어 단계 소탕 (원본: BALANCE.md) =====
const Dungeons = {
    MAX_KEYS: 2,
    run: null, // 진행 중이면 {id, stage}

    DEFS: [
        { id: 'hammer',   name: 'Hammer Thief', kr: '해머 도둑',  icon: '🔨', unlock: '2-10', reward: '해머 · 코인',
          theme: { sky: 0x5d4037, fog: 0x795548, ground: 0x4e342e, biome: 'rock', celestial: 'none' } },
        { id: 'ghost',    name: 'Ghost Town',   kr: '유령 마을',  icon: '👻', unlock: '2-8',  reward: '스킬 티켓',
          theme: { sky: 0x37474f, fog: 0x546e7a, ground: 0x455a64, biome: 'rock', celestial: 'moon' } },
        { id: 'invasion', name: 'Invasion',     kr: '침공',       icon: '🥚', unlock: '3-1',  reward: '펫 알 (상급 확률↑)',
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

    // 단계 n 클리어 보상 (근사 설계)
    rewards(id, stage) {
        const g = Math.pow(1.25, stage - 1);
        if (id === 'hammer')   return { hammers: Math.ceil(25 * g), coins: Math.ceil(600 * Math.pow(1.5, stage - 1)) };
        if (id === 'ghost')    return { tickets: Math.ceil(20 * g) };
        if (id === 'invasion') return { egg: true }; // 등급은 지급 시 상급 테이블로 굴림
        return { potions: 10 * stage };
    },
    rewardText(id, stage) {
        const r = this.rewards(id, stage);
        if (r.hammers) return `🔨 ${U.fmt(r.hammers)} · 🪙 ${U.fmt(r.coins)}`;
        if (r.tickets) return `🎫 ${U.fmt(r.tickets)}`;
        if (r.egg) return '🥚 알 1개 (상급 확률↑)';
        return `🧪 ${U.fmt(r.potions)}`;
    },
    grantRewards(id, stage) {
        const r = this.rewards(id, stage);
        if (r.hammers) { S.hammers += r.hammers; S.coins += r.coins; }
        if (r.tickets) S.tickets += r.tickets;
        if (r.potions) S.potions += r.potions;
        if (r.egg) {
            // 침공 보상: 던전 단계에 비례한 상급 스테이지 확률표로 굴림
            const ch = Math.min(10, 3 + Math.ceil(stage / 2));
            const rarity = Pets.rollEggRarity(`${ch}-1`);
            if (Pets.addEgg(rarity)) UI.toast(`🥚 ${RARITY_KR[rarity]} 알 획득!`);
            else UI.toast('🥚 알 보관함이 가득 차 알을 놓쳤습니다');
        }
        return r;
    },

    // 열쇠는 입장 시점이 아니라 완료(클리어) 시점에 소모 — 실패해도 같은 열쇠로 재도전 가능
    enter(id, stage) {
        this.ensure();
        if (this.run) { UI.toast('⚔️ 이미 던전에 진행 중입니다'); return false; }
        if (!this.unlocked(id)) { UI.toast(`🔒 스테이지 ${this.def(id).unlock} 도달 시 해금`); return false; }
        if (S.dungeons.keys[id] <= 0) { UI.toast('🗝 열쇠가 없습니다 (매일 09:00 리셋)'); return false; }
        const best = S.dungeons.best[id];
        this.run = { id, stage: U.clamp(stage || best + 1, 1, best + 1) };
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
        // 침공(알) 보상은 grantRewards가 실제 결과(획득/보관함 가득 참)를 이미 정확히 토스트했으므로 정적 문구 대신 생략(중복·모순 방지)
        const suffix = r.egg ? '' : ` — ${this.rewardText(id, st)}`;
        UI.toast(`⚡ ${this.def(id).kr} ${st}단계 소탕${suffix}`);
        saveGame();
        UI.renderTopBar();
        if (r.egg) UI.renderPets(); // 침공 알 보상이 열려 있는 펫 패널(알 보관함)에도 즉시 반영되도록
        return true;
    },

    onClear() {
        const { id, stage } = this.run;
        this.run = null;
        S.dungeons.keys[id] = Math.max(0, S.dungeons.keys[id] - 1); // 완료 시점 열쇠 소모
        S.dungeons.best[id] = Math.max(S.dungeons.best[id], stage);
        const r = this.grantRewards(id, stage);
        // 침공(알) 보상은 grantRewards가 실제 결과(획득/보관함 가득 참)를 이미 정확히 토스트했으므로 정적 문구 대신 생략(중복·모순 방지)
        const suffix = r.egg ? '' : ` ${this.rewardText(id, stage)}`;
        UI.toast(`🏆 ${this.def(id).kr} ${stage}단계 클리어!${suffix}`);
        saveGame();
        UI.renderTopBar();
        if (r.egg) UI.renderPets(); // 침공 알 보상이 열려 있는 펫 패널(알 보관함)에도 즉시 반영되도록
    },

    onFail() {
        const d = this.def(this.run.id);
        this.run = null;
        UI.toast(`💀 ${d.kr} 실패... 본대로 복귀합니다`);
        saveGame();
    },
};
