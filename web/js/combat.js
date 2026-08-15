// ===== 전투 엔진: 고정 틱 로직 (렌더링과 분리) =====
const Combat = {
    TICK: 0.1,               // 100ms 고정 틱
    MELEE_X: -0.5,           // 적 근접 정지 위치 (세로 화면에 맞춘 좁은 전장)
    HERO_X: -1.35,

    enemies: [],
    hero: { hp: 1, maxHp: 1, atkTimer: 0, stats: null },
    buffs: [],               // {buff:{atkPct|atkSpd}, until}
    cooldowns: {},           // skillId → 남은 초
    pending: [],             // 지연 실행 큐 [{t, fn}]
    wave: 0,
    phase: 'idle',           // fight | waveDelay | stageDelay
    phaseTimer: 0,
    _enemySeq: 0,

    start() {
        this.recalcHero();
        this.hero.hp = this.hero.maxHp;
        this.setupStage();
    },

    recalcHero() {
        const ratio = this.hero.maxHp > 0 ? this.hero.hp / this.hero.maxHp : 1;
        this.hero.stats = Forge.heroStats();
        this.hero.maxHp = this.hero.stats.hp;
        this.hero.hp = this.hero.maxHp * U.clamp(ratio, 0, 1);
    },

    // ---- 스테이지/웨이브 ----
    monsterBaseHp() {
        if (Dungeons.run) return Dungeons.monsterHp(Dungeons.run.id, Dungeons.run.stage);
        return 55 * Math.pow(5.6, S.chapter - 1) * Math.pow(1.19, S.stage - 1);
    },

    setupStage() {
        this.wave = 0;
        this.enemies = [];
        this.pending = [];
        this.hero.hp = this.hero.maxHp; // 스테이지 시작 시 완전 회복
        UI.hideBossBar();
        Scene3D.clearEnemies();
        if (Dungeons.run) Scene3D.setTheme(Dungeons.def(Dungeons.run.id).theme);
        else Scene3D.setChapterTheme(S.chapter);
        UI.updateStageLabel();
        this.nextWave();
    },

    nextWave() {
        this.wave++;
        const isBossWave = this.wave === 5;
        const baseHp = this.monsterBaseHp() * (1 + 0.08 * (this.wave - 1));
        const count = isBossWave ? 1 : (this.wave <= 2 ? 2 : 3);
        for (let i = 0; i < count; i++) {
            const hp = baseHp * (isBossWave ? 6 : 1);
            const e = {
                id: ++this._enemySeq,
                hp, maxHp: hp,
                atk: hp / (isBossWave ? 9 : 14),
                x: 3.1 + i * 1.2 + U.rand(0, 0.4),
                speed: U.rand(1.0, 1.4),
                atkTimer: U.rand(0.3, 0.9),
                isBoss: isBossWave,
                alive: true,
            };
            this.enemies.push(e);
            Scene3D.spawnEnemy(e);
        }
        this.phase = 'fight';
        if (isBossWave) { Scene3D.bossEntrance(); UI.showBossBar(this.enemies[0]); }
        UI.updateWavePips(this.wave);
    },

    aliveEnemies() { return this.enemies.filter(e => e.alive); },
    frontEnemy() {
        const alive = this.aliveEnemies();
        if (!alive.length) return null;
        return alive.reduce((a, b) => a.x < b.x ? a : b);
    },
    // 단일기 우선 타겟: 보스 > 최전방
    priorityTarget() {
        const boss = this.aliveEnemies().find(e => e.isBoss);
        return boss || this.frontEnemy();
    },

    // ---- 메인 틱 ----
    tick(dt) {
        // 걷기 상태: 전투 중이 아니거나 적이 없으면 행군 (무한맵 스크롤)
        Scene3D.walking = this.phase !== 'fight' || !this.aliveEnemies().length;
        // 지연 큐
        for (let i = this.pending.length - 1; i >= 0; i--) {
            this.pending[i].t -= dt;
            if (this.pending[i].t <= 0) { const fn = this.pending[i].fn; this.pending.splice(i, 1); fn(); }
        }
        // 버프 만료
        const nowMs = U.now();
        const beforeBuffs = this.buffs.length;
        this.buffs = this.buffs.filter(b => b.until > nowMs);
        if (this.buffs.length !== beforeBuffs) this.recalcHero();

        // 액티브 해머 수급 (오프라인과 동일 배율: 분당 1 × 기술트리 배율, 소수점 연속 누적)
        S.hammers += (OFFLINE_HAMMER_PER_MIN / 60) * TechTree.offlineGainMult() * dt;

        // 체력 자연 회복: 기본 1%/s + 서브스탯 '체력 재생' 추가분
        const regenPct = 0.01 + (this.hero.stats ? this.hero.stats.hpRegen / 100 : 0);
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * regenPct * dt);

        if (this.phase === 'waveDelay' || this.phase === 'stageDelay') {
            this.phaseTimer -= dt;
            if (this.phaseTimer <= 0) {
                if (this.phase === 'waveDelay') this.nextWave();
                else this.setupStage();
            }
            return;
        }
        if (this.phase !== 'fight') return;

        // 적 이동/공격
        for (const e of this.aliveEnemies()) {
            if (e.x > this.MELEE_X) {
                e.x -= e.speed * dt;
                if (e.x < this.MELEE_X) e.x = this.MELEE_X;
            } else {
                e.atkTimer -= dt;
                if (e.atkTimer <= 0) {
                    e.atkTimer = 1.7;
                    Scene3D.enemyAttack(e.id);
                    this.pending.push({ t: 0.15, fn: () => this.damageHero(e.atk) });
                }
            }
        }

        // 영웅 자동 공격 (무기 타입별 사거리·타격 시점)
        const st = this.hero.stats;
        this.hero.atkTimer -= dt;
        const target = this.frontEnemy();
        const wt = WEAPON_TYPES[(S.equipment.weapon && S.equipment.weapon.wtype) || 'sword'] || WEAPON_TYPES.sword;
        const atkRange = wt.kind === 'ranged' ? 3.4 : 1.3; // 원거리는 접근 전에 발사, 근접은 붙었을 때
        if (target && target.x < atkRange && this.hero.atkTimer <= 0) {
            this.hero.atkTimer = 1 / st.attacksPerSec;
            const hits = U.chance(st.dblAtk / 100) ? 2 : 1;
            const weaponDmgBonus = 1 + (wt.kind === 'ranged' ? st.rangedDmg : st.meleeDmg) / 100;
            Scene3D.heroAttack(target.id);
            for (let h = 0; h < hits; h++) {
                this.pending.push({ t: wt.impact + h * 0.12, fn: () => {
                    if (!target.alive) return;
                    const crit = U.chance(st.critCh / 100);
                    const dmg = st.atk * U.rand(0.9, 1.1) * (crit ? st.critDmg / 100 + 1 : 1) * weaponDmgBonus;
                    this.damageEnemy(target, dmg, crit, null);
                    if (crit) Scene3D.shake(0.12);
                }});
            }
        }

        // 스킬 자동 발동
        for (const id of S.equippedSkills) {
            if (this.cooldowns[id] === undefined) this.cooldowns[id] = 1 + Math.random() * 2;
            this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
            if (S.autoCast && this.cooldowns[id] <= 0) this.tryCast(id);
        }
        UI.updateSkillBar();
    },

    tryCast(id) {
        if ((this.cooldowns[id] || 0) > 0) return false;
        const d = Skills.def(id);
        const st = this.hero.stats;
        if (d.type === 'heal') {
            if (this.hero.hp / this.hero.maxHp > 0.75) return false; // 낭비 방지
            this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + this.hero.maxHp * Skills.effHeal(id));
            Scene3D.skillEffect('heal', d.color, []);
            UI.skillCutin(d);
            UI.floatTextAtHero(`+${U.fmt(this.hero.maxHp * Skills.effHeal(id))}`, 'heal');
        } else if (d.type === 'buff') {
            this.buffs.push({ buff: d.buff, until: U.now() + d.dur * 1000 });
            this.recalcHero();
            Scene3D.skillEffect('aura', d.color, []);
            UI.skillCutin(d);
        } else {
            const alive = this.aliveEnemies().filter(e => e.x < 3.2);
            if (!alive.length) return false;
            const dmg = Skills.dmg(id) * (1 + st.skillDmg / 100);
            UI.skillCutin(d);
            UI.skillFlash(d.color);
            if (d.type === 'aoe') {
                Scene3D.skillEffect(d.fx, d.color, alive.map(e => e.id));
                Scene3D.shake(0.35);
                for (const e of alive) this.pending.push({ t: 0.25, fn: () => { if (e.alive) this.damageEnemy(e, dmg * U.rand(0.9, 1.1), false, 'skill'); } });
            } else {
                const t = this.priorityTarget();
                if (!t) return false;
                Scene3D.skillEffect(d.fx, d.color, [t.id]);
                Scene3D.shake(0.22);
                this.pending.push({ t: 0.2, fn: () => { if (t.alive) this.damageEnemy(t, dmg, true, 'skill'); } });
            }
        }
        this.cooldowns[id] = d.cd * (1 - st.skillCd / 100); // 서브스탯 '스킬 재사용 대기시간' 감소 반영
        return true;
    },

    damageEnemy(e, dmg, crit, kind) {
        if (!e.alive) return;
        e.hp -= dmg;
        SFX.hit(crit);
        Scene3D.hitEnemy(e.id, dmg, crit, kind);
        // 서브스탯 '생명력 흡수': 영웅이 입힌 피해의 일부를 회복
        const st = this.hero.stats;
        if (st && st.lifesteal) this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + dmg * st.lifesteal / 100);
        if (e.isBoss) UI.updateBossBar(e);
        if (e.hp <= 0) {
            e.alive = false;
            this.onKill(e);
            Scene3D.killEnemy(e.id, e.isBoss);
            if (e.isBoss) { Scene3D.shake(0.5); UI.hideBossBar(); }
            if (!this.aliveEnemies().length) {
                if (this.wave >= 5) this.stageClear();
                else { this.phase = 'waveDelay'; this.phaseTimer = 1.6; } // 행군 구간
            }
        }
    },

    damageHero(dmg) {
        if (this.phase !== 'fight') return;
        const st = this.hero.stats;
        if (st && U.chance(st.block / 100)) { // 서브스탯 '블록 확률': 피해 완전 무효화
            UI.floatTextAtHero('BLOCK', 'block');
            return;
        }
        this.hero.hp -= dmg;
        SFX.hit(false);
        Scene3D.heroHit();
        UI.updateHeroHp();
        if (this.hero.hp <= 0) this.onDefeat();
    },

    // ---- 보상 ----
    onKill(e) {
        S.kills++;
        if (Dungeons.run) return; // 던전은 클리어 시 일괄 보상
        const coins = Math.ceil(3 * Math.pow(1.6, S.chapter - 1) * Math.pow(1.06, S.stage - 1)) * (e.isBoss ? 8 : 1);
        S.coins += coins;
        UI.floatLoot(`🪙 +${U.fmt(coins)}`);
        const hammerAmt = 1 + Math.floor(S.chapter / 3);
        if (e.isBoss) {
            S.hammers += hammerAmt * 8;
            UI.floatLoot(`🔨 +${hammerAmt * 8}`);
        } else if (U.chance(0.35)) {
            S.hammers += hammerAmt;
        }
        // 알 드랍 (원본 확률표로 등급 결정)
        const eggChance = e.isBoss ? 0.35 : 0.03;
        if (U.chance(eggChance)) {
            const rarity = Pets.rollEggRarity(stageKey());
            if (Pets.addEgg(rarity)) {
                UI.floatLoot(`🥚 ${RARITY_KR[rarity]} 알!`);
                UI.renderPets();
            }
        }
    },

    stageClear() {
        if (Dungeons.run) {
            Dungeons.onClear();
            this.phase = 'stageDelay';
            this.phaseTimer = 2.2;
            return;
        }
        const key = stageKey();
        const firstClear = !S.clearedBosses[key];
        if (firstClear) {
            S.clearedBosses[key] = true;
            S.tickets += 15;
            S.winders += 10;
            UI.toast(`🏆 ${key} 첫 클리어! 🎫+15 ⚙️+10`);
        }
        S.tickets += 5;
        S.winders += 3;

        // 무조건 전진
        if (S.stage >= 10) {
            if (S.chapter < 10) { S.chapter++; S.stage = 1; }
        } else S.stage++;
        if (S.chapter * 100 + S.stage > S.bestChapter * 100 + S.bestStage) {
            S.bestChapter = S.chapter; S.bestStage = S.stage;
        }
        saveGame();
        UI.renderTopBar();
        this.phase = 'stageDelay';
        this.phaseTimer = 2.2; // 행군 구간
    },

    onDefeat() {
        Scene3D.heroDown();
        if (Dungeons.run) Dungeons.onFail();
        else UI.toast('💀 쓰러졌다... 회복 후 다시 도전!');
        // 후퇴 없음 — 같은 스테이지 재도전 (무조건 전진)
        saveGame();
        this.hero.hp = this.hero.maxHp;
        this.phase = 'stageDelay';
        this.phaseTimer = 2.0;
    },
};
