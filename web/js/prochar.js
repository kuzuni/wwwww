// ===== 프로시저럴 캐릭터 리그 (GLB 대체, 사용자 지시 2026-08-16 밤) =====
// 목표: 코드 생성만으로 AAA 모바일 3D 캐릭터 품질 — 단순 Box 조립 금지.
// 라운드 지오메트리(라테 흉갑·캡슐 사지·구형 견갑), 관절 피벗 계층, 이징 키프레임 모션.
// 기존 Scene3D 인터페이스(weaponG 손 부착, helmetG 머리 부착, heroPlay 클립 이름) 호환.
// 개발 플래그: ?hero=proc 로 켠 상태에서만 GLB 대신 사용 (품질 9/10 통과 전까지 병행 개발).

const ProChar = {
    // ---- 이징 ----
    ease(t) { return t * t * (3 - 2 * t); },            // smoothstep — 관절 기본
    easeOut(t) { return 1 - (1 - t) * (1 - t); },       // 빠른 시작 (타격 스윙)
    easeIn(t) { return t * t; },                        // 느린 시작 (와인드업)

    enabled() {
        try { return new URLSearchParams(location.search).get('hero') === 'proc'; }
        catch (e) { return false; }
    },

    // 캡슐(원기둥+반구 캡) — 사지/손가락 공용. 원점=위쪽 끝(피벗), 아래로 len만큼 늘어짐
    capsule(rTop, rBot, len, mat, seg) {
        const g = new THREE.Group();
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg || 12), mat);
        cyl.position.y = -len / 2;
        const cap = new THREE.Mesh(new THREE.SphereGeometry(rBot, seg || 12, 8), mat);
        cap.position.y = -len;
        g.add(cyl, cap);
        return g;
    },

    // ---- 기사 리그 생성 ----
    // 반환: { group, update(dt), play(cands, once, timeScale), tint(), handR, headMount, state }
    createKnight() {
        const R = { bones: {}, base: {}, state: '', _t: 0, _clip: null, _once: false, _speed: 1, _idleT: 0 };

        // 재질 — 금속은 하이라이트 롤, 천/가죽은 무광. armorMats는 장비 시대색 틴트 대상
        R.armorMats = [];
        const steel = () => {
            const m = new THREE.MeshPhongMaterial({ color: 0xb8c4cf, shininess: 55, specular: 0x8899aa });
            R.armorMats.push(m);
            return m;
        };
        const steelDark = () => {
            const m = new THREE.MeshPhongMaterial({ color: 0x87939e, shininess: 40, specular: 0x66727e });
            m.userData.dark = true; // 틴트 시 명도 단차 유지용
            R.armorMats.push(m);
            return m;
        };
        const suit = new THREE.MeshLambertMaterial({ color: 0x3a4750 });      // 갑옷 밑 사슬/천
        const leather = new THREE.MeshLambertMaterial({ color: 0x5d4433 });
        const gold = new THREE.MeshPhongMaterial({ color: 0xd9a94e, shininess: 80, specular: 0xffe9b0 });
        const skin = new THREE.MeshLambertMaterial({ color: 0xffe0c9 });
        R.trimMat = gold;

        const root = new THREE.Group();

        // ---------- 하체 ----------
        const pelvis = new THREE.Group();
        pelvis.position.y = 0.46;
        root.add(pelvis);
        R.bones.pelvis = pelvis;
        // 골반 장갑(스커트 판) — 앞뒤 곡면 판 + 벨트
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.16, 12, 1, true), steelDark());
        skirt.position.y = -0.04;
        const belt = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.035, 8, 16), leather);
        belt.rotation.x = Math.PI / 2;
        belt.position.y = 0.05;
        belt.scale.z = 1.2;
        const buckle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), gold);
        buckle.position.set(0, 0.05, 0.21);
        buckle.scale.set(1, 0.8, 0.45);
        pelvis.add(skirt, belt, buckle);

        // 다리: 고관절 → 대퇴 → 무릎 → 정강이 → 부츠 (분절 피벗)
        R.legs = [];
        for (const side of [-1, 1]) {
            const hip = new THREE.Group();
            hip.position.set(side * 0.13, -0.06, 0);
            const thigh = this.capsule(0.085, 0.07, 0.2, suit);
            const cuisse = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), steelDark()); // 대퇴 장갑판
            cuisse.position.y = -0.09;
            cuisse.scale.set(1, 1.25, 1);
            const knee = new THREE.Group();
            knee.position.y = -0.2;
            const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 7), steel());
            const shin = this.capsule(0.06, 0.052, 0.16, suit);
            // 부츠: 라운드 토 (구+원통 결합)
            const bootMat = new THREE.MeshPhongMaterial({ color: 0x4a3728, shininess: 25 });
            const bootTop = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.1, 10), bootMat);
            bootTop.position.y = -0.15;
            const foot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bootMat);
            foot.position.set(0, -0.2, 0.045);
            foot.scale.set(0.9, 0.55, 1.55);
            knee.add(kneeCap, shin, bootTop, foot);
            hip.add(thigh, cuisse, knee);
            pelvis.add(hip);
            R.legs.push({ hip, knee });
            R.bones['hip' + (side < 0 ? 'L' : 'R')] = hip;
            R.bones['knee' + (side < 0 ? 'L' : 'R')] = knee;
        }

        // ---------- 상체 ----------
        const spine = new THREE.Group();
        spine.position.y = 0.1;
        pelvis.add(spine);
        R.bones.spine = spine;

        // 흉갑: 라테 곡면(허리 잘록→가슴 볼록→어깨 수렴) — "판때기 Box" 대신 진짜 곡률
        const cuirassPts = [];
        const prof = [[0.185, 0], [0.225, 0.09], [0.245, 0.2], [0.235, 0.3], [0.19, 0.4], [0.12, 0.46]];
        for (const [r, y] of prof) cuirassPts.push(new THREE.Vector2(r, y));
        const cuirass = new THREE.Mesh(new THREE.LatheGeometry(cuirassPts, 18), steel());
        cuirass.scale.z = 0.82; // 앞뒤로 살짝 납작하게 (흉갑 단면)
        // 가슴 중앙 융기선
        const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 6), steel());
        ridge.position.set(0, 0.24, 0.185);
        ridge.rotation.x = 0.22;
        // 목 링
        const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 14), steelDark());
        gorget.rotation.x = Math.PI / 2;
        gorget.position.y = 0.46;
        // 가슴 문장 (등급 발광용)
        R.emblemMat = new THREE.MeshPhongMaterial({ color: 0x78909c, shininess: 70 });
        const emblem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), R.emblemMat);
        emblem.position.set(0, 0.3, 0.2);
        emblem.scale.z = 0.4;
        const emblemRim = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), gold);
        emblemRim.position.copy(emblem.position);
        spine.add(cuirass, ridge, gorget, emblem, emblemRim);

        // 망토 — 어깨 뒤에서 늘어지는 곡면 판 (걷기/공격 시 스윙)
        const capeGeo = new THREE.PlaneGeometry(0.42, 0.62, 4, 6);
        {
            const p = capeGeo.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i);
                p.setZ(i, -Math.abs(x) * 0.35 * (0.4 - y)); // 아래로 갈수록 좌우가 뒤로 말림
            }
            capeGeo.computeVertexNormals();
        }
        R.capeMat = new THREE.MeshLambertMaterial({ color: 0x8e2f2f, side: THREE.DoubleSide });
        const cape = new THREE.Mesh(capeGeo, R.capeMat);
        const capeG = new THREE.Group();
        capeG.position.set(0, 0.42, -0.16);
        cape.position.y = -0.31;
        capeG.add(cape);
        capeG.rotation.x = 0.14;
        spine.add(capeG);
        R.bones.cape = capeG;

        // 팔: 견갑(2겹 셸) → 상완 → 팔꿈치 → 하완+건틀릿 → 손
        R.arms = [];
        for (const side of [-1, 1]) {
            const shoulder = new THREE.Group();
            shoulder.position.set(side * 0.26, 0.4, 0);
            // 견갑 — 반구 셸 2겹 (관절과 함께 회전)
            const pauldron = new THREE.Mesh(
                new THREE.SphereGeometry(0.115, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), steel());
            pauldron.position.set(side * 0.02, 0.05, 0);
            const pauldron2 = new THREE.Mesh(
                new THREE.SphereGeometry(0.09, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.5), steelDark());
            pauldron2.position.set(side * 0.045, -0.02, 0);
            const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), gold);
            rivet.position.set(side * 0.02, 0.16, 0);
            const upperArm = this.capsule(0.055, 0.048, 0.17, suit);
            const elbow = new THREE.Group();
            elbow.position.y = -0.19;
            const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), steelDark());
            const forearm = this.capsule(0.046, 0.042, 0.13, suit);
            // 건틀릿 커프(원뿔 링) + 손
            const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.065, 0.07, 10), steel());
            cuff.position.y = -0.11;
            const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 7), skin);
            hand.position.y = -0.16;
            hand.scale.set(0.9, 1.1, 0.9);
            const handMount = new THREE.Group();
            handMount.position.y = -0.17;
            elbow.add(elbowCap, forearm, cuff, hand, handMount);
            shoulder.add(pauldron, pauldron2, rivet, upperArm, elbow);
            spine.add(shoulder);
            R.arms.push({ shoulder, elbow, handMount });
            R.bones['shoulder' + (side < 0 ? 'L' : 'R')] = shoulder;
            R.bones['elbow' + (side < 0 ? 'L' : 'R')] = elbow;
        }
        R.handL = R.arms[0].handMount;
        R.handR = R.arms[1].handMount;

        // 방패 (왼손) — 라운드 셸 + 금속 보스
        const shieldG = new THREE.Group();
        const shieldBody = new THREE.Mesh(
            new THREE.SphereGeometry(0.24, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), steel());
        shieldBody.rotation.x = Math.PI / 2;
        shieldBody.scale.set(1, 1, 1.25);
        const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 18), gold);
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), gold);
        boss.position.z = 0.1;
        shieldG.add(shieldBody, shieldRim, boss);
        shieldG.rotation.y = Math.PI / 2;
        shieldG.position.set(-0.05, 0.02, 0);
        R.handL.add(shieldG);
        R.shield = shieldG;

        // ---------- 머리 ----------
        const neck = new THREE.Group();
        neck.position.y = 0.5;
        spine.add(neck);
        R.bones.neck = neck;
        const headG = new THREE.Group();
        headG.position.y = 0.1;
        neck.add(headG);
        R.bones.head = headG;
        // 얼굴 — 둥근 두상 + 턱 라운딩 (헬멧 미착용 시 노출)
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), skin);
        skull.position.y = 0.09;
        skull.scale.set(0.95, 1.05, 0.95);
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 9), skin);
        jaw.position.set(0, -0.01, 0.02);
        jaw.scale.set(0.95, 0.7, 0.9);
        headG.add(skull, jaw);
        // 눈 — 타원 + 하이라이트 (플레이스홀더 도트 탈피)
        for (const dx of [-0.075, 0.075]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2b2320 }));
            eye.position.set(dx, 0.1, 0.175);
            eye.scale.set(0.85, 1.25, 0.5);
            const hl = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            hl.position.set(dx + 0.01, 0.125, 0.195);
            headG.add(eye, hl);
        }
        // 머리카락 캡 (헬멧 없을 때) — 앞머리 라운드
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), new THREE.MeshLambertMaterial({ color: 0xc9a24b }));
        hair.position.y = 0.1;
        hair.rotation.x = -0.18;
        headG.add(hair);
        R.hairMesh = hair;
        // 기존 헬멧 시스템 부착점 (Scene3D.helmetG가 여기 붙음 — 머리 중심 기준)
        const headMount = new THREE.Group();
        headMount.position.y = 0.09;
        headG.add(headMount);
        R.headMount = headMount;

        root.position.y = 0.55; // pelvis 0.46 + 다리 길이 보정 → 발바닥 y=0
        const outer = new THREE.Group();
        outer.add(root);
        R.group = outer;
        R.root = root;

        // 베이스 포즈 기록 (매 프레임 여기서 시작해 클립 오프셋을 얹음)
        const rec = (o) => ({ rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, px: o.position.x, py: o.position.y, pz: o.position.z });
        for (const k in R.bones) R.base[k] = rec(R.bones[k]);
        R.base.root = rec(root);

        R.update = (dt) => this.update(R, dt);
        R.play = (cands, once, timeScale, onDone) => this.play(R, cands, once, timeScale, onDone);
        return R;
    },

    // ---- 클립: 본별 [시각, 값] 키프레임 (라디안). 구간별 이징 보간 ----
    // 값은 베이스 포즈 대비 오프셋. 'root.py'처럼 위치 채널도 지원.
    CLIPS: {
        Idle: {
            dur: 2.8, loop: true, tracks: {
                'spine.rx': [[0, 0.02], [0.5, 0.055], [1, 0.02]],
                'spine.py': [[0, 0], [0.5, 0.012], [1, 0]],
                'neck.rx': [[0, 0], [0.55, -0.05], [1, 0]],
                'shoulderL.rz': [[0, 0.06], [0.5, 0.1], [1, 0.06]],
                'shoulderR.rz': [[0, -0.06], [0.5, -0.1], [1, -0.06]],
                'shoulderR.rx': [[0, -0.14], [0.5, -0.1], [1, -0.14]],
                'shoulderL.rx': [[0, -0.1], [0.5, -0.06], [1, -0.1]],
                'cape.rx': [[0, 0.02], [0.5, 0.05], [1, 0.02]],
            }
        },
        Walking: {
            dur: 0.66, loop: true, tracks: {
                'hipL.rx': [[0, 0.55], [0.25, 0.1], [0.5, -0.5], [0.75, 0], [1, 0.55]],
                'kneeL.rx': [[0, -0.25], [0.25, -0.08], [0.5, -0.55], [0.75, -0.95], [1, -0.25]],
                'hipR.rx': [[0, -0.5], [0.25, 0], [0.5, 0.55], [0.75, 0.1], [1, -0.5]],
                'kneeR.rx': [[0, -0.55], [0.25, -0.95], [0.5, -0.25], [0.75, -0.08], [1, -0.55]],
                'shoulderL.rx': [[0, -0.42], [0.5, 0.34], [1, -0.42]],
                'shoulderR.rx': [[0, 0.2], [0.5, -0.5], [1, 0.2]],
                'elbowL.rx': [[0, -0.3], [0.5, -0.12], [1, -0.3]],
                'elbowR.rx': [[0, -0.12], [0.5, -0.3], [1, -0.12]],
                'spine.rx': [[0, 0.1], [1, 0.1]],
                'spine.ry': [[0, 0.08], [0.5, -0.08], [1, 0.08]],
                'pelvis.rz': [[0, 0.045], [0.5, -0.045], [1, 0.045]],
                'root.py': [[0, 0.035], [0.25, 0], [0.5, 0.035], [0.75, 0], [1, 0.035]],
                'cape.rx': [[0, 0.3], [0.5, 0.38], [1, 0.3]],
                'neck.rx': [[0, -0.08], [1, -0.08]],
            }
        },
        slash: { // 대각 베기: 와인드업(뒤·위) → 스냅 스윙 → 팔로스루
            dur: 0.5, tracks: {
                'shoulderR.rx': [[0, -0.2], [0.3, -2.1], [0.55, 0.7], [1, -0.2]],
                'shoulderR.rz': [[0, -0.06], [0.3, -0.9], [0.55, 0.5], [1, -0.06]],
                'elbowR.rx': [[0, -0.15], [0.3, -0.5], [0.55, -0.05], [1, -0.15]],
                'spine.ry': [[0, 0], [0.3, -0.55], [0.55, 0.5], [1, 0]],
                'spine.rx': [[0, 0.02], [0.3, -0.06], [0.55, 0.22], [1, 0.02]],
                'shoulderL.rx': [[0, -0.1], [0.3, 0.3], [0.55, -0.5], [1, -0.1]],
                'cape.rx': [[0, 0.05], [0.45, 0.5], [1, 0.05]],
            }
        },
        chop: { // 머리 위로 크게 들어 내려찍기
            dur: 0.55, tracks: {
                'shoulderR.rx': [[0, -0.2], [0.35, -2.9], [0.6, 0.55], [1, -0.2]],
                'elbowR.rx': [[0, -0.15], [0.35, -0.75], [0.6, -0.05], [1, -0.15]],
                'spine.rx': [[0, 0.02], [0.35, -0.18], [0.6, 0.3], [1, 0.02]],
                'spine.ry': [[0, 0], [0.35, -0.25], [0.6, 0.2], [1, 0]],
                'kneeL.rx': [[0, 0], [0.6, -0.25], [1, 0]],
                'cape.rx': [[0, 0.05], [0.5, 0.55], [1, 0.05]],
            }
        },
        thrust: { // 찌르기: 당겼다 런지
            dur: 0.45, tracks: {
                'shoulderR.rx': [[0, -0.3], [0.3, 0.5], [0.55, -1.62], [1, -0.3]],
                'elbowR.rx': [[0, -0.2], [0.3, -0.9], [0.55, 0], [1, -0.2]],
                'spine.ry': [[0, 0], [0.3, 0.35], [0.55, -0.45], [1, 0]],
                'spine.rx': [[0, 0.02], [0.55, 0.18], [1, 0.02]],
                'shoulderL.rx': [[0, -0.1], [0.55, 0.5], [1, -0.1]],
            }
        },
        slam: { // 양손 내려찍기
            dur: 0.6, tracks: {
                'shoulderR.rx': [[0, -0.2], [0.4, -2.95], [0.65, 0.5], [1, -0.2]],
                'shoulderL.rx': [[0, -0.1], [0.4, -2.85], [0.65, 0.45], [1, -0.1]],
                'elbowR.rx': [[0, -0.15], [0.4, -0.6], [0.65, -0.05], [1, -0.15]],
                'elbowL.rx': [[0, -0.15], [0.4, -0.6], [0.65, -0.05], [1, -0.15]],
                'spine.rx': [[0, 0.02], [0.4, -0.25], [0.65, 0.38], [1, 0.02]],
                'root.py': [[0, 0], [0.4, 0.05], [0.65, -0.06], [1, 0]],
                'cape.rx': [[0, 0.05], [0.55, 0.6], [1, 0.05]],
            }
        },
        double: { // 좌우 연속 베기
            dur: 0.55, tracks: {
                'shoulderR.rx': [[0, -0.2], [0.2, -1.7], [0.4, 0.45], [0.6, -1.4], [0.8, 0.35], [1, -0.2]],
                'shoulderR.rz': [[0, 0], [0.2, -0.6], [0.4, 0.4], [0.6, 0.5], [0.8, -0.4], [1, 0]],
                'spine.ry': [[0, 0], [0.25, -0.4], [0.5, 0.35], [0.75, -0.3], [1, 0]],
                'elbowR.rx': [[0, -0.15], [0.2, -0.45], [0.4, -0.05], [0.6, -0.4], [1, -0.15]],
            }
        },
        bow: { // 활: 시위 당김 → 릴리즈
            dur: 0.62, tracks: {
                'shoulderL.rx': [[0, -0.1], [0.25, -1.5], [0.8, -1.5], [1, -0.1]],
                'shoulderL.ry': [[0, 0], [0.25, -0.15], [0.8, -0.15], [1, 0]],
                'shoulderR.rx': [[0, -0.14], [0.3, -1.35], [0.62, -1.3], [0.75, -1.55], [1, -0.14]],
                'elbowR.rx': [[0, -0.15], [0.3, -1.15], [0.62, -1.2], [0.75, -0.2], [1, -0.15]],
                'spine.ry': [[0, 0], [0.3, 0.35], [0.8, 0.35], [1, 0]],
                'neck.ry': [[0, 0], [0.3, -0.3], [0.8, -0.3], [1, 0]],
            }
        },
        gun: { // 총: 조준 → 반동
            dur: 0.4, tracks: {
                'shoulderR.rx': [[0, -0.14], [0.25, -1.55], [0.5, -1.75], [0.65, -1.5], [1, -0.14]],
                'elbowR.rx': [[0, -0.15], [0.25, -0.05], [0.5, -0.3], [1, -0.15]],
                'spine.ry': [[0, 0], [0.25, 0.2], [0.5, 0.32], [1, 0]],
                'spine.rx': [[0, 0.02], [0.5, -0.06], [1, 0.02]],
            }
        },
        cast: { // 지팡이: 하늘로 들어올림 → 앞으로 방출
            dur: 0.66, tracks: {
                'shoulderR.rx': [[0, -0.2], [0.35, -2.6], [0.65, -1.3], [1, -0.2]],
                'elbowR.rx': [[0, -0.15], [0.35, -0.35], [0.65, -0.1], [1, -0.15]],
                'shoulderL.rx': [[0, -0.1], [0.35, -0.9], [0.65, -0.4], [1, -0.1]],
                'spine.rx': [[0, 0.02], [0.35, -0.12], [0.65, 0.14], [1, 0.02]],
                'root.py': [[0, 0], [0.35, 0.045], [1, 0]],
                'cape.rx': [[0, 0.05], [0.45, 0.4], [1, 0.05]],
            }
        },
        throw: { // 투척: 뒤로 젖혔다 오버핸드
            dur: 0.5, tracks: {
                'shoulderR.rx': [[0, -0.2], [0.32, -2.75], [0.58, 0.85], [1, -0.2]],
                'elbowR.rx': [[0, -0.15], [0.32, -0.85], [0.58, -0.05], [1, -0.15]],
                'spine.ry': [[0, 0], [0.32, -0.5], [0.58, 0.45], [1, 0]],
                'spine.rx': [[0, 0.02], [0.58, 0.24], [1, 0.02]],
                'kneeL.rx': [[0, 0], [0.58, -0.2], [1, 0]],
            }
        },
        Death: { // 비틀 → 무릎 꺾임 → 뒤로 쓰러짐
            dur: 1.3, once: true, tracks: {
                'spine.rx': [[0, 0], [0.2, -0.3], [0.5, 0.25], [1, 0.35]],
                'spine.ry': [[0, 0], [0.2, 0.3], [1, 0.15]],
                'hipL.rx': [[0, 0], [0.45, 1.15], [1, 1.3]],
                'hipR.rx': [[0, 0], [0.45, 1.0], [1, 1.25]],
                'kneeL.rx': [[0, 0], [0.45, -1.3], [1, -1.5]],
                'kneeR.rx': [[0, 0], [0.45, -1.2], [1, -1.45]],
                'root.py': [[0, 0], [0.45, -0.32], [1, -0.44]],
                'root.rx': [[0, 0], [0.5, -0.4], [1, -1.35]],
                'shoulderL.rx': [[0, -0.1], [0.5, -0.7], [1, -1.2]],
                'shoulderR.rx': [[0, -0.14], [0.5, -0.5], [1, -1.1]],
                'neck.rx': [[0, 0], [1, -0.35]],
            }
        },
    },

    // GLB 클립 이름 → 프로시저럴 클립 매핑 (Scene3D.heroPlay 후보 배열 호환)
    CLIP_ALIAS: [
        [/Slice_Diagonal|Slice_Horizontal/, 'slash'],
        [/1H_Melee_Attack_Chop/, 'chop'],
        [/Stab/, 'thrust'],
        [/2H_Melee/, 'slam'],
        [/Dualwield/, 'double'],
        [/2H_Ranged/, 'bow'],
        [/1H_Ranged/, 'gun'],
        [/Spellcast/, 'cast'],
        [/^Throw$/, 'throw'],
        [/Death/, 'Death'],
        [/Walking|Running/, 'Walking'],
        [/Idle/, 'Idle'],
    ],
    resolveClip(cands) {
        for (const c of cands) {
            if (this.CLIPS[c]) return c;
            for (const [re, name] of this.CLIP_ALIAS) if (re.test(c)) return name;
        }
        return null;
    },

    play(R, cands, once, timeScale, onDone) {
        const name = this.resolveClip(Array.isArray(cands) ? cands : [cands]);
        if (!name) return;
        const clip = this.CLIPS[name];
        if (!once && !clip.once && R.state === name) return; // 루프 클립 중복 재시작 방지
        R._clip = clip;
        R._t = 0;
        R._once = !!(once || clip.once);
        R._speed = timeScale || 1;
        R._onDone = onDone || null;
        R.state = R._once ? '' : name;
    },

    // 트랙 보간: 키프레임 사이 smoothstep — "이징 있는 포즈 보간"
    sample(keys, t) {
        if (t <= keys[0][0]) return keys[0][1];
        for (let i = 1; i < keys.length; i++) {
            if (t <= keys[i][0]) {
                const [t0, v0] = keys[i - 1], [t1, v1] = keys[i];
                const k = this.ease((t - t0) / Math.max(0.0001, t1 - t0));
                return v0 + (v1 - v0) * k;
            }
        }
        return keys[keys.length - 1][1];
    },

    update(R, dt) {
        if (!R._clip) return;
        R._t += dt * R._speed;
        let t = R._t / R._clip.dur;
        if (t >= 1) {
            if (R._once) {
                t = 1;
                if (R._onDone) { const f = R._onDone; R._onDone = null; f(); }
            } else t -= Math.floor(t);
        }
        // 베이스 포즈에서 시작
        const apply = (bone, base) => {
            bone.rotation.set(base.rx, base.ry, base.rz);
            bone.position.set(base.px, base.py, base.pz);
        };
        for (const k in R.bones) apply(R.bones[k], R.base[k]);
        apply(R.root, R.base.root);
        // 트랙 오프셋
        for (const key in R._clip.tracks) {
            const dot = key.indexOf('.');
            const boneName = key.slice(0, dot), ch = key.slice(dot + 1);
            const bone = boneName === 'root' ? R.root : R.bones[boneName];
            if (!bone) continue;
            const v = this.sample(R._clip.tracks[key], t);
            if (ch === 'rx') bone.rotation.x += v;
            else if (ch === 'ry') bone.rotation.y += v;
            else if (ch === 'rz') bone.rotation.z += v;
            else if (ch === 'px') bone.position.x += v;
            else if (ch === 'py') bone.position.y += v;
            else if (ch === 'pz') bone.position.z += v;
        }
    },

    // 장비 시대색 틴트 (tintHeroGlb 대체) — 흉갑/견갑/다리판 = 갑옷색, 문장 = 등급 발광
    tint(R, equipment) {
        const a = equipment.armor;
        const aIdx = a ? RARITIES.indexOf(a.rarity) : 0;
        const color = a ? AGE_COLORS[a.age] : 0xb8c4cf;
        const glow = a && aIdx >= 4 ? RARITY_HEX[a.rarity] : 0x000000;
        for (const m of R.armorMats) {
            // 기본 스틸 명도 차이를 유지한 채 색조만 입힘 (전부 같은 단색이 되지 않게)
            const base = new THREE.Color(color);
            const isDark = m.userData && m.userData.dark;
            m.color.copy(base).offsetHSL(0, a ? 0 : -0.05, isDark ? -0.08 : 0);
            m.emissive.setHex(glow);
            m.emissiveIntensity = aIdx >= 4 ? 0.16 : 0;
        }
        if (R.emblemMat) {
            R.emblemMat.color.setHex(a ? RARITY_HEX[a.rarity] : 0x78909c);
            R.emblemMat.emissive.setHex(a && aIdx >= 2 ? RARITY_HEX[a.rarity] : 0x000000);
            R.emblemMat.emissiveIntensity = 0.35;
        }
        // 헬멧 착용 시 머리카락 숨김 (기존 helmetG 시스템이 머리에 붙음)
        if (R.hairMesh) R.hairMesh.visible = !equipment.helmet;
    },
};
