// ===== 전투 엔진: 고정 틱 로직 (렌더링과 분리) =====
const Combat = {
    TICK: 0.1,               // 100ms 고정 틱
    MELEE_X: -0.5,           // 적 근접 정지 위치 (세로 화면에 맞춘 좁은 전장)
    HERO_X: -1.35,

    enemies: [],
    hero: { hp: Big.ONE, maxHp: Big.ONE, atkTimer: 0, stats: null }, // hp·maxHp는 Big (승천 배율로 Number 한계를 넘는다)
    buffs: [],               // {buff:{atkPct|atkSpd}, until}
    cooldowns: {},           // skillId → 남은 초
    pending: [],             // 지연 실행 큐 [{t, fn}]
    wave: 0,
    phase: 'idle',           // fight | waveDelay | stageDelay
    phaseTimer: 0,
    // 사망 연출 구간만 벽시계로 잰다 (아래 onDefeat 주석 참고) — 0이면 사망 중이 아님
    downUntil: 0,            // 쓰러진 채 유지할 시각 (ms)
    riseUntil: 0,            // 기상 클립이 끝나는 시각 (ms)
    _enemySeq: 0,

    start() {
        this.recalcHero();
        this.hero.hp = this.hero.maxHp;
        this.setupStage();
    },

    recalcHero() {
        // 비율은 Number로 뽑는다 — 체력이 아무리 커도 비율은 0~1이라 정밀도 문제가 없다
        const ratio = (this.hero.maxHp && !Big.of(this.hero.maxHp).isZero())
            ? Big.of(this.hero.hp).ratioTo(this.hero.maxHp) : 1;
        this.hero.stats = Forge.heroStats();
        this.hero.maxHp = this.hero.stats.hp;
        this.hero.hp = this.hero.maxHp.mul(U.clamp(ratio, 0, 1));
        // "정보" 탭이 열려 있으면 갱신된 전투력 수치도 함께 반영 (renderMenu 자체 activeTab 가드로 안전)
        UI.renderMenu();
    },

    // 종합 전투력 (상단바·PvP 리그 매칭 등에서 공용으로 참조)
    // 종합 전투력 (Big) — 상단바 표시·PvP 매칭 공용
    combatPower() {
        const st = this.hero.stats;
        if (!st) return Big.ZERO;
        return st.atk.mul(st.attacksPerSec * (1 + st.critCh / 100 * st.critDmg / 100)).add(st.hp.div(8));
    },

    // ---- 스테이지/웨이브 ----
    BOSS_HP_MULT: 6,   // 보스 웨이브(5웨이브) HP 배율 — 일반 몹 대비
    BOSS_ATK_DIV: 9,   // 보스 공격력 = HP / 이 값
    MOB_ATK_DIV: 14,   // 일반 몹 공격력 = HP / 이 값

    // 몬스터 기본 HP (Big) — 영웅 스탯이 승천으로 커지면 몬스터도 같은 축에서 비교돼야 한다
    monsterBaseHp() {
        if (Dungeons.run) return Big.of(Dungeons.monsterHp(Dungeons.run.id, Dungeons.run.stage));
        return Big.of(55).mul(Math.pow(5.6, S.chapter - 1)).mul(Big.of(1.19).pow(S.stage - 1));
    },

    // 1장 초반 보스 완화 계수 (2026-08-17 QA 5차 버그)
    // 맨몸 영웅(DPS 23·HP 180)은 1-1 보스(HP 435·공 48)를 절대 못 잡아 무조작 방치 시 진행이 영원히 0이었다.
    // 원본 스펙(web/ref/UI-SPEC.md)에는 튜토리얼·유도 UI 개념 자체가 없으므로 "먼저 제작하라"는 온보딩이
    // 아니라 밸런스 문제로 판정하고, 1장 초반 보스 배율만 완만하게 낮춘다. 1-9에서 1.0으로 복귀하며
    // 2장 이후와 던전은 손대지 않는다. 장비를 한 번이라도 제작하면 전투력이 두 자릿수 배로 뛰어
    // 어느 구간이든 즉사시키므로, 이 완화가 체감되는 건 맨몸 방치 플레이어뿐이다.
    // 실측(맨몸 클리어율): 1-1·1-2 100% → 1-3 45% → 1-4부터 벽. 방치만으로도 2~3칸은 전진한다.
    bossEase() {
        if (Dungeons.run || S.chapter > 1) return 1;
        return Math.min(1, 0.35 + 0.09 * (S.stage - 1));
    },

    setupStage() {
        this.wave = 0;
        this.enemies = [];
        this.pending = [];
        this.hero.hp = this.hero.maxHp; // 스테이지 시작 시 완전 회복
        this.downUntil = 0; this.riseUntil = 0;
        Scene3D.heroRevive(); // 사망 상태로 스테이지가 시작되지 않게(던전 입장 등으로 기상 예약이 지워진 경우 대비)
        SFX.setMusicMode('normal'); // 이전 스테이지가 보스전 도중 중단됐을 경우를 대비한 방어적 리셋
        Scene3D.clearEnemies();
        if (Dungeons.run) Scene3D.setTheme(Dungeons.def(Dungeons.run.id).theme);
        else Scene3D.setChapterTheme(S.chapter);
        UI.updateStageLabel();
        this.nextWave();
    },

    nextWave() {
        this.wave++;
        // 보스 웨이브는 경고 연출을 먼저 돌리고 그게 끝난 뒤에 보스를 내보낸다 (사용자 지시 ③ "연출 후 보스 등장").
        // 연출 구간은 적이 없는 별도 페이즈라 전투 루프는 계속 돌되(버프 만료·재생·지연 큐 정상 동작)
        // 행군만 멈춘다 — 화면이 흐르면 경고 배너가 '지나가는 장식'으로 읽힌다.
        if (this.wave === 5) {
            this.phase = 'bossWarn';
            this.phaseTimer = Scene3D.BOSS_IMPACT; // 배너 전체 길이가 아니라 '착지 임팩트' 시점 — 파동과 보스가 같은 프레임에 나온다
            Scene3D.bossEntrance();
            SFX.setMusicMode('boss'); // 사이렌과 같은 시점에 걸어 다음 코드 경계에서 보스곡으로 갈아탄다
            UI.updateWavePips(this.wave);
            return;
        }
        this.spawnWave();
    },

    spawnWave() {
        const isBossWave = this.wave === 5;
        const baseHp = this.monsterBaseHp().mul(1 + 0.08 * (this.wave - 1));
        const count = isBossWave ? 1 : (this.wave <= 2 ? 2 : 3);
        const bossMult = this.BOSS_HP_MULT * this.bossEase();
        for (let i = 0; i < count; i++) {
            const hp = baseHp.mul(isBossWave ? bossMult : 1);
            const e = {
                id: ++this._enemySeq,
                hp, maxHp: hp,
                atk: hp.div(isBossWave ? this.BOSS_ATK_DIV : this.MOB_ATK_DIV),
                // 일반 몹은 화면 밖(+x)에서 걸어 들어오지만, 보스는 워닝이 지목한 화면 안 자리에 솟는다
                x: isBossWave ? Scene3D.BOSS_SPAWN_X : 3.1 + i * 1.2 + U.rand(0, 0.4),
                speed: U.rand(1.0, 1.4),
                atkTimer: U.rand(0.3, 0.9),
                isBoss: isBossWave,
                alive: true,
            };
            this.enemies.push(e);
            Scene3D.spawnEnemy(e);
        }
        this.phase = 'fight';
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
        // 보스 경고 중에는 행군을 멈춘다 — 연출이 지목한 착지 지점(worldX 기준)이 흘러가면 안 된다
        Scene3D.walking = this.phase !== 'bossWarn' && (this.phase !== 'fight' || !this.aliveEnemies().length);
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

        // 방치형 규칙(사용자 지시 2026-08-17): 접속 중에도 미수집 오프라인 보상이 실시간으로 쌓인다.
        // 그래서 여기서 해머를 따로 지급하지도, lastOfflineClaim을 전진시키지도 않는다 —
        // 전에는 활성 지급 + 기준 시각 전진을 함께 해서 켜둔 동안 누적 게이지가 아예 자라지 않았다.
        // 접속 중 수급은 [수집] 버튼 한 경로로 일원화(이중 지급 방지).

        // 체력 자연 회복: 기본 1%/s + 서브스탯 '체력 재생' 추가분
        const regenPct = 0.01 + (this.hero.stats ? this.hero.stats.hpRegen / 100 : 0);
        this.hero.hp = this.hero.hp.add(this.hero.maxHp.mul(regenPct * dt)).min(this.hero.maxHp);

        if (this.phase === 'waveDelay' || this.phase === 'stageDelay' || this.phase === 'bossWarn') {
            // 쓰러져 누워 있는 동안 — 스테이지 타이머를 세워 둔다 (캐치업 버스트가 연출을 건너뛰지 못하게)
            if (this.downUntil) {
                if (U.now() < this.downUntil) return;
                this.downUntil = 0;
                this.riseUntil = U.now() + 800; // ProChar Revive 클립 길이
                Scene3D.heroRevive();
                return;
            }
            // 일어서는 중 — 기상 클립이 끝나야 다음 스테이지로 넘어간다
            if (this.riseUntil) {
                if (U.now() < this.riseUntil) return;
                this.riseUntil = 0;
            }
            this.phaseTimer -= dt;
            if (this.phaseTimer <= 0) {
                if (this.phase === 'waveDelay') this.nextWave();
                else if (this.phase === 'bossWarn') this.spawnWave(); // 경고가 끝난 그 프레임에 보스가 솟는다
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
                    const dmg = st.atk.mul(U.rand(0.9, 1.1) * (crit ? st.critDmg / 100 + 1 : 1) * weaponDmgBonus);
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

    tryCast(id, manual) {
        if ((this.cooldowns[id] || 0) > 0) return false;
        const d = Skills.def(id);
        const st = this.hero.stats;
        if (d.type === 'heal') {
            if (this.hero.hp.ratioTo(this.hero.maxHp) > 0.75) { if (manual) UI.toast('체력이 충분합니다'); return false; } // 낭비 방지
            const healAmt = this.hero.maxHp.mul(Skills.effHeal(id));
            this.hero.hp = this.hero.hp.add(healAmt).min(this.hero.maxHp);
            Scene3D.skillEffect('heal', d.color, []);
            UI.skillCutin(d);
            UI.floatTextAtHero(`+${U.fmt(healAmt)}`, 'heal');
        } else if (d.type === 'buff') {
            // 같은 스킬의 이전 버프를 먼저 제거 — 재사용 대기시간이 지속시간보다 짧아지면(스킬재사용대기시간 서브스탯) 무한 중첩 방지
            this.buffs = this.buffs.filter(b => b.id !== id);
            this.buffs.push({ id, buff: d.buff, until: U.now() + d.dur * 1000 });
            this.recalcHero();
            Scene3D.skillEffect('aura', d.color, []);
            UI.skillCutin(d);
        } else {
            const alive = this.aliveEnemies().filter(e => e.x < 3.2);
            if (!alive.length) { if (manual) UI.toast('사거리 안에 적이 없습니다'); return false; }
            // 서브스탯 '스킬 피해' + 기술트리 '스킬 피해' 노드 (곱연산)
            const dmg = Skills.dmg(id).mul((1 + st.skillDmg / 100) * TechTree.skillDmgMult());
            UI.skillCutin(d);
            UI.skillFlash(d.color);
            if (d.type === 'aoe') {
                Scene3D.skillEffect(d.fx, d.color, alive.map(e => e.id));
                Scene3D.shake(0.35);
                for (const e of alive) this.pending.push({ t: 0.25, fn: () => { if (e.alive) this.damageEnemy(e, dmg.mul(U.rand(0.9, 1.1)), false, 'skill'); } });
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
        dmg = Big.of(dmg);
        e.hp = e.hp.sub(dmg);
        SFX.hit(crit);
        Scene3D.hitEnemy(e.id, dmg, crit, kind);
        // 서브스탯 '생명력 흡수': 영웅이 입힌 피해의 일부를 회복
        const st = this.hero.stats;
        if (st && st.lifesteal) this.hero.hp = this.hero.hp.add(dmg.mul(st.lifesteal / 100)).min(this.hero.maxHp);
        if (!e.hp.isPos()) {
            e.alive = false;
            this.onKill(e);
            Scene3D.killEnemy(e.id, e.isBoss);
            if (e.isBoss) { Scene3D.shake(0.5); SFX.setMusicMode('normal'); }
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
        this.hero.hp = this.hero.hp.sub(dmg);
        SFX.hit(false);
        // 최대 HP 대비 피해 비중을 넘겨 반동·비네트·바 흔들림 세기를 맞춘다
        Scene3D.heroHit(Big.of(this.hero.maxHp).isZero() ? 0.12 : Big.of(dmg).ratioTo(this.hero.maxHp));
        if (!this.hero.hp.isPos()) this.onDefeat();
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
        // 일반 사냥 알 드랍 없음 — 알 수급은 펫 던전(침공) 보상 화폐 → 펫 화면 [소환] 경로가 유일 (사용자 확정)
    },

    stageClear() {
        if (Dungeons.run) {
            Dungeons.onClear();
            this.phase = 'stageDelay';
            this.phaseTimer = 2.2;
            return;
        }
        const key = stageKey();
        // 알 화폐는 스테이지 클리어에서 지급하지 않음 — 펫 던전(침공) 보상이 유일 수급처 (사용자 확정)
        // 스테이지 클리어 보상은 오직 골드만 (사용자 지시 2026-08-17).
        // 예전엔 첫 클리어 🎫15+⚙️10, 반복 클리어 🎫5+⚙️3을 함께 줬다 — 티켓·태엽은 스테이지에서 일절 지급하지 않는다.
        // 반복 클리어는 처치 코인으로 충분하므로 별도 지급 없음, 첫 클리어만 골드 보너스.
        const firstClear = !S.clearedBosses[key];
        if (firstClear) {
            S.clearedBosses[key] = true;
            const bonus = Math.ceil(60 * Math.pow(1.6, S.chapter - 1) * Math.pow(1.06, S.stage - 1)); // 일반 몹 코인의 ≈20배
            S.coins += bonus;
            UI.toast(`🏆 ${key} 첫 클리어! 🪙+${U.fmt(bonus)}`);
        }

        // 무조건 전진
        if (S.stage >= 10) {
            if (S.chapter < 10) { S.chapter++; S.stage = 1; }
        } else S.stage++;
        if (S.chapter * 100 + S.stage > S.bestChapter * 100 + S.bestStage) {
            S.bestChapter = S.chapter; S.bestStage = S.stage;
            if (!UI.els.passModal.classList.contains('hidden')) UI.renderPass(); // 열려 있는 진행 패스 팝업의 마일스톤 잠금 즉시 갱신
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
        this.hero.hp = this.hero.maxHp; // 머리 위 바는 Scene3D.update가 매 프레임 자체 갱신
        this.phase = 'stageDelay';
        // 사망 클립 1.3초 + 쓰러진 채 머무는 시간 + 기상 0.8초. 2.0초면 쓰러지자마자 다시 서서
        // "죽은 것처럼 안 보인다"는 지적이 그대로 남는다 — 누운 포즈가 확실히 읽힐 만큼 준다.
        this.phaseTimer = 0.8; // 기상까지 끝난 뒤 남는 행군 구간 (연출 길이는 아래 벽시계가 담당)
        // ⚠️ 기상 예약을 pending(=틱 누적)으로 걸면 안 된다. main.js의 로직 루프는 탭 스톨·긴 프레임 뒤
        // Math.min(5000, …) 만큼을 한 번의 인터벌 발화에서 while로 몰아 돌리므로(최대 50틱=5초치),
        // 그 한 번에 쓰러짐→기상→다음 스테이지까지 전부 지나가 사망이 또 안 보인다(실측: 실제 2ms 만에 스테이지 재시작).
        // 그래서 사망 구간만 벽시계로 잰다 — 캐치업이 몇 틱을 몰아 돌리든 실제 시간이 흘러야 일어난다.
        this.downUntil = U.now() + 2400;
        this.riseUntil = 0;
    },
};
