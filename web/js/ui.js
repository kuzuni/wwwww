// ===== UI: 탭/패널/HUD/모달/토스트 =====
const UI = {
    els: {},
    activeTab: 'battle',
    _pendingItem: null,

    init() {
        const $ = id => document.getElementById(id);
        this.els = {
            topbar: $('topbar'), stageLabel: $('stage-label'), wavePips: $('wave-pips'),
            heroHp: $('hero-hp-fill'), heroHpText: $('hero-hp-text'), heroCp: $('hero-cp'),
            bossBar: $('boss-bar'), bossFill: $('boss-bar-fill'), bossWarn: $('boss-warning'),
            dmgFlash: $('dmg-flash'), lootFeed: $('loot-feed'), skillBar: $('skill-bar'),
            toasts: $('toasts'), farmToggle: $('farm-toggle'),
            panels: { forge: $('panel-forge'), pets: $('panel-pets'), skills: $('panel-skills'), menu: $('panel-menu'), debug: $('panel-debug') },
            craftModal: $('craft-modal'), offlineModal: $('offline-modal'),
            dungeonModal: $('dungeon-modal'), dungeonBtn: $('dungeon-btn'),
            techModal: $('tech-modal'), mountModal: $('mount-modal'), ascendModal: $('ascend-modal'),
        };
        this.els.dungeonBtn.addEventListener('click', () => this.openDungeons());
        document.querySelectorAll('#tabbar button').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });
        this.els.farmToggle.style.display = 'none'; // 반복파밍 제거 — 무조건 전진
        this.renderTopBar();
        this.renderSkillBar();
    },

    switchTab(tab) {
        this.activeTab = tab;
        document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        for (const [k, p] of Object.entries(this.els.panels)) p.classList.toggle('open', k === tab);
        if (tab === 'forge') this.renderForge();
        if (tab === 'pets') this.renderPets();
        if (tab === 'skills') this.renderSkills();
        if (tab === 'menu') this.renderMenu();
        if (tab === 'debug') this.renderDebug();
    },

    // ---- 상단바 ----
    renderTopBar() {
        this.els.topbar.innerHTML = `
            <span class="cur">🔨 ${U.fmt(S.hammers)}</span>
            <span class="cur">🪙 ${U.fmt(S.coins)}</span>
            <span class="cur">💎 ${U.fmt(S.gems)}</span>
            <span class="cur">🎫 ${U.fmt(S.tickets)}</span>
            <span class="cur forge-badge">⚒️ Lv.${S.forgeLevel}</span>`;
    },

    // ---- 전투 HUD ----
    updateStageLabel() {
        if (Dungeons.run) {
            const d = Dungeons.def(Dungeons.run.id);
            this.els.stageLabel.textContent = `${d.icon} ${d.kr} ${Dungeons.run.stage}단계`;
        } else this.els.stageLabel.textContent = `${S.chapter}-${S.stage}`;
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
    updateCp() {
        const st = Combat.hero.stats;
        if (!st) return;
        const cp = st.atk * st.attacksPerSec * (1 + st.critCh / 100 * st.critDmg / 100) + st.hp / 8;
        this.els.heroCp.textContent = `⚔️ ${U.fmt(cp)}`;
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
    toastSkill(def) { this.floatLoot(`✨ ${def.name}!`); },

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
    renderForge() {
        const p = this.els.panels.forge;
        const info = Forge.upgradeInfo();
        const upgrading = !!S.forgeUpgradeEndsAt;
        let upgHtml;
        if (!info) upgHtml = `<div class="row muted">대장간 최고 레벨 (35)</div>`;
        else if (upgrading) {
            upgHtml = `<div class="row">
                <div class="upg-progress"><div id="upg-fill"></div><span id="upg-time"></span></div>
                <button class="btn gem" onclick="UI.onGemSkipForge()">💎 <span id="upg-skip-cost">${Forge.gemSkipCost()}</span> 스킵</button>
            </div>`;
        } else {
            const cost = Forge.upgradeCost(info), time = Forge.upgradeTime(info);
            upgHtml = `<div class="row">
                <button class="btn primary ${S.coins < cost ? 'disabled' : ''}" onclick="UI.onStartUpgrade()">
                    ⚒️ Lv.${S.forgeLevel + 1} 업그레이드<br><small>🪙 ${U.fmt(cost)} · ⏱ ${U.fmtTime(time)}</small>
                </button>
            </div>`;
        }

        const probs = forgeProbabilities[S.forgeLevel];
        const probHtml = Object.entries(probs).map(([age, pc]) =>
            `<span class="prob-chip" style="--c:#${AGE_COLORS[age].toString(16).padStart(6, '0')}">${AGE_KR[age]} ${pc}%</span>`).join('');

        const autoUnlocked = isUnlocked('autoForge');
        const equipHtml = SLOTS.map(slot => {
            const it = S.equipment[slot];
            if (!it) return `<div class="equip-cell empty"><span class="slot-name">${SLOT_KR[slot]}</span><span class="muted">없음</span></div>`;
            const typeTag = it.wtype ? (WEAPON_TYPES[it.wtype].kind === 'ranged' ? ' 🏹' : ' 🗡') : '';
            return `<div class="equip-cell" style="--rc:${RARITY_CSS[it.rarity]}">
                ${this.itemImgHTML(it, 'cell-img')}
                <span class="slot-name">${SLOT_KR[slot]}${typeTag}</span>
                <span class="item-name">${it.name}</span>
                <span class="item-stat">${it.main === 'atk' ? '⚔️' : '❤️'} ${U.fmt(it.value)} · Lv.${it.level}</span>
                <span class="item-age">${AGE_KR[it.age]} · ${RARITY_KR[it.rarity]}</span>
            </div>`;
        }).join('');

        p.innerHTML = `
            <h2>⚒️ 대장간 <span class="muted">Lv.${S.forgeLevel} / 35</span></h2>
            ${upgHtml}
            <div class="prob-box">${probHtml}</div>
            <div class="row">
                <button class="btn primary" onclick="UI.onCraft(1)">제작 ×1 <small>🔨 1</small></button>
                <button class="btn ${autoUnlocked ? '' : 'disabled'}" onclick="UI.onCraft(10)">제작 ×10 <small>${autoUnlocked ? '🔨 10' : '🔒 2-10 해금'}</small></button>
                <button class="btn ${autoUnlocked ? (S.autoForgeOn ? 'on' : '') : 'disabled'}" onclick="UI.onToggleAutoForge()">
                    오토 포지 ${autoUnlocked ? (S.autoForgeOn ? 'ON' : 'OFF') : '🔒'}</button>
            </div>
            <h3>장착 장비</h3>
            <div class="equip-grid">${equipHtml}</div>`;
    },

    onStartUpgrade() { if (Forge.startUpgrade()) { this.renderForge(); this.renderTopBar(); } },
    onGemSkipForge() { if (Forge.gemSkip()) { this.renderTopBar(); } },
    onToggleAutoForge() {
        if (!isUnlocked('autoForge')) { this.toast('🔒 스테이지 2-10 도달 시 해금됩니다'); return; }
        S.autoForgeOn = !S.autoForgeOn;
        this.renderForge();
        saveGame();
    },

    onCraft(n) {
        if (n > 1 && !isUnlocked('autoForge')) { this.toast('🔒 스테이지 2-10 도달 시 해금됩니다'); return; }
        if (S.hammers < 1) { this.toast('🔨 해머가 부족합니다 (분당 1개 수급)'); return; }
        if (n === 1) {
            const item = Forge.craft(1)[0];
            this._pendingItem = item;
            this.showCraftModal(item);
        } else {
            const items = Forge.craft(n);
            let equipped = 0, gained = 0;
            for (const it of items) {
                const r = Forge.autoResolve(it);
                if (r.equipped) equipped++;
                gained += r.gained;
            }
            this.toast(`제작 ${items.length}회 — 장착 ${equipped}개, 판매 +🪙${U.fmt(gained)}`);
            this.renderForge();
        }
        this.renderTopBar();
    },

    SLOT_EMOJI: { gloves: '🧤', necklace: '📿', ring: '💍', shoes: '👢', belt: '🎽' },

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
            ? `<div class="sub">${item.subs.map(s => `+${s.value}% ${s.label}`).join(' · ')}</div>` : '';
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
        const pNew = Forge.itemPower(item), pCur = Forge.itemPower(cur);
        const better = pNew >= pCur;
        const diff = pCur > 0 ? ((pNew / pCur - 1) * 100) : 100;
        // 새 장비가 위, 장착 중인 장비가 아래
        this.els.craftModal.innerHTML = `
            <div class="modal-card wide" style="--rc:${RARITY_CSS[item.rarity]}">
                <h3>${SLOT_KR[item.slot]} 획득!</h3>
                <div class="cmp-wrap">
                    ${this.itemCardHTML(item, 'NEW! 새 장비', better, true)}
                    <div class="cmp-arrow ${better ? 'up' : 'down'}">${cur ? (better ? '▲ ' : '▼ ') + Math.abs(diff).toFixed(0) + '%' : 'NEW!'}</div>
                    ${this.itemCardHTML(cur, '장착 중', !better && cur)}
                </div>
                <div class="row">
                    <button class="btn equip" onclick="UI.resolveCraft(true)">✅ 장착${cur ? ' (기존 판매)' : ''}</button>
                    <button class="btn sell" onclick="UI.resolveCraft(false)">🪙 판매 +${U.fmt(Forge.sellPrice(item))}</button>
                </div>
            </div>`;
        this.els.craftModal.classList.remove('hidden');
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

    resolveCraft(equip) {
        const item = this._pendingItem;
        this._pendingItem = null;
        this.els.craftModal.classList.add('hidden');
        if (!item) return;
        if (equip) {
            const prev = Forge.equip(item);
            if (prev) Forge.sell(prev);
        } else Forge.sell(item);
        this.renderTopBar();
        if (this.activeTab === 'forge') this.renderForge();
        saveGame();
    },

    // ---- 펫 패널 ----
    renderPets() {
        if (this.activeTab !== 'pets') return;
        const p = this.els.panels.pets;
        const hatchHtml = [0, 1].map(i => {
            const h = S.hatching[i];
            if (!h) return `<div class="hatch-slot empty">빈 부화 슬롯</div>`;
            return `<div class="hatch-slot" style="--rc:${RARITY_CSS[h.rarity]}">
                <span>${RARITY_KR[h.rarity]} 알</span>
                <span id="hatch-t-${i}">${U.fmtTime((h.endsAt - U.now()) / 1000)}</span>
                <button class="btn gem sm" onclick="UI.onHatchSkip(${i})">💎 ${Pets.gemSkipCost(h)}</button>
            </div>`;
        }).join('');

        const eggsHtml = S.eggs.length ? S.eggs.map((egg, i) =>
            `<button class="egg-chip" style="--rc:${RARITY_CSS[egg.rarity]}" onclick="UI.onStartHatch(${i})">
                🥚 ${RARITY_KR[egg.rarity]}<br><small>${U.fmtTime(Pets.hatchTimeSec(egg.rarity))}</small>
            </button>`).join('') : '<span class="muted">알 없음 — 전투에서 드랍됩니다</span>';

        const petsHtml = S.pets.length ? S.pets.map((pet, i) => {
            const active = S.activePets.includes(i);
            return `<div class="pet-card with-icon ${active ? 'active' : ''}" style="--rc:${RARITY_CSS[pet.rarity]}">
                <span class="icon-circle">${PET_ICONS[pet.name] || '🐾'}</span>
                <span class="item-name">${PET_KR[pet.name] || pet.name} <small>Lv.${pet.level}</small></span>
                <span class="item-stat">⚔️ ${U.fmt(Pets.petHitDamage(pet) / 2)}/s · ${RARITY_KR[pet.rarity]}</span>
                <span class="muted">중복 ${pet.dupes}/${pet.level}</span>
                <button class="btn sm ${active ? 'on' : ''}" onclick="UI.onTogglePet(${i})">${active ? '출전 중' : '출전'}</button>
            </div>`;
        }).join('') : '<span class="muted">보유 펫 없음</span>';

        const mergeHtml = RARITIES.slice(0, -1).map(r => Pets.canMerge(r) ?
            `<button class="btn sm" onclick="UI.onMerge('${r}')" style="--rc:${RARITY_CSS[r]}">${RARITY_KR[r]} 3마리 → ${RARITY_KR[RARITIES[RARITIES.indexOf(r) + 1]]} 알</button>` : '').join('');

        p.innerHTML = `
            <h2>🐾 펫 <span class="muted">출전 ${S.activePets.length}/${Pets.MAX_ACTIVE}</span></h2>
            <h3>부화장</h3><div class="row">${hatchHtml}</div>
            <h3>알 보관함 (${S.eggs.length}/20)</h3><div class="egg-row">${eggsHtml}</div>
            ${mergeHtml ? `<h3>합성</h3><div class="row wrap">${mergeHtml}</div>` : ''}
            <h3>보유 펫</h3><div class="pet-list">${petsHtml}</div>`;
    },

    onStartHatch(i) {
        if (!Pets.startHatch(i)) this.toast('부화 슬롯이 가득 찼습니다 (2칸)');
        this.renderPets();
    },
    onHatchSkip(i) {
        if (!Pets.gemSkip(i)) this.toast('💎 젬이 부족합니다');
        this.renderPets(); this.renderTopBar();
    },
    onTogglePet(i) {
        if (!Pets.toggleActive(i)) this.toast(`출전은 최대 ${Pets.MAX_ACTIVE}마리입니다`);
        this.renderPets();
    },
    onMerge(r) { Pets.merge(r); this.renderPets(); },

    // ---- 스킬 패널 ----
    renderSkills() {
        if (this.activeTab !== 'skills') return;
        const p = this.els.panels.skills;
        const lvl = Skills.summonLevel();
        const rates = Skills.rates();
        const ratesHtml = RARITIES.filter(r => rates[r] > 0).map(r =>
            `<span class="prob-chip" style="--c:${RARITY_CSS[r]}">${RARITY_KR[r]} ${rates[r].toFixed(2)}%</span>`).join('');

        const listHtml = SKILL_DEFS.filter(d => S.skills[d.id]).map(d => {
            const sk = S.skills[d.id];
            const equipped = S.equippedSkills.includes(d.id);
            const typeKr = { aoe: '광역', single: '단일', heal: '회복', buff: '버프' }[d.type];
            const power = d.type === 'heal' ? `${Math.round(Skills.effHeal(d.id) * 100)}% 회복`
                : d.type === 'buff' ? `${Object.entries(d.buff).map(([k, v]) => (k === 'atkPct' ? '공격력' : '공속') + ` +${v}%`).join(' ')}`
                : `${Math.round(Skills.effMult(d.id) * 100)}% 피해`;
            return `<div class="pet-card with-icon ${equipped ? 'active' : ''}" style="--rc:${RARITY_CSS[d.rarity]}">
                <span class="icon-circle">${SKILL_ICONS[d.id] || '✨'}</span>
                <span class="item-name">${d.name} <small>Lv.${sk.level}</small></span>
                <span class="item-stat">${typeKr} · ${power} · 쿨 ${d.cd}초</span>
                <span class="muted">중복 ${sk.dupes}/${sk.level} · ${RARITY_KR[d.rarity]}</span>
                <button class="btn sm ${equipped ? 'on' : ''}" onclick="UI.onToggleSkill('${d.id}')">${equipped ? '장착 중' : '장착'}</button>
            </div>`;
        }).join('') || '<span class="muted">보유 스킬 없음 — 소환해보세요!</span>';

        p.innerHTML = `
            <h2>✨ 스킬 <span class="muted">소환 Lv.${lvl}</span></h2>
            <div class="row">
                <button class="btn primary" onclick="UI.onSummon(false)">소환 <small>🎫 ${Skills.SUMMON_TICKET_COST}</small></button>
                <button class="btn gem" onclick="UI.onSummon(true)">소환 <small>💎 ${Skills.SUMMON_GEM_COST}</small></button>
            </div>
            <div class="prob-box">${ratesHtml}</div>
            <h3>보유 스킬 <span class="muted">(장착 ${S.equippedSkills.length}/4)</span></h3>
            <div class="pet-list">${listHtml}</div>`;
    },

    onSummon(useGems) {
        const r = Skills.summon(useGems);
        if (!r) { this.toast(useGems ? '💎 젬이 부족합니다' : '🎫 티켓이 부족합니다 (스테이지 클리어로 획득)'); return; }
        if (r.isNew) this.toast(`🎉 새 스킬: ${r.def.name} (${RARITY_KR[r.def.rarity]})`);
        else if (r.leveled) this.toast(`⬆️ ${r.def.name} Lv.${r.level}!`);
        else this.toast(`${r.def.name} 중복 획득`);
        this.renderSkills(); this.renderSkillBar(); this.renderTopBar();
    },
    onToggleSkill(id) {
        if (!Skills.toggleEquip(id)) this.toast('스킬은 최대 4개 장착 가능합니다');
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
                <div>🩸 블러드</div><div>${U.fmt(S.blood || 0)} <small class="muted">(기술 트리 재화)</small></div>
                <div>⚙️ 와인더</div><div>${U.fmt(S.winders || 0)} <small class="muted">(마운트 재화)</small></div>
                <div>🌟 승천</div><div>${Ascension.count()}회 <small class="muted">(파워 ×${Ascension.powerMult().toFixed(2)})</small></div>
            </div>
            <div class="row">
                <button class="btn primary" onclick="UI.openTechTree()">🔬 기술 트리</button>
                <button class="btn primary" onclick="UI.openMounts()">🐴 마운트</button>
            </div>
            <div class="row">
                <button class="btn primary" onclick="UI.openAscension()">🌟 승천</button>
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

    // ---- 던전 ----
    openDungeons() {
        Dungeons.ensure();
        const listHtml = Dungeons.DEFS.map(d => {
            const ok = Dungeons.unlocked(d.id);
            const keys = S.dungeons.keys[d.id];
            const best = S.dungeons.best[d.id];
            const next = best + 1;
            return `<div class="dungeon-card ${ok ? '' : 'locked'}">
                <span class="icon-circle">${d.icon}</span>
                <div class="dg-info">
                    <div class="item-name">${d.kr} <small class="muted">${d.name}</small></div>
                    <div class="item-stat">${ok ? `보상: ${d.reward} · 최고 ${best}단계` : `🔒 ${d.unlock} 도달 시 해금`}</div>
                    ${ok ? `<div class="muted">다음 도전 ${next}단계 — ${Dungeons.rewardText(d.id, next)}</div>` : ''}
                </div>
                <div class="dg-btns">
                    <span class="dg-keys">🗝 ${ok ? keys : '-'}/${Dungeons.MAX_KEYS}</span>
                    <button class="btn sm primary ${ok && keys > 0 ? '' : 'disabled'}" onclick="UI.onEnterDungeon('${d.id}')">입장</button>
                    <button class="btn sm ${ok && keys > 0 && best >= 1 ? '' : 'disabled'}" onclick="UI.onSweepDungeon('${d.id}')">소탕</button>
                </div>
            </div>`;
        }).join('');
        this.els.dungeonModal.innerHTML = `
            <div class="modal-card wide">
                <h3>🏰 던전 <small class="muted">열쇠는 자정에 2개로 리셋</small></h3>
                <div class="dungeon-list">${listHtml}</div>
                <button class="btn" onclick="UI.closeDungeons()">닫기</button>
            </div>`;
        this.els.dungeonModal.classList.remove('hidden');
    },
    closeDungeons() { this.els.dungeonModal.classList.add('hidden'); },
    onEnterDungeon(id) {
        if (Dungeons.enter(id)) { this.closeDungeons(); this.updateStageLabel(); this.renderTopBar(); }
        else this.openDungeons(); // 실패 사유 토스트 후 갱신
    },
    onSweepDungeon(id) { if (Dungeons.sweep(id)) this.openDungeons(); },

    // ---- 기술 트리 ----
    openTechTree() {
        TechTree.ensure();
        const branchHtml = TechTree.BRANCHES.map(b => {
            const nodesHtml = b.nodes.map(id => {
                const def = TechTree.NODES[id];
                const lv = TechTree.level(id);
                const max = TechTree.isMax(id);
                const cost = TechTree.nextCost(id);
                const tier = TechTree.tierOf(lv || 1);
                return `<div class="tech-node">
                    <div class="tech-node-head">
                        <span class="item-name">${def.name} <small class="muted">T${tier}</small></span>
                        <span class="muted">${lv}/${TechTree.MAX_LEVEL}</span>
                    </div>
                    <div class="muted" style="font-size:.75rem">${def.desc} · 현재 +${U.fmt(TechTree.pct(id))}%</div>
                    <div class="tech-node-bar"><div style="width:${(lv / TechTree.MAX_LEVEL * 100).toFixed(1)}%"></div></div>
                    <button class="btn sm primary ${!max && S.blood >= cost ? '' : 'disabled'}" onclick="UI.onUpgradeTech('${id}')">
                        ${max ? 'MAX' : `🩸 ${U.fmt(cost)} (+${def.per}%)`}
                    </button>
                </div>`;
            }).join('');
            return `<div class="tech-branch"><h3>${b.icon} ${b.name}</h3><div class="tech-node-grid">${nodesHtml}</div></div>`;
        }).join('');
        this.els.techModal.innerHTML = `
            <div class="modal-card wide">
                <h3>🔬 기술 트리 <small class="muted">🩸 ${U.fmt(S.blood || 0)}</small></h3>
                <div class="tech-scroll">${branchHtml}</div>
                <button class="btn" onclick="UI.closeTechTree()">닫기</button>
            </div>`;
        this.els.techModal.classList.remove('hidden');
    },
    closeTechTree() { this.els.techModal.classList.add('hidden'); },
    onUpgradeTech(id) {
        if (TechTree.upgrade(id)) { this.openTechTree(); this.renderTopBar(); Combat.recalcHero(); }
        else this.toast('🩸 블러드가 부족합니다 (좀비 러시 던전에서 획득)');
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
            return `<div class="pet-card with-icon ${active ? 'active' : ''}" style="--rc:${RARITY_CSS[m.rarity]}">
                <span class="icon-circle">${MOUNT_ICONS[name] || '🐴'}</span>
                <span class="item-name">${MOUNT_KR[name] || name}</span>
                <span class="item-stat">⚔️❤️ +${mountBoosts[m.rarity]}% · ${RARITY_KR[m.rarity]}</span>
                <span class="muted">보유 ${m.count}</span>
                <button class="btn sm ${active ? 'on' : ''}" onclick="UI.onEquipMount('${name}')">${active ? '장착 중' : '장착'}</button>
            </div>`;
        }).join('') : '<span class="muted">보유 마운트 없음 — 소환해보세요!</span>';

        this.els.mountModal.innerHTML = `
            <div class="modal-card wide">
                <h3>🐴 마운트 <small class="muted">⚙️ ${U.fmt(S.winders || 0)}</small></h3>
                <div class="row">
                    <div class="tech-node" style="flex:1">
                        <div class="tech-node-head">
                            <span class="item-name">마운트 레벨</span>
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
        if (!r) { this.toast('⚙️ 와인더가 부족합니다 (스테이지 클리어로 획득)'); return; }
        if (r.isNew) this.toast(`🎉 새 마운트: ${MOUNT_KR[r.name] || r.name} (${RARITY_KR[r.rarity]})`);
        else this.toast(`${MOUNT_KR[r.name] || r.name} 중복 획득 (보유 ${r.count})`);
        this.openMounts(); this.renderTopBar();
    },
    onEquipMount(name) { if (Mounts.equip(name)) this.openMounts(); },

    onToggleSfx() {
        S.sfxOn = !S.sfxOn;
        if (S.sfxOn) { SFX.resume(); SFX.craft(); }
        this.renderMenu();
        saveGame();
    },

    // ---- 승천 ----
    openAscension() {
        Ascension.ensure();
        const ok = Ascension.canAscend();
        const cnt = Ascension.count();
        const nextMult = 1 + (cnt + 1) * Ascension.POWER_PER_ASCEND;
        this.els.ascendModal.innerHTML = `
            <div class="modal-card wide">
                <h3>🌟 승천 <small class="muted">${cnt}회 진행 · 파워 ×${Ascension.powerMult().toFixed(2)}</small></h3>
                <p class="muted">대장간 레벨, 장비, 펫, 스킬, 마운트, 알을 초기화하는 대신
                    영구적으로 공격력·체력이 증가합니다 (승천 시 파워 ×${nextMult.toFixed(2)}).</p>
                <p class="muted">유지: 골드·해머·젬·블러드·티켓·와인더·기술 트리<br>
                    권장 시점: 포지 Lv.${Ascension.RECOMMENDED_FORGE_LEVEL} 이상 (최소 요구: Lv.${Ascension.MIN_FORGE_LEVEL})</p>
                <div class="row">
                    <button class="btn primary ${ok ? '' : 'disabled'}"
                        onclick="if(confirm('정말 승천하시겠습니까? 대장간·장비·펫·스킬·마운트·알이 모두 초기화됩니다.')) UI.onAscend()">
                        ${ok ? `🌟 승천하기 (파워 ×${nextMult.toFixed(2)})` : `🔒 포지 Lv.${Ascension.MIN_FORGE_LEVEL} 필요`}
                    </button>
                </div>
                <button class="btn" onclick="UI.closeAscension()">닫기</button>
            </div>`;
        this.els.ascendModal.classList.remove('hidden');
    },
    closeAscension() { this.els.ascendModal.classList.add('hidden'); },
    onAscend() {
        if (!Ascension.ascend()) { this.toast(`🔒 포지 Lv.${Ascension.MIN_FORGE_LEVEL} 도달 시 승천 가능`); return; }
        this.toast(`🌟 승천 ${Ascension.count()}회! 파워 ×${Ascension.powerMult().toFixed(2)}`);
        this.renderTopBar(); this.updateCp(); this.updateHeroHp(); this.updateStageLabel(); this.renderSkillBar();
        if (this.activeTab === 'forge') this.renderForge();
        if (this.activeTab === 'pets') this.renderPets();
        if (this.activeTab === 'skills') this.renderSkills();
        this.openAscension();
    },

    showOffline(o) {
        this.els.offlineModal.innerHTML = `
            <div class="modal-card">
                <h3>💤 오프라인 보상</h3>
                <p>${U.fmtTime(o.counted)} 동안의 수확${o.elapsed > o.counted ? ' (최대 4시간)' : ''}</p>
                <div class="big-stat">🪙 +${U.fmt(o.coins)} &nbsp; 🔨 +${U.fmt(o.hammers)}</div>
                <button class="btn primary" onclick="document.getElementById('offline-modal').classList.add('hidden')">받기</button>
            </div>`;
        this.els.offlineModal.classList.remove('hidden');
    },

    // ---- 디버그 탭 (출시용 아님, 테스트 전용 — 항상 노출) ----
    // 재화 개편(물약 신설 등) 반영 시 이 목록에 항목 추가할 것
    DEBUG_CURRENCIES: [
        { key: 'hammers', label: '🔨 해머' },
        { key: 'coins', label: '🪙 코인' },
        { key: 'gems', label: '💎 젬' },
        { key: 'tickets', label: '🎫 티켓' },
        { key: 'winders', label: '⚙️ 와인더' },
        { key: 'blood', label: '🩸 블러드' },
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
        this.toast(`+100000 ${key}`);
    },
    onDebugForgeLevelUp() {
        S.forgeLevel = Math.min(35, S.forgeLevel + 1);
        this.renderTopBar(); this.renderDebug();
        if (this.activeTab === 'forge') this.renderForge();
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
        this.updateCp();
        // 대장간 진행바
        if (S.forgeUpgradeEndsAt) {
            const info = Forge.upgradeInfo();
            const fill = document.getElementById('upg-fill');
            const time = document.getElementById('upg-time');
            const skipCost = document.getElementById('upg-skip-cost');
            if (fill && info) {
                const remain = (S.forgeUpgradeEndsAt - U.now()) / 1000;
                fill.style.width = U.clamp(1 - remain / Forge.upgradeTime(info), 0, 1) * 100 + '%';
                if (time) time.textContent = U.fmtTime(remain);
                if (skipCost) skipCost.textContent = Forge.gemSkipCost();
            }
        }
        // 부화 타이머
        S.hatching.forEach((h, i) => {
            const el = document.getElementById('hatch-t-' + i);
            if (el) el.textContent = U.fmtTime((h.endsAt - U.now()) / 1000);
        });
    },
};
