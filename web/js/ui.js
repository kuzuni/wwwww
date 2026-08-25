// ===== UI: 탭/패널/HUD/모달/토스트 =====
/* 좌우 스텝 삼각형(◀▶)의 채움색. 원본 shot-042521 소환 확률 팝업의 파란 삼각형 실측이
   정확히 `#005dff` 로, css `--pp-blue` 와 같은 값이다 — 캔버스 아이콘은 CSS 변수를 못 읽으니
   여기 한 곳에만 리터럴을 둔다(팔레트가 바뀌면 두 곳을 같이 고칠 것). */
const TRI_BLUE = { tint: '#005dff' };
const UI = {
    els: {},
    activeTab: null,
    _pendingItem: null,
    // 소환 배수 4단 순환 (사용자 지시: x1→x5→x25→x75) — 스킬·펫·탈것 공통, S.summonMult에 저장돼 재접속 유지
    SUMMON_MULTS: [1, 5, 25, 75],
    summonMult(kind) { return (S && S.summonMult && S.summonMult[kind]) || 1; },
    // 탈것 슬롯의 '+N마리' 배지. 장착 제한이 풀려(2026-08-18) 칸 하나에 여러 마리를 알려야 하는데,
    // css/style.css 는 지금 UI 스트림이 셀 비율·아웃라인 작업으로 만지는 중이라 그 파일을 건드리지 않고
    // 인라인으로 둔다. 셀 스킨이 정리되면 클래스(.cell-count)로 옮길 것.
    MOUNT_COUNT_STYLE: 'position:absolute;top:.12rem;right:.16rem;z-index:3;font-size:.62rem;font-weight:900;'
        + 'color:#fff;padding:0 .22rem;border-radius:.5rem;background:rgba(0,0,0,.62);'
        + 'border:1px solid rgba(255,255,255,.5);line-height:1.25;pointer-events:none;',
    cycleSummonMult(kind) {
        S.summonMult = S.summonMult || {};
        const cur = this.summonMult(kind);
        S.summonMult[kind] = this.SUMMON_MULTS[(this.SUMMON_MULTS.indexOf(cur) + 1) % this.SUMMON_MULTS.length];
        saveGame();
        if (kind === 'skill') this.renderSkills();
        else if (kind === 'pet') this.renderPets();
        else this.keepScroll(() => this.openMounts());   // 이미 열린 목록 재렌더 — 스크롤 유지
    },

    // ===== 보관함이 가득 찬 소환 라인 (펫·탈것 공용) =====
    // 🚨 종전에는 두 화면이 **서로 다른 반쪽만** 보고 있었다 (summon-btn-when-inventory-full,
    //    2026-08-20 QA 20차 실측):
    //     · 펫 — 라벨·비용에 `Pets.summonCount/summonCost` 를 그대로 써서, 여유가 0이면 둘 다 0으로
    //       줄어 **`소환 x0 · 🥚 0`**(공짜로 0개 뽑는 것처럼 보임)이 됐다. 배수를 x5 로 바꿔도
    //       `x0` 그대로라 배수 토글까지 죽은 것처럼 보였다.
    //     · 탈것 — 라벨은 줄지 않는 원래 배수라 **`소환 x1 · ⚙️ 50` 으로 멀쩡해 보이고 `disabled`
    //       조차 안 붙는데**(`Mounts.canSummon` 이 태엽만 보고 보유 상한을 아예 안 본다) 눌러도
    //       절대 성공하지 않는다.
    //    두 화면을 **같은 규칙**으로 맞춘다: 가득 차면 비활성 + 라벨/비용 자리에 **이유**를 적는다.
    // ⚠️ `Pets.summonCount` 의 클램프 자체는 건드리지 않는다 — 여유가 3칸일 때 x5 로 3개만 나가는
    //    동작은 의도이고 `r.clamped` 토스트까지 붙어 있다. 고치는 것은 **여유 0 이라는 밑바닥 경우**뿐이다.
    // ⚠️ `Mounts.canSummon` 에 공간 조건을 더하지 않는다 — 그 함수는 `Mounts.summon` 안에서
    //    재검사로도 쓰여(mounts.js) 클램프된 n 과 얽힌다. 상한은 여기 UI 판정에서만 본다.
    // ⚠️ 라벨은 **`보관함 가득` 다섯 글자로 고정**한다 — 버튼 폭이 122px 뿐이라 `알 보관함 가득`
    //    처럼 한 글자만 길어져도 윗줄이 접혀 버튼 높이가 58.4px → 64.7px(+10.8%p)로 튄다(실측).
    //    어느 보관함인지는 아랫줄 아이콘(🥚/⚙️)과 수치가 말한다.
    SUMMON_FULL: {
        pet:   { icon: 'eggCracked', cur: () => S.eggs.length,   cap: () => Pets.EGG_CAP,    label: '보관함 가득' },
        mount: { icon: 'winder',     cur: () => Mounts.count(),  cap: () => Mounts.INV_CAP,  label: '보관함 가득' },
    },
    // 보관함이 가득 찼나 (가득이면 소환 버튼을 이 규칙으로 그린다)
    summonFull(kind) {
        const f = this.SUMMON_FULL[kind];
        return !!f && f.cur() >= f.cap();
    },
    // 가득 찬 소환 버튼 HTML — 평소 버튼과 **같은 두 줄 구조**(윗줄 라벨 + `.summon-cost` 아랫줄)라
    // 버튼 높이·비율이 흔들리지 않는다. 비활성은 종전 규약대로 클래스만 준다(onclick 은 살려 둬야
    // 눌렀을 때 핸들러 토스트가 같은 사실을 한 번 더 말해 준다).
    summonFullBtnHTML(kind, onclick) {
        const f = this.SUMMON_FULL[kind];
        return `<button class="btn big summon-btn disabled" onclick="${onclick}">`
            + `${f.label}<small class="summon-cost">${IconGen.img(f.icon)} <b>${f.cur()}/${f.cap()}</b></small></button>`;
    },

    // ===== 소환 결과 연출 팝업 (스킬·펫·탈것 공용) =====
    // 원본 구성: 어두운(남색/검정) 풀스크린 오버레이 위에 뽑힌 항목을 등급색 원형 아이콘으로 나열.
    // 연출: ① 빛 모임 플래시+충격파(기대감) → ② 아이콘이 등급 오름차순으로 하나씩 팝(스케일 바운스,
    // 고등급은 등급색 광채+회전 광선) → ③ 최고 등급은 한 박자 늦게 홀드백 등장 + 화면 플래시
    // → ④ 등급별 집계 + [확인]. 탭하면 스킵(전부 즉시 표시), 완료 상태에서 탭하면 닫힘.
    // 대량 소환(x25/x75)은 같은 항목을 한 셀로 묶고 수량 배지를 달아 색점 나열이 되지 않게 한다.
    // `ico` = 소환 재화 아이콘 키(IconGen). 예전엔 이모지(🎫🥚⚙️)를 박아 뒀는데, 같은 재화가
    // 상단 재화 바·소환 버튼에서는 생성 아이콘으로 그려져 **한 화면 안에서 두 얼굴**이었다
    // (사용자 지시 2026-08-19 `summon-result-image-unify`). 이모지는 IconGen 이 없을 때의 폴백으로만 남긴다.
    SUMMON_KIND: {
        skill: { title: '스킬 소환', ico: 'ticket', icon: '🎫' },
        pet: { title: '펫 소환', ico: 'egg', icon: '🥚' },
        mount: { title: '탈것 소환', ico: 'winder', icon: '⚙️' },
    },
    SUMMON_DUP_LABEL: { skill: '조각', mount: '재료' }, // 중복분 적립 환산 표기 (펫은 알 단위라 없음)
    SR_HI_RARITIES: ['legendary', 'ultimate', 'mythic'], // 광채 강조 대상
    // ⚠️ 소환 결과 타임라인 5종은 2026-08-19 사용자 지시("뽑기 애니메이션 3초 같은데 절반으로")로
    //    일괄 절반이다. 정점 동기 CSS(.sr-charge/.sr-shock/.sr-wrap 딜레이·.charging 5종·srstreak)와
    //    SFX.summonCharge 길이도 같은 배율로 묶여 있다 — 한쪽만 되돌리면 빛 정점과 첫 셀이 어긋난다.
    SR_REVEAL_BUDGET: 1100, // (소량 판 산정용 잔재 — 대량 판은 아래 행 단위 웨이브가 대체)
    SR_SLOW_STEP: 125,      // 10개 이하 소량 뽑기의 셀 간격 — 캐스케이드가 눈에 보이는 하한
    // 대량 소환(>10셀)은 셀 단위 균일 드립이 아니라 **행 단위 웨이브**로 민다(11차 비평가
    // 2인 일치 ⑴ — 균일 61ms 드립은 프레임당 변화가 정점의 3~5%라 중반이 죽은 화면으로
    // 읽혔다. 행 6개가 40ms 스태거로 한꺼번에 착지하면 같은 시간에 변화가 뭉쳐 파도가 된다).
    SR_ROW_MS: 300,         // 행 시작 간격 — 행 착지(6열×40ms=240ms) 뒤 60ms 숨
    SR_ROW_STAG_MS: 40,     // 행 안 셀 스태거
    SR_TIER_PAUSE_MS: 200,  // 등급(챕터) 경계의 짧은 정지 — 그 등급색 링 플래시가 틈을 채운다
    // 빛 모임은 이 시각에 '최대 휘도'로 터진다 — 그 백색 오버슛이 감쇠하는 동안 첫 아이콘이
    // 꺼내진다(예전엔 120ms에 피크를 찍고 480ms엔 암전인데 아이콘이 540ms에 떠서, 빛과
    // 아이콘이 인과로 안 묶이고 '별개 애니메이션 두 개'로 읽혔다)
    SR_CHARGE_MS: 240,      // 빛 모임 정점 시각(.sr-charge 애니메이션 길이와 맞춤)
    SR_HOLDBACK_MS: 150,    // 최고 등급 1개를 마지막에 한 박자 늦게 띄우는 여유(정지 구간이 아니라 축적 구간)
    SR_TAIL_MS: 150,        // 마지막 아이콘이 뜬 뒤 [확인]이 나오기까지의 여운
    _srTimers: [], _srRaf: 0,
    _srCells: null, _srEntries: null, _srDelays: null, _srStart: 0, _srIdx: 0,
    _srDone: false, _srHeroIdx: -1,

    // ---- 소환 결과창 그림 = 슬롯의 그림 (사용자 지시 2026-08-19 `summon-result-image-unify`) ----
    // 사용자 원문: "스킬·펫·탈것에 소환 결과창 이미지랑 실제 이미지가 다른 문제. 통일되게."
    // 예전엔 이 팝업만 이모지(SKILL_ICONS 🎫·MOUNT_ICONS 🐴·알 🥚)를 박아서, 결과창에서 본 그림과
    // 슬롯·인벤에 실제로 들어간 그림이 딴판이었다. **슬롯이 쓰는 렌더 소스를 그대로 부른다** —
    //   · 스킬 : `IconGen.skill(id)`      (스킬 슬롯 `.sk-icon` 과 같은 `sk_*` 아이콘)
    //   · 탈것 : `UI.mountFace(name)`      (탑승 슬롯과 같은 3D 썸네일 파이프라인)
    //   · 알   : `IconGen.img('egg', tint=등급색)` (펫 화면 알 타일과 같은 등급색 알)
    // ⚠️ 이 세 자리에 **다시 이모지를 넣지 말 것** — 그게 이 항목의 버그 그 자체다.
    // ⚠️ 3D 썸네일은 첫 굽기가 무거워 이모지 폴백으로 먼저 깔릴 수 있다 —
    //    `openSummonResult` 가 모달을 붙인 직후 `hydrateMountThumbs(m)` 로 굽는다.
    srFace(kind, id, rarity) {
        if (kind === 'skill') return (typeof IconGen !== 'undefined' && IconGen.skill(id)) || SKILL_ICONS[id] || '✨';
        if (kind === 'mount') return this.mountFace(id, 'sr-mt');
        return (typeof IconGen !== 'undefined' && IconGen.img('egg', 'sr-egg', { tint: RARITY_CSS[rarity] })) || '🥚';
    },

    // 모듈별 소환 결과 배열을 팝업이 쓰는 공통 형태로 변환 (묶음 전, 굴림 1회 = 1개)
    summonEntries(kind, results) {
        if (kind === 'skill') return results.map(r => ({
            key: 'sk:' + r.def.id, icon: this.srFace('skill', r.def.id, r.def.rarity),
            rarity: r.def.rarity, name: r.def.name, isNew: !!r.isNew,
        }));
        if (kind === 'mount') return results.map(r => ({
            key: 'mt:' + r.name, icon: this.srFace('mount', r.name, r.rarity),
            rarity: r.rarity, name: MOUNT_KR[r.name] || r.name, isNew: !!r.isNew,
        }));
        // 펫은 알 단위 획득이라 신규/중복 개념이 없다 — 기술트리 보너스 알만 따로 묶는다
        return results.map(r => ({
            key: 'eg:' + r.rarity + (r.extra ? ':x' : ''), icon: this.srFace('egg', '', r.rarity), rarity: r.rarity,
            name: r.extra ? `보너스 ${RARITY_KR[r.rarity]} 알` : `${RARITY_KR[r.rarity]} 알`, isNew: false,
        }));
    },

    SR_MERGE_FROM: 11, // 이 개수부터 같은 항목을 한 셀로 묶는다

    // merge=true면 같은 항목을 셀 하나로 합치고 수량 배지로 표시한다. x75도 고유 항목 수
    // (스킬 18·탈것 15·알 12종)까지만 늘어나 이름/등급이 그대로 살아남는다.
    // x5 이하는 원본 구성("x5면 아이콘 5개")을 지켜야 하므로 묶지 않고 그대로 나열한다.
    groupSummonEntries(kind, entries, merge) {
        const dup = this.SUMMON_DUP_LABEL[kind];
        let list;
        if (merge) {
            const map = new Map();
            for (const e of entries) {
                const g = map.get(e.key);
                if (g) { g.qty++; if (e.isNew) g.newQty++; }
                else map.set(e.key, Object.assign({ qty: 1, newQty: e.isNew ? 1 : 0 }, e));
            }
            list = [...map.values()];
        } else {
            list = entries.map(e => Object.assign({ qty: 1, newQty: e.isNew ? 1 : 0 }, e));
        }
        for (const g of list) {
            g.isNew = g.newQty > 0;
            // 라벨 줄은 **등급 칩 전용**이다. 예전엔 한 칸에 등급명과 적립 환산(조각/재료)을
            // 번갈아 넣어서 중복만 나온 항목의 등급이 통째로 사라졌고(x75 mid 15장 중 10장),
            // 그걸 '2슬롯'으로 고친 뒤에는 폭 초과를 폰트 축소로 막아 **중복이 붙은 셀만
            // 등급 칩까지 작아졌다**(9차 비평가 B ⑵ [치명]). 지금은 적립 환산을 라벨 줄에서
            // 빼서 구체 좌하단 배지(.sr-dup)로 내렸다 — 등급 칩 크기는 전 셀에서 같다.
            g.sub = RARITY_KR[g.rarity];
            g.extra = (dup && !g.newQty) ? `${dup} +${g.qty}` : '';
        }
        // 등급 오름차순 — 마지막에 뜨는 셀이 최고 등급이 되게(홀드백 연출의 전제)
        return list.sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
    },

    // 등급별 획득 수 집계 칩 — 대량 소환에서 "무엇이 얼마나 나왔는지"를 한 줄로 알려준다
    summonSummary(entries) {
        if (entries.length <= 1) return '';
        const cnt = {};
        for (const e of entries) cnt[e.rarity] = (cnt[e.rarity] || 0) + 1;
        // 그리드가 등급 오름차순으로 뜨므로 집계 칩도 같은 방향으로 읽혀야 한다 —
        // 예전엔 칩만 내림차순이라 "마지막에 뜬 최고 등급"이 요약에서는 맨 왼쪽에 있었다
        // 🚨 `data-tier`를 반드시 실을 것 — 요약 칩의 크기·광채 위계가 여기에 걸린다.
        //    9차 비평가 B ⑷ "무채색 아웃라인 6개라 '신화 11개'가 가장 안 읽힌다"의 원인은
        //    css가 `color: var(--rc)`를 읽는데 chipVars는 `--cb/--cf`만 심어 **--rc가 미정의**라
        //    여섯 칩이 전부 상속색(흰색)으로 떨어진 것이었다(실측: 6칩 color 전부 rgb(236,239,241)).
        const chips = RARITIES.filter(r => cnt[r])
            .map(r => `<b class="sr-chip" data-tier="${RARITIES.indexOf(r)}" style="${this.chipVars(r)}">`
                + `${RARITY_KR[r]} ${cnt[r]}</b>`).join('');
        return `<div class="sr-sum">${chips}</div>`;
    },

    // 등급색에서 밝은/어두운 스톱을 계산한다. RARITY_CSS는 전 화면 공용 데이터라 건드리지 않고,
    // 구체 그라디언트에만 파생색을 쓴다 (color-mix 미지원 브라우저에서도 동작하게 JS로 계산).
    // 파싱은 `srRgb` 한 곳에만 둔다 — 여기 따로 `parseInt(hex.slice(1))` 을 복제해 두면
    // 나쁜 값 가드도 두 벌이 돼서 한쪽만 고치게 된다(실제로 그래서 이 줄이 따로 터졌다).
    srShade(hex, amt) {
        return '#' + this.srRgb(hex)
            .map(c => U.clamp(Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt)), 0, 255)
                .toString(16).padStart(2, '0')).join('');
    },

    // 구체 스페큘러(--rc-lite) — **등급이 올라갈수록 하이라이트가 밝아지게** 목표 휘도로 역산한다.
    // 🚨 이걸 상수 배합(예전 `srShade(rc, .5)`)으로 두면 위계가 뒤집힌다: 하이라이트 휘도가
    //    팔레트 고유 휘도에 그대로 딸려 가는데, `RARITY_CSS` 는 일반(#d6d6d6, luma 214)이
    //    희귀한(#29b6f6, 147)·서사시(#3ddc50, 157)·궁극의(#ff3b30, 116)·신화(#b23dff, 118)보다
    //    **밝다**. 실제로 `probe-sr-material` 의 구체 평균 휘도가 일반 140.6 > 희귀한 103.0 ·
    //    궁극의 81.5 · 신화 80.4 로, 최하 등급이 위 네 등급보다 밝게 찍혔다(10차 비평가 B ②,
    //    13차 비평가 B 가 독립적으로 같은 것을 지적했고 우리 계측기가 세 번째로 확인했다).
    // ⚠️ 팔레트(RARITY_CSS)는 전 화면 공용이라 **건드리지 않는다** — 몸통 색(--rc)은 그대로 두고
    //    스페큘러 스톱만 등급별 목표 휘도로 올린다. 색상(hue)은 몸통 40% 스톱이 지킨다.
    SR_HILITE_LUMA: [222, 246, 248, 250, 252, 254],
    srHilite(hex, tier) {
        const [r, g, b] = this.srRgb(hex);
        const luma = r * .299 + g * .587 + b * .114;
        const want = this.SR_HILITE_LUMA[U.clamp(tier, 0, 5)];
        // amt = 흰색으로 얼마나 당길지. (255-luma) 로 나눠 목표 휘도를 맞춘다.
        return this.srShade(hex, U.clamp((want - luma) / Math.max(1, 255 - luma), 0, 1));
    },

    // ⚠️ 색이 아닌 값(undefined 등)이 들어와도 **여기서 팝업 전체를 무너뜨리지 않는다.**
    //    실측 사례(probe-creature-framing-crash): 등급표에 없는 문자열이 `RARITY_CSS[...]` 로 조회돼
    //    undefined 가 여기까지 내려왔고, `undefined.slice` 가 터지면서 탈것 상세 팝업이 통째로 죽었다.
    //    다만 **조용히 삼키지는 않는다** — 그랬으면 이 결함 자체가 안 보였을 것이다. 회색으로 눈에
    //    띄게 떨어뜨리고 console.error 를 내서 프로브의 '콘솔 에러 0건' 판정에 반드시 걸리게 한다.
    SR_RGB_FALLBACK: '#808080',
    srRgb(hex) {
        if (typeof hex === 'string' && /^#[0-9a-fA-F]{3}$/.test(hex)) {   // #abc → #aabbcc
            hex = '#' + hex.slice(1).split('').map(c => c + c).join('');
        }
        if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
            console.error('[UI.srRgb] 색이 아닌 값이 들어왔다(등급표에 없는 키?):', hex);
            hex = this.SR_RGB_FALLBACK;
        }
        const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },

    // ===== 흰 '페이퍼' 카드 위에서 쓸 등급색 =====
    // RARITY_CSS는 어두운 3D 씬·검은 UI 위에서 쓰라고 잡은 **밝은** 팔레트다. 흰 카드 위
    // 텍스트 색으로 그대로 쓰면 6등급 전부 WCAG AA(4.5:1) 미달이고 전설은 1.24:1로
    // 거의 백지 위 백지였다(QA 11차 실측). 팔레트 자체는 전 화면 공용이라 건드리지 않고,
    // **흰 배경에 쓸 때만** 같은 색상(hue)을 유지한 채 4.5:1을 넘을 때까지 어둡게 낮춘다.
    _inkCache: {},
    relLum(hex) {
        return this.srRgb(hex).map(c => {
            const s = c / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    },
    contrastOnWhite(hex) { return 1.05 / (this.relLum(hex) + 0.05); },
    // 흰 카드 위 텍스트용 등급색 (AA 4.5:1 보장)
    inkRarity(hex, target) {
        const need = target || 4.5;
        const key = hex + '@' + need;
        if (this._inkCache[key]) return this._inkCache[key];
        let out = hex;
        // 5%씩 낮추며 처음 기준을 넘는 지점에서 멈춘다 — 필요 이상으로 검게 만들지 않는다
        for (let i = 0; i < 20 && this.contrastOnWhite(out) < need; i++) out = this.srShade(hex, -0.05 * (i + 1));
        this._inkCache[key] = out;
        return out;
    },
    // ===== 등급 칩(솔리드 필) 배색 =====
    // 예전 칩은 '어두운 반투명 배경 + 등급색 글자 + 등급색 테두리'였다. 등급색 팔레트는
    // 밝기가 제각각(일반 #d6d6d6 ↔ 궁극 #ff3b30)이라 같은 배경 위에 얹으면 대비가
    // 신화 1.93 : 일반 4.63으로 벌어져 **가장 중요한 등급일수록 가장 안 읽혔다**.
    // 등급색을 배경으로 깔고 전경을 대비 기준으로 고르면 등급마다 대비가 평평해진다.
    _chipCache: {},
    contrastPair(a, b) {
        const la = this.relLum(a), lb = this.relLum(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    },
    // 등급색 필 위에서 4.5:1을 넘는 전경색을 고른다. 검정/흰색 중 대비가 큰 쪽을 쓰되,
    // 그래도 모자라면 필을 밝히거나(검정 글자) 어둡게(흰 글자) 밀어 기준을 채운다.
    chipFill(hex) {
        if (this._chipCache[hex]) return this._chipCache[hex];
        const INK = '#070b18', PAPER = '#ffffff';
        let bg = hex;
        let fg = this.contrastPair(bg, INK) >= this.contrastPair(bg, PAPER) ? INK : PAPER;
        for (let i = 0; i < 20 && this.contrastPair(bg, fg) < 4.5; i++) {
            // 검정 글자면 필을 밝게, 흰 글자면 어둡게 — 색상(hue)은 그대로 유지된다
            bg = this.srShade(hex, (fg === INK ? 0.05 : -0.05) * (i + 1));
        }
        const out = { bg, fg };
        this._chipCache[hex] = out;
        return out;
    },
    chipVars(rarity) {
        const p = this.chipFill(RARITY_CSS[rarity]);
        return `--cb:${p.bg};--cf:${p.fg}`;
    },

    // base에 tint를 amt만큼 섞는다 — 결과 등급에 따라 배경 분위기를 승격시킬 때 쓴다
    srBlend(base, tint, amt) {
        const a = this.srRgb(base), b = this.srRgb(tint);
        return '#' + a.map((c, i) => U.clamp(Math.round(c + (b[i] - c) * amt), 0, 255)
            .toString(16).padStart(2, '0')).join('');
    },

    // 등급 → 재질. 색만으로 등급을 말하면 여섯 등급이 '같은 구슬의 색놀이'로 보인다.
    // 하위=무광 금속 / 중위=유리 / 상위=보석으로 재질 자체를 갈라 위계를 만든다.
    SR_MATERIAL: ['metal', 'metal', 'glass', 'glass', 'gem', 'gem'],
    srMaterial(rarity) { return this.SR_MATERIAL[RARITIES.indexOf(rarity)] || 'metal'; },

    // 열 수 — 5열 고정이면 11개가 5/5/1이 돼 마지막 행에 한 개만 남는 고아 행이 생긴다.
    // 4~6열 중 마지막 행이 가장 덜 비는 값을 고른다(동률이면 5열에 가까운 쪽).
    // 🚨 10차 잔여 ⑤ — **6~10셀 풀사이즈 판은 3~5열로 내려 두 줄 이상을 세운다.**
    //    한 줄 6열은 셀이 .sr-cell 폭 공식에서 49px까지 쪼그라들고 그리드 세로 점유가
    //    113px에 그쳐, 본문 587px 중 위 173px·아래 172px 밴드가 통째로 빈다(A 실측).
    //    다열이면 셀이 5.6rem 상한까지 커지고 세로 점유가 행 수만큼 늘어 밴드가 실제
    //    콘텐츠로 찬다. 후보를 작은 열부터 훑으므로 충전율 동률이면 더 적은 열(=더 큰
    //    셀·더 많은 행)이 이긴다. 고아 행 회피 규칙은 그대로다(충전율 최대가 기준).
    srCols(n) {
        const cand = n >= 6 && n <= 10 ? [3, 4, 5] : [5, 4, 6];
        let best = cand[0], bestFill = -1;
        for (const c of cand) {
            const fill = (n % c === 0 ? c : n % c) / c; // 마지막 행 충전율
            if (fill > bestFill + 1e-9) { bestFill = fill; best = c; }
        }
        return best;
    },

    // ① 빛 모임 구간에 중심으로 빨려드는 빛줄기 — 팝만 있고 '모이는 힘'이 없으면
    // 기대감 구간이 흰 플래시 한 장으로 끝난다. 난수 대신 고정 수열로 흩어 놓는다.
    // 응축 빛줄기 수를 굴림 수에 연동(11차 2인 일치 ⑶ — 'B: tl-x5-hi/t0000 과 tl-x75/t0000 이
    // 완전히 같은 프레임, 도입이 물량과 무연동'): x1 9줄 ~ x75 24줄. 위상·반경 수열은 그대로.
    summonStreaks(rolls) {
        let h = '';
        const k = U.clamp(6 + Math.round(Math.sqrt(rolls || 5) * 3), 9, 24);
        for (let i = 0; i < k; i++) {
            // 딜레이 폭은 짧게 — 셀 등장(SR_CHARGE_MS 240ms)까지 전부 사라져야
            // 아이콘 줄 위에 흰 막대가 남지 않는다 (srstreak .18s + 최대 딜레이 60ms = 240ms)
            h += `<i style="--a:${(i * 360 / k + (i % 3) * 7).toFixed(1)}deg;`
               + `--r:${(7.5 + (i * 17) % 6)}rem;--len:${(2.2 + (i % 4) * .8).toFixed(1)}rem;`
               + `--d:${((i * 53) % 60) / 1000}s"></i>`;
        }
        return `<div class="sr-streaks">${h}</div>`;
    },

    // 무대 판(≤10셀) 위·아래 밴드의 별가루 — 10차 잔여 ⑤의 마지막 조각. 무대·천개·반사를
    // 다 세워도 타이틀~아치 밴드와 소환진 아래 밴드는 '넓고 어두운 면'이라 A 의 픽셀 자
    // (30px 행 std ≥ 30/255)를 못 넘었다(실측: 광선·스필·기둥 같은 분위기 레이어는 행 std 에
    // +5~13 밖에 못 보탠다). 콘텐츠급 밝기의 점 요소만이 그 자를 움직인다 — 마침 6·9차
    // 비평가가 처방한 '상승 파티클/별가루'와 같은 언어라 장식이 아니라 처방 이행이다.
    // 좌표는 .sr-body 기준 %로, 그리드가 쓰는 중앙(22~72%)을 피해 위 4~19%·아래 76~94%에만.
    // 호흡 최저 불투명도를 .5 로 두어 어느 캡처 위상에서도 사라지지 않는다.
    summonStageStars() {
        // 20개·행 버킷당 2~3개가 필요하다 — 12개(행당 1개)로는 행 std 가 +2~7 밖에 안 올랐다
        // (실측: 별 하나의 분산 기여는 제곱합으로 묻힌다). 위 밴드는 body 0~18%, 아래 76~94%
        // 를 2%p 간격으로 고르게 덮어 30px 버킷마다 여러 개가 걸리게 한다.
        let h = '';
        for (let i = 0; i < 24; i++) {
            const top = i < 12;                               // 앞 12개 = 위 밴드, 뒤 12개 = 아래
            const x = 5 + (i * 43) % 90;                      // 5~95% 가로 산포(고정 수열)
            // y 도 고정 수열로 — 등차로 두면 x 수열과 짝이 맞아 대각 사슬로 늘어선다(실캡처 확인)
            const y = top ? 1 + (i * 7) % 17 : 76 + (i * 11) % 18;
            const s = 9 + (i * 7) % 7;                        // 9~15px
            h += `<i style="--x:${x}%;--y:${y.toFixed(1)}%;--s:${s}px;--d:${((i * 313) % 2600) / 1000}s;`
               + `--dur:${(2.6 + (i % 4) * .7).toFixed(1)}s"></i>`;
        }
        return `<div class="sr-stars">${h}</div>`;
    },

    // 배경에 천천히 떠오르는 빛가루 — 정지 화면이 죽어 보이지 않게 하는 용도라 난수 대신
    // 고정 수열로 흩어 놓는다(소환할 때마다 배치가 튀지 않게)
    summonMotes() {
        let h = '';
        for (let i = 0; i < 18; i++) {
            h += `<i style="--x:${(i * 37) % 100}%;--y:${(i * 61) % 100}%;--s:${3 + (i * 13) % 5}px;`
               + `--d:${((i * 271) % 3400) / 1000}s;--dur:${3.4 + (i % 5) * 0.55}s"></i>`;
        }
        return `<div class="sr-motes">${h}</div>`;
    },

    // ===== 깊이 평면 2겹 (10차 비평가 잔여 ② [2인 일치] "전경 평면이 0겹") =====
    // 지적: 구체 **앞을** 가로지르는 요소가 NEW 배지·이름판뿐이라 화면이 한 겹으로 납작하다
    // (A 실측 부유 파티클 전 화면 6~8개). 깊이는 피사체 뒤가 아니라 **앞**에 무언가가 지날 때 생긴다.
    // 빛가루(.sr-motes)는 z 1의 **배경** 평면이라 이 지적을 못 메운다 — 새로 두 겹을 얹는다.
    //  · 중간 평면(.sr-dust)  z 35 — 바닥/충격파와 구체 사이. 아주 작고 어두운 먼지 48개.
    //  · 근평면(.sr-near)     z 42 — 구체 **앞**. 크고 흐린 보케 12개가 아래→위로 지나간다.
    // ⚠️ 근평면은 42다(그리드 40 < 42 < 타이틀·버튼 45) — 구체 앞은 지나되 글자 위는 안 지난다.
    //    이미 세 회차 연속으로 라벨 가독성이 지적된 화면이라 텍스트 앞을 흐리면 안 된다.
    // 배치는 빛가루와 같은 이유로 난수 대신 고정 수열이다(소환할 때마다 튀지 않게).
    summonDust() {
        let h = '';
        for (let i = 0; i < 48; i++) {
            h += `<i style="--x:${(i * 29) % 100}%;--y:${(i * 47) % 100}%;--s:${1 + (i * 7) % 2}px;`
               + `--d:${((i * 331) % 5200) / 1000}s;--dur:${5.2 + (i % 7) * 0.4}s"></i>`;
        }
        return `<div class="sr-dust">${h}</div>`;
    },
    summonNearField() {
        let h = '';
        for (let i = 0; i < 14; i++) {
            // 크기 6~14px · 흐림 6~10px · 알파 .25~.5 · 주기 3.5~6s (비평가 처방 범위 그대로)
            // ⚠️ x 는 균등이 아니라 **가운데로 몰아** 흩는다(8~88% 중 3/4가 22~78%). 근평면의
            //    일이 '피사체 앞을 지나는 것'이라 화면 끝만 훑으면 개수만 늘고 교차는 안 는다 —
            //    실측으로 x75 교차 프레임이 18% → 32%로 올랐다.
            const xs = [50, 18, 74, 34, 88, 62, 26, 8, 46, 70, 30, 58, 82, 40];
            h += `<i style="--x:${xs[i]}%;--s:${6 + (i * 5) % 9}px;`
               + `--bl:${6 + (i % 5)}px;--a:${(25 + (i * 7) % 26) / 100};`
               + `--d:${((i * 617) % 5800) / 1000}s;--dur:${3.5 + (i % 6) * 0.5}s"></i>`;
        }
        return `<div class="sr-near">${h}</div>`;
    },

    openSummonResult(kind, results) {
        if (!results || !results.length) return;
        const meta = this.SUMMON_KIND[kind] || this.SUMMON_KIND.skill;
        const rolls = this.summonEntries(kind, results);
        const entries = this.groupSummonEntries(kind, rolls, rolls.length >= this.SR_MERGE_FROM);
        const best = entries[entries.length - 1].rarity; // 오름차순 정렬이라 마지막이 최고 등급
        // 최고 등급이 전설 이상이고 그 셀이 하나뿐일 때만 홀드백 — 흔한 등급까지 뜸들이면 늘어진다
        const holdback = this.SR_HI_RARITIES.indexOf(best) >= 0 && entries[entries.length - 1].qty === 1;
        // 주역 셀 — 최고 등급이 전설 이상이면 마지막 셀이 '다른 사건'이 된다(전용 등장 비트).
        // 색·크기만 다른 같은 슬롯이면 '더 큰 것'일 뿐이라 위계가 사건으로 읽히지 않는다.
        const heroIdx = this.SR_HI_RARITIES.indexOf(best) >= 0 ? entries.length - 1 : -1;
        // 소량(≤10)에서도 주역은 단독 행을 차지한다 — 예전엔 한 줄 5열이 '원본 구성'이라
        // 주역을 줄 오른쪽 끝에 그대로 뒀는데, 그러면 ⑴ 최고 등급이 잔여 슬롯에 유기돼
        // 위계가 안 서고 ⑵ 오른쪽 끝 셀이라 광채·충격파가 화면 밖에서 잘리고
        // ⑶ 한 줄뿐이라 아래쪽 세로 밴드가 통째로 빈다 — 세 가지가 한 번에 걸렸다.
        // 랩 지점을 강제하는 빈 플렉스 아이템을 주역 앞에 끼워 행을 가른다.
        const heroRow = heroIdx > 0 && entries.length <= 10;
        const cells = entries.map((e, i) => {
            const hi = this.SR_HI_RARITIES.indexOf(e.rarity) >= 0;
            const rc = RARITY_CSS[e.rarity];
            const brk = (heroRow && i === heroIdx) ? '<div class="sr-break"></div>' : '';
            // 10차 잔여 ⑥(A ⓻) — 최고 등급이 **여러 셀**일 때 마지막 하나만 주역이 되고 나머지
            // 동급은 아래 등급과 똑같은 평범한 셀로 그려졌다("같은 신화가 159px vs 60px").
            // 실측(`probe-sr-peer.js`)으로도 동급 구체가 바로 아래 등급의 **1.02~1.04배**뿐이라
            // 사실상 구분이 없었다. 동급에 표식을 붙여 '최고 등급'임이 남게 한다.
            // ⚠️ 주역만큼 키우지는 않는다 — 주역이 '다른 사건'으로 읽히는 건 9차 [치명] 지적을
            //    받고 만들어 낸 성과다(크기 격차는 CSS 쪽 --peersz 로 절반만 좁힌다).
            const peer = heroIdx >= 0 && i !== heroIdx && e.rarity === best;
            // data-tier로 등급별 세기(크기·광채·광선)를 계단화한다 — 6등급이 2상태로 붕괴하지 않게
            const tier = RARITIES.indexOf(e.rarity);
            return `${brk}<div class="sr-cell${hi ? ' hi' : ''}${i === heroIdx ? ' heroic' : ''}${peer ? ' peer' : ''}" data-tier="${tier}"
                data-mat="${this.srMaterial(e.rarity)}"
                style="--i:${i};--rc:${rc};--rc-lite:${this.srHilite(rc, tier)};--rc-deep:${this.srShade(rc, -.62)};${this.chipVars(e.rarity)}">
                <div class="sr-orbwrap">
                    <span class="sr-ray"></span>
                    <span class="sr-beam"></span>
                    <span class="sr-ghost"></span>
                    <span class="sr-orb"><i class="sr-ico">${e.icon}</i></span>
                    <span class="sr-spark"></span>
                    ${e.qty > 1 ? `<b class="sr-qty">×${e.qty}</b>` : ''}
                    ${e.extra ? `<b class="sr-dup">${e.extra}</b>` : ''}
                    ${e.isNew ? '<span class="sr-new">NEW</span>' : ''}
                </div>
                <div class="sr-name"><span>${e.name}</span></div>
                <div class="sr-sub"><b class="sr-rk">${e.sub}</b></div>
            </div>`;
        }).join('');
        // 셀 수에 따라 크기 단계 — 묶음 덕분에 x75도 보통은 mid에서 멈춘다
        const size = entries.length === 1 ? ' one' : entries.length > 24 ? ' dense' : entries.length > 10 ? ' mid' : '';
        const cols = this.srCols(entries.length);
        // 한 줄짜리 결과(≤5개)는 아이콘 줄 위아래로 빈 남색 밴드가 구조적으로 남는다 —
        // 아래쪽은 소환진(룬 바닥)으로 받쳐 피사체가 떠 있지 않고 무대 위에 선 것으로 읽히게 한다.
        // 🚨 10차 비평가 A ⓸ [높음] "x75 저등급 판이 화면의 57%를 빈 그라데이션으로 남긴다".
        //    임계가 5였던 탓에 **6~10셀 판만 무대도 천개도 없이** 맨 그리드로 떠 있었다.
        //    재현: `S.summonCount=0` 로 x75를 굴리면 고유 항목이 6개로 묶여 `sr-grid`(mid 아님) +
        //    stage=false 가 된다 — A 가 캡처한 `skill-x75-3400` 이 바로 이 판이다.
        //    셀이 풀사이즈인 판(≤10)은 그리드 자체가 화면을 못 채우므로 무대가 필요하고,
        //    11셀 이상(mid/dense)은 셀 수로 화면이 차므로 지금처럼 무대 없이 둔다.
        const stage = entries.length <= 10;
        // 위쪽 밴드 — 주역(전설 이상)이 없으면 `herorow`가 안 걸려 결과가 한 줄로만 남고,
        // 아래는 소환진이 받치는데 **타이틀과 아이콘 줄 사이가 통째로 빈다**(7·8차 잔여 지적 ⓕ).
        // 소환진을 위아래로 짝지어 '문(게이트)'을 만든다 — 아이콘이 그 아래로 내려온 것으로 읽히고,
        // 늘어뜨린 빛발이 세로 구조를 만들어 밴드를 채운다.
        // 🚨 **주역이 있는 판을 제외했던 것이 9차 지적 ⑶('세로 공백')의 원인이었다.**
        //    예전 판단은 "주역 단독 행이 이미 그 자리를 쓰고, 둘을 겹치면 답답해진다"였는데,
        //    주역 행은 그리드 **아래쪽**에 서므로 위 밴드는 그대로 비어 있었다 — 오히려 주역 판이
        //    그리드가 길어져 **위 밴드만 홀로 남는** 최악의 배치가 된다. 실측(`probe-sr-band.js`,
        //    412x892): 저등급 판 위 밴드 구조도 4.53배 vs **주역 판 2.94배**(천개 도입 전 2.51 수준).
        //    지적을 받은 캡처가 바로 주역 판이었다. 이제 주역 판에도 천개를 세우되, 세로 예산이
        //    빠듯하므로 `compact`(납작한 아치 + 짧은 빛발)로 붙인다.
        const canopy = stage;
        // compact 는 '주역이 **단독 행**을 써서 그리드가 길어진 판'에만 필요하다.
        // x1(one)은 셀이 하나뿐이라 세로 예산이 넉넉하고, `.sr-body.stage.one .sr-canopy` 가
        // 특이도로 이겨 어차피 제 크기를 쓴다.
        const canopyCompact = heroRow;
        const m = this.els.summonResultModal;
        m.className = 'modal'; // hidden 해제 + 이전 done 상태 제거
        m.innerHTML = `
            <div class="sr-wrap">
                <div class="sr-rays"></div>
                <div class="sr-halo"></div>
                ${this.summonMotes()}
                ${this.summonDust()}
                <div class="sr-charge"></div>
                ${this.summonStreaks(rolls.length)}
                <div class="sr-shock"></div>
                <div class="sr-shock echo"></div>
                <div class="sr-relights"></div>
                <div class="sr-tierbreaks"></div>
                <div class="sr-idle"><i></i><i></i></div>
                <div class="sr-flash" style="--rc:${RARITY_CSS[best]}"></div>
                <div class="sr-wipe" style="--rc:${RARITY_CSS[best]}"></div>
                <div class="sr-head"><div class="sr-title">${(typeof IconGen !== 'undefined' && IconGen.img(meta.ico, 'sr-title-ico')) || meta.icon} ${meta.title} ×${rolls.length}</div></div>
                <div class="sr-body${stage ? ' stage' : ''}${stage && size === ' one' ? ' one' : ''}">
                    ${canopy ? `<div class="sr-canopy${canopyCompact ? ' compact' : ''}"><i></i><i></i><i></i><b></b></div>` : ''}
                    <div class="sr-grid${size}${heroRow ? ' herorow' : ''}" style="--cols:${cols}">${cells}</div>
                    ${stage ? '<div class="sr-floor"></div>' : ''}
                    ${stage ? this.summonStageStars() : ''}
                    ${entries.length === 1 ? this.summonSoloInfo(kind, results, entries[0]) : ''}
                </div>
                ${this.summonNearField()}
                <div class="sr-foot">
                    ${this.summonSummary(rolls)}
                    <div class="sr-hint">화면을 탭하면 건너뜁니다</div>
                    <button class="btn sr-ok" onclick="event.stopPropagation(); UI.closeSummonResult()">확인</button>
                </div>
            </div>`;
        // 뽑은 최고 등급을 배경에 반영한다(.done에서만 켜짐) — 쓰레기와 신화가 같은 화면이면
        // 결과창의 정서적 위계가 0이 된다
        const bc = RARITY_CSS[best], brgb = this.srRgb(bc);
        m.style.setProperty('--bg-a', this.srBlend('#24306a', bc, .24));
        m.style.setProperty('--bg-b', this.srBlend('#101740', bc, .16));
        m.style.setProperty('--halo', `rgba(${brgb[0]},${brgb[1]},${brgb[2]},.4)`);
        // ===== 등급 예고 — 공개 **전** 빌드업을 최고 등급에 물린다 (9차 비평가 B ⑴ [치명]) =====
        // 지적: 전원 일반인 판과 신화가 섞인 판의 620ms 프레임이 사실상 같은 화면이라,
        // 원신 긴장의 원천인 '색으로 미리 알려주기'가 통째로 없다.
        // ⚠️ 예전 판단("등급색을 쓰면 스포일러가 되니 빌드업은 중립")은 틀렸다 — 알려 주는 건
        //    '얼마나 센 게 온다'뿐이고 '무엇/어느 셀'은 끝까지 숨으므로 홀드백은 그대로 산다.
        // --pre-k(0=일반 … 1=신화) 하나로 4레이어(빛 모임·빛줄기·방사선/광원·충격파)의
        // 색과 세기를 함께 움직인다. k=0이면 전부 예전 중립값과 같아 저등급 판의 기준선이 유지된다.
        const pk = RARITIES.indexOf(best) / (RARITIES.length - 1);
        const pmid = this.srRgb(this.srBlend('#96beff', bc, pk));       // 빛 모임 중간 밴드
        const pline = this.srBlend('#dfeeff', this.srShade(bc, .3), pk); // 빛줄기·충격파 스트로크
        const pglow = this.srRgb(this.srBlend('#a0cdff', bc, pk));       // 그 둘의 광채
        const pray = this.srRgb(this.srBlend('#bed7ff', bc, pk));        // 배경 방사선
        m.style.setProperty('--pre-k', pk.toFixed(3));
        m.style.setProperty('--pre-sc', (1 + .22 * pk).toFixed(3));
        m.style.setProperty('--pre-mid', `rgba(${pmid.join(',')},.6)`);
        m.style.setProperty('--pre-line', pline);
        m.style.setProperty('--pre-glow', `rgba(${pglow.join(',')},${(.8 + .18 * pk).toFixed(2)})`);
        m.style.setProperty('--pre-ray', `rgba(${pray.join(',')},${(.5 + .22 * pk).toFixed(2)})`);
        m.style.setProperty('--pre-ray2', `rgba(${pray.join(',')},${(.3 + .2 * pk).toFixed(2)})`);
        m.style.setProperty('--pre-halo', `rgba(${brgb[0]},${brgb[1]},${brgb[2]},${(.3 + .16 * pk).toFixed(2)})`);
        // 배경 자체를 예고에 물린다 — 실측으로 확인한 유일한 '넓은 면적' 레버다.
        // ⚠️ 중앙 광원(.sr-halo)은 레버가 아니다: 바로 앞의 무대 받침(.sr-body::before,
        //    중앙 rgba(4,7,20,.58))에 가려 opacity를 극단까지 흔들어도 화면 평균이 안 움직인다
        //    (앞 세션 실측, TODO 진행 메모에 기록). 반대로 모달 배경은 팝업 주변부를 통째로
        //    차지해 순수 빌드업 프레임(430ms, 셀 0개)에서도 화면 평균을 실제로 움직인다.
        // 승격 단계는 남긴다 — 빌드업은 `.done` 의 45%만 물들고, 결과 공개 때 100%로 올라간다.
        const PRE_BG = .45;
        m.style.setProperty('--bg-pre-a', this.srBlend('#24306a', bc, .24 * PRE_BG * pk));
        m.style.setProperty('--bg-pre-b', this.srBlend('#101740', bc, .16 * PRE_BG * pk));
        // ===== 배수별 정점 에너지 (9차 비평가 A ⑵ [치명]) =====
        // 지적: "480ms 정점이 화면을 못 먹는다 — 평균 휘도 37.0, 고휘도 픽셀 2.05%뿐이고
        // **×5와 ×75의 정점 광량이 같아 배수에 따른 에너지 상승이 0**."
        // 실측으로 그대로 재현됐다(x1/x5/x25/x75 전부 평균 37.3~37.5·고휘도 2.08~2.10%, 배율 ×1.00).
        // ⚠️ **셀 수가 아니라 굴림 수로 잰다** — 대량 소환은 같은 항목을 한 셀로 묶으므로
        //    x25와 x75가 똑같이 3셀이 될 수 있다. 75개를 뽑았다는 사실이 빛에 담겨야 한다.
        // log 스케일: x1 → 0 · x5 → 0.37 · x25 → 0.75 · x75 → 1. 선형으로 두면 x1~x25가 뭉친다.
        m.style.setProperty('--sr-e', (Math.log(Math.max(1, rolls.length)) / Math.log(75)).toFixed(3));
        // 소환진도 결과 등급색으로 물들인다(.done에서만) — 배경/halo와 같은 승격 규칙
        // 선은 등급색 원본이 아니라 밝게 띄운 파생색 — 배경까지 그 등급색으로 물든 뒤라
        // 원색 그대로는 배경에 묻혀 소환진이 사라진다
        const lrgb = this.srRgb(this.srShade(bc, .55));
        m.style.setProperty('--floor-line-hi', `rgba(${lrgb[0]},${lrgb[1]},${lrgb[2]},.85)`);
        m.style.setProperty('--floor-fill-hi', `rgba(${brgb[0]},${brgb[1]},${brgb[2]},.26)`);
        this.clearSummonTimers();
        this._srDone = false;
        SFX.summonCharge(best);
        // 탈것 셀은 3D 썸네일 파이프라인이라 첫 굽기 전에는 이모지 폴백으로 깔려 있다 —
        // 슬롯과 같은 그림이어야 하므로(`summon-result-image-unify`) 여기서 구워 넣는다.
        // ⚠️ 바닥 반사 복제본(`fillSummonReflection`)보다 **먼저** 돌아야 복제본에도 그림이 실린다.
        this.hydrateMountThumbs(m);
        // 바닥 반사 복제본(.sr-reflect 안)이 아니라 진짜 그리드의 셀만 잡는다
        this._srCells = m.querySelectorAll('.sr-body > .sr-grid > .sr-cell');
        this._srEntries = entries;
        this.setSummonEjectPaths(m);
        const n = this._srCells.length;
        // 셀별 등장 시각 — 마지막 최고 등급 한 개만 홀드백만큼 더 뜸들인다.
        // 대량 판(>10)은 행 단위 웨이브 + 등급 챕터: 행이 40ms 스태거로 한꺼번에 착지하고,
        // 등급이 바뀌는 셀 앞에 짧은 정지를 넣어 그 자리에 등급색 링 플래시(챕터 구분)를 켠다.
        // ⚠️ 정지·행 오프셋은 전부 **누적 단조 증가**라야 한다 — tickSummonResult 가
        //    while(d[idx] <= elapsed) 로 인덱스 순서대로 켠다(오름차순 전제).
        this._srDelays = [];
        this._srTierBreaks = [];
        if (n <= 10) {
            for (let i = 0; i < n; i++) {
                this._srDelays.push(this.SR_CHARGE_MS + i * this.SR_SLOW_STEP + (holdback && i === n - 1 ? this.SR_HOLDBACK_MS : 0));
            }
        } else {
            let pause = 0;
            for (let i = 0; i < n; i++) {
                const boundary = i > 0 && RARITIES.indexOf(entries[i].rarity) > RARITIES.indexOf(entries[i - 1].rarity);
                if (boundary) pause += this.SR_TIER_PAUSE_MS;
                const d = this.SR_CHARGE_MS + Math.floor(i / cols) * this.SR_ROW_MS + (i % cols) * this.SR_ROW_STAG_MS
                    + pause + (holdback && i === n - 1 ? this.SR_HOLDBACK_MS : 0);
                // 플래시는 첫 셀보다 반 박자 앞 — '예고 → 그 등급 등장'의 인과가 서게
                if (boundary) this._srTierBreaks.push({ t: Math.max(this.SR_CHARGE_MS, d - 160), rarity: entries[i].rarity });
                this._srDelays.push(d);
            }
        }
        this._srHoldback = holdback;
        this._srHeroIdx = heroIdx;
        this.fillSummonRelights(m, entries);
        this.fillSummonTierBreaks(m);
        this._srStart = performance.now();
        this._srIdx = 0;
        this._srRaf = requestAnimationFrame(() => this.tickSummonResult());
    },

    // 아이콘 사출 경로 — 셀이 최종 슬롯에 그대로 '태어나면' 앞의 빛 모임과 인과로 안 묶인다
    // (실측: 등장 전후로 셀 중심이 11px밖에 안 움직이는데 광원 중심은 160px 옆에 있었다).
    // 광원(.sr-wrap 중심 = .sr-charge 방사 원점)에서 슬롯까지의 벡터를 셀마다 재서 --dx/--dy로
    // 심어 두면 등장 이징이 그 경로를 되짚어 날아온다.
    // ⚠️ 벡터를 100% 되짚으면 전 셀이 한 점에서 겹쳐 나와 5개가 한 덩어리로 보인다 —
    //    일부(EJECT)만 되짚어 '광원 쪽에서 밀려 나온' 인상만 남긴다.
    // ⚠️ px이 아니라 rem으로 심는다 — 뷰포트가 바뀌어도 경로가 셀 크기와 같은 비율로 움직인다.
    SR_EJECT: 0.62,
    setSummonEjectPaths(m) {
        const wrap = m.querySelector('.sr-wrap');
        if (!wrap || !this._srCells) return;
        const wr = wrap.getBoundingClientRect();
        if (!wr.width) return;   // 아직 레이아웃 전(숨겨진 상태) — 경로 없이 제자리 등장
        const ox = wr.left + wr.width / 2, oy = wr.top + wr.height / 2;
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        this._srCells.forEach(c => {
            const o = c.querySelector('.sr-orbwrap') || c;
            const r = o.getBoundingClientRect();
            const fx = (ox - (r.left + r.width / 2)) / rem;      // 광원까지의 **전체** 벡터
            const fy = (oy - (r.top + r.height / 2)) / rem;
            c.style.setProperty('--dx', (fx * this.SR_EJECT).toFixed(3) + 'rem');
            c.style.setProperty('--dy', (fy * this.SR_EJECT).toFixed(3) + 'rem');
            // 재점화 플래시는 **경로 시작점이 아니라 광원 자체**에 서야 한다 — --dx/--dy 는
            // 경로의 62%(SR_EJECT)라 거기에 세우면 광원이 아니라 셀 근처에서 반짝인다.
            c.style.setProperty('--ox', fx.toFixed(3) + 'rem');
            c.style.setProperty('--oy', fy.toFixed(3) + 'rem');
        });
    },

    // 셀별 광원 재점화 — 11차 비평가 A 1순위 [높음] "2~5번째 아이템은 꺼진 광원에서 나온다".
    // A 실측(광원 ±20px 평균 휘도): 2~4번 셀이 사출되는 900ms 내내 45.1~55.2 로, **시작 프레임의
    // baseline 53.3 보다도 낮았다.** 인과(빛→아이템)가 첫 셀과 주역에만 걸려 있던 것이다.
    // ⇒ 셀이 뜰 때마다 광원 자리에 그 셀의 등급색으로 짧은 플래시를 한 번 켠다.
    //
    // 🚨 **셀 안에 넣으면 안 된다(한 번 그렇게 넣었다가 실측 1.04~1.19x 로 헛돌았다).** 이유 셋:
    //   ⑴ `.sr-orbwrap` 이 `scale(--sz * --peersz)` 라 rem 오프셋이 같이 배율을 먹어 광원을 지나친다
    //   ⑵ 셀은 `srpop` 으로 광원→슬롯을 **날아가는 중**이라 플래시가 광원에 안 머문다
    //   ⑶ `.sr-cell` 기본 `opacity: 0` 이 곱해져 등장 초반에는 플래시까지 투명하다
    // 그래서 **`.sr-wrap` 직속**(광원 = wrap 중심)에 셀 수만큼 깔고 `animation-delay` 로 시각을 준다.
    // 시크 재현도 이쪽이 맞다 — CSS 애니메이션의 currentTime 은 delay 를 포함하므로,
    // 프로브/캡처 하네스가 `a.currentTime = T` 를 넣으면 지연이 저절로 반영된다.
    fillSummonRelights(m, entries) {
        const host = m.querySelector('.sr-relights');
        if (!host || !this._srDelays) return;
        host.innerHTML = this._srDelays.map((d, i) => {
            const e = entries[i];
            if (!e) return '';
            const rc = RARITY_CSS[e.rarity] || '#fff';
            const tier = RARITIES.indexOf(e.rarity);
            return `<span class="sr-relight" style="--rc:${rc};--rc-lite:${this.srHilite(rc, tier)};`
                + `--glow:${(0.16 + tier * 0.13).toFixed(2)};animation-delay:${d}ms"></span>`;
        }).join('');
    },

    // x1 하단 정보 — 11차 2인 일치 ⑵ 'x1 하단 25.3% 공백'(마지막 칩 바닥 y566 → [확인] 윗변
    // y756 사이 190px 무정보). 다연 화면은 같은 자리를 집계 칩이 채우므로 **x1 에만** 붙인다:
    // 요약 한 줄 · 보유 수 · [다시 소환]. 집계 칩(.sr-sum)과 같은 계약으로 .done 에서만 드러난다
    // (캐스케이드 중에 보이면 결과 스포일러).
    summonSoloInfo(kind, results, entry) {
        const r = results[0] || {};
        let line = '', own = '';
        if (kind === 'skill' && r.def) {
            const st = S.skills[r.def.id] || { level: r.level || 1, dupes: 0 };
            line = r.isNew ? '✨ 신규 스킬 획득!' : '이미 보유한 스킬 — 조각으로 적립됩니다';
            own = `보유 Lv.${st.level} · 조각 ${st.dupes}`;
        } else if (kind === 'mount') {
            const cnt = (S.mounts || []).filter(m => m.name === r.name).length;
            line = r.isNew ? '✨ 새 탈것 발견!' : '같은 종 — 합성 재료가 됩니다';
            own = `보유 ${cnt}마리`;
        } else {
            const cnt = (S.eggs || []).filter(e => e.rarity === r.rarity).length;
            line = '부화장에 넣어 부화시킬 수 있습니다';
            own = `보유 ${RARITY_KR[r.rarity] || ''} 알 ${cnt}개`;
        }
        return `<div class="sr-solo">
            <div class="sr-solo-line">${line}</div>
            <div class="sr-solo-own">${own}</div>
            <button class="btn sr-again" onclick="event.stopPropagation(); UI.onSummonAgain()">다시 소환</button>
        </div>`;
    },
    // [다시 소환] — 팝업을 닫고 같은 소환을 한 번 더. 반복 대상은 각 소환 핸들러가
    // openSummonResult 직전에 _srRepeat 로 남긴다(스킬은 젬/티켓 경로가 갈려 kind 만으로는
    // 원래 비용 경로를 복원할 수 없다). 재화 부족이면 해당 핸들러가 토스트를 띄운다.
    onSummonAgain() {
        const again = this._srRepeat;
        this.closeSummonResult();
        if (again) again();
    },

    // 등급 챕터 링 플래시 — 대량 판의 등급 경계 정지(SR_TIER_PAUSE_MS)를 채우는 예고 링.
    // 재점화(.sr-relights)와 같은 계약: `.sr-wrap` 직속(광원 = wrap 중심), 시각은 인라인
    // `animation-delay` — CSS 애니메이션 currentTime 이 delay 를 포함하므로 캡처/프로브 시크가
    // 손댈 것 없이 저절로 맞는다.
    fillSummonTierBreaks(m) {
        const host = m.querySelector('.sr-tierbreaks');
        if (!host) return;
        host.innerHTML = (this._srTierBreaks || []).map(b => {
            const rc = RARITY_CSS[b.rarity] || '#fff';
            const tier = RARITIES.indexOf(b.rarity);
            // 펄스(전화면·면적 담당) + 링(방향·챕터 기호 담당) 한 쌍 — 등급이 높을수록 세게
            return `<span class="sr-tierpulse" style="--rc:${rc};--rc-lite:${this.srHilite(rc, tier)};--pk:${(0.15 + tier * 0.04).toFixed(3)};animation-delay:${b.t}ms"></span>`
                + `<span class="sr-tierflash" style="--rc:${rc};--rc-lite:${this.srHilite(rc, tier)};animation-delay:${b.t}ms"></span>`;
        }).join('');
    },

    // 등장 캐스케이드 — 아이콘마다 setTimeout을 걸면 3D 렌더 루프에 밀려 대량 소환이 몇 초씩 끌린다.
    // 매 프레임 '지금까지 떴어야 할 셀'을 경과 시간으로 다시 판정해 밀린 만큼 따라잡는다.
    tickSummonResult() {
        const n = this._srCells.length;
        const elapsed = performance.now() - this._srStart;
        let loud = null; // 이번 프레임에 뜬 것 중 최고 등급
        while (this._srIdx < n && this._srDelays[this._srIdx] <= elapsed) {
            const e = this._srEntries[this._srIdx];
            this._srCells[this._srIdx].classList.add('on');
            if (!loud || RARITIES.indexOf(e.rarity) > RARITIES.indexOf(loud)) loud = e.rarity;
            this._srIdx++;
        }
        // 한 프레임에 여러 개가 몰려도 효과음은 최고 등급 하나만 (대량 소환에서 소리가 뭉치는 것 방지)
        if (loud) SFX.summonReveal(loud);
        // 홀드백 대기 구간은 '정지'가 아니라 '축적'이어야 한다 — 마지막 한 칸을 남긴 순간부터
        // 소환진이 돌고 눈금이 켜지고 비네트가 조여든다(예전엔 이 480ms가 완전 정지 프레임이라
        // 긴장이 아니라 렌더가 멈춘 것으로 읽혔다)
        const m = this.els.summonResultModal;
        if (this._srHoldback && this._srIdx === n - 1) m.classList.add('charging');
        // 주역 셀이 착지하는 순간, 그 셀 위치를 원점으로 화면을 등급색으로 한 번 훑는다
        // (화면 중앙 고정이면 오른쪽 끝에 착지한 셀과 터지는 자리가 어긋난다)
        if (loud && this._srIdx >= n && this._srHeroIdx >= 0) this.fireSummonHero();
        if (this._srIdx >= n) {
            this._srTimers.push(setTimeout(() => this.finishSummonResult(), this.SR_TAIL_MS));
            this._srRaf = 0;
            return;
        }
        this._srRaf = requestAnimationFrame(() => this.tickSummonResult());
    },

    // 주역(최고 등급) 착지 전용 비트 — 나머지 셀이 뒤로 물러나고(saturate/brightness/scale 후퇴)
    // 그 위로 광창 버스트 + 충격파 + 화면 킥이 350ms 동안 터진다. 등장 이징까지 같으면
    // 신화가 '같은 슬롯의 큰 구슬'로 끝나므로 사건 자체를 갈라 놓는다.
    fireSummonHero() {
        const m = this.els.summonResultModal, wrap = m.querySelector('.sr-wrap');
        const cell = this._srCells && this._srCells[this._srHeroIdx];
        if (!cell) return;
        const orb = cell.querySelector('.sr-orb');
        if (wrap && orb) {
            const wr = wrap.getBoundingClientRect(), cr = orb.getBoundingClientRect();
            wrap.style.setProperty('--fx', ((cr.left + cr.width / 2 - wr.left) / wr.width * 100).toFixed(1) + '%');
            wrap.style.setProperty('--fy', ((cr.top + cr.height / 2 - wr.top) / wr.height * 100).toFixed(1) + '%');
        }
        m.classList.remove('charging');
        m.classList.add('hero');
        if (this._srHoldback) m.classList.add('flash'); // 화면 훑는 섬광은 뜸들인 단독 등장일 때만
        // 🚨 10차 비평가 B ⓶ [치명] "x75 신화가 x5 신화보다 약하다 — 위계 역전"(가장 비싼 뽑기가
        //    가장 약한 순간이 된다). **원인은 여기 한 줄이었다**: `_srHoldback` 은
        //    `마지막 항목의 qty === 1` 을 요구하는데, 대량 소환은 같은 항목을 한 셀로 묶어
        //    마지막 신화 셀이 `×5` 가 된다 → holdback=false → **`.flash` 가 아예 안 걸린다.**
        //    실측: x5-hi `holdback:true` → classes `hero flash`, x75 `holdback:false` → `hero` 뿐.
        //    B 가 잰 "x5 60ms에 +111% vs x75 450ms에 걸쳐 +32%"의 정체가 이 클래스 유무다.
        // 그래서 홀드백이 없는 주역에도 정점을 준다. 단 **전 화면 섬광은 쓰면 안 된다** —
        // x75는 위쪽 20셀이 같이 하얗게 떠 등급 구분이 무너진다(9차에 이미 겪은 실패다).
        // 대신 **주역 셀 중심에서 번지는 가산 원형 와이프**라 정점 순간에는 반경이 아직 작다.
        else m.classList.add('wipe');
    },

    // 연출 종료 — 힌트를 감추고 [확인]을 띄운다
    finishSummonResult() {
        this._srDone = true;
        this.els.summonResultModal.classList.remove('charging');
        this.els.summonResultModal.classList.add('done');
        this.buildSummonReflection();
    },

    // 아이콘 줄 아래에 남는 빈 밴드를 바닥 반사로 채운다(한 줄 결과 = 소환진 무대일 때만).
    // 그리드를 복제해 뒤집고 흐리는 방식 — 거울상 글자는 읽히지도 않고 노이즈만 되므로
    // 이름·등급·배지는 떼고 구체만 남긴다.
    buildSummonReflection() {
        const body = this.els.summonResultModal.querySelector('.sr-body.stage');
        if (!body || body.querySelector('.sr-reflect')) return;
        const grid = body.querySelector('.sr-grid');
        if (!grid || !grid.querySelector('.sr-orbwrap')) return;
        const clone = grid.cloneNode(true);
        clone.querySelectorAll('.sr-cell').forEach(c => { c.classList.add('on'); c.classList.remove('heroic'); });
        clone.querySelectorAll('.sr-name, .sr-sub, .sr-new, .sr-qty, .sr-dup, .sr-ray, .sr-beam, .sr-ghost, .sr-spark')
            .forEach(e => e.remove());
        const ref = document.createElement('div');
        ref.className = 'sr-reflect';
        // ⚠️ 반사면은 '구체 바로 아래'가 아니라 '셀 줄 아래'다 — 구체 밑에는 불투명한 이름판이
        // 깔려 있어 그 자리에 두면 반사가 통째로 가려진다(실측 캡처에서 확인). 셀 줄이 끝나는
        // 지점에서 시작해 소환진 위로 상이 고이게 한다.
        ref.style.top = (grid.offsetTop + grid.offsetHeight - 8) + 'px';
        ref.appendChild(clone);
        body.appendChild(ref);
    },
    // 오버레이 탭: 연출 중이면 스킵(전부 즉시 표시), 이미 끝났으면 닫기
    onSummonResultTap() {
        if (this._srDone) { this.closeSummonResult(); return; }
        this.clearSummonTimers();
        this.els.summonResultModal.querySelectorAll('.sr-body > .sr-grid > .sr-cell').forEach(el => el.classList.add('on'));
        this._srIdx = this._srCells ? this._srCells.length : 0;
        if (this._srHeroIdx >= 0) this.fireSummonHero(); // 스킵해도 주역 비트는 건너뛰지 않는다
        this.finishSummonResult();
    },
    clearSummonTimers() {
        this._srTimers.forEach(clearTimeout); this._srTimers = [];
        if (this._srRaf) { cancelAnimationFrame(this._srRaf); this._srRaf = 0; }
    },
    closeSummonResult() {
        this.clearSummonTimers();
        this._srDone = false;
        this._srHeroIdx = -1;
        this._srCells = null;
        const m = this.els.summonResultModal;
        m.className = 'modal hidden';
        m.removeAttribute('style');
        m.innerHTML = '';
    },

    init() {
        this.installScrollKeeper(); // render* 전부를 스크롤 보존으로 감싼다 (init 최초 1회)
        this.paintWaypointIcons();  // index.html 의 이모지 자리를 IconGen 아이콘으로 채운다
        const $ = id => document.getElementById(id);
        this.els = {
            topbar: $('topbar'), stageLabel: $('stage-label'), wavePips: $('wave-pips'),
            bossWarn: $('boss-warning'),
            dmgFlash: $('dmg-flash'), lootFeed: $('loot-feed'), skillBar: $('skill-bar'),
            toasts: $('toasts'), toastsCombat: $('toasts-combat'), offlineBtn: $('offline-btn'),
            equipSheet: $('equip-sheet'),
            panels: { summon: $('panel-summon'), debug: $('panel-debug') },   // '방'(menu) 탭 제거 (사용자 지시 2026-08-18)
            petsPanel: $('panel-pets'), skillsPanel: $('panel-skills'), techPanel: $('panel-tech'),
            craftModal: $('craft-modal'), offlineModal: $('offline-modal'),
            dungeonModal: $('dungeon-modal'), dungeonDetailModal: $('dungeon-detail-modal'),
            dungeonClearModal: $('dungeon-clear-modal'),
            mountModal: $('mount-modal'), mountUpgradeModal: $('mount-upgrade-modal'), ascendModal: $('ascend-modal'),
            stubModal: $('stub-modal'),
            forgeInfoModal: $('forge-info-modal'), forgeItemModal: $('forge-item-modal'),
            detailModal: $('detail-modal'),
            autoForgeModal: $('autoforge-modal'),
            petUpgradeModal: $('pet-upgrade-modal'),
            leagueModal: $('league-modal'), passModal: $('pass-modal'), shopModal: $('shop-modal'),
            questModal: $('quest-modal'),
            profileModal: $('profile-modal'), playerInfoModal: $('player-info-modal'),
            chatPreview: $('chat-preview'), chatModal: $('chat-modal'),
            gearDetailModal: $('gear-detail-modal'),
            summonResultModal: $('summon-result-modal'),
        };
        this.els.offlineBtn.addEventListener('click', () => this.onClaimOffline());
        document.querySelectorAll('#tabbar button').forEach(btn => {
            btn.addEventListener('click', () => this.onTabClick(btn.dataset.tab));
        });
        this.hydrateTabIcons();
        this.renderTopBar();
        this.renderSkillBar();
        this.renderEquipSheet();
        this.renderChatPreview();
        this.watchTabX();
        // 망치 수 드롭다운 바깥 클릭 시 닫힘 (자동 제련 팝업)
        document.addEventListener('click', e => {
            if (this._afDdOpen && !e.target.closest('.af-dd')) { this._afDdOpen = false; this.renderAutoForge(); }
        });
        // 비교 팝업 딤 클릭 = 보류 (사용자 지시 2026-08-17) — 강제 선택 대신 '나중에 결정'
        this.els.craftModal.addEventListener('click', e => this.onCraftDimClick(e));
    },

    // 탭바 이모지(⚔️💀🧪🏪🐞)를 IconGen 캔버스 아이콘으로 교체한다.
    // ⚠️ 반드시 refreshTabX() 보다 먼저(= init 안에서) 부를 것 — refreshTabX 는 ✕ 상태로 바꿀 때
    //    버튼 innerHTML 을 dataset.label 에 넣어 두고 되돌리므로, 그때 이미 아이콘이 박혀 있어야
    //    ✕ 를 닫은 뒤에도 아이콘이 살아 돌아온다(이모지로 되돌아가지 않는다).
    hydrateTabIcons() {
        if (typeof IconGen === 'undefined') return;
        document.querySelectorAll('#tabbar button[data-ico]').forEach(btn => {
            const ico = IconGen.tab(btn.dataset.ico.replace(/^tab_/, ''));
            if (!ico) return;                       // 생성 실패 시 이모지 폴백을 그대로 둔다
            const label = btn.querySelector('span');
            btn.innerHTML = ico + (label ? label.outerHTML : '');
        });
    },

    // 하단 탭 클릭: PVP/던전/상점은 팝업, 나머지(소환·디버그)는 시트 토글(다시 누르면 닫힘).
    // 상호 배타(사용자 지시): 다른 탭 것을 열기 전에 이전 탭이 소유한 열린 팝업을 전부 닫는다.
    onTabClick(tab) {
        // 빨간 X 상태의 탭 = 닫기 버튼
        const btn = document.querySelector(`#tabbar button[data-tab="${tab}"]`);
        if (btn && btn.classList.contains('tab-x')) { this.closeOpened(); return; }
        this.closeAllTabSurfaces();
        if (tab === 'dungeon') { this.switchTab(null); this.openDungeons(); return; }
        if (tab === 'quest') { this.switchTab(null); this.openQuests(); return; }   // 반복 퀘스트 (사용자 지시 2026-08-18)
        if (tab === 'shop') { this.switchTab(null); this.openShop(); return; }
        if (tab === 'pvp') { this.switchTab(null); this.openLeague(); return; }   // PVP = 리그 도전 (사용자 지시 2026-08-18)
        this.switchTab(this.activeTab === tab ? null : tab);
    },
    // 탭 전환 공통 정리 — 탭이 소유한 전체화면 모달과 그 위에 겹친 하위 상세 팝업 일괄 닫기 (전투 씬은 무관)
    // MODAL_TAB에 없는 모달도 여기서 닫아야 한다: 이 4종은 특정 탭 소유가 아니라 메인 화면에서도 뜨므로
    // MODAL_TAB에 넣으면 엉뚱한 탭에 빨간 ✕가 붙는다. 대신 목록으로만 관리한다.
    // (QA 5차 실측: 안 닫혀서 장비 상세 카드가 소환 서브탭을, 오프라인 보상 카드가 화면 절반을 덮어 조작을 막았다)
    // '방'(menu) 탭 삭제(사용자 지시 2026-08-18)로 소유 탭이 사라진 8종도 여기로 내렸다.
    // 전부 자체 ✕/◀ 닫기 버튼이 있어 탭바 빨간 ✕가 없어도 갇히지 않는다 — 필요한 건
    // '탭을 옮기면 접힌다'는 동작뿐이고, 그건 MODAL_TAB이 아니라 이 목록이 담당한다.
    EXTRA_TAB_SURFACES: ['detail-modal', 'stub-modal', 'gear-detail-modal', 'offline-modal', 'ascend-modal',
        'mount-modal', 'mount-upgrade-modal', 'profile-modal', 'player-info-modal',
        'chat-modal', 'forge-info-modal', 'forge-item-modal', 'autoforge-modal'],
    closeAllTabSurfaces() {
        this.dismissCraftBatch();   // 팝업으로 넘어가는 경로도 같다 — 카드판을 새 팝업 위에 남기지 않는다
        // 제작 비교 팝업만은 그냥 숨기면 제작한 장비가 사라진다 — 자동 판정으로 정리한 뒤 닫는다
        this.resolvePendingCraft();
        for (const id of [...Object.keys(this.MODAL_TAB), ...this.EXTRA_TAB_SURFACES]) {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        }
    },

    // 제작 비교 팝업(craft-modal)은 판매/장착 강제 선택 팝업이라 닫기 버튼이 없다.
    // 탭 전환처럼 팝업을 강제로 접는 경로에서 그냥 숨기면 _pendingItem이 장착도 판매도 안 된 채
    // 사라져 제작한 장비가 유실된다. 그래서 오토포지와 같은 기준(Forge.autoResolve —
    // 장착품보다 강하면 장착 후 기존품 판매, 아니면 판매)으로 처리하고 결과를 토스트로 알린다.
    // 대기 중인 제작품은 메모리(_pendingItem)와 세이브(S.pendingCraft) 두 곳에 같이 둔다.
    // 메모리만 두면 새로고침·탭 종료에서 해머만 소모되고 결과물이 사라지고(QA 7차),
    // 세이브만 두면 팝업이 참조할 대상이 없다. 항상 이 두 함수로만 세우고 지운다.
    setPendingCraft(item) {
        this._pendingItem = item;
        S.pendingCraft = item;
        saveGame();   // 해머 차감과 대기품을 같은 저장에 묶는다 — 여기서 죽어도 둘 다 남거나 둘 다 없다
    },
    clearPendingCraft() {
        const item = this._pendingItem;
        this._pendingItem = null;
        S.pendingCraft = null;
        // '스왑으로 내려온 옛 장비' 표식은 대기품일 때만 의미가 있다. 지우지 않으면 이 장비가
        // 다시 장착될 때 S.equipment까지 표식을 달고 들어간다(자동 판정 경로 포함).
        if (item) delete item._swapped;
        return item;
    },
    // 자동 제련 통과분 대기 큐 (autoforge-show-all-cards 3차 사양 2026-08-19).
    // 카드 단계에서 필터를 통과한 장비는 **팝업을 띄우지 않고 여기 쌓였다가**, 사이클 카드가 다
    // 지나간 뒤 하나씩 비교 팝업으로 처리된다. 대기품 슬롯(pendingCraft)이 1개뿐이라 큐는 별도
    // 필드에 둔다 — 메모리에만 두면 연출 도중 새로고침에 통과분이 통째로 증발하므로(해머만 소모)
    // 세이브(S.autoMatchQueue)에 같이 남기고 부팅 때 이어서 처리한다. 보류 '보관함' UI가 아니라
    // 배치가 끝나면 비는 처리 대기열이다.
    queueAutoMatch(item) {
        if (this._pendingItem === item) this.clearPendingCraft();   // 대기품 1슬롯을 비우고 큐로 옮긴다
        if (!Array.isArray(S.autoMatchQueue)) S.autoMatchQueue = [];
        S.autoMatchQueue.push(item);
        saveGame();   // 큐 적재와 해머 차감을 같은 저장에 묶는다
    },
    // 큐에서 하나 꺼내 비교 팝업으로 띄운다. 시퀀스가 돌지 않아도(새로고침 복원 등) 동작한다.
    openNextAutoMatch() {
        // 보류 모드(딤으로 전부 보류)면 팝업을 자동으로 열지 않는다 — 앞의 한 개만 모루 자리 카드로
        // 올려 두고, 그 카드를 누를 때 비교 팝업이 뜬다 (autoforge-dim-hold-all 2026-08-19).
        if (S.autoMatchHeld) { this.promoteHeldToSlot(); return false; }
        if (this._pendingItem) return false;             // 대기품이 있으면 그것부터 처리
        const q = Array.isArray(S.autoMatchQueue) ? S.autoMatchQueue : (S.autoMatchQueue = []);
        while (q.length) {
            const item = q.shift();
            // 손상 세이브 방어 — `restorePendingCraft`·`drainAutoBatch` 와 **같은 검사**를 쓴다
            // (boot-pending-craft-unguarded). `slot` 만 보면 `subs` 없는 항목이 그대로
            // `showCraftModal → itemCardHTML` 로 가 던지고, 이 경로도 `boot()` 안에서 불린다.
            if (!this.isForgeShaped(item)) { console.error('openNextAutoMatch: 제작물의 최소 형태가 아닌 큐 항목을 버렸다 —', JSON.stringify(item)); continue; }
            this.setPendingCraft(item);                  // saveGame 포함 — 큐에서 뺀 것과 대기품을 같은 저장에
            this.showCraftModal(item);
            this.renderEquipSheet();
            return true;
        }
        saveGame();
        return false;
    },
    // 보류 목록의 앞 한 개를 모루 자리(대기품 1슬롯)로 올린다. 팝업은 열지 않는다 —
    // 보류는 '지금 안 고르겠다'는 의사표시라, 고르는 시점은 카드를 누를 때다.
    // 큐가 비면 보류 모드도 끝난다(다음 자동 제련이 평소대로 팝업을 몰아 열 수 있게).
    promoteHeldToSlot() {
        if (this._pendingItem) return false;             // 모루 자리가 이미 찼다
        const q = Array.isArray(S.autoMatchQueue) ? S.autoMatchQueue : (S.autoMatchQueue = []);
        while (q.length) {
            const item = q.shift();
            // 손상 세이브 방어 — 위 `openNextAutoMatch` 와 같은 검사(boot-pending-craft-unguarded).
            // 여기서 통과시키면 모루 자리 카드를 누르는 순간 같은 자리에서 던진다.
            if (!this.isForgeShaped(item)) { console.error('promoteHeldToSlot: 제작물의 최소 형태가 아닌 큐 항목을 버렸다 —', JSON.stringify(item)); continue; }
            this.setPendingCraft(item);                  // saveGame 포함 — 큐에서 뺀 것과 대기품을 같은 저장에
            this.renderEquipSheet();
            return true;
        }
        S.autoMatchHeld = false;
        saveGame();
        return false;
    },
    // 보류 중인 개수 = 모루 자리 카드 1개 + 아직 카드로 올라오지 않은 나머지
    heldCount() {
        return (this._pendingItem ? 1 : 0) + (Array.isArray(S.autoMatchQueue) ? S.autoMatchQueue.length : 0);
    },
    // 부팅 시 복원: 지난 세션이 선택하지 않고 떠난 제작품이 있으면 비교 팝업을 그대로 다시 띄운다.
    // (자동 판정으로 정리하지 않는 이유 — 선택은 사용자 몫이고, 강제 판정은 '내가 안 고른 장비가 팔렸다'가 된다)
    restorePendingCraft() {
        // 카드판이 떠 있는 동안 새로고침·탭종료로 떠난 배치를 먼저 정리한다 — 해머는 이미 나갔으므로
        // 그냥 두면 그 장비가 통째로 증발한다(이 항목의 지속성 난점 그 자체). 카드는 이미 지나간
        // 연출이라 다시 띄우지 않고, 결과만 평소 규약대로 흘려보낸다(통과분은 큐 → 아래에서 팝업).
        this.drainAutoBatch();
        const item = S.pendingCraft;
        // 🚨 가드는 `drainAutoBatch` 와 **같은 '제작물의 최소 형태' 검사**여야 한다
        //    (boot-pending-craft-unguarded, 2026-08-20 QA 20차 실측). 종전 가드가
        //    `!item || !item.slot` 둘뿐이라 `subs` 없는 대기품이 그대로 통과해
        //    `showCraftModal → itemCardHTML` 의 `item.subs.length` 에서 던졌고,
        //    그 예외가 `boot()` 를 통째로 끊어 **논리 틱·rAF 루프·30초 자동 저장이 아예
        //    등록되지 않았다** — 화면은 다 그려져 있는데 게임이 멈추고, 자동 저장이 없으니
        //    오염된 세이브가 덮어써지지 않아 새로고침해도 영원히 같은 상태로 부팅된다.
        //    바로 옆 `autoBatch` 는 `isForgeShaped` 로 이미 방어돼 있었다 — 같은 규칙으로 맞춘다.
        // ⚠️ **조용히 버리지 말 것** — 이 필드가 있는 이유가 "안 고른 장비가 소리 없이 사라지는 것"을
        //    막는 것이다(`pendingCraft` 신설 메모). 콘솔에 짖고 토스트로도 알린다.
        if (item && !this.isForgeShaped(item)) {
            console.error('restorePendingCraft: 제작물의 최소 형태가 아닌 대기품을 버렸다 —', JSON.stringify(item));
            S.pendingCraft = null;
            this._pendingItem = null;
            this.toast('⚠️ 손상된 제작 대기품 하나를 복원하지 못했습니다');
            saveGame();
            this.openNextAutoMatch();
            return;
        }
        if (!item) { this.openNextAutoMatch(); return; }   // 대기품이 없으면 큐에 남은 통과분부터
        this._pendingItem = item;
        // 보류 상태로 떠난 것 — 모루 자리 카드로만 두고 누를 때 연다. 팝업을 안 띄우는 대신
        // **여기서 장비 시트를 다시 그려야** 한다: 부팅 렌더는 대기품을 세우기 전에 이미 끝나
        // 모루 그림이 놓여 있어, 그냥 두면 보류품이 있는데 모루가 보이고 카드는 다음 렌더까지 안 나온다.
        if (S.autoMatchHeld) { this.renderEquipSheet(); return; }
        this.showCraftModal(item);
    },
    resolvePendingCraft() {
        // 판정 기준은 '팝업이 열려 있는가'가 아니라 '대기품이 있는가'다 — 모루 타격 연출(0.72초)
        // 동안에는 대기품은 이미 있는데 팝업이 아직 안 떠서, 모달 기준으로 보면 이 경로가 통째로
        // 새어 나갔다(탭을 옮겨도 정리되지 않고, 연출이 끝나면 엉뚱한 탭 위에 팝업이 떴다).
        // 통과분 대기 큐도 같이 정리한다 — 큐에 쌓인 것도 '아직 안 고른 제작품'이라 그냥 두면
        // 탭을 옮긴 뒤 엉뚱한 화면에서 팝업이 줄줄이 뜬다(대기품과 같은 기준으로 판정한다).
        // 보류 모드(딤으로 전부 보류)만은 예외다 (autoforge-dim-hold-all 2026-08-19): 보류의 뜻이
        // '나중에 내가 고른다'인데 탭을 옮겼다고 팔아 버리면 사용자가 고를 기회를 통째로 잃는다.
        // 아래 자동 판정이 원래 막으려던 것은 '엉뚱한 탭 위로 팝업이 새는 것'인데, 보류 모드는
        // 애초에 팝업을 자동으로 열지 않으므로(openNextAutoMatch) 팝업만 접어 두면 샐 곳이 없다.
        // 카드판이 떠 있는 중에 탭을 옮겼다면 그 배치도 '아직 처리 안 된 제작품'이다 — 대기품·큐와
        // 같은 기준으로 먼저 흘려보낸다(통과분은 큐로 들어가 아래 큐 처리에 그대로 얹힌다).
        this.drainAutoBatch();
        if (S.autoMatchHeld) {
            this.cancelAnvilStrike();
            const hm = this.els.craftModal;
            if (hm) hm.classList.add('hidden');
            saveGame();
            return;
        }
        const queued = Array.isArray(S.autoMatchQueue) ? S.autoMatchQueue.splice(0) : [];
        for (const q of queued) {
            if (!q || !q.slot) continue;
            Forge.autoResolve(q);
            // 자동 제련이 스스로 처리한 결과 토스트는 생략(사용자 지시 autoforge-toast-suppress).
            // 밀린 큐가 한 틱에 몰려 풀리면 이 배치가 토스트를 무더기로 쌓던 원인 자리였다.
        }
        if (!this._pendingItem) { if (queued.length) { this.renderTopBar(); this.renderEquipSheet(); saveGame(); } return; }
        this.cancelAnvilStrike();
        const m = this.els.craftModal;
        if (m) m.classList.add('hidden');
        const item = this.clearPendingCraft();
        if (!item) { saveGame(); return; }
        Forge.autoResolve(item);   // 처리 토스트 생략(autoforge-toast-suppress)
        this.renderTopBar();
        this.renderEquipSheet();
        saveGame();
    },

    switchTab(tab) {
        this.activeTab = tab;
        this.dismissCraftBatch();   // 자동 제련 카드판이 떠 있었다면 새 화면을 덮기 전에 걷는다
        document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        for (const [k, p] of Object.entries(this.els.panels)) p.classList.toggle('open', k === tab);
        if (tab === 'summon') this.switchSummonSub(this._summonSub || 'skills'); // 원본 서브탭 순서상 스킬이 첫 탭
        if (tab === 'debug') this.renderDebug();
        this.refreshTabX();
    },

    // ---- 탭바: 팝업이 열리면 해당 탭이 빨간 X로 바뀐다 (UI-SPEC 공통 레이아웃) ----
    // 팝업 여닫는 지점이 20곳이 넘어 호출부를 일일이 고치는 대신 표시 상태 변화를 관찰한다.
    MODAL_TAB: {
        'dungeon-modal': 'dungeon', 'dungeon-detail-modal': 'dungeon',
        'shop-modal': 'shop', 'quest-modal': 'quest', 'league-modal': 'pvp', 'pass-modal': 'pvp',
        'pet-upgrade-modal': 'summon',
    },
    watchTabX() {
        const obs = new MutationObserver(() => this.refreshTabX());
        document.querySelectorAll('.modal').forEach(m => obs.observe(m, { attributes: true, attributeFilter: ['class'] }));
    },
    // 지금 열린 팝업의 딤이 **탭바 위를 덮고 있나** (= 탭바 ✕ 를 그려도 안 눌린다).
    // 🚨 이 검사가 없어서 `tabx-dead-under-dim` 이 났다 (2026-08-20 QA 20차 실측): `modal-dim-tabbar`
    //    교정이 '진짜 팝업' 계열을 `z-index:40` 으로 올렸는데 `#tabbar` 는 30 이라, 그 계열과
    //    `MODAL_TAB` 이 겹치는 셋(`dungeon-detail-modal`→dungeon · `pass-modal`→pvp ·
    //    `pet-upgrade-modal`→summon)에서 **✕ 가 딤 아래 깔렸다.** 그림은 멀쩡히 보이는데
    //    `elementFromPoint` 는 팝업을 집고, 진짜 마우스 탭도 안 먹는 **'보이는데 안 먹는 버튼'**이
    //    됐다. 같은 그림의 버튼이 상점·던전 목록에서는 먹으니 더 나쁘다.
    // 🔑 **하드코딩 목록 대신 계산된 z-index 를 읽는다** — CSS 의 z 목록과 JS 의 `MODAL_TAB` 이
    //    서로를 모르는 게 이 결함의 뿌리였다. 실제 z 를 비교하면 CSS 만 바뀌어도 따라온다.
    // 🚫 **탭바 z 를 도로 올리는 방향은 금지** — `modal-dim-tabbar` 의 원본 실측 결론을 되돌린다.
    tabbarCovered() {
        const tb = document.getElementById('tabbar');
        if (!tb) return false;
        const tz = parseInt(getComputedStyle(tb).zIndex, 10) || 0;
        for (const m of document.querySelectorAll('.modal:not(.hidden)')) {
            const cs = getComputedStyle(m);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            if ((parseInt(cs.zIndex, 10) || 0) > tz) return true;
        }
        return false;
    },
    // 지금 열려 있는 팝업/시트가 속한 탭 (없으면 null)
    openedTab() {
        // 딤이 탭바 위면 ✕ 를 **아예 그리지 않는다** — 안 먹는 어포던스를 보여 주느니 평소 탭이 낫다.
        // (그 팝업들은 카드 안에 자체 ✕ 가 있어 닫는 길은 그대로 있다.)
        if (this.tabbarCovered()) return null;
        for (const id in this.MODAL_TAB) {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) return this.MODAL_TAB[id];
        }
        return this.activeTab; // 하단 시트(소환/방/디버그)
    },
    refreshTabX() {
        const xTab = this.openedTab();
        document.querySelectorAll('#tabbar button').forEach(b => {
            const isX = !!xTab && b.dataset.tab === xTab;
            b.classList.toggle('tab-x', isX);
            if (isX && !b.dataset.label) b.dataset.label = b.innerHTML;
            if (isX) b.innerHTML = '<span class="tab-x-mark">' + IconGen.img('xmark') + '</span>';
            else if (b.dataset.label) { b.innerHTML = b.dataset.label; delete b.dataset.label; }
        });
    },
    /* 던전 클리어 보상 팝업을 **정상 종결**시킨다(수령 연출 없이 페이즈만 푼다).
     *
     * 🚨 **없으면 소프트락이다**(slug `dungeon-clear-popup-softlock`, 2/2 재현). 이 팝업은 사양상
     * *"배경 탭으로 닫히지 않는다"*(index.html 모달 블록 주석) — [보상 수령]만이 출구고, 그 버튼이
     * `Combat.finishDungeonClear()` 로 본대 복귀를 마저 돈다. 그런데 아래 `closeOpened()` 의
     * **무차별 `.modal` 숨김**이 이 팝업까지 걷어 가면 **팝업만 사라지고 `Combat.phase` 는
     * `'dungeonClear'` 로 남는다.** 그 페이즈는 **타이머가 없어**(combat.js `stageClear`) 스스로 안 풀리고,
     * 푸는 곳이 `onDungeonClearConfirm()` 하나뿐이라 **전투 루프가 영구히 선다** — 방치형인데
     * 방치 수익이 0이 된다(실측: 20초 방치 코인 +0, 정상 대조군 +200). 새로고침 말고는 회복 경로가 없다.
     *
     * 제작 대기품이 같은 함수에서 `resolvePendingCraft()` 로 정리되는 것과 **같은 짝**이다 —
     * 던전 클리어에만 그 짝이 없었다.
     * ⚠️ `closeAllTabSurfaces()` 에는 넣지 않는다: 그쪽은 id 목록으로만 닫아 이 팝업을 안 건드리므로
     *    탭을 **여는** 동작에서는 터지지 않는다(팝업이 상점 위에 그대로 남는 게 맞는 동작이다). */
    resolveDungeonClear() {
        if (this._dgclearBusy) return;  // 수령 연출이 이미 돈다 — 그 타이머가 finishDungeonClear 를 부른다
        const modal = this.els.dungeonClearModal;
        if (!modal || modal.classList.contains('hidden')) return;
        // 보상 자체는 `Dungeons.onClear()` 가 팝업을 띄우기 전에 이미 지급·저장했다 — 여기서 닫아도
        // 손실이 없다. 수령 연출(rewardBurst)은 **일부러 안 태운다**: 사용자가 팝업을 떠나기로 한
        // 것이라, 이미 넘어간 화면 위에서 재화 흡수 연출이 튀는 게 더 이상하다.
        modal.classList.add('hidden');
        modal.classList.remove('dgclear-out');
        const card = modal.querySelector('.dgclear-card');
        if (card) card.classList.remove('leaving');   // 다음 클리어에서 카드가 가라앉은 채로 뜨지 않게
        Combat.finishDungeonClear();                 // 자체 페이즈 가드가 있어 중복 호출에 안전하다
    },
    // X 상태의 탭을 누르면 열린 것을 닫는다
    closeOpened() {
        this.resolvePendingCraft(); // 여기도 전 모달 일괄 숨김이라 제작 대기품 유실 경로가 같다
        this.resolveDungeonClear(); // 같은 이유 — 아래 일괄 숨김이 던전 클리어 팝업을 먹으면 소프트락
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        this.switchTab(null);
    },

    // 팝업 표시 공통 경로 — 열림 애니메이션(cardpop)은 '처음 열릴 때 1회만'.
    // 이미 열린 팝업의 내용 갱신(재렌더 후 재호출)은 opening을 다시 붙이지 않아 깜빡임이 없다 (사용자 지시).
    // ---- 스크롤 위치 보존 (사용자 지시 2026-08-17) ----
    // 액션 핸들러 대부분이 화면을 innerHTML로 통째 재렌더한다. 그러면 스크롤 컨테이너가
    // 새 노드로 교체되면서 scrollTop이 0이 돼 "버튼만 눌렀는데 목록이 맨 위로 튀는" 현상이 생긴다.
    // 노드 참조는 교체와 함께 죽으므로, 재렌더 직전 위치를 '구조 선택자'로 적어 두고
    // 재렌더 후 같은 자리를 다시 찾아 되돌린다.
    domPath(el) {
        if (el.id) return '#' + CSS.escape(el.id);
        const parts = [];
        for (let n = el; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
            if (n.id) { parts.unshift('#' + CSS.escape(n.id)); break; }
            if (!n.parentElement) break;
            const i = Array.prototype.indexOf.call(n.parentElement.children, n) + 1;
            parts.unshift(n.tagName.toLowerCase() + ':nth-child(' + i + ')');
        }
        return parts.join(' > ');
    },
    // fn 실행 전후로 '지금 실제로 스크롤돼 있는' 컨테이너의 위치를 보존한다.
    // 스크롤이 0인 요소는 기록하지 않으므로 새로 열리는 화면은 그대로 맨 위에서 시작한다.
    keepScroll(fn) {
        const saved = [];
        for (const el of document.querySelectorAll('*')) {
            // 스크롤을 스스로 관리하는 컨테이너(data-own-scroll)는 건너뛴다. 채팅 리스트가 그렇다 —
            // '바닥에 붙어 있으면 새 메시지를 따라간다'는 정책이 따로 있는데, 여기서 렌더 직전 위치를
            // 되돌려 놓으면 그 정책이 매번 무효가 돼 새 메시지가 화면 밖에 쌓인다(실측: 바닥 419 로
            // 민 직후 keepScroll 이 옛 367 로 복구).
            if (el.hasAttribute('data-own-scroll')) continue;
            if (el.scrollTop > 0) saved.push([this.domPath(el), el.scrollTop]);
        }
        try { return fn(); }
        finally {
            for (const [path, top] of saved) {
                if (!path) continue;
                let el = null;
                try { el = document.querySelector(path); } catch (e) { el = null; }
                // 재렌더로 콘텐츠가 짧아졌으면 브라우저가 알아서 최대치로 잘라 준다
                if (el && el.scrollTop !== top) el.scrollTop = top;
            }
        }
    },
    // UI.render*()를 전부 스크롤 보존으로 감싼다 — 핸들러를 하나씩 고치는 대신 한 곳에서 일괄 적용.
    // 정규식을 open*까지 넓히지 **않는** 이유: 최초 오픈 때 showModal이 맨 위로 리셋한 스크롤을
    // keepScroll이 옛 위치로 되돌려 '새 팝업은 맨 위에서 시작' 규칙을 깬다. 그래서 '이미 열린 화면을
    // open*으로 다시 그리는' 핸들러만 호출부에서 `keepScroll(() => this.open*())`로 감쌌다
    // (탈것 5경로·던전 소탕·대장간 업그레이드/젬 스킵 — QA가 기록한 목록 그대로).
    installScrollKeeper() {
        if (this._scrollKeeperOn) return;
        this._scrollKeeperOn = true;
        for (const name of Object.keys(this)) {
            if (!/^render[A-Z]/.test(name) || typeof this[name] !== 'function') continue;
            const orig = this[name];
            // 렌더 뒤에 썸네일 잉크 맞춤도 같이 건다 — 캐시된 썸네일은 즉시 적용된다
            this[name] = function (...args) {
                const r = UI.keepScroll(() => orig.apply(this, args));
                UI.fitThumbs();
                return r;
            };
        }
    },

    // 지금 떠 있는 팝업 중 가장 높은 z-index (없으면 0).
    // 팝업끼리는 형제 노드라 같은 z-index면 index.html 선언 순서가 위아래를 정한다 —
    // 그래서 '나중에 연 팝업이 아래로 깔려 보이지도 눌리지도 않는' 결함이 생겼다
    // (승천×대장간 정보, 제작 비교×진행 패스, 탈것×플레이어 정보, 스텁×프로필).
    topModalZ() {
        let max = 0;
        document.querySelectorAll('.modal:not(.hidden)').forEach(m => {
            const z = parseInt(getComputedStyle(m).zIndex, 10);
            if (Number.isFinite(z) && z > max) max = z;
        });
        return max;
    },

    showModal(el) {
        if (!el.classList.contains('hidden')) return; // 이미 열려 있음 — 재렌더 경로, 애니메이션 금지
        // 새로 여는 팝업은 항상 맨 위에서 시작한다 (직전에 열었을 때의 스크롤 잔상 제거).
        // 재렌더 경로는 위 return으로 빠져나가므로 keepScroll이 복원한 위치를 덮어쓰지 않는다.
        el.querySelectorAll('*').forEach(n => { if (n.scrollTop) n.scrollTop = 0; });
        // 겹쳐 열 때만 한 칸 올린다. 단독으로 열 때는 인라인 값을 비워 CSS 기본층으로 되돌려
        // (일반 20 / 세부정보 22 / 채팅 40 / 소환 결과 60) 값이 무한정 누적되지 않게 한다.
        // 🚨 겹쳐 열 때 **무조건 `top + 1` 을 박으면 CSS 가 준 기본층을 깎아내린다.** 던전 상세는
        //    딤이 탭바(z 30)를 덮어야 해서 CSS 가 40 을 주는데, 던전 목록(20) 위에 열리는 바람에
        //    `21` 이 박혀 탭바 아래로 내려갔다(실측: `modal-dim-tabbar` 에서 이 화면만 실패했다).
        //    기본층을 먼저 읽고 **더 높은 쪽**을 쓴다 — 기본층이 이미 위면 인라인을 비운다.
        el.style.zIndex = '';
        const base = parseInt(getComputedStyle(el).zIndex, 10) || 0;
        const top = this.topModalZ();
        el.style.zIndex = (top && top >= base) ? String(top + 1) : '';
        el.classList.remove('hidden');
        el.classList.add('opening');
        clearTimeout(el._openingT);
        el._openingT = setTimeout(() => el.classList.remove('opening'), 300);
    },

    // 제목 아이콘은 **이름으로** 받는다 — 호출부가 `onclick` 속성 문자열이라 여기에 아이콘
    // HTML 을 직접 끼우면 따옴표가 속성을 깨뜨린다(그래서 이모지를 쓰고 있었다).
    openStub(title, desc, icon) {
        this.els.stubModal.innerHTML = `
            <div class="modal-card">
                <h3>${icon ? IconGen.img(icon, 'stub-ico') : ''}${U.escapeHtml(title)}</h3>
                <p class="muted">${U.escapeHtml(desc)}</p>
                <p class="muted">${IconGen.img('barrier', 'stub-ico wide')}다음 업데이트에서 추가될 예정입니다.</p>
                <button class="btn" onclick="UI.closeStub()">닫기</button>
            </div>`;
        this.showModal(this.els.stubModal);
    },
    closeStub() { this.els.stubModal.classList.add('hidden'); },

    // ---- 소환 탭: 스킬/펫/기술 트리 서브탭 (UI-SPEC 8~16번) ----
    _summonSub: 'skills', // 원본 서브탭 순서(스킬|펫|기술 트리)상 첫 탭 — onTabClick 폴백과 일치
    switchSummonSub(sub) {
        this._summonSub = sub;
        if (this.activeTab !== 'summon') { this.switchTab('summon'); return; } // switchTab이 다시 호출
        document.querySelectorAll('#summon-subtabs button').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
        this.els.petsPanel.classList.toggle('summon-visible', sub === 'pets');
        this.els.skillsPanel.classList.toggle('summon-visible', sub === 'skills');
        this.els.techPanel.classList.toggle('summon-visible', sub === 'tech');
        if (sub === 'pets') this.renderPets();
        if (sub === 'skills') this.renderSkills();
        if (sub === 'tech') this.renderTechTree();
    },

    // ---- 상단바: 좌측 프로필 카드(아바타+닉네임+전투력), 우측 코인·젬 (UI-SPEC 1번) ----
    // 재화 pill 아이콘 + 초록 `+` 배지. 원본(shot-043224·042632 확대)의 `+` 는 pill 옆 원형 버튼이
    // 아니라 **재화 아이콘 오른쪽 아래에 걸치는 굵은 초록 십자 스티커**다 — 그래서 아이콘을 감싸는
    // 상대 위치 상자를 두고 배지를 그 위에 절대 배치한다.
    // ⚠️ 감싸는 상자는 `.ico` 가 쓰던 **음수 마진을 그대로 물려받는다**(CSS `.pill-ico`) —
    //    안 그러면 인라인 줄상자가 아이콘 높이만큼 커져 pill 이 세로로 부푼다(인계 메모 ㉣).
    curIcoPlus(kind) {
        return `<span class="pill-ico">${IconGen.img(kind)}`
            + `<button class="pill-plus" onclick="UI.openShop()" title="상점 열기" aria-label="상점 열기">`
            + `${IconGen.img('plus')}</button></span>`;
    },

    renderTopBar() {
        const cp = Combat.combatPower();
        this.els.topbar.innerHTML = `
            <div class="profile-card" onclick="UI.openProfile()">
                <span class="avatar">${IconGen.avatar(S.avatarEmoji)}</span>
                <div class="profile-info">
                    <span class="nickname">${U.escapeHtml(S.nickname || '용사')}</span>
                    <span class="cp">${IconGen.img('power')} ${U.fmt(cp)}</span>
                </div>
            </div>
            <div class="currency-pills">
                <span class="pill coin">${this.curIcoPlus('coin')} ${U.fmt(S.coins)}</span>
                <span class="pill gem">${this.curIcoPlus('gem')} ${U.fmt(S.gems)}</span>
            </div>`;
    },

    // 난이도·스테이지 표기 본체는 state.js(진행 도메인·DOM 무관)에 있다 — combat.js 의 사망 배너·토스트가
    // UI 를 거치지 않고 같은 글자를 쓰게 하고, vm 로직 테스트가 스텁이 아니라 **진짜 규칙**을 검증할 수 있게
    // 옮겼다(chapter-cycle-difficulty). 아래 둘은 기존 호출부를 위한 얇은 위임이다.
    difficultyLabel(chapter, tier = 0) { return stageDifficultyLabel(chapter, tier); },
    stageName(chapter, stage, tier) { return stageName(chapter, stage, tier); },

    // ---- 전투 HUD ----
    updateStageLabel() {
        const el = this.els.stageLabel;
        if (Dungeons.run) {
            const d = Dungeons.def(Dungeons.run.id);
            const rest = ` ${d.kr} ${Dungeons.run.stage}단계`;
            // ⚠️ 여기는 `textContent` 자리다 — `IconGen.img()` 가 준 `<i>` 를 문자열로 넣으면
            //    태그가 글자로 찍힌다(토스트·스킬 컷인이 이미 겪은 함정). 아이콘만 노드로 만들고
            //    나머지는 텍스트 노드로 붙인다. 표에 없는 던전은 원래 이모지로 그대로 떨어진다.
            el.textContent = '';
            const html = this.dgIcon(d);
            let node = null;
            if (html !== d.icon) {
                const t = document.createElement('template');
                t.innerHTML = html;
                node = t.content.firstElementChild;
            }
            el.appendChild(node || document.createTextNode(d.icon));
            el.appendChild(document.createTextNode(rest));
            // 플레이어 정보 팝업의 폴백 미리보기가 이 라벨을 **글자로** 가져간다 — 아이콘이 노드가
            // 되면서 그쪽에서 사라지므로, 글자판을 따로 남겨 둔다(`renderPlayerInfo` 가 읽는다).
            el.dataset.text = `${d.icon}${rest}`;
        } else {
            el.textContent = this.stageName();
            el.dataset.text = el.textContent;
        }
    },
    // pip 개수는 그 판의 총 웨이브 수를 따라간다 — 던전은 1~3, 메인은 5 (사용자 지시 2026-08-18).
    // 5개를 박아 두면 3웨이브 던전에서 "2개 남았는데 클리어"로 보인다.
    updateWavePips(wave) {
        const total = Combat.totalWaves();
        const pips = [];
        for (let w = 1; w <= total; w++) pips.push(w);
        this.els.wavePips.innerHTML = pips.map(w =>
            `<span class="pip ${w < wave ? 'done' : w === wave ? 'now' : ''} ${w === total ? 'boss' : ''}"></span>`).join('');
    },
    // 보스 경고 배너 — 길이는 Scene3D.BOSS_WARN_DUR가 소유한다(3D 연출·사이렌·보스 스폰이 같은 시계를 쓴다).
    // 지속·감쇠는 전부 CSS 키프레임이 가지므로 여기서는 클래스만 붙였다 뗀다.
    bossWarning(dur) {
        const el = this.els.bossWarn;
        const sec = dur || 2;
        el.style.setProperty('--bw-dur', sec + 's');
        el.classList.add('hidden');     // 연속 보스전에서도 애니메이션이 처음부터 다시 돌게
        void el.offsetWidth;            // 리플로우 강제
        el.classList.remove('hidden');
        clearTimeout(this._bossWarnT);
        this._bossWarnT = setTimeout(() => el.classList.add('hidden'), sec * 1000);
    },
    flashDamage(sev) {
        // 화면 가장자리 붉은 비네트 — 큰 피해일수록 진하게. 지속·감쇠는 CSS 키프레임이 소유한다
        // (JS 타이머+트랜지션 조합은 연타 시 서로 잘라먹고, 프레임 단위 검증도 불가능했다).
        const el = this.els.dmgFlash;
        // 피크 알파를 30% 낮춘다(0.92→0.64). 플래토를 31ms 로 줄여도 정점 자체가 진하면 한 프레임이
        // 통째로 붉게 잠겨 그 프레임의 3D가 안 읽힌다(비평가 5차 B #5 권고). 1.0은 화면 전체가 붉게 잠긴다.
        el.style.setProperty('--vig', Math.min(0.64, 0.32 + (sev || 0.12) * 1.05).toFixed(2));
        el.classList.remove('on');
        void el.offsetWidth; // 리플로우 강제 — 연타해도 애니메이션이 처음부터 다시 돈다
        el.classList.add('on');
    },
    floatLoot(text) {
        if (this.els.lootFeed.children.length > 6) this.els.lootFeed.firstChild.remove();
        const el = document.createElement('div');
        // `textContent` 자리였다 — 호출부가 `🪙 +3` 처럼 이모지를 실어 보내서 전 화면에 생이모지가
        // 떠 있었다(전투 중 상시 노출이라 눈에 띄는 자리다). 토스트와 같은 노드 처리로 통일한다.
        this.paintIconText(el, text, 'toast-ico');
        this.els.lootFeed.appendChild(el);
        setTimeout(() => el.remove(), 1600);
    },
    floatTextAtHero(text, cls) {
        const p = Scene3D.heroG ? Scene3D.heroG.position : { x: Combat.HERO_X, z: 0 };
        Scene3D.damageNumber(new THREE.Vector3(p.x, 1.8, p.z), text, cls);
    },

    // 토스트 선두 이모지 → 코드 생성 아이콘. 호출부가 79곳이라 전부 고쳐 쓰는 대신
    // **여기서 선두 한 글자만 갈아 끼운다** — 표에 없는 이모지는 글자 그대로 남으므로
    // 아이콘을 새로 그릴 때마다 이 표에 한 줄 더하면 그 순간부터 전부 반영된다.
    TOAST_ICON: {
        '🪙': 'coin', '💎': 'gem', '🔨': 'hammer', '🛠': 'hammer', '⚒': 'hammer',
        '🥚': 'egg', '🎫': 'ticket', '🎟': 'ticket', '🧪': 'potion', '⚙': 'winder',
        '🔒': 'lock', '🗝': 'key', '🎁': 'gift', '🏆': 'trophy', '⭐': 'star', '⬆': 'uptri',
        '👑': 'crown', '💀': 'skull', '⚡': 'bolt', '📜': 'scroll', '🧩': 'shard',
        '💤': 'zzz', '🔓': 'unlock', '📌': 'pin', '📍': 'marker', '✨': 'sparkle',
        '👻': 'ghost', '🧟': 'zombie',   // 던전 입장·실패 토스트가 쓰는 얼굴(아이콘은 이미 있었다)
        '⚔': 'tm_sword', '🎉': 'sparkle', '📋': 'clipboard', '💾': 'save', '🔬': 'research',
    },

    // 문구를 훑어 **표에 있는 이모지를 전부** 아이콘 노드로 바꿔 el 에 쌓는다. 선두만 바꾸면
    // `🏆 1-1 첫 클리어! 🪙+60` 처럼 뒤에 붙는 재화 이모지가 그대로 남아 한 줄 안에서
    // 아이콘과 이모지가 섞인다(실측으로 확인).
    // ⚠️ innerHTML 로 통째로 바꾸면 안 된다 — 문구에는 닉네임·장비명이 그대로 들어온다.
    //    아이콘만 노드로 만들고 **나머지는 전부 텍스트 노드**로 붙인다.
    // (토스트 전용이었는데 전리품 피드도 같은 처리가 필요해 함수로 뺐다 — `🪙 +3` 이 생이모지로
    //  떠 있었다. 앞으로 이런 자리가 또 나오면 이걸 부를 것. 복사하지 말 것.)
    paintIconText(el, msg, cls) {
        const cp = Array.from(String(msg));
        let buf = '';
        const flush = () => { if (buf) { el.appendChild(document.createTextNode(buf)); buf = ''; } };
        for (let i = 0; i < cp.length;) {
            // 이모지는 이형 선택자(U+FE0F)가 붙어 두 글자인 경우가 있다 — 두 글자를 먼저 본다.
            const two = cp[i] + (cp[i + 1] || ''), one = cp[i];
            const key = this.TOAST_ICON[two] ? two : (this.TOAST_ICON[one] ? one : '');
            if (!key) { buf += cp[i]; i++; continue; }
            flush();
            const wrap = document.createElement('span');
            wrap.innerHTML = IconGen.img(this.TOAST_ICON[key], cls);
            if (wrap.firstChild) el.appendChild(wrap.firstChild);
            i += Array.from(key).length;
            // ⚠️ 실제 문구는 `⚔️`·`⬆️`·`⚙️` 처럼 **이형 선택자(U+FE0F)가 붙어 있다.** 표 키는 맨 글자라
            //    한 글자 매칭 뒤 U+FE0F 가 남아 보이지 않는 문자가 문구에 섞인다 — 같이 건너뛴다.
            if (cp[i] === '\uFE0F') i++;
            while (cp[i] === ' ') i++;      // 이모지 뒤 공백은 아이콘 마진이 대신한다
        }
        flush();
        return el;
    },

    // lane='combat' 이면 팝업 아래로 깔리는 전투/스테이지 알림 레인에 띄운다
    // (사용자 지시 2026-08-18 — "몇 스테이지로 돌아간다는 알림은 다른 팝업들 위로 뜨면 안 됨").
    // 기본 레인은 그대로 팝업 위다: 대개 그 팝업에서 누른 버튼의 응답이라 가려지면 안 된다.
    // 수령 연출(reward-claim-fx)이 도는 동안에는 토스트를 잠깐 미룬다 — 수령이 촉발한 부수 토스트
    // (해금·자동장착 등)가 연출·행 위로 미끄러져 들어와 화면을 덮는 걸 막는다(비평가 지적).
    // 지운 게 아니라 미룬 것: 연출이 끝나면 순서대로, 각자의 레인 그대로 뜬다.
    _toastHoldUntil: 0, _heldToasts: null,
    toast(msg, lane) {
        if (performance.now() < this._toastHoldUntil) {
            if (!this._heldToasts) {
                this._heldToasts = [];
                setTimeout(() => {
                    const q = this._heldToasts || [];
                    this._heldToasts = null;
                    q.forEach(t => this.toast(t.msg, t.lane));
                }, this._toastHoldUntil - performance.now() + 30);
            }
            this._heldToasts.push({ msg, lane });
            return;
        }
        const el = document.createElement('div');
        el.className = 'toast';
        this.paintIconText(el, msg, 'toast-ico');
        const box = lane === 'combat'
            ? (this.els.toastsCombat || document.getElementById('toasts-combat') || this.els.toasts)
            : this.els.toasts;
        box.appendChild(el);
        setTimeout(() => el.classList.add('show'), 10);
        setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
    },

    // ---- 스킬 바 ----
    // 자동 토글이 좌측, 원형 스킬 버튼이 우측 (UI-SPEC 1번 우중단 배치)
    renderSkillBar() {
        // 원본(shot-042120): 검은 원 3슬롯 고정 — 장착 안 된 슬롯도 어두운 빈 원으로 표시
        const slots = Array.from({ length: Skills.MAX_ACTIVE }, (_, i) => {
            const id = S.equippedSkills[i];
            if (!id) return `<span class="skill-btn empty"></span>`;
            const d = Skills.def(id);
            // 장착 슬롯 = 스킬 화면과 동일한 등급색 오브 + 아이콘 + Lv (사용자 지시 — 검정 원은 빈 슬롯만)
            return `<button class="skill-btn" id="sb-${id}" style="--sc:${d.color};--rc:${RARITY_CSS[d.rarity]}" title="${d.name}" onclick="Combat.tryCast('${id}', true)">
                <span class="sk-icon">${IconGen.skill(id)}</span>
                <span class="sk-name">${d.name}</span>
                <span class="sk-lv">Lv.${Skills.level(id)}</span>
                <span class="sk-cd" id="sbcd-${id}"></span>
            </button>`;
        }).join('');
        this.els.skillBar.innerHTML = `<button class="skill-btn auto ${S.autoCast ? 'on' : ''}" onclick="UI.toggleAuto()">자동</button>` + slots;
    },
    toggleAuto() {
        S.autoCast = !S.autoCast;
        this.renderSkillBar();
        saveGame();
    },
    updateSkillBar() {
        for (const id of S.equippedSkills) {
            const el = document.getElementById('sbcd-' + id);
            if (!el) continue;
            const cd = Combat.cooldowns[id] || 0;
            const d = Skills.def(id);
            el.style.height = (U.clamp(cd / d.cd, 0, 1) * 100) + '%';
            const btn = document.getElementById('sb-' + id);
            if (btn) btn.classList.toggle('ready', cd <= 0);
        }
    },

    // ---- 대장간 패널 ----
    // 장비 시트: 상시 노출 (대장간 탭 대체, UI-SPEC 1번 하단 시트). 확률/업그레이드 상세는 '대장간 팝업 3종'에서 별도 팝업으로 예정
    renderEquipSheet() {
        const info = Forge.upgradeInfo();
        const upgrading = !!S.forgeUpgradeEndsAt;
        let forgeBtnHtml;
        // ⚠️ 만렙(Lv.35)에서도 **버튼은 살아 있어야 한다**(QA 11차 버그). `⭐ 승천`은 이 버튼으로만 열리는
        // 대장간 정보 팝업 안에 있어서, 예전처럼 `disabled`로 죽이면 **프레스티지 한 갈래가 통째로 잠긴다** —
        // 34→35 업그레이드가 실측 23일이라 대다수는 팝업을 닫아 둔 채 완료를 맞고, 그러면 다시 열 방법이 없었다.
        // 라벨만 상태에 맞게 바꾸고 onclick은 유지한다(만렙에서도 확률표 열람은 계속 필요하다).
        if (!info) {
            forgeBtnHtml = Ascension.ready('forge')
                ? `<button class="btn sm primary ascend-ready" onclick="UI.openForgeInfo()">${IconGen.img('star')} 승천<br>가능</button>`
                : `<button class="btn sm primary" onclick="UI.openForgeInfo()">대장간<br>최고 레벨</button>`; // 만렙 라벨도 미만렙과 같은 명시적 2줄 — 자동 래핑 클리핑 방지
        }
        else {
            // 원본은 버튼에 "대장간 레벨 N"만 두고 남은 시간은 버튼 아래 별도 줄에 표시
            forgeBtnHtml = `<button class="btn sm primary" onclick="UI.openForgeInfo()">대장간<br>레벨 ${S.forgeLevel}</button>`;
        }
        const upgTimeHtml = upgrading
            ? `<div class="forge-time" id="equip-upg-time">${U.fmtTime((S.forgeUpgradeEndsAt - U.now()) / 1000)}</div>`
            : '';

        // 카드 = 아이콘 + Lv + 별만 표시 (컴팩트, UI-SPEC 1번). 상세 정보는 클릭 시 '장비 세부정보 팝업'(UI-SPEC 26번)
        const autoUnlocked = isUnlocked('autoForge');
        const equipHtml = SLOTS.map(slot => this.equipCellHTML(slot)).join('');
        // 마지막 칸 = 항상 탈것 슬롯 (사용자 확정 — 알 부화 표시 금지, 부화 진행은 펫 화면 부화장에서만).
        // 장착 탈것 있으면 아이콘+Lv, 없으면 "탈것" 빈 슬롯. 클릭 시 항상 탈것 창.
        // 장착은 **1마리**다(사용자 지시 2026-08-18 `mount-single-equip`) — 칸에는 그 1마리를 보여준다.
        // +N 배지는 여러 마리를 장착할 수 있던 시절의 잔재라 이제 항상 0이지만, 표시 경로는 그대로 둔다
        // (제한이 다시 바뀌어도 렌더가 따라오고, 지금은 어차피 아무것도 안 그린다).
        // 인벤이 개체 배열이 되면서(2026-08-19) 같은 이름이 여럿일 수 있다 — 이름이 아니라 **개체**를 받는다.
        const activeMount = Mounts.riddenInst();
        const riddenName = activeMount ? activeMount.name : null;
        const extraMounts = Math.max(0, (S.activeMounts || []).length - 1);
        const eggCellHtml = activeMount
            ? `<div class="equip-cell egg-cell" title="탈것: ${MOUNT_KR[riddenName] || riddenName}${extraMounts ? ` 외 ${extraMounts}마리` : ''}" onclick="UI.openMounts()">
                ${UI.mountFace(riddenName, 'cell-img emoji', activeMount.rarity, activeMount.stars)}
                <span class="cell-lv">Lv.${activeMount.level}</span>
                ${extraMounts ? `<span class="cell-count" style="${UI.MOUNT_COUNT_STYLE}">+${extraMounts}</span>` : ''}
            </div>`
            : `<div class="equip-cell egg-cell empty" title="탈것" onclick="UI.openMounts()"><span class="mount-sil">${IconGen.img('horse')}</span><span class="slot-name">탈것</span></div>`;

        // 모루가 중앙, 우측에 [대장간 레벨 N]·[자동🔄] 가로 배치, 좌측에 !(플레이어 정보, UI-SPEC 27번) — UI-SPEC 1번
        this.els.equipSheet.innerHTML = `
            <div class="equip-grid">${equipHtml}${eggCellHtml}</div>
            <div class="anvil-row">
                <div class="anvil-side left">
                    <!-- 글리프는 원본(shot-042120) 실측대로 소문자 i — 게임 안 정보 버튼 6곳이 전부 i 인데
                         여기만 느낌표였다(2026-08-19 QA 등재 equip-sheet-info-glyph). probe-info-glyph.js 가 계약을 건다. -->
                    <button class="info-btn" title="플레이어 정보" onclick="UI.openPlayerInfo()">i</button>
                </div>
                ${this.anvilSlotHTML()}
                <div class="anvil-side right">
                    <div class="forge-actions">
                        ${forgeBtnHtml}
                        <button class="btn sm ${autoUnlocked ? (S.autoForgeOn ? 'on' : '') : 'disabled'}" onclick="UI.onAutoForgeBtn()">
                            자동${IconGen.img('autoloop', 'auto-loop-ico')}<br>${autoUnlocked ? (S.autoForgeOn ? 'ON' : 'OFF') : IconGen.img('lock')}</button>
                    </div>
                    ${upgTimeHtml}
                </div>
            </div>`;
        this.hydrateMountThumbs();   // 탈것 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
    },

    // 모루 자리 — **결정하지 않은 제작품(보류)이 있으면 모루 대신 그 카드가 놓인다** (사용자 확정 2026-08-17).
    // 보류는 `pendingCraft` 1슬롯이 전부다(창고 없음): 카드를 누르면 비교 팝업이 다시 뜨고,
    // 장착/판매로 처리해야 모루가 돌아와 다음 제작이 가능하다.
    anvilSlotHTML() {
        const held = this.heldItem();
        if (!held) {
            return `<button class="anvil-btn" onclick="UI.onCraft()">${this.ANVIL_SVG}<small id="anvil-hammers">${IconGen.img('hammer')} ${U.fmt(S.hammers)}</small></button>`;
        }
        // 딤으로 여러 개를 한꺼번에 보류하면(autoforge-dim-hold-all) 카드 자리는 하나뿐이라
        // 앞의 한 개만 놓고 태그에 남은 개수를 적는다 — 하나 고르면 다음 보류품이 이 자리로 올라온다.
        // (모루 행 높이는 원본 비율 검증 대상이라 목록을 새로 펼치지 않고 이 카드 안에서 센다)
        // 사용자 지시 2026-08-20(autoforge-cards-at-once 재오픈): 여러 개 보류 중이면 **한 장이 아니라
        // 겹쳐 쌓인 더미**로 보여야 한다 — 개수만큼 두께가 늘어나는 덱을 카드 뒤에 깐다(deckDepth).
        const n = this.heldCount();
        const more = n - 1;
        const depth = this.heldDeckDepth(n);
        return `<button class="anvil-btn held-slot${depth ? ` deck deck-${depth}` : ''}" style="--rc:${this.ageHex(held.age)}" onclick="UI.onOpenHeld()">
            <span class="held-tag">보류${more > 0 ? ` ${more + 1}` : ''}</span>
            ${this.itemImgHTML(held, 'held-img')}
            <span class="held-name">${held.name}</span>
            <small id="anvil-hammers">${IconGen.img('hammer')} ${U.fmt(S.hammers)}</small>
        </button>`;
    },
    // 보류 더미의 '두께'(뒤에 깔리는 카드 에지 겹 수). 개수에 로그처럼 붙여 22개와 3개가 다르게
    // 보이되, 더미 폭이 모루 칸을 넘지 않게 5겹에서 멈춘다(폭을 넘기면 모루 행 비율이 흔들린다).
    // 0 = 더미 아님(한 장 또는 없음) — 사용자 스펙 그대로 1개는 단일 카드다.
    heldDeckDepth(n) {
        if (n >= 15) return 5;
        if (n >= 6) return 4;
        if (n >= 3) return 3;
        if (n >= 2) return 2;
        return 0;
    },
    // 보류 중인 제작품 = 비교 팝업이 닫혀 있는 대기품 (팝업이 열려 있으면 모루 자리는 그대로 둔다)
    heldItem() {
        return this._pendingItem && this.els.craftModal.classList.contains('hidden') ? this._pendingItem : null;
    },
    // 보류 카드 클릭 → 그 장비의 비교 팝업을 다시 띄운다
    onOpenHeld() {
        if (!this._pendingItem) return;
        this.showCraftModal(this._pendingItem);
        this.renderEquipSheet();
    },
    // 비교 팝업 딤 클릭 = 보류: 팝업만 닫고 장비는 대기품 그대로 둔다 → 모루 자리에 카드로 보인다
    onCraftDimClick(e) {
        if (e.target !== this.els.craftModal) return;   // 카드 안쪽 클릭은 무시
        this.els.craftModal.classList.add('hidden');
        this.renderEquipSheet();
        // 대기품이 없는 팝업(모두 소비된 상태)이면 보류할 게 없으니 그냥 닫는다.
        // [장착] 스왑 후에는 내려온 옛 장비가 대기품으로 남아 있으므로 아래 보류 경로를 탄다 —
        // 딤으로 접으면 그 옛 장비가 모루 자리 카드로 가고, 다시 눌러 팔거나 되장착할 수 있다.
        if (!this._pendingItem) return;
        // 자동 제련 중(또는 통과분 큐가 남아 있는 중)이면 딤 = **이 1개만이 아니라 남은 것 전부 보류**
        // 하고 자동 진행을 멈춘다 (사용자 지시 2026-08-19 autoforge-dim-hold-all).
        // 종전 동작은 이 1개만 보류하고 `autoSeqStep()`으로 시퀀스를 이어 갔는데, 보류품이 필터를
        // 통과한 것이라 그 자리에서 같은 팝업을 즉시 다시 띄웠다 — 딤을 눌러도 아무 일도 안 일어나는
        // 것처럼 보였고(실측), 남은 통과분은 계속 줄줄이 떴다.
        const q = Array.isArray(S.autoMatchQueue) ? S.autoMatchQueue : [];
        if (this._autoSeq || S.autoForgeOn || q.length) {
            S.autoMatchHeld = true;          // stopAutoSeq 안의 openNextAutoMatch보다 먼저 세울 것
            const n = this.heldCount();
            this.stopAutoSeq();              // 자동 진행 정지(_autoSeq가 없어도 autoForgeOn을 끈다)
            saveGame();
            this.renderEquipSheet();
            this.toast(n > 1
                ? `📌 남은 ${n}개 전부 보류 — 자동 제련을 멈췄습니다. 모루 자리 카드를 누르면 하나씩 다시 고릅니다`
                : '📌 보류 — 자동 제련을 멈췄습니다. 모루 자리 카드를 누르면 다시 고를 수 있습니다');
            return;
        }
        this.toast('📌 보류 — 모루 자리의 카드를 누르면 다시 고를 수 있습니다');
        this.autoSeqStep();   // 자동 시퀀스 중이었다면 계속 진행 (보류는 시퀀스를 멈추지 않는다)
    },

    // 모루 버튼 아래 해머 카운터만 갱신 (매초 틱에서 전체 renderEquipSheet 재호출은 과함)
    updateAnvilCounter() {
        const el = document.getElementById('anvil-hammers');
        if (el) el.innerHTML = `${IconGen.img('hammer')} ${U.fmt(S.hammers)}`;
    },

    onStartUpgrade() {
        if (Forge.startUpgrade()) { this.renderEquipSheet(); this.renderTopBar(); this.keepScroll(() => this.openForgeInfo()); }
        else this.toast('🪙 코인이 부족합니다');
    },
    onGemSkipForge() {
        if (Forge.gemSkip()) { this.renderTopBar(); this.keepScroll(() => this.openForgeInfo()); }
        else this.toast('💎 젬이 부족합니다');
    },
    onToggleAutoForge() {
        if (!isUnlocked('autoForge')) { this.toast('🔒 스테이지 2-10 도달 시 해금됩니다'); return; }
        S.autoForgeOn = !S.autoForgeOn;
        // ① 시작하면 설정 팝업을 닫는다 — 연출이 모루 위에서 도는데 팝업이 덮고 있으면 아무것도 안 보인다
        if (S.autoForgeOn) this.closeAutoForge();
        this.renderEquipSheet();
        if (!this.els.autoForgeModal.classList.contains('hidden')) this.renderAutoForge();
        saveGame();
        if (S.autoForgeOn) this.startAutoSeq(); else this.stopAutoSeq();
    },

    // ===== 자동 제작 순차 시퀀스 (사용자 지시 2026-08-17) =====
    // 예전 구현은 main.js의 3초 인터벌에서 배치로 즉시 처리해 아무 연출이 없었다. 이제
    // **망치질 애니 1회 = 설정한 N개짜리 사이클**로 돌고(사용자 지시 2026-08-18
    // autoforge-hammer-per-cycle: "애니메이션 한 번 할 때마다 망치 N개씩"), 사이클 안에서는
    // 한 개씩 **뽑힌 것 카드로 보여주기 → 자동 판정(장착/판매)** 이 이어진다. 사이클이 끝나도
    // 배치는 멈추지 않고 **망치가 다 없어질 때까지** 다음 망치질 사이클을 반복한다("1배치 후
    // 자동 OFF"가 사용자가 틀렸다고 한 그 동작). 정지 조건은 셋뿐 — 사용자가 토글을 끄거나,
    // 망치가 떨어지거나, stopOnTarget 팝업이 배치의 마지막이 되거나.
    // ⚠️ **사이클은 두 단계다 (사용자 3차 재지적 2026-08-19 autoforge-show-all-cards 최종 사양)**:
    //   ①단계 = 망치질 1회 뒤 사이클 N개를 **카드로 먼저 다 보여준다**. 이 동안 비교 팝업은
    //           절대 뜨지 않는다 — 탈락분은 그 자리에서 자동 판정(판매/장착), 통과분(목표)은
    //           팝업 대신 `queueAutoMatch`로 큐에 쌓고 카드만 보여주고 다음으로 넘어간다.
    //   ②단계 = N장이 다 지나간 뒤 큐를 하나씩 꺼내 비교 팝업으로 처리한다(각 선택이 다음 큐
    //           항목을 연다). 큐가 비면 다음 망치질 사이클로, 망치가 없으면 정지.
    // 종전 구현은 '카드1→팝업→카드1→팝업' 교차라 사용자가 "카드를 10개 안 보여준다"고 세 번 지적했다.
    // 팝업이 떠 있는 동안에는 망치를 소비하지 않는다.
    _autoSeq: null,
    // 자동 제련 [시작] 시, **지금 필터로** 기존 보류품을 일괄 재판정해 탈락분을 조용히 판다
    // (사용자 지시 2026-08-20 autoforge-purge-held-nonmatch-on-start: "원시적이 잔뜩 보류돼 있는데
    //  '현대의'만 체크하고 시작을 누르면 원시적은 필터에 안 걸리니까 싹 다 판매되고 돌아가야 함").
    // 🔑 **왜 재판정이 필요한가**: 큐(`S.autoMatchQueue`)에 쌓인 통과분은 **쌓일 당시의 필터**로
    //    통과한 것이라, 그 뒤 필터를 바꿔도 `openNextAutoMatch`(위)가 재판정 없이 그대로 비교
    //    팝업을 열었다 — 시작을 누르면 새 목표와 아무 상관 없는 옛 장비들이 줄줄이 떠서 판매/장착을
    //    강제로 물었다(사용자가 지적한 바로 그 화면). 대기품 1슬롯도 마찬가지로 새는 자리가 있다:
    //    `autoSeqStep`은 대기품을 재판정하지만 **팝업이 이미 떠 있으면 그 앞에서 return** 하므로
    //    (부팅 복원 `restorePendingCraft` → `startAutoSeq` 순서가 정확히 그 상태다) 옛 필터 장비의
    //    팝업이 그대로 남았다. 그래서 판정을 시작 지점으로 끌어와 **한 곳에서** 정리한다.
    // 판매는 조용히 — 토스트 없음(autoforge-toast-suppress), 코인 연출은 배치당 한 번으로 합친다
    // (autoforge-no-auto-equip 이후 자동 경로의 처리는 언제나 판매뿐이다).
    purgeNonMatchingHeld() {
        // ① 펴 놓다 만 카드판(S.autoBatch)부터 규약대로 흘려보낸다 — `drainAutoBatch`는 이미 현재
        //    필터로 판정하므로, 여기서 먼저 부르면 통과분이 큐로 합류해 아래 한 번의 검사로 끝난다.
        this.drainAutoBatch();
        let gained = 0, sold = 0;
        // ② 통과분 큐: 지금 필터를 통과하는 것만 남기고 나머지는 판매
        const q = Array.isArray(S.autoMatchQueue) ? S.autoMatchQueue : (S.autoMatchQueue = []);
        const keep = [];
        for (const it of q.splice(0)) {
            if (!it || !it.slot) continue;                 // 손상 세이브 방어
            if (Forge.passesAutoFilter(it)) { keep.push(it); continue; }
            gained += this.autoDispose(it).gained || 0; sold++;
        }
        for (const it of keep) q.push(it);
        // ③ 모루 자리 대기품도 같은 기준. 비교 팝업이 떠 있으면 **접고** 판다 — 안 접으면 방금 판
        //    장비의 팝업이 화면에 그대로 남아 [판매]/[장착]을 다시 묻는다(resolvePendingCraft와 같은 처리).
        const held = this._pendingItem;
        if (held && !Forge.passesAutoFilter(held)) {
            if (!this.els.craftModal.classList.contains('hidden')) {
                this.cancelAnvilStrike();
                this.els.craftModal.classList.add('hidden');
            }
            this.clearPendingCraft();
            gained += this.autoDispose(held).gained || 0; sold++;
        }
        if (sold) { this.coinBurst(gained); this.renderTopBar(); this.renderEquipSheet(); }
        saveGame();
        return sold;
    },
    startAutoSeq() {
        if (this._autoSeq) return;
        // 자동 제련을 다시 켠 것은 '보류해 둔 것도 마저 처리하라'는 뜻이다 — 보류 모드를 풀어
        // 큐가 평소대로 팝업으로 흘러가게 한다 (autoforge-dim-hold-all 2026-08-19).
        S.autoMatchHeld = false;
        // 보류 모드를 푼 **직후·시퀀스를 세우기 전에** 재판정한다: 앞이면 보류 모드가 살아 있어
        // 아래 정리 중 `promoteHeldToSlot`이 끼어들 수 있고, 뒤면 `autoSeqStep`이 먼저 옛 장비의
        // 팝업을 띄운다.
        this.purgeNonMatchingHeld();
        this._autoSeq = { stopAfterPick: false };   // 사이클 잔량(inCycle)은 배치화로 없어졌다
        this.autoSeqStep();
    },
    stopAutoSeq() {
        this._autoSeq = null;
        if (S.autoForgeOn) { S.autoForgeOn = false; this.renderEquipSheet(); saveGame(); }
        if (!this.els.autoForgeModal.classList.contains('hidden')) this.renderAutoForge();
        // 정지해도 큐에 쌓인 통과분은 사용자가 아직 안 고른 제작품이다 — 여기서 팝업을 이어 연다.
        // ⚠️ 이게 없으면 **마지막 망치를 쓴 순간** main.js 안전망 틱(`S.hammers < 1` → stopAutoSeq)이
        //    시퀀스를 먼저 지워, 카드 10장을 다 보여주고도 팝업이 한 번도 안 뜬 채 끝난다(실측).
        this.openNextAutoMatch();
    },
    // 카드 한 장이 끝난 뒤 다음 단계로. 시퀀스가 이미 정지됐어도(망치 소진 안전망 등) 큐는 마저 처리한다.
    autoSeqAdvance() {
        if (this._autoSeq) { this.autoSeqStep(); return; }
        this.openNextAutoMatch();
    },
    autoSeqStep() {
        const seq = this._autoSeq;
        if (!seq || !S.autoForgeOn) return;
        if (this._anvilBusy) return;                        // 망치질 중 — 끝나면 다시 불린다
        // 모루 자리에 보류 카드가 있으면 **필터로 먼저 정리한다**(사용자 확정 2026-08-17 ③):
        // 필터에 안 걸리는 보류품은 자동 판매(코인 연출)하고 진행, 걸리는 것이면 비교 팝업으로 넘긴다.
        if (this._pendingItem) {
            if (!this.els.craftModal.classList.contains('hidden')) return;   // 이미 선택 대기 중
            const held = this._pendingItem;
            const keep = Forge.passesAutoFilter(held);
            if (keep) { this.showCraftModal(held); this.renderEquipSheet(); return; }
            this.clearPendingCraft();
            const r = this.autoDispose(held);
            // 처리 토스트 생략(autoforge-toast-suppress) — 판매 코인 연출(coinBurst)만 남긴다.
            // 자동 경로는 이제 **항상 판매**라 조건이 없다(autoforge-no-auto-equip 으로 자동 장착 삭제).
            this.coinBurst(r.gained);
            this.renderTopBar();
            this.renderEquipSheet();
        }
        // ②단계 — 지난 배치에서 큐에 쌓인 통과분을 하나씩 비교 팝업으로 처리한다.
        if (this.openNextAutoMatch()) return;
        if (seq.stopAfterPick || S.hammers < 1) { this.stopAutoSeq(); return; }
        // ①단계 — 새 배치. 망치질 애니 1회 뒤 N개를 **한꺼번에** 제작해 카드 N장을 동시에 편다.
        // (사용자 지시 2026-08-20 autoforge-cards-at-once: "10개 망치 썼으면 카드 10개 한 번에".
        //  종전에는 여기서 사이클 잔량을 세어 `autoSeqCard()` 로 1장씩 흘렸다 — 그 순차가 지시로 폐기됐다.)
        this._anvilBusy = true;
        this.playAnvilStrike(() => { this._anvilBusy = false; this.autoSeqBatch(); });
    },
    // 한 배치: 망치 N개를 **한 번에** 소비해 N개를 제작하고, N장을 한 화면에 동시에 보여준 뒤
    // 규약대로 흘려보낸다(통과분 → 비교 팝업 큐, 탈락분 → 자동 판정).
    // 🔑 **지속성이 이 항목의 핵심 난점이었다**: 대기품 슬롯(`S.pendingCraft`)은 1개뿐이라
    //    N개를 미리 뽑으면 연출 도중 새로고침에 통째로 증발한다(그래서 종전엔 1개씩 뽑았다).
    //    그래서 배치 전용 지속 배열 `S.autoBatch` 를 두고 **제작과 같은 저장에 묶어** 적재한다 —
    //    카드가 떠 있는 동안 죽어도 해머와 장비가 같이 남고, 부팅 때 `drainAutoBatch` 가 이어 처리한다.
    autoSeqBatch() {
        const seq = this._autoSeq;
        if (!seq || !S.autoForgeOn) return;
        if (S.hammers < 1) { this.stopAutoSeq(); return; }
        const cfg = Forge.autoForgeConfig();
        const n = Math.min(Math.max(1, cfg.hammersPerBatch), S.hammers);
        // '목표장비 찾으면 제련 계속하기'가 켜져 있고(=stopOnTarget false) 목표가 실제로 정의돼
        // 있으면, 배치 크기 N 의 뜻이 **'망치 N개'가 아니라 '통과분 N개'** 다
        // (사용자 지시 2026-08-20 autoforge-fill-matches-to-batch: "필터링 된 거 10개 될 때까지
        //  계속 뽑고, 10개 됐을 때 비교 팝업 보여주기 시작").
        // ⚠️ 목표가 없으면(기본값) `passesAutoFilter` 가 무엇도 통과시키지 않으므로 채우기를
        //    걸면 망치를 전부 태우고도 0개로 끝난다 — 그래서 `hasAutoTarget()` 로 잠근다.
        let items, shown;
        if (!cfg.stopOnTarget && Forge.hasAutoTarget()) {
            const r = this.craftUntilMatches(n);
            items = r.kept;
            // 한 개도 안 걸린 배치라도 **뽑힌 건 보여준다** — 필터가 빡빡하면 통과분이 0인 사이클이
            // 흔한데, 그때 화면에 아무것도 안 뜨면 망치만 조용히 줄어든다("뭐 뽑았는지 보여줘"가
            // 이 계열 지시의 뿌리다). 그 경우엔 마지막으로 뽑아 판 것들을 카드판에 올린다.
            shown = items.length ? items : r.lastSold;
        } else {
            items = shown = Forge.craft(n);
        }
        if (!shown.length) { this.stopAutoSeq(); return; }   // 한 개도 못 뽑았다(망치 소진 등)
        S.autoBatch = items;
        saveGame();                  // 해머 차감과 배치 적재를 같은 저장에 — 여기서 죽어도 둘 다 남는다
        this.renderTopBar();
        // 카드가 걷힐 때까지 모루를 잠근다 — 그 사이 수동 제작이 끼어들면 대기품이 덮인다(종전과 같은 이유).
        this._anvilBusy = true;
        this.showCraftBatch(shown, () => {
            this._anvilBusy = false;
            this.drainAutoBatch();
            this.autoSeqAdvance();
        });
    },
    // 통과분이 `target` 개 모일 때까지 계속 제작한다 — 탈락분은 그 자리에서 판매하고 다시 뽑는다
    // (사용자 지시 2026-08-20 autoforge-fill-matches-to-batch).
    // 🔑 **지속성은 매 묶음마다 저장으로 지킨다**: 통과분은 `S.autoBatch` 에 적재하고 탈락 판매액은
    //    코인에 들어가므로, 묶음 하나를 뽑을 때마다 둘을 같은 저장에 묶는다. 이 루프 도중에 죽어도
    //    "망치는 나갔는데 아무것도 안 남는" 창이 한 묶음보다 커지지 않는다(종전 단발 제작과 같은 노출).
    // ⚠️ **망치 예산이 채우기보다 먼저다** — 통과가 드물면 10개를 채우는 데 망치가 수백 개 들 수 있다.
    //    망치가 바닥나면 거기서 멈추고 **그때까지 모은 통과분으로** 팝업을 연다(항목 메모의 미확정
    //    지점을 이렇게 정했다: 사용자가 가진 예산을 넘어서까지 뽑을 방법은 애초에 없다).
    // ⚠️ `FILL_CRAFT_CAP` 은 프레임을 지키는 안전판이다 — 이 루프는 동기라, 통과율이 1% 대인
    //    필터에서 상한이 없으면 화면이 몇 초씩 멈춘다. 상한에 걸리면 모은 만큼으로 진행하고,
    //    다음 사이클이 이어서 채운다(자동 제련은 계속 도니 결과적으로 같은 자리에 온다).
    FILL_CRAFT_CAP: 600,
    // 반환 `{ kept, lastSold }` — `lastSold` 는 **통과분이 0인 사이클에서 카드판에 올릴** 최근 탈락분이다
    // (이미 팔린 것이라 `S.autoBatch` 에는 안 들어간다 — 보여 주기 전용).
    craftUntilMatches(target) {
        const kept = [];
        let gained = 0, sold = 0, crafted = 0, lastSold = [];
        while (kept.length < target && S.hammers >= 1 && crafted < this.FILL_CRAFT_CAP) {
            const chunk = Forge.craft(Math.min(target - kept.length, S.hammers, this.FILL_CRAFT_CAP - crafted));
            if (!chunk.length) break;                 // 무료 제련 등으로도 더 못 뽑는 상태
            crafted += chunk.length;
            lastSold = [];
            for (const it of chunk) {
                if (Forge.passesAutoFilter(it)) kept.push(it);
                else { gained += Forge.autoResolve(it).gained || 0; sold++; lastSold.push(it); }
            }
            S.autoBatch = kept.slice();               // 통과분 적재와 판매액을 같은 저장에
            saveGame();
        }
        // 판매 코인 연출은 배치당 한 번으로 합친다(장당 터뜨리면 화면이 코인으로 덮인다).
        // 처리 토스트는 생략 규약 그대로 — autoforge-toast-suppress.
        if (sold) { this.coinBurst(gained); this.renderTopBar(); }
        return { kept, lastSold };
    },
    // 자동 경로로 흘려보내도 되는 '제작물의 최소 형태'인가 (손상 세이브 방어).
    // 🚨 **`slot` 만 보면 안 된다 (autobatch-partial-item-nan-coins, 2026-08-19 QA 18차 실측).**
    //    종전 가드가 `!it || !it.slot` 이라 `{"slot":"weapon"}` 같은 반쪽 항목이 그대로 통과해
    //    `Forge.autoResolve → sell → sellPrice` 로 갔고, `level`·`rarity` 가 없어
    //    `Math.floor(20 * Math.pow(1.01, NaN) * undefined * …)` = NaN → **`S.coins += NaN`** 이 됐다.
    //    조용한 게 더 나빴다: `U.fmt(NaN)` 이 `0` 을 돌려줘 화면엔 '코인 0' 으로 멀쩡히 찍히고,
    //    세이브에는 `null` 로 직렬화돼(NaN → JSON null) 새로고침하면 기본값 500 으로 되돌아간다
    //    = 모은 코인이 통째로 증발한다.
    // 그래서 **판매·필터·썸네일이 실제로 읽는 필드를 전부** 본다 — 판매가는 `level`·`rarity` 를,
    // 자동 필터는 `age`·`subs` 를, 카드/슬롯 그림은 `age`·`slot` 을 읽는다. 하나라도 빠지면
    // 그 항목은 '제작물'이 아니라 손상된 잔해다.
    isForgeShaped(it) {
        return !!it && typeof it === 'object' && !Array.isArray(it)
            && SLOTS.includes(it.slot)
            && AGES.includes(it.age)
            && RARITIES.includes(it.rarity)
            && Number.isFinite(it.level)
            && Number.isFinite(it.value)
            && Array.isArray(it.subs);
    },
    // 배치 결과를 규약대로 흘려보낸다 — 카드가 걷힌 뒤, 그리고 부팅/탭전환 복원에서도 같은 규칙.
    // **`S.autoBatch` 를 비우는 곳은 여기 하나뿐이다**(경로가 둘이면 한쪽만 고쳐지는 사고가 난다).
    drainAutoBatch() {
        const batch = Array.isArray(S.autoBatch) ? S.autoBatch.splice(0) : [];
        S.autoBatch = null;
        if (!batch.length) return 0;
        let gained = 0, sold = 0;
        for (const it of batch) {
            // 손상 세이브 방어 — **조용히 넘기지 말고 짖는다.** 조용하면 `probe-screens-errors` 의
            // '콘솔 에러 0건' 판정에 안 걸려 다음에도 이 결함이 안 보인다
            // (`probe-creature-framing-crash` 항목에 적힌 그 논지 그대로).
            if (!this.isForgeShaped(it)) {
                console.error('drainAutoBatch: 제작물의 최소 형태가 아닌 autoBatch 항목을 버렸다 —', JSON.stringify(it));
                continue;
            }
            if (Forge.passesAutoFilter(it)) {
                // 목표 통과분은 자동 장착하지 않고 비교 팝업 큐로 넘긴다(사용자 재지적 2026-08-18).
                if (Forge.autoForgeConfig().stopOnTarget && this._autoSeq) this._autoSeq.stopAfterPick = true;
                this.queueAutoMatch(it);               // saveGame 포함
            } else {
                const r = this.autoDispose(it);   // 항상 판매 — 자동 장착은 삭제됐다
                gained += r.gained || 0; sold++;
            }
        }
        // 코인 연출은 배치당 한 번으로 합친다 — 장당 터뜨리면 10장에서 화면이 코인으로 덮인다.
        // (처리 토스트는 생략 규약 그대로 — autoforge-toast-suppress)
        if (sold) this.coinBurst(gained);
        this.renderTopBar();
        this.renderEquipSheet();
        saveGame();
        return batch.length;
    },
    // '목표 아님'으로 판정된 장비의 처리 = **판매**. 반환은 Forge.autoResolve와 같은 { equipped, gained }.
    // 종전엔 목표 설정 여부로 두 갈래였다 — 목표가 있으면 판매, 없으면 `Forge.autoResolve` 의
    // '장착품보다 강하면 자동 장착'에 맡겼다. **그 자동 장착이 통째로 삭제되면서(사용자 지시
    // 2026-08-20 autoforge-no-auto-equip: "절대로") 두 갈래가 같은 동작이 되어 하나로 합쳤다.**
    // 자동 경로에서 장착이 일어나는 자리는 이제 없다 — 장착은 비교 팝업 [장착]뿐이다.
    autoDispose(item) {
        return Forge.autoResolve(item);   // 항상 { equipped: false, gained: 판매액 }
    },
    // 모루 위에 뜨는 결과 카드 한 벌 — 탈락 카드(코인으로 빨려 들어감)와 리빌 카드(떠올라 머무름)가
    // 같은 몸통·같은 좌표계를 쓴다. 궤적만 css 클래스로 갈린다.
    buildCraftCard(item, cls) {
        const host = document.getElementById('app');
        const btn = document.querySelector('.anvil-btn');
        if (!host || !btn) return null;
        const hb = host.getBoundingClientRect(), bb = btn.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = cls;
        el.style.setProperty('--rc', this.ageHex(item.age));
        el.style.left = (bb.left - hb.left + bb.width / 2) + 'px';
        el.style.top = (bb.top - hb.top) + 'px';
        // 장비 슬롯과 같은 룩 — 글씨 없이 프레임 + 장비 모양만 (사용자 지시 2026-08-18 craft-card-slot-look).
        // 'cell-img' 를 넘겨 fit-ink 를 켠다: 슬롯과 똑같이 잉크가 프레임의 THUMB_INK 비율로 맞춰진다.
        el.innerHTML = this.itemImgHTML(item, 'adc-img cell-img');
        host.appendChild(el);
        this.fitThumbs(el);
        return el;
    },
    // 필터 탈락 장비를 모루 위에 잠깐 띄운다 — '무엇이 뽑혔는지'는 항상 보여야 한다(항목 ③)
    AUTO_CARD_MS: 620,
    showAutoDropCard(item, done) {
        const el = this.buildCraftCard(item, 'auto-drop-card');
        if (!el) { done(); return; }
        setTimeout(() => { el.remove(); done(); }, this.AUTO_CARD_MS);
    },
    // 제작 결과를 비교 팝업 '앞에' 카드로 리빌한다 (사용자 지시 2026-08-18:
    // "망치질 → 카드보여줌 → 비교팝업" 순서인데 카드를 안 보여준다).
    // 탈락 카드와 달리 모루 위로 튀어올라 **머문 채** 팝업에 자리를 넘긴다(빨려 들어가지 않는다).
    // 카드가 걷히기 전에 팝업이 겹쳐 뜨면 '보여줬다'가 안 되므로, 카드가 사라진 뒤에 done을 부른다.
    REVEAL_CARD_MS: 560,
    showCraftReveal(item, done) {
        const el = this.buildCraftCard(item, 'auto-drop-card craft-reveal');
        if (!el) { done(); return; }
        SFX.craftReveal(AGES.indexOf(item.age));
        setTimeout(() => { el.remove(); done(); }, this.REVEAL_CARD_MS);
    },
    // 배치 카드판 — 망치 N개로 뽑은 N장을 **한 화면에 동시에** 편다 (사용자 지시 autoforge-cards-at-once:
    // "10개 망치 썼으면 카드 10개 한 번에 보여달라니까. 1초에 1개씩 10개 보여주고 지랄이냐").
    // ⚠️ 장마다 등장 시차를 주지 않는다 — 아무리 짧아도 그게 사용자가 물린 '순차로 뜬다'의 정체다.
    //    전부 같은 애니메이션을 같은 시각에 시작한다(카드판 전체가 한 번에 뜬다).
    CRAFT_BATCH_MS: 1600,
    // 카드판을 펴도 되는 화면 = **모루가 보이는 기본 화면**(하단 시트도 팝업도 안 열린 상태).
    // 자동 제련은 다른 탭·팝업을 보는 동안에도 계속 도는데, 카드판은 `#app` 직속 오버레이라
    // `#game-area` 격리 밖이다 — 탭 패널(z 8)·팝업(z 20·22)을 그대로 덮고 `pointer-events:auto`
    // 라 그 화면의 조작까지 먹었다(QA 실측: 소환 화면 12초 중 35% 구간에서 [소환 x1] 클릭이
    // 카드판에 가로막혔고, 퀘스트 팝업은 9점 히트테스트 9/9 가 가려졌다).
    // ⚠️ **z 를 낮추는 처방은 안 된다** — 8 아래로 내리면 대장간 화면에서도 안 보인다(카드판을
    //    보여 주는 게 `autoforge-cards-at-once` 지시의 본체다). 그래서 화면 조건으로 가른다.
    // ⚠️ 카드판을 `#game-area` 안으로 옮기는 처방도 안 된다 — 모루(`#equip-sheet`)는 `#game-area`
    //    의 **형제**라(index.html), 격리 대역 안으로 넣으면 카드가 모루 위가 아니라 전투 화면에
    //    갇혀 잘린다.
    forgeScreenVisible() {
        if (this.activeTab) return false;                       // 소환·방·디버그 등 하단 시트가 열려 있다
        return !document.querySelector('.modal:not(.hidden)');   // 던전·퀘스트·상점·리그·오프라인 등 팝업
    },
    showCraftBatch(items, done) {
        const host = document.getElementById('app');
        if (!host || !items || !items.length) { done(); return; }
        // 남의 화면을 보는 중이면 **카드 없이 조용히 넘긴다**(`autoforge-toast-suppress` 와 같은 규약).
        // ⚠️ 안 보여 줄 때도 `done()` 은 반드시 부른다 — 이 콜백이 `drainAutoBatch()` 로 이어져 뽑은
        //    장비를 판매/큐로 흘리는 유일한 경로다. 여기서 끊으면 해머만 나가고 결과물이 증발한다.
        if (!this.forgeScreenVisible()) { done(); return; }
        const wrap = document.createElement('div');
        wrap.className = 'craft-batch';
        // 열 수는 장수로 정한다 — 10장이면 4열(3행)이 430px 폭에 들어간다(실측 shot-autoforge-batch).
        wrap.style.setProperty('--cbc', items.length <= 4 ? items.length : items.length <= 9 ? 3 : 4);
        wrap.innerHTML = `<div class="cb-grid">${items.map(it =>
            `<div class="cb-card" style="--rc:${this.ageHex(it.age)}">${this.itemImgHTML(it, 'adc-img cell-img')}</div>`
        ).join('')}</div>`;
        host.appendChild(wrap);
        this.fitThumbs(wrap);
        SFX.craftReveal(AGES.indexOf(items[0].age));
        let done1 = false;
        const finish = () => { if (done1) return; done1 = true; clearTimeout(t); wrap.remove(); done(); };
        wrap.addEventListener('click', finish);        // 눌러서 바로 넘기기 (기다리기 싫은 사용자용)
        const t = setTimeout(finish, this.CRAFT_BATCH_MS);
    },
    // 카드판이 **떠 있는 도중에** 화면이 바뀌면 즉시 걷는다 — 화면 조건 검사(`forgeScreenVisible`)는
    // 펼 때 한 번뿐이라, 이게 없으면 남은 `CRAFT_BATCH_MS`(1.6초) 동안 새 화면을 그대로 덮는다.
    // DOM 만 걷고 타이머는 그대로 둔다 — 남은 타이머의 `finish` 가 `done()` 을 불러 `drainAutoBatch()`
    // 로 결과물을 흘려보내는 유일한 경로이기 때문이다(여기서 같이 끊으면 해머만 나가고 증발한다).
    // 리빌 카드가 `cancelAnvilStrike` 에서 같은 방식으로 처리되는 것과 같은 규약이다.
    dismissCraftBatch() {
        document.querySelectorAll('.craft-batch').forEach(n => n.remove());
    },

    // ---- 대장간 팝업 3종 (UI-SPEC 21~24번): ① 확률 정보 ② 전체 장비 목록 ③ 장비 상세 ----
    _forgeView: 'level', _forgeItem: null,
    openForgeInfo() {
        this._forgeView = 'level';
        this.renderForgeInfo();
        this.showModal(this.els.forgeInfoModal);
    },
    openForgeList() { this._forgeView = 'list'; this.renderForgeInfo(); },
    // 장비 상세는 원본처럼 목록 팝업 '위에' 겹쳐 뜬다 (뒤 목록이 그대로 보임)
    openForgeDetail(age, slot, variant) {
        this._forgeItem = { age, slot, variant };
        this.renderForgeDetailView();
        this.showModal(this.els.forgeItemModal);
    },
    closeForgeItemDetail() { this.els.forgeItemModal.classList.add('hidden'); },
    closeForgeInfo() {
        this.els.forgeItemModal.classList.add('hidden');
        this.els.forgeInfoModal.classList.add('hidden');
    },
    renderForgeInfo() {
        if (this._forgeView === 'list') this.renderForgeListView();
        else this.renderForgeLevelView();
    },
    // 원본(shot-042831) 대조: 풀폭 시대색 막대(좌 이름, 중 현재%, 우측 어두운 변주 세그먼트에 다음%),
    // 상단 재화 pill 2개+우상단 ⓘ, 하단 검정 진행바+[건너뛰기], 닫기=빨간 X
    renderForgeLevelView() {
        const info = Forge.upgradeInfo();
        const upgrading = !!S.forgeUpgradeEndsAt;
        const curP = Forge.ageProbsAt(S.forgeLevel);
        const nextP = info ? Forge.ageProbsAt(S.forgeLevel + 1) : {};
        const pct = p => U.pctTrim(p);   // 세 화면(확률 정보·모든 장비의 목록·자동 제련) 공통 규칙 — U.pctTrim 단일 소스
        const rows = AGES.map(age => {   // 0% 시대도 표시 — 전체 확률표 열람이 목적 (사용자 재지시 2026-08-17)
            const hex = this.ageHex(age);
            // data-age = 시대별 무늬(자동 제련과 공유하는 --af-pat 규칙) · 별은 마지막 시대만 빈 별 —
            // 둘 다 이 화면 원본(shot-042831)에서 읽은 규칙이다
            return `<div class="fi-age-bar" data-age="${age}" style="--ac:${hex}">
                <span class="fi-age-name">${this.ageIcon(age)} ${AGE_KR[age]}<span class="fi-age-star">${this.ageStars()}</span></span>
                <span class="fi-age-cur">${pct(curP[age] || 0)}</span>
                <span class="fi-age-next">${info ? pct(nextP[age] || 0) : '—'}</span>
            </div>`;
        }).join('');

        let actionHtml;
        if (Ascension.ready('forge')) { // Lv.35 도달 — 업그레이드 대신 라인 승천 (사용자 확정 2026-08-17)
            actionHtml = `<button class="btn primary fi-upgrade" onclick="UI.openAscension('forge')">
                ${IconGen.img('star')} 승천<br><small>대장간 Lv.${Ascension.FORGE_LEVEL} 도달 · 이후 제작 장비 ${IconGen.img('star')}${Ascension.count('forge') + 1}</small></button>`;
        } else if (!info) actionHtml = `<div class="fi-upg-label">대장간 최고 레벨</div>`;
        else if (upgrading) {
            const remain = (S.forgeUpgradeEndsAt - U.now()) / 1000;
            actionHtml = `
                <div class="fi-upg-label">업그레이드 진행 중....</div>
                <div class="rates-prog fi-prog"><div id="upg-fill" style="width:${U.clamp(1 - remain / Forge.upgradeTime(info), 0, 1) * 100}%"></div><span id="upg-time">${U.fmtTime(remain)}</span></div>
                <button class="btn fi-skip" onclick="UI.onGemSkipForge()">건너뛰기<br><span class="fi-skip-gem">${IconGen.img('gem')} ${Forge.gemSkipCost()}</span></button>`;
        } else {
            const cost = Forge.upgradeCost(info), time = Forge.upgradeTime(info);
            actionHtml = `<button class="btn primary fi-upgrade ${S.coins < cost ? 'disabled' : ''}" onclick="UI.onStartUpgrade()">
                레벨 ${S.forgeLevel + 1} 업그레이드<br><small>${IconGen.img('coin')} ${U.fmt(cost)} · ⏱ ${U.fmtTime(time)}</small></button>`;
        }

        this.els.forgeInfoModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper fi-card">
                    <button class="fi-info-btn" onclick="UI.openForgeList()">i</button>
                    <h3 class="fi-title">확률 정보</h3>
                    <div class="fi-sub">제련 확률</div>
                    <div class="fi-pills">
                        <span class="fi-pill"><span class="fi-pill-ico coin">${IconGen.img('coin')}</span>${U.fmt(S.coins)}</span>
                        <span class="fi-pill"><span class="fi-pill-ico gem">${IconGen.img('gem')}</span>${U.fmt(S.gems)}</span>
                    </div>
                    <div class="fi-level-row"><span>레벨 ${S.forgeLevel}</span><span class="fi-arrow">▶</span><span>${info ? `레벨 ${S.forgeLevel + 1}` : '최고'}</span></div>
                    <div class="fi-rows">${rows}</div>
                    ${actionHtml}
                </div>
                <button class="x-btn" onclick="UI.closeForgeInfo()">${IconGen.img('xmark')}</button>
            </div>`;
    },
    // 원본(shot-042905): 시대색 헤더 막대 + 회색 패널 안 흰 아이템 셀(별 배지, % 아래 표기), 닫기=빨간 X(확률 정보로 복귀)
    renderForgeListView() {
        // 셀 하단 ★ = 장비 라인 승천 횟수 (age-bar-star-ascension 사용자 확정 사양). 시대 막대와 **같은
        // 소스·같은 접기 규약**을 쓰려고 `ageStars()` 를 그대로 부른다 — 승천 0='' · N회='★'×N · 6+='★N'.
        // ⚠️ 별을 셀 **자식 노드**로 넣으면 안 된다: `hydrateForgeThumbs` 가 썸네일을 채울 때
        //    `el.innerHTML = '<img …>'` 로 셀 내용을 통째로 갈아 끼워 별이 같이 지워진다(실측).
        //    그래서 `data-asc` **속성**에 실어 CSS `content: attr(data-asc)` 가 그리게 한다 —
        //    속성은 innerHTML 교체에도 살아남고, 의사요소는 자식이 아니라 셀 자신에 붙는다.
        const ascStars = this.ageStars(3);   // 셀 폭 한계 — 4개부터 '★N' 접기(위 ageStars 주석의 실측)
        const sections = AGES.map(age => {   // 0% 시대도 표시 — 확률 정보 팝업 계열 (사용자 재지시 2026-08-17)
            const hex = this.ageHex(age);
            const ageP = Forge.ageProbsAt(S.forgeLevel)[age] || 0;
            const p = Forge.itemDropChance(age, 'weapon'); // 무기 변형은 모두 동일 확률
            // 썸네일은 즉시 그리지 않는다 — 시대 10 × 부위별 이름 변형이면 200장이 넘고, 한 장마다
            // 별도 WebGL 렌더+toDataURL이라 목록을 여는 순간 수 초간 얼어붙는다.
            // 이모지를 먼저 깔고 화면에 들어온 셀만 3D 썸네일로 교체한다(hydrateForgeThumbs).
            // --rc = 시대색. 타일은 메인 장비 슬롯(.equip-cell) CSS를 그대로 입는다 — 사용자 재지적
            // (forge-list-frame-color 재오픈): "레벨 표시된 거 빼고는 디자인이 같아야 함".
            // 레벨 배지(.cell-lv)는 여기 마크업에 없으니 그 차이만 저절로 남는다. equip-design-dedupe (나)
            // '레어리티 프레임'은 아이콘 PNG에 굽지 않고(알파 bbox 계약 붕괴 — probe-thumb-plate-cost 실측)
            // 셀 CSS가 진다는 3D 스트림 인계에 따른 것.
            const cell = (onclick, icon, pct, td) => `
                <button class="forge-item-cell" onclick="${onclick}">
                    <span class="fl-face equip-cell" style="--rc:${hex}" data-asc="${ascStars}" data-slot="${td.slot}" data-age="${td.age}" data-ageidx="${td.ageIdx}" data-wtype="${td.wtype || ''}" data-nameidx="${td.nameIdx}">${icon}</span>
                    <small>${pct.toFixed(4)}%</small>
                </button>`;
            // 무기는 그 시대에 등장하는 종류만 (원시에 총이 뜨면 안 됨 — 사용자 지시 2026-08-17)
            const ageIdx = AGES.indexOf(age);
            const weaponCells = weaponsOfAge(age).map(wtype =>
                cell(`UI.openForgeDetail('${age}','weapon','${wtype}')`, this.weaponEmoji(wtype), p,
                     { slot: 'weapon', age, ageIdx, wtype, nameIdx: wtype })).join('');
            const otherCells = ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt'].map(slot => {
                const names = (slot === 'helmet' || slot === 'armor') ? ((ITEM_NAMES[age] && ITEM_NAMES[age][slot]) || []) : accNames(age, slot);
                const sp = Forge.itemDropChance(age, slot);
                // 빈 장비 칸용으로 이미 그려 둔 `slot_*` 실루엣을 그대로 쓴다(같은 부위, 같은 그림).
                // 이 셀은 3D 썸네일이 흘러들기 전까지 보이는 플레이스홀더인데, 하이드레이션이
                // 뷰포트 지연이라 실제로는 화면 안에서도 대부분 이 그림이 오래 남는다.
                const icon = IconGen.img('slot_' + slot)
                    || (slot === 'helmet' ? '🪖' : slot === 'armor' ? '👕' : (this.SLOT_EMOJI[slot] || '🎁'));
                return names.map((name, i) => cell(`UI.openForgeDetail('${age}','${slot}',${i})`, icon, sp,
                                                  { slot, age, ageIdx, wtype: null, nameIdx: i })).join('');
            }).join('');
            return `<div class="forge-age-section">
                <div class="fi-age-bar fl-head" data-age="${age}" style="--ac:${hex}">
                    <span class="fi-age-name">${this.ageIcon(age)} ${AGE_KR[age]}<span class="fi-age-star">${this.ageStars()}</span></span>
                    <span class="fi-age-cur">${U.pctTrim(ageP)}</span>
                </div>
                <div class="forge-item-grid">${weaponCells}${otherCells}</div>
            </div>`;
        }).join('');

        // 셀 하단 ★은 이제 셀 자신의 `data-asc`(위 ascStars)가 켜고 **개수까지** 정한다.
        // 예전엔 카드에 `.fl-asc` 를 붙여 '있다/없다'만 게이트했는데 그 방식은 개수를 모른다 —
        // CSS `content:'★'` 이 리터럴 한 글자라 승천 3회·7회에도 셀당 별이 1개였다(실측 FAIL).
        // 게이트가 두 층이면 한쪽만 고쳐지는 사고가 재발하므로 `.fl-asc` 는 통째로 걷었다.
        this.els.forgeInfoModal.innerHTML = `
            <div class="idet-wrap fl-wrap">
                <div class="modal-card paper fl-card">
                    <h3 class="fi-title">모든 장비의 목록</h3>
                    <div class="forge-age-list">${sections}</div>
                </div>
                <button class="x-btn" onclick="UI.openForgeInfo()">${IconGen.img('xmark')}</button>
            </div>`;
        this.hydrateForgeThumbs(this.els.forgeInfoModal);
    },

    // ---- 탈것 아이콘 = 실제 3D 탈것 (사용자 지시 2026-08-18) ----
    // 슬롯에 이모지(🐴)를 박아 두면 실제로 소환되는 탈것과 생김새가 전혀 달라 '다른 물건'으로 읽힌다.
    // 장비 썸네일과 같은 방식: 이모지를 먼저 깔고 다음 프레임에 3D 스냅샷으로 교체한다
    // (첫 썸네일 호출이 렌더러·PMREM 환경맵을 만드느라 유독 무거워 동기로 부르면 화면이 붙잡힌다).
    // rarity 를 주면 그 개체의 등급을 쓰고, 안 주면 같은 이름의 아무 개체에서 찾는다 —
    // 이름↔등급은 `mountNames` 에서 1:1이라 결과는 같지만, 개체를 쥐고 있는 호출부는 넘기는 게 명확하다.
    mountFace(name, cls, rarity, stars) {
        const inst = (Array.isArray(S.mounts) ? S.mounts.find(m => m && m.name === name) : null) || {};
        const r = rarity || inst.rarity || '';
        // 승천 티어(별%6) 데코가 썸네일에 반영돼야 한다 (ascend-design-tiers ⑴ — 셀 아이콘의 stars 축).
        // 개체를 쥔 호출부는 stars 를 직접 넘기고, 이름만 아는 호출부는 같은 이름의 개체에서 찾는다.
        const st = stars !== undefined ? stars : inst.stars;
        return this.creatureFace('mount', name, r, cls, MOUNT_ICONS[name] || '🐴', st);
    },
    // ⚠️ 이미 구워 둔 썸네일이면 **이모지를 거치지 않고 바로 박는다.** 매번 이모지로 깔고
    //    하이드레이트를 기다리면, 그리는 도중에 또 다시 그려지는 화면에서는 앞 프레임의 작업이
    //    떨어져 나가 몇 칸이 이모지로 남는다(실측: 탈것 화면 15칸 중 3칸이 간헐적으로 잔존).
    //    첫 굽기 때만 이모지 폴백이 필요하고, 그 뒤로는 다시 그려도 항상 완성된 그림이 나온다.
    creatureFace(kind, name, rarity, cls, emoji, stars) {
        const attrs = `class="${cls} mt-face" data-kind="${kind}" data-mt="${name || ''}" data-rarity="${rarity || ''}" data-stars="${stars || 0}"`;
        const url = typeof Scene3D !== 'undefined' && Scene3D.creatureThumbCached
            ? Scene3D.creatureThumbCached(kind, name, rarity, stars) : null;
        if (url) return `<span ${attrs.replace('mt-face', 'mt-face has-thumb')}><img src="${url}" alt=""></span>`;
        return `<span ${attrs}>${emoji}</span>`;
    },
    // 펫도 같은 문제(🐾 이모지 ≠ 실제 3D 펫) — 완전히 같은 파이프라인을 쓴다
    petFace(name, cls, stars) {
        const st = stars !== undefined ? stars
            : (((S.pets || []).find(p => p && p.name === name)) || {}).stars;
        return this.creatureFace('pet', name, '', cls, PET_ICONS[name] || '🐾', st);
    },
    hydrateMountThumbs(root) {
        const scope = root || document;
        if (typeof Scene3D === 'undefined' || !Scene3D.mountThumb) return;
        const faces = [...scope.querySelectorAll('.mt-face[data-mt]:not(.has-thumb)')].filter(e => e.dataset.mt);
        if (!faces.length) return;
        requestAnimationFrame(() => {
            for (const el of faces) {
                if (!el.isConnected) continue;
                const st = Number(el.dataset.stars) || 0;   // 승천 티어 축 — creatureFace 가 심는다
                const url = el.dataset.kind === 'pet'
                    ? Scene3D.petThumb(el.dataset.mt, st)
                    : Scene3D.mountThumb(el.dataset.mt, el.dataset.rarity || 'common', st);
                if (url) { el.innerHTML = `<img src="${url}" alt="">`; el.classList.add('has-thumb'); }
            }
        });
    },

    // 화면에 들어온 장비 셀만 3D 스냅샷 썸네일로 교체 — 같은 부위 5개가 전부 같은 이모지로 반복되던 문제를
    // 이름 변형별로 실제 다른 그림이 되게 한다 (썸네일은 Scene3D 쪽에서 키 단위로 캐시된다).
    hydrateForgeThumbs(root) {
        if (!root || typeof Scene3D === 'undefined' || !Scene3D.itemThumb) return;
        const faces = [...root.querySelectorAll('.fl-face[data-slot]')];
        if (!faces.length) return;
        this._thumbJob = (this._thumbJob || 0) + 1;
        const job = this._thumbJob;   // 목록을 다시 그리면 이전 작업은 스스로 멈춘다
        const paint = (el) => {
            const url = Scene3D.itemThumb({
                slot: el.dataset.slot, age: el.dataset.age, ageIdx: Number(el.dataset.ageidx),
                rarity: 'common', wtype: el.dataset.wtype || null,
                nameIdx: el.dataset.slot === 'weapon' ? el.dataset.nameidx : Number(el.dataset.nameidx),
            });
            if (url) { el.innerHTML = `<img src="${url}" alt="">`; el.classList.add('has-thumb'); }
        };
        // 한 프레임에 몇 장씩만 굽는다 — 300장을 한 번에 렌더하면 목록을 여는 순간 수 초간 얼어붙고,
        // IntersectionObserver 지연 로딩은 환경에 따라 콜백이 아예 안 오는 경우가 있어(헤드리스 실측) 쓰지 않는다.
        let i = 0;
        const CHUNK = 6;
        const pump = () => {
            if (job !== this._thumbJob) return;                       // 더 최신 렌더가 시작됨
            if (root.classList && root.classList.contains('hidden')) return;  // 목록이 닫힘 — 남은 건 굽지 않는다
            for (let n = 0; n < CHUNK && i < faces.length; n++, i++) paint(faces[i]);
            if (i < faces.length) requestAnimationFrame(pump);
        };
        // 첫 묶음도 다음 프레임에 — 첫 itemThumb 호출이 썸네일 렌더러·PMREM 환경맵을 만드느라
        // 유독 무거워서(소프트웨어 GL 실측 2.4초), 동기로 부르면 목록이 뜨는 순간을 그대로 붙잡는다.
        // 이모지가 먼저 깔려 있으니 한두 프레임 늦게 채워도 빈 칸으로 보이지 않는다.
        requestAnimationFrame(pump);
    },
    renderForgeDetailView() {
        const { age, slot, variant } = this._forgeItem;
        const ageIdx = AGES.indexOf(age);
        let name, icon;
        if (slot === 'weapon') {
            name = `${(WEAPON_TYPES[variant] || {}).kr || SLOT_KR.weapon}`;
            icon = this.weaponEmoji(variant);
        } else if (slot === 'helmet' || slot === 'armor') {
            name = (ITEM_NAMES[age] && ITEM_NAMES[age][slot] && ITEM_NAMES[age][slot][variant]) || SLOT_KR[slot];
            icon = slot === 'helmet' ? '🪖' : '👕';
        } else {
            const accs = accNames(age, slot);
            name = accs[variant];
            icon = this.SLOT_EMOJI[slot] || '🎁';
        }
        const main = SLOT_MAIN[slot];
        const baseVal = Math.floor(main === 'atk' ? Forge.tierBaseAtk(ageIdx) : Forge.tierBaseHp(ageIdx));
        const p = Forge.itemDropChance(age, slot);
        // 원본 표기: 값 범위가 먼저, 옵션 이름이 뒤 ("+1% - 12% 치명타 확률")
        const subsListHtml = SUBSTATS.map(([key, label, max]) =>
            `<div class="substat-row">${U.subRangeText(key, max)} ${label}</div>`).join('');
        const thumb = (typeof Scene3D !== 'undefined')
            ? Scene3D.itemThumb({ slot, age, ageIdx, rarity: 'common', wtype: slot === 'weapon' ? variant : null, nameIdx: variant })
            : null;

        // UI-SPEC 21~24번 '장비 상세 팝업' — 흰 카드, 좌측 아이콘 + 우측 제목/주스탯, 아래 회색 옵션 패널.
        // 닫기는 원본처럼 카드 아래 중앙의 빨간 원형 X.
        this.els.forgeItemModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper item-detail">
                    <div class="idet-head">
                        <!-- --rc = 시대색: 목록과 같은 언어로 프레임에 등급색을 준다 (사용자 지시 2026-08-19 forge-list-frame-color) -->
                        <div class="idet-icon" style="--rc:${this.ageHex(age)}">${thumb ? `<img src="${thumb}" alt="">` : icon}</div>
                        <div class="idet-title">
                            <div class="idet-name">[${AGE_KR[age]}] ${name}</div>
                            <div class="idet-main">${U.fmt(baseVal)} ${main === 'atk' ? '피해' : '체력'}</div>
                        </div>
                    </div>
                    <div class="idet-subs">
                        <div class="idet-lead">장비은(는) 아래 목록에서 2x개의 고유한 하위 스탯을 굴립니다:</div>
                        ${subsListHtml}
                    </div>
                </div>
                <button class="x-btn" title="닫기" onclick="UI.closeForgeItemDetail()">${IconGen.img('xmark')}</button>
            </div>`;
    },

    // ---- 자동 제련 팝업 (UI-SPEC 21~24번 ④) ----
    // 메인 화면 [자동 ON/OFF] 버튼 — 꺼져 있으면 설정 팝업을 열고, **돌고 있으면 그 자리에서 끈다**
    // (사용자 지시 2026-08-19 `auto-toggle-click-off`: "자동 OFF/자동 ON 버튼, 자동모드일 때 클릭하면
    //  자동모드 끝난 거로 처리하기"). 종전에는 ON 이든 OFF 든 설정 팝업만 떠서, 끄려면 팝업을 열고
    // [중지]를 한 번 더 눌러야 했다.
    onAutoForgeBtn() {
        if (!isUnlocked('autoForge')) { this.toast('🔒 스테이지 2-10 도달 시 해금됩니다'); return; }
        if (!S.autoForgeOn) { this.openAutoForge(); return; }
        // 진행 중 사이클도 같이 끊는다 — 망치질 연출·타이머를 걷고(cancelAnvilStrike) 시퀀스를 정지한다.
        // 이미 뽑힌 장비(대기품·통과분 큐)는 해머를 쓴 결과물이라 정지해도 그대로 남아 선택을 받는다.
        this.cancelAnvilStrike();
        this.stopAutoSeq();          // S.autoForgeOn=false · 버튼 갱신 · 저장 · 남은 큐 배출까지 담당
        this.closeAutoForge();
        this.toast('⏹ 자동 제련을 종료했습니다');
    },
    openAutoForge() {
        if (!isUnlocked('autoForge')) { this.toast('🔒 스테이지 2-10 도달 시 해금됩니다'); return; }
        this.renderAutoForge();
        this.showModal(this.els.autoForgeModal);
    },
    closeAutoForge() { this._afDdOpen = false; this.els.autoForgeModal.classList.add('hidden'); },
    // 원본(shot-042950/043117) 대조: 유지=풀폭 시대색 막대+체크, 필터=우측 토글+회색 pill 행,
    // 망치 수=검정 스피너, 하단 큰 파란 [시작], 닫기=카드 아래 빨간 X
    renderAutoForge() {
        const cfg = Forge.autoForgeConfig();
        const probs = Forge.ageProbsAt(S.forgeLevel);
        const pct = p => U.pctTrim(p);   // 세 화면(확률 정보·모든 장비의 목록·자동 제련) 공통 규칙 — U.pctTrim 단일 소스
        // 자동 제련만 0% 시대를 숨긴다 — 여긴 '뽑을 수 있는 시대'를 고르는 화면이라 못 뽑는 시대가 있으면 안 된다 (사용자 재지시 2026-08-17)
        const ageRows = AGES.filter(age => (probs[age] || 0) > 0).map(age => `
            <div class="af-age-bar" data-age="${age}" style="--ac:${this.ageHex(age)}" onclick="UI.onToggleKeepAge('${age}')">
                <span class="af-check ${cfg.keepAges.includes(age) ? 'on' : ''}">${cfg.keepAges.includes(age) ? IconGen.img('check', null, { tint: '#23c552' }) : ''}</span>
                <span class="af-age-name">${this.ageIcon(age)} ${AGE_KR[age]}<span class="af-age-star">${this.ageStars()}</span></span>
                <span class="af-age-pct">${pct(probs[age] || 0)}</span>
            </div>`).join('');
        const subRows = SUBSTATS.map(([key, label]) => `
            <div class="af-sub-row" onclick="UI.onToggleFilterSub('${key}')">
                <span class="af-check ${cfg.filterSubs.includes(key) ? 'on' : ''}">${cfg.filterSubs.includes(key) ? IconGen.img('check', null, { tint: '#23c552' }) : ''}</span>
                <span>${label}</span>
            </div>`).join('');

        this.els.autoForgeModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper af-card">
                    <h3 class="af-title">자동 제련</h3>
                    <div class="af-scroll">
                        <div class="af-label">유지</div>
                        ${ageRows}
                        <div class="af-filter-row">필터
                            <span class="af-toggle ${cfg.filterOn ? 'on' : ''}" onclick="UI.onToggleAutoFilterOn()"><span class="knob"></span></span>
                        </div>
                        ${cfg.filterOn ? subRows : ''}
                    </div>
                    <div class="af-bottom">
                        <div class="af-row"><span>한 번에 사용된 망치 수</span>
                            <div class="af-dd">
                                <button class="af-spinner" onclick="UI.onToggleHammerDd(event)">${cfg.hammersPerBatch}<span class="af-spin-arrow">${this._afDdOpen ? '▼' : '▲'}</span></button>
                                ${this._afDdOpen ? `<div class="af-dd-list">${Array.from({ length: this.hammerBatchMax() }, (_, n) => `<button class="${cfg.hammersPerBatch === n + 1 ? 'on' : ''}" onclick="UI.onPickHammers(${n + 1})">${n + 1}</button>`).join('')}</div>` : ''}
                            </div></div>
                        <div class="af-row"><span>목표 장비를 찾으면 제련 계속하기</span>
                            <span class="af-check ${cfg.stopOnTarget ? '' : 'on'}" onclick="UI.onToggleStopOnTarget()">${cfg.stopOnTarget ? '' : IconGen.img('check', null, { tint: '#23c552' })}</span></div>
                        <button class="btn primary af-start" onclick="UI.onToggleAutoForge()">${S.autoForgeOn ? '중지' : '시작'}</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeAutoForge()">${IconGen.img('xmark')}</button>
            </div>`;
        // 망치 수 목록은 6칸 창에 22개가 들어가는 스크롤 목록이다. 새로 그리면 scrollTop이 0이라
        // 기본값 10이 선택돼 있어도 1~6만 보여 "지금 몇인지"도 "22까지 있다"는 것도 알 수 없다.
        // 선택 항목을 창 가운데로 스크롤해 현재 값과 위아래 범위가 함께 보이게 한다.
        if (this._afDdOpen) {
            const list = this.els.autoForgeModal.querySelector('.af-dd-list');
            const on = list && list.querySelector('button.on');
            if (on) list.scrollTop = on.offsetTop - (list.clientHeight - on.offsetHeight) / 2;
        }
    },
    onToggleKeepAge(age) {
        const cfg = Forge.autoForgeConfig();
        const pos = cfg.keepAges.indexOf(age);
        if (pos >= 0) cfg.keepAges.splice(pos, 1); else cfg.keepAges.push(age);
        saveGame(); this.renderAutoForge();
    },
    onToggleFilterSub(key) {
        const cfg = Forge.autoForgeConfig();
        const pos = cfg.filterSubs.indexOf(key);
        if (pos >= 0) cfg.filterSubs.splice(pos, 1); else cfg.filterSubs.push(key);
        saveGame(); this.renderAutoForge();
    },
    onToggleAutoFilterOn() {
        const cfg = Forge.autoForgeConfig();
        cfg.filterOn = !cfg.filterOn;
        saveGame(); this.renderAutoForge();
    },
    // 망치 수 커스텀 드롭다운 (사용자 지시: 순환 탭 대신 목록에서 바로 선택) — 상한 22는 UI-SPEC 82번 "1~22 범위" 원본 근거
    HAMMER_BATCH_MAX: 22,
    // 기술트리 '오토포지' 노드가 1회 동시 해머 상한을 올린다 (업당 +1)
    hammerBatchMax() { return this.HAMMER_BATCH_MAX + TechTree.autoForgeSlotBonus(); },
    _afDdOpen: false,
    onToggleHammerDd(ev) {
        ev.stopPropagation();
        this._afDdOpen = !this._afDdOpen;
        this.renderAutoForge();
    },
    onPickHammers(n) {
        const cfg = Forge.autoForgeConfig();
        cfg.hammersPerBatch = U.clamp(n, 1, this.hammerBatchMax());
        this._afDdOpen = false;
        saveGame(); this.renderAutoForge();
    },
    // 체크(기본) = 목표를 찾아도 예산 끝까지 계속 / 해제 = 목표를 찾는 순간 정지 + 비교 팝업.
    // 저장 필드는 정지 쪽(stopOnTarget)이 참이다 — 기본값 false가 '계속'이 되도록.
    onToggleStopOnTarget() {
        const cfg = Forge.autoForgeConfig();
        cfg.stopOnTarget = !cfg.stopOnTarget;
        saveGame(); this.renderAutoForge();
    },

    // 제작 버튼은 ⚒️ 이모지가 아니라 원본(shot-042120)처럼 모루 그림이어야 한다.
    // 원본 실측(499×892 스크린샷에서 모루가 차지하는 영역 ≈107×76px, 가로세로 1.41:1)을 viewBox로
    // 옮겨 인라인 SVG로 그린다 — 외부 에셋 금지 제약을 지키면서 어느 배율에서도 또렷하다.
    // 구성은 원본과 같은 4단: 오른쪽으로 뻗는 뿔 / 상판(윗면 밝은 면 + 앞면 그늘) / 좁고 어두운 허리 /
    // 상판보다 넓은 받침(밝은 테 + 몸통). 금속 질감·하이라이트 고도화는 폴리싱 단계 몫이다.
    // ---- 모루 일러스트 ----
    // 형태·비율은 원본 shot-042120을 `tools/probe-anvil-ref.js`로 실루엣 스캔해 맞췄다.
    // 원본 실측(스캔창 180,668 기준): 실루엣 110×79(종횡비 1.39) / 상판 앞면 바닥 %H 43.6 /
    // 목 %H 44.9~50, 폭 45%W, 중심 47%W / 받침 %H 51~100, 최대폭 91%W / 뿔은 상판 오른쪽에서
    // 20%W 돌출하고 **끝이 둥글다**. 예전 도형은 목이 23%W(절반)에 중심 37%W(왼쪽으로 치우침),
    // 받침 최대폭 73%W, 뿔이 뾰족한 삼각형이라 원본과 다른 물건이었다.
    // ⚠️ viewBox(132×86)는 **그대로 둔다** — 버튼 박스 높이가 곧 모루 행 높이라 비율 검증 대상이다.
    //    바뀐 것은 그 안에 그려지는 그림의 비율뿐(x 10~121, y 3~83 = 1.39).
    ANVIL_SVG: `<svg class="anvil-svg" viewBox="0 0 132 86" aria-hidden="true">
            <defs>
                <linearGradient id="anv-top" x1="0" y1="0" x2=".55" y2="1">
                    <stop offset="0" stop-color="#d2582a"/><stop offset=".46" stop-color="#b03f18"/>
                    <stop offset="1" stop-color="#8d2a0b"/>
                </linearGradient>
                <linearGradient id="anv-front" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#7a3020"/><stop offset=".55" stop-color="#5a1e11"/>
                    <stop offset="1" stop-color="#3d1209"/>
                </linearGradient>
                <linearGradient id="anv-horn" x1=".1" y1="0" x2=".9" y2="1">
                    <stop offset="0" stop-color="#c04a1c"/><stop offset=".5" stop-color="#9a2f0d"/>
                    <stop offset="1" stop-color="#661a03"/>
                </linearGradient>
                <!-- 받침은 세로 그라디언트 — 대각선으로 깔면 모서리 라운드와 맞물려 '플라스틱 캡슐'로 읽힌다.
                     주철은 윗면 근처만 반사가 고이고 아래로 갈수록 고르게 어두워진다. -->
                <linearGradient id="anv-base" x1="0" y1="0" x2=".12" y2="1">
                    <stop offset="0" stop-color="#7e3626"/><stop offset=".22" stop-color="#6d2c1e"/>
                    <stop offset=".72" stop-color="#4e1d13"/><stop offset="1" stop-color="#3a150d"/>
                </linearGradient>
                <!-- 주조 결 — 세로로 옅은 명암 줄을 몇 개 겹쳐 매끈한 면을 깬다 -->
                <linearGradient id="anv-grain" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#fff" stop-opacity=".07"/>
                    <stop offset=".18" stop-color="#000" stop-opacity=".05"/>
                    <stop offset=".37" stop-color="#fff" stop-opacity=".05"/>
                    <stop offset=".55" stop-color="#000" stop-opacity=".06"/>
                    <stop offset=".74" stop-color="#fff" stop-opacity=".04"/>
                    <stop offset="1" stop-color="#000" stop-opacity=".07"/>
                </linearGradient>
                <linearGradient id="anv-recess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#170a07"/><stop offset="1" stop-color="#311710"/>
                </linearGradient>
                <linearGradient id="anv-neck" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#120c0b"/><stop offset=".42" stop-color="#2b1c18"/>
                    <stop offset="1" stop-color="#0e0807"/>
                </linearGradient>
                <!-- 상판 윗면 스펙큘러 — 금속은 면 전체가 고르게 밝지 않고 한쪽에 광택이 고인다 -->
                <linearGradient id="anv-spec" x1="0" y1="0" x2="1" y2=".6">
                    <stop offset="0" stop-color="#fff" stop-opacity=".24"/>
                    <stop offset=".42" stop-color="#fff" stop-opacity=".07"/>
                    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
                </linearGradient>
                <!-- 빌릿(두들길 소재) — 위가 밝고 아래로 갈수록 식은 붉은색. 달군 쇠는 표면이
                     제일 뜨겁고 모루에 닿은 밑면이 열을 뺏겨 가장 어둡다. -->
                <linearGradient id="anv-billet" x1="0" y1="0" x2=".15" y2="1">
                    <stop offset="0" stop-color="#fff6c8"/><stop offset=".26" stop-color="#ffce4e"/>
                    <stop offset=".62" stop-color="#ff8a12"/><stop offset="1" stop-color="#c73406"/>
                </linearGradient>
                <!-- 백열 겹 — 타격 순간에만 opacity 로 켠다. ⚠️ fill 을 애니메이션하지 말 것
                     (타격 오버레이에서 fill 애니메이션이 screen 합성 층을 통째로 죽인 전례). -->
                <linearGradient id="anv-billethot" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#fff3c0"/>
                    <stop offset="1" stop-color="#ffb03a" stop-opacity="0"/>
                </linearGradient>
                <!-- ⚠️ 가운데가 **희어야** 빛이다. 처음엔 #ffb43c 로 시작했는데 주황 상판 위에
                     얹히자 3타 프레임에서 빛이 아니라 **베이지색 웅덩이**로 읽혔다(확대 실측) —
                     플래시에서 이미 겪은 것과 같은 함정('빛이어야지 물감이면 안 된다'). -->
                <radialGradient id="anv-billetglow" cx=".5" cy=".5" r=".5">
                    <stop offset="0" stop-color="#fff2c8" stop-opacity=".8"/>
                    <stop offset=".46" stop-color="#ff9a2e" stop-opacity=".42"/>
                    <stop offset="1" stop-color="#ff5a00" stop-opacity="0"/>
                </radialGradient>
            </defs>
            <g stroke="#170d0b" stroke-width="3" stroke-linejoin="round">
                <!-- 받침 (가장 뒤) -->
                <path d="M20 44 L101 44 Q109 46 109 58 L109 74 Q109 83 100 83 L19 83 Q10 83 10 74 L10 58 Q10 46 20 44 Z" fill="url(#anv-base)"/>
                <!-- 받침 음각 단 — 원본은 받침 윗면이 한 단 파여 있다 -->
                <path d="M27 48 L94 48 Q100 49 100 55 L100 61 L27 61 Q21 60 21 54 Z" fill="url(#anv-recess)" stroke-width="2.4"/>
                <!-- 목 -->
                <path d="M38 38 L87 38 L85 45 L40 45 Z" fill="url(#anv-neck)"/>
                <!-- 뿔 — 끝이 둥근 총알 형태 -->
                <path d="M90 3 Q112 6 121 16 Q112 23 95 25 Z" fill="url(#anv-horn)"/>
                <!-- 상판 앞면 -->
                <path d="M12 26 L95 25 L95 39 L12 40 Z" fill="url(#anv-front)"/>
                <!-- 상판 윗면 -->
                <path d="M23 4 L90 3 L95 25 L12 26 Z" fill="url(#anv-top)"/>
            </g>
            <g stroke="none" pointer-events="none">
                <!-- 윗면 광택 + 상단 베벨 엣지 -->
                <path d="M23 4 L90 3 L95 25 L12 26 Z" fill="url(#anv-spec)"/>
                <path d="M24.6 6 L88.6 5.1 L89.6 9.4 L25.4 10.2 Z" fill="#ffb083" opacity=".5"/>
                <!-- ===== 모루의 어휘: 스텝 · 하디 홀 · 프리첼 홀 (비평가 4차 잔여 ⓛ) =====
                     비평가 B: "92px 에서 '모루'라는 어휘가 아니라 **주황 블록 + 로켓 노즈**로
                     내려앉는다." 원인은 상판이 **아무 특징 없는 민짜 사다리꼴**이라는 것이다.
                     실물 모루를 한눈에 모루로 만드는 건 뿔이 아니라 상판 위의 이 세 구멍/단이다.
                     🚨 **좌표는 감으로 찍지 말 것 — 상판 면을 매개변수로 풀어서 뽑았다.**
                     상판은 M23 4 / L90 3 / L95 25 / L12 26 인 기울어진 사다리꼴이라, 그 위에 놓이는
                     구멍은 **같은 기울기로 찌그러져야** 면에 얹힌 것으로 읽힌다(축정렬 사각형을
                     올리면 상판 위에 뜬 스티커가 된다). 뒤 모서리 back(u)=(23+67u, 4−u),
                     앞 모서리 front(u)=(12+83u, 26−u), 면 위의 점 P(u,v)=lerp(back(u),front(u),v).
                     아래 값은 전부 그 식에서 나왔다(u=길이 방향 0=굽 1=뿔, v=깊이 0=뒤 1=앞).
                     ⚠️ 빌릿(x 43.2~67.6)을 피해 전부 **굽 쪽(x<43)** 에 몰아 놨다. 실물도 하디·
                        프리첼은 굽 쪽에 있고, 대장장이가 두들기는 자리(빌릿)는 상판 중앙이다. -->
                <!-- 스텝(커팅 테이블) — 뿔 바로 앞의 한 단 낮은 선반. u 0.88~1.0.
                     낮으니 빛을 덜 받아 어둡고, 단이 지는 왼쪽 모서리에만 얇은 수직 벽이 선다.
                     ⚠️ 1차 시안은 어둡게 깐 판(opacity .26) + 얇은 밝은 줄이었는데 92px 에서
                        상판 그라디언트에 묻혀 **긁힌 자국**으로 읽혔다(캡처 확인). 단은 '어두운
                        판'이 아니라 **한 단 떨어지는 벼랑**이다 — 벼랑 윗선(밝음)과 벼랑 면(어두움)이
                        나란히 서야 눈이 깊이로 읽는다. 셋을 다 세게 준다. -->
                <path d="M83.9 3.08 L90 3 L95 25 L86.98 25.09 Z" fill="#3a1409" opacity=".62"/>
                <path d="M81.5 3.13 L83.9 3.08 L86.98 25.09 L84.28 25.12 Z" fill="#1b0d07" opacity=".78"/>
                <path d="M80.6 3.14 L81.9 3.12 L85.0 25.13 L83.6 25.14 Z" fill="#ffc79e" opacity=".72"/>
                <!-- 하디 홀 — 각봉 공구를 꽂는 **네모** 구멍. u 0.06~0.19 · v 0.30~0.62 -->
                <path d="M24.01 10.54 L33.34 10.41 L30.80 17.45 L20.80 17.58 Z" fill="#140a06" opacity=".92"/>
                <!-- 구멍의 앞쪽 안벽만 빛을 받는다 — 이 한 줄이 '구멍'과 '검은 네모'를 가른다 -->
                <path d="M20.80 17.58 L30.80 17.45 L30.25 19.03 L20.25 19.16 Z" fill="#c98a6a" opacity=".5"/>
                <!-- 프리첼 홀 — 못 구멍을 뚫는 **둥근** 구멍. u 0.275 · v 0.45. 상판이 기울어 보이므로
                     정원이 아니라 납작한 타원이라야 같은 면에 누운 것으로 읽힌다. -->
                <ellipse cx="38.46" cy="13.63" rx="2.5" ry="1.7" fill="#140a06" opacity=".92"/>
                <path d="M36.16 14.25 A2.5 1.7 0 0 0 40.76 14.25 A2.5 1.7 0 0 1 36.16 14.25 Z" fill="#c98a6a" opacity=".45"/>
                <!-- 앞면 대각 음영 띠 — 원본 모루에도 같은 결이 있다 -->
                <path d="M34 26.6 L42 26.5 L32 39.6 L24 39.7 Z" fill="#000" opacity=".16"/>
                <path d="M66 26.2 L72 26.1 L62 39.3 L56 39.4 Z" fill="#000" opacity=".16"/>
                <!-- 뿔 림라이트 -->
                <path d="M92 5.6 Q110 8.4 117.6 15.6 Q112 12 92 8.6 Z" fill="#ff9a63" opacity=".55"/>
                <!-- 받침 하이라이트 / 접지 그림자 -->
                <path d="M22 46.4 L99 46.4 Q104 47 104.6 50.6 Q99 48.6 22 48.8 Z" fill="#c07a5e" opacity=".34"/>
                <path d="M13 76 L106 76 Q104.6 81 99 81 L20 81 Q14.4 81 13 76 Z" fill="#000" opacity=".24"/>
                <!-- 주조 결 + 좌측 반사 띠 — 광택 한 덩어리가 아니라 결 위에 얹힌 반사로 보이게 -->
                <path d="M20 44 L101 44 Q109 46 109 58 L109 74 Q109 83 100 83 L19 83 Q10 83 10 74 L10 58 Q10 46 20 44 Z" fill="url(#anv-grain)"/>
                <path d="M14.5 52 Q13.5 66 16.5 78 Q20 66 20 53 Z" fill="#e0a184" opacity=".18"/>
                <!-- ===== 두들길 소재(빌릿) — 상판 위에 얹힌 달군 쇳덩이 =====
                     대장장이는 **맨 모루면을 치지 않는다.** 이게 없으면 망치의 하중을 모루가 대신
                     먹어 강철 모루가 세로로 11% 눌리는 '고무 모루' 그림이 된다(비평가 B 가 두 번의
                     채점에서 모두 상위로 꼽은 결함 — "이 한 요소가 타격감·접촉 설득력·이펙트·
                     3타 위계를 동시에 올린다").
                     🚨 **접점이 상판(y=14)에서 빌릿 윗면(y=11)으로 올라간다.** 이 값은 혼자 못 움직인다 —
                        ANVIL_HIT_Y · SINK_Y(FX 배치) · afswing 접촉 translate · afexit 0% ·
                        .af-hammer transform-origin · HAMMER_SVG 배치 translate · probe-anvil-hammer 의
                        ①⑫ 기준점이 **한 벌**이다. 하나만 고치면 망치가 허공을 치거나 불티가 딴 데서 튄다.
                     기준점: 윗면 능선 (45.6,11.2)→(64.6,10.7) 이 x=55 에서 y=10.95 를 지난다.
                        바닥(=압축 축) y=21.5, 즉 높이 10.5유닛. scaleY s 일 때 윗면 = 21.5 − 10.5s.
                     🚨 **모서리를 둥글리지 말 것.** 처음엔 rx 2.4 라운드 바로 그렸는데 비평가 2인이
                        독립적으로 "달군 쇳덩이가 아니라 **UI 배지·진행도 칩·젤리**"로 읽었다 —
                        네 모서리가 다 둥근 알약은 게임 UI 의 어휘다. 소재(stock)는 **모서리를 챔퍼로
                        깎은 각봉**이어야 한다. 지금은 8각 폴리곤이고 곡선이 하나도 없다.
                     🚨 **키를 키운 이유**: 7.4유닛(5.2px)짜리 빌릿은 아무리 눌러도 절대 변위가
                        1.4px 뿐이라, 같은 프레임에 5.6px 내려가는 모루에 **하중 귀속이 그대로 넘어갔다**
                        (비평가 B 실측, 4:1). 눈은 비율이 아니라 **더 많이 움직인 쪽**을 무른 물체로 읽는다. -->
                <g class="anv-billet">
                    <!-- 달군 쇠가 상판에 흘리는 빛 웅덩이. 접지 그림자를 어둡게 그리면 안 된다 —
                         빛을 내는 물체는 제 발밑을 어둡게 만들지 않는다.
                         ⚠️ 크게 깔면 안 된다. 처음엔 rx 21 로 상판 폭의 절반을 덮었는데, 확대에서는
                         멋있어도 네이티브 92px 에서는 **상판 윗면이 통째로 뿌옇게 떠서** 모루 형태가
                         죽고 빌릿은 그 안에 묻혔다. 빌릿 실루엣에 바짝 붙인다. -->
                    <ellipse class="ab-glow" cx="55" cy="16.6" rx="14.5" ry="5.4" fill="url(#anv-billetglow)" opacity=".5"/>
                    <!-- 🚨 **키라인이 있어야 물체가 된다.** 처음엔 '빛나는 물체라 외곽선이 없어야
                         한다'고 보고 stroke 를 안 줬는데, 네이티브 92px 에서 주황 상판 위의 주황
                         덩어리는 **그림이 아니라 상판에 찍힌 얼룩**으로 읽혔다(망치 머리에서 이미
                         겪은 것과 같은 교훈 — 실루엣만 stroke, 내부 분절은 선 없는 채움).
                         검정 대신 **식은 쇠색(#4a1205)** 이라야 '차가운 테두리'가 아니라 열 경계다.
                         🚨 색도 갈라야 한다. 몸통을 주황으로 두면 상판(주황)과 같은 색이라 형태가
                         안 잡힌다 — 노란 단조 온도(#fff6c8 → #ffce4e)로 올려 상판과 색상환을 벌린다. -->
                    <path class="ab-bar" d="M45.6 11.2 L64.6 10.7 L67.4 13.4 L67.6 18.6 L64.8 21.3 L46.2 21.8 L43.4 19.1 L43.2 13.9 Z" fill="url(#anv-billet)" stroke="#4a1205" stroke-width="1.8" stroke-linejoin="round"/>
                    <!-- 백열 겹 — 평소 .12(노란 단조열), 타격 프레임에만 켰다 식는다.
                         ⚠️ 피크를 1 로 두면 몸통 그라디언트를 통째로 덮어 **흰 알약**이 된다(확대 실측). -->
                    <path class="ab-hot" d="M45.6 11.2 L64.6 10.7 L67.4 13.4 L67.6 18.6 L64.8 21.3 L46.2 21.8 L43.4 19.1 L43.2 13.9 Z" fill="url(#anv-billethot)" opacity=".12"/>
                    <!-- 윗면 — 이 띠가 있어야 '막대'가 아니라 '상판 위에 누운 덩어리'로 읽힌다 -->
                    <path class="ab-top" d="M46.4 11.4 L64.2 11 L65.6 13.4 L45.4 13.9 Z" fill="#fffce8" opacity=".55"/>
                    <!-- 냉각 겹 — 연출이 끝날수록 진해진다(css anvilbilletcool). 정지 상태에서는
                         opacity 0 이라 보이지 않는다. 이게 없으면 세 번 두들긴 쇠가 처음과 똑같이
                         뜨거워, 연출이 끝난 자리에 '처음과 다른 물건'이 남지 않는다(비평가 B). -->
                    <path class="ab-cool" d="M45.6 11.2 L64.6 10.7 L67.4 13.4 L67.6 18.6 L64.8 21.3 L46.2 21.8 L43.4 19.1 L43.2 13.9 Z" fill="#8f2c08" opacity="0"/>
                    <!-- 접합선 — 빌릿 밑면이 상판에 닿은 자리. 여기만 열을 뺏겨 어둡다 -->
                    <path class="ab-seam" d="M44.6 20.1 L66.4 19.6 L65.4 21.4 L45.8 21.9 Z" fill="#5a1a07" opacity=".45"/>
                </g>
            </g>
        </svg>`,

    // ---- 모루 타격 연출 (사용자 지시: 제작을 누르면 망치가 쾅쾅 친 뒤에 비교 팝업) ----
    // 총 0.72초 = 0.24초 × 3타. 반복 제작이 답답하지 않은 길이 안에서 마지막 타격만 강하게 준다.
    // 궤적·지속은 CSS 키프레임(.anvil-fx)이 소유하고, 여기서는 타격 시각에 소리·흔들림만 맞춰 건다.
    // ⚠️ 720 → 900. 예전엔 3타 링(지연 .628s + .2s)과 3타 불티(.628s + .26s)가 720ms에 오버레이가
    //    통째로 사라지면서 **수명의 20%쯤에서 잘려**, "마지막이 가장 강하다"는 설계가 화면에서는
    //    정확히 반대로 나왔다(비평가 실측 f-720: 3타 링이 1·2타보다 작고 불티는 중앙에 뭉친 채 소멸).
    //    ⚠️ 그렇다고 **오버레이 제거만 늦추면 안 된다** — `.striking`이 남은 채 done()이 카드를 띄워
    //    '망치질 → 카드' 순서가 깨진다(probe-craft-reveal ⑵가 실제로 잡았다). 그래서 done()·`.striking`
    //    해제·오버레이 제거를 **다시 한 시각으로 묶고** 그 시각을 900ms로 옮겼다(항목 스펙의 0.6~0.9초
    //    상한). 망치는 720ms에 스윙이 끝나므로 CSS `afexit`이 720~880ms에 화면 밖으로 빼낸다 —
    //    안 그러면 마지막 180ms 동안 공중에 얼어붙어 있다.
    // 🚨 **1500ms 로 축소 (사용자 지시 2026-08-19 재지정: "망치 애니메이션 전체 길이가 1.5초여야 함.
    //    지금 뭔가 한 번 내려칠 때마다 1.5초 느낌인 것처럼 존나 김").** 3000ms 판이 너무 길었다 —
    //    3타 **전체**가 1.5초 안에 들어가야 한다(타격 하나당 1.5초가 아니다).
    //    ⚠️ 이 값은 CSS 키프레임의 **퍼센트가 전제하는 총 길이**다 — 퍼센트는 var 로 못 푼다.
    //    바꾸려면 anvilbump·anvilbillet(+hot/glow/cool)·sheetshake·afswing 의 키를 전부 다시 풀고
    //    afexit 의 지연(1170ms)까지 같이 옮겨야 한다. 아래 ANVIL_HITS 와 한 벌이다.
    ANVIL_FX_MS: 1500,
    // 🚨 **등간격이면 메트로놈이다.** 예전 172.8 / 410.4 / 648ms 는 간격이 237.6 / 237.6ms 로
    //    완전히 같아, 비평가 두 명이 독립적으로 "박자기처럼 친다 — 크레셴도가 안 들린다"고 꼽았다.
    //    사람이 망치질을 하면 2타는 반동을 받아 빨리 붙고 3타는 크게 감아올리느라 늦는다.
    //    2타를 57% → 52.5%(378ms) 로 당겨 간격을 **205.2 / 270ms(1.32배)** 로 벌리고, 아낀 32.4ms 를
    //    3타 윈드업에 붙였다(그래서 3타 정점이 74% → 71.38% 로 앞당겨지고 체공이 길어진다).
    //    ⚠️ 이 값은 혼자 못 움직인다 — afswing·anvilbump·anvilbillet·anvilbillethot/glow·sheetshake 의
    //    퍼센트와 링/섬광/잔열/그림자/코어의 절대 지연이 **한 마스터 클럭**이다. 한꺼번에 옮길 것.
    //    1.5초판의 타격 시각 — 간격 350 / 450ms(1.29배)로 '2타는 반동으로 빨리 붙고 3타는 크게
    //    감아올려 늦는다'는 위계를 그대로 옮겼다(3초판 780/1040 · 900ms 판 205/270ms).
    //    🚨 **다다닥 3연타로 조인 것이 이 판의 요점이다** — 사용자가 "타격 간격이 너무 벌어져
    //    한 방 한 방이 느릿하다"고 지적했다. 줄인 건 **윈드업·정점 체공**뿐이고 스미어·접촉·드웰
    //    (33/40/50ms)·되튐의 **절대 길이는 900ms 판 그대로**다 — 임팩트까지 반으로 줄이면
    //    '빨라진' 게 아니라 '찰기가 사라진' 것이 된다(3초판의 반대 방향 같은 함정).
    //    마지막 타격 여운(afexit 1170~1350ms + 잔진동)까지 1500ms 안에서 끝난다.
    //    ⚠️ 링·섬광·잔열·그림자·코어의 절대 지연은 이제 **이 배열에서 파생된다** — `startAnvilStrike`
    //    가 `--h0/--h1/--h2` 로 내려보내고 CSS 가 `calc(var(--h0) - 8ms)` 식으로 받는다.
    //    예전엔 CSS 에 21개의 지연을 손으로 적어 뒀고, 타격 시각을 옮길 때마다 그 21개를 같이
    //    옮겨야 했다(주석이 "한꺼번에 옮길 것"이라고 경고할 만큼 실제로 어긋났다). 이제 한 곳이다.
    ANVIL_HITS: [300, 650, 1100],   // css afswing의 타격 프레임(20.0% / 43.333% / 73.333%)과 같은 시각
    // 타격점 = 모루 상판 윗면(ANVIL_SVG의 `M23 4 L90 3 L95 25 L12 26 Z`)의 중심.
    // 연출 오버레이는 모루와 **같은 viewBox(132×86)** 를 쓰므로 이 좌표 하나로 망치 머리·링·불티가
    // 전부 같은 지점에 맞는다 — 예전처럼 버튼 높이의 %(top:62%)로 찍으면 해머 카운터 줄까지
    // 포함된 높이라 실제 상판보다 한참 아래에 불티가 튀었다.
    ANVIL_HIT_X: 55,
    // 🚨 **타격마다 x 를 옮긴다 (비평가 4차 잔여 ⓞ).** 지적 원문: "타격점이 세 번 다 정확히
    //    x=55 — 대장장이는 소재를 옮긴다." 같은 자리를 세 번 찍으면 리듬·세기를 아무리 벌려도
    //    프레임이 복사본으로 보인다. 실제 단조는 소재를 따라 **때리는 자리가 걸어간다**.
    //    굽 쪽(−) → 중앙 → 뿔 쪽(+) 순으로 걸어 '작업이 진행됐다'가 읽히게 한다.
    // ⚠️ 폭은 **빌릿 위를 벗어나지 않는 선**에서 정했다(맨 모루면을 치면 이 항목이 처음에
    //    고쳤던 '고무 모루' 그림으로 되돌아간다). 정지 빌릿은 x 43.2~67.6(반폭 12.2)이고
    //    망치 타격면 반폭은 11.6 이다. 타격 순간에는 빌릿이 가로로 퍼져(anvilbillet scaleX
    //    1.10/1.22/1.40, 축은 중심) 반폭이 13.4/14.9/17.1 로 커지므로 —
    //      1타 dx −4.8: 망치 38.6~61.8 vs 빌릿 41.6~68.4 → 왼쪽 3.0유닛(2.1px)이 빌릿 밖
    //      3타 dx +5.4: 망치 48.8~72.0 vs 빌릿 37.9~72.1 → 완전히 안쪽
    //    ⚠️ 1타의 왼쪽 걸침은 **의도한 허용치**다. 망치 타격면(반폭 11.6)이 정지 빌릿(반폭 12.2)과
    //    거의 같은 폭이라, 걸침을 0 으로 두면 걸어갈 수 있는 폭이 ±1.8유닛(1.3px)뿐이고 그건
    //    92px 에서 안 읽힌다(첫 시안 −3.6/+4.0 이 걸음 3.0px 로 게이트 2.8px 를 겨우 넘었다).
    //    **접점(불티·섬광이 터지는 중심)은 세 타 모두 빌릿 한가운데** 있으므로 '맨 모루를 친다'로는
    //    안 읽힌다 — 타격면 모서리가 소재 밖으로 조금 나가는 건 실제 단조에서도 늘 그렇다.
    //    이보다 더 벌리려면 빌릿을 길게 늘여야 한다(소재를 늘이는 것이므로 조형상으로도 맞지만
    //    `anvilbillet` scaleX·probe ⑲ 와 한 벌이라 별도 작업이다).
    // ⚠️ **이 배열은 세 곳이 같이 읽는다** — ⑴ 아래 `playAnvilStrike` 의 hx()(불티·링·섬광 원점)
    //    ⑵ css `afswing` 의 접촉·스미어 키프레임(`--dx0/--dx1/--dx2` 로 내려간다, `startAnvilStrike`)
    //    ⑶ `probe-anvil-hammer` 의 ①⑫ 기준점. 셋 다 이 배열에서 파생되므로 값만 고치면 된다
    //    (`--h0/--h1/--h2` 와 같은 규약 — 상수를 손으로 베끼면 함정 ④ 다).
    ANVIL_HIT_DX: [-4.8, 0.2, 5.4],
    // 🚨 상판(14)이 아니라 **빌릿 윗면**이다. 대장장이는 맨 모루면을 치지 않는다 — 빌릿을 얹으면서
    //    접점이 3유닛 올라갔다. 이 값과 아래 SINK_Y, css afswing 의 접촉 translate, `.af-hammer` 의
    //    transform-origin, HAMMER_SVG 의 배치 translate 는 **한 벌로만 움직인다**(ANVIL_SVG 의
    //    `.anv-billet` 주석 참조).
    ANVIL_HIT_Y: 11,
    // 망치 그림(로컬 좌표: 원점 = 타격면 중심, +x = 손잡이 방향, +y = 모루 쪽).
    // 이 로컬 프레임을 `translate(타격점) rotate(-20)`으로 얹으면 **머리 타격면이 정확히 상판에 닿고**
    // 손잡이는 오른쪽 위로 뻗는다. 예전 🔨 이모지는 글리프마다 머리 위치가 달라(폰트 의존)
    // transform-origin을 어떻게 잡아도 손잡이로 치는 프레임이 나왔다 — 그래서 직접 그린다.
    // ⚠️ 머리를 **하나의 외곽 path** 로 그린다. 예전엔 뒷굽과 몸통이 각각 stroke 를 가진 별개 path 라
    //    둘이 만나는 y=-18.4 에 **머리를 가로지르는 먹선이 한 줄 더** 생겼다(폭 2.4 → 화면 1.9px).
    //    92px 버튼에서 머리 폭이 11.6px 였으니 그 한 줄만으로 내부의 1/6 이 검게 덮였고, 남은 강철
    //    면적이 좁아 '금속 블록'이 아니라 '검은 덩어리'로 읽혔다(비평가 ⓑ: 외곽선이 머리 폭의 33%).
    //    지금은 실루엣만 stroke 하고 내부 분절(타격면 챔퍼·볼·아이·핀 베벨)은 전부 **선 없는 채움**이다.
    // 🚨 **조형 = 밑이 무거운 쐐기 해머 (2026-08-20 재설계, 5차 채점 ㉠ · 블라인드 비평가 6차 재확인).**
    //    이전 조형은 '크로스핀 해머'(위에 핀 캡 + 잘록한 목)였는데, **접촉 프레임(핀이 위로)에서 그 핀 캡이
    //    정확히 체스 폰의 머리 혹으로 읽혔다** — 블라인드 비평가가 5·6차 모두 독립적으로 '폰/톰스톤'으로 지목.
    //    폰은 밑이 좁고 위가 불룩하다. 망치는 반대로 **치는 쪽(밑)이 가장 넓고 위로 좁아져야** 한다.
    //    그래서 크로스핀·목 이론을 폐기하고 **밑이 무겁고 납작한(가로>세로) 해머 블록**으로 다시 깎았다.
    //    외곽(아래 → 위, 반폭): 접촉 모서리 11.5(빌릿 폭 12.2 안 — '맨 모루' 회귀 방지) →
    //      **어깨(최대폭) 13.5 (y≈-6, 글로우 위)** → 12.2 → 10.8 → 9.6 → **납작한 평평 꼭대기 8.2 (y-20.5)**.
    //      폭 ~27 : 높이 ~21 = 1.28:1. 재widening 없음(그게 폰 혹). **뾰족한 폴 금지** — 처음엔 폴을 3.8 로
    //      뾰족하게 뽑았더니(6차 채점) 폰은 벗었지만 **도끼/쐐기/식칼**로 읽혔다. 납작 캡이 '망치 머리'다.
    //    🚨 **어깨를 글로우 위(y<-6)에 둔 이유**: 접촉 섬광(코어 ry≈2.2·플래시 ry≈7.4)이 y 0~-6 을 덮어
    //    거기 넓힌 폭은 안 보인다(5차 세션이 볼을 y≈-1 에 넓혔다가 글로우에 먹혀 헛일이 됐다). 눈에 남는
    //    **글로우 위 상부가 판독을 정한다** — 그래서 최대폭을 -6.5 에 올렸다.
    //    ⚠️ **probe ⑱ 를 같이 재설계했다** — 옛 ⑱ 은 '핀이 목보다 다시 벌어질 것'(=크로스핀 캡)을 강제해,
    //    그 판정을 통과하는 조형이 곧 폰이었다(5라운드가 이 함정에 갇혔다). 새 ⑱ 은 **밑이 무거운가**를
    //    본다: 최대폭이 아래쪽(y≥-12)·꼭대기가 최대폭의 절반 미만·어깨 위로 재widening 없음(단조 감소).
    //    scale 은 1.0 (모루 대비 덩치 유지).
    HAMMER_SVG: `<g class="af-hammer">
        <g transform="translate(55,11) rotate(-20)">
            <g stroke="#14100e" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
                <!-- 손잡이 (머리보다 먼저 = 아이를 통과해 머리 뒤로 들어간다). 끝은 손이 미끄러지지
                     않게 부푼 노브 — 일자 막대로 끝내면 '자루'가 아니라 '막대기'로 읽힌다. -->
                <path d="M6 -16.6 L47 -16.9 Q50.6 -16.95 51 -18 Q53 -18.8 55.4 -17.4 Q58 -15.9 58 -12.8 Q58 -9.7 55.4 -8.2 Q53 -6.8 51 -7.6 Q50.6 -8.65 47 -8.7 L6 -9 Z" fill="url(#hmr-wood)"/>
                <!-- 가죽 그립 -->
                <path d="M38 -16.85 L47 -16.9 Q50.6 -16.95 51 -18 Q53 -18.8 55.4 -17.4 Q58 -15.9 58 -12.8 Q58 -9.7 55.4 -8.2 Q53 -6.8 51 -7.6 Q50.6 -8.65 47 -8.7 L38 -8.75 Z" fill="url(#hmr-grip)"/>
                <!-- 머리 = 외곽 한 겹, **밑이 무겁고 납작한(가로>세로) 해머 블록**. 타격면(밑) → 넓은 볼(어깨,
                     최대폭·글로우 위) → 완만히 좁아지는 몸통 → **납작한 평평 꼭대기**(뾰족한 쐐기/폴 금지 —
                     그러면 망치가 아니라 도끼/쐐기로 읽힌다). 폭 ~27 : 높이 ~21 = 1.28:1 로 납작하게. -->
                <path d="M-11.5 0.9 L11.5 0.9 Q13.0 0.4 13.5 -2.5 L13.5 -6 L12.2 -10 L10.8 -14 L9.6 -17.5 Q9.4 -19.5 8.2 -20.5 L-8.2 -20.5 Q-9.4 -19.5 -9.6 -17.5 L-10.8 -14 L-12.2 -10 L-13.5 -6 L-13.5 -2.5 Q-13.0 0.4 -11.5 0.9 Z" fill="url(#hmr-steel)"/>
            </g>
            <g stroke="none" pointer-events="none">
                <!-- ⚠️ 92px 에서 1.3px 미만인 겹은 정보가 아니라 노이즈다 — 9겹을 6겹으로 줄이고
                     남긴 것을 두껍게 몰아준다(마모 띠 0.9→2.8, 아이 그늘 3.9→4.7, 림라이트 2.1→3.0,
                     그립 감개는 2줄이 아니라 1줄·3.0유닛). 같은 픽셀 예산에서 형태가 산다. -->
                <!-- 타격면: 두들겨 닳아 밝은 띠 + 그 위 챔퍼 그늘. 이 두 줄이 '치는 쪽'을 지정한다 -->
                <path d="M-11.2 -2.4 L11.2 -2.4 L11.2 -0.5 Q11.2 0.4 10.3 0.4 L-10.3 0.4 Q-11.2 0.4 -11.2 -0.5 Z" fill="#eef3f8" opacity=".6"/>
                <!-- 어깨(최대폭) 밑면 그늘 — 넓은 볼의 아래턱을 찍어 '밑이 무거운 머리'를 세운다 -->
                <path d="M-12.2 -9 L12.2 -9 L13.5 -6 L-13.5 -6 Z" fill="#0b0908" opacity=".34"/>
                <!-- 아이(자루 구멍) 그늘 — 자루가 머리를 관통한 것으로 읽히는 유일한 단서 -->
                <path d="M3.2 -16.4 L7.9 -16 L7.9 -9.6 L3.2 -9.2 Z" fill="#0b0908" opacity=".3"/>
                <!-- 왼쪽 림라이트: 어깨에서 꼭대기로 좁아지는 왼쪽 모서리를 훑어 금속 면을 세운다 -->
                <path d="M-13.5 -6 L-11.1 -6 L-8.2 -18 L-10.6 -18 Z" fill="#fff" opacity=".22"/>
                <!-- 납작한 꼭대기 면: 왼쪽 밝은 반 / 오른쪽 어두운 반 (평평 캡이 '망치 머리 윗면'으로 읽히게) -->
                <path d="M-8.0 -18.6 L-0.4 -20.3 L-0.4 -18.9 L-7.4 -17.4 Z" fill="#fff" opacity=".22"/>
                <path d="M0.4 -20.3 L8.0 -18.6 L7.4 -17.4 L0.4 -18.9 Z" fill="#000" opacity=".2"/>
                <!-- 자루 나뭇결 하이라이트 -->
                <path d="M7 -16.4 L37 -16.8 L37 -14.6 L7 -14.2 Z" fill="#fff" opacity=".16"/>
                <!-- 그립 감개: 어두운 줄만 그리면 이미 어두운 가죽에 묻히고, 1.7유닛 짝은 네이티브에서
                     0.8px 쪽이 통째로 사라졌다. 3.0유닛(2.1px) 한 줄 + 밝은 능선으로 몰아준다. -->
                <path d="M43.6 -17.56 L46.6 -17.59 L46.6 -8.03 L43.6 -8.06 Z" fill="#080504" opacity=".6"/>
                <path d="M46.6 -17.59 L48.2 -17.6 L48.2 -8.02 L46.6 -8.03 Z" fill="#a67c58" opacity=".55"/>
            </g>
        </g>
    </g>`,
    playAnvilStrike(done) {
        const btn = document.querySelector('.anvil-btn');
        if (!btn) { done(); return; }   // 장비 시트가 닫혀 있으면 연출을 건너뛰고 결과만 낸다
        const cx = this.ANVIL_HIT_X, cy = this.ANVIL_HIT_Y;
        // 🚨 타격 순간의 **진짜 접점**은 (55,14)가 아니다. anvilbump 이 상판을 눌러 내리므로
        //    접점은 타격마다 그만큼 아래·왼쪽으로 옮겨간다(망치는 이미 그 값을 따라 내려간다).
        //    이걸 안 따라가면 빛과 불티가 **실제 접점보다 3타 기준 8.5px 위 허공에서** 터지고,
        //    흰 섬광이 상판이 아니라 망치 머리 허리를 가로지른다(비평가 B 2차 1순위 —
        //    망치만 침하를 따라가게 고치면서 내가 새로 만든 파손이다).
        // ⚠️ 이 값은 **대수식이 아니라 실측**이다. `transform-origin: 50% 92%` 의 세로 퍼센트가
        //    viewBox 높이(86)로 풀린다고 보고 계산하면 원점이 79.12 로 나오는데, 실제 렌더에서
        //    역산한 원점은 ~100 이라 3타에서 2.2유닛이 어긋났다(그만큼 빛이 접점 위에서 터진다).
        //    x 는 식과 일치하고 y 만 어긋나므로, y 는 정지 프레임 대비 접점 이동을 직접 재서 넣는다.
        //    (재는 법: 상판 접점 (55,14) 을 anvil-svg 의 getScreenCTM 으로 매핑해 정지 프레임과 비교.
        //     시트 흔들림은 FX·모루가 같이 타므로 상쇄되어 빼고 봐야 한다.)
        //    probe-anvil-hammer ⑫ 가 이 값이 맞는지 매번 검증한다 — 키프레임을 손대면 같이 갱신할 것.
        // ⚠️ 빌릿을 얹으면서 두 몫이 더해졌다: ⑴ 기준점이 상판(14) → 빌릿 윗면(11) 로 3유닛 올라갔고
        //    ⑵ 빌릿이 타격마다 눌린다(scaleY .84/.70/.52, 바닥 y=21.5 기준 → 윗면 12.68/14.15/16.04).
        //    즉 하강량 = (빌릿 압축 1.68/3.15/5.04) + (모루 침하 1.03/1.66/2.45). 실측 원점 ~100.4.
        // 🚨 **두 몫의 크기가 뒤집혔다는 게 이번 라운드의 핵심이다.** 예전에는 3타 하강 14.35유닛 중
        //    모루가 12.26(85%)을 냈다 — 강철 모루가 달군 쇠보다 4배 크게 눌리는 그림이라, 빌릿을
        //    얹고도 '고무 모루'가 그대로 남아 있었다(비평가 2인이 독립적으로 1순위로 꼽았다).
        //    지금은 빌릿 압축이 모루 침하의 1.9~2.4배다. 총 하강이 14.35 → 7.15 유닛으로 줄어드는데,
        //    그게 **물리적으로 맞는 값**이다 — 두께 7px 짜리 쇳덩이가 낼 수 있는 변위가 그만큼이다.
        //    잃은 '깊이'는 빌릿의 가로 퍼짐(scaleX 1.40)·섬광·흔들림으로 갚는다.
        const SINK_Y = [2.71, 4.81, 7.49];
        // x 는 모루 scaleX 만 판다 — 빌릿의 scaleX 는 축이 x=55(=접점 자신)라 접점을 밀지 않는다.
        const SINK_X = [-0.07, -0.11, -0.18];
        const hx = h => cx + SINK_X[h] + this.ANVIL_HIT_DX[h], hy = h => cy + SINK_Y[h];
        const sparks = [];
        for (let h = 0; h < 3; h++) {
            // 3타로 갈수록 세진다 — 1·2타가 똑같으면 위계가 '약·약·강'의 2단이 되어
            // 크레셴도로 안 읽힌다(링만 3단이고 불티·플래시·섬광은 2단이었다).
            const n = [7, 11, 16][h];
            for (let i = 0; i < n; i++) {
                // 위쪽 반구로만 튀게 각도를 잡고(모루 아래로 파고드는 불티는 오독), 중력분을 더해 아래로 떨어뜨린다
                // ⚠️ 예전 범위 -0.08π~-0.92π 는 **손잡이가 뻗은 우상단(-20° 방향, 58유닛)** 과 겹치는데
                //    불티는 망치 뒤에 그려져 그 몫(약 13%)이 통째로 가려졌다 — 세 타격 모두 보이는
                //    불티가 머리 왼쪽에 몰려 있었다. 가려지는 구간을 빼고 -0.30π~-0.95π 로 좁힌다.
                const a = -Math.PI * (0.30 + 0.65 * (i + U.rand(0, 0.6)) / n);
                // 상판 폭이 83유닛인데 예전 최대 이동이 21이라 불티가 **상판 밖으로 못 나가** 실루엣을
                // 깨지 못했다. 밝은 배경까지 나가야 '튄다'로 읽힌다.
                // 사거리 하한이 머리 반폭(10.6)보다 작으면 그 불티는 **접촉 프레임 내내 머리에 가려**
                // 아예 안 보인다. 하한을 28로 올리고 리드도 20 → 32ms 로 당긴다.
                const d = U.rand(28, 44) * [1, 1.28, 1.8][h];    // viewBox 단위(상판 폭 83)
                // 🚨 예전엔 회전을 `transform="rotate(...)"` **프레젠테이션 속성**으로 줬는데,
                //    같은 요소의 `@keyframes afspark` 가 `transform` 을 애니메이션한다. CSS 애니메이션은
                //    프레젠테이션 속성을 덮으므로 **연출이 시작되는 순간 회전이 통째로 증발했다** —
                //    모든 불티가 예외 없이 수평 막대로 정렬돼 상판 뒷변을 따라 늘어선 '재봉선'이
                //    됐다(비평가 2인이 독립적으로 같은 그림을 지적했다).
                //    그래서 회전을 **키프레임 안으로** 넣고(--a), 이동 벡터를 회전 프레임 기준으로
                //    미리 풀어 준다: 전역 변위 (dx,dy) 를 rotate(a) 뒤에서 내려면
                //      u = d + g·sin a,  v = g·cos a      (g = 중력분 7)
                //    이렇게 분해하면 u 는 **등속(발사 방향)**, v 는 **등가속(중력)** 이라
                //    중간 키프레임을 u·0.55 / v·0.30 으로 두는 것만으로 정확한 포물선이 된다.
                //    (예전엔 둘이 섞여 있어 중간점을 어떻게 잡아도 궤적이 처졌다 솟았다.)
                const g = 7;
                const u = d + g * Math.sin(a), v = g * Math.cos(a);
                const w = U.rand(7, 13.5);                       // 개체마다 길이가 달라야 복제품으로 안 읽힌다
                // 색온도 변주 — 한 색이면 '날아가는 종잇조각'이고, 멀리 가는 조각일수록 뜨겁다.
                // ⚠️ 이걸 `@keyframes` 에서 `fill` 을 애니메이션해 만들면 안 된다 — 실측 결과
                //    불티에 fill 애니메이션을 걸자 **같은 오버레이의 `mix-blend-mode: screen` 층
                //    (플래시·섬광·코어)이 통째로 죽어** 네이티브 근백색 픽셀이 41 → 0 이 됐다
                //    (probe ⑪ 가 잡았다). 합성 그룹이 갈라지는 것으로 보인다. 정적 색으로 변주한다.
                const tint = d > 46 ? '#fffdf0' : d > 34 ? '#ffd257' : '#ff9a2e';
                // 🚨 `rect rx .8` 은 8배 확대에서 **크림색 캡슐·쌀알**로 읽혔다(비평가 2인). 튄 쇳조각은
                //    끝이 뾰족하고 꼬리가 끌린다 — 꼬리 폭 1.9 → 선단 0.25 로 좁아지는 쐐기로 바꾼다.
                //    개수를 줄이고(10/14/20 → 7/11/16) 개체를 길게(4.4~8.6 → 7~13.5) 하면 같은 픽셀
                //    예산에서 **속도**가 팔린다. 예전엔 개수만 많고 개체가 느려 '뿌렸다'로 보였다.
                const sy = hy(h);
                sparks.push(`<path class="af-spark" fill="${tint}"`
                    + ` d="M${hx(h).toFixed(2)} ${(sy - 0.95).toFixed(2)} L${(hx(h) + w).toFixed(2)} ${(sy - 0.12).toFixed(2)}`
                    + ` L${(hx(h) + w).toFixed(2)} ${(sy + 0.13).toFixed(2)} L${hx(h).toFixed(2)} ${(sy + 0.95).toFixed(2)} Z"`
                    + ` style="--a:${(a * 180 / Math.PI).toFixed(1)}deg;--u:${u.toFixed(1)}px;--v:${v.toFixed(1)}px;`
                    + `--t:${(this.ANVIL_HITS[h] / 1000 - 0.008).toFixed(3)}s;--dur:${U.rand(0.17, 0.25).toFixed(3)}s"/>`);
            }
        }
        // 🚨 **분출물이 100% 밝았다** — 두 비평가가 같이 꼽았다. 달군 쇠를 치면 표면 산화막(흑피,
        //    scale)이 깨져 **어두운** 조각이 함께 날고, 그게 있어야 '반짝임'이 아니라 '단조'로 읽힌다.
        //    밝은 불티의 0.55배 사거리로 더 느리고 무겁게, 아래쪽 각까지 포함해 흩는다(흑피는
        //    빛이 아니라 부스러기라 위로만 솟을 이유가 없다).
        const scales = [];
        for (let h = 0; h < 3; h++) {
            const n = [2, 3, 5][h];
            for (let i = 0; i < n; i++) {
                const a = -Math.PI * (0.18 + 0.78 * (i + U.rand(0, 0.7)) / n);
                const d = U.rand(16, 27) * [1, 1.24, 1.7][h];
                const g = 11;                                   // 밝은 불티(7)보다 무겁게 떨어진다
                const u = d + g * Math.sin(a), v = g * Math.cos(a);
                const w = U.rand(2.2, 3.8);
                // ⚠️ 수명은 타격마다 다르게 잡는다 — 무거운 조각이라 길게 두고 싶지만, 3타(652ms)에
                //    0.42s 를 주면 1072ms 로 **오버레이 수명 900ms 를 넘겨 공중에서 잘린다**(probe ⑥).
                //    앞 타격일수록 길게 주면 무게감을 잃지 않으면서 3타만 900ms 안에 맞는다.
                scales.push(`<rect class="af-scale" fill="${d > 34 ? '#3a2418' : '#241408'}"`
                    + ` x="${hx(h).toFixed(2)}" y="${(hy(h) - 0.9).toFixed(2)}" width="${w.toFixed(1)}" height="1.8" rx="0.5"`
                    + ` style="--a:${(a * 180 / Math.PI).toFixed(1)}deg;--u:${u.toFixed(1)}px;--v:${v.toFixed(1)}px;`
                    + `--t:${(this.ANVIL_HITS[h] / 1000 + 0.004).toFixed(3)}s;--dur:${(U.rand(-0.012, 0.012) + [0.34, 0.30, 0.23][h]).toFixed(3)}s"/>`);
            }
        }
        const fx = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        fx.setAttribute('class', 'anvil-fx');
        fx.setAttribute('viewBox', '0 0 132 86');
        fx.setAttribute('aria-hidden', 'true');
        fx.innerHTML = `<defs>
                <linearGradient id="hmr-steel" x1=".1" y1="0" x2=".9" y2="1">
                    <stop offset="0" stop-color="#cfd6de"/><stop offset=".38" stop-color="#98a3ae"/>
                    <stop offset=".72" stop-color="#5f6a75"/><stop offset="1" stop-color="#3d454e"/>
                </linearGradient>
                <linearGradient id="hmr-wood" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#a9743f"/><stop offset=".5" stop-color="#82521f"/>
                    <stop offset="1" stop-color="#54330f"/>
                </linearGradient>
                <linearGradient id="hmr-grip" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stop-color="#5a3a2c"/><stop offset=".55" stop-color="#3f2619"/>
                    <stop offset="1" stop-color="#28160d"/>
                </linearGradient>
                <!-- 플래시는 **빛**이어야지 물감이면 안 된다. 단색 #fff6d8 를 opacity .95로 깔았더니
                     주황 상판 위에 놓인 **크림색 원반**으로 읽혔다(8배 캡처에서 확인). 가운데만
                     타고 가장자리는 완전히 투명해지는 방사 그라디언트 + screen 합성으로 바꾼다. -->
                <radialGradient id="hmr-flash" cx=".5" cy=".5" r=".5">
                    <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
                    <stop offset=".42" stop-color="#fff3c4" stop-opacity=".9"/>
                    <stop offset=".7" stop-color="#ffb84a" stop-opacity=".38"/>
                    <stop offset="1" stop-color="#ff8a1e" stop-opacity="0"/>
                </radialGradient>
                <!-- 잔열 — 타격 직후 상판에 남아 식는 열. 이게 없으면 타격 사이(170~410·410~650ms)와
                     3타 뒤 꼬리(720~900ms)가 **완전히 식은 정지 화면**이 된다. 대장간에서 두 타 사이는
                     가장 밝은 시간인데 거기가 비어 있으면 세 번의 타격이 서로 무관한 사건으로 읽힌다. -->
                <!-- 섬광은 **빛**이지 종이가 아니다. 단색 #fffdf2 로 두자 비평가 2인이 독립적으로
                     "직선 모서리를 가진 불투명 흰 삼각형 = 오려 붙인 종이 화살촉"으로 읽었다 —
                     플래시·빌릿 글로우에서 이미 두 번 배운 함정에 섬광만 남아 있었다.
                     머리 쪽(안쪽) 끝이 밝고 바깥 끝이 완전히 투명해야 '새어 나온 빛'이 된다.
                     좌우 조각의 안쪽 끝이 서로 반대편이라 그라디언트도 두 벌이다. -->
                <linearGradient id="hmr-starL" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#fff8dc" stop-opacity="0"/>
                    <stop offset=".38" stop-color="#fff3c4" stop-opacity=".62"/>
                    <stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
                </linearGradient>
                <linearGradient id="hmr-starR" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
                    <stop offset=".38" stop-color="#fff3c4" stop-opacity=".62"/>
                    <stop offset="1" stop-color="#fff8dc" stop-opacity="0"/>
                </linearGradient>
                <!-- 블룸 — 타격 순간 버튼 전체를 2~3프레임 들어 올린다. 이게 없으면 접촉 프레임이
                     정지 프레임보다 **어둡다**: 회색 머리(폭 23유닛)가 주황 상판과 크림 배경을
                     덮는 손실이 접점 주변의 빛이 더하는 양보다 크기 때문이다(실측 평균 휘도
                     정지 158.0 vs 접촉 152.9/153.4/154.1). 접점 근처만 밝혀서는 못 갚는다 —
                     머리 실루엣 **밖**의 넓은 면적을 조금씩 들어 올려야 한다. 원신의 타격이
                     화면 전체를 순간적으로 띄우는 것과 같은 처방이다. -->
                <radialGradient id="hmr-smoke" cx=".5" cy=".55" r=".5">
                    <stop offset="0" stop-color="#d8cec4" stop-opacity=".5"/>
                    <stop offset=".55" stop-color="#a89c90" stop-opacity=".26"/>
                    <stop offset="1" stop-color="#8a7f74" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="hmr-bloom" cx=".5" cy=".5" r=".5">
                    <stop offset="0" stop-color="#fff4d0" stop-opacity=".9"/>
                    <stop offset=".45" stop-color="#ffd89a" stop-opacity=".5"/>
                    <stop offset="1" stop-color="#ffb060" stop-opacity="0"/>
                </radialGradient>
                <radialGradient id="hmr-heat" cx=".5" cy=".5" r=".5">
                    <stop offset="0" stop-color="#ffd88a" stop-opacity=".85"/>
                    <stop offset=".45" stop-color="#ff8c2a" stop-opacity=".5"/>
                    <stop offset="1" stop-color="#ff5a00" stop-opacity="0"/>
                </radialGradient>
            </defs>`
            // 블룸이 가장 아래 — 버튼 전체를 들어 올리는 층이라 다른 무엇보다 뒤다.
            // (screen 합성이라 위에 그려지는 망치·불티는 그대로 선명하게 남는다)
            + [0, 1, 2].map(h => `<ellipse class="af-bloom b${h}" cx="${hx(h)}" cy="${(hy(h) + 6).toFixed(2)}" rx="48" ry="28"/>`).join('')
            // 잔열은 그 다음 — 상판에 눌어붙은 열이라 불티·망치보다 뒤다
            // ⚠️ rx 15 × 3타 배율 1.45 = 21.75유닛(네이티브 폭 30px = 버튼의 33%)이라 700ms 에
            //    상판을 통째로 덮어 **모루를 비추는 스포트라이트**로 읽혔다(비평가 2인). 정작 같은
            //    파일의 `ab-glow` 주석이 "rx 21 로 깔았더니 상판이 뿌옇게 떠 형태가 죽는다"고 이미
            //    같은 실패를 적어 뒀는데 잔열에는 그 교훈이 적용되지 않았다. 11 로 조인다.
            + [0, 1, 2].map(h => `<ellipse class="af-heat t${h}" cx="${hx(h)}" cy="${hy(h)}" rx="11" ry="3.6"/>`).join('')
            // 92px 버튼에서 임팩트를 가장 싸게 파는 수단이 2~5프레임 백색 플래시인데 그게 아예 없었다
            // 🚨 **접촉 프레임이 정지 프레임보다 어두웠다** — 네이티브 평균 휘도 152.7/153.4/154.0
            //    vs 정지 157.95(비평가 A 가 지적하고 따로 재서 확인). 회색 망치 머리가 밝은 상판·
            //    배경을 덮는 몫이 빛이 더하는 몫보다 컸다는 뜻이다. 원신에서 타격 프레임이
            //    평상시보다 어두운 경우는 없다. 플래시를 머리 실루엣(반폭 11.6)보다 확실히 크게
            //    키워 **머리 밖으로 나오는 후광**을 만든다 — 가운데는 어차피 머리가 덮는다.
            + [0, 1, 2].map(h => `<ellipse class="af-flash f${h}" cx="${hx(h)}" cy="${hy(h)}" rx="24" ry="7.4"/>`).join('')
            // rx/ry는 `scale(1)`에서 곧바로 읽히는 크기로 잡는다 — 예전엔 scale(.35)로 시작해
            // 첫 60~70ms 동안 스트로크가 0.27px라 **타격 프레임에 링이 아예 안 보였다**
            // 🚨 rx 7(반폭 4.9px)은 **머리 반폭 8.1px 보다 작은데 링은 머리 뒤에 그려진다** —
            //    색 스캔 결과 1·2타 접촉 프레임의 링 픽셀이 9개 / 0개였다(비평가 A). 레이어 하나가
            //    통째로 놀고 있었던 것이다. 시작 반경을 머리 밖으로 내보내고(13) 최종 배율을
            //    그만큼 낮춰(--afr) 끝 크기는 비슷하게 둔다.
            + [0, 1, 2].map(h => `<ellipse class="af-ring h${h}" cx="${hx(h)}" cy="${hy(h)}" rx="13" ry="3.4"/>`).join('')
            // 접지 그림자 — 머리 밑에 어두운 타원이 없으면 머리가 상판에 얹혀 있는지 앞에 떠
            // 있는지 구분이 안 된다(비평가: 접지 단서가 한 프레임에도 없다).
            + [0, 1, 2].map(h => `<ellipse class="af-shadow d${h}" cx="${hx(h)}" cy="${hy(h) + 2.4}" rx="13.5" ry="2.6"/>`).join('')
            // 🚨 순백 코어는 망치 **뒤**다. 앞에 두면 rx 11.5(반폭 8.0px)가 머리 반폭 8.1px 과
            //    거의 같아 screen 합성으로 **머리 밑동을 통째로 하얗게 지운다** — 648ms 네이티브
            //    머리 열 아래 5행이 236~255 로 깔려, 공들여 그린 마모 띠·챔퍼 그늘·아이 그늘이
            //    하필 '때리는 순간에만' 소멸했다(비평가 A 1순위). 같은 파일 아래쪽 주석이
            //    "가운데 로브를 두면 머리 밑동을 흰 띠로 잘라 먹는다"고 스스로 경고해 놓고
            //    코어로 똑같은 짓을 하고 있었다.
            //    접촉선보다 1.4유닛 아래에 두고 머리보다 넓게(13) 퍼뜨리면, 머리에 가려지지 않은
            //    아래쪽만 남아 **밑에서 빛이 삐져나오는** 그림이 된다.
            //    ⚠️ **아래로 피하는 길은 없다.** 1.4 → 3.0유닛 내려 봤지만 근백색은 0 → 3 이었다.
            //    머리는 접촉 회전 19~20° 로 기울어 있어 아랫변 모서리(로컬 11.6, 0.9)가
            //    11.6·sin19° + 0.9·cos19° = **접점보다 4.6유닛 아래**까지 내려오고, stroke 1.1 이
            //    더 붙는다. 코어를 그 밑으로 빼면 모루 앞면까지 내려가 '떠 있는 흰 막대'가 된다.
            //    그래서 **옆으로** 뺀다 — 머리 반폭(11.6+stroke)보다 훨씬 넓고 납작하게 깔면
            //    |x| > 12.8 구간이 머리 밖에 남아, 접촉선을 따라 좌우로 새어 나온 빛이 된다.
            //    (가운데는 어차피 머리가 덮으므로 거기 칠하는 픽셀은 전부 낭비였다.)
            + [0, 1, 2].map(h => `<ellipse class="af-core c${h}" cx="${hx(h)}" cy="${(hy(h) + 0.8).toFixed(2)}" rx="19" ry="2.2"/>`).join('')
            // 연기 — 타격마다 훅 오르고 꼬리(650~900ms)를 채운다. 지금까지 그 구간은 모루 잔진동에만
            // 기대고 있었는데, 모루를 강체로 만들면서 그마저 사라졌다. 김이 오르는 건 물리적으로도
            // 옳고 92px 에서 **면적**으로 읽히는 몇 안 되는 요소다. 망치 뒤에 둬 머리를 흐리지 않는다.
            + [0, 1, 2].map(h => `<ellipse class="af-smoke m${h}" cx="${(hx(h) + 2).toFixed(2)}" cy="${(hy(h) - 3).toFixed(2)}" rx="7" ry="5"/>`).join('')
            + scales.join('') + sparks.join('') + this.HAMMER_SVG
            // ⚠️ 섬광은 망치 **앞**에 그린다. 뒤에 두면 흰 코어가 통째로 머리(반폭 9.4)에
            //    가려 밖으로 나오는 건 주황 스커트뿐이고, 그게 주황 상판에 얹혀 '얼룩'이 된다.
            // 섬광 — 92px에서 '때렸다'를 가장 적은 픽셀로 파는 도형이다. 원형 광량만으로는 상판 위
            // 얼룩과 구별이 안 되지만, 축을 가진 섬광은 **방향과 순간**을 같이 준다.
            // ⚠️ 상하 대칭 4갈래로 그렸더니 아래 갈래가 상판 앞면(어두운 면)까지 흘러내려
            //    **흰 천이 걸린 모양**으로 읽혔다(8배 캡처). 타격면은 상판 윗면이라 빛이 아래로
            //    뻗을 자리가 없다 — 위 8.5 / 아래 3.4 로 비대칭을 주고 가로(±28)를 지배적으로 둔다.
            // ⚠️ 위 갈래를 크게(8.5) 두면 망치 앞에 그리는 순간 **머리를 흰색으로 덮어버린다**
            //    (screen 합성이라 밝은 강철 위에서 완전히 하얘진다). 타격점 위쪽은 애초에 머리가
            //    차지한 자리라 빛이 뻗을 데가 없다 — 접촉선을 따라 **옆으로 새어 나오는** 납작한
            //    빛(위 4.2 / 아래 3.0 / 가로 ±26)이어야 머리 형태를 살린 채 '터졌다'가 읽힌다.
            // 🚨 가운데 로브를 두면 **머리 밑동을 흰 띠로 잘라 먹는다.** screen 합성이라 밝은 강철
            //    위에서 완전히 하얘지는데, 하필 그 자리가 타격면·마모 띠·챔퍼 그늘 — '치는 쪽'을
            //    지정하려고 새로 그린 겹들이다. 네이티브에서 머리가 흰 밴드로 두 동강 났다.
            //    그래서 섬광을 **머리 실루엣 밖(|x| > 12.8 — 머리 반폭 11.6 + stroke 1.1)에서
            //    시작하는 좌우 두 조각**으로 쪼갠다. 10.5 는 실루엣 안이라 밝은 끝이 머리에 얹혔다.
            //    빛은 접촉선을 따라 옆으로 새어 나오고, 머리 위에는 아무것도 얹히지 않는다.
            // 좌우 조각에 서로 다른 클래스를 준다 — 커질 때 **머리 쪽 끝을 축으로 바깥으로만**
            // 뻗게 하려면 축이 좌우로 달라야 한다(css `.af-star.sl/.sr`). 예전엔 주석만 그렇게
            // 적혀 있고 css 는 `transform-origin: 50% 55%` 한 줄이라, 커질수록 안쪽 끝이
            // 머리 실루엣 안으로 4.1px 파고들어 흰 밴드를 만들었다(비평가 A).
            + [0, 1, 2].map(h => [-1, 1].map(sx => `<path class="af-star s${h} ${sx < 0 ? 'sl' : 'sr'}"`
                + ` d="M${hx(h) + sx * 26} ${hy(h)}`
                + ` Q${hx(h) + sx * 17} ${hy(h) - 1.4} ${hx(h) + sx * 12.8} ${hy(h) - 4}`
                + ` L${hx(h) + sx * 12.8} ${hy(h) + 3.2}`
                + ` Q${hx(h) + sx * 17} ${hy(h) + 1} ${hx(h) + sx * 26} ${hy(h)} Z"/>`).join('')).join('');
        // 타격 시각·총 길이를 CSS 로 내려보낸다 — 링/섬광/잔열/그림자/코어의 지연이 전부 여기서 파생된다.
        // ⚠️ `--afdur` 는 버튼에도 걸어야 한다(모루 침하·빌릿은 `.anvil-btn.striking` 의 자손이라
        //    오버레이에 건 변수를 못 본다). 시트 흔들림도 마찬가지라 시트에 따로 건다.
        this.ANVIL_HITS.forEach((t, h) => fx.style.setProperty(`--h${h}`, t + 'ms'));
        // 타격마다 걸어가는 x (ⓞ) — afswing 의 접촉·스미어 키프레임이 calc 로 받는다.
        // ⚠️ 단위는 viewBox 유닛이다(오버레이가 모루와 같은 132×86 을 쓴다) — css 에서 px 로 적히지만
        //    SVG transform 안이라 사용자 단위로 풀린다. ANVIL_HIT_DX 주석의 계산과 같은 축이다.
        this.ANVIL_HIT_DX.forEach((d, h) => fx.style.setProperty(`--dx${h}`, d + 'px'));
        fx.style.setProperty('--afdur', this.ANVIL_FX_MS + 'ms');
        btn.style.setProperty('--afdur', this.ANVIL_FX_MS + 'ms');
        btn.appendChild(fx);
        btn.classList.add('striking');
        // 화면 흔들림은 **모루가 든 시트**를 흔들어야 보인다 — Scene3D.shake 는 시트 뒤 3D 씬만
        // 흔들어 제작 순간에는 아무도 못 본다(비평가 ⓐ). 3D 씬도 같이 흔들어 두면 시트 밖으로
        // 충격이 번지지만, 눈에 보이는 몫은 이 클래스가 판다. 타이밍은 CSS 마스터 클럭이 소유한다.
        const sheet = document.getElementById('equip-sheet');
        if (sheet) { sheet.style.setProperty('--afdur', this.ANVIL_FX_MS + 'ms'); sheet.classList.add('shaking'); }
        this._anvilTimers = this.ANVIL_HITS.map((t, h) => setTimeout(() => {
            SFX.anvilHit(h === 2);
            if (typeof Scene3D !== 'undefined' && Scene3D.shake) Scene3D.shake(h === 2 ? 0.13 : 0.07); // 미세하게만
        }, t));
        this._anvilTimers.push(setTimeout(() => {
            fx.remove(); btn.classList.remove('striking');
            if (sheet) sheet.classList.remove('shaking');
            done();
        }, this.ANVIL_FX_MS));
    },
    // 연출을 도중에 끊는다 — 타이머와 오버레이를 같이 걷어내야 끝나고 팝업이 뜨는 일이 없다
    cancelAnvilStrike() {
        (this._anvilTimers || []).forEach(clearTimeout);
        this._anvilTimers = [];
        this._anvilBusy = false;
        const btn = document.querySelector('.anvil-btn');
        if (btn) btn.classList.remove('striking');
        // 흔들림 클래스를 안 걷으면 시트가 **연출 도중 변위를 문 채** 남는다(탭 이동으로 끊었을 때)
        const sheet = document.getElementById('equip-sheet');
        if (sheet) sheet.classList.remove('shaking');
        document.querySelectorAll('.anvil-fx').forEach(n => n.remove());
        // 리빌 카드도 같이 걷는다 — 안 걷으면 탭을 옮긴 화면 위에 카드만 남아 떠 있다.
        // (남은 타이머의 done은 대기품이 이미 정리된 걸 보고 팝업을 띄우지 않는다)
        document.querySelectorAll('.auto-drop-card.craft-reveal').forEach(n => n.remove());
        this.dismissCraftBatch();   // 배치 카드판도 같은 이유로 — 연출을 끊는 자리면 이것도 남기지 않는다
    },
    onCraft() {
        if (this._anvilBusy) return;   // 연출 중 재클릭 무시 — 연타로 해머만 녹는 걸 막는다
        // 보류 카드가 모루 자리를 차지하고 있으면 그걸 먼저 처리해야 한다(사용자 확정 2026-08-17 ②)
        if (this._pendingItem) { this.onOpenHeld(); return; }
        if (S.hammers < 1) { this.toast('🔨 해머가 부족합니다 (분당 1개 수급)'); return; }
        const item = Forge.craft(1)[0];
        // 대기품은 연출 '전에' 세이브에 남긴다 — 타격 0.72초 사이에 새로고침해도 결과물이 살아 있다
        this.setPendingCraft(item);
        this.renderTopBar();
        // 망치질이 끝나도 _anvilBusy는 **리빌 카드가 걷힐 때까지** 잡는다 — 카드가 떠 있는 사이
        // 모루를 다시 누르면 setPendingCraft가 대기품을 덮어써 앞 장비가 해머만 먹고 사라진다
        // (자동 제작 탈락 카드에서 이미 겪은 것과 같은 사고).
        this._anvilBusy = true;
        this.playAnvilStrike(() => {
            // 연출 도중 탭을 옮겨 대기품이 이미 자동 판정됐다면(closeAllTabSurfaces) 리빌도 팝업도 없다
            if (this._pendingItem !== item) { this._anvilBusy = false; return; }
            this.showCraftReveal(item, () => {
                this._anvilBusy = false;
                if (this._pendingItem === item) this.showCraftModal(item);
            });
        });
    },

    SLOT_EMOJI: { gloves: '🧤', necklace: '📿', ring: '💍', shoes: '👢', belt: '🎽' },
    // 무기 계열별 아이콘 — 총기 시대에 활 아이콘이 뜨던 문제 (전 무기가 🏹/🗡 둘로만 갈렸다).
    // 항목 '이모지→코드 생성 아이콘 전면 교체'가 들어오면 이 표가 그 매핑의 진입점이 된다.
    WEAPON_SHAPE_EMOJI: {
        club: '🏏', axe: '🪓', scythe: '🌾', spear: '🔱', mace: '🔨', hammer: '🔨',
        sword: '🗡', rapier: '🤺', dagger: '🔪', bow: '🏹', crossbow: '🏹', sling: '💫',
        pistol: '🔫', rifle: '🔫', smg: '🔫', cannon: '💥', staff: '🪄', thrown: '🪃',
    },
    // 모양별 **코드 생성 아이콘**. 무기 53종은 모양 18가지로 모이므로 여기만 채우면 전부 걸린다.
    // 아직 안 그린 모양은 위 이모지 표로 떨어진다 — `TOAST_ICON` 과 같은 방식이라, 아이콘을
    // 하나 그릴 때마다 여기 한 줄 더하면 그 순간부터 전 화면에 반영된다.
    //
    // ⚠️ **이름은 반드시 `IconGen.draw` 에 실제로 있는 것만 쓸 것.** 소스에서 `함수명(ctx, S)` 를
    //    긁으면 등록된 아이콘이 아니라 **그리기용 내부 헬퍼**(`sword`·`axe`·`spear`·`plate` 등)까지
    //    같이 잡혀 '있는 줄 알았는데 없는' 이름이 나온다(실제로 이 표를 그렇게 썼다가 셋 다
    //    빈 문자열이 돌아왔다 — 폴백 덕에 안 깨졌을 뿐이다). 목록은 **런타임에서**
    //    `Object.keys(IconGen.draw)` 로 뽑을 것. `probe-icon-name-refs.js` 가 이 표의
    //    이름이 실제로 그림을 내는지 매번 확인한다.
    //
    // 18모양 전부 채워졌다(2026-08-18 UI 세션) — hammer 는 재화 해머 아이콘 재사용, 나머지 17종은
    // `icongen.js` 말미의 `wpn_*` 블록(slot_* 과 같은 `_plate` 화법). 위 이모지 표는 아이콘 로드
    // 실패 시 폴백으로만 남는다.
    WEAPON_SHAPE_ICON: {
        hammer: 'hammer',
        sword: 'wpn_sword', rapier: 'wpn_rapier', dagger: 'wpn_dagger', axe: 'wpn_axe',
        thrown: 'wpn_thrown', mace: 'wpn_mace', club: 'wpn_club', spear: 'wpn_spear',
        scythe: 'wpn_scythe', bow: 'wpn_bow', crossbow: 'wpn_crossbow', sling: 'wpn_sling',
        pistol: 'wpn_pistol', rifle: 'wpn_rifle', smg: 'wpn_smg', cannon: 'wpn_cannon',
        staff: 'wpn_staff',
    },
    weaponEmoji(wtype) {
        const shape = typeof weaponShape === 'function' ? weaponShape(wtype) : wtype;
        const ico = this.WEAPON_SHAPE_ICON[shape] && IconGen.img(this.WEAPON_SHAPE_ICON[shape]);
        if (ico) return ico;
        if (this.WEAPON_SHAPE_EMOJI[shape]) return this.WEAPON_SHAPE_EMOJI[shape];
        return (WEAPON_TYPES[wtype] && WEAPON_TYPES[wtype].kind === 'ranged') ? '🏹' : '🗡';
    },
    // 시대 아이콘 — 원본(shot-042831·042950 확대)은 범용 이모지가 아니라 **그 시대의 무기 실루엣**이다
    // (원시=몽둥이 · 중세=검 · 근대 초기=나팔총 · 현대=권총 · 우주=블래스터 · 항성간=광선총 ·
    //  다중 우주=포탈건 · 양자=원자 · 지하 세계=삼지창 · 신성한=황금 날개).
    // 아이콘이 없으면 `AGE_ICON` 이모지로 떨어진다.
    ageIcon(age) { return IconGen.img('age_' + age, 'age-ico') || AGE_ICON[age] || ''; },
    // 시대(등급) 막대 뒤 ★ = **장비 라인 승천 횟수**와 1:1 (사용자 확정 2026-08-19 age-bar-star-ascension:
    // "승천 안 했으면 별 0개, N회면 N개"). 세 화면(확률 정보·모든 장비 목록·자동 제련)의 시대 막대가
    // 공유한다. 승천은 라인 단위라 전 시대 막대가 같은 개수다. 6개 이상은 막대 폭을 넘기므로
    // rate-star(소환 확률 별)·cell-star 와 같은 '★+숫자' 접기 규약을 쓴다.
    // ⚠️ 원본(shot-042831)은 시대별 고정 별(9시대 채운 별·신성한 빈 별)이었으나, 사용자가 이를 **승천 별로
    //    인식·확정**해 원본 디자인보다 이 사양이 우선한다(원본 대조 probe-fl-head 의 별 게이트도 이에 맞춰 해제).
    //    ⭐ 이모지가 아니라 텍스트 글리프(★)라 아이콘 AAA 교체 대상이 아니다.
    // `foldAt` = 글리프를 그대로 늘어놓는 최대 개수(그 위는 '★N' 으로 접는다). 기본 5 = 시대 막대 폭 기준.
    // ⚠️ 접기 규약은 '예뻐서'가 아니라 **폭 한계** 때문에 있다 — 그래서 폭이 다른 자리는 자기 한계를 준다.
    //    장비 목록 셀은 막대보다 훨씬 좁아(실측 37.4px) 5개(62.3px)면 옆 칸을 침범한다 → 셀은 foldAt=3.
    //    (실측 shot-fl-cell-star: ★★★=37.4px 로 딱 차고, ★N 은 19.4px 로 늘 여유가 있다.)
    ageStars(foldAt = 5) {
        const n = Ascension.count('forge');
        return n <= 0 ? '' : n <= foldAt ? '★'.repeat(n) : `★${n}`;
    },

    // 기술 트리 노드·가지 아이콘 — 원본(shot-042605)의 노드는 **청동 원판 위 픽토그램**이지 이모지가 아니다.
    // 여기 없는 id 는 `techtree.js` 의 이모지로 그대로 떨어지므로 노드가 추가돼도 안 깨진다.
    // ⚠️ 같은 가지에 나란히 놓이는 '피해/체력' 짝은 서로 다른 모티프를 준다(mount 는 말↔하트,
    //    skill 은 검↔십자, pet 은 같은 발바닥을 tint 로 갈랐다) — 같으면 '중복 아이콘'으로 읽힌다.
    //    반대로 가지가 다르거나 대상이 정말 같은 것(해머 보상 2종·코인 보상 2종·타이머 3종)은
    //    원본도 모티프를 돌려 쓰므로 그대로 공유한다.
    TECH_ICON: {
        weaponMastery: 'power', armorMastery: 'tm_shield', gearMaxLevel: 'uptri',
        mountDmg: 'horse', mountHp: 'heart', mountCost: 'winder', extraMount: 'dice',
        forgeTimer: 'tm_hourglass', forgeCost: 'coin', sellPrice: 'moneybag',
        thiefHammer: 'hammer', thiefCoin: 'trophy', autoForgeSlot: 'robot',
        freeForge: 'clover', offlineCap: 'winder', offlineCoin: 'coin', offlineHammer: 'hammer',
        techTimer: 'tm_hourglass', skillDmg: 'tm_burst', skillPassiveDmg: 'tm_sword', skillPassiveHp: 'tm_cross',
        techCost: 'potion', petHp: 'paw', petDmg: 'paw', skillSummonCost: 'ticket',
        hatchTimer: 'egg', extraEgg: 'gift', dungeonTicket: 'ticket', dungeonPotion: 'potion',
    },
    TECH_ICON_TINT: { petDmg: '#e8544a' },
    TECH_BRANCH_ICON: { power: 'power', forge: 'hammer', skillpet: 'tm_sparkle' },
    // ⚠️ 노드 id 는 `type@tier`(TechTree.nid) 라 표를 그대로 찾으면 **항상 빗나가 이모지로 떨어진다**
    //    — 실제로 처음에 그렇게 짜서 교체가 한 칸도 안 먹었다. 반드시 `TechTree.typeOf` 로 벗겨서 찾는다.
    techIcon(id, cls) {
        const type = TechTree.typeOf(id);
        const name = this.TECH_ICON[type];
        if (!name) return (TechTree.def(id) || {}).icon || '\u{1F52C}';
        const tint = this.TECH_ICON_TINT[type];
        return IconGen.img(name, cls, tint ? { tint } : null);
    },

    // 장비 그리드 공용 셀 (원본 shot-042120 정합): 정사각 고정 프레임 + 아이콘 상부 채움 + Lv 내부 하단 + ⭐는 하단 테두리 걸침.
    // 빈 슬롯도 동일 프레임 유지(찌그러짐 금지, 사용자 지시) — 흐린 부위 아이콘 실루엣 + 부위명.
    EMPTY_SLOT_EMOJI: { weapon: '🗡', helmet: '🪖', armor: '👕' },
    // 빈 칸 실루엣 — 새 세이브로 처음 켠 화면이 바로 이 상태라 눈에 띈다.
    // (장착된 칸은 `itemImgHTML()` 이 `Scene3D.itemThumb()` 3D 스냅샷으로 그린다.)
    // 표에 없는 슬롯은 원래 이모지로 떨어지므로 슬롯이 늘어도 안 깨진다.
    EMPTY_SLOT_ICON: {
        weapon: 'slot_weapon', helmet: 'slot_helmet', armor: 'slot_armor',
        gloves: 'slot_gloves', necklace: 'slot_necklace', ring: 'slot_ring',
        shoes: 'slot_shoes', belt: 'slot_belt',
    },
    emptySlotFace(slot) {
        const ico = this.EMPTY_SLOT_ICON[slot] && IconGen.img(this.EMPTY_SLOT_ICON[slot]);
        return ico || this.EMPTY_SLOT_EMOJI[slot] || this.SLOT_EMOJI[slot] || '🎁';
    },
    equipCellHTML(slot) {
        const it = S.equipment[slot];
        // data-slot = 교체 연출(`equip-swap-throwout`)이 '어느 칸이 방금 갈렸는지' 집는 손잡이.
        // 렌더가 innerHTML을 통째로 갈아끼우므로 인덱스로 세면 SLOTS 순서가 바뀔 때 어긋난다.
        if (!it) return `<div class="equip-cell empty" data-slot="${slot}">
            <span class="cell-img emoji dim">${this.emptySlotFace(slot)}</span>
            <span class="slot-name">${SLOT_KR[slot]}</span>
        </div>`;
        // data-age = 시대 무늬(확률 정보 막대와 공유하는 --af-pat 규칙 + 무늬별 애니메이션).
        // 항성간 이상 다섯 시대만 무늬가 있고 앞 5개는 --af-pat 이 없어 아무것도 안 그린다.
        return `<div class="equip-cell" data-slot="${slot}" data-age="${it.age}" style="--rc:${this.ageHex(it.age)}" title="${it.name}" onclick="UI.openGearDetail('${slot}')">
            ${this.itemImgHTML(it, 'cell-img')}
            <span class="cell-lv">Lv. ${it.level}</span>
            ${it.stars ? `<span class="cell-star">${IconGen.img('star')}${it.stars > 1 ? it.stars : ''}</span>` : ''}
        </div>`;
    },

    // 승천 라인 아이콘 — `Ascension.LINE_ICON` 의 이모지(⚒️🎫🥚⚙️) 대신 IconGen 아이콘을 쓴다.
    // 없는 라인은 원래 이모지로 떨어지므로 라인이 늘어도 안 깨진다.
    ASC_ICON: { forge: 'hammer', skill: 'ticket', pet: 'egg', mount: 'winder' },
    ascIcon(line, cls) {
        return IconGen.img(this.ASC_ICON[line], cls) || Ascension.LINE_ICON[line] || '';
    },

    // ⚠️ **표에 없는 시대 키 하나가 UI 전체를 날리던 자리다** (2026-08-19 QA 18차, save-bad-age-kills-ui):
    //    가드가 없어 `AGE_COLORS[age]` 가 undefined 면 `.toString` 에서 죽고, 이 함수를 부르는
    //    `equipCellHTML` 이 `UI.init()` 안이라 **장비 시트와 모루가 통째로 안 그려졌다**(실측 `.equip-cell` 9→0).
    //    `AGES`/`AGE_COLORS` 는 이미 한 번 통째로 교체된 적이 있어(키 하나만 바뀌어도) 실전에서도 난다.
    //    처방은 `srRgb` 와 같다 — 회색으로 떨어뜨리되 **조용히 삼키지 않고** `console.error` 를 낸다.
    //    (삼키면 `probe-screens-errors` 의 '콘솔 에러 0건' 판정에 안 걸려 다음에도 못 본다.)
    AGE_HEX_FALLBACK: '#808080',
    ageHex(age) {
        const c = AGE_COLORS[age];
        if (typeof c !== 'number' || !Number.isFinite(c)) {
            console.error('[UI.ageHex] 시대표에 없는 시대 키다(손상 세이브?):', age);
            return this.AGE_HEX_FALLBACK;
        }
        return '#' + c.toString(16).padStart(6, '0');
    },

    // ===== 3D 스냅샷 썸네일을 프레임에 꽉 채우기 =====
    // Scene3D.itemThumb은 96×96 캔버스를 **고정 카메라**로 찍는다. 장비마다 실루엣이 달라
    // 그림이 캔버스의 40%대만 채우고 나머지는 투명 여백이라, 셀에 넣으면 원본(잉크 79.4%)의
    // 1/4 크기로 보였다(실측 18%). 카메라를 좁히는 건 scene3d.js(3D 스트림 소관)라,
    // UI 쪽에서 **찍힌 그림의 불투명 bbox를 한 번 재서** 그만큼 확대·중심 보정한다.
    // 이 방식은 3D가 나중에 프레이밍을 바꿔도 자동으로 따라간다(고정 배율 하드코딩 금지).
    // 측정은 dataURL 단위 캐시 — Scene3D가 아이템 키로 썸네일을 캐시하므로 재렌더 비용 0.
    // 원본 shot-042120 실측(499×892, 셀 67px, 9칸): 잉크 bbox **긴 변** 평균 82.9%(73.1~88.1%),
    // 가로 평균 79.4% / 세로 평균 82.1%. 실루엣 모양은 장비마다 달라 '긴 변'을 기준으로 맞춘다
    // (짧은 변까지 억지로 키우면 검·창 같은 길쭉한 장비가 셀 밖으로 삐져나온다).
    // ⚠️ 의도된 원본 이탈(slot-item-size-down): 사용자 지시 "슬롯에 장비가 너무 크게 되어 있음
    // 약간만 줄여"(2026-08-18)로 원본 0.83 → 0.76. probe-cell-icon-size.js 목표치도 76.0으로 같이
    // 내렸다 — 이 값을 되올리려면 사용자 지시 철회가 먼저다(프로브만 0.83으로 되돌리면 가짜 FAIL).
    THUMB_INK: 0.76,
    _thumbFit: {},          // dataURL → { t: transform 문자열, k: 확대 배율 }
    _thumbPending: {},
    // 잰 결과를 요소에 얹는다. ⚠️ `--fit-k`를 같이 심는 게 중요하다 — CSS filter 는 요소에 먼저 걸리고
    // transform 이 그 결과를 확대하므로, 검정 아웃라인(drop-shadow)도 **배율만큼 같이 두꺼워진다**.
    // 배율이 장비마다 1.0~3.2로 달라서 그대로 두면 칸마다 테 두께가 3배까지 벌어진다(원본은 균일).
    // 아웃라인 폭을 `calc(--slot-out / --fit-k)` 로 나눠 화면상 두께를 일정하게 만든다.
    applyThumbFit(img, fit) {
        img.style.transform = fit.t;
        img.style.setProperty('--fit-k', fit.k);
    },
    // 렌더 직후 호출 — 이미 잰 썸네일은 즉시, 처음 보는 썸네일은 디코드 후 비동기로 적용한다
    fitThumbs(root) {
        const imgs = (root || document).querySelectorAll('img.fit-ink');
        for (const img of imgs) {
            const src = img.getAttribute('src');
            if (!src) continue;
            const fit = this._thumbFit[src];
            if (fit) { this.applyThumbFit(img, fit); continue; }
            if (this._thumbPending[src]) continue;
            this._thumbPending[src] = true;
            this.measureThumb(src);
        }
    },
    measureThumb(src) {
        const im = new Image();
        im.onload = () => {
            delete this._thumbPending[src];
            const w = im.naturalWidth, h = im.naturalHeight;
            let t = 'none', kOut = 1;
            try {
                const cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                const cx = cv.getContext('2d');
                cx.drawImage(im, 0, 0);
                const d = cx.getImageData(0, 0, w, h).data;
                let x0 = w, x1 = -1, y0 = h, y1 = -1;
                for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                    if (d[(y * w + x) * 4 + 3] > 24) {
                        if (x < x0) x0 = x; if (x > x1) x1 = x;
                        if (y < y0) y0 = y; if (y > y1) y1 = y;
                    }
                }
                if (x1 >= 0) {
                    const fill = Math.max((x1 - x0 + 1) / w, (y1 - y0 + 1) / h);
                    // 배율은 상한만 둔다 — 빈 캔버스에 가까운 썸네일이 나와도 화면을 뚫지 않게.
                    // 하한 1을 두면 안 된다: 3D가 프레이밍을 꽉 채우게 바꾸면(fill>0.83) 축소가
                    // 필요한데 1에 잘려 잉크가 90%대로 커진다(cell-icon-oversize 회귀의 원인 실측).
                    // fill≤1 이라 k는 자연히 THUMB_INK 아래로 안 내려간다 — 별도 하한 불필요.
                    const k = Math.min(3.2, this.THUMB_INK / Math.max(0.05, fill));
                    // 잉크 중심을 프레임 중심으로: scale 먼저라 translate는 스케일 전 좌표계(요소 크기 %)
                    const ox = -((x0 + x1 + 1) / 2 / w - 0.5) * 100;
                    const oy = -((y0 + y1 + 1) / 2 / h - 0.5) * 100;
                    t = `scale(${k.toFixed(3)}) translate(${ox.toFixed(2)}%, ${oy.toFixed(2)}%)`;
                    kOut = +k.toFixed(3);
                }
            } catch (e) { /* 캔버스 접근 실패(파일 프로토콜 등) — 원본 크기 그대로 둔다 */ }
            const fit = this._thumbFit[src] = { t, k: kOut };
            document.querySelectorAll('img.fit-ink').forEach(el => {
                if (el.getAttribute('src') === src) UI.applyThumbFit(el, fit);
            });
        };
        im.onerror = () => { delete this._thumbPending[src]; };
        im.src = src;
    },

    // 장비 이미지: 무기/투구/갑옷은 실제 3D 모델 스냅샷, 나머지는 아이콘
    itemImgHTML(item, cls) {
        const thumb = (typeof Scene3D !== 'undefined') ? Scene3D.itemThumb(item) : null;
        // 잉크 맞춤은 지금은 메인 화면 장비 셀에만 건다 — 비교 팝업·모루 카드는 이미
        // 원본 비율로 채점을 통과한 배치라 배율을 건드리면 그쪽이 어긋난다.
        const fit = /\bcell-img\b/.test(cls) ? ' fit-ink' : '';
        if (thumb) return `<img class="${cls}${fit}" src="${thumb}" alt="">`;
        return `<div class="${cls} emoji">${this.SLOT_EMOJI[item.slot] || '🎁'}</div>`;
    },

    // 아이템 카드 HTML (비교/세부정보 공용, UI-SPEC 25·26번 원본 레이아웃 — 위 리본 태그 + 좌 아이콘(Lv+⭐) + 우 이름/주스탯(비교 화살표)/서브스탯)
    itemCardHTML(item, tag, arrowDir, isNew) {
        if (!item) return `<div class="cmp-card-wrap"><span class="cmp-ribbon">${tag}</span><div class="cmp-card empty"><div class="muted" style="margin:auto">빈 슬롯 — 장착 중인 장비 없음</div></div></div>`;
        const subsHtml = item.subs.length ? item.subs.map(s => `<div class="cmp-sub">${U.subText(s)}</div>`).join('') : '';
        const arrowHtml = arrowDir ? `<span class="arrow ${arrowDir}">${arrowDir === 'up' ? '▲' : '▼'}</span>` : '';
        return `<div class="cmp-card-wrap ${isNew ? 'new' : 'cur'}">
            ${isNew ? '' : `<span class="cmp-ribbon">${tag}</span>`}
            <div class="cmp-card" style="--rc:${this.ageHex(item.age)};--rcink:${this.inkRarity(this.ageHex(item.age))}">
                <div class="cmp-icon-wrap">
                    ${this.itemImgHTML(item, 'cmp-img')}
                    <span class="sk-lv">Lv.${item.level}</span>
                    ${item.stars ? `<span class="cmp-star">${IconGen.img('star')}${item.stars}</span>` : ''}
                    ${isNew ? `<span class="cmp-newtag">${tag}</span>` : ''}
                </div>
                <div class="cmp-info">
                    <div class="cmp-name">[${AGE_KR[item.age]}] ${item.name}</div>
                    <div class="cmp-stat">${U.fmt(Forge.itemValue(item))} ${item.main === 'atk' ? '피해' : '체력'}${arrowHtml}</div>
                    ${subsHtml}
                </div>
            </div>
        </div>`;
    },

    showCraftModal(item) {
        const cur = S.equipment[item.slot];
        const isMatch = Forge.isMatchingGear(item, cur);
        // 아래 카드가 '방금 뽑은 것'인지 '[장착]에 밀려 내려온 옛 장비'인지로 리본이 갈린다.
        // 표식(_swapped)은 대기품에 얹혀 세이브까지 따라가므로 새로고침 복원(restorePendingCraft)·
        // 보류 카드 재개봉(onOpenHeld)에서도 라벨이 '새로운!'으로 되돌아가지 않는다.
        const swapped = !!item._swapped;
        const newTag = swapped ? '교체됨' : '새로운!';
        // 원본은 전투력이 아니라 두 장비의 주 스탯(공격력/체력) 값을 직접 비교해 화살표를 매김 (UI-SPEC 25번)
        // 승천 별이 붙은 장비와 안 붙은 장비를 함께 비교해야 하므로 별 배율까지 반영한 itemValue로 견준다
        const newIsHigher = !cur || Forge.itemValue(item).gte(Forge.itemValue(cur));
        // 장착 중인 장비가 위, 새 장비가 아래 (UI-SPEC 25번)
        // 원본(shot-043224): 타이틀 줄 없음, 버튼 라벨은 "판매"/"장착"만 — 판매액·기존 판매 안내는 소자로
        this.els.craftModal.innerHTML = `
            <div class="modal-card wide" style="--rc:${this.ageHex(item.age)}">
                <div class="cmp-wrap">
                    ${this.itemCardHTML(cur, '장착됨', cur ? (newIsHigher ? 'down' : 'up') : null, false)}
                    <!-- 원본(043224)은 회색 패널이 새 장비 카드만이 아니라 [판매]/[장착] 버튼까지 품고
                         카드 하단 7px 앞까지 내려간다(픽셀 실측 x90~415 y548~769) — 버튼 행을 패널 안에 둔다. -->
                    <div class="cmp-lower">
                        ${this.itemCardHTML(item, newTag, cur ? (newIsHigher ? 'up' : 'down') : null, true)}
                        <div class="row">
                            <button class="btn sell" onclick="UI.resolveCraft('sell')">판매<small>${IconGen.img('coin')} +${U.fmt(Forge.sellPrice(item))}</small></button>
                            <!-- '기존 보관'은 보관함 시절 문구다 — 보관함 폐기 후 밀려난 장비는 보관되지 않고 사라지므로
                                 그대로 두면 거짓 안내가 된다(사용자 확정 2026-08-17 "장착은 교체만"). -->
                            <button class="btn equip" onclick="UI.resolveCraft('equip')">장착${cur ? `<small>${swapped ? '다시 장착' : '기존 교체'}</small>` : ''}</button>
                        </div>
                    </div>
                </div>
            </div>`;
        this.showModal(this.els.craftModal);
    },

    // 장비 세부정보 팝업 (UI-SPEC 26번): 메인 화면 장비 카드 클릭 시 — 비교 팝업과 달리 버튼 없음, 바깥 탭하면 닫힘.
    openGearDetail(slot) {
        if (!S.equipment[slot]) return;
        this._gearDetailSlot = slot;
        this.renderGearDetail();
        this.showModal(this.els.gearDetailModal);
    },
    // 내용만 다시 그리는 경로를 open과 분리해 둔다 — 이름이 render*라 installScrollKeeper가 자동으로
    // 감싸므로, 오토포지 틱 등으로 다시 그려도 스크롤이 맨 위로 튀지 않는다.
    renderGearDetail() {
        const slot = this._gearDetailSlot;
        if (!slot) return;
        // 다른 팝업과 같은 골격(`.idet-wrap` + 카드 아래 빨간 ✕)을 쓴다 — 이 팝업만 ✕ 가 없어서
        // 화면에 보이는 닫는 길이 하나도 없었다(배경 탭만 먹혔고 ESC 는 이 게임 어디서도 안 먹는다).
        // ⚠️ `.idet-wrap` 은 카드 아래로 튀어나온 ✕ 까지 끌어안는다. 이 팝업은 하단 앵커라
        //    그만큼 카드가 위로 뜬다 — style.css 의 `padding-bottom` 에서 그 몫을 빼 뒀다.
        this.els.gearDetailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide gd-card">
                    <div class="cmp-wrap">${this.itemCardHTML(S.equipment[slot], '장착됨', null, false)}</div>
                </div>
                <button class="x-btn" onclick="UI.closeGearDetail()">${IconGen.img('xmark')}</button>
            </div>`;
    },
        closeGearDetail() { this.els.gearDetailModal.classList.add('hidden'); this._gearDetailSlot = null; },

    // ---- 장비 교체 연출 (equip-swap-throwout, 사용자 지시 2026-08-19) ----
    // 사용자 원문: "장비 교체될 때 예전 꺼는 회전하면서 바닥으로 나가떨어지는 느낌으로.
    //              새로 교체된 거는 딸깍 하고 그 자리에 들어가게."
    // 세 박자로 읽힌다 — ⑴ 옛 장비 타일이 칸에서 튕겨 나와 **회전하며** 바닥으로 떨어져 먼지를 내고,
    // ⑵ 그동안 칸은 **빈 소켓**으로 비어 있다가(이게 없으면 새 장비가 처음부터 앉아 있어 '들어가는'
    //    순간이 사라진다 — 렌더는 이미 끝나 있으니 눈으로 감춰 줘야 한다), ⑶ 새 장비가 오버슈트로
    //    딸깍 앉는다.
    // 궤적 문법은 coinBurst와 같다: x·y·회전을 **다른 요소에 나눠** 건다(한 요소에 합치면 직선이 된다).
    // 날아가는 물건은 `.equip-cell` 클래스를 그대로 입힌 **복제 타일**이라 프레임·시대 무늬·Lv/별이
    // 칸에 있던 그대로 날아간다 (`craft-card-slot-look`의 '슬롯 룩' 일관성).
    // ⚠️ 레이어를 비교 팝업(.modal z-index 20) **위**(21)에 둔다. 장비 그리드 5칸 중 가운데 3칸은
    //    실측상 팝업 카드(x 111~319 / y 401~621 @430x932)에 통째로 가려서, 시트(z-index 5) 안에서
    //    연출하면 스왑 경로(팝업이 열린 채 두 카드가 맞바뀌는 주 경로)에서 아무것도 안 보인다.
    //    딸깍도 같은 이유로 **복제 타일을 이 레이어에 띄우고 원본 칸은 그동안 감춘다**(겹쳐 그리지 않게).
    EQSW_FLY_MS: 900,
    EQSW_LAND_K: 0.58,      // @keyframes eqswY 에서 타일이 처음 바닥에 닿는 지점(= 58%). 먼지·착지음이 이 시각을 쓴다
    EQSW_SNAP_MS: 340,      // @keyframes eqswSnap 길이 — css 와 같은 값이어야 한다
    EQSW_SNAP_DELAY: 130,   // 옛 것이 먼저 튀어나가고, 그 뒤에 새 것이 들어앉는다
    // 던져 낸 타일은 날아가면서 이만큼으로 **줄어든다**(멀어지는 물건의 원근 + '치워졌다'는 읽기).
    // 연출용 장식이 아니라 **자리 문제의 해답**이다: 비교 팝업 카드가 실측 296px(430폭의 68.8%)라
    // 좌우에 67px 씩밖에 안 남는데, 원래 크기(회전 AABB 66px)로는 어느 쪽에도 못 선다.
    // 줄이면 AABB 가 36px 이 돼 카드 옆 어두운 띠에 여유 있게 눕는다. css `--sk` 로 넘어간다.
    EQSW_SHRINK: 0.55,

    // 렌더가 칸을 갈아끼우기 **전에** 옛 타일의 좌표·모습을 붙잡아 둔다.
    // null 이면(칸이 화면에 없다) 호출부는 연출을 조용히 생략한다.
    grabEquipSwapFx(slot) {
        const host = document.getElementById('app');
        const cell = document.querySelector(`#equip-sheet .equip-grid .equip-cell[data-slot="${slot}"]`);
        const sheet = document.getElementById('equip-sheet');
        if (!host || !cell || !sheet) return null;
        const hb = host.getBoundingClientRect(), cb = cell.getBoundingClientRect();
        if (!cb.width || !cb.height) return null;   // 다른 탭이라 시트가 접혀 있으면 생략
        const sb = sheet.getBoundingClientRect();
        // 열려 있는 팝업 카드의 가로 범위 — 던져 낸 타일이 **그 위에 누워 쉬지 않게** 피할 자리다.
        // 주 경로(비교 팝업이 열린 채 두 카드가 맞바뀌는 스왑)에서 카드는 장비 그리드 한복판을
        // 덮고 있고, 그냥 떨어뜨리면 타일이 [판매]/[장착] 버튼 위에 얹혀 '고장 난 화면'으로 읽힌다
        // (실측: 착지 뒤 정지 구간이 378ms 라 그 그림이 한참 남는다).
        let block = null;
        const card = document.querySelector('.modal:not(.hidden) .modal-card');
        if (card) {
            const bb = card.getBoundingClientRect();
            if (bb.width) block = { l: bb.left - hb.left, r: bb.right - hb.left };
        }
        return {
            slot, block,
            cx: cb.left - hb.left + cb.width / 2,
            cy: cb.top - hb.top + cb.height / 2,
            w: cb.width, h: cb.height,
            hostW: hb.width, hostH: hb.height,
            // 바닥 = 장비 시트의 아랫단. 앱 바닥까지 떨어뜨리면 탭바 위에 얹혀 '내비바에 낀 쓰레기'로
            // 읽히고, 시트 안에서 멈추면 패널의 바닥에 떨어진 것으로 읽힌다.
            floorY: sb.bottom - hb.top,
            age: cell.getAttribute('data-age') || '',
            rc: cell.style.getPropertyValue('--rc') || '#6b3538',
            inner: cell.innerHTML,
        };
    },

    playEquipSwapFx(fx) {
        if (!fx) return;
        const host = document.getElementById('app');
        if (!host) return;
        let layer = document.getElementById('equip-swap-fx');
        if (!layer) { layer = document.createElement('div'); layer.id = 'equip-swap-fx'; host.appendChild(layer); }
        // OS '움직임 줄이기'는 존중한다 — 던지지도 감추지도 않고 그냥 갈린 결과만 남긴다
        // (css 쪽 `.equip-cell { animation: none !important }` 미디어쿼리와 같은 태도).
        const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (calm) return;

        const cell = document.querySelector(`#equip-sheet .equip-grid .equip-cell[data-slot="${fx.slot}"]`);

        // ---- ⑴ 옛 장비 — 회전하며 바닥으로 ----
        // 나가는 방향은 **화면 바깥쪽**이다(안쪽으로 던지면 다른 칸들 위를 가로질러 어수선하다).
        // 단 착지점은 화면 안으로 물린다 — 가장자리 칸(무기/신발)은 벽이 가까워 그만큼 짧게 날아간다.
        const dir = fx.cx < fx.hostW / 2 ? -1 : 1;
        // 회전은 **한/두 바퀴 + 약간의 기울기**로 끝난다(`@keyframes eqswR` 이 착지 시점에 멈춘다).
        // 바퀴 수를 정수로 잡는 이유는 두 가지다 — ⓐ 착지 뒤에도 계속 돌면 '바닥에 놓인 물건'이 아니라
        // 공중에 떠 있는 것으로 읽히고, ⓑ 아무 각도로나 멈추면 45° 부근에서 타일의 **가로 폭이 √2배**로
        // 부풀어(56.9→80.5px) 아래 자리 계산이 통째로 어긋난다. 남기는 기울기는 '툭 던져 놓은' 결의 몫.
        const tilt = U.rand(8, 22);
        const spin = dir * (360 * (U.rand(0, 1) < 0.5 ? 1 : 2) + tilt);
        // 멈춘 타일의 **가로 반경**을 각도에서 직접 낸다: 기울인 사각형의 AABB 반폭 = (W·cosθ + H·sinθ)/2.
        // ⚠️ 어림수(0.68w 등)로 잡으면 안 된다 — 기울기가 상한(22°)이고 착지 스쿼시가 겹친 프레임에서
        //    딱 몇 px 모자라 카드를 스친다(실측으로 두 번 걸렸다). W·H 는 `@keyframes eqswSquash` 의
        //    축별 최대 배율(가로 1.12 / 세로 1.05)을 물려 재고, 안티에일리어싱 몫으로 2px 더 준다.
        const th = tilt * Math.PI / 180, sk = this.EQSW_SHRINK;
        const reach = (fx.w * sk * 1.12 * Math.cos(th) + fx.h * sk * 1.05 * Math.sin(th)) / 2 + 2;
        let landX = U.clamp(fx.cx + dir * fx.w * U.rand(1.5, 2.2), reach, fx.hostW - reach);
        // 바닥에 눕는 자리 = 시트 아랫단에서 **줄어든 타일의 세로 반경**만큼 위
        let drop = Math.max(fx.h * 1.1, fx.floorY - fx.cy - (fx.h * sk * (Math.cos(th) + Math.sin(th))) / 2);
        let lands = true;
        // 팝업 카드가 열려 있으면 착지점을 카드 **옆 빈 띠**로 옮긴다. 날아가는 도중 카드 위를
        // 지나는 건 상관없다(움직이는 물건이라 궤적으로 읽힌다) — 문제는 **누워서 쉬는 자리**다.
        if (fx.block && landX + reach > fx.block.l && landX - reach < fx.block.r) {
            const bands = [
                { lo: reach, hi: fx.block.l - reach, side: -1 },
                { lo: fx.block.r + reach, hi: fx.hostW - reach, side: 1 },
            ].filter(b => b.hi >= b.lo);
            if (bands.length) {
                // 날아가던 쪽 띠를 먼저 쓰고, 그쪽이 없으면 반대쪽
                const band = bands.find(b => b.side === dir) || bands[0];
                landX = U.clamp(landX, band.lo, band.hi);
            } else {
                // 좁은 화면(360폭 실측)은 카드가 좌우를 다 먹어 **비켜설 자리가 아예 없다**.
                // 그럴 땐 바닥에 눕히지 않고 **화면 밖으로 떨어뜨린다** — 레이어가 잘라 준다.
                // 억지로 카드 위에 눕히면 [판매]/[장착] 버튼을 가려 화면이 고장 나 보인다.
                drop = fx.hostH - fx.cy + fx.h;
                lands = false;
            }
        }
        const dx = landX - fx.cx;
        const rise = -U.rand(0.42, 0.64) * fx.h;

        const el = document.createElement('div');
        el.className = 'eqsw-fly';
        el.style.cssText = `left:${fx.cx.toFixed(1)}px; top:${fx.cy.toFixed(1)}px;`
            + ` --dx:${dx.toFixed(1)}px; --dur:${this.EQSW_FLY_MS}ms; --sk:${sk}`;
        el.innerHTML = `<div class="eqsw-fly-y" style="--rise:${rise.toFixed(1)}px; --drop:${drop.toFixed(1)}px">`
            + `<div class="eqsw-fly-r" style="--spin:${spin.toFixed(0)}deg">`
            + `<div class="eqsw-fly-box equip-cell"${fx.age ? ` data-age="${fx.age}"` : ''}`
            + ` style="--rc:${fx.rc}; width:${fx.w.toFixed(1)}px; height:${fx.h.toFixed(1)}px">${fx.inner}</div>`
            + `</div></div>`;
        layer.appendChild(el);
        setTimeout(() => el.remove(), this.EQSW_FLY_MS + 160);
        SFX.equipToss();

        // 착지하는 그 순간 그 자리에서 먼지가 퍼진다 — '바닥에 닿았다'를 읽히게 하는 단서.
        // 화면 밖으로 떨어뜨린 경우(위 `lands=false`)는 닿는 바닥이 없으니 먼지도 착지음도 없다.
        if (lands) setTimeout(() => {
            const d = document.createElement('div');
            d.className = 'eqsw-dust';
            d.style.cssText = `left:${(fx.cx + dx).toFixed(1)}px; top:${(fx.cy + drop + fx.h * sk * 0.46).toFixed(1)}px;`
                + ` --dw:${(fx.w * sk * 1.6).toFixed(1)}px`;
            layer.appendChild(d);
            setTimeout(() => d.remove(), 520);
            SFX.equipDrop();
        }, this.EQSW_FLY_MS * this.EQSW_LAND_K);

        if (!cell) return;

        // ---- ⑵ 그동안 칸은 빈 소켓 ----
        cell.classList.add('eqsw-hollow');

        // ---- ⑶ 새 장비 — 딸깍 ----
        setTimeout(() => {
            // 칸이 그새 다시 그려졌으면(오토포지 틱 등) 붙잡아 둔 노드는 문서 밖이다 — 새로 집는다
            const live = document.querySelector(`#equip-sheet .equip-grid .equip-cell[data-slot="${fx.slot}"]`) || cell;
            const hb = host.getBoundingClientRect(), cb = live.getBoundingClientRect();
            const done = () => { live.classList.remove('eqsw-hollow'); cell.classList.remove('eqsw-hollow'); };
            if (!cb.width) { done(); return; }
            const g = document.createElement('div');
            g.className = 'eqsw-snap';
            g.style.cssText = `left:${(cb.left - hb.left + cb.width / 2).toFixed(1)}px;`
                + ` top:${(cb.top - hb.top + cb.height / 2).toFixed(1)}px; --snap-dur:${this.EQSW_SNAP_MS}ms`;
            g.innerHTML = `<div class="eqsw-snap-box equip-cell"${live.getAttribute('data-age') ? ` data-age="${live.getAttribute('data-age')}"` : ''}`
                + ` style="--rc:${live.style.getPropertyValue('--rc') || fx.rc}; width:${cb.width.toFixed(1)}px; height:${cb.height.toFixed(1)}px">`
                + `${live.innerHTML}</div>`;
            layer.appendChild(g);
            SFX.equipSnap();
            // 복제 타일이 제자리에 앉는 그 프레임에 원본 칸을 되살린다(둘이 겹치는 프레임이 없게)
            setTimeout(() => { done(); g.remove(); }, this.EQSW_SNAP_MS);
        }, this.EQSW_SNAP_DELAY);
    },

    // ---- 판매 코인 분출 (사용자 지시: "모루에서 코인이 터지듯 튀어나오고, 착지 자리마다 금액이 떠오르게") ----
    // 궤적은 CSS 키프레임이 소유하고(연타로 여러 벌이 동시에 돌아도 서로 안 잘라먹는다),
    // 포물선은 x(등속)와 y(상승 감속→낙하 가속)를 **다른 요소에 나눠 걸어** 만든다 — 한 요소에 걸면
    // translate가 합성되면서 직선으로 보인다. 착지 시각(비율)은 CSS 키프레임과 아래 상수가 같이 소유한다.
    COIN_FLY_MS: 780,
    COIN_LAND_K: 0.72,   // 키프레임에서 코인이 지면에 닿는 지점(= @keyframes coinFlyY의 72%)
    // 착지 금액 라벨의 수명(ms) — 사용자 지시 2026-08-19 `sell-coin-split-rising`: "수명 2초 정도".
    // CSS `@keyframes coinAmt` 길이(`.coin-amt { animation-duration }`)와 **같은 값이어야 한다** —
    // 여기가 짧으면 페이드가 끝나기 전에 노드가 사라져 뚝 끊기고, 길면 투명한 노드가 레이어에 쌓인다.
    COIN_AMT_MS: 2000,
    coinBurst(total) {
        total = Math.floor(Number(total) || 0);
        if (total <= 0) return;
        const btn = document.querySelector('.anvil-btn');
        const host = document.getElementById('app');
        if (!btn || !host) return; // 모루가 화면에 없으면(전체화면 시트 등) 조용히 생략
        // 🚨 존재만 보면 안 된다 (coin-burst-over-modal, 2026-08-20 QA 실측): 패널·팝업이 모루를
        //    덮고 있어도 그대로 그려서 연출이 소환 패널·펫 상세·오프라인 보상 위로 뚫고 나왔다.
        //    열린 팝업(.modal)·탭 패널(.panel.open)이 있으면 모루가 가려진 상태다 — 위 의도
        //    주석("조용히 생략")대로 소리까지 통째로 생략한다. z 강등(6)으로 어차피 안 보이는데
        //    소리만 나는 반쪽 연출이 남는 걸 막는다. probe-overlay-panel.js ⑤ 가 이 가드를 단언한다.
        if (document.querySelector('.modal:not(.hidden)') || document.querySelector('.panel.open')) return;
        const hb = host.getBoundingClientRect(), bb = btn.getBoundingClientRect();
        const ox = bb.left - hb.left + bb.width / 2, oy = bb.top - hb.top + bb.height * 0.4;

        let layer = document.getElementById('coin-burst');
        if (!layer) {
            layer = document.createElement('div');
            layer.id = 'coin-burst';
            host.appendChild(layer);
        }
        // 금액 규모로 3~10개 — 금액이 커질수록 많아지되 상한을 둔다(성능·가독성)
        const n = U.clamp(3 + Math.round(Math.log10(Math.max(1, total)) * 1.7), 3, 10);
        // 착지 자리마다 뜨는 값은 **합÷개수로 전부 같은 값**이다 (사용자 지시 2026-08-19
        // `sell-coin-split-rising`: "코인 10개면 합÷10 값으로 각자의 착지자리에서"). 예전엔 마지막
        // 코인이 나머지를 흡수해 혼자 다른 값을 달았는데, 그건 화면 어딘가에 총액이 같이 떠서
        // "쪼갠 값들의 합 = 총액"을 눈으로 맞출 수 있을 때만 의미가 있었다. 총액 표시를 없앤 지금은
        // 한 개만 다른 숫자를 다는 게 오히려 '왜 얘만 다르지'로 읽힌다.
        const per = Math.max(1, Math.round(total / n));
        const coinHtml = IconGen.img('coin');
        // ---- 착지 자리 배치 (QA 발견 버그 수정) ----
        // 예전엔 dx를 ±52~108px, drop을 26~58px 난수로 뿌렸다. 그러면 착지점이 **세로로 두 줄쯤 되는
        // 좁은 띠**에 몰리는데 라벨(`+1.23K`)은 가로로 길어서(최대 3.6rem) 10개가 서로를 덮어 하나도
        // 안 읽혔다(실측 최대 겹침률 87%). 이제 착지점을 **줄(row)×칸(col) 격자**로 잡는다 —
        // 한 줄의 칸 간격은 라벨 최대 너비보다 넓고, 줄 간격은 라벨 높이 + 위로 떠오르는 거리보다 넓다.
        // 단위는 전부 rem 파생 — px 상수로 박으면 360/430/480 폭에서 간격이 제각각이 된다.
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const rows = n <= 4 ? 1 : (n <= 8 ? 2 : 3);
        const colGap = 4.6 * rem;   // 라벨 최대 너비(≈3.6rem)보다 1rem 여유
        const rowGap = 2.4 * rem;   // 라벨 높이(≈0.93rem) + 떠오르는 거리(≈1.25rem)보다 여유
        const row0 = 1.2 * rem;
        // i를 줄에 라운드로빈으로 뿌린다 — x가 이웃한 코인이 같은 줄에 서지 않게
        const colsIn = (r) => Math.ceil((n - r) / rows);
        for (let i = 0; i < n; i++) {
            const amt = per;
            const row = i % rows, col = Math.floor(i / rows), cols = colsIn(row);
            const span = colGap * (cols - 1) / 2;                        // 그 줄의 반폭
            const dx = (cols <= 1 ? 0 : -span + col * colGap) + U.rand(-0.15, 0.15) * rem;
            const rise = -U.rand(58, 104);
            const drop = row0 + row * rowGap;                            // 줄 간격은 흔들지 않는다(겹침의 원인)
            const delay = i * 26 + U.rand(0, 24);
            const el = document.createElement('span');
            el.className = 'coin-fly';
            el.style.cssText = `left:${ox}px; top:${oy}px; --dx:${dx.toFixed(1)}px; --dur:${this.COIN_FLY_MS}ms; --delay:${delay.toFixed(0)}ms`;
            el.innerHTML = `<span class="coin-fly-y" style="--rise:${rise.toFixed(1)}px; --drop:${drop.toFixed(1)}px">`
                + `<span class="coin-fly-img">${coinHtml}</span></span>`;
            layer.appendChild(el);
            setTimeout(() => el.remove(), this.COIN_FLY_MS + delay + 120);
            // 착지하는 그 순간 그 자리에서 금액이 떠오른다(데미지 숫자와 같은 문법 —
            // 임팩트 팝 한 번 → 그 뒤로는 천천히 밀려 올라가며 페이드, 수명 COIN_AMT_MS).
            const landAt = delay + this.COIN_FLY_MS * this.COIN_LAND_K;
            setTimeout(() => {
                const t = document.createElement('span');
                t.className = 'coin-amt';
                t.textContent = '+' + U.fmt(amt);
                t.style.cssText = `left:${(ox + dx).toFixed(1)}px; top:${(oy + drop).toFixed(1)}px;`
                    + ` --amt-dur:${this.COIN_AMT_MS}ms`;
                layer.appendChild(t);
                setTimeout(() => t.remove(), this.COIN_AMT_MS + 60);
            }, landAt);
        }
        // ⚠️ 총액(`.coin-total`)은 **띄우지 않는다** — 사용자 지시 2026-08-19 `sell-coin-split-rising`:
        // "판매할 때 전체 합산 코인이 보이면 안 되고, 코인 착지자리에 … 각자의 착지자리에서".
        // 2026-08-17 지시("코인이 착지한 다음 가격이 떠오르게")를 총액 배지로 구현했던 걸 되돌린 것이라,
        // 되살리지 말 것. 합계를 읽히게 하는 책임은 착지 자리 라벨 N개가 같이 진다.
        SFX.gacha('common'); // 동전 소리 대용 — 짧은 상승 스윕
    },

    // ---- 공통 수령 연출 (reward-claim-fx, 사용자 지시 2026-08-18: "수령받을 때마다 이펙트") ----
    // rewards = { coins, hammers, gems, tickets, potions, winders, eggCurrency … } 지급 재화 묶음.
    // opts.from = 수령을 일으킨 버튼/칸 DOM 요소(연출 시작점). 없으면 화면 가운데 아래쪽.
    // 아이콘이 시작점에서 방사형으로 튀어나왔다가(감속) 상단 바로 빨려 들어간다(가속) —
    // 코인/젬은 제 pill 중심으로, pill이 없는 재화는 상단 바 중앙으로. 도착한 pill은 한 번 박동.
    // 포물선은 coinBurst와 같은 축 분리 문법: 바깥 요소가 X, 안쪽 요소가 Y+크기를 맡는다
    // (한 요소에 합치면 직선이 된다). 좌표가 매번 달라 키프레임은 WAAPI로 만든다.
    RW_FLY_MS: 820,
    rewardBurst(rewards, opts = {}) {
        const entries = Object.entries(rewards || {})
            .map(([k, v]) => [k, Math.floor(Number(v) || 0)])
            .filter(([, v]) => v > 0);
        if (!entries.length) return;
        const host = document.getElementById('app');
        if (!host) return;
        const hb = host.getBoundingClientRect();
        let sx = hb.width / 2, sy = hb.height * 0.58, srcTop = null;
        if (opts.from && opts.from.getBoundingClientRect) {
            const fb = opts.from.getBoundingClientRect();
            if (fb.width || fb.height) {
                // 스폰점은 버튼 세로 상단 1/3 — 중앙에서 흩으면 수평 성분(sin≈0) 아이콘이 행 하단
                // 경계를 스친다(reward-fx-polish ③: 위쪽 편향 강화 + 스폰점을 버튼 상단으로)
                sx = fb.left - hb.left + fb.width / 2; sy = fb.top - hb.top + fb.height * 0.32;
                srcTop = fb.top - hb.top;   // '+획득량' 라벨은 버튼 위 빈 공간으로 — 버튼·토스트와 안 겹치게
            }
        }
        let layer = document.getElementById('reward-burst');
        if (!layer) { layer = document.createElement('div'); layer.id = 'reward-burst'; host.appendChild(layer); }
        // 연출이 도는 동안(마지막 아이콘 도착까지) 토스트를 미룬다 — toast()가 이 시각을 본다
        this._toastHoldUntil = performance.now() + entries.length * 90 + 7 * 44 + this.RW_FLY_MS + 120;
        // 이미 떠 있던 토스트는 감광 — '+획득량' 라벨이 토스트 글자 위에 겹쳐 인쇄되던 충돌 제거
        // (reward-fx-polish 비평가 재지적. 새 토스트는 위에서 미루고, 기존 것은 여기서 물러난다)
        const toasts = document.getElementById('toasts');
        if (toasts) {
            toasts.classList.add('rw-dim');
            clearTimeout(this._rwToastDimT);
            this._rwToastDimT = setTimeout(() => toasts.classList.remove('rw-dim'),
                Math.max(0, this._toastHoldUntil - performance.now()));
        }

        // 도착점 — 렌더 직후라 pill이 없을 수도 있으니 상단 바, 그마저 없으면 화면 위 가운데로 폴백.
        // 박동 대상 요소는 좌표와 달리 **도착 시점에 다시 찾는다**(pulseEl) — 수령 직후 호출부가
        // renderTopBar()로 상단 바를 다시 그리므로, 시작 시점에 잡아 둔 pill은 그때쯤 떼어진 노드다.
        const pillSel = cur => cur === 'coins' ? '.currency-pills .pill.coin'
            : cur === 'gems' ? '.currency-pills .pill.gem' : null;
        const targetOf = cur => {
            const sel = pillSel(cur);
            const el = (sel && document.querySelector(sel)) || this.els.topbar;
            const r = el && el.getBoundingClientRect();
            const pulseEl = () => (sel && document.querySelector(sel)) || this.els.topbar;
            if (!r || (!r.width && !r.height)) return { x: hb.width / 2, y: 10, pulseEl, el: null };
            return { x: r.left - hb.left + r.width / 2, y: r.top - hb.top + r.height / 2, pulseEl, el };
        };
        // 도착 pill이 시트/팝업에 가려져 있는가 — 가려진 화면(퀘스트 등)에서는 도착점을 **덮은 시트의
        // 상단 가장자리**로 승격하고 '작은 재화 배지'를 고정 앵커로 세운다(reward-fx-polish ①).
        // pill 좌표 그대로 두면 배지·별·카운터가 시트 제목/부제목 글줄 위에 떨어진다(비평가 재지적).
        // #reward-burst 는 pointer-events:none 이라 elementFromPoint 에 안 잡힌다.
        const promoteIfCovered = t => {
            if (!t.el) { t.covered = true; return t; }
            const hit = document.elementFromPoint(hb.left + t.x, hb.top + t.y);
            if (hit && (hit === t.el || t.el.contains(hit) || hit.closest('#topbar'))) return t;
            t.covered = true;
            const card = hit && hit.closest('.modal-card');
            if (card) {
                const cr = card.getBoundingClientRect();
                // 카드 상단 모서리 안쪽 — 제목은 가운데 정렬이라 우측 상단 구석이 빈 공간이다
                t.y = Math.max(cr.top - hb.top + 18, 16);
                t.x = U.clamp(t.x, cr.left - hb.left + 26, cr.right - hb.left - 26);
            }
            return t;
        };

        // 임팩트 프레임: 글로우 + 퍼지는 링 (탭의 '맞았다' 순간). 중심은 버튼 중앙보다 살짝 위 —
        // 흩어짐이 위쪽 편향이라 시각적 무게중심을 맞춘다
        for (const cls of ['rw-glow', 'rw-ring']) {
            const fx = document.createElement('span');
            fx.className = cls;
            fx.style.cssText = `left:${sx.toFixed(1)}px; top:${(sy - 10).toFixed(1)}px`;
            layer.appendChild(fx);
            setTimeout(() => fx.remove(), 640);
        }
        // 누른 자리 자체도 반응한다 — 탭한 표면이 무반응이면 연출이 붕 뜬다(비평가 지적 ⑥)
        if (opts.from && opts.from.classList) {
            opts.from.classList.add('rw-pulse');
            setTimeout(() => opts.from.classList && opts.from.classList.remove('rw-pulse'), 500);
        }

        entries.forEach(([cur, amt], ci) => {
            const icoKey = this.CURRENCY_ICON[cur] || 'coin';
            const icoHtml = IconGen.img(icoKey) || IconGen.img('coin');
            const t = promoteIfCovered(targetOf(cur));
            // 획득량이 클수록 아이콘이 많아지되 상한(성능·가독성) — coinBurst와 같은 로그 눈금
            const n = U.clamp(2 + Math.round(Math.log10(Math.max(1, amt)) * 1.3), 2, 7);
            // 재화별 마지막 아이콘의 출발 시각 — 마침표·앵커 수명이 이 값 기준이라 루프보다 먼저 계산
            const lastDelay = ci * 90 + (n - 1) * 44 + 22;
            if (t.covered) {
                const an = document.createElement('span');
                an.className = 'rw-anchor';
                an.innerHTML = icoHtml;
                an.style.cssText = `left:${t.x.toFixed(1)}px; top:${t.y.toFixed(1)}px; animation-delay:${(ci * 90).toFixed(0)}ms`;
                layer.appendChild(an);
                setTimeout(() => { an.classList.add('out'); setTimeout(() => an.remove(), 340); },
                    lastDelay + this.RW_FLY_MS + 460);
            }
            for (let i = 0; i < n; i++) {
                const delay = ci * 90 + i * 44 + U.rand(0, 22);
                // 흩어짐 반경은 행 높이의 6할쯤(≈40px 이내) — 더 크면 어느 행의 보상인지 못 읽는다(비평가 지적)
                const ang = U.rand(0, Math.PI * 2), rad = U.rand(18, 40);
                // 흩어짐은 **항상 버튼 위쪽** — 아래로 퍼지면 다음 행 카운터 위에 앉아
                // '옆 행이 재화를 뿜는' 오독이 된다(비평가 지적: 침범이 아니라 귀속 오류)
                // 최소 상승 -10px(reward-fx-polish ③) — 수평 성분 아이콘이 행 하단 경계를 스치지 않게
                const rx = Math.cos(ang) * rad, ry = -Math.abs(Math.sin(ang)) * rad * 0.9 - 10;
                const rot = U.rand(-160, 160);   // 흡수 중 회전 — 정지 스프라이트 순간이동 느낌 방지
                const el = document.createElement('span');
                el.className = 'rw-fly';
                el.style.cssText = `left:${sx.toFixed(1)}px; top:${sy.toFixed(1)}px`;
                const yEl = document.createElement('span');
                yEl.style.display = 'inline-block';
                yEl.innerHTML = icoHtml;
                el.appendChild(yEl);
                layer.appendChild(el);
                el.animate([
                    { transform: 'translateX(0px)', offset: 0, easing: 'cubic-bezier(.2,.8,.35,1)' },
                    { transform: `translateX(${rx.toFixed(1)}px)`, offset: 0.34, easing: 'cubic-bezier(.6,0,.8,.4)' },
                    { transform: `translateX(${(t.x - sx).toFixed(1)}px)`, offset: 1 },
                ], { duration: this.RW_FLY_MS, delay, fill: 'both' });
                // ⚠️ 두 번째 구간 이징에 음수 성분(cubic-bezier y<0)을 쓰면 안 된다 — '움찔' 예비동작이
                // 버튼 아래로 처져 다음 행 위에 앉는다(비평가 실측: 첫 200ms 동안 행 경계 아래로 침범)
                yEl.animate([
                    { transform: 'translateY(0px) rotate(0deg) scale(.35)', opacity: .2, offset: 0, easing: 'cubic-bezier(.2,.9,.35,1.1)' },
                    { transform: `translateY(${ry.toFixed(1)}px) rotate(${(rot * 0.3).toFixed(0)}deg) scale(1)`, opacity: 1, offset: 0.34, easing: 'cubic-bezier(.5,0,.75,.45)' },
                    { transform: `translateY(${(t.y - sy).toFixed(1)}px) rotate(${rot.toFixed(0)}deg) scale(.62)`, opacity: 1, offset: 0.94 },
                    { transform: `translateY(${(t.y - sy).toFixed(1)}px) rotate(${rot.toFixed(0)}deg) scale(.5)`, opacity: 0, offset: 1 },
                ], { duration: this.RW_FLY_MS, delay, fill: 'both' });
                setTimeout(() => el.remove(), delay + this.RW_FLY_MS + 60);
                // 착지 박자: 잔불꽃 + 도착 지점의 누적 카운터가 아이콘이 닿을 때마다 뛰어오른다 —
                // 상단 바가 시트에 가려져 있어도 '값이 여기 쌓이고 있다'가 눈에 보인다(도착 = 감정적 보상)
                const per = Math.round(amt * (i + 1) / n);
                setTimeout(() => {
                    const sp = document.createElement('span');
                    sp.className = 'rw-pop rw-pop-sm';
                    sp.style.cssText = `left:${(t.x + U.rand(-8, 8)).toFixed(1)}px; top:${(t.y + U.rand(-6, 6)).toFixed(1)}px`;
                    layer.appendChild(sp);
                    setTimeout(() => sp.remove(), 320);
                    let tick = layer.querySelector(`.rw-tick[data-cur="${cur}"]`);
                    if (!tick) {
                        tick = document.createElement('span');
                        tick.className = 'rw-tick';
                        tick.dataset.cur = cur;
                        // 가려진 화면(도착점이 시트 상단 가장자리로 승격된 경우)에서는 카운터를 앵커
                        // **위**(시트 밖 어두운 밴드)로 — 아래(+22)로 두면 시트 부제목 글줄을 스친다
                        const ty = t.covered ? Math.max(t.y - 30, 8) : Math.max(t.y, 20) + 22;
                        tick.style.cssText = `left:${t.x.toFixed(1)}px; top:${ty.toFixed(1)}px`;
                        layer.appendChild(tick);
                    }
                    tick.innerHTML = `+${U.fmt(per)} ${icoHtml}`;
                    tick.classList.remove('bump');
                    void tick.offsetWidth;
                    tick.classList.add('bump');
                }, delay + this.RW_FLY_MS * 0.94);
            }
            // 도착 마침표는 그 재화의 **마지막** 아이콘이 들어오는 순간 한 번 — 먼저 터뜨리면
            // 늦게 오는 아이콘이 마침표 뒤에 그냥 증발하는 것처럼 보인다(비평가 지적 ④)
            setTimeout(() => {
                const pop = document.createElement('span');
                pop.className = 'rw-pop';
                pop.style.cssText = `left:${t.x.toFixed(1)}px; top:${t.y.toFixed(1)}px`;
                layer.appendChild(pop);
                setTimeout(() => pop.remove(), 380);
                // 누적 카운터는 마지막 착지 한 박자 뒤에 정리
                const tick = layer.querySelector(`.rw-tick[data-cur="${cur}"]`);
                if (tick) { tick.classList.add('out'); setTimeout(() => tick.remove(), 300); }
                const pu = t.pulseEl();
                if (!pu) return;
                // ⚠️ **상단 바 폴백일 때는 크기가 안 변하는 박동을 쓴다** (topbar-pulse-overflow):
                //    코인·젬이 아닌 재화는 도착 pill 이 없어 `pulseEl` 이 상단 바로 폴백하는데,
                //    상단 바는 앱 폭 전체를 차지하는 밴드라 `scale(1.26)` 이면 좌우가 잘린다.
                //    (pill 이 있는 재화는 종전 `.rw-pulse` 그대로 — 그쪽은 정상이고 값도 의도된 것이다.)
                const cls = pu === this.els.topbar ? 'rw-pulse-band' : 'rw-pulse';
                pu.classList.remove('rw-pulse', 'rw-pulse-band');
                void pu.offsetWidth;               // 연속 수령에도 매번 박동하도록 애니메이션 리스타트
                pu.classList.add(cls);
                setTimeout(() => pu.classList.remove(cls), 500);
            }, lastDelay + this.RW_FLY_MS * 0.94 + 140);
            // 재화별 '+획득량' — 버튼 상단 위 빈 공간으로 재화 수만큼 줄줄이 떠오른다
            const lbl = document.createElement('span');
            lbl.className = 'rw-amt';
            lbl.innerHTML = `+${U.fmt(amt)} ${icoHtml}`;
            // 버튼 위-왼쪽 대각으로 뺀다: 보상 카운터('17' 등)는 버튼과 같은 오른쪽 세로줄에 있어
            // 같은 x로 띄우면 어느 높이에서든 부딪힌다. 왼쪽 이웃은 진행바/빈 공간이라 안전하다.
            // 상승 폭은 짧게(css rwAmt ≈ -2rem) — 첫 행에서 시트 부제목까지 올라가 죽지 않게.
            const lx = U.clamp(srcTop === null ? sx : sx - 64, 44, hb.width - 44);
            const ly = (srcTop === null ? sy - 16 : srcTop - 42) - ci * 30;
            // 수명 660ms — 첫 아이콘 도착(ci*90 + 820*0.94 ≈ ci*90+771)보다 먼저 끝난다:
            // 소스 '+획득량'과 도착 누적 카운터가 동시에 보이는 이중 표기 순간 제거(reward-fx-polish ④)
            lbl.style.cssText = `left:${lx.toFixed(1)}px; top:${ly.toFixed(1)}px; animation-delay:${ci * 110}ms`;
            layer.appendChild(lbl);
            setTimeout(() => lbl.remove(), 720 + ci * 110);
        });
        SFX.gacha('rare');   // 수령 차임 — 판매 코인(common)보다 한 단 밝은 스윕
    },

    // 스킬 컷인 + 화면 색 플래시
    skillCutin(def) {
        const el = document.getElementById('skill-cutin');
        // 스킬 18종은 `sk_*` 아이콘이 이미 있는데 여기만 이모지였다 — 오브에는 아이콘, 컷인에는
        // 이모지가 떠서 같은 스킬이 두 얼굴이었다. ⚠️ 이 자리는 `textContent` 라 `<i>` 를 문자열로
        // 넣으면 태그가 글자로 찍힌다 — 토스트와 같이 **아이콘만 노드로, 이름은 텍스트 노드로** 붙인다.
        el.textContent = '';
        const ico = IconGen.skill(def.id);
        if (ico) {
            const wrap = document.createElement('span');
            wrap.innerHTML = ico;
            if (wrap.firstChild) { wrap.firstChild.className += ' cutin-ico'; el.appendChild(wrap.firstChild); }
        } else if (SKILL_ICONS[def.id]) {
            el.appendChild(document.createTextNode(SKILL_ICONS[def.id] + ' '));
        }
        el.appendChild(document.createTextNode(def.name));
        el.style.color = def.color;
        el.classList.remove('play');
        void el.offsetWidth; // 애니메이션 재시작
        el.classList.add('play');
    },
    skillFlash(color) {
        const el = document.getElementById('skill-flash');
        el.style.background = `radial-gradient(ellipse at center, ${color}33 0%, transparent 65%)`;
        el.classList.remove('play');
        void el.offsetWidth;
        el.classList.add('play');
    },

    // ---- 상위 시대 판매 경고 (사용자 지시 2026-08-17, **비교 기준 확정 2026-08-18**) ----
    // 비교 기준은 **오직 시대(AGES 인덱스)** 다 — rarity(일반/희귀한/서사시…)·레벨·전투력은 전부 무시.
    //   사용자 확정: "장비는 AGE 가 등급이고, 일반/서사시 이런 건 펫·탈것·스킬의 등급이다.
    //   장비는 그런 등급(rarity)을 안 쓰니 폐기해야 한다." → 그래서 이 경고 경로에서 rarity 는
    //   판정에서도 표시에서도 완전히 빠졌다(`rarityRank`·`rarityChip` 폐기). 되살리지 말 것.
    // 파는 장비의 시대가 그 부위에 남을 장비보다 **strictly 최신일 때만** 물어본다.
    //   같은 시대면 무경고(원시적 신화↔원시적 일반처럼 rarity·레벨이 달라도 시대만 같으면 안 뜬다),
    //   이전 시대면 무경고(중세의를 끼고 원시적을 파는 건 물어볼 것도 없다).
    //   [판매] → 새 장비가 팔리고 장착 중인 것이 남는다
    //   [장착] → 새 것을 끼고 **기존 장비는 그냥 사라진다**(판매 아님) — 파는 게 없으니 경고도 없다
    // 빈 부위는 **비교할 시대 자체가 없으므로 경고하지 않는다**(사용자 재확인 — 빈 부위마다 매번
    // 물어보면 잔소리가 된다. 전에는 -1로 쳐서 항상 물어봤다).
    // 자동 제련(main.js)의 자동 판매는 사용자가 건 필터가 이미 걸러낸 결과라 경고 대상이 아니다.
    //
    // ⚠️ 이 항목은 두 번 열렸고, 두 번째에 **기준 자체가 틀렸다**는 게 밝혀졌다.
    // 1차('같은 등급인데도 경고가 뜬다', 2026-08-18): 실게임 60회 재현
    // (`tools/probe-sell-warning-repro.js`)에서 rarity 오판정 0건 → '판정이 아니라 표시' 문제로 보고
    // 경고 팝업에 rarity 칩 두 개를 나란히 붙였다.
    // 2차(사용자 재지적, 같은 날): "원시 장착하고 중세의 팔려고 하면 경고 안 뜨더라 / 여전히
    // 희귀한·일반 중에 비교하게 돼 있다" → **1차 진단이 절반만 맞았다.** 표시도 문제였지만 진짜
    // 원인은 **장비에 rarity 라는 축을 쓴 것 자체**였다. 사용자에게 장비의 등급은 시대다:
    // 원시적 신화보다 중세의 일반이 세다(시대 배수). rarity 로 재면 '더 좋은 걸 파는' 순간을
    // 정확히 놓친다 — 위 사용자 예시(원시적 장착 + 중세의 판매)가 바로 그 구멍이었다.
    // → 판정·표시 둘 다 시대로 옮겼다. 칩은 시대색(`ageHex`) 필을 쓰고, 카드가 이미
    //   `[시대] 이름`으로 쓰던 대괄호는 칩과 겹치므로 이 팝업의 이름줄에서는 뺀다.
    ageRank(item) { return item ? AGES.indexOf(item.age) : -1; },
    sellWarning(mode) {
        if (mode === 'equip') return null; // 장착은 아무것도 팔지 않는다
        const item = this._pendingItem;
        if (!item) return null;
        const kept = S.equipment[item.slot];
        if (!kept) return null; // 빈 부위 — 비교 대상이 없다
        if (this.ageRank(item) <= this.ageRank(kept)) return null;
        return { sold: item, kept };
    },
    resolveCraft(mode) {
        const warn = this.sellWarning(mode);
        if (warn) { this._pendingCraftMode = mode; this.showSellConfirm(warn); return; }
        this.doResolveCraft(mode);
    },
    // kept는 항상 있다 — sellWarning이 '남을 장비보다 시대가 최신일 때'만 이걸 부르기 때문
    //
    // 이 팝업은 **왜 경고가 떴는지를 그 자리에서 증명하는 화면**이다(사용자 재지적 2026-08-18).
    // 파는 것 / 남는 것을 같은 형식의 **시대 칩**으로 나란히 놓고 몇 시대 차이인지까지 적는다 —
    // 양쪽을 눈으로 견줄 수 있어야 '같은 등급인데 왜 뜨냐'가 성립하지 않는다.
    // 칩 색은 다른 시대 표기(확률 정보·자동 제련 막대)와 같은 `ageHex` 를 쓰되, 흰 종이 카드 위
    // 명암비 4.5:1은 `chipFill` 이 맞춘다 — 원시적(#e0e0e0)처럼 종이와 거의 같은 색이 있어서
    // 색을 그대로 글자에 쓰면 백지 위 백지가 된다(QA 11차에 rarity 칩이 겪은 함정 그대로다).
    ageChipVars(age) {
        const p = this.chipFill(this.ageHex(age));
        return `--cb:${p.bg};--cf:${p.fg}`;
    },
    ageChip(age) {
        return `<span class="swc-age" style="${this.ageChipVars(age)}">${AGE_KR[age]}</span>`;
    },
    // 시대는 바로 위 칩이 이미 말하고 있다 — 카드의 `[시대] 이름` 중 대괄호를 여기서 되풀이하지 않는다
    itemLabel(it) { return it.name; },
    showSellConfirm({ sold, kept }) {
        const gap = this.ageRank(sold) - this.ageRank(kept);
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper sellwarn-card">
                    <h3 class="sellwarn-title">정말 판매할까요?</h3>
                    <div class="sellwarn-cmp">
                        <div class="swc-col">
                            <span class="swc-tag sell">파는 것</span>
                            ${this.ageChip(sold.age)}
                            <span class="swc-name">${this.itemLabel(sold)}</span>
                        </div>
                        <span class="swc-gt">&gt;</span>
                        <div class="swc-col">
                            <span class="swc-tag">남는 것</span>
                            ${this.ageChip(kept.age)}
                            <span class="swc-name">${this.itemLabel(kept)}</span>
                        </div>
                    </div>
                    <p class="sellwarn-note">파는 쪽이 <b>${gap}시대</b> 더 최신입니다.<br>같거나 이전 시대면 이 창은 뜨지 않습니다.</p>
                    <div class="row">
                        <button class="btn sell" onclick="UI.onSellConfirm()">판매<small>${IconGen.img('coin')} +${U.fmt(Forge.sellPrice(sold))}</small></button>
                        <button class="btn" onclick="UI.onSellCancel()">취소</button>
                    </div>
                </div>
            </div>`;
        this.showModal(this.els.detailModal);
    },
    onSellConfirm() { this.closeDetail(); this.doResolveCraft(this._pendingCraftMode); },
    onSellCancel() { this.closeDetail(); }, // 비교 팝업은 그대로 열려 있어 다시 고를 수 있다
    doResolveCraft(mode) {
        const item = this.clearPendingCraft();
        this._pendingCraftMode = null;
        // 팝업이 닫히는 경로는 **[판매]와 딤 클릭 둘뿐**이다 (사용자 지시 2026-08-18).
        // [장착]은 팝업을 닫는 대신 **두 카드를 맞바꾼다**: 방금 장착한 것이 위(장착됨)로 가고,
        // 그때까지 끼고 있던 옛 장비가 아래로 내려와 **새 대기품**이 된다. 판매 버튼이 그대로
        // 살아 있으니 내려온 옛 장비를 그 자리에서 팔거나, [장착]을 다시 눌러 되돌릴 수 있다
        // (사용자 지시 2026-08-18 "새거 장착했다가 예전꺼 장착했다가 판매할 수 있게").
        // 예외는 **하나뿐** — 빈 부위라 내려올 옛 장비가 없으면 스왑할 게 없으니 닫는다.
        // ⚠️ 종전에는 자동 제련 시퀀스 중일 때도 예외였다(`!auto`): '선택 = 다음 제작으로 진행'이
        //    사양이라 닫고 넘어갔고, 이 경로의 옛 장비는 그대로 **소멸**했다. 그 강제 연쇄를 없앤다
        //    (사용자 지시 2026-08-20 autoforge-cards-at-once ⑵ — "[장착]을 누르면 곧바로 다음 장비
        //     비교팝업으로 넘어간다, 이 강제 연쇄를 고칠 것"). 자동도 수동과 같은 결이 된다:
        //    두 카드가 맞바뀌고 내려온 옛 장비를 그 자리에서 팔거나 되장착할 수 있다.
        // 🔑 옛 주석이 걱정하던 '스왑을 반복하면 시퀀스가 안 나간다'는 이제 결함이 아니라 **사양**이다.
        //    보류 더미 스펙(같은 항목 ⑴)이 "슬롯을 눌러 사용자가 하나씩 골라 처리"로 확정됐으므로,
        //    시퀀스는 이 팝업 앞에서 **기다리는 게 맞다**. 아래 `autoSeqStep()` 은 대기품이 있고 팝업이
        //    떠 있으면 그 앞에서 return 하므로(ui.js `autoSeqStep` ①) 저절로 그렇게 된다. 막다른 골목도
        //    아니다 — 팝업이 닫히는 경로([판매]·딤 클릭)가 각각 큐를 이어 열고/전체 보류로 빠져나간다.
        const prev = (item && mode === 'equip') ? S.equipment[item.slot] : null;
        const swapBack = mode === 'equip' && !!prev;
        if (!swapBack) this.els.craftModal.classList.add('hidden');
        if (!item) return;
        // 교체 연출(`equip-swap-throwout`)은 **렌더가 칸을 갈아끼우기 전에** 옛 타일을 붙잡아야 한다.
        // 빈 부위에 처음 끼우는 건 '교체'가 아니라 던져 낼 옛 장비가 없으니 연출도 없다.
        const swapFx = (mode === 'equip' && prev) ? this.grabEquipSwapFx(item.slot) : null;
        if (mode === 'equip') Forge.equip(item);
        else this.coinBurst(Forge.sell(item));
        this.renderTopBar();
        this.renderEquipSheet();
        this.playEquipSwapFx(swapFx);
        if (swapBack) {
            prev._swapped = true;
            this.setPendingCraft(prev);   // saveGame 포함 — 스왑 도중 새로고침해도 옛 장비가 안 사라진다
            this.showCraftModal(prev);    // 위=지금 장착된 새 것, 아래=내려온 옛 것
        } else {
            saveGame();
        }
        this.autoSeqStep();   // 자동 시퀀스가 이 선택을 기다리고 있었다면 다음 단계(카드/큐)로
        // 시퀀스가 이미 끝났어도 큐에 남은 통과분(새로고침 복원분 포함)은 마저 팝업으로 처리한다
        if (!this._autoSeq) this.openNextAutoMatch();
    },

    // ---- 펫 패널 ----
    renderPets() {
        if (this.activeTab !== 'summon' || this._summonSub !== 'pets') return;
        const p = this.els.petsPanel;
        const slots = Pets.maxHatchSlots();

        // 부화장(원본 최하단 어두운 패널): 슬롯 3개 + [슬롯+1 💎N]
        const hatchHtml = Array.from({ length: slots }, (_, i) => {
            const h = S.hatching[i];
            if (!h) return `<div class="hatch-cell empty"><span class="hatch-lamp"></span><span class="hatch-cone dim"></span><span class="hatch-hint">빈 슬롯</span></div>`;
            return `<div class="hatch-cell" style="--rc:${RARITY_CSS[h.rarity]}">
                <span class="hatch-lamp"></span><span class="hatch-cone"></span>
                <span class="hatch-egg">${IconGen.img('egg', null, { tint: RARITY_CSS[h.rarity] })}</span>
                <span class="hatch-time" id="hatch-t-${i}">${U.fmtTime((h.endsAt - U.now()) / 1000)}</span>
                <button class="btn xs" onclick="UI.onHatchSkip(${i})">${IconGen.img('gem')} ${Pets.gemSkipCost(h)}</button>
            </div>`;
        }).join('');

        // 그리드: 보유 펫(장착됨 리본·Lv·별) 뒤에 미부화 알 — 원본은 한 그리드에 섞여 표시
        const petCells = S.pets.map((pet, i) => {
            const active = S.activePets.includes(i);
            return `<button class="pet-tile" style="--rc:${RARITY_CSS[pet.rarity]}" onclick="UI.openPetDetail(${i})">
                <span class="tile-face">
                    ${UI.petFace(pet.name, 'mt-inline', pet.stars)}
                    ${active ? '<span class="sk-ribbon">장착됨</span>' : ''}
                    <span class="sk-lv">Lv.${pet.level}</span>
                </span>
                ${pet.stars ? `<span class="sk-star">${IconGen.img('star')}${pet.stars}</span>` : ''}
            </button>`;
        }).join('');
        const eggCells = S.eggs.map((egg, i) =>
            `<button class="pet-tile egg" style="--rc:${RARITY_CSS[egg.rarity]}" onclick="UI.openEggDetail(${i})" title="${RARITY_KR[egg.rarity]} 알">
                <span class="tile-face">${IconGen.img('egg', null, { tint: RARITY_CSS[egg.rarity] })}</span>
                <span class="tile-label">알</span>
            </button>`).join('');
        const gridHtml = (petCells + eggCells) || '<span class="muted grid-empty">보유 펫·알 없음 — 소환해보세요!</span>';

        const equippedRowHtml = S.activePets.map(i => {
            const pet = S.pets[i];
            if (!pet) return '';
            return `<button class="sk-mini square" style="--rc:${RARITY_CSS[pet.rarity]}" title="${PET_KR[pet.name] || pet.name} — 상세/해제" onclick="UI.openPetDetail(${i})">${UI.petFace(pet.name, 'mt-inline', pet.stars)}<small>Lv.${pet.level}</small></button>`;
        }).join('') || '<span class="muted">없음</span>';

        const mergeHtml = RARITIES.slice(0, -1).map(r => Pets.canMerge(r) ?
            `<button class="btn xs" onclick="UI.onMerge('${r}')">${RARITY_KR[r]} 3 → ${RARITY_KR[RARITIES[RARITIES.indexOf(r) + 1]]} 알</button>` : '').join('');

        const petLvl = Pets.summonLevel(), petCapped = petLvl >= 100;
        const petSummonN = this.summonMult('pet');

        p.innerHTML = `
            <div class="sheet-head">
                <span class="cur-pill egg" title="깨진 알 — 펫 소환 화폐">${IconGen.img('eggCracked')} ${U.fmt(S.eggCurrency || 0)}</span>
                <h2 class="sheet-title">펫 ${S.pets.length}/${Pets.INV_CAP}</h2>
                <span class="cur-pill gem">${IconGen.img('gem')} ${U.fmt(S.gems)}</span>
            </div>
            <div class="grid-scroll"><div class="sk-grid">${gridHtml}</div>
            ${mergeHtml ? `<div class="row center wrap">${mergeHtml}</div>` : ''}</div>
            <div class="equipped-row">
                <span class="equipped-label">장착됨</span>
                <div class="equipped-icons">${equippedRowHtml}</div>
            </div>
            <div class="summon-bar">
                <button class="btn xs x5-toggle ${petSummonN > 1 ? 'on' : ''}" onclick="UI.cycleSummonMult('pet')">x${petSummonN}</button>
                ${Ascension.ready('pet')
                    ? `<button class="btn big summon-btn ascend-ready" onclick="UI.openAscension('pet')">${IconGen.img('star')} 승천 가능<small class="summon-cost">소환 Lv.MAX</small></button>`
                    : this.summonFull('pet')
                    ? this.summonFullBtnHTML('pet', 'UI.onSummonPetEgg()')
                    : `<button class="btn big summon-btn ${Pets.canSummon(petSummonN) ? '' : 'disabled'}" onclick="UI.onSummonPetEgg()">
                    소환 x${Pets.summonCount(petSummonN)}<small class="summon-cost">${IconGen.img('eggCracked')} <b>${Pets.summonCost(petSummonN)}</b></small></button>`}
                <div class="summon-info">
                    <button class="info-dot" onclick="UI.openSummonRates('pet')">i</button>
                    <b>Lv. ${petLvl}</b>
                    <span class="summon-gauge"><i style="width:${(petCapped ? 1 : ((S.petSummonCount || 0) % 5) / 5) * 100}%"></i><em>${petCapped ? 'MAX' : `${(S.petSummonCount || 0) % 5}/5`}</em></span>
                </div>
            </div>
            <div class="hatchery">
                <button class="btn danger round back-btn hatch-back" onclick="UI.switchTab(null)">${IconGen.img("tri_left")}</button>
                <div class="hatch-row">${hatchHtml}</div>
                ${Pets.canBuySlot() ? `<div class="slot-buy-wrap">
                    <span class="slot-buy-label">슬롯 +1</span>
                    <button class="btn xs slot-buy" onclick="UI.onBuyHatchSlot()">${IconGen.img('gem')}<b>${Pets.slotCost()}</b></button>
                </div>` : ''}
            </div>`;
        this.hydrateMountThumbs();   // 펫 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
    },

    // 펫 상세 팝업 (UI-SPEC 54번): 고정 피해/체력 + 옵션 2줄 + [업그레이드][장착·해제]
    openPetDetail(i) {
        const pet = S.pets[i];
        if (!pet) return;
        const active = S.activePets.includes(i);
        const pw = Pets.petPower(pet);
        const maxed = pet.level >= Pets.MAX_LEVEL;
        const subsHtml = (pet.subs || []).map(s => U.subText(s)).join('<br>');
        // 원본(shot-042449): 좌측 등급색 타일(장착됨 리본+Lv뱃지+별) + 우측 등급색 이름·굵은 스탯 2줄·옵션 플레인 텍스트,
        // 우상단 파란 클립보드(공유 더미), 하단 대형 [업그레이드(파랑)][제거(빨강)/장착(파랑)] 2분할, 닫기=빨간 X
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap petd-wrap">
                <div class="modal-card paper petd-card">
                    <button class="petd-share" onclick="UI.toast('📋 공유는 데모 버전에서 지원하지 않습니다')">${IconGen.img('clipboard')}</button>
                    <div class="petd-head">
                        <div class="petd-tilecol">
                            <div class="petd-tile" style="--rc:${RARITY_CSS[pet.rarity]}">
                                ${UI.petFace(pet.name, 'mt-inline', pet.stars)}
                                ${active ? '<span class="sk-ribbon">장착됨</span>' : ''}
                                <span class="sk-lv">Lv.${pet.level}</span>
                            </div>
                            ${pet.stars ? `<span class="sk-star">${IconGen.img('star')}${pet.stars}</span>` : ''}
                        </div>
                        <div class="petd-body">
                            <!-- 원본(042449)의 이름 줄은 등급 **원색** + 검정 키라인이다(css .petd-wrap .petd-name).
                                 inkRarity() 는 흰 바탕 대비 4.5:1 을 맞추려 색을 어둡게 깎는데, 키라인이 그 역할을
                                 대신하므로 여기서는 원색을 그대로 쓴다 — 깎으면 궁극 #ff1c1c 가 #b31414 로 죽는다.
                                 알·탈것 상세(같은 .petd-name)는 .petd-wrap 밖이라 종전대로 inkRarity 를 쓴다.
                                 ⚠️ 이 주석은 템플릿 리터럴 안이다 — 백틱을 쓰면 리터럴이 거기서 끊긴다(실제로 밟았다). -->
                            <div class="petd-name" style="color:${RARITY_CSS[pet.rarity]}">[${RARITY_KR[pet.rarity]}] ${PET_KR[pet.name] || pet.name}</div>
                            <div class="petd-stats">${U.fmt(pw.atk)} 피해<br>${U.fmt(pw.hp)} 체력</div>
                            <div class="petd-subs">${subsHtml || '옵션 없음'}</div>
                        </div>
                    </div>
                    <div class="petd-btns">
                        ${maxed
                            ? `<button class="btn primary petd-btn disabled">업그레이드<small>Lv.${Pets.MAX_LEVEL} 만렙</small></button>`
                            : `<button class="btn primary petd-btn" onclick="UI.closeDetail(); UI.openPetUpgrade(${i})">업그레이드</button>`}
                        ${active || Pets.canActivate(i)
                            ? `<button class="btn petd-btn ${active ? 'danger' : 'primary'}" onclick="UI.onTogglePet(${i}); UI.openPetDetail(${i})">${active ? '제거' : '장착'}</button>`
                            : `<button class="btn petd-btn disabled" onclick="UI.onTogglePet(${i})">장착<small>${Pets.MAX_ACTIVE}마리 출전 중</small></button>`}
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">${IconGen.img('xmark')}</button>
            </div>`;
        this.showModal(this.els.detailModal);
        this.hydrateMountThumbs();   // 펫 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
    },

    onSummonPetEgg() {
        const count = this.summonMult('pet');
        const r = Pets.summon(count);
        if (!r) { this.toast(Pets.eggSpace() < 1 ? `🥚 알 보관함이 가득 찼습니다 (${S.eggs.length}/${Pets.EGG_CAP})` : '🥚 깨진 알이 부족합니다 (펫 던전에서 획득)'); return; }
        // 보관함 여유가 배수보다 적어 줄어든 경우엔 몇 개만 나갔는지 알려준다(버튼이 죽지는 않는다)
        if (r.clamped) this.toast(`🥚 보관함 여유만큼 ${r.summoned}개만 소환했습니다 (${S.eggs.length}/${Pets.EGG_CAP})`);
        this.renderPets();
        this._srRepeat = () => this.onSummonPetEgg(); // x1 [다시 소환]
        this.openSummonResult('pet', r.results); // 결과는 토스트 대신 전용 연출 팝업으로 보여준다
    },

    // 알 상세 팝업 — 클릭 즉시 부화 금지(사용자 지시): 펫 상세와 같은 패턴, [부화] 버튼으로만 부화 시작
    openEggDetail(i) {
        const egg = S.eggs[i];
        if (!egg) return;
        const slotsFull = S.hatching.length >= Pets.maxHatchSlots();
        const hatchSec = Pets.hatchTimeSec(egg.rarity);
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper petd-card">
                    <div class="petd-head">
                        <div class="petd-tilecol">
                            <div class="petd-tile egg" style="--rc:${RARITY_CSS[egg.rarity]}">${IconGen.img('egg', null, { tint: RARITY_CSS[egg.rarity] })}</div>
                        </div>
                        <div class="petd-body">
                            <div class="petd-name" style="color:${UI.inkRarity(RARITY_CSS[egg.rarity])}">[${RARITY_KR[egg.rarity]}] 알</div>
                            <div class="petd-stats">부화 소요 ${U.fmtTime(hatchSec)}</div>
                            <div class="petd-subs">${slotsFull ? `부화 슬롯이 가득 찼습니다 (${Pets.maxHatchSlots()}칸)` : `부화장 ${S.hatching.length}/${Pets.maxHatchSlots()} 사용 중`}</div>
                        </div>
                    </div>
                    <div class="petd-btns">
                        <button class="btn primary petd-btn ${slotsFull ? 'disabled' : ''}" onclick="UI.onStartHatch(${i})">부화</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">${IconGen.img('xmark')}</button>
            </div>`;
        this.showModal(this.els.detailModal);
    },
    onStartHatch(i) {
        if (!Pets.startHatch(i)) { this.toast(`부화 슬롯이 가득 찼습니다 (${Pets.maxHatchSlots()}칸)`); return; }
        this.closeDetail();
        this.renderPets(); this.renderEquipSheet();
    },
    onHatchSkip(i) {
        if (!Pets.gemSkip(i)) this.toast('💎 젬이 부족합니다');
        this.renderPets(); this.renderTopBar(); this.renderEquipSheet();
    },
    onBuyHatchSlot() {
        if (!Pets.buySlot()) { this.toast('💎 젬이 부족합니다'); return; }
        this.toast(`🥚 부화 슬롯 확장! (${Pets.maxHatchSlots()}칸)`);
        this.renderPets(); this.renderTopBar();
    },
    onTogglePet(i) {
        // 출전은 3마리까지(사용자 지시 2026-08-18 `pet-equip-max3`) — 보유는 무제한이라 목록에는 더 있다.
        // 상한과 '그런 펫이 없다'는 안내 문구가 달라야 하므로 부르기 전에 `canActivate` 로 갈라 본다.
        if (!Pets.canActivate(i) && S.pets[i]) {
            this.toast(`🐾 펫은 ${Pets.MAX_ACTIVE}마리까지 출전할 수 있습니다 — 한 마리를 먼저 제거하세요`);
            return;
        }
        if (!Pets.toggleActive(i)) this.toast('해당 펫을 찾을 수 없습니다');
        this.renderPets();
    },
    onMerge(r) { Pets.merge(r); this.renderPets(); },
    // ---- 펫 업그레이드 팝업 (경험치 흡수형, UI-SPEC 9·12·13번) ----
    _petUpgradeTarget: null, _petUpgradeMats: null,
    // 🚨 **`render*` 의 가드가 닫은 팝업을 다음 줄에서 도로 열면 안 된다** (upgrade-modal-empty-guard,
    //    2026-08-20 QA 실측). `renderPetUpgrade` 는 대상이 없으면 이미 `closePetUpgrade()` 로 닫는데,
    //    종전 `open*` 이 그 뒤에서 **무조건** `showModal` 을 불러 `innerHTML` 이 빈 모달이 다시 떴다.
    //    빈 모달은 `rgba(0,0,0,.5)` 딤으로 화면을 덮고 **닫기 버튼이 없다**(내용이 비었으니) — 펫 쪽은
    //    `z-index:40` 이라 탭바(z 30)까지 덮어 딤·중앙·구석·ESC·탭바 클릭이 전부 막히고 **새로고침
    //    말고는 빠져나갈 수 없었다.** 그래서 `render*` 가 성공 여부를 돌려주고, **성공했을 때만** 연다.
    openPetUpgrade(idx) {
        this._petUpgradeTarget = idx;
        this._petUpgradeMats = { pets: [], eggs: [] };
        if (!this.renderPetUpgrade()) { this.toast('업그레이드할 펫이 없습니다'); return; }
        this.showModal(this.els.petUpgradeModal);
    },
    closePetUpgrade() { this.els.petUpgradeModal.classList.add('hidden'); },
    // UI-SPEC 55번(원본 shot-042503) 레이아웃: 대상 카드(장착됨+Lv+⭐+피해/체력) → 경험치 바 →
    // "합칠 펫 선택"+[업그레이드] → 등급별 일괄 선택 버튼 행 → 구분선 → 보유 펫·알 타일 그리드(.pet-tile 재사용, ✓ 체크 선택·무제한)
    // 대상을 못 잡으면 팝업을 닫고 **false** 를 돌려준다 — 호출부가 이걸 보고 열지 말지 정한다
    // (upgrade-modal-empty-guard). 조용히 넘기지 않고 콘솔에도 남긴다.
    renderPetUpgrade() {
        const target = S.pets[this._petUpgradeTarget];
        if (!target) {
            console.warn('renderPetUpgrade: 대상 펫이 없다 — 팝업을 열지 않는다 (idx:', this._petUpgradeTarget, '보유:', S.pets.length, ')');
            this.closePetUpgrade();
            return false;
        }
        const sel = this._petUpgradeMats;
        const need = Pets.xpNeeded(target.level);
        const maxed = target.level >= Pets.MAX_LEVEL;
        const active = S.activePets.includes(this._petUpgradeTarget);
        const pw = Pets.petPower(target);

        // 선택 표시 = 타일 위 ✓ 오버레이 (별도 선택 슬롯 없음, 개수 무제한 — 사용자 지시). 장착 중 펫은 재료 선택 불가 가드.
        const petTiles = S.pets.map((p, i) => {
            if (i === this._petUpgradeTarget) return '';
            const locked = S.activePets.includes(i), on = sel.pets.includes(i);
            return `
            <button class="pet-tile ${on ? 'selected' : ''} ${locked ? 'mat-locked' : ''}" style="--rc:${RARITY_CSS[p.rarity]}" onclick="UI.onToggleUpgradeMat('pet', ${i})">
                <span class="tile-face">
                    ${UI.petFace(p.name, 'mt-inline', p.stars)}
                    ${locked ? '<span class="sk-ribbon">장착됨</span>' : ''}
                    <span class="sk-lv">Lv.${p.level}</span>
                    ${on ? `<span class="tile-check">${IconGen.img('check')}</span>` : ''}
                </span>
            </button>`;
        }).join('');
        const eggTiles = S.eggs.map((e, i) => `
            <button class="pet-tile egg ${sel.eggs.includes(i) ? 'selected' : ''}" style="--rc:${RARITY_CSS[e.rarity]}" onclick="UI.onToggleUpgradeMat('egg', ${i})">
                <span class="tile-face">${IconGen.img('egg', null, { tint: RARITY_CSS[e.rarity] })}${sel.eggs.includes(i) ? `<span class="tile-check">${IconGen.img('check')}</span>` : ''}</span>
                <span class="tile-label">알</span>
            </button>`).join('');
        const tilesHtml = petTiles + eggTiles || '<span class="muted mat-empty">재료로 쓸 펫/알이 없습니다</span>';

        // 슬롯 5칸 행 폐지 → 보유 등급별 일괄 선택 버튼 (알=🥚 실루엣, 펫=🐾 실루엣, 등급색 — 사용자 지시)
        const bulkBtns = RARITIES.map(r => {
            const eggPool = this._matPool('egg', r), petPool = this._matPool('pet', r);
            let h = '';
            if (eggPool.length) {
                const all = eggPool.every(i => sel.eggs.includes(i));
                h += `<button class="petup-bulk ${all ? 'on' : ''}" style="--rc:${RARITY_CSS[r]}" title="${RARITY_KR[r]} 알 전체 ${all ? '해제' : '선택'}" onclick="UI.onBulkSelectMat('egg','${r}')"><span class="bulk-sil">${IconGen.img('egg')}</span><span class="bulk-n">${eggPool.length}</span></button>`;
            }
            if (petPool.length) {
                const all = petPool.every(i => sel.pets.includes(i));
                h += `<button class="petup-bulk ${all ? 'on' : ''}" style="--rc:${RARITY_CSS[r]}" title="${RARITY_KR[r]} 펫 전체 ${all ? '해제' : '선택'}" onclick="UI.onBulkSelectMat('pet','${r}')"><span class="bulk-sil">${IconGen.img('paw')}</span><span class="bulk-n">${petPool.length}</span></button>`;
            }
            return h;
        }).join('');

        const previewXp = sel.pets.reduce((s, i) => s + Pets.xpValue(S.pets[i].rarity) * Pets.levelMult(S.pets[i]), 0)
            + sel.eggs.reduce((s, i) => s + Pets.xpValue(S.eggs[i].rarity), 0);
        const xpRatio = maxed ? 1 : U.clamp((target.xp || 0) / need, 0, 1);

        this.els.petUpgradeModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper petup-card">
                    <div class="petup-panel">
                    <div class="petup-head" style="--rc:${RARITY_CSS[target.rarity]}">
                        <div class="petup-icon">
                            ${UI.petFace(target.name, 'mt-inline', target.stars)}
                            ${active ? '<span class="sk-ribbon">장착됨</span>' : ''}
                            <span class="sk-lv">Lv.${target.level}</span>
                        </div>
                        <div class="idet-title">
                            <div class="idet-name">[${RARITY_KR[target.rarity]}] ${PET_KR[target.name] || target.name}</div>
                            <div class="idet-main">${U.fmt(pw.atk)} 피해<br>${U.fmt(pw.hp)} 체력</div>
                        </div>
                    </div>
                    <div class="petup-xpbar"><div style="width:${xpRatio * 100}%"></div>
                        <span>${maxed ? '만렙' : `${U.fmt(target.xp || 0)}/${U.fmt(need)} 경험치${previewXp ? ` (+${U.fmt(previewXp)})` : ''}`}</span></div>
                    <div class="petup-selrow">
                        <span class="petup-sellabel">합칠 펫 선택</span>
                        <button class="btn silver ${(sel.pets.length + sel.eggs.length) && !maxed ? '' : 'disabled'}" onclick="UI.onConfirmPetUpgrade()">업그레이드</button>
                    </div>
                    </div>
                    <div class="petup-bulkrow">${bulkBtns}</div>
                    <div class="petup-divider"></div>
                    <div class="mat-grid pet-grid">${tilesHtml}</div>
                </div>
                <button class="x-btn" onclick="UI.closePetUpgrade()">${IconGen.img('xmark')}</button>
            </div>`;
        this.hydrateMountThumbs();   // 펫 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
        return true;
    },
    // 등급 r에서 재료로 쓸 수 있는 인덱스 풀 — 펫은 대상·장착 중 제외
    _matPool(type, r) {
        return type === 'egg'
            ? S.eggs.map((e, i) => e.rarity === r ? i : -1).filter(i => i >= 0)
            : S.pets.map((p, i) => (i !== this._petUpgradeTarget && !S.activePets.includes(i) && p.rarity === r) ? i : -1).filter(i => i >= 0);
    },
    onToggleUpgradeMat(type, idx) {
        if (type === 'pet' && S.activePets.includes(idx)) { this.toast('장착 중인 펫은 재료로 쓸 수 없습니다'); return; }
        const sel = this._petUpgradeMats;
        const arr = type === 'pet' ? sel.pets : sel.eggs;
        const pos = arr.indexOf(idx);
        if (pos >= 0) arr.splice(pos, 1);
        else arr.push(idx); // 개수 제한 없음 — 100개든 전부 선택 가능 (사용자 지시)
        this.renderPetUpgrade();
    },
    // 등급별 일괄 선택/해제 — 전부 선택돼 있으면 해제, 아니면 전부 선택
    onBulkSelectMat(type, rarity) {
        const sel = this._petUpgradeMats;
        const arr = type === 'pet' ? sel.pets : sel.eggs;
        const pool = this._matPool(type, rarity);
        if (!pool.length) return;
        if (pool.every(i => arr.includes(i))) pool.forEach(i => arr.splice(arr.indexOf(i), 1));
        else pool.forEach(i => { if (!arr.includes(i)) arr.push(i); });
        this.renderPetUpgrade();
    },
    onConfirmPetUpgrade() {
        const target = S.pets[this._petUpgradeTarget];
        if (target && target.level >= Pets.MAX_LEVEL) { this.toast('만렙입니다 — 승천을 이용하세요'); return; }
        const sel = this._petUpgradeMats;
        const materialPets = sel.pets.map(i => S.pets[i]);
        const materialEggs = sel.eggs.map(i => S.eggs[i]);
        if (!materialPets.length && !materialEggs.length) return;
        if (!Pets.absorbMaterials(target, materialPets, materialEggs)) return;
        this.toast(`✨ ${PET_KR[target.name] || target.name} Lv.${target.level}!`);
        this._petUpgradeTarget = S.pets.indexOf(target);
        this._petUpgradeMats = { pets: [], eggs: [] };
        this.renderPets();
        if (this._petUpgradeTarget >= 0) this.renderPetUpgrade(); else this.closePetUpgrade();
    },

    // ---- 스킬 패널 ----
    renderSkills() {
        if (this.activeTab !== 'summon' || this._summonSub !== 'skills') return;
        const p = this.els.skillsPanel;
        const lvl = Skills.summonLevel();
        const pb = Skills.ownedPassive();
        const skillSummonN = this.summonMult('skill');
        const capped = lvl >= 100;

        // 5열 원형 아이콘 그리드 — 셀 = 원형 아이콘 + Lv 배지 + 별 + 조각 게이지, 장착 시 리본
        const gridHtml = SKILL_DEFS.filter(d => S.skills[d.id]).map(d => {
            const sk = S.skills[d.id];
            const equipped = S.equippedSkills.includes(d.id);
            const maxed = sk.level >= Skills.MAX_LEVEL;
            const need = Skills.shardsRequired(maxed ? Skills.MAX_LEVEL : sk.level);
            const ratio = U.clamp(sk.dupes / need, 0, 1) * 100;
            // 🚨 원본(042340) 스킬 그리드에 장착 표기가 **있다** — 3행 장착 오브 3개: 아트가 강하게
            // 어두워지고 오브 중심에 오브보다 넓은 검정 타원(흰 '장착됨')이 앉는다. 종전 주석
            // "그리드에 장착 표시 없음"(39e865d)은 장착 오브가 없는 **1행만 확대해 보고** 내린
            // 오판이었다(채점 1라운드 ⓔ 지적이 맞았다 — 부분 증거로 전체를 판정하지 말 것).
            return `<button class="sk-cell" onclick="UI.openSkillDetail('${d.id}')">
                <span class="sk-orb ${equipped ? 'equipped' : ''}" style="--rc:${RARITY_CSS[d.rarity]}">
                    ${IconGen.skill(d.id)}
                    ${equipped ? '<span class="sk-eqplate">장착됨</span>' : ''}
                    <span class="sk-lv">Lv.${sk.level}</span>
                </span>
                ${sk.stars ? `<span class="sk-star">${IconGen.img('star')}${sk.stars}</span>` : ''}
                <span class="sk-shard" style="--r:${ratio}%"><i></i><em>${sk.dupes}/${need}</em></span>
            </button>`;
        }).join('') || '<span class="muted grid-empty">보유 스킬 없음 — 소환해보세요!</span>';

        // 원본(UI-SPEC 8·11·14번) 배치: 좌상단 티켓 · 중앙 제목 · 패시브 배너 ·
        // 5열 원형 아이콘 그리드(조각 게이지) · 장착됨 행 · 버튼 2개 · 최하단 소환 버튼
        const equippedRowHtml = S.equippedSkills.map(id => {
            const sk = S.skills[id]; const d = Skills.def(id);
            return `<button class="sk-mini" style="--rc:${RARITY_CSS[d.rarity]}" title="${d.name} — 상세/해제" onclick="UI.openSkillDetail('${id}')">${IconGen.skill(id)}<small>Lv.${sk.level}</small></button>`;
        }).join('') || '<span class="muted">없음</span>';

        p.innerHTML = `
            <div class="sheet-head">
                <span class="cur-pill ticket">${IconGen.img('ticket')} ${U.fmt(S.tickets)}</span>
                <h2 class="sheet-title">스킬 ${Object.keys(S.skills).length}/${SKILL_DEFS.length}</h2>
            </div>
            <div class="passive-banner">+${U.fmt(pb.atk)} 기본 피해 &nbsp; +${U.fmt(pb.hp)} 기본 체력</div>
            <div class="grid-scroll"><div class="sk-grid">${gridHtml}</div></div>
            <div class="equipped-row">
                <span class="equipped-label">장착됨</span>
                <div class="equipped-icons">${equippedRowHtml}</div>
            </div>
            <div class="row center">
                <button class="btn sm primary sk-action-btn" onclick="UI.onUpgradeAllSkills()">모두 업그레이드</button>
                <button class="btn sm primary sk-action-btn" onclick="UI.onQuickEquipSkills()">빠른 장착</button>
            </div>
            <div class="summon-bar">
                <button class="btn danger round back-btn" onclick="UI.switchTab(null)">${IconGen.img("tri_left")}</button>
                <button class="btn xs x5-toggle ${skillSummonN > 1 ? 'on' : ''}" onclick="UI.cycleSummonMult('skill')">x${skillSummonN}</button>
                ${Ascension.ready('skill')
                    ? `<button class="btn big summon-btn ascend-ready" onclick="UI.openAscension('skill')">${IconGen.img('star')} 승천 가능<small class="summon-cost">소환 Lv.MAX</small></button>`
                    : `<button class="btn big summon-btn ${Skills.canSummon(false, skillSummonN) ? '' : 'disabled'}" onclick="UI.onSummon(false)">
                    소환 x${skillSummonN}<small class="summon-cost">${IconGen.img('ticket')} <b>${Skills.ticketCost(skillSummonN)}</b></small></button>`}
                <div class="summon-info">
                    <button class="info-dot" onclick="UI.openSummonRates('skill')">i</button>
                    <b>Lv. ${lvl}</b>
                    <span class="summon-gauge"><i style="width:${(capped ? 1 : ((S.summonCount || 0) % 5) / 5) * 100}%"></i><em>${capped ? 'MAX' : `${(S.summonCount || 0) % 5}/5`}</em></span>
                </div>
            </div>`;
    },

    // 소환 확률 팝업 (UI-SPEC 48번 — 스킬·펫 공용). 원본: ◀▶ 레벨 이동 + 등급별 색 막대 + 진행 게이지
    _ratesKind: 'skill', _ratesLevel: null,
    openSummonRates(kind) {
        this._ratesKind = kind || this._ratesKind;
        this._ratesLevel = null; // 현재 레벨부터
        this.renderSummonRates();
        this.showModal(this.els.detailModal);
    },
    stepSummonRates(d) {
        const isMount = this._ratesKind === 'mount';
        const mod = this._ratesKind === 'pet' ? Pets : isMount ? Mounts : Skills;
        const cur = this._ratesLevel === null ? (isMount ? Mounts.level() : mod.summonLevel()) : this._ratesLevel;
        this._ratesLevel = U.clamp(cur + d, 1, isMount ? Mounts.MAX_LEVEL : 100);
        this.renderSummonRates();
    },
    renderSummonRates() {
        const isPet = this._ratesKind === 'pet', isMount = this._ratesKind === 'mount';
        const mod = isPet ? Pets : isMount ? Mounts : Skills;
        const lvl = this._ratesLevel === null ? (isMount ? Mounts.level() : mod.summonLevel()) : this._ratesLevel;
        let rates;
        if (isMount) { // 탈것 확률표는 분수(0~1) + needed 필드 — %로 환산
            rates = {};
            const row = mountSummonRates[U.clamp(lvl, 1, Mounts.MAX_LEVEL)];
            for (const k in row) if (k !== 'needed') rates[k] = row[k] * 100;
        } else rates = mod.rates(lvl);
        // 별 = **그 라인의 승천 횟수**와 1:1 (사용자 재지적 2026-08-19 `ascend-star-count-fix`:
        // "승천 0회면 별 0개, 1회면 1개, 2회면 2개"). 종전에는 등급 행마다 별을 무조건 한 개씩
        // 그려서 승천을 한 번도 안 해도 별이 보였다 — 원본 소환 확률 팝업(UI-SPEC ⑧)에도 별은 없다.
        // 승천은 라인 단위라 행(등급)마다 다르지 않고 전 행이 같은 개수다(이 팝업이 곧 그 라인의 표).
        // ⚠️ 시대 막대의 ★(확률 정보·장비 목록·자동 제련의 `fi-age-star`/`af-age-star`)는 이것과 **다른
        //    것**이다 — 원본에서 9개 시대는 채운 별, 신성한만 빈 별이라 승천 횟수(라인 공통값)일 수 없다.
        //    그쪽은 원본 대조 프로브(probe-fl-head)가 위치·화소까지 맞춰 둔 원본 디자인 요소라 건드리지 않는다.
        const ascLine = isPet ? 'pet' : isMount ? 'mount' : 'skill';
        const ascN = Ascension.count(ascLine);
        // 6개 이상은 행 폭을 넘기므로 다른 별 표시(cell-star·sk-star)와 같은 '별+숫자' 규약으로 접는다
        const starHtml = ascN <= 0 ? ''
            : ascN <= 5 ? ` <i class="rate-star">${IconGen.img('star').repeat(ascN)}</i>`
                : ` <i class="rate-star">${IconGen.img('star')}${ascN}</i>`;
        // 0% 등급도 표시 — 확률표 열람이 목적이라 안 나오는 등급도 보여야 한다 (사용자 재지시 2026-08-17)
        const barsHtml = RARITIES.map(r => `
            <div class="rate-bar" style="--rc:${RARITY_CSS[r]}">
                <span class="rate-name">${RARITY_KR[r]}${starHtml}</span>
                <span class="rate-pct">${(rates[r] || 0).toFixed(2)}%</span>
            </div>`).join('');
        const cnt = (isMount ? S.mountOpens : isPet ? S.petSummonCount : S.summonCount) || 0;
        const capped = isMount ? Mounts.level() >= Mounts.MAX_LEVEL : mod.summonLevel() >= 100;
        const gaugeHtml = isMount
            ? (() => { const need = Mounts.nextNeeded(), prev = Mounts.prevNeeded();
                return `<div class="rates-prog"><div style="width:${(need ? U.clamp((cnt - prev) / (need - prev), 0, 1) : 1) * 100}%"></div><span>${need ? `${cnt - prev}/${need - prev}` : 'MAX'}</span></div>`; })()
            : `<div class="rates-prog"><div style="width:${(capped ? 1 : (cnt % 5) / 5) * 100}%"></div><span>${capped ? 'MAX' : `${cnt % 5}/5`}</span></div>`;
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap rates-wrap">
                <div class="modal-card paper rates-card">
                    <div class="rates-head">
                        <button class="tri-btn" onclick="UI.stepSummonRates(-1)">${IconGen.img("tri_left", null, TRI_BLUE)}</button>
                        <div><h3>레벨 ${lvl}</h3><div class="rates-sub">소환 확률</div></div>
                        <button class="tri-btn" onclick="UI.stepSummonRates(1)">${IconGen.img("tri_right", null, TRI_BLUE)}</button>
                    </div>
                    <button class="rates-i" onclick="UI.toast('소환 레벨이 오르면 높은 등급 확률이 올라갑니다')">i</button>
                    <div class="rate-list">${barsHtml}</div>
                    <p class="rates-tip">${isMount ? '태엽으로' : isPet ? '깨진 알을' : '티켓을'} 소환하여 레벨 업하고 소환 확률을 높이세요!</p>
                    ${gaugeHtml}
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">${IconGen.img('xmark')}</button>
            </div>`;
    },

    // 스킬 상세 팝업 (UI-SPEC 46번)
    openSkillDetail(id) {
        const d = Skills.def(id), sk = S.skills[id];
        if (!sk) return;
        const equipped = S.equippedSkills.includes(id);
        const maxed = sk.level >= Skills.MAX_LEVEL;
        const need = Skills.shardsRequired(maxed ? Skills.MAX_LEVEL : sk.level);
        const pb = Skills.passiveOf ? Skills.passiveOf(id) : null;
        // 버프 표기도 고정량으로 (buff-redesign-heal-atk-fixed) — %가 아니라 실제 수치와 지속시간을 적는다
        const desc = d.type === 'heal' ? `${d.dur}초 동안 체력을 <b>${U.fmt(Skills.healAmt(id))}</b> 회복합니다.`
            : d.type === 'buff' ? `${d.dur}초 동안 <b>공격력 +${U.fmt(Skills.buffAtk(id))}</b> 버프를 겁니다.`
            : `${d.type === 'aoe' ? '범위 안의 적 전체에게' : '적 하나에게'} 각각 <b>${U.fmt(Skills.dmg(id))}의 피해</b>를 줍니다.`;
        // 원본(shot-042426): 좌상단 원형 오브(Lv뱃지+별+검정 조각 게이지) + 우측 제목·설명,
        // 하단 "패시브:" 라벨+회색 pill, 대형 [업그레이드(실버)][장착(파랑)] 2분할 버튼
        const ratio = U.clamp(sk.dupes / need, 0, 1) * 100;
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap skd-wrap">
                <div class="modal-card paper skd-card">
                    <div class="skd-head">
                        <div class="skd-orbcol">
                            <span class="sk-orb" style="--rc:${RARITY_CSS[d.rarity]}">${IconGen.skill(id)}<span class="sk-lv">Lv.${sk.level}</span></span>
                            ${sk.stars ? `<span class="sk-star">${IconGen.img('star')}${sk.stars}</span>` : ''}
                            <span class="sk-shard" style="--r:${ratio}%"><i></i><em>${sk.dupes}/${need}</em></span>
                        </div>
                        <div class="skd-body">
                            <div class="skd-name">[${RARITY_KR[d.rarity]}] ${d.name}</div>
                            <div class="skd-desc">${desc} <small class="muted">(쿨타임 ${d.cd}초)</small></div>
                        </div>
                    </div>
                    ${pb ? `<div class="skd-passive-label">패시브:</div>
                    <div class="skd-passive">+${U.fmt(pb.atk)} 기본 피해 +${U.fmt(pb.hp)} 기본 체력</div>` : '<div class="skd-passive-label"></div>'}
                    <div class="skd-btns">
                        ${maxed
                            ? `<button class="btn skd-btn silver disabled">업그레이드<small>Lv.${Skills.MAX_LEVEL} 만렙</small></button>`
                            : `<button class="btn skd-btn silver ${Skills.canUpgrade(id) ? '' : 'disabled'}" onclick="UI.onUpgradeSkill('${id}'); UI.openSkillDetail('${id}')">업그레이드</button>`}
                        <button class="btn primary skd-btn" onclick="UI.onToggleSkill('${id}'); UI.openSkillDetail('${id}')">${equipped ? '해제' : '장착'}</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">${IconGen.img('xmark')}</button>
            </div>`;
        this.showModal(this.els.detailModal);
    },
    closeDetail() { this.els.detailModal.classList.add('hidden'); },

    onSummon(useGems) {
        const count = this.summonMult('skill');
        const r = Skills.summon(useGems, count);
        if (!r) { this.toast(useGems ? '💎 젬이 부족합니다' : '🎫 티켓이 부족합니다 (스테이지 클리어로 획득)'); return; }
        this.renderSkills(); this.renderSkillBar(); this.renderTopBar();
        this._srRepeat = () => this.onSummon(useGems); // x1 [다시 소환] — 같은 비용 경로로 반복
        this.openSummonResult('skill', r.results); // 결과는 토스트 대신 전용 연출 팝업으로 보여준다
    },
    onUpgradeSkill(id) {
        if (!Skills.upgrade(id)) { this.toast('🧩 조각이 부족합니다'); return; }
        const d = Skills.def(id);
        this.toast(`⬆️ ${d.name} Lv.${S.skills[id].level}!`);
        this.renderSkills(); this.renderTopBar();
    },
    onUpgradeAllSkills() {
        const n = Skills.upgradeAll();
        this.toast(n ? `⬆️ ${n}회 업그레이드 완료` : '🧩 업그레이드 가능한 스킬이 없습니다');
        this.renderSkills(); this.renderTopBar();
    },
    onQuickEquipSkills() {
        Skills.quickEquip();
        this.toast('⚡ 최고 등급·레벨 스킬로 장착했습니다');
        this.renderSkills(); this.renderSkillBar();
    },
    onToggleSkill(id) {
        if (!Skills.toggleEquip(id)) this.toast(`스킬은 최대 ${Skills.MAX_ACTIVE}개 장착 가능합니다`);
        this.renderSkills();
    },

    // ---- '방' 탭 잔재 ----
    // 하단 탭 '방'(panel-menu)은 사용자 지시(2026-08-18)로 삭제됐다. Combat이 전투력 갱신 때마다
    // 이 함수를 부르므로(combat.js — 3D 스트림 소유 파일이라 호출부는 건드리지 않는다) 이름만 남긴다.
    // 그 시트가 갖고 있던 것들의 새 위치: 정보=플레이어 정보 팝업(!) · 기술 트리=소환 서브탭 ·
    // 마운트=장비 시트 탈것 칸 · 승천=대장간 정보 팝업 · 진행 패스=맵 이정표 ·
    // 효과음/수동 저장/초기화=프로필 ▸ 설정.
    renderMenu() {},

    // 던전 행 제목 왼쪽의 **보상 재화** 아이콘 (사용자 지시 2026-08-19 `dungeon-row-quality`:
    // "제목 왼쪽엔 재화 뭐 주는지 그려져 있어야 — 해머도둑 왼쪽엔 해머, 유령마을 왼쪽은 스킬 티켓").
    // `DEFS[].reward` 는 사람이 읽는 한국어 문장('깨진 알 (펫 소환용)')이라 문자열 파싱으로 아이콘을
    // 고르면 문구만 다듬어도 조용히 깨진다 → id 로 못박는다. 매핑을 dungeons.js 가 아니라 여기 두는 건
    // 그 파일이 던전 규칙(해금·보상·열쇠) 소유라 화면 표현만 바꾸자고 건드릴 이유가 없어서다.
    // 값은 **배열**이다 — 해머 도둑의 보상이 '해머 · 코인' 둘이라 하나만 그리면 지시의 절반이 빠진다
    // (비평가 A 지적). 여러 개면 동전처럼 겹쳐 쌓는다(`.dg-rw .dg-rw-ico + .dg-rw-ico`).
    DG_REWARD_ICON: { hammer: ['hammer', 'coin'], ghost: ['ticket'], invasion: ['eggCracked'], zombie: ['potion'] },
    dgRewardIcon(d) {
        const names = this.DG_REWARD_ICON[d.id];
        if (!names || typeof IconGen === 'undefined') return '';
        const html = names.filter(n => IconGen.url(n)).map(n => IconGen.img(n, 'dg-rw-ico')).join('');
        return html ? `<span class="dg-rw">${html}</span>` : '';
    },
    // 던전 얼굴(🔨👻🥚🧟 대신 IconGen 아이콘). **던전 목록 행에서는 안 쓴다** — 같은 지시의
    // "기존 덩어리 같이 생긴 아이콘은 없애기"로 행에서만 뺐고, 상세 헤더·클리어 팝업·확률 칩처럼
    // 그 던전을 한 글자로 가리켜야 하는 자리에는 그대로 필요하다. 없는 id 는 원래 이모지로 떨어진다.
    DG_ICON: { hammer: 'hammer', ghost: 'ghost', invasion: 'egg', zombie: 'zombie' },
    dgIcon(d) {
        const name = this.DG_ICON[d.id];
        return name && typeof IconGen !== 'undefined' && IconGen.url(name) ? IconGen.img(name) : d.icon;
    },
    // 배너 배경 일러스트 — 원본(shot-042251)의 배너는 한 장 그림이라 갈색 그라디언트로는 재현이 안 된다.
    // IconGen 이 던전마다 캔버스 배경(하늘·지형·소품)을 굽고, 주인공은 위 dgIcon 이 그대로 얹는다.
    // 없는 던전 id 는 클래스가 비어 종전 그라디언트로 떨어진다.
    DG_SCENE: { hammer: 'dg_hammer', ghost: 'dg_ghost', invasion: 'dg_invasion', zombie: 'dg_zombie' },
    // 던전 목록 행별 열쇠 색(원본 shot-042251 확대 실측: 해머=은회 · 유령=초록 · 침략=주황 · 좀비=빨강).
    // 상세 팝업 등 다른 자리의 열쇠는 기본 'key'(은회) 그대로다 — 그쪽 원본(shot-042304)이 은회색이다.
    DG_KEY_ICON: { hammer: 'key', ghost: 'key_green', invasion: 'key_orange', zombie: 'key_red' },
    dgSceneCls(d) {
        const name = this.DG_SCENE[d.id];
        return name && typeof IconGen !== 'undefined' ? (IconGen.cls(name) || '') : '';
    },
    // 상세 팝업 히어로의 아이콘 — **그림이 붙는 던전은 아이콘을 얹지 않는다.**
    // 2026-08-19: 배너 일러스트가 주인공(쥔 망치·좀비 등)을 직접 그리는 쪽으로 바뀌었다
    // (dungeon-row-quality 세션). 그래서 목록 행은 `.dg-icon` 을 이미 뺐는데, 상세 팝업이
    // 그대로 얹고 있으면 **같은 물건이 그림 안에 하나 + 아이콘으로 하나** 겹쳐 두 개가 된다.
    // 그림이 없는 던전 id 는 배경이 종전 그라디언트로 떨어지므로 그때만 아이콘을 남긴다.
    dgHeroIcon(d) {
        return this.dgSceneCls(d) ? '' : `<span class="dg-icon">${this.dgIcon(d)}</span>`;
    },

    // ---- 던전: 가로 배너 목록 + 상세(난이도 선택) 팝업 (UI-SPEC 6~7번) ----
    openDungeons() {
        Dungeons.ensure();
        const bannerHtml = Dungeons.DEFS.map(d => {
            const ok = Dungeons.unlocked(d.id);
            const keys = S.dungeons.keys[d.id];
            const hex = '#' + d.theme.sky.toString(16).padStart(6, '0');
            // 원본 배치: 좌상단 이름, 우측에 열쇠 수와 [열기] 버튼을 세로로.
            // 배경 일러스트는 `dgSceneCls(d)`(icon-gen 슬라이스, 원본 shot-042251 대조)가 배너에 직접 깐다.
            // 그 위에 제목 왼쪽 보상 재화 슬롯이 붙고, 가운데 떠 있던 `.dg-icon` 덩어리는 뺐다
            // (사용자 지시 2026-08-19 `dungeon-row-quality`: "기존 덩어리 같이 생긴 아이콘은 없애기").
            // `--bg` 는 일러스트가 아직 안 구워졌을 때의 폴백 그라디언트로 남겨 둔다.
            return `<div class="dg-banner ${ok ? '' : 'locked'} ${this.dgSceneCls(d)}" style="--bg:${hex}">
                <div class="dg-info">
                    <div class="item-name">${this.dgRewardIcon(d)}${d.kr}</div>
                    ${ok ? '' : `<span class="dg-lock">${IconGen.img('lock')} ${d.unlock} 도달 시 해금</span>`}
                </div>
                <div class="dg-right">
                    ${ok ? `<span class="dg-keys">${IconGen.img(this.DG_KEY_ICON[d.id] || 'key')} ${keys}/${Dungeons.MAX_KEYS}</span>` : ''}
                    <button class="btn sm primary ${ok ? '' : 'disabled'}" onclick="UI.openDungeonDetail('${d.id}')">열기</button>
                </div>
            </div>`;
        }).join('');
        // 원본(UI-SPEC 6~7번): 전체화면 흰 페이지 + 가로 배너 4개. 닫기는 탭바의 빨간 X.
        this.els.dungeonModal.innerHTML = `
            <div class="modal-card sheet">
                <h3 class="sheet-title">던전</h3>
                <p class="sheet-sub">던전 열쇠는 매일 09:00에 보충됩니다. 열쇠는 던전을 완료할 때만 소모됩니다</p>
                <div class="dungeon-list">${bannerHtml}</div>
                <button class="league-back-btn sheet-back-btn" onclick="UI.closeDungeons()">${IconGen.img("tri_left")}</button>
            </div>`;
        this.showModal(this.els.dungeonModal);
    },
    closeDungeons() { this.els.dungeonModal.classList.add('hidden'); },

    // ---- 반복 퀘스트 시트 (사용자 지시 2026-08-18 `quest-tab`) ----
    // 던전 시트와 같은 전체화면 흰 페이지 + 세로 목록 패턴이다(새 레이아웃을 만들지 않는다 —
    // 원본에 대응 화면이 없으므로 기존 시트 규약을 그대로 따르는 게 화면 간 일관성에 맞다).
    // **날짜·일차 표기는 넣지 않는다**(사용자 재확인) — "언제 깨도 똑같다"가 사양이라
    // '오늘의 퀘스트'·'남은 시간' 같은 문구가 들어가면 그 자체로 사양 위반이다.
    openQuests() {
        const rows = Quests.list().map((q, i) => {
            const def = Quests.def(q.id);
            const done = Quests.isDone(q);
            const pct = U.clamp(q.prog / q.need, 0, 1) * 100;
            const unit = def.unit === undefined ? '회' : def.unit;
            return `<div class="qst-row ${done ? 'done' : ''}">
                <span class="qst-icon">${IconGen.img(def.icon)}</span>
                <div class="qst-body">
                    <div class="qst-name">${def.text} ${U.fmt(q.need)}${unit}</div>
                    <div class="qst-bar"><i style="width:${pct.toFixed(1)}%"></i><em>${U.fmt(Math.min(q.prog, q.need))}/${U.fmt(q.need)}</em></div>
                </div>
                <div class="qst-right">
                    <span class="qst-reward">${IconGen.img(this.QUEST_CUR_ICON[q.rw.cur] || 'coin')} ${U.fmt(q.rw.amt)}</span>
                    <button class="btn sm ${done ? 'primary' : 'disabled'}" onclick="UI.onClaimQuest(${i}, this)">수령</button>
                </div>
            </div>`;
        }).join('') || '<span class="muted grid-empty">퀘스트를 불러오지 못했습니다</span>';

        // 일괄수령 (사용자 지시 2026-08-18 `quest-claim-all`: "퀘스트 부분에 일괄수령 버튼도 만들라").
        // 목록 **위**에 둔다 — 목록은 스크롤되므로 아래에 두면 완료가 여러 개일 때 버튼이 화면 밖으로
        // 밀려 '일괄'의 의미가 없어진다. 수령 가능이 0개면 눌러도 할 일이 없으니 비활성으로 보여 준다
        // (개별 [수령] 버튼이 이미 쓰는 `.disabled` 규약 그대로다).
        const ready = Quests.readyCount();
        const claimAllBtn = `<div class="qst-allbar">
                <button class="btn sm ${ready ? 'primary' : 'disabled'}" onclick="UI.onClaimAllQuests(this)">일괄수령${ready ? ` (${ready})` : ''}</button>
            </div>`;

        this.els.questModal.innerHTML = `
            <div class="modal-card sheet quest-sheet">
                <h3 class="sheet-title">퀘스트</h3>
                <p class="sheet-sub">모든 퀘스트는 수령해도 같은 내용으로 반복됩니다</p>
                ${claimAllBtn}
                <div class="quest-list">${rows}</div>
                <button class="league-back-btn sheet-back-btn" onclick="UI.closeQuests()">${IconGen.img("tri_left")}</button>
            </div>`;
        this.showModal(this.els.questModal);
    },
    // 보상 재화 → IconGen 아이콘 이름. 재화 이름과 아이콘 이름이 1:1이 아닌 것만 실제 매핑이 필요하다.
    QUEST_CUR_ICON: { coins: 'coin', hammers: 'hammer', gems: 'gem', tickets: 'ticket', winders: 'winder', eggCurrency: 'egg', potions: 'potion' },
    closeQuests() { this.els.questModal.classList.add('hidden'); },
    // 진행도가 오를 때 열려 있는 시트만 갱신한다 — 닫혀 있으면 아무 일도 하지 않는다(Quests.bump가 매 행동마다 부른다)
    refreshQuestsIfOpen() {
        if (!this.els || !this.els.questModal || this.els.questModal.classList.contains('hidden')) return;
        this.keepScroll(() => this.openQuests());
    },
    onClaimQuest(i, btn) {
        const got = Quests.claim(i);
        if (!got) return;
        // 토스트 없음 — '+획득량' 라벨이 같은 정보를 같은 자리에서 말한다. 토스트를 겹치면
        // 연출·행 제목을 다 덮는다(reward-claim-fx 비평가 지적 ①: 같은 정보 두 목소리 금지)
        this.rewardBurst({ [got.cur]: got.amt }, { from: btn });
        this.renderTopBar();
        this.renderEquipSheet();
        this.keepScroll(() => this.openQuests());   // 수령한 자리에 새 퀘스트가 즉시 올라온다
    },
    // 토스트는 **재화별 합계로 한 줄** (항목 ③) — 완료가 5개면 토스트 5개가 쌓이는 게 아니라
    // "📜 3개 수령! 코인 +1,200 · 해머 +16" 한 줄이다.
    onClaimAllQuests(btn) {
        const { n, gains } = Quests.claimAll();
        if (!n) { this.toast('📜 수령할 수 있는 퀘스트가 없습니다'); return; }
        const parts = Object.keys(gains).map(cur => `${Quests.CUR_KR[cur] || cur} +${U.fmt(gains[cur])}`);
        // 🚨 여기만 공통 수령 연출이 빠져 있었다 — 개별 [수령]·던전 소탕·던전 클리어·오프라인
        //    보상·상점 무료칸·패스는 전부 `rewardBurst` 를 타는데 **일괄수령만 토스트 한 줄**이라,
        //    사용자에겐 '퀘스트 수령에 이펙트가 안 뜬다'로 보였다(slug: quest-claim-fx).
        //    ⚠️ 순서가 중요하다 — `rewardBurst` 가 `_toastHoldUntil` 을 세우므로 **먼저** 부를 것.
        //    뒤에 부르면 토스트가 이미 떠서 '+획득량' 라벨과 겹친다(그걸 막으려고 만든 장치다).
        this.rewardBurst(gains, { from: btn });
        this.toast(`📜 ${n}개 수령! ${parts.join(' · ')}`);
        this.renderTopBar();
        this.renderEquipSheet();
        this.keepScroll(() => this.openQuests());
    },

    _dgDetailId: null, _dgDetailStage: 1,
    openDungeonDetail(id) {
        if (!Dungeons.unlocked(id)) { this.toast(`🔒 ${Dungeons.def(id).unlock} 도달 시 해금`); return; }
        this._dgDetailId = id;
        this._dgDetailStage = S.dungeons.best[id] + 1;
        this.renderDungeonDetail();
        this.showModal(this.els.dungeonDetailModal);
    },
    closeDungeonDetail() { this.els.dungeonDetailModal.classList.add('hidden'); },
    onDungeonStageStep(delta) {
        const best = S.dungeons.best[this._dgDetailId];
        this._dgDetailStage = U.clamp(this._dgDetailStage + delta, 1, best + 1);
        this.renderDungeonDetail();
    },
    // 던전 도전 단계 표기 — 원본(shot-042304)의 난이도 블록은 `20-9` 두 수를 하이픈으로 잇는다.
    // ⓐ(던전 자신의 난이도)냐 ⓑ(플레이어 최고 기록 bestChapter-bestStage)냐가 오래 미정이었는데,
    // 원본을 보고 쓴 `ref/UI-SPEC.md` 38번이 이 두 수를 "◀▶ 좌우 화살표로 도전 단계 선택 —
    // 최고클리어+1이 기본, 이하 선택 가능"으로 적어 뒀다 → ⓐ 다(플레이어 기록이면 ◀▶ 로 못 고른다).
    // 우리 모델의 던전 단계는 정수 하나(`best+1`)라 표기할 때만 챕터-스테이지 쌍으로 환산한다.
    // 챕터당 스테이지 10은 이 게임의 기존 규약이다 — combat.js 의 `S.stage >= 10` 에서 챕터가 오르고,
    // pass.js 가 `(bestChapter-1)*10 + bestStage` 로 환산하며, dungeons.js 해금 조건도 `2-10` 꼴이다.
    // ◀▶ 는 그대로 정수 ±1 이라 10 → `1-10`, 11 → `2-1` 로 증감이 앞뒤가 맞고,
    // 입장·보상·소탕에 넘어가는 값은 환산 전 정수 그대로다(표기만 바꾼다).
    dgStageText(n) {
        const s = Math.max(1, Math.floor(n));
        return `${Math.floor((s - 1) / 10) + 1}-${(s - 1) % 10 + 1}`;
    },
    renderDungeonDetail() {
        const id = this._dgDetailId;
        const d = Dungeons.def(id);
        const stage = this._dgDetailStage;
        const best = S.dungeons.best[id];
        const keys = S.dungeons.keys[id];
        const hex = '#' + d.theme.sky.toString(16).padStart(6, '0');
        // 원본(shot-042304): 카드 상단 풀폭 배너(제목 오버레이) + 파란 삼각형 ◀▶ + "난이도/N" 2줄 +
        // 회색 보상 pill + 열쇠 + 실버 대형 버튼 2개, 닫기=빨간 X
        this.els.dungeonDetailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper dgd-card">
                    <div class="dg-detail-hero ${this.dgSceneCls(d)}" style="--bg:${hex}">${this.dgHeroIcon(d)}<span class="dgd-title">${d.kr}</span></div>
                    <div class="dgd-stage-row">
                        <button class="tri-btn" onclick="UI.onDungeonStageStep(-1)" style="visibility:${stage <= 1 ? 'hidden' : 'visible'}">${IconGen.img("tri_left", null, TRI_BLUE)}</button>
                        <div class="dgd-stage"><span>난이도</span><b>${this.dgStageText(stage)}</b></div>
                        <button class="tri-btn" onclick="UI.onDungeonStageStep(1)" style="visibility:${stage >= best + 1 ? 'hidden' : 'visible'}">${IconGen.img("tri_right", null, TRI_BLUE)}</button>
                    </div>
                    <div class="dgd-reward-pill"><span class="dgd-reward-label">보상:</span>${this.iconizeHTML(Dungeons.rewardText(id, stage, '  '))}</div>
                    <div class="dgd-keys">${IconGen.img('key')} ${keys}/${Dungeons.MAX_KEYS}</div>
                    <div class="dgd-btns">
                        <button class="btn silver dgd-btn ${keys > 0 && best >= 1 ? '' : 'disabled'}" onclick="UI.onSweepDungeon('${id}')">이전 스테이지<br>소탕</button>
                        <button class="btn silver dgd-btn ${keys > 0 ? '' : 'disabled'}" onclick="UI.onEnterDungeon('${id}', ${stage})">입장</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeDungeonDetail()">${IconGen.img('xmark')}</button>
            </div>`;
    },
    onEnterDungeon(id, stage) {
        if (Dungeons.enter(id, stage)) { this.closeDungeonDetail(); this.closeDungeons(); this.updateStageLabel(); this.renderTopBar(); }
        else this.renderDungeonDetail(); // 실패 사유 토스트 후 갱신
    },

    // ---- 던전 클리어 보상 팝업 (dungeon-clear-reward-popup, 사용자 지시 2026-08-18) ----
    // 흐름: Combat.stageClear(phase='dungeonClear' 대기) → Dungeons.onClear → 여기(팝업) →
    //       [보상 수령] 클릭 → 공통 수령 연출(rewardBurst) → Combat.finishDungeonClear(본대 복귀).
    // 보상 자체는 onClear가 이미 지급·저장했다 — 팝업 도중 새로고침해도 보상이 안 사라지고,
    // 그 경우 run=null 저장본으로 본대에서 정상 부팅한다(팝업만 안 뜬 채 복귀가 끝난 상태).
    showDungeonClear(def, stage, rewards) {
        const cells = Object.entries(rewards || {}).filter(([, v]) => Math.floor(Number(v) || 0) > 0).map(([k, v]) =>
            `<div class="dgc-cell"><span class="dgc-ico">${this.curIcon(k) || IconGen.img('coin')}</span><span class="dgc-amt">+${U.fmt(v)}</span></div>`
        ).join('');
        this._dgclearRewards = rewards;   // [보상 수령] 클릭 시 rewardBurst 에 넘길 지급 목록
        this._dgclearBusy = false;
        this.els.dungeonClearModal.classList.remove('dgclear-out'); // 직전 판 수령 연출의 딤 페이드 잔상 제거
        this.els.dungeonClearModal.innerHTML = `
            <div class="modal-card dgclear-card">
                <div class="dgclear-title">클리어!</div>
                <div class="dgclear-sub">${this.dgIcon(def)} ${U.escapeHtml(def.kr)} ${stage}단계</div>
                <div class="dgclear-rewards">${cells}</div>
                <button class="btn primary dgclear-btn" onclick="UI.onDungeonClearConfirm()">보상 수령</button>
            </div>`;
        this.showModal(this.els.dungeonClearModal);
        SFX.levelUp(); // 클리어 팬페어
    },
    onDungeonClearConfirm() {
        if (this._dgclearBusy) return; // 연출 중 재클릭 방지 — finishDungeonClear가 두 번 불리면 안 된다
        this._dgclearBusy = true;
        const modal = this.els.dungeonClearModal;
        const card = modal.querySelector('.dgclear-card');
        // 수령 연출 = 공통 rewardBurst(reward-claim-fx) 한 벌 — 버튼에서 터져 상단 재화 바로 흡수된다.
        // 수령 차임도 rewardBurst 가 울린다(여기서 또 울리면 이중 재생). #reward-burst 레이어는 모달
        // 밖(#app 직속)이라 아래에서 팝업을 닫고 씬이 본대로 컷돼도 흡수 잔여 연출이 자연스럽게 이어진다.
        this.rewardBurst(this._dgclearRewards, { from: modal.querySelector('.dgclear-btn') || card });
        if (card) card.classList.add('leaving'); // 카드는 한 박자 뒤 가라앉는다 (CSS 딜레이)
        modal.classList.add('dgclear-out');      // 딤도 함께 걷힌다 — 복귀할 화면이 미리 비치게
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('dgclear-out');
            this._dgclearBusy = false;
            Combat.finishDungeonClear();
        }, 700); // 카드 침강(딜레이 .12s + .45s)이 끝난 직후 — 연출을 다 기다리면 복귀가 굼떠진다
    },
    onSweepDungeon(id) {
        // 소탕 성공 시 열쇠가 줄어드는데, 상세 팝업 뒤에 계속 열려 있는 던전 목록(🔑 개수 표시)도 함께 갱신해야 함
        if (Dungeons.sweep(id)) { this.renderDungeonDetail(); this.keepScroll(() => this.openDungeons()); this.renderTopBar(); }
    },

    // ---- PvP 리그 (UI-SPEC 3~5번, 원본 shot-042149/042208/042228): 랭킹 → 리그 보상 팝업 / 상대 선택 팝업 (봇 기반 오프라인 구현) ----
    leagueRow(e, rank) {
        return `<div class="league-row ${e.isMe ? 'me' : ''}">
            <span class="league-rank">${rank}</span>
            <span class="league-avatar">${IconGen.avatar(e.avatar)}</span>
            <span class="league-name">${U.escapeHtml(e.name)}<br><small>${IconGen.img('power')} ${U.fmt(e.cp)}</small></span>
            <span class="league-score">${IconGen.img('star')} ${U.fmt(e.score)}</span>
            <span class="league-server">${e.server === '나' ? '나' : '서버 ' + e.server}</span>
        </div>`;
    },
    leagueRewardGrid(r) {
        return ['hammers', 'coins', 'tickets', 'eggCurrency', 'potions', 'winders']
            .map(k => `<span>${this.curIcon(k)}${U.fmt(r[k])}</span>`).join('');
    },
    openLeague() {
        League.ensure();
        this.renderLeagueBoard();
        // 리그 **목록**은 원본에서 탭바가 그대로 보이는 탭 화면이다(042149 실측: y=870 이 #0e111b,
        // PVP 탭에 빨간 ✕ 가 밝게 떠 있다). 반면 보상·도전 하위 화면은 탭바까지 딤에 덮인다
        // (042208·042228: #010203). 같은 `#league-modal` 이 세 얼굴을 쓰므로 여기서 갈라 준다.
        this.els.leagueModal.classList.remove('dim-tabbar');
        this.showModal(this.els.leagueModal);
    },
    closeLeague() { this.els.leagueModal.classList.add('hidden'); },
    renderLeagueBoard() {
        const board = League.board();
        const myRank = League.myRank();
        const start = Math.max(0, Math.min(myRank - 4, board.length - 8));
        const windowRows = board.slice(start, start + 8).map((e, i) => this.leagueRow(e, start + i + 1)).join('');
        const me = board.find(e => e.isMe);
        const remain = (S.league.seasonEndsAt - U.now()) / 1000;
        this.els.leagueModal.innerHTML = `
            <div class="modal-card sheet league-sheet">
                <div class="league-emblem">${IconGen.img('leagueEmblem')}</div>
                <div class="league-title">플래티넘 리그</div>
                <div class="league-season-bar" onclick="UI.openLeagueRewards()">${IconGen.img('gift')} <span>시즌 종료: <b>${U.fmtTime(remain)}</b></span></div>
                <div class="league-list">${windowRows}</div>
                <div class="league-foot">
                    <div class="league-pinned">${this.leagueRow(me, myRank)}</div>
                    <div class="league-actions">
                        <button class="league-back-btn" onclick="UI.closeLeague()">${IconGen.img("tri_left")}</button>
                        <button class="btn primary" onclick="UI.openLeagueChallenge()">도전</button>
                    </div>
                </div>
            </div>`;
    },
    openLeagueRewards() { this.els.leagueModal.classList.add('dim-tabbar'); this.renderLeagueRewards(); },
    renderLeagueRewards() {
        League.ensure();
        const myRank = League.myRank();
        const cur = League.rewardForRank(myRank);
        const rowsHtml = League.REWARD_TIERS.map(t => {
            const r = League.rewardForRank(t.rank);
            // 원본(shot-042208 확대)은 1·2위가 **왕관 배지 위에 흰 숫자**, 3위가 **벽돌색 마름모 배지
            // 위에 흰 숫자**다 — 🥈🥉 이모지가 아니다. 4위 이하만 흰 글자 라벨('4-5' 등).
            const badge = t.rank <= 3 ? 'rank' + t.rank : '';
            const icon = badge
                ? `${IconGen.img(badge, 'lgr-rank-ico')}<span class="lgr-rank-n">${t.rank}</span>`
                : t.label;
            return `<div class="league-reward-tier">
                <div class="league-tier-rank ${badge ? 'badge' : 'text'}">${icon}</div>
                <div class="league-tier-grid">${this.leagueRewardGrid(r)}</div>
            </div>`;
        }).join('');
        const remain = (S.league.seasonEndsAt - U.now()) / 1000;
        // 원본(shot-042208)에서 이 팝업은 리그 시트를 **대체하지 않고 그 위에 겹쳐 뜬다** — 뒤에
        // 엠블럼·'플래티넘 리그' 제목·◀ 버튼·회색 밴드가 딤 처리된 채 그대로 남아 있다.
        // 이전 구현은 leagueModal.innerHTML을 통째로 갈아끼워 시트를 지웠고, 그 결과 팝업 뒤가
        // 전투 화면(숲·영웅·상단바)이 돼 배경이 원본과 완전히 달랐다(비율 대조 자체가 불가능했다).
        // 시트를 그대로 렌더한 뒤 딤 레이어만 덧붙인다.
        this.renderLeagueBoard();
        this.els.leagueModal.insertAdjacentHTML('beforeend', `
            <div class="lgr-overlay">
                <div class="idet-wrap">
                    <div class="modal-card wide lgr-card">
                        <!-- 원본(shot-042208) 리본은 글자만 있다 — 트로피 아이콘은 클론이 덧붙인 것이라 뺀다 -->
                        <div class="league-reward-banner">플래티넘 리그 보상</div>
                        <p class="league-reward-desc">현재 순위(${myRank})를 유지하면 시즌 종료 시<br>다음 보상을 받을 수 있습니다:</p>
                        <div class="league-reward-grid">${this.leagueRewardGrid(cur)}</div>
                        <div class="league-collect-pill">수집까지: <b>${U.fmtTime(remain)}</b></div>
                        <div class="league-reward-table">${rowsHtml}</div>
                    </div>
                    <button class="x-btn" onclick="UI.openLeague()">${IconGen.img('xmark')}</button>
                </div>
            </div>`);
        this.fitLeagueRankLabels();
    },
    // 등수 칸은 **고정폭**이다 — 원본(shot-042208)은 배지 줄이든 글자 줄이든 보상 pill 왼쪽 끝이
    // 전부 26.49%W 로 같아서, 긴 라벨에 맞춰 칸을 넓히면 그리드가 원본에서 통째로 밀린다(종전 3rem 이
    // 그래서 +2.02%p 였다). 그렇다고 글자를 원본 크기(1.48rem)로 키우면 이번엔 `21위 이하` 같은 긴
    // 라벨이 pill 을 파고든다(실측 잉크 109.6px vs 여유 60.4px).
    // → 칸과 기본 글자 크기는 원본대로 두고, **넘치는 라벨만 들어갈 만큼 줄인다.**
    // ⚠️ 문자열별 상수로 박지 말 것 — 라벨이 바뀌거나 다른 언어가 오면 그대로 다시 깨진다.
    //    기본 크기는 CSS 가 단독 출처이고(여기서 숫자를 복제하지 않는다) 실제 잉크 폭을 재서 비율만 곱한다.
    fitLeagueRankLabels() {
        // ⚠️ 폰트 로드 **전** 프레임에서 잰 폭은 폴백 글꼴 값이라 못 믿는다(인계 메모 ㉠ 이 같은 함정으로
        //    펫 화면 '18/18 통과'를 무효로 만들었다). 아직 로딩 중이면 끝난 뒤 한 번 더 맞춘다.
        //    로드가 끝나면 status 가 'loaded' 라 재귀는 한 번에 멈춘다.
        if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => this.fitLeagueRankLabels());
        for (const el of this.els.leagueModal.querySelectorAll('.lgr-overlay .league-tier-rank.text')) {
            el.style.fontSize = '';                       // 재렌더 때 줄어든 값이 누적되지 않게 먼저 되돌린다
            const grid = el.nextElementSibling;
            if (!grid) continue;
            const cell = el.getBoundingClientRect(), gx = grid.getBoundingClientRect().left;
            // ⚠️ (2026-08-19 lgr-rank-label-overflow) 종전 식 `room = (gx - 칸중심)*2 - 1` 은
            //    "라벨이 칸 가운데 정렬이라 좌우로 같은 양이 삐져나온다"는 전제였는데 **실측이 이를
            //    뒤집었다**: `.league-tier-rank` 가 `text-align:center` 라도 내용이 고정폭 칸(2.4rem)을
            //    넘치면 브라우저는 **오른쪽으로만** 흘리고 잉크 왼쪽은 칸 왼쪽에 붙는다(4뷰포트·
            //    dsf 1·5 모두 overflowLeft=0, ink.left≈cell.left). 그래서 대칭 전제가 폭을 ~7px 과대
            //    산정해 `11-20`·`21위 이하` 가 pill 을 파고들었다. **한쪽 기준**으로 고친다: 쓸 수
            //    있는 폭 = pill 왼쪽 − 칸 왼쪽 − 안전여유. 안전여유 3px 은 `-webkit-text-stroke`
            //    (.108em, 잉크 밖으로 반씩 번진다)와 반올림 몫이다(Range 잉크는 획을 안 잰다).
            const room = gx - cell.left - 3;
            const rg = document.createRange(); rg.selectNodeContents(el);
            const ink = rg.getBoundingClientRect().width;
            if (ink > room && room > 0) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * room / ink) + 'px';
        }
    },
    openLeagueChallenge() { this.els.leagueModal.classList.add('dim-tabbar'); this.renderLeagueChallenge(); },
    renderLeagueChallenge() {
        const list = League.challengeList();
        const rowsHtml = list.map((b, i) => `
            <div class="league-challenge-row">
                <span class="league-challenge-avatar">${IconGen.avatar(b.avatar)}</span>
                <span class="league-challenge-name">${U.escapeHtml(b.name)}<br><small>${IconGen.img('power')} ${U.fmt(b.cp)}</small></span>
                <span class="league-challenge-side">
                    <span class="star">${IconGen.img('star')}+${b.starReward}</span>
                    <button class="btn sm ${S.league.tickets > 0 ? '' : 'disabled'}" onclick="UI.onChallenge(${i})">도전<br><small>${IconGen.img('ticket')}1</small></button>
                </span>
            </div>`).join('');
        this.els.leagueModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide">
                    <div class="profile-title">상대 선택</div>
                    <p class="league-challenge-desc">도전 티켓은 매일 09:00에 보충됩니다!</p>
                    <div class="league-ticket-pill">${IconGen.img('ticket')} ${S.league.tickets}/${League.TICKET_MAX}</div>
                    <div class="league-challenge-list">${rowsHtml}</div>
                </div>
                <button class="x-btn" onclick="UI.openLeague()">${IconGen.img('xmark')}</button>
            </div>`;
    },
    onChallenge(idx) {
        const r = League.challenge(idx);
        if (!r) { this.toast('🎟 도전 티켓이 부족합니다'); return; }
        this.toast(r.win ? `🏆 승리! ⭐+${r.starReward}` : `💀 ${r.bot.name}에게 패배했습니다`);
        Chat.shareLeagueResult(r.win, Combat.combatPower(), r.bot); // UI-SPEC 28번: 리그 전투 공유 카드 자동 게시
        this.renderChatPreview();
        this.renderLeagueChallenge();
        this.renderTopBar();
    },

    // ---- 진행 패스 (UI-SPEC 18번, 원본 shot-042705): 스테이지 도달 마일스톤. 무료만 실지급, 프리미엄은 잠금 표시(더미) ----
    CURRENCY_ICON: { coins: 'coin', hammers: 'hammer', gems: 'gem', tickets: 'ticket', potions: 'potion', winders: 'winder', eggCurrency: 'eggCracked' },
    // 재화 키 → 캔버스 생성 아이콘 <img>. 알 수 없는 키는 빈 문자열로 떨어진다.
    curIcon(k) { return IconGen.img(this.CURRENCY_ICON[k]); },
    passRewardLines(reward) {
        return Object.entries(reward).map(([k, v]) => `<span>${this.curIcon(k)}${U.fmt(v)}</span>`).join('');
    },
    openPass() {
        Pass.ensure();
        this.renderPass();
        this.showModal(this.els.passModal);
    },
    closePass() { this.els.passModal.classList.add('hidden'); },
    renderPass() {
        const rowsHtml = Pass.MILESTONES.map(m => {
            const [c] = m.stage.split('-').map(Number);
            const reached = Pass.reached(m.stage);
            const claimed = Pass.claimed(m.stage);
            const freeCell = claimed
                ? `<div class="pass-cell free lit done">${this.passRewardLines(m.free)}<span class="pass-badge check">${IconGen.img('check')}</span></div>`
                : reached
                    ? `<button class="pass-cell free lit claimable" onclick="UI.onClaimPass('${m.stage}', this)">${this.passRewardLines(m.free)}</button>`
                    : `<div class="pass-cell free">${this.passRewardLines(m.free)}</div>`;
            // 프리미엄 칸도 무료 칸과 같은 도달 기준으로 밝기가 바뀐다(항상 잠김이지만 도달 전이면 카드 배경에 녹아듦, 원본 shot-042705)
            const premiumCell = `<div class="pass-cell premium ${reached ? 'lit' : ''}" onclick="UI.onPremiumPass()">${this.passRewardLines(m.premium)}<span class="pass-badge lock">${IconGen.img('lock')}</span></div>`;
            /* 마일스톤 하나를 `.pass-seg` 로 감싸는 이유 = **중앙 레일이 진행도를 보여야 한다**
               (원본 shot-042705: 도달한 구간은 파랑 #341cff, 미도달 구간은 죽은 색으로 끊긴다).
               레일을 `.pass-track` 배경 한 겹으로 깔면 트랙 전체가 한 색이라 그 정보가 안 나온다 —
               구간마다 배경 줄무늬를 따로 깔아야 색이 갈린다. `reached` 는 필 색도 같이 가른다
               (원본에서 미도달 필은 검정이다). */
            return `<div class="pass-seg ${reached ? 'reached' : ''}">
                <div class="pass-milestone-label">${this.difficultyLabel(c)} ${m.stage}</div>
                <div class="pass-row">${freeCell}${premiumCell}</div>
            </div>`;
        }).join('');
        this.els.passModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide pass-card">
                    <div class="pass-sword">${IconGen.img('passsword')}</div>
                    <div class="pass-banner">진행 패스</div>
                    <div class="pass-desc-row">
                        <!-- 원본(042705)은 "…보상을 받 / 으세요!"로 단어 중간에서 접힌다(2행 모두 가운데 정렬) -->
                        <p class="pass-desc">전투를 진행하여 보상을 받<br>으세요!</p>
                        <div class="pass-price" onclick="UI.onPremiumPass()">${Pass.PREMIUM_PRICE_KR}</div>
                    </div>
                    <div class="pass-header-row"><span>무료</span><span>프리미엄</span></div>
                    <div class="pass-track">${rowsHtml}</div>
                </div>
                <button class="x-btn" onclick="UI.closePass()">${IconGen.img('xmark')}</button>
            </div>`;
    },
    onClaimPass(key, cell) {
        const m = Pass.MILESTONES.find(x => x.stage === key);
        if (Pass.claim(key)) {
            // 토스트 없음 — 수령 연출('+획득량' 라벨·체크로 바뀌는 칸)이 이미 말한다(reward-claim-fx)
            if (m) this.rewardBurst(m.free, { from: cell });
            this.renderPass(); this.renderTopBar();
        }
    },
    onPremiumPass() { this.toast('💎 프리미엄 패스는 데모 버전에서 지원하지 않습니다'); },

    // ---- 상점 탭 (UI-SPEC 17번): 오늘의 특가 3종 + 보석 패키지 ----
    openShop() {
        Shop.ensure();
        this.renderShop();
        this.showModal(this.els.shopModal);
    },
    closeShop() { this.els.shopModal.classList.add('hidden'); },
    // 원본(shot-042632): 다크 마룬 풀스크린 + 금색 리본 배너 + 특가 카드(좌상단 빨간 깃발 태그,
    // 재화 회색 pill 세로 나열, 우측 상품 아이콘, 우하단 파란 가격 버튼) + 보석 카드 3장
    renderShop() {
        // 원본(042632)의 보석 패키지 그림은 금화·지갑 이모지가 아니라 '붉은 보석 묶음'이 양에 따라
        // 낱개 더미 → 자루 → 항아리로 커지는 3단이다 — IconGen 캔버스 아이콘으로 교체.
        // 특가 카드의 상품 일러(`shop_tech`/`shop_pet`/`shop_mount`)도 같은 이유로 IconGen 이다 —
        // 원본은 CSS 상자 + 이모지 명판이 아니라 거래마다 다른 '상자 + 앞 소품' 그림이다.
        const GEM_ICONS = ['shop_gems1', 'shop_gems2', 'shop_gems3', 'shop_gems4'];
        const dealsHtml = Shop.DEALS.map(d => {
            const claimed = Shop.claimed(d.key);
            const rewardRows = Object.entries(d.reward).map(([k, v]) =>
                `<span class="shop-reward-pill">${this.curIcon(k)} ${U.fmt(v)}</span>`).join('');
            return `<div class="shop-deal-card">
                <div class="shop-deal-tag">${d.name}</div>
                <div class="shop-deal-body">
                    <div class="shop-deal-rewards">${rewardRows}</div>
                    <div class="shop-deal-right">
                        <span class="shop-deal-art">${IconGen.img('shop_' + d.key) || `<i class="art-emblem">${d.icon}</i>`}</span>
                        <button class="btn primary shop-price-btn ${claimed ? 'disabled' : ''}" onclick="UI.onClaimDeal('${d.key}')"
                            title="${claimed ? '오늘은 이미 수령했습니다' : '데모판은 결제 대신 하루 1회 무료 수령입니다'}">
                            ${claimed ? '수령 완료' : d.priceKR}</button>
                    </div>
                </div>
            </div>`;
        }).join('');
        const gemsHtml = Shop.GEM_PACKS.map((p, i) => `
            <div class="shop-gem-card">
                <div class="shop-gem-amt"><span class="shop-gem-dia">${IconGen.img('gem')}</span> ${U.fmt(p.gems)}</div>
                <span class="shop-gem-icon">${IconGen.img(GEM_ICONS[i] || 'shop_gems3')}</span>
                <button class="btn primary shop-price-btn" onclick="UI.onBuyGems()">${p.priceKR}</button>
            </div>`).join('');
        this.els.shopModal.innerHTML = `
            <div class="modal-card sheet shop-sheet">
                <div class="sheet-head">
                    <span class="cur-pill coin">${this.curIcoPlus('coin')} ${U.fmt(S.coins)}</span>
                    <h2 class="sheet-title shop-title">상점</h2>
                    <span class="cur-pill gem">${this.curIcoPlus('gem')} ${U.fmt(S.gems)}</span>
                </div>
                <div class="shop-banner">오늘의 특가</div>
                <p class="shop-sub">일일 특가 3개 모두 구매하면 새로운 3개가 나와요!</p>
                <div class="shop-deals">${dealsHtml}</div>
                <div class="shop-banner">보석</div>
                <div class="shop-gems">${gemsHtml}</div>
                <button class="league-back-btn sheet-back-btn" onclick="UI.closeShop()">${IconGen.img("tri_left")}</button>
            </div>`;
    },
    onClaimDeal(key, btn) {
        const d = Shop.DEALS.find(x => x.key === key);
        if (Shop.claimDeal(key)) {
            // 젬은 claimDeal이 지급을 걸러내므로(보급 금지) 연출에서도 같이 뺀다 — 안 준 걸 준 것처럼 보이면 안 된다
            if (d) { const r = Object.assign({}, d.reward); delete r.gems; this.rewardBurst(r, { from: btn }); }
            this.renderShop(); this.renderTopBar();   // 토스트 없음 — 수령 연출이 이미 말한다(reward-claim-fx)
        } else this.toast('오늘은 이미 수령했습니다');
    },
    onBuyGems() { this.toast('💎 데모 버전에서는 결제를 지원하지 않습니다'); },

    // ---- 프로필/설정 팝업 (UI-SPEC 19~20번): 프로필(이름·아바타 편집) / 설정(음악·사운드 실동작 토글) ----
    // 고를 수 있는 아바타 = icongen.js 의 공용 AVATAR_POOL 한 벌(24종). 예전에는 여기 12종만 있어
    // 리그·채팅에서 마주치는 얼굴을 정작 내가 고를 수 없었다.
    get AVATAR_POOL() { return AVATAR_POOL; },
    _profileView: 'profile', _avatarPicking: false,
    openProfile() { this._profileView = 'profile'; this._avatarPicking = false; this.renderProfile(); this.showModal(this.els.profileModal); },
    closeProfile() { this.els.profileModal.classList.add('hidden'); },
    switchProfileView(v) { this._profileView = v; this._avatarPicking = false; this.renderProfile(); },
    renderProfile() {
        if (this._profileView === 'settings') this.renderSettingsView();
        else this.renderProfileView();
    },
    renderProfileView() {
        const avatarPicker = this._avatarPicking
            ? `<div class="avatar-pick-grid">${this.AVATAR_POOL.map(e =>
                `<button class="avatar-pick-btn ${e === (S.avatarEmoji || DEFAULT_AVATAR) ? 'on' : ''}" data-av="${e}" onclick="UI.onPickAvatar('${e}')">${IconGen.avatar(e)}</button>`).join('')}</div>` : '';
        this.els.profileModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide profile-sheet">
                    <div class="profile-title">프로필</div>
                    <div class="profile-top">
                        <div class="profile-avatar-box">
                            <span class="profile-avatar-big">${IconGen.avatar(S.avatarEmoji)}</span>
                            <button class="profile-edit-btn" title="아바타 변경" onclick="UI.onToggleAvatarPick()">${IconGen.img('pencil')}</button>
                        </div>
                        <div class="profile-fields">
                            <div class="profile-field-label">이름:</div>
                            <div class="profile-field-row">
                                <span class="profile-field">${U.escapeHtml(S.nickname || '용사')}</span>
                                <button class="profile-edit-btn" title="이름 변경" onclick="UI.onEditNickname()">${IconGen.img('pencil')}</button>
                            </div>
                            <div class="profile-field-label">성별:</div>
                            <div class="profile-field-row">
                                <span class="profile-field">${IconGen.img(S.gender === '♀' ? 'gender_f' : 'gender_m')}</span>
                                <button class="profile-edit-btn" title="성별 변경" onclick="UI.onToggleGender()">${IconGen.img('pencil')}</button>
                            </div>
                        </div>
                    </div>
                    ${avatarPicker}
                    <div class="profile-rank-label">서버 랭킹</div>
                    <div class="profile-rank-row">
                        <button class="btn primary" onclick="UI.openStub('파워 랭킹', '서버 내 전투력 랭킹은 준비 중입니다.', 'trophy')">파워 랭킹</button>
                        <button class="btn primary" onclick="UI.openStub('클랜 랭킹', '클랜 시스템은 준비 중입니다.', 'clanbadge')">클랜 랭킹</button>
                    </div>
                    <div class="profile-tabs">
                        <button class="${this._profileView === 'profile' ? 'on' : ''}" onclick="UI.switchProfileView('profile')">프로필</button>
                        <button class="${this._profileView === 'settings' ? 'on' : ''}" onclick="UI.switchProfileView('settings')">설정</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeProfile()">${IconGen.img('xmark')}</button>
            </div>`;
    },
    onToggleAvatarPick() { this._avatarPicking = !this._avatarPicking; this.renderProfileView(); },
    onPickAvatar(e) { S.avatarEmoji = e; this._avatarPicking = false; saveGame(); this.renderProfileView(); this.renderTopBar(); },
    onEditNickname() {
        const name = prompt('새 이름을 입력하세요 (최대 12자)', S.nickname || '용사');
        if (name && name.trim()) { S.nickname = name.trim().slice(0, 12); saveGame(); this.renderProfileView(); this.renderTopBar(); }
    },
    onToggleGender() { S.gender = S.gender === '♂' ? '♀' : '♂'; saveGame(); this.renderProfileView(); },

    renderSettingsView() {
        S.settingsDummy = S.settingsDummy || { vibration: true, chatShow: true, chatDark: false, clanChatPreview: true };
        const d = S.settingsDummy;
        const toggle = (label, on, onclick) => `
            <div class="settings-row">
                <span>${label}</span>
                <button class="settings-toggle ${on ? 'on' : ''}" onclick="${onclick}"></button>
            </div>`;
        const checkRow = (label) => `
            <div class="settings-row static" onclick="UI.toast('데모 버전에서는 지원하지 않습니다')">
                <span>${label}</span><span class="settings-check">${IconGen.img('check')}</span>
            </div>`;
        const staticRow = (label) => `<div class="settings-row static" onclick="UI.toast('데모 버전에서는 지원하지 않습니다')"><span>${label}</span></div>`;
        // 실동작 행 — '방' 탭을 없애면서(사용자 지시 2026-08-18) 갈 곳이 없어진 수동 저장·초기화를
        // 여기로 옮겼다. 초기화 경로가 통째로 사라지면 안 된다는 게 그 항목의 조건이었다.
        // 목록 끝에 붙이므로 원본과 대조하는 상단 10행의 위치·높이는 그대로다(잘림 단서도 유지).
        const actRow = (label, onclick, act, cls) => `
            <div class="settings-row" onclick="${onclick}">
                <span>${label}</span><span class="settings-act ${cls || ''}">${act}</span>
            </div>`;
        this.els.profileModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide profile-sheet">
                    <div class="profile-title">설정</div>
                    <div class="profile-sub">서버 시간: ${(d0 => `${d0.getDate()}. ${d0.getMonth() + 1}월, ${String(d0.getHours()).padStart(2, '0')}:${String(d0.getMinutes()).padStart(2, '0')}`)(new Date())}</div>
                    <div class="settings-list">
                        ${toggle('진동', d.vibration, "UI.onToggleSettingsDummy('vibration')")}
                        ${toggle('음악', SFX.musicEnabled, "UI.onToggleMusic()")}
                        ${toggle('사운드 효과', S.sfxOn, "UI.onToggleSfxSetting()")}
                        ${toggle('채팅 표시', d.chatShow, "UI.onToggleSettingsDummy('chatShow')")}
                        ${toggle('채팅 다크 모드', d.chatDark, "UI.onToggleSettingsDummy('chatDark')")}
                        ${toggle('클랜 채팅 미리보기', d.clanChatPreview, "UI.onToggleSettingsDummy('clanChatPreview')")}
                        ${staticRow('언어')}
                        ${checkRow('계정')}
                        ${staticRow('차단 목록')}
                        ${staticRow('개인정보 보호')}
                        ${actRow('수동 저장', "saveGame(); UI.toast('💾 저장 완료')", '저장')}
                        ${actRow('게임 초기화', "if(confirm('정말 처음부터 시작할까요?')) resetGame()", '초기화', 'danger')}
                    </div>
                    <div class="profile-tabs">
                        <button class="${this._profileView === 'profile' ? 'on' : ''}" onclick="UI.switchProfileView('profile')">프로필</button>
                        <button class="${this._profileView === 'settings' ? 'on' : ''}" onclick="UI.switchProfileView('settings')">설정</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeProfile()">${IconGen.img('xmark')}</button>
            </div>`;
    },
    onToggleSettingsDummy(key) { S.settingsDummy[key] = !S.settingsDummy[key]; saveGame(); this.renderSettingsView(); },
    onToggleMusic() { SFX.toggleMusic(); this.renderSettingsView(); },
    onToggleSfxSetting() {
        S.sfxOn = !S.sfxOn;
        if (S.sfxOn) { SFX.resume(); SFX.craft(); }
        saveGame();
        this.renderSettingsView();
    },

    // ---- 플레이어 정보 팝업 (메인 화면 왼쪽 하단 "!" 버튼, UI-SPEC 27번) ----
    openPlayerInfo() { this.renderPlayerInfo(); this.showModal(this.els.playerInfoModal); },
    closePlayerInfo() {
        this.els.playerInfoModal.classList.add('hidden');
        // ⚠️ 팝업이 닫히면 미니 씬 rAF 를 반드시 끊는다 — 안 끊으면 안 보이는 씬이 계속 렌더돼
        //    전장과 GPU 를 나눠 쓴다(모바일에서 그대로 프레임 손실이다).
        if (typeof Scene3D !== 'undefined' && Scene3D.previewStop) Scene3D.previewStop();
    },
    renderPlayerInfo() {
        const stats = Forge.heroStats();
        const cp = Combat.combatPower();
        const stars = Ascension.totalStars();

        // 미니 전투씬 프리뷰 — 사용자 지시(2026-08-19): **현재 챕터와 무관하게 잔디 맵**에서
        // **플레이어가 가운데 고정으로 달리고 맵이 흘러간다**. 실제 구현은 `Scene3D.previewStart`
        // 가 독립 씬으로 굽고(본편 씬을 건드리면 전장이 같이 바뀐다), 여기서는 빈 상자만 낸다.
        // 종전에는 살아 있는 전장을 한 프레임 렌더해 toDataURL 로 찍은 **정지 JPEG** 이었다.
        // WebGL 이 없거나 미니 씬이 실패하면 아래 폴백(스테이지 라벨 + 웨이브 핍)으로 떨어진다.
        let previewHtml;
        const canScene = typeof Scene3D !== 'undefined' && Scene3D.previewStart && typeof ProChar !== 'undefined';
        if (canScene) {
            previewHtml = '<div class="pinfo-preview scene" id="pinfo-scene"></div>';
        } else {
            const waveHtml = Dungeons.run ? '' : Array.from({ length: Combat.totalWaves() }, (_, i) => i + 1).map(w =>
                `<span class="pip ${w < Combat.wave ? 'done' : w === Combat.wave ? 'now' : ''}"></span>`).join('');
            // 던전 중에는 라벨 안 아이콘이 `<i>` 노드라 textContent 로는 빠진다 — 글자판을 쓴다.
            const stageText = this.els.stageLabel.dataset.text || this.els.stageLabel.textContent;
            previewHtml = `<div class="pinfo-preview"><span>🛡️</span><span>${U.escapeHtml(stageText)}</span>${waveHtml}</div>`;
        }

        let gearHtml = SLOTS.map(slot => this.equipCellHTML(slot)).join('');
        // 원본(043313): 장비 2행 우측 와이드 파란 탈것 카드 (185 재채점)
        const am = Mounts.riddenInst();
        const amName = am ? am.name : null;
        const amExtra = Math.max(0, (S.activeMounts || []).length - 1);
        gearHtml += am
            ? `<div class="equip-cell egg-cell pinfo-mount-wide" onclick="UI.openMounts()">
                ${UI.mountFace(amName, 'cell-img emoji', am.rarity, am.stars)}
                <span class="cell-lv">Lv.${am.level}</span>
                ${amExtra ? `<span class="cell-count" style="${UI.MOUNT_COUNT_STYLE}">+${amExtra}</span>` : ''}</div>`
            : `<div class="equip-cell egg-cell empty pinfo-mount-wide" onclick="UI.openMounts()"><span class="slot-name">탈것</span></div>`;

        // 슬롯 클릭 → 각 세부정보 팝업이 플레이어 정보 위에 겹쳐 뜸 (사용자 지시 — 닫으면 플레이어 정보로 복귀)
        const skillIconsHtml = S.equippedSkills.map(id => `<button class="sk-cell" onclick="UI.openSkillDetail('${id}')">
            <span class="sk-orb" style="--rc:${RARITY_CSS[Skills.def(id).rarity]}">${IconGen.skill(id)}<span class="sk-lv">Lv.${Skills.level(id)}</span></span></button>`).join('');
        const petIconsHtml = S.activePets.map(i => {
            const p = S.pets[i];
            return `<button class="sk-cell" onclick="UI.openPetDetail(${i})">
                <span class="sk-orb">${UI.petFace(p.name, 'mt-inline', p.stars)}<span class="sk-lv">Lv.${p.level}</span></span></button>`;
        }).join('');
        // 장착 탈것을 나열한다 — 장착이 1마리라 사실상 1칸이다(`mount-single-equip`).
        const mountIconHtml = (S.activeMounts || []).map(i => ({ i, m: Mounts.inst(i) })).filter(x => x.m).map(({ i, m }) =>
            `<button class="sk-cell" onclick="UI.openMountUpgrade(${i})">
            <span class="sk-orb">${UI.mountFace(m.name, 'mt-inline', m.rarity, m.stars)}<span class="sk-lv">Lv.${m.level}</span></span></button>`).join('');

        const subsHtml = SUBSTATS
            .map(([key, label]) => ({ key, label, value: +stats.subs[key].toFixed(1) }))
            .filter(s => s.value > 0)
            .map(s => `<div>${U.subText(s)}</div>`)
            .join('') || '<div class="muted">보유한 옵션 없음</div>';

        this.els.playerInfoModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide pinfo-card">
                    <div class="pinfo-header">
                        <div class="pinfo-id">
                            <span class="avatar">${IconGen.avatar(S.avatarEmoji)}</span>
                            <div class="pinfo-id-text">
                                <span class="name">${U.escapeHtml(S.nickname || '용사')} <span class="muted">[무소속]</span></span>
                                <span class="clan">${IconGen.img(S.gender === '♀' ? 'gender_f' : 'gender_m')} · 서버 1</span>
                                <span class="cp">${IconGen.img('power')} ${U.fmt(cp)}</span>
                            </div>
                        </div>
                        <div class="pinfo-right">
                            <div>Lv. ${S.forgeLevel} 대장간${stars ? ` ${IconGen.img('star')}${stars}` : ''}</div>
                            <div>${U.fmt(stats.atk)} 총 피해</div>
                            <div>${U.fmt(stats.hp)} 총 체력</div>
                        </div>
                    </div>
                    ${previewHtml}
                    <div class="equip-grid pinfo-gear">${gearHtml}</div>
                    <div class="pinfo-loadout-row">${skillIconsHtml}${(petIconsHtml + mountIconHtml) || '<span class="muted">출전 중인 펫 없음</span>'}</div>
                    <div class="pinfo-subs-list">${subsHtml}</div>
                </div>
                <button class="x-btn" onclick="UI.closePlayerInfo()">${IconGen.img('xmark')}</button>
            </div>`;
        this.hydrateMountThumbs();   // 탈것 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
        // 미니 씬은 DOM 이 붙은 뒤에 시작한다 — 컨테이너의 clientWidth/Height 로 렌더 크기를 잡으므로
        // innerHTML 대입 직후(레이아웃 전)에 부르면 0×0 으로 굳는다.
        if (canScene) {
            const host = document.getElementById('pinfo-scene');
            if (!host || !Scene3D.previewStart(host)) {
                // 미니 씬이 못 서면 상자를 비워 두지 말고 폴백 표기로 되돌린다(빈 초록 판이 남는 것 방지)
                if (host) { host.classList.remove('scene'); host.innerHTML = `<span>🛡️</span><span>${U.escapeHtml(this.els.stageLabel.dataset.text || this.els.stageLabel.textContent)}</span>`; }
            }
        }
    },

    // ---- 채팅 화면 (UI-SPEC 28번, 원본 shot-043500): 하단 1줄 미리보기 + 탭하면 전체화면 채팅 ----
    // 원본 shot-043500 실측: 흰 배경에 모든 사용자 이름이 같은 주황 rgb(255,136,15)이다.
    // (이전 파스텔 10색 팔레트는 배경이 검정일 때를 전제한 것이라 흰 배경에서 전부 읽히지 않는다.)
    CHAT_NAME_COLORS: ['#ff880f'],
    chatNameColor(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return this.CHAT_NAME_COLORS[h % this.CHAT_NAME_COLORS.length];
    },

    // 이름 뒤 아이콘 클러스터 — 원본(shot-043500)은 [성별 아이콘][클랜 배지] 두 개를 단다.
    // 실측: 클러스터 전체 x 53.51~61.92%W(8.42%W), 성별 ≈3.0%W, 배지 ≈5.0%W.
    // 클론은 회색 텍스트 ♀ 하나(1.00%W)뿐이라 −7.4%p — 비평가 A·B가 모두 1순위로 꼽은 결함이다.
    // 배지는 원본처럼 '일부 유저만' 달아야 줄이 단조로워지지 않으므로 이름 해시로 약 2/3에 준다.
    chatNameIcons(m) {
        const g = m.gender === '♀' ? 'gender_f' : 'gender_m';
        let out = IconGen.img(g, 'chat-gender');
        let h = 0;
        const key = m.name || '';
        for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0;
        if (h % 3 !== 0) out += IconGen.img('clanbadge', 'chat-clan');
        return out;
    },
    chatTime(at) {
        const d = new Date(at);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
    chatMsgHtml(m) {
        if (m.type === 'share') {
            // 좌=승자(초록) / 우=패자(회색) — 내가 졌어도 승자는 항상 왼쪽 (UI-SPEC 28번)
            const winner = m.win ? { name: m.myName, avatar: m.myAvatar, cp: m.myCp } : { name: m.oppName, avatar: m.oppAvatar, cp: m.oppCp };
            const loser = m.win ? { name: m.oppName, avatar: m.oppAvatar, cp: m.oppCp } : { name: m.myName, avatar: m.myAvatar, cp: m.myCp };
            return `<div class="chat-row">
                <span class="chat-avatar">${IconGen.avatar(m.myAvatar)}</span>
                <div class="chat-bubble-wrap">
                    <div class="chat-name-line"><span class="chat-name" style="color:${this.chatNameColor(m.myName)}">${m.tag ? `<span class="chat-tag">[${U.escapeHtml(m.tag)}]</span> ` : ''}${U.escapeHtml(m.myName)}</span>${this.chatNameIcons({ name: m.myName, gender: m.gender })}<span class="chat-time">${this.chatTime(m.at)}</span></div>
                    <div class="chat-share-card">
                        <div class="chat-share-side win">
                            <span class="chat-share-avatar"><span class="icon-circle sm">${IconGen.avatar(winner.avatar)}</span><span class="chat-share-label">승리</span></span>
                            <small>${U.escapeHtml(winner.name)}</small>
                            <small>${IconGen.img('power')} ${U.fmt(winner.cp)}</small>
                        </div>
                        <div class="chat-share-side lose">
                            <span class="chat-share-avatar"><span class="icon-circle sm">${IconGen.avatar(loser.avatar)}</span></span>
                            <small>${U.escapeHtml(loser.name)}</small>
                            <small>${IconGen.img('power')} ${U.fmt(loser.cp)}</small>
                        </div>
                        <span class="chat-share-cam">${IconGen.img('chatcam')}</span>
                    </div>
                </div>
            </div>`;
        }
        const tagHtml = m.tag ? `<span class="chat-tag">[${U.escapeHtml(m.tag)}]</span> ` : '';
        return `<div class="chat-row ${m.mine ? 'mine' : ''}">
            <span class="chat-avatar">${IconGen.avatar(m.avatar)}</span>
            <div class="chat-bubble-wrap">
                <div class="chat-name-line">
                    <span class="chat-name" style="color:${m.mine ? '' : this.chatNameColor(m.name)}">${tagHtml}${U.escapeHtml(m.name)}</span>${this.chatNameIcons(m)}
                    <span class="chat-time">${this.chatTime(m.at)}</span>
                </div>
                <div class="chat-bubble">${U.escapeHtml(m.text)}</div>
            </div>
        </div>`;
    },
    renderChatPreview() {
        const last = Chat.lastMessage();
        if (!last || !this.els.chatPreview) return;
        const name = last.type === 'share' ? last.myName : last.name;
        const msg = last.type === 'share' ? '전투 결과를 공유했습니다' : last.text;
        this.els.chatPreview.innerHTML = `
            <span class="chat-preview-avatar">${IconGen.img('chatbubble')}<span class="chat-preview-badge">99</span></span>
            <span class="chat-preview-lines">
                <span class="chat-preview-name">${U.escapeHtml(name)}</span>
                <span class="chat-preview-msg">${U.escapeHtml(msg)}</span>
            </span>`;
    },
    openChat() {
        Chat.ensure();
        this.renderChatFull();
        this.showModal(this.els.chatModal);
        // renderChatFull 안의 scrollTop 지정은 모달이 아직 hidden(display:none)이라 무시된다 —
        // 보이게 만든 뒤 한 번 더 내려야 원본처럼 '최신 메시지가 입력바 바로 위'로 온다.
        this.pinChatBottom();
    },
    closeChat() { this.els.chatModal.classList.add('hidden'); },
    // 봇 메시지는 15~40초마다 오고 그때마다 main.js 틱이 이걸 부른다. 예전엔 여기서 카드를 통째로
    // innerHTML 교체해 입력 <input>이 **새 노드로 갈렸고**, 그래서 타이핑 중이던 포커스·캐럿이 body로
    // 빠져 이후 친 글자가 아무데도 안 들어갔다(QA 13차). 입력값만 되살리는 걸로는 부족했다 —
    // 포커스는 노드에 붙는 것이라 노드를 갈면 무조건 사라진다.
    // 그래서 카드 골격(입력 바 포함)은 처음 한 번만 만들고, 이후 갱신은 메시지 리스트만 다시 그린다.
    renderChatFull() {
        if (!document.getElementById('chat-input')) {
            this.els.chatModal.innerHTML = `
            <div class="modal-card chat-card">
                <div class="chat-list" id="chat-list" data-own-scroll onscroll="UI.onChatScroll()"></div>
                <div class="chat-input-bar">
                    <button class="btn danger round" onclick="UI.closeChat()">${IconGen.img("tri_left")}</button>
                    <input id="chat-input" type="text" placeholder="메시지 보내기..." maxlength="200"
                        onkeydown="if(event.key==='Enter') UI.onSendChat()">
                </div>
            </div>`;
        }
        this.renderChatList();
    },
    renderChatList() {
        const list = document.getElementById('chat-list');
        if (!list) return;
        list.innerHTML = S.chat.messages.map(m => this.chatMsgHtml(m)).join('');
        if (this._chatStick !== false) this.pinChatBottom(); // 바닥에 붙어 있었으면 새 메시지를 따라간다
    },
    // 리스트를 최신 메시지에 붙인다.
    // ⚠️ 이게 오래 안 먹던 이유: installScrollKeeper()가 `render*` 이름의 메서드를 전부 keepScroll로 감싸는데,
    //    keepScroll은 렌더 직전 위치를 기억했다가 렌더 뒤에 되돌린다 — 즉 여기서 바닥으로 민 값이 곧바로
    //    옛 위치로 복구됐다(실측: 419로 밀면 한 틱 뒤 367로 되돌아옴). 그래서 새 메시지가 입력바 위로
    //    올라오지 않고 화면 밖에 쌓였다. 채팅 리스트에 `data-own-scroll`을 달아 그 복구에서 빼는 것으로 푼다.
    pinChatBottom() {
        const list = document.getElementById('chat-list');
        if (!list) return;
        this._chatStick = true;
        list.scrollTop = list.scrollHeight;   // 브라우저가 실제 도달 가능한 최대치로 클램프한다
        this._chatPinnedTop = list.scrollTop; // 그 클램프된 값이 '바닥'의 정확한 기준점
    },
    // 사용자가 위로 올려 옛 메시지를 읽는 중이면 새 메시지가 와도 끌어내리지 않는다.
    // 우리가 민 스크롤과 사용자가 올린 스크롤은 기준점(_chatPinnedTop)과의 거리로 가른다 —
    // pinChatBottom이 기준점을 먼저 갱신해 두므로 우리 스크롤은 항상 '바닥'으로 판정된다.
    onChatScroll() {
        const list = document.getElementById('chat-list');
        if (!list) return;
        this._chatStick = list.scrollTop >= (this._chatPinnedTop || 0) - 40;
    },
    onSendChat() {
        const input = document.getElementById('chat-input');
        if (!input || !Chat.sendPlayer(input.value)) return;
        input.value = '';
        this.renderChatFull();
        this.renderChatPreview();
    },

    // ---- 기술 트리 (소환 탭 서브탭, UI-SPEC 10·15~16번): 분기 4개 카드 → 분기 상세(세로 노드 트리) → 노드 팝업 ----
    _techView: 'overview', _techBranch: null, _techNode: null,
    openTechTree() { this._techView = 'overview'; this.switchSummonSub('tech'); }, // 다른 화면에서 진입하는 진입점 (메뉴 버튼 등)
    openTechOverview() { this._techView = 'overview'; this.renderTechTree(); }, // 서브탭 내부 뒤로가기
    openTechBranch(id) { this._techView = 'branch'; this._techBranch = id; this.renderTechTree(); },
    renderTechTree() {
        if (this.activeTab !== 'summon' || this._summonSub !== 'tech') return;
        TechTree.ensure();
        if (this._techView === 'branch') this.renderTechBranchView();
        else this.renderTechOverview();
    },
    renderTechOverview() {
        const cardsHtml = TechTree.BRANCHES.map(b => {
            const pct = TechTree.branchProgress(b.id);
            const researching = S.techResearch && TechTree.branchOf(S.techResearch.id) === b;
            const timeHtml = researching
                ? (TechTree.isDone()
                    ? ' <small>(완료!)</small>'   // 수령 대기 — 분기에 들어가 [완료] 를 눌러야 레벨이 오른다
                    : ` <small id="tech-b-time-${b.id}">(${U.fmtTime((S.techResearch.endsAt - U.now()) / 1000)})</small>`)
                : '';
            return `<button class="tech-branch-card" style="--bc:${{ power: '#e2574c', forge: '#4f86d8', skillpet: '#58b368' }[b.id] || '#9aa2ad'}" onclick="UI.openTechBranch('${b.id}')">
                <div class="tech-branch-head">${b.name}</div>
                <div class="tech-branch-icon">${IconGen.img(this.TECH_BRANCH_ICON[b.id]) || b.icon}</div>
                <div class="tech-branch-pct ${researching ? 'researching' : ''}">${pct.toFixed(1)}%${timeHtml}</div>
            </button>`;
        }).join('');
        this.els.techPanel.innerHTML = `
            <div class="sheet-head">
                <span class="cur-pill potion">${IconGen.img('potion')} ${U.fmt(S.potions || 0)}</span>
                <h2 class="sheet-title">기술 트리</h2>
                <span class="cur-pill gem">${IconGen.img('gem')} ${U.fmt(S.gems)}</span>
            </div>
            <div class="tech-branch-grid">${cardsHtml}</div>
            <button class="league-back-btn sheet-back-btn" onclick="UI.switchTab(null)">${IconGen.img("tri_left")}</button>`;
    },
    // 분기 상세: **단계가 가로 블록**인 5단계 트리 (사용자 재정정 2026-08-17 4회차).
    // 한 단계에 그 분기의 타입이 전부 놓이고(폭이 좁아 2개씩 흘려 쌓는다), 같은 타입이
    // 5단계에 반복된다. 해금은 **바로 위 행의 노드 전부가 1레벨 이상**이다(사용자 재정정 2026-08-19,
    // `TechTree.parentsOf` 참조) — 그려진 선(drawTechLinks)과 정확히 같은 규칙이다.
    // 행 구성·단계 경계 판정은 TechTree.rows()/tierBreak()에서 그대로 받아 쓴다 —
    // 부모 판정과 같은 규칙에서 나와야 그려진 선과 잠금 상태가 어긋나지 않는다.
    renderTechBranchView() {
        const b = TechTree.BRANCHES.find(x => x.id === this._techBranch);
        const pct = TechTree.branchProgress(b.id);
        const nodeCol = (id) => {
            const lv = TechTree.level(id);
            const max = TechTree.isMax(id);
            const researching = TechTree.researchingId() === id;
            const open = TechTree.isUnlocked(id);
            // 연구 시간이 끝나면 카운트다운 대신 '완료!' 를 띄워 눌러야 할 노드임을 알린다
            // (레벨업은 노드 팝업의 [완료] 버튼이 한다 — 사용자 지시 2026-08-19)
            const ready = researching && TechTree.isDone();
            const cls = ready ? 'researching ready' : researching ? 'researching' : max ? 'done' : !open ? 'tlocked' : lv > 0 ? 'active' : 'locked';
            // 🔓 잠긴 노드에도 **자물쇠를 그리지 않는다** — 뭐가 있는지 미리 보이게 내용(아이콘)을
            // 그대로 띄우고, 잠김은 `tlocked` 의 은은한 비활성 처리(회색 원반·흐림)로만 구분한다
            // (사용자 지시 2026-08-19 `techtree-no-lock-icon`). 되돌리지 말 것.
            const face = max ? IconGen.img('check') : this.techIcon(id);
            const badge = ready
                ? '<small class="tech-tree-node-time">완료!</small>'
                : researching
                    ? `<small class="tech-tree-node-time" id="tech-n-time-${id}">${U.fmtTime((S.techResearch.endsAt - U.now()) / 1000)}</small>`
                    : `<small>${lv}/${TechTree.MAX_LEVEL}</small>`;
            return `<div class="tech-tree-node-col">
                <button class="tech-tree-node ${cls}" data-tid="${id}" onclick="UI.openTechNode('${id}')">${face}</button>
                <div class="tech-tree-label">${badge}</div>
            </div>`;
        };
        // 골격 규칙 (사용자 재지시 2026-08-17 — '선을 부모 관계대로'):
        //  ① 그려지는 선 = `TechTree.parentsOf`가 정의한 부모→자식 연결과 **정확히 1:1**.
        //     예전 구현은 단계와 단계 사이에 공용 세로선 하나만 그어, 선을 따라가도
        //     무엇이 무엇을 여는지 알 수 없었다(부모는 '같은 타입 한 단계 위'인데
        //     선은 타입과 무관한 중앙 줄기였다).
        //  ② 선은 행 사이 빈칸이 아니라 **SVG 오버레이**에 그린다 — 부모와 자식이 서로 다른
        //     행·열에 놓일 수 있어(1·5단계는 단독 노드 행이 끼어 열이 밀린다) 노드 중심을
        //     실측해 이어야 한다. 같은 x면 세로 레일, 다르면 ㄱ자로 꺾어 내린다.
        //  ③ 첫 행 위·마지막 행 아래로는 아무 선도 나가지 않는다(사용자 지시).
        const rows = TechTree.rows(b.id);
        const rowsHtml = [];
        rows.forEach((row, r) => {
            const dim = row.ids.every(id => TechTree.isUnlocked(id)) ? '' : ' dim';
            if (r > 0) rowsHtml.push('<div class="tech-tree-vgap"></div>');   // 행 간격만 — 선은 오버레이가 그린다
            // 단계 표시는 그 단계 첫 행에만. 절대배치라 행의 가로 배치(=원본 비율)에 영향을 주지 않는다.
            const tag = row.first ? `<span class="tech-tier-tag${dim}">${TechTree.roman(row.tier)}</span>` : '';
            if (row.ids.length === 1) { rowsHtml.push(`<div class="tech-tree-row">${tag}${nodeCol(row.ids[0])}</div>`); return; }
            // 한 단계 안의 두 노드는 부모-자식이 아니므로 가로 바를 긋지 않는다(자리만 유지)
            const bar = '<div class="tech-tree-hgap"></div>';
            rowsHtml.push(`<div class="tech-tree-row">${tag}${nodeCol(row.ids[0])}${bar}${nodeCol(row.ids[1])}</div>`);
        });
        this.els.techPanel.innerHTML = `
            <div class="sheet-head">
                <span class="cur-pill potion">${IconGen.img('potion')} ${U.fmt(S.potions || 0)}</span>
                <h2 class="sheet-title">${b.name}</h2>
                <span class="cur-pill gem">${IconGen.img('gem')} ${U.fmt(S.gems)}</span>
            </div>
            <div class="tech-branch-detail-pct">${pct.toFixed(1)}%</div>
            <!-- 글리프는 원본(shot-042546)과 같은 소문자 i — 같은 .fi-info-btn 을 쓰는 대장간 정보 버튼(위 openForgeList)도 i 다.
                 ⚠️ ! 로 되돌리지 말 것: 원본 우상단은 검정 원 안 흰 i 이고, 한 스타일이 화면마다 다른 글자를 쓰면 안 된다. -->
            <button class="fi-info-btn tech-branch-info" onclick="UI.openTechBonuses()">i</button>
            <div class="tech-tree-col"><svg class="tech-tree-links" aria-hidden="true"></svg>${rowsHtml.join('')}</div>
            <button class="btn danger tech-tree-back" onclick="UI.openTechOverview()">${IconGen.img("tri_left")}</button>`;
        this.drawTechLinks();
    },
    // 연결선 그리기 (사용자 재지적 2026-08-18 — "일자로만 가지 말고 한 덩어리로 보이게"):
    // 골격은 `parentsOf`(같은 타입 세로 레일)가 아니라 **사용자가 그려 준 다이아몬드 골격**이다.
    //   · 이웃한 두 행을 잇는다 — 2행↔2행이면 좌·우 열이 각자 세로 레일로 내려가고,
    //   · 단독 행 → 2노드 행이면 단독 노드에서 **가로 바로 갈라져(fork)** 두 열로 퍼지고,
    //   · 2노드 행 → 단독 행이면 두 열이 **가로 바로 묶인 뒤(converge)** 한 점으로 모인다.
    // 그래서 단계마다 '한 점 → 두 열 → 한 점'의 다이아몬드가 이어져 트리 전체가 끊긴 데 없는
    // 한 덩어리로 읽힌다. 예전 구현은 같은 타입끼리만 이어 열이 서로 안 묶였고(가로선 0개),
    // 그 레일이 3~4행을 관통해 '평행한 막대들'로 보였다 — 사용자가 지적한 그 모양이다.
    // 선의 끝점은 언제나 원 테두리이고, 첫 행 위·마지막 행 아래로는 아무 선도 나가지 않는다.
    // (무엇이 무엇을 여는지는 노드 팝업의 `lockedBy` 안내가 담당한다 — 선은 골격 전용.)
    drawTechLinks() {
        const col = this.els.techPanel.querySelector('.tech-tree-col');
        const svg = col && col.querySelector('.tech-tree-links');
        if (!svg) return;
        const cb = col.getBoundingClientRect();
        const W = col.clientWidth, H = col.scrollHeight;
        const boxOf = (n) => {
            const r = n.getBoundingClientRect();
            return {
                id: n.dataset.tid,
                x: r.left - cb.left + col.scrollLeft + r.width / 2,
                y: r.top - cb.top + col.scrollTop + r.height / 2,
                r: r.height / 2,
            };
        };
        const rows = [...col.querySelectorAll('.tech-tree-row')]
            .map(row => [...row.querySelectorAll('.tech-tree-node[data-tid]')].map(boxOf))
            .filter(ns => ns.length);
        const segs = [];
        const push = (d, dim, from, to) =>
            segs.push(`<path class="tt-link${dim ? ' dim' : ''}" data-from="${from}" data-to="${to}" d="${d}"/>`);
        const n1 = (v) => v.toFixed(1);
        for (let i = 0; i + 1 < rows.length; i++) {
            const A = rows[i], B = rows[i + 1];
            // 아래 행이 통째로 잠겨 있으면 선을 흐리게 — 어디까지 열렸는지 골격만 봐도 보이게 한다
            const dim = B.every(n => !TechTree.isUnlocked(n.id));
            const yTop = Math.max(...A.map(n => n.y + n.r));   // 위 행 원들의 아래 테두리
            const yBot = Math.min(...B.map(n => n.y - n.r));   // 아래 행 원들의 위 테두리
            const yMid = (yTop + yBot) / 2;
            if (A.length === B.length) {
                // 같은 폭의 행끼리 — 열마다 세로 레일(열이 어긋나면 ㄱ자로 꺾어 내린다)
                A.forEach((a, k) => {
                    const c = B[k];
                    const d = Math.abs(a.x - c.x) < 0.5
                        ? `M${n1(a.x)} ${n1(a.y + a.r)} L${n1(a.x)} ${n1(c.y - c.r)}`
                        : `M${n1(a.x)} ${n1(a.y + a.r)} V${n1(yMid)} H${n1(c.x)} V${n1(c.y - c.r)}`;
                    push(d, dim, a.id, c.id);
                });
                continue;
            }
            // 폭이 다른 행끼리 — 가운데 높이에 가로 바를 놓고 위·아래를 그 바에 물린다(fork/converge).
            // 바에 고유 id를 주고 스텁이 그 id를 참조하게 해, 검증기가 '한 덩어리인지'를 그래프로 잴 수 있다.
            const bar = 'bar' + i;
            const xs = [...A, ...B].map(n => n.x);
            push(`M${n1(Math.min(...xs))} ${n1(yMid)} H${n1(Math.max(...xs))}`, dim, bar, bar);
            A.forEach(a => push(`M${n1(a.x)} ${n1(a.y + a.r)} V${n1(yMid)}`, dim, a.id, bar));
            B.forEach(c => push(`M${n1(c.x)} ${n1(yMid)} V${n1(c.y - c.r)}`, dim, bar, c.id));
        }
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('width', W);
        svg.setAttribute('height', H);
        svg.innerHTML = segs.join('');
    },
    // ---- ⓘ '총 보너스' 팝업 (사용자 지시 2026-08-17, 원본 스크린샷 제공) ----
    // 원본: 굵은 검정 제목 '총 보너스' + 세로 목록(부위별 한 줄) + 길면 스크롤 + 하단 중앙 빨간 X.
    // 수치는 저장하지 않고 매번 TechTree.totalBonuses()로 현재 연구 상태에서 계산한다.
    openTechBonuses() { this.renderTechBonuses(); this.showModal(this.els.detailModal); },
    renderTechBonuses() {
        const lines = TechTree.totalBonuses();
        const listHtml = lines.length
            ? lines.map(l => `<div class="tb-row"><span class="tb-label">${l.label}</span><span class="tb-val">${l.text}</span></div>`).join('')
            : `<p class="muted" style="text-align:center">아직 연구한 기술이 없습니다</p>`;
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper tb-card">
                    <h3 class="tb-title">총 보너스</h3>
                    <div class="tb-list">${listHtml}</div>
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">${IconGen.img('xmark')}</button>
            </div>`;
    },

    // 노드 팝업 (UI-SPEC 15~16번). 공용 상세 팝업 #detail-modal 재사용(공통 규칙) — 전용 모달 폐기.
    openTechNode(id) { this._techNode = id; this.renderTechNodeModal(); this.showModal(this.els.detailModal); },
    // 백그라운드 틱이 연구 완료로 이 노드 팝업을 다시 그려도 되는지 확인(다른 상세 팝업이 열려 있을 수 있음)
    isTechNodeOpen(id) {
        if (this.els.detailModal.classList.contains('hidden')) return false;
        const card = this.els.detailModal.querySelector('[data-tech-node]');
        return !!card && card.dataset.techNode === id;
    },
    renderTechNodeModal() {
        const id = this._techNode;
        const def = TechTree.def(id);
        const lv = TechTree.level(id);
        const max = TechTree.isMax(id);
        const researching = TechTree.researchingId() === id;
        const otherResearch = S.techResearch && !researching;
        const roman = TechTree.tierLabel(id);          // 노드가 속한 트리 단계 I~V
        const open = TechTree.isUnlocked(id);
        const unit = TechTree.unitOf(id);

        let actionHtml;
        if (max) {
            actionHtml = `<div class="idet-lead" style="text-align:center">연구 완료 (MAX)</div>`;
        } else if (!open) {
            // 선으로 이어진 부모 노드를 1레벨만 찍으면 열린다 — 아직 0레벨인 부모를 그대로 알려준다
            const need = TechTree.lockedBy(id).map(p => `${(TechTree.def(p) || {}).name || p} ${TechTree.roman(TechTree.tierOf(p))}단계`);
            const what = need.length > 1 ? `${need.join(' · ')}를 각각` : `${need[0] || '위 노드'}를`;
            actionHtml = `<button class="btn sm primary disabled">잠김</button>
                <p class="muted" style="text-align:center">${what} 1레벨 이상 올리면 열립니다</p>`;
        } else if (researching && TechTree.isDone()) {
            // 시간이 끝나도 레벨은 아직 안 올랐다 — 이 버튼을 눌러야 오른다 (사용자 지시 2026-08-19)
            actionHtml = `<div class="idet-lead" style="text-align:center">연구 시간 종료 — 수령 대기</div>
                <div class="upg-progress tech-prog"><div style="width:100%"></div><span>완료</span></div>
                <button class="btn sm primary tn-claim" onclick="UI.onTechClaim()">완료 · Lv.${lv} → Lv.${lv + 1}</button>`;
        } else if (researching) {
            const remain = (S.techResearch.endsAt - U.now()) / 1000;
            // 원본(042605): 남색 트랙+파란 채움 진행바 + [건너뛰기/◆N] 실버 블록.
            // 🚫 [취소] 는 없앴다 — 사용자 지시 2026-08-19 "연구 시작하면 취소 불가".
            // 급하면 건너뛰기(젬)로 시간만 줄인다. 건너뛰어도 레벨은 [완료] 를 눌러야 오른다.
            actionHtml = `<div class="idet-lead" style="text-align:center">연구 진행 중 <small class="muted">(취소 불가)</small></div>
                <div class="upg-progress tech-prog"><div id="tech-node-fill" style="width:${U.clamp(1 - remain / TechTree.time(id, lv + 1), 0, 1) * 100}%"></div><span id="tech-node-time">${U.fmtTime(remain)}</span></div>
                <div class="idet-btns tech-btns">
                    <button class="btn silver tn-skip" onclick="UI.onTechGemSkip()">건너뛰기<small>${IconGen.img('gem')} ${TechTree.gemSkipCost()}</small></button>
                </div>`;
        } else {
            const cost = TechTree.nextCost(id), time = TechTree.time(id, lv + 1);
            const disabled = otherResearch || S.potions < cost;
            actionHtml = `<button class="btn sm primary ${disabled ? 'disabled' : ''}" onclick="UI.onTechStart('${id}')">
                연구 시작 · ${IconGen.img('potion')} ${U.fmt(cost)} · ${IconGen.img('tm_hourglass')} ${U.fmtTime(time)}</button>
                ${otherResearch ? '<p class="muted" style="text-align:center">다른 연구가 진행 중입니다</p>' : ''}`;
        }

        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper item-detail${researching ? ' tn-researching' : ''}" data-tech-node="${id}">
                    <div class="idet-head">
                        <div class="idet-icon tn-bronze${!open && !max ? ' tn-dim' : ''}">${max ? IconGen.img('check') : this.techIcon(id)}<span class="idet-star">${lv}/${TechTree.MAX_LEVEL}</span></div>
                        <div class="idet-title">
                            <div class="idet-name">${def.name} <small class="tn-lv">${roman}단계 · Lv.${lv}/${TechTree.MAX_LEVEL}</small></div>
                            <div class="idet-main">+${U.fmt(TechTree.totalOf(id))}${unit} <small class="tn-gain">(${TechTree.gainNote()} +${U.fmt(def.per)}${unit} · 이 노드 +${U.fmt(TechTree.nodeTotal(id))}${unit})</small></div>
                        </div>
                    </div>
                    ${researching ? '' : `<div class="idet-subs">
                        <div class="idet-lead">${def.desc}</div>
                    </div>`}
                    ${actionHtml}
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">${IconGen.img('xmark')}</button>
            </div>`;
    },
    onTechStart(id) {
        if (TechTree.start(id)) { this.renderTechNodeModal(); this.renderTechBranchView(); this.renderTopBar(); }
        else this.toast('🧪 물약이 부족하거나 다른 연구가 진행 중입니다');
    },
    onTechGemSkip() {
        if (TechTree.gemSkip()) { this.renderTechNodeModal(); this.renderTechBranchView(); this.renderTopBar(); }
        else this.toast('💎 젬이 부족합니다');
    },
    // 🚫 onTechCancel 은 폐기했다 — 사용자 지시 2026-08-19 "연구 시작하면 취소 불가".
    // 대신 시간이 끝나면 이 [완료] 로만 레벨이 오르고, 그래야 다음 연구를 걸 수 있다.
    onTechClaim() {
        if (TechTree.claim()) { this.renderTechNodeModal(); this.renderTechTree(); this.renderTopBar(); }
    },
    // ---- 마운트 ----
    openMounts() {
        Mounts.ensure();
        const lvl = Mounts.level();
        const need = Mounts.nextNeeded();
        const prevNeed = Mounts.prevNeeded();
        const progress = need ? U.clamp((S.mountOpens - prevNeed) / (need - prevNeed), 0, 1) : 1;
        const rates = Mounts.rates();
        const ratesHtml = RARITIES.map(r =>   // 0% 등급도 표시 — 숨기는 건 자동 제련 팝업뿐 (사용자 재지시 2026-08-17)
            `<span class="prob-chip" style="--c:${RARITY_CSS[r]}">${RARITY_KR[r]} ${((rates[r] || 0) * 100).toFixed(2)}%</span>`).join('');
        const mountSummonN = this.summonMult('mount');

        // 원본 레이아웃 재작성 (사용자 지시): 펫/스킬 화면 동일 패턴 — 전체화면 흰 시트 + 중앙 제목 +
        // 태엽 pill + 사각 타일 그리드(내부 스크롤) + 하단 고정 공통 소환 바 + 빨간 X
        // 🔑 같은 종류를 여러 개 갖고 있을 수 있으므로 타일은 **개체 인덱스**로 연다(이름으로 열면 첫 개체만 열린다).
        const tiles = S.mounts.map((m, i) => {
            const active = Mounts.isActive(i);
            const name = m.name;
            return `<button class="pet-tile" style="--rc:${RARITY_CSS[m.rarity]}" onclick="UI.openMountDetail(${i})">
                <span class="tile-face">
                    ${UI.mountFace(name, 'mt-inline', m.rarity)}
                    ${active ? `<span class="sk-ribbon">${Mounts.riddenIdx() === i ? '탑승 중' : '장착됨'}</span>` : ''}
                    <span class="sk-lv">Lv.${m.level}</span>
                </span>
                ${m.stars ? `<span class="sk-star">${IconGen.img('star')}${m.stars}</span>` : ''}
            </button>`;
        }).join('') || '<span class="muted grid-empty">보유 탈것 없음 — 소환해보세요!</span>';

        this.els.mountModal.innerHTML = `
            <div class="modal-card sheet mount-sheet">
                <div class="sheet-head"><h2 class="sheet-title">탈것 ${Mounts.count()}/${Mounts.INV_CAP}</h2></div>
                <div class="mount-pill-row"><span class="cur-pill winder">${IconGen.img('winder')} ${U.fmt(S.winders || 0)}</span></div>
                <div class="grid-scroll"><div class="sk-grid">${tiles}</div></div>
                <div class="summon-bar">
                    <button class="btn danger round back-btn" onclick="UI.closeMounts()">${IconGen.img("tri_left")}</button>
                    <button class="btn xs x5-toggle ${mountSummonN > 1 ? 'on' : ''}" onclick="UI.cycleSummonMult('mount')">x${mountSummonN}</button>
                    ${Ascension.ready('mount')
                        ? `<button class="btn big summon-btn ascend-ready" onclick="UI.openAscension('mount')">${IconGen.img('star')} 승천 가능<small class="summon-cost">소환 Lv.MAX</small></button>`
                        : this.summonFull('mount')
                        ? this.summonFullBtnHTML('mount', 'UI.onSummonMount()')
                        : `<button class="btn big summon-btn ${Mounts.canSummon(mountSummonN) ? '' : 'disabled'}" onclick="UI.onSummonMount()">
                        소환 x${mountSummonN}<small class="summon-cost">${IconGen.img('winder')} <b>${Mounts.winderCost(mountSummonN)}</b></small></button>`}
                    <div class="summon-info">
                        <button class="info-dot" onclick="UI.openSummonRates('mount')">i</button>
                        <b>Lv. ${lvl}</b>
                        <span class="summon-gauge"><i style="width:${(progress * 100).toFixed(1)}%"></i><em>${need ? `${S.mountOpens - prevNeed}/${need - prevNeed}` : 'MAX'}</em></span>
                    </div>
                </div>
            </div>`;
        this.showModal(this.els.mountModal);
        this.hydrateMountThumbs();   // 탈것 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
    },
    // 탈것 상세 팝업 — 펫 상세와 동일 패턴 (타일 클릭 진입, 장착/해제·업그레이드·승천)
    openMountDetail(idx) {
        const m = Mounts.inst(idx);
        if (!m) return;
        const name = m.name;
        const active = Mounts.isActive(idx);
        const ridden = Mounts.riddenIdx() === idx;   // 같은 이름이 여럿이라 '이름 비교'로는 개체를 못 가린다
        const pw = Mounts.mountPower(m);
        const maxed = m.level >= Mounts.INDIV_MAX_LEVEL;
        const subsHtml = (m.subs || []).map(s => U.subText(s)).join('<br>');
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper petd-card">
                    <div class="petd-head">
                        <div class="petd-tilecol">
                            <div class="petd-tile" style="--rc:${RARITY_CSS[m.rarity]}">
                                ${UI.mountFace(name, 'mt-inline', m.rarity)}
                                ${active ? `<span class="sk-ribbon">${ridden ? '탑승 중' : '장착됨'}</span>` : ''}
                                <span class="sk-lv">Lv.${m.level}</span>
                            </div>
                            ${m.stars ? `<span class="sk-star">${IconGen.img('star')}${m.stars}</span>` : ''}
                        </div>
                        <div class="petd-body">
                            <div class="petd-name" style="color:${UI.inkRarity(RARITY_CSS[m.rarity])}">[${RARITY_KR[m.rarity]}] ${MOUNT_KR[name] || name}</div>
                            <div class="petd-stats">${U.fmt(pw.atk)} 피해<br>${U.fmt(pw.hp)} 체력</div>
                            <!-- 중복은 이제 숫자(dupes)가 아니라 **개체**다(2026-08-19 인벤 개편) —
                                 같은 종류를 몇 개 갖고 있는지 알려 주는 게 그 자리를 대신한다. -->
                            <div class="petd-subs">${subsHtml || '옵션 없음'}<br><span class="muted">같은 종류 보유 ${S.mounts.filter(x => x.name === name).length}개</span></div>
                        </div>
                    </div>
                    <div class="petd-btns">
                        ${maxed
                            ? `<button class="btn primary petd-btn disabled">업그레이드<small>Lv.${Mounts.INDIV_MAX_LEVEL} 만렙</small></button>`
                            : `<button class="btn primary petd-btn" onclick="UI.closeDetail(); UI.openMountUpgrade(${idx})">업그레이드</button>`}
                        ${active && !ridden ? `<button class="btn petd-btn primary" onclick="UI.onRideMount(${idx}); UI.openMountDetail(${idx})">타기</button>` : ''}
                        <button class="btn petd-btn ${active ? 'danger' : 'primary'}" onclick="UI.onEquipMount(${idx}); UI.openMountDetail(${idx})">${active ? '해제' : '장착'}</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">${IconGen.img('xmark')}</button>
            </div>`;
        this.showModal(this.els.detailModal);
        this.hydrateMountThumbs();   // 탈것 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
    },
    closeMounts() { this.els.mountModal.classList.add('hidden'); },
    onSummonMount() {
        const count = this.summonMult('mount');
        const r = Mounts.summon(count);
        if (!r) {
            this.toast(Mounts.space() < 1
                ? `🐴 탈것 보관함이 가득 찼습니다 (${Mounts.count()}/${Mounts.INV_CAP})`
                : '⚙️ 태엽이 부족합니다 (스테이지 클리어로 획득)');
            return;
        }
        this.keepScroll(() => this.openMounts()); this.renderTopBar(); this.renderEquipSheet();
        this._srRepeat = () => this.onSummonMount(); // x1 [다시 소환]
        this.openSummonResult('mount', r.results); // 결과는 토스트 대신 전용 연출 팝업으로 보여준다
    },
    onEquipMount(idx) { if (Mounts.equip(idx)) { this.keepScroll(() => this.openMounts()); this.renderEquipSheet(); } },
    // 장착 탈것이 여러 마리일 때 '어느 놈에 올라탈지' 고르기 (몸은 하나라 탑승은 1마리뿐)
    onRideMount(idx) { if (Mounts.setRidden(idx)) { this.keepScroll(() => this.openMounts()); this.renderEquipSheet(); } },

    // 마운트 업그레이드 팝업 (펫 업그레이드와 동일 방식): 다른 탈것을 재료로 흡수해 경험치로 레벨업
    _mountUpgradeTarget: null, _mountUpgradeMats: null,
    // 펫 쪽과 **같은 뿌리·같은 처방** (upgrade-modal-empty-guard) — 위 `openPetUpgrade` 주석 참조.
    // 탈것은 `z-index` 가 낮아 탭바로 빠져나갈 수는 있었지만, 빈 딤이 뜨는 것 자체는 똑같았다.
    openMountUpgrade(idx) {
        this._mountUpgradeTarget = idx;
        this._mountUpgradeMats = [];
        if (!this.renderMountUpgrade()) { this.toast('업그레이드할 탈것이 없습니다'); return; }
        this.showModal(this.els.mountUpgradeModal);
    },
    closeMountUpgrade() { this.els.mountUpgradeModal.classList.add('hidden'); },
    renderMountUpgrade() {
        const idx = this._mountUpgradeTarget;
        const target = Mounts.inst(idx);
        if (!target) {
            console.warn('renderMountUpgrade: 대상 탈것이 없다 — 팝업을 열지 않는다 (idx:', idx, '보유:', Mounts.count(), ')');
            this.closeMountUpgrade();
            return false;
        }
        const name = target.name;
        const sel = this._mountUpgradeMats;
        const need = Mounts.xpNeeded(target.level);
        const maxed = target.level >= Mounts.INDIV_MAX_LEVEL;

        // 🔑 재료도 **개체 인덱스**다 — 같은 이름이 여럿이라 이름으로 고르면 어느 개체가 사라질지 알 수 없다.
        const matChips = S.mounts.map((m, i) => ({ m, i })).filter(x => x.i !== idx).map(({ m, i }) => `
            <button class="mat-chip ${sel.includes(i) ? 'on' : ''} ${Mounts.isActive(i) ? 'active' : ''}" style="--rc:${RARITY_CSS[m.rarity]}" onclick="UI.onToggleMountUpgradeMat(${i})">
                ${UI.mountFace(m.name, 'mt-inline', m.rarity, m.stars)}<small>Lv.${m.level}${m.stars ? ` ${IconGen.img('star')}${m.stars}` : ''}</small>
            </button>`).join('');

        const previewXp = sel.map(i => Mounts.inst(i)).filter(Boolean)
            .reduce((sum, m) => sum + Mounts.xpValue(m.rarity) * Mounts.levelMult(m), 0);

        this.els.mountUpgradeModal.innerHTML = `
            <div class="modal-card wide">
                <h3>${MOUNT_KR[name] || name} 업그레이드</h3>
                <div class="row">
                    <span class="cell-img emoji" style="width:2.4rem;height:2.4rem;font-size:1.25rem;border-radius:50%;border-color:${RARITY_CSS[target.rarity]}">${UI.mountFace(name, 'mt-inline', target.rarity)}</span>
                    <div>
                        <div class="item-name">Lv.${target.level}${target.stars ? ` ${IconGen.img('star')}${target.stars}` : ''}</div>
                        <div class="muted">${maxed ? '만렙' : `경험치 ${U.fmt(target.xp || 0)}/${U.fmt(need)}${previewXp ? ` (+${U.fmt(previewXp)} 예정)` : ''}`}</div>
                    </div>
                </div>
                <p class="muted">합칠 다른 탈것 선택 (최대 5개, 재료는 흡수되어 사라집니다)</p>
                <div class="mat-grid">${matChips || '<span class="muted mat-empty">재료로 쓸 다른 탈것이 없습니다</span>'}</div>
                <button class="btn primary ${sel.length && !maxed ? '' : 'disabled'}" onclick="UI.onConfirmMountUpgrade()">업그레이드</button>
                <button class="btn" onclick="UI.closeMountUpgrade()">닫기</button>
            </div>`;
        this.hydrateMountThumbs();   // 탈것 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
        return true;
    },
    onToggleMountUpgradeMat(idx) {
        const sel = this._mountUpgradeMats;
        const pos = sel.indexOf(idx);
        if (pos >= 0) sel.splice(pos, 1);
        else if (sel.length < 5) sel.push(idx);
        this.renderMountUpgrade();
    },
    onConfirmMountUpgrade() {
        const idx = this._mountUpgradeTarget;
        const target = Mounts.inst(idx);
        if (target && target.level >= Mounts.INDIV_MAX_LEVEL) { this.toast('만렙입니다 — 승천을 이용하세요'); return; }
        const sel = this._mountUpgradeMats;
        if (!sel.length || !target) return;
        const name = target.name;
        // ⚠️ 재료를 지우면 뒤 인덱스가 당겨져 **대상 인덱스도 움직인다** — absorbMaterials 가 보정한 값을 받아
        //    _mountUpgradeTarget 을 갱신하지 않으면 다음 렌더가 엉뚱한 개체를 연다.
        const newIdx = idx - sel.filter(i => i < idx).length;
        if (!Mounts.absorbMaterials(idx, sel)) return;
        this._mountUpgradeTarget = newIdx;
        this.toast(`✨ ${MOUNT_KR[name] || name} Lv.${(Mounts.inst(newIdx) || target).level}!`);
        this._mountUpgradeMats = [];
        this.renderMountUpgrade();
        this.keepScroll(() => this.openMounts()); // 재료로 소모된 마운트가 뒤에 깔린 목록에서도 즉시 사라지도록 (펫 플로우와 동일 패턴)
        this.renderTopBar();
    },

    // ---- 승천(별) ----
    // 승천 팝업 — 라인(장비/스킬/펫/탈것) 단위 프레스티지 (사용자 확정 2026-08-17).
    // line을 주면 그 라인 확인 팝업, 없으면 4라인 개요.
    openAscension(line) {
        Ascension.ensure();
        this._ascendLine = line || null;
        const b = Ascension.starBreakdown();
        const rowsHtml = Ascension.LINES.map(l => {
            const p = Ascension.progress(l), rdy = Ascension.ready(l);
            const label = l === 'forge' ? `대장간 Lv.${p.cur}/${p.max}` : `소환 Lv.${p.cur}/${p.max}`;
            // 조건을 채운 행은 **탭하면 그 라인 확인 팝업으로 들어간다**(QA 11차 버그). 예전에는 `ready`
            // 클래스만 붙은 죽은 <div>라, 개요를 보고도 승천할 방법이 없었다 — 라인별 진입 버튼(소환 화면
            // ⭐승천 가능·대장간 정보 팝업)을 못 찾으면 개요가 막다른 길이 된다. 여기서 네 라인을 한 번에 연다.
            return `<div class="asc-row ${rdy ? 'ready' : ''}"${rdy ? ` onclick="UI.openAscension('${l}')"` : ''}>
                <span class="asc-name">${this.ascIcon(l)} ${Ascension.LINE_KR[l]}</span>
                <span class="asc-prog">${label}</span>
                <span class="asc-cnt">${Ascension.count(l) ? `${IconGen.img('star')}${Ascension.count(l)}` : '—'}</span>
            </div>`;
        }).join('');

        let bodyHtml;
        if (line) {
            const p = Ascension.progress(line), next = Ascension.count(line) + 1;
            const resetKr = line === 'forge' ? '대장간 레벨이 1로 초기화' : '소환 레벨이 1로 초기화';
            bodyHtml = `
                <div class="asc-focus">
                    <div class="asc-focus-icon">${this.ascIcon(line)}</div>
                    <div class="asc-focus-title">${Ascension.LINE_KR[line]} 승천</div>
                    <div class="asc-focus-cnt">현재 승천 ${Ascension.count(line)}회 → <b>${next}회</b></div>
                    <div class="asc-focus-eff">
                        · ${resetKr}됩니다<br>
                        <span class="asc-wipe-warn">· ⚠️ 보유 중인 기존 ${Ascension.LINE_KR[line]}${line === 'forge' ? '(착용 장비 전부)' : line === 'pet' ? '(출전 포함, 알은 유지)' : '(장착 포함)'}가 <b>전부 사라집니다</b></span><br>
                        · 이후 새로 ${line === 'forge' ? '제작되는 장비' : '소환되는 ' + Ascension.LINE_KR[line]}가 <b>${IconGen.img('star')}${next}</b>로 나옵니다
                    </div>
                </div>
                <div class="asc-btns">
                    <button class="btn primary ${Ascension.ready(line) ? '' : 'disabled'}" onclick="UI.onAscendLine('${line}')">${IconGen.img('star')} 승천</button>
                    <button class="btn" onclick="UI.closeAscension()">취소</button>
                </div>`;
        } else {
            bodyHtml = `<div class="asc-btns"><button class="btn" onclick="UI.closeAscension()">닫기</button></div>`;
        }

        this.els.ascendModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper asc-card">
                    <h3>${IconGen.img('star')} 승천 <small class="muted">보유 별 합계 ${IconGen.img('star')} ${b.gear + b.skill + b.pet + b.mount}</small></h3>
                    <p class="muted">라인마다 조건을 채우면 그 라인을 승천시킵니다 — 승천 횟수만큼 <b>이후 획득물</b>에 별이 붙습니다.</p>
                    ${rowsHtml}
                    ${bodyHtml}
                </div>
                <button class="x-btn" onclick="UI.closeAscension()">${IconGen.img('xmark')}</button>
            </div>`;
        this.showModal(this.els.ascendModal);
    },
    onAscendLine(line) {
        if (!Ascension.ready(line)) { this.toast('⭐ 아직 승천 조건을 채우지 못했습니다'); return; }
        if (!Ascension.ascend(line)) { this.toast('⭐ 승천에 실패했습니다'); return; }
        this.toast(`⭐ ${Ascension.LINE_KR[line]} 승천! 이후 획득물이 ⭐${Ascension.count(line)}로 나옵니다`);
        Combat.recalcHero();
        this.closeAscension();
        // 지표가 초기화됐으므로 관련 화면을 즉시 갱신
        this.renderTopBar();
        if (line === 'forge' && !this.els.forgeInfoModal.classList.contains('hidden')) this.renderForgeInfo();
        if (line === 'skill') this.renderSkills();
        if (line === 'pet') this.renderPets();
        if (line === 'mount' && !this.els.mountModal.classList.contains('hidden')) this.keepScroll(() => this.openMounts());
    },
    closeAscension() { this.els.ascendModal.classList.add('hidden'); },

    showOffline(o) {
        this.els.offlineModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card offline-card">
                    <div class="offline-top">
                        <div class="offline-title">오프라인 보상</div>
                        <div class="offline-sub">수집 시간: <b id="offline-counted">${U.fmtTime(o.counted)}</b><span id="offline-max">${o.elapsed > o.counted ? ' (최대)' : ''}</span></div>
                        <div class="offline-rates">
                            <div class="offline-rate"><span class="offline-rate-icon coin">${IconGen.img('coin')}</span><b>${U.fmtDec(o.coinRate)}/초</b></div>
                            <div class="offline-rate"><span class="offline-rate-icon hammer">${IconGen.img('hammer')}</span><b>${U.fmtDec(o.hammerRate)}/분</b></div>
                        </div>
                    </div>
                    <div class="offline-bottom">
                        <div class="offline-total">${IconGen.img('coin')} <span id="offline-coins">${U.fmt(o.coins)}</span> &nbsp; ${IconGen.img('hammer')} <span id="offline-hammers">${U.fmt(o.hammers)}</span></div>
                        <button class="btn primary offline-collect-btn" onclick="UI.onCollectOffline()">수집<span class="offline-collect-dot"></span></button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeOfflineModal()">${IconGen.img('xmark')}</button>
            </div>`;
        this.showModal(this.els.offlineModal);
    },
    // 켜둔 채로도 누적이 자라므로 매 초 갱신하되, **팝업 전체를 다시 그리지 않고 숫자 span 만** 바꾼다
    // (slug: offline-collect-tick-rerender). 종전엔 tickSecond 가 showOffline 을 다시 불러 [수집]
    // 버튼 노드까지 매초 새로 만들었고, 그 사이 눌린 클릭이 옛 노드로 가 ~1.7% 씩 씹혔다 —
    // updateAnvilCounter 와 같은 '숫자만 텍스트 갱신' 처방. 팝업이 아직 안 그려졌으면(id 없음)
    // 최초 1회만 showOffline 으로 채운다.
    updateOfflineValues(o) {
        const counted = document.getElementById('offline-counted');
        if (!counted) { this.showOffline(o); return; }
        counted.textContent = U.fmtTime(o.counted);
        const max = document.getElementById('offline-max');
        if (max) max.textContent = o.elapsed > o.counted ? ' (최대)' : '';
        const coins = document.getElementById('offline-coins');
        if (coins) coins.textContent = U.fmt(o.coins);
        const hammers = document.getElementById('offline-hammers');
        if (hammers) hammers.textContent = U.fmt(o.hammers);
    },
    // X로 닫기 = 단순 닫힘. 보상은 그대로 남아 버튼으로 언제든 다시 열 수 있다 (사용자 지시 2026-08-17)
    closeOfflineModal() { this.els.offlineModal.classList.add('hidden'); },

    // 오프라인 버튼: 미수집 누적분을 '미리보기'로 연다 (여는 것만으로는 지급되지 않음)
    onClaimOffline() {
        const r = pendingOffline();
        if (!r) { this.toast('💤 아직 누적된 오프라인 보상이 없습니다'); return; }
        this.showOffline(r);
    },

    // [수집]에서만 실제 지급 + 누적 리셋
    onCollectOffline() {
        const r = claimOfflineNow();
        if (!r) { this.toast('💤 아직 누적된 오프라인 보상이 없습니다'); this.closeOfflineModal(); return; }
        // 수령 연출은 팝업을 닫기 전에 — 시작점([수집] 버튼)의 좌표는 호출 시점에 잡히고,
        // 연출 레이어(z-70)는 닫히는 팝업 위에서 그대로 이어진다
        this.rewardBurst({ coins: r.coins, hammers: r.hammers }, { from: this.els.offlineModal.querySelector('.offline-collect-btn') });
        this.closeOfflineModal();
        // 토스트 없음 — 수령 연출의 '+획득량' 라벨이 같은 정보를 말한다(reward-claim-fx)
        this.els.offlineBtn.classList.remove('ready');
        this.renderTopBar();
        this.renderEquipSheet(); // 해머 수가 제작 화면에도 바로 반영되게
        saveGame();
    },

    // ---- 디버그 탭 (출시용 아님, 테스트 전용 — 항상 노출) ----
    // 라벨을 '이모지+글자' 한 덩어리로 두면 아이콘으로 못 바꾼다 — 아이콘 키와 글자를 나눠 둔다.
    DEBUG_CURRENCIES: [
        { key: 'hammers', ico: 'hammer', kr: '해머' },
        { key: 'coins', ico: 'coin', kr: '코인' },
        { key: 'gems', ico: 'gem', kr: '젬' },
        { key: 'tickets', ico: 'ticket', kr: '티켓' },
        { key: 'winders', ico: 'winder', kr: '태엽' },
        { key: 'potions', ico: 'potion', kr: '물약' },
        { key: 'eggCurrency', ico: 'egg', kr: '깨진 알' },
    ],
    // 표시 이름은 **여기 한 곳에서만** 꺼낸다. 버튼은 `c.kr` 을 직접 읽고 토스트는 `c.label` 을
    // 읽는 식으로 갈라져 있어서, 데이터 필드가 `label` → `kr` 로 바뀌었을 때 버튼만 멀쩡하고
    // 토스트에는 내부 키(`eggCurrency`)가 그대로 샜다(같은 버그가 두 번 났다).
    // 라벨이 없으면 조용히 키로 떨어지지 말고 콘솔에 남긴다 — 안 그러면 또 못 보고 지나간다.
    debugCurrencyLabel(key) {
        const c = this.DEBUG_CURRENCIES.find(c => c.key === key);
        if (!c || !c.kr) { console.warn(`[debug] 재화 '${key}' 의 한글 라벨(kr)이 없다 — DEBUG_CURRENCIES 를 확인할 것`); return key; }
        return c.kr;
    },
    renderDebug() {
        if (this.activeTab !== 'debug') return;
        const p = this.els.panels.debug;
        const curHtml = this.DEBUG_CURRENCIES.map(c =>
            `<button class="btn sm" onclick="UI.onDebugAddCurrency('${c.key}')">${IconGen.img(c.ico, 'lbl-ico')}${this.debugCurrencyLabel(c.key)} +100000</button>`).join('');
        const keysHtml = Dungeons.DEFS.map(d =>
            `<span class="prob-chip">${this.dgIcon(d)} ${S.dungeons ? (S.dungeons.keys[d.id] ?? '-') : '-'}/${Dungeons.MAX_KEYS}</span>`).join('');
        p.innerHTML = `
            <h2>${IconGen.img('tab_debug', 'lbl-ico')}디버그 <span class="muted">테스트 전용</span></h2>
            <h3>스테이지 이동 <span class="muted">${this.stageName()}</span></h3>
            <div class="row">
                <select id="dbg-difficulty" style="width:7rem">${DIFFICULTY_NAMES.map((n, i) =>
                    `<option value="${i}" ${i === S.difficulty ? 'selected' : ''}>${i === 0 ? '기본 순환' : n}</option>`).join('')}</select>
                <input type="number" id="dbg-chapter" value="${S.chapter}" min="1" max="${CHAPTERS_PER_CYCLE}" style="width:4rem">
                <span class="muted">-</span>
                <input type="number" id="dbg-stage" value="${S.stage}" min="1" max="10" style="width:4rem">
                <button class="btn primary sm" onclick="UI.onDebugGoStage()">이동</button>
            </div>
            <div class="row">
                <button class="btn sm" onclick="UI.onDebugStageStep(-1)">◀ 이전 스테이지</button>
                <button class="btn sm" onclick="UI.onDebugStageStep(1)">다음 스테이지 ▶</button>
            </div>
            <h3>재화 지급</h3>
            <div class="row wrap">${curHtml}</div>
            <div class="row">
                <button class="btn sm" onclick="UI.onDebugEggs()">${IconGen.img('egg', 'lbl-ico')}신화 알 +5</button>
            </div>
            <h3>대장간</h3>
            <div class="row">
                <span class="muted">현재 Lv.${S.forgeLevel} / 35</span>
                <button class="btn sm primary" onclick="UI.onDebugForgeLevelUp()">Lv +1</button>
            </div>
            <h3>던전 열쇠 <span class="muted">${keysHtml}</span></h3>
            <div class="row">
                <button class="btn sm primary" onclick="UI.onDebugRefillKeys()">모든 열쇠 리필</button>
            </div>`;
    },
    onDebugEggs() {
        for (let i = 0; i < 5; i++) Pets.addEgg('mythic');
        this.toast('🥚 신화 알 +5');
        this.renderPets();
        saveGame();
    },
    onDebugGoStage() {
        const t = U.clamp(parseInt(document.getElementById('dbg-difficulty').value) || 0, 0, MAX_DIFFICULTY);
        const c = U.clamp(parseInt(document.getElementById('dbg-chapter').value) || 1, 1, CHAPTERS_PER_CYCLE);
        const s = U.clamp(parseInt(document.getElementById('dbg-stage').value) || 1, 1, 10);
        this.debugSetStage(t, c, s);
        this.toast(`📍 ${this.stageName()}로 이동`);
    },
    // 스테이지 스텝은 사이클 경계를 실제 전진과 **같은 규칙**으로 넘는다 —
    // 25-10 다음이 다음 티어의 1-1, 티어 1의 1-1 이전이 티어 0의 25-10 (chapter-cycle-difficulty 검증용).
    onDebugStageStep(dir) {
        let t = S.difficulty, c = S.chapter, s = S.stage + dir;
        if (s < 1) {
            if (c > 1) { c--; s = 10; }
            else if (t > 0) { t--; c = CHAPTERS_PER_CYCLE; s = 10; }
            else s = 1;
        }
        if (s > 10) {
            if (c < CHAPTERS_PER_CYCLE) { c++; s = 1; }
            else if (t < MAX_DIFFICULTY) { t++; c = 1; s = 1; }
            else s = 10;
        }
        this.debugSetStage(t, c, s);
    },
    debugSetStage(t, c, s) {
        S.difficulty = t; S.chapter = c; S.stage = s;
        if (curRank() > bestRank()) { S.bestDifficulty = t; S.bestChapter = c; S.bestStage = s; }
        Dungeons.run = null;
        Combat.setupStage();
        this.updateStageLabel(); this.renderDebug(); saveGame();
    },
    onDebugAddCurrency(key) {
        S[key] = (S[key] || 0) + 100000;
        this.renderTopBar(); this.updateAnvilCounter(); this.renderDebug(); saveGame();
        this.toast(`${this.debugCurrencyLabel(key)} +100000`);
    },
    onDebugForgeLevelUp() {
        S.forgeLevel = Math.min(35, S.forgeLevel + 1);
        Combat.recalcHero();
        this.renderTopBar(); this.renderDebug();
        this.renderEquipSheet();
        saveGame();
        this.toast(`⚒️ 대장간 Lv.${S.forgeLevel}`);
    },
    onDebugRefillKeys() {
        Dungeons.ensure();
        for (const d of Dungeons.DEFS) S.dungeons.keys[d.id] = Dungeons.MAX_KEYS;
        this.renderDebug(); saveGame();
        this.toast('🗝 던전 열쇠 리필 완료');
    },

    // 스테이지 도달 해금(UNLOCKS)은 전투 쪽(Combat.stageClear)에서 일어나는데 그 경로가 장비 시트를
    // 다시 그리지 않아, 2-10을 클리어해도 [자동🔄] 버튼이 🔒 잠김 표시로 남아 있었다 (QA 9차).
    // 매 초 해금 상태를 비교해 **바뀐 순간에만** 다시 그린다 — 매 초 renderEquipSheet는 과하다.
    syncUnlockBadges() {
        if (!this._unlockSeen) this._unlockSeen = {};
        let opened = null;
        UNLOCKS.forEach(u => {
            const now = isUnlocked(u.key);
            const prev = this._unlockSeen[u.key];
            this._unlockSeen[u.key] = now;
            if (prev !== undefined && prev !== now && now) opened = u;  // 첫 틱은 기준값만 잡는다(부팅 토스트 방지)
        });
        if (!opened) return;
        this.renderEquipSheet();  // 현재 UNLOCKS 표시는 전부 장비 시트 안에 있다 (autoForge = 자동🔄 버튼)
        this.toast(`🔓 ${opened.name} 해금!`);
    },

    // 매초 갱신 (타이머류)
    tickSecond() {
        this.renderTopBar();
        this.updateAnvilCounter(); // 킬 드랍·분당 수급으로 계속 변하는 해머 보유량 (QA: 정적 문자열이라 안 갱신되던 버그)
        this.syncUnlockBadges();   // 해금 즉시 잠금 배지 해제 (QA 9차: 해금돼도 🔒로 남던 버그)
        this.els.offlineBtn.classList.toggle('ready', (U.now() - S.lastOfflineClaim) / 1000 >= 60);
        // 켜둔 채로도 누적이 자라므로, 열려 있는 오프라인 팝업의 수치를 매 초 갱신한다 (사용자 지시 2026-08-17)
        if (!this.els.offlineModal.classList.contains('hidden')) {
            const p = pendingOffline();
            if (p) this.updateOfflineValues(p);   // 숫자 span 만 갱신 — 버튼 노드를 매초 갈지 않는다(offline-collect-tick-rerender)
        }
        // 대장간 업그레이드 카운트다운 (장비 시트 버튼 + 확률 정보 팝업 진행바)
        if (S.forgeUpgradeEndsAt) {
            const remain = (S.forgeUpgradeEndsAt - U.now()) / 1000;
            const sheetTime = document.getElementById('equip-upg-time');
            if (sheetTime) sheetTime.textContent = U.fmtTime(remain);
            const fill = document.getElementById('upg-fill'), popupTime = document.getElementById('upg-time');
            if (fill) {
                const info = Forge.upgradeInfo();
                if (info) fill.style.width = U.clamp(1 - remain / Forge.upgradeTime(info), 0, 1) * 100 + '%';
            }
            if (popupTime) popupTime.textContent = U.fmtTime(remain);
        }
        // 부화 타이머
        S.hatching.forEach((h, i) => {
            const el = document.getElementById('hatch-t-' + i);
            if (el) el.textContent = U.fmtTime((h.endsAt - U.now()) / 1000);
        });
        // 기술 트리 연구 카운트다운 (개요 카드 / 분기 트리 노드 / 노드 팝업 진행바)
        // 노드 개편 등으로 없는 노드 id가 남아 있으면 branchOf가 undefined라 매 초 예외가 난다 — 가드
        // 시간이 끝난 뒤(수령 대기)에는 카운트다운을 멈춘다 — 안 그러면 음수 시간이 계속 흐른다.
        // 그 상태의 표시는 renderTechTree/renderTechNodeModal 이 '완료!' 로 이미 바꿔 놓았다.
        if (S.techResearch && TechTree.def(S.techResearch.id) && !TechTree.isDone()) {
            const remain = (S.techResearch.endsAt - U.now()) / 1000;
            const branch = TechTree.branchOf(S.techResearch.id);
            const bTime = branch && document.getElementById('tech-b-time-' + branch.id);
            if (bTime) bTime.textContent = `(${U.fmtTime(remain)})`;
            const nTime = document.getElementById('tech-n-time-' + S.techResearch.id);
            if (nTime) nTime.textContent = U.fmtTime(remain);
            const fill = document.getElementById('tech-node-fill'), popupTime = document.getElementById('tech-node-time');
            if (fill) fill.style.width = U.clamp(1 - remain / TechTree.time(S.techResearch.id, TechTree.level(S.techResearch.id) + 1), 0, 1) * 100 + '%';
            if (popupTime) popupTime.textContent = U.fmtTime(remain);
        }
        // 맵 위 이정표 오브젝트 카운트다운 (UI-SPEC 1번)
        // (리그 보상 이정표는 삭제됐다 — 사용자 지시 2026-08-19 "메인 왼쪽 랭킹 버튼 없애기".
        //  시즌 남은 시간은 PVP 탭 리그 시트의 시즌 바가 그대로 보여준다.)
        const mt = document.getElementById('waypoint-mystery-time');
        if (mt) mt.textContent = U.fmtTime(this.msUntilDailyReset() / 1000);
    },

    // 맵 위 이정표 아이콘 — `index.html` 은 정적 파일이라 IconGen 을 못 부른다.
    // 부팅 때 한 번 여기서 채운다(아이콘이 없으면 원래 이모지가 그대로 남는다).
    // 원본(shot-042120 8배): 미스터리 = 갈색 통나무 위 초록 덩어리 생물 + 머리 위 흰 `?` /
    // 진행 패스 = 교차 검. (리그 = 회색 시상대 3단 + 주황 왕관 이었는데, 그 '시상대+왕관'이
    // 곧 랭킹 버튼으로 읽혀 사용자 지시 2026-08-19 로 메인에서 삭제했다 — `wp_league` 드로어도 함께 폐기.)
    WP_ICON: { 'waypoint-mystery': 'wp_mystery', 'waypoint-pass': 'power' },
    paintWaypointIcons() {
        for (const id in this.WP_ICON) {
            const box = document.querySelector('#' + id + ' .waypoint-icon');
            const html = IconGen.img(this.WP_ICON[id]);
            if (box && html) box.innerHTML = html;
        }
        // 오프라인 버튼의 상자도 index.html 에 박힌 정적 이모지 자리다(전 화면에 떠 있어서 제일 눈에 띈다).
        // 정적 마크업에서는 IconGen 을 부를 수 없으니 부팅 때 여기서 갈아 끼운다.
        // ⚠️ 버튼 innerHTML 을 통째로 갈면 zzz 연출 <span> 이 날아간다 — **.ob-chest 안만** 교체한다.
        const chestBox = document.querySelector('#offline-btn .ob-chest');
        const chest = IconGen.img('chest');
        if (chestBox && chest) chestBox.innerHTML = chest;
    },

    // 게임이 만든 문구(보상 표기 등)를 innerHTML 자리에 넣을 때, 표에 있는 이모지만 아이콘으로 바꾼다.
    // 토스트는 노드를 직접 쌓아 같은 일을 하는데(`toast`), 그쪽은 닉네임·장비명이 섞여 들어와
    // innerHTML 을 못 쓴다. 여기는 반대로 **이미 innerHTML 로 들어가는 자리**라 문자열을 돌려준다 —
    // 대신 이모지가 아닌 부분은 전부 escape 해서 문자열이 마크업으로 해석되지 않게 한다.
    iconizeHTML(msg) {
        const cp = Array.from(String(msg));
        let out = '', buf = '';
        const flush = () => { if (buf) { out += U.escapeHtml(buf); buf = ''; } };
        for (let i = 0; i < cp.length;) {
            const two = cp[i] + (cp[i + 1] || ''), one = cp[i];
            const key = this.TOAST_ICON[two] ? two : (this.TOAST_ICON[one] ? one : '');
            if (!key) { buf += cp[i]; i++; continue; }
            flush();
            out += IconGen.img(this.TOAST_ICON[key]);
            i += Array.from(key).length;
            if (cp[i] === '\uFE0F') i++;   // 이형 선택자가 남으면 보이지 않는 문자가 섞인다(토스트와 같은 처리)
        }
        flush();
        return out;
    },

    // 매일 09:00 기준 다음 리셋까지 남은 ms — 미스터리 상자는 실제 배경 기능이 없어 기존 09:00 리셋(던전 열쇠 등)에 동기화한 자체 설계 카운트다운
    msUntilDailyReset() {
        const next = new Date(); next.setHours(9, 0, 0, 0);
        if (next <= new Date()) next.setDate(next.getDate() + 1);
        return next - Date.now();
    },
    onWaypointMystery() { this.openStub('미스터리 상자', '특별 이벤트 상자는 준비 중입니다.', 'wp_mystery'); },
};

/* 캡처 하네스 지원(state.js 주석 참고): 렉시컬 전역을 window에도 노출 — Playwright 격리 컨텍스트용 */
window.UI = UI;
