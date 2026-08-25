// 탑승 가림·간섭 실측 — 인계 메모의 '남은 진짜 숙제' ②③④를 눈대중이 아니라 수치로 판정한다.
// 사용: node probe-ride-clear.js
// 재는 것:
//  ② 카메라 → 영웅 양쪽 무릎/발 레이캐스트: 첫 히트가 탈것 파츠면 '반대쪽 다리가 가려짐'.
//     (기존 probe-ride-fit는 다리가 몸통 '밖'에 있는지만 재서, 머리·목이 앞에서 가리는 건 못 잡는다.)
//  ③ 공격(once) 클립 중 hip/knee 회전이 탑승 포즈를 유지하는가 — 대기 프레임 값과 비교.
//     restPose가 once 클립에서 통째로 꺼지면 다리가 펴져 '안장에서 미끄러진' 프레임이 나온다.
//  ④ 자전거 핸들바·그립 ↔ 영웅 다리/몸통 최단거리 — 0 이하면 관통.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MOUNTS = [['flat', 'Hover Board'], ['wheeled', 'Bike'], ['fly', 'Mini Dragon'], ['quad', 'Brown Horse'],
    // 로스터 확장(2026-08-18)으로 들어온 종 — 머리·뿔·혹처럼 **안장 앞에 서는 파츠**가 붙은 것만 골랐다.
    // 그런 파츠가 먼 쪽 다리를 가리는 게 이 검사의 표적이라, 계열 대표 1종만 보면 새 종을 통째로 놓친다.
    ['quad', 'Elk'], ['quad', 'Armored Rhino'], ['quad', 'Camel'], ['quad', 'Mech Spider'],
    // 게는 `mount-species-recognizable` 로 **몸통 폭이 배럴의 두 배(등딱지 반폭 0.36)** 가 됐고
    // 눈자루가 안장 앞에 선다 — 이 검사의 표적 그 자체라 반드시 넣는다.
    // (당나귀는 아래 줄에 이미 있다 — 같은 항목에서 긴 목 계열로 옮겼으니 그 항목이 그대로 표적이다.)
    // 거북도 같은 항목 ② 에서 **돔이 안장 높이까지 올라왔다** — 안장을 삼키면 그게 곧 결함이라 넣는다.
    ['quad', 'Crab'], ['quad', 'Turtle'],
    // ③ 에서 얼굴·머리 위에 새 파츠가 붙은 종 — 염소 뿔·양 뿔·돼지 귀·멧돼지 목 갈기.
    // 전부 `HEADPART` 라 이 검사의 표적이다(특히 멧돼지 갈기는 머리 위에 세운 가시 여섯이다).
    ['quad', 'Goat'], ['quad', 'Sheep'], ['quad', 'Pig'], ['quad', 'Boar'],
    // ④ 에서 머리·목 위에 새 파츠가 붙은 종 — 공룡 목 골판 6장(시선 띠 바로 아래를 지난다)·
    // 흑표범 고양이 귀. (알파카·낙타는 아래 줄에 이미 있다.)
    ['quad', 'Dino'], ['quad', 'Panther'],
    // ⑤ 에서 머리에 겹눈·더듬이가 붙은 거대 벌(비행형 중 유일하게 목록에 없던 종).
    ['fly', 'Giant Bee'],
    ['fly', 'Star Whale'], ['flat', 'Hover Disk'],
    // 로스터 교체(2026-08-19 mount-animal-machine-dynamic ①)로 들어온 종 중 **안장 앞에 뭔가 서는** 셋.
    // 당나귀=긴 귀, 알파카=긴 목, 태엽 딱정벌레=더듬이 — 전부 이 검사의 표적 형상이라 빠지면 안 된다.
    ['quad', 'Donkey'], ['quad', 'Alpaca'], ['quad', 'Clockwork Beetle'],
    // 로스터 추가(2026-08-19 `mount-roster-add5`)로 들어온 4종 — 넷 다 이 검사의 표적이다.
    // 익룡=안장 앞의 긴 부리·볏 + 몸통보다 넓은 막날개, 두발 로봇=앞으로 내민 센서 헤드(신설 biped 계열),
    // 덤프트럭=영웅 옆의 바퀴 4개, 청소로봇=영웅 발밑까지 퍼진 원반.
    ['fly', 'Pterosaur'], ['biped', 'Bipedal Mech'], ['wheeled', 'Dump Truck'], ['wheeled', 'Cleaning Robot']];

// 종 이름을 인자로 주면 그 종만 본다 — 전체 20종은 이 소프트웨어 렌더 컨테이너에서 20분+ 걸려,
// 한 종을 고치고 확인하는 루프가 통째로 막힌다(2026-08-20 실측: 한 판 돌리는 데 25분).
// ⚠️ **커밋 전 최종 확인은 반드시 인자 없이 전종으로** 할 것 — 한 종만 보고 넘어가면 다른 종에
//    난 회귀를 못 잡는다. 인자는 고치는 도중의 빠른 되먹임용이다.
const ONLY = process.argv.slice(2);
const TARGETS = ONLY.length ? MOUNTS.filter(([, n]) => ONLY.includes(n)) : MOUNTS;
if (ONLY.length && !TARGETS.length) { console.log('그런 종이 목록에 없다: ' + ONLY.join(', ')); process.exit(3); }

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && !!Scene3D.heroG', { timeout: 180000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const out = await page.evaluate((list) => {
        Combat.tick = () => { };
        // ⚠️ 탈것 부유 위상이 난수라 프레임 자세가 매번 달라지고, 그러면 **같은 코드가 실행마다 다른
        //    가림 수치**를 낸다(2026-08-18: thighR 33% / shinR 25% / 둘 다가 번갈아 나왔고, 그 흔들림
        //    때문에 멀쩡한 변경을 범인으로 오진했다). 엔진이 열어 둔 훅으로 고정하고 잰다.
        Scene3D.ridePhase = 0;
        Scene3D.clearEnemies(); Combat.enemies = [];
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const res = [];

        // 탈것 파츠인지 — 조상 사슬에 mountGroup 이 있으면 탈것
        const isMountPart = (o) => { for (let p = o; p; p = p.parent) if (p === Scene3D.mountGroup) return true; return false; };
        // 🔎 맞은 파츠의 **이름**을 찾는다. `Mobs.build` 가 메시엔 pid 를, 피벗이 있으면 그 위 Group 에도
        //    같은 pid 를 찍어 둔다. 'head' 표식은 **피벗 Group 쪽에만** 붙는 경우가 있어 조상까지 훑는다.
        //    (좌표만 찍던 옛 판은 "머리인가 부리인가 몸통인가" 를 못 갈라, 조형 수정이 추측이 됐다.)
        const upFind = (o, k) => { for (let p = o; p; p = p.parent) { if (p.userData && p.userData[k] != null) return p.userData[k]; } return null; };
        const partName = (o) => {
            const pid = upFind(o, 'pid');
            const par = upFind(o, 'pparent');
            const isHead = upFind(o, 'part') === 'head';
            return (isHead ? '머리/목:' : '') + (pid || '?') + (par ? '<' + par : '');
        };
        const heroPart = (o) => { for (let p = o; p; p = p.parent) if (p === Scene3D.heroG) return true; return false; };

        for (const [form, name] of list) {
            S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = name;
            Scene3D.refreshMount();
            // ⚠️ 위상(ridePhase=0)만 고정해선 부족하다 — 바운스는 `_clock + phase` 의 함수라 `_clock` 이
            //    로딩에 걸린 시간에 좌우돼 잔여 비결정성이 남는다(실측: 별고래가 실행에 따라
            //    통과/실패를 오갔다). 판정 전에 시계도 0으로 못박는다.
            Scene3D._clock = 0;
            for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
            Scene3D.heroG.updateWorldMatrix(true, true);
            Scene3D.mountGroup.updateWorldMatrix(true, true);
            const rig = Scene3D.heroRig, r = { form, name, occ: [], legs: {}, clearance: null };

            // ── ② 가림: 인게임 카메라에서 무릎·발까지 쏴 본다 ──────────────────────
            const cam = Scene3D.camera;
            cam.updateMatrixWorld(true);
            const camPos = cam.getWorldPosition(V(0, 0, 0));
            // 한 점만 쏘면 판정이 못 쓴다 — 자전거 앞바퀴 림(굵기 0.028) 하나가 발끝을 스쳐도 '가림'이 되고,
            // 반대로 허벅지가 통째로 묻혀도 무릎 한 점만 보이면 통과한다. 다리마다 허벅지~발끝을
            // 여러 점으로 훑어 **가려진 비율**을 낸다(50% 초과 = 다리가 안 읽힌다).
            const targets = [];
            for (const s of ['L', 'R']) {
                const hip = rig.bones['hip' + s], knee = rig.bones['knee' + s];
                // 허벅지는 **골반 바로 아래(안장 접촉부)를 빼고** 40~100% 구간만 훑는다 — 그 지점은
                // 설계상 안장/등에 닿아 있어 언제나 가려지고, 넣으면 멀쩡한 자세가 33% 가림으로 찍힌다.
                for (let i = 0; i < 3; i++) targets.push([`thigh${s}`, hip, V(0, -0.33 * (0.4 + 0.3 * i), 0)]);
                for (let i = 0; i <= 3; i++) targets.push([`shin${s}`, knee, V(0, -0.315 * i / 3, 0.045 * i / 3)]); // 정강이~발
            }
            const rc = new THREE.Raycaster();
            const seen = {};
            // 머리·목을 껐다 켜고 두 번 잰다 — 먼 다리는 몸통·안장이 이미 가려서 머리를 어디로 옮겨도
            // 가림률이 0이 되지 않는다(카메라가 탈것 앞-왼쪽 위라 시선이 통째로 몸통을 관통한다).
            // 그래서 판정 기준은 '가려지는가'가 아니라 **머리·목이 몸통보다 더 가리는가(추가 가림)** 다.
            const headParts = [];
            Scene3D.mountGroup.traverse(o => { if (o.userData && o.userData.part === 'head') headParts.push(o); });
            const setHead = (v) => headParts.forEach(o => { o.visible = v; });
            for (const [label, bone, off] of targets) {
                const wp = bone.localToWorld(off.clone());
                const dir = wp.clone().sub(camPos);
                const dist = dir.length();
                rc.set(camPos, dir.normalize());
                rc.far = dist - 0.02;                      // 목표 직전까지만 — 목표 자신은 히트로 안 친다
                // ⚠️ 씬 전체를 쏘면 안 된다 — 스프라이트/부모 없는 보조 오브젝트에서 three가
                //    matrixWorld null 로 죽는다. 어차피 판정 대상은 '탈것이 가리는가' 뿐이다.
                // 등자는 제외 — 발에 붙어 있는 게 정상이라 언제나 발 앞에 걸린다(가림이 아니다).
                const inStirrup = (o) => {
                    const st = Scene3D.mountGroup.userData.stirrups || [];
                    for (let p = o; p; p = p.parent) if (st.includes(p)) return true;
                    return false;
                };
                const cast = () => rc.intersectObject(Scene3D.mountGroup, true).find(h => h.object.visible && !inStirrup(h.object));
                setHead(true);  const blk = cast();
                setHead(false); const blkNoHead = cast();
                setHead(true);
                const part = label;
                seen[part] = seen[part] || { n: 0, blocked: 0, adds: 0, by: {} };
                seen[part].n++;
                if (blk) {
                    seen[part].blocked++;
                    // 가린 파츠의 탈것 로컬 위치 — 머리인지 몸통인지 구분용
                    const inner = Scene3D.mountGroup.children[0];
                    const lp = inner.worldToLocal(blk.object.getWorldPosition(V(0, 0, 0)));
                    const key = partName(blk.object) + '@' + [+lp.x.toFixed(2), +lp.y.toFixed(2), +lp.z.toFixed(2)].join(',');
                    seen[part].by[key] = (seen[part].by[key] || 0) + 1;
                    if (!blkNoHead) {
                        seen[part].adds++;   // 머리를 끄면 보이는데 켜면 가려진다 = 머리가 범인
                        // 어느 지점이 걸렸는지 남긴다 — 머리를 어디로 옮겨야 하는지는 이 좌표로만 알 수 있다
                        const sp2 = inner.worldToLocal(wp.clone());
                        (seen[part].addAt = seen[part].addAt || []).push([+sp2.x.toFixed(2), +sp2.y.toFixed(2), +sp2.z.toFixed(2)].join(','));
                    }
                }
            }

            for (const part in seen) {
                const s = seen[part];
                // 상위 **2개**를 남긴다 — 1개만 남기면 '몸통이 최다'라는 이유로 진짜 범인(머리·부리)이
                // 통째로 안 보인다(익룡에서 실제로 그렇게 세 세션을 헤맸다).
                r.occ.push({ part, frac: +(s.blocked / s.n).toFixed(2), headFrac: +(s.adds / s.n).toFixed(2), addAt: s.addAt || [], by: Object.entries(s.by).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0] + '×' + e[1]).join(' + ') || null });
            }

            // ── ③ 공격 중 탑승 포즈 유지 ────────────────────────────────────────
            const rd = (b) => ({ x: +b.rotation.x.toFixed(3), z: +b.rotation.z.toFixed(3) });
            r.legs.idle = { hipL: rd(rig.bones.hipL), kneeL: rd(rig.bones.kneeL), hipR: rd(rig.bones.hipR), kneeR: rd(rig.bones.kneeR) };
            // ⚠️ ProChar.play로 클립만 걸면 소용없다 — Scene3D.update가 매 프레임 Idle/Walking을 다시
            //    걸어 덮어쓴다. 실제 공격 경로(heroAttack)를 태워야 once 클립이 유지된 프레임을 잡는다.
            Scene3D.clearEnemies();
            const e = { id: 951, x: Combat.MELEE_X, alive: true, hp: Big.of(1e6), maxHp: Big.of(1e6), isBoss: false, kind: 'goblin' };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
            Scene3D.anims = [];
            const em = Scene3D.enemyMap.get(951);
            em.g.position.set(e.x + Scene3D.worldX, 0, 0); em.g.userData.landed = true;
            Combat.phase = 'fight';
            Scene3D.heroAttack(951);
            for (let i = 0; i < 22; i++) Scene3D.update(1 / 60);      // 클립 중반(스윙 구간)
            r.legs.attack = { hipL: rd(rig.bones.hipL), kneeL: rd(rig.bones.kneeL), hipR: rd(rig.bones.hipR), kneeR: rd(rig.bones.kneeR) };
            // 기준은 '대기 프레임과 같은가'가 아니라 **탑승 포즈 값을 유지하는가** — 대기 프레임에는
            // Idle 클립 자체의 다리 흔들림(±0.06)이 섞여 있어 그걸 기준 삼으면 멀쩡한 값이 불통과로 찍힌다.
            const rp = Scene3D.ridePose || {};
            r.legs.want = { hipL: (rp.hipL || {}).rx || 0, kneeL: (rp.kneeL || {}).rx || 0, hipR: (rp.hipR || {}).rx || 0, kneeR: (rp.kneeR || {}).rx || 0, hipRz: (rp.hipR || {}).rz || 0 };
            Scene3D.clearEnemies(); Combat.enemies = []; Combat.phase = 'walk';
            for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);

            // ── ④ 자전거 핸들바 ↔ 영웅 몸 최단거리 ──────────────────────────────
            if (name === 'Bike') {
                // ⚠️ 예전엔 '로컬 y가 0.42보다 높은 박스'로 바를 찾았는데, 바가 **그룹 안으로 들어가면서**
                //    로컬 y가 0이 돼 하나도 안 잡혔다(worst=null → 이 probe가 통째로 터졌다).
                //    이제 씬이 표시해 둔 구조(userData.bar)를 먼저 쓰고, 없을 때만 옛 스캔으로 되돌아간다.
                // 🚨 `mountGroup.userData.bar` 는 **서서 타는 자세에서 일부러 null 로 지워진다**
                //    (`refreshMount`: standing 이면 고삐·핸들바 정렬 대상에서 뺀다 — 선 라이더는 바를
                //    안 잡는다). 그런데 바 자체는 씬에 그대로 서 있고, 그게 다리를 관통하는지는 여전히
                //    재야 한다. 지우지 않은 **빌더 그룹 쪽 값**으로 되돌아간다.
                //    (2026-08-25 실측: 이것 때문에 자전거 ④ 가 '바를 못 찾음'으로 계속 빨간불이었다 —
                //     모델 결함이 아니라 자가 낡은 것이었다.)
                const inner0 = Scene3D.mountGroup.children[0];
                const barData = Scene3D.mountGroup.userData.bar || (inner0 && inner0.userData && inner0.userData.bar) || null;
                const bars = barData ? [barData.barMesh].concat(barData.grips).filter(Boolean) : [];
                if (!bars.length) Scene3D.mountGroup.traverse(o => {
                    if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.position.y > 0.42) bars.push(o);
                });
                // 영웅 몸: 골반·무릎·발·몸통 을 점으로 두고 각 바 박스와의 거리
                const pts = [['pelvis', rig.bones.pelvis, V(0, 0, 0)], ['spine', rig.bones.spine, V(0, 0.2, 0)],
                             ['kneeL', rig.bones.kneeL, V(0, 0, 0)], ['kneeR', rig.bones.kneeR, V(0, 0, 0)],
                             ['footL', rig.bones.kneeL, V(0, -0.315, 0.045)], ['footR', rig.bones.kneeR, V(0, -0.315, 0.045)]];
                let worst = null;
                for (const b of bars) {
                    const bb = new THREE.Box3().setFromObject(b);
                    for (const [lbl, bone, off] of pts) {
                        const wp = bone.localToWorld(off.clone());
                        const d = bb.distanceToPoint(wp);        // 박스 안이면 0
                        if (!worst || d < worst.d) worst = { d: +d.toFixed(3), pt: lbl, inside: bb.containsPoint(wp) };
                    }
                }
                // 몸통 교차는 AABB로 재면 안 된다 — 영웅도 자전거도 yaw 0.55로 돌아가 있어서, 가로로 긴
                // 핸들바(0.30×0.026)의 축정렬 상자는 실제 표면보다 뒤로 0.08쯤 부풀고, 그걸로 재면
                // 앞에 멀쩡히 떠 있는 바도 '몸통 관통'으로 찍힌다(앞선 두 판이 전부 이 오측정이었다).
                // 흉갑은 척추축 회전체라 **원기둥으로 정확히 모델링**된다. 바 정점을
                // 촘촘히 훑어 그 원기둥 표면까지의 여유를 재면 근사 없이 답이 나온다.
                // 🚨 **2026-08-20 — 옛 판은 흉갑을 "heroG 의 첫 LatheGeometry" 로 찾았다(㉡). 그런데
                //    흉갑은 그보다 앞선 세션에서 이미 voxel(`Voxel.shell`)로 바뀌어 있었다** — 그래서
                //    이 자는 흉갑이 아니라 **견갑 캡(그때 남아 있던 유일한 Lathe)을 흉갑이라 믿고**
                //    재고 있었다. 못 찾아 죽는 것보다 나쁜 경우다(엉뚱한 파츠를 조용히 잰다).
                //    견갑까지 voxel 이 된 지금은 아예 못 찾는다. → 태그로 쥔다.
                const cuirass = (() => { let m = null; Scene3D.heroG.traverse(o => { if (!m && o.isMesh && o.userData.part === 'cuirass') m = o; }); return m; })();
                let torso = null;
                if (cuirass) {
                    cuirass.updateWorldMatrix(true, false);
                    const pos = cuirass.geometry.attributes.position;
                    const axis = cuirass.getWorldPosition(V(0, 0, 0));
                    let rad = 0, yMin = Infinity, yMax = -Infinity;
                    const tmp = V(0, 0, 0);
                    for (let i = 0; i < pos.count; i++) {
                        tmp.fromBufferAttribute(pos, i).applyMatrix4(cuirass.matrixWorld);
                        rad = Math.max(rad, Math.hypot(tmp.x - axis.x, tmp.z - axis.z));
                        yMin = Math.min(yMin, tmp.y); yMax = Math.max(yMax, tmp.y);
                    }
                    let gap = Infinity;
                    for (const b of bars) {
                        b.updateWorldMatrix(true, false);
                        const bp = b.geometry.attributes.position;
                        for (let i = 0; i < bp.count; i++) {
                            tmp.fromBufferAttribute(bp, i).applyMatrix4(b.matrixWorld);
                            if (tmp.y < yMin - 0.05 || tmp.y > yMax + 0.05) continue;   // 흉갑 높이 밖은 관계없다
                            gap = Math.min(gap, Math.hypot(tmp.x - axis.x, tmp.z - axis.z) - rad);
                        }
                    }
                    torso = { rad: +rad.toFixed(3), gap: gap === Infinity ? null : +gap.toFixed(3) };
                }
                r.clearance = { bars: bars.length, worst, torso };
            }
            res.push(r);
        }
        return res;
    }, TARGETS);

    const near = (a, b) => Math.abs(a - b) < 0.05;
    let bad = 0;
    for (const r of out) {
        console.log(`\n[${r.form}] ${r.name}`);
        // 판정 기준 둘로 나눈다:
        //  ㉠ **머리·목이 가리는 건 결함** — 원래 지적("반대쪽 다리가 말 머리·목 구체에 가린다")이 이것.
        //     안장 앞턱·몸통이 먼 다리를 가리는 건 실제 승마 사진에서도 그러니 결함이 아니다.
        //  ㉡ **가까운 쪽 다리는 잘 보여야 한다** — 감싼 자세가 읽히는 건 근쪽 다리 몫이다(80% 이상 노출).
        const byHead = r.occ.filter(o => o.headFrac > 0);
        const nearHid = r.occ.filter(o => /L$/.test(o.part) && o.frac > 0.34);
        if (byHead.length || nearHid.length) bad++;
        console.log('  ② 가림  ' + r.occ.map(o => `${o.part} ${Math.round(o.frac * 100)}%${o.by ? `(${o.by})` : ''}`).join(' / '));
        console.log('       ' + (byHead.length ? `✗ 머리/목이 ${byHead.map(o => `${o.part}를 추가로 ${Math.round(o.headFrac * 100)}% (걸린 지점 ${o.addAt.join(' ')})`).join(', ')} 가림` : '✓ 머리/목의 추가 가림 0% (남은 가림은 몸통·안장 몫 — 실제 승마도 그렇다)')
                    + ' / ' + (nearHid.length ? `✗ 근쪽 다리 가림 ${nearHid.map(o => o.part + ' ' + Math.round(o.frac * 100) + '%').join(',')}` : '✓ 근쪽 다리 노출'));
        const a = r.legs.attack, w = r.legs.want;
        const keep = near(a.hipL.x, w.hipL) && near(a.hipR.x, w.hipR) && near(a.kneeL.x, w.kneeL) && near(a.kneeR.x, w.kneeR) && near(a.hipR.z, w.hipRz);
        if (!keep) bad++;
        console.log(`  ③ 공격중 hipL ${a.hipL.x}(기대 ${w.hipL}) / kneeR ${a.kneeR.x}(기대 ${w.kneeR}) / hipR.rz ${a.hipR.z}(기대 ${w.hipRz})  ${keep ? 'OK(탑승 포즈 유지)' : '✗ 다리가 펴짐'}`);
        if (r.clearance) {
            const c = r.clearance;
            const t = c.torso;
            const ok = c.worst && c.worst.d > 0.02 && (!t || t.gap === null || t.gap > 0);
            if (!ok) bad++;
            // worst 가 null 이면 '통과'가 아니라 **바를 못 찾은 것**이다 — 조용히 넘기지 말고 그렇게 찍는다
            console.log(`  ④ 핸들바(${c.bars}개) ↔ 다리·골반 최단거리 ${c.worst ? c.worst.d : '측정 실패(바를 못 찾음)'} ${c.worst ? `(${c.worst.pt}${c.worst.inside ? ', 관통' : ''})` : ''}`
                        + (t ? ` / 흉갑(반지름 ${t.rad}) 표면 여유 ${t.gap === null ? '해당 높이 없음' : t.gap}` : '') + `  ${ok ? 'OK' : '✗'}`);
        }
    }
    console.log(errors.length ? '\nPAGE ERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    console.log(bad ? `\n실패 ${bad}건` : '\n전부 통과');
    await browser.close();
})();
