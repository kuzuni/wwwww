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
    // 원본 화면은 10행 중 2행이 2~3줄짜리 장문이다 — 전부 1줄이면 말풍선 높이의 리듬이 사라져
    // 목록이 원본보다 균일하고 잉크 밀도가 3.8%p 낮아 보인다(8차 비평가 C·D 공통 지적).
    LONG_LINES: [
        "Didnt they just merge 7 w quite a few? Maybe server 7 could merge with us or something",
        '오토포지 필터 설정 어떻게 하는 게 제일 효율 좋아요? 지금은 희귀 이상만 남기고 다 파는 중인데 이게 맞나 싶네요',
        'anyone know if the ascension reset keeps your tech tree levels? i dont wanna lose 3 days of progress',
    ],

    ensure() {
        if (!S.chat) S.chat = { messages: [], lastBotAt: U.now() };
        if (!S.chat.messages.length) this.seed();
    },

    // 원본(shot-043500)은 '스크롤된 백로그'다 — 맨 위 행이 화면 상단에서 잘려 있고 마지막 말풍선이 입력바에
    // 바로 붙어 있다. 6개만 심으면 목록이 넘치지 않아 하단에 앱 가로폭의 37%나 되는 흰 공백이 남는다
    // (7차 비평가 공통 1순위 지적). 목록이 확실히 넘치는 수를 심고, 원본처럼 전투 공유 카드도 하나 끼운다.
    seed() {
        const n = 18, gap = 90000, base = U.now() - n * gap;
        for (let i = 0; i < n; i++) {
            if (i === n - 2) this.seedShareCard(base + i * gap);
            // 원본 비율(10행 중 2행)에 맞춰 장문을 두 군데 섞는다
            else if (i === 2 || i === 11) this.pushBotMessage(base + i * gap, U.choice(this.LONG_LINES));
            else this.pushBotMessage(base + i * gap);
        }
    },

    // 원본의 공유 카드는 '내 결과'가 아니라 다른 플레이어([MELK] MilkMessiah)가 올린 것이라 mine:false다
    seedShareCard(at) {
        const win = this.persona('MilkMessiah'), lose = this.persona('Bearopotamus');
        this.push({ type: 'share', win: true, tag: win.tag, name: win.name, gender: win.gender,
            myName: win.name, myAvatar: win.avatar, myCp: 4.1e12,
            oppName: lose.name, oppAvatar: lose.avatar, oppCp: 50.8e9, at, mine: false });
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

    pushBotMessage(at, text) {
        const bot = this.randomBot();
        this.push({ type: 'msg', tag: bot.tag, name: bot.name, avatar: bot.avatar, gender: bot.gender,
            text: text || U.choice(this.LINES), at: at || U.now(), mine: false });
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
