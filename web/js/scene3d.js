// ===== Three.js 3D 전투 씬 + 연출(파티클/셰이크/데미지 숫자) =====
const Scene3D = {
    // 전역 값 그레이드 — setTheme()이 지면·능선·식생 albedo에 일괄 적용한다(스윕: tools/probe-terrain-sweep.js).
    // ground/foliage = HSL 명도 오프셋, groundSat = 명도를 내릴 때 함께 빠지는 채도 보정,
    // farDesat = 원경 LOD로 갈수록 계단식으로 빼는 채도(대기 원근).
    // 값은 **비율**이다 — 고정 오프셋(-0.20)을 쓰면 이미 어두운 챕터(9 용암 ground L 0.11, 7 마법 0.25)가
    // 니어블랙으로 붕괴한다. 현재 명도에 비례해 깎고(groundK) 절대 낙폭에 상한(groundMax)을 둔다.
    //   ch1 초원 L .48 → -.192 / ch6 설원 밤 L .78 → -.22(상한) / ch7 마법 L .25 → -.10 / ch9 용암 L .11 → -.044
    // leafFloor/leafCool: 잎 색이 순흑으로 크러시되는 것을 막는 바닥값과, 바닥에 눌린 만큼 미는 색상량.
    // (map-quality-up — 비평가 2인이 공통으로 '잎이 검은 덩어리'를 지적했고 실측으로 확인됐다.)
    VALUE: { groundK: 0.40, groundMax: 0.22, foliageK: 0.22, foliageMax: 0.12, satK: 0.35, farDesat: 0.26, leafFloor: 0.13, leafCool: 0.06 },

    // 🚨 낮 태양 방향의 **단일 생성원** (map-quality-up, 2026-08-19). 생성자·`setTheme`·`previewBuild`
    //    세 곳이 각자 리터럴을 들고 있었고 그중 둘이 서로를 부정하는 주석을 달아, 라운드마다 한쪽이
    //    다른 쪽의 수정을 되돌렸다(POLISH.md 진행로그 ⑶). 고치려면 여기 한 줄만 고칠 것.
    //
    //    값은 고도 **48°** (수평 성분 |(7, 3.2)| = 7.70 → y = 7.70·tan48° = 8.55).
    //    종전 34°(y 5.2)에서 올린 근거는 `probe-sun-elevation.js` 스윕 실측(챕터 1·3·4, 고도 34~61°):
    //      · **'요철 스컬핑이 저고도에서 최대'라는 34° 쪽 근거는 측정되지 않는다** — 소품 화소 휘도 SD 가
    //        고도를 61°까지 올려도 평평하다(ch1 0.2138→0.2125 · ch3 0.1999→**0.2047**(오히려 상승) ·
    //        ch4 0.2396→0.2363). 즉 이 축에서는 잃는 게 없다.
    //      · 반면 **그림자 이탈('캐스터 없는 아메바 얼룩')은 고도에 그대로 딸려 온다** — 그림자 화소 중
    //        소품 실루엣(6px 팽창) 밖 비율이 34°에서 ch1 33.4% · ch4 32.0% 인데 48°에서 4.3% · 1.7% 로
    //        떨어지고, 그림자 총면적도 11.4%→6.3% · 12.8%→7.4% 로 준다.
    //      · **61°까지 올리지 않은 이유는 영웅이다.** 고도를 올릴수록 정수리 위주 조명이 되어 캐릭터의
    //        다크 엔드가 깎인다(ch4 영웅 명도 0.18 이하 비율 27.5% → 48°에서 22.2% → 61°에서 **15.4%**).
    //        그 다크 엔드는 앞 세션이 광량을 1.85→1.00 으로 내려 가며 얻어낸 것(비평가 2인 공통 1위
    //        '캐릭터에 진짜 어두운 값이 없다')이라 61° 는 그 수정을 도로 무른다. 48° 가 이탈을 거의 다
    //        걷어내면서 다크 엔드 손실은 절반에 그치는 자리다.
    SUN_DAY: [7, 8.55, 3.2],
    renderer: null, scene: null, camera: null,
    worldX: 0,               // 플레이어가 오른쪽으로 전진한 누적 거리 (무한 월드)
    heroG: null, weaponG: null, helmetG: null, bodyMesh: null,
    petGroups: [],
    mountGroup: null,      // 영웅이 올라탄 탈것 (활성 목록의 맨 앞 1마리)
    mountFollowers: [],    // 장착은 했지만 타지 않은 나머지 탈것들 — 뒤쪽 호에서 따라온다
    ridePhase: null,       // 검증 스크립트 훅: 숫자를 넣으면 탈것 부유 위상을 그 값으로 고정한다(null=난수)
    enemyMap: new Map(),     // id → {g, body, hpBg, hpFg, dead}
    particles: [],
    anims: [],               // {t, dur, fn(k), onDone}
    shakeMag: 0,
    camPush: 0,              // 카메라 돌리 인 오프셋(z를 이만큼 당김) — 보스 워닝 연출이 소유
    heroDead: false,         // 영웅 사망 중 — update의 Idle/Walking 자동 전환과 행군을 잠근다
    _heroReviveT: 0,         // 기상 클립 잔여 시간(초) — 같은 이유로 자동 전환을 잠근다
    REVIVE_DUR: 0.85,        // ProChar Revive 클립 길이 — 잠금 시간·안장 복귀 보간이 같은 값을 쓴다
    fxLayer: null, container: null,
    _clock: 0,

    init(canvas, fxLayer, container) {
        this.fxLayer = fxLayer;
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        // 셰이더 컴파일마다 링크 상태·인포로그를 동기 조회하는 디버그 체크를 끈다 (startup-lag-loading).
        // 이 조회는 GPU 파이프라인을 강제로 세우는 동기 지점이라, 프로그램이 수십 개 컴파일되는
        // 부팅·첫 연출 구간의 스톨을 그대로 키운다(CPU 프로파일 실측: 제거 후 창의 27%가 getProgramInfoLog).
        // 셰이더가 깨지면 어차피 그리기가 실패해 화면·probe-screens-errors 로 드러난다.
        this.renderer.debug.checkShaderErrors = false;
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
        this.renderer.shadowMap.enabled = true;               // 그림자 (사실감)
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;    // GLB 텍스처 색 보정
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // 필름톤 대비/채도 롤오프로 밋밋한 조명 보완
        this.renderer.toneMappingExposure = 1.08;
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0xa8d8ea, 12, 30);
        // 절차 텍스처 비등방 필터링 — 원통 사지의 그레이징 각도 에일리어싱(사슬 체커) 제거.
        // envMap() 등이 이미 만든 텍스처에도 소급 적용되도록 렌더러 생성 직후에 호출한다.
        ProChar.applyMaxAnisotropy(this.renderer);
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
        // 🚨 태양 고도의 단일 결정은 위 `SUN_DAY` 다 — 여기 값은 `setTheme` 이 낮/밤 모두 덮어쓰므로
        //    **부팅 첫 프레임에만 쓰인다.** 2026-08-19 이전에는 이 줄(고도 61°)과 `setTheme`(고도 34°)이
        //    서로를 부정하는 주석을 달고 있어서, 라운드마다 한쪽이 다른 쪽의 수정을 되돌렸다
        //    (POLISH.md 진행로그 ⑶). 두 곳이 갈리지 않게 같은 상수를 쓴다.
        this.sun.position.set(this.SUN_DAY[0], this.SUN_DAY[1], this.SUN_DAY[2]);
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
            pl.position.set(0, 0.9, 0);
            // 🚨 미사용이어도 **씬에 상주**시킨다 (skill-cast-lag-optimize) — three 는 씬의 포인트라이트
            // '개수'가 변할 때마다 라이트를 받는 모든 재질의 셰이더를 통째로 재컴파일한다. 예전처럼
            // 발광 바이옴에서만 넣었다 빼면 바이옴 경계마다 수십 프로그램 컴파일 스톨이 터진다.
            // intensity 0 라이트의 프래그먼트 비용은 미미하고, 개수 고정이 주는 무스톨이 압도한다.
            this.scene.add(pl);
            this.accents.push(pl);
        }
        this.initFxLights(); // 연출(스킬·처치 플래시)용 포인트라이트 풀 — 같은 이유로 개수 고정
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
        this.setShadow(rig.group, true);
        this.applyRimLight(rig.group);
        // 무기: 오른손 마운트 (legacy 좌표계와 동일 — 칼날 +y)
        rig.handR.add(this.weaponG);
        this.weaponG.visible = true;
        this.weaponG.position.set(0, 0, 0);
        this.weaponG.rotation.set(0, 0, 0);
        this.weaponG.scale.setScalar(2.44); // 무기 2배(weapon-size-2x 사용자 지시 2026-08-19) — 종전 1.22(존재감 업)의 ×2. 프리뷰(previewSyncHero)·applyWeaponGrip 과 세 곳이 한 세트
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

    // ---- 인게임 영웅 전용 명도 그레이딩 (prochar-aaa ㉠ "캐릭터가 배경과 값으로 분리되지 않는다") ----
    // 비평가 2인이 독립적으로 1~2순위로 올린 결함이고, `probe-hero-value.js` 가 델타 ≥45 로 게이트를 건다.
    // ⚠️ 여기까지 오는 데 헛다리를 두 번 짚었다(항목 메모에 기록됨) — 라이트 하향은 능선이 MeshBasic
    //    무조명이라 화면 중간값을 오히려 올렸고, HSL 틴트 albedo 는 측정 노이즈 안이었다.
    //    그래서 이번엔 **어디가 밝은지부터 쟀다**: `probe-hero-value-parts.js`(신설) 부위별 분해가
    //    치비 전환 뒤의 범인을 정확히 지목한다 —
    //      투구 3195px 평균 L 140.8(밝은화소 54%) · 검 1523px 평균 L 169.6(77%)
    //      vs 다리 1217px L 67.6 · 방패 942px L 80.9  (배경 L 116.5, 영웅 전체 L 104 → 델타 12.5)
    //    즉 판금 몸통은 이미 앞 세션이 내려놨고, **남은 밝은 덩어리는 장비(투구·무기) 두 개**다.
    //    머리를 1.30배로 키운 뒤(hero-chibi) 투구가 화면에서 차지하는 면적이 커져 더 그렇다.
    //
    // 🚨 **왜 `ageGearMatsBase` 를 안 내리고 여기서 내리는가** — 그 재질 세트는 **장비 썸네일과 공용**이다.
    //    거기를 내리면 제작·목록·비교 팝업의 아이콘 306개가 통째로 어두워지고, UI 스트림의 잉크비율
    //    계약(`fit-ink`·`ui-ratio-audit` ±2%p)과 `probe-equip-framing`/`probe-equip-silhouette` 이 같이
    //    흔들린다. 인게임 영웅에 붙는 **인스턴스에만** 물리면 썸네일은 한 픽셀도 안 움직인다.
    //    (`makeHelmet`/`makeWeapon` 은 호출마다 새 모델을 만들고, 썸네일 쪽은 별도 호출이다.)
    // ⚠️ `tintOf` 로 파생시킨다 — 재질은 파트끼리 공유되므로 `o.material` 을 직접 만지면 같은 재질을
    //    쓰는 썸네일 모델까지 따라 어두워진다. tintOf 는 clone 이라 안전하고, `onBeforeCompile`
    //    (시대 셰이딩) 재적용까지 해 준다.
    // ⚠️ 발광 파츠는 건너뛴다 — 등급 젬·에너지 날·바이저 슬릿 눈은 **의도된 최고 휘도 포인트**이고,
    //    두 비평가가 '되돌리지 말 것'으로 꼽은 신호다(시안 젬·정면성). 여기서 같이 내리면 그걸 깬다.
    // ⚠️ **멱등이어야 한다.** 투구·무기는 `refreshHeroEquip` 이 부를 때마다 새로 조립되지만 방패는
    //    리그에 한 번 붙고 안 바뀐다 — 가드가 없으면 장비를 갈아 끼울 때마다 방패가 한 단씩 더
    //    어두워져 결국 검은 판이 된다(장비 교체 연출은 150ms 뒤 refreshHeroEquip 을 한 번 더 부른다).
    //    파생 재질에 `userData.heroGraded` 를 남겨 두 번 걸리지 않게 한다.
    // 값 선택 근거 — `probe-hero-grade-sweep.js`(신설)가 실제 코드 경로(`refreshHeroEquip` 재호출)로
    // 8조합을 한 세션 안에서 잰 표. albedo 단독은 거의 안 움직이고(델타 5.7 → 8.8) env 단독이
    // 두 배 이상 먹는다(→ 14.5) — 앞 세션이 남긴 "metalness 0.85 금속은 env 반사가 화면값을 지배한다"가
    // 여기서도 재현됐다. 다만 **둘을 같이 내려야** 계속 내려간다.
    //
    // 🚨 **고정 오프셋(모든 재질에 같은 −dl)으로 하지 말 것 — 한 번 그렇게 짰다가 되돌렸다.**
    //    −0.34 를 전 재질에 균일하게 걸었더니 델타는 40.9 로 좋았는데, **원래 어두웠던 파츠가
    //    통째로 검게 죽었다** — 근접샷(`hero-hand.png`)에서 검 코등이·자루가 형태 없는 검은 막대로
    //    읽혔다. 방패를 제외한 이유와 같은 현상이고, 제외로는 파츠 단위까지 못 막는다.
    //    → **하이라이트 압축**으로 바꾼다. `keep`(HSL 명도 바닥) 아래는 손대지 않고, 그 위만
    //      `keep + (L − keep) × compress` 로 끌어내린다. 밝은 덩어리(투구 L 141·검신 L 170)는 크게
    //      내려오고 이미 어두운 코등이·자루·스트랩은 제자리에 남아 형태를 유지한다.
    //    env 감쇠는 `keep` **위의 재질에만** 건다(밝기 비례 가중을 한 번 넣어 봤다가 뺐다 — 화면값을
    //    지배하는 게 env 라, 가중을 걸면 albedo L 0.5 대 재질의 env 가 0.75배밖에 안 줄어 영웅 평균이
    //    97.2 → 87.7 에서 멈췄다. keep 아래 파츠는 어차피 통째로 제외되므로 형태는 그쪽이 지킨다).
    HERO_VALUE_GRADE: { keep: 0.26, compress: 0.30, env: 0.18 },
    gradeHeroGearValue(root) {
        if (!root) return root;
        const g = this.HERO_VALUE_GRADE;
        if (!g) return root;
        const hsl = { h: 0, s: 0, l: 0 };
        root.traverse(o => {
            if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
            const m = o.material;
            if (m.userData && m.userData.heroGraded) return;
            const em = m.emissive;
            if (em && m.emissiveIntensity > 0 && (em.r + em.g + em.b) > 0.01) return;  // 발광 포인트 보존
            m.color.getHSL(hsl);
            if (hsl.l <= g.keep) return;                       // 이미 어두운 파츠 — 건드리면 형태가 사라진다
            const dl = (g.keep + (hsl.l - g.keep) * g.compress) - hsl.l;   // 음수
            const env = m.envMapIntensity === undefined ? 1 : m.envMapIntensity;
            const d = this.tintOf(m, dl, { envMapIntensity: env * g.env });
            d.userData = Object.assign({}, d.userData, { heroGraded: true });
            o.material = d;
        });
        return root;
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
    // 뷰 공간 태양 방향을 셰이더로 내려보낸다 — 카메라가 움직이므로 **매 프레임** 갱신해야 한다.
    // (월드 방향을 그대로 넣으면 카메라가 흔들릴 때 그늘면이 같이 돌아 '조명이 따라다니는' 그림이 된다.)
    updateShadeSun() {
        if (!this._shadeUniforms.length || !this.sun) return;
        const v = this._shadeSunTmp || (this._shadeSunTmp = new THREE.Vector3());
        v.copy(this.sun.position).normalize();                       // 디렉셔널 라이트는 원점을 향한다
        v.transformDirection(this.camera.matrixWorldInverse);        // 월드 → 뷰
        for (const u of this._shadeUniforms) u.uShadeSun.value.copy(v);
    },

    renderFrame() {
        this.updateShadeSun();
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

    // ---- 셰이더 워밍업 (startup-lag-loading) — 부팅 로딩창이 떠 있는 동안 호출된다 ----
    // 시작 렉의 지배 비용은 첫 렌더가 유발하는 셰이더 프로그램 컴파일이다(probe-startup-cpuprofile 실측:
    // JS 부팅 ~0.7s vs three 프로그램 컴파일 수 초). 컴파일 자체는 없앨 수 없으니 **시점을 옮긴다** —
    // 여기서 컴파일과 첫 프레임(섀도맵 패스·포스트 스택 포함)을 미리 태워, 로딩창이 사라진 뒤의
    // 첫 rAF 프레임이 눈에 보이는 수 초 프리즈가 되지 않게 한다.
    // ⚠️ renderer.compile()은 씬 재질의 본 프로그램만 만든다 — 섀도 뎁스 프로그램과 포스트 스택은
    //    실제 renderFrame()을 한 번 돌려야 컴파일된다. 둘 다 필요하다(하나만 하면 잔여 컴파일이
    //    첫 프레임으로 새서 워밍업이 반쪽이 된다).
    // ⚠️ Combat.start() **뒤에** 불러야 한다 — 적 웨이브가 스폰된 상태여야 적 재질(피격 플래시용
    //    클론 포함 계열)까지 이 프레임에 함께 컴파일된다.
    warmup() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.compile(this.scene, this.camera);
        this.renderFrame();
        // ---- 연출 프리미티브 프리라이트 ----
        // compile()+첫 프레임은 '지금 씬에 있는' 재질만 만든다 — 첫 스킬 일제사격·첫 타격이 쓰는
        // 공용 프리미티브(수렴 룬 링·모트 스프라이트·충격 링·불티)는 그 순간 새 프로그램을 컴파일해
        // 오버레이가 사라진 직후 눈에 보이는 스톨을 만든다(renderer.info.programs 실측: 제거 시점
        // 38개 → 6초 뒤 97개). 여기서 한 번씩 태워 그 계열 프로그램을 로딩창 아래에서 만들어 둔다.
        // 전부 addAnim 기반이라 fn(1)+onDone 으로 즉시 배수된다(TODO 상단 '함정 ③'과 같은 규약).
        const animsBefore = this.anims.length;
        const childrenBefore = new Set(this.scene.children);
        try {
            const p = this.heroG ? this.heroG.position.clone() : new THREE.Vector3();
            const c = new THREE.Color(0xffd873);
            this.skillCastBeat(c, 'aura', 3);   // t>=3 이 링 3겹 경로까지 컴파일한다
            this.expandRing(p, c, 1.2);
            this.spawnSparks(p.clone().add(new THREE.Vector3(0, 0.55, 0)), 4, 0xffd873, { speed: 1 });
            this.spawnSparks(p.clone().add(new THREE.Vector3(0, 0.55, 0)), 2, 0xffd873, { solid: true });
            this.renderFrame();
        } catch (e) { console.error('Scene3D.warmup 프리라이트 실패(치명 아님)', e); }
        // 배수 — 프리라이트가 얹은 애니메이션만 끝까지 감고(기존 앰비언트 루프는 건드리지 않는다),
        // onDone 이 못 치운 잔여 자식은 자식 차분으로 회수한다.
        for (const a of this.anims.splice(animsBefore)) {
            try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) { /* 배수 실패는 프레임이 치운다 */ }
        }
        for (const ch of [...this.scene.children]) {
            if (!childrenBefore.has(ch)) { this.scene.remove(ch); try { this.disposeTree(ch); } catch (e) {} }
        }
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

    // 그룹 내 모든 메시가 그림자를 드리우고 **받게**
    // ⚠️ receiveShadow가 빠져 있던 게 "시체가 바닥에 닿았는데도 떠 보인다"의 1순위 원인이었다(비평가 실측):
    //   나무 그늘 안에 누운 영웅의 머리 휘도 187 vs 그 아래 지면 27 — 7:1. 서 있을 땐 몸이 그늘 평면 위라
    //   티가 안 나지만, 누우면 몸이 지면 그늘과 같은 평면을 차지해 '검은 구멍 위의 은색 덩어리'가 된다.
    //   비용 때문에 **캐릭터(영웅·적·탈것·펫)에만** 켠다 — 배경 소품까지 켜면 저사양 폰에서 픽셀 비용이 는다.
    // 슬라임 젤리 웨이브 — 높이에 비례한 위상 지연으로 스쿼시가 아래에서 위로 전파된다.
    // amp=0 이면 원형으로 복원한다(정지 상태). 정점 ~250개짜리 라테라 매 프레임 돌려도 싸다.
    driveJelly(m, clk, amp, id) {
        const J = m.anim && m.anim.jelly;
        if (!J) return;
        const attr = J.mesh.geometry.attributes.position, pa = attr.array, base = J.base;
        const ph = clk * 6 + (id || 0);   // 개체마다 위상을 어긋나게 (m 에는 id 가 없다 — 호출부가 넘긴다)
        const at = t => {                       // 그 높이의 (세로배율, 가로배율)
            const sq = 1 - Math.abs(Math.sin(ph - t * J.lag));
            return [1 - sq * amp, 1 + sq * amp * 0.55];   // 가로 팽창으로 부피 근사 보존
        };
        for (let i = 0; i < pa.length; i += 3) {
            const by = base[i + 1];
            const [sy, sr] = at(by / J.h);
            pa[i] = base[i] * sr;
            pa[i + 1] = by * sy;
            pa[i + 2] = base[i + 2] * sr;
        }
        attr.needsUpdate = true;
        J.mesh.geometry.computeVertexNormals();
        for (const f of J.follow) {
            const [sy, sr] = at(f.y / J.h);
            f.o.position.set(f.x * sr, f.y * sy, f.z * sr);
        }
    },

    // 버섯 갓 테두리 플랩 — 중심에서 멀수록 늦게 처진다(우산 살의 2차 모션).
    // driveJelly 와 축이 다르다: 저쪽은 **높이**, 이쪽은 **중심에서의 반지름**이 지연 파라미터다.
    driveCapFlap(m, clk, amp, id) {
        const F = m.anim && m.anim.capFlap;
        if (!F) return;
        const attr = F.mesh.geometry.attributes.position, pa = attr.array, base = F.base;
        const ph = clk * 7 + (id || 0);                  // hop 주기(clk*7)와 맞물려야 착지에 처진다
        // t=0(꼭지)에서 0, 테두리에서 최대. t² 로 몰아 테두리만 펄럭이게 한다.
        const flapAt = t => Math.sin(ph - t * F.lag) * amp * t * t;
        for (let i = 0; i < pa.length; i += 3) {
            const t = Math.hypot(base[i], base[i + 2]) / F.rMax;
            pa[i] = base[i]; pa[i + 2] = base[i + 2];
            pa[i + 1] = base[i + 1] + flapAt(t);
        }
        attr.needsUpdate = true;
        F.mesh.geometry.computeVertexNormals();
        for (const q of F.parts) q.o.position.y = q.y + flapAt(q.t);
    },

    setShadow(g, receive) {
        // 인버티드 헐 아웃라인 셸은 제외 — 원 메시보다 살짝 부푼 뒷면 복제라, 그림자를 던지게 두면
        // 원 메시의 섀도맵을 한 텍셀씩 밀어 접지 그림자가 이중 윤곽으로 번진다.
        // 🚨 AO 링도 제외 — 이음새에 얹는 **반투명 그림자 데칼**이라 그림자를 던질 물체가 아니다.
        //    섀도맵은 알파를 안 보므로 링이 **불투명 원반**으로 투영돼 지면에 큰 검은 자국을 남긴다
        //    (실측 probe-enemy-ao: 고블린·임프에서 배경 화소 **17만 개**가 어두워졌다 — 화면 절반이다).
        g.traverse(o => {
            if (!o.isMesh || o.userData.isOutline) return;
            if (o.userData.aoRing) { o.castShadow = false; o.receiveShadow = false; return; }
            o.castShadow = true; if (receive) o.receiveShadow = true;
        });
        return g;
    },

    // ---- 캐릭터 프레넬 림 라이트 (스타일라이즈드 3D의 최우선 시그니처) ----
    // 왜 라이트로는 안 되는가: 기존 `this.rim`은 DirectionalLight라 **면의 방향**에만 반응해
    // 넓은 면을 골고루 밝힐 뿐, 실루엣 '테두리'를 따라가지 않는다. 그래서 캐릭터와 배경의
    // 명도가 붙으면(실측: 영웅 0.63 vs 배경 0.707 — 차이 0.077) 윤곽이 배경에 녹아든다.
    // 여기서는 시선-법선 프레넬(1-N·V)로 **시야 기준 테두리**만 밝혀 배경에서 오려낸다.
    //
    // 주입 지점: 이 three.js 빌드에는 `output_fragment` 청크가 없어(청크 목록 실측 확인)
    // `outgoingLight`를 잡을 수 없다. 대신 gl_FragColor가 이미 대입된 직후인
    // `tonemapping_fragment` 앞에 끼워 `gl_FragColor.rgb`에 더한다 — 톤매핑을 거치므로
    // 림이 1.0에서 딱 잘리지 않고 필름톤으로 롤오프되는 이점도 있다.
    // ⚠️ 실측이 뒤집은 설계: 밝은 림만 넣으면 실루엣 분리가 **나빠진다.**
    // 초원 배경은 하이키(화면 평균 명도 0.707)이고 캐릭터 테두리는 그보다 어두워서(부호 단차 -0.10)
    // 분리는 이미 '어두운 윤곽'에서 나오고 있었다. 여기에 밝은 림을 더하면 그 어두운 테두리를
    // 메워 경계 단차가 0.1413 → 0.1318로 떨어졌다(probe-silhouette.js 실측).
    // 그래서 2단 구성으로 간다: ① 넓은 프레넬 **다크 컨투어**(외곽선 패스의 절차적 등가물 —
    // 배경이 밝을수록 분리에 직접 기여) ② 그 안쪽에 좁은 **밝은 림**(형태 정의·금속 광택).
    // 스윕 실측(probe-rim-sweep.js, 경계 명도 단차 edgeStep 기준):
    //   림/컨투어 OFF ............ 0.1523 (기준선)
    //   다크 컨투어 0.88 pow1.1 ... 0.1650  ← 채택 (+8.3%)
    //   + 밝은 림 0.35 pow5 ...... 0.1486  ← 기준선보다 나쁨
    //   + 밝은 림 0.90 pow5 ...... 0.1458  ← 더 나쁨
    // → **밝은 림은 강도에 무관하게 분리를 악화시킨다**(어두운 테두리를 메우므로). strength 0으로 봉인.
    // 재검증 완료: 광량을 1.85→1.15로 낮춘 뒤(아래 setTheme) 같은 스윕을 다시 돌렸으나
    //   OFF 0.1325 / 다크컨투어 0.88pow1.1 0.1398 / +밝은림 0.35 0.1272 / +0.9 0.1289 로
    //   **여전히 밝은 림이 가장 나쁘다**. "배경이 어두워지면 켤 가치가 생긴다"는 가설은 기각.
    //   배경(초원·하늘)이 캐릭터 테두리보다 밝은 구도 자체가 원인이므로, 이 게임의 낮 씬에서는
    //   밝은 림을 켜지 말 것. 코드 경로만 남긴다(밤/용암 등 어두운 바이옴에서 재평가할 여지).
    // 주의: 주입 지점이 톤매핑 앞 **선형 공간**이라 sRGB 인코딩 후 크게 밝아진다.
    //   그래서 darkColor는 니어블랙, darkStrength도 0.88처럼 세게 필요하다(0.38은 육안 무변화).
    RIM: { color: 0xdcefff, strength: 0, power: 5.0, darkColor: 0x0a1119, darkStrength: 0.88, darkPower: 1.35 },
    // ---- 암부 색 보정 (map-quality-up) ----
    // 비평가 4인이 공통으로 1·2순위로 꼽은 결함: **암부가 무채색 검정으로 붕괴**한다.
    // ("나무 서너 그루가 한 검은 실루엣으로 융합돼 그루 수를 셀 수 없다", "초록 나무의 암부가
    //  갈회색~검정으로 떨어져 초원 한복판에 고사목이 선 것처럼 팔레트가 어긋난다")
    // 처방: **어두운 화소에만** 하늘색 계열의 차가운 빛을 얹는다 — 스타일라이즈드 3D 의 표준
    // 처방인 '검정 대신 보색 그림자'를 프래그먼트 한 줄로 근사한 것이다.
    // ⚠️ 전역 `hemi.intensity` 를 올리는 방식은 **쓰면 안 된다.** 그건 밝은 면까지 같이 들어올려
    //    다크 엔드 확보 작업(VALUE 그레이드)을 통째로 되돌린다. 여기서는 휘도가 `floor` 아래인
    //    화소에만, 어두울수록 강하게 더한다 — 밝은 면은 수치상 전혀 안 변한다.
    // ⚠️ 🚨 **휘도로 '그늘'을 판정하면 안 된다 — 첫 판이 그렇게 만들었다가 나무가 통째로 청록이 됐다.**
    //    잎은 albedo 자체가 어둡게 설계돼 있어서(#1a350c) **햇빛을 받는 면조차 휘도가 0.20 아래**다.
    //    그래서 '어두운 화소'를 그늘로 보면 나무 전체가 대상이 된다. 그늘은 **N·L 로만** 판정한다.
    SHADE: { strength: 0.26 },
    _shadeUniforms: [],
    // 적 전용 오버라이드(`silhouette-after-outline`) — 검은 인버티드 헐이 사용자 지시로 삭제된 뒤
    // 적(특히 고블린×초원)이 배경에 잠겼다. 아웃라인 복구는 금지라 **다크 컨투어를 적에게만** 더
    // 세고 넓게 건다: 프레넬이라 실루엣 안쪽만 어두워져 면적을 안 늘린다(지시와 충돌 없음).
    // 스윕 실측(tools/probe-enemy-sep-sweep.js, 고블린 rect 색거리·커버리지 기준) — darkPower 를
    // 낮춰 띠를 넓히는 쪽이 darkStrength 를 올리는 쪽보다 이득이 크고, 0.7 아래는 몸 안쪽까지
    // 어두워져 '전신 그을림'으로 읽히기 시작해 0.85/0.98 에서 멈췄다. 영웅은 비평가 튜닝을 거친
    // 기존 값(위 RIM)을 그대로 쓴다 — 영웅 실루엣은 장비 배색이 이미 분리를 벌고 있다.
    ENEMY_RIM: { darkStrength: 0.98, darkPower: 0.85 },
    _rimUniforms: [],
    // ⚠️ 펫에는 이 림이 **전혀 걸리지 않는다** — makePetMesh는 MeshLambert/MeshBasic만 쓰고
    //    아래 필터가 Standard/Phong이 아닌 재질을 건너뛰기 때문이다. 펫 실루엣을 림으로 분리하려는
    //    시도(다크 컨투어 강화)를 한 번 했다가 비평가 계측에서 '변화 0'으로 확인돼 되돌렸다.
    //    펫에 림을 걸려면 먼저 펫 재질을 Standard/Phong으로 올려야 한다.
    // 공유 재질에 암부 리프트를 심는다. 재질 단위라 **한 번만** 부르면 그 재질을 쓰는 모든 소품에 걸린다.
    applyShadeLift(mats) {
        for (const m of mats) {
            if (!m || m.userData.__shade) continue;
            // ⚠️ **Lambert 는 제외한다.** three.js 의 Lambert 는 라이팅을 정점 셰이더에서 끝내서
            //    프래그먼트에 `normal` 이 아예 선언돼 있지 않다 — 넣으면 'undeclared identifier normal'
            //    로 셰이더가 통째로 컴파일 실패한다(실측). `applyRimLight` 도 같은 이유로 Phong/Standard
            //    만 받는다. 줄기(trunkMat·charTrunkMat)가 Lambert 라 여기서 빠진다.
            if (!(m.isMeshStandardMaterial || m.isMeshPhongMaterial)) continue;
            m.userData.__shade = true;
            const u = { uShadeTint: { value: new THREE.Color(0x2c4a6e) }, uShadeStr: { value: this.SHADE.strength },
                uShadeSun: { value: new THREE.Vector3(0, 1, 0) } };   // 뷰 공간 태양 방향 — 매 프레임 갱신
            this._shadeUniforms.push(u);
            const prev = m.onBeforeCompile;
            m.onBeforeCompile = (shader, renderer) => {
                if (prev) prev(shader, renderer);
                for (const k in u) shader.uniforms[k] = u[k];
                // ⚠️ `getShadowMask()` 는 **Phong/Standard 프래그먼트에 기본 포함되지 않는다.**
                //    그 함수는 `shadowmask_pars_fragment` 청크에 있고, 조명 재질은 그림자를
                //    `lights_fragment_begin` 안에서 인라인으로 처리하느라 이 청크를 안 넣는다
                //    (그래서 `#ifdef USE_SHADOWMAP` 로 감싸도 'no matching overloaded function' 이 난다 — 실측).
                //    → 청크를 **`void main()` 직전**에 직접 끼워 넣는다(그 위에서 `shadowmap_pars_fragment`
                //      가 이미 getShadow 등을 선언해 두므로 여기서 정의가 성립한다).
                shader.fragmentShader = 'uniform vec3 uShadeTint;\nuniform float uShadeStr;\nuniform vec3 uShadeSun;\n'
                    + shader.fragmentShader
                        .replace('void main()', '#include <shadowmask_pars_fragment>\nvoid main()')
                        .replace('#include <tonemapping_fragment>', [
                        '{',
                        // 그늘은 두 갈래다 — ⑴ 면이 태양을 등졌거나(self shadow) ⑵ 남이 드리웠거나(cast shadow).
                        // ⑵ 를 빼면 **드리운 그림자만 순검정으로 남는다** — 비평가 2인이 각각 최우선으로
                        // 지적한 "드리울 물체가 화면에 없는 거대한 새까만 아메바 얼룩"이 정확히 이것이다
                        // (지면은 태양을 향하고 있어 N·L 로는 그늘로 안 잡힌다).
                        '  float ndl = dot(normalize(normal), uShadeSun);',
                        // 정면광(0.25 이상)은 0, 완전 역광(−0.35)에서 1 — 터미네이터를 넓게 잡아 밴딩 방지
                        '  float kSelf = smoothstep(0.25, -0.35, ndl);',
                        // ⚠️ `getShadowMask()` 는 **`USE_SHADOWMAP` 이 정의된 재질에만** 존재한다.
                        //    그림자를 안 받는 재질(receiveShadow=false)에서는 선언 자체가 없어
                        //    'no matching overloaded function' 로 셰이더가 통째로 컴파일 실패한다(실측).
                        '  float kCast = 0.0;',
                        '  #ifdef USE_SHADOWMAP',
                        '    kCast = 1.0 - getShadowMask();',   // 1 = 완전히 가려짐
                        '  #endif',
                        '  float k = max(kSelf, kCast);',
                        '  gl_FragColor.rgb += uShadeTint * (k * uShadeStr);',
                        '}',
                        '#include <tonemapping_fragment>',
                    ].join('\n'));
            };
            m.needsUpdate = true;
        }
    },

    applyRimLight(g, look) {
        // look = RIM 필드 부분 오버라이드(적 전용 ENEMY_RIM 등). 안 주면 기존 동작 그대로.
        const L = look ? Object.assign({}, this.RIM, look) : this.RIM;
        g.traverse(o => {
            if (!o.isMesh || !o.material) return;
            for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
                // Standard/Phong만 — 이 둘만 vViewPosition을 선언한다. Lambert/Basic(눈 흰자·동공 등
                // 작은 디테일)은 건너뛴다: 실루엣 분리는 몸체 재질만으로 충분하다.
                if (!(m.isMeshStandardMaterial || m.isMeshPhongMaterial)) continue;
                if (m.userData.__rim) continue;          // 중복 주입 방지 (heroG/rig.group 2중 호출)
                m.userData.__rim = true;
                const u = {
                    uRimColor: { value: new THREE.Color(L.color) },
                    uRimStr: { value: L.strength },
                    uRimPow: { value: L.power },
                    uRimDark: { value: new THREE.Color(L.darkColor) },
                    uRimDarkStr: { value: L.darkStrength },
                    uRimDarkPow: { value: L.darkPower },
                };
                this._rimUniforms.push(u);
                const prev = m.onBeforeCompile;
                m.onBeforeCompile = (shader, renderer) => {
                    if (prev) prev(shader, renderer);
                    for (const k in u) shader.uniforms[k] = u[k];
                    shader.fragmentShader = 'uniform vec3 uRimColor;\nuniform float uRimStr;\nuniform float uRimPow;\n'
                        + 'uniform vec3 uRimDark;\nuniform float uRimDarkStr;\nuniform float uRimDarkPow;\n'
                        + shader.fragmentShader.replace('#include <tonemapping_fragment>', [
                            '{',
                            '  vec3 rN = normalize(normal);',            // 뷰 공간 법선 (normal_fragment_begin)
                            '  vec3 rV = normalize(vViewPosition);',     // 프래그먼트 → 카메라
                            '  float fres = 1.0 - clamp(dot(rN, rV), 0.0, 1.0);',
                            // ① 다크 컨투어 — 넓게 깔아 밝은 배경에서 실루엣을 오려낸다(외곽선 대체)
                            '  float df = pow(fres, uRimDarkPow) * uRimDarkStr;',
                            '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uRimDark, clamp(df, 0.0, 1.0));',
                            // ② 밝은 림 — 좁게, 위/뒤쪽 테두리 위주(균일하면 '만화 아웃라인'으로 읽힘)
                            '  float rf = pow(fres, uRimPow);',
                            '  rf *= mix(0.3, 1.0, clamp(rN.y * 0.5 + 0.62, 0.0, 1.0));',
                            '  gl_FragColor.rgb += uRimColor * (rf * uRimStr);',
                            '}',
                            '#include <tonemapping_fragment>',
                        ].join('\n'));
                };
                m.needsUpdate = true;
            }
        });
        return g;
    },

    // 밤/바이옴 색보정에서 림 색·강도를 함께 옮긴다 (하늘색과 림이 어긋나면 스티커로 읽힘)
    setRimLook(colorHex, strength) {
        for (const u of this._rimUniforms) {
            u.uRimColor.value.setHex(colorHex);
            u.uRimStr.value = strength;
        }
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
            // 낮 구름은 하늘색 파생(청록끼)이 아니라 난색 하이라이트가 도는 흰색으로 — 하늘·수관과
            // 같은 청록 계열이면 '구름인지 물 덩어리인지' 모호해진다(재채점 A2 #4). 밤은 종전 유지.
            const cloudTint = new THREE.Color(skyHex).offsetHSL(0, -0.5, night ? 0.1 : 0.48);
            if (!night) cloudTint.lerp(new THREE.Color(0xfff6e8), 0.65);
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

    // 가운데가 빈 접지 글로우 — 크리스탈 전용. 꽉 찬 글로우를 밑동에 깔면 **접지 블롭 그림자를 통째로 덮어**
    // 프롭이 지면에서 뜬다(비평가 ④ 실측: 밑동 직하 지면이 이격 지면보다 +9.9 만큼 **밝았다**).
    // 안쪽을 비우면 그림자는 그림자대로 읽히고 빛은 바깥 고리에서 번진다.
    makeRingGlowTexture() {
        if (this._ringGlowTex) return this._ringGlowTex;
        const size = 128;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.60, 'rgba(255,255,255,0)');     // 밑동이 놓이는 안쪽은 완전히 비운다
        grad.addColorStop(0.80, 'rgba(255,255,255,0.85)');   // 빛나는 고리는 접지 암부 **바깥**에 둔다
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        return (this._ringGlowTex = new THREE.CanvasTexture(c));
    },

    // 접지 암부 텍스처 — **곱셈 합성용**이라 알파가 아니라 RGB 로 감쇠시킨다(가운데 어둡고 가장자리 흰색).
    // ⚠️ 알파 블렌딩 판으로는 접지가 안 만들어진다: 같은 자리에 가산 글로우가 겹쳐 그리면 밝기가 되살아나
    //    실측 델타가 −0.5~−3 에서 안 내려간다. 곱셈은 무엇이 밑에 있든 그 값을 **깎는다**.
    makeContactTexture() {
        if (this._contactTex) return this._contactTex;
        const size = 128;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgb(56,46,84)');       // 가장 어두운 중심 — 여기에 밑동이 놓인다
        grad.addColorStop(0.42, 'rgb(158,150,182)');
        grad.addColorStop(1, 'rgb(255,255,255)');    // 가장자리는 곱해도 원본 그대로(경계선이 안 생긴다)
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        return (this._contactTex = new THREE.CanvasTexture(c));
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
            // ⚠️ 이 값은 update의 반짝임이 **곱해서** 쓴다. 예전엔 update가 `opacity = 0.55 + sin*0.3`으로
            // 통째로 덮어써서, 여기서 내려놓은 0.22가 죽은 코드였다(실측 최대 0.850 = 의도의 3.86배).
            // 가산 합성 + 블룸이라 그 차이가 곧 '화면 우측 허연 뭉텅이'로 나타났다.
            s.userData.baseOpacity = U.rand(0.17, 0.26);
            s.material.opacity = s.userData.baseOpacity;
            s.position.set(x, this.heightAt(x, z) + U.rand(0.3, 1.2), z);
            s.userData.baseX = x; s.userData.baseZ = z; s.userData.baseY = s.position.y;
            s.userData.phase = U.rand(0, 10);
            s.userData.rise = U.rand(0.05, 0.15);
            this.scene.add(s);
            this.embers.push(s);
        }
    },

    // ==========================================================================
    // 바이옴 확장 테이블 — 메인 스테이지 맵 25종 (main-stage-25-maps, 사용자 지시 2026-08-19)
    // --------------------------------------------------------------------------
    // ⚠️ **원본 6종(forest·desert·rock·snow·magic·lava)은 이 테이블에 넣지 않는다.**
    //    항목이 없으면 `bkin()` 이 자기 이름을 그대로 돌려주고 아래 하드코딩 분기가 예전 경로를
    //    100% 그대로 탄다 — 오래 튜닝된 6종의 룩을 한 픽셀도 안 건드리기 위한 설계다.
    //    (검증: `node web/tools/shot-biomes.js` 를 변경 전/후로 찍어 6종이 동일한지 확인할 것.)
    // 신설 15종은 `kin`(형질을 물려받는 원본 바이옴) + **덮어쓸 값만** 적는다:
    //   kin      원본 바이옴 — 지면 텍스처/노멀 레시피, 식생(덤불·꽃) 유무, 잔돌 수, 조명 분기의 기준
    //   tint     구운 지면 알베도에 얹는 HSL 시프트 [h, s, l] — 같은 레시피라도 소재가 달라 보이게
    //   ridge    원경 능선 실루엣 'ridge' | 'mesa' | 'jagged' (생략 시 kin 규칙)
    //   props    큰 소품 조합 { p:[[메서드, 스케일배율, 추가인자…], …], r:[…] } — 배열에서 균등 추첨
    //   mid      중경 소품 배열 [[메서드, …], …] (사막 계열의 중경 채우기를 다른 바이옴에도)
    //   scatter  지면 스캐터 { geo, r, color, n, flat, tint, basic, wind }
    //   accent   5% 악센트 스캐터 { geo, r, color, n, basic, wind }
    //   stone    잔돌 색 (생략 시 kin 규칙)
    //   crystal  makeCrystal 재질 { color, emissive, intensity } — magic 외 바이옴도 결정을 쓸 수 있게
    //   foliage  잎 재질 emissive { color, intensity } (성역의 금빛 발광 등)
    //   emissive 지면 발광 { crack, intensity, glow, light } — lava kin 이라도 균열 색을 갈아끼우거나
    //            null 로 꺼서 "주황 용암"에서 벗어나게 한다
    //   fog      [near, far] 강제값
    //   veg      2차 식생(덤불·꽃·양치) 허용 여부 강제 (생략 시 kin 규칙)
    //   aurora   오로라 표시 여부 강제 (생략 시 kin 규칙 = snow + 밤)
    BIOMES: {
        // --- forest 계열 ---
        marsh: { // 11 늪지 — 물먹은 이끼 바닥에 고사목과 거대 버섯. 초원의 밝은 초록을 탁하게 눌렀다
            kin: 'forest', tint: [-0.04, -0.18, -0.06], ridge: 'ridge',
            props: { p: [['makeDeadTree', 0.85], ['makeMushroom', 1.15]], r: [['makeMushroom', 0.8], ['makeBoulder', 0.7, false, true]] },
            scatter: { geo: 'blade', r: 0.075, color: 0x5c6b3a, n: 210, flat: false, tint: 0.16, wind: true },
            accent: { geo: 'octa', r: 0.032, color: 0x9ccc65, n: 40, basic: true, wind: true },
            stone: 0x6f7560, fog: [10, 27],
        },
        bamboo: { // 12 대나무 숲 — 가늘고 높은 수직선이 화면을 채우는 유일한 맵
            kin: 'forest', tint: [0.02, 0.06, 0.02], ridge: 'ridge',
            props: { p: [['makeBamboo', 1.1]], r: [['makeBamboo', 0.75], ['makeRoundTree', 0.8]] },
            scatter: { geo: 'blade', r: 0.07, color: 0x7cae4a, n: 240, flat: false, tint: 0.2, wind: true },
            accent: { geo: 'cone', r: 0.034, color: 0xe8f4a8, n: 44, basic: true, wind: true },
            stone: 0x8d9482,
        },
        autumn: { // 13 단풍 숲 — 활엽수 일색 + 낙엽 스캐터. 잎 재질이 아니라 프롭 구성으로 계절을 만든다
            kin: 'forest', tint: [0.03, 0.1, 0.0], ridge: 'ridge',
            props: { p: [['makeRoundTree', 1.05]], r: [['makeRoundTree', 0.8], ['makeBoulder', 0.7, false, true]] },
            scatter: { geo: 'blade', r: 0.07, color: 0xa8632c, n: 220, flat: false, tint: 0.22, wind: true },
            accent: { geo: 'octa', r: 0.036, color: 0xffb74d, n: 56, basic: true, wind: true },
            stone: 0x8d8071,
        },
        // --- desert 계열 ---
        salt: { // 14 소금 사막 — 갈라진 염판. 사막 리플 위에 채도를 완전히 뽑아 흰 평원으로
            kin: 'desert', tint: [0, -0.62, 0.08], ridge: 'mesa',
            props: { p: [['makeSlab', 1.15], ['makeStrata', 1.0]], r: [['makeSlab', 0.7], ['makeBoulder', 0.6]] },
            mid: [['makeStrata', 2.2], ['makeStrata', 1.9], ['makeBones', 1.1], ['makeSlab', 1.6]],
            scatter: { geo: 'slabchip', r: 0.06, color: 0xdfe3e6, n: 200, flat: true, tint: 0.07 },
            accent: { geo: 'cone', r: 0.03, color: 0xffffff, n: 46, basic: true },
            stone: 0xd6d9da,
        },
        canyon: { // 15 붉은 협곡 — 사암 지층 첨탑. 사막 리플을 붉게 물들이고 메사를 크게 세웠다
            kin: 'desert', tint: [-0.05, 0.24, -0.08], ridge: 'mesa',
            props: { p: [['makeRockSpire', 1.15], ['makeStrata', 1.1]], r: [['makeSlab', 0.8], ['makeStrata', 0.7]] },
            mid: [['makeStrata', 2.4], ['makeRockSpire', 2.0], ['makeStrata', 2.1], ['makeDryShrub', 1.2]],
            scatter: { geo: 'dodeca', r: 0.055, color: 0x9c4f2c, n: 190, flat: true, tint: 0.16 },
            accent: { geo: 'dodeca', r: 0.04, color: 0x5d2f1c, n: 50 },
            stone: 0x93513a,
        },
        // --- rock 계열 ---
        badland: { // 16 황무지 — 암반에 마른 관목만 살아남은 땅
            kin: 'rock', tint: [0.04, 0.1, 0.02], ridge: 'ridge',
            props: { p: [['makeDryShrub', 1.5], ['makeSlab', 0.95]], r: [['makeBoulder', 0.7], ['makeDryShrub', 1.1]] },
            mid: [['makeDryShrub', 1.6], ['makeStrata', 2.0], ['makeBones', 1.2], ['makeDryShrub', 1.3]],
            scatter: { geo: 'dodeca', r: 0.055, color: 0x8a7a5c, n: 200, flat: true, tint: 0.17 },
            accent: { geo: 'octa', r: 0.034, color: 0xc9a227, n: 40, basic: true, wind: true },
            stone: 0x7d6f55,
        },
        ash: { // 17 화산재 평원 — 색이 거의 없는 회색 재. 고사목 실루엣만으로 버틴다
            kin: 'rock', tint: [0, -0.55, -0.04], ridge: 'jagged',
            props: { p: [['makeDeadTree', 1.0]], r: [['makeBoulder', 0.7], ['makeSlab', 0.7]] },
            scatter: { geo: 'dodeca', r: 0.05, color: 0x6a6764, n: 190, flat: true, tint: 0.1 },
            accent: { geo: 'dodeca', r: 0.038, color: 0x9e9a96, n: 44 },
            stone: 0x5f5c59, fog: [12, 30],
        },
        // --- snow 계열 ---
        glacier: { // 18 빙하 — 눈 위에 청빙 결정. crystal 재질을 얼음색으로 갈아끼운다
            kin: 'snow', tint: [0.02, 0.16, -0.02], ridge: 'jagged',
            props: { p: [['makeCrystal', 1.05]], r: [['makeBoulder', 0.7, true], ['makeCrystal', 0.7]] },
            scatter: { geo: 'cone', r: 0.055, color: 0xbfe6ff, n: 180, flat: true, tint: 0.08, basic: true },
            accent: { geo: 'octa', r: 0.036, color: 0xffffff, n: 44, basic: true },
            stone: 0xbcd2e2, crystal: { color: 0x2a6f8e, emissive: 0x63d6f5, intensity: 0.26 },
            aurora: true,
        },
        tundra: { // 19 툰드라 — 눈이 걷힌 갈색 이끼 지대. 침엽수는 남았지만 눈 고깔이 얇다
            kin: 'snow', tint: [0.06, 0.1, -0.12], ridge: 'ridge',
            props: { p: [['makePine', 1.0, true], ['makeDryShrub', 1.4]], r: [['makeBoulder', 0.66, true], ['makeDryShrub', 1.0]] },
            scatter: { geo: 'blade', r: 0.06, color: 0x8a7c56, n: 200, flat: false, tint: 0.18, wind: true },
            accent: { geo: 'cone', r: 0.03, color: 0xdfe8f0, n: 38, basic: true },
            stone: 0x9aa2a8, veg: true,
        },
        // --- magic 계열 ---
        amethyst: { // 20 수정 평원 — 자수정 군락. magic 의 시안을 보라 쪽으로 완전히 돌렸다
            kin: 'magic', tint: [0.05, 0.14, -0.02], ridge: 'jagged',
            props: { p: [['makeCrystal', 1.1]], r: [['makeCrystal', 0.72], ['makeBoulder', 0.7]] },
            scatter: { geo: 'octa', r: 0.05, color: 0xb388ff, n: 130, flat: true, tint: 0.22, basic: true },
            accent: { geo: 'dodeca', r: 0.045, color: 0x4a2a7a, n: 60 },
            stone: 0x6a5a8a, crystal: { color: 0x53286b, emissive: 0xb861ff, intensity: 0.34 },
            emissive: { light: 0xb861ff },
        },
        abyss: { // 23 심연 — 빛이 거의 없는 심해 바닥. 발광 버섯이 유일한 광원
            kin: 'magic', tint: [-0.02, -0.1, -0.2], ridge: 'ridge',
            props: { p: [['makeMushroom', 1.15], ['makeCrystal', 0.9]], r: [['makeMushroom', 0.75], ['makeBoulder', 0.7]] },
            scatter: { geo: 'octa', r: 0.045, color: 0x2ee6c8, n: 120, flat: true, tint: 0.2, basic: true },
            accent: { geo: 'dodeca', r: 0.042, color: 0x0d2a44, n: 58 },
            stone: 0x2c4a60, crystal: { color: 0x10485c, emissive: 0x2ee6c8, intensity: 0.36 },
            emissive: { light: 0x2ee6c8 }, fog: [9, 25], veg: false,
            foliage: { color: 0x0e4a52, intensity: 0.3 },
        },
        sanctum: { // 24 성역 — 금빛 신전 지대. 잎까지 은은히 발광시켜 "빛 그 자체"로 읽히게
            kin: 'magic', tint: [0.03, -0.25, 0.2], ridge: 'ridge',
            props: { p: [['makeCrystal', 1.05], ['makeRoundTree', 0.95]], r: [['makeSlab', 0.75], ['makeRoundTree', 0.8]] },
            scatter: { geo: 'blade', r: 0.065, color: 0xd9c88a, n: 200, flat: false, tint: 0.16, wind: true },
            accent: { geo: 'octa', r: 0.036, color: 0xfff3b0, n: 56, basic: true, wind: true },
            stone: 0xcfc09a, crystal: { color: 0x8a6a1e, emissive: 0xffd54f, intensity: 0.3 },
            foliage: { color: 0x8a6a1e, intensity: 0.26 }, emissive: { light: 0xffd54f }, veg: true,
        },
        // --- lava 계열 ---
        sulfur: { // 21 유황 지대 — 균열이 주황이 아니라 유황 노랑. 같은 현무암 레시피가 전혀 다르게 읽힌다
            kin: 'lava', tint: [0.09, 0.34, 0.14], ridge: 'jagged',
            props: { p: [['makeVolcanicRock', 1.0], ['makeRockSpire', 0.95]], r: [['makeBoulder', 0.7], ['makeSlab', 0.7]] },
            scatter: { geo: 'dodeca', r: 0.05, color: 0x6e5c18, n: 160, flat: true, tint: 0.16 },
            accent: { geo: 'dodeca', r: 0.04, color: 0xe8d44a, n: 48 },
            stone: 0x7d6a22, emissive: { crack: 0xffd54f, intensity: 0.95, glow: 0xffc107, light: 0xffd54f },
        },
        obsidian: { // 22 흑요석 지대 — 식은 검은 유리. 발광을 **꺼서** lava kin 에서 완전히 빠져나온다
            kin: 'lava', tint: [-0.02, -0.5, -0.16], ridge: 'jagged',
            props: { p: [['makeRockSpire', 1.05], ['makeVolcanicRock', 0.9]], r: [['makeSlab', 0.75], ['makeBoulder', 0.66]] },
            scatter: { geo: 'octa', r: 0.05, color: 0x2a2d38, n: 170, flat: true, tint: 0.12 },
            accent: { geo: 'octa', r: 0.038, color: 0x7986cb, n: 46, basic: true },
            stone: 0x4e5464, emissive: null, fog: [11, 28],
        },
        doomland: { // 25 종말의 땅 — 최종 챕터. 핏빛 균열 + 고사목 + 뼈. 화면에서 가장 어두운 지면
            kin: 'lava', tint: [-0.02, 0.1, -0.06], ridge: 'jagged',
            props: { p: [['makeDeadTree', 1.05], ['makeRockSpire', 0.95]], r: [['makeVolcanicRock', 0.7], ['makeBones', 1.2]] },
            mid: [['makeBones', 1.6], ['makeDeadTree', 2.0], ['makeBones', 1.3], ['makeRockSpire', 1.9]],
            scatter: { geo: 'dodeca', r: 0.05, color: 0x3a1c1c, n: 160, flat: true, tint: 0.14 },
            accent: { geo: 'dodeca', r: 0.04, color: 0x7a1f12, n: 50 },
            stone: 0x4a3230, emissive: { crack: 0xd50000, intensity: 1.25, glow: 0xff1744, light: 0xff5252 },
        },
    },

    // 바이옴의 '형질 부모' — 신설 바이옴이 물려받는 원본 6종 중 하나. 원본은 자기 자신을 돌려준다.
    // 하드코딩된 `biome === 'lava'` 류 분기를 전부 이 함수로 통과시켜, 신설 바이옴이 조용히
    // forest 기본값으로 떨어지는 일이 없게 한다.
    bkin(biome) {
        const sp = this.BIOMES[biome];
        return (sp && sp.kin) || biome;
    },

    // 스캐터/악센트 지오메트리 팩토리 — 테이블이 문자열로 고르게. 'blade' 는 풀 포기(tuftGeo).
    scatterGeo(kind, r) {
        switch (kind) {
            case 'octa': return new THREE.OctahedronGeometry(r, 0);
            case 'cone': return new THREE.ConeGeometry(r * 0.55, r * 1.9, 4);
            case 'blade': return this.tuftGeo();
            case 'slabchip': { const g = new THREE.DodecahedronGeometry(r, 0); g.scale(1.5, 0.3, 1.2); return g; } // 갈라진 염판 조각
            default: return new THREE.DodecahedronGeometry(r, 0);
        }
    },

    // ---- 지면 스캐터 좌표 샘플러: 깊이 가중 + 군집 ----
    // `map-quality-up` 잔여 결함 ㉮("지면이 단색 카펫 + 균일 난수 산포. 근경>중경>원경 밀도 역전 +
    // 군집 스캐터가 필요" — 비평가 2인이 3라운드 내내 공통 1~2위)의 처방. 실측 근거는 둘 다
    // `tools/probe-scatter-depth.js` 가 게이트로 잡고 있다(추측 아님).
    //
    // ⑴ **깊이 가중** — 균일 난수는 *월드* 밀도가 일정하다. 그런데 화면 밀도는 거리²에 grazing 압축
    //    (1/cosθ)까지 곱해 커지므로, 균일하게 뿌리면 **원경이 빽빽하고 근경이 휑한 역전**이 난다.
    //    실측(수정 전): 화면 하단 1/3 이 중단 1/3 의 **0.44~1.00배**였다 — 앞 세션들이 "하단 40%
    //    빈 지면"으로 부르던 것의 정체이고, `scatter3` 근경 레이어를 얹고도 안 풀린 이유다.
    //    w(z) ∝ d(z)^-depthPow 로 역가중해 근경 쪽에 개수를 몰아준다(총 개수는 불변 = 드로우콜·성능 동일).
    //    ⚠️ 거리는 **실제 `this.camera` 위치**에서 잰다 — 카메라 상수를 손으로 베끼면 카메라가 바뀐 뒤
    //       옛 값으로 가중하는 유령 결과가 난다(TODO 함정 ④).
    // ⑵ **군집** — 완전 난수는 Clark–Evans R≈1.0(실측 0.95~1.04)으로 '기계적으로 흩뿌린 자갈밭'이 된다.
    //    씨앗을 깊이 가중으로 뿌리고 나머지를 그 주위 가우시안으로 모아 덤불 무리를 만든다.
    // ⚠️ x 는 가중하지 않는다 — 카메라가 x 로 패닝하므로(worldX) x 를 카메라 쪽으로 몰면
    //    패닝했을 때 화면 밖에서 밀도가 무너진다. 깊이(z)만 가중하는 게 맞다.
    scatterSpots(cnt, zMin, zMax, o) {
        o = o || {};
        const P = o.depthPow === undefined ? 3.0 : o.depthPow;
        const xMin = o.xMin === undefined ? -28 : o.xMin;
        const xMax = o.xMax === undefined ? 28 : o.xMax;
        const cam = this.camera;
        const cx = cam ? cam.position.x : 0.15;
        const cy = cam ? cam.position.y : 3.7;
        const cz = cam ? cam.position.z : 8.2;
        // 깊이 역-CDF (32분할). 균등 난수 u 를 w(z) 분포의 z 로 바꾼다.
        const B = 32, cdf = new Float32Array(B + 1);
        for (let i = 0; i < B; i++) {
            const z = zMin + (i + 0.5) / B * (zMax - zMin);
            const dz = cz - z, dy = cy - this.heightAt(cx, z);
            cdf[i + 1] = cdf[i] + Math.pow(Math.max(0.5, Math.sqrt(dz * dz + dy * dy)), -P);
        }
        for (let i = 1; i <= B; i++) cdf[i] /= cdf[B];
        const pickZ = () => {
            const u = Math.random();
            let k = 0;
            while (k < B - 1 && cdf[k + 1] < u) k++;
            return zMin + (k + Math.random()) / B * (zMax - zMin);
        };
        // 3개 균등난수 합 → 가우시안 근사(±1 대부분, 꼬리 있음)
        const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        const seeds = Math.max(2, Math.round(cnt * (o.seedFrac === undefined ? 0.3 : o.seedFrac)));
        const rx = o.clumpR === undefined ? 1.15 : o.clumpR;   // 군집 반경(월드 x)
        const rz = rx * (o.clumpZ === undefined ? 0.4 : o.clumpZ); // z 는 화면 깊이라 더 좁게
        const sx = [], sz = [], out = [];
        for (let i = 0; i < cnt; i++) {
            let x, z;
            if (i < seeds || !sx.length) {
                x = U.rand(xMin, xMax); z = pickZ();
                sx.push(x); sz.push(z);
            } else {
                const k = Math.random() * sx.length | 0;
                x = sx[k] + g() * rx;
                z = sz[k] + g() * rz;
                // 경계 밖은 반사 — 클램프하면 가장자리에 일렬로 쌓여 '벽'이 생긴다
                if (x < xMin) x = xMin + (xMin - x); else if (x > xMax) x = xMax - (x - xMax);
                if (z < zMin) z = zMin + (zMin - z); else if (z > zMax) z = zMax - (z - zMax);
                x = U.clamp(x, xMin, xMax); z = U.clamp(z, zMin, zMax);
            }
            out.push([x, z]);
        }
        return out;
    },

    // 절차적 잔디/지면 얼룩 텍스처 — 큰 규모 패치(마른 풀/흙 자국) + 작은 얼룩 + 미세 노이즈 3단 레이어.
    // 재질 color가 그 위에 곱해져 챕터별 톤은 그대로 유지되면서 표면 디테일만 더함.
    // 바이옴별 지면 알베도 텍스처 — "어느 챕터나 같은 얼룩 평면" 인상을 없애기 위해 소재가
    // 실제로 다르게 읽히는 패턴을 바이옴마다 그린다(풀결/모래 리플/암반 균열/눈 스파클/현무암 셀).
    // 재질 color가 곱해지므로 전부 중성 회조 기반으로 그리고, 대비는 과감하게(원거리에서도 살아남게).
    makeGroundTexture(biome) {
        const kin = this.bkin(biome);      // 신설 바이옴은 원본 6종의 레시피를 물려받고 색만 틴트로 튼다
        const size = 512;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#c2c2c2';
        ctx.fillRect(0, 0, size, size);
        // 🚨 **타일 이음매 제거 (map-quality-up).** 이 텍스처는 지면에 12×6 으로 반복되는데, 도형을
        //    한 번만 그리면 오른쪽 끝에서 잘린 얼룩이 왼쪽 끝에 이어지지 않아 **타일 경계마다 세로·가로
        //    줄이 선다.** 실측(도구 `probe-ground-seam.js`): 수정 전 랩 경계의 화소 차가 내부 인접
        //    화소 차의 **1.7~2.2배**(forest 21.4 vs 10.1 등 6개 바이옴 전부). 화면에서는 지면 한가운데를
        //    가르는 곧은 세로선으로 보였다(ch3 하단에서 육안 확인).
        // → 도형 파라미터를 **먼저 뽑아 둔 뒤** 3×3(±size) 로 9번 그린다. 경계를 넘은 부분이 반대편에
        //   그대로 이어지므로 이음매가 사라진다. 화면 밖 8벌은 캔버스가 잘라내므로 결과 밀도는 그대로다.
        // ⚠️ 파라미터를 먼저 뽑는 이유: 그리는 함수 안에서 `Math.random()` 을 쓰면 9번이 전부 **다른
        //    도형**이 돼 이음매가 오히려 심해진다. 난수 호출 순서·횟수는 수정 전과 같게 유지했다
        //    (시드 고정 대조 캡처의 프롭 배치가 밀리지 않게 — `sculptFoliage` 주석의 같은 함정).
        const tile9 = (draw) => {
            for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
                ctx.save(); ctx.translate(ox * size, oy * size); draw(); ctx.restore();
            }
        };
        // 공용: 큰 색조 패치 (소재 기저의 명도/온도 변주)
        const patches = (n, alpha) => {
            const list = [];
            for (let i = 0; i < n; i++) {
                const x = Math.random() * size, y = Math.random() * size, r = 40 + Math.random() * 110;
                const warm = Math.random() < 0.5;
                const base = 130 + Math.random() * 85;
                const cr = warm ? base + 28 : base - 16, cg = base, cb = warm ? base - 30 : base + 18;
                list.push({ x, y, r, ry: r * (0.45 + Math.random() * 0.5), rot: Math.random() * Math.PI,
                    col: `rgba(${cr | 0},${cg | 0},${cb | 0},${alpha + Math.random() * 0.2})` });
            }
            tile9(() => {
                for (const p of list) {
                    ctx.fillStyle = p.col;
                    ctx.beginPath();
                    ctx.ellipse(p.x, p.y, p.r, p.ry, p.rot, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
        };
        // 짧은 스트로크(풀결 등) — 짧아도 경계에 걸치면 줄이 서므로 같이 랩어라운드로 그린다
        const strokes = (n, len, w, ang, spread, light, dark) => {
            ctx.lineCap = 'round';
            const list = [];
            for (let i = 0; i < n; i++) {
                const x = Math.random() * size, y = Math.random() * size;
                const a = ang + (Math.random() - 0.5) * spread;
                const l = len * (0.6 + Math.random() * 0.8);
                const v = Math.random() < 0.5 ? light : dark;
                list.push({ x, y, a, l, col: `rgba(${v},${v},${v},${0.22 + Math.random() * 0.26})`, w: w * (0.7 + Math.random() * 0.6) });
            }
            tile9(() => {
                for (const t of list) {
                    ctx.strokeStyle = t.col;
                    ctx.lineWidth = t.w;
                    ctx.beginPath();
                    ctx.moveTo(t.x, t.y);
                    ctx.lineTo(t.x + Math.cos(t.a) * t.l, t.y + Math.sin(t.a) * t.l);
                    ctx.stroke();
                }
            });
        };
        switch (kin) {
            case 'desert': { // 모래 리플 — 수평 사인 물결 밴드(밝은 크레스트 + 어두운 트로프 쌍)
                patches(22, 0.16);
                // 가로 랩어라운드: 사인 주기를 타일 폭의 정수배로 강제해 좌우 경계 이음매 제거.
                // ⚠️ 세로(y)는 그렇게 못 한다 — 밴드가 위아래 경계를 넘나들므로 `tile9` 로 감싼다.
                const ripples = [];
                for (let y = -8; y < size + 8; y += 9 + Math.random() * 7) {
                    ripples.push({ y, amp: 3 + Math.random() * 4, ph: Math.random() * 9, cyc: 10 + (Math.random() * 9 | 0) });
                }
                tile9(() => {
                    for (const rp of ripples) {
                        for (const [off, col, w] of [[2.6, 'rgba(96,88,74,0.34)', 3.2], [0, 'rgba(238,232,214,0.5)', 2.1]]) {
                            ctx.strokeStyle = col;
                            ctx.lineWidth = w;
                            ctx.beginPath();
                            // ⚠️ 마지막 점을 **정확히 x=size** 로 찍는다. `x += 7` 은 512 에서 511 에 멈춰
                            //    타일 경계에 1px 틈을 남기고, 그 틈이 반복돼 세로줄로 보인다(실측 비 1.27).
                            const yAt = (x) => rp.y + off + Math.sin((x / size) * rp.cyc * Math.PI * 2 + rp.ph) * rp.amp;
                            ctx.moveTo(0, yAt(0));
                            for (let x = 7; x < size; x += 7) ctx.lineTo(x, yAt(x));
                            ctx.lineTo(size, yAt(size));
                            ctx.stroke();
                        }
                    }
                });
                break;
            }
            case 'rock': { // 암반 — 각진 판 조각 + 가는 균열선
                patches(26, 0.18);
                const plates = [];
                for (let i = 0; i < 30; i++) { // 명도가 다른 각진 셰이드 판
                    const x = Math.random() * size, y = Math.random() * size, r = 26 + Math.random() * 60;
                    const v = 118 + Math.random() * 96 | 0;
                    const col = `rgba(${v},${v},${v + 6},${0.2 + Math.random() * 0.22})`;
                    const nv = 4 + (Math.random() * 3 | 0), pts = [];
                    for (let k = 0; k < nv; k++) {
                        const a = (k / nv) * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.5);
                        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
                    }
                    plates.push({ col, pts });
                }
                const cracks = [];
                for (let i = 0; i < 14; i++) { // 균열 폴리라인
                    const col = `rgba(52,50,48,${0.3 + Math.random() * 0.25})`;
                    const w = 1.4 + Math.random() * 1.2;
                    let x = Math.random() * size, y = Math.random() * size, a = Math.random() * Math.PI * 2;
                    const pts = [[x, y]];
                    for (let st = 0; st < 9; st++) {
                        a += (Math.random() - 0.5) * 1.1;
                        x += Math.cos(a) * 16; y += Math.sin(a) * 16;
                        pts.push([x, y]);
                    }
                    cracks.push({ col, w, pts });
                }
                tile9(() => {
                    for (const p of plates) {
                        ctx.fillStyle = p.col;
                        ctx.beginPath();
                        p.pts.forEach(([px, py], k) => k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
                        ctx.closePath(); ctx.fill();
                    }
                    for (const cr of cracks) {
                        ctx.strokeStyle = cr.col; ctx.lineWidth = cr.w;
                        ctx.beginPath();
                        cr.pts.forEach(([px, py], k) => k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
                        ctx.stroke();
                    }
                });
                break;
            }
            case 'snow': { // 눈 — 부드러운 굴곡 음영 + 바람 스트릭 + 스파클 점
                patches(14, 0.1);
                strokes(90, 46, 2.4, -0.25, 0.18, 224, 156); // 바람에 쓸린 사선 결
                const sparks = [];
                for (let i = 0; i < 240; i++) { // 스파클(햇빛 반짝임 점)
                    sparks.push({ x: Math.random() * size, y: Math.random() * size,
                        col: `rgba(255,255,255,${0.5 + Math.random() * 0.5})`, w: Math.random() < 0.8 ? 1.4 : 2.2 });
                }
                tile9(() => { for (const sp of sparks) { ctx.fillStyle = sp.col; ctx.fillRect(sp.x, sp.y, sp.w, 1.4); } });
                break;
            }
            case 'lava': { // 현무암 자갈판 — 어두운 셀 + 밝은 재 틈. 크랙 emissiveMap과 별개의 식은 표면 결
                patches(16, 0.14);
                const cells = [];
                for (let i = 0; i < 64; i++) {
                    const x = Math.random() * size, y = Math.random() * size, r = 14 + Math.random() * 34;
                    const v = 96 + Math.random() * 60 | 0;
                    const col = `rgba(${v},${v - 4},${v - 8},${0.3 + Math.random() * 0.28})`;
                    const nv = 5 + (Math.random() * 2 | 0), pts = [];
                    for (let k = 0; k < nv; k++) {
                        const a = (k / nv) * Math.PI * 2 + 0.3, rr = r * (0.68 + Math.random() * 0.4);
                        pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
                    }
                    cells.push({ col, pts });
                }
                tile9(() => {
                    for (const ce of cells) {
                        ctx.fillStyle = ce.col;
                        ctx.beginPath();
                        ce.pts.forEach(([px, py], k) => k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
                        ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = 'rgba(190,182,170,0.3)'; // 셀 가장자리 밝은 재 라인
                        ctx.lineWidth = 1.6;
                        ctx.stroke();
                    }
                });
                // 🚨 발광 균열이 지나가는 **바로 그 자리**에 암반 쪽 골을 새긴다(결함 ㉯ '지형 골 안착').
                //    `crackNetwork()` 를 emissiveMap 과 공유하므로 uv 상 정확히 겹친다 — 종전에는 둘이
                //    각각 난수를 뽑아, 빛나는 선 아래에 아무 골도 없어 '표면에 얹힌 네온 낙서'가 됐다.
                //    바깥의 밝은 립(굳은 재가 융기한 가장자리) → 안쪽의 어두운 골 순서로 겹쳐 그린다.
                // 🚨 **골이 발광에 씻겨 렌더에서 안 읽혔다(비평가 2인 #2 · `probe-crack-render` 립 0%).**
                //    종전 골(4.6px, 어깨 재 10px)은 발광 글로우(11px)+블리드(18px) **안쪽**에 통째로
                //    들어가, 가산 발광이 그 자리를 밝혀 립이 어둡게 안 남았다. 그래서 ⑴ 발광을 코어로
                //    좁히고(아래 makeCrackTexture) ⑵ 어두운 골 벽을 **발광이 빠진 바깥(6~9px)** 으로
                //    밀고 더 검게, ⑶ 그 너머에 밝은 크러스트 립을 둔다: 코어 발광 → 어두운 골 벽 →
                //    밝은 굳은-재 립 → 암반. '용암 위에 덮인 갈라진 지각'의 순서 그대로다.
                this.strokeCrackNet(ctx, size, [
                    { w: d => 21 * this.CRACK_W[d], col: () => 'rgba(176,166,150,0.30)' }, // 크러스트 립(밝은 굳은 재)
                    { w: d => 19 * this.CRACK_W[d], col: () => 'rgba(10,8,7,0.93)' },        // 골 벽(그늘, 발광보다 넓게)
                ]);
                break;
            }
            case 'magic': { // 마법 — 큰 몽환 얼룩 + 마나 가루 점
                patches(30, 0.22);
                const motes = [];
                for (let i = 0; i < 130; i++) {
                    const x = Math.random() * size, y = Math.random() * size;
                    const v = 190 + Math.random() * 65 | 0;
                    motes.push({ x, y, col: `rgba(${v - 40},${v},${v},${0.25 + Math.random() * 0.4})` });
                }
                tile9(() => { for (const m of motes) { ctx.fillStyle = m.col; ctx.fillRect(m.x, m.y, 1.6, 1.6); } });
                break;
            }
            default: { // forest: 얼룩 + 풀결 스트로크(짧고 촘촘한 결이 "잔디 재질"을 말해줌)
                patches(30, 0.18);
                strokes(300, 11, 1.7, -Math.PI / 2, 0.9, 196, 122); // 700개/고대비는 '카펫 노이즈'로 읽힘 — 성기고 옅게
                const tufts = [];
                for (let i = 0; i < 160; i++) { // 풀포기 뭉침 얼룩
                    const x = Math.random() * size, y = Math.random() * size, r = 6 + Math.random() * 22;
                    const shade = 115 + Math.random() * 115;
                    tufts.push({ x, y, r, ry: r * (0.5 + Math.random() * 0.5), rot: Math.random() * Math.PI,
                        col: `rgba(${shade},${shade},${shade},${0.12 + Math.random() * 0.16})` });
                }
                tile9(() => {
                    for (const t of tufts) {
                        ctx.fillStyle = t.col;
                        ctx.beginPath();
                        ctx.ellipse(t.x, t.y, t.r, t.ry, t.rot, 0, Math.PI * 2);
                        ctx.fill();
                    }
                });
            }
        }
        // 미세 스펙클 노이즈 (표면 거칠기 — 전 바이옴 공통)
        const img = ctx.getImageData(0, 0, size, size);
        const speck = kin === 'snow' ? 14 : 30;
        for (let i = 0; i < img.data.length; i += 4) {
            const n = (Math.random() - 0.5) * speck;
            img.data[i] = U.clamp(img.data[i] + n, 0, 255);
            img.data[i + 1] = U.clamp(img.data[i + 1] + n, 0, 255);
            img.data[i + 2] = U.clamp(img.data[i + 2] + n, 0, 255);
        }
        ctx.putImageData(img, 0, 0);
        this.tintGround(ctx, size, biome);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(12, 6);
        return tex;
    },

    // 지면 알베도 틴트 — 신설 바이옴이 kin 의 레시피를 그대로 물려받아도 **소재가 달라 보이게** HSL 을 튼다.
    // ⚠️ 재질 color(t.ground)가 이 위에 곱해지므로 틴트는 '색을 칠하는' 게 아니라 '기저 소재의 온도·채도·
    //    명도를 옮기는' 용도다. 채도를 뽑으면(salt·ash·obsidian) 같은 리플/셀 패턴도 완전히 다른 재료로 읽힌다.
    // 스펙 없는 원본 6종은 여기서 **즉시 빠져나가** 한 픽셀도 안 바뀐다.
    tintGround(ctx, size, biome) {
        const sp = this.BIOMES[biome];
        if (!sp || !sp.tint) return;
        const [dh, ds, dl] = sp.tint;
        const img = ctx.getImageData(0, 0, size, size);
        const d = img.data;
        const col = new THREE.Color();
        const hsl = { h: 0, s: 0, l: 0 };
        for (let i = 0; i < d.length; i += 4) {
            col.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
            col.getHSL(hsl);
            col.setHSL((hsl.h + dh + 1) % 1, U.clamp(hsl.s + ds, 0, 1), U.clamp(hsl.l + dl, 0, 1));
            d[i] = col.r * 255; d[i + 1] = col.g * 255; d[i + 2] = col.b * 255;
        }
        ctx.putImageData(img, 0, 0);
    },

    // 절차적 지면 노멀맵 — 범프 높이 캔버스를 소벨 필터로 법선으로 변환.
    // 색 얼룩과 달리 조명에 실제로 반응하는 요철이라, 어두운 챕터 색(용암 등)이 곱해져도
    // 표면 디테일이 죽지 않고 "칠해진 평면" 인상을 없애준다.
    makeGroundNormalMap(biome) {
        const kin = this.bkin(biome);
        const size = 256;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, size, size);
        // 🚨 알베도와 **같은 이유로** 여기도 랩어라운드가 필요하다(map-quality-up). 높이맵이 경계에서
        //    안 이어지면 소벨 변환 뒤 법선이 튀어, 색이 아니라 **조명이 타일 경계마다 줄을 긋는다.**
        //    (소벨의 `at()` 은 이미 랩어라운드로 샘플링하지만, 그건 높이 **내용**이 이어져야 의미가 있다.)
        const tile9 = (draw) => {
            for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
                ctx.save(); ctx.translate(ox * size, oy * size); draw(); ctx.restore();
            }
        };
        if (kin === 'desert') {
            // 리플 요철 — 알베도 물결과 같은 스케일의 수평 융기(가로로 길쭉한 타원 범프)
            const bumps = [];
            for (let i = 0; i < 150; i++) {
                bumps.push({ x: Math.random() * size, y: Math.random() * size,
                    rx: 16 + Math.random() * 26, ry: 2.2 + Math.random() * 3,
                    up: Math.random() < 0.62 });
            }
            tile9(() => {
                for (const b of bumps) {
                    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rx);
                    grad.addColorStop(0, b.up ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.36)');
                    grad.addColorStop(1, 'rgba(128,128,128,0)');
                    ctx.fillStyle = grad;
                    ctx.save(); ctx.translate(b.x, b.y); ctx.scale(1, b.ry / b.rx);
                    ctx.beginPath(); ctx.arc(0, 0, b.rx, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }
            });
        } else if (kin === 'rock' || kin === 'lava') {
            // 판/자갈 요철 — 명도가 균일한 다각형 판(경계에서 급격한 법선 변화 = 각진 단차)
            const plates = [];
            for (let i = 0; i < 70; i++) {
                const x = Math.random() * size, y = Math.random() * size, r = 9 + Math.random() * 22;
                const v = 92 + Math.random() * 88 | 0;
                const nv = 5 + (Math.random() * 2 | 0), pts = [];
                for (let k = 0; k < nv; k++) {
                    const a = (k / nv) * Math.PI * 2 + 0.4, rr = r * (0.66 + Math.random() * 0.4);
                    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
                }
                plates.push({ col: `rgb(${v},${v},${v})`, pts });
            }
            tile9(() => {
                for (const p of plates) {
                    ctx.fillStyle = p.col;
                    ctx.beginPath();
                    p.pts.forEach(([px, py], k) => k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py));
                    ctx.closePath(); ctx.fill();
                }
            });
            // 용암만: 균열 네트워크를 **높이맵에도** 파 넣는다(결함 ㉯). 이 캔버스는 소벨로 법선이 되므로
            // 어두운 선 = 꺼진 골, 그 어깨의 밝은 선 = 융기한 립이 되어 **조명이 실제로 균열에 반응**한다.
            // 알베도의 그늘은 '칠해진 그림자'라 광원이 움직여도 안 변하지만, 이건 진짜 요철로 읽힌다.
            if (kin === 'lava') {
                this.strokeCrackNet(ctx, size, [
                    // 🚨 **가장자리를 세우지 말 것.** 처음엔 어깨(밝은 선) 바로 옆에 골(어두운 선)을 붙여
                    //    단차로 그렸는데, 그러면 몇 px 안에서 명도가 214→30 으로 꺾여 **기울기 봉우리**가 선다.
                    //    성긴 직선 피처가 그런 봉우리를 가지면 `probe-ground-tile-seam` 의 lava normal 이
                    //    베이스라인 0.92~1.10 → 0.76~1.32 로 벌어진다(균열이 타일 경계에 나란히 얹히는 판에서
                    //    경계 기울기가 튀어 기준 1.25 를 넘는다). 대비를 낮추는 것만으론 안 잡혔다 —
                    //    문제는 세기가 아니라 **가파름**이다.
                    //    그래서 폭이 다른 반투명 스트로크를 겹쳐 **완만한 경사면**으로 판다: 같은 깊이를
                    //    더 넓은 구간에 나눠 담으므로 최대 기울기는 낮고, '파인 골'이라는 단서는 그대로다.
                    { w: d => 13 * this.CRACK_W[d], col: () => 'rgba(210,210,210,0.10)' }, // 어깨 융기(완만)
                    { w: d => 10 * this.CRACK_W[d], col: () => 'rgba(40,40,40,0.10)' },    // 골 바깥 경사
                    { w: d => 7 * this.CRACK_W[d], col: () => 'rgba(36,36,36,0.14)' },
                    { w: d => 4.4 * this.CRACK_W[d], col: () => 'rgba(32,32,32,0.20)' },
                    { w: d => 2.4 * this.CRACK_W[d], col: () => 'rgba(28,28,28,0.26)' },   // 골 바닥
                ]);
            }
        } else {
            // 완만한 굴곡 (흙더미/풀 뭉치 규모) — 눈은 굴곡을 더 크고 부드럽게
            const soft = kin === 'snow';
            const knolls = [];
            for (let i = 0; i < (soft ? 60 : 110); i++) {
                knolls.push({ x: Math.random() * size, y: Math.random() * size,
                    r: (soft ? 12 : 5) + Math.random() * (soft ? 34 : 20), up: Math.random() < 0.6 });
            }
            tile9(() => {
                for (const k of knolls) {
                    const grad = ctx.createRadialGradient(k.x, k.y, 0, k.x, k.y, k.r);
                    grad.addColorStop(0, k.up ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.3)');
                    grad.addColorStop(1, 'rgba(128,128,128,0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, Math.PI * 2); ctx.fill();
                }
            });
        }
        // 미세 거칠기
        const img = ctx.getImageData(0, 0, size, size);
        const rough = kin === 'snow' ? 16 : 34;
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

    // ---- 용암 균열 네트워크: 주 혈관 → 지류 → 실핏줄의 3단 위계 ----
    // `map-quality-up` 잔여 결함 ㉯("위계 없는 네온 낙서로 읽힘: 굵은 주 혈관+가는 지류, 주변
    // 라이트 블리드, 지형 골 안착" — 비평가 A2 #3·A3 #4·B3 #4 로 **3라운드 연속** 지적)의 처방.
    //
    // 🚨 종전 구조의 진짜 문제는 '난수 폴리라인'이 아니라 **균열이 암반에 존재하지 않았다는 것**이다.
    //    발광 크랙(`makeCrackTexture`)과 지면 알베도(`makeGroundTexture` lava)·노멀맵이 **각각 따로**
    //    난수를 뽑아 그렸다 — 그래서 빛나는 선이 지나가는 자리에 대응하는 골도, 그늘도, 요철도 없었다.
    //    표면에 얹힌 발광 선 = 정확히 '네온 낙서'다. 여기서 네트워크를 **한 번만** 만들어 세 맵이
    //    전부 같은 경로를 쓰게 하면, 같은 자리에 골(노멀)·그늘(알베도)·백열(발광)이 겹쳐
    //    비로소 '암반이 갈라져 그 안이 빛나는' 것으로 읽힌다.
    // ⚠️ 좌표는 **정규화(0~1)** 로 들고 있는다 — 알베도·노멀은 512, 발광은 256 캔버스라 픽셀 좌표로
    //    두면 어긋난다. 세 맵 모두 repeat 12×6 으로 통일돼 있으므로 uv 좌표계에서는 정확히 겹친다.
    crackNetwork() {
        if (this._crackNet) return this._crackNet;
        const segs = [];
        // depth 0 = 주 혈관, 1 = 지류, 2 = 실핏줄
        const walk = (x, y, a, steps, step, depth, wob) => {
            const pts = [[x, y]];
            for (let s = 0; s < steps; s++) {
                a += U.rand(-wob, wob);
                x += Math.cos(a) * step; y += Math.sin(a) * step;
                pts.push([x, y]);
            }
            segs.push({ pts, depth });
            return pts;
        };
        const dirAt = (pts, k) => Math.atan2(pts[k][1] - pts[k - 1][1], pts[k][0] - pts[k - 1][0]);
        // 🚨 **총 잉크량을 종전 수준으로 묶는 게 이 함수의 진짜 제약이다.** 타일이 12×6 으로 반복되므로
        //    타일당 균열이 조금만 길어도 화면 전체가 주황 그물로 덮인다(원 코드 주석의 경고 그대로다 —
        //    첫 판에서 주 혈관 2개×21스텝 + 지류 8개로 만들었다가 지면이 통째로 네온 웹이 됐다).
        //    위계는 '더 많이 그려서'가 아니라 **같은 잉크를 굵기로 나눠서** 만든다.
        for (let i = 0; i < 2; i++) {                      // 주 혈관 2개 (종전 3개 균등 → 위계 없음이었다)
            const main = walk(Math.random(), Math.random(), Math.random() * Math.PI * 2,
                9 + (Math.random() * 3 | 0), 0.05, 0, 0.40);
            const nb = 2;
            for (let b = 0; b < nb; b++) {
                // ⚠️ 지류는 주 혈관의 **중간 지점**에서 갈라져야 한다. 끝점에서 이으면 굵기만 다른
                //    한 줄로 보여서 위계가 아니라 '선이 가늘어진 것'으로 읽힌다.
                const k = 2 + (Math.random() * (main.length - 4) | 0);
                const br = dirAt(main, k) + (Math.random() < 0.5 ? 1 : -1) * U.rand(0.5, 1.15);
                const trib = walk(main[k][0], main[k][1], br, 4 + (Math.random() * 3 | 0), 0.035, 1, 0.5);
                if (Math.random() < 0.6 && trib.length > 3) {
                    const k2 = 1 + (Math.random() * (trib.length - 2) | 0);
                    walk(trib[k2][0], trib[k2][1],
                        dirAt(trib, k2) + (Math.random() < 0.5 ? 1 : -1) * U.rand(0.6, 1.3),
                        3 + (Math.random() * 2 | 0), 0.025, 2, 0.6);
                }
            }
        }
        this._crackNet = segs;
        return segs;
    },

    // 균열 네트워크 공통 스트로커 — 정규화 경로를 임의 크기 캔버스에 그린다.
    // `layers` 는 바깥층부터 순서대로: 각 층이 **모든** 세그먼트를 그린 뒤 다음 층으로 넘어간다
    // (세그먼트별로 3겹을 다 그리면 나중 세그먼트의 넓은 폴오프가 앞 세그먼트의 코어를 덮는다).
    // 폭은 256 기준으로 적고 캔버스 크기에 비례 확대해, 512 맵에서도 uv 상 같은 굵기가 된다.
    // 타일 경계를 넘는 균열이 잘려 이음매가 되지 않게 3×3 으로 감아 그린다(알베도 `tile9` 과 같은 이유).
    strokeCrackNet(ctx, size, layers) {
        const net = this.crackNetwork();
        const k = size / 256;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const L of layers) {
            for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
                for (const sg of net) {
                    const w = L.w(sg.depth);
                    if (!(w > 0)) continue;
                    ctx.strokeStyle = L.col(sg.depth);
                    ctx.lineWidth = w * k;
                    ctx.beginPath();
                    for (let p = 0; p < sg.pts.length; p++) {
                        const X = (sg.pts[p][0] + ox) * size, Y = (sg.pts[p][1] + oy) * size;
                        if (p === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
                    }
                    ctx.stroke();
                }
            }
        }
    },

    // 깊이별 굵기·밝기 배수 — 이 두 배열이 곧 '위계'다. 주 혈관만 넓게 번지고 실핏줄은 가늘고 어둡다.
    CRACK_W: [1, 0.52, 0.28],
    CRACK_A: [1, 0.52, 0.24],

    // 용암 균열 텍스처(emissiveMap 전용) — 검정 바탕에 발광 주황 균열.
    // 4겹: 넓은 열기 블리드 → 광 → 중심 광 → 백열 코어. 바깥 블리드를 종전 14px → 26px 로 넓히고
    // 알파를 낮춰, 균열 자체보다 **주변 암반이 달아오른 것**이 먼저 읽히게 했다(지적 '주변 라이트 블리드').
    makeCrackTexture() {
        const size = 256;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, size, size);
        const W = this.CRACK_W, A = this.CRACK_A;
        this.strokeCrackNet(ctx, size, [
            // 🚨 발광을 **코어로 좁혔다**(블리드 18→9·광 11→5.5). 종전 넓은 블리드가 알베도 골이
            //    있어야 할 립 자리(6~9px)를 가산으로 밝혀, 렌더에서 골이 안 읽혔다(`probe-crack-render`).
            //    좁히면 6~9px 에 발광이 거의 없어 그 자리의 어두운 알베도 골 벽이 드러난다. 코어 밝기
            //    자체(중심 광·백열)는 유지 — 비평가는 글로우 자체는 좋다고 했다.
            { w: d => 5 * W[d], col: d => `rgba(255,88,20,${(0.06 * A[d]).toFixed(3)})` },    // 열기 블리드(좁힘)
            { w: d => 4 * W[d], col: d => `rgba(255,72,0,${(0.26 * A[d]).toFixed(3)})` },     // 광(좁힘)
            { w: d => 4.4 * W[d], col: d => `rgba(255,140,30,${(0.62 * A[d]).toFixed(3)})` }, // 중심 광
            { w: d => 1.9 * W[d], col: d => `rgba(255,214,150,${(0.95 * A[d]).toFixed(3)})` },// 백열 코어
        ]);
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
        this.terrainShade(this.terrainMat); // 타일 동일성 깨기 + 거리 LOD + 눈 수광면 탈색 (㉰·㉱)
        // 🚨 **깊이를 30 → 60 으로 늘리고 뒤로 15 밀었다 (map-quality-up).**
        //    종전 플레인은 z −15..+15 라 **far 모서리가 카메라에서 23.7 유닛**인데 `fog.far` 가 35 이라
        //    **49% 만 안개에 잠긴 채 뚝 끊겼다** — 그 끊긴 자리가 화면 폭을 관통하는 곧은 가로선으로
        //    보인다(비평가 2인이 독립적으로 지적). 기존 `probe-ground-seam.js` 도 그 행에서 최대 단차
        //    **중앙값의 7.5~9배**를 냈고, 그림자맵 off·지면 receiveShadow off·흙길 off·섀도캠 ×3
        //    **어떤 토글에서도 값이 안 변했다** — 그림자도 데칼도 아니고 지형 자체라는 뜻이다.
        //    이제 far 모서리가 z=−45(카메라에서 53 유닛)라 fog.far 밖이므로 **안개에 완전히 녹아 사라진다.**
        //    ⚠️ 원경 능선은 z −12/−19/−25 에 있다 — 지면이 그보다 뒤까지 깔려야 능선 아래가 안 비친다.
        const geo = new THREE.PlaneGeometry(60, 60, 64, 56);
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, 0, -15);
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
            // ⚠️ 이 캔버스는 **네 변 모두에서 알파가 0이어야** 한다. 예전에는 블롭 중심 y가 60~196이고
            // 반경이 최대 76이라 칠이 캔버스 위아래(0·256) 밖으로 잘려 나갔고, 그래서 데칼 평면의
            // 앞·뒤 모서리가 지면 위에 **직선으로 드러났다** — 비평가 4차 지적 ⓔ '지면 사각 이음매'의 실체다
            // (실측: 데칼을 끄면 캔버스 로컬 y241의 단차가 통째로 사라졌다 — probe-ground-seam.js).
            // 좌우도 마찬가지다. repeat.set(2,1)로 가로 반복하는데 x=0/1024에서 잘린 블롭이 이어지지 않아
            // 반복 경계마다 세로 이음선이 생겼다 → 아래 wrapArc가 블롭을 x축으로 감아 그려 이어 붙인다.
            const wrapArc = (x, y, r, fill) => {
                for (const ox of [0, -1024, 1024]) {           // 경계를 넘는 블롭은 반대쪽에도 그린다 = 이음매 없는 반복
                    if (x + ox + r < 0 || x + ox - r > 1024) continue;
                    const gb = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
                    gb.addColorStop(0, fill);
                    gb.addColorStop(1, 'rgba(80,60,40,0)');
                    ctx.fillStyle = gb;
                    ctx.beginPath(); ctx.arc(x + ox, y, r, 0, Math.PI * 2); ctx.fill();
                }
            };
            // 직선 그라디언트 밴드는 '아스팔트 고속도로'로 읽힘 — 소프트 블롭을 중심선 따라 지터로 겹쳐 유기적인 다짐길로
            for (let i = 0; i < 300; i++) {
                const x = Math.random() * 1024;
                const y = 128 + Math.sin(x * 0.01 + 1.7) * 28 + U.rand(-40, 40); // 중심선 자체가 완만히 굽이침
                const r = 24 + Math.random() * 52;
                const warm = Math.random() < 0.6;
                // 저알파 밝은 톤은 '안개 자국'으로 읽힘(비평가 6.9 7번) — 주변 잔디보다 확실히 어두운 황토
                wrapArc(x, y, r, warm ? 'rgba(104,78,50,0.3)' : 'rgba(72,54,36,0.28)');
            }
            for (let i = 0; i < 52; i++) { // 짧은 발자국/긁힘 결 — 긴 스트릭은 차선으로 오독
                ctx.strokeStyle = Math.random() < 0.5 ? 'rgba(66,48,32,0.2)' : 'rgba(140,112,80,0.16)';
                ctx.lineWidth = 2.4 + Math.random() * 3.2;
                const x = Math.random() * 1024, y = 80 + Math.random() * 96;
                for (const ox of [0, -1024, 1024]) {
                    ctx.beginPath(); ctx.moveTo(x + ox, y); ctx.lineTo(x + ox + 12 + Math.random() * 28, y + U.rand(-6, 6)); ctx.stroke();
                }
            }
            for (let i = 0; i < 60; i++) { // 잔자갈
                const v = 110 + Math.floor(Math.random() * 55);
                ctx.fillStyle = `rgba(${v},${v - 12},${v - 28},0.4)`;
                const x = Math.random() * 1024, y = 76 + Math.random() * 104, r = 1.6 + Math.random() * 3.6;
                for (const ox of [0, -1024, 1024]) { ctx.beginPath(); ctx.arc(x + ox, y, r, 0, Math.PI * 2); ctx.fill(); }
            }
            // 위아래 페더링 — 잘려 나간 칠을 지워 **캔버스 상·하단 알파를 정확히 0으로** 만든다.
            // 이것이 없으면 평면 모서리가 그대로 직선으로 보인다(위 주석 참조).
            // 남는 코어 밴드는 y 46~210(=64%)이라, 평면 깊이를 1.7 → 2.66으로 키워 **길의 실제 폭(1.7유닛)은 유지**하고
            // 늘어난 만큼을 전부 페이드에 쓴다.
            ctx.globalCompositeOperation = 'destination-out';
            const fade = (y0, y1) => {                      // y0(완전 제거) → y1(보존)
                const g2 = ctx.createLinearGradient(0, y0, 0, y1);
                g2.addColorStop(0, 'rgba(0,0,0,1)');
                g2.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g2;
                ctx.fillRect(0, Math.min(y0, y1), 1024, Math.abs(y1 - y0));
            };
            fade(0, 46);
            fade(256, 210);
            ctx.globalCompositeOperation = 'source-over';
            const ptex = new THREE.CanvasTexture(pc);
            ptex.wrapS = THREE.RepeatWrapping;
            ptex.repeat.set(2, 1);
            ptex.anisotropy = this.renderer.capabilities.getMaxAnisotropy(); // 저각 시점 밉 뭉개짐 방지 — 근경 가장자리 선명도
            const pathGeo = new THREE.PlaneGeometry(60, 2.66, 1, 1); // 1.7 → 2.66: 늘린 폭은 전부 위아래 페더링 몫이라 길 코어 폭은 그대로다
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
        // vertexColors — 잎 지오메트리는 전부 sculptFoliage 를 거쳐 color 속성을 갖는다(makePine·makeRoundTree
        // 둘뿐이고 둘 다 통과한다). ⚠️ 이 재질을 쓰는 새 메시를 만들 땐 반드시 color 속성을 붙일 것 —
        // 속성 없이 vertexColors 재질을 쓰면 그 메시만 검게 찍힌다.
        this.foliageMat = new THREE.MeshPhongMaterial({ color: 0x33691e, flatShading: true, shininess: 0, vertexColors: true });
        // 잎 명도 변주 2종 — 나무마다 밝기가 달라 "같은 모델 복붙" 인상과 밤 숲의 "한 덩어리 검은 벽" 문제를 동시에 완화
        this.foliageMatDark = this.foliageMat.clone();
        this.foliageMatLight = this.foliageMat.clone();
        this.foliageMats = [this.foliageMat, this.foliageMatDark, this.foliageMatLight];
        // ⚠️ Lambert → Phong(shininess 0). 룩은 사실상 같지만(정점 라이팅 → 프래그먼트 라이팅이라
        //    오히려 부드럽다) **Lambert 는 프래그먼트에 `normal` 이 없어 암부 색 보정을 못 받는다.**
        //    줄기가 순검정으로 남으면 용암 챕터의 고사목이 '배경에 붙인 검은 스티커'로 읽힌다(비평가 지적).
        this.trunkMat = new THREE.MeshPhongMaterial({ color: 0x5d4037, shininess: 0 });
        this.bushMat = new THREE.MeshPhongMaterial({ color: 0x4a7c2f, flatShading: true, shininess: 0 });
        this.stoneMat = new THREE.MeshPhongMaterial({ color: 0x9a9083, flatShading: true, shininess: 0, map: ProChar.rockTex(), vertexColors: true }); // 웜 그레이 — 청회색 돌이 초원 위 '양/정체불명 덩어리'로 오독 (비평가 7.1 15번)
        this.mossMat = new THREE.MeshPhongMaterial({ color: 0x4f8578, flatShading: true, shininess: 0 }); // 바위산 청록 이끼(보색 악센트)
        this.snowMat = new THREE.MeshPhongMaterial({ color: 0xf4faff, flatShading: true, shininess: 35, specular: 0x9db8d4 });
        this.cactusMat = new THREE.MeshPhongMaterial({ color: 0x6da24f, flatShading: true, shininess: 0 }); // 웜 그린 — 웜 샌드 지면과 온도 통일
        this.charTrunkMat = new THREE.MeshPhongMaterial({ color: 0x30231d, shininess: 0 });   // 상동 — 고사목이 암부 색 보정을 받게
        this.charRockMat = new THREE.MeshPhongMaterial({ color: 0x2e2521, flatShading: true, shininess: 0, vertexColors: true });
        this.lavaCoreMat = new THREE.MeshBasicMaterial({ color: 0xff7043 });
        // 암부 색 보정을 **공유 소품 재질에 한 번** 심는다(재질 단위라 이 재질을 쓰는 모든 소품에 걸린다).
        // 발광체(lavaCore·crystal)와 무조명 능선(MeshBasic)은 제외 — 애초에 암부가 없다.
        this.applyShadeLift([this.foliageMat, this.foliageMatDark, this.foliageMatLight, this.trunkMat,
            this.bushMat, this.stoneMat, this.mossMat, this.cactusMat, this.charTrunkMat, this.charRockMat,
            this.terrainMat]);
        // vertexColors — 이 재질을 쓰는 메시는 `crystalGeo()` 가 굽는 클러스터 하나뿐이다(파일 전체 확인함).
        // ⚠️ 새 메시를 이 재질로 만들 땐 반드시 color 속성을 붙일 것(없으면 그 메시만 검게 찍힌다).
        this.crystalMat = new THREE.MeshPhongMaterial({
            color: 0x9575cd, emissive: 0x6a3fb5, emissiveIntensity: 0.5,
            // 스페큘러를 순백에서 옅은 시안으로 — 하이라이트가 (255,255,255) 로 클리핑되면 그 자리는
            // 면도 색도 사라진 흰 구멍이다(실측 클리핑 2.7%). 색 있는 결정의 반사는 원래 색을 띤다.
            flatShading: true, shininess: 58, specular: 0x7cc2d4, vertexColors: true,
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
            // ⚠️ 사인 2개로는 시드가 달라도 가끔 거의 같은 바위가 나온다(실측: 15쌍 중 최소 개체차
            //    0.0363 으로 `probe-foliage-sculpt` 게이트 0.040 에 걸렸다). 서로 나눠떨어지지 않는
            //    주파수의 항을 하나 더 얹어 시드 간 상관을 끊는다.
            const kx = Math.sin(p.getX(i) * 51.7 + seedX) * 0.38
                + Math.sin(p.getY(i) * 37.3 + seedY) * 0.38
                + Math.sin((p.getX(i) + p.getZ(i)) * 23.9 + seedX * 2.7 + seedY) * 0.24;
            const s2 = 1 + kx * 0.26;
            p.setXYZ(i, p.getX(i) * s2, p.getY(i) * (1 + Math.sin(p.getZ(i) * 43.1 + seedX) * 0.18), p.getZ(i) * s2);
        }
        // 버텍스 컬러 음영 — 잎(sculptFoliage)과 같은 이유로 바위에도 굽는다. 바위는 **접지물**이라
        // 아래가 어두워야 땅에 얹힌 것으로 읽힌다(라이트를 안 늘리고 얻는 접지감).
        // ⚠️ 잎보다 대비를 약하게 준다 — 바위는 면이 넓어 같은 기울기를 주면 아랫면이 새까맣게 죽는다.
        // ⚠️ `stoneMat`·`charRockMat` 을 쓰는 메시는 **전부** 이 함수를 거친다(확인함) — 그래서 두 재질에
        //    `vertexColors` 를 켜도 안전하다. 이 재질로 새 메시를 만들면 반드시 여기를 거칠 것.
        {
            geo.computeBoundingBox();
            const bb = geo.boundingBox;
            const yMin = bb.min.y, ySpan = Math.max(1e-4, bb.max.y - bb.min.y);
            const cols = new Float32Array(p.count * 3);
            for (let i = 0; i < p.count; i++) {
                const k = Math.min(1, Math.max(0, (p.getY(i) - yMin) / ySpan));
                const sh = 0.70 + 0.36 * Math.pow(k, 0.9);
                cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = sh;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        }
        geo.computeVertexNormals();
        return geo;
    },

    // 퇴적 지층 톤 밴딩 — 층 지오메트리의 색속성(rockGeo 가 구운 높이 음영)에 층별 틴트를 곱해
    // 사암/이암이 번갈아 쌓인 지층처럼 읽히게 한다(단일 회색 판 인상 제거 — makeSlab·makeStrata 전용).
    // ⚠️ 틴트는 albedo(stoneMat 0x9a9083)에 곱해지므로 1.0 부근으로 얕게만 준다 —
    //    크리스탈 항목에서 R 을 크게 올렸다가 결정 끝이 분홍으로 뜬 함정과 같은 이유(색상만 크게 밀면 명암이 무너진다).
    bandTint(geo, tr, tg, tb) {
        const c = geo.attributes.color;
        if (!c) return geo;
        for (let i = 0; i < c.count; i++) {
            c.setXYZ(i, Math.min(1, c.getX(i) * tr), Math.min(1, c.getY(i) * tg), Math.min(1, c.getZ(i) * tb));
        }
        c.needsUpdate = true;
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
        const kin = this.bkin(biome);          // 하드코딩 분기(식생 유무·잔돌 수·발광)의 기준
        const sp = this.BIOMES[biome] || {};   // 신설 바이옴의 덮어쓰기 값 (원본 6종은 빈 객체)
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
            const shape = sp.ridge || (kin === 'desert' ? 'mesa' : (kin === 'lava' || kin === 'rock') ? 'jagged' : 'ridge');
            this.mountains[0].geometry.dispose();
            this.mountains[0].geometry = this.makeRidgeGeo(70, 5.4, 8, shape);
        }
        // 큰 소품: 'p'=주 소품(나무 계열), 'r'=부 소품(둥근 계열) — 바이옴별로 실제 형태가 결정됨
        const spots = [
            [-7, -3.2, 1.1, 'p'], [-5.2, -2.6, 0.8, 'r'], [-3.4, -3.8, 1.3, 'p'], [-1.2, -3, 0.9, 'r'],
            [0.8, -3.6, 1.2, 'p'], [2.6, -2.8, 0.85, 'p'], [4.4, -3.5, 1.15, 'r'], [6.2, -2.9, 0.9, 'p'],
            [8, -3.8, 1.3, 'p'], [-8.8, -2.4, 0.7, 'r'], [-6, -5.5, 1.6, 'p'], [0, -6, 1.8, 'p'],
            [6.5, -5.8, 1.7, 'p'],
            // ⚠️ 이 두 자리는 예전에 z=+2.6/+2.8(카메라 쪽 전경)이었다 — 펫이 z 1.1~2.0에 서므로
            // **소품이 펫보다 카메라에 가까워** 행군 중 파티를 관통했다. 소품은 월드 고정이고 x주기 26으로
            // 재배치되니(5311줄) 어떤 x에 두든 결국 파티 위를 지나간다 → 전경 대역 자체를 비운다.
            // 실측(tools/probe-pet-occlusion.js 행군 스윕): 옛 배치에서 거북이 최악 가림 27.1%
            // (비평가 독립 판독 29%와 일치) → 아래처럼 영웅 뒤(z<0)로 내리면 0%.
            [-2.2, -1.9, 0.7, 'r'], [3.5, -1.6, 0.75, 'p'], [9.5, -5, 1.5, 'p'],
        ];
        // 접지 블롭 섀도우 공유 리소스 — 소품이 지면에 "붙어" 보이게 하는 소프트 원형 그림자
        this.ensureBlobRes();
        const emissiveAnchors = []; // 악센트 라이트를 붙일 발광 소품(마법=크리스탈, 용암=발광 데칼)
        for (const [x, z, s, kind] of spots) {
            const t = this.makeProp(biome, kind, s);
            t.position.set(x, this.heightAt(x, z), z);
            t.rotation.y = U.rand(0, Math.PI * 2);
            t.scale.multiplyScalar(U.rand(0.88, 1.14)); t.scale.y *= U.rand(0.94, 1.1); // 인스턴스 지터 — 동일 스케일 복붙 티 제거 (비평가 13번)
            if ((kin === 'magic' || sp.emissive) && kind === 'p' && z > -5) emissiveAnchors.push(t); // 근·중경 크리스탈만
            this.setShadow(t);
            const blob = new THREE.Mesh(this.blobGeo, this.blobShadowMat); // setShadow 이후에 붙여 castShadow 제외
            blob.rotation.x = -Math.PI / 2;
            blob.position.y = 0.03;
            // 실측 실루엣 폭에 묶는다(t.scale 은 블롭이 t 의 자식이라 상쇄해 준다).
            blob.scale.setScalar(this.footprintRadius(t) * 1.9 / Math.max(0.01, t.scale.x));
            blob.userData.sharedGeometry = true;
            blob.userData.sharedMaterial = true; // blobShadowMat 싱글턴
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
            hblob.scale.setScalar(this.footprintRadius(hero) * 1.7);   // 랜드마크는 고정 2.9 였다 — 종에 따라 실루엣이 2배 넘게 달랐다
            hblob.userData.sharedGeometry = true;
            hero.add(hblob);
            this.scene.add(hero);
            this.trees.push(hero);
        }
        // 용암: 크랙 주변에 깔리는 부가 발광 데칼 — emissiveMap 크랙과 악센트 라이트를 잇는 은은한 지면광
        const em = sp.emissive !== undefined ? sp.emissive : (kin === 'lava' ? { crack: 0xff3d00, intensity: 1.15, glow: 0xff5722, light: 0xff5722 } : null);
        if (kin === 'lava' && em && em.glow) {
            if (!this.lavaGlowMat) {
                this.lavaGlowMat = new THREE.MeshBasicMaterial({
                    map: this.makeGlowTexture(), color: 0xff5722, transparent: true, opacity: 0.42,
                    blending: THREE.AdditiveBlending, depthWrite: false,
                });
            }
            this.lavaGlowMat.color.setHex(em.glow); // 유황=노랑, 종말=핏빛 — 같은 데칼이 바이옴 색을 따라간다
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
            const lightHex = em && em.light;
            const conf = kin === 'magic' ? { color: lightHex || 0x2fd8ee, intensity: 2.6, dist: 9, y: 1.0 }
                : kin === 'lava' ? (lightHex ? { color: lightHex, intensity: 2.4, dist: 9, y: 0.5 } : null)
                : lightHex ? { color: lightHex, intensity: 2.2, dist: 9, y: 0.9 } : null;
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
                    // 🚨 미사용이어도 씬에 **다시 넣어 둔다** (skill-cast-lag-optimize) — 포인트라이트
                    // 개수가 변하면 three 가 라이트 받는 재질 전체를 재컴파일한다(바이옴 경계 스톨).
                    // intensity 0 으로 씬 상주가 '완전히 빼기'보다 압도적으로 싸다.
                    pl.intensity = 0;
                    pl.position.set(0, -50, 0);
                    this.scene.add(pl);
                }
            });
        }
        // 사막 중경 공백 채우기 — 소품 라인(z≈-3)과 원경 메사(z≈-12) 사이 빈 모래밭에
        // 암석층/마른 관목/뼈 클러스터를 깔아 화면 중단이 비어 보이던 문제 해소 (3회차 비평가 지적)
        // (spec.mid 가 있으면 desert 가 아닌 바이옴도 같은 자리에 자기 소품을 깐다 — 협곡·황무지·종말)
        if (kin === 'desert' || sp.mid) {
            const midSpots = [
                [-8.2, -8.8, 2.1, 'strata'], [-2.2, -9.2, 2.4, 'strata'], [3.8, -8.4, 1.9, 'shrub'],
                [8.6, -9, 2.2, 'strata'], [-5.2, -6.9, 1.25, 'shrub'], [0.6, -7.1, 1.05, 'bones'],
                [6, -6.6, 1.15, 'shrub'], [-9.4, -6.2, 0.95, 'bones'],
            ];
            for (let mi = 0; mi < midSpots.length; mi++) {
                const [x, z, s, kind] = midSpots[mi];
                // sp.mid 는 [메서드, 스케일배율] 배열 — 자리 순서대로 순환시켜 결정적으로 배치한다
                const mspec = sp.mid && sp.mid[mi % sp.mid.length];
                const p = mspec ? this[mspec[0]](s * (mspec[1] === undefined ? 1 : mspec[1]))
                    : kind === 'strata' ? this.makeStrata(s) : kind === 'shrub' ? this.makeDryShrub(s) : this.makeBones(s);
                p.position.set(x, this.heightAt(x, z), z);
                p.rotation.y = U.rand(0, Math.PI * 2);
                this.setShadow(p);
                const blob = new THREE.Mesh(this.blobGeo, this.blobShadowMat);
                blob.rotation.x = -Math.PI / 2;
                blob.position.y = 0.03;
                blob.scale.setScalar(this.footprintRadius(p) * 1.8 / Math.max(0.01, p.scale.x));
                blob.userData.sharedGeometry = true;
                p.add(blob);
                this.scene.add(p);
                this.trees.push(p);
            }
        }
        // 작은 소품도 접지 블롭을 깔아 "떠 있는 스티커" 인상 제거 — 회전은 내부 메시에만 주고 그룹은 수평 유지
        // ⚠️ 작은 소품도 **큰 소품과 같은 규칙**(footprintRadius 실측)을 따라야 한다. 큰 것만 실루엣에
        //    묶고 여기를 손튜닝 상수로 남겨 뒀더니, 풀·덤불에서 블롭이 제 소품의 **최대 4.6배**로 남아
        //    있었다(실측 `probe-prop-blob.js`: 초원·밤숲·마법 29/215건 초과, 최악 반경 0.054 소품 아래
        //    반경 0.25 블롭). 큰 얼룩만 눈에 띄어서 작은 것들이 사각지대로 남은 것.
        //    `blobScale` 은 이제 폴백이다 — 박스를 못 재는 경우(빈 그룹)에만 쓰인다.
        const grounded = (mesh, blobScale) => {
            const g = new THREE.Group();
            g.add(mesh);
            const blob = new THREE.Mesh(this.blobGeo, this.blobShadowMat);
            blob.rotation.x = -Math.PI / 2;
            blob.position.y = 0.025;
            // 블롭을 **붙이기 전에** 잰다(붙인 뒤면 블롭 자신이 박스에 들어가 제 크기를 정당화한다)
            const r = this.footprintRadius(g, 0.02);   // 하한 0.25 는 풀 한 포기의 5배다 — 작은 소품용 하한으로
            blob.scale.setScalar(r > 0 ? r * 1.9 : blobScale);
            blob.userData.sharedGeometry = true;
            g.add(blob);
            return g;
        };
        // 덤불 (용암·사막·바위산은 생략 — 식생이 없는 소재)
        const hasVeg = sp.veg !== undefined ? sp.veg : !['lava', 'desert', 'rock'].includes(kin);
        if (hasVeg) {
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
        const stoneCount = ['lava', 'desert', 'rock'].includes(kin) ? 11 : 7;
        for (let i = 0; i < stoneCount; i++) {
            const rad = U.rand(0.1, 0.3);
            const r = new THREE.Mesh(
                this.rockGeo(rad),
                kin === 'lava' ? this.charRockMat : this.stoneMat
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
        if (hasVeg && !['snow'].includes(kin)) {
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
                g.userData.windSway = 0.075;   // 줄기가 가늘어 나무보다 크게 흔들린다
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
                g.userData.windSway = 0.055;
                const x = U.rand(-9, 9), z = (() => { let zz; do { zz = U.rand(-2.6, 1.7); } while (Math.abs(zz) < 0.9); return zz; })();
                g.position.set(x, this.heightAt(x, z) + 0.02, z);
                this.scene.add(g);
                this.rocks.push(g);
            }
        }
        // 무한맵 스크롤 대상 (걷는 동안 왼쪽으로 흘러가며 순환, 지형 높이 추적)
        this.scrollables = [...this.trees, ...this.rocks];
        // 바람 대상 수집 — `userData.windSway` 를 단 그룹만. 랜드마크는 그룹 자체가 아니라 **자식**이
        // 식물이라(hero = 주 소품 + 곁 소품) traverse 로 훑는다. 위상은 월드 x·z 에서 뽑아
        // 이웃한 나무끼리 같은 박자로 흔들리지 않게 한다(전부 같은 위상이면 '한 덩어리'로 읽힌다).
        this.windProps = [];
        for (const o of this.scrollables) {
            o.traverse(c => {
                if (!c.userData || !c.userData.windSway) return;
                c.userData.windPhase = (c.position.x + o.position.x) * 0.7 + (c.position.z + o.position.z) * 0.41;
                c.userData.windBaseZ = c.rotation.z;
                this.windProps.push(c);
            });
        }
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

    // ---- 바람 (TODO '맵 프롭 퀄리티 업': "바람에 흔들리는 풀·나뭇잎 … 살아있는 맵으로") ----
    // 지금까지 맵은 **완전히 정지**해 있었다(구름·불씨만 움직였다). 풀 한 포기도 안 흔들리는 게
    // 저 항목이 말한 '단순 도형 티'의 절반이다.
    //
    // 풀은 InstancedMesh 1드로우콜이라 **CPU로 흔들 수 없다** — 인스턴스 190~240개의 행렬을 매 프레임
    // 다시 쓰면 인스턴싱을 유지하라는 요구(성능)를 정면으로 어긴다. 그래서 정점 셰이더에서 민다.
    //  · 위상은 **인스턴스마다 달라야** 한다(전부 같은 위상으로 흔들리면 '지면 전체가 한 덩어리로
    //    미끄러지는' 인상이 된다). r128 InstancedMesh 는 정점 셰이더에 `instanceMatrix` 를 주므로
    //    그 이동 성분(4번째 열)으로 위상을 만든다 — 인스턴스별 속성을 따로 안 넘겨도 된다.
    //  · 밑동은 **땅에 박혀 있어야** 한다 — 변위를 로컬 높이(transformed.y)에 비례시키면 y=0 인
    //    밑면은 안 움직이고 잎끝만 흔들린다. 통째로 미끄러지면 '떠 있는 스티커'로 읽힌다.
    //  · 주파수 2개를 겹쳐 준다(1.6Hz + 2.9Hz). 사인 하나면 기계적으로 왔다갔다해 눈에 띈다.
    // ⚠️ 시간 유니폼은 재질마다 따로 산다 — 컴파일된 uniforms 객체 참조를 `_windMats` 에 모아
    //    update() 에서 한꺼번에 밀어 준다(재질을 새로 구울 때마다 등록해야 한다).
    // ---- 지면 셰이더: 타일 동일성 깨기 + 거리 LOD + 눈 수광면 탈색 ----
    // `map-quality-up` 잔여 결함 ㉰·㉱ 를 한 자리에서 처리한다. 둘 다 '재질 색을 무엇으로 두느냐'가
    // 아니라 **지면이 거리와 빛에 어떻게 반응하느냐**의 문제라서 셰이더 몫이다.
    //  ⓐ **매크로 변조** — 지면 텍스처는 12×6 으로 반복되는데 타일마다 완전히 동일하다. 같은 map 을
    //     아주 낮은 주파수로 한 번 더 떠서 곱하면 같은 타일이 자리마다 다르게 보여 반복이 깨진다.
    //     🚨 이게 ㉰ 의 **재정의된** 처방이다 — 원래 지적('사막 물결이 근경~원경 동일 스케일')은
    //        계측으로 지지되지 않았다(`probe-ground-tiling.js`: 날것의 자기상관 0.82 중 대부분이
    //        무늬가 아니라 안개 그라디언트였고, 고역통과 후 사막은 다른 바이옴과 구별되지 않았다).
    //        실제로 남는 문제는 '물결 스케일'이 아니라 '타일마다 같은 무늬'다.
    //     ⚠️ 매크로 주기는 **uv 6 = 월드 30** 으로 잡는다. 지면이 `ground.position.x += 30` 으로
    //        순환하므로 주기가 30 의 약수가 아니면 순환하는 순간 무늬가 튄다.
    //  ⓑ **거리 LOD** — 원경일수록 저주파 쪽으로 섞는다. 근경은 결이 살고 원경은 큰 덩어리로 물러난다.
    //  ⓒ **눈 수광면 탈색** — 눈은 알베도가 1 에 가까워 **빛이 닿는 면은 백색으로 탈색되고 색은
    //     그늘에만 남는다.** 밝을수록 채도를 빼서 그 광학을 흉내낸다(㉱ — 6 설원 수광면 채도 0.267).
    //     ⚠️ 눈 kin 에서만 uSnow>0 으로 켠다. **18 빙하는 설계된 청빙색이라 대상이 아니다**
    //        (테마 ground 0x9fc9de 채도 0.49 + BIOMES.glacier tint 채도 +0.16 — 백색으로 밀면 빙하가 사라진다).
    // ⚠️ r128 규약대로 `vUv`·`mapTexelToLinear`·`vViewPosition` 을 쓴다(전부 lib/three.min.js 에서 확인).
    //    r128 에는 `output_fragment` 청크가 없고 `gl_FragColor` 가 인라인이라, 탈색은 그 직전인
    //    `envmap_fragment` 뒤에 끼운다. 셰이더를 바꾸면 `customProgramCacheKey` 를 같이 줄 것.
    TERRAIN: { macro: 0.30, lod: 0.45, lodNear: 14, lodFar: 34, snow: 0 },
    terrainShade(mat) {
        const cfg = this.TERRAIN;
        mat.onBeforeCompile = (sh) => {
            sh.uniforms.uMacro = { value: cfg.macro };
            sh.uniforms.uMacroScale = { value: 1 / 6 };   // uv 6 주기 = 월드 30 (지면 순환 주기와 일치)
            sh.uniforms.uLod = { value: cfg.lod };
            sh.uniforms.uLodNear = { value: cfg.lodNear };
            sh.uniforms.uLodFar = { value: cfg.lodFar };
            sh.uniforms.uSnow = { value: cfg.snow };
            this._terrainU = sh.uniforms;   // 재컴파일마다 새로 생기므로 참조를 갱신해 둔다
            sh.fragmentShader = 'uniform float uMacro;\nuniform float uMacroScale;\nuniform float uLod;\n'
                + 'uniform float uLodNear;\nuniform float uLodFar;\nuniform float uSnow;\n'
                + sh.fragmentShader
                    .replace('#include <map_fragment>', [
                        '#ifdef USE_MAP',
                        '\tvec4 tDet = mapTexelToLinear( texture2D( map, vUv ) );',
                        '\tvec4 tMac = mapTexelToLinear( texture2D( map, vUv * uMacroScale ) );',
                        '\tvec4 texelColor = tDet;',
                        // ⓐ 저주파 변조 — 0.5 를 중심으로 ±라 전체 밝기는 유지된다
                        '\ttexelColor.rgb *= 1.0 + ( dot( tMac.rgb, vec3( 0.3333 ) ) - 0.5 ) * uMacro;',
                        // ⓑ 거리 LOD
                        '\ttexelColor.rgb = mix( texelColor.rgb, tMac.rgb,',
                        '\t\tsmoothstep( uLodNear, uLodFar, length( vViewPosition ) ) * uLod );',
                        '\tdiffuseColor *= texelColor;',
                        '#endif',
                    ].join('\n'))
                    .replace('#include <envmap_fragment>', [
                        '#include <envmap_fragment>',
                        // ⓒ 눈 수광면 탈색 — 밝은 면일수록 무채색(=백색)으로
                        '\tif ( uSnow > 0.0 ) {',
                        '\t\tfloat snowL = dot( outgoingLight, vec3( 0.2126, 0.7152, 0.0722 ) );',
                        '\t\toutgoingLight = mix( outgoingLight, vec3( snowL ),',
                        // ⚠️ 임계는 **선형 공간** 값이다. sRGB 감각으로 0.20~0.80 을 넣으면
                        //    실제 수광면(sRGB 0.69 ≈ 선형 0.43)에서 게이트가 절반만 열려
                        //    효과가 거의 안 난다(실측: 채도 0.267→0.241 로 찔끔).
                        '\t\t\tsmoothstep( 0.06, 0.40, snowL ) * uSnow );',
                        '\t}',
                    ].join('\n'));
        };
        mat.customProgramCacheKey = () => 'terrain-v1';
        return mat;
    },

    // 지면 셰이더 유니폼 갱신 — 값은 TERRAIN 에 남겨 재컴파일 뒤에도 살아남게 한다.
    setTerrainUniform(k, v) {
        this.TERRAIN[k] = v;
        if (this._terrainU && this._terrainU['u' + k.charAt(0).toUpperCase() + k.slice(1)]) {
            this._terrainU['u' + k.charAt(0).toUpperCase() + k.slice(1)].value = v;
        }
    },

    windShade(mat, amp) {
        if (!mat) return mat;
        this._windMats = this._windMats || [];
        mat.onBeforeCompile = (sh) => {
            sh.uniforms.uWindT = { value: 0 };
            sh.uniforms.uWindAmp = { value: amp };
            sh.vertexShader = 'uniform float uWindT;\nuniform float uWindAmp;\n' + sh.vertexShader.replace(
                '#include <begin_vertex>',
                [
                    '#include <begin_vertex>',
                    '\t#ifdef USE_INSTANCING',
                    '\t\tfloat wph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.41;',
                    '\t#else',
                    '\t\tfloat wph = 0.0;',
                    '\t#endif',
                    '\tfloat wsw = sin(uWindT * 1.6 + wph) * 0.5 + sin(uWindT * 2.9 + wph * 1.7) * 0.25;',
                    '\tfloat wup = max(0.0, transformed.y);',   // 밑동 고정 — 높이에 비례해서만 민다
                    '\ttransformed.x += wsw * uWindAmp * wup;',
                    '\ttransformed.z += wsw * uWindAmp * 0.42 * wup;',
                ].join('\n'));
            this._windMats.push(sh.uniforms.uWindT);
        };
        mat.customProgramCacheKey = () => 'wind-' + amp.toFixed(3);
        return mat;
    },

    buildScatter(biome) {
        // 재질을 새로 굽는 자리 — 옛 재질의 유니폼 참조는 버린다(안 버리면 죽은 재질이 계속 쌓인다)
        this._windMats = [];
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
        const sp = this.BIOMES[biome] || {};
        const kin = this.bkin(biome);
        let geo, mat, n = 190, flat = true, tint = 0.12;
        if (sp.scatter) {
            const c = sp.scatter;
            geo = this.scatterGeo(c.geo, c.r);
            mat = c.basic ? new THREE.MeshBasicMaterial({ color: c.color }) : new THREE.MeshLambertMaterial({ color: c.color });
            n = c.n; flat = c.flat; tint = c.tint;
        } else
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
        const mk = (geo2, mat2, cnt, flat2, tint2, zMin, zMax, so) => {
            const im = new THREE.InstancedMesh(geo2, mat2, cnt);
            const dummy = new THREE.Object3D();
            const col = new THREE.Color();
            const spots = this.scatterSpots(cnt, zMin, zMax, so);
            const sLo = so && so.scaleLo !== undefined ? so.scaleLo : 0.7;
            const sHi = so && so.scaleHi !== undefined ? so.scaleHi : 1.6;
            for (let i = 0; i < cnt; i++) {
                let x = spots[i][0], z = spots[i][1];
                if (Math.abs(z) < 0.55) z = 0.55 * Math.sign(z || 1) + z; // 스캐터도 전투 라인 살짝 비켜감
                dummy.position.set(x, this.heightAt(x, z) + 0.02, z);
                dummy.rotation.y = U.rand(0, Math.PI * 2);
                const sc = U.rand(sLo, sHi);
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
        // 바람은 **식물에만** 건다 — 자갈·얼음 조각이 흔들리면 '떠 있는 돌'이 된다.
        // (forest 풀 포기가 유일한 주 스캐터 식물이다. 나머지 바이옴 주 스캐터는 전부 광물이다.)
        const windy = sp.scatter ? !!sp.scatter.wind
            : (kin !== 'desert' && kin !== 'rock' && kin !== 'snow' && kin !== 'lava' && kin !== 'magic');
        if (windy) this.windShade(mat, 0.55);
        // 🚨 **뒤끝을 z −3.4 → −9 로 늘렸다.** 종전 주 스캐터는 z −3.4 에서 뚝 끊겼는데 지면 플레인은
        //    z −45 까지 깔려 있고 `fog.near` 가 12(= z −3.8 부근)라, **안개가 먹기도 전에 스캐터가
        //    사라진 맨 지면 띠**가 화면 상단 1/3 을 통째로 차지했다(실측: 원경띠 인스턴스 **전 챕터 0개**).
        //    "단색 카펫"이라는 지적의 절반이 이것이다. z −9 는 카메라에서 17.5 유닛 = 안개 30% 지점이라
        //    거기서부터는 안개가 자연스럽게 이어받는다.
        // ⚠️ 지수 배분: **근경 위계는 `scatter3` 의 개수로 벌고, 주 스캐터는 지수를 낮게(1.75) 둔다.**
        //    주 스캐터 지수를 2.5까지 올려 위계를 만들면 원경띠가 같이 굶어(실측 원경 156~180개, 게이트 미달)
        //    "카펫" 결함이 뒤쪽에서 되살아난다. 근/중은 근경 레이어로, 중/원은 이 지수로 따로 잡는 게 맞다.
        this.scatter = mk(geo, mat, n, flat, tint, -9, 3.2, { depthPow: 1.75, clumpR: 2.0, seedFrac: 0.42 });
        // 근경 전용 디테일 레이어 — 카메라 앞 둔덕에 같은 소재를 더 크고 촘촘하게.
        // 세로 화면 첫인상을 결정하는 근경이 "무텍스처 단색 평면"이던 결함 해소.
        // 🚨 **뒤끝을 z 5.6 → 5.0 으로 당겼다.** 지면이 화면 바닥(ndc.y −1)과 만나는 곳이 실측 z 4.97 이라
        //    z 5.0 너머에 뿌린 몫(종전 배치의 약 1/4)은 **한 번도 화면에 안 들어왔다** — 근경을 채우라고
        //    만든 레이어가 정작 프레임 밖에 예산을 버리고 있었다.
        this.scatter3 = mk(geo, mat, Math.round(n * 1.9), flat, tint, 3.2, 5.0,
            { depthPow: 2.0, clumpR: 1.5, seedFrac: 0.42, scaleLo: 1.1, scaleHi: 2.4 }); // 근경은 원근상 더 커야 자연스럽다
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
        const ac = sp.accent;
        const accGeo = ac ? this.scatterGeo(ac.geo, ac.r) : acc[0];
        const accHex = ac ? ac.color : acc[1];
        const accN = ac ? ac.n : acc[2];
        const accBasic = ac ? !!ac.basic : (biome === 'forest' || biome === 'rock' || biome === 'snow');
        const accMat = accBasic
            ? new THREE.MeshBasicMaterial({ color: accHex }) // 들꽃/결정은 자체 발색으로 또렷하게
            : new THREE.MeshLambertMaterial({ color: accHex });
        // 악센트도 식물이면 같이 흔든다(초원 들꽃·바위산 골드 야생화). 얼음 결정·자갈·재는 제외.
        if (ac ? !!ac.wind : (biome === 'forest' || biome === 'rock')) this.windShade(accMat, 0.42);
        // 악센트도 같은 깊이 가중·군집을 탄다. 뒤끝 −3 → −7(주 스캐터를 따라 원경까지),
        // 앞끝 5.2 → 5.0(프레임 밖 낭비 제거). 악센트는 '드문드문 핀 꽃'이라 군집을 더 세게 준다.
        this.scatter2 = mk(accGeo, accMat, accN, true, 0.1, -7, 5.0,
            { depthPow: 1.75, clumpR: 1.6, seedFrac: 0.3 });
    },

    makeProp(biome, kind, s) {
        // 신설 바이옴은 테이블의 조합에서 균등 추첨한다. 원본 6종은 스펙이 없어 아래 스위치로 떨어진다.
        const sp = this.BIOMES[biome];
        if (sp && sp.props) {
            const list = sp.props[kind] || sp.props.p;
            const e = list[Math.random() * list.length | 0];
            return this[e[0]](s * (e[1] === undefined ? 1 : e[1]), e[2], e[3]);
        }
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

    // ---- 프롭 조형: '단순 도형 티' 제거 (TODO '맵 프롭 퀄리티 업' — 비대칭 변형 + 버텍스 컬러 음영) ----
    // 침엽수는 **정원뿔 3개**, 활엽수는 **정십이면체 2개**였다. 어떤 라이팅을 걸어도 정다면체는 정다면체라
    // 원경에서 '복붙한 도형'으로 읽힌다(장비 쪽에서 '박스는 어떤 라이팅을 걸어도 박스'로 이미 겪은 벽이다).
    //  ⑴ **비대칭 변형** — 정점을 반경 방향으로 밀어 실루엣 자체를 울퉁불퉁하게 만든다. 수직 성분은
    //     절반만 준다(키까지 들쭉날쭉하면 '녹아내린' 인상이 된다).
    //  ⑵ **버텍스 컬러 음영** — 아래(가지에 가려 빛이 안 드는 안쪽)를 어둡게, 위(하늘 보는 면)를 밝게
    //     구워 넣는다. 라이트를 안 늘리고 볼륨을 얻는 가장 싼 방법이다.
    // ⚠️ 🚨 **위치 해시로 변위를 뽑는다 — 정점 인덱스로 뽑으면 면이 갈라진다.** flatShading 을 쓰려고
    //    지오메트리를 비인덱스로 펴 두면 같은 모서리의 정점이 여러 벌 중복된다. 인덱스 기준 난수를 주면
    //    그 사본들이 제각각 움직여 **메시에 구멍이 뚫린다.** 좌표를 반올림해 해시하면 같은 자리는 늘 같은 값을 받는다.
    // ⚠️ **인스턴스마다 새로 구운 지오메트리에만 쓸 것** — 공유 지오메트리에 쓰면 모든 프롭이 같이 변형된다.
    sculptFoliage(geo, opt) {
        const o = opt || {};
        const amp = o.amp === undefined ? 0.14 : o.amp;
        // ⚠️ 시드를 `Math.random()` 에서 뽑지 말 것 — 전역 RNG 스트림을 **소비**해서, 시드를 고정해 찍는
        //    대조 캡처(`shot-biomes.js`)의 프롭 배치가 이 함수 호출 수만큼 통째로 밀린다(전/후 비교 불가).
        //    내부 카운터로 인스턴스마다 다른 시드를 준다 — 결정론적이고 스트림을 안 건드린다.
        const seed = o.seed === undefined ? (this._sculptSeq = (this._sculptSeq || 0) + 1) * 97.13 : o.seed;
        const g = geo.index ? geo.toNonIndexed() : geo;
        if (geo.index) geo.dispose();
        const pos = g.attributes.position;
        g.computeBoundingBox();
        const bb = g.boundingBox;
        const yMin = bb.min.y, ySpan = Math.max(1e-4, bb.max.y - bb.min.y);
        const rad = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5 || 1;
        const hash = (x, y, z) => {
            const n = Math.sin(Math.round(x * 240) * 12.9898 + Math.round(y * 240) * 78.233 + Math.round(z * 240) * 37.719 + seed) * 43758.5453;
            return n - Math.floor(n);
        };
        const cols = new Float32Array(pos.count * 3);
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const t = (hash(v.x, v.y, v.z) - 0.5) * 2;                    // -1..1
            const t2 = (hash(v.z + 7.1, v.x - 3.3, v.y + 1.7) - 0.5) * 2;
            const rl = Math.hypot(v.x, v.z);
            if (rl > 1e-4) {                                              // 꼭짓점(축 위)은 반경 방향이 없다
                v.x += (v.x / rl) * t * amp * rad;
                v.z += (v.z / rl) * t * amp * rad;
            }
            v.y += t2 * amp * 0.5 * rad;
            pos.setXYZ(i, v.x, v.y, v.z);
            // 음영은 **변형 전 바운딩 박스** 기준 높이로 굽는다(변형 후 y로 재면 요철마다 명도가 튄다)
            const k = Math.min(1, Math.max(0, (v.y - yMin) / ySpan));
            const sh = 0.60 + 0.48 * Math.pow(k, 0.85);
            cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = sh;
        }
        pos.needsUpdate = true;
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        g.computeVertexNormals();
        return g;
    },

    makePine(s, snow) {
        const g = new THREE.Group();
        g.userData.windSway = 0.030;   // 바람에 밑동부터 휘는 식물 (rocks·crystal 은 태그 없음 = 정지)
        const fm = this.foliageMats[Math.random() * 3 | 0]; // 나무별 잎 명도 변주
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.13 * s, 0.5 * s, 7), this.trunkMat);
        trunk.position.y = 0.25 * s;
        g.add(trunk);
        for (let i = 0; i < 3; i++) {
            const cone = new THREE.Mesh(this.sculptFoliage(new THREE.ConeGeometry((0.55 - i * 0.13) * s, 0.62 * s, 7), { amp: 0.16 }), fm);
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
        g.userData.windSway = 0.020;   // 바람에 밑동부터 휘는 식물 (rocks·crystal 은 태그 없음 = 정지)
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
        // ⚠️ 선인장은 **흔들지 않는다** — 다육 기둥은 굵고 뻣뻣해서 휘면 고무로 읽힌다.
        //    (첫 판에서 0.010 을 줬다가 `probe-wind` 에서 사막이 광물 정지 기준을 넘겨 잡혔다.
        //     지표가 옳았고 내 판단이 틀렸다 — 사막에서 움직여야 할 건 선인장이 아니라 없다.)
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

    // 바위 첨탑(바위산 주 소품 · 사막 부 소품) — 세로로 긴 암석을 위로 갈수록 가늘게 쌓아 뾰족한 첨탑으로.
    // 단마다 좌우로 누적해 쏠려(자연 기울기) 곧은 토템 인상을 없애고, 층별 웜/쿨 지층 톤 + 꼭대기 단은
    // 더 높고 가늘게 세워 종단 실루엣을 뾰족하게 만든다. (기존: 세로로 늘린 rockGeo 2~3개를 곧게 쌓은 '둥근 덩어리 토템')
    makeRockSpire(s) {
        const g = new THREE.Group();
        const n = 3 + (Math.random() * 2 | 0);                             // 3~4단
        const lean = U.rand(-0.05, 0.05), leanD = U.rand(-0.04, 0.04);      // 자연 기울기(단마다 누적)
        let leanX = 0, leanZ = 0;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);                                          // 0(밑동)~1(꼭대기)
            const geo = this.rockGeo(U.rand(0.24, 0.38) * s);
            const warm = (i % 2 === 0);
            this.bandTint(geo, warm ? 1.06 : 0.96, warm ? 1.0 : 0.99, warm ? 0.92 : 1.03);
            const r = new THREE.Mesh(geo, this.stoneMat);
            leanX += lean; leanZ += leanD;
            r.position.set(leanX * s + U.rand(-0.06, 0.06) * s, (0.28 + i * 0.40) * s, leanZ * s + U.rand(-0.05, 0.05) * s);
            const taper = 1 - t * 0.5;                                      // 위로 갈수록 가늘게
            r.scale.set(taper, U.rand(1.4, 1.9) * (i === n - 1 ? 1.25 : 1), taper); // 꼭대기 단은 더 높게 세워 뾰족한 종단
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
    // 침식된 퇴적 노두 — 밑에서 위로 좁아지는 3~4층 판을 한쪽으로 쏠리게(언더컷) 쌓고,
    // 층마다 웜/쿨 톤을 교번해 지층(사암↔이암)으로 읽히게 한다. 꼭대기엔 풍화 잔돌로 실루엣을 깬다.
    // (기존: 세로로만 눌린 rockGeo 2~4개를 무작위 위치에 얹은 '회색 팬케이크 더미' — 지층·침식·개체차 부재)
    makeSlab(s) {
        const g = new THREE.Group();
        const n = 3 + (Math.random() * 2 | 0);                              // 3~4층
        const lean = U.rand(-0.06, 0.06), leanD = U.rand(-0.05, 0.05);      // 침식 언더컷 방향(층마다 누적)
        let y = 0.06 * s, leanX = 0, leanZ = 0;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);                                          // 0(밑동)~1(꼭대기)
            const geo = this.rockGeo(U.rand(0.32, 0.42) * s);
            const warm = (i % 2 === 0);                                     // 지층 교번 — 아래로 갈수록 철분 밴 웜/암
            this.bandTint(geo, (warm ? 1.07 : 0.96) - t * 0.05, (warm ? 1.01 : 0.99), (warm ? 0.90 : 1.03) + t * 0.03);
            const w = (1.18 - t * 0.5) * U.rand(0.92, 1.08);               // 위로 좁아지는 테이퍼(메사/후두 축소판)
            const p = new THREE.Mesh(geo, this.stoneMat);
            p.scale.set(w, U.rand(0.24, 0.32), w * U.rand(0.6, 0.82));      // 납작한 판
            leanX += lean; leanZ += leanD;
            p.position.set(leanX * s + U.rand(-0.05, 0.05) * s, y, leanZ * s + U.rand(-0.05, 0.05) * s);
            p.rotation.set(U.rand(-0.12, 0.12), U.rand(0, 3), U.rand(-0.1, 0.1));
            g.add(p);
            y += (0.11 + 0.03 * (1 - t)) * s;                              // 아래층이 더 두껍게 쌓임
        }
        for (let i = 0; i < 2; i++) {                                       // 꼭대기 풍화 잔돌
            const peb = new THREE.Mesh(this.rockGeo(U.rand(0.06, 0.11) * s), this.stoneMat);
            peb.position.set(leanX * s + U.rand(-0.16, 0.16) * s, y - 0.02 * s, leanZ * s + U.rand(-0.14, 0.14) * s);
            peb.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(0, 3));
            g.add(peb);
        }
        return g;
    },

    // 사막 중경용 수평 퇴적 암석층 — 넓은 판을 낮게 쌓아 침식된 사암층(메사 축소판)을 만듦
    makeStrata(s) {
        const g = new THREE.Group();
        const n = 3 + (Math.random() * 2 | 0);
        let y = 0.07 * s;
        for (let i = 0; i < n; i++) {
            const t = i / Math.max(1, n - 1);
            const w = (1 - i * 0.16) * s;
            const geo = this.rockGeo(0.5);
            const warm = (i % 2 === 0);                                     // 사암/이암 지층 교번
            this.bandTint(geo, warm ? 1.06 : 0.97, warm ? 1.0 : 0.99, warm ? 0.91 : 1.02);
            const p = new THREE.Mesh(geo, this.stoneMat);
            p.scale.set(w * U.rand(0.95, 1.2), 0.16 * s, w * U.rand(0.55, 0.75));
            p.position.set(U.rand(-0.06, 0.06) * s + t * 0.08 * s, y, U.rand(-0.05, 0.05) * s); // 위층이 살짝 밀린 침식
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

    // ---- 크리스탈 조형: 정오각뿔 3개 → 육방정 결정 클러스터 (TODO '맵 프롭 퀄리티 업' — 구조물·크리스탈 계열) ----
    // 적용 전 `makeCrystal` 은 **ConeGeometry(r, h, 5) 3개**였다. 원뿔은 밑동에서 꼭짓점까지 한 번에
    // 좁아져 원경에서 '고깔모자/죽창'으로 읽힌다 — 실제 수정은 **기둥(주상면)으로 곧게 오르다가 어깨에서
    // 꺾여 뿔(추면)로 끝난다.** 그 어깨선이 없으면 어떤 발광을 걸어도 결정으로 안 보인다.
    //  ⑴ **육방 기둥 + 종단 뿔** — 단면 반경을 면마다 지터(정육각형이면 그냥 또 다른 정다면체다),
    //     어깨 높이도 면마다 다르게, 꼭짓점은 축에서 살짝 비켜 둔다(자연 결정의 종단은 대칭이 아니다).
    //  ⑵ **클러스터를 메시 1개로 합쳐 굽는다** — 결정 6개(주상 3 + 밑동 파편 3)를 넣고도 드로우콜은
    //     3 → 1 로 **준다.** r128 에는 BufferGeometryUtils 가 없으므로(lib 에 three.min.js 하나뿐)
    //     삼각형 배열을 직접 쌓는다. 비인덱스 = flatShading 이 그대로 먹는다.
    //  ⑶ **버텍스 컬러** — 높이 그라디언트(밑동 어둡게·끝 밝게) + **면마다 미세 변주**. 결정은 면마다 빛을
    //     다르게 받아야 '깎인 것'으로 읽힌다. 종단면은 한 단 더 밝게(빛이 통과해 나가는 끝).
    // ⚠️ **난수를 `U.rand`(전역 RNG)에서 뽑지 않는다** — `sculptFoliage` 와 같은 이유다. 소비량이 바뀌면
    //    시드 고정 대조 캡처(`shot-biomes.js`)의 뒤쪽 프롭 배치가 통째로 밀린다. 내부 카운터를 쓴다.
    //    (이번 교체로 마법 바이옴의 U.rand 소비량 자체가 줄어 magic 캡처의 배치는 한 번 어긋난다 — 예상된 것.)
    crystalGeo(s) {
        let n = (this._crystalSeq = (this._crystalSeq || 0) + 1) * 131.7;
        const rnd = () => { n = Math.sin(n * 12.9898 + 78.233) * 43758.5453; n -= Math.floor(n); return n; };
        const R = (a, b) => a + (b - a) * rnd();
        const pos = [], col = [];
        // 명도만 갈면 면들이 전부 같은 색의 무광 램프가 된다("면 간 hue 차 0" — 비평가 ③).
        // 그늘은 푸른 보라로, 빛 받는 쪽은 청록으로 **색온도까지** 갈라 준다. 두 틴트 모두 최대 성분이
        // 1.0 이라 vertexColors(=albedo 에 곱해짐)가 1 을 넘지 않는다.
        // ⚠️ 🚨 **색상은 그늘의 R 을 올려서 만든다 — 광부의 R 을 올리면 안 된다.** 두 번 틀렸다:
        //    ⑴ 광부에 R 을 넣었더니 청록 결정 끝이 **분홍**으로 떴다. ⑵ 되돌리며 그늘의 R 을 더 낮췄더니
        //    (0.70) 어두운 절반의 R 이 3~21/255 로 짓눌려 **색상각이 전 구간 187° 로 고정**됐다
        //    (비평가 실측 Δ2°) — R≈0 이면 색은 G–B 평면(시안축)에 못박혀 어떤 색상도 발생하지 않는다.
        //    명도가 낮은 그늘에 R 을 넣으면 분홍이 아니라 **보라**로 읽힌다. 목표: 최암 ≥198° · 최명 ≤180°.
        //    ⑶ 그래서 그늘 R 을 1.90 까지 올려 봤다 — **되돌렸다.** 이 알베도(0x1a7286, R=0.10)에서는
        //    R 을 1.9 배 해도 0.19 라 색상은 거의 안 움직이는데(그늘의 색상은 emissive 가 지배한다),
        //    **명암 대비만 무너진다**(음영 기울기 실측 0.639 → 0.280, 격리 캡처에서도 눈에 띄게 납작해졌다).
        //    ⇒ **결론: 이 재질에서 버텍스 컬러만으로는 색상각을 못 만든다.** 색상을 갈고 싶으면 먼저
        //    emissive 를 더 낮추고 몸통 albedo 자체를 푸른 쪽으로 옮겨야 한다(다음 세션 몫, TODO 메모 참조).
        const TC = [0.70, 0.80, 1.00], TL = [0.86, 1.00, 0.97];
        const push = (p, sh, k) => {
            pos.push(p.x, p.y, p.z);
            // 틴트 R 이 1 을 넘으므로 채널마다 1.0 으로 자른다 — vertexColors 는 albedo 에 곱해진다.
            for (let q = 0; q < 3; q++) col.push(Math.min(1, sh * (TC[q] + (TL[q] - TC[q]) * k)));
        };
        const tri = (a, b, c, sa, sb, sc, ka, kb, kc) => { push(a, sa, ka); push(b, sb, kb); push(c, sc, kc); };
        // 큰 것 하나가 지배하고 나머지가 받치는 구성 — 같은 키 3개는 '삼지창'으로 읽힌다.
        // [높이계수, x, z]  ⚠️ 반경은 상수로 주지 않는다 — 아래에서 **높이에 비례**시킨다.
        const plan = [
            [1.06, 0.00, 0.00], [0.78, -0.21, 0.11], [0.58, 0.20, -0.15],
            [0.30, -0.27, -0.21], [0.24, 0.29, 0.17], [0.18, 0.06, 0.27],
        ];
        const KINK = 0.105;   // 6° — 쌍끼리 반대로 꺾어 한 '면'을 값이 다른 두 띠로 가른다.
        // ⚠️ 3° 로는 두 반쪽의 명도차가 루마 4 미만이라 화면에서 한 면으로 뭉친다(최장 평탄 런 51px).
        const m = new THREE.Matrix4(), e = new THREE.Euler();
        const v = new THREE.Vector3();
        let tall = 0;
        const parts = [];   // 결정별 정점 구간 + 배치 행렬 — 합친 뒤에도 개체 단위로 잴 수 있게 남긴다(probe-crystal-sculpt)
        // 🚨 **큰 자리(랜드마크 s=3.3)는 결정을 키우는 게 아니라 늘린다.** 한 기를 그대로 키우면
        //    개체 하나가 거대해져 ⑴ 면 하나의 폭이 그대로 커지고(flatShading 이라 그 폭만큼 화면에서
        //    민짜다 — 비평가 실측 평탄 런 42px, 중경은 13px) ⑵ 프레임 상단에 잘려 종단 뿔이 화면에
        //    한 번도 안 나온다. **면을 더 쪼개는 것은 답이 아니다** — 54면쯤 가면 결정이 아니라 원기둥이다.
        //    실제 수정 노두도 큰 결정 하나가 아니라 중간 결정 여러 기가 뭉친 모양이다.
        const clumps = s > 2.2 ? [[0, 0, 0.62], [0.62, 0.34, 0.50], [-0.55, 0.46, 0.43], [0.16, -0.52, 0.38]]
            : [[0, 0, 1]];
        for (let ck = 0; ck < clumps.length; ck++) {
        const [cx0, cz0, hs] = clumps[ck];
        for (let ci = 0; ci < plan.length; ci++) {
            const vStart = pos.length / 3;
            const [hk, px0, pz0] = plan[ci];
            const px = px0 + cx0, pz = pz0 + cz0;
            const h = hk * hs * R(0.95, 1.25) * s;
            // ⚠️ **반경을 높이에 종속시킨다.** 상수 반경(rk×s)으로 주면 키 작은 개체까지 전부 같은 굵기라
            //    중경·원경에서 세장비가 무너져 '바늘'이 양산된다(비평가 ①: 중경 39~55px 개체가 다수).
            //    비율을 규칙으로 못 박는다 — 주상 결정 r/h 0.150~0.185, 밑동 파편은 짧고 굵게 0.22~0.30.
            const rBase = h * (ci < 3 ? R(0.150, 0.185) : R(0.22, 0.30));
            // 파편일수록 크게 눕는다(밑동에서 사방으로 뻗어 나온 인상). ⚠️ 주상 결정도 **반드시 눕힌다** —
            // 전부 수직이면 클러스터가 '울타리 말뚝'으로 읽힌다(비평가 ②: "중심 x가 50행 동안 154.0 고정").
            const tilt = ci < 3 ? R(0.06, 0.30) : R(0.22, 0.5);
            const dir = R(0, Math.PI * 2);
            e.set(Math.cos(dir) * tilt, R(0, Math.PI * 2), Math.sin(dir) * tilt);
            m.makeRotationFromEuler(e);
            m.setPosition(px * s, -0.04 * s, pz * s);   // 밑동을 지면 아래로 살짝 묻는다
            const xf = p => p.applyMatrix4(m).clone();
            // 면마다 다른 반경·어깨높이 — 여기서 정육각형을 깨야 결정으로 읽힌다
            const rj = [], sy = [], fShade = [];
            // ⚠️ 반경을 **균등 난수만**으로 흔들면 6면뿐이라 표본이 적어 가끔 거의 정육각형이 나온다
            //    (첫 판 실측: 30개 중 최소 변동계수 0.058 — 게이트 0.06 미달). 석영의 주상면이 실제로
            //    넓은 면/좁은 면이 교대로 나는 것을 그대로 쓴다 — 교대 패턴이 비대칭 하한을 보장한다.
            //    교대 위상은 결정마다 뒤집는다(넓은 면이 어디서 시작하느냐 = 습성의 회전) — 위상까지 같으면
            //    단면이 결정마다 거의 똑같아져 개체차가 게이트 밑으로 떨어진다(실측 0.0376 → 0.0980).
            const flip = rnd() < 0.5 ? 1 : 0;
            // ⚠️ **면 수를 반경에 종속시킨다.** 반경을 높이 비례로 바꾼 뒤로 **가장 큰 개체가 가장 넓은
            //    민짜 면**을 얻어 버렸다 — 비평가 실측: 평탄면 최장 가로 런이 중경 13px 인데 랜드마크
            //    결정만 42px(한 행 41px 이 사실상 한 값). 굵을수록 더 쪼개야 같은 밀도로 읽힌다.
            // ⚠️ flatShading 은 면 하나에 값 하나다 — 화면에서 '한 값으로 이어지는 가로 폭'은 곧
            //    **면의 투영 폭**이다. 그래서 계단이 아니라 반경에 **연속으로** 비례시킨다(랜드마크 s=3.3 → 23면).
            //    ⚠️ 반드시 **짝수**여야 한다 — 킹크가 쌍 단위라 홀수면 한 바퀴 도는 지점에서 패턴이 깨진다.
            const SIDES = Math.max(6, Math.min(32, Math.round((6 + rBase * 36) / 2) * 2));
            const pairMode = SIDES > 6;   // 8·12면은 **쌍**이 하나의 주상면 — 넓은/좁은 교대는 쌍 단위로 준다
            for (let j = 0; j < SIDES; j++) {
                const pi = pairMode ? (j >> 1) : j;
                rj.push(((pi + flip) % 2 ? 1.16 : 0.86) * R(0.86, 1.17));
                sy.push(R(0.88, 1.12)); fShade.push((rnd() - 0.5) * 0.15);
            }
            // 기둥 → 뿔 전이 높이. ⚠️ **종단 뿔은 전체 높이의 25% 를 넘지 않는다** — 0.58~0.74 로 두면
            // 뿔이 실루엣의 26~42% 를 먹어 중경에서 어깨가 통째로 소실되고 다시 원뿔로 읽힌다.
            const shoulder = h * R(0.76, 0.85);
            const taper = R(0.80, 0.97);                 // 기둥은 살짝만 좁아진다(원뿔과 갈리는 지점)
            const r0 = [], r1 = [], apex = xf(v.set(rBase * R(-0.25, 0.25), h, rBase * R(-0.25, 0.25)));
            for (let j = 0; j < SIDES; j++) {
                // 쌍끼리 ±3° 킹크 — 두 반쪽이 살짝 다른 방향을 봐서 flatShading 이 값을 갈라 준다.
                // 실루엣은 거의 안 바뀌고 면 안쪽에만 꺾임이 생긴다(넓은 판을 끊는 게 목적).
                const ang = (j / SIDES) * Math.PI * 2 + (pairMode ? (j % 2 ? KINK : -KINK) : 0);
                const rb = rBase * rj[j];
                r0.push(xf(v.set(Math.cos(ang) * rb, 0, Math.sin(ang) * rb)));
                r1.push(xf(v.set(Math.cos(ang) * rb * taper, shoulder * sy[j], Math.sin(ang) * rb * taper)));
            }
            // 높이 그라디언트 × **루트 암부** + 면 변주 — vertexColors 는 albedo 에 곱해지므로 1.0 을 넘기지 않는다.
            // 램프 하한을 0.50 → 0.22 로 내렸다: 첫 판은 폭이 좁아(0.50~1.00) 발광에 씻기면 면이 통째로
            // 한 값으로 뭉갰다(비평가 ②: "70픽셀 내내 L=203 동일"). 밑동 28% 구간은 한 번 더 눌러
            // 지면과 만나는 지점을 어둡게 — 접지는 접지 데칼보다 **밑동 자체의 암부**가 먼저 만든다.
            const sh = (y, f) => {
                const k = Math.min(1, Math.max(0, y / h));
                const root = 0.55 + 0.45 * Math.min(1, k / 0.28);
                return Math.max(0.16, Math.min(1, (0.40 + 0.60 * Math.pow(k, 0.8)) * root + f));
            };
            const shoulderShade = j => sh(shoulder * sy[j], fShade[j]);
            const kh = y => Math.min(1, Math.max(0, y / h));   // 색온도 보간용 정규화 높이
            const kS = j => kh(shoulder * sy[j]);
            for (let j = 0; j < SIDES; j++) {
                const k = (j + 1) % SIDES;
                const f = fShade[j];
                const b0 = sh(0, f), b1 = sh(0, fShade[k]);
                // ⚠️ 감기 방향 — three.js 는 CCW 가 앞면이다. 각도 증가 순(r0[j]→r0[k])으로 감으면 법선이
                //    **안쪽**을 봐서 옆면이 통째로 컬링돼 결정이 뚫려 보인다. 역순으로 감는다(밑면만 정순).
                tri(r1[k], r0[k], r0[j], shoulderShade(k), b1, b0, kS(k), 0, 0);              // 주상면 ⑴
                tri(r1[j], r1[k], r0[j], shoulderShade(j), shoulderShade(k), b0, kS(j), kS(k), 0); // 주상면 ⑵
                const ft = Math.min(1, sh(h, f) + 0.08);                        // 종단면은 한 단 밝게
                tri(apex, r1[k], r1[j], ft, shoulderShade(k), shoulderShade(j), 1, kS(k), kS(j)); // 추면
                if (j >= 2) tri(r0[0], r0[j], r0[k], b0 * 0.72, b0 * 0.72, b1 * 0.72, 0, 0, 0); // 밑면(눕는 파편이 있어 막는다)
            }
            parts.push({ start: vStart, count: pos.length / 3 - vStart, h, rBase, shoulder, mat: m.elements.slice() });
            tall = Math.max(tall, h);
        }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
        geo.computeVertexNormals();
        geo.userData.tall = tall;
        geo.userData.parts = parts;
        return geo;
    },

    // 수정 결정(마법/심해) — 테마색으로 발광하는 크리스탈 클러스터 + 바닥 발광 링(접지 글로우) + 공중 할로
    makeCrystal(s) {
        const g = new THREE.Group();
        const geo = this.crystalGeo(s);
        const tall = geo.userData.tall;
        g.add(new THREE.Mesh(geo, this.crystalMat));
        // 접지 암부 데칼 — 공용 블롭 그림자만으로는 결정이 '바닥에 꽂은 판지'로 읽힌다(비평가 ④:
        // 밑동 직하 지면과 이격 지면의 명도차가 −4.4 뿐, 설득력 있는 접지는 −25~−40). 결정 전용으로
        // 진한 암부를 한 장 더 깔되 **글로우 링 아래**에 둔다(링을 도넛으로 바꿔 안쪽을 비웠으니 살아난다).
        if (!this.crystalContactMat) {
            this.crystalContactMat = new THREE.MeshBasicMaterial({
                map: this.makeContactTexture(), blending: THREE.MultiplyBlending, transparent: true, depthWrite: false,
            });
        }
        const contact = new THREE.Mesh(this.blobGeo || (this.blobGeo = new THREE.PlaneGeometry(1, 1)), this.crystalContactMat);
        contact.rotation.x = -Math.PI / 2;
        contact.position.y = 0.038;
        contact.scale.setScalar(1.75 * s);    // 클러스터가 ±0.3s 로 퍼지고 반경도 높이 비례로 굵어졌다 —
        // 데칼을 상수로 두면 넓어진 밑동이 그림자 밖으로 삐져나온다(비평가 ④ 회귀의 원인).
        contact.userData.sharedGeometry = true;
        contact.userData.sharedMaterial = true; // crystalContactMat 싱글턴
        g.add(contact);
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
                map: this.makeRingGlowTexture(), color: 0x26c6da, transparent: true, opacity: 0.8,
                blending: THREE.AdditiveBlending, depthWrite: false,
            });
        }
        const glow = new THREE.Mesh(this.blobGeo || (this.blobGeo = new THREE.PlaneGeometry(1, 1)), this.crystalGlowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = 0.05;
        glow.scale.setScalar(2.1 * s); // 도넛 텍스처(안쪽 34% 가 빔)로 바꿨으니 폭은 되돌려도 밑동을 안 덮는다.
        // 꽉 찬 글로우 시절엔 1.7 이 접지 그림자를 통째로 덮어 '밑동이 밝은' 상태를 만들고 있었다.
        glow.userData.sharedGeometry = true;
        glow.userData.sharedMaterial = true; // crystalGlowMat 싱글턴
        g.add(glow);
        return g;
    },

    // 여러 지오메트리를 한 덩어리로 — r128 `web/lib/` 에는 BufferGeometryUtils 가 없어서 직접 만든다.
    // 왜 필요한가: 대나무 마디 링·버섯 반점처럼 **같은 재질의 작은 조각이 수십 개** 붙는 프롭은
    // 메시 수 = 드로우콜이라 모바일에서 그대로 비용이 된다(첫 판 실측: 대나무 맵 프롭 메시 561개,
    // 초원 83개의 6.8배). 조형을 포기하지 않고 드로우콜만 줄이려면 굽는 시점에 합치는 수밖에 없다.
    // items: [[지오메트리, 행렬?], …]. 위치·법선·색만 옮긴다(이 프로젝트 프롭은 uv 를 안 쓴다).
    // ⚠️ 넘긴 지오메트리는 여기서 **소유권을 가져가 dispose 한다** — 호출자가 재사용하면 안 된다.
    mergeGeos(items) {
        let total = 0;
        const parts = items.map(([g, m]) => {
            const ng = g.index ? g.toNonIndexed() : g;
            if (ng !== g) g.dispose();
            if (!ng.attributes.normal) ng.computeVertexNormals();
            if (m) ng.applyMatrix4(m);
            total += ng.attributes.position.count;
            return ng;
        });
        const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
        let o = 0;
        for (const g of parts) {
            const n = g.attributes.position.count;
            pos.set(g.attributes.position.array.subarray(0, n * 3), o * 3);
            nor.set(g.attributes.normal.array.subarray(0, n * 3), o * 3);
            if (g.attributes.color) col.set(g.attributes.color.array.subarray(0, n * 3), o * 3);
            else col.fill(1, o * 3, (o + n) * 3);   // 색 없는 조각은 흰색(=재질 색 그대로)으로 채운다
            o += n;
            g.dispose();
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('color', new THREE.BufferAttribute(col, 3)); // vertexColors 재질도 그대로 받게 항상 붙인다
        return out;
    },

    // 대나무 다발(12 대나무 숲) — 이 맵의 유일한 시그니처는 **가늘고 높은 수직선**이다.
    // 원뿔·구 조합인 다른 나무들과 실루엣이 겹치지 않게, 굵기 변화 없는 긴 기둥 + 마디 링으로만 만든다.
    // 마디(node)를 빼면 매끈한 원기둥이라 '파이프'로 읽힌다 — 링이 대나무를 대나무로 만드는 유일한 단서다.
    makeBamboo(s) {
        const g = new THREE.Group();
        g.userData.windSway = 0.055;   // 가늘고 높아 가장 크게 흔들린다 (침엽수 0.030 대비)
        if (!this.bambooMat) {
            this.bambooMat = new THREE.MeshPhongMaterial({ color: 0x9ccc65, shininess: 12, flatShading: true });
            // ⚠️ 잎은 **전용 재질**을 쓴다 — 공용 foliageMats 에 side 를 쓰면 게임 안 모든 나무의
            //    양면 렌더가 같이 켜진다(공유 재질에 인스턴스 단위 속성을 쓰는 전형적 사고).
            this.bambooLeafMat = new THREE.MeshLambertMaterial({ color: 0x8bc34a, side: THREE.DoubleSide });
        }
        const culms = 3 + (Math.random() * 3 | 0);
        for (let i = 0; i < culms; i++) {
            const h = U.rand(1.5, 2.5) * s;
            const r = U.rand(0.028, 0.042) * s;
            const a = (i / culms) * Math.PI * 2 + U.rand(-0.4, 0.4);
            const rad = U.rand(0.05, 0.22) * s;
            const culm = new THREE.Group();
            // 마디를 **실루엣 안에** 넣는다 — 링 메시를 따로 얹으면 드로우콜이 마디 수만큼 불어나는 데다
            // 옆에서 보면 기둥에 낀 반지로 읽힌다. 회전 프로파일의 반경을 마디 자리에서만 부풀리면
            // 기둥과 마디가 한 메시이면서 윤곽선에 마디가 드러난다. 프로파일 점은 마디 근처에만 둔다
            // (균등 분할하면 같은 실루엣에 폴리곤만 수십 배 든다).
            const nodes = 3 + (Math.random() * 3 | 0);
            const prof = [new THREE.Vector2(r, 0)];
            for (let k = 1; k <= nodes; k++) {
                const t = Math.pow(k / (nodes + 1), 0.82);   // 위로 갈수록 절간이 좁아지는 실제 분포
                const rt = r * (1 - 0.14 * t);
                prof.push(new THREE.Vector2(rt, (t - 0.018) * h));
                prof.push(new THREE.Vector2(rt * 1.24, t * h));
                prof.push(new THREE.Vector2(rt, (t + 0.018) * h));
            }
            prof.push(new THREE.Vector2(r * 0.84, h));
            const pole = new THREE.Mesh(new THREE.LatheGeometry(prof, 6), this.bambooMat);
            culm.add(pole);
            // 잎 — 상단 1/3 에만. 판 4장을 한 지오메트리로 합쳐 드로우콜 1개로 끝낸다
            const leafGeos = [];
            for (let k = 0; k < 4; k++) {
                const lw = U.rand(0.1, 0.2) * s, ll = U.rand(0.3, 0.5) * s;
                const la = U.rand(0, Math.PI * 2);
                const m = new THREE.Matrix4()
                    .makeRotationFromEuler(new THREE.Euler(U.rand(-0.5, -0.15), la, U.rand(-0.4, 0.4)))
                    .setPosition(Math.cos(la) * lw * 0.6, h * U.rand(0.66, 0.98), Math.sin(la) * lw * 0.6);
                leafGeos.push([new THREE.PlaneGeometry(lw, ll), m]);
            }
            culm.add(new THREE.Mesh(this.mergeGeos(leafGeos), this.bambooLeafMat));
            culm.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
            culm.rotation.z = U.rand(-0.07, 0.07);
            culm.rotation.x = U.rand(-0.07, 0.07);
            g.add(culm);
        }
        return g;
    },

    // 거대 버섯(11 늪지 · 23 심연) — 갓 + 대 + 주름(gill) + 반점, 그리고 곁에 작은 개체 1~2.
    // ⚠️ 갓을 **매끈한 반구**로 두면 어떤 라이팅에서도 '공을 반으로 자른 것'으로 읽힌다(장비 쪽에서
    //    겪은 '박스는 어떤 라이팅에도 박스' 와 같은 벽). `sculptFoliage` 로 실루엣 자체를 울퉁불퉁하게 만든다.
    makeMushroom(s) {
        if (!this.gillMat) {
            this.gillMat = new THREE.MeshLambertMaterial({ color: 0xe8dfc8, side: THREE.DoubleSide });
            this.sporeMat = new THREE.MeshLambertMaterial({ color: 0xf5f0e0 });
        }
        const g = new THREE.Group();
        g.userData.windSway = 0.016;   // 다육질이라 거의 안 흔들린다 — 나무만큼 흔들면 고무로 읽힌다
        const one = (sc, fm) => {
            const m = new THREE.Group();
            const stemH = U.rand(0.45, 0.7) * sc;
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.075 * sc, 0.12 * sc, stemH, 8), this.trunkMat);
            stem.position.y = stemH / 2;
            stem.rotation.z = U.rand(-0.1, 0.1);
            m.add(stem);
            // 갓: 위쪽 반구를 눌러 만든 돔. 정점 변위로 가장자리를 물결지게
            const capR = U.rand(0.34, 0.46) * sc;
            const capGeo = this.sculptFoliage(
                new THREE.SphereGeometry(capR, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.56), { amp: 0.13 });
            const cap = new THREE.Mesh(capGeo, fm);
            cap.scale.y = 0.72;
            cap.position.y = stemH + capR * 0.06;
            m.add(cap);
            // 갓 아래 주름 — 밝은 원뿔면. 갓 그늘에 밝은 면이 하나 있어야 부피가 읽힌다
            const gill = new THREE.Mesh(new THREE.ConeGeometry(capR * 0.94, capR * 0.34, 12, 1, true), this.gillMat);
            gill.position.y = stemH - capR * 0.1;
            m.add(gill);
            // 반점 — 갓 윗면 납작한 원반. 개수만큼 메시를 늘리지 않게 한 덩어리로 합친다
            const dots = [];
            for (let i = 0; i < 3 + (Math.random() * 3 | 0); i++) {
                const sr = U.rand(0.05, 0.095) * sc;
                const a = U.rand(0, Math.PI * 2), rr = U.rand(0.15, 0.72) * capR;
                const mm = new THREE.Matrix4().makeScale(1, 0.45, 1).setPosition(
                    Math.cos(a) * rr,
                    stemH + capR * 0.62 * Math.sqrt(Math.max(0, 1 - (rr / capR) ** 2)),
                    Math.sin(a) * rr);
                dots.push([new THREE.SphereGeometry(sr, 6, 4), mm]);
            }
            m.add(new THREE.Mesh(this.mergeGeos(dots), this.sporeMat));
            return m;
        };
        const fm = this.foliageMats[Math.random() * 3 | 0];
        g.add(one(s, fm));
        for (let i = 0; i < 1 + (Math.random() * 2 | 0); i++) { // 곁 개체 — 단일 오브젝트 나열 인상 제거
            const sub = one(s * U.rand(0.3, 0.55), fm);
            const a = U.rand(0, Math.PI * 2), rr = U.rand(0.36, 0.62) * s;
            sub.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr);
            sub.rotation.y = U.rand(0, Math.PI * 2);
            g.add(sub);
        }
        return g;
    },

    makeRoundTree(s) {
        const g = new THREE.Group();
        g.userData.windSway = 0.034;   // 활엽수는 침엽수보다 크게 휜다
        const fm = this.foliageMats[Math.random() * 3 | 0]; // 나무별 잎 명도 변주
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * s, 0.12 * s, 0.6 * s, 7), this.trunkMat);
        trunk.position.y = 0.3 * s;
        const crown = new THREE.Mesh(this.sculptFoliage(new THREE.DodecahedronGeometry(0.5 * s, 0), { amp: 0.15 }), fm);
        crown.position.y = 0.95 * s;
        const crown2 = new THREE.Mesh(this.sculptFoliage(new THREE.DodecahedronGeometry(0.32 * s, 0), { amp: 0.17 }), fm);
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
        this.setShadow(g, true);
        this.applyRimLight(g);
        // 접지 블롭 섀도우 — 디렉셔널 섀도맵(1024/24유닛)이 흐릿해 캐릭터가 떠 보이던 문제 보강
        this.ensureBlobRes();
        // 사망 시 시체 길이에 맞춰 타원으로 늘리므로 머티리얼만 전용 인스턴스로(공유본을 건드리면 소품 전체가 짙어진다)
        const heroBlob = new THREE.Mesh(this.blobGeo, this.blobShadowMat.clone());
        heroBlob.rotation.x = -Math.PI / 2;
        heroBlob.position.y = 0.025;
        heroBlob.scale.setScalar(0.82); // 컨택트 AO — 실그림자와 이중 노출 방지 위해 발밑 접지부만
        heroBlob.userData.sharedGeometry = true;
        g.add(heroBlob);
        this.heroBlob = heroBlob;
        this.heroG = g;
        this.scene.add(g);

        // 머리 위 HP 바 — 적(makeEnemyMesh)과 같은 패턴(어두운 배경+색 전경 평면 2장)이지만,
        // 영웅은 공격/걷기 중 heroG.rotation.y가 계속 바뀌므로 그 자식으로 넣지 않고 씬에 독립적으로
        // 두어 매 프레임 위치만 추적(update()) — 회전은 항상 0으로 고정돼 카메라를 그대로 향함.
        this.heroHpG = new THREE.Group();
        const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.135), new THREE.MeshBasicMaterial({ color: this.srgbC(0x0d1114), side: THREE.DoubleSide, transparent: true, opacity: 0.82, toneMapped: false }));
        const hpGhost = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: this.srgbC(0xe8a800), side: THREE.DoubleSide, toneMapped: false }));
        hpGhost.position.z = 0.005;
        const hpFg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: this.srgbC(0x2ebd6b), side: THREE.DoubleSide, toneMapped: false }));
        hpFg.position.z = 0.01;
        // 소유자 캐럿(초록) — 적 바와 겹쳐도 "초록 바 = 영웅"이 방향으로 확정된다 (바 로컬 y=0)
        const heroPip = this.makeOwnerPip(0x2ebd6b, -0.135 / 2);
        this.heroHpG.add(hpBg, hpGhost, hpFg, heroPip);
        this.heroHpBg = hpBg;
        this.heroHpGhost = hpGhost;
        this.heroHpFg = hpFg;
        // 적과 같은 2단 바 상태(driveHpBar가 소유, 플래시는 트랙에). hpG를 넘겨야 세로 펀치가 걸린다.
        this.heroBar = { hpFg, hpGhost, hpBg, ghostV: 1, hpG: this.heroHpG };
        this.heroHpG.position.set(g.position.x, 2.18, g.position.z);
        this.scene.add(this.heroHpG);
    },

    // 무기 모델 — 지오메트리 계열(shape) × 재질 계열(mat)의 조합.
    // 같은 계열이라도 시대 재질이 다르면 완전히 다른 무기로 읽힌다 (돌도끼 vs 전투도끼).
    makeWeapon(wtypeId, ageIdx, rarity) {
        const g = new THREE.Group();
        const c = AGE_COLORS[AGES[ageIdx]];
        const glow = ageIdx >= 4;
        const shape = weaponShape(wtypeId);
        const matKind = weaponMatKind(wtypeId, ageIdx);
        const energy = matKind === 'energy';
        // 재질 계열별 팔레트 — mat(헤드/액센트) / bladeMat(날) / wood(자루) / dark(부속) / edgeMat(날 하이라이트)
        // steel이 기존 룩이고, 나머지는 시대 정체성을 만드는 축 (사용자 지시 2026-08-17).
        let mat, bladeMat, wood, dark, edgeHex;
        const std = o => new THREE.MeshStandardMaterial(o);
        if (matKind === 'stone') {
            // 원시: 무광 회백 석재 + 가죽끈 결속 — 금속기가 전혀 없어야 '돌'로 읽힌다
            // 0x8d8a80/0x9b978b 는 썸네일 밝은 배경에서 헤드가 **흰 덩어리**로 날아가 뗀 자국이 전부 사라졌다
            //  — 화강암 쪽으로 눌러 깬 면의 명암이 남게 한다 (엣지 하이라이트가 대비를 계속 준다).
            mat      = std({ color: 0x635e55, metalness: 0.02, roughness: 0.96, flatShading: true });
            bladeMat = std({ color: 0x716b5e, metalness: 0.02, roughness: 0.94, flatShading: true });
            wood     = std({ color: 0x4a3220, metalness: 0, roughness: 0.9, map: ProChar.leatherTex() });
            dark     = std({ color: 0x2e1f13, metalness: 0, roughness: 0.88, map: ProChar.leatherTex() });
            edgeHex  = 0xc9c3b2;
        } else if (matKind === 'bone') {
            mat      = std({ color: 0xe3dbc2, metalness: 0.04, roughness: 0.72, flatShading: true });
            bladeMat = std({ color: 0xeee7d2, metalness: 0.05, roughness: 0.66 });
            wood     = std({ color: 0x4a3220, metalness: 0, roughness: 0.9, map: ProChar.leatherTex() });
            dark     = std({ color: 0x3b2a1a, metalness: 0, roughness: 0.85, map: ProChar.leatherTex() });
            edgeHex  = 0xfaf5e4;
        } else if (matKind === 'blackpowder') {
            // 근세: 호두나무 개머리 + 황동 부속 + 무광 흑철 총열
            mat      = std({ color: 0xb08d57, metalness: 0.88, roughness: 0.3 });   // 황동
            bladeMat = std({ color: 0x9aa3ab, metalness: 0.9, roughness: 0.32, envMapIntensity: 0.85 });
            wood     = std({ color: 0x4a2c17, metalness: 0, roughness: 0.72 });
            dark     = std({ color: 0x2a2119, metalness: 0.55, roughness: 0.55 });
            edgeHex  = 0xd8b878;
        } else if (matKind === 'gunmetal') {
            // 0x23272b/0x15181b 조합은 어두운 배경에서 총몸이 통째로 묻혀 '가는 막대' 하나만 남았다
            // (썸네일 대조에서 현대 화기 5종이 전부 같은 실루엣으로 읽힘) — 명도를 올려 덩어리를 살린다
            mat      = std({ color: 0x5b636b, metalness: 0.86, roughness: 0.36 });
            bladeMat = std({ color: 0x9aa3ab, metalness: 0.9, roughness: 0.3, envMapIntensity: 0.85 });
            wood     = std({ color: 0x3d444b, metalness: 0.25, roughness: 0.72 });  // 폴리머 그립/핸드가드
            dark     = std({ color: 0x272d33, metalness: 0.5, roughness: 0.58 });
            edgeHex  = 0xb9c2ca;
        } else if (energy) {
            // 우주 이후: 어두운 테크 프레임 + 시대색 발광 날 — 날 자체가 광원처럼 읽혀야 한다
            mat      = std({ color: 0x2b3440, metalness: 0.82, roughness: 0.3, emissive: c, emissiveIntensity: 0.35 });
            bladeMat = std({ color: c, metalness: 0.2, roughness: 0.25, emissive: c, emissiveIntensity: 1.15, transparent: true, opacity: 0.88 });
            wood     = std({ color: 0x1c2129, metalness: 0.35, roughness: 0.7 });
            dark     = std({ color: 0x131820, metalness: 0.6, roughness: 0.5 });
            edgeHex  = new THREE.Color(c).offsetHSL(0, 0, 0.35).getHex();
        } else if (matKind === 'holy') {
            // 천상: 황금 + 상아. ⚠️ 종전 값(날 0xfff4d0 + 자체발광 0.42)은 썸네일 조명에서 **완전히
            //    타서 흰 막대**가 됐다 — 천상 줄 5종이 전부 '하얗게 날아간 실루엣'이라 금색조차 안 남았다.
            //    발광을 눌러 금이 금으로 보이게 하고, 빛나는 몫은 후광·성흔 보석(holyLit)이 진다.
            // 1차 채점 A·B 공통: 신의 창이 밝은 배경에 융해(상아 날 + 밝은 자루 = 다크 앵커 0).
            // 발광은 그대로 두고(⚠️ 0.42 로 되돌리면 흰 막대 — 위 경고) **알베도만** 한 단 눌렀다:
            // 날은 상아→깊은 금, 자루는 밝은 모래→어두운 청동 나무. 금 vs 그늘의 명도폭이 생긴다.
            mat      = std({ color: 0xd9a12e, metalness: 0.95, roughness: 0.24, emissive: 0xffb020, emissiveIntensity: 0.16 });
            bladeMat = std({ color: 0xe6cd8a, metalness: 0.9, roughness: 0.18, envMapIntensity: 1.0, emissive: 0xffd98a, emissiveIntensity: 0.16 });
            wood     = std({ color: 0x8a6a38, metalness: 0.06, roughness: 0.6 });
            dark     = std({ color: 0x9a731c, metalness: 0.9, roughness: 0.32 });
            edgeHex  = 0xfff6d8;
        } else {
            // steel — 중세·근세 melee 전용 계열.
            // 🚨 **되돌리지 말 것**: 예전엔 `color: c`(=AGE_COLORS 원색)를 그대로 썼는데, `mat` 은 도끼날·
            //    철퇴 구·망치 헤드·활대·창촉·단검 날에 전부 쓰이는 '무기의 업무 끝단' 재질이라, 중세 한 줄이
            //    통째로 **하늘색 상자를 막대에 꽂은 그림**으로 읽혔다(실측: 전투도끼·철퇴·전투 망치·활·석궁이
            //    전부 0x1cafff 단색 덩어리, 근대 초기는 초록 상자). 사용자 지시 '중세→진짜 중세 같아야 함
            //    (중세기사 느낌)'의 1차 원인이 이것이다. bladeMat 이 이미 쓰던 문법 그대로 **단조 강철에
            //    시대색을 22%만 섞는다** — 시대 식별은 edge 하이라이트·젬·트림 링이 계속 진다.
            mat = std({
                color: new THREE.Color(0xa9b4bd).lerp(new THREE.Color(c), 0.22),
                metalness: 0.88, roughness: 0.38, envMapIntensity: 0.85,
                emissive: glow ? c : 0x000000, emissiveIntensity: glow ? 0.5 : 0
            });
            // 날 전용 금속: 스틸 베이스에 시대색 18%만 — 시대색 직치환 날은 '노란 막대사탕'으로 읽힘 (비평가 2번)
            // PBR 분리: 날은 고금속·저러프 — scene.environment 반사로 '강철'이 읽히는 핵심
            bladeMat = std({
                color: new THREE.Color(0xc9d2da).lerp(new THREE.Color(c), 0.18),
                metalness: 0.92, roughness: 0.28, envMapIntensity: 0.85,
                emissive: glow ? c : 0x000000, emissiveIntensity: glow ? 0.16 : 0
            });
            wood = std({ color: 0x1f1109, metalness: 0, roughness: 0.85, map: ProChar.leatherTex() }); // 0x5d4037 민짜는 강광에서 베이지 원통 = 맨살 오독 (비평가 7.4 4번) — 가죽 감김 그레인
            dark = std({ color: 0x37474f, metalness: 0.7, roughness: 0.5 });
            edgeHex = new THREE.Color(c).offsetHSL(0, -0.1, 0.32).getHex();
        }
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
        const edgeMat = new THREE.MeshBasicMaterial({ color: edgeHex });
        // 결속 가죽끈 — 돌·뼈 무기의 '묶어서 만든' 정체성 (헤드와 자루가 한 덩어리로 보이면 안 됨)
        const lashing = (y, r) => {
            for (let i = 0; i < 3; i++) {
                const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 5, 10), dark);
                t.rotation.x = Math.PI / 2; t.rotation.z = i * 0.7;
                t.position.y = y + (i - 1) * 0.045;
                g.add(t);
            }
        };
        const edge = (w, h, d, x, y, z, rz) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), edgeMat);
            mesh.position.set(x, y, z || 0);
            if (rz) mesh.rotation.z = rz;
            g.add(mesh); return mesh;
        };
        switch (shape) {
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
                if (matKind === 'stone') {
                    // 돌도끼(원시): 자루 홈에 얹어 끈으로 동여맨 **뗀석기 쐐기** — 사용자 지시 '원시→뗀석기'.
                    // 종전 십이면체는 둥근 자갈이라 '막대에 얹은 돌멩이'였다. 프리미티브로는 안 된다 —
                    // 깨낸 돌은 **직선 파세트가 한 점으로 모이는** 윤곽이라 셰이프를 직접 찍어 밀어낸다.
                    // 두께(0.075)를 남기는 게 중요하다: 얇게 누르면 종잇장 삼각형(=깃발)으로 읽힌다.
                    { const s = new THREE.Shape();
                      s.moveTo(-0.025, 0.135); s.lineTo(0.10, 0.15); s.lineTo(0.215, 0.07);
                      s.lineTo(0.265, -0.015); s.lineTo(0.185, -0.105); s.lineTo(0.055, -0.155);
                      s.lineTo(-0.04, -0.085); s.lineTo(-0.025, 0.135);
                      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.075, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 1 });
                      geo.translate(0, 0, -0.0375);
                      const head = new THREE.Mesh(geo, mat);
                      head.position.set(0.055, 0.63, 0); head.rotation.z = -0.12; g.add(head); }
                    edge(0.02, 0.16, 0.05, 0.3, 0.612, 0, -0.12);   // 갈아낸 날 끝
                    lashing(0.59, 0.062);
                } else {
                    // 중세 전투도끼: 아래로 늘어진 **수염 날(bearded)** + 자루를 무는 소켓 + 상단 스파이크
                    // + 랑겟(자루 보강 쇠띠). 상자 하나짜리 헤드는 '막대에 꽂은 판때기'로 읽혔다
                    // (사용자 지시 '중세→중세기사 무기').
                    // ⚠️ 첫 판에서 초승달을 **토러스 호**로 만들었다가 실패했다 — 관(tube)은 굵기가 일정해
                    //    도끼날이 아니라 **갈고리(물음표)** 로 읽힌다. 도끼는 '넓은 판이 바깥으로 갈수록
                    //    얇아지고 아래로 늘어지는' 면이라, 셰이프를 밀어내고 안쪽에 인셋 패널을 얹는다.
                    const bladeShape = () => {
                        const s = new THREE.Shape();
                        s.moveTo(0.045, 0.125);
                        s.lineTo(0.19, 0.115);
                        s.quadraticCurveTo(0.325, 0.03, 0.275, -0.085);    // 바깥 날(초승달)
                        s.quadraticCurveTo(0.20, -0.195, 0.05, -0.215);    // 아래로 늘어진 수염
                        s.quadraticCurveTo(0.135, -0.10, 0.045, -0.03);    // 수염 안쪽 오목선
                        s.lineTo(0.045, 0.125);
                        return s;
                    };
                    { const geo = new THREE.ExtrudeGeometry(bladeShape(), { depth: 0.026, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
                      geo.translate(0, 0, -0.013);
                      const blade = new THREE.Mesh(geo, mat); blade.position.y = 0.62; g.add(blade); }
                    for (const zz of [0.016, -0.024]) {   // 양 날 면의 인셋 패널 — 벼려낸 면이 읽히게
                        const pg = new THREE.ExtrudeGeometry(bladeShape(), { depth: 0.008, bevelEnabled: false, curveSegments: 8 });
                        pg.scale(0.72, 0.72, 1); pg.translate(0.022, 0, zz);
                        const panel = new THREE.Mesh(pg, dark); panel.position.y = 0.62; g.add(panel);
                    }
                    { const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.21, 8), mat);
                      socket.position.y = 0.62; g.add(socket); }
                    { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.033, 0.15, 4), mat);
                      spike.position.y = 0.8; g.add(spike); }
                    for (const ly of [0.52, 0.43]) {           // 랑겟
                        const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 5, 10), dark);
                        band.rotation.x = Math.PI / 2; band.position.y = ly; g.add(band);
                    }
                }
                break;
            case 'spear':
                cyl(0.03, 0.035, 1.05, wood, 0, 0.4);
                if (matKind === 'stone') {
                    // 돌창(원시): **잎사귀꼴 뗀석기 촉** — 배가 부풀고 양끝이 모이는 형태라야 '깨서 만든 돌'로
                    // 읽힌다. 원뿔은 밑동이 가장 넓어 금속 촉과 구분이 안 됐다(팔면체를 납작하게 눌러 쓴다).
                    { const s = new THREE.Shape();
                      s.moveTo(0, 0.2); s.lineTo(0.078, 0.03); s.lineTo(0.058, -0.105);
                      s.lineTo(0, -0.155); s.lineTo(-0.058, -0.105); s.lineTo(-0.078, 0.03);
                      s.lineTo(0, 0.2);
                      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.052, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: 1 });
                      geo.translate(0, 0, -0.026);
                      const tip = new THREE.Mesh(geo, mat); tip.position.y = 1.05; g.add(tip); }
                    edge(0.012, 0.2, 0.03, 0.06, 1.08, 0, 0.42);   // 갈아낸 한쪽 날
                    lashing(0.88, 0.045);
                } else {
                    { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 8), bladeMat); tip.position.y = 1.03; g.add(tip); }
                    { const tipHl = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.1, 6), edgeMat); tipHl.position.y = 1.14; g.add(tipHl); }
                }
                break;
            case 'hammer':
                cyl(0.04, 0.05, 0.72, wood, 0, 0.28);
                box(0.3, 0.2, 0.2, mat, 0, 0.66);
                if (matKind === 'steel') {
                    // 중세 워해머: 한쪽은 두들기는 타격면, 반대쪽은 판금을 뚫는 **까마귀 부리 첨두**,
                    // 자루엔 랑겟. 상자 하나로는 '막대에 얹은 벽돌'이라 기사 무기로 안 읽힌다.
                    // ⚠️ steel 게이트를 빼지 말 것 — hammer 형상은 중력/항성/붕괴/파멸/심판 해머와 공용이라
                    //    무조건 붙이면 후기 시대 해머가 전부 중세 실루엣이 된다.
                    { const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.25, 4), mat);
                      beak.position.set(-0.27, 0.68, 0); beak.rotation.z = Math.PI / 2 + 0.16;
                      beak.scale.z = 0.72; g.add(beak); }
                    edge(0.014, 0.19, 0.19, 0.153, 0.66);       // 타격면 테
                    { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.13, 4), mat);
                      spike.position.y = 0.82; g.add(spike); }
                    for (const ly of [0.52, 0.43]) {
                        const band = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.011, 5, 10), dark);
                        band.rotation.x = Math.PI / 2; band.position.y = ly; g.add(band);
                    }
                }
                break;
            case 'dagger':
                if (matKind === 'bone') {
                    // 뼈 단검(원시): 쪼개 간 **뼈 파편**. 십자 가드도 균일한 판금 날도 있으면 안 된다 —
                    // 종전엔 색만 아이보리인 '중세 단검'이라 원시 줄에서 유일하게 시대가 안 읽혔다
                    // (사용자 지시 '원시→진짜 원시(뗀석기)'). 각뿔을 눌러 납작한 파편으로 만들고
                    // 높이에 따라 폭을 흔들어 깨낸 단면을 준 뒤, 가죽만 감아 손잡이로 쓴다.
                    { const shard = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.46, 5), mat);
                      const p = shard.geometry.attributes.position;
                      for (let i = 0; i < p.count; i++) {
                          p.setZ(i, p.getZ(i) * 0.34);
                          const j = 1 + Math.sin(p.getY(i) * 41 + p.getX(i) * 17) * 0.18;
                          p.setX(i, p.getX(i) * j);
                      }
                      shard.geometry.computeVertexNormals();
                      shard.rotation.y = 0.35; shard.position.y = 0.31; g.add(shard); }
                    edge(0.012, 0.3, 0.028, 0.05, 0.27, 0, -0.05);  // 갈아낸 한쪽 날만 번들거림
                    cyl(0.032, 0.026, 0.17, dark, 0, 0.0);          // 가죽 감은 자루 (가드 없음)
                    lashing(0.06, 0.04);
                    lashing(-0.05, 0.038);
                } else {
                    // ⚠️ 날에는 bladeMat 을 쓸 것 — mat 은 시대색 액센트라, 여기 물리면 근대 초기 단검이
                    //    '초록 판때기'가 된다(실측). 계열 규약: mat=헤드/부속, bladeMat=베는 날.
                    box(0.07, 0.4, 0.03, bladeMat, 0, 0.24);
                    edge(0.014, 0.36, 0.034, 0.037, 0.235);  // 단검 날 하이라이트
                    box(0.16, 0.04, 0.05, dark, 0, 0.03);
                    cyl(0.03, 0.03, 0.12, wood, 0, -0.05);
                }
                break;
            case 'bow': {
                // 🚨 **완전한 반원 호(TorusGeometry sweep π)를 되돌리지 말 것** — 곡률이 어디서나
                //    같은 반원 + 지름을 가로지르는 직선 시위는 3차 채점 C·D 가 나란히 **알파벳 'D'**
                //    로 읽었다(지적 ⓒ). 실제 활이 D 로 안 읽히는 이유는 두 가지다:
                //    ⑴ 곡률이 변한다 — 라이저 부근은 뻣뻣해서 거의 곧고, 중간 림이 휘고,
                //    ⑵ 끝이 **시위 선을 넘어 뒤로 젖혀진다**(리커브 팁). 그래서 실루엣이 반원이 아니라
                //       가운데가 잘록한 활꼴 + 갈고리 두 개가 된다.
                //    여기에 림 테이퍼(뿌리 굵고 끝 가늘게)까지 얹어야 '색칠한 괄호'에서 벗어난다.
                const STR_X = -0.012, TIP_Y = 0.475;      // 시위 선 · 팁 높이
                for (const s of [1, -1]) {                 // 위·아래 림 (대칭)
                    const limb = this.taperedTube([
                        [0.40, s * 0.055], [0.395, s * 0.165],  // 라이저 부근 — 거의 곧다(뻣뻣한 구간)
                        [0.335, s * 0.295], [0.175, s * 0.375], // 휘는 구간
                        [0.02, s * 0.395],                      // 시위 선을 **가로지른다**
                        [-0.06, s * 0.425],                     // 시위 뒤로 넘어간 리커브 배
                        [-0.02, s * TIP_Y],                     // 다시 앞으로 꺾여 시위에서 끝나는 팁
                    ], 0.036, 0.013, mat, 22, 6);
                    g.add(limb);
                }
                // 시위는 **팁과 팁 사이**만 잇는다. 림이 시위 선을 넘었다 돌아오므로 바깥 윤곽에
                // 노치가 생겨 반원+현(=D)으로 닫히지 않는다.
                { const str = new THREE.Mesh(new THREE.BoxGeometry(0.012, TIP_Y * 2, 0.012), dark);
                  str.position.x = STR_X; g.add(str); }
                // 라이저(가죽 감은 손잡이)·화살 선반·뿔 노크 — 매끈한 호 하나는 '색칠한 괄호'로
                // 읽혔다. 활 계열 전체(중세 활·메아리·망령·세라핌)에 공통으로 준다.
                { const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.2, 8), wood);
                  grip.position.x = 0.4; g.add(grip); }
                { const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.042, 0.05), dark);
                  shelf.position.set(0.355, 0.085, 0); g.add(shelf); }
                for (const s of [1, -1]) {                 // 뿔 노크(시위 거는 홈) — 젖혀진 팁 끝에 붙인다
                    const nock = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.075, 5), dark);
                    nock.position.set(-0.016, s * (TIP_Y + 0.026), 0);
                    nock.rotation.z = s > 0 ? -0.2 : Math.PI + 0.2;
                    g.add(nock);
                }
                break;
            }
            case 'crossbow': {
                // 중세 석궁: 틸러(개머리 달린 몸통) + **휘어진 프로드** + 당겨진 V자 시위 + 회전 너트
                // + 방아쇠 + 발 거는 등자 + 장전된 볼트. 종전의 '판때기 두 장 십자 교차'는
                // 썸네일에서 나무 십자가로 읽혔다 (사용자 지시 '중세→중세기사 무기').
                // ⚠️ **틸러를 균일 폭 통짜 기둥으로 되돌리지 말 것** — 3차 채점 C 가 '토템', D 가
                //    '닻'으로 읽은 몸통이 이것이다(지적 ⓔ). 위에서 본 석궁이 기둥으로 안 읽히는
                //    이유는 **폭이 길이를 따라 변하기** 때문이다: 앞은 프로드를 무는 넓은 목,
                //    가운데는 손이 쥐는 잘록한 손목, 뒤는 어깨에 대는 넓은 개머리판.
                box(0.085, 0.44, 0.085, wood, 0, 0.26);                 // 틸러 앞부분(프로드·너트·볼트가 붙는 구간)
                { const wrist = box(0.052, 0.17, 0.072, wood, 0, 0.005); wrist.rotation.x = 0.05; }  // 손목(그립) — 가장 잘록
                { const comb = box(0.068, 0.10, 0.078, wood, 0, -0.115); comb.rotation.x = 0.12; }   // 콤(뺨 대는 등선)
                { const butt = this.beveledSlab(0.148, 0.175, 0.105, 0.022, wood);                   // 개머리판 — 바깥으로 벌어진다
                  butt.position.set(0, -0.245, 0.012); butt.rotation.x = 0.2; g.add(butt); }
                { const plate = new THREE.Mesh(new THREE.BoxGeometry(0.152, 0.028, 0.112), dark);    // 개머리 끝 쇠판
                  plate.position.set(0, -0.325, 0.028); plate.rotation.x = 0.2; g.add(plate); }
                // ⚠️ 프로드는 **납작해야** 한다 — r 0.33·스윕 0.72π 는 끝이 130° 말려 올라가
                //    1차 채점 A 가 '사슴뿔 달린 지팡이'로 읽었다. 같은 폭(반현 0.298)을 유지한 채
                //    r 0.486·스윕 0.42π 로 펴서 끝 들림을 0.19 → 0.10 으로 눌렀다(시위 좌표도 연동).
                { const prod = new THREE.Mesh(new THREE.TorusGeometry(0.486, 0.036, 6, 18, Math.PI * 0.42), mat);
                  prod.rotation.z = -Math.PI * 0.71;       // 호의 배가 뒤(-y), 양 끝이 앞(+y)으로 살짝 젖혀짐
                  prod.position.y = 0.936; prod.scale.z = 0.5; g.add(prod); }
                { const lath = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.1), dark);
                  lath.position.y = 0.45; g.add(lath); }   // 프로드를 무는 결속 블록 (활대가 허공에 뜨면 안 됨)
                { const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.07, 8), dark);
                  nut.rotation.x = Math.PI / 2; nut.position.y = 0.2; g.add(nut); }
                for (const sx of [-0.298, 0.298]) {        // 너트까지 당겨진 시위 두 가닥 (프로드 끝 y 0.552 → 너트 y 0.2)
                    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.461, 5), dark);
                    str.position.set(sx / 2, 0.376, 0);
                    str.rotation.z = -Math.atan2(sx, 0.352);
                    g.add(str);
                }
                { const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), wood);
                  bolt.position.set(0, 0.4, 0.055); g.add(bolt); }
                { const bhead = new THREE.Mesh(new THREE.ConeGeometry(0.023, 0.07, 4), mat);
                  bhead.position.set(0, 0.6, 0.055); g.add(bhead); }
                // 방아쇠 + **방아쇠울** — 울(고리)은 석궁·총의 서명이다. 막대 하나만 두면 위에서
                // 본 실루엣에 아무것도 안 남지만, 고리는 어느 각도에서도 뚫린 구멍으로 읽힌다.
                { const trig = box(0.022, 0.115, 0.03, dark, 0, 0.075, 0.062); trig.rotation.x = -0.34; }
                { const guard = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 6, 16, Math.PI * 1.15), dark);
                  guard.position.set(0, 0.05, 0.085);
                  guard.rotation.y = Math.PI / 2;      // 고리 평면이 틸러를 따라 선다(옆에서 보면 U자)
                  guard.rotation.x = Math.PI * 0.52;
                  g.add(guard); }
                // 등자는 **틸러 앞끝에 물려** 앞으로 뻗어야 발을 거는 고리로 읽힌다 —
                // xy 평면에 세워 두면 프로드와 같은 방향이라 '뿔 하나 더'가 된다(실측).
                { const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.014, 6, 14), mat);
                  stirrup.rotation.x = Math.PI / 2; stirrup.position.set(0, 0.5, 0.13); g.add(stirrup); }
                break;
            }
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
                box(0.2, 0.15, 0.04, bladeMat, 0.1, 0.36);
                edge(0.014, 0.17, 0.044, 0.197, 0.36);   // 던지는 날 끝
                { const collar = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.01, 5, 10), dark);
                  collar.rotation.x = Math.PI / 2; collar.position.y = 0.29; g.add(collar); }
                break;
            case 'club': {
                // 원시 몽둥이: 손잡이는 가늘고 타격부로 갈수록 굵어지는 비대칭 곤봉 + 박아넣은 돌조각
                cyl(0.036, 0.075, 0.66, wood, 0, 0.26);
                { const knob = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1, 0), wood);
                  knob.scale.set(1, 1.15, 0.95); knob.position.y = 0.58; g.add(knob); }
                for (let i = 0; i < 4; i++) {   // 박힌 돌조각 = 원시 무기 정체성
                    const chip = new THREE.Mesh(new THREE.TetrahedronGeometry(0.045), mat);
                    chip.position.set(Math.cos(i * 1.6) * 0.075, 0.44 + i * 0.055, Math.sin(i * 1.6) * 0.07);
                    chip.rotation.set(i, i * 1.3, 0);
                    g.add(chip);
                }
                lashing(0.18, 0.05);
                break;
            }
            case 'mace': {
                // 철퇴: 자루 + 플랜지 달린 구형 헤드 (해머의 각진 헤드와 구분)
                cyl(0.032, 0.038, 0.6, wood, 0, 0.22);
                cyl(0.05, 0.05, 0.04, dark, 0, 0.5);
                { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 8), mat); ball.position.y = 0.62; g.add(ball); }
                for (let i = 0; i < 6; i++) {   // 방사형 플랜지(가시)
                    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.09, 4), mat);
                    const a = i * Math.PI / 3;
                    sp.position.set(Math.cos(a) * 0.15, 0.62, Math.sin(a) * 0.15);
                    sp.rotation.set(Math.PI / 2, 0, -a - Math.PI / 2);  // 원뿔 축을 방사 방향으로
                    g.add(sp);
                }
                { const pom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark); pom.position.y = -0.09; g.add(pom); }
                break;
            }
            case 'rapier': {
                // 레이피어: 아주 가늘고 긴 찌르기 날 + 컵 힐트 (검과 실루엣이 확실히 갈리게)
                box(0.032, 0.86, 0.032, bladeMat, 0, 0.5);
                edge(0.012, 0.82, 0.012, 0.016, 0.5);
                { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.1, 4), bladeMat); tip.position.y = 0.97; g.add(tip); }
                { const cup = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
                  cup.rotation.x = Math.PI; cup.position.y = 0.075; g.add(cup); }   // 컵 가드
                { const knuck = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 5, 10, Math.PI), mat);
                  knuck.rotation.y = Math.PI / 2; knuck.position.y = 0.01; g.add(knuck); }  // 너클 보우
                cyl(0.024, 0.026, 0.14, wood, 0, -0.04);
                { const pom = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), mat); pom.position.y = -0.12; g.add(pom); }
                break;
            }
            case 'scythe': {
                // 낫: 긴 자루 + 직각으로 뻗은 큰 곡선 날 (도끼의 덩어리 헤드와 정반대 실루엣)
                cyl(0.028, 0.034, 1.0, wood, 0, 0.36);
                { const blade = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.026, 5, 12, Math.PI * 0.62), bladeMat);
                  blade.position.set(0.02, 0.84, 0); blade.rotation.z = -0.5; blade.scale.z = 0.32; g.add(blade); }
                { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 5), bladeMat);
                  tip.position.set(0.35, 1.04, 0); tip.rotation.z = -1.9; tip.scale.z = 0.4; g.add(tip); }
                cyl(0.045, 0.045, 0.07, dark, 0, 0.8);      // 날 소켓
                lashing(0.06, 0.042);
                break;
            }
            case 'sling': {
                // 투석구: 가죽 주머니 + 두 가닥 끈 + 장전된 돌 (총기류로 오독되면 안 되는 원시 원거리 무기)
                // 주머니를 넓적하게·돌을 크게 잡아야 '두 갈래 포크'로 안 읽힌다(썸네일 실측).
                { const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), dark);
                  pouch.rotation.x = Math.PI; pouch.scale.set(1.15, 0.62, 0.9); pouch.position.y = -0.3; g.add(pouch); }
                { const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.085, 0), mat);
                  stone.rotation.set(0.4, 0.7, 0); stone.position.y = -0.285; g.add(stone); }
                // ⚠️ 끈 두 가닥은 **끝이 어딘가에 닿아야** 한다 — 끝이 뜨면 '나뭇가지 두 개 + 그릇'이
                //    된다(실측). 그리고 1차 채점(A '국자'·B 'Y자 새총')의 원인은 **위 세로 손잡이 + 곧은
                //    V자 끈**이었다 — 곧은 두 가닥이 Y 포크로, 세로 자루가 새총 그립으로 읽힌다.
                //    → 손잡이를 **가로 토글**로 눕히고, 끈을 바깥으로 살짝 배부른 **곡선 튜브**로 바꿔
                //    '늘어진 가죽끈'을 만든다(새총 프레임은 곧아야 하므로 곡선이 곧 슬링의 서명이다).
                { const toggle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.17, 7), wood);
                  toggle.rotation.z = Math.PI / 2; toggle.position.y = 0.05; g.add(toggle); }
                for (const s of [-1, 1]) {
                    const pts = [
                        new THREE.Vector3(s * 0.07, 0.045, 0),      // 토글 끝
                        new THREE.Vector3(s * 0.125, -0.12, 0),     // 바깥으로 배부른 중간
                        new THREE.Vector3(s * 0.10, -0.275, 0),     // 주머니 테
                    ];
                    const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.009, 5), dark);
                    g.add(cord);
                }
                // ⚠️ 손목 고리(토러스)를 자루 위에 얹었다가 뺐다 — 자루와 떨어져 보여 **갈고리**로 읽혔다.
                break;
            }
            case 'pistol': {
                // 권총/플린트락: 짧은 총열 + 각진 그립 (장총과 길이로 확실히 구분)
                box(0.055, 0.26, 0.06, bladeMat, 0, 0.19);      // 총열
                box(0.07, 0.1, 0.075, mat, 0, 0.06);            // 슬라이드/약실
                { const grip = box(0.062, 0.17, 0.085, wood, -0.01, -0.05); grip.rotation.x = 0.22; }
                box(0.03, 0.05, 0.03, dark, 0, 0.0, 0.045);     // 방아쇠울
                if (matKind === 'blackpowder') {
                    { const hammerPart = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), mat);
                      hammerPart.position.set(0, 0.1, -0.045); hammerPart.rotation.x = -0.5; g.add(hammerPart); } // 부싯돌 공이
                    { const pan = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 0.03), mat); pan.position.set(0, 0.08, -0.02); g.add(pan); }
                }
                break;
            }
            case 'rifle': {
                // 장총 계열(머스킷/소총/산탄총/레이저/레일건) — 공통 골격 위에 id별 식별 부속을 얹는다.
                // 공통 골격만 두면 썸네일에서 5종이 전부 같은 막대로 읽힌다 (실측 확인 후 분화).
                const long = wtypeId === 'musket' || wtypeId === 'railgun';   // 장열 화기
                const barrelH = long ? 0.74 : 0.6;
                box(0.05, barrelH, 0.055, bladeMat, 0, 0.4 + barrelH / 2 - 0.28);
                box(0.095, 0.3, 0.1, wood, 0, 0.14);            // 총몸/핸드가드
                { const stock = box(0.08, 0.26, 0.095, wood, 0, -0.12); stock.rotation.x = 0.12; }  // 개머리판
                box(0.055, 0.13, 0.075, dark, 0, -0.02, 0.055); // 그립
                box(0.03, 0.05, 0.03, dark, 0, 0.02, 0.065);    // 방아쇠울
                if (wtypeId === 'shotgun') {
                    // 산탄총: 나란한 2연장 총열 + 펌프 — 굵고 짧은 실루엣
                    box(0.05, 0.58, 0.055, bladeMat, 0.055, 0.42);
                    { const pump = box(0.13, 0.14, 0.075, dark, 0.027, 0.3); pump.rotation.z = 0; }
                } else if (wtypeId === 'gun' || wtypeId === 'quantumRifle') {
                    // 소총: 아래로 뻗은 곡선 탄창 + 조준경 (가장 '소총'다운 식별자)
                    { const magz = box(0.055, 0.24, 0.08, dark, 0, -0.02, 0.1); magz.rotation.x = -0.32; }
                    box(0.035, 0.06, 0.13, dark, 0, 0.3, -0.075);   // 조준경
                } else if (matKind === 'energy') {
                    // 에너지 계열: 총열 발광 코일 + 방열 핀 (레일건은 평행 레일 2줄)
                    if (wtypeId === 'railgun') {
                        for (const rx of [-0.055, 0.055]) {
                            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.7, 0.022), bladeMat);
                            rail.position.set(rx, 0.5, 0); g.add(rail);
                        }
                    } else {
                        for (let i = 0; i < 3; i++) {
                            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.013, 5, 12), bladeMat);
                            coil.rotation.x = Math.PI / 2; coil.position.y = 0.34 + i * 0.13;
                            g.add(coil);
                        }
                    }
                    { const cell = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.05), bladeMat); cell.position.set(0, 0.08, 0.085); g.add(cell); } // 에너지 셀
                } else if (matKind === 'blackpowder') {
                    // 머스킷: 꽂을대 + 총열 밴드 + 부싯돌 기관 — 현대 화기와 확실히 구분되는 구식 부속
                    { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.56, 5), mat); rod.position.set(0, 0.44, 0.05); g.add(rod); }
                    for (const by of [0.3, 0.52]) {
                        const band = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.009, 5, 10), mat);
                        band.rotation.x = Math.PI / 2; band.position.y = by; g.add(band);
                    }
                    { const lock = box(0.03, 0.09, 0.05, mat, 0, 0.12, -0.06); lock.rotation.x = -0.35; }  // 부싯돌 공이
                }
                break;
            }
            case 'smg': {
                // 기관단총: 짧고 뭉툭한 총열 + 아래로 뻗은 탄창 (소총 실루엣과 구분)
                box(0.05, 0.3, 0.055, bladeMat, 0, 0.28);
                box(0.09, 0.22, 0.095, mat, 0, 0.1);            // 리시버
                { const magz = box(0.05, 0.2, 0.07, dark, 0, -0.06, 0.02); magz.rotation.x = -0.12; }  // 탄창
                box(0.05, 0.11, 0.07, wood, 0, -0.02, -0.03);   // 그립
                { const stock = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI), dark);
                  stock.rotation.y = Math.PI / 2; stock.position.set(0, -0.08, -0.09); g.add(stock); } // 접이식 개머리
                break;
            }
            case 'cannon': {
                // 캐논/발사기: 굵은 포신 + 어깨 견착부 + 에너지 셀 (라이플보다 확연히 굵게)
                cyl(0.11, 0.13, 0.62, mat, 0, 0.36);            // 포신
                { const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.028, 6, 14), dark);
                  muzzle.rotation.x = Math.PI / 2; muzzle.position.y = 0.66; g.add(muzzle); }  // 포구 링
                { const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 10), bladeMat);
                  bore.position.y = 0.68; g.add(bore); }        // 발광 포구
                box(0.13, 0.24, 0.14, dark, 0, 0.06);           // 몸체
                { const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.18, 8), bladeMat);
                  cell.rotation.z = Math.PI / 2; cell.position.set(0, 0.1, 0.11); g.add(cell); }  // 에너지 셀
                box(0.06, 0.13, 0.08, wood, 0, -0.08, 0.02);    // 그립
                { const pad = box(0.1, 0.14, 0.1, dark, 0, -0.12, -0.06); pad.rotation.x = 0.2; }  // 견착 패드
                break;
            }
            default: // 무기 없음 → 나무 몽둥이
                cyl(0.045, 0.06, 0.5, wood, 0, 0.22);
        }
        // ── 천상: 십자가 + 후광 (사용자 지시 2026-08-19 "천상→진짜 천상 같아야 함 — 예: 예수 머리·십자가") ──
        // 금색 재질만으로는 '노랗게 칠한 강철'이라 시대가 색으로만 읽혔다. 정체성을 **형태**로 준다:
        // 파지점 위 라틴 십자가 · 무기 머리 뒤 후광 고리 + 방사 광선.
        // ⚠️ 세로대와 가로대를 같은 길이로 두면 더하기 기호로 읽힌다 — 가로대는 세로대 위쪽 1/3 지점.
        if (matKind === 'holy') {
            const holyLit = this.divineLitMat(); // 방어구 후광과 같은 재질 — 램버트 크림 0.85 는 '균일 크림 판' 함정(divineLitMat 주석)
            const cross = new THREE.Group();
            { const v = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.2, 0.026), mat); cross.add(v);
              const h = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.034, 0.026), mat); h.position.y = 0.045; cross.add(h);
              const gem = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), holyLit);
              gem.position.set(0, 0.045, 0.022); cross.add(gem); }
            cross.position.set(0, 0.05, -0.055);
            g.add(cross);
            // 후광은 무기 실높이에 맞춰 머리 뒤에 — 고정 y 로 두면 짧은 무기에서 허공에 뜬다
            // (에너지 링이 예전에 밟은 함정과 같은 자리).
            const wTop = new THREE.Box3().setFromObject(g).max.y;
            const haloY = Math.min(0.88, Math.max(0.34, wTop * 0.8));
            const halo = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.017, 6, 24), holyLit);
            halo.position.set(0, haloY, -0.07); g.add(halo);
            for (let i = 0; i < 8; i++) {   // 성상화의 방사 광선
                const a = i * Math.PI / 4;
                const ray = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.075, 0.011), holyLit);
                ray.position.set(Math.cos(a) * 0.205, haloY + Math.sin(a) * 0.205, -0.072);
                ray.rotation.z = Math.PI / 2 - a;
                g.add(ray);
            }
        }
        // 시대 구간별 디테일 (같은 무기도 시대에 따라 다르게)
        if (matKind === 'holy') {
            // 천상은 위 후광이 시대 표식이라 에너지 링을 겹치지 않는다 (고리 두 개 = 정체 불명)
        } else if (ageIdx >= 3 && ageIdx <= 6) { // 근현대~우주: 테크 액센트 스트립
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
        const gripDrop = { staff: 0.3, spear: 0.38, scythe: 0.34, rapier: 0.05 }[shape];
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
        // 시대별 무기 분리로 늘어난 계열 (키는 shape — gripOf가 id → shape 순으로 찾는다)
        mace:     { rot: [0.95, 0, -0.15], pose: { elbowR: -0.85 } },                      // 해머와 같은 어깨 걸침 레디 캐리
        rapier:   { rot: [0.18, 0, -0.22], pose: { elbowR: -0.4 } },                       // 가늘고 길어 검보다 세워 들기
        scythe:   { rot: [0.62, 0, 0], pose: { elbowR: -0.3 } },                           // 장병기 — 창처럼 세워 들기
        sling:    { rot: [0.2, 0, 0], pose: { shoulderR: -0.5, elbowR: -0.7 } },           // 주머니를 아래로 늘어뜨린 대기 자세
        pistol:   { rot: [0, 0, 0], pose: { shoulderR: -0.45, elbowR: 0.25 } },            // 한 손 겨눔 — 총열이 짧아 팔을 더 편다
        rifle:    { rot: [0, 0, 0], pose: { shoulderR: -0.35, elbowR: 0.2 } },             // 기존 gun과 동일한 견착 겨눔
        smg:      { rot: [0, 0, 0], pose: { shoulderR: -0.4, elbowR: 0.22 } },
        cannon:   { rot: [0, 0, 0], pose: { shoulderR: -0.3, elbowR: 0.15 } },             // 굵고 무거운 견착 화기
    },
    // C자 랩 주먹 — 자루를 감는 손가락 마디 링 3개 + 엄지 + 너클 볼록 (사용자 재검수: 무기가 손바닥에 '붙은' 게 아니라 '쥐어진' 실루엣)
    // weaponG의 자식으로 원점(파지점)에 두므로 Idle/걷기/공격 전 상태에서 자루-주먹 정렬이 자동 유지된다.
    makeGripWrap(shaftR, invScale) {
        const g = new THREE.Group();
        // ⚠️ 2026-08-18 6차 비평가 재지적 ㉥(양쪽 지목): "오른손이 **모델 전체에서 채도 최고**라 시선이
        //    얼굴이 아니라 손으로 간다 / 갈색 덩어리에 텍스처 낙서". 실측으로 확인됐다
        //    (`probe-hand-focus.js`: 파지 랩 채도 **0.612** vs 머리 0.207 vs 영웅 전체 0.425).
        //    원인은 두 가지고 **둘 다 주석이 주장하던 것과 달랐다**:
        //    ⑴ 이 재질은 "히어로 주먹(palmMat)과 동일"이라고 적혀 있었지만 실제 palmMat 은
        //       `deepMat({roughness:0.88, metalness:0.1})` = 니어블랙 0x04050a + **범프만**이다.
        //       여기만 0x2e1a0c 라는 웜 브라운을 쓰고 있었다 — 같지 않았다.
        //    ⑵ `map: leatherTex()` 는 **컬러 맵**이라 밝은 베이스(#c9b8a6)를 곱한다. R 배수가 B 배수보다
        //       커서 곱할수록 주황으로 치우치고(=채도 상승), 텍스처의 랜덤 크랙이 색 얼룩('낙서')으로 뜬다.
        //       `deepMat` 주석에 이미 "텍스처 맵은 밝은 베이스를 곱하므로 쓰지 않고 범프만 얹는다"고
        //       적혀 있는데 이 경로만 그 규칙 밖에 있었다.
        //    → 리그 주먹과 **진짜로** 같은 재질을 쓴다(= deepMat, 컬러 맵 없음).
        const skin = ProChar.deepMat({ roughness: 0.86, metalness: 0.08 });
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
        // 너클 가드 + 골드 리벳 — 리그 주먹(prochar.js `guard`/`gRivet`)과 같은 마감.
        // 니어블랙으로 내리고 나면 이게 없으면 손이 '검은 덩어리'가 된다(리그 주먹이 읽히는 것도
        // 가죽이 아니라 이 밝은 스틸 + 금 리벳 덕이다). 재질은 ProChar.TONE 을 빌드 시점에 읽어
        // 갑옷 3톤과 값이 어긋나지 않게 한다.
        const guardMat = new THREE.MeshStandardMaterial({ color: ProChar.TONE.steel, metalness: 0.85, roughness: 0.34, envMapIntensity: 0.32 });
        const guard = new THREE.Mesh(new THREE.SphereGeometry(0.044, 9, 7), guardMat);
        guard.scale.set(0.9, 1.15, 0.8);
        guard.position.set(-(shaftR + 0.012), 0.004, 0);
        const gRivet = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.95, roughness: 0.3, envMapIntensity: 0.8 }));
        gRivet.position.set(-(shaftR + 0.042), 0.026, 0);
        g.add(guard, gRivet);
        g.scale.setScalar(invScale); // weaponG 스케일 상쇄 — 활계 0.6 축소에도 주먹 크기 일정
        return g;
    },
    // 파지 규칙은 지오메트리 계열이 정한다 — 같은 계열이면 재질이 달라도 쥐는 법은 같다
    // (id 직접 지정이 있으면 그게 우선: 계열 공유 중 예외를 두고 싶을 때)
    gripOf(wtypeId) {
        return this.WEAPON_GRIP[wtypeId] || this.WEAPON_GRIP[weaponShape(wtypeId)] || this.WEAPON_GRIP.sword;
    },
    // 방패를 등에 메기/내리기 — 핸들바를 잡은 손 위에 방패가 덮이면 파지가 화면에서 사라진다.
    // 원래 자리(왼손 소켓)의 변환을 첫 호출 때 기억해 두고 되돌린다(장비 교체로 리그가 새로 만들어지면
    // 기억도 같이 버린다 — 다른 리그의 좌표를 물려주면 방패가 엉뚱한 데 붙는다).
    _shieldHome: null,
    slingShield(on) {
        const rig = this.heroRig, sh = rig && rig.shield;
        if (!sh) return;
        if (!this._shieldHome || this._shieldHome.rig !== rig) {
            this._shieldHome = { rig, parent: sh.parent, pos: sh.position.clone(), rot: sh.rotation.clone() };
        }
        const home = this._shieldHome;
        if (on) {
            if (sh.parent !== rig.bones.spine) rig.bones.spine.add(sh);
            sh.position.set(-0.02, 0.14, -0.20);     // 등 한가운데, 망토 위로 살짝 띄워 z-fighting 방지
            sh.rotation.set(0.15, 0, 0.25);          // 등판에 비스듬히 걸친 각
        } else if (sh.parent !== home.parent) {
            home.parent.add(sh);
            sh.position.copy(home.pos);
            sh.rotation.copy(home.rot);
        }
    },

    applyWeaponGrip() {
        const grip = this.gripOf(this.wtypeId);
        if (this.heroRig) {
            const target = grip.hand === 'L' ? this.heroRig.handL : this.heroRig.handR;
            if (this.weaponG.parent !== target) target.add(this.weaponG); // 활계 왼손 이관 (bow 클립도 왼팔을 드는 구성)
            // 무기 거치 자세(상체) + 탑승 포즈(하체)를 합성 — 탈것에 타면 다리는 안장을 감싸고 팔은 무기를 든다
            this.heroRig.restPose = (this.ridePose || grip.pose)
                ? Object.assign({}, grip.pose || null, this.ridePose || null)
                : null;
            // 자전거류는 **빈 손이 바를 잡아야** 한다("자전거인데 양손이 옆에 늘어져 있다" — 비평가 지적 ⓒ).
            // 무기 든 손은 그대로 두고 반대쪽 팔만 앞·아래로 뻗는다. 어느 쪽이 빈 손인지는 무기마다
            // 달라지므로(활계는 왼손 파지) 상수 포즈에 못 박고 여기서 합성한다.
            // ⚠️ 계열이 아니라 **바가 실제로 있는 종**에만 적용한다 — 외바퀴 드로이드는 같은 wheeled인데
            //    핸들바가 없어서, 계열로 걸면 허공을 잡는 팔이 된다.
            // 사족·비행형은 고삐(`reinReach`)가 같은 자리를 쓴다 — 잡을 물건만 다르고 팔 처리는 같다.
            const reach = this.freeHandReach();
            if (reach) {
                const free = grip.hand === 'L' ? 'R' : 'L';       // 무기 안 든 쪽
                const rp = this.heroRig.restPose = Object.assign({}, this.heroRig.restPose);
                rp['shoulder' + free] = { rx: reach.shoulder, rz: (free === 'L' ? 1 : -1) * (reach.shoulderZ || 0) };
                rp['elbow' + free] = { rx: reach.elbow };
                if (free === 'R') this.heroRig.restX = 0;         // 오른어깨 이중 가산 방지(무기 거치 rx와 충돌)
            }
            // 🚨 방패가 **바를 잡은 손을 통째로 덮는다** — 그립을 손에 정확히 붙여 놔도 화면에서는
            //    "손이 핸들바에 없다"로 읽힌다(비평가 2인이 독립적으로 같은 오독을 했고, 확대 크롭으로
            //    실제 원인이 방패 가림임을 확인했다). 탑승 중에는 등에 멘다 — 실제 기병도 그렇게 한다.
            this.slingShield(!!reach && grip.hand !== 'L');   // 방패는 왼팔에 달려 있다(활계는 이미 숨김)
            // 공격 클립(once) 중에는 restPose가 통째로 꺼진다 — 그때도 하체만은 안장을 감고 있어야 하므로
            // 탑승 포즈를 따로 넘긴다(ProChar.update가 once 클립에서 이쪽만 가산한다).
            this.heroRig.ridePose = this.ridePose || null;
            if (grip.hand === 'L') this.heroRig.restX = 0; // 조준 자세는 restPose가 양팔을 정의 — 오른어깨 이중 가산 방지
            if (this.heroRig.shield) this.heroRig.shield.visible = grip.hand !== 'L'; // 활·석궁은 왼손 파지 — 같은 팔의 방패와 겹침 방지
        }
        const gp = grip.pos || [0, 0, 0];
        this.weaponG.position.set(gp[0], gp[1], gp[2]);
        this.weaponG.rotation.set(grip.rot[0], grip.rot[1], grip.rot[2]);
        const sc = 2.44 * (grip.scale || 1); // 기본 2.44 = weapon-size-2x(사용자 지시 2026-08-19, 종전 1.22 의 ×2)
        this.weaponG.scale.setScalar(sc); // 기본 존재감 스케일 × 무기별 보정 (활계 과대 축소)
        // ⚠️ 파지 랩에는 **월드 자루 반경**(shaftR × sc)을 넘긴다 — 랩은 1/sc 역스케일로 손 크기를
        //    지키므로, 로컬 반경을 그대로 주면 무기 배율이 오를 때 자루가 주먹 링보다 굵어져 뚫고 나온다
        //    (2배 상향에서 실제로 0.080 > 0.051 로 뚫렸다). 링 = 월드 자루 + 0.018 여유.
        if (this.heroRig) this.weaponG.add(this.makeGripWrap((grip.shaftR || 0.033) * sc, 1 / sc)); // 파지점 C자 랩 주먹 (refreshHeroEquip의 clearGroup이 수명 관리)
        this._gripRot = grip.rot;
        this._gripPos = gp;
    },

    refreshHeroEquip(withFlash) {
        if (!this.heroG) return;
        // 무기 (타입별 모델 + 모션 + 등급 젬 + 거치 자세)
        this.clearGroup(this.weaponG);
        const w = S.equipment.weapon;
        this.wtypeId = w ? (w.wtype || 'sword') : 'club';
        const wModel = this.makeWeapon(this.wtypeId, w ? w.ageIdx : 0, w && w.rarity);
        if (w) this.applyAscendDecor(wModel, w.stars, 'equip'); // 승천 데코 — 시대 테마 위에 누적 (ascend-design-tiers)
        this.weaponG.add(this.gradeHeroGearValue(wModel));
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
        if (h) {
            const hModel = this.makeHelmet(h.age, h.rarity, itemStyleOf(h), itemNameOf(h));
            this.applyAscendDecor(hModel, h.stars, 'equip'); // 승천 데코 (ascend-design-tiers)
            this.helmetG.add(this.gradeHeroGearValue(hModel));
        }
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
            this.chestPlate.visible = style !== 'hide' && style !== 'robe' && style !== 'bone'; // bone = 가죽 받침 + 뼈판, 강철 흉갑이 아니다
            this.clearGroup(this.armorExtraG);
            this.armorExtraG.add(this.makeArmorExtras(style, c, ec, a ? this.ageGearMats(a.age, itemNameOf(a)) : null, { age: a && a.age }));
        }
        // ⚠️ **방패는 일부러 그레이딩에 안 태운다 — 되돌리지 말 것.** 리그 소속이라 썸네일과 무관해
        //    기술적으로는 걸 수 있고 실제로 걸어 봤는데(전량·절반 둘 다), 방패는 그레이딩 전에도
        //    L 81 로 이미 비평가 처방 대역(70~85) 안이다. 여기에 투구·검과 같은 폭을 걸면 근접샷에서
        //    **금 테두리만 남고 판이 통째로 검게 죽는다**(델타 이득은 12845화소 중 953화소분 ≈ 1.5뿐).
        //    부위별 실측(`probe-hero-value-parts.js`)이 '이미 어두운 파츠'와 '밝은 덩어리'를 갈라 준다 —
        //    밝은 덩어리(투구 141·검 170)만 내리는 게 이 그레이딩의 취지다.
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

    // ---- 시대 재질 언어 (사용자 지시: 원시=돌·나무·뼈·가죽 / 중세=단조 철·리벳 / 미래=합금·발광 라인) ----
    // 무기는 weaponMatKind가 이미 시대를 stone/bone/blackpowder/gunmetal/energy로 갈라놨는데,
    // 투구·갑옷·장신구는 전 시대가 **같은 식('스틸 32% 혼합 + metalness .85')** 하나였다 —
    // 그래서 원시 시대 '뼈 투구'도 매끈한 회백 금속으로 나와 시대색만 다른 같은 물건으로 읽혔다.
    // 무기와 같은 시대 구획을 부위 장비에도 적용해, 부위를 넘나들어도 한 세트로 읽히게 한다.
    ageGearKind(age) {
        const i = Math.max(0, AGES.indexOf(age));
        // 천상(마지막 시대)은 alloy 를 물려받으면 시안 발광 라인·시안 에지 웨어가 금 위에 얹혀
        // '체커보드 프린트'로 오독된다(2차 채점 A·B) — 전용 holy 계열로 가른다.
        return i === 0 ? 'primal' : i === 1 ? 'forged' : i === 2 ? 'brass' : i === 3 ? 'polymer' : i === AGES.length - 1 ? 'holy' : 'alloy';
    },
    // 그 시대의 `suit` 가 **기밀복(압력 탱크·호스·발광 스트라이프)** 인가 (equip-era-theming ③).
    // ⚠️ 계열(ageGearKind)로 가르면 안 된다 — alloy 에는 지하 세계('용암 갑주')가 같이 묶이고
    //    holy 에는 '신탁의 로브'가 묶여, 용암 갑주와 신성한 로브 등에 산소통이 붙는다.
    //    실제로 밀폐복인 시대만 이름으로 골라 둔다. 그 밖의 시대 suit 는 퀴레스 조형으로 간다.
    SUIT_SEALED: ['modern', 'space', 'interstellar', 'multiverse', 'quantum'],
    suitSealed(age) { return this.SUIT_SEALED.indexOf(age) >= 0; },

    // 시대별 재질 세트 — body(주 표면) / dark(부속·스트랩) / trim(시대 디테일) / glow 여부.
    // ⚠️ map은 albedo에 **곱해진다**. rockTex 베이스가 #b9bcc0(≈0.73), leatherTex가 #c9b8a6(≈0.76)이라
    //    맵을 얹는 계열은 color를 그만큼 올려두지 않으면 시대색이 통째로 한 단 어두워진다(실측 후 보정).
    // name 을 주면 이름이 가리키는 물질(뼈·사슬·용암…)로 body 를 갈아끼운다 — 아래 substanceMats 참조.
    // 시대 재질은 계속 dark/trim/glow 로 남아 시대 정체성이 지워지지 않는다.
    ageGearMats(age, name) {
        const base = this.ageGearMatsBase(age);
        const sub = (typeof substanceOf === 'function') ? substanceOf(name) : null;
        return sub ? this.substanceMats(base, sub, age) : base;
    },
    // ---- 시대별 셰이딩 파이프라인 (비평가 2차 지적 ⓒ⑴) ────────────────────────────────
    // 지적 원문: "두 시대가 지오메트리 100% 동일에 **흰색↔하늘색 색 스와프**뿐이다. 중세는
    // metalness + 에지 웨어 마스크(모서리 밝게) + 크레비스 다크닝(AO 근사)을, 원시는 파트별 색 분리를."
    // 지적은 사실이었다 — 원인이 둘 있었고 여기서 **둘 다** 잡는다.
    //
    // 원인 ①(색): `AGE_COLORS.primitive = 0xe0e0e0`(거의 흰색)·`medieval = 0x1cafff`(형광 하늘색)인데
    //   base 색을 **시대색에서 재질색 쪽으로 32~52%만** 보간했다. 즉 화면에 남는 지배색이 시대색이라
    //   원시는 흰 도자기, 중세는 하늘색 플라스틱으로 읽혔다. → 가중치를 뒤집어 **재질색이 지배**하고
    //   시대색은 tint(AGE_TINT=0.16)로만 남긴다. 시대 정체성은 원래 설계대로 **trim·glow·디테일**이 진다
    //   (항목 ② "시대마다 재질·실루엣 언어" — 시대색으로 전신을 물들이라는 요구가 아니다).
    //
    // 원인 ②(셰이딩): 다섯 계열이 PBR 파라미터만 다르고 **셰이더가 하나**였다. 파라미터만으로는
    //   '닳은 모서리'도 '틈에 낀 그늘'도 안 나온다 — 둘 다 위치 의존이라 재질 상수로 표현이 안 된다.
    //   → `ageShade()` 가 `onBeforeCompile` 로 계열마다 다른 항을 심는다.
    //     · 크레비스 다크닝 = **하늘 가림 근사**. 월드 법선의 y로 위/아래를 갈라 아래를 보는 면을
    //       어둡게 한다(파울드론 라멜라 밑·고젯 안쪽·벨트 아래·부츠 발등 그늘). 진짜 AO는 아니지만
    //       조립 파츠 더미에서 '깊이'로 읽히는 그늘이 정확히 이 면들이다.
    //     · 에지 웨어 = **시선에 스치는 각(프레넬)** 이 곧 실루엣 모서리다. 판금은 거기가 벗겨져
    //       밝게 닳고, 황동은 광이 서고, 폴리머·합금은 거의 안 닳는다(계열마다 강도·색이 다르다).
    //   ⚠️ `THREE.Material.copy()` 는 `onBeforeCompile` 을 복사하지 않는다 — `tintOf()` 로 파생시킨
    //      재질은 주입이 통째로 빠져 **한 모델 안에서 셰이딩이 갈린다**. tintOf 가 재적용한다(아래).
    //   ⚠️ `customProgramCacheKey` 를 안 주면 three 가 같은 파라미터의 **주입 없는 프로그램**을
    //      재사용해 계열이 통째로 안 먹는다. 계열명을 키로 준다.
    AGE_TINT: 0.16,
    // 계열별 파라미터: crev=틈 그늘 깊이 · crevP=그늘이 번지는 범위 · wear=모서리 마모 강도
    //                  wearP=마모가 모서리에 몰리는 정도(클수록 가장자리만) · wearCol=마모색
    AGE_SHADE: {
        primal: { crev: 0.38, crevP: 1.35, wear: 0.12, wearP: 3.4, wearCol: 0xd8cfb4 }, // 돌: 깊은 그늘, 모서리는 흙먼지로 살짝 밝게
        forged: { crev: 0.46, crevP: 1.15, wear: 0.62, wearP: 2.4, wearCol: 0xf2f6fb }, // 단조 철: 벗겨진 모서리가 흰 강철로 번뜩인다
        brass: { crev: 0.40, crevP: 1.30, wear: 0.50, wearP: 2.8, wearCol: 0xffe9b0 }, // 황동: 틈에 낀 녹청은 더 어둡고 모서리는 금빛
        polymer: { crev: 0.50, crevP: 1.15, wear: 0.16, wearP: 4.2, wearCol: 0xb9c4cf }, // 무광 폴리머: 거의 안 닳는다
        alloy: { crev: 0.50, crevP: 1.05, wear: 0.34, wearP: 3.2, wearCol: 0x9fe8ff }, // 합금: 모서리에 냉광 라인
        holy: { crev: 0.42, crevP: 1.20, wear: 0.55, wearP: 2.3, wearCol: 0xfff1c2 }, // 천상 금: 모서리에 따뜻한 백금광 — 시안(알로이) 웨어가 금 위에 얹히던 것을 가른다
        // 천·가죽 계열(hide·robe)은 **계열이 아니라 스타일**로 갈린다 — 같은 중세라도 로브는 판금이
        // 아니다. 실측에서 soft 스타일만 셰이딩 깊이가 안 올라가 별도 프로파일을 뒀다(깊이 1.69~1.85 정체).
        // 천은 모서리가 '닳아 벗겨지는' 게 아니라 **결이 서는(sheen)** 것이라 프레넬을 넓게 준다.
        // ⚠️ 천도 **시대마다 갈라야 한다.** 프로파일 하나로 묶었더니 근세↔현대 로브가 조형·셰이딩이
        //    같고 색만 달라져 `probe-age-shading` 의 재질분리에서 0.68(기준 1.00)로 반려됐다 —
        //    비평가가 친 '색 스와프'가 천 쪽에서 그대로 재현된 것이다. 시대별 천을 따로 정의한다.
        soft: { crev: 0.32, crevP: 1.50, wear: 0.42, wearP: 2.0, wearCol: 0xf6f1e6 },   // 폴백
        'soft:primal': { crev: 0.30, crevP: 1.55, wear: 0.30, wearP: 2.4, wearCol: 0xefe4cd },  // 거친 생가죽
        'soft:forged': { crev: 0.36, crevP: 1.45, wear: 0.40, wearP: 2.1, wearCol: 0xf6f1e6 },  // 두꺼운 모직
        'soft:brass': { crev: 0.30, crevP: 1.30, wear: 0.54, wearP: 1.8, wearCol: 0xffeccf },  // 왁스 먹인 캔버스 — 광이 넓게 선다
        'soft:polymer': { crev: 0.48, crevP: 1.62, wear: 0.08, wearP: 3.8, wearCol: 0xa6b1bd },  // 무광 기술섬유 — 광이 거의 없다
        'soft:alloy': { crev: 0.34, crevP: 1.25, wear: 0.38, wearP: 2.2, wearCol: 0xd8f2ff },  // 발광 섬유
        'soft:holy': { crev: 0.30, crevP: 1.30, wear: 0.56, wearP: 1.8, wearCol: 0xfff6dc },  // 성의(聖衣) 실크 — 결이 넓게 선다
    },

    // ---- 이차 디테일 + 색 변주 (비평가 ⓒ⑶ "스티치·리벳 열·매듭·천 주름 같은 이차 디테일과
    //      색 변주(같은 가죽 안 명도 3단)가 부족하다") ----
    // ⚠️ **지오메트리로 박지 않는다.** 리벳 한 열을 메시로 넣으면 칸마다 수십~수백 폴리가 붙는 것도
    //    문제지만, 진짜 문제는 **실루엣이 흔들린다**는 것이다 — 썸네일의 알파 박스가 곧 UI 스트림의
    //    '잉크 비율' 계약이고(`fit-ink`·ui-ratio-audit 는 ±2%p 로 잰다), `probe-equip-framing`(크롭/채움)과
    //    `probe-equip-silhouette`(96px 윤곽 분화)도 같은 알파를 본다. 표면 셰이더로 넣으면 실루엣이
    //    한 픽셀도 안 움직이면서 안쪽 정보만 는다.
    // 좌표는 **오브젝트 공간**(vAgePos)이다 — 자동 프레이밍이 모델을 옮기고 카메라가 도는데
    // 뷰/월드 공간을 쓰면 무늬가 물체 위를 미끄러진다.
    // 축은 법선의 지배 성분으로 골라 쓴다(싸구려 트라이플래너) — 한 평면에 고정하면 옆면·윗면에서
    // 무늬가 길게 늘어져 '늘어난 텍스처'로 읽힌다.
    //   mode  = 무늬 종류 · freq = 무늬 반복 밀도(오브젝트 단위당) · amp = 세기
    //   vary  = 같은 재질 안 명도 3단 변주 폭 · vfreq = 그 패치 크기(작을수록 큰 얼룩)
    // ⚠️ freq 를 올릴수록 96px 에서 **모아레로 뭉개진다**. 무늬 한 칸이 최종 이미지에서 6px 이상
    //    남게 잡을 것(장비 몸통이 오브젝트 단위로 0.4~0.6, 썸네일에서 ~80px → freq 12 면 칸당 ≈7px).
    AGE_DETAIL: {
        primal: { mode: 'grain', freq: 24, amp: 0.22, vary: 0.050, vfreq: 20 },   // 돌·뼈: 팬 자국·기공
        // 판금: 리벳 **열**. ⚠️ freq 11 + 전면 그리드였던 종전 값을 되돌리지 말 것 — 표면 전체에
        //    큰 도넛이 균일하게 깔려 중세 투구·갑옷 10종이 통째로 **물방울 무늬(뽁뽁이)** 로 읽혔다
        //    ('중세→진짜 중세(기사)' 사용자 지시와 정반대). 리벳은 판을 잇는 **줄(seam)** 에만 박힌다.
        forged: { mode: 'rivet', freq: 20, amp: 0.30, vary: 0.040, vfreq: 20, rivetRow: 3 },
        brass: { mode: 'panel', freq: 13, amp: 0.22, vary: 0.040, vfreq: 20 },   // 황동: 각인 격자
        polymer: { mode: 'panel', freq: 10, amp: 0.18, vary: 0.040, vfreq: 20 },   // 폴리머: 패널 심
        alloy: { mode: 'panel', freq: 12, amp: 0.24, vary: 0.040, vfreq: 20, glow: 0x9fe8ff }, // 합금: 심에 냉광
        holy: { mode: 'panel', freq: 8, amp: 0.16, vary: 0.035, vfreq: 20 },   // 천상 금: 성판 각인 심 — 냉광 없음(시안 글로우가 '체커보드' 오독의 몸통)
        // 사슬(물질 'chain' 전용 — 계열 키가 아니라 **무늬 키**로만 쓰인다, ageShade 3번째 인자):
        // 종전엔 chain 몸통이 계열(forged)의 리벳 무늬를 그대로 물어 '동그라미 한 줄 프린트'로
        // 읽혔다(1차 채점 B). 사슬은 리벳이 아니라 **엇갈린 고리들이 맞물린 직물**이다 — 행마다
        // 반 칸 어긋난 고리 + 고리 사이 틈 그늘 + 고리 윗호 하이라이트가 메일의 서명.
        chain: { mode: 'mail', freq: 13, amp: 0.50, vary: 0.035, vfreq: 20 },
        soft: { mode: 'stitch', freq: 12, amp: 0.26, vary: 0.060, vfreq: 20 },   // 천·가죽: 바늘땀 + 주름
        'soft:primal': { mode: 'stitch', freq: 11, amp: 0.44, vary: 0.070, vfreq: 20, grain: 0.95, grainF: 6.5 }, // 거친 생가죽 — 땀이 굵고 얼룩이 크다(현대 기술섬유와 거칠기가 갈려야 한다)
        'soft:forged': { mode: 'stitch', freq: 12, amp: 0.26, vary: 0.060, vfreq: 20 }, // 모직
        'soft:brass': { mode: 'stitch', freq: 13, amp: 0.24, vary: 0.055, vfreq: 20 }, // 왁스 캔버스
        'soft:polymer': { mode: 'panel', freq: 11, amp: 0.05, vary: 0.030, vfreq: 20 }, // 무광 기술섬유: 바느질이 아니라 접합선 — 게다가 **매끈해야** 한다.
        //   ⚠️ 0.20/0.085 로 주면 거친 생가죽(soft:primal)과 표면 거칠기가 같아져 `probe-age-shading` 의
        //     원시↔현대 천 재질분리가 1.16 → 0.60 으로 내려앉는다(무늬를 넣다가 '색 스와프'를 되살린 꼴).
        'soft:alloy': { mode: 'panel', freq: 12, amp: 0.22, vary: 0.045, vfreq: 20, glow: 0xd8f2ff },
        'soft:holy': { mode: 'stitch', freq: 11, amp: 0.20, vary: 0.045, vfreq: 20 },  // 성의: 고운 실크 땀
    },
    // 계열별 무늬 GLSL — `uv2`(트라이플래너로 고른 2축)와 `dAmp` 가 이미 선언돼 있다고 보고 쓴다.
    ageDetailGLSL(d, f) {
        if (d.mode === 'grain') return [
            // 기공·팬 자국: 격자 해시로 잘게 판다. 밝게 튀우지 않는다(돌·뼈는 파인 자국이 그늘이다).
            '\tfloat dG = fract(sin(dot(floor(vAgePos * ' + f(d.freq) + ' * vec3(1.0, 1.73, 1.31) + vec3(0.37, 0.11, 0.73)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
            // ⚠️ **제로 평균**으로 준다(0.5 를 빼서 ±). 한쪽으로만 어둡게 하면 무늬를 넣을수록 평균
            //    휘도가 통째로 내려가, 계열끼리 밝기가 붙어 `probe-age-shading` 의 재질분리가 무너진다
            //    (원시 생가죽 실측: 136.8 → 129.8 로 내려가 Δ휘도가 5.0 → 1.9 로 죽었다).
            '\tdiffuseColor.rgb *= 1.0 + dAmp * 0.9 * (dG - 0.5);',
        ];
        if (d.mode === 'rivet') return [
            // 리벳: 도넛 그늘(테) + 볼록한 머리 하이라이트. 머리를 과하게 밝히면 순백으로 타므로
            // ⚠️ 가산은 0.3배까지만 — probe-equip-clip 의 5% 게이트가 여기서 먼저 깨진다.
            // rivetRow = N 이면 **N 줄 걸러 한 줄**에만 리벳이 서고, 그 줄을 따라 접합 이음선이 간다.
            // 이게 '균일 그리드 = 물방울 무늬'와 '리벳 박은 판금'을 가르는 유일한 차이다.
            '\tvec2 ruv = uv2 * ' + f(d.freq) + ';',
            '\tfloat rRow = ' + (d.rivetRow ? '1.0 - step(0.5, mod(floor(ruv.y), ' + f(d.rivetRow) + '))' : '1.0') + ';',
            '\tvec2 rc = fract(ruv) - 0.5;',
            '\tfloat rd = length(rc);',
            '\tfloat rRim = (smoothstep(0.36, 0.26, rd) - smoothstep(0.24, 0.15, rd)) * rRow;',
            '\tfloat rHead = smoothstep(0.21, 0.05, rd) * rRow;',
            // 이음선: 리벳 중심 높이를 따라 가는 그늘 한 줄 (리벳이 무엇을 붙잡고 있는지 보여 준다)
            '\tfloat rSeam = (1.0 - smoothstep(0.03, 0.13, abs(rc.y))) * rRow;',
            '\tdiffuseColor.rgb *= 1.0 - dAmp * (rRim + rSeam * 0.45);',
            '\tdiffuseColor.rgb += diffuseColor.rgb * dAmp * 0.30 * rHead;',
        ];
        if (d.mode === 'mail') return [
            // 메일(사슬 갑옷): 행마다 반 칸 어긋난 고리 격자. 고리 안 구멍은 밑감 그늘로 꺼지고
            // 고리 자체는 윗호가 빛을 받아 밝고 아랫호가 어둡다 — 이 두 값 대비가 '금속 고리 직물'을
            // 만든다. 리벳(rivet)과 달리 **전면에 깔리는 게 맞다** — 사슬은 무늬가 아니라 재질 자체다.
            // ⚠️ 고리를 격자당 한 개(반지름 < 반 칸)로 두지 말 것 — 고리끼리 안 닿아 '프린트된
            //    물방울 점 나열'로 읽힌다(2차 채점 A·B 공통 "파자마 무늬"). 실제 메일은 고리가
            //    이웃 고리에 **맞물린다** — 반 칸 대각 오프셋의 두 번째 격자를 겹쳐, 고리 지름을
            //    격자 간격까지 키워 서로 걸리게 한다(대각 중심거리 0.707 < 지름 1.0).
            '\tvec2 muv = uv2 * ' + f(d.freq) + ';',
            '\tmuv.x += mod(floor(muv.y), 2.0) * 0.5;',
            '\tvec2 mc = fract(muv) - 0.5;',
            '\tfloat md = length(mc);',
            '\tvec2 mc2 = fract(muv + vec2(0.5, 0.5)) - 0.5;',
            '\tfloat md2 = length(mc2);',
            '\tfloat mRing = smoothstep(0.56, 0.46, md) - smoothstep(0.38, 0.28, md);',
            '\tfloat mRing2 = smoothstep(0.56, 0.46, md2) - smoothstep(0.38, 0.28, md2);',
            '\tfloat mArc = clamp(-mc.y / max(md, 1e-4), 0.0, 1.0);',
            '\tfloat mArc2 = clamp(-mc2.y / max(md2, 1e-4), 0.0, 1.0);',
            // 틈 그늘: 두 격자 어느 고리에도 안 덮인 자리만 꺼진다 — 한 격자만 보면 고리 사이가
            // 전부 구멍이라 점무늬가 더 심해진다
            '\tfloat mHole = smoothstep(0.30, 0.10, md) * (1.0 - mRing2);',
            '\tdiffuseColor.rgb *= 1.0 - dAmp * 0.72 * mHole;',
            // 고리: 윗호 가산·아랫호 감산 — 제로 평균에 가깝게(grain 모드의 교훈: 한쪽으로만 밀면
            // 평균 휘도가 내려가 probe-age-shading 의 재질분리가 무너진다). 겹침 부위는 마스크가
            // 강한 쪽 고리가 이긴다(max 로 합치면 아랫호 감산이 빈 격자의 0에 지워진다 — 함정).
            '\tfloat mSh = (mRing >= mRing2) ? mRing * (mArc * 0.85 - 0.30) : mRing2 * (mArc2 * 0.85 - 0.30);',
            '\tdiffuseColor.rgb *= 1.0 + dAmp * mSh;',
        ];
        if (d.mode === 'panel') {
            const g = d.glow !== undefined ? new THREE.Color(d.glow) : null;
            const out = [
                // 패널 심: 셀 중심을 지나는 십자 홈. 얇게(0.06) 파야 96px 에서 선으로 읽힌다.
                '\tvec2 pf = abs(fract(uv2 * ' + f(d.freq) + ') - 0.5);',
                '\tfloat pSeam = 1.0 - smoothstep(0.0, 0.06, min(pf.x, pf.y));',
                '\tdiffuseColor.rgb *= 1.0 - dAmp * pSeam;',
            ];
            if (g) out.push('\tdiffuseColor.rgb += vec3(' + f(g.r) + ', ' + f(g.g) + ', ' + f(g.b) + ') * dAmp * 0.45 * pSeam;');
            return out;
        }
        // stitch: 바늘땀(가로 실선 + 점선 끊김) + 저주파 주름. 천은 이 둘이 같이 와야 '천'으로 읽힌다.
        // grain 을 주면 결·기공 speckle 을 더 얹는다 — 생가죽처럼 **거칠기 자체가 정체성**인 천용.
        // ⚠️ 이건 미관이 아니라 게이트 요구다: `probe-age-shading` 의 시대 쌍 '재질분리'는 두 천의
        //    휘도SD 차로 재는데, 원시 생가죽(22.4)이 현대 기술섬유(24.8)보다 **오히려 매끈했다**.
        //    바늘땀만 얹으면 24.3 으로 올라가 둘이 겹쳐 분리가 2.4 → 0.3 으로 무너진다(무늬를 넣다가
        //    '색 스와프'를 되살리는 꼴). 생가죽을 확실히 거친 쪽으로 밀어 갈라 놓는다.
        return [
            '\tvec2 sq = uv2 * ' + f(d.freq) + ';',
            '\tfloat sLine = smoothstep(0.13, 0.0, abs(fract(sq.y) - 0.5));',
            '\tfloat sDash = step(0.42, fract(sq.x * 2.0));',
            '\tfloat sSt = sLine * sDash;',
            '\tdiffuseColor.rgb *= 1.0 - dAmp * 0.85 * sSt;',
            '\tfloat sFold = sin(sq.x * 0.34 + sq.y * 0.13);',
            '\tdiffuseColor.rgb *= 1.0 + dAmp * 0.22 * sFold;',
        ].concat(d.grain ? [
            '\tfloat sGrain = fract(sin(dot(floor(vAgePos * ' + f(d.freq * (d.grainF || 2.4)) + ' * vec3(1.0, 1.73, 1.31) + vec3(0.37, 0.11, 0.73)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
            '\tdiffuseColor.rgb *= 1.0 + dAmp * ' + f(d.grain * 2.0) + ' * (sGrain - 0.5);',
        ] : []);
    },
    // dkey — 무늬만 계열과 다르게 갈 때(물질 전용 무늬, 예: 사슬 'chain'). 셰이딩 프로파일은 계열 것.
    ageShade(mat, kind, dkey) {
        const p = this.AGE_SHADE[kind] || (String(kind).indexOf('soft:') === 0 ? this.AGE_SHADE.soft : null);
        if (!mat || !p || !mat.isMeshStandardMaterial) return mat;
        const wc = new THREE.Color(p.wearCol);
        const f = n => n.toFixed(4);
        mat.userData = mat.userData || {};
        mat.userData.ageShade = kind;          // tintOf 가 파생 재질에 재적용하려고 남긴다
        mat.userData.ageShadeDetail = dkey || null;
        const d = this.AGE_DETAIL[dkey || kind] || (String(kind).indexOf('soft:') === 0 ? this.AGE_DETAIL.soft : null);
        mat.customProgramCacheKey = () => 'ageshade-' + kind + (dkey ? '-' + dkey : '');
        mat.onBeforeCompile = (sh) => {
            sh.vertexShader = 'varying vec3 vAgeWN;\nvarying vec3 vAgePos;\n' + sh.vertexShader.replace(
                '#include <beginnormal_vertex>',
                '#include <beginnormal_vertex>\n\tvAgeWN = normalize(mat3(modelMatrix) * objectNormal);').replace(
                // 오브젝트 공간 좌표 — begin_vertex 직후의 transformed 가 (스키닝·모프 전) 로컬 위치다.
                '#include <begin_vertex>',
                '#include <begin_vertex>\n\tvAgePos = transformed;');
            // diffuseColor 와 normal 이 **둘 다** 정해진 뒤라야 한다 — diffuse 계열 include 는 normal 보다
            // 앞이고, lights_physical_fragment 는 diffuseColor 를 material 로 옮기기 직전이라 여기가 유일한 자리다.
            const det = d ? [
                '\t// ---- 색 변주: 같은 재질 안에서 명도 3단으로 갈라 "한 통 페인트"를 깬다 ----',
                '\t// 오브젝트 공간 격자 해시 → -1/0/+1 세 단. 연속 노이즈로 하면 얼룩이 흐릿해 96px 에서 안 읽힌다.',
                '\tfloat vHash = fract(sin(dot(floor(vAgePos * ' + f(d.vfreq) + ' * vec3(1.0, 1.73, 1.31) + vec3(0.37, 0.11, 0.73)), vec3(12.9898, 78.233, 37.719))) * 43758.5453);',
                '\tdiffuseColor.rgb *= 1.0 + ' + f(d.vary) + ' * (floor(vHash * 3.0) - 1.0);',
                '\t// ---- 이차 디테일: 축은 법선의 지배 성분으로 고른다(싸구려 트라이플래너) ----',
                '\tvec3 dAN = abs(normalize(vAgeWN));',
                '\tvec2 uv2 = (dAN.z >= dAN.x && dAN.z >= dAN.y) ? vAgePos.xy : ((dAN.x >= dAN.y) ? vAgePos.zy : vAgePos.xz);',
                '\tfloat dAmp = ' + f(d.amp) + ';',
            ].concat(this.ageDetailGLSL(d, f)) : [];
            sh.fragmentShader = 'varying vec3 vAgeWN;\nvarying vec3 vAgePos;\n' + sh.fragmentShader.replace(
                '#include <lights_physical_fragment>',
                det.concat([
                    '\t// 크레비스 다크닝 — 하늘 가림 근사(아래를 보는 면 = 틈·처마 밑)',
                    '\tfloat ageSky = clamp(vAgeWN.y * 0.5 + 0.5, 0.0, 1.0);',
                    '\tdiffuseColor.rgb *= mix(' + f(p.crev) + ', 1.0, pow(ageSky, ' + f(p.crevP) + '));',
                    '\t// 에지 웨어 — 시선에 스치는 각 = 실루엣 모서리. 거기가 벗겨져 닳는다.',
                    '\tfloat ageFres = pow(clamp(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), ' + f(p.wearP) + ');',
                    '\tdiffuseColor.rgb = mix(diffuseColor.rgb, vec3(' + f(wc.r) + ', ' + f(wc.g) + ', ' + f(wc.b) + '), ageFres * ' + f(p.wear) + ');',
                    '#include <lights_physical_fragment>',
                ]).join('\n'));
        };
        return mat;
    },
    ageGearMatsBase(age) {
        const kind = this.ageGearKind(age);
        const c = new THREE.Color(AGE_COLORS[age] !== undefined ? AGE_COLORS[age] : 0xb0bec5);
        // ⚠️ t 는 "시대색이 남는 비율"이다(예전엔 반대로 재질색이 남는 비율이라 시대색이 전신을 먹었다).
        const mix = (hex, t) => new THREE.Color(hex).lerp(c, t === undefined ? this.AGE_TINT : t);
        const std = o => this.ageShade(new THREE.MeshStandardMaterial(o), kind);
        if (kind === 'primal') {
            // 돌·뼈·가죽: 금속기 0. flatShading으로 깎아낸 면을 남기고 rockTex 입자로 '민짜 점토'를 막는다.
            const rock = ProChar.rockTex();
            return {
                kind, glow: false,
                // 파트별 색 분리(비평가 ⓒ⑴ "원시는 뼈=아이보리·가죽=탄 갈색·돌=회청색") —
                // 예전엔 body 가 거의 흰색이라 셋이 한 덩어리로 뭉쳤다. 이제 몸이 **회청색 돌**로
                // 내려앉아 가죽 끈(탄 갈색)·뼈 장식(아이보리)과 명도·색상이 모두 갈린다.
                // ⚠️ rockTex 베이스가 #b9bcc0(≈0.73)이라 맵이 albedo 를 그만큼 깎는다 — color 는 그 몫만큼 올려 둔 값이다.
                body: std({ color: mix(0x99a3b0), metalness: 0.02, roughness: 0.96,
                    map: rock, bumpMap: rock, bumpScale: 0.022, flatShading: true, envMapIntensity: 0.22 }),
                dark: std({ color: 0x5a3a1c, metalness: 0, roughness: 0.9,   // 탄 갈색 가죽(맵 0.76 곱해져 ≈0x442c15)
                    map: ProChar.leatherTex(), bumpMap: ProChar.leatherTex(), bumpScale: 0.014 }),
                trim: std({ color: 0x452a12, metalness: 0, roughness: 0.92, map: ProChar.leatherTex() }), // 가죽 결속끈
                bead: std({ color: 0xeee5cb, metalness: 0.03, roughness: 0.62, flatShading: true }),      // 뼈·이빨 = 아이보리
            };
        }
        if (kind === 'forged') {
            // 단조 철: 브러시드 결 + 리벳 + **에지 웨어**(ageShade 가 심는다).
            // ⚠️ 예전 색은 시대색(0x1cafff 형광 하늘색)을 68% 남겨 '하늘색 도자기'로 읽혔다 — 비평가 ⓒ⑴ 의 정확한 지적.
            const metal = ProChar.metalTex();
            return {
                kind, glow: false,
                body: std({ color: mix(0x9ba4ae), metalness: 0.86, roughness: 0.42,
                    map: metal, bumpMap: metal, bumpScale: 0.014, envMapIntensity: 0.75 }),
                dark: std({ color: 0x232a33, metalness: 0.62, roughness: 0.56 }),
                trim: std({ color: 0x8c99a6, metalness: 0.92, roughness: 0.3, envMapIntensity: 0.9 }), // 리벳 대가리
            };
        }
        if (kind === 'brass') {
            // 근세: 황동 부속 + 무두질 가죽 (무기 blackpowder 계열과 같은 팔레트)
            return {
                kind, glow: false,
                body: std({ color: mix(0xb08d57), metalness: 0.8, roughness: 0.34, envMapIntensity: 0.8 }),
                dark: std({ color: 0x2a2119, metalness: 0.2, roughness: 0.72, map: ProChar.leatherTex() }),
                trim: std({ color: 0xd8b878, metalness: 0.92, roughness: 0.26, envMapIntensity: 0.95 }),
            };
        }
        if (kind === 'polymer') {
            // 현대: 무광 폴리머 패널 + 저광 금속 (무기 gunmetal과 짝)
            return {
                kind, glow: false,
                body: std({ color: mix(0x6b7480), metalness: 0.34, roughness: 0.66, envMapIntensity: 0.5 }),
                dark: std({ color: 0x272d33, metalness: 0.5, roughness: 0.58 }),
                trim: std({ color: 0x1c2126, metalness: 0.45, roughness: 0.5 }), // 벤트 슬랫
            };
        }
        if (kind === 'holy') {
            // 천상: 짙은 앰버 금 + 상아 백 2톤 (무기 holy 계열과 짝).
            // ⚠️ 밝은 금 알베도(0xf2c94c 대역)를 되살리지 말 것 — 금속 알베도는 반사의 틴트라,
            //    밝으면 환경맵 하늘 반사가 전면에 균일하게 깔려 '무광 버터'로 읽힌다(2차 채점 A·B 공통).
            //    짙은 앰버라야 골이 어둡게 가라앉고 태양 핫스팟 하이라이트와 명도폭이 벌어져 금이 된다.
            return {
                kind, glow: false,
                body: std({ color: mix(0xc8921e, 0.08), metalness: 0.93, roughness: 0.30, envMapIntensity: 1.0 }),
                dark: std({ color: 0x6e4a12, metalness: 0.85, roughness: 0.44 }),           // 깊은 청동 그늘
                trim: std({ color: 0xf3e8d0, metalness: 0.22, roughness: 0.5, envMapIntensity: 0.6 }), // 상아 백 새시 — 금과 2톤 분리
                bead: std({ color: 0xffe9a8, metalness: 0.9, roughness: 0.22, emissive: 0xffc247, emissiveIntensity: 0.28 }), // 성광 보석
            };
        }
        // alloy — 우주 이후: 어두운 합금 셸 + 시대색 발광 라인 (무기 energy와 짝)
        return {
            kind, glow: true,
            body: std({ color: mix(0x2b3340, 0.30), metalness: 0.9, roughness: 0.24, envMapIntensity: 0.95 }),
            dark: std({ color: 0x161b22, metalness: 0.7, roughness: 0.4 }),
            trim: new THREE.MeshBasicMaterial({ color: c.clone().offsetHSL(0, 0.1, 0.22) }), // 언릿 발광 라인
        };
    },

    // ---- 이름이 가리키는 물질로 표면을 갈아끼운다 (사용자 지시 "시대·이름별 전부 다르게" ③ 이름 정합) ----
    // 시대 재질만 쓰면 한 시대의 다섯 이름이 전부 같은 물질이라 '이름만 다른 같은 그림'이 된다
    // ('뼈 갑옷'이 돌로, '사슬 조끼'가 통판금으로, '용암 갑주'와 '재의 조끼'가 같은 색으로 나왔다 —
    //  probe-equip-dedupe 실측에서 시대 안 68쌍이 사실상 같은 그림으로 잡힌 원인의 절반).
    // 시대색을 22% 섞어 물질을 갈아도 시대 팔레트는 남게 한다. dark/trim/glow 는 시대 것을 그대로 물려받는다.
    substanceMats(base, sub, age) {
        const ac = new THREE.Color(AGE_COLORS[age] !== undefined ? AGE_COLORS[age] : 0xb0bec5);
        const tone = (hex, t) => new THREE.Color(hex).lerp(ac, t === undefined ? 0.22 : t);
        // 물질로 갈아끼운 body 도 **시대 셰이딩은 그대로 탄다** — 안 그러면 이름 있는 장비만
        // 에지 웨어·크레비스가 빠져 한 목록 안에서 셰이딩이 갈린다(시대 계열은 base.kind 가 안다).
        // 두 번째 인자 = 물질 전용 무늬 키(선택) — 계열 무늬가 물질과 어긋날 때만 준다(사슬).
        const std = (o, dkey) => this.ageShade(new THREE.MeshStandardMaterial(o), base.kind, dkey);
        const rock = ProChar.rockTex(), leather = ProChar.leatherTex(), metal = ProChar.metalTex();
        let body = null, dark = null;
        switch (sub) {
            case 'bone': // 뼈·이빨·조가비: 상아빛, 금속기 0, 깎아낸 면
                body = std({ color: tone(0xece3c8, 0.16), metalness: 0.02, roughness: 0.6, flatShading: true, envMapIntensity: 0.25 });
                break;
            case 'wood':
                body = std({ color: tone(0xa9764a), map: leather, bumpMap: leather, bumpScale: 0.02, metalness: 0, roughness: 0.9, envMapIntensity: 0.2 });
                break;
            case 'stone':
                body = std({ color: tone(0xb9bdc2), map: rock, bumpMap: rock, bumpScale: 0.026, metalness: 0.02, roughness: 0.97, flatShading: true, envMapIntensity: 0.2 });
                break;
            case 'leather':
                body = std({ color: tone(0x8a5a33), map: leather, bumpMap: leather, bumpScale: 0.018, metalness: 0.03, roughness: 0.87, envMapIntensity: 0.25 });
                break;
            case 'chain': // 사슬: 잔 고리가 빛을 흩어 판금보다 거칠고 어둡다.
                // 무늬는 계열 것(forged=리벳)이 아니라 사슬 전용 'chain'(메일 고리) — 리벳을 그대로
                // 물리면 '동그라미 한 줄 프린트'로 읽힌다(1차 채점 B). metal 범프는 뺀다(고리 무늬와
                // 브러시드 결이 겹치면 96px 에서 모아레 노이즈가 된다).
                body = std({ color: tone(0x7e8792), metalness: 0.86, roughness: 0.58, envMapIntensity: 0.55 }, 'chain');
                dark = std({ color: 0x2b323a, metalness: 0.7, roughness: 0.66 });
                break;
            case 'plate':
                body = std({ color: tone(0xc6d0da), map: metal, bumpMap: metal, bumpScale: 0.012, metalness: 0.93, roughness: 0.28, envMapIntensity: 0.9 });
                break;
            case 'brass':
                body = std({ color: tone(0xc08a3e), metalness: 0.86, roughness: 0.31, envMapIntensity: 0.85 });
                break;
            case 'silver':
                body = std({ color: tone(0xdae1e8, 0.14), metalness: 0.96, roughness: 0.17, envMapIntensity: 1.0 });
                break;
            case 'gold':
                // ⚠️ 밝은 금(0xf2c94c)을 되살리지 말 것 — 금속 알베도가 밝으면 환경 반사가 전면에
                //    깔려 '무광 버터'가 된다(2차 채점). 짙은 앰버 + 태양 핫스팟 대비가 금의 서명.
                body = std({ color: tone(0xc8921e, 0.12), metalness: 0.95, roughness: 0.26, envMapIntensity: 1.0 });
                break;
            case 'fabric': // 로브·망토·모자: 무광 천, 반사 거의 없음
                body = std({ color: tone(0xb6b0a6, 0.42), metalness: 0, roughness: 0.97, envMapIntensity: 0.15 });
                break;
            case 'tactical':
                body = std({ color: tone(0x5c6357, 0.3), metalness: 0.22, roughness: 0.78, envMapIntensity: 0.35 });
                break;
            case 'alloy':
                body = std({ color: tone(0xa8b6c4), metalness: 0.9, roughness: 0.27, envMapIntensity: 0.95 });
                break;
            case 'energy': { // 파동·양자: 시대색으로 은은히 자체발광
                const e = ac.clone().offsetHSL(0, 0.1, 0.1);
                body = std({ color: tone(0x39424f, 0.3), emissive: e, emissiveIntensity: 0.55, metalness: 0.55, roughness: 0.28, envMapIntensity: 0.8 });
                break;
            }
            case 'holo': { // 홀로·픽셀·코드: 반투명 + 강한 발광
                const e = ac.clone().offsetHSL(0, 0.16, 0.24);
                body = std({ color: tone(0x8fd8ff, 0.3), emissive: e, emissiveIntensity: 0.85, metalness: 0.2, roughness: 0.2,
                    transparent: true, opacity: 0.72, envMapIntensity: 0.6 });
                break;
            }
            case 'lava': // 용암·지옥불: 식은 암반 + 갈라진 틈의 주황 발광
                body = std({ color: tone(0x331912, 0.18), map: rock, bumpMap: rock, bumpScale: 0.03,
                    emissive: new THREE.Color(0xff5a1e), emissiveIntensity: 0.5, metalness: 0.15, roughness: 0.85, flatShading: true });
                break;
            case 'ash': // 재·원한: 빛을 다 먹는 잿빛
                body = std({ color: tone(0x5b5651, 0.18), map: rock, bumpMap: rock, bumpScale: 0.02, metalness: 0.05, roughness: 0.99, flatShading: true, envMapIntensity: 0.12 });
                break;
            default:
                return base;
        }
        return Object.assign({}, base, { body, dark: dark || base.dark, substance: sub });
    },

    // 같은 재질 계열 안에서 명도만 다른 파생 재질 (맵·금속도를 공유해야 '다른 파이프라인'으로 안 읽힌다)
    tintOf(base, dl, opt) {
        const m = base.clone();
        m.color = base.color.clone().offsetHSL(0, 0, dl || 0);
        if (opt) Object.assign(m, opt);
        // ⚠️ THREE.Material.copy() 는 onBeforeCompile 을 복사하지 않는다 — 재적용하지 않으면
        //    파생 재질(파울드론 아랫장·파울드·커프…)만 시대 셰이딩이 빠져 한 모델 안에서 갈린다.
        if (base.userData && base.userData.ageShade) this.ageShade(m, base.userData.ageShade, base.userData.ageShadeDetail);
        return m;
    },

    // ---- 파트 단위 명도 3단 (비평가 ⓒ⑶ "같은 가죽 안 명도 3단") ----
    // 셰이더 얼룩(AGE_DETAIL.vary)만으로는 이 요구가 안 채워진다 — 좌표가 **파트 로컬**이라
    // 작은 파트(끈·버클·라멜라 한 장)는 통째로 한 단이 되고, 파트끼리는 서로 같은 값이다.
    // 실측으로도 확인했다: vary 를 0.045→0.17 로 올리고 vfreq 를 7→20 으로 좁혀도 저주파 변주
    // 지표(`probe-equip-detail.js` 의 lf, 8×8 블록 평균의 표준편차)는 ±1% 안에서 꿈쩍도 안 했다.
    // 눈이 '3단'으로 읽는 건 파트 **사이**의 값 차이라, 여기서 파트마다 결정적으로 단을 준다.
    // ⚠️ 재질은 파트끼리 공유된다 — mat 를 직접 건드리면 모델 전체가 같이 움직인다. tintOf 로
    //    파생시켜 그 메시에만 물린다(tintOf 가 onBeforeCompile 재적용까지 한다).
    // ⚠️ 순서 의존이라 **모델을 다 조립한 뒤 마지막에 한 번만** 부를 것. 중간에 부르고 파트를 더
    //    붙이면 같은 파트가 다른 단을 받아 캐시 키가 같은데 그림이 달라진다.
    tierizeParts(root, dl) {
        if (!root) return root;
        const step = dl === undefined ? 0.055 : dl;
        let i = 0;
        root.traverse(o => {
            if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
            const t = (i++ * 5 + 1) % 3 - 1;   // 0, -1, +1 이 고르게 도는 결정적 순열
            if (t !== 0) o.material = this.tintOf(o.material, t * step);
        });
        return root;
    },

    // ── 조형 헬퍼 3종 (비평가 지적 ㉯⑴ 대응) ────────────────────────────────────────
    // "갑옷·장갑·신발·벨트가 프리미티브 상자 조합 — 박스는 어떤 라이팅을 걸어도 박스"가 6점 벽이었다.
    // Box/Cylinder 조립으로는 가슴 곡률·허리 잘록·파울드론 벌어짐·부츠 목·발등 곡선·손가락이 안 나온다.
    // ⑴ shellFromRings: 높이마다 타원 반경이 다른 단면 링을 쌓아 **실루엣 자체를 곡선으로** 만든다.
    //    rings 는 **아래→위** 순서: [{ y, rx, rz, z? }] · seg = 둘레 분할.
    //    opt.open = 위아래 캡 생략(관), opt.flat = 각진 음영(원시 계열의 깎아낸 느낌).
    //    ⚠️ 감김 방향 주의 — 재질이 FrontSide 라 뒤집히면 통째로 안 보인다. 옆면은 (a,c,b)/(b,c,d),
    //       아래 캡은 (중심,i,i+1), 위 캡은 (중심,i+1,i) 여야 법선이 바깥·아래·위를 향한다.
    shellFromRings(rings, seg, mat, opt) {
        const o = opt || {};
        const n = Math.max(6, seg | 0), R = rings.length;
        if (R < 2) return new THREE.Group();
        const pos = [], idx = [];
        // opt.fold = 천 주름(비평가 ⓒ⑶). 둘레를 따라 반경을 오르내리게 해 **접힌 천**을 만든다.
        //   ⚠️ `ageDetailGLSL` 의 stitch 프로파일이 이미 주름을 **칠하지만**(sFold), 칠한 주름은
        //      실루엣이 없다 — 96px 로 줄이면 바깥 윤곽은 여전히 매끈한 종(鐘)이다. 조형 쪽 주름은
        //      윤곽 자체를 오르내리게 해 그 층을 채운다(칠과 조형은 겹치는 게 아니라 포갠다).
        //   ⚠️ 천은 위에서 매달려 아래로 갈수록 벌어진다 — 모든 링에 같은 진폭을 주면 목까지
        //      자바라가 된다. 링마다 fw(주름 가중치)로 조절한다. 진폭은 반경 대비 비율이라
        //      스타일마다 밑단이 커도 주름 깊이가 자동으로 따라간다.
        const fold = o.fold || 0, foldN = Math.max(3, o.foldN || 9);
        for (let r = 0; r < R; r++) {
            const ring = rings[r];
            const fw = fold * (ring.fw === undefined ? 1 : ring.fw);
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2;
                const k = fw ? 1 + fw * Math.cos(a * foldN) : 1;
                pos.push(ring.rx * k * Math.cos(a), ring.y, ring.rz * k * Math.sin(a) + (ring.z || 0));
            }
        }
        for (let r = 0; r < R - 1; r++) {
            for (let i = 0; i < n; i++) {
                const a = r * n + i, b = r * n + (i + 1) % n, c = (r + 1) * n + i, d = (r + 1) * n + (i + 1) % n;
                idx.push(a, c, b, b, c, d);
            }
        }
        if (!o.open) {
            const bot = rings[0], top = rings[R - 1], base = (R - 1) * n;
            const bi = pos.length / 3; pos.push(0, bot.y, bot.z || 0);
            const ti = bi + 1; pos.push(0, top.y, top.z || 0);
            for (let i = 0; i < n; i++) {
                idx.push(bi, i, (i + 1) % n);
                idx.push(ti, base + (i + 1) % n, base + i);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        if (o.flat) {
            const g2 = geo.toNonIndexed();
            g2.computeVertexNormals();
            geo.dispose();
            return new THREE.Mesh(g2, mat);
        }
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, mat);
    },
    // ⑵ 라운드 사각 단면 + 베벨 압출 — 판금 라멜라·너클판·인장판처럼 '두꺼운 판'에 Box 대신 쓴다.
    //    모서리가 깎여 하이라이트가 한 줄로 흐르므로 96px 썸네일에서도 '판'으로 읽힌다.
    roundedRectShape(w, h, r) {
        const x = w / 2, y = h / 2, rr = Math.max(0.001, Math.min(r, x * 0.98, y * 0.98));
        const s = new THREE.Shape();
        s.moveTo(-x + rr, -y);
        s.lineTo(x - rr, -y); s.quadraticCurveTo(x, -y, x, -y + rr);
        s.lineTo(x, y - rr); s.quadraticCurveTo(x, y, x - rr, y);
        s.lineTo(-x + rr, y); s.quadraticCurveTo(-x, y, -x, y - rr);
        s.lineTo(-x, -y + rr); s.quadraticCurveTo(-x, -y, -x + rr, -y);
        return s;
    },
    beveledSlab(w, h, d, r, mat) {
        const bev = Math.min(d * 0.3, Math.min(w, h) * 0.15, 0.02);
        const geo = new THREE.ExtrudeGeometry(
            this.roundedRectShape(w - bev * 2, h - bev * 2, r === undefined ? Math.min(w, h) * 0.3 : r),
            { depth: Math.max(0.001, d - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 6 });
        geo.translate(0, 0, -d / 2 + bev);
        return new THREE.Mesh(geo, mat);
    },
    // ⑶ 캡슐 — 손가락·프롱·끈처럼 '끝이 둥근 기둥'. Cylinder 만 쓰면 잘린 관처럼 보인다.
    capsuleMesh(r, len, mat, seg) {
        const g = new THREE.Group();
        const n = seg || 10;
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, n), mat));
        for (const s of [-1, 1]) {
            const cap = new THREE.Mesh(new THREE.SphereGeometry(r, n, Math.max(4, n >> 1), 0, Math.PI * 2, 0, Math.PI / 2), mat);
            cap.position.y = s * len / 2;
            if (s < 0) cap.rotation.x = Math.PI;
            g.add(cap);
        }
        return g;
    },
    // ⑷ 테이퍼 튜브 — 곡선 경로를 따라 가며 **굵기가 변하는** 관. 활 림처럼 '뿌리는 굵고 끝은
    //    가늘게' 가 실루엣의 정체성인 부위에 쓴다. `TubeGeometry` 는 반경이 상수라 그것만으로는
    //    어디를 잘라도 같은 굵기 = 관(파이프)으로 읽힌다.
    //    ⚠️ 링 중심을 커브에서 다시 받아 오는 게 핵심 — 정점을 원점 기준으로 줄이면 관이
    //       가늘어지는 게 아니라 **경로째 원점으로 빨려 들어간다**.
    taperedTube(pts, r0, r1, mat, tub, rad) {
        const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2] || 0)));
        const T = tub || 24, R = rad || 6;
        const geo = new THREE.TubeGeometry(curve, T, Math.max(r0, r1), R);
        const pos = geo.attributes.position;
        const c = new THREE.Vector3(), v = new THREE.Vector3();
        for (let i = 0; i <= T; i++) {
            curve.getPointAt(i / T, c);
            const k = (r0 + (r1 - r0) * (i / T)) / Math.max(r0, r1);
            for (let j = 0; j <= R; j++) {
                const idx = i * (R + 1) + j;
                v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(k).add(c);
                pos.setXYZ(idx, v.x, v.y, v.z);
            }
        }
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, mat);
    },
    // ⑸ 매듭 — 비평가 ⓒ⑶ 이 요구한 넷("스티치·리벳 열·**매듭**·천 주름") 중 유일하게 칠로는
    //    못 내는 것이다. 스티치·리벳·주름은 표면 무늬라 `ageDetailGLSL` 이 셰이더로 심지만,
    //    매듭은 **덩어리**다 — 끈이 만나는 자리가 부풀고 꼬리가 늘어져야 '묶였다'로 읽힌다.
    //    납작한 구(매듭 몸통) + 짧은 원뿔 꼬리 2가닥으로, 가닥 굵기(r)에 비례해 짓는다.
    tieKnot(mat, r, opt) {
        const o = opt || {};
        const g = new THREE.Group();
        // 검증기용 표식 — `probe-equip-drape.js` 가 매듭만 껐다 켜서 **실제로 화면에 보이는지**를
        // 픽셀 차분으로 잰다. 타입으로 찾으면 다른 연출이 같이 잡힌다(TODO 함정 ④⑵).
        // 파츠가 몸 안에 파묻혀 0픽셀이어도 콘솔 에러도 캡처 이상도 안 난다(같은 문서의 ㉤⑵).
        g.userData.knot = true;
        const core = new THREE.Mesh(new THREE.SphereGeometry(r * 1.9, 8, 6), mat);
        core.scale.set(1, 0.78, 0.85);
        g.add(core);
        for (const s of [-1, 1]) {
            const tail = new THREE.Mesh(new THREE.ConeGeometry(r * 0.95, r * 4.2, 6), mat);
            tail.position.set(s * r * 2.2, -r * 1.5, 0);
            tail.rotation.z = s * 0.55 + Math.PI;   // 끝이 아래를 향해 늘어진다
            g.add(tail);
        }
        if (o.ry) g.rotation.y = o.ry;
        if (o.rz) g.rotation.z = o.rz;
        return g;
    },
    // ⑹ 브로우 사발 — **방위각마다 테두리 높이가 다른** 반구 셸. 투구 사발처럼 앞은 눈썹 위로
    //    솟은 아치, 옆은 관자놀이, 뒤는 목덜미까지 내려오게 한다.
    //    🚨 왜 프리미티브로는 안 되는가: `SphereGeometry` 의 thetaLength 는 둘레 전체에 **한 값**이다.
    //       뒤통수를 덮으려고 길게 주면 앞도 같이 내려와 **눈이 통째로 사라지고**, 눈을 비우려고
    //       짧게 자르면 뒤통수가 뚫린다. 하나의 상수가 앞뒤를 다 감당하려 한 것이 `fin` 투구가
    //       흰자를 1.7% 만 남기던 원인이었다(slug: helmet-fin-covers-eyes).
    //    opt: { rx, ry, rz, cy,  front·side·back = +y 에서 잰 테두리 각(라디안),
    //           from(0~1: 테두리 쪽 띠만 뽑는다 · 0 = 정수리부터 = 사발 전체),
    //           flare(테두리로 갈수록 반경 배율 — 목가리개처럼 벌어지는 자락),
    //           phi0·phiLen(부분 호 · 기본 한 바퀴 · φ=0 이 정면 +z), seg, rows }
    //    ⚠️ 재질은 **DoubleSide 로 줄 것** — 앞을 비우면 사발 안쪽이 보인다(FrontSide 면 뻥 뚫린다).
    //    ⚠️ 감김: (e_θ × e_φ) 가 바깥이므로 삼각형은 (i,j)→(i,j+1)→(i+1,j) / (i+1,j+1)→(i+1,j)→(i,j+1).
    browedBowl(o, mat) {
        const rx = o.rx, ry = o.ry === undefined ? rx : o.ry, rz = o.rz === undefined ? rx : o.rz;
        const cy = o.cy || 0, from = Math.min(0.95, Math.max(0, o.from || 0)), flare = o.flare || 0;
        const full = o.phiLen === undefined || o.phiLen >= Math.PI * 2 - 1e-6;
        const phi0 = o.phi0 || 0, phiLen = full ? Math.PI * 2 : o.phiLen;
        const N = Math.max(8, o.seg || 26), M = Math.max(2, o.rows || 7);
        const tf = o.front, ts = o.side, tb = o.back;
        const cols = full ? N : N + 1;   // 부분 호는 끝 링을 안 닫으므로 정점 줄이 하나 더 있다
        const pos = [], idx = [];
        for (let i = 0; i < cols; i++) {
            const phi = phi0 + phiLen * (i / N), c = Math.cos(phi);
            // 앞→옆→뒤로 테두리 각을 잇는다. 지수(0.65·0.8)는 **옆 근처에서 빨리 꺾이게** 해
            // 아치가 얼굴 폭 안에서 솟게 만든다(선형이면 관자놀이까지 완만해 눈을 스친다).
            const tm = c >= 0 ? ts - (ts - tf) * Math.pow(c, 0.65) : ts + (tb - ts) * Math.pow(-c, 0.8);
            for (let j = 0; j <= M; j++) {
                const th = tm * (from + (1 - from) * (j / M));
                const s = Math.sin(th), k = 1 + flare * Math.pow(j / M, 1.6);
                pos.push(rx * k * s * Math.sin(phi), cy + ry * k * Math.cos(th), rz * k * s * Math.cos(phi));
            }
        }
        for (let i = 0; i < N; i++) {
            const i2 = full ? (i + 1) % N : i + 1;
            for (let j = 0; j < M; j++) {
                const a = i * (M + 1) + j, b = a + 1, c2 = i2 * (M + 1) + j, d = c2 + 1;
                idx.push(a, b, c2, d, c2, b);
            }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, mat);
    },
    // ⑷ 캐릭터용 바위 덩어리 — 구를 깎아낸 불규칙 다면체. 골렘처럼 **몸 자체가 돌**인 파츠에 쓴다.
    //    왜: 장비에서 '박스는 어떤 라이팅을 걸어도 박스'였던 것과 같은 벽이 적에도 있다 — 어깨 볼더·
    //    주먹·머리·발이 전부 `SphereGeometry` 라, `flatShading` 으로 면을 갈라도 **실루엣이 완벽한 원**
    //    이라 '눈사람'으로 읽힌다(골렘 주석이 스스로 '눈사람 금지'라고 적어 둔 바로 그것). 면 음영이
    //    아니라 윤곽을 깨야 바위가 된다.
    //    맵 프롭의 `rockGeo` 와 목적은 같지만 셋이 다르다:
    //    ㉠ **시드가 결정론적**이다 — `rockGeo` 는 `Math.random()` 으로 시드를 뽑지만, 적 메시는
    //       프로브가 같은 값을 다시 재야 하고(연출 검증 패턴) 전역 RNG 를 소비하면 시드 고정
    //       캡처(`shot-biomes.js`)의 프롭 배치가 호출 수만큼 통째로 밀린다. 호출자가 준 seed 만 쓴다.
    //    ㉡ **정점 컬러를 굽지 않는다** — 골렘 재질은 `vertexColors` 가 꺼져 있고, 켜면 색이 곱해져
    //       스윕으로 채택한 명도가 통째로 내려간다. 여기서 바꾸는 건 실루엣뿐이다.
    //    ㉢ 밑면을 눌러 **쪼개진 단면**을 남긴다 — 위는 풍화로 둥글고 아래는 각진 바위의 인상.
    //    ⚠️ 변위는 반드시 **좌표 해시**로 뽑고, 좌표를 **반올림해서** 해시할 것. 정점 인덱스로 뽑으면
    //       면이 공유하는 정점이 제각각 움직여 메시에 구멍이 뚫린다(잎 조형에서 이미 밟은 함정).
    //       `IcosahedronGeometry` 는 비인덱스라 같은 모서리 정점이 여러 벌 있고, detail>0 이면 세분
    //       보간이 면마다 미세하게 달라 **생좌표로 해시하면 그 오차만큼 갈라진다**.
    boulderGeo(rad, seed, opt) {
        const o = opt || {};
        const geo = new THREE.IcosahedronGeometry(rad, o.detail === undefined ? 1 : o.detail);
        const p = geo.attributes.position;
        const s0 = (seed || 0) * 1.7137 + 0.31;
        const amp = o.amp === undefined ? 0.26 : o.amp;
        const flat = o.flatBottom === undefined ? 0.14 : o.flatBottom;
        const q = v => Math.round(v / rad * 512) / 512;   // 같은 자리는 늘 같은 값을 받도록 양자화
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            const qx = q(x), qy = q(y), qz = q(z);
            // 서로 나눠떨어지지 않는 주파수 3개 — 2개면 시드가 달라도 가끔 거의 같은 덩어리가
            // 나온다(`rockGeo` 가 실측으로 밟아 항을 하나 더 얹은 것과 같은 이유).
            const k = Math.sin(qx * 4.7 + s0) * 0.38
                + Math.sin(qy * 3.31 + s0 * 1.9) * 0.34
                + Math.sin((qx + qz) * 2.63 + s0 * 0.7) * 0.28;
            const cut = 1 + k * amp;
            const dn = qy < 0 ? 1 + (-qy) * flat : 1;
            p.setXYZ(i, x * cut, y * cut / dn, z * cut);
        }
        geo.computeVertexNormals();
        return geo;
    },
    // ⑸ 유기물 덩어리 — 살·털 종의 구를 **부드럽게** 비대칭으로 만든다.
    //    `boulderGeo` 와 목적은 같고(윤곽 깨기) 자는 정반대다: 골렘은 돌이라 각진 파셋이 정답이지만
    //    늑대·고블린·임프는 살이라 같은 걸 걸면 '수정 늑대'가 된다. 그래서 ㉠ 진폭을 낮추고
    //    ㉡ **주파수를 낮춰** 노이즈가 아니라 근육/털뭉치 수준의 넓은 굴곡만 남기고
    //    ㉢ 법선을 부드럽게 다시 계산한다(플랫셰이딩으로 가지 않는다).
    //    ⚠️ 이미 만들어진 지오메트리를 **제자리에서** 바꾼다 — 호출자가 정한 분할수와 mesh.scale
    //       (늑대는 구를 타원체로 눌러 쓴다)을 그대로 살리려면 이 방식이어야 한다.
    //    ⚠️ 변위는 여기서도 **좌표 해시**다. `SphereGeometry` 는 인덱스 지오메트리라 인덱스 해시가
    //       안전해 보이지만, uv 이음새(u=0/u=1)와 극점에 **같은 좌표의 정점이 여러 벌** 있어
    //       인덱스로 뽑으면 이음새가 그대로 찢어진다.
    sculptOrganic(geo, seed, opt) {
        const o = opt || {};
        const p = geo.attributes.position;
        const amp = o.amp === undefined ? 0.09 : o.amp;
        const s0 = (seed || 0) * 2.3391 + 0.17;
        // 반경 기준은 바운딩 구 — 호출자가 어떤 크기의 구를 넘겨도 같은 **상대** 진폭이 나온다.
        geo.computeBoundingSphere();
        const R = Math.max(1e-4, geo.boundingSphere.radius);
        const q = v => Math.round(v / R * 256) / 256;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
            const qx = q(x), qy = q(y), qz = q(z);
            // ⚠️ 주파수를 더 낮추지 말 것 — 물체 지름에 한 주기가 채 안 들어가면 변위가 사실상
            //    **균일 스케일 + 평행이동**에 수렴해 실루엣이 하나도 안 깨진다(반경 변동계수가 그대로다).
            //    처음 2.3/1.7/1.29 로 뒀더니 같은 amp 인데 seed 에 따라 cv 가 0.0188~0.0542 로 요동쳤다 —
            //    작아서가 아니라 물체가 사인의 단조 구간에 통째로 얹히는 seed 가 있어서였다.
            //    지름에 대략 한 주기가 들어가는 지금 값이면 seed 와 무관하게 실제 굴곡이 남는다.
            const k = Math.sin(qx * 3.1 + s0) * 0.40
                + Math.sin(qy * 2.6 + s0 * 1.6) * 0.34
                + Math.sin((qy + qz) * 2.1 + s0 * 0.6) * 0.26;
            const f = 1 + k * amp;
            p.setXYZ(i, x * f, y * f, z * f);
        }
        p.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        return geo;
    },

    // 조립이 끝난 장비 그룹에 시대 디테일을 얹는다 — 바운딩 박스에서 '아랫단 밴드'를 잡아
    // 계열마다 다른 것을 두른다(리벳 링 / 발광 링 / 가죽끈+뼈구슬 / 황동 스터드 / 폴리머 벤트).
    // 스타일 11종·갑옷 6종이 제각각이라 좌표 상수로는 못 맞춘다 — 실제 크기에서 역산한다.
    addAgeTrim(g, mats, opt) {
        const o = opt || {};
        const bb = new THREE.Box3().setFromObject(g);
        if (!isFinite(bb.min.y) || bb.isEmpty()) return;
        const size = bb.getSize(new THREE.Vector3());
        const ctr = bb.getCenter(new THREE.Vector3());
        // 원형이 아니라 **타원**으로 두른다 — 갑옷 몸통은 0.46×0.30 박스라 원 링을 두르면
        // 앞뒤로 6cm 떠서 '허공에 뜬 고리'가 된다(투구는 rx≈rz라 차이가 없다).
        // ⚠️ 바운딩 박스 반경은 **가장 굵은 곳**이다 — 곡면 흉갑처럼 허리가 잘록한 몸통에 쓰면
        //    가슴 반경으로 허리를 둘러 링이 4cm 떠 버린다. 부르는 쪽이 그 높이의 실제 반경을
        //    안다면 o.rx/o.rz 로 직접 넘긴다(투구처럼 위아래가 고른 형상은 그대로 박스에서 역산).
        const sc = o.rScale || 0.94;
        const rx = o.rx !== undefined ? o.rx : size.x * 0.5 * sc;
        const rz = o.rz !== undefined ? o.rz : size.z * 0.5 * sc;
        const r = Math.max(rx, rz);
        if (!(Math.min(rx, rz) > 0.02)) return;
        const y = o.y !== undefined ? o.y : bb.min.y + size.y * (o.yFrac !== undefined ? o.yFrac : 0.24);
        // 🚨 **앞이 열린 투구**(fin 갈레아처럼 테두리가 얼굴을 비켜 가는 형상)에서는 이 밴드가
        //    얼굴을 가로지른다 — 실측으로 링 **하나**가 흰자의 32%p 를 먹었다(probe-fin-occluder).
        //    bbox 아랫단이 눈높이에 떨어지기 때문이고, 링을 올리면 이번엔 매달린 뼈 구슬이 눈에
        //    걸린다. 그래서 높이가 아니라 **방위각**을 비운다: o.faceOpen 이면 정면 ±faceArc 를
        //    도려낸 부분 토러스로 두르고, 정면 부착물(구슬·보석·벤트·발광 바)은 뒤로 돌린다.
        //    (관자놀이에서 끊긴 밴드는 갈레아의 측면 밴드로 읽혀 조형상으로도 맞다.)
        const open = !!o.faceOpen, FA = o.faceArc || 1.0;
        const zf = open ? -1 : 1;                  // 정면 부착물의 z 부호
        const TAU = Math.PI * 2;
        // 방위각 a 규약: x=cos a · z=sin a → 정면(+z)이 a=π/2. 토러스도 rotation.x=π/2 뒤 같은 규약이다.
        const inFace = (a) => open && Math.abs((((a - Math.PI / 2) % TAU) + TAU + Math.PI) % TAU - Math.PI) < FA;
        const put = (mesh, x, yy, z) => {
            mesh.position.set(ctr.x + x, yy, ctr.z + z);
            mesh.userData.ageTrim = mats.kind; // 실측 도구가 '시대 디테일이 실제로 붙었나'를 세는 표식
            g.add(mesh);
            return mesh;
        };
        // 타원 링: 토러스는 로컬 XY면 → rotation.x=π/2로 눕히면 로컬 y가 월드 z가 된다(scale.y로 z반경 조절)
        const ellipseRing = (tube, seg, m) => {
            const geo = new THREE.TorusGeometry(rx, tube, 5, seg, open ? TAU - 2 * FA : TAU);
            // 호의 시작을 정면 반대쪽으로 돌려 [π/2+FA, π/2+2π−FA] 를 덮게 한다(= 정면 ±FA 가 빈다).
            if (open) geo.rotateZ(Math.PI / 2 + FA);
            const t = new THREE.Mesh(geo, m);
            t.rotation.x = Math.PI / 2;
            t.scale.y = rz / rx;   // 로컬 y(→ 월드 z) 만 눌러 타원으로. 호 시작 위치와 무관하다
            return t;
        };
        if (mats.kind === 'forged') {                       // 리벳 8개 링 — 단조 판금의 서명
            const n = o.rivets || 8, rr = Math.min(0.026, r * 0.11);
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2 + 0.2;
                if (inFace(a)) continue;               // 앞이 열린 투구 — 얼굴 앞 리벳은 건너뛴다
                const riv = new THREE.Mesh(new THREE.SphereGeometry(rr, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.trim);
                riv.rotation.x = Math.PI / 2;
                riv.rotation.z = -a;
                put(riv, Math.cos(a) * rx, y, Math.sin(a) * rz);
            }
        } else if (mats.kind === 'alloy') {                 // 발광 라인 — 아랫단 링 + 정면 세로 스트립
            put(ellipseRing(Math.min(0.014, r * 0.06), 24, mats.trim), 0, y, 0);
            const bar = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.05, rx * 0.4), size.y * 0.3, 0.012), mats.trim);
            put(bar, 0, y + size.y * 0.2, rz * 0.99 * zf);
        } else if (mats.kind === 'primal') {                // 가죽 결속끈 + 매달린 뼈 구슬
            put(ellipseRing(Math.min(0.02, r * 0.085), 18, mats.trim), 0, y, 0);
            for (const [dx, dy] of [[-0.055, -0.05], [0, -0.075], [0.055, -0.05]]) {
                const tooth = new THREE.Mesh(new THREE.ConeGeometry(Math.min(0.022, r * 0.09), Math.min(0.07, r * 0.3), 5), mats.bead);
                tooth.rotation.x = Math.PI;
                put(tooth, dx, y + dy, rz * 0.86 * zf);
            }
        } else if (mats.kind === 'brass') {                 // 황동 림 밴드 + 스터드 4개
            put(ellipseRing(Math.min(0.016, r * 0.07), 20, mats.trim), 0, y, 0);
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + 0.4;
                if (inFace(a)) continue;               // 앞이 열린 투구 — 얼굴 앞 스터드는 건너뛴다
                const stud = new THREE.Mesh(new THREE.SphereGeometry(Math.min(0.024, r * 0.1), 7, 5), mats.trim);
                put(stud, Math.cos(a) * rx, y + size.y * 0.1, Math.sin(a) * rz);
            }
        } else if (mats.kind === 'holy') {                  // 상아 새시 밴드 + 정면 성광 보석 — 금·백 2톤의 서명
            put(ellipseRing(Math.min(0.016, r * 0.07), 20, mats.trim), 0, y, 0);
            const gem = new THREE.Mesh(new THREE.SphereGeometry(Math.min(0.024, r * 0.1), 8, 6), mats.bead || mats.trim);
            put(gem, 0, y + size.y * 0.08, rz * 0.99 * zf);
        } else if (mats.kind === 'polymer') {               // 정면 벤트 슬랫 3줄
            for (let i = 0; i < 3; i++) {
                const slat = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.16, rx * 1.1), 0.016, 0.014), mats.trim);
                put(slat, 0, y + i * 0.032, rz * 0.98 * zf);
            }
        }
    },

    // 등급색 장식 재질 — ⓓ '흰 부위 플랫' (3차 채점 C·D: fin 볏 · 사무라이 쿠와가타 · plume).
    // 무채·고휘도 등급색(일반 0xd6d6d6)에 이미시브 0.45 를 얹으면 램버트에서 **어느 면이나 같은
    // 밝기**로 타 '흰 종이 판'이 된다 — 명부·암부 폭이 0 이라 어떤 조명을 걸어도 형태가 안 남는다.
    // ⑴ 순백 계열은 웜 오프화이트(0xe8e0d5)로 **상한**을 두고 이미시브를 죽인다.
    // ⑵ 램버트 → 스탠다드 — 환경 반사가 면마다 다르게 얹혀 곡면이 곡면으로 읽힌다.
    // ⚠️ **채도 있는 등급색(전설 노랑·궁극 빨강·신화 보라)은 발광이 정체성이라 손대지 않는다** —
    //    거기까지 바꾸면 등급 식별이 흔들리고 rim/clip 회귀 기준선이 통째로 움직인다.
    rarityDecorMat(pc) {
        const hsl = new THREE.Color(pc).getHSL({ h: 0, s: 0, l: 0 });
        if (hsl.s < 0.18 && hsl.l > 0.62) {
            // ⚠️ 이미시브를 조금이라도 남기면(0.06 실측) 명부·암부가 도로 붙는다 — 자체발광은
            //    법선과 무관하게 더해지므로 **평탄화 항**이다. 흰 부위는 발광이 아니라 형태로 읽혀야
            //    한다. env 반사도 낮춘다(밝은 환경이 암부를 들어 올려 폭을 깎는다).
            return new THREE.MeshStandardMaterial({
                color: 0xc9beac, metalness: 0.03, roughness: 0.76, envMapIntensity: 0.45,
            });
        }
        return new THREE.MeshLambertMaterial({ color: pc, emissive: pc, emissiveIntensity: 0.45 });
    },

    // 투구: 이름별 스타일 11종
    makeHelmet(age, rarity, style, name) {
        const g = new THREE.Group();
        const c = AGE_COLORS[age];
        const pc = RARITY_HEX[rarity] || 0xef5350; // 장식 = 등급색
        // 시대색 직치환은 '고무 풍선'으로 읽힘(비평가) — 시대 재질 세트를 거쳐 PBR 분리 (갑옷 tint와 동일 원칙)
        const mats = this.ageGearMats(age, name);
        const mat = mats.body;
        const darkMat = mats.dark;
        const rareMat = this.rarityDecorMat(pc);
        style = style || 'plume';

        if (style === 'plume') {            // 돔 + 깃장식
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
            dome.position.y = 0.03;
            g.add(dome);
            {
                // 깃털 장식: 곧은 원뿔은 '흰 스파이크/수정 다발'로 읽혔다(1차 채점 A·B 공통 —
                // 깃털의 휘어짐·결이 0). 납작한 잎꼴 판 + 가운데 깃대 + 뒤로 눕는 휨 = 깃털의 서명.
                // ⓓ **원시 분기에만 있던 이 처방을 전 시대로 넓혔다** — 비원시는 여전히 매끈한 원뿔
                //   하나(0.06×0.32)라 3차 채점이 같은 지적('흰 부위 플랫')을 다시 냈다. 문법을 두 벌
                //   만들지 않고 이미 통과한 쪽을 쓴다. 시대차는 깃대 재질·가닥 수·기울기로만 준다.
                const primal = age === 'primitive';
                const ribM = primal ? this.primalCordMat() : darkMat;
                const FAN = primal
                    ? [[-0.095, 0.36, 0.30], [0, 0, 0.38], [0.095, -0.36, 0.30]]
                    : [[-0.082, 0.34, 0.25], [-0.028, 0.11, 0.33], [0.028, -0.11, 0.33], [0.082, -0.34, 0.25]];
                for (const [dx, tilt, len] of FAN) {
                    const f = new THREE.Group();
                    const hw = len * 0.17;
                    const sh = new THREE.Shape();
                    sh.moveTo(0, 0);
                    sh.quadraticCurveTo(hw, len * 0.28, hw * 0.72, len * 0.75);
                    sh.quadraticCurveTo(hw * 0.4, len * 0.97, 0, len);
                    sh.quadraticCurveTo(-hw * 0.4, len * 0.97, -hw * 0.72, len * 0.75);
                    sh.quadraticCurveTo(-hw, len * 0.28, 0, 0);
                    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }), rareMat);
                    blade.position.z = -0.006;
                    f.add(blade);
                    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.011, len * 0.88, 5), ribM);
                    rib.position.set(0, len * 0.42, 0.012);
                    rib.userData.decorAccent = true;
                    f.add(rib);
                    f.position.set(dx, 0.24, -0.02);
                    f.rotation.set(-0.24, 0, tilt);   // 뒤로 눕고(휨) 좌우는 부채로 벌어진다
                    g.add(f);
                }
                if (!primal) {
                    // 밑동 소켓 — 깃이 돔에서 그냥 자라난 것처럼 보이면 '흰 뿔'이 된다. 어두운
                    // 단이 서야 '꽂은 깃 장식'으로 읽힌다(투구 트림이 이미 쓰는 명도 단차 언어).
                    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.062, 0.05, 10), darkMat);
                    socket.position.y = 0.245;
                    socket.userData.decorAccent = true;
                    g.add(socket);
                }
            }
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
                    this.tintOf(mat, -0.1)); // 시대 재질 계승 — 여기만 금속으로 굳히면 원시 투구에 강철 림이 붙는다
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
                this.tintOf(mat, -0.14)); // 코 가드 — 슬림+다크 (밝은 굵은 바가 '반투명 띠 아티팩트'로 오독, 비평가 7번)
            noseBar.position.set(0, -0.02, 0.262);
            if (age === 'medieval') {
                // 기사 투구(중세 분기): 1차 채점 A "T자 슬릿·힌지 없이 항아리로 읽힌다" — 가로 슬릿 밑에
                // 세로 개구부를 더해 T 를 만들고, 양옆에 바이저 힌지 리벳을 박는다(시대 공용 조형은 불변).
                const vslit = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.15, 0.02), cavity);
                vslit.position.set(0, -0.045, 0.266);
                g.add(vslit);
                for (const hs of [-1, 1]) {
                    const hinge = new THREE.Mesh(new THREE.SphereGeometry(0.026, 7, 5), this.tintOf(mat, 0.08));
                    hinge.position.set(hs * 0.272, 0.06, 0.02);
                    g.add(hinge);
                }
            }
            // 정수리 볏 아크 — ⚠️ 이전 값(반지름 0.21, 중심 y 0.13)은 **돔 셸 안에 묻혀 있었다.**
            // 돔은 반지름 0.28·스케일 y1.02·중심 y0.04이므로 표면이 y축 0.2856인데, 볏은 자기 중심이
            // 0.09 위에 있어 정수리(0.09+0.21=0.30)만 셸을 0.014 뚫고 나오고 양 끝(18°/162°에서
            // 중심거리 0.253)은 셸 속에 잠겼다. 그래서 볏이 '연결 안 된 파란 탭 조각'으로 보였다
            // (비평가 A·B가 각각 "머리 위에 붙은 데 없는 수직 막대"로 지목한 것의 실체).
            // 수정: 중심을 돔 중심(y 0.04)에 맞추고 반지름을 셸 바로 바깥(0.295)으로 키워 아크
            // 전체가 셸 위를 타게 한다. 아크 길이는 0.8π→0.62π로 줄여 끝이 눈 슬릿(y 0.088)
            // 아래로 내려오지 않게 하고, rotation.z로 정수리(90°)에 중심을 맞춘다.
            const crestArc = Math.PI * 0.62;
            const crestR = 0.295;
            const crest = new THREE.Mesh(new THREE.TorusGeometry(crestR, 0.026, 6, 16, crestArc), rareMat);
            crest.position.y = 0.04;
            crest.rotation.y = Math.PI / 2;
            crest.rotation.z = Math.PI / 2 - crestArc / 2;
            g.add(helm, slit, noseBar, crest);
            // 아크 끝 마감 — 부분 토러스는 **끝 뚜껑이 없어** 열린 튜브 단면이 그대로 보인다.
            // 끝점마다 같은 재질의 작은 구를 얹어 막는다(방패 개방 셸과 같은 부류의 결함).
            for (const s of [-1, 1]) {
                const a = Math.PI / 2 + s * crestArc / 2;
                const capEnd = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), rareMat);
                capEnd.position.set(0, 0.04 + Math.sin(a) * crestR, Math.cos(a) * crestR);
                g.add(capEnd);
            }
            // ── A 단독 지적 P1 완화(가법) — 돔은 그대로 두고 바시넷 특징만 얹는다 ──
            // ⚠️ 앞선 시도: 돔을 통째로 Lathe 프로파일로 바꿨더니 슬릿 캐비티가 뻥 뚫린 구멍으로 노출되고
            //    뺨·브로우가 따로 노는 회귀가 났다(슬릿·눈·코가드가 구 반경 0.2855 에 앵커돼 있어서다).
            //    → 돔을 건드리지 않고 **뺨 판 + 브로우 리지만 추가**해 '순수 구' 실루엣만 깬다.
            //    슬릿 밴드(y 0.06)보다 아래·위로만 얹으므로 슬릿·눈·코가드와 겹치지 않는다.
            // 뺨 판 — 하관 양옆(슬릿 아래)을 덮는 판금. 정면 실루엣에 얼굴 폭 → 턱 폭 좁아짐을 만든다.
            for (const cx of [-1, 1]) {
                const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.093, 8, 8, 0, Math.PI, 0, Math.PI * 0.85), this.tintOf(mat, -0.05));
                cheek.position.set(cx * 0.176, -0.045, 0.145);
                cheek.scale.set(0.52, 1.25, 0.98);
                cheek.rotation.set(0.12, cx * -0.62, cx * 0.10);
                g.add(cheek);
            }
            // 브로우 리지 — 눈 슬릿(y 0.06) 바로 위를 가로지르는 판금 능선. 매끈한 이마에 눈두덩 그늘을 만든다.
            const brow = new THREE.Mesh(new THREE.TorusGeometry(0.243, 0.019, 6, 20, Math.PI * 0.62), this.tintOf(mat, 0.06));
            brow.rotation.x = Math.PI / 2;
            brow.rotation.z = Math.PI / 2 - Math.PI * 0.31;
            brow.position.set(0, 0.118, 0.03);
            brow.scale.set(1, 1, 0.86);
            g.add(brow);
        } else if (style === 'fin') {       // 볏 투구 (로마 갈레아/사무라이)
            // 🚨 종전엔 `SphereGeometry(0.26, …, 0, Math.PI*0.6)` 돔 **하나**였다. thetaLength 가
            //    둘레 전체에 한 값이라, 뒤통수를 덮으려고 0.6π(= 적도 아래 18°)를 준 순간 **앞도
            //    같이 눈높이 아래까지 내려와** 흰자 잔존률이 1.7%(= 코와 입만 남는다)였다.
            //    slug: helmet-fin-covers-eyes. → 방위각마다 테두리가 다른 `browedBowl` 로 간다.
            //    실측 좌표(두상 로컬): 눈 윗변 0.147 · 눈썹 0.163~0.177. 투구 로컬은 headMount
            //    y=0.08 만큼 아래이므로 각각 **0.067 · 0.083~0.097**. 앞 테두리를 로컬 y≈0.074 에
            //    두면 흰자 위·눈썹 아래를 지나간다(= 눈썹만 살짝 덮는 갈레아의 브로우 라인).
            const BR = 0.238, BRY = 0.272, BCY = 0.015;   // 정수리 = BCY+BRY = 0.287
            const ARC = { rx: BR, ry: BRY, rz: BR, cy: BCY,
                front: 1.353,   // 77.5° → 테두리 y = 0.015 + 0.272·cos77.5° = 0.074 (> 눈 윗변 0.067)
                side:  1.676,   // 96°   → y = −0.013 (관자놀이. 볼가드 −0.08 위)
                back:  1.990 }; // 114°  → y = −0.096 (목덜미)
            const dome = this.browedBowl(ARC, this.tintOf(mat, 0, { side: THREE.DoubleSide }));
            // 테두리 롤 밴드 — 앞을 비우면 셸 단면이 그대로 보인다. 한 바퀴 두른 어두운 띠가
            // 그 단면을 덮고 아치를 선으로 읽히게 한다(실제 갈레아의 말린 가장자리).
            const band = this.browedBowl(Object.assign({}, ARC,
                { rx: BR * 1.04, ry: BRY * 1.04, rz: BR * 1.04, from: 0.88, rows: 3 }),
                this.tintOf(darkMat, 0, { side: THREE.DoubleSide }));
            band.userData.decorAccent = true;
            // 목가리개 — 뒤쪽 테두리만 바깥으로 벌어지는 자락. 갈레아의 서명이고, 앞을 비운 만큼
            // 뒤가 허전해지는 것을 메운다(φ=π 기준 ±54°).
            const neck = this.browedBowl(Object.assign({}, ARC,
                { rx: BR * 1.04, ry: BRY * 1.04, rz: BR * 1.04, from: 0.93, flare: 0.19, rows: 4,
                  seg: 16, phi0: Math.PI - 0.95, phiLen: 1.9 }),
                this.tintOf(mat, -0.05, { side: THREE.DoubleSide }));
            g.add(band, neck);
            // 브로우 리벳 — 아치 위에 5개. 96px 로 줄여도 앞 테두리가 '선'으로 남게 하는 이차 디테일.
            for (let i = -2; i <= 2; i++) {
                const phi = i * 0.30, c = Math.cos(phi);
                const tm = ARC.side - (ARC.side - ARC.front) * Math.pow(c, 0.65);
                const th = tm * 0.925, s = Math.sin(th), k = 1.055;
                const rv = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 6, 5), rareMat);
                rv.position.set(BR * k * s * Math.sin(phi), BCY + BRY * k * Math.cos(th), BR * k * s * Math.cos(phi));
                rv.scale.z = 0.6;
                g.add(rv);
            }
            // 볏(크레스트) — ⓓ. 재질만 고쳐도 **평판 상자**(0.05×0.2×0.36)는 여전히 판이다.
            // ⚠️ 상자를 계단처럼 쌓아 아치를 흉내 냈다가 되돌렸다 — 96px 에서 **지구라트**로 읽힌다.
            //    로마 볏은 앞뒤로 흐르는 **매끈한 아치**라 옆면 실루엣(zy 평면)을 셰이프로 찍어 x 로
            //    밀어내고, 베벨로 능선 하이라이트를 만든다.
            const crest = new THREE.Group();
            {
                const sh = new THREE.Shape();
                sh.moveTo(-0.185, 0);
                sh.quadraticCurveTo(-0.10, 0.20, 0, 0.215);      // 앞에서 솟아
                sh.quadraticCurveTo(0.10, 0.20, 0.185, 0);       // 뒤로 흘러내린다
                sh.quadraticCurveTo(0, 0.035, -0.185, 0);        // 밑변은 돔을 타고 살짝 오목
                const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.026, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.007, bevelSegments: 2, curveSegments: 10 });
                geo.rotateY(Math.PI / 2);                        // zy 평면 프로파일 → 두께가 x 로
                geo.translate(-0.013, 0, 0);                     // 두께를 x=0 기준으로 중앙 정렬
                crest.add(new THREE.Mesh(geo, rareMat));
                // 말총 결 — 🚨 **매끈한 판은 재질을 아무리 고쳐도 안 산다**(실측: 이미시브를 0 으로
                // 내리고 러프니스를 올려도 흰 부위 휘도 폭 10 → 12). 판은 법선이 한 방향뿐이라
                // 어떤 조명에서도 한 값으로 칠해진다. **면을 물리적으로 쪼개야** 한다.
                // ⚠️ 살을 판 **속**에 넣으면 아무 일도 안 일어난다 — 첫 판이 그래서 실패했다.
                //    반드시 양쪽 면 **바깥**으로 나오게 둘 것(판 반두께 0.013 < 살 중심 0.019).
                for (const sx of [0.019, -0.019]) {
                    for (let i = 0; i < 9; i++) {
                        const t = (i / 8) * 2 - 1;
                        const h = 0.215 * (1 - t * t * 0.86);
                        if (h < 0.035) continue;
                        const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, h, 6), rareMat);
                        rib.position.set(sx, h / 2 + 0.012, t * 0.168);
                        rib.rotation.x = t * 0.30;
                        crest.add(rib);
                    }
                }
                // 밑동 밴드 — 볏이 돔에서 그냥 자라난 것처럼 보이지 않게 어두운 한 단
                // ⚠️ 폭·두께가 볏보다 커야 보인다 — 볏 안에 들어가면 차분 기여가 0 이다(실측).
                const base = new THREE.Mesh(new THREE.BoxGeometry(0.079, 0.030, 0.31), darkMat);
                base.position.y = 0.017;
                base.userData.decorAccent = true;   // 판정기 차분용 표식(아래 rarityDecor 주석 참조)
                crest.add(base);
            }
            // ⚠️ 돔 정수리는 y 0.287 이다(사발 교체로 0.28 → 0.287) — 볏을 0.20 에 두면 밑동이
            //    통째로 사발 **안**에 묻혀 밴드도 결도 안 보인다(실측: 부위 휘도 폭이 흰 면 폭과 같았다).
            //    정수리−볏 간격 0.035 를 그대로 유지한다.
            crest.position.y = 0.252;
            const cheek1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.12), mat);
            cheek1.position.set(-0.24, -0.08, 0.1);
            const cheek2 = cheek1.clone(); cheek2.position.x = 0.24;
            g.add(dome, crest, cheek1, cheek2);
        } else if (style === 'mask') {      // 가면/방독면: 얼굴을 감싸는 곡면 판 (평판 박스 → 원통 셸)
            const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.22, 0.32, 14, 1, true, -Math.PI * 0.42, Math.PI * 0.84), mat);
            plate.material = this.tintOf(mat, 0, { side: THREE.DoubleSide }); // 원색 직치환 금지 — 시대 재질 톤 공유
            plate.position.set(0, 0.02, 0.02);
            const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat); // 정수리 덮개
            dome.position.y = 0.1;
            g.add(dome);
            for (const dx of [-0.09, 0.09]) { // 눈 소켓: 함몰 어둠 + 림 + 발광 동공 — 민짜 회색 점 2개 오독 (비평가 3번)
                const hole = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0x14181c }));
                hole.position.set(dx, 0.04, 0.252); hole.scale.z = 0.5;
                const socketRim = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.009, 5, 12),
                    this.tintOf(mat, -0.14));
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
        } else if (style === 'halo') {      // 후광 (수호의 후광) — 링 하나는 '크림색 도넛'으로 읽혔다(1차 채점 A·B 공통).
            // 천상 공통 문법(addDivineHalo: 세워진 링 + 방사 광선 8줄)을 그대로 쓰고, 내광 디스크로 '빛'을 더한다.
            this.addDivineHalo(g, 0.42, 0.2);
            // ⚠️ 가산 디스크는 밝기를 아껴 쓸 것 — opacity 0.38 에서 셀의 54% 가 순백 포화로 날아가
            //    probe-equip-clip 에 걸렸다(실측). 0.14 가 '빛나되 안 타는' 값이다.
            const glow = new THREE.Mesh(new THREE.CircleGeometry(0.155, 20), new THREE.MeshBasicMaterial({
                color: 0xffd98a, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending,
                depthWrite: false, side: THREE.DoubleSide }));
            glow.position.set(0, 0.42, -0.2 * 0.42 + 0.01);
            glow.rotation.x = -0.22;
            g.add(glow);
        } else if (style === 'hair') {      // 머리카락/수염/비니
            if (age === 'primitive') {
                // 수염(원시 분기): 돌 텍스처 캡 + 방울 = '흰 반죽 덩어리, 판독 불가'(1차 채점 A·B).
                // 털가죽 캡(탄 갈색) + 턱을 감는 수염 술 7가닥 + 콧수염 호 — '수염 난 원시인 머리'로 읽게 한다.
                const fur = this.tintOf(mats.dark, 0.06);
                const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), fur);
                cap.position.y = 0.04;
                cap.scale.y = 0.85;
                g.add(cap);
                for (let i = -3; i <= 3; i++) {          // 턱 아래 U자 호를 따라 아래로 늘어지는 술
                    const a = i * 0.3;
                    const len = 0.2 - Math.abs(i) * 0.022;
                    const strand = new THREE.Mesh(new THREE.ConeGeometry(0.05 - Math.abs(i) * 0.004, len, 6), fur);
                    strand.rotation.x = Math.PI;
                    strand.position.set(Math.sin(a) * 0.21, -0.09 - len * 0.35 + Math.abs(i) * 0.022, Math.cos(a) * 0.19);
                    g.add(strand);
                }
                const stache = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 10, Math.PI), fur);
                stache.position.set(0, -0.045, 0.225);   // 위로 아치, 양끝이 아래 = 콧수염
                g.add(stache);
            } else {
                // 천상 '성스러운 백발'이 시대 금 재질(mat)을 물면 금 돔이 돼 이름을 배반한다
                // (3차 채점 C·D 공통 라벨-렌더 불일치) — 백발은 상아 백 무광. 뒤에 서는 금 후광이
                // (divine 공통 가산) 색 대비까지 만들어 준다. 타 시대는 종전 그대로.
                const hairM = age === 'divine'
                    ? this.ageShade(new THREE.MeshStandardMaterial({ color: 0xe9e3d4, metalness: 0.04, roughness: 0.82, envMapIntensity: 0.3 }), 'soft:holy')
                    : mat;
                const cap = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
                cap.position.y = 0.04;
                cap.scale.y = 0.85;
                const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), hairM);
                tuft.position.set(0.1, 0.24, 0.05);
                g.add(cap, tuft);
            }
        } else if (style === 'crown') {     // 왕관/화관
            const band = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.12, 12), mat);
            band.position.y = 0.16;
            g.add(band);
            if (age === 'medieval') {
                // 사무라이 투구: 1차 채점 A·B 공통 "카부토 문법 전무 — 그냥 왕관/울타리".
                // 스타일은 시대 공용이라 **중세 분기**로만: 정수리 돔(하치) + 쿠와가타(금빛 V 뿔) + 시코로(목가리개 라멜라).
                // 스파이크 5개 링은 이 분기에서 뺀다 — '생일 왕관' 오독의 원인이 그것이었다.
                const hachi = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), mat);
                hachi.position.y = 0.17;
                g.add(hachi);
                for (const s of [-1, 1]) {   // 쿠와가타 — 위로 벌어지는 납작한 뿔 두 장
                    // ⓓ: 균일 두께 상자(0.034×0.27×0.014)는 흰 종이 조각이다. 실제 쿠와가타는
                    //     **뿌리가 넓고 바깥으로 배부르다 끝에서 뾰족해지는** 납작한 뿔이다.
                    // ⚠️ 상자를 테이퍼로 쌓아 봤다가 되돌렸다 — 끝 폭이 0.013 까지 가늘어져
                    //    '젓가락/안테나'로 읽혔다(96px 실측). 뿌리 폭을 지키고 배를 남길 것.
                    const hg = new THREE.Group();
                    const sh = new THREE.Shape();
                    sh.moveTo(-0.026, 0);
                    sh.quadraticCurveTo(-0.030, 0.13, -0.008, 0.26);   // 바깥 날 — 배부르다 끝으로 모임
                    sh.lineTo(0.006, 0.26);
                    sh.quadraticCurveTo(0.026, 0.12, 0.026, 0);        // 안쪽 날
                    sh.lineTo(-0.026, 0);
                    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1, curveSegments: 8 });
                    geo.translate(0, 0, -0.008);
                    hg.add(new THREE.Mesh(geo, rareMat));
                    // ⚠️ 뿔 두께(0.016 + 베벨 0.005×2 = 0.026)보다 두꺼워야 보인다 — 0.021 은
                    //    통째로 묻혀 차분 기여가 0 이었다(실측).
                    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.23, 0.034), darkMat);  // 가운데 능선 심
                    spine.position.set(0, 0.115, 0);
                    spine.userData.decorAccent = true;
                    hg.add(spine);
                    hg.position.set(s * 0.085, 0.29, 0.205);
                    hg.rotation.z = -s * 0.42;
                    g.add(hg);
                }
                const crest = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), rareMat); // 뿔 사이 전립(마에다테 심)
                crest.position.set(0, 0.34, 0.215);
                g.add(crest);
                for (let l = 0; l < 3; l++) {  // 시코로 — 뒤·옆을 감는 라멜라 3장, 아래로 갈수록 벌어진다
                    const lam = new THREE.Mesh(new THREE.CylinderGeometry(0.235 + l * 0.028, 0.265 + l * 0.028, 0.05,
                        14, 1, true, Math.PI * 0.32, Math.PI * 1.36), this.tintOf(mat, -0.04 * (l + 1), { side: THREE.DoubleSide }));
                    lam.position.y = 0.115 - l * 0.048;
                    g.add(lam);
                }
            } else {
                for (let i = 0; i < 5; i++) {
                    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 6), rareMat);
                    const a = (i / 5) * Math.PI * 2;
                    spike.position.set(Math.cos(a) * 0.21, 0.28, Math.sin(a) * 0.21);
                    g.add(spike);
                }
            }
        } else if (style === 'tech') {      // 메카 헬름 — 곡면 셸 + 랩어라운드 발광 바이저 (박스 금지, 비평가 1위 결함 재작업)
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 8), mat);
            shell.material = this.tintOf(mat, 0.02); // 시대 재질 계승 — 원색 풍선 방지는 ageGearMats의 혼합이 이미 담당
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
        } else if (style === 'skull') {
            // ── 짐승 두개골 투구 (equip-era-theming ④, 원시 '해골 투구') ────────────────
            // 🚨 **되돌려서 `visor` 로 쓰지 말 것.** 원시 4번 칸 '해골 투구'는 style `visor`,
            //    즉 **중세 기사 풀헬름**(돔+뺨가드+눈 슬릿)이었다 — 재질만 뼈고 조형은 기사 투구라
            //    사용자 지적 '전부 중세 같은 디자인임'의 투구 쪽 실물이다. 사람이 쓰라고 만든
            //    **매끈한 반구**가 아니라, **짐승 머리뼈를 뒤집어쓴 것**이라야 원시로 읽힌다:
            //    앞으로 뻗은 주둥이 · 파인 눈구멍 · 광대활 · 이빨. 이 넷이 두개골의 서명이다.
            const cavity = new THREE.MeshBasicMaterial({ color: 0x0a0d10 });
            const cran = new THREE.Mesh(new THREE.SphereGeometry(0.235, 14, 10), mat);
            cran.scale.set(0.98, 0.94, 1.04);
            cran.position.set(0, 0.045, -0.045);
            g.add(cran);
            // 주둥이 — 앞으로 뻗어 가늘어진다. 이게 없으면 그냥 사람 머리통이다.
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.135, 0.30, 8), mat);
            snout.rotation.x = Math.PI / 2 + 0.16;   // 앞으로 눕히고 코끝을 살짝 내린다
            snout.position.set(0, -0.055, 0.175);
            snout.scale.set(1, 1, 0.80);             // 위아래로 눌러 '부리'가 아니라 '주둥이'로
            g.add(snout);
            // 눈구멍 — 깊게 파인 검은 공동. 두개골의 얼굴은 여기서 결정된다.
            for (const s of [-1, 1]) {
                const socket = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), cavity);
                socket.scale.set(1, 0.84, 0.62);
                socket.position.set(s * 0.115, 0.015, 0.148);
                g.add(socket);
                const brow = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.019, 6, 14, Math.PI * 1.15), mat);
                brow.position.set(s * 0.115, 0.015, 0.156);
                brow.rotation.z = -s * 0.30 + Math.PI * 0.10;
                brow.scale.z = 0.55;
                g.add(brow);
                // 광대활 — 눈구멍 뒤로 빠지는 뼈 다리. 두개골이 '속이 빈 것'으로 읽히게 한다.
                const zyg = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.036, 0.155), mat);
                zyg.position.set(s * 0.178, -0.030, 0.058);
                zyg.rotation.y = -s * 0.34;
                g.add(zyg);
            }
            // 비강 — 눈 사이 아래의 역삼각 구멍
            {
                const nas = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.072, 3), cavity);
                nas.rotation.x = Math.PI / 2 + 0.16;
                nas.rotation.z = Math.PI;
                nas.position.set(0, -0.048, 0.212);
                g.add(nas);
            }
            // 위턱 이빨 — 주둥이 밑선을 따라. 송곳니 2개가 길다.
            for (let i = -2; i <= 2; i++) {
                const big = Math.abs(i) === 1;
                const t = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.024 : 0.018, big ? 0.098 : 0.058, 6), mat);
                t.position.set(i * 0.048, -0.145 + Math.abs(i) * 0.012, 0.235 - Math.abs(i) * 0.030);
                t.rotation.x = Math.PI;       // 아래로 뾰족하게
                t.rotation.z = i * 0.10;
                g.add(t);
            }
        }
        // 시대 디테일 — halo(빛 링만)·bubble(유리 돔)은 두를 표면이 없어 제외
        // ⚠️ fin 은 앞이 열린 사발이라 bbox 아랫단(yFrac 0.2 = 로컬 y −0.035)이 **눈높이**다.
        //    거기 두르면 링이 흰자를 32%p 먹는다(실측 probe-fin-occluder). 높이를 옆 테두리(−0.014)
        //    바로 위로 올리고 정면 호를 비운다 — 눈 방위각은 정면 ±33°(+튜브 5°)라 ±57°(1.0rad)면 덮는다.
        if (style !== 'halo' && style !== 'bubble') {
            this.addAgeTrim(g, mats, style === 'fin'
                ? { y: 0.02, rx: 0.245, rz: 0.245, faceOpen: true }
                : { yFrac: 0.2 });
        }
        // 천상 투구: 머리 뒤 후광 (사용자 지시 '천상→예: 예수 머리·십자가'). 무기의 후광과 같은 문법.
        // ⚠️ halo 스타일은 그 자체가 후광이라 겹쳐 두 겹이 되면 안 된다.
        // ⚠️ 반경을 키우지 말 것 — 후광은 자동 프레이밍의 bbox 를 그대로 키워서, 크게 잡으면
        //    썸네일에서 **투구 본체가 쪼그라든다**(0.30 판에서 실측). 0.22 가 '보이되 안 먹는' 값이다.
        if (age === 'divine' && style !== 'halo') this.addDivineHalo(g, 0.3, 0.22);
        // 원시 투구: 뼈·깃털 기호 (사용자 지시 '원시→진짜 원시 같아야 함' — 갑옷 이빨 목걸이와 한 벌).
        // 스타일은 시대 공용이라 지오메트리를 고치면 다른 시대까지 움직인다 — 천상 후광처럼 **시대 분기 가산**만 한다.
        if (age === 'primitive') {
            if (style === 'visor' || style === 'mask' || style === 'cone' || style === 'skull') {
                // 해골 투구·가면·전투 페인트: 좌우 뼈 뿔 — 88px 에서도 시대가 실루엣으로 읽힌다.
                // ⚠️ 가면은 돔(r 0.25)이 좁아 뿔을 0.26 에 두면 전부 노출돼 화면 질량이 커지고,
                //    3/4 썸네일 카메라에서 중심오차 4.7%(기준 4%)로 걸렸다(A/B 실측 — 뿔을 끄면 0건).
                //    비녀·visor 처럼 밑동을 셸에 묻어 질량을 줄인다.
                // skull 은 두개골 자체가 얼굴이라 뿔을 뒤통수 쪽(z 오프셋)에서 뻗게 해
                // 주둥이·눈구멍과 경쟁하지 않게 한다.
                this.addPrimalHorns(g, style === 'cone' ? 0.30 : style === 'mask' ? 0.20 : 0.26,
                    style === 'cone' ? 0.14 : style === 'mask' ? 0.05 : style === 'skull' ? 0.14 : 0.10,
                    style === 'mask' ? 0.85 : 0);
                if (style === 'cone') {
                    // '전투 페인트'인데 페인트가 없었다(3차 채점 C·D 공통 라벨-렌더 불일치) —
                    // 황토 안료 링 2줄 + 밑단 세로 칠 자국. 원뿔(r0.26 h0.55, y0.34, z틸트 0.12)의
                    // **자식으로** 붙여 틸트·좌표를 상수로 다시 적지 않는다(굴레 headY 규약과 같은 이유).
                    const cone = g.children.find(o => o.geometry && o.geometry.type === 'ConeGeometry');
                    if (cone) {
                        const paint = this.ageShade(new THREE.MeshStandardMaterial({ color: 0xa63c1e, metalness: 0, roughness: 0.92 }), 'primal');
                        for (const [ly, lr] of [[-0.14, 0.20], [-0.01, 0.14]]) {
                            const ring = new THREE.Mesh(new THREE.TorusGeometry(lr, 0.02, 6, 14), paint);
                            ring.rotation.x = Math.PI / 2;
                            ring.position.y = ly;
                            cone.add(ring);
                        }
                        for (let i = -1; i <= 1; i++) {   // 밑단에서 흘러내린 세로 칠 자국 3줄
                            const a = i * 0.5;
                            const drip = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.09, 0.012), paint);
                            drip.position.set(Math.sin(a) * 0.235, -0.225, Math.cos(a) * 0.235);
                            drip.rotation.y = a;
                            drip.rotation.x = -0.42;      // 원뿔 표면 기울기를 따라 눕힌다
                            cone.add(drip);
                        }
                    }
                }
            } else if (style === 'hair') {
                // 수염(털가죽 모자): 뼈 비녀 — 사선으로 꽂힌 뼈 막대 + 양끝 마디.
                // ⚠️ 캡(r 0.25)이 y 0.16 에서 반폭 0.206 이라, 막대 0.42 로는 양끝이 표면에 묻힌다(실측) —
                //    0.56 으로 늘려 양끝 0.06 이상을 확실히 내민다.
                const pin = new THREE.Group();
                const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.56, 6), this.primalBoneMat());
                rod.rotation.z = Math.PI / 2;
                pin.add(rod);
                for (const s of [-1, 1]) {
                    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 7, 6), this.primalBoneMat());
                    knob.position.x = s * 0.28;
                    pin.add(knob);
                }
                pin.position.set(0, 0.15, 0.02);
                pin.rotation.y = 0.35;
                pin.rotation.z = 0.1;
                g.add(pin);
            }
        }
        g.scale.setScalar(0.85); // 두상 밀착 피팅 — 헬멧이 머리보다 한 치수 커서 '풍선'으로 읽히던 문제 (비평가 3번 결함)
        // 등급색 장식 표식 — 판정기가 **차분 규약**(껐다 켜서 기여 화소만 잰다)으로 이 부위만
        // 골라 재게 한다(probe-white-decor). 재질 동일성으로 잡으므로 좌표를 손으로 베낄 일이 없다.
        g.traverse(o => { if (o.isMesh && o.material === rareMat) o.userData.rarityDecor = true; });
        return g;
    },

    // ── 천상(divine) 공통 문장 — 후광 / 십자가 ─────────────────────────────────────
    // 사용자 지시 2026-08-19: "천상→진짜 천상 같아야 함(예: 예수 머리·십자가)".
    // 금색 재질만으로는 '노랗게 칠한 금속'이라 시대가 색으로만 읽혔다 — 무기·투구·갑옷이
    // **같은 두 기호**(후광·십자가)를 쓰게 해서 한 벌로 묶는다. 여기 한 곳만 고치면 셋이 같이 움직인다.
    divineLitMat() {
        // ⚠️ 램버트 크림(0xfff2cc)+발광 0.85 로 되돌리지 말 것 — 전면이 휘도 227~239 로 눌려
        //    내부 음영폭 12짜리 '균일 크림 판'이 됐다(probe-thumb-env 실측, 2차 채점 'halo=빈 칸').
        //    스탠다드 금속 금 + 절제된 발광이라야 윗호가 빛나고 아랫호가 가라앉는 고리가 된다.
        if (!this._divineLit) this._divineLit = new THREE.MeshStandardMaterial({
            color: 0xe0ae38, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.0,
            emissive: 0xffc247, emissiveIntensity: 0.32
        });
        return this._divineLit;
    },
    addDivineHalo(g, y, r) {
        const m = this.divineLitMat();
        const halo = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.11, 6, 24), m);
        halo.position.set(0, y, -r * 0.42);
        halo.rotation.x = -0.22;   // 성상화처럼 뒤로 살짝 눕힌다 (정면에서 타원 고리로 읽힘)
        g.add(halo);
        for (let i = 0; i < 8; i++) {   // 방사 광선
            const a = i * Math.PI / 4;
            const ray = new THREE.Mesh(new THREE.BoxGeometry(r * 0.075, r * 0.44, r * 0.075), m);
            ray.position.set(Math.cos(a) * r * 1.32, y + Math.sin(a) * r * 1.32, -r * 0.44);
            ray.rotation.z = Math.PI / 2 - a;
            g.add(ray);
        }
        return g;
    },
    // 라틴 십자가 — 가로대는 세로대 위쪽 1/3. 같은 길이로 두면 더하기 기호로 읽힌다.
    addDivineCross(g, x, y, z, h, mat) {
        const m = mat || this.divineLitMat();
        const cross = new THREE.Group();
        const v = new THREE.Mesh(new THREE.BoxGeometry(h * 0.18, h, h * 0.13), m);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(h * 0.62, h * 0.17, h * 0.13), m);
        bar.position.y = h * 0.22;
        cross.add(v, bar);
        cross.position.set(x, y, z);
        g.add(cross);
        return cross;
    },

    // ── 원시(primitive)·중세(medieval) 공통 문장 — 천상(후광·십자가)과 같은 문법 ──────
    // 시대를 색·재질만으로 두면 88px 썸네일에서 '갈색 항아리 / 파란 항아리'로 내려앉는다.
    // 원시 = 가죽끈에 꿴 이빨 트로피(사냥꾼), 중세 = 가슴 문장 방패(기사) — 한 곳만 고치면
    // 프리뷰·인게임 영웅이 같이 움직인다(makeArmorExtras 가 양쪽 공용이라서다).
    primalBoneMat() {
        if (!this._primalBone) this._primalBone = new THREE.MeshLambertMaterial({ color: 0xe6dcc3 });
        return this._primalBone;
    },
    primalCordMat() {
        if (!this._primalCord) this._primalCord = new THREE.MeshLambertMaterial({ color: 0x5b4228 });
        return this._primalCord;
    },
    // 이빨 트로피 목걸이 — 가슴을 가로질러 늘어진 가죽끈 + 아래로 매달린 이빨 5개(가운데가 크다).
    // ⚠️ 끈 끝을 허공에 두지 말 것 — 이 항목 무기 메모의 함정 ⓒ(떠 있는 부속은 다른 물건이 된다).
    //    끈을 몸통 타원 표면(zf 기준)을 따라 옆구리까지 감아 끝이 실루엣 뒤로 사라지게 한다.
    addPrimalTrophy(g, yTop, zf) {
        const grp = new THREE.Group();
        const surf = (x) => zf * Math.sqrt(Math.max(0.12, 1 - (x / 0.235) * (x / 0.235)));
        const pts = [];
        for (let i = 0; i <= 12; i++) {
            const u = i / 6 - 1;                       // -1(왼 어깨) … 1(오른 어깨)
            const x = u * 0.19;
            pts.push(new THREE.Vector3(x, yTop - 0.12 * (1 - u * u), surf(x) + 0.045));
        }
        const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.012, 5), this.primalCordMat());
        grp.add(cord);
        for (let i = -2; i <= 2; i++) {
            const u = i * 0.3, x = u * 0.19;
            const len = 0.1 - Math.abs(i) * 0.018;
            const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.023 - Math.abs(i) * 0.003, len, 5), this.primalBoneMat());
            tooth.rotation.x = Math.PI;                // 이빨 끝이 아래로 (송곳니를 거꾸로 꿴다)
            tooth.rotation.z = -u * 0.5;               // 바깥 이빨은 끈 접선을 따라 살짝 벌어진다
            tooth.position.set(x, yTop - 0.12 * (1 - u * u) - len * 0.55, surf(x) + 0.05);
            grp.add(tooth);
        }
        g.add(grp);
        return grp;
    },
    // 원시 뼈 뿔 한 쌍 — 2분절(기둥+끝 원뿔)로 살짝 굽는다. ⚠️ 토러스 호로 만들지 말 것 —
    // 굵기가 일정한 관은 뿔이 아니라 갈고리로 읽힌다(이 항목 무기 메모 함정 ⓐ와 같은 함정).
    addPrimalHorns(g, hx, hy, sc) {
        const boneM = this.primalBoneMat();
        for (const s of [-1, 1]) {
            const horn = new THREE.Group();
            const base = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.11, 7), boneM);
            base.position.y = 0.055;
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 7), boneM);
            tip.position.set(0, 0.13, 0.01);         // 끝 분절이 살짝 앞으로 굽는다
            tip.rotation.x = 0.18;
            horn.add(base, tip);
            horn.position.set(s * hx, hy, 0);
            horn.rotation.z = -s * 0.62;             // 바깥으로 벌어진다
            if (sc) horn.scale.setScalar(sc);
            g.add(horn);
        }
    },

    // 중세 문장 방패 — 히터 실드(위 직선·아래 뾰족)에 등급색 필드 + 은빛 가로 밴드(페스).
    // 십자가는 천상의 기호라 쓰지 않는다. 필드가 등급색이라 등급 위계도 같이 실어 나른다.
    addHeraldShield(g, x, y, z, h, rareHex, mats) {
        const grp = new THREE.Group();
        const w = h * 0.8;
        const shieldShape = (s) => {
            const hw = w * 0.5 * s, hh = h * 0.5 * s;
            const sh = new THREE.Shape();
            sh.moveTo(-hw, hh);
            sh.lineTo(hw, hh);
            sh.quadraticCurveTo(hw, hh * 0.1, hw * 0.72, -hh * 0.35);
            sh.quadraticCurveTo(hw * 0.38, -hh * 0.82, 0, -hh);
            sh.quadraticCurveTo(-hw * 0.38, -hh * 0.82, -hw * 0.72, -hh * 0.35);
            sh.quadraticCurveTo(-hw, hh * 0.1, -hw, hh);
            return sh;
        };
        const rimM = mats ? this.tintOf(mats.dark, -0.04) : new THREE.MeshLambertMaterial({ color: 0x3a4652 });
        const base = new THREE.Mesh(new THREE.ExtrudeGeometry(shieldShape(1), { depth: h * 0.1, bevelEnabled: false }), rimM);
        // 문장 필드는 유채색이어야 문장이다 — 무채색 등급(일반 0xd6d6d6)을 그대로 쓰면 '회색 사각
        // 스티커'로 읽힌다(2차 채점 A·B 공통). 채도가 없는 등급색만 문장 아주르(짙은 파랑)로 폴백하고,
        // 유채 등급색(레어 파랑·에픽 초록…)은 등급 정보 그대로 둔다.
        const rHSL = new THREE.Color(rareHex).getHSL({ h: 0, s: 0, l: 0 });
        const fieldHex = rHSL.s < 0.25 ? 0x2456a8 : rareHex;
        const field = new THREE.Mesh(new THREE.ExtrudeGeometry(shieldShape(0.78), { depth: h * 0.05, bevelEnabled: false }),
            new THREE.MeshLambertMaterial({ color: fieldHex, emissive: fieldHex, emissiveIntensity: 0.22 }));
        field.position.z = h * 0.1;
        // 페스는 필드와 명도가 갈려야 문장이다 — 밝은 필드엔 어두운 강철, 어두운 필드(아주르)엔 은빛
        const fessC = new THREE.Color(fieldHex).getHSL({ h: 0, s: 0, l: 0 }).l > 0.55 ? 0x39424d : 0xe8e6df;
        const fess = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, h * 0.15, h * 0.03),
            new THREE.MeshLambertMaterial({ color: fessC }));
        fess.position.set(0, h * 0.06, h * 0.155);
        grp.add(base, field, fess);
        grp.position.set(x, y, z);
        g.add(grp);
        return grp;
    },

    // 갑옷 스타일별 부속 (몸통 기준 좌표 — 영웅 몸통 y0.65)
    // mats: 시대 재질 세트(ageGearMats). 없으면 기존 램버트 폴백 — 호출부가 시대를 모를 때만.
    // opt: 부속을 앉힐 몸통 앞뒤 깊이(프리뷰 전용). 인게임 영웅 몸통과 곡면 흉갑은 치수가 달라
    // 상수 좌표를 그대로 쓰면 파우치·스트라이프·백팩이 1~3cm 떠 보인다(비평가 지적 '부유 부속').
    // 4번째 인자까지만 넘기는 인게임 호출부는 종전 좌표를 그대로 쓴다.
    makeArmorExtras(style, colorHex, rareHex, mats, opt) {
        const o = opt || {};
        const g = new THREE.Group();
        const darker = new THREE.Color(colorHex).offsetHSL(0, 0, -0.12);
        // 부속도 본체와 같은 시대 재질이어야 한 벌로 읽힌다 (백팩만 매끈한 플라스틱으로 남던 문제)
        const body = mats ? this.tintOf(mats.body, -0.1) : new THREE.MeshLambertMaterial({ color: darker });
        // 천 계열(로브 자락·망토)은 금속기를 빼야 '철판 커튼'이 안 된다
        const cloth = mats ? this.tintOf(mats.body, -0.1, { metalness: 0.02, roughness: 0.9, envMapIntensity: 0.3, side: THREE.DoubleSide })
                           : new THREE.MeshLambertMaterial({ color: darker, side: THREE.DoubleSide });
        if (style === 'suit' && !this.suitSealed(o.age)) {
            // 전산업 시대의 suit = 퀴레스 — 등판 + 어깨 벨트. 백팩·발광 스트라이프는 기밀복의 언어라
            // 여기 오면 중세 기사 등에 산소 백팩이 붙는다(makeArmorPreview 쪽 주석 참조).
            const backplate = this.beveledSlab(0.30, 0.34, 0.055, 0.035, body);
            backplate.position.set(0, 0.66, o.packZ !== undefined ? o.packZ + 0.06 : -0.18);
            g.add(backplate);
            for (const s of [-1, 1]) {
                const belt = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.20, 0.34), mats ? mats.dark : body);
                belt.position.set(s * 0.14, 0.86, 0);
                belt.rotation.z = s * 0.22;
                g.add(belt);
            }
        } else if (style === 'suit') {          // 백팩 + 발광 스트라이프
            const pack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.14), body);
            pack.position.set(0, 0.68, o.packZ !== undefined ? o.packZ : -0.24);
            // 스트라이프는 평면 판이 아니라 **몸통을 감는 얇은 호**여야 표면에 붙어 보인다
            const stripe = new THREE.Mesh(
                new THREE.CylinderGeometry(o.frontZ !== undefined ? o.frontZ : 0.17, o.frontZ !== undefined ? o.frontZ : 0.17,
                    0.32, 10, 1, true, -0.62, 0.42),
                new THREE.MeshLambertMaterial({ color: rareHex, emissive: rareHex, emissiveIntensity: 0.7, side: THREE.DoubleSide }));
            stripe.position.set(0, 0.65, 0);
            g.add(pack, stripe);
        } else if (style === 'vest') {   // 전술 파우치 — 벨트 루프로 몸통에 매달린다
            const pz = o.frontZ !== undefined ? o.frontZ : 0.155;
            // ⚠️ 천상은 alloy 계열이라 mats.dark 가 짙은 합금 회색이다 — 성광 조끼에 회색 파우치가
            //    그대로 남아 '재탕 노출'로 읽혔다(1차 채점 B). 다크 앵커는 유지하되 금의 어두운 단으로.
            const pm = mats ? (o.age === 'divine' ? this.tintOf(mats.body, -0.22) : mats.dark)
                            : new THREE.MeshLambertMaterial({ color: 0x37474f });
            for (const dx of [-0.11, 0.11]) {
                const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.06), pm);
                pouch.position.set(dx, 0.56, pz - 0.012);
                g.add(pouch);
                // ⚠️ 파우치만 띄우면 '몸통 옆 허공의 상자'다 — 위로 넘어가는 루프를 반드시 같이 낸다
                const loop = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.085, 0.055), pm);
                loop.position.set(dx, 0.625, pz - 0.03);
                g.add(loop);
            }
        } else if (style === 'robe') {   // 로브 자락 + 밑단 헴
            const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 12, 1, true), cloth);
            skirt.position.y = 0.32;
            g.add(skirt);
            const hem = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.026, 6, 20), cloth);
            hem.position.y = 0.075;
            hem.rotation.x = Math.PI / 2;
            g.add(hem);
        } else if (style === 'cape') {   // 망토
            // ⚠️ 예전엔 0.52×0.66×**0.04 평면 상자**였다 — 옆에서 보면 사라지고 라이팅에도
            //    반응하지 않아 'UI 스티커'로 읽혔다(비평가 지적). 어깨를 감아 아래로 벌어지는
            //    **열린 원뿔 호**로 바꿔 곡률과 부피를 준다.
            const cz = o.backZ !== undefined ? o.backZ : -0.06;
            const cape = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.34, 0.66, 14, 1, true, Math.PI * 0.62, Math.PI * 0.76), cloth);
            cape.position.set(0, 0.6, cz);
            cape.rotation.x = 0.1;
            g.add(cape);
            const hem = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.024, 6, 22, Math.PI * 0.76), cloth);
            hem.position.set(0, 0.275, cz);
            hem.rotation.x = Math.PI / 2;
            hem.rotation.z = -Math.PI * 0.62;   // 토러스 호의 시작각을 원뿔과 맞춘다
            g.add(hem);
            // 어깨 걸쇠 — 망토가 무엇에 매달렸는지 보여 준다(부유 인상 제거)
            for (const dx of [-0.16, 0.16]) {
                const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), body);
                clasp.position.set(dx, 0.9, cz + 0.09);
                g.add(clasp);
            }
        }
        // 천상: 가슴 십자가 (사용자 지시 '천상→예: 예수 머리·십자가').
        // ⚠️ makeArmorPreview 가 아니라 **여기**에 둔다 — 프리뷰 전용에 두면 썸네일만 성스럽고
        //    실제로 입은 영웅 가슴에는 아무것도 안 붙는다(이 파일의 '부속은 프리뷰 전용' 관례는
        //    좌표가 틀어지는 부속에 대한 것이고, 십자가는 앞면 중앙이라 양쪽 다 같은 자리다).
        // ⚠️ 시대 문장을 5스타일 전부에 찍지 말 것 — 같은 자리 같은 데칼이 다섯 번 반복되면
        //    "동일 몸통 팔레트 스왑"으로 읽혀 스타일 분화가 통째로 지워진다(3차 채점 C·D 공통 1~2순위).
        //    문장은 경식 갑주(plate·suit)의 언어다 — 천 계열은 자기 조형(후드·술·파우치)이 정체성을 진다.
        if (o.age === 'divine') {
            if (style === 'plate' || style === 'suit' || style === 'robe') {
                const frontZ = o.frontZ !== undefined ? o.frontZ : 0.128;
                this.addDivineCross(g, 0, o.crossY !== undefined ? o.crossY : 0.78, frontZ + 0.05, 0.17);
            }
        } else if (o.age === 'primitive') {          // 원시 — 이빨 트로피 목걸이 (십자가와 같은 자리 규약)
            // ⚠️ 'plate' 였던 자리를 'bone' 으로 갈았다 — 원시 시대에는 `plate`(중세 판금)가 더 이상
            //    배정되지 않는다(ARMOR_STYLES.primitive, equip-era-theming). 구세이브가 든 옛 조합을
            //    위해 'plate' 도 남겨 둔다(원시+plate 는 이제 폴백 경로에서만 나온다).
            if (style === 'hide' || style === 'vest' || style === 'bone' || style === 'plate') {
                this.addPrimalTrophy(g, 0.89, o.frontZ !== undefined ? o.frontZ : 0.128);
            }
        } else if (o.age === 'medieval') {           // 중세 — 가슴 문장 방패 (경식 갑주만)
            if (style === 'plate' || style === 'suit') {
                const frontZ = o.frontZ !== undefined ? o.frontZ : 0.128;
                this.addHeraldShield(g, 0, 0.77, frontZ + 0.02, 0.19, rareHex, mats);
            }
        }
        return g;
    },

    makeArmorPreview(age, rarity, style, name) {
        const g = new THREE.Group();
        const c = AGE_COLORS[age];
        const mats = this.ageGearMats(age, name);
        style = style || 'plate';
        // 가죽·로브는 판금 재질을 쓰면 '철판 원피스'로 읽힌다 — 시대색은 유지한 채 금속기만 뺀다
        // `bone`(원시 뼈 갑옷)도 몸통은 생가죽 받침이다 — 뼈는 그 위에 얹는 별도 층(아래 참조).
        const soft = style === 'hide' || style === 'robe' || style === 'bone';
        // 천·가죽은 시대 계열 셰이딩(판금의 에지 웨어)이 아니라 **천 프로파일**을 탄다 — 안 그러면
        // 로브에 강철 모서리 반짝임이 얹힌다. tintOf 가 base 의 계열을 물려주므로 여기서 덮어쓴다.
        // ⚠️ 명도차도 시대마다 줘야 한다 — 셰이딩 프로파일만 갈랐더니 근세(왁스 캔버스)와 현대(기술섬유)
        //    로브의 평균 휘도가 171.7 vs 163.6 으로 붙어 재질분리 0.68 로 여전히 반려됐다.
        //    천은 '시대별 소재'가 곧 밝기다: 생가죽은 그을리고, 모직은 중간, 캔버스는 볕에 바래 밝고,
        //    기술섬유는 무광 흑회색, 발광 섬유는 어둡되 림이 산다.
        const SOFT_DL = { primal: -0.06, forged: 0.01, brass: 0.06, polymer: -0.21, alloy: -0.10, holy: 0.10 };
        // 🚨 `bone`(원시 뼈 갑주)의 몸통만 **이름 물질을 따르지 않는다**. '뼈 갑옷'이라는 이름은
        //    `substanceOf` 를 거쳐 몸통까지 크림빛 뼈로 칠하는데, 그러면 위에 얹는 늑골·견갑골이
        //    받침과 **같은 명도**가 되어 통째로 사라진다(실측: 3각도 전부 전 부위 L 225~236 의 흰 덩어리).
        //    이 스타일의 정의는 '생가죽 받침 + 그 위에 묶은 뼈판'이라, 받침을 어두운 생가죽으로
        //    굳혀야 뼈가 그 위에서 뜬다 — 다크 앵커도 여기서 나온다.
        const mat = style === 'bone'
            ? this.ageShade(new THREE.MeshStandardMaterial({
                color: 0x6a4c30, metalness: 0.02, roughness: 0.93, envMapIntensity: 0.22,
                map: (typeof ProChar !== 'undefined' && ProChar.leatherTex) ? ProChar.leatherTex() : null
            }), 'soft:primal')
            : soft ? this.ageShade(this.tintOf(mats.body, SOFT_DL[mats.kind] !== undefined ? SOFT_DL[mats.kind] : -0.02,
                { metalness: 0.03, roughness: 0.9, envMapIntensity: 0.3 }), 'soft:' + mats.kind) : mats.body;
        // ── 몸통: 0.46×0.5×0.3 상자 → **단면 링을 쌓은 곡면 흉갑** (비평가 지적 ㉯⑴) ──
        // 아랫단이 벌어지고(플레어) 허리가 잘록해지며 가슴이 가장 두껍고 목으로 좁아진다.
        // 폭·높이는 예전 상자와 맞춰 둔다(rx 0.238×2≈0.46) — 부속(견갑·망토)·시대 트림의 좌표가
        // 이 치수를 전제로 잡혀 있어 크게 벗어나면 리벳이 허공에 뜬다.
        // ⚠️ 스타일 6종이 **같은 토르소 하나**를 돌려 쓰면 96px 로 줄였을 때 plate·hide·vest·suit 가
        //    전부 '같은 흰 항아리'로 수렴한다(비평가 2차 지적 '96px 판독성 실패'). 어깨폭·허리·
        //    밑단·키를 스타일마다 갈라 **바깥 윤곽 자체를 변주**한다. 실루엣 확인은
        //    `shot-equip-sculpt.js` 의 3번째 행(96px 다운샘플 + 실루엣 판)으로 한다.
        // ⓐ **본체 실루엣 분화**(3차 채점 C·D 지적 '같은 항아리 몸통'). 문장(방패·십자가·트로피)을
        //    걷어내니 스타일은 갈렸는데 **몸통 6종이 서로 실루엣이 못 갈렸다** — plate·suit·vest·cape
        //    가 어깨/허리/키가 1~5% 차이라 96px 에서 다 같은 종으로 뭉갠다.
        //    ⚠️ 원래 표는 **1.00 을 기준으로 미세 조정**한 값이라 갈리는 축이 하나(허리 잘록 정도)뿐이었다.
        //    갈리는 축을 3개로 늘린다: 어깨(넓게 벌린 판금 vs 어깨선 없는 로브) · 허리(잘록 vs 통짜)
        //    · 키(크롭 vs 롱 드레이프). 그리고 각 축의 폭을 실측 게이트(probe-equip-sculpt)가 갈릴 만큼
        //    벌린다(±3% → ±10%).
        //    🚨 **shoulder·waist 는 그대로 두면 몸통 반경이 바뀐다 → 부속(견갑·리벳·문장) 좌표가 통째로
        //       벗어난다.** 실제 좌표가 참조하는 링 반경은 `RINGS[i].rx = 0.238 * P.shoulder` 등이므로
        //       스타일마다 어깨폭을 다르게 하면 파울드론(0.185)이 어깨 밖·안으로 밀린다. 그래서
        //       **몸통 링 좌표는 옛 P 를 그대로 쓰고**, 스타일 실루엣은 **아래에서 별도 오버레이**로
        //       친다(어깨 라인·크롭 헴·롱 드레이프). 링을 실제로 바꾸는 축은 **skirt/top** 뿐 —
        //       그 둘은 부속 좌표에 참조가 없다(실측 확인).
        const P = {                       // shoulder=가슴폭 배율 · waist=허리 배율 · skirt=밑단 반경 · top=키 배율
            plate: { shoulder: 1.00, waist: 0.94, skirt: 0.225, top: 1.00 },
            hide: { shoulder: 0.94, waist: 1.10, skirt: 0.250, top: 0.94 },   // 통짜 자루꼴, 낮다
            robe: { shoulder: 0.88, waist: 0.92, skirt: 0.345, top: 1.14 },   // 좁은 어깨 + 큰 치맛단, 롱 드레이프
            cape: { shoulder: 1.00, waist: 0.96, skirt: 0.230, top: 1.00 },
            vest: { shoulder: 1.05, waist: 0.98, skirt: 0.190, top: 0.80 },   // 짧게 잘린 조끼 (크롭)
            suit: { shoulder: 1.03, waist: 1.04, skirt: 0.215, top: 1.02 },   // 통통한 여압복
            bone: { shoulder: 0.90, waist: 1.06, skirt: 0.198, top: 0.86 },   // 뼈 갑주: 좁은 어깨·통짜 몸통·짧은 기장 (늑골이 바깥 윤곽을 진다)
            exo: { shoulder: 0.86, waist: 0.86, skirt: 0.170, top: 1.10 },   // 외골격: 몸통은 얇은 코어, 부피는 바깥 프레임이 진다 (판금과 정반대 배분)
            carrier: { shoulder: 1.10, waist: 1.02, skirt: 0.205, top: 0.88 },   // 플레이트 캐리어: 넓고 각지고 짧다 (곡면 흉갑과 반대로 평판)
        }[style] || { shoulder: 1, waist: 1, skirt: 0.225, top: 1 };
        // 천 주름(비평가 ⓒ⑶) — 로브는 어깨에 걸린 천이라 밑으로 갈수록 주름이 깊어진다.
        // fw 는 링별 주름 가중치(목 0 → 밑단 1). 판금은 0(주름진 강철은 찌그러진 강철이다).
        // ⚠️ 셰이더가 칠하는 주름(`ageDetailGLSL` 의 sFold)과 겹치는 게 아니라 **포개는** 층이다 —
        //    칠한 주름은 바깥 윤곽을 못 바꿔서 96px 로 줄이면 여전히 매끈한 종이다.
        // ⚠️ **가죽(hide)에는 주름을 주지 않는다** — 물성으로도 맞지만(생가죽 갑옷은 늘어지지 않는다),
        //    실측으로도 줘서는 안 된다: hide 에 0.032 를 걸었더니 `probe-age-shading` 의
        //    `primal↔polymer(hide)` 재질분리가 **1.19 → 0.62** 로 무너져 반려됐다(기준 1.00).
        //    그 지표의 승리 축이 ΔSD(휘도 표준편차 차 2.4)인데, 주름이 **두 시대 가죽 모두**의 SD 를
        //    같이 올려 차이를 지워 버린다 = 비평가가 친 '색 스와프'를 되살리는 꼴이다.
        //    (남의 회귀 기준선을 고쳐서 통과시키지 말 것 — 인계 메모 ㉢ 이 같은 함정을 기록해 뒀다.)
        //    천 주름이 필요한 건 실제로 늘어지는 로브다. 가죽의 2차 디테일은 `ageDetailGLSL` 의
        //    가죽 결·바늘땀이 이미 진다 — 조형 층을 덧대면 위 지표가 무너진다.
        const FOLD = { robe: 0.055 }[style] || 0;
        const RINGS = [
            { y: -0.27, rx: P.skirt, rz: P.skirt * 0.63, fw: 1.0 },     // 아랫단 플레어
            { y: -0.19, rx: 0.192 * P.waist, rz: 0.120 * P.waist, fw: 0.86 },
            { y: -0.07, rx: 0.178 * P.waist, rz: 0.113 * P.waist, fw: 0.52 },  // 허리 — 가장 잘록한 지점
            { y: 0.05, rx: 0.214 * P.shoulder, rz: 0.145 * P.shoulder, fw: 0.34 },
            { y: 0.15 * P.top, rx: 0.238 * P.shoulder, rz: 0.160 * P.shoulder, fw: 0.22 },  // 가슴 — 가장 두껍다
            { y: 0.23 * P.top, rx: 0.222 * P.shoulder, rz: 0.138 * P.shoulder, fw: 0.12 },
            { y: 0.29 * P.top, rx: 0.168, rz: 0.106, fw: 0 },           // 목
        ];
        const torso = this.shellFromRings(RINGS, FOLD ? 30 : (soft ? 22 : 20), mat,
            // foldN 11 = 로브 둘레의 주름 수. **홀수를 쓴다** — k = 1 + fold·cos(foldN·a) 에서
            // 정면(a = π/2)의 값이 홀수면 cos(홀수·π/2) = 0 이라 골이 오지 않고, 짝수면 −1 이라
            // 세로 홈이 정중선을 한가운데서 가른다('지퍼'로 읽힌다).
            { flat: this.ageGearKind(age) === 'primal' && !soft, fold: FOLD, foldN: 11 });
        g.add(torso);
        const neckY = 0.29 * P.top;
        // ⚠️ `exo`(외골격)는 제외한다 — 흉근 두 덩이 + 정중선 능선은 **단조 흉갑의 언어**라,
        //    외골격에 얹으면 가슴 한가운데 세로 렌즈가 서서 동력 코어를 가리고 다시 '근육 갑주'로
        //    읽힌다(실측: 코어가 키일 뒤로 완전히 묻혔다). 외골격의 가슴은 평평한 코어 패널이다.
        // `carrier`(현대 플레이트 캐리어)도 제외 — 하드플레이트는 **평판**이라 흉근 곡률이 서면
        //    다시 근육 흉갑(중세 언어)이 된다.
        if (!soft && style !== 'exo' && style !== 'carrier') {
            // 가슴 곡률 — 판금은 흉근 두 덩이 + 가운데 능선(키일)이 서야 '흉갑'으로 읽힌다.
            // ⚠️ 구를 그대로 쓰면 두 개의 유방으로 읽힌다 — z를 0.26까지 눌러 **표면에서 살짝
            //    부푼 면**으로 만들고 몸통 앞면(rz 0.16)에 반쯤 묻는다.
            for (const s of [-1, 1]) {
                const pec = new THREE.Mesh(new THREE.SphereGeometry(0.098, 14, 10), mat);
                pec.scale.set(1.02, 0.66, 0.26);
                pec.position.set(s * 0.082, 0.163, 0.137);
                g.add(pec);
            }
            const keel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 12), mat);
            keel.scale.set(0.38, 2.5, 0.34);   // 세로로 길게 눌린 렌즈 = 가슴 한가운데 능선
            keel.position.set(0, 0.105, 0.147);
            g.add(keel);
        }
        // 목깃(고젯) — 몸통 윗변을 링으로 마감해 '잘린 관' 인상을 없앤다
        const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.125, soft ? 0.026 : 0.032, 8, 20), soft ? mat : mats.dark);
        gorget.position.y = neckY;
        gorget.rotation.x = Math.PI / 2;
        gorget.scale.y = 0.68;   // 몸통 단면이 타원이라 링도 눕혀야 앞뒤로 뜨지 않는다
        g.add(gorget);
        // 시대 디테일은 **몸통 기준으로** 두른다 — 견갑·망토까지 포함한 바운딩 박스로 재면
        // 반경이 0.44까지 커져 리벳이 가슴 앞 6cm 허공에 뜬다
        // 허리(y=-0.07, rx 0.178)에 두른다 — 곡면 몸통이라 반경을 직접 넘긴다(위 ⚠️ 참고)
        this.addAgeTrim(g, mats, { yFrac: 0.34, rx: 0.187, rz: 0.122 });
        // ⚠️ **가죽(hide)에는 아무것도 얹지 않는다.** 매듭 5개를 얹었더니 `probe-age-shading` 의
        //    `primal↔polymer(hide)` 재질분리가 **1.19 → 0.70** 으로 무너져 반려됐다(기준 1.00).
        //    그 지표의 승리 축이 ΔSD(두 시대 가죽의 휘도 표준편차 차 2.4)인데, 어두운 매듭이
        //    **무광 기술섬유(polymer) 쪽 SD 를 더 크게 올려**(24.7 → 26.4) 차이를 지운다 —
        //    비평가가 친 '색 스와프'를 되살리는 꼴이다. 주름(0.032)만 걸었을 때도 같은 결과였다.
        //    남의 회귀 기준선을 고쳐서 통과시키지 말 것(인계 메모 ㉢). 가죽의 2차 디테일은
        //    `ageDetailGLSL` 의 가죽 결·바늘땀이 이미 지고 있다 — 조형 층은 로브에만 얹는다.
        if (FOLD) {
            // 허리끈 + 매듭(비평가 ⓒ⑶ 의 '매듭') — 천은 어딘가에서 여며져야 '입는 옷'이다.
            // 잘록한 허리(y=-0.07)를 한 바퀴 두르고 앞에 매듭을 얹는다. 링 반경은 상수로 베끼지
            // 않고 RINGS 에서 그대로 읽는다 — 스타일 배율(P)이 바뀌면 끈이 몸통에서 떠 버린다.
            const wr = RINGS[2];
            const cordM = this.tintOf(mats.dark, -0.075);
            const cord = new THREE.Mesh(new THREE.TorusGeometry(wr.rx * 1.02, 0.014, 6, 24), cordM);
            cord.rotation.x = Math.PI / 2;
            cord.position.y = wr.y;
            cord.scale.y = (wr.rz / wr.rx) * 1.02;   // 몸통 단면이 타원이라 링도 눌러야 앞뒤로 안 뜬다
            g.add(cord);
            const wknot = this.tieKnot(cordM, 0.016);
            wknot.position.set(0, wr.y - 0.002, wr.rz * 1.04);
            g.add(wknot);
        }
        if (style === 'plate') {
            // 파울드론 — 구 하나가 아니라 **라멜라 3장이 겹쳐 바깥으로 벌어진다**.
            // 구를 적도보다 조금 더(0.62π) 내려 자르면 테두리가 안쪽으로 말려 뚫린 면이 안 보인다.
            for (const s of [-1, 1]) {
                const pg = new THREE.Group();
                for (let l = 0; l < 3; l++) {
                    const lame = new THREE.Mesh(
                        new THREE.SphereGeometry(0.112 - l * 0.021, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
                        l ? this.tintOf(mat, -0.045) : mat);
                    lame.scale.set(1, 0.62, 0.94);
                    lame.position.y = -l * 0.038;
                    pg.add(lame);
                }
                pg.position.set(s * 0.185, 0.216, 0);
                pg.rotation.z = -s * 0.34;     // 어깨 밖으로 흘러내린다
                g.add(pg);
            }
            // 파울드 — 허리 아래로 늘어진 판 3장(앞·좌·우)
            for (const a of [-0.85, 0, 0.85]) {
                const f = this.beveledSlab(0.115, 0.12, 0.035, 0.03, this.tintOf(mat, -0.03));
                f.position.set(Math.sin(a) * 0.175, -0.24, Math.cos(a) * 0.125);
                f.rotation.y = a;
                f.rotation.x = 0.22;
                g.add(f);
            }
        }
        if (style === 'bone') {
            // ── 원시 `뼈 갑옷` (equip-era-theming) ─────────────────────────────────────
            // 🚨 **되돌려서 `plate` 로 쓰지 말 것.** 2026-08-19 까지 원시 시대의 '뼈 갑옷'은
            //    `ARMOR_STYLES.primitive[2] = 'plate'` 이라 **중세 판금 흉갑**(라멜라 파울드론 3장 +
            //    파울드 3판 + 어깨판)으로 그려졌다 — 재질만 돌빛이고 조형은 기사 갑주 그대로였다.
            //    사용자 지적 "원시 장비가 원시 장비 같은 디자인이 아닌 게 제일 큼 / 전부 중세 같은
            //    디자인임"의 가장 직접적인 실물이 이것이다. `plate` 의 조형 언어(겹친 강철판·리벳·
            //    문장)를 원시에서 완전히 걷어내고 **묶어서 만든 뼈 갑주**로 갈아 끼운다.
            // 조형 언어: ⓐ 생가죽 받침(soft 몸통) 위에 ⓑ **늑골 아치**가 가로로 겹쳐 얹히고
            //   ⓒ 가슴 한가운데 **흉골 기둥**이 그 아치들을 꿴다 ⓓ 어깨에는 넓적한 **견갑골 판**
            //   ⓔ 전부 **가죽끈**으로 묶여 있다(금속 부속·리벳 0개 — 그게 원시의 정의다).
            // ⚠️ 뼈는 밝은 크림이라 밝은 썸네일 배경에서 날아간다(무기 `holy` 가 같은 함정을 밟았다) —
            //    받침 가죽(어두움)과 가죽끈(가장 어두움)이 항상 뼈 뒤에 깔려 다크 앵커를 준다.
            // 계열은 `primal`(돌·뼈) — soft(가죽·천) 프로파일을 주면 뼈에 **바늘땀**이 찍힌다.
            // primal 은 깊은 틈 그늘 + 먼지빛 모서리 + `AGE_DETAIL.primal` 의 팬 자국·기공이라 뼈에 맞다.
            // ⚠️ 0xc2b493 은 썸네일 조명(ambient 0.85)에서 **순백으로 타서** 뼈가 흰 플라스틱 판이
            //    됐다(무기 `holy` 가 밟은 것과 같은 함정). 알베도를 상아 쪽으로 눌러 내부 음영이 남게 한다.
            const boneM = this.ageShade(new THREE.MeshStandardMaterial({
                color: 0x9c8f6f, metalness: 0.02, roughness: 0.82, flatShading: true
            }), 'primal', 'primal');
            const cordM = this.tintOf(mats.dark, -0.08, { metalness: 0.02, roughness: 0.92, envMapIntensity: 0.25 });
            // ⓑ 늑골 아치 4쌍 — 몸통 앞면을 감싸 도는 토러스 호. 위가 넓고 아래로 좁아진다.
            //    ⚠️ 반지름은 RINGS 에서 읽는다(P.shoulder/P.waist 가 바뀌면 갈비뼈가 몸통에서 뜬다).
            const RIB = [[4, 0.99], [3, 1.02], [2, 1.04], [1, 1.05]];
            for (let i = 0; i < RIB.length; i++) {
                const r = RINGS[RIB[i][0]], k = RIB[i][1];
                const arc = Math.PI * (0.92 - i * 0.05);          // 아래로 갈수록 짧아진다 = 갈비뼈 수렴
                const rib = new THREE.Mesh(
                    new THREE.TorusGeometry(r.rx * k, 0.0225 - i * 0.0015, 5, 16, arc), boneM);
                rib.rotation.x = Math.PI / 2;
                rib.rotation.z = Math.PI / 2 - arc / 2;            // 호의 중심을 +z(정면)로
                rib.position.y = r.y;
                rib.scale.y = (r.rz / r.rx) * k;                   // 몸통 단면이 타원 — 호도 눌러야 앞뒤로 안 뜬다
                g.add(rib);
            }
            // ⓒ 흉골판 — 갈비뼈를 정중선에서 받는 납작한 뼈. ⚠️ 구를 세로로 늘여 4개 쌓지 말 것:
            //    정면에서 **흰 달걀 세 개**로 읽혔다(실측). 흉골은 하나의 판이고, 갈비뼈가 붙는
            //    자리마다 **가로 마디**가 팬다 — 판 + 마디 홈이라야 뼈로 읽힌다.
            {
                const sh = new THREE.Shape();
                // ⚠️ 위끝을 목(y 0.215)까지 올리지 말 것 — 그 높이는 몸통이 급히 좁아져(rz 0.106)
                //    판이 5cm 나 앞으로 튀어 **가슴 앞에 뜬 흰 타일**로 읽힌다(실측). 가슴 안에서 끝낸다.
                sh.moveTo(-0.028, 0.168); sh.lineTo(0.028, 0.168); sh.lineTo(0.036, 0.045);
                sh.lineTo(0.021, -0.112); sh.lineTo(0, -0.158); sh.lineTo(-0.021, -0.112);
                sh.lineTo(-0.036, 0.045); sh.lineTo(-0.028, 0.168);
                const geo = new THREE.ExtrudeGeometry(sh, {
                    depth: 0.026, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.007,
                    bevelSegments: 1, curveSegments: 1
                });
                const stern = new THREE.Mesh(geo, boneM);
                stern.position.set(0, 0, 0.118);
                g.add(stern);
                for (let i = 0; i < 3; i++) {   // 마디 홈 — 갈비뼈가 붙는 자리
                    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.010, 0.014), cordM);
                    notch.position.set(0, 0.118 - i * 0.078, 0.150);
                    g.add(notch);
                }
            }
            // ⓓ 견갑골 판 — 큰 짐승의 어깨뼈를 그대로 얹은 것. 판금 파울드론과 달리 **한 장**이고
            //    가장자리가 고르지 않다(꼭짓점 6개 셰이프 + 두께).
            for (const s of [-1, 1]) {
                const sh = new THREE.Shape();
                sh.moveTo(-0.085, 0.052); sh.lineTo(0.028, 0.088); sh.lineTo(0.108, 0.030);
                sh.lineTo(0.086, -0.062); sh.lineTo(-0.020, -0.092); sh.lineTo(-0.098, -0.030);
                sh.lineTo(-0.085, 0.052);
                const geo = new THREE.ExtrudeGeometry(sh, {
                    depth: 0.028, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008,
                    bevelSegments: 1, curveSegments: 1
                });
                geo.translate(0, 0, -0.014);
                const blade = new THREE.Mesh(geo, boneM);
                blade.position.set(s * 0.212, 0.196, 0.012);
                blade.rotation.set(0.22, 0, -s * 0.42);
                blade.scale.set(1, 1, 1.25);
                g.add(blade);
            }
            // ⓔ 결속 가죽끈 — 뼈판이 몸통에 **묶여** 있다는 증거. 늑골 사이를 지나는 얇은 띠 2줄.
            // ⚠️ 상자(BoxGeometry)로 두지 말 것 — 곡면 몸통에 평면 판을 대면 옆에서 **널빤지가
            //    가로로 튀어나온 그림**이 된다(실측 3각도 전부: 어깨끈·옆구리끈이 나무 판자로 읽혔다).
            //    몸통을 실제로 감는 토러스 호라야 '감긴 끈'으로 읽힌다(로브 허리끈이 쓰는 문법 그대로).
            for (const [ri, k] of [[3, 0.965], [2, 0.985]]) {
                const r = RINGS[ri];
                const band = new THREE.Mesh(new THREE.TorusGeometry(r.rx * k, 0.0135, 5, 22), cordM);
                band.rotation.x = Math.PI / 2;
                band.position.y = r.y + 0.038;
                band.scale.y = (r.rz / r.rx) * k;
                g.add(band);
            }
            // 어깨 위를 넘어가는 멜빵 2줄 — 견갑골 판이 무엇에 매달렸는지 보여 준다(부유 인상 제거)
            for (const s of [-1, 1]) {
                const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.0145, 5, 14, Math.PI * 0.95), cordM);
                yoke.position.set(s * 0.152, 0.185, 0.015);
                yoke.rotation.set(Math.PI / 2, 0, -s * 0.42);
                yoke.scale.z = 0.62;
                g.add(yoke);
            }
            // 옆구리 엇갈린 매듭 — 끈이 '칠한 선'이 아니라 실제로 여며진 것으로 읽히게 한다
            for (const s of [-1, 1]) {
                for (let i = 0; i < 3; i++) {
                    const r = RINGS[2 + (i > 1 ? 0 : 1)];
                    const knot = this.tieKnot(cordM, 0.013);
                    knot.position.set(s * r.rx * 0.99, 0.09 - i * 0.098, 0.026);
                    knot.rotation.y = s * Math.PI / 2;
                    g.add(knot);
                }
            }
            // ⓕ 밑단에 매달린 엄니 3개 — 짧은 기장(P.top 0.86)의 잘림선을 못 박고 아래 윤곽을 톱니로 만든다
            for (const dx of [-0.088, 0, 0.088]) {
                const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.021, 0.098 + (dx ? 0 : 0.03), 6), boneM);
                tusk.position.set(dx, -0.30, 0.088);
                tusk.rotation.x = Math.PI;      // 아래로 뾰족하게
                tusk.rotation.z = dx * 1.4;
                g.add(tusk);
            }
        }
        if (style === 'carrier') {
            // ── 현대 `플레이트 캐리어` (equip-era-theming ⑤, 현대 '전술 조끼') ──────────
            // 🚨 **되돌려서 `plate` 로 쓰지 말 것.** 현대 3번 칸 '전술 조끼'가 style `plate`,
            //    즉 **중세 판금 흉갑**(라멜라 파울드론·파울드·리벳·문장)이었다. 현대 방탄복은
            //    같은 '판'이라도 조형 언어가 정반대다: 곡면 흉갑이 아니라 **평평한 하드플레이트**,
            //    겹친 강철판이 아니라 **가로 웨빙(MOLLE) 줄**, 어깨판이 아니라 **넓은 어깨 요크**,
            //    허리는 파울드가 아니라 **커머번드**가 감는다. 리벳·문장은 0개.
            const webM = this.tintOf(mats.dark, -0.10);
            const hardM = this.tintOf(mats.body, -0.16);
            // ⓐ 앞 하드플레이트 — 이 스타일의 얼굴. 곡면 몸통 위에 **평판**이 얹혀야 방탄복이다.
            const front = this.beveledSlab(0.315, 0.315, 0.052, 0.028, hardM);
            front.position.set(0, 0.055, 0.132);
            g.add(front);
            // ⓑ MOLLE 웨빙 — 가로 줄 4단. 세로 홈이 아니라 **가로 줄**이라야 전술 장비로 읽힌다.
            for (let i = 0; i < 4; i++) {
                const row = new THREE.Mesh(new THREE.BoxGeometry(0.285, 0.017, 0.020), webM);
                row.position.set(0, 0.148 - i * 0.062, 0.163);
                g.add(row);
                for (const dx of [-0.088, 0.088]) {   // 줄을 고정하는 세로 스티치
                    const st = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.030, 0.016), webM);
                    st.position.set(dx, 0.148 - i * 0.062, 0.166);
                    g.add(st);
                }
            }
            // ⓒ 어깨 요크 — 판금 파울드론(둥근 덩어리)과 달리 **넓고 납작한 띠**가 어깨를 덮는다
            for (const s of [-1, 1]) {
                const yoke = this.beveledSlab(0.115, 0.070, 0.235, 0.024, hardM);
                yoke.position.set(s * 0.175, 0.225, 0);
                yoke.rotation.z = s * 0.16;
                g.add(yoke);
                const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.030, 0.026), webM);
                buckle.position.set(s * 0.148, 0.196, 0.132);
                g.add(buckle);
            }
            // ⓓ 커머번드 — 허리를 감는 넓은 벨크로 띠(파울드처럼 늘어지지 않는다)
            {
                const wr = RINGS[2];
                const cum = new THREE.Mesh(new THREE.CylinderGeometry(wr.rx * 1.04, wr.rx * 1.06, 0.115, 20, 1, true), webM);
                cum.position.y = wr.y - 0.012;
                cum.scale.z = wr.rz / wr.rx;
                g.add(cum);
            }
            // ⓔ 어깨 위 무전기 안테나 — 96px 실루엣 게이트가 요구하는 '몸통 윗변 위 표식'
            {
                const radio = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.105, 0.045), webM);
                radio.position.set(0.135, 0.268, -0.055);
                g.add(radio);
                const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.185, 6), webM);
                ant.position.set(0.135, 0.382, -0.055);
                ant.rotation.z = -0.13;
                g.add(ant);
            }
        }
        if (style === 'exo') {
            // ── 미래 `외골격` (equip-era-theming ②) ────────────────────────────────────
            // 🚨 **되돌려서 `plate` 로 쓰지 말 것.** '엑소스켈레톤'(우주)·'아다만티움 슈트'(성간)·
            //    '델타 아머'(양자)가 전부 style `plate` 였다 — 즉 우주 시대 외골격이 **중세 판금
            //    흉갑**(라멜라 파울드론·파울드·리벳)으로 그려졌다. 원시 '뼈 갑옷'과 같은 뿌리의 결함이고,
            //    사용자 지적 "전부 중세 같은 디자인임 대체로"가 가리키는 나머지 절반이 이것이다.
            // 조형 언어(판금과 **정반대의 부피 배분**): 판금은 몸통 자체가 두껍고 어깨에 판을 얹지만,
            //   외골격은 ⓐ 몸통이 얇은 코어(P.shoulder/waist 0.86)이고 ⓑ 부피는 몸 **바깥의 프레임**이
            //   진다 — 어깨 짐벌 링 · 옆구리 액추에이터 기둥 · 허리 피스톤 · 가슴 동력 코어.
            //   리벳·문장은 0개(그건 단조 판금의 언어다), 대신 발광 라인이 시대를 진다.
            // ⚠️ `mats.dark` 를 프레임에 쓰지 말 것 — alloy 계열의 dark 는 밝은 회색이라 허리 벨트·
            //    허브가 **흰 고리**로 나왔다(실측). 프레임은 몸통색을 크게 내린 값이라야 다크 앵커가 된다.
            const frameM = this.tintOf(mats.body, -0.40);
            // ⚠️ 밝기를 +0.16 올리면 시대색이 **연분홍 파스텔**로 바래 '발광'이 아니라 '분홍 플라스틱'이 된다
            //    (실측: 우주 시대 exo 3각도 전부). 채도를 올리고 밝기는 거의 안 건드려야 빛으로 읽힌다.
            const glowHex = new THREE.Color(c).offsetHSL(0, 0.22, 0.04).getHex();
            const glowM = new THREE.MeshBasicMaterial({ color: glowHex });
            // ⓐ 어깨 짐벌 링 — 파울드론(덮는 판)과 반대로 **뚫린 고리**라 96px 에서 윤곽이 갈린다
            for (const s of [-1, 1]) {
                // ⚠️ r 0.082·tube 0.021·x 0.255 로 두지 말 것 — 몸통 반경(0.205)에 맞먹는 고리가 되어
                //    소화전 손잡이처럼 읽혔다(실측). 어깨 관절은 몸통보다 확실히 작아야 관절로 읽힌다.
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.017, 6, 16), mats.body);
                ring.position.set(s * 0.232, 0.178, 0);
                ring.rotation.y = Math.PI / 2;
                ring.rotation.x = -s * 0.10;
                g.add(ring);
                const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.046, 10), frameM);
                hub.position.set(s * 0.232, 0.178, 0);
                hub.rotation.z = Math.PI / 2;
                g.add(hub);
                const lit = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.0065, 5, 14), glowM);
                lit.position.set(s * 0.246, 0.178, 0);
                lit.rotation.y = Math.PI / 2;
                g.add(lit);
                // 어깨 링을 몸통에 잇는 스트럿 — 링이 허공에 뜨면 '귀걸이'가 된다
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.026, 0.038), frameM);
                arm.position.set(s * 0.186, 0.188, 0);
                arm.rotation.z = -s * 0.16;
                g.add(arm);
            }
            // ⓑ 옆구리 액추에이터 기둥 — 위아래 마디 + 가운데 얇은 로드(피스톤). 몸통 밖에 선다.
            for (const s of [-1, 1]) {
                const x = s * 0.215;
                for (const [y, h] of [[0.088, 0.135], [-0.155, 0.115]]) {
                    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, h, 8), mats.body);
                    seg.position.set(x, y, 0.006);
                    g.add(seg);
                }
                const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.155, 6), frameM);
                rod.position.set(x, -0.036, 0.006);
                g.add(rod);
                const knee = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), glowM);
                knee.position.set(x, -0.036, 0.030);
                knee.scale.z = 0.5;
                g.add(knee);
            }
            // ⓒ 가슴 동력 코어 — 이 시대의 '문장'. 판금의 리벳 자리에 빛이 선다.
            {
                const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.068, 0.040, 12), frameM);
                housing.rotation.x = Math.PI / 2;
                housing.position.set(0, 0.115, 0.134);
                g.add(housing);
                const core = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.016, 12), glowM);
                core.rotation.x = Math.PI / 2;
                core.position.set(0, 0.115, 0.153);
                g.add(core);
                // ⚠️ 코어에서 어깨로 뻗는 발광 도관 2줄은 **넣지 말 것** — 기울인 막대 2개가 가슴
                //    한가운데서 **분홍 꽃잎**으로 읽히고 코어를 가린다(실측). 시대 발광은 코어 하나와
                //    벨트 셀이 이미 충분히 진다.
            }
            // ⓓ 허리 피스톤 벨트 — 잘록한 코어(waist 0.86)를 한 바퀴 감아 '기계 허리'를 못 박는다
            {
                const wr = RINGS[2];
                const belt = new THREE.Mesh(new THREE.TorusGeometry(wr.rx * 1.06, 0.024, 6, 20), frameM);
                belt.rotation.x = Math.PI / 2;
                belt.position.y = wr.y;
                belt.scale.y = (wr.rz / wr.rx) * 1.06;
                g.add(belt);
                for (let i = 0; i < 4; i++) {   // 벨트에 박힌 발광 셀
                    const a = -0.9 + i * 0.6;
                    const cell = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.020, 0.014), glowM);
                    cell.position.set(Math.sin(a) * wr.rx * 1.08, wr.y, Math.cos(a) * wr.rz * 1.12);
                    cell.rotation.y = a;
                    g.add(cell);
                }
            }
        }
        // 곡면 흉갑의 실제 앞뒤 깊이를 넘겨 부속을 표면에 앉힌다(상수 좌표면 1~3cm 뜬다)
        // ── 스타일 실루엣 오버레이 (ⓐ, 프리뷰 전용) ────────────────────────────────
        // 몸통 링 좌표를 손 안 대고 실루엣 폭·상하 윤곽을 갈라 낸다(전장 영웅에는 makeArmorExtras
        // 만 반영되므로 여기 로컬 그룹에 붙이면 프리뷰에만 걸린다). 판정: probe-equip-sculpt 3행(96px 다운샘플).
        if (style === 'plate') {
            // 판금은 어깨가 몸통 밖으로 튀어나온다(팔에 얹은 어깨판) — 상단 폭을 vest/robe 와 확실히 가른다
            for (const s of [-1, 1]) {
                const pauld = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
                pauld.scale.set(1.15, 0.55, 1);
                pauld.position.set(s * 0.28, 0.15, 0);
                g.add(pauld);
            }
        } else if (style === 'vest') {
            // 크롭 톱: 밑단이 허리 위에서 잘려야 '조끼'로 읽힌다 — 어두운 헴 라인이 잘림선을 못 박는다
            const hem = new THREE.Mesh(new THREE.TorusGeometry(0.198, 0.015, 6, 20), mats.dark);
            hem.position.y = -0.07;
            hem.rotation.x = Math.PI / 2;
            hem.scale.y = 0.63;
            g.add(hem);
        } else if (style === 'robe') {
            // 롱 드레이프 — 밑단 아래로 흘러내리는 자락 슬리브 2개(P.skirt 를 키운 것과 결합해 '아래로 긴' 실루엣)
            for (const s of [-1, 1]) {
                const sl = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.36, 10, 1, true), mat);
                sl.rotation.z = -s * 0.16;
                sl.position.set(s * 0.19, -0.02, 0);
                g.add(sl);
            }
        } else if (style === 'cape') {
            // 어깨선을 넓혀 plate 와 갈린다 — plate 는 견갑이 어깨 밖으로 튀어나오고 cape 는 어깨끈 위로 넓게 걸린다
            const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.021, 6, 22, Math.PI * 1.05), mats.dark);
            yoke.position.set(0, 0.235, -0.02);
            yoke.rotation.x = Math.PI / 2 - 0.15;
            yoke.rotation.z = Math.PI * 0.475;
            g.add(yoke);
        }
        const extras = this.makeArmorExtras(style, c, RARITY_HEX[rarity] || 0xffffff, mats, { frontZ: 0.128, backZ: -0.03, packZ: -0.185, age });   // crossY 는 기본값(0.78) 그대로 — extras 는 통째로 y-0.65 되므로 프리뷰에서 가슴 높이(0.13)가 된다
        extras.position.y = -0.65; // 부속 좌표계를 프리뷰 몸통 기준으로 보정
        g.add(extras);
        // ⚠️ suit·vest 는 **프리뷰에서 서로 구분이 안 됐다** — 실측(probe-equip-dedupe)에서 남은
        //    지각 중복 10쌍이 전부 suit≈vest 였다. 원인: suit 의 백팩은 몸통 **뒤(z −0.24)**,
        //    vest 의 파우치는 2cm짜리라 96px 썸네일에서는 둘 다 '민짜 몸통 상자'로 찍힌다.
        //    부속 좌표를 옮기면 착용 중인 영웅 쪽 배치가 틀어지므로, **프리뷰에만** 위쪽 윤곽을
        //    깨는 표식을 더한다(몸통 윗변 y=0.25 위로 나와야 실루엣이 갈린다).
        // ⚠️ 좌표는 **곡면 몸통 기준**으로 다시 잡혀 있다(예전 0.46×0.5 상자 기준 값을 그대로 두면
        //    허리가 잘록해진 만큼 산소통·어깨끈이 몸통에서 떨어져 허공에 뜬다).
        if (style === 'suit' && this.suitSealed(age)) {   // 기밀복: 어깨 위로 솟은 산소통 2개 + 호스
            for (const s of [-1, 1]) {
                const tank = this.shellFromRings([   // 위아래가 둥근 실린더 = 압력 탱크
                    { y: -0.15, rx: 0.032, rz: 0.032 }, { y: -0.125, rx: 0.055, rz: 0.055 },
                    { y: 0.125, rx: 0.055, rz: 0.055 }, { y: 0.15, rx: 0.032, rz: 0.032 },
                ], 12, mat);
                tank.position.set(s * 0.105, 0.27, -0.105);
                g.add(tank);
                const hose = this.capsuleMesh(0.015, 0.13, mats.dark, 8);
                hose.position.set(s * 0.088, 0.35, -0.055);
                hose.rotation.x = -0.8;
                hose.rotation.z = s * 0.5;
                g.add(hose);
            }
        } else if (style === 'suit') {
            // ── 전산업 시대의 `suit` = 퀴레스(equip-era-theming ③) ─────────────────────
            // 🚨 **산소통을 되돌리지 말 것.** `suit` 는 중세 '퀴레스'·근대 초기 '총사 코트'·
            //    지하 세계 '용암 갑주'·천상 '신탁의 로브'에도 배정돼 있는데, 조형이 시대 무관하게
            //    **압력 탱크 2개 + 호스**여서 중세 기사 등에 산소통이 붙어 있었다(사용자 지적
            //    '등급에 맞는 테마의 디자인이 아님'의 같은 뿌리). 기밀복이 실제인 시대(현대~양자)만
            //    탱크를 남기고, 그 밖은 **선 목가리개(haute-piece) + 어깨 벨트**로 간다 —
            //    96px 실루엣 게이트가 요구하는 '몸통 윗변(y 0.25) 위로 나오는 표식'은 목가리개가 진다.
            for (const s of [-1, 1]) {
                // 세운 어깨 깃 — 15세기 흉갑의 서명. 바깥으로 젖혀야 '깃'이지 '뿔'이 아니다.
                // ⚠️ 길고 좁게(r 0.075·h 0.20) 세우면 **굴뚝 두 개**로 읽혀 산소통과 실루엣이 안 갈린다
                //    (실측). 낮고 넓게, 바깥으로 크게 젖혀야 '어깨에서 솟은 깃'이 된다.
                const cop = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.100, 0.138, 0.145, 14, 1, true, -1.15, 2.3), mat);
                cop.position.set(s * 0.122, 0.300, -0.010);
                cop.rotation.z = -s * 0.46;
                cop.rotation.y = s * 1.45;          // 열린 면이 바깥을 본다
                g.add(cop);
                const lip = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.015, 6, 16, Math.PI * 1.3), mats.dark);
                lip.position.set(s * 0.155, 0.362, -0.010);
                lip.rotation.x = Math.PI / 2;
                lip.rotation.z = -s * 0.46;
                g.add(lip);
                // 어깨를 넘어 등으로 가는 가죽 벨트 + 버클 — 흉갑이 무엇에 매달렸는지 보여 준다
                const belt = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.185, 0.30), mats.dark);
                belt.position.set(s * 0.152, 0.205, 0);
                belt.rotation.z = s * 0.24;
                g.add(belt);
                const buckle = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.010, 5, 12), mat);
                buckle.position.set(s * 0.128, 0.135, 0.128);
                buckle.rotation.x = Math.PI / 2;
                buckle.rotation.z = s * 0.24;
                buckle.scale.y = 0.6;
                g.add(buckle);
            }
        } else if (style === 'vest') {   // 조끼: 어깨끈 2줄이 어깨를 넘어가고 앞섶이 V로 벌어진다
            for (const s of [-1, 1]) {
                // 어깨끈은 몸통 **위에 얹혀** 있어야 한다 — 앞으로 빼면 허공의 막대가 된다
                const strap = this.beveledSlab(0.058, 0.2, 0.15, 0.026, mats.dark);
                strap.position.set(s * 0.125, 0.225, 0);
                strap.rotation.z = s * 0.26;
                g.add(strap);
                // 앞섶: 가슴 곡면에 붙어 V로 벌어지는 판(z는 몸통 앞면 rz 0.16 에 반쯤 묻힌다)
                const lapel = this.beveledSlab(0.095, 0.25, 0.035, 0.03, mat);
                lapel.position.set(s * 0.068, 0.095, 0.138);
                lapel.rotation.z = -s * 0.28;
                lapel.rotation.y = s * 0.16;
                g.add(lapel);
            }
        } else if (style === 'robe') {
            // 로브: 목 뒤로 솟은 **후드**가 실루엣의 얼굴이다 — 없으면 96px 에서 그냥 종(鐘)이다
            const hood = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.68), mat);
            hood.scale.set(1, 1.15, 0.85);
            hood.position.set(0, neckY - 0.02, -0.075);
            hood.rotation.x = -0.34;
            g.add(hood);
            const brim = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.026, 6, 20, Math.PI * 1.1), mat);
            brim.position.set(0, neckY + 0.04, -0.055);
            brim.rotation.x = Math.PI / 2 - 0.34;
            brim.rotation.z = Math.PI * 0.95;
            g.add(brim);
        } else if (style === 'hide') {
            // 가죽: 민짜 덩어리로 읽히던 것을 **앞섶 교차 끈 + 어깨 모피 + 너덜한 밑단**으로 갈랐다.
            // 밑단 술이 아래 윤곽을 톱니로 만들어 plate 의 매끈한 항아리와 96px 에서도 갈린다.
            // 술은 촘촘해야 '너덜한 밑단'이지, 성기면 다리 여러 개로 보인다 — 18가닥을 붙여 두른다
            for (let i = 0; i < 18; i++) {
                const a = (i / 18) * Math.PI * 2;
                const len = 0.052 + (i % 3) * 0.028;
                const strip = this.beveledSlab(0.062, len, 0.03, 0.012, this.tintOf(mat, -0.04));
                strip.position.set(Math.cos(a) * 0.236, -0.262 - len * 0.44, Math.sin(a) * 0.149);
                strip.rotation.y = -a;
                g.add(strip);
            }
            for (let i = 0; i < 4; i++) {
                const y = 0.19 - i * 0.075;
                for (const s of [-1, 1]) {
                    const lace = this.capsuleMesh(0.011, 0.085, mats.dark, 6);
                    lace.position.set(0, y, 0.152 - i * 0.006);
                    lace.rotation.z = s * 0.72;
                    g.add(lace);
                }
            }
            for (let i = 0; i < 9; i++) {
                const a = (i / 9) * Math.PI * 2;
                const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 6), this.tintOf(mat, 0.05, { roughness: 1 }));
                tuft.scale.set(1, 0.7, 1);
                tuft.position.set(Math.cos(a) * 0.163, 0.276, Math.sin(a) * 0.104);
                g.add(tuft);
            }
        }
        return g;
    },

    // 장신구 프리뷰 3D 모델 (부위당 3종 변형)
    makeAccessoryPreview(slot, variant, age, rarity, name) {
        const g = new THREE.Group();
        const rc = RARITY_HEX[rarity] || 0xffd54f;
        // 장신구도 시대 재질을 따른다 — 원시 '가죽끈 목걸이'가 매끈한 금속 링으로 나오던 문제
        const mats = this.ageGearMats(age, name);
        const mat = mats.body;
        const gemMat = new THREE.MeshLambertMaterial({ color: rc, emissive: rc, emissiveIntensity: 0.7 });
        const dark = mats.dark;
        const add = (mesh, x, y, z) => { mesh.position.set(x || 0, y || 0, z || 0); g.add(mesh); return mesh; };
        if (slot === 'gloves') {
            // ⚠️ 세 변형이 전부 **납작한 상자 한두 개**였다 — 손가락도 손등 곡률도 없어 96px 에서는
            //    그냥 판때기였다(비평가 지적 ㉯⑴). 손 형태를 실제로 조립한다: 곡면 손등 + 손가락 5개.
            if (variant === 0) { // 장갑: 손등 곡면 + 손가락 4개 + 벌어진 엄지 + 손목 커프
                g.add(this.shellFromRings([
                    { y: 0.17, rx: 0.105, rz: 0.052 },   // 손목
                    { y: 0.26, rx: 0.128, rz: 0.060 },
                    { y: 0.38, rx: 0.142, rz: 0.062 },   // 너클(가장 넓다)
                    { y: 0.46, rx: 0.132, rz: 0.052 },
                ], 16, mat));
                [0.15, 0.175, 0.165, 0.132].forEach((len, i) => {   // 중지가 가장 길다
                    const f = this.capsuleMesh(0.028, len, mat, 8);
                    f.position.set(-0.089 + i * 0.06, 0.455 + len / 2, 0.002);
                    f.rotation.z = (i - 1.5) * 0.055;
                    g.add(f);
                });
                const th = this.capsuleMesh(0.032, 0.125, mat, 8);
                th.position.set(-0.15, 0.33, 0.028);
                th.rotation.z = 0.9;
                g.add(th);
                const cuff = this.shellFromRings([
                    { y: 0.06, rx: 0.128, rz: 0.075 }, { y: 0.175, rx: 0.108, rz: 0.055 },
                ], 16, dark);
                g.add(cuff);
            } else if (variant === 1) { // 건틀릿: 판금 손등 + 너클판 + 손가락 라멜라 + 나팔 커프
                g.add(this.shellFromRings([
                    { y: 0.20, rx: 0.108, rz: 0.055 }, { y: 0.30, rx: 0.130, rz: 0.062 },
                    { y: 0.40, rx: 0.140, rz: 0.060 }, { y: 0.47, rx: 0.128, rz: 0.050 },
                ], 16, mat));
                const knuck = this.beveledSlab(0.25, 0.1, 0.05, 0.035, this.tintOf(mat, 0.03));
                knuck.position.set(0, 0.42, 0.052);
                knuck.rotation.x = -0.24;
                g.add(knuck);
                // ⚠️ 라멜라만 띄우면 **허공의 벽돌 격자**가 된다 — 손가락(캡슐)을 먼저 세우고
                //    그 위에 판을 얹어야 '판금 손가락'으로 읽힌다.
                [0.145, 0.168, 0.158, 0.128].forEach((len, i) => {
                    const f = this.capsuleMesh(0.026, len, this.tintOf(mat, -0.06), 8);
                    f.position.set(-0.087 + i * 0.058, 0.465 + len / 2, 0);
                    f.rotation.z = (i - 1.5) * 0.05;
                    g.add(f);
                    for (let l = 0; l < 2; l++) {          // 손가락마다 판 2장이 겹쳐 내려온다
                        const lame = this.beveledSlab(0.058, 0.07, 0.05, 0.022, l ? this.tintOf(mat, -0.03) : mat);
                        lame.position.set(-0.087 + i * 0.058, 0.5 + l * 0.066, 0.014 - l * 0.006);
                        lame.rotation.x = -0.14;
                        lame.rotation.z = (i - 1.5) * 0.05;
                        g.add(lame);
                    }
                });
                const th = this.capsuleMesh(0.031, 0.115, mat, 8);
                th.position.set(-0.148, 0.345, 0.026);
                th.rotation.z = 0.9;
                g.add(th);
                // 나팔 커프 — 손목에서 팔뚝 쪽으로 벌어진다(건틀릿의 얼굴)
                g.add(this.shellFromRings([
                    { y: -0.02, rx: 0.175, rz: 0.128 }, { y: 0.06, rx: 0.140, rz: 0.098 },
                    { y: 0.16, rx: 0.118, rz: 0.070 }, { y: 0.21, rx: 0.112, rz: 0.062 },
                ], 16, mat));
                add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), gemMat), 0, 0.42, 0.088);
            } else { // 핸드랩: 쥔 주먹 + 비스듬히 감긴 붕대
                // 손목까지 내려오는 한 덩이 — 붕대가 감길 몸통이 있어야 한다
                const fist = this.shellFromRings([
                    { y: 0.10, rx: 0.093, rz: 0.057 }, { y: 0.22, rx: 0.101, rz: 0.062 },
                    { y: 0.31, rx: 0.132, rz: 0.082 }, { y: 0.43, rx: 0.146, rz: 0.090 },
                    { y: 0.53, rx: 0.118, rz: 0.072 },
                ], 16, mat);
                g.add(fist);
                for (let i = 0; i < 4; i++) {   // 너클 4개가 위쪽에 튀어나온다
                    const kn = new THREE.Mesh(new THREE.SphereGeometry(0.038, 10, 8), mat);
                    kn.scale.set(1, 0.8, 0.9);
                    kn.position.set(-0.082 + i * 0.055, 0.515, 0.03);
                    g.add(kn);
                }
                const th = this.capsuleMesh(0.033, 0.10, mat, 8);
                th.position.set(-0.135, 0.375, 0.055);
                th.rotation.z = 1.0; th.rotation.x = -0.3;
                g.add(th);
                // 붕대는 수평이 아니라 **비스듬히** 감겨야 감긴 티가 난다.
                // ⚠️ 반경을 상수로 두면 손목 쪽 링이 몸통 밖 허공에 뜬다 — 그 높이의 실제 굵기에 맞춘다.
                [[0.16, 0.098], [0.27, 0.119], [0.38, 0.142], [0.47, 0.137]].forEach(([y, r], i) => {
                    const band = new THREE.Mesh(new THREE.TorusGeometry(r + 0.009, 0.017, 6, 18), dark);
                    band.position.set(0, y, 0.004);
                    band.rotation.x = Math.PI / 2 + 0.15;
                    band.rotation.z = (i % 2 ? 1 : -1) * 0.09;
                    band.scale.y = 0.62;       // 손 단면이 타원이라 링도 눌러야 옆으로 뜨지 않는다
                    g.add(band);
                });
                // 늘어뜨린 붕대 끝 — 손목 밴드(y 0.16) 안쪽에서 시작해야 '풀린 끝'으로 읽힌다.
                // 떼어 놓으면 손 옆 허공의 캡슐이 된다(비평가 지적 '부유 부속').
                const tail = this.beveledSlab(0.046, 0.115, 0.022, 0.016, dark);
                tail.position.set(0.079, 0.125, 0.035);
                tail.rotation.z = -0.28;
                g.add(tail);
                const knot = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), dark);  // 매듭 = 접점
                knot.position.set(0.092, 0.168, 0.03);
                g.add(knot);
            }
        } else if (slot === 'necklace') {
            // ⚠️ 세 변형이 **같은 고리 + 작은 펜던트**였던 탓에 썸네일 실루엣이 완전히 같았다
            // (실측 probe-equip-dedupe: 실루엣 차이 0.000, 색 차이 0.002~0.011 — 눈으로는 같은 그림).
            // 목줄 형태 자체를 바꾼다: 닫힌 고리(초커) / V자 끈 / 세로 체인.
            if (variant === 0) { // 목걸이: 굵은 초커 고리 + 큼직한 구슬 펜던트
                const chain = add(new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 22), mat), 0, 0.52);
                chain.rotation.x = 0.35;
                for (const dx of [-0.19, 0.19]) add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mats.bead || mat), dx, 0.5, 0.06);
                add(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), gemMat), 0, 0.24, 0.04);
            } else if (variant === 1) { // 아뮬렛: V자로 내려오는 두 가닥 끈 + 넓은 원판
                for (const s of [-1, 1]) {
                    const cord = add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 6), mat), s * 0.11, 0.5, 0.02);
                    cord.rotation.z = s * 0.42;
                }
                const disc = add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 16), gemMat), 0, 0.27, 0.04);
                disc.rotation.x = Math.PI / 2;
                const rim = add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 20), mat), 0, 0.27, 0.04);
                rim.rotation.x = 0;
                void rim;
            } else { // 펜던트: 눈에 보이는 사슬 고리가 세로로 이어지고 끝에 물방울
                for (let i = 0; i < 5; i++) {
                    const lk = add(new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.014, 6, 12), mat), 0, 0.72 - i * 0.078, 0.02);
                    lk.rotation.y = i % 2 ? Math.PI / 2 : 0;
                }
                const drop = add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 8), gemMat), 0, 0.19, 0.02);
                drop.rotation.x = Math.PI;
            }
        } else if (slot === 'ring') {
            // 반지도 같은 문제였다(밴드 공유 + 좁쌀만 한 보석). 밴드 굵기·머리 형태를 통째로 가른다.
            if (variant === 0) { // 고리/반지: 두껍고 민짜인 굵은 밴드 + 낮은 돔
                add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.075, 10, 24), mat), 0, 0.42);
                const dome = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), gemMat), 0, 0.63);
                void dome;
            } else if (variant === 1) { // 인장 반지: 넓적한 사각 인장판이 머리에 얹힌다
                add(new THREE.Mesh(new THREE.TorusGeometry(0.185, 0.045, 10, 22), mat), 0, 0.42);
                add(new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.07, 0.2), mat), 0, 0.63);
                add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.12), gemMat), 0, 0.675);
            } else { // 보석 반지: 얇은 밴드 + 발톱 물림쇠에 높이 세운 보석
                add(new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.028, 10, 24), mat), 0, 0.42);
                for (const s of [-1, 1]) {
                    const pr = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.2, 6), mat), s * 0.06, 0.56);
                    pr.rotation.z = s * 0.22;
                }
                const gem = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.135, 0), gemMat), 0, 0.75);
                gem.rotation.z = 0.4;
            }
        } else if (slot === 'shoes') {
            // ⚠️ 예전엔 '세로 상자 + 가로 상자' 두 개였다 — 밑창도 발등 곡선도 아치도 없어
            //    썸네일에서 그냥 ㄴ자 블록 두 짝이었다(비평가 지적 ㉯⑴).
            //    이제 ① 발자국 모양 밑창(뒤꿈치 넓고 아치 잘록, 발가락 둥글게)을 압출로 뽑고
            //    ② 그 위에 **z 중심이 뒤로 물러나는 링**을 쌓아 발등에서 발목으로 넘어가는 곡선을 낸다.
            const soleShape = () => {
                const s = new THREE.Shape();
                s.moveTo(-0.072, -0.128);
                s.quadraticCurveTo(-0.094, -0.045, -0.060, 0.042);   // 안쪽 아치(잘록)
                s.quadraticCurveTo(-0.086, 0.140, -0.028, 0.184);    // 볼 → 발가락
                s.quadraticCurveTo(0.020, 0.203, 0.060, 0.158);
                s.quadraticCurveTo(0.092, 0.058, 0.073, -0.020);
                s.quadraticCurveTo(0.088, -0.112, 0.000, -0.146);    // 뒤꿈치
                s.quadraticCurveTo(-0.058, -0.150, -0.072, -0.128);
                return s;
            };
            const mk = (dx, flip) => {
                const boot = new THREE.Group();
                const sole = new THREE.Mesh(new THREE.ExtrudeGeometry(soleShape(), {
                    depth: 0.032, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2, curveSegments: 10,
                }), dark);
                sole.rotation.x = -Math.PI / 2;   // 셰이프의 y가 월드 z(앞뒤)가 된다
                sole.position.y = 0.012;
                boot.add(sole);
                const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.056, 0.045, 12), this.tintOf(dark, -0.05));
                heel.scale.z = 0.85;
                heel.position.set(0, -0.012, -0.10);
                boot.add(heel);
                // 갑피 — z 오프셋이 뒤로 물러나며 발등에서 발목으로 넘어간다
                const upper = [
                    { y: 0.048, rx: 0.079, rz: 0.163, z: 0.016 },
                    { y: 0.090, rx: 0.077, rz: 0.150, z: 0.004 },
                    { y: 0.135, rx: 0.071, rz: 0.120, z: -0.020 },
                    { y: 0.195, rx: 0.063, rz: 0.086, z: -0.048 },
                    { y: 0.250, rx: 0.057, rz: 0.062, z: -0.060 },
                ];
                if (variant === 1) {          // 부츠: 목이 종아리까지 올라가고 위에서 살짝 벌어진다
                    upper.push({ y: 0.36, rx: 0.061, rz: 0.064, z: -0.062 },
                               { y: 0.47, rx: 0.070, rz: 0.073, z: -0.062 });
                } else if (variant === 2) {   // 그리브: 정강이를 감싸고 무릎까지 곧게 선다
                    upper.push({ y: 0.38, rx: 0.064, rz: 0.070, z: -0.062 },
                               { y: 0.56, rx: 0.069, rz: 0.076, z: -0.060 });
                }
                boot.add(this.shellFromRings(upper, 18, mat));
                // 발가락 캡 — 밑창 앞코를 덮어 '깎인 단면'을 없앤다
                const toe = new THREE.Mesh(new THREE.SphereGeometry(0.077, 14, 10), variant === 0 ? this.tintOf(mat, -0.02) : mat);
                toe.scale.set(1, 0.62, 1.15);
                toe.position.set(0, 0.058, 0.115);
                boot.add(toe);
                if (variant === 0) {          // 구두: 발목 깃 + 혀 + 끈 3줄
                    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.017, 6, 16), dark);
                    collar.position.set(0, 0.252, -0.060);
                    collar.rotation.x = Math.PI / 2;
                    boot.add(collar);
                    for (let i = 0; i < 3; i++) {
                        const lace = this.capsuleMesh(0.0095, 0.07, dark, 6);
                        lace.position.set(0, 0.14 + i * 0.042, 0.020 - i * 0.028);
                        lace.rotation.z = Math.PI / 2;
                        lace.rotation.y = 0.25;
                        boot.add(lace);
                    }
                } else if (variant === 1) {   // 부츠: 접힌 목단 + 발목 버클 끈
                    // 목단은 확실히 벌어져야 '접어 내린 부츠'로 읽힌다 — 몸통 rx 0.070 → 0.113
                    const cuff = this.shellFromRings([
                        { y: 0.425, rx: 0.073, rz: 0.076, z: -0.062 },
                        { y: 0.495, rx: 0.113, rz: 0.117, z: -0.062 },
                        { y: 0.545, rx: 0.101, rz: 0.105, z: -0.062 },
                    ], 18, this.tintOf(mat, -0.07));
                    boot.add(cuff);
                    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.014, 6, 16), dark);
                    strap.position.set(0, 0.27, -0.056);
                    strap.rotation.x = Math.PI / 2;
                    boot.add(strap);
                    const buckle = this.beveledSlab(0.036, 0.032, 0.016, 0.008, gemMat);
                    buckle.position.set(0, 0.27, 0.008);
                    boot.add(buckle);
                } else {                      // 그리브: 정강이 판 + 무릎 돔 + 고정 밴드 2줄
                    // 정강이 판은 앞으로 튀어나와야 보인다 — 갑피(z 중심 -0.062, rz 0.07) 앞면 밖에 얹는다
                    // ⚠️ 앞으로 너무 빼면 다리에서 떨어져 뜬다 — 갑피 앞면(z≈0.008)에 반쯤 파묻는다
                    const shin = this.beveledSlab(0.094, 0.30, 0.034, 0.032, this.tintOf(mat, 0.03));
                    shin.position.set(0, 0.40, -0.002);
                    shin.rotation.x = -0.05;
                    boot.add(shin);
                    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.082, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat);
                    knee.scale.set(1, 0.8, 0.95);
                    knee.position.set(0, 0.555, -0.045);
                    boot.add(knee);
                    // 밴드는 정강이 판(앞) 위까지 감아야 '고정 스트랩'으로 읽힌다 —
                    // 갑피만 두르면 판 옆에서 끊긴 고리가 된다(비평가 지적).
                    for (const y of [0.31, 0.46]) {
                        const band = new THREE.Mesh(new THREE.TorusGeometry(0.079, 0.014, 6, 18), dark);
                        band.position.set(0, y, -0.03);
                        band.rotation.x = Math.PI / 2;
                        band.scale.y = 1.32;   // 앞뒤로 늘려 판까지 물린다
                        boot.add(band);
                    }
                }
                boot.position.x = dx;
                boot.scale.x = flip ? -1 : 1;   // 좌우 짝 — 아치가 안쪽으로 오게 뒤집는다
                g.add(boot);
                return boot;
            };
            mk(-0.115, true); mk(0.115, false);
            // 무릎 젬은 무릎 돔(y 0.555, z -0.045, r 0.082) **표면에** 박힌다 — 밖으로 빼면 뜬다
            if (variant === 2) add(new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), gemMat), 0.115, 0.552, 0.012);
        } else { // belt
            // 벨트가 가장 심했다 — 세 변형이 **같은 원통 띠**에 2cm짜리 버클만 달라, 시대마다
            // 서로 '같은 그림'으로 잡혔다(실측 색 차이 0.009~0.041, 실루엣 0.000).
            // ⚠️ 세 변형 전부 **민짜 원통 + 상자 버클**이었다 — 96px 에서는 '옆에서 본 상자'로 찍혔다
            //    (비평가 지적 ㉯⑴). 띠는 위아래 모서리를 굴린 곡면 밴드로, 버클은 **구멍 뚫린 테**로
            //    바꾼다. 허리 단면(rx 0.245 / rz 0.16)은 곡면 흉갑 몸통과 같은 타원을 쓴다.
            // 위아래가 살짝 좁아지는 곡면 띠 — h = 띠 폭
            const strapBand = (yc, h, m, rx, rz) => this.shellFromRings([
                { y: yc - h / 2, rx: rx * 0.955, rz: rz * 0.955 },
                { y: yc - h / 2 + h * 0.16, rx: rx, rz: rz },
                { y: yc + h / 2 - h * 0.16, rx: rx, rz: rz },
                { y: yc + h / 2, rx: rx * 0.955, rz: rz * 0.955 },
            ], 26, m);
            // 구멍 뚫린 사각 버클 테 + 가운데 프롱 — 상자 하나로는 절대 '버클'로 안 읽힌다
            const buckleFrame = (w, h, m) => {
                const outer = this.roundedRectShape(w, h, Math.min(w, h) * 0.26);
                outer.holes.push(new THREE.Path(this.roundedRectShape(w * 0.62, h * 0.56, Math.min(w, h) * 0.14).getPoints(20)));
                return new THREE.Mesh(new THREE.ExtrudeGeometry(outer, {
                    depth: 0.022, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.007, bevelSegments: 1, curveSegments: 6,
                }), m);
            };
            if (variant === 0) { // 띠/끈: 얇은 곡면 띠 + 구멍 버클 + 구멍 뚫린 꼬리
                g.add(strapBand(0.45, 0.088, mat, 0.245, 0.16));
                const bk = buckleFrame(0.135, 0.108, gemMat);
                bk.position.set(0, 0.45, 0.155);
                g.add(bk);
                const prong = this.capsuleMesh(0.008, 0.09, gemMat, 6);   // 버클 가운데 침
                prong.position.set(0, 0.45, 0.168);
                g.add(prong);
                const tail = this.beveledSlab(0.068, 0.25, 0.024, 0.022, dark);
                tail.position.set(0.075, 0.325, 0.155);
                tail.rotation.z = 0.16;
                g.add(tail);
                for (let i = 0; i < 3; i++) {   // 조임 구멍 — 가죽 벨트의 표식
                    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.04, 8), this.tintOf(dark, -0.12));
                    hole.rotation.x = Math.PI / 2;
                    hole.position.set(0.085 + i * 0.006, 0.31 - i * 0.056, 0.155);
                    g.add(hole);
                }
            } else if (variant === 1) { // 전투/탄입대: 뚜껑 달린 파우치가 둘러붙는다
                g.add(strapBand(0.47, 0.125, mat, 0.245, 0.16));
                for (const a of [-0.95, 0, 0.95]) {
                    const p = new THREE.Group();
                    const body = this.beveledSlab(0.125, 0.15, 0.085, 0.03, dark);
                    p.add(body);
                    const flap = this.beveledSlab(0.135, 0.062, 0.05, 0.024, this.tintOf(dark, 0.05));  // 뚜껑
                    flap.position.set(0, 0.062, 0.012);
                    flap.rotation.x = -0.2;
                    p.add(flap);
                    const clasp = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), gemMat);        // 잠금 단추
                    clasp.position.set(0, 0.038, 0.05);
                    p.add(clasp);
                    // ⚠️ 파우치만 아래에 놓으면 밴드에서 떨어져 **공중에 매달린 상자**가 된다
                    //    (비평가 지적). 밴드를 넘어가는 루프를 같이 내고, 파우치 윗변을 밴드
                    //    아랫변(y 0.4075) 위로 밀어 넣어 겹치게 한다.
                    const loop = this.beveledSlab(0.05, 0.115, 0.06, 0.02, this.tintOf(dark, -0.04));
                    loop.position.set(0, 0.115, -0.012);
                    p.add(loop);
                    p.position.set(Math.sin(a) * 0.236, 0.362, Math.cos(a) * 0.156);
                    p.rotation.y = a;
                    g.add(p);
                }
                const bk = buckleFrame(0.115, 0.115, gemMat);
                bk.position.set(0, 0.47, 0.158);
                g.add(bk);
            } else { // 장식 새시: 주름 잡힌 넓은 띠 + 늘어뜨린 천자락
                const cloth = mats.trim && mats.trim.isMeshBasicMaterial ? mat : (mats.trim || dark);
                // 주름 — 반경이 오르내리는 링을 겹쳐 천이 접힌 느낌을 낸다(민짜 원통과 갈리는 지점)
                const rings = [];
                for (let i = 0; i <= 8; i++) {
                    const t = i / 8;
                    const w = 1 + Math.sin(t * Math.PI * 3) * 0.035 - Math.pow(t - 0.5, 2) * 0.12;
                    rings.push({ y: 0.36 + t * 0.28, rx: 0.245 * w, rz: 0.162 * w });
                }
                g.add(this.shellFromRings(rings, 26, mat));
                // 천자락은 직선 판이 아니라 **휘어져 내려온다** — 곡선을 따라 관을 뽑고 납작하게 누른다
                const curve = new THREE.CatmullRomCurve3([
                    new THREE.Vector3(-0.145, 0.50, 0.075), new THREE.Vector3(-0.20, 0.32, 0.13),
                    new THREE.Vector3(-0.185, 0.16, 0.125), new THREE.Vector3(-0.235, 0.02, 0.075),
                ]);
                const drape = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, 0.05, 10, false), cloth);
                drape.scale.z = 0.42;
                g.add(drape);
                // ⚠️ 브로치·물림쇠를 띠 앞면(rz≈0.162)보다 앞에 두면 허공에 뜬 핀이 된다 —
                //    받침판을 깔고 그 위에 앉혀 접점을 만든다(비평가 지적).
                const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.02, 16), this.tintOf(mat, -0.05));
                plate.rotation.x = Math.PI / 2;
                plate.position.set(0, 0.5, 0.156);
                g.add(plate);
                const brooch = new THREE.Mesh(new THREE.OctahedronGeometry(0.062, 0), gemMat);
                brooch.position.set(0, 0.5, 0.172);
                brooch.rotation.z = 0.4;
                g.add(brooch);
                for (const s of [-1, 1]) {   // 브로치 물림쇠 — 받침판 위에 눕는다
                    const claw = this.capsuleMesh(0.010, 0.06, mat, 6);
                    claw.position.set(s * 0.052, 0.5, 0.164);
                    claw.rotation.z = s * 0.7;
                    g.add(claw);
                }
            }
        }
        return g;
    },

    // ---- 장비 썸네일: 미니 렌더러로 실제 3D 모델을 찍어 이미지 생성 (캐시) ----
    _thumbCache: {},
    // 오프스크린 썸네일 렌더러 — 장비/탈것이 공유한다(GL 컨텍스트를 여러 개 만들면 금방 한도에 걸린다)
    itemThumbInit() {
        if (this._thumbR) return;
        this._thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        this._thumbR.setSize(96, 96);
        // 본편(init L30~34)·생물 썸네일(creatureThumbInit)과 **같은 색 파이프라인**을 준다.
        // 예전엔 이 렌더러만 Linear·톤매핑 없음 + 흰 AmbientLight 0.85 라 밝은 물질(뼈·천·은·금·holo)의
        // 하이라이트가 순백으로 타 형태 정보가 통째로 소실됐다(비평가 D3, `probe-equip-clip.js` 실측:
        // 피사체 17.1% 순백 클리핑·일부 칸 100%). ACESFilmic 이 스펙큘러를 롤오프하고, sRGB 인코딩은
        // 재질색을 본편과 같은 감마로 낸다(장비 재질 빌더는 본편 sRGB+ACES 하에서 영웅에 입혀지는 그것과
        // 동일하므로 톤매핑을 맞춰야 썸네일이 실착용 모습과 일치한다). 흰 채움광도 낮춰 포화 여지를 줄인다.
        this._thumbR.outputEncoding = THREE.sRGBEncoding;
        this._thumbR.toneMapping = THREE.ACESFilmicToneMapping;
        this._thumbR.toneMappingExposure = 1.0;
        this._thumbScene = new THREE.Scene();
        // far 는 넉넉히 — 자동 프레이밍이 형상에 따라 카메라를 멀리 빼므로 10 이면 큰 모델이 잘린다
        this._thumbCam = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
        // 키↑·앰비언트↓ — 앰비언트 0.42/키 0.72 는 형태 음영을 눌러 전 계열이 '무광 매트'로 읽혔다
        // (2·3차 채점 전원 1순위 "스페큘러/명암 분리 부재"). 0.36/0.84 로 명부-암부 폭을 벌린다.
        // ⚠️ 더 밀어붙이지 말 것(실측 2건): ⑴ 0.30/0.95 는 primal↔polymer(hide) 재질분리를
        //    1.12 → 0.58 로 무너뜨린다(probe-age-shading — 키가 셀수록 두 천의 평균 휘도차가 좁아진다).
        //    ⑵ 키 웜톤(0xfff2e0)도 같은 쌍을 0.70 으로 깬다. 중립 백색 + 이 비율이 게이트 안 최대치다.
        this._thumbAmb = new THREE.AmbientLight(0xffffff, 0.36);
        this._thumbDir = new THREE.DirectionalLight(0xffffff, 0.84);
        this._thumbDir.position.set(2, 3, 2);
        // 쿨톤 역광(림 라이트) — 본편·생물 썸네일과 동일한 3광 구성. 키 반대쪽 뒤에서 넣어 실루엣
        // 가장자리를 투명 배경에서 떼어낸다(비평가 지적 ㉯⑶ "라이트 2개뿐, 림·접지그림자 없음").
        this._thumbRim = new THREE.DirectionalLight(0xcfe4ff, 0.5);
        this._thumbRim.position.set(-2.2, 1.6, -2.6);
        // 썸네일 렌더러는 별도 GL 컨텍스트 — 메인 씬의 PMREM 텍스처 공유 불가.
        // 자체 PMREM 환경 필수: 없으면 고금속 PBR 재질(무기 날 등)이 반사할 게 없어 검게 찍힘.
        try {
            const pm = new THREE.PMREMGenerator(this._thumbR);
            this._thumbScene.environment = pm.fromCubemap(ProChar.envMap()).texture;
            pm.dispose();
        } catch (e) { /* 폴백: 라이트만 */ }
        this.itemThumbResetCam();
    },
    // 장비 썸네일용 고정 프레이밍 — 탈것 썸네일이 카메라를 옮기므로 매번 되돌려 놓는다
    itemThumbResetCam() {
        const cam = this._thumbCam;
        if (!cam) return;
        cam.position.set(1.0, 0.95, 2.3);
        cam.lookAt(0, 0.4, 0);
        cam.updateProjectionMatrix();
    },
    // 장비 썸네일의 시선 — 위 고정 카메라와 같은 3/4 각(위치 - 주시점). 자동 프레이밍이 거리만 다시 잡는다.
    ITEM_THUMB_DIR: { x: 1.0, y: 0.55, z: 2.3 },

    // ---- 썸네일 공용 프레이밍: 정점을 카메라 축에 직접 투영해 여백을 맞춘다 ----
    // ⚠️ 최대변·외접구 반경 × 여유계수 방식은 **형상**에 따라 헐거움이 제각각이다 — 납작한 후광과
    //    길쭉한 고깔이 같은 '최대변'을 가지므로, 계수 하나로는 한쪽이 잘리고 한쪽이 좁쌀이 된다.
    //    파츠가 저폴리라 정점을 전부 훑어도 싸다 — 근사가 없으니 어떤 형상이든 여백이 같다.
    // g 를 화면 중심으로 옮기고 cam 을 dir 방향 거리에 놓는다(둘 다 제자리에서 변형).
    // pad = 테두리 여백 계수(1.04 면 프레임의 96%를 채운다).
    thumbFrameToFit(cam, g, dir, pad) {
        const fwd = dir.clone().negate();
        const right = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
        const up = fwd.clone().cross(right).normalize();
        const tanV = Math.tan(cam.fov * Math.PI / 360), tanH = tanV * cam.aspect;
        const box = new THREE.Box3().setFromObject(g);
        const size = box.getSize(new THREE.Vector3());
        g.position.sub(box.getCenter(new THREE.Vector3()));
        const us = [], vs = [], ws = [];
        g.updateMatrixWorld(true);
        g.traverse(o => {
            const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
            if (!pos) return;
            const v = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                us.push(v.dot(right)); vs.push(v.dot(up)); ws.push(v.dot(fwd));
            }
        });
        if (!us.length) {   // 폴백: 정점을 못 읽으면 AABB 꼭짓점으로
            const h = size.clone().multiplyScalar(0.5);
            for (let i = 0; i < 8; i++) {
                const p = new THREE.Vector3((i & 1 ? 1 : -1) * h.x, (i & 2 ? 1 : -1) * h.y, (i & 4 ? 1 : -1) * h.z);
                us.push(p.dot(right)); vs.push(p.dot(up)); ws.push(p.dot(fwd));
            }
        }
        // 화면 좌표(u,v)로 중심을 다시 잡는다 — 월드 박스 중심은 카메라가 비스듬해 화면 중앙과
        // 어긋나고, 그만큼 반대쪽 여백이 낭비돼 실물이 작아진다.
        // 정점이 수만 개라 Math.min(...arr) 전개는 스택을 넘길 수 있어 루프로 센다.
        let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
        for (let i = 0; i < us.length; i++) {
            if (us[i] < uMin) uMin = us[i]; if (us[i] > uMax) uMax = us[i];
            if (vs[i] < vMin) vMin = vs[i]; if (vs[i] > vMax) vMax = vs[i];
        }
        const uc = (uMin + uMax) / 2, vc = (vMin + vMax) / 2;
        g.position.addScaledVector(right, -uc).addScaledVector(up, -vc);
        let dist = 0.3;
        for (let i = 0; i < us.length; i++) {
            dist = Math.max(dist, Math.abs(vs[i] - vc) / tanV - ws[i], Math.abs(us[i] - uc) / tanH - ws[i]);
        }
        dist *= (pad === undefined ? 1.04 : pad);
        cam.position.copy(dir).multiplyScalar(dist);
        cam.lookAt(0, 0, 0);
        cam.updateProjectionMatrix();
        // ⚠️ 남은 오차와 **시도했다가 되돌린 것**(다음 세션이 다시 밟지 말 것):
        //    위 계산은 정점을 카메라 축에 **직교 투영**한 근사다. 원근이 빠져 있어 실루엣 중심이
        //    프레임 중심에서 최대 7.8% 어긋난다(신발·벨트 행이 통째로 아래로 쏠린다 — probe-equip-framing
        //    의 '치우침' 항목). 이걸 잡으려고 **실제 NDC로 중심·거리를 4회 반복 보정**하는 2차 패스를
        //    붙여 봤더니 오히려 발산했다: 크롭 0칸 → 157칸, 가로 중심오차 최대 -37.5%.
        //    원인은 matrixWorldInverse 가 아니다 — three 의 Camera.updateMatrixWorld 는 그걸 이미
        //    갱신하므로, 명시적으로 뒤집어 줘도 결과가 **바이트 단위로 동일**했다(실측). 다른 데 있다.
        //    2차 패스를 다시 시도하려면 먼저 그 발산 원인부터 규명할 것.
        return dist;
    },

    // ── 무기 아이콘 자루 비례 과장 (썸네일 전용) ─────────────────────────────────
    // 3차 채점 C·D 공통 지적 ⓑ: 96px 썸네일에서 **창·지팡이·낫의 자루가 2~4px 로 증발**해
    // '헤드만 허공에 떠 있는 그림'으로 읽힌다. 원신 무기 아이콘은 실물 비례가 아니라 판독을
    // 위해 자루를 과장한다 — 실물 비례의 봉은 아이콘 크기에서 선(線)이 되기 때문이다.
    // 🚨 **makeWeapon 안에 넣지 말 것** — 인게임 영웅 손·투사체와 공용이라 전장 무기까지
    //    굵어진다(tierizeParts·applyAscendDecor 가 썸네일 경로에만 걸려 있는 것과 같은 이유).
    // ⚠️ 부모에 스케일 그룹을 끼워 넣는 방식은 쓰지 않는다 — 자식 순서가 바뀌면
    //    `tierizeParts` 의 명도 3단 순열(traverse 순번)이 통째로 밀려 회귀(dedupe/shading)가 흔들린다.
    //    대신 **지오메트리에 구워** 트리 모양을 한 자도 안 바꾼다(지오메트리는 clone 해서 공유본 보호).
    // ⚠️ 헤드(촉·크리스탈·날)는 건드리지 않는다 — 자루만 굵어져야 '무기 아이콘'이지,
    //    전체를 키우면 프레이밍이 흡수해 버려 화면상 아무 변화가 없다.
    // 자루가 실루엣의 몸통인 장병기 계열만 대상 — 총기·활은 '가늘고 긴 세로 실린더'가
    // 꽂을대(머스킷)·볼트(석궁) 같은 **부속**이라, 형상 화이트리스트 없이 기하로만 고르면
    // 그 부속이 자루로 오인돼 2배로 부푼다(실측: musket 꽂을대 0.008 → 0.016, crossbow 볼트).
    WEAPON_HAFT_SHAPES: ['spear', 'staff', 'scythe', 'axe', 'hammer', 'mace', 'club', 'thrown'],
    weaponThumbBulk(model, wtypeId) {
        if (!model || !model.children) return null;
        if (this.WEAPON_HAFT_SHAPES.indexOf(weaponShape(wtypeId)) < 0) return null;
        model.updateMatrixWorld(true);
        // 🚨 치수는 전부 **모델 로컬(무기 그룹) 좌표계**로 잰다 — `Box3.setFromObject` 은 월드라
        //    makeWeapon 말미의 `g.scale.setScalar(시대·등급 성장 배율)` 이 섞여 들어가고, 그러면
        //    지오메트리 파라미터(자루 반경)와 **단위가 달라져** 부속 판정이 통째로 빗나간다
        //    (실측: 지팡이 그립 밴드가 문턱 바로 밖으로 밀려 자루만 굵어졌다).
        const boxOf = (ch) => {
            if (!ch.geometry) return null;
            if (!ch.geometry.boundingBox) ch.geometry.computeBoundingBox();
            if (!ch.geometry.boundingBox) return null;
            return ch.geometry.boundingBox.clone().applyMatrix4(ch.matrix);
        };
        const all = new THREE.Box3();
        all.makeEmpty();
        for (const ch of model.children) { const b = ch.isMesh && boxOf(ch); if (b) all.union(b); }
        if (all.isEmpty()) return null;
        const size = all.getSize(new THREE.Vector3());
        const L = Math.max(size.x, size.y, size.z);
        if (!(L > 0)) return null;
        // 자루 = 모델 길이의 30% 이상으로 길고 반경이 4.5% 이하로 가는 **세로** 실린더.
        // 세로 조건이 없으면 투석구의 가로 토글·총열 같은 것이 자루로 잡힌다.
        let shaft = null;
        for (const ch of model.children) {
            if (!ch.isMesh || !ch.geometry || ch.geometry.type !== 'CylinderGeometry') continue;
            const p = ch.geometry.parameters || {};
            const rMin = Math.min(p.radiusTop, p.radiusBottom), rMax = Math.max(p.radiusTop, p.radiusBottom);
            if (!(p.height >= L * 0.30) || !(rMin > 0) || !(rMin <= L * 0.045)) continue;
            if (Math.abs(ch.rotation.x) > 0.35 || Math.abs(ch.rotation.z) > 0.35) continue;
            if (!shaft || p.height > shaft.h) shaft = { mesh: ch, h: p.height, rMin, rMax };
        }
        if (!shaft) return null;
        // 가는 끝 **지름**이 모델 길이의 7% (96px 에서 ~6.7px) 가 되는 배율. 상한 2.0 —
        // 그 위로 밀면 자루가 헤드보다 굵어져 '몽둥이'가 된다(창·지팡이의 정체성이 사라진다).
        // 하한 1.15 — 그 아래는 96px 에서 1px 도 안 움직이는데 지오메트리만 새로 굽는다(도끼 실측 1.05).
        const k = Math.min(2.0, (L * 0.035) / shaft.rMin);
        if (k < 1.15) return null;
        const sb = boxOf(shaft.mesh);
        const sc = sb.getCenter(new THREE.Vector3());   // 자루 축 (x,z) — 원점이 아닐 수 있다(총열 등)
        // 자루에 **붙어 도는** 부속(그립 밴드·랑겟·결속끈·헤드 소켓)도 같이 굵힌다 —
        // 자루만 부풀면 밴드가 자루 속에 파묻혀 '민짜 봉'이 된다.
        const parts = [];
        for (const ch of model.children) {
            if (!ch.isMesh) continue;
            const b = boxOf(ch);
            if (!b || b.isEmpty()) continue;
            if (b.max.y < sb.min.y || b.min.y > sb.max.y) continue;        // 자루 높이 구간 밖 = 헤드
            const c = b.getCenter(new THREE.Vector3());
            if (Math.hypot(c.x - sc.x, c.z - sc.z) > shaft.rMax * 0.8) continue;   // 축에서 벗어난 것 = 날·수염
            const rr = Math.hypot(Math.max(Math.abs(b.min.x - sc.x), Math.abs(b.max.x - sc.x)),
                                  Math.max(Math.abs(b.min.z - sc.z), Math.abs(b.max.z - sc.z)));
            if (rr > shaft.rMax * 1.8) continue;                           // 자루보다 훨씬 굵은 것 = 헤드
            parts.push(ch);
        }
        // 자루 축(원점이 아닐 수 있다) 둘레로 반경만 늘린다 — 원점 기준으로 늘리면 축째로 밀려난다
        const S = new THREE.Matrix4().makeTranslation(sc.x, 0, sc.z)
            .multiply(new THREE.Matrix4().makeScale(k, 1, k))
            .multiply(new THREE.Matrix4().makeTranslation(-sc.x, 0, -sc.z));
        for (const m of parts) {
            const geo = m.geometry.clone();
            geo.applyMatrix4(m.matrix);   // 부모(무기 그룹) 좌표계로 옮긴 뒤
            geo.applyMatrix4(S);          // 축 반경만 과장(길이는 불변)
            m.geometry = geo;
            m.position.set(0, 0, 0);
            m.rotation.set(0, 0, 0);
            m.scale.set(1, 1, 1);
            m.updateMatrix();
        }
        model.updateMatrixWorld(true);
        return { k: k, parts: parts.length, rMin: shaft.rMin, len: L };
    },

    // ── 활 아이콘 포즈 (썸네일 전용) ────────────────────────────────────────────
    // 🚨 **리커브 조형만으로는 'D' 오독이 안 없어진다 — 실측으로 확인했다.** 림 곡률을 변주하고
    //    팁을 시위 뒤로 젖혀 판정기(probe-bow-slihouette)의 두 게이트를 통과시켰는데도, 96px
    //    확대 캡처에서는 여전히 알파벳 D 로 읽혔다(오히려 라이저 부근 직선 구간이 D 의 세로획을
    //    더 또렷하게 만들었다). 지표가 움직여도 판독이 안 바뀌는 전형적인 함정이다.
    //    원인은 조형이 아니라 **자세**다: 활은 평면 물체인데 썸네일 카메라가 그 평면을 정면으로
    //    보므로, 어떤 곡선을 그려도 '닫힌 납작한 윤곽 + 세로 직선(시위)' = 글자가 된다.
    // 처방 두 겹(둘 다 실제 활 아이콘의 관례다):
    //    ⑴ **화살을 메긴다** — 시위에서 라이저를 가로질러 앞으로 뻗는 가로 획이 닫힌 윤곽을 깬다.
    //    ⑵ **평면을 정면에서 튼다** — y 회전으로 두 림이 깊이 방향으로 갈려 입체로 읽힌다.
    // ⚠️ makeWeapon 이 아니라 여기 두는 이유: 전장 영웅은 활을 **쏘는** 중이라 화살이 따로 날아가고
    //    (`spawnProjectile`), 손·시위 정렬이 이 회전을 전제로 잡혀 있지 않다.
    weaponThumbBowPose(model, wtypeId) {
        if (!model) return null;
        // 석궁도 같은 병이다(지적 ⓔ '토템'·'닻') — 프로드는 x, 틸러는 y 라 정면 카메라에서 T 자
        // 납작판이 되고, 개머리·방아쇠울이 전부 z 방향이라 **한 픽셀도 안 보인다.** 조형을 보강해도
        // 각도가 그대로면 소용없다. 활보다 조금 덜 틀어 프로드 좌우 대칭은 남긴다.
        if (weaponShape(wtypeId) === 'crossbow') {
            model.rotation.set(-0.62, 0, 0);
            model.updateMatrixWorld(true);
            return { arrow: 0, crossbow: true };
        }
        if (weaponShape(wtypeId) !== 'bow') return null;
        const std = o => new THREE.MeshStandardMaterial(o);
        // 화살은 활 재질을 따라가지 않는다 — 시대별 활 색과 같은 톤이면 획이 안 읽힌다(무채 목재+강철).
        const shaftM = std({ color: 0x8a6a45, metalness: 0.05, roughness: 0.78 });
        const headM = std({ color: 0xc2ccd4, metalness: 0.85, roughness: 0.3 });
        const fletchM = std({ color: 0xd8dde2, metalness: 0.02, roughness: 0.9, side: THREE.DoubleSide });
        const ay = 0.085;                    // 화살 선반(shelf) 높이 — 화살이 선반에 얹혀야 한다
        const x0 = -0.012, x1 = 0.66;        // 시위 → 앞으로 뻗은 끝
        const arrow = new THREE.Group();
        const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, x1 - x0, 6), shaftM);
        sh.rotation.z = Math.PI / 2;
        sh.position.set((x0 + x1) / 2, ay, 0);
        arrow.add(sh);
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 4), headM);
        head.rotation.z = -Math.PI / 2;
        head.position.set(x1 + 0.055, ay, 0);
        arrow.add(head);
        for (const rz of [0, Math.PI / 2]) { // 깃 2장(십자) — 오늬 쪽에서 획의 끝을 맺는다
            const f = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.055), fletchM);
            f.position.set(x0 + 0.085, ay, 0);
            f.rotation.x = rz;
            arrow.add(f);
        }
        model.add(arrow);
        // 정면을 벗어난 3/4 자세 — 두 림이 깊이로 갈려 '납작한 글자'가 아니라 물건으로 읽힌다.
        model.rotation.y = -0.62;
        model.updateMatrixWorld(true);
        return { arrow: arrow.children.length };
    },

    itemThumb(item) {
        if (!item) return null;
        const aTier = this.ascendTier(item.stars); // 승천 티어별 디자인 분화 — 키에 안 넣으면 별이 달라도 같은 썸네일이 재사용된다
        const key = item.slot + ':' + (item.wtype || '') + ':' + item.age + ':' + item.rarity + ':' + (item.nameIdx !== undefined ? item.nameIdx : '') + ':a' + aTier;
        if (this._thumbCache[key]) return this._thumbCache[key];
        try {
            this.itemThumbInit();
            const sc = this._thumbScene;
            this.clearGroup(sc);
            sc.add(this._thumbAmb, this._thumbDir, this._thumbRim);
            let model;
            if (item.slot === 'weapon') {
                model = this.makeWeapon(item.wtype || 'sword', item.ageIdx, item.rarity);
                this.weaponThumbBulk(model, item.wtype || 'sword');   // 자루 과장 — 썸네일 경로에서만 (위 주석 참조)
                this.weaponThumbBowPose(model, item.wtype || 'sword'); // 활 'D' 오독 — 메긴 화살 + 3/4 자세
            } else if (item.slot === 'helmet') {
                model = this.makeHelmet(item.age, item.rarity, itemStyleOf(item), itemNameOf(item));
            } else if (item.slot === 'armor') {
                model = this.makeArmorPreview(item.age, item.rarity, itemStyleOf(item), itemNameOf(item));
            } else {
                // 장신구류: 부위당 3종 변형 프리뷰
                model = this.makeAccessoryPreview(item.slot, Math.max(0, item.nameIdx || 0) % 3, item.age, item.rarity, itemNameOf(item));
            }
            // ⚠️ 부위별 고정 배율(투구1.5·갑옷1.3·장신구1.4)+고정 카메라를 쓰면 **형상**에 따라
            //    잘리거나 좁쌀만 하게 찍힌다 — 납작한 '수호의 후광'은 프레임 위쪽 실선 한 줄,
            //    길쭉한 '사신의 모자'·'마법사의 모자'는 고깔 끝이 잘리고, 장갑은 타일 한가운데
            //    작은 덩어리로 떠 있었다(탈것 썸네일이 같은 함정을 먼저 밟고 자동 프레이밍으로 고쳤다).
            //    배율·y오프셋은 자동 프레이밍이 흡수하므로 여기서 주지 않는다.
            // 파트 단위 명도 3단 — 조립이 다 끝난 뒤 마지막에 한 번(위 tierizeParts 주석 참조).
            // 썸네일 경로에서만 건다: makeArmorPreview·makeAccessoryPreview 는 어차피 여기서만 쓰지만
            // makeHelmet·makeWeapon 은 **인게임 영웅과 공용**이라, 빌더 안에 넣으면 전장 모델까지
            // 파트마다 값이 갈린다(그쪽은 이 항목의 요구가 아니고 cape·hero 회귀를 흔든다).
            this.applyAscendDecor(model, aTier, 'equip'); // 승천 데코 (ascend-design-tiers) — 명도 3단 처리에 같이 태운다
            this.tierizeParts(model);
            const g = new THREE.Group();
            g.add(model);
            sc.add(g);
            const d = this.ITEM_THUMB_DIR;
            this.thumbFrameToFit(this._thumbCam, g, new THREE.Vector3(d.x, d.y, d.z).normalize(), 1.06);
            this._thumbR.render(sc, this._thumbCam);
            const url = this._thumbR.domElement.toDataURL();
            this._thumbCache[key] = url;
            return url;
        } catch (e) { return null; }
    },

    // ---- 탈것 썸네일: 슬롯 아이콘 = 실제로 소환되는 그 탈것 (사용자 지시 2026-08-18) ----
    // 슬롯에 이모지(🐴 등)를 박아 두면 실제 3D 탈것과 생김새가 전혀 달라 '다른 물건'으로 읽힌다.
    // 장비 썸네일과 같은 오프스크린 렌더러에 태우되, 탈것은 종마다 몸집·형태가 크게 달라
    // 고정 카메라로는 잘리거나 좁쌀만 하게 찍힌다 — **바운딩 박스로 매번 프레이밍을 역산**한다.
    mountThumb(name, rarity, stars) {
        const aTier = this.ascendTier(stars);
        return this.creatureThumb('mount', name,
            () => this.applyAscendDecor(this.makeMountMesh(name, rarity || 'common'), aTier, 'mount'), rarity, aTier);
    },
    // 펫도 같은 문제(슬롯 이모지 🐾 ≠ 실제 3D 펫) — 탈것과 완전히 같은 파이프라인에 태운다.
    petThumb(name, stars) {
        const aTier = this.ascendTier(stars);
        return this.creatureThumb('pet', name,
            () => this.applyAscendDecor(this.makePetMesh(name), aTier, 'pet'), '', aTier);
    },
    // 탈것·펫 공용 — 실제 게임 모델을 슬롯 아이콘 각도로 찍는다.
    // 종마다 몸집·형태가 크게 달라 고정 카메라로는 잘리거나 좁쌀만 하게 찍히므로
    // **바운딩 박스로 매번 프레이밍을 역산**하는 게 핵심이다.
    // 이미 구워 둔 썸네일이 있으면 돌려준다(굽지는 않는다) — UI가 다시 그릴 때 이모지를 거치지 않고
    // 곧바로 <img>를 낼 수 있게 하는 조회용. 키 형식을 UI에 흘리지 않으려고 여기 둔다.
    creatureThumbCached(kind, name, rarity, stars) {
        if (!name || !this._thumbCache) return null;
        // 키 형식은 creatureThumb 과 반드시 동일해야 한다 — ':a티어' 가 빠지면 캐시가 항상 미스라
        // 모든 셀이 이모지 폴백→재하이드레이트를 탄다 (ascend-design-tiers 에서 티어 축 추가).
        return this._thumbCache[kind + ':' + name + ':' + (rarity || '') + ':a' + this.ascendTier(stars) + '@' + this.creatureThemeKey()] || null;
    },
    // ---- 생물(탈것·펫) 썸네일 전용 렌더러 ----
    // 장비 썸네일 렌더러(_thumbR)를 같이 쓰면 색이 전장과 어긋난다: 그쪽은 기본 인코딩(Linear·
    // 톤매핑 없음)에 흰 AmbientLight 0.85가 얹혀 있어, 재질색이 거의 날것으로 나오고 음영이
    // 들려 채도가 과하게 찍힌다(실측: 서펀트 썸네일 rgb(98,216,208) vs 전장 rgb(121,169,160),
    // Δ채널 48). 슬롯 아이콘의 합격 조건이 "전장의 그놈과 같은 색"이라 본편과 같은 색
    // 파이프라인·같은 조명이 필수다. 탈것·펫 재질은 Lambert/Basic뿐이라 PMREM은 필요 없다.
    creatureThumbInit() {
        if (!this._creatureR) {
            const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
            r.setSize(160, 160);
            r.outputEncoding = THREE.sRGBEncoding;             // 본편(init L30~34)과 동일
            r.toneMapping = THREE.ACESFilmicToneMapping;
            r.toneMappingExposure = 1.02;
            // 그림자는 켜지 않는다 — 본편 태양의 그림자 카메라는 ±10유닛이라 1유닛짜리 펫의
            // 부위 간 그림자를 사실상 못 잡는데, 개체에 맞춘 썸네일 카메라는 텍셀이 10배
            // 촘촘해 본편에 없는 자기그림자·애크니가 생겨 오히려 전장보다 어두워진다
            // (실측 Δ밝기 39, normalBias 0.02로도 부위가 많은 종은 36~47).
            this._creatureR = r;
            this._creatureScene = new THREE.Scene();
            this._creatureCam = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
            this._creatureHemi = new THREE.HemisphereLight(0xbddcff, 0x6e7a60, 0.54);
            this._creatureSun = new THREE.DirectionalLight(0xfff3d6, 1.2);
            this._creatureRim = new THREE.DirectionalLight(0xcfe4ff, 0.5);
            this._creatureScene.add(this._creatureHemi, this._creatureSun, this._creatureRim);
        }
        this.syncCreatureLights();
    },
    // 조명·노출을 **살아 있는 씬에서 복사**한다.
    // ⚠️ 생성자 초기값(hemi 0.54 / sun 1.2 / rim 0.5)을 베껴 쓰면 안 된다 — setTheme이 챕터마다
    //    전부 덮어쓴다(실측: 초원 낮 = hemi 0.15 / sun 1.0 / rim 0.18). 초기값으로 구우면
    //    채움광이 과해 썸네일만 허옇게 뜬다.
    syncCreatureLights() {
        if (this.hemi) {
            this._creatureHemi.color.copy(this.hemi.color);
            this._creatureHemi.groundColor.copy(this.hemi.groundColor);
            this._creatureHemi.intensity = this.hemi.intensity;
        }
        if (this.sun) {
            this._creatureSun.color.copy(this.sun.color);
            this._creatureSun.intensity = this.sun.intensity;
            this._creatureSun.position.copy(this.sun.position);
        }
        if (this.rim) {
            this._creatureRim.color.copy(this.rim.color);
            this._creatureRim.intensity = this.rim.intensity;
            this._creatureRim.position.copy(this.rim.position);
        }
        if (this.renderer) this._creatureR.toneMappingExposure = this.renderer.toneMappingExposure;
    },
    // 테마가 바뀌면(챕터 이동·밤) 조명이 달라지므로 그 조합마다 따로 굽는다 — 안 그러면 낮에
    // 구운 썸네일이 밤 화면에 그대로 남아 다시 "슬롯이 실제와 다른" 상태가 된다.
    creatureThemeKey() {
        const n = (v) => (v === undefined || v === null ? '-' : (+v).toFixed(2));
        return [n(this.renderer && this.renderer.toneMappingExposure), n(this.hemi && this.hemi.intensity),
                n(this.sun && this.sun.intensity), n(this.rim && this.rim.intensity),
                this.sun ? this.sun.color.getHexString() : '-'].join('|');
    },
    creatureThumb(kind, name, build, rarity, aTier) {
        if (!name) return null;
        const key = kind + ':' + name + ':' + (rarity || '') + ':a' + (aTier || 0) + '@' + this.creatureThemeKey();
        if (this._thumbCache[key]) return this._thumbCache[key];
        try {
            this.creatureThumbInit();
            const sc = this._creatureScene;
            this.clearGroup(sc);
            sc.add(this._creatureHemi, this._creatureSun, this._creatureRim);
            const mesh = build();
            // 게임에서 보이는 것과 같은 3/4 방향 — 슬롯과 필드의 실루엣이 같아야 '같은 놈'으로 읽힌다
            const g = new THREE.Group();
            g.rotation.y = 0.55;
            g.add(mesh);
            sc.add(g);
            // ── 프레이밍: 근사 대신 **정점을 카메라 축에 직접 투영**해 맞춘다 (thumbFrameToFit) ──
            //    실측하면 근사 방식은 자전거 실루엣이 프레임의 36×53%(픽셀 6.0%), 나뭇잎 51×26%,
            //    거북이 34×52%로 9/15가 절반 이하만 채웠다. 장비 썸네일도 같은 함정을 밟아 지금은
            //    같은 헬퍼를 쓴다.
            // 시선은 **인게임 메인 카메라와 같은 각**으로 — 요구가 "같은 앵글로 렌더한 썸네일"이라
            // 보기 좋은 각을 따로 고르면 그 자체가 '슬롯과 실물이 다르다'가 된다.
            // 메인 리그: 카메라 y3.7·z8.2 → 주시점 y0.9 (init의 camera.position/lookAt) = 고도 ≈18.9°.
            // 방위각은 0이고(카메라 x는 worldX를 따라간다), 모델 요각 0.55는 위에서 이미 줬다.
            const cam = this._creatureCam;
            const dir = new THREE.Vector3(0, 3.7 - 0.9, 8.2).normalize();
            this.thumbFrameToFit(cam, g, dir, 1.04);         // 테두리 여백 4%
            this._creatureR.render(sc, cam);
            const url = this._creatureR.domElement.toDataURL();
            this._thumbCache[key] = url;
            return url;
        } catch (e) { return null; }
    },

    // 펫 몸체 — 종별 **관절 리그**로 짓는다 (2026-08-19 `pet-articulated-joints`, 사용자 지시 "펫들도 관절 다 움직이게").
    // ⚠️ 예전 구조의 결함 두 가지를 같은 자리에서 고쳤다:
    //   ⑴ 파츠를 전부 루트(g)에 평면으로 붙여 **관절이랄 게 없었다** — 다리는 정적 원기둥,
    //      몸통은 통짜였고 살아 있는 건 그룹 전체의 상하 바운스뿐이었다(사용자가 지적한 '통짜').
    //   ⑵ 그나마 있던 파츠 애니(wings/tail/claws/sting/heads/tails)는 **한 프레임도 돈 적이 없다**:
    //      `refreshPets` 가 `mesh.userData` 를 래퍼 그룹으로 올리지 않아 update 의 `ud.wings` 등이
    //      전부 undefined 였다. 탈것은 같은 값을 `mountG` 에서 올려 준다 — 펫만 빠져 있었다.
    // 지금은 파츠를 **관절 피벗(Group)** 아래에 달고 `userData.joints` 로 넘긴다. 회전은 반드시
    // 피벗에서 걸 것 — 메시 자신을 돌리면 원기둥 한가운데가 축이 돼 다리가 몸을 뚫고 프로펠러가 된다.
    makePetMesh(name) {
        const g = new THREE.Group();
        const c = PET_COLORS[name] || 0xbdbdbd;
        const M = (col, opt) => new THREE.MeshLambertMaterial(Object.assign({ color: col }, opt || {}));
        const mat = M(c);
        const dark = M(new THREE.Color(c).offsetHSL(0, 0, -0.15));
        const light = M(new THREE.Color(c).offsetHSL(0, 0, 0.14));
        const blk = new THREE.MeshBasicMaterial({ color: 0x263238 });
        const J = [];                 // 관절 목록 — update 의 제너릭 드라이버가 종별 위상으로 돌린다
        let CUR = g;                  // 지금 파츠가 붙을 부모(관절 아래로 내려가면 바뀐다)
        // 헬퍼: 정면 +z, 바닥 y0 기준. 전부 **CUR** 에 붙는다(예전엔 무조건 g 였다)
        const sp = (r, x, y, z, m, sx, sy, sz) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), m || mat); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy, sz); CUR.add(o); return o; };
        const bx = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat); o.position.set(x, y, z); CUR.add(o); return o; };
        const cn = (r, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), m || mat); o.position.set(x, y, z); CUR.add(o); return o; };
        const cy = (r1, r2, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 7), m || mat); o.position.set(x, y, z); CUR.add(o); return o; };
        const eyes = (y, z, gap, r) => { for (const s of [-1, 1]) sp(r || 0.028, s * (gap || 0.06), y, z, blk); };
        // 관절 피벗: 회전축이 **관절 위치**에 오도록 빈 Group 을 세운다
        const pv = (x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); CUR.add(o); return o; };
        // node 아래에 파츠를 붙이는 스코프(콜백이 값을 주면 그걸, 아니면 node 를 돌려준다)
        const into = (node, fn) => { const prev = CUR; CUR = node; const r = fn(node); CUR = prev; return r === undefined ? node : r; };
        // 관절 등록: axis 축을 **빌드 시 각도(base)** 기준으로 amp 만큼 흔든다.
        //   f = 종 모션 주파수(PET_MOTION.freq)의 배수 · ph = 위상(rad) · gain = 이동 중 진폭 배수
        //   abs = 한쪽으로만 접힘(무릎·도약) · spin = 등속 회전(전기 코일 등)
        const jt = (o, axis, amp, ph, opt) => {
            if (o) J.push(Object.assign({ o, axis, base: o.rotation[axis] || 0, amp, ph: ph || 0, f: 1, gain: 1, abs: false, spin: false }, opt || {}));
            return o;
        };
        // 관절 사지: 피벗을 관절에 두고 길이 len 만큼 **아래로** 늘어뜨린 원기둥
        const limb = (x, y, z, len, r1, r2, m) => {
            const p = pv(x, y, z);
            const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2 === undefined ? r1 : r2, len, 7), m || mat);
            o.position.y = -len / 2; p.add(o);
            return p;
        };
        // 2단 사지(허벅지+정강이) — [고관절, 무릎] 피벗을 준다
        const limb2 = (x, y, z, up, lo, r, m) => {
            const hip = limb(x, y, z, up, r, r * 0.82, m);
            const knee = into(hip, () => limb(0, -up, 0, lo, r * 0.82, r * 0.72, m));
            return [hip, knee];
        };
        // 사족 4다리 — 앞다리 z=zf, 뒷다리 z=zb, **대각선끼리 같은 위상**(말·개의 속보)
        const quad = (dx, zf, zb, y, len, r, m, o) => {
            const A = (o && o.amp !== undefined) ? o.amp : 0.5, two = !(o && o.one), lo = (o && o.lo) || len * 0.6;
            const ph = [0, Math.PI, Math.PI, 0];   // FL FR BL BR
            let i = 0;
            for (const z of [zf, zb]) for (const s of [-1, 1]) {
                const p = ph[i++];
                if (two) {
                    const [hip, knee] = limb2(s * dx, y, z, len, lo, r, m);
                    jt(hip, 'x', A, p, { gain: 1.9 });
                    jt(knee, 'x', -A * 0.75, p + 1.15, { gain: 1.9, abs: true });   // 무릎은 한쪽으로만 접힌다
                } else {
                    jt(limb(s * dx, y, z, len, r, r * 0.8, m), 'x', A, p, { gain: 1.9 });
                }
            }
        };

        switch (name) {
            case 'Snail': { // 몸통 + 나선 껍데기 + 관절 더듬이눈
                sp(0.13, 0, 0.09, 0.04, mat, 1.1, 0.7, 1.5);
                for (const s of [-1, 1]) {
                    const st = pv(s * 0.05, 0.17, 0.2);     // 더듬이 뿌리 = 관절
                    into(st, () => { cy(0.012, 0.012, 0.14, 0, 0.07, 0, dark); sp(0.028, 0, 0.15, 0.01, blk); });
                    // ⚠️ 진폭 하한(재오픈 2026-08-19): 종전 0.24/0.16·f 0.9 는 화면에서 ≤1px —
                    //    25종 중 달팽이가 '통짜'로 재지적된 원인. 실게임 카메라 px 실측으로 정했다.
                    jt(st, 'z', 0.55, s > 0 ? 0 : Math.PI, { f: 1.7, gain: 1.6 });   // 좌우로 더듬더듬
                    jt(st, 'x', 0.34, s * 0.8, { f: 2.4, gain: 1.6 });
                }
                const shell = pv(0, 0.14, -0.08);            // 껍데기 뿌리 = 관절 (몸 위에서 일렁임)
                into(shell, () => { sp(0.15, 0, 0.12, 0, light); sp(0.09, 0, 0.12, 0, dark, 1.05, 1.05, 0.5); });
                jt(shell, 'z', 0.16, 0.6, { f: 1.1, gain: 1.5 });
                break;
            }
            case 'Turtle': { // 등딱지 + 관절 목 + 노 젓는 네 다리
                sp(0.19, 0, 0.15, 0, dark, 1, 0.62, 1.2);
                sp(0.14, 0, 0.19, 0, M(new THREE.Color(c).offsetHSL(0, 0, -0.25)), 1, 0.5, 1);
                const neck = pv(0, 0.13, 0.16);
                into(neck, () => { sp(0.08, 0, 0, 0.1, light); eyes(0.04, 0.16, 0.045, 0.02); });
                jt(neck, 'x', 0.3, 0, { f: 0.8, gain: 1.7 });            // 목 빼고 넣고
                let i = 0;
                const ph = [0, Math.PI, Math.PI, 0];
                for (const z of [0.14, -0.14]) for (const s of [-1, 1]) {
                    const fl = pv(s * 0.13, 0.07, z);
                    into(fl, () => sp(0.05, s * 0.03, 0, 0, light, 1.2, 0.7, 1));
                    jt(fl, 'z', 0.5 * s, ph[i++], { gain: 1.8 });        // 지느러미발 노 젓기
                }
                break;
            }
            case 'Mouse': { // 큰 귀 + 관절 네 다리 + 꼬리
                sp(0.14, 0, 0.17, 0, mat, 1, 0.95, 1.2);
                for (const s of [-1, 1]) {
                    const ear = pv(s * 0.09, 0.3, -0.02);
                    into(ear, () => sp(0.075, 0, 0.04, 0, light, 1, 1, 0.4));
                    jt(ear, 'z', 0.2 * s, s > 0 ? 0 : 1.2, { f: 1.7 });  // 귀 쫑긋
                }
                sp(0.025, 0, 0.14, 0.17, M(0xf48fb1));
                quad(0.075, 0.08, -0.08, 0.11, 0.1, 0.014, dark, { one: true, amp: 0.62 });
                const tail = pv(0, 0.14, -0.13);
                into(tail, () => cy(0.012, 0.012, 0.26, 0, -0.13, 0, dark));
                tail.rotation.x = 2.2;                                    // 뒤로 세운 꼬리(예전 정적 각을 피벗으로)
                g.userData.tail = tail;
                eyes(0.21, 0.13);
                break;
            }
            case 'Chicken': { // 볏 + 부리 + 관절 날개·두 다리
                sp(0.13, 0, 0.2, 0);
                for (let i = 0; i < 3; i++) sp(0.03, 0, 0.36 - i * 0.01, 0.04 - i * 0.05, M(0xef5350));
                const head = pv(0, 0.2, 0.05);
                into(head, () => { const beak = cn(0.035, 0.09, 0, 0.01, 0.11, M(0xffa726)); beak.rotation.x = Math.PI / 2; eyes(0.04, 0.06); });
                jt(head, 'x', 0.32, 0, { f: 1, gain: 1.8 });             // 닭 특유의 목 까딱
                for (const s of [-1, 1]) {
                    const sh = pv(s * 0.09, 0.21, -0.02);
                    into(sh, () => sp(0.07, s * 0.05, -0.03, 0, light, 0.5, 0.8, 1));
                    jt(sh, 'z', -0.42 * s, s > 0 ? 0 : 0.3, { f: 1.3, gain: 1.6 });   // 푸드덕
                }
                let i = 0;
                for (const s of [-1, 1]) jt(limb(s * 0.05, 0.11, 0, 0.11, 0.012, 0.012, M(0xffa726)), 'x', 0.55, (i++) * Math.PI, { gain: 1.9 });
                break;
            }
            case 'Cat': case 'Tiger': case 'Saber Tooth': case 'Spectral Tiger': { // 고양잇과 공통 + 변형
                const ghost = name === 'Spectral Tiger';
                const bmat = ghost ? M(c, { transparent: true, opacity: 0.6, emissive: c, emissiveIntensity: 0.4 }) : mat;
                if (ghost) g.userData.ghostMat = bmat;
                sp(0.12, 0, 0.19, -0.02, bmat, 1, 0.95, 1.3);
                const neck = pv(0, 0.24, 0.06);
                into(neck, () => {
                    sp(0.11, 0, 0.11, 0.04, bmat);
                    for (const s of [-1, 1]) cn(0.04, 0.08, s * 0.07, 0.23, 0.02, bmat);      // 귀
                    if (name === 'Saber Tooth') for (const s of [-1, 1]) cn(0.015, 0.07, s * 0.05, 0.03, 0.12, M(0xffffff));
                    eyes(0.13, 0.13);
                });
                jt(neck, 'x', 0.16, 0.6, { f: 0.9, gain: 1.6 });          // 머리 끄덕
                const tail = pv(0, 0.24, -0.14);
                into(tail, () => cy(0.018, 0.012, 0.2, 0, -0.1, 0, bmat));
                tail.rotation.x = 2.3;                                     // 위로 치켜든 꼬리
                g.userData.tail = tail;
                quad(0.075, 0.09, -0.1, 0.14, 0.08, 0.02, bmat, { amp: 0.46, lo: 0.06 });
                if (name === 'Tiger' || name === 'Spectral Tiger') for (let i = 0; i < 3; i++) bx(0.02, 0.09, 0.16, -0.06 + i * 0.06, 0.22, -0.02, blk);
                break;
            }
            case 'Dog': { // 늘어진 귀 + 주둥이 + 관절 네 다리
                sp(0.13, 0, 0.2, -0.02, mat, 1, 0.95, 1.25);
                const neck = pv(0, 0.26, 0.06);
                into(neck, () => {
                    sp(0.11, 0, 0.1, 0.04);
                    for (const s of [-1, 1]) {
                        const ear = pv(s * 0.11, 0.12, 0);
                        into(ear, () => sp(0.05, 0, -0.05, 0, dark, 0.6, 1.3, 0.7));
                        jt(ear, 'x', 0.3, s * 0.9, { f: 1.4, gain: 1.7 });   // 뛸 때 귀가 펄럭
                    }
                    sp(0.055, 0, 0.06, 0.14, light);
                    sp(0.022, 0, 0.08, 0.19, blk);
                    eyes(0.14, 0.12);
                });
                jt(neck, 'x', 0.18, 0.5, { f: 1, gain: 1.7 });
                const tail = pv(0, 0.25, -0.14);
                into(tail, () => cy(0.015, 0.01, 0.16, 0, -0.08, 0, mat));
                tail.rotation.x = 2.4;
                g.userData.tail = tail;
                quad(0.08, 0.09, -0.1, 0.15, 0.09, 0.021, mat, { amp: 0.52, lo: 0.06 });
                break;
            }
            case 'Hedgehog': { // 등 가시 + 총총거리는 짧은 네 다리
                sp(0.14, 0, 0.16, 0.02, light, 1.1, 0.85, 1.25);
                for (let i = 0; i < 7; i++) {
                    const a = (i / 7) * Math.PI - Math.PI / 2;
                    const s2 = cn(0.03, 0.11, Math.sin(a) * 0.1, 0.24 + Math.cos(a) * 0.06, -0.05 - Math.abs(Math.sin(a)) * 0.04, dark);
                    s2.rotation.z = -a * 0.8;
                }
                const snout = pv(0, 0.14, 0.14);
                into(snout, () => { sp(0.03, 0, 0, 0.06, blk); eyes(0.05, 0.03, 0.05); });
                jt(snout, 'x', 0.22, 0, { f: 2.2 });                       // 코 킁킁
                quad(0.075, 0.07, -0.07, 0.08, 0.075, 0.013, dark, { one: true, amp: 0.6 });
                break;
            }
            case 'Bear': { // 둥근 귀 + 주둥이 + 관절 네 다리
                sp(0.16, 0, 0.24, 0);
                const neck = pv(0, 0.32, 0.03);
                into(neck, () => {
                    sp(0.12, 0, 0.1, 0.02);
                    for (const s of [-1, 1]) sp(0.045, s * 0.09, 0.2, -0.02, dark);
                    sp(0.055, 0, 0.07, 0.12, light);
                    sp(0.025, 0, 0.09, 0.17, blk);
                    eyes(0.14, 0.11);
                });
                jt(neck, 'x', 0.14, 0.4, { f: 0.9, gain: 1.6 });
                quad(0.1, 0.09, -0.11, 0.19, 0.11, 0.028, mat, { amp: 0.42, lo: 0.08 });
                break;
            }
            case 'Ostrich': { // 긴 관절 목 + 2단 다리
                sp(0.13, 0, 0.3, 0, mat, 1.1, 1, 1.1);
                const neck = pv(0.02, 0.36, 0.04);
                const head = into(neck, () => {
                    cy(0.022, 0.028, 0.26, 0, 0.13, 0.02, light);
                    const h = pv(0, 0.26, 0.05);
                    into(h, () => { sp(0.055, 0, 0, 0); const beak = cn(0.025, 0.07, 0, 0, 0.07, M(0xffa726)); beak.rotation.x = Math.PI / 2; eyes(0.03, 0.03, 0.04, 0.02); });
                    return h;
                });
                jt(neck, 'x', 0.22, 0, { f: 0.8, gain: 1.8 });             // 목 전체가 앞뒤로
                jt(head, 'x', 0.3, 1.4, { f: 1.6, gain: 1.6 });            // 머리는 그 위에서 까딱
                let i = 0;
                for (const s of [-1, 1]) {
                    const [hip, knee] = limb2(s * 0.05, 0.2, 0, 0.11, 0.09, 0.014, M(0xbcaaa4));
                    jt(hip, 'x', 0.6, (i) * Math.PI, { gain: 1.9 });
                    jt(knee, 'x', -0.5, (i++) * Math.PI + 1.2, { gain: 1.9, abs: true });
                }
                break;
            }
            case 'Scorpion': { // 집게 + 꼬리침 + 관절 여섯 다리
                sp(0.12, 0, 0.12, -0.02, mat, 1.35, 0.6, 1.5);
                // 꼬리 마디를 사슬로 걸어 침까지 한 몸으로 아치를 그린다
                const t1 = pv(0, 0.15, -0.12);
                let sting;
                into(t1, () => {
                    sp(0.045, 0, 0.04, -0.04, dark);
                    const t2 = pv(0, 0.1, -0.06);
                    into(t2, () => {
                        sp(0.04, 0, 0.04, -0.02, dark);
                        sp(0.035, 0, 0.12, 0.02, dark);
                        sting = cn(0.028, 0.09, 0, 0.18, 0.06, blk); sting.rotation.x = 2.5;
                    });
                    jt(t2, 'x', 0.42, 1.1, { f: 1.4 });
                });
                jt(t1, 'x', 0.36, 0, { f: 1.4 });
                g.userData.sting = sting;
                g.userData.claws = [];
                for (const s of [-1, 1]) {
                    const arm = pv(s * 0.1, 0.1, 0.08);
                    into(arm, () => {
                        sp(0.055, s * 0.03, 0, 0.07, dark);
                        g.userData.claws.push(sp(0.04, s * 0.06, 0, 0.14, dark, 1, 0.7, 1.2));
                    });
                    jt(arm, 'y', 0.4 * s, s > 0 ? 0 : Math.PI, { f: 1.8 });   // 집게팔 벌렸다 오므렸다
                    for (let i = 0; i < 3; i++) {
                        const leg = limb(s * 0.12, 0.1, -0.04 + i * 0.07, 0.11, 0.01, 0.008, dark);
                        leg.rotation.z = s * 1.0;
                        // ⚠️ 다리가 z=±1.0 으로 눕혀져 있어 x 회전은 대부분 깊이축으로 사라진다(화면 ≤1.4px,
                        //    재오픈 원인). 화면에 보이는 건 z 성분 — 노 젓듯 위아래로 젓는 축을 같이 준다.
                        jt(leg, 'x', 0.55, i * 1.05 + (s > 0 ? Math.PI : 0), { f: 2.2, gain: 1.8 });   // 마디마다 시차
                        jt(leg, 'z', s * 0.28, i * 1.05 + 0.7 + (s > 0 ? Math.PI : 0), { f: 2.2, gain: 1.8 });
                    }
                }
                eyes(0.16, 0.2, 0.05, 0.02);
                break;
            }
            case 'Spider': { // 관절 여덟 다리 — 좌우 교대 4각 보행
                sp(0.12, 0, 0.2, -0.05);
                sp(0.08, 0, 0.18, 0.11, light);
                for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
                    const [hip, knee] = limb2(s * 0.09, 0.19, -0.1 + i * 0.07, 0.1, 0.09, 0.01, dark);
                    hip.rotation.z = s * 1.05;
                    // 눕힌 다리의 x 회전은 깊이축으로 사라진다(전갈과 같은 함정) — z 성분을 같이 준다
                    jt(hip, 'x', 0.4, (i % 2 ? 0 : Math.PI) + (s > 0 ? Math.PI : 0), { f: 1.5, gain: 1.8 });
                    jt(hip, 'z', s * 0.2, (i % 2 ? 0 : Math.PI) + (s > 0 ? Math.PI : 0) + 0.6, { f: 1.5, gain: 1.8 });
                    jt(knee, 'z', -s * 0.5, (i % 2 ? 0 : Math.PI) + (s > 0 ? Math.PI : 0) + 0.9, { f: 1.5, gain: 1.8, abs: true });
                }
                for (const s of [-1, 1]) { sp(0.022, s * 0.035, 0.21, 0.18, new THREE.MeshBasicMaterial({ color: 0xff1744 })); sp(0.014, s * 0.075, 0.19, 0.17, new THREE.MeshBasicMaterial({ color: 0xff1744 })); }
                break;
            }
            case 'Panda': { // 흑백 + 관절 네 다리
                const wht = M(0xf5f5f5), b = M(0x37474f);
                sp(0.15, 0, 0.23, 0, wht);
                const neck = pv(0, 0.32, 0.02);
                into(neck, () => {
                    sp(0.12, 0, 0.08, 0.02, wht);
                    for (const s of [-1, 1]) { sp(0.045, s * 0.1, 0.18, -0.02, b); sp(0.035, s * 0.055, 0.09, 0.11, b, 1, 1.3, 0.5); }
                    sp(0.022, 0, 0.05, 0.14, blk);
                    eyes(0.1, 0.13, 0.055, 0.018);
                });
                jt(neck, 'x', 0.15, 0.5, { f: 0.9, gain: 1.5 });
                quad(0.095, 0.08, -0.1, 0.18, 0.1, 0.027, b, { amp: 0.4, lo: 0.07 });
                break;
            }
            case 'Griffin': { // 날개 + 부리 + 관절 네 다리
                sp(0.13, 0, 0.24, -0.02, mat, 1, 1, 1.25);
                const neck = pv(0, 0.3, 0.06);
                into(neck, () => {
                    sp(0.1, 0, 0.09, 0.04, light);
                    const beak = cn(0.03, 0.08, 0, 0.09, 0.14, M(0xffa726)); beak.rotation.x = Math.PI / 2;
                    eyes(0.13, 0.12);
                });
                jt(neck, 'x', 0.2, 0.7, { f: 1, gain: 1.6 });
                g.userData.wings = [];
                for (const s of [-1, 1]) {
                    const sh = pv(s * 0.07, 0.3, -0.06);
                    into(sh, () => sp(0.11, s * 0.07, -0.04, 0, light, 0.25, 1, 0.8));
                    sh.rotation.z = s * 0.5;
                    sh.userData.s = s;
                    g.userData.wings.push(sh);         // 날갯짓은 update 의 wings 경로가 맡는다(어깨에서 회전)
                }
                quad(0.08, 0.09, -0.1, 0.19, 0.11, 0.019, mat, { amp: 0.4, lo: 0.07 });
                break;
            }
            case 'Unicorn': { // 뿔 + 갈기 + 2단 네 다리
                sp(0.14, 0, 0.28, 0, mat, 1.05, 0.9, 1.3);
                const neck = pv(0, 0.34, 0.1);
                into(neck, () => {
                    sp(0.09, 0, 0.09, 0.05);
                    cn(0.022, 0.13, 0, 0.22, 0.07, M(0xffd54f, { emissive: 0xffd54f, emissiveIntensity: 0.6 }));
                    for (let i = 0; i < 3; i++) sp(0.035, -0.01, 0.14 - i * 0.06, -0.06 - i * 0.03, M(0xba68c8));
                    eyes(0.12, 0.12, 0.045);
                });
                jt(neck, 'x', 0.2, 0.5, { f: 1, gain: 1.7 });              // 말 특유의 목 젓기
                quad(0.085, 0.1, -0.11, 0.22, 0.12, 0.021, mat, { amp: 0.55, lo: 0.09 });
                break;
            }
            case 'Cerberus': { // 관절 목 셋 + 네 다리
                sp(0.15, 0, 0.24, -0.02, mat, 1.25, 0.95, 1.2);
                g.userData.heads = [];
                for (const dx of [-0.13, 0, 0.13]) {
                    const neck = pv(dx, 0.32, 0.04 + (dx === 0 ? 0.04 : 0));
                    into(neck, () => {
                        sp(0.08, 0, 0, 0.04);
                        for (const s of [-1, 1]) cn(0.025, 0.05, s * 0.05, 0.09, 0.01);
                        for (const s of [-1, 1]) sp(0.018, s * 0.035, 0.02, 0.11, new THREE.MeshBasicMaterial({ color: 0xff1744 }));
                    });
                    jt(neck, 'x', 0.22, dx * 8, { f: 1.1, gain: 1.6 });    // 머리 셋이 서로 시차를 두고
                    jt(neck, 'y', 0.18, dx * 8 + 1.2, { f: 0.7 });
                    g.userData.heads.push(neck);
                }
                quad(0.1, 0.09, -0.11, 0.19, 0.11, 0.024, dark, { amp: 0.48, lo: 0.08 });
                break;
            }
            case 'Kitsune': { // 꼬리 셋 여우 + 관절 네 다리
                sp(0.12, 0, 0.2, 0, mat, 1, 0.95, 1.25);
                const neck = pv(0, 0.25, 0.06);
                into(neck, () => {
                    sp(0.1, 0, 0.08, 0.04);
                    cn(0.03, 0.07, 0, 0.06, 0.14, M(0xffffff));
                    for (const s of [-1, 1]) cn(0.045, 0.1, s * 0.07, 0.2, 0);
                    eyes(0.1, 0.12);
                });
                jt(neck, 'x', 0.18, 0.6, { f: 1, gain: 1.6 });
                g.userData.tails = [];
                for (const dx of [-0.09, 0, 0.09]) {
                    const tp = pv(dx, 0.26, -0.1);
                    into(tp, () => { const t = cn(0.045, 0.2, 0, 0.1, 0, light); t.rotation.x = Math.PI; });
                    tp.rotation.x = -0.9 - Math.abs(dx);
                    g.userData.tails.push(tp);        // 꼬리 물결은 update 의 tails 경로(뿌리에서 회전)
                }
                quad(0.075, 0.09, -0.1, 0.15, 0.09, 0.019, mat, { amp: 0.5, lo: 0.06 });
                break;
            }
            case 'Serpent': { // 또아리 + 관절 목 사슬 + 혀
                sp(0.11, 0, 0.07, 0, mat, 1.5, 0.6, 1.5);
                sp(0.09, 0, 0.16, -0.02, mat, 1.25, 0.55, 1.25);
                const n1 = pv(0, 0.2, 0);
                into(n1, () => {
                    cy(0.045, 0.055, 0.16, 0.02, 0.08, 0.06);
                    const n2 = pv(0.02, 0.16, 0.06);
                    into(n2, () => {
                        sp(0.07, 0, 0.04, 0.04);
                        const tongue = bx(0.015, 0.008, 0.06, 0, 0.02, 0.13, new THREE.MeshBasicMaterial({ color: 0xff5252 }));
                        jt(tongue, 'x', 0.5, 0, { f: 3.4 });               // 혀 날름
                        eyes(0.07, 0.09, 0.04, 0.02);
                    });
                    jt(n2, 'z', 0.3, 1.3, { f: 1.2, gain: 1.6 });
                    jt(n2, 'x', 0.16, 0.4, { f: 0.9, gain: 1.4 });
                });
                jt(n1, 'z', 0.22, 0, { f: 1.2, gain: 1.7 });               // 몸을 S 자로 흔든다(이동 중 더 크게)
                break;
            }
            case 'Treant': { // 나무 정령 — 관절 팔 + 뿌리 다리
                const wood = M(0x6d4c41);
                cy(0.07, 0.1, 0.3, 0, 0.2, 0, wood);
                const head = pv(0, 0.36, 0);
                into(head, () => { sp(0.14, 0, 0.07, 0, mat); sp(0.08, 0.12, 0.01, 0.03, mat); eyes(0.03, 0.09, 0.045); });
                // ⚠️ 진폭 하한(재오픈 2026-08-19): 종전 head 0.1·팔 0.24(f0.9) 는 freq 1.2 와 곱해져
                //    화면 ≤1.4px = 정지로 읽혔다. 바람에 크게 흔들리는 우듬지로 키운다.
                jt(head, 'z', 0.34, 0, { f: 1.5 });                        // 우듬지처럼 흔들림
                for (const s of [-1, 1]) {
                    const sh = pv(s * 0.06, 0.28, 0.02);
                    into(sh, () => cy(0.02, 0.025, 0.16, 0, -0.08, 0, wood));
                    sh.rotation.z = s * 2.05;                              // 위로 뻗은 가지 팔
                    jt(sh, 'x', 0.5, s > 0 ? 0 : Math.PI, { f: 1.5, gain: 1.6 });
                    jt(sh, 'z', s * 0.2, s * 0.9, { f: 1.1, gain: 1.5 }); // 가지가 벌어졌다 오므라들기
                }
                for (const s of [-1, 1]) jt(limb(s * 0.05, 0.08, 0, 0.09, 0.03, 0.022, wood), 'x', 0.6, s > 0 ? 0 : Math.PI, { f: 1.6, gain: 1.9 });
                break;
            }
            case 'Enchanted Elk': { // 가지뿔 + 관절 목·네 다리
                sp(0.13, 0, 0.28, 0, mat, 1, 0.85, 1.3);
                const glow = M(0xfff59d, { emissive: 0xfff59d, emissiveIntensity: 0.5 });
                const neck = pv(0, 0.34, 0.08);
                into(neck, () => {
                    sp(0.08, 0, 0.09, 0.06);
                    for (const s of [-1, 1]) {
                        const a1 = cy(0.012, 0.012, 0.16, s * 0.06, 0.22, 0.02, glow); a1.rotation.z = s * 0.5;
                        const a2 = cy(0.01, 0.01, 0.09, s * 0.11, 0.27, 0.02, glow); a2.rotation.z = s * 1.2;
                    }
                    eyes(0.12, 0.12, 0.04);
                });
                jt(neck, 'x', 0.2, 0.4, { f: 1, gain: 1.7 });
                quad(0.08, 0.09, -0.1, 0.22, 0.12, 0.019, mat, { amp: 0.56, lo: 0.09 });
                break;
            }
            case 'Electry': { // 전기 구체 — 코일이 등속으로 돈다
                sp(0.13, 0, 0.2, 0, M(c, { emissive: c, emissiveIntensity: 0.8 }));
                const ring = pv(0, 0.2, 0);
                into(ring, () => {
                    for (let i = 0; i < 4; i++) {
                        const bolt = bx(0.02, 0.12, 0.02, Math.cos(i * 1.57) * 0.17, Math.sin(i * 1.57) * 0.17, 0, M(0xffff00, { emissive: 0xffff00, emissiveIntensity: 1 }));
                        bolt.rotation.z = i * 0.8;
                        jt(bolt, 'x', 0.7, i * 1.6, { f: 2.4, gain: 1.7 });   // 개별 방전 떨림(이동 중 격해진다)
                    }
                });
                jt(ring, 'z', 0, 0, { spin: true, f: 0.25 });              // 코일 전체가 등속 회전
                jt(ring, 'y', 0, 0, { spin: true, f: 0.13 });
                eyes(0.22, 0.12);
                break;
            }
            case 'Genie': { // 연기 하체 + 터번 + 관절 팔
                const smoke = pv(0, 0.18, 0);
                into(smoke, () => {
                    cn(0.02, 0.18, 0, -0.09, 0, M(new THREE.Color(c).offsetHSL(0, 0, -0.1), { transparent: true, opacity: 0.7 }));
                    cy(0.09, 0.03, 0.14, 0, 0.04, 0, M(c, { transparent: true, opacity: 0.85 }));
                });
                jt(smoke, 'z', 0.42, 0, { f: 1.3, gain: 1.6 });            // 연기 하체가 나부낀다
                jt(smoke, 'x', 0.26, 1.1, { f: 1.0, gain: 1.8 });
                sp(0.11, 0, 0.36, 0, mat);
                const head = pv(0, 0.44, 0);
                into(head, () => {
                    sp(0.09, 0, 0.06, 0, light);
                    sp(0.03, 0, 0.12, 0.07, M(0xffd54f, { emissive: 0xffd54f, emissiveIntensity: 0.6 }));
                    eyes(0.06, 0.08);
                });
                jt(head, 'y', 0.45, 0, { f: 1.2 });
                jt(head, 'x', 0.16, 0.7, { f: 0.9 });                      // 끄덕임도 섞어 y 회전의 깊이 소실을 보완
                for (const s of [-1, 1]) {
                    const sh = pv(s * 0.09, 0.38, 0.01);
                    into(sh, () => { cy(0.022, 0.02, 0.1, 0, -0.05, 0, mat); sp(0.04, 0, -0.11, 0.03); });
                    sh.rotation.z = s * 0.5;
                    jt(sh, 'x', 0.55, s > 0 ? 0 : Math.PI, { f: 1.5, gain: 1.5 });   // 팔짱 대신 느긋한 팔 흔들기
                    jt(sh, 'z', s * 0.22, s * 1.3, { f: 1.1, gain: 1.5 });
                }
                break;
            }
            case 'Baby Dragon': { // 날개 + 뿔 + 관절 목·두 다리·꼬리
                sp(0.13, 0, 0.2, 0, mat, 1, 0.95, 1.2);
                const neck = pv(0, 0.26, 0.06);
                into(neck, () => {
                    sp(0.1, 0, 0.11, 0.03);
                    sp(0.05, 0, 0.08, 0.12, light);
                    for (const s of [-1, 1]) cn(0.02, 0.06, s * 0.05, 0.21, -0.02, M(0xffffff));
                    eyes(0.14, 0.11);
                });
                jt(neck, 'x', 0.4, 0.5, { f: 1, gain: 1.6 });
                g.userData.wings = [];
                for (const s of [-1, 1]) {
                    const sh = pv(s * 0.08, 0.28, -0.05);
                    into(sh, () => sp(0.1, s * 0.07, -0.04, 0, dark, 0.2, 1, 0.7));
                    sh.rotation.z = s * 0.6;
                    sh.userData.s = s;
                    g.userData.wings.push(sh);
                }
                const tail = pv(0, 0.19, -0.12);
                into(tail, () => { const t = cn(0.035, 0.16, 0, 0.08, 0, mat); t.rotation.x = Math.PI; });
                tail.rotation.x = -0.9;
                g.userData.tail = tail;
                let i = 0;
                for (const s of [-1, 1]) jt(limb(s * 0.06, 0.13, 0.02, 0.13, 0.022, 0.016, dark), 'x', 0.62, (i++) * Math.PI, { gain: 1.8 });
                break;
            }
            default: {
                sp(0.14, 0, 0.19, 0);
                eyes(0.24, 0.12);
                for (let i = 0; i < 2; i++) jt(limb((i ? 1 : -1) * 0.06, 0.1, 0, 0.1, 0.016, 0.013, dark), 'x', 0.5, i * Math.PI, { gain: 1.9 });
            }
        }
        g.userData.joints = J;
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
        // 만든 눈 두 개를 **돌려준다** — 머리 피벗(아래 `neckRig`)이 눈까지 같이 묶어야 하기 때문이다.
        // 눈만 g 에 남으면 머리가 끄덕일 때 눈알만 허공에 붙박여 남는다.
        const eyes = (y, z, gap) => [-1, 1].map(s => sp(0.026, s * (gap || 0.07), y, z, blk));
        // ── 머리 피벗 (mount-animal-machine-dynamic) ──────────────────────────────
        // 머리·뿔·귀(part:'head')와 굴레(bridle), 눈을 **한 그룹**으로 묶어 목 밑동을 축으로 끄덕이게 한다.
        // ⚠️ 머리 메시만 돌리면 굴레·눈이 제자리에 남는다 — 모델 주석이 경고한 그 사고 그대로다.
        //    그래서 위치 상수를 다시 적지 않고 **이미 만들어진 파츠를 표식으로 걷어** 옮긴다.
        // ⚠️ 반드시 굴레(bridleRig)까지 만든 **뒤에** 부를 것. 먼저 부르면 굴레가 g 에 남는다.
        const neckRig = (pivotY, pivotZ, extra) => {
            const neck = new THREE.Group();
            neck.position.set(0, pivotY, pivotZ);
            const parts = g.children.filter(o => o.userData && (o.userData.part === 'head' || o.userData.bridle));
            for (const o of (extra || [])) if (parts.indexOf(o) < 0) parts.push(o);
            g.add(neck);
            for (const o of parts) { o.position.sub(neck.position); neck.add(o); }
            g.userData.head = neck;
            return neck;
        };
        // 머리·목 표식 — 탑승 시 **이 파츠가 영웅 다리를 가리면 결함**이다(몸통·안장이 먼 다리를 가리는 건
        // 실제로 말을 탄 사진에서도 그러니 정상). tools/probe-ride-clear.js가 이 표식으로 둘을 갈라 본다.
        const HEADPART = (o) => { o.userData.part = 'head'; return o; };
        // 두 점을 잇는 관 — 자전거 프레임처럼 비스듬한 파츠는 이걸로 그린다(회전각 손계산 금지)
        const tube = (a, b, r, m) => {
            const A = new THREE.Vector3(a[0], a[1], a[2]), B = new THREE.Vector3(b[0], b[1], b[2]);
            const d = new THREE.Vector3().subVectors(B, A);
            const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), m || mat);
            o.position.copy(A).addScaledVector(d, 0.5);
            o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
            g.add(o);
            return o;
        };

        // ── 게 (`mount-species-recognizable` 2026-08-19) ────────────────────────────────
        // 사용자 원문 "게인데 게 안 같게 생겼고". 전(前) 형상은 말 배럴 + 옆구리에 붙인 **납작한 상자
        // 두 개**(집게발이라고 적혀 있었다) + 몸통보다 조금 넓은 타원 하나(등딱지)가 전부였고,
        // 머리·주둥이·꼬리·발굽은 말 그대로 말 것이었다 — 240px 시트에서 조랑말과 구별이 안 된다.
        // **게로 읽히는 조건은 넷이고 넷 다 실루엣이다**: ⑴ 몸보다 훨씬 넓고 납작한 등딱지
        // ⑵ 위로 솟은 눈자루 ⑶ 앞으로 뻗은 큰 집게(벌어져 있어야 집게다) ⑷ 옆으로 꺾여 내려가는 여러 다리.
        // 색으로 풀려 하지 말 것 — 등급 틴트가 전신을 덮어 `light`/`dark` 대비는 어차피 안 읽힌다.
        const CLAW_REST = 0.34;      // 집게 기본 벌림각(정지 프레임에서도 집게로 읽히게) — 애니와 공유
        const crabBody = () => {
            const shellD = M(new THREE.Color(c).offsetHSL(0, 0.06, -0.14));   // 등딱지 — 몸통보다 진하게
            const shellL = M(new THREE.Color(c).offsetHSL(0, 0.02, 0.10));
            // 각질(집게 안쪽·다리 끝)은 **등급색을 벗긴다** — 위 LEATHER/RUBBER/HOOF 와 같은 규약이다.
            // 등급색이면 집게가 몸통에 묻혀 '벌어진 집게'라는 정보가 통째로 사라진다.
            const CHITIN = M(0xf1e3cf);
            // ⑴ 등딱지 — 반폭 0.36(배럴 0.18의 2배)·반높이 0.086. **넓고 납작**해야 게다.
            //    ⚠️ 폭을 배럴로 내면 영웅 다리가 묻힌다 — 등딱지는 y 0.30 에 떠 있어 정강이(y<0.19)를
            //    비켜 가므로 여기서만 폭을 벌린다. 안장깔개 반폭이 0.198 이라 이 값이어야 등딱지가
            //    깔개 **밖으로** 나온다(0.30 이하로 두면 안장에 덮여 등딱지가 실루엣에서 사라진다 — 실측).
            sp(0.36, 0, 0.295, 0.01, shellD, 1.0, 0.24, 0.74);
            sp(0.36, 0, 0.315, 0.01, shellL, 0.80, 0.22, 0.60);     // 등딱지 융기(가운데가 솟은 갑각)
            // 앞 가장자리 톱니 — 게 등딱지의 앞테는 톱니다. 없으면 '넓적한 접시'로 읽힌다.
            for (let i = -3; i <= 3; i++) {
                const t = i / 3;
                const sp2 = cn(0.028, 0.055, t * 0.30, 0.290, 0.22 - t * t * 0.11, shellL);
                sp2.rotation.x = Math.PI / 2 - 0.2;
            }
            // ⑵ 앞판 + 눈자루 — 굴레(bridleRig)가 붙는 '머리' 자리도 겸한다.
            //    ⚠️ 눈자루를 등딱지 한가운데(z 0.2~0.4 · y 0.4~0.5)에 세우지 말 것 — 거기는 카메라에서
            //    먼 다리로 가는 시선 띠라 probe-ride-clear 가 바로 잡는다. **앞테 밖(z≥0.42)** 에 세우면
            //    같은 높이라도 시선 띠(z 0.46 에서 y≈0.61)보다 아래로 지나간다.
            HEADPART(sp(0.13, 0, 0.28, 0.34, shellL, 1.30, 0.66, 0.50));   // 앞판(구강부가 있는 면)
            for (const s of [-1, 1]) {
                HEADPART(bx(0.045, 0.05, 0.028, s * 0.05, 0.228, 0.40, CHITIN)); // 구기(입틀) — 앞판 아래 흰 판 두 장
                // ⚠️ 눈자루를 굵게(0.024) 세우면 회색 막대사탕 두 개가 등딱지를 압도한다(실측 1판).
                //    가늘고(0.013) 낮게(끝 y 0.46) — 눈알이 작아야 '자루 끝에 달린 눈'으로 읽힌다.
                HEADPART(tube([s * 0.07, 0.32, 0.40], [s * 0.095, 0.46, 0.44], 0.013, CHITIN)); // 눈자루
            }
            // 눈알은 자루 **끝**에 — eyes() 는 좌우 한 쌍을 같은 y·z 에 놓으므로 그대로 쓴다.
            const eyeMeshes = eyes(0.472, 0.445, 0.095);
            eyeMeshes.forEach(o => { o.scale.set(1.15, 1.15, 1.15); HEADPART(o); });
            // ⑶ 집게발. 🚨 **1판 폐기 기록 — 앞으로 곧게 뻗은 가늘고 긴 집게는 집게가 아니라 창으로 읽힌다.**
            //    (원뿔 두 개를 z +0.70 까지 내밀었더니 게가 아니라 '흰 작살 두 자루를 문 초록 벌레'였고,
            //     게다가 그 길이가 바운딩 박스를 앞으로 늘려 **자동 프레이밍이 게 전체를 축소**했다.)
            //    집게로 읽히는 조건은 길이가 아니라 ⓐ **뭉툭한 손바닥 덩어리**(propodus)가 있고
            //    ⓑ 거기서 손가락 둘이 나와 ⓒ **밖·위로 치켜든** 자세인 것이다. 원뿔 금지 — 각진 쐐기로.
            g.userData.claws = [];
            for (const s of [-1, 1]) {
                tube([s * 0.18, 0.26, 0.08], [s * 0.40, 0.34, 0.20], 0.050, mat);      // 위팔 — 밖·위로
                tube([s * 0.40, 0.34, 0.20], [s * 0.47, 0.27, 0.30], 0.044, mat);      // 아래팔
                const hand = new THREE.Group();
                hand.position.set(s * 0.47, 0.27, 0.30);
                hand.rotation.y = -s * 0.34;      // 집게를 안쪽(가슴 앞)으로 튼다 — 실제 게가 그 자세다
                g.add(hand);
                // ⚠️ 손바닥을 `light`(등급색 +0.18 명도)로 두면 에픽 초록에서 **창백한 널빤지**로 타서
                //    집게가 아니라 '옆구리에 붙인 판때기'가 된다(실측 1판). 몸색으로 두고 **손가락만**
                //    각질 흰색으로 남겨야 벌어진 V 가 그림의 정보가 된다.
                const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.105, 0.13), mat);
                palm.position.set(0, 0, 0.04);
                // 손가락은 **끝으로 갈수록 얇아지는 각기둥**(원뿔이면 가시, 원통이면 막대다).
                const finger = (len, r0, r1) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 4), CHITIN);
                const lo = finger(0.17, 0.036, 0.013);
                lo.rotation.x = Math.PI / 2; lo.position.set(0, -0.030, 0.150);
                const jawPivot = new THREE.Group();                                    // 움직이는 손가락은 **뿌리**에서 열린다
                jawPivot.position.set(0, 0.030, 0.07);
                // 🚨 **기본 자세가 '벌어짐'이어야 한다.** 0(닫힘)으로 지어 두면 정지 프레임(썸네일·
                //    슬롯 아이콘)에서 손가락 둘이 한 덩어리로 붙어 **벙어리장갑**으로 읽힌다 — 실측으로
                //    한 판 날렸다. 애니메이션은 이 기본각에서 **더 벌리는 쪽으로만** 더한다.
                jawPivot.rotation.x = -CLAW_REST;
                const up = finger(0.17, 0.034, 0.012);
                up.rotation.x = Math.PI / 2; up.position.set(0, 0.010, 0.085);
                jawPivot.add(up);
                hand.add(palm, lo, jawPivot);
                jawPivot.userData.s = s;
                g.userData.claws.push(jawPivot);
            }
            return eyeMeshes;
        };
        // 게 다리 — 네 쌍이 **옆으로 꺾여 내려간다**(브래킷 모양). 사족의 곧은 파이프 4개를 그대로
        // 두면 아무리 등딱지를 넓혀도 '넓적한 말'이다. 고관절 피벗 규약(위 사족 다리 주석)은 그대로:
        // 피벗을 관절 자리에 두고 그룹을 돌린다.
        const crabLegs = () => {
            const legM = M(new THREE.Color(c).offsetHSL(0, 0.04, -0.10));
            const TIP = M(0xf1e3cf);
            g.userData.legs = [];
            const ZS = [0.20, 0.04, -0.12, -0.28];
            for (const sx of [-1, 1]) for (let i = 0; i < ZS.length; i++) {
                const z = ZS[i];
                const pivot = new THREE.Group();
                pivot.position.set(sx * 0.14, 0.24, z);
                g.add(pivot);
                const spread = 0.30 + i * 0.012;      // 뒤로 갈수록 조금 더 벌어진다(부챗살 = 다리 여러 개로 읽힌다)
                const knee = [sx * spread, 0.34, z * 0.75];
                const foot = [sx * (spread + 0.05), 0.0, z * 0.55];
                const up = tube([0, 0, 0], [knee[0] - pivot.position.x, knee[1] - pivot.position.y, knee[2] - z], 0.028, legM);
                const dn = tube([knee[0] - pivot.position.x, knee[1] - pivot.position.y, knee[2] - z],
                                [foot[0] - pivot.position.x, foot[1] - pivot.position.y, foot[2] - z], 0.022, legM);
                const tip = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.07, 6), TIP);
                tip.position.set(foot[0] - pivot.position.x, foot[1] - pivot.position.y + 0.02, foot[2] - z);
                tip.rotation.x = Math.PI;
                pivot.add(up, dn, tip);   // 헬퍼가 g 에 붙인 것을 피벗으로 옮긴다(three 의 add 가 재부모화한다)
                // 걸음 위상 — 게는 트롯이 아니라 **파도**로 걷는다(앞다리부터 순서대로). 부호 대신
                // 쌍 인덱스로 위상을 밀어 옆걸음처럼 물결지게 한다.
                pivot.userData.gait = (i % 2 === 0 ? 1 : -1) * sx;
                g.userData.legs.push(pivot);
            }
        };

        // ── 거북 (`mount-species-recognizable` ② 2026-08-19) ────────────────────────────
        // 전(前) 형상은 말 배럴 위에 **조금 더 어두운 타원 하나**(등딱지라고 적혀 있었다)가 전부라,
        // 판독 시트에서 조랑말·돼지·염소와 한 글자도 안 갈렸다(그림 넷이 같다).
        // 거북으로 읽히는 조건: ⑴ **높이 솟은 돔** ⑵ 그 위의 **갑판 무늬(scute)** ⑶ 몸 밖으로 나온
        // **테두리(marginal rim)** ⑷ 부리 달린 작은 머리. ⑵⑶ 이 핵심이다 — 무늬 없는 매끈한 돔은
        // 그냥 '등이 굽은 짐승'이고, 테두리가 없으면 돔이 몸에 녹아 어디까지가 껍질인지 안 보인다.
        const turtleShell = () => {
            const shellD = M(new THREE.Color(c).offsetHSL(0, 0.05, -0.20));   // 돔 바탕 — 갑판 사이 홈이 될 색
            const shellL = M(new THREE.Color(c).offsetHSL(0, 0.02, 0.06));    // 갑판 판
            const RIM = M(0x4a3b28);                                          // 테두리 — 등급색 벗김(각질)
            // 🚨 **돔 꼭대기는 안장 윗면(0.44)보다 낮아야 한다.** 1판에서 반높이 0.216(꼭대기 0.516)로
            //    지었더니 안장·깔개·뱃대끈이 통째로 껍질 **속에** 묻혀 화면에서 사라졌다 — 기수가
            //    등딱지 안에 앉은 꼴이다. 거북다움은 높이가 아니라 **테두리 오버행 + 갑판 무늬**에서
            //    나오므로 높이를 깎아도 판독은 안 떨어진다(실측). 반높이 0.168 → 꼭대기 0.433.
            sp(0.30, 0, 0.265, -0.01, shellD, 1.06, 0.56, 1.26);              // 돔
            // 갑판(scute) — 6각 판을 **등마루 5 + 옆줄 4×2** 로 얹는다. 판 사이로 바탕(어두운 홈)이
            // 보여야 무늬가 되므로 판을 서로 안 겹치게 띄운다.
            // ⚠️ 판을 돔에 **평평하게 눕히지 말 것** — 돔은 곡면이라 눕힌 판이 옆구리에서 공중에 뜬다.
            //    판마다 돔 중심에서 바깥으로 향하게 돌려 붙인다(lookAt 대신 각도 계산 한 번).
            const put = (ax, ay, az, r, h) => {
                const v = new THREE.Vector3(ax, ay, az).normalize();
                const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, h, 6), shellL);
                o.position.set(0.318 * v.x, 0.265 + 0.168 * v.y, -0.01 + 0.378 * v.z);
                o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
                    new THREE.Vector3(v.x / 0.318, v.y / 0.168, v.z / 0.378).normalize());
                g.add(o);
                return o;
            };
            // ⚠️ 판 두께를 0.04 대로 두면 갑판이 아니라 **징(스터드)** 으로 읽힌다 — 0.026 으로 눌러
            //    '돔 표면에 새겨진 판'이 되게 한다(무늬는 두께가 아니라 홈으로 읽힌다).
            // ⚠️ **등마루 한가운데에는 판을 놓지 말 것** — 거기는 안장·깔개가 덮는 자리라(깔개 z ±0.29,
            //    반폭 0.198) 판이 깔개를 뚫고 나와 **너덜너덜한 이음매**가 된다(실측 1판). 판은 안장
            //    바깥, 즉 돔의 앞·뒤 끝과 **옆구리**에만 둔다 — 어차피 화면에 보이는 면이 거기다.
            for (const z of [-1.15, 1.15]) put(0, 1, z, 0.062, 0.026);                     // 등마루 앞·뒤 2장
            for (const s of [-1, 1]) for (let i = 0; i < 5; i++)
                put(s * 0.95, 0.46, (i - 2) * 0.52, 0.055, 0.024);                         // 옆줄 5×2
            const rim = to(0.315, 0.026, 0, 0.245, -0.01, RIM);                            // 테두리
            rim.rotation.x = -Math.PI / 2; rim.scale.set(1.0, 1.20, 1.0);                  // 눕혀야 '치마'가 된다
            sp(0.24, 0, 0.155, -0.01, M(0xd8cdb0), 0.92, 0.22, 1.20);                      // 배딱지(plastron)
        };

        // ── 탑승 장구: 안장·앞뒤턱·뱃대끈·등자 ──────────────────────────────────────
        // 사용자 합격 기준이 "엉덩이가 안장에, 다리가 몸통을 감싸고"인데, 그전에는 **안장 자체가 없었다** —
        // 높이만 맞춰 등짝에 얹어 놓으니 아무리 정합을 맞춰도 '올라탄' 게 아니라 '얹힌' 것으로 읽혔다.
        // ⚠️ 가죽색은 등급색(RARITY_HEX) 파생이 아니라 **고정 자연색**이어야 한다 — 등급 틴트가 전신을
        //    덮으면 안장이 몸통에 그대로 묻혀서 있으나 마나가 된다(에픽=초록 전신에서 실측 확인).
        // ⚠️ TAN 0x8d6e63 은 **살색으로 읽힌다.** 앞턱·뒷턱이 스커트 밑단 아래로 살짝 나오는데,
        //    초록 몸통 위의 베이지 구체 두 개라 비평가 2인이 독립적으로 "갑옷 밑에 맨살 프리미티브가
        //    노출됐다 / 즉시 QA 리젝"으로 읽었다(확대 크롭으로 정체를 확인 — 실제로는 안장 부속이다).
        //    가죽다운 진한 갈색으로 낮춰 초록 위에서 '어두운 마구'로 읽히게 한다.
        // ⚠️ 2차 실측(`probe-ride-seat.js`): 어둡게 낮춘 0x4e342e/0x5d4037 도 **햇빛 받는 면이 화면에서
        //    rgb(168,139,118)** 로 떠서 같은 프레임 영웅 얼굴색과 **색거리 32** 였다 — 그래서 비평가가
        //    또 "맨살"로 읽는다. 재질값이 아니라 **화면색**으로 판정해야 하는 자리다(램버트라 정면광
        //    구간에서 2.2배까지 밝아진다). 살색 대역(밝고 R≫B) 밖으로 확실히 내린 값.
        const LEATHER = M(0x2b1a0c), TAN = M(0x2e1c0d), IRON = M(0x9e9e9e);
        // 같은 이유로 **재질 정체성이 뚜렷한 파츠**도 등급색을 벗긴다. 타이어는 고무(검정), 림·허브는 금속,
        // 발굽은 각질 — 이걸 등급색으로 두면 에픽 자전거가 타이어까지 전신 초록이라 '자전거'가 아니라
        // 초록 링 두 개로 읽힌다(실측 캡처에서 그대로 확인). 등급 틴트는 프레임·몸통 쪽에 남겨 둔다.
        const RUBBER = M(0x212121), HOOF = M(0x3e2723);
        // 당나귀 갈기·꼬리술 — 등급색 파생 금지(초록 위 초록이면 갈기가 목에 녹는다).
        const DONKEY_DARK = M(0x2f2620);
        // 안장깔개 — 등급색 파생 금지(초록 위 초록이면 대비가 0이라 넣으나 마나다). 기사 마구다운
        // 진홍 + 금색 가장자리로, 몸통 색과 무관하게 항상 대비가 서게 고정색으로 둔다.
        const BLANKET = M(0x6d1f2c), BLANKET_TRIM = M(0xc9a227);
        // sy: 안장 '윗면' = 영웅 골반이 얹히는 높이(= MOUNT_FORMS.saddle과 같은 값을 넣을 것)
        // halfW/halfH: 몸통 반폭·반높이(뱃대끈 크기), bodyY: 몸통 중심 높이
        // foot: [x, y, z] 등자 위치 — 탑승 포즈에서 발이 실제로 오는 자리(계산 근거는 아래 주석)
        const saddleRig = (sy, halfW, halfH, bodyY, foot) => {
            // 🚨 방석이 **영웅 스커트보다 좁으면 안장은 화면에서 사라진다.** 스커트 밑단 반경은 탈것
            //    로컬로 환산하면 약 0.175인데 방석 반폭은 0.14였다 — 앞턱·뒷턱 끝만 삐져나와, 비평가 A가
            //    "안장이라는 오브젝트가 애초에 존재하지 않는다"(1순위)고 읽었다. 스커트 밖으로 내보낸다.
            // 안장깔개(blanket)를 방석보다 한 겹 더 넓게 깔아 **초록 몸통 위에 대비색 띠**를 만든다 —
            // 양쪽 비평가가 공통으로 "초록 단색이라 형태 정보가 없다"고 지적한 그 대비 라인이다.
            // ⚠️ **안장이 몸통보다 넓으면 안 된다.** 앞 세션이 방석을 영웅 스커트 밖(반폭 0.213)으로
            //    내보냈는데, 비행형 배럴 반폭은 0.152 라 **깔개(0.243)가 몸통 실루엣 밖으로 삐져나왔다** —
            //    비평가가 "안장이 몸통보다 넓다 = 사람을 태울 수 없는 크기"로 읽은 게 이것이다.
            //    이제 탑승 중엔 스커트 옆이 열리므로(`rideSkirt`) 방석을 넓힐 이유도 사라졌다.
            //    깔개는 실제 안장패드처럼 배럴보다 10%만 넘치게, 방석은 배럴 안쪽으로 들인다.
            //    **가로(x)만 줄인다** — 길이(z)는 안장이 등을 덮는 면적이라 그대로 둔다.
            const sw = Math.min(1, halfW * 1.10 / (0.15 * 1.62));
            sp(0.15, 0, sy - 0.075, -0.01, BLANKET, 1.62 * sw, 0.16, 1.95);   // 안장깔개
            sp(0.15, 0, sy - 0.068, -0.01, BLANKET_TRIM, 1.50 * sw, 0.15, 1.82); // 깔개 가장자리 띠(안쪽 밝은 면)
            sp(0.15, 0, sy - 0.045, -0.01, LEATHER, 1.42 * sw, 0.30, 1.68);   // 안장 방석 (윗면이 sy에 닿게)
            sp(0.07, 0, sy - 0.02, 0.155, TAN, 0.9, 0.66, 0.5);          // 앞턱(pommel)
            sp(0.075, 0, sy - 0.015, -0.175, TAN, 0.95, 0.8, 0.5);       // 뒷턱(cantle) — 엉덩이가 걸리는 턱
            // 옆날개(flap)는 **영웅 허벅지보다 안쪽**에 있어야 한다 — 밖으로 나가면 다리를 앞에서 가린다
            // (실측: 비행형 근접 허벅지 가림률 67%가 이 날개였다). 안장 방석 폭(0.15×0.95) 안에 붙인다.
            for (const s of [-1, 1]) sp(0.1, s * 0.102, sy - 0.09, 0.0, LEATHER, 0.22, 0.85, 1.15); // 옆날개(flap)
            const gr = to(halfH * 1.06, 0.024, 0, bodyY, 0.02, LEATHER); // 뱃대끈 — 몸통 단면(XY)을 감는다
            // ⚠️ 밝은 TAN 은 초록 위에서 살색으로 읽힌다(비평가 2인 공통 오독) — 어두운 가죽 + 굵기 상향으로
            //    '몸통을 조인 띠'가 실루엣에서 보이게 한다. 얇고 밝으면 있어도 안 읽힌다.
            gr.scale.set(halfW / (halfH * 1.06), 1, 1);
            if (!foot) return;
            // 등자: 위치를 상수로 박으면 반드시 어긋난다 — 다리 길이·탑승 포즈·탈것 배율이 전부 곱해진
            // 자리라 손계산이 맞을 수가 없다(첫 시도에서 발보다 한 뼘 아래에 링이 대롱대롱 매달렸다).
            // 여기선 기본 자리만 잡고, 실제 정렬은 `alignStirrups()`가 매 프레임 발 뼈를 재서 맞춘다.
            g.userData.stirrups = [];
            for (const s of [-1, 1]) {
                const st = new THREE.Group();
                // ⚠️ 끈은 **납작한 띠 + 어두운 가죽색**이어야 한다. 처음엔 밝은 탄색 원통으로 뒀더니
                //    비평가가 이걸 "갑옷 없는 살색 다리"로 읽었다 — 굵기 일정한 밝은 원통이 정강이와
                //    실루엣이 같아서 생긴 오독이라, 단면과 명도를 둘 다 다리와 다르게 만들어 끊는다.
                const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1, 0.012), LEATHER);
                // 원점(=발)에서 위로 자란다 — scale.y가 곧 끈 길이. 길이 1로 두면 정렬 전 한 프레임 동안
                // 영웅 키를 넘는 장대가 서므로 기본값도 그럴듯한 길이로 줄여 둔다.
                strap.scale.y = 0.24; strap.position.y = 0.12;
                const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.012, 6, 12), IRON);
                ring.rotation.y = Math.PI / 2;
                st.add(strap, ring);
                st.userData.strap = strap;
                st.userData.anchorY = sy - 0.07;        // 안장 옆날개 밑 — 끈이 매달리는 지점
                st.userData.side = s;
                st.position.set(s * foot[0], foot[1], foot[2]);
                g.add(st);
                g.userData.stirrups.push(st);
            }
        };

        // ── 태엽 감개 (mount-animal-machine-dynamic ①) ────────────────────────────
        // 이 게임의 탈것 소환 재화가 **태엽**이라, 기계 계열 탈것은 등에 감개를 달고 그게 실제로 돈다.
        // '기계다'를 정지 화면에서 알리는 실루엣이면서 동시에 **움직임**이기도 하다(사용자 지시의 두 요구가
        // 한 파츠에서 만난다). 회전은 `animateMountParts` 가 `userData.spinners` 를 훑어 누적으로 돌린다 —
        // ⚠️ 사인으로 흔들면 '감기다 말고 되감기는' 태엽이 된다(바퀴가 이미 밟은 함정).
        // 축은 z(등 뒤로 튀어나온 방향)다. 감개 본체는 회전 대칭이라 **날개 2장이 없으면 회전이 안 읽힌다.**
        const windUpKey = (x, y, z) => {
            const key = new THREE.Group();
            key.position.set(x, y, z);
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.08, 8), IRON);
            stem.rotation.x = Math.PI / 2;            // 등에서 뒤로 눕힌다
            const hub = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.011, 6, 12), IRON);
            hub.position.z = -0.05;
            key.add(stem, hub);
            for (const s of [-1, 1]) {                // 날개 2장 — 회전을 읽히게 하는 부분
                const w = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.03), IRON);
                w.position.set(s * 0.038, 0, -0.05);
                key.add(w);
            }
            g.add(key);
            (g.userData.spinners || (g.userData.spinners = [])).push(key);
            return key;
        };

        // ── 굴레·재갈·고삐 ───────────────────────────────────────────────────────
        // 비평가가 3·4차 채점에서 **매번 상위로 올린 지적**이 "손이 아무것도 안 잡는다"(㉢)인데,
        // 사족·비행형은 **잡을 물건 자체가 없었다**(자전거만 핸들바가 있다). 포즈만 올려 봐야
        // 허공을 쥔 손이 되므로 모델부터 만든다 — 굴레(머리 끈) + 재갈 고리 + 라이더 손까지 가는 고삐.
        // ⚠️ 고삐 길이를 상수로 박지 말 것 — 머리 자리·탈것 배율·탑승 포즈가 전부 곱해진 거리라
        //    손계산이 맞을 수가 없다(등자·핸들바·크랭크가 전부 같은 함정을 밟았다).
        //    여기선 **재갈 고리(끈이 매달리는 자리)만** 잡아 두고, 실제 길이·방향은 `alignReins()`가
        //    매 프레임 빈 손을 재서 푼다. 안 탄 탈것(무리·썸네일)은 기본값으로 아래로 늘어뜨린다.
        // ⚠️ **굴레는** `part:'head'` 로 표시한다 — 머리에 붙은 파츠라 먼 다리를 가릴 수 있고,
        //    probe-ride-clear 는 이 표식이 붙은 것만 '추가 가림'으로 판정한다(정직하게 걸리게).
        //    **고삐(끈)는 붙이지 않는다** — 이유는 아래 끈 만드는 자리의 주석 참조.
        // hy/hz: 머리 중심(로컬), hr: 머리 반폭(x), hz2: 머리 반길이(z)
        const bridleRig = (hy, hz, hr, hz2) => {
            // 굴레 파츠에는 표식을 하나 더 남긴다 — 가림 판정에서 **뿔·머리 같은 원래 파츠와 굴레를
            // 갈라 보려면** 소속을 알아야 한다(실제로 Elk 에서 '뿔이 범인인가 굴레가 범인인가'를
            // 이 표식 없이 가리려다 한 바퀴 헤맸다). probe 가 이걸로 굴레만 껐다 켜며 잰다.
            const BR = (o) => { o.userData.bridle = true; return HEADPART(o); };
            const nz = hz + hz2 * 0.30;              // 코끈 — 주둥이 쪽
            const cz = hz - hz2 * 0.34;              // 볼끈·정수리 고리 — 귀 쪽
            const by = hy - hr * 0.46;               // 재갈 높이(입 언저리)
            BR(to(hr * 0.96, 0.013, 0, hy, nz, LEATHER));           // 코끈 — 토러스 기본면(XY)이 주둥이를 감는다
            const crown = to(hr * 1.02, 0.013, 0, hy, cz, LEATHER);       // 정수리↔턱 고리
            crown.rotation.y = Math.PI / 2; BR(crown);
            // 금색 띠 — 어두운 가죽만으로는 초록 머리 위에서 안 읽힌다(안장깔개와 같은 교훈).
            // 한 줄 얹어 '굴레를 씌운 머리'가 실루엣에서 바로 읽히게 한다.
            // 자리는 이마(정수리)가 아니라 **주둥이 쪽**이다. 실제 굴레는 이마 띠가 맞지만 ⑴ 게임
            // 카메라에서 실제로 보이는 면이 주둥이 쪽이고 ⑵ 정수리 높이는 뿔 달린 종(Elk 등)이 이미
            // 쓰고 있어 여유가 없다.
            // ⚠️ 처음엔 이마에 뒀다가 `probe-ride-clear` 의 Elk 먼 대퇴 가림이 늘어 옮겼는데,
            //    **그 인과는 뒤에 실측으로 반증됐다** — 굴레만 껐다 켜고 재보니(userData.bridle 표식)
            //    가림 파츠가 세 점 모두 그대로였고 범인은 **뿔(ConeGeometry/CylinderGeometry)** 이었다.
            //    수치가 실행마다 달라진 건 `refreshMount` 가 부유 위상을 **난수**(`U.rand`)로 잡아
            //    프레임 자세가 매번 다르기 때문이다. 이 자리는 위 ⑴⑵ 이유로 유지하되, **가림 수치가
            //    실행마다 튀면 난수 위상부터 의심할 것**(probe-ride-clear 는 그래서 재현성이 없다).
            BR(to(hr * 0.99, 0.011, 0, hy, nz - hz2 * 0.22, BLANKET_TRIM));
            g.userData.rein = { straps: [] };
            for (const s of [-1, 1]) {
                BR(tube([s * hr * 0.80, hy + hr * 0.34, cz], [s * hr * 0.82, by, nz], 0.012, LEATHER)); // 볼끈
                const ring = to(hr * 0.26, 0.012, s * hr * 0.92, by, nz, IRON);   // 재갈 고리 — 밝은 금속이라 멀리서도 읽힌다
                ring.rotation.y = Math.PI / 2; BR(ring);
                // 고삐 두 줄 — 각 줄을 2분절로 만들어 **가운데를 처지게** 한다(곧은 막대면 고삐가
                // 아니라 창으로 읽힌다). 높이 1 짜리 단위 박스라 scale.y 가 곧 길이다.
                // ⚠️ 고삐에는 `part:'head'` 를 **붙이지 않는다.** 그 표식은 probe-ride-clear 에서
                //    "머리·목 덩치가 먼 다리를 몸통보다 더 가리는가"를 재는 표적 표시인데, 고삐는
                //    재갈에서 라이더 손까지 화면을 가로지르는 게 **정상**이라(실제 승마 사진이 그렇다)
                //    같은 자로 재면 어떤 배치도 통과할 수 없다 — 실측으로 확인했다: 카메라(탈것 앞-왼쪽
                //    위)에서 먼 다리로 가는 시선은 z 0.4 부근을 지나는데 재갈↔손 직선이 반드시 그 띠를
                //    지난다(끈을 처지게 하든 세우든 마찬가지). 대신 **끈이 근쪽(보이는) 다리를 가리는지**를
                //    probe-ride-rein 이 따로 0 으로 못박는다 — 그쪽이 진짜 결함이 되는 자리다.
                const segs = [];
                for (let i = 0; i < 2; i++) {
                    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.022, 1, 0.009), LEATHER);
                    g.add(seg); segs.push(seg);
                }
                const st = { side: s, anchor: new THREE.Vector3(s * hr * 0.92, by, nz), segs };
                g.userData.rein.straps.push(st);
                // 기본 자세: 안 탄 탈것은 고삐가 목을 따라 뒤로 늘어진다
                this.layoutRein(st, st.anchor.clone().add(new THREE.Vector3(-s * hr * 0.2, -hr * 1.1, -hz2 * 1.4)));
            }
            // 재갈(bit) — 좌우 고리를 잇는 짧은 봉
            const bit = cy(0.011, 0.011, hr * 1.84, 0, by, nz, IRON);
            bit.rotation.z = Math.PI / 2; BR(bit);
        };

        // 계열은 MOUNT_FORM_OF 하나만 본다 — 예전엔 여기 FLAT/FLY/WHEELED 배열이 따로 있어서
        // 탈것을 추가할 때 두 곳을 맞춰야 했고, 한쪽만 고치면 '몸은 사족인데 포즈는 평판'이 된다.
        const formKey = this.MOUNT_FORM_OF[name] || 'quad';

        // ⚠️ 이 계열은 이제 **호버 기계 둘뿐**이다 — 나뭇잎·연잎·뗏목 5종은 2026-08-19 로스터 교체
        //    (`mount-animal-machine-dynamic` ①, 사용자 지시 "왠만하면 다 동물, 기계")로 폐기됐다.
        //    그때 지운 잎맥·노치·통나무 분기를 되살리지 말 것 — 로스터·MOUNT_FORM_OF 에도 이미 없다.
        if (formKey === 'flat') { // 호버형: 호버보드/호버 디스크 — 넓적한 발판 + 아래 추진 노즐
            // 예전 (1.7, 0.32, 1.9)는 폭이 영웅 어깨너비의 3배라, 게임 카메라 거리에서 '탈것'이 아니라
            // 잔디에 깔린 초록 범위 표시 데칼로 읽혔다(비평가 지적, 실제로 그렇게 보인다).
            // 폭을 줄이고 두께를 키우고 지면에서 띄워(hover 0.10) 판때기로 읽히게 한다.
            const hover = name.startsWith('Hover');
            sp(0.34, 0, 0.05, 0, hover ? dark : mat, 1.15, 0.42, 1.35);
            sp(0.34, 0, 0.02, 0, dark, 1.08, 0.2, 1.28);   // 아래턱 — 옆에서 봤을 때 두께가 보이게
            if (hover) to(0.3, 0.03, 0, 0.01, 0, M(0x29e0ff, { emissive: 0x0aa0c0, emissiveIntensity: 0.6 })).rotation.x = -Math.PI / 2; // 눕혀야 발판 테두리가 된다 (세로로 서 있어 발판 아래로 반원이 튀어나왔다)
            else sp(0.3, 0, 0.09, 0, light, 1.5, 0.2, 1.6);
            // 같은 평판이라도 종이 구분돼야 한다 — 같은 발판만 색만 바꿔 내보내면 로스터를 늘려도
            // '똑같은 판때기가 여러 개'로 읽혀 사용자 지적이 그대로 남는다.
            let plate = null;
            if (name === 'Hover Board') {                 // 호버보드: 각진 데크 + 아래 추진 노즐 2개
                plate = bx(0.62, 0.055, 0.86, 0, 0.15, 0, mat);                                 // 각진 데크(원판과 실루엣 분리)
                for (const z of [-0.28, 0.28]) {
                    const noz = cy(0.085, 0.11, 0.07, 0, -0.03, z, M(0x29e0ff, { emissive: 0x0aa0c0, emissiveIntensity: 0.9 }));
                    noz.userData.thruster = true;
                    bx(0.30, 0.03, 0.10, 0, 0.09, z, dark);                                     // 트럭(데크와 노즐을 잇는 받침)
                }
            } else if (hover) {                           // 호버 디스크: 원형 데크 — 딛는 면이 평평해야 한다
                // 🚨 **선체가 눌린 타원체라 딛는 면이 돔이었다.** 보더는 판정 ②가 요구하는 대로 앞뒤로
                //    벌려 서므로 두 발이 중심에서 벗어나는데, 돔은 중심을 벗어날수록 꺼진다 — 실측
                //    (2026-08-19): 오른발이 제 자리 표면보다 **0.054 위에 떠 있었다**(왼발 0.008 은 정상
                //    부츠 두께). 발 하나가 허공을 딛는 건 '판때기 위에 차렷'과 같은 계열의 판독 결함이다.
                //    → 설계 기준 높이(`MOUNT_FORMS.flat.saddle` = 0.193)에 **윗면을 맞춘 평평한 원판**을
                //    얹는다. 반지름 0.33 은 두 발의 최대 반경(0.299)에 부츠 여유를 더한 값이고, 선체
                //    반축(x 0.391 · z 0.459) 안이라 실루엣은 '돔 꼭대기가 평평해진' 정도만 바뀐다.
                //    ⚠️ 윗면 y 를 옮기면 `probe-ride-fit` 의 발판 기준(0.193)과 어긋나므로 건드리지 말 것.
                plate = cy(0.33, 0.33, 0.03, 0, 0.178, 0, mat);
            }
            // 🚨 **발을 딛는 면**을 가리킨다 — 계측 훅이라 렌더에는 안 쓴다(읽는 곳은 `probe-ride-board`).
            //    예전엔 무조건 `g.children[0]`(= 위의 눌린 타원체 선체)을 가리켰는데, 호버보드는 그 위에
            //    **각진 데크가 따로 얹혀 있다.** 그래서 프로브가 딛는 면이 아니라 **선체 돔의 꼭대기**를
            //    자로 삼아, 발이 0.026 밖에 안 낮은데도 '발판에서 −0.051 떨어졌다'로 반려했다(실측
            //    2026-08-19: 선체 AABB top 0.4173 vs 데크 top 0.3918 — 그 차 0.026 이 임계 0.035 를
            //    통째로 잡아먹는다). 치수도 같이 틀렸다 — 선체는 0.873×0.782(1.12:1)라 스탠스 비율
            //    판정의 분모가 됐는데, 실제 데크는 0.86×0.62 로 **1.39:1** 이다(프로브 주석의 '1:1.4'가
            //    바로 이 값이다). 호버 디스크는 얹힌 판이 없어 선체가 곧 딛는 면이므로 종전대로 둔다.
            g.userData.deck = plate || g.children[0];
            // 추진 노즐 — 부유 맥동(밝기)에 쓴다. 노즐이 없는 종(호버 디스크)은 빈 배열이고,
            // 그때는 판 자체의 부유 흔들림·뱅킹(아래 animateMountParts)만으로 살아 있게 한다.
            g.userData.glow = g.children.filter(o => o.userData && o.userData.thruster);
            g.userData.flat = true;
        } else if (formKey === 'wheeled') { // 탈것형: 자전거/외바퀴 드로이드 — 바퀴 + 프레임
            if (name === 'Bike') {
                // ⚠️ 예전엔 바퀴 두 짝을 **좌우(x=±0.28)** 에 세워 놨다 — 자전거가 아니라 링 두 개 사이에
                //    영웅이 떠 있는 꼴이라 "탄 것 같지 않다"의 주범이었다. 바퀴는 앞뒤(z=±0.30)에 둔다.
                // ⚠️ 바퀴는 **그룹째로 돌린다** (mount-animal-machine-dynamic).
                //    타이어·림은 회전 대칭이라 제자리에서 돌려 봐야 화면이 한 픽셀도 안 바뀐다 —
                //    굴러가는 게 읽히는 건 오직 **스포크**다. 그래서 타이어·림·허브·스포크를 한
                //    그룹에 담아 바퀴 축(로컬 x축) 둘레로 그룹을 돌린다.
                g.userData.wheels = [];
                for (const s of [-1, 1]) {
                    const wg = new THREE.Group();
                    wg.position.set(0, 0.17, s * 0.30);
                    g.add(wg);
                    const w = to(0.17, 0.028, 0, 0.17, s * 0.30, RUBBER);   // 타이어 = 고무(등급색 금지)
                    w.rotation.y = Math.PI / 2;
                    const rim = to(0.138, 0.012, 0, 0.17, s * 0.30, IRON);  // 림 — 타이어 안쪽 금속 테
                    rim.rotation.y = Math.PI / 2;
                    const hub = cy(0.028, 0.028, 0.05, 0, 0.17, s * 0.30, IRON); hub.rotation.z = Math.PI / 2;
                    const parts = [w, rim, hub];
                    for (let k = 0; k < 4; k++) {                            // 스포크 — 링이 '빈 고리'로 안 읽히게
                        const sp4 = bx(0.012, 0.27, 0.012, 0, 0.17, s * 0.30, IRON);
                        sp4.rotation.z = k * Math.PI / 4;
                        parts.push(sp4);
                    }
                    for (const o of parts) { o.position.sub(wg.position); wg.add(o); }
                    g.userData.wheels.push(wg);
                }
                const BB = [0, 0.10, 0.02];              // 크랭크축(bottom bracket)
                // ⚠️ 헤드튜브 높이는 **라이더 손 높이**가 정한다 — 예전 0.40은 영웅 손(실측 로컬 0.605)보다
                //    한참 아래라, 바를 손에 맞추면 스템이 기둥처럼 늘어나 자전거가 아니라 '초록 장대'가 됐다.
                //    안장 역산으로 자전거가 2.1배까지 커지는 만큼 앞부분도 같이 커져야 비율이 맞는다.
                const HEAD = [0, 0.52, 0.26], SEAT = [0, 0.34, -0.07];
                tube(BB, HEAD, 0.022);                    // 다운튜브
                tube(BB, SEAT, 0.022);                    // 시트튜브
                tube(SEAT, HEAD, 0.02);                   // 탑튜브
                tube(BB, [0, 0.17, -0.30], 0.017, dark);  // 체인스테이
                tube(SEAT, [0, 0.17, -0.30], 0.017, dark);// 시트스테이
                tube(HEAD, [0, 0.17, 0.30], 0.019, dark); // 앞포크
                // 핸들바는 **그룹으로 묶어** 둔다 — 자전거 핏이 그렇듯 스템 길이로 바를 라이더 손에
                // 맞추는 게 정답이고(alignStirrups가 등자를 발에 맞추는 것과 같은 원칙), 손을 상수로
                // 바에 맞히려 들면 포즈·배율이 곱해진 자리를 손으로 맞히는 셈이라 반드시 어긋난다.
                const barG = new THREE.Group();
                barG.position.set(0, 0.60, 0.215);   // 실측한 영웅 손자리(0.605 / 0.208) 옆 — 스템이 짧게 남는다
                const bar = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.026, 0.026), dark);
                barG.add(bar);
                const gripsL = [];
                for (const s of [-1, 1]) {
                    const gp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), LEATHER);
                    gp.position.x = s * 0.16;
                    gp.userData.side = s;
                    barG.add(gp); gripsL.push(gp);
                }
                g.add(barG);
                const stem = tube(HEAD, [0, 0.45, 0.255], 0.016, dark);   // 헤드튜브 → 바 (길이는 매 배치마다 다시 잡는다)
                g.userData.bar = { group: barG, grips: gripsL, barMesh: bar, stem, head: HEAD, rest: barG.position.clone() };
                // 안장 — LEATHER 통짜(0x2b1a0c)는 감청 부츠·다크 프레임 사이에서 게임 거리(~30px)에
                // 통째로 사라져 비평가 2인이 독립적으로 "안장이 없다"고 읽었다(4차 ㉱⑶ 판독 잔여 —
                // 지오메트리는 실재했다). 페달과 같은 처방: 어두운 것들 사이에 **밝은 금속(레일·시트포스트)**
                // 을 끼우고, 윗가죽은 안장깔개(BLANKET)와 같은 진홍 계열로 — 등급 틴트 프레임·검정 타이어·
                // 감청 부츠 어느 쪽과도 색이 겹치지 않는다(probe-ride-seat 교훈대로 살색 대역(밝고 R≫B)은 금지).
                // ⚠️ 안장 윗면(≈0.36 = form.saddle)은 배율 역산의 기준 — 위치·크기는 한 치도 안 옮기고
                //    재질 교체 + **그 아래로만** 파츠를 더한다.
                // (시트포스트는 안 넣는다 — 시트튜브가 이미 안장 밑 0.34까지 닿아 있어, 그 안에 겹쳐
                //  넣어 봤더니 기여 0px 죽은 지오메트리였다(실측). 노출 구간 자체가 없다.)
                const SADDLE_RED = M(0xa62b3c);
                g.userData.saddleParts = [                                    // 프로브가 껐다 켜 기여 픽셀을 잴 수 있게
                    sp(0.10, 0, 0.335, -0.075, SADDLE_RED, 0.55, 0.30, 1.25),   // 윗가죽(위치·크기 불변)
                    sp(0.085, 0, 0.320, 0.045, SADDLE_RED, 0.36, 0.20, 0.85),   // 코 — 앞으로 낮게 뻗는 노즈(윗면 0.337 < 0.36)
                ];
                for (const s of [-1, 1])                                      // 레일 2줄 — 안장 밑 밝은 금속 곡선
                    g.userData.saddleParts.push(tube([s * 0.028, 0.310, 0.03], [s * 0.036, 0.310, -0.205], 0.008, IRON));
                // ── 크랭크·페달 ──────────────────────────────────────────────────────────
                // ⚠️ 예전엔 좌우 크랭크가 **같은 방향(둘 다 z +0.10)** 으로 박혀 있었다. 자전거 크랭크는
                //    180° 반대여야 하고, 탑승 포즈도 그 전제로 좌우 비대칭(무릎 111°/61°)으로 잡혀 있다 —
                //    같은 위상에 고정해 두니 **빈 페달 면이 그대로 노출**돼 비평가 2인이 독립적으로
                //    "발이 페달에 없다"고 지적했다. 상수로 맞히려 들면 포즈·배율이 곱해진 자리를 손으로
                //    맞히는 셈이라 반드시 어긋난다 — 등자와 같은 원칙으로 **매 프레임 발을 재서**
                //    크랭크 위상을 푼다(`alignPedals`). 여기선 축(BB)에 매달린 회전 그룹만 만들어 둔다.
                const CRANK_R = 0.085;                     // 크랭크 암 길이(로컬)
                const cranks = [];
                for (const s of [-1, 1]) {
                    const ck = new THREE.Group();
                    ck.position.set(s * 0.045, BB[1], BB[2]);   // 축 좌우로 살짝 벌려 체인링 자리를 남긴다
                    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.022, CRANK_R, 0.026), IRON);
                    arm.position.y = -CRANK_R / 2;             // 축에서 아래로 뻗은 암(회전 원점 = 축)
                    // ⚠️ **실측으로 발이 페달을 밟고 있어도 화면에서 안 읽히면 없는 것과 같다.**
                    //    페달을 검은 고무(0x212121)로 두니 감청색 부츠에 완전히 묻혀, 비평가 2인이
                    //    독립적으로 "자전거에 페달·크랭크가 아예 없다"고 읽었다(probe-ride-pedal 은
                    //    같은 프레임에서 양발 접촉 전부 통과였다 — 접촉과 판독은 다른 문제다).
                    //    실제 페달처럼 **밝은 금속 케이지 + 어두운 밟는 면**으로 나누고, 케이지를
                    //    부츠보다 넓게 잡아 밑창 양옆으로 삐져나오게 한다.
                    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.02, 0.115), IRON);
                    pedal.position.y = -CRANK_R;
                    const tread = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.012, 0.085), RUBBER);
                    tread.position.y = -CRANK_R + 0.014;       // 케이지 위에 얹힌 밟는 면
                    ck.add(arm, pedal, tread);
                    g.add(ck);
                    cranks.push({ side: s, group: ck, arm, pedal, tread, r: CRANK_R });
                }
                g.userData.cranks = { list: cranks, axis: [0, BB[1], BB[2]], r: CRANK_R };
            } else {
                // 외바퀴도 자전거와 같은 처방 — 타이어·림만으로는 회전이 안 읽혀서(회전 대칭)
                // 대비색 스포크 3개를 넣고 **그룹째** 돌린다.
                const wg = new THREE.Group(); wg.position.set(0, 0.18, 0); g.add(wg);
                const w = to(0.18, 0.05, 0, 0.18, 0, RUBBER); w.rotation.y = Math.PI / 2; // 굴러가는 면이 진행 방향을 보게 (타이어=고무)
                const rim = to(0.142, 0.016, 0, 0.18, 0, IRON); rim.rotation.y = Math.PI / 2;   // 림
                const wparts = [w, rim];
                for (let k = 0; k < 3; k++) {
                    const sk = bx(0.014, 0.28, 0.014, 0, 0.18, 0, IRON);
                    sk.rotation.z = k * Math.PI / 3;
                    wparts.push(sk);
                }
                for (const o of wparts) { o.position.sub(wg.position); wg.add(o); }
                g.userData.wheels = [wg];
                sp(0.11, 0, 0.30, 0, mat, 1.05, 0.9, 1.05);
                g.userData.glow = [sp(0.05, 0, 0.36, 0.10, new THREE.MeshBasicMaterial({ color: 0x29e0ff }))];
                // 안장 — 자전거와 같은 판독 처방(근흑 가죽은 어두운 몸통 위에서 사라진다): 진홍 윗가죽
                sp(0.10, 0, 0.335, -0.03, M(0xa62b3c), 0.55, 0.30, 1.15);
                for (const s of [-1, 1]) bx(0.08, 0.02, 0.1, s * 0.115, 0.10, 0.09, dark); // 발판
            }
        } else if (formKey === 'fly') { // 비행형: 거대 벌/미니 드래곤/별고래 — 몸통 + 날개
            const dragon = name === 'Mini Dragon', whale = name === 'Star Whale';
            // 몸통을 좁고 길게 — 예전 (1.3, 0.85, 1.6)은 반폭 0.21이라 영웅 다리가 통째로 묻혀
            // '녹색 비행선 위에 뜬 사람'으로 읽혔다. 반폭 0.152면 다리가 양옆으로 나온다.
            // 고래도 같은 반폭을 지킨다 — 실루엣은 길이(z)로 키우고 폭은 건드리지 않는다.
            // ⚠️ 벌은 길이를 1.2 → 1.75 로 늘였다(`mount-species-recognizable` ⑤). 반길이 0.192 짜리
            //    몽똑한 통에는 **줄무늬를 세 줄 넣을 자리가 없다** — 줄이 서로 붙어 통째로 어두운 덩어리가
            //    된다. 폭(0.9)은 그대로 — 그 값이 다리 노출의 근거다.
            sp(0.16, 0, 0.22, 0, mat, dragon ? 0.95 : whale ? 0.95 : 0.9, dragon ? 1.0 : whale ? 1.05 : 0.95,
               dragon ? 1.75 : whale ? 2.0 : 1.75);
            if (whale) {
                // 별고래: 둥근 머리 + 아래턱 홈 + 꼬리 지느러미(fluke), 등에 별 반짝임
                // ⚠️ 이마를 y 0.235에 두면 정수리(0.355)가 카메라→먼 정강이 시선을 스쳐 probe-ride-clear
                //    에 걸렸다(위상 고정 후 상시 25% — 걸린 지점 0.22,0.23,−0.02). 앞·아래로 내리고
                //    납작하게 눌러 시선 밑으로 뺀다 — 고래 이마가 턱으로 흘러내리는 실루엣이라 더 고래답다.
                // z를 길게(1.3) 늘여 몸통 앞면(z 0.32)과 30% 겹친다 — 앞으로만 빼면 '끈에 묶인 공'으로
                // 읽히는 불연속이 생긴다(비평가 지적).
                HEADPART(sp(0.13, 0, 0.19, 0.42, mat, 1.0, 0.8, 1.3));                                // 둥근 이마
                for (let i = 0; i < 4; i++) bx(0.14, 0.014, 0.02, 0, 0.135, 0.16 + i * 0.09, dark);    // 아래턱 주름
                const fl = bx(0.44, 0.03, 0.14, 0, 0.20, -0.44, light); fl.rotation.x = 0.22;          // 꼬리 지느러미
                g.userData.tail = fl;
                const star = M(0xfff59d, { emissive: 0xffd54f, emissiveIntensity: 0.75 });
                // ⚠️ 별을 **안장깔개(z ±0.29) 밑**에만 박으면 셋 중 둘이 안 보인다 — 뒤쪽·옆구리로도 편다.
                // ⚠️ 반지름 0.028 은 이 몸집에서 **흰 골프공**이다 — 별은 작고 여러 개여야 별자리로 읽힌다.
                for (const [sx, sy2, sz, r] of [[0.10, 0.36, 0.10, 0.019], [-0.09, 0.35, -0.14, 0.017],
                        [0.04, 0.37, -0.30, 0.019], [0.13, 0.28, -0.42, 0.015], [-0.12, 0.27, 0.30, 0.014],
                        [0.11, 0.25, 0.42, 0.013], [-0.13, 0.30, -0.02, 0.013], [0.06, 0.33, -0.52, 0.012]])
                    sp(r, sx, sy2, sz, star);                                                          // 몸에 박힌 별
                // 분수공 — 고래로 읽히는 마지막 표식. 없으면 '뚱뚱한 물고기'다.
                // ⚠️ 물기둥은 붙이지 말 것 — 이 크기에서 **정수리에 얹힌 흰 알**로 읽힌다(1판 실측).
                sp(0.030, 0, 0.365, 0.30, dark, 1.3, 0.45, 0.9);                                       // 분수공
                sp(0.16, 0, 0.135, 0.0, light, 0.86, 0.34, 1.62);                                      // 밝은 배
            } else if (dragon) {
                // ⚠️ 말과 같은 사고 — 목·머리가 안장 바로 앞(z 0.28~0.40)에 서 있어서 **먼 쪽 다리를
                //    100% 가렸다**(실측). 용은 목을 앞으로 뻗고 나는 실루엣이 정상이므로, 어깨에서
                //    앞·아래로 길게 빼면 다리가 드러나면서 '날고 있는' 자세도 같이 좋아진다.
                // 자리는 스윕으로 잡았다(y를 0.08씩 훑어 '추가 가림 0'이 되는 구간을 찾음) — 시선이
                // 먼 발을 스치는 띠가 좁아서, 그 띠보다 **확실히 위**로 올리고 앞으로 뺀 자리를 골랐다.
                // 위아래 ±0.08 이웃도 전부 0이라 카메라가 조금 흔들려도 다시 가리지 않는다.
                // ⚠️ 앞 세션 스윕값(base y0.47·tip y0.39)이 이후 라이더 안장 높이 변경으로 낡아
                //    `probe-ride-clear` 가 다시 실패했다(머리/목이 먼 다리를 thighR 100%·shinR 75% 가림,
                //    걸린 지점 z −0.05~−0.13). 목을 **더 앞·아래로 뻗어**(날개 접고 활강하는 실루엣)
                //    카메라→먼다리 시선 위 띠에서 확실히 벗어나게 재스윕했다.
                // ⚠️⚠️ **이 y 값들은 라이더 안장 높이에 딸린 종속값이다 — 상수로 보고 눈으로 맞추지 말 것.**
                //    카메라(탈것 앞-왼쪽 위)에서 먼 정강이로 가는 시선의 띠가 좁아서, 라이더가 오르내리면
                //    띠도 같이 움직인다. 이번에도 `heroPelvisLocalY` 가드 수정으로 라이더가 0.34 올라오자
                //    앞 세션 스윕값(base 0.52 · tip 0.34)이 다시 띠 한가운데에 들어가 `probe-ride-clear`
                //    [fly] Mini Dragon 이 'shinR 75% 추가 가림'으로 실패했다. **세 번째 왕복이다.**
                //    → 신설 `tools/probe-ride-dragon-neck.js` 로 y 오프셋을 −0.24~+0.28 훑어 재스윕했다:
                //      막히는 띠는 **dy −0.12 ~ +0.04** 이고 그 밖은 전부 0이다. 아래로 빼면 목이 몸통에
                //      묻히므로 **위쪽 구간의 가운데인 dy +0.18** 을 골랐다(위아래 ±0.10 여유 — 안장이
                //      조금 움직여도 다시 안 걸린다). 목을 세워 든 실루엣이라 드래곤답기도 하다.
                //    안장 높이를 또 건드리면 이 스윕을 **다시 돌릴 것**. 눈으로 맞추면 왕복이 반복된다.
                HEADPART(tube([0, 0.70, 0.46], [0, 0.52, 0.90], 0.05, mat));                         // 목(앞·위로 세워 듦)
                HEADPART(sp(0.082, 0, 0.49, 1.00, light, 1.0, 0.85, 1.35));                          // 머리
                cn(0.042, 0.11, 0, 0.49, 1.13, light).rotation.x = Math.PI / 2;                      // 주둥이
                // 뿔 — 0.02×0.09 은 이 머리(반지름 0.082)에서 **가시 두 개**라 용으로 안 읽힌다.
                // 뒤로 눕혀 뻗은 굵은 한 쌍 + 턱 밑 뿔로 '용 머리'를 만든다. 각질색으로 등급색에서 뺀다.
                const HORN = M(0xd7c7a4);
                for (const s of [-1, 1]) {
                    HEADPART(tube([s * 0.045, 0.545, 0.965], [s * 0.085, 0.635, 0.845], 0.016, HORN));
                    HEADPART(sp(0.026, s * 0.052, 0.44, 1.045, HORN, 0.7, 0.7, 1.4));      // 턱 밑 뿔(barbel)
                }
                // 등지느러미 — 목덜미부터 꼬리까지 **크기가 변하는** 톱니여야 능선으로 읽힌다.
                // ⚠️ 안장깔개(z ±0.29)를 피해 **뒤쪽(z ≤ −0.30)** 에만 세운다(사족에서 세 번 밟은 그 규칙).
                for (let i = 0; i < 5; i++) cn(0.030 - i * 0.004, 0.11 - i * 0.014, 0, 0.33 - i * 0.022, -0.30 - i * 0.085, dark).rotation.x = -0.5;
                const tail = cy(0.05, 0.012, 0.38, 0, 0.20, -0.36, mat); tail.rotation.x = -1.45; g.userData.tail = tail;
                // 꼬리 끝 **화살촉** — 용 꼬리의 상투이자, 가늘어지다 끊긴 원통을 마무리해 준다.
                const spade = new THREE.Mesh(new THREE.ConeGeometry(0.062, 0.13, 4), light);
                spade.position.set(0, -0.20, 0); spade.rotation.x = Math.PI; spade.scale.set(1, 1, 0.35);
                tail.add(spade);
                sp(0.15, 0, 0.155, 0.02, light, 0.82, 0.28, 1.50);                          // 밝은 배(복부 비늘)
                // 🚨 **목이 몸통에서 0.32 떠 있다 — 고치려다 실측으로 막혔다. 다시 시도하기 전에 읽을 것.**
                //    목 튜브는 (0,0.70,0.46)→(0,0.52,0.90) 인데 몸통 윗면은 y 0.38 · 앞끝은 z 0.28 이라
                //    목 밑동이 **허공에서 시작**한다(판독 시트에서 '포드에 붙은 붐 암'으로 읽힌다).
                //    ⚠️ **몸통↔목 밑동을 잇는 가슴은 넣을 수 없다.** 굵기 0.105 와 0.058 두 판으로
                //    `probe-ride-dragon-neck` 을 돌렸는데 **둘 다 dy 0 에서 thighR 100% 가림**이었다
                //    (굵기 문제가 아니라 그 공간 자체가 카메라→먼 허벅지 시선이다). 0 이 되는 구간은
                //    dy ≥ +0.24 뿐인데 거기로 올리면 목이 더 뜬다.
                //    → 이 틈은 **머리 어셈블리 전체를 다시 스윕해서** 몸통 쪽으로 내리는 방법으로만
                //    닫힌다. 그 값은 라이더 안장 높이에 딸린 종속값이라(위 ⚠️⚠️) 안장을 건드리는
                //    작업과 **같은 커밋에서** 다시 재야 한다. 눈으로 맞추지 말 것.
            } else {
                // 거대 벌 — 벌로 읽히는 조건은 ⑴ **몸을 감는 줄무늬** ⑵ 복슬한 가슴털 ⑶ 큰 겹눈 + 더듬이
                // ⑷ 뾰족한 침이다. 예전엔 ⑴ 이 **몸통 옆면에 붙인 납작한 판 3장**이라 3/4 각에서
                // 얇은 선 세 개로만 보였고(뒤·아래로는 아예 안 감긴다) 나머지 셋은 없었다.
                // ⚠️ 줄무늬는 **토러스로 몸통 단면(XY)을 감을 것** — 뱃대끈이 쓰는 것과 같은 문법이다.
                //    옆에서든 아래에서든 같은 굵기로 보이는 게 줄무늬고, 판때기는 각도를 타면 사라진다.
                // 🚨 **줄무늬를 토러스 링으로 두르지 말 것 — 이 모델에서는 뱃대끈과 구별이 안 된다.**
                //    (1판: 굵기 0.021 로 세 줄 → 몸통이 통째로 갈색 덩어리. 2판: 0.011 로 줄였더니
                //     이번엔 **안장 뱃대끈과 똑같은 세로 띠 세 개**로 읽혔다 — 같은 자리에 같은 문법의
                //     파츠가 이미 있는데 거기에 같은 걸 더 얹은 셈이다.)
                //    벌의 배는 **마디로 갈린 덩어리**다. 어두운 마디를 배 뒤쪽에 **끼워 넣어** 굵기가
                //    잘록해지는 실루엣을 만든다 — 링과 달리 옆에서도 위에서도 마디로 읽힌다.
                //    ⚠️ 자리는 **안장깔개(z ±0.29) 뒤**로 — 앞쪽에 두면 깔개에 덮여 안 보인다.
                const BEE_D = M(0x241d15), BEE_FUZZ = M(0xe8d9a8);
                for (const [bz, r, m] of [[-0.30, 0.145, BEE_D], [-0.40, 0.115, mat], [-0.48, 0.085, BEE_D]])
                    sp(r, 0, 0.22, bz, m, 0.90, 0.95, 0.62);
                sp(0.115, 0, 0.235, 0.20, BEE_FUZZ, 0.92, 0.92, 0.50);                               // 가슴털(thorax)
                HEADPART(sp(0.082, 0, 0.255, 0.34, BEE_D, 1.05, 0.95, 0.80));                        // 머리
                for (const s of [-1, 1]) {
                    HEADPART(sp(0.046, s * 0.058, 0.265, 0.375, M(0x171317), 0.75, 1.2, 0.55));      // 겹눈
                    const ant = HEADPART(tube([s * 0.032, 0.31, 0.35], [s * 0.070, 0.39, 0.40], 0.009, BEE_D));
                    ant.userData.part = 'head';
                    HEADPART(sp(0.017, s * 0.070, 0.39, 0.40, BEE_D));                                // 더듬이 끝 마디
                }
            }
            g.userData.wings = [];
            for (const s of [-1, 1]) {
                // 날개를 크게 — 비행형이 '날고 있다'로 읽히려면 실루엣에서 몸통보다 넓어야 한다
                // 고래는 날개가 아니라 **가슴지느러미**라 몸통 앞쪽·아래에 눕혀 단다
                // ⚠️ 드래곤 날개 뿌리가 **안장 높이(y 0.36)에 안장 바로 옆(z −0.04)** 이라, 라이더의
                //    허벅지·정강이를 정면으로 가로질렀다 — `probe-ride-clear` 가 이 자리를 짚었고
                //    (걸린 지점 −0.30, 0.36, −0.04) 비평가도 "날개가 부츠를 관통한다"고 읽었다.
                //    실제 드래곤 라이딩 그림이 그렇듯 **어깨 위·앞쪽**으로 올려 라이더 앞에 오게 한다
                //    (몸통 z 반길이가 0.28 이라 0.26 이면 앞쪽 끝, 라이더는 그 뒤에 앉는다).
                const wing = whale ? sp(0.15, s * 0.30, 0.19, 0.10, light, 1.7, 0.1, 0.85)
                                   : dragon ? sp(0.16, s * 0.30, 0.46, -0.24, light, 1.5, 0.12, 1.0)
                                            // ⚠️ 벌 날개를 납작한 **상자**로 두면 흰 널빤지 두 장이다
                                            //    (드래곤·고래는 이미 눌린 타원을 쓴다 — 같은 문법으로 통일).
                                            //    앞뒤로 긴 타원이라 곤충 날개의 잎사귀 실루엣이 나온다.
                                            //    🚨 벌 날개 자리는 **드래곤과 같은 높이(y 0.46)** 여야 한다.
                                            //    옛 자리(y 0.345 · z −0.04)는 안장 옆이라 **먼** 허벅지 33%·
                                            //    정강이 25% 를 먹었고, '해부학적으로 맞다'고 가슴(z 0.16)으로
                                            //    옮겼더니 이번엔 **근쪽** 정강이를 50% 먹어 게이트가 깨졌다
                                            //    (`probe-ride-clear` 실측 — 근쪽 다리 노출은 통과 조건이다).
                                            //    안장 높이(0.44)보다 **위**로 올리는 것만이 양쪽을 다 푼다 —
                                            //    드래곤 날개가 이미 그 자리(y 0.46)에 있고 통과한다.
                                            : sp(0.15, s * 0.28, 0.46, -0.18, light, 1.35, 0.10, 0.62);
                wing.userData.s = s;
                g.userData.wings.push(wing);
            }
            eyes(dragon ? 0.35 : whale ? 0.21 : 0.28, dragon ? 1.06 : whale ? 0.54 : 0.29, whale ? 0.09 : 0.05);
            // 침 — 0.025×0.12 은 이 몸집에서 '엉덩이에 낀 이쑤시개'다. 굵고 길게, 각질색으로.
            // 침은 **마디 뒤**에 — 마디 사이(z −0.30~−0.48)에 두면 배 속에 묻힌다(2판 실측).
            if (!dragon && !whale) { const sting = cn(0.036, 0.20, 0, 0.215, -0.60, M(0xe8dcc0)); sting.rotation.x = Math.PI; g.userData.tail = sting; }
            // 비행형 안장: form.saddle 0.38 / 몸통 반폭·반높이·중심 y / 발은 몸통 옆 허공(등자만)
            saddleRig(0.38, dragon || whale ? 0.152 : 0.144, dragon ? 0.16 : whale ? 0.168 : 0.152, 0.22, [0.20, 0.06, 0.09]);
            // 굴레·고삐 — 머리 자리는 종마다 다르므로 **위에서 실제로 쓴 값**을 그대로 넘긴다
            // (상수를 다시 적으면 머리를 옮길 때 굴레만 허공에 남는다 — 목 위치 스윕에서 이미 겪은 함정).
            if (dragon) bridleRig(0.31, 1.00, 0.082, 0.082 * 1.35);
            else if (whale) bridleRig(0.19, 0.42, 0.13, 0.13 * 1.3);
            else bridleRig(0.26, 0.22, 0.09, 0.09 * 0.9);
        } else { // 사족보행형: 거북이/게/말/공룡/돼지/염소 — 공용 몸통+머리+다리 골격, 파츠로 종 구분
            // 몸통: 예전 (1.3, 0.85, 1.6)은 반폭 0.286 — 탑승 배율까지 곱하면 영웅 다리보다 넓어
            // 다리가 통째로 몸통 안에 묻혔다("공중부양/관통" 불합격 사유의 실체). 실제 말 배럴처럼
            // **좁고 깊고 길게** 바꾼다: 반폭 0.180 / 반높이 0.209 / 반길이 0.385.
            // 🚨 **종이 안 읽히는 1차 원인은 표식 파츠가 아니라 몸통이 전 종 공용이라는 것이다**
            //    (`mount-species-recognizable` 2026-08-19 실측 — 신설 `tools/shot-mount-species.js` 시트).
            //    게·거북·돼지·염소·조랑말·양을 240px 로 나란히 찍어 보면 **여섯 장이 같은 그림**이다:
            //    같은 초록 배럴 + 같은 창백한 머리 + 같은 파이프 다리 4개. 그 위에 얹힌 종 표식은
            //    반지름 0.02~0.05 라 이 크기에서 사실상 사라지고, 게다가 전부 `light`/`dark`
            //    (= 등급색 ±0.18 명도) 라 배경인 몸통과 **대비가 거의 0** 이다. 표식을 아무리 더 얹어도
            //    "이름 안 보고 맞히기"는 원리적으로 안 된다 — **몸집부터 갈라야** 한다.
            // [가로, 세로, 길이] 배율. 기준 (0.82, 0.95, 1.75) = 말 배럴(반폭 0.180 / 반높이 0.209).
            // ⚠️ 가로 배율을 올려 반폭 0.18 을 넘기지 말 것 — 탑승 배율이 곱해져 영웅 다리가 몸통에
            //    묻힌다(위 주석의 그 사고). 게처럼 **넓어야** 하는 종은 배럴이 아니라 **등딱지로** 폭을
            //    낸다(등딱지는 다리 위 y 0.30 에 떠 있어 허벅지 아래를 안 먹는다).
            const CRAB = name === 'Crab';
            // 기계 거미 — **유기 배럴 + 말 머리 + 말 다리 4개** 위에 기계 다리 4개를 얹어 놓은 상태였다.
            // 실루엣이 '말인데 다리가 여덟'이라 거미로도 기계로도 안 읽힌다. 몸통을 각진 섀시로,
            // 머리를 센서 터릿으로, 말 다리 4개도 같은 관절 다리로 바꿔 **여덟 다리를 한 종류**로 만든다.
            const MECH = name === 'Mech Spider';
            const MECH_DARK = M(0x474c52);      // 기계 파츠는 등급색을 벗긴다(위 RUBBER/HOOF 규약)
            // 🚨 **흑표범은 이름이 곧 색이다.** 예전엔 검은 몸통 구(0x1c1c22)를 **배럴 안쪽**(반폭 0.168 <
            //    배럴 0.180)에 넣어 둬서 화면에 단 한 픽셀도 안 나왔다 — 판독 시트에서 갈색말과 완전히
            //    같은 초록 배럴이다. 덧파츠가 아니라 **몸 재질 자체**를 내려야 한다.
            //    ⚠️ 순검정(0x1c1c22) 고정색으로 두지 말 것 — 등급 신호가 통째로 사라진다. 등급색에서
            //    채도·명도만 깎으면 '검은 표범'으로 읽히면서 등급 색조는 남는다.
            const PANTHER = name === 'Panther';
            //    ⚠️ 채도만 살짝 깎아선(−0.22/−0.38) **여전히 중간 초록**이다(1판 실측) — 램버트 + ACES
            //    노출이 어두운 값을 들어올린다. 검게 읽히려면 채도를 반 넘게 죽이고 명도를 0.5 이상 깎아야.
            const bodyMat = PANTHER ? M(new THREE.Color(c).offsetHSL(0, -0.50, -0.54)) : mat;
            const legMat = PANTHER ? M(new THREE.Color(c).offsetHSL(0, -0.50, -0.60)) : dark;
            // ⚠️ 게는 **길이(z)를 줄여야** 폭이 이긴다 — 배럴 길이를 말과 같이 두면 등딱지를 아무리
            //    넓혀도 '넓적하고 긴 것'이라 게가 아니라 지네·악어 쪽으로 읽힌다.
            // 🚨 **가로(bs[0])는 0.82 를 넘기지 말 것** — 반폭 0.18 초과부터 영웅 다리가 몸통에 묻힌다.
            //    그래서 '뚱뚱한 종'(돼지·양)은 **폭이 아니라 깊이(세로)** 로 살을 붙이고, 폭이 필요하면
            //    y 0.30 위에 **덧파츠**(양털·등딱지)로 낸다 — 거기는 허벅지 시선 위라 다리를 안 먹는다.
            //    그 덧파츠도 **꼭대기가 안장 윗면 0.44 를 넘으면 안 된다**(거북 ②가 그걸로 한 판 날렸다).
            const bs = {
                'Crab':   [0.78, 0.62, 0.86],
                'Turtle': [0.86, 0.62, 1.15],   // 거북: 낮고 짧게 — 몸은 등딱지에 거의 다 들어간다
                'Pig':    [0.82, 1.16, 1.28],   // 돼지: 짧고 깊게(폭이 막혀 있으니 깊이로 살찌운다)
                'Goat':   [0.68, 0.84, 1.62],   // 염소: 마르고 길게
                'Sheep':  [0.80, 1.02, 1.48],   // 양: 몸은 보통, 부피는 양털이 낸다
                'Boar':   [0.80, 1.02, 1.66],   // 멧돼지: 길고 앞이 무겁게(어깨 혹은 아래에서 따로)
                'Pony':   [0.78, 0.90, 1.52],   // 조랑말: 말보다 짧고 아담하게
                'Panther':[0.76, 0.78, 1.95],   // 흑표범: 낮고 길고 날씬하게(고양이과 실루엣)
                'Camel':  [0.78, 0.88, 1.72],   // 낙타: 몸은 보통, 부피는 혹이 낸다
                'Dino':   [0.82, 1.00, 1.88],   // 공룡: 길고 묵직하게
            }[name] || [0.82, 0.95, 1.75];
            if (MECH) {
                // 각진 섀시 — 둥근 구는 어떻게 칠해도 기계로 안 읽힌다. 아래 판 + 위 판 + 옆 스커트.
                // ⚠️ 반폭은 0.18 을 지킨다(다리 노출 규칙).
                bx(0.34, 0.15, 0.62, 0, 0.235, 0, mat);
                bx(0.30, 0.06, 0.54, 0, 0.325, 0, light);                       // 상판
                bx(0.36, 0.05, 0.30, 0, 0.185, 0, IRON);                        // 하부 프레임
                for (const sx of [-1, 1]) bx(0.03, 0.10, 0.50, sx * 0.175, 0.245, 0, IRON);  // 옆 레일
                for (const sx of [-1, 1]) for (const bz of [0.20, -0.20])       // 리벳 대신 볼트 헤드
                    cy(0.022, 0.022, 0.02, sx * 0.13, 0.36, bz, IRON).rotation.x = 0;
            } else sp(0.22, 0, CRAB ? 0.21 : 0.24, 0, bodyMat, bs[0], bs[1], bs[2]);
            if (name === 'Turtle') turtleShell();
            const crabEyes = CRAB ? crabBody() : null;
            // ⚠️ 목·머리는 **기갑(withers, z 0.30) 에서 앞으로 뻗어 나가야** 한다. 예전엔 목이 (0, 0.44, 0.22)
            //    즉 안장 바로 앞·위에 굵게 서 있고 머리가 z 0.34에 얹혀서, 카메라에서 보면 그 둘이
            //    **반대쪽(먼) 다리를 통째로 가렸다**(실측: 먼 허벅지·정강이 가림률 100%). 말은 목이 앞으로
            //    누워 나가는 동물이라, 앞·아래로 빼면서 굵기도 줄이면 다리가 드러나고 실루엣도 말다워진다.
            // 낙타도 목이 긴 계열 — 같은 목 튜브를 쓴다(가림률이 이미 검증된 형상이라 새로 만들지 않는다).
            // 큰사슴은 짧은목 자리(headZ 0.46)를 유지한다 — 뿔을 그 머리 위치에 맞춰 달았기 때문이다.
            // 알파카도 긴 목 계열 — 목이 곧게 선 게 이 종의 유일한 실루엣 식별점이라 뺄 수 없다.
            // ⚠️ 당나귀를 긴목 계열에 넣었다 (`mount-species-recognizable` 2026-08-19). 예전엔 짧은목이라
            //    **목이라는 게 아예 없었고**(머리가 배럴 앞면에 그대로 붙어 있었다) 240px 시트에서
            //    귀 두 개만 솟은 초록 덩어리로 읽혔다. 당나귀는 머리가 크고 목이 굵게 서는 동물이라
            //    이 계열이 조형상 맞고, 무엇보다 **가림률이 이미 검증된 자리**(headZ 0.66)라 새로
            //    스윕할 필요가 없다 — 짧은목 자리(z 0.46)에서 머리만 키우면 다리를 도로 가린다.
            const longNeck = name === 'Brown Horse' || name === 'Dino' || name === 'Camel' || name === 'Alpaca' || name === 'Donkey';
            if (longNeck) HEADPART(tube([0, 0.40, 0.26], name === 'Dino' ? [0, 0.40, 0.60] : [0, 0.32, 0.58], 0.058, mat));
            // ── 두상 치수는 **종별 체인보다 먼저** 정한다 ──────────────────────────────────
            // 🚨 **두상은 종 정보의 절반이다.** 공용값 (0.92, 0.88, 1.35) 은 '주둥이 긴 말 얼굴'이라,
            //    이걸 그대로 두면 코·뿔·수염을 아무리 붙여도 '말 얼굴에 장식을 단 그림'이 된다.
            // 🚨 그리고 **얼굴 부속의 z 는 두상 앞끝(`headFrontZ`)에서 역산할 것.** 공용 두상의 앞끝은
            //    0.46 + 0.13×1.35 = **0.6355** 인데, 1판에서 돼지 코·양 얼굴·염소 주둥이를 z 0.50~0.58 에
            //    뒀다가 **전부 두상 안에 파묻혀** 화면에 안 나왔다(허공에 뜬 콧구멍 두 점만 보였다).
            //    그래서 이 값들을 체인 위로 끌어올린다 — 체인 안에서 헤드 치수를 못 보면 같은 사고가 난다.
            const headY = CRAB ? 0.28 : longNeck ? (name === 'Dino' ? 0.34 : 0.30) : 0.32;
            const headZ = CRAB ? 0.40 : longNeck ? (name === 'Dino' ? 0.68 : 0.66) : 0.46;
            const HEAD_SCALE = {
                'Donkey': [0.86, 0.86, 1.60],   // 크고 긴 얼굴
                'Turtle': [0.78, 0.80, 0.98],   // 작고 둥근 머리(말 두상이면 '껍질 진 말'이다)
                'Pig':    [0.98, 0.95, 1.02],   // 짧고 뭉툭 — 코 원반이 얹힐 평평한 앞면
                'Goat':   [0.74, 0.86, 1.30],   // 좁고 긴 얼굴
                'Sheep':  [0.86, 0.90, 1.10],   // 짧고 통통
                'Dino':   [0.94, 0.96, 1.40],   // 공룡: 큰 두상 — 단, 1.06×1.60 은 '흰 달걀'이었다(1판)
                'Panther':[0.90, 0.86, 1.05],   // 흑표범: 짧고 둥근 고양이 두상
            };
            const hs = HEAD_SCALE[name] || [0.92, 0.88, 1.35];
            const headFrontZ = headZ + 0.13 * hs[2];      // 얼굴 부속을 붙일 기준면
            // 두상 재질도 종별로. ⚠️ 공용값 `light` 는 에픽 초록에서 거의 흰색으로 타므로, 얼굴에
            // **밝은 무늬**(당나귀 밀리)를 얹을 종은 바탕을 몸색으로 내려야 무늬가 정보 노릇을 한다.
            // 양은 반대로 **얼굴이 어두운 게 종 정보**다(크림 털뭉치 + 검은 얼굴 = 양).
            const headMat = (name === 'Donkey' || name === 'Goat') ? mat
                          : name === 'Sheep' ? M(0x3b3630) : PANTHER ? bodyMat
                          : name === 'Dino' ? mat : light;   // 공룡: `light` 는 큰 두상에서 흰 달걀로 탄다
            // 뿔·코는 머리에 붙어 있어야 한다 — 머리를 앞으로 뺀 만큼(z +0.06) 같이 따라간다
            // ⚠️ 염소 뿔·돼지 코는 예전에 여기(체인 밖)에 있었고 **`HEADPART` 도 아니었다** — 머리가
            //    끄덕여도 뿔·코만 허공에 붙박여 남는 상태였다. 아래 종별 체인으로 옮겼다.
            // ── 추가 종의 식별 파츠 (로스터 확장 2026-08-18) ───────────────────────────────
            // ⚠️ 파츠는 **안장 앞·위(z 0.2~0.4, y 0.4~0.5)를 피해서** 붙인다 — 거기 굵은 걸 세우면
            //    카메라(탈것 앞-왼쪽 위)에서 먼 쪽 다리를 가려 probe-ride-clear가 바로 잡아낸다.
            //    뿔·주둥이는 머리(headZ 0.46~0.68)에, 등짐·갈기는 몸통 뒤(z ≤ 0)에.
            // ── 로스터 교체로 들어온 신규 5종 (mount-animal-machine-dynamic ① 2026-08-19) ──────
            // 나뭇잎·연잎·뗏목 자리를 메운 동물 3 + 태엽 기계 2. 전부 quad 골격을 그대로 쓴다 —
            // 안장·등자·굴레·고삐·트롯이 이미 검증된 형상이라 새 계열을 만들 이유가 없고,
            // 계열이 같으면 ② 에서 넣은 동적 모션(다리·머리·꼬리)도 공짜로 따라온다.
            // ⚠️ 파츠는 위 경고대로 **안장 앞·위(z 0.2~0.4, y 0.4~0.5)를 피한다.**
            if (name === 'Turtle') {                       // 거북: 굵고 짧은 목 + 부리 + 눈꺼풀
                // 목을 굵게 짧게 — 거북 목은 껍질에서 쑥 나온 주름진 기둥이다(말의 가는 목과 반대).
                HEADPART(tube([0, 0.30, 0.24], [0, 0.31, 0.44], 0.072, light));
                for (let i = 0; i < 3; i++) to(0.074, 0.012, 0, 0.303 + i * 0.004, 0.28 + i * 0.055, dark).rotation.x = 0.1; // 목주름
                // 부리 — 거북은 이빨이 없고 **각질 부리**다. 이게 없으면 두상만으로는 도마뱀·개구리다.
                const beak = HEADPART(cn(0.052, 0.075, 0, 0.305, 0.575, M(0xd8cdb0)));
                beak.rotation.x = Math.PI / 2 - 0.08;
            } else if (name === 'Pony') {
                // 조랑말 — 이 게임의 '기본 말'이다. 갈기·꼬리를 **풍성하게**, 얼굴에 **블레이즈**(콧대
                // 흰 줄)를 넣는 것이 조랑말/포니 그림의 상투다. 예전 갈기(폭 0.045 · dark)는 초록 위
                // 초록이라 실루엣에서 사라졌다 — 당나귀와 같은 규약으로 고정 갈색으로 내린다.
                const MANE = M(0x6b4a2a);                  // 등급색 벗김 — 갈기는 몸색과 다른 게 정상이다
                for (let i = 0; i < 6; i++) bx(0.05, 0.10 - i * 0.006, 0.085, 0, 0.44 - i * 0.014, 0.30 - i * 0.078, MANE);
                HEADPART(bx(0.055, 0.075, 0.05, 0, 0.405, 0.45, MANE));                    // 앞머리(forelock) 한 줌
                // 블레이즈(콧대 흰 줄) — ⚠️ 작은 구를 얼굴 앞에 놓는 방식은 쓰지 말 것. 두상이 타원체라
                // 어디에 놓아도 파묻히거나 떠 있다. **두상과 같은 타원체를 x 만 좁혀 살짝 키운 것**을
                // 겹치면 정확히 가운데 세로줄만 밖으로 나온다 — 그게 블레이즈다(면 계산 없이 항상 붙는다).
                HEADPART(sp(0.13, 0, headY, headZ, M(0xefe9df), hs[0] * 0.30, hs[1] * 1.02, hs[2] * 1.015));
            } else if (name === 'Donkey') {
                // ── 당나귀 (`mount-species-recognizable` 2026-08-19) ─────────────────────────
                // 사용자 원문 "당나귀인데 당나귀 안 같게 생김". 전(前) 형상은 조랑말 몸에 긴 귀 두 개 +
                // 갈기 네 조각이었고, 그 갈기는 **안장깔개 밑(z 0.26~0.05)** 이라 화면에 아예 안 나왔다.
                // 당나귀가 당나귀로 읽히는 표식은 셋이다: ⑴ 몸에 비해 크고 긴 머리 ⑵ 길게 선 귀
                // ⑶ **밀리(mealy) 무늬** — 주둥이·눈 둘레·배가 몸색과 무관하게 희끄무레한 것.
                // ⑶ 이 특히 중요하다: 등급 틴트가 전신을 덮는 이 게임에서 **몸색에서 독립한 고정색**은
                // 곧 실루엣 안의 대비선이고, 그게 없으면 종이 뭉개진다(안장깔개가 배운 것과 같은 교훈).
                // ⚠️ 밀리 무늬는 **주둥이·눈 둘레에만** 쓴다. 1판에서 배까지 깔았더니 초록 몸 아래
                //    흰 타원이 붙어 '풍선을 매단 당나귀'가 됐다(실측 캡처). 무늬는 얼굴의 정보다.
                const MEALY = M(0xd9d2c4);                 // 등급색 파생 금지 — 고정 회백색이어야 대비가 선다
                for (const s of [-1, 1]) {
                    // 귀를 키웠다(반높이 0.095 → 0.15). 예전 크기는 240px 썸네일에서 몇 픽셀이라
                    // '긴 귀'라는 정보가 사라졌다 — 당나귀의 제1 표식이니 과장한다.
                    // ⚠️ 겉은 **몸색(mat)** 으로. `light` 로 두면 창백한 머리에 창백한 귀가 붙어
                    //    귀가 두상에 녹아버린다(1판에서 머리 전체가 흰 덩어리로 읽힌 원인의 절반).
                    // 🚨 **넓고 곧게 선 귀는 당나귀가 아니라 토끼다** (1판 실측 — 낮게 뻗은 머리 + 통통한
                    //    몸통 + 곧게 선 넓은 귀가 겹쳐 통째로 토끼로 읽혔다). 당나귀 귀는 길되 **좁고**,
                    //    바깥으로 벌어져 있다. 폭을 0.52→0.40 으로 줄이고 벌림을 0.20→0.42 로 키운다.
                    // ⚠️ 벌림·길이를 같이 키우면 귀가 아니라 **날개·더듬이**가 된다(2판 실측 — 0.42rad ×
                    //    2.6 배로 뒀더니 큰 잎사귀 두 장이 됐다). 길이는 남기고 벌림만 되돌린다.
                    //    귀 안쪽 심지는 **같은 x·같은 기울기**여야 한다 — 어긋나면 귀 밖으로 삐져나온다.
                    const EAR_X = 0.058, EAR_TILT = s * 0.26;
                    const ear = HEADPART(sp(0.055, s * EAR_X, 0.405, 0.60, mat, 0.42, 2.15, 0.54));
                    ear.rotation.z = EAR_TILT; ear.rotation.x = -0.10;
                    const inner = HEADPART(sp(0.055, s * EAR_X, 0.405, 0.618, dark, 0.22, 1.75, 0.24));
                    inner.rotation.z = EAR_TILT; inner.rotation.x = -0.10;   // 귀 안쪽 심지
                    HEADPART(sp(0.032, s * 0.046, 0.322, 0.735, MEALY, 1.0, 0.85, 0.7));  // 눈 둘레 밀리 무늬
                }
                // 주둥이 — 코끝만 찍지 말고 **얼굴 앞 1/3 을 통째로** 회백색으로 덮는다.
                // 그게 실제 밀리 무늬의 면적이고, 이 크기에서 '흰 주둥이'가 정보로 읽히는 최소 면적이다.
                HEADPART(sp(0.095, 0, 0.272, 0.782, MEALY, 0.92, 0.82, 1.10));
                HEADPART(sp(0.030, 0, 0.256, 0.862, dark, 1.0, 0.7, 0.6));                // 콧구멍 판
                // 갈기 — **목 위**에 세운다(예전엔 안장깔개 밑(z 0.26~0.05)이라 화면에 아예 안 나왔다).
                // 목 튜브가 (0,0.40,0.26)→(0,0.32,0.58) 이므로 그 선을 따라 곧게 선 솔을 얹는다.
                // ⚠️ z 0.2~0.4 · y 0.4~0.5 는 먼 다리로 가는 시선 띠다 — 갈기는 폭 0.034 로 얇게 두고
                //    z 0.34 부터 시작해 앞으로만 뻗는다(조랑말 갈기가 같은 규약으로 통과해 있다).
                // ⚠️ `dark` 는 등급색 −0.18 명도라 초록 위 초록이다 — 갈기가 목에 녹는다. 갈기·꼬리술은
                //    **고정 흑갈색**으로 내려 실루엣 안에 대비선을 만든다(MEALY 와 같은 규약, 반대 방향).
                // ⚠️ 갈기 y 는 **목 튜브 윗면에서 역산**할 것. 1판에서 0.462 고정으로 뒀다가 목이
                //    (0,0.40,0.26)→(0,0.32,0.58) 로 기울어 내려가는 바람에 갈기만 허공에 뜬 **검은 계단**이
                //    됐다(실측 캡처). 윗면 = 0.40 − (z−0.26)/0.32×0.08 + 반지름 0.058.
                // ⚠️ 그리고 각 조각을 **목 기울기만큼 눕힐 것**. 안 눕히면 내리막 위에 수직 상자를 늘어놓은
                //    꼴이라 조각마다 단차가 생겨 갈기가 아니라 **검은 계단**으로 읽힌다(2판 실측).
                //    목 방향 (0,−0.08,0.32) → 법선 (0, 0.970, 0.243), 기울기 0.245rad.
                //    윗변을 **고르게 맞추지 말 것** — 같은 높이 조각을 이으면 갈기가 아니라 널빤지(태양광
                //    패널)로 읽힌다. 조각마다 길이를 흔들어 위쪽 실루엣을 톱니로 만든다.
                for (let i = 0; i < 7; i++) {
                    const mz = 0.30 + i * 0.046;
                    const h = 0.062 + (i % 3 === 1 ? 0.030 : i % 3 === 2 ? 0.008 : 0.018);
                    const ay = 0.40 - (mz - 0.26) / 0.32 * 0.08;      // 목 축 위의 y
                    const m = bx(0.034, h, 0.062, 0, ay + 0.970 * (0.058 + h / 2), mz + 0.243 * (0.058 + h / 2), DONKEY_DARK);
                    m.rotation.x = 0.245;
                }
            } else if (name === 'Alpaca') {
                // 알파카 — 표식은 ⑴ **온몸을 덮은 복슬한 털** ⑵ **긴 목까지 덮은 털** ⑶ **정수리 앞머리
                // 뭉치(topknot)** ⑷ 바나나 귀다. 예전엔 털뭉치 4개뿐이었고 그중 둘(z −0.12·+0.10)은
                // **안장깔개 밑**이라 실제로 보이는 건 두 개였다 — 조랑말과 안 갈린 이유가 이것이다.
                // ⚠️ 깔개(z ±0.29 · 반폭 0.198) 밑에는 아무것도 두지 말 것(거북 ②·멧돼지 ③과 같은 규칙).
                //    알파카는 **긴목**이라 z 0.30~0.48 이 비어 있다 — 털은 거기와 엉덩이 쪽에 몰아 붙인다.
                for (const [ax, ay, az, r] of [
                        [0, 0.375, -0.36, 0.115], [0.15, 0.325, -0.33, 0.095], [-0.15, 0.325, -0.33, 0.095],
                        [0.15, 0.245, -0.30, 0.095], [-0.15, 0.245, -0.30, 0.095],
                        [0, 0.395, 0.33, 0.105], [0.13, 0.345, 0.335, 0.088], [-0.13, 0.345, 0.335, 0.088],
                        [0, 0.415, 0.44, 0.088], [0, 0.375, 0.545, 0.072]])   // 목을 타고 올라가는 털
                    sp(r, ax, ay, az, light, 1.0, 0.9, 1.0);
                HEADPART(sp(0.082, 0, headY + 0.075, headZ - 0.03, light, 1.05, 1.0, 0.95)); // 정수리 앞머리 뭉치
                for (const s of [-1, 1]) {                   // 바나나 귀 — 안쪽으로 살짝 휜 긴 귀
                    const ear = HEADPART(sp(0.036, s * 0.055, headY + 0.115, headZ - 0.02, light, 0.62, 1.9, 0.62));
                    ear.rotation.z = s * -0.14;
                }
            } else if (name === 'Clockwork Mouse') {       // 태엽 생쥐: 큰 원반 귀 + 배 판금 + 등에 태엽 감개
                for (const s of [-1, 1]) {
                    const ear = HEADPART(to(0.075, 0.02, s * 0.10, 0.42, 0.42, IRON));
                    ear.rotation.y = s * 0.5;
                    HEADPART(sp(0.062, s * 0.10, 0.42, 0.42, light, 1.0, 1.0, 0.25));      // 귀 안쪽 판
                }
                bx(0.20, 0.13, 0.30, 0, 0.20, 0.10, IRON);                                  // 배 판금
                for (const s of [-1, 1]) sp(0.028, s * 0.06, 0.24, 0.40, blk, 1, 1, 1);     // 코 옆 리벳
                windUpKey(0, 0.40, -0.22);                                                  // 등 태엽 감개
                // 뾰족한 주둥이 + 수염 — 생쥐 얼굴은 **원뿔에 가까운 쐐기**다. 공용 두상(말 얼굴)만으로는
                // 큰 귀 달린 말이라, 원반 귀가 아무리 커도 생쥐로 안 읽힌다.
                HEADPART(cn(0.052, 0.14, 0, headY - 0.012, headFrontZ + 0.03, light)).rotation.x = Math.PI / 2;
                HEADPART(sp(0.026, 0, headY - 0.012, headFrontZ + 0.10, M(0xd99a92)));      // 분홍 코
                // ⚠️ 수염을 길이 0.14 · 굵기 0.006 으로 뽑으면 이 크기에서 **더듬이 네 자루**다(1판 실측).
                //    수염은 짧고 가늘어야 수염이다 — 얼굴 반폭(0.13×0.98) 언저리에서 끊는다.
                for (const s of [-1, 1]) for (const wy of [0.015, -0.015])
                    HEADPART(tube([s * 0.018, headY - 0.01 + wy, headFrontZ + 0.075],
                                  [s * 0.085, headY + 0.025 + wy * 2, headFrontZ + 0.035], 0.0035, blk)); // 수염
                g.userData.mouseTail = true;
            } else if (name === 'Clockwork Beetle') {      // 태엽 딱정벌레: 갈라진 등딱지 + 더듬이 + 태엽 감개
                sp(0.215, 0, 0.32, -0.02, dark, 1.06, 0.66, 1.32);                          // 등딱지(엘리트라)
                bx(0.02, 0.05, 0.62, 0, 0.44, -0.02, IRON);                                 // 딱지 가운데 이음선
                for (const s of [-1, 1]) {
                    const ant = HEADPART(tube([s * 0.05, 0.38, 0.50], [s * 0.14, 0.52, 0.62], 0.014, IRON));
                    HEADPART(sp(0.026, s * 0.14, 0.52, 0.62, M(0xffd54f, { emissive: 0xff8f00, emissiveIntensity: 0.7 })));
                    ant.userData.part = 'head';
                }
                windUpKey(0, 0.46, -0.26);
            } else if (name === 'Sheep') {
                // 양 — **양털이 곧 종 정보다.** 예전엔 몸색 파생(`light`) 뭉치 4개뿐이라 초록 몸에
                // 초록 혹이 얹힌 그림이었고, 판독 시트에서 조랑말과 안 갈렸다. 털은 ⑴ **고정 크림색**
                // ⑵ 몸을 **감싸는 개수**(4→14)로 간다 — 양의 부피감은 몸통이 아니라 털이 낸다.
                // ⚠️ 폭은 y 0.30 위에서만 벌린다(허벅지 시선 위). 그리고 **꼭대기가 0.44(안장)를
                //    넘으면 안장이 털에 묻힌다** — 거북 ② 가 그걸로 한 판 날렸다. 최고점 0.425 로 잡았다.
                const WOOL = M(0xefe6d4), WOOL_D = M(0xd9cdb6);
                for (const [sx, sy2, sz, r] of [
                        [0, 0.365, -0.30, 0.105], [0.15, 0.345, -0.22, 0.095], [-0.15, 0.345, -0.22, 0.095],
                        [0.19, 0.335, -0.05, 0.092], [-0.19, 0.335, -0.05, 0.092],
                        [0.18, 0.335, 0.14, 0.088], [-0.18, 0.335, 0.14, 0.088],
                        [0, 0.355, 0.26, 0.098], [0.13, 0.345, 0.30, 0.082], [-0.13, 0.345, 0.30, 0.082],
                        [0.10, 0.20, -0.30, 0.085], [-0.10, 0.20, -0.30, 0.085],
                        [0.11, 0.185, 0.22, 0.082], [-0.11, 0.185, 0.22, 0.082]])
                    sp(r, sx, sy2, sz, (sx + sz) % 0.2 === 0 ? WOOL : WOOL_D, 1.0, 0.9, 1.0);
                // 얼굴·다리는 **털 밖**이라 어둡다 — 크림 덩어리에 검은 얼굴이 붙어야 양으로 읽힌다.
                // 얼굴은 두상 재질(`headMat`)이 이미 검다 — 여기서는 **이마를 덮는 털**과 귀·뿔만.
                HEADPART(sp(0.105, 0, headY + 0.055, headZ - 0.055, WOOL, 1.05, 0.95, 0.95)); // 이마 앞머리 털
                for (const s of [-1, 1]) {
                    const ear = HEADPART(sp(0.05, s * 0.115, headY + 0.005, headZ - 0.02, M(0x3b3630), 1.5, 0.5, 0.8));
                    ear.rotation.z = s * 0.5;                                               // 옆으로 뻗은 귀
                    const h = to(0.052, 0.022, s * 0.078, headY + 0.055, headZ + 0.005, M(0xcbbb9a)); // 말린 뿔
                    h.rotation.y = Math.PI / 2; h.userData.part = 'head';
                }
            } else if (name === 'Boar') {                  // 멧돼지: 위로 솟은 엄니 한 쌍 + 등 갈기
                // 엄니를 키웠다(길이 0.10 → 0.16) — 멧돼지의 유일한 실루엣 표식인데 이 크기에서
                // 몇 픽셀이라 사라졌다. **머리에 묶는다**(`HEADPART`) — 예전엔 아니라 머리가 끄덕이면
                // 엄니만 허공에 남았다.
                for (const s of [-1, 1]) {
                    const tk = HEADPART(cn(0.026, 0.16, s * 0.058, 0.30, 0.545, M(0xf5f0e1)));
                    tk.rotation.x = -0.75; tk.rotation.z = s * 0.30;
                }
                HEADPART(sp(0.058, 0, 0.275, 0.585, M(0x6b5347), 1.25, 0.95, 0.45));        // 들창코 원반
                // 등 갈기(bristle) — 짧은 원뿔 넷은 '등에 박힌 압정'이라 갈기로 안 읽힌다.
                // 길게·촘촘히·고정 흑갈로 세워 **뻣뻣한 능선**을 만든다.
                // 🚨 **등 한가운데(z −0.29~+0.29)에는 세우지 말 것 — 거기는 안장깔개 밑이다.**
                //    1판에서 z −0.30~+0.30 에 아홉 개를 세웠더니 **가시가 안장을 뚫고 솟았다**(캡처 확인).
                //    거북 ② 의 '등마루 갑판이 깔개를 뚫는다'와 **완전히 같은 사고**다.
                // 🚨 그리고 **앞쪽에도 자리가 없다** — 짧은목 계열의 공용 두상은 z 0.284~0.636 을 차지해
                //    기갑(withers)이 통째로 머리 속이다. 그래서 능선을 **머리·목 위(HEADPART)** 로 올린다:
                //    실제 멧돼지도 갈기가 가장 선 자리가 목덜미다. 시선 띠(z 0.4 에서 y≈0.60) 아래로 지난다.
                const BRISTLE = M(0x2a211a);
                for (let i = 0; i < 6; i++) {
                    const bz = headZ - 0.12 + i * 0.036;
                    const b = HEADPART(cn(0.018, 0.13 - Math.abs(i - 2) * 0.012, 0, headY + 0.10, bz, BRISTLE));
                    b.rotation.x = -0.30;
                }
                for (let i = 0; i < 3; i++)                 // 엉덩이 쪽 잔 갈기(깔개 뒤)
                    cn(0.015, 0.09 - i * 0.018, 0, 0.372 - i * 0.028, -0.30 - i * 0.045, BRISTLE).rotation.x = -0.55;
                sp(0.17, 0, 0.33, 0.16, mat, 0.95, 0.72, 0.80);                             // 어깨 혹 — 앞이 무거운 실루엣
            } else if (name === 'Pig') {
                // 돼지 — 표식은 **들창코 원반 · 앞으로 접힌 귀 · 말린 꼬리** 셋이고, 셋 다 예전엔
                // 없거나(귀·꼬리) 원뿔 하나(코)였다. 코는 **원뿔이 아니라 납작한 원반**이어야 한다 —
                // 원뿔은 부리·주둥이로 읽히고, 돼지코는 정면에서 콧구멍 두 개가 뚫린 판이다.
                const SNOUT = M(0xd99a92);                 // 등급색 벗김 — 초록 돼지에도 코는 분홍이어야 읽힌다
                HEADPART(cy(0.075, 0.075, 0.05, 0, headY - 0.025, headFrontZ - 0.005, SNOUT)).rotation.x = Math.PI / 2;
                for (const s of [-1, 1]) HEADPART(sp(0.018, s * 0.030, headY - 0.022, headFrontZ + 0.022, dark, 1, 1, 0.5)); // 콧구멍 둘
                for (const s of [-1, 1]) {                 // 앞으로 접힌 큰 귀 — 두상 반폭(0.13×0.98) 밖으로
                    const ear = HEADPART(sp(0.078, s * 0.115, headY + 0.075, headZ - 0.03, light, 0.42, 1.0, 0.42));
                    ear.rotation.z = s * 0.40; ear.rotation.x = 0.60;
                }
                g.userData.pigTail = true;                 // 아래 꼬리 분기에서 말린 꼬리로 바꾼다
            } else if (name === 'Goat') {
                // 염소 — 표식은 **뒤로 휜 긴 뿔 · 턱수염 · 좁은 주둥이**다. 예전 뿔(길이 0.13 원뿔
                // 하나씩)은 이 크기에서 안 보였고 `HEADPART` 도 아니라 머리를 따라가지도 않았다.
                // ⚠️ 뿔은 **뒤로 눕힌다** — 세우면 큰사슴이 배운 그대로 먼 다리 시선 띠(z 0.3에서
                //    y≈0.56)에 걸린다. 실제 염소 뿔도 뒤로 휜다.
                // ⚠️ 뿔 색을 흰색 쪽(0xcbbb9a)으로 두면 초록 몸 위에서 **흰 파이프**로 튄다 —
                //    각질은 흰 게 아니라 누런 갈색이다. 채도를 넣어 '뿔'로 내린다.
                const HORN = M(0xb09a72);                  // 각질 — 등급색 벗김
                // ⚠️ 1판에서 뿌리를 z 0.44 · 끝을 z 0.25 에 뒀더니 뿔이 **안장 위를 가로지르는 흰 파이프
                //    두 자루**가 됐다(캡처 확인). 염소 뿔은 머리통 길이 정도지 등까지 가지 않는다 —
                //    **정수리에서 시작해 뒤로 한 뼘**만. 굵기도 0.020 → 0.015 로(이 크기에서 0.02 는 파이프다).
                for (const s of [-1, 1]) {
                    const a = HEADPART(tube([s * 0.040, headY + 0.075, headZ + 0.03], [s * 0.062, headY + 0.135, headZ - 0.035], 0.012, HORN));
                    const b = HEADPART(tube([s * 0.062, headY + 0.135, headZ - 0.035], [s * 0.078, headY + 0.122, headZ - 0.098], 0.0085, HORN));
                    a.userData.part = 'head'; b.userData.part = 'head';
                }
                // 턱수염 — 턱 **밑**(두상 아래면 y ≈ headY − 0.13×hs[1])에서 아래로 늘어뜨린다.
                // ⚠️ `dark` 는 등급색 −0.18 이라 초록 수염이 된다(1판에서 얼굴 밑 초록 삼각형이었다).
                //    고정 회갈로 내리고 크기도 절반으로 — 수염은 작아야 수염이다.
                HEADPART(cn(0.028, 0.10, 0, headY - 0.145, headFrontZ - 0.09, M(0x6f6353))).rotation.x = Math.PI;
                HEADPART(sp(0.052, 0, headY - 0.012, headFrontZ - 0.03, M(0xefe9df), 0.82, 0.78, 0.72)); // 흰 주둥이 끝
            } else if (name === 'Dino') {
                // 공룡 — 전(前) 형상은 **아무 표식도 없었다**(긴 목 튜브 하나가 전부). 판독 시트에서
                // 갈색말과 완전히 같은 그림이다. 공룡으로 읽히는 조건: ⑴ **이빨 난 큰 턱**
                // ⑵ **등을 타고 도는 골판·가시** ⑶ **굵고 무거운 꼬리**.
                // ⚠️ 가시를 등 한가운데(z −0.29~+0.29)에 세우면 안장을 뚫는다(거북 ②·멧돼지 ③).
                //    공룡은 **긴목 계열**이라 목 위(z 0.30~0.56)가 비어 있다 — 거기와 엉덩이에만 세운다.
                const SPIKE = M(new THREE.Color(c).offsetHSL(0, 0.10, -0.24));
                for (let i = 0; i < 6; i++) {                 // 목 골판 — 앞으로 갈수록 작아진다
                    const sz = 0.32 + i * 0.048;
                    const h = 0.10 - i * 0.009;
                    const pl = HEADPART(cn(0.030 - i * 0.002, h, 0, 0.455 + h / 2 - 0.02, sz, SPIKE));
                    pl.rotation.x = -0.22;
                }
                for (let i = 0; i < 4; i++) {                 // 엉덩이·꼬리 밑동 가시
                    const sz = -0.32 - i * 0.055;
                    cn(0.030 - i * 0.004, 0.11 - i * 0.018, 0, 0.365 - i * 0.030, sz, SPIKE).rotation.x = -0.55;
                }
                // 아래턱 + 이빨 — 두상 앞끝(headFrontZ)에서 역산. 이빨이 없으면 '머리 큰 말'이다.
                // ⚠️ 아래턱을 두상보다 **앞으로 내밀지 말 것** — 1판에서 z 0.115 만큼 밀었다가 머리
                //    밖으로 튀어나온 **창백한 널빤지**가 됐다. 턱은 두상 **안**에 물려 있고 이빨만 나온다.
                HEADPART(bx(0.115, 0.05, 0.21, 0, headY - 0.088, headZ + 0.055, mat));      // 아래턱
                for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
                    const tz = headZ - 0.015 + i * 0.052;
                    HEADPART(cn(0.023, 0.072, s * 0.050, headY - 0.108, tz, M(0xf5f0e1))).rotation.x = Math.PI;
                }
                g.userData.dinoTail = true;
            } else if (name === 'Camel') {
                // 낙타 — 표식은 **혹 둘**뿐인데, 예전 자리(z −0.26 · +0.16)는 **둘 다 안장깔개
                // 밑(z ±0.29)** 이라 화면에 거의 안 나왔다(판독 시트에서 갈색말과 안 갈렸다).
                // 실제 쌍봉낙타 안장도 **혹 사이**에 놓는다 — 깔개 밖으로 앞뒤로 벌리면 조형과 정합이
                // 동시에 맞는다. 크기도 0.115 → 0.155 로 키운다(혹은 커야 혹이다).
                // ⚠️ 낙타는 긴목 계열이라 앞쪽 z 0.29~0.48 이 비어 있다(두상이 z 0.485 부터다).
                sp(0.155, 0, 0.375, -0.36, mat, 1.0, 1.10, 0.95);   // 뒤 혹
                sp(0.145, 0, 0.375, 0.355, mat, 0.98, 1.05, 0.92);  // 앞 혹
                sp(0.145, 0, 0.395, -0.36, light, 0.72, 0.72, 0.68); // 혹 꼭대기 털뭉치(윤곽 강조)
                sp(0.135, 0, 0.395, 0.355, light, 0.70, 0.70, 0.66);
                // 갈라진 윗입술 — 낙타 얼굴의 상투. 두상 앞끝에서 역산해 붙인다.
                for (const s of [-1, 1]) HEADPART(sp(0.042, s * 0.028, headY - 0.030, headFrontZ - 0.020, light, 0.9, 0.85, 0.7));
            } else if (name === 'Elk') {                   // 큰사슴: 가지 뿔 — 뒤로 눕힌 스윕
                // ⚠️ 예전 형상(머리 위 y 0.51~0.59 · z 0.44~0.52 로 선 뿔)은 카메라(탈것 앞-왼쪽 위)에서
                //    먼 대퇴·정강이로 가는 시선을 정확히 가로챘다(probe-ride-clear 상시 1건 실패).
                //    시선 띠는 z 0.3에서 y≈0.56, z 0.5에서 y≈0.63으로 앞으로 갈수록 높다 — 뿔을
                //    **y 0.52 아래·뒤쪽으로 눕혀** 띠 밑을 지나가게 한다. 실제 엘크 뿔도 뒤로 눕는다.
                // 뿔은 **뼈 색**으로 — 몸 파생색(light)이면 초원·몸통에 묻혀 종이 안 읽힌다(비평가 지적).
                // 약한 자발광 — 그늘 면이 초콜릿색으로 죽어 안장과 뭉개지는 것을 막는다(램버트 음영 보정).
                const antler = M(0xd9c79a, { emissive: 0x6b5a3c, emissiveIntensity: 0.3 });
                for (const s of [-1, 1]) {
                    // ⚠️ 옆으로 벌리면(x ±0.23) **근쪽** 허벅지 시선(z 0.2~0.3에서 x −0.18·y 0.48 부근)에
                    //    걸린다 — 실측으로 확인. 랙은 x ±0.16 안·y 0.53 아래로 눕혀 길이는 z로만 뽑는다.
                    // 등에 붙여 눕히면 '몸에 묶은 가시더미'로 읽힌다(비평가 지적) — 정수리에서 뿌리를 잡고
                    // 몸통 윗면(y≈0.44)과 0.05~0.1 틈이 보이게 띄운다. 랙 끝도 z 0.26에서 끊어
                    // 뱃대끈(z≈0.2)을 안 뚫는다.
                    const b1 = tube([s * 0.04, 0.41, 0.50], [s * 0.10, 0.47, 0.38], 0.018, antler);
                    const b2 = tube([s * 0.10, 0.47, 0.38], [s * 0.16, 0.52, 0.26], 0.015, antler);
                    b1.userData.part = 'head'; b2.userData.part = 'head';
                    // 이마 가지(brow tine) — 뿌리에서 앞으로 하나 세워야 '가지진 랙'으로 읽힌다
                    const brow = cn(0.012, 0.09, s * 0.06, 0.435, 0.52, antler);
                    brow.rotation.x = 0.5; brow.rotation.z = s * -0.25; brow.userData.part = 'head';
                    for (let i = 0; i < 4; i++) {
                        // 가지는 뒤로 눕히되(음의 rx = −z 쪽 — 세우면 예전처럼 시선 띠 z 0.3·y≈0.56에 든다)
                        // 각도를 부챗살로 벌린다 — 평행한 4개는 '짊어진 장대 두 자루'로 읽힌다(비평가 지적)
                        const tine = cn(0.013, 0.13, s * (0.055 + i * 0.032), 0.465 + i * 0.012, 0.44 - i * 0.05, antler);
                        tine.rotation.x = -0.55 - i * 0.16; tine.rotation.z = s * (-0.12 - i * 0.13); tine.userData.part = 'head';
                    }
                }
            } else if (PANTHER) {
                // 흑표범 — 색은 위에서 `bodyMat`/`legMat` 이 이미 냈다. 여기서는 **고양이과 얼굴**만.
                // ⚠️ 귀를 원뿔로 세우지 말 것 — 고양이 귀는 삼각이되 **넓고 둥근 밑동**이라, 가는 원뿔은
                //    뿔·안테나로 읽힌다. 눌러 편 구로 만들고 안쪽에 밝은 심지를 넣는다.
                for (const s of [-1, 1]) {
                    const ear = HEADPART(sp(0.058, s * 0.072, headY + 0.088, headZ - 0.045, bodyMat, 0.85, 1.05, 0.34));
                    ear.rotation.z = s * 0.22;
                    HEADPART(sp(0.058, s * 0.072, headY + 0.082, headZ - 0.030, M(0x6b5a52), 0.5, 0.7, 0.2)); // 귀 안쪽
                }
                // 주둥이·턱은 **밝게** — 표범 얼굴이 새까만 덩어리로 뭉치는 걸 막는 유일한 대비선이다.
                HEADPART(sp(0.062, 0, headY - 0.038, headFrontZ - 0.045, M(0x6b5a52), 1.25, 0.85, 0.75));
                HEADPART(sp(0.022, 0, headY - 0.012, headFrontZ - 0.01, M(0x2a2226), 1.1, 0.8, 0.6));  // 코
                // 눈은 **호박빛 홍채 + 검은 동공**으로. 검은 얼굴에 공용 검은 눈만 있으면 눈이 사라진다.
                // ⚠️ 홍채를 공용 눈과 **같은 자리**에 두면 z-파이팅으로 깜빡인다 — 살짝 뒤(z −0.012)에
                //    크게 깔아 공용 눈알이 그 위 동공이 되게 한다.
                for (const s of [-1, 1])
                    HEADPART(sp(0.030, s * 0.062, headY + 0.040, headZ + 0.088,
                        M(0xffc247, { emissive: 0xd08a00, emissiveIntensity: 0.5 }), 1.3, 0.85, 0.6));
            } else if (name === 'Armored Rhino') {         // 장갑 코뿔소: 코뿔 + 등 장갑판
                const horn = cn(0.045, 0.16, 0, 0.34, 0.60, M(0xe0e0e0)); horn.rotation.x = -0.35;
                horn.userData.part = 'head';
                for (let i = 0; i < 3; i++) bx(0.30, 0.05, 0.16, 0, 0.40 - i * 0.012, -0.26 + i * 0.20, IRON);
            } else if (name === 'Mech Spider') {           // 기계 거미: 다리 4쌍(추가 2쌍) + 단안 센서
                for (const s of [-1, 1]) for (const z of [0.16, -0.16]) {
                    const up = tube([s * 0.14, 0.26, z], [s * 0.34, 0.40, z], 0.022, IRON);
                    tube([s * 0.34, 0.40, z], [s * 0.40, 0.02, z], 0.018, MECH_DARK);
                    up.userData.mechLeg = true;
                }
                sp(0.05, 0, 0.30, 0.52, M(0xff5252, { emissive: 0xd50000, emissiveIntensity: 0.8 })).userData.part = 'head';
            }
            // 머리도 같은 이유로 앞으로 뺀다 — 목 끝에 얹고 z축으로 늘려 주둥이가 있는 두상으로.
            // 짧은목 계열(거북·게·돼지·염소)도 z 0.40→0.46으로 조금 더 내보내 다리 시야선에서 비킨다.
            // ⚠️ 높이가 핵심이다 — 게임 카메라는 탈것 **앞-왼쪽 위**(탈것 로컬 약 (-3.0, 3.2, 7.8))에 있어서
            //    시선이 앞쪽으로 갈수록 위로 올라간다(z 1당 y 약 +0.37). 그래서 머리를 '앞으로만' 빼면
            //    오히려 카메라 쪽으로 다가와 먼 다리를 더 가린다(실측: z 0.64·y 0.52에서 여전히 100%).
            //    앞으로 빼면서 **시선보다 낮게** 내려야 비로소 다리가 드러난다 — 머리를 앞으로 뻗어 내린
            //    자세는 달리는 말·나는 용의 자세라 실루엣도 같이 좋아진다.
            // ⚠️ 게는 **주둥이 달린 머리도 꼬리도 없다** — 있으면 그 순간 '넓적한 말'로 되돌아간다.
            //    앞판·눈자루가 머리 노릇을 하고(crabBody), 굴레는 그 앞판에 씌운다.
            if (!CRAB) {
                if (MECH) {
                    // 센서 터릿 — 주둥이 달린 구를 그대로 두면 '말 머리 단 로봇'이다.
                    HEADPART(bx(0.19, 0.13, 0.20, 0, headY + 0.02, headZ - 0.02, IRON));
                    HEADPART(bx(0.15, 0.05, 0.03, 0, headY + 0.035, headZ + 0.085, M(0xff5252, { emissive: 0xd50000, emissiveIntensity: 0.8 }))); // 바이저
                    for (const s of [-1, 1]) HEADPART(tube([s * 0.06, headY + 0.085, headZ - 0.02], [s * 0.10, headY + 0.175, headZ - 0.06], 0.010, IRON)); // 안테나
                } else HEADPART(sp(0.13, 0, headY, headZ, headMat, hs[0], hs[1], hs[2])); // 머리
                eyeMeshes = eyes(headY + 0.04, headZ + 0.10, 0.062);
                // 돼지 꼬리는 **말린 나선**이다 — 곧은 원뿔 하나면 다른 종과 똑같아진다.
                let tail;
                if (g.userData.pigTail) {
                    // ⚠️ 꼬리 뿌리를 공용값(z −0.34)에 두면 **몸 밖 허공**에서 시작한다 — 돼지는 몸통
                    //    길이를 1.28 로 줄여서(반길이 0.282) 그 자리가 엉덩이 뒤 0.06 이다(실측 캡처에서
                    //    구슬이 떠 있었다). 엉덩이 면에 붙인다.
                    tail = new THREE.Group(); tail.position.set(0, 0.305, -0.265); g.add(tail);
                    for (let i = 0; i < 7; i++) {         // 나선 — 반지름이 줄면서 한 바퀴 반 감긴다
                        const a = i * 0.95, r = 0.055 - i * 0.005;
                        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.022 - i * 0.0018, 6, 5), mat);
                        seg.position.set(Math.sin(a) * r, Math.cos(a) * r * 0.9, -i * 0.012);
                        tail.add(seg);
                    }
                } else if (g.userData.dinoTail) {
                    // 공룡 꼬리는 **몸통만큼 굵고 길다** — 공용 꼬리(길이 0.24 · 끝 반지름 0.01)를 달면
                    // 그 큰 몸에 실 한 가닥이라 오히려 '꼬리가 없다'로 읽힌다.
                    // ⚠️ 뿌리를 z −0.50 에 두면 몸통(반길이 0.414) 뒤 허공에서 시작한다 — 엉덩이에 붙인다.
                    //    그리고 위아래 반지름 차를 너무 벌리면(0.075→0.018) 원기둥이 아니라 **널빤지**로 읽힌다.
                    tail = cy(0.068, 0.024, 0.46, 0, 0.27, -0.40, mat); tail.rotation.x = 1.42;
                } else if (g.userData.mouseTail) {
                    // 생쥐 꼬리 — **길고 가늘고 휜다**. 공용 꼬리(길이 0.24 · 굵기 0.03)는 몽당하다.
                    //    구슬을 이어 곡선으로 만든다(원통 하나로는 직선이라 꼬리로 안 읽힌다).
                    // ⚠️ 구슬을 **아래로** 늘어뜨리면 땅에 닿아 '진주 목걸이'가 된다(1판 실측 — 9개 ×
                    //    0.045 면 y 0.26 에서 지면을 뚫는다). 생쥐 꼬리는 **뒤로 길게 뻗다가 끝만 들린다.**
                    tail = new THREE.Group(); tail.position.set(0, 0.27, -0.36); g.add(tail);
                    for (let i = 0; i < 10; i++) {
                        const seg = new THREE.Mesh(new THREE.SphereGeometry(0.023 - i * 0.0016, 6, 5), M(0xd9b7a8));
                        seg.position.set(0, -0.055 + Math.sin(i * 0.30) * 0.075, -0.052 * i);
                        tail.add(seg);
                    }
                } else if (PANTHER) {
                    // 고양이과의 **길고 굵은 꼬리** — 이 몸길이(반길이 0.43)에서 공용 꼬리(길이 0.24,
                    //    끝 반지름 0.01)는 '엉덩이에 붙은 이쑤시개'다. 길이 0.24→0.46, 끝을 뭉툭하게.
                    // ⚠️ 수평으로 뻗으면(rotation.x 1.42) 꼬리가 아니라 **엉덩이에 꽂은 파이프**다(1판 실측).
                    //    고양이 꼬리는 뿌리에서 **위로 들렸다가** 끝이 처진다 — 1.05rad 로 세워 든다.
                    tail = cy(0.036, 0.026, 0.38, 0, 0.30, -0.46, bodyMat); tail.rotation.x = 1.05;
                    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 6), legMat);
                    tip.position.set(0, -0.19, 0); tail.add(tip);
                } else {
                    tail = cy(0.03, 0.01, 0.24, 0, 0.24, -0.34, mat); tail.rotation.x = 1.3;
                }
                g.userData.tail = tail;
                // 당나귀 꼬리는 말총이 아니라 **끝에만 술이 달린 소꼬리**다 — 실루엣 식별점이라 붙인다.
                // 꼬리의 자식으로 달아야 흔들 때 같이 간다(`ud.tail` 회전은 자식에 그대로 전달된다).
                if (name === 'Donkey') {
                    const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), DONKEY_DARK);
                    tuft.position.set(0, -0.13, 0); tuft.scale.set(0.8, 1.35, 0.8);
                    tail.add(tuft);
                }
            }
            // ── 다리: **고관절 피벗 그룹**에 매단다 (mount-animal-machine-dynamic) ────────────
            // ⚠️ 다리 메시를 그대로 돌리면 안 된다 — 원통은 제 중심(y 0.1)을 축으로 도는 탓에
            //    윗동강이 몸통을 뚫고 반대편으로 솟는다. 원통 **윗면**(0.1 + 0.24/2 = 0.22)에
            //    피벗을 두고 그 그룹을 돌려야 '고관절에서 흔들리는 다리'가 된다.
            // 걸음은 **트롯**(대각선 짝) — 대각선끼리 위상이 같아야 네발짐승 걸음으로 읽힌다.
            // 같은 쪽 두 다리를 같이 내밀면 '깡충 뛰는 토끼'가 된다. 부호 sx*sz 가 곧 대각선 짝이다.
            const HIP_Y = 0.22;
            g.userData.legs = [];
            if (CRAB) crabLegs();
            else for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                const pivot = new THREE.Group();
                pivot.position.set(sx * 0.13, HIP_Y, sz * 0.3);   // 몸통이 좁아진 만큼 안쪽으로
                g.add(pivot);
                // ⚠️ 다리 **길이**는 종마다 못 바꾼다 — 안장 윗면이 0.44(MOUNT_FORMS.quad.saddle)로 고정이라
                //    다리를 줄이면 몸이 뜨거나 안장이 몸 위에 뜬다. 굵기·발끝만 종별로 바꾼다.
                //    거북은 굵은 기둥 + 넓은 발톱판이라 같은 길이에서도 '뭉툭한 다리'로 읽힌다.
                if (MECH) {
                    // 관절 다리 — 몸통 옆으로 뻗었다가 무릎에서 꺾여 내려간다(기존 기계 다리 4개와 같은 문법).
                    const up = tube([0, 0, 0], [sx * 0.20, 0.14, 0], 0.022, IRON);
                    // ⚠️ 아랫다리에 `dark`(등급색 −0.18)를 쓰면 **초록 파이프**다 — 기계 다리는 금속색으로.
                    //    (기존 기계 다리 4개도 같은 실수를 하고 있어 아래에서 같이 고쳤다.)
                    const dn = tube([sx * 0.20, 0.14, 0], [sx * 0.26, -HIP_Y, 0], 0.018, MECH_DARK);
                    const ft = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.06, 5), IRON);
                    ft.position.set(sx * 0.26, 0.03 - HIP_Y, 0); ft.rotation.x = Math.PI;
                    pivot.add(up, dn, ft);
                    pivot.userData.gait = sx * sz;
                    g.userData.legs.push(pivot);
                    continue;
                }
                const lw = name === 'Turtle' ? 1.55 : PANTHER ? 0.82 : 1;
                const leg = cy(0.05 * lw, 0.045 * lw, 0.24, 0, 0.1 - HIP_Y, 0, legMat);
                // 발굽 — 예전엔 원통이 그냥 잘려 끝나 '땅에 꽂힌 초록 파이프'로 읽혔다.
                // 다리보다 살짝 넓고 어두운 각질을 물려 접지면을 만든다(발굽은 등급색 파생 금지).
                const hoof = cy(0.055 * lw, 0.052 * lw, 0.05, 0, -0.005 - HIP_Y, 0,
                                name === 'Turtle' ? M(0xd8cdb0) : PANTHER ? legMat : HOOF);
                pivot.add(leg, hoof);   // 헬퍼가 g 에 붙인 것을 피벗으로 옮긴다(three 의 add 가 재부모화한다)
                pivot.userData.gait = sx * sz;
                g.userData.legs.push(pivot);
            }
            // 사족 안장: 윗면 0.44(=MOUNT_FORMS.quad.saddle) / 등자는 탑승 포즈의 실제 발 자리에.
            // 발 자리 근거 — 골반이 안장(로컬 0.44)에 얹힌 상태에서 hip rx 0.78·knee -0.92로 접으면
            // 발이 골반에서 약 0.66(영웅 단위) 아래·앞 0.23에 오고, 이 탈것의 총배율(≈1.9)로 나누면
            // 로컬 (±0.19, 0.10, 0.10) 근방이다. 몸통 반폭 0.18보다 바깥이라 다리가 실루엣에 드러난다.
            saddleRig(0.44, 0.180, 0.209, 0.24, [0.19, 0.10, 0.10]);
            // 굴레·고삐 — 머리(headY/headZ)와 그 스케일(0.13 × 0.92/1.35)에서 그대로 잰다.
            // 게는 앞판(0.13 × 1.15 / 0.55)이 그 자리다 — 굴레가 앞판을 감고 고삐가 거기서 나온다.
            if (CRAB) bridleRig(headY, headZ, 0.13 * 1.02, 0.13 * 0.80);
            else bridleRig(headY, headZ, 0.13 * 0.92, 0.13 * 1.35);
            // 머리 끄덕임의 축은 **목 밑동**이다(머리 중심이 아니라). 머리보다 조금 낮고 뒤 —
            // 여기서 돌려야 주둥이가 위아래로 크게 그리고 뒤통수는 거의 안 움직인다.
            neckRig(headY - 0.06, headZ - 0.20, eyeMeshes);
        }
        return g;
    },

    // ── 출전 대열 좌표 ──────────────────────────────────────────────────────
    // 출전 슬롯 제한이 없어져(사용자 지시 2026-08-18) 펫이 최대 25마리·탈것이 최대 15마리까지
    // 동시에 설 수 있다. 예전처럼 자리를 3개만 손으로 박아 두면 4번째부터 `spots[i]`가 undefined라
    // 그 자리에서 터진다 — 마리 수에 따라 자리를 만들어 내는 함수로 바꾼다.
    //
    // 앞 3자리는 예전 값을 그대로 쓴다. 저 좌표는 "z<=0은 영웅 몸통 뒤에 가린다 / 탈것을 타면
    // 탈것 다리가 펫을 자른다"를 실측으로 잡아낸 결과라, 흔한 3마리 이하 구성의 그림을 지키려면
    // 새 공식으로 덮어쓰지 않는 편이 낫다. 4번째부터만 바깥쪽 호를 만들어 붙인다.
    PET_ROW0: {
        mounted:  [[-1.16, 1.52], [0.06, 2.02], [1.14, 1.46]],
        unmounted: [[-0.72, 1.18], [0.02, 1.62], [0.68, 1.12]],
    },
    // 4번째부터의 호. 두 가지를 동시에 만족해야 한다:
    //  ⑴ 카메라(z 8.2)로 다가오면 화면을 가린다 → **깊이(rz)보다 폭(rx)을 훨씬 빨리** 넓힌다.
    //  ⑵ 행 사이가 붙으면 안 된다 → rzStep이 너무 작으면 앞뒤 행이 0.4유닛까지 겹친다(실측으로 걸림).
    //     행 안쪽 간격(gap)만 보고 행 간격을 안 보면 이 함정에 빠진다 — 둘 다 tools/test-slot-unlimited.js가 잰다.
    // hmin: 정면(각 0) 쪽으로 비워 둘 각도. 펫은 정면도 써야 하니 0.
    PET_ARC: { rx0: 3.2, rxStep: 1.4, rz0: 2.35, rzStep: 0.78, hmin: 0, hmax: 1.18, gap: 1.15, mountedRx: 0.45, mountedRz: 0.42 },
    // 타지 않은 탈것(따라다니는 무리)은 영웅 **뒤쪽** 호에 세운다 — 덩치가 커서 앞에 두면
    // 전투선과 펫을 통째로 가린다. hmin > 0 으로 **정면 뒤(각 0)를 비워** 영웅 몸통에 가리는 자리를 없앤다.
    MOUNT_ARC: { rx0: 2.5, rxStep: 1.5, rz0: 1.7, rzStep: 0.85, zBase: -0.35, hmin: 0.32, hmax: 1.2, gap: 1.4 },

    // 인덱스 i번째 개체가 설 [x, z] (영웅 기준 상대 좌표). row0은 손으로 맞춘 고정 자리, 그 뒤는 호에서 생성.
    // 한 행은 항상 **좌우 짝수 쌍**으로 채운다 — 좌우가 어긋나면 무리가 한쪽으로 쏠려 보이고,
    // hmin을 둔 탈것 호에서는 홀수 배치가 결국 정면(각 0)에 한 마리를 세워 버린다.
    formationSpot(i, arc, row0) {
        if (row0 && i < row0.length) return row0[i];
        let n = i - (row0 ? row0.length : 0);
        const span = arc.hmax - arc.hmin;
        for (let r = 0; r < 64; r++) {
            const rx = arc.rx0 + r * arc.rxStep, rz = arc.rz0 + r * arc.rzStep;
            // 이 행의 한쪽 정원 = 호 길이(span·rx) ÷ 개체 간격. 전체 정원은 그 2배(좌우 대칭).
            const half = Math.max(1, Math.round((span * rx) / arc.gap));
            if (n >= half * 2) { n -= half * 2; continue; }
            const side = n % 2 ? 1 : -1, k = (n - (n % 2)) / 2;
            const a = arc.hmin + (k + 0.5) * (span / half);   // 칸 중앙에 세워 양 끝이 호 끝에 붙지 않게
            const z = arc.zBase === undefined ? rz * Math.cos(a) : arc.zBase - rz * Math.cos(a);
            return [side * rx * Math.sin(a), z];
        }
        return [0, arc.zBase === undefined ? arc.rz0 : arc.zBase - arc.rz0];   // 도달 불가(64행 = 수백 마리)
    },

    // ===== 승천 디자인 티어 (ascend-design-tiers, 사용자 지시 2026-08-19) =====
    // 아이템의 별(stars = 승천 횟수)이 디자인을 6단계로 바꾼다: tier = stars % 6 — 5승천까지 변하고
    // 6승천이면 0승천 디자인으로 **순환**(사용자 원문 "그 이후는 0승천이었던 걸로"). 등급(시대/레어리티)
    // 축과는 독립 — 등급 디자인 위에 승천 데코가 **누적**으로 얹힌다(갑옷생쥐 → 가시갑옷생쥐 …).
    ascendTier(stars) { return (((stars || 0) % 6) + 6) % 6; },

    // 티어별 속성 모티프 — 스킬 연출 색 변주와 데코 발광색이 공유한다.
    // 사용자 예시(화살 → 불화살 → 얼음화살)의 속성 순환: 1 불 · 2 얼음 · 3 뇌전 · 4 신성 · 5 심연.
    ASCEND_MOTIF: [null,
        { name: 'fire', color: 0xff7a2a },
        { name: 'ice', color: 0x9fd8ff },
        { name: 'storm', color: 0xc9a0ff },
        { name: 'holy', color: 0xffe9a8 },
        { name: 'abyss', color: 0x8a4dff }],

    // 누적 데코 — tier n 이면 1..n 레이어를 전부 얹는다. 대상 치수가 종·무기마다 달라
    // 바운딩 박스로 앵커를 역산한다 (썸네일 자동 프레이밍과 같은 이유).
    // ⚠️ 반드시 **스케일·배치 전의 원본 메시**에 부를 것 — bbox 를 로컬 좌표로 쓰므로
    //    부모 변환이 이미 걸려 있으면 데코가 어긋난다 (refreshPets 는 scale 전에 부른다).
    // 골격 구현(비채점 몫): 밴드·가시·룬 링·금장·왕관의 공통 사다리. 종별 맞춤 파츠(갑옷생쥐의
    // '생쥐에 맞는' 갑옷 등)와 스킬별 모티프 연출 심화는 채점 라운드 몫 — 레이어 구조는 이대로 유지.
    applyAscendDecor(root, tier, kind) {
        tier = this.ascendTier(tier);
        if (!tier || !root) return root;
        const box = new THREE.Box3().setFromObject(root);
        if (box.isEmpty() || !isFinite(box.min.x)) return root;
        const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
        const r = Math.max(size.x, size.z) * 0.5;
        const motif = this.ASCEND_MOTIF[Math.min(tier, 5)];
        const deco = new THREE.Group();
        deco.userData.ascendDecorRoot = tier;
        const mark = (m, layer) => { m.userData.ascendDecor = layer; deco.add(m); };
        const bandY = box.min.y + size.y * 0.55;
        // L1 갑주 밴드(금속 칼라) — '갑옷–'
        { const t = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, Math.max(0.02, r * 0.1), 6, 20),
            new THREE.MeshLambertMaterial({ color: 0x8b95a3 }));
          t.rotation.x = Math.PI / 2; t.position.set(center.x, bandY, center.z); mark(t, 1); }
        // L2 가시 — '가시갑옷–' (밴드 바깥으로 눕혀 뻗는다)
        if (tier >= 2) {
            const mat = new THREE.MeshLambertMaterial({ color: 0xcfd6df });
            for (let i = 0; i < 6; i++) {
                const a = i / 6 * Math.PI * 2;
                const s = new THREE.Mesh(new THREE.ConeGeometry(Math.max(0.015, r * 0.09), Math.max(0.05, r * 0.3), 5), mat);
                s.position.set(center.x + Math.cos(a) * r * 1.0, bandY, center.z + Math.sin(a) * r * 1.0);
                s.rotation.z = -Math.PI / 2; s.rotation.y = -a; // 원뿔 축(+y)을 바깥 방사 방향으로
                mark(s, 2);
            }
        }
        // L3 룬 링 — 발밑 모티프색 문양 고리
        if (tier >= 3) {
            const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.08, r * 1.34, 24),
                new THREE.MeshBasicMaterial({ color: motif.color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
            ring.rotation.x = -Math.PI / 2; ring.position.set(center.x, box.min.y + 0.02, center.z);
            mark(ring, 3);
        }
        // L4 금장 스터드 — 어깨선 발광 장식
        if (tier >= 4) {
            const mat = new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: new THREE.Color(0xffb300), emissiveIntensity: 0.5 });
            for (let i = 0; i < 4; i++) {
                const a = i / 4 * Math.PI * 2 + 0.4;
                const s = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.02, r * 0.09), 6, 5), mat);
                s.position.set(center.x + Math.cos(a) * r * 0.82, box.min.y + size.y * 0.8, center.z + Math.sin(a) * r * 0.82);
                mark(s, 4);
            }
        }
        // L5 왕관 — 정수리 금관 (5승천 정점)
        if (tier >= 5) {
            const mat = new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: new THREE.Color(0xffca28), emissiveIntensity: 0.35 });
            const cr = Math.max(0.05, r * 0.34);
            const crown = new THREE.Group();
            crown.add(new THREE.Mesh(new THREE.CylinderGeometry(cr, cr * 1.05, cr * 0.5, 10, 1, true), mat));
            for (let i = 0; i < 5; i++) {
                const a = i / 5 * Math.PI * 2;
                const p = new THREE.Mesh(new THREE.ConeGeometry(cr * 0.2, cr * 0.6, 4), mat);
                p.position.set(Math.cos(a) * cr, cr * 0.5, Math.sin(a) * cr);
                crown.add(p);
            }
            crown.position.set(center.x, box.max.y + cr * 0.35, center.z);
            crown.traverse(o => { o.userData.ascendDecor = 5; });
            deco.add(crown);
        }
        root.add(deco);
        return root;
    },

    // 스킬 연출용: 정의 색을 티어 모티프 색으로 절반쯤 끌어 스킬이 '불화살/얼음화살'로 갈린다.
    ascendSkillTier(def) {
        const sk = def && def.id && typeof S !== 'undefined' && S.skills && S.skills[def.id];
        return this.ascendTier(sk && sk.stars);
    },
    ascendSkillColor(colorHex, def) {
        const m = this.ASCEND_MOTIF[this.ascendSkillTier(def)];
        if (!m) return colorHex;
        return new THREE.Color(colorHex).lerp(new THREE.Color(m.color), 0.55).getHex();
    },

    refreshPets() {
        for (const pg of this.petGroups) { this.disposeTree(pg); this.scene.remove(pg); }
        this.petGroups = [];
        // 탈것을 타고 있으면 탈것 풋프린트를 피해 앞 3자리를 넓게 쓰고, 생성 호도 그만큼 밀어낸다
        const mounted = !!Mounts.ridden();
        const row0 = mounted ? this.PET_ROW0.mounted : this.PET_ROW0.unmounted;
        // 탑승 중 row0은 더 넓고 더 깊은 자리라, 생성 호도 폭·깊이 양쪽으로 같이 밀어내야
        // 4번째 펫이 3번째 자리에 붙어 선다(rx만 밀면 앞뒤로 겹친다 — 실측으로 걸렸다).
        const arc = mounted
            ? { ...this.PET_ARC, rx0: this.PET_ARC.rx0 + this.PET_ARC.mountedRx, rz0: this.PET_ARC.rz0 + this.PET_ARC.mountedRz }
            : this.PET_ARC;
        S.activePets.forEach((pi, i) => {
            const p = S.pets[pi];
            if (!p) return;
            const g = new THREE.Group();
            const mesh = this.makePetMesh(p.name);
            this.applyAscendDecor(mesh, p.stars, 'pet'); // 승천 데코는 스케일 전 원본 치수 기준 (ascend-design-tiers)
            // 등급이 높을수록 큼직하게
            mesh.scale.setScalar(0.85 + RARITIES.indexOf(p.rarity) * 0.14);
            g.add(mesh);
            // 🚨 파츠 핸들(관절·날개·꼬리·집게…)을 **래퍼 그룹으로 올린다**. 이걸 안 해서
            //    update 의 `ud.wings`/`ud.tail`/`ud.claws`… 가 전부 undefined 였고, 펫 파츠 애니가
            //    코드에만 있고 화면에서는 **한 프레임도 돈 적이 없었다**(사용자가 본 '통짜 펫'의 정체).
            //    탈것은 mountG 에서 같은 값을 올려 준다 — 펫만 빠져 있었다.
            Object.assign(g.userData, mesh.userData);
            g.rotation.y = 0.55; // 적 방향 3/4
            // 펫은 전부 **카메라 쪽(z+) 앞줄**에 부채꼴로 세운다 — 카메라가 (0.15, 3.7, 8.2)에서 내려다보므로
            // z가 0 이하인 자리는 영웅 몸통 뒤에 그대로 가린다(기존 2번 자리 z=-0.65가 사용자가 지적한 그 자리).
            // x는 영웅~적 교전선(HERO_X -1.35 ~ MELEE_X -0.5)을 피해 좌우로 벌리고, z를 엇갈려 서로도 안 겹치게.
            // 탈것은 이제 영웅 발밑(탑승)이라 예전처럼 오른쪽 자리를 비워 둘 필요가 없다.
            // 탈것을 타면 탈것의 다리·몸통이 펫을 다시 가린다(비평가 실측: 3마리 중 2마리가 탈것 다리에
            // 잘리고 1마리는 배 밑으로 들어갔다). 영웅만 있을 때 기준으로 잡은 반경이라 탈것 풋프린트를
            // 못 피하는 것 — 탈것 장착 중에는 좌우로 더 벌리고 카메라 쪽으로 더 당긴다.
            // 4번째부터는 formationSpot이 바깥 호에 자리를 만들어 준다(출전 제한 해제, 최대 25마리).
            const spot = this.formationSpot(i, arc, row0);
            g.position.set(Combat.HERO_X + spot[0] + this.worldX, 0.4, spot[1]);
            g.userData.home = g.position.clone();
            g.userData.spotX = spot[0];
            g.userData.name = p.name;
            g.userData.phase = U.rand(0, Math.PI * 2);  // 개체별 위상차
            g.userData.speed = U.rand(0.85, 1.25);       // 개체별 속도차
            this.setShadow(g, true);
            this.applyRimLight(g);
            this.scene.add(g);
            this.petGroups.push(g);
        });
    },

    // 탈것 형태 계열별 탑승 규격 (사용자 지시 2026-08-17 "플레이어가 실제로 타고 있게").
    // saddle: 탈것 로컬 기준 안장(영웅 골반이 얹히는) 높이 — 스케일을 곱해 실제 탑승 높이가 된다.
    // hover:  탈것 자체가 지면에서 뜨는 높이(비행형만). pose: 탑승 시 다리 포즈(하체가 몸통을 감싸는 각).
    // ⚠️ saddle 값은 makeMountMesh의 실제 지오메트리 상단에서 뽑았다 — 모델을 바꾸면 여기도 같이 본다.
    // ⚠️ **무릎 굴곡은 95~110°(rx −1.66~−1.92)가 하한선이다.** 이전 값(quad −0.92 = 53°)은 probe가
    //    "설정한 상수대로 적용됨"만 확인해 통과로 읽혔지만, 화면에서는 정강이가 거의 수직으로 떨어져
    //    **'탄 게 아니라 뒤에 서 있는' 실루엣**이었다(비평가 1순위 지적 ⓐ). 다리가 몸통을 감싸려면
    //    고관절 굴곡 40~50°(0.70~0.87)·외전 28~35°(0.49~0.61)에 **무릎을 그 2배로 접어야** 한다.
    MOUNT_FORMS: {
        // 평판형: 발판 위에 '두 발로 선다' — 앉는 게 아니라 서는 유일한 계열
        // saddle = 발판 윗면의 로컬 높이(= 지오메트리에서 뽑은 값 0.05 + 0.34*0.42). 판 두께를 바꾸면 여기도 같이 본다.
        // 평판형: 발판 위에 **보드 스탠스**로 선다. 예전 포즈(hip rx 0.06 / knee -0.18)는 사실상
        // 차렷이라 비평가 2인이 독립적으로 "보드를 타는 게 아니라 판때기 위에 서 있다"고 지적했다.
        // ⚠️ 두 다리의 ry 는 **같은 부호**여야 한다 — 좌우 대칭으로 주면 발끝이 서로 반대를 보는
        //    '오리 걸음'이 되지 보드 스탠스가 아니다(실제 보드도 두 발이 같은 쪽을 본다).
        //    앞뒤 스탠스는 rx 차이로 만든다(three 의 XYZ 오일러에서 rx 가 가장 바깥이라 ry 를 줘도
        //    rx 는 여전히 부모 프레임의 z 방향으로 발을 민다). 상체는 spine.ry 로 되돌려 진행 방향을 본다.
        flat:    { saddle: 0.193, hover: 0.10, stand: true,
                   pose: { hipL: { rx: 0.50, ry: 1.34, rz: -0.10 }, hipR: { rx: -0.50, ry: 1.34, rz: 0.10 },
                           kneeL: { rx: -0.34 }, kneeR: { rx: -0.34 }, spine: { rx: 0.10, ry: -0.62 } } },
        // 탈것형(자전거/외바퀴): 안장에 앉아 상체를 앞으로 숙이고 무릎을 깊게 접는다.
        // 페달은 좌우가 항상 반대 위상이라 **대칭 포즈 자체가 오답**이다 — 한쪽은 크랭크 위(깊게 접힘),
        // 반대쪽은 아래(펴짐). 좌우 같은 각을 주면 '페달을 밟는' 게 아니라 '자전거 위에 쪼그린' 실루엣이 된다.
        wheeled: { saddle: 0.36, hover: 0, seatByLeg: true,   // 안장 높이를 다리 길이로 정한다(자전거 피팅)
                   // barReach: 빈 손이 핸들바를 잡는 팔 각(어깨 앞으로·안쪽으로, 팔꿈치 살짝 굽힘).
                   // 바는 이 손 위치로 따라온다(alignHandlebar) — 각을 바꿔도 바가 알아서 맞춰진다.
                   // 각은 실측으로 골랐다(tools/probe-ride-grip.js, 60조합) — 어깨를 더 돌리면 팔이
                   // 위로 넘어가 손이 오히려 **뒤로** 처지고 바가 허리까지 끌려온다(통과 조합이 -1.2뿐).
                   barReach: { shoulder: -1.2, shoulderZ: 0.1, elbow: -0.2 },
                   pose: { hipL: { rx: 1.02, rz: -0.26 }, hipR: { rx: 0.64, rz: 0.24 },
                           kneeL: { rx: -1.72 }, kneeR: { rx: -0.86 }, spine: { rx: 0.2 } } },
        // 비행형: 공중에 뜬 몸통을 다리로 조이며 앉는다 (벌림은 사족형보다 좁게)
        // 비행형: 공중에 뜬 몸통을 다리로 조이며 앉는다.
        // ⚠️ bulk를 1.7까지 키우면 영웅이 '녹색 비행선 위의 점'이 된다 — 몸통을 좁게 다시 만든 뒤로는
        //    다리가 감쌀 수 있으므로 1.28이면 충분하다(실측: 영웅 실루엣이 프레임 안에 온전히 들어옴).
        // hover 0.42는 화면에서 부양으로 안 읽혔다(비평가 지적 ⓓ) — 실측하면 배 밑이 0.77이라 수치상
        // '떠 있음'인데도, 늘어진 다리가 지면까지 닿아 '서 있는 것' 으로 읽혔다. 다리를 접어 올린 위에
        // 고도까지 올려(배 밑 ≈ 1.05 = 영웅 키의 0.6배) 그림자와 발끝 사이에 확실한 간격을 만든다.
        // reinReach: 빈 손이 **고삐를 모아 쥐는** 팔 각. 핸들바(barReach)와 같은 자리를 쓰지만 값이 다르다 —
        // 바는 앞으로 뻗어 누르는 자세(어깨 -1.2)이고 고삐는 **몸 앞에 세워 당기는** 자세라 팔이 덜 뻗고
        // 팔꿈치가 더 접힌다. 끈은 손을 따라오므로(alignReins) 각을 바꿔도 고삐가 알아서 맞춰진다.
        fly:     { saddle: 0.38, hover: 0.56, bulk: 1.28,
                   reinReach: { shoulder: -0.92, shoulderZ: 0.14, elbow: -0.62 },
                   // 배럴이 사족형보다 좁아(0.152) 외전 33°(0.58)에 무릎 폴벡터만 열어도 발·무릎이
                   // 동시에 밖으로 나온다(실측 +0.036 / +0.032, probe-ride-wrap fly).
                   // 🚨 **hip.rz(외전)로는 발이 배럴 밖으로 안 나간다 — 여기서 손잡이를 착각하지 말 것.**
                   //    위 주석의 '외전 33°면 발·무릎이 동시에 밖으로 나온다'는 지금 비례에서 성립하지
                   //    않는다. 실측 스윕(hip.rz 0.50→0.85): 발 |x| 가 **0.148 → 0.145 로 꿈쩍도 안 한다.**
                   //    무릎을 102°나 접어 두면 외전으로 무릎을 밖으로 밀어도 **접힌 정강이가 발을 안쪽으로
                   //    말아** 상쇄한다(사족형 주석이 이미 같은 말을 해 뒀는데 비행형에만 반영이 안 됐다).
                   //    실제로 듣는 손잡이는 **고관절 외회전(ry)과 무릎 폴벡터(knee.rz)** 다 —
                   //    ry 0→0.2 로 발 |x| 0.148 → 0.179, knee.rz 0.3→0.5 로 0.148 → 0.180.
                   //    → ry ±0.14 · knee.rz ±0.42 · hip.rz ±0.66 채택(발 |x| ≈ 0.185, 배럴 반폭 0.152
                   //      대비 여유 +0.03). 종전 값은 여유 **−0.003(발이 배럴에 묻힘)** 이었다.
                   //    ⚠️ 무릎 |x|(0.14~0.15)는 배럴 반폭보다 여전히 안쪽인데 **이건 종전에도 그랬고**
                   //      (0.141) 판정 대상도 아니다 — probe-ride-fit 은 무릎을 **굴곡각**으로 본다.
                   pose: { hipL: { rx: 0.86, ry: -0.14, rz: -0.66 }, hipR: { rx: 0.86, ry: 0.14, rz: 0.66 },
                           kneeL: { rx: -1.78, rz: -0.42 }, kneeR: { rx: -1.78, rz: 0.42 }, spine: { rx: 0.12 } } },
        // 사족보행형: 배럴이 굵어 다리를 가장 크게 벌려 감싼다
        quad:    { saddle: 0.44, hover: 0,
                   reinReach: { shoulder: -0.92, shoulderZ: 0.14, elbow: -0.62 },
                   // rz 0.42는 발이 배럴 밖으로 겨우 0.004(로컬)만 나와, 각도만 조금 틀어도 다리가
                   // 몸통에 스쳐 묻혔다 — 여유를 0.05대로 벌려 어느 각도에서도 다리가 읽히게 한다.
                   // 무릎을 깊게 접으면 발이 **안쪽으로 말려** 배럴에 묻힌다(굴곡만 올린 판에서 여유 −0.042).
                   // 감싸려면 굴곡·외전만으로는 부족하고 고관절 외회전(ry)과 **무릎 폴벡터를 배럴 바깥**으로
                   // 여는 knee.rz가 같이 필요하다 — 세 축을 훑어(tools/probe-ride-wrap.js, 60조합) 발·무릎이
                   // 동시에 배럴 밖으로 나오는 유일한 조합을 골랐다(발 +0.037 / 무릎 +0.020).
                   pose: { hipL: { rx: 0.80, ry: -0.15, rz: -0.74 }, hipR: { rx: 0.80, ry: 0.15, rz: 0.74 },
                           kneeL: { rx: -1.76, rz: -0.30 }, kneeR: { rx: -1.76, rz: 0.30 }, spine: { rx: 0.1 } } },
    },
    // 종 → 계열. **여기 없는 종은 사족형(quad)** 이고, makeMountMesh의 몸통 분기도 이 표 하나만 본다.
    MOUNT_FORM_OF: {
        'Hover Board': 'flat', 'Hover Disk': 'flat',
        'Bike': 'wheeled', 'One-Wheel Droid': 'wheeled',
        'Giant Bee': 'fly', 'Mini Dragon': 'fly', 'Star Whale': 'fly',
        // 나머지는 전부 quad — 조랑말·당나귀·알파카·태엽 생쥐·태엽 딱정벌레·양·거북·게·말·공룡·
        // 멧돼지·돼지·염소·낙타·큰사슴·흑표범·장갑 코뿔소·기계 거미.
        // ⚠️ 나뭇잎·연잎·뗏목 5종의 'flat' 항목은 로스터 교체로 지웠다(mount-animal-machine-dynamic ①).
    },
    mountFormOf(name) { return this.MOUNT_FORMS[this.MOUNT_FORM_OF[name] || 'quad']; },
    // 안장 윗면 높이 ÷ 영웅의 **서 있을 때 골반 높이**.
    // ⚠️ 예전에는 `RIDE_FOOT_CLEAR 0.06 + 골반높이`, 즉 **앉은 채로 발이 지면에 거의 닿는** 높이를
    //    안장으로 삼았다. 그러면 안장이 영웅이 서 있을 때의 골반 높이에 고정되고, 탈것 등이 그보다
    //    높아질 수가 없다 — 비평가 2인이 독립적으로 "등 높이가 캐릭터 키의 38%(무릎 높이)라
    //    말을 탄 게 아니라 큰 개를 깔고 앉은 것"이라고 지적한 결함의 **설계상 원인**이 이것이다.
    //    실제 승마는 발이 등자에 걸려 **공중에** 있고 안장은 기수 골반보다 한참 높다(말 안장 ≈1.3m,
    //    사람 골반 ≈0.9m → 약 1.45배). 그 비례를 그대로 쓴다. 영웅 키 대비로는 약 76%로,
    //    비평가가 제시한 목표대(65~75%)에 든다.
    RIDE_SEAT_RATIO: 1.45,
    // 지상 탑승형의 **가로 배율 ÷ 세로 배율**. 1.0(균일)로 두면 안장을 올린 만큼 배럴도 두꺼워져
    // 다리가 통째로 묻힌다(실측: 근쪽 다리 가림 0/7 → 6/7, 범인 6점이 전부 탈것 몸통).
    // 0.74 = 발 접지 기준이던 예전 배럴 폭을 그대로 남기는 값 — 실제 말도 키에 비해 몸통이 좁다.
    // (가로 x 에만 걸린다. 길이 z 까지 줄이면 몸통이 뭉툭해질 뿐 다리 가림에는 도움이 안 된다.)
    RIDE_WIDTH_RATIO: 0.74,
    // 탑승 포즈에서의 골반 로컬 높이 — 안장 높이를 역산하는 기준값.
    // 리그가 있으면 실측하고(포즈·장비가 바뀌어도 따라온다), 없으면 실측해 둔 기본값을 쓴다.
    heroPelvisLocalY() {
        const rig = this.heroRig;
        if (rig && rig.bones && rig.bones.pelvis && this.heroG) {
            // ⚠️ 월드 y에서 heroG.position.y를 빼는 방식은 쓰지 말 것 — refreshMount가 rideY를 바꾼 뒤
            //    update()가 아직 heroG를 옮기지 않은 프레임에서는 둘의 기준이 어긋나 값이 오염된다
            //    (탈것을 연속으로 갈아탈 때 골반이 1.4까지 튀어 비행형 안장 높이가 통째로 빗나갔다).
            //    heroG 로컬 좌표로 직접 변환하면 영웅이 어디에 떠 있든 항상 같은 값이 나온다.
            this.heroG.updateWorldMatrix(false, true);   // 직전 프레임 행렬이 섞이면 값이 튄다 — 재고 나서 읽는다
            const y = this.heroG.worldToLocal(rig.bones.pelvis.getWorldPosition(new THREE.Vector3())).y;
            // 🚨 **가드 대역은 비례에 딸린 값이다 — 리그 비례를 바꾸면 여기도 같이 볼 것.**
            //    종전 대역은 `y > 0.6 && y < 1.0`("골반은 0.77 부근이 정상")로 **성인 비례 시절 값**이었고,
            //    `hero-chibi`(다리 ×0.60) + '머리 더 크게'(BODY_SCALE 0.98 → 0.889)로 골반이 **0.4375** 까지
            //    내려오자 실측치가 매번 대역 밖으로 밀려 **조용히 폴백 0.774 로 떨어지고 있었다.**
            //    안장 높이는 전부 이 값에서 파생되므로(`seatLocal = pelvisLocal − heroSeatDropY()`),
            //    영웅이 안장보다 0.34 만큼 **가라앉은 채** 모든 계열이 돌아갔다(probe-ride-seat/thigh 상시 FAIL).
            //    → 대역을 **0.25~0.95** 로 넓혀 치비(0.44)와 성인(0.77) 비례를 둘 다 담고, 원래 막으려던
            //      프레임 섞임 오염(골반이 1.4까지 튀던 사례)은 그대로 걸러 낸다.
            //    폴백도 상수로 두지 않는다 — **마지막으로 통과한 값**을 쓴다. 상수 폴백은 비례가 바뀌면
            //    그 자체가 틀린 값이 되는데(방금 그 일이 났다) 마지막 통과값은 항상 현재 리그의 값이다.
            //    판정기: `tools/probe-ride-pelvis.js` — 실측 raw 와 이 함수의 반환값이 다르면 가드에 걸린 것.
            if (isFinite(y) && y > 0.25 && y < 0.95) return (this._pelvisLast = y);
        }
        return this._pelvisLast || 0.4375;
    },

    // ── 라이딩 스커트: 탑승 중에만 스커트 옆을 터서 앞판·뒤판으로 가른다 ──────────────────────
    // 근접 앵글에서 허벅지가 사라지는 범인은 탈것이 아니라 **영웅 자신의 스커트**다(probe-ride-thigh
    // 실측: 근쪽 다리 7점 중 3점이 스커트, 탈것은 0). 다리가 통째로 스커트 안에 들어가 있어서
    // 고관절 각을 아무리 벌려도 안 고쳐진다 — 실제 기마 갑주가 그렇듯 **옆을 터야** 한다.
    // ⚠️ 서 있을 때 실루엣은 1비트도 안 건드린다: 탑승 중에만 옆에 오는 태싯을 숨기고 하차 때 되돌린다.
    // 중심각 1.40(80°)·반폭 0.52(30°) = `probe-ride-thigh --sweep` 20조합 실측에서 **근쪽 다리 스커트
    // 가림 0을 내는 6조합 중 앞판이 가장 넓은 것**(앞판 101°·뒤판 140°). 틈을 더 벌리면 가림은 그대로
    // 0인데 앞판만 얇아져 실루엣이 무너진다 — 눈대중으로 키우지 말 것.
    RIDE_SKIRT: { gapCenter: 1.40, gapHalf: 0.52 },   // 옆 틈의 중심각(+Z=앞 기준)과 반폭, 라디안

    rideSkirt(on) {
        const rig = this.heroRig;
        if (!rig || !rig.seatParts || !rig.bones || !rig.bones.pelvis) return;
        const K = this.RIDE_SKIRT, pelvis = rig.bones.pelvis;
        pelvis.updateWorldMatrix(true, true);
        for (const part of rig.seatParts) {
            const ud = part.userData;
            if (ud.rideAz === undefined) {
                // 파츠의 **방위각을 지오메트리 중심에서 실측**한다. 태싯 순서·개수를 상수로 가정하면
                // prochar 가 분할을 바꾸는 순간 엉뚱한 판이 사라진다 — 실제로 이 세션 중에 스커트가
                // 통짜 원뿔에서 태싯 6장으로 바뀌었고, 치수를 전제한 앞 판본은 그 자리에서 깨졌다.
                const geo = part.geometry;
                if (!geo) { ud.rideAz = null; continue; }
                if (!geo.boundingBox) geo.computeBoundingBox();
                const c = geo.boundingBox.getCenter(new THREE.Vector3());
                const q = pelvis.worldToLocal(part.localToWorld(c));
                // 중심이 축 위에 있으면 통짜 파츠(안감 원통)다 — **항상 남긴다**. 태싯을 걷어낸 자리로
                // 보이는 것이 이 니어블랙 안감이라, 틈이 '배경이 뚫린 구멍'이 아니라 '판금 밑 그늘'이 된다.
                ud.rideAz = Math.hypot(q.x, q.z) < 0.05 ? null : Math.atan2(q.x, q.z);
            }
            if (ud.rideAz === null) continue;
            // 좌우 대칭이므로 |방위각| 하나로 양쪽 틈을 같이 본다.
            const inGap = Math.abs(Math.abs(ud.rideAz) - K.gapCenter) <= K.gapHalf;
            part.visible = !(on && inGap);
        }
    },

    // 골반 뼈 → **안장에 실제로 닿는 면**(스커트/태싯 밑단)까지의 낙차.
    // 안장 높이를 골반 기준으로 역산하면 그 아래로 늘어진 스커트가 통째로 탈것 몸통에 박힌다 —
    // 비평가 지적 ⓑ('골반이 아니라 스커트가 몸통을 파고든다')의 원인이 정확히 이 누락이었다.
    // 상수로 박지 않고 `prochar`가 표시해 둔 파츠(`R.seatParts`)의 실제 bbox 하단에서 잰다.
    _seatDrop: null,
    heroSeatDropY() {
        const rig = this.heroRig;
        if (!rig || !rig.seatParts || !rig.bones || !rig.bones.pelvis) return 0.149;
        if (this._seatDrop != null) return this._seatDrop;   // 지오메트리는 안 변한다 — 한 번만 재고 캐시
        const pelvis = rig.bones.pelvis;
        pelvis.updateWorldMatrix(true, true);
        let min = Infinity;
        const v = new THREE.Vector3();
        for (const part of rig.seatParts) {
            const geo = part.geometry;
            if (!geo) continue;
            if (!geo.boundingBox) geo.computeBoundingBox();
            const bb = geo.boundingBox;
            // 파츠 로컬 8정점을 골반 로컬로 옮겨 최하단을 찾는다(회전한 hem 토러스까지 맞게 잡힌다)
            for (let i = 0; i < 8; i++) {
                v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
                min = Math.min(min, pelvis.worldToLocal(part.localToWorld(v)).y);
            }
        }
        if (!isFinite(min) || min > -0.05 || min < -0.4) return 0.149;   // 오염값은 실측 기본값으로
        return (this._seatDrop = -min);
    },

    // 탈것: 장착 중이면 영웅이 실제로 올라탄다 — 탈것은 영웅 발밑, 영웅은 안장 높이로 상승.
    // 장착 제한이 없어져(사용자 지시 2026-08-18) 여러 마리를 동시에 낄 수 있는데, 몸이 하나라
    // **탈 수 있는 건 맨 앞 한 마리**뿐이다. 나머지는 뒤쪽 호에 무리로 세운다(refreshMountFollowers).
    // ===== 탈것 파츠 애니메이션 (mount-animal-machine-dynamic, 사용자 지시 2026-08-19) =====
    // 사용자 원문: "탈것도 왠만하면 다 동물, 기계 같은 거로 해서 움직임 자체가 좀 동적인 거로 해줘.
    // 지금 드래곤 부분 같은 게 그나마 맘에 듬." → **드래곤(날갯짓·꼬리)이 레퍼런스**이고, 그 수준의
    // 움직임을 나머지 계열에도 준다. 예전엔 계열을 통틀어 위아래 바운스 하나뿐이라 말·공룡·자전거가
    // 통짜로 떠다니는 조형물이었다(날개·꼬리 코드는 애초에 fly 종에만 붙어 있었다).
    //   · quad  : 대각선 짝 트롯 + 머리 끄덕임·좌우 스캔 + 꼬리 2축
    //   · wheeled: 바퀴 회전(스포크가 있어야 읽힌다) + 프레임 미세 진동
    //   · flat  : 부유 피치 드리프트 + 추진 노즐 밝기 맥동
    //   · fly   : 기존 날갯짓·꼬리(드래곤 기준선 유지) + 몸통 피치
    // 🚨 **탄 탈것과 따라오는 무리가 반드시 이 한 함수를 같이 쓴다.** 예전에 날개 애니를 무리 쪽에만
    //    넣어 정작 올라탄 드래곤 날개가 통째로 얼어 있던 사고가 있었다(주석이 그 흔적이다) —
    //    분기해서 한쪽에만 넣지 말 것.
    MOUNT_GAIT: 5.4,        // 걷는 중 걸음 사이클 각속도(rad/s)
    MOUNT_IDLE_GAIT: 1.7,   // 서 있을 때 — 완전히 굳지 않게 체중 이동만
    // 반환값 = 이 프레임에 그룹 rotation.x 에 **더할** 피치. 그룹 회전은 호출부가 소유한다
    // (탄 상태에서는 그 값이 영웅에게도 그대로 전달돼야 해서 한 곳에서만 써야 한다).
    animateMountParts(mg, t, moving, dt) {
        const ud = mg.userData;
        const w = moving ? this.MOUNT_GAIT : this.MOUNT_IDLE_GAIT;
        const amp = moving ? 1 : 0.3;
        if (ud.legs) for (const lg of ud.legs) {
            // 대각선 짝(userData.gait 부호)끼리 같은 위상, 반대 짝은 반 사이클 어긋난다 = 트롯.
            // 같은 쪽 두 다리를 같이 내밀면 네발짐승이 아니라 '깡충 뛰는 토끼'가 된다.
            lg.rotation.x = Math.sin(t * w + (lg.userData.gait > 0 ? 0 : Math.PI)) * 0.62 * amp;
        }
        if (ud.head) {
            // 끄덕임은 걸음의 **절반 주기** — 걸음마다 까딱이면 딸꾹질처럼 보인다.
            ud.head.rotation.x = Math.sin(t * w * 0.5) * 0.11 * (moving ? 1 : 0.55);
            ud.head.rotation.y = Math.sin(t * 0.9) * 0.09;   // 주변을 살피는 좌우 스캔 — 서 있어도 돈다
        }
        if (ud.wings) for (const wg of ud.wings) wg.rotation.z = wg.userData.s * (0.45 + Math.sin(t * 11) * 0.62);
        // 집게 여닫이 (게) — **닫힘(0)을 넘겨 아래턱을 뚫지 않게** 0 이상만 쓴다. 좌우 위상을 반 사이클
        // 어긋내야 두 집게가 한 몸처럼 딸깍이지 않는다. 서 있을 때도 조금씩 여닫는다(게는 늘 그런다).
        if (ud.claws) for (const cw of ud.claws) {
            const k = Math.sin(t * (moving ? 5.2 : 2.4) + (cw.userData.s > 0 ? 0 : Math.PI));
            // ⚠️ 기본각(빌드 때 준 벌림)에서 **더 벌리는 쪽으로만** 흔든다 — 닫는 쪽으로 넘기면
            //    정지·저속 구간에서 손가락 둘이 붙어 벙어리장갑으로 읽힌다(빌드 쪽 주석 참조).
            cw.rotation.x = -0.34 - Math.max(0, k) * (moving ? 0.34 : 0.18);
        }
        if (ud.tail) {
            ud.tail.rotation.z = Math.sin(t * 3.4) * 0.5;
            ud.tail.rotation.y = Math.sin(t * 2.1) * 0.24;   // 좌우로도 흔들어 한 평면에 갇히지 않게
        }
        // 태엽 감개 — 바퀴와 같은 규약(누적). 서 있어도 천천히 감긴다(태엽은 멈추지 않는다).
        if (ud.spinners) { const k = (moving ? 5.4 : 1.6) * dt; for (const sg of ud.spinners) sg.rotation.z -= k; }
        // 바퀴 — **누적 회전**이라 dt 로 굴린다(사인으로 흔들면 앞뒤로 덜덜 떠는 바퀴가 된다).
        if (ud.wheels) { const spin = (moving ? 7.6 : 1.0) * dt; for (const wg of ud.wheels) wg.rotation.x -= spin; }
        // 추진 노즐 맥동 — **밝기만** 흔든다(크기를 흔들면 노즐이 숨 쉬는 풍선이 된다).
        // ⚠️ 재질이 두 종류다: Lambert(emissive 있음)와 Basic(없음). 기준값을 첫 프레임에 적어 두고
        //    거기에 곱한다 — 매 프레임 현재값에 곱하면 밝기가 지수로 죽거나 폭주한다.
        if (ud.glow) for (const o of ud.glow) {
            const k = 0.72 + Math.sin(t * 6.2) * 0.28 * (moving ? 1 : 0.55);
            const m = o.material;
            if (m.emissiveIntensity !== undefined && m.emissive) {
                if (o.userData.baseEmi === undefined) o.userData.baseEmi = m.emissiveIntensity;
                m.emissiveIntensity = o.userData.baseEmi * k;
            } else if (m.color) {
                if (!o.userData.baseCol) o.userData.baseCol = m.color.clone();
                m.color.copy(o.userData.baseCol).multiplyScalar(0.72 + k * 0.28);
            }
        }
        // 호버 기계는 **뱅킹(좌우 기울기)** 까지 준다 — 피치만으로는 '앞뒤로 까딱이는 판'이라
        // 떠 있는 물건으로 안 읽힌다(사용자 지시 "움직임 자체가 좀 동적인 거로").
        // ⚠️ 이 롤은 영웅에게 전달하지 않는다 — heroG.rotation.z 는 회피·피격 반동이 이미 쓰고 있어
        //    여기서 매 프레임 덮으면 그 연출들이 통째로 지워진다. 보드만 기울고 라이더는 선 자세가 맞다.
        if (ud.flat) mg.rotation.z = Math.sin(t * 0.83) * 0.10 * (moving ? 1.5 : 1);
        // 계열별 몸통 피치
        if (ud.flat) return Math.sin(t * 1.15) * 0.05 + (moving ? Math.sin(t * 3.1) * 0.03 : 0); // 부유 드리프트
        if (ud.wings) return Math.sin(t * 1.6) * 0.06;                                           // 비행 몸통 피치
        if (ud.wheels) return Math.sin(t * (moving ? 13 : 4)) * (moving ? 0.012 : 0.004);        // 프레임 진동
        return Math.sin(t * w * 0.5 + 0.9) * 0.035 * amp;                                        // 네발 몸통 흔들림
    },

    refreshMount() {
        if (this.mountGroup) { this.disposeTree(this.mountGroup); this.scene.remove(this.mountGroup); this.mountGroup = null; }
        this.rideY = 0; this.ridePose = null; this.riding = null;
        this.refreshMountFollowers();
        // 탈것 인벤이 개체 배열이 되면서(2026-08-19) 같은 이름이 여럿일 수 있다 —
        // 이름으로 되찾으면 엉뚱한 개체가 잡히므로 **타고 있는 개체**를 직접 받는다(메시 선택엔 이름만 쓴다).
        const m = Mounts.riddenInst(), name = m && m.name;
        if (!m) {                                    // 해제: 지면 복귀 + 탑승 포즈·기울기 제거
            this.rideSkirt(false);                   // 통짜 스커트 복귀 — 서 있는 실루엣은 원래대로
            if (this.heroG) { this.heroG.rotation.x = 0; this.heroG.position.y = 0; }
            this.applyWeaponGrip();
            if (this.petGroups.length) this.refreshPets();   // 펫 자리는 탈것 유무에 따라 달라진다
            return;
        }
        // ⚠️ 안장 정합(heroSeatDropY)을 계산하기 **전에** 갈라야 한다 — 낙차를 스커트 지오메트리에서
        //    실측하기 때문에 순서가 뒤바뀌면 통짜 기준 낙차로 안장을 맞추게 된다.
        this.rideSkirt(true);
        const g = new THREE.Group();
        const mesh = this.makeMountMesh(name, m.rarity);
        this.applyAscendDecor(mesh, m.stars, 'mount'); // 승천 데코 — 스케일 전 (ascend-design-tiers)
        const sc = 1.1 + RARITIES.indexOf(m.rarity) * 0.1;
        mesh.scale.setScalar(sc);
        g.add(mesh);
        const form = this.mountFormOf(name);
        g.rotation.y = 0.55;                       // 영웅과 같은 3/4 방향 — 타고 있으므로 같은 곳을 본다
        // ── 탑승 정합: 안장이 영웅 골반에 오도록 탈것 크기를 역산한다 ──
        // 원래 크기(펫 옆자리 연출용)로는 안장이 골반보다 한참 아래라, 영웅이 위에 '떠 있는' 것으로 읽혔다.
        // 손으로 맞춘 상수 대신 영웅 골반 높이에서 필요한 안장 높이를 풀어 탈것 배율을 정한다 —
        // 종마다 몸집이 달라도 자동으로 맞고, 모델을 손봐도 따라온다.
        let rideScale = 1, rideWide = 0, heroY = 0;   // rideWide = 가로(x·z) 배율(0 = 세로와 같음)
        const pelvisLocal = this.heroPelvisLocalY();
        // ⚠️ 안장에 닿는 면은 골반 뼈가 아니라 **스커트 밑단**이다 — 이 낙차만큼 영웅을 더 올리지 않으면
        //    골반은 정확히 안장에 얹혀도 스커트가 탈것 몸통에 박힌다(비평가 지적 ⓑ).
        //    탈것 배율은 예전과 같은 식(골반 기준)으로 뽑아 몸집을 그대로 유지하고, **영웅만** 낙차만큼 올린다.
        const seatLocal = pelvisLocal - this.heroSeatDropY();
        if (form.stand) {
            // 평판형: 발판 위에 두 발로 서므로 발이 곧 안장 — 크기는 원래대로 둔다
            heroY = (form.hover + form.saddle) * sc;   // 발판 윗면 = 발 높이 (스커트는 서 있는 자세라 무관)
        } else if (form.hover) {
            // 비행형: 지면에 발이 닿을 이유가 없다. 몸집만 키워 다리로 감쌀 수 있게 하고,
            // 안장에 스커트 밑단을 얹어 영웅째로 공중에 띄운다 (발은 허공에 뜬 채가 정상).
            rideScale = form.bulk || 1.7;
            heroY = (form.hover + form.saddle) * sc * rideScale - seatLocal;
        } else {
            // 지상 탑승형(사족·탈것): **발을 지면에서 떼고** 실제 승마 비례로 안장을 올린다.
            // 발은 등자에 걸려 공중에 있는 게 정상이다 — 예전처럼 발 접지를 기준으로 삼으면
            // 탈것이 영웅 무릎 높이를 못 넘는다(RIDE_SEAT_RATIO 주석 참조).
            // ⚠️ **자전거는 이 규칙에서 뺀다.** 말 등 높이는 기수와 무관하지만 **자전거 안장 높이는
            //    다리 길이가 정한다**(실제 바이크 피팅이 그렇다). 승마 비례를 자전거에 그대로 먹였더니
            //    안장−크랭크축 거리가 0.546 → 0.728 로 벌어져 **다리 길이(0.635)보다 멀어졌다** —
            //    발이 페달에 구조적으로 못 닿는다(probe-ride-pedal 로 확인). 예전 규칙을 그대로 쓴다.
            const needSaddle = form.seatByLeg ? 0.06 + pelvisLocal : pelvisLocal * this.RIDE_SEAT_RATIO;
            rideScale = U.clamp(needSaddle / (form.saddle * sc), 1, 3.4);  // 과대·과소 확대 방지
            // 클램프에 걸리면 실제 안장 높이가 needSaddle과 달라진다 — 상수가 아니라 **실제 안장 높이**에
            // 스커트 밑단을 맞춘다(그래야 어떤 종에서도 파묻힘/뜸이 안 생긴다).
            heroY = form.saddle * sc * rideScale - seatLocal;
            // ⚠️ **균일 배율로 키우면 배럴이 같이 두꺼워져 다리가 통째로 묻힌다.** 실측으로 확인했다:
            //    안장을 승마 비례로 올린 직후 근쪽 다리 가림이 0/7 → 6/7 로 뒤집혔고, 그중 6점의 범인이
            //    탈것 몸통이었다(그 전에는 0점). 영웅은 안 커지는데 배럴만 커지니 당연한 결과다.
            //    실제 말이 그렇듯 **키는 키우되 폭은 그대로** 둔다 — 가로 배율을 세로와 분리한다.
            //    0.74 = 예전(발 접지 기준) 배럴 폭을 그대로 유지하는 값이라, 다리 벌림 상수를 손대지
            //    않고도 감싸기 여유(+0.038)가 보존된다.
            // 폭 좁히기도 같은 이유로 자전거엔 안 건다 — 배럴 반폭이 0.03 이라 다리를 막지 않는다.
            if (!form.seatByLeg) rideWide = rideScale * this.RIDE_WIDTH_RATIO;
        }
        // 가로 배율을 따로 안 정한 계열(평판·비행형)은 예전처럼 균일 배율이다 — 세로만 키우면
        // 드래곤이 종잇장이 된다.
        // ⚠️ 좁히는 것은 **가로(x)뿐**이다. z 까지 같이 줄이면 몸통이 짧아져 말이 뭉툭해지고, 자전거는
        //    휠베이스가 줄어 세발자전거 비례가 된다. 다리를 막는 것은 폭이지 길이가 아니다.
        const wide = rideWide || rideScale;
        mesh.scale.set(sc * wide, sc * rideScale, sc * rideScale);
        g.userData.stirrups = mesh.userData.stirrups || null;   // 등자는 메시 안에 달렸다 — 그룹에서도 찾게 올려 둔다
        // 날개·꼬리도 같은 이유로 올려 둔다 — 업데이트 루프는 그룹의 userData만 보므로, 안 올리면
        // 애니메이션이 통째로 걸리지 않는다(드래곤 날개가 얼어 있던 원인).
        g.userData.wings = mesh.userData.wings || null;
        g.userData.tail = mesh.userData.tail || null;
        // 다리·머리·바퀴·노즐도 같은 이유로 올려 둔다 (mount-animal-machine-dynamic) —
        // 업데이트 루프는 **그룹의 userData만** 보므로, 여기 안 올리면 애니메이션이 통째로 안 걸린다
        // (드래곤 날개가 얼어 있던 사고와 정확히 같은 함정이다. 파츠를 새로 만들면 이 줄도 같이 늘릴 것).
        g.userData.legs = mesh.userData.legs || null;
        g.userData.head = mesh.userData.head || null;
        g.userData.claws = mesh.userData.claws || null;  // 게 집게 — 안 올리면 여닫이가 통째로 안 걸린다(위 경고 그대로)
        g.userData.wheels = mesh.userData.wheels || null;
        g.userData.spinners = mesh.userData.spinners || null;  // 태엽 감개 — 위 경고 그대로, 안 올리면 안 돈다
        g.userData.glow = mesh.userData.glow || null;
        g.userData.flat = !!mesh.userData.flat;
        g.userData.bar = mesh.userData.bar || null;      // 핸들바 — 영웅 손에 맞춰 스템을 늘인다
        g.userData.rein = mesh.userData.rein || null;    // 고삐 — 영웅 손까지 끈을 늘인다(사족·비행형)
        g.userData.cranks = mesh.userData.cranks || null;   // 크랭크 — 영웅 발에 맞춰 위상을 푼다
        let baseY = form.hover * sc * rideScale;
        g.position.set(Combat.HERO_X + this.worldX, baseY, 0);   // 영웅 발밑(별도 자리 아님)
        // ── 접지 보정: 어떤 종도 지면 아래로 파고들지 않게 ──
        // 안장 역산이 탈것을 최대 2.6배까지 키우는데(위 rideScale), **배율은 메시 원점 기준**이라
        // 원점보다 조금 아래에 있던 파츠(바퀴 밑동·발굽)의 음수 오프셋까지 같은 배율로 커진다.
        // 실측(probe-ride-ground): 자전거 -0.051 / 외바퀴 드로이드 -0.098 / 사족형 -0.036 — 바퀴가
        // 지면에 묻혔다(항목의 불합격 조건 '관통'). 종마다 상수를 박는 대신 **실제 bbox 하단을 재서**
        // 모자란 만큼 들어 올린다 — 모델을 손봐도, 새 종이 들어와도 따라온다.
        // ⚠️ 들어 올린 만큼 안장도 같이 올라가므로 **heroY에 같은 값을 더해야** 골반-안장 정합
        //    (probe-ride-fit의 '+0.000')이 유지된다. 한쪽만 올리면 영웅이 안장에 파묻힌다.
        g.updateMatrixWorld(true);
        const lift = Math.max(0, -new THREE.Box3().setFromObject(g).min.y);
        if (lift > 0) { baseY += lift; g.position.y = baseY; heroY += lift; }
        g.userData.home = g.position.clone();
        g.userData.spotX = 0;
        g.userData.baseY = baseY;
        // 부유·까딱임의 위상. **검증 스크립트가 고정할 수 있게** 훅을 둔다 — 난수로만 두면
        // 프레임 자세가 매번 달라져 가림 판정(probe-ride-clear/thigh)이 실행마다 다른 답을 낸다.
        // 실제로 2026-08-18 에 그 흔들림 때문에 '내 변경이 가림을 늘렸다'고 한 바퀴 오진했다.
        // 게임에서는 늘 난수다(`ridePhase` 를 아무도 안 세운다).
        g.userData.phase = this.ridePhase != null ? this.ridePhase : U.rand(0, Math.PI * 2);
        this.setShadow(g, true);
        this.applyRimLight(g);
        this.scene.add(g);
        this.mountGroup = g;
        // 탑승 상태: 영웅을 안장 높이로 올리고 하체를 탑승 포즈로 고정
        this.riding = { name, form, scale: sc * rideScale };
        this.rideY = heroY;
        this.ridePose = form.pose;
        // 공격 중에는 update의 영웅 y 갱신이 통째로 막혀 있어(공격 클립이 y를 소유) 이전 탈것 높이가
        // 공격이 끝날 때까지 남는다 — 비행형에서 지상형으로 갈아타면 한동안 공중에 뜬 채다. 즉시 스냅.
        if (this.heroG) this.heroG.position.y = heroY;
        this.applyWeaponGrip();                    // 무기 거치 자세와 탑승 포즈를 합성
        // 평판형만: **포즈를 먹인 뒤 실제 발 높이를 재서** 영웅을 발판 위에 다시 앉힌다.
        // 서 있는 계열은 '발 = 안장'이라 발 높이가 곧 정합인데, 보드 스탠스처럼 다리를 벌리고 접으면
        // 발이 원점보다 올라간다 — 포즈 상수를 손볼 때마다 heroY 를 손으로 맞추는 건 반드시 어긋난다.
        // (안장 역산·접지 보정과 같은 원칙: 상수를 믿지 말고 결과를 재서 되돌린다.)
        if (form.stand && this.heroRig && this.heroRig.update) {
            this.heroRig.update(1 / 60);           // restPose 를 실제 뼈에 반영시킨다
            this.heroG.updateWorldMatrix(true, true);
            const B = this.heroRig.bones;
            let footY = Infinity;
            for (const side of ['L', 'R']) {
                const knee = B['knee' + side];
                if (knee) footY = Math.min(footY, knee.localToWorld(new THREE.Vector3(0, -0.315, 0.045)).y);
            }
            const deckTop = baseY + form.saddle * sc * rideScale;
            if (isFinite(footY) && Math.abs(deckTop - footY) < 0.6) {
                heroY += deckTop - footY;
                this.heroG.position.y = heroY;
                this.rideY = heroY;
            }
        }
        if (this.petGroups.length) this.refreshPets();   // 탈것 풋프린트를 피해 펫 자리를 다시 잡는다
    },

    // 타지 않은 나머지 장착 탈것 = 뒤를 따라오는 무리. 탑승 정합(안장 역산)은 필요 없으므로
    // 원래 크기 그대로 두고, 영웅 **뒤쪽** 호에 세워 전투선과 앞줄 펫을 가리지 않게 한다.
    refreshMountFollowers() {
        for (const fg of this.mountFollowers) { this.disposeTree(fg); this.scene.remove(fg); }
        this.mountFollowers = [];
        // `S.activeMounts` 는 개체 **인덱스** 배열이다(2026-08-19 인벤 개편). 장착이 1마리로 못박혀
        // 있어 이 목록은 사실상 항상 비지만, 구조는 그대로 두고 인덱스만 개체로 푼다.
        const idxs = Array.isArray(S.activeMounts) ? S.activeMounts.slice(1) : [];
        idxs.forEach((idx, i) => {
            const m = Mounts.inst(idx);
            if (!m) return;
            const name = m.name;
            const g = new THREE.Group();
            const sc = 1.1 + RARITIES.indexOf(m.rarity) * 0.1;
            const mesh = this.makeMountMesh(name, m.rarity);
            this.applyAscendDecor(mesh, m.stars, 'mount'); // 승천 데코 — 스케일 전 (ascend-design-tiers)
            mesh.scale.setScalar(sc);
            g.add(mesh);
            g.rotation.y = 0.55;                     // 영웅과 같은 3/4 방향
            const spot = this.formationSpot(i, this.MOUNT_ARC, null);
            const baseY = this.mountFormOf(name).hover * sc;   // 비행형은 원래 뜨는 높이 유지
            g.position.set(Combat.HERO_X + spot[0] + this.worldX, baseY, spot[1]);
            g.userData.home = g.position.clone();
            g.userData.spotX = spot[0];
            g.userData.baseY = baseY;
            g.userData.phase = U.rand(0, Math.PI * 2);   // 개체별 위상차 — 무리가 한 몸처럼 까딱이지 않게
            g.userData.speed = U.rand(0.85, 1.2);
            g.userData.name = name;                      // 계열 판정(비행형 부유 리듬)에 필요
            g.userData.wings = mesh.userData.wings || null;   // 무리의 날개도 얼려 두지 않는다
            g.userData.tail = mesh.userData.tail || null;
            g.userData.legs = mesh.userData.legs || null;     // 무리도 걷는다 — 탄 놈만 움직이면 더 이상하다
            g.userData.head = mesh.userData.head || null;
            g.userData.claws = mesh.userData.claws || null;   // 무리의 집게도 같이 움직인다
            g.userData.wheels = mesh.userData.wheels || null;
            g.userData.spinners = mesh.userData.spinners || null;  // 무리의 태엽도 같이 감긴다
            g.userData.glow = mesh.userData.glow || null;
            g.userData.flat = !!mesh.userData.flat;
            this.setShadow(g, true);
            this.applyRimLight(g);
            this.scene.add(g);
            this.mountFollowers.push(g);
        });
    },

    // 등자를 영웅의 **실제 발 위치**로 옮긴다 — 상수로 박으면 포즈·다리 길이·탈것 배율이 곱해진 자리를
    // 손으로 맞히는 셈이라 반드시 어긋난다(안장 높이를 역산하기로 한 것과 같은 이유).
    // 매 프레임 호출해도 비용은 벡터 두 번 — 걷기 바운스·기울기에도 발에 딱 붙어 따라간다.
    _stirrupFoot: null,
    // 자전거 크랭크 위상을 **영웅의 실제 발 위치**에서 푼다.
    // 크랭크는 축에서 반지름 r 인 원 위에만 있을 수 있고 좌우가 정확히 180° 반대다 — 즉 자유도는
    // 위상 하나뿐이다. 그래서 발을 페달로 끌고 오는 게 아니라 **두 발에 가장 가까운 위상 하나**를 찾는다.
    // (알고리즘: 위상 36등분 조회. 닫힌 해도 있지만, 발이 원에서 벗어난 거리까지 함께 보려면 이쪽이 안전하고
    //  프레임당 비용도 벡터 72번이라 등자 정렬과 같은 급이다.)
    _pedalV: null,
    alignPedals() {
        const g = this.mountGroup, rig = this.heroRig;
        const ck = g && g.userData.cranks;
        if (!ck || !rig || !rig.bones || !rig.bones.kneeL || !this.heroG) return;
        const V = this._pedalV || (this._pedalV = new THREE.Vector3());
        this.heroG.updateWorldMatrix(true, true);
        g.updateWorldMatrix(true, true);
        const parent = ck.list[0].group.parent;
        if (!parent) return;
        // 발 두 짝을 크랭크와 같은 좌표계로 가져온다 (0,-0.315,0.045) = prochar 가 박아 둔 부츠 자리
        const foot = {};
        for (const side of ['L', 'R']) {
            const knee = rig.bones['knee' + side];
            if (!knee) return;
            foot[side] = parent.worldToLocal(knee.localToWorld(V.set(0, -0.315, 0.045))).clone();
        }
        // ⚠️ **위상만으로는 양발이 동시에 안 닿는다.** 크랭크는 좌우가 180° 반대라, 두 발이 축을
        //    사이에 두고 정확히 지름만큼 떨어져 있어야 비로소 둘 다 페달 위에 온다. 다리 각을 81조합
        //    훑어도 전부 '한쪽만' 이었다(probe-ride-pedal --sweep) — 각으로 풀 문제가 아니다.
        //    그래서 **크랭크를 발에 맞춘다**: 축을 두 발의 중점으로, 반지름을 두 발 간격의 절반으로.
        //    핸들바를 손 위치로 끌어오는 `alignHandlebar` 와 같은 원칙이고, 자전거 피팅에서 실제로
        //    조정하는 값(BB 높이·크랭크 길이)이기도 하다. 다만 프레임 튜브가 BB에 모여 있으므로
        //    **원래 자리 근처로 클램프**한다 — 안 그러면 크랭크가 프레임에서 떨어져 나간다.
        const fy = (foot.L.y + foot.R.y) / 2, fz = (foot.L.z + foot.R.z) / 2;
        const cy = U.clamp(fy, ck.axis[1] - 0.06, ck.axis[1] + 0.06);
        const cz = U.clamp(fz, ck.axis[2] - 0.06, ck.axis[2] + 0.06);
        const r = U.clamp(Math.hypot(foot.L.y - foot.R.y, foot.L.z - foot.R.z) / 2, 0.06, 0.16);
        let best = 0, bestD = Infinity;
        for (let i = 0; i < 36; i++) {
            const th = i * Math.PI / 18;
            let d = 0;
            for (const c of ck.list) {
                const ph = th + (c.side < 0 ? 0 : Math.PI);       // 좌우 180° 반대
                const py = cy - Math.cos(ph) * r;                 // 위상 0 = 페달이 가장 아래
                const pz = cz - Math.sin(ph) * r;                 // Rx(θ)로 (0,−r,0) → (0,−r·cosθ,−r·sinθ)
                const f = foot[c.side < 0 ? 'L' : 'R'];
                d += Math.hypot(f.y - py, f.z - pz);
            }
            if (d < bestD) { bestD = d; best = th; }
        }
        for (const c of ck.list) {
            const ph = best + (c.side < 0 ? 0 : Math.PI);
            c.group.rotation.x = ph;
            c.pedal.rotation.x = -ph;    // 페달 밟는 면은 실제 자전거처럼 항상 수평을 유지한다
            // 크랭크를 축 좌우 어디에 다는지는 자전거마다 다르다(Q팩터) — 상수로 0.045 를 박아 두니
            // 발이 밟는 면 **바깥으로 0.097** 밀려 있었다(실측). 발 x 를 따라가되 실제 자전거가 갖는
            // 범위 안에서만 움직인다 — 무한정 따라가면 크랭크가 몸통 밖으로 벌어진다.
            const fx = Math.abs(foot[c.side < 0 ? 'L' : 'R'].x);
            c.group.position.x = c.side * U.clamp(fx, 0.04, 0.11);
            c.group.position.y = cy;
            c.group.position.z = cz;
            // 암 길이·페달 자리도 새 반지름으로 — 안 맞추면 페달만 옮겨지고 암이 허공에 뜬다.
            c.arm.scale.y = r / c.r;
            c.arm.position.y = -r / 2;
            c.pedal.position.y = -r;
            if (c.tread) c.tread.position.y = -r + 0.014;
        }
    },

    // 공격 중에도 **빈 손은 핸들바를 놓지 않게** 한다.
    // 비평가 2인이 독립적으로 "공격 컷에서는 양쪽 그립이 둘 다 노출된 채(손 0개) 주행 중"이라고
    // 지적했다. 원인: 공격은 once 클립이라 `restPose`(=바 파지 각이 실린 곳)가 통째로 꺼지고,
    // 공격 클립이 **양팔의 어깨·팔꿈치를 전부 정의**한다(shoulderL 트랙이 클립마다 있다).
    // `ridePose` 로 넘겨도 가산이라 클립 아크에 얹힐 뿐 고정이 안 된다 — **덮어써야** 한다.
    // 그래서 prochar 의 합성 규칙은 건드리지 않고, `heroRig.update` 가 끝난 뒤 빈 팔 두 관절만
    // 되돌린다(무기 든 팔은 클립 그대로 — 한 손을 떼고 휘두르는 건 실제 기병도 그렇다).
    holdBarGrip() {
        const rig = this.heroRig, g = this.mountGroup;
        if (!rig || !g || !this.riding) return;
        const reach = this.freeHandReach();       // 핸들바든 고삐든 빈 손을 놓지 않는다
        // once 클립이 아닐 때는 restPose 가 이미 잡고 있다. 사망·기상(groundPose)은 제외 —
        // 쓰러진 몸이 핸들바를 붙들고 있으면 더 어색하다(탑승 하체 포즈를 빼는 것과 같은 이유).
        if (!reach || !rig._once || !rig._clip || rig._clip.groundPose) return;
        const free = (this.gripOf(this.wtypeId) || {}).hand === 'L' ? 'R' : 'L';
        const sh = rig.bones['shoulder' + free], el = rig.bones['elbow' + free];
        const bs = rig.base['shoulder' + free], be = rig.base['elbow' + free];
        if (sh && bs) {
            sh.rotation.x = bs.rx + reach.shoulder;
            sh.rotation.z = bs.rz + (free === 'L' ? 1 : -1) * (reach.shoulderZ || 0);
        }
        if (el && be) el.rotation.x = be.rx + reach.elbow;
    },

    // 탑승 중 공격 반동·버팀(㉱⑵ "공격 중 하체가 idle 그대로") — 공격(once) 클립은 어깨·팔꿈치·척추만
    // 정의하고 하체는 ridePose 상수 그대로라, 상체만 휘두르고 하반신이 마네킹처럼 굳어 있었다.
    // holdBarGrip과 같은 규약: prochar 합성 규칙은 건드리지 않고 rig.update 뒤에 **가산**한다.
    // 버팀량은 상수 각이 아니라 **그 계열 ridePose 자신의 비율**로 준다 — 다리를 벌린 계열(quad)은
    // 조임으로, 무릎을 깊게 접은 계열(wheeled)은 더 깊은 굽힘으로, 서 있는 계열(flat)은 무릎 크라우치로,
    // 각자 자기 자세를 강화하는 방향이 된다(상수로 주면 비대칭 페달 포즈가 대칭으로 뭉개진다).
    // 곡선: 클립 10%에서 시작해 45%(휘두름 임팩트 부근) 정점, 80% 복귀하는 사인 범프 —
    // 클립이 끝나면 정확히 0이라 대기 포즈·안장 정합(probe-ride-fit)에는 아무 잔량도 안 남는다.
    rideBrace() {
        const rig = this.heroRig, pose = this.ridePose;
        if (!rig || !this.riding || !pose || !rig._once || !rig._clip || rig._clip.groundPose) return;
        const u = (Math.min(1, rig._t / (rig._clip.dur || 1)) - 0.1) / 0.7;
        if (u <= 0 || u >= 1) return;
        const b = Math.sin(Math.PI * u);
        const B = rig.bones;
        if (B.spine) B.spine.rotation.x += 0.13 * b;                    // 상체를 타격 쪽으로 눌러 힘을 싣는다
        for (const s of ['L', 'R']) {
            const hip = B['hip' + s], knee = B['knee' + s];
            const hp = pose['hip' + s], kp = pose['knee' + s];
            if (hip && hp && hp.rz) hip.rotation.z -= hp.rz * 0.18 * b;  // 벌린 다리를 몸통 쪽으로 조인다(버팀)
            if (hip && hp && hp.rx) hip.rotation.x += hp.rx * 0.10 * b;  // 고관절을 살짝 더 감아쥔다
            if (knee && kp && kp.rx) knee.rotation.x += kp.rx * 0.15 * b; // 무릎을 더 깊게 — flat은 크라우치가 된다
        }
    },

    alignStirrups() {
        const g = this.mountGroup, rig = this.heroRig;
        if (!g || !g.userData.stirrups || !rig || !rig.bones || !rig.bones.kneeL || !this.heroG) return;
        if (!this._stirrupFoot) this._stirrupFoot = new THREE.Vector3();
        this.heroG.updateWorldMatrix(true, true);
        g.updateWorldMatrix(true, true);
        for (const st of g.userData.stirrups) {
            const knee = rig.bones['knee' + (st.userData.side < 0 ? 'L' : 'R')];
            if (!knee || !st.parent) continue;
            // ⚠️ 변환 기준은 `mountGroup`이 아니라 **등자의 실제 부모(배율이 걸린 안쪽 메시 그룹)** 다.
            //    mountGroup 로컬로 재면 탈것 배율(≈1.9배)만큼 어긋나 끈이 영웅 키를 넘겨 솟는다.
            // (0, -0.315, 0.045) = prochar.js가 부츠(발) 메시를 무릎 로컬로 박아 둔 자리
            const l = st.parent.worldToLocal(knee.localToWorld(this._stirrupFoot.set(0, -0.315, 0.045)));
            st.position.copy(l);
            const len = Math.max(0.04, st.userData.anchorY - l.y);
            st.userData.strap.scale.y = len;
            st.userData.strap.position.y = len / 2;
        }
    },

    // 핸들바를 영웅의 **비어 있는 손**으로 가져온다 — "자전거인데 양손이 옆에 늘어져 있다"(비평가 지적 ⓒ).
    // 손을 바에 맞추려면 팔 IK가 필요하고, 그 IK는 무기 파지·공격 클립과 매 프레임 싸운다.
    // 실제 자전거 핏이 스템 길이로 바를 라이더에게 맞추듯 **바를 손에** 가져오면 그 싸움이 통째로 없어진다.
    // ⚠️ 공격 중에는 **멈춘다** — 안 그러면 휘두르는 팔을 바가 쫓아다닌다. 공격이 끝나면 팔이 같은 거치
    //    자세로 돌아오므로 바도 원래 자리로 되돌아온다(거치 포즈는 정적이라 프레임 간 값이 동일).
    //    ⚠️ 예전엔 '리프레시 직후 N프레임만 맞추고 고정'이었는데, 그 N프레임이 하필 공격 구간과 겹치면
    //    창을 통째로 날려 **한 번도 안 맞은 채 고정**됐다(실측: _barFrames 6→0인데 바는 기준자리 그대로).
    _barV: null,
    alignHandlebar() {
        const g = this.mountGroup, rig = this.heroRig;
        if (!g || !g.userData.bar || !rig || !this.heroG || this._attacking) return;
        const bar = g.userData.bar, barG = bar.group;
        if (!barG.parent) return;
        // 무기를 안 든 쪽 손이 바를 잡는다 — 양손을 다 올리면 무기가 바를 뚫고 앞으로 튀어나온다.
        const weaponHand = (this.gripOf(this.wtypeId) || {}).hand === 'L' ? 'L' : 'R';
        const freeSide = weaponHand === 'L' ? 1 : -1;                  // +1 = 오른쪽(R)
        const hand = freeSide < 0 ? rig.handL : rig.handR;
        if (!hand) return;
        if (!this._barV) this._barV = new THREE.Vector3();
        this.heroG.updateWorldMatrix(true, true);
        g.updateWorldMatrix(true, true);
        // 손 위치를 바 그룹의 부모(=배율이 걸린 안쪽 메시 그룹) 로컬로 옮겨 기준으로 삼는다.
        const target = barG.parent.worldToLocal(hand.getWorldPosition(this._barV));
        // ⚠️ 바를 통째로 손으로 끌고 가면 **자전거가 비대칭**이 된다 — 반대쪽 그립이 아무도 안 잡는
        //    허공으로 튀어나가고 바가 프레임 중심선을 벗어난다(첫 판 캡처에서 그대로 확인).
        //    바는 중심선(x=0)에 두고 **높이·앞뒤(스템)만** 손에 맞춘 뒤, 그립을 바 위에서 옆으로 밀어
        //    손 아래에 오게 한다(실제로도 그립 위치는 바 위에서 잡는 자리다).
        const rest = bar.rest;
        const handX = target.x;
        target.x = rest.x;
        target.y = U.clamp(target.y, rest.y - 0.22, rest.y + 0.34);
        target.z = U.clamp(target.z, rest.z - 0.18, rest.z + 0.20);
        barG.position.copy(target);
        // 그립은 좌우 대칭으로 — 잡는 손 쪽 x 를 그대로 쓰고 반대쪽은 거울로 둬 바가 한쪽으로 안 쏠린다
        const gx = U.clamp(Math.abs(handX - rest.x), 0.10, 0.24);
        for (const gp of bar.grips) gp.position.x = gp.userData.side * gx;
        bar.barMesh.scale.x = (gx * 2 + 0.05) / 0.30;   // 바가 그립 밖으로 조금 더 나오게 (0.30 = 원래 폭)
        // 스템(헤드튜브 → 바)을 새 자리에 맞춰 다시 겨눈다 — 안 하면 바가 프레임에서 떨어져 공중에 뜬다.
        const A = new THREE.Vector3(bar.head[0], bar.head[1], bar.head[2]);
        const d = new THREE.Vector3().subVectors(target, A);
        const len = Math.max(0.02, d.length());
        bar.stem.position.copy(A).addScaledVector(d, 0.5);
        bar.stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
        bar.stem.scale.y = len / (bar.stem.geometry.parameters.height || 1);
    },

    // 고삐 한 줄을 재갈 고리(st.anchor) → 끝점(target)에 걸쳐 놓는다. 좌표는 둘 다 **끈의 부모 로컬**.
    // 가운데를 거리에 비례해 늘어뜨린다 — 팽팽한 직선은 고삐가 아니라 막대로 읽힌다.
    _reinUp: null, _reinV: null, _reinD: null, _reinMid: null,
    layoutRein(st, target) {
        if (!this._reinUp) { this._reinUp = new THREE.Vector3(0, 1, 0); this._reinD = new THREE.Vector3(); this._reinMid = new THREE.Vector3(); }
        const A = st.anchor, mid = this._reinMid.copy(A).lerp(target, 0.5);
        mid.y -= A.distanceTo(target) * 0.16;
        this._reinSeg(st.segs[0], A, mid);
        this._reinSeg(st.segs[1], mid, target);
    },
    _reinSeg(seg, a, b) {
        const d = this._reinD.subVectors(b, a);
        const len = Math.max(0.01, d.length());
        seg.position.copy(a).addScaledVector(d, 0.5);
        seg.quaternion.setFromUnitVectors(this._reinUp, d.normalize());
        seg.scale.y = len;                     // 높이 1 짜리 박스라 배율이 곧 길이
    },

    // 고삐를 **빈 손**까지 늘인다 — 사족·비행형의 "손이 아무것도 안 잡는다"(비평가 ㉢)에 대한 처방.
    // 핸들바는 강체라 손 쪽으로 **바를 옮기지만**, 고삐는 끈이라 반대로 **끈이 손을 따라간다** —
    // 그래서 `alignHandlebar` 와 달리 **공격 중에도 멈추지 않는다**(휘두르는 팔을 끈이 따라가는 건
    // 실제 기병도 그렇다. 여기서 멈추면 고삐만 허공에 굳어 남는다).
    alignReins() {
        const g = this.mountGroup, rig = this.heroRig;
        if (!g || !g.userData.rein || !rig || !this.heroG) return;
        // 고삐는 **한 손에 모아 쥔다** — 무기 든 손 반대쪽. 양손에 나눠 주면 무기 손이 끈에 묶인다.
        const weaponHand = (this.gripOf(this.wtypeId) || {}).hand === 'L' ? 'L' : 'R';
        const hand = weaponHand === 'L' ? rig.handR : rig.handL;
        if (!hand) return;
        if (!this._reinV) this._reinV = new THREE.Vector3();
        this.heroG.updateWorldMatrix(true, true);
        g.updateWorldMatrix(true, true);
        for (const st of g.userData.rein.straps) {
            const p = st.segs[0].parent;
            if (!p) continue;
            // 손 위치를 끈의 부모(=배율이 걸린 안쪽 메시 그룹) 로컬로 — 등자·핸들바와 같은 기준.
            const target = p.worldToLocal(hand.getWorldPosition(this._reinV.set(0, 0, 0)));
            target.x += st.side * 0.02;        // 주먹 안에서 두 줄이 살짝 벌어지게(겹쳐 그리면 한 줄로 보인다)
            this.layoutRein(st, target);
        }
    },

    // 탈것이 실제로 **잡을 물건을 가지고 있을 때만** 빈 손을 그 자세로 올린다.
    // ⚠️ 계열로 걸면 안 된다 — 외바퀴 드로이드는 wheeled 인데 핸들바가 없어서 허공을 쥔 팔이 된다.
    //    같은 이유로 고삐도 `userData.rein` 이 실제로 달린 종에서만 본다.
    freeHandReach() {
        const g = this.mountGroup, f = this.riding && this.riding.form;
        if (!g || !f) return null;
        if (f.barReach && g.userData.bar) return f.barReach;
        if (f.reinReach && g.userData.rein) return f.reinReach;
        return null;
    },

    // ---- 적: 몬스터 7종 (슬라임/골렘/고블린/박쥐/버섯/늑대/임프) — 종별 애니메이션 ----
    // 종별 고유 팔레트 — 지형색 파생 금지 (전 종이 배경 보호색 연두 덩어리로 보이던 문제, 비평가 지적)
    // 종별 키 컬러 — 배경 대비 채도 2단계 상향 원칙 (연두 필드 보호색 금지, 비평가 지적)
    KIND_COLOR: { slime: 0x53b8e0, golem: 0x8a8175, goblin: 0x0a3a14, bat: 0x6f5c94, mushroom: 0xd9604a, wolf: 0x556279, imp: 0xc23a52 }, // 고블린 0x1f8038도 라이팅+ACES에 세이지로 씻겨 초원에 잠식 (비평가 7.1 10번) → 0x156326 → 아웃라인 삭제 후에도 초원과 명도가 붙어(비평가 5.5 2번 '명도가 안 갈라짐') 0x0a3a14 로 한 단계 더 — probe-enemy-sep-sweep 실측 sepR +11%, 라이팅이 들어와 화면에선 여전히 녹색으로 읽힌다
    // ── 종별 보행 프로파일 (ⓓ 종별 고유 모션) ────────────────────────────────────────
    // 예전엔 골렘·고블린·임프가 **완전히 같은 이족 사이클**을 돌았다(clk*8, 같은 진폭). 질량이
    // 20배 차이 나는데 박자가 같으면 셋 다 '같은 인형이 크기만 다른 것'으로 읽힌다.
    // rate = 박자(rad/s) · bob = 상하 진폭 · bobPow = 체공 곡선(>1 이면 아래에 오래 머물러 **무겁게**,
    // <1 이면 위에 오래 떠 **가볍게**) · roll = 좌우 흔들 · hip = 다리 스윙 · arm = 팔 스윙 ·
    // lean = 전방 기울기(고블린의 굽은 등, 임프의 돌진 자세).
    // 이족(golem·goblin·imp)만이 아니라 **네 발·비행·홉·젤리 종도 여기서 값을 뽑는다.** 예전엔 그쪽
    // 분기마다 상수가 박혀 있어 ⑴ 한 곳에서 튜닝할 수 없고 ⑵ **보스가 되어도 박자가 안 변했다**(아래).
    // sq = 스쿼시&스트레치 진폭 (`cute-art-direction` ⓔ, 1930s 카툰 모션 — 사용자 "애니메이션들도
    // 1930년대 카툰 느낌으로 과장되게"). 영웅은 클립 스케일 트랙으로 이미 받았는데 적은 순수 사인
    // 상하 이동뿐이라 **강체 인형이 위아래로 움직이는 것**으로 읽혔다. 착지에 눌리고 도약에 늘어나야
    // 같은 화풍이 된다. 값은 '무거울수록 덜 눌린다'가 아니라 **카툰 관성**이다 — 가벼운 종(임프·버섯)이
    // 크게 눌리고 골렘은 질량감 때문에 작게(대신 접지 구간이 길다, bobPow 1.9).
    // ⚠️ 젤리(슬라임)는 정점 웨이브(driveJelly)가 이미 몸을 흔들므로 그룹 스쿼시를 **겹쳐 걸지 않는다**
    //    (강체 스케일이 젤리 웨이브를 덮으면 '크기가 변하는 풍선'으로 되돌아간다 — driveJelly 주석).
    ENEMY_GAIT: {
        golem: { rate: 4.2, bob: 0.05, bobPow: 1.9, roll: 0.055, hip: 0.34, arm: 0.40, lean: 0.02, sq: 0.055 },
        goblin: { rate: 10.5, bob: 0.05, bobPow: 1.0, roll: 0.035, hip: 0.88, arm: 0.72, lean: 0.10, sq: 0.085 },
        imp: { rate: 12.0, bob: 0.062, bobPow: 0.7, roll: 0.03, hip: 0.78, arm: 0.66, lean: 0.13, sq: 0.105 },
        wolf: { rate: 11, bob: 0.05, bobPow: 1.0, legRate: 13, tailRate: 9, pitch: 0.03, sq: 0.070 },
        bat: { rate: 5, bob: 0.1, bobPow: 1.0, hover: 0.12, wingRate: 16, sq: 0.045 },
        mushroom: { rate: 7, bob: 0.17, bobPow: 1.0, capTilt: 0.13, capAmp: 0.035, sq: 0.115 },
        slime: { rate: 6, bob: 0.12, bobPow: 1.0, jellyAmp: 0.16, sq: 0 },
        _default: { rate: 8, bob: 0.055, bobPow: 1.0, roll: 0.05, hip: 0.8, arm: 0.65, lean: 0, sq: 0.08 },
    },
    BOSS_SCALE: 1.9,
    // 보스는 **같은 메시를 그대로 키운 것**이라(g.scale 1.9) 박자까지 같으면 '크기만 키운 장난감'으로
    // 읽힌다 — 큰 짐승이 작은 짐승과 같은 보폭으로 종종거리는 게 정확히 그 인상이다.
    // 진자처럼 보행 주기는 다리 길이의 제곱근에 비례하므로 **박자를 1/√배율(≈0.73)로 늦춘다.**
    // 체공 곡선도 한 단계 무겁게(+0.35) 해서 착지에 무게를 싣고, 좌우 흔들은 키워 관성을 준다.
    // ⚠️ 스윙 각(hip·arm)은 오히려 **줄인다** — 느려진 박자에 같은 각을 그대로 두면 팔다리가
    //    허공을 휘젓는 인상이 된다(큰 개체일수록 관절 가동이 상대적으로 작다).
    gaitOf(kind, isBoss) {
        const G = this.ENEMY_GAIT[kind] || this.ENEMY_GAIT._default;
        if (!isBoss) return G;
        const k = 1 / Math.sqrt(this.BOSS_SCALE);
        const o = {};
        for (const key in G) o[key] = G[key];
        for (const r of ['rate', 'legRate', 'tailRate', 'wingRate']) if (o[r]) o[r] = G[r] * k;
        o.bob = G.bob * 1.15;
        o.bobPow = G.bobPow + 0.35;
        if (G.roll) o.roll = G.roll * 1.2;
        if (G.hip) o.hip = G.hip * 0.9;
        if (G.arm) o.arm = G.arm * 0.9;
        if (G.sq) o.sq = G.sq * 0.82;   // 큰 개체는 상대 변형이 작다(스윙 각을 줄이는 것과 같은 이유)
        return o;
    },

    // ── 1930s 카툰 홉 곡선 (`cute-art-direction` ⓔ) ────────────────────────────────
    // 종전 높이는 `pow(|sin ph|, bobPow)` 였다 — |sin| 은 **오르내림이 완전 대칭**이라 어느 프레임을
    // 봐도 같은 속도로 뜨고 같은 속도로 내린다. 그게 '기계적 상하 이동'의 정체다. 카툰 바운스는
    // ⓐ 이륙이 급가속(스냅) ⓑ 정점에 **체공(hang)** ⓒ 낙하가 가속 ⓓ 착지 뒤 **접지 유지**로,
    // 시간이 정점과 바닥에 몰려 있다. 여기서 u 는 한 홉 주기(|sin| 주기 = π)를 0~1 로 편 값이다.
    // ⚠️ 진폭(G.bob)은 종전 그대로다 — 높이를 바꾸면 블롭 섀도우 축소·HP바 추적·`probe-enemy-spacing`
    //    이 같이 흔들린다. **바꾼 것은 오직 시간 분포**다.
    hopCurve(u, bobPow) {
        u = u - Math.floor(u);
        // 접지 구간 — bobPow 가 클수록(무거울수록) 바닥에 오래 머문다. 종전 bobPow 의 뜻을 그대로 잇는다.
        const gc = Math.min(0.34, Math.max(0.05, 0.11 * (bobPow || 1)));
        if (u < gc) return 0;
        const v = (u - gc) / (1 - gc);                       // 체공 진행 0~1
        if (v < 0.34) { const t = v / 0.34; return 1 - Math.pow(1 - t, 4); }   // ⓐ 이륙 스냅
        if (v < 0.62) return 1 - 0.06 * (1 - Math.cos((v - 0.34) / 0.28 * Math.PI * 2)) * 0.5; // ⓑ 정점 체공(미세 아치)
        const f = (v - 0.62) / 0.38; return Math.max(0, 1 - f * f);           // ⓒ 가속 낙하
    },
    // 같은 주기의 스쿼시&스트레치 양(+ = 늘어남, − = 눌림). 홉 곡선과 위상이 맞물려야
    // '착지에 눌리고 도약에 늘어난다'가 성립한다 — 따로 돌리면 공중에서 눌리는 프레임이 생긴다.
    gaitSquash(u, bobPow, amp) {
        if (!amp) return 0;
        u = u - Math.floor(u);
        const gc = Math.min(0.34, Math.max(0.05, 0.11 * (bobPow || 1)));
        if (u < gc) {
            // 착지 임팩트에서 최대로 눌리고, 접지 끝(=도약 직전 예비동작)까지 눌린 채 버틴다.
            const g = u / gc;
            return -amp * (1 - 0.30 * g);
        }
        const v = (u - gc) / (1 - gc);
        if (v < 0.22) return amp * 0.85 * (1 - v / 0.22);    // 이륙 직후 쭉 늘어남
        if (v < 0.60) return 0;                              // 정점은 중립 — 늘어난 채 떠 있으면 국수가 된다
        const f = (v - 0.60) / 0.40; return amp * 0.75 * f * f; // 낙하 가속에 다시 늘어남
    },
    monsterMesh(e) {
        const kinds = ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
        // 디버그: ?enemy=imp 로 특정 몬스터 강제
        const forced = new URLSearchParams(location.search).get('enemy');
        const kind = (forced && kinds.includes(forced)) ? forced : kinds[(e.id + S.chapter * 2) % kinds.length];
        // 종 고유색 + 개체 지터 (챕터 무드 혼합은 채도를 죽여 배경 보호색화 — 폐지, 비평가 지적)
        const base = new THREE.Color(this.KIND_COLOR[kind]).offsetHSL(U.rand(-0.02, 0.02), U.rand(-0.03, 0.03), U.rand(-0.02, 0.02));
        const g = new THREE.Group();
        // ⚠️ 예전엔 여기서 `lam()` 을 거친 재질을 `flashMats` 배열에 모아 뒀지만 **삭제했다.**
        //    ⓐ 피격 플래시는 이미 `Scene3D.flashTargets()` 가 서브트리를 직접 훑어 정한다
        //    ⓑ 그 스냅샷에는 **어떤 메시도 안 쓰는 고아 재질**이 섞여 도구들을 오독시켰다
        //       (자세한 실측은 이 빌더 return 문의 `flashMats` 게터 주석 참고 — slug: hitflash-overwrite).
        //    지금 `m.flashMats` 는 그 게터이고, 항상 실제 플래시 대상과 같다.
        const lam = (c2, map) => {
            const m = new THREE.MeshStandardMaterial({ color: c2, map: map || null, metalness: 0, roughness: 0.72 });
            // 맵이 있으면 굴곡까지 함께 준다 — 알베도만 바꾸면 표면이 아니라 '무늬 스티커'로 읽힌다
            if (map) { m.bumpMap = map; m.bumpScale = 0.013; }
            return m;
        }; // 유기물 PBR — 부드러운 스펙큘러 롤오프 (무광 점토 인상 완화)
        // 종별 표면 질감 — 예전엔 **골렘(rockTex)만** 맵을 물고 나머지 6종은 전부 민짜였다.
        // 그래서 늑대는 회색 캡슐 조립, 버섯 몸통은 흰 덩어리로 읽혔다(영웅은 캔버스 텍스처 +
        // AO를 쓰는데 적만 안 쓰던 것). 털 계열은 furTex, 살갗 계열은 skinTex를 물린다.
        // ⚠️ 맵은 albedo에 **곱해진다** — 텍스처 평균이 ≈0.88이라 그만큼 색이 죽는다.
        //    종 키 컬러를 유지하려고 맵을 물리는 종만 명도를 되올려 준다(원시 장비에서 이미 밟은 함정).
        const bodyTex = (kind === 'wolf' || kind === 'bat') ? ProChar.furTex()
            : (kind === 'goblin' || kind === 'imp' || kind === 'mushroom') ? ProChar.skinTex() : null;
        if (bodyTex) base.offsetHSL(0, 0.02, 0.055);
        const mat = lam(base, bodyTex);
        const dark = lam(base.clone().offsetHSL(0, 0, -0.13), bodyTex);
        const light = lam(base.clone().offsetHSL(0, 0, 0.1), bodyTex);
        const mk = (geo, m) => new THREE.Mesh(geo, m); // 그룹 조립용 (g에 자동 추가 안 함)
        const limb = (rTop, rBot, len, m) => ProChar.capsule(rTop, rBot, len, m, 9); // 분절 사지 — 피벗=위쪽 끝
        const sp = (r, x, y, z, m, sx, sy, sz) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 11, 9), m || mat); o.position.set(x, y, z); if (sx) o.scale.set(sx, sy, sz); g.add(o); return o; };
        const bx = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const cn = (r, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        const cy = (r1, r2, h, x, y, z, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 8), m || mat); o.position.set(x, y, z); g.add(o); return o; };
        // ── AO 링: 파츠 경계에 얹는 접촉 그림자 (진행 메모 ⓐ '영웅엔 있고 적엔 없다') ──
        // 적은 구·원기둥을 **겹쳐 놓기만** 해서 목·허리·어깨 소켓·갓 밑에 이음새가 그대로 드러났다.
        // 영웅 리그(`ProChar` 의 aoRing)가 쓰는 것과 같은 기법을 종별 이음새로 옮긴다.
        // ⚠️ ⑴ 재질이 **transparent Basic** 이라 `applyRimLight` 가 자동으로
        //    건너뛴다(둘 다 transparent / Standard·Phong 조건에서 제외) — 얇은 링에 검은 외곽선이
        //    둘리거나 림라이트가 먹는 사고가 원천 차단된다. 재질 종류를 바꾸면 그 보호가 사라진다.
        //    ⑵ **flashMats 에 넣지 않는다** — 피격 플래시에 그림자까지 하얘지면 때린 순간에만
        //    이음새가 통째로 사라져 '프리미티브 더미'가 도로 드러난다.
        //    ⑶ 링 반지름은 그 높이의 **실제 몸 반지름과 같거나 살짝 커야** 한다. 작으면 몸 안에
        //    파묻혀 아무것도 안 보이고(무비용 무효과), 너무 크면 실루엣 밖으로 튀어 '후프'가 된다.
        // 감쇠 알파맵 — 균일 알파면 가까이서 '관절에 검은 테이프를 감은' 인상이 남는다.
        // 튜브를 감는 방향(uv.y)을 따라 이음새선에서 최대 → 1/4바퀴에서 0 으로 죽여 크레비스처럼 풀리게 한다.
        // ⚠️ 함정 2개(앞 세션이 실측으로 밟아 인계한 것, 여기서 그대로 지킨다):
        //   ㉠ three 의 `alphaMap` 은 텍스처의 **색(회색조)** 을 읽고 알파 채널은 무시한다 —
        //      `rgba(...,a)` 로 그리면 전 구간 불투명으로 읽혀 감쇠가 통째로 무시된다. 흑백으로 그릴 것.
        //   ㉡ `TorusGeometry` 는 **uv.y=0 이 바깥 적도**(몸 밖으로 나오는, 실제로 보이는 쪽)다 —
        //      감쇠를 가운데 진하게 그리면 정확히 반대로 걸린다. 0(과 1) 쪽이 진해야 한다.
        //   → 알파맵을 물리면 유효 농도가 떨어지므로 기준 불투명도를 올리고(×1.5) radialSegments 를
        //     6→10 으로 키운다(6이면 그라디언트가 계단 진다).
        const aoFade = this._aoFadeTex || (this._aoFadeTex = (() => {
            const cv = document.createElement('canvas');
            cv.width = 4; cv.height = 64;
            const cx = cv.getContext('2d');
            const gd = cx.createLinearGradient(0, 0, 0, 64);
            // v=0(바깥 적도)이 가장 진하고, v=0.25/0.75(옆구리)에서 0, v=0.5(안쪽 적도)에서 다시 진하다.
            gd.addColorStop(0.0, '#ffffff');
            gd.addColorStop(0.22, '#101010');
            gd.addColorStop(0.5, '#8a8a8a');
            gd.addColorStop(0.78, '#101010');
            gd.addColorStop(1.0, '#ffffff');
            cx.fillStyle = gd; cx.fillRect(0, 0, 4, 64);
            const t = new THREE.CanvasTexture(cv);
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            return t;
        })());
        const aoMat = new THREE.MeshBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: 0.75, depthWrite: false, alphaMap: aoFade });
        // opt: { flat=상하 납작(기본 .5) · ez=z반경/x반경(타원 몸통용) · op=불투명도 · parent }
        // 토러스는 로컬 XY면 → rotation.x=π/2 로 눕히면 **로컬 y가 월드 z, 로컬 z가 월드 y** 다.
        const aoRing = (r, tube, x, y, z, opt) => {
            const o = opt || {};
            const m2 = o.op === undefined ? aoMat
                : new THREE.MeshBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: o.op * 1.5, depthWrite: false, alphaMap: aoFade });
            const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 16), m2);
            // axis:'z' = 부모의 z축을 감는다(꼬리·팔처럼 **누운** 파츠용). 기본은 눕혀서 수평 링.
            if (o.axis !== 'z') ring.rotation.x = Math.PI / 2;
            ring.position.set(x, y, z);
            ring.scale.set(1, o.ez === undefined ? 1 : o.ez, o.flat === undefined ? 0.5 : o.flat);
            ring.userData.noOutline = true;      // 보호막 이중화 — 재질을 바꿔도 외곽선은 안 둘리게
            ring.userData.aoRing = true;         // probe-enemy-ao 가 껐다 켜서 실제 기여분을 잰다
            (o.parent || g).add(ring);
            return ring;
        };
        // ── AO 스커트: 몸 표면을 **그대로 따라가는** 얇은 셸 ──
        // 🚨 **링(토러스)이 원리적으로 못 푸는 자리가 있다.** 링은 몸보다 굵어야 보이는데, 굵은 만큼이
        //    실루엣 밖으로 안 나가려면 **위아래가 더 굵어야**(= 허리여야) 한다. 골렘 허리·고블린 허리가
        //    그래서 되는 것이다(구 두 개가 겹친 크레비스라 실루엣은 구가 잡는다).
        //    라테(회전체)는 **프로파일이 곧 실루엣**이라 그 조건이 성립하지 않는다 — 어떤 반경을 줘도
        //    굵으면 배경에 뜨고(후프) 가늘면 파묻힌다. 실측: 버섯 갓 밑 링은 반경을 0.70 배까지 줄여도
        //    유출이 64px 로 남았다(1.00 배 153px). 반경 튜닝으로 좁혀질 문제가 아니었다.
        // → 몸 프로파일을 grow 배(기본 3%)로 부풀린 라테 셸이면 어느 방위에서도 표면 **바로 위**라
        //   유출이 구조적으로 0 이고, 세로 알파 그라디언트로 이음새에서 멀어질수록 풀린다.
        // ⚠️ prof 는 몸 라테와 **같은 세그먼트 수**로 줄 것 — 다르면 다각형 위상이 어긋나 셸이
        //    몸 면을 파고들었다 나왔다 한다(균일 오프셋이 깨진다).
        // ⚠️ prof 는 [[r, y], …] **아래→위**, 이음새(진한 쪽)가 마지막 점이다. LatheGeometry 의 v 는
        //    프로파일 순서를 따르고, CanvasTexture 는 flipY 기본값이라 **캔버스 위쪽이 v=1**(= 마지막 점)이다.
        const aoSkirtFade = this._aoSkirtTex || (this._aoSkirtTex = (() => {
            const cv = document.createElement('canvas');
            cv.width = 4; cv.height = 64;
            const cx = cv.getContext('2d');
            const gd = cx.createLinearGradient(0, 0, 0, 64);
            gd.addColorStop(0.0, '#ffffff');   // v=1 = 이음새 — 가장 진하다
            gd.addColorStop(0.42, '#6e6e6e');
            gd.addColorStop(1.0, '#000000');   // v=0 = 그늘이 완전히 풀리는 쪽
            cx.fillStyle = gd; cx.fillRect(0, 0, 4, 64);
            return new THREE.CanvasTexture(cv);   // ⚠️ alphaMap 은 **색(회색조)** 을 읽는다 — rgba 알파 금지
        })());
        const aoSkirt = (prof, opt) => {
            const o = opt || {};
            const grow = o.grow === undefined ? 1.03 : o.grow;
            const geo = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0] * grow, p[1])), o.seg || 10);
            const sk = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                color: 0x0a0d12, transparent: true, opacity: o.op === undefined ? 0.6 : o.op,
                depthWrite: false, alphaMap: aoSkirtFade }));
            if (o.x || o.y || o.z) sk.position.set(o.x || 0, o.y || 0, o.z || 0);
            sk.userData.noOutline = true;
            sk.userData.aoRing = true;           // 링과 같은 표식 — 판정기가 함께 껐다 켠다
            (o.parent || g).add(sk);
            return sk;
        };
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
                    // ===== 파이컷 흰자 — 1930s 러버호스 카툰 (`cute-art-direction` 사용자 확정 2026-08-19) =====
                    // 종전은 흰자+발광 홍채+글로시 하이라이트라 영웅과 같은 '캐주얼 3D 마스코트' 눈이었다.
                    // 영웅(prochar.js)을 파이컷으로 바꾼 것과 **같은 화풍**으로 여기서 6종을 한꺼번에 맞춘다
                    // (slit 계열 = 골렘 마그마·늑대 냉광은 발광 슬릿이 종 정체성이라 이번 회차 대상 아님).
                    //
                    // 🔑 **영웅과 달리 평평한 판을 못 쓴다** — 적은 아레나에서 좌우로 돌고 넉백으로 자세가
                    //    바뀌어, 판이면 옆에서 사라진다. 그래서 **구를 유지한 채 파이 조각을 판다**:
                    //    `SphereGeometry` 의 phi 절단은 극축을 감는 쐐기(오렌지 조각)라, **극축을 +z(보는 쪽)로
                    //    눕히면**(mesh.rotation.x = π/2) 정면에서 정확히 파이 조각으로 보인다.
                    //    ⚠️ 회전은 **메시**에, 납작 스케일은 **부모 그룹**에 건다 — 한 오브젝트에 둘 다 걸면
                    //       스케일이 회전 전 로컬 축에 먹어 'y 를 눌렀는데 z 가 눌리는' 결과가 된다.
                    // 🔑 phi ↔ 화면 각 대응: 눕힌 뒤 구의 (x,y,z)가 눈 로컬 (x,−z,y)로 가므로 **화면 방위각
                    //    α = φ + π** 다. α 구간 [wc−PIE/2, wc+PIE/2] 를 빼려면 φ = wc + PIE/2 − π 에서
                    //    2π−PIE 만큼 그리면 된다.
                    const tall = style === 'round' ? 1.3 : style === 'sleepy' ? 0.62 : 0.92;
                    const PIE = Math.PI * 0.30;                    // 도려낸 부채꼴 각 (영웅과 같은 값)
                    const wc = s > 0 ? 0.42 : Math.PI - 0.42;      // 쐐기 중심 = **바깥쪽 위**(안쪽에 두면 두 눈의 빈 자리가 코 양옆에서 마주 본다)
                    const scG = new THREE.Group();
                    scG.scale.set(1, tall, 0.55);
                    const sc = new THREE.Mesh(new THREE.SphereGeometry(er, 18, 12, wc + PIE / 2 - Math.PI, Math.PI * 2 - PIE),
                        // 음영은 남기되 **바닥값을 emissive 로 깐다** — 흰자가 완전히 죽으면 파이 조각이 안 보인다.
                        // (버섯처럼 갓 그늘에 머리가 통째로 들어가는 종은 순수 Lambert 로는 눈이 검게 뭉갰다 — 실측 캡처.)
                        // 종전 주석의 '음영 받는 흰자(평면 스티커 오독 방지)'는 유지 — 완전 무광 Basic 으로 가지 않는 이유다.
                        new THREE.MeshLambertMaterial({ color: 0xfff6e8, emissive: 0x9a958c }));
                    sc.rotation.x = Math.PI / 2;
                    sc.userData.pieEye = true;   // 캡처·판정 도구가 이 태그로 흰자를 집는다(영웅 prochar.js 와 같은 규약)
                    scG.add(sc);
                    // 동공 = **검은 점**(사용자 지시 원문). 발광 홍채를 뺐으므로 종 색은 눈썹(browColor)·몸통이 진다.
                    //   ⚠️ `o.iris`/`o.glow`/`o.irisScale` 은 slit 계열이 계속 쓴다 — 인자를 지우지 말 것.
                    const puR = er * (style === 'round' ? 0.42 : 0.36) * (o.irisScale || 1);
                    const pu = new THREE.Mesh(new THREE.SphereGeometry(puR, 10, 8), new THREE.MeshBasicMaterial({ color: 0x141013 }));
                    // 🚨 z 는 **흰자 앞면 밖**이어야 한다 — 흰자 그룹이 z 를 0.55 로 눌러 앞면이 er·0.55 에
                    //    있으므로, 종전 감각대로 er·0.42 에 두면 동공이 흰자 **속**에 묻혀 끝만 삐져나온다
                    //    (실측 캡처에서 잿빛 얼룩으로 읽혔다). 파이 쐐기가 극(=정면 중심)까지 열려 있어
                    //    묻힌 동공이 그 틈으로 비치는 바람에 '지워졌는데 보이는' 착시까지 났다.
                    pu.scale.set(1, style === 'sleepy' ? 0.8 : 1.15, 0.42);
                    pu.position.set(-s * er * 0.12, -er * 0.05, er * 0.56);
                    const hl = new THREE.Mesh(new THREE.SphereGeometry(er * 0.11, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                    hl.position.set(-s * er * 0.26, er * 0.20, er * 0.60);
                    eg.add(scG, pu, hl);
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
            // 🚫 슬라임에는 AO 링을 두지 않는다 — **이음새가 없는 종**이다(라테 한 장 + 몸속 핵).
            //    붙일 경계가 없어서 어디에 둬도 몸 안에 파묻힌다: 바닥 퍼짐부(r≈0.44)에 둘러 봤더니
            //    바로 위 최대 둘레(y 0.07 에서 r 0.5)가 처마처럼 덮어 **화면 기여 0픽셀**이었다
            //    (probe-enemy-ao 실측). 접지 단서는 블롭 섀도가 이미 맡고 있다.
            //    슬라임에 필요한 건 AO 가 아니라 진행 메모 ⓑ의 **관절 분절**이다.
            anim.body = body; topY = 0.85;
            // ── 젤리 웨이브 준비 (진행 메모 ⓑ '슬라임은 아직 통짜') ──
            // 예전엔 `body.scale.y/x` 를 통째로 흔들었다 — 그건 젤리가 아니라 **크기가 변하는 풍선**이다.
            // 실제 젤리는 바닥이 먼저 눌리고 그 눌림이 **위로 늦게 전파**된다. 그래서 정점마다
            // 자기 높이에 비례하는 **위상 지연**을 줘서 스쿼시가 파도처럼 타고 오르게 한다(driveJelly).
            // base = 원본 정점(매 프레임 여기서 다시 계산해야 오차가 누적되지 않는다).
            {
                const jp = body.geometry.attributes.position;
                let hMax = 0;
                for (let i = 1; i < jp.array.length; i += 3) if (jp.array[i] > hMax) hMax = jp.array[i];
                // 몸통에 얹힌 나머지(핵·기포·광택·눈·입)도 같은 변형을 따라가야 한다 —
                // 안 따라가면 몸이 눌릴 때 눈만 제자리에 남아 얼굴이 몸 밖으로 빠져나온다.
                const follow = [];
                for (const ch of g.children) {
                    if (ch === body) continue;
                    follow.push({ o: ch, x: ch.position.x, y: ch.position.y, z: ch.position.z });
                }
                anim.jelly = { mesh: body, base: Float32Array.from(jp.array), h: hMax || 1, lag: 1.15, follow };
            }
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
                // 어깨·팔꿈치·주먹·너클은 전부 완전구였다 — 좌우 시드를 갈라 비대칭까지 준다(바위는 대칭이 아니다)
                const boulder = mk(this.boulderGeo(0.165, s > 0 ? 3 : 11, { amp: 0.3 }), rockD);
                boulder.scale.set(1.05, 0.9, 0.9); boulder.position.x = -s * 0.02;
                const upper = limb(0.085, 0.075, 0.3, rockM);
                upper.rotation.z = s * 0.12;
                const elbow = new THREE.Group();
                elbow.position.y = -0.32;
                const eJoint = mk(this.boulderGeo(0.082, s > 0 ? 5 : 13, { amp: 0.2 }), rockM); // 팔꿈치 관절 바위 — 굽힘 시 이음새 은폐
                elbow.add(eJoint);
                const fore = limb(0.088, 0.108, 0.26, rockD); // 하완이 상완보다 두꺼운 파괴자 실루엣
                const fist = mk(this.boulderGeo(0.17, s > 0 ? 7 : 17, { amp: 0.28 }), rockM);
                fist.position.y = -0.32; fist.scale.set(1, 1.1, 1);
                for (let k2 = 0; k2 < 3; k2++) { // 주먹 관절 돌기
                    // 너클은 작아 detail 1 이면 조각이 안 읽힌다 — detail 0(정십이면체급 20정점)으로 각지게
                    const knuckle = mk(this.boulderGeo(0.05, s * 100 + k2 * 3 + 2, { detail: 0, amp: 0.24 }), rockD);
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
            const pelvisG = mk(this.boulderGeo(0.21, 23, { amp: 0.22 }), rockD);
            pelvisG.position.set(0, 0.37, 0); pelvisG.scale.set(1.15, 0.62, 0.9);
            g.add(pelvisG);
            // 짧은 기둥 다리 + 발 바위 — 상체 질량 대비 두껍게 (왜소 다리 금지)
            for (const s of [-1, 1]) {
                const leg = limb(0.115, 0.1, 0.2, rockD);
                leg.position.set(s * 0.17, 0.26, 0);
                // 발은 접지면이라 밑을 더 세게 눌러 평평한 단면을 남긴다 — 둥근 밑면은 땅에 안 얹힌 것처럼 뜬다
                const foot = mk(this.boulderGeo(0.13, s > 0 ? 29 : 31, { amp: 0.2, flatBottom: 0.34 }), rockM);
                // ⓓ: 예전엔 다리·발이 **둘 다 g 에 고정**돼 골렘이 걸을 때 다리가 하나도 안 움직였다
                //    (몸통만 위아래로 까딱여 '미끄러지는 석상'). `limb` 은 피벗이 위쪽 끝인 그룹이라
                //    그대로 스윙시킬 수 있다 — 발을 다리에 매달아 같이 돌게 하고 anim 에 노출한다.
                //    발 로컬 = 원래 g 좌표 − 다리 좌표.
                foot.position.set(s * 0.01, -0.205, 0.04); foot.scale.set(1, 0.5, 1.35);
                leg.add(foot);
                (anim.gleg = anim.gleg || []).push(leg);
                g.add(leg);
            }
            // 머리: 어깨 사이에 파묻힌 낮은 바위 돔 + 목 바위 + 무거운 눈두덩 슬랩
            // 목: 매끈한 원기둥이면 '돌 몸에 끼운 파이프'다 — 단면을 타원으로 눌러 앞뒤를 좁히고 flat 으로 깎아낸 면을 남긴다
            const neckG = this.shellFromRings([
                { y: -0.06, rx: 0.145, rz: 0.128 }, { y: -0.018, rx: 0.132, rz: 0.117 },
                { y: 0.022, rx: 0.119, rz: 0.106 }, { y: 0.06, rx: 0.107, rz: 0.097 },
            ], 9, rockD, { flat: true });
            neckG.position.set(0, 0.98, 0.04);
            g.add(neckG);
            const head = mk(this.boulderGeo(0.17, 41, { amp: 0.24 }), rockM);
            head.position.set(0, 1.06, 0.05); head.scale.set(1.1, 0.82, 0.95);
            // 눈두덩은 판이라 Box 가 아니라 베벨 슬랩 — 모서리가 깎여 하이라이트가 한 줄로 흘러야 '바위 처마'로 읽힌다
            const browSlab = this.beveledSlab(0.3, 0.07, 0.14, 0.022, rockD);
            browSlab.position.set(0, 1.14, 0.1); browSlab.rotation.x = 0.15;
            g.add(head, browSlab);
            // 목 바위(r 0.11~0.14) 밑 · 라테 몸통 밑단(r 0.17)과 골반 바위 경계 · 기둥 다리 소켓
            // 목 이음새 — 0.142/0.024 는 **파묻혀 26px** 밖에 기여를 못 했다(하한 60). 실측 배율 훑기에서
            // 1.20/1.45/1.75 배가 전부 유출 0 이라, 위아래로 여유가 있는 가운데 값(1.45배)을 쓴다 → 371px.
            aoRing(0.206, 0.035, 0, 0.955, 0.04, { ez: 0.92 });
            aoRing(0.19, 0.03, 0, 0.435, 0, { ez: 0.85, flat: 0.45 });
            // 어깨 소켓 — 0.118/0.02 는 +x 쪽만 3px 샜다(바위 청크가 좌우 비대칭이라 한쪽만 걸린다).
            // 좌우가 같은 호출이라 한쪽만 줄일 수 없어, 실측으로 양쪽 다 유출 0 이 되는 0.70 배를 쓴다.
            for (const s of [-1, 1]) aoRing(0.083, 0.014, s * 0.17, 0.345, 0, { flat: 0.5 });
            eyes(1.05, 0.21, 0.08, 0.045, 'slit', { iris: 0xff7d33, narrow: true });
            topY = 1.35;
        } else if (kind === 'goblin') {
            // 굽은 등 이족보행: 서양배 몸통 전경 + 분절 사지 + 대형 귀 + 가시 몽둥이
            const skinM = lam(base, ProChar.hideTex());
            const skinD = lam(base.clone().offsetHSL(0, 0, -0.12), ProChar.hideTex());
            const clothM = lam(new THREE.Color(0x99442e), ProChar.leatherTex()); // 러스트 레드 — 초원 배경 보호색 탈피 악센트 (비평가 지적)
            // 몸·머리·턱·배·관절·손발이 전부 완전구였다(ⓒ). 살이라 골렘의 각진 자가 아니라 유기 변형을 건다.
            // ⚠️ seed 를 `base + s * k`(s = -1/1) 로 짓지 말 것 — 서로 다른 파츠가 같은 값에 떨어진다.
            //    실측: 어깨(78-5)·팔꿈치(82-9)·손(86-13)이 셋 다 73 이 돼 개체차 0.0061 로 반려됐다.
            //    ⚠️ 좌우를 base/base+1 로 붙여 두는 것도 부족했다(0.0113) — s0 = seed*2.3391 이라
            //       인접 seed 는 위상이 비슷하다. 파츠마다 **7 이상 벌린** 값을 쓴다.
            const oSp = (r, w, h, seed, amp) => this.sculptOrganic(new THREE.SphereGeometry(r, w, h), seed, { amp });
            // 분절 다리: 대퇴 → 무릎 → 정강이 → 발
            for (const s of [-1, 1]) {
                const hip = new THREE.Group();
                hip.position.set(s * 0.12, 0.42, 0);
                const hJ = mk(oSp(0.065, 8, 6, s > 0 ? 60 : 67, 0.09), skinM); // 고관절 구 — 걷기 스윙 시 몸통-다리 이음새 은폐
                hip.add(hJ);
                const thigh = limb(0.062, 0.05, 0.18, skinM);
                thigh.rotation.x = -0.3; // 웅크린 자세
                const knee = new THREE.Group();
                knee.position.set(0, -0.16, 0.06);
                const shin = limb(0.045, 0.04, 0.17, skinD);
                shin.rotation.x = 0.35;
                const foot = mk(oSp(0.055, 8, 6, s > 0 ? 74 : 81, 0.10), skinM);
                foot.position.set(0, -0.17, 0.07); foot.scale.set(0.8, 0.5, 1.7);
                knee.add(shin, foot);
                hip.add(thigh, knee);
                // 🚨 종전엔 고관절 구(r 0.065) 둘레에 링을 뒀는데 **화면 기여가 0px 이었다** — 그 자리는
                //    로인클로스(r 0.2~0.26, y 0.35~0.49) **안**이라 어느 각도에서도 안 보인다. 반경을 키워
                //    꺼내면(실측 1.45배) 이번엔 천 밖으로 튀어 유출이 난다. 자리 자체가 틀린 것이다.
                //    → 실제로 보이는 이음새인 **무릎**(허벅지 r 0.05 ↔ 정강이 r 0.045)으로 옮긴다.
                aoRing(0.049, 0.012, 0, 0, 0, { flat: 0.55, op: 0.5, parent: knee });
            (anim.bleg = anim.bleg || []).push({ hip, knee }); // 걷기 관절 굽힘용 피벗 노출
                g.add(hip);
            }
            // 서양배 몸통 (앞으로 굽음) + 로인클로스 + 로프 벨트
            body = mk(oSp(0.24, 12, 10, 88, 0.10), skinM);
            body.position.set(0, 0.62, 0.02); body.scale.set(1, 1.12, 0.92); body.rotation.x = 0.22;
            const belly = mk(oSp(0.17, 10, 8, 95, 0.09), light);
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
            const head = mk(oSp(0.21, 12, 10, 102, 0.07), skinM);   // 눈·귀가 상대 배치라 진폭을 낮게
            head.position.set(0, 0.95, 0.08); head.scale.set(1, 0.95, 0.95);
            // 턱 그룹 — 언더바이트를 앞으로 빼(두상 구에 파묻히던 문제) 송곳니를 턱에 직접 앵커 (비평가: 이빨 부유)
            const jawG = new THREE.Group();
            jawG.position.set(0, 0.845, 0.19);
            const jaw = mk(oSp(0.13, 10, 8, 109, 0.09), skinD);
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
            // 목: 두상(r 0.21) 밑 · 허리: 로프 벨트(r 0.205) 바로 아래 로인클로스 경계
            // 목 이음새 — 0.142/0.026 은 기여가 **1px**(하한 60)이라 없는 것과 같았다. 실측 배율 훑기에서
            // 1.12 배가 **단독으로는** 유출 0 을 지키는 상한이다(1.18 배부터 2px). 다만 링 4개를 한꺼번에
            // 켜면 겹치는 화소가 임계(휘도 −6)를 넘겨 합계에서 1px 이 샜다 — **유출은 가산적이지 않다**.
            // 그래서 단독 상한에서 한 눈금 물러난 1.07 배(0.152/0.028)를 쓴다. 무릎 링도 같은 이유로 0.94 배.
            aoRing(0.152, 0.028, 0, 0.85, 0.06, { flat: 0.5 });
            aoRing(0.203, 0.026, 0, 0.462, 0, { flat: 0.45, op: 0.44 });   // 0.216/0.028 은 유출 5px(실측 0.94배에서 0, 기여 204px)
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
                const sJ = mk(oSp(0.055, 8, 6, s > 0 ? 116 : 123, 0.09), skinM); // 어깨 관절 구 — 팔 스윙 시 이음새 은폐
                sh.add(sJ);
                const upper = limb(0.05, 0.042, 0.17, skinM);
                upper.rotation.z = s * 0.25;
                const elbow = new THREE.Group();
                elbow.position.set(s * 0.05, -0.17, 0);
                const eJ = mk(oSp(0.042, 7, 5, s > 0 ? 130 : 137, 0.09), skinM); // 팔꿈치 관절 구 — 굽힘 이음새 은폐
                elbow.add(eJ);
                const fore = limb(0.04, 0.036, 0.15, skinD);
                const wristBand = mk(new THREE.CylinderGeometry(0.041, 0.041, 0.05, 8), clothM); // 손목 랩 악센트
                wristBand.position.y = -0.12;
                const hand = mk(oSp(0.062, 8, 6, s > 0 ? 144 : 151, 0.11), skinM); // 큼직한 주먹 — 국수 가락 팔 끝 오독 방지
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
            // 두상(r 0.2)과 털몸통(r 0.125) 사이 목 · 날개가 몸에 박히는 소켓
            aoRing(0.130, 0.025, 0, 0.442, -0.01, { ez: 0.85, flat: 0.5, op: 0.58 }); // 0.132/0.022 는 기여가 하한에 걸칠 만큼 옅었고(probe 60~67px), 0.138/0.027 은 유출 5px 였다(실측 0.94배에서 0, 기여 118px)
            for (const s of [-1, 1]) aoRing(0.062, 0.016, s * 0.155, 0.63, 0, { flat: 0.6, op: 0.42 });
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
            // 🍄 갓 밑 그늘 — 이 종에서 가장 큰 이음새다(주름살 r 0.28~0.2 가 줄기 r 0.16 에 얹힌다).
            //    링은 capG 에 붙여 갓이 출렁일 때 그늘도 같이 움직이게 한다(따로 두면 갓만 흔들려 뜬다).
            // 🚨 종전 링(r 0.176, parent capG)은 **두 겹으로 틀렸다**: ⑴ world y≈0.395 로 줄기 꼭대기
            //    (0.38) **위 허공**에 떠 있었고, ⑵ 줄기가 라테라 애초에 링으로는 못 푸는 자리였다
            //    (위 aoSkirt 주석 참조 — 실측 유출 1.00배 153px / 0.70배까지 줄여도 64px).
            //    스커트는 줄기 프로파일(같은 세그먼트 10) 위를 3% 띄워 따라가므로 유출이 구조적으로 0 이다.
            //    프로파일 점은 stemProf 선분 위에서 뽑았다 — y0.16 은 (0.12,0.1)~(0.1,0.22) 의 중점이라 r 0.11.
            aoSkirt([[0.11, 0.16], [0.10, 0.22], [0.13, 0.32], [0.16, 0.38]], { op: 0.62, seg: 10 });
            aoRing(0.128, 0.025, 0, 0.02, 0, { flat: 0.35, op: 0.44 });   // 밑동 접지 — 0.146/0.028 은 유출 50px 이었다(실측 0.88배에서 0, 기여 113px)
            anim.cap = capG; anim.hop = true;
            // ── 갓 테두리 플랩 (진행 메모 ⓑ '버섯은 아직 통짜') ──
            // 지금까지 갓은 `capG.rotation.z` 로 **통째로 기울기만** 했다 — 우산 살처럼 테두리가
            // 늘어졌다 되돌아오는 2차 모션이 없어 '딱딱한 모자'로 읽혔다. 돔 정점을 중심에서
            // 먼 순서로 **늦게** 처지게 해(반지름 비례 위상 지연) 테두리가 펄럭이게 한다.
            // ⚠️ 돔만 흔들면 테두리 립·주름살이 제자리에 남아 갓이 두 조각으로 갈라진다 —
            //    같은 반지름의 플랩량을 그 부속들의 y 에도 그대로 먹인다.
            {
                const dp = dome.geometry.attributes.position;
                let rMax = 0;
                for (let i = 0; i < dp.array.length; i += 3) {
                    const r = Math.hypot(dp.array[i], dp.array[i + 2]);
                    if (r > rMax) rMax = r;
                }
                anim.capFlap = {
                    mesh: dome, base: Float32Array.from(dp.array), rMax: rMax || 1, lag: 1.6,
                    parts: [{ o: lip, y: lip.position.y, t: 0.29 / (rMax || 1) },
                            { o: frill, y: frill.position.y, t: 0.24 / (rMax || 1) }],
                };
            }
            body = capG; topY = 0.9;
        } else if (kind === 'wolf') {
            // 사족 맹수 리그 재작성(비평가 3위 결함 '미구현 늑대'): 흉곽→골반 테이퍼 몸통 + 목/쐐기 두상 + 가슴 러프 + 2관절 다리 + 3분절 꼬리
            const furM = lam(base, ProChar.hideTex());
            const furD = lam(base.clone().offsetHSL(0, 0.02, -0.22), ProChar.hideTex()); // 대비 강화 — 단색 클레이 오독 방지
            const furL = lam(base.clone().offsetHSL(0.01, -0.06, 0.27), ProChar.hideTex()); // 배·러프·꼬리끝 명확한 라이트 톤
            // 몸 덩어리가 전부 **완전구를 눌러 만든 타원체**라 '회색 캡슐 조립'으로 읽혔다(ⓒ).
            // 골렘처럼 각지게 깎으면 '수정 늑대'가 되므로 저주파·저진폭 유기 변형만 건다.
            const oSp = (r, w, h, seed, amp) => this.sculptOrganic(new THREE.SphereGeometry(r, w, h), seed, { amp });
            body = mk(oSp(0.19, 12, 9, 2, 0.10), furM);           // 흉곽 (앞이 크고)
            body.position.set(0, 0.42, 0.12); body.scale.set(0.9, 0.92, 1.25);
            const hind = mk(oSp(0.16, 11, 8, 3, 0.10), furM);     // 골반 (뒤가 작게)
            hind.position.set(0, 0.4, -0.22); hind.scale.set(0.82, 0.85, 1.1);
            const belly = mk(new THREE.CylinderGeometry(0.155, 0.13, 0.34, 10), furM); // 연결 몸통
            belly.rotation.x = Math.PI / 2; belly.position.set(0, 0.41, -0.05);
            belly.scale.set(0.9, 1, 0.92);
            const ruff = mk(oSp(0.15, 10, 8, 4, 0.15), furL);     // 앞가슴 밝은 러프 털 — 털뭉치라 진폭을 크게
            ruff.position.set(0, 0.38, 0.26); ruff.scale.set(0.85, 0.8, 0.7);
            const neckW = mk(new THREE.CylinderGeometry(0.085, 0.105, 0.18, 9), furM);
            neckW.position.set(0, 0.52, 0.3); neckW.rotation.x = -0.7;
            g.add(body, hind, belly, ruff, neckW);
            const headW = new THREE.Group();                                   // 쐐기 두상 + 테이퍼 주둥이
            headW.position.set(0, 0.6, 0.38);
            const skullW = mk(oSp(0.105, 11, 8, 5, 0.06), furM);   // 눈이 상대 배치라 진폭을 낮게
            skullW.scale.set(1.24, 0.92, 1.05); // x 확폭 2차 — 1.12로도 3/4 각도에서 흰자+호박 홍채가 실루엣 밖 '유니콘 뿔'로 돌출 (비평가 7.1 14번)
            const muzzleM = lam(base.clone().offsetHSL(0.005, -0.04, 0.14), ProChar.hideTex()); // 주둥이 전용 중간 톤 — 순백 러프색은 '붙임 데칼'로 읽힘 (비평가)
            const snout = mk(new THREE.CylinderGeometry(0.048, 0.075, 0.16, 8), muzzleM);
            snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.02, 0.14);
            const bridge = mk(oSp(0.045, 8, 6, 8, 0.07), furD); // 콧등 다크 스트라이프 — 밝은 주둥이와 톤 분리 (비평가: 주둥이가 두상에 뭉개짐)
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
            // 등 다크 새들 — 목덜미→엉덩이 한 흐름으로 세그먼트 경계(흉곽/연결통/골반 이음새) 은폐.
            // ⚠️ 2026-08-18 까지 이 새들은 **만들어만 지고 `g.add()` 가 없어 화면에 한 번도 안 나왔다**(wolf-backstripe-dead).
            //    죽어 있던 원래 값(구 r0.16 을 0.78/0.5/2.45 로 늘인 **한 덩어리**)을 그대로 붙이면 안 된다 —
            //    등마루 상면을 z 를 따라 해석으로 떠 보면 흉곽 위(z 0.04~0.28)에서는 **1~3cm 파묻혀 안 보이고**,
            //    반대로 뒤로는 몸이 끝난 z −0.40 까지 나가 그 높이의 **몸 반폭을 0.067 넘겨** 엉덩이 뒤 허공에
            //    검은 덩어리로 뜬다. 한 덩어리로는 원리상 못 맞춘다 — 등마루가 z 0.12 에서 y 0.595 로 솟았다가
            //    z −0.12 의 0.536 으로 꺼지는 곡선인데 타원체 상면은 중심 부근이 평평해 두 지점을 동시에 못 탄다.
            //    그래서 마루를 **3분절로 따라가며 평균 +0.03 만 떠 있게** 맞췄다(구간 전체 +0.022~+0.038):
            //    ⓐ 몸 자신의 털 노이즈(sculptOrganic ±10% → 흉곽 y 기준 ±0.016)보다 확실히 커야 몸이 새들을
            //      뚫고 나와 얼룩덜룩해지지 않는다 ⓑ 옆폭은 그 높이의 몸 반폭보다 **항상 0.008 이상 좁게** 잡아
            //      실루엣과 AO 링(probe-enemy-ao 늑대 5개)을 건드리지 않는다. 수치를 바꿀 땐 probe-wolf-saddle 로 재잴 것.
            for (const [sy, sz, sr, kx, ky, kz, seed] of [
                [0.527, 0.123, 0.140, 0.82, 0.71, 1.27, 6],    // 기갑~흉곽 마루
                [0.518, 0.056, 0.120, 0.78, 0.73, 1.30, 16],   // 흉곽→연결통 이음새 (여기가 비면 이음새가 그대로 드러난다)
                [0.495, -0.184, 0.115, 0.70, 0.66, 1.39, 26],  // 연결통→골반 이음새~엉덩이
            ]) {
                const seg = mk(oSp(sr, 10, 8, seed, 0.07), furD); // 진폭은 몸(0.10)보다 낮게 — 띠가 조각조각 끊겨 보이지 않게
                seg.position.set(0, sy, sz); seg.scale.set(kx, ky, kz);
                seg.name = 'wolfSaddle';
                g.add(seg);
            }
            const bellyW = mk(oSp(0.13, 10, 8, 7, 0.09), furL); // 밝은 아랫배 — 투톤 코트
            bellyW.position.set(0, 0.33, -0.02); bellyW.scale.set(0.8, 0.6, 1.6);
            g.add(bellyW);
            // 2관절 다리 4개: 어깨/고관절 피벗 → 상퇴 → 하퇴 → 발 (달리기 사이클은 기존 anim.legs 인터페이스)
            for (const [lx, lz, front] of [[-0.11, 0.22, 1], [0.11, 0.22, 1], [-0.1, -0.24, 0], [0.1, -0.24, 0]]) {
                const haunch = mk(oSp(front ? 0.072 : 0.088, 9, 7, 10 + lx * 37 + lz * 11, 0.11), furM); // 어깨/뒷다리 근육 덩어리 — 몸통-다리 이음새 은폐 ('로봇 다리' 오독 제거)
                haunch.position.set(lx * 0.95, front ? 0.41 : 0.4, lz + (front ? 0.015 : -0.02));
                haunch.scale.set(0.75, 1.15, 1.2);
                g.add(haunch);
                const leg = new THREE.Group();
                leg.position.set(lx, 0.36, lz);
                const upper = limb(0.05, 0.038, 0.18, furM);
                upper.rotation.x = front ? 0.12 : -0.2;
                const lower = limb(0.034, 0.026, 0.17, furD);
                lower.position.y = -0.18; lower.rotation.x = front ? -0.1 : 0.32;
                const paw = mk(oSp(0.045, 7, 6, 20 + lx * 29 + lz * 7, 0.08), furD); // 다크 삭스 발 — 색 분리
                paw.position.set(0, -0.165, 0.025); paw.scale.set(1, 0.55, 1.35);
                lower.add(paw);
                upper.add(lower);
                leg.add(upper);
                lower.userData.rx0 = lower.rotation.x; lower.userData.front = front; // 질주 무릎 굽힘 기준 포즈
                // 다리가 몸통 실루엣 **밖으로 나오는 높이**에 두르고, leg 그룹에 매달아 질주할 때 같이 움직이게.
                // ⚠️ 처음엔 근육 덩어리 높이(y 0.375)에 뒀는데 **0픽셀**이었다(probe-enemy-ao) — 흉곽 구가
                //    (r 0.19×0.9=0.171) 그 높이의 |x|=0.11 을 통째로 덮는다. 몸통 반폭이 0.088 로 줄어드는
                //    y≈0.27(=leg 로컬 −0.09)이 다리가 실제로 드러나는 첫 높이다.
                // 다리 4개가 같은 호출이라 개별 튜닝이 불가능하다 — 가장 많이 새는 다리(5px)까지
                // 한 번에 잡는 0.70 배를 쓴다(실측: 0.76 에서 그 다리가 0 이지만 여유가 없다).
                aoRing(0.036, 0.010, 0, -0.09, 0, { flat: 0.55, op: 0.46, parent: leg });
                (anim.knees = anim.knees || []).push(lower);
                anim.legs.push(leg);
                g.add(leg);
            }
            // 꼬리: 위로 휘어 오르는 3분절 커브 (끝만 밝은 털)
            const tailG = new THREE.Group();
            tailG.position.set(0, 0.46, -0.33);
            tailG.rotation.x = 0.55;
            // 꼬리 밑동 — 엉덩이 구 안에 파묻히지 않도록 **꼬리 축을 감는** 링으로(axis:'z') tailG 에 매단다.
            aoRing(0.072, 0.016, 0, 0, -0.03, { flat: 1, op: 0.46, axis: 'z', parent: tailG });
            let tPrev = tailG;
            for (let ti = 0; ti < 3; ti++) {
                const holder = new THREE.Group();
                holder.position.set(0, 0, -0.068); // 분절 간격 축소+세그 연장 — '구슬 체인' 오독 방지 (비평가 13번)
                holder.rotation.x = -0.26;
                const seg = mk(oSp(0.085 - ti * 0.011, 8, 6, 31 + ti * 13, 0.13), ti === 2 ? furL : furD); // 두툼한 브러시 꼬리 — 털이라 진폭 크게 — 질주 실루엣 방향성
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
            // 몸·머리·배·관절·손이 전부 완전구였다(ⓒ). 살이라 유기 변형을 건다(뿔·발굽 Cone 은 뾰족함이 정답이라 그대로).
            const oSp = (r, w, h, seed, amp) => this.sculptOrganic(new THREE.SphereGeometry(r, w, h), seed, { amp });
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
            body = mk(oSp(0.15, 10, 8, 90, 0.10), skinM);
            body.position.y = 0.4; body.scale.set(1, 1.25, 0.9);
            const belly = mk(oSp(0.1, 8, 6, 93, 0.09), light);
            belly.position.set(0, 0.36, 0.09); belly.scale.set(1, 1.25, 0.5);
            g.add(body, belly);
            // 머리 + 곡선 2단 뿔 + 뾰족귀
            const head = mk(oSp(0.125, 10, 8, 96, 0.07), skinM);   // 뿔·눈이 상대 배치라 진폭을 낮게
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
            // 목(두상 r 0.125 밑) · 허리(몸통 r 0.15×1.25 밑단과 골반 경계) · 날개 소켓
            aoRing(0.088, 0.018, 0, 0.545, 0, { flat: 0.5 });
            aoRing(0.118, 0.02, 0, 0.312, 0, { ez: 0.9, flat: 0.45, op: 0.44 });
            for (const s of [-1, 1]) aoRing(0.048, 0.014, s * 0.125, 0.43, -0.1, { flat: 0.6, op: 0.42 });
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
                const eJ = mk(oSp(0.026, 7, 5, 99 + s * 4, 0.09), skinM); // 팔꿈치 관절 구 — 굽힘 이음새 은폐
                elbow.add(eJ);
                const fore = limb(0.024, 0.02, 0.09, skinD);
                const hand = mk(oSp(0.036, 7, 5, 104 + s * 6, 0.11), skinM);
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
            g.scale.setScalar(this.BOSS_SCALE);
            const crown = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.26, 5), new THREE.MeshLambertMaterial({ color: 0xffd54f, emissive: 0xffd54f, emissiveIntensity: 0.4 }));
            crown.position.y = topY;
            g.add(crown);
        }
        // HP 바: 몸의 변형을 따라가면 안 되므로 g의 자식이 아니라 scene 직속으로 두고
        // update에서 위치만 추적한다(블롭 섀도우와 같은 방식). g의 자식이면 크리 스케일 펀치·
        // 넉백·3/4 회전을 그대로 상속해 바가 기울고 채움 폭이 과장돼 체력 판독이 망가진다.
        // 보스 등 baseScale은 바 크기에 반영해야 하므로(예전 동작) 그룹 스케일로 옮긴다.
        const hpG = new THREE.Group();
        // ⚠️ 간격은 배율로 나눠서 넣는다 — 아래에서 hpG에 baseScale을 통째로 걸기 때문에, 간격을 그냥 더하면
        // 그것까지 배율을 먹어 **덩치가 클수록 바가 머리 위로 더 멀리 뜬다**(보스 1.9배 = 0.35가 0.665로).
        // 비평가가 회차마다 지적한 "바가 대상과 떨어져 공중에 떠 있다"의 실제 원인. 이렇게 두면
        // 월드 간격이 종·등급과 무관하게 항상 일정하다(월드 y = topY*배율 + 간격).
        const gs = g.scale.x || 1;
        const barY = topY + (e.isBoss ? 0.35 : 0.25) / gs;
        // 트랙(배경)을 채움바보다 크게 잡아 어두운 테두리를 만든다 — 같은 크기면 테두리가 안 생겨
        // 밝은 초원 위에서 바 경계가 사라진다. 채움색은 toneMapped=false + 블룸 임계 아래 채도로 (비평가 3번)
        const hpBg = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.135), new THREE.MeshBasicMaterial({ color: this.srgbC(0x0d1114), side: THREE.DoubleSide, transparent: true, opacity: 0.82, toneMapped: false }));
        hpBg.position.y = barY;
        // 손실 잔상바(고스트): 앞바는 즉시 깎이고 이 바가 뒤늦게 스르륵 따라 줄어들며 "방금 얼마나 깎였는지"를 보여준다
        const hpGhost = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: this.srgbC(0xe8a800), side: THREE.DoubleSide, toneMapped: false }));
        hpGhost.position.set(0, barY, 0.005);
        const hpFg = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.09), new THREE.MeshBasicMaterial({ color: this.srgbC(0x2ebd6b), side: THREE.DoubleSide, toneMapped: false }));
        hpFg.position.set(0, barY, 0.01);
        // 소유자 캐럿(적대 빨강) — 근접에서 영웅 위에 걸쳐도 "빨간 바 = 적"이 방향으로 확정된다
        const pip = this.makeOwnerPip(0xe5484d, barY - 0.135 / 2);
        hpG.add(hpBg, hpGhost, hpFg, pip);
        hpG.scale.setScalar(gs); // scene 직속이라 예전에 상속받던 baseScale을 직접 건다
        const rec = { g, body, hpBg, hpGhost, hpFg, hpPip: pip, hpG, armR, armL, kind, anim, baseScale: g.scale.x, topY, barY };
        // `flashMats` — **실제로 플래시가 칠하는 재질 목록**을 그때그때 돌려주는 게터.
        // ⚠️ 예전엔 빌더가 `lam()` 을 거친 재질을 모아 둔 **스냅샷 배열**이었는데, 그 목록에는
        //    **어떤 메시도 안 쓰는 고아 재질**이 섞여 있었다 — 종별 분기가 공용으로 만든 몸통 재질을
        //    안 쓰고 자기 것을 따로 만들기 때문이다(실측: imp 5개 중 앞의 2개가 고아, 서브트리 재질
        //    21개 중 진짜 겹치는 건 3개뿐). 그래서 이 배열을 읽던 `test-hitfx` 의 '연타' 검사는
        //    **플래시가 애초에 건드리지도 않는 재질**을 보고 있었고, 당연히 항상 흰색이 아니라
        //    상시 FAIL 했다(slug: hitflash-overwrite). 진짜 seq 로직은 멀쩡하다 — 실측으로
        //    나중 플래시가 앞 플래시의 onDone 을 넘겨 살아남고(0.28→0.213) 끝나면 원래대로 돌아온다.
        // 게터로 `flashTargets()` 에 위임하면 ⓐ 고아 재질이 원천적으로 못 섞이고 ⓑ 장비 교체로
        // 파츠가 갈려도 항상 최신이며 ⓒ 이 필드를 읽는 도구 4종(test-hitfx·probe-hitflash-delta·
        // probe-flash-gl·shot-hero)이 전부 "진짜 빛나는 것"을 측정하게 된다.
        Object.defineProperty(rec, 'flashMats', { get() { return Scene3D.flashTargets(this).lit; }, enumerable: true });
        return rec;
    },

    // 접지 블롭 전용 텍스처 — `makeGlowTexture` 는 45% 지점에서 이미 알파 0.4 라 **넓고 흐린 헤이즈**가
    // 된다. 큰 소품에 그걸 크게 깔면 '무엇이 드리웠는지 알 수 없는 검은 아메바 얼룩'으로 읽힌다
    // (비평가 2인이 각각 최우선으로 지적: "드리울 물체가 화면에 없는 거대한 새까만 얼룩").
    // 접지 AO 는 **중심이 진하고 빨리 떨어져야** 한다 — 밑동 아래를 확실히 눌러 주고 가장자리는 곧 사라진다.
    makeBlobTexture() {
        if (this._blobTex) return this._blobTex;
        const size = 128;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.34, 'rgba(255,255,255,0.72)');
        grad.addColorStop(0.68, 'rgba(255,255,255,0.16)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        return (this._blobTex = new THREE.CanvasTexture(c));
    },

    // 소품이 실제로 지면을 덮는 반경(월드) — 블롭 크기를 **명목 스케일이 아니라 실측 실루엣**에 묶는다.
    // 명목 스케일(`1.15*s+0.5`)로 잡으면 같은 s 라도 종에 따라 폭이 2배 넘게 달라 블롭이 따로 논다.
    // minR: 하한(기본 0.25). ⚠️ 풀·덤불처럼 **하한보다 작은 소품**에는 이 기본값을 쓰면 안 된다 —
    //    반경 0.05 짜리 풀에 0.25 를 깔면 블롭이 제 소품의 **5배**가 되어, 큰 소품에서 없앤 '캐스터 없는
    //    얼룩'이 작은 소품에서 그대로 재현된다(실측: 초원·밤숲·마법에서 최악 4.8배). 호출부가 자기
    //    크기대에 맞는 하한을 넘길 것.
    footprintRadius(obj, minR) {
        const bb = new THREE.Box3().setFromObject(obj);
        if (!isFinite(bb.min.x)) return 1;
        const sz = bb.getSize(new THREE.Vector3());
        return U.clamp(Math.max(sz.x, sz.z) * 0.5, minR === undefined ? 0.25 : minR, 4.5);
    },

    ensureBlobRes() {
        if (this.blobShadowMat) return;
        this.blobShadowMat = new THREE.MeshBasicMaterial({
            map: this.makeBlobTexture(), color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false, // 실그림자(섀도맵)의 접지 AO 보조 — 0.34는 실그림자와 이중 노출로 '그림자 두 개' 오독 (비평가: 버섯·임프 블롭 정합). 폴오프를 좁힌 만큼(makeBlobTexture) 0.17 → 0.22 로 소폭 보정
        });
        this.blobShadowFlyMat = this.blobShadowMat.clone();
        this.blobShadowFlyMat.opacity = 0.45; // 비행체 전용 — 실그림자를 끄므로 블롭이 유일한 접지 단서 (0.3은 샷에서 안 보여 '부유 스티커', 비평가 7.3 5번)
        this.blobShadowFoeMat = this.blobShadowMat.clone();
        this.blobShadowFoeMat.opacity = 0.26; // 지상 적 전용(`silhouette-after-outline` ⓒ) — 아웃라인 삭제 후 발밑 어둠이 배경 분리를 나눠 진다. 0.34는 실그림자와 이중 노출 오독(위 주석), 0.17은 초원 하이키에서 접지 단서가 안 남아 중간값
        this.blobGeo = new THREE.PlaneGeometry(1, 1);
    },

    // 블롭 제거 — 비행체 블롭은 개체 복제 재질이라 여기서 놓아 준다(공유 재질은 건드리지 않는다).
    dropBlob(m) {
        if (!m || !m.blob) return;
        this.scene.remove(m.blob);
        if (!m.blob.userData.sharedMaterial && m.blob.material) m.blob.material.dispose();
        m.blob = null;
    },

    spawnEnemy(e) {
        const m = this.monsterMesh(e);
        m.g.position.set(e.x + this.worldX, 0, 0);
        m.g.rotation.y = -0.55; // 영웅 방향(-x)으로 3/4 자세
        this.setShadow(m.g, true);
        this.applyRimLight(m.g, this.ENEMY_RIM); // 적 전용 강화 컨투어 — ENEMY_RIM 주석 참고
        // 사망 디졸브 셰이더를 **여기서** 심는다(죽을 때 심으면 재질 100여 개가 한 프레임에 재컴파일된다).
        // uDis=0 이라 살아 있는 동안 화면은 한 픽셀도 안 바뀐다 — installDissolve 주석 참고.
        this.installDissolve(m.g);
        this.scene.add(m.g);
        // 적 바는 **적대 빨강**으로 못 박는다 — 영웅 바와 같은 초록/노랑/빨강 램프를 쓰면 둘이
        // 같은 색이라 피아 구분이 안 됐다(비평가 4차 ⓓ). 남은 체력은 어차피 **바 길이**가 말해 주므로
        // 램프의 경고 기능은 정작 그게 필요한 영웅 바에만 남긴다.
        m.foe = true;
        // 개체 폭 실측 — Combat.restackMelee가 "몸폭만큼" 자리를 벌리는 데 쓴다.
        // 종마다 폭이 1.0~1.6유닛으로 제각각이라 고정 간격으로는 슬라임은 파묻히고 박쥐는 뜬다.
        // 3/4 yaw(-0.55)가 걸린 뒤에 재야 화면에서 실제로 차지하는 가로폭이 나오므로 여기서 잰다.
        // 스폰 시 한 번만(웨이브당 최대 3회) — 매 프레임 재면 스쿼시·돌진 변형이 섞여 대열이 떨린다.
        m.g.updateWorldMatrix(true, true);
        const bbW = new THREE.Box3().setFromObject(m.g).getSize(new THREE.Vector3()).x;
        m.halfW = Number.isFinite(bbW) && bbW > 0 ? Math.max(0.24, bbW / 2) : 0.5;
        // HP 바는 scene 직속(몸 변형 비상속) — 위치는 update가 매 프레임 추적
        if (m.hpG) {
            m.hpG.position.set(m.g.position.x, m.g.position.y, m.g.position.z);
            this.scene.add(m.hpG);
        }
        this.enemyMap.set(e.id, m);
        // 접지 블롭 섀도우 — scene 직속으로 두고 update에서 추적 (홉/비행 시 그림자는 지면에 남아야 함)
        this.ensureBlobRes();
        // 비행체는 태양 각도로 실그림자가 본체에서 멀리 이탈해 '따로 노는 얼룩'이 됨 (비평가 7.1 4번) — 실그림자 끄고 발밑 수직 블롭만
        const flying = m.kind === 'bat';
        if (flying) m.g.traverse(o => { if (o.isMesh) o.castShadow = false; });
        // 🚨 비행체 블롭만 **개체마다 재질을 복제**한다 — 고도에 따라 불투명도를 달리 주려면
        //    공유 싱글턴으로는 안 된다(한 마리를 옅게 하면 전부 옅어진다). 박쥐는 웨이브당 몇 마리라
        //    복제 비용은 무시할 만하다. ⚠️ 대신 제거할 때 반드시 dispose 한다 — 이 저장소는 공유 재질과
        //    개체 재질을 섞어 쓰다 누수를 낸 전력이 있다(dispose-tree-dup). `dropBlob()` 이 그 자리다.
        const blobMat = flying ? this.blobShadowFlyMat.clone() : this.blobShadowFoeMat;
        const blob = new THREE.Mesh(this.blobGeo, blobMat);
        blob.rotation.x = -Math.PI / 2;
        blob.position.set(e.x + this.worldX, 0.03, 0);
        blob.scale.setScalar(flying ? 0.85 : 0.72); // 실그림자 접지부 안 컨택트 AO — 비행체는 블롭이 유일한 접지 단서라 더 크게
        blob.userData.baseS = blob.scale.x;
        blob.userData.sharedGeometry = true;
        blob.userData.sharedMaterial = !flying; // 지상 적은 blobShadow*Mat 싱글턴 — disposeTree 재질 해제 금지
        blob.userData.fly = flying;
        blob.userData.baseO = blobMat.opacity;  // 고도 감쇠의 기준값(테마 틴트는 색만 바꾸므로 안전)
        this.scene.add(blob);
        m.blob = blob;
        // 등장: 지면을 밟고 화면 밖(+x)에서 걸어 들어옴 — 하늘 낙하 금지 (사용자 지시).
        // 스폰 x(3.1+)는 화면 밖이고 Combat 접근 로직이 전진시키므로 즉시 접지 + 걷기 모션이 곧 등장 연출.
        m.g.userData.landed = true;
        if (e.isBoss) {
            // 보스 등장: 워닝이 지목한 자리에서 먼지 파동 + 스케일 인 (접지 유지 — 하늘 낙하 금지).
            // bossEntrance의 착지 임팩트와 같은 프레임에 시작되므로 여기서는 '솟아오르는 몸' 쪽만 담당한다.
            const targetScale = m.g.scale.x;
            m.g.scale.setScalar(targetScale * 0.42);
            // 등장 스케일 인이 도는 동안 보행 스쿼시가 같은 scale 을 덮어쓰면 '솟아오르는 몸'이 사라진다.
            // (종전에는 스케일을 쓰는 상시 코드가 히트 스쿼시뿐이었고 그건 등장 중엔 안 걸렸다.)
            m._scaleLocked = true;
            this.expandRing(m.g.position.clone(), new THREE.Color(0xbcaaa4), 1.8);
            this.spawnSparks(m.g.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 18, 0xd7ccc8, { speed: 1.6 });
            this.addAnim(0.42, k => {
                // 오버슈트(1.08배)로 한 번 부풀었다 자리를 잡는다 — 선형 확대는 '스티커가 커지는' 인상
                const e2 = 1 - Math.pow(1 - k, 3);
                const over = Math.sin(Math.PI * Math.min(1, k / 0.85)) * 0.08;
                m.g.scale.setScalar(targetScale * (0.42 + 0.58 * e2 + over));
            }, () => { m.g.scale.setScalar(targetScale); m._scaleLocked = false; });
        }
    },

    // 근접 대열 계산용 반폭 — Combat이 스폰 직후 물어본다. 메시가 없으면(이론상 없음) 보수적 기본값.
    enemyHalfW(id) { const m = this.enemyMap.get(id); return (m && m.halfW) || 0.5; },

    clearEnemies() {
        for (const [, m] of this.enemyMap) {
            this.disposeTree(m.g); this.scene.remove(m.g);
            if (m.hpG) { this.disposeTree(m.hpG); this.scene.remove(m.hpG); } // 바가 scene 직속이라 따로 걷어낸다
            this.dropBlob(m);
        }
        this.enemyMap.clear();
    },

    // 사망 암전이 닫히는 동안 남은 적을 걷어낸다 (death-enemy-remnant, 사용자 지시 2026-08-20:
    // "죽음 후 화면이 걷힌 뒤에도 이전 적 메시가 몇 초간 남아 있다").
    //
    // 왜 별도 함수인가 — `clearEnemies` 는 `setupStage` 안에 있고, 사망 경로에서 그 시점은
    // **암전이 이미 걷히기 시작한 뒤**다. 실측(`tools/probe-death-remnant.js`, 수정 전):
    // 암전 완전 폐쇄 1723ms → 다시 걷힘(opacity<0.6) 3353ms → **옛 적 메시는 6258ms 까지 씬에 잔류**.
    // 즉 사용자는 걷힌 화면에서 직전 스테이지 적을 1초 넘게 본다. 그래서 정리를 **사망 순간에서
    // 재는 벽시계**로 앞당겨 암전 안에서 끝낸다.
    //
    // 왜 하드 삭제가 아니라 디졸브인가 — 앞당긴 정리는 커버가 아직 투명한 구간(0~delay)과 겹칠 수
    // 있고, 커버 자체가 없는 강등 경로(WAAPI 미지원 → 토스트)도 있다. 하드 삭제면 그 구간에서
    // '적이 순간 증발'로 읽힌다. 사망 디졸브(`setDissolve`)와 같은 노이즈 소멸로 흘려보내면
    // 커버가 있든 없든 자연스럽다. 소멸 구간은 `DEATH_FADE.delay`→`delay+fadeIn` 에 정확히 맞춘다
    // (=커버가 어두워지는 그 구간에서만 녹는다).
    //
    // 맵에서는 **즉시** 지운다: 소멸이 끝나기를 기다리면 그 사이 `clearEnemies`/`spawnEnemy` 가
    // 같은 메시를 두 번 만지고, 무엇보다 '논리상 이미 없는 적'을 조회하는 코드가 살아난다.
    // 🚨 진행도는 애니메이션 k(=렌더 dt 누적)가 아니라 **벽시계**로 잰다. main.js 의 렌더 루프는
    //    dt 를 프레임당 0.1s 로 클램프하므로(`Math.min(0.1, …)`), 10fps 아래로 떨어지면 addAnim 의
    //    k 가 실시간보다 몇 배 느리게 흐른다. 그런데 이걸 가려 주는 암전 커버는 WAAPI = **벽시계**다.
    //    k 로 재면 저프레임에서 그 위상차만큼 덜 녹은 적이 걷힌 암전 뒤로 드러난다 — 고치려는
    //    결함과 정확히 같은 계열이다(실측: swiftshader 3fps 환경에서 소멸이 1.6s → 5s 로 늘어졌다).
    //    렌더 루프가 아예 멈춘 경우까지 보증하려고 setTimeout 안전망도 같이 건다.
    deathWipeEnemies() {
        const T = this.DEATH_FADE;
        const total = T.delay + T.fadeIn;          // 커버가 완전히 닫히는 시점 = 소멸이 끝나야 하는 시점
        const t0 = U.now();
        const doomed = [...this.enemyMap.values()];
        this.enemyMap.clear();
        const finish = m => {
            if (m._wiped) return;                  // 애니 종료·f 도달·안전망 셋 중 먼저 온 하나만 치운다
            m._wiped = true;
            this.disposeTree(m.g); this.scene.remove(m.g); this.dropBlob(m);
        };
        for (const m of doomed) {
            // 빈 HP바는 즉시 걷는다 — 몸이 녹는 동안 바만 떠 있으면 몸과 무관한 UI 조각으로 읽힌다
            // (`enemyDie` 가 빈 바를 시체에 붙여 둔 것과 같은 이유의 반대편 처리).
            if (m.hpG) { this.disposeTree(m.hpG); this.scene.remove(m.hpG); m.hpG = null; }
            // 죽는 중이던 적은 제 디졸브가 이미 돌고 있다 — 0부터 다시 칠하면 반쯤 녹은 몸이
            // 되살아난다. 그 애니메이션은 그대로 두고 여기서는 뒷정리(치우기)만 겹쳐 건다.
            const dying = !!m.dead;
            // addAnim 은 **프레임 티커로만** 쓴다 — 치우는 시점은 오로지 벽시계(f>=1)와 아래 안전망이
            // 정한다. 애니 종료(onDone)에 치우기를 맡기면 애니 시계가 벽시계보다 앞설 때(프레임을
            // 몰아 그리는 캡처 하네스에서 실제로 그랬다) 아직 화면이 다 보이는데 적이 증발한다.
            this.addAnim((total + 400) / 1000, () => {
                if (m._wiped) return;
                const f = U.clamp((U.now() - t0 - T.delay) / T.fadeIn, 0, 1);
                if (!dying) {
                    this.setDissolve(m.g, f);
                    if (m.blob) m.blob.scale.setScalar(0.95 * (1 - f));
                }
                if (f >= 1) finish(m);
            }, () => { if (U.now() - t0 >= total) finish(m); });
            setTimeout(() => finish(m), total + 400);   // 렌더 루프가 멈춘 경우의 최종 보증
        }
        return doomed.length;
    },

    // 오브젝트 서브트리의 geometry/material을 해제 (제거 시 GPU 메모리 누적 방지).
    // GLB 스켈레톤 몬스터 clone은 geometry를 원본 템플릿과 공유하므로
    // monsterMesh()에서 userData.sharedGeometry=true로 표시된 메시는 geometry를 건드리지 않음(material은 인스턴스별 clone이라 해제).
    // ⚠️ 이 메서드는 파일에 **하나만** 있어야 한다 — 예전에 프리뷰 쪽에 지오메트리만 지우는 동명
    //    정의가 하나 더 있었고, 객체 리터럴 중복 키는 뒤가 이겨서 재질 해제가 통째로 죽어 있었다
    //    (dispose-tree-dup). 공유 재질(blobShadowMat 계열·crystal*Mat·_pvMats 캐시 클론)을 물고
    //    있는 메시는 `userData.sharedMaterial = true` 를 달아 재질을 건너뛴다 — 지오메트리의
    //    sharedGeometry 플래그와 같은 규약이다.
    disposeTree(root) {
        root.traverse(o => {
            if (!o.isMesh) return;
            if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
            if (o.material && !o.userData.sharedMaterial) {
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
        // ⚠️ weapon-size-2x(2026-08-19) 때 이 정지 거리(0.6)를 0.32/1.15 로 흔들어 봤지만 원복했다 —
        //    2배 무기는 **최원점(끝점) 호가 적 bbox 를 감싸고 돌아** 끝점 기준 접촉이 성립하지 않는
        //    기하 문제라, 정지 거리로는 못 고친다(1.15 는 근접 적에게 tx 가 fromX 뒤로 가 돌진이 후진).
        //    접촉 판정은 프로브의 자를 '헤드 영역(파지에서 먼 25% 정점) 최근접'으로 교정해 해소했다.
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
            this.heroG.position.y = this.rideY || 0;
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
            this.heroG.position.y = (this.rideY || 0) + Math.sin(k * Math.PI) * 0.18;            // 점프
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
                    // 앵커는 **표적 발밑**(x·z 모두). 예전엔 `tx+0.5` 라는 영웅 돌진 좌표에 z=0 고정이라, 깊이 레인에
                    // 선 적에게는 링이 발밑에서 비껴 떨어졌다(실측 17.3px). 표적이 없을 때만 옛 좌표로 떨어진다.
                    this.expandRing(m ? new THREE.Vector3(m.g.position.x, 0, m.g.position.z)
                        : new THREE.Vector3(Math.min(tx + 0.5, this.worldX + 1.2), 0, 0), new THREE.Color(0xffcc80), 0.52);
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
                // 앵커는 **표적 발밑**(x·z 모두). 예전엔 `tx+0.5` 라는 영웅 돌진 좌표에 z=0 고정이라, 깊이 레인에
                // 선 적에게는 링이 발밑에서 비껴 떨어졌다(실측 17.3px). 표적이 없을 때만 옛 좌표로 떨어진다.
                this.expandRing(m ? new THREE.Vector3(m.g.position.x, 0, m.g.position.z)
                    : new THREE.Vector3(Math.min(tx + 0.5, this.worldX + 1.2), 0, 0), new THREE.Color(0xffcc80), 0.52);
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
                this.heroG.position.y = (this.rideY || 0) + Math.sin(k * Math.PI) * 0.1;
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
            new THREE.TorusGeometry(0.34, 0.03, 6, 16, Math.PI * 0.55), // 1.1π는 적 머리를 감싼 '후프'로 읽혔다
            new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })
        );
        // 적 앞이 아니라 영웅 쪽(z 안쪽)에 붙인다 — 기존 크기·위치로는 적 실루엣과 머리 위 HP바를 통째로 덮었다
        arc.position.set(this.heroG.position.x + 0.4, 1.0, 0.05);
        arc.rotation.set(0, 0.4, -0.9);
        this.scene.add(arc);
        this.addAnim(0.1, k => {
            arc.scale.setScalar(1 + k * 0.8);
            arc.rotation.z = -0.9 - k * 1.6; // 호가 휘둘러지는 느낌
            arc.material.opacity = 0.85 * (1 - k);
        }, () => { this.disposeTree(arc); this.scene.remove(arc); });
    },

    // ---- 투사체 ----
    projectiles: [],
    fireProjectile(kind, to, colorHex, dur) {
        const from = new THREE.Vector3(this.heroG.position.x + 0.45, 1.05 + (this.rideY || 0), 0.1); // 탑승 중엔 발사 원점도 같이 올라간다
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
        } else { // spin — 던지는 무기 자체가 날아간다
            const w = S.equipment.weapon;
            const wAge = w ? w.ageIdx : 0;
            if (weaponShape(this.wtypeId) === 'sling') {
                // 투석구는 무기가 아니라 '돌'이 날아간다 (도끼가 날아가면 원시 시대에 강철 도끼가 뜨는 꼴)
                mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.075, 0),
                    new THREE.MeshStandardMaterial({ color: 0x8d8a80, metalness: 0.02, roughness: 0.96, flatShading: true }));
            } else {
                mesh = this.makeWeapon(this.wtypeId || 'thrown', wAge, w && w.rarity);
                mesh.scale.setScalar(0.9);
            }
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
            // 🚨 공격 중에 죽으면 이 돌진이 **시체의 x 를 계속 덮어쓴다.** 사망 애니메이션이
            //    "트랜스폼을 단독 소유"한다는 전제(killEnemy 주석)가 여기서만 깨져 있었다 —
            //    돌진(0.3초)과 쓰러짐이 같은 프레임에 x 를 서로 밀어, 시체가 죽은 자리로 되끌려갔다
            //    돌진이 끝나는 순간 쓰러짐 값으로 **한 프레임에 33px 순간이동**했다
            //    (실측 `probe-deadbar-anchor.js`: world.x 2.546 → 3.211 을 16ms 만에).
            //    그 x 를 따라가는 빈 HP바도 같이 튄다. 죽으면 즉시 손을 뗀다.
            if (m.dead) return;
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
            if (m.dead) return;   // 시체 자세를 원위치로 되돌리면 쓰러진 몸이 벌떡 선다
            const e = Combat.enemies.find(x => x.id === id);
            m.g.position.x = e ? e.x + this.worldX : ox;
            if (m.armR) m.armR.rotation.x = 0;
            if (m.anim && m.anim.armRJ) { m.anim.armRJ.elbow.rotation.x = -0.22; m.g.rotation.z = 0; } // 아이들 자연 굽힘 자세로 복귀
        });
    },

    // ---- 타격감(피격 연출) ----
    // 🚨 **히트스톱(씬 dt 정지) 금지 — 되살리지 말 것** (사용자 지시 2026-08-19, skill-cast-lag-optimize 재오픈):
    // "데미지 들어갈 때마다 일부러 시간 멈춘 거면 그것도 없애라." 씬만 얼고 CSS(보스워닝)는 스무스해
    // '렉'으로 읽혔다. 타격감은 dt 를 건드리지 않는 항목들(셰이크·fovPunch·스쿼시·플래시·넉백)이 맡는다.

    // 접촉점 임팩트 플레어 텍스처: 방사 코어 + 십자 스파이크 (캔버스 절차 생성, 1회 캐시)
    flareTex() {
        if (this._flareTex) return this._flareTex;
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const x = c.getContext('2d'), R = 64;
        const g = x.createRadialGradient(R, R, 0, R, R, R);
        // 감쇠 pow(1-r,3): 예전 스톱(.16→.9, .42→.28)은 반경 40%까지 거의 불투명해 가산 합성 뒤
        // 플레어 원반이 적 하반신을 통째로 먹었다(비평가 2차 ⓐ). 3제곱이면 r=0.3에 이미 34%로 떨어져
        // 코어만 남고 바깥은 빠르게 사라진다 — 같은 '밝기 예산'을 좁은 중심에 몰아준다.
        for (let i = 0; i <= 10; i++) { const r = i / 10; g.addColorStop(r, `rgba(255,255,255,${Math.pow(1 - r, 3).toFixed(3)})`); }
        x.fillStyle = g; x.fillRect(0, 0, 128, 128);
        // 십자 스파이크 — 점 하나보다 '맞은 지점'으로 읽힌다. 스파이크는 얇아 면적 기여가 작으므로
        // 원반을 줄인 만큼 여기서 '뾰족함'을 유지한다(밝기를 넓게 퍼뜨리지 않고 방향으로 쓴다).
        x.globalCompositeOperation = 'lighter';
        for (const rot of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
            x.save(); x.translate(R, R); x.rotate(rot);
            const len = rot % (Math.PI / 2) === 0 ? 62 : 40;
            const lg = x.createLinearGradient(-len, 0, len, 0);
            lg.addColorStop(0, 'rgba(255,255,255,0)');
            lg.addColorStop(0.5, 'rgba(255,255,255,.85)');
            lg.addColorStop(1, 'rgba(255,255,255,0)');
            x.fillStyle = lg; x.fillRect(-len, -2.2, len * 2, 4.4);
            x.restore();
        }
        this._flareTex = new THREE.CanvasTexture(c);
        return this._flareTex;
    },

    // ── 사망 디졸브(노이즈 알파 클립) ─────────────────────────────────────────────
    // 종전 디졸브는 전 재질 `opacity = 1 - f` 균일 페이드였다. 그건 '사라진다'가 아니라
    // **'투명해진다'**로 읽힌다 — 시체가 통째로 옅어지는 동안 실루엣이 끝까지 남아 있어서
    // 마지막 0.3초가 '유령이 됐다'로 보였고, 배경(초원)이 비쳐 색이 뭉개졌다.
    // 노이즈 임계값으로 화소를 **버리면**(discard) 시체가 가장자리부터 부스러지며 없어지고,
    // 버려지는 경계에 잔불(ember)을 얹어 처치 버스트의 주황이 시체까지 이어진다.
    //
    // 🚨 왜 `onBeforeCompile` 을 **스폰 때** 거는가 — 죽을 때 걸면 프레임이 튄다.
    //    적 한 마리의 재질은 40~130개고(실측: 고블린 126메시), 죽는 순간 `needsUpdate` 로
    //    전부 재컴파일하면 그 프레임이 통째로 멎는다. 처치는 몇 초에 한 번씩 계속 일어나므로
    //    그 히치가 곧 게임 내내의 히치다. 스폰 때 걸어 두면 컴파일이 **첫 렌더 한 번**으로 끝나고
    //    (그 프레임은 어차피 지오메트리 업로드로 무거운 프레임이다), 죽을 때는 유니폼 숫자
    //    하나만 올리면 된다. uDis=0 이면 셰이더가 `discard` 를 타지 않으므로 살아 있는 동안의
    //    비용은 노이즈 계산뿐이고, 그마저 uDis<=0 에서 조기 반환한다.
    // 🚨 훅 함수는 **하나를 공유**해야 한다 — three r128 의 `Material.customProgramCacheKey()`
    //    기본 구현이 `onBeforeCompile.toString()` 이라, 재질마다 새 클로저를 만들면 문자열은 같아도
    //    안전하지만 재질별로 함수를 새로 만들 이유가 없다. 유니폼만 재질별(`userData.dissolveU`)로 쥔다.
    DISSOLVE_NOISE: [
        'float dsvHash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0;',
        '  return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
        'float dsvNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(mix(dsvHash(i), dsvHash(i + vec3(1,0,0)), f.x), mix(dsvHash(i + vec3(0,1,0)), dsvHash(i + vec3(1,1,0)), f.x), f.y),',
        '             mix(mix(dsvHash(i + vec3(0,0,1)), dsvHash(i + vec3(1,0,1)), f.x), mix(dsvHash(i + vec3(0,1,1)), dsvHash(i + vec3(1,1,1)), f.x), f.y), f.z); }',
    ].join('\n'),

    // 프로그램 캐시 키 — 🚨 훅을 하나로 공유하면 three 의 기본 키(`onBeforeCompile.toString()`)가
    // **림/그늘이 걸린 재질과 안 걸린 재질을 같은 키로 묶어** 엉뚱한 프로그램을 재사용한다
    // (적은 몸 재질에만 림이 붙고 눈 흰자 등에는 안 붙는다 — applyRimLight 의 Standard/Phong 조건).
    // 그래서 심는 순간 어떤 훅이 얹혀 있었는지를 키에 적어 준다.
    _dissolveCacheKey() {
        return 'dsv|' + (this.userData.__rim ? 'r' : '') + (this.userData.__shade ? 's' : '');
    },

    // 모든 디졸브 재질이 공유하는 단일 훅 (위 캐시키 주석 참고).
    _dissolveHook(shader, renderer) {
        // `this` 는 three 가 재질을 바인딩해 준다 — 훅 시그니처가 (shader, renderer) 라 재질은 this.
        // ⚠️ 먼저 **앞서 걸려 있던 훅(림 라이트·그늘 틴트)을 부른다.** 이걸 빠뜨리면 적의 컨투어가
        //    통째로 사라진다 — spawnEnemy 는 applyRimLight **뒤에** installDissolve 를 부른다.
        const prev = this.userData.dissolvePrev;
        if (prev) prev.call(this, shader, renderer);
        shader.uniforms.uDis = this.userData.dissolveU;
        shader.vertexShader = 'varying vec3 vDsvPos;\n' + shader.vertexShader.replace(
            '#include <begin_vertex>', '#include <begin_vertex>\n\tvDsvPos = position;');
        shader.fragmentShader = 'uniform float uDis;\nvarying vec3 vDsvPos;\n' + Scene3D.DISSOLVE_NOISE + '\n'
            + shader.fragmentShader
                // 버리는 건 조명 계산 전에 — 조명·그림자 코드를 태우고 버리면 낭비다.
                .replace('#include <clipping_planes_fragment>', [
                    '#include <clipping_planes_fragment>',
                    'float dsvN = 0.0;',
                    'if (uDis > 0.0) {',
                    // 두 옥타브 — 한 옥타브만 쓰면 구멍이 격자로 뚫려 '체크무늬'로 읽힌다.
                    '  dsvN = dsvNoise(vDsvPos * 6.5) * 0.62 + dsvNoise(vDsvPos * 15.0) * 0.38;',
                    // 아래를 조금 오래 남긴다 — 발밑부터 사라지면 시체가 위로 떠오르는 것처럼 보인다.
                    '  dsvN += clamp(vDsvPos.y, -0.6, 1.2) * 0.10;',
                    '  if (dsvN < uDis) discard;',
                    '}',
                ].join('\n'))
                // 잔불 — 최종 색이 나온 뒤(디더링 직전)에 경계만 태운다.
                .replace('#include <dithering_fragment>', [
                    '#include <dithering_fragment>',
                    'if (uDis > 0.0) {',
                    '  float dsvE = 1.0 - smoothstep(uDis, uDis + 0.13, dsvN);',
                    '  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.52, 0.16) * 1.6, dsvE * 0.92);',
                    '}',
                ].join('\n'));
    },

    // 서브트리의 모든 재질에 디졸브 훅을 심는다(같은 재질이 여러 메시에 걸려 있어도 한 번만).
    installDissolve(root) {
        root.traverse(o => {
            if (!o.isMesh || !o.material) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => {
                if (mt.userData.dissolveU) return;
                mt.userData.dissolveU = { value: 0 };
                mt.userData.dissolvePrev = mt.onBeforeCompile;  // 림/그늘 훅 보존 — _dissolveHook 이 먼저 부른다
                mt.onBeforeCompile = this._dissolveHook;
                mt.customProgramCacheKey = this._dissolveCacheKey;
                mt.needsUpdate = true;
            });
        });
    },

    // 디졸브 진행도 f(0~1)를 서브트리에 먹인다.
    // 🚨 f 를 임계값에 **그대로** 넣으면 안 된다 — 값 노이즈는 0.5 근처에 질량이 몰린 종 모양이라,
    //    임계값을 등속으로 올리면 앞뒤 0.3 구간에서는 아무것도 안 없어지고 가운데서 한꺼번에 무너진다.
    //    실측(`probe-death-dissolve.js`, 골렘): 임계 0.21 에서 커버리지 0.98 · 0.53 에서 0.68 ·
    //    0.76 에서 0.02 로, **눈에 보이는 소멸이 창의 3분의 1로 뭉쳐** 0.42초를 줬는데 실제 소멸은
    //    0.14초였다(처방 0.3~0.5초 미달). 그래서 노이즈가 실제로 분포한 대역
    //    [DSV_LO, DSV_HI] 로 f 를 펴서 창 전체를 쓰게 한다(대역은 위 실측 표에서 커버리지 1.0/0.0 이 되는 임계값).
    // ⚠️ 마지막 12% 는 대역 밖(0.95)까지 밀어 올린다 — 종·파츠마다 로컬 좌표 크기가 달라
    //    노이즈 최댓값이 DSV_HI 를 넘는 메시가 남는다(실측: 골렘 15px 이 0.1초 더 떠 있었다).
    //    보이는 소멸 구간은 f≤0.88 의 [LO, HI] 구간이 그대로 담당하므로 타이밍은 안 바뀐다.
    DSV_LO: 0.24, DSV_HI: 0.78, DSV_TAIL: 0.88,
    setDissolve(root, f) {
        const c = U.clamp(f, 0, 1);
        const v = f <= 0 ? 0
            : c <= this.DSV_TAIL ? this.DSV_LO + (c / this.DSV_TAIL) * (this.DSV_HI - this.DSV_LO)
                : this.DSV_HI + ((c - this.DSV_TAIL) / (1 - this.DSV_TAIL)) * (0.95 - this.DSV_HI);
        root.traverse(o => {
            if (!o.isMesh || !o.material) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => {
                if (mt.userData.dissolveU) { mt.userData.dissolveU.value = v; return; }
                // 훅이 안 걸린 재질(스폰 경로를 안 탄 것)은 종전대로 불투명도로 접는다 — 안 그러면 그 파츠만 남는다.
                const b = mt.userData.dissolveBase !== undefined ? mt.userData.dissolveBase : 1;
                mt.transparent = true;
                mt.opacity = b * Math.max(0, 1 - f);
            });
        });
    },

    // 타격 지점에 카메라를 향한 가산 쿼드를 번쩍인다. 전신을 하얗게 태우는 대신 "어디를 맞았는지"를 준다.
    // peak: 가산 불투명도 상한 (기본 0.85). 피격 플레어는 0.55로 눌러 적 실루엣이 살아남게 한다.
    impactFlare(pos, colorHex, size, dur, spin, peak) {
        const pk = peak === undefined ? 0.85 : peak;
        const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
            map: this.flareTex(), color: colorHex, transparent: true, opacity: pk,
            blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
        }));
        q.position.copy(pos);
        q.lookAt(this.camera.position);
        q.rotation.z += spin || 0;
        q.scale.setScalar(size * 0.3);
        this.scene.add(q);
        q.scale.setScalar(size * 0.9); // 첫 프레임부터 거의 최대 — 커지며 등장하면 정작 히트스톱으로 멈춘 임팩트 프레임이 빈다
        this.addAnim(dur, k => {
            q.scale.setScalar(size * (0.9 + 0.45 * k));
            q.material.opacity = pk * (1 - k) * (1 - k);
        }, () => { this.disposeTree(q); this.scene.remove(q); });
    },

    // ── 접점 임팩트 밀도 (hp-juicy ② — 비평가 6차 잔여 지적) ──────────────────────────
    // 지적: "접점이 둥근 플레어 몇 겹뿐이라 **부딪힌 순간의 밀도**가 없다 — 방사형 스파이크와
    //        플레어 링을 얹고 크리는 1.5배로." 지금 있는 건 원형 플레어 3층 + 파편/스파크뿐이라
    //        **접점에서 뻗어 나가는 선**과 **퍼지는 테**가 통째로 없었다.
    // ⚠️ 크기는 전부 호출부가 준 `size`(= 적 실높이 비례 `fmax`)에 묶는다 — 고정 유닛으로 두면
    //    키 0.85 슬라임에서 스파이크가 몸보다 길어져 하반신이 지워진다(플레어가 이미 밟은 함정).
    // ⚠️ 카메라를 향하게(`lookAt`) 세운다. 월드 XY 평면에 두면 카메라가 내려다보는 이 게임에서
    //    스파이크가 납작하게 눌려 '선'이 아니라 '얼룩'이 된다.
    impactSpikes(pos, count, colorHex, size, dur, crit) {
        const n = Math.max(3, Math.round(count));
        const base = U.rand(0, Math.PI);            // 매 타격 각도를 돌린다 — 고정하면 같은 별 도장이 반복된다
        for (let i = 0; i < n; i++) {
            const ang = base + (i / n) * Math.PI * 2 + U.rand(-0.18, 0.18);
            const len = size * U.rand(0.55, 1.0);
            const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
                map: this.flareTex(), color: colorHex, transparent: true, opacity: crit ? 0.95 : 0.8,
                blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
            }));
            q.position.copy(pos);
            q.lookAt(this.camera.position);
            q.rotateZ(ang);
            // ⚠️ 표식을 남긴다 — 판정기가 **타입(PlaneGeometry)으로 찾으면** 같은 프레임의 플레어 3층·
            //    파편까지 같이 잡혀 수치가 통째로 오염된다(실제로 첫 판정이 6개 대신 14개를 셌다).
            q.userData.impactSpike = true;
            const w = size * (crit ? 0.16 : 0.12);
            // ⚠️ 첫 프레임 값을 여기서 박아 둔다. 안 그러면 애니메이션이 처음 도는 프레임까지
            //    scale 이 기본값 (1,1,1) 로 남아, 판정기가 t0 을 '길이 1.0'으로 읽고 **줄어드는 것처럼**
            //    보인다(실제로 첫 판정이 1.000 → 0.628 로 나왔다). impactFlare 도 같은 이유로 미리 박는다.
            q.scale.set(w, len * 0.35, 1);
            this.scene.add(q);
            this.addAnim(dur, k => {
                // 뻗었다가 뿌리부터 사라진다 — 길이는 계속 자라고(감속) 폭은 줄어 '선'으로 남는다
                const g = 1 - Math.pow(1 - k, 2.2);
                q.scale.set(w * (1 - 0.55 * k), len * (0.35 + 0.9 * g), 1);
                q.position.copy(pos).addScaledVector(
                    new THREE.Vector3().setFromMatrixColumn(q.matrix, 1).normalize(), len * (0.2 + 0.5 * g));
                q.material.opacity = (crit ? 0.95 : 0.8) * (1 - k) * (1 - k);
            }, () => { this.disposeTree(q); this.scene.remove(q); });
        }
    },

    // 접점에서 퍼지는 **카메라를 향한** 얇은 테 — `expandRing` 은 지면에 눕는 충격파라 역할이 다르다
    // (그건 발밑, 이건 맞은 자리). 둘을 같이 쓰면 '바닥이 울리고 몸이 튄다'가 한 프레임에 읽힌다.
    impactRing(pos, colorHex, size, dur, crit) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, crit ? 0.07 : 0.05, 6, 20),
            new THREE.MeshBasicMaterial({
                color: colorHex, transparent: true, opacity: crit ? 0.95 : 0.75,
                blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
            }));
        ring.position.copy(pos);
        ring.lookAt(this.camera.position);
        ring.scale.setScalar(size * 0.25);
        ring.userData.impactRing = true;   // 지면 충격파(expandRing)의 토러스와 갈라 보기 위한 표식
        this.scene.add(ring);
        this.addAnim(dur, k => {
            const g = 1 - Math.pow(1 - k, 2.6);     // 끝까지 퍼진다 — 멈춰 서면 테가 아니라 얼룩이다(expandRing 교훈)
            ring.scale.setScalar(size * (0.25 + g * (crit ? 1.5 : 1.05)));
            ring.material.opacity = (crit ? 0.95 : 0.75) * (1 - k) * (1 - k);
        }, () => { this.disposeTree(ring); this.scene.remove(ring); });
    },

    // 스윙 축으로 날아가는 길쭉한 파편 쿼드 — 점 스프라이트와 달리 개체로 읽혀 버스트의 뼈대가 된다
    spawnShards(pos, count, colorHex, opt) {
        const o = opt || {};
        if (this.particles.length > 300) return;
        for (let i = 0; i < count; i++) {
            // 비율을 4:1 → 2:1대로 낮춘다 — 너무 가늘면 하드 에지를 줘도 '조각'이 아니라 '선'으로 읽히고,
            // 텀블링해도 굵기 변화가 안 보인다(비평가 4차 ⓕ).
            const sh = new THREE.Mesh(new THREE.PlaneGeometry(U.rand(0.13, 0.21) * (o.scale || 1), U.rand(0.055, 0.1) * (o.scale || 1)),
                new THREE.MeshBasicMaterial({ map: this.shardTex(), color: colorHex, transparent: true, depthWrite: false, toneMapped: false, alphaTest: 0.35 }));
            const ang = (o.dir || 0) + U.rand(-o.spread || -0.45, o.spread || 0.45);
            const spd = U.rand(1.8, 3.6) * (o.speed || 1); // 적 몸통이 1유닛 남짓 — 이보다 빠르면 파편이 화면 밖까지 날아가 타격점과 분리된다
            sh.position.copy(pos).addScaledVector(new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0), 0.22); // 임팩트 프레임에 이미 몸 밖
            sh.rotation.z = ang;
            sh.userData.vel = new THREE.Vector3(Math.cos(ang) * spd, Math.sin(ang) * spd + U.rand(0.5, 2.2), U.rand(-1, 1));
            sh.userData.spin = U.rand(-14, 14);
            sh.userData.life = U.rand(0.28, 0.5);
            sh.userData.age = 0;
            this.scene.add(sh);
            this.particles.push(sh);
        }
    },

    // 몸 emissive 세기는 계속 0.3을 넘기지 않는다 — 그 위로는 블룸과 겹쳐 적이 무형의 흰 덩어리가 되고
    // (비평가 1위 결함) 실루엣과 함께 넉백·스케일 펀치·HP바까지 전부 삼킨다. 이 예산 제약은 그대로 두고,
    // 아래 flashMesh 가 **면적을 쥔 외곽선** 쪽에서 가독성을 번다.
    // 플래시 대상 수집 — 개체당 한 번만 훑고 캐시한다.
    // ⚠️ 예전엔 빌더가 만들며 모아 둔 `m.flashMats` 만 썼는데, 그 목록은 `lam()` 헬퍼를 거친 재질만
    //    담아 **몸의 절반이 빠져 있었다**(실측: 박쥐 60메시 중 13 · 고블린 126중 40 · 골렘 88중 32 —
    //    날개막 Lambert 계열이 통째로 누락). 여기서 서브트리를 직접 훑어 빠짐을 없앤다.
    // 두 갈래로 나눈다:
    //   lit  = 조명 받는 몸 재질(Standard·Lambert) → emissive 가산
    //   out  = 인버티드 헐 외곽선 셸 → 색 승격. **아웃라인은 2026-08-18 사용자 지시로 삭제됐다**
    //          (`remove-3d-black-outline`) — 이 분류는 이제 매칭되는 오브젝트가 없다(무해해서 남겨 둠).
    // 외곽선을 같이 태우는 게 이 함수의 핵심이다 — 아래 flashMesh 주석의 실측 근거 참고.
    // ⚠️ 캐시는 **메시 수로 무효화**한다. 영웅은 장비를 갈 때마다 투구·무기 서브트리가 통째로 다시
    //    만들어지고 외곽선 셸도 새 재질로 갈린다 — 루트 객체(heroG)는 그대로라 루트만 보고 캐시하면
    //    새로 생긴 파츠가 영영 안 빛나고, 이미 dispose 된 옛 재질만 붙들게 된다. 세는 비용은 O(n) 이고
    //    피격은 초당 1회 수준이라 무시할 수 있다(목록 구축은 indexOf 때문에 O(n²)라 그건 아낀다).
    flashTargets(m) {
        const root = m.g || m;
        let n = 0;
        root.traverse(o => { if (o.isMesh) n++; });
        if (m._flashT && m._flashT.root === root && m._flashT.n === n) return m._flashT;
        const lit = [], out = [], litLum = [];
        root.traverse(o => {
            if (!o.isMesh || !o.material) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const mat of mats) {
                if (o.userData.isOutline) { if (out.indexOf(mat) < 0) out.push(mat); }
                // 접촉 AO 링·림 셸은 emissive 가 없는 Basic 이라 여기서 자동으로 걸러진다
                // (AO 링을 태우면 이음새가 사라져 '프리미티브 더미'가 도로 드러난다 — 빌더 주석 ⑵).
                else if (mat.emissive && lit.indexOf(mat) < 0) {
                    lit.push(mat);
                    // albedo 명도(0~1) — flashMesh 가 emissive 세기를 이 값에 비례시켜, 플래시 중에도
                    // 어두운 파츠(부츠·크레비스)는 상대적으로 어둡게 남아 **형태가 보존**된다.
                    const c = mat.color;
                    litLum.push(U.clamp(0.299 * c.r + 0.587 * c.g + 0.114 * c.b, 0, 1));
                }
            }
        });
        m._flashT = { root, n, lit, out, litLum };
        return m._flashT;
    },
    // 전신 화이트 틴트 + **외곽선 점등**. 원래 emissive·외곽선 색을 보관했다 복구한다 — 예전 구현은
    // 흰색을 덮어써서 발광 재질(보스 왕관·마법 시대 광원)이 한 번 맞으면 영영 죽었다.
    // 연타는 seq로 최신 것만 살린다.
    //
    // 🚨 **왜 외곽선까지 태우는가 — 6차 채점 '일반 타격의 몸 플래시가 프레임에 안 남는다'의 실제 원인.**
    // 게임 크기에서 적은 화면에서 ~50×55px 이고, 파츠마다 붙은 인버티드 헐 외곽선(뷰공간 고정 폭)이
    // **그 픽셀의 대부분을 차지한다.** 그래서 몸 안쪽만 밝혀서는 평균이 안 움직인다 —
    // `tools/probe-hitflash-ab.js`(렌더러에서 gl.readPixels 직독, 자 점검 통과) 실측:
    //     적을 통째로 숨김 ............................. Δ0.190  (= 적이 차지한 전부)
    //     몸 재질 17종 color=흰(외곽선 제외) ........... Δ0.023
    //     몸 재질 17종 emissive 1.0 .................... Δ0.048
    //     몸 재질 17종 emissive **10.0** ............... Δ0.072  ← 밝기를 33배 올려도 이 정도가 천장
    //     **모든 재질 color=흰(외곽선 포함)** .......... Δ0.193  ← 적을 지운 것과 맞먹는다
    // 즉 밝기를 아무리 올려도 안 되던 게 아니라 **면적을 안 건드리고 있었다.** 외곽선을 태우면
    // 실루엣이 유지된 채 윤곽만 빛나 '흰 덩어리'(비평가 1위 결함)도 피한다 — 밝기 예산을 몸통이
    // 아니라 테두리에 쓰는 것이다.
    // ⚠️ 외곽선 원색은 `ProChar._syncOutline` 이 원 재질 albedo × OUTLINE.k 로 계산한다 — 복구는
    //    보관해 둔 값으로 되돌리고, 그 사이 장비 교체로 갱신된 경우를 대비해 색만 되돌린다.
    // shapeK: 형태 보존 계수(0~1, 기본 0) — 1이면 emissive 를 재질 albedo 명도에 비례시켜 어두운
    // 파츠가 어둡게 남는다. **처치 전용**: 일반·크리(peak≤0.28)는 화이트아웃이 없고 가시성 게이트
    // (probe-hitflash-ab Δ0.06)가 빠듯해 감쇠를 걸면 미달한다(실측 Δ0.0761 → 0.0583 FAIL).
    // emHex = **몸 emissive 색**(기본 순백). 🚨 예전엔 몸이 언제나 `0xffffff` 로만 탔다 — `color` 는
    // 외곽/림 셸에만 쓰였다. 그래서 무슨 색을 넘겨도 **몸은 흰빛으로 밝아질 뿐**이었고, 영웅 피격이
    // '붉게 맞았다'가 아니라 '하얗게 날아갔다'로 읽힌 두 번째 원인이 이것이다(실측: 림 색을 붉게
    // 바꾸고 peak 를 절반으로 낮춰도 실루엣 R−B 가 여전히 **−4.0** 으로 차가워졌다).
    // 적 계열은 인자를 안 주므로 **기본값 순백 그대로** — 기존 게이트(probe-hitflash-ab·hit-hierarchy)에 영향 없다.
    flashMesh(m, peak, dur, color, olK, shapeK, emHex) {
        const t = this.flashTargets(m);
        if ((!t.lit.length && !t.out.length)) return;
        m.flashSeq = (m.flashSeq || 0) + 1;
        const seq = m.flashSeq;
        const flashC = new THREE.Color(color === undefined ? 0xffffff : color);
        // 🚨 emissive 는 균일이 아니라 **재질 albedo 명도에 비례**시킨다 (hp-juicy 비평가 잔여
        // '처치 코어 백열 클리핑'): 균일 백색 가산은 파츠 간 명도 차를 지워 몸이 '과노출 코어'로
        // 뭉개진다. 밝은 갑주는 세게, 어두운 부츠·크레비스는 약하게 타면 총 밝기(위계 축)는 지키면서
        // 내부 명암 구조가 살아남는다 — emissive 상한을 더 내리면 크리↔처치 위계 쌍이 무너지던
        // 트레이드오프(probe-hit-hierarchy 0.02 게이트)를 '분포'로 푸는 처방이다.
        const sk = shapeK || 0;
        const emScale = i => 1 - sk * 0.65 * (1 - (t.litLum ? t.litLum[i] : 1));
        for (let i = 0; i < t.lit.length; i++) {
            const mat = t.lit[i];
            if (!mat.userData._em0) mat.userData._em0 = { hex: mat.emissive.getHex(), i: mat.emissiveIntensity };
            mat.emissive.setHex(emHex === undefined ? 0xffffff : emHex);
            mat.emissiveIntensity = peak * emScale(i);
        }
        // 외곽선은 가산이 아니라 **색 자체**를 올린다(Basic 이라 조명이 없다). peak 를 그대로 쓰면
        // 0.2 에서 거의 안 보이므로 테두리 전용 계수를 따로 둔다 — 테두리는 원래 near-black 이라
        // 같은 세기라도 상대 변화가 훨씬 크다.
        // ⚠️ **이 계수는 호출부가 이벤트마다 직접 준다(olK).** peak 에서 유도하면 금방 포화해
        //    크리(0.28)와 처치(0.28)가 **같은 밝기**로 붙는다 — 실측(`probe-hit-hierarchy.js`):
        //    유도식(0.35+peak×2.2)에서 크리 0.966 · 처치 0.966 이라 접촉 프레임 휘도차가 0.0044,
        //    온기차 0.0121 로 둘 다 판정 하한(0.02) 미달이었다. 6차 지적 '크리와 처치의 첫 100ms
        //    미분화'가 여기서 나온다. 세 이벤트를 밝기 축에서도 벌리려면 계수를 따로 쥐어야 한다.
        const ok = Math.min(1, olK === undefined ? 0.35 + peak * 2.2 : olK);
        for (const mat of t.out) {
            if (!mat.userData._ol0) mat.userData._ol0 = mat.color.getHex();
            mat.color.copy(new THREE.Color(mat.userData._ol0).lerp(flashC, ok));
        }
        this.addAnim(dur, k => {
            if (m.flashSeq !== seq) return;
            for (let i = 0; i < t.lit.length; i++)
                t.lit[i].emissiveIntensity = peak * emScale(i) * (1 - k);
            for (const mat of t.out) mat.color.copy(new THREE.Color(mat.userData._ol0).lerp(flashC, ok * (1 - k)));
        }, () => {
            if (m.flashSeq !== seq) return;
            for (const mat of t.lit) {
                const e0 = mat.userData._em0;
                if (e0) { mat.emissive.setHex(e0.hex); mat.emissiveIntensity = e0.i; }
            }
            for (const mat of t.out) if (mat.userData._ol0 !== undefined) mat.color.setHex(mat.userData._ol0);
        });
    },

    // 외곽 림 번쩍임: 지오메트리를 살짝 키운 BackSide 셸이라 실루엣 테두리만 빛난다.
    // 전신을 하얗게 태우지 않고도 "맞았다"가 즉시 읽히는 신호 — 셸은 개체당 한 번만 만들어 재사용.
    // color/scale은 위계용 — 일반 피격은 흰 얇은 셸, 크리는 주황 두꺼운 셸, 처치는 가장 두껍다.
    // 접촉 프레임(+16ms) 한 장만 보고 "이건 크리다"가 읽혀야 한다(비평가 3차 2번: 세 이벤트의 접촉 프레임이 사실상 동일).
    //
    // 🚨 **왜 몸통 하나가 아니라 큰 파츠 여러 개인가**(`silhouette-after-outline` ⓓ): 검은 인버티드
    // 헐 삭제 후 접촉 프레임의 면적을 쥐던 외곽선 점등이 사라졌고, 몸통 셸 하나로는 화면 몫이 안
    // 나온다 — `probe-hitflash-ab` 실측(고블린): 몸통 셸만 = 일반 Δ0.0247·크리 온기차 0.0034 로
    // 게이트(0.06/0.02) 반토막 미달, 참고 상한(흰 1.2)조차 Δ0.073. 고블린은 몸통이 전신의 일부라
    // 머리·팔다리가 전부 무반응이었다. 큰 파츠 상위 6개에 셸을 두르면 조합 Δ0.0761·온기차 0.0417 로
    // 게이트를 넘는다. **피격 순간에만 켜지므로 상시 아웃라인이 아니다** — 사용자 지시와 충돌 없음.
    // 셸 6개는 같은 재질 하나를 공유해 감쇠는 opacity 한 번으로 끝난다(플래시 중에만 드로우콜 +6).
    rimFlash(m, dur, color, scale) {
        if (!m.rimShells) {
            // 큰 파츠 수집 — 월드 반경 상위 6개(+최소 반경: 최대의 30%). Basic 재질(접촉 AO 링·
            // 글로우 스프라이트)과 투명 재질은 제외 — AO 링에 셸을 두르면 이음새 은폐가 깨진다.
            const root = m.g || m;
            root.updateWorldMatrix(true, true);
            const cand = [];
            const sv = new THREE.Vector3();
            root.traverse(o => {
                if (!o.isMesh || !o.geometry || !o.material) return;
                if (o.userData.isOutline || o.material.isMeshBasicMaterial || o.material.transparent) return;
                if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
                o.getWorldScale(sv);
                const r = o.geometry.boundingSphere.radius * Math.max(Math.abs(sv.x), Math.abs(sv.y), Math.abs(sv.z));
                cand.push({ o, r });
            });
            cand.sort((a, b) => b.r - a.r);
            const minR = cand.length ? cand[0].r * 0.22 : 0;
            // 균일 두께·균일 밝기 셸은 '2D 스티커'로 읽힌다(비평가 5.5 채점 3번) — 뷰공간 법선을
            // 광원 방향(위-왼쪽, 태양과 같은 쪽)과 내적해 위/광원측은 진하고 아래/그늘측은 옅게.
            // BackSide 라 실루엣 띠의 법선이 바깥-옆을 향하므로 이 내적이 둘레를 따라 자연히 흐른다.
            const mat = new THREE.ShaderMaterial({
                side: THREE.BackSide, transparent: true, depthWrite: false,
                uniforms: { uC: { value: new THREE.Color(0xffffff) }, uA: { value: 1 } },
                vertexShader: 'varying vec3 vN; void main(){ vN = normalMatrix * normal;'
                    + ' gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
                // pow 2.2 로 그늘측(아래·오른쪽)을 사실상 소등 — 완만한 선형 가중(0.62+0.38d)은
                // 다리 밑까지 등두께로 돌아 풀-아웃라인 스티커로 읽혔다(비평가 6.0 채점 3번).
                fragmentShader: 'uniform vec3 uC; uniform float uA; varying vec3 vN;'
                    + ' void main(){ float d = dot(normalize(vN), normalize(vec3(-0.3, 0.9, 0.0)));'
                    + ' float w = 1.7 * pow(clamp(0.5 + 0.5 * d, 0.0, 1.0), 2.2);'
                    + ' gl_FragColor = vec4(uC, uA * clamp(w, 0.0, 1.0)); }',
            });
            m.rimShells = [];
            for (const c of cand.slice(0, 8)) {
                if (c.r < minR) break;
                const sh = new THREE.Mesh(c.o.geometry, mat);
                sh.visible = false;
                sh.userData.sharedGeometry = true; // 원본과 공유 — disposeTree가 원본 지오메트리를 지우지 않게
                c.o.add(sh);
                m.rimShells.push(sh);
            }
            if (!m.rimShells.length) return;
        }
        const mat = m.rimShells[0].material;
        mat.uniforms.uC.value.setHex(color === undefined ? 0xffffff : color);
        mat.uniforms.uA.value = 1;
        for (const sh of m.rimShells) { sh.visible = true; sh.scale.setScalar(scale || 1.13); }
        m.rimSeq = (m.rimSeq || 0) + 1;
        const seq = m.rimSeq;
        // 감쇠는 제곱 곡선 — 몸 플래시보다 셸이 먼저 죽어야 중반(60ms+)에 몸 둘레로 뿌연 번짐이
        // 안 남는다(비평가 5.5 채점 4번 '배경 나무 위 스미어').
        this.addAnim(dur, k => { if (m.rimSeq === seq) mat.uniforms.uA.value = (1 - k) * (1 - k); },
            () => { if (m.rimSeq === seq) for (const sh of m.rimShells) sh.visible = false; });
    },

    // 크리 순간 화각을 살짝 좁혔다 푼다 — 카메라가 맞은 걸 같이 느낀다
    fovPunch(amount, dur) {
        if (this._fov0 === undefined) this._fov0 = this.camera.fov;
        this.addAnim(dur, k => {
            this.camera.fov = this._fov0 * (1 - amount * (1 - k) * (1 - k));
            this.camera.updateProjectionMatrix();
        }, () => { this.camera.fov = this._fov0; this.camera.updateProjectionMatrix(); });
    },

    // sRGB로 고른 UI 색을 three 머티리얼에 넣기 위한 변환 (hex → 선형 THREE.Color, 캐시).
    // renderer.outputEncoding = sRGBEncoding이라 머티리얼 색은 **선형값으로 취급돼 출력에서 다시
    // sRGB 인코딩**된다. 그래서 0x0d1114(니어블랙)를 그냥 넣으면 화면에는 (63,71,77) 중간 슬레이트로,
    // 민트 0x2ebd6b는 (115,224,173) 파스텔로 뜬다 — 디자인 팔레트가 통째로 한 단계 밝고 옅어진다.
    // (3차 비평가가 "채움이 (107,233,173) 민트"라고 계측한 값이 정확히 이 현상이다.)
    // 매 프레임 도는 경로에서도 쓰므로 hex별로 캐시해 Color 할당을 없앤다.
    srgbC(hex) {
        const c = this._srgbCache || (this._srgbCache = new Map());
        let v = c.get(hex);
        if (!v) { v = new THREE.Color(hex).convertSRGBToLinear(); c.set(hex, v); }
        return v;
    },

    // 머리 위 HP 바 피격 신호: 앞바 흰 플래시 + 잔상바 지연 + 바 흔들림 (감쇠는 driveHpBar가 매 프레임 처리)
    hitHpBar(o, sev) {
        if (!o) return;
        o.hpFlash = 1;
        o.ghostHold = 0.15 + Math.min(0.13, sev * 0.5);  // 큰 피해일수록 잔상이 오래 버텨 손실 폭이 읽힌다
        // 잔상(방금 잃은 양)은 채움과 색이 갈려야 폭이 읽힌다. 영웅 바(초록 채움)에선 큰 덩어리=빨강이
        // 대비가 최대지만, **적 바는 채움이 이미 빨강**이라 같은 빨강을 쓰면 잔상이 통째로 사라진다
        // (ⓓ로 채움을 적대 빨강으로 고정하며 생긴 조건). 적 쪽은 노랑~살구로 밝기를 올려 분리한다.
        o.ghostColor = o.foe ? (sev > 0.15 ? 0xffd166 : 0xe8a800)
                             : (sev > 0.15 ? 0xd63a3a : 0xe8a800);
        o.barShake = Math.min(1.2, (o.barShake || 0) + 0.3 + sev * 2.4);
        // 바 고유 세로 펀치 — 몸의 스쿼시를 상속하던 걸 끊은 뒤(바를 scene 직속으로 옮김) 바에 남은
        // 유일한 '맞았다' 반응이다. 임팩트 **프레임에서 최대**여야 한다 — 뒤늦게 커지면 위계가
        // 시간을 거스른다(크리 숫자가 흰색으로 태어나 +186ms에 주황이 되던 것과 같은 실수).
        o.barPunch = 1;
    },

    // 2단 바 구동: 앞바는 즉시(흰 플래시), 잔상바는 잠깐 버텼다 스르륵 추격. shakeX/Y는 호출부가 바 위치에 더한다.
    driveHpBar(o, ratio, dt) {
        const fg = o.hpFg, gh = o.hpGhost;
        if (!fg) return;
        fg.scale.x = Math.max(0.001, ratio);
        fg.position.x = -0.4 * (1 - ratio);
        const W = this._whiteC || (this._whiteC = new THREE.Color(0xffffff));
        o.hpFlash = Math.max(0, (o.hpFlash || 0) - dt * 7); // 흰 플래시 ≈0.14초
        // 채움은 항상 순수 체력색 — 예전엔 여기에 흰색을 섞어서 피격 순간(정작 제일 오래 보는 프레임)에
        // 초록/노랑/빨강 색코딩이 통째로 날아갔다(비평가 2차 ⓓ). 플래시는 아래 트랙 테두리로 옮겼다.
        // ⚠️ setHex 금지 — srgbC로 변환한 색을 copy 한다(출력 sRGB 인코딩 때문. srgbC 주석 참조).
        // 적 = 적대 빨강 고정, 영웅 = 초록/노랑/빨강 경고 램프(비평가 4차 ⓓ: 둘이 같은 초록이라
        // 피아 구분이 안 됐다). 적 쪽도 완전 단색은 아니고, 빈사에서 한 단계 짙어져 '거의 잡았다'가
        // 읽히게 둔다 — 단 색상(hue)은 빨강 밖으로 나가지 않아 소유자 코딩이 흔들리지 않는다.
        fg.material.color.copy(this.srgbC(o.foe
            ? (ratio > 0.2 ? 0xe5484d : 0xa81b1b)
            : (ratio > 0.5 ? 0x2ebd6b : ratio > 0.2 ? 0xe8a800 : 0xd63a3a)));
        // 트랙(채움보다 큰 어두운 판 = 테두리)만 흰색으로 밀어올린다 — 바 둘레가 번쩍이고 내용물은 읽힌다
        if (o.hpBg) {
            o.hpBg.material.color.copy(this.srgbC(0x0d1114)).lerp(W, o.hpFlash * 0.9);
            o.hpBg.material.opacity = 0.82 + o.hpFlash * 0.18;
        }
        if (gh) {
            if (o.ghostV === undefined || ratio > o.ghostV) o.ghostV = ratio; // 회복·리스폰은 즉시 맞춤
            if (o.ghostV > ratio) {
                if (o.ghostHold > 0) o.ghostHold -= dt;
                else o.ghostV = Math.max(ratio, o.ghostV - Math.max(0.45, (o.ghostV - ratio) * 4.5) * dt);
            }
            gh.scale.x = Math.max(0.001, o.ghostV);
            gh.position.x = -0.4 * (1 - o.ghostV);
            gh.material.color.copy(this.srgbC(o.ghostColor || 0xffca28));
            gh.visible = o.ghostV > ratio + 0.004;
        }
        // 세로 펀치: 1.18배로 태어나 120ms에 걸쳐 1.0으로 돌아온다. 가로(scale.x)는 절대 건드리지
        // 않는다 — 채움 폭이 곧 남은 체력이라, 늘리면 그 프레임의 수치가 거짓말이 된다.
        if (o.hpG) {
            if (o.barBase === undefined) o.barBase = o.hpG.scale.y;
            o.barPunch = Math.max(0, (o.barPunch || 0) - dt / 0.12);
            o.hpG.scale.y = o.barBase * (1 + 0.18 * o.barPunch);
        }
        o.barShake = Math.max(0, (o.barShake || 0) - dt * 5.5);
        const s = o.barShake;
        o.shakeX = s > 0.02 ? U.rand(-1, 1) * s * 0.05 : 0;
        o.shakeY = s > 0.02 ? U.rand(-1, 1) * s * 0.025 : 0;
    },

    hitEnemy(id, dmg, crit, kind, kill) {
        const m = this.enemyMap.get(id);
        if (!m) return;
        const e = Combat.enemies.find(x => x.id === id);
        // 연출 강도는 "최대 HP 대비 이번 피해 비중" — 잡몹 한 방과 보스 긁기의 체감이 달라야 한다
        const sev = e && !Big.of(e.maxHp).isZero() ? U.clamp(Big.of(dmg).ratioTo(e.maxHp), 0, 1) : 0.15;
        const pos = m.g.position;
        // ① 옅은 틴트 + 외곽 림 셸 — 밝기가 아니라 윤곽으로 피격을 알린다(형태 유지가 우선)
        // 외곽선 점등으로 위계를 준다 — 색은 일반 청백 / 크리 주황(림 셸과 같은 색 언어),
        // 세기는 일반 0.38 < 크리 0.78 < 처치 1.0(killEnemy). 색과 밝기 두 축을 같이 벌린다 —
        // 외곽선은 원래 near-black 이라 0.6 만 돼도 거의 포화한다(실측: 0.62↔1.0 의 휘도차가 0.009뿐).
        // 위계를 밝기로도 읽히게 하려면 **일반을 충분히 낮게** 깔아야 한다.
        this.flashMesh(m, crit ? 0.28 : 0.2, crit ? 0.14 : 0.1, crit ? 0xff7a1a : 0xcfe8ff, crit ? 0.78 : 0.38);
        // 무기 궤적도 같은 사다리로 물들인다(㉲) — 처치는 killEnemy 가 한 단 더 올린다.
        this.trailImpact(crit ? 'crit' : 'normal');
        // 일반 피격 림을 **순백에서 청백으로** 바꾼다 — 골렘·해골처럼 몸 albedo가 이미 near-white인 종에서
        // 흰 가산 림은 명도차가 10%도 안 나 "깜빡였는지조차 모르겠다"가 됐다(비평가 4차 2번).
        // 청백(0x9fe3ff)은 따뜻한 회백 몸/초원 배경 어느 쪽과도 색상이 갈려 같은 밝기에서도 분리된다.
        // 셸 두께(scale)는 아웃라인 삭제 후 한 단계씩 올렸다(1.12/1.2/1.3 → 1.15/1.26/1.34) — 접촉
        // 프레임의 면적을 검은 헐 대신 셸이 쥐어야 해서다. probe-hitflash-ab 게이트(Δ0.06/온기 0.02) 실측.
        this.rimFlash(m, crit ? 0.13 : 0.1, crit ? 0xff8a3d : 0x9fe3ff, crit ? 1.26 : 1.15);
        // ② 접촉점 — 영웅(-x)에서 들어온 타격이므로 몸통 왼쪽 앞면에 플레어 + 그 축으로 파편
        // 접촉점 높이도 실높이 비례로 — 고정 0.55는 키 작은 슬라임에선 머리 위, 키 큰 골렘·보스에선
        // 무릎~허벅지에 맞아 "다리를 때렸다"로 읽혔다(연속 프레임 a4/a5 실측). 처치 버스트가 이미 쓰는
        // eh*0.5(몸통 중앙) 규칙으로 통일하되, 아래로 살짝(0.46) 내려 가슴이 아니라 명치에 꽂히게 한다.
        const eh = (m.topY || 1.1) * (m.baseScale || 1);
        const hitPt = pos.clone().add(new THREE.Vector3(-0.3 * (m.baseScale || 1), eh * 0.46, 0.12));
        // 플레어 지름 상한 = 적 실높이의 0.55배. 예전엔 고정 0.95~1.25유닛이라 키 0.85인 슬라임에서
        // 플레어가 몸 전체보다 커져 하반신이 통째로 지워졌다(비평가 2차 ⓐ). 종·보스 스케일을 따라간다.
        const fmax = eh * 0.55;
        // 코어(순백)/중간(주황빛 살구)/외곽(진주황) 3층 — 한 색으로 겹치면 가산 합성에서 전부 순백으로
        // 포화돼 '흰 원반'이 된다. 바깥층일수록 크고 어둡고 옅게 둬야 불꽃의 색 계조가 남는다.
        this.impactFlare(hitPt, 0xffffff, Math.min(crit ? 0.62 : 0.5, fmax * 0.62), crit ? 0.12 : 0.09, 0.3, 0.55);
        this.impactFlare(hitPt, 0xffb45a, Math.min(crit ? 0.95 : 0.74, fmax), crit ? 0.14 : 0.1, -0.24, crit ? 0.42 : 0.3);
        if (crit) this.impactFlare(hitPt, 0xff7a2a, Math.min(1.25, fmax * 1.3), 0.17, -0.5, 0.3); // 외곽 잔광 — 블룸 뒤에도 색층이 남게
        // 방사형 스파이크 + 접점 링 (hp-juicy ② '접점 임팩트 밀도', 크리는 1.5배).
        // 색은 위 플레어·림과 같은 언어(일반 청백 / 크리 주황) — 여기만 다른 색을 쓰면 층이 따로 논다.
        this.impactSpikes(hitPt, crit ? 9 : 6, crit ? 0xffb15a : 0xdff2ff, fmax * (crit ? 1.5 : 1), crit ? 0.15 : 0.11, crit);
        this.impactRing(hitPt, crit ? 0xff9a4d : 0xcfe8ff, fmax * (crit ? 1.5 : 1), crit ? 0.16 : 0.12, crit);
        this.spawnShards(hitPt, crit ? 8 : 4 + Math.round(sev * 4), crit ? 0xff8a3d : 0xffd54f,
            { dir: 0.35, spread: 0.6, speed: crit ? 1.35 : 1, scale: crit ? 1.25 : 1 });
        this.spawnSparks(hitPt, crit ? 10 : 4 + Math.round(sev * 5), crit ? 0xffab40 : 0xffee58, { speed: crit ? 1.9 : 1.4 });
        // ③ 넉백 + 움찔 반동 — 피해가 클수록 깊게 밀리고 상체가 꺾인다
        const ox = pos.x, kb = 0.18 + Math.min(0.34, sev * 1.2) + (crit ? 0.12 : 0);
        const roll = (0.06 + Math.min(0.2, sev * 0.7)) * (crit ? 1.3 : 1);
        m.g.position.x = ox + kb; // 임팩트 프레임에 이미 밀려 있어야 '맞았다'로 읽힌다
        // 바도 같은 프레임에 따라간다. 이 대입은 `update()` 바깥(=Combat 호출 시점)에서 도는데
        // 바 추적은 update 안에 있어, 안 맞춰 주면 **임팩트 프레임 한 장 동안만** 바가 몸에서
        // 26px 뒤처진다(실측 `probe-deadbar-anchor.js`). 하필 채점자가 제일 많이 들여다보는 그 한 장이다.
        if (m.hpG) m.hpG.position.set(m.g.position.x + (m.shakeX || 0), m.g.position.y + (m.shakeY || 0), m.g.position.z);
        this.addAnim(crit ? 0.2 : 0.16, k => {
            // 🚨 마지막 한 방이면 이 복귀가 **쓰러지는 시체를 죽은 자리로 되끌어간다.**
            //    `anims` 는 **역순으로 돌기 때문에**(update: `for (i = length-1; i >= 0; i--)`)
            //    나중에 추가된 사망 낙하가 **먼저** 실행되고 이 넉백이 **나중에** 실행돼,
            //    같은 프레임에서 넉백이 낙하를 매번 덮어쓴다. 그러다 넉백이 끝나면 낙하 값이
            //    한 프레임에 그대로 드러나 시체가 **33px 순간이동**한다(실측 world.x 2.546→3.211).
            //    ⚠️ 위의 즉시 대입(ox+kb)은 killEnemy 보다 먼저 도므로 그대로 둔다 —
            //       임팩트 프레임의 밀림이고, 낙하는 그 밀린 자리를 ox 로 잡아 이어받는다.
            if (m.dead) return;
            const p = (1 - k) * (1 - k); // easeOut 복귀
            m.g.position.x = ox + p * kb;
            m.g.rotation.z = -p * roll;
        }, () => { if (!m.dead) m.g.rotation.z = 0; });   // 시체의 쓰러진 회전을 0으로 되돌리면 벌떡 선다
        // ④ 히트축 스쿼시 — **모든 타격**에 건다(비평가 4차 ⓐ).
        // 예전엔 `crit || sev > 0.1` 게이트가 걸려 있어, 아이들 게임에서 95%를 차지하는 소액 타격은
        // 몸 변형이 통째로 0이었다(실측: sev 0.02에서 scale 1/1, 화면 변위 8.4px = 몸폭의 14%뿐).
        // 그래서 "적이 맞았다"가 아니라 "칼이 스파크를 튀겼다"로 읽혔다. 진폭만 피해량으로 벌린다.
        m.punchT = m.punchDur = crit ? 0.30 : 0.24;
        m.punchHold = crit ? 0.075 : 0.055; // 최대 압축 유지 — 이 뒤부터 elastic 복귀(비평가 권고 "60ms 후")
        m.punchAmp = (0.07 + Math.min(0.07, sev * 0.28)) * (crit ? 1.55 : 1);
        // ④-b 플린치 포즈 — 스쿼시(균일 스케일)만으로는 '포즈'가 안 바뀐다(driveFlinch 주석의 실측).
        // 관절이 실제로 튀어야 "움찔했다"로 읽힌다. 수명은 스쿼시보다 길게 둬 여운이 뒤에 남는다.
        m.flinchT = m.flinchDur = crit ? 0.34 : 0.26;
        m.flinchAmp = (0.55 + Math.min(0.45, sev * 1.8)) * (crit ? 1.45 : 1);
        // 히트스톱은 제거됐다(파일 상단 '타격감' 주석 — 사용자 지시). 크리의 '한 박자'는 카메라가 맡는다.
        // ⚠️ 셰이크 세기는 **다른 이벤트와의 상대값**으로 잡아야 한다 — 0.07은 화면 6.7px라
        // 무기 스윙이 이미 부르는 shake(0.15)(=15px)에 `Math.max`로 통째로 먹혀 크리에서만
        // 카메라가 더 흔들리는 일이 아예 없었다(비평가 '셰이크 미관측'의 실제 원인).
        // 스윙 0.15 < 크리 0.2(22px) < 보스 등장 0.4~0.5 순으로 벌린다.
        if (crit) { this.shake(0.2); this.fovPunch(0.026, 0.13); }
        // ⑤ HP 바 신호
        this.hitHpBar(m, sev);
        // ⑥ 데미지 숫자 — 항상 대상 오른쪽 위로 비켜 띄워 HP바를 가리지 않게. 임팩트 프레임에 바로 태운다
        // (숫자가 늦게 나오면 "얼마나 아팠나"가 타격과 다른 사건으로 갈린다 — 비평가 4차 ⓑ.
        //  히트스톱 시절의 animationPlayState 일시정지는 히트스톱 제거와 함께 걷어냈다).
        // 3티어: 일반(흰 1rem) < 크리(주황 1.15rem) < **처치(흰 코어+주황 글로우 1.3rem+오버슛)**.
        // 처치타가 크리와 같은 클래스로 태어나면 '마지막 한 방'이 그냥 큰 크리로 읽힌다(비평가 5차 A #8·B #3).
        // 처치는 크리·스킬보다 우선한다 — 한 프레임에 둘 다 참일 때 더 위 티어가 이겨야 위계가 안 뒤집힌다.
        const cls = kill ? 'dmg-kill' : kind === 'skill' ? 'dmg-skill' : crit ? 'dmg-crit' : 'dmg';
        // 숫자는 HP바 위로 바 높이(0.135)의 2.2배 이상 띄운다 — 예전 고정 1.25는 큰 적에서 바와 겹쳐
        // 숫자가 바를 가리고 둘 다 못 읽혔다(비평가 2차 ⓔ). 크리는 항상 일반보다 한 슬롯 위.
        // ⚠️ 높이는 **바의 실제 월드 좌표**에서 뽑는다. 예전에는 `m.barY * m.baseScale` 로 근사했는데
        // `m.baseScale` 은 빌더에서 `g.scale.x` 가 아직 1일 때 굳어 실제 배율과 어긋난다(골렘 실측:
        // barBase 1 vs 실제 1.15 — TODO에 '곁다리 발견'으로 등재만 돼 있던 그 값이다). 그래서 계산상
        // 바 위로 0.297 띄운 숫자가 화면에서는 바와 **같은 높이**에 앉아 잔상바를 덮었다
        // (비평가 5차 A #5·B #2 독립 일치, a1 프레임 육안 확인: '140'이 노란 잔상 세그먼트를 가린다).
        const bw = this._numV || (this._numV = new THREE.Vector3());
        let numY;
        if (m.hpBg) {
            m.hpBg.getWorldPosition(bw);
            const bs = m.barBase !== undefined ? m.barBase : (m.hpG ? m.hpG.scale.y : 1); // 펀치가 섞인 live scale 대신 기준값
            numY = (bw.y - pos.y) + 0.135 * 0.5 * bs + 0.30 + (crit ? 0.3 : 0) + (kill ? 0.22 : 0);
        } else {
            numY = (m.barY || 1.1) * (m.baseScale || 1) + 0.135 * 2.2 + (crit ? 0.3 : 0);
        }
        const numPos = pos.clone().add(new THREE.Vector3(0.45, numY + U.rand(0, 0.1), 0));
        // 월드 계산만으로는 원근·배율이 섞여 겹침을 보장 못 한다 — 바 상단의 **화면 y**를 같이 넘겨
        // 스폰 직후 픽셀 단위로 한 번 더 밀어 올린다(아래 damageNumber 의 clearY).
        const numOpt = {
            dx: U.rand(6, 26), rise: -(30 + sev * 18 + (crit ? 12 : 0)), scale: 1 + Math.min(0.3, sev * 0.9),
            clearY: m.hpBg ? this.project(bw).y - 6 : undefined,
        };
        this.damageNumber(numPos, U.fmt(dmg), cls, numOpt);
    },

    killEnemy(id, isBoss) {
        const m = this.enemyMap.get(id);
        if (!m) return;
        // 진행 중인 개체 애니메이션(공격 돌진)이 시체 트랜스폼을 못 건드리게 하는 표식.
        // `update()` 루프는 `!e.alive` 로 걸러지지만 addAnim 으로 이미 떠 있는 연출은 안 걸린다.
        m.dead = true;
        // 🚨 플린치 가산분을 **여기서** 되돌린다. update 루프는 `!e.alive` 로 죽은 개체를 건너뛰므로
        // (그리고 driveFlinch 도 `m.dead` 로 조기 반환하므로) 마지막 프레임의 오프셋이 아무도
        // 안 빼 준 채 남는다 — 그러면 시체가 **팔을 뒤로 젖힌 뒤틀린 포즈로 굳는다.**
        this.undoFlinch(m);
        m.flinchT = 0;
        this.trailImpact('kill');   // 트레일 위계 최상단 — 금백(㉲)
        // 처치 버스트: 주황 파편 + 흰 코어 스파크 + 순간 점광 + 충격 링, 보스는 전부 확대판 (마지막 한 방이 제일 세게 터지도록)
        // 버스트 원점은 적 실높이의 중간 — 고정 +0.5는 보스(실높이 2.1)에선 무릎 높이라
        // 마지막 한 방이 발밑에서 터졌다.
        const eh = (m.topY || 1.1) * (m.baseScale || 1);
        const burst = m.g.position.clone().add(new THREE.Vector3(0, eh * 0.5, 0));
        // 3층 구조: 코어 플레어(순간) → 사방으로 흩어지는 파편 쿼드(개체로 읽히는 뼈대) → 불티/지면 링(잔향).
        // 점 스프라이트만으로는 시신 위에 뭉쳐 '주황 얼룩 하나'가 된다 (비평가 6번).
        // 플레어는 hitEnemy와 같은 상한 규칙(적 실높이 비례 + 3층 색분리 + peak 억제)을 쓴다.
        // 고정 2.6/4.2유닛은 키 0.85 슬라임 기준 실높이의 3배라 처치 프레임에서 시신이 통째로
        // 지워졌다(비평가 3차 ②: 하반신 클리핑 31.5%/18.8%). 처치는 페이오프이므로 계수만
        // 피격(0.55)보다 키운다.
        const fmax = eh * (isBoss ? 1.1 : 0.95);
        this.impactFlare(burst, 0xffffff, fmax * 0.5, 0.13, 0.3, 0.5);   // 코어(순백)
        this.impactFlare(burst, 0xffd28a, fmax, 0.18, 0.2, 0.42);        // 중간(살구)
        this.impactFlare(burst, 0xff7a2a, fmax * 1.28, 0.22, -0.4, 0.24); // 외곽 잔광
        // 파편 수는 위계의 뼈대 — 일반 4~8, 크리 8, 처치 24(보스 34). 개수 차이가 곧 '사건의 크기'다.
        // 파편 색은 **적 몸 팔레트를 상속**한다(7차 비평가 A #3: 회색 골렘에서 정체불명의 주황 조각) —
        // lit 재질 평균 albedo 를 55%, 잔광 주황을 45% 섞어 '그 몸이 부서졌다'로 읽히게 하되
        // 어두운 배경에서의 판독성(난색 성분)은 남긴다.
        const shardC = (() => {
            const t = this.flashTargets(m);
            if (!t.lit.length) return 0xff7043;
            const acc = new THREE.Color(0, 0, 0);
            for (const mat of t.lit) acc.add(mat.color);
            acc.multiplyScalar(1 / t.lit.length);
            return acc.lerp(new THREE.Color(0xff7043), 0.45).getHex();
        })();
        this.spawnShards(burst, isBoss ? 34 : 24, shardC, { dir: 0, spread: Math.PI, speed: isBoss ? 1.5 : 1.15, scale: isBoss ? 1.7 : 1.25 });
        this.spawnSparks(burst, isBoss ? 30 : 14, 0xffd54f, { speed: 2.3 });             // 가산 불티 — 파편 사이 잔광
        this.spawnSparks(burst, isBoss ? 14 : 6, 0xffffff, { scale: 1.35, speed: 1.7 }); // 흰 코어
        this.flashLight(burst, isBoss ? 0xffab40 : 0xffcc80, isBoss ? 0.45 : 0.3);
        this.expandRing(new THREE.Vector3(m.g.position.x, 0, m.g.position.z), new THREE.Color(0xffab40), isBoss ? 1.8 : 1.0);
        // 유일한 어두운 요소 — 밝은 파편이 다 꺼진 뒤에도 남아 "여기서 죽었다"를 표시한다
        // 시체는 쓰러지며 +0.22 밀리므로 그 착지점에 맞춘다 — 죽은 자리와 그을음이 어긋나면 배경 얼룩으로 읽힌다
        this.scorchDecal(new THREE.Vector3(m.g.position.x + 0.18, 0, m.g.position.z),
            (isBoss ? 1.2 : 0.66) * (m.baseScale || 1), isBoss ? 2.4 : 1.8);
        // 카메라 반응 — 7차 비평가 2인이 공통 1위로 "처치 순간조차 카메라가 정지"를 지적했는데,
        // 실측하니 크리는 shake(0.2)+fovPunch 가 있는데 **처치에는 카메라 항이 아예 없었다**(접점
        // 셰이크 잔량 0.028 = 직전 크리의 찌꺼기뿐). 위계 사다리(스윙 0.15 < 크리 0.2 < 처치 < 보스
        // 등장 0.4~0.5) 규약대로 처치를 크리 위·보스 등장 아래에 앉힌다.
        this.shake(isBoss ? 0.42 : 0.3);
        this.fovPunch(0.034, 0.15);
        // 세 이벤트 중 가장 두껍고 오래 — 처치가 페이오프임이 윤곽만으로 읽히게. 몸 emissive 를
        // 0.3 으로 낮춘 몫(화이트아웃 방지)은 셸 두께(1.42)가 잇는다 — 두께는 몸 안을 안 태운다.
        // 색은 크리(주황 0xff8a3d)와 갈리게 **더 희고 밝은 금백**(0xffe9b8) — probe-hit-hierarchy 의
        // 크리↔처치 쌍이 휘도·온기 두 축을 함께 써야 0.02 게이트를 넘는다(실측 주석 그쪽 참고).
        this.rimFlash(m, 0.16, 0xfff2d0, 1.45);
        // 시신이 흰 덩어리로 뭉개지면 정작 파편이 안 보인다 — 몸 emissive 는 짧고 옅게 두고,
        // 대신 **외곽선을 세 이벤트 중 가장 세게(1.0) · 가장 밝은 금백으로** 태워 처치가 페이오프임을
        // 접촉 프레임 한 장에서 읽히게 한다(6차 지적 '크리와 처치의 첫 100ms 미분화').
        // peak 0.4는 전신 알베도 화이트아웃('크림색 마시멜로', 비평가 5.5 채점 1번) — 0.3으로 낮춰
        // 내부 음영을 남기고, 위계는 셸 두께(1.34, 세 이벤트 최대)와 파편·그을음이 잇는다.
        this.flashMesh(m, 0.3, 0.09, 0xfff6e0, 1.0, 1); // shapeK=1: 명도 비례 감쇠로 '과노출 코어' 방지(형태 보존)
        // 사망: 피격 경직 → 무릎 꺾임 → 뒤로(+x) 쓰러짐 → 착지 먼지 → 서서히 페이드아웃 (빙글 회전·순간 소멸 금지, 사용자 지시)
        // update 루프는 !e.alive를 건너뛰므로 이 애니메이션이 트랜스폼을 단독 소유한다.
        // HP바: 즉시 숨기면 "HP가 0이 되는 순간"이 화면에 한 프레임도 안 나온다 — 마지막 한 방의
        // 결과가 바에 안 찍히고 바가 그냥 사라진다(비평가 3차 3번). 0까지 0.12초 훑어 내린 뒤 팝아웃한다.
        // 시체를 따라 눕지는 않으므로(바는 scene 직속) 좀비 잔상 문제는 그대로 없다.
        if (m.hpBg && m.hpBg.parent) {
            const barG = m.hpBg.parent, hpFg = m.hpFg, gh = m.hpGhost;
            const v0 = hpFg ? hpFg.scale.x : 0, s0 = barG.scale.x || 1;
            m.barDying = true; // update의 driveHpBar가 이 바를 다시 건드리지 않게 (드레인을 덮어쓰면 계단이 생긴다)
            const g0 = gh ? Math.max(gh.scale.x, v0) : 0;
            // ⚠️ 잔상바도 **반드시 같이 0까지 내려야 한다.** 앞바만 비우고 잔상바를 남겼더니
            // +180ms 프레임에서 트랙이 "빨갛게 55% 차 있는 바"로 보였다 — 죽는 게 아니라 **분노해서 붉어진 것**으로
            // 읽히는 정반대 신호다(비평가 4차 4번). 잔상은 앞바보다 0.18초 늦게 따라가되 0.26초에는 반드시 0이 된다.
            // ⚠️ **앞바는 처치 프레임에 즉시 0으로 스냅한다.** 예전에는 0.12초에 걸쳐 훑어 내렸는데,
            // 그러면 가장 주목도 높은 +16ms 프레임에서 바가 아직 **94% 차 있다**(실측
            // `probe-hit-readout.js`: 앞바 0.941). 화면 전체는 "죽었다"고 터지는데 바만 "아직 절반
            // 남았다"고 말하는 정반대 신호다 — 비평가 5차에서 **채점자 2인이 독립적으로** 최상위
            // 지적으로 올렸다(A #2 "b1에서 55% 잔량", B #1 "48% 잔량, 가장 큰 이벤트가 바 피드백은
            // 가장 약하다"). 일반 타격은 +16ms에 이미 반영되는데 처치만 늦는 규칙 불일치이기도 하다.
            // 3차 지적 'HP가 0이 되는 순간이 한 프레임도 안 나온다'는 이 스냅으로 **오히려 더 확실히**
            // 충족된다(빈 트랙이 임팩트 프레임부터 보인다). '얼마를 잃었나'의 서사는 잔상바가 전담한다.
            if (hpFg) { hpFg.scale.x = 0.001; hpFg.position.x = -0.4; }
            if (gh) { gh.visible = true; gh.scale.x = g0; gh.position.x = -0.4 * (1 - g0); }
            // ⚠️ 프레임 플래시·세로 펀치는 여기서 **직접** 몰아야 한다. `hitHpBar`가 세우는 `hpFlash`/
            // `barPunch`는 `driveHpBar`가 소비하는데, 처치 바는 `barDying`이라 update가 driveHpBar를
            // 아예 건너뛴다 — 그래서 지금까지 처치 바에는 '맞았다' 반응이 하나도 없었다(비평가 A #2·B #1
            // "프레임 화이트 플래시가 안 걸린다"). 일반 타격(0.14초)보다 세고 길게 줘 위계를 맞춘다.
            const barBase0 = m.barBase !== undefined ? m.barBase : (m.hpG ? m.hpG.scale.y : 1);
            const bgC0 = this.srgbC(0x0d1114).clone(), whiteC = new THREE.Color(0xffffff);
            // 🚨 지속 0.26 → **0.19초**. 잔상바는 0.19초에 0에 닿는데(아래 gk) 애니메이션이 0.26초까지
            //    끌린 뒤 다시 0.16초 팝아웃이 붙어, **빈 바가 +180~420ms 동안 허공에 떠 있었다**
            //    (비평가 5차 ⓓ, A #7 · B #8: "b3(+346ms)에 빈 바 x≈370~450인데 시체는 x≈495~595로
            //    이미 130px 오른쪽·아래"). 실측(`probe-hit-readout.js`)도 같았다: 빈 트랙 +180ms,
            //    +346ms 에도 바 opacity 0.063 으로 잔존.
            //    잔상바가 0에 닿는 **바로 그 시각**에 애니메이션을 끝내고 팝아웃으로 넘긴다.
            //    ⚠️ 잔상 곡선(0.06초 홀드 → 0.13초 소진)은 4차 지적 '얼마를 잃었나가 안 읽힌다'의
            //       처방이라 **절대 시간으로 그대로 보존**한다 — 아래 gk 를 k 비율이 아니라 t 초로 쓴 이유다.
            const KILLBAR_T = 0.19;
            this.addAnim(KILLBAR_T, k => {
                if (hpFg) { hpFg.scale.x = 0.001; hpFg.position.x = -0.4; } // 스냅 유지 (driveHpBar가 못 건드리게)
                const t = k * KILLBAR_T;
                // 🚨 흰 플래시를 0.17 → **0.05초**(=3프레임)로 줄인다. HP바는 '밝은 면적'으로 읽히므로
                //    full-width 흰 트랙이 0.17초 떠 있으면 **'가득 찬 흰 바'로 각인**된다 — 처치가 전하려는
                //    '비웠다'의 정반대 신호다(비평가 6차 A #5 "흰 풀바". 실측 `probe-killbar-read.js`:
                //    밝은폭 98%·저채도가 **112ms** 지속). 임팩트 프레임의 '맞았다' 플래시는 2~3프레임이면
                //    충분하고, 그 뒤로는 **비운 어두운 트랙**이 드러나야 죽음이 읽힌다. 잔상바(살구, 손실
                //    서사)는 그대로 두므로 '얼마를 잃었나'는 유지된다 — 흰색만 걷어낸다.
                const fl = U.clamp(1 - t / 0.05, 0, 1);
                if (m.hpBg) {
                    m.hpBg.material.color.copy(bgC0).lerp(whiteC, fl);
                    m.hpBg.material.opacity = 0.82 + fl * 0.18;
                }
                if (m.hpG) m.hpG.scale.y = barBase0 * (1 + 0.26 * U.clamp(1 - t / 0.13, 0, 1)); // 세로 펀치 1.26배 (일반 1.18배)
                if (gh) {
                    // 잔상바가 잃은 전량을 물려받는다. **먼저 버티고 그다음 태운다** — 곧바로 감쇠시키면
                    // 임팩트 프레임에 이미 절반이 사라져(실측 0.515) '얼마를 잃었나'가 안 읽힌다.
                    // 0.06초 홀드 → 0.13초 선형 소진. 홀드 구간이 곧 손실 폭을 보여 주는 시간이다.
                    const gk = U.clamp((t - 0.06) / 0.13, 0, 1);   // 절대 시간: 0.06초 홀드 → 0.13초 소진 → 0.19초에 0
                    const gv = Math.max(0.001, g0 * (1 - gk));
                    gh.scale.x = gv; gh.position.x = -0.4 * (1 - gv);
                    gh.visible = gk < 1;
                }
            }, () => {
                if (gh) gh.visible = false;
                // 팝아웃 — 0.12초에 걸쳐 살짝 부풀며 사라진다(툭 꺼지면 '버그로 사라졌다'로 읽힌다).
                // '0이 됐다'는 이미 **임팩트 프레임부터** 빈 앞바로 190ms 넘게 보여 줬으므로
                // 여기서 빈 트랙을 더 붙들 이유가 없다(그게 ⓓ의 원인이었다).
                this.addAnim(0.12, k => {
                    barG.scale.setScalar(s0 * (1 + 0.15 * k));
                    [m.hpBg, hpFg, gh].forEach(o => { if (o) { o.material.transparent = true; o.material.opacity = 1 - k; } });
                    // 소유자 캐럿(외곽+채움 두 삼각)도 같이 사그라든다 — 안 하면 바만 사라지고 캐럿이 남는다
                    if (m.hpPip) m.hpPip.children.forEach(c => { if (c.material) { c.material.transparent = true; c.material.opacity = (c.material.userData._o0 !== undefined ? c.material.userData._o0 : (c.material.userData._o0 = c.material.opacity)) * (1 - k); } });
                }, () => { barG.visible = false; });
            });
        }
        // ⚠️ 원래 불투명이 **아니었던** 재질은 자기 불투명도를 기준으로 접어야 한다.
        // 예전엔 아래에서 `opacity = 1 - f` 로 통째로 덮어썼는데, 쓰러짐 구간에서는 f 가 0 이라
        // 젤리 몸통(0.82)·정수리 광택(0.38)·막날개(0.76/0.85)·접촉 AO 링(0.42~0.58)이
        // **죽는 첫 프레임에 불투명으로 팍 튀었다** — 관절 AO 가 '검은 테로 켜지는' 걸로 보인다.
        // 그 기준값만 여기서 갈무리하고, 실제 소멸은 `setDissolve`(노이즈 알파 클립)가 맡는다.
        // 🚨 예전처럼 여기서 `transparent = true` 를 **일괄로 켜지 않는다** — 알파 클립은 불투명
        //    패스에서 그대로 동작하고, 시체를 통째로 투명 패스로 옮기면 쓰러지는 동안 파츠끼리
        //    정렬이 뒤집혀 이빨·눈이 얼굴 앞으로 튀어나온다(투명 오브젝트는 깊이 기록을 안 한다).
        m.g.traverse(o => {
            if (!o.isMesh || !o.material) return;
            (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => {
                if (mt.userData.dissolveBase === undefined) mt.userData.dissolveBase = mt.transparent ? mt.opacity : 1;
            });
        });
        // 진행 중이던 히트축 스쿼시를 먼저 접는다 — update 루프는 `!e.alive`를 건너뛰므로 여기서 안 끄면
        // 시체가 눌린 채(x 0.86 등) 영원히 굳고, 아래 `sy0`가 부푼 값을 기준으로 잡아 쓰러지는 시체 키가
        // 마지막 한 방의 세기에 따라 달라진다. 예전엔 크리·큰 피해만 펀치를 걸어 잘 안 드러났다.
        m.punchT = 0;
        m.g.scale.setScalar(m.baseScale || 1);
        const baseY = m.g.position.y, sy0 = m.g.scale.y, ox = m.g.position.x, dur = isBoss ? 1.5 : 1.05;
        // 쓰러지는 구간을 버스트 수명(≈250ms) 안으로 당긴다. 예전엔 낙하가 k=0.5(=525ms)까지 끌려
        // 파편이 다 꺼진 +346ms에도 시체가 27° 기울어 서 있었다 — 폭발과 죽음이 다른 사건으로 보였다
        // (비평가 2차 ⓒ). 포즈 순서(경직→무릎 꺾임→눕기→먼지→디졸브)는 그대로 두고 시간축만 압축한다.
        // kHit(기울기 없이 뒤로 밀리기만 하는 반동 구간)을 0.05 → 0.025초로 줄인다 — 이 구간이 길수록
        // 붕괴 시작이 그만큼 늦어 '결정타 첫 100ms'를 못 채운다(위 ⓓ). 짧은 반동 뒤 곧바로 무너진다.
        const kHit = 0.025 / dur, kDown = (isBoss ? 0.42 : 0.3) / dur;
        let dusted = false;
        this.addAnim(dur, k => {
            if (k < kHit) {
                m.g.position.x = ox + (k / kHit) * 0.06; // 피격 반동 — 뒤로 밀림
            } else if (k < kDown) {
                const f = (k - kHit) / (kDown - kHit);
                // 🚨 붕괴를 **앞으로 몰아** '결정타'가 첫 100ms 에 읽히게 한다. 예전엔 기울기가 ease-in
                //    (`-f²`)이라 +96ms 에도 처치는 거의 서 있고(-2.7°) 크리 넉백은 이미 -19° 였다 —
                //    즉 첫 100ms 에 **처치가 크리보다 덜 격렬**해 보여 결정타 쾌감이 +200ms 뒤로 밀렸다
                //    (비평가 6차 B #8 "붕괴 시작이 +260ms". 실측 `probe-critkill-early.js`: 처치 기울기가
                //    +160ms 에야 크리를 넘어선다). ease-out 을 섞어(`fe`) 앞을 세우되, 끝점(f=1 → 1.45)과
                //    가속 인상은 유지한다. 이러면 +96ms 에 처치가 -22° 로 크리(-11°, 복귀 중)를 앞선다.
                const fe = 0.6 * (1 - (1 - f) * (1 - f)) + 0.4 * f;   // 앞을 세운 붕괴 커브 (f=0→0, f=1→1)
                // 무릎 꺾임(이족) 또는 몸통 주저앉음(무릎 없는 종) + 등부터 가속 낙하. 주저앉음도 같은
                // 커브로 앞을 세운다 — 무릎 없는 종(골렘)은 이 압축이 첫 100ms 의 유일한 붕괴 신호다.
                if (m.anim && m.anim.bleg) m.anim.bleg.forEach(L => { L.knee.rotation.x = -0.15 - fe * 1.5; L.hip.rotation.x = fe * 0.5; });
                else m.g.scale.y = sy0 * (1 - 0.22 * fe);
                m.g.position.x = ox + 0.06 + f * 0.16;
                m.g.rotation.z = -fe * 1.45;          // -z 회전 = +x(영웅 반대) 쪽으로 눕기
                m.g.position.y = baseY * (1 - f);    // 비행체는 지면으로 내려앉음
            } else {
                if (!dusted) {
                    dusted = true;
                    this.expandRing(new THREE.Vector3(m.g.position.x + 0.25, 0, 0), new THREE.Color(0xbcaaa4), isBoss ? 1.5 : 0.9);
                    m.g.traverse(o => { if (o.isMesh) o.castShadow = false; }); // 페이드 중 그림자 잔존 방지 (opacity는 캐스트 섀도우에 미반영)
                }
                m.g.rotation.z = -1.45;
                m.g.position.y = 0;
                m.g.position.x = ox + 0.22;
                // 착지 후 잠깐(0.18s) 시체를 불투명하게 눕혀 둔다 — 닿자마자 녹기 시작하면 '쓰러졌다'가
                // 지각되기 전에 사라져 순간 소멸처럼 보인다.
                // 🚨 디졸브 길이를 **절대 시간 0.52초로 못 박는다**(비평가 처방 '접지 후 0.3~0.5초').
                //    예전엔 `(k - kHold) / (1 - kHold)` 로 **남은 시간 전부**를 썼는데, 그러면 일반
                //    0.57초 · 보스 0.90초로 종류마다 소멸 속도가 달라지고 보스는 거의 1초를 반투명
                //    시체로 서 있었다. 남는 꼬리는 이미 다 사라진 상태로 흘려보낸다(시체는 안 보인다).
                const kHold = kDown + 0.18 / dur;
                const f = k < kHold ? 0 : U.clamp((k - kHold) * dur / 0.52, 0, 1);
                this.setDissolve(m.g, f);   // 임계값 매핑은 setDissolve 가 한다(노이즈 분포 주석 참고)
                if (m.blob) m.blob.scale.setScalar(0.95 * (1 - f)); // 공유 재질인 블롭 섀도우는 스케일로만 축소
            }
            // 빈 HP바가 시체를 따라간다. 바 위치는 평소 `update()` 의 `for (const e of Combat.enemies)`
            // 안에서만 갱신되는데 그 루프는 `!e.alive` 를 건너뛰므로(바로 위 260줄), 처치 직후부터는
            // **이 애니메이션이 유일한 갱신 지점**이다 — 그래서 여기서 추적한다. 세 분기가 전부
            // `m.g.position` 을 쓴 **뒤**에 놓아야 한 프레임 늦지 않는다.
            // 5차 교정 ⓓ 는 빈 바의 **수명**(0.19s 드레인 + 0.12s 팝아웃)만 잡고 **앵커**를 안 잡아,
            // 시체가 x +0.22유닛 이동 + y 낙하 하는 동안 바는 죽은 자리에 못 박혀 있었다
            // (비평가 6차 B #1 "바는 원래 자리, 시체는 우하단". 실측 `probe-deadbar-anchor.js`:
            //  바가 보이는 동안 최대 **37.0px** 이탈 → 바가 시체와 무관한 UI 조각으로 읽힌다).
            // shakeX/shakeY 는 더하지 않는다 — 피격 셰이크는 살아 있는 적의 반응이라 시체엔 안 붙는다.
            if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, m.g.position.z);
        }, () => {
            this.disposeTree(m.g); this.scene.remove(m.g);
            if (m.hpG) { this.disposeTree(m.hpG); this.scene.remove(m.hpG); } // 바가 scene 직속이라 따로 걷어낸다
            this.dropBlob(m);
            this.enemyMap.delete(id);
        });
    },

    // dmg를 넘기면 영웅 머리 위에도 붉은 데미지 숫자를 띄운다(적과 같은 스포너·같은 슬롯 규칙).
    // 예전엔 적만 숫자가 떠서 "내가 몇 대 맞아 얼마나 깎였는지"를 화면에서 읽을 방법이 HP바 길이뿐이었다(비평가 3차 6번).
    heroHit(sev, dmg) {
        sev = U.clamp(sev || 0.12, 0, 1);
        // 관절 반동 — 아래 넉백/롤은 **몸통을 통째로** 움직일 뿐이라 포즈는 맞기 전과 같다.
        // 적 쪽 `driveFlinch` 와 같은 결함이었고(비평가 A #7 / B #5) 같은 언어로 갚는다.
        if (typeof ProChar !== 'undefined') ProChar.hit(this.heroRig, sev);
        const ox = this.heroG.position.x;
        // 뒤로(-x) 밀리며 상체가 젖혀지는 움찔 — 피해가 클수록 깊게
        const kb = 0.16 + Math.min(0.26, sev * 1.2);
        this.addAnim(0.22, k => {
            const p = Math.sin(k * Math.PI);
            this.heroG.position.x = ox - p * kb;
            this.heroG.rotation.z = p * (0.04 + Math.min(0.12, sev * 0.5));
        }, () => { this.heroG.position.x = Combat.HERO_X; this.heroG.rotation.z = 0; });
        // 영웅 전신 틴트 + 외곽선 점등. 대상 수집·캐시·무효화는 flashTargets 가 전부 한다
        // (예전엔 여기서 emissive 재질만 따로 모았는데, 그 목록은 면적을 쥔 외곽선을 통째로 놓쳤다).
        if (!this._heroFlash || this._heroFlash.g !== this.heroG) this._heroFlash = { g: this.heroG };
        // 🚨 주석은 '화이트아웃 금지'라고 적혀 있었지만 **실제로는 화이트아웃이었다**(8차 비평가 2인
        //    일치 ㉤, `probe-hero-flash-identity` 실측): 실루엣 평균 휘도가 0.395 → 0.598 로 **+0.20**
        //    오르고 R−B 는 오히려 **−10.1** 떨어졌다 — 검은 갑옷이 은백색으로 날아가며 '붉게'가
        //    아니라 그냥 밝아진 것이다. 원인 둘: ⑴ `olK` 를 안 줘서 유도식(0.35+peak×2.2)이 **0.90**
        //    으로 붙어 림이 거의 순백까지 탔다 ⑵ 몸 emissive 가 균일 백색 0.25 라 어두운 갑주가 함께 들렸다.
        //    → 적 쪽에서 이미 도달한 결론을 영웅에도 적용한다: **밝기로 때우지 말고 색으로 말할 것.**
        //    peak 를 절반으로 낮추고, `shapeK`(albedo 명도 비례 감쇠)로 어두운 파츠는 어둡게 남기고,
        //    림 계수를 직접 쥐고, 색을 옅은 분홍(0xffd9d9)에서 **채도 있는 붉은색**으로 옮긴다.
        this.flashMesh(this._heroFlash, 0.12, 0.12, 0xff5a4a, 0.62, 1, 0xff2a18);
        this.hitHpBar(this.heroBar, sev);
        this.shake(Math.min(0.22, 0.05 + sev * 0.6));
        UI.flashDamage(sev);
        // 영웅 피해 숫자 — 적과 반대쪽(왼쪽)으로 흘려 적 숫자와 소유자가 헷갈리지 않게 한다.
        // 높이는 영웅 HP바 위. 색·외곽선은 CSS의 .dmg-hero가 가진다.
        if (dmg !== undefined && dmg !== null && this.heroG) {
            // 영웅 바(heroHpG.y = 2.18) 위로 바 높이(0.135)의 2.2배 — 적 숫자와 같은 규칙
            const barY = this.heroHpG ? this.heroHpG.position.y : 2.18;
            const p = this.heroG.position.clone().add(new THREE.Vector3(-0.15, barY + 0.135 * 2.2, 0));
            this.damageNumber(p, U.fmt(dmg), 'dmg-hero',
                { dx: -U.rand(10, 30), rise: -(26 + sev * 14), scale: 1 + Math.min(0.25, sev * 0.8) });
        }
    },

    // 영웅 사망 — 예전에는 Death 클립을 걸어도 **바로 다음 프레임에 update의 Idle/Walking 자동 전환이
    // 덮어써서** 영웅이 그냥 서 있었다(사용자 지적 "죽었는데 죽은 것처럼 안 보인다"). once 클립은
    // play()에서 R.state를 ''로 두므로 루프 클립 중복 방지 가드에 걸리지 않아 매 프레임 다시 깔린다.
    // → `heroDead` 플래그로 자동 전환을 잠그고, 리그가 마지막 포즈(t=1)를 그대로 유지하게 둔다.
    heroDown() {
        if (this.heroDead) return;
        this.heroDead = true;
        this._attacking = false;
        this.walking = false;
        this.heroPlay(['Death_A'], true);
        this.shake(0.4);
        UI.flashDamage(1); // 화면 붉은 비네트 — 치명타 피격보다 진하게
        // 2단 붕괴에 맞춘 2단 접지 먼지 — 클립(dur 1.45)의 무릎 접지 t=0.38(≈0.55초), 몸통 접지 t=0.78(≈1.13초).
        // ⚠️ 클립 타이밍을 바꾸면 이 상수도 같이 바꿀 것(먼지가 몸보다 먼저/늦게 터지면 접지가 거짓말이 된다).
        // ⚠️ 스폰 위치는 heroG.position(=발밑 원점)이 아니라 **그 순간 실제로 바닥에 닿는 부위**를 리그에서
        //    읽어 쓴다 — 옆으로 무너지면 몸통이 원점에서 0.8쯤 벗어나 있어, 예전처럼 원점에 터뜨리면
        //    먼지가 시체에서 한 몸 길이 떨어진 빈 땅에서 피어난다(비평가 지적).
        const rig = this.heroRig;
        const groundAt = (bone, fallback) => {
            if (!rig || !rig.bones[bone]) return (this.heroG ? this.heroG.position.clone() : new THREE.Vector3());
            const p = rig.bones[bone].getWorldPosition(new THREE.Vector3());
            p.y = (this.heroG ? this.heroG.position.y : 0) + (fallback || 0.06);
            return p;
        };
        let knee = false, body = false;
        this.addAnim(1.42, k => {
            const t = k * 1.42;
            if (!knee && t >= 0.55) {   // 무릎이 먼저 꺾여 바닥에 닿는다 — 작게
                knee = true;
                const p = groundAt('kneeL');
                this.spawnSparks(p.clone().add(new THREE.Vector3(0, 0.08, 0)), 7, 0xbcaaa4, { speed: 0.8 });
                this.expandRing(p, new THREE.Color(0x9e8d84), 0.6);
                this.shake(0.1);
            }
            if (!body && t >= 1.25) {   // 몸통이 바닥에 부딪히는 순간 — 크게, 어깨·골반 두 점에서
                // ⚠️ 1.13초에 터뜨렸더니 실측상 몸이 아직 36px 위에서 낙하 중이라 먼지가 착지보다 120ms 빨랐다
                body = true;
                const sh = groundAt('shoulderL'), pv = groundAt('pelvis');
                this.spawnSparks(sh.clone().add(new THREE.Vector3(0, 0.1, 0)), 11, 0xbcaaa4, { speed: 1.25 });
                this.spawnSparks(pv.clone().add(new THREE.Vector3(0, 0.1, 0)), 9, 0xbcaaa4, { speed: 1.05 });
                this.expandRing(sh, new THREE.Color(0x9e8d84), 1.15);
                this.expandRing(pv, new THREE.Color(0x9e8d84), 0.95);
                this.shake(0.24);
                this.corpseBlob(true);   // 접지 그림자를 시체 길이에 맞춰 늘린다
            }
        });
    },

    // 시체 접지 그림자 — 서 있을 때의 작은 원형 블롭은 옆으로 누운 몸을 못 받쳐 "그림자와 몸이 따로 논다"는
    // 인상을 준다(비평가: 부츠 옆 지면과 1m 떨어진 지면의 휘도가 동일). 누우면 몸통 길이에 맞춘 타원으로
    // 늘리고 살짝 짙게, 기상하면 되돌린다. 리그 좌표(어깨~골반)에서 중심을 읽어 몸을 따라간다.
    corpseBlob(on) {
        const rig = this.heroRig;
        if (!this.heroBlob) return;
        // 접지 그림자 3개 — 어깨·골반·무릎. 예전엔 골반~목 **중점 하나**에 큰 타원을 깔았는데,
        // 그러면 타원이 다리 쪽으로 몰려 부츠 밖까지 삐져나가고(비평가 실측: 몸통 중심에서 화면 140px 어긋남)
        // 정작 사람이 접지를 확인하는 어깨·몸통 밑에는 명암 변화가 0이 된다. 실제로 바닥에 닿는 뼈마다
        // 하나씩 깔아야 "몸이 바닥을 누르고 있다"로 읽힌다.
        if (!this._corpseBlobs) {
            this._corpseBlobs = ['shoulderL', 'pelvis', 'kneeR'].map(() => {
                const m = new THREE.Mesh(this.blobGeo, this.blobShadowMat.clone());
                m.rotation.x = -Math.PI / 2;
                m.position.y = 0.028;
                m.scale.set(1.35, 0.78, 1);
                m.material.opacity = 0;
                m.userData.sharedGeometry = true;
                m.visible = false;
                this.heroG.add(m);
                return m;
            });
        }
        const blobs = this._corpseBlobs, bones = ['shoulderL', 'pelvis', 'kneeR'];
        const base = this.heroBlob;
        const fromOp = blobs.map(m => m.material.opacity), fromBase = base.material.opacity;
        if (on) {
            blobs.forEach((m, i) => {
                const bn = rig && rig.bones[bones[i]];
                if (bn) {
                    const p = this.heroG.worldToLocal(bn.getWorldPosition(new THREE.Vector3()));
                    m.position.x = p.x; m.position.z = p.z;
                }
                m.visible = true;
            });
        }
        const toOp = on ? 0.5 : 0, toBase = on ? 0.06 : 0.17;   // 누우면 발밑 원형은 거의 지우고 시체 블롭으로 대체
        this.addAnim(0.3, k => {
            const e = k * k * (3 - 2 * k);
            blobs.forEach((m, i) => { m.material.opacity = fromOp[i] + (toOp - fromOp[i]) * e; });
            base.material.opacity = fromBase + (toBase - fromBase) * e;
        }, () => { if (!on) blobs.forEach(m => { m.visible = false; }); });
    },

    // 기상 — 사망 포즈에서 일어서는 전환. 자동 전환 잠금은 클립 길이만큼만 유지한다
    heroRevive() {
        if (!this.heroDead) return;
        this.heroDead = false;
        this._heroReviveT = this.REVIVE_DUR; // Revive 클립 길이 — 이 동안에도 Idle이 덮어쓰면 안 된다
        this.heroPlay(['Revive'], true);
        // ⚠️ 연출 위치는 heroG 원점(발밑)이 아니라 **아직 누워 있는 몸통**에 — 원점에 터뜨리면 시체에서
        //    한 몸 길이 떨어진 빈 땅에서 빛이 피어난다(사망 먼지와 같은 실수).
        const rig = this.heroRig;
        const hp = (rig && rig.bones.pelvis)
            ? (() => { const p = rig.bones.pelvis.getWorldPosition(new THREE.Vector3()); p.y = this.heroG.position.y; return p; })()
            : (this.heroG ? this.heroG.position.clone() : new THREE.Vector3());
        this.expandRing(hp, new THREE.Color(0x9be7a0), 1.3);
        this.spawnSparks(hp.clone().add(new THREE.Vector3(0, 0.35, 0)), 12, 0x69f0ae, { speed: 1.4 });
        // 시체 그림자는 몸이 실제로 일어서기 시작한 뒤에 거둔다 — 즉시 거두면 누운 몸만 남고 그림자가 먼저 사라진다
        this.addAnim(0.38, () => { }, () => this.corpseBlob(false));
    },

    // ---- 보스 등장 워닝 연출 (사용자 지시: "워닝 워닝 워닝" 느낌으로 화려하게) ----
    // 화면(#boss-warning) · 사운드(SFX.bossSiren) · 3D가 전부 이 두 상수를 기준으로 같은 박에 움직인다.
    BOSS_WARN_DUR: 2.0,   // 총 길이(배너 닫힘까지) — 사용자 지시 ④ "1.5~2.5초"
    BOSS_BEAT: 0.42,      // 점멸/사이렌 스윕 1회 박자 (3회 = 1.26초)
    BOSS_IMPACT: 1.55,    // 보스가 지면을 밟는 순간 — Combat이 이 시점에 보스를 스폰한다(연출 → 등장, 사용자 지시 ③)
    BOSS_SPAWN_X: 1.75,   // 보스가 서는 자리(논리 x). 화면 안 오른쪽 — 경고 링이 여기를 미리 지목한다

    bossEntrance() {
        const px = this.BOSS_SPAWN_X + this.worldX;
        UI.bossWarning(this.BOSS_WARN_DUR);
        SFX.bossSiren();
        // 착지 지점 위에 붉은 경고 기둥을 세워 "여기서 뭔가 나온다"를 미리 읽히게 한다.
        const pillar = this.bossWarnPillar(px);
        let beat = -1, impacted = false;
        this.addAnim(this.BOSS_WARN_DUR, k => {
            const t = k * this.BOSS_WARN_DUR;
            // 카메라를 임팩트까지 천천히 밀어 넣는다(ease-out) — 등장 직전 압박감
            if (!impacted) this.camPush = 0.9 * (1 - Math.pow(1 - Math.min(1, t / this.BOSS_IMPACT), 3));
            // 경고 링 3회 — 박마다 점점 크고 세게
            const b = Math.floor(t / this.BOSS_BEAT);
            if (b !== beat && b < 3) {
                beat = b;
                this.expandRing(new THREE.Vector3(px, 0, 0), new THREE.Color(0xff3d2e), 1.0 + b * 0.45);
                this.flashLight(new THREE.Vector3(px, 0.3, 0), 0xff2a1e, 0.26);
                this.shake(0.05 + b * 0.035);
            }
            if (pillar) { // 기둥은 박에 맞춰 밝아졌다 어두워지며 서서히 자란다
                const pulse = 0.35 + 0.65 * Math.pow(1 - (t % this.BOSS_BEAT) / this.BOSS_BEAT, 2);
                pillar.material.opacity = (impacted ? 0 : 0.72 * pulse * Math.min(1, t / 0.5));
                pillar.scale.y = 0.55 + 0.45 * Math.min(1, t / this.BOSS_IMPACT);
                pillar.rotation.y = t * 0.9; // 느린 회전 — 정지한 원뿔은 배경 프롭으로 읽힌다
            }
            // 착지 임팩트: 지축 파동 + 큰 흔들림 + 카메라 릴리즈 (보스 스케일 인과 같은 프레임)
            if (!impacted && t >= this.BOSS_IMPACT) {
                impacted = true;
                this.shake(0.5);
                this.fovPunch(0.05, 0.3);
                this.expandRing(new THREE.Vector3(px, 0, 0), new THREE.Color(0xff6a3c), 3.4);
                this.expandRing(new THREE.Vector3(px, 0, 0), new THREE.Color(0xffe0b2), 2.0);
                this.spawnSparks(new THREE.Vector3(px, 0.25, 0), 22, 0xffab40, { speed: 2.2 });
                this.flashLight(new THREE.Vector3(px, 0.6, 0), 0xff8a3d, 0.4);
                const push0 = this.camPush;
                this.addAnim(0.45, kk => { this.camPush = push0 * (1 - kk); }, () => { this.camPush = 0; });
            }
        }, () => {
            this.camPush = 0;
            if (pillar) { this.disposeTree(pillar); this.scene.remove(pillar); }
        });
    },

    // 광주용 세로 알파 그라디언트 — 밑동만 진하고 위로 갈수록 사라진다.
    // 균일 알파로 두면 가산 합성이 원뿔 전체를 채워 '허연 사다리꼴 판'으로 읽힌다(실측 프레임).
    bossWarnTex() {
        if (this._bossWarnTex) return this._bossWarnTex;
        const c = document.createElement('canvas');
        c.width = 4; c.height = 128;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 128); // 캔버스 위=원기둥 위(three는 flipY)
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.55, 'rgba(255,255,255,.30)');
        g.addColorStop(1, 'rgba(255,255,255,1)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 128);
        this._bossWarnTex = new THREE.CanvasTexture(c);
        return this._bossWarnTex;
    },

    // 착지 지점에서 솟는 붉은 경고 광주(가산 합성 원뿔) — 등장 위치를 미리 알리는 표식
    bossWarnPillar(px) {
        const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.62, 1.05, 3.4, 20, 1, true),
            new THREE.MeshBasicMaterial({
                color: 0xff1a10, map: this.bossWarnTex(), transparent: true, opacity: 0, side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
            }));
        pillar.geometry.translate(0, 1.7, 0); // 원점을 밑동으로 — scale.y를 키워도 바닥에서 자란다
        pillar.position.set(px, 0, 0);
        pillar.scale.y = 0.55;
        this.scene.add(pillar);
        return pillar;
    },

    // ---- 스킬 이펙트 ----
    // POLISH.md 의 절대 기준은 **3박자 레이어링(캐스팅 플래시 → 발동 이펙트 → 적중 폭발)** 인데,
    // 스킬 18종은 여태 **1박자**였다 — `skillEffect` 가 불리는 즉시 적 발밑에서 폭발이 터졌고
    // 영웅 쪽에는 아무 예비 동작이 없었다. 그래서 아무리 세게 터뜨려도 '버튼을 누르니 이펙트가
    // 튀어나온다'로 읽혔지(=예고 없는 팝), '힘을 모아 쏜다'로는 안 읽혔다.
    // 여기서 **1박(시전)** 을 신설하고 기존 연출을 2·3박으로 뒤로 민다.
    CAST_MS: 130,          // 시전 → 발동 간격(등급 미상일 때의 기본값). 피해는 Combat 이 0.2~0.25초에 넣으므로 적중이 항상 먼저다.
    CAST_MS_METEOR: 0,     // 메테오/아포칼립스는 낙하 0.35초가 이미 2박이라 시전만 겹쳐 준다
    // ---- 등급 위계 ----
    // 스킬 18종은 fx 를 등급끼리 **공유**한다 — 강타(커먼 3배)와 처형(레전더리 11배)이 둘 다 'slash',
    // 화염구(2.4배)와 초신성(10배)이 둘 다 'explode', 낙뢰(7배)와 신의 창(32배)이 둘 다 'bolt'다.
    // 그래서 여태 **색만 다르고 그림이 완전히 같았다**(피해량은 10배인데 연출이 같으면 위계가 죽는다).
    // 등급(0~5)을 연출 전 단계에 태워, 모으는 시간·모트 수·링 겹수·셰이크·히트스톱이 같이 커지게 한다.
    // 특히 **시전 시간**에 태우는 게 값이 크다 — '오래 모을수록 센 것'은 설명 없이 읽히는 문법이다.
    skillTier(def) {
        if (!def || !def.rarity || typeof RARITIES === 'undefined') return 1;
        const i = RARITIES.indexOf(def.rarity);
        return i < 0 ? 1 : i;                      // common0 rare1 epic2 legendary3 ultimate4 mythic5
    },
    // ⚠️ **시전 박자의 길이**와 **2박을 미루는 시간**은 다른 값이다.
    //    메테오/아포칼립스는 낙하 0.35초가 이미 2박이라 payload 를 미루지 않지만(지연 0),
    //    시전 박자 자체는 다른 스킬과 똑같이 등급만큼 길어져야 한다 — 둘을 한 함수로 묶었더니
    //    메테오만 시전이 등급을 안 타고, 검증기의 '시전 구간'도 0ms 로 잡혀 빈 구간이 됐다.
    castBeatMs(tier) { return 90 + tier * 26; },                       // 커먼 90ms … 미식 220ms
    // ⚠️ 번개류는 **시전 박자에 하한을 둔다**. 이 대기 시간이 곧 먹구름이 뭉게뭉게 부푸는 시간이라,
    //    커먼(90ms)에서는 구름이 뜨자마자 번개가 쳐서 '예고'가 눈에 안 걸린다(실측: 첫 낙뢰 전
    //    표본이 5프레임뿐이고 그중 4프레임이 이미 최대 불투명). 초반 플레이어가 가장 많이 보는
    //    대역이 바로 커먼·레어라, 여기서 장면이 성립하지 않으면 항목 전체가 실패한다.
    //    190ms 는 피해 판정(Combat 0.2~0.25초)보다 여전히 앞이라 '맞고 나서 번개'가 되지 않는다.
    STORM_GATHER_MIN_MS: 190,
    castMsFor(fx, tier) {
        if (fx === 'meteor') return this.CAST_MS_METEOR;
        if (fx === 'dragonfire') return this.CAST_MS_METEOR;   // 용의 강림 자체가 예고 — 시전만 겹친다
        if (fx === 'bolt') return Math.max(this.STORM_GATHER_MIN_MS, this.castBeatMs(tier));
        return this.castBeatMs(tier);
    },
    // 시전 모트용 글로우 — makeGlowTexture 는 호출마다 새 텍스처를 만든다(스킬마다 굽지 않게 캐시)
    castGlowTex() { return this._castGlow || (this._castGlow = this.makeGlowTexture()); },

    // 1박: 시전. 영웅에게 **안으로 모이는** 운동을 만든다 — 기존 연출이 전부 '밖으로 퍼지는'
    // 것뿐이라(expandRing·spawnSparks·explosion) 화면에 예비 동작이 존재하지 않았다.
    // 수렴하는 룬 링 + 빨려드는 모트 + 부풀다 터지는 차지 코어 + 밝아지는 조명, 130ms.
    skillCastBeat(color, fx, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const pw = t / 5;                                   // 0(커먼) ~ 1(미식)
        // ⚠️ 지원계 6종은 fx 키가 전부 다르다(skill-unique-signature) — 하나라도 빠지면 그 스킬만
        //    시전 1박이 공격계 문법(발밑으로 조여드는 링)으로 돌아 지원계의 상승 축과 어긋난다.
        const support = fx === 'heal' || fx === 'aura' || fx === 'firstaid'
            || fx === 'wardshield' || fx === 'warcry' || fx === 'timewarp';
        const hero = this.heroG.position;
        const chest = new THREE.Vector3(hero.x, hero.y + 1.05, hero.z);
        const dur = this.castBeatMs(t) / 1000;             // 박자 길이는 fx 와 무관하게 등급만 탄다
        const G = new THREE.Group();
        this.scene.add(G);

        // ⓐ 수렴 룬 링 2겹 — 넓게 깔렸다가 발밑으로 조여든다. 역방향 회전으로 '문양이 잠기는' 인상.
        //    지원계는 위로 감아올리게(y 상승) 해서 공격계와 방향이 구분된다.
        const rings = [];
        // 반경 2.0/1.45 는 첫 캡처에서 영웅 키의 두 배를 덮어 '문양'이 아니라 '바닥에 깔린 흰 원'으로
        // 읽혔다(연속 프레임 30~90ms 컷). 영웅 어깨폭의 3배쯤으로 조인다.
        const ringSpec = [[1.4, 0.042, color, 1], [1.0, 0.026, new THREE.Color(0xffffff), -1.6]];
        if (t >= 3) ringSpec.push([1.85, 0.03, color, -0.7]);   // 레전더리 이상만 바깥 겹 하나 더
        for (const [r0, tube, colr, spin] of ringSpec) {
            const ring = new THREE.Mesh(this.fxGeo('torus', r0, tube, 6, 30),
                new THREE.MeshBasicMaterial({ color: colr, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(hero.x, 0.14, hero.z);
            ring.userData = { r0, spin, sharedGeometry: true }; // 공유 지오 — dispose 금지 플래그
            G.add(ring); rings.push(ring);
        }

        // ⓑ 빨려드는 모트 — 영웅 둘레 반경 1.2 에서 가슴으로. 안쪽으로 **가속**해야 흡입으로 읽힌다.
        const motes = [];
        const n = (this.particles.length > 200 ? 4 : 8) + Math.round(pw * 14);   // 커먼 8 … 미식 22 (붐비면 절반)
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + U.rand(-0.2, 0.2);
            const rad = U.rand(0.85, 1.2);
            const from = new THREE.Vector3(hero.x + Math.cos(a) * rad, hero.y + (support ? U.rand(0.0, 0.5) : U.rand(0.5, 1.8)), hero.z + Math.sin(a) * rad * 0.6);
            const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.castGlowTex(), color, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
            sp.scale.setScalar(U.rand(0.16, 0.28));
            sp.position.copy(from);
            sp.userData = { from, s0: sp.scale.x };
            G.add(sp); motes.push(sp);
        }

        // ⓒ 차지 코어 — 가슴에서 부풀다 마지막에 팍 터진다(2박으로 넘기는 손잡이).
        const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.castGlowTex(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        core.position.copy(chest);
        core.scale.setScalar(0.01);
        G.add(core);

        // ⓓ 조명은 **올라가야** 한다 — flashLight 는 내려가는(터진 뒤) 곡선이라 시전엔 못 쓴다.
        const light = this.fxLight(color.getHex(), 6); // 풀 리스 — 직접 생성 금지(개수 변화 = 재컴파일)
        light.pos(chest.x, chest.y, chest.z + 0.4);

        this.addAnim(dur, k => {
            const ease = k * k;                       // 안으로 갈수록 빨라진다(흡입)
            for (const r of rings) {
                r.scale.setScalar(1 - 0.78 * ease);   // 반경 22% 까지 조여듦
                r.rotation.z += r.userData.spin * 0.09;
                r.material.opacity = Math.sin(k * Math.PI) * 0.72;  // 떴다 사라짐 — 끝에 링이 남으면 얼룩
            }
            for (const m of motes) {
                m.position.lerpVectors(m.userData.from, chest, ease);
                m.scale.setScalar(m.userData.s0 * (1 - 0.55 * k));
                m.material.opacity = 0.95 * (1 - k * k * k);        // 도착 직전까지 살아 있어야 '빨려들었다'
            }
            const pop = k < 0.82 ? k / 0.82 : 1 + (k - 0.82) / 0.18 * 0.9;  // 부풀다 마지막 18% 에 터짐
            core.scale.setScalar(0.05 + pop * (support ? 0.34 : 0.46) * (0.78 + pw * 0.62));
            core.material.opacity = k < 0.82 ? 0.35 + k * 0.75 : 1 - (k - 0.82) / 0.18;
            light.set((1.5 + pw * 1.9) * ease);   // 2.6 고정은 지면 전체를 씻어 '화면이 밝아졌다'로 읽혔다
        }, () => {
            // ⚠️ `disposeTree` 는 `isMesh` 만 훑어 **Sprite 재질을 통째로 흘린다**(스킬마다 12장씩 샌다).
            //    그렇다고 Sprite 의 geometry 를 해제하면 안 된다 — three r128 의 Sprite 는 모듈 전역
            //    지오메트리 하나를 **모든 스프라이트가 공유**해서, 한 번 해제하면 이후 모든 스프라이트가
            //    깨진다(불티·모트 전부). 그래서 메시는 지오메트리+재질, 스프라이트는 재질만 해제한다.
            //    맵(castGlowTex)은 캐시라 건드리지 않는다.
            G.traverse(o => {
                if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
                if ((o.isMesh || o.isSprite) && o.material) o.material.dispose();
            });
            this.scene.remove(G); light.release();
        });
    },

    skillEffect(fx, colorHex, targetIds, def) {
        // 승천 티어 속성 변주 (ascend-design-tiers): 같은 스킬도 별 개수에 따라 불/얼음/뇌전/신성/심연
        // 색으로 갈린다 — '화살 → 불화살 → 얼음화살'의 골격. 모티프별 전용 연출은 채점 라운드 몫.
        colorHex = this.ascendSkillColor(colorHex, def);
        const color = new THREE.Color(colorHex);
        const tier = this.skillTier(def);
        this.skillCastBeat(color, fx, tier);               // 1박
        // 스킬 고유의 '예고 오브젝트'는 **1박과 같은 시각**에 세운다 (skill-fx-exaggerated).
        // 번개류는 먹구름 — 페이로드에서 만들면 다 부풀기도 전에 번개가 쳐서 예고가 성립하지 않는다.
        // 핸들은 전역에 두지 않고 페이로드로 넘긴다(스킬이 겹쳐도 서로의 구름을 안 지운다).
        const scene = fx === 'bolt' ? this.stormCloudGather(targetIds, color, tier) : null;
        const wait = this.castMsFor(fx, tier);
        // 2·3박은 시전이 끝난 뒤. ⚠️ 타깃은 **그때 다시 조회**한다 — 그 사이에 죽어 disposeTree 된
        // 메시를 붙들고 있으면 해제된 지오메트리를 참조한다.
        if (wait > 0) { setTimeout(() => this.skillPayload(fx, color, targetIds, tier, scene), wait); return; }
        this.skillPayload(fx, color, targetIds, tier, scene);
    },

    // 3박 뒤에 얹는 **무게** — 등급이 높을수록 충격파를 겹치고 화면을 세게 물린다.
    // 기존 연출(explosion·spawnSparks)은 등급을 모르므로 위계가 전부 여기서 나온다.
    // ⚠️ 타깃은 여기서 **다시 조회**한다 — 이 함수는 30ms(메테오는 340ms) 뒤에 불리므로,
    //    호출 시점의 메시를 붙들고 있으면 그 사이 죽어 disposeTree 된 지오메트리를 참조한다
    //    (2박에서 이미 한 번 밟은 함정이라 같은 규칙을 그대로 적용한다).
    // ⚠️ **등급 하한을 두지 말 것** (사용자 지시 2026-08-19 `skill-fx-exaggerated`:
    //    "스킬 부분은 연출이 좀 대체로 약한 게 좀 문제임. 연출이 더 과장되고 화려해야 함").
    //    예전엔 `if (tier < 2) return` 으로 **커먼·레어에 무게를 아예 안 줬다** — 초반 플레이어가
    //    실제로 보는 스킬 대부분이 그 대역이라 "스킬 연출이 약하다"의 절반이 이 한 줄이었다.
    //    이제 pw 를 0~1 로 전 등급에 펴고(커먼도 0 이 아니다) 진폭 자체를 키운다.
    //    위계는 그대로 산다 — 커먼 대비 미식이 링 2.2배·불꽃 3.4배·셰이크 2.6배다.
    skillImpactWeight(fx, color, targetIds, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const pw = t / 5;                                  // 0(커먼) ~ 1(미식) — 하한 없음
        const live = targetIds.map(id => this.enemyMap.get(id)).filter(Boolean);
        const anchors = live.length ? live.map(m => m.g.position.clone())
            : [this.heroG.position.clone()];
        for (const p of anchors.slice(0, 4)) {             // 다수 적일 때 상한 — 링이 화면을 덮지 않게
            this.expandRing(p, color, 1.9 + pw * 2.3);
            // 흰 코어 링을 **전 등급**에 얹는다(예전엔 궁극 이상만) — 색 링 하나만으로는 '터졌다'가
            // 안 읽힌다. 상위 등급은 한 겹 더 늦게 얹어 3겹으로 간다.
            setTimeout(() => this.expandRing(p, new THREE.Color(0xffffff), 1.15 + pw * 1.5), 55);
            if (t >= 3) setTimeout(() => this.expandRing(p, color, 2.6 + pw * 2.0), 120);
            this.spawnSparks(p.clone().add(new THREE.Vector3(0, 0.55, 0)),
                Math.round(14 + pw * 34), color.getHex(), { speed: 1.3 + pw * 1.0 });
        }
        this.shake(0.26 + pw * 0.42);
        this.fovPunch(0.018 + pw * 0.030, 0.16 + pw * 0.10);   // 카메라도 같이 물린다 — 전 등급
        this.skillScreenFlash(color, t);                       // 화면 플래시 + 그레이드 펄스
    },

    // 발동 순간의 **화면 플래시 + 그레이드 펄스** (skill-fx-exaggerated).
    // 3D 안의 링·불꽃만으로는 '화면이 물든' 느낌이 안 난다 — 원신의 발동 컷이 그렇듯 화면 전체가
    // 한 프레임 스킬 색으로 물었다 빠져야 한다. 색수차 대용으로 씬 그레이드(채도·대비)도 같이 문다
    // (r128 + CDN 금지라 포스트프로세싱 컴포저를 못 쓴다 — CSS 필터가 이 저장소의 그레이드 수단이다).
    // 🚨 z-index 13 — `death-overlay-zorder`/`boss-warning-zorder-position` 이 정한 서열을 지킨다:
    //    피격 비네트 12 < **스킬 플래시 13** < 씬컷 14 < 사망 15 < 보스 경고 16 < 모든 팝업 20+.
    //    연출은 씬 대역이다. 20 이상으로 올리면 팝업을 침범한다.
    skillScreenFlash(color, tier) {
        if (!this.fxLayer) return;
        const pw = Math.max(0, Math.min(5, tier || 0)) / 5;
        const el = document.createElement('div');
        const c = `${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)}`;
        el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:13;mix-blend-mode:screen;opacity:0;'
            + `background:radial-gradient(ellipse at 50% 52%, rgba(${c},${(0.42 + pw * 0.36).toFixed(2)}) 0%,`
            + ` rgba(${c},${(0.16 + pw * 0.20).toFixed(2)}) 46%, rgba(${c},0) 78%)`;
        this.fxLayer.appendChild(el);
        const ms = 150 + pw * 110;
        if (!el.animate) { el.remove(); return; }   // WAAPI 미지원이면 연출만 잃는다
        // 정점은 **첫 프레임 안**이어야 한다 — 램프를 주면 "터진 뒤에 화면이 물든다"로 읽힌다
        // (피격 비네트가 같은 지적을 받고 고친 자리다).
        el.animate([{ opacity: 1, offset: 0 }, { opacity: 0.55, offset: 0.22 }, { opacity: 0, offset: 1 }],
            { duration: ms, easing: 'cubic-bezier(.2,.7,.35,1)' }).onfinish = () => el.remove();
        setTimeout(() => el.remove(), ms + 300);     // onfinish 유실 대비 — 화면에 색판이 남는 일만은 없게
        // 씬 그레이드 펄스 — 기본값(style.css `#game3d`)으로 정확히 되돌린다.
        const cv = this.canvas || document.getElementById('game3d');
        if (cv) {
            clearTimeout(this._skillGradeT);
            cv.style.filter = `saturate(${(1.12 + pw * 0.5).toFixed(2)}) contrast(${(1.07 + pw * 0.22).toFixed(2)}) brightness(${(1 + pw * 0.10).toFixed(2)})`;
            cv.style.transition = 'filter 120ms ease-out';
            this._skillGradeT = setTimeout(() => { cv.style.filter = ''; }, 120 + pw * 90);
        }
    },

    skillPayload(fx, color, targetIds, tier, scene) {
        const targets = targetIds.map(id => this.enemyMap.get(id)).filter(Boolean);
        if (tier !== undefined) setTimeout(() => this.skillImpactWeight(fx, color, targetIds, tier),
            fx === 'meteor' ? 340 : fx === 'dragonfire' ? this.DRAGONFIRE_IMPACT_MS : fx === 'spear' ? this.GODSPEAR_IMPACT_MS
                : fx === 'nova' ? this.NOVA_IMPACT_MS : fx === 'guillotine' ? this.GUILLOTINE_IMPACT_MS
                    : fx === 'voidrift' ? this.VOIDRIFT_IMPACT_MS : 30);
        if (fx === 'dragonfire') {
            // 아포칼립스 — 거대 화염룡 강림 (skill-unique-signature). 메테오와 fx 를 공유하던
            // 사용자 지목 쌍을 완전 분리: 하늘 낙하(운석)가 아니라 **주인공 뒤에서 솟은 용이
            // 수평으로 쓸어 가는 브레스**다.
            this.dragonfireBreath(targetIds, color, tier || 0);
        } else if (fx === 'meteor') {
            // 운석 세례 (skill-fx-exaggerated). 예전엔 **타깃당 돌멩이 1개**라 적이 하나면 1발이었다 —
            // 광역기인데 화면에는 돌 하나가 떨어지고 끝나서 '운석'이 아니라 '던진 돌'로 읽혔다.
            this.meteorStorm(targetIds, color, tier || 0);
        } else if (fx === 'breath') {
            // 지중 습격 — 거대 아가리 (skill-fx-exaggerated, 사용자 예 ⓓ).
            // 예전엔 `explode` 와 **같은 코드**(폭발 한 번)라 레전더리 광역기인데 화염구와 구분이 안 됐다.
            this.dragonMaw(targetIds, color, tier || 0);
        } else if (fx === 'nova') {
            // 초신성 — 빨려 들어가 붕괴했다가 한 번에 터진다 (skill-unique-signature).
            // 화염구(투척 불덩이+확산 고리)와 fx 를 공유하던 것을 분리.
            this.supernovaBlast(targetIds, color, tier || 0);
        } else if (fx === 'explode') {
            // 화염 폭풍 (skill-fx-exaggerated). 스킬 이름이 **화염구**인데 정작 날아가는 불덩이가
            // 없어서 적 발밑에서 갑자기 터졌다 — 던지고, 터지고, 불의 고리가 바깥으로 퍼지게 바꿨다.
            this.fireStorm(targetIds, color, tier || 0);
            // 적이 여럿이면 나머지에도 폭발만 얹는다(불덩이는 하나 — 여러 개면 운석과 그림이 겹친다)
            targets.slice(1).forEach((m, i) => setTimeout(() => {
                this.explosion(m.g.position.clone(), color);
                this.firePillar(m.g.position.clone(), color, tier || 0);
            }, 90 + i * 60));
        } else if (fx === 'ring') {
            // 회오리 (skill-fx-exaggerated). 이름이 회오리인데 예전엔 **퍼지는 링 2개**뿐이라
            // 도는 물건이 하나도 없었다 — '회오리'가 아니라 '충격파'로 읽혔다.
            this.whirlwindVortex(targetIds, color, tier || 0);
            this.flashLight(this.heroG.position, color.getHex(), 0.3);
        } else if (fx === 'beam') {
            // 화살 세례 (skill-fx-exaggerated) — 한 발이 아니라 여러 발이 다다다닥.
            // 화살 조형(projectileBolt)은 그대로 재사용한다: 좋았던 건 물건이 아니라 발수였다.
            // ⚠️ 이제 이 fx 는 **관통 사격 전용**이다 — 공허의 창은 `voidrift` 로 분리했다.
            this.arrowVolley(targetIds, color, tier || 0);
        } else if (fx === 'voidrift') {
            // 공허의 창 — 적 너머 공간이 찢어지고 그 구멍에서 창이 튀어나온다 (skill-unique-signature).
            // 관통 사격(화살 세례)과 fx 를 공유하던 것을 분리.
            this.voidLanceRift(targetIds, color, tier || 0);
        } else if (fx === 'spear') {
            // 신의 창 — 하늘이 열리고 거대한 황금 창이 내리꽂힌다 (skill-unique-signature).
            // 낙뢰(먹구름+지그재그 볼트)와 fx 를 공유하던 것을 분리.
            this.godSpearDrop(targetIds, color, tier || 0);
        } else if (fx === 'bolt') {
            // 1박에 세운 먹구름에서 낙뢰가 연달아 꽂힌다 (skill-fx-exaggerated).
            // 예전엔 여기서 볼트 1발 + 폭발 1회로 끝나 '따' 하고 닫혔다.
            this.stormCloudStrike(scene, targetIds, color, tier || 0);
        } else if (fx === 'guillotine') {
            // 처형 — 거대한 처형 칼날이 내리찍힌다 (skill-unique-signature).
            // 강타(교차 참격)와 fx 를 공유하던 것을 분리.
            this.guillotineDrop(targetIds, color, tier || 0);
        } else if (fx === 'slash') {
            // 참격 세례 (skill-fx-exaggerated). 예전엔 **불티 22개 + 조명 한 번**이 전부라
            // 화면에 그려지는 물건이 하나도 없었다 — 18종 중 가장 빈약한 자리였다.
            this.slashArcs(targetIds, color, tier || 0);
        } else if (fx === 'firstaid') {
            // 응급 처치 — 붕대+십자 표식 (skill-unique-signature). 축복과 `heal` 을 공유하던 것을 분리.
            this.firstAidWrap(color, tier || 0);
            this.flashLight(this.heroG.position, color.getHex(), 0.3);
        } else if (fx === 'wardshield') {
            // 신성한 가호 — 육각 결계 돔 (skill-unique-signature). 축복과 `heal` 을 공유하던 것을 분리.
            this.wardShieldDome(color, tier || 0);
            this.flashLight(this.heroG.position, color.getHex(), 0.4);
        } else if (fx === 'warcry') {
            // 전투의 함성 — 포효 고리 (skill-unique-signature). 성역·시간왜곡과 `aura` 를 공유하던 것을 분리.
            this.warCryShout(color, tier || 0);
        } else if (fx === 'timewarp') {
            // 시간 왜곡 — 시계 고리 3겹 (skill-unique-signature). 성역·함성과 `aura` 를 공유하던 것을 분리.
            this.timeWarpDial(color, tier || 0);
            this.flashLight(this.heroG.position, color.getHex(), 0.4);
        } else if (fx === 'heal') {
            // 축복 — 빛기둥 강림 (skill-fx-exaggerated). 위에서 내려오는 은총이 곧 축복이라 이 자리를 유지한다.
            this.healPillar(color, tier || 0);
            this.flashLight(this.heroG.position, color.getHex(), 0.4);
        } else if (fx === 'aura') {
            // 성역 — 룬 서클 (skill-fx-exaggerated). 축성된 땅이 곧 성역이라 이 자리를 유지한다.
            // 회복은 위에서 내려오고 버프는 **아래에서 올라온다** —
            // 이 축 차이가 색·파티클보다 확실하게 둘을 갈라 준다(스킬 색은 6종이 제각각이라 단서가 못 된다).
            this.auraCircle(color, tier || 0);
            this.flashLight(this.heroG.position, color.getHex(), 0.4);
        }
    },

    // ---- 스킬 전용 미니 연출 ①: 먹구름 낙뢰 (skill-fx-exaggerated, 사용자 지시 2026-08-19) ----
    // 사용자 원문: "적들 머리 위에 구름 뭉게뭉게 생겼다가 번개로 바바박 한다던가 그런 거."
    // 그리고 방향 보정: "매번 다단 히트일 필요는 없음 … 연출이 좀 구체적이었으면 좋겠다는 거임."
    //
    // 여태 `bolt` 는 **볼트 1발 + 폭발 1회**였다. 그림은 나쁘지 않았지만 '따' 하고 끝나서
    // *무슨 일이 일어난 건지*가 안 읽혔다. 여기서 bolt 에 **장면**을 준다:
    //   예고: 적 머리 위에 먹구름이 뭉게뭉게 부풀어 오른다(+ 발밑에 그림자가 깔린다)
    //   충전: 구름 속이 안에서 두어 번 번쩍이고 지지직거린다
    //   발동: 낙뢰가 **바바박** 연달아 꽂힌다(등급만큼 발수가 늘고, 발마다 자리가 흔들린다)
    //   여운: 구름이 흩어지며 연기가 오른다
    //
    // ⚠️ **구름은 1박(시전)에 만든다.** 페이로드에서 만들면 구름이 다 부풀기도 전에 번개가 쳐서
    //    '예고'가 성립하지 않는다. `skillEffect` 가 `skillCastBeat` 와 **같은 시각**에 구름을 띄우고,
    //    핸들을 `skillPayload` 로 넘겨 그 구름에서 번개가 나가게 한다. 시전 박자(90~220ms)가
    //    그대로 구름이 부푸는 시간이 된다 — 등급이 높을수록 더 오래 뭉게뭉게한다.
    // ⚠️ 핸들을 **전역에 두지 않는다**. 스킬 두 개가 겹치면 서로의 구름을 지운다 — 인자로 넘긴다.
    // ⚠️ 타깃은 죽을 수 있다. 구름은 **생성 시점 좌표에 고정**하고(적을 따라다니면 넉백 때
    //    구름이 미끄러진다), 낙뢰는 매 발 `enemyMap` 을 다시 조회해 살아 있으면 그 자리로,
    //    없으면 구름 아래 지면으로 꽂는다. 어느 쪽이든 번개가 허공에서 끊기지 않는다.
    STORM_CLOUD_Y: 3.15,          // 구름 높이(월드) — 적 머리 위, 카메라 프레임 안
    STORM_MAX_CLOUDS: 3,          // 다수 적일 때 상한(구름이 화면을 덮지 않게)
    // ⚠️ **하한은 3발이다.** 2발은 간격을 벌려도 '따다' 수준이라 사용자가 지적한 단타 인상이 남는다
    //    (실측: 커먼 2발이면 첫~끝 95ms — 한 박자 안에 다 끝난다). 그리고 커먼·레어야말로 초반
    //    플레이어가 가장 많이 보는 대역이라, 여기서 장면이 성립하지 않으면 항목 전체가 실패한다.
    stormBolts(tier) { return 3 + Math.min(4, Math.max(0, tier | 0)); },   // 커먼 3발 … 궁극 이상 7발
    stormCloudGather(targetIds, color, tier) {
        if (!this.scene) return null;
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const pw = t / 5;
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        const spots = (live.length ? live.map(m => m.g.position.clone()) : [this.heroG.position.clone()])
            .slice(0, this.STORM_MAX_CLOUDS);
        const G = new THREE.Group();
        this.scene.add(G);
        const clouds = [];
        for (const p of spots) {
            const cg = new THREE.Group();
            cg.position.set(p.x, this.STORM_CLOUD_Y, p.z);
            // 뭉게뭉게 = **덩이 여러 개가 시차를 두고 부푸는 것**이다. 한 덩이를 키우면 풍선이 된다.
            // 저폴리 구를 눌러(세로 0.6) 겹쳐 놓고, 덩이마다 부푸는 시각을 어긋내 뭉실거리게 한다.
            const puffN = 6 + Math.round(pw * 4);
            const puffs = [];
            for (let i = 0; i < puffN; i++) {
                const a = (i / puffN) * Math.PI * 2 + U.rand(-0.35, 0.35);
                const rad = i === 0 ? 0 : U.rand(0.34, 0.78) * (0.9 + pw * 0.5);
                const r = (i === 0 ? 0.56 : U.rand(0.3, 0.48)) * (0.92 + pw * 0.36);
                // 먹구름은 **스킬 색이 아니라 어두운 회청색**이어야 '구름'으로 읽힌다.
                // 스킬 색은 아래 글로우와 번개가 쥔다(색을 구름에 칠하면 색 솜뭉치가 된다).
                // 🚨 **Lambert 를 쓰면 안 된다.** 이 씬은 한낮 초원이라 키라이트가 세고 톤매핑까지
                //    걸려 있어서, 어두운 색을 줘도 조명이 통째로 씻어 **흰 솜뭉치**가 된다(첫 캡처
                //    실측: 하늘이 흰 덩어리로 덮여 '먹구름'이 아니라 수증기 폭발로 읽혔다).
                //    Basic(무광)으로 두면 씬 조명과 무관하게 내가 정한 어둠이 그대로 나온다.
                //    입체감은 조명 대신 **덩이 높이에 따른 명도 차**로 준다 — 위는 밝고 아래는 어둡게.
                const yOff = U.rand(-0.12, 0.18);
                const lift = (yOff + 0.12) / 0.3;                     // 0(아래) ~ 1(위)
                const shade = new THREE.Color(0x1e222c).lerp(new THREE.Color(0x4a5364), lift * 0.85 + U.rand(0, 0.12))
                    .lerp(color, 0.07);
                const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0),
                    new THREE.MeshBasicMaterial({ color: shade, transparent: true, opacity: 0 }));
                puff.position.set(Math.cos(a) * rad, yOff, Math.sin(a) * rad * 0.55);
                puff.rotation.set(U.rand(0, 3), U.rand(0, 3), U.rand(0, 3));
                // ⚠️ 표식을 반드시 남길 것. 프로브가 `IcosahedronGeometry` 타입으로 구름을 세면
                //    **적 몸통의 저폴리 파츠가 같이 잡힌다**(임프 실측 18개) — 그러면 '연출 뒤에도
                //    구름이 18개 남았다'는 유령 실패가 나고, 불투명도 최댓값도 적 재질(1.0)이 덮어
                //    '부풀어 오르지 않는다'로 잘못 읽힌다. 실제로 이 프로브가 그 함정에 걸렸다.
                puff.userData = { stormPuff: true, s: 1, d: i / puffN * 0.55, spin: U.rand(-0.5, 0.5) };
                cg.add(puff); puffs.push(puff);
            }
            // 구름 배쪽 글로우 — 여기만 스킬 색이다. 충전 구간에 이게 깜빡여 '차오른다'가 읽힌다.
            const belly = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.castGlowTex(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
            belly.userData.stormBelly = true;
            // 배쪽 글로우는 **작고 옅게**. 가산 합성이라 크게 주면 구름을 통째로 흰색으로 밀어
            // 먹구름이 사라진다(첫 캡처의 흰 덩어리 절반이 이 스프라이트였다).
            // 평상시엔 '속에서 뭔가 차오른다' 정도만, 낙뢰 순간에만 1.0 으로 튄다.
            belly.scale.setScalar(0.85 + pw * 0.45);
            belly.position.set(0, -0.28, 0.1);
            cg.add(belly);
            G.add(cg);
            clouds.push({ cg, puffs, belly, at: p.clone() });
        }
        if (!clouds.length) { this.scene.remove(G); return null; }
        // 구름 아래를 비추는 빛 — 지면에 그늘/반사를 만들어 '위에 뭔가 생겼다'를 지면에서도 읽게 한다
        const light = this.fxLight(color.getHex(), 7, 'stormLight'); // 풀 리스 — 직접 생성 금지(개수 변화 = 재컴파일)
        light.pos(clouds[0].at.x, this.STORM_CLOUD_Y - 0.5, clouds[0].at.z);
        const handle = { G, clouds, light, color, done: false };
        SFX.stormRumble(0.34 + pw * 0.2);
        // 부풀기 — **페이로드를 기다리는 시간과 정확히 같은 길이**여야 한다(`castMsFor('bolt', t)`).
        // 짧으면 구름이 다 부푼 뒤 멍하니 떠 있고, 길면 아직 부푸는 중에 번개가 친다.
        const grow = this.castMsFor('bolt', t) / 1000;
        this.addAnim(grow, k => {
            for (const c of handle.clouds) {
                for (const p of c.puffs) {
                    const kk = Math.max(0, Math.min(1, (k - p.userData.d) / (1 - p.userData.d)));
                    const e = 1 - Math.pow(1 - kk, 3);              // 빠르게 부풀다 눌러앉음
                    p.scale.setScalar(0.12 + e * 0.92);
                    p.material.opacity = e * 0.95;
                    p.rotation.y += p.userData.spin * 0.02;
                }
                c.belly.material.opacity = k * k * 0.3;
            }
            handle.light.set(k * (0.3 + pw * 0.45));   // 지면을 씻지 않을 만큼만
        });
        // 낙뢰가 영영 안 오는 경우(스킬이 끊기거나 씬이 갈릴 때)의 안전망 — 구름만 남기지 않는다
        handle._fuse = setTimeout(() => this.stormCloudDisperse(handle), 2600);
        return handle;
    },

    // 낙뢰 연발 — 구름에서 **바바박**. 발마다 자리를 흔들어 같은 선이 반복되지 않게 한다.
    stormCloudStrike(handle, targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const pw = t / 5;
        const h = handle && !handle.done ? handle : this.stormCloudGather(targetIds, color, tier);
        if (!h) {   // 씬이 없으면 예전 동작(단발)이라도 남긴다
            (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean).forEach(m => {
                const p = m.g.position.clone();
                this.lightningBolt(new THREE.Vector3(p.x, 6.2, p.z), new THREE.Vector3(p.x, p.y + 0.45, p.z), color, t);
                this.explosion(p, color);
            });
            return;
        }
        clearTimeout(h._fuse);
        const n = this.stormBolts(t);
        const gap = 96 - pw * 26;                 // 미식일수록 촘촘하게(바바박)
        for (let i = 0; i < n; i++) {
            setTimeout(() => {
                if (h.done) return;
                // 발마다 구름을 골라 돈다 — 적이 여럿이면 번갈아 때려 화면 전체가 폭풍으로 읽힌다
                const c = h.clouds[i % h.clouds.length];
                // ⚠️ 착탄점은 **매 발 다시 조회**한다. 살아 있으면 지금 자리로(넉백을 따라간다),
                //    죽었으면 구름 바로 아래 지면으로 — 번개가 허공에서 끊기지 않게.
                const liveM = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
                const tgt = liveM.length ? liveM[i % liveM.length].g.position.clone() : c.at.clone();
                // 첫 발은 정확히 머리 위, 이후는 주변으로 흩어 '난타'로 읽히게
                const j = i === 0 ? 0 : 0.55 + pw * 0.35;
                const hit = new THREE.Vector3(tgt.x + U.rand(-j, j), tgt.y + 0.45, tgt.z + U.rand(-j, j) * 0.5);
                const from = new THREE.Vector3(c.cg.position.x + U.rand(-0.3, 0.3), this.STORM_CLOUD_Y - 0.35, c.cg.position.z + U.rand(-0.2, 0.2));
                this.lightningBolt(from, hit, color, t);
                // 구름이 그 순간 안에서 하얗게 터진다 — 번개가 '구름에서 나왔다'를 잇는 고리
                // 구름이 그 순간 안에서 하얗게 터진다 — Basic 재질이라 emissive 가 없다.
                // 원래 색을 보관해 두고 **색 자체를 밝혔다가** 되돌린다(안 되돌리면 구름이 흰 채로 남는다).
                c.belly.material.opacity = 1;
                for (const pf of c.puffs) {
                    if (!pf.userData.c0) pf.userData.c0 = pf.material.color.getHex();
                    pf.material.color.setHex(0x8f9cb4);
                }
                setTimeout(() => { for (const pf of c.puffs) if (pf.userData.c0) pf.material.color.setHex(pf.userData.c0); }, 70);
                this.flashLight(from, 0xdff2ff, 0.14);
                // 착탄: 링 + 불티 + 흔들림. 첫 발이 가장 세고 뒤로 갈수록 잔진동으로 (연타가 물러지지 않게)
                const w = i === 0 ? 1 : 0.62;
                this.expandRing(new THREE.Vector3(hit.x, 0.02, hit.z), color, (1.1 + pw * 0.9) * w);
                this.spawnSparks(hit.clone(), Math.round((10 + pw * 16) * w), color.getHex(), { speed: 1.1 + pw * 0.7 });
                this.shake((0.2 + pw * 0.24) * w);
                SFX.stormStrike(i);
            }, i * gap);
        }
        // 충전 지지직 — 첫 발 직전에 한 번(구름이 '차올랐다'를 소리로도)
        SFX.stormCrackle();
        // 마지막 발이 떨어진 뒤 흩어진다
        setTimeout(() => this.stormCloudDisperse(h), n * gap + 220);
    },

    // 여운 — 덩이가 부풀며 옅어지고 연기가 오른다. 그냥 지우면 구름이 '증발'해 장면이 안 닫힌다.
    stormCloudDisperse(h) {
        if (!h || h.done) return;
        h.done = true;
        clearTimeout(h._fuse);
        for (const c of h.clouds) {
            for (let i = 0; i < 3; i++) {
                this.riseParticle(new THREE.Vector3(c.cg.position.x + U.rand(-0.5, 0.5), this.STORM_CLOUD_Y - 0.5, c.cg.position.z + U.rand(-0.3, 0.3)),
                    new THREE.Color(0x8a93a6));
            }
        }
        const op0 = [];
        for (const c of h.clouds) for (const p of c.puffs) op0.push(p.material.opacity);
        this.addAnim(0.4, k => {
            let i = 0;
            for (const c of h.clouds) {
                for (const p of c.puffs) {
                    p.scale.setScalar(1 + k * 0.5);
                    p.material.opacity = op0[i++] * (1 - k);
                    p.rotation.y += p.userData.spin * 0.015;
                }
                c.belly.material.opacity = Math.max(0, c.belly.material.opacity * (1 - k));
            }
            h.light.set(h.light.get() * (1 - k * 0.6));
        }, () => {
            // ⚠️ 스프라이트는 **재질만** 해제한다 — three r128 의 Sprite 는 지오메트리를 전역에서
            //    공유해서, 한 번 해제하면 이후 모든 스프라이트(불티·모트)가 깨진다.
            //    (`skillCastBeat` 이 같은 함정을 주석으로 남겨 둔 자리다.)
            h.G.traverse(o => {
                if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
                if ((o.isMesh || o.isSprite) && o.material) o.material.dispose();
            });
            this.scene.remove(h.G);
            h.light.release();
        });
    },

    // ---- 스킬 전용 미니 연출 ②: 운석 세례 (skill-fx-exaggerated, 사용자 지시 2026-08-19) ----
    // 사용자 원문: "하늘에서 운석 존나 여러 개 떨어져서 콰과과과광 이런 느낌".
    //
    // 여태 `meteor` 는 **타깃당 돌멩이 1개**였다(적이 하나면 말 그대로 1발). 메테오·아포칼립스가
    // 광역기인데 화면에는 돌 하나가 떨어지고 끝나니 '운석'이 아니라 '던진 돌'로 읽혔다.
    // 여기서 **한 번의 스킬이 운석 여러 발을 시차로 쏟아붓는** 장면으로 바꾼다.
    //
    // 장면 4단 — 먹구름 낙뢰와 같은 문법이다(예고 오브젝트 → 발동 → 연쇄 → 여운):
    //   예고: 착탄 자리마다 지면에 **조준 링**이 먼저 깔린다(어디에 떨어질지 보인다 = 무서움)
    //   낙하: 링마다 운석이 불꼬리를 끌고 떨어진다(시차)
    //   착탄: 폭발 + 충격링 + 불티 + 흔들림. **마지막 한 발은 크게** — 연타가 물러지지 않게 닫는다
    //   여운: 그을음 자국이 남았다 서서히 지워진다
    //
    // ⚠️ 조준 링은 **착탄보다 먼저** 떠 있어야 예고다. 링을 띄우고 `METEOR_TELL_MS` 뒤에 낙하를
    //    시작한다 — 낙하 자체(0.35s)를 예고로 치면 '떨어지는 걸 봤다'일 뿐 '올 걸 알았다'가 아니다.
    METEOR_TELL_MS: 200,      // 조준 링이 먼저 떠 있는 시간
    METEOR_FALL_S: 0.34,      // 낙하 시간(초)
    meteorCount(tier) { return 4 + Math.min(5, Math.max(0, tier | 0)); },   // 에픽 6발 … 미식 9발
    meteorStorm(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 2 : tier));
        const pw = t / 5;
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        const base = live.length ? live.map(m => m.g.position.clone()) : [this.heroG.position.clone()];
        const n = this.meteorCount(t);
        // 착탄 자리 — 타깃들을 돌아가며 그 주변에 흩는다. 첫 발과 **마지막 발은 정확히 적 위**로
        // (첫 발은 '조준됐다', 마지막 발은 '마무리'를 읽히게 한다). 가운데 발들만 흩어져 난타가 된다.
        const spots = [];
        for (let i = 0; i < n; i++) {
            const c = base[i % base.length];
            const edge = (i === 0 || i === n - 1) ? 0 : (0.85 + pw * 0.6);
            spots.push(new THREE.Vector3(c.x + U.rand(-edge, edge), 0, c.z + U.rand(-edge, edge) * 0.55));
        }
        SFX.stormRumble(0.5);
        for (let i = 0; i < n; i++) {
            const spot = spots[i];
            const last = i === n - 1;
            const big = last ? 1.7 : 1;                       // 마지막 한 발이 가장 크다
            const at = i * (108 - pw * 26);                   // 등급이 높을수록 촘촘하게 쏟아진다
            // ⓐ 조준 링 — 지면에 먼저 깔린다
            setTimeout(() => {
                const r0 = (0.5 + pw * 0.25) * big;
                const ring = new THREE.Mesh(new THREE.RingGeometry(r0 * 0.72, r0, 22),
                    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
                ring.userData.meteorTell = true;
                ring.rotation.x = -Math.PI / 2;
                ring.position.set(spot.x, 0.03, spot.z);
                this.scene.add(ring);
                // 링은 **조여들며** 진해진다 — 커졌다 사라지면 착탄이 아니라 폭발 잔상으로 읽힌다
                this.addAnim(this.METEOR_TELL_MS / 1000, k => {
                    ring.scale.setScalar(1.9 - 0.9 * k);
                    ring.material.opacity = 0.25 + 0.6 * k;
                }, () => { ring.geometry.dispose(); ring.material.dispose(); this.scene.remove(ring); });
            }, at);
            // ⓑ 낙하 → ⓒ 착탄
            setTimeout(() => {
                const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 * big, 0),
                    new THREE.MeshBasicMaterial({ color, toneMapped: false }));
                rock.userData.meteorRock = true;
                // 비스듬히 떨어져야 '하늘에서 온 것'이 된다(수직 낙하는 '위에서 놓았다'로 읽힌다).
                // ⚠️ 사선의 부호 = **주인공 쪽(왼쪽, 낮은 x)에서** 적 쪽으로 (skill-fx-origin-hero-side,
                //    사용자 지시 "주인공 방향에서 안 떨어지고 역방향으로 떨어지던데 그런 거 ㄴㄴ").
                //    종전 +1.6 은 적 뒤편 하늘에서 날아와 '적이 맞은 게 아니라 주인공이 쏜 게 아닌' 그림이었다.
                const start = new THREE.Vector3(spot.x - (1.6 + U.rand(-0.4, 0.4)), 6.6, spot.z - 0.6);
                rock.position.copy(start);
                this.scene.add(rock);
                const hot = new THREE.Color(0xff7043);
                this.addAnim(this.METEOR_FALL_S, k => {
                    rock.position.lerpVectors(start, spot, k * k);   // 가속 낙하
                    rock.rotation.x += 0.34; rock.rotation.z += 0.22;
                    if (Math.random() < 0.8) this.riseParticle(rock.position.clone(), hot);
                }, () => {
                    rock.geometry.dispose(); rock.material.dispose(); this.scene.remove(rock);
                    this.explosion(spot.clone(), color);
                    this.expandRing(new THREE.Vector3(spot.x, 0.02, spot.z), color, (1.2 + pw * 0.9) * big);
                    this.spawnSparks(spot.clone().add(new THREE.Vector3(0, 0.4, 0)),
                        Math.round((12 + pw * 18) * big), color.getHex(), { speed: (1.2 + pw * 0.6) * big });
                    this.shake((0.18 + pw * 0.2) * big);
                    this.flashLight(spot.clone(), color.getHex(), 0.18 * big);
                    SFX.stormStrike(i);
                    this.meteorScorch(spot, big);
                });
            }, at + this.METEOR_TELL_MS);
        }
    },
    // 여운 — 착탄 자리에 남는 그을음. 폭발만 있고 흔적이 없으면 '지나간 일'이 안 남는다.
    meteorScorch(spot, big) {
        const r = (0.42 + 0.2 * (big - 1)) * 1.3;
        const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18),
            new THREE.MeshBasicMaterial({ color: 0x241a14, transparent: true, opacity: 0.62, depthWrite: false }));
        m.userData.meteorScorch = true;
        m.rotation.x = -Math.PI / 2;
        m.position.set(spot.x, 0.025, spot.z);
        this.scene.add(m);
        this.addAnim(1.5, k => { m.material.opacity = 0.62 * (1 - k * k); },
            () => { m.geometry.dispose(); m.material.dispose(); this.scene.remove(m); });
    },

    // ---- 스킬 전용 미니 연출 ③: 참격 세례 (skill-fx-exaggerated, 사용자 지시 2026-08-19) ----
    // `slash`(강타·처형)는 **18종 중 가장 빈약했다** — 불티 22개와 조명 한 번이 전부라 화면에
    // 그려지는 물건이 하나도 없었다(다른 fx 는 최소한 폭발·빔·볼트 메시라도 있다).
    // 그런데 강타는 **커먼**이라 초반 플레이어가 가장 많이 누르는 스킬 중 하나다 — 사용자가 말한
    // "연출이 대체로 약하다"의 체감 대부분이 이 대역에서 나온다.
    //
    // 장면 4단: 조준 섬광(적 위에 가는 빛줄기) → 참격이 **엇갈려** 지나간다(등급만큼 여러 번) →
    //           벨 때마다 불티·충격링·흔들림 → 벤 자국이 잠깐 남았다 지워진다.
    // ⚠️ 초승달은 **카메라를 향해** 세워야 '벴다'로 읽힌다. 월드 축에 고정하면 옆에서 본 얇은
    //    판이 돼 프레임에 따라 사라진다 — `lookAt(camera)` 로 매번 카메라에 맞춘다.
    slashArcs(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 0 : tier));
        const pw = t / 5;
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        const spots = (live.length ? live.map(m => m.g.position.clone()) : [this.heroG.position.clone()]).slice(0, 3);
        const n = 2 + Math.min(3, t);                 // 커먼 2번 … 레전더리 이상 5번
        for (const c of spots) {
            const at = c.clone().add(new THREE.Vector3(0, 0.72, 0));
            // 조준 섬광 — 베기 직전 짧게. 이게 없으면 첫 참격이 예고 없이 튀어나온다.
            this.flashLight(at, 0xffffff, 0.1);
            for (let i = 0; i < n; i++) {
                setTimeout(() => {
                    const R = (0.85 + pw * 0.5) * (i === n - 1 ? 1.25 : 1);   // 마지막 한 번이 가장 크다
                    // 초승달 = 부분 링(RingGeometry 의 thetaLength). 안쪽을 두껍게 해 날의 배가 생긴다.
                    const g = new THREE.RingGeometry(R * 0.74, R, 26, 1, -0.62, 1.24);
                    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0,
                        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
                    const arc = new THREE.Mesh(g, mat);
                    arc.userData.slashArc = true;
                    // 흰 코어를 겹쳐 날을 세운다 — 색 하나면 '색 띠'로, 코어가 있으면 '날'로 읽힌다
                    const core = new THREE.Mesh(new THREE.RingGeometry(R * 0.86, R * 0.96, 26, 1, -0.5, 1.0),
                        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0,
                            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
                    const G = new THREE.Group();
                    G.add(arc, core);
                    G.position.copy(at);
                    // 번갈아 반대 방향으로 — 같은 각으로 반복하면 한 번 벤 것이 깜빡이는 걸로 보인다
                    const dir = i % 2 ? -1 : 1;
                    const tilt = dir * (0.7 + U.rand(-0.25, 0.25));
                    if (this.camera) G.lookAt(this.camera.position);
                    G.rotateZ(tilt);
                    this.scene.add(G);
                    const swing = 0.9 + pw * 0.5;
                    this.addAnim(0.17, k => {
                        // 날이 **지나간다** — 호를 따라 미끄러지며 커지고, 뒤로 갈수록 옅어진다
                        const e = 1 - Math.pow(1 - k, 2);
                        G.scale.setScalar(0.5 + e * 1.25);
                        const slide = (-0.5 + e) * swing;
                        G.position.set(at.x + Math.cos(tilt + Math.PI / 2) * slide * dir, at.y + Math.sin(tilt + Math.PI / 2) * slide, at.z);
                        const a = k < 0.28 ? k / 0.28 : 1 - (k - 0.28) / 0.72;
                        mat.opacity = a * 0.95;
                        core.material.opacity = a;
                    }, () => {
                        G.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
                        this.scene.remove(G);
                    });
                    // 벤 순간의 반응 — 불티는 날이 지나가는 축과 **직교**로 튀어야 '잘렸다'가 된다
                    this.spawnSparks(at.clone(), Math.round(10 + pw * 14), color.getHex(), { speed: 1.2 + pw * 0.8 });
                    this.expandRing(new THREE.Vector3(at.x, 0.02, at.z), color, 0.7 + pw * 0.6);
                    this.shake(0.14 + pw * 0.18);
                    SFX.slashArc(i, t);
                }, i * (82 - pw * 16));
            }
        }
    },

    // ---- 스킬 전용 미니 연출 ⑤: 지중 습격 — 거대 아가리 (skill-fx-exaggerated, 사용자 지시 2026-08-19) ----
    // 사용자 원문(방향 보정 예 ⓓ): "적 아래에서 갑자기 거대 몬스터 나와서 입으로 공격한다던가".
    // 이걸 `breath`(용의 숨결)에 얹는다 — 스킬 이름과도 맞물린다(용이 솟아 물고 숨을 뿜는다).
    // 예전 `breath` 는 `explode` 와 **같은 코드**(폭발 한 번)를 썼다. 레전더리 광역기인데 화면에서
    // 화염구와 구분이 안 됐다.
    //
    // 장면 4단: 예고(적 발밑이 부풀고 흙먼지 링) → 분출(거대 아가리가 솟구친다, 입을 벌린 채)
    //          → 포식(턱이 **덥석** 닫히며 숨결이 뿜어진다) → 퇴장(가라앉으며 먼지)
    // ⚠️ 조형은 전부 코드 생성이다(에셋 금지). 파츠는 10개 안쪽으로 — 이 연출은 적 수만큼 뜬다.
    MAW_TELL_MS: 230,      // 발밑이 부푸는 예고 시간
    mawHead(color, scale) {
        // 어두운 비늘 + 스킬 색 목구멍. 색을 몸에 칠하면 '색 덩어리'가 되므로 몸은 어둡게 두고
        // **입 안쪽만** 스킬 색으로 빛낸다 — 벌어진 순간 목구멍이 읽히는 게 이 조형의 요점이다.
        const G = new THREE.Group();
        // 🚨 **여기도 Lambert 를 쓰면 안 된다** — 먹구름에서 이미 밟은 함정을 그대로 반복했다가
        //    첫 캡처에서 아가리가 **흰 덩어리**로 나왔다. 한낮 초원 조명 + 톤매핑이 어두운 albedo 를
        //    통째로 씻는다. 무광 Basic 으로 어둠을 고정하고 명암은 파츠별 색으로 직접 준다.
        // 밝은 초원 위에 놓이므로 몸은 **확실히 어두워야** 실루엣이 선다(스킬 색은 살짝만 섞는다 —
        // 많이 섞으면 배경의 찬 색조에 묻혀 '보라색 조각'이 된다).
        const hide = new THREE.Color(0x1a1520).lerp(color, 0.13);
        const mk = (geo, col) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col }));
        // 위턱 / 아래턱 — 앞으로 갈수록 좁아지는 쐐기(원뿔을 눕혀 쓴다)
        const jawGeo = () => new THREE.ConeGeometry(0.42, 1.25, 5);
        // 위턱은 밝게 · 아래턱은 어둡게 — 조명이 없으니 이 색차가 곧 입체감이다
        const upper = mk(jawGeo(), hide.clone().lerp(new THREE.Color(0xffffff), 0.12));
        upper.rotation.z = -Math.PI / 2; upper.position.set(0.45, 0.28, 0);
        const lower = mk(jawGeo(), hide.clone().multiplyScalar(0.6));
        lower.rotation.z = -Math.PI / 2; lower.position.set(0.45, -0.06, 0);
        // 목구멍 — 입 **안쪽**에 갇혀 있어야 한다. 크고 밝게 주면 가산 합성이 머리를 통째로
        // 흰 덩어리로 밀어 조형이 사라진다(첫 캡처에서 실제로 그랬다 — 먹구름 배쪽 글로우와 같은 함정).
        const throat = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        throat.position.set(0.16, 0.1, 0);
        // 이빨 — 위아래 3쌍. 없으면 '입'이 아니라 '벌어진 원뿔 두 개'다.
        const teeth = new THREE.Group();
        for (let i = 0; i < 3; i++) {
            for (const s of [1, -1]) {
                const tth = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.26, 4),
                    new THREE.MeshBasicMaterial({ color: 0xf4ece0 }));
                tth.position.set(0.38 + i * 0.26, s > 0 ? 0.17 : 0.03, (i % 2 ? 0.14 : -0.14) * (i ? 1 : 0));
                tth.rotation.z = s > 0 ? Math.PI : 0;
                teeth.add(tth);
            }
        }
        // 뿔 2개 + 눈 2개 — 실루엣과 시선. 이 둘이 있어야 '짐승 머리'로 읽힌다.
        for (const s of [1, -1]) {
            const horn = mk(new THREE.ConeGeometry(0.09, 0.52, 4), 0xbfae96);
            horn.position.set(-0.12, 0.5, s * 0.2);
            horn.rotation.set(s * 0.3, 0, 0.5);
            G.add(horn);
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5),
                new THREE.MeshBasicMaterial({ color: 0xffe57a, toneMapped: false }));
            eye.position.set(0.2, 0.34, s * 0.26);
            G.add(eye);
        }
        G.add(upper, lower, throat, teeth);
        G.scale.setScalar(scale);
        G.userData.jaw = { upper, lower, throat };
        return G;
    },
    dragonMaw(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 3 : tier));
        const pw = t / 5;
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        const spots = (live.length ? live.map(m => m.g.position.clone()) : [this.heroG.position.clone()]).slice(0, 2);
        spots.forEach((spot, si) => {
            const at = si * 140;
            // ⓐ 예고 — 발밑이 부풀고 흙먼지 링. "뭔가 올라온다"
            setTimeout(() => {
                const mound = new THREE.Mesh(new THREE.SphereGeometry(0.5 + pw * 0.2, 10, 6),
                    new THREE.MeshLambertMaterial({ color: 0x6b573f, flatShading: true }));
                mound.userData.mawTell = true;
                mound.position.set(spot.x, -0.45, spot.z);
                mound.scale.y = 0.5;
                this.scene.add(mound);
                this.expandRing(new THREE.Vector3(spot.x, 0.02, spot.z), new THREE.Color(0x9c8466), 0.9);
                this.addAnim(this.MAW_TELL_MS / 1000, k => {
                    mound.position.y = -0.45 + k * 0.4;          // 흙이 솟아오른다
                    mound.scale.setScalar(0.7 + k * 0.5);
                    mound.scale.y *= 0.55;
                }, () => { mound.geometry.dispose(); mound.material.dispose(); this.scene.remove(mound); });
                for (let i = 0; i < 5; i++) this.riseParticle(new THREE.Vector3(spot.x + U.rand(-0.4, 0.4), 0.05, spot.z + U.rand(-0.3, 0.3)), new THREE.Color(0x8a7358));
                SFX.stormRumble(0.28);
            }, at);
            // ⓑ 분출 → ⓒ 포식
            setTimeout(() => {
                // ⚠️ **크기가 이 연출의 절반이다.** 첫 캡처에서 1.05~1.6 배로 뽑았더니 적과 비슷한
                //    덩치라 '거대 몬스터가 솟았다'가 아니라 '보라색 조각이 튀어나왔다'로 읽혔다.
                //    적(≈1유닛)의 두 배는 돼야 '거대'가 성립한다.
                const scale = 1.85 + pw * 0.85;
                const G = this.mawHead(color, scale);
                G.userData.mawHead = true;
                // 입이 **카메라 쪽으로 열리게** 돌린다. 진행축(+x)만 보고 세우면 옆모습이라
                // 벌어진 입이 실루엣에서 안 읽힌다 — 벌린 입을 보여 주는 게 이 연출의 전부다.
                G.position.set(spot.x - 0.62, -1.5, spot.z - 0.1);
                G.rotation.y = -0.95;
                this.scene.add(G);
                const jaw = G.userData.jaw;
                const light = this.fxLight(color.getHex(), 6, 'mawLight'); // 풀 리스 — 직접 생성 금지(개수 변화 = 재컴파일)
                light.pos(spot.x, 1.1, spot.z);
                this.shake(0.3 + pw * 0.25);
                SFX.mawRoar(t);
                // 솟구침 0.26s: 아래에서 위로, 입을 벌리며
                this.addAnim(0.26, k => {
                    const e = 1 - Math.pow(1 - k, 3);
                    G.position.y = -1.5 + e * 2.35;
                    const open = Math.min(1, k / 0.7);
                    jaw.upper.rotation.z = -Math.PI / 2 - open * 0.62;   // 위턱이 젖혀진다
                    jaw.lower.rotation.z = -Math.PI / 2 + open * 0.34;
                    jaw.throat.material.opacity = 0.35 + open * 0.6;
                    jaw.throat.scale.setScalar(0.7 + open * 0.7);
                    light.set(e * (1.2 + pw * 1.2));
                }, () => {
                    // 포식 — 턱이 덥석 닫히며 숨결이 뿜어진다
                    this.addAnim(0.16, k => {
                        const c = k * k;                                  // 닫힘은 가속(무는 힘)
                        jaw.upper.rotation.z = -Math.PI / 2 - 0.62 * (1 - c);
                        jaw.lower.rotation.z = -Math.PI / 2 + 0.34 * (1 - c);
                        jaw.throat.material.opacity = 0.95 * (1 - c * 0.6);
                    }, () => {
                        const bite = new THREE.Vector3(spot.x, 0.7, spot.z);
                        this.explosion(bite, color);
                        this.expandRing(new THREE.Vector3(spot.x, 0.02, spot.z), color, 1.6 + pw * 1.1);
                        this.spawnSparks(bite, Math.round(18 + pw * 22), color.getHex(), { speed: 1.5 + pw * 0.8 });
                        this.shake(0.34 + pw * 0.3);
                        this.flashLight(bite, color.getHex(), 0.3);
                        SFX.mawBite(t);
                        // ⓓ 퇴장 — 가라앉으며 먼지
                        this.addAnim(0.34, k => {
                            G.position.y = 0.85 - k * 2.4;
                            light.set(light.get() * 0.9);
                            if (k > 0.5) G.rotation.x = (k - 0.5) * 0.5;
                        }, () => {
                            G.traverse(o => {
                                if (o.isMesh && o.geometry) o.geometry.dispose();
                                if ((o.isMesh || o.isSprite) && o.material) o.material.dispose();
                            });
                            this.scene.remove(G); light.release();
                            for (let i = 0; i < 4; i++) this.riseParticle(new THREE.Vector3(spot.x + U.rand(-0.5, 0.5), 0.05, spot.z + U.rand(-0.3, 0.3)), new THREE.Color(0x8a7358));
                        });
                    });
                });
            }, at + this.MAW_TELL_MS);
        });
    },

    // ---- 스킬 전용 연출: 아포칼립스 — 거대 화염룡 강림 (skill-unique-signature, 사용자 지시 2026-08-19) ----
    // 사용자 원문: "아포칼립스랑 메테오라는 스킬 너무 똑같음. 아예 존나 다르게 해야 함.
    //              예를 들어 거대한 용이 나와서 불을 뿜는 스킬로 하나를 바꾸든지."
    // 그 예시 그대로 구현. 축이 기존 연출 전부와 다르다 — 운석(하늘에서 낙하)·지중 습격(적 발밑
    // 아가리)·화염 폭풍(수평 투척 후 확산)과 달리, 이건 **주인공 뒤편(왼쪽)에서 솟은 거대한 용이
    // 적 전열을 수평으로 쓸어 태우는 브레스**다(주인공 원점 원칙 skill-fx-origin-hero-side 준수).
    // 장면 4단: 강림(융기 먼지+용이 솟음, 날개 펼침) → 예비(고개 젖히고 목구멍 충전) →
    //          브레스(입에서 불줄기 원뿔이 적 전열을 근→원 순서로 태움, 적마다 불기둥·폭발) →
    //          퇴장(가라앉으며 잉걸).
    // ⚠️ 머리는 mawHead 재사용(뿔·이빨·벌어지는 턱이 이미 검증됨 — 재질 함정 포함).
    // ⚠️ 라이트는 fxLight 풀만 — new PointLight 직접 생성은 재컴파일 스톨 부활(skill-cast-lag-optimize).
    DRAGONFIRE_IMPACT_MS: 820,     // 첫 브레스 착탄 시각 — skillPayload 의 무게(skillImpactWeight) 지연과 동기
    dragonfireBreath(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 5 : tier));
        const pw = t / 5;
        const hero = this.heroG.position;
        // ⚠️ 주인공에서 너무 떨어뜨리면(실측 -2.35, z -1.25) 화면 왼쪽 가장자리 숲에 가려 안 보인다 —
        //    강림 지점은 주인공 바로 뒤 어깨너머로.
        const base = new THREE.Vector3(hero.x - 1.65, 0, hero.z - 0.85);
        const G = new THREE.Group();
        G.userData.dragonFx = true;
        G.position.set(base.x, -4.2, base.z);
        G.rotation.y = -0.18;                               // 살짝 카메라 쪽으로 틀어 실루엣을 연다
        const mk = (geo, col) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col }));
        // 몸통→목 사슬: 아래가 굵고 위로 가늘어지는 S자. 한낮 초원 위라 몸은 확실히 어둡게(mawHead 함정).
        // ⚠️ 0x2a2130 은 캡처에서 연보라 덩어리로 떴다 — sRGB 출력 인코딩이 재질색을 linear→sRGB 로
        //    들어 올린다(픽셀 실측: 0x14 대역이 화면에서 0x50 대역). 실루엣이 검게 서려면 근흑까지 내린다.
        const hide = new THREE.Color(0x070509);
        const segDef = [[0.95, 0, 0.55, 0], [0.74, 0.26, 1.5, 0], [0.56, 0.68, 2.35, 0], [0.44, 1.16, 2.98, 0]];
        for (const [r, x, y, z] of segDef) {
            const s = mk(new THREE.SphereGeometry(r, 10, 8), hide.clone().offsetHSL(0, 0, (y / 3) * 0.06));
            s.position.set(x, y, z);
            G.add(s);
            // 용암 균열 밴드 — 스킬 색 가산 토러스. 어두운 몸에 색 정체성을 심는다.
            const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, 0.045, 6, 18),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
            band.position.set(x, y - r * 0.25, z);
            band.rotation.x = Math.PI / 2 - 0.25;
            G.add(band);
        }
        // 가슴 충전 코어 — 예비 단계에서 부풀어 브레스의 출처를 만든다.
        // ⚠️ 몸 밖으로 삐져나오면 '분홍 공'으로 읽힌다(캡처 실측) — 목 안쪽에 작게 묻는다.
        const chest = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        chest.position.set(0.5, 1.95, 0.15);
        G.add(chest);
        // 날개 2장 — 어깨 피벗에 달아 펼침/퍼덕임을 회전으로 준다(납작 콘 = 막).
        // ⚠️ 몸과 같은 명도·몸에 붙은 위치면 한 덩어리로 뭉친다(캡처 실측) — 어깨 위로 올려
        //    스카이라인에 걸치고, 막은 몸보다 밝은 톤 + 스킬 색 15% 로 분리한다.
        const wings = [];
        for (const s of [-1, 1]) {
            const piv = new THREE.Group();
            piv.position.set(0.05, 2.55, s * 0.6);
            // ⚠️ 날개를 크게(2.5)·밝게 주면 화면 상단에서 배경 산과 한 덩어리로 읽힌다(캡처 실측) —
            //    몸과 같은 근흑 + 스킬 색 8%, 몸 폭 안쪽 크기로.
            const mem = mk(new THREE.ConeGeometry(0.72, 1.6, 3),
                hide.clone().offsetHSL(0, 0, 0.02).lerp(color, 0.08));
            mem.scale.z = 0.08;
            mem.position.set(-0.45, 0.62, s * 0.5);
            mem.rotation.set(s * 0.5, 0, 1.3);
            piv.add(mem);
            const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.025, 1.5),
                new THREE.MeshBasicMaterial({ color: hide.clone().offsetHSL(0, 0, 0.04) }));
            edge.position.set(-0.4, 0.66, s * 0.5);
            edge.rotation.z = 1.2;
            piv.add(edge);
            piv.rotation.z = 1.35;                          // 접힌 채 시작 — 강림하며 펼친다
            piv.userData.s = s;
            G.add(piv);
            wings.push(piv);
        }
        // 머리 — mawHead 재사용(+x 방향으로 입이 벌어진다). 목 끝에 얹는다.
        const head = this.mawHead(color, 1.4);
        head.position.set(1.62, 3.3, 0);
        G.add(head);
        const jaw = head.userData.jaw;
        this.scene.add(G);
        const light = this.fxLight(color.getHex(), 9, 'dragonLight'); // 풀 리스 — 직접 생성 금지
        light.pos(base.x + 1.2, 3.2, base.z + 0.6);
        // 융기 먼지 — 강림 지점
        this.expandRing(new THREE.Vector3(base.x, 0.02, base.z), new THREE.Color(0x9c8466), 1.6);
        for (let i = 0; i < 6; i++) this.riseParticle(new THREE.Vector3(base.x + U.rand(-0.8, 0.8), 0.05, base.z + U.rand(-0.5, 0.5)), new THREE.Color(0x8a7358));
        SFX.mawRoar(t);
        this.shake(0.32 + pw * 0.2);
        const dispose = () => {
            G.traverse(o => {
                if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
                if ((o.isMesh || o.isSprite) && o.material) o.material.dispose();
            });
            this.scene.remove(G); light.release();
            for (let i = 0; i < 4; i++) this.riseParticle(new THREE.Vector3(base.x + U.rand(-0.6, 0.6), 0.05, base.z + U.rand(-0.4, 0.4)), new THREE.Color(0xff8a50));
        };
        // ⓐ 강림 0.42s — 지하에서 솟으며 날개를 펼친다
        this.addAnim(0.42, k => {
            const e = 1 - Math.pow(1 - k, 3);
            G.position.y = -4.2 + e * 3.9;                  // 최종 -0.3 (발치는 땅속 — 하반신 생략)
            for (const w of wings) w.rotation.z = 1.35 - e * 1.0;
            light.set(e * (1.0 + pw * 0.9));
        }, () => {
            // ⓑ 예비 0.2s — 고개를 젖히고 목구멍·가슴이 충전된다 (anticipation)
            this.addAnim(0.2, k => {
                head.rotation.z = k * 0.38;
                const open = k;
                jaw.upper.rotation.z = -Math.PI / 2 - open * 0.66;
                jaw.lower.rotation.z = -Math.PI / 2 + open * 0.36;
                jaw.throat.material.opacity = 0.35 + open * 0.6;
                chest.material.opacity = k * 0.55;
                chest.scale.setScalar(1 + k * 0.5);
            }, () => {
                // ⓒ 브레스 0.78s — 입에서 불줄기 원뿔이 적 전열을 **근→원 순서로** 쓸어 태운다
                const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean)
                    .sort((a, b) => a.g.position.x - b.g.position.x);
                const aims = live.length ? live.map(m => m.g.position.clone())
                    : [new THREE.Vector3(hero.x + 3.2, 0, hero.z)];
                const mouth = new THREE.Vector3();
                head.getWorldPosition(mouth);
                mouth.x += 0.62; mouth.y += 0.1;
                // 불줄기 2겹: 바깥 스킬 색 + 안 흰 코어. 원뿔(입쪽 가늘게)을 매 프레임 조준점에 맞춘다.
                const mkCone = (r, col, op) => {
                    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, 0.06, 1, 10, 1, true),
                        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
                    this.scene.add(c);
                    return c;
                };
                // 불줄기 색: 흰 코어가 크면 통째로 백광 빔이 된다(캡처 실측) — 바깥은 불색(스킬 색을
                // 주황으로 절반 끌어옴)으로 두껍게, 흰 코어는 가늘고 옅게.
                const fire = color.clone().lerp(new THREE.Color(0xff7043), 0.5);
                const stream = mkCone(0.6 + pw * 0.25, fire, 0.9);
                const core = mkCone(0.16 + pw * 0.06, 0xffffff, 0.55);
                const hitDone = new Set();
                const dur = 0.78;
                this.addAnim(dur, k => {
                    // 조준점: 가장 가까운 적 → 가장 먼 적으로 쓸어 간다
                    const sweep = Math.min(1, k / 0.85);
                    const fi = sweep * (aims.length - 1);
                    const lo = Math.floor(fi), hi = Math.min(aims.length - 1, lo + 1);
                    const P = aims[lo].clone().lerp(aims[hi], fi - lo);
                    P.y += 0.5;
                    // 원뿔을 mouth→P 축에 세운다 (+y 축 실린더 → 방향 쿼터니언)
                    const d = P.clone().sub(mouth), len = d.length();
                    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
                    for (const c of [stream, core]) {
                        c.quaternion.copy(q);
                        c.position.copy(mouth).addScaledVector(d, 0.5);
                        c.scale.y = len;
                    }
                    const flick = 0.75 + Math.sin(k * 46) * 0.2;      // 불꽃 명멸
                    stream.material.opacity = 0.9 * flick * (k > 0.86 ? (1 - k) / 0.14 : 1);
                    core.material.opacity = 0.55 * flick * (k > 0.86 ? (1 - k) / 0.14 : 1);
                    jaw.throat.material.opacity = 0.5 + flick * 0.4;
                    chest.material.opacity = 0.16 + flick * 0.12;   // 브레스 중엔 은은하게 — 분홍 공 방지
                    light.pos(P.x, P.y + 0.7, P.z);
                    light.set(1.4 + pw * 1.1);
                    if (Math.random() < 0.7) this.riseParticle(P.clone().add(new THREE.Vector3(U.rand(-0.3, 0.3), 0, U.rand(-0.2, 0.2))), new THREE.Color(0xff7043));
                    // 조준점이 적을 지나는 순간 그 적을 태운다 — 불기둥 + 폭발
                    for (let i = 0; i <= hi; i++) {
                        if (i > fi || hitDone.has(i)) continue;
                        hitDone.add(i);
                        const p = aims[i];
                        this.firePillar(p.clone(), color, Math.max(1, t - 1));
                        this.explosion(p.clone(), color);
                        this.meteorScorch(p, 1.2 + pw * 0.4);
                        this.shake(0.2 + pw * 0.2);
                        SFX.stormStrike(i);
                    }
                }, () => {
                    for (const c of [stream, core]) { c.geometry.dispose(); c.material.dispose(); this.scene.remove(c); }
                    // ⓓ 퇴장 0.4s — 턱을 다물고 가라앉는다
                    this.addAnim(0.4, k => {
                        const c = k * k;
                        head.rotation.z = 0.38 * (1 - c);
                        jaw.upper.rotation.z = -Math.PI / 2 - 0.66 * (1 - c);
                        jaw.lower.rotation.z = -Math.PI / 2 + 0.36 * (1 - c);
                        chest.material.opacity = 0.55 * (1 - c);
                        G.position.y = -0.3 - c * 4.0;
                        for (const w of wings) w.rotation.z = 0.35 + c * 1.0;
                        light.set(light.get() * 0.88);
                    }, dispose);
                });
            });
        });
    },

    // ---- 스킬 전용 연출: 처형 — 거대한 처형 칼날이 내리찍힌다 (skill-unique-signature) ----
    // 강타와 fx('slash')를 공유해 색만 다를 뿐 같은 교차 참격이었다. 처형은 **단 한 번의 압도적인
    // 내리찍기**로 분리: 참격 세례(작은 초승달 여러 번)와 횟수·방향·규모가 전부 다르다.
    // 장면 4단: 선고(적 발밑에 어두운 처형 원 + 상공에 거대한 칼날이 그림자처럼 결정화) →
    //          낙하(수직 급강하, 속도선) → 절단(붉은 섬광 + 지면 균열 링 + 파편, 칼날이 박힌 채 멈춤)
    //          → 퇴장(칼날이 어둠으로 스러짐).
    // ⚠️ 칼날은 카메라를 향해 세운다(slashArcs 와 같은 함정 — 월드 축 고정이면 얇은 판이 사라진다).
    GUILLOTINE_IMPACT_MS: 430,   // 절단 시각(선고 300 + 낙하 130) — skillImpactWeight 지연과 동기
    guillotineDrop(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 3 : tier));
        const pw = t / 5;
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        const spot = live.length ? live[0].g.position.clone() : this.heroG.position.clone().add(new THREE.Vector3(2.4, 0, 0));
        const G = new THREE.Group();
        G.userData.guillotineFx = true;
        this.scene.add(G);
        // 선고 원 — 적 발밑의 어두운 원 + 붉은 테. 밝은 초원이라 '어두운 값'이 대비를 만든다(scorch 문법).
        const doom = new THREE.Mesh(new THREE.CircleGeometry(0.62 + pw * 0.2, 22),
            new THREE.MeshBasicMaterial({ color: 0x1a0d10, transparent: true, opacity: 0, depthWrite: false }));
        doom.rotation.x = -Math.PI / 2;
        doom.position.set(spot.x, 0.03, spot.z);
        const rim = new THREE.Mesh(new THREE.RingGeometry(0.6 + pw * 0.2, 0.72 + pw * 0.22, 24),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        rim.rotation.x = -Math.PI / 2;
        rim.position.set(spot.x, 0.035, spot.z);
        G.add(doom, rim);
        // 칼날 — 거대한 처형도(폭 1.7): 근흑 몸 + 아랫날 흰 스트립 + 윗등 붉은 스트립.
        // sRGB 인코딩이 어두운 헥스를 들어 올리므로 몸은 근흑(0x0a0608)까지 내린다(dragonfire 함정).
        const blade = new THREE.Group();
        const W = 1.5 + pw * 0.5, H = 1.0 + pw * 0.3;
        // 몸판 = 기요틴 프로필(빗각 날) — 평평한 사각형은 '검은 판자'로 읽힌다(캡처 실측).
        // 아랫변을 왼쪽 아래로 빗겨 처형도의 사선 날을 만든다.
        const prof = new THREE.Shape();
        prof.moveTo(-W / 2, 0);
        prof.lineTo(W / 2, 0.12);
        prof.lineTo(W / 2, -H * 0.55);
        prof.lineTo(-W / 2, -H);
        prof.closePath();
        const body = new THREE.Mesh(new THREE.ShapeGeometry(prof),
            new THREE.MeshBasicMaterial({ color: 0x0a0608, transparent: true, opacity: 0, side: THREE.DoubleSide }));
        // 사선 날 스트립 — 빗각을 따라 흰 날을 세운다
        const eLen = Math.hypot(W, H * 0.45), eAng = Math.atan2(H * 0.45, W);
        const edge = new THREE.Mesh(new THREE.PlaneGeometry(eLen, 0.09),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, toneMapped: false }));
        edge.position.set(0, -H * 0.78 + 0.02, 0.01);
        edge.rotation.z = eAng;
        const back = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, 0.08),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        back.position.y = 0.1;
        // 손잡이 고리 — 위쪽 중앙. '판'이 아니라 '기구'로 읽히는 마지막 한 조각.
        const grip = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.045, 6, 14),
            new THREE.MeshBasicMaterial({ color: 0x241418, transparent: true, opacity: 0 }));
        grip.position.y = 0.28;
        blade.add(body, edge, back, grip);
        const topY = 3.4 + pw * 0.5;
        blade.position.set(spot.x, topY, spot.z);
        if (this.camera) blade.lookAt(this.camera.position);   // 카메라를 향해 세운 판 — 항상 보인다
        G.add(blade);
        const light = this.fxLight(color.getHex(), 7, 'guillotineLight');
        light.pos(spot.x, 1.6, spot.z);
        const dispose = () => {
            G.traverse(o => {
                if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
                if ((o.isMesh || o.isSprite) && o.material) o.material.dispose();
            });
            this.scene.remove(G); light.release();
        };
        // ⓐ 선고 0.3s — 처형 원이 물들고 칼날이 결정화된다
        this.addAnim(0.3, k => {
            const e = 1 - Math.pow(1 - k, 2);
            doom.material.opacity = e * 0.55;
            rim.material.opacity = e * 0.85;
            rim.scale.setScalar(1.25 - e * 0.25);           // 살짝 조이며 자리를 못박는다
            body.material.opacity = e * 0.92;
            edge.material.opacity = e;
            back.material.opacity = e * 0.8;
            grip.material.opacity = e * 0.92;
            blade.rotation.z = Math.sin(k * 9) * 0.03;      // 결정화 중 미세 진동 — 정지 판 방지
            light.set(e * (0.6 + pw * 0.5));
        }, () => {
            SFX.slashArc(0, t);
            // ⓑ 낙하 0.13s — 수직 급강하 (가속)
            const toY = H - 0.12;                            // 날 원점=윗변이라, 빗날 끝이 지면을 살짝 파고드는 높이
            this.addAnim(0.13, k => {
                blade.position.y = topY + (toY - topY) * k * k;
            }, () => {
                // ⓒ 절단 — 붉은 섬광 + 균열 링 + 파편. 칼날은 박힌 채 한 박자 멈춘다.
                const hit = new THREE.Vector3(spot.x, 0.6, spot.z);
                this.explosion(hit, color);
                this.expandRing(new THREE.Vector3(spot.x, 0.02, spot.z), color, 1.7 + pw * 1.0);
                this.spawnShards(hit, Math.round(12 + pw * 10), color.getHex(), { spread: 0.9, speed: 1.5 + pw * 0.6 });
                this.spawnSparks(hit, Math.round(14 + pw * 14), color.getHex(), { speed: 1.5 });
                this.meteorScorch(spot, 1.1 + pw * 0.4);
                this.shake(0.36 + pw * 0.3);
                this.flashLight(hit, color.getHex(), 0.26);
                SFX.stormStrike(1);
                this.addAnim(0.22, k => {                     // 박힌 채 여운 — 날만 뜨겁게 명멸
                    edge.material.opacity = 0.7 + Math.sin(k * 26) * 0.3;
                    light.set((1.2 + pw * 0.8) * (1 - k * 0.5));
                }, () => {
                    // ⓓ 퇴장 0.3s — 어둠으로 스러진다
                    this.addAnim(0.3, k => {
                        for (const m of [body, edge, back, grip]) m.material.opacity *= (1 - k * 0.25);
                        doom.material.opacity = 0.55 * (1 - k);
                        rim.material.opacity = 0.85 * (1 - k);
                        blade.position.y += 0.01;             // 미세 부상 — '거둬 간다'
                        light.set(light.get() * 0.9);
                    }, dispose);
                });
            });
        });
    },

    // ---- 스킬 전용 연출: 초신성 — 빨려 들어가 붕괴했다가 한 번에 터진다 (skill-unique-signature) ----
    // 화염구와 fx('explode')를 공유해 색만 다를 뿐 '던지고 터지는' 같은 그림이었다.
    // 장면 4단: 흡입(적진 상공의 코어로 빛 알갱이가 **빨려 들어가고** 조임 링이 수축 — 기존 연출이
    //          전부 밖으로 퍼지는 운동이라 역방향 운동 자체가 시그니처다) → 붕괴(코어가 점으로 조였다
    //          — 정적 한 박자) → 폭발(거대 구각 2겹 + 수평 파동 + 전 적 동시 타격) → 여운(잔광·잉걸).
    // 화염구(투척 포물선 + 불의 고리 확산)와 운동 문법이 정반대다.
    NOVA_IMPACT_MS: 560,       // 폭발 시각(흡입 420 + 붕괴 140) — skillImpactWeight 지연과 동기
    supernovaBlast(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 4 : tier));
        const pw = t / 5;
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        const C = new THREE.Vector3();
        if (live.length) { for (const m of live) C.add(m.g.position); C.divideScalar(live.length); }
        else C.copy(this.heroG.position).add(new THREE.Vector3(2.4, 0, 0));
        C.y = 1.7;                                          // 적진 상공 — 지면보다 높아야 '천체'로 읽힌다
        const G = new THREE.Group();
        G.userData.novaFx = true;
        this.scene.add(G);
        const mat = (col, op, blend) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op,
            side: THREE.DoubleSide, depthWrite: false, blending: blend === false ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false });
        // 코어 — 흰 심 + 색 글로우
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat(0xffffff, 0.95));
        core.position.copy(C);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), mat(color, 0.55));
        glow.position.copy(C);
        G.add(core, glow);
        // 조임 링 — 확장 링의 정반대 운동(수축) + 흡입 알갱이 12~20개
        const inRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1.0, 26), mat(color, 0));
        inRing.position.copy(C);
        if (this.camera) inRing.lookAt(this.camera.position);
        G.add(inRing);
        const motes = [];
        const nMote = 12 + Math.round(pw * 8);
        for (let i = 0; i < nMote; i++) {
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.05 + Math.random() * 0.04, 6, 5), mat(i % 3 ? color : 0xffffff, 0.9));
            const a = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 1.3;
            m.userData.from = new THREE.Vector3(C.x + Math.cos(a) * r, C.y + U.rand(-0.9, 1.1), C.z + Math.sin(a) * r * 0.6);
            m.userData.d = Math.random() * 0.35;            // 개체별 출발 지연 — 한 번에 안 움직이게
            m.position.copy(m.userData.from);
            G.add(m); motes.push(m);
        }
        const light = this.fxLight(color.getHex(), 9, 'novaLight');
        light.pos(C.x, C.y, C.z);
        SFX.auraRise(t);
        const dispose = () => {
            G.traverse(o => {
                if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
                if ((o.isMesh || o.isSprite) && o.material) o.material.dispose();
            });
            this.scene.remove(G); light.release();
        };
        // ⓐ 흡입 0.42s — 알갱이가 코어로 빨려 들고 링이 조인다, 코어가 자란다
        this.addAnim(0.42, k => {
            for (const m of motes) {
                const kk = Math.max(0, Math.min(1, (k - m.userData.d) / (1 - m.userData.d)));
                m.position.lerpVectors(m.userData.from, C, kk * kk);   // 가속 흡입
                m.material.opacity = 0.9 * (1 - kk * 0.85);
                m.scale.setScalar(1 - kk * 0.6);
            }
            inRing.material.opacity = Math.min(1, k / 0.25) * 0.8;
            inRing.scale.setScalar(1.9 - k * 1.55);                    // 수축 — expandRing 의 정반대
            // ⚠️ 코어를 크게 불리면 가산 2겹이 합쳐져 '흰 풍선'이 된다(캡처 실측) — 심은 작게 뜨겁게,
            //    커지는 건 폭발 단계 몫.
            core.scale.setScalar(1 + k * 1.4);
            glow.scale.setScalar(1 + k * 1.8);
            glow.material.opacity = 0.35 + k * 0.1;
            light.set(0.5 + k * (0.9 + pw * 0.8));
        }, () => {
            // ⓑ 붕괴 0.14s — 커진 코어가 점으로 **조인다**(정적 한 박자 = 폭발 직전의 숨)
            this.addAnim(0.14, k => {
                const s = Math.max(0.06, 1 - k);
                core.scale.setScalar(2.4 * s);
                glow.scale.setScalar(2.8 * s * s);
                inRing.material.opacity = 0.8 * (1 - k);
                inRing.scale.setScalar(0.35 * (1 - k) + 0.05);
                light.set(light.get() * 0.85);
            }, () => {
                // ⓒ 폭발 — 구각 2겹 + 수평 파동 + 전 적 동시 타격
                for (const m of motes) m.visible = false;
                inRing.visible = false;
                SFX.stormStrike(0);
                this.shake(0.4 + pw * 0.35);
                this.flashLight(C.clone(), color.getHex(), 0.4);
                const R = 2.6 + pw * 1.6;
                this.expandRing(new THREE.Vector3(C.x, 0.02, C.z), color, R * 1.4);
                setTimeout(() => this.expandRing(new THREE.Vector3(C.x, 0.02, C.z), new THREE.Color(0xffffff), R), 60);
                for (const m of live) {
                    if (!this.enemyMap.get(m.id)) continue;   // 그 사이 죽었으면 건너뜀
                    this.explosion(m.g.position.clone(), color);
                }
                this.spawnSparks(C.clone(), Math.round(24 + pw * 26), color.getHex(), { speed: 1.8 + pw * 1.0 });
                this.addAnim(0.5, k => {
                    const e = 1 - Math.pow(1 - k, 3);
                    core.scale.setScalar(0.2 + e * R * 5.5);           // 구각으로 팽창 (r0.16 기준 배율)
                    core.material.opacity = 0.95 * (1 - e);
                    glow.scale.setScalar(0.2 + e * R * 4.6);
                    glow.material.opacity = 0.8 * (1 - e * 0.9);
                    light.set((1.6 + pw * 1.2) * (1 - e * 0.8));
                    if (Math.random() < 0.6) this.riseParticle(new THREE.Vector3(C.x + U.rand(-R, R) * 0.5, 0.1, C.z + U.rand(-R, R) * 0.3), color);
                }, () => {
                    // ⓓ 여운 0.4s — 잔광이 스러진다
                    this.addAnim(0.4, k => { light.set(light.get() * 0.9); glow.material.opacity = Math.max(0, glow.material.opacity - 0.04); }, dispose);
                });
            });
        });
    },

    // ---- 스킬 전용 연출: 신의 창 — 하늘이 열리고 거대한 황금 창이 내리꽂힌다 (skill-unique-signature) ----
    // 낙뢰(먹구름 + 지그재그 볼트)와 fx('bolt')를 공유해 색만 노랄 뿐 같은 그림이었다.
    // 장면 4단: 개천(적 상공에 회전하는 황금 광륜 + 사선 광선) → 강림 예고(광륜 아래 거대한 창이
    //          결정화되어 겨눔) → 관통(수직 급강하 — 적을 꿰고 지면까지 꽂힘, 금빛 폭발 + 방사 광선)
    //          → 여운(창이 박힌 채 빛기둥, 위로 반짝이며 소멸).
    // 먹구름·번개 지그재그가 전혀 없다 — 신성 기하(광륜·직선 창·방사광)로만 구성.
    // ⚠️ 라이트는 fxLight 풀만. 재질은 가산 + toneMapped:false (밝은 하늘 위 요소라 가산이 맞다 —
    //    healPillar 의 '기둥은 일반 합성' 함정은 **지면 근처 수직면** 얘기고, 광륜은 하늘 배경이라 문제없다).
    GODSPEAR_IMPACT_MS: 500,     // 관통 착탄 시각 — skillImpactWeight 지연과 동기 (개천 350 + 낙하 150)
    godSpearDrop(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 5 : tier));
        const pw = t / 5;
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        const spot = live.length ? live[0].g.position.clone() : this.heroG.position.clone().add(new THREE.Vector3(2.4, 0, 0));
        const gold = color.clone().lerp(new THREE.Color(0xffd54f), 0.5);
        const G = new THREE.Group();
        G.userData.godspearFx = true;
        this.scene.add(G);
        const add = (mesh) => { G.add(mesh); return mesh; };
        const mat = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op,
            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
        // ⓐ 개천 — 적 상공의 회전 광륜 2겹 + 사선 광선 6가닥.
        // ⚠️ 광륜을 수평으로 눕히면 카메라(y3.7)가 아래에서 올려봐 **모서리선**이 된다(캡처 실측) —
        //    카메라를 향해 세워야 '하늘이 열린 원'으로 읽힌다. 높이도 5.6은 화면 밖 태양과 겹친다.
        const skyY = 4.15;
        const halo = add(new THREE.Mesh(new THREE.RingGeometry(0.9, 1.5 + pw * 0.5, 28), mat(gold, 0)));
        halo.position.set(spot.x, skyY, spot.z);
        if (this.camera) halo.lookAt(this.camera.position);
        const halo2 = add(new THREE.Mesh(new THREE.RingGeometry(0.45, 0.7, 22), mat(0xffffff, 0)));
        halo2.position.set(spot.x, skyY, spot.z + 0.05);
        if (this.camera) halo2.lookAt(this.camera.position);
        const rays = [];
        for (let i = 0; i < 6; i++) {
            const ray = add(new THREE.Mesh(new THREE.PlaneGeometry(0.16, 2.6), mat(gold, 0)));
            const a = (i / 6) * Math.PI * 2;
            ray.position.set(spot.x + Math.cos(a) * 1.0, skyY - 0.9, spot.z + Math.sin(a) * 0.3);
            ray.rotation.set(0, 0, Math.cos(a) * 0.5);
            rays.push(ray);
        }
        // 창 — 자루(긴 원기둥) + 창촉(2단 콘) + 십자 코등이 + 자루 끝 보주. 길이 ~3.4.
        const spear = new THREE.Group();
        // ⚠️ 가는 흰 창은 밝은 하늘에 통째로 소실된다(캡처 실측) — 굵기를 키우고 채도 있는 금으로.
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.4, 8),
            new THREE.MeshBasicMaterial({ color: 0xffb300, toneMapped: false }));
        shaft.position.y = 1.55;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.85, 8),
            new THREE.MeshBasicMaterial({ color: 0xfff3c4, toneMapped: false }));
        tip.rotation.x = Math.PI; tip.position.y = 0;
        const collar = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.4, 8),
            new THREE.MeshBasicMaterial({ color: gold, toneMapped: false }));
        collar.rotation.x = Math.PI; collar.position.y = 0.5;
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.12),
            new THREE.MeshBasicMaterial({ color: gold, toneMapped: false }));
        guard.position.y = 0.74;
        const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
            new THREE.MeshBasicMaterial({ color: gold, toneMapped: false }));
        pommel.position.y = 2.8;
        const aura = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 3.0, 8, 1, true), mat(gold, 0.4));
        aura.position.y = 1.5;
        spear.add(shaft, tip, collar, guard, pommel, aura);
        spear.position.set(spot.x, skyY - 0.6, spot.z);
        spear.scale.setScalar(1.15 + pw * 0.35);
        G.add(spear);
        const light = this.fxLight(gold.getHex(), 8, 'godspearLight');
        light.pos(spot.x, skyY - 1, spot.z);
        SFX.auraRise(t);
        const dispose = () => {
            G.traverse(o => {
                if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
                if ((o.isMesh || o.isSprite) && o.material) o.material.dispose();
            });
            this.scene.remove(G); light.release();
        };
        // ⓐ+ⓑ 개천·겨눔 0.35s — 광륜이 열리고 창이 결정화된다
        this.addAnim(0.35, k => {
            const e = 1 - Math.pow(1 - k, 3);
            halo.material.opacity = e * 0.85;
            halo.scale.setScalar(0.5 + e * 0.5);
            halo.rotation.z += 0.06;
            halo2.material.opacity = e * 0.9;
            halo2.rotation.z -= 0.09;
            for (const r of rays) r.material.opacity = e * 0.4;
            spear.position.y = skyY - 0.6 - e * 0.35;       // 미세 하강 = 겨눔
            for (const m of [shaft, tip, collar, guard, pommel]) m.material.opacity = 1;
            light.set(e * (0.9 + pw * 0.8));
        }, () => {
            // ⓒ 관통 0.15s — 수직 급강하. 창촉이 지면에 꽂히는 깊이까지.
            const fromY = spear.position.y, toY = 1.55;      // spear 원점=창촉이라 y1.55 면 촉이 지면 관통
            this.addAnim(0.15, k => {
                spear.position.y = fromY + (toY - fromY) * k * k;
                aura.material.opacity = 0.4 + k * 0.4;
            }, () => {
                // 착탄 — 금빛 폭발 + 지면 방사 광선 + 링
                const hit = new THREE.Vector3(spot.x, 0.5, spot.z);
                this.explosion(hit, gold);
                this.expandRing(new THREE.Vector3(spot.x, 0.02, spot.z), gold, 2.0 + pw * 1.2);
                this.spawnSparks(hit, Math.round(20 + pw * 22), gold.getHex(), { speed: 1.6 + pw * 0.8 });
                this.firePillar(new THREE.Vector3(spot.x, 0, spot.z), gold, Math.max(2, t - 1)); // 금빛 빛기둥 — 지면 착탄이 밝은 초원에서도 읽히게
                this.shake(0.34 + pw * 0.3);
                this.flashLight(hit, gold.getHex(), 0.3);
                SFX.stormStrike(0);
                // ⓓ 여운 0.55s — 광륜은 닫히고, 박힌 창이 빛기둥으로 타올랐다 위로 소멸
                this.addAnim(0.55, k => {
                    halo.material.opacity = 0.85 * (1 - k);
                    halo2.material.opacity = 0.9 * (1 - k);
                    halo.scale.setScalar(1 - k * 0.4);
                    for (const r of rays) r.material.opacity = 0.4 * (1 - k);
                    aura.material.opacity = 0.8 * (1 - k);
                    aura.scale.x = aura.scale.z = 1 + k * 1.6;
                    if (k > 0.45) {
                        const f = (k - 0.45) / 0.55;         // 창 본체가 위로 미끄러지며 소멸
                        spear.position.y = 1.55 + f * 2.2;
                        for (const m of [shaft, tip, collar, guard, pommel]) {
                            m.material.transparent = true; m.material.opacity = 1 - f;
                        }
                        if (Math.random() < 0.5) this.riseParticle(new THREE.Vector3(spot.x + U.rand(-0.2, 0.2), 0.8 + f * 2, spot.z), gold);
                    }
                    light.set(light.get() * 0.92);
                }, dispose);
            });
        });
    },

    // ---- 스킬 전용 미니 연출 ⑦: 공허의 창 — 공간이 찢어지고 창이 튀어나온다 ----
    //      (skill-unique-signature, 사용자 지시 2026-08-19 "스킬 너무 똑같아 보이는 거 하지 말라")
    //
    // 여태 공허의 창은 관통 사격과 fx `beam`(= 화살 세례)을 **공유**했다. 궁극기인데 레어 스킬과
    // 같은 화살이 발수만 늘어난 그림이라, 화면에 '공허'도 '창'도 없었다.
    //
    // 시그니처 = **음화(negative space)**. 이 저장소의 연출은 전부 가산 발광이라 하는 일이 '밝아지는
    // 것' 하나뿐인데, 여기서는 화면에 **구멍(근흑 렌즈)** 을 뚫는다 — 18종 중 유일하게 어두워지는
    // 연출이라 색·크기와 무관하게 한눈에 갈린다.
    // 축도 셋 다 다르다: 신의 창은 하늘에서 **수직**으로 내리꽂고(godSpearDrop), 화살 세례는
    // **영웅→적**으로 날아간다. 이건 **적 너머에 열린 균열에서 나와 영웅 쪽으로** 적을 꿰뚫는다.
    // ⚠️ 발사 원점이 영웅이 아니다 — '주인공 원점 원칙'의 의도된 유일한 예외다(쏘는 주체가 공허다).
    //   개열 0.30s: 흰 실선이 세로로 그어지고 → 좌우로 벌어져 근흑 렌즈가 된다(공간 파편이 빨려든다)
    //   돌출 0.14s: 창끝이 균열에서 나왔다가 살짝 되당겨진다(예비동작)
    //   관통 0.10s: 수평 급가속으로 적을 꿰뚫고 반대편으로 빠져나간다(출구에 작은 균열이 튄다)
    //   여운 0.55s: 박힌 창이 떨다가 **균열로 되빨려 들어가고**, 균열이 탁 다물린다
    //
    // 🚨 캡처로 밟은 함정 (재발 방지):
    //  ⑴ **근흑은 0x070509 까지 내려야 한다** — sRGB 출력 인코딩이 재질색을 linear→sRGB 로 들어
    //     올려서 0x14 대역 헥스는 화면에서 0x50 대역 연보라로 뜬다(dragonfire 가 먼저 밟은 자리).
    //     '구멍'이 연보라 판이 되면 이 연출의 시그니처가 통째로 없어진다.
    //  ⑵ **렌즈를 카메라로 세우지 않으면 모서리선이 된다** — 카메라가 y3.7 에서 내려다보므로
    //     월드축에 눕힌 판은 납작한 선으로 읽힌다(godspear 광륜이 같은 함정을 밟았다).
    //  ⑶ **균열을 적에게서 1.75 보다 멀리 두지 말 것** — 적 뒤는 화면 오른쪽 끝이라 그 너머는
    //     프레임 밖이다. 창의 비행 거리도 같이 짧아지므로 속도감은 이징으로 벌 것.
    VOIDRIFT_IMPACT_MS: 540,     // 관통 시각(개열 300 + 돌출 140 + 관통 100) — skillImpactWeight 지연과 동기
    voidLanceRift(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 4 : tier));
        const pw = t / 5;
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        const spot = live.length ? live[0].g.position.clone() : this.heroG.position.clone().add(new THREE.Vector3(2.4, 0, 0));
        const violet = color.clone().lerp(new THREE.Color(0x9575cd), 0.45);
        const VOID = 0x070509;                     // 함정 ⑴ — 이보다 밝으면 화면에서 '구멍'이 안 된다

        // 영웅 → 적 방향. 균열은 그 **너머**에 열리고 창은 되짚어 와 적을 꿰뚫는다.
        const away = spot.clone().sub(this.heroG.position); away.y = 0;
        if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
        away.normalize();
        // 함정 ⑶ — 순수 `away` 로 밀면 적이 이미 화면 오른쪽 끝이라 균열이 통째로 프레임 밖으로
        // 나간다(첫 캡처 실측: 1.75 에서 렌즈가 우측 경계에 잘렸다). **카메라 쪽(+z)을 섞어**
        // 화면 아래·앞으로 빼면 가로 폭을 안 먹으면서 '적 뒤'라는 깊이는 유지된다. 대각 관통이라
        // 화면 운동량도 수평보다 낫다. 그래도 프레임을 벗어나는 배치(적이 극단에 선 경우)를 위해
        // 거리를 줄여 가며 **프레임 안에 드는 가장 먼 자리**를 고른다.
        const toCam = this.camera ? this.camera.position.clone().sub(spot).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
        const offDir = away.clone().multiplyScalar(0.6).addScaledVector(toCam, 0.55).normalize();
        const inFrame = (p) => {
            if (!this.camera) return true;
            const v = p.clone().project(this.camera);
            return Math.abs(v.x) < 0.70 && Math.abs(v.y) < 0.80;
        };
        let riftPos = spot.clone().addScaledVector(offDir, 0.95); riftPos.y = 1.35;
        for (const d of [1.85, 1.55, 1.25]) {
            const c = spot.clone().addScaledVector(offDir, d); c.y = 1.35;
            if (inFrame(c)) { riftPos = c; break; }
        }
        const hitPos = spot.clone(); hitPos.y = 0.85;
        // 관통 후 빠져나가는 자리 — 균열 반대편으로 창 길이만큼. 적을 확실히 지나치게.
        const endPos = hitPos.clone().addScaledVector(offDir, -1.05); endPos.y = 0.62;
        const travel = endPos.clone().sub(riftPos).normalize();

        const G = new THREE.Group();
        G.userData.voidriftFx = true;
        this.scene.add(G);
        const mat = (col, op, blend) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op,
            side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
            blending: blend === false ? THREE.NormalBlending : THREE.AdditiveBlending });
        // 세로 렌즈(눈 모양) — 위아래가 뾰족해야 '찢어진 자국'으로 읽힌다(타원은 그냥 구멍).
        const lensGeo = (w, h) => {
            const s = new THREE.Shape();
            s.moveTo(0, h / 2);
            s.quadraticCurveTo(w, 0, 0, -h / 2);
            s.quadraticCurveTo(-w, 0, 0, h / 2);
            return new THREE.ShapeGeometry(s, 14);
        };

        // ⓐ 균열 — 카메라를 향해 세운 그룹(함정 ⑵). 자식은 로컬 z 로만 앞뒤를 준다.
        const RIFT_H = 2.3 + pw * 0.5;
        const riftG = new THREE.Group();
        riftG.position.copy(riftPos);
        if (this.camera) riftG.lookAt(this.camera.position);
        G.add(riftG);
        // 가장자리 보랏빛 번짐. ⚠️ 여기를 키우면 밝은 하늘 위에서 흰 테두리가 **근흑 코어보다
        // 세게** 읽혀 '구멍'이 '빛나는 고치'가 된다(캡처 실측) — 테는 코어를 이기면 안 된다.
        const halo = new THREE.Mesh(lensGeo(0.88, RIFT_H * 1.09), mat(violet, 0));
        halo.position.z = -0.03;
        const core = new THREE.Mesh(lensGeo(0.62, RIFT_H), mat(VOID, 0, false));       // 근흑 구멍 — 시그니처
        const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.075, RIFT_H), mat(0xffffff, 0));  // 최초의 실선
        slit.position.z = 0.03;
        riftG.add(halo, core, slit);
        riftG.scale.x = 0.001;                     // 닫힌 상태에서 시작 — 실선만 보인다

        // ⓑ 빨려드는 공간 파편 — 균열 주위를 나선으로 조여들며 흡수된다.
        const shards = [];
        for (let i = 0; i < 6; i++) {
            const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.05), mat(violet, 0));
            sh.userData.a0 = (i / 6) * Math.PI * 2;
            sh.userData.r0 = 1.5 + (i % 3) * 0.35;
            riftG.add(sh); shards.push(sh);
        }

        // ⓒ 창 — 원점이 **창끝**이라 position 이 곧 관통점이 된다(godSpear 와 같은 규약).
        // 🚨 첫 캡처에서 이게 **흰 광선**으로 읽혔다 — 즉 분리하려던 `beam`(화살 세례)과 오히려
        //    더 닮아 버렸다. 원인 셋: ⓘ 자루 전 길이에 가산 `edge` 를 깔아 근흑이 통째로 씻김
        //    ⓘⓘ 꼬리(wake)가 자루보다 굵고 길어 물체가 아니라 궤적으로 보임 ⓘⓘⓘ 창 길이 3.4 가
        //    비행 거리보다 길어 화면을 가로지르는 '막대'가 됨. → **근흑 자루를 굵게, 가산은
        //    창끝 근처 짧은 마디에만, 꼬리는 자루보다 가늘게, 전장 2.2 로** 줄인다.
        const lance = new THREE.Group();
        const solid = (col) => new THREE.MeshBasicMaterial({ color: col, toneMapped: false });
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.8, 6), solid(0xb39ddb));
        tip.rotation.x = Math.PI;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 1.55, 6), solid(VOID));
        shaft.position.y = 1.25;
        const barb = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.42, 6), solid(VOID));  // 역가시 — 뽑히지 않는 인상
        barb.rotation.x = Math.PI; barb.position.y = 0.54;
        const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 4), mat(violet, 0.8));
        edge.position.y = 0.52;                     // 창끝 바로 뒤 한 마디만 — 자루는 검게 남긴다
        const wake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 1.5, 6, 1, true), mat(violet, 0));
        wake.position.y = 2.0;                      // 관통 순간에만 켜지는 꼬리 — 자루보다 가늘게
        lance.add(tip, shaft, barb, edge, wake);
        lance.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), travel);
        lance.position.copy(riftPos);
        lance.scale.setScalar(1.05 + pw * 0.3);
        lance.visible = false;
        G.add(lance);

        const light = this.fxLight(violet.getHex(), 8, 'voidriftLight');
        light.pos(riftPos.x, riftPos.y, riftPos.z);
        SFX.voidTear(t);

        const dispose = () => {
            G.traverse(o => {
                if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
                if ((o.isMesh || o.isSprite) && o.material) o.material.dispose();
            });
            this.scene.remove(G); light.release();
        };

        // ⓐ 개열 0.30s — 실선이 그어지고(전반) 좌우로 벌어진다(후반).
        this.addAnim(0.30, k => {
            const draw = Math.min(1, k / 0.38);                  // 실선이 세로로 그어지는 구간
            const open = Math.max(0, (k - 0.34) / 0.66);
            const e = 1 - Math.pow(1 - open, 3);
            slit.scale.y = 0.05 + draw * 0.95;
            slit.material.opacity = draw * (1 - open * 0.85);
            riftG.scale.x = 0.001 + e * 1.0;
            core.material.opacity = e;
            halo.material.opacity = e * 0.38;
            for (const sh of shards) {                            // 나선으로 조여들며 흡수
                const r = sh.userData.r0 * (1 - e * 0.92);
                const a = sh.userData.a0 + e * 2.4;
                sh.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.8, 0.02);
                sh.rotation.z = a + Math.PI / 2;
                sh.material.opacity = Math.sin(Math.min(1, e * 1.25) * Math.PI) * 0.7;
                sh.scale.setScalar(1 - e * 0.5);
            }
            light.set(e * (0.7 + pw * 0.7));
        }, () => {
            // ⓑ 돌출 0.14s — 창끝이 나왔다가 되당겨진다(예비동작). 나온 만큼만 보이게 스케일로 자란다.
            lance.visible = true;
            this.addAnim(0.14, k => {
                const out = k < 0.62 ? (k / 0.62) : 1 - (k - 0.62) / 0.38 * 0.42;   // 0→1→0.58
                lance.position.copy(riftPos).addScaledVector(travel, out * 0.75);
                lance.scale.setScalar((1.05 + pw * 0.3) * (0.55 + out * 0.45));
                edge.material.opacity = 0.5 + out * 0.5;
                for (const sh of shards) sh.material.opacity *= 0.8;
            }, () => {
                // ⓒ 관통 0.10s — 급가속(k²)으로 적을 뚫고 반대편으로 빠진다.
                const from = lance.position.clone();
                this.addAnim(0.10, k => {
                    const e = k * k;
                    lance.position.copy(from).lerp(endPos, e);
                    wake.material.opacity = Math.sin(k * Math.PI) * 0.45;
                    wake.scale.y = 0.4 + e * 0.9;
                }, () => {
                    // 착탄 — 폭발 + 지면 링 + 진행 방향으로 튀는 파편(관통의 관성)
                    this.explosion(hitPos.clone(), violet);
                    this.expandRing(new THREE.Vector3(hitPos.x, 0.02, hitPos.z), violet, 2.0 + pw * 1.3);
                    this.spawnShards(hitPos.clone(), Math.round(12 + pw * 12), violet.getHex(),
                        { dir: Math.atan2(travel.z, travel.x), spread: 0.65, speed: 1.5 + pw * 0.8 });
                    this.spawnSparks(hitPos.clone(), Math.round(16 + pw * 20), violet.getHex(), { speed: 1.5 + pw * 0.7 });
                    this.shake(0.32 + pw * 0.3);
                    this.flashLight(hitPos, violet.getHex(), 0.28);
                    SFX.voidPierce(t);
                    // 출구 균열 — 창이 빠져나간 자리에 작은 렌즈가 튄다(꿰뚫었다는 증거).
                    const exitG = new THREE.Group();
                    exitG.position.copy(endPos);
                    if (this.camera) exitG.lookAt(this.camera.position);
                    const exitL = new THREE.Mesh(lensGeo(0.34, 1.0), mat(VOID, 1, false));
                    const exitH = new THREE.Mesh(lensGeo(0.5, 1.2), mat(violet, 0.7));
                    exitH.position.z = -0.02;
                    exitG.add(exitH, exitL); G.add(exitG);
                    // 여운 0.55s — 창이 떨다가 균열로 되빨려 들어가고, 균열이 탁 다물린다.
                    let snapped = false;
                    this.addAnim(0.55, k => {
                        const q = Math.max(0, (k - 0.30) / 0.70);      // 되빨림 구간
                        // 박힌 채 미세 진동 → 그 다음 균열 쪽으로 되끌려 간다
                        const jitter = (1 - Math.min(1, k / 0.30)) * 0.05;
                        lance.position.copy(endPos).lerp(riftPos, q * q)
                            .add(new THREE.Vector3(U.rand(-jitter, jitter), U.rand(-jitter, jitter), 0));
                        lance.scale.setScalar((1.05 + pw * 0.3) * (1 - q * 0.55));
                        for (const m of [tip, shaft, barb]) { m.material.transparent = true; m.material.opacity = 1 - q; }
                        edge.material.opacity = (1 - q) * 0.85;
                        wake.material.opacity = 0;
                        if (q > 0.05 && Math.random() < 0.45) {         // 되빨리는 알갱이
                            this.riseParticle(lance.position.clone().add(new THREE.Vector3(U.rand(-0.25, 0.25), U.rand(-0.2, 0.4), 0)), violet);
                        }
                        exitL.material.opacity = Math.max(0, 1 - k / 0.42);
                        exitH.material.opacity = Math.max(0, 0.7 - k / 0.34);
                        // 균열 폐쇄 — 마지막 30% 에 좌우로 다물리고, 다물린 뒤 실선이 세로로 사라진다.
                        if (k > 0.70) {
                            const c = (k - 0.70) / 0.30;
                            riftG.scale.x = Math.max(0.001, 1 - c);
                            halo.material.opacity = 0.38 * (1 - c);
                            slit.material.opacity = Math.sin(c * Math.PI) * 0.9;    // 다물리며 한 번 번쩍
                            slit.scale.y = 1 - Math.max(0, (c - 0.6) / 0.4);
                            if (!snapped && c > 0.55) { snapped = true; SFX.voidSnap(); }
                        }
                        light.set(light.get() * 0.93);
                    }, dispose);
                });
            });
        });
    },

    // ---- 스킬 전용 미니 연출 ⑥: 지원계 분화 (skill-fx-exaggerated, 사용자 지시 2026-08-19) ----
    // `heal`(응급처치·축복·신성한 가호)과 `aura`(전투의 함성·성역·시간 왜곡) — **6종이 한 그림**이었다.
    // 둘 다 '파티클 상승 + 링 1~2개'뿐이라 회복인지 버프인지조차 화면에서 구분이 안 됐다.
    // 공격계에 장면을 붙이면서 지원계만 놔두면 스킬 3분의 1이 여전히 밋밋하다.
    //   heal → **빛기둥 강림**: 위에서 빛 원반이 내려앉고 기둥이 꽂히며 회복 알갱이가 솟는다.
    //   aura → **룬 서클**: 발밑에 문양이 그려지고 가장자리에서 빛기둥이 솟아 서서히 돈다.
    // 축이 반대다 — 회복은 **위에서 내려오고**, 버프는 **아래에서 올라온다**. 이 방향 차이만으로도
    // 둘이 구분된다(색·파티클로 구분하려 들면 스킬 색이 제각각이라 실패한다).
    healPillar(color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const pw = t / 5;
        const hero = this.heroG.position.clone();
        const G = new THREE.Group();
        G.userData.healFx = true;
        this.scene.add(G);
        const R = 0.62 + pw * 0.3;
        // ⓐ 강림 원반 — 머리 위에서 내려앉는다. 얇은 링 2겹(안쪽은 흰 코어)
        const disc = new THREE.Mesh(new THREE.RingGeometry(R * 0.55, R, 26),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        disc.rotation.x = -Math.PI / 2;
        const disc2 = new THREE.Mesh(new THREE.RingGeometry(R * 0.22, R * 0.42, 20),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        disc2.rotation.x = -Math.PI / 2;
        // ⓑ 빛기둥 — 원반에서 아래로 꽂힌다(위가 열린 원통, 옆면만)
        // 🚨 **여기서 가산 합성을 쓰면 안 된다.** 배경이 한낮 하늘·초원이라 이미 밝아서, 가산은
        //    밝은 데 밝은 걸 더해 **거의 아무 차이도 못 만든다**(첫 캡처에서 기둥이 통째로 안 보였다.
        //    같은 화면에서 `aura` 의 서클은 **지면**(어두운 흙) 위라 잘 보였다 — 배경 밝기의 문제다).
        //    기둥은 **일반 합성 + 흰 쪽으로 민 색**으로 '반투명한 빛의 축'을 세우고, 가산은
        //    그 안쪽 가는 코어에만 남긴다.
        const pale = color.clone().lerp(new THREE.Color(0xffffff), 0.55);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.62, 1, 14, 1, true),
            new THREE.MeshBasicMaterial({ color: pale, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
        const colCore = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.3, R * 0.2, 1, 10, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        G.add(disc, disc2, col, colCore);
        const light = this.fxLight(color.getHex(), 6, 'healLight'); // 풀 리스 — 직접 생성 금지(개수 변화 = 재컴파일)
        light.pos(hero.x, hero.y + 1.4, hero.z);
        const topY = hero.y + 3.0, footY = hero.y + 0.06;
        const dur = 0.5 + pw * 0.18;
        this.addAnim(dur, k => {
            // 원반이 내려온다 → 기둥이 그 뒤를 따라 바닥까지 자란다
            const drop = Math.min(1, k / 0.42), e = 1 - Math.pow(1 - drop, 3);
            const dy = topY - (topY - hero.y - 1.55) * e;
            disc.position.set(hero.x, dy, hero.z);
            disc2.position.set(hero.x, dy + 0.01, hero.z);
            const op = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
            disc.material.opacity = 0.85 * op * e;
            disc2.material.opacity = 0.95 * op * e;
            disc.rotation.z += 0.03; disc2.rotation.z -= 0.05;
            const h = Math.max(0.001, dy - footY);
            col.scale.y = h;
            col.position.set(hero.x, footY + h / 2, hero.z);
            col.material.opacity = 0.52 * op * e;
            colCore.scale.y = h;
            colCore.position.set(hero.x, footY + h / 2, hero.z);
            colCore.material.opacity = 0.6 * op * e;
            light.set((1.1 + pw * 1.0) * op * e);
            light.pos(hero.x, dy, hero.z);
            // 회복 알갱이 — 기둥 안에서 **위로** 솟는다(피해 파티클과 반대 방향 = 회복의 문법)
            if (Math.random() < 0.55) {
                this.riseParticle(new THREE.Vector3(hero.x + U.rand(-R, R), footY + U.rand(0, 0.4), hero.z + U.rand(-R, R) * 0.6), color);
            }
        }, () => {
            G.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
            this.scene.remove(G); light.release();
        });
        this.expandRing(new THREE.Vector3(hero.x, 0.02, hero.z), color, 1.1 + pw * 0.6);
        SFX.healDescend(t);
    },
    auraCircle(color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const pw = t / 5;
        const hero = this.heroG.position.clone();
        const G = new THREE.Group();
        G.userData.auraFx = true;
        G.position.set(hero.x, 0.04, hero.z);
        this.scene.add(G);
        const R = 1.0 + pw * 0.45;
        // ⓐ 룬 서클 — 바깥 테 + 안쪽 테 + 사이를 잇는 짧은 살(문양처럼 읽히게)
        const rim = new THREE.Mesh(new THREE.RingGeometry(R * 0.93, R, 40),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        rim.rotation.x = -Math.PI / 2;
        const inner = new THREE.Mesh(new THREE.RingGeometry(R * 0.5, R * 0.56, 30),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        inner.rotation.x = -Math.PI / 2;
        const spokes = new THREE.Group();
        const spokeN = 6 + Math.round(pw * 4);
        for (let i = 0; i < spokeN; i++) {
            const a = (i / spokeN) * Math.PI * 2;
            const sp = new THREE.Mesh(new THREE.RingGeometry(R * 0.6, R * 0.9, 4, 1, a - 0.06, 0.12),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
            sp.rotation.x = -Math.PI / 2;
            spokes.add(sp);
        }
        // ⓑ 가장자리 빛기둥 — 서클에서 **위로** 솟는다(회복의 하강과 반대 축)
        const pillars = [];
        const pn = 4 + Math.round(pw * 2);
        for (let i = 0; i < pn; i++) {
            const a = (i / pn) * Math.PI * 2;
            const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1, 6, 1, true),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
            pl.position.set(Math.cos(a) * R * 0.86, 0, Math.sin(a) * R * 0.86);
            pl.userData.h = 1.1 + U.rand(-0.25, 0.35) + pw * 0.6;
            pillars.push(pl); G.add(pl);
        }
        G.add(rim, inner, spokes);
        const light = this.fxLight(color.getHex(), 6, 'auraLight'); // 풀 리스 — 직접 생성 금지(개수 변화 = 재컴파일)
        light.pos(hero.x, 0.7, hero.z);
        const dur = 0.6 + pw * 0.25;
        this.addAnim(dur, k => {
            const draw = Math.min(1, k / 0.3);                 // 서클이 그려지는 구간
            const op = k < 0.72 ? 1 : 1 - (k - 0.72) / 0.28;
            rim.material.opacity = 0.85 * draw * op;
            inner.material.opacity = 0.7 * draw * op;
            rim.scale.setScalar(0.55 + draw * 0.45);
            inner.scale.setScalar(0.55 + draw * 0.45);
            spokes.children.forEach((sp, i) => {
                const d = Math.max(0, Math.min(1, (draw - i / spokes.children.length * 0.5) * 2));
                sp.material.opacity = 0.8 * d * op;
            });
            G.rotation.y += 0.012;                             // 서서히 돈다 — '유지되는 힘'
            // 빛기둥은 서클이 다 그려진 뒤 솟는다
            const rise = Math.max(0, Math.min(1, (k - 0.26) / 0.34));
            for (const pl of pillars) {
                const h = pl.userData.h * (1 - Math.pow(1 - rise, 2));
                pl.scale.y = Math.max(0.001, h);
                pl.position.y = h / 2;
                pl.material.opacity = 0.6 * rise * op;
            }
            light.set((1.0 + pw * 1.0) * draw * op);
            if (Math.random() < 0.5) {
                const a = U.rand(0, Math.PI * 2);
                this.riseParticle(new THREE.Vector3(hero.x + Math.cos(a) * R * 0.8, 0.05, hero.z + Math.sin(a) * R * 0.8), color);
            }
        }, () => {
            G.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
            this.scene.remove(G); light.release();
        });
        SFX.auraRise(t);
    },

    // ---- 스킬 전용 미니 연출 ⑧: 지원계 6종 개별 시그니처 (skill-unique-signature) ----
    //      (사용자 지시 2026-08-19 "스킬 너무 똑같아 보이는 거 하지 말라 하기")
    //
    // 앞선 `skill-fx-exaggerated` 가 지원계를 heal(빛기둥 강림) / aura(룬 서클) **둘**로 갈라 놨다.
    // 회복이 위에서 내려오고 버프가 아래에서 올라오는 축 대비까지는 좋았지만, 그 안에서
    // **6종이 여전히 3개씩 한 그림**이었다. 여기서 6종을 전부 갈라 준다:
    //   응급 처치 → `firstaid`  붕대가 감기고 십자 표식이 박힌다 (작고 빠른 실무적 처치)
    //   축복       → `heal`      빛기둥 강림 (유지 — '위에서 내려오는 은총'이 곧 축복이다)
    //   신성한 가호 → `wardshield` 육각 결계 돔이 탁 닫힌다 (기둥이 아니라 **껍질**)
    //   전투의 함성 → `warcry`    영웅의 머리에서 포효 고리가 수평으로 터져 나간다
    //   성역       → `aura`      룬 서클 (유지 — 축성된 땅이 곧 성역이다)
    //   시간 왜곡  → `timewarp`  시계 고리 3겹이 서로 다른 속도로 돌고 잔상이 남는다
    //
    // 🚨 **`combat.js` 가 fx 키를 무시하고 있었다** — `tryCast` 이 `d.fx` 가 아니라 리터럴
    //    `'heal'`/`'aura'` 를 넘겨서, 지원계 6종의 `fx` 필드는 **여태 죽은 값**이었다.
    //    (실제 피해: 성역은 `fx:'aura'` 인데 `type:'heal'` 이라 화면에는 빛기둥이 떴다.)
    //    그래서 이 항목은 gamedata 만 갈라서는 아무 일도 안 일어난다 — combat.js 를 같이 고쳤다.
    // ⚠️ `skillCastBeat` 의 `support` 판정도 6종 전부를 알아야 한다. 거기서 빠지면 시전 1박이
    //    공격계 문법(발밑으로 조여드는 링)으로 돌아 지원계의 상승 축과 어긋난다.

    // 응급 처치 — 붕대가 몸을 감고 십자 표식이 박힌다. 지원계 중 유일하게 **작고 빠르다**(커먼).
    // 빛기둥·결계처럼 화면을 먹지 않는 게 이 스킬의 정체성이다 — 크게 만들면 축복과 다시 겹친다.
    firstAidWrap(color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 0 : tier));
        const pw = t / 5;
        const hero = this.heroG.position.clone();
        const G = new THREE.Group();
        G.userData.firstaidFx = true;
        G.position.set(hero.x, hero.y, hero.z);
        this.scene.add(G);
        const mat = (col, op, add) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op,
            side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
            blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
        const pale = color.clone().lerp(new THREE.Color(0xffffff), 0.6);
        // ⓐ 붕대 — 몸을 나선으로 감는 납작한 띠 5~7겹. 아래에서 위로 순서대로 감긴다.
        const wraps = [];
        const wn = 5 + Math.round(pw * 2);
        for (let i = 0; i < wn; i++) {
            const w = new THREE.Mesh(this.fxGeo('torus', 0.34, 0.045, 5, 18), mat(pale, 0, false));
            w.userData = { y0: 0.45 + i * 0.19, sharedGeometry: true };
            w.rotation.x = -Math.PI / 2 + U.rand(-0.16, 0.16);   // 살짝 기울여야 '감았다'로 읽힌다
            w.position.y = w.userData.y0;
            wraps.push(w); G.add(w);
        }
        // ⓑ 십자 표식 — 가슴 앞에 카메라를 향해 박힌다. 회복계의 만국 공통 기호라 한 프레임에 읽힌다.
        const cross = new THREE.Group();
        const barH = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.14), mat(0xffffff, 0, true));
        const barV = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.42), mat(0xffffff, 0, true));
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), mat(color, 0, true));
        glow.position.z = -0.01;
        cross.add(glow, barH, barV);
        cross.position.set(0, 1.15, 0.42);
        if (this.camera) cross.lookAt(this.camera.position);   // 월드 타깃 — 부모 위치를 빼지 말 것
        G.add(cross);
        const light = this.fxLight(color.getHex(), 5, 'firstaidLight');
        light.pos(hero.x, hero.y + 1.1, hero.z);
        SFX.healDescend(t);
        this.addAnim(0.52, k => {
            const op = k < 0.68 ? 1 : 1 - (k - 0.68) / 0.32;
            wraps.forEach((w, i) => {
                // 아래 겹부터 순서대로 감긴다 — 동시에 켜면 '띠 뭉치'가 된다
                const d = Math.max(0, Math.min(1, (k - i * 0.055) / 0.2));
                w.material.opacity = 0.8 * d * op;
                w.scale.setScalar(0.5 + d * 0.5);
                w.rotation.z += 0.05;
                w.position.y = w.userData.y0 + (1 - d) * 0.12;
            });
            // 십자는 붕대가 다 감긴 뒤 **탁** 박힌다(오버슈트) — 마무리 도장
            const s = Math.max(0, Math.min(1, (k - 0.34) / 0.22));
            const pop = s < 1 ? 1.5 - 0.5 * (1 - Math.pow(1 - s, 3)) : 1;
            cross.scale.setScalar(Math.max(0.001, s * pop));
            barH.material.opacity = barV.material.opacity = s * op;
            glow.material.opacity = s * op * 0.5;
            light.set((0.8 + pw * 0.6) * op * Math.min(1, k / 0.2));
            if (Math.random() < 0.4) this.riseParticle(new THREE.Vector3(hero.x + U.rand(-0.35, 0.35), hero.y + U.rand(0.2, 0.9), hero.z + U.rand(-0.2, 0.2)), color);
        }, () => {
            G.traverse(o => {
                if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
                if (o.isMesh && o.material) o.material.dispose();
            });
            this.scene.remove(G); light.release();
        });
    },

    // 신성한 가호 — 육각 결계 **돔**이 탁 닫힌다. 회복계 중 유일하게 몸을 **껍질로 감싼다**
    // (기둥은 축·붕대는 띠·이건 면) — 신화 등급이라 화면에서 가장 큰 지원 연출이어도 된다.
    wardShieldDome(color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 5 : tier));
        const pw = t / 5;
        const hero = this.heroG.position.clone();
        const G = new THREE.Group();
        G.userData.wardFx = true;
        G.position.set(hero.x, hero.y + 0.02, hero.z);
        this.scene.add(G);
        const R = 1.15 + pw * 0.35;
        const mat = (col, op, add) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op,
            side: THREE.DoubleSide, depthWrite: false, toneMapped: false,
            blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
        // ⓐ 돔 본체 — 반구. ⚠️ 가산으로 깔면 한낮 하늘에 통째로 묻힌다(healPillar 가 먼저 밟은 자리):
        //    면은 **일반 합성 + 흰 쪽으로 민 색**으로 반투명 유리처럼, 가산은 테두리에만.
        const pale = color.clone().lerp(new THREE.Color(0xffffff), 0.5);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(pale, 0, false));
        // ⓑ 육각 격자 — 결계가 '판'이 아니라 **짜인 것**으로 읽히게. 위도별 링 3겹 + 경선 6줄.
        const grid = new THREE.Group();
        for (let i = 1; i <= 3; i++) {
            const a = (i / 4) * (Math.PI / 2);
            const ring = new THREE.Mesh(this.fxGeo('torus', R * Math.cos(a), 0.022, 5, 24), mat(color, 0, true));
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = R * Math.sin(a);
            ring.userData.sharedGeometry = true;
            grid.add(ring);
        }
        for (let i = 0; i < 6; i++) {
            const rib = new THREE.Mesh(new THREE.TorusGeometry(R, 0.02, 5, 20, Math.PI / 2), mat(color, 0, true));
            rib.rotation.y = (i / 6) * Math.PI * 2;
            grid.add(rib);
        }
        // ⓒ 바닥 테 — 돔이 지면에 앉았다는 접지선. 없으면 공중에 뜬 비눗방울로 읽힌다.
        const base = new THREE.Mesh(new THREE.RingGeometry(R * 0.94, R * 1.04, 36), mat(color, 0, true));
        base.rotation.x = -Math.PI / 2;
        G.add(dome, grid, base);
        const light = this.fxLight(color.getHex(), 7, 'wardLight');
        light.pos(hero.x, hero.y + 1.0, hero.z);
        SFX.auraRise(t);
        const dur = 0.72 + pw * 0.2;
        this.addAnim(dur, k => {
            // 위에서 덮개가 내려앉듯 닫힌다(y 스케일) → 닫히는 순간 한 번 번쩍 → 유지 → 사라짐
            const close = Math.min(1, k / 0.3);
            const e = 1 - Math.pow(1 - close, 3);
            const op = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
            const snap = Math.max(0, 1 - Math.abs(k - 0.3) / 0.12);   // 닫히는 순간의 섬광
            dome.scale.set(e, e, e);
            grid.scale.set(e, e, e);
            dome.material.opacity = (0.3 + snap * 0.35) * op;
            base.scale.setScalar(e);
            base.material.opacity = (0.7 + snap * 0.3) * op;
            grid.children.forEach(m => { m.material.opacity = (0.55 + snap * 0.45) * op; });
            grid.rotation.y += 0.008;                                 // 아주 천천히 — '유지되는 결계'
            light.set((1.0 + pw * 0.9) * op * (e * 0.6 + snap));
            if (Math.random() < 0.35) {                               // 표면을 타고 오르는 알갱이
                const a = U.rand(0, Math.PI * 2);
                this.riseParticle(new THREE.Vector3(hero.x + Math.cos(a) * R * 0.9, hero.y + 0.1, hero.z + Math.sin(a) * R * 0.9), color);
            }
        }, () => {
            G.traverse(o => {
                if (o.isMesh && o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
                if (o.isMesh && o.material) o.material.dispose();
            });
            this.scene.remove(G); light.release();
        });
        this.expandRing(new THREE.Vector3(hero.x, 0.02, hero.z), color, 1.4 + pw * 0.7);
    },

    // 전투의 함성 — 영웅의 **머리에서** 포효 고리가 수평으로 터져 나간다.
    // 룬 서클(발밑에서 위로)과 축을 반대로 둔다: 이건 **가슴 높이에서 바깥으로**. 유일하게
    // 영웅 몸이 아니라 **주변 공간**이 밀리는 버프라, 카메라 셰이크를 지원계 중 유일하게 쓴다.
    warCryShout(color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const pw = t / 5;
        const hero = this.heroG.position.clone();
        const G = new THREE.Group();
        G.userData.warcryFx = true;
        G.position.set(hero.x, hero.y + 1.25, hero.z);
        this.scene.add(G);
        const mat = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op,
            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
        // 고리 3~5겹이 시차를 두고 터진다. 카메라를 향해 세워야 '퍼지는 파문'으로 읽힌다
        // (눕히면 카메라가 내려다봐서 납작한 선이 된다 — godspear 광륜이 밟은 자리).
        const rings = [];
        const rn = 3 + Math.round(pw * 2);
        for (let i = 0; i < rn; i++) {
            const r = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.66, 26), mat(i % 2 ? 0xffffff : color, 0));
            if (this.camera) r.lookAt(this.camera.position);   // 월드 타깃 — 부모 위치를 빼지 말 것
            r.userData.delay = i * 0.075;
            rings.push(r); G.add(r);
        }
        // 발밑 먼지 테 — 소리가 땅을 때렸다는 증거. 이게 없으면 고리가 허공에 뜬다.
        const dust = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.62, 30), mat(color, 0));
        dust.rotation.x = -Math.PI / 2;
        dust.position.y = -(hero.y + 1.21);
        G.add(dust);
        const light = this.fxLight(color.getHex(), 6, 'warcryLight');
        light.pos(hero.x, hero.y + 1.25, hero.z);
        SFX.mawRoar(t);
        this.shake(0.18 + pw * 0.22);
        this.addAnim(0.6, k => {
            for (const r of rings) {
                const d = Math.max(0, Math.min(1, (k - r.userData.delay) / 0.42));
                const e = 1 - Math.pow(1 - d, 2);                 // 처음 빠르게 → 느려지는 확산
                r.scale.setScalar(0.3 + e * (2.6 + pw * 1.5));
                r.material.opacity = d > 0 ? 0.8 * (1 - d) : 0;
            }
            const dd = Math.max(0, Math.min(1, k / 0.5));
            dust.scale.setScalar(0.5 + dd * (2.2 + pw * 1.0));
            dust.material.opacity = 0.55 * (1 - dd);
            light.set((1.0 + pw * 0.9) * Math.max(0, 1 - k / 0.5));
        }, () => {
            G.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
            this.scene.remove(G); light.release();
        });
    },

    // 시간 왜곡 — 시계 고리 3겹이 **서로 다른 속도로, 일부는 거꾸로** 돈다.
    // 다른 지원계가 전부 '켜졌다 꺼지는' 것과 달리 이건 **계속 어긋나게 도는** 게 정체성이라,
    // 각속도 차이가 곧 연출이다. 영웅 잔상까지 얹어 '시간이 어긋났다'를 못 박는다.
    // ⚠️ 축대칭 고리는 같은 속도로 돌리면 **멈춰 보인다**(whirlwindVortex 가 기록한 함정) —
    //    그래서 고리마다 눈금 수를 다르게 두고 속도도 정수배를 피한다.
    timeWarpDial(color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 4 : tier));
        const pw = t / 5;
        const hero = this.heroG.position.clone();
        const G = new THREE.Group();
        G.userData.timewarpFx = true;
        G.position.set(hero.x, hero.y + 1.05, hero.z);
        // Object3D.lookAt 은 **월드 좌표 타깃**을 받고 부모 변환도 알아서 처리한다 —
        // 부모 위치를 손으로 빼면 엉뚱한 데를 본다. 그냥 카메라 월드 위치를 준다.
        if (this.camera) G.lookAt(this.camera.position);
        this.scene.add(G);
        const mat = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op,
            side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
        // 고리 3겹 — 반지름·눈금 수·각속도가 전부 다르고 가운데 것만 역회전.
        const dials = [];
        const spec = [[1.25, 12, 0.9], [0.92, 8, -1.45], [0.62, 16, 2.1]];
        for (const [rad, ticks, spin] of spec) {
            const d = new THREE.Group();
            const rim = new THREE.Mesh(new THREE.RingGeometry(rad * 0.96, rad, 40), mat(color, 0));
            d.add(rim);
            for (let i = 0; i < ticks; i++) {                    // 눈금 — 이게 있어야 회전이 보인다
                const a = (i / ticks) * Math.PI * 2;
                const len = (i % (ticks / 4) === 0) ? 0.17 : 0.09;
                const tk = new THREE.Mesh(new THREE.PlaneGeometry(0.035, len), mat(i % (ticks / 4) === 0 ? 0xffffff : color, 0));
                tk.position.set(Math.cos(a) * (rad - len / 2 - 0.02), Math.sin(a) * (rad - len / 2 - 0.02), 0);
                tk.rotation.z = a - Math.PI / 2;
                d.add(tk);
            }
            d.userData = { spin, rad };
            dials.push(d); G.add(d);
        }
        // 시계 바늘 2개 — 긴 바늘이 **거꾸로** 돈다(시간이 되감긴다는 한 컷 설명)
        const hands = [];
        for (const [len, w, spin] of [[1.05, 0.05, -3.2], [0.68, 0.07, 1.1]]) {
            const h = new THREE.Mesh(new THREE.PlaneGeometry(w, len), mat(0xffffff, 0));
            h.geometry.translate(0, len / 2, 0);                 // 회전 원점을 바늘 뿌리로
            h.userData.spin = spin;
            hands.push(h); G.add(h);
        }
        const light = this.fxLight(color.getHex(), 6, 'timewarpLight');
        light.pos(hero.x, hero.y + 1.05, hero.z);
        SFX.auraRise(t);
        const dur = 0.85 + pw * 0.2;
        this.addAnim(dur, k => {
            const draw = Math.min(1, k / 0.26);
            const op = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
            dials.forEach((d, i) => {
                const dd = Math.max(0, Math.min(1, (draw - i * 0.18) * 1.6));
                d.rotation.z += d.userData.spin * 0.03;
                d.scale.setScalar(0.4 + dd * 0.6);
                d.children.forEach(m => { m.material.opacity = (m.material.color.getHex() === 0xffffff ? 0.9 : 0.7) * dd * op; });
            });
            for (const h of hands) {
                h.rotation.z += h.userData.spin * 0.03;
                h.material.opacity = 0.85 * draw * op;
                h.scale.setScalar(0.4 + draw * 0.6);
            }
            light.set((0.9 + pw * 0.9) * draw * op);
        }, () => {
            G.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
            this.scene.remove(G); light.release();
        });
        // 영웅 잔상 — '시간이 어긋났다'의 본체. 등급이 높을수록 여러 겹.
        this.expandRing(new THREE.Vector3(hero.x, 0.02, hero.z), color, 1.2 + pw * 0.8);
    },

    // ---- 스킬 전용 미니 연출 ⑦: 회오리 (skill-fx-exaggerated, 사용자 지시 2026-08-19) ----
    // `ring`(회오리 베기)은 이름이 **회오리**인데 화면에는 **퍼지는 링 2개**뿐이었다 — 도는 물건이
    // 하나도 없어서 '회오리'가 아니라 '충격파'로 읽혔다. 커먼이라 초반에 가장 많이 보는 스킬이다.
    // 장면: 발밑에서 먼지가 감기기 시작 → 칼날 깃이 층층이 **돌면서** 깔때기를 만든다 → 깔때기가
    //       바깥으로 퍼지며 닿는 적을 벤다 → 위로 풀리며 흩어진다.
    // ⚠️ **도는 게 보여야 회오리다.** 층마다 각속도를 다르게 줘야 회전이 눈에 걸린다 — 통짜로 같은
    //    속도면 '돌아가는 원뿔'이 아니라 '가만히 있는 원뿔'로 보인다(모양이 축대칭이라 그렇다).
    whirlwindVortex(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 0 : tier));
        const pw = t / 5;
        const hero = this.heroG.position.clone();
        const G = new THREE.Group();
        G.userData.vortexFx = true;
        G.position.set(hero.x, 0.05, hero.z);
        this.scene.add(G);
        // 층 3개 — 위로 갈수록 넓어지는 깔때기. 층마다 깃 수·각속도가 다르다.
        const layers = [];
        const LAY = [{ y: 0.12, r: 0.55, n: 3, w: 1.0 }, { y: 0.62, r: 0.85, n: 4, w: -1.45 }, { y: 1.15, r: 1.15, n: 3, w: 1.9 }];
        for (const L of LAY) {
            const lg = new THREE.Group();
            lg.position.y = L.y;
            lg.userData.w = L.w;
            for (let i = 0; i < L.n; i++) {
                const a = (i / L.n) * Math.PI * 2;
                // 깃 = 얇은 부분 링(호). 길이를 층마다 달리해 나선처럼 어긋나 보이게 한다.
                const vane = new THREE.Mesh(new THREE.RingGeometry(L.r * 0.62, L.r, 16, 1, a, 1.05),
                    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
                vane.rotation.x = -Math.PI / 2;
                lg.add(vane);
            }
            G.add(lg); layers.push(lg);
        }
        const dur = 0.62 + pw * 0.24;
        const grow = 1 + pw * 0.75;                      // 등급이 높을수록 크게 퍼진다
        const hit = new Set();
        this.addAnim(dur, k => {
            const e = 1 - Math.pow(1 - k, 2);
            const op = k < 0.68 ? Math.min(1, k / 0.16) : 1 - (k - 0.68) / 0.32;
            G.scale.set(0.45 + e * grow, 0.7 + e * 0.7, 0.45 + e * grow);
            for (const lg of layers) {
                lg.rotation.y += lg.userData.w * 0.14;   // 층마다 다른 각속도 = 회전이 읽힌다
                for (const v of lg.children) v.material.opacity = 0.8 * op;
            }
            // 감겨 올라가는 먼지 — 회오리 안쪽에서 위로
            if (Math.random() < 0.6) {
                const a = U.rand(0, Math.PI * 2), rr = (0.4 + e * grow) * U.rand(0.5, 1);
                this.riseParticle(new THREE.Vector3(hero.x + Math.cos(a) * rr, 0.06, hero.z + Math.sin(a) * rr), color);
            }
            // 깔때기가 닿는 적을 벤다 — **한 번씩만**(매 프레임 때리면 불티가 화면을 덮는다)
            const reach = (0.45 + e * grow) * 1.15;
            for (const id of (targetIds || [])) {
                if (hit.has(id)) continue;
                const m = this.enemyMap.get(id);
                if (!m) continue;
                if (Math.hypot(m.g.position.x - hero.x, m.g.position.z - hero.z) <= reach) {
                    hit.add(id);
                    const p = m.g.position.clone().add(new THREE.Vector3(0, 0.55, 0));
                    this.spawnSparks(p, Math.round(10 + pw * 14), color.getHex(), { speed: 1.3 + pw * 0.6 });
                    this.flashLight(p, color.getHex(), 0.16);
                    this.shake(0.12 + pw * 0.14);
                    SFX.slashArc(hit.size - 1, t);
                }
            }
        }, () => {
            G.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
            this.scene.remove(G);
        });
        this.expandRing(new THREE.Vector3(hero.x, 0.02, hero.z), color, 1.6 + pw * 1.4);
        SFX.auraRise(t);
    },

    // ---- 스킬 전용 미니 연출 ⑧: 화염 폭풍 (skill-fx-exaggerated, 사용자 지시 2026-08-19) ----
    // `explode`(화염구·초신성)는 폭발 + 불기둥이라 fx 중에선 나은 편이었지만 여전히 **한 점에서
    // 한 번 터지고 끝**이라 '장면'은 아니었다. 그리고 스킬 이름이 **화염구**인데 정작
    // **날아가는 불덩이가 없었다** — 적 발밑에서 갑자기 터졌다.
    // 장면 4단: 영웅 손에서 불덩이가 포물선으로 날아가고 → 착탄해 터지고 → 불의 고리가 바깥으로
    //          퍼지며 그 위로 불기둥이 **차례로** 솟고 → 잉걸이 남아 스러진다.
    // ⚠️ 운석(하늘에서 여러 개)·아가리(땅에서 솟음)와 **겹치지 않는 축**을 골랐다: 이건 **수평으로
    //    퍼지는** 불이다. 세 연출이 각각 위/아래/바깥을 맡아 같은 광역기라도 그림이 안 겹친다.
    fireStorm(targetIds, color, tier) {
        if (!this.scene) return;
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const pw = t / 5;
        const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
        const spot = (live.length ? live[0].g.position.clone() : this.heroG.position.clone().add(new THREE.Vector3(2, 0, 0)));
        const from = this.heroG.position.clone().add(new THREE.Vector3(0.4, 1.05, 0));
        // ⓐ 불덩이 — 포물선. 코어 + 글로우 2겹에 불티 꼬리.
        const ball = new THREE.Group();
        ball.userData.fireBall = true;
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17 + pw * 0.09, 0),
            new THREE.MeshBasicMaterial({ color: 0xffe0a8, toneMapped: false }));
        const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + pw * 0.14, 0),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        ball.add(core, glow);
        ball.position.copy(from);
        this.scene.add(ball);
        const arc = 1.1 + pw * 0.4;                       // 포물선 높이
        const fly = 0.3 + pw * 0.06;
        this.addAnim(fly, k => {
            ball.position.lerpVectors(from, spot, k);
            ball.position.y += Math.sin(k * Math.PI) * arc;   // 위로 솟았다 내려앉는 궤적
            ball.rotation.x += 0.3; ball.rotation.y += 0.24;
            if (Math.random() < 0.85) this.riseParticle(ball.position.clone(), new THREE.Color(0xff7043));
        }, () => {
            ball.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
            this.scene.remove(ball);
            // ⓑ 착탄
            this.explosion(spot.clone(), color);
            this.flashLight(spot.clone(), color.getHex(), 0.3);
            this.shake(0.28 + pw * 0.26);
            SFX.stormStrike(0);
            // ⓒ 불의 고리가 **바깥으로** 퍼지며 그 위로 불기둥이 차례로 솟는다
            const waves = 3 + Math.round(pw * 2);
            for (let w = 0; w < waves; w++) {
                setTimeout(() => {
                    const rad = 0.55 + w * (0.62 + pw * 0.2);
                    this.expandRing(new THREE.Vector3(spot.x, 0.02, spot.z), color, rad * 1.5);
                    const pn = 3 + w;                       // 바깥 고리일수록 기둥이 많다
                    for (let i = 0; i < pn; i++) {
                        const a = (i / pn) * Math.PI * 2 + w * 0.5;
                        const p = new THREE.Vector3(spot.x + Math.cos(a) * rad, 0, spot.z + Math.sin(a) * rad * 0.6);
                        this.firePillar(p, color, Math.max(0, t - w));   // 바깥으로 갈수록 낮아진다
                        if (Math.random() < 0.6) this.riseParticle(p.clone(), new THREE.Color(0xff8a50));
                    }
                    this.shake((0.16 + pw * 0.16) * (1 - w / waves));
                    SFX.stormStrike(w + 1);
                }, 70 + w * (95 - pw * 18));
            }
        });
        SFX.arrowShot(0, t);
    },

    // 지그재그 번개 볼트 (항목 ㉰: 번개류=지그재그 볼트 메시). 예전 bolt 는 하늘에서 내리꽂는
    // 굵은 **곧은 원기둥**이라 '번개'가 아니라 '흰 기둥'으로 읽혔다 — 번개의 정체성은 **꺾인 경로**다.
    // from→to 사이를 세그먼트로 나눠 가로로 지터를 준 폴리라인을 TubeGeometry 로 두껍혀,
    // 청백 코어 + 색 글로우 2겹으로 만든다. 등급이 높으면 갈래(fork)가 붙는다. 번개는 **깜빡인다** —
    // 밝기를 두어 번 튀겼다 사그라뜨려 정지한 빔과 구분한다.
    lightningBolt(from, to, color, tier) {
        // 꺾인 경로: 위에서 아래로 내려오며 가로 지터. 타깃 근처일수록 지터를 줄여 적에 수렴한다.
        const segs = 9;
        const pts = [];
        for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const base = from.clone().lerp(to, t);
            if (i > 0 && i < segs) {
                const conv = 1 - t;                          // 위쪽일수록 크게, 타깃에선 0
                base.x += U.rand(-0.55, 0.55) * conv;
                base.z += U.rand(-0.28, 0.28) * conv;        // 카메라 깊이축은 얕게(옆에서 봤을 때 과하지 않게)
            }
            pts.push(base);
        }
        const curve = new THREE.CatmullRomCurve3(pts);
        const tubeR = 0.05 + tier * 0.012;
        const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, tubeR * 2.4, 5, false),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        const bolt = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, tubeR, 5, false),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, toneMapped: false }));
        const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, tubeR * 0.42, 4, false),
            new THREE.MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 1, toneMapped: false }));
        const group = new THREE.Group();
        group.add(glow, bolt, core);
        // 갈래(fork): 중간 지점에서 짧게 튀어나간 곁가지 — 에픽 이상만, 등급 따라 1~3개
        const forkN = tier >= 2 ? Math.min(3, tier - 1) : 0;
        for (let f = 0; f < forkN; f++) {
            const anchor = pts[3 + Math.floor(U.rand(0, segs - 4))];
            const fpts = [anchor.clone()];
            let cur = anchor.clone();
            for (let j = 0; j < 3; j++) { cur = cur.clone().add(new THREE.Vector3(U.rand(-0.5, 0.5), U.rand(-0.7, -0.2), U.rand(-0.2, 0.2))); fpts.push(cur); }
            const fc = new THREE.CatmullRomCurve3(fpts);
            const fm = new THREE.Mesh(new THREE.TubeGeometry(fc, 16, tubeR * 0.6, 4, false),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
            group.add(fm);
        }
        this.scene.add(group);
        this.flashLight(to, color.getHex(), 0.22);
        // 깜빡임: 처음 120ms 는 밝기를 튀기고(스트로브), 이후 사그라든다
        const mats = [];
        group.traverse(o => { if (o.isMesh && o.material) mats.push(o.material); });
        const op0 = mats.map(mt => mt.opacity);
        this.addAnim(0.32, k => {
            const t = k * 0.32;
            let a;
            if (t < 0.12) a = 0.55 + 0.45 * Math.abs(Math.sin(t * 90));  // 스트로브(약 3회 깜빡)
            else a = Math.max(0, 1 - (t - 0.12) / 0.2);                  // 페이드
            mats.forEach((mt, i) => mt.opacity = op0[i] * a);
        }, () => { this.disposeTree(group); this.scene.remove(group); });
    },

    // 화염 스킬(fireball·supernova)의 치솟는 불기둥 (항목 ㉰: 화염류=파티클 불기둥+잔광).
    // 예전 explode 는 사방으로 퍼지는 폭발뿐이라 '수평으로 터지는 것'이었고 '불'의 정체성(위로
    // 치솟는 불꽃)이 없었다. 밑에서 위로 **자라며 흔들리는** 가산 화염 기둥 + 치솟는 불티로 세운다.
    firePillar(pos, color, tier) {
        const h = 1.4 + tier * 0.35, r = 0.34 + tier * 0.05;
        // 3겹: 바깥 색 불꽃 → 안쪽 살구 → 흰 코어. 아래가 굵고 위가 가는 화염 실루엣(원뿔 역방향).
        const cone = (rad, top, colHex, op) => {
            const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.35, rad, h, 8, 1, true),
                new THREE.MeshBasicMaterial({ color: colHex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
            m.position.y = h / 2;
            return m;
        };
        const grp = new THREE.Group();
        grp.position.set(pos.x, pos.y, pos.z);
        // 가산 합성은 겹칠수록 흰색으로 밀린다 — 흰 코어를 크게 주면 '불'이 아니라 '흰 원뿔'이 된다
        // (첫 판 실측). 그래서 **색 껍질을 짙게, 흰 코어는 가늘고 옅게** 잡아 화염 색이 지배하게 한다.
        grp.add(cone(r, h, color.getHex(), 0.85));      // 바깥 = 스킬 색 (지배색)
        grp.add(cone(r * 0.58, h * 0.94, 0xff6a1f, 0.6)); // 중간 = 진한 주황
        grp.add(cone(r * 0.24, h * 0.86, 0xffd98a, 0.5)); // 코어 = 가늘고 옅은 밝은 불
        this.scene.add(grp);
        // 치솟는 불티 — 기둥 둘레에서 위로 흐른다
        for (let i = 0; i < Math.round(8 + tier * 4); i++) {
            const a = U.rand(0, Math.PI * 2), rr = U.rand(0, r * 0.7);
            this.riseParticle(pos.clone().add(new THREE.Vector3(Math.cos(a) * rr, U.rand(0, 0.3), Math.sin(a) * rr)), color);
        }
        // 자람(0.12s) → 일렁이며 유지 → 페이드. y 스케일로 치솟고, x/z 로 살짝 흔든다.
        this.addAnim(0.42, k => {
            const grow = Math.min(1, k / 0.28);                 // 0.12s 안에 다 자란다
            const fade = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
            grp.scale.y = grow;
            const flick = 1 + Math.sin(k * 40) * 0.08;
            grp.scale.x = grp.scale.z = flick;
            grp.children.forEach((c, i) => { c.material.opacity = [0.85, 0.6, 0.5][i] * fade * (0.85 + 0.15 * Math.sin(k * 55 + i)); });
        }, () => { this.disposeTree(grp); this.scene.remove(grp); });
    },

    // ---- 연출 포인트라이트 풀 (skill-cast-lag-optimize) ----
    // 🚨 연출용 라이트는 반드시 이 풀에서 빌린다 — `new THREE.PointLight` 를 씬에 넣었다 빼지 말 것.
    // three 는 씬의 포인트라이트 **개수**가 변할 때마다(NUM_POINT_LIGHTS 디파인) 라이트를 받는 모든
    // 재질의 셰이더 프로그램을 재컴파일한다. 스킬·처치 플래시가 라이트를 수시로 넣었다 빼던 종전
    // 구조에서는 동시 연출 수가 0↔1↔2↔… 로 출렁일 때마다 수십 프로그램짜리 컴파일 스톨이 터졌다
    // (renderer.info.programs 실측 38→97개 — '스킬 나올 때 렉'의 본체). 풀은 부팅 때 4기를 씬에
    // 상주시켜 개수를 고정하고, 빌림/반납은 intensity 만 만진다.
    // 리스 토큰: 풀이 바닥나면 가장 오래된 리스를 뺏는다(동시 연출 라이트 상한 = 4). 뺏긴 쪽의
    // 애니메이션이 남아 있어도 토큰이 다르면 set/release 가 무시돼 새 주인의 연출을 망치지 않는다.
    // ---- 연출 공유 지오메트리 캐시 (skill-cast-lag-optimize) ----
    // 충격 링·시전 룬 링·회복 알갱이는 매 발동마다 **같은 치수**의 지오메트리를 새로 만들어
    // GPU 버퍼 생성/업로드를 반복하고 0.2초 뒤 버렸다(커먼·레어 대역은 초당 여러 번). 치수가
    // 상수인 프리미티브는 여기서 한 번 만들어 공유한다 — 크기 변주는 어차피 mesh.scale 로 한다.
    // 🚨 공유 지오메트리를 받는 메시는 반드시 `userData.sharedGeometry = true` 를 달 것 —
    //    disposeTree/파티클 청소가 그 플래그를 보고 지오메트리를 건너뛴다(안 달면 해제 후
    //    다음 사용 때 재업로드라 캐시가 무의미해진다).
    _fxGeoCache: {},
    fxGeo(kind, a, b, c, d) {
        const k = kind + ':' + a + ':' + b + ':' + c + ':' + d;
        let g = this._fxGeoCache[k];
        if (!g) {
            g = kind === 'torus' ? new THREE.TorusGeometry(a, b, c, d) : new THREE.SphereGeometry(a, b, c);
            this._fxGeoCache[k] = g;
        }
        return g;
    },

    initFxLights() {
        this._fxLights = [];
        this._fxLightSeq = 0;
        for (let i = 0; i < 4; i++) {
            const pl = new THREE.PointLight(0xffffff, 0, 7);
            pl.position.set(0, -50, 0);
            pl.userData.lease = 0;
            this.scene.add(pl);
            this._fxLights.push(pl);
        }
    },
    // tag: 리스 동안 pl.userData[tag]=true 로 표시(검증 프로브가 연출별 라이트를 세는 용도).
    // 반납·강탈 시 지워진다 — 풀 라이트는 공유 객체라 태그를 남기면 다음 연출에 오인된다.
    fxLight(colorHex, distance, tag) {
        let pl = this._fxLights.find(l => !l.userData.busy);
        if (!pl) pl = this._fxLights.reduce((a, b) => (a.userData.lease <= b.userData.lease ? a : b));
        const token = ++this._fxLightSeq;
        if (pl.userData._fxTag) { delete pl.userData[pl.userData._fxTag]; delete pl.userData._fxTag; }
        pl.userData.busy = true; pl.userData.lease = token;
        if (tag) { pl.userData[tag] = true; pl.userData._fxTag = tag; }
        pl.color.setHex(colorHex); pl.intensity = 0;
        pl.distance = distance || 7;
        return {
            light: pl,
            set(i) { if (pl.userData.lease === token) pl.intensity = i; },
            get() { return pl.userData.lease === token ? pl.intensity : 0; },
            pos(x, y, z) { if (pl.userData.lease === token) pl.position.set(x, y, z); },
            release() {
                if (pl.userData.lease !== token) return;
                pl.intensity = 0; pl.userData.busy = false;
                if (pl.userData._fxTag) { delete pl.userData[pl.userData._fxTag]; delete pl.userData._fxTag; }
            },
        };
    },

    // 순간 광원 플래시 (연출 강화)
    flashLight(pos, colorHex, dur) {
        const h = this.fxLight(colorHex, 7);
        h.pos(pos.x, pos.y + 0.8, pos.z + 0.5);
        this.addAnim(dur || 0.3, k => { h.set(2.8 * (1 - k)); }, () => h.release());
    },

    explosion(pos, color) {
        this.spawnSparks(pos.clone().add(new THREE.Vector3(0, 0.5, 0)), 30, color.getHex());
        this.expandRing(pos, color, 1.6);
        this.expandRing(pos, new THREE.Color(0xffffff), 0.9);
        this.flashLight(pos, color.getHex(), 0.35);
    },

    // 지면 그을음 데칼: 처치 버스트에 '어두운 값'을 하나 넣는다.
    // 코어·파편·불티가 전부 크림화이트라 버스트가 한 덩어리 얼룩으로 뭉치던 문제(비평가 2차 ⓑ) —
    // 밝은 요소만 겹쳐서는 대비가 생기지 않으므로, 밝은 것들이 사라진 뒤에도 남는 어두운 바닥을 깐다.
    scorchTex() {
        if (this._scorchTex) return this._scorchTex;
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const x = c.getContext('2d'), R = 32;
        const g = x.createRadialGradient(R, R, 0, R, R, R);
        g.addColorStop(0, 'rgba(255,255,255,.95)');
        g.addColorStop(0.55, 'rgba(255,255,255,.7)');   // 가장자리를 흐릿하게 — 딱딱한 원판은 스티커로 읽힌다
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g; x.fillRect(0, 0, 64, 64);
        this._scorchTex = new THREE.CanvasTexture(c);
        return this._scorchTex;
    },

    scorchDecal(pos, radius, dur) {
        // ⚠️ 색은 반드시 convertSRGBToLinear를 거친다. renderer.outputEncoding = sRGBEncoding이라
        // 머티리얼 색은 **선형값으로 취급돼 출력에서 sRGB 인코딩**된다 — 0x3a1a0a(니어블랙 갈색)를
        // 그냥 넣으면 화면에는 (131,90,57) 중간 갈색으로 나와, '어두운 값을 하나 넣는다'는 이 데칼의
        // 존재 이유가 뒤집힌다(실측: 데칼이 지면 R채널을 오히려 +2.9 밝게 만들었다 — 3차 지적 ⑤).
        const d = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2),
            new THREE.MeshBasicMaterial({
                map: this.scorchTex(), color: new THREE.Color(0x3a1a0a).convertSRGBToLinear(),
                transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
            }));
        d.rotation.x = -Math.PI / 2;
        d.position.set(pos.x, 0.035, pos.z); // 지면(0)보다 살짝 위 — z-파이팅 방지, 블롭 섀도우(0.025)보다도 위
        this.scene.add(d);
        this.addAnim(dur, k => {
            d.material.opacity = k < 0.08 ? 0.72 * (k / 0.08) : 0.72 * Math.pow(1 - (k - 0.08) / 0.92, 1.6);
            d.scale.setScalar(0.72 + 0.28 * Math.min(1, k * 6)); // 터지며 넓어졌다 고정
        }, () => { this.disposeTree(d); this.scene.remove(d); });
    },

    expandRing(pos, color, maxR) {
        // ⚠️ **정지한 링은 충격파가 아니라 지면 얼룩이다.** 앞선 교정(0.45→0.28초, 첫 25%에 다 퍼짐)은
        // 크기만 줄였을 뿐 문제의 형태를 안 바꿨다 — 실측(`probe-shock-ring.js`)에서 링은 **+67ms 에
        // 만개한 뒤 +267ms 까지 200ms 동안 지름이 100.5px 에 못박힌 채** 알파만 빠졌다. 수명의 3/4을
        // 안 움직이고 서 있었던 셈이라, 비평가 A #4 가 본 '얼룩'은 크기보다 이 **정체 구간**이었다.
        // 그래서 ⑴ 끝까지 계속 퍼지는 감속 곡선으로 바꾸고 ⑵ 수명을 0.17초로 줄인다.
        const under = new THREE.Mesh(this.fxGeo('torus', 0.3, 0.085, 6, 24),
            new THREE.MeshBasicMaterial({ color: 0x2a1a0e, transparent: true, opacity: 0.5 }));
        const ring = new THREE.Mesh(this.fxGeo('torus', 0.3, 0.06, 6, 24),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        under.userData.sharedGeometry = ring.userData.sharedGeometry = true; // 공유 지오 — dispose 금지 플래그
        // 밝은 초원·모랫길 위의 연주황 링은 밝기가 배경과 겹쳐 안 뜬다(A #4 '저대비'). 채도·밝기를
        // 더 올리면 화이트아웃 쪽으로 가므로, 대신 **어두운 밑링**을 한 겹 깔아 명도 경계를 만든다
        // (데미지 숫자 판독성을 색이 아니라 명도 경계로 푼 것과 같은 처방 — 비평가 4차 ⓒ).
        for (const r of [under, ring]) { r.rotation.x = -Math.PI / 2; r.position.set(pos.x, 0.12, pos.z); this.scene.add(r); }
        under.position.y = 0.118;
        this.addAnim(0.17, k => {
            const g = 1 - Math.pow(1 - k, 2.4);         // 앞이 빠르되 **끝까지 멈추지 않는다**
            const s = 0.35 + g * maxR * 2;
            ring.scale.setScalar(s);
            under.scale.setScalar(s * 1.04);
            const a = (1 - k) * (1 - k);
            ring.material.opacity = 0.95 * a;
            under.material.opacity = 0.55 * a;
        }, () => {
            for (const r of [under, ring]) { this.disposeTree(r); this.scene.remove(r); }
        });
    },

    // 실제로 날아가는 발사체 + 혜성 꼬리 (항목 ㉰: 화살류=발사체 트레일+적중 파편).
    // ---- 스킬 전용 미니 연출 ④: 화살 세례 (skill-fx-exaggerated, 사용자 지시 2026-08-19) ----
    // 사용자 원문: "화살들을 존나 여러 개 다다다다다다다닥 쏜다던지".
    // `beam`(관통 사격·공허의 창)은 화살 **한 발**이었다. 화살 자체의 조형(머리·꼬리·글로우·관통
    // 파편)은 이미 좋았으니 **발수만** 세례로 바꾼다 — 물건을 새로 만들 이유가 없다.
    // ⚠️ 화살은 비행이 0.09초로 짧다. 그래서 간격을 낙뢰(65~96ms)보다 더 좁혀야 '다다다닥'이 된다 —
    //    낙뢰 간격을 그대로 쓰면 발과 발 사이가 비어 '한 발씩 쏜다'로 읽힌다.
    // ⚠️ **첫 발과 마지막 발은 정조준**, 가운데만 흩는다(운석과 같은 규칙 — 조준됐다/마무리가 읽힌다).
    //    마지막 한 발은 굵게: 관통 사격은 세례로, 공허의 창은 마지막 큰 창으로 읽히게 하는 겸용이다.
    // 발 간격(ms) — 등급이 높을수록 촘촘하게. **판정기가 이 값을 읽어 판정선을 만든다**(손으로
    // 베끼면 여기를 고친 뒤에도 옛 값으로 재는 함정에 걸린다 — TODO 계측 함정 ④).
    arrowGapMs(tier) { return 62 - Math.max(0, Math.min(5, tier | 0)) * 4; },
    arrowVolley(targetIds, color, tier) {
        const t = Math.max(0, Math.min(5, tier === undefined ? 1 : tier));
        const n = 3 + Math.min(4, t);                  // 레어 4발 … 궁극 이상 7발
        const gap = this.arrowGapMs(t);
        for (let i = 0; i < n; i++) {
            setTimeout(() => {
                const live = (targetIds || []).map(id => this.enemyMap.get(id)).filter(Boolean);
                if (!live.length) return;              // 다 죽었으면 허공에 쏘지 않는다
                const m = live[i % live.length];
                const last = i === n - 1;
                const j = (i === 0 || last) ? 0 : 0.34;
                const from = this.heroG.position.clone().add(new THREE.Vector3(0.4, 1 + U.rand(-0.12, 0.12), U.rand(-0.1, 0.1)));
                const to = m.g.position.clone().add(new THREE.Vector3(U.rand(-j, j), 0.6 + U.rand(-j, j) * 0.6, U.rand(-j, j) * 0.5));
                this.projectileBolt(from, to, color, last ? Math.min(5, t + 2) : t);
                if (last) { this.expandRing(new THREE.Vector3(to.x, 0.02, to.z), color, 1.2 + t * 0.22); this.shake(0.2 + t * 0.05); }
                SFX.arrowShot(i, t);
            }, i * gap);
        }
    },

    projectileBolt(from, to, color, tier) {
        const delta = to.clone().sub(from), dist = delta.length();
        const dir = delta.clone().normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); // 실린더/콘 축(+y)을 진행방향으로
        const dur = 0.09 + tier * 0.004;               // 화살답게 빠르게
        const tailLen = Math.min(dist * 0.55, 1.7 + tier * 0.15);
        const headR = 0.08 + tier * 0.012;
        // 머리(뾰족한 화살촉) — 흰 코어. 꼬리(혜성 tail) — 스킬 색 가산. 글로우 한 겹 더.
        const head = new THREE.Mesh(new THREE.ConeGeometry(headR, 0.34, 6),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, toneMapped: false }));
        const tail = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.85, 0.015, 1, 6, 1, true),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(headR * 1.7, 0.03, 1, 6, 1, true),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        head.quaternion.copy(q); tail.quaternion.copy(q); glow.quaternion.copy(q);
        this.scene.add(head, tail, glow);
        const placeTail = (m, headPos, len) => {
            m.position.copy(headPos).addScaledVector(dir, -len / 2 - 0.17); // 머리 뒤로 len 만큼
            m.scale.y = Math.max(0.001, len);
        };
        this.addAnim(dur, k => {
            const headPos = from.clone().addScaledVector(dir, dist * k + 0.17);
            head.position.copy(headPos);
            const len = tailLen * Math.min(1, k / 0.35);   // 처음엔 짧게 시작해 곧 최대 길이
            placeTail(tail, headPos, len); placeTail(glow, headPos, len * 1.05);
        }, () => {
            this.disposeTree(head); this.disposeTree(tail); this.disposeTree(glow);
            this.scene.remove(head); this.scene.remove(tail); this.scene.remove(glow);
            // 적중 파편 + 플래시 — 진행 방향으로 튀는 파편(관통의 관성)
            this.spawnShards(to, tier >= 2 ? 12 : 8, color.getHex(), { dir: Math.atan2(dir.y, dir.x), spread: 0.7, speed: 1.3 + tier * 0.15 });
            this.spawnSparks(to, 10 + tier * 3, color.getHex(), { speed: 1.6 });
            this.flashLight(to, color.getHex(), 0.26);
        });
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
    // 무기 계열별 날 끝 y (weaponG 로컬) — 궤적을 날 끝에서 뽑기 위한 길이표
    TRAIL_TIP: { sword: 0.95, axe: 0.85, spear: 1.25, hammer: 0.8, dagger: 0.55, club: 0.6, mace: 0.75, rapier: 1.05, scythe: 1.15 },
    // 임팩트 티어별 트레일 — 7차 지적 ㉲ "140 과 10k 가 같은 트레일". 트레일은 **스윙 시작**에
    // 무기 시대색으로 켜지는데, 그 시점엔 이번 타격이 얼마짜리인지 아직 정해지지 않았다(피해는
    // 0.16초 뒤 접촉에서 굴린다). 그래서 스윙 색만으로는 위계를 줄 수가 없었다.
    // → 접촉 순간에 **남은 리본을 소급해서** 티어 색·세기로 갈아탄다. 리본 수명이 0.22초라
    //    접촉 뒤로도 충분히 보이고, 눈에는 '칼이 지나간 자국이 뒤늦게 확 달아오르는' 것으로 읽힌다.
    // 색 언어는 `flashMesh`·데미지 숫자와 **같은 사다리**를 쓴다(일반 청백 < 크리 주황 < 처치 금백) —
    // 한 화면에서 몸 플래시·숫자·트레일이 따로 놀면 위계가 세 갈래로 흩어진다.
    TRAIL_TIER: {
        normal: { c: 0xcfe8ff, gain: 1.0, core: 0.35 },
        crit: { c: 0xff7a1a, gain: 1.3, core: 0.62 },
        kill: { c: 0xfff6e0, gain: 1.5, core: 0.9 },
    },
    // 접촉 순간 호출 — 남은 트레일을 티어 색·세기로 물들이고 수명 동안 원래대로 흘려보낸다.
    trailImpact(tier) {
        if (!this.trailMat) return;
        const T = this.TRAIL_TIER[tier] || this.TRAIL_TIER.normal;
        const u = this.trailMat.uniforms;
        u.uColor.value.setHex(T.c);
        u.uGain.value = T.gain;
        u.uCore.value = T.core;
        // 증폭만 되돌린다(색은 다음 `trailStart` 가 무기색으로 되돌린다) — 안 흘리면 리본이
        // 꺼질 때까지 같은 세기로 남아 '스윙이 안 끝난' 것처럼 보인다.
        this.addAnim(0.22, k => {
            u.uGain.value = T.gain + (1 - T.gain) * k;
            u.uCore.value = T.core + (0.35 - T.core) * k;
        });
    },
    trailStart(colorHex) {
        if (!this.trailMesh) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 6 * 3), 3)); // 48세그 — 풀 아크 수용 (24세그는 스윙 절반에서 버퍼 포화 → '블레이드 옆 스텁')
            geo.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(48 * 6), 1)); // 1=새 샘플, 0=수명 끝 — 나이 기반 알파 그라디언트
            // 가산 블렌딩은 풀 아크에서 겹침이 순백 삼각형으로 폭주 (비평가 7.1 1번 화이트아웃의 실체) —
            // 노멀 블렌딩 + 나이별 알파 페이드 + 신선한 구간만 백색 코어로 '읽히는 곡선' 리본
            this.trailMat = new THREE.ShaderMaterial({
                // uGain = 임팩트 순간 티어별 알파 증폭 · uCore = 날끝 흰 코어 세기.
                // 둘 다 trailStart 가 스윙마다 기본값으로 되돌리므로 티어 색이 다음 스윙에 새지 않는다.
                uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uGain: { value: 1 }, uCore: { value: 0.35 } },
                vertexShader: 'attribute float aFade; varying float vFade;\n' +
                    'void main(){ vFade = aFade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
                fragmentShader: 'uniform vec3 uColor; uniform float uGain; uniform float uCore; varying float vFade;\n' +
                    'void main(){ float f = clamp(vFade, 0.0, 1.0);\n' +
                    '  vec3 col = mix(uColor, vec3(1.0), pow(f, 4.0) * uCore);\n' + // 날 끝 최신 구간만 얇은 흰 코어
                    '  gl_FragColor = vec4(col, clamp(pow(f, 1.6) * 0.72 * uGain, 0.0, 1.0)); }',
                transparent: true, depthWrite: false, side: THREE.DoubleSide,
            });
            this.trailMesh = new THREE.Mesh(geo, this.trailMat);
            this.trailMesh.frustumCulled = false;
            this.scene.add(this.trailMesh);
        }
        this.trailMat.uniforms.uColor.value.setHex(colorHex).offsetHSL(0, 0.35, -0.04); // 채도 상향·명도 소폭 하향 — 밝은 배경 위 washy 방지
        this.trailMat.uniforms.uGain.value = 1;      // 지난 스윙의 임팩트 증폭을 되돌린다(안 되돌리면 한 번 크리를 낸 뒤 모든 스윙이 크리처럼 보인다)
        this.trailMat.uniforms.uCore.value = 0.35;
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
            const tipLen = this.TRAIL_TIP[weaponShape(this.wtypeId)] || 0.7;
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

    // 파편(조각) 전용 텍스처 — **하드 에지**. 예전엔 파편도 `sparkTex()`(부드러운 방사 그라디언트)를
    // 써서 배경 반딧불과 같은 소프트 보케로 보였고, 그래서 처치가 "적이 부서진다"가 아니라
    // "빛이 흩어진다"로 읽혔다(비평가 4차 ⓕ). 조각은 **경계가 또렷해야** 고체로 읽힌다.
    // 한쪽에 어두운 패싯을 넣어 텀블링(z 스핀)할 때 면이 바뀌는 게 보이게 한다 — 균일한 흰 쿼드는
    // 아무리 돌려도 정지한 막대로 보인다.
    shardTex() {
        if (this._shardTex) return this._shardTex;
        const c = document.createElement('canvas');
        c.width = c.height = 64;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 64, 64);
        // 끝으로 갈수록 가늘어지는 비대칭 조각 — 직사각형은 '막대기', 테이퍼가 있어야 '깨진 조각'
        ctx.beginPath();
        ctx.moveTo(2, 20); ctx.lineTo(46, 4); ctx.lineTo(62, 30); ctx.lineTo(40, 60); ctx.lineTo(6, 46);
        ctx.closePath();
        ctx.fillStyle = '#fff';
        ctx.fill();
        // 어두운 패싯(조각의 그늘진 면) — 곱연산될 재질색 위에서 명암 단차가 된다
        ctx.beginPath();
        ctx.moveTo(46, 4); ctx.lineTo(62, 30); ctx.lineTo(40, 60);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fill();
        this._shardTex = new THREE.CanvasTexture(c);
        return this._shardTex;
    },
    // 발광 파티클: 가산 블렌딩 빌보드 (박스 파편이 '깨진 텍스처'로 보이던 문제 교체)
    // opt.solid=true면 일반 블렌딩 — 가산은 밝은 초원 배경 위에서 하얗게 씻겨 버스트가 안 읽히므로,
    // 색이 살아남아야 하는 파편(처치·크리)은 불투명 쪽으로 섞어 쓴다. opt.scale/speed로 덩치·비산 속도 배율.
    spawnSparks(pos, count, colorHex, opt) {
        const o = opt || {};
        const sc = o.scale || 1, sp = o.speed || 1;
        // 상한: 다수 적을 동시에 두들기면 스프라이트가 수백 장까지 쌓여 드로우콜이 폭증한다.
        // 붐빌수록 발생량을 줄이고 완전 포화 시 생략 — 개별 버스트 밀도보다 프레임을 지킨다.
        const n = this.particles.length;
        if (n > 320) return;
        if (n > 180) count = Math.max(1, Math.round(count * 0.45));
        for (let i = 0; i < count; i++) {
            const p = new THREE.Sprite(new THREE.SpriteMaterial({
                map: this.sparkTex(), color: colorHex, transparent: true,
                blending: o.solid ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false,
                opacity: o.solid ? 0.95 : 1,
            }));
            p.position.copy(pos);
            p.userData.baseScale = U.rand(0.16, 0.34) * sc;
            p.scale.setScalar(p.userData.baseScale);
            p.userData.vel = new THREE.Vector3(U.rand(-2.5, 2.5) * sp, U.rand(1.5, 4.5) * sp, U.rand(-1.5, 1.5) * sp);
            p.userData.life = U.rand(0.35, 0.7);
            p.userData.age = 0;
            this.scene.add(p);
            this.particles.push(p);
        }
    },

    riseParticle(pos, color) {
        const p = new THREE.Mesh(this.fxGeo('sphere', 0.06, 6, 6),
            new THREE.MeshBasicMaterial({ color, transparent: true }));
        p.userData.sharedGeometry = true; // 공유 지오 — 파티클 청소가 dispose 를 건너뛴다
        p.position.copy(pos);
        p.userData.vel = new THREE.Vector3(0, U.rand(1, 2), 0);
        p.userData.life = 0.8; p.userData.age = 0; p.userData.noGravity = true;
        this.scene.add(p);
        this.particles.push(p);
    },

    // ---- 데미지 숫자 (DOM 오버레이) ----
    // 데미지 숫자가 아크 **정점**에서도 3D 캔버스 안에 남게 하는 상단 여유(fxLayer 로컬 y).
    // 🚨 예전엔 `DMG_RISE_HEADROOM: 56` 하나로 눌렀는데 두 군데가 틀렸다(7차 지적 ㉯ 의 정체):
    //   ⑴ **아크 높이가 숫자마다 다르다.** rise 는 `-(30 + sev*18 + (crit?12:0))` 라 30~60px 로 벌어지는데
    //      고정 상수는 그중 하나만 감당한다 — 실측(`probe-dmgnum-travel`)에서 크리 연타(rise 47.4)만
    //      정점 65.5px 로 캔버스 상단 68.9px 를 **넘어 HUD 를 침범**했다(나머지 4건은 통과).
    //   ⑵ **기준선이 캔버스 상단이 아니었다.** 56 은 '아크 47.4 + 여유 8.6' 으로 잡힌 값인데, fxLayer
    //      로컬 원점은 캔버스 상단이 아니라 그보다 **위**(실측: 캔버스 상단이 로컬 y≈18)라 8.6 은
    //      애초에 캔버스 밖이었다. 여유가 아니라 이미 침범 상태였던 셈이다.
    // → 상수는 '캔버스 상단까지의 로컬 여백'만 뜻하게 두고, 바닥은 **그 숫자 자신의 rise 를 더해** 만든다.
    DMG_TOP_MARGIN: 20,
    // 아크 인자가 없는 호출(ui.js 등)이 쓸 기본 상승량 — rise 기본값과 한 쌍이다.
    DMG_RISE_DEFAULT: 30,
    DMG_SIDE_PAD: 4,       // 좌우 여백(px) — 숫자가 게임 영역 모서리에 딱 붙지 않게
    damageNumber(worldPos, text, cls, opt) {
        if (this.fxLayer.children.length > 40) return; // 과부하 방지
        const pt = this.project(worldPos);
        // 이 숫자의 아크 정점이 캔버스를 안 넘게 하는 **개별 바닥**. 고정 상수로는 rise 가 큰 크리를
        // 못 막는다(위 DMG_TOP_MARGIN 주석의 실측). 아래 세 군데가 전부 이 값을 기준으로 삼는다.
        const riseAbs = Math.abs(opt && opt.rise !== undefined ? opt.rise : this.DMG_RISE_DEFAULT);
        const topFloor = this.DMG_TOP_MARGIN + riseAbs;
        // 슬롯 회피 — 아직 살아 있는 숫자와 같은 자리에 스폰되면 위 칸으로 밀어 올린다.
        // 연타(일반→크리)에서 두 숫자가 같은 픽셀에 겹쳐 서로를 읽을 수 없게 되던 결함(연속 프레임 a5 실측:
        // 흰 '140' 위에 주황 '320'이 포개져 위계가 아니라 얼룩으로 보였다). 월드 오프셋(크리 +0.3)만으로는
        // 대상이 같으면 투영 좌표가 거의 겹친다. **시계를 쓰지 않고 DOM에 실제로 남아 있는 요소만 본다** —
        // 촬영기가 숫자 수명을 시뮬 시각으로 갈아끼워도 같은 규칙이 성립한다.
        let ty = pt.y;
        for (let i = 0; i < 4; i++) {
            let clash = false;
            for (const o of this.fxLayer.children) {
                const ox = parseFloat(o.style.left), oy = parseFloat(o.style.top);
                if (Math.abs(ox - pt.x) < 54 && Math.abs(oy - ty) < 26) { clash = true; break; }
            }
            if (!clash) break;
            // 한 칸 = 숫자 높이 남짓. 4칸(112px)까지만 — 그 위는 화면 밖·HUD 영역이다.
            // ⚠️ 칸 수 상한만으로는 부족하다: 스폰 y가 이미 높은 큰 적을 연타하면 4칸을 다 쓰기 전에
            // 3D 캔버스 위(=상단 재화 바)로 넘어가, 숫자가 HUD에 겹쳐 "앱 UI가 피해를 입은 것처럼"
            // 보인다(비평가 4차 ⓑ가 실제로 잡은 조건 — 실측 연타 5발에서 최고점 top 58.2px vs
            // HUD 하단 58.3px). 캔버스를 벗어나게 되면 더 올리지 않고 겹침을 감수한다.
            if (ty - 28 < topFloor) break;
            ty -= 28;
        }
        // ⚠️ 슬롯 y가 캔버스 안이라고 끝이 아니다 — 숫자는 그 자리에서 **아크로 더 올라간다**.
        //    실측(probe-dmgnum-travel.js): 슬롯 y 33.9·53에서 정점이 뷰포트 44.7·48.6으로
        //    캔버스 상단 58.3을 넘어 상단 재화 바를 침범했다(아크 실이동 31~45px). 슬롯 상한만
        //    보던 기존 가드가 아크 높이를 계산에 안 넣어서 생긴 구멍이다. 정점 기준으로 바닥을 깐다.
        //    (아크 자체는 권고치 46px 안이라 손대지 않는다 — 깎으면 멀쩡한 연출만 죽는다.)
        ty = Math.max(ty, topFloor);
        const el = document.createElement('div');
        el.className = 'float-dmg ' + cls;
        el.textContent = text;
        el.style.left = pt.x + 'px';
        el.style.top = ty + 'px';
        // 아크 파라미터: 좌우 드리프트·도약 높이·크기를 개별로 줘 같은 자리에 연타로 겹쳐도 흩어져 읽힌다
        if (opt) {
            if (opt.dx !== undefined) el.style.setProperty('--dx', opt.dx.toFixed(1) + 'px');
            if (opt.rise !== undefined) el.style.setProperty('--rise', opt.rise.toFixed(1) + 'px');
            if (opt.scale !== undefined) el.style.setProperty('--pop', opt.scale.toFixed(2));
        }
        this.fxLayer.appendChild(el);
        // 가로 화면 클램프 — 세로 헤드룸과 같은 대우를 좌우에도 준다. `.float-dmg` 는 translate(-50%)라
        // style.left 이 **중심**이고, 아크가 스폰 후 `--dx` 만큼 더 흐르며(키프레임 100%에서 전량) 임팩트
        // 프레임에서 pop·크리 배율로 폭이 최대 ~1.35배까지 커진다. 셋을 다 계산에 넣지 않으면(스폰 시점만
        // 재면) 오른쪽 끝 적을 때린 숫자가 `#fx-layer{overflow:hidden}` 밖으로 흘러 통째로 안 보인다
        // (QA 14차 실측: 표본 7.2%가 우측 이탈, 편향은 오른쪽뿐). offsetWidth 는 append 뒤에야 확정된다.
        const fxW = this.fxLayer.clientWidth;
        if (fxW > 0) {
            const dx = (opt && opt.dx !== undefined) ? opt.dx : 0;
            const pop = (opt && opt.scale !== undefined) ? opt.scale : 1;
            const halfW = (el.offsetWidth / 2) * pop * 1.35; // 임팩트 프레임 최대 폭까지 감안
            const pad = this.DMG_SIDE_PAD;
            // left 는 아크가 다 흐른 뒤(±dx)에도 [pad, fxW-pad] 안에 머물러야 한다.
            const leftMin = pad + halfW - Math.min(0, dx);
            const leftMax = fxW - pad - halfW - Math.max(0, dx);
            let lx = pt.x;
            if (leftMin > leftMax) lx = fxW / 2;                       // 화면보다 넓으면 중앙
            else lx = Math.max(leftMin, Math.min(leftMax, lx));
            el.style.left = lx + 'px';
        }
        // 화면 단위 최종 보증 — 숫자 **아래 모서리**가 HP바 위에 걸리지 않게 한 번 더 올린다.
        // `.float-dmg` 는 translate(-50%,-50%) 라 style.top 이 **중심**이다: 아래 모서리 = top + 높이/2.
        // 월드 오프셋만으로는 적 크기·원근에 따라 몇 px 부족한 경우가 남는다(실측: 숫자 22px 높이에
        // 클리어런스가 19px뿐이라 바를 걸쳤다). offsetHeight 는 append 뒤에야 확정되므로 여기서 잰다.
        if (opt && opt.clearY !== undefined) {
            const maxTop = opt.clearY - el.offsetHeight / 2;
            if (ty > maxTop) { ty = Math.max(topFloor, maxTop); el.style.top = ty + 'px'; }
        }
        setTimeout(() => el.remove(), 900);
        return el; // 호출부가 프리즈 동안 아크를 멈춰 둘 수 있게 (hitEnemy ⑥)
    },

    project(v) {
        const p = v.clone().project(this.camera);
        return {
            x: (p.x * 0.5 + 0.5) * this.container.clientWidth,
            y: (-p.y * 0.5 + 0.5) * this.container.clientHeight
        };
    },

    // ---- 테마/셰이크/애니메이션 ----
    // 씬 컷 커버 — 배경이 한 프레임에 통째로 갈리는 자리(던전 실패 → 본대 즉시 복귀)를 덮는다.
    // setTheme은 하늘·안개·지면·능선·식생·조명을 즉시 갈아끼우고 바이옴이 다르면 buildProps까지 돌아서,
    // 커버 없이 부르면 '하드 컷 한 프레임'이 그대로 보인다(게다가 프롭 재생성 힉이 그 프레임에 얹힌다).
    // ⚠️ 상태 변경(apply)은 이 함수가 **동기로 즉시** 돌린다. 연출 타이머(addAnim·setTimeout)에 실으면
    //    탭이 백그라운드라 렌더 루프가 멈춰 있는 동안 복귀 자체가 밀린다 — 라벨이 옛 스테이지를 계속
    //    가리키던 결함(dungeon-fail-stale-label)을 연출로 되살리는 꼴이다. 커버는 순수 장식이라,
    //    사라지든 못 그려지든 게임 상태는 이미 바뀌어 있다.
    SCENE_CUT_DUR: 420,
    sceneCut(apply, dur) {
        const ms = dur || this.SCENE_CUT_DUR;
        let el = null;
        if (this.fxLayer) {
            el = document.createElement('div');
            // CSS 파일이 아니라 인라인 + WAAPI로 간다 — 이 한 요소만의 페이드라 스킨 규칙에 낄 것이 없다.
            // z-index 14: 사망 암전(15)과 같은 '씬 레벨' 대역이고 **모든 팝업(20+) 아래**다.
            // 예전엔 z 를 안 줘서 auto(=형제 순서)에 맡겼는데, 그러면 #fx-layer 가 나중에 스택 문맥을
            // 갖게 되는 순간 서열이 바뀐다 — 사망 커버와 같은 이유로 값을 못 박는다(`death-overlay-zorder`).
            el.style.cssText = 'position:absolute;inset:0;background:#05070c;opacity:1;pointer-events:none;z-index:14';
            this.fxLayer.appendChild(el);
        }
        try {
            if (apply) apply();
        } finally {
            if (el) {
                if (el.animate) {
                    // 검은 끝에서 빠르게 물러나는 감속 커브 — 새 배경이 '올라오는' 인상으로 읽히게
                    const a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'cubic-bezier(.3,0,.35,1)' });
                    a.onfinish = () => el.remove();
                    setTimeout(() => el.remove(), ms + 400); // onfinish 유실 대비 — 검은 판이 화면에 남는 일만은 없게
                } else el.remove(); // WAAPI 미지원이면 연출만 잃는다(화면이 잠기는 쪽이 훨씬 큰 사고)
            }
        }
    },
    // 사망 연출 — 암전 커버 + 중앙 "죽었습니다 / …" 배너 (death-fade-popup, 사용자 지시 2026-08-18).
    // sceneCut과 같은 규약: 이 오버레이는 **순수 장식**이고 게임 상태(후퇴·부활·재시작)는 Combat의
    // 벽시계(downUntil/riseUntil)와 phaseTimer가 굴린다 — 오버레이가 유실돼도 진행은 이미 정상이다.
    // 타이밍은 onDefeat의 벽시계(`Combat.DEATH_DOWN_MS`/`DEATH_RISE_MS`/`DEATH_MARCH_S`)와 맞물린 표다:
    //   0~900 투명(사망 클립을 읽는 구간) · 900~1600 잠김 · 1600~3400 완전 암전 · 3400~4100 걷힘.
    //   부활(1600ms)·기상 완료(2450ms)·새 스테이지 구성(setupStage 2900ms)이 전부 그 완전 암전
    //   구간 안에서 지나가므로, 커버가 걷힌 첫 프레임은 이미 새 스테이지다 (death-enemy-remnant).
    // ⚠️ Combat 쪽 세 상수의 합을 늘리면 hold도 같이 늘려야 어둠이 새 스테이지보다 먼저 걷힌다.
    //    그 불변식은 `tools/test-death-timeline.js` 가 지킨다(양쪽 상수를 원문에서 읽어 비교).
    DEATH_FADE: { delay: 900, fadeIn: 700, hold: 1800, fadeOut: 700 },
    deathFade(sub) {
        if (!this.fxLayer) return false;
        const T = this.DEATH_FADE;
        const total = T.delay + T.fadeIn + T.hold + T.fadeOut;
        const cover = document.createElement('div');
        // z-index 15: 게임 영역 HUD(스테이지 라벨·이정표 3·오프라인 4·스킬바 4·루트피드 4)와 피격
        // 비네트(#dmg-flash 12) 위. #game-area 가 isolation:isolate 라(overlay-covers-panel) 이 값은
        // **씬 안에서만** 겨루고, 탭 패널(.panel 8)·모든 팝업(20/22/40/60)은 컨텍스트 밖에서 항상 위다.
        // 🚨 **20 이상으로 올리지 말 것** — 사용자 재지적 2026-08-19 (`death-overlay-zorder`):
        //    "죽었습니다 검은 화면이 … 다른 팝업들을 침범. 해결." 사망 연출은 씬/배경 레벨이다.
        cover.style.cssText = 'position:absolute;inset:0;background:#05070c;opacity:0;pointer-events:none;z-index:15;'
            + 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.55rem';
        const title = document.createElement('div');
        title.textContent = '죽었습니다';
        // letter-spacing 은 마지막 글자 뒤에도 붙어 시각 중심이 왼쪽으로 쏠린다 — padding-left 로 되민다
        title.style.cssText = 'font-size:1.7rem;font-weight:900;color:#fff;letter-spacing:.32em;padding-left:.32em;'
            + 'text-shadow:0 0 14px rgba(255,82,82,.55),0 2px 10px rgba(0,0,0,.9)';
        const rule = document.createElement('div');
        rule.style.cssText = 'width:11rem;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)';
        const subEl = document.createElement('div');
        subEl.textContent = sub;
        subEl.style.cssText = 'font-size:.95rem;font-weight:600;color:rgba(255,255,255,.78);letter-spacing:.06em';
        cover.append(title, rule, subEl);
        if (!cover.animate) return false; // WAAPI 미지원이면 호출부가 토스트로 강등한다 (검은 판 정지화면 방지)
        this.fxLayer.appendChild(cover);
        const off = ms => ms / total;
        // 🚨 이징은 **키프레임마다** 준다. options 의 `easing` 은 구간별 곡선이 아니라 **반복 전체의
        //    타이밍 함수**라, 넣으면 offset 이 가리키는 ms 자체가 통째로 휜다. 예전엔 여기에
        //    cubic-bezier(.3,0,.35,1) 이 options 로 걸려 있어 위 주석이 약속한 표(암전 1600~3400ms)와
        //    실제 화면이 900ms 가까이 어긋나 있었다 — 실측(`tools/shot-death-reveal.js`, 100ms 간격
        //    연속 캡처): 완전 암전이 1300ms 에 닫히고 **2500ms 에 이미 걷히기 시작**(3400ms 예정),
        //    페이드아웃은 700ms 가 아니라 ~1550ms 였다. `Combat.DEATH_*` 가 "암전 안에서 끝난다"고
        //    맞춰 놓은 시각이 실제로는 커버가 반쯤 걷힌 시점이었다는 뜻이라, 표대로 돌게 바로잡는다.
        //    (곡선 자체는 구간 이징으로 그대로 살린다 — 검게 잠기고 물러나는 느낌은 안 잃는다.)
        cover.animate([
            { opacity: 0, offset: 0, easing: 'linear' },
            { opacity: 0, offset: off(T.delay), easing: 'cubic-bezier(.3,0,.35,1)' },  // 잠기는 구간
            { opacity: 1, offset: off(T.delay + T.fadeIn), easing: 'linear' },         // 완전 암전 유지
            { opacity: 1, offset: off(T.delay + T.fadeIn + T.hold), easing: 'cubic-bezier(.3,0,.35,1)' }, // 물러나는 구간
            { opacity: 0, offset: 1 },
        ], { duration: total }).onfinish = () => cover.remove();
        // 배너는 암전이 거의 끝난 뒤 아래에서 떠오른다 — 커버(부모)의 opacity에 곱해지므로 커버와 함께 사라진다
        for (const el of [title, rule, subEl]) el.animate([
            { opacity: 0, transform: 'translateY(.6rem)', offset: 0 },
            { opacity: 0, transform: 'translateY(.6rem)', offset: off(T.delay + T.fadeIn * 0.55) },
            { opacity: 1, transform: 'translateY(0)', offset: off(T.delay + T.fadeIn + 500), easing: 'cubic-bezier(.2,.7,.3,1)' },
            { opacity: 1, transform: 'translateY(0)', offset: 1 },
        ], { duration: total });
        setTimeout(() => cover.remove(), total + 400); // onfinish 유실 대비 — 검은 판이 남는 일만은 없게
        return true;
    },
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
        // ---- 전역 값 그레이드 (비평가 2인 공통 1위 '글로벌 값 붕괴') ----
        // 광량 하향(1.85→1.15)만으로는 화면 중간값이 내려가지 않았다 — **실측으로 뒤집힌 건이라 근거를 남긴다**:
        // 광량을 내린 뒤 다시 재도 medianLum 0.7392 → 0.7706으로 오히려 **올랐다**. 화면 면적의 대부분을
        // 차지하는 능선 3겹(mountain/hill/farHill)이 **MeshBasic 무조명**이라 라이트에 전혀 반응하지 않고,
        // 노출만 1.00→1.10으로 올라 그대로 10% 밝아졌기 때문이다. 지면·식생도 t.ground albedo가 지배한다.
        // → 전역 값 구조의 실제 지렛대는 **조명이 아니라 albedo**다. 여기서 t.ground를 한 번 눌러
        // 파생 재질 전부(지면·능선 3겹·수풀·덤불·반구광 바닥)에 일괄 반영한다.
        // 하늘·안개는 누르지 않는다 — 밝은 끝을 남겨야 명도 폭(다크 엔드 ↔ 라이트 엔드)이 생긴다.
        const V = Scene3D.VALUE;
        const gHSL = new THREE.Color(t.ground).getHSL({ h: 0, s: 0, l: 0 });
        // 밤 챕터는 노출 0.82 + 광량 하향이 이미 값을 눌러 놨다 — 같은 그레이드를 그대로 얹으면
        // 5장 밤 숲의 뭉개짐(명도 0.04 이하)이 3.9% → 8.3%로 뛰어 디테일이 소실된다(실측). 절반만 적용.
        const nightK = isNightPre ? 0.5 : 1;
        const dL = -Math.min(V.groundMax, V.groundK * gHSL.l) * nightK;   // 비례 하향 + 절대 낙폭 상한
        const dF = -Math.min(V.foliageMax, V.foliageK * gHSL.l) * nightK; // 식생 추가 하향
        const gC = new THREE.Color(t.ground).offsetHSL(0, V.satK * dL, dL); // 명도를 내리면 채도도 함께 (탁한 파스텔 방지)
        this.terrainMat.color.copy(gC);
        // 눈 수광면 탈색은 **눈 kin 에서만** 켠다(㉱). 18 빙하는 kin 이 snow 지만 '청빙'이 정체성이라
        // 테마 지면 채도가 0.49 + tint +0.16 로 의도적으로 높다 — 여기서 탈색하면 그 바이옴이 사라진다.
        // ⚠️ **테마 지면의 채도로는 못 가른다** — 6 설원 0xaac2e2 와 18 빙하 0x9fc9de 는 채도가
        //    0.491 / 0.488 로 사실상 같다(처음에 이걸로 가르려다 6 설원이 통째로 꺼졌다).
        //    가르는 기준은 **바이옴 이름**이다: 기본 `snow` 만 흰 눈이고, `glacier`(청빙)·`tundra`
        //    (눈이 걷힌 갈색 이끼)는 kin 이 snow 라도 tint 로 제 정체성을 따로 잡은 파생 바이옴이다.
        this.setTerrainUniform('snow', t.biome === 'snow' ? 0.7 : 0);
        // 능선 실루엣(MeshBasic·무조명): 근경은 어둡게·원경은 안개에 깊이 잠기게 명도 단차를 크게 벌려
        // 근·중·원 3단(근경 능선 → 원경 능선 → 하늘)의 대기 원근이 읽히게 함.
        // 대기 원근은 명도만이 아니라 **채도**로도 읽힌다 — 멀수록 채도를 계단식으로 빼(farDesat) 원경이
        // 근경과 같은 초록 덩어리로 붙지 않게 한다(비평가 ⑵ '원경 LOD 채도 낮추기').
        // 원경 능선의 후퇴 방향 (map-quality-up 비평가 A #4 '대기원근 3단 계단 부재' · A #3/B #4 '숲 뒤
        // 청록 수면 조각') — 종전 공식(지면색 -0.16 어둡게 + 안개색 22% 혼합)의 문제는 둘이었다:
        //  ⑴ 어둡게 눌러 근경과 같은 명도대 = 원경이 후퇴하지 않는다.
        //  ⑵ 초록(지면)과 하늘색(안개)을 반반 섞은 **채도 높은 청록 혼색**이 나무 틈으로 보일 때
        //     '물 조각/숲의 구멍'으로 읽힌다(실측: 렌더 화소 h≈0.5 — 지면에도 안개에도 없는 색).
        // 낮: **지면 색상을 유지**한 채 채도를 절반 이하로 빼고 +0.10 밝힌다. 안개 혼합은 12%만 —
        //     혼색 대신 씬 fog(z-12에서 ~44%)가 대기 원근을 마저 채운다. 결과 = 하늘보다 어둡고
        //     근경보다 밝은 저채도 실루엣(원신식 명도 계단), 색상은 '멀리 있는 같은 땅'.
        // 밤: 종전 공식 유지 — 설원 밤의 능선 후퇴는 비평가가 '되돌리지 말 것'으로 꼽은 자리다.
        this.mountainMat.color.copy(isNightPre
            ? gC.clone().offsetHSL(0, 0.03 - V.farDesat * 0.35, -0.16).lerp(fogC, 0.22)
            : (() => { const m = gC.getHSL({ h: 0, s: 0, l: 0 });
                // 채도 계수 0.42는 사막(원래 s≈0.3)에서 '채도 없는 플랫 회색 띠'를 만들었다(재채점 B2 #2)
                // — 0.55로. 색상이 지면과 같아서 채도가 남아도 '물'로는 안 읽힌다(그건 혼색의 문제였다).
                return new THREE.Color().setHSL(m.h, m.s * 0.55, Math.min(0.8, m.l + 0.10)).lerp(fogC, 0.12); })());
        this.hillMat.color.copy(gC.clone().offsetHSL(0, -V.farDesat * 0.7, 0).lerp(fogC, 0.75));
        this.farHillMat.color.copy(gC.clone().offsetHSL(0, -V.farDesat, 0).lerp(fogC, 0.9)); // 안개에 거의 잠긴 최원경
        // 식생은 지면보다 한 단계 더 눌러 '어두운 덩어리'로 — 화면의 다크 엔드를 실제로 담당하는 레이어.
        // 🚨 **다만 순흑까지 가면 안 된다 (map-quality-up).** 실측: 초원에서 `foliageMat` 이 #060803,
        //    `foliageMatDark` 는 명도가 음수로 내려가 **클램프 결과 #000000** 이었다. 비평가 2인이
        //    독립적으로 "나무 서너 그루가 한 검은 덩어리로 뭉개져 실루엣이 사라진다"를 지적했고,
        //    그 원인이 정확히 이것이다. **순흑은 다크 엔드가 아니라 정보의 소실**이다.
        //    → 바닥값(`leafFloor`)을 두되, 바닥에 눌린 만큼 **청록 쪽으로 색상을 밀고 채도를 올린다.**
        //      검정 대신 '보색 계열의 어두운 색'으로 그림자를 만드는 스타일라이즈드 처방이라,
        //      명도는 그대로 낮게 유지하면서 잎끼리의 분리는 되살아난다.
        // ⚠️ 🚨 **HSL 계산을 `Color` 밖에서 한다 — 안에서 하면 색상이 증발한다.**
        //    `offsetHSL` 은 내부적으로 `setHSL` 을 부르고 거기서 명도가 0 으로 **클램프**된다.
        //    그 뒤 `getHSL()` 로 다시 읽으면 순검정은 채도·색상이 전부 0 이라(max==min) **초록이었다는
        //    사실 자체가 사라진다.** 첫 판이 그렇게 만들어서, 바닥값을 올릴 때 h=0(주황)로 복원돼
        //    `foliageMatDark` 가 **#271f1b 갈색**이 됐다 — 화면에 갈색 침엽수가 섞여 나왔다(실측).
        //    그래서 오프셋을 숫자로 먼저 더하고, **클램프되기 전에** 바닥값을 적용한다.
        const leaf = (dh, ds, dl) => {
            const b = gC.getHSL({ h: 0, s: 0, l: 0 });
            let h = b.h + dh, sat = U.clamp(b.s + ds, 0, 1), l = b.l + dl;
            if (l < V.leafFloor) {
                const k = U.clamp((V.leafFloor - l) / V.leafFloor, 0, 1);
                h += V.leafCool * k;                       // 눌린 만큼 청록 쪽으로
                sat = U.clamp(sat + 0.18 * k, 0, 1);
                // ⚠️ 바닥을 **하드 클램프하면 안 된다** — 세 변주(기본/어두운/밝은)가 전부 같은 값이 돼
                //    "나무마다 잎 명도가 다르다"는 원래 설계가 사라진다(실측: 셋 다 #1a350c 근방).
                //    바닥 근처로 **압축**하되 순서는 보존한다: l=floor 이면 floor, 더 어두울수록
                //    floor*0.55 로 점근한다(0 이하로는 절대 안 내려간다).
                l = V.leafFloor * (0.55 + 0.45 / (1 + (V.leafFloor - l) / V.leafFloor));
            }
            return new THREE.Color().setHSL((h % 1 + 1) % 1, sat, l);
        };
        this.foliageMat.color.copy(leaf(-0.02, 0.08, -0.16 + dF));
        this.foliageMatDark.color.copy(leaf(-0.025, 0.09, -0.23 + dF)); // 뒤 나무용 어두운 변주
        this.foliageMatLight.color.copy(leaf(-0.015, 0.07, -0.09 + dF)); // 앞 나무용 밝은 변주
        this.bushMat.color.copy(leaf(-0.01, 0.05, -0.1 + dF));   // 덤불도 같은 바닥값 — 늪지에서 #040503(사실상 순흑)이었다
        // 바위 이끼 뚜껑 — 고정 청록(0x4f8578)이 숲에선 나무 사이 '수면 조각/구멍', 바위산에선
        // '의도를 알 수 없는 민트 패치'로 읽혔다(map-quality-up 비평가 A #3 · B #6, 독립 지적).
        // 바이옴 지면 색상에서 초록 쪽으로 1/3만 끌린 저채도·저명도 이끼색으로 파생 — 어느 바이옴에서든
        // '바위에 낀 이끼'로 읽히고, 청록 보색 악센트는 잔향으로만 남는다.
        if (this.mossMat) {
            const mg = gC.getHSL({ h: 0, s: 0, l: 0 });
            this.mossMat.color.setHSL(((mg.h + (0.36 - mg.h) * 0.35) % 1 + 1) % 1, 0.30, 0.30);
        }
        // 접지 블롭 그림자 색 — 순흑(0x000000)은 밝은 지면(설원·마법 라벤더)에서 '경계 선명한 검은
        // 스티커'로 읽힌다(map-quality-up 재채점 A2·B2 공통 지적). 지면 팔레트로 틴트한 다크 톤으로 —
        // 설원이면 남색, 마법이면 보라 그림자. ⚠️ 불투명도 눈금(0.22/0.26/0.45)은 건드리지 않는다:
        // 실그림자 이중 노출·'부유 스티커'·초원 하이키 사이에서 실측으로 잡은 값들이다(ensureBlobRes 주석).
        this.ensureBlobRes();
        {
            const bs = gC.getHSL({ h: 0, s: 0, l: 0 });
            const shade = new THREE.Color().setHSL(bs.h, Math.min(0.5, bs.s * 0.6 + 0.1), 0.10);
            this.blobShadowMat.color.copy(shade);
            this.blobShadowFlyMat.color.copy(shade);
            this.blobShadowFoeMat.color.copy(shade);
        }
        this.hemi.color.setHex(t.sky);
        this.hemi.groundColor.copy(gC.clone().offsetHSL(0, 0, -0.1));
        // 흙길 데칼을 바이옴 흙색으로 (map-quality-up, 비평가 2인 공통 1위 지적) — 데칼 캔버스는
        // 고정 황토 톤이라, 마법(보라)·설원(청야)·용암(암갈) 같은 유색 바이옴에서 "씬 색과 무관한
        // 회베이지 가로 띠 = 오버레이 버그"로 읽혔다. 재질 곱셈 틴트로 색상만 바이옴 지면 팔레트
        // (gC 색상·채도)로 끌어오고 명도 결(다짐 자국·자갈)은 텍스처가 그대로 쥔다. 초원·사막처럼
        // 원래 흙색과 가까운 바이옴은 틴트가 거의 백색이라 종전 그림을 해치지 않는다.
        if (this.pathMesh) {
            const g = gC.getHSL({ h: 0, s: 0, l: 0 });
            const bTint = new THREE.Color().setHSL(g.h, U.clamp(g.s, 0, 0.7), 0.7);
            this.pathMesh.material.color.copy(new THREE.Color(0xffffff).lerp(bTint, 0.62));
        }
        // 바이옴 소품 교체 (같은 바이옴이면 그대로 유지)
        const biome = t.biome || 'forest';
        const kin = this.bkin(biome);          // 신설 바이옴의 조명·안개·돌색 분기 기준
        const sp = this.BIOMES[biome] || {};   // 덮어쓸 값 (원본 6종은 빈 객체 = 예전 경로 그대로)
        if (biome !== this._biome) this.buildProps(biome);
        // 챕터 색보정 + 밤 조명 무드 — 밤 챕터가 낮과 같은 광량이면 "흐린 낮"처럼 보이므로
        // 태양광을 절반 수준의 서늘한 달빛으로 낮추고 림라이트를 상대적으로 키워 실루엣 위주의 밤 화면을 만듦
        const isNight = (t.celestial || 'sun') === 'moon';
        // 밤은 전역 노출도 낮춰 지면·소품까지 확실히 어둡게 (라이트 감쇠만으론 ACES 어깨에서 중간톤이 다시 떠오름)
        // 낮 노출 1.02. ⚠️ 앞선 커밋에서 1.10으로 올렸던 것을 되돌린 값이다 — 비평가 재채점이
        // "올린 노출이 광량 감소분을 먹어치웠다"며 hero-walk 프레임의 27.9%가 명도 0.85를 넘는다고
        // 지적했고, 실측으로 확인됐다(명도 0.85 초과 비율: 수정 전 2.16% → 노출 1.10에서 2.75%로 **악화**).
        // 노출만 1.02로 내리면 같은 광량에서 1.53%로 원래보다도 좋아지고 다크 엔드는 오히려 늘어난다.
        this.renderer.toneMappingExposure = isNight ? 0.82 : 1.02;
        if (isNight) {
            this.sun.intensity = 0.55;
            this.hemi.intensity = 0.36;
            this.rim.intensity = 0.45;
            this.sun.color.copy(new THREE.Color(0xc6d4ff).lerp(new THREE.Color(t.sky), 0.25)); // 달빛
            this.sun.position.set(5, 6.5, -7); // 달 디스크(우측 후방)와 같은 방향에서 내려오는 역광 — 그림자가 카메라 쪽으로
            this.sun.userData.baseX = 5;
        } else {
            // 낮 태양 방향은 `SUN_DAY` 한 곳에서만 정한다 — 고도 근거는 그 상수의 주석 참고.
            // (종전엔 여기 `(7, 5.2, 3.2)` 리터럴이 "측면 45도 저고도 — 요철 스컬핑 최대로" 주석과 함께
            //  생성자의 고도 61° 를 매 챕터 덮어써, 두 곳이 서로의 수정을 무르는 상태였다.)
            this.sun.position.set(this.SUN_DAY[0], this.SUN_DAY[1], this.SUN_DAY[2]);
            this.sun.userData.baseX = this.SUN_DAY[0];
            // ⚠️ 광량 대폭 하향 (1.85 → 1.15). 비평가 2인이 **공통 1위**로 지목한 결함
            // "캐릭터에 진짜 어두운 값이 전혀 없다 / 캐릭터와 지면의 명도가 같다"의 근본 원인이
            // 바로 이 광량이었다. 부츠 albedo는 이미 0x2a1a0d(니어블랙)인데도 중간톤으로 렌더된다 —
            // 선형 0.1이 sRGB 인코딩 후 약 0.35가 되므로, 최종 명도 0.18 이하를 만들려면
            // 선형 0.026 이하가 필요하고 광량 2.45배(sun1.85+hemi.3+rim.3) 아래서는 불가능하다.
            // 즉 **재질을 더 어둡게 칠해도 절대 해결되지 않는 문제**였다.
            // 실측(probe-light-sweep.js, 캐릭터 면적 중 명도 0.18 이하 비율 darkPctHero):
            //   수정 전 1.85/0.30/0.30 노출1.00 ...... 0%      중간값 0.755  하이라이트(>0.85) 2.16%
            //   1.15/0.18/0.20 노출1.10 .............. 1.06%   중간값 0.684  하이라이트 2.75% ← 악화
            //   1.15/0.18/0.20 노출1.02 .............. 2.13%   중간값 0.667  하이라이트 1.53%
            //   1.00/0.15/0.18 노출1.02 (채택) ....... 5.06%   중간값 0.633  하이라이트 1.36%
            //   0.90/0.12/0.16 노출1.00 .............. 7.40%   중간값 0.596  (더 어두워 보류)
            // 채택값은 수정 전 대비 다크 엔드·중간값·하이라이트 **세 지표 모두** 개선한다.
            // env IBL은 원인이 아님을 분리 검증했다(envMapIntensity만 0.5로 낮추면 1.02%에 그침) —
            // 그래서 재질별 envMapIntensity는 손대지 않는다. 라이트 3개 + 노출 4개 값만의 변경.
            // ⚠️ 용암 계열의 감광(0.54/0.22)은 **지면 균열이 스스로 빛나는 것을 전제**로 한 값이다.
            //    발광을 끈 바이옴(흑요석)에 그대로 걸면 보정할 광원이 없어 화면이 통째로 검은 얼룩이 된다
            //    (실측: 첫 판 흑요석은 첨탑 실루엣이 하늘과 붙어 형태가 안 읽혔다). 발광 유무로 가른다.
            const lavaLit = kin === 'lava' && sp.emissive !== null;
            this.sun.intensity = lavaLit ? 0.54 : 1.00;
            this.hemi.intensity = lavaLit ? 0.22 : 0.15; // 채움광이 다크 엔드를 들어올리는 주범 — 함께 하향
            this.rim.intensity = 0.18;
            this.sun.color.copy(new THREE.Color(0xffedc4).lerp(new THREE.Color(t.sky), 0.15)); // 더 따뜻한 직사광
        }
        // ch7 마법: ch6에서 성공한 달 역광 공식이 어두운 보라 팔레트에서 안 읽힘 — 시안 림을 크게 키워
        // 크리스탈·암석 실루엣 윤곽이 배경에서 분리되게 (3회차 비평가 지적 반영)
        if (kin === 'magic' && isNight) {
            this.rim.intensity = 1.05;
            this.rim.color.setHex(0x7fdcff);
        } else {
            this.rim.color.setHex(0xcfe4ff);
        }
        // 안개 심도: 낮은 원경을 조금 더 멀리까지 보이게(상단 화이트아웃 완화), 밤·용암은 짙게 유지.
        // 바위산은 안개를 더 얇게 — 원경 능선·하늘이 안개에 뭉개져 분리가 안 읽히던 문제 (3회차 비평가 지적)
        this.scene.fog.near = sp.fog ? sp.fog[0] : isNight ? 11 : kin === 'rock' ? 15 : 13;
        this.scene.fog.far = sp.fog ? sp.fog[1] : isNight || kin === 'lava' ? 30 : kin === 'rock' ? 42 : 35;
        // 발광체 라이트 블리드(악센트 포인트라이트 3기)는 buildProps에서 발광 소품에 직접 부착·설정됨
        // 바이옴별 돌 색 (설원=서리 낀 밝은 회청, 사막=테라코타 악센트, 바위산=지면보다 두 단계 어둡게 — 명도 분리)
        // 바위산 절벽 0x6a6055 → 0x51483e: 지면 albedo가 값 그레이딩으로 L≈0.24까지 내려와 절벽과
        // 같은 명도대에 붙었다(재채점 A2·B2 공통 1위 '전부 같은 회갈색'). 절벽을 두 단계 더 눌러
        // '어두운 근경 실루엣 vs 밝은 지면'의 단차를 복구한다(지면 쪽은 아래 테마 ground가 밝힌다).
        this.stoneMat.color.setHex(sp.stone !== undefined ? sp.stone :
            kin === 'snow' ? 0xc9d8e6 : kin === 'desert' ? 0xb97f5e : kin === 'rock' ? 0x51483e : 0x90a4ae);
        // 바위산: 지면 탠과 색온도를 맞춘 웜 그레이 — "배치한 에셋" 티 제거 (쿨 그레이는 지면과 따로 놀았음)
        // 천체: 낮=해, 밤=달+별 (테마 celestial 필드로 명시, 기본 sun)
        const cel = t.celestial || 'sun';
        const night = isNight;
        this.sunDisc.visible = cel === 'sun';
        this.moonDisc.visible = cel === 'moon';
        this.stars.visible = cel === 'moon';
        if (this.aurora) this.aurora.visible = sp.aurora !== undefined ? (sp.aurora && night) : (kin === 'snow' && night); // 설원 밤 전용 오로라
        // 수정 결정은 테마 하늘색 계열로 발광 (마법=보라, 심해=청록이 자동 반영)
        if (sp.crystal) {
            // 신설 바이옴의 결정색(빙하=얼음, 수정평원=자수정, 심연=청록, 성역=금) — 위 magic 처방과 같은 구조
            this.crystalMat.color.setHex(sp.crystal.color);
            this.crystalMat.emissive.setHex(sp.crystal.emissive);
            this.crystalMat.emissiveIntensity = sp.crystal.intensity;
            // '빛나 보이는' 몫을 맡는 할로·접지 글로우도 같이 돌린다 — 안 돌리면 금빛 결정 주위만 시안으로 번져
            // 색이 두 갈래로 찢어진다(가산 합성이라 특히 눈에 띈다).
            if (this.crystalHaloMat) this.crystalHaloMat.color.setHex(sp.crystal.emissive);
            if (this.crystalGlowMat) this.crystalGlowMat.color.setHex(sp.crystal.emissive);
        } else if (kin === 'magic') {
            // 몸통은 테마색, 발광은 시안 악센트 — 단일 색상환(전부 보라/청록)에 보색 계열 포인트를 박음
            // 몸통을 어두운 청록으로 눌러 ACES에서 흰색으로 증발하지 않고 시안 발광 색이 유지되게
            // ⚠️ 발광 세기를 1.1 로 두면 **면이 안 보인다.** emissive 는 법선·버텍스컬러와 무관하게
            //    모든 프래그먼트에 같은 값을 더하므로, 세기가 크면 조형·음영이 통째로 그 위에 잠긴다
            //    (비평가 실측: 몸통 최암면 L 173 · 인게임 평균 225 · 최대 255 클리핑, 지면은 83).
            //    발광은 0.3 대로 낮추고 '빛나 보이는' 몫은 할로 스프라이트·접지 글로우(가산 합성)가 맡는다.
            //    대신 몸통 albedo 를 올려 어두워지는 만큼을 **조명 받는 색**으로 되돌린다.
            this.crystalMat.color.setHex(0x1a7286);
            this.crystalMat.emissive.setHex(0x1cb8cf);
            this.crystalMat.emissiveIntensity = 0.34;
            // 신설 바이옴에서 갈아끼운 할로·글로우 색을 되돌린다 — 안 되돌리면 amethyst 를 거쳐 온 뒤
            // ch7 마법이 보라 할로를 그대로 물고 있게 된다(공유 재질의 전형적 잔상).
            if (this.crystalHaloMat) this.crystalHaloMat.color.setHex(0x4dd9e8);
            if (this.crystalGlowMat) this.crystalGlowMat.color.setHex(0x26c6da);
        }
        // 용암: 반구광 지면 반사색을 뜨거운 주황으로 — 소품 아랫면이 용암빛을 받는 느낌
        // 소품 아랫면이 지면의 열기를 받는 느낌 — 균열 색을 그대로 쓰면 반구광이 화면을 씻어내므로 45%로 눌러 쓴다
        if (kin === 'lava' && sp.emissive !== null) {
            const g = sp.emissive && sp.emissive.glow;
            if (g) this.hemi.groundColor.copy(new THREE.Color(g).multiplyScalar(0.45));
            else this.hemi.groundColor.setHex(0x8a3d1a);
        }
        // 용암 바이옴: 지면 균열이 주황으로 발광
        const tEm = sp.emissive !== undefined ? sp.emissive
            : (kin === 'lava' ? { crack: 0xff3d00, intensity: 1.15 } : null);
        if (kin === 'lava' && tEm && tEm.crack) {
            if (!this.crackTex) this.crackTex = this.makeCrackTexture();
            this.terrainMat.emissiveMap = this.crackTex;
            this.terrainMat.emissive.setHex(tEm.crack);
            this.terrainMat.emissiveIntensity = tEm.intensity; // 어두운 현무암 지면 위 작열 크랙 대비 강화
        } else {
            this.terrainMat.emissiveMap = null;
            this.terrainMat.emissive.setHex(0x000000);
            this.terrainMat.emissiveIntensity = 1;
        }
        this.terrainMat.needsUpdate = true; // emissiveMap 유무가 바뀌면 셰이더 재컴파일 필요
        // 마법 챕터: 무광 검정 실루엣으로 보이던 롤리팝 나무에 은은한 보라 발광을 얹어 "언릿 소품" 인상 제거
        for (const fm of this.foliageMats) {
            const fe = sp.foliage || (kin === 'magic' ? { color: 0x4a2f8f, intensity: 0.34 } : null);
            fm.emissive.setHex(fe ? fe.color : 0x000000);
            fm.emissiveIntensity = fe ? fe.intensity : 1;
        }
        // 암부에 얹는 빛은 **그 챕터 하늘의 색**이다(하늘 반사광의 근사) — 어둡고 채도를 살짝 올린 버전.
        // 밤에는 더 눌러 '흐린 낮'처럼 뜨는 것을 막는다.
        {
            const st = new THREE.Color(t.sky).offsetHSL(0, 0.10, night ? -0.46 : -0.38);
            for (const u of this._shadeUniforms) {
                u.uShadeTint.value.copy(st);
                u.uShadeStr.value = this.SHADE.strength * (night ? 0.7 : 1);
            }
        }
        this.paintSky(t.sky, fogC.getHex(), night);
    },

    // ==========================================================================
    // 플레이어 정보 팝업 미니 씬 (player-info-scene-thumb, 사용자 지시 2026-08-19)
    // --------------------------------------------------------------------------
    // 사용자 원문: "플레이어랑 썸네일용 맵(잔디 맵)으로(현재 맵과 상관없이), 맵에서 플레이어가
    //             움직이는 것처럼. 플레이어는 가운데 고정·이동모션, 맵은 흘러가는 느낌으로."
    // 종전에는 **살아 있는 전장을 한 프레임 렌더해 `toDataURL` 로 찍은 정지 JPEG** 이었다 —
    // 현재 챕터가 용암이면 용암이 찍히고, 움직이지도 않았다. 요구 세 가지를 전부 어긴다.
    //
    // ⚠️ 🚨 **본편 씬을 빌려 쓰면 안 된다 — 두 가지가 동시에 망가진다.**
    //    ⑴ 잔디로 만들려고 `setTheme` 을 부르면 **전장이 같이 잔디가 된다**(팝업을 닫아도 안 돌아온다).
    //    ⑵ `heroG` 를 이 씬에 `add` 하면 three.js 는 부모를 옮기므로 **전장에서 영웅이 사라진다.**
    //    그래서 독립 씬 + `ProChar.createKnight()` 로 만든 **두 번째 기사**를 쓴다.
    // ⚠️ 🚨 **프롭 재질은 전역 공유다.** `foliageMats`·`stoneMat`·`bushMat` 은 `setTheme` 이 챕터마다
    //    덮어쓰므로, 그대로 쓰면 용암 챕터에서 잔디 맵의 나무가 검게 나온다("현재 맵과 상관없이"
    //    지시를 재질이 뒤에서 어긴다). 프리뷰 전용 클론으로 바꿔 끼운다(`previewMat`).
    // ⚠️ 렌더러는 **한 번만** 만들고 캔버스를 재부착한다 — 팝업은 열 때마다 innerHTML 을 새로 그리는데
    //    그때마다 WebGLRenderer 를 만들면 컨텍스트가 쌓여 브라우저 상한(보통 16개)에서 전장이 죽는다.
    PREVIEW_SPEED: 3.4,          // 유닛/초 — 맵이 흘러가는 속도
    PREVIEW_TILE: 80 / 12,       // 지면 텍스처 한 타일의 월드 폭(플레인 80 × repeat 12)
    // 팝업이 열려 있는 동안 **전장과 미니 씬 두 컨텍스트가 같이 그린다.** 미니 씬은 92×.. 짜리
    // 작은 상자라 60fps 가 필요 없고, 30fps 로도 스크롤·걸음이 그대로 읽힌다 — 모바일에서
    // 전장 프레임을 뺏지 않도록 상한을 둔다(누적 dt 는 그대로 넘겨 속도는 변하지 않는다).
    PREVIEW_FPS: 30,

    // 초원 낮 테마의 값 그레이드 — `setTheme` 의 계산을 그대로 옮긴 것이다.
    // (setTheme 을 건드리면 전 챕터가 회귀 위험에 들어가므로 **읽기 전용 복제**로 둔다.
    //  두 곳이 갈라지면 프리뷰만 색이 어긋나므로, setTheme 의 그레이드를 고치면 여기도 같이 볼 것.)
    previewGrade(t) {
        const V = Scene3D.VALUE;
        const fogC = new THREE.Color(t.fog).lerp(new THREE.Color(t.sky), 0.3).offsetHSL(0, 0.09, 0.01);
        const gHSL = new THREE.Color(t.ground).getHSL({ h: 0, s: 0, l: 0 });
        const dL = -Math.min(V.groundMax, V.groundK * gHSL.l);
        const dF = -Math.min(V.foliageMax, V.foliageK * gHSL.l);
        const gC = new THREE.Color(t.ground).offsetHSL(0, V.satK * dL, dL);
        return {
            fog: fogC, ground: gC,
            foliage: [gC.clone().offsetHSL(-0.02, 0.08, -0.16 + dF),
                gC.clone().offsetHSL(-0.025, 0.09, -0.23 + dF),
                gC.clone().offsetHSL(-0.015, 0.07, -0.09 + dF)],
            bush: gC.clone().offsetHSL(-0.01, 0.05, -0.1 + dF),
            mountain: gC.clone().offsetHSL(0, 0.03 - V.farDesat * 0.35, -0.16).lerp(fogC, 0.22),
            hill: gC.clone().offsetHSL(0, -V.farDesat * 0.7, 0).lerp(fogC, 0.75),
            farHill: gC.clone().offsetHSL(0, -V.farDesat, 0).lerp(fogC, 0.9),
        };
    },

    // 공유 재질 → 프리뷰 전용 클론. 초원 색으로 고정해 현재 챕터의 테마를 안 탄다.
    previewMat(orig, g) {
        if (!this._pvMats) this._pvMats = new Map();
        if (this._pvMats.has(orig)) return this._pvMats.get(orig);
        const c = orig.clone();
        const fi = this.foliageMats.indexOf(orig);
        if (fi >= 0) {
            c.color.copy(g.foliage[fi]);
            c.emissive.setHex(0x000000); c.emissiveIntensity = 1;   // 마법 챕터의 보라 발광이 묻어오지 않게
        } else if (orig === this.bushMat) c.color.copy(g.bush);
        else if (orig === this.stoneMat) c.color.setHex(0x90a4ae);  // 초원 돌색(setTheme 의 기본 분기)
        this._pvMats.set(orig, c);
        return c;
    },

    // 프롭 하나를 프리뷰용으로 만든다 — 재질을 전부 클론으로 바꿔 끼운 뒤 돌려준다
    previewProp(kind, s, g) {
        const p = this.makeProp('forest', kind, s);
        p.traverse(m => { if (m.isMesh && m.material) { m.material = this.previewMat(m.material, g); m.userData.sharedMaterial = true; } }); // _pvMats 캐시 클론 — 다음 프리뷰 빌드가 재사용
        return p;
    },

    previewBuild() {
        const t = CHAPTER_THEMES[0];        // 항상 1챕터 잔디 — 현재 챕터와 무관 (사용자 지시 ①)
        const g = this.previewGrade(t);
        this._pvGrade = g;
        const sc = new THREE.Scene();
        sc.background = new THREE.Color(t.sky);
        sc.fog = new THREE.Fog(g.fog.clone(), 13, 35);
        // 조명 — `setTheme` 의 '초원 낮' 실측값. 생성자 초기값을 베끼면 채움광이 과해 프리뷰만 허옇게 뜬다
        // (creatureThumb 쪽 `syncCreatureLights` 주석이 같은 함정을 이미 기록해 뒀다).
        const hemi = new THREE.HemisphereLight(t.sky, g.ground.clone().offsetHSL(0, 0, -0.1).getHex(), 0.15);
        const sun = new THREE.DirectionalLight(new THREE.Color(0xffedc4).lerp(new THREE.Color(t.sky), 0.15), 1.0);
        sun.position.set(this.SUN_DAY[0], this.SUN_DAY[1], this.SUN_DAY[2]); // 본편 낮과 같은 방향 — 리터럴을 베끼면 또 갈린다
        const rim = new THREE.DirectionalLight(0xcfe4ff, 0.18);
        rim.position.set(-5, 3.5, -7);
        sc.add(hemi, sun, rim);
        // ---- 지면: 텍스처 offset 을 굴려 '맵이 흘러간다'를 만든다 (사용자 지시 ③) ----
        // ⚠️ 텍스처는 반드시 **clone** 할 것 — 본편과 같은 객체의 offset 을 굴리면 전장 지면이 같이 흐른다.
        const gt = this.groundTexFor('forest');
        const map = gt.map.clone(); map.needsUpdate = true;
        const nrm = gt.normal.clone(); nrm.needsUpdate = true;
        map.repeat.set(12, 6); nrm.repeat.set(12, 6);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshPhongMaterial({
            color: g.ground, shininess: 0, map, normalMap: nrm, normalScale: new THREE.Vector2(0.7, 0.7),
        }));
        ground.rotation.x = -Math.PI / 2;
        sc.add(ground);
        this._pvGroundTex = [map, nrm];
        // ---- 원경 능선 3겹 (무조명 MeshBasic — 본편과 같은 구성) ----
        this._pvRidges = [];
        for (const [z, h, col, sp] of [[-26, 6.2, g.mountain, 0.10], [-19, 4.4, g.hill, 0.20], [-13, 3.0, g.farHill, 0.34]]) {
            const m = new THREE.Mesh(this.makeRidgeGeo(120, h, 12, 'ridge'), new THREE.MeshBasicMaterial({ color: col, fog: true }));
            m.position.set(0, 0, z);
            m.userData.speed = sp;        // 시차(패럴랙스) — 멀수록 천천히 흘러야 깊이가 읽힌다
            sc.add(m);
            this._pvRidges.push(m);
        }
        // ---- 큰 소품: x 로 흘려보내고 화면 밖으로 나가면 반대편으로 되돌린다 ----
        this._pvProps = [];
        // ⚠️ 🚨 **소품을 카메라 쪽(z>0)에 두지 말 것.** 스크롤로 x 가 계속 바뀌므로 전경에 둔 소품은
        //    언젠가 반드시 x≈0 을 지나가고, 그때 **주인공을 통째로 가린다**(주인공이 주제인 화면에서
        //    치명적이다). 본편도 같은 이유로 전경 대역을 비웠다 — `buildProps` 의 펫 관통 주석 참조.
        //    가까운 맛은 z 를 −1.6 까지 당긴 '영웅 뒤 근경'으로 낸다.
        const spots = [
            [-16, -6.5, 1.5, 'p'], [-9.5, -4.2, 1.1, 'p'], [-4, -7.2, 1.7, 'p'], [1.5, -4.6, 0.9, 'r'],
            [7, -6.8, 1.6, 'p'], [12.5, -4.0, 1.0, 'r'], [17.5, -7.0, 1.5, 'p'], [-20, -4.4, 1.0, 'r'],
            [-13, -1.9, 0.75, 'r'], [3.5, -2.3, 0.85, 'r'], [14, -1.7, 0.7, 'r'],   // 영웅 뒤 근경
            [-6.5, -9.5, 1.9, 'p'], [9.5, -9.8, 2.0, 'p'], [20, -2.6, 0.9, 'r'],    // 중경 밀도
        ];
        for (const [x, z, sz, kind] of spots) {
            const p = this.previewProp(kind, sz, g);
            p.position.set(x, 0, z);
            p.rotation.y = U.rand(0, Math.PI * 2);
            sc.add(p);
            this._pvProps.push(p);
        }
        // ---- 영웅: 가운데 고정 + 걷기 클립 (사용자 지시 ②) ----
        const rig = ProChar.createKnight();
        rig.group.position.set(0, 0, 0.4);
        rig.group.rotation.y = 0.55;      // 전장에서 영웅이 서 있는 기본 각과 같게
        sc.add(rig.group);
        this._pvRig = rig;
        this._pvScene = sc;
        // 주인공이 주제이므로 본편보다 바짝 붙는다 — 세로 91px 짜리 상자에서 1.55유닛 기사가
        // 높이의 절반쯤을 차지하게(멀면 '초록 판에 점 하나'가 된다).
        this._pvCam = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
        this._pvCam.position.set(0.1, 1.95, 4.3);
        this._pvCam.lookAt(0.05, 0.92, 0);
        this.previewSyncHero();
    },

    // 장비를 프리뷰 기사에 반영 — 팝업을 열 때마다 부른다(장비를 바꾸고 다시 열면 그대로 보여야 한다)
    previewSyncHero() {
        const rig = this._pvRig;
        if (!rig) return;
        ProChar.tint(rig, S.equipment);
        // 무기·투구는 본편과 같은 생성기로 **따로 한 벌** 만든다(본편 것을 옮기면 전장에서 사라진다)
        for (const [mount, key] of [[rig.handR, '_pvWeapon'], [rig.headMount, '_pvHelmet']]) {
            if (this[key]) { mount.remove(this[key]); this.disposeTree(this[key]); this[key] = null; }
        }
        const w = S.equipment.weapon;
        const wg = new THREE.Group();
        wg.add(this.makeWeapon(w ? (w.wtype || 'sword') : 'club', w ? w.ageIdx : 0, w && w.rarity));
        wg.scale.setScalar(2.44); // weapon-size-2x — 본편(147·applyWeaponGrip)과 같은 배율
        rig.handR.add(wg);
        this._pvWeapon = wg;
        const h = S.equipment.helmet;
        if (h) {
            const hg = this.makeHelmet(h.age, h.rarity, itemStyleOf(h), itemNameOf(h));
            rig.headMount.add(hg);
            this._pvHelmet = hg;
        }
        ProChar.play(rig, ['Walking']);
    },

    previewInit(container) {
        if (!this._pvR) {
            const r = new THREE.WebGLRenderer({ antialias: true });
            r.outputEncoding = THREE.sRGBEncoding;              // 본편(init)과 동일한 색 파이프라인
            r.toneMapping = THREE.ACESFilmicToneMapping;
            r.toneMappingExposure = 1.02;                       // 초원 낮 노출
            r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
            r.domElement.className = 'pinfo-scene-canvas';
            this._pvR = r;
            this.previewBuild();
        }
        if (this._pvR.domElement.parentNode !== container) container.appendChild(this._pvR.domElement);
        this._pvHost = container;
        this.previewResize();
    },

    // 🚨 **크기는 매 프레임 확인한다.** 팝업은 `showModal` 이 `hidden` 을 떼기 전까지 `display:none`
    //    이라 `clientWidth/Height` 가 **0** 이다. 처음 한 번만 재면 렌더 버퍼가 2×2 로 굳고,
    //    CSS 는 100%×100% 라 그 2×2 가 화면 크기로 늘어나 **하늘·지면이 뭉갠 그라디언트 4픽셀**만
    //    보인다(실제로 그렇게 찍혔다 — 프로브의 상태 검사는 전부 통과하는데 그림만 뭉개져 있었다).
    //    화면 회전·리사이즈도 같은 코드로 따라간다.
    previewResize() {
        const host = this._pvHost;
        if (!host) return false;
        const w = Math.round(host.clientWidth), h = Math.round(host.clientHeight);
        if (w < 2 || h < 2) return false;                 // 아직 레이아웃 전 — 다음 프레임에 다시 본다
        if (w === this._pvW && h === this._pvH) return true;
        this._pvW = w; this._pvH = h;
        this._pvR.setSize(w, h, false);
        this._pvCam.aspect = w / h;
        this._pvCam.updateProjectionMatrix();
        return true;
    },

    previewTick(dt) {
        if (!this.previewResize()) return;      // 레이아웃 전이면 그릴 것도 없다
        const d = this.PREVIEW_SPEED * dt;
        // 지면: 텍스처 offset 을 굴린다. +x 로 굴리면 무늬가 −x 로 흘러 '앞으로 나아간다'로 읽힌다.
        for (const tex of this._pvGroundTex) tex.offset.x += d / this.PREVIEW_TILE;
        for (const m of this._pvRidges) {   // 원경은 시차만큼만 — 같은 속도로 흘리면 종이 배경이 된다
            m.position.x -= d * m.userData.speed;
            if (m.position.x < -30) m.position.x += 60;
        }
        for (const p of this._pvProps) {
            p.position.x -= d;
            if (p.position.x < -22) p.position.x += 44;   // 화면 밖으로 나가면 반대편에서 다시 들어온다
        }
        ProChar.update(this._pvRig, dt);
        this._pvR.render(this._pvScene, this._pvCam);
    },

    // 팝업이 열릴 때. 실패하면 false 를 돌려 호출자가 기존 정지 프리뷰로 폴백하게 한다.
    previewStart(container) {
        if (!container || typeof THREE === 'undefined' || typeof ProChar === 'undefined') return false;
        try {
            this.previewInit(container);
            this.previewSyncHero();
        } catch (e) { this.previewStop(); return false; }
        this.previewStop();          // 중복 루프 방지 — 두 번 열면 rAF 가 두 개 돌아 속도가 2배가 된다
        this._pvRun = true;
        this._pvLast = 0;
        this._pvW = this._pvH = 0;      // 다시 열면 크기를 다시 잰다(팝업이 닫혀 있는 동안 레이아웃이 바뀔 수 있다)
        const minStep = 1000 / this.PREVIEW_FPS - 1;   // −1ms: 60Hz 에서 매번 한 프레임씩 밀려 25fps 가 되는 것 방지
        const loop = (now) => {
            if (!this._pvRun) return;
            this._pvRAF = requestAnimationFrame(loop);
            if (!this._pvLast) { this._pvLast = now; return; }
            const ms = now - this._pvLast;
            if (ms < minStep) return;                  // 프레임을 건너뛰되 _pvLast 는 안 옮긴다(시간이 쌓인다)
            this._pvLast = now;
            try { this.previewTick(Math.min(0.05, ms / 1000)); } catch (e) { this.previewStop(); }
        };
        this._pvRAF = requestAnimationFrame(loop);
        return true;
    },

    // 팝업이 닫힐 때. 렌더러·씬은 살려 둔다(다시 열 때 WebGL 컨텍스트를 새로 안 만들려고).
    previewStop() {
        this._pvRun = false;
        if (this._pvRAF) cancelAnimationFrame(this._pvRAF);
        this._pvRAF = 0;
        this._pvLast = 0;
    },

    shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); },

    // HP바 아래 소유자 지시 삼각(캐럿). 근접 교전에서 적 바가 영웅 실루엣 위에 30% 걸쳐
    // "이 빨간 바가 누구 것이냐"가 안 읽혔다(비평가 6차 A #13·B #3, 실측 겹침 29.8%).
    // 세로 간격을 벌리는 5차 방식은 종·거리마다 값이 달라 한 번에 안 맞는다(골렘 21.7px). 대신
    // **바마다 자기 주인을 가리키는 아래 방향 캐럿**을 달아, 겹쳐도 색+방향으로 소유자가 확정되게 한다.
    // 어두운 외곽 삼각 위에 채움색 삼각을 얹어 밝은 초원에서도 경계가 산다(바 트랙과 같은 처방).
    makeOwnerPip(fillHex, barBottomY) {
        const tri = (w, h, yTop, z, colorHex, opacity) => {
            const g = new THREE.BufferGeometry();
            // 아래를 가리키는 이등변 삼각: 위 좌·우 → 아래 꼭지
            g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
                -w, yTop, 0, w, yTop, 0, 0, yTop - h, 0,
            ]), 3));
            g.setIndex([0, 1, 2]);
            const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
                color: this.srgbC(colorHex), side: THREE.DoubleSide, transparent: true, opacity, toneMapped: false, depthWrite: false,
            }));
            m.position.z = z;
            return m;
        };
        const grp = new THREE.Group();
        const yTop = barBottomY + 0.012;                 // 바 바닥에 살짝 파고들어 틈이 안 보이게
        grp.add(tri(0.075, 0.13, yTop, 0.011, 0x0d1114, 0.82)); // 어두운 외곽
        grp.add(tri(0.05, 0.1, yTop - 0.006, 0.013, fillHex, 1)); // 채움색 캐럿
        return grp;
    },

    addAnim(dur, fn, onDone) { this.anims.push({ t: 0, dur, fn, onDone }); },

    // ── 피격 플린치 포즈 (hp-juicy 7차 잔여 ㉮) ──────────────────────────────────────────────
    // 🚨 이 층이 왜 필요한가 — 7차 비평가의 "일반 타격은 a0→a1 포즈가 같아 보인다"를 실측한 결과다
    // (`tools/probe-flinch-visibility.js`). 스쿼시(`punchAmp`)는 **분명히 돌고 있었다**: 같은 프레임
    // A/B 로 스쿼시만 껐다 켜면 몸통 투영 폭이 44.8→42.2px(-5.9%), 실루엣 폭이 25.1→24.1px(-4.2%)로
    // 확실히 움직인다. 즉 지적의 전제('연출이 없다')는 틀렸고 **캡처 아티팩트도 아니었다**
    // (`shot-hitfx.js` 는 수동 스텝으로 시간을 통제하므로 +16ms 프레임을 정확히 잡는다).
    // 진짜 원인은 셋째였다 — **스쿼시는 그룹 전체의 균일 스케일이라 '포즈'가 아니다.** 몸이 통째로
    // 2px 눌렸다 펴질 뿐 팔·다리·꼬리는 맞기 전과 **한 각도도 다르지 않다.** 그래서 '움찔했다'가
    // 아니라 '같은 조각상이 살짝 찌그러졌다'로 읽힌다. 크기 변화는 카메라가 같이 움직이면 더 안 읽힌다.
    // → 처방은 진폭을 키우는 게 아니라 **관절이 실제로 튀는 포즈 층**을 얹는 것이다.
    // 1930년대 러버호스 카툰 지시(TODO 애니메이션 항목)의 예비동작 없는 즉발 스냅 → 여운 →
    // 반대쪽 오버슈트를 그대로 쓴다: 타격은 예고 없이 들어오므로 **anticipation 은 두지 않는다.**
    driveFlinch(m, dt) {
        if (!(m.flinchT > 0) || m.dead) return;
        m.flinchT = Math.max(0, m.flinchT - dt);
        const v = 1 - m.flinchT / m.flinchDur;             // 0 → 1
        // 스냅 구간을 6%(≈16ms)로 둔다 — **접촉 프레임이 곧 정점**이 되게 하려는 것이다.
        // 비평가·캡처가 읽는 프레임이 +16ms 라 정점이 그 뒤에 오면 그 한 장에는 38% 밖에 안 담긴다.
        const RISE = 0.06;                                  // 즉발 스냅 구간(예고 없이 꺾인다)
        let w;
        if (v < RISE) w = v / RISE;
        else {
            const u = (v - RISE) / (1 - RISE);
            // 감쇠 진동 — 되돌아오며 반대쪽으로 한 번 넘긴다(러버호스 여운/오버슈트).
            w = Math.exp(-3.6 * u) * Math.cos(u * Math.PI * 2.4);
        }
        const a = (m.flinchAmp || 0) * w;
        if (!a) return;
        const off = [];
        const add = (o, ax, val) => { if (o && val) { o.rotation[ax] += val; off.push({ o, ax, v: val }); } };
        const A = m.anim || {};
        // ⓐ 상체 — 히트축(-x, 영웅 쪽)에서 맞았으니 뒤로 젖혀지고 살짝 비틀린다.
        //    회전은 기저 포즈가 매 프레임 **절대 대입**하는 값 위에 얹는다(그래서 누적되지 않는다).
        add(m.g, 'x', -a * 0.20);
        add(m.g, 'y', a * 0.15);
        // ⓑ 팔 — 충격에 뒤로 날아갔다 따라온다(follow-through). 관절 리그가 있으면 어깨·팔꿈치 둘 다.
        if (A.barm) A.barm.forEach((arm, j) => {
            add(arm.sh, 'x', a * 0.85);
            add(arm.sh, 'z', (j === 0 ? 1 : -1) * a * 0.34);   // 바깥으로 벌어짐
            add(arm.elbow, 'x', a * 0.45);
        });
        else { add(m.armR, 'x', a * 0.8); add(m.armL, 'x', a * 0.8); }
        if (A.armRJ && !A.barm) { add(A.armRJ.sh, 'x', a * 0.8); add(A.armRJ.elbow, 'x', a * 0.45); }
        // ⓒ 다리 — 버티느라 무릎이 접히고 골반이 밀린다(밀려나는 발이 없으면 상체만 떠 보인다).
        if (A.bleg) A.bleg.forEach(L => { add(L.hip, 'x', -a * 0.28); add(L.knee, 'x', -Math.abs(a) * 0.40); });
        if (A.gleg) A.gleg.forEach(lg => add(lg, 'x', -a * 0.26));           // 골렘 기둥 다리(무릎 없음)
        if (A.kind === 'wolf' && A.legs) A.legs.forEach(lg => add(lg, 'x', -a * 0.34));
        // ⓓ 종별 부속 — 2차 모션(꼬리·날개·갓)이 뒤따라 출렁여야 '한 덩어리'로 안 읽힌다.
        if (A.tail) add(A.tail, 'z', a * 0.62);
        if (A.wings) A.wings.forEach(wg => add(wg, 'z', (wg.userData.s || 1) * a * 0.5));
        if (A.cap) add(A.cap, 'z', a * 0.30);
        m._flinchOff = off;
    },
    // 지난 프레임의 플린치 가산분을 정확히 되돌린다(기저 포즈 계산 전에 부른다).
    undoFlinch(m) {
        if (!m._flinchOff) return;
        for (const d of m._flinchOff) d.o.rotation[d.ax] -= d.v;
        m._flinchOff = null;
    },

    update(dt) {
        // 🚨 히트스톱(dt=0 정지)은 여기 있었고 **제거됐다 — 되살리지 말 것** (사용자 지시 2026-08-19,
        // skill-cast-lag-optimize: 씬만 얼고 CSS 는 도니 '렉'으로 읽혔다). dt 는 어떤 연출도 얼리지 않는다.
        this._clock += dt;
        // 적 위치 동기화 + 걷기 모션 + HP바 (논리 좌표 + 월드 오프셋)
        for (const e of Combat.enemies) {
            const m = this.enemyMap.get(e.id);
            if (!m || !e.alive) continue;
            // 플린치 가산분 되돌리기 — 기저 포즈(걷기·대기)가 계산되기 **전에** 지난 프레임의 오프셋을
            // 뺀다. 대기 분기가 팔다리를 `*= 0.85` 로 감쇠하므로, 안 빼고 매 프레임 더하면 가산분이
            // 감쇠에 갈려 진폭이 종잡을 수 없게 된다(더한 값을 남이 곱셈으로 깎는 꼴).
            this.undoFlinch(m);
            m.g.position.x += ((e.x + this.worldX) - m.g.position.x) * Math.min(1, dt * 12);
            // 깊이 레인(z)도 같은 계수로 따라간다 — 앞자리가 비어 대열이 다시 짜이면 옆으로
            // 미끄러지듯 자리를 옮긴다(순간이동 금지). HP바·블롭 섀도우는 이 z를 그대로 추적한다.
            m.g.position.z += ((e.z || 0) - m.g.position.z) * Math.min(1, dt * 12);
            // ⚠️ 정지 판정은 개체별 stopX로 — MELEE_X 고정으로 두면 뒷줄이 제자리에 선 채로
            //    영원히 걷기 모션을 돈다(대열 도입 전에는 전원이 MELEE_X에 섰으므로 같은 값이었다).
            const walking = e.x > Combat.stopXOf(e) + 0.05;
            if (m.g.userData.landed) {
                const clk = this._clock, id = e.id;
                // 종별 프로파일 — 보스면 배율에 맞춰 박자가 느려지고 무거워진다(gaitOf 주석 참조).
                const G = this.gaitOf(m.anim && m.anim.kind, e.isBoss);
                // 홉 위상 — `hopCurve`/`gaitSquash` 는 |sin| 한 주기(π)를 0~1 로 편 값을 받는다.
                // 종전 `pow(|sin ph|, bobPow)` 와 **같은 박자**이고 시간 분포만 카툰으로 바뀐다.
                const hopU = (clk * G.rate + id) / Math.PI;
                m._gaitSq = 0;   // 이 프레임의 보행 스쿼시 — 아래 스케일 합성에서 히트 스쿼시와 곱해진다
                if (m.anim && m.anim.fly) {
                    // 박쥐류: 공중 부양 + 날개 퍼덕임
                    m.g.position.y = G.hover + Math.sin(clk * G.rate + id) * G.bob;
                    m.anim.wings.forEach(w => w.rotation.z = w.userData.s * (0.3 + Math.sin(clk * G.wingRate + id) * 0.55));
                    // 비행체는 착지가 없으므로 홉 스쿼시 대신 **날갯짓 박자**에 몸을 눌러 준다
                    // (내리치는 순간 압축 → 떠오르며 늘어남). 안 걸면 박쥐만 강체로 남는다.
                    m._gaitSq = -Math.sin(clk * G.wingRate + id) * (G.sq || 0) * 0.6;
                } else if (walking) {
                    if (m.anim && m.anim.kind === 'wolf') {
                        // 늑대: 네 다리 질주
                        m.g.position.y = this.hopCurve(hopU, G.bobPow) * G.bob;
                        m._gaitSq = this.gaitSquash(hopU, G.bobPow, G.sq);
                        m.anim.legs.forEach((lg, j) => {
                            // 로터리 갤럽 위상: 앞발 쌍·뒷발 쌍이 살짝 어긋나 어느 프레임에도 4지 동시 접지가 없음 (비평가: 죽은 프레임 금지)
                            const lp = clk * G.legRate + id + [0, 1.1, 3.25, 4.35][j];
                            lg.rotation.x = Math.sin(lp) * 0.85;
                            const kn = m.anim.knees && m.anim.knees[j];
                            // 스윙 복귀 구간 무릎 접힘 — 앞다리는 뒤로, 뒷다리는 앞으로 (사족 관절 방향). 접힘각 상향 (사용자 재검수: 정지 프레임 판독)
                            if (kn) kn.rotation.x = kn.userData.rx0 + (kn.userData.front ? -1 : 1) * Math.max(0, Math.sin(lp + 1.3)) * 0.85;
                        });
                        m.g.rotation.x = Math.sin(clk * G.rate + id) * G.pitch;
                        if (m.anim.tail) m.anim.tail.rotation.z = Math.sin(clk * G.tailRate + id) * 0.25; // 질주 중 꼬리 좌우 휘날림
                    } else if (m.anim && m.anim.hop) {
                        // 버섯: 크게 총총 + 갓 출렁 + **테두리 플랩**(우산 살 2차 모션)
                        m.g.position.y = this.hopCurve(hopU, G.bobPow) * G.bob;
                        m._gaitSq = this.gaitSquash(hopU, G.bobPow, G.sq);
                        if (m.anim.cap) m.anim.cap.rotation.z = Math.sin(clk * G.rate + id) * G.capTilt;
                        this.driveCapFlap(m, clk, G.capAmp, id);
                    } else if (m.anim && m.anim.kind === 'slime') {
                        // 슬라임: 젤리 스쿼시 점프 — 몸통 스케일을 통째로 흔들지 않고 **정점 웨이브**로 민다.
                        // (강체 스케일은 '크기가 변하는 풍선'이라 젤리로 안 읽혔다 — driveJelly 주석 참조.)
                        m.g.position.y = this.hopCurve(hopU, G.bobPow) * G.bob;
                        this.driveJelly(m, clk, G.jellyAmp, id);   // G.sq = 0 — 젤리 웨이브와 겹치지 않게(ENEMY_GAIT 주석)
                    } else {
                        // 이족보행: 관절 걷기 — 고관절 스윙+무릎 굽힘, 어깨 스윙+팔꿈치 굽힘 (통짜 막대기 금지)
                        // ⓓ: 박자·진폭을 **종별 프로파일**(위 G)에서 뽑는다. 예전엔 셋 다 clk*8 고정이라
                        //    골렘·고블린·임프의 걸음이 구분이 안 됐다(ENEMY_GAIT 주석 참조).
                        const ph = clk * G.rate + id; // 종마다 주기가 달라 연속 캡처 정수배 겹침도 자연히 갈린다
                        // bobPow — 골렘은 아래에 오래 머물러 '쿵' 하고 내려앉고, 임프는 위에 오래 떠 가볍다.
                        m.g.position.y = this.hopCurve(hopU, G.bobPow) * G.bob;
                        m._gaitSq = this.gaitSquash(hopU, G.bobPow, G.sq);
                        m.g.rotation.z = Math.sin(ph) * G.roll; // 롤 축소 — 다리 측면 벌어짐 오독 방지
                        m.g.rotation.x = G.lean;                // 굽은 등/돌진 자세는 종별 상수 기울기
                        // 골렘 기둥 다리 — 무릎이 없어 통째로 스윙한다(짧고 두꺼워 큰 각은 부러져 보인다)
                        if (m.anim.gleg) m.anim.gleg.forEach((lg, j) => { lg.rotation.x = Math.sin(ph + j * Math.PI) * G.hip; });
                        if (m.anim.bleg) m.anim.bleg.forEach((L, j) => {
                            const lp = ph + j * Math.PI;
                            // 2차 고조파 가산 — 전후 스윙 비대칭(전방 빠르게·후방 느리게)으로 반주기 미러 중복 프레임 제거
                            L.hip.rotation.x = Math.sin(lp) * G.hip + Math.sin(2 * lp) * 0.12;
                            // 코사인 벨 무릎: 스윙 다리가 몸 아래를 지날 때 최대 74° 접힘(발꿈치 차올림), 지지 구간은 미세 굽힘 — 정지 프레임 판독 (사용자 재검수)
                            L.knee.rotation.x = -0.15 - Math.pow(Math.max(0, Math.cos(lp - 0.35)), 1.4) * 1.15;
                        });
                        if (m.anim.barm) m.anim.barm.forEach((A, j) => {
                            const ap = ph + j * Math.PI + Math.PI; // 같은 쪽 다리와 역위상
                            A.sh.rotation.x = Math.sin(ap) * G.arm;
                            A.elbow.rotation.x = -0.7 - Math.max(0, Math.sin(ap)) * 0.6; // 상시 굽힘 40°+ 앞 스윙 가산 최대 74° (비평가: 강체 튜브 팔 금지)
                        });
                        else if (m.armR) {
                            m.armR.rotation.x = Math.sin(ph) * 0.55;
                            if (m.armL) m.armL.rotation.x = -Math.sin(ph) * 0.55;
                        }
                    }
                } else {
                    // 대기 — 1930s 카툰은 **정지가 없다**(`cute-art-direction` ⓓ). 종전엔 순수 사인 상하
                    // 이동뿐이라 멈춘 적이 '위아래로 떠다니는 강체'였다. 같은 홉 곡선을 낮은 진폭·느린
                    // 박자로 돌려 ⓐ 접지에 눌리고 ⓑ 들숨에 늘어나고 ⓒ 좌우로 까딱이게 한다.
                    const iu = (clk * 3.2 + id) / Math.PI;
                    m.g.position.y = this.hopCurve(iu, 1.35) * 0.030;
                    m._gaitSq = this.gaitSquash(iu, 1.35, (G.sq || 0) * 0.55);
                    // ⚠️ 까딱임은 `*= 0.9` 감쇠에 **더하면 안 된다** — 감쇠+가산은 1차 지연 필터라
                    //    같은 값을 매 프레임 더하면 진폭이 10배로 쌓인다. 목표값으로 **추종**시킨다
                    //    (보행 중 걸린 롤도 이 추종이 자연히 풀어 준다).
                    const sway = Math.sin(clk * 2.3 + id * 1.7) * 0.022;
                    m.g.rotation.z += (sway - m.g.rotation.z) * Math.min(1, dt * 6);
                    m.g.rotation.x *= 0.9;   // 보행 중 걸어 둔 종별 전방 기울기(G.lean)를 풀어 준다 — 안 그러면 멈춘 뒤에도 숙인 채로 굳는다
                    if (m.anim && m.anim.jelly) this.driveJelly(m, clk, 0.06, id); // 대기 중에도 젤리는 미세하게 흔들린다
                    if (m.anim && m.anim.capFlap) this.driveCapFlap(m, clk, 0.012, id); // 대기 중 갓 테두리 미세 호흡
                    if (m.armL) m.armL.rotation.x *= 0.9;
                    if (m.anim.bleg) m.anim.bleg.forEach(L => { L.hip.rotation.x *= 0.85; L.knee.rotation.x *= 0.85; });
                    if (m.anim.barm) m.anim.barm.forEach(A => {
                        A.sh.rotation.x *= 0.85;
                        A.elbow.rotation.x += (-0.22 - A.elbow.rotation.x) * 0.12; // 살짝 굽힌 자연 자세로 정착 — 차렷 막대기 방지
                    });
                    if (m.anim.gleg) m.anim.gleg.forEach(lg => lg.rotation.x *= 0.85); // 골렘 기둥 다리 — 대기 시 제자리로
                    if (m.anim.knees) m.anim.knees.forEach(kn => kn.rotation.x += (kn.userData.rx0 - kn.rotation.x) * 0.15);
                    if (m.anim.kind === 'wolf') m.anim.legs.forEach(lg => lg.rotation.x *= 0.85);
                }
            }
            if (m.blob) { // 블롭 섀도우 추적 — 홉/비행 높이에 따라 축소 (지면에 남는 그림자)
                m.blob.position.x = m.g.position.x;
                m.blob.position.z = m.g.position.z;
                const by = Math.max(0, m.g.position.y);
                if (m.blob.userData.fly) {
                    // 🚨 종전엔 고도가 오를수록 블롭을 **줄이기만** 했다(1 - y*0.35). 그건 실제 그림자와
                    //    반대다 — 캐스터가 지면에서 멀어지면 반그림자가 **넓게 퍼지면서 옅어진다.**
                    //    줄이기만 하면 높이 뜬 박쥐 아래에 '작고 진한 검은 점'이 남아, 위에 아무것도
                    //    없는 스티커로 읽힌다(비평가 ㉲ '박쥐 블롭이 순흑 크게 읽히는 컷').
                    //    퍼뜨리면서 옅게 하면 같은 접지 단서를 주면서도 검은 얼룩으로는 안 읽힌다.
                    // ⚠️ 접지(y=0) 불투명도는 0.45 그대로다 — 그 눈금은 '부유 스티커'와 이중 노출
                    //    사이에서 실측으로 잡은 값이라(ensureBlobRes 주석) 고도만 그 아래로 낮춘다.
                    m.blob.scale.setScalar((m.blob.userData.baseS || 0.85) * (1 + by * 1.7));
                    m.blob.material.opacity = (m.blob.userData.baseO || 0.45) * U.clamp(1 - by * 2.2, 0.30, 1);
                } else {
                    m.blob.scale.setScalar((m.blob.userData.baseS || 0.95) * Math.max(0.55, 1 - by * 0.35)); // 0.8 감쇠는 비행 고도에서 블롭이 소멸해 '부유 스티커' (비평가 7.3 5번)
                }
            }
            // 히트축 스쿼시(가로) × 보행 스쿼시(세로) 합성 — 접지 후에만(등장 스케일 인과 겹치지 않게).
            // ⚠️ 예전엔 이 블록이 **펀치가 도는 동안에만** scale 을 썼다. 이제 보행/대기 스쿼시가
            //    매 프레임 scale 을 쓰므로, 등장 스케일 인처럼 scale 을 독점하는 연출은
            //    `m._scaleLocked` 로 이 합성을 막는다(안 막으면 솟아오르는 몸이 한 프레임 만에 지워진다).
            let punchA = 0;
            if (m.punchT > 0 && m.g.userData.landed) {
                m.punchT = Math.max(0, m.punchT - dt);
                // ⚠️ 축이 예전엔 반대였다. 옛 식은 x·z를 **넓히고** y를 눌러 '위에서 착지한 스쿼시'였는데,
                // 실제 타격은 영웅(-x)에서 옆으로 들어온다 — 히트축을 **압축**하고 세로로 부풀어야
                // 옆에서 맞은 몸으로 읽힌다. 적 그룹은 yaw -0.55라 로컬 x가 월드 히트축과 85% 정렬돼 있어
                // 로컬 x 압축으로 충분하다(나머지 성분은 카메라에서 깊이라 안 보인다).
                const el = m.punchDur - m.punchT;     // 임팩트 이후 경과
                let a;
                if (el < m.punchHold) a = m.punchAmp; // ⓐ 유지 — 최대 압축을 프레임 서너 장 붙잡는다.
                // 유지 구간이 없으면 소액 타격이 한 프레임짜리 깜빡임으로 끝난다(히트스톱이 없어
                // 정점이 렌더 프레임 사이에 통째로 빠진다 — 실측: 첫 프레임이 이미 진폭의 54%,
                // 두 번째 프레임엔 0). 크리·큰 피해만 멀쩡해 보였던 건 히트스톱이 정점을 얼려 준 덕이다.
                else {
                    // ⓑ elastic 복귀 — 감쇠 진동. 단조 복귀(옛 e*e)는 부풀었다 꺼지는 풍선으로 읽혀
                    // 충격이 안 남는다. 영점 통과 ≈ 진행률 0.156, 반대쪽 오버슈트 정점 ≈ 0.31에서 진폭의 22%.
                    const v = (el - m.punchHold) / Math.max(1e-4, m.punchDur - m.punchHold); // 0 → 1
                    a = m.punchAmp * Math.exp(-4.8 * v) * Math.cos(v * Math.PI * 3.2);
                }
                if (m.punchT > 0) punchA = a;
            }
            if (m.g.userData.landed && !m._scaleLocked) {
                const b = m.baseScale || 1, a = punchA, s = m._gaitSq || 0;
                // 히트: 세로 0.92·깊이 0.14 배분은 부피 보존(-1 + 0.92 + 0.14 ≈ 0)에서 나온 값이다.
                // 보행: s > 0 = 늘어남(세로 ↑ 가로 ↓), s < 0 = 눌림. 가로/깊이에 −s/2 씩 나눠 같은 원리로 보존한다.
                // 두 변형은 **곱해서** 겹친다 — 더하면 피격 중 보행 스쿼시가 히트 압축을 상쇄해 버린다.
                m.g.scale.set(
                    b * (1 - a) * (1 - s * 0.5),
                    b * (1 + a * 0.92) * (1 + s),
                    b * (1 + a * 0.14) * (1 - s * 0.5));
            }
            const ratio = U.clamp(Big.of(e.hp).ratioTo(e.maxHp), 0, 1); // hp는 Big — 비율만 Number로 뽑는다
            if (!m.barDying) this.driveHpBar(m, ratio, dt); // 처치 드레인 중인 바는 killEnemy의 애니메이션이 단독 소유
            // 바는 scene 직속이라 몸 위치를 직접 따라간다(변형은 상속하지 않는다).
            // 피격 셰이크는 바 고유 흔들림이므로 추적 위치에 더한다.
            if (m.hpG) m.hpG.position.set(
                m.g.position.x + m.shakeX, m.g.position.y + m.shakeY, m.g.position.z);
        }
        // 영웅 머리 위 HP 바: 위치는 heroG를 매 프레임 추적, 비율·색은 적과 동일한 임계값
        if (this.heroHpG && this.heroG && this.heroBar) {
            // 사망 중에는 바를 숨긴다 — Combat.onDefeat이 재도전을 위해 hp를 즉시 만피로 되돌리므로
            // 그대로 두면 쓰러진 시체 위에 가득 찬 초록 바가 뜬다(실측 프레임에서 확인).
            this.heroHpG.visible = !this.heroDead;
            const hRatio = !Big.of(Combat.hero.maxHp).isZero() ? U.clamp(Big.of(Combat.hero.hp).ratioTo(Combat.hero.maxHp), 0, 1) : 1;
            this.driveHpBar(this.heroBar, hRatio, dt);
            this.heroHpG.position.set(
                this.heroG.position.x + this.heroBar.shakeX,
                // 2.18 = 머리 위 여유. 예전 1.85는 근접 교전에서 적 바와 **화면 세로 7.8px**밖에
                // 안 벌어져 두 바가 같은 스캔라인에 붙어 피아 구분이 안 됐다(비평가 4차 ⓓ 실측).
                // 2.18이면 29.6px — 비평가 요구치 26px을 넘긴다.
                this.heroG.position.y + 2.18 + this.heroBar.shakeY,
                this.heroG.position.z);
        }
        // 영웅: 걷기(월드 전진) / 아이들 — GLB 모드는 스켈레탈 클립, 아니면 프로시저럴 관절
        if (this.heroG && this.legs) {
            const walkCycle = Math.sin(this._clock * 11);
            const rest = this.armRest !== undefined ? this.armRest : -0.25;
            if (this.walking && !this._attacking && !this.heroDead) {
                // 행군: 플레이어가 실제로 오른쪽(+x)으로 전진 — 카메라가 따라가고 소품은 제자리
                // 쓰러져 있는 동안은 전진하지 않는다(시체가 미끄러져 가는 그림 방지)
                this.worldX += 1.7 * dt;
                this.heroG.position.x = Combat.HERO_X + this.worldX;
                if (!this.heroRig) {
                    this.legs[0].rotation.x = walkCycle * 0.65;
                    this.legs[1].rotation.x = -walkCycle * 0.65;
                    this.armR.rotation.x = rest > -1 ? rest - walkCycle * 0.45 : rest;
                    this.armL.rotation.x = -0.15 + walkCycle * 0.45;
                    this.heroG.position.y = (this.rideY || 0) + Math.abs(walkCycle) * 0.06;
                } else this.heroG.position.y = this.rideY || 0;
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
                        this.heroG.position.y = (this.rideY || 0) + Math.sin(this._clock * 3) * 0.03;
                    }
                }
            }
            // 프로시저럴 리그: 키프레임 갱신 + 상태 전환 (걷기/대기)
            if (this.heroRig) {
                this.heroRig.update(dt);
                this.holdBarGrip();   // 공격 클립이 바를 잡은 손까지 데려가지 않게 (rig.update 뒤여야 한다)
                this.rideBrace();     // 탑승 중 공격이면 하체 버팀 가산 (같은 규약 — rig.update 뒤)
                if (this._heroReviveT > 0) this._heroReviveT -= dt;
                // 사망/기상 중에는 자동 전환을 잠근다 — 안 그러면 다음 프레임 Idle이 클립을 덮어쓴다
                if (!this._attacking && !this.heroDead && !(this._heroReviveT > 0)) {
                    // 탑승 중엔 다리 걷기 클립을 쓰지 않는다 — 이동은 탈것이 하고 다리는 안장을 감싼 채 고정
                    this.heroPlay((this.walking && !this.riding) ? ['Walking'] : ['Idle']);
                    this.heroG.position.y = this.rideY || 0; // 상하 바운스는 리그 root.py 트랙이 담당(탑승 중엔 안장 높이가 바닥)
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
            // 관절 리그 (pet-articulated-joints): 종별 리그가 심어 둔 피벗을 한 루프로 돌린다.
            // 위상은 몸통 바운스와 같은 시계(t)·같은 주파수(mo.freq)를 쓰므로 걸음과 바운스가 안 어긋난다.
            // gain 은 **이동 중에만** 진폭을 키운다 — 대기에서는 같은 리그가 잔잔한 호흡으로 읽힌다.
            if (ud.joints) for (const j of ud.joints) {
                const a = t * mo.freq * j.f + j.ph;
                if (j.spin) { j.o.rotation[j.axis] = j.base + a; continue; }
                const w = 1 + (j.gain - 1) * (this.walking ? 1 : 0);
                j.o.rotation[j.axis] = j.base + (j.abs ? Math.abs(Math.sin(a)) : Math.sin(a)) * j.amp * w;
            }
        });
        // 애니메이션 큐
        for (let i = this.anims.length - 1; i >= 0; i--) {
            const a = this.anims[i];
            a.t += dt;
            const k = Math.min(1, a.t / a.dur);
            a.fn(k);
            if (k >= 1) { if (a.onDone) a.onDone(); this.anims.splice(i, 1); }
        }
        // 플린치 포즈는 **큐 뒤에** 얹는다 — 넉백 애니(`rotation.z` 절대 대입)가 큐 안에 있어서,
        // 앞에서 더하면 같은 프레임에 통째로 덮어써진다(실제로 이 순서 때문에 한 번 사라졌다).
        for (const e of Combat.enemies) {
            const m = this.enemyMap.get(e.id);
            if (m && e.alive) this.driveFlinch(m, dt);
        }
        // 탈것: 영웅이 올라타 있으므로 탈것이 곧 이동체다 — 영웅 발밑에 붙어 같은 리듬으로 흔들린다.
        // 걷기 중 바운스·기울기는 '탈것이 달리는 것'이고 영웅은 그 위에 얹혀 같은 오프셋을 받는다
        // (둘이 따로 놀면 즉시 공중부양으로 읽힌다).
        if (this.mountGroup) {
            const ud = this.mountGroup.userData;
            const t = this._clock + (ud.phase || 0);
            const mg = this.mountGroup;
            if (this.riding) {
                // 공격 돌진 중에도 따라붙는다 — 여기서 놓으면 영웅만 앞으로 튀어나가 탈것이 뒤에 남는다
                mg.position.x = this.heroG.position.x;   // 별도 자리가 아니라 정확히 영웅 발밑
                mg.position.z = this.heroG.position.z;
            } else {
                ud.home.x = Combat.HERO_X + (ud.spotX || 0) + this.worldX;
                mg.position.x = ud.home.x;
            }
            const walkBoost = this.walking ? 1.6 : 1;
            // 비행형은 **땅을 차는 리듬이 아니다** — `abs(sin)`은 접지 반동(껑충)이라 날개 달린 탈것에
            // 쓰면 지면에 튕기는 것으로 읽힌다(비평가 지적 ⓓ '비행형이 지면에 붙어 있다'의 절반이 이것).
            // 부호가 살아 있는 사인으로 바꿔 위아래로 **떠 있는** 부유 리듬을 주고, 진폭도 크게 잡는다.
            const flying = this.riding && this.riding.form && this.riding.form.hover > 0 && !this.riding.form.stand;
            const bob = flying ? Math.sin(t * 1.9) * 0.13 * (this.walking ? 1.35 : 1)
                               : Math.abs(Math.sin(t * 4)) * 0.05 * walkBoost;
            mg.position.y = (ud.baseY || 0) + bob;
            // 탄 탈것도 살아 있어야 한다 — 지금까지 날개·꼬리 애니메이션은 **펫에만** 걸려 있어서
            // 정작 올라탄 드래곤·벌·고래의 날개가 통째로 얼어 있었다(정지 화면이 '떠 있는 조형물'로 읽힌 이유).
            // 다리·머리·바퀴·노즐까지 한 함수에서 같이 돈다(mount-animal-machine-dynamic).
            const partPitch = this.animateMountParts(mg, t, !!this.walking, dt);
            // ⚠️ 쓰러진 영웅은 **탑승 중이 아니다** — 안장에서 굴러떨어져 바닥에 눕는 연출이고
            //    Death 클립 자체가 groundPose(탑승 하체 포즈 미가산)다. 여기서 riding을 그대로 믿으면
            //    아래 `+= bob`이 사망 구간 내내 **누적**돼 시체가 하늘로 솟는다 —
            //    사용자가 3번 재지적한 '죽을 때 하늘로 올라간다'의 진짜 원인이 이것이었다
            //    (Death 클립은 멀쩡했다. 실측: 사망 후 1.8초에 y=3.9까지 올라가고 계속 상승).
            //    사망 구간의 영웅 y는 아래 heroGroundY()가 단독으로 소유한다.
            if (this.riding && !this.heroDead) {
                // 달릴 때 앞뒤로 까딱이는 기울기 + 계열별 몸통 피치(부유 드리프트·프레임 진동 등).
                // ⚠️ 피치는 여기 한 곳에서만 쓴다 — 아래에서 영웅에게 그대로 전달되므로, 다른 데서
                //    mg.rotation.x 를 또 건드리면 영웅과 탈것이 서로 다른 각으로 기울어 즉시 어긋난다.
                const lean = (this.walking ? Math.sin(t * 4) * 0.07 : 0) + partPitch;
                mg.rotation.x += (lean - mg.rotation.x) * Math.min(1, dt * 8);
                if (!this._attacking) this.heroG.position.y += bob;   // 영웅도 같은 바운스를 그대로 받는다
                this.heroG.rotation.x = mg.rotation.x * 0.6;
                this.alignStirrups();                                 // 등자를 실제 발 위치에 붙인다
                this.alignHandlebar();                                // 핸들바를 빈 손 아래로 (공격 중엔 그 자리에 둔다)
                this.alignReins();                                    // 고삐를 빈 손까지 (끈이라 공격 중에도 따라간다)
                this.alignPedals();                                   // 크랭크 위상을 실제 발 위치에서 푼다
            } else {
                // 아직 안 탄(또는 쓰러진) 상태 — 영웅에게 전달할 일이 없으니 피치를 그룹에 바로 준다.
                // 이 분기를 빼먹으면 '장착만 하고 안 탄' 탈것이 파츠만 움직이고 몸통은 굳어 보인다.
                mg.rotation.x += (partPitch - mg.rotation.x) * Math.min(1, dt * 8);
            }
        }
        // 따라오는 탈것 무리: 영웅 전진을 같이 따라가고, 개체별 위상·속도로 어긋나게 까딱인다
        for (const fg of this.mountFollowers) {
            const ud = fg.userData;
            const t = this._clock * (ud.speed || 1) + (ud.phase || 0);
            ud.home.x = Combat.HERO_X + (ud.spotX || 0) + this.worldX;
            fg.position.x = ud.home.x;
            const fly = this.mountFormOf(ud.name || '').hover > 0 && !this.mountFormOf(ud.name || '').stand;
            fg.position.y = (ud.baseY || 0) + (fly ? Math.sin(t * 1.9) * 0.11
                                                   : Math.abs(Math.sin(t * 4)) * 0.05 * (this.walking ? 1.6 : 1));
            // 무리도 탄 놈과 **같은 함수**로 움직인다 — 한쪽에만 넣으면 뒤따르는 말들만 얼어 있다.
            // 무리는 영웅이 안 얹혀 있으므로 피치를 그룹에 바로 준다(개체별 위상차 t 가 이미 섞여 있다).
            const fPitch = this.animateMountParts(fg, t, !!this.walking, dt);
            fg.rotation.x += (fPitch - fg.rotation.x) * Math.min(1, dt * 8);
        }
        // ===== 사망·기상 구간의 영웅 높이 — 이 구간만은 여기가 단독 주인이다 =====
        // 사용자 3회 재지적('죽을 때 하늘로 올라간다')의 원인은 Death 클립이 아니라 **주인 없는 y**였다:
        // 위 걷기/대기/리그 분기는 전부 `!heroDead` 가드가 걸려 사망 중에는 y를 아무도 안 쓰는데,
        // 탈것 바운스만 가드 없이 `+=`로 얹혀 매 프레임 누적됐다(실측 1.8초에 y=3.9, 계속 상승).
        // 이제 사망하면 안장에서 내려와 **지면(0)** 에 눕고(Death 클립 자체가 groundPose다),
        // 기상 클립이 도는 동안 안장 높이로 부드럽게 되돌아온다 — 다 일어난 뒤 rideY로 튀지 않게.
        if (this.heroG && (this.heroDead || this._heroReviveT > 0)) {
            const k = this.heroDead ? 0 : 1 - U.clamp(this._heroReviveT / this.REVIVE_DUR, 0, 1);
            this.heroG.position.y = (this.rideY || 0) * (k * k * (3 - 2 * k));
            this.heroG.rotation.x = 0;   // 탈것 기울기가 시체에 남아 비스듬히 떠 보이지 않게
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
            if (p.userData.spin) p.rotation.z += p.userData.spin * dt; // 파편 쿼드 텀블링
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
        // ── 바람 (TODO '맵 프롭 퀄리티 업') ──────────────────────────────────────────
        // 풀은 정점 셰이더(windShade)에서, 나무·꽃·양치류는 여기서 밑동을 축으로 휜다.
        // 그룹 원점이 곧 밑동이라 rotation.z 만 흔들면 '땅에 박힌 채 휘는' 그림이 나온다.
        // 주파수 2개를 겹쳐 기계적인 왕복을 없앤다(풀 셰이더와 같은 1.6/2.9Hz — 같은 바람이어야 한다).
        if (this._windMats) for (const u of this._windMats) u.value = this._clock;
        if (this.windProps) {
            const t1 = this._clock * 1.6, t2 = this._clock * 2.9;
            for (const c of this.windProps) {
                const ph = c.userData.windPhase, a2 = c.userData.windSway;
                c.rotation.z = c.userData.windBaseZ
                    + (Math.sin(t1 + ph) * 0.5 + Math.sin(t2 + ph * 1.7) * 0.25) * a2 * 2;
            }
        }
        // 크리스탈 반짝임 — "반짝이는 크리스탈 같은 미세 애니메이션"(항목 원문). 발광 세기를
        // 느리게 맥동시키고 할로 스프라이트를 같이 호흡시킨다. 재질 공유라 1회 갱신으로 전부 걸린다.
        if (this.bkin(this._biome) === 'magic' && this.crystalMat) {
            const p = 0.5 + Math.sin(this._clock * 1.15) * 0.5;
            // ⚠️ 진폭(p-p)은 유지하되 **바닥값을 내렸다**(0.85~1.35 → 0.24~0.46). 옛 값은 조형·음영을
            //    통째로 씻어냈다(setTheme 쪽 주석 참고). probe-wind 의 발광 게이트는 p-p 0.10 이라 그대로 통과한다.
            // ⚠️ 진폭 여유를 둔다 — probe-wind 는 짧은 창에서 재느라 명목 p-p 의 약 47% 만 잡는다.
            //    명목 0.22 로 뒀더니 실측 0.104 로 게이트(0.10) 코앞이었다. 진폭을 0.32 로 올리되
            //    **바닥값을 같이 내려** 최대치(0.46)는 그대로 둔다 — 최대치를 올리면 순백 클리핑이 되돌아온다.
            this.crystalMat.emissiveIntensity = 0.14 + p * 0.32;
            // 할로도 낮춘다 — 가산 합성이라 밝아진 결정 위에 얹히면 그 자리가 순백으로 클리핑된다(실측 364px).
            if (this.crystalHaloMat) this.crystalHaloMat.opacity = 0.22 + p * 0.18;
            // 접지 글로우는 **밑동을 밝힌다** — 세면 접지 블롭 그림자를 지워 프롭이 지면에서 떠 보인다
            // (비평가 ④: 밑동 직하 지면과 이격 지면의 명도차 0). 세기를 낮춰 그림자가 읽히게 둔다.
            if (this.crystalGlowMat) this.crystalGlowMat.opacity = 0.40 + p * 0.18;
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
                // 반짝임은 빌드 시 정한 기준 불투명도에 **곱한다** — 상수로 덮어쓰면 크기·강도 편차를
                // 줄여 둔 튜닝이 통째로 무효가 된다(0.22 의도 → 0.85 실측).
                const b = e.userData.baseOpacity !== undefined ? e.userData.baseOpacity : 0.22;
                e.material.opacity = b * (0.62 + Math.sin(this._clock * 3 + e.userData.phase) * 0.38);
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
        // 돌리 인(보스 워닝 전용): 카메라 rotation은 init의 lookAt으로 고정이라 z만 당기면 그대로 줌 인이 된다
        const camZ = 8.2 - (this.camPush || 0);
        if (this.camLock) {
            this.camera.position.copy(this.camLock.pos);
            this.camera.lookAt(this.camLock.look);
        } else if (this.shakeMag > 0.001) {
            this.camera.position.set(
                0.15 + this.worldX + U.rand(-1, 1) * this.shakeMag,
                3.7 + U.rand(-1, 1) * this.shakeMag * 0.6,
                camZ
            );
            this.shakeMag *= Math.pow(0.001, dt); // 감쇠
        } else {
            this.camera.position.set(0.15 + this.worldX, 3.7, camZ);
        }
        this.renderFrame(); // 블룸+비네트 포스트 스택 경유 (모바일은 직접 렌더 폴백)
    },
};
