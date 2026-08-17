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
        else this.openMounts();
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
    SR_CHARGE_MS: 480,      // 빛 모임 구간 길이(.sr-charge 애니메이션과 맞춤)
    SR_HOLDBACK_MS: 420,    // 최고 등급 1개를 마지막에 한 박자 늦게 띄우는 여유
    SR_TAIL_MS: 300,        // 마지막 아이콘이 뜬 뒤 [확인]이 나오기까지의 여운
    _srTimers: [], _srRaf: 0,
    _srCells: null, _srEntries: null, _srDelays: null, _srStart: 0, _srIdx: 0,
    _srDone: false,

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
            // 중복만 나온 항목은 적립 환산(조각/재료)으로, 그 외는 등급명으로 표기
            g.sub = (dup && !g.newQty) ? `${dup} +${g.qty}` : RARITY_KR[g.rarity];
        }
        // 등급 오름차순 — 마지막에 뜨는 셀이 최고 등급이 되게(홀드백 연출의 전제)
        return list.sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));
    },

    // 등급별 획득 수 집계 칩 — 대량 소환에서 "무엇이 얼마나 나왔는지"를 한 줄로 알려준다
    summonSummary(entries) {
        if (entries.length <= 1) return '';
        const cnt = {};
        for (const e of entries) cnt[e.rarity] = (cnt[e.rarity] || 0) + 1;
        const chips = RARITIES.filter(r => cnt[r]).reverse()
            .map(r => `<b class="sr-chip" style="--rc:${RARITY_CSS[r]}">${RARITY_KR[r]} ${cnt[r]}</b>`).join('');
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
        const cells = entries.map((e, i) => {
            const hi = this.SR_HI_RARITIES.indexOf(e.rarity) >= 0;
            const rc = RARITY_CSS[e.rarity];
            // data-tier로 등급별 세기(크기·광채·광선)를 계단화한다 — 6등급이 2상태로 붕괴하지 않게
            return `<div class="sr-cell${hi ? ' hi' : ''}" data-tier="${RARITIES.indexOf(e.rarity)}"
                data-mat="${this.srMaterial(e.rarity)}"
                style="--i:${i};--rc:${rc};--rc-lite:${this.srShade(rc, .5)};--rc-deep:${this.srShade(rc, -.62)}">
                <div class="sr-orbwrap">
                    <span class="sr-ray"></span>
                    <span class="sr-ghost"></span>
                    <span class="sr-orb">${e.icon}</span>
                    <span class="sr-spark"></span>
                    ${e.qty > 1 ? `<b class="sr-qty">×${e.qty}</b>` : ''}
                    ${e.isNew ? '<span class="sr-new">NEW</span>' : ''}
                </div>
                <div class="sr-name"><span>${e.name}</span></div>
                <div class="sr-sub">${e.sub}</div>
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
                <div class="sr-flash" style="--rc:${RARITY_CSS[best]}"></div>
                <div class="sr-head"><div class="sr-title">${meta.icon} ${meta.title} ×${rolls.length}</div></div>
                <div class="sr-body${stage ? ' stage' : ''}${stage && size === ' one' ? ' one' : ''}">
                    <div class="sr-grid${size}" style="--cols:${cols}">${cells}</div>
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
        this._srCells = m.querySelectorAll('.sr-cell');
        this._srEntries = entries;
        const n = this._srCells.length;
        const step = n <= 10 ? this.SR_SLOW_STEP : U.clamp(this.SR_REVEAL_BUDGET / n, 20, 120);
        // 셀별 등장 시각 — 마지막 최고 등급 한 개만 홀드백만큼 더 뜸들인다
        this._srDelays = [];
        for (let i = 0; i < n; i++) {
            this._srDelays.push(this.SR_CHARGE_MS + i * step + (holdback && i === n - 1 ? this.SR_HOLDBACK_MS : 0));
        }
        this._srHoldback = holdback;
        this._srStart = performance.now();
        this._srIdx = 0;
        this._srRaf = requestAnimationFrame(() => this.tickSummonResult());
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
        // 홀드백 셀이 착지하는 순간, 그 셀 위치를 원점으로 화면을 등급색으로 한 번 훑는다
        // (화면 중앙 고정이면 오른쪽 끝에 착지한 셀과 터지는 자리가 어긋난다)
        if (loud && this._srHoldback && this._srIdx >= n) {
            const m = this.els.summonResultModal, wrap = m.querySelector('.sr-wrap');
            const orb = this._srCells[n - 1].querySelector('.sr-orb');
            if (wrap && orb) {
                const wr = wrap.getBoundingClientRect(), cr = orb.getBoundingClientRect();
                wrap.style.setProperty('--fx', ((cr.left + cr.width / 2 - wr.left) / wr.width * 100).toFixed(1) + '%');
                wrap.style.setProperty('--fy', ((cr.top + cr.height / 2 - wr.top) / wr.height * 100).toFixed(1) + '%');
            }
            m.classList.add('flash');
        }
        if (this._srIdx >= n) {
            this._srTimers.push(setTimeout(() => this.finishSummonResult(), this.SR_TAIL_MS));
            this._srRaf = 0;
            return;
        }
        this._srRaf = requestAnimationFrame(() => this.tickSummonResult());
    },

    // 연출 종료 — 힌트를 감추고 [확인]을 띄운다
    finishSummonResult() {
        this._srDone = true;
        this.els.summonResultModal.classList.add('done');
    },
    // 오버레이 탭: 연출 중이면 스킵(전부 즉시 표시), 이미 끝났으면 닫기
    onSummonResultTap() {
        if (this._srDone) { this.closeSummonResult(); return; }
        this.clearSummonTimers();
        this.els.summonResultModal.querySelectorAll('.sr-cell').forEach(el => el.classList.add('on'));
        this._srIdx = this._srCells ? this._srCells.length : 0;
        this.finishSummonResult();
    },
    clearSummonTimers() {
        this._srTimers.forEach(clearTimeout); this._srTimers = [];
        if (this._srRaf) { cancelAnimationFrame(this._srRaf); this._srRaf = 0; }
    },
    closeSummonResult() {
        this.clearSummonTimers();
        this._srDone = false;
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
            panels: { summon: $('panel-summon'), menu: $('panel-menu'), debug: $('panel-debug') },
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
        this.renderTopBar();
        this.renderSkillBar();
        this.renderEquipSheet();
        this.renderChatPreview();
        this.watchTabX();
        // 망치 수 드롭다운 바깥 클릭 시 닫힘 (자동 제련 팝업)
        document.addEventListener('click', e => {
            if (this._afDdOpen && !e.target.closest('.af-dd')) { this._afDdOpen = false; this.renderAutoForge(); }
        });
    },

    // 하단 탭 클릭: 던전/상점/전투(PvP)는 팝업, 나머지는 시트 토글(다시 누르면 닫힘).
    // 상호 배타(사용자 지시): 다른 탭 것을 열기 전에 이전 탭이 소유한 열린 팝업을 전부 닫는다.
    onTabClick(tab) {
        // 빨간 X 상태의 탭 = 닫기 버튼
        const btn = document.querySelector(`#tabbar button[data-tab="${tab}"]`);
        if (btn && btn.classList.contains('tab-x')) { this.closeOpened(); return; }
        this.closeAllTabSurfaces();
        if (tab === 'dungeon') { this.switchTab(null); this.openDungeons(); return; }
        if (tab === 'shop') { this.switchTab(null); this.openShop(); return; }
        if (tab === 'battle') { this.switchTab(null); this.openLeague(); return; }
        this.switchTab(this.activeTab === tab ? null : tab);
    },
    // 탭 전환 공통 정리 — 탭이 소유한 전체화면 모달과 그 위에 겹친 하위 상세 팝업 일괄 닫기 (전투 씬은 무관)
    // MODAL_TAB에 없는 모달도 여기서 닫아야 한다: 이 4종은 특정 탭 소유가 아니라 메인 화면에서도 뜨므로
    // MODAL_TAB에 넣으면 엉뚱한 탭에 빨간 ✕가 붙는다. 대신 목록으로만 관리한다.
    // (QA 5차 실측: 안 닫혀서 장비 상세 카드가 소환 서브탭을, 오프라인 보상 카드가 화면 절반을 덮어 조작을 막았다)
    EXTRA_TAB_SURFACES: ['detail-modal', 'stub-modal', 'gear-detail-modal', 'offline-modal', 'ascend-modal'],
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
        if (tab === 'menu') this.renderMenu();
        if (tab === 'debug') this.renderDebug();
        this.refreshTabX();
    },

    // ---- 탭바: 팝업이 열리면 해당 탭이 빨간 X로 바뀐다 (UI-SPEC 공통 레이아웃) ----
    // 팝업 여닫는 지점이 20곳이 넘어 호출부를 일일이 고치는 대신 표시 상태 변화를 관찰한다.
    MODAL_TAB: {
        'dungeon-modal': 'dungeon', 'dungeon-detail-modal': 'dungeon',
        'shop-modal': 'shop', 'league-modal': 'battle', 'pass-modal': 'battle',
        'mount-modal': 'menu', 'mount-upgrade-modal': 'menu', 'pet-upgrade-modal': 'summon',
        'profile-modal': 'menu', 'player-info-modal': 'menu',
        'chat-modal': 'menu', 'forge-info-modal': 'menu', 'forge-item-modal': 'menu',
        'autoforge-modal': 'menu',
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
    // 재렌더 경로만 감싸면 되므로 open*/close*는 건드리지 않는다(신규 오픈은 showModal이 맨 위로 리셋).
    installScrollKeeper() {
        if (this._scrollKeeperOn) return;
        this._scrollKeeperOn = true;
        for (const name of Object.keys(this)) {
            if (!/^render[A-Z]/.test(name) || typeof this[name] !== 'function') continue;
            const orig = this[name];
            this[name] = function (...args) { return UI.keepScroll(() => orig.apply(this, args)); };
        }
    },

    showModal(el) {
        if (!el.classList.contains('hidden')) return; // 이미 열려 있음 — 재렌더 경로, 애니메이션 금지
        // 새로 여는 팝업은 항상 맨 위에서 시작한다 (직전에 열었을 때의 스크롤 잔상 제거).
        // 재렌더 경로는 위 return으로 빠져나가므로 keepScroll이 복원한 위치를 덮어쓰지 않는다.
        el.querySelectorAll('*').forEach(n => { if (n.scrollTop) n.scrollTop = 0; });
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
                <span class="sk-icon">${SKILL_ICONS[id] || '✨'}</span>
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
        if (!info) forgeBtnHtml = `<button class="btn sm disabled">대장간<br>최고 레벨</button>`; // 만렙 라벨도 미만렙과 같은 명시적 2줄 — 자동 래핑 클리핑 방지
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
                <span class="cell-img emoji">${MOUNT_ICONS[S.activeMount] || '🐴'}</span>
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
                <button class="anvil-btn" onclick="UI.onCraft()">${this.ANVIL_SVG}<small id="anvil-hammers">${IconGen.img('hammer')} ${U.fmt(S.hammers)}</small></button>
                <div class="anvil-side right">
                    <div class="forge-actions">
                        ${forgeBtnHtml}
                        <button class="btn sm ${autoUnlocked ? (S.autoForgeOn ? 'on' : '') : 'disabled'}" onclick="UI.openAutoForge()">
                            자동🔄<br>${autoUnlocked ? (S.autoForgeOn ? 'ON' : 'OFF') : '🔒'}</button>
                    </div>
                    ${upgTimeHtml}
                </div>
            </div>`;
    },

    // 모루 버튼 아래 해머 카운터만 갱신 (매초 틱에서 전체 renderEquipSheet 재호출은 과함)
    updateAnvilCounter() {
        const el = document.getElementById('anvil-hammers');
        if (el) el.innerHTML = `${IconGen.img('hammer')} ${U.fmt(S.hammers)}`;
    },

    onStartUpgrade() {
        if (Forge.startUpgrade()) { this.renderEquipSheet(); this.renderTopBar(); this.openForgeInfo(); }
        else this.toast('🪙 코인이 부족합니다');
    },
    onGemSkipForge() {
        if (Forge.gemSkip()) { this.renderTopBar(); this.openForgeInfo(); }
        else this.toast('💎 젬이 부족합니다');
    },
    onToggleAutoForge() {
        if (!isUnlocked('autoForge')) { this.toast('🔒 스테이지 2-10 도달 시 해금됩니다'); return; }
        S.autoForgeOn = !S.autoForgeOn;
        this.renderEquipSheet();
        if (!this.els.autoForgeModal.classList.contains('hidden')) this.renderAutoForge();
        saveGame();
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
            const cell = (onclick, icon, pct) => `
                <button class="forge-item-cell" onclick="${onclick}">
                    <span class="fl-face">${icon}</span>
                    <small>${pct.toFixed(4)}%</small>
                </button>`;
            // 무기는 그 시대에 등장하는 종류만 (원시에 총이 뜨면 안 됨 — 사용자 지시 2026-08-17)
            const weaponCells = weaponsOfAge(age).map(wtype =>
                cell(`UI.openForgeDetail('${age}','weapon','${wtype}')`, this.weaponEmoji(wtype), p)).join('');
            const otherCells = ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt'].map(slot => {
                const names = (slot === 'helmet' || slot === 'armor') ? ((ITEM_NAMES[age] && ITEM_NAMES[age][slot]) || []) : accNames(age, slot);
                const sp = Forge.itemDropChance(age, slot);
                const icon = slot === 'helmet' ? '🪖' : slot === 'armor' ? '👕' : (this.SLOT_EMOJI[slot] || '🎁');
                return names.map((name, i) => cell(`UI.openForgeDetail('${age}','${slot}',${i})`, icon, sp)).join('');
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
        // 빈 부위라도 보관품이 있으면 눌러서 보관함을 열 수 있어야 한다(그러지 않으면 도달 불가)
        if (!it) {
            const stored = Forge.inventoryOf(slot).length;
            return `<div class="equip-cell empty"${stored ? ` onclick="UI.openGearDetail('${slot}')"` : ''}>
                <span class="cell-img emoji dim">${this.EMPTY_SLOT_EMOJI[slot] || this.SLOT_EMOJI[slot] || '🎁'}</span>
                <span class="slot-name">${SLOT_KR[slot]}</span>
                ${stored ? `<span class="cell-stored">📦${stored}</span>` : ''}
            </div>`;
        }
        return `<div class="equip-cell" style="--rc:${this.ageHex(it.age)}" title="${it.name}" onclick="UI.openGearDetail('${slot}')">
            ${this.itemImgHTML(it, 'cell-img')}
            <span class="cell-lv">Lv. ${it.level}</span>
            ${it.stars ? `<span class="cell-star">⭐${it.stars > 1 ? it.stars : ''}</span>` : ''}
        </div>`;
    },

    ageHex(age) { return '#' + AGE_COLORS[age].toString(16).padStart(6, '0'); },

    // 장비 이미지: 무기/투구/갑옷은 실제 3D 모델 스냅샷, 나머지는 아이콘
    itemImgHTML(item, cls) {
        const thumb = (typeof Scene3D !== 'undefined') ? Scene3D.itemThumb(item) : null;
        if (thumb) return `<img class="${cls}" src="${thumb}" alt="">`;
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
                    <button class="btn equip" onclick="UI.resolveCraft('equip')">장착${cur ? '<small>기존 보관</small>' : ''}</button>
                </div>
            </div>`;
        this.showModal(this.els.craftModal);
    },

    // 장비 세부정보 팝업 (UI-SPEC 26번): 메인 화면 장비 카드 클릭 시 — 비교 팝업과 달리 버튼 없음, 바깥 탭하면 닫힘.
    // 여기에 그 부위의 **보관함**(장착으로 밀려난 장비)을 붙였다 — 사용자 지시 2026-08-17이 요구한
    // '보관 장비 열람/재장착/판매 진입점'이다. 보관품이 없으면 목록 자체를 그리지 않으므로
    // 보관함이 빈 상태(원본 대조 기준 상태)의 화면은 원본과 그대로 같다.
    openGearDetail(slot) {
        const item = S.equipment[slot];
        const stored = Forge.inventoryOf(slot);
        if (!item && !stored.length) return;
        this._gearDetailSlot = slot;
        this.els.gearDetailModal.innerHTML = `
            <div class="modal-card wide gd-card">
                <div class="cmp-wrap">${this.itemCardHTML(item, '장착됨', null, false)}</div>
                ${this.storedListHTML(slot)}
            </div>`;
        this.showModal(this.els.gearDetailModal);
    },
    // 보관함 목록 — 한 줄에 장비 하나(아이콘·이름·주스탯) + [장착]/[판매]
    storedListHTML(slot) {
        const list = Forge.inventoryOf(slot);
        if (!list.length) return '';
        // 강한 것부터 — 되장착할 것을 맨 위에서 찾게 한다. 표시 순서만 바꾸고 원본 배열은 건드리지 않는다.
        const rows = list.map((it, i) => ({ it, i }))
            .sort((a, b) => Forge.itemValue(b.it).cmp(Forge.itemValue(a.it)))
            .map(({ it, i }) => `<div class="inv-row" style="--rc:${this.ageHex(it.age)}">
                ${this.itemImgHTML(it, 'inv-img')}
                <div class="inv-info">
                    <div class="inv-name">[${AGE_KR[it.age]}] ${it.name}</div>
                    <div class="inv-stat">Lv.${it.level} · ${U.fmt(Forge.itemValue(it))} ${it.main === 'atk' ? '피해' : '체력'}${it.stars ? ` · ⭐${it.stars}` : ''}</div>
                </div>
                <div class="inv-btns">
                    <button class="btn equip inv-btn" onclick="UI.onEquipStored('${slot}',${i})">장착</button>
                    <button class="btn sell inv-btn" onclick="UI.onSellStored('${slot}',${i})">판매<small>${IconGen.img('coin')} +${U.fmt(Forge.sellPrice(it))}</small></button>
                </div>
            </div>`).join('');
        return `<div class="inv-box">
            <div class="inv-head">📦 보관함 <small>${list.length}/${Forge.INVENTORY_CAP}</small></div>
            <div class="inv-list">${rows}</div>
        </div>`;
    },
    onEquipStored(slot, idx) {
        const it = Forge.equipStored(slot, idx);
        if (!it) return;
        this.toast(`🛠 ${it.name} 장착 — 쓰던 장비는 보관함으로`);
        this.renderTopBar(); this.renderEquipSheet(); this.openGearDetail(slot); saveGame();
    },
    onSellStored(slot, idx) {
        const gained = Forge.sellStored(slot, idx);
        if (!gained) return;
        this.toast(`🪙 판매 +${U.fmt(gained)}`);
        this.renderTopBar(); this.renderEquipSheet();
        // 마지막 보관품을 팔았고 장착 중인 것도 없으면 열어 둘 내용이 없다
        if (!S.equipment[slot] && !Forge.inventoryOf(slot).length) this.closeGearDetail();
        else this.openGearDetail(slot);
        saveGame();
    },
    closeGearDetail() { this.els.gearDetailModal.classList.add('hidden'); this._gearDetailSlot = null; },

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
    //   [장착] → 새 것을 끼고 기존 장비는 보관함으로 간다(판매 아님) — 파는 게 없으니 경고도 없다
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
                        <span class="sellwarn-item" style="color:${RARITY_CSS[sold.rarity]}">${RARITY_KR[sold.rarity]} ${sold.name}</span>
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
        this.els.craftModal.classList.add('hidden');
        if (!item) return;
        if (mode === 'equip') {
            // 기존 장비는 팔지 않고 보관함으로 (사용자 지시 2026-08-17) — 보관함이 꽉 찼을 때만
            // 가장 약한 것이 자동 판매되고, 그때는 사용자가 알 수 있게 알린다.
            const prev = Forge.equip(item);
            if (prev) {
                const overflow = Forge.store(prev);
                this.toast(overflow
                    ? `📦 ${prev.name} 보관 · 보관함이 꽉 차 가장 약한 장비를 판매했습니다 +${U.fmt(overflow)}`
                    : `📦 ${prev.name} 보관함에 보관`);
            }
        } else Forge.sell(item);
        this.renderTopBar();
        this.renderEquipSheet();
        saveGame();
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
                    ${PET_ICONS[pet.name] || '🐾'}
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
            return `<button class="sk-mini square" style="--rc:${RARITY_CSS[pet.rarity]}" title="${PET_KR[pet.name] || pet.name} — 상세/해제" onclick="UI.openPetDetail(${i})">${PET_ICONS[pet.name] || '🐾'}<small>Lv.${pet.level}</small></button>`;
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
                    소환 x${petSummonN}<small class="summon-cost">${IconGen.img('egg')} <b>${Pets.SUMMON_EGG_COST * petSummonN}</b></small></button>`}
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
                                ${PET_ICONS[pet.name] || '🐾'}
                                ${active ? '<span class="sk-ribbon">장착됨</span>' : ''}
                                <span class="sk-lv">Lv.${pet.level}</span>
                            </div>
                            ${pet.stars ? `<span class="sk-star">⭐${pet.stars}</span>` : ''}
                        </div>
                        <div class="petd-body">
                            <div class="petd-name" style="color:${RARITY_CSS[pet.rarity]}">[${RARITY_KR[pet.rarity]}] ${PET_KR[pet.name] || pet.name}</div>
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
    },

    onSummonPetEgg() {
        const count = this.summonMult('pet');
        const r = Pets.summon(count);
        if (!r) { this.toast(S.eggs.length + count > 20 ? `🥚 알 보관함 여유가 부족합니다 (${S.eggs.length}/20)` : '🥚 알이 부족합니다 (펫 던전에서 획득)'); return; }
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
                            <div class="petd-name" style="color:${RARITY_CSS[egg.rarity]}">[${RARITY_KR[egg.rarity]}] 알</div>
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
                    ${PET_ICONS[p.name] || '🐾'}
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
        const tilesHtml = petTiles + eggTiles || '<span class="muted">재료로 쓸 펫/알이 없습니다</span>';

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
                            ${PET_ICONS[target.name] || '🐾'}
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
                    ${SKILL_ICONS[d.id] || '✨'}
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
            return `<button class="sk-mini" style="--rc:${RARITY_CSS[d.rarity]}" title="${d.name} — 상세/해제" onclick="UI.openSkillDetail('${id}')">${SKILL_ICONS[id] || '✨'}<small>Lv.${sk.level}</small></button>`;
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
                            <span class="sk-orb" style="--rc:${RARITY_CSS[d.rarity]}">${SKILL_ICONS[id] || '✨'}<span class="sk-lv">Lv.${sk.level}</span></span>
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

    // ---- 메뉴 ----
    renderMenu() {
        if (this.activeTab !== 'menu') return;
        const p = this.els.panels.menu;
        const st = Combat.hero.stats || {};
        p.innerHTML = `
            <h2>📋 정보</h2>
            <div class="stat-grid">
                <div>⚔️ 공격력</div><div>${U.fmt(st.atk || 0)}</div>
                <div>❤️ 체력</div><div>${U.fmt(st.hp || 0)}</div>
                <div>💥 치명타</div><div>${(st.critCh || 0).toFixed(1)}% / +${(st.critDmg || 0).toFixed(0)}%</div>
                <div>⚡ 공격 속도</div><div>${(st.attacksPerSec || 0).toFixed(2)}/s</div>
                <div>🗡 처치 수</div><div>${U.fmt(S.kills)}</div>
                <div>${IconGen.img('hammer')} 총 제작</div><div>${U.fmt(S.totalCrafts)}</div>
                <div>📈 최고 스테이지</div><div>${S.bestChapter}-${S.bestStage}</div>
                <div>${IconGen.img('potion')} 물약</div><div>${U.fmt(S.potions || 0)} <small class="muted">(기술 트리 재화)</small></div>
                <div>${IconGen.img('winder')} 태엽</div><div>${U.fmt(S.winders || 0)} <small class="muted">(마운트 재화)</small></div>
                <div>🌟 승천 별</div><div>⭐ ${Ascension.totalStars()}</div>
            </div>
            <div class="row">
                <button class="btn primary" onclick="UI.openTechTree()">🔬 기술 트리</button>
                <button class="btn primary" onclick="UI.openMounts()">🐴 마운트</button>
            </div>
            <div class="row">
                <button class="btn primary" onclick="UI.openAscension()">🌟 승천</button>
                <button class="btn primary" onclick="UI.openPass()">⚔️ 진행 패스</button>
            </div>
            <div class="row">
                <button class="btn ${S.sfxOn ? 'on' : ''}" onclick="UI.onToggleSfx()">🔊 효과음 ${S.sfxOn ? 'ON' : 'OFF'}</button>
            </div>
            <div class="row">
                <button class="btn" onclick="saveGame(); UI.toast('💾 저장 완료')">수동 저장</button>
                <button class="btn danger" onclick="if(confirm('정말 처음부터 시작할까요?')) resetGame()">초기화</button>
            </div>
            <p class="muted">오프라인 보상: ${IconGen.img('coin')} 1/초 · ${IconGen.img('hammer')} 1/분 (최대 4시간)<br>
            대장간 업그레이드·부화는 게임을 꺼도 진행됩니다.</p>`;
    },

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
        if (Dungeons.sweep(id)) { this.renderDungeonDetail(); this.openDungeons(); this.renderTopBar(); }
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
                <span class="cell-img emoji">${MOUNT_ICONS[S.activeMount] || '🐴'}</span>
                <span class="cell-lv">Lv.${am.level}</span></div>`
            : `<div class="equip-cell egg-cell empty pinfo-mount-wide" onclick="UI.openMounts()"><span class="slot-name">탈것</span></div>`;

        // 슬롯 클릭 → 각 세부정보 팝업이 플레이어 정보 위에 겹쳐 뜸 (사용자 지시 — 닫으면 플레이어 정보로 복귀)
        const skillIconsHtml = S.equippedSkills.map(id => `<button class="sk-cell" onclick="UI.openSkillDetail('${id}')">
            <span class="sk-orb">${SKILL_ICONS[id] || '✨'}<span class="sk-lv">Lv.${Skills.level(id)}</span></span></button>`).join('');
        const petIconsHtml = S.activePets.map(i => {
            const p = S.pets[i];
            return `<button class="sk-cell" onclick="UI.openPetDetail(${i})">
                <span class="sk-orb">${PET_ICONS[p.name] || '🐾'}<span class="sk-lv">Lv.${p.level}</span></span></button>`;
        }).join('');
        const mountIconHtml = S.activeMount && S.mounts[S.activeMount] ? `<button class="sk-cell" onclick="UI.openMountUpgrade('${S.activeMount}')">
            <span class="sk-orb">${MOUNT_ICONS[S.activeMount] || '🐴'}<span class="sk-lv">Lv.${S.mounts[S.activeMount].level}</span></span></button>` : '';

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
    },

    // ---- 채팅 화면 (UI-SPEC 28번, 원본 shot-043500): 하단 1줄 미리보기 + 탭하면 전체화면 채팅 ----
    CHAT_NAME_COLORS: ['#ffab40', '#7ee2a8', '#81d4fa', '#f48fb1', '#ce93d8', '#ffd54f', '#ff8a65', '#a5d6a7', '#90caf9', '#f06292'],
    chatNameColor(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return this.CHAT_NAME_COLORS[h % this.CHAT_NAME_COLORS.length];
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
                    <div class="chat-name-line"><span class="chat-name" style="color:${this.chatNameColor(m.myName)}">${U.escapeHtml(m.myName)}</span><span class="chat-time">${this.chatTime(m.at)}</span></div>
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
                    <span class="chat-name" style="color:${m.mine ? '' : this.chatNameColor(m.name)}">${tagHtml}${U.escapeHtml(m.name)}</span><span class="muted">${m.gender}</span>
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
            const researching = S.techResearch && b.nodes.includes(S.techResearch.id);
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
    // 한 단계(티어)의 노드를 행으로 자른다 — 원본(shot-042546)처럼 2개짜리 병렬 행을 쌓고,
    // 홀수면 마지막 노드가 중앙 단독 행(그 단계의 '마지막 노드')이 된다. 3개면 2+1이다.
    techTierRows(ids) {
        const rows = [];
        for (let i = 0; i < ids.length; i += 2) rows.push(ids.slice(i, i + 2));
        return rows;
    },
    // 분기 상세: 위→아래로 이어지는 5단계 세로 트리 (사용자 정정 2026-08-17).
    // 한 단계의 노드를 전부 만렙(5/5)으로 만들면 그 아래 단계가 해금된다.
    renderTechBranchView() {
        const b = TechTree.BRANCHES.find(x => x.id === this._techBranch);
        const pct = TechTree.branchProgress(b.id);
        const nodeCol = (id) => {
            const lv = TechTree.level(id);
            const max = TechTree.isMax(id);
            const researching = TechTree.researchingId() === id;
            const open = TechTree.isUnlocked(id);
            const cls = researching ? 'researching' : max ? 'done' : !open ? 'tlocked' : lv > 0 ? 'active' : 'locked';
            const face = researching ? TechTree.NODES[id].icon || '🔬' : max ? '✅' : !open ? '🔒' : TechTree.NODES[id].icon || '🔬';
            const badge = researching
                ? `<small class="tech-tree-node-time" id="tech-n-time-${id}">${U.fmtTime((S.techResearch.endsAt - U.now()) / 1000)}</small>`
                : `<small>${lv}/${TechTree.MAX_LEVEL}</small>`;
            return `<div class="tech-tree-node-col">
                <button class="tech-tree-node ${cls}" onclick="UI.openTechNode('${id}')">${face}</button>
                <div class="tech-tree-label">${badge}</div>
            </div>`;
        };
        // 골격 규칙 (원본 shot-042546의 좌우 갈래 모양을 단계 구조 위에서 유지한다):
        //  ① 가로 바는 2노드 행의 좌우 노드를 잇는다 — 그 행이 위아래 중앙 줄기와 만날 때만 필요하다
        //  ② 세로선은 같은 단계 안에서 위아래가 모두 2노드 행이면 좌·우 두 갈래, 그 밖에는 중앙 줄기
        //  ③ 첫 행 위·마지막 행 아래로는 선을 그리지 않는다 (사용자 지시 — 위로 뻗은 짝대기 제거)
        const rows = [];
        b.tiers.forEach((ids, t) => this.techTierRows(ids).forEach((r, i) => rows.push({ ids: r, tier: t + 1, first: i === 0 })));
        const rowsHtml = [];
        rows.forEach((row, r) => {
            const prev = rows[r - 1], next = rows[r + 1];
            // 같은 단계 안에서 2노드 행이 연이을 때만 좌·우 두 갈래, 단계가 바뀌면 중앙 줄기로 합류한다
            const railAbove = !!prev && prev.tier === row.tier && prev.ids.length === 2 && row.ids.length === 2;
            const railBelow = !!next && next.tier === row.tier && next.ids.length === 2 && row.ids.length === 2;
            // 아직 안 열린 단계로 내려가는 선은 흐리게 — 선은 이어지되 어디부터 잠겼는지 한눈에 보인다
            const open = TechTree.tierUnlocked(b.id, row.tier);
            const dim = open ? '' : ' dim';
            if (prev) rowsHtml.push(railAbove
                ? `<div class="tech-tree-vrow${dim}"><i></i><i></i></div>`
                : `<div class="tech-tree-vline${dim}"></div>`);
            // 단계 표시는 그 단계 첫 행에만. 절대배치라 행의 가로 배치(=원본 비율)에 영향을 주지 않는다.
            const tag = row.first ? `<span class="tech-tier-tag${dim}">${TechTree.roman(row.tier)}</span>` : '';
            if (row.ids.length === 1) { rowsHtml.push(`<div class="tech-tree-row">${tag}${nodeCol(row.ids[0])}</div>`); return; }
            const bar = (!railAbove || !railBelow) ? `<div class="tech-tree-hline${dim}"></div>` : '<div class="tech-tree-hgap"></div>';
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
            <div class="tech-tree-col">${rowsHtml.join('')}</div>
            <button class="btn danger tech-tree-back" onclick="UI.openTechOverview()">◀</button>`;
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
        const def = TechTree.NODES[id];
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
            // 위 단계를 전부 만렙으로 만들어야 열린다 — 무엇이 남았는지 그대로 알려준다
            const need = TechTree.lockedBy(id);
            const left = TechTree.tierNodes(TechTree.branchOf(id).id, need).filter(n => !TechTree.isMax(n)).length;
            actionHtml = `<button class="btn sm primary disabled">🔒 잠김</button>
                <p class="muted" style="text-align:center">${need}단계를 모두 완료하면 열립니다 (남은 노드 ${left}개)</p>`;
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
                            <div class="idet-main">+${U.fmt(TechTree.totalOf(id))}${unit} <small class="tn-gain">(${TechTree.gainNote()} +${U.fmt(def.per)}${unit})</small></div>
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
                    ${MOUNT_ICONS[name] || '🐴'}
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
                                ${MOUNT_ICONS[name] || '🐴'}
                                ${active ? '<span class="sk-ribbon">장착됨</span>' : ''}
                                <span class="sk-lv">Lv.${m.level}</span>
                            </div>
                            ${m.stars ? `<span class="sk-star">⭐${m.stars}</span>` : ''}
                        </div>
                        <div class="petd-body">
                            <div class="petd-name" style="color:${RARITY_CSS[m.rarity]}">[${RARITY_KR[m.rarity]}] ${MOUNT_KR[name] || name}</div>
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
    },
    closeMounts() { this.els.mountModal.classList.add('hidden'); },
    onSummonMount() {
        const count = this.summonMult('mount');
        const r = Mounts.summon(count);
        if (!r) { this.toast('⚙️ 태엽이 부족합니다 (스테이지 클리어로 획득)'); return; }
        this.openMounts(); this.renderTopBar(); this.renderEquipSheet();
        this.openSummonResult('mount', r.results); // 결과는 토스트 대신 전용 연출 팝업으로 보여준다
    },
    onEquipMount(name) { if (Mounts.equip(name)) { this.openMounts(); this.renderEquipSheet(); } },

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
                <span>${MOUNT_ICONS[n] || '🐴'}</span><small>Lv.${m.level}${m.stars ? ` ⭐${m.stars}` : ''}</small>
            </button>`).join('');

        const previewXp = sel.reduce((s, n) => s + Mounts.xpValue(S.mounts[n].rarity) * Mounts.levelMult(S.mounts[n]), 0);

        this.els.mountUpgradeModal.innerHTML = `
            <div class="modal-card wide">
                <h3>${MOUNT_KR[name] || name} 업그레이드</h3>
                <div class="row">
                    <span class="cell-img emoji" style="width:2.4rem;height:2.4rem;font-size:1.25rem;border-radius:50%;border-color:${RARITY_CSS[target.rarity]}">${MOUNT_ICONS[name] || '🐴'}</span>
                    <div>
                        <div class="item-name">Lv.${target.level}${target.stars ? ` ⭐${target.stars}` : ''}</div>
                        <div class="muted">${maxed ? '만렙' : `경험치 ${U.fmt(target.xp || 0)}/${U.fmt(need)}${previewXp ? ` (+${U.fmt(previewXp)} 예정)` : ''}`}</div>
                    </div>
                </div>
                <p class="muted">합칠 다른 탈것 선택 (최대 5개, 재료는 흡수되어 사라집니다)</p>
                <div class="mat-grid">${matChips || '<span class="muted">재료로 쓸 다른 탈것이 없습니다</span>'}</div>
                <button class="btn primary ${sel.length && !maxed ? '' : 'disabled'}" onclick="UI.onConfirmMountUpgrade()">업그레이드</button>
                <button class="btn" onclick="UI.closeMountUpgrade()">닫기</button>
            </div>`;
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
        this.openMounts(); // 재료로 소모된 마운트가 뒤에 깔린 목록에서도 즉시 사라지도록 (펫 플로우와 동일 패턴)
        this.renderTopBar();
    },

    onToggleSfx() {
        S.sfxOn = !S.sfxOn;
        if (S.sfxOn) { SFX.resume(); SFX.craft(); }
        this.renderMenu();
        saveGame();
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
            return `<div class="asc-row ${rdy ? 'ready' : ''}">
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
        if (line === 'mount' && !this.els.mountModal.classList.contains('hidden')) this.openMounts();
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

    // 매초 갱신 (타이머류)
    tickSecond() {
        this.renderTopBar();
        this.updateAnvilCounter(); // 킬 드랍·분당 수급으로 계속 변하는 해머 보유량 (QA: 정적 문자열이라 안 갱신되던 버그)
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
        if (S.techResearch && TechTree.NODES[S.techResearch.id]) {
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
