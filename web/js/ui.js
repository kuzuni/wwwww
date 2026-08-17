// ===== UI: 탭/패널/HUD/모달/토스트 =====
const UI = {
    els: {},
    activeTab: null,
    _pendingItem: null,
    // 소환 배수 4단 순환 (사용자 지시: x1→x5→x25→x75) — 스킬·펫·탈것 공통, S.summonMult에 저장돼 재접속 유지
    SUMMON_MULTS: [1, 5, 25, 75],
    summonMult(kind) { return (S && S.summonMult && S.summonMult[kind]) || 1; },
    cycleSummonMult(kind) {
        S.summonMult = S.summonMult || {};
        const cur = this.summonMult(kind);
        S.summonMult[kind] = this.SUMMON_MULTS[(this.SUMMON_MULTS.indexOf(cur) + 1) % this.SUMMON_MULTS.length];
        saveGame();
        if (kind === 'skill') this.renderSkills();
        else if (kind === 'pet') this.renderPets();
        else this.keepScroll(() => this.openMounts());   // 이미 열린 목록 재렌더 — 스크롤 유지
    },

    // ===== 소환 결과 연출 팝업 (스킬·펫·탈것 공용) =====
    // 원본 구성: 어두운(남색/검정) 풀스크린 오버레이 위에 뽑힌 항목을 등급색 원형 아이콘으로 나열.
    // 연출: ① 빛 모임 플래시+충격파(기대감) → ② 아이콘이 등급 오름차순으로 하나씩 팝(스케일 바운스,
    // 고등급은 등급색 광채+회전 광선) → ③ 최고 등급은 한 박자 늦게 홀드백 등장 + 화면 플래시
    // → ④ 등급별 집계 + [확인]. 탭하면 스킵(전부 즉시 표시), 완료 상태에서 탭하면 닫힘.
    // 대량 소환(x25/x75)은 같은 항목을 한 셀로 묶고 수량 배지를 달아 색점 나열이 되지 않게 한다.
    SUMMON_KIND: {
        skill: { title: '스킬 소환', icon: '🎫' },
        pet: { title: '펫 소환', icon: '🥚' },
        mount: { title: '탈것 소환', icon: '⚙️' },
    },
    SUMMON_DUP_LABEL: { skill: '조각', mount: '재료' }, // 중복분 적립 환산 표기 (펫은 알 단위라 없음)
    SR_HI_RARITIES: ['legendary', 'ultimate', 'mythic'], // 광채 강조 대상
    SR_REVEAL_BUDGET: 2200, // 셀이 많을 때 전체 등장 연출이 넘지 않을 시간(ms)
    SR_SLOW_STEP: 250,      // 10개 이하 소량 뽑기의 셀 간격 — 캐스케이드가 눈에 보이게 넉넉히
    // 빛 모임은 이 시각에 '최대 휘도'로 터진다 — 그 백색 오버슛이 감쇠하는 동안 첫 아이콘이
    // 꺼내진다(예전엔 120ms에 피크를 찍고 480ms엔 암전인데 아이콘이 540ms에 떠서, 빛과
    // 아이콘이 인과로 안 묶이고 '별개 애니메이션 두 개'로 읽혔다)
    SR_CHARGE_MS: 480,      // 빛 모임 정점 시각(.sr-charge 애니메이션 길이와 맞춤)
    SR_HOLDBACK_MS: 300,    // 최고 등급 1개를 마지막에 한 박자 늦게 띄우는 여유(정지 구간이 아니라 축적 구간)
    SR_TAIL_MS: 300,        // 마지막 아이콘이 뜬 뒤 [확인]이 나오기까지의 여운
    _srTimers: [], _srRaf: 0,
    _srCells: null, _srEntries: null, _srDelays: null, _srStart: 0, _srIdx: 0,
    _srDone: false, _srHeroIdx: -1,

    // 모듈별 소환 결과 배열을 팝업이 쓰는 공통 형태로 변환 (묶음 전, 굴림 1회 = 1개)
    summonEntries(kind, results) {
        if (kind === 'skill') return results.map(r => ({
            key: 'sk:' + r.def.id, icon: SKILL_ICONS[r.def.id] || '✨',
            rarity: r.def.rarity, name: r.def.name, isNew: !!r.isNew,
        }));
        if (kind === 'mount') return results.map(r => ({
            key: 'mt:' + r.name, icon: MOUNT_ICONS[r.name] || '🐴',
            rarity: r.rarity, name: MOUNT_KR[r.name] || r.name, isNew: !!r.isNew,
        }));
        // 펫은 알 단위 획득이라 신규/중복 개념이 없다 — 기술트리 보너스 알만 따로 묶는다
        return results.map(r => ({
            key: 'eg:' + r.rarity + (r.extra ? ':x' : ''), icon: '🥚', rarity: r.rarity,
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
            // 라벨 2슬롯 — **등급은 언제나 왼쪽에 남는다**. 예전엔 한 칸에 등급명과 적립
            // 환산(조각/재료)을 번갈아 넣어서, 중복만 나온 항목은 등급 텍스트가 통째로
            // 사라졌다(x75 mid 15장 중 10장). 가장 중요한 라벨이 부가 정보에 밀려나면 안 된다.
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
        const chips = RARITIES.filter(r => cnt[r])
            .map(r => `<b class="sr-chip" style="${this.chipVars(r)}">${RARITY_KR[r]} ${cnt[r]}</b>`).join('');
        return `<div class="sr-sum">${chips}</div>`;
    },

    // 등급색에서 밝은/어두운 스톱을 계산한다. RARITY_CSS는 전 화면 공용 데이터라 건드리지 않고,
    // 구체 그라디언트에만 파생색을 쓴다 (color-mix 미지원 브라우저에서도 동작하게 JS로 계산).
    srShade(hex, amt) {
        const n = parseInt(hex.slice(1), 16);
        return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
            .map(c => U.clamp(Math.round(amt > 0 ? c + (255 - c) * amt : c * (1 + amt)), 0, 255)
                .toString(16).padStart(2, '0')).join('');
    },

    srRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },

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
    srCols(n) {
        let best = 5, bestFill = -1;
        for (const c of [5, 4, 6]) {
            const fill = (n % c === 0 ? c : n % c) / c; // 마지막 행 충전율
            if (fill > bestFill + 1e-9) { bestFill = fill; best = c; }
        }
        return best;
    },

    // ① 빛 모임 구간에 중심으로 빨려드는 빛줄기 — 팝만 있고 '모이는 힘'이 없으면
    // 기대감 구간이 흰 플래시 한 장으로 끝난다. 난수 대신 고정 수열로 흩어 놓는다.
    summonStreaks() {
        let h = '';
        for (let i = 0; i < 14; i++) {
            // 딜레이 폭은 짧게 — 셀 등장(SR_CHARGE_MS 480ms)까지 전부 사라져야
            // 아이콘 줄 위에 흰 막대가 남지 않는다
            h += `<i style="--a:${(i * 360 / 14 + (i % 3) * 7).toFixed(1)}deg;`
               + `--r:${(7.5 + (i * 17) % 6)}rem;--len:${(2.2 + (i % 4) * .8).toFixed(1)}rem;`
               + `--d:${((i * 53) % 120) / 1000}s"></i>`;
        }
        return `<div class="sr-streaks">${h}</div>`;
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
            // data-tier로 등급별 세기(크기·광채·광선)를 계단화한다 — 6등급이 2상태로 붕괴하지 않게
            return `${brk}<div class="sr-cell${hi ? ' hi' : ''}${i === heroIdx ? ' heroic' : ''}" data-tier="${RARITIES.indexOf(e.rarity)}"
                data-mat="${this.srMaterial(e.rarity)}"
                style="--i:${i};--rc:${rc};--rc-lite:${this.srShade(rc, .5)};--rc-deep:${this.srShade(rc, -.62)};${this.chipVars(e.rarity)}">
                <div class="sr-orbwrap">
                    <span class="sr-ray"></span>
                    <span class="sr-beam"></span>
                    <span class="sr-ghost"></span>
                    <span class="sr-orb">${e.icon}</span>
                    <span class="sr-spark"></span>
                    ${e.qty > 1 ? `<b class="sr-qty">×${e.qty}</b>` : ''}
                    ${e.isNew ? '<span class="sr-new">NEW</span>' : ''}
                </div>
                <div class="sr-name"><span>${e.name}</span></div>
                <div class="sr-sub${e.extra ? ' two' : ''}"><b class="sr-rk">${e.sub}</b>${e.extra ? `<i class="sr-ex">${e.extra}</i>` : ''}</div>
            </div>`;
        }).join('');
        // 셀 수에 따라 크기 단계 — 묶음 덕분에 x75도 보통은 mid에서 멈춘다
        const size = entries.length === 1 ? ' one' : entries.length > 24 ? ' dense' : entries.length > 10 ? ' mid' : '';
        const cols = this.srCols(entries.length);
        // 한 줄짜리 결과(≤5개)는 아이콘 줄 위아래로 빈 남색 밴드가 구조적으로 남는다 —
        // 아래쪽은 소환진(룬 바닥)으로 받쳐 피사체가 떠 있지 않고 무대 위에 선 것으로 읽히게 한다.
        const stage = entries.length <= 5;
        const m = this.els.summonResultModal;
        m.className = 'modal'; // hidden 해제 + 이전 done 상태 제거
        m.innerHTML = `
            <div class="sr-wrap">
                <div class="sr-rays"></div>
                <div class="sr-halo"></div>
                ${this.summonMotes()}
                <div class="sr-charge"></div>
                ${this.summonStreaks()}
                <div class="sr-shock"></div>
                <div class="sr-shock echo"></div>
                <div class="sr-idle"><i></i><i></i></div>
                <div class="sr-flash" style="--rc:${RARITY_CSS[best]}"></div>
                <div class="sr-head"><div class="sr-title">${meta.icon} ${meta.title} ×${rolls.length}</div></div>
                <div class="sr-body${stage ? ' stage' : ''}${stage && size === ' one' ? ' one' : ''}">
                    <div class="sr-grid${size}${heroRow ? ' herorow' : ''}" style="--cols:${cols}">${cells}</div>
                    ${stage ? '<div class="sr-floor"></div>' : ''}
                </div>
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
        // 소환진도 결과 등급색으로 물들인다(.done에서만) — 배경/halo와 같은 승격 규칙
        // 선은 등급색 원본이 아니라 밝게 띄운 파생색 — 배경까지 그 등급색으로 물든 뒤라
        // 원색 그대로는 배경에 묻혀 소환진이 사라진다
        const lrgb = this.srRgb(this.srShade(bc, .55));
        m.style.setProperty('--floor-line-hi', `rgba(${lrgb[0]},${lrgb[1]},${lrgb[2]},.85)`);
        m.style.setProperty('--floor-fill-hi', `rgba(${brgb[0]},${brgb[1]},${brgb[2]},.26)`);
        this.clearSummonTimers();
        this._srDone = false;
        SFX.summonCharge(best);
        // 바닥 반사 복제본(.sr-reflect 안)이 아니라 진짜 그리드의 셀만 잡는다
        this._srCells = m.querySelectorAll('.sr-body > .sr-grid > .sr-cell');
        this._srEntries = entries;
        this.setSummonEjectPaths(m);
        const n = this._srCells.length;
        const step = n <= 10 ? this.SR_SLOW_STEP : U.clamp(this.SR_REVEAL_BUDGET / n, 20, 120);
        // 셀별 등장 시각 — 마지막 최고 등급 한 개만 홀드백만큼 더 뜸들인다
        this._srDelays = [];
        for (let i = 0; i < n; i++) {
            this._srDelays.push(this.SR_CHARGE_MS + i * step + (holdback && i === n - 1 ? this.SR_HOLDBACK_MS : 0));
        }
        this._srHoldback = holdback;
        this._srHeroIdx = heroIdx;
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
            const dx = (ox - (r.left + r.width / 2)) * this.SR_EJECT / rem;
            const dy = (oy - (r.top + r.height / 2)) * this.SR_EJECT / rem;
            c.style.setProperty('--dx', dx.toFixed(3) + 'rem');
            c.style.setProperty('--dy', dy.toFixed(3) + 'rem');
        });
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
        clone.querySelectorAll('.sr-name, .sr-sub, .sr-new, .sr-qty, .sr-ray, .sr-beam, .sr-ghost, .sr-spark')
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
        const $ = id => document.getElementById(id);
        this.els = {
            topbar: $('topbar'), stageLabel: $('stage-label'), wavePips: $('wave-pips'),
            bossWarn: $('boss-warning'),
            dmgFlash: $('dmg-flash'), lootFeed: $('loot-feed'), skillBar: $('skill-bar'),
            toasts: $('toasts'), offlineBtn: $('offline-btn'),
            equipSheet: $('equip-sheet'),
            panels: { summon: $('panel-summon'), debug: $('panel-debug') },   // '방'(menu) 탭 제거 (사용자 지시 2026-08-18)
            petsPanel: $('panel-pets'), skillsPanel: $('panel-skills'), techPanel: $('panel-tech'),
            craftModal: $('craft-modal'), offlineModal: $('offline-modal'),
            dungeonModal: $('dungeon-modal'), dungeonDetailModal: $('dungeon-detail-modal'),
            mountModal: $('mount-modal'), mountUpgradeModal: $('mount-upgrade-modal'), ascendModal: $('ascend-modal'),
            stubModal: $('stub-modal'),
            forgeInfoModal: $('forge-info-modal'), forgeItemModal: $('forge-item-modal'),
            detailModal: $('detail-modal'),
            autoForgeModal: $('autoforge-modal'),
            petUpgradeModal: $('pet-upgrade-modal'),
            leagueModal: $('league-modal'), passModal: $('pass-modal'), shopModal: $('shop-modal'),
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
        return item;
    },
    // 부팅 시 복원: 지난 세션이 선택하지 않고 떠난 제작품이 있으면 비교 팝업을 그대로 다시 띄운다.
    // (자동 판정으로 정리하지 않는 이유 — 선택은 사용자 몫이고, 강제 판정은 '내가 안 고른 장비가 팔렸다'가 된다)
    restorePendingCraft() {
        const item = S.pendingCraft;
        if (!item || !item.slot) return;
        this._pendingItem = item;
        this.showCraftModal(item);
    },
    resolvePendingCraft() {
        // 판정 기준은 '팝업이 열려 있는가'가 아니라 '대기품이 있는가'다 — 모루 타격 연출(0.72초)
        // 동안에는 대기품은 이미 있는데 팝업이 아직 안 떠서, 모달 기준으로 보면 이 경로가 통째로
        // 새어 나갔다(탭을 옮겨도 정리되지 않고, 연출이 끝나면 엉뚱한 탭 위에 팝업이 떴다).
        if (!this._pendingItem) return;
        this.cancelAnvilStrike();
        const m = this.els.craftModal;
        if (m) m.classList.add('hidden');
        const item = this.clearPendingCraft();
        if (!item) { saveGame(); return; }
        const r = Forge.autoResolve(item);
        this.toast(r.equipped ? `🛠 ${item.name} 자동 장착` : `🪙 ${item.name} 자동 판매 +${U.fmt(r.gained)}`);
        this.renderTopBar();
        this.renderEquipSheet();
        saveGame();
    },

    switchTab(tab) {
        this.activeTab = tab;
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
        'shop-modal': 'shop', 'league-modal': 'pvp', 'pass-modal': 'pvp',
        'pet-upgrade-modal': 'summon',
    },
    watchTabX() {
        const obs = new MutationObserver(() => this.refreshTabX());
        document.querySelectorAll('.modal').forEach(m => obs.observe(m, { attributes: true, attributeFilter: ['class'] }));
    },
    // 지금 열려 있는 팝업/시트가 속한 탭 (없으면 null)
    openedTab() {
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
            if (isX) b.innerHTML = '<span class="tab-x-mark">✕</span>';
            else if (b.dataset.label) { b.innerHTML = b.dataset.label; delete b.dataset.label; }
        });
    },
    // X 상태의 탭을 누르면 열린 것을 닫는다
    closeOpened() {
        this.resolvePendingCraft(); // 여기도 전 모달 일괄 숨김이라 제작 대기품 유실 경로가 같다
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
        const top = this.topModalZ();
        el.style.zIndex = top ? top + 1 : '';
        el.classList.remove('hidden');
        el.classList.add('opening');
        clearTimeout(el._openingT);
        el._openingT = setTimeout(() => el.classList.remove('opening'), 300);
    },

    openStub(title, desc) {
        this.els.stubModal.innerHTML = `
            <div class="modal-card">
                <h3>${title}</h3>
                <p class="muted">${desc}</p>
                <p class="muted">🚧 다음 업데이트에서 추가될 예정입니다.</p>
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
    renderTopBar() {
        const cp = Combat.combatPower();
        this.els.topbar.innerHTML = `
            <div class="profile-card" onclick="UI.openProfile()">
                <span class="avatar">${S.avatarEmoji || '🛡️'}</span>
                <div class="profile-info">
                    <span class="nickname">${U.escapeHtml(S.nickname || '용사')}</span>
                    <span class="cp">⚔️ ${U.fmt(cp)}</span>
                </div>
            </div>
            <div class="currency-pills">
                <span class="pill coin"><button class="pill-plus" onclick="UI.openShop()">+</button>${IconGen.img('coin')} ${U.fmt(S.coins)}</span>
                <span class="pill gem"><button class="pill-plus" onclick="UI.openShop()">+</button>${IconGen.img('gem')} ${U.fmt(S.gems)}</span>
            </div>`;
    },

    // 챕터 기준 난이도 표기 (원본 임계값 미확보 → 자체 설계 4단계 근사)
    difficultyLabel(chapter) {
        if (chapter <= 2) return '쉬움';
        if (chapter <= 5) return '보통';
        if (chapter <= 8) return '어려움';
        return '매우 어려움';
    },

    // ---- 전투 HUD ----
    updateStageLabel() {
        if (Dungeons.run) {
            const d = Dungeons.def(Dungeons.run.id);
            this.els.stageLabel.textContent = `${d.icon} ${d.kr} ${Dungeons.run.stage}단계`;
        } else this.els.stageLabel.textContent = `${this.difficultyLabel(S.chapter)} ${S.chapter}-${S.stage}`;
    },
    updateWavePips(wave) {
        this.els.wavePips.innerHTML = [1, 2, 3, 4, 5].map(w =>
            `<span class="pip ${w < wave ? 'done' : w === wave ? 'now' : ''} ${w === 5 ? 'boss' : ''}"></span>`).join('');
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
        el.style.setProperty('--vig', Math.min(0.92, 0.45 + (sev || 0.12) * 1.5).toFixed(2)); // 1.0은 화면 전체가 붉게 잠긴다
        el.classList.remove('on');
        void el.offsetWidth; // 리플로우 강제 — 연타해도 애니메이션이 처음부터 다시 돈다
        el.classList.add('on');
    },
    floatLoot(text) {
        if (this.els.lootFeed.children.length > 6) this.els.lootFeed.firstChild.remove();
        const el = document.createElement('div');
        el.textContent = text;
        this.els.lootFeed.appendChild(el);
        setTimeout(() => el.remove(), 1600);
    },
    floatTextAtHero(text, cls) {
        const p = Scene3D.heroG ? Scene3D.heroG.position : { x: Combat.HERO_X, z: 0 };
        Scene3D.damageNumber(new THREE.Vector3(p.x, 1.8, p.z), text, cls);
    },

    toast(msg) {
        const el = document.createElement('div');
        el.className = 'toast';
        el.textContent = msg;
        this.els.toasts.appendChild(el);
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
                ? `<button class="btn sm primary ascend-ready" onclick="UI.openForgeInfo()">⭐ 승천<br>가능</button>`
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
        const activeMount = S.activeMount ? S.mounts[S.activeMount] : null;
        const eggCellHtml = activeMount
            ? `<div class="equip-cell egg-cell" title="탈것: ${MOUNT_KR[S.activeMount] || S.activeMount}" onclick="UI.openMounts()">
                ${UI.mountFace(S.activeMount, 'cell-img emoji')}
                <span class="cell-lv">Lv.${activeMount.level}</span>
            </div>`
            : `<div class="equip-cell egg-cell empty" title="탈것" onclick="UI.openMounts()"><span class="mount-sil">🐴</span><span class="slot-name">탈것</span></div>`;

        // 모루가 중앙, 우측에 [대장간 레벨 N]·[자동🔄] 가로 배치, 좌측에 !(플레이어 정보, UI-SPEC 27번) — UI-SPEC 1번
        this.els.equipSheet.innerHTML = `
            <div class="equip-grid">${equipHtml}${eggCellHtml}</div>
            <div class="anvil-row">
                <div class="anvil-side left">
                    <button class="info-btn" title="플레이어 정보" onclick="UI.openPlayerInfo()">!</button>
                </div>
                ${this.anvilSlotHTML()}
                <div class="anvil-side right">
                    <div class="forge-actions">
                        ${forgeBtnHtml}
                        <button class="btn sm ${autoUnlocked ? (S.autoForgeOn ? 'on' : '') : 'disabled'}" onclick="UI.openAutoForge()">
                            자동🔄<br>${autoUnlocked ? (S.autoForgeOn ? 'ON' : 'OFF') : '🔒'}</button>
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
        return `<button class="anvil-btn held-slot" style="--rc:${this.ageHex(held.age)}" onclick="UI.onOpenHeld()">
            <span class="held-tag">보류</span>
            ${this.itemImgHTML(held, 'held-img')}
            <span class="held-name">${held.name}</span>
            <small id="anvil-hammers">${IconGen.img('hammer')} ${U.fmt(S.hammers)}</small>
        </button>`;
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
        // 대기품이 없으면 '장착 완료' 상태로 열려 있던 팝업이다 — 보류할 게 없으니 그냥 닫는다.
        // (이 분기가 없으면 장착 후 팝업이 딤으로도 안 닫혀 갇힌다 — 사용자 지시 2026-08-18로
        //  장착이 더 이상 팝업을 닫지 않게 되면서 생긴 새 경로다.)
        if (!this._pendingItem) return;
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
    // 예전 구현은 main.js의 3초 인터벌에서 배치로 즉시 처리해 아무 연출이 없었다. 이제 한 개씩,
    // **망치질 → 뽑힌 것 보여주기 → (필터 통과=비교 팝업 대기 / 탈락=코인 판매 연출)** 순서로 돈다.
    // 비교 팝업이 뜨면 사용자가 고를 때까지 다음 제작으로 넘어가지 않는다(고르면 doResolveCraft가,
    // 보류하면 onCraftDimClick이 다음 스텝을 부른다). 예산·해머가 떨어지거나 토글이 꺼지면 정지.
    _autoSeq: null,
    startAutoSeq() {
        if (this._autoSeq) return;
        const cfg = Forge.autoForgeConfig();
        this._autoSeq = { left: Math.max(1, cfg.hammersPerBatch), stopAfterPick: false };
        this.autoSeqStep();
    },
    stopAutoSeq() {
        this._autoSeq = null;
        if (S.autoForgeOn) { S.autoForgeOn = false; this.renderEquipSheet(); saveGame(); }
        if (!this.els.autoForgeModal.classList.contains('hidden')) this.renderAutoForge();
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
            if (r.equipped) this.toast(`🛠 보류품 ${held.name} 자동 장착`);
            else { this.coinBurst(r.gained); this.toast(`🪙 보류품 ${held.name} 자동 판매 (필터 제외)`); }
            this.renderTopBar();
            this.renderEquipSheet();
        }
        if (seq.stopAfterPick || seq.left <= 0 || S.hammers < 1) { this.stopAutoSeq(); return; }
        seq.left--;
        const item = Forge.craft(1)[0];
        if (!item) { this.stopAutoSeq(); return; }
        this.setPendingCraft(item);   // 연출 도중 새로고침해도 결과물이 남게 (수동 제작과 같은 규약)
        this.renderTopBar();
        // _anvilBusy는 망치질만이 아니라 **'제작 한 벌'이 끝날 때까지** 잡는다. 타격이 끝난 뒤
        // 탈락 카드 노출(0.62초) 동안 풀어 두면, 그 사이 모루를 다시 누른 수동 제작이
        // setPendingCraft로 대기품을 덮어써 **앞 장비가 해머만 먹고 판매도 안 된 채 사라졌다**
        // (실측: 돌 반지 → 사냥꾼 허리띠로 교체되고 돌 반지는 코인으로도 회수되지 않음).
        // 통과분은 비교 팝업이 뜨는 순간부터 팝업 자신이 재클릭을 막으므로 거기서 푼다.
        this._anvilBusy = true;
        this.playAnvilStrike(() => {
            if (this._pendingItem !== item) { this._anvilBusy = false; return; }   // 연출 중 탭 이동 등으로 이미 정리됨
            // 예전엔 '장착 중인 것과 같은 장비 = 승천 재료'라 필터와 무관하게 팝업으로 보여줬지만,
            // 개별 장비 승천이 라인 승천으로 대체되면서 중복 장비는 일반 판매다(forge.js:isMatchingGear 메모).
            // 남겨 두면 중복이 뽑힐 때마다 배치가 팝업에서 멈추는 원인만 된다 — 목표 판정만 본다.
            const keep = Forge.passesAutoFilter(item);
            if (keep) {
                this._anvilBusy = false;
                // ⑤ '계속하기'가 꺼져 있으면 이번 선택까지만 하고 멈춘다
                if (!Forge.autoForgeConfig().continueOnTarget) seq.stopAfterPick = true;
                this.showCraftModal(item);
                return;
            }
            // 탈락 — 무엇이 나왔는지 카드로 잠깐 보여준 뒤 코인으로 터뜨린다
            this.showAutoDropCard(item, () => {
                this._anvilBusy = false;
                const it = this.clearPendingCraft();
                if (!it) { this.autoSeqStep(); return; }
                const r = this.autoDispose(it);
                if (r.equipped) this.toast(`🛠 ${it.name} 자동 장착`);
                else this.coinBurst(r.gained);
                this.renderTopBar();
                this.renderEquipSheet();
                saveGame();
                this.autoSeqStep();
            });
        });
    },
    // '목표 아님'으로 판정된 장비의 처리. 반환은 Forge.autoResolve와 같은 { equipped, gained }.
    // 유지 시대·필터를 하나라도 켜 뒀으면 그건 명시적 의사표시라 탈락품을 그대로 판매한다
    // (원시 시대만 유지하라고 해 놓고 중세 장비를 자동 장착하면 지시를 어기는 것).
    // 아무것도 안 켠 기본 설정에서는 목표라는 개념이 없으므로 오토포지 표준 판정
    // (Forge.autoResolve — 장착품보다 강하면 장착, 아니면 판매)에 맡긴다. 이렇게 해야
    // 기본 설정에서도 망치 예산을 끝까지 소화하면서 업그레이드를 그냥 팔아버리지 않는다.
    autoDispose(item) {
        if (Forge.hasAutoTarget()) return { equipped: false, gained: Forge.sell(item) };
        return Forge.autoResolve(item);
    },
    // 필터 탈락 장비를 모루 위에 잠깐 띄운다 — '무엇이 뽑혔는지'는 항상 보여야 한다(항목 ③)
    AUTO_CARD_MS: 620,
    showAutoDropCard(item, done) {
        const host = document.getElementById('app');
        const btn = document.querySelector('.anvil-btn');
        if (!host || !btn) { done(); return; }
        const hb = host.getBoundingClientRect(), bb = btn.getBoundingClientRect();
        const el = document.createElement('div');
        el.className = 'auto-drop-card';
        el.style.setProperty('--rc', this.ageHex(item.age));
        el.style.left = (bb.left - hb.left + bb.width / 2) + 'px';
        el.style.top = (bb.top - hb.top) + 'px';
        el.innerHTML = `${this.itemImgHTML(item, 'adc-img')}
            <div class="adc-info"><div class="adc-name">${item.name}</div>
            <div class="adc-stat">${U.fmt(Forge.itemValue(item))} ${item.main === 'atk' ? '피해' : '체력'}</div></div>`;
        host.appendChild(el);
        setTimeout(() => { el.remove(); done(); }, this.AUTO_CARD_MS);
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
        const pct = p => (parseFloat(p.toFixed(2)) || 0) + '%';
        const rows = AGES.map(age => {   // 0% 시대도 표시 — 전체 확률표 열람이 목적 (사용자 재지시 2026-08-17)
            const hex = this.ageHex(age);
            return `<div class="fi-age-bar" style="--ac:${hex}">
                <span class="fi-age-name">${AGE_ICON[age]} ${AGE_KR[age]}</span>
                <span class="fi-age-cur">${pct(curP[age] || 0)}</span>
                <span class="fi-age-next">${info ? pct(nextP[age] || 0) : '—'}</span>
            </div>`;
        }).join('');

        let actionHtml;
        if (Ascension.ready('forge')) { // Lv.35 도달 — 업그레이드 대신 라인 승천 (사용자 확정 2026-08-17)
            actionHtml = `<button class="btn primary fi-upgrade" onclick="UI.openAscension('forge')">
                ⭐ 승천<br><small>대장간 Lv.${Ascension.FORGE_LEVEL} 도달 · 이후 제작 장비 ⭐${Ascension.count('forge') + 1}</small></button>`;
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
                <button class="x-btn" onclick="UI.closeForgeInfo()">✕</button>
            </div>`;
    },
    // 원본(shot-042905): 시대색 헤더 막대 + 회색 패널 안 흰 아이템 셀(별 배지, % 아래 표기), 닫기=빨간 X(확률 정보로 복귀)
    renderForgeListView() {
        const sections = AGES.map(age => {   // 0% 시대도 표시 — 확률 정보 팝업 계열 (사용자 재지시 2026-08-17)
            const hex = this.ageHex(age);
            const ageP = Forge.ageProbsAt(S.forgeLevel)[age] || 0;
            const p = Forge.itemDropChance(age, 'weapon'); // 무기 변형은 모두 동일 확률
            // 썸네일은 즉시 그리지 않는다 — 시대 10 × 부위별 이름 변형이면 200장이 넘고, 한 장마다
            // 별도 WebGL 렌더+toDataURL이라 목록을 여는 순간 수 초간 얼어붙는다.
            // 이모지를 먼저 깔고 화면에 들어온 셀만 3D 썸네일로 교체한다(hydrateForgeThumbs).
            const cell = (onclick, icon, pct, td) => `
                <button class="forge-item-cell" onclick="${onclick}">
                    <span class="fl-face" data-slot="${td.slot}" data-age="${td.age}" data-ageidx="${td.ageIdx}" data-wtype="${td.wtype || ''}" data-nameidx="${td.nameIdx}">${icon}</span>
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
                const icon = slot === 'helmet' ? '🪖' : slot === 'armor' ? '👕' : (this.SLOT_EMOJI[slot] || '🎁');
                return names.map((name, i) => cell(`UI.openForgeDetail('${age}','${slot}',${i})`, icon, sp,
                                                  { slot, age, ageIdx, wtype: null, nameIdx: i })).join('');
            }).join('');
            return `<div class="forge-age-section">
                <div class="fi-age-bar fl-head" style="--ac:${hex}">
                    <span class="fi-age-name">${AGE_ICON[age]} ${AGE_KR[age]}</span>
                    <span class="fi-age-cur">${ageP.toFixed(2)}%</span>
                </div>
                <div class="forge-item-grid">${weaponCells}${otherCells}</div>
            </div>`;
        }).join('');

        this.els.forgeInfoModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper fl-card">
                    <h3 class="fi-title">모든 장비의 목록</h3>
                    <div class="forge-age-list">${sections}</div>
                </div>
                <button class="x-btn" onclick="UI.openForgeInfo()">✕</button>
            </div>`;
        this.hydrateForgeThumbs(this.els.forgeInfoModal);
    },

    // ---- 탈것 아이콘 = 실제 3D 탈것 (사용자 지시 2026-08-18) ----
    // 슬롯에 이모지(🐴)를 박아 두면 실제로 소환되는 탈것과 생김새가 전혀 달라 '다른 물건'으로 읽힌다.
    // 장비 썸네일과 같은 방식: 이모지를 먼저 깔고 다음 프레임에 3D 스냅샷으로 교체한다
    // (첫 썸네일 호출이 렌더러·PMREM 환경맵을 만드느라 유독 무거워 동기로 부르면 화면이 붙잡힌다).
    mountFace(name, cls) {
        const m = name && S.mounts[name];
        return this.creatureFace('mount', name, m ? m.rarity : '', cls, MOUNT_ICONS[name] || '🐴');
    },
    // ⚠️ 이미 구워 둔 썸네일이면 **이모지를 거치지 않고 바로 박는다.** 매번 이모지로 깔고
    //    하이드레이트를 기다리면, 그리는 도중에 또 다시 그려지는 화면에서는 앞 프레임의 작업이
    //    떨어져 나가 몇 칸이 이모지로 남는다(실측: 탈것 화면 15칸 중 3칸이 간헐적으로 잔존).
    //    첫 굽기 때만 이모지 폴백이 필요하고, 그 뒤로는 다시 그려도 항상 완성된 그림이 나온다.
    creatureFace(kind, name, rarity, cls, emoji) {
        const attrs = `class="${cls} mt-face" data-kind="${kind}" data-mt="${name || ''}" data-rarity="${rarity || ''}"`;
        const url = typeof Scene3D !== 'undefined' && Scene3D.creatureThumbCached
            ? Scene3D.creatureThumbCached(kind, name, rarity) : null;
        if (url) return `<span ${attrs.replace('mt-face', 'mt-face has-thumb')}><img src="${url}" alt=""></span>`;
        return `<span ${attrs}>${emoji}</span>`;
    },
    // 펫도 같은 문제(🐾 이모지 ≠ 실제 3D 펫) — 완전히 같은 파이프라인을 쓴다
    petFace(name, cls) {
        return this.creatureFace('pet', name, '', cls, PET_ICONS[name] || '🐾');
    },
    hydrateMountThumbs(root) {
        const scope = root || document;
        if (typeof Scene3D === 'undefined' || !Scene3D.mountThumb) return;
        const faces = [...scope.querySelectorAll('.mt-face[data-mt]:not(.has-thumb)')].filter(e => e.dataset.mt);
        if (!faces.length) return;
        requestAnimationFrame(() => {
            for (const el of faces) {
                if (!el.isConnected) continue;
                const url = el.dataset.kind === 'pet'
                    ? Scene3D.petThumb(el.dataset.mt)
                    : Scene3D.mountThumb(el.dataset.mt, el.dataset.rarity || 'common');
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
                        <div class="idet-icon">${thumb ? `<img src="${thumb}" alt="">` : icon}</div>
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
                <button class="x-btn" title="닫기" onclick="UI.closeForgeItemDetail()">✕</button>
            </div>`;
    },

    // ---- 자동 제련 팝업 (UI-SPEC 21~24번 ④) ----
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
        const pct = p => (parseFloat(p.toFixed(2)) || 0) + '%';
        // 자동 제련만 0% 시대를 숨긴다 — 여긴 '뽑을 수 있는 시대'를 고르는 화면이라 못 뽑는 시대가 있으면 안 된다 (사용자 재지시 2026-08-17)
        const ageRows = AGES.filter(age => (probs[age] || 0) > 0).map(age => `
            <div class="af-age-bar" style="--ac:${this.ageHex(age)}" onclick="UI.onToggleKeepAge('${age}')">
                <span class="af-check ${cfg.keepAges.includes(age) ? 'on' : ''}">${cfg.keepAges.includes(age) ? '✓' : ''}</span>
                <span class="af-age-name">${AGE_ICON[age]} ${AGE_KR[age]}</span>
                <span class="af-age-pct">${pct(probs[age] || 0)}</span>
            </div>`).join('');
        const subRows = SUBSTATS.map(([key, label]) => `
            <div class="af-sub-row" onclick="UI.onToggleFilterSub('${key}')">
                <span class="af-check ${cfg.filterSubs.includes(key) ? 'on' : ''}">${cfg.filterSubs.includes(key) ? '✓' : ''}</span>
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
                            <span class="af-check ${cfg.continueOnTarget ? 'on' : ''}" onclick="UI.onToggleContinueOnTarget()">${cfg.continueOnTarget ? '✓' : ''}</span></div>
                        <button class="btn primary af-start" onclick="UI.onToggleAutoForge()">${S.autoForgeOn ? '중지' : '시작'}</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeAutoForge()">✕</button>
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
    onToggleContinueOnTarget() {
        const cfg = Forge.autoForgeConfig();
        cfg.continueOnTarget = !cfg.continueOnTarget;
        saveGame(); this.renderAutoForge();
    },

    // 제작 버튼은 ⚒️ 이모지가 아니라 원본(shot-042120)처럼 모루 그림이어야 한다.
    // 원본 실측(499×892 스크린샷에서 모루가 차지하는 영역 ≈107×76px, 가로세로 1.41:1)을 viewBox로
    // 옮겨 인라인 SVG로 그린다 — 외부 에셋 금지 제약을 지키면서 어느 배율에서도 또렷하다.
    // 구성은 원본과 같은 4단: 오른쪽으로 뻗는 뿔 / 상판(윗면 밝은 면 + 앞면 그늘) / 좁고 어두운 허리 /
    // 상판보다 넓은 받침(밝은 테 + 몸통). 금속 질감·하이라이트 고도화는 폴리싱 단계 몫이다.
    ANVIL_SVG: `<svg class="anvil-svg" viewBox="0 0 132 86" aria-hidden="true">
            <g stroke="#1a100e" stroke-width="3" stroke-linejoin="round">
                <path d="M96 12 L130 26 L96 36 Z" fill="#962f13"/>
                <path d="M22 6 L108 6 L96 24 L10 24 Z" fill="#b2481f"/>
                <path d="M10 24 L96 24 L96 42 L10 42 Z" fill="#822f16"/>
                <path d="M10 36 L96 36 L96 42 L10 42 Z" fill="#6d2612" stroke="none"/>
                <path d="M40 42 L68 42 L62 56 L46 56 Z" fill="#281a17"/>
                <path d="M24 56 L88 56 L100 66 L12 66 Z" fill="#6d3027"/>
                <path d="M12 66 L100 66 L94 80 L18 80 Z" fill="#4a201b"/>
            </g>
        </svg>`,

    // ---- 모루 타격 연출 (사용자 지시: 제작을 누르면 망치가 쾅쾅 친 뒤에 비교 팝업) ----
    // 총 0.72초 = 0.24초 × 3타. 반복 제작이 답답하지 않은 길이 안에서 마지막 타격만 강하게 준다.
    // 궤적·지속은 CSS 키프레임(.anvil-fx)이 소유하고, 여기서는 타격 시각에 소리·흔들림만 맞춰 건다.
    ANVIL_FX_MS: 720,
    ANVIL_HITS: [170, 410, 650],   // css afswing의 타격 프레임(24% / 57% / 90%)과 같은 시각
    playAnvilStrike(done) {
        const btn = document.querySelector('.anvil-btn');
        if (!btn) { done(); return; }   // 장비 시트가 닫혀 있으면 연출을 건너뛰고 결과만 낸다
        const fx = document.createElement('span');
        fx.className = 'anvil-fx';
        const sparks = [];
        for (let h = 0; h < 3; h++) {
            const n = h === 2 ? 9 : 6;                       // 마지막 타격이 가장 많이 튄다
            for (let i = 0; i < n; i++) {
                // 위쪽 반구로만 튀게 각도를 잡고(모루 아래로 파고드는 불티는 오독), 중력분을 더해 아래로 떨어뜨린다
                const a = -Math.PI * (0.08 + 0.84 * (i + U.rand(0, 0.6)) / n);
                const d = U.rand(0.5, 1.15) * (h === 2 ? 1.35 : 1);
                sparks.push(`<span class="af-spark" style="--dx:${(Math.cos(a) * d).toFixed(2)}em;--dy:${(Math.sin(a) * d + 0.4).toFixed(2)}em;--t:${(this.ANVIL_HITS[h] / 1000).toFixed(2)}s"></span>`);
            }
        }
        fx.innerHTML = `<span class="af-hammer">🔨</span>`
            + [0, 1, 2].map(h => `<span class="af-ring h${h}"></span>`).join('') + sparks.join('');
        btn.appendChild(fx);
        btn.classList.add('striking');
        this._anvilTimers = this.ANVIL_HITS.map((t, h) => setTimeout(() => {
            SFX.anvilHit(h === 2);
            if (typeof Scene3D !== 'undefined' && Scene3D.shake) Scene3D.shake(h === 2 ? 0.13 : 0.07); // 미세하게만
        }, t));
        this._anvilTimers.push(setTimeout(() => {
            fx.remove(); btn.classList.remove('striking');
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
        document.querySelectorAll('.anvil-fx').forEach(n => n.remove());
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
        this._anvilBusy = true;
        this.playAnvilStrike(() => {
            this._anvilBusy = false;
            // 연출 도중 탭을 옮겨 대기품이 이미 자동 판정됐다면(closeAllTabSurfaces) 팝업을 새로 띄우지 않는다
            if (this._pendingItem === item) this.showCraftModal(item);
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
    weaponEmoji(wtype) {
        const shape = typeof weaponShape === 'function' ? weaponShape(wtype) : wtype;
        if (this.WEAPON_SHAPE_EMOJI[shape]) return this.WEAPON_SHAPE_EMOJI[shape];
        return (WEAPON_TYPES[wtype] && WEAPON_TYPES[wtype].kind === 'ranged') ? '🏹' : '🗡';
    },
    // 장비 그리드 공용 셀 (원본 shot-042120 정합): 정사각 고정 프레임 + 아이콘 상부 채움 + Lv 내부 하단 + ⭐는 하단 테두리 걸침.
    // 빈 슬롯도 동일 프레임 유지(찌그러짐 금지, 사용자 지시) — 흐린 부위 아이콘 실루엣 + 부위명.
    EMPTY_SLOT_EMOJI: { weapon: '🗡', helmet: '🪖', armor: '👕' },
    equipCellHTML(slot) {
        const it = S.equipment[slot];
        if (!it) return `<div class="equip-cell empty">
            <span class="cell-img emoji dim">${this.EMPTY_SLOT_EMOJI[slot] || this.SLOT_EMOJI[slot] || '🎁'}</span>
            <span class="slot-name">${SLOT_KR[slot]}</span>
        </div>`;
        return `<div class="equip-cell" style="--rc:${this.ageHex(it.age)}" title="${it.name}" onclick="UI.openGearDetail('${slot}')">
            ${this.itemImgHTML(it, 'cell-img')}
            <span class="cell-lv">Lv. ${it.level}</span>
            ${it.stars ? `<span class="cell-star">⭐${it.stars > 1 ? it.stars : ''}</span>` : ''}
        </div>`;
    },

    ageHex(age) { return '#' + AGE_COLORS[age].toString(16).padStart(6, '0'); },

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
    THUMB_INK: 0.83,
    _thumbFit: {},          // dataURL → transform 문자열
    _thumbPending: {},
    // 렌더 직후 호출 — 이미 잰 썸네일은 즉시, 처음 보는 썸네일은 디코드 후 비동기로 적용한다
    fitThumbs(root) {
        const imgs = (root || document).querySelectorAll('img.fit-ink');
        for (const img of imgs) {
            const src = img.getAttribute('src');
            if (!src) continue;
            const t = this._thumbFit[src];
            if (t) { img.style.transform = t; continue; }
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
            let t = 'none';
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
                    // 배율은 상한을 둔다 — 빈 캔버스에 가까운 썸네일이 나와도 화면을 뚫지 않게
                    const k = Math.min(3.2, Math.max(1, this.THUMB_INK / Math.max(0.05, fill)));
                    // 잉크 중심을 프레임 중심으로: scale 먼저라 translate는 스케일 전 좌표계(요소 크기 %)
                    const ox = -((x0 + x1 + 1) / 2 / w - 0.5) * 100;
                    const oy = -((y0 + y1 + 1) / 2 / h - 0.5) * 100;
                    t = `scale(${k.toFixed(3)}) translate(${ox.toFixed(2)}%, ${oy.toFixed(2)}%)`;
                }
            } catch (e) { /* 캔버스 접근 실패(파일 프로토콜 등) — 원본 크기 그대로 둔다 */ }
            this._thumbFit[src] = t;
            document.querySelectorAll('img.fit-ink').forEach(el => {
                if (el.getAttribute('src') === src) el.style.transform = t;
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
            <div class="cmp-card" style="--rc:${this.ageHex(item.age)}">
                <div class="cmp-icon-wrap">
                    ${this.itemImgHTML(item, 'cmp-img')}
                    <span class="sk-lv">Lv.${item.level}</span>
                    ${item.stars ? `<span class="cmp-star">⭐${item.stars}</span>` : ''}
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
        // 원본은 전투력이 아니라 두 장비의 주 스탯(공격력/체력) 값을 직접 비교해 화살표를 매김 (UI-SPEC 25번)
        // 승천 별이 붙은 장비와 안 붙은 장비를 함께 비교해야 하므로 별 배율까지 반영한 itemValue로 견준다
        const newIsHigher = !cur || Forge.itemValue(item).gte(Forge.itemValue(cur));
        // 장착 중인 장비가 위, 새 장비가 아래 (UI-SPEC 25번)
        // 원본(shot-043224): 타이틀 줄 없음, 버튼 라벨은 "판매"/"장착"만 — 판매액·기존 판매 안내는 소자로
        this.els.craftModal.innerHTML = `
            <div class="modal-card wide" style="--rc:${this.ageHex(item.age)}">
                <div class="cmp-wrap">
                    ${this.itemCardHTML(cur, '장착됨', cur ? (newIsHigher ? 'down' : 'up') : null, false)}
                    ${this.itemCardHTML(item, '새로운!', cur ? (newIsHigher ? 'up' : 'down') : null, true)}
                </div>
                <div class="row">
                    <button class="btn sell" onclick="UI.resolveCraft('sell')">판매<small>${IconGen.img('coin')} +${U.fmt(Forge.sellPrice(item))}</small></button>
                    <!-- '기존 보관'은 보관함 시절 문구다 — 보관함 폐기 후 밀려난 장비는 보관되지 않고 사라지므로
                         그대로 두면 거짓 안내가 된다(사용자 확정 2026-08-17 "장착은 교체만"). -->
                    <button class="btn equip" onclick="UI.resolveCraft('equip')">장착${cur ? '<small>기존 교체</small>' : ''}</button>
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
        this.els.gearDetailModal.innerHTML = `
            <div class="modal-card wide gd-card">
                <div class="cmp-wrap">${this.itemCardHTML(S.equipment[slot], '장착됨', null, false)}</div>
            </div>`;
    },
        closeGearDetail() { this.els.gearDetailModal.classList.add('hidden'); this._gearDetailSlot = null; },

    // ---- 판매 코인 분출 (사용자 지시: "모루에서 코인이 터지듯 튀어나오고, 착지 자리마다 금액이 떠오르게") ----
    // 궤적은 CSS 키프레임이 소유하고(연타로 여러 벌이 동시에 돌아도 서로 안 잘라먹는다),
    // 포물선은 x(등속)와 y(상승 감속→낙하 가속)를 **다른 요소에 나눠 걸어** 만든다 — 한 요소에 걸면
    // translate가 합성되면서 직선으로 보인다. 착지 시각(비율)은 CSS 키프레임과 아래 상수가 같이 소유한다.
    COIN_FLY_MS: 780,
    COIN_LAND_K: 0.72,   // 키프레임에서 코인이 지면에 닿는 지점(= @keyframes coinFlyY의 72%)
    COIN_TOTAL_BEAT: 150, // 마지막 코인 착지 후 총액이 뜨기까지의 한 박자(ms)
    coinBurst(total) {
        total = Math.floor(Number(total) || 0);
        if (total <= 0) return;
        const btn = document.querySelector('.anvil-btn');
        const host = document.getElementById('app');
        if (!btn || !host) return; // 모루가 화면에 없으면(전체화면 시트 등) 조용히 생략
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
        const per = Math.floor(total / n);
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
        let lastLand = 0;   // 마지막 코인이 지면에 닿는 시각 — 총액은 이보다 뒤에만 뜬다
        for (let i = 0; i < n; i++) {
            // 마지막 코인이 나머지를 흡수 — 착지 금액의 합이 총액과 정확히 같아야 한다
            const amt = i === n - 1 ? total - per * (n - 1) : per;
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
            // 착지하는 그 순간 그 자리에서 금액이 떠오른다(데미지 숫자와 같은 문법)
            const landAt = delay + this.COIN_FLY_MS * this.COIN_LAND_K;
            if (landAt > lastLand) lastLand = landAt;
            setTimeout(() => {
                const t = document.createElement('span');
                t.className = 'coin-amt';
                t.textContent = '+' + U.fmt(amt);
                t.style.cssText = `left:${(ox + dx).toFixed(1)}px; top:${(oy + drop).toFixed(1)}px`;
                layer.appendChild(t);
                setTimeout(() => t.remove(), 760);
            }, landAt);
        }
        // 총 획득액은 모루 위에 크게 한 번 — 코인 개수만큼 나뉜 숫자만 보면 합계가 안 읽힌다.
        // 단 **폭발 즉시 띄우면 안 된다**(사용자 지시 2026-08-17: "코인이 착지한 다음 가격이 떠오르게").
        // 마지막 코인이 착지하고 한 박자(COIN_TOTAL_BEAT) 뒤에야 만들어 붙인다 — 그 전 프레임에는
        // 화면 어디에도 금액 텍스트가 없다가, 착지 자리 `+금액`들이 먼저 솟고 그 뒤에 합계가 따라온다.
        setTimeout(() => {
            const sum = document.createElement('span');
            sum.className = 'coin-total';
            sum.innerHTML = `+${U.fmt(total)} ${coinHtml}`;
            sum.style.cssText = `left:${ox}px; top:${(oy - 26)}px`;
            layer.appendChild(sum);
            setTimeout(() => sum.remove(), 1100);
        }, lastLand + this.COIN_TOTAL_BEAT);
        SFX.gacha('common'); // 동전 소리 대용 — 짧은 상승 스윕
    },

    // 스킬 컷인 + 화면 색 플래시
    skillCutin(def) {
        const el = document.getElementById('skill-cutin');
        el.textContent = `${SKILL_ICONS[def.id] || '✦'} ${def.name}`;
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

    // ---- 고등급 판매 경고 (사용자 지시 2026-08-17, 재확인 2026-08-17) ----
    // 비교 기준은 **오직 등급(RARITIES 인덱스)** 이다 — 시대(원시/중세…)·레벨·전투력 차이는 전부 무시.
    // 파는 장비의 등급이 그 부위에 남을 장비보다 **strictly 높을 때만** 물어본다.
    //   같은 등급이면 무경고(원시 일반↔천상 일반처럼 시대·레벨이 달라도 등급만 같으면 안 뜬다), 낮아도 무경고.
    //   [판매] → 새 장비가 팔리고 장착 중인 것이 남는다
    //   [장착] → 새 것을 끼고 **기존 장비는 그냥 사라진다**(판매 아님) — 파는 게 없으니 경고도 없다
    // 빈 부위는 **비교할 등급 자체가 없으므로 경고하지 않는다**(사용자 재확인 — 빈 부위마다 매번
    // 물어보면 잔소리가 된다. 전에는 -1로 쳐서 항상 물어봤다).
    // 자동 제련(main.js)의 자동 판매는 사용자가 건 필터가 이미 걸러낸 결과라 경고 대상이 아니다.
    rarityRank(item) { return item ? RARITIES.indexOf(item.rarity) : -1; },
    sellWarning(mode) {
        if (mode === 'equip') return null; // 장착은 아무것도 팔지 않는다
        const item = this._pendingItem;
        if (!item) return null;
        const kept = S.equipment[item.slot];
        if (!kept) return null; // 빈 부위 — 비교 대상이 없다
        if (this.rarityRank(item) <= this.rarityRank(kept)) return null;
        return { sold: item, kept };
    },
    resolveCraft(mode) {
        const warn = this.sellWarning(mode);
        if (warn) { this._pendingCraftMode = mode; this.showSellConfirm(warn); return; }
        this.doResolveCraft(mode);
    },
    // kept는 항상 있다 — sellWarning이 '남을 장비보다 등급이 높을 때'만 이걸 부르기 때문
    showSellConfirm({ sold, kept }) {
        const keptText = `장착 중인 <b>${RARITY_KR[kept.rarity]}</b> ${SLOT_KR[kept.slot]}보다 높은 등급입니다.`;
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper sellwarn-card">
                    <h3 class="sellwarn-title">정말 판매할까요?</h3>
                    <p class="sellwarn-body">
                        <span class="sellwarn-item" style="color:${UI.inkRarity(RARITY_CSS[sold.rarity])}">${RARITY_KR[sold.rarity]} ${sold.name}</span>
                        <span class="sellwarn-note">${keptText}</span>
                    </p>
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
        // [장착]은 장착만 하고 팝업을 그대로 열어 둔다 — 앞선 세션이 이걸 '현 사양상 정상'으로
        // 판정해 닫아 버렸던 게 잘못이었다. 단 **자동 제련 시퀀스 중에는 예외**다:
        // 거기서는 '선택 = 다음 제작으로 진행'이 사양이라(autocraft-seq 항목) 닫고 넘어가야
        // 시퀀스가 팝업 대기 상태로 멈추지 않는다.
        const auto = !!this._autoSeq;
        const keepOpen = mode === 'equip' && !auto;
        if (!keepOpen) this.els.craftModal.classList.add('hidden');
        if (!item) return;
        // [장착]은 장착만 한다 — 이전 장비는 팔지도 보관하지도 않고 그냥 사라진다(사용자 확정 2026-08-17)
        const prev = mode === 'equip' ? S.equipment[item.slot] : null;
        if (mode === 'equip') Forge.equip(item);
        else this.coinBurst(Forge.sell(item));
        this.renderTopBar();
        this.renderEquipSheet();
        saveGame();
        if (keepOpen) this.showCraftEquipped(prev, item);
        this.autoSeqStep();   // 자동 시퀀스가 이 선택을 기다리고 있었다면 다음 제작으로
    },
    // [장착] 직후에도 열려 있는 비교 팝업 — 무엇이 무엇으로 바뀌었는지를 그대로 보여준다.
    // 대기품은 이미 소비됐으므로 [판매]·[장착] 버튼은 살려 두면 안 된다(팔 것도 장착할 것도 없다).
    // 이 상태에서 닫는 길은 딤 클릭이다(판매는 더 이상 해당 사항이 없어 버튼 자체가 없다).
    showCraftEquipped(prev, item) {
        this.els.craftModal.innerHTML = `
            <div class="modal-card wide" style="--rc:${this.ageHex(item.age)}">
                <div class="cmp-wrap">
                    ${this.itemCardHTML(prev, '교체됨', null, false)}
                    ${this.itemCardHTML(item, '장착됨', null, true)}
                </div>
                <div class="row">
                    <button class="btn equip" disabled>장착 완료<small>딤을 누르면 닫힙니다</small></button>
                </div>
            </div>`;
        this.showModal(this.els.craftModal);
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
                    ${UI.petFace(pet.name, 'mt-inline')}
                    ${active ? '<span class="sk-ribbon">장착됨</span>' : ''}
                    <span class="sk-lv">Lv.${pet.level}</span>
                </span>
                ${pet.stars ? `<span class="sk-star">⭐${pet.stars}</span>` : ''}
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
            return `<button class="sk-mini square" style="--rc:${RARITY_CSS[pet.rarity]}" title="${PET_KR[pet.name] || pet.name} — 상세/해제" onclick="UI.openPetDetail(${i})">${UI.petFace(pet.name, 'mt-inline')}<small>Lv.${pet.level}</small></button>`;
        }).join('') || '<span class="muted">없음</span>';

        const mergeHtml = RARITIES.slice(0, -1).map(r => Pets.canMerge(r) ?
            `<button class="btn xs" onclick="UI.onMerge('${r}')">${RARITY_KR[r]} 3 → ${RARITY_KR[RARITIES[RARITIES.indexOf(r) + 1]]} 알</button>` : '').join('');

        const petLvl = Pets.summonLevel(), petCapped = petLvl >= 100;
        const petSummonN = this.summonMult('pet');

        p.innerHTML = `
            <div class="sheet-head">
                <span class="cur-pill egg">${IconGen.img('egg')} ${U.fmt(S.eggCurrency || 0)}</span>
                <h2 class="sheet-title">펫</h2>
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
                    ? `<button class="btn big summon-btn ascend-ready" onclick="UI.openAscension('pet')">⭐ 승천 가능<small class="summon-cost">소환 Lv.MAX</small></button>`
                    : `<button class="btn big summon-btn ${Pets.canSummon(petSummonN) ? '' : 'disabled'}" onclick="UI.onSummonPetEgg()">
                    소환 x${Pets.summonCount(petSummonN)}<small class="summon-cost">${IconGen.img('egg')} <b>${Pets.summonCost(petSummonN)}</b></small></button>`}
                <div class="summon-info">
                    <button class="info-dot" onclick="UI.openSummonRates('pet')">i</button>
                    <b>Lv. ${petLvl}</b>
                    <span class="summon-gauge"><i style="width:${(petCapped ? 1 : ((S.petSummonCount || 0) % 5) / 5) * 100}%"></i><em>${petCapped ? 'MAX' : `${(S.petSummonCount || 0) % 5}/5`}</em></span>
                </div>
            </div>
            <div class="hatchery">
                <button class="btn danger round back-btn hatch-back" onclick="UI.switchTab(null)">◀</button>
                <div class="hatch-row">${hatchHtml}</div>
                ${Pets.canBuySlot() ? `<button class="btn xs slot-buy" onclick="UI.onBuyHatchSlot()">슬롯 +1<br>${IconGen.img('gem')} ${Pets.slotCost()}</button>` : ''}
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
            <div class="idet-wrap">
                <div class="modal-card paper petd-card">
                    <button class="petd-share" onclick="UI.toast('📋 공유는 데모 버전에서 지원하지 않습니다')">📋</button>
                    <div class="petd-head">
                        <div class="petd-tilecol">
                            <div class="petd-tile" style="--rc:${RARITY_CSS[pet.rarity]}">
                                ${UI.petFace(pet.name, 'mt-inline')}
                                ${active ? '<span class="sk-ribbon">장착됨</span>' : ''}
                                <span class="sk-lv">Lv.${pet.level}</span>
                            </div>
                            ${pet.stars ? `<span class="sk-star">⭐${pet.stars}</span>` : ''}
                        </div>
                        <div class="petd-body">
                            <div class="petd-name" style="color:${UI.inkRarity(RARITY_CSS[pet.rarity])}">[${RARITY_KR[pet.rarity]}] ${PET_KR[pet.name] || pet.name}</div>
                            <div class="petd-stats">${U.fmt(pw.atk)} 피해<br>${U.fmt(pw.hp)} 체력</div>
                            <div class="petd-subs">${subsHtml || '옵션 없음'}</div>
                        </div>
                    </div>
                    <div class="petd-btns">
                        ${maxed
                            ? `<button class="btn primary petd-btn disabled">업그레이드<small>Lv.${Pets.MAX_LEVEL} 만렙</small></button>`
                            : `<button class="btn primary petd-btn" onclick="UI.closeDetail(); UI.openPetUpgrade(${i})">업그레이드</button>`}
                        <button class="btn petd-btn ${active ? 'danger' : 'primary'}" onclick="UI.onTogglePet(${i}); UI.openPetDetail(${i})">${active ? '제거' : '장착'}</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">✕</button>
            </div>`;
        this.showModal(this.els.detailModal);
        this.hydrateMountThumbs();   // 펫 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
    },

    onSummonPetEgg() {
        const count = this.summonMult('pet');
        const r = Pets.summon(count);
        if (!r) { this.toast(Pets.eggSpace() < 1 ? `🥚 알 보관함이 가득 찼습니다 (${S.eggs.length}/${Pets.EGG_CAP})` : '🥚 알이 부족합니다 (펫 던전에서 획득)'); return; }
        // 보관함 여유가 배수보다 적어 줄어든 경우엔 몇 개만 나갔는지 알려준다(버튼이 죽지는 않는다)
        if (r.clamped) this.toast(`🥚 보관함 여유만큼 ${r.summoned}개만 소환했습니다 (${S.eggs.length}/${Pets.EGG_CAP})`);
        this.renderPets();
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
                <button class="x-btn" onclick="UI.closeDetail()">✕</button>
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
        if (!Pets.toggleActive(i)) this.toast(`출전은 최대 ${Pets.MAX_ACTIVE}마리입니다`);
        this.renderPets();
    },
    onMerge(r) { Pets.merge(r); this.renderPets(); },
    // ---- 펫 업그레이드 팝업 (경험치 흡수형, UI-SPEC 9·12·13번) ----
    _petUpgradeTarget: null, _petUpgradeMats: null,
    openPetUpgrade(idx) {
        this._petUpgradeTarget = idx;
        this._petUpgradeMats = { pets: [], eggs: [] };
        this.renderPetUpgrade();
        this.showModal(this.els.petUpgradeModal);
    },
    closePetUpgrade() { this.els.petUpgradeModal.classList.add('hidden'); },
    // UI-SPEC 55번(원본 shot-042503) 레이아웃: 대상 카드(장착됨+Lv+⭐+피해/체력) → 경험치 바 →
    // "합칠 펫 선택"+[업그레이드] → 등급별 일괄 선택 버튼 행 → 구분선 → 보유 펫·알 타일 그리드(.pet-tile 재사용, ✓ 체크 선택·무제한)
    renderPetUpgrade() {
        const target = S.pets[this._petUpgradeTarget];
        if (!target) { this.closePetUpgrade(); return; }
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
                    ${UI.petFace(p.name, 'mt-inline')}
                    ${locked ? '<span class="sk-ribbon">장착됨</span>' : ''}
                    <span class="sk-lv">Lv.${p.level}</span>
                    ${on ? '<span class="tile-check">✓</span>' : ''}
                </span>
            </button>`;
        }).join('');
        const eggTiles = S.eggs.map((e, i) => `
            <button class="pet-tile egg ${sel.eggs.includes(i) ? 'selected' : ''}" style="--rc:${RARITY_CSS[e.rarity]}" onclick="UI.onToggleUpgradeMat('egg', ${i})">
                <span class="tile-face">${IconGen.img('egg', null, { tint: RARITY_CSS[e.rarity] })}${sel.eggs.includes(i) ? '<span class="tile-check">✓</span>' : ''}</span>
                <span class="tile-label">알</span>
            </button>`).join('');
        const tilesHtml = petTiles + eggTiles || '<span class="muted mat-empty">재료로 쓸 펫/알이 없습니다</span>';

        // 슬롯 5칸 행 폐지 → 보유 등급별 일괄 선택 버튼 (알=🥚 실루엣, 펫=🐾 실루엣, 등급색 — 사용자 지시)
        const bulkBtns = RARITIES.map(r => {
            const eggPool = this._matPool('egg', r), petPool = this._matPool('pet', r);
            let h = '';
            if (eggPool.length) {
                const all = eggPool.every(i => sel.eggs.includes(i));
                h += `<button class="petup-bulk ${all ? 'on' : ''}" style="--rc:${RARITY_CSS[r]}" title="${RARITY_KR[r]} 알 전체 ${all ? '해제' : '선택'}" onclick="UI.onBulkSelectMat('egg','${r}')"><span class="bulk-sil">🥚</span><span class="bulk-n">${eggPool.length}</span></button>`;
            }
            if (petPool.length) {
                const all = petPool.every(i => sel.pets.includes(i));
                h += `<button class="petup-bulk ${all ? 'on' : ''}" style="--rc:${RARITY_CSS[r]}" title="${RARITY_KR[r]} 펫 전체 ${all ? '해제' : '선택'}" onclick="UI.onBulkSelectMat('pet','${r}')"><span class="bulk-sil">🐾</span><span class="bulk-n">${petPool.length}</span></button>`;
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
                    <div class="petup-head">
                        <div class="petup-icon" style="--rc:${RARITY_CSS[target.rarity]}">
                            ${UI.petFace(target.name, 'mt-inline')}
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
                <button class="x-btn" onclick="UI.closePetUpgrade()">✕</button>
            </div>`;
        this.hydrateMountThumbs();   // 펫 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
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
            return `<button class="sk-cell" onclick="UI.openSkillDetail('${d.id}')">
                <span class="sk-orb" style="--rc:${RARITY_CSS[d.rarity]}">
                    ${IconGen.skill(d.id)}
                    ${equipped ? '<span class="sk-ribbon">장착됨</span>' : ''}
                    <span class="sk-lv">Lv.${sk.level}</span>
                </span>
                ${sk.stars ? `<span class="sk-star">⭐${sk.stars}</span>` : ''}
                <span class="sk-shard"><i style="width:${ratio}%"></i><em>${sk.dupes}/${need}</em></span>
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
                <button class="btn danger round back-btn" onclick="UI.switchTab(null)">◀</button>
                <button class="btn xs x5-toggle ${skillSummonN > 1 ? 'on' : ''}" onclick="UI.cycleSummonMult('skill')">x${skillSummonN}</button>
                ${Ascension.ready('skill')
                    ? `<button class="btn big summon-btn ascend-ready" onclick="UI.openAscension('skill')">⭐ 승천 가능<small class="summon-cost">소환 Lv.MAX</small></button>`
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
        // 0% 등급도 표시 — 확률표 열람이 목적이라 안 나오는 등급도 보여야 한다 (사용자 재지시 2026-08-17)
        const barsHtml = RARITIES.map(r => `
            <div class="rate-bar" style="--rc:${RARITY_CSS[r]}">
                <span class="rate-name">${RARITY_KR[r]} <i class="rate-star">⭐</i></span>
                <span class="rate-pct">${(rates[r] || 0).toFixed(2)}%</span>
            </div>`).join('');
        const cnt = (isMount ? S.mountOpens : isPet ? S.petSummonCount : S.summonCount) || 0;
        const capped = isMount ? Mounts.level() >= Mounts.MAX_LEVEL : mod.summonLevel() >= 100;
        const gaugeHtml = isMount
            ? (() => { const need = Mounts.nextNeeded(), prev = Mounts.prevNeeded();
                return `<div class="rates-prog"><div style="width:${(need ? U.clamp((cnt - prev) / (need - prev), 0, 1) : 1) * 100}%"></div><span>${need ? `${cnt - prev}/${need - prev}` : 'MAX'}</span></div>`; })()
            : `<div class="rates-prog"><div style="width:${(capped ? 1 : (cnt % 5) / 5) * 100}%"></div><span>${capped ? 'MAX' : `${cnt % 5}/5`}</span></div>`;
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper rates-card">
                    <div class="rates-head">
                        <button class="tri-btn" onclick="UI.stepSummonRates(-1)">◀</button>
                        <div><h3>레벨 ${lvl}</h3><div class="rates-sub">소환 확률</div></div>
                        <button class="tri-btn" onclick="UI.stepSummonRates(1)">▶</button>
                    </div>
                    <button class="rates-i" onclick="UI.toast('소환 레벨이 오르면 높은 등급 확률이 올라갑니다')">i</button>
                    <div class="rate-list">${barsHtml}</div>
                    <p class="rates-tip">${isMount ? '태엽으로' : isPet ? '알을' : '티켓을'} 소환하여 레벨 업하고 소환 확률을 높이세요!</p>
                    ${gaugeHtml}
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">✕</button>
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
        const desc = d.type === 'heal' ? `체력을 ${Math.round(Skills.effHeal(id) * 100)}% 회복합니다.`
            : d.type === 'buff' ? Object.entries(d.buff).map(([k, v]) => (k === 'atkPct' ? '공격력' : '공격 속도') + ` +${v}%`).join(', ') + ' 버프를 겁니다.'
            : `${d.type === 'aoe' ? '범위 안의 적 전체에게' : '적 하나에게'} 각각 <b>${U.fmt(Skills.dmg(id))}의 피해</b>를 줍니다.`;
        // 원본(shot-042426): 좌상단 원형 오브(Lv뱃지+별+검정 조각 게이지) + 우측 제목·설명,
        // 하단 "패시브:" 라벨+회색 pill, 대형 [업그레이드(실버)][장착(파랑)] 2분할 버튼
        const ratio = U.clamp(sk.dupes / need, 0, 1) * 100;
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper skd-card">
                    <div class="skd-head">
                        <div class="skd-orbcol">
                            <span class="sk-orb" style="--rc:${RARITY_CSS[d.rarity]}">${IconGen.skill(id)}<span class="sk-lv">Lv.${sk.level}</span></span>
                            ${sk.stars ? `<span class="sk-star">⭐${sk.stars}</span>` : ''}
                            <span class="sk-shard"><i style="width:${ratio}%"></i><em>${sk.dupes}/${need}</em></span>
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
                <button class="x-btn" onclick="UI.closeDetail()">✕</button>
            </div>`;
        this.showModal(this.els.detailModal);
    },
    closeDetail() { this.els.detailModal.classList.add('hidden'); },

    onSummon(useGems) {
        const count = this.summonMult('skill');
        const r = Skills.summon(useGems, count);
        if (!r) { this.toast(useGems ? '💎 젬이 부족합니다' : '🎫 티켓이 부족합니다 (스테이지 클리어로 획득)'); return; }
        this.renderSkills(); this.renderSkillBar(); this.renderTopBar();
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

    // ---- 던전: 가로 배너 목록 + 상세(난이도 선택) 팝업 (UI-SPEC 6~7번) ----
    openDungeons() {
        Dungeons.ensure();
        const bannerHtml = Dungeons.DEFS.map(d => {
            const ok = Dungeons.unlocked(d.id);
            const keys = S.dungeons.keys[d.id];
            const hex = '#' + d.theme.sky.toString(16).padStart(6, '0');
            // 원본 배치: 좌상단 아이콘+이름, 우측에 열쇠 수와 [열기] 버튼을 세로로
            return `<div class="dg-banner ${ok ? '' : 'locked'}" style="--bg:${hex}">
                <span class="dg-icon">${d.icon}</span>
                <div class="dg-info">
                    <div class="item-name">${d.kr}</div>
                    ${ok ? '' : `<span class="dg-lock">🔒 ${d.unlock} 도달 시 해금</span>`}
                </div>
                <div class="dg-right">
                    ${ok ? `<span class="dg-keys">🗝 ${keys}/${Dungeons.MAX_KEYS}</span>` : ''}
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
                <button class="league-back-btn sheet-back-btn" onclick="UI.closeDungeons()">◀</button>
            </div>`;
        this.showModal(this.els.dungeonModal);
    },
    closeDungeons() { this.els.dungeonModal.classList.add('hidden'); },

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
                    <div class="dg-detail-hero" style="--bg:${hex}"><span class="dg-icon">${d.icon}</span><span class="dgd-title">${d.kr}</span></div>
                    <div class="dgd-stage-row">
                        <button class="tri-btn" onclick="UI.onDungeonStageStep(-1)" style="visibility:${stage <= 1 ? 'hidden' : 'visible'}">◀</button>
                        <div class="dgd-stage"><span>난이도</span><b>${stage}단계</b></div>
                        <button class="tri-btn" onclick="UI.onDungeonStageStep(1)" style="visibility:${stage >= best + 1 ? 'hidden' : 'visible'}">▶</button>
                    </div>
                    <div class="dgd-reward-pill"><span class="dgd-reward-label">보상:</span>${Dungeons.rewardText(id, stage)}</div>
                    <div class="dgd-keys">🗝 ${keys}/${Dungeons.MAX_KEYS}</div>
                    <div class="dgd-btns">
                        <button class="btn silver dgd-btn ${keys > 0 && best >= 1 ? '' : 'disabled'}" onclick="UI.onSweepDungeon('${id}')">이전 스테이지<br>소탕</button>
                        <button class="btn silver dgd-btn ${keys > 0 ? '' : 'disabled'}" onclick="UI.onEnterDungeon('${id}', ${stage})">입장</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeDungeonDetail()">✕</button>
            </div>`;
    },
    onEnterDungeon(id, stage) {
        if (Dungeons.enter(id, stage)) { this.closeDungeonDetail(); this.closeDungeons(); this.updateStageLabel(); this.renderTopBar(); }
        else this.renderDungeonDetail(); // 실패 사유 토스트 후 갱신
    },
    onSweepDungeon(id) {
        // 소탕 성공 시 열쇠가 줄어드는데, 상세 팝업 뒤에 계속 열려 있는 던전 목록(🔑 개수 표시)도 함께 갱신해야 함
        if (Dungeons.sweep(id)) { this.renderDungeonDetail(); this.keepScroll(() => this.openDungeons()); this.renderTopBar(); }
    },

    // ---- PvP 리그 (UI-SPEC 3~5번, 원본 shot-042149/042208/042228): 랭킹 → 리그 보상 팝업 / 상대 선택 팝업 (봇 기반 오프라인 구현) ----
    leagueRow(e, rank) {
        return `<div class="league-row ${e.isMe ? 'me' : ''}">
            <span class="league-rank">${rank}</span>
            <span class="league-avatar">${e.avatar}</span>
            <span class="league-name">${U.escapeHtml(e.name)}<br><small>⚔️ ${U.fmt(e.cp)}</small></span>
            <span class="league-score">⭐ ${U.fmt(e.score)}</span>
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
                <div class="league-emblem">🛡️</div>
                <div class="league-title">플래티넘 리그</div>
                <div class="league-season-bar" onclick="UI.openLeagueRewards()">🎁 <span>시즌 종료: <b>${U.fmtTime(remain)}</b></span></div>
                <div class="league-list">${windowRows}</div>
                <div class="league-foot">
                    <div class="league-pinned">${this.leagueRow(me, myRank)}</div>
                    <div class="league-actions">
                        <button class="league-back-btn" onclick="UI.closeLeague()">◀</button>
                        <button class="btn primary" onclick="UI.openLeagueChallenge()">도전</button>
                    </div>
                </div>
            </div>`;
    },
    openLeagueRewards() { this.renderLeagueRewards(); },
    renderLeagueRewards() {
        const myRank = League.myRank();
        const cur = League.rewardForRank(myRank);
        const rowsHtml = League.REWARD_TIERS.map(t => {
            const r = League.rewardForRank(t.rank);
            const isTop3 = t.rank <= 3;
            const icon = t.rank === 1 ? '👑' : t.rank === 2 ? '🥈' : t.rank === 3 ? '🥉' : t.label;
            return `<div class="league-reward-tier">
                <div class="league-tier-rank ${isTop3 ? '' : 'text'}">${icon}</div>
                <div class="league-tier-grid">${this.leagueRewardGrid(r)}</div>
            </div>`;
        }).join('');
        const remain = (S.league.seasonEndsAt - U.now()) / 1000;
        this.els.leagueModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide lgr-card">
                    <div class="league-reward-banner">플래티넘 리그 보상</div>
                    <p class="league-reward-desc">현재 순위(${myRank})를 유지하면 시즌 종료 시<br>다음 보상을 받을 수 있습니다:</p>
                    <div class="league-reward-grid">${this.leagueRewardGrid(cur)}</div>
                    <div class="league-collect-pill">수집까지: <b>${U.fmtTime(remain)}</b></div>
                    <div class="league-reward-table">${rowsHtml}</div>
                </div>
                <button class="x-btn" onclick="UI.openLeague()">✕</button>
            </div>`;
    },
    openLeagueChallenge() { this.renderLeagueChallenge(); },
    renderLeagueChallenge() {
        const list = League.challengeList();
        const rowsHtml = list.map((b, i) => `
            <div class="league-challenge-row">
                <span class="league-challenge-avatar">${b.avatar}</span>
                <span class="league-challenge-name">${U.escapeHtml(b.name)}<br><small>⚔️ ${U.fmt(b.cp)}</small></span>
                <span class="league-challenge-side">
                    <span class="star">⭐+${b.starReward}</span>
                    <button class="btn sm ${S.league.tickets > 0 ? '' : 'disabled'}" onclick="UI.onChallenge(${i})">도전<br><small>${IconGen.img('ticket')}1</small></button>
                </span>
            </div>`).join('');
        this.els.leagueModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide">
                    <div class="profile-title">상대 선택</div>
                    <p class="league-challenge-desc">도전 티켓은 매일 09:00에 보충됩니다!</p>
                    <div class="league-ticket-pill">${IconGen.img('ticket')} ${S.league.tickets}/${League.TICKET_MAX}</div>
                    <div>${rowsHtml}</div>
                </div>
                <button class="x-btn" onclick="UI.openLeague()">✕</button>
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
    CURRENCY_ICON: { coins: 'coin', hammers: 'hammer', gems: 'gem', tickets: 'ticket', potions: 'potion', winders: 'winder', eggCurrency: 'egg' },
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
                ? `<div class="pass-cell free lit done">${this.passRewardLines(m.free)}<span class="pass-badge check">✓</span></div>`
                : reached
                    ? `<button class="pass-cell free lit claimable" onclick="UI.onClaimPass('${m.stage}')">${this.passRewardLines(m.free)}</button>`
                    : `<div class="pass-cell free">${this.passRewardLines(m.free)}</div>`;
            // 프리미엄 칸도 무료 칸과 같은 도달 기준으로 밝기가 바뀐다(항상 잠김이지만 도달 전이면 카드 배경에 녹아듦, 원본 shot-042705)
            const premiumCell = `<div class="pass-cell premium ${reached ? 'lit' : ''}" onclick="UI.onPremiumPass()">${this.passRewardLines(m.premium)}<span class="pass-badge lock">🔒</span></div>`;
            return `<div class="pass-milestone-label">${this.difficultyLabel(c)} ${m.stage}</div>
                <div class="pass-row">${freeCell}${premiumCell}</div>`;
        }).join('');
        this.els.passModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide pass-card">
                    <div class="pass-sword">🗡️</div>
                    <div class="pass-banner">진행 패스</div>
                    <div class="pass-desc-row">
                        <!-- 원본(042705)은 "…보상을 받 / 으세요!"로 단어 중간에서 접힌다(2행 모두 가운데 정렬) -->
                        <p class="pass-desc">전투를 진행하여 보상을 받<br>으세요!</p>
                        <div class="pass-price" onclick="UI.onPremiumPass()">${Pass.PREMIUM_PRICE_KR}</div>
                    </div>
                    <div class="pass-header-row"><span>무료</span><span>프리미엄</span></div>
                    <div class="pass-track">${rowsHtml}</div>
                </div>
                <button class="x-btn" onclick="UI.closePass()">✕</button>
            </div>`;
    },
    onClaimPass(key) {
        if (Pass.claim(key)) { this.toast('🎁 진행 패스 보상 수령!'); this.renderPass(); this.renderTopBar(); }
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
        const GEM_ICONS = ['🪙', '👛', '💰'];
        const dealsHtml = Shop.DEALS.map(d => {
            const claimed = Shop.claimed(d.key);
            const rewardRows = Object.entries(d.reward).map(([k, v]) =>
                `<span class="shop-reward-pill">${this.curIcon(k)} ${U.fmt(v)}</span>`).join('');
            return `<div class="shop-deal-card">
                <div class="shop-deal-tag">${d.name}</div>
                <div class="shop-deal-body">
                    <div class="shop-deal-rewards">${rewardRows}</div>
                    <div class="shop-deal-right">
                        <span class="shop-deal-art art-${d.key}"><i class="art-emblem">${d.icon}</i>${d.key === 'mount' ? '<i class="art-spill">⚙️⚙️⚙️</i>' : ''}</span>
                        <button class="btn primary shop-price-btn ${claimed ? 'disabled' : ''}" onclick="UI.onClaimDeal('${d.key}')">
                            ${claimed ? '수령 완료' : `무료 수령<br><small>(정가 ${d.priceKR})</small>`}</button>
                    </div>
                </div>
            </div>`;
        }).join('');
        const gemsHtml = Shop.GEM_PACKS.map((p, i) => `
            <div class="shop-gem-card">
                <div class="shop-gem-amt"><span class="shop-gem-dia">${IconGen.img('gem')}</span> ${U.fmt(p.gems)}</div>
                <span class="shop-gem-icon">${GEM_ICONS[i] || '💰'}</span>
                <button class="btn primary shop-price-btn" onclick="UI.onBuyGems()">${p.priceKR}</button>
            </div>`).join('');
        this.els.shopModal.innerHTML = `
            <div class="modal-card sheet shop-sheet">
                <div class="sheet-head">
                    <span class="cur-pill coin">${IconGen.img('coin')} ${U.fmt(S.coins)}<i class="cur-plus">+</i></span>
                    <h2 class="sheet-title shop-title">상점</h2>
                    <span class="cur-pill gem">${IconGen.img('gem')} ${U.fmt(S.gems)}<i class="cur-plus">+</i></span>
                </div>
                <div class="shop-banner">오늘의 특가</div>
                <p class="shop-sub">일일 특가 3개 모두 구매하면 새로운 3개가 나와요!</p>
                <div class="shop-deals">${dealsHtml}</div>
                <div class="shop-banner">보석</div>
                <div class="shop-gems">${gemsHtml}</div>
            </div>`;
    },
    onClaimDeal(key) {
        if (Shop.claimDeal(key)) { this.toast('🎁 특가 보상 수령!'); this.renderShop(); this.renderTopBar(); }
        else this.toast('오늘은 이미 수령했습니다');
    },
    onBuyGems() { this.toast('💎 데모 버전에서는 결제를 지원하지 않습니다'); },

    // ---- 프로필/설정 팝업 (UI-SPEC 19~20번): 프로필(이름·아바타 편집) / 설정(음악·사운드 실동작 토글) ----
    AVATAR_POOL: ['🛡️', '🧙', '🥷', '🦸', '🧝', '🧛', '🐲', '🦖', '🐺', '🦊', '🐯', '👑'],
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
                `<button class="avatar-pick-btn ${e === (S.avatarEmoji || '🛡️') ? 'on' : ''}" onclick="UI.onPickAvatar('${e}')">${e}</button>`).join('')}</div>` : '';
        this.els.profileModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide profile-sheet">
                    <div class="profile-title">프로필</div>
                    <div class="profile-top">
                        <div class="profile-avatar-box">
                            <span class="profile-avatar-big">${S.avatarEmoji || '🛡️'}</span>
                            <button class="profile-edit-btn" onclick="UI.onToggleAvatarPick()">✏️</button>
                        </div>
                        <div class="profile-fields">
                            <div class="profile-field-label">이름:</div>
                            <div class="profile-field-row">
                                <span class="profile-field">${U.escapeHtml(S.nickname || '용사')}</span>
                                <button class="profile-edit-btn" onclick="UI.onEditNickname()">✏️</button>
                            </div>
                            <div class="profile-field-label">성별:</div>
                            <div class="profile-field-row">
                                <span class="profile-field">${S.gender || '♂'}</span>
                                <button class="profile-edit-btn" onclick="UI.onToggleGender()">✏️</button>
                            </div>
                        </div>
                    </div>
                    ${avatarPicker}
                    <div class="profile-rank-label">서버 랭킹</div>
                    <div class="profile-rank-row">
                        <button class="btn primary" onclick="UI.openStub('🏆 파워 랭킹', '서버 내 전투력 랭킹은 준비 중입니다.')">파워 랭킹</button>
                        <button class="btn primary" onclick="UI.openStub('🛡 클랜 랭킹', '클랜 시스템은 준비 중입니다.')">클랜 랭킹</button>
                    </div>
                    <div class="profile-tabs">
                        <button class="${this._profileView === 'profile' ? 'on' : ''}" onclick="UI.switchProfileView('profile')">프로필</button>
                        <button class="${this._profileView === 'settings' ? 'on' : ''}" onclick="UI.switchProfileView('settings')">설정</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeProfile()">✕</button>
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
                <span>${label}</span><span class="settings-check">✔</span>
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
                <button class="x-btn" onclick="UI.closeProfile()">✕</button>
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
    closePlayerInfo() { this.els.playerInfoModal.classList.add('hidden'); },
    renderPlayerInfo() {
        const stats = Forge.heroStats();
        const cp = Combat.combatPower();
        const stars = Ascension.totalStars();

        // 현재 전투 장면 미니 프리뷰: 원본은 실제 전투 화면 스냅샷 — 3D 캔버스를 같은 프레임에
        // 강제 렌더한 직후 toDataURL로 캡처해 img로 넣는다(preserveDrawingBuffer 없이 동작).
        // 캡처 실패(WebGL 미지원 등) 시 기존 근사 표기로 폴백.
        let previewHtml;
        try {
            Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
            const shot = Scene3D.renderer.domElement.toDataURL('image/jpeg', 0.6);
            previewHtml = `<div class="pinfo-preview shot"><img src="${shot}" alt=""></div>`;
        } catch (e) {
            const waveHtml = Dungeons.run ? '' : [1, 2, 3, 4, 5].map(w =>
                `<span class="pip ${w < Combat.wave ? 'done' : w === Combat.wave ? 'now' : ''}"></span>`).join('');
            previewHtml = `<div class="pinfo-preview"><span>🛡️</span><span>${this.els.stageLabel.textContent}</span>${waveHtml}</div>`;
        }

        let gearHtml = SLOTS.map(slot => this.equipCellHTML(slot)).join('');
        // 원본(043313): 장비 2행 우측 와이드 파란 탈것 카드 (185 재채점)
        const am = S.activeMount ? S.mounts[S.activeMount] : null;
        gearHtml += am
            ? `<div class="equip-cell egg-cell pinfo-mount-wide" onclick="UI.openMounts()">
                ${UI.mountFace(S.activeMount, 'cell-img emoji')}
                <span class="cell-lv">Lv.${am.level}</span></div>`
            : `<div class="equip-cell egg-cell empty pinfo-mount-wide" onclick="UI.openMounts()"><span class="slot-name">탈것</span></div>`;

        // 슬롯 클릭 → 각 세부정보 팝업이 플레이어 정보 위에 겹쳐 뜸 (사용자 지시 — 닫으면 플레이어 정보로 복귀)
        const skillIconsHtml = S.equippedSkills.map(id => `<button class="sk-cell" onclick="UI.openSkillDetail('${id}')">
            <span class="sk-orb" style="--rc:${RARITY_CSS[Skills.def(id).rarity]}">${IconGen.skill(id)}<span class="sk-lv">Lv.${Skills.level(id)}</span></span></button>`).join('');
        const petIconsHtml = S.activePets.map(i => {
            const p = S.pets[i];
            return `<button class="sk-cell" onclick="UI.openPetDetail(${i})">
                <span class="sk-orb">${UI.petFace(p.name, 'mt-inline')}<span class="sk-lv">Lv.${p.level}</span></span></button>`;
        }).join('');
        const mountIconHtml = S.activeMount && S.mounts[S.activeMount] ? `<button class="sk-cell" onclick="UI.openMountUpgrade('${S.activeMount}')">
            <span class="sk-orb">${UI.mountFace(S.activeMount, 'mt-inline')}<span class="sk-lv">Lv.${S.mounts[S.activeMount].level}</span></span></button>` : '';

        const subsHtml = SUBSTATS
            .map(([key, label]) => ({ key, label, value: +stats.subs[key].toFixed(1) }))
            .filter(s => s.value > 0)
            .map(s => `<div>${U.subText(s)}</div>`)
            .join('') || '<div class="muted">보유한 옵션 없음</div>';

        this.els.playerInfoModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card wide">
                    <div class="pinfo-header">
                        <div class="pinfo-id">
                            <span class="avatar">${S.avatarEmoji || '🛡️'}</span>
                            <div class="pinfo-id-text">
                                <span class="name">${U.escapeHtml(S.nickname || '용사')} <span class="muted">[무소속]</span></span>
                                <span class="clan">${S.gender || '♂'} · 서버 1</span>
                                <span class="cp">⚔️ ${U.fmt(cp)}</span>
                            </div>
                        </div>
                        <div class="pinfo-right">
                            <div>Lv. ${S.forgeLevel} 대장간${stars ? ` ⭐${stars}` : ''}</div>
                            <div>${U.fmt(stats.atk)} 총 피해</div>
                            <div>${U.fmt(stats.hp)} 총 체력</div>
                        </div>
                    </div>
                    ${previewHtml}
                    <div class="equip-grid pinfo-gear">${gearHtml}</div>
                    <div class="pinfo-loadout-row">${skillIconsHtml}${(petIconsHtml + mountIconHtml) || '<span class="muted">출전 중인 펫 없음</span>'}</div>
                    <div class="pinfo-subs-list">${subsHtml}</div>
                </div>
                <button class="x-btn" onclick="UI.closePlayerInfo()">✕</button>
            </div>`;
        this.hydrateMountThumbs();   // 탈것 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
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
                <span class="chat-avatar">${m.myAvatar}</span>
                <div class="chat-bubble-wrap">
                    <div class="chat-name-line"><span class="chat-name" style="color:${this.chatNameColor(m.myName)}">${m.tag ? `<span class="chat-tag">[${U.escapeHtml(m.tag)}]</span> ` : ''}${U.escapeHtml(m.myName)}</span>${this.chatNameIcons({ name: m.myName, gender: m.gender })}<span class="chat-time">${this.chatTime(m.at)}</span></div>
                    <div class="chat-share-card">
                        <div class="chat-share-side win">
                            <span class="chat-share-label">승리</span>
                            <span class="icon-circle sm">${winner.avatar}</span>
                            <small>${U.escapeHtml(winner.name)}</small>
                            <small>⚔️ ${U.fmt(winner.cp)}</small>
                        </div>
                        <div class="chat-share-side lose">
                            <span class="icon-circle sm">${loser.avatar}</span>
                            <small>${U.escapeHtml(loser.name)}</small>
                            <small>⚔️ ${U.fmt(loser.cp)}</small>
                        </div>
                        <span class="chat-share-cam">📹</span>
                    </div>
                </div>
            </div>`;
        }
        const tagHtml = m.tag ? `<span class="chat-tag">[${U.escapeHtml(m.tag)}]</span> ` : '';
        return `<div class="chat-row ${m.mine ? 'mine' : ''}">
            <span class="chat-avatar">${m.avatar}</span>
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
            <span class="chat-preview-avatar">💬<span class="chat-preview-badge">99</span></span>
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
        const list = document.getElementById('chat-list');
        if (list) list.scrollTop = list.scrollHeight;
    },
    closeChat() { this.els.chatModal.classList.add('hidden'); },
    renderChatFull() {
        // 봇 메시지 도착 시 재렌더링돼도 입력 중이던 텍스트·스크롤 위치를 잃지 않도록 보존
        const prevInput = document.getElementById('chat-input');
        const draft = prevInput ? prevInput.value : '';
        const prevList = document.getElementById('chat-list');
        const wasAtBottom = !prevList || (prevList.scrollHeight - prevList.scrollTop - prevList.clientHeight < 40);

        const listHtml = S.chat.messages.map(m => this.chatMsgHtml(m)).join('');
        this.els.chatModal.innerHTML = `
            <div class="modal-card chat-card">
                <div class="chat-list" id="chat-list">${listHtml}</div>
                <div class="chat-input-bar">
                    <button class="btn danger round" onclick="UI.closeChat()">◀</button>
                    <input id="chat-input" type="text" placeholder="메시지 보내기..." maxlength="200"
                        onkeydown="if(event.key==='Enter') UI.onSendChat()">
                </div>
            </div>`;
        const input = document.getElementById('chat-input');
        if (input && draft) input.value = draft;
        const list = document.getElementById('chat-list');
        if (list && wasAtBottom) list.scrollTop = list.scrollHeight;
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
                ? ` <small id="tech-b-time-${b.id}">(${U.fmtTime((S.techResearch.endsAt - U.now()) / 1000)})</small>` : '';
            return `<button class="tech-branch-card" onclick="UI.openTechBranch('${b.id}')">
                <div class="tech-branch-head">${b.name}</div>
                <div class="tech-branch-icon">${b.icon}</div>
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
            <button class="league-back-btn sheet-back-btn" onclick="UI.switchTab(null)">◀</button>`;
    },
    // 분기 상세: **단계가 가로 블록**인 5단계 트리 (사용자 재정정 2026-08-17 4회차).
    // 한 단계에 그 분기의 타입이 전부 놓이고(폭이 좁아 2개씩 흘려 쌓는다), 같은 타입이
    // 5단계에 반복된다. 해금은 '바로 위 단계의 같은 타입 노드가 1레벨 이상'이다.
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
            const cls = researching ? 'researching' : max ? 'done' : !open ? 'tlocked' : lv > 0 ? 'active' : 'locked';
            const face = max ? '✅' : !open ? '🔒' : (TechTree.def(id) || {}).icon || '🔬';
            const badge = researching
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
            <button class="fi-info-btn tech-branch-info" onclick="UI.openTechBonuses()">!</button>
            <div class="tech-tree-col"><svg class="tech-tree-links" aria-hidden="true"></svg>${rowsHtml.join('')}</div>
            <button class="btn danger tech-tree-back" onclick="UI.openTechOverview()">◀</button>`;
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
                <button class="x-btn" onclick="UI.closeDetail()">✕</button>
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
            actionHtml = `<button class="btn sm primary disabled">🔒 잠김</button>
                <p class="muted" style="text-align:center">${what} 1레벨 이상 올리면 열립니다</p>`;
        } else if (researching) {
            const remain = (S.techResearch.endsAt - U.now()) / 1000;
            // 원본(042605): 남색 트랙+파란 채움 진행바, [건너뛰기/◆N] 실버 블록 + [취소] 빨간 블록 2단
            actionHtml = `<div class="idet-lead" style="text-align:center">연구 진행 중</div>
                <div class="upg-progress tech-prog"><div id="tech-node-fill" style="width:${U.clamp(1 - remain / TechTree.time(id, lv + 1), 0, 1) * 100}%"></div><span id="tech-node-time">${U.fmtTime(remain)}</span></div>
                <div class="idet-btns tech-btns">
                    <button class="btn silver tn-skip" onclick="UI.onTechGemSkip()">건너뛰기<small>${IconGen.img('gem')} ${TechTree.gemSkipCost()}</small></button>
                    <button class="btn danger tn-cancel" onclick="UI.onTechCancel()">취소</button>
                </div>`;
        } else {
            const cost = TechTree.nextCost(id), time = TechTree.time(id, lv + 1);
            const disabled = otherResearch || S.potions < cost;
            actionHtml = `<button class="btn sm primary ${disabled ? 'disabled' : ''}" onclick="UI.onTechStart('${id}')">
                🔬 연구 시작 · ${IconGen.img('potion')} ${U.fmt(cost)} · ⏱ ${U.fmtTime(time)}</button>
                ${otherResearch ? '<p class="muted" style="text-align:center">다른 연구가 진행 중입니다</p>' : ''}`;
        }

        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper item-detail" data-tech-node="${id}">
                    <div class="idet-head">
                        <div class="idet-icon tn-bronze">${max ? '✅' : !open ? '🔒' : '🔬'}<span class="idet-star">${lv}/${TechTree.MAX_LEVEL}</span></div>
                        <div class="idet-title">
                            <div class="idet-name">${def.name} <small class="tn-lv">${roman}단계 · Lv.${lv}/${TechTree.MAX_LEVEL}</small></div>
                            <div class="idet-main">+${U.fmt(TechTree.totalOf(id))}${unit} <small class="tn-gain">(${TechTree.gainNote()} +${U.fmt(def.per)}${unit} · 이 노드 +${U.fmt(TechTree.nodeTotal(id))}${unit})</small></div>
                        </div>
                    </div>
                    <div class="idet-subs">
                        <div class="idet-lead">${def.desc}</div>
                    </div>
                    ${actionHtml}
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">✕</button>
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
    onTechCancel() {
        TechTree.cancel();
        this.renderTechNodeModal();
        this.renderTechBranchView();
        this.renderTopBar();
        this.toast('🧪 연구를 취소하고 물약을 환불했습니다');
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
        const tiles = Object.entries(S.mounts).map(([name, m]) => {
            const active = S.activeMount === name;
            return `<button class="pet-tile" style="--rc:${RARITY_CSS[m.rarity]}" onclick="UI.openMountDetail('${name}')">
                <span class="tile-face">
                    ${UI.mountFace(name, 'mt-inline')}
                    ${active ? '<span class="sk-ribbon">장착됨</span>' : ''}
                    <span class="sk-lv">Lv.${m.level}</span>
                </span>
                ${m.stars ? `<span class="sk-star">⭐${m.stars}</span>` : ''}
            </button>`;
        }).join('') || '<span class="muted grid-empty">보유 탈것 없음 — 소환해보세요!</span>';

        this.els.mountModal.innerHTML = `
            <div class="modal-card sheet mount-sheet">
                <div class="sheet-head"><h2 class="sheet-title">탈것</h2></div>
                <div class="mount-pill-row"><span class="cur-pill winder">${IconGen.img('winder')} ${U.fmt(S.winders || 0)}</span></div>
                <div class="grid-scroll"><div class="sk-grid">${tiles}</div></div>
                <div class="summon-bar">
                    <button class="btn danger round back-btn" onclick="UI.closeMounts()">◀</button>
                    <button class="btn xs x5-toggle ${mountSummonN > 1 ? 'on' : ''}" onclick="UI.cycleSummonMult('mount')">x${mountSummonN}</button>
                    ${Ascension.ready('mount')
                        ? `<button class="btn big summon-btn ascend-ready" onclick="UI.openAscension('mount')">⭐ 승천 가능<small class="summon-cost">소환 Lv.MAX</small></button>`
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
    openMountDetail(name) {
        const m = S.mounts[name];
        if (!m) return;
        const active = S.activeMount === name;
        const pw = Mounts.mountPower(m);
        const maxed = m.level >= Mounts.INDIV_MAX_LEVEL;
        const subsHtml = (m.subs || []).map(s => U.subText(s)).join('<br>');
        this.els.detailModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper petd-card">
                    <div class="petd-head">
                        <div class="petd-tilecol">
                            <div class="petd-tile" style="--rc:${RARITY_CSS[m.rarity]}">
                                ${UI.mountFace(name, 'mt-inline')}
                                ${active ? '<span class="sk-ribbon">장착됨</span>' : ''}
                                <span class="sk-lv">Lv.${m.level}</span>
                            </div>
                            ${m.stars ? `<span class="sk-star">⭐${m.stars}</span>` : ''}
                        </div>
                        <div class="petd-body">
                            <div class="petd-name" style="color:${UI.inkRarity(RARITY_CSS[m.rarity])}">[${RARITY_KR[m.rarity]}] ${MOUNT_KR[name] || name}</div>
                            <div class="petd-stats">${U.fmt(pw.atk)} 피해<br>${U.fmt(pw.hp)} 체력</div>
                            <div class="petd-subs">${subsHtml || '옵션 없음'}<br><span class="muted">중복(승천 재료) ${m.dupes}</span></div>
                        </div>
                    </div>
                    <div class="petd-btns">
                        ${maxed
                            ? `<button class="btn primary petd-btn disabled">업그레이드<small>Lv.${Mounts.INDIV_MAX_LEVEL} 만렙</small></button>`
                            : `<button class="btn primary petd-btn" onclick="UI.closeDetail(); UI.openMountUpgrade('${name}')">업그레이드</button>`}
                        <button class="btn petd-btn ${active ? 'danger' : 'primary'}" onclick="UI.onEquipMount('${name}'); UI.openMountDetail('${name}')">${active ? '해제' : '장착'}</button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeDetail()">✕</button>
            </div>`;
        this.showModal(this.els.detailModal);
        this.hydrateMountThumbs();   // 탈것 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
    },
    closeMounts() { this.els.mountModal.classList.add('hidden'); },
    onSummonMount() {
        const count = this.summonMult('mount');
        const r = Mounts.summon(count);
        if (!r) { this.toast('⚙️ 태엽이 부족합니다 (스테이지 클리어로 획득)'); return; }
        this.keepScroll(() => this.openMounts()); this.renderTopBar(); this.renderEquipSheet();
        this.openSummonResult('mount', r.results); // 결과는 토스트 대신 전용 연출 팝업으로 보여준다
    },
    onEquipMount(name) { if (Mounts.equip(name)) { this.keepScroll(() => this.openMounts()); this.renderEquipSheet(); } },

    // 마운트 업그레이드 팝업 (펫 업그레이드와 동일 방식): 다른 탈것을 재료로 흡수해 경험치로 레벨업
    _mountUpgradeTarget: null, _mountUpgradeMats: null,
    openMountUpgrade(name) {
        this._mountUpgradeTarget = name;
        this._mountUpgradeMats = [];
        this.renderMountUpgrade();
        this.showModal(this.els.mountUpgradeModal);
    },
    closeMountUpgrade() { this.els.mountUpgradeModal.classList.add('hidden'); },
    renderMountUpgrade() {
        const name = this._mountUpgradeTarget;
        const target = S.mounts[name];
        if (!target) { this.closeMountUpgrade(); return; }
        const sel = this._mountUpgradeMats;
        const need = Mounts.xpNeeded(target.level);
        const maxed = target.level >= Mounts.INDIV_MAX_LEVEL;

        const matChips = Object.entries(S.mounts).filter(([n]) => n !== name).map(([n, m]) => `
            <button class="mat-chip ${sel.includes(n) ? 'on' : ''} ${S.activeMount === n ? 'active' : ''}" style="--rc:${RARITY_CSS[m.rarity]}" onclick="UI.onToggleMountUpgradeMat('${n}')">
                ${UI.mountFace(n, 'mt-inline')}<small>Lv.${m.level}${m.stars ? ` ⭐${m.stars}` : ''}</small>
            </button>`).join('');

        const previewXp = sel.reduce((s, n) => s + Mounts.xpValue(S.mounts[n].rarity) * Mounts.levelMult(S.mounts[n]), 0);

        this.els.mountUpgradeModal.innerHTML = `
            <div class="modal-card wide">
                <h3>${MOUNT_KR[name] || name} 업그레이드</h3>
                <div class="row">
                    <span class="cell-img emoji" style="width:2.4rem;height:2.4rem;font-size:1.25rem;border-radius:50%;border-color:${RARITY_CSS[target.rarity]}">${UI.mountFace(name, 'mt-inline')}</span>
                    <div>
                        <div class="item-name">Lv.${target.level}${target.stars ? ` ⭐${target.stars}` : ''}</div>
                        <div class="muted">${maxed ? '만렙' : `경험치 ${U.fmt(target.xp || 0)}/${U.fmt(need)}${previewXp ? ` (+${U.fmt(previewXp)} 예정)` : ''}`}</div>
                    </div>
                </div>
                <p class="muted">합칠 다른 탈것 선택 (최대 5개, 재료는 흡수되어 사라집니다)</p>
                <div class="mat-grid">${matChips || '<span class="muted mat-empty">재료로 쓸 다른 탈것이 없습니다</span>'}</div>
                <button class="btn primary ${sel.length && !maxed ? '' : 'disabled'}" onclick="UI.onConfirmMountUpgrade()">업그레이드</button>
                <button class="btn" onclick="UI.closeMountUpgrade()">닫기</button>
            </div>`;
        this.hydrateMountThumbs();   // 탈것 아이콘을 실제 3D 썸네일로 교체 (다음 프레임)
    },
    onToggleMountUpgradeMat(name) {
        const sel = this._mountUpgradeMats;
        const pos = sel.indexOf(name);
        if (pos >= 0) sel.splice(pos, 1);
        else if (sel.length < 5) sel.push(name);
        this.renderMountUpgrade();
    },
    onConfirmMountUpgrade() {
        const name = this._mountUpgradeTarget;
        const target = S.mounts[name];
        if (target && target.level >= Mounts.INDIV_MAX_LEVEL) { this.toast('만렙입니다 — 승천을 이용하세요'); return; }
        const sel = this._mountUpgradeMats;
        if (!sel.length) return;
        if (!Mounts.absorbMaterials(name, sel)) return;
        this.toast(`✨ ${MOUNT_KR[name] || name} Lv.${S.mounts[name].level}!`);
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
                <span class="asc-name">${Ascension.LINE_ICON[l]} ${Ascension.LINE_KR[l]}</span>
                <span class="asc-prog">${label}</span>
                <span class="asc-cnt">${Ascension.count(l) ? `⭐${Ascension.count(l)}` : '—'}</span>
            </div>`;
        }).join('');

        let bodyHtml;
        if (line) {
            const p = Ascension.progress(line), next = Ascension.count(line) + 1;
            const resetKr = line === 'forge' ? '대장간 레벨이 1로 초기화' : '소환 레벨이 1로 초기화';
            bodyHtml = `
                <div class="asc-focus">
                    <div class="asc-focus-icon">${Ascension.LINE_ICON[line]}</div>
                    <div class="asc-focus-title">${Ascension.LINE_KR[line]} 승천</div>
                    <div class="asc-focus-cnt">현재 승천 ${Ascension.count(line)}회 → <b>${next}회</b></div>
                    <div class="asc-focus-eff">
                        · ${resetKr}됩니다<br>
                        · 이후 새로 ${line === 'forge' ? '제작되는 장비' : '소환되는 ' + Ascension.LINE_KR[line]}가 <b>⭐${next}</b>로 나옵니다<br>
                        · 이미 보유한 것의 별은 그대로 유지됩니다
                    </div>
                </div>
                <div class="asc-btns">
                    <button class="btn primary ${Ascension.ready(line) ? '' : 'disabled'}" onclick="UI.onAscendLine('${line}')">⭐ 승천</button>
                    <button class="btn" onclick="UI.closeAscension()">취소</button>
                </div>`;
        } else {
            bodyHtml = `<div class="asc-btns"><button class="btn" onclick="UI.closeAscension()">닫기</button></div>`;
        }

        this.els.ascendModal.innerHTML = `
            <div class="idet-wrap">
                <div class="modal-card paper asc-card">
                    <h3>🌟 승천 <small class="muted">보유 별 합계 ⭐ ${b.gear + b.skill + b.pet + b.mount}</small></h3>
                    <p class="muted">라인마다 조건을 채우면 그 라인을 승천시킵니다 — 승천 횟수만큼 <b>이후 획득물</b>에 별이 붙습니다.</p>
                    ${rowsHtml}
                    ${bodyHtml}
                </div>
                <button class="x-btn" onclick="UI.closeAscension()">✕</button>
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
                        <div class="offline-sub">수집 시간: <b>${U.fmtTime(o.counted)}</b>${o.elapsed > o.counted ? ' (최대)' : ''}</div>
                        <div class="offline-rates">
                            <div class="offline-rate"><span class="offline-rate-icon coin">${IconGen.img('coin')}</span><b>${U.fmtDec(o.coinRate)}/초</b></div>
                            <div class="offline-rate"><span class="offline-rate-icon hammer">${IconGen.img('hammer')}</span><b>${U.fmtDec(o.hammerRate)}/분</b></div>
                        </div>
                    </div>
                    <div class="offline-bottom">
                        <div class="offline-total">${IconGen.img('coin')} ${U.fmt(o.coins)} &nbsp; ${IconGen.img('hammer')} ${U.fmt(o.hammers)}</div>
                        <button class="btn primary offline-collect-btn" onclick="UI.onCollectOffline()">수집<span class="offline-collect-dot"></span></button>
                    </div>
                </div>
                <button class="x-btn" onclick="UI.closeOfflineModal()">✕</button>
            </div>`;
        this.showModal(this.els.offlineModal);
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
        this.closeOfflineModal();
        this.toast(`👑 ${U.fmt(r.coins)} · 🔨 ${U.fmt(r.hammers)} 수집!`);
        this.els.offlineBtn.classList.remove('ready');
        this.renderTopBar();
        this.renderEquipSheet(); // 해머 수가 제작 화면에도 바로 반영되게
        saveGame();
    },

    // ---- 디버그 탭 (출시용 아님, 테스트 전용 — 항상 노출) ----
    DEBUG_CURRENCIES: [
        { key: 'hammers', label: '🔨 해머' },
        { key: 'coins', label: '🪙 코인' },
        { key: 'gems', label: '💎 젬' },
        { key: 'tickets', label: '🎫 티켓' },
        { key: 'winders', label: '⚙️ 태엽' },
        { key: 'potions', label: '🧪 물약' },
        { key: 'eggCurrency', label: '🥚 알' },
    ],
    renderDebug() {
        if (this.activeTab !== 'debug') return;
        const p = this.els.panels.debug;
        const curHtml = this.DEBUG_CURRENCIES.map(c =>
            `<button class="btn sm" onclick="UI.onDebugAddCurrency('${c.key}')">${c.label} +100000</button>`).join('');
        const keysHtml = Dungeons.DEFS.map(d =>
            `<span class="prob-chip">${d.icon} ${S.dungeons ? (S.dungeons.keys[d.id] ?? '-') : '-'}/${Dungeons.MAX_KEYS}</span>`).join('');
        p.innerHTML = `
            <h2>🐞 디버그 <span class="muted">테스트 전용</span></h2>
            <h3>스테이지 이동</h3>
            <div class="row">
                <input type="number" id="dbg-chapter" value="${S.chapter}" min="1" max="10" style="width:4rem">
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
                <button class="btn sm" onclick="UI.onDebugEggs()">🥚 신화 알 +5</button>
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
        const c = U.clamp(parseInt(document.getElementById('dbg-chapter').value) || 1, 1, 10);
        const s = U.clamp(parseInt(document.getElementById('dbg-stage').value) || 1, 1, 10);
        S.chapter = c; S.stage = s;
        if (c * 100 + s > S.bestChapter * 100 + S.bestStage) { S.bestChapter = c; S.bestStage = s; }
        Dungeons.run = null;
        Combat.setupStage();
        this.updateStageLabel(); this.renderDebug(); saveGame();
        this.toast(`📍 ${c}-${s}로 이동`);
    },
    onDebugStageStep(dir) {
        let c = S.chapter, s = S.stage + dir;
        if (s < 1) { c = Math.max(1, c - 1); s = 10; }
        if (s > 10) { c = Math.min(10, c + 1); s = 1; }
        S.chapter = c; S.stage = s;
        if (c * 100 + s > S.bestChapter * 100 + S.bestStage) { S.bestChapter = c; S.bestStage = s; }
        Dungeons.run = null;
        Combat.setupStage();
        this.updateStageLabel(); this.renderDebug(); saveGame();
    },
    onDebugAddCurrency(key) {
        S[key] = (S[key] || 0) + 100000;
        this.renderTopBar(); this.updateAnvilCounter(); this.renderDebug(); saveGame();
        const label = this.DEBUG_CURRENCIES.find(c => c.key === key)?.label || key;
        this.toast(`${label} +100000`);
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
            if (p) this.showOffline(p);
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
        if (S.techResearch && TechTree.def(S.techResearch.id)) {
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
        if (S.league) {
            const t = document.getElementById('waypoint-league-time');
            if (t) t.textContent = U.fmtTime((S.league.seasonEndsAt - U.now()) / 1000);
        }
        const mt = document.getElementById('waypoint-mystery-time');
        if (mt) mt.textContent = U.fmtTime(this.msUntilDailyReset() / 1000);
    },

    // 매일 09:00 기준 다음 리셋까지 남은 ms — 미스터리 상자는 실제 배경 기능이 없어 기존 09:00 리셋(던전 열쇠 등)에 동기화한 자체 설계 카운트다운
    msUntilDailyReset() {
        const next = new Date(); next.setHours(9, 0, 0, 0);
        if (next <= new Date()) next.setDate(next.getDate() + 1);
        return next - Date.now();
    },
    onWaypointLeague() {
        League.ensure();
        this.renderLeagueRewards();
        this.showModal(this.els.leagueModal);
    },
    onWaypointMystery() { this.openStub('❓ 미스터리 상자', '특별 이벤트 상자는 준비 중입니다.'); },
};

/* 캡처 하네스 지원(state.js 주석 참고): 렉시컬 전역을 window에도 노출 — Playwright 격리 컨텍스트용 */
window.UI = UI;
