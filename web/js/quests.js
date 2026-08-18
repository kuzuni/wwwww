// ===== 단순 반복 퀘스트 (사용자 지시 2026-08-18 `quest-tab`) =====
// 사용자 원문: "길드 행동 전투하는 거 빼고 1~5일차 것 내용들을 걍 반복 퀘스트로 넣고,
//               하단 네비에 소환이랑 상점 사이에 퀘스트 부분 넣어라."
// 재지적 (`quest-day1to5-full`): "퀘스트 3개밖에 없음. 그것도 수정해야 함."
//   → 3슬롯 로테이션을 걷어내고 **행동 풀 전체를 고정 목록으로 상시 노출**한다.
// 재지적 (`quest-fixed-repeat`): "완료할 때마다 바뀌던데, 그러지 말고 반복 퀘스트 느낌으로.
//   펫합성 퀘스트는 계속 펫합성 퀘스트고 그런 느낌." → 수령해도 재추첨하지 않는다.
//   같은 퀘스트가 **제자리에서 진행도 0으로** 다시 시작한다.
//
// ⚠️ 사양의 핵심 제약 (사용자 재확인) — **날짜·요일·일차(Day1~5) 개념을 절대 넣지 않는다.**
//    그래서 이 파일에는 시계도, 날짜 키도, 로테이션 인덱스도 없다. 유일한 시간 의존은
//    "언제 깨도 똑같다"를 보장하기 위해 **아무것도 시간에 안 묶는다**는 것뿐이다
//    (던전 열쇠처럼 `resetDateKey()`를 쓰는 코드가 여기 들어오면 사양 위반이다).
//
// 구조: DEFS 전 항목이 DEFS 순서 그대로 고정 노출된다(랜덤 추첨 없음). 수령하면 그 자리에
//       **같은 행동** 퀘스트가 진행도 0으로 올라온다(요구치·보상은 누적 수령 tier 를 따라 상승).
//       진행도는 각 행동 지점에서 `Quests.bump('<행동>', n)` 한 줄로 올라온다.
const Quests = {
    // 행동 풀. 전투(자동 진행)는 사용자가 명시적으로 제외했다 — 스테이지·웨이브·킬 카운트는 넣지 않는다.
    // 사용자 열거 풀(quest-tab 원문: 망치질·스킬 소환·기술 완성·코인 소비·장비 업그레이드 시작/완성·
    // 던전 열쇠 사용·알 부화/펫 병합·탈것 소환/병합)을 전부 커버한다 — 병합이 없는 탈것은
    // 흡수 강화(absorbMaterials)가 병합에 해당한다. sellGear·equipGear 는 열거에 없던 추가분(무해).
    // need: 기본 요구치, step: 누적 완료 수에 따라 늘어나는 몫(상한 STEP_CAP회까지),
    // rw: 보상 재화와 기본 지급량(요구치와 같은 비율로 커진다).
    // unit이 있으면 "코인 5,000 소비"처럼 개수가 아닌 양으로 읽힌다.
    STEP_CAP: 20,
    DEFS: [
        { id: 'craft',       icon: 'hammer',  text: '장비 제작',        need: 10,   step: 3,    rw: { cur: 'coins',       amt: 400 } },
        { id: 'sellGear',    icon: 'coin',    text: '장비 판매',        need: 8,    step: 2,    rw: { cur: 'hammers',     amt: 6 } },
        { id: 'equipGear',   icon: 'hammer',  text: '장비 장착',        need: 4,    step: 1,    rw: { cur: 'coins',       amt: 600 } },
        { id: 'coinSpend',   icon: 'coin',    text: '코인 소비',        need: 2000, step: 800,  rw: { cur: 'hammers',     amt: 10 }, unit: '' },
        // '장비 업그레이드(시작/완성)' 중 시작 쪽 — 훅은 Forge.startUpgrade (quest-day1to5-full ⑴)
        { id: 'upgradeStart',icon: 'coin',    text: '대장간 강화 시작',  need: 1,    step: 1,    rw: { cur: 'coins',       amt: 600 } },
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
        // '탈것 병합' — 탈것엔 등급 합성이 없어 흡수 강화(Mounts.absorbMaterials)가 병합이다.
        // ⚠️ 보상 상한: 재료 1마리 = 태엽 50(WINDERS_PER_SUMMON, 기술로 할인돼도 ~35)이고 소환 퀘스트가
        //    회당 태엽 20을 돌려주므로, 여기 보상이 15를 넘으면 '소환→흡수' 루프가 흑자가 된다. 10 고정.
        { id: 'mountMerge',  icon: 'winder',  text: '탈것 흡수 강화',    need: 1,    step: 1,    rw: { cur: 'winders',     amt: 10 } },
        { id: 'dungeonClear',icon: 'potion',  text: '던전 완료',        need: 1,    step: 1,    rw: { cur: 'potions',     amt: 3 } },
        // '던전 열쇠 사용' — 클리어 소모(dungeons.js onClear)와 소탕 소모(sweep) 양쪽에서 오른다.
        //    열쇠는 하루 지급량이 정해져 있어 수급이 저절로 유계다.
        { id: 'keySpend',    icon: 'key',     text: '던전 열쇠 사용',    need: 2,    step: 1,    rw: { cur: 'potions',     amt: 4 } },
    ],
    def(id) { return this.DEFS.find(d => d.id === id); },

    CUR_KR: { coins: '코인', hammers: '해머', gems: '젬', tickets: '티켓', winders: '태엽', eggCurrency: '깨진 알', potions: '물약' },

    ensure() {
        if (!Number.isFinite(S.questsCleared) || S.questsCleared < 0) S.questsCleared = 0;
        if (!Array.isArray(S.quests)) S.quests = [];
        // 고정 배치: DEFS 순서 그대로 전 항목을 깐다 (quest-day1to5-full — 로테이션·랜덤 추첨 없음).
        // 저장분은 id 로 찾아 진행도를 이어받는다 — 구세이브(3슬롯 로테이션분)도 이 경로로 흡수된다.
        // 보상 재화가 지금 DEFS 와 다르면(구세이브에 젬 보상이 박혀 있던 경우) 그 자리에서 다시 만든다 —
        // 마이그레이션을 안 하면 이미 뜬 젬 퀘스트가 계속 남아 젬을 준다.
        // 지금 상태에서 절대 못 깨는 항목(만렙 대장간의 코인 소비 등, available 참조)은 목록에서 내리되,
        // **이미 깬 것은 남긴다**: 깨 놓고 수령 전에 만렙이 됐다고 보상을 뺏으면 안 된다.
        const saved = {};
        for (const q of S.quests) {
            if (!q || !this.def(q.id) || !Number.isFinite(q.need) || q.need <= 0) continue;
            if (!saved[q.id]) saved[q.id] = q;
        }
        const next = [];
        for (const def of this.DEFS) {
            const prev = saved[def.id];
            const done = prev && (+prev.prog || 0) >= prev.need;
            if (!this.available(def) && !done) continue;
            if (prev) {
                const rw = prev.rw && prev.rw.cur === this.curOf(def) ? prev.rw : this.rollReward(def, prev.need);
                next.push({ id: def.id, need: prev.need, prog: U.clamp(+prev.prog || 0, 0, prev.need), rw });
            } else {
                next.push(this.fresh(def));
            }
        }
        S.quests = next;
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
    // 지금 상태에서 **절대 못 깨는** 퀘스트는 목록에 올리지도, 남기지도 않는다.
    // 게임에서 코인이 나가는 지점은 대장간 강화 단 하나뿐이라(`S.coins -=` 는 forge.js 한 줄이 전부다)
    // 대장간이 만렙(Lv.35)이면 `coinSpend`·`upgradeStart`·`gearUpgrade` 는 진행도가 영원히 0이다.
    // 고정 목록에 영구 미완료가 끼면(포기 수단도 없다) 죽은 칸이 눌러앉는다.
    // 만렙 이전에는 필터가 아무것도 걸러내지 않아 전 항목이 그대로 노출된다.
    FORGE_LOCKED: ['coinSpend', 'upgradeStart', 'gearUpgrade'],
    available(def) {
        if (this.FORGE_LOCKED.indexOf(def.id) < 0) return true;
        if (typeof Forge === 'undefined') return true;      // 로드 순서 방어 — 모르면 막지 않는다
        return !!Forge.upgradeInfo();                        // 만렙이면 null
    },
    // 이 행동의 새(진행도 0) 퀘스트 — 요구치·보상은 현재 tier 기준
    fresh(def) {
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
    // 수령 → 보상 지급 → **같은 퀘스트**가 제자리에서 진행도 0으로 다시 시작 (quest-fixed-repeat —
    // 재추첨하지 않는다: 펫합성 자리는 계속 펫합성이다. 날짜 무관, 즉시)
    claim(i) {
        if (!this.canClaim(i)) return null;
        const q = S.quests[i];
        const def = this.def(q.id);
        // 젬 방어 가드 — 상점(shop.js:36)과 같은 규칙을 여기에도 둔다. 슬롯에 젬 보상이 박힌 저장분이
        // ensure() 를 안 거치고 흘러들어와도(외부 주입·손댄 세이브) 젬 대신 대체 재화로 지급한다.
        // 화면 토스트도 이 값을 그대로 읽으므로 '준다고 말하고 안 주는' 어긋남이 생기지 않는다.
        const cur = this.curOf({ rw: q.rw });
        const got = { cur, amt: q.rw.amt, text: def.text };
        S[cur] = (S[cur] || 0) + q.rw.amt;
        S.questsCleared = (S.questsCleared || 0) + 1;
        // 이 수령으로 못 깨는 상태가 됐으면(예: 방금 강화 완료 수령이 만렙 도달분이면) 자리가 내려간다
        if (this.available(def)) S.quests[i] = this.fresh(def); else S.quests.splice(i, 1);
        if (typeof saveGame === 'function') saveGame();
        return got;
    },

    // 완료된 퀘스트를 한 번에 전부 수령 (사용자 지시 2026-08-18 `quest-claim-all`).
    // 재화별 합계와 수령 건수를 돌려준다 — 토스트를 한 줄로 합쳐 띄우려는 것이라
    // 개별 문구가 아니라 `{ n, gains: {재화: 합계} }` 형태다. 하나도 없으면 n=0.
    //
    // ⚠️ 지급·교체 규칙을 여기서 **다시 쓰지 않는다** — `claim(i)` 를 그대로 돌린다.
    // 젬 방어 가드·questsCleared 누적·슬롯 교체가 전부 그 안에 있고, 수령 후 슬롯을
    // 어떻게 할지(새 퀘스트로 교체할지, 진행도만 리셋해 같은 퀘스트를 반복할지)는
    // `quest-fixed-repeat` 가 바꾸는 중이다. 위임해 두면 그 결정이 여기에도 자동으로 적용된다.
    //
    // 인덱스는 **큰 쪽부터** 돈다: `claim(i)` 은 새 퀘스트를 못 뽑으면 그 칸을 splice 해
    // 뒤 인덱스를 당긴다. 내림차순이면 아직 안 본 칸(더 작은 인덱스)이 안 흔들린다.
    claimAll() {
        const idx = this.list().map((q, i) => (this.isDone(q) ? i : -1)).filter(i => i >= 0);
        const gains = {};
        let n = 0;
        for (let k = idx.length - 1; k >= 0; k--) {
            const got = this.claim(idx[k]);
            if (!got) continue;
            gains[got.cur] = (gains[got.cur] || 0) + got.amt;
            n++;
        }
        return { n, gains };
    },

    // 수령 대기 중인 퀘스트 수 — 탭 배지에 쓴다
    readyCount() { return this.list().filter(q => this.isDone(q)).length; },
};
