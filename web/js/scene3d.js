// ===== Three.js 3D 전투 씬 + 연출(파티클/셰이크/데미지 숫자) =====
const Scene3D = {
    renderer: null, scene: null, camera: null,
    worldX: 0,               // 플레이어가 오른쪽으로 전진한 누적 거리 (무한 월드)
    heroG: null, weaponG: null, helmetG: null, bodyMesh: null,
    petGroups: [],
    mountGroup: null,
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
        this.renderer.shadowMap.enabled = true;               // 그림자 (사실감)
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;    // GLB 텍스처 색 보정
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // 필름톤 대비/채도 롤오프로 밋밋한 조명 보완
        this.renderer.toneMappingExposure = 1.08;
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0xa8d8ea, 12, 30);
        // PBR 환경광 — ProChar의 절차 하늘/지면 큐브맵을 PMREM으로 필터링해 MeshStandardMaterial 전역 공급.
        // 금속(높은 metalness)이 반사할 '세상'이 생겨 무광 플라스틱 인상이 사라지는 핵심 (비평가 6.0 1위 결함).
        try {
            const pmrem = new THREE.PMREMGenerator(this.renderer);
            this.scene.environment = pmrem.fromCubemap(ProChar.envMap()).texture;
            pmrem.dispose();
        } catch (e) { /* PMREM 실패 시 라이트만으로 렌더 (구형 기기 폴백) */ }

        this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
        this.camera.position.set(0.15, 3.7, 8.2);
        this.camera.lookAt(0.15, 0.9, 0);

        // 라이팅: 반구광(하늘/땅 색 반사)은 낮추고 태양광 비중을 높여 방향성 음영을 강조
        // (균일하게 밝은 "판대기" 인상 제거 — 나무/바위 한쪽 면에 그늘이 지게)
        this.hemi = new THREE.HemisphereLight(0xbddcff, 0x6e7a60, 0.54); // 그림자 바닥톤 소폭 상승 — 검록 얼룩 완화 (비평가 7.3 4번)
        this.sun = new THREE.DirectionalLight(0xfff3d6, 1.2);
        this.sun.position.set(4, 9.5, 3.5); // 고도 ~60도 — 45도의 긴 그림자가 본체 이탈 '검은 얼룩'으로 읽힘 (비평가 7.3 4번 골렘·버섯)
        this.sun.castShadow = true;
        // 데스크톱만 2048 — 중급 폰은 프레임 하락 확인돼 1024 유지. 1024×24유닛의 저밀도가 '뭉개진 그림자 블롭'으로 읽힘 (비평가 4번)
        const shadowRes = /Mobi|Android/i.test(navigator.userAgent) ? 1024 : 2048;
        this.sun.shadow.mapSize.set(shadowRes, shadowRes);
        this.sun.shadow.camera.left = -10; this.sun.shadow.camera.right = 10;   // 소품 배치 범위 x±9.5 커버 + 텍셀 밀도 확보
        this.sun.shadow.camera.top = 10; this.sun.shadow.camera.bottom = -10;   // (±8은 가장자리 나무 그림자가 잘렸음)
        this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 30;
        // 태양 반대편 서늘한 역광(그림자 없음) — 그늘진 면 실루엣이 배경에서 분리되게
        this.rim = new THREE.DirectionalLight(0xcfe4ff, 0.5); // 쿨톤 역광 강화 — 그늘 면 실루엣 분리(림 라이트) (비평가 14번)
        this.rim.position.set(-5, 6, -6);
        // 발광체 라이트 블리드용 악센트 포인트라이트 풀(3기) — 마법=크리스탈 시안, 용암=크랙 주황이
        // 주변 지면·소품을 실제로 물들여 "unlit 스티커" 인상을 없앰. 발광 소품(크리스탈/용암 데칼)의
        // 자식으로 붙어 무한맵 스크롤을 함께 따라간다 (기본은 꺼짐, buildProps에서 바이옴별 부착·설정)
        this.accents = [];
        for (let i = 0; i < 3; i++) {
            const pl = new THREE.PointLight(0xffffff, 0, 9, 2);
            pl.position.set(0, 0.9, 0); // 씬에는 넣지 않음 — buildProps가 발광 바이옴에서만 소품에 부착
            this.accents.push(pl);
        }
        // ❗sun.target을 씬에 추가해야 target.position 이동이 matrixWorld에 반영됨 —
        // 월드가 +x로 무한 스크롤하므로 update()가 sun/target을 worldX만큼 따라 옮긴다.
        // (안 옮기면 전진 몇 초 만에 소품 전체가 그림자 카메라 프러스텀 밖으로 벗어나 그림자가 소실됨)
        this.scene.add(this.hemi, this.sun, this.sun.target, this.rim);

        this.initPost(); // 블룸+비네트 포스트 스택 (데스크톱 한정 — 모바일은 풀스크린 패스 비용)

        this.buildEmbers();
        this.buildSky();
        this.buildTerrain();

        this.buildHero();
        this.setupHeroProc(); // 프로시저럴 영웅이 기본 (GLB 파이프라인 제거 — 사용자 지시 2026-08-17)
        this.refreshHeroEquip();
        this.refreshPets();
        this.refreshMount();
        this.resize();
    },

    // ---- 프로시저럴 영웅 설치 (무기 손 부착·투구 머리 부착·틴트·클립명 인터페이스) ----
    setupHeroProc() {
        const rig = ProChar.createKnight();
        for (const child of [...this.heroG.children]) child.visible = false;
        this.heroG.add(rig.group);
        this.heroRig = rig;
        this.setShadow(rig.group);
        // 무기: 오른손 마운트 (legacy 좌표계와 동일 — 칼날 +y)
        rig.handR.add(this.weaponG);
        this.weaponG.visible = true;
        this.weaponG.position.set(0, 0, 0);
        this.weaponG.rotation.set(0, 0, 0);
        this.weaponG.scale.setScalar(1.22); // 무기 존재감 20% 업 (비평가 지적)
        // 투구: 머리 마운트 (legacy helmetG 로컬 좌표 = 머리 중심 기준이라 그대로 이식)
        rig.headMount.add(this.helmetG);
        this.helmetG.visible = true;
        this.helmetG.position.set(0, 0, 0);
        this.tintHero();
        rig.play(['Idle']);
    },

    // 장비 시대색 + 등급 발광을 리그 재질에 반영
    tintHero() {
        if (this.heroRig) ProChar.tint(this.heroRig, S.equipment);
    },

    heroPlay(cands, once, timeScale) {
        if (this.heroRig) this.heroRig.play(cands, once, timeScale);
    },

    // ---- 포스트 프로세싱: 브라이트패스 → 분리 가우시안 블러(1/4 해상도) → 합성+비네트 ----
    // CDN 금지 제약으로 EffectComposer 없이 r128 코어만으로 구현 (비평가 6.9 권고 1순위 — 전 샷 공통 +α).
    // 모바일은 풀스크린 3패스 비용이 커서 비활성(그림자 해상도와 동일한 UA 분기).
    initPost() {
        if (/Mobi|Android/i.test(navigator.userAgent)) { this.postOn = false; return; }
        this.postOn = true;
        const pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat };
        this._rtScene = new THREE.WebGLRenderTarget(2, 2, pars);
        this._rtScene.texture.encoding = THREE.sRGBEncoding; // 캔버스 직접 렌더와 동일한 색으로 RT에 기록
        this._rtA = new THREE.WebGLRenderTarget(2, 2, pars);
        this._rtB = new THREE.WebGLRenderTarget(2, 2, pars);
        this._fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._fsScene = new THREE.Scene();
        this._fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
        this._fsScene.add(this._fsQuad);
        const V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
        this._brightMat = new THREE.ShaderMaterial({
            uniforms: { tSrc: { value: null } },
            vertexShader: V,
            // 임계 0.9 소프트 니 — 0.82는 스틸 검날·히트 플래시가 통째로 순백 기둥으로 폭주(비평가 7.1 1·3번 화이트아웃), 최상위 하이라이트만 추출
            fragmentShader: 'varying vec2 vUv; uniform sampler2D tSrc;\n' +
                'void main(){ vec3 c = texture2D(tSrc, vUv).rgb;\n' +
                '  float l = dot(c, vec3(0.299, 0.587, 0.114));\n' +
                '  gl_FragColor = vec4(c * smoothstep(0.9, 1.0, l), 1.0); }',
            depthTest: false, depthWrite: false,
        });
        this._blurMat = new THREE.ShaderMaterial({
            uniforms: { tSrc: { value: null }, dir: { value: new THREE.Vector2(1, 0) }, texel: { value: new THREE.Vector2(1 / 256, 1 / 256) } },
            vertexShader: V,
            fragmentShader: 'varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 dir; uniform vec2 texel;\n' +
                'void main(){ vec2 o = dir * texel;\n' +
                '  vec3 s = texture2D(tSrc, vUv).rgb * 0.227;\n' +
                '  s += (texture2D(tSrc, vUv + o * 1.384).rgb + texture2D(tSrc, vUv - o * 1.384).rgb) * 0.316;\n' +
                '  s += (texture2D(tSrc, vUv + o * 3.230).rgb + texture2D(tSrc, vUv - o * 3.230).rgb) * 0.070;\n' +
                '  gl_FragColor = vec4(s, 1.0); }',
            depthTest: false, depthWrite: false,
        });
        this._compMat = new THREE.ShaderMaterial({
            uniforms: { tScene: { value: null }, tBloom: { value: null }, strength: { value: 0.34 } }, // 0.5는 밝은 면이 형태를 잃음 (비평가 7.1 화이트아웃)
            vertexShader: V,
            fragmentShader: 'varying vec2 vUv; uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength;\n' +
                'void main(){ vec3 c = texture2D(tScene, vUv).rgb + texture2D(tBloom, vUv).rgb * strength;\n' +
                '  float d = distance(vUv, vec2(0.5, 0.5));\n' +
                '  c *= 1.0 - smoothstep(0.58, 0.88, d) * 0.24;\n' + // 미세 비네트 — 시선을 중앙으로
                '  gl_FragColor = vec4(c, 1.0); }',
            depthTest: false, depthWrite: false,
        });
    },
    renderFrame() {
        if (!this.postOn || !this._rtScene) { this.renderer.render(this.scene, this.camera); return; }
        const r = this.renderer;
        r.setRenderTarget(this._rtScene);
        r.render(this.scene, this.camera);
        this._fsQuad.material = this._brightMat;
        this._brightMat.uniforms.tSrc.value = this._rtScene.texture;
        r.setRenderTarget(this._rtA); r.render(this._fsScene, this._fsCam);
        for (let i = 0; i < 2; i++) { // 2회 왕복 분리 블러 — 1/4 해상도라 저비용
            this._fsQuad.material = this._blurMat;
            this._blurMat.uniforms.tSrc.value = this._rtA.texture; this._blurMat.uniforms.dir.value.set(1, 0);
            r.setRenderTarget(this._rtB); r.render(this._fsScene, this._fsCam);
            this._blurMat.uniforms.tSrc.value = this._rtB.texture; this._blurMat.uniforms.dir.value.set(0, 1);
            r.setRenderTarget(this._rtA); r.render(this._fsScene, this._fsCam);
        }
        this._fsQuad.material = this._compMat;
        this._compMat.uniforms.tScene.value = this._rtScene.texture;
        this._compMat.uniforms.tBloom.value = this._rtA.texture;
        r.setRenderTarget(null); r.render(this._fsScene, this._fsCam);
    },

    resize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (!w || !h) return;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        if (this.postOn && this._rtScene) { // 포스트 RT 해상도 동기화 (씬=풀, 블러=1/4)
            const db = new THREE.Vector2();
            this.renderer.getDrawingBufferSize(db);
            this._rtScene.setSize(db.x, db.y);
            const bw = Math.max(2, Math.floor(db.x / 4)), bh = Math.max(2, Math.floor(db.y / 4));
            this._rtA.setSize(bw, bh);
            this._rtB.setSize(bw, bh);
            this._blurMat.uniforms.texel.value.set(1 / bw, 1 / bh);
        }
    },

    // 그룹 내 모든 메시가 그림자를 드리우게
    setShadow(g) {
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        return g;
    },

    // 지형 고도: 전투 라인은 평지, 뒤로 갈수록 능선 (x 주기 30 — 지형 타일 순환용)
    heightAt(x, z) {
        const P = Math.PI * 2 / 30;
        const n = Math.sin(x * P * 2 + z * 0.3) * 0.5 + Math.sin(x * P + 7.3) * 0.3 + Math.cos(z * 0.6 + x * P * 3) * 0.2;
        const back = U.clamp((-z - 2.0) / 5.5, 0, 1);   // 뒤쪽 능선
        const front = U.clamp((z - 2.4) / 3, 0, 1);      // 카메라 앞쪽 둔덕
        return back * back * (1.7 + n * 1.3) + front * (0.5 + n * 0.35);
    },

    // ---- 하늘: 정점색 그라디언트 돔(천정→지평선), 챕터 테마 색으로 다시 칠할 수 있음 ----
    buildSky() {
        const geo = new THREE.SphereGeometry(70, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62);
        const colors = new Float32Array(geo.attributes.position.count * 3);
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
        this.skyDome = new THREE.Mesh(geo, mat);
        this.skyDome.renderOrder = -1;
        this.scene.add(this.skyDome);
        this.buildClouds();
        this.buildHaze();
        this.buildCelestial();
        this.paintSky(0x87ceeb, 0xa8d8ea);
    },

    // 해/달 디스크 + 밤하늘 별 — skyDome 자식이라 카메라를 따라가며 지평선 위에 고정됨.
    // 챕터 테마의 celestial 필드('sun'|'moon'|'none', 기본 sun)로 토글.
    buildCelestial() {
        const disc = (inner, mid) => {
            const c = document.createElement('canvas');
            c.width = c.height = 128;
            const ctx = c.getContext('2d');
            const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            g.addColorStop(0, inner);
            g.addColorStop(0.3, inner);
            g.addColorStop(0.42, mid);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 128, 128);
            return new THREE.CanvasTexture(c);
        };
        this.sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
            map: disc('rgba(255,247,222,1)', 'rgba(255,213,128,0.4)'),
            transparent: true, depthWrite: false, fog: false, opacity: 0.95,
        }));
        // 카메라가 아래를 내려다봐 하늘 시야가 좁다 — 능선(각도 ~5°) 바로 위 가시 띠(y 7~9)에 배치
        this.sunDisc.scale.setScalar(6);
        this.sunDisc.position.set(6.5, 8.2, -38);
        this.moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({
            map: disc('rgba(238,245,255,1)', 'rgba(187,208,255,0.35)'),
            transparent: true, depthWrite: false, fog: false, opacity: 0.92,
        }));
        this.moonDisc.scale.setScalar(4);
        this.moonDisc.position.set(6.5, 8, -38);
        // 별: 스펙클 캔버스 1장을 상공 평면에 (밤 챕터에서만 표시)
        const sc = document.createElement('canvas');
        sc.width = 512; sc.height = 256;
        const sctx = sc.getContext('2d');
        for (let i = 0; i < 90; i++) {
            sctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`;
            sctx.beginPath();
            sctx.arc(Math.random() * 512, Math.random() * 256, Math.random() < 0.85 ? 1.1 : 1.9, 0, Math.PI * 2);
            sctx.fill();
        }
        this.stars = new THREE.Mesh(
            new THREE.PlaneGeometry(85, 30),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, fog: false, opacity: 0.85 })
        );
        this.stars.position.set(0, 9.5, -41); // 가시 하늘 띠 중심에 걸치게
        // 오로라 커튼 2장(설원 밤 전용) — 세로 그라디언트 + 수직 스트릭의 가산 리본
        const ac = document.createElement('canvas');
        ac.width = 256; ac.height = 128;
        const actx = ac.getContext('2d');
        const ag = actx.createLinearGradient(0, 0, 0, 128);
        ag.addColorStop(0, 'rgba(80,255,190,0)');
        ag.addColorStop(0.45, 'rgba(80,255,190,0.75)'); // 피크를 아래쪽(가시 띠 안)에 — 위쪽은 프레임 밖
        ag.addColorStop(0.75, 'rgba(60,190,255,0.4)');
        ag.addColorStop(1, 'rgba(60,190,255,0)');
        actx.fillStyle = ag;
        actx.fillRect(0, 0, 256, 128);
        actx.globalCompositeOperation = 'destination-out'; // 수직 스트릭으로 커튼 주름 표현 (과하면 커튼 자체가 지워짐)
        for (let i = 0; i < 16; i++) {
            const x = Math.random() * 256, w = 2 + Math.random() * 5;
            actx.fillStyle = `rgba(0,0,0,${0.12 + Math.random() * 0.3})`;
            actx.fillRect(x, 0, w, 128);
        }
        const auroraMat = new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(ac), transparent: true, depthWrite: false, fog: false,
            blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.6,
            toneMapped: false, // ACES가 가산색을 잿빛으로 눌러 "옅은 안개"처럼 보였음 — 순색 유지
            depthTest: false,  // 원경 능선 메시가 하늘 가시 띠 대부분을 depth로 가림 — 능선 위에 겹쳐 그림
        });
        this.aurora = new THREE.Group();
        // 카메라가 아래를 내려다봐 하늘 가시 띠가 좁다(y5~9, 능선 위 살짝) — 그 안에 피크가 오게 배치
        for (const [x, y, z, w, h, rz] of [[-9, 7, -39, 30, 6, 0.1], [11, 7.8, -40, 26, 5.5, -0.14]]) {
            const rb = new THREE.Mesh(new THREE.PlaneGeometry(w, h), auroraMat);
            rb.position.set(x, y, z);
            rb.rotation.z = rz;
            rb.renderOrder = 2; // 투명 패스에서 능선·하늘 뒤가 아니라 위에 확실히 얹히게
            this.aurora.add(rb);
        }
        this.aurora.visible = false;
        this.skyDome.add(this.sunDisc, this.moonDisc, this.stars, this.aurora);
    },

    // 돔의 정점 y좌표(천정=1 ~ 지평선=0)를 기준으로 두 색을 보간해 칠함.
    // 지평선 색은 씬 안개색과 정확히 맞춰 원경 지형이 안개에 녹아드는 지점과 하늘이 이음매 없이 이어지게 함.
    paintSky(skyHex, fogHex, night) {
        const pos = this.skyDome.geometry.attributes.position;
        const col = this.skyDome.geometry.attributes.color;
        // 천정은 지평선보다 훨씬 어둡고 채도 높게 — ACES가 대비를 눌러 원색보다 세게 벌려야 함
        const zenith = new THREE.Color(skyHex).offsetHSL(0, 0.19, night ? -0.28 : -0.36);
        const horizon = new THREE.Color(fogHex);
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
        const span = Math.max(0.001, maxY - minY);
        const tmp = new THREE.Color();
        // 3스톱: 지평선 글로우(안개색보다 밝고 살짝 따뜻) → 안개색 → 천정. 2스톱 "배경색" 인상 제거.
        // 밤 챕터는 글로우를 거의 죽여 "흐린 낮"처럼 보이는 문제를 방지 (달빛 박명 수준만 남김)
        // 낮 글로우는 색조를 거의 유지(분홍끼 제거)하고 채도만 올려 "증발한 백색" 대신 색이 있는 지평선 띠로
        const glow = horizon.clone().offsetHSL(night ? 0.02 : 0.004, night ? 0.02 : 0.16, night ? 0.025 : 0.04);
        for (let i = 0; i < pos.count; i++) {
            const k = U.clamp((pos.getY(i) - minY) / span, 0, 1);
            if (k < 0.24) tmp.copy(glow).lerp(horizon, k / 0.24);
            else tmp.copy(horizon).lerp(zenith, Math.pow((k - 0.24) / 0.76, 0.6));
            col.setXYZ(i, tmp.r, tmp.g, tmp.b);
        }
        col.needsUpdate = true;
        if (this.hazeMat) this.hazeMat.color.setHex(fogHex);
        if (this.clouds) {
            // 구름은 하늘보다 확실히 밝게 띄워 대비 확보 (밤엔 달빛에 은은히 비치는 정도로만)
            const cloudTint = new THREE.Color(skyHex).offsetHSL(0, -0.5, night ? 0.1 : 0.48);
            for (const cl of this.clouds) {
                cl.material.color.copy(cloudTint);
                cl.material.opacity = night ? 0.45 : 1;
            }
        }
        if (this.embers) {
            // 밝은 하늘색에 묻히지 않도록 항상 따뜻한 금빛을 베이스로 챕터 색을 살짝만 섞음
            const emberTint = new THREE.Color(0xffcf82).lerp(new THREE.Color(fogHex).offsetHSL(0, 0.3, -0.1), 0.3);
            for (const e of this.embers) e.material.color.copy(emberTint);
        }
    },

    // 뭉게구름 텍스처 — 여러 원을 겹쳐 울퉁불퉁한 뭉치 실루엣을 만들고 아랫면에 살짝 그림자를 얹어 입체감을 줌
    // (단일 원형 그라디언트는 "빛번짐"처럼 보여 구름으로 안 읽히므로 반드시 여러 퍼프를 합성)
    makeCloudTexture() {
        const size = 128;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const puffs = [
            [0.5, 0.55, 0.4], [0.28, 0.52, 0.26], [0.72, 0.52, 0.28],
            [0.4, 0.36, 0.24], [0.62, 0.38, 0.22], [0.5, 0.66, 0.3], [0.85, 0.58, 0.18],
        ];
        for (const [px, py, pr] of puffs) {
            const cx = px * size, cy = py * size, r = pr * size;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            grad.addColorStop(0, 'rgba(255,255,255,1)');
            grad.addColorStop(0.62, 'rgba(255,255,255,0.85)'); // 코어를 꽉 채우고 가장자리만 짧게 떨어뜨려
            grad.addColorStop(1, 'rgba(255,255,255,0)');       // "빛번짐"이 아닌 "덩어리"로 읽히게
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        }
        // 아랫면 음영으로 입체감(광원 위→아래 가정)
        ctx.globalCompositeOperation = 'source-atop';
        const shade = ctx.createLinearGradient(0, size * 0.3, 0, size * 0.9);
        shade.addColorStop(0, 'rgba(190,200,215,0)');
        shade.addColorStop(1, 'rgba(118,136,172,0.7)'); // 아랫면 음영을 진하게 — 밝은 하늘에서도 입체가 읽히게
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'source-over';
        return new THREE.CanvasTexture(c);
    },

    // 하늘에 떠서 천천히 흐르는 뭉게구름 스프라이트(원경감 + "빈 하늘" 인상 제거)
    buildClouds() {
        const tex = this.makeCloudTexture();
        this.clouds = [];
        for (let i = 0; i < 12; i++) {
            const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
            const s = new THREE.Sprite(mat);
            const scale = U.rand(10, 19); // "구름 0개"로 인식되던 문제 — 화면에서 확실히 읽히는 크기로 상향
            s.scale.set(scale, scale * 0.48, 1);
            // 카메라가 아래를 내려다보는 각도라 하늘 시야가 좁다 — 실제 프러스텀 안에 들어오는
            // 낮은 고도(y 4.5~7.5)에 배치해야 화면에 실제 구름 크기로 보인다.
            // 절반은 화면 시야(x±14) 안에 확정 배치 — 랜덤이 전부 화면 밖으로 몰리면 "빈 하늘"이 됨
            const cx = i < 6 ? U.rand(-14, 14) : U.rand(-25, 25);
            // y 5~8.5는 능선에 몸통이 다 가려져 꼭대기 슬리버만 '정체불명 수평선 2줄'로 노출 (비평가 7.1 7번 아티팩트의 실체)
            s.position.set(cx, U.rand(10.5, 15), U.rand(-42, -28)); // 능선 위 온전한 덩어리로
            s.userData.baseX = s.position.x;
            s.userData.speed = U.rand(0.05, 0.14);
            this.scene.add(s);
            this.clouds.push(s);
        }
    },

    // 부드러운 원형 발광 텍스처 (안개 띠/먼지 입자 공용) — 가장자리가 정확히 0으로 죽어 이음매가 안 보임
    makeGlowTexture() {
        const size = 128;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(0.45, 'rgba(255,255,255,0.4)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(c);
    },

    // 산맥/구릉이 하늘과 만나는 지평선에 걸리는 얇은 반투명 안개 띠 — 실루엣의 딱딱한 경계선을 눅여줌.
    // 하나의 큰 세로 그라디언트 평면(위/아래 모두 투명으로 완전히 죽어 판 가장자리가 안 보임)만 사용.
    buildHaze() {
        const size = 4, h = 256;
        const c = document.createElement('canvas');
        c.width = size; c.height = h;
        const ctx = c.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, h);
        this.hazeMat = new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(c), color: 0xa8d8ea, transparent: true,
            depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0.5,
        });
        this.haze = new THREE.Mesh(new THREE.PlaneGeometry(95, 12), this.hazeMat);
        this.haze.position.set(0, 1.2, -16.5);
        this.scene.add(this.haze);
    },

    // 전투 라인 위로 떠다니는 발광 먼지/불씨 입자 — 챕터 톤에 맞춰 색이 바뀌어(따뜻한 챕터=불씨, 서늘한 챕터=반딧불/마법가루)
    // 밋밋한 조명에 반짝임을 더해 대기감·챕터 개성을 동시에 살림
    buildEmbers() {
        const tex = this.makeGlowTexture();
        this.emberMat = new THREE.SpriteMaterial({
            map: tex, transparent: true, depthWrite: false, fog: false,
            blending: THREE.AdditiveBlending, opacity: 0.85, color: 0xffe0a0,
        });
        this.embers = [];
        for (let i = 0; i < 16; i++) {
            const s = new THREE.Sprite(this.emberMat.clone());
            const x = U.rand(-9, 9), z = U.rand(-6.5, 1.5);
            s.scale.setScalar(U.rand(0.05, 0.085)); // 크기·강도 편차 축소 — 큰 개체가 '렌즈 얼룩'으로 읽힘 (비평가 7.1 17번)
            s.material.opacity = 0.22;
            s.position.set(x, this.heightAt(x, z) + U.rand(0.3, 1.2), z);
            s.userData.baseX = x; s.userData.baseZ = z; s.userData.baseY = s.position.y;
            s.userData.phase = U.rand(0, 10);
            s.userData.rise = U.rand(0.05, 0.15);
            this.scene.add(s);
            this.embers.push(s);
        }
    },

    // 절차적 잔디/지면 얼룩 텍스처 — 큰 규모 패치(마른 풀/흙 자국) + 작은 얼룩 + 미세 노이즈 3단 레이어.
    // 재질 color가 그 위에 곱해져 챕터별 톤은 그대로 유지되면서 표면 디테일만 더함.
    // 바이옴별 지면 알베도 텍스처 — "어느 챕터나 같은 얼룩 평면" 인상을 없애기 위해 소재가
    // 실제로 다르게 읽히는 패턴을 바이옴마다 그린다(풀결/모래 리플/암반 균열/눈 스파클/현무암 셀).
    // 재질 color가 곱해지므로 전부 중성 회조 기반으로 그리고, 대비는 과감하게(원거리에서도 살아남게).
    makeGroundTexture(biome) {
        const size = 512;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#c2c2c2';
        ctx.fillRect(0, 0, size, size);
        // 공용: 큰 색조 패치 (소재 기저의 명도/온도 변주)
        const patches = (n, alpha) => {
            for (let i = 0; i < n; i++) {
                const x = Math.random() * size, y = Math.random() * size, r = 40 + Math.random() * 110;
                const warm = Math.random() < 0.5;
                const base = 130 + Math.random() * 85;
                const cr = warm ? base + 28 : base - 16, cg = base, cb = warm ? base - 30 : base + 18;
                ctx.fillStyle = `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha + Math.random() * 0.2})`;
                ctx.beginPath();
                ctx.ellipse(x, y, r, r * (0.45 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
                ctx.fill();
            }
        };
        // 랩어라운드 대응 짧은 스트로크 (풀결 등) — 타일 경계에서 끊긴 티가 안 나게 화면 밖은 그냥 잘림 허용(짧아서 무해)
        const strokes = (n, len, w, ang, spread, light, dark) => {
            ctx.lineCap = 'round';
            for (let i = 0; i < n; i++) {
                const x = Math.random() * size, y = Math.random() * size;
                const a = ang + (Math.random() - 0.5) * spread;
                const l = len * (0.6 + Math.random() * 0.8);
                const v = Math.random() < 0.5 ? light : dark;
                ctx.strokeStyle = `rgba(${v},${v},${v},${0.22 + Math.random() * 0.26})`;
                ctx.lineWidth = w * (0.7 + Math.random() * 0.6);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
                ctx.stroke();
            }
        };
        switch (biome) {
            case 'desert': { // 모래 리플 — 수평 사인 물결 밴드(밝은 크레스트 + 어두운 트로프 쌍)
                patches(22, 0.16);
                for (let y = -8; y < size + 8; y += 9 + Math.random() * 7) {
                    // 가로 랩어라운드: 사인 주기를 타일 폭의 정수배로 강제해 반복 경계 이음매 제거
                    const amp = 3 + Math.random() * 4, ph = Math.random() * 9, cyc = 10 + (Math.random() * 9 | 0);
                    for (const [off, col, w] of [[2.6, 'rgba(96,88,74,0.34)', 3.2], [0, 'rgba(238,232,214,0.5)', 2.1]]) {
                        ctx.strokeStyle = col;
                        ctx.lineWidth = w;
                        ctx.beginPath();
                        for (let x = 0; x <= size; x += 7) {
                            const yy = y + off + Math.sin((x / size) * cyc * Math.PI * 2 + ph) * amp;
                            x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
                        }
                        ctx.stroke();
                    }
                }
                break;
            }
            case 'rock': { // 암반 — 각진 판 조각 + 가는 균열선
                patches(26, 0.18);
                for (let i = 0; i < 30; i++) { // 명도가 다른 각진 셰이드 판
                    const x = Math.random() * size, y = Math.random() * size, r = 26 + Math.random() * 60;
                    const v = 118 + Math.random() * 96 | 0;
                    ctx.fillStyle = `rgba(${v},${v},${v + 6},${0.2 + Math.random() * 0.22})`;
                    ctx.beginPath();
                    const nv = 4 + (Math.random() * 3 | 0);
                    for (let k = 0; k < nv; k++) {
                        const a = (k / nv) * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.5);
                        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
                        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                    }
                    ctx.closePath(); ctx.fill();
                }
                for (let i = 0; i < 14; i++) { // 균열 폴리라인
                    ctx.strokeStyle = `rgba(52,50,48,${0.3 + Math.random() * 0.25})`;
                    ctx.lineWidth = 1.4 + Math.random() * 1.2;
                    let x = Math.random() * size, y = Math.random() * size, a = Math.random() * Math.PI * 2;
                    ctx.beginPath(); ctx.moveTo(x, y);
                    for (let s = 0; s < 9; s++) {
                        a += (Math.random() - 0.5) * 1.1;
                        x += Math.cos(a) * 16; y += Math.sin(a) * 16;
                        ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                }
                break;
            }
            case 'snow': { // 눈 — 부드러운 굴곡 음영 + 바람 스트릭 + 스파클 점
                patches(14, 0.1);
                strokes(90, 46, 2.4, -0.25, 0.18, 224, 156); // 바람에 쓸린 사선 결
                for (let i = 0; i < 240; i++) { // 스파클(햇빛 반짝임 점)
                    const x = Math.random() * size, y = Math.random() * size;
                    ctx.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.5})`;
                    ctx.fillRect(x, y, Math.random() < 0.8 ? 1.4 : 2.2, 1.4);
                }
                break;
            }
            case 'lava': { // 현무암 자갈판 — 어두운 셀 + 밝은 재 틈. 크랙 emissiveMap과 별개의 식은 표면 결
                patches(16, 0.14);
                for (let i = 0; i < 64; i++) {
                    const x = Math.random() * size, y = Math.random() * size, r = 14 + Math.random() * 34;
                    const v = 96 + Math.random() * 60 | 0;
                    ctx.fillStyle = `rgba(${v},${v - 4},${v - 8},${0.3 + Math.random() * 0.28})`;
                    ctx.beginPath();
                    const nv = 5 + (Math.random() * 2 | 0);
                    for (let k = 0; k < nv; k++) {
                        const a = (k / nv) * Math.PI * 2 + 0.3, rr = r * (0.68 + Math.random() * 0.4);
                        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
                        k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                    }
                    ctx.closePath(); ctx.fill();
                    ctx.strokeStyle = 'rgba(190,182,170,0.3)'; // 셀 가장자리 밝은 재 라인
                    ctx.lineWidth = 1.6;
                    ctx.stroke();
                }
                break;
            }
            case 'magic': { // 마법 — 큰 몽환 얼룩 + 마나 가루 점
                patches(30, 0.22);
                for (let i = 0; i < 130; i++) {
                    const x = Math.random() * size, y = Math.random() * size;
                    const v = 190 + Math.random() * 65 | 0;
                    ctx.fillStyle = `rgba(${v - 40},${v},${v},${0.25 + Math.random() * 0.4})`;
                    ctx.fillRect(x, y, 1.6, 1.6);
                }
                break;
            }
            default: { // forest: 얼룩 + 풀결 스트로크(짧고 촘촘한 결이 "잔디 재질"을 말해줌)
                patches(30, 0.18);
                strokes(300, 11, 1.7, -Math.PI / 2, 0.9, 196, 122); // 700개/고대비는 '카펫 노이즈'로 읽힘 — 성기고 옅게
                for (let i = 0; i < 160; i++) { // 풀포기 뭉침 얼룩
                    const x = Math.random() * size, y = Math.random() * size, r = 6 + Math.random() * 22;
                    const shade = 115 + Math.random() * 115;
                    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.12 + Math.random() * 0.16})`;
                    ctx.beginPath();
                    ctx.ellipse(x, y, r, r * (0.5 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        // 미세 스펙클 노이즈 (표면 거칠기 — 전 바이옴 공통)
        const img = ctx.getImageData(0, 0, size, size);
        const speck = biome === 'snow' ? 14 : 30;
        for (let i = 0; i < img.data.length; i += 4) {
            const n = (Math.random() - 0.5) * speck;
            img.data[i] = U.clamp(img.data[i] + n, 0, 255);
            img.data[i + 1] = U.clamp(img.data[i + 1] + n, 0, 255);
            img.data[i + 2] = U.clamp(img.data[i + 2] + n, 0, 255);
        }
        ctx.putImageData(img, 0, 0);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(12, 6);
        return tex;
    },

    // 절차적 지면 노멀맵 — 범프 높이 캔버스를 소벨 필터로 법선으로 변환.
    // 색 얼룩과 달리 조명에 실제로 반응하는 요철이라, 어두운 챕터 색(용암 등)이 곱해져도
    // 표면 디테일이 죽지 않고 "칠해진 평면" 인상을 없애준다.
    makeGroundNormalMap(biome) {
        const size = 256;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, size, size);
        if (biome === 'desert') {
            // 리플 요철 — 알베도 물결과 같은 스케일의 수평 융기(가로로 길쭉한 타원 범프)
            for (let i = 0; i < 150; i++) {
                const x = Math.random() * size, y = Math.random() * size;
                const rx = 16 + Math.random() * 26, ry = 2.2 + Math.random() * 3;
                const grad = ctx.createRadialGradient(x, y, 0, x, y, rx);
                grad.addColorStop(0, Math.random() < 0.62 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.36)');
                grad.addColorStop(1, 'rgba(128,128,128,0)');
                ctx.fillStyle = grad;
                ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
                ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
        } else if (biome === 'rock' || biome === 'lava') {
            // 판/자갈 요철 — 명도가 균일한 다각형 판(경계에서 급격한 법선 변화 = 각진 단차)
            for (let i = 0; i < 70; i++) {
                const x = Math.random() * size, y = Math.random() * size, r = 9 + Math.random() * 22;
                const v = 92 + Math.random() * 88 | 0;
                ctx.fillStyle = `rgb(${v},${v},${v})`;
                ctx.beginPath();
                const nv = 5 + (Math.random() * 2 | 0);
                for (let k = 0; k < nv; k++) {
                    const a = (k / nv) * Math.PI * 2 + 0.4, rr = r * (0.66 + Math.random() * 0.4);
                    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
                    k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
                }
                ctx.closePath(); ctx.fill();
            }
        } else {
            // 완만한 굴곡 (흙더미/풀 뭉치 규모) — 눈은 굴곡을 더 크고 부드럽게
            const soft = biome === 'snow';
            for (let i = 0; i < (soft ? 60 : 110); i++) {
                const x = Math.random() * size, y = Math.random() * size, r = (soft ? 12 : 5) + Math.random() * (soft ? 34 : 20);
                const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
                grad.addColorStop(0, Math.random() < 0.6 ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.3)');
                grad.addColorStop(1, 'rgba(128,128,128,0)');
                ctx.fillStyle = grad;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
        }
        // 미세 거칠기
        const img = ctx.getImageData(0, 0, size, size);
        const rough = biome === 'snow' ? 16 : 34;
        for (let i = 0; i < img.data.length; i += 4) {
            const n = (Math.random() - 0.5) * rough;
            const v = U.clamp(img.data[i] + n, 0, 255);
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        }
        // 높이맵 → 법선맵 (소벨, 타일 경계는 랩어라운드로 이음매 없음)
        const h = img.data;
        const at = (x, y) => h[(((y + size) % size) * size + ((x + size) % size)) * 4];
        const out = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const dx = at(x + 1, y) - at(x - 1, y);
            const dy = at(x, y + 1) - at(x, y - 1);
            const idx = (y * size + x) * 4;
            out.data[idx] = U.clamp(128 - dx, 0, 255);
            out.data[idx + 1] = U.clamp(128 - dy, 0, 255);
            out.data[idx + 2] = 255;
            out.data[idx + 3] = 255;
        }
        ctx.putImageData(out, 0, 0);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(12, 6); // three.js는 map의 uv 변환을 공유하므로 map과 동일 반복으로 명시
        return tex;
    },

    // 용암 균열 텍스처(emissiveMap 전용) — 검정 바탕에 발광 주황 균열 폴리라인.
    // 넓은 은은한 광 위에 좁은 밝은 코어를 겹쳐 그려 블룸 비슷한 발광 인상을 근사.
    makeCrackTexture() {
        const size = 256;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let i = 0; i < 3; i++) {
            // 랜덤 워크 균열 경로를 먼저 만들고 같은 경로를 두 번(광·코어) 스트로크
            // (타일이 12×6으로 반복되므로 타일당 균열 수는 적어야 화면 전체가 그물처럼 덮이지 않음)
            const pts = [[Math.random() * size, Math.random() * size]];
            let a = Math.random() * Math.PI * 2;
            const steps = 10 + (Math.random() * 8 | 0);
            for (let s = 0; s < steps; s++) {
                a += U.rand(-0.7, 0.7);
                const [px, py] = pts[pts.length - 1];
                pts.push([px + Math.cos(a) * 10, py + Math.sin(a) * 10]);
            }
            // 3겹: 넓은 열기 폴오프 → 중간 광 → 좁은 백열 코어 (크랙이 지면을 달구는 인상)
            for (const [wd, col] of [[14, 'rgba(255,61,0,0.13)'], [6, 'rgba(255,61,0,0.3)'], [2.2, 'rgba(255,167,38,0.9)']]) {
                ctx.strokeStyle = col;
                ctx.lineWidth = wd;
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let p = 1; p < pts.length; p++) ctx.lineTo(pts[p][0], pts[p][1]);
                ctx.stroke();
            }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    },

    // 불규칙 능선 실루엣 지오메트리 — 수직 평면의 정점을 다층 사인 노이즈 프로필로 변위해
    // 콘 지오메트리의 단조로운 삼각 실루엣 대신 자연스러운 봉우리 능선을 만듦
    // shape: 'ridge'(기본 능선) | 'mesa'(사막 — 침식된 평평한 탁상지) | 'jagged'(용암/바위산 — 날카로운 첨봉)
    makeRidgeGeo(w, h, peaks, shape) {
        const geo = new THREE.PlaneGeometry(w, 1, 96, 4);
        const pos = geo.attributes.position;
        const p1 = U.rand(0, 9), p2 = U.rand(0, 9), p3 = U.rand(0, 9);
        const profile = x => {
            const t = x / w; // -0.5 ~ 0.5
            let v = 0.55
                + Math.sin(t * peaks * Math.PI * 2 + p1) * 0.28
                + Math.sin(t * peaks * Math.PI * 4.7 + p2) * (shape === 'jagged' ? 0.22 : 0.13)
                + Math.sin(t * peaks * Math.PI * 11.3 + p3) * (shape === 'jagged' ? 0.09 : 0.05);
            if (shape === 'mesa') v = Math.min(v, 0.58); // 봉우리를 잘라 탁상지 실루엣
            return Math.max(0.12, v);
        };
        for (let i = 0; i < pos.count; i++) {
            const k = pos.getY(i) + 0.5; // 0(하단) ~ 1(상단)
            pos.setY(i, k * h * profile(pos.getX(i)));
        }
        return geo;
    },

    // ---- 숲 지형: 정점 변위 로우폴리 지형 + 원경 능선 + 바이옴 소품 + 안개 ----
    buildTerrain() {
        // 각진 플랫셰이딩 지형 메시 + 얼룩 텍스처 + 노멀맵(조명 반응 요철) + 버텍스 컬러 매크로 패치
        const gt = this.groundTexFor('forest');
        this.terrainMat = new THREE.MeshPhongMaterial({
            color: 0x7cb342, shininess: 0, vertexColors: true, // flatShading 제거 — 넓은 지면의 삼각 파세팅이 '로우폴리 프로토타입' 인상 (비평가 6.8 5번), 요철은 노멀맵이 담당
            map: gt.map, normalMap: gt.normal,
            normalScale: new THREE.Vector2(0.7, 0.7), // 1.45는 고주파 스펙클('카펫')로 읽힘 — 저폴리 소품과 톤 맞춤
        });
        const geo = new THREE.PlaneGeometry(60, 30, 64, 28);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const jitter = Math.abs(z) > 1.8 ? U.rand(-0.07, 0.07) : 0; // 평지 밖만 요철
            pos.setY(i, this.heightAt(x, z) + jitter);
        }
        geo.computeVertexNormals();
        // 매크로 버텍스 컬러 — 텍스처 얼룩(고주파)보다 훨씬 큰 규모의 2~3톤 대형 패치(흙길/마른 풀 밴드)를
        // 지형 정점에 직접 칠해 "단색 평면에 노이즈만 얹은" 인상을 없앰. 재질 color·map 위에 곱해지므로
        // 챕터 색이 바뀌어도 명도·온도 변주 구조는 유지된다. x 주기 30(타일 순환 경계)과 정확히 맞춤.
        {
            const vcol = new Float32Array(pos.count * 3);
            const P = Math.PI * 2 / 30;
            const smooth = t => t * t * (3 - 2 * t); // smoothstep(0,1)
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), z = pos.getZ(i);
                // 저주파 2옥타브 노이즈 (-1~1 근방)
                const n = Math.sin(x * P + z * 0.34 + 1.3) * 0.62
                    + Math.sin(x * P * 2 + 4.1 - z * 0.21) * 0.38;
                let r = 1, g = 1, b = 1;
                if (n > 0.12) {         // 밝은 마른 풀/모래 밴드 (살짝 따뜻)
                    const k = smooth(U.clamp((n - 0.12) / 0.5, 0, 1)) * 0.32;
                    r = 1 + k * 1.15; g = 1 + k; b = 1 + k * 0.55;
                } else if (n < -0.16) { // 어두운 흙/이끼 패치 (살짝 차게)
                    const k = smooth(U.clamp((-n - 0.16) / 0.5, 0, 1)) * 0.38;
                    r = 1 - k * 1.15; g = 1 - k; b = 1 - k * 0.75;
                }
                vcol[i * 3] = r; vcol[i * 3 + 1] = g; vcol[i * 3 + 2] = b;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(vcol, 3));
        }
        this.ground = new THREE.Mesh(geo, this.terrainMat);
        this.ground.receiveShadow = true;
        this.scene.add(this.ground);

        // 전투 라인 흙길 데칼 — 영웅·적이 오가는 z≈0 밴드에 밟혀 다져진 길 (단색 초원 '녹색 램프' 인상 해소, 비평가 지적)
        // ground의 자식이라 지형 타일 순환(x±30 점프)을 자동으로 따라간다. 텍스처 x반복 2 = 주기 30과 일치.
        {
            const pc = document.createElement('canvas');
            pc.width = 1024; pc.height = 256; // 512×128은 근경에서 가장자리가 뭉개져 저해상 블렌딩으로 읽힘 (비평가 7.1 19번)
            const ctx = pc.getContext('2d');
            ctx.clearRect(0, 0, 1024, 256);
            // 직선 그라디언트 밴드는 '아스팔트 고속도로'로 읽힘 — 소프트 블롭을 중심선 따라 지터로 겹쳐 유기적인 다짐길로
            for (let i = 0; i < 300; i++) {
                const x = Math.random() * 1024;
                const y = 128 + Math.sin(x * 0.01 + 1.7) * 28 + U.rand(-40, 40); // 중심선 자체가 완만히 굽이침
                const r = 24 + Math.random() * 52;
                const warm = Math.random() < 0.6;
                const gb = ctx.createRadialGradient(x, y, 0, x, y, r);
                gb.addColorStop(0, warm ? 'rgba(104,78,50,0.3)' : 'rgba(72,54,36,0.28)'); // 저알파 밝은 톤은 '안개 자국'으로 읽힘(비평가 6.9 7번) — 주변 잔디보다 확실히 어두운 황토
                gb.addColorStop(1, 'rgba(80,60,40,0)');
                ctx.fillStyle = gb;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
            for (let i = 0; i < 52; i++) { // 짧은 발자국/긁힘 결 — 긴 스트릭은 차선으로 오독
                ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(66,48,32,0.2)' : 'rgba(140,112,80,0.16)';
                ctx.lineWidth = 2.4 + Math.random() * 3.2;
                const x = Math.random() * 1024, y = 80 + Math.random() * 96;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12 + Math.random() * 28, y + U.rand(-6, 6)); ctx.stroke();
            }
            for (let i = 0; i < 60; i++) { // 잔자갈
                const v = 110 + Math.floor(Math.random() * 55);
                ctx.fillStyle = `rgba(${v},${v - 12},${v - 28},0.4)`;
                ctx.beginPath();
                ctx.arc(Math.random() * 1024, 76 + Math.random() * 104, 1.6 + Math.random() * 3.6, 0, Math.PI * 2);
                ctx.fill();
            }
            const ptex = new THREE.CanvasTexture(pc);
            ptex.wrapS = THREE.RepeatWrapping;
            ptex.repeat.set(2, 1);
            ptex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); // 저각 시점 밉 뭉개짐 방지 — 근경 가장자리 선명도
            const pathGeo = new THREE.PlaneGeometry(60, 1.7, 1, 1);
            pathGeo.rotateX(-Math.PI / 2);
            this.pathMesh = new THREE.Mesh(pathGeo, new THREE.MeshLambertMaterial({
                map: ptex, transparent: true, depthWrite: false,
            }));
            this.pathMesh.position.set(0, 0.02, 0.1); // 전투 라인 위 살짝 띄움 (z-파이팅 방지)
            this.pathMesh.renderOrder = -1; // 투명끼리 심도 정렬 경합 시 데칼이 블롭 섀도우를 덮어 길 위 그림자가 소멸 (비행체 '부유 스티커'의 실체) — 데칼을 항상 먼저
            this.pathMesh.receiveShadow = true;
            this.ground.add(this.pathMesh);
        }

        // 원경 능선 2겹 — 노이즈 프로필의 커스텀 실루엣 메시(콘의 단조로운 삼각형 대체).
        // 안개 낀 원경은 조명 음영이 거의 안 읽히므로 라이팅 없는 순색(MeshBasic)+fog 블렌딩이 그림처럼 보임.
        this.mountainMat = new THREE.MeshBasicMaterial({ color: 0x558b2f });
        this.hillMat = new THREE.MeshBasicMaterial({ color: 0x6d9150 });
        const mkRidge = (mat, w, hgt, peaks, z) => {
            const m = new THREE.Mesh(this.makeRidgeGeo(w, hgt, peaks), mat);
            m.position.set(0, 0, z);
            m.userData.baseX = 0; // 카메라를 따라감 (지평선 고정)
            this.scene.add(m);
            return m;
        };
        this.mountains = [mkRidge(this.mountainMat, 70, 5.4, 8, -12)];
        this.farHillMat = new THREE.MeshBasicMaterial({ color: 0x9db98d }); // 최원경 3번째 레이어 — 안개 직전 톤
        this.hills = [mkRidge(this.hillMat, 95, 3.6, 11, -19), mkRidge(this.farHillMat, 120, 2.6, 14, -25)];

        // 소품 공유 매테리얼 (바이옴 재구성 시 지오메트리만 버리고 매테리얼은 재사용)
        this.foliageMat = new THREE.MeshPhongMaterial({ color: 0x33691e, flatShading: true, shininess: 0 });
        // 잎 명도 변주 2종 — 나무마다 밝기가 달라 "같은 모델 복붙" 인상과 밤 숲의 "한 덩어리 검은 벽" 문제를 동시에 완화
        this.foliageMatDark = this.foliageMat.clone();
        this.foliageMatLight = this.foliageMat.clone();
        this.foliageMats = [this.foliageMat, this.foliageMatDark, this.foliageMatLight];
        this.trunkMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
        this.bushMat = new THREE.MeshPhongMaterial({ color: 0x4a7c2f, flatShading: true, shininess: 0 });
        this.stoneMat = new THREE.MeshPhongMaterial({ color: 0x9a9083, flatShading: true, shininess: 0, map: ProChar.rockTex() }); // 웜 그레이 — 청회색 돌이 초원 위 '양/정체불명 덩어리'로 오독 (비평가 7.1 15번)
        this.mossMat = new THREE.MeshPhongMaterial({ color: 0x4f8578, flatShading: true, shininess: 0 }); // 바위산 청록 이끼(보색 악센트)
        this.snowMat = new THREE.MeshPhongMaterial({ color: 0xf4faff, flatShading: true, shininess: 35, specular: 0x9db8d4 });
        this.cactusMat = new THREE.MeshPhongMaterial({ color: 0x6da24f, flatShading: true, shininess: 0 }); // 웜 그린 — 웜 샌드 지면과 온도 통일
        this.charTrunkMat = new THREE.MeshLambertMaterial({ color: 0x30231d });
        this.charRockMat = new THREE.MeshPhongMaterial({ color: 0x2e2521, flatShading: true, shininess: 0 });
        this.lavaCoreMat = new THREE.MeshBasicMaterial({ color: 0xff7043 });
        this.crystalMat = new THREE.MeshPhongMaterial({
            color: 0x9575cd, emissive: 0x6a3fb5, emissiveIntensity: 0.5,
            flatShading: true, shininess: 90, specular: 0xffffff,
        });
        this.trees = [];
        this.rocks = [];
        this.buildProps('forest');

        // 떠다니는 안개 (부드러운 타원 블롭이 천천히 흘러감)
        this.mists = [];
        for (let i = 0; i < 7; i++) {
            const mist = new THREE.Mesh(
                new THREE.SphereGeometry(1, 12, 8),
                new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: U.rand(0.05, 0.1), depthWrite: false })
            );
            mist.scale.set(U.rand(1.8, 3), U.rand(0.3, 0.55), U.rand(0.7, 1.2));
            mist.position.set(U.rand(-9, 9), U.rand(0.4, 1.8), U.rand(-4.5, -0.5));
            mist.userData.speed = U.rand(0.12, 0.35) * (Math.random() < 0.5 ? 1 : -1);
            mist.userData.baseY = mist.position.y;
            this.scene.add(mist);
            this.mists.push(mist);
        }
    },

    // 바이옴별 지면 텍스처 캐시 — 챕터 전환 때마다 캔버스를 다시 그리지 않게 1회 생성 후 재사용.
    // 모든 맵의 repeat를 12,6으로 통일(r128은 emissiveMap 등이 map의 uv변환을 공유하므로 어긋나면 안 됨).
    // 불규칙 바위 지오메트리 — 정십이면체 정점을 랜덤 변위 (기하학 '주사위' 실루엣 제거, 비평가 지적)
    rockGeo(rad) {
        const geo = new THREE.DodecahedronGeometry(rad, 0);
        const p = geo.attributes.position;
        const seedX = Math.random() * 10, seedY = Math.random() * 10;
        for (let i = 0; i < p.count; i++) {
            // 면이 공유하는 정점은 같은 변위를 받아야 면이 안 찢어짐 — 좌표 기반 의사난수
            const kx = Math.sin(p.getX(i) * 51.7 + seedX) * 0.5 + Math.sin(p.getY(i) * 37.3 + seedY) * 0.5;
            const s2 = 1 + kx * 0.22;
            p.setXYZ(i, p.getX(i) * s2, p.getY(i) * (1 + Math.sin(p.getZ(i) * 43.1 + seedX) * 0.18), p.getZ(i) * s2);
        }
        geo.computeVertexNormals();
        return geo;
    },

    groundTexFor(biome) {
        this._gtex = this._gtex || {};
        if (!this._gtex[biome]) {
            this._gtex[biome] = { map: this.makeGroundTexture(biome), normal: this.makeGroundNormalMap(biome) };
        }
        return this._gtex[biome];
    },

    // ---- 바이옴 소품 세트: 챕터에 따라 나무/덤불/바위를 통째로 갈아끼움 ----
    // (색만 바뀌던 기존 방식에서 소재 자체가 바뀌는 방식으로 — 용암=죽은 나무·화산암, 설원=눈 덮인 소나무 등)
    buildProps(biome) {
        this._biome = biome;
        // 바이옴 전용 지면 소재(알베도+노멀) 스왑 — 같은 얼룩 텍스처의 색만 바뀌던 인상 제거
        if (this.terrainMat) {
            const gt = this.groundTexFor(biome);
            this.terrainMat.map = gt.map;
            this.terrainMat.normalMap = gt.normal;
            this.terrainMat.needsUpdate = true;
        }
        // 기존 소품 제거 — 매테리얼·공유 지오메트리(블롭 섀도우)는 살리고 개별 지오메트리만 해제
        for (const o of [...this.trees, ...this.rocks]) {
            o.traverse(m => { if (m.isMesh && m.geometry && !m.userData.sharedGeometry) m.geometry.dispose(); });
            this.scene.remove(o);
        }
        this.trees = [];
        this.rocks = [];
        // 바이옴 시그니처 원경 실루엣 — 사막=메사, 용암/바위산=첨봉, 그 외=자연 능선
        if (this.mountains) {
            const shape = biome === 'desert' ? 'mesa' : (biome === 'lava' || biome === 'rock') ? 'jagged' : 'ridge';
            this.mountains[0].geometry.dispose();
            this.mountains[0].geometry = this.makeRidgeGeo(70, 5.4, 8, shape);
        }
        // 큰 소품: 'p'=주 소품(나무 계열), 'r'=부 소품(둥근 계열) — 바이옴별로 실제 형태가 결정됨
        const spots = [
            [-7, -3.2, 1.1, 'p'], [-5.2, -2.6, 0.8, 'r'], [-3.4, -3.8, 1.3, 'p'], [-1.2, -3, 0.9, 'r'],
            [0.8, -3.6, 1.2, 'p'], [2.6, -2.8, 0.85, 'p'], [4.4, -3.5, 1.15, 'r'], [6.2, -2.9, 0.9, 'p'],
            [8, -3.8, 1.3, 'p'], [-8.8, -2.4, 0.7, 'r'], [-6, -5.5, 1.6, 'p'], [0, -6, 1.8, 'p'],
            [6.5, -5.8, 1.7, 'p'], [-3.6, 2.6, 0.7, 'r'], [4.2, 2.8, 0.75, 'p'], [9.5, -5, 1.5, 'p'],
        ];
        // 접지 블롭 섀도우 공유 리소스 — 소품이 지면에 "붙어" 보이게 하는 소프트 원형 그림자
        this.ensureBlobRes();
        const emissiveAnchors = []; // 악센트 라이트를 붙일 발광 소품(마법=크리스탈, 용암=발광 데칼)
        for (const [x, z, s, kind] of spots) {
            const t = this.makeProp(biome, kind, s);
            t.position.set(x, this.heightAt(x, z), z);
            t.rotation.y = U.rand(0, Math.PI * 2);
            t.scale.multiplyScalar(U.rand(0.88, 1.14)); t.scale.y *= U.rand(0.94, 1.1); // 인스턴스 지터 — 동일 스케일 복붙 티 제거 (비평가 13번)
            if (biome === 'magic' && kind === 'p' && z > -5) emissiveAnchors.push(t); // 근·중경 크리스탈만
            this.setShadow(t);
            const blob = new THREE.Mesh(this.blobGeo, this.blobShadowMat); // setShadow 이후에 붙여 castShadow 제외
            blob.rotation.x = -Math.PI / 2;
            blob.position.y = 0.03;
            blob.scale.setScalar(1.15 * s + 0.5); // 캐노피 밖으로 그림자가 보이도록 넉넉하게
            blob.userData.sharedGeometry = true;
            t.add(blob);
            this.scene.add(t);
            this.trees.push(t);
        }
        // 히어로 랜드마크 — 챕터당 화면을 기억시키는 대형 센터피스 1기 (주 소품 2.6배 + 곁 소품으로 클러스터).
        // 스토어 스크린샷은 랜드마크로 기억된다는 원칙 — 반복 소품 나열 인상 제거
        {
            const hero = new THREE.Group();
            const main = this.makeProp(biome, 'p', 3.3);
            hero.add(main);
            const side = this.makeProp(biome, 'r', 1.2);
            side.position.set(1.5, 0, 0.7);
            side.rotation.y = U.rand(0, Math.PI * 2);
            hero.add(side);
            hero.position.set(-3.2, this.heightAt(-3.2, -7.6), -7.6);
            this.setShadow(hero);
            const hblob = new THREE.Mesh(this.blobGeo, this.blobShadowMat);
            hblob.rotation.x = -Math.PI / 2;
            hblob.position.y = 0.04;
            hblob.scale.setScalar(2.9);
            hblob.userData.sharedGeometry = true;
            hero.add(hblob);
            this.scene.add(hero);
            this.trees.push(hero);
        }
        // 용암: 크랙 주변에 깔리는 부가 발광 데칼 — emissiveMap 크랙과 악센트 라이트를 잇는 은은한 지면광
        if (biome === 'lava') {
            if (!this.lavaGlowMat) {
                this.lavaGlowMat = new THREE.MeshBasicMaterial({
                    map: this.makeGlowTexture(), color: 0xff5722, transparent: true, opacity: 0.42,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                });
            }
            for (let i = 0; i < 7; i++) {
                const gl = new THREE.Mesh(this.blobGeo, this.lavaGlowMat);
                gl.rotation.x = -Math.PI / 2;
                gl.position.y = 0.045;
                gl.scale.setScalar(U.rand(1.4, 2.6));
                gl.userData.sharedGeometry = true;
                const wrap = new THREE.Group(); // scrollables가 그룹 position을 조작하므로 좌표는 그룹에
                wrap.add(gl);
                const x = U.rand(-9, 9), z = U.rand(-5.5, 1.5);
                wrap.position.set(x, this.heightAt(x, z), z);
                this.scene.add(wrap);
                this.rocks.push(wrap);
                emissiveAnchors.push(wrap);
            }
        }
        // 악센트 포인트라이트 풀 배치 — 발광 소품의 자식으로 붙여 크리스탈/크랙 "주변"이 실제로 물들게.
        // (고정 라이트 1개는 소품 스크롤과 어긋나 라이트 블리드가 안 읽혔음 — 3회차 비평가 지적 반영)
        {
            const conf = biome === 'magic' ? { color: 0x2fd8ee, intensity: 2.6, dist: 9, y: 1.0 }
                : biome === 'lava' ? { color: 0xff5722, intensity: 2.4, dist: 9, y: 0.5 } : null;
            const n = emissiveAnchors.length;
            const picks = n ? [0, Math.floor(n / 2), n - 1] : []; // 몰리지 않게 앞·중간·끝에서 선택
            this.accents.forEach((pl, i) => {
                if (pl.parent) pl.parent.remove(pl);
                const anchor = conf && n ? emissiveAnchors[picks[i % picks.length]] : null;
                if (anchor) {
                    pl.color.setHex(conf.color);
                    pl.intensity = conf.intensity;
                    pl.distance = conf.dist;
                    pl.position.set(0, conf.y, 0);
                    anchor.add(pl);
                } else {
                    pl.intensity = 0; // 미사용 바이옴에선 씬에서 완전히 빼 프래그먼트 라이트 평가 비용 제로화
                }                     // (스킬 이펙트가 이미 포인트라이트를 수시로 넣었다 빼므로 셰이더 재컴파일은 기존 동작 범위)
            });
        }
        // 사막 중경 공백 채우기 — 소품 라인(z≈-3)과 원경 메사(z≈-12) 사이 빈 모래밭에
        // 암석층/마른 관목/뼈 클러스터를 깔아 화면 중단이 비어 보이던 문제 해소 (3회차 비평가 지적)
        if (biome === 'desert') {
            const midSpots = [
                [-8.2, -8.8, 2.1, 'strata'], [-2.2, -9.2, 2.4, 'strata'], [3.8, -8.4, 1.9, 'shrub'],
                [8.6, -9, 2.2, 'strata'], [-5.2, -6.9, 1.25, 'shrub'], [0.6, -7.1, 1.05, 'bones'],
                [6, -6.6, 1.15, 'shrub'], [-9.4, -6.2, 0.95, 'bones'],
            ];
            for (const [x, z, s, kind] of midSpots) {
                const p = kind === 'strata' ? this.makeStrata(s) : kind === 'shrub' ? this.makeDryShrub(s) : this.makeBones(s);
                p.position.set(x, this.heightAt(x, z), z);
                p.rotation.y = U.rand(0, Math.PI * 2);
                this.setShadow(p);
                const blob = new THREE.Mesh(this.blobGeo, this.blobShadowMat);
                blob.rotation.x = -Math.PI / 2;
                blob.position.y = 0.03;
                blob.scale.setScalar(0.9 * s + 0.4);
                blob.userData.sharedGeometry = true;
                p.add(blob);
                this.scene.add(p);
                this.trees.push(p);
            }
        }
        // 작은 소품도 접지 블롭을 깔아 "떠 있는 스티커" 인상 제거 — 회전은 내부 메시에만 주고 그룹은 수평 유지
        const grounded = (mesh, blobScale) => {
            const g = new THREE.Group();
            g.add(mesh);
            const blob = new THREE.Mesh(this.blobGeo, this.blobShadowMat);
            blob.rotation.x = -Math.PI / 2;
            blob.position.y = 0.025;
            blob.scale.setScalar(blobScale);
            blob.userData.sharedGeometry = true;
            g.add(blob);
            return g;
        };
        // 덤불 (용암·사막·바위산은 생략 — 식생이 없는 소재)
        if (!['lava', 'desert', 'rock'].includes(biome)) {
            for (let i = 0; i < 7; i++) {
                const rad = U.rand(0.14, 0.28);
                const b = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 0), this.bushMat);
                b.position.y = rad * 0.65;
                b.scale.y = 0.7;
                b.castShadow = true;
                const g = grounded(b, rad * 2.6);
                const x = U.rand(-9, 9), z = (() => { let zz; do { zz = U.rand(-2.4, 1.8); } while (Math.abs(zz) < 0.85); return zz; })(); // 전투 라인 배제
                g.position.set(x, this.heightAt(x, z) + 0.02, z);
                this.scene.add(g);
                this.rocks.push(g);
            }
        }
        // 잔돌 — 둥근 자갈/납작 판석 2형태 믹스 (단일 다면체 복붙 티 제거)
        const stoneCount = ['lava', 'desert', 'rock'].includes(biome) ? 11 : 7;
        for (let i = 0; i < stoneCount; i++) {
            const rad = U.rand(0.1, 0.3);
            const r = new THREE.Mesh(
                this.rockGeo(rad),
                biome === 'lava' ? this.charRockMat : this.stoneMat
            );
            if (Math.random() < 0.4) { r.scale.set(1.2, 0.35, 0.8); r.position.y = rad * 0.28; } // 판석형
            else r.position.y = rad * 0.6;
            r.rotation.set(U.rand(0, 3), U.rand(0, 3), 0);
            r.castShadow = true;
            const g = grounded(r, rad * 2.4);
            const x = U.rand(-9, 9), z = (() => { let zz; do { zz = U.rand(-2.8, 1.6); } while (Math.abs(zz) < 0.85); return zz; })(); // 전투 라인 배제
            g.position.set(x, this.heightAt(x, z) + 0.02, z);
            this.scene.add(g);
            this.rocks.push(g);
        }
        // 꽃 무리 + 양치류 — 2차 식생 (나무·바위·풀 3종 반복의 단조로움 해소, 비평가 '환경 밀도' 지적)
        if (!['lava', 'desert', 'rock', 'snow'].includes(biome)) {
            const petalCols = [0xef6292, 0xfff176, 0xba68c8, 0xff8a65, 0xf5f5f5];
            this._flowerMats = this._flowerMats || petalCols.map(c => new THREE.MeshLambertMaterial({ color: c }));
            this._stemMat = this._stemMat || new THREE.MeshLambertMaterial({ color: 0x4a7332 });
            this._fernMat = this._fernMat || new THREE.MeshLambertMaterial({ color: 0x3d6b2a, side: THREE.DoubleSide });
            for (let i = 0; i < 6; i++) { // 꽃 무리: 줄기+꽃송이 2~4개 클러스터
                const cl = new THREE.Group();
                const n = 2 + Math.floor(Math.random() * 3);
                const mat = this._flowerMats[Math.floor(Math.random() * this._flowerMats.length)];
                for (let j = 0; j < n; j++) {
                    const fx = U.rand(-0.09, 0.09), fz = U.rand(-0.09, 0.09), fh = U.rand(0.09, 0.16);
                    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, fh, 5), this._stemMat);
                    stem.position.set(fx, fh / 2, fz);
                    stem.rotation.z = U.rand(-0.2, 0.2);
                    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(U.rand(0.028, 0.042), 0), mat);
                    head.position.set(fx + stem.rotation.z * -fh * 0.5, fh + 0.02, fz);
                    cl.add(stem, head);
                }
                const g = grounded(cl, 0.5);
                const x = U.rand(-9, 9), z = (() => { let zz; do { zz = U.rand(-2.6, 1.7); } while (Math.abs(zz) < 0.9); return zz; })();
                g.position.set(x, this.heightAt(x, z) + 0.02, z);
                this.scene.add(g);
                this.rocks.push(g);
            }
            for (let i = 0; i < 4; i++) { // 양치류: 중심에서 방사형으로 젖힌 잎날 5~6개
                const fern = new THREE.Group();
                const blades = 5 + Math.floor(Math.random() * 2);
                for (let j = 0; j < blades; j++) {
                    const a = (j / blades) * Math.PI * 2 + U.rand(-0.2, 0.2);
                    const len = U.rand(0.16, 0.26);
                    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, len, 4), this._fernMat);
                    blade.scale.z = 0.3; // 납작한 잎
                    blade.position.set(Math.cos(a) * 0.07, len * 0.42, Math.sin(a) * 0.07);
                    blade.rotation.set(Math.sin(a) * 0.85, -a, Math.cos(a) * 0.85); // 바깥으로 젖힘
                    fern.add(blade);
                }
                const g = grounded(fern, 0.6);
                const x = U.rand(-9, 9), z = (() => { let zz; do { zz = U.rand(-2.6, 1.7); } while (Math.abs(zz) < 0.9); return zz; })();
                g.position.set(x, this.heightAt(x, z) + 0.02, z);
                this.scene.add(g);
                this.rocks.push(g);
            }
        }
        // 무한맵 스크롤 대상 (걷는 동안 왼쪽으로 흘러가며 순환, 지형 높이 추적)
        this.scrollables = [...this.trees, ...this.rocks];
        this.buildScatter(biome);
    },

    // 바이옴별 지면 스캐터(풀 포기/자갈/발광 이끼 등) — InstancedMesh 1드로우콜.
    // 지면 타일(this.ground)의 자식이라 타일 순환(x±30 점프)과 함께 자동으로 흘러가고,
    // heightAt이 x 주기 30이라 로컬 좌표 높이가 어느 타일 위치에서도 유효함.
    // 풀 포기: 원뿔 1개는 '압정'으로 읽힘(비평가 지적) — 기울기·크기가 다른 잎날 4개를 병합한 클러스터 지오메트리
    tuftGeo() {
        const parts = [];
        const defs = [[0, 0, 0, 1], [0.05, 0.025, 0.4, 0.68], [-0.045, -0.02, -0.34, 0.74], [0.012, -0.05, 0.18, 0.55]];
        for (const [dx, dz, tilt, k] of defs) {
            const h = 0.1 + 0.12 * k;
            const g2 = new THREE.ConeGeometry(0.02 + 0.028 * k, h, 4).toNonIndexed();
            g2.rotateZ(tilt);
            g2.rotateY(dx * 40);
            g2.translate(dx, h * 0.3, dz);
            parts.push(g2);
        }
        let total = 0;
        parts.forEach(g2 => { total += g2.attributes.position.count; });
        const pos = new Float32Array(total * 3), norm = new Float32Array(total * 3);
        let off = 0;
        for (const g2 of parts) {
            pos.set(g2.attributes.position.array, off * 3);
            norm.set(g2.attributes.normal.array, off * 3);
            off += g2.attributes.position.count;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
        return geo;
    },

    buildScatter(biome) {
        if (this.scatter) {
            this.ground.remove(this.scatter);
            this.scatter.geometry.dispose();
            this.scatter.material.dispose();
            this.scatter = null;
        }
        if (this.scatter2) {
            this.ground.remove(this.scatter2);
            this.scatter2.geometry.dispose();
            this.scatter2.material.dispose();
            this.scatter2 = null;
        }
        if (this.scatter3) {
            this.ground.remove(this.scatter3);
            this.scatter3.geometry.dispose(); // 재질은 scatter와 공유 — 지오메트리만 해제
            this.scatter3 = null;
        }
        let geo, mat, n = 190, flat = true, tint = 0.12;
        switch (biome) {
            case 'desert':
                geo = new THREE.DodecahedronGeometry(0.05, 0);
                mat = new THREE.MeshLambertMaterial({ color: 0xb08a63 });
                tint = 0.14;
                break;
            case 'rock': // 웜 그레이 잔자갈 — 지면과 같은 소재군 (초록/황토 콘은 "정체불명 마커"로 읽혔음)
                geo = new THREE.DodecahedronGeometry(0.055, 0);
                mat = new THREE.MeshLambertMaterial({ color: 0x857868 });
                tint = 0.15;
                break;
            case 'snow':
                geo = new THREE.DodecahedronGeometry(0.06, 0);
                mat = new THREE.MeshLambertMaterial({ color: 0xe8f2fb });
                tint = 0.06;
                break;
            case 'lava': // 잔불 머금은 스코리아 자갈 — 어두워진 현무암 지면 위에서 은은한 잉걸불 악센트
                geo = new THREE.DodecahedronGeometry(0.05, 0);
                mat = new THREE.MeshLambertMaterial({ color: 0x3b2d27, emissive: 0x4a1505 });
                n = 150;
                break;
            case 'magic': // 발광 이끼 조각 — 시안 악센트
                geo = new THREE.OctahedronGeometry(0.045, 0);
                mat = new THREE.MeshBasicMaterial({ color: 0x4dd0e1 });
                n = 120;
                tint = 0.2;
                break;
            default: // forest: 풀 포기 (잎날 클러스터) — 지형 알베도 쪽으로 30% 눌러 채도 정합
                geo = this.tuftGeo();
                mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x558b2f).lerp(new THREE.Color(0x9cbf6e), 0.58) }); // 지면 알베도로 더 눌러 채도 정합 — 네온 튀는 스프라이트 인상 (비평가 7.1 9번)
                n = 240;
                flat = false;
                tint = 0.2;
        }
        // 화면 하단(카메라 앞 둔덕 z 2.2~3.4)까지 스캐터를 확장 — "하단 40% 빈 지면" 구도 결함 완화
        const mk = (geo2, mat2, cnt, flat2, tint2, zMin, zMax) => {
            const im = new THREE.InstancedMesh(geo2, mat2, cnt);
            const dummy = new THREE.Object3D();
            const col = new THREE.Color();
            for (let i = 0; i < cnt; i++) {
                let x = U.rand(-28, 28), z = U.rand(zMin, zMax);
                if (Math.abs(z) < 0.55) z = 0.55 * Math.sign(z || 1) + z; // 스캐터도 전투 라인 살짝 비켜감
                dummy.position.set(x, this.heightAt(x, z) + 0.02, z);
                dummy.rotation.y = U.rand(0, Math.PI * 2);
                const sc = U.rand(0.7, 1.6);
                dummy.scale.set(sc, sc * (flat2 ? U.rand(0.45, 0.75) : U.rand(0.8, 1.4)), sc);
                dummy.updateMatrix();
                im.setMatrixAt(i, dummy.matrix);
                col.copy(mat2.color).offsetHSL(U.rand(-0.015, 0.015), U.rand(-0.04, 0.04), U.rand(-tint2, tint2));
                im.setColorAt(i, col);
            }
            // ❗receiveShadow 금지 — r128에서 instanceColor를 쓰는 InstancedMesh가 그림자 수신 프로그램에 끼면
            // 부모 지형을 포함한 씬 전체의 그림자 수신이 조용히 깨진다(실측: 이 한 줄이 true면 지형 그림자 전멸).
            im.receiveShadow = false;
            this.ground.add(im);
            return im;
        };
        this.scatter = mk(geo, mat, n, flat, tint, -3.4, 3.2);
        // 근경 전용 디테일 레이어 — 카메라 앞 둔덕(z 3.2~5.6, 화면 최하단 40%)에 같은 소재를
        // 더 크고 촘촘하게. 세로 화면 첫인상을 결정하는 근경이 "무텍스처 단색 평면"이던 결함 해소
        this.scatter3 = (() => {
            const im = new THREE.InstancedMesh(geo, mat, n);
            const dummy = new THREE.Object3D();
            const col = new THREE.Color();
            for (let i = 0; i < n; i++) {
                const x = U.rand(-28, 28), z = U.rand(3.2, 5.6);
                dummy.position.set(x, this.heightAt(x, z) + 0.02, z);
                dummy.rotation.y = U.rand(0, Math.PI * 2);
                const sc = U.rand(1.1, 2.4); // 근경은 원근상 더 커야 자연스럽다
                dummy.scale.set(sc, sc * (flat ? U.rand(0.45, 0.75) : U.rand(0.8, 1.4)), sc);
                dummy.updateMatrix();
                im.setMatrixAt(i, dummy.matrix);
                col.copy(mat.color).offsetHSL(U.rand(-0.015, 0.015), U.rand(-0.04, 0.04), U.rand(-tint, tint));
                im.setColorAt(i, col);
            }
            im.receiveShadow = false; // 상동 — instanceColor InstancedMesh는 그림자 수신 금지
            this.ground.add(im);
            return im;
        })();
        // 보조 악센트 스캐터 — 5% 악센트 색 규칙(단색 팔레트 지적 반영): 초원=들꽃, 설원=얼음 결정,
        // 바위산=골드 야생화, 마법=보라 자갈, 사막=적갈 자갈, 용암=재 조각
        const acc = {
            forest: [new THREE.OctahedronGeometry(0.035, 0), 0xfff3b0, 46],
            snow: [new THREE.ConeGeometry(0.03, 0.1, 4), 0xbfe6ff, 34],
            rock: [new THREE.OctahedronGeometry(0.035, 0), 0xd9b44a, 36],
            magic: [new THREE.DodecahedronGeometry(0.045, 0), 0x3d2b6e, 60],
            desert: [new THREE.DodecahedronGeometry(0.04, 0), 0x8a5a3c, 50],
            lava: [new THREE.DodecahedronGeometry(0.04, 0), 0x6e625c, 50],
        }[biome] || [new THREE.OctahedronGeometry(0.035, 0), 0xfff3b0, 46];
        const accMat = biome === 'forest' || biome === 'rock' || biome === 'snow'
            ? new THREE.MeshBasicMaterial({ color: acc[1] }) // 들꽃/결정은 자체 발색으로 또렷하게
            : new THREE.MeshLambertMaterial({ color: acc[1] });
        this.scatter2 = mk(acc[0], accMat, acc[2], true, 0.1, -3, 5.2);
    },

    makeProp(biome, kind, s) {
        switch (biome) {
            case 'desert': return kind === 'p' ? this.makeCactus(s)
                : (Math.random() < 0.5 ? this.makeRockSpire(s * 0.8) : this.makeSlab(s * 0.8));
            case 'rock': return kind === 'p' ? (Math.random() < 0.65 ? this.makeRockSpire(s) : this.makeRockCluster(s * 0.9, true))
                : (Math.random() < 0.5 ? this.makeBoulder(s * 0.75, false, Math.random() < 0.8) : this.makeSlab(s * 0.7));
            case 'snow': return kind === 'p' ? this.makePine(s, true) : this.makeBoulder(s * 0.65, true);
            case 'magic': return kind === 'p' ? this.makeCrystal(s) : this.makeRoundTree(s * 0.9);
            case 'lava': return kind === 'p' ? this.makeDeadTree(s) : this.makeVolcanicRock(s * 0.7);
            default: return kind === 'p' ? this.makePine(s) : this.makeRoundTree(s);
        }
    },

    makePine(s, snow) {
        const g = new THREE.Group();
        const fm = this.foliageMats[Math.random() * 3 | 0]; // 나무별 잎 명도 변주
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.13 * s, 0.5 * s, 7), this.trunkMat);
        trunk.position.y = 0.25 * s;
        g.add(trunk);
        for (let i = 0; i < 3; i++) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry((0.55 - i * 0.13) * s, 0.62 * s, 7), fm);
            cone.position.y = (0.62 + i * 0.4) * s;
            g.add(cone);
            if (snow) { // 설원: 각 단 위에 눈 고깔을 얹음
                const cap = new THREE.Mesh(new THREE.ConeGeometry((0.55 - i * 0.13) * s * 0.8, 0.3 * s, 7), this.snowMat);
                cap.position.y = (0.62 + i * 0.4) * s + 0.19 * s;
                g.add(cap);
            }
        }
        return g;
    },

    // 죽은 나무(용암) — 잎 없이 갈라진 검게 탄 가지. 2단 분기 + 부러진 우듬지로 "Y자 막대기" 인상 제거
    makeDeadTree(s) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.14 * s, 0.9 * s, 6), this.charTrunkMat);
        trunk.position.y = 0.45 * s;
        trunk.rotation.z = U.rand(-0.09, 0.09);
        g.add(trunk);
        const snag = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.05 * s, 0.2 * s, 5), this.charTrunkMat); // 부러진 우듬지 스파이크
        snag.position.y = 0.98 * s;
        snag.rotation.z = trunk.rotation.z;
        g.add(snag);
        for (let i = 0; i < 4; i++) {
            const len = U.rand(0.4, 0.6) * s;
            const br = new THREE.Mesh(new THREE.CylinderGeometry(0.016 * s, 0.042 * s, len, 5), this.charTrunkMat);
            const a = (i / 4) * Math.PI * 2 + U.rand(0, 0.9);
            const y0 = (0.5 + i * 0.13) * s;
            br.position.set(Math.cos(a) * 0.2 * s, y0, Math.sin(a) * 0.2 * s);
            br.rotation.set(Math.sin(a) * U.rand(0.55, 0.95), 0, -Math.cos(a) * U.rand(0.55, 0.95));
            g.add(br);
            // 2차 잔가지 — 가지 끝에서 다른 방향으로 꺾여 나감 (실루엣 디자인)
            const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * s, 0.016 * s, len * 0.55, 4), this.charTrunkMat);
            tw.position.set(Math.cos(a) * 0.44 * s, y0 + len * 0.3, Math.sin(a) * 0.44 * s);
            tw.rotation.set(Math.sin(a) * U.rand(0.1, 0.5), U.rand(0, 1.5), -Math.cos(a) * U.rand(0.9, 1.4));
            g.add(tw);
        }
        return g;
    },

    // 선인장(사막) — 몸통 + ㄴ자 팔
    // 선인장(사막) — 배흘림 몸통(라테) + 둥근 팔꿈치 관절 + 반구 꼭지. "직육면체 압출" 인상 제거
    makeCactus(s) {
        const g = new THREE.Group();
        // 몸통: 아래가 불룩한 배흘림 프로필 (수직 압출 원기둥 대신 유기적 실루엣)
        const prof = [[0.09, 0], [0.15, 0.14], [0.165, 0.4], [0.14, 0.7], [0.1, 0.94], [0.001, 1.02]];
        const body = new THREE.Mesh(
            new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * s, y * s)), 9), this.cactusMat);
        g.add(body);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1 * s, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.cactusMat);
        cap.position.y = 0.94 * s;
        g.add(cap);
        for (const side of [-1, 1]) {
            if (Math.random() < 0.3) continue;
            const y = U.rand(0.38, 0.58) * s;
            // 팔: 수평 세그먼트 → 구 관절 → 위로 꺾인 세그먼트 → 반구 팁 (곡선형 ㄴ자)
            const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.07 * s, 0.24 * s, 8), this.cactusMat);
            seg1.rotation.z = side * (Math.PI / 2 - 0.18);
            seg1.position.set(side * 0.24 * s, y + 0.02 * s, 0);
            const joint = new THREE.Mesh(new THREE.SphereGeometry(0.065 * s, 8, 6), this.cactusMat);
            joint.position.set(side * 0.35 * s, y + 0.05 * s, 0);
            const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.062 * s, 0.32 * s, 8), this.cactusMat);
            seg2.rotation.z = side * 0.12;
            seg2.position.set(side * 0.37 * s, y + 0.2 * s, 0);
            const tip = new THREE.Mesh(new THREE.SphereGeometry(0.052 * s, 8, 6), this.cactusMat);
            tip.position.set(side * 0.385 * s, y + 0.36 * s, 0);
            g.add(seg1, joint, seg2, tip);
        }
        // 사막 악센트 5%: 가끔 꼭대기에 분홍 선인장 꽃
        if (Math.random() < 0.4) {
            if (!this.cactusFlowerMat) this.cactusFlowerMat = new THREE.MeshLambertMaterial({ color: 0xef6292 });
            const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.055 * s, 0), this.cactusFlowerMat);
            fl.position.y = 1.02 * s;
            fl.scale.y = 0.7;
            g.add(fl);
        }
        return g;
    },

    // 바위 첨탑(바위산 주 소품 · 사막 부 소품) — 세로로 긴 암석을 쌓아올림
    makeRockSpire(s) {
        const g = new THREE.Group();
        const n = 2 + (Math.random() * 2 | 0);
        for (let i = 0; i < n; i++) {
            const r = new THREE.Mesh(this.rockGeo(U.rand(0.24, 0.38) * s), this.stoneMat);
            r.position.set(U.rand(-0.12, 0.12) * s, (0.28 + i * 0.42) * s, U.rand(-0.08, 0.08) * s);
            r.scale.set(1 - i * 0.16, U.rand(1.4, 1.9), 1 - i * 0.16);
            r.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(-0.2, 0.2));
            g.add(r);
        }
        return g;
    },

    // 둥근 바위(바위산/설원 부 소품) — snow=true면 위에 눈 뚜껑, moss=true면 청록 이끼 뚜껑(바위산 보색 악센트)
    makeBoulder(s, snow, moss) {
        const g = new THREE.Group();
        const b = new THREE.Mesh(this.rockGeo(0.45 * s), this.stoneMat);
        b.position.y = 0.27 * s;
        b.scale.y = 0.75;
        b.rotation.set(U.rand(0, 3), U.rand(0, 3), 0);
        g.add(b);
        if (snow || moss) {
            const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36 * s, 0), snow ? this.snowMat : this.mossMat);
            cap.position.y = 0.5 * s;
            cap.scale.y = 0.4;
            cap.rotation.y = U.rand(0, 3);
            g.add(cap);
        }
        return g;
    },

    // 판형 슬라브 바위 — 납작하고 각진 판석을 비스듬히 겹쳐 세움 (다면체 1종 복붙 티 제거용 제2 바위 형태)
    makeSlab(s) {
        const g = new THREE.Group();
        const n = 2 + (Math.random() * 2 | 0);
        for (let i = 0; i < n; i++) {
            const p = new THREE.Mesh(this.rockGeo(U.rand(0.3, 0.42) * s), this.stoneMat);
            p.scale.set(U.rand(0.9, 1.25), 0.28, U.rand(0.55, 0.8));         // 납작한 판
            p.position.set(U.rand(-0.14, 0.14) * s, (0.1 + i * 0.14) * s, U.rand(-0.1, 0.1) * s);
            p.rotation.set(U.rand(-0.16, 0.16), U.rand(0, 3), U.rand(0.12, 0.42) * (i % 2 ? 1 : -1)); // 비스듬한 적층
            g.add(p);
        }
        return g;
    },

    // 사막 중경용 수평 퇴적 암석층 — 넓은 판을 낮게 쌓아 침식된 사암층(메사 축소판)을 만듦
    makeStrata(s) {
        const g = new THREE.Group();
        const n = 3 + (Math.random() * 2 | 0);
        let y = 0.07 * s;
        for (let i = 0; i < n; i++) {
            const w = (1 - i * 0.16) * s;
            const p = new THREE.Mesh(this.rockGeo(0.5), this.stoneMat);
            p.scale.set(w * U.rand(0.95, 1.2), 0.16 * s, w * U.rand(0.55, 0.75));
            p.position.set(U.rand(-0.06, 0.06) * s, y, U.rand(-0.05, 0.05) * s);
            p.rotation.y = U.rand(-0.25, 0.25);
            g.add(p);
            y += 0.15 * s;
        }
        return g;
    },

    // 사막 마른 관목 — 밑동에서 사방으로 뻗는 가는 가지 다발 (죽은 덤불)
    makeDryShrub(s) {
        const g = new THREE.Group();
        const n = 5 + (Math.random() * 3 | 0);
        for (let i = 0; i < n; i++) {
            const len = U.rand(0.3, 0.5) * s;
            const br = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * s, 0.016 * s, len, 4), this.charTrunkMat);
            const a = (i / n) * Math.PI * 2 + U.rand(-0.3, 0.3);
            const tilt = U.rand(0.5, 1.0); // 바깥으로 눕는 정도
            br.position.set(Math.cos(a) * Math.sin(tilt) * len * 0.4, Math.cos(tilt) * len * 0.45, Math.sin(a) * Math.sin(tilt) * len * 0.4);
            br.rotation.z = -Math.cos(a) * tilt;
            br.rotation.x = Math.sin(a) * tilt;
            g.add(br);
        }
        return g;
    },

    // 사막 뼈 소품 — 모래에 반쯤 묻힌 갈비뼈 아치 + 두개골 (사막 서사 디테일)
    makeBones(s) {
        if (!this.boneMat) this.boneMat = new THREE.MeshLambertMaterial({ color: 0xe6ddc8 });
        const g = new THREE.Group();
        const ribs = 3 + (Math.random() * 2 | 0);
        for (let i = 0; i < ribs; i++) {
            const r = new THREE.Mesh(new THREE.TorusGeometry(U.rand(0.16, 0.22) * s * (1 - i * 0.1), 0.018 * s, 5, 10, Math.PI), this.boneMat);
            r.position.set(0, 0.02, (i - ribs / 2) * 0.14 * s);
            r.rotation.z = U.rand(-0.12, 0.12);
            g.add(r);
        }
        const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09 * s, 0), this.boneMat);
        skull.position.set(U.rand(0.25, 0.35) * s, 0.06 * s, (ribs / 2) * 0.14 * s + 0.1 * s);
        skull.scale.set(1, 0.8, 1.25);
        g.add(skull);
        return g;
    },

    // 바위 클러스터 — 큰 볼더 곁에 슬라브·잔돌이 모여 나는 자연 배치 (단일 오브젝트 나열 인상 제거)
    makeRockCluster(s, moss) {
        const g = new THREE.Group();
        const main = this.makeBoulder(s * 0.9, false, moss);
        g.add(main);
        const slab = this.makeSlab(s * 0.55);
        slab.position.set(U.rand(0.32, 0.45) * s, 0, U.rand(-0.2, 0.2) * s);
        slab.rotation.y = U.rand(0, Math.PI * 2);
        g.add(slab);
        for (let i = 0; i < 2; i++) {
            const peb = new THREE.Mesh(this.rockGeo(U.rand(0.08, 0.14) * s), this.stoneMat);
            const a = U.rand(0, Math.PI * 2);
            peb.position.set(Math.cos(a) * 0.5 * s, 0.06 * s, Math.sin(a) * 0.4 * s);
            peb.rotation.set(U.rand(0, 3), U.rand(0, 3), 0);
            g.add(peb);
        }
        return g;
    },

    // 화산암(용암) — 검게 탄 바위 밑동에 발광 용암 코어가 비침
    makeVolcanicRock(s) {
        const g = new THREE.Group();
        const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 * s, 0), this.lavaCoreMat);
        core.position.y = 0.16 * s;
        g.add(core);
        for (let i = 0; i < 3; i++) { // 코어를 덮는 균열 난 암석 조각들
            const a = (i / 3) * Math.PI * 2 + U.rand(0, 0.8);
            const r = new THREE.Mesh(this.rockGeo(U.rand(0.24, 0.34) * s), this.charRockMat);
            r.position.set(Math.cos(a) * 0.16 * s, 0.24 * s + U.rand(0, 0.1) * s, Math.sin(a) * 0.16 * s);
            r.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(0, 3));
            g.add(r);
        }
        return g;
    },

    // 수정 결정(마법/심해) — 테마색으로 발광하는 크리스탈 클러스터 + 바닥 발광 링(접지 글로우) + 공중 할로
    makeCrystal(s) {
        const g = new THREE.Group();
        let tall = 0;
        for (let i = 0; i < 3; i++) {
            const h = U.rand(0.6, 1.25) * s;
            tall = Math.max(tall, h);
            const c = new THREE.Mesh(new THREE.ConeGeometry(U.rand(0.09, 0.15) * s, h, 5), this.crystalMat);
            c.position.set(U.rand(-0.2, 0.2) * s, h * 0.42, U.rand(-0.16, 0.16) * s);
            c.rotation.set(U.rand(-0.28, 0.28), U.rand(0, 3), U.rand(-0.28, 0.28));
            g.add(c);
        }
        // 공중 할로 스프라이트 — 블룸 없는 파이프라인에서 "빛이 번지는" 인상을 만드는 가짜 글로우.
        // 지면 링만으론 발광이 지면 레이어에서 끝난다는 지적 → 결정 몸통 높이에 겹침
        if (!this.crystalHaloMat) {
            this.crystalHaloMat = new THREE.SpriteMaterial({
                map: this.makeGlowTexture(), color: 0x4dd9e8, transparent: true, opacity: 0.4,
                blending: THREE.AdditiveBlending, depthWrite: false,
            });
        }
        const halo = new THREE.Sprite(this.crystalHaloMat);
        halo.position.y = tall * 0.55;
        halo.scale.setScalar(1.5 * s);
        g.add(halo);
        if (!this.crystalGlowMat) {
            this.crystalGlowMat = new THREE.MeshBasicMaterial({
                map: this.makeGlowTexture(), color: 0x26c6da, transparent: true, opacity: 0.8,
                blending: THREE.AdditiveBlending, depthWrite: false,
            });
        }
        const glow = new THREE.Mesh(this.blobGeo || (this.blobGeo = new THREE.PlaneGeometry(1, 1)), this.crystalGlowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.05;
        glow.scale.setScalar(1.7 * s); // 발광이 주변 지면까지 넓게 물들도록 (라이트 블리드 인상)
        glow.userData.sharedGeometry = true;
        g.add(glow);
        return g;
    },

    makeRoundTree(s) {
        const g = new THREE.Group();
        const fm = this.foliageMats[Math.random() * 3 | 0]; // 나무별 잎 명도 변주
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.12 * s, 0.6 * s, 7), this.trunkMat);
        trunk.position.y = 0.3 * s;
        const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 * s, 0), fm);
        crown.position.y = 0.95 * s;
        const crown2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 * s, 0), fm);
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
        // 다리 + 부츠 (고관절 피벗 — 걷기 애니메이션용, 원통형으로 부드럽게)
        this.legs = [];
        for (const dx of [-0.13, 0.13]) {
            const hip = new THREE.Group();
            hip.position.set(dx, 0.4, 0);
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.062, 0.36, 10), new THREE.MeshLambertMaterial({ color: 0x455a64 }));
            leg.position.y = -0.2;
            const knee = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 7), new THREE.MeshLambertMaterial({ color: 0x455a64 }));
            knee.position.y = -0.02;
            const boot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.24), new THREE.MeshLambertMaterial({ color: 0x37474f }));
            boot.position.set(0, -0.35, 0.04);
            hip.add(leg, knee, boot);
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
        const upperL = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.36, 10), armorMat());
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
        const upperR = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.36, 10), armorMat());
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
        this.setShadow(g);
        // 접지 블롭 섀도우 — 디렉셔널 섀도맵(1024/24유닛)이 흐릿해 캐릭터가 떠 보이던 문제 보강
        this.ensureBlobRes();
        const heroBlob = new THREE.Mesh(this.blobGeo, this.blobShadowMat);
        heroBlob.rotation.x = -Math.PI / 2;
        heroBlob.position.y = 0.025;
        heroBlob.scale.setScalar(0.82); // 컨택트 AO — 실그림자와 이중 노출 방지 위해 발밑 접지부만
        heroBlob.userData.sharedGeometry = true;
        g.add(heroBlob);
        this.heroG = g;
        this.scene.add(g);

        // 머리 위 HP 바 — 적(makeEnemyMesh)과 같은 패턴(어두운 배경+색 전경 평면 2장)이지만,
        // 영웅은 공격/걷기 중 heroG.rotation.y가 계속 바뀌므로 그 자식으로 넣지 않고 씬에 독립적으로
        // 두어 매 프레임 위치만 추적(update()) — 회전은 항상 0으로 고정돼 카메라를 그대로 향함.
        this.heroHpG = new THREE.Group();
        const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: 0x263238, side: THREE.DoubleSide }));
        const hpFg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: 0x69f0ae, side: THREE.DoubleSide }));
        hpFg.position.z = 0.01;
        this.heroHpG.add(hpBg, hpFg);
        this.heroHpBg = hpBg;
        this.heroHpFg = hpFg;
        this._heroBar = { hpBg, hpFg }; // 적 HP바와 같은 헬퍼(updateHpBar/punchHpBar)를 쓰기 위한 래퍼
        this.heroHpG.position.set(g.position.x, 1.85, g.position.z);
        this.scene.add(this.heroHpG);
    },

    // 무기 타입 10종 각각 다른 모델 (색/발광은 시대 티어, 보석은 등급 반영)
    makeWeapon(wtypeId, ageIdx, rarity) {
        const g = new THREE.Group();
        const c = AGE_COLORS[AGES[ageIdx]];
        const glow = ageIdx >= 4;
        const mat = new THREE.MeshStandardMaterial({ color: c, metalness: 0.65, roughness: 0.45, emissive: glow ? c : 0x000000, emissiveIntensity: glow ? 0.5 : 0 });
        // 날 전용 금속: 스틸 베이스에 시대색 18%만 — 시대색 직치환 날은 '노란 막대사탕'으로 읽힘 (비평가 2번)
        // PBR 분리: 날은 고금속·저러프 — scene.environment 반사로 '강철'이 읽히는 핵심
        const bladeMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0xc9d2da).lerp(new THREE.Color(c), 0.18),
            metalness: 0.92, roughness: 0.28, envMapIntensity: 0.85,
            emissive: glow ? c : 0x000000, emissiveIntensity: glow ? 0.16 : 0
        });
        const wood = new THREE.MeshStandardMaterial({ color: 0x1f1109, metalness: 0, roughness: 0.85, map: ProChar.leatherTex() }); // 0x5d4037 민짜는 강광에서 베이지 원통 = 맨살 오독 (비평가 7.4 4번) — 가죽 감김 그레인
        const dark = new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.7, roughness: 0.5 });
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
        // 날 엣지 발광 스트립 — 베는 날이 빛을 받아 번들거리는 라인 (무기 존재감, 비평가 지적)
        const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).offsetHSL(0, -0.1, 0.32) });
        const edge = (w, h, d, x, y, z, rz) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMat);
            mesh.position.set(x, y, z || 0);
            if (rz) mesh.rotation.z = rz;
            g.add(mesh); return mesh;
        };
        switch (wtypeId) {
            case 'sword': {
                // 테이퍼 날(끝으로 얇고 좁게) + 풀러 홈 + 포인트 + 크로스가드 + 그립 + 폼멜
                const blade = box(0.1, 0.62, 0.036, bladeMat, 0, 0.38);
                { const p = blade.geometry.attributes.position;
                  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) { p.setX(i, p.getX(i) * 0.55); p.setZ(i, p.getZ(i) * 0.6); } // 위쪽 정점 수렴 = 테이퍼
                  blade.geometry.computeVertexNormals(); }
                { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.043, 0.14, 4), bladeMat); tip.position.y = 0.75; tip.rotation.y = Math.PI / 4; tip.scale.z = 0.42; g.add(tip); }
                box(0.018, 0.56, 0.04, dark, 0, 0.36);     // 풀러(혈조) 다크 라인
                edge(0.014, 0.58, 0.04, 0.047, 0.36);      // 앞날 하이라이트
                cyl(0.045, 0.032, 0.05, mat, 0, 0.085);    // 가드 위 리카소 링
                box(0.26, 0.045, 0.06, dark, 0, 0.08);     // 크로스가드
                { const q1 = new THREE.Mesh(new THREE.SphereGeometry(0.028, 7, 6), dark); q1.position.set(0.13, 0.08, 0); g.add(q1);
                  const q2 = q1.clone(); q2.position.x = -0.13; g.add(q2); }
                cyl(0.03, 0.034, 0.16, wood, 0, -0.03);    // 그립
                { const pom = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 7), dark); pom.position.y = -0.13; g.add(pom); }
                break;
            }
            case 'axe':
                cyl(0.035, 0.045, 0.85, wood, 0, 0.3);
                box(0.3, 0.22, 0.05, mat, 0.15, 0.62);
                edge(0.016, 0.24, 0.054, 0.297, 0.62);   // 도끼날 엣지
                break;
            case 'spear':
                cyl(0.03, 0.035, 1.05, wood, 0, 0.4);
                { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 8), mat); tip.position.y = 1.03; g.add(tip); }
                { const tipHl = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.1, 6), edgeMat); tipHl.position.y = 1.14; g.add(tipHl); }
                break;
            case 'hammer':
                cyl(0.04, 0.05, 0.72, wood, 0, 0.28);
                box(0.3, 0.2, 0.2, mat, 0, 0.66);
                break;
            case 'dagger':
                box(0.07, 0.4, 0.03, mat, 0, 0.24);
                edge(0.014, 0.36, 0.034, 0.037, 0.235);  // 단검 날 하이라이트
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
            case 'staff': {
                // 테이퍼 샤프트 + 그립 밴드 + 다면체 크리스탈 헤드 + 감싸는 링 ('막대사탕' 오독 제거, 비평가 지적)
                cyl(0.026, 0.04, 0.95, wood, 0, 0.35);
                cyl(0.042, 0.042, 0.05, dark, 0, 0.06);   // 그립 밴드 (손 위치 표시)
                cyl(0.042, 0.042, 0.05, dark, 0, -0.08);
                const crys = new THREE.Mesh(new THREE.OctahedronGeometry(0.1),
                    new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.8 }));
                crys.position.y = 0.92; crys.scale.y = 1.5;
                g.add(crys); this._staffOrb = crys;
                const holdRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 6, 14), mat);
                holdRing.position.y = 0.92;
                const holdRing2 = holdRing.clone(); holdRing2.rotation.y = Math.PI / 2;
                g.add(holdRing, holdRing2);
                const collar = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), dark); // 헤드 받침 소켓
                collar.position.y = 0.8;
                g.add(collar);
                break;
            }
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
        } else if (ageIdx >= 7) { // 멀티버스 이후: 에너지 링 — 무기 실높이에 맞춰 자루에 감김 (짧은 무기에서 허공 부유 금지, 비평가 지적)
            const wTop = new THREE.Box3().setFromObject(g).max.y;
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 14),
                new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 1 }));
            ring.position.y = Math.min(0.72, wTop * 0.62);
            g.add(ring);
            mat.emissiveIntensity = 0.7;
        }
        // 등급 연출: 높을수록 화려하게
        const rIdx = RARITIES.indexOf(rarity);
        if (rIdx >= 1) { // 희귀+: 등급색 젬 — 파지점(y≈0) 위 리카소에 거치, 주먹과 겹쳐 '손에 붙은 발광구'로 읽히던 위치 상향 (비평가: 근접샷 주먹 가림)
            const gem = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6),
                new THREE.MeshLambertMaterial({ color: RARITY_HEX[rarity], emissive: RARITY_HEX[rarity], emissiveIntensity: 0.9 }));
            gem.position.set(0, 0.105, 0.045);
            g.add(gem);
        }
        if (rIdx >= 2) { // 영웅+: 등급색 트림 링 — 젬 상향에 맞춰 간격 유지
            const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10),
                new THREE.MeshLambertMaterial({ color: RARITY_HEX[rarity], emissive: RARITY_HEX[rarity], emissiveIntensity: 0.7 }));
            trim.position.y = 0.19;
            g.add(trim);
        }
        if (rIdx >= 3) { // 전설+: 떠다니는 오브 — 무기 길이에 비례한 높이 (단검·투척에서 머리 옆 부유 금지)
            const orbCount = rIdx - 2; // 전설1, 궁극2, 신화3
            const orbBase = Math.min(0.45, new THREE.Box3().setFromObject(g).max.y * 0.5);
            for (let i = 0; i < orbCount; i++) {
                const orb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 6),
                    new THREE.MeshLambertMaterial({ color: RARITY_HEX[rarity], emissive: RARITY_HEX[rarity], emissiveIntensity: 1 }));
                orb.position.set(Math.cos(i * 2.1) * 0.16, orbBase + i * 0.14, Math.sin(i * 2.1) * 0.12);
                g.add(orb);
            }
        }
        // 시대·등급 성장 스케일 — 기존 0.05/0.05는 후기 시대에서 무기가 캐릭터 신장을 넘겨 개그가 됨 (비평가 지적)
        g.scale.setScalar((1 + ageIdx * 0.02) * (1 + Math.max(0, rIdx - 2) * 0.03));
        // 장병기 그립 보정: 원점(손)이 자루 하단이 아니라 실제 파지 지점에 오도록 전체를 내림
        const gripDrop = { staff: 0.3, spear: 0.38 }[wtypeId];
        if (gripDrop) for (const ch of g.children) ch.position.y -= gripDrop;
        return g;
    },

    // 무기별 파지: weaponG 로컬 회전(손이 자루를 감싸는 각) + 다관절 거치 자세(본별 rx 가산) + 활계는 왼손 파지 (사용자 지시: 무기 쥔 모양 차별화)
    WEAPON_GRIP: {
        sword:    { rot: [0.22, 0, -0.3], pose: { elbowR: -0.3 } },                       // 날을 어깨 바깥·전방으로 기울여 견갑 관통 해소 (비평가 7.1 11번 '꽂힘도 쥠도 아님')
        dagger:   { rot: [0.22, 0, -0.1], pos: [0, -0.04, 0], pose: { elbowR: -0.5 } },    // 팔꿈치 굽혀 세워 들기, 자루를 주먹 속으로
        axe:      { rot: [0.95, 0, -0.15], pose: { elbowR: -0.85 } },                      // 어깨 걸침 레디 캐리 — 자루 뒤로 기울여 헤드가 어깨 뒤·위 (수평 돌출 금지)
        hammer:   { rot: [0.95, 0, -0.15], pose: { elbowR: -0.85 } },                      // 어깨 걸침 레디 캐리 — 자루 뒤로 기울여 헤드가 어깨 뒤·위 (수평 돌출 금지)
        club:     { rot: [0.14, 0, -0.08], pose: { elbowR: -0.3 } },
        spear:    { rot: [0.65, 0, 0], pose: { elbowR: -0.3 } },                           // 수직으로 세워 들기 (기수 자세) — restX·팔꿈치 전방 기울기 상쇄
        staff:    { rot: [0.58, 0, 0], pose: { elbowR: -0.28 } },                          // 지면 짚듯 세워 들기 — restX·팔꿈치 전방 기울기 상쇄
        bow:      { hand: 'L', scale: 0.6, rot: [0.95, 0, 0], pose: { shoulderL: -1.15, elbowL: -0.12, shoulderR: -0.95, elbowR: -1.05 } }, // 왼손 파지(팔 상승분 상쇄해 림이 수직) + 오른손 시위 대기. 몸을 감싸던 과대 스케일 축소
        crossbow: { hand: 'L', scale: 0.6, rot: [2.9, 0, 0], pose: { shoulderL: -0.85, elbowL: -0.12, shoulderR: -0.7, elbowR: -1.0 } }, // 가슴 높이 수평 전방 (얼굴 가림 금지 — 사용자 재검수), 회전은 팔 하강분만큼 가산 상쇄
        gun:      { rot: [0, 0, 0], pose: { shoulderR: -0.35, elbowR: 0.2 } },             // 팔을 수평까지 펴서 총구 전방 겨눔 (restX 가산 + Idle 팔꿈치 굽힘 상쇄)
        thrown:   { rot: [1.95, 0, 0], pose: { shoulderR: -1.45, elbowR: -0.5 } },         // 귀 옆 코킹 — 팔 상승분을 상쇄해 헤드가 위·뒤, 던질 준비
    },
    // C자 랩 주먹 — 자루를 감는 손가락 마디 링 3개 + 엄지 + 너클 볼록 (사용자 재검수: 무기가 손바닥에 '붙은' 게 아니라 '쥐어진' 실루엣)
    // weaponG의 자식으로 원점(파지점)에 두므로 Idle/걷기/공격 전 상태에서 자루-주먹 정렬이 자동 유지된다.
    makeGripWrap(shaftR, invScale) {
        const g = new THREE.Group();
        const skin = new THREE.MeshStandardMaterial({ color: 0x2e1a0c, metalness: 0, roughness: 0.8, map: ProChar.leatherTex() }); // 히어로 주먹(palmMat)과 동일 가죽 PBR — 0x7a5c46은 강광에서 베이지로 떠 맨손 오독 (비평가 7.4 4번)
        for (let i = 0; i < 3; i++) {
            const seg = new THREE.Mesh(new THREE.TorusGeometry(shaftR + 0.018, 0.021, 7, 14, Math.PI * 1.8), skin);
            seg.rotation.x = Math.PI / 2;    // 링 평면이 자루(로컬 y축)와 직교 — 손가락이 자루를 감는 방향
            seg.rotation.z = -0.4;           // C자 열림부를 엄지 쪽으로
            seg.position.y = 0.036 - i * 0.036;
            g.add(seg);
        }
        const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 7, 6), skin);
        thumb.scale.set(1, 1.6, 1); thumb.position.set(shaftR + 0.012, 0.048, 0.018); thumb.rotation.z = 0.5;
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), skin);
        knuckle.scale.set(1.2, 1.05, 0.95); knuckle.position.set(-(shaftR + 0.004), 0, 0);
        g.add(thumb, knuckle);
        g.scale.setScalar(invScale); // weaponG 스케일 상쇄 — 활계 0.6 축소에도 주먹 크기 일정
        return g;
    },
    applyWeaponGrip() {
        const grip = this.WEAPON_GRIP[this.wtypeId] || this.WEAPON_GRIP.sword;
        if (this.heroRig) {
            const target = grip.hand === 'L' ? this.heroRig.handL : this.heroRig.handR;
            if (this.weaponG.parent !== target) target.add(this.weaponG); // 활계 왼손 이관 (bow 클립도 왼팔을 드는 구성)
            this.heroRig.restPose = grip.pose || null;
            if (grip.hand === 'L') this.heroRig.restX = 0; // 조준 자세는 restPose가 양팔을 정의 — 오른어깨 이중 가산 방지
            if (this.heroRig.shield) this.heroRig.shield.visible = grip.hand !== 'L'; // 활·석궁은 왼손 파지 — 같은 팔의 방패와 겹침 방지
        }
        const gp = grip.pos || [0, 0, 0];
        this.weaponG.position.set(gp[0], gp[1], gp[2]);
        this.weaponG.rotation.set(grip.rot[0], grip.rot[1], grip.rot[2]);
        const sc = 1.22 * (grip.scale || 1);
        this.weaponG.scale.setScalar(sc); // 기본 존재감 스케일 × 무기별 보정 (활계 과대 축소)
        if (this.heroRig) this.weaponG.add(this.makeGripWrap(grip.shaftR || 0.033, 1 / sc)); // 파지점 C자 랩 주먹 (refreshHeroEquip의 clearGroup이 수명 관리)
        this._gripRot = grip.rot;
        this._gripPos = gp;
    },

    refreshHeroEquip(withFlash) {
        if (!this.heroG) return;
        // 무기 (타입별 모델 + 모션 + 등급 젬 + 거치 자세)
        this.clearGroup(this.weaponG);
        const w = S.equipment.weapon;
        this.wtypeId = w ? (w.wtype || 'sword') : 'club';
        this.weaponG.add(this.makeWeapon(this.wtypeId, w ? w.ageIdx : 0, w && w.rarity));
        // (구형 파지 랩 토러스 제거 — applyWeaponGrip의 makeGripWrap C자 랩과 중복이었고,
        //  무텍스처 베이지 램버트 도넛이 근접샷에서 '맨손 스텁'으로 오독됨, 비평가 7.4 4번)
        const wtDef = WEAPON_TYPES[this.wtypeId];
        this.armRest = wtDef ? wtDef.restX : -0.25;
        this.armR.rotation.x = this.armRest;
        // 프로시저럴 리그: 거치 자세를 리그 오른어깨 기본각으로 전달 (레거시 -0.25=내림 → 리그 0=내림 보정)
        if (this.heroRig) this.heroRig.restX = this.armRest + 0.25;
        this.applyWeaponGrip(); // 무기별 파지 자세 (손 선택·자루 감쌈 각·다관절 거치 — 활계는 restX를 0으로 덮음)
        // 투구: 이름별 스타일 모델
        this.clearGroup(this.helmetG);
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
        // 프로시저럴 리그 모드에선 레거시 파츠를 다시 켜지 않는다 (setupHeroProc이 전부 숨겼음)
        if (!this.heroRig) {
            this.shoulderPads.forEach(p => p.visible = style === 'plate');
            this.chestPlate.visible = style !== 'hide' && style !== 'robe';
            this.clearGroup(this.armorExtraG);
            this.armorExtraG.add(this.makeArmorExtras(style, c, ec));
        }
        this.tintHero(); // 리그 파츠별 색 오버레이 동기화
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
        // 시대색 직치환은 '고무 풍선'으로 읽힘(비평가) — 스틸 톤에 섞은 뒤 PBR 금속 분리 (갑옷 tint와 동일 원칙)
        const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(c).lerp(new THREE.Color(0xb8c4cf), 0.32).offsetHSL(0, -0.06, -0.02),
            metalness: 0.85, roughness: 0.38, envMapIntensity: 0.75 // 환경 반사 — '무광 비닐' 오독 해소 (비평가 3번)
        });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x263238, metalness: 0.6, roughness: 0.55 });
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
        } else if (style === 'visor') {     // 풀헬름 — 돔+뺨가드+눈 슬릿, 슬릿 안 발광 눈 2점 (어둠 속 시선)
            const helm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.78), mat);
            helm.position.y = 0.04;
            helm.scale.set(0.97, 1.02, 1);
            // 슬릿 = 돔 곡률을 따라 감싸는 함몰 밴드 — 박스 돌출식은 정면 '선글라스 스티커'·측면 '번진 글자' 오독 (비평가 7.1 2번)
            const cavity = new THREE.MeshBasicMaterial({ color: 0x0c0f12 });
            const slitArc = Math.PI * 0.62; // 전면 ±56° — 측면에선 자연스럽게 원근 수축
            const slit = new THREE.Mesh(new THREE.CylinderGeometry(0.2855, 0.2855, 0.048, 18, 1, true, -slitArc / 2, slitArc), cavity);
            slit.position.set(0, 0.06, 0);
            for (const [sy, off] of [[0.088, 0.5], [0.032, -0.5]]) { // 상하 금속 림 — 개구부 프레임이 빛을 받아 '뚫린 구멍'으로 판독
                const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2865, 0.011, 5, 18, slitArc),
                    new THREE.MeshStandardMaterial({ color: mat.color.clone().offsetHSL(0, 0, -0.1), metalness: 0.85, roughness: 0.35 }));
                rim.rotation.x = Math.PI / 2;
                rim.rotation.z = Math.PI / 2 - slitArc / 2; // 토러스 아크 중심을 +z로
                rim.position.y = sy;
                g.add(rim);
            }
            for (const dx of [-0.055, 0.055]) { // 캐비티 속 언릿 발광 눈 — 어둠 대비 최대
                const glowEye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 6, 5),
                    new THREE.MeshBasicMaterial({ color: new THREE.Color(pc).offsetHSL(0, 0.18, 0.24) }));
                const ex = dx * 1.2, ez = Math.sqrt(0.2855 * 0.2855 - ex * ex) + 0.004; // 밴드 원통면 위 — 평면 배치는 측면에서 밴드 밖 부유
                glowEye.position.set(ex, 0.06, ez);
                glowEye.rotation.y = Math.atan2(ex, ez); // 면 법선 방향
                glowEye.scale.set(1.1, 0.55, 0.4);
                g.add(glowEye);
            }
            const noseBar = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.15, 0.045),
                new THREE.MeshStandardMaterial({ color: mat.color.clone().offsetHSL(0, 0, -0.14), metalness: 0.8, roughness: 0.45 })); // 코 가드 — 슬림+다크 (밝은 굵은 바가 '반투명 띠 아티팩트'로 오독, 비평가 7번)
            noseBar.position.set(0, -0.02, 0.262);
            const crest = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.03, 6, 14, Math.PI * 0.8), rareMat); // 정수리 볏 아크
            crest.position.y = 0.13;
            crest.rotation.y = Math.PI / 2;
            crest.rotation.z = Math.PI * 0.1;
            g.add(helm, slit, noseBar, crest);
        } else if (style === 'fin') {       // 볏 투구 (로마/사무라이)
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), mat);
            dome.position.y = 0.02;
            const crest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.36), rareMat);
            crest.position.y = 0.32;
            const cheek1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.12), mat);
            cheek1.position.set(-0.24, -0.08, 0.1);
            const cheek2 = cheek1.clone(); cheek2.position.x = 0.24;
            g.add(dome, crest, cheek1, cheek2);
        } else if (style === 'mask') {      // 가면/방독면: 얼굴을 감싸는 곡면 판 (평판 박스 → 원통 셸)
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.32, 14, 1, true, -Math.PI * 0.42, Math.PI * 0.84), mat);
            plate.material = new THREE.MeshStandardMaterial({ color: mat.color.clone(), metalness: 0.85, roughness: 0.4, side: THREE.DoubleSide }); // 원색 직치환 금지 — 스틸 혼합 톤 공유
            plate.position.set(0, 0.02, 0.02);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat); // 정수리 덮개
            dome.position.y = 0.1;
            g.add(dome);
            for (const dx of [-0.09, 0.09]) { // 눈 소켓: 함몰 어둠 + 림 + 발광 동공 — 민짜 회색 점 2개 오독 (비평가 3번)
                const hole = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0x14181c }));
                hole.position.set(dx, 0.04, 0.252); hole.scale.z = 0.5;
                const socketRim = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.009, 5, 12),
                    new THREE.MeshStandardMaterial({ color: mat.color.clone().offsetHSL(0, 0, -0.14), metalness: 0.8, roughness: 0.45 }));
                socketRim.position.set(dx, 0.04, 0.273);
                const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 5),
                    new THREE.MeshBasicMaterial({ color: new THREE.Color(pc).offsetHSL(0, 0.15, 0.2) }));
                pupil.position.set(dx, 0.04, 0.278);
                g.add(hole, socketRim, pupil);
            }
            // 호흡 필터 — 발광 원통(rareMat)은 '턱 밑에서 새는 흰 광원'으로 오독 (비평가 7.1 12번) → 다크 금속 벤트+가는 등급색 림만
            const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 10), darkMat);
            mouth.rotation.x = Math.PI / 2;
            mouth.position.set(0, -0.1, 0.265);
            const ventRim = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 5, 12), rareMat);
            ventRim.position.set(0, -0.1, 0.292);
            g.add(ventRim);
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
        } else if (style === 'tech') {      // 메카 헬름 — 곡면 셸 + 랩어라운드 발광 바이저 (박스 금지, 비평가 1위 결함 재작업)
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 8), mat);
            shell.material = new THREE.MeshStandardMaterial({ color: new THREE.Color(c).lerp(new THREE.Color(0xb8c4cf), 0.28), metalness: 0.85, roughness: 0.42 }); // 스틸 혼합 — 원색 풍선 방지
            // flatShading 패싯 제거 — visor/mask는 스무스인데 tech만 패싯이라 '다른 파이프라인' 비일관 (비평가 6.9 9번)
            shell.position.y = 0.06;
            shell.scale.set(0.98, 0.92, 1.05);
            const jawGuard = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3), darkMat);
            jawGuard.position.y = 0.07;
            jawGuard.scale.set(0.96, 1.05, 1.02);
            // 바이저: 앞면을 감싸는 토러스 아크 (발광) — 얼굴은 리그에서 숨겨지고 이 슬릿이 눈을 대신함
            // 지오메트리 공간에서 회전: 아크 중점을 +y로 돌린 뒤 XZ 수평면으로 눕히면 중점이 정면(+z)에 온다
            const vGeo = new THREE.TorusGeometry(0.25, 0.04, 8, 22, Math.PI * 0.86);
            vGeo.rotateZ(Math.PI * 0.07);
            vGeo.rotateX(Math.PI / 2);
            // 밝은 단색 아크는 눈을 가리는 '안대/눈가리개'로 오독(비평가 6.4 5번) — 다크 스모크 유리 밴드 + 안쪽 발광 눈 2점으로 재작업
            // 고금속·저러프는 밝은 하늘 env를 통반사해 도로 '밝은 밴드'가 됨(비평가 6.8 3번) — 저금속 무광에 가까운 흑유리로
            const visorArc = new THREE.Mesh(vGeo, new THREE.MeshStandardMaterial({
                color: 0x090d13, metalness: 0.3, roughness: 0.32, envMapIntensity: 0.45
            }));
            visorArc.position.set(0, 0.01, 0.035);             // 눈높이로 하강 — 이마 밴드 오독 방지
            visorArc.scale.y = 0.6;                            // 납작한 슬릿 단면
            for (const dx of [-0.095, 0.095]) {                // 유리면 위 발광 눈 — 등급색 파생은 창백하게 씻김(비평가 6.9) → 고정 시안 렌즈
                const eyeC = new THREE.Color(0x35e0ff);
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: eyeC }));
                eye.position.set(dx, 0.01, 0.3);
                eye.scale.set(1.3, 0.72, 0.4);                 // 가로로 긴 렌즈 눈
                const glow = new THREE.Mesh(new THREE.SphereGeometry(0.068, 8, 6),
                    new THREE.MeshBasicMaterial({ color: eyeC, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
                glow.position.copy(eye.position);
                glow.scale.set(1.35, 0.8, 0.45);
                g.add(eye, glow);
            }
            // 이어 포드 + 정수리 능선
            for (const dx of [-0.27, 0.27]) {
                const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10), darkMat);
                pod.rotation.z = Math.PI / 2;
                pod.position.set(dx, 0.07, 0);
                const podDot = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), rareMat);
                podDot.position.set(dx * 1.1, 0.07, 0);
                g.add(pod, podDot);
            }
            const rGeo = new THREE.TorusGeometry(0.275, 0.03, 6, 16, Math.PI * 0.85); // 정수리 능선 — 전후 방향 아크 (셸 밖으로 살짝 돌출)
            rGeo.rotateZ(Math.PI * 0.075);
            rGeo.rotateY(Math.PI / 2);
            const ridge = new THREE.Mesh(rGeo, darkMat);
            ridge.position.y = 0.075;
            const antSock = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.046, 0.07, 8), darkMat); // 안테나 소켓 — 셸을 그냥 뚫고 나오던 클리핑(비평가) 마감
            antSock.position.set(0.195, 0.285, -0.06);
            antSock.rotation.z = -0.18;
            const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), darkMat);
            ant.position.set(0.213, 0.4, -0.06);
            ant.rotation.z = -0.18;
            const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6), rareMat);
            antTip.position.set(0.232, 0.5, -0.06);
            g.add(shell, jawGuard, visorArc, ridge, antSock, ant, antTip);
        } else if (style === 'bubble') {    // 우주 헬멧 (투명 돔)
            const bub = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 10),
                new THREE.MeshStandardMaterial({ color: c, metalness: 0, roughness: 0.08, transparent: true, opacity: 0.32 })); // 유리 돔 — 매끈한 반사
            const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 18), mat);
            rim.rotation.x = Math.PI / 2;
            rim.position.y = -0.16;
            g.add(bub, rim);
        }
        g.scale.setScalar(0.85); // 두상 밀착 피팅 — 헬멧이 머리보다 한 치수 커서 '풍선'으로 읽히던 문제 (비평가 3번 결함)
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

    // 장신구 프리뷰 3D 모델 (부위당 3종 변형)
    makeAccessoryPreview(slot, variant, age, rarity) {
        const g = new THREE.Group();
        const c = AGE_COLORS[age];
        const rc = RARITY_HEX[rarity] || 0xffd54f;
        const mat = new THREE.MeshLambertMaterial({ color: c });
        const gemMat = new THREE.MeshLambertMaterial({ color: rc, emissive: rc, emissiveIntensity: 0.7 });
        const dark = new THREE.MeshLambertMaterial({ color: 0x3e2723 });
        const add = (mesh, x, y, z) => { mesh.position.set(x || 0, y || 0, z || 0); g.add(mesh); return mesh; };
        if (slot === 'gloves') {
            if (variant === 0) { // 장갑: 손바닥 + 엄지
                add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.14), mat), 0, 0.4);
                add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.13), mat), -0.22, 0.32);
            } else if (variant === 1) { // 건틀릿: 판금 + 커프
                add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.16), mat), 0, 0.45);
                add(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.18, 10), mat), 0, 0.18);
                add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), gemMat), 0, 0.5, 0.1);
            } else { // 핸드랩: 붕대 감기
                add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat), 0, 0.42).scale.set(0.85, 1.1, 0.7);
                for (let i = 0; i < 3; i++) add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.16), dark), 0, 0.28 + i * 0.14);
            }
        } else if (slot === 'necklace') {
            const chain = add(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 20), mat), 0, 0.5);
            chain.rotation.x = 0.35;
            if (variant === 0) add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), gemMat), 0, 0.26);
            else if (variant === 1) { const d = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 12), gemMat), 0, 0.26); d.rotation.x = Math.PI / 2; }
            else { const p = add(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 6), gemMat), 0, 0.24); p.rotation.x = Math.PI; }
        } else if (slot === 'ring') {
            const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 10, 22), mat), 0, 0.42);
            if (variant === 0) add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), gemMat), 0, 0.66);
            else if (variant === 1) add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), gemMat), 0, 0.65);
            else { // 보석 반지: 세공 보석
                const gem = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), gemMat), 0, 0.68);
                gem.rotation.z = 0.4;
            }
        } else if (slot === 'shoes') {
            const mk = (dx) => {
                add(new THREE.Mesh(new THREE.BoxGeometry(0.14, variant === 2 ? 0.4 : variant === 1 ? 0.3 : 0.18, 0.16), mat), dx, variant === 2 ? 0.42 : 0.32);
                add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.3), variant === 0 ? mat : dark), dx, 0.18, 0.06);
            };
            mk(-0.13); mk(0.13);
            if (variant === 2) add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), gemMat), 0.13, 0.55, 0.08);
        } else { // belt
            add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.12, 14), mat), 0, 0.4);
            if (variant === 0) add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.05), gemMat), 0, 0.4, 0.25);
            else if (variant === 1) { const b = add(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 14), gemMat), 0, 0.4, 0.26); b.rotation.y = 0; }
            else { add(new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), gemMat), 0, 0.4, 0.27); }
        }
        return g;
    },

    // ---- 장비 썸네일: 미니 렌더러로 실제 3D 모델을 찍어 이미지 생성 (캐시) ----
    _thumbCache: {},
    itemThumb(item) {
        if (!item) return null;
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
                // 썸네일 렌더러는 별도 GL 컨텍스트 — 메인 씬의 PMREM 텍스처 공유 불가.
                // 자체 PMREM 환경 필수: 없으면 고금속 PBR 재질(무기 날 등)이 반사할 게 없어 검게 찍힘.
                try {
                    const pm = new THREE.PMREMGenerator(this._thumbR);
                    this._thumbScene.environment = pm.fromCubemap(ProChar.envMap()).texture;
                    pm.dispose();
                } catch (e) { /* 폴백: 라이트만 */ }
            }
            const sc = this._thumbScene;
            this.clearGroup(sc);
            sc.add(this._thumbAmb, this._thumbDir);
            let model;
            if (item.slot === 'weapon') {
                model = this.makeWeapon(item.wtype || 'sword', item.ageIdx, item.rarity);
                model.position.y = -0.15;
            } else if (item.slot === 'helmet') {
                model = this.makeHelmet(item.age, item.rarity, itemStyleOf(item));
                model.scale.setScalar(1.5);
                model.position.y = 0.1;
            } else if (item.slot === 'armor') {
                model = this.makeArmorPreview(item.age, item.rarity, itemStyleOf(item));
                model.scale.setScalar(1.3);
                model.position.y = 0.35;
            } else {
                // 장신구류: 부위당 3종 변형 프리뷰
                model = this.makeAccessoryPreview(item.slot, Math.max(0, item.nameIdx || 0) % 3, item.age, item.rarity);
                model.scale.setScalar(1.4);
                model.position.y = 0.1;
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
                if (ghost) g.userData.ghostMat = bmat;
                sp(0.12, 0, 0.12, -0.02, bmat, 1, 0.95, 1.3);
                sp(0.11, 0, 0.28, 0.1, bmat);
                for (const s of [-1, 1]) cn(0.04, 0.08, s * 0.07, 0.4, 0.08, bmat);
                const tail = cy(0.018, 0.012, 0.2, 0, 0.2, -0.2, bmat); tail.rotation.x = -0.9;
                g.userData.tail = tail;
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
                g.userData.tail = tail;
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
                g.userData.sting = sting;
                g.userData.claws = [];
                for (const s of [-1, 1]) {
                    sp(0.055, s * 0.13, 0.07, 0.15, dark);
                    g.userData.claws.push(sp(0.04, s * 0.16, 0.07, 0.22, dark, 1, 0.7, 1.2));
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
                g.userData.wings = [];
                for (const s of [-1, 1]) {
                    const wing = sp(0.11, s * 0.14, 0.26, -0.06, light, 0.25, 1, 0.8);
                    wing.rotation.z = s * 0.5;
                    wing.userData.s = s;
                    g.userData.wings.push(wing);
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
                g.userData.heads = [];
                for (const dx of [-0.13, 0, 0.13]) {
                    g.userData.heads.push(sp(0.08, dx, 0.32, 0.08 + (dx === 0 ? 0.04 : 0)));
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
                g.userData.tails = [];
                for (const dx of [-0.09, 0, 0.09]) {
                    const tail = cn(0.045, 0.2, dx, 0.24, -0.18, light);
                    tail.rotation.x = -0.9 - Math.abs(dx);
                    g.userData.tails.push(tail);
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
                g.userData.wings = [];
                for (const s of [-1, 1]) {
                    const wing = sp(0.1, s * 0.15, 0.24, -0.05, dark, 0.2, 1, 0.7);
                    wing.rotation.z = s * 0.6;
                    wing.userData.s = s;
                    g.userData.wings.push(wing);
                }
                const tail = cn(0.035, 0.16, 0, 0.12, -0.2, mat); tail.rotation.x = -2.1;
                g.userData.tail = tail;
                eyes(0.35, 0.17);
                break;
            }
            default:
                sp(0.14, 0, 0.15, 0);
                eyes(0.2, 0.12);
        }
        return g;
    },

    // 탈것(마운트) 몸체 — 15종 개별 모델 대신 원본 이름을 형태 계열 4종(평판/사족보행/탈것/비행)으로
    // 근사하고 등급색(RARITY_HEX)으로 구분한다(사용자 지시: "개별 모델 어려우면 등급별 대표 형태로 근사").
    makeMountMesh(name, rarity) {
        const g = new THREE.Group();
        const c = RARITY_HEX[rarity] || 0xbdbdbd;
        const M = (col, opt) => new THREE.MeshLambertMaterial(Object.assign({ color: col }, opt || {}));
        const mat = M(c);
        const dark = M(new THREE.Color(c).offsetHSL(0, 0, -0.18));
        const light = M(new THREE.Color(c).offsetHSL(0, 0, 0.18));
        const blk = new THREE.MeshBasicMaterial({ color: 0x263238 });
        const sp = (r, x, y, z, m, sx, sy, sz) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m || mat); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy, sz); g.add(o); return o; };
        const bx = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const cn = (r, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const cy = (r1, r2, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 12), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const to = (r, tr, x, y, z, m) => { const o = new THREE.Mesh(new THREE.TorusGeometry(r, tr, 8, 14), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const eyes = (y, z, gap) => { for (const s of [-1, 1]) sp(0.026, s * (gap || 0.07), y, z, blk); };

        const FLAT = ['Brown Leaf', 'Lily Leaf', 'Lily Pad', 'Hover Board', 'Hover Disk'];
        const FLY = ['Giant Bee', 'Mini Dragon'];
        const WHEELED = ['Bike', 'One-Wheel Droid'];

        if (FLAT.includes(name)) { // 평판형: 나뭇잎/연잎/호버보드/호버디스크 — 넓적한 발판 + 탑승 발판 위 살짝 솟은 손잡이
            const hover = name.startsWith('Hover');
            sp(0.34, 0, 0.05, 0, hover ? dark : mat, 1.7, 0.32, 1.9);
            if (hover) to(0.3, 0.03, 0, 0.01, 0, M(0x29e0ff, { emissive: 0x0aa0c0, emissiveIntensity: 0.6 }));
            else sp(0.3, 0, 0.09, 0, light, 1.5, 0.2, 1.6);
            g.userData.deck = g.children[0];
        } else if (WHEELED.includes(name)) { // 탈것형: 자전거/외바퀴 드로이드 — 바퀴 + 프레임
            if (name === 'Bike') {
                for (const s of [-1, 1]) { const w = to(0.16, 0.03, s * 0.28, 0.16, 0, dark); w.rotation.y = Math.PI / 2; g.userData['w' + s] = w; }
                bx(0.5, 0.04, 0.06, 0, 0.22, 0, mat);
                bx(0.05, 0.18, 0.06, -0.18, 0.28, 0, mat);
                bx(0.05, 0.18, 0.06, 0.18, 0.3, 0, mat);
            } else {
                const w = to(0.18, 0.05, 0, 0.18, 0, dark); w.rotation.x = Math.PI / 2; g.userData.wheel = w;
                sp(0.13, 0, 0.34, 0, mat, 1.1, 0.9, 1.1);
                sp(0.05, 0, 0.4, 0.09, new THREE.MeshBasicMaterial({ color: 0x29e0ff }));
            }
        } else if (FLY.includes(name)) { // 비행형: 거대 벌/미니 드래곤 — 몸통 + 날개
            const dragon = name === 'Mini Dragon';
            sp(0.16, 0, 0.22, 0, mat, dragon ? 1.3 : 1.1, 0.85, dragon ? 1.6 : 1.15);
            if (dragon) { cn(0.07, 0.22, 0, 0.24, 0.32, mat); const tail = cy(0.05, 0.01, 0.34, 0, 0.2, -0.32, mat); tail.rotation.x = -1.5; g.userData.tail = tail; }
            else for (let i = 0; i < 3; i++) bx(0.22, 0.05, 0.02, 0, 0.22, -0.12 + i * 0.12, dark);
            g.userData.wings = [];
            for (const s of [-1, 1]) {
                const wing = bx(0.24, 0.02, 0.14, s * 0.2, 0.32, -0.02, light);
                wing.userData.s = s;
                g.userData.wings.push(wing);
            }
            eyes(0.26, dragon ? 0.36 : 0.15, 0.06);
            if (!dragon) { const sting = cn(0.025, 0.12, 0, 0.2, -0.19, blk); sting.rotation.x = Math.PI; g.userData.tail = sting; }
        } else { // 사족보행형: 거북이/게/말/공룡/돼지/염소 — 공용 몸통+머리+다리 골격, 파츠로 종 구분
            sp(0.22, 0, 0.24, 0, mat, 1.3, 0.85, 1.6); // 몸통 (마운트다운 대형 사이즈)
            if (name === 'Turtle') sp(0.2, 0, 0.32, -0.02, dark, 1.1, 0.7, 1.4); // 등딱지
            if (name === 'Crab') { sp(0.24, 0, 0.2, 0, dark, 1.5, 0.55, 1.3); g.userData.claws = []; for (const s of [-1, 1]) { const cl = bx(0.1, 0.08, 0.16, s * 0.32, 0.22, 0.14, light); g.userData.claws.push(cl); } }
            if (name === 'Brown Horse' || name === 'Dino') { const neck = cy(0.08, 0.1, name === 'Dino' ? 0.5 : 0.3, 0, 0.44, 0.22, mat); neck.rotation.x = -0.5; }
            if (name === 'Goat') for (const s of [-1, 1]) { const horn = cn(0.025, 0.13, s * 0.06, 0.44, 0.34, light); horn.rotation.x = -0.6; horn.rotation.z = s * 0.3; }
            if (name === 'Pig') cn(0.05, 0.08, 0, 0.24, 0.42, light).rotation.x = Math.PI / 2;
            sp(0.14, 0, name === 'Brown Horse' || name === 'Dino' ? 0.58 : 0.32, name === 'Brown Horse' || name === 'Dino' ? 0.34 : 0.4, light); // 머리
            eyes(name === 'Brown Horse' || name === 'Dino' ? 0.6 : 0.34, name === 'Brown Horse' || name === 'Dino' ? 0.42 : 0.48);
            const tail = cy(0.03, 0.01, 0.24, 0, 0.24, -0.34, mat); tail.rotation.x = 1.3; g.userData.tail = tail;
            g.userData.legs = [];
            for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const leg = cy(0.05, 0.045, 0.24, sx * 0.16, 0.1, sz * 0.3, dark);
                g.userData.legs.push(leg);
            }
        }
        return g;
    },

    refreshPets() {
        for (const pg of this.petGroups) { this.disposeTree(pg); this.scene.remove(pg); }
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
            g.position.set(Combat.HERO_X + spots[i][0] + this.worldX, 0.45 + i * 0.18, spots[i][1]);
            g.userData.home = g.position.clone();
            g.userData.spotX = spots[i][0];
            g.userData.name = p.name;
            g.userData.phase = U.rand(0, Math.PI * 2);  // 개체별 위상차
            g.userData.speed = U.rand(0.85, 1.25);       // 개체별 속도차
            this.setShadow(g);
            this.scene.add(g);
            this.petGroups.push(g);
        });
    },

    // 탈것: 펫과 겹치지 않는 영웅 옆자리(오른쪽)에 따라다니는 연출만(사용자 지시 — 탑승 연출은 범위 밖)
    refreshMount() {
        if (this.mountGroup) { this.disposeTree(this.mountGroup); this.scene.remove(this.mountGroup); this.mountGroup = null; }
        const name = S.activeMount, m = name && S.mounts[name];
        if (!m) return;
        const g = new THREE.Group();
        const mesh = this.makeMountMesh(name, m.rarity);
        mesh.scale.setScalar(1.1 + RARITIES.indexOf(m.rarity) * 0.1);
        g.add(mesh);
        g.rotation.y = -0.5; // 영웅과 마주보지 않게 살짝 바깥쪽
        const spotX = 0.62, spotZ = 0.35; // 펫 자리(x<0)와 겹치지 않는 영웅 오른쪽
        g.position.set(Combat.HERO_X + spotX + this.worldX, 0, spotZ);
        g.userData.home = g.position.clone();
        g.userData.spotX = spotX;
        g.userData.phase = U.rand(0, Math.PI * 2);
        this.setShadow(g);
        this.scene.add(g);
        this.mountGroup = g;
    },

    // ---- 적: 몬스터 7종 (슬라임/골렘/고블린/박쥐/버섯/늑대/임프) — 종별 애니메이션 ----
    // 종별 고유 팔레트 — 지형색 파생 금지 (전 종이 배경 보호색 연두 덩어리로 보이던 문제, 비평가 지적)
    // 종별 키 컬러 — 배경 대비 채도 2단계 상향 원칙 (연두 필드 보호색 금지, 비평가 지적)
    KIND_COLOR: { slime: 0x53b8e0, golem: 0x8a8175, goblin: 0x156326, bat: 0x6f5c94, mushroom: 0xd9604a, wolf: 0x556279, imp: 0xc23a52 }, // 고블린 0x1f8038도 라이팅+ACES에 세이지로 씻겨 초원에 잠식 (비평가 7.1 10번) — 한 단계 더 어둡고 짙게
    monsterMesh(e) {
        const kinds = ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
        // 디버그: ?enemy=imp 로 특정 몬스터 강제
        const forced = new URLSearchParams(location.search).get('enemy');
        const kind = (forced && kinds.includes(forced)) ? forced : kinds[(e.id + S.chapter * 2) % kinds.length];
        // 종 고유색 + 개체 지터 (챕터 무드 혼합은 채도를 죽여 배경 보호색화 — 폐지, 비평가 지적)
        const base = new THREE.Color(this.KIND_COLOR[kind]).offsetHSL(U.rand(-0.02, 0.02), U.rand(-0.03, 0.03), U.rand(-0.02, 0.02));
        const g = new THREE.Group();
        const flashMats = [];
        const lam = (c2, map) => { const m = new THREE.MeshStandardMaterial({ color: c2, map: map || null, metalness: 0, roughness: 0.72 }); flashMats.push(m); return m; }; // 유기물 PBR — 부드러운 스펙큘러 롤오프 (무광 점토 인상 완화)
        const mat = lam(base);
        const dark = lam(base.clone().offsetHSL(0, 0, -0.13));
        const light = lam(base.clone().offsetHSL(0, 0, 0.1));
        const mk = (geo, m) => new THREE.Mesh(geo, m); // 그룹 조립용 (g에 자동 추가 안 함)
        const limb = (rTop, rBot, len, m) => ProChar.capsule(rTop, rBot, len, m, 9); // 분절 사지 — 피벗=위쪽 끝
        const sp = (r, x, y, z, m, sx, sy, sz) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 11, 9), m || mat); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy, sz); g.add(o); return o; };
        const bx = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const cn = (r, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const cy = (r1, r2, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 8), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        // 몬스터 눈: 흰자+홍채+동공+하이라이트+성난 눈썹 (빨간 점 → 캐릭터 표정)
        // 종별 파라미터 눈 — 전 종 공용 '성난 스티커' 복붙 금지 (비평가 2위 결함)
        // style: round(순둥 왕눈)/angry(성난 흰자눈)/fierce(가늘게 뜬 맹수 흰자눈)/sleepy(반쯤 감김)/slit(발광 슬릿, 흰자 없음)
        // opts: { iris: 홍채색, tilt: 눈꼬리 기울기(+=안쪽 내려감 분노, -=바깥 올라감 예리), narrow: 슬릿 더 납작, browColor }
        const eyes = (y, z, gap, r, style, opts) => {
            const o = opts || {};
            const er = (r || 0.045) * 1.5;
            for (const s of [-1, 1]) {
                const eg = new THREE.Group();
                eg.position.set(s * gap, y, z);
                eg.rotation.z = s * (o.tilt || 0);
                if (style === 'slit') {
                    // 어둠 속 이글거리는 발광 슬릿 (골렘 마그마/늑대 냉광/임프 유황) — 흰자 없음
                    const slit = new THREE.Mesh(new THREE.SphereGeometry(er * 0.72, 8, 6),
                        new THREE.MeshLambertMaterial({ color: o.iris, emissive: o.iris, emissiveIntensity: 1 }));
                    slit.scale.set(1.4, o.narrow ? 0.36 : 0.55, 0.4);
                    const rim = new THREE.Mesh(new THREE.SphereGeometry(er * 0.8, 8, 6),
                        new THREE.MeshBasicMaterial({ color: 0x14100e }));
                    rim.position.z = -er * 0.12;
                    rim.scale.set(1.5, o.narrow ? 0.5 : 0.7, 0.32);
                    eg.add(rim, slit);
                } else {
                    const tall = style === 'round' ? 1.3 : style === 'sleepy' ? 0.62 : 0.92;
                    const sc = new THREE.Mesh(new THREE.SphereGeometry(er, 9, 7), new THREE.MeshLambertMaterial({ color: 0xfff6e8 })); // 음영 받는 흰자 — 평면 스티커 오독 방지 (비평가 지적)
                    sc.scale.set(1, tall, 0.55);
                    const irisR = (style === 'round' ? er * 0.7 : er * 0.55) * (o.irisScale || 1); // irisScale<1 = 흰자 비중 확대 ('단추 눈' 방지)
                    const ir = new THREE.Mesh(new THREE.SphereGeometry(irisR, 8, 6), new THREE.MeshLambertMaterial({ color: o.iris || 0xd8352a, emissive: o.iris || 0xd8352a, emissiveIntensity: o.glow !== undefined ? o.glow : 0.45 })); // 은은한 발광 홍채 (glow로 종별 무광 조절)
                    ir.position.z = er * 0.4;
                    if (style === 'sleepy') ir.scale.y = 0.75;
                    const pu = new THREE.Mesh(new THREE.SphereGeometry(irisR * 0.48, 6, 5), new THREE.MeshBasicMaterial({ color: 0x1a1210 }));
                    pu.position.z = er * 0.58;
                    const hl = new THREE.Mesh(new THREE.SphereGeometry(er * 0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                    hl.position.set(er * 0.22, er * 0.26, er * 0.62);
                    eg.add(sc, ir, pu, hl);
                    if (style === 'sleepy') { // 위 눈꺼풀 — 살색보다 어두운 덮개
                        const lid = new THREE.Mesh(new THREE.SphereGeometry(er * 1.02, 8, 6), new THREE.MeshLambertMaterial({ color: o.lid || 0x8d6a56 }));
                        lid.position.y = er * 0.5;
                        lid.scale.set(1.05, 0.5, 0.58);
                        eg.add(lid);
                    }
                    if (style === 'angry' || style === 'fierce') { // 눈썹은 성난 계열만
                        const brow = new THREE.Mesh(new THREE.BoxGeometry(er * 1.6, er * (style === 'fierce' ? 0.26 : 0.34), er * 0.3),
                            new THREE.MeshLambertMaterial({ color: o.browColor || 0x2b2b33 }));
                        brow.position.set(0, er * (style === 'fierce' ? 0.78 : 1.0), er * 0.28);
                        brow.rotation.z = s * (style === 'fierce' ? 0.55 : 0.42); // 안쪽이 내려간 분노 각
                        eg.add(brow);
                    }
                }
                g.add(eg);
            }
        };

        // 박쥐/임프 공용 막날개 — 앞전 아치 + 손가락 골 스캘럽 뒷전 (평판 '비행기 주익' 오독 제거, 비평가 지적)
        const wingGeo = (len, chord) => {
            const sh = new THREE.Shape();
            sh.moveTo(0, 0.02);
            sh.quadraticCurveTo(len * 0.5, chord * 0.5, len, chord * 0.06);
            sh.quadraticCurveTo(len * 0.86, -chord * 0.34, len * 0.66, -chord * 0.16);
            sh.quadraticCurveTo(len * 0.5, -chord * 0.52, len * 0.32, -chord * 0.24);
            sh.quadraticCurveTo(len * 0.16, -chord * 0.46, 0, -chord * 0.3);
            sh.closePath();
            return new THREE.ShapeGeometry(sh);
        };

        const anim = { kind, wings: [], legs: [] };
        let body = null, armR = null, armL = null, topY = 1.1;

        if (kind === 'slime') {
            // 광택 젤리: 고분할 스무스 돔 + Phong 스펙큘러 + 반투명 너머 비치는 내부 핵 (저분할 '바위 덩어리' 오독 제거, 비평가 지적)
            const jelly = new THREE.MeshStandardMaterial({ color: base, transparent: true, opacity: 0.82, metalness: 0, roughness: 0.12, envMapIntensity: 1.2 }); // 젖은 젤리 — 환경 반사로 광택
            flashMats.push(jelly);
            // 물방울 라테: 바닥 퍼짐→돔이 한 곡면 — 몸통 구+스커트 토러스 2피스는 '접시 위 슬라임'으로 읽힘 (비평가 12번)
            const slProf = [[0.001, 0], [0.42, 0.012], [0.5, 0.07], [0.485, 0.18], [0.44, 0.3], [0.38, 0.42], [0.27, 0.54], [0.13, 0.62], [0.001, 0.65]];
            body = mk(new THREE.LatheGeometry(slProf.map(([r, y]) => new THREE.Vector2(r, y)), 26), jelly);
            g.add(body);
            const core = mk(new THREE.SphereGeometry(0.15, 14, 10), lam(base.clone().offsetHSL(0.02, 0.18, -0.2))); // 몸속 핵
            core.position.set(0, 0.3, -0.04);
            g.add(core);
            for (const [bx2, by2, br] of [[0.22, 0.24, 0.05], [-0.18, 0.38, 0.04]]) { // 내부 기포
                const bub = mk(new THREE.SphereGeometry(br, 8, 6), lam(base.clone().offsetHSL(0, -0.05, 0.16)));
                bub.position.set(bx2, by2, 0.1);
                g.add(bub);
            }
            const gloss = mk(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf2fcff, transparent: true, opacity: 0.38 })); // 정수리 광택 하이라이트 — 은은하게 (불투명 얼룩 데칼 오독 방지)
            gloss.position.set(-0.16, 0.55, 0.18); gloss.scale.set(1.5, 0.5, 1);
            gloss.lookAt(-0.6, 1.6, 0.9);
            g.add(gloss);
            sp(0.14, 0.14, 0.63, 0, jelly);
            const smMouth = mk(new THREE.TorusGeometry(0.05, 0.014, 6, 10, Math.PI * 0.85), new THREE.MeshBasicMaterial({ color: 0x274048 }));
            smMouth.position.set(0, 0.3, 0.43); smMouth.rotation.z = Math.PI + Math.PI * 0.075; // 아래로 벌린 입 아크 (스티커 박스 입 제거)
            g.add(smMouth);
            eyes(0.42, 0.4, 0.13, 0.045, 'angry', { iris: 0x1d4e63, browColor: 0x1e4552 }); // 점 눈 2개는 NPC로 읽힘 (비평가 7.1 13번) — 성난 눈썹으로 적대 표정
            anim.body = body; topY = 0.85;
        } else if (kind === 'golem') {
            // 바위 구축물: 역삼각 몸통 라테 + 마그마 코어 + 거대 주먹 분절 팔 (눈사람 금지)
            const rockM = lam(base.clone().offsetHSL(0, -0.12, -0.02), ProChar.rockTex());
            const rockD = lam(base.clone().offsetHSL(0, -0.12, -0.16), ProChar.rockTex());
            rockM.flatShading = true; rockD.flatShading = true; // 각진 바위 파셋 — '매끈한 점토' 오독 제거 (비평가 지적)
            const magma = new THREE.MeshBasicMaterial({ color: 0xff5a22 }); // 깊은 마그마 오렌지 — 베이지 데칼 오독 방지
            const prof = [[0.17, 0], [0.3, 0.1], [0.36, 0.3], [0.33, 0.46], [0.2, 0.56]];
            body = mk(new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 12), rockM);
            body.position.y = 0.42; body.scale.z = 0.85;
            g.add(body);
            // 마그마 코어 + 가슴 균열 스트립
            const core = mk(new THREE.OctahedronGeometry(0.072), magma); // 각진 마그마 결정 — 평면 데칼 아닌 돌출 지오메트리
            core.position.set(0, 0.73, 0.325); core.scale.z = 0.45; core.rotation.z = 0.35;
            const coreRim = mk(new THREE.TorusGeometry(0.075, 0.022, 6, 12), rockD); // 코어 둘레 함몰 바위 림 — 표면 스티커가 아니라 깨진 틈 속 마그마
            coreRim.position.set(0, 0.73, 0.318);
            g.add(core, coreRim);
            // 코어에서 방사하는 가는 균열 (한 덩어리로 뭉치지 않게 짧고 얇게)
            for (const [cx2, cy2, ang] of [[0.1, 0.79, 0.9], [-0.1, 0.78, -0.8], [0.09, 0.66, -1.0], [-0.08, 0.65, 1.1]]) {
                const crack = mk(new THREE.BoxGeometry(0.013, 0.09, 0.012), magma);
                crack.position.set(cx2, cy2, 0.305); crack.rotation.z = ang;
                g.add(crack);
            }
            // 옆구리 마그마 틈 + 이끼 패치 — 단색 표면 정보량 상향
            for (const s of [-1, 1]) {
                const flank = mk(new THREE.BoxGeometry(0.011, 0.13, 0.011), magma);
                flank.position.set(s * 0.3, 0.62, 0.12); flank.rotation.z = s * 0.5;
                g.add(flank);
            }
            const mossM = new THREE.MeshLambertMaterial({ color: 0x5e7d3a });
            for (const [mx, my, mz, mr] of [[-0.14, 0.95, 0.1, 0.075], [0.2, 0.52, 0.2, 0.06], [0.05, 1.13, -0.05, 0.065]]) {
                const moss = mk(new THREE.SphereGeometry(mr, 8, 6), mossM);
                moss.position.set(mx, my, mz); moss.scale.y = 0.35;
                g.add(moss);
            }
            // 어깨 볼더 + 분절 팔(상완 캡슐 → 팔꿈치 → 하완 → 거대 주먹, 지면까지 늘어짐)
            for (const s of [-1, 1]) {
                const sh = new THREE.Group();
                sh.position.set(s * 0.38, 0.9, 0); // 몸통에 파묻히게 안쪽으로 — 어깨 볼더 공중부양 금지
                const boulder = mk(new THREE.SphereGeometry(0.165, 10, 8), rockD);
                boulder.scale.set(1.05, 0.9, 0.9); boulder.position.x = -s * 0.02;
                const upper = limb(0.085, 0.075, 0.3, rockM);
                upper.rotation.z = s * 0.12;
                const elbow = new THREE.Group();
                elbow.position.y = -0.32;
                const eJoint = mk(new THREE.SphereGeometry(0.082, 8, 6), rockM); // 팔꿈치 관절 바위 — 굽힘 시 이음새 은폐
                elbow.add(eJoint);
                const fore = limb(0.088, 0.108, 0.26, rockD); // 하완이 상완보다 두꺼운 파괴자 실루엣
                const fist = mk(new THREE.SphereGeometry(0.17, 10, 8), rockM);
                fist.position.y = -0.32; fist.scale.set(1, 1.1, 1);
                for (let k2 = 0; k2 < 3; k2++) { // 주먹 관절 돌기
                    const knuckle = mk(new THREE.SphereGeometry(0.05, 7, 6), rockD);
                    knuckle.position.set((k2 - 1) * 0.08, -0.42, s * 0.065);
                    elbow.add(knuckle);
                }
                elbow.add(fore, fist);
                sh.add(boulder, upper, elbow);
                g.add(sh);
                (anim.barm = anim.barm || []).push({ sh, elbow });
                if (s > 0) { armR = sh; anim.armRJ = { sh, elbow }; } else armL = sh;
            }
            // 골반 바위 — 몸통 하단과 다리 사이 공중 부양 갭 메움
            const pelvisG = mk(new THREE.SphereGeometry(0.21, 10, 8), rockD);
            pelvisG.position.set(0, 0.37, 0); pelvisG.scale.set(1.15, 0.62, 0.9);
            g.add(pelvisG);
            // 짧은 기둥 다리 + 발 바위 — 상체 질량 대비 두껍게 (왜소 다리 금지)
            for (const s of [-1, 1]) {
                const leg = limb(0.115, 0.1, 0.2, rockD);
                leg.position.set(s * 0.17, 0.26, 0);
                const foot = mk(new THREE.SphereGeometry(0.13, 9, 7), rockM);
                foot.position.set(s * 0.18, 0.055, 0.04); foot.scale.set(1, 0.5, 1.35);
                g.add(leg, foot);
            }
            // 머리: 어깨 사이에 파묻힌 낮은 바위 돔 + 목 바위 + 무거운 눈두덩 슬랩
            const neckG = mk(new THREE.CylinderGeometry(0.11, 0.14, 0.12, 9), rockD);
            neckG.position.set(0, 0.98, 0.04);
            g.add(neckG);
            const head = mk(new THREE.SphereGeometry(0.17, 10, 8), rockM);
            head.position.set(0, 1.06, 0.05); head.scale.set(1.1, 0.82, 0.95);
            const browSlab = mk(new THREE.BoxGeometry(0.3, 0.07, 0.14), rockD);
            browSlab.position.set(0, 1.14, 0.1); browSlab.rotation.x = 0.15;
            g.add(head, browSlab);
            eyes(1.05, 0.21, 0.08, 0.045, 'slit', { iris: 0xff7d33, narrow: true });
            topY = 1.35;
        } else if (kind === 'goblin') {
            // 굽은 등 이족보행: 서양배 몸통 전경 + 분절 사지 + 대형 귀 + 가시 몽둥이
            const skinM = lam(base, ProChar.hideTex());
            const skinD = lam(base.clone().offsetHSL(0, 0, -0.12), ProChar.hideTex());
            const clothM = lam(new THREE.Color(0x99442e), ProChar.leatherTex()); // 러스트 레드 — 초원 배경 보호색 탈피 악센트 (비평가 지적)
            // 분절 다리: 대퇴 → 무릎 → 정강이 → 발
            for (const s of [-1, 1]) {
                const hip = new THREE.Group();
                hip.position.set(s * 0.12, 0.42, 0);
                const hJ = mk(new THREE.SphereGeometry(0.065, 8, 6), skinM); // 고관절 구 — 걷기 스윙 시 몸통-다리 이음새 은폐
                hip.add(hJ);
                const thigh = limb(0.062, 0.05, 0.18, skinM);
                thigh.rotation.x = -0.3; // 웅크린 자세
                const knee = new THREE.Group();
                knee.position.set(0, -0.16, 0.06);
                const shin = limb(0.045, 0.04, 0.17, skinD);
                shin.rotation.x = 0.35;
                const foot = mk(new THREE.SphereGeometry(0.055, 8, 6), skinM);
                foot.position.set(0, -0.17, 0.07); foot.scale.set(0.8, 0.5, 1.7);
                knee.add(shin, foot);
                hip.add(thigh, knee);
                (anim.bleg = anim.bleg || []).push({ hip, knee }); // 걷기 관절 굽힘용 피벗 노출
                g.add(hip);
            }
            // 서양배 몸통 (앞으로 굽음) + 로인클로스 + 로프 벨트
            body = mk(new THREE.SphereGeometry(0.24, 12, 10), skinM);
            body.position.set(0, 0.62, 0.02); body.scale.set(1, 1.12, 0.92); body.rotation.x = 0.22;
            const belly = mk(new THREE.SphereGeometry(0.17, 10, 8), light);
            belly.position.set(0, 0.55, 0.14); belly.scale.set(1, 1.1, 0.55);
            const cloth = mk(new THREE.CylinderGeometry(0.2, 0.26, 0.14, 10, 1, true), clothM);
            cloth.material.side = THREE.DoubleSide;
            cloth.position.y = 0.42;
            const rope = mk(new THREE.TorusGeometry(0.205, 0.022, 6, 12), clothM);
            rope.rotation.x = Math.PI / 2; rope.position.y = 0.5;
            // 사선 가죽 밴돌리어 + 뼈 이빨 목걸이 — 초록 단색 몸통 분리 (비평가: 초록-초록 가독성 부족)
            const strap = mk(new THREE.TorusGeometry(0.245, 0.026, 6, 18), clothM);
            strap.position.set(0, 0.63, 0.02); strap.rotation.set(0.22, 0, 0.72);
            const boneM = new THREE.MeshLambertMaterial({ color: 0xf3ead6 });
            // 뼈 이빨 목걸이 — 몸통 타원면(회전 0.22 포함)에 밀착 앵커 + 사이 구슬로 끈 암시 (비평가: 이빨이 몸통에 떠 보임)
            const neckG = new THREE.Group();
            neckG.position.copy(body.position); neckG.rotation.x = 0.22; // 몸통과 같은 기울기 → 로컬에서 타원식이 축정렬
            const chestPt = (nx, ny) => { // 몸통 로컬 (nx,ny) → 표면 z (살짝 파묻음)
                const q = 1 - (nx / 0.24) ** 2 - (ny / 0.2688) ** 2;
                return new THREE.Vector3(nx, ny, 0.2208 * Math.sqrt(Math.max(0.02, q)) * 0.97);
            };
            for (let bi = -2; bi <= 2; bi++) {
                const p = chestPt(bi * 0.055, 0.15 - Math.abs(bi) * 0.022);
                const tooth2 = mk(new THREE.ConeGeometry(0.018, 0.055, 5), boneM);
                tooth2.position.copy(p);
                tooth2.rotation.x = Math.PI - 0.35; // 끝 아래로 + 가슴 경사 따라 눕힘
                neckG.add(tooth2);
                if (bi < 2) { // 이빨 사이 구슬 — 끈 라인
                    const bead = mk(new THREE.SphereGeometry(0.013, 6, 5), boneM);
                    bead.position.copy(chestPt((bi + 0.5) * 0.055, 0.185 - Math.abs(bi + 0.5) * 0.022));
                    neckG.add(bead);
                }
            }
            g.add(body, belly, cloth, rope, strap, neckG);
            // 머리: 큰 두상 + 대형 뾰족귀(안쪽 어두운 이중판) + 매부리코 + 언더바이트 송곳니
            const head = mk(new THREE.SphereGeometry(0.21, 12, 10), skinM);
            head.position.set(0, 0.95, 0.08); head.scale.set(1, 0.95, 0.95);
            // 턱 그룹 — 언더바이트를 앞으로 빼(두상 구에 파묻히던 문제) 송곳니를 턱에 직접 앵커 (비평가: 이빨 부유)
            const jawG = new THREE.Group();
            jawG.position.set(0, 0.845, 0.19);
            const jaw = mk(new THREE.SphereGeometry(0.13, 10, 8), skinD);
            jaw.scale.set(1.15, 0.55, 0.9);
            jawG.add(jaw);
            const mouthLine = mk(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2e1c14 })); // 벌린 입 다크 심 — 입 위치 실종 지적 (비평가)
            mouthLine.position.set(0, 0.065, 0.09); mouthLine.scale.set(1.6, 0.4, 0.5); // 턱 앞전에 걸치게 — 두상 구에 가려지지 않는 깊이
            jawG.add(mouthLine);
            for (const s of [-1, 1]) {
                const tusk = mk(new THREE.ConeGeometry(0.02, 0.085, 6), new THREE.MeshLambertMaterial({ color: 0xf5efdd }));
                tusk.position.set(s * 0.055, 0.05, 0.095); // 밑동은 턱 살 안, 끝은 윗입술 앞 — 턱에서 솟는 송곳니
                tusk.rotation.x = -0.35; // 앞으로 벌어진 언더바이트 각
                jawG.add(tusk);
            }
            g.add(head, jawG);
            for (const s of [-1, 1]) {
                const ear = new THREE.Group();
                ear.position.set(s * 0.19, 1.0, 0.02);
                const earOut = mk(new THREE.ConeGeometry(0.075, 0.32, 6), skinM);
                earOut.rotation.z = s * -1.85; earOut.position.x = s * 0.14;
                earOut.scale.z = 0.45;
                const earIn = mk(new THREE.ConeGeometry(0.045, 0.2, 6), skinD);
                earIn.rotation.z = s * -1.85; earIn.position.set(s * 0.12, 0.012, 0);
                earIn.scale.z = 0.3;
                ear.add(earOut, earIn);
                g.add(ear);
            }
            const nose = mk(new THREE.ConeGeometry(0.045, 0.14, 6), skinD);
            nose.position.set(0, 0.93, 0.3); nose.rotation.x = Math.PI / 2 - 0.35;
            g.add(nose);
            eyes(0.99, 0.28, 0.1, 0.045, 'fierce', { iris: 0xd9c422, tilt: 0.12, browColor: 0x3a4a2e });
            // 분절 팔 + 가시 몽둥이
            for (const s of [-1, 1]) {
                const sh = new THREE.Group();
                sh.position.set(s * 0.25, 0.78, 0.02);
                const sJ = mk(new THREE.SphereGeometry(0.055, 8, 6), skinM); // 어깨 관절 구 — 팔 스윙 시 이음새 은폐
                sh.add(sJ);
                const upper = limb(0.05, 0.042, 0.17, skinM);
                upper.rotation.z = s * 0.25;
                const elbow = new THREE.Group();
                elbow.position.set(s * 0.05, -0.17, 0);
                const eJ = mk(new THREE.SphereGeometry(0.042, 7, 5), skinM); // 팔꿈치 관절 구 — 굽힘 이음새 은폐
                elbow.add(eJ);
                const fore = limb(0.04, 0.036, 0.15, skinD);
                const wristBand = mk(new THREE.CylinderGeometry(0.041, 0.041, 0.05, 8), clothM); // 손목 랩 악센트
                wristBand.position.y = -0.12;
                const hand = mk(new THREE.SphereGeometry(0.062, 8, 6), skinM); // 큼직한 주먹 — 국수 가락 팔 끝 오독 방지
                hand.position.y = -0.16; hand.scale.set(1, 0.85, 1.1);
                elbow.add(fore, wristBand, hand);
                if (s > 0) { // 가시 몽둥이 — 주먹 중심을 자루가 관통하도록 (손목 옆 부유 금지)
                    const club = new THREE.Group();
                    club.position.y = -0.16;
                    const shaft = mk(new THREE.CylinderGeometry(0.032, 0.06, 0.4, 7), new THREE.MeshLambertMaterial({ color: 0x6d4c41, map: ProChar.leatherTex() }));
                    shaft.position.y = -0.1;
                    club.add(shaft);
                    for (let k2 = 0; k2 < 5; k2++) {
                        const spike = mk(new THREE.ConeGeometry(0.018, 0.06, 5), new THREE.MeshLambertMaterial({ color: 0xcfd2d6 }));
                        const a2 = k2 * 2.4;
                        spike.position.set(Math.cos(a2) * 0.06, -0.2 - (k2 % 3) * 0.05, Math.sin(a2) * 0.06);
                        spike.rotation.z = -Math.cos(a2) * 1.2; spike.rotation.x = Math.sin(a2) * 1.2;
                        club.add(spike);
                    }
                    club.rotation.z = 0.3; // 주먹에서 살짝만 기울여 — 자루가 주먹을 관통해 쥔 실루엣
                    elbow.add(club);
                }
                sh.add(upper, elbow);
                g.add(sh);
                (anim.barm = anim.barm || []).push({ sh, elbow });
                if (s > 0) { armR = sh; anim.armRJ = { sh, elbow }; } else armL = sh;
            }
            topY = 1.25;
        } else if (kind === 'bat') {
            body = sp(0.2, 0, 0.6, 0, mat, 1, 1.1, 0.9);
            // 몸통·다리 — '날개 달린 머리' 금지(비평가 지적): 털복숭이 몸통 + 밝은 가슴털 + 매달림 발톱 발
            sp(0.125, 0, 0.38, -0.02, dark, 1, 1.3, 0.8);
            sp(0.08, 0, 0.42, 0.07, light, 1, 1.15, 0.5); // 가슴털 패치
            for (const s of [-1, 1]) {
                const legB = cy(0.016, 0.012, 0.09, s * 0.05, 0.25, 0, dark);
                legB.rotation.z = s * 0.22;
                const claw = cn(0.018, 0.05, s * 0.068, 0.19, 0.012, new THREE.MeshLambertMaterial({ color: 0x2c2733 }));
                claw.rotation.x = Math.PI;
            }
            for (const s of [-1, 1]) {
                const ear = cn(0.05, 0.14, s * 0.11, 0.82, 0);
                ear.rotation.z = s * -0.3;
                const earIn = cn(0.028, 0.09, s * 0.105, 0.8, 0.02, new THREE.MeshLambertMaterial({ color: 0x35283e })); // 귀 안쪽 어두운 면
                earIn.rotation.z = s * -0.3; earIn.scale.z = 0.5;
                cn(0.018, 0.06, s * 0.05, 0.5, 0.14, new THREE.MeshLambertMaterial({ color: 0xffffff })); // 송곳니
                const wing = new THREE.Group();
                wing.position.set(s * 0.17, 0.65, 0);
                const wm = new THREE.Mesh(wingGeo(0.44, 0.3), new THREE.MeshLambertMaterial({ color: base.clone().offsetHSL(0.015, 0.06, -0.06), side: THREE.DoubleSide, transparent: true, opacity: 0.76 })); // 반투명 막 — 0.88은 사실상 불투명 판자로 읽힘 (비평가 6.8 8번)
                wm.scale.x = s;
                const wBone = mk(new THREE.CylinderGeometry(0.014, 0.01, 0.42, 5), dark); // 앞전 뼈대
                wBone.rotation.z = s * (Math.PI / 2 - 0.18);
                wBone.position.set(s * 0.2, 0.055, 0.002);
                wing.add(wm, wBone);
                for (const [fa, fl] of [[-0.55, 0.34], [-0.95, 0.3]]) { // 막 위 손가락 골 뼈대 — 종이 평판 아닌 막 구조
                    const fb = mk(new THREE.CylinderGeometry(0.009, 0.006, fl, 4), dark);
                    fb.position.set(s * Math.cos(-fa) * fl * 0.5, Math.sin(fa) * fl * 0.5 + 0.05, 0.006);
                    fb.rotation.z = s * (Math.PI / 2 - fa);
                    wing.add(fb);
                }
                wing.rotation.set(0.16, s * -0.3, s * -0.1); // 살짝 뒤로 스윕 + 끝 처짐 — 수평 판자 오독 방지
                wing.userData.s = s;
                anim.wings.push(wing);
                g.add(wing);
            }
            eyes(0.66, 0.165, 0.08, 0.042, 'angry', { iris: 0xffb547, glow: 0.12, tilt: 0.14, browColor: 0x3a3142 }); // 발광 축소 — 소형 두상에서 흰 원반으로 클리핑 (비평가 8번)
            anim.fly = true; topY = 1.0;
        } else if (kind === 'mushroom') {
            // 통통한 줄기 라테 + 갓 그룹(돔+테두리 립+반점+주름 프릴) + 밑동 발
            const stemM = lam(base.clone().offsetHSL(0.015, -0.16, 0.24), ProChar.hideTex()); // 웜 크림 줄기 — 무채색 회백 미완성 오독 제거
            const stemProf = [[0.15, 0], [0.12, 0.1], [0.1, 0.22], [0.13, 0.32], [0.16, 0.38]];
            const stem = mk(new THREE.LatheGeometry(stemProf.map(p => new THREE.Vector2(p[0], p[1])), 10), stemM);
            g.add(stem);
            for (const s of [-1, 1]) { // 밑동 스터비 발
                const foot = mk(new THREE.SphereGeometry(0.06, 8, 6), stemM);
                foot.position.set(s * 0.09, 0.03, 0.1); foot.scale.set(0.9, 0.5, 1.4);
                g.add(foot);
            }
            const capG = new THREE.Group(); // 갓 전체가 한 그룹으로 출렁임
            capG.position.y = 0.44;
            capG.rotation.x = -0.16; // 갓을 뒤로 젖혀 게임 카메라(전방 상단)에서 얼굴 가시성 확보 (비평가 지적)
            const capM = lam(new THREE.Color(0xc9402e), ProChar.hideTex()); // 절대 지정 시그니처 레드 갓 — 파생색은 태양광에 살구색으로 씻김 (비평가 지적)
            capM.side = THREE.DoubleSide; // 열린 반구 그림자 구멍 방지 — 단면 셸은 그림자 맵에 초승달 구멍('소용돌이 그림자' 아티팩트)을 냄
            const dome = mk(new THREE.SphereGeometry(0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), capM);
            dome.scale.set(1, 0.82, 1);
            const lip = mk(new THREE.TorusGeometry(0.29, 0.05, 8, 16), lam(base.clone().offsetHSL(0, 0.15, -0.16), ProChar.hideTex()));
            lip.rotation.x = Math.PI / 2; lip.position.y = 0.015;
            const frill = mk(new THREE.CylinderGeometry(0.28, 0.2, 0.06, 12, 1, true), light); // 갓 아래 주름살
            frill.material.side = THREE.DoubleSide;
            frill.position.y = -0.02;
            capG.add(dome, lip, frill);
            const spotM = new THREE.MeshLambertMaterial({ color: 0xfff8ec });
            // 흰 반점을 갓 '상단' 곡면에 구면좌표로 앵커 — 정면 하단 배치가 몸통 반점으로 오독됨 (비평가 지적)
            for (const [th, ph, sr] of [[0.3, 1.4, 0.055], [0.55, 2.35, 0.05], [0.52, 0.55, 0.045], [0.85, 1.85, 0.048], [0.82, 0.6, 0.038], [0.62, -2.0, 0.04]]) {
                const spot = mk(new THREE.SphereGeometry(sr, 8, 6), spotM);
                const rr = 0.32 * 0.97; // 살짝 파묻음
                const sx2 = Math.sin(th) * Math.cos(ph) * rr, sz2 = Math.sin(th) * Math.sin(ph) * rr, sy2 = Math.cos(th) * rr * 0.82;
                spot.position.set(sx2, sy2, sz2);
                spot.scale.z = 0.45;
                spot.lookAt(sx2 * 2, sy2 * 2.4, sz2 * 2); // 갓 법선 방향으로 눕힘
                capG.add(spot);
            }
            g.add(capG);
            for (const s of [-1, 1]) { // 스터비 팔 — 공격 모션 상상 가능한 실루엣 (비평가: 소품 버섯 오독)
                const armS = mk(new THREE.SphereGeometry(0.055, 8, 6), stemM);
                armS.position.set(s * 0.17, 0.26, 0.05); armS.scale.set(1.5, 0.7, 0.8);
                armS.rotation.z = s * -0.5;
                g.add(armS);
                if (s > 0) armR = armS; else armL = armS;
            }
            // 성난 왕눈 + 벌린 입 — 갓 그늘 아래 파묻힌 '얼굴 없는 소품' 탈피 (비평가 1위 결함)
            // 홍채 축소+무광+딥 크림슨, 흰자 비중 확대, 눈썹 진하게 — '주황 단추' 오독 재설계 (비평가 지적)
            eyes(0.3, 0.135, 0.08, 0.048, 'angry', { iris: 0xb0301f, irisScale: 0.85, glow: 0.3, tilt: 0.16, browColor: 0x33201a });
            const mMouth = mk(new THREE.SphereGeometry(0.042, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3a2420 }));
            mMouth.position.set(0, 0.165, 0.118); mMouth.scale.set(1.2, 0.8, 0.4); // 벌린 아우성 입
            const tooth = mk(new THREE.BoxGeometry(0.028, 0.02, 0.012), new THREE.MeshBasicMaterial({ color: 0xfff6e8 }));
            tooth.position.set(0, 0.185, 0.145);
            g.add(mMouth, tooth);
            anim.cap = capG; anim.hop = true;
            body = capG; topY = 0.9;
        } else if (kind === 'wolf') {
            // 사족 맹수 리그 재작성(비평가 3위 결함 '미구현 늑대'): 흉곽→골반 테이퍼 몸통 + 목/쐐기 두상 + 가슴 러프 + 2관절 다리 + 3분절 꼬리
            const furM = lam(base, ProChar.hideTex());
            const furD = lam(base.clone().offsetHSL(0, 0.02, -0.22), ProChar.hideTex()); // 대비 강화 — 단색 클레이 오독 방지
            const furL = lam(base.clone().offsetHSL(0.01, -0.06, 0.27), ProChar.hideTex()); // 배·러프·꼬리끝 명확한 라이트 톤
            body = mk(new THREE.SphereGeometry(0.19, 12, 9), furM);           // 흉곽 (앞이 크고)
            body.position.set(0, 0.42, 0.12); body.scale.set(0.9, 0.92, 1.25);
            const hind = mk(new THREE.SphereGeometry(0.16, 11, 8), furM);     // 골반 (뒤가 작게)
            hind.position.set(0, 0.4, -0.22); hind.scale.set(0.82, 0.85, 1.1);
            const belly = mk(new THREE.CylinderGeometry(0.155, 0.13, 0.34, 10), furM); // 연결 몸통
            belly.rotation.x = Math.PI / 2; belly.position.set(0, 0.41, -0.05);
            belly.scale.set(0.9, 1, 0.92);
            const ruff = mk(new THREE.SphereGeometry(0.15, 10, 8), furL);     // 앞가슴 밝은 러프 털
            ruff.position.set(0, 0.38, 0.26); ruff.scale.set(0.85, 0.8, 0.7);
            const neckW = mk(new THREE.CylinderGeometry(0.085, 0.105, 0.18, 9), furM);
            neckW.position.set(0, 0.52, 0.3); neckW.rotation.x = -0.7;
            g.add(body, hind, belly, ruff, neckW);
            const headW = new THREE.Group();                                   // 쐐기 두상 + 테이퍼 주둥이
            headW.position.set(0, 0.6, 0.38);
            const skullW = mk(new THREE.SphereGeometry(0.105, 11, 8), furM);
            skullW.scale.set(1.24, 0.92, 1.05); // x 확폭 2차 — 1.12로도 3/4 각도에서 흰자+호박 홍채가 실루엣 밖 '유니콘 뿔'로 돌출 (비평가 7.1 14번)
            const muzzleM = lam(base.clone().offsetHSL(0.005, -0.04, 0.14), ProChar.hideTex()); // 주둥이 전용 중간 톤 — 순백 러프색은 '붙임 데칼'로 읽힘 (비평가)
            const snout = mk(new THREE.CylinderGeometry(0.048, 0.075, 0.16, 8), muzzleM);
            snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.02, 0.14);
            const bridge = mk(new THREE.SphereGeometry(0.045, 8, 6), furD); // 콧등 다크 스트라이프 — 밝은 주둥이와 톤 분리 (비평가: 주둥이가 두상에 뭉개짐)
            bridge.position.set(0, 0.03, 0.12); bridge.scale.set(0.8, 0.5, 2.1);
            headW.add(bridge);
            const noseW = mk(new THREE.SphereGeometry(0.028, 7, 6), new THREE.MeshBasicMaterial({ color: 0x1d2126 }));
            noseW.position.set(0, -0.005, 0.22);
            const jawW = mk(new THREE.BoxGeometry(0.07, 0.03, 0.11), furD);
            jawW.position.set(0, -0.07, 0.1);
            headW.add(skullW, snout, noseW, jawW);
            for (const s of [-1, 1]) { // 드러난 송곳니 — 맹수 인상
                const fang = mk(new THREE.ConeGeometry(0.012, 0.035, 5), new THREE.MeshLambertMaterial({ color: 0xf5efdd }));
                fang.position.set(s * 0.032, -0.055, 0.185); fang.rotation.x = Math.PI;
                headW.add(fang);
            }
            for (const s of [-1, 1]) {                                         // 쫑긋 삼각 귀 (안쪽 어두운 면)
                const ear = mk(new THREE.ConeGeometry(0.045, 0.11, 5), furD);  // 다크 톤 — 밝은 귀가 역광에서 '흰 뿔'로 오독 (비평가 6.4 9번)
                ear.position.set(s * 0.065, 0.12, -0.02); ear.rotation.set(-0.25, 0, s * -0.3);
                const earIn = mk(new THREE.ConeGeometry(0.028, 0.08, 5), lam(new THREE.Color(0x272c36))); // 귀 안쪽 — 외이보다 한층 더 어둡게
                earIn.position.set(s * 0.065, 0.11, -0.005); earIn.rotation.set(-0.25, 0, s * -0.3);
                earIn.scale.z = 0.5;
                headW.add(ear, earIn);
            }
            for (const s of [-1, 1]) { // 목덜미 갈기 술 — 늑대 실루엣 개성 (양·개 오독 방지)
                const tuft = mk(new THREE.ConeGeometry(0.05, 0.13, 5), furD);
                tuft.position.set(s * 0.1, 0.52, 0.24); tuft.rotation.set(0.8, 0, s * 0.9);
                const tuft2 = mk(new THREE.ConeGeometry(0.04, 0.1, 5), furD);
                tuft2.position.set(s * 0.13, 0.44, 0.28); tuft2.rotation.set(1.1, 0, s * 1.3);
                g.add(tuft, tuft2);
            }
            g.add(headW);
            eyes(0.645, 0.472, 0.072, 0.03, 'fierce', { iris: 0xe8b13c, glow: 0.25, tilt: -0.28, browColor: 0x3c414d }); // 흰자+호박 홍채 — 두상 안에 파묻어 배치(흰 뿔 오독 방지), 좌우 분리 유지
            const backStripe = mk(new THREE.SphereGeometry(0.16, 10, 8), furD); // 등 다크 새들 — 목덜미→엉덩이 한 흐름으로 세그먼트 경계 은폐
            backStripe.position.set(0, 0.49, -0.03); backStripe.scale.set(0.78, 0.5, 2.45);
            const bellyW = mk(new THREE.SphereGeometry(0.13, 10, 8), furL); // 밝은 아랫배 — 투톤 코트
            bellyW.position.set(0, 0.33, -0.02); bellyW.scale.set(0.8, 0.6, 1.6);
            g.add(bellyW);
            // 2관절 다리 4개: 어깨/고관절 피벗 → 상퇴 → 하퇴 → 발 (달리기 사이클은 기존 anim.legs 인터페이스)
            for (const [lx, lz, front] of [[-0.11, 0.22, 1], [0.11, 0.22, 1], [-0.1, -0.24, 0], [0.1, -0.24, 0]]) {
                const haunch = mk(new THREE.SphereGeometry(front ? 0.072 : 0.088, 9, 7), furM); // 어깨/뒷다리 근육 덩어리 — 몸통-다리 이음새 은폐 ('로봇 다리' 오독 제거)
                haunch.position.set(lx * 0.95, front ? 0.41 : 0.4, lz + (front ? 0.015 : -0.02));
                haunch.scale.set(0.75, 1.15, 1.2);
                g.add(haunch);
                const leg = new THREE.Group();
                leg.position.set(lx, 0.36, lz);
                const upper = limb(0.05, 0.038, 0.18, furM);
                upper.rotation.x = front ? 0.12 : -0.2;
                const lower = limb(0.034, 0.026, 0.17, furD);
                lower.position.y = -0.18; lower.rotation.x = front ? -0.1 : 0.32;
                const paw = mk(new THREE.SphereGeometry(0.045, 7, 6), furD); // 다크 삭스 발 — 색 분리
                paw.position.set(0, -0.165, 0.025); paw.scale.set(1, 0.55, 1.35);
                lower.add(paw);
                upper.add(lower);
                leg.add(upper);
                lower.userData.rx0 = lower.rotation.x; lower.userData.front = front; // 질주 무릎 굽힘 기준 포즈
                (anim.knees = anim.knees || []).push(lower);
                anim.legs.push(leg);
                g.add(leg);
            }
            // 꼬리: 위로 휘어 오르는 3분절 커브 (끝만 밝은 털)
            const tailG = new THREE.Group();
            tailG.position.set(0, 0.46, -0.33);
            tailG.rotation.x = 0.55;
            let tPrev = tailG;
            for (let ti = 0; ti < 3; ti++) {
                const holder = new THREE.Group();
                holder.position.set(0, 0, -0.068); // 분절 간격 축소+세그 연장 — '구슬 체인' 오독 방지 (비평가 13번)
                holder.rotation.x = -0.26;
                const seg = mk(new THREE.SphereGeometry(0.085 - ti * 0.011, 8, 6), ti === 2 ? furL : furD); // 두툼한 브러시 꼬리 — 질주 실루엣 방향성
                seg.position.z = -0.045;
                seg.scale.set(0.82, 0.82, 1.85);
                holder.add(seg);
                tPrev.add(holder);
                tPrev = holder;
            }
            g.add(tailG);
            anim.tail = tailG;
            topY = 0.95;
        } else { // imp: 작은 악마 — 분절 사지 + 박쥐 막날개 + 화살촉 꼬리 + 곡선 뿔
            const skinM = lam(base, ProChar.hideTex());
            const skinD = lam(base.clone().offsetHSL(0, 0, -0.12), ProChar.hideTex());
            const boneM = new THREE.MeshLambertMaterial({ color: 0xf3ead6 });
            // 디지타이그레이드 다리: 대퇴 → 역관절 정강이 → 발굽
            for (const s of [-1, 1]) {
                const hip = new THREE.Group();
                hip.position.set(s * 0.075, 0.3, 0);
                const thigh = limb(0.042, 0.035, 0.12, skinM);
                thigh.rotation.x = -0.35;
                const knee = new THREE.Group();
                knee.position.set(0, -0.11, 0.04);
                const shin = limb(0.03, 0.026, 0.13, skinD);
                shin.rotation.x = 0.5;
                const hoof = mk(new THREE.ConeGeometry(0.035, 0.07, 6), skinD);
                hoof.position.set(0, -0.13, 0.05); hoof.rotation.x = Math.PI;
                knee.add(shin, hoof);
                hip.add(thigh, knee);
                (anim.bleg = anim.bleg || []).push({ hip, knee }); // 걷기 관절 굽힘용 피벗 노출
                g.add(hip);
            }
            // 몸통 캡슐 + 밝은 배 패치
            body = mk(new THREE.SphereGeometry(0.15, 10, 8), skinM);
            body.position.y = 0.4; body.scale.set(1, 1.25, 0.9);
            const belly = mk(new THREE.SphereGeometry(0.1, 8, 6), light);
            belly.position.set(0, 0.36, 0.09); belly.scale.set(1, 1.25, 0.5);
            g.add(body, belly);
            // 머리 + 곡선 2단 뿔 + 뾰족귀
            const head = mk(new THREE.SphereGeometry(0.125, 10, 8), skinM);
            head.position.y = 0.63;
            g.add(head);
            for (const s of [-1, 1]) {
                const horn1 = mk(new THREE.ConeGeometry(0.03, 0.1, 6), boneM);
                horn1.position.set(s * 0.07, 0.75, 0); horn1.rotation.z = s * -0.4;
                const horn2 = mk(new THREE.ConeGeometry(0.02, 0.08, 6), boneM);
                horn2.position.set(s * 0.115, 0.82, 0); horn2.rotation.z = s * -0.85;
                const ear = mk(new THREE.ConeGeometry(0.03, 0.09, 5), skinD);
                ear.position.set(s * 0.125, 0.66, -0.01); ear.rotation.z = s * -1.75;
                ear.scale.z = 0.5;
                g.add(horn1, horn2, ear);
            }
            eyes(0.65, 0.105, 0.055, 0.034, 'angry', { iris: 0xffe14a, glow: 0.12, tilt: 0.22, browColor: 0x5c2338 }); // 발광 축소 — 소형 두상에서 흰 원반으로 클리핑 (비평가 8번)
            const grin = mk(new THREE.TorusGeometry(0.052, 0.013, 6, 10, Math.PI * 0.8), new THREE.MeshBasicMaterial({ color: 0x33141f })); // 씩 웃는 입
            grin.position.set(0, 0.585, 0.107); grin.rotation.z = Math.PI + Math.PI * 0.1;
            g.add(grin);
            for (const s of [-1, 1]) { // 언더바이트 송곳니
                const impFang = mk(new THREE.ConeGeometry(0.013, 0.035, 5), boneM);
                impFang.position.set(s * 0.035, 0.585, 0.115);
                g.add(impFang);
            }
            // 박쥐 막날개: 본 콘 2개 + 삼각 멤브레인
            for (const s of [-1, 1]) {
                const wing = new THREE.Group();
                wing.position.set(s * 0.11, 0.5, -0.09);
                const bone1 = mk(new THREE.CylinderGeometry(0.012, 0.009, 0.2, 5), skinD);
                bone1.position.set(s * 0.09, 0.05, 0); bone1.rotation.z = s * 1.1;
                const bone2 = mk(new THREE.CylinderGeometry(0.009, 0.006, 0.16, 5), skinD);
                bone2.position.set(s * 0.2, 0.02, 0); bone2.rotation.z = s * 1.9;
                const mem = mk(wingGeo(0.42, 0.3), new THREE.MeshLambertMaterial({ color: base.clone().offsetHSL(0.02, 0.08, -0.04), side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); // 반투명 막 — 판자 오독 제거, 몸 대비 과소(비행 설득력) 확대 (비평가 6.8 8번)
                mem.scale.x = s;
                mem.position.y = 0.08;
                wing.add(bone1, bone2, mem);
                wing.position.set(s * 0.135, 0.42, -0.13); // 소켓을 등 뒤·바깥으로 — 날개 평면이 몸통을 관통·교차하던 문제
                wing.rotation.set(0.32, s * -0.25, s * 0.55); // 펼침각 완화 + 뒤로 젖힘
                wing.userData.s = s;
                anim.wings.push(wing);
                g.add(wing);
            }
            // 분절 팔
            for (const s of [-1, 1]) {
                const sh = new THREE.Group();
                sh.position.set(s * 0.14, 0.5, 0.01);
                const upper = limb(0.03, 0.026, 0.1, skinM);
                upper.rotation.z = s * 0.4;
                const elbow = new THREE.Group();
                elbow.position.set(s * 0.04, -0.1, 0);
                const eJ = mk(new THREE.SphereGeometry(0.026, 7, 5), skinM); // 팔꿈치 관절 구 — 굽힘 이음새 은폐
                elbow.add(eJ);
                const fore = limb(0.024, 0.02, 0.09, skinD);
                const hand = mk(new THREE.SphereGeometry(0.036, 7, 5), skinM);
                hand.position.y = -0.1;
                elbow.add(fore, hand);
                for (let ci = 0; ci < 3; ci++) { // 갈퀴 발톱 — '손 없는 캡슐' 오독 제거
                    const claw = mk(new THREE.ConeGeometry(0.011, 0.038, 4), boneM);
                    claw.position.set((ci - 1) * 0.02, -0.135, 0.012);
                    claw.rotation.x = Math.PI - 0.35;
                    elbow.add(claw);
                }
                sh.add(upper, elbow);
                g.add(sh);
                (anim.barm = anim.barm || []).push({ sh, elbow });
                if (s > 0) { armR = sh; anim.armRJ = { sh, elbow }; } else armL = sh;
            }
            // 화살촉 꼬리: 커브 세그먼트 3개 + 화살촉
            const tailG = new THREE.Group();
            tailG.position.set(0, 0.3, -0.12);
            let px2 = 0, py2 = 0, pz2 = 0, ang2 = -0.6;
            for (let k2 = 0; k2 < 3; k2++) {
                const seg = mk(new THREE.CylinderGeometry(0.016 - k2 * 0.003, 0.013 - k2 * 0.003, 0.12, 5), skinD);
                seg.position.set(px2, py2 - Math.cos(ang2) * 0.05, pz2 - Math.sin(-ang2) * 0.05);
                seg.rotation.x = ang2;
                tailG.add(seg);
                py2 -= Math.cos(ang2) * 0.1; pz2 -= Math.sin(-ang2) * 0.1; ang2 -= 0.55;
            }
            const tip2 = mk(new THREE.ConeGeometry(0.035, 0.08, 4), skinD);
            tip2.position.set(px2, py2 + 0.02, pz2 - 0.06);
            tip2.rotation.x = ang2 + 0.4; tip2.scale.z = 0.4;
            tailG.add(tip2);
            g.add(tailG);
            topY = 0.98;
        }
        if (e.isBoss) {
            g.scale.setScalar(1.9);
            const crown = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.26, 5), new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0xffd54f, emissiveIntensity: 0.4 }));
            crown.position.y = topY;
            g.add(crown);
        }
        // HP 바: 카메라를 향하도록 역회전한 서브그룹에 부착
        const hpG = new THREE.Group();
        hpG.rotation.y = 0.55; // 그룹 회전(-0.55) 상쇄
        const barY = (e.isBoss ? topY + 0.35 : topY + 0.25);
        const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: 0x263238, side: THREE.DoubleSide }));
        hpBg.position.y = barY;
        const hpFg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: 0x69f0ae, side: THREE.DoubleSide }));
        hpFg.position.set(0, barY, 0.01);
        hpG.add(hpBg, hpFg);
        g.add(hpG);
        return { g, body, hpBg, hpFg, armR, armL, flashMats, kind, anim };
    },

    ensureBlobRes() {
        if (this.blobShadowMat) return;
        this.blobShadowMat = new THREE.MeshBasicMaterial({
            map: this.makeGlowTexture(), color: 0x000000, transparent: true, opacity: 0.17, depthWrite: false, // 실그림자(섀도맵)의 접지 AO 보조 — 0.34는 실그림자와 이중 노출로 '그림자 두 개' 오독 (비평가: 버섯·임프 블롭 정합)
        });
        this.blobShadowFlyMat = this.blobShadowMat.clone();
        this.blobShadowFlyMat.opacity = 0.45; // 비행체 전용 — 실그림자를 끄므로 블롭이 유일한 접지 단서 (0.3은 샷에서 안 보여 '부유 스티커', 비평가 7.3 5번)
        this.blobGeo = new THREE.PlaneGeometry(1, 1);
    },

    spawnEnemy(e) {
        const m = this.monsterMesh(e);
        m.g.position.set(e.x + this.worldX, 0, 0);
        m.g.rotation.y = -0.55; // 영웅 방향(-x)으로 3/4 자세
        this.setShadow(m.g);
        this.scene.add(m.g);
        this.enemyMap.set(e.id, m);
        // 접지 블롭 섀도우 — scene 직속으로 두고 update에서 추적 (홉/비행 시 그림자는 지면에 남아야 함)
        this.ensureBlobRes();
        // 비행체는 태양 각도로 실그림자가 본체에서 멀리 이탈해 '따로 노는 얼룩'이 됨 (비평가 7.1 4번) — 실그림자 끄고 발밑 수직 블롭만
        const flying = m.kind === 'bat';
        if (flying) m.g.traverse(o => { if (o.isMesh) o.castShadow = false; });
        const blob = new THREE.Mesh(this.blobGeo, flying ? this.blobShadowFlyMat : this.blobShadowMat);
        blob.rotation.x = -Math.PI / 2;
        blob.position.set(e.x + this.worldX, 0.03, 0);
        blob.scale.setScalar(flying ? 0.85 : 0.72); // 실그림자 접지부 안 컨택트 AO — 비행체는 블롭이 유일한 접지 단서라 더 크게
        blob.userData.baseS = blob.scale.x;
        blob.userData.sharedGeometry = true;
        this.scene.add(blob);
        m.blob = blob;
        // 등장: 지면을 밟고 화면 밖(+x)에서 걸어 들어옴 — 하늘 낙하 금지 (사용자 지시).
        // 스폰 x(3.1+)는 화면 밖이고 Combat 접근 로직이 전진시키므로 즉시 접지 + 걷기 모션이 곧 등장 연출.
        m.g.userData.landed = true;
        if (e.isBoss) { // 보스 플러리시: 지면 먼지 파동 + 스케일 인 (접지 유지)
            const targetScale = m.g.scale.x;
            m.g.scale.setScalar(targetScale * 0.55);
            this.expandRing(m.g.position.clone(), new THREE.Color(0xbcaaa4), 1.4);
            this.addAnim(0.32, k => {
                m.g.scale.setScalar(targetScale * (0.55 + 0.45 * (1 - (1 - k) * (1 - k))));
            }, () => m.g.scale.setScalar(targetScale));
        }
    },

    clearEnemies() {
        for (const [, m] of this.enemyMap) {
            this.disposeTree(m.g); this.scene.remove(m.g);
            if (m.blob) this.scene.remove(m.blob);
        }
        this.enemyMap.clear();
    },

    // 오브젝트 서브트리의 geometry/material을 해제 (제거 시 GPU 메모리 누적 방지).
    // GLB 스켈레톤 몬스터 clone은 geometry를 원본 템플릿과 공유하므로
    // monsterMesh()에서 userData.sharedGeometry=true로 표시된 메시는 geometry를 건드리지 않음(material은 인스턴스별 clone이라 해제).
    disposeTree(root) {
        root.traverse(o => {
            if (!o.isMesh) return;
            if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
            if (o.material) {
                if (Array.isArray(o.material)) o.material.forEach(mm => mm && mm.dispose());
                else o.material.dispose();
            }
        });
    },
    // 그룹의 모든 자식을 해제 후 제거 (무기/투구/갑옷 부속 등 매 장비 교체마다 다시 만들어지는 그룹 정리용)
    clearGroup(group) {
        while (group.children.length) {
            const child = group.children[0];
            this.disposeTree(child);
            group.remove(child);
        }
    },

    // ---- 액션 연출 ----
    // 무기 타입별 공격 모션
    heroAttack(targetId) {
        const m = this.enemyMap.get(targetId);
        const W = this.worldX;
        const tx = Math.min(m ? m.g.position.x - 0.6 : Combat.MELEE_X + W, 0.7 + W); // 돌진 거리 제한
        const fromX = Combat.HERO_X + W;
        const wt = WEAPON_TYPES[this.wtypeId];
        const motion = wt ? wt.motion : 'slash';
        const wcolor = S.equipment.weapon ? AGE_COLORS[S.equipment.weapon.age] : 0xcfd8dc;
        this._attacking = true;
        this.weaponG.rotation.set(0, 0, 0); // 공격 중엔 중립 파지(스윙 궤적 기준) — 종료 시 resetArm이 파지 각 복원
        const rest = this.armRest !== undefined ? this.armRest : -0.25;
        const resetArm = () => {
            this._attacking = false;
            this.heroG.position.x = fromX;
            this.heroG.position.y = 0;
            this.heroG.rotation.set(0, 0.55, 0);
            this.armR.rotation.set(rest, 0, 0);
            const gr = this._gripRot || [0, 0, 0];
            this.weaponG.rotation.set(gr[0], gr[1], gr[2]); // 무기별 파지 각 복원 (어깨 걸침 등)
            const gp = this._gripPos || [0, 0, 0];
            this.weaponG.position.set(gp[0], gp[1], gp[2]);
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

        // 리그 모드: 키프레임 클립으로 공격
        if (this.heroRig) {
            const CLIP_MAP = {
                slash: ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal'],
                chop: ['1H_Melee_Attack_Chop'],
                thrust: ['1H_Melee_Attack_Stab'],
                slam: ['2H_Melee_Attack_Chop', '2H_Melee_Attack_Slice'],
                double: ['Dualwield_Melee_Attack_Slice', 'Dualwield_Melee_Attack_Chop'],
                bow: ['2H_Ranged_Shoot', '2H_Ranged_Shooting'],
                gun: ['1H_Ranged_Shoot', '1H_Ranged_Shooting'],
                cast: ['Spellcast_Shoot', 'Spellcast_Raise', 'Spellcasting', '2H_Ranged_Shoot'],
                throw: ['Throw', 'Spellcast_Shoot', '1H_Melee_Attack_Chop'],
            };
            this.heroPlay(CLIP_MAP[motion] || CLIP_MAP.slash, true, 1.8);
            const endAtk = () => {
                this._attacking = false; this._trailOn = false; this.heroG.position.x = fromX;
                const gr = this._gripRot || [0, 0, 0];
                this.weaponG.rotation.set(gr[0], gr[1], gr[2]); // 무기별 파지 각 복원
                const gp = this._gripPos || [0, 0, 0];
                this.weaponG.position.set(gp[0], gp[1], gp[2]);
            };
            if (!wt || wt.kind === 'melee') {
                this.trailStart(wcolor); // 스윙 궤적 트레일 (모션 판독성)
                this.addAnim(0.36, k => {
                    const lunge = k < 0.5 ? k * 2 : (1 - k) * 2;
                    this.heroG.position.x = U.lerp(fromX, tx, lunge * 0.85);
                }, endAtk);
                if (motion === 'slam') setTimeout(() => {
                    this.expandRing(new THREE.Vector3(Math.min(tx + 0.5, this.worldX + 1.2), 0, 0), new THREE.Color(0xffcc80), 1.2);
                    this.shake(0.15);
                }, 210);
                swooshAt(motion === 'double' ? 90 : 160);
                if (motion === 'double') swooshAt(200);
            } else {
                setTimeout(endAtk, 430);
                if (motion === 'gun') { this.muzzleFlash(); this.fireProjectile('bullet', targetPos, 0xffee58, wt.impact); }
                else if (motion === 'cast') { this.flashLight(this.heroG.position, wcolor, 0.3); this.fireProjectile('magic', targetPos, wcolor, wt.impact); }
                else if (motion === 'throw') { this.fireProjectile('spin', targetPos, wcolor, wt.impact); }
                else { this.fireProjectile('arrow', targetPos, 0x8d6e63, wt.impact); }
            }
            return;
        }

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
                this.expandRing(new THREE.Vector3(Math.min(tx + 0.5, this.worldX + 1.2), 0, 0), new THREE.Color(0xffcc80), 1.2);
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
        }, () => { this.disposeTree(arc); this.scene.remove(arc); });
    },

    // ---- 투사체 ----
    projectiles: [],
    fireProjectile(kind, to, colorHex, dur) {
        const from = new THREE.Vector3(this.heroG.position.x + 0.45, 1.05, 0.1);
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
        p.position.set(this.heroG.position.x + 0.55, 1.15, 0.1);
        this.scene.add(p);
        this.addAnim(0.09, k => { p.scale.setScalar(1 + k); p.material.opacity = 1 - k; }, () => { this.disposeTree(p); this.scene.remove(p); });
    },

    enemyAttack(id) {
        const m = this.enemyMap.get(id);
        if (!m) return;
        const ox = m.g.position.x;
        this.addAnim(0.3, k => {
            m.g.position.x = ox - Math.sin(k * Math.PI) * 0.55;
            const J = m.anim && m.anim.armRJ;
            if (J) {
                // 2관절 연쇄: 어깨를 후상방으로 당기며 팔꿈치 깊게 굽힘(와인드업) → 전방 스냅하며 폄(타격) → 복귀 (비평가: 통짜 전방 돌출 금지)
                const w = Math.min(1, k / 0.42), st = k < 0.42 ? 0 : Math.min(1, (k - 0.42) / 0.22), rec = k > 0.82 ? (k - 0.82) / 0.18 : 0;
                J.sh.rotation.x = (0.9 * w) * (1 - st) - 1.45 * st * (1 - rec);
                J.elbow.rotation.x = -(0.35 + 0.75 * w) * (1 - st) - 0.15 * st;
                m.g.rotation.z = (0.14 * w) * (1 - st) - 0.1 * st * (1 - rec); // 몸통 비틀림 동참 — 예비동작 판독성
            } else if (m.armR) m.armR.rotation.x = -Math.sin(k * Math.PI) * 1.6; // 관절 없는 리그 폴백: 팔 휘두르기
        }, () => {
            const e = Combat.enemies.find(x => x.id === id);
            m.g.position.x = e ? e.x + this.worldX : ox;
            if (m.armR) m.armR.rotation.x = 0;
            if (m.anim && m.anim.armRJ) { m.anim.armRJ.elbow.rotation.x = -0.22; m.g.rotation.z = 0; } // 아이들 자연 굽힘 자세로 복귀
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
        // 스케일 펀치 — 맞는 순간 눌렸다 되돌아온다(크리티컬은 더 깊게). 넉백과 축이 달라 서로 묻히지 않는다.
        const sx = m.g.scale.x, sy = m.g.scale.y;
        const punch = crit ? 0.22 : 0.11;
        this.addAnim(crit ? 0.22 : 0.15, k => {
            const p = Math.sin(k * Math.PI) * punch;
            m.g.scale.set(sx * (1 + p * 0.6), sy * (1 - p), sx * (1 + p * 0.6));
        }, () => { m.g.scale.set(sx, sy, sx); });
        if (crit) this.hitStop(0.055); // 크리티컬 히트스톱 — 한 박자 멈춰야 '묵직하게' 읽힌다
        this.spawnSparks(m.g.position.clone().add(new THREE.Vector3(0, 0.6, 0)), crit ? 22 : 9, crit ? 0xffab40 : 0xffee58);
        // HP바 2단 연출 — 피해 비율만큼 잔상바가 남고, 큰 피해면 바가 흔들린다
        const e = Combat.enemies.find(x => x.id === id);
        const loss = (e && !Big.of(e.maxHp).isZero()) ? U.clamp(Big.of(dmg).ratioTo(e.maxHp), 0, 1) : 0.1;
        this.punchHpBar(m, loss);
        // 데미지 숫자 — 크리티컬은 크게, 튀어오르는 아크로 흩어지게
        const cls = kind === 'skill' ? 'dmg-skill' : crit ? 'dmg-crit' : 'dmg';
        this.damageNumber(m.g.position.clone().add(new THREE.Vector3(U.rand(-0.3, 0.3), U.rand(1.1, 1.5), 0)), U.fmt(dmg), cls);
    },

    // 히트스톱: 짧게 전역 타임스케일을 0에 가깝게 눌렀다 되돌린다 (update가 dt에 곱해 쓴다)
    hitStop(dur) {
        this._hitStop = Math.max(this._hitStop || 0, dur);
    },

    killEnemy(id, isBoss) {
        const m = this.enemyMap.get(id);
        if (!m) return;
        // 처치 순간 파편/스파크 버스트 강화 + 즉발 충격 링 (쥬시니스 패스)
        const at = m.g.position.clone().add(new THREE.Vector3(0, 0.5, 0));
        this.spawnSparks(at, isBoss ? 58 : 26, 0xff7043);
        this.spawnSparks(at, isBoss ? 22 : 10, 0xffe082); // 밝은 심지 — 단색 버스트가 '먼지'로 읽히지 않게 2색 레이어
        this.expandRing(new THREE.Vector3(m.g.position.x, 0.06, m.g.position.z), new THREE.Color(0xffab40), isBoss ? 1.9 : 1.05);
        if (isBoss) this.hitStop(0.09); // 보스 처치는 한 박자 더 묵직하게
        // 사망: 피격 경직 → 무릎 꺾임 → 뒤로(+x) 쓰러짐 → 착지 먼지 → 서서히 페이드아웃 (빙글 회전·순간 소멸 금지, 사용자 지시)
        // update 루프는 !e.alive를 건너뛰므로 이 애니메이션이 트랜스폼을 단독 소유한다.
        if (m.hpBg && m.hpBg.parent) m.hpBg.parent.visible = false; // HP바는 시체와 함께 넘어가지 않게 즉시 숨김 (좀비 잔상 방지)
        const mats = [];
        m.g.traverse(o => {
            if (!o.isMesh || !o.material) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { mt.transparent = true; mats.push(mt); });
        });
        const baseY = m.g.position.y, sy0 = m.g.scale.y, ox = m.g.position.x, dur = isBoss ? 1.5 : 1.05;
        let dusted = false;
        this.addAnim(dur, k => {
            if (k < 0.1) {
                m.g.position.x = ox + k * 1.2; // 피격 반동 — 뒤로 밀림
            } else if (k < 0.5) {
                const f = (k - 0.1) / 0.4;
                // 무릎 꺾임(이족) 또는 몸통 주저앉음(무릎 없는 종) + 등부터 가속 낙하
                if (m.anim && m.anim.bleg) m.anim.bleg.forEach(L => { L.knee.rotation.x = -0.15 - f * 1.5; L.hip.rotation.x = f * 0.5; });
                else m.g.scale.y = sy0 * (1 - 0.22 * f);
                m.g.rotation.z = -f * f * 1.45;      // -z 회전 = +x(영웅 반대) 쪽으로 눕기
                m.g.position.y = baseY * (1 - f);    // 비행체는 지면으로 내려앉음
            } else {
                if (!dusted) {
                    dusted = true;
                    this.expandRing(new THREE.Vector3(m.g.position.x + 0.25, 0, 0), new THREE.Color(0xbcaaa4), isBoss ? 1.5 : 0.9);
                    m.g.traverse(o => { if (o.isMesh) o.castShadow = false; }); // 페이드 중 그림자 잔존 방지 (opacity는 캐스트 섀도우에 미반영)
                }
                m.g.rotation.z = -1.45;
                m.g.position.y = 0;
                const f = (k - 0.5) / 0.5;
                mats.forEach(mt => mt.opacity = 1 - f); // 디졸브
                if (m.blob) m.blob.scale.setScalar(0.95 * (1 - f)); // 공유 재질인 블롭 섀도우는 스케일로만 축소
            }
        }, () => { this.disposeTree(m.g); this.scene.remove(m.g); if (m.blob) this.scene.remove(m.blob); this.enemyMap.delete(id); });
    },

    // ---- 머리 위 HP바 쥬시니스 (사용자 지시: "HP 깎이는 연출 최대한 쥬시하게") ----
    // 2단 바: 앞바(hpFg)는 즉시 깎이고, 그 뒤의 손실 잔상바(hpGhost)가 잠깐 멈췄다가 스르륵 따라 줄어든다.
    // 잔상이 남긴 폭이 곧 "방금 잃은 양"이라 한 대에 얼마나 아팠는지가 눈으로 읽힌다.
    GHOST_HOLD: 0.22,   // 잔상바가 제자리에 멈춰 있는 시간 — 이 구간이 손실량을 각인시킨다
    GHOST_SPEED: 3.0,   // 이후 따라붙는 속도 (비율/초) — 홀드 0.22 + 추격 0.2 ≈ 총 0.42초로 스펙(짧게) 안에 들어온다

    // 잔상바 메쉬를 앞바 뒤에 깔고, 흔들림 전용 컨테이너로 바 3종을 묶는다 (적·영웅 공용, 최초 1회)
    attachGhostBar(bar) {
        if (!bar || bar.hpGhost || !bar.hpFg || !bar.hpFg.parent) return;
        const parent = bar.hpFg.parent;
        const ghost = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09),
            new THREE.MeshBasicMaterial({ color: 0xff8a65, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
        ghost.position.set(0, bar.hpFg.position.y, bar.hpFg.position.z - 0.004); // 앞바 바로 뒤
        // 흔들림은 이 그룹에만 건다. 영웅 바의 부모(heroHpG)는 매 프레임 월드 좌표가 재설정되므로
        // 거기에 직접 오프셋을 주면 바가 월드 원점으로 튄다 — 항상 0을 기준으로 하는 컨테이너가 필요하다.
        const shakeG = new THREE.Group();
        parent.add(shakeG);
        if (bar.hpBg) shakeG.add(bar.hpBg);
        shakeG.add(ghost, bar.hpFg); // 앞바를 마지막에 넣어 잔상바 위로 그려지게
        bar.shakeG = shakeG;
        bar.hpGhost = ghost;
        bar.ghostRatio = 1;
        bar.ghostHold = 0;
    },

    updateHpBar(bar, ratio, dt) {
        if (!bar || !bar.hpFg) return;
        if (!bar.hpGhost) this.attachGhostBar(bar);
        // 앞바 — 즉시 반영
        bar.hpFg.scale.x = Math.max(0.001, ratio);
        bar.hpFg.position.x = -0.4 * (1 - ratio);
        // 피격 직후 짧은 흰 플래시 → 이후 잔량 구간색
        const base = ratio > 0.5 ? 0x69f0ae : ratio > 0.2 ? 0xffd740 : 0xff5252;
        if (bar.flash > 0) {
            bar.flash -= dt;
            bar.hpFg.material.color.setHex(0xffffff);
        } else {
            bar.hpFg.material.color.setHex(base);
        }
        // 잔상바 — 줄었으면 잠깐 멈췄다가 따라 내려온다. 회복(비율 증가)은 즉시 동기화.
        if (bar.ghostRatio === undefined) bar.ghostRatio = ratio;
        if (ratio > bar.ghostRatio) bar.ghostRatio = ratio;
        if (bar.ghostHold > 0) bar.ghostHold -= dt;
        else if (bar.ghostRatio > ratio) {
            bar.ghostRatio = Math.max(ratio, bar.ghostRatio - this.GHOST_SPEED * dt * Math.max(0.45, bar.ghostRatio - ratio + 0.45)); // 남은 차이가 클수록 빠르게(가속 추격)
        }
        const g = bar.hpGhost;
        if (g) {
            g.scale.x = Math.max(0.001, bar.ghostRatio);
            g.position.x = -0.4 * (1 - bar.ghostRatio);
            g.visible = bar.ghostRatio - ratio > 0.002;
        }
        // 큰 피해면 바 자체가 흔들린다 (전용 컨테이너만 흔들어 부모 좌표계를 건드리지 않는다)
        if (bar.shakeG) {
            if (bar.shake > 0) {
                bar.shake -= dt;
                bar.shakeG.position.x = Math.sin(bar.shake * 90) * bar.shake * 0.22;
            } else if (bar.shakeG.position.x !== 0) {
                bar.shakeG.position.x = 0;
            }
        }
    },

    // 피해량 비율에 따라 바 플래시·홀드·흔들림을 건다 (적·영웅 공용)
    punchHpBar(bar, lossRatio) {
        if (!bar) return;
        bar.flash = 0.1;
        bar.ghostHold = this.GHOST_HOLD;
        if (lossRatio > 0.12) bar.shake = Math.min(0.26, 0.12 + lossRatio * 0.4); // 큰 피해만 흔든다
    },

    heroHit(dmg) {
        const ox = this.heroG.position.x;
        this.addAnim(0.2, k => { this.heroG.position.x = ox - Math.sin(k * Math.PI) * 0.2; },
            () => { this.heroG.position.x = Combat.HERO_X; });
        // 영웅 머리 위 바도 적과 같은 문법으로 반응 — 피해 비율이 클수록 크게 흔들린다
        const maxHp = Combat.hero && Combat.hero.maxHp;
        const loss = (dmg !== undefined && maxHp && !Big.of(maxHp).isZero()) ? U.clamp(Big.of(dmg).ratioTo(maxHp), 0, 1) : 0.1;
        this.punchHpBar(this._heroBar, loss);
        UI.flashDamage(loss); // 화면 가장자리 붉은 비네트 — 큰 피해일수록 진하게
    },

    heroDown() {
        this.heroPlay(['Death_A'], true);
        setTimeout(() => this.heroPlay(['Idle']), 1600);
        this.shake(0.4);
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
                }, () => { this.disposeTree(rock); this.scene.remove(rock); this.explosion(tp, color); this.shake(0.2); });
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
                }, () => { this.disposeTree(bolt); this.disposeTree(core); this.scene.remove(bolt); this.scene.remove(core); });
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
        }, () => { this.disposeTree(ring); this.scene.remove(ring); });
    },

    beam(from, to, color) {
        const len = from.distanceTo(to);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 6),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
        beam.position.lerpVectors(from, to, 0.5);
        beam.rotation.z = Math.PI / 2 - Math.atan2(to.y - from.y, to.x - from.x);
        this.scene.add(beam);
        this.addAnim(0.25, k => { beam.material.opacity = 0.95 * (1 - k); beam.scale.x = beam.scale.z = 1 + k * 2; },
            () => { this.disposeTree(beam); this.scene.remove(beam); });
    },

    // ---- 무기 궤적 트레일 (근접 스윙 판독성 — 삼각 스트립 리본, 수명 0.15s 테이퍼) ----
    TRAIL_TIP: { sword: 0.95, axe: 0.85, spear: 1.25, hammer: 0.8, dagger: 0.55, club: 0.6 }, // 무기별 날 끝 y (weaponG 로컬)
    trailStart(colorHex) {
        if (!this.trailMesh) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 6 * 3), 3)); // 48세그 — 풀 아크 수용 (24세그는 스윙 절반에서 버퍼 포화 → '블레이드 옆 스텁')
            geo.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(48 * 6), 1)); // 1=새 샘플, 0=수명 끝 — 나이 기반 알파 그라디언트
            // 가산 블렌딩은 풀 아크에서 겹침이 순백 삼각형으로 폭주 (비평가 7.1 1번 화이트아웃의 실체) —
            // 노멀 블렌딩 + 나이별 알파 페이드 + 신선한 구간만 백색 코어로 '읽히는 곡선' 리본
            this.trailMat = new THREE.ShaderMaterial({
                uniforms: { uColor: { value: new THREE.Color(0xffffff) } },
                vertexShader: 'attribute float aFade; varying float vFade;\n' +
                    'void main(){ vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
                fragmentShader: 'uniform vec3 uColor; varying float vFade;\n' +
                    'void main(){ float f = clamp(vFade, 0.0, 1.0);\n' +
                    '  vec3 col = mix(uColor, vec3(1.0), pow(f, 4.0) * 0.35);\n' + // 날 끝 최신 구간만 얇은 흰 코어
                    '  gl_FragColor = vec4(col, pow(f, 1.6) * 0.72); }',
                transparent: true, depthWrite: false, side: THREE.DoubleSide,
            });
            this.trailMesh = new THREE.Mesh(geo, this.trailMat);
            this.trailMesh.frustumCulled = false;
            this.scene.add(this.trailMesh);
        }
        this.trailMat.uniforms.uColor.value.setHex(colorHex).offsetHSL(0, 0.35, -0.04); // 채도 상향·명도 소폭 하향 — 밝은 배경 위 washy 방지
        this.trailPts = this.trailPts || [];
        this._trailPrevLocal = null;
        this._trailOn = true;
    },
    updateTrail(dt) {
        const pts = this.trailPts;
        const LIFE = this.TRAIL_LIFE || 0.22; // 촬영 슬로모 시 상향 주입 가능 — 0.18은 스윙 전반부가 리본에서 죽음
        // 기존 샘플 에이징을 먼저 — 새 샘플이 이번 프레임 dt만큼 미리 늙으면 안 됨
        for (const p of pts) p.age += dt;
        while (pts.length && pts[0].age >= LIFE) pts.shift();
        if (this._trailOn && this.weaponG && this.weaponG.visible) {
            this.weaponG.updateWorldMatrix(true, false);
            const tipLen = this.TRAIL_TIP[this.wtypeId] || 0.7;
            const b = this.weaponG.localToWorld(new THREE.Vector3(0, 0.12, 0));
            const t = this.weaponG.localToWorld(new THREE.Vector3(0, tipLen, 0));
            // 돌진(몸통 평행이동)은 궤적이 아님 — 영웅 로컬에서 날끝이 실제 휘둘러질 때만 기록 (비평가: 수평 부유 막대)
            const lt = this.heroG.worldToLocal(t.clone());
            const swung = !this._trailPrevLocal || lt.distanceTo(this._trailPrevLocal) > (this.TRAIL_MIN_STEP || 0.06); // 슬로모 촬영 시 하향 조정 가능
            this._trailPrevLocal = lt;
            if (swung) {
                let last = pts[pts.length - 1];
                if (last && last.dir) {
                    // 스윙 방향 반전(와인드업→다운스윙 커스프)에서 리본이 접혀 겹침 — '방사 스포크' (비평가 7.3 2번).
                    // 전체 소거(pts.length=0)는 저fps에서 프레임 델타 각이 90°를 넘겨 매 프레임 오발 → 리본이 상시 소거돼
                    // '트레일 없는 공격샷'(비평가 7.4 1번)의 실체 — 스트로크 경계만 표시해 이전 리본은 자연 페이드시킨다
                    const dirNew = new THREE.Vector3().subVectors(t, last.t);
                    if (dirNew.dot(last.dir) < 0) { last.brk = true; last = null; }
                }
                if (last) {
                    // 저 fps에서도 리본이 끊기지 않게 프레임 사이를 보간 샘플로 메움 (상한 12 — 6은 저fps 캡처에서 직선 코드가 '각진 부채'로 노출)
                    const n = Math.min(12, Math.floor(last.t.distanceTo(t) / 0.06));
                    for (let j = 1; j <= n; j++) {
                        const k = j / (n + 1);
                        pts.push({ b: last.b.clone().lerp(b, k), t: last.t.clone().lerp(t, k), age: last.age * (1 - k) });
                    }
                }
                pts.push({ b, t, age: 0, dir: last ? new THREE.Vector3().subVectors(t, last.t) : null });
                while (pts.length > 47) pts.shift(); // 버퍼 상한 (48세그먼트 지오메트리)
            }
        }
        if (!this.trailMesh) return;
        if (pts.length < 2) { this.trailMesh.visible = false; return; }
        this.trailMesh.visible = true;
        const pos = this.trailMesh.geometry.attributes.position;
        const fade = this.trailMesh.geometry.attributes.aFade;
        let vi = 0;
        // 풀폭 쿼드 + 안쪽(자루) 가장자리 알파 0 크로스 페이드 — 날끝 수축 테이퍼는 삼각 슬라이스가
        // 그대로 보이는 '각진 종이부채'로 읽힘 (비평가 7.3 2번): 폭은 유지하고 알파로만 스미어
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i], p1 = pts[i + 1];
            if (p0.brk) continue; // 스트로크 경계 — 반전 커스프를 가로질러 연결하면 리본이 접힘
            const f0 = Math.max(0, 1 - p0.age / LIFE), f1 = Math.max(0, 1 - p1.age / LIFE);
            fade.setX(vi, 0); pos.setXYZ(vi++, p0.b.x, p0.b.y, p0.b.z);
            fade.setX(vi, f0); pos.setXYZ(vi++, p0.t.x, p0.t.y, p0.t.z);
            fade.setX(vi, f1); pos.setXYZ(vi++, p1.t.x, p1.t.y, p1.t.z);
            fade.setX(vi, 0); pos.setXYZ(vi++, p0.b.x, p0.b.y, p0.b.z);
            fade.setX(vi, f1); pos.setXYZ(vi++, p1.t.x, p1.t.y, p1.t.z);
            fade.setX(vi, 0); pos.setXYZ(vi++, p1.b.x, p1.b.y, p1.b.z);
        }
        this.trailMesh.geometry.setDrawRange(0, vi);
        pos.needsUpdate = true;
        fade.needsUpdate = true;
    },

    // ---- 파티클 ----
    // 방사형 발광 스프라이트 텍스처 (파티클 공용, 1회 생성)
    sparkTex() {
        if (this._sparkTex) return this._sparkTex;
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.28, 'rgba(255,255,255,0.85)');
        grad.addColorStop(0.62, 'rgba(255,255,255,0.22)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        this._sparkTex = new THREE.CanvasTexture(c);
        return this._sparkTex;
    },
    // 발광 파티클: 가산 블렌딩 빌보드 (박스 파편이 '깨진 텍스처'로 보이던 문제 교체)
    spawnSparks(pos, count, colorHex) {
        for (let i = 0; i < count; i++) {
            const p = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.sparkTex(), color: colorHex, transparent: true,
                blending: THREE.AdditiveBlending, depthWrite: false,
            }));
            p.position.copy(pos);
            p.userData.baseScale = U.rand(0.16, 0.34);
            p.scale.setScalar(p.userData.baseScale);
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
        this.setTheme(CHAPTER_THEMES[(chapter - 1) % CHAPTER_THEMES.length]);
    },
    setTheme(t) {
        this.renderer.setClearColor(t.sky);
        // 안개색 보정 — 원본 팔레트의 안개는 회백 베일처럼 채도를 씻어냈음. 하늘색 쪽으로 당기고
        // 낮엔 채도를 살짝 올려 "색이 있는 대기"로 (원경이 밝은 실루엣 레이어로 분리돼 보이게)
        const isNightPre = (t.celestial || 'sun') === 'moon';
        const fogC = new THREE.Color(t.fog).lerp(new THREE.Color(t.sky), 0.3);
        if (!isNightPre) fogC.offsetHSL(0, 0.09, 0.01);
        this.scene.fog.color.copy(fogC);
        this.terrainMat.color.setHex(t.ground);
        // 능선 실루엣(MeshBasic·무조명): 근경은 어둡게·원경은 안개에 깊이 잠기게 명도 단차를 크게 벌려
        // 근·중·원 3단(근경 능선 → 원경 능선 → 하늘)의 대기 원근이 읽히게 함
        this.mountainMat.color.copy(new THREE.Color(t.ground).offsetHSL(0, 0.03, -0.16).lerp(fogC, 0.22));
        this.hillMat.color.copy(new THREE.Color(t.ground).lerp(fogC, 0.75));
        this.farHillMat.color.copy(new THREE.Color(t.ground).lerp(fogC, 0.9)); // 안개에 거의 잠긴 최원경
        this.foliageMat.color.copy(new THREE.Color(t.ground).offsetHSL(-0.02, 0.08, -0.16));
        this.foliageMatDark.color.copy(new THREE.Color(t.ground).offsetHSL(-0.025, 0.09, -0.23)); // 뒤 나무용 어두운 변주
        this.foliageMatLight.color.copy(new THREE.Color(t.ground).offsetHSL(-0.015, 0.07, -0.09)); // 앞 나무용 밝은 변주
        this.bushMat.color.copy(new THREE.Color(t.ground).offsetHSL(-0.01, 0.05, -0.1));
        this.hemi.color.setHex(t.sky);
        this.hemi.groundColor.copy(new THREE.Color(t.ground).offsetHSL(0, 0, -0.1));
        // 바이옴 소품 교체 (같은 바이옴이면 그대로 유지)
        const biome = t.biome || 'forest';
        if (biome !== this._biome) this.buildProps(biome);
        // 챕터 색보정 + 밤 조명 무드 — 밤 챕터가 낮과 같은 광량이면 "흐린 낮"처럼 보이므로
        // 태양광을 절반 수준의 서늘한 달빛으로 낮추고 림라이트를 상대적으로 키워 실루엣 위주의 밤 화면을 만듦
        const isNight = (t.celestial || 'sun') === 'moon';
        // 밤은 전역 노출도 낮춰 지면·소품까지 확실히 어둡게 (라이트 감쇠만으론 ACES 어깨에서 중간톤이 다시 떠오름)
        this.renderer.toneMappingExposure = isNight ? 0.82 : 1.0; // 낮도 살짝 눌러 밸류 중간값 확보 (백화 방지)
        if (isNight) {
            this.sun.intensity = 0.55;
            this.hemi.intensity = 0.36;
            this.rim.intensity = 0.45;
            this.sun.color.copy(new THREE.Color(0xc6d4ff).lerp(new THREE.Color(t.sky), 0.25)); // 달빛
            this.sun.position.set(5, 6.5, -7); // 달 디스크(우측 후방)와 같은 방향에서 내려오는 역광 — 그림자가 카메라 쪽으로
            this.sun.userData.baseX = 5;
        } else {
            this.sun.position.set(7, 5.2, 3.2); // 낮: 측면 45도 저고도 — 캐스트 섀도를 길게, 요철 스컬핑 최대로
            this.sun.userData.baseX = 7;
            this.sun.intensity = biome === 'lava' ? 0.85 : 1.85; // 태양 비중 상향 — "앰비언트로 뜬 파스텔" 인상 제거
            this.hemi.intensity = biome === 'lava' ? 0.42 : 0.3; // 채움광은 낮춰 명암비 확보
            this.rim.intensity = 0.3;
            this.sun.color.copy(new THREE.Color(0xffedc4).lerp(new THREE.Color(t.sky), 0.15)); // 더 따뜻한 직사광
        }
        // ch7 마법: ch6에서 성공한 달 역광 공식이 어두운 보라 팔레트에서 안 읽힘 — 시안 림을 크게 키워
        // 크리스탈·암석 실루엣 윤곽이 배경에서 분리되게 (3회차 비평가 지적 반영)
        if (biome === 'magic' && isNight) {
            this.rim.intensity = 1.05;
            this.rim.color.setHex(0x7fdcff);
        } else {
            this.rim.color.setHex(0xcfe4ff);
        }
        // 안개 심도: 낮은 원경을 조금 더 멀리까지 보이게(상단 화이트아웃 완화), 밤·용암은 짙게 유지.
        // 바위산은 안개를 더 얇게 — 원경 능선·하늘이 안개에 뭉개져 분리가 안 읽히던 문제 (3회차 비평가 지적)
        this.scene.fog.near = isNight ? 11 : biome === 'rock' ? 15 : 13;
        this.scene.fog.far = isNight || biome === 'lava' ? 30 : biome === 'rock' ? 42 : 35;
        // 발광체 라이트 블리드(악센트 포인트라이트 3기)는 buildProps에서 발광 소품에 직접 부착·설정됨
        // 바이옴별 돌 색 (설원=서리 낀 밝은 회청, 사막=테라코타 악센트, 바위산=지면보다 두 단계 어둡게 — 명도 분리)
        this.stoneMat.color.setHex(
            biome === 'snow' ? 0xc9d8e6 : biome === 'desert' ? 0xb97f5e : biome === 'rock' ? 0x6a6055 : 0x90a4ae);
        // 바위산: 지면 탠과 색온도를 맞춘 웜 그레이 — "배치한 에셋" 티 제거 (쿨 그레이는 지면과 따로 놀았음)
        // 천체: 낮=해, 밤=달+별 (테마 celestial 필드로 명시, 기본 sun)
        const cel = t.celestial || 'sun';
        const night = isNight;
        this.sunDisc.visible = cel === 'sun';
        this.moonDisc.visible = cel === 'moon';
        this.stars.visible = cel === 'moon';
        if (this.aurora) this.aurora.visible = biome === 'snow' && night; // 설원 밤 전용 오로라
        // 수정 결정은 테마 하늘색 계열로 발광 (마법=보라, 심해=청록이 자동 반영)
        if (biome === 'magic') {
            // 몸통은 테마색, 발광은 시안 악센트 — 단일 색상환(전부 보라/청록)에 보색 계열 포인트를 박음
            // 몸통을 어두운 청록으로 눌러 ACES에서 흰색으로 증발하지 않고 시안 발광 색이 유지되게
            this.crystalMat.color.setHex(0x0e4b57);
            this.crystalMat.emissive.setHex(0x1cb8cf);
            this.crystalMat.emissiveIntensity = 1.1;
        }
        // 용암: 반구광 지면 반사색을 뜨거운 주황으로 — 소품 아랫면이 용암빛을 받는 느낌
        if (biome === 'lava') this.hemi.groundColor.setHex(0x8a3d1a);
        // 용암 바이옴: 지면 균열이 주황으로 발광
        if (biome === 'lava') {
            if (!this.crackTex) this.crackTex = this.makeCrackTexture();
            this.terrainMat.emissiveMap = this.crackTex;
            this.terrainMat.emissive.setHex(0xff3d00);
            this.terrainMat.emissiveIntensity = 1.15; // 어두운 현무암 지면 위 작열 크랙 대비 강화
        } else {
            this.terrainMat.emissiveMap = null;
            this.terrainMat.emissive.setHex(0x000000);
            this.terrainMat.emissiveIntensity = 1;
        }
        this.terrainMat.needsUpdate = true; // emissiveMap 유무가 바뀌면 셰이더 재컴파일 필요
        // 마법 챕터: 무광 검정 실루엣으로 보이던 롤리팝 나무에 은은한 보라 발광을 얹어 "언릿 소품" 인상 제거
        for (const fm of this.foliageMats) {
            fm.emissive.setHex(biome === 'magic' ? 0x4a2f8f : 0x000000);
            fm.emissiveIntensity = biome === 'magic' ? 0.34 : 1;
        }
        this.paintSky(t.sky, fogC.getHex(), night);
    },

    shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); },

    addAnim(dur, fn, onDone) { this.anims.push({ t: 0, dur, fn, onDone }); },

    update(dt) {
        // 히트스톱: 크리티컬 순간 연출 시간만 거의 멈춘다. Combat 틱은 별도라 전투 진행에는 영향이 없고,
        // dt를 0으로 두면 애니메이션이 죽으므로 아주 작은 값으로 눌러 '한 프레임 정지'처럼 보이게 한다.
        if (this._hitStop > 0) {
            this._hitStop -= dt;
            dt *= 0.12;
        }
        this._clock += dt;
        // 적 위치 동기화 + 걷기 모션 + HP바 (논리 좌표 + 월드 오프셋)
        for (const e of Combat.enemies) {
            const m = this.enemyMap.get(e.id);
            if (!m || !e.alive) continue;
            m.g.position.x += ((e.x + this.worldX) - m.g.position.x) * Math.min(1, dt * 12);
            const walking = e.x > Combat.MELEE_X + 0.05;
            if (m.g.userData.landed) {
                const clk = this._clock, id = e.id;
                if (m.anim && m.anim.fly) {
                    // 박쥐류: 공중 부양 + 날개 퍼덕임
                    m.g.position.y = 0.12 + Math.sin(clk * 5 + id) * 0.1;
                    m.anim.wings.forEach(w => w.rotation.z = w.userData.s * (0.3 + Math.sin(clk * 16 + id) * 0.55));
                } else if (walking) {
                    if (m.anim && m.anim.kind === 'wolf') {
                        // 늑대: 네 다리 질주
                        m.g.position.y = Math.abs(Math.sin(clk * 11 + id)) * 0.05;
                        m.anim.legs.forEach((lg, j) => {
                            // 로터리 갤럽 위상: 앞발 쌍·뒷발 쌍이 살짝 어긋나 어느 프레임에도 4지 동시 접지가 없음 (비평가: 죽은 프레임 금지)
                            const lp = clk * 13 + id + [0, 1.1, 3.25, 4.35][j];
                            lg.rotation.x = Math.sin(lp) * 0.85;
                            const kn = m.anim.knees && m.anim.knees[j];
                            // 스윙 복귀 구간 무릎 접힘 — 앞다리는 뒤로, 뒷다리는 앞으로 (사족 관절 방향). 접힘각 상향 (사용자 재검수: 정지 프레임 판독)
                            if (kn) kn.rotation.x = kn.userData.rx0 + (kn.userData.front ? -1 : 1) * Math.max(0, Math.sin(lp + 1.3)) * 0.85;
                        });
                        m.g.rotation.x = Math.sin(clk * 11 + id) * 0.03;
                        if (m.anim.tail) m.anim.tail.rotation.z = Math.sin(clk * 9 + id) * 0.25; // 질주 중 꼬리 좌우 휘날림
                    } else if (m.anim && m.anim.hop) {
                        // 버섯: 크게 총총 + 갓 출렁
                        m.g.position.y = Math.abs(Math.sin(clk * 7 + id)) * 0.17;
                        if (m.anim.cap) m.anim.cap.rotation.z = Math.sin(clk * 7 + id) * 0.13;
                    } else if (m.anim && m.anim.kind === 'slime') {
                        // 슬라임: 젤리 스쿼시 점프 (라테 몸통 기준 스케일 1, 스쿼시 시 가로 보존 팽창)
                        const s2 = Math.abs(Math.sin(clk * 6 + id));
                        m.g.position.y = s2 * 0.12;
                        if (m.body) {
                            m.body.scale.y = 1 - (1 - s2) * 0.14;
                            m.body.scale.x = m.body.scale.z = 1 + (1 - s2) * 0.07;
                        }
                    } else {
                        // 이족보행: 관절 걷기 — 고관절 스윙+무릎 굽힘, 어깨 스윙+팔꿈치 굽힘 (통짜 막대기 금지)
                        const ph = clk * 8 + id; // 주기 0.785s — 0.1s 연속 캡처 8프레임과 정수배 겹침 방지 (프레임 중복 오독)
                        m.g.position.y = Math.abs(Math.sin(ph)) * (m.anim.bleg ? 0.045 : 0.07);
                        m.g.rotation.z = Math.sin(ph) * (m.anim.bleg ? 0.03 : 0.08); // 롤 축소 — 다리 측면 벌어짐 오독 방지
                        if (m.anim.bleg) m.anim.bleg.forEach((L, j) => {
                            const lp = ph + j * Math.PI;
                            // 2차 고조파 가산 — 전후 스윙 비대칭(전방 빠르게·후방 느리게)으로 반주기 미러 중복 프레임 제거
                            L.hip.rotation.x = Math.sin(lp) * 0.8 + Math.sin(2 * lp) * 0.12;
                            // 코사인 벨 무릎: 스윙 다리가 몸 아래를 지날 때 최대 74° 접힘(발꿈치 차올림), 지지 구간은 미세 굽힘 — 정지 프레임 판독 (사용자 재검수)
                            L.knee.rotation.x = -0.15 - Math.pow(Math.max(0, Math.cos(lp - 0.35)), 1.4) * 1.15;
                        });
                        if (m.anim.barm) m.anim.barm.forEach((A, j) => {
                            const ap = ph + j * Math.PI + Math.PI; // 같은 쪽 다리와 역위상
                            A.sh.rotation.x = Math.sin(ap) * 0.65;
                            A.elbow.rotation.x = -0.7 - Math.max(0, Math.sin(ap)) * 0.6; // 상시 굽힘 40°+ 앞 스윙 가산 최대 74° (비평가: 강체 튜브 팔 금지)
                        });
                        else if (m.armR) {
                            m.armR.rotation.x = Math.sin(ph) * 0.55;
                            if (m.armL) m.armL.rotation.x = -Math.sin(ph) * 0.55;
                        }
                    }
                } else {
                    m.g.position.y = Math.max(0, Math.sin(clk * 6 + id) * 0.04);
                    m.g.rotation.z *= 0.9;
                    if (m.armL) m.armL.rotation.x *= 0.9;
                    if (m.anim.bleg) m.anim.bleg.forEach(L => { L.hip.rotation.x *= 0.85; L.knee.rotation.x *= 0.85; });
                    if (m.anim.barm) m.anim.barm.forEach(A => {
                        A.sh.rotation.x *= 0.85;
                        A.elbow.rotation.x += (-0.22 - A.elbow.rotation.x) * 0.12; // 살짝 굽힌 자연 자세로 정착 — 차렷 막대기 방지
                    });
                    if (m.anim.knees) m.anim.knees.forEach(kn => kn.rotation.x += (kn.userData.rx0 - kn.rotation.x) * 0.15);
                    if (m.anim.kind === 'wolf') m.anim.legs.forEach(lg => lg.rotation.x *= 0.85);
                }
            }
            if (m.blob) { // 블롭 섀도우 추적 — 홉/비행 높이에 따라 축소 (지면에 남는 그림자)
                m.blob.position.x = m.g.position.x;
                m.blob.position.z = m.g.position.z;
                m.blob.scale.setScalar((m.blob.userData.baseS || 0.95) * Math.max(0.55, 1 - m.g.position.y * 0.35)); // 0.8 감쇠는 비행 고도에서 블롭이 소멸해 '부유 스티커' (비평가 7.3 5번)
            }
            const ratio = U.clamp(Big.of(e.hp).ratioTo(e.maxHp), 0, 1); // hp는 Big — 비율만 Number로 뽑는다
            this.updateHpBar(m, ratio, dt);
        }
        // 영웅 머리 위 HP 바: 위치는 heroG를 매 프레임 추적, 비율·색은 적과 동일한 임계값
        if (this.heroHpG && this.heroG) {
            this.heroHpG.position.set(this.heroG.position.x, this.heroG.position.y + 1.85, this.heroG.position.z);
            const hRatio = !Big.of(Combat.hero.maxHp).isZero() ? U.clamp(Big.of(Combat.hero.hp).ratioTo(Combat.hero.maxHp), 0, 1) : 1;
            this.updateHpBar(this._heroBar, hRatio, dt);
        }
        // 영웅: 걷기(월드 전진) / 아이들 — GLB 모드는 스켈레탈 클립, 아니면 프로시저럴 관절
        if (this.heroG && this.legs) {
            const walkCycle = Math.sin(this._clock * 11);
            const rest = this.armRest !== undefined ? this.armRest : -0.25;
            if (this.walking && !this._attacking) {
                // 행군: 플레이어가 실제로 오른쪽(+x)으로 전진 — 카메라가 따라가고 소품은 제자리
                this.worldX += 1.7 * dt;
                this.heroG.position.x = Combat.HERO_X + this.worldX;
                if (!this.heroRig) {
                    this.legs[0].rotation.x = walkCycle * 0.65;
                    this.legs[1].rotation.x = -walkCycle * 0.65;
                    this.armR.rotation.x = rest > -1 ? rest - walkCycle * 0.45 : rest;
                    this.armL.rotation.x = -0.15 + walkCycle * 0.45;
                    this.heroG.position.y = Math.abs(walkCycle) * 0.06;
                } else this.heroG.position.y = 0;
                // 지나간 소품은 전방에 재배치 (무한 월드)
                for (const o of this.scrollables) {
                    if (o.position.x < this.worldX - 13) {
                        o.position.x += 26;
                        o.position.y = this.heightAt(o.position.x, o.position.z) + 0.05;
                    }
                }
                // 지형 타일 순환 (높이 함수가 주기 30이라 이어붙임이 무결)
                if (this.worldX - this.ground.position.x > 15) this.ground.position.x += 30;
            } else {
                if (!this._attacking) this.heroG.position.x = Combat.HERO_X + this.worldX;
                if (!this.heroRig) {
                    this.legs[0].rotation.x *= 0.85;
                    this.legs[1].rotation.x *= 0.85;
                    if (!this._attacking) {
                        this.armR.rotation.x += (rest - this.armR.rotation.x) * 0.15;
                        this.armL.rotation.x += (-0.15 - this.armL.rotation.x) * 0.15;
                        this.heroG.position.y = Math.sin(this._clock * 3) * 0.03;
                    }
                }
            }
            // 프로시저럴 리그: 키프레임 갱신 + 상태 전환 (걷기/대기)
            if (this.heroRig) {
                this.heroRig.update(dt);
                if (!this._attacking) {
                    this.heroPlay(this.walking ? ['Walking'] : ['Idle']);
                    this.heroG.position.y = 0; // 상하 바운스는 리그 root.py 트랙이 담당
                }
                if (this._trailOn || (this.trailPts && this.trailPts.length)) this.updateTrail(dt);
            }
        }
        // 펫: 종별 고유 모션 — 몸짓은 종 특성 위주, 상하 바운스는 보조
        this.petGroups.forEach((pg, i) => {
            const ud = pg.userData;
            const t = this._clock * (ud.speed || 1) + (ud.phase || 0);
            const mo = PET_MOTION[ud.name] || { freq: 4, amp: 0.08 };
            // 영웅 전진을 따라오기
            ud.home.x = Combat.HERO_X + (ud.spotX || -0.3) + this.worldX;
            let xJitter = 0;
            // 종별 특수 몸짓
            if (ud.name === 'Scorpion' || ud.name === 'Spider') xJitter = Math.sin(t * 16) * 0.03; // 옆걸음 스커틀
            if (ud.name === 'Snail') xJitter = Math.sin(t * 0.9) * 0.06;                            // 미끄러지듯 왕복
            pg.position.x = ud.home.x + xJitter;
            const walkBoost = this.walking ? 1.7 : 1;
            pg.position.y = ud.home.y + (mo.hop
                ? Math.abs(Math.sin(t * mo.freq)) * mo.amp * walkBoost
                : Math.sin(t * mo.freq) * mo.amp * walkBoost);
            if (mo.sway) pg.rotation.z = Math.sin(t * mo.freq * 0.8) * mo.sway;
            if (mo.yaw) pg.rotation.y = 0.55 + Math.sin(t * mo.freq) * mo.yaw;
            if (mo.pitch) pg.rotation.x = Math.sin(t * mo.freq) * mo.pitch;
            // 파츠 애니메이션 (종의 정체성): 집게 딱딱 / 꼬리침 아치 / 날개 퍼덕 / 머리들 끄덕 / 꼬리 아홉 물결
            if (ud.wings) for (const w of ud.wings) w.rotation.z = w.userData.s * (0.45 + Math.sin(t * 13) * 0.6);
            if (ud.tail) ud.tail.rotation.z = Math.sin(t * (ud.name === 'Dog' ? 15 : 5)) * 0.7;
            if (ud.tails) ud.tails.forEach((tl, j) => tl.rotation.z = Math.sin(t * 3 + j * 1.3) * 0.55);
            if (ud.claws) ud.claws.forEach((cl, j) => {
                const snap = Math.max(0, Math.sin(t * 7 + j * Math.PI));
                cl.scale.z = 1.2 + snap * 0.7;             // 집게 벌렸다
                cl.rotation.y = (j === 0 ? 1 : -1) * snap * 0.5; // 오므리기
            });
            if (ud.sting) ud.sting.rotation.x = 2.5 + Math.sin(t * 3.2) * 0.55; // 꼬리침 크게 아치
            if (ud.heads) ud.heads.forEach((h, j) => h.position.y = 0.32 + Math.sin(t * 5 + j * 2.1) * 0.05);
            if (ud.ghostMat) ud.ghostMat.opacity = 0.4 + Math.sin(t * 2.5) * 0.2;
        });
        // 탈것: 종별 고유 모션 없이 영웅을 따라오며 가볍게 상하 바운스만(사용자 지시 — 따라다니는 연출만)
        if (this.mountGroup) {
            const ud = this.mountGroup.userData;
            const t = this._clock + (ud.phase || 0);
            ud.home.x = Combat.HERO_X + (ud.spotX || 0.6) + this.worldX;
            this.mountGroup.position.x = ud.home.x;
            const walkBoost = this.walking ? 1.6 : 1;
            this.mountGroup.position.y = ud.home.y + Math.abs(Math.sin(t * 4)) * 0.05 * walkBoost;
        }
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
                if (p.isSprite) p.material.dispose(); else this.disposeTree(p);
                this.scene.remove(p);
                this.particles.splice(i, 1);
                continue;
            }
            p.position.addScaledVector(p.userData.vel, dt);
            if (!p.userData.noGravity) p.userData.vel.y -= 9 * dt;
            const lifeK = 1 - p.userData.age / p.userData.life;
            p.material.opacity = lifeK;
            if (p.isSprite && p.userData.baseScale) p.scale.setScalar(p.userData.baseScale * (0.4 + 0.6 * lifeK));
        }
        // 안개 드리프트 (카메라 주변 순환) + 원경 산맥은 카메라를 따라감
        for (const mist of this.mists) {
            mist.position.x += mist.userData.speed * dt;
            if (mist.position.x > this.worldX + 10) mist.position.x = this.worldX - 10;
            if (mist.position.x < this.worldX - 10) mist.position.x = this.worldX + 10;
            mist.position.y = mist.userData.baseY + Math.sin(this._clock * 0.6 + mist.userData.baseY * 5) * 0.12;
        }
        // 태양(+그림자 카메라 프러스텀)도 월드 스크롤을 따라감 — 라이트 방향은 불변, 프러스텀만 동행
        if (this.sun.userData.baseX !== undefined) this.sun.position.x = this.sun.userData.baseX + this.worldX;
        this.sun.target.position.x = this.worldX;
        for (const mt of this.mountains) mt.position.x = mt.userData.baseX + this.worldX;
        for (const h of this.hills) h.position.x = h.userData.baseX + this.worldX;
        if (this.skyDome) this.skyDome.position.x = this.worldX;
        if (this.haze) this.haze.position.x = this.worldX;
        if (this.clouds) {
            for (const cl of this.clouds) {
                cl.userData.baseX += cl.userData.speed * dt;
                if (cl.userData.baseX > 40) cl.userData.baseX = -40;
                cl.position.x = cl.userData.baseX + this.worldX;
            }
        }
        if (this.embers) {
            for (const e of this.embers) {
                e.userData.baseY += e.userData.rise * dt;
                const groundY = this.heightAt(e.userData.baseX, e.userData.baseZ);
                if (e.userData.baseY > groundY + 2.2) e.userData.baseY = groundY + 0.1;
                e.position.set(
                    e.userData.baseX + this.worldX + Math.sin(this._clock * 0.5 + e.userData.phase) * 0.25,
                    e.userData.baseY,
                    e.userData.baseZ
                );
                e.material.opacity = 0.55 + Math.sin(this._clock * 3 + e.userData.phase) * 0.3;
            }
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
                this.disposeTree(pr.mesh);
                this.scene.remove(pr.mesh);
                this.projectiles.splice(i, 1);
            }
        }
        // 카메라: 플레이어 전진을 따라감 + 셰이크 (camLock = 검증 스크립트용 고정 훅)
        if (this.camLock) {
            this.camera.position.copy(this.camLock.pos);
            this.camera.lookAt(this.camLock.look);
        } else if (this.shakeMag > 0.001) {
            this.camera.position.set(
                0.15 + this.worldX + U.rand(-1, 1) * this.shakeMag,
                3.7 + U.rand(-1, 1) * this.shakeMag * 0.6,
                8.2
            );
            this.shakeMag *= Math.pow(0.001, dt); // 감쇠
        } else {
            this.camera.position.set(0.15 + this.worldX, 3.7, 8.2);
        }
        this.renderFrame(); // 블룸+비네트 포스트 스택 경유 (모바일은 직접 렌더 폴백)
    },
};
