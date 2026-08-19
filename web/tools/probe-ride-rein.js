// 사족·비행형 탑승에서 **손이 고삐를 쥐고 있는가** — 대기와 공격 중을 같은 자로 잰다.
// 사용: node probe-ride-rein.js
//
// 왜 필요한가: 비평가가 3·4차 채점에서 매번 상위로 올린 지적이 "손이 아무것도 안 잡는다"(㉢)인데,
//   자전거(핸들바)와 달리 사족·비행형은 **잡을 물건 자체가 없었다**. 굴레·재갈·고삐를 새로 만들고
//   `alignReins` 가 매 프레임 빈 손까지 끈을 늘이는데, 이게 실제로 손에 닿는지·팔이 그 자세로
//   서는지는 눈대중으로 못 본다(끈이 얇아 스크린샷에서도 헷갈린다).
//
// 판정 6가지 — 하나라도 깨지면 '고삐를 몰고 있다'로 안 읽힌다:
//   ① 고삐가 실재한다(userData.rein, 계열 전 종).
//   ② 끈 끝이 빈 손에 있다(거리 ≤ TIP_TOL). **대기·공격 양쪽**에서 — 고삐는 끈이라 핸들바와 달리
//      공격 중에도 손을 따라가야 한다(멈추면 끈만 허공에 굳는다).
//   ③ 빈 손이 **몸 앞·안장 위**에 있다(영웅 로컬). 끈이 손을 따라오므로 손이 옆구리에 늘어져 있으면
//      고삐가 뒤로 처져 '몰고 있다'가 안 된다 — 여기가 실제 게이트다.
//   ④ 고삐 길이가 사람이 쥔 길이다(재갈↔손이 상체 길이의 0.2~4배). 0에 가까우면 재갈을 손으로
//      쥔 꼴이고, 너무 길면 끈이 화면을 가로지른다.
//   ⑤ 끈이 **근쪽(카메라 쪽) 다리를 가리지 않는다**. 먼 다리는 안 본다 — 재갈↔손 직선은 카메라에서
//      먼 다리로 가는 시선 띠(z 0.4 부근)를 구조적으로 지나고, 실제 승마 사진에서도 고삐는 말 반대쪽을
//      가로지른다. 반면 근쪽 다리는 이 항목의 합격 기준("다리가 몸통을 감싸고")이 걸린 자리라 0 이어야 한다.
//   ⑥ **공격 중에도** 손이 ③의 구역에 남아 있다(빈 팔이 고삐를 놓지 않는가 — `holdBarGrip`).
//
// ⚠️ ②는 **구조적으로 통과하는 지표**다(끈 끝이 매 프레임 손을 좇으므로) — 깨진 걸 잡는 회귀 그물일 뿐
//    합격의 근거가 아니다. 진짜 게이트는 ③·⑤와, 공격 중에도 빈 팔이 그 자세를 유지하는가(⑥)다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TIP_TOL = 0.18;    // 월드 단위 — 주먹 반경 + 끈 반폭 여유
const MOUNTS = [['quad', 'Brown Horse'], ['quad', 'Elk'], ['quad', 'Camel'], ['quad', 'Mech Spider'],
    ['fly', 'Mini Dragon'], ['fly', 'Star Whale'], ['fly', 'Giant Bee']];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 60000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const out = await page.evaluate((list) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const res = [];

        const measure = () => {
            const g = Scene3D.mountGroup, rig = Scene3D.heroRig, hero = Scene3D.heroG;
            hero.updateWorldMatrix(true, true); g.updateWorldMatrix(true, true);
            const rein = g.userData.rein;
            if (!rein) return { has: false };
            const weaponHand = (Scene3D.gripOf(Scene3D.wtypeId) || {}).hand === 'L' ? 'L' : 'R';
            const free = weaponHand === 'L' ? 'R' : 'L';
            const hand = free === 'L' ? rig.handL : rig.handR;
            const hp = hand.getWorldPosition(V(0, 0, 0));
            // 끈 끝 = 마지막 분절의 위쪽 끝(로컬 +Y 반길이). 박스 높이가 1이라 배율의 절반이 반길이다.
            let tip = Infinity, bitLen = 0;
            for (const st of rein.straps) {
                const seg = st.segs[1];
                const end = seg.localToWorld(V(0, 0.5, 0));
                tip = Math.min(tip, hp.distanceTo(end));
                const inner = g.children[0];
                const bitW = inner.localToWorld(st.anchor.clone());
                bitLen = Math.max(bitLen, bitW.distanceTo(hp));
            }
            // 손이 몸 앞·안장 위인가 — 영웅 로컬(z+ = 영웅이 보는 앞)
            const hl = hero.worldToLocal(hp.clone());
            const pelvis = rig.bones.pelvis.getWorldPosition(V(0, 0, 0));
            const pl = hero.worldToLocal(pelvis.clone());
            const head = rig.bones.head ? hero.worldToLocal(rig.bones.head.getWorldPosition(V(0, 0, 0))) : { y: pl.y + 0.8 };
            // ⑤ 근쪽(L) 다리를 끈이 가리는가 — probe-ride-clear 와 같은 카메라·같은 검사점.
            const cam = Scene3D.camera; cam.updateMatrixWorld(true);
            const camPos = cam.getWorldPosition(V(0, 0, 0));
            const rc = new THREE.Raycaster();
            const reinSet = new Set(); for (const st of rein.straps) for (const sg of st.segs) reinSet.add(sg);
            const hip = rig.bones.hipL, knee = rig.bones.kneeL;
            const targets = [];
            for (let i = 0; i < 3; i++) targets.push([hip, V(0, -0.33 * (0.4 + 0.3 * i), 0)]);
            for (let i = 0; i <= 3; i++) targets.push([knee, V(0, -0.315 * i / 3, 0.045 * i / 3)]);
            let nearHit = 0;
            for (const [bone, off] of targets) {
                const wp = bone.localToWorld(off.clone());
                const dir = wp.clone().sub(camPos), dist = dir.length();
                rc.set(camPos, dir.normalize()); rc.far = dist - 0.02;
                if (rc.intersectObject(g, true).some(h => h.object.visible && reinSet.has(h.object))) nearHit++;
            }
            // ⑥ 빈 팔이 고삐 자세를 유지하는가 — 공격(once) 클립은 양팔을 전부 정의하므로
            //    `holdBarGrip` 이 안 돌면 여기서 각이 튄다(대기와 비교해 판정).
            const arm = { sh: +rig.bones['shoulder' + free].rotation.x.toFixed(3), el: +rig.bones['elbow' + free].rotation.x.toFixed(3) };
            return {
                has: true, free, tip: +tip.toFixed(3), reinLen: +bitLen.toFixed(3),
                handZ: +(hl.z - pl.z).toFixed(3), handY: +(hl.y - pl.y).toFixed(3),
                torso: +(head.y - pl.y).toFixed(3), once: !!rig._once, nearHit, n: targets.length, arm,
            };
        };

        for (const [form, name] of list) {
            S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = name;
            Scene3D.refreshMount();
            for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
            const idle = measure();
            // 공격 클립을 **실제 전투 경로로** 태운다 — heroPlay 만으로는 `_attacking` 이 안 서서
            // update 가 다음 프레임에 Idle 로 되돌린다(probe-ride-hands 가 밟은 함정).
            Scene3D.clearEnemies();
            const e = { id: 951, x: Combat.MELEE_X, alive: true, hp: Big.of(1e6), maxHp: Big.of(1e6), isBoss: false, kind: 'goblin' };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
            Scene3D.anims = [];
            const m = Scene3D.enemyMap.get(951);
            m.g.position.set(e.x + Scene3D.worldX, 0, 0);
            m.g.userData.landed = true;
            Combat.phase = 'fight';
            Scene3D.heroAttack(951);
            const atk = [];
            for (let i = 0; i < 32; i++) { Scene3D.update(1 / 60); if (i % 8 === 7) atk.push(measure()); }
            Scene3D.clearEnemies(); Combat.enemies = [];
            res.push({ form, name, idle, atk });
        }
        return res;
    }, MOUNTS);

    console.log('고삐 파지 실측 — ① 고삐 존재 ② 끈 끝↔빈 손 ≤ ' + TIP_TOL + ' ③ 손이 몸 앞·골반 위 ④ 고삐 길이\n');
    let bad = 0;
    for (const r of out) {
        const i = r.idle;
        if (!i.has) { console.log(`  ${r.name.padEnd(14)} ⚠️ 고삐 없음(userData.rein)`); bad++; continue; }
        const atkWorst = Math.max(...r.atk.map(a => a.tip));
        const once = r.atk.filter(a => a.once);
        const onceOK = once.length > 0;
        // ③ 손이 골반보다 앞(z)·위(y)이고, 상체 높이를 넘지 않는다
        const poseOK = i.handZ > 0.05 && i.handY > 0.02 && i.handY < i.torso;
        // ④ 고삐 길이 — 몸통(골반↔머리) 길이를 자로 삼는다
        const lenOK = i.reinLen > i.torso * 0.2 && i.reinLen < i.torso * 4.0;
        // ⑤ 근쪽 다리 가림 0
        const nearOK = i.nearHit === 0 && r.atk.every(a => a.nearHit === 0);
        // ⑥ 공격 중에도 손이 고삐를 쥔 자리(몸 앞·골반 위)에 남아 있는가.
        //    ⚠️ **팔 각이 대기와 똑같기를 요구하면 안 된다** — 첫 판에서 그렇게 걸었더니 7종 전부
        //    불합격인데 정작 손은 앞·위 그대로였다(이탈 0.165rad ≈ 9°). 핸들바는 강체라 각이 흔들리면
        //    손이 바에서 떨어지지만, 고삐는 끈이라 손을 따라간다 — 각이 조금 흔들리는 건 오히려 자연스럽다.
        //    판정해야 하는 건 '각이 고정됐는가'가 아니라 **손이 고삐를 쥔 구역을 벗어났는가**다.
        const atkPose = once.length ? once.every(a => a.handZ > 0.05 && a.handY > 0.02 && a.handY < a.torso) : false;
        const armWorst = Math.max(0, ...once.map(a => Math.max(Math.abs(a.arm.sh - i.arm.sh), Math.abs(a.arm.el - i.arm.el))));
        const armOK = onceOK && atkPose;
        const ok = i.tip <= TIP_TOL && atkWorst <= TIP_TOL && poseOK && lenOK && nearOK && armOK;
        if (!ok) bad++;
        console.log(`  ${r.name.padEnd(14)} 끈끝 대기 ${String(i.tip).padStart(6)}/공격 ${String(+atkWorst.toFixed(3)).padStart(6)}` +
            `  손(앞 ${String(i.handZ).padStart(6)} 위 ${String(i.handY).padStart(6)}/상체 ${i.torso})  고삐 ${String(i.reinLen).padStart(6)}` +
            `  근쪽가림 ${i.nearHit}/${i.n}  공격중 손(앞 ${Math.min(...once.map(a => a.handZ)).toFixed(3)} 위 ${Math.min(...once.map(a => a.handY)).toFixed(3)}, 팔각 이탈 ${armWorst.toFixed(3)})` +
            `  ${ok ? 'OK' : '⚠️ ' + [i.tip > TIP_TOL ? '대기 이탈' : '', atkWorst > TIP_TOL ? '공격 중 끈 이탈' : '', !poseOK ? '손 자세' : '', !lenOK ? '끈 길이' : '', !nearOK ? '근쪽 다리 가림' : '', !armOK ? '공격 중 팔이 고삐를 놓음' : ''].filter(Boolean).join('·')}` +
            `${onceOK ? '' : '   (once 클립 아님 — 공격이 안 걸렸다)'}`);
    }
    console.log(bad === 0 ? '\n전부 통과' : `\n불합격 ${bad}종`);
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
