// ===== 채팅 화면 (UI-SPEC 28번) — 봇 채팅 생성 + 내 메시지 + 리그 전투 공유 카드 =====
// 서버리스 클론이라 실제 채팅 상대는 없음. 봇이 클랜태그+닉네임 풀에서 주기적으로 한담을 생성.
const Chat = {
    MAX_MESSAGES: 60,
    CLAN_TAGS: ['C', 'KO', 'FRY', 'MELK', 'LGBT', 'ZX', 'GG', 'EU', 'NA', ''],
    NAMES: ['Pirimid', 'Imax', 'Bearopotamus', 'Jennzee', 'MilkMessiah', 'Draven', 'Nova', 'Sable',
        'Kite', 'Zephyr', 'Torval', 'Rax', 'Orin', 'Quill', 'Yumi', 'moonzzanf', 'loui', 'Robson'],
    AVATAR_POOL: ['🧑‍🚀', '🦖', '🥷', '🧙', '🧛', '🧟', '🦸', '👽', '🤠', '🐺', '🦊', '🐯'],
    LINES: [
        'gg', 'anyone farming chapter 5?', '오늘 던전 열쇠 다 씀 ㅠㅠ', '누구 대장간 레벨 몇이에요?',
        'hello everyone, hope you all are good', 'good evening', 'lol nice pull', '방금 전설 떴다!!',
        "didn't they just merge servers?", "how's it going", '기술 트리 몇 렙까지 밈?', 'gl hf',
        '이 게임 오토포지 진짜 편하네요', 'anyone want to trade tickets?', '보스 너무 세다 ㅋㅋ',
        'welcome new players!', '물약 파밍 어디가 제일 좋아요?', 'nice base', 'server 8 is so quiet today',
        '승천 별 몇개 모았어요?', 'brb', 'need more hammers 😭', '오늘도 화이팅!', 'anyone in a clan?',
    ],

    ensure() {
        if (!S.chat) S.chat = { messages: [], lastBotAt: U.now() };
        if (!S.chat.messages.length) this.seed();
    },

    seed() {
        const n = 6;
        for (let i = 0; i < n; i++) this.pushBotMessage(U.now() - (n - i) * 90000);
    },

    // 같은 닉네임 = 같은 인물 (아바타·클랜태그·성별 고정) — 이름 해시로 결정적 매핑 (UI.chatNameColor와 동일 방식)
    persona(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return {
            name,
            tag: this.CLAN_TAGS[h % this.CLAN_TAGS.length],
            avatar: this.AVATAR_POOL[(h >>> 4) % this.AVATAR_POOL.length],
            gender: ((h >>> 8) & 1) ? '♂' : '♀',
        };
    },

    randomBot() {
        return this.persona(U.choice(this.NAMES));
    },

    pushBotMessage(at) {
        const bot = this.randomBot();
        this.push({ type: 'msg', tag: bot.tag, name: bot.name, avatar: bot.avatar, gender: bot.gender,
            text: U.choice(this.LINES), at: at || U.now(), mine: false });
    },

    push(entry) {
        S.chat.messages.push(entry);
        if (S.chat.messages.length > this.MAX_MESSAGES) S.chat.messages.splice(0, S.chat.messages.length - this.MAX_MESSAGES);
        saveGame();
    },

    // 1초 틱에서 호출 — 15~40초 간격으로 봇 메시지 1개 생성. 새 메시지 생겼으면 true 반환
    _nextGap: 20000,
    tick() {
        this.ensure();
        if (U.now() - S.chat.lastBotAt > this._nextGap) {
            S.chat.lastBotAt = U.now();
            this._nextGap = U.rand(15000, 40000);
            this.pushBotMessage();
            return true;
        }
        return false;
    },

    sendPlayer(text) {
        text = (text || '').trim();
        if (!text) return false;
        this.push({ type: 'msg', name: S.nickname || '용사', avatar: S.avatarEmoji || '🛡️', gender: S.gender || '♂',
            tag: '', text: text.slice(0, 200), at: U.now(), mine: true });
        return true;
    },

    // 리그 도전 결과를 공유 카드로 자동 게시 (UI-SPEC 28번 "전투 공유 카드")
    shareLeagueResult(win, myCp, opp) {
        this.push({ type: 'share', win, myName: S.nickname || '용사', myAvatar: S.avatarEmoji || '🛡️', myCp,
            oppName: opp.name, oppAvatar: opp.avatar, oppCp: opp.cp, at: U.now(), mine: true });
    },

    lastMessage() { this.ensure(); return S.chat.messages[S.chat.messages.length - 1] || null; },
};
