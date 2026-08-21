// ===== 전투 엔진: 고정 틱 로직 (렌더링과 분리) =====
const Combat = {
    TICK: 0.1,               // 100ms 고정 틱
    MELEE_X: -0.5,           // 적 근접 정지 위치 (세로 화면에 맞춘 좁은 전장) — 대열 맨 앞자리
    HERO_X: -1.35,
    // 근접 대열 편성 파라미터 (restackMelee) — 전원이 MELEE_X 한 점에 겹쳐 서던 문제의 해법.
    // 세로 9:16 전장은 가로로 쓸 수 있는 폭이 약 2.7유닛뿐인데 몸폭은 1.0~1.6유닛이라
    // "몸폭만큼 전부 벌리기"는 세 번째 적을 화면 밖으로 밀어낸다. 그래서 가로(x)로는
    // 몸폭의 일부만 벌리고(PACK) 나머지 분리는 깊이(z) 레인이 맡는다 — 카메라가 내려다보므로
    // z가 다르면 화면에서 위아래로 갈리고 원근 크기까지 달라져 개체가 앞뒤로 읽힌다.
    MELEE_PACK: 0.62,        // 이웃한 두 적의 (반폭+반폭) 중 x로 벌릴 비율
    MELEE_GAP: 0.2,          // 그 위에 얹는 고정 여유 (유닛)
    MELEE_LANE_Z: [0, 0.95, -0.9], // 슬롯별 깊이 레인 — 앞줄 / 카메라 쪽 / 안쪽

    // ── 사망 연출 벽시계 (death-enemy-remnant, 2026-08-20) ──────────────────────────
    // 🚨 **불변식**: DOWN + RISE + MARCH*1000 ≤ Scene3D.DEATH_FADE 의 `delay+fadeIn+hold`(=암전이
    //    다시 걷히기 시작하는 시점). 그래야 `setupStage`(옛 적 정리 + 새 스테이지 구성)가 **암전
    //    안에서** 끝나 리빌 첫 프레임이 이미 새 스테이지다. 이 합을 늘릴 땐 `hold` 도 같이 늘릴 것.
    //    (수정 전: 2400+850+800=4050ms 인데 암전은 3400ms 에 걷히기 시작 → 650ms+ 동안 직전
    //     스테이지 적이 그대로 보였다. 실측 `tools/probe-death-remnant.js`.)
    // 왜 DOWN 을 2400→1600 으로 줄여도 되나: 커버는 1600ms 에 **완전 불투명**이 된다. 옛 2400 중
    // 뒤 800ms 는 어차피 순검은 화면 뒤였다 — 눈에 보이는 사망 읽기(쓰러짐 클립 1.3s + 누운 채
    // 0.3s)는 한 프레임도 안 줄었다. 줄어든 건 아무도 못 보던 대기 시간뿐이다.
    DEATH_DOWN_MS: 1600,     // 쓰러져 누워 있는 구간 (커버가 완전히 닫히는 시점과 같다)
    DEATH_RISE_MS: 850,      // ProChar Revive 클립 길이(dur 0.85s)
    DEATH_MARCH_S: 0.4,      // 기상 뒤 한 박자 — 이 뒤에 setupStage

    enemies: [],
    hero: { hp: Big.ONE, maxHp: Big.ONE, atkTimer: 0, stats: null }, // hp·maxHp는 Big (승천 배율로 Number 한계를 넘는다)
    // 스킬 버프는 **HP 회복·공격력 업 둘뿐**이다 (사용자 지시 2026-08-19 buff-redesign-heal-atk-fixed).
    // 공속(atkSpd) 버프는 폐기됐다 — 장비 서브스탯 atkSpd 는 별개 시스템이라 그대로 살아 있다.
    buffs: [],               // 공격력 버프: {id, buff:{atkFlat: Big}, until} — 고정 가산이라 % 가 아니다
    hots: [],                // 지속 회복: {id, per: Big(초당), remain: Big(남은 총량), until, acc: Big, accT} — 흘려 넣는다
    cooldowns: {},           // skillId → 남은 초

    // 스킬 쿨 전체 리셋 — 스테이지 전환마다 setupStage 가 부른다 (skill-cd-tick-and-reset ②).
    // 값은 첫 진입과 같은 1~3초 스태거: 0으로 두면 전환 직후 장착 스킬이 전탄 동시 발사된다.
    resetCooldowns() {
        this.cooldowns = {};
        for (const id of S.equippedSkills) this.cooldowns[id] = 1 + Math.random() * 2;
    },
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
        // 챕터 축은 난이도 티어를 편 '절대 챕터'다 — 헬 1-1(=절대 76챕터)이 매우어려움 25-10보다 확실히 세다.
        // 티어가 올라도 커브가 끊기지 않으므로 티어별 별도 배율 테이블이 필요 없다 (chapter-cycle-difficulty).
        return Big.of(55).mul(Math.pow(5.6, curAbsChapter() - 1)).mul(Big.of(1.19).pow(S.stage - 1));
    },

    // 1장 초반 보스 완화 계수 (2026-08-17 QA 5차 버그)
    // 맨몸 영웅(DPS 23·HP 180)은 1-1 보스(HP 435·공 48)를 절대 못 잡아 무조작 방치 시 진행이 영원히 0이었다.
    // 원본 스펙(web/ref/UI-SPEC.md)에는 튜토리얼·유도 UI 개념 자체가 없으므로 "먼저 제작하라"는 온보딩이
    // 아니라 밸런스 문제로 판정하고, 1장 초반 보스 배율만 완만하게 낮춘다. 1-9에서 1.0으로 복귀하며
    // 2장 이후와 던전은 손대지 않는다. 장비를 한 번이라도 제작하면 전투력이 두 자릿수 배로 뛰어
    // 어느 구간이든 즉사시키므로, 이 완화가 체감되는 건 맨몸 방치 플레이어뿐이다.
    // 실측(맨몸 클리어율): 1-1·1-2 100% → 1-3 45% → 1-4부터 벽. 방치만으로도 2~3칸은 전진한다.
    bossEase() {
        // 완화는 '게임을 막 시작한 맨몸 영웅' 전용이라 기본 순환 1장에서만 걸린다 —
        // 어려움 1-1(절대 26챕터)은 이미 장비를 갖춘 뒤라 완화 대상이 아니다.
        if (Dungeons.run || curAbsChapter() > 1) return 1;
        return Math.min(1, 0.35 + 0.09 * (S.stage - 1));
    },

    // 스테이지 한 판의 총 웨이브 수 — 마지막 웨이브가 보스다.
    // 메인 스테이지는 예전 그대로 5, **던전만 1~3**(사용자 지시 2026-08-18 "던전은 웨이브 수 1~3개로 해줘").
    // 던전 값은 입장 시 Dungeons.enter가 run.waves에 굳혀 둔다 — 여기서 매번 뽑으면 같은 판에서
    // 총수가 프레임마다 바뀌어 pip 개수와 클리어 판정이 서로 어긋난다.
    MAIN_WAVES: 5,
    totalWaves() {
        if (Dungeons.run) return Dungeons.run.waves || Dungeons.DEFAULT_WAVES;
        return this.MAIN_WAVES;
    },

    setupStage() {
        this.wave = 0;
        this.enemies = [];
        this.pending = [];
        // 스테이지 전환 시 스킬 쿨 초기화 (skill-cd-tick-and-reset ②, 사용자 지시 2026-08-19) —
        // ⓐ 보스 클리어 후 다음 스테이지 ⓑ 던전 입장(Dungeons.enter → setupStage) ⓒ 사망 후퇴가
        // 전부 여기를 지난다. '초기화' = 0(즉시 전탄 발사)이 아니라 첫 진입과 같은 1~3초 스태거 —
        // 스테이지가 열리자마자 스킬이 한꺼번에 쏟아지지 않게(기존 undefined 초기화와 같은 분포).
        this.resetCooldowns();
        this.hero.hp = this.hero.maxHp; // 스테이지 시작 시 완전 회복
        this.downUntil = 0; this.riseUntil = 0;
        Scene3D.heroRevive(); // 사망 상태로 스테이지가 시작되지 않게(던전 입장 등으로 기상 예약이 지워진 경우 대비)
        SFX.setMusicMode(Dungeons.run ? 'dungeon' : 'normal'); // 화면별 곡 분화(audio-quality-up) + 보스전 중단 대비 방어적 리셋
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
        if (this.wave === this.totalWaves()) {
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
        const isBossWave = this.wave === this.totalWaves();
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
        this.restackMelee(); // 메시가 다 만들어진 뒤라 몸폭을 실측해 자리를 나눌 수 있다
        this.phase = 'fight';
        UI.updateWavePips(this.wave);
    },

    // 근접 대열 편성 — 앞선 순서대로 각자의 정지 자리(stopX)와 깊이 레인(z)을 나눠 준다.
    // 예전에는 전원이 MELEE_X 한 점으로 클램프돼 몸이 서로 관통하고 머리 위 HP바가 화면에서
    // 통째로 포개졌다(QA 12차 실측: 몸 간격 0.000유닛, 바 겹침 46.8px = 바 폭 47px과 같음).
    // ⚠️ 공격은 각자 제 자리에서 그대로 한다 — "한 점에 붙어야만 때린다"로 바꾸면 뒷줄이 놀아
    //    영웅이 받는 피해가 1/3로 줄고 밸런스가 통째로 달라진다. 자리만 벌리고 판정은 그대로다.
    // 매 틱이 아니라 **구성이 바뀔 때만**(스폰·처치) 부른다. 매 틱 재정렬하면 걸어오는 도중
    // 속도 차로 순위가 엎치락뒤치락해 목적지가 떨려 보인다.
    restackMelee() {
        const alive = this.aliveEnemies();
        const q = alive.filter(e => !e.isBoss).sort((a, b) => a.x - b.x);
        let edge = this.MELEE_X;   // 앞 적의 뒷면 — 첫 적은 정지선 그 자체에서 시작한다
        for (let i = 0; i < q.length; i++) {
            const e = q[i];
            const hw = Scene3D.enemyHalfW(e.id);
            e.stopX = i === 0 ? this.MELEE_X : edge + hw * this.MELEE_PACK;
            edge = e.stopX + hw * this.MELEE_PACK + this.MELEE_GAP;
            e.z = this.MELEE_LANE_Z[i % this.MELEE_LANE_Z.length];
        }
        // 보스는 혼자 나오므로 대열이 없다 — 늘 정면 한가운데
        for (const e of alive) if (e.isBoss) { e.stopX = this.MELEE_X; e.z = 0; }
    },

    // 적의 정지 자리 — 대열이 아직 안 짜였으면(구버전 세이브·던전 진입 프레임) 예전 한 점으로 폴백
    stopXOf(e) { return e.stopX === undefined ? this.MELEE_X : e.stopX; },

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
        // 보스 경고 중에는 행군을 멈춘다 — 연출이 지목한 착지 지점(worldX 기준)이 흘러가면 안 된다.
        // 던전 클리어 팝업 대기 중에도 멈춘다 — 팝업 뒤에서 영웅이 하염없이 행군하면 '클리어하고 서 있다'로 안 읽힌다.
        Scene3D.walking = this.phase !== 'bossWarn' && this.phase !== 'dungeonClear' && (this.phase !== 'fight' || !this.aliveEnemies().length);
        // 지연 큐
        // ⚠️ 콜백이 큐를 **통째로 비울 수 있다** — 지연 피해(`damageHero`)가 그 자리에서 `onDefeat`
        //    를 부르고, 사망/던전 이탈은 `this.pending = []` 로 남은 예약을 버린다(사라진 적을
        //    겨냥한 뒤늦은 타격 연출 방지). 그러면 이 역순 루프의 남은 인덱스는 새 빈 배열을
        //    가리켜 `undefined.t` 로 터진다(적이 둘 이상일 때만 나서 오래 숨어 있던 경로다).
        //    엔트리를 매번 다시 집어 없으면 그대로 끝낸다 — 버려진 예약을 되살리지 않는 게 의도다.
        for (let i = this.pending.length - 1; i >= 0; i--) {
            const p = this.pending[i];
            if (!p) continue;
            p.t -= dt;
            if (p.t <= 0) { this.pending.splice(i, 1); p.fn(); }
        }
        // 버프 만료
        const nowMs = U.now();
        const beforeBuffs = this.buffs.length;
        this.buffs = this.buffs.filter(b => b.until > nowMs);
        if (this.buffs.length !== beforeBuffs) this.recalcHero();

        // 지속 회복(HoT) — 회복 스킬은 일시불이 아니라 dur 초에 걸쳐 흘러든다 (buff-redesign-heal-atk-fixed).
        // 회복량은 고정값이라 maxHp 를 안 보지만, 최대치 상한만은 지킨다.
        for (let i = this.hots.length - 1; i >= 0; i--) {
            const h = this.hots[i];
            const done = h.until <= nowMs;
            // 🚨 만료 틱에는 **남은 몫을 통째로** 넣는다. 탭이 멈췄다 풀리면 main.js의 로직 루프가 밀린 틱을
            //    한 발화에서 while로 몰아 도는데(캐치업), 그 구간 동안 U.now()는 얼어 있어 모든 틱이 이미
            //    만료 시각을 지난 상태로 들어온다. 이때 '한 틱치'만 넣고 지우면 **회복량 대부분이 증발한다**
            //    (헤드리스 실측: 5초짜리 회복이 0.1초치만 들어가고 사라졌다). 총량 보장은 고정값 사양의 일부다.
            const amt = done ? h.remain : h.per.mul(dt).min(h.remain);
            h.remain = h.remain.sub(amt);
            const before = this.hero.hp;
            this.hero.hp = this.hero.hp.add(amt).min(this.hero.maxHp);
            h.acc = h.acc.add(this.hero.hp.sub(before)); // 만피에 걸려 안 들어간 몫은 숫자로도 안 띄운다
            h.accT += dt;
            // 틱마다(0.1초) 숫자를 띄우면 초당 10개가 쏟아진다 — 0.5초로 뭉쳐서 한 줄씩
            if (done || h.accT >= 0.5) {
                if (h.acc.isPos()) UI.floatTextAtHero(`+${U.fmt(h.acc)}`, 'heal');
                h.acc = Big.ZERO; h.accT = 0;
            }
            if (done) this.hots.splice(i, 1);
        }

        // 방치형 규칙(사용자 지시 2026-08-17): 접속 중에도 미수집 오프라인 보상이 실시간으로 쌓인다.
        // 그래서 여기서 해머를 따로 지급하지도, lastOfflineClaim을 전진시키지도 않는다 —
        // 전에는 활성 지급 + 기준 시각 전진을 함께 해서 켜둔 동안 누적 게이지가 아예 자라지 않았다.
        // 접속 중 수급은 [수집] 버튼 한 경로로 일원화(이중 지급 방지).

        // 체력 자연 회복: 기본 1%/s + 서브스탯 '체력 재생' 추가분
        const regenPct = 0.01 + (this.hero.stats ? this.hero.stats.hpRegen / 100 : 0);
        this.hero.hp = this.hero.hp.add(this.hero.maxHp.mul(regenPct * dt)).min(this.hero.maxHp);

        // 스킬 쿨타임 감소 — **전투 중이 아니어도 흐른다** (skill-cd-tick-and-reset ①, 사용자 지시
        // 2026-08-19: "전투 중 아닐 때는 스킬 쿨타임 안 흐르는 거 같은데 그거 흐르게"). 예전엔 이 루프가
        // 아래 fight 게이트 안에 있어 웨이브 딜레이·스테이지 이동·보스 워닝 동안 쿨이 얼어붙었다.
        // 자동 발동(autoCast)은 여전히 fight 블록에서만 — 적 없는 허공에 쏘지 않게 감소와 발동을 갈랐다.
        for (const id of S.equippedSkills) {
            if (this.cooldowns[id] === undefined) this.cooldowns[id] = 1 + Math.random() * 2;
            this.cooldowns[id] = Math.max(0, this.cooldowns[id] - dt);
        }
        UI.updateSkillBar(); // 쿨이 전 페이즈에서 흐르니 바 표시도 전 페이즈에서 따라 돈다

        if (this.phase === 'waveDelay' || this.phase === 'stageDelay' || this.phase === 'bossWarn') {
            // 쓰러져 누워 있는 동안 — 스테이지 타이머를 세워 둔다 (캐치업 버스트가 연출을 건너뛰지 못하게)
            if (this.downUntil) {
                if (U.now() < this.downUntil) return;
                this.downUntil = 0;
                this.riseUntil = U.now() + this.DEATH_RISE_MS;
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
            const stop = this.stopXOf(e);
            if (e.x > stop) {
                e.x -= e.speed * dt;
                if (e.x < stop) e.x = stop;
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

        // 스킬 자동 발동 — 쿨 감소는 위 공통 구간(전 페이즈)에서 이미 했다 (skill-cd-tick-and-reset ①)
        if (S.autoCast) for (const id of S.equippedSkills) {
            if (this.cooldowns[id] <= 0) this.tryCast(id);
        }
    },

    tryCast(id, manual) {
        if ((this.cooldowns[id] || 0) > 0) return false;
        const d = Skills.def(id);
        const st = this.hero.stats;
        if (d.type === 'heal') {
            // ⚠️ '체력이 충분하면 안 씀' 게이트는 폐기됐다 (사용자 지시 2026-08-19: "피가 깎여있어야 발동되는 거
            //    말고 그냥 쿨타임 풀리면 써지게"). 되살리지 말 것 — 되살리면 만피에서 회복 스킬이 영영 안 돈다.
            // 회복은 즉시 일시불이 아니라 dur 초에 걸쳐 흘려 넣는다(HoT). 총량은 maxHp 비율이 아니라 고정량.
            const total = Skills.healAmt(id);
            const dur = d.dur || 1;
            this.hots = this.hots.filter(h => h.id !== id); // 같은 스킬 재시전은 갱신(중첩 금지) — 버프와 같은 규약
            this.hots.push({ id, per: total.div(dur), remain: total, until: U.now() + dur * 1000, acc: Big.ZERO, accT: 0 });
            // 🚨 여기는 여태 리터럴 'heal' 을 넘겼다 — 그래서 지원계의 `fx` 필드가 **죽은 값**이었다
            //    (성역은 fx:'aura' 인데 type:'heal' 이라 화면에 빛기둥이 떴다). d.fx 를 쓴다.
            Scene3D.skillEffect(d.fx || 'heal', d.color, [], d);
            UI.skillCutin(d);
        } else if (d.type === 'buff') {
            // 같은 스킬의 이전 버프를 먼저 제거 — 재사용 대기시간이 지속시간보다 짧아지면(스킬재사용대기시간 서브스탯) 무한 중첩 방지
            this.buffs = this.buffs.filter(b => b.id !== id);
            // 가산량은 **시전 시점에 굳힌다** — 정의(SKILL_DEFS)에는 % 가 없고, 레벨·승천이 걸린 Big 값이라
            // 버프가 살아 있는 동안 heroStats 가 매번 다시 계산하지 않게 여기서 한 번만 뽑는다.
            this.buffs.push({ id, buff: { atkFlat: Skills.buffAtk(id) }, until: U.now() + d.dur * 1000 });
            this.recalcHero();
            Scene3D.skillEffect(d.fx || 'aura', d.color, [], d);   // 위와 같은 이유 — 리터럴 금지
            UI.skillCutin(d);
        } else {
            const alive = this.aliveEnemies().filter(e => e.x < 3.2);
            if (!alive.length) { if (manual) UI.toast('사거리 안에 적이 없습니다'); return false; }
            // 서브스탯 '스킬 피해' + 기술트리 '스킬 피해' 노드 (곱연산)
            const dmg = Skills.dmg(id).mul((1 + st.skillDmg / 100) * TechTree.skillDmgMult());
            UI.skillCutin(d);
            UI.skillFlash(d.color);
            // 🚩 착탄 시점 = 스킬별 `impactAt`(초). 오브젝트가 화면 밖에서 오래 날아오는 연출
            //    (표창·화살 비행 1.3~1.5s, 지렁이 물기 1.3s)은 피해가 **오브젝트가 실제로 닿는 순간**
            //    들어와야 한다 — 안 그러면 적이 맞기 1초 전에 피가 깎여 인과가 깨진다. 안 주면 종전값.
            if (d.type === 'aoe') {
                Scene3D.skillEffect(d.fx, d.color, alive.map(e => e.id), d); // d 를 넘겨 등급 위계를 연출에 태운다
                const impT = d.impactAt || 0.25;
                // 셰이크는 **시전이 아니라 타격 순간**에 울린다(2박). 예전엔 cast 시각에 shake(0.35)를
                // 즉시 울려, 피해가 들어오는 3박보다 한참 앞서 카메라가 흔들렸다 — '버튼을 누르니 화면이
                // 흔들린다'로 읽혀 타격과 분리됐다(비평가 항목 ㉯). 피해 pending 과 같은 시각에 한 번만 운다.
                this.pending.push({ t: impT, fn: () => Scene3D.shake(0.35) });
                for (const e of alive) this.pending.push({ t: impT, fn: () => { if (e.alive) this.damageEnemy(e, dmg.mul(U.rand(0.9, 1.1)), false, 'skill'); } });
            } else {
                const t = this.priorityTarget();
                if (!t) return false;
                Scene3D.skillEffect(d.fx, d.color, [t.id], d); // d 를 넘겨 등급 위계를 연출에 태운다
                const impT = d.impactAt || 0.2;
                // 셰이크를 타격 pending 안으로 — 대상이 그 사이 죽어도(t.alive=false) 스킬은 그 자리를
                // 때린 것이므로 셰이크는 울린다(피해만 산 적에 조건부로 넣는다).
                this.pending.push({ t: impT, fn: () => { Scene3D.shake(0.22); if (t.alive) this.damageEnemy(t, dmg, true, 'skill'); } });
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
        // 이 한 방이 처치타인지는 **여기서 이미 안다**(hp 를 깎은 뒤라 부호가 확정됐고, 아래 처치 분기와
        // 같은 조건이다). 숫자 위계 3티어의 최상단을 세우려면 연출 쪽이 그걸 알아야 한다.
        const kill = !e.hp.isPos();
        Scene3D.hitEnemy(e.id, dmg, crit, kind, kill);
        // 서브스탯 '생명력 흡수': 영웅이 입힌 피해의 일부를 회복
        const st = this.hero.stats;
        if (st && st.lifesteal) this.hero.hp = this.hero.hp.add(dmg.mul(st.lifesteal / 100)).min(this.hero.maxHp);
        if (kill) {
            e.alive = false;
            this.onKill(e);
            Scene3D.killEnemy(e.id, e.isBoss);
            this.restackMelee(); // 남은 적이 빈 앞자리로 한 칸 당겨 선다 — 줄이 끊긴 채 남지 않게
            if (e.isBoss) { Scene3D.shake(0.5); SFX.setMusicMode(Dungeons.run ? 'dungeon' : 'normal'); } // 던전 보스 처치 후엔 던전곡으로 복귀
            if (!this.aliveEnemies().length) {
                if (this.wave >= this.totalWaves()) this.stageClear();
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
        // dmg도 함께 넘긴다 — 영웅 머리 위에 붉은 피해 숫자를 띄워 "얼마나 맞았는지"가 바 길이 말고도 읽히게
        Scene3D.heroHit(Big.of(this.hero.maxHp).isZero() ? 0.12 : Big.of(dmg).ratioTo(this.hero.maxHp), dmg);
        if (!this.hero.hp.isPos()) this.onDefeat();
    },

    // ---- 보상 ----
    onKill(e) {
        S.kills++;
        if (Dungeons.run) return; // 던전은 클리어 시 일괄 보상
        const ac = curAbsChapter(); // 난이도 티어를 편 절대 챕터 — 보상도 적 스펙과 같은 축에서 오른다
        const coins = Math.ceil(3 * Math.pow(1.6, ac - 1) * Math.pow(1.06, S.stage - 1)) * (e.isBoss ? 8 : 1);
        S.coins += coins;
        UI.floatLoot(`🪙 +${U.fmt(coins)}`);
        const hammerAmt = 1 + Math.floor(ac / 3);
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
            // 클리어 → 보상 팝업(Dungeons.onClear가 띄운다) → [보상 수령] 클릭 → 수령 연출 →
            // finishDungeonClear()가 본대 복귀를 마저 돈다 (dungeon-clear-reward-popup, 사용자 지시).
            // 예전의 stageDelay 2.2초 자동 진행은 팝업을 읽기도 전에 화면을 본대로 넘겨 버린다 —
            // 'dungeonClear' 페이즈는 타이머가 없어 팝업을 닫을 때까지 전투 루프가 조용히 대기한다.
            Dungeons.onClear();
            this.phase = 'dungeonClear';
            this.phaseTimer = 0;
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
            const bonus = Math.ceil(60 * Math.pow(1.6, curAbsChapter() - 1) * Math.pow(1.06, S.stage - 1)); // 일반 몹 코인의 ≈20배
            S.coins += bonus;
            // 스테이지에서 벌어진 일이라 'combat' 레인 — 팝업이 떠 있으면 그 아래로 깔린다
            // 키가 아니라 화면에 찍히는 라벨로 알린다(티어가 붙으면 키는 "d1:3-5" 꼴이라 사람이 읽을 문자열이 아니다)
            UI.toast(`🏆 ${stageName()} 첫 클리어! 🪙+${U.fmt(bonus)}`, 'combat');
        }

        // 무조건 전진. 사이클 끝(25-10)에서는 난이도 티어를 올리고 1-1로 되감는다 (chapter-cycle-difficulty).
        let tierUp = false;
        if (S.stage >= STAGES_PER_CHAPTER) {
            // 챕터 상한 = 맵 종류 수(main-stage-25-maps). CHAPTERS_PER_CYCLE 가 CHAPTER_THEMES.length 를
            // 그대로 받으므로 맵을 더 늘려도 두 값이 갈라지지 않는다 — 상한이 맵 수보다 작으면 그 위 챕터의
            // 맵을 게임에서 영영 못 보고, 크면 없는 테마를 (chapter-1)%len 으로 되풀이하게 된다.
            if (S.chapter < CHAPTERS_PER_CYCLE) { S.chapter++; S.stage = 1; }
            else if (S.difficulty < MAX_DIFFICULTY) { S.difficulty++; S.chapter = 1; S.stage = 1; tierUp = true; }
            // 헬 25-10이 종점 — 갈 곳이 없으면 그 스테이지를 계속 반복한다(옛 10-10 상한과 같은 규약)
        } else S.stage++;
        if (tierUp) {
            // 배경이 1챕터 맵으로 되감기는 순간을 설명 없이 넘기면 "왜 처음으로 돌아갔지"로 읽힌다
            UI.toast(`🔥 난이도 상승! ${stageName()}부터 다시 도전합니다`, 'combat');
        }
        if (curRank() > bestRank()) {
            S.bestDifficulty = S.difficulty; S.bestChapter = S.chapter; S.bestStage = S.stage;
            if (!UI.els.passModal.classList.contains('hidden')) UI.renderPass(); // 열려 있는 진행 패스 팝업의 마일스톤 잠금 즉시 갱신
        }
        saveGame();
        UI.renderTopBar();
        this.phase = 'stageDelay';
        this.phaseTimer = 2.2; // 행군 구간
    },

    // 던전에서 튕겨 나온 순간 = 본대 복귀 순간. 실패 토스트가 "본대로 복귀합니다"라고 말하는
    // 바로 그 프레임에 화면도 본대로 돌려놓는다.
    // 왜 필요했나(2026-08-18 QA 17차): Dungeons.onFail()은 run=null + 토스트 + 저장만 했고,
    // 라벨·3D 테마·던전 몹은 사망 연출이 다 끝난 setupStage 시점(당시 다운 2.4s + 기상 0.85s +
    // phaseTimer 0.8s — 지금은 DEATH_* 상수)에야 정리됐다. 실측 4.5~6.2초 동안 "본대로 복귀합니다" 토스트 아래로
    // 던전 이름 라벨 + 던전 하늘 + 나를 죽인 던전 몹이 그대로 서 있었다.
    // ⚠️ 라벨만 당기면 안 된다 — 그러면 4초 동안 '본대 라벨 + 던전 배경'으로 어긋나기만 한다.
    //    라벨·배경·몹·음악은 전부 같은 프레임에 넘어가야 한판이 끝난 것으로 읽힌다.
    //    (일반 사망 분기가 쓰러진 순간 바로 라벨을 갱신하는 것과 같은 처리 — TODO 660~661번.)
    // 호출 시점 전제: Dungeons.run 은 이미 null 이어야 한다(그래야 라벨·테마가 본대를 가리킨다).
    leaveDungeon() {
        this.enemies = []; // 던전 몹은 두고 나왔다 — 논리에서도 같이 지운다
        this.pending = []; // 그 몹들을 겨냥한 지연 큐도 함께(사라진 대상에 대한 뒤늦은 타격 연출 방지)
        Scene3D.clearEnemies();
        SFX.setMusicMode('normal'); // 보스 웨이브에서 죽었어도 본대 배경에 보스곡이 남지 않게
        // 배경·라벨·pip은 한 프레임에 갈린다 — 그 하드 컷을 sceneCut의 검은 커버가 덮는다
        // (setTheme은 하늘·안개·지면·능선·식생·조명을 즉시 갈아끼우고 바이옴이 다르면 buildProps까지 돈다).
        // ⚠️ 커버는 순수 장식이고 상태 변경은 sceneCut이 **동기로 즉시** 돌린다 — 연출 타이머에 실으면
        //    백그라운드 탭에서 렌더 루프가 멈춘 동안 복귀가 통째로 밀려 이 결함이 그대로 되살아난다.
        // pip을 0으로 리셋하는 이유: 본대는 5웨이브, 던전은 1~3이라 **개수부터** 다르다. 그냥 두면
        // 본대 배경에 던전 pip 줄(1~3칸)이 남고, 던전에서 죽은 웨이브 번호를 5칸 줄에 옮겨 찍으면
        // "5중 2웨이브"라는 없던 정보가 된다. 다음 웨이브 표시는 setupStage→nextWave가 찍는다.
        const toCamp = () => { Scene3D.setChapterTheme(S.chapter); UI.updateStageLabel(); UI.updateWavePips(0); };
        if (Scene3D.scene) Scene3D.sceneCut(toCamp);
        else toCamp();
    },

    // 던전 클리어 팝업의 [보상 수령] 연출이 끝난 뒤 본대 복귀의 나머지 절반 (dungeon-clear-reward-popup).
    // 실패 경로(onDefeat)와 같은 규약 — leaveDungeon의 sceneCut 한 컷에 배경·라벨·pip이 같이 넘어간다.
    // 호출 시점 전제: Dungeons.run은 이미 null (onClear가 비웠다).
    finishDungeonClear() {
        if (this.phase !== 'dungeonClear') return; // 팝업 더블클릭 등 뒤늦은/중복 호출 가드
        this.leaveDungeon();
        this.phase = 'stageDelay';
        this.phaseTimer = 0.8; // 행군 한 박자 뒤 setupStage → 본대 스테이지 재시작
    },

    onDefeat() {
        Scene3D.heroDown();
        if (Dungeons.run) {
            Dungeons.onFail(); // 던전 실패는 후퇴 대상이 아니다 — 던전은 자체 단계를 쓴다
            this.leaveDungeon();
            // 던전 사망에도 같은 사망 연출을 태운다(문구만 다름 — '스테이지 이동'이 아니라 본대 복귀).
            // leaveDungeon의 sceneCut(420ms 하드컷 커버)이 배경 전환을 이미 가렸고, 그 뒤 암전이 온다.
            Scene3D.deathFade('본대로 복귀합니다');
        } else {
            // 사망 시 1스테이지 후퇴 (사용자 지시 2026-08-17). 챕터는 절대 안 깎인다 —
            // 하한은 그 챕터의 X-1이라 3-1에서 죽어도 2-10으로 넘어가지 않는다.
            // 최고 기록(bestChapter/bestStage)은 후퇴로 깎이지 않는다 — 진행 패스 마일스톤이 되감기면 안 된다.
            const back = S.stage > 1;
            if (back) S.stage--;
            // 사망 연출: 암전 + 중앙 배너 (death-fade-popup, 사용자 지시 2026-08-18 — "토스트가 아니라
            // 눈에 확 띄는 알림"). 연출을 못 띄우는 환경(fxLayer 부재·WAAPI 미지원)에서만 옛 토스트로 강등
            // — 그 토스트는 사용자가 이름 대 이름으로 지목했던 알림이라 'combat' 레인(팝업 위 금지)을 지킨다.
            if (!Scene3D.deathFade(back ? `${stageName()} 스테이지로 이동합니다` : '회복 후 다시 도전합니다'))
                UI.toast(back ? `💀 쓰러졌다... ${stageName()}로 한 스테이지 후퇴!` : '💀 쓰러졌다... 회복 후 다시 도전!', 'combat');
            // 나를 죽인 적은 암전이 닫히는 동안 녹여 없앤다 (death-enemy-remnant) — 정리를
            // setupStage 까지 미루면 암전이 걷힌 화면에 직전 스테이지 적이 그대로 서 있다.
            // 논리 쪽도 같은 프레임에 비운다(던전 실패의 leaveDungeon 과 같은 규약): 지연 큐를
            // 안 비우면 이미 지운 적을 겨냥한 뒤늦은 타격 연출이 빈 자리에서 터진다.
            this.enemies = [];
            this.pending = [];
            Scene3D.deathWipeEnemies();
            UI.renderTopBar();
            UI.updateStageLabel(); // 쓰러져 있는 동안(DEATH_DOWN_MS) 라벨이 옛 스테이지를 가리키지 않게(setupStage 전에 먼저 갱신)
        }
        saveGame();
        this.hero.hp = this.hero.maxHp; // 머리 위 바는 Scene3D.update가 매 프레임 자체 갱신
        this.phase = 'stageDelay';
        // 사망 클립 1.3초 + 쓰러진 채 머무는 시간 + 기상 0.85초. 쓰러지자마자 다시 서면
        // "죽은 것처럼 안 보인다"는 지적이 그대로 남는다 — 누운 포즈가 확실히 읽힐 만큼 준다.
        // 구간 길이는 위 DEATH_* 상수에 모아 뒀다(암전 안에서 끝나야 하는 불변식이 거기 붙어 있다).
        this.phaseTimer = this.DEATH_MARCH_S; // 기상까지 끝난 뒤 남는 행군 구간 (연출 길이는 아래 벽시계가 담당)
        // ⚠️ 기상 예약을 pending(=틱 누적)으로 걸면 안 된다. main.js의 로직 루프는 탭 스톨·긴 프레임 뒤
        // Math.min(5000, …) 만큼을 한 번의 인터벌 발화에서 while로 몰아 돌리므로(최대 50틱=5초치),
        // 그 한 번에 쓰러짐→기상→다음 스테이지까지 전부 지나가 사망이 또 안 보인다(실측: 실제 2ms 만에 스테이지 재시작).
        // 그래서 사망 구간만 벽시계로 잰다 — 캐치업이 몇 틱을 몰아 돌리든 실제 시간이 흘러야 일어난다.
        this.downUntil = U.now() + this.DEATH_DOWN_MS;
        this.riseUntil = 0;
    },
};
