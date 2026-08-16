// ===== 프로시저럴 캐릭터 리그 (GLB 대체, 사용자 지시 2026-08-16 밤) =====
// 목표: 코드 생성만으로 AAA 모바일 3D 캐릭터 품질 — 단순 Box 조립 금지.
// 라운드 지오메트리(라테 흉갑·캡슐 사지·구형 견갑), 관절 피벗 계층, 이징 키프레임 모션.
// 기존 Scene3D 인터페이스(weaponG 손 부착, helmetG 머리 부착, heroPlay 클립 이름) 호환.

const ProChar = {
    // ---- 이징 ----
    ease(t) { return t * t * (3 - 2 * t); },            // smoothstep — 관절 기본
    easeOut(t) { return 1 - (1 - t) * (1 - t); },       // 빠른 시작 (타격 스윙)
    easeIn(t) { return t * t; },                        // 느린 시작 (와인드업)

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

    // ---- 캔버스 생성 텍스처 (외부 에셋 금지 — 코드로 재질감 생성) ----
    // 밝기 중심 그레이스케일로 만들어 material.color 틴트(장비 시대색)와 곱해지게 한다.
    _texCache: {},
    canvasTex(key, draw, w, h) {
        if (this._texCache[key]) return this._texCache[key];
        const c = document.createElement('canvas');
        c.width = w || 128; c.height = h || 128;
        draw(c.getContext('2d'), c.width, c.height);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        this._texCache[key] = tex;
        return tex;
    },
    // 브러시드 메탈: 가로 스트릭 + 미세 노이즈 + 가장자리 AO 비네트
    metalTex() {
        return this.canvasTex('metal', (ctx, w, h) => {
            ctx.fillStyle = '#d8dde2'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 340; i++) {
                const y = Math.random() * h, len = 12 + Math.random() * 60;
                const v = 200 + Math.floor(Math.random() * 55) - 22;
                ctx.strokeStyle = `rgba(${v},${v + 4},${v + 9},${0.16 + Math.random() * 0.22})`;
                ctx.lineWidth = 0.7 + Math.random() * 1.1;
                ctx.beginPath();
                const x = Math.random() * w;
                ctx.moveTo(x, y); ctx.lineTo(x + len, y + (Math.random() - 0.5) * 2);
                ctx.stroke();
            }
            for (let i = 0; i < 500; i++) { // 미세 스페클
                const v = Math.random() < 0.5 ? 165 : 238;
                ctx.fillStyle = `rgba(${v},${v},${v + 6},0.10)`;
                ctx.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
            }
            const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, h * 0.72);
            vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(28,36,48,0.30)');
            ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
        });
    },
    // 망토 전용: 노이즈 없는 상단 밝음→하단 어두움 그라디언트 + 중앙 세로 광택
    // (직조 노이즈가 스크린샷에서 압축 아티팩트로 오독되던 문제 교체 — 비평가 지적)
    capeTex() {
        return this.canvasTex('cape', (ctx, w, h) => {
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, '#e8e9ec');
            g.addColorStop(0.35, '#c6c8cd');
            g.addColorStop(1, '#7c7e86');
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            const sheen = ctx.createLinearGradient(0, 0, w, 0); // 중앙 세로 광택 롤
            sheen.addColorStop(0, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.5, 'rgba(255,255,255,0.14)');
            sheen.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
        }, 64, 128);
    },
    // 가죽: 잔금 크랙 + 스티치
    leatherTex() {
        return this.canvasTex('leather', (ctx, w, h) => {
            ctx.fillStyle = '#c9b8a6'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 260; i++) {
                ctx.strokeStyle = `rgba(70,52,38,${0.10 + Math.random() * 0.14})`;
                ctx.lineWidth = 0.8;
                const x = Math.random() * w, y = Math.random() * h;
                ctx.beginPath(); ctx.moveTo(x, y);
                ctx.lineTo(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 16);
                ctx.stroke();
            }
        }, 64, 64);
    },

    // 그라디언트 환경 큐브맵 — 금속 반사가 '고무'가 아니라 '강철'로 읽히게 하는 핵심
    envMap() {
        if (this._envMap) return this._envMap;
        const faces = [];
        for (let i = 0; i < 6; i++) {
            const c = document.createElement('canvas');
            c.width = c.height = 32;
            const ctx = c.getContext('2d');
            if (i === 2) { // +Y 하늘: 밝은 청백
                ctx.fillStyle = '#e8f2fb'; ctx.fillRect(0, 0, 32, 32);
            } else if (i === 3) { // -Y 지면: 어두운 갈녹
                ctx.fillStyle = '#4b5540'; ctx.fillRect(0, 0, 32, 32);
            } else { // 측면: 하늘→지평선→지면 그라디언트
                const g = ctx.createLinearGradient(0, 0, 0, 32);
                g.addColorStop(0, '#dceaf8');
                g.addColorStop(0.5, '#f6efe0'); // 지평선 웜톤 — 하이라이트 롤에 온기
                g.addColorStop(0.55, '#7c8468');
                g.addColorStop(1, '#4b5540');
                ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
            }
            faces.push(c);
        }
        const tex = new THREE.CubeTexture(faces);
        tex.needsUpdate = true;
        this._envMap = tex;
        return tex;
    },

    // ---- 기사 리그 생성 ----
    // 반환: { group, update(dt), play(cands, once, timeScale), tint(), handR, headMount, state }
    createKnight() {
        const R = { bones: {}, base: {}, state: '', _t: 0, _clip: null, _once: false, _speed: 1, _idleT: 0 };

        // 재질 — 금속은 브러시드 텍스처+하이라이트 롤, 천/가죽은 직조 텍스처. armorMats는 장비 시대색 틴트 대상
        R.armorMats = [];
        const mTex = this.metalTex();
        const env = this.envMap();
        const steel = () => {
            const m = new THREE.MeshPhongMaterial({ color: 0x9fb2c2, shininess: 70, specular: 0xc4d2de, map: mTex, envMap: env, combine: THREE.MixOperation, reflectivity: 0.32 });
            m.userData.baseColor = m.color.getHex();
            R.armorMats.push(m);
            return m;
        };
        const steelDark = () => {
            const m = new THREE.MeshPhongMaterial({ color: 0x5c6b7a, shininess: 52, specular: 0x8493a0, map: mTex, envMap: env, combine: THREE.MixOperation, reflectivity: 0.22 });
            m.userData.dark = true; // 틴트 시 명도 단차 유지용
            m.userData.baseColor = m.color.getHex();
            R.armorMats.push(m);
            return m;
        };
        const suit = new THREE.MeshLambertMaterial({ color: 0x323e46, map: mTex }); // 갑옷 밑 사슬/천
        const leather = new THREE.MeshLambertMaterial({ color: 0x5a4030, map: this.leatherTex() });
        const gold = new THREE.MeshPhongMaterial({ color: 0xd9a441, shininess: 96, specular: 0xffe9b0, envMap: env, combine: THREE.MixOperation, reflectivity: 0.35 });
        const skin = new THREE.MeshLambertMaterial({ color: 0xf2c9a4 });
        R.trimMat = gold;
        // AO 링 — 파츠 경계(목/허리/어깨 소켓/고관절/손목)에 얹는 어두운 접촉 그림자 (비평가: AO 부재)
        const aoMat = new THREE.MeshBasicMaterial({ color: 0x0d1218, transparent: true, opacity: 0.4, depthWrite: false });
        const aoRing = (r, tube, parent, y, sz) => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 16), aoMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = y;
            if (sz) ring.scale.z = sz; // 토러스 z축=상하 두께 → 납작하게
            parent.add(ring);
            return ring;
        };

        const root = new THREE.Group();

        // ---------- 하체 ----------
        const pelvis = new THREE.Group();
        pelvis.position.y = 0.54; // 다리 연장에 맞춰 상향 (영웅 비율 — 하체 길게)
        root.add(pelvis);
        R.bones.pelvis = pelvis;
        // 골반 장갑(스커트 판) — 앞뒤 곡면 판 + 벨트
        const skirtMat = steelDark();
        skirtMat.side = THREE.DoubleSide;
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.295, 0.18, 12, 1, true), skirtMat); // 밑단 플레어 — 허리→밑단 벌어지는 실루엣 꺾임
        skirt.position.y = -0.045;
        const hem = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.014, 6, 14), gold);
        hem.rotation.x = Math.PI / 2;
        hem.position.y = -0.135;
        const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.07, 14), leather);
        belt.position.y = 0.04;
        belt.scale.z = 0.85;
        const buckle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), gold);
        buckle.position.set(0, 0.04, 0.175);
        buckle.scale.set(1.1, 0.9, 0.45);
        pelvis.add(skirt, hem, belt, buckle);
        aoRing(0.205, 0.02, pelvis, 0.005, 0.5); // 벨트 아래 접촉 그림자

        // 다리: 고관절 → 대퇴 → 무릎 → 정강이 → 부츠 (분절 피벗)
        R.legs = [];
        for (const side of [-1, 1]) {
            const hip = new THREE.Group();
            hip.position.set(side * 0.13, -0.06, 0);
            const thigh = this.capsule(0.085, 0.07, 0.28, suit);
            const cuisse = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), steelDark()); // 대퇴 장갑판
            cuisse.position.y = -0.1;
            cuisse.scale.set(1, 1.35, 1);
            const knee = new THREE.Group();
            knee.position.y = -0.28;
            const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.062, 8, 7), steel());
            const shin = this.capsule(0.06, 0.052, 0.24, suit);
            // 정강이 장갑판 (그리브)
            const greave = new THREE.Mesh(new THREE.SphereGeometry(0.068, 9, 7), steelDark());
            greave.position.set(0, -0.11, 0.012);
            greave.scale.set(0.95, 1.55, 0.95);
            knee.add(greave);
            // 부츠: 라운드 토 (구+원통 결합)
            const bootMat = new THREE.MeshPhongMaterial({ color: 0x4a3728, shininess: 25, map: this.leatherTex() });
            const bootTop = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.1, 10), bootMat);
            bootTop.position.y = -0.23;
            const foot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bootMat);
            foot.position.set(0, -0.28, 0.045);
            foot.scale.set(0.9, 0.55, 1.55);
            knee.add(kneeCap, shin, bootTop, foot);
            hip.add(thigh, cuisse, knee);
            aoRing(0.082, 0.016, hip, -0.015, 0.5); // 고관절-대퇴 경계 접촉 그림자
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
        cuirass.scale.set(1.04, 1.08, 0.8); // 역삼각 실루엣 — 가슴 상향+좌우 확장, 앞뒤 눌림 (비평가: 실루엣 꺾임)
        // 목 링
        const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.032, 8, 14), steelDark());
        gorget.rotation.x = Math.PI / 2;
        gorget.position.y = 0.45;
        // 가슴 문장 (등급 발광용)
        R.emblemMat = new THREE.MeshPhongMaterial({ color: 0x78909c, shininess: 70 });
        const emblem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), R.emblemMat);
        emblem.position.set(0, 0.3, 0.2);
        emblem.scale.z = 0.4;
        const emblemRim = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), gold);
        emblemRim.position.copy(emblem.position);
        spine.add(cuirass, gorget, emblem, emblemRim);
        aoRing(0.1, 0.022, spine, 0.435, 0.5);   // 목 링 아래 접촉 그림자
        aoRing(0.185, 0.02, spine, 0.005, 0.5);  // 흉갑 밑단-허리 경계

        // 망토 — 어깨 뒤에서 늘어지는 곡면 판 (걷기/공격 시 스윙)
        // 직조 텍스처 + 스캘럽 밑단 + 위 모서리 라운딩 + 어두운 안감(깊이감) + 금 클래스프
        const makeCapeGeo = () => {
            const geo = new THREE.PlaneGeometry(0.44, 0.6, 10, 12);
            const p = geo.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i);
                const k = 0.5 - y / 0.6;                        // 0(위) → 1(아래)
                let nx = x * (0.55 + k * 0.75);                 // 위는 좁게(어깨 폭), 아래로 퍼짐
                const edge = Math.abs(x) / 0.22;                // 0(중앙)→1(가장자리)
                if (k < 0.12) nx *= 0.75 + 2.1 * k;             // 위 모서리가 어깨 안쪽으로 말려 들어감(뾰족귀 제거)
                p.setX(i, nx);
                // 밑단 스캘럽: 아래 12%에서 물결로 y를 끌어올림
                if (k > 0.88) p.setY(i, y + Math.sin(x * 46) * 0.022 * ((k - 0.88) / 0.12));
                p.setZ(i, -Math.abs(x) * (0.45 + k * 0.9)       // 좌우가 뒤로 말리는 원통 곡률
                    - Math.sin(k * Math.PI) * 0.035
                    + Math.sin(x * 33 + k * 2.2) * 0.012 * k);  // 세로 드레이프 잔물결
            }
            geo.computeVertexNormals();
            return geo;
        };
        R.capeMat = new THREE.MeshLambertMaterial({ color: 0x8c2a2a, side: THREE.DoubleSide, map: this.capeTex() });
        const cape = new THREE.Mesh(makeCapeGeo(), R.capeMat);
        const capeG = new THREE.Group();
        capeG.position.set(0, 0.42, -0.16);
        cape.position.y = -0.31;
        capeG.add(cape);
        capeG.rotation.x = 0.14;
        // 클래스프: 양어깨 금 원판 + 가슴을 가로지르는 가죽 스트랩
        for (const sx of [-1, 1]) {
            const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), gold);
            clasp.position.set(sx * 0.13, 0.04, 0.02);
            clasp.scale.z = 0.5;
            capeG.add(clasp);
        }
        spine.add(capeG);
        R.bones.cape = capeG;

        // 팔: 견갑(2겹 셸) → 상완 → 팔꿈치 → 하완+건틀릿 → 손
        R.arms = [];
        for (const side of [-1, 1]) {
            const shoulder = new THREE.Group();
            shoulder.position.set(side * 0.29, 0.385, 0); // 어깨 폭 15% 추가 확장 — 역삼각 실루엣 (비평가 지적)
            // 견갑 — 반구 셸 2겹 (관절과 함께 회전)
            const pauldron = new THREE.Mesh(
                new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), steel());
            pauldron.position.set(side * 0.015, 0.015, 0);
            pauldron.rotation.z = side * 0.35; // 바깥으로 흘러내리는 견갑 각
            const pauldron2 = new THREE.Mesh(
                new THREE.SphereGeometry(0.093, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), steelDark());
            pauldron2.position.set(side * 0.032, -0.062, 0);
            pauldron2.rotation.z = side * 0.45;
            const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), gold);
            rivet.position.set(side * 0.015, 0.13, 0);
            aoRing(0.075, 0.018, shoulder, -0.03, 0.5); // 견갑 안쪽-상완 경계 접촉 그림자
            const upperArm = this.capsule(0.062, 0.052, 0.19, suit);
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

        // 방패 (왼손) — 축소 라운드 셸 + 림 리벳 + 문장 필드(등급색 틴트 대상) + 방사 보강대
        const shieldG = new THREE.Group();
        const shieldBody = new THREE.Mesh(
            new THREE.SphereGeometry(0.185, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), steel());
        shieldBody.rotation.x = Math.PI / 2;
        shieldBody.scale.set(1, 1, 1.25);
        const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.017, 6, 22), gold);
        // 문장 필드 — 중앙 원판(장비 없을 땐 청강색, 갑옷 장착 시 등급색)
        R.shieldFaceMat = new THREE.MeshPhongMaterial({ color: 0x3f5a74, shininess: 46, specular: 0x6b8399 });
        const face = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.016, 20), R.shieldFaceMat);
        face.rotation.x = Math.PI / 2;
        face.position.z = 0.055;
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), gold);
        boss.position.z = 0.085;
        boss.scale.z = 0.7;
        // 방사 보강대 4개 + 림 리벳 8개
        for (let i = 0; i < 4; i++) {
            const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.13, 0.012), gold);
            const a = i * Math.PI / 2 + Math.PI / 4;
            spoke.position.set(Math.cos(a) * 0.062, Math.sin(a) * 0.062, 0.062);
            spoke.rotation.z = a + Math.PI / 2;
            shieldG.add(spoke);
        }
        for (let i = 0; i < 8; i++) {
            const riv = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), gold);
            const a = i * Math.PI / 4;
            riv.position.set(Math.cos(a) * 0.155, Math.sin(a) * 0.155, 0.012);
            shieldG.add(riv);
        }
        shieldG.add(shieldBody, shieldRim, face, boss);
        shieldG.rotation.y = -Math.PI / 2;
        shieldG.position.set(-0.06, 0.03, 0);
        R.handL.add(shieldG);
        R.shield = shieldG;

        // ---------- 머리 ----------
        const neck = new THREE.Group();
        neck.position.y = 0.5;
        spine.add(neck);
        R.bones.neck = neck;
        const headG = new THREE.Group();
        headG.position.y = 0.1;
        headG.scale.setScalar(0.88); // 보블헤드 완화 — 영웅 비율 쪽으로
        neck.add(headG);
        R.bones.head = headG;
        // 얼굴 — 둥근 두상 + 턱 라운딩 (헬멧 미착용 시 노출)
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), skin);
        skull.position.y = 0.08;
        skull.scale.set(0.95, 1.05, 0.95);
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 9), skin);
        jaw.position.set(0, -0.01, 0.02);
        jaw.scale.set(0.95, 0.7, 0.9);
        headG.add(skull, jaw);
        // 눈 — 흰자+홍채+하이라이트 3겹, 얼굴 중앙 높이(스컬 중심선)에 정확히 배치
        for (const dx of [-0.078, 0.078]) {
            const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.046, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf7f4ee }));
            sclera.position.set(dx, 0.072, 0.152);
            sclera.scale.set(1, 1.2, 0.4);
            const iris = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2d4a66 }));
            iris.position.set(dx, 0.068, 0.178);
            iris.scale.set(1, 1.2, 0.5);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), new THREE.MeshBasicMaterial({ color: 0x10151c }));
            pupil.position.set(dx, 0.068, 0.192);
            const hl = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            hl.position.set(dx + 0.012, 0.082, 0.196);
            headG.add(sclera, iris, pupil, hl);
            // 볼터치 — 반투명 분홍 (캐주얼 3D 표정 온기)
            const blush = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf29a8a, transparent: true, opacity: 0.38 }));
            blush.position.set(dx * 1.35, 0.008, 0.148);
            blush.scale.set(1.2, 0.7, 0.35);
            headG.add(blush);
            // 눈썹 — 살짝 기울인 가는 캡슐 (결의 있는 인상)
            const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), new THREE.MeshLambertMaterial({ color: 0x6e4e1a })); // r128엔 CapsuleGeometry 없음
            brow.position.set(dx, 0.128, 0.168);
            brow.rotation.z = Math.PI / 2 + (dx < 0 ? -0.16 : 0.16);
            brow.rotation.y = (dx < 0 ? -1 : 1) * 0.35;
            headG.add(brow);
        }
        // 코 — 작은 라운드 범프
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), skin);
        nose.position.set(0, 0.045, 0.19);
        nose.scale.set(0.8, 1, 0.85);
        headG.add(nose);
        // 입 — 옅은 미소 라인 (얇은 토러스 하단 아크, 절제된 톤)
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0045, 5, 10, Math.PI * 0.6), new THREE.MeshBasicMaterial({ color: 0xb5786a }));
        mouth.position.set(0, -0.028, 0.172);
        mouth.rotation.z = Math.PI + Math.PI * 0.2;
        mouth.rotation.x = -0.3;
        headG.add(mouth);
        // 머리카락 (헬멧 없을 때) — 스웹트 숏컷: 베이스 캡 + 납작한 사이드스윕 프린지 (뭉게뭉게 금지)
        const hairG = new THREE.Group();
        const hairMat = new THREE.MeshPhongMaterial({ color: 0x8f6a26, shininess: 42, specular: 0x7a5c1e });
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.202, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
        cap.position.y = 0.088;
        cap.rotation.x = -0.1;
        cap.scale.set(1, 1.04, 1.02);
        hairG.add(cap);
        // 헤어라인 리지 — 이마 경계를 따라 얇은 토러스 아크 (튀어나온 뭉치 없이 하선만 정의)
        const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.028, 7, 20, Math.PI * 1.25), hairMat);
        ridge.position.set(0, 0.15, 0.012);
        ridge.rotation.x = Math.PI / 2 - 0.32;
        ridge.rotation.z = Math.PI * (0.5 - 0.625);
        hairG.add(ridge);
        headG.add(hairG);
        R.hairMesh = hairG;
        // 기존 헬멧 시스템 부착점 (Scene3D.helmetG가 여기 붙음 — 머리 중심 기준)
        const headMount = new THREE.Group();
        headMount.position.y = 0.08;
        headG.add(headMount);
        R.headMount = headMount;

        root.position.y = 0.08; // 발바닥(pelvis 0.54 - 고관절 0.06 - 대퇴 0.28 - 정강이/부츠 0.28)이 y=0에 닿는 보정
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
                // 어깨·골반 역위상 요우 — 골반이 왼쪽 돌 때 상체는 오른쪽 (걷기 판독성, 비평가 지적)
                'spine.ry': [[0, 0.26], [0.5, -0.26], [1, 0.26]],
                'pelvis.ry': [[0, -0.13], [0.5, 0.13], [1, -0.13]],
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
        if (R.restX) R.bones.shoulderR.rotation.x += R.restX; // 무기별 거치 자세 (활/총=전방 조준)
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
            const isDark = m.userData && m.userData.dark;
            if (a) {
                // 시대색을 명도 단차 유지한 채 입힘 — 다크 파츠는 확실히 어둡고 채도 낮게 (전신 형광 단색 방지)
                m.color.setHex(color).offsetHSL(0, isDark ? -0.12 : -0.05, isDark ? -0.17 : -0.04);
            } else {
                m.color.setHex(m.userData.baseColor); // 무장비: 기본 스틸 톤 복원
            }
            m.emissive.setHex(glow);
            m.emissiveIntensity = aIdx >= 4 ? 0.16 : 0;
        }
        if (R.emblemMat) {
            R.emblemMat.color.setHex(a ? RARITY_HEX[a.rarity] : 0x78909c);
            R.emblemMat.emissive.setHex(a && aIdx >= 2 ? RARITY_HEX[a.rarity] : 0x000000);
            R.emblemMat.emissiveIntensity = 0.35;
        }
        if (R.shieldFaceMat) { // 방패 문장 필드 — 갑옷 등급색으로 어둡게 (문장 배경 느낌)
            if (a) R.shieldFaceMat.color.setHex(RARITY_HEX[a.rarity]).offsetHSL(0, -0.08, -0.14);
            else R.shieldFaceMat.color.setHex(0x3f5a74);
        }
        // 헬멧 착용 시 머리카락 숨김 (기존 helmetG 시스템이 머리에 붙음)
        if (R.hairMesh) R.hairMesh.visible = !equipment.helmet;
    },
};
