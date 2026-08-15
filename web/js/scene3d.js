// ===== Three.js 3D 전투 씬 + 연출(파티클/셰이크/데미지 숫자) =====
const Scene3D = {
    renderer: null, scene: null, camera: null,
    heroG: null, weaponG: null, helmetG: null, bodyMesh: null,
    petGroups: [],
    enemyMap: new Map(),     // id → {g, body, hpBg, hpFg, dead}
    particles: [],
    anims: [],               // {t, dur, fn(k), onDone}
    shakeMag: 0,
    fxLayer: null, container: null,
    _clock: 0,

    init(canvas, fxLayer, container) {
        this.fxLayer = fxLayer;
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0xa8d8ea, 12, 30);

        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        this.camera.position.set(0.15, 3.7, 8.2);
        this.camera.lookAt(0.15, 0.9, 0);

        // 라이팅: 반구광(하늘/땅 색 반사) + 태양광
        this.hemi = new THREE.HemisphereLight(0xbddcff, 0x5a7d46, 0.75);
        this.sun = new THREE.DirectionalLight(0xfff3d6, 0.85);
        this.sun.position.set(3, 8, 5);
        this.scene.add(this.hemi, this.sun);

        this.buildTerrain();

        this.buildHero();
        this.refreshHeroEquip();
        this.refreshPets();
        this.resize();
    },

    resize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    },

    // 지형 고도: 전투 라인은 평지, 뒤로 갈수록 능선 (로우폴리 노이즈)
    heightAt(x, z) {
        const n = Math.sin(x * 0.45 + z * 0.3) * 0.5 + Math.sin(x * 0.21 + 7.3) * 0.3 + Math.cos(z * 0.6 + x * 0.13) * 0.2;
        const back = U.clamp((-z - 2.0) / 5.5, 0, 1);   // 뒤쪽 능선
        const front = U.clamp((z - 2.4) / 3, 0, 1);      // 카메라 앞쪽 둔덕
        return back * back * (1.7 + n * 1.3) + front * (0.5 + n * 0.35);
    },

    // ---- 숲 지형: 정점 변위 로우폴리 지형 + 원경 산맥 + 나무/덤불 + 안개 ----
    buildTerrain() {
        // 각진 플랫셰이딩 지형 메시
        this.terrainMat = new THREE.MeshLambertMaterial({ color: 0x7cb342, flatShading: true });
        const geo = new THREE.PlaneGeometry(60, 30, 64, 28);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const jitter = Math.abs(z) > 1.8 ? U.rand(-0.07, 0.07) : 0; // 평지 밖만 요철
            pos.setY(i, this.heightAt(x, z) + jitter);
        }
        geo.computeVertexNormals();
        this.ground = new THREE.Mesh(geo, this.terrainMat);
        this.scene.add(this.ground);

        // 원경 산맥 (안개 속 실루엣)
        this.mountainMat = new THREE.MeshLambertMaterial({ color: 0x558b2f, flatShading: true });
        this.mountains = [];
        for (const [x, s] of [[-9, 4.5], [-2, 6.2], [5, 5.2], [12, 4.2]]) {
            const m = new THREE.Mesh(new THREE.ConeGeometry(s, s * 0.95, 5), this.mountainMat);
            m.position.set(x, 0, -12);
            m.rotation.y = U.rand(0, 3);
            this.scene.add(m);
            this.mountains.push(m);
        }

        // 나무: 소나무 + 활엽수, 지형 높이에 맞춰 배치
        this.foliageMat = new THREE.MeshLambertMaterial({ color: 0x33691e, flatShading: true });
        this.trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
        this.trees = [];
        const treeSpots = [
            [-7, -3.2, 1.1, 'p'], [-5.2, -2.6, 0.8, 'r'], [-3.4, -3.8, 1.3, 'p'], [-1.2, -3, 0.9, 'r'],
            [0.8, -3.6, 1.2, 'p'], [2.6, -2.8, 0.85, 'p'], [4.4, -3.5, 1.15, 'r'], [6.2, -2.9, 0.9, 'p'],
            [8, -3.8, 1.3, 'p'], [-8.8, -2.4, 0.7, 'r'], [-6, -5.5, 1.6, 'p'], [0, -6, 1.8, 'p'],
            [6.5, -5.8, 1.7, 'p'], [-3.6, 2.6, 0.7, 'r'], [4.2, 2.8, 0.75, 'p'], [9.5, -5, 1.5, 'p'],
        ];
        for (const [x, z, s, kind] of treeSpots) {
            const t = kind === 'p' ? this.makePine(s) : this.makeRoundTree(s);
            t.position.set(x, this.heightAt(x, z), z);
            t.rotation.y = U.rand(0, Math.PI * 2);
            this.scene.add(t);
            this.trees.push(t);
        }
        // 덤불 + 바위
        this.bushMat = new THREE.MeshLambertMaterial({ color: 0x4a7c2f, flatShading: true });
        this.rocks = [];
        for (let i = 0; i < 7; i++) {
            const b = new THREE.Mesh(new THREE.DodecahedronGeometry(U.rand(0.14, 0.28), 0), this.bushMat);
            const x = U.rand(-9, 9), z = U.rand(-2.4, 1.8);
            b.position.set(x, this.heightAt(x, z) + 0.06, z);
            b.scale.y = 0.7;
            this.scene.add(b);
            this.rocks.push(b);
        }
        for (let i = 0; i < 7; i++) {
            const r = new THREE.Mesh(
                new THREE.DodecahedronGeometry(U.rand(0.1, 0.3), 0),
                new THREE.MeshLambertMaterial({ color: 0x90a4ae, flatShading: true })
            );
            const x = U.rand(-9, 9), z = U.rand(-2.8, 1.6);
            r.position.set(x, this.heightAt(x, z) + 0.05, z);
            r.rotation.set(U.rand(0, 3), U.rand(0, 3), 0);
            this.scene.add(r);
            this.rocks.push(r);
        }

        // 떠다니는 안개 (반투명 플레인이 천천히 흘러감)
        this.mists = [];
        for (let i = 0; i < 7; i++) {
            const mist = new THREE.Mesh(
                new THREE.PlaneGeometry(U.rand(3, 5.5), U.rand(0.8, 1.4)),
                new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: U.rand(0.06, 0.14), depthWrite: false })
            );
            mist.position.set(U.rand(-9, 9), U.rand(0.4, 1.8), U.rand(-4.5, -0.5));
            mist.userData.speed = U.rand(0.12, 0.35) * (Math.random() < 0.5 ? 1 : -1);
            mist.userData.baseY = mist.position.y;
            this.scene.add(mist);
            this.mists.push(mist);
        }
        // 무한맵 스크롤 대상 (걷는 동안 왼쪽으로 흘러가며 순환, 지형 높이 추적)
        this.scrollables = [...this.trees, ...this.rocks];
    },

    makePine(s) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.13 * s, 0.5 * s, 7), this.trunkMat);
        trunk.position.y = 0.25 * s;
        g.add(trunk);
        for (let i = 0; i < 3; i++) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry((0.55 - i * 0.13) * s, 0.62 * s, 7), this.foliageMat);
            cone.position.y = (0.62 + i * 0.4) * s;
            g.add(cone);
        }
        return g;
    },

    makeRoundTree(s) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.12 * s, 0.6 * s, 7), this.trunkMat);
        trunk.position.y = 0.3 * s;
        const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 * s, 0), this.foliageMat);
        crown.position.y = 0.95 * s;
        const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 * s, 0), this.foliageMat);
        crown2.position.set(0.28 * s, 0.75 * s, 0.1 * s);
        g.add(trunk, crown, crown2);
        return g;
    },

    // ---- 영웅: 기사 형태 인간형 (페이퍼돌 — 무기/투구/갑옷이 실제 외형 변경) ----
    buildHero() {
        const g = new THREE.Group();
        const skin = 0xffe0c9;
        this.armorMats = [];
        const armorMat = () => {
            const m = new THREE.MeshLambertMaterial({ color: 0xb0bec5 });
            this.armorMats.push(m);
            return m;
        };
        // 다리 + 부츠 (고관절 피벗 — 걷기 애니메이션용)
        this.legs = [];
        for (const dx of [-0.13, 0.13]) {
            const hip = new THREE.Group();
            hip.position.set(dx, 0.4, 0);
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.36, 0.17), new THREE.MeshLambertMaterial({ color: 0x455a64 }));
            leg.position.y = -0.2;
            const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.25), new THREE.MeshLambertMaterial({ color: 0x37474f }));
            boot.position.set(0, -0.35, 0.03);
            hip.add(leg, boot);
            g.add(hip);
            this.legs.push(hip);
        }
        // 몸통(흉갑) + 벨트 + 어깨 갑주
        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.3), armorMat());
        this.torso.position.y = 0.65;
        const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), armorMat());
        chest.position.set(0, 0.74, 0.16);
        this.chestPlate = chest;
        const belt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.09, 0.32), new THREE.MeshLambertMaterial({ color: 0x3e2723 }));
        belt.position.y = 0.42;
        const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.03), new THREE.MeshLambertMaterial({ color: 0xffd54f }));
        buckle.position.set(0, 0.42, 0.17);
        // 가슴 문장 (갑옷 등급색 발광)
        this.emblemMat = new THREE.MeshLambertMaterial({ color: 0x78909c });
        const emblem = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this.emblemMat);
        emblem.position.set(0, 0.82, 0.19);
        emblem.scale.z = 0.45;
        g.add(this.torso, chest, belt, buckle, emblem);
        this.shoulderPads = [];
        for (const dx of [-0.3, 0.3]) {
            const pad = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), armorMat());
            pad.position.set(dx, 0.89, 0);
            pad.scale.y = 0.75;
            g.add(pad);
            this.shoulderPads.push(pad);
        }
        // 갑옷 스타일별 부속 (백팩/로브/망토/파우치)
        this.armorExtraG = new THREE.Group();
        g.add(this.armorExtraG);
        // 머리 + 눈
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10), new THREE.MeshLambertMaterial({ color: skin }));
        head.position.y = 1.24;
        g.add(head);
        for (const dx of [-0.08, 0.08]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), new THREE.MeshBasicMaterial({ color: 0x263238 }));
            eye.position.set(dx, 1.27, 0.2);
            g.add(eye);
        }
        // 왼팔 + 방패
        this.armL = new THREE.Group();
        this.armL.position.set(-0.35, 0.85, 0);
        const upperL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.36, 0.11), armorMat());
        upperL.position.y = -0.16;
        this.shield = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 14), armorMat());
        this.shield.rotation.z = Math.PI / 2;
        this.shield.position.set(-0.1, -0.32, 0);
        const boss1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffd54f }));
        boss1.position.set(-0.14, -0.32, 0);
        this.armL.add(upperL, this.shield, boss1);
        this.armL.rotation.x = -0.15;
        // 오른팔 (무기 손)
        this.armR = new THREE.Group();
        this.armR.position.set(0.35, 0.85, 0.02);
        const upperR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.36, 0.11), armorMat());
        upperR.position.y = -0.16;
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshLambertMaterial({ color: skin }));
        hand.position.y = -0.36;
        this.weaponG = new THREE.Group();
        this.weaponG.position.y = -0.36;
        this.armR.add(upperR, hand, this.weaponG);
        this.armR.rotation.x = -0.25;
        // 투구 그룹 (머리 위)
        this.helmetG = new THREE.Group();
        this.helmetG.position.y = 1.24;
        g.add(this.armL, this.armR, this.helmetG);

        g.rotation.y = 0.55; // 적 방향(+x)으로 3/4 자세
        g.position.set(Combat.HERO_X, 0, 0);
        this.heroG = g;
        this.scene.add(g);
    },

    // 무기 타입 10종 각각 다른 모델 (색/발광은 시대 티어, 보석은 등급 반영)
    makeWeapon(wtypeId, ageIdx, rarity) {
        const g = new THREE.Group();
        const c = AGE_COLORS[AGES[ageIdx]];
        const glow = ageIdx >= 4;
        const mat = new THREE.MeshLambertMaterial({ color: c, emissive: glow ? c : 0x000000, emissiveIntensity: glow ? 0.5 : 0 });
        const wood = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
        const dark = new THREE.MeshLambertMaterial({ color: 0x37474f });
        const box = (w, h, d, m, x, y, z, rz) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x || 0, y || 0, z || 0);
            if (rz) mesh.rotation.z = rz;
            g.add(mesh); return mesh;
        };
        const cyl = (r1, r2, h, m, x, y, z, rz) => {
            const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 8), m);
            mesh.position.set(x || 0, y || 0, z || 0);
            if (rz) mesh.rotation.z = rz;
            g.add(mesh); return mesh;
        };
        switch (wtypeId) {
            case 'sword':
                box(0.09, 0.72, 0.04, mat, 0, 0.42);
                box(0.24, 0.05, 0.06, dark, 0, 0.1);
                cyl(0.035, 0.035, 0.18, wood, 0, -0.02);
                break;
            case 'axe':
                cyl(0.035, 0.045, 0.85, wood, 0, 0.3);
                box(0.3, 0.22, 0.05, mat, 0.15, 0.62);
                break;
            case 'spear':
                cyl(0.03, 0.035, 1.05, wood, 0, 0.4);
                { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 8), mat); tip.position.y = 1.03; g.add(tip); }
                break;
            case 'hammer':
                cyl(0.04, 0.05, 0.72, wood, 0, 0.28);
                box(0.3, 0.2, 0.2, mat, 0, 0.66);
                break;
            case 'dagger':
                box(0.07, 0.4, 0.03, mat, 0, 0.24);
                box(0.16, 0.04, 0.05, dark, 0, 0.03);
                cyl(0.03, 0.03, 0.12, wood, 0, -0.05);
                break;
            case 'bow': {
                const arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.028, 6, 14, Math.PI), mat);
                arc.rotation.z = -Math.PI / 2;
                g.add(arc);
                box(0.012, 0.84, 0.012, dark, -0.01, 0); // 시위
                break;
            }
            case 'crossbow':
                box(0.09, 0.55, 0.09, wood, 0, 0.2);       // 총몸
                box(0.5, 0.06, 0.05, mat, 0, 0.42);        // 활대
                box(0.012, 0.3, 0.012, dark, 0, 0.42);
                break;
            case 'gun':
                box(0.08, 0.5, 0.07, mat, 0, 0.3);         // 총열(위로)
                box(0.07, 0.16, 0.09, dark, 0, 0.02, 0.02);// 그립
                box(0.14, 0.1, 0.08, mat, 0, 0.16);
                break;
            case 'staff':
                cyl(0.032, 0.038, 0.95, wood, 0, 0.35);
                { const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8),
                    new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.8 }));
                  orb.position.y = 0.88; g.add(orb); this._staffOrb = orb; }
                break;
            case 'thrown':
                cyl(0.03, 0.035, 0.42, wood, 0, 0.14);
                box(0.2, 0.15, 0.04, mat, 0.1, 0.36);
                break;
            default: // 무기 없음 → 나무 몽둥이
                cyl(0.045, 0.06, 0.5, wood, 0, 0.22);
        }
        // 시대 구간별 디테일 (같은 무기도 시대에 따라 다르게)
        if (ageIdx >= 3 && ageIdx <= 6) { // 근현대~우주: 테크 액센트 스트립
            const strip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 0.012),
                new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.9 }));
            strip.position.set(0.03, 0.38, 0.02);
            g.add(strip);
        } else if (ageIdx >= 7) { // 멀티버스 이후: 에너지 링
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 14),
                new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 1 }));
            ring.position.y = 0.72;
            g.add(ring);
            mat.emissiveIntensity = 0.7;
        }
        // 등급 연출: 높을수록 화려하게
        const rIdx = RARITIES.indexOf(rarity);
        if (rIdx >= 1) { // 희귀+: 등급색 젬
            const gem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6),
                new THREE.MeshLambertMaterial({ color: RARITY_HEX[rarity], emissive: RARITY_HEX[rarity], emissiveIntensity: 0.9 }));
            gem.position.set(0, 0.02, 0.05);
            g.add(gem);
        }
        if (rIdx >= 2) { // 영웅+: 등급색 트림 링
            const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10),
                new THREE.MeshLambertMaterial({ color: RARITY_HEX[rarity], emissive: RARITY_HEX[rarity], emissiveIntensity: 0.7 }));
            trim.position.y = 0.12;
            g.add(trim);
        }
        if (rIdx >= 3) { // 전설+: 떠다니는 오브
            const orbCount = rIdx - 2; // 전설1, 궁극2, 신화3
            for (let i = 0; i < orbCount; i++) {
                const orb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 6),
                    new THREE.MeshLambertMaterial({ color: RARITY_HEX[rarity], emissive: RARITY_HEX[rarity], emissiveIntensity: 1 }));
                orb.position.set(Math.cos(i * 2.1) * 0.16, 0.45 + i * 0.14, Math.sin(i * 2.1) * 0.12);
                g.add(orb);
            }
        }
        g.scale.setScalar((1 + ageIdx * 0.05) * (1 + Math.max(0, rIdx - 2) * 0.05));
        return g;
    },

    refreshHeroEquip(withFlash) {
        if (!this.heroG) return;
        // 무기 (타입별 모델 + 모션 + 등급 젬 + 거치 자세)
        while (this.weaponG.children.length) this.weaponG.remove(this.weaponG.children[0]);
        const w = S.equipment.weapon;
        this.wtypeId = w ? (w.wtype || 'sword') : 'club';
        this.weaponG.add(this.makeWeapon(this.wtypeId, w ? w.ageIdx : 0, w && w.rarity));
        const wtDef = WEAPON_TYPES[this.wtypeId];
        this.armRest = wtDef ? wtDef.restX : -0.25;
        this.armR.rotation.x = this.armRest;
        // 투구: 이름별 스타일 모델
        while (this.helmetG.children.length) this.helmetG.remove(this.helmetG.children[0]);
        const h = S.equipment.helmet;
        if (h) this.helmetG.add(this.makeHelmet(h.age, h.rarity, itemStyleOf(h)));
        // 갑옷 → 색 + 이름별 스타일 (견갑/흉갑 유무, 부속 장착)
        const a = S.equipment.armor;
        const c = a ? AGE_COLORS[a.age] : 0xb0bec5;
        const aIdx = a ? RARITIES.indexOf(a.rarity) : 0;
        for (const m of this.armorMats) {
            m.color.setHex(c);
            // 궁극+ 갑옷은 은은한 등급색 발광
            m.emissive = new THREE.Color(aIdx >= 4 ? RARITY_HEX[a.rarity] : 0x000000);
            m.emissiveIntensity = aIdx >= 4 ? 0.18 : 0;
        }
        const ec = a ? RARITY_HEX[a.rarity] : 0x78909c;
        this.emblemMat.color.setHex(ec);
        this.emblemMat.emissive = new THREE.Color(a ? ec : 0x000000);
        this.emblemMat.emissiveIntensity = a ? 0.6 : 0;
        const style = a ? itemStyleOf(a) : 'plate';
        this.shoulderPads.forEach(p => p.visible = style === 'plate');
        this.chestPlate.visible = style !== 'hide' && style !== 'robe';
        while (this.armorExtraG.children.length) this.armorExtraG.remove(this.armorExtraG.children[0]);
        this.armorExtraG.add(this.makeArmorExtras(style, c, ec));
        // 장비 교체 연출: 반짝 + 상승 파티클
        if (withFlash) {
            for (const m of this.armorMats) { m.emissive = new THREE.Color(0xffffff); m.emissiveIntensity = 0.8; }
            setTimeout(() => this.refreshHeroEquip(false), 150); // 발광 상태 원복

            for (let i = 0; i < 12; i++) {
                this.riseParticle(this.heroG.position.clone().add(new THREE.Vector3(U.rand(-0.4, 0.4), U.rand(0.2, 1.3), U.rand(-0.3, 0.3))), new THREE.Color(0xfff59d));
            }
            this.expandRing(this.heroG.position.clone(), new THREE.Color(0xfff59d), 1.2);
        }
    },

    // 투구: 이름별 스타일 11종
    makeHelmet(age, rarity, style) {
        const g = new THREE.Group();
        const c = AGE_COLORS[age];
        const pc = RARITY_HEX[rarity] || 0xef5350; // 장식 = 등급색
        const mat = new THREE.MeshLambertMaterial({ color: c });
        const darkMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
        const rareMat = new THREE.MeshLambertMaterial({ color: pc, emissive: pc, emissiveIntensity: 0.45 });
        style = style || 'plume';

        if (style === 'plume') {            // 돔 + 깃장식
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
            dome.position.y = 0.03;
            const plume = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 8), rareMat);
            plume.position.y = 0.42;
            g.add(dome, plume);
        } else if (style === 'cone') {      // 고깔 모자 (마법사/사신)
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 10), mat);
            cone.position.y = 0.34;
            cone.rotation.z = 0.12;
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 12), mat);
            brim.position.y = 0.08;
            g.add(cone, brim);
        } else if (style === 'tophat') {    // 실크햇/제모
            const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 14), mat);
            brim.position.y = 0.1;
            const top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.38, 14), mat);
            top.position.y = 0.3;
            const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.205, 0.07, 14), rareMat);
            ribbon.position.y = 0.15;
            g.add(brim, top, ribbon);
        } else if (style === 'visor') {     // 풀헬름 (얼굴 덮는 투구 + 눈 슬릿)
            const helm = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.72), mat);
            helm.position.y = 0.02;
            const slit = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.045, 0.06), darkMat);
            slit.position.set(0, 0.0, 0.24);
            g.add(helm, slit);
        } else if (style === 'fin') {       // 볏 투구 (로마/사무라이)
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), mat);
            dome.position.y = 0.02;
            const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.36), rareMat);
            crest.position.y = 0.32;
            const cheek1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.12), mat);
            cheek1.position.set(-0.24, -0.08, 0.1);
            const cheek2 = cheek1.clone(); cheek2.position.x = 0.24;
            g.add(dome, crest, cheek1, cheek2);
        } else if (style === 'mask') {      // 가면/방독면: 눈구멍 뚫린 얼굴 판
            const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.07), mat);
            plate.position.set(0, -0.02, 0.2);
            for (const dx of [-0.09, 0.09]) {
                const hole = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), darkMat);
                hole.position.set(dx, 0.04, 0.245);
                g.add(hole);
            }
            const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 8), rareMat);
            mouth.rotation.x = Math.PI / 2;
            mouth.position.set(0, -0.1, 0.24);
            const strap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.045), darkMat);
            strap.position.y = 0.02;
            g.add(plate, mouth, strap);
        } else if (style === 'halo') {      // 후광 (빛나는 링)
            const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20),
                new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0xffd54f, emissiveIntensity: 1 }));
            halo.rotation.x = Math.PI / 2;
            halo.position.y = 0.48;
            g.add(halo);
        } else if (style === 'hair') {      // 머리카락/수염/비니
            const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
            cap.position.y = 0.04;
            cap.scale.y = 0.85;
            const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat);
            tuft.position.set(0.1, 0.24, 0.05);
            g.add(cap, tuft);
        } else if (style === 'crown') {     // 왕관/화관
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.12, 12), mat);
            band.position.y = 0.16;
            g.add(band);
            for (let i = 0; i < 5; i++) {
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 6), rareMat);
                const a = (i / 5) * Math.PI * 2;
                spike.position.set(Math.cos(a) * 0.21, 0.28, Math.sin(a) * 0.21);
                g.add(spike);
            }
        } else if (style === 'tech') {      // 메카 헬름 (각진 + 안테나 + 발광 바이저)
            const boxh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 0.34), mat);
            boxh.position.y = 0.05;
            const eye = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.03), rareMat);
            eye.position.set(0, 0.04, 0.19);
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), darkMat);
            ant.position.set(0.15, 0.3, 0);
            const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), rareMat);
            antTip.position.set(0.15, 0.42, 0);
            g.add(boxh, eye, ant, antTip);
        } else if (style === 'bubble') {    // 우주 헬멧 (투명 돔)
            const bub = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 10),
                new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: 0.32 }));
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 18), mat);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = -0.16;
            g.add(bub, rim);
        }
        return g;
    },

    // 갑옷 스타일별 부속 (몸통 기준 좌표 — 영웅 몸통 y0.65)
    makeArmorExtras(style, colorHex, rareHex) {
        const g = new THREE.Group();
        const darker = new THREE.Color(colorHex).offsetHSL(0, 0, -0.12);
        if (style === 'suit') {          // 백팩 + 발광 스트라이프
            const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.14), new THREE.MeshLambertMaterial({ color: darker }));
            pack.position.set(0, 0.68, -0.24);
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.02),
                new THREE.MeshLambertMaterial({ color: rareHex, emissive: rareHex, emissiveIntensity: 0.7 }));
            stripe.position.set(-0.12, 0.65, 0.165);
            g.add(pack, stripe);
        } else if (style === 'vest') {   // 전술 파우치
            for (const dx of [-0.11, 0.11]) {
                const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.06), new THREE.MeshLambertMaterial({ color: 0x37474f }));
                pouch.position.set(dx, 0.56, 0.17);
                g.add(pouch);
            }
        } else if (style === 'robe') {   // 로브 자락
            const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 10, 1, true), new THREE.MeshLambertMaterial({ color: darker, side: THREE.DoubleSide }));
            skirt.position.y = 0.32;
            g.add(skirt);
        } else if (style === 'cape') {   // 망토
            const cape = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.04), new THREE.MeshLambertMaterial({ color: darker }));
            cape.position.set(0, 0.6, -0.2);
            cape.rotation.x = 0.12;
            g.add(cape);
        }
        return g;
    },

    makeArmorPreview(age, rarity, style) {
        const g = new THREE.Group();
        const c = AGE_COLORS[age];
        const mat = new THREE.MeshLambertMaterial({ color: c });
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.3), mat);
        g.add(torso);
        style = style || 'plate';
        if (style !== 'hide' && style !== 'robe') {
            const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), mat);
            chest.position.set(0, 0.1, 0.16);
            g.add(chest);
        }
        if (style === 'plate') {
            for (const dx of [-0.3, 0.3]) {
                const pad = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat);
                pad.position.set(dx, 0.24, 0);
                pad.scale.y = 0.75;
                g.add(pad);
            }
        }
        const extras = this.makeArmorExtras(style, c, RARITY_HEX[rarity] || 0xffffff);
        extras.position.y = -0.65; // 부속 좌표계를 프리뷰 몸통 기준으로 보정
        g.add(extras);
        return g;
    },

    // ---- 장비 썸네일: 미니 렌더러로 실제 3D 모델을 찍어 이미지 생성 (캐시) ----
    _thumbCache: {},
    itemThumb(item) {
        if (!item || !['weapon', 'helmet', 'armor'].includes(item.slot)) return null;
        const key = item.slot + ':' + (item.wtype || '') + ':' + item.age + ':' + item.rarity + ':' + (item.nameIdx !== undefined ? item.nameIdx : '');
        if (this._thumbCache[key]) return this._thumbCache[key];
        try {
            if (!this._thumbR) {
                this._thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
                this._thumbR.setSize(96, 96);
                this._thumbScene = new THREE.Scene();
                this._thumbCam = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
                this._thumbCam.position.set(1.0, 0.95, 2.3);
                this._thumbCam.lookAt(0, 0.4, 0);
                this._thumbAmb = new THREE.AmbientLight(0xffffff, 0.85);
                this._thumbDir = new THREE.DirectionalLight(0xffffff, 0.8);
                this._thumbDir.position.set(2, 3, 2);
            }
            const sc = this._thumbScene;
            while (sc.children.length) sc.remove(sc.children[0]);
            sc.add(this._thumbAmb, this._thumbDir);
            let model;
            if (item.slot === 'weapon') {
                model = this.makeWeapon(item.wtype || 'sword', item.ageIdx, item.rarity);
                model.position.y = -0.15;
            } else if (item.slot === 'helmet') {
                model = this.makeHelmet(item.age, item.rarity, itemStyleOf(item));
                model.scale.setScalar(1.5);
                model.position.y = 0.1;
            } else {
                model = this.makeArmorPreview(item.age, item.rarity, itemStyleOf(item));
                model.scale.setScalar(1.3);
                model.position.y = 0.35;
            }
            sc.add(model);
            this._thumbR.render(sc, this._thumbCam);
            const url = this._thumbR.domElement.toDataURL();
            this._thumbCache[key] = url;
            return url;
        } catch (e) { return null; }
    },

    // ---- 펫: 종별 실물 모델 25종 ----
    makePetMesh(name) {
        const g = new THREE.Group();
        const c = PET_COLORS[name] || 0xbdbdbd;
        const M = (col, opt) => new THREE.MeshLambertMaterial(Object.assign({ color: col }, opt || {}));
        const mat = M(c);
        const dark = M(new THREE.Color(c).offsetHSL(0, 0, -0.15));
        const light = M(new THREE.Color(c).offsetHSL(0, 0, 0.14));
        const blk = new THREE.MeshBasicMaterial({ color: 0x263238 });
        // 헬퍼: 정면 +z, 바닥 y0 기준
        const sp = (r, x, y, z, m, sx, sy, sz) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), m || mat); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy, sz); g.add(o); return o; };
        const bx = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const cn = (r, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const cy = (r1, r2, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 7), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const eyes = (y, z, gap, r) => { for (const s of [-1, 1]) sp(r || 0.028, s * (gap || 0.06), y, z, blk); };

        switch (name) {
            case 'Snail': { // 몸통 + 나선 껍데기 + 더듬이눈
                sp(0.13, 0, 0.09, 0.04, mat, 1.1, 0.7, 1.5);
                sp(0.15, 0, 0.26, -0.08, light);
                sp(0.09, 0, 0.26, -0.08, dark, 1.05, 1.05, 0.5);
                for (const s of [-1, 1]) {
                    cy(0.012, 0.012, 0.14, s * 0.05, 0.24, 0.2, dark);
                    sp(0.028, s * 0.05, 0.32, 0.21, blk);
                }
                break;
            }
            case 'Turtle': { // 등딱지 + 머리 + 다리
                sp(0.19, 0, 0.15, 0, dark, 1, 0.62, 1.2);
                sp(0.14, 0, 0.19, 0, M(new THREE.Color(c).offsetHSL(0, 0, -0.25)), 1, 0.5, 1);
                sp(0.08, 0, 0.13, 0.26, light);
                for (const s of [-1, 1]) { sp(0.05, s * 0.14, 0.05, 0.14, light); sp(0.05, s * 0.14, 0.05, -0.14, light); }
                eyes(0.17, 0.32, 0.045, 0.02);
                break;
            }
            case 'Mouse': { // 큰 귀 + 꼬리
                sp(0.14, 0, 0.13, 0, mat, 1, 0.95, 1.2);
                for (const s of [-1, 1]) sp(0.075, s * 0.09, 0.3, -0.02, light, 1, 1, 0.4);
                sp(0.025, 0, 0.1, 0.17, M(0xf48fb1));
                const tail = cy(0.012, 0.012, 0.26, 0, 0.1, -0.2, dark); tail.rotation.x = 1.3;
                eyes(0.17, 0.13);
                break;
            }
            case 'Chicken': { // 볏 + 부리 + 날개
                sp(0.13, 0, 0.16, 0);
                for (let i = 0; i < 3; i++) sp(0.03, 0, 0.32 - i * 0.01, 0.04 - i * 0.05, M(0xef5350));
                const beak = cn(0.035, 0.09, 0, 0.17, 0.16, M(0xffa726)); beak.rotation.x = Math.PI / 2;
                for (const s of [-1, 1]) sp(0.07, s * 0.12, 0.15, -0.02, light, 0.5, 0.8, 1);
                for (const s of [-1, 1]) cy(0.012, 0.012, 0.1, s * 0.05, 0.03, 0, M(0xffa726));
                eyes(0.2, 0.11);
                break;
            }
            case 'Cat': case 'Tiger': case 'Saber Tooth': case 'Spectral Tiger': { // 고양잇과 공통 + 변형
                const ghost = name === 'Spectral Tiger';
                const bmat = ghost ? M(c, { transparent: true, opacity: 0.6, emissive: c, emissiveIntensity: 0.4 }) : mat;
                sp(0.12, 0, 0.12, -0.02, bmat, 1, 0.95, 1.3);
                sp(0.11, 0, 0.28, 0.1, bmat);
                for (const s of [-1, 1]) cn(0.04, 0.08, s * 0.07, 0.4, 0.08, bmat);
                const tail = cy(0.018, 0.012, 0.2, 0, 0.2, -0.2, bmat); tail.rotation.x = -0.9;
                if (name === 'Tiger' || name === 'Spectral Tiger') for (let i = 0; i < 3; i++) bx(0.02, 0.09, 0.16, -0.06 + i * 0.06, 0.15, -0.02, blk);
                if (name === 'Saber Tooth') for (const s of [-1, 1]) cn(0.015, 0.07, s * 0.05, 0.2, 0.18, M(0xffffff));
                eyes(0.3, 0.19);
                break;
            }
            case 'Dog': { // 늘어진 귀 + 주둥이
                sp(0.13, 0, 0.13, -0.02, mat, 1, 0.95, 1.25);
                sp(0.11, 0, 0.29, 0.1);
                for (const s of [-1, 1]) sp(0.05, s * 0.11, 0.26, 0.06, dark, 0.6, 1.3, 0.7);
                sp(0.055, 0, 0.25, 0.2, light);
                sp(0.022, 0, 0.27, 0.25, blk);
                const tail = cy(0.015, 0.01, 0.16, 0, 0.2, -0.19); tail.rotation.x = -0.7;
                eyes(0.33, 0.18);
                break;
            }
            case 'Hedgehog': { // 등 가시
                sp(0.14, 0, 0.12, 0.02, light, 1.1, 0.85, 1.25);
                for (let i = 0; i < 7; i++) {
                    const a = (i / 7) * Math.PI - Math.PI / 2;
                    const s2 = cn(0.03, 0.11, Math.sin(a) * 0.1, 0.2 + Math.cos(a) * 0.06, -0.05 - Math.abs(Math.sin(a)) * 0.04, dark);
                    s2.rotation.z = -a * 0.8;
                }
                sp(0.03, 0, 0.1, 0.2, blk);
                eyes(0.15, 0.17, 0.05);
                break;
            }
            case 'Bear': { // 둥근 귀 + 주둥이
                sp(0.16, 0, 0.16, 0);
                sp(0.12, 0, 0.34, 0.05);
                for (const s of [-1, 1]) sp(0.045, s * 0.09, 0.44, 0.01, dark);
                sp(0.055, 0, 0.31, 0.15, light);
                sp(0.025, 0, 0.33, 0.2, blk);
                eyes(0.38, 0.14);
                break;
            }
            case 'Ostrich': { // 긴 목
                sp(0.13, 0, 0.24, 0, mat, 1.1, 1, 1.1);
                cy(0.022, 0.028, 0.26, 0.02, 0.45, 0.06, light);
                sp(0.055, 0.02, 0.6, 0.09);
                const beak = cn(0.025, 0.07, 0.02, 0.6, 0.16, M(0xffa726)); beak.rotation.x = Math.PI / 2;
                for (const s of [-1, 1]) cy(0.013, 0.013, 0.2, s * 0.05, 0.08, 0, M(0xbcaaa4));
                eyes(0.63, 0.12, 0.04, 0.02);
                break;
            }
            case 'Scorpion': { // 집게 + 꼬리침
                sp(0.12, 0, 0.08, -0.02, mat, 1.35, 0.6, 1.5);
                sp(0.045, 0, 0.17, -0.16, dark);
                sp(0.04, 0, 0.27, -0.2, dark);
                sp(0.035, 0, 0.36, -0.16, dark);
                const sting = cn(0.028, 0.09, 0, 0.42, -0.1, blk); sting.rotation.x = 2.5;
                for (const s of [-1, 1]) {
                    sp(0.055, s * 0.13, 0.07, 0.15, dark);
                    sp(0.04, s * 0.16, 0.07, 0.22, dark, 1, 0.7, 1.2);
                    for (let i = 0; i < 3; i++) {
                        const leg = cy(0.01, 0.01, 0.12, s * 0.15, 0.05, -0.04 + i * 0.07, dark);
                        leg.rotation.z = s * 1.1;
                    }
                }
                eyes(0.12, 0.2, 0.05, 0.02);
                break;
            }
            case 'Spider': { // 다리 8개
                sp(0.12, 0, 0.14, -0.05);
                sp(0.08, 0, 0.12, 0.11, light);
                for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
                    const leg = cy(0.01, 0.008, 0.18, s * 0.14, 0.1, -0.1 + i * 0.07, dark);
                    leg.rotation.z = s * (1.15 - i * 0.08);
                }
                for (const s of [-1, 1]) { sp(0.022, s * 0.035, 0.15, 0.18, new THREE.MeshBasicMaterial({ color: 0xff1744 })); sp(0.014, s * 0.075, 0.13, 0.17, new THREE.MeshBasicMaterial({ color: 0xff1744 })); }
                break;
            }
            case 'Panda': { // 흑백
                const wht = M(0xf5f5f5), b = M(0x37474f);
                sp(0.15, 0, 0.15, 0, wht);
                sp(0.12, 0, 0.32, 0.04, wht);
                for (const s of [-1, 1]) { sp(0.045, s * 0.1, 0.42, 0, b); sp(0.035, s * 0.055, 0.33, 0.13, b, 1, 1.3, 0.5); sp(0.05, s * 0.14, 0.14, 0.06, b); }
                sp(0.022, 0, 0.29, 0.16, blk);
                eyes(0.34, 0.15, 0.055, 0.018);
                break;
            }
            case 'Griffin': { // 날개 + 부리
                sp(0.13, 0, 0.15, -0.02, mat, 1, 1, 1.25);
                sp(0.1, 0, 0.3, 0.1, light);
                const beak = cn(0.03, 0.08, 0, 0.3, 0.2, M(0xffa726)); beak.rotation.x = Math.PI / 2;
                for (const s of [-1, 1]) {
                    const wing = sp(0.11, s * 0.14, 0.26, -0.06, light, 0.25, 1, 0.8);
                    wing.rotation.z = s * 0.5;
                }
                eyes(0.34, 0.18);
                break;
            }
            case 'Unicorn': { // 뿔 + 갈기
                sp(0.14, 0, 0.18, 0, mat, 1.05, 0.9, 1.3);
                sp(0.09, 0, 0.37, 0.15);
                cn(0.022, 0.13, 0, 0.5, 0.17, M(0xffd54f, { emissive: 0xffd54f, emissiveIntensity: 0.6 }));
                for (let i = 0; i < 3; i++) sp(0.035, -0.01, 0.42 - i * 0.06, 0.04 - i * 0.03, M(0xba68c8));
                for (const s of [-1, 1]) { cy(0.02, 0.02, 0.14, s * 0.08, 0.06, 0.08); cy(0.02, 0.02, 0.14, s * 0.08, 0.06, -0.1); }
                eyes(0.4, 0.22, 0.045);
                break;
            }
            case 'Cerberus': { // 머리 셋
                sp(0.15, 0, 0.15, -0.02, mat, 1.25, 0.95, 1.2);
                for (const dx of [-0.13, 0, 0.13]) {
                    sp(0.08, dx, 0.32, 0.08 + (dx === 0 ? 0.04 : 0));
                    for (const s of [-1, 1]) cn(0.025, 0.05, dx + s * 0.05, 0.41, 0.05);
                    for (const s of [-1, 1]) sp(0.018, dx + s * 0.035, 0.34, 0.15, new THREE.MeshBasicMaterial({ color: 0xff1744 }));
                }
                break;
            }
            case 'Kitsune': { // 꼬리 셋 여우
                sp(0.12, 0, 0.13, 0, mat, 1, 0.95, 1.25);
                sp(0.1, 0, 0.28, 0.1);
                cn(0.03, 0.07, 0, 0.26, 0.2, M(0xffffff));
                for (const s of [-1, 1]) cn(0.045, 0.1, s * 0.07, 0.4, 0.06);
                for (const dx of [-0.09, 0, 0.09]) {
                    const tail = cn(0.045, 0.2, dx, 0.24, -0.18, light);
                    tail.rotation.x = -0.9 - Math.abs(dx);
                }
                eyes(0.3, 0.18);
                break;
            }
            case 'Serpent': { // 또아리 + 든 머리
                sp(0.11, 0, 0.07, 0, mat, 1.5, 0.6, 1.5);
                sp(0.09, 0, 0.16, -0.02, mat, 1.25, 0.55, 1.25);
                cy(0.045, 0.055, 0.16, 0.02, 0.28, 0.06);
                sp(0.07, 0.02, 0.4, 0.1);
                bx(0.015, 0.008, 0.06, 0.02, 0.38, 0.19, new THREE.MeshBasicMaterial({ color: 0xff5252 }));
                eyes(0.43, 0.15, 0.04, 0.02);
                break;
            }
            case 'Treant': { // 나무 정령
                const wood = M(0x6d4c41);
                cy(0.07, 0.1, 0.3, 0, 0.15, 0, wood);
                sp(0.14, 0, 0.38, 0, mat);
                sp(0.08, 0.12, 0.32, 0.03, mat);
                for (const s of [-1, 1]) { const arm = cy(0.02, 0.025, 0.16, s * 0.11, 0.2, 0.02, wood); arm.rotation.z = s * 0.9; }
                eyes(0.18, 0.09, 0.045);
                break;
            }
            case 'Enchanted Elk': { // 가지뿔
                sp(0.13, 0, 0.2, 0, mat, 1, 0.85, 1.3);
                sp(0.08, 0, 0.37, 0.14);
                for (const s of [-1, 1]) {
                    const a1 = cy(0.012, 0.012, 0.16, s * 0.06, 0.5, 0.1, M(0xfff59d, { emissive: 0xfff59d, emissiveIntensity: 0.5 })); a1.rotation.z = s * 0.5;
                    const a2 = cy(0.01, 0.01, 0.09, s * 0.11, 0.55, 0.1, M(0xfff59d, { emissive: 0xfff59d, emissiveIntensity: 0.5 })); a2.rotation.z = s * 1.2;
                }
                for (const s of [-1, 1]) { cy(0.018, 0.018, 0.16, s * 0.07, 0.07, 0.08); cy(0.018, 0.018, 0.16, s * 0.07, 0.07, -0.09); }
                eyes(0.4, 0.2, 0.04);
                break;
            }
            case 'Electry': { // 전기 구체
                sp(0.13, 0, 0.2, 0, M(c, { emissive: c, emissiveIntensity: 0.8 }));
                for (let i = 0; i < 4; i++) {
                    const bolt = bx(0.02, 0.12, 0.02, Math.cos(i * 1.57) * 0.17, 0.2 + Math.sin(i * 1.57) * 0.17, 0, M(0xffff00, { emissive: 0xffff00, emissiveIntensity: 1 }));
                    bolt.rotation.z = i * 0.8;
                }
                eyes(0.22, 0.12);
                break;
            }
            case 'Genie': { // 연기 하체 + 터번
                cn(0.02, 0.18, 0, 0.09, 0, M(new THREE.Color(c).offsetHSL(0, 0, -0.1), { transparent: true, opacity: 0.7 }));
                cy(0.09, 0.03, 0.14, 0, 0.22, 0, M(c, { transparent: true, opacity: 0.85 }));
                sp(0.11, 0, 0.36, 0, mat);
                sp(0.09, 0, 0.5, 0, light);
                sp(0.03, 0, 0.56, 0.07, M(0xffd54f, { emissive: 0xffd54f, emissiveIntensity: 0.6 }));
                for (const s of [-1, 1]) sp(0.04, s * 0.12, 0.36, 0.04);
                eyes(0.5, 0.08);
                break;
            }
            case 'Baby Dragon': { // 날개 + 뿔 + 꼬리
                sp(0.13, 0, 0.15, 0, mat, 1, 0.95, 1.2);
                sp(0.1, 0, 0.32, 0.09);
                sp(0.05, 0, 0.29, 0.18, light);
                for (const s of [-1, 1]) cn(0.02, 0.06, s * 0.05, 0.42, 0.04, M(0xffffff));
                for (const s of [-1, 1]) {
                    const wing = sp(0.1, s * 0.15, 0.24, -0.05, dark, 0.2, 1, 0.7);
                    wing.rotation.z = s * 0.6;
                }
                const tail = cn(0.035, 0.16, 0, 0.12, -0.2, mat); tail.rotation.x = -2.1;
                eyes(0.35, 0.17);
                break;
            }
            default:
                sp(0.14, 0, 0.15, 0);
                eyes(0.2, 0.12);
        }
        return g;
    },

    refreshPets() {
        for (const pg of this.petGroups) this.scene.remove(pg);
        this.petGroups = [];
        S.activePets.forEach((pi, i) => {
            const p = S.pets[pi];
            if (!p) return;
            const g = new THREE.Group();
            const mesh = this.makePetMesh(p.name);
            // 등급이 높을수록 큼직하게
            mesh.scale.setScalar(0.85 + RARITIES.indexOf(p.rarity) * 0.14);
            g.add(mesh);
            g.rotation.y = 0.55; // 적 방향 3/4
            const spots = [[-0.1, 0.95], [-0.45, -0.65], [-0.3, 1.45]]; // 영웅 주변 대형 (화면 안)
            g.position.set(Combat.HERO_X + spots[i][0], 0.45 + i * 0.18, spots[i][1]);
            g.userData.home = g.position.clone();
            this.scene.add(g);
            this.petGroups.push(g);
        });
    },

    // ---- 적: 구체적인 몬스터 3종 (슬라임/골렘/고블린) ----
    monsterMesh(e) {
        const theme = CHAPTER_THEMES[(S.chapter - 1) % CHAPTER_THEMES.length];
        const base = new THREE.Color(theme.ground).offsetHSL(U.rand(-0.08, 0.08), 0.2, -0.08);
        const g = new THREE.Group();
        const kind = (S.chapter + e.id) % 3;
        const flashMats = [];
        const lam = c => { const m = new THREE.MeshLambertMaterial({ color: c }); flashMats.push(m); return m; };
        let body, armR = null, armL = null, eyeY, eyeZ, eyeGap;

        if (kind === 0) {
            // 슬라임: 젤리 몸통 + 혹 + 입
            body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), lam(base));
            body.scale.y = 0.72; body.position.y = 0.34;
            const blob = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), lam(base.clone().offsetHSL(0, 0, 0.08)));
            blob.position.set(0.14, 0.66, 0);
            const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.03), new THREE.MeshBasicMaterial({ color: 0x37474f }));
            mouth.position.set(0, 0.26, 0.42);
            g.add(body, blob, mouth);
            eyeY = 0.42; eyeZ = 0.4; eyeGap = 0.13;
        } else if (kind === 1) {
            // 골렘: 돌 몸통 + 두꺼운 팔 + 다리 + 각진 머리
            const stone = base.clone().offsetHSL(0, -0.25, 0);
            body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.4), lam(stone));
            body.position.y = 0.6;
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.28), lam(base));
            head.position.y = 1.0;
            for (const dx of [-0.16, 0.16]) {
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.34, 0.2), lam(stone.clone().offsetHSL(0, 0, -0.05)));
                leg.position.set(dx, 0.17, 0);
                g.add(leg);
            }
            armR = new THREE.Group(); armR.position.set(0.37, 0.82, 0);
            const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.5, 0.19), lam(stone.clone().offsetHSL(0, 0, -0.03)));
            armMesh.position.y = -0.22;
            armR.add(armMesh);
            armL = new THREE.Group(); armL.position.set(-0.37, 0.82, 0);
            armL.add(armMesh.clone());
            g.add(body, head, armR, armL);
            eyeY = 1.02; eyeZ = 0.15; eyeGap = 0.08;
        } else {
            // 고블린: 통통한 몸 + 큰 머리 + 뾰족귀 + 몽둥이
            body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), lam(base));
            body.position.y = 0.4; body.scale.y = 1.15;
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), lam(base.clone().offsetHSL(0, 0, 0.06)));
            head.position.y = 0.86;
            g.add(body, head);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 6), lam(base));
                ear.position.set(s * 0.24, 0.98, 0);
                ear.rotation.z = s * -1.1;
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.13), lam(base.clone().offsetHSL(0, 0, -0.06)));
                leg.position.set(s * 0.1, 0.1, 0);
                g.add(ear, leg);
            }
            armR = new THREE.Group(); armR.position.set(0.25, 0.55, 0);
            const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), lam(base));
            armMesh.position.y = -0.12;
            const club = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.42, 6), new THREE.MeshLambertMaterial({ color: 0x6d4c41 }));
            club.position.y = -0.34; club.rotation.z = 0.5;
            armR.add(armMesh, club);
            armL = new THREE.Group(); armL.position.set(-0.25, 0.55, 0);
            armL.add(armMesh.clone());
            g.add(armR, armL);
            eyeY = 0.9; eyeZ = 0.19; eyeGap = 0.09;
        }
        // 빨간 눈 (공통 — 위협감)
        for (const s of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff1744 }));
            eye.position.set(s * eyeGap, eyeY, eyeZ);
            g.add(eye);
        }
        if (e.isBoss) {
            g.scale.setScalar(1.9);
            const crown = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.26, 5), new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0xffd54f, emissiveIntensity: 0.4 }));
            crown.position.y = kind === 0 ? 0.85 : 1.25;
            g.add(crown);
        }
        // HP 바: 카메라를 향하도록 역회전한 서브그룹에 부착
        const hpG = new THREE.Group();
        hpG.rotation.y = 0.55; // 그룹 회전(-0.55) 상쇄
        const barY = e.isBoss ? 1.5 : kind === 0 ? 1.0 : 1.35;
        const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: 0x263238, side: THREE.DoubleSide }));
        hpBg.position.y = barY;
        const hpFg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: 0x69f0ae, side: THREE.DoubleSide }));
        hpFg.position.set(0, barY, 0.01);
        hpG.add(hpBg, hpFg);
        g.add(hpG);
        return { g, body, hpBg, hpFg, armR, armL, flashMats, kind };
    },

    spawnEnemy(e) {
        const m = this.monsterMesh(e);
        m.g.position.set(e.x, 0, 0);
        m.g.rotation.y = -0.55; // 영웅 방향(-x)으로 3/4 자세
        this.scene.add(m.g);
        this.enemyMap.set(e.id, m);
        // 등장: 위에서 낙하 + 스쿼시
        const targetScale = m.g.scale.x;
        m.g.position.y = 3;
        this.addAnim(0.4, k => {
            m.g.position.y = 3 * (1 - k) * (1 - k);
            m.g.scale.y = targetScale * (k > 0.85 ? 1 - (k - 0.85) * 2 : 1);
        }, () => { m.g.position.y = 0; m.g.scale.y = targetScale; });
    },

    clearEnemies() {
        for (const [, m] of this.enemyMap) this.scene.remove(m.g);
        this.enemyMap.clear();
    },

    // ---- 액션 연출 ----
    // 무기 타입별 공격 모션
    heroAttack(targetId) {
        const m = this.enemyMap.get(targetId);
        const tx = Math.min(m ? m.g.position.x - 0.6 : Combat.MELEE_X, 0.7); // 돌진 거리 제한
        const fromX = Combat.HERO_X;
        const wt = WEAPON_TYPES[this.wtypeId];
        const motion = wt ? wt.motion : 'slash';
        const wcolor = S.equipment.weapon ? AGE_COLORS[S.equipment.weapon.age] : 0xcfd8dc;
        this._attacking = true;
        const rest = this.armRest !== undefined ? this.armRest : -0.25;
        const resetArm = () => {
            this._attacking = false;
            this.heroG.position.x = fromX;
            this.heroG.position.y = 0;
            this.heroG.rotation.set(0, 0.55, 0);
            this.armR.rotation.set(rest, 0, 0);
            this.weaponG.rotation.set(0, 0, 0);
            this.weaponG.position.z = 0;
            this.weaponG.visible = true;
        };
        const dash = k => {
            const lunge = k < 0.5 ? k * 2 : (1 - k) * 2;
            this.heroG.position.x = U.lerp(fromX, tx, lunge * 0.85);
            this.heroG.position.y = Math.sin(k * Math.PI) * 0.18;            // 점프
            this.heroG.rotation.y = 0.55 + Math.sin(k * Math.PI) * 0.55;    // 몸통 비틀기
            this.heroG.rotation.z = -Math.sin(k * Math.PI) * 0.15;          // 앞으로 기울임
        };
        // 팔 스윙: 크게 들었다가(정지감) 내려치기
        const swingArm = (k, windup, power) => {
            if (k < 0.32) this.armR.rotation.x = U.lerp(-0.25, windup, k / 0.32);
            else if (k < 0.42) this.armR.rotation.x = windup;               // 타격 직전 멈칫
            else if (k < 0.62) this.armR.rotation.x = U.lerp(windup, -power, (k - 0.42) / 0.2);
            else this.armR.rotation.x = U.lerp(-power, -0.25, (k - 0.62) / 0.38);
        };
        const targetPos = m ? m.g.position.clone().add(new THREE.Vector3(0, 0.6, 0)) : new THREE.Vector3(tx, 0.6, 0);
        const swooshAt = delayMs => setTimeout(() => this.swoosh(wcolor), delayMs);

        if (motion === 'slash') {          // 검: 돌진 + 베기 + 궤적
            this.addAnim(0.34, k => { dash(k); swingArm(k, 1.1, 2.2); }, resetArm);
            swooshAt(150);
        } else if (motion === 'chop') {    // 도끼: 크게 들어 내려찍기
            this.addAnim(0.4, k => { dash(k); swingArm(k, 1.6, 2.4); }, resetArm);
            swooshAt(190);
        } else if (motion === 'thrust') {  // 창: 몸을 낮추고 찌르기
            this.addAnim(0.3, k => {
                dash(k);
                const push = Math.sin(k * Math.PI);
                this.armR.rotation.x = U.lerp(-0.25, -1.6, push);
                this.weaponG.position.z = push * 0.45;
            }, resetArm);
            swooshAt(130);
        } else if (motion === 'slam') {    // 해머: 내려찍기 + 지면 충격파
            this.addAnim(0.42, k => { dash(k); swingArm(k, 1.7, 2.5); }, resetArm);
            setTimeout(() => {
                this.expandRing(new THREE.Vector3(Math.min(tx + 0.5, 1.2), 0, 0), new THREE.Color(0xffcc80), 1.2);
                this.swoosh(wcolor);
                this.shake(0.15);
            }, 210);
        } else if (motion === 'double') {  // 단검: 빠른 2연타 + 이중 궤적
            this.addAnim(0.26, k => {
                dash(k);
                this.armR.rotation.x = -0.25 - Math.abs(Math.sin(k * Math.PI * 2)) * 1.8;
            }, resetArm);
            swooshAt(70); swooshAt(180);
        } else if (motion === 'bow') {     // 활/석궁: 조준 자세에서 시위 당겼다 놓기
            this.addAnim(0.36, k => {
                this.heroG.rotation.y = 0.55 + 0.4; // 적을 향해 몸 돌림
                this.armR.rotation.x = rest;        // 팔은 계속 조준 유지
                if (k < 0.45) this.weaponG.position.z = -0.2 * (k / 0.45);            // 시위 당김 (활이 뒤로)
                else if (k < 0.55) this.weaponG.position.z = 0.06;                     // 발사 순간 튕김
                else {
                    this.weaponG.position.z = 0.06 * (1 - (k - 0.55) / 0.45);
                    this.armR.rotation.x = rest - Math.sin((k - 0.55) / 0.45 * Math.PI) * 0.25; // 반동
                }
            }, resetArm);
            this.fireProjectile('arrow', targetPos, 0x8d6e63, wt.impact);
        } else if (motion === 'gun') {     // 총: 조준 유지 + 발사 반동 + 총구 화염
            this.addAnim(0.22, k => {
                this.heroG.rotation.y = 0.55 + 0.4;
                this.armR.rotation.x = rest + Math.sin(k * Math.PI) * 0.4; // 총구 들림
                this.heroG.position.x = fromX - Math.sin(k * Math.PI) * 0.14; // 몸 밀림
                this.heroG.rotation.z = Math.sin(k * Math.PI) * 0.06;
            }, resetArm);
            this.muzzleFlash();
            this.fireProjectile('bullet', targetPos, 0xffee58, wt.impact);
        } else if (motion === 'cast') {    // 지팡이: 치켜들고 마법탄 + 오브 발광
            this.addAnim(0.38, k => {
                this.heroG.rotation.y = 0.55 + Math.sin(k * Math.PI) * 0.25;
                this.armR.rotation.x = U.lerp(-0.25, -2.7, Math.sin(k * Math.PI));
                this.heroG.position.y = Math.sin(k * Math.PI) * 0.1;
            }, resetArm);
            this.flashLight(this.heroG.position, wcolor, 0.3);
            this.fireProjectile('magic', targetPos, wcolor, wt.impact);
        } else if (motion === 'throw') {   // 투척: 몸 비틀어 던지기, 무기 회전 비행
            this.weaponG.visible = false;
            this.addAnim(0.32, k => {
                this.heroG.rotation.y = 0.55 + Math.sin(k * Math.PI) * 0.7;
                swingArm(k, 1.4, 2.2);
            }, resetArm);
            this.fireProjectile('spin', targetPos, wcolor, wt.impact);
        } else {                            // 맨손/몽둥이
            this.addAnim(0.34, k => { dash(k); swingArm(k, 1.1, 2.2); }, resetArm);
            swooshAt(150);
        }
    },

    // 무기 궤적 스우시: 영웅 앞에 호(arc)가 번쩍이며 커짐
    swoosh(colorHex) {
        const arc = new THREE.Mesh(
            new THREE.TorusGeometry(0.55, 0.07, 6, 16, Math.PI * 1.1),
            new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
        );
        arc.position.set(this.heroG.position.x + 0.55, 1.0, 0.25);
        arc.rotation.set(0, 0.4, -0.9);
        this.scene.add(arc);
        this.addAnim(0.18, k => {
            arc.scale.setScalar(1 + k * 0.8);
            arc.rotation.z = -0.9 - k * 1.6; // 호가 휘둘러지는 느낌
            arc.material.opacity = 0.85 * (1 - k);
        }, () => this.scene.remove(arc));
    },

    // ---- 투사체 ----
    projectiles: [],
    fireProjectile(kind, to, colorHex, dur) {
        const from = new THREE.Vector3(Combat.HERO_X + 0.45, 1.05, 0.1);
        let mesh;
        if (kind === 'arrow') {
            mesh = new THREE.Group();
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5), new THREE.MeshBasicMaterial({ color: colorHex }));
            shaft.rotation.z = -Math.PI / 2;
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 5), new THREE.MeshBasicMaterial({ color: 0xb0bec5 }));
            tip.rotation.z = -Math.PI / 2; tip.position.x = 0.26;
            mesh.add(shaft, tip);
        } else if (kind === 'bullet') {
            mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshBasicMaterial({ color: colorHex }));
        } else if (kind === 'magic') {
            mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 }));
        } else { // spin (투척 도끼)
            mesh = this.makeWeapon('thrown', S.equipment.weapon ? S.equipment.weapon.ageIdx : 0);
            mesh.scale.setScalar(0.9);
        }
        mesh.position.copy(from);
        this.scene.add(mesh);
        this.projectiles.push({ mesh, from, to: to.clone(), t: 0, dur, kind, color: colorHex });
    },

    muzzleFlash() {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xfff176, transparent: true }));
        p.position.set(Combat.HERO_X + 0.55, 1.15, 0.1);
        this.scene.add(p);
        this.addAnim(0.09, k => { p.scale.setScalar(1 + k); p.material.opacity = 1 - k; }, () => this.scene.remove(p));
    },

    enemyAttack(id) {
        const m = this.enemyMap.get(id);
        if (!m) return;
        const ox = m.g.position.x;
        this.addAnim(0.3, k => {
            m.g.position.x = ox - Math.sin(k * Math.PI) * 0.55;
            if (m.armR) m.armR.rotation.x = -Math.sin(k * Math.PI) * 1.6; // 팔 휘두르기
        }, () => {
            const e = Combat.enemies.find(x => x.id === id);
            m.g.position.x = e ? e.x : ox;
            if (m.armR) m.armR.rotation.x = 0;
        });
    },

    hitEnemy(id, dmg, crit, kind) {
        const m = this.enemyMap.get(id);
        if (!m) return;
        // 전신 화이트 플래시 + 넉백
        for (const mat of m.flashMats) {
            mat.emissive = new THREE.Color(0xffffff);
            mat.emissiveIntensity = 1;
        }
        setTimeout(() => { for (const mat of m.flashMats) mat.emissiveIntensity = 0; }, 80);
        const ox = m.g.position.x;
        this.addAnim(0.18, k => { m.g.position.x = ox + Math.sin(k * Math.PI) * 0.18; });
        this.spawnSparks(m.g.position.clone().add(new THREE.Vector3(0, 0.6, 0)), crit ? 14 : 6, crit ? 0xffab40 : 0xffee58);
        // 데미지 숫자
        const cls = kind === 'skill' ? 'dmg-skill' : kind === 'pet' ? 'dmg-pet' : crit ? 'dmg-crit' : 'dmg';
        this.damageNumber(m.g.position.clone().add(new THREE.Vector3(U.rand(-0.3, 0.3), U.rand(1.1, 1.5), 0)), U.fmt(dmg), cls);
    },

    killEnemy(id, isBoss) {
        const m = this.enemyMap.get(id);
        if (!m) return;
        this.spawnSparks(m.g.position.clone().add(new THREE.Vector3(0, 0.5, 0)), isBoss ? 40 : 16, 0xff7043);
        this.addAnim(0.45, k => {
            m.g.rotation.z = k * Math.PI / 2;
            m.g.position.y = -k * 0.6;
            m.g.scale.multiplyScalar(0.985);
        }, () => { this.scene.remove(m.g); this.enemyMap.delete(id); });
    },

    heroHit() {
        const ox = this.heroG.position.x;
        this.addAnim(0.2, k => { this.heroG.position.x = ox - Math.sin(k * Math.PI) * 0.2; },
            () => { this.heroG.position.x = Combat.HERO_X; });
        UI.flashDamage();
    },

    heroDown() {
        this.addAnim(0.5, k => { this.heroG.rotation.z = k * Math.PI / 2.2; });
        setTimeout(() => { this.heroG.rotation.z = 0; }, 1400);
        this.shake(0.4);
    },

    petAttack(i, targetId) {
        const pg = this.petGroups[i];
        const m = this.enemyMap.get(targetId);
        if (!pg || !m) return;
        const home = pg.userData.home;
        const tx = m.g.position.clone().add(new THREE.Vector3(-0.5, 0.5, 0));
        this.addAnim(0.4, k => {
            const t = k < 0.5 ? k * 2 : (1 - k) * 2;
            pg.position.lerpVectors(home, tx, t);
        }, () => pg.position.copy(home));
    },

    bossEntrance() {
        this.shake(0.5);
        UI.bossWarning();
    },

    // ---- 스킬 이펙트 ----
    skillEffect(fx, colorHex, targetIds) {
        const color = new THREE.Color(colorHex);
        const targets = targetIds.map(id => this.enemyMap.get(id)).filter(Boolean);
        if (fx === 'meteor') {
            targets.forEach((m, i) => setTimeout(() => {
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0),
                    new THREE.MeshBasicMaterial({ color }));
                const tp = m.g.position.clone();
                const start = new THREE.Vector3(tp.x + 1.8, 6.5, 0);
                rock.position.copy(start);
                this.scene.add(rock);
                this.addAnim(0.35, k => {
                    rock.position.lerpVectors(start, tp, k * k);
                    rock.rotation.x += 0.3; rock.rotation.z += 0.2;
                    if (Math.random() < 0.7) { // 불꼬리
                        const trail = rock.position.clone();
                        this.riseParticle(trail, new THREE.Color(0xff7043));
                    }
                }, () => { this.scene.remove(rock); this.explosion(tp, color); this.shake(0.2); });
            }, i * 90));
        } else if (fx === 'explode' || fx === 'breath') {
            targets.forEach((m, i) => setTimeout(() => this.explosion(m.g.position.clone(), color), i * 60));
        } else if (fx === 'ring') {
            this.expandRing(this.heroG.position.clone(), color, 5);
            this.expandRing(this.heroG.position.clone(), new THREE.Color(0xffffff), 3.5);
            this.flashLight(this.heroG.position, color.getHex(), 0.3);
            targets.forEach(m => this.spawnSparks(m.g.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 10, color.getHex()));
        } else if (fx === 'beam') {
            if (targets[0]) {
                const from = this.heroG.position.clone().add(new THREE.Vector3(0.4, 1, 0));
                const to = targets[0].g.position.clone().add(new THREE.Vector3(0, 0.6, 0));
                this.beam(from, to, color);
                this.beam(from, to, new THREE.Color(0xffffff)); // 코어
                this.flashLight(to, color.getHex(), 0.3);
                this.spawnSparks(to, 16, color.getHex());
            }
        } else if (fx === 'bolt') {
            targets.forEach(m => {
                const p = m.g.position.clone();
                const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 7, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
                bolt.position.set(p.x, 3.5, p.z);
                const core = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 7, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
                core.position.copy(bolt.position);
                this.scene.add(bolt, core);
                this.addAnim(0.3, k => {
                    bolt.material.opacity = 1 - k;
                    core.material.opacity = 1 - k;
                    bolt.scale.x = bolt.scale.z = 1 + k * 1.5;
                }, () => { this.scene.remove(bolt); this.scene.remove(core); });
                this.explosion(p, color);
            });
        } else if (fx === 'slash') {
            targets.forEach(m => {
                const p = m.g.position.clone().add(new THREE.Vector3(0, 0.7, 0));
                this.spawnSparks(p, 22, color.getHex());
                this.flashLight(p, color.getHex(), 0.2);
            });
        } else if (fx === 'heal') {
            for (let i = 0; i < 20; i++) {
                const p = this.heroG.position.clone().add(new THREE.Vector3(U.rand(-0.5, 0.5), U.rand(0, 0.5), U.rand(-0.4, 0.4)));
                this.riseParticle(p, color);
            }
            this.expandRing(this.heroG.position.clone(), color, 1.5);
            this.flashLight(this.heroG.position, color.getHex(), 0.4);
        } else if (fx === 'aura') {
            this.expandRing(this.heroG.position.clone(), color, 2.2);
            this.expandRing(this.heroG.position.clone(), color, 1.2);
            this.flashLight(this.heroG.position, color.getHex(), 0.4);
        }
    },

    // 순간 광원 플래시 (연출 강화)
    flashLight(pos, colorHex, dur) {
        const light = new THREE.PointLight(colorHex, 2.8, 7);
        light.position.set(pos.x, pos.y + 0.8, pos.z + 0.5);
        this.scene.add(light);
        this.addAnim(dur || 0.3, k => { light.intensity = 2.8 * (1 - k); }, () => this.scene.remove(light));
    },

    explosion(pos, color) {
        this.spawnSparks(pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 30, color.getHex());
        this.expandRing(pos, color, 1.6);
        this.expandRing(pos, new THREE.Color(0xffffff), 0.9);
        this.flashLight(pos, color.getHex(), 0.35);
    },

    expandRing(pos, color, maxR) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 6, 24),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(pos.x, 0.12, pos.z);
        this.scene.add(ring);
        this.addAnim(0.45, k => {
            ring.scale.setScalar(1 + k * maxR * 2);
            ring.material.opacity = 0.9 * (1 - k);
        }, () => this.scene.remove(ring));
    },

    beam(from, to, color) {
        const len = from.distanceTo(to);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 6),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
        beam.position.lerpVectors(from, to, 0.5);
        beam.rotation.z = Math.PI / 2 - Math.atan2(to.y - from.y, to.x - from.x);
        this.scene.add(beam);
        this.addAnim(0.25, k => { beam.material.opacity = 0.95 * (1 - k); beam.scale.x = beam.scale.z = 1 + k * 2; },
            () => this.scene.remove(beam));
    },

    // ---- 파티클 ----
    spawnSparks(pos, count, colorHex) {
        for (let i = 0; i < count; i++) {
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08),
                new THREE.MeshBasicMaterial({ color: colorHex, transparent: true }));
            p.position.copy(pos);
            p.userData.vel = new THREE.Vector3(U.rand(-2.5, 2.5), U.rand(1.5, 4.5), U.rand(-1.5, 1.5));
            p.userData.life = U.rand(0.35, 0.7);
            p.userData.age = 0;
            this.scene.add(p);
            this.particles.push(p);
        }
    },

    riseParticle(pos, color) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6),
            new THREE.MeshBasicMaterial({ color, transparent: true }));
        p.position.copy(pos);
        p.userData.vel = new THREE.Vector3(0, U.rand(1, 2), 0);
        p.userData.life = 0.8; p.userData.age = 0; p.userData.noGravity = true;
        this.scene.add(p);
        this.particles.push(p);
    },

    // ---- 데미지 숫자 (DOM 오버레이) ----
    damageNumber(worldPos, text, cls) {
        if (this.fxLayer.children.length > 40) return; // 과부하 방지
        const pt = this.project(worldPos);
        const el = document.createElement('div');
        el.className = 'float-dmg ' + cls;
        el.textContent = text;
        el.style.left = pt.x + 'px';
        el.style.top = pt.y + 'px';
        this.fxLayer.appendChild(el);
        setTimeout(() => el.remove(), 900);
    },

    project(v) {
        const p = v.clone().project(this.camera);
        return {
            x: (p.x * 0.5 + 0.5) * this.container.clientWidth,
            y: (-p.y * 0.5 + 0.5) * this.container.clientHeight
        };
    },

    // ---- 테마/셰이크/애니메이션 ----
    setChapterTheme(chapter) {
        const t = CHAPTER_THEMES[(chapter - 1) % CHAPTER_THEMES.length];
        this.renderer.setClearColor(t.sky);
        this.scene.fog.color.setHex(t.fog);
        this.terrainMat.color.setHex(t.ground);
        // 산맥/나뭇잎/덤불은 지면색 기반으로 톤 변주
        this.mountainMat.color.copy(new THREE.Color(t.ground).offsetHSL(0, 0.02, -0.1));
        this.foliageMat.color.copy(new THREE.Color(t.ground).offsetHSL(-0.02, 0.08, -0.16));
        this.bushMat.color.copy(new THREE.Color(t.ground).offsetHSL(-0.01, 0.05, -0.1));
        this.hemi.color.setHex(t.sky);
        this.hemi.groundColor.copy(new THREE.Color(t.ground).offsetHSL(0, 0, -0.1));
    },

    shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); },

    addAnim(dur, fn, onDone) { this.anims.push({ t: 0, dur, fn, onDone }); },

    update(dt) {
        this._clock += dt;
        // 적 위치 동기화 + 걷기 모션 + HP바
        for (const e of Combat.enemies) {
            const m = this.enemyMap.get(e.id);
            if (!m || !e.alive) continue;
            m.g.position.x += (e.x - m.g.position.x) * Math.min(1, dt * 12);
            const walking = e.x > Combat.MELEE_X + 0.05;
            if (m.g.position.y < 0.3) {
                if (walking) {
                    // 뒤뚱 + 총총걸음 + 팔 흔들기
                    m.g.position.y = Math.abs(Math.sin(this._clock * 9 + e.id)) * 0.07;
                    m.g.rotation.z = Math.sin(this._clock * 9 + e.id) * 0.08;
                    if (m.armR && !this.anims.some(a => a._eid === e.id)) {
                        m.armR.rotation.x = Math.sin(this._clock * 9 + e.id) * 0.55;
                        if (m.armL) m.armL.rotation.x = -Math.sin(this._clock * 9 + e.id) * 0.55;
                    }
                } else {
                    m.g.position.y = Math.max(0, Math.sin(this._clock * 6 + e.id) * 0.04);
                    m.g.rotation.z *= 0.9;
                    if (m.armL) m.armL.rotation.x *= 0.9;
                }
            }
            const ratio = U.clamp(e.hp / e.maxHp, 0, 1);
            m.hpFg.scale.x = Math.max(0.001, ratio);
            m.hpFg.position.x = -0.4 * (1 - ratio);
            m.hpFg.material.color.setHex(ratio > 0.5 ? 0x69f0ae : ratio > 0.2 ? 0xffd740 : 0xff5252);
        }
        // 영웅: 걷기(무한맵 스크롤) / 아이들 모션
        if (this.heroG && this.legs) {
            const walkCycle = Math.sin(this._clock * 11);
            const rest = this.armRest !== undefined ? this.armRest : -0.25;
            if (this.walking && !this._attacking) {
                // 행군: 다리 교차 + 팔 스윙 + 배경 스크롤 (조준형 무기는 팔 유지)
                this.legs[0].rotation.x = walkCycle * 0.65;
                this.legs[1].rotation.x = -walkCycle * 0.65;
                this.armR.rotation.x = rest > -1 ? rest - walkCycle * 0.45 : rest;
                this.armL.rotation.x = -0.15 + walkCycle * 0.45;
                this.heroG.position.y = Math.abs(walkCycle) * 0.06;
                const spd = 1.7 * dt;
                for (const o of this.scrollables) {
                    o.position.x -= spd;
                    if (o.position.x < -13) o.position.x += 26;
                    o.position.y = this.heightAt(o.position.x, o.position.z) + 0.05; // 지형 높이 추적
                }
                for (const mist of this.mists) mist.position.x -= spd * 0.6;
            } else {
                this.legs[0].rotation.x *= 0.85;
                this.legs[1].rotation.x *= 0.85;
                if (!this._attacking) {
                    this.armR.rotation.x += (rest - this.armR.rotation.x) * 0.15;
                    this.armL.rotation.x += (-0.15 - this.armL.rotation.x) * 0.15;
                    this.heroG.position.y = Math.sin(this._clock * 3) * 0.03;
                }
            }
        }
        this.petGroups.forEach((pg, i) => {
            pg.position.y = pg.userData.home.y + Math.sin(this._clock * 4 + i * 2) * 0.08;
        });
        // 애니메이션 큐
        for (let i = this.anims.length - 1; i >= 0; i--) {
            const a = this.anims[i];
            a.t += dt;
            const k = Math.min(1, a.t / a.dur);
            a.fn(k);
            if (k >= 1) { if (a.onDone) a.onDone(); this.anims.splice(i, 1); }
        }
        // 파티클
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.userData.age += dt;
            if (p.userData.age >= p.userData.life) {
                this.scene.remove(p);
                this.particles.splice(i, 1);
                continue;
            }
            p.position.addScaledVector(p.userData.vel, dt);
            if (!p.userData.noGravity) p.userData.vel.y -= 9 * dt;
            p.material.opacity = 1 - p.userData.age / p.userData.life;
        }
        // 안개 드리프트
        for (const mist of this.mists) {
            mist.position.x += mist.userData.speed * dt;
            if (mist.position.x > 10) mist.position.x = -10;
            if (mist.position.x < -10) mist.position.x = 10;
            mist.position.y = mist.userData.baseY + Math.sin(this._clock * 0.6 + mist.userData.baseY * 5) * 0.12;
        }
        // 투사체
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const pr = this.projectiles[i];
            pr.t += dt;
            const k = Math.min(1, pr.t / pr.dur);
            pr.mesh.position.lerpVectors(pr.from, pr.to, k);
            if (pr.kind === 'arrow') {
                pr.mesh.position.y += Math.sin(k * Math.PI) * 0.5; // 포물선
                pr.mesh.rotation.z = -0.4 + k * 0.8;
            } else if (pr.kind === 'spin') {
                pr.mesh.rotation.z -= dt * 22; // 회전 투척
            } else if (pr.kind === 'magic') {
                pr.mesh.scale.setScalar(1 + Math.sin(this._clock * 20) * 0.15);
                if (Math.random() < 0.5) this.riseParticle(pr.mesh.position.clone(), new THREE.Color(pr.color));
            }
            if (k >= 1) {
                this.spawnSparks(pr.to, pr.kind === 'magic' ? 14 : 6, pr.color);
                if (pr.kind === 'magic') this.flashLight(pr.to, pr.color, 0.25);
                this.scene.remove(pr.mesh);
                this.projectiles.splice(i, 1);
            }
        }
        // 카메라 셰이크
        if (this.shakeMag > 0.001) {
            this.camera.position.set(
                0.15 + U.rand(-1, 1) * this.shakeMag,
                3.7 + U.rand(-1, 1) * this.shakeMag * 0.6,
                8.2
            );
            this.shakeMag *= Math.pow(0.001, dt); // 감쇠
        } else {
            this.camera.position.set(0.15, 3.7, 8.2);
        }
        this.renderer.render(this.scene, this.camera);
    },
};
