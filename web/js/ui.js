// ===== UI: 탭/패널/HUD/모달/토스트 =====
const UI = {
    els: {},
    activeTab: null,
    _pendingItem: null,
    _skillSummonX5: false,

    init() {
        const $ = id => document.getElementById(id);
        this.els = {
            topbar: $('topbar'), stageLabel: $('stage-label'), wavePips: $('wave-pips'),
            heroHp: $('hero-hp-fill'), heroHpText: $('hero-hp-text'),
            bossBar: $('boss-bar'), bossFill: $('boss-bar-fill'), bossWarn: $('boss-warning'),
            dmgFlash: $('dmg-flash'), lootFeed: $('loot-feed'), skillBar: $('skill-bar'),
            toasts: $('toasts'), farmToggle: $('farm-toggle'), offlineBtn: $('offline-btn'),
            equipSheet: $('equip-sheet'),
            panels: { summon: $('panel-summon'), menu: $('panel-menu'), debug: $('panel-debug') },
            petsPanel: $('panel-pets'), skillsPanel: $('panel-skills'), techPanel: $('panel-tech'),
            craftModal: $('craft-modal'), offlineModal: $('offline-modal'),
            dungeonModal: $('dungeon-modal'), dungeonDetailModal: $('dungeon-detail-modal'),
            mountModal: $('mount-modal'), mountUpgradeModal: $('mount-upgrade-modal'), ascendModal: $('ascend-modal'),
            stubModal: $('stub-modal'),
            forgeInfoModal: $('forge-info-modal'), autoForgeModal: $('autoforge-modal'),
            petUpgradeModal: $('pet-upgrade-modal'), techNodeModal: $('tech-node-modal'),
            leagueModal: $('league-modal'), passModal: $('pass-modal'), shopModal: $('shop-modal'),
            profileModal: $('profile-modal'), playerInfoBtn: $('player-info-btn'), playerInfoModal: $('player-info-modal'),
            chatPreview: $('chat-preview'), chatModal: $('chat-modal'),
            gearDetailModal: $('gear-detail-modal'),
        };
        this.els.offlineBtn.addEventListener('click', () => this.onClaimOffline());
        this.els.playerInfoBtn.addEventListener('click', () => this.openPlayerInfo());
        document.querySelectorAll('#tabbar button').forEach(btn => {
            btn.addEventListener('click', () => this.onTabClick(btn.dataset.tab));
        });
        this.els.farmToggle.style.display = 'none'; // 반복파밍 제거 — 무조건 전진
        this.renderTopBar();
        this.renderSkillBar();
        this.renderEquipSheet();
        this.renderChatPreview();
    },

    // 하단 탭 클릭: 던전/상점/전투(PvP)는 팝업, 나머지는 시트 토글(다시 누르면 닫힘)
    onTabClick(tab) {
        if (tab === 'dungeon') { this.switchTab(null); this.openDungeons(); return; }
        if (tab === 'shop') { this.switchTab(null); this.openShop(); return; }
        if (tab === 'battle') { this.switchTab(null); this.openLeague(); return; }
        this.switchTab(this.activeTab === tab ? null : tab);
    },

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        for (const [k, p] of Object.entries(this.els.panels)) p.classList.toggle('open', k === tab);
        if (tab === 'summon') this.switchSummonSub(this._summonSub || 'pets');
        if (tab === 'menu') this.renderMenu();
        if (tab === 'debug') this.renderDebug();
    },

    openStub(title, desc) {
        this.els.stubModal.innerHTML = `
            <div class="modal-card">
                <h3>${title}</h3>
                <p class="muted">${desc}</p>
                <p class="muted">🚧 다음 업데이트에서 추가될 예정입니다.</p>
                <button class="btn" onclick="UI.closeStub()">닫기</button>
            </div>`;
        this.els.stubModal.classList.remove('hidden');
    },
    closeStub() { this.els.stubModal.classList.add('hidden'); },

    // ---- 소환 탭: 스킬/펫/기술 트리 서브탭 (UI-SPEC 8~16번) ----
    _summonSub: 'pets',
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
                <span class="pill coin"><button class="pill-plus" onclick="UI.openShop()">+</button>👑 ${U.fmt(S.coins)}</span>
                <span class="pill gem"><button class="pill-plus" onclick="UI.openShop()">+</button>◆ ${U.fmt(S.gems)}</span>
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
    updateHeroHp() {
        const h = Combat.hero;
        const r = U.clamp(h.hp / h.maxHp, 0, 1);
        this.els.heroHp.style.width = (r * 100) + '%';
        this.els.heroHpText.textContent = `${U.fmt(h.hp)} / ${U.fmt(h.maxHp)}`;
    },
    showBossBar(e) {
        this.els.bossBar.classList.remove('hidden');
        this.updateBossBar(e);
    },
    updateBossBar(e) {
        this.els.bossFill.style.width = (U.clamp(e.hp / e.maxHp, 0, 1) * 100) + '%';
    },
    hideBossBar() { this.els.bossBar.classList.add('hidden'); },
    bossWarning() {
        this.els.bossWarn.classList.remove('hidden');
        setTimeout(() => this.els.bossWarn.classList.add('hidden'), 1400);
    },
    flashDamage() {
        this.els.dmgFlash.classList.add('on');
        setTimeout(() => this.els.dmgFlash.classList.remove('on'), 120);
    },
    updateFarmToggle() {}, // (제거됨)

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
    renderSkillBar() {
        this.els.skillBar.innerHTML = S.equippedSkills.map(id => {
            const d = Skills.def(id);
            return `<button class="skill-btn" id="sb-${id}" style="--sc:${d.color}" onclick="Combat.tryCast('${id}')">
                <span class="sk-icon">${SKILL_ICONS[id] || '✨'}</span>
                <span class="sk-name">${d.name}</span>
                <span class="sk-cd" id="sbcd-${id}"></span>
            </button>`;
        }).join('') + `<button class="skill-btn auto ${S.autoCast ? 'on' : ''}" onclick="UI.toggleAuto()">AUTO</button>`;
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
        if (!info) forgeBtnHtml = `<button class="btn sm disabled">대장간 최고 레벨</button>`;
        else if (upgrading) {
            forgeBtnHtml = `<button class="btn sm primary" onclick="UI.openForgeInfo()">⏱ <span id="equip-upg-time">${U.fmtTime((S.forgeUpgradeEndsAt - U.now()) / 1000)}</span></button>`;
        } else {
            forgeBtnHtml = `<button class="btn sm primary" onclick="UI.openForgeInfo()">대장간 레벨 ${S.forgeLevel}</button>`;
        }

        // 카드 = 아이콘 + Lv + 별만 표시 (컴팩트, UI-SPEC 1번). 상세 정보는 클릭 시 '장비 세부정보 팝업'(UI-SPEC 26번)
        const autoUnlocked = isUnlocked('autoForge');
        const equipHtml = SLOTS.map(slot => {
            const it = S.equipment[slot];
            if (!it) return `<div class="equip-cell empty"><span class="slot-name">${SLOT_KR[slot]}</span></div>`;
            return `<div class="equip-cell" style="--rc:${RARITY_CSS[it.rarity]}" title="${it.name}" onclick="UI.openGearDetail('${slot}')">
                ${this.itemImgHTML(it, 'cell-img')}
                <span class="cell-lv">Lv.${it.level}${it.stars ? ` ⭐${it.stars}` : ''}</span>
            </div>`;
        }).join('');
        // 마지막 칸: 부화 중인 알 (파란 배경, UI-SPEC 1번 — 원본은 부화 중 펫도 섞여 표시되나 수치 미확보라 부화 카운트다운으로 근사)
        const h0 = S.hatching[0];
        const eggCellHtml = h0
            ? `<div class="equip-cell egg-cell" title="${RARITY_KR[h0.rarity]} 알 부화 중">
                <span class="cell-img emoji">🥚</span>
                <span class="cell-lv" id="equip-egg-t">${U.fmtTime((h0.endsAt - U.now()) / 1000)}</span>
            </div>`
            : `<div class="equip-cell egg-cell empty"><span class="slot-name">부화 없음</span></div>`;

        this.els.equipSheet.innerHTML = `
            <div class="equip-grid">${equipHtml}${eggCellHtml}</div>
            <div class="anvil-row">
                <button class="anvil-btn" onclick="UI.onCraft()">⚒️<small>🔨 ${U.fmt(S.hammers)}</small></button>
                <div class="forge-actions">
                    ${forgeBtnHtml}
                    <button class="btn sm ${autoUnlocked ? (S.autoForgeOn ? 'on' : '') : 'disabled'}" onclick="UI.openAutoForge()">
                        자동🔄 ${autoUnlocked ? (S.autoForgeOn ? 'ON' : 'OFF') : '🔒'}</button>
                </div>
            </div>`;
    },

    onStartUpgrade() { if (Forge.startUpgrade()) { this.renderEquipSheet(); this.renderTopBar(); this.openForgeInfo(); } },
    onGemSkipForge() { if (Forge.gemSkip()) { this.renderTopBar(); this.openForgeInfo(); } },
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
        this.els.forgeInfoModal.classList.remove('hidden');
    },
    openForgeList() { this._forgeView = 'list'; this.renderForgeInfo(); },
    openForgeDetail(age, slot, variant) {
        this._forgeView = 'detail';
        this._forgeItem = { age, slot, variant };
        this.renderForgeInfo();
    },
    closeForgeInfo() { this.els.forgeInfoModal.classList.add('hidden'); },
    renderForgeInfo() {
        if (this._forgeView === 'list') this.renderForgeListView();
        else if (this._forgeView === 'detail') this.renderForgeDetailView();
        else this.renderForgeLevelView();
    },
    renderForgeLevelView() {
        const info = Forge.upgradeInfo();
        const upgrading = !!S.forgeUpgradeEndsAt;
        const curP = Forge.ageProbsAt(S.forgeLevel);
        const nextP = info ? Forge.ageProbsAt(S.forgeLevel + 1) : {};
        const rows = AGES.filter(age => curP[age] || nextP[age]).map(age => {
            const hex = this.ageHex(age);
            const c = curP[age] || 0, n = nextP[age] || 0;
            return `<div class="age-row">
                <span class="age-tag" style="--ac:${hex}">${AGE_ICON[age]} ${AGE_KR[age]}</span>
                <div class="age-bar-wrap"><div class="age-bar" style="width:${c}%;background:${hex}"></div></div><span class="age-pct">${c.toFixed(2)}%</span>
                <div class="age-bar-wrap"><div class="age-bar" style="width:${n}%;background:${hex}"></div></div><span class="age-pct">${n.toFixed(2)}%</span>
            </div>`;
        }).join('');

        let actionHtml;
        if (!info) actionHtml = `<div class="muted" style="text-align:center">대장간 최고 레벨 (35)</div>`;
        else if (upgrading) {
            const remain = (S.forgeUpgradeEndsAt - U.now()) / 1000;
            actionHtml = `<div class="row">
                <div class="upg-progress"><div id="upg-fill" style="width:${U.clamp(1 - remain / Forge.upgradeTime(info), 0, 1) * 100}%"></div><span id="upg-time">${U.fmtTime(remain)}</span></div>
                <button class="btn gem" onclick="UI.onGemSkipForge()">💎 ${Forge.gemSkipCost()} 스킵</button>
            </div>`;
        } else {
            const cost = Forge.upgradeCost(info), time = Forge.upgradeTime(info);
            actionHtml = `<button class="btn primary ${S.coins < cost ? 'disabled' : ''}" onclick="UI.onStartUpgrade()">
                ⚒️ 레벨 ${S.forgeLevel + 1} 업그레이드<br><small>🪙 ${U.fmt(cost)} · ⏱ ${U.fmtTime(time)}</small></button>`;
        }

        this.els.forgeInfoModal.innerHTML = `
            <div class="modal-card wide">
                <div class="row" style="justify-content:space-between">
                    <h3>확률 정보</h3>
                    <button class="btn sm" onclick="UI.openForgeList()">ⓘ 전체 장비</button>
                </div>
                <p class="muted">레벨 ${S.forgeLevel}${info ? ` ▶ 레벨 ${S.forgeLevel + 1}` : ' (최고 레벨)'} — 시대별 제작 확률</p>
                <div class="age-rows">${rows}</div>
                ${actionHtml}
                <button class="btn" onclick="UI.closeForgeInfo()">닫기</button>
            </div>`;
    },
    renderForgeListView() {
        const sections = AGES.filter(age => Forge.ageProbsAt(S.forgeLevel)[age]).map(age => {
            const hex = this.ageHex(age);
            const ageP = Forge.ageProbsAt(S.forgeLevel)[age];
            const p = Forge.itemDropChance(age, 'weapon'); // 무기 변형은 모두 동일 확률
            const weaponCells = Object.keys(WEAPON_TYPES).map(wtype => `
                <button class="forge-item-cell" onclick="UI.openForgeDetail('${age}','weapon','${wtype}')">
                    <span class="icon">${WEAPON_TYPES[wtype].kind === 'ranged' ? '🏹' : '🗡'}</span>
                    <small>${p.toFixed(4)}%</small>
                </button>`).join('');
            const otherCells = ['helmet', 'armor', 'gloves', 'necklace', 'ring', 'shoes', 'belt'].map(slot => {
                const names = (slot === 'helmet' || slot === 'armor') ? ((ITEM_NAMES[age] && ITEM_NAMES[age][slot]) || []) : (ACC_NAMES[slot] || []);
                const sp = Forge.itemDropChance(age, slot);
                const icon = slot === 'helmet' ? '🪖' : slot === 'armor' ? '👕' : (this.SLOT_EMOJI[slot] || '🎁');
                return names.map((name, i) => `
                    <button class="forge-item-cell" onclick="UI.openForgeDetail('${age}','${slot}',${i})">
                        <span class="icon">${icon}</span>
                        <small>${sp.toFixed(4)}%</small>
                    </button>`).join('');
            }).join('');
            return `<div class="forge-age-section">
                <div class="age-tag" style="--ac:${hex}">${AGE_ICON[age]} ${AGE_KR[age]} <small>${ageP.toFixed(2)}%</small></div>
                <div class="forge-item-grid">${weaponCells}${otherCells}</div>
            </div>`;
        }).join('');

        this.els.forgeInfoModal.innerHTML = `
            <div class="modal-card wide">
                <div class="row" style="justify-content:space-between">
                    <h3>모든 장비</h3>
                    <button class="btn sm" onclick="UI.openForgeInfo()">◀ 뒤로</button>
                </div>
                <div class="forge-age-list">${sections}</div>
                <button class="btn" onclick="UI.closeForgeInfo()">닫기</button>
            </div>`;
    },
    renderForgeDetailView() {
        const { age, slot, variant } = this._forgeItem;
        const ageIdx = AGES.indexOf(age);
        let name, icon;
        if (slot === 'weapon') {
            name = `${WEAPON_TYPES[variant].kr}`;
            icon = WEAPON_TYPES[variant].kind === 'ranged' ? '🏹' : '🗡';
        } else if (slot === 'helmet' || slot === 'armor') {
            name = (ITEM_NAMES[age] && ITEM_NAMES[age][slot] && ITEM_NAMES[age][slot][variant]) || SLOT_KR[slot];
            icon = slot === 'helmet' ? '🪖' : '👕';
        } else {
            const accs = ACC_NAMES[slot] || [SLOT_KR[slot]];
            name = accs[variant];
            icon = this.SLOT_EMOJI[slot] || '🎁';
        }
        const main = SLOT_MAIN[slot];
        const baseVal = Math.floor(main === 'atk' ? Forge.tierBaseAtk(ageIdx) : Forge.tierBaseHp(ageIdx));
        const p = Forge.itemDropChance(age, slot);
        const subsListHtml = SUBSTATS.map(([key, label, caps]) =>
            `<div class="substat-row"><span>${label}</span><span class="muted">${key === 'skillCd' ? '-' : '+'}${caps[0]}%~${key === 'skillCd' ? '-' : '+'}${caps[5]}%</span></div>`).join('');

        this.els.forgeInfoModal.innerHTML = `
            <div class="modal-card wide">
                <div class="row" style="justify-content:space-between">
                    <h3>[${AGE_KR[age]}] ${name}</h3>
                    <button class="btn sm" onclick="UI.openForgeList()">◀ 뒤로</button>
                </div>
                <div class="row">
                    <div class="cell-img emoji" style="width:3.4rem;height:3.4rem;font-size:1.9rem">${icon}</div>
                    <div>
                        <div class="item-stat">${main === 'atk' ? '⚔️' : '❤️'} 기준 ${U.fmt(baseVal)} <small class="muted">(레벨·등급 배율 적용 전)</small></div>
                        <div class="muted">획득 확률 ${p.toFixed(4)}% (등급 무관)</div>
                    </div>
                </div>
                <p class="muted">이 장비는 등급 순번+1개까지 고유한 하위 스탯을 굴립니다 (전체 풀 13종):</p>
                <div class="substat-list">${subsListHtml}</div>
                <button class="btn" onclick="UI.closeForgeInfo()">닫기</button>
            </div>`;
    },

    // ---- 자동 제련 팝업 (UI-SPEC 21~24번 ④) ----
    openAutoForge() {
        if (!isUnlocked('autoForge')) { this.toast('🔒 스테이지 2-10 도달 시 해금됩니다'); return; }
        this.renderAutoForge();
        this.els.autoForgeModal.classList.remove('hidden');
    },
    closeAutoForge() { this.els.autoForgeModal.classList.add('hidden'); },
    renderAutoForge() {
        const cfg = Forge.autoForgeConfig();
        const ageChecks = AGES.slice(-5).map(age => `
            <label class="check-row">
                <input type="checkbox" ${cfg.keepAges.includes(age) ? 'checked' : ''} onchange="UI.onToggleKeepAge('${age}')">
                <span style="color:${this.ageHex(age)}">${AGE_ICON[age]} ${AGE_KR[age]}</span>
            </label>`).join('');
        const subChecks = SUBSTATS.map(([key, label]) => `
            <label class="check-row">
                <input type="checkbox" ${cfg.filterSubs.includes(key) ? 'checked' : ''} onchange="UI.onToggleFilterSub('${key}')">
                <span>${label}</span>
            </label>`).join('');

        this.els.autoForgeModal.innerHTML = `
            <div class="modal-card wide">
                <h3>🔄 자동 제련</h3>
                <p class="muted">유지 — 체크한 시대의 장비만 장착 후보로 남깁니다 (모두 해제 시 전체 허용)</p>
                <div class="check-grid">${ageChecks}</div>
                <label class="check-row">
                    <input type="checkbox" ${cfg.filterOn ? 'checked' : ''} onchange="UI.onToggleAutoFilterOn()">
                    <span>옵션 필터</span>
                </label>
                ${cfg.filterOn ? `<div class="check-grid">${subChecks}</div>` : ''}
                <div class="row" style="align-items:center">
                    <span class="muted">한 번에 사용할 망치 수</span>
                    <input type="number" min="1" max="22" value="${cfg.hammersPerBatch}" style="width:4rem"
                        onchange="UI.onSetHammersPerBatch(this.value)">
                </div>
                <label class="check-row">
                    <input type="checkbox" ${cfg.continueOnTarget ? 'checked' : ''} onchange="UI.onToggleContinueOnTarget()">
                    <span>목표 장비를 찾으면 제련 계속하기</span>
                </label>
                <button class="btn primary ${S.autoForgeOn ? 'on' : ''}" onclick="UI.onToggleAutoForge()">
                    ${S.autoForgeOn ? '■ 자동 제련 중지' : '▶ 시작'}</button>
                <button class="btn" onclick="UI.closeAutoForge()">닫기</button>
            </div>`;
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
    onSetHammersPerBatch(v) {
        const cfg = Forge.autoForgeConfig();
        cfg.hammersPerBatch = U.clamp(parseInt(v) || 1, 1, 22);
        saveGame(); this.renderAutoForge();
    },
    onToggleContinueOnTarget() {
        const cfg = Forge.autoForgeConfig();
        cfg.continueOnTarget = !cfg.continueOnTarget;
        saveGame(); this.renderAutoForge();
    },

    onCraft() {
        if (S.hammers < 1) { this.toast('🔨 해머가 부족합니다 (분당 1개 수급)'); return; }
        const item = Forge.craft(1)[0];
        this._pendingItem = item;
        this.showCraftModal(item);
        this.renderTopBar();
    },

    SLOT_EMOJI: { gloves: '🧤', necklace: '📿', ring: '💍', shoes: '👢', belt: '🎽' },

    ageHex(age) { return '#' + AGE_COLORS[age].toString(16).padStart(6, '0'); },

    // 장비 이미지: 무기/투구/갑옷은 실제 3D 모델 스냅샷, 나머지는 아이콘
    itemImgHTML(item, cls) {
        const thumb = (typeof Scene3D !== 'undefined') ? Scene3D.itemThumb(item) : null;
        if (thumb) return `<img class="${cls}" src="${thumb}" alt="">`;
        return `<div class="${cls} emoji">${this.SLOT_EMOJI[item.slot] || '🎁'}</div>`;
    },

    // 아이템 카드 HTML (비교 프리뷰용 — 가로형: 이미지 왼쪽 + 정보 오른쪽)
    itemCardHTML(item, tag, highlight, isNew) {
        if (!item) return `<div class="cmp-card empty"><div class="cmp-tag">${tag}</div><div class="muted" style="margin:auto">빈 슬롯 — 장착 중인 장비 없음</div></div>`;
        const typeLabel = item.wtype
            ? `${WEAPON_TYPES[item.wtype].kind === 'ranged' ? '🏹 원거리' : '🗡 근거리'}`
            : SLOT_KR[item.slot];
        const subsHtml = item.subs.length
            ? `<div class="sub">${item.subs.map(s => U.subText(s)).join(' · ')}</div>` : '';
        return `<div class="cmp-card ${highlight ? 'best' : ''} ${isNew ? 'new' : ''}" style="--rc:${RARITY_CSS[item.rarity]}">
            ${this.itemImgHTML(item, 'cmp-img')}
            <div class="cmp-info">
                <div><span class="cmp-tag ${isNew ? 'newtag' : ''}">${tag}</span> <span class="rarity-tag">${AGE_KR[item.age]} · ${RARITY_KR[item.rarity]}</span></div>
                <div class="cmp-name">${item.name} <small class="muted">${typeLabel} · Lv.${item.level}</small></div>
                <div class="big-stat">${item.main === 'atk' ? '⚔️' : '❤️'} ${U.fmt(item.value)} <span class="cmp-power">전투력 ${U.fmt(Forge.itemPower(item))}</span></div>
                ${subsHtml}
            </div>
        </div>`;
    },

    showCraftModal(item) {
        const cur = S.equipment[item.slot];
        const isMatch = Forge.isMatchingGear(item, cur);
        const pNew = Forge.itemPower(item), pCur = Forge.itemPower(cur);
        const better = pNew >= pCur;
        const diff = pCur > 0 ? ((pNew / pCur - 1) * 100) : 100;
        // 장착 중인 장비가 위, 새 장비가 아래 (UI-SPEC 25번)
        this.els.craftModal.innerHTML = `
            <div class="modal-card wide" style="--rc:${RARITY_CSS[item.rarity]}">
                <h3>${SLOT_KR[item.slot]} 획득!</h3>
                <div class="cmp-wrap">
                    ${this.itemCardHTML(cur, '장착 중', !better && cur)}
                    <div class="cmp-arrow ${better ? 'up' : 'down'}">${cur ? (better ? '▲ ' : '▼ ') + Math.abs(diff).toFixed(0) + '%' : 'NEW!'}</div>
                    ${this.itemCardHTML(item, 'NEW! 새 장비', better, true)}
                </div>
                <div class="row">
                    ${isMatch ? `<button class="btn gem" onclick="UI.resolveCraft('ascend')">⭐ 승천 (⭐${(cur.stars || 0) + 1})</button>` : ''}
                    <button class="btn sell" onclick="UI.resolveCraft('sell')">🪙 판매 +${U.fmt(Forge.sellPrice(item))}</button>
                    <button class="btn equip" onclick="UI.resolveCraft('equip')">✅ 장착${cur ? ' (기존 판매)' : ''}</button>
                </div>
            </div>`;
        this.els.craftModal.classList.remove('hidden');
    },

    // 장비 세부정보 팝업 (UI-SPEC 26번): 메인 화면 장비 카드 클릭 시 — 비교 팝업과 달리 버튼 없음, 바깥 탭하면 닫힘
    openGearDetail(slot) {
        const item = S.equipment[slot];
        if (!item) return;
        this.els.gearDetailModal.innerHTML = `
            <div class="modal-card" style="--rc:${RARITY_CSS[item.rarity]}">
                ${this.itemCardHTML(item, '장착됨', false, false)}
            </div>`;
        this.els.gearDetailModal.classList.remove('hidden');
    },
    closeGearDetail() { this.els.gearDetailModal.classList.add('hidden'); },

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

    resolveCraft(mode) {
        const item = this._pendingItem;
        this._pendingItem = null;
        this.els.craftModal.classList.add('hidden');
        if (!item) return;
        if (mode === 'ascend') {
            Forge.ascendGear(item.slot);
            this.toast(`⭐ ${item.name} 승천! (⭐${S.equipment[item.slot].stars})`);
        } else if (mode === 'equip') {
            const prev = Forge.equip(item);
            if (prev) Forge.sell(prev);
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
        const hatchHtml = Array.from({ length: slots }, (_, i) => {
            const h = S.hatching[i];
            if (!h) return `<div class="hatch-slot empty">빈 부화 슬롯</div>`;
            return `<div class="hatch-slot" style="--rc:${RARITY_CSS[h.rarity]}">
                <span>${RARITY_KR[h.rarity]} 알</span>
                <span id="hatch-t-${i}">${U.fmtTime((h.endsAt - U.now()) / 1000)}</span>
                <button class="btn gem sm" onclick="UI.onHatchSkip(${i})">💎 ${Pets.gemSkipCost(h)}</button>
            </div>`;
        }).join('') + (Pets.canBuySlot() ? `<button class="hatch-slot buy" onclick="UI.onBuyHatchSlot()">슬롯+1<br><small>💎 ${Pets.slotCost()}</small></button>` : '');

        const eggsHtml = S.eggs.length ? S.eggs.map((egg, i) =>
            `<button class="egg-chip" style="--rc:${RARITY_CSS[egg.rarity]}" onclick="UI.onStartHatch(${i})">
                🥚 ${RARITY_KR[egg.rarity]}<br><small>${U.fmtTime(Pets.hatchTimeSec(egg.rarity))}</small>
            </button>`).join('') : '<span class="muted">알 없음 — 전투에서 드랍됩니다</span>';

        const petsHtml = S.pets.length ? S.pets.map((pet, i) => {
            const active = S.activePets.includes(i);
            const pw = Pets.petPower(pet);
            const subsText = (pet.subs || []).map(s => U.subText(s)).join(' · ');
            const maxed = pet.level >= Pets.MAX_LEVEL;
            const need = Pets.xpNeeded(pet.level);
            return `<div class="pet-card with-icon ${active ? 'active' : ''}" style="--rc:${RARITY_CSS[pet.rarity]}">
                <span class="icon-circle">${PET_ICONS[pet.name] || '🐾'}</span>
                <span class="item-name">${PET_KR[pet.name] || pet.name} <small>Lv.${pet.level}${pet.stars ? ` ⭐${pet.stars}` : ''}</small></span>
                <span class="item-stat">⚔️ ${U.fmt(pw.atk)} · ❤️ ${U.fmt(pw.hp)} · ${RARITY_KR[pet.rarity]}</span>
                <span class="muted">${maxed ? '만렙' : `경험치 ${U.fmt(pet.xp || 0)}/${U.fmt(need)}`} · 재료 ${pet.dupes}${subsText ? ' · ' + subsText : ''}</span>
                <div class="btn-col">
                    <button class="btn sm ${active ? 'on' : ''}" onclick="UI.onTogglePet(${i})">${active ? '출전 중' : '출전'}</button>
                    <button class="btn sm" onclick="UI.openPetUpgrade(${i})">업그레이드</button>
                    ${maxed ? `<button class="btn sm ${Pets.canAscend(i) ? '' : 'disabled'}" onclick="UI.onAscendPet(${i})">⭐ 승천</button>` : ''}
                </div>
            </div>`;
        }).join('') : '<span class="muted">보유 펫 없음</span>';

        const mergeHtml = RARITIES.slice(0, -1).map(r => Pets.canMerge(r) ?
            `<button class="btn sm" onclick="UI.onMerge('${r}')" style="--rc:${RARITY_CSS[r]}">${RARITY_KR[r]} 3마리 → ${RARITY_KR[RARITIES[RARITIES.indexOf(r) + 1]]} 알</button>` : '').join('');

        const rates = Pets.rates();
        const ratesHtml = RARITIES.filter(r => rates[r] > 0).map(r =>
            `<span class="prob-chip" style="--c:${RARITY_CSS[r]}">${RARITY_KR[r]} ${rates[r].toFixed(2)}%</span>`).join('');

        p.innerHTML = `
            <h2>🐾 펫 <span class="muted">🥚 ${U.fmt(S.eggCurrency || 0)} · 출전 ${S.activePets.length}/${Pets.MAX_ACTIVE}</span></h2>
            <p class="muted">펫은 직접 공격하지 않고, 출전 시 고정 공격력·체력과 옵션을 제공합니다. 레벨업은 [업그레이드]에서 다른 펫·알을 재료로 흡수해 진행합니다.</p>
            <div class="row">
                <button class="btn primary ${Pets.canSummon() ? '' : 'disabled'}" onclick="UI.onSummonPetEgg()">소환 x1 <small>🥚 ${Pets.SUMMON_EGG_COST}</small></button>
                <span class="muted">소환 Lv.${Pets.summonLevel()}</span>
            </div>
            <div class="prob-box">${ratesHtml}</div>
            <h3>부화장</h3><div class="row">${hatchHtml}</div>
            <h3>알 보관함 (${S.eggs.length}/20)</h3><div class="egg-row">${eggsHtml}</div>
            ${mergeHtml ? `<h3>합성</h3><div class="row wrap">${mergeHtml}</div>` : ''}
            <h3>보유 펫</h3><div class="pet-list">${petsHtml}</div>`;
    },
    onSummonPetEgg() {
        const r = Pets.summon();
        if (!r) { this.toast(S.eggs.length >= 20 ? '🥚 알 보관함이 가득 찼습니다 (20/20)' : '🥚 알이 부족합니다 (스테이지 클리어로 획득)'); return; }
        this.toast(`🥚 ${RARITY_KR[r.rarity]} 알 획득!`);
        this.renderPets();
    },

    onStartHatch(i) {
        if (!Pets.startHatch(i)) this.toast(`부화 슬롯이 가득 찼습니다 (${Pets.maxHatchSlots()}칸)`);
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
    onAscendPet(i) {
        if (!Pets.ascend(i)) { this.toast('🥚 승천에 필요한 중복이 부족합니다'); return; }
        const pet = S.pets[i];
        this.toast(`⭐ ${PET_KR[pet.name] || pet.name} 승천! (⭐${pet.stars})`);
        this.renderPets();
    },

    // ---- 펫 업그레이드 팝업 (경험치 흡수형, UI-SPEC 9·12·13번) ----
    _petUpgradeTarget: null, _petUpgradeMats: null,
    openPetUpgrade(idx) {
        this._petUpgradeTarget = idx;
        this._petUpgradeMats = { pets: [], eggs: [] };
        this.renderPetUpgrade();
        this.els.petUpgradeModal.classList.remove('hidden');
    },
    closePetUpgrade() { this.els.petUpgradeModal.classList.add('hidden'); },
    renderPetUpgrade() {
        const target = S.pets[this._petUpgradeTarget];
        if (!target) { this.closePetUpgrade(); return; }
        const sel = this._petUpgradeMats;
        const need = Pets.xpNeeded(target.level);
        const maxed = target.level >= Pets.MAX_LEVEL;

        const petChips = S.pets.map((p, i) => i === this._petUpgradeTarget ? '' : `
            <button class="mat-chip ${sel.pets.includes(i) ? 'on' : ''}" style="--rc:${RARITY_CSS[p.rarity]}" onclick="UI.onToggleUpgradeMat('pet', ${i})">
                <span>${PET_ICONS[p.name] || '🐾'}</span><small>Lv.${p.level}</small>
            </button>`).join('');
        const eggChips = S.eggs.map((e, i) => `
            <button class="mat-chip ${sel.eggs.includes(i) ? 'on' : ''}" style="--rc:${RARITY_CSS[e.rarity]}" onclick="UI.onToggleUpgradeMat('egg', ${i})">
                <span>🥚</span><small>${RARITY_KR[e.rarity]}</small>
            </button>`).join('');

        const previewXp = sel.pets.reduce((s, i) => s + Pets.xpValue(S.pets[i].rarity) * Pets.levelMult(S.pets[i]), 0)
            + sel.eggs.reduce((s, i) => s + Pets.xpValue(S.eggs[i].rarity), 0);

        this.els.petUpgradeModal.innerHTML = `
            <div class="modal-card wide">
                <h3>${PET_KR[target.name] || target.name} 업그레이드</h3>
                <div class="row">
                    <span class="cell-img emoji" style="width:2.4rem;height:2.4rem;font-size:1.25rem;border-radius:50%;border-color:${RARITY_CSS[target.rarity]}">${PET_ICONS[target.name] || '🐾'}</span>
                    <div>
                        <div class="item-name">Lv.${target.level}${target.stars ? ` ⭐${target.stars}` : ''}</div>
                        <div class="muted">${maxed ? '만렙' : `경험치 ${U.fmt(target.xp || 0)}/${U.fmt(need)}${previewXp ? ` (+${U.fmt(previewXp)} 예정)` : ''}`}</div>
                    </div>
                </div>
                <p class="muted">합칠 펫/알 선택 (최대 5개, 재료는 흡수되어 사라집니다)</p>
                <div class="mat-grid">${petChips}${eggChips || (petChips ? '' : '<span class="muted">재료로 쓸 펫/알이 없습니다</span>')}</div>
                <button class="btn primary ${(sel.pets.length + sel.eggs.length) && !maxed ? '' : 'disabled'}" onclick="UI.onConfirmPetUpgrade()">업그레이드</button>
                <button class="btn" onclick="UI.closePetUpgrade()">닫기</button>
            </div>`;
    },
    onToggleUpgradeMat(type, idx) {
        const sel = this._petUpgradeMats;
        const arr = type === 'pet' ? sel.pets : sel.eggs;
        const pos = arr.indexOf(idx);
        if (pos >= 0) arr.splice(pos, 1);
        else if (sel.pets.length + sel.eggs.length < 5) arr.push(idx);
        this.renderPetUpgrade();
    },
    onConfirmPetUpgrade() {
        const target = S.pets[this._petUpgradeTarget];
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
        const rates = Skills.rates();
        const ratesHtml = RARITIES.filter(r => rates[r] > 0).map(r =>
            `<span class="prob-chip" style="--c:${RARITY_CSS[r]}">${RARITY_KR[r]} ${rates[r].toFixed(2)}%</span>`).join('');
        const pb = Skills.activeBonus();
        const skillSummonN = this._skillSummonX5 ? 5 : 1;

        const listHtml = SKILL_DEFS.filter(d => S.skills[d.id]).map(d => {
            const sk = S.skills[d.id];
            const equipped = S.equippedSkills.includes(d.id);
            const typeKr = { aoe: '광역', single: '단일', heal: '회복', buff: '버프' }[d.type];
            const power = d.type === 'heal' ? `${Math.round(Skills.effHeal(d.id) * 100)}% 회복`
                : d.type === 'buff' ? `${Object.entries(d.buff).map(([k, v]) => (k === 'atkPct' ? '공격력' : '공속') + ` +${v}%`).join(' ')}`
                : `각각 ${U.fmt(Skills.dmg(d.id))}의 피해`;
            const maxed = sk.level >= Skills.MAX_LEVEL;
            const need = Skills.shardsRequired(maxed ? Skills.MAX_LEVEL : sk.level);
            return `<div class="pet-card with-icon ${equipped ? 'active' : ''}" style="--rc:${RARITY_CSS[d.rarity]}">
                <span class="icon-circle">${SKILL_ICONS[d.id] || '✨'}</span>
                <span class="item-name">${d.name} <small>Lv.${sk.level}${sk.stars ? ` ⭐${sk.stars}` : ''}</small></span>
                <span class="item-stat">${typeKr} · ${power} · 쿨 ${d.cd}초</span>
                <span class="muted">조각 ${sk.dupes}/${need} · ${RARITY_KR[d.rarity]}</span>
                <div class="btn-col">
                    <button class="btn sm ${equipped ? 'on' : ''}" onclick="UI.onToggleSkill('${d.id}')">${equipped ? '장착 중' : '장착'}</button>
                    ${maxed
                        ? `<button class="btn sm ${Skills.canAscend(d.id) ? '' : 'disabled'}" onclick="UI.onAscendSkill('${d.id}')">⭐ 승천</button>`
                        : `<button class="btn sm ${Skills.canUpgrade(d.id) ? '' : 'disabled'}" onclick="UI.onUpgradeSkill('${d.id}')">업그레이드</button>`}
                </div>
            </div>`;
        }).join('') || '<span class="muted">보유 스킬 없음 — 소환해보세요!</span>';

        p.innerHTML = `
            <h2>✨ 스킬 <span class="muted">소환 Lv.${lvl}</span></h2>
            <p class="muted">장착 시 고정 패시브: +${U.fmt(pb.atk)} 기본 피해 · +${U.fmt(pb.hp)} 기본 체력</p>
            <div class="row">
                <button class="btn sm ${this._skillSummonX5 ? 'on' : ''}" onclick="UI.toggleSkillSummonX5()">x5</button>
                <button class="btn primary" onclick="UI.onSummon(false)">소환 x${skillSummonN} <small>🎫 ${Skills.SUMMON_TICKET_COST * skillSummonN}</small></button>
                <button class="btn gem" onclick="UI.onSummon(true)">소환 x${skillSummonN} <small>💎 ${Skills.SUMMON_GEM_COST * skillSummonN}</small></button>
            </div>
            <div class="prob-box">${ratesHtml}</div>
            <h3>보유 스킬 <span class="muted">(장착 ${S.equippedSkills.length}/${Skills.MAX_ACTIVE})</span></h3>
            <div class="row">
                <button class="btn sm" onclick="UI.onUpgradeAllSkills()">모두 업그레이드</button>
                <button class="btn sm" onclick="UI.onQuickEquipSkills()">빠른 장착</button>
            </div>
            <div class="pet-list">${listHtml}</div>`;
    },

    toggleSkillSummonX5() {
        this._skillSummonX5 = !this._skillSummonX5;
        this.renderSkills();
    },
    onSummon(useGems) {
        const count = this._skillSummonX5 ? 5 : 1;
        const r = Skills.summon(useGems, count);
        if (!r) { this.toast(useGems ? '💎 젬이 부족합니다' : '🎫 티켓이 부족합니다 (스테이지 클리어로 획득)'); return; }
        if (count === 1) {
            const res = r.results[0];
            if (res.isNew) this.toast(`🎉 새 스킬: ${res.def.name} (${RARITY_KR[res.def.rarity]})`);
            else this.toast(`🧩 ${res.def.name} 조각 획득 (Lv.${res.level})`);
        } else {
            const newCount = r.results.filter(x => x.isNew).length;
            this.toast(`✨ 소환 x${count} — 새 스킬 ${newCount}종 · 조각 ${count - newCount}개 획득`);
        }
        this.renderSkills(); this.renderSkillBar(); this.renderTopBar();
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
    onAscendSkill(id) {
        if (!Skills.ascend(id)) { this.toast('🧩 승천에 필요한 조각이 부족합니다'); return; }
        const d = Skills.def(id);
        this.toast(`⭐ ${d.name} 승천! (⭐${S.skills[id].stars})`);
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
                <div>🔨 총 제작</div><div>${U.fmt(S.totalCrafts)}</div>
                <div>📈 최고 스테이지</div><div>${S.bestChapter}-${S.bestStage}</div>
                <div>🧪 물약</div><div>${U.fmt(S.potions || 0)} <small class="muted">(기술 트리 재화)</small></div>
                <div>⚙️ 태엽</div><div>${U.fmt(S.winders || 0)} <small class="muted">(마운트 재화)</small></div>
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
            <p class="muted">오프라인 보상: 🪙 1/초 · 🔨 1/분 (최대 4시간)<br>
            대장간 업그레이드·부화는 게임을 꺼도 진행됩니다.</p>`;
    },

    // ---- 던전: 가로 배너 목록 + 상세(난이도 선택) 팝업 (UI-SPEC 6~7번) ----
    openDungeons() {
        Dungeons.ensure();
        const bannerHtml = Dungeons.DEFS.map(d => {
            const ok = Dungeons.unlocked(d.id);
            const keys = S.dungeons.keys[d.id];
            const hex = '#' + d.theme.sky.toString(16).padStart(6, '0');
            return `<div class="dg-banner ${ok ? '' : 'locked'}" style="--bg:${hex}">
                <span class="dg-icon">${d.icon}</span>
                <div class="dg-info">
                    <div class="item-name">${d.kr}</div>
                    ${ok ? `<span class="dg-keys">🗝 ${keys}/${Dungeons.MAX_KEYS}</span>` : `<span class="muted">🔒 ${d.unlock} 도달 시 해금</span>`}
                </div>
                <button class="btn sm primary ${ok ? '' : 'disabled'}" onclick="UI.openDungeonDetail('${d.id}')">열기</button>
            </div>`;
        }).join('');
        this.els.dungeonModal.innerHTML = `
            <div class="modal-card wide">
                <h3>던전</h3>
                <p class="muted" style="text-align:center">던전 열쇠는 매일 09:00에 보충됩니다. 열쇠는 던전을 완료할 때만 소모됩니다</p>
                <div class="dungeon-list">${bannerHtml}</div>
                <button class="btn" onclick="UI.closeDungeons()">닫기</button>
            </div>`;
        this.els.dungeonModal.classList.remove('hidden');
    },
    closeDungeons() { this.els.dungeonModal.classList.add('hidden'); },

    _dgDetailId: null, _dgDetailStage: 1,
    openDungeonDetail(id) {
        if (!Dungeons.unlocked(id)) { this.toast(`🔒 ${Dungeons.def(id).unlock} 도달 시 해금`); return; }
        this._dgDetailId = id;
        this._dgDetailStage = S.dungeons.best[id] + 1;
        this.renderDungeonDetail();
        this.els.dungeonDetailModal.classList.remove('hidden');
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
        this.els.dungeonDetailModal.innerHTML = `
            <div class="modal-card">
                <div class="dg-detail-hero" style="--bg:${hex}"><span class="dg-icon">${d.icon}</span></div>
                <h3 style="text-align:center">${d.kr}</h3>
                <div class="row" style="justify-content:center;align-items:center;gap:.8rem">
                    <button class="btn sm" onclick="UI.onDungeonStageStep(-1)" ${stage <= 1 ? 'disabled' : ''}>◀</button>
                    <span class="big-stat">난이도 ${stage}단계</span>
                    <button class="btn sm" onclick="UI.onDungeonStageStep(1)" ${stage >= best + 1 ? 'disabled' : ''}>▶</button>
                </div>
                <p class="muted" style="text-align:center">보상: ${Dungeons.rewardText(id, stage)}</p>
                <p class="muted" style="text-align:center">🗝 ${keys}/${Dungeons.MAX_KEYS}</p>
                <div class="row">
                    <button class="btn sm ${keys > 0 && best >= 1 ? '' : 'disabled'}" onclick="UI.onSweepDungeon('${id}')">이전 스테이지 소탕</button>
                    <button class="btn sm primary ${keys > 0 ? '' : 'disabled'}" onclick="UI.onEnterDungeon('${id}', ${stage})">입장</button>
                </div>
                <button class="btn" onclick="UI.closeDungeonDetail()">닫기</button>
            </div>`;
    },
    onEnterDungeon(id, stage) {
        if (Dungeons.enter(id, stage)) { this.closeDungeonDetail(); this.closeDungeons(); this.updateStageLabel(); this.renderTopBar(); }
        else this.renderDungeonDetail(); // 실패 사유 토스트 후 갱신
    },
    onSweepDungeon(id) {
        if (Dungeons.sweep(id)) { this.renderDungeonDetail(); this.renderTopBar(); }
    },

    // ---- PvP 리그 (UI-SPEC 3~5번): 랭킹 → 리그 보상 팝업 / 상대 선택 팝업 (봇 기반 오프라인 구현) ----
    leagueRow(e, rank) {
        return `<div class="league-row ${e.isMe ? 'me' : ''}">
            <span class="league-rank">${rank}</span>
            <span class="icon-circle sm">${e.avatar}</span>
            <span class="league-name">${U.escapeHtml(e.name)}<br><small class="muted">⚔️ ${U.fmt(e.cp)}</small></span>
            <span class="league-score">⭐ ${U.fmt(e.score)}</span>
            <span class="muted league-server">${e.server === '나' ? '나' : '서버 ' + e.server}</span>
        </div>`;
    },
    openLeague() {
        League.ensure();
        this.renderLeagueBoard();
        this.els.leagueModal.classList.remove('hidden');
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
            <div class="modal-card wide">
                <div class="row" style="justify-content:space-between">
                    <h3>🚩 플래티넘 리그</h3>
                    <button class="btn sm" onclick="UI.openLeagueRewards()">🎁 보상</button>
                </div>
                <p class="muted" style="text-align:center">시즌 종료: ${U.fmtTime(remain)}</p>
                <div class="league-list">${windowRows}</div>
                <div class="league-pinned">${this.leagueRow(me, myRank)}</div>
                <button class="btn primary" onclick="UI.openLeagueChallenge()">도전</button>
                <button class="btn" onclick="UI.closeLeague()">닫기</button>
            </div>`;
    },
    openLeagueRewards() { this.renderLeagueRewards(); },
    renderLeagueRewards() {
        const myRank = League.myRank();
        const cur = League.rewardForRank(myRank);
        const curHtml = `👑 ${U.fmt(cur.coins)} · 🔨 ${U.fmt(cur.hammers)} · 🎫 ${U.fmt(cur.tickets)} · 🥚 ${U.fmt(cur.eggCurrency)} · 🧪 ${U.fmt(cur.potions)} · ⚙️ ${U.fmt(cur.winders)}`;
        const rowsHtml = League.REWARD_TIERS.map(t => {
            const r = League.rewardForRank(t.rank);
            return `<div class="league-reward-row">
                <span class="league-reward-label">${t.label}</span>
                <span class="muted">👑${U.fmt(r.coins)} 🔨${U.fmt(r.hammers)} 🎫${U.fmt(r.tickets)} 🥚${U.fmt(r.eggCurrency)} 🧪${U.fmt(r.potions)} ⚙️${U.fmt(r.winders)}</span>
            </div>`;
        }).join('');
        const remain = (S.league.seasonEndsAt - U.now()) / 1000;
        this.els.leagueModal.innerHTML = `
            <div class="modal-card wide">
                <div class="row" style="justify-content:space-between">
                    <button class="btn sm" onclick="UI.openLeague()">◀ 뒤로</button>
                    <h3>🎁 리그 보상</h3>
                </div>
                <p class="muted">현재 순위(${myRank})를 유지하면 시즌 종료 시 다음 보상을 받을 수 있습니다:</p>
                <p class="big-stat" style="font-size:.95rem">${curHtml}</p>
                <p class="muted" style="text-align:center">수집까지: ${U.fmtTime(remain)}</p>
                <div class="league-reward-table">${rowsHtml}</div>
                <button class="btn" onclick="UI.closeLeague()">닫기</button>
            </div>`;
    },
    openLeagueChallenge() { this.renderLeagueChallenge(); },
    renderLeagueChallenge() {
        const list = League.challengeList();
        const rowsHtml = list.map((b, i) => `
            <div class="league-row">
                <span class="icon-circle sm">${b.avatar}</span>
                <span class="league-name">${b.name}<br><small class="muted">⚔️ ${U.fmt(b.cp)}</small></span>
                <span class="league-score">⭐+${b.starReward}</span>
                <button class="btn sm primary ${S.league.tickets > 0 ? '' : 'disabled'}" onclick="UI.onChallenge(${i})">도전 <small>🎫1</small></button>
            </div>`).join('');
        this.els.leagueModal.innerHTML = `
            <div class="modal-card wide">
                <div class="row" style="justify-content:space-between">
                    <button class="btn sm" onclick="UI.openLeague()">◀ 뒤로</button>
                    <h3>상대 선택</h3>
                </div>
                <p class="muted" style="text-align:center">도전 티켓은 매일 09:00에 보충됩니다!</p>
                <p class="big-stat" style="text-align:center">🎫 ${S.league.tickets}/${League.TICKET_MAX}</p>
                <div class="league-list">${rowsHtml}</div>
                <button class="btn" onclick="UI.closeLeague()">닫기</button>
            </div>`;
    },
    onChallenge(idx) {
        const r = League.challenge(idx);
        if (!r) { this.toast('🎫 도전 티켓이 부족합니다'); return; }
        this.toast(r.win ? `🏆 승리! ⭐+${r.starReward}` : `💀 ${r.bot.name}에게 패배했습니다`);
        Chat.shareLeagueResult(r.win, Combat.combatPower(), r.bot); // UI-SPEC 28번: 리그 전투 공유 카드 자동 게시
        this.renderChatPreview();
        this.renderLeagueChallenge();
        this.renderTopBar();
    },

    // ---- 진행 패스 (UI-SPEC 18번): 스테이지 도달 마일스톤. 무료만 실지급, 프리미엄은 잠금 표시(더미) ----
    CURRENCY_ICON: { coins: '👑', hammers: '🔨', gems: '◆', tickets: '🎫', potions: '🧪', winders: '⚙️', eggCurrency: '🥚' },
    passRewardText(reward) {
        return Object.entries(reward).map(([k, v]) => `${this.CURRENCY_ICON[k] || ''}${U.fmt(v)}`).join(' ');
    },
    openPass() {
        Pass.ensure();
        this.renderPass();
        this.els.passModal.classList.remove('hidden');
    },
    closePass() { this.els.passModal.classList.add('hidden'); },
    renderPass() {
        const rowsHtml = Pass.MILESTONES.map(m => {
            const [c] = m.stage.split('-').map(Number);
            const reached = Pass.reached(m.stage);
            const claimed = Pass.claimed(m.stage);
            const freeCell = claimed
                ? `<div class="pass-cell free done">${this.passRewardText(m.free)}<br>✅</div>`
                : reached
                    ? `<button class="pass-cell free claimable" onclick="UI.onClaimPass('${m.stage}')">${this.passRewardText(m.free)}<br>수령</button>`
                    : `<div class="pass-cell free locked">${this.passRewardText(m.free)}<br>🔒</div>`;
            const premiumCell = `<div class="pass-cell premium locked" onclick="UI.onPremiumPass()">${this.passRewardText(m.premium)}<br>🔒</div>`;
            return `<div class="pass-milestone-label">${this.difficultyLabel(c)} ${m.stage}</div>
                <div class="pass-row">${freeCell}${premiumCell}</div>`;
        }).join('');
        this.els.passModal.innerHTML = `
            <div class="modal-card wide">
                <div class="row" style="justify-content:space-between">
                    <h3>⚔️ 진행 패스</h3>
                    <span class="pass-price" onclick="UI.onPremiumPass()">${Pass.PREMIUM_PRICE_KR}</span>
                </div>
                <p class="muted" style="text-align:center">전투를 진행하여 보상을 받으세요!</p>
                <div class="pass-header-row"><span>무료</span><span>프리미엄</span></div>
                <div class="pass-track">${rowsHtml}</div>
                <button class="btn" onclick="UI.closePass()">닫기</button>
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
        this.els.shopModal.classList.remove('hidden');
    },
    closeShop() { this.els.shopModal.classList.add('hidden'); },
    renderShop() {
        const dealsHtml = Shop.DEALS.map(d => {
            const claimed = Shop.claimed(d.key);
            return `<div class="shop-deal-card">
                <div class="shop-deal-title">${d.name}</div>
                <div class="row" style="align-items:center;justify-content:space-between">
                    <div class="shop-deal-reward">${this.passRewardText(d.reward)}</div>
                    <span class="shop-deal-icon">${d.icon}</span>
                </div>
                <button class="btn ${claimed ? 'disabled' : 'primary'}" onclick="UI.onClaimDeal('${d.key}')">
                    ${claimed ? '✅ 오늘 수령 완료' : `🎁 무료 수령 <small class="muted">(정가 ${d.priceKR})</small>`}
                </button>
            </div>`;
        }).join('');
        const gemsHtml = Shop.GEM_PACKS.map(p => `
            <div class="shop-gem-card">
                <div class="shop-gem-amt">◆ ${U.fmt(p.gems)}</div>
                <button class="btn primary" onclick="UI.onBuyGems()">${p.priceKR}</button>
            </div>`).join('');
        this.els.shopModal.innerHTML = `
            <div class="modal-card wide">
                <h3>🏪 상점</h3>
                <div class="shop-banner">오늘의 특가</div>
                <p class="muted" style="text-align:center">일일 특가 3개는 매일 09:00에 초기화됩니다</p>
                <div class="shop-deals">${dealsHtml}</div>
                <div class="shop-banner">보석</div>
                <div class="shop-gems">${gemsHtml}</div>
                <button class="btn" onclick="UI.closeShop()">닫기</button>
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
    openProfile() { this._profileView = 'profile'; this._avatarPicking = false; this.renderProfile(); this.els.profileModal.classList.remove('hidden'); },
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
            <div class="modal-card">
                <h3>프로필</h3>
                <div class="row" style="align-items:flex-start">
                    <div class="profile-avatar-box">
                        <span class="profile-avatar-big">${S.avatarEmoji || '🛡️'}</span>
                        <button class="btn sm" onclick="UI.onToggleAvatarPick()">✏️</button>
                    </div>
                    <div style="flex:1">
                        <label class="muted" style="font-size:.72rem">이름:</label>
                        <div class="row" style="align-items:center">
                            <span class="profile-field">${U.escapeHtml(S.nickname || '용사')}</span>
                            <button class="btn sm" onclick="UI.onEditNickname()">✏️</button>
                        </div>
                        <label class="muted" style="font-size:.72rem">성별:</label>
                        <div class="row" style="align-items:center">
                            <span class="profile-field">${S.gender || '♂'}</span>
                            <button class="btn sm" onclick="UI.onToggleGender()">✏️</button>
                        </div>
                    </div>
                </div>
                ${avatarPicker}
                <p class="muted" style="text-align:center;margin-top:.6rem">서버 랭킹</p>
                <div class="row">
                    <button class="btn primary" onclick="UI.openStub('🏆 파워 랭킹', '서버 내 전투력 랭킹은 준비 중입니다.')">파워 랭킹</button>
                    <button class="btn primary" onclick="UI.openStub('🛡 클랜 랭킹', '클랜 시스템은 준비 중입니다.')">클랜 랭킹</button>
                </div>
                <div class="profile-tabs">
                    <button class="btn ${this._profileView === 'profile' ? 'on' : ''}" onclick="UI.switchProfileView('profile')">프로필</button>
                    <button class="btn ${this._profileView === 'settings' ? 'on' : ''}" onclick="UI.switchProfileView('settings')">설정</button>
                </div>
                <button class="btn" onclick="UI.closeProfile()">닫기</button>
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
        const staticRow = (label) => `<div class="settings-row static" onclick="UI.toast('데모 버전에서는 지원하지 않습니다')"><span>${label}</span></div>`;
        this.els.profileModal.innerHTML = `
            <div class="modal-card">
                <h3>설정</h3>
                <p class="muted" style="text-align:center">서버 시간: ${new Date().toLocaleString('ko-KR')}</p>
                ${toggle('진동', d.vibration, "UI.onToggleSettingsDummy('vibration')")}
                ${toggle('음악', S.musicOn, "UI.onToggleMusic()")}
                ${toggle('사운드 효과', S.sfxOn, "UI.onToggleSfxSetting()")}
                ${toggle('채팅 표시', d.chatShow, "UI.onToggleSettingsDummy('chatShow')")}
                ${toggle('채팅 다크 모드', d.chatDark, "UI.onToggleSettingsDummy('chatDark')")}
                ${toggle('클랜 채팅 미리보기', d.clanChatPreview, "UI.onToggleSettingsDummy('clanChatPreview')")}
                ${staticRow('언어')}
                ${staticRow('계정')}
                ${staticRow('차단 목록')}
                ${staticRow('개인정보 보호')}
                <div class="profile-tabs">
                    <button class="btn ${this._profileView === 'profile' ? 'on' : ''}" onclick="UI.switchProfileView('profile')">프로필</button>
                    <button class="btn ${this._profileView === 'settings' ? 'on' : ''}" onclick="UI.switchProfileView('settings')">설정</button>
                </div>
                <button class="btn" onclick="UI.closeProfile()">닫기</button>
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
    openPlayerInfo() { this.renderPlayerInfo(); this.els.playerInfoModal.classList.remove('hidden'); },
    closePlayerInfo() { this.els.playerInfoModal.classList.add('hidden'); },
    renderPlayerInfo() {
        const stats = Forge.heroStats();
        const cp = Combat.combatPower();
        const stars = Ascension.totalStars();

        // 현재 전투 장면 미니 프리뷰: 3D 캔버스를 별도로 복제 렌더링하는 대신
        // 스테이지 라벨 + 진행 웨이브 점 + 출전 펫/탈것 아이콘으로 근사(원본은 실제 3D 축소 화면이나 클론 범위상 자체 설계)
        const waveHtml = Dungeons.run ? '' : [1, 2, 3, 4, 5].map(w =>
            `<span class="pip ${w < Combat.wave ? 'done' : w === Combat.wave ? 'now' : ''}"></span>`).join('');
        const petIcons = S.activePets.map(i => PET_ICONS[S.pets[i].name] || '🐾').join(' ');
        const previewHtml = `
            <div class="pinfo-preview">
                <span>🛡️</span>
                <span>${this.els.stageLabel.textContent}</span>
                ${waveHtml}
                ${petIcons ? `<span>${petIcons}</span>` : ''}
            </div>`;

        const gearHtml = SLOTS.map(slot => {
            const it = S.equipment[slot];
            if (!it) return `<div class="equip-cell empty"><span class="slot-name">${SLOT_KR[slot]}</span></div>`;
            return `<div class="equip-cell" style="--rc:${RARITY_CSS[it.rarity]}" title="${it.name}" onclick="UI.openGearDetail('${slot}')">
                ${this.itemImgHTML(it, 'cell-img')}
                <span class="cell-lv">Lv.${it.level}${it.stars ? ` ⭐${it.stars}` : ''}</span>
            </div>`;
        }).join('');

        const skillIconsHtml = S.equippedSkills.map(id =>
            `<span class="icon-circle sm">${SKILL_ICONS[id] || '✨'}<span class="lv-badge">Lv.${Skills.level(id)}</span></span>`).join('');
        const petIconsHtml = S.activePets.map(i => {
            const p = S.pets[i];
            return `<span class="icon-circle sm">${PET_ICONS[p.name] || '🐾'}<span class="lv-badge">Lv.${p.level}</span></span>`;
        }).join('');

        const subsHtml = SUBSTATS
            .map(([key, label]) => ({ key, label, value: +stats.subs[key].toFixed(1) }))
            .filter(s => s.value > 0)
            .map(s => `<div>${U.subText(s)}</div>`)
            .join('') || '<div class="muted">보유한 옵션 없음</div>';

        this.els.playerInfoModal.innerHTML = `
            <div class="modal-card">
                <h3>플레이어 정보</h3>
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
                <div class="pinfo-section-title">장착 장비</div>
                <div class="equip-grid">${gearHtml}</div>
                <div class="pinfo-section-title">장착 스킬 · 펫</div>
                <div class="pinfo-loadout-row">${skillIconsHtml}${petIconsHtml || '<span class="muted">출전 중인 펫 없음</span>'}</div>
                <div class="pinfo-section-title">옵션 합계</div>
                <div class="pinfo-subs-list">${subsHtml}</div>
                <button class="btn" onclick="UI.closePlayerInfo()">닫기</button>
            </div>`;
    },

    // ---- 채팅 화면 (UI-SPEC 28번): 하단 1줄 미리보기 + 탭하면 전체화면 채팅 ----
    chatMsgHtml(m) {
        if (m.type === 'share') {
            // 좌=승자(초록) / 우=패자(회색) — 내가 졌어도 승자는 항상 왼쪽 (UI-SPEC 28번)
            const winner = m.win ? { name: m.myName, avatar: m.myAvatar, cp: m.myCp } : { name: m.oppName, avatar: m.oppAvatar, cp: m.oppCp };
            const loser = m.win ? { name: m.oppName, avatar: m.oppAvatar, cp: m.oppCp } : { name: m.myName, avatar: m.myAvatar, cp: m.myCp };
            return `<div class="chat-row">
                <span class="chat-avatar">${m.myAvatar}</span>
                <div class="chat-bubble-wrap">
                    <div class="chat-name-line"><span class="chat-name" style="color:#ffab40">${U.escapeHtml(m.myName)}</span><span class="chat-time">${new Date(m.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span></div>
                    <div class="chat-share-card">
                        <div class="chat-share-side win">
                            <span class="icon-circle sm">${winner.avatar}</span>
                            <small>${U.escapeHtml(winner.name)}</small>
                            <small class="muted">⚔️ ${U.fmt(winner.cp)}</small>
                        </div>
                        <div class="chat-share-side lose">
                            <span class="icon-circle sm">${loser.avatar}</span>
                            <small>${U.escapeHtml(loser.name)}</small>
                            <small class="muted">⚔️ ${U.fmt(loser.cp)}</small>
                        </div>
                        <span class="chat-share-badge">${m.win ? '🏆 승리' : '💀 패배'}</span>
                    </div>
                </div>
            </div>`;
        }
        const tagHtml = m.tag ? `<span class="chat-tag">[${U.escapeHtml(m.tag)}]</span> ` : '';
        return `<div class="chat-row ${m.mine ? 'mine' : ''}">
            <span class="chat-avatar">${m.avatar}</span>
            <div class="chat-bubble-wrap">
                <div class="chat-name-line">
                    <span class="chat-name">${tagHtml}${U.escapeHtml(m.name)}</span><span class="muted">${m.gender}</span>
                    <span class="chat-time">${new Date(m.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div class="chat-bubble">${U.escapeHtml(m.text)}</div>
            </div>
        </div>`;
    },
    renderChatPreview() {
        const last = Chat.lastMessage();
        if (!last || !this.els.chatPreview) return;
        const preview = last.type === 'share' ? `${U.escapeHtml(last.myName)}이(가) 전투를 공유했습니다` : `${U.escapeHtml(last.name)}: ${U.escapeHtml(last.text)}`;
        this.els.chatPreview.innerHTML = `<span class="chat-preview-text">${preview}</span><span class="chat-preview-badge">💬</span>`;
    },
    openChat() {
        Chat.ensure();
        this.renderChatFull();
        this.els.chatModal.classList.remove('hidden');
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
                    <button class="btn primary sm" onclick="UI.onSendChat()">전송</button>
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
                ? ` <small class="tech-branch-time" id="tech-b-time-${b.id}" style="color:#4caf50">(${U.fmtTime((S.techResearch.endsAt - U.now()) / 1000)})</small>` : '';
            return `<button class="tech-branch-card" onclick="UI.openTechBranch('${b.id}')">
                <div class="tech-branch-title">${b.name}</div>
                <div class="tech-branch-icon">${b.icon}</div>
                <div class="tech-branch-pct">${pct.toFixed(1)}%${timeHtml}</div>
            </button>`;
        }).join('');
        this.els.techPanel.innerHTML = `
            <h2>🔬 기술 트리 <span class="muted">🧪 ${U.fmt(S.potions || 0)}</span></h2>
            <div class="tech-branch-grid">${cardsHtml}</div>`;
    },
    renderTechBranchView() {
        const b = TechTree.BRANCHES.find(x => x.id === this._techBranch);
        const pct = TechTree.branchProgress(b.id);
        const nodesHtml = b.nodes.map((id, i) => {
            const lv = TechTree.level(id);
            const max = TechTree.isMax(id);
            const researching = TechTree.researchingId() === id;
            const cls = max ? 'done' : (lv > 0 || researching) ? 'active' : 'locked';
            const badge = researching
                ? `<small class="tech-tree-time" id="tech-n-time-${id}">${U.fmtTime((S.techResearch.endsAt - U.now()) / 1000)}</small>`
                : `<small>${lv}/${TechTree.MAX_LEVEL}</small>`;
            return `${i > 0 ? '<div class="tech-tree-line"></div>' : ''}
                <button class="tech-tree-node ${cls}" onclick="UI.openTechNode('${id}')">
                    <span class="tech-tree-icon">${max ? '⭐' : '🔬'}</span>
                </button>
                <div class="tech-tree-label">${TechTree.NODES[id].name}<br>${badge}</div>`;
        }).join('');
        this.els.techPanel.innerHTML = `
            <div class="row" style="justify-content:space-between">
                <button class="btn sm" onclick="UI.openTechOverview()">◀ 뒤로</button>
                <h2>${b.icon} ${b.name} <small class="muted">${pct.toFixed(1)}%</small></h2>
            </div>
            <div class="tech-tree-col">${nodesHtml}</div>`;
    },
    // 노드 팝업 (분기 트리 위에 뜨는 별도 모달, UI-SPEC 15~16번 "노드 팝업")
    openTechNode(id) { this._techNode = id; this.renderTechNodeModal(); this.els.techNodeModal.classList.remove('hidden'); },
    closeTechNode() { this.els.techNodeModal.classList.add('hidden'); },
    renderTechNodeModal() {
        const id = this._techNode;
        const def = TechTree.NODES[id];
        const lv = TechTree.level(id);
        const max = TechTree.isMax(id);
        const researching = TechTree.researchingId() === id;
        const otherResearch = S.techResearch && !researching;

        let actionHtml;
        if (max) {
            actionHtml = `<div class="muted" style="text-align:center">연구 완료 (MAX)</div>`;
        } else if (researching) {
            const remain = (S.techResearch.endsAt - U.now()) / 1000;
            actionHtml = `<div class="row">
                <div class="upg-progress"><div id="tech-node-fill" style="width:${U.clamp(1 - remain / TechTree.time(id, lv + 1), 0, 1) * 100}%"></div><span id="tech-node-time">${U.fmtTime(remain)}</span></div>
                <button class="btn gem" onclick="UI.onTechGemSkip()">💎 ${TechTree.gemSkipCost()} 건너뛰기</button>
            </div>
            <button class="btn danger" onclick="UI.onTechCancel()">취소</button>`;
        } else {
            const cost = TechTree.nextCost(id), time = TechTree.time(id, lv + 1);
            const disabled = otherResearch || S.potions < cost;
            actionHtml = `<button class="btn primary ${disabled ? 'disabled' : ''}" onclick="UI.onTechStart('${id}')">
                🔬 연구 시작<br><small>🧪 ${U.fmt(cost)} · ⏱ ${U.fmtTime(time)}</small></button>
                ${otherResearch ? '<p class="muted">다른 연구가 진행 중입니다</p>' : ''}`;
        }

        this.els.techNodeModal.innerHTML = `
            <div class="modal-card wide">
                <h3>${def.name}</h3>
                <p class="muted">${def.desc}</p>
                <p>레벨 ${lv} → ${max ? '(최고)' : lv + 1} · 현재 효과 +${U.fmt(TechTree.pct(id))}% ${!max ? `(다음 +${U.fmt((lv + 1) * def.per)}%)` : ''}</p>
                ${actionHtml}
                <button class="btn" onclick="UI.closeTechNode()">닫기</button>
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
        const progress = need ? U.clamp(S.mountOpens / need, 0, 1) : 1;
        const rates = Mounts.rates();
        const ratesHtml = RARITIES.filter(r => rates[r] > 0).map(r =>
            `<span class="prob-chip" style="--c:${RARITY_CSS[r]}">${RARITY_KR[r]} ${(rates[r] * 100).toFixed(2)}%</span>`).join('');

        const owned = Object.entries(S.mounts);
        const listHtml = owned.length ? owned.map(([name, m]) => {
            const active = S.activeMount === name;
            const pw = Mounts.mountPower(m);
            const subsText = (m.subs || []).map(s => U.subText(s)).join(' · ');
            const maxed = m.level >= Mounts.INDIV_MAX_LEVEL;
            return `<div class="pet-card with-icon ${active ? 'active' : ''}" style="--rc:${RARITY_CSS[m.rarity]}">
                <span class="icon-circle">${MOUNT_ICONS[name] || '🐴'}</span>
                <span class="item-name">${MOUNT_KR[name] || name} <small>Lv.${m.level}${m.stars ? ` ⭐${m.stars}` : ''}</small></span>
                <span class="item-stat">⚔️ ${U.fmt(pw.atk)} · ❤️ ${U.fmt(pw.hp)} · ${RARITY_KR[m.rarity]}</span>
                <span class="muted">중복(승천 재료) ${m.dupes}${subsText ? ' · ' + subsText : ''}</span>
                <div class="btn-col">
                    <button class="btn sm ${active ? 'on' : ''}" onclick="UI.onEquipMount('${name}')">${active ? '장착 중' : '장착'}</button>
                    ${maxed ? `<button class="btn sm ${Mounts.canAscend(name) ? '' : 'disabled'}" onclick="UI.onAscendMount('${name}')">⭐ 승천</button>`
                        : `<button class="btn sm" onclick="UI.openMountUpgrade('${name}')">업그레이드</button>`}
                </div>
            </div>`;
        }).join('') : '<span class="muted">보유 마운트 없음 — 소환해보세요!</span>';

        this.els.mountModal.innerHTML = `
            <div class="modal-card wide">
                <h3>🐴 마운트 <small class="muted">⚙️ ${U.fmt(S.winders || 0)}</small></h3>
                <p class="muted">탈것은 직접 공격하지 않고, 장착 시 고정 공격력·체력과 옵션을 제공합니다. 레벨업은 다른 탈것을 합성(업그레이드)해야 가능합니다.</p>
                <div class="row">
                    <div class="tech-node" style="flex:1">
                        <div class="tech-node-head">
                            <span class="item-name">소환 레벨</span>
                            <span class="muted">Lv.${lvl} / ${Mounts.MAX_LEVEL}${need ? ` (${S.mountOpens}/${need})` : ' MAX'}</span>
                        </div>
                        <div class="tech-node-bar"><div style="width:${(progress * 100).toFixed(1)}%"></div></div>
                    </div>
                </div>
                <div class="prob-box">${ratesHtml}</div>
                <div class="row">
                    <button class="btn primary ${Mounts.canSummon() ? '' : 'disabled'}" onclick="UI.onSummonMount()">소환 <small>⚙️ ${WINDERS_PER_SUMMON}</small></button>
                </div>
                <h3>보유 마운트</h3>
                <div class="pet-list">${listHtml}</div>
                <button class="btn" onclick="UI.closeMounts()">닫기</button>
            </div>`;
        this.els.mountModal.classList.remove('hidden');
    },
    closeMounts() { this.els.mountModal.classList.add('hidden'); },
    onSummonMount() {
        const r = Mounts.summon();
        if (!r) { this.toast('⚙️ 태엽이 부족합니다 (스테이지 클리어로 획득)'); return; }
        if (r.isNew) this.toast(`🎉 새 마운트: ${MOUNT_KR[r.name] || r.name} (${RARITY_KR[r.rarity]})`);
        else this.toast(`${MOUNT_KR[r.name] || r.name} 중복 획득 (재료 ${S.mounts[r.name].dupes})`);
        this.openMounts(); this.renderTopBar();
    },
    onEquipMount(name) { if (Mounts.equip(name)) this.openMounts(); },
    onAscendMount(name) {
        if (!Mounts.ascend(name)) { this.toast('⚙️ 승천에 필요한 중복이 부족합니다'); return; }
        this.toast(`⭐ ${MOUNT_KR[name] || name} 승천! (⭐${S.mounts[name].stars})`);
        this.openMounts();
    },

    // 마운트 업그레이드 팝업 (펫 업그레이드와 동일 방식): 다른 탈것을 재료로 흡수해 경험치로 레벨업
    _mountUpgradeTarget: null, _mountUpgradeMats: null,
    openMountUpgrade(name) {
        this._mountUpgradeTarget = name;
        this._mountUpgradeMats = [];
        this.renderMountUpgrade();
        this.els.mountUpgradeModal.classList.remove('hidden');
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
            <button class="mat-chip ${sel.includes(n) ? 'on' : ''}" style="--rc:${RARITY_CSS[m.rarity]}" onclick="UI.onToggleMountUpgradeMat('${n}')">
                <span>${MOUNT_ICONS[n] || '🐴'}</span><small>Lv.${m.level}</small>
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
        const sel = this._mountUpgradeMats;
        if (!sel.length) return;
        if (!Mounts.absorbMaterials(name, sel)) return;
        this.toast(`✨ ${MOUNT_KR[name] || name} Lv.${S.mounts[name].level}!`);
        this._mountUpgradeMats = [];
        this.renderMountUpgrade();
        this.renderTopBar();
    },

    onToggleSfx() {
        S.sfxOn = !S.sfxOn;
        if (S.sfxOn) { SFX.resume(); SFX.craft(); }
        this.renderMenu();
        saveGame();
    },

    // ---- 승천(별) ----
    openAscension() {
        const b = Ascension.starBreakdown();
        this.els.ascendModal.innerHTML = `
            <div class="modal-card wide">
                <h3>🌟 승천(별) <small class="muted">합계 ⭐ ${b.gear + b.skill + b.pet + b.mount}</small></h3>
                <p class="muted">장비·스킬·펫·탈것은 각각 따로 승천합니다. 별 1개당 해당 대상의 능력치가 크게 상승합니다.</p>
                <p class="muted">
                    · 장비: 장착 중인 것과 같은 종류(부위·등급·이름)를 다시 획득하면 제작 결과 팝업에서 [⭐ 승천]<br>
                    · 스킬·펫·탈것: 각 화면에서 만렙 도달 후 중복(조각/알)을 모아 [⭐ 승천] 버튼으로 진행
                </p>
                <div class="stat-grid">
                    <div>⚒️ 장비 별</div><div>⭐ ${b.gear}</div>
                    <div>✨ 스킬 별</div><div>⭐ ${b.skill}</div>
                    <div>🐾 펫 별</div><div>⭐ ${b.pet}</div>
                    <div>🐴 탈것 별</div><div>⭐ ${b.mount}</div>
                </div>
                <button class="btn" onclick="UI.closeAscension()">닫기</button>
            </div>`;
        this.els.ascendModal.classList.remove('hidden');
    },
    closeAscension() { this.els.ascendModal.classList.add('hidden'); },

    showOffline(o) {
        this.els.offlineModal.innerHTML = `
            <div class="modal-card">
                <h3>💤 오프라인 보상</h3>
                <p>수집 시간: ${U.fmtTime(o.counted)}${o.elapsed > o.counted ? ' (최대)' : ''}</p>
                <p class="muted">👑 ${U.fmtDec(o.coinRate)}/초 &nbsp; 🔨 ${U.fmtDec(o.hammerRate)}/분</p>
                <div class="big-stat">👑 ${U.fmtDec(o.coins)} &nbsp; 🔨 ${U.fmtDec(o.hammers)}</div>
                <button class="btn primary" onclick="document.getElementById('offline-modal').classList.add('hidden')">수집</button>
            </div>`;
        this.els.offlineModal.classList.remove('hidden');
    },

    onClaimOffline() {
        const r = claimOfflineNow();
        if (!r) { this.toast('💤 아직 누적된 오프라인 보상이 없습니다'); return; }
        this.showOffline(r);
        this.els.offlineBtn.classList.remove('ready');
        this.renderTopBar();
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
        this.renderTopBar(); this.renderDebug(); saveGame();
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
        this.els.offlineBtn.classList.toggle('ready', (U.now() - S.lastOfflineClaim) / 1000 >= 60);
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
        const eggT = document.getElementById('equip-egg-t');
        if (eggT && S.hatching[0]) eggT.textContent = U.fmtTime((S.hatching[0].endsAt - U.now()) / 1000);
        // 기술 트리 연구 카운트다운 (개요 카드 / 분기 트리 노드 / 노드 팝업 진행바)
        if (S.techResearch) {
            const remain = (S.techResearch.endsAt - U.now()) / 1000;
            const bTime = document.getElementById('tech-b-time-' + TechTree.branchOf(S.techResearch.id).id);
            if (bTime) bTime.textContent = `(${U.fmtTime(remain)})`;
            const nTime = document.getElementById('tech-n-time-' + S.techResearch.id);
            if (nTime) nTime.textContent = U.fmtTime(remain);
            const fill = document.getElementById('tech-node-fill'), popupTime = document.getElementById('tech-node-time');
            if (fill) fill.style.width = U.clamp(1 - remain / TechTree.time(S.techResearch.id, TechTree.level(S.techResearch.id) + 1), 0, 1) * 100 + '%';
            if (popupTime) popupTime.textContent = U.fmtTime(remain);
        }
    },
};
