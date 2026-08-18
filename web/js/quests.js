// ===== 단순 반복 퀘스트 (사용자 지시 2026-08-18 `quest-tab`) =====
// 사용자 원문: "길드 행동 전투하는 거 빼고 1~5일차 것 내용들을 걍 반복 퀘스트로 넣고,
//               하단 네비에 소환이랑 상점 사이에 퀘스트 부분 넣어라."
//
// ⚠️ 사양의 핵심 제약 (사용자 재확인) — **날짜·요일·일차(Day1~5) 개념을 절대 넣지 않는다.**
//    그래서 이 파일에는 시계도, 날짜 키도, 로테이션 인덱스도 없다. 유일한 시간 의존은
//    "언제 깨도 똑같다"를 보장하기 위해 **아무것도 시간에 안 묶는다**는 것뿐이다
//    (던전 열쇠처럼 `resetDateKey()`를 쓰는 코드가 여기 들어오면 사양 위반이다).
//
// 구조: 항상 SLOTS(3)개가 노출되고, 하나를 수령하면 **그 자리만** 같은 풀에서 즉시 새로 뽑힌다.
//       진행도는 각 행동 지점에서 `Quests.bump('<행동>', n)` 한 줄로 올라온다.
const Quests = {
    SLOTS: 3,

    // 행동 풀. 전투(자동 진행)는 사용자가 명시적으로 제외했다 — 스테이지·웨이브·킬 카운트는 넣지 않는다.
    // need: 기본 요구치, step: 누적 완료 수에 따라 늘어나는 몫(상한 STEP_CAP회까지),
    // rw: 보상 재화와 기본 지급량(요구치와 같은 비율로 커진다).
    // unit이 있으면 "코인 5,000 소비"처럼 개수가 아닌 양으로 읽힌다.
    STEP_CAP: 20,
    DEFS: [
        { id: 'craft',       icon: 'hammer',  text: '장비 제작',        need: 10,   step: 3,    rw: { cur: 'coins',       amt: 400 } },
        { id: 'sellGear',    icon: 'coin',    text: '장비 판매',        need: 8,    step: 2,    rw: { cur: 'hammers',     amt: 6 } },
        { id: 'equipGear',   icon: 'hammer',  text: '장비 장착',        need: 4,    step: 1,    rw: { cur: 'coins',       amt: 600 } },
        { id: 'coinSpend',   icon: 'coin',    text: '코인 소비',        need: 2000, step: 800,  rw: { cur: 'hammers',     amt: 10 }, unit: '' },
        // ⚠️ 젬 보상 금지 — 젬은 '보급 없음, 상점 더미'가 사양이다(TODO '재화 개편' ①, ref/UI-SPEC.md 재화 표).
        //    이 두 줄이 2026-08-18까지 게임에 남은 마지막(그리고 상한 없는) 젬 수급처였다:
        //    수령하면 같은 풀에서 즉시 새로 뽑히므로 하루 상한이 없고, 보상량은 tier 에 비례해 커져
        //    tier 20 에서 한 번에 젬 168/210 이 들어왔다. 대장간 계열은 해머, 기술 계열은 물약으로 바꾼다.
        { id: 'gearUpgrade', icon: 'hammer',  text: '대장간 강화 완료',  need: 1,    step: 1,    rw: { cur: 'hammers',     amt: 10 } },
        { id: 'skillSummon', icon: 'ticket',  text: '스킬 소환',        need: 5,    step: 2,    rw: { cur: 'tickets',      amt: 12 } },
        // 아이콘도 젬에서 물약으로 — 보상 재화와 그림이 어긋나면 안 된다.
        // 물약 4 는 던전 완료(need 1 → 물약 3)의 눈금에 맞춘 값이고, 연구 1회 비용(최소 50 물약, 단계마다 ×2.88)
        // 에 한참 못 미쳐 '연구가 연구비를 번다'는 순환은 생기지 않는다.
        { id: 'techDone',    icon: 'potion',  text: '기술 연구 완료',    need: 1,    step: 1,    rw: { cur: 'potions',     amt: 4 } },
        { id: 'petHatch',    icon: 'egg',     text: '알 부화',          need: 3,    step: 1,    rw: { cur: 'eggCurrency', amt: 15 } },
        { id: 'petMerge',    icon: 'egg',     text: '펫 합성',          need: 1,    step: 1,    rw: { cur: 'eggCurrency', amt: 25 } },
        { id: 'mountSummon', icon: 'winder',  text: '탈것 소환',        need: 3,    step: 1,    rw: { cur: 'winders',     amt: 60 } },
        { id: 'dungeonClear',icon: 'potion',  text: '던전 완료',        need: 1,    step: 1,    rw: { cur: 'potions',     amt: 3 } },
    ],
    def(id) { return this.DEFS.find(d => d.id === id); },

    CUR_KR: { coins: '코인', hammers: '해머', gems: '젬', tickets: '티켓', winders: '태엽', eggCurrency: '깨진 알', potions: '물약' },

    ensure() {
        if (!Number.isFinite(S.questsCleared) || S.questsCleared < 0) S.questsCleared = 0;
        if (!Array.isArray(S.quests)) S.quests = [];
        // 구세이브·손상분 정리: 폐기된 행동 id나 형태가 깨진 항목은 버리고 새로 뽑는다
        // 보상 재화가 지금 DEFS 와 다르면(구세이브에 젬 보상이 박혀 있던 경우) 그 자리에서 다시 굴린다 —
        // 슬롯은 수령해야만 갈리므로, 마이그레이션을 안 하면 이미 뜬 젬 퀘스트가 계속 남아 젬을 준다.
        S.quests = S.quests.filter(q => q && this.def(q.id) && Number.isFinite(q.need) && q.need > 0)
            .map(q => {
                const def = this.def(q.id);
                const rw = q.rw && q.rw.cur === this.curOf(def) ? q.rw : this.rollReward(def, q.need);
                return { id: q.id, need: q.need, prog: U.clamp(+q.prog || 0, 0, q.need), rw };
            })
            .slice(0, this.SLOTS);
        while (S.quests.length < this.SLOTS) {
            const q = this.roll(S.quests.map(x => x.id));
            if (!q) break;                       // 풀이 슬롯보다 작은 극단 상황 방어
            S.quests.push(q);
        }
    },

    // 누적 완료 수에 따른 배수 — 0회면 1배, STEP_CAP회 이상이면 그 자리에서 멈춘다(무한 인플레 방지)
    tier() { return Math.min(S.questsCleared || 0, this.STEP_CAP); },
    needOf(def) { return def.need + def.step * this.tier(); },
    // 젬은 어떤 경로로도 보상 재화가 될 수 없다(사양: '보급 없음, 상점 더미') — 보상이 만들어지는 곳이
    // 여기 하나뿐이므로, DEFS 가 어떻게 바뀌어도 이 한 줄만 통과하면 젬은 새 슬롯에 못 들어온다.
    NO_GEM_FALLBACK: 'hammers',
    curOf(def) { return def.rw.cur === 'gems' ? this.NO_GEM_FALLBACK : def.rw.cur; },
    rollReward(def, need) {
        // 보상은 요구치와 같은 비율로 커진다 — 후반에 '10회 제작에 코인 400'이 되지 않게
        const k = need / def.need;
        return { cur: this.curOf(def), amt: Math.max(1, Math.round(def.rw.amt * k)) };
    },
    // 지금 떠 있는 것과 겹치지 않게 한 개 뽑는다
    roll(excludeIds) {
        const pool = this.DEFS.filter(d => excludeIds.indexOf(d.id) < 0);
        const def = U.choice(pool.length ? pool : this.DEFS);
        if (!def) return null;
        const need = this.needOf(def);
        return { id: def.id, need, prog: 0, rw: this.rollReward(def, need) };
    },

    list() { this.ensure(); return S.quests; },
    isDone(q) { return q.prog >= q.need; },

    // ---- 행동 카운터 훅 ----
    // 각 행동 지점에서 이 한 줄만 부른다. 퀘스트가 그 행동을 안 보고 있으면 아무 일도 없다.
    // 화면 갱신은 퀘스트 시트가 열려 있을 때만 — 닫혀 있으면 렌더 비용 0이다.
    bump(action, n = 1) {
        if (!(n > 0)) return;
        this.ensure();
        let touched = false;
        for (const q of S.quests) {
            if (q.id !== action || this.isDone(q)) continue;
            q.prog = Math.min(q.need, q.prog + n);
            touched = true;
        }
        if (!touched) return;
        if (typeof UI !== 'undefined' && UI.refreshQuestsIfOpen) UI.refreshQuestsIfOpen();
        if (typeof saveGame === 'function') saveGame();
    },

    canClaim(i) {
        const q = this.list()[i];
        return !!q && this.isDone(q);
    },
    // 수령 → 보상 지급 → **그 슬롯만** 같은 풀에서 새 퀘스트로 교체(날짜 무관, 즉시)
    claim(i) {
        if (!this.canClaim(i)) return null;
        const q = S.quests[i];
        // 젬 방어 가드 — 상점(shop.js:36)과 같은 규칙을 여기에도 둔다. 슬롯에 젬 보상이 박힌 저장분이
        // ensure() 를 안 거치고 흘러들어와도(외부 주입·손댄 세이브) 젬 대신 대체 재화로 지급한다.
        // 화면 토스트도 이 값을 그대로 읽으므로 '준다고 말하고 안 주는' 어긋남이 생기지 않는다.
        const cur = this.curOf({ rw: q.rw });
        const got = { cur, amt: q.rw.amt, text: this.def(q.id).text };
        S[cur] = (S[cur] || 0) + q.rw.amt;
        S.questsCleared = (S.questsCleared || 0) + 1;
        const fresh = this.roll(S.quests.filter((_, k) => k !== i).map(x => x.id));
        if (fresh) S.quests[i] = fresh; else S.quests.splice(i, 1);
        if (typeof saveGame === 'function') saveGame();
        return got;
    },

    // 수령 대기 중인 퀘스트 수 — 탭 배지에 쓴다
    readyCount() { return this.list().filter(q => this.isDone(q)).length; },
};
