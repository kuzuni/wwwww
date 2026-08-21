// ============================================================================
// 스킬 연출 = 마인크래프트식 "실체 있는 오브젝트" (skill-fx-minecraft-actors, 2026-08-21)
// ----------------------------------------------------------------------------
// 사용자 지시(2026-08-21): *"스킬에 나오는 오브젝트들 전부 동물, 로봇, 드래곤 이런 느낌이어야
//   함. 지금 꺼들 폐기하고 그런 식으로 바꾸고 … 마인크래프트식으로 바꿔야 함. 로봇이 나와서
//   적 때리던지, 표창 10개가 적한테 날아간다던지 그런 걸로 해야 함."*
//
// 왜 별도 파일인가 — ⓐ `scene3d.js` 는 18,000줄이고 이 세션에 **다른 스트림 셋이 같은 파일의
// 다른 구역**(무기 파지·맵 프롭·평타 스윙)을 동시에 고치고 있다. 새 연출 층을 통째로 그 안에
// 넣으면 충돌 면적만 커진다. ⓑ 펫·탈것·적이 이미 조형을 `mobs-*.js` 로 분리한 것과 같은 결이다 —
// 조형은 `mobs-skillfx.js`(표), **안무는 이 파일**, `scene3d.js` 에는 이름만 남는다.
//
// 계약 — `scene3d.js` 의 공개 이름(`slashArcs`·`meteorStorm`·`dragonMaw` …)은 그대로 살아 있고,
// 그 함수들이 여기 `mc*` 안무로 위임한다. 그래서 **시전 시간·피해 시점·쿨다운·무게 층 동기
// 시각(`*_IMPACT_MS`)은 한 값도 바뀌지 않는다** — 바뀐 것은 화면에 무엇이 나오는가뿐이다.
//
// 🚨 이 파일은 `scene3d.js` **뒤에** 로드돼야 한다(Object.assign 대상이 그때 존재한다).
// ============================================================================
// 🚨 `Scene3D` 는 `const Scene3D = {...}` 로 선언돼 있다 — 클래식 스크립트의 const 는 **전역
//    렉시컬 바인딩**이라 `window.Scene3D` 가 아니다. `root.Scene3D` 로 찾으면 undefined 라
//    이 파일이 통째로 조용히 no-op 이 된다(첫 실행에서 실제로 그랬다). 이름으로 직접 잡는다.
(function () {
    'use strict';
    if (typeof Scene3D === 'undefined') return;
    Object.assign(Scene3D, {
    // ══════════════════════════════════════════════════════════════════════════════
    // 마인크래프트식 스킬 액터 — "실체가 나와서 때린다" (skill-fx-minecraft-actors, 2026-08-21)
    // ------------------------------------------------------------------------------
    // 사용자 지시(2026-08-21): *"스킬에 나오는 오브젝트들 전부 동물, 로봇, 드래곤 이런 느낌이어야
    //   함. 지금 꺼들 폐기하고 그런 식으로 바꾸고 … 마인크래프트식으로 바꿔야 함. 로봇이 나와서
    //   적 때리던지, 표창 10개가 적한테 날아간다던지 그런 걸로 해야 함."*
    //
    // 무엇을 폐기했나 — 18종 전부가 **링·플레어·글로우·파티클**로 만들어져 있었다. 그래서 화면에
    // 물건이 하나도 없었고, 스킬이 갈리는 근거가 '색'뿐이라 전부 '빛나는 뭔가'로 수렴했다.
    // 옛 연출 함수들은 `_legacy*` 로 밀어 두고(같은 파일을 다른 에이전트 셋이 동시에 고치는 중이라
    // 대량 삭제는 충돌 위험이 크다) 공개 이름은 전부 아래 액터 연출로 갈아 끼웠다.
    //
    // 새 문법 — 펫·탈것·적과 **같은 박스 모델**(`Mobs.build` + `SKILLFX_MODELS`)이 등장한다:
    //   등장(하늘에서 낙하 / 땅에서 융기 / 옆에서 착지) → 이동·타격(관절 스윙·물기·발사) →
    //   퇴장(도약·침강). 추상 링/전면 플래시는 이 층에서 쓰지 않는다. 큐브 파편(`spawnSparks`)과
    //   블록 투사체만 보조로 쓴다(확정 화풍 ⓔ).
    //
    // 🚨 **성능 계약 — 프로토타입 1개를 캐시하고 clone 한다.** `Mobs.build` 는 복셀을 병합해
    //    지오메트리를 굽는 무거운 작업이라 시전마다 돌리면 GC·스톨이 터진다(`skill-cast-lag-optimize`
    //    가 이미 한 번 밟은 함정). 그래서 액터 종당 한 번만 굽고, 시전은 `clone(true)` 로 만든다 —
    //    clone 은 **지오메트리·재질을 공유**하므로 드로우콜만 늘고 메모리·컴파일은 늘지 않는다.
    // 🚨 그 대가로 **액터 파츠의 geometry/material 을 절대 dispose 하면 안 된다**(공유물이다).
    //    프로토타입에 `sharedGeometry`·`sharedMaterial` 을 박아 `disposeTree` 가 건너뛰게 해 뒀고,
    //    `fxActorFree` 는 씬에서 떼기만 한다.
    // 🚨 **타이밍은 계약이다.** 시전 시간(`castMsFor`)·피해 시점(`Combat.tryCast` 0.20/0.25초)·
    //    쿨다운은 이 층이 건드리지 않는다. `*_IMPACT_MS` 상수(무게 층 동기 시각)도 그대로 두고,
    //    각 연출의 '결정적 타격'이 그 시각에 오도록 안무를 맞춘다.
    // ══════════════════════════════════════════════════════════════════════════════

    // 액터 프로토타입 — 종당 1회 굽고 캐시. 실패(표 없음)도 캐시해 매 시전 재시도하지 않는다.
    fxActorProto(id) {
        this._fxProto = this._fxProto || {};
        if (id in this._fxProto) return this._fxProto[id];
        const model = (typeof SKILLFX_MODELS !== 'undefined') && SKILLFX_MODELS[id];
        if (!model || typeof Mobs === 'undefined') return (this._fxProto[id] = null);
        const built = Mobs.build(model, { cell: model.cell, vivid: 0.14 });
        // 파츠 이름을 노드에 박는다 — clone 은 `parts` 맵을 복제하지 않으므로, 복제본에서는
        // 이름으로 되찾는다(이름이 곧 애니 계약: head/body/armR/legL/jaw/weapon/wing*/tail/core).
        for (const k of Object.keys(built.parts)) built.parts[k].name = 'fx:' + k;
        built.group.traverse(o => {
            if (!o.isMesh) return;
            o.userData.sharedGeometry = true;   // 🚨 dispose 금지 — 모든 복제본이 같은 것을 쓴다
            o.userData.sharedMaterial = true;
            o.castShadow = false; o.receiveShadow = false;   // 연출 액터는 그림자를 안 던진다(드로우콜)
        });
        return (this._fxProto[id] = built.group);
    },

    // 액터 한 체를 씬에 세운다. 반환 { g, P } — P 는 파츠 이름 맵.
    // yaw 기본값 = CREATURE_YAW = **펫·탈것과 같은 3/4 방향**(creature-yaw-unify, 2026-08-22).
    //   종전엔 π/2(정면 +x, 옆모습)라 소환체만 펫/탈것과 방향이 어긋났다. 표 정면이 +z 라 펫·탈것과
    //   같은 규약이므로, 같은 yaw 상수를 쓰면 화면상 같은 쪽을 본다. 좌우 반사는 부호로 ±CREATURE_YAW.
    fxActor(id, opt) {
        const proto = this.fxActorProto(id);
        if (!proto || !this.scene) return null;
        const o = opt || {};
        const g = proto.clone(true);
        const P = {};
        g.traverse(n => { if (n.name && n.name.lastIndexOf('fx:', 0) === 0) P[n.name.slice(3)] = n; });
        if (o.scale) g.scale.setScalar(o.scale);
        if (o.pos) g.position.copy(o.pos);
        g.rotation.y = o.yaw === undefined ? this.CREATURE_YAW : o.yaw;
        this.scene.add(g);
        return { g, P, id };
    },
    // 퇴장 — 씬에서 떼기만 한다(지오·재질은 프로토타입 공유물이라 해제하면 다음 시전이 깨진다).
    fxActorFree(a) { if (a && a.g && a.g.parent) a.g.parent.remove(a.g); },

    // 🚨 지원형 소환체(힐·버프)의 **안전 정박대** (skill-actor-clear-zone, 사용자 지시 2026-08-22:
    //    "모든 스킬 사용할 때 소환체가 플레이어·탈것·펫에 겹치거나 가리거나 가려지지 않게").
    //    셋의 점유 대역은 전부 음수~0 x 다: 영웅 실루엣 x[-1.91,0] · 탈것 풋프린트 x[-1.89,-0.77] ·
    //    펫 대열(PET_ROW0/PET_ARC 전부 음수 x). 따라서 **양수 x(전방-우측)** 만이 셋 모두를
    //    비켜 가는 공통 안전지대다. 방패 골렘(hero.x+0.95)이 이미 이 대역에 서서 깨끗하게 읽혀
    //    기준으로 삼는다. 버프 전달 스트림(`mcBlockStream`)은 여기서 **영웅으로 되돌려 쏘면**
    //    되므로 '영웅에게 걸렸다'는 인과는 그대로 산다. 종전엔 지원 소환체가 hero.x−0.6~−1.1
    //    (탈것·펫 위)에 서서 사용자 지목대로 서로 가렸다.
    // ⚠️ 여기서 뒤로(−x, 음수) 되돌리지 말 것 — 그 순간 다시 탈것/펫과 겹친다(같은 실수 반복 금지).
    // 📏 값 근거(2026-08-22 인게임 실측, mythic Dino 탑승 + mythic 펫 3): heroG.position.x=0.35 이고
    //    **영웅 bbox 우단이 world x=1.12**(무기가 앞으로 뻗음)까지 간다. 탈것 우단은 −0.57, 펫은 전부
    //    x<−1.77 이라 좌측이다. 따라서 소환체(폭 반경 ~0.7)가 영웅 우단을 비키려면 중심이
    //    world ≳ 1.12+0.7+여유 ≈ 2.0 이어야 한다 → `hero.x(0.35)+1.8 = 2.15`. 투영 실측상 world x=3.65
    //    까지도 3D 캔버스 안(NDC 0.6)이라 화면 밖 잘림 걱정은 없다. 1.2(첫 시도)는 영웅 무기에 먹혔다.
    SUPPORT_STAGE_X: 1.8,     // 영웅 앞 안전 정박 x(양수 = 전방-우측). 영웅 bbox 우단 1.12 + 소환체 폭까지 넘어섬.
    SUPPORT_STAGE_DZ: 0.6,    // 여러 체가 설 때 z 대열 간격(서로 안 겹치게)
    // n 체의 지원 소환체 중 i번째가 설 자리(영웅 기준). z 로 부채꼴 벌려 대열이 겹치지 않게.
    supportSpot(hero, i, n) {
        const mid = (n - 1) / 2;
        return new THREE.Vector3(hero.x + this.SUPPORT_STAGE_X + i * 0.35, 0, hero.z + (i - mid) * this.SUPPORT_STAGE_DZ);
    },

    // 타깃 자리들 — 다 죽었으면 영웅 앞쪽을 쓴다(허공에 연출하지 않기 위해).
    mcSpots(targetIds) {
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        if (live.length) return live.map(m => m.g.position.clone());
        return [this.heroG.position.clone().add(new THREE.Vector3(1.9, 0, 0))];
    },
    // 착지·융기 먼지 — 흙색 큐브 몇 개. 액터가 '땅에 닿았다'를 만드는 최소 신호.
    mcDust(pos, n) {
        this.spawnSparks(new THREE.Vector3(pos.x, 0.12, pos.z), n || 6, 0x9c8466, { speed: 0.7, scale: 0.9 });
    },
    // 타격 순간 — 청키 큐브 파편 + 셰이크 + 짧은 광원. 추상 링은 쓰지 않는다.
    mcHit(pos, color, tier, big) {
        const t = Math.max(0, Math.min(5, tier | 0));
        // ⚠️ 발생량을 늘리지 말 것 — 파편이 20장을 넘으면 **액터를 덮는다**(첫 캡처 실측:
        //    검사 로봇이 흰 구름에 파묻혀 무엇이 때렸는지 안 보였다). 파편은 타격의 증거지 주인공이 아니다.
        this.spawnSparks(pos.clone(), Math.round((big ? 15 : 8) + t * 3), color.getHex(),
            { speed: (big ? 1.5 : 1.1) + t * 0.14, scale: big ? 1.15 : 0.95 });
        this.shake((big ? 0.28 : 0.16) + t * 0.045);
        this.flashLight(pos.clone(), color.getHex(), big ? 0.22 : 0.15);
        SFX.hit(!!big);
    },
    // 날갯짓 — 비행 액터 공통. s(좌우)는 표가 박아 둔 userData.s 를 쓴다.
    mcFlap(a, phase, amp) {
        for (const k of ['wingL', 'wingR']) {
            const w = a.P[k]; if (!w) continue;
            const s = (w.userData && w.userData.s) || (k === 'wingL' ? -1 : 1);
            w.rotation.z = s * (amp === undefined ? 0.5 : amp) * Math.sin(phase);
        }
    },
    // 블록 투사체 흐름 — from → to 로 청키 큐브 n 개를 흘린다(회복·버프의 '전달'을 실체로).
    // 큐브는 시전마다 만들고 끝나면 해제한다(개수가 작아 풀링보다 단순한 쪽이 낫다).
    mcBlockStream(from, to, n, hex, ms, opt) {
        const o = opt || {};
        const geo = this.fxGeo('box', 1, 1, 1);
        for (let i = 0; i < n; i++) {
            const d = (i / n) * (ms * 0.55);
            setTimeout(() => {
                if (!this.scene) return;
                const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.95, depthWrite: false }));
                m.userData.sharedGeometry = true;                 // 캐시 지오 — dispose 금지
                m.scale.setScalar(o.size || U.rand(0.09, 0.15));
                const p0 = from.clone().add(new THREE.Vector3(U.rand(-0.28, 0.28), U.rand(-0.2, 0.2), U.rand(-0.28, 0.28)));
                const p1 = to.clone().add(new THREE.Vector3(U.rand(-0.2, 0.2), U.rand(-0.15, 0.25), U.rand(-0.2, 0.2)));
                m.position.copy(p0);
                const spin = { x: U.rand(-6, 6), y: U.rand(-6, 6), z: U.rand(-6, 6) };
                this.scene.add(m);
                this.addAnim((ms * 0.45) / 1000, k => {
                    m.position.lerpVectors(p0, p1, k);
                    m.position.y += Math.sin(k * Math.PI) * (o.arc === undefined ? 0.32 : o.arc);
                    m.rotation.set(spin.x * k, spin.y * k, spin.z * k);
                    m.scale.setScalar((o.size || 0.12) * (1 - 0.55 * k * k));
                }, () => { m.material.dispose(); this.scene.remove(m); });
            }, d);
        }
    },

    // ── 근접 액터 공통 안무 ────────────────────────────────────────────────────────
    // 등장 → (예비: 무기를 든다) → 타격 → 퇴장. 검사 로봇·처형인·바위 골렘·기사가 전부 이걸 탄다.
    // cfg: { model, scale, from, to, yaw, inMs, swingMs, outMs, color, tier, arm, wind, swing,
    //        drop(하늘 낙하), rise(지중 융기), big, lunge, onImpact, hold, onExit }
    mcMeleeStrike(cfg) {
        const a = this.fxActor(cfg.model, { scale: cfg.scale || 1, pos: cfg.from, yaw: cfg.yaw });
        if (!a) return null;
        const P = a.P, arm = P[cfg.arm || 'armR'], armO = P[(cfg.arm || 'armR') === 'armR' ? 'armL' : 'armR'];
        const to = cfg.to.clone(), from = cfg.from.clone();
        const wind = cfg.wind === undefined ? -2.3 : cfg.wind;     // 예비: 무기를 머리 뒤로
        const swing = cfg.swing === undefined ? 1.0 : cfg.swing;   // 타격: 앞으로 내려친다
        const color = cfg.color, t = Math.max(0, Math.min(5, cfg.tier | 0));
        // ⓐ 등장 — 낙하는 가속(무게), 옆걸음/융기는 감속(착지).
        this.addAnim((cfg.inMs || 170) / 1000, k => {
            const e = cfg.drop ? k * k : 1 - Math.pow(1 - k, 3);
            a.g.position.lerpVectors(from, to, e);
            if (arm) arm.rotation.x = wind * e;
            if (armO) armO.rotation.x = -0.35 * e;
            if (P.legL) P.legL.rotation.x = 0.55 * (1 - e);
            if (P.legR) P.legR.rotation.x = -0.55 * (1 - e);
            if (P.head) P.head.rotation.x = 0.18 * e;
        }, () => {
            this.mcDust(to, cfg.drop ? 10 : 5);
            if (cfg.drop) this.shake(0.12 + t * 0.03);
            // ⓑ 타격 — 가속 스윙. 몸이 반 걸음 앞으로 나가야 '때렸다'가 읽힌다.
            this.addAnim((cfg.swingMs || 150) / 1000, k => {
                const e = k * k;
                if (arm) arm.rotation.x = wind + (swing - wind) * e;
                if (armO) armO.rotation.x = -0.35 + 0.5 * e;
                a.g.position.x = to.x + (cfg.lunge === undefined ? 0.28 : cfg.lunge) * e * (cfg.faceBack ? -1 : 1);
                if (P.head) P.head.rotation.x = 0.18 - 0.3 * e;
            }, () => {
                const hp = new THREE.Vector3(to.x + (cfg.faceBack ? -0.6 : 0.6), 0.75, to.z);
                if (cfg.onImpact) cfg.onImpact(hp, a); else this.mcHit(hp, color, t, cfg.big);
                // ⓒ 퇴장 — 잠깐 자세를 유지했다가 도약(또는 침강)하며 사라진다.
                setTimeout(() => {
                    const y0 = a.g.position.y, s0 = a.g.scale.x;
                    this.addAnim((cfg.outMs || 260) / 1000, k => {
                        if (cfg.sink) { a.g.position.y = y0 - k * 2.6; return; }
                        const e = k * k;
                        a.g.position.y = y0 + e * 2.2;
                        a.g.position.x = to.x - (cfg.faceBack ? -0.5 : 0.5) * e;
                        a.g.scale.setScalar(s0 * (1 - 0.75 * e));
                        if (arm) arm.rotation.x = swing - 1.4 * e;
                        if (P.legL) P.legL.rotation.x = -0.7 * e;
                        if (P.legR) P.legR.rotation.x = 0.7 * e;
                    }, () => { this.fxActorFree(a); if (cfg.onExit) cfg.onExit(); });
                }, cfg.hold === undefined ? 90 : cfg.hold);
            });
        });
        return a;
    },

    // ── ① 연속 참격(slash) — 검사 로봇 2~3기가 좌우에서 교차로 벤다 ─────────────────
    // 사용자 예시 "로봇이 나와서 적 때리던지" 그대로. 옛 연출은 '흰 초승달 참격 세례'였다.
    mcSwordBots(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 0 : tier));
        const spots = this.mcSpots(targetIds), spot = spots[0];
        const n = 2 + (t >= 4 ? 1 : 0);
        for (let i = 0; i < n; i++) {
            const back = i % 2 === 1;                       // 한 기는 적 뒤에서 — 교차가 읽힌다
            const dz = (i === 2 ? 0 : (back ? 0.85 : -0.85));
            setTimeout(() => {
                const target = (this.mcSpots(targetIds))[0] || spot;
                this.mcMeleeStrike({
                    model: 'swordbot', scale: 0.95 + t * 0.06, color, tier: t, big: i === n - 1,
                    faceBack: back, yaw: back ? -this.CREATURE_YAW : this.CREATURE_YAW,
                    from: new THREE.Vector3(target.x + (back ? 1.9 : -1.9), 1.3, target.z + dz),
                    to: new THREE.Vector3(target.x + (back ? 0.88 : -0.88), 0, target.z + dz),
                    inMs: 150, swingMs: 130, outMs: 240, hold: 70,
                    onImpact: (hp) => { this.mcHit(hp, color, t, i === n - 1); SFX.slashArc(i, t); },
                });
            }, i * 140);
        }
    },

    // ── ② 회오리 베기(ring) — 표창 10개가 영웅을 감아 돌다 적에게 날아간다 ────────────
    // 사용자 예시 "표창 10개가 적한테 날아간다" 그대로. 옛 연출은 '깃 세 겹이 도는 소용돌이'였다.
    mcShurikenStorm(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 0 : tier));
        const n = 10;                                        // 사용자 지정 개수 — 등급으로 흔들지 않는다
        const spots = this.mcSpots(targetIds);
        const hero = this.heroG.position.clone();
        SFX.slashArc(0, t);
        for (let i = 0; i < n; i++) {
            const a = this.fxActor('shuriken', { scale: 0.9 + t * 0.06, pos: new THREE.Vector3(hero.x, 1.05, hero.z), yaw: 0 });
            if (!a) return;
            const tgt = spots[i % spots.length];
            const a0 = (i / n) * Math.PI * 2;
            const orbit = 0.75 + (i % 3) * 0.18;
            // 적중 시각 = 회오리 170ms + 비행 110~310ms → 280~480ms. 광역 피해 판정(0.25초)에
            // 첫 표창이 맞물리고, 나머지가 '다다다닥' 뒤따른다.
            const dest = new THREE.Vector3(tgt.x + U.rand(-0.2, 0.2), 0.65 + U.rand(-0.2, 0.35), tgt.z + U.rand(-0.2, 0.2));
            a.g.rotation.x = -0.35;                          // 살짝 눕혀야 십자 날이 보인다
            // ⓐ 회오리 — 영웅 둘레를 감아 돈다(이 스킬이 '회오리'인 근거).
            this.addAnim(0.17, k => {
                const ang = a0 + k * 5.2;
                a.g.position.set(hero.x + Math.cos(ang) * orbit, 0.85 + k * 0.55, hero.z + Math.sin(ang) * orbit * 0.7);
                a.g.rotation.y += 1.1;                       // 표창은 늘 돌고 있어야 한다
            }, () => {
                // ⓑ 발사 — 적에게 직선으로.
                const st = a.g.position.clone();
                this.addAnim((110 + i * 22) / 1000, k => {
                    a.g.position.lerpVectors(st, dest, k);
                    a.g.rotation.y += 1.4;
                }, () => { this.mcHit(dest, color, t, i === n - 1); this.fxActorFree(a); });
            });
        }
    },

    // ══════════════════════════════════════════════════════════════════════════════
    // 🆕 커먼 3종 — "오브젝트가 주인공" (skill-object-protagonist, 사용자 지시 2026-08-22)
    // ------------------------------------------------------------------------------
    // 사용자 원문: *"오브젝트가 주인공이어야 함. 표창이 왼쪽 화면에서 여러 개 날아가서 적 쪽으로
    //   맞춘다든지 … 화살이 왼쪽 화면에서 여러 개 날아가서 … 그리고 적 발밑에서 지렁이 괴물 나와서
    //   적 공격하는 느낌."*
    //
    // 핵심 = **오브젝트 자체가 화면을 가로지른다.** 소환체(로봇·궁수)가 걸어나와 대신 때리는 게
    // 아니라, 표창·화살이 **화면 왼쪽 밖에서** 진입해 오른쪽 적까지 날아가 꽂힌다. 카메라는 yaw
    // 회전이 없어(월드 +x = 화면 오른쪽) **적보다 크게 −x 쪽**에서 출발시키면 왼쪽 프레임 밖에서
    // 들어오는 궤적이 된다. 지렁이는 **적 좌표 그 자리**에서 지면을 뚫고 솟는다(발밑 습격).
    // ⚠️ 타이밍 계약: 단일 피해 0.20s · 광역 0.25s. 첫 오브젝트의 착탄이 그 시각에 오도록 맞춘다.

    // ── 표창 난무(shurikenrun) — 표창이 왼쪽 밖에서 다다다닥 날아와 꽂힌다 (단일) ───────
    // 🚩 표창·화살 출발점 = **화면 왼쪽 밖 고정 x**. 카메라 좌측 프레임 경계가 z=0 에서 world x≈−4.7
    //    이라, −8.5 언저리에서 쏘면 시작 순간엔 프레임 밖(안 보임)이고 날아 들어오며 화면에 등장한다.
    //    적 x 에 상대(−5칸)로 잡으면 적이 왼쪽에 붙었을 때 프레임 안에서 튀어나와 '밖에서 온' 게 깨진다.
    SKILL_OFFSCREEN_X: -8.5,

    // ── 표창 난무(shurikenrun) — 표창이 왼쪽 밖에서 포물선으로 날아와 꽂힌다 (단일) ──────
    mcShurikenBarrage(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 0 : tier));
        const spot0 = this.mcSpots(targetIds)[0];
        const n = 7 + (t >= 3 ? 2 : t >= 1 ? 1 : 0);
        SFX.slashArc(0, t);
        for (let i = 0; i < n; i++) {
            setTimeout(() => {
                const tgt = this.mcSpots(targetIds)[0] || spot0;
                const from = new THREE.Vector3(this.SKILL_OFFSCREEN_X + U.rand(-1, 1), U.rand(1.4, 2.6), tgt.z + U.rand(-1.3, 1.3));
                const a = this.fxActor('shuriken', { scale: 1.0 + t * 0.06, pos: from, yaw: 0 });
                if (!a) return;
                a.g.rotation.x = -0.42;                       // 살짝 눕혀야 십자 날이 보인다
                const dest = new THREE.Vector3(tgt.x - 0.1, 0.62 + U.rand(-0.15, 0.4), tgt.z + U.rand(-0.25, 0.25));
                const arcH = 1.6 + U.rand(-0.2, 0.5);         // 포물선 정점 높이
                // 느리게(0.42s) + 포물선 — 직선 lerp 에 sin 을 얹어 위로 볼록하게 날린다.
                this.addAnim(0.42, k => {
                    a.g.position.lerpVectors(from, dest, k);
                    a.g.position.y += Math.sin(k * Math.PI) * arcH;   // 포물선 아치
                    a.g.rotation.y += 0.85;                            // 회전(느려진 만큼 각속도 낮춤)
                }, () => { this.mcHit(dest, color, t, i === n - 1); this.fxActorFree(a); });
            }, i * 85);                                        // 스태거 넓혀 '왼쪽에서 줄줄이' 로 읽히게
        }
    },

    // ── 화살비(arrowrain) — 화살이 왼쪽 밖에서 포물선으로 쏟아진다 (광역) ────────────────
    mcArrowRain(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 0 : tier));
        const volley = 8 + t * 2;
        SFX.slashArc(0, t);
        for (let i = 0; i < volley; i++) {
            setTimeout(() => {
                const spots = this.mcSpots(targetIds);
                const cur = spots[i % spots.length];
                const from = new THREE.Vector3(this.SKILL_OFFSCREEN_X + U.rand(-1, 1), U.rand(1.6, 2.8), cur.z + U.rand(-1.2, 1.2));
                const to = new THREE.Vector3(cur.x + U.rand(-0.25, 0.25), 0.6 + U.rand(0, 0.5), cur.z + U.rand(-0.3, 0.3));
                // 느린 비행(0.42s) + 포물선(arcH 2.0) — 촉이 궤적 접선을 따라 내려꽂힌다.
                this.projectileBolt(from, to, color, t, 0.42, 2.0 + U.rand(-0.3, 0.5));
            }, i * 60);                                        // 스태거 넓혀 줄줄이 쏟아지게
        }
        setTimeout(() => this.shake(0.2 + t * 0.05), Math.min(6, volley) * 60 + 380);
    },

    // ── 땅벌레(burrowworm) — 적 발밑에서 긴 지렁이가 꿈틀대며 솟아 문다 (단일) ────────────
    // "더 길어야 함 · 지렁이답게 더 꿈틀"(2026-08-22): 마디 사슬(seg0..seg6)에 위상차 사인파를 주면
    //   회전이 사슬을 타고 누적돼 몸통 전체가 S 자로 굽이친다. 시퀀스도 느리게·길게 늘렸다.
    mcBurrowWorm(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 0 : tier));
        const spot = this.mcSpots(targetIds)[0];
        const at = new THREE.Vector3(spot.x, 0.1, spot.z);        // 적 발밑 바로 그 자리
        const a = this.fxActor('worm', { scale: 1.0 + t * 0.06, pos: new THREE.Vector3(at.x, -3.4, at.z) });
        if (!a) return;
        const head = a.P.head, jaw = a.P.jaw;
        const SEGS = ['seg0', 'seg1', 'seg2', 'seg3', 'seg4', 'seg5', 'seg6'];
        let ph = 0;
        // 마디마다 위상차를 준 사인파 → 사슬을 타고 누적돼 굽이치는 꿈틀. amp 로 세기 조절.
        const wriggle = (amp) => {
            ph += 0.33;
            for (let i = 0; i < SEGS.length; i++) {
                const s = a.P[SEGS[i]];
                if (s) s.rotation.z = amp * Math.sin(ph - i * 0.6);
            }
            if (head) head.rotation.z = amp * 0.6 * Math.sin(ph - SEGS.length * 0.6);
        };
        SFX.mawRoar(Math.max(0, t - 1));
        this.mcDust(at, 14);
        // ⓐ 융기 — 땅속 깊이(−3.4)서 천천히 솟는다(0.44s). 머리를 젖히고 아가리 벌림. 꿈틀 시작.
        this.addAnim(0.44, k => {
            const e = 1 - Math.pow(1 - k, 3);
            a.g.position.y = -3.4 + e * 3.5;
            wriggle(0.10 + 0.20 * e);
            if (head) head.rotation.x = -1.0 * e;
            if (jaw) jaw.rotation.x = 0.55 * e;
        }, () => {
            this.mcDust(at, 8);
            // ⓑ 위협 — 크게 꿈틀대며 머리를 좌우로 흔든다(지렁이 본체, 0.34s).
            this.addAnim(0.34, k => {
                wriggle(0.42);
                if (head) { head.rotation.x = -1.0 + 0.22 * Math.sin(k * Math.PI * 2); head.rotation.y = 0.35 * Math.sin(k * Math.PI * 2); }
                if (jaw) jaw.rotation.x = 0.55 + 0.15 * Math.sin(k * Math.PI * 3);
            }, () => {
                // ⓒ 덮침 — 머리를 적에게 내리꽂고 아가리를 앙 다문다(0.18s).
                this.addAnim(0.18, k => {
                    const e = k * k;
                    wriggle(0.32 * (1 - e));
                    if (head) head.rotation.x = -1.0 + 1.85 * e;
                    if (jaw) jaw.rotation.x = 0.55 - 1.05 * e;
                    a.g.position.y = 0.1 + 0.45 * Math.sin(k * Math.PI);
                }, () => {
                    this.mcHit(new THREE.Vector3(at.x, 1.0, at.z), color, t, true);
                    SFX.slashArc(0, t);
                    // ⓓ 후퇴 — 크게 꿈틀대며 땅속으로 사라진다(0.55s).
                    setTimeout(() => {
                        const y0 = a.g.position.y;
                        this.addAnim(0.55, k => {
                            wriggle(0.34 * (1 - k * 0.4));
                            a.g.position.y = y0 - k * 4.4;
                            if (head) head.rotation.x = 0.85 - k * 0.9;
                        }, () => this.fxActorFree(a));
                    }, 140);
                });
            });
        });
    },

    // ── ③ 응급 처치(firstaid) — 의무 정령이 날아와 구급 상자를 붙인다 ─────────────────
    mcMedicSprite(color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 0 : tier));
        const hero = this.heroG.position.clone();
        // 전방-우측 안전 정박대(SUPPORT_STAGE) — 종전 hero.x−0.62 는 영웅 몸통·탈것 위였다.
        const at = new THREE.Vector3(hero.x + this.SUPPORT_STAGE_X, 1.02, hero.z - 0.3);
        const from = new THREE.Vector3(at.x + 0.7, 1.9, at.z - 0.6);
        const a = this.fxActor('medic', { scale: 1.0 + t * 0.05, pos: from, yaw: this.CREATURE_YAW });
        if (!a) return;
        SFX.healDescend(t);
        let ph = 0;
        this.addAnim(0.24, k => {
            const e = 1 - Math.pow(1 - k, 3);
            a.g.position.lerpVectors(from, at, e);
            this.mcFlap(a, (ph += 0.9), 0.75);
            if (a.P.armR) a.P.armR.rotation.x = -0.4 * e;
        }, () => {
            // 처치 — 상자를 영웅 가슴에 대고 붕대 블록을 흘려 넣는다.
            this.mcBlockStream(at, new THREE.Vector3(hero.x, 1.12, hero.z), 8, 0xf4f0e6, 420, { size: 0.13, arc: 0.16 });
            this.mcBlockStream(at, new THREE.Vector3(hero.x, 1.12, hero.z), 5, color.getHex(), 460, { size: 0.11, arc: 0.22 });
            this.addAnim(0.5, k => {
                this.mcFlap(a, (ph += 0.7), 0.6);
                if (a.P.armR) a.P.armR.rotation.x = -0.4 - Math.sin(k * Math.PI * 3) * 0.5;
                a.g.position.y = at.y + Math.sin(k * Math.PI * 2) * 0.07;
            }, () => {
                this.addAnim(0.36, k => {
                    this.mcFlap(a, (ph += 1.1), 0.9);
                    a.g.position.set(at.x + k * 1.2, at.y + k * 1.7, at.z - k * 0.8);   // 전방-우측으로 이탈(영웅 반대편)
                    a.g.scale.setScalar((1 + t * 0.05) * (1 - 0.8 * k * k));
                }, () => this.fxActorFree(a));
            });
        });
    },

    // ── ④ 화염구(explode) — 임프가 소환돼 불덩이 블록을 던진다 ──────────────────────
    mcImpFireball(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const hero = this.heroG.position.clone();
        // 전방-우측 안전 정박대 — 종전 hero.x+0.55(world 0.90)는 영웅 bbox(우단 1.12) 머리 위였다.
        const at = new THREE.Vector3(hero.x + this.SUPPORT_STAGE_X - 0.35, 1.15, hero.z - 0.6);
        const a = this.fxActor('imp', { scale: 1.0 + t * 0.07, pos: new THREE.Vector3(at.x, at.y + 1.6, at.z - 0.6), yaw: this.CREATURE_YAW });
        if (!a) return;
        let ph = 0;
        SFX.mawRoar(Math.max(0, t - 2));
        this.addAnim(0.16, k => {
            const e = 1 - Math.pow(1 - k, 3);
            a.g.position.set(at.x, at.y + 1.6 * (1 - e), at.z - 0.6 * (1 - e));
            this.mcFlap(a, (ph += 1.3), 0.9);
            if (a.P.armR) a.P.armR.rotation.x = -2.2 * e;     // 던지려고 뒤로 젖힌다
        }, () => {
            // 투척 — 손에서 불덩이 블록이 떠나 포물선으로 날아가 터진다.
            this.addAnim(0.12, k => {
                this.mcFlap(a, (ph += 1.3), 0.9);
                if (a.P.armR) a.P.armR.rotation.x = -2.2 + 3.0 * k * k;
            }, () => {
                const spots = this.mcSpots(targetIds);
                spots.slice(0, 3).forEach((spot, si) => setTimeout(() => {
                    const b = this.fxActor('fireblock', { scale: 0.9 + t * 0.1, pos: new THREE.Vector3(at.x + 0.45, at.y + 0.15, at.z), yaw: 0 });
                    if (!b) return;
                    const p0 = b.g.position.clone(), p1 = new THREE.Vector3(spot.x, 0.62, spot.z);
                    this.addAnim(0.17, k => {
                        b.g.position.lerpVectors(p0, p1, k);
                        b.g.position.y += Math.sin(k * Math.PI) * 0.55;
                        b.g.rotation.set(k * 6, k * 4, k * 3);
                    }, () => {
                        this.fxActorFree(b);
                        this.mcHit(p1, color, t, si === 0);
                        // 흩어지는 잔불 — 작은 불덩이 블록 4개가 사방으로 튀어 바닥에 구른다.
                        for (let i = 0; i < 4; i++) {
                            const c = this.fxActor('fireblock', { scale: 0.42, pos: p1.clone(), yaw: 0 });
                            if (!c) break;
                            const dir = new THREE.Vector3(U.rand(-1, 1), 0, U.rand(-0.7, 0.7)).normalize().multiplyScalar(0.8 + t * 0.1);
                            const q0 = p1.clone();
                            this.addAnim(0.42, k => {
                                c.g.position.set(q0.x + dir.x * k, Math.max(0.12, q0.y + Math.sin(k * Math.PI) * 0.5 - k * 0.35), q0.z + dir.z * k);
                                c.g.rotation.set(k * 7, k * 5, 0);
                                c.g.scale.setScalar(0.42 * (1 - 0.6 * k));
                            }, () => this.fxActorFree(c));
                        }
                        SFX.stormStrike(si);
                    });
                }, si * 90));
                // 임프 퇴장 — 날아오르며 사라진다.
                this.addAnim(0.4, k => {
                    this.mcFlap(a, (ph += 1.5), 1.0);
                    a.g.position.set(at.x - k * 0.5, at.y + k * 1.9, at.z - k * 0.5);
                    a.g.scale.setScalar((1 + t * 0.07) * (1 - 0.8 * k * k));
                }, () => this.fxActorFree(a));
            });
        });
    },

    // ── ⑤ 화살 세례(beam) — 궁수 자동인형 3기가 일렬로 연사한다 ─────────────────────
    // ⚠️ 발수·간격(`arrowGapMs`)·SFX 는 종전 그대로 둔다 — 그게 이 스킬의 박자다. 바뀐 건
    //    '어디서 나오는가'다: 예전엔 허공(영웅 어깨)에서 화살만 생겼다.
    mcArcherLine(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const n = 3 + Math.min(4, t);
        const gap = this.arrowGapMs(t);
        const hero = this.heroG.position.clone();
        const bots = [];
        for (let i = 0; i < 3; i++) {
            // 사격선 = 영웅 앞 안전 정박대(+x). 종전 hero.x−0.75 는 탈것 좌단 위였다. 앞에서 적(+x)을 쏜다.
            const at = new THREE.Vector3(hero.x + this.SUPPORT_STAGE_X - 0.2, 0, hero.z + (i - 1) * 0.85 - 0.1);
            const a = this.fxActor('archer', { scale: 0.95, pos: new THREE.Vector3(at.x, -1.8, at.z), yaw: this.CREATURE_YAW });
            if (!a) break;
            bots.push(a);
            this.addAnim(0.16, k => {                        // 땅에서 솟아 정렬한다
                a.g.position.y = -1.8 + (1 - Math.pow(1 - k, 3)) * 1.8;
                if (a.P.armR) a.P.armR.rotation.x = -1.45 * k;   // 석궁을 든다
                if (a.P.armL) a.P.armL.rotation.x = -1.2 * k;
            }, () => this.mcDust(at, 4));
        }
        for (let i = 0; i < n; i++) {
            setTimeout(() => {
                const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
                if (!live.length) return;
                const m = live[i % live.length];
                const last = i === n - 1;
                const b = bots[i % Math.max(1, bots.length)];
                const j = (i === 0 || last) ? 0 : 0.34;
                const from = b ? b.g.position.clone().add(new THREE.Vector3(0.45, 1.15, 0))
                    : this.heroG.position.clone().add(new THREE.Vector3(0.4, 1, 0));
                const to = m.g.position.clone().add(new THREE.Vector3(U.rand(-j, j), 0.6 + U.rand(-j, j) * 0.6, U.rand(-j, j) * 0.5));
                this.projectileBolt(from, to, color, last ? Math.min(5, t + 2) : t);
                if (b && b.P.armR) { b.P.armR.rotation.x = -1.75; setTimeout(() => { if (b.P.armR) b.P.armR.rotation.x = -1.45; }, 70); }
                if (last) { this.mcHit(to, color, t, true); }
                SFX.arrowShot(i, t);
            }, i * gap);
        }
        setTimeout(() => bots.forEach((a, i) => this.addAnim(0.3, k => {
            a.g.position.y = -1.8 * k * k;                    // 다시 땅으로 내려간다
            if (a.P.armR) a.P.armR.rotation.x = -1.45 * (1 - k);
        }, () => this.fxActorFree(a))), n * gap + 260);
    },

    // ── ⑥ 전투의 함성(warcry) — 오크 대장이 옆에 서서 뿔피리를 분다 ──────────────────
    // ⚠️ 버프는 '걸렸다는 시각 증거'가 늦게까지 남아야 한다(2차 채점 지적) — 대장이 700ms 넘게
    //    화면에 서서 3번 불고, 그때마다 블록 파형이 앞으로 퍼진다.
    mcOrcHorn(color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const hero = this.heroG.position.clone();
        // 전방-우측 안전 정박대 — 종전 hero.x−0.95 는 탈것 풋프린트(x[-1.89,-0.77]) 한복판이라
        // 대장이 700ms 넘게 탈것/영웅 위에 서서 통째로 가렸다(사용자 지목 주범).
        const at = new THREE.Vector3(hero.x + this.SUPPORT_STAGE_X, 0, hero.z - 0.35);
        const a = this.fxActor('orcchief', { scale: 1.0 + t * 0.05, pos: new THREE.Vector3(at.x, 2.2, at.z), yaw: this.CREATURE_YAW });
        if (!a) return;
        this.addAnim(0.17, k => {
            a.g.position.y = 2.2 * (1 - k * k);
            if (a.P.armR) a.P.armR.rotation.x = -1.1 * k;    // 뿔피리를 입으로
            if (a.P.head) a.P.head.rotation.x = -0.2 * k;
        }, () => {
            this.mcDust(at, 7); this.shake(0.14 + t * 0.03);
            SFX.auraRise(t);
            const mouth = new THREE.Vector3(at.x + 0.55, 1.35, at.z);
            for (let i = 0; i < 3; i++) setTimeout(() => {
                // 포효 = 앞으로 밀려 나가는 **블록 파형**(추상 링 대신 큐브가 줄지어 날아간다)
                this.mcBlockStream(mouth, new THREE.Vector3(hero.x + 2.4 + i * 0.5, 1.2, hero.z), 7 + t, color.getHex(), 300, { size: 0.16, arc: 0.1 });
                if (a.P.head) a.P.head.rotation.x = -0.45;
                setTimeout(() => { if (a.P.head) a.P.head.rotation.x = -0.2; }, 110);
                this.shake(0.1 + t * 0.02);
                SFX.mawRoar(t);
            }, 60 + i * 190);
            // 영웅에게 붙는 기운 — 버프가 '걸렸다'를 실체로 남긴다.
            setTimeout(() => this.mcBlockStream(new THREE.Vector3(at.x, 1.4, at.z),
                new THREE.Vector3(hero.x, 1.1, hero.z), 8, color.getHex(), 420, { size: 0.14 }), 320);
            setTimeout(() => this.addAnim(0.32, k => {
                a.g.position.y = -k * k * 2.4;
                if (a.P.armR) a.P.armR.rotation.x = -1.1 * (1 - k);
            }, () => this.fxActorFree(a)), 760);
        });
    },

    // ── ⑦ 메테오(meteor) — 하늘에서 바위 골렘이 떨어져 주먹으로 내려찍는다 ────────────
    // 종전엔 '돌멩이 4~9발'이라 던진 돌로 읽혔다. 같은 낙하인데 **무엇이 떨어졌는지**가 읽히게
    // 실체를 바꿨다. 🚨 무게(`skillImpactWeight`)는 여기 **마지막 착탄 콜백**이 직접 태운다 —
    //    `skillPayload` 가 메테오만 고정 지연에서 빼 둔 이유이며, 인과(폭발=착탄)의 근거다.
    mcRockGolemFall(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 2 : tier));
        const base = this.mcSpots(targetIds);
        const n = 2 + (t >= 2 ? 1 : 0) + (t >= 4 ? 1 : 0);   // 커먼 2체 … 미식 4체
        SFX.stormRumble(0.5);
        for (let i = 0; i < n; i++) {
            const last = i === n - 1;
            const c = base[i % base.length];
            const edge = last || i === 0 ? 0 : 0.9 + t * 0.12;
            const spot = new THREE.Vector3(c.x + U.rand(-edge, edge), 0, c.z + U.rand(-edge, edge) * 0.55);
            setTimeout(() => {
                this.mcMeleeStrike({
                    model: 'rockgolem', scale: (0.9 + t * 0.06) * (last ? 1.35 : 1), color, tier: t, big: last,
                    from: new THREE.Vector3(spot.x - 0.4, 3.4, spot.z), to: new THREE.Vector3(spot.x - 0.8, 0, spot.z),
                    drop: true, inMs: 300, swingMs: 120, outMs: 300, hold: 120, wind: -2.5, swing: 1.15, lunge: 0.2,
                    onImpact: (hp) => {
                        this.mcHit(hp, color, t, last);
                        this.mcDust(spot, 10);
                        // 지면 파쇄 — 돌 블록이 사방으로 튄다(청키 큐브 파편 규약).
                        this.spawnSparks(new THREE.Vector3(spot.x, 0.3, spot.z), Math.round(10 + t * 4), 0x8d8a83, { speed: 1.3, scale: 1.15 });
                        SFX.stormStrike(i);
                        if (last && tier !== undefined) this.skillImpactWeight('meteor', color, targetIds, t, [new THREE.Vector3(spot.x, 0, spot.z)]);
                    },
                });
            }, i * 190);
        }
    },

    // ── ⑧ 낙뢰(bolt) — 번개새가 선회하다 급강하해 내리꽂는다 ────────────────────────
    // 🚨 예고(선회)는 **1박(시전)** 에 세운다 — `skillEffect` 가 이 핸들을 `skillPayload` 로 넘긴다.
    //    페이로드에서 만들면 새가 뜨자마자 번개가 쳐서 예고가 성립하지 않는다(먹구름 때와 같은 계약).
    mcThunderTell(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 2 : tier));
        const spot = this.mcSpots(targetIds)[0];
        const a = this.fxActor('thunderbird', { scale: 1.0 + t * 0.1, pos: new THREE.Vector3(spot.x, 3.4, spot.z), yaw: this.CREATURE_YAW });
        if (!a) return null;
        const h = { a, spot, ph: 0, ang: 0, stop: false };
        SFX.stormRumble(0.3);
        // 선회 — 페이로드가 올 때까지 계속 돈다(대기 시간이 등급만큼 길어지는 것을 그대로 쓴다).
        // 🚨 자기 종료 안전장치 — 페이로드(강하)가 어떤 이유로든 안 오면(웨이브 정리·씬 리셋)
        //    이 재귀가 영원히 돈다. 2.6초를 넘기면 스스로 날아가 없어진다.
        const circle = () => {
            if (h.stop || !a.g.parent) return;
            if ((h.age = (h.age || 0) + 0.22) > 2.6) { h.stop = true; this.fxActorFree(a); return; }
            this.addAnim(0.22, () => {
                h.ang += 0.16; h.ph += 1.0;
                a.g.position.set(spot.x + Math.cos(h.ang) * 1.25, 3.3 + Math.sin(h.ang * 2) * 0.18, spot.z + Math.sin(h.ang) * 0.9);
                a.g.rotation.y = -h.ang + Math.PI / 2;
                this.mcFlap(a, h.ph, 0.55);
            }, circle);
        };
        circle();
        return h;
    },
    mcThunderStrike(handle, targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 2 : tier));
        const spots = this.mcSpots(targetIds);
        // 예고에서 넘어온 새가 아직 살아 있으면 그 새가 강하한다. 죽었거나(안전장치 종료) 예고가
        // 없었으면 여기서 새로 부른다 — 낙뢰가 '주인 없는 번개'가 되지 않게.
        const h = (handle && handle.a && handle.a.g && handle.a.g.parent) ? handle : this.mcThunderTell(targetIds, color, t);
        if (!h) return;
        h.stop = true;
        const a = h.a;
        const n = 2 + Math.min(2, Math.floor(t / 2));        // 커먼 2회 … 미식 4회
        const dive = (i) => {
            const spot = spots[i % spots.length];
            const top = new THREE.Vector3(spot.x + 0.2, 3.5, spot.z - 0.2);
            const low = new THREE.Vector3(spot.x, 1.0, spot.z);
            const p0 = a.g.position.clone();
            this.addAnim(0.13, k => {                        // 급강하 — 날개를 접는다
                a.g.position.lerpVectors(p0, low, k * k);
                a.g.rotation.y = Math.PI / 2;
                this.mcFlap(a, 0, 0.05 + (1 - k) * 0.3);
                if (a.P.head) a.P.head.rotation.x = 0.4 * k;
            }, () => {
                // 내리꽂기 — 하늘에서 지면까지 **블록 번개 기둥**(계단식 큐브)이 꽂힌다.
                this.mcBlockStream(new THREE.Vector3(spot.x, 4.2, spot.z), new THREE.Vector3(spot.x, 0.15, spot.z),
                    9, 0xfff07a, 130, { size: 0.19, arc: 0 });
                this.mcHit(new THREE.Vector3(spot.x, 0.7, spot.z), color, t, i === n - 1);
                SFX.stormStrike(i);
                this.addAnim(0.15, k => {                    // 상승 — 다음 강하 준비
                    a.g.position.lerpVectors(low, top, k);
                    this.mcFlap(a, k * 9, 0.8);
                    if (a.P.head) a.P.head.rotation.x = 0.4 * (1 - k);
                }, () => {
                    if (i + 1 < n) dive(i + 1);
                    else this.addAnim(0.34, k => {           // 퇴장 — 날아오른다
                        a.g.position.set(top.x - k * 1.4, top.y + k * 2.2, top.z - k * 0.8);
                        this.mcFlap(a, k * 14, 0.9);
                        a.g.scale.setScalar((1 + t * 0.1) * (1 - 0.7 * k * k));
                    }, () => this.fxActorFree(a));
                });
            });
        };
        dive(0);
    },

    // ── ⑨ 축복(heal) — 치유 천사 2체가 내려와 회복 블록을 부어 준다 ──────────────────
    mcAngelBless(color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 3 : tier));
        const hero = this.heroG.position.clone();
        SFX.healDescend(t);
        for (let i = 0; i < 2; i++) {
            const s = i ? 1 : -1;
            // 전방-우측 안전 정박대에 두 천사를 z 로 벌려 세운다 — 종전 hero.x±0.15 는 영웅 몸통 위였다.
            const at = new THREE.Vector3(hero.x + this.SUPPORT_STAGE_X + i * 0.5, 1.55, hero.z + s * 0.55);
            const a = this.fxActor('angel', { scale: 1.0 + t * 0.05, pos: new THREE.Vector3(at.x, at.y + 2.6, at.z), yaw: -s * this.CREATURE_YAW });
            if (!a) return;
            let ph = i * 2;
            this.addAnim(0.26, k => {
                const e = 1 - Math.pow(1 - k, 3);
                a.g.position.y = at.y + 2.6 * (1 - e);
                this.mcFlap(a, (ph += 0.8), 0.6);
                if (a.P.armL) a.P.armL.rotation.x = -0.7 * e;
                if (a.P.armR) a.P.armR.rotation.x = -0.7 * e;
            }, () => {
                // 은총 — 손에서 회복 블록이 영웅에게 쏟아진다(위에서 내려오는 축 유지).
                this.mcBlockStream(at, new THREE.Vector3(hero.x, 1.0, hero.z), 9, color.getHex(), 520, { size: 0.15, arc: 0.25 });
                this.mcBlockStream(at, new THREE.Vector3(hero.x, 1.0, hero.z), 5, 0xffffff, 560, { size: 0.11, arc: 0.3 });
                this.addAnim(0.55, k => {
                    this.mcFlap(a, (ph += 0.7), 0.55);
                    a.g.position.y = at.y + Math.sin(k * Math.PI * 2) * 0.09;
                }, () => this.addAnim(0.34, k => {
                    this.mcFlap(a, (ph += 1.1), 0.9);
                    a.g.position.y = at.y + k * 2.4;
                    a.g.scale.setScalar((1 + t * 0.05) * (1 - 0.8 * k * k));
                }, () => this.fxActorFree(a)));
            });
        }
    },

    // ── ⑩ 용의 아가리(breath) — 와이번이 땅을 뚫고 솟아 문다 ───────────────────────
    mcWyvernBite(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 3 : tier));
        const spots = this.mcSpots(targetIds).slice(0, 2);
        spots.forEach((spot, si) => setTimeout(() => {
            this.mcDust(spot, 9);
            SFX.stormRumble(0.26);
            const a = this.fxActor('wyvern', { scale: 1.5 + t * 0.12, pos: new THREE.Vector3(spot.x - 0.5, -2.4, spot.z - 0.15), yaw: this.CREATURE_YAW });
            if (!a) return;
            const jaw = a.P.jaw;
            SFX.mawRoar(t);
            this.addAnim(0.26, k => {                        // 융기 — 벌린 입이 먼저 나온다
                const e = 1 - Math.pow(1 - k, 3);
                a.g.position.y = -2.4 + e * 2.5;
                if (jaw) jaw.rotation.x = 0.95 * Math.min(1, k / 0.7);
                if (a.P.head) a.P.head.rotation.x = -0.5 * e;
                this.mcFlap(a, k * 7, 0.45);
            }, () => {
                this.shake(0.26 + t * 0.05);
                this.addAnim(0.14, k => {                    // 물기 — 턱이 가속으로 닫힌다
                    const c = k * k;
                    if (jaw) jaw.rotation.x = 0.95 * (1 - c);
                    if (a.P.head) a.P.head.rotation.x = -0.5 + 0.7 * c;
                    a.g.position.x = spot.x - 0.5 + c * 0.35;
                }, () => {
                    this.mcHit(new THREE.Vector3(spot.x, 0.8, spot.z), color, t, si === 0);
                    SFX.mawBite(t);
                    this.addAnim(0.36, k => {                // 침강 — 땅으로 되돌아간다
                        a.g.position.y = 0.1 - k * k * 2.6;
                        if (a.P.head) a.P.head.rotation.x = 0.2 - k * 0.5;
                    }, () => { this.fxActorFree(a); this.mcDust(spot, 5); });
                });
            });
        }, si * 150));
    },

    // ── ⑪ 처형(guillotine) — 처형인이 강림해 거대 도끼를 내려찍는다 ─────────────────
    // 🚨 절단 시각 = `GUILLOTINE_IMPACT_MS`(430ms). 무게 층이 그 시각에 동기하므로 안무를 맞춘다
    //    (선고 300 + 낙하 130).
    mcExecutioner(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 3 : tier));
        const spot = this.mcSpots(targetIds)[0];
        SFX.stormRumble(0.32);
        this.mcMeleeStrike({
            model: 'executioner', scale: 1.15 + t * 0.07, color, tier: t, big: true,
            from: new THREE.Vector3(spot.x + 1.25, 2.9, spot.z + 0.35), to: new THREE.Vector3(spot.x + 0.92, 0, spot.z + 0.35),
            faceBack: true, yaw: -this.CREATURE_YAW, drop: true,
            inMs: 300, swingMs: 130, outMs: 320, hold: 140, wind: -2.6, swing: 1.25, lunge: 0.34,
            onImpact: (hp) => {
                this.mcHit(hp, color, t, true);
                this.spawnSparks(new THREE.Vector3(spot.x, 0.25, spot.z), 14 + t * 3, 0xb9bcc2, { speed: 1.4, scale: 1.2 });
                this.mcDust(spot, 8);
                SFX.anvilHit(true);
            },
        });
    },

    // ── ⑫ 성역(aura) — 수호 석상 4기가 땅에서 솟아 영웅을 둘러싼다 ──────────────────
    // 회복계 3종의 축 구분을 유지한다: 축복은 위에서 내려오고(천사), 성역은 **아래에서 올라온다**.
    mcGuardianStatues(color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 3 : tier));
        const hero = this.heroG.position.clone();
        SFX.auraRise(t);
        // 성역 원진을 **영웅 앞(+x)** 으로 통째로 밀어 세운다 — 종전엔 영웅을 감싸는 원이라
        // 석상 4기 중 2기가 영웅/탈것 위에 섰다. 원 중심을 SUPPORT_STAGE 너머로 옮기고 반경(rx 0.85)을
        // 줄여, 가장 가까운 석상(cx−rx)도 영웅 우단(1.12)을 비킨다: 2.65−0.85=1.80.
        const cx = hero.x + this.SUPPORT_STAGE_X + 0.5;
        for (let i = 0; i < 4; i++) {
            const ang = Math.PI / 4 + i * Math.PI / 2;
            const at = new THREE.Vector3(cx + Math.cos(ang) * 0.85, 0, hero.z + Math.sin(ang) * 0.8);
            setTimeout(() => {
                const a = this.fxActor('statue', { scale: 0.95 + t * 0.05, pos: new THREE.Vector3(at.x, -1.9, at.z), yaw: Math.atan2(hero.x - at.x, hero.z - at.z) });
                if (!a) return;
                this.addAnim(0.22, k => {
                    const e = 1 - Math.pow(1 - k, 3);
                    a.g.position.y = -1.9 + e * 1.9;
                    if (a.P.armL) a.P.armL.rotation.x = -1.5 * e;   // 두 팔을 영웅 쪽으로 든다
                    if (a.P.armR) a.P.armR.rotation.x = -1.5 * e;
                }, () => {
                    this.mcDust(at, 5);
                    // 가호 — 석상마다 영웅에게 블록을 흘려보낸다(성역이 '작동 중'임을 계속 보여 준다).
                    this.mcBlockStream(new THREE.Vector3(at.x, 1.1, at.z), new THREE.Vector3(hero.x, 1.0, hero.z), 6, color.getHex(), 640, { size: 0.13 });
                    this.addAnim(0.62, k => { a.g.position.y = Math.sin(k * Math.PI * 2) * 0.04; },
                        () => this.addAnim(0.3, k => { a.g.position.y = -k * k * 2.0; }, () => this.fxActorFree(a)));
                });
            }, i * 70);
        }
    },

    // ── ⑬ 초신성(nova) — 성좌 로봇이 강림해 웅크렸다가 폭발한다 ─────────────────────
    // 🚨 폭발 시각 = `NOVA_IMPACT_MS`(560ms) — 강림 200 + 응축 360.
    mcStarBotNova(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 4 : tier));
        const spot = this.mcSpots(targetIds)[0];
        const at = new THREE.Vector3(spot.x - 0.2, 0, spot.z);
        const a = this.fxActor('starbot', { scale: 1.2 + t * 0.08, pos: new THREE.Vector3(at.x, 3.3, at.z), yaw: this.CREATURE_YAW });
        if (!a) return;
        const s0 = 1.2 + t * 0.08;
        SFX.stormRumble(0.4);
        this.addAnim(0.2, k => {                             // 강림
            a.g.position.y = 3.3 * (1 - k * k);
            if (a.P.armL) a.P.armL.rotation.x = -0.4 * k;
            if (a.P.armR) a.P.armR.rotation.x = -0.4 * k;
        }, () => {
            this.mcDust(at, 10); this.shake(0.2 + t * 0.04);
            this.addAnim(0.36, k => {                        // 응축 — 웅크리고 팔을 가슴으로 모은다
                const e = k * k;
                a.g.scale.set(s0 * (1 + 0.1 * e), s0 * (1 - 0.22 * e), s0 * (1 + 0.1 * e));
                if (a.P.armL) a.P.armL.rotation.x = -0.4 - 2.0 * e;
                if (a.P.armR) a.P.armR.rotation.x = -0.4 - 2.0 * e;
                if (a.P.legL) a.P.legL.rotation.x = 0.5 * e;
                if (a.P.legR) a.P.legR.rotation.x = -0.5 * e;
                if (a.P.core) a.P.core.scale.setScalar(1 + e * 1.6);
                if (a.P.head) a.P.head.rotation.x = 0.35 * e;
            }, () => {
                // 폭발 — 팔을 벌리며 몸의 블록이 사방으로 흩어진다. 링이 아니라 **파편**이다.
                this.mcHit(new THREE.Vector3(at.x, 1.1, at.z), color, t, true);
                this.spawnSparks(new THREE.Vector3(at.x, 1.2, at.z), 30 + t * 6, 0xffd98a, { speed: 2.2 + t * 0.2, scale: 1.4 });
                this.shake(0.4 + t * 0.06);
                for (let i = 0; i < 6; i++) {
                    const b = this.fxActor('fireblock', { scale: 0.55, pos: new THREE.Vector3(at.x, 1.2, at.z), yaw: 0 });
                    if (!b) break;
                    const dir = new THREE.Vector3(Math.cos(i * 1.05), U.rand(0.3, 1.0), Math.sin(i * 1.05) * 0.7).normalize().multiplyScalar(2.4 + t * 0.2);
                    const q0 = b.g.position.clone();
                    this.addAnim(0.5, k => {
                        b.g.position.set(q0.x + dir.x * k, Math.max(0.15, q0.y + dir.y * k - k * k * 2.2), q0.z + dir.z * k);
                        b.g.rotation.set(k * 8, k * 6, k * 4);
                        b.g.scale.setScalar(0.55 * (1 - 0.7 * k));
                    }, () => this.fxActorFree(b));
                }
                this.addAnim(0.22, k => {                    // 로봇 본체는 부서지며 사라진다
                    a.g.scale.setScalar(s0 * (1 + k * 0.5) * (1 - k));
                    a.g.position.y = k * 0.4;
                    if (a.P.armL) a.P.armL.rotation.x = -2.4 + 3.0 * k;
                    if (a.P.armR) a.P.armR.rotation.x = -2.4 + 3.0 * k;
                }, () => this.fxActorFree(a));
            });
        });
    },

    // ── ⑭ 공허의 창(voidrift) — 공허 기사가 균열에서 걸어 나와 창으로 관통한다 ────────
    // 🚨 관통 시각 = `VOIDRIFT_IMPACT_MS`(540ms) — 융기 300 + 겨눔 140 + 찌르기 100.
    mcVoidKnight(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 4 : tier));
        const spot = this.mcSpots(targetIds)[0];
        const at = new THREE.Vector3(spot.x + 1.35, 0, spot.z + 0.25);
        SFX.voidTear(t);
        // 균열 — 검은 블록이 땅에서 솟아 갈라진다(추상 찢김 대신 블록으로).
        this.spawnSparks(new THREE.Vector3(at.x, 0.2, at.z), 12 + t * 2, 0x2a1f44, { speed: 1.0, scale: 1.2 });
        const a = this.fxActor('voidknight', { scale: 1.05 + t * 0.06, pos: new THREE.Vector3(at.x, -2.2, at.z), yaw: -this.CREATURE_YAW });
        if (!a) return;
        this.addAnim(0.3, k => {                             // 융기 — 창끝이 먼저 올라온다
            const e = 1 - Math.pow(1 - k, 3);
            a.g.position.y = -2.2 + e * 2.2;
            if (a.P.armR) a.P.armR.rotation.x = -0.9 * e;
        }, () => {
            this.mcDust(at, 6);
            this.addAnim(0.14, k => {                        // 겨눔 — 창을 뒤로 당긴다
                if (a.P.armR) a.P.armR.rotation.x = -0.9 - 0.55 * k;
                a.g.position.x = at.x + k * 0.18;
            }, () => {
                this.addAnim(0.1, k => {                     // 관통 — 몸째로 찌른다
                    const e = k * k;
                    if (a.P.armR) a.P.armR.rotation.x = -1.45 + 1.35 * e;
                    a.g.position.x = at.x + 0.18 - e * 0.95;
                }, () => {
                    const hp = new THREE.Vector3(spot.x, 0.85, spot.z);
                    this.mcHit(hp, color, t, true);
                    SFX.voidPierce(t);
                    this.spawnSparks(hp, 16 + t * 3, 0xb98cff, { speed: 1.6, scale: 1.2 });
                    setTimeout(() => this.addAnim(0.34, k => {   // 균열로 되돌아간다
                        a.g.position.y = -k * k * 2.4;
                        a.g.position.x = at.x - 0.77 + k * 0.5;
                    }, () => { this.fxActorFree(a); SFX.voidSnap(); }), 160);
                });
            });
        });
    },

    // ── ⑮ 시간 왜곡(timewarp) — 태엽 로봇이 나타나 열쇠를 감는다 ────────────────────
    mcClockBot(color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 4 : tier));
        const hero = this.heroG.position.clone();
        // 전방-우측 안전 정박대 — 종전 hero.x−0.85·z+0.9 는 앞줄 펫 자리([-1.05,1.15]) 위였다.
        // 기어가 봇 둘레 r0.8 로 도므로 봇을 +0.3 더 밀어 가장 안쪽 기어(at.x−0.8)도 영웅 우단을 비킨다.
        const at = new THREE.Vector3(hero.x + this.SUPPORT_STAGE_X + 0.3, 0, hero.z + 0.2);
        const a = this.fxActor('clockbot', { scale: 1.0 + t * 0.05, pos: new THREE.Vector3(at.x, 2.4, at.z), yaw: this.CREATURE_YAW });
        if (!a) return;
        SFX.auraRise(t);
        this.addAnim(0.18, k => { a.g.position.y = 2.4 * (1 - k * k); }, () => {
            this.mcDust(at, 5);
            // 태엽 감기 — 열쇠(weapon)가 돌고, 시침(body 앞면 칠)이 도는 대신 **기어 블록**이
            // 영웅 둘레를 역행한다. 시간이 '거꾸로 간다'를 실체로 보여 주는 자리.
            const gears = [];
            for (let i = 0; i < 5; i++) {
                const g = this.fxActor('shuriken', { scale: 0.85, pos: new THREE.Vector3(at.x, 1.1, at.z), yaw: 0 });
                if (!g) break;
                gears.push({ g, a0: (i / 5) * Math.PI * 2 });
            }
            this.addAnim(0.9, k => {
                if (a.P.weapon) a.P.weapon.rotation.z = -k * 22;    // 열쇠가 감긴다
                if (a.P.armR) a.P.armR.rotation.x = -1.2 - Math.sin(k * Math.PI * 4) * 0.3;
                if (a.P.head) a.P.head.rotation.y = Math.sin(k * Math.PI * 2) * 0.3;
                for (const gr of gears) {
                    const ang = gr.a0 - k * 6.0;                    // 역행(-) — 시간 왜곡의 부호
                    // 기어는 **시계봇 둘레**를 돈다(종전엔 영웅 둘레라 영웅/탈것/펫을 관통했다).
                    gr.g.g.position.set(at.x + Math.cos(ang) * 0.8, 0.6 + ((gr.a0 / 6.28) * 1.2), at.z + Math.sin(ang) * 0.65);
                    gr.g.g.rotation.set(1.35, -k * 9, 0);
                    gr.g.g.scale.setScalar(0.85 * (1 - 0.35 * k));
                }
            }, () => {
                gears.forEach(gr => this.fxActorFree(gr.g));
                this.addAnim(0.3, k => { a.g.position.y = -k * k * 2.4; }, () => this.fxActorFree(a));
            });
        });
    },

    // ── ⑯ 종말의 화룡(dragonfire) — 거대 화룡이 날아와 브레스를 뿜는다 ──────────────
    // 🚨 첫 착탄 = `DRAGONFIRE_IMPACT_MS`(820ms) — 강림 340 + 예비 240 + 브레스 240.
    //    와이번(⑩)과 **덩치·비행·꼬리**로 갈린다. 둘 다 용이라 여기서 안 갈리면 스킬이 겹친다.
    mcFireDragon(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 5 : tier));
        const spots = this.mcSpots(targetIds);
        const hero = this.heroG.position.clone();
        // 전방-우측 상공에 정박 — 종전 hero.x−1.1 은 영웅/펫 위 상공이라 위에서 덮어 가렸다.
        // 화룡은 적(+x)을 향해 브레스를 뿜으므로 앞쪽 정박이 안무상으로도 자연스럽다.
        // ⚠️ 화룡은 몸이 길어(scale ~1.5) 꼬리가 −x 로 뻗는다 — 정박점을 +1.2 더 밀어 꼬리 끝도 영웅을 비킨다.
        const at = new THREE.Vector3(hero.x + this.SUPPORT_STAGE_X + 1.2, 2.5, hero.z - 0.4);
        const a = this.fxActor('firedragon', { scale: 1.25 + t * 0.05, pos: new THREE.Vector3(at.x + 4.0, 3.4, at.z - 2.0), yaw: this.CREATURE_YAW });
        if (!a) return;
        let ph = 0;
        SFX.mawRoar(t);
        this.addAnim(0.34, k => {                            // 강림 — 화면 밖(우측 상공)에서 날아 들어온다
            const e = 1 - Math.pow(1 - k, 3);
            a.g.position.set(at.x + 4.0 * (1 - e), 3.4 - 1.0 * e, at.z - 2.0 * (1 - e));
            this.mcFlap(a, (ph += 0.9), 0.62);
            if (a.P.tail) a.P.tail.rotation.y = Math.sin(ph * 0.6) * 0.3;
        }, () => {
            this.shake(0.22 + t * 0.04);
            this.addAnim(0.24, k => {                        // 예비 — 고개를 젖히고 목구멍을 채운다
                this.mcFlap(a, (ph += 0.7), 0.5);
                if (a.P.head) a.P.head.rotation.x = -0.7 * k;
                if (a.P.jaw) a.P.jaw.rotation.x = 0.2 * k;
                a.g.position.y = 2.5 + Math.sin(k * Math.PI) * 0.18;
            }, () => {
                SFX.mawBite(t);
                // 브레스 — **불덩이 블록의 줄기**가 적 전열을 근→원 순서로 훑는다.
                const mouth = new THREE.Vector3(at.x + 1.1, 2.75, at.z + 0.55);
                this.addAnim(0.46, k => {
                    this.mcFlap(a, (ph += 0.5), 0.35);
                    if (a.P.head) a.P.head.rotation.x = -0.7 + 1.15 * Math.min(1, k * 2.2);
                    if (a.P.jaw) a.P.jaw.rotation.x = 0.2 + 0.85 * Math.min(1, k * 2.2);
                }, () => { if (a.P.jaw) a.P.jaw.rotation.x = 0.2; if (a.P.head) a.P.head.rotation.x = 0; });
                spots.slice(0, 4).forEach((spot, si) => setTimeout(() => {
                    const b = this.fxActor('fireblock', { scale: 1.0 + t * 0.08, pos: mouth.clone(), yaw: 0 });
                    if (!b) return;
                    const p1 = new THREE.Vector3(spot.x, 0.7, spot.z);
                    this.addAnim(0.2, k => {
                        b.g.position.lerpVectors(mouth, p1, k);
                        b.g.rotation.set(k * 7, k * 5, k * 3);
                        b.g.scale.setScalar((1 + t * 0.08) * (1 + k * 0.5));
                    }, () => {
                        this.fxActorFree(b);
                        this.mcHit(p1, color, t, si === 0);
                        this.spawnSparks(p1, 14 + t * 3, 0xff8a2b, { speed: 1.5, scale: 1.2 });
                        SFX.stormStrike(si);
                    });
                }, 180 + si * 110));
                // 퇴장 — 날아 나간다(등장과 반대 방향).
                setTimeout(() => this.addAnim(0.42, k => {
                    this.mcFlap(a, (ph += 1.2), 0.85);
                    a.g.position.set(at.x + k * 3.2, 2.5 + k * 2.4, at.z - k * 1.6);
                    a.g.scale.setScalar((1.25 + t * 0.05) * (1 - 0.55 * k * k));
                }, () => this.fxActorFree(a)), 640);
            });
        });
    },

    // ── ⑰ 신의 창(spear) — 천상 기사가 강하해 황금 창을 꽂는다 ─────────────────────
    // 🚨 착탄 = `GODSPEAR_IMPACT_MS`(500ms) — 개천 300 + 낙하 200. 공허 기사(⑭)와 같은 섀시라
    //    **날개·금색·하늘에서 온다**로 갈랐다.
    mcSpearKnight(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 5 : tier));
        const spot = this.mcSpots(targetIds)[0];
        const at = new THREE.Vector3(spot.x + 1.15, 0, spot.z + 0.2);
        const a = this.fxActor('spearknight', { scale: 1.1 + t * 0.06, pos: new THREE.Vector3(at.x + 0.5, 3.6, at.z - 0.4), yaw: -this.CREATURE_YAW });
        if (!a) return;
        let ph = 0;
        SFX.healDescend(t);
        this.addAnim(0.3, k => {                             // 개천 — 날개를 펴고 떠 있다가
            a.g.position.y = 3.6 - k * 0.9;
            this.mcFlap(a, (ph += 0.8), 0.7);
            if (a.P.armR) a.P.armR.rotation.x = -0.6 - 0.8 * k;   // 창끝을 아래로 겨눈다
        }, () => {
            this.addAnim(0.2, k => {                         // 낙하 — 창을 앞세우고 내리꽂는다
                const e = k * k;
                a.g.position.set(at.x + 0.5 * (1 - e), 2.7 * (1 - e), at.z - 0.4 * (1 - e));
                this.mcFlap(a, (ph += 0.4), 0.25);
                if (a.P.armR) a.P.armR.rotation.x = -1.4 + 1.9 * e;
            }, () => {
                const hp = new THREE.Vector3(spot.x, 0.8, spot.z);
                this.mcHit(hp, color, t, true);
                this.spawnSparks(hp, 20 + t * 4, 0xf0c33c, { speed: 1.9, scale: 1.35 });
                this.mcDust(at, 10);
                this.shake(0.34 + t * 0.05);
                SFX.anvilHit(true);
                setTimeout(() => this.addAnim(0.4, k => {    // 퇴장 — 날아오른다
                    this.mcFlap(a, (ph += 1.3), 0.95);
                    a.g.position.set(at.x + k * 0.6, k * k * 4.0, at.z - k * 0.5);
                    a.g.scale.setScalar((1.1 + t * 0.06) * (1 - 0.7 * k * k));
                    if (a.P.armR) a.P.armR.rotation.x = 0.5 - k * 1.2;
                }, () => this.fxActorFree(a)), 220);
            });
        });
    },

    // ── ⑱ 신성한 가호(wardshield) — 방패 골렘이 영웅 앞에 방패를 세운다 ──────────────
    // 사용자 예시 "대장장이 골렘이 방패를 세워 준다" 그대로.
    mcShieldGolem(color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 5 : tier));
        const hero = this.heroG.position.clone();
        // 전방-우측 안전 정박대(다른 지원 소환체와 통일) — 종전 hero.x+0.95(world 1.30)는 영웅 우단
        // (1.12)에 골렘 폭이 걸쳤다. −0.35 만 당겨 '영웅 앞'을 유지하면서 우단을 넉넉히 비킨다.
        const at = new THREE.Vector3(hero.x + this.SUPPORT_STAGE_X - 0.35, 0, hero.z + 0.15);
        const a = this.fxActor('shieldgolem', { scale: 1.05 + t * 0.05, pos: new THREE.Vector3(at.x, -2.4, at.z), yaw: this.CREATURE_YAW });
        if (!a) return;
        SFX.auraRise(t);
        this.addAnim(0.24, k => {                            // 융기
            const e = 1 - Math.pow(1 - k, 3);
            a.g.position.y = -2.4 + e * 2.4;
            if (a.P.armL) a.P.armL.rotation.x = -0.5 * e;
        }, () => {
            this.mcDust(at, 8);
            this.addAnim(0.14, k => {                        // 방패를 앞으로 내려 세운다
                if (a.P.armL) a.P.armL.rotation.x = -0.5 + 0.5 * k * k;
                if (a.P.armR) a.P.armR.rotation.x = -0.8 * k;
            }, () => {
                this.shake(0.2 + t * 0.03);
                this.mcDust(at, 6);
                SFX.anvilHit(false);
                // 가호 — 방패에서 영웅에게 금색 블록이 흐른다(버프가 붙었다는 시각 증거).
                this.mcBlockStream(new THREE.Vector3(at.x, 1.2, at.z), new THREE.Vector3(hero.x, 1.05, hero.z), 8, 0xf0c33c, 560, { size: 0.15 });
                this.addAnim(0.7, k => { a.g.position.y = Math.sin(k * Math.PI * 3) * 0.03; },
                    () => this.addAnim(0.34, k => { a.g.position.y = -k * k * 2.6; }, () => this.fxActorFree(a)));
            });
        });
    },
    });
})();
