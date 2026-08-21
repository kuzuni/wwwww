// ===== 프로시저럴 캐릭터 리그 (GLB 대체, 사용자 지시 2026-08-16 밤) =====
// 목표: 코드 생성만으로 AAA 모바일 3D 캐릭터 품질 — 단순 Box 조립 금지.
// 라운드 지오메트리(라테 흉갑·캡슐 사지·구형 견갑), 관절 피벗 계층, 이징 키프레임 모션.
// 기존 Scene3D 인터페이스(weaponG 손 부착, helmetG 머리 부착, heroPlay 클립 이름) 호환.

const ProChar = {
    // ---- 전신 비례 (hero-chibi, 사용자 지시 2026-08-18 — `probe-hero-proportion.js` 가 지키는 값) ----
    // 사용자 지시로 치비(두신비 2.5~3, 큰 머리·짧은 다리)로 전환 — 종전 성인 비례(6차 비평가 ㉢,
    // 두신비 6.93)는 이 지시로 폐기됐다. 머리를 키우고 다리를 줄이면 전신 높이가 바뀌므로, 여기서
    // 역배율을 걸어 **화면에서 차지하는 높이(1.785)는 그대로** 두고 비례만 바뀌게 한다.
    // 🔁 머리 1.0 → 1.30(사용자 추가 2026-08-19)으로 보정 전 전신이 1.771 → 1.953 이 됐다.
    //    0.98 → 0.889 = 0.98 × 1.771 ÷ 1.953 — 전신 높이를 1.771 그대로 되돌리는 역배율이다.
    //    ⚠️ 이 값은 머리 배율에 딸린 종속값이다. headG.scale 을 또 만지면 여기도 같이 다시 잡을 것
    //       (안 그러면 '비례를 바꿨다'가 아니라 '영웅을 키웠다'가 되고, 적 대비·카메라·HP바·탈것
    //        안장이 전부 끌려간다 — `probe-hero-proportion.js` 의 크기 불변 게이트가 이걸 지킨다).
    BODY_SCALE: 0.889,
    GROUND_Y: -0.053,   // 교정 전 발바닥 월드 y — 지면 블롭·그림자·발AO 가 여기 맞춰져 있다

    // ---- 이징 ----
    ease(t) { return t * t * (3 - 2 * t); },            // smoothstep — 관절 기본
    easeOut(t) { return 1 - (1 - t) * (1 - t); },       // 빠른 시작 (타격 스윙)
    easeIn(t) { return t * t; },                        // 느린 시작 (와인드업)
    // ---- 1930s 카툰 이징 (`cute-art-direction` 사용자 추가: "애니메이션들도 1930년대 카툰 느낌으로 과장되게") ----
    // 러버호스 카툰은 선형·smoothstep 로 안 간다 — **목표를 지나쳤다 돌아오거나(오버슈트)
    // 통통 튀어(바운스)** 멈춘다. 트랙 키의 3번째 원소로 구간 이징 이름을 준다: [t, v, 'back'].
    easeBack(t) { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },   // 오버슈트 후 안착
    easeBounce(t) {                                     // 착지·정착 — 점점 작아지는 3번 튐
        const n = 7.5625, d = 2.75;
        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
        if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
        return n * (t -= 2.625 / d) * t + 0.984375;
    },
    easeSnap(t) { return 1 - Math.pow(1 - t, 4); },      // 예비동작에서 튀어나가는 급가속 종료
    EASES: { back: 'easeBack', bounce: 'easeBounce', snap: 'easeSnap', out: 'easeOut', in: 'easeIn' },

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

    // 🧊 **voxel 사지 — `capsule` 의 큐브 대응** (화풍 확정 2026-08-20: 3D로 그리는 모든 것을 큐브 조형으로).
    //   `capsule` 과 **원점·방향·길이 규약이 같다**: 원점 = 위쪽 끝(피벗), 아래로 len 만큼 늘어지고
    //   끝에 rBot 짜리 캡이 달린다. 그래서 호출부에서 `capsule` → `voxLimb` 로 이름만 바꿔도
    //   팔꿈치/무릎 피벗·부속(라메·개스킷·부츠) 좌표를 한 자도 안 건드려도 된다.
    //
    //   ⚠️ **칸 크기를 `len / h` 로 되잡는 이유** — 목표 칸 크기(vs)를 그대로 쓰면 층 수 반올림
    //      오차가 그대로 사지 길이 오차가 된다(하완은 최대 4%). 이 리그는 두신비·다리비를
    //      `probe-hero-proportion` 이 수치로 지키고 있어서 **길이는 정확히 len 이어야 한다.**
    //      대신 칸이 부위마다 미세하게 달라지는데(0.0160 ↔ 0.0165 수준) 큐브는 여전히 정육면체라
    //      화면에서 안 갈린다. 반대로 y 만 늘려 맞추면 직육면체가 되어 voxel 로 안 읽힌다.
    //
    //   ⚠️ **`center: false` 로 굽고 위치를 직접 잡는다** — center 를 쓰면 캡 유무에 따라 중심이
    //      움직여 피벗이 흔들린다. 여기서는 기둥 맨 윗면이 정확히 로컬 y=0 에 오게 고정한다.
    voxLimb(rTop, rBot, len, mat, opts) {
        opts = opts || {};
        const g = new THREE.Group();
        const h = Math.max(2, Math.round(len / (opts.vs || 0.016)));   // 층 수
        const size = len / h;                                          // 실제 칸 크기(길이 보존)
        const rT = rTop / size, rB = rBot / size;
        // 기둥 — `taper` 는 y=0 이 밑이라 (밑=rBot, 위=rTop) 순서로 준다.
        let vox = Voxel.taper(rB, rT, h);
        // 끝 캡 — 반구 캡의 대응. `dome` 을 180° 뒤집어(=rotX 2회) 아래로 향하게 하고 기둥 밑에 붙인다.
        //   높이를 round(rB) 로 둬야 캡 밑동이 캡슐과 같은 −(len + rBot) 에 온다(부츠·개스킷 좌표 보존).
        const capH = Math.max(1, Math.round(rB));
        vox = Voxel.merge(vox, Voxel.at(Voxel.rotX(Voxel.dome(rB, capH), 2), 0, -1, 0));
        // ⚠️ **x·z 를 '캡슐에 내접'하도록 줄이지 말 것 — 한 번 해 보고 되돌렸다.** 칸 채움은
        //    폭이 항상 **홀수 칸**(2·floor(r)+1)이라 양자화 단위가 반 칸이 아니라 **한 칸**이다.
        //    그래서 전 층 최솟값으로 내접시키면 배율이 0.89~0.92 까지 떨어진다 — 상완을
        //    0.073 → 0.0635 로 깎는 셈이고, 이건 비평가 두 명이 "가는 막대에 씌운 갓등"이라
        //    지적해 일부러 0.062 → 0.073 으로 굵혀 둔 것을 되돌리는 것이다(㉣ 처방 역행).
        //    → 대신 **바깥 면이 최대 반 칸 넘치는 것을 허용**하고, 그 반 칸에 실제로 걸리는
        //      소매 두 개(대퇴 패드·상완 패딩)의 반지름만 넓혔다. `probe-vox-limb` ⑥ 이 지킨다.
        const mesh = Voxel.build(vox, {
            size: size, material: mat, color: 0xffffff, center: false,
            // 사슬은 고리 직조라 칸마다 색이 튀는 게 오히려 맞다 — 기본 0.06 보다 올린다.
            jitter: opts.jitter === undefined ? 0.09 : opts.jitter,
        });
        mesh.position.y = -(h - 0.5) * size;   // 기둥 맨 윗면(= y (h-1)+0.5 칸)을 로컬 0 으로
        g.add(mesh);
        return g;
    },

    // 🧊 **voxel 판금 조각 공용** — 리그의 구/원통 프리미티브를 큐브 덩어리로 바꿀 때 쓴다.
    //   ⚠️ **비균등 scale 을 mesh.scale 로 주지 말 것.** 그러면 큐브가 직육면체로 눌려 voxel 로
    //      안 읽힌다(화풍 ⓐ: 조형은 그대로 큐브). 대신 **축별 반지름을 칸으로 환산해** 넣는다 —
    //      아래 `vr()` 이 그 환산이고, 그래서 호출부는 원래 프리미티브의 반지름×scale 을 그대로
    //      적어 넣으면 된다(비례를 다시 디자인하지 않아도 된다는 게 이 전환의 전제다).
    VOX: 0.03,          // 리그 공용 칸 크기 — Riverbond식 굵은 큐브 (사용자 2026-08-21 "voxel답게, 큐브 크게"). 0.016 은 너무 잘아 매끈했음
    vr(world, size) { return world / (size || this.VOX); },   // 월드 반지름 → 칸 반지름
    voxPart(voxels, mat, opts) {
        opts = opts || {};
        return Voxel.build(voxels, {
            size: opts.size || this.VOX, material: mat, color: 0xffffff,
            center: opts.center === undefined ? true : opts.center,
            jitter: opts.jitter === undefined ? 0.05 : opts.jitter,
        });
    },

    // 평평한 사각 패치 다발 — 이목구비처럼 **'상자 앞면에 그린 그림'** 을 굽는다.
    //   rects = [[cx, cy, w, h], ...] (패치 로컬·월드 단위, 전부 z=0 평면) → 한 지오메트리로 병합.
    // 🔑 **칸마다 따로 굽지 말 것.** 칸당 2 tri 면 7×8 눈 하나가 112 tri 라 이걸로 갈아치우려던
    //    옛 원판(30 tri)보다 오히려 **비싸진다.** 같은 색이 이어지는 구간을 **직사각형 런으로 뭉쳐**
    //    넘겨야 이득이 난다(L자 흰자 = 사각형 2장 = 4 tri). `probe-hero-tris` 상한이 빠듯해서
    //    (이 세션 시작 시 잔여 4930) 이 규약을 어기면 바로 예산을 넘긴다.
    // ⚠️ 법선은 전부 +z 라 `computeVertexNormals` 로 충분하다. uv 는 안 만든다 — 이 패치들은
    //    텍스처를 안 쓰고 면당 플랫 색만 쓴다(화풍 ⓕ "표면은 플랫/매트").
    // ---- 블룸 금지 태그 (eye-bloom-wash) ------------------------------------------------
    // 순백 플랫 아트는 정의상 브라이트패스 임계를 항상 넘긴다. 그 자체는 의도된 것이지만
    // (흰자가 피부보다 밝아야 눈이 형태로 읽힌다 — 아래 흰자 재질 주석), **번진 빛이 자기 안의
    // 동공을 덮어 회색으로 씻는다**(실측: 동공 L 66.5 → 105.6). 밝기를 낮춰 막을 수는 없다 —
    // 피부가 214 까지 올라와 임계(229.5) 아래로 내리면 `probe-eye-contrast` ΔL 이 무너진다.
    // → **밝기가 아니라 소속으로 가른다.** 이 재질은 알파 0 을 써서 자기를 표시하고,
    //   `Scene3D.initPost` 의 브라이트패스가 `step(0.15, a)` 로 그 화소만 뺀다(사유는 그쪽 주석).
    // ⚠️ `customProgramCacheKey` 를 반드시 같이 준다 — 안 주면 three 가 **똑같이 생긴 다른
    //    MeshBasicMaterial 의 컴파일된 프로그램을 그대로 재사용**해 패치가 조용히 사라진다.
    noBloom(mat) {
        mat.onBeforeCompile = (s) => {
            s.fragmentShader = s.fragmentShader.replace(
                '#include <dithering_fragment>',
                '#include <dithering_fragment>\n\tgl_FragColor.a = 0.0;   // 블룸 금지 태그');
        };
        mat.customProgramCacheKey = () => 'prochar-noBloom';
        return mat;
    },
    flatPatch(rects, mat) {
        const pos = [], idx = [];
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i], hw = r[2] / 2, hh = r[3] / 2, b = i * 4;
            pos.push(r[0] - hw, r[1] - hh, 0, r[0] + hw, r[1] - hh, 0, r[0] + hw, r[1] + hh, 0, r[0] - hw, r[1] + hh, 0);
            idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        return new THREE.Mesh(g, mat);
    },

    // ---- 캔버스 생성 텍스처 (외부 에셋 금지 — 코드로 재질감 생성) ----
    // 밝기 중심 그레이스케일로 만들어 material.color 틴트(장비 시대색)와 곱해지게 한다.
    _texCache: {},
    // 비등방 필터링 최대치. Scene3D.init이 렌더러 생성 직후 실제 GPU 상한으로 덮어쓴다
    // (ProChar 텍스처가 렌더러보다 먼저 만들어지는 경우가 있어 기본값을 둔다).
    maxAnisotropy: 8,
    canvasTex(key, draw, w, h) {
        if (this._texCache[key]) return this._texCache[key];
        const c = document.createElement('canvas');
        c.width = w || 128; c.height = h || 128;
        draw(c.getContext('2d'), c.width, c.height);
        const tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        // ⚠️ 기본 anisotropy는 1이다. 사지는 원통이라 화면에서 표면이 급격히 기울어(그레이징)
        // u축 텍셀이 심하게 압축되는데, 등방 밉맵만으로는 그 방향을 구분하지 못해 고리 직조가
        // 흑백 체커로 뭉개지고 카메라가 조금만 움직여도 지글거린다(비평가 A·B가 각각 지목).
        // 실측: aniso 1에서 미세 카메라 이동에 명도가 12%p 이상 튀는 픽셀이 캐릭터 면적의 1.43%.
        tex.anisotropy = this.maxAnisotropy;
        this._texCache[key] = tex;
        return tex;
    },
    // 렌더러가 준비된 뒤 이미 만들어진 텍스처까지 상한을 소급 적용
    applyMaxAnisotropy(renderer) {
        this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
        for (const k in this._texCache) {
            const t = this._texCache[k];
            if (t.anisotropy !== this.maxAnisotropy) { t.anisotropy = this.maxAnisotropy; t.needsUpdate = true; }
        }
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
            g.addColorStop(0, '#d6d7db'); // f0f1f4는 강광에서 적색이 연어색으로 씻김 — 샷 간 알베도 흔들림 (비평가 7.3 7번)
            g.addColorStop(0.35, '#bcbec4');
            g.addColorStop(1, '#6b6d75'); // 상하 명도차 확대 — 단색 판자 오독 해소 (비평가 7.1 6번)
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            // 세로 드레이프 음영 — 지오메트리 주름(sin x*33)과 유사 주기의 소프트 스트라이프로 '접힌 천' 깊이
            for (let i = 0; i < 6; i++) {
                const x = (i + 0.5) / 6 * w;
                const sg = ctx.createLinearGradient(x - w * 0.09, 0, x + w * 0.09, 0);
                sg.addColorStop(0, 'rgba(0,0,0,0)');
                sg.addColorStop(0.5, 'rgba(30,20,20,0.22)');
                sg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = sg;
                ctx.fillRect(x - w * 0.09, h * 0.12, w * 0.18, h * 0.88);
            }
            const sheen = ctx.createLinearGradient(0, 0, w, 0); // 중앙 세로 광택 롤
            sheen.addColorStop(0, 'rgba(255,255,255,0)');
            sheen.addColorStop(0.5, 'rgba(255,255,255,0.14)');
            sheen.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
            // 직조 그레인 — 미세 가로 결
            for (let y = 0; y < h; y += 2) {
                ctx.fillStyle = `rgba(${y % 4 ? 255 : 0},${y % 4 ? 255 : 0},${y % 4 ? 255 : 0},0.028)`;
                ctx.fillRect(0, y, w, 1);
            }
            // 헴 트림 — 밑단·양옆 재봉 밴드 (테두리가 잘린 종이가 아니라 마감된 천)
            ctx.fillStyle = 'rgba(40,22,22,0.5)';
            ctx.fillRect(0, h * 0.94, w, h * 0.06);
            ctx.fillRect(0, 0, w * 0.045, h);
            ctx.fillRect(w * 0.955, 0, w * 0.045, h);
            ctx.fillStyle = 'rgba(255,225,170,0.5)'; // 금사 스티치 라인
            ctx.fillRect(0, h * 0.935, w, 1.5);
        }, 128, 256);
    },
    // 바위: 화강암 얼룩 + 균열 라인 (골렘 몸통 — 그레이스케일, 틴트 대상)
    rockTex() {
        // 512 해상도 — 128에선 클로즈업 샷에서 입자가 뭉개져 '민짜 점토'로 읽힘 (비평가 지적)
        return this.canvasTex('rock', (ctx, w, h) => {
            ctx.fillStyle = '#b9bcc0'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 5200; i++) { // 화강암 입자 얼룩 — 면적비만큼 증량, 입자 픽셀 크기는 유지해 상대적으로 잘게
                const v = 130 + Math.floor(Math.random() * 110);
                ctx.fillStyle = `rgba(${v},${v},${v - 6},${0.18 + Math.random() * 0.2})`;
                const r = 1.4 + Math.random() * 4.4;
                ctx.beginPath();
                ctx.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
                ctx.fill();
            }
            for (let i = 0; i < 22; i++) { // 균열 — 꺾이는 다크 라인
                ctx.strokeStyle = `rgba(38,40,46,${0.35 + Math.random() * 0.25})`;
                ctx.lineWidth = 2.5 + Math.random() * 2;
                let x = Math.random() * w, y = Math.random() * h;
                ctx.beginPath(); ctx.moveTo(x, y);
                for (let j = 0; j < 5; j++) {
                    x += (Math.random() - 0.5) * 110; y += (Math.random() - 0.3) * 85;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.75);
            vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,24,30,0.28)');
            ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
        }, 512, 512);
    },
    // ===== 적 몬스터 표면 질감 (2026-08-17) =====
    // 적은 골렘(rockTex)만 맵을 물고 나머지 6종은 전부 민짜 `MeshStandardMaterial`이었다.
    // 그래서 늑대는 회색 캡슐 조립, 버섯 몸통은 흰 덩어리로 읽혔다 — 영웅에 쓴 것과 같은
    // 캔버스 생성 텍스처를 적에도 물린다. 두 텍스처 모두 **밝은 회색 베이스**(≈0.88)로
    // 그려 albedo에 곱해져도 종별 키 컬러가 어두워지지 않게 한다(맵은 색에 곱해진다 —
    // rockTex의 #b9bcc0 베이스가 원시 장비를 통째로 어둡게 만들었던 함정과 같은 계열).
    // 털: 방향성 있는 짧은 스트로크 다발 (늑대/박쥐/고블린 머리털)
    furTex() {
        // 타일을 반복해 월드 스케일을 맞춘다 — repeat 1이면 512px 결이 몸통을 한 바퀴에 한 번만
        // 감아 털 한 올이 손가락만 해진다(체인메일에서 이미 밟은 함정과 같은 계열).
        const t = this.canvasTex('fur', (ctx, w, h) => {
            ctx.fillStyle = '#dcdcda'; ctx.fillRect(0, 0, w, h);
            // 아래로 흐르는 결 — 결이 한 방향으로 서야 '털'이고, 무작위면 그냥 노이즈다
            ctx.lineCap = 'round';
            for (let i = 0; i < 2600; i++) {
                const x = Math.random() * w, y = Math.random() * h;
                const len = 7 + Math.random() * 15;
                const drift = (Math.random() - 0.5) * 7; // 결이 살짝 눕는 정도
                const v = 150 + Math.floor(Math.random() * 105);
                ctx.strokeStyle = `rgba(${v},${v},${v - 4},${0.16 + Math.random() * 0.26})`;
                ctx.lineWidth = 1 + Math.random() * 1.9;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + drift, y + len); ctx.stroke();
            }
            for (let i = 0; i < 190; i++) { // 뭉친 털다발 그림자 — 결에 덩어리감을 준다
                const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 12 + Math.random() * 22);
                g.addColorStop(0, 'rgba(96,98,102,0.24)'); g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.save(); ctx.translate(Math.random() * w, Math.random() * h);
                ctx.fillStyle = g; ctx.fillRect(-34, -34, 68, 68); ctx.restore();
            }
            const bg = ctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, 'rgba(255,255,255,0.1)'); bg.addColorStop(1, 'rgba(30,30,34,0.16)');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        }, 512, 512);
        t.repeat.set(3, 3);
        return t;
    },
    // 살갗: 굵은 얼룩 + 미세 모공 (고블린/임프/버섯 몸통 — 유기물인데 민짜면 점토로 읽힌다)
    skinTex() {
        const t = this.canvasTex('skin', (ctx, w, h) => {
            ctx.fillStyle = '#e0dedb'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 240; i++) { // 넓은 색조 얼룩 — 살결의 큰 무늬
                const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 20 + Math.random() * 46);
                const v = 176 + Math.floor(Math.random() * 62);
                g.addColorStop(0, `rgba(${v},${v - 3},${v - 8},0.3)`); g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.save(); ctx.translate(Math.random() * w, Math.random() * h);
                ctx.fillStyle = g; ctx.fillRect(-70, -70, 140, 140); ctx.restore();
            }
            for (let i = 0; i < 3400; i++) { // 모공 — 잘고 촘촘해야 클로즈업에서 살결로 읽힌다
                const v = 148 + Math.floor(Math.random() * 80);
                ctx.fillStyle = `rgba(${v},${v - 4},${v - 10},${0.14 + Math.random() * 0.18})`;
                ctx.beginPath();
                ctx.arc(Math.random() * w, Math.random() * h, 0.9 + Math.random() * 2.1, 0, Math.PI * 2);
                ctx.fill();
            }
            for (let i = 0; i < 26; i++) { // 주름 — 관절·접힘이 있는 살갗
                ctx.strokeStyle = `rgba(120,114,110,${0.16 + Math.random() * 0.16})`;
                ctx.lineWidth = 1.6 + Math.random() * 2.2;
                let x = Math.random() * w, y = Math.random() * h;
                ctx.beginPath(); ctx.moveTo(x, y);
                for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.4) * 70; ctx.lineTo(x, y); }
                ctx.stroke();
            }
            const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.34, w / 2, h / 2, h * 0.78);
            vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(28,26,30,0.2)');
            ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
        }, 512, 512);
        t.repeat.set(2, 2); // 살갗 무늬는 털보다 굵다 — 반복을 낮게
        return t;
    },

    // 생물 가죽: 부드러운 얼룩 반점 (고블린/임프 피부 — 그레이스케일, 틴트 대상)
    hideTex() {
        // 512 해상도 — 반점을 잘게 다량 뿌려 클로즈업에서도 살결로 읽히게 (비평가: 민짜 재질)
        return this.canvasTex('hide', (ctx, w, h) => {
            ctx.fillStyle = '#c8cbc4'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 1300; i++) {
                const v = 150 + Math.floor(Math.random() * 70);
                const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 7 + Math.random() * 16);
                g.addColorStop(0, `rgba(${v},${v + 4},${v - 4},0.3)`);
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.save();
                ctx.translate(Math.random() * w, Math.random() * h);
                ctx.fillStyle = g;
                ctx.fillRect(-24, -24, 48, 48);
                ctx.restore();
            }
            const bg = ctx.createLinearGradient(0, 0, 0, h); // 아래로 살짝 어두워지는 배음영
            bg.addColorStop(0, 'rgba(255,255,255,0.08)'); bg.addColorStop(1, 'rgba(24,26,24,0.2)');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        }, 512, 512);
    },
    // 사슬갑옷(체인메일): 4-in-1 고리 직조 — 팔다리가 '민짜 캡슐 = 맨살 튜브'로 읽히던 최대 감점원 해소.
    // 고리 하나하나를 밝은 링 + 안쪽 어두운 구멍으로 그려 범프까지 겸한다(같은 텍스처를 bumpMap으로 재사용).
    // 사슬 고리 타일 밀도. 실측(shot-mail-ab.js 근접샷): repeat 1이면 대퇴 둘레에 고리가
    // 14개뿐이라 지름 3.8cm짜리 고리가 되어 '뽁뽁이/골프공'으로 읽힌다(비평가 A #5·B #2 공통 지목).
    // 실제 사슬 고리는 8~10mm이므로 둘레당 40~50개가 맞다 → repeat 3(고리 42개, 지름 1.3cm)로 올린다.
    // 텍스처를 다시 그리지 않고 repeat만 올리는 이유: 256×176 캔버스에 42열을 그리면 열당 6px로
    // 고리 선이 뭉개진다. 타일을 반복하면 텍셀 밀도를 유지한 채 월드 스케일만 맞출 수 있다.
    MAIL_REPEAT: 3,
    mailTex() {
        const t = this.canvasTex('mail', (ctx, w, h) => {
            ctx.fillStyle = '#3a4048'; ctx.fillRect(0, 0, w, h); // 고리 사이로 비치는 밑감(패딩) 그늘
            // 사지 원통은 UV가 둘레(u) 1바퀴 × 길이(v) 1회로 매핑돼 u쪽이 1.4~2배 늘어난다.
            // 그래서 텍스처 안에서는 고리를 세로로 길게 그려 두어야 감긴 뒤 정원(正圓)에 가깝게 읽힌다.
            const cols = 14, rows = 9;
            const cw = w / cols, ch = h / rows;
            const r = cw * 0.46;
            for (let ry = -1; ry <= rows; ry++) {
                for (let cx = -1; cx <= cols; cx++) {
                    const odd = ((ry % 2) + 2) % 2 === 1;
                    const x = cx * cw + (odd ? cw * 0.5 : 0) + cw * 0.5;
                    const y = ry * ch + ch * 0.5;
                    // 고리 본체 — 위쪽이 밝은 링 그라디언트(원통 고리의 하이라이트)
                    const g = ctx.createLinearGradient(x, y - r, x, y + r);
                    g.addColorStop(0, '#e2e8ee');
                    g.addColorStop(0.45, '#a8b3bd');
                    g.addColorStop(1, '#5e6874');
                    ctx.strokeStyle = g;
                    ctx.lineWidth = cw * 0.2;
                    ctx.beginPath();
                    ctx.ellipse(x, y, r * 0.86, r * 1.12, 0, 0, Math.PI * 2);
                    ctx.stroke();
                    // 고리 안쪽 구멍 — 어둡게 파서 직조가 실루엣 없이도 판독되게
                    ctx.fillStyle = 'rgba(20,24,30,0.55)';
                    ctx.beginPath();
                    ctx.ellipse(x, y, r * 0.46, r * 0.6, 0, 0, Math.PI * 2);
                    ctx.fill();
                    // 아래쪽 그림자 아크 — 고리끼리 겹치는 두께감
                    ctx.strokeStyle = 'rgba(14,18,24,0.4)';
                    ctx.lineWidth = cw * 0.12;
                    ctx.beginPath();
                    ctx.ellipse(x, y + r * 0.12, r * 0.98, r * 0.76, 0, 0.2, Math.PI - 0.2);
                    ctx.stroke();
                }
            }
        }, 256, 176);
        t.repeat.set(this.MAIL_REPEAT, this.MAIL_REPEAT);
        return t;
    },
    // 퀼팅 패딩(갬버슨): 사슬 밑에 받쳐 입는 누빔천 — 마름모 스티치 + 부푼 면
    padTex() {
        return this.canvasTex('pad', (ctx, w, h) => {
            ctx.fillStyle = '#8d7a63'; ctx.fillRect(0, 0, w, h);
            const d = w / 5;
            for (let i = -5; i < 10; i++) { // 마름모 누빔 — 두 방향 사선 격자
                for (const dir of [1, -1]) {
                    const g = ctx.createLinearGradient(0, i * d, 0, i * d + d);
                    g.addColorStop(0, 'rgba(255,244,228,0.16)');
                    g.addColorStop(0.5, 'rgba(0,0,0,0)');
                    g.addColorStop(1, 'rgba(30,22,14,0.3)');
                    ctx.save();
                    ctx.translate(w / 2, h / 2); ctx.rotate(dir * Math.PI / 4); ctx.translate(-w / 2, -h / 2);
                    ctx.strokeStyle = 'rgba(46,34,22,0.5)'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(-w, i * d); ctx.lineTo(w * 2, i * d); ctx.stroke();
                    ctx.fillStyle = g; ctx.fillRect(-w, i * d, w * 3, d);
                    ctx.restore();
                }
            }
        }, 128, 128);
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

    // ---------- 값 구조: 니어블랙 재질 ----------
    // 비평가 2인이 공통 1위로 지목한 결함 = "캐릭터에 진짜 어두운 값이 아예 없다"(실측 darkPctHero 0.04%,
    // 요구치는 캐릭터 면적의 15~20%가 명도 0.10~0.18). 외곽선/컨투어로는 테두리 한 줄만 어두워질 뿐이라
    // **면적을 가진 어두운 재질**이 필요하다 — 가죽 스트랩·부츠 밑창·관절 개스킷·고젯 안쪽·판금 밑면.
    //
    // ⚠️ 헥스 선정의 함정: r128은 `setHex`를 **리니어**로 해석하고 렌더러는 **sRGB**로 출력하므로
    // 화면 명도는 대략 hex^(1/2.2)로 떠오른다. 여기에 태양+환경광 곱까지 얹히면 '어두워 보이는' 헥스
    // (0x2a1a0d 부츠 등)가 화면에서는 0.35~0.45로 나온다 — 이미 이 함정에 두 번 빠진 기록이 위에 있다
    // (건틀릿 0x6b4e3a→0x241408, 부츠 0x4a3728→0x2a1a0d). 목표 대역 0.10~0.18을 **조명 후**에 맞추려면
    // 리니어 albedo가 0.01 근처여야 한다 — `probe-hero-dark.js`로 스윕해 채택한 값이 아래 DEEP.
    DEEP: { color: 0x04050a, roughness: 0.94, metalness: 0.18, env: 0.14 },
    // 갑옷 금속 3톤. 스트랩·개스킷만으로는 어두운 값이 캐릭터 면적의 2%대에 그친다(실측) — 요구치 15~20%를
    // 채우려면 **면적을 가진 층**이 어두워야 한다. 판금(steel)은 하이라이트 담당이라 밝게 두고,
    // 사지를 통째로 덮는 **사슬(mail)을 블랙엔드 스틸로** 내려 대면적 다크를 만든다(중세 흑갑 리퍼런스).
    // 판금이 밝게 남으므로 '검은 덩어리'가 아니라 밝은 판금 ↔ 어두운 사슬의 재질 대비로 읽힌다.
    // 스윕 실측(probe-hero-dark.js, 480×854 인게임 뷰 / 사슬 albedo만 갈아가며):
    //   mail 0x8e9aa6(기존) bandPct 1.38 · 0x2a323c 2.29 · 0x0e1319 2.50 · 0x080b10 2.33(과다 → 오히려 감소)
    //   steelDark 0x5c6b7a(기존) 2.34 · 0x2a323c 2.50 · 0x1c222a 2.63(판금 대비가 과해 보조판이 구멍으로 읽힘)
    // → mail 0x0e1319 · steelDark 0x232a33 채택. **주의: albedo만으로는 2.5%가 천장이다** — metalness 0.78 금속은
    // 화면값을 albedo가 아니라 **환경 반사**가 지배하므로, 요구치 15~20%는 전역 필(반구광·env·림) 하향이
    // 선행돼야 한다(별도 '전역 값 구조' 작업). 이 항목은 그 선행 작업이 먹힐 재질 바닥을 까는 몫.
    // ⚠️ 2026-08-18 값 하향 (비평가 2인이 독립 1~2순위로 올린 "캐릭터가 배경과 값으로 분리되지 않는다").
    //    이전 값 steel 0x9fb2c2 / steelDark 0x232a33 / mail 0x0e1319 은 **화면 평균 L 109 로, 이 캐릭터가
    //    가리고 있는 배경(L 123)과 명도 델타가 14 밖에 안 났다** — 색상만으로 분리되고 있어 그레이스케일·
    //    썸네일에서 몸통이 잔디에 녹는다(`probe-hero-value.js` 실측, 3런 13.9/14.2/16.2 로 재현).
    //    각 채널 ×0.50. 아래 envMapIntensity ×0.45 와 **한 세트로만 의미가 있다**(둘 중 하나만 되돌리면
    //    델타가 게이트 아래로 내려간다). 근거는 `probe-hero-value-sweep.js` 표:
    //      · roughness 는 사실상 무효(13.4 → 12.8) — 이 손잡이는 잡지 말 것
    //      · albedo 와 env 는 둘 다 유효하고 곱해서 쓸 때 가장 적게 어둡게 하고 게이트를 넘는다
    //      · 웜 재질(금 트림·살색·망토)은 **건드리지 않는다** — 두 비평가가 '되돌리지 말 것'으로 꼽았다
    //    실측 결과: 델타 14 → 48.7, 영웅 평균 L 74.4 (비평가 처방대로 판금 베이스 L 70~85 대역).
    TONE: { steel: 0x505961, steelDark: 0x12151a, mail: 0x070a0d },
    setTone(o) {
        Object.assign(this.TONE, o);
        for (const m of this._toneMats || []) {
            const t = m.userData.tone;
            if (o[t] === undefined) continue;
            m.userData.baseColor = o[t];
            m.color.setHex(o[t]);
            m.needsUpdate = true;
        }
    },
    // 니어블랙 가죽/고무 — 텍스처 맵은 밝은 베이스(#c9b8a6)를 곱하므로 쓰지 않고, 범프만 얹어 질감을 남긴다.
    deepMat(o) {
        const D = this.DEEP;
        const bump = this.leatherTex();
        const m = new THREE.MeshStandardMaterial({
            color: (o && o.color) !== undefined ? o.color : D.color,
            metalness: (o && o.metalness) !== undefined ? o.metalness : D.metalness,
            roughness: (o && o.roughness) !== undefined ? o.roughness : D.roughness,
            bumpMap: bump, bumpScale: 0.016,
            envMapIntensity: (o && o.env) !== undefined ? o.env : D.env,
        });
        if (o && o.side) m.side = o.side;
        (this._deepMats || (this._deepMats = [])).push(m);
        return m;
    },
    // 스윕 도구용 — 이미 만들어진 니어블랙 재질 전부를 한 번에 갈아끼운다(probe-hero-dark.js).
    setDeep(o) {
        Object.assign(this.DEEP, o);
        for (const m of this._deepMats || []) {
            if (o.color !== undefined) m.color.setHex(o.color);
            if (o.roughness !== undefined) m.roughness = o.roughness;
            if (o.metalness !== undefined) m.metalness = o.metalness;
            if (o.env !== undefined) m.envMapIntensity = o.env;
            m.needsUpdate = true;
        }
    },

    // ---------- 인버티드 헐 아웃라인은 **삭제됐다** (사용자 지시 2026-08-18 `remove-3d-black-outline`) ----------
    // "캐릭터들이랑 장비 검정색 아웃라인한 거 없애라." — 비평가가 값 구조 처방으로 넣었던 BackSide 검은 셸
    // (`OUTLINE`/`addOutline`/`refreshOutline`/`setOutline`, 폭·농도 스윕 도구 `probe-outline.js`·`shot-outline.js`)을
    // 생성 경로째 걷어냈다. **되살리지 말 것** — 사용자가 명시적으로 번복한 연출이다.
    // ⚠️ 같이 알아둘 것: ⑴ 실루엣 분리는 `Scene3D.applyRimLight` 의 프레넬 '다크 컨투어'가 **남아 있다**
    //    (그건 실루엣 안쪽만 어둡게 해 배경을 잠식하지 않으므로 이 지시의 대상이 아니다).
    //    ⑵ 2D 슬롯 아이콘의 검정 아웃라인(`--slot-outc`, css)은 **사용자가 따로 요청한 것**이라 그대로 둔다.
    //    ⑶ `userData.isOutline` 필터는 여러 probe·`applyRimLight` 에 남아 있지만 이제 매칭되는 오브젝트가
    //       없어 무해하다(다른 스트림과 충돌을 줄이려 건드리지 않았다).

    // 그라디언트 환경 큐브맵 — 금속 반사가 '고무'가 아니라 '강철'로 읽히게 하는 핵심.
    // 저대비 민짜 그라디언트는 반사 '내용물'이 없어 금속이 새틴으로 뭉개짐(비평가 6.8) — 태양 핫스팟+어두운 지면으로 대비 확보
    envMap() {
        if (this._envMap) return this._envMap;
        const faces = [];
        for (let i = 0; i < 6; i++) {
            const c = document.createElement('canvas');
            c.width = c.height = 64;
            const ctx = c.getContext('2d');
            if (i === 2) { // +Y 하늘: 밝은 청백 + 천정 태양 글로우
                ctx.fillStyle = '#dcebfa'; ctx.fillRect(0, 0, 64, 64);
                const sg = ctx.createRadialGradient(44, 22, 0, 44, 22, 26);
                sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.35, '#fff6dd'); sg.addColorStop(1, 'rgba(255,246,221,0)');
                ctx.fillStyle = sg; ctx.fillRect(0, 0, 64, 64);
            } else if (i === 3) { // -Y 지면: 어두운 갈녹 — 대비 확보 위해 더 어둡게
                ctx.fillStyle = '#2f3828'; ctx.fillRect(0, 0, 64, 64);
            } else { // 측면: 하늘→지평선→지면 그라디언트 (지평선 명암 단차 강화)
                const g = ctx.createLinearGradient(0, 0, 0, 64);
                g.addColorStop(0, '#e6f1fb');
                g.addColorStop(0.48, '#fdf3da'); // 지평선 웜톤 — 하이라이트 롤에 온기
                g.addColorStop(0.55, '#5c6448');
                g.addColorStop(1, '#2f3828');
                ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
                if (i === 0) { // +X면 태양 원반 — 금속 하이라이트의 '광원 반사' 콘텐츠
                    const sg = ctx.createRadialGradient(32, 14, 0, 32, 14, 18);
                    sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.3, '#ffeec4'); sg.addColorStop(1, 'rgba(255,238,196,0)');
                    ctx.fillStyle = sg; ctx.fillRect(0, 0, 64, 64);
                }
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

        // 재질 — PBR 분리(비평가 6.0 1위 결함 '전 재질 무광 플라스틱'): 금속=높은 metalness+낮은 roughness,
        // 유기물(가죽/천/피부)=metalness 0+높은 roughness. 환경광은 Scene3D가 PMREM으로 scene.environment에 공급.
        R.armorMats = [];
        if (!this._toneMats) this._toneMats = []; // 톤 스윕 대상 레지스트리 (영웅·썸네일 등 여러 리그가 누적)
        const mTex = this.metalTex();
        // 금속 3톤은 스윕 대상이라 상수로 뽑는다(TONE) — 값 구조 튜닝은 probe-hero-dark.js가 ProChar.setTone()으로 돌린다.
        const T = this.TONE;
        const steel = () => {
            const m = new THREE.MeshStandardMaterial({ color: T.steel, metalness: 0.85, roughness: 0.34, map: mTex, bumpMap: mTex, bumpScale: 0.006, envMapIntensity: 0.32 }); // 브러시드 스틸 — env 0.9/러프 0.3은 근접샷 흉갑이 순백 블로우아웃 (비평가 7.3 1번)
            m.userData.tone = 'steel';
            m.userData.baseColor = m.color.getHex();
            R.armorMats.push(m);
            (this._toneMats || (this._toneMats = [])).push(m);
            return m;
        };
        // 🧊 **voxel 판금 재질 — `steel`/`steelDark` 의 큐브판.** 세 가지가 다르고 셋 다 이유가 있다:
        //   ⑴ `vertexColors: true` — `Voxel.build` 는 색·이음새 AO 를 정점 색에 굽는다(없으면 AO 소멸).
        //   ⑵ `map`/`bumpMap` 없음 — `Voxel.build` 는 uv 를 안 만들어서 텍스처가 한 텍셀만 샘플링된다.
        //   ⑶ metalness·env 하향 — env 반사가 세면 구워 둔 AO 가 씻겨 이음새가 안 보인다(= 큐브로 안 읽힘).
        //      ⚠️ 값 구조(비평가 ㉠, 영웅 평균 L 70~85)를 지키려면 여기를 **올리지 말 것** — 판금 env 를
        //         올리는 순간 투구가 흰 돔으로 돌아갔던 그 축이다.
        //   톤 레지스트리에는 같은 `tone` 으로 등록하므로 `setTone`·시대 틴트가 원통판과 함께 잡는다.
        const voxSteel = (tone) => {
            const m = new THREE.MeshStandardMaterial({
                color: tone === 'steelDark' ? T.steelDark : T.steel,
                metalness: tone === 'steelDark' ? 0.60 : 0.66,
                roughness: tone === 'steelDark' ? 0.58 : 0.46,
                envMapIntensity: tone === 'steelDark' ? 0.20 : 0.22,
                vertexColors: true, flatShading: true,
            });
            if (tone === 'steelDark') m.userData.dark = true;
            m.userData.tone = tone;
            m.userData.baseColor = m.color.getHex();
            R.armorMats.push(m);
            (this._toneMats || (this._toneMats = [])).push(m);
            return m;
        };
        const steelDark = () => {
            const m = new THREE.MeshStandardMaterial({ color: T.steelDark, metalness: 0.8, roughness: 0.5, map: mTex, bumpMap: mTex, bumpScale: 0.006, envMapIntensity: 0.29 });
            m.userData.dark = true; // 틴트 시 명도 단차 유지용
            m.userData.tone = 'steelDark';
            m.userData.baseColor = m.color.getHex();
            R.armorMats.push(m);
            this._toneMats.push(m);
            return m;
        };
        // 사지 전용 사슬갑옷 — 민짜 캡슐이 '맨살 튜브'로 읽히던 최대 감점원(비평가 7.3 3번) 해소.
        // 고리 직조 텍스처를 범프로도 써서 실루엣 없이도 금속 직물로 판독되게 한다. 사지는 원통이라 세로 반복을 늘린다.
        const mailTex = this.mailTex();
        const mail = () => {
            const m = new THREE.MeshStandardMaterial({ color: T.mail, metalness: 0.78, roughness: 0.56, map: mailTex, bumpMap: mailTex, bumpScale: 0.02, envMapIntensity: 0.25 });
            m.userData.dark = true; // 시대색 혼합비를 낮춰 광 나는 판금과 명도·채도가 붙지 않게 (판금 대비 유지)
            m.userData.tone = 'mail';
            m.userData.baseColor = m.color.getHex();
            R.armorMats.push(m);
            this._toneMats.push(m);
            return m;
        };
        const padTex = this.padTex();
        const padding = new THREE.MeshStandardMaterial({ color: 0x6b5844, metalness: 0, roughness: 0.9, map: padTex, bumpMap: padTex, bumpScale: 0.014 }); // 사슬 밑 갬버슨 — 판금과 사슬 사이 완충층
        const leather = new THREE.MeshStandardMaterial({ color: 0x5a4030, metalness: 0, roughness: 0.85, map: this.leatherTex(), bumpMap: this.leatherTex(), bumpScale: 0.012 });
        // 니어블랙 3종 — 값 구조용(위 DEEP 주석 참조). 스트랩/밑창은 가죽·고무, 개스킷은 살짝 금속기 있는 고무,
        // 판금 밑면(라이닝)은 안쪽이라 환경광을 거의 못 받는 셈이므로 env를 더 죽인다.
        const deepHide = this.deepMat();                                   // 벨트·스트랩·부츠·건틀릿
        const deepGasket = this.deepMat({ metalness: 0.32, roughness: 0.78 }); // 관절 개스킷(고무+흑철)
        const deepLine = this.deepMat({ env: 0.06, roughness: 0.98, side: THREE.DoubleSide }); // 판금 밑면/안감
        const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.95, roughness: 0.3, envMapIntensity: 0.8 });
        const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a4, metalness: 0, roughness: 0.6 });
        R.trimMat = gold;
        // 🔑 **살색 albedo 를 밖으로 연다** — 판정기가 '맨살로 읽히는가'를 재려면 기준이 필요한데,
        //    지금까지는 `probe-ride-seat` 이 **머리로 레이를 쏴서 맞은 표면의 화면색**을 살색 기준으로
        //    삼았다. 그게 실측에서 흔들린다(2026-08-20 3D 스트림): 같은 코드가 탈것에 따라 살(`f2c9a4`)을
        //    맞기도 하고 **투구 흰색(`ffffff`)** 을 맞기도 한다 — 후자면 '살색 = 흰색'이 돼 **밝은 무채색
        //    표면이 전부 맨살로 판정**된다. 재질을 직접 읽으면 조명·포즈와 무관한 고정 기준이 된다.
        R.skinMat = skin;
        // AO 링 — 파츠 경계(목/허리/어깨 소켓/고관절/손목)에 얹는 어두운 접촉 그림자 (비평가: AO 부재)
        // 0.4는 하이키 배경에서 거의 읽히지 않았다(경계 대비 실측) — 값 구조 패스에 맞춰 0.62로 올린다.
        const aoMat = new THREE.MeshBasicMaterial({ color: 0x070a0f, transparent: true, opacity: 0.62, depthWrite: false });
        const aoRing = (r, tube, parent, y, sz) => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 16), aoMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = y;
            if (sz) ring.scale.z = sz; // 토러스 z축=상하 두께 → 납작하게
            parent.add(ring);
            return ring;
        };

        const root = new THREE.Group();

        // ---------- 비례 상수 (hero-chibi, 사용자 지시 2026-08-18) ----------
        // 사용자 지시 "주인공 캐릭터 쨋든 치비 형으로" — 종전 성인 비례(6차 비평가 ㉢, 다리 +55% ·
        // 머리 0.48배 = 두신비 6.93)를 폐기하고 치비(두신비 2.5~3, 큰 머리·짧고 뭉툭한 다리)로 전환.
        // ⚠️ 길이를 리터럴로 흩뿌리지 말 것 — 다리 장갑(쿠이스·가터·그리브)과 부츠가 전부 이 값에
        //    매달려 있어, 한 군데만 바꾸면 판금이 사슬 위에서 떠 버린다. 배율로 함께 끌고 간다.
        const THIGH_L0 = 0.32, SHIN_L0 = 0.275;              // 조정 전 값 (부속 위치의 기준 좌표계)
        const THIGH_L = 0.192, SHIN_L = 0.165;               // ×0.60 — 치비 짧은 다리
        const TS = THIGH_L / THIGH_L0, SS = SHIN_L / SHIN_L0;
        // ⚠️ 전신 높이는 **위 BODY_SCALE 이 1.785 로 되돌린다** — 비례만 바꾸고 크기를 바꾸지 않아야
        //    적 대비·카메라·탈것 안장 높이가 안 끌려간다(`probe-hero-proportion.js` 크기 불변 게이트).

        // ---------- 하체 ----------
        const pelvis = new THREE.Group();
        // 연장분(대퇴 +0.128 · 정강이 +0.110)만큼 골반을 올려 접지면을 그대로 둔다.
        pelvis.position.y = 0.615 + (THIGH_L - THIGH_L0) + (SHIN_L - SHIN_L0);
        root.add(pelvis);
        R.bones.pelvis = pelvis;
        // 골반 장갑(스커트 판) — 앞뒤 곡면 판 + 벨트
        // 상단 0.205→0.19 / 밑단 0.295→0.30 — 흉갑 밑단을 0.163으로 조인 것에 맞춰 스커트 상단도
        // 함께 좁힌다. 안 좁히면 스커트 림이 잘록해진 허리보다 밖으로 튀어나와 허리 꺾임을 덮어버린다.
        // 상수로 뽑아 둔다 — 아래 태싯 스트랩이 스커트 원뿔면 위에 정확히 얹히도록 여기서 역산한다
        // ⚠️ 2026-08-18 6차 비평가 재지적 ㉤(양쪽 합의): "스커트가 완벽한 원형 헴을 가진 원뿔(= 갓등) +
        //    헴이 어깨만큼 넓어 역삼각이 죽는다". 처방 두 가지를 그대로 넣는다.
        //  ⑴ **헴 지름 ≤ 어깨 지름 × 0.62** — 어깨는 어깨폭 ±0.29 + 견갑 반경 0.113 = 지름 0.806.
        //     0.806 × 0.62 = 0.500 → 헴 반경 상한 0.250. SK_BOT 0.30 → **0.248**(비 0.615).
        //  ⑵ **헴을 개별 태싯으로 절개** — 통짜 원뿔은 어느 각도에서도 매끈한 원호 하나라 '갓등'을 못 벗는다.
        //     6장으로 가르고, 간극을 **위 4° → 아래 7°** 로 벌려 틈 자체가 V 로 열리게 한다(처방 4~6° 대역).
        //     전면 중앙(θ=0)은 간극을 2배로 줘 **중앙 V 노치**를 만든다.
        const SK_TOP = 0.19, SK_BOT = 0.248, SK_H = 0.18, SK_Y = -0.045;
        const N_TASSET = 6, SEG_A = (Math.PI * 2) / N_TASSET;
        // 🧊 **voxel 태싯** — (theta, y) 격자를 직접 뜬 매끈 곡면 판을 칸 적층으로 옮긴다.
        //   🚨 **간극을 '각도'로 주면 이 격자에서는 표현이 안 된다 — 조형에 손대기 전에 실측으로 확인했다.**
        //      칸 0.016 이 스커트 상단(r 0.19 = 11.875칸)에서 만드는 각은 **4.83°** 라, 옛 처방의
        //      '위 간극 4°'는 **한 칸보다 좁다**(0.83칸). 그런 값을 각도로 주면 반올림이 각도마다
        //      0칸/1칸으로 갈려 간극이 균일한 틈이 아니라 **톱니**가 된다.
        //      → 간극을 **칸 호길이**로 잡는다: **위 1칸 → 아래 2칸.** 반지름이 커지는 만큼 각도는
        //        저절로 벌어져 **4.83° → 7.39°** 가 되고, 이는 옛 매끈 판의 **4° → 7°** 와 거의 같은
        //        자리다. 물리 폭으로 보면 0.0133 → 0.0303 이 **0.016 → 0.032** 가 된 것이라,
        //        '비례를 그대로 옮겨 적는다'는 이 전환의 전제를 각도가 아니라 폭에서 지킨 셈이다.
        //      ⚠️ 그래서 `probe-tasset` ② 의 '간극 평균 4~6°' 눈금은 이 격자에서 의미가 바뀐다 —
        //        자를 칸 단위로 옮겼다(그쪽 주석 참조). 눈금을 느슨하게 한 게 아니라 **표현 가능한
        //        최소 간극이 4.83°** 라, 4~4.83° 구간은 격자가 만들 수 없는 값이다.
        const VOXC = this.VOX;
        const rTc = SK_TOP / VOXC, rBc = SK_BOT / VOXC;            // 칸 반지름 11.875 → 15.5
        const SK_LAYERS = Math.max(1, Math.round(SK_H / VOXC));    // 층 수 11
        const GAP_C_T = 1, GAP_C_B = 2;                            // 간극(칸 호길이) 위 → 아래
        // 판 하나를 칸으로 적는다. 칸 y: **0 = 밑단**, SK_LAYERS-1 = 상단.
        //   notch0/notch1 = 그 쪽 간극을 2배로(전면 중앙 V 노치). opts.dr = 셸 반경만 밀어내는
        //   오프셋(칸) — 금 테를 한 칸 도톰하게 두를 때 쓴다. **각도는 판 반지름으로 재고 셸만
        //   밀어낸다** — 안 그러면 금 테의 간극이 판보다 좁아져 틈 안으로 금이 비어져 든다.
        //   🚨 **판을 각도로 잘라내면 안 된다 — 초판이 그렇게 했다가 간극이 톱니가 됐다(실측).**
        //      각도 경계로 칸을 걸러내면 경계마다 칸이 다르게 떨어져, 같은 처방인데도 실측 하단
        //      간극이 **180°에서 3.7° · 나머지에서 8.51°** 로 튀었다(한 칸 대 두 칸). 링 자체가
        //      정사각 격자라 방위마다 칸 위상이 다르기 때문이고, 이건 값을 바꿔서 고칠 수 없다.
        //      → 층마다 링의 칸을 **각도순으로 줄 세운 뒤 경계마다 정확히 g칸을 걷어낸다.**
        //        간극이 '각도'가 아니라 '칸 수'로 정의되므로 여섯 경계가 반드시 같아진다.
        //      g 는 층마다 `round(2 → 1)` 이라 아래 절반이 2칸, 위 절반이 1칸인 **계단 V** 가 된다 —
        //      11층에서 1~2칸을 매끈하게 잇는 방법은 없고, 화풍이 요구하는 것도 '굵게 끊긴 계단'이다.
        const buildTassets = (yFrom, yTo) => {
            const plates = [];
            for (let k = 0; k < N_TASSET; k++) plates.push([]);
            for (let j = yFrom; j < yTo; j++) {
                const u = SK_LAYERS === 1 ? 1 : j / (SK_LAYERS - 1);    // 0 = 밑단, 1 = 상단
                const r = rBc + (rTc - rBc) * u;                        // 각도 기준 반지름
                const gap = Math.max(1, Math.round(GAP_C_B + (GAP_C_T - GAP_C_B) * u));   // 걷어낼 칸 수
                const rc = r, m = Math.ceil(rc);
                const ring = [];
                for (let x = -m; x <= m; x++) for (let z = -m; z <= m; z++) {
                    const d = Math.hypot(x, z);
                    if (d > rc || d <= rc - 1) continue;                // 한 칸 두께 셸
                    let th = Math.atan2(x, z);        // 매끈 판과 같은 규약(x = r·sinθ, z = r·cosθ)
                    if (th < 0) th += Math.PI * 2;
                    ring.push({ x, z, th });
                }
                if (!ring.length) continue;
                ring.sort((a, b) => a.th - b.th);
                const n = ring.length, dead = new Array(n).fill(false);
                for (let b = 0; b < N_TASSET; b++) {
                    const beta = b * SEG_A;
                    let bi = 0, best = Infinity;      // 경계에 가장 가까운 칸
                    for (let i = 0; i < n; i++) {
                        let dth = Math.abs(ring[i].th - beta);
                        if (dth > Math.PI) dth = Math.PI * 2 - dth;
                        if (dth < best) { best = dth; bi = i; }
                    }
                    const g = gap * (b === 0 ? 2 : 1);   // θ0 = 정면 중앙만 2배 = V 노치
                    for (let s = 0; s < g; s++) dead[(bi + s - (g >> 1) + n * 2) % n] = true;
                }
                for (let i = 0; i < n; i++) {
                    if (dead[i]) continue;
                    const k = Math.min(N_TASSET - 1, Math.floor(ring[i].th / SEG_A));
                    plates[k].push({ x: ring[i].x, y: j, z: ring[i].z });
                }
            }
            return plates;
        };
        // 칸 y=0 의 **밑면**을 옛 판의 밑단(SK_Y − SK_H/2)에 맞춘다 — 안장 정합(`heroSeatDropY`)이
        // 재는 게 이 밑단이라 여기를 정확히 두고, 대신 윗변이 0.004(¼칸) 낮게 끝나는 걸 받는다
        // (11칸 × 0.016 = 0.176 < 0.18). 윗변은 벨트가 덮는 자리라 화면에서 드러나지 않는다.
        const SK_MESH_Y = SK_Y - SK_H / 2 + VOXC / 2;
        const tassetMat = voxSteel('steelDark');
        // 금 트림의 voxel 판 — 양쪽 비평가가 '되돌리지 말 것'으로 꼽은 골드 트림이라 색·금속감은
        // 원본(0xd9a441 / metal 0.95 / rough 0.3)을 유지하고, env 만 이음새가 보이게 내린다.
        // (아래 다리 판금 블록도 이 인스턴스를 그대로 쓴다 — 톤 재질을 두 벌 만들지 않는다.)
        const goldVox = new THREE.MeshStandardMaterial({
            color: 0xd9a441, metalness: 0.9, roughness: 0.34, envMapIntensity: 0.55,
            vertexColors: true, flatShading: true,
        });
        const steelDarkVox = tassetMat;
        const tassets = [], hemRims = [];
        // 🚨 **금 테를 '한 칸 밖으로 내민 립'으로 만들지 말 것 — 해 보고 캡처에서 되돌렸다.** 칸 단위
        //    돌출은 이 반지름에서 4~6% 라 얇은 테가 아니라 **밑에서 보면 식탁 모서리 같은 차양**으로
        //    찍힌다(`tools/shot-tasset.js` 아래 컷에서 바로 드러났다). voxel 에서 밑단 테의 옳은 형태는
        //    돌출이 아니라 **밑단 한 층을 금색으로 칠하는 것**이다 — 실루엣을 안 건드리고 색만 띠가 된다.
        const bodyVox = buildTassets(1, SK_LAYERS);      // 본체 — 밑단 한 층은 금 테에 내준다
        const rimVox = buildTassets(0, 1);               // 금 테 — 밑단 한 층(같은 셸, 돌출 없음)
        for (let k = 0; k < N_TASSET; k++) {
            const t = this.voxPart(bodyVox[k], tassetMat, { center: false });
            t.position.y = SK_MESH_Y;
            // 🏷 `probe-tasset` 이 판을 **정점 수 21개(7×3 격자)로** 찾고 있었다 — 조형을 바꾸는 순간
            //    눈이 먼다(견갑 전환에서 프로브 셋이 같은 이유로 무너졌다). 태그로 쥐게 한다.
            t.userData.part = 'tasset';
            tassets.push(t);
            // 밑단 금 테 — 통짜 토러스를 쓰면 갈라 놓은 태싯을 다시 한 줄로 이어 붙여 절개가 무의미해진다.
            // 태싯마다 **자기 밑단 호**만 두른다(같은 theta 경계라 정렬이 어긋날 수 없다).
            // voxel 판이라 옛 '반경 +0.004 · 높이 0.018 띠' 를 **밑단 한 층을 한 칸 밖으로 내민 금 립**
            // 으로 옮긴다 — 반 칸짜리 돌출은 이 격자에서 표현이 안 되고(칸 단위가 최소), 한 칸이면
            // 96px 에서도 금 선이 살아 남는다.
            const rim = this.voxPart(rimVox[k], goldVox, { center: false });
            rim.position.y = SK_MESH_Y;
            rim.userData.part = 'tassetRim';   // 본체 판과 구분 — ②는 본체만 센다
            hemRims.push(rim);
        }
        // 스커트 안감 — 판금 셸 바로 안쪽에 니어블랙 원통을 겹쳐 밑단 플레어 아래가 '빈 껍데기'가 아니라
        // 그늘진 두께로 읽히게. 실루엣 하단에 어두운 값 면적을 크게 확보하는 핵심 파츠다.
        // 절개 후에는 역할이 하나 더 생겼다 — **태싯 사이 간극으로 보이는 것이 이 안감**이라, 간극이
        // '배경이 뚫려 보이는 구멍'이 아니라 '판금 밑 그늘'로 읽힌다. 밑단은 SK_BOT 축소에 맞춰 같이 줄인다.
        const skirtLine = new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.240, 0.178, 14, 1, true), deepLine);
        skirtLine.position.y = -0.048;
        // 벨트 — 허리를 실제로 '조이는' 파츠. 폭을 흉갑 밑단(x 0.170)과 스커트 상단(0.19) 사이로 좁히고
        // 높이를 0.07→0.1로 늘려 스커트 상단(월드 0.615)부터 흉갑 밑단(0.715)까지 빈틈 없이 잇는다.
        // 전에는 벨트가 0.2/0.21로 흉갑 밑단(0.192)보다 넓어, 조여야 할 지점이 오히려 몸통의
        // 최대 돌출부였다 — 허리가 안 읽힌 직접 원인.
        const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.176, 0.19, 0.1, 16), deepHide);
        belt.position.y = 0.05;
        belt.scale.z = 0.85;
        const buckle = Voxel.build(Voxel.gem(this.vr(0.04), 0xffffff), { size: this.VOX, material: goldVox, color: 0xd9a441, center: true, jitter: 0.04 }); // 🧊 금 버클 스터드 — 구 → 큐브 젬
        buckle.position.set(0, 0.05, 0.158); // 벨트 z 반경이 0.183×0.85≒0.156이므로 그 위에 얹힘 (벨트 축소 반영)
        buckle.scale.set(1.1, 0.9, 0.45);
        // 벨트에 매달리는 세로 스트랩 2줄 — 골반 앞면에 어두운 세로 분할선을 넣어 판금 덩어리를 끊는다
        // ⚠️ 이 스트랩은 **화면에 한 번도 보인 적이 없는 죽은 지오메트리였다**(앞 세션 부수 발견 ⑨, 미수정).
        //    z 0.196 에 평평하게 세워 뒀는데 같은 높이의 스커트 표면이 0.236 이라 완전히 매몰됐다.
        //    원인은 상수를 눈대중으로 박은 것 — 스커트는 **밑단으로 벌어지는 원뿔**이라 표면 z 가 높이마다
        //    다르고(스트랩 상단 0.177 → 하단 0.262), 기울기 0.12rad 로는 그 33° 경사를 따라갈 수 없다.
        //    → 스커트 상수에서 원뿔면을 역산해 얹는다. 이제 스커트 치수를 바꿔도 스트랩이 따라간다.
        const skirtR = y => SK_TOP + (SK_BOT - SK_TOP) * ((SK_Y + SK_H / 2 - y) / SK_H); // pelvis y → 스커트 반지름
        const STRAP_X = 0.085, STRAP_HALF = 0.065, STRAP_Y = -0.03;
        const strapZAt = y => Math.sqrt(Math.max(1e-6, skirtR(y) * skirtR(y) - STRAP_X * STRAP_X)); // 원형 단면에서 x 만큼 옆으로 간 지점의 z
        const zTop = strapZAt(STRAP_Y + STRAP_HALF), zBot = strapZAt(STRAP_Y - STRAP_HALF);
        for (const sx of [-1, 1]) {
            const tassetStrap = new THREE.Mesh(new THREE.BoxGeometry(0.036, STRAP_HALF * 2, 0.012), deepHide);
            // +0.009 = 스트랩 두께 절반(0.006) + 여유 — 곡면 위에 확실히 얹혀 z-fighting 없이 보이게
            tassetStrap.position.set(sx * STRAP_X, STRAP_Y, (zTop + zBot) / 2 + 0.009);
            tassetStrap.rotation.x = Math.atan2(zTop - zBot, STRAP_HALF * 2); // 원뿔 경사와 평행 (음수 = 위가 뒤로)
            pelvis.add(tassetStrap);
        }
        pelvis.add(...tassets, ...hemRims, skirtLine, belt, buckle);
        // 탑승 정합의 기준점 — 안장에 실제로 닿는 건 골반 뼈가 아니라 **스커트(태싯) 밑단**이다.
        // 골반 기준으로 안장 높이를 역산하면 밑단(약 0.149 아래)이 그만큼 탈것 몸통을 파고든다
        // (mount-ride 비평가 지적 ⓑ). scene3d.heroSeatDropY()가 이 두 파츠에서 낙차를 실측한다.
        // 태싯을 개별 메시로 가르면서 목록도 낱개로 넘긴다 — heroSeatDropY 는 `part.geometry` 가 있는 것만
        // 세므로 그룹으로 묶어 넘기면 통째로 건너뛰어 낙차가 기본값 0.149 로 고정된다.
        R.seatParts = [...tassets, ...hemRims, skirtLine];
        aoRing(0.186, 0.02, pelvis, 0.005, 0.5); // 벨트 아래 접촉 그림자 (벨트 축소 0.2→0.176에 맞춰)

        // 다리: 고관절 → 대퇴 → 무릎 → 정강이 → 부츠 (분절 피벗)
        R.legs = [];
        const mailMat = mail(); // 사지 공용 — 인스턴스를 하나로 묶어 틴트·드로우콜을 아낀다
        // 🧊 **voxel 사지 전용 사슬 재질** — 카울(원통)과 같은 인스턴스를 쓸 수 없어서 따로 만든다.
        //   ⑴ `Voxel.build` 는 색·이음새 AO 를 **정점 색**에 굽는다 → `vertexColors: true` 가 없으면
        //      AO 가 통째로 사라진다. 그런데 정점 색이 없는 지오메트리(카울)에 같은 재질을 물리면
        //      그쪽은 attribute 기본값(0,0,0) 이라 **검게 죽는다** — 그래서 인스턴스를 가른다.
        //   ⑵ **map/bumpMap 을 뺐다.** `Voxel.build` 는 uv 를 만들지 않아서 텍스처를 물리면 한 텍셀만
        //      샘플링돼 무늬가 아니라 단색 곱셈이 된다. 사슬 직조감은 이제 텍스처가 아니라
        //      **칸 크기 + 칸별 색변화(jitter 0.09) + 이음새 AO** 가 낸다(화풍 ⓒⓓ).
        //   ⑶ metalness 를 0.78 → 0.62, env 를 0.25 → 0.20 으로 내렸다. 이 저장소가 이미 실측한
        //      "금속은 albedo 가 아니라 env 반사가 화면값을 지배한다" 가 여기선 독이다 — env 가 세면
        //      정점 색에 구운 AO 가 반사에 씻겨 **이음새가 안 보인다**(= 큐브로 안 읽힌다).
        //   톤 레지스트리에는 그대로 등록하므로 `setTone`·시대 틴트·`gradeHeroGearValue` 는 동일하게 잡는다.
        // 맨살 몸 (사용자 2026-08-21 "옷을 왜 입히냐 기본인데") — 사슬갑옷 → 살색.
        //   era 틴트 안 받게 armorMats 에 안 넣는다(맨살은 시대 무관).
        const mailVoxMat = new THREE.MeshStandardMaterial({
            color: 0xf2c9a4, metalness: 0, roughness: 0.62, envMapIntensity: 0.20,
            vertexColors: true, flatShading: true,
        });
        mailVoxMat.userData.tone = 'skin';
        mailVoxMat.userData.baseColor = mailVoxMat.color.getHex();
        this._toneMats.push(mailVoxMat);
        // voxel 판금 2톤 — 다리 판금(쿠이스·폴린·그리브·라메)이 공유한다. 인스턴스를 하나로 묶어
        // 드로우콜과 톤 스윕 대상 수를 아낀다(원통판 `steel()`/`steelDark()` 는 호출마다 새로 만든다).
        const steelVox = voxSteel('steel');
        // ⚠️ `steelDarkVox`·`goldVox` 는 **스커트 태싯 블록(위)에서 이미 만들어 두고 내려온다** —
        //    태싯이 voxel 로 바뀌면서 그 둘을 먼저 쓰게 됐고, 여기서 다시 만들면 같은 톤의 재질이
        //    두 벌이 되어 `setTone`·시대 틴트가 한쪽만 잡는다(`R.armorMats` 에 둘 다 들어가긴 하나
        //    드로우콜과 톤 스윕 대상이 공연히 는다). 하나만 두고 공유한다.
        for (const side of [-1, 1]) {
            const hip = new THREE.Group();
            hip.position.set(side * 0.13, -0.06, 0);
            const thigh = this.voxLimb(0.085, 0.07, THIGH_L, mailVoxMat);
            thigh.userData.part = 'thigh'; // ㉢ 연장 — 반지름은 그대로라 길수록 가늘어 보인다(성인 비례)
            // 🧊 대퇴 장갑판 — 구(10×8) → 큐브 타원체. 반지름 0.095 와 세로 배율 1.45·TS 를 **칸으로
            //    환산해** 넣는다(scale 로 눌러 만들면 큐브가 직육면체가 된다). 커버 범위·중심은 불변.
            const cuisse = this.voxPart(
                Voxel.ellipsoid(this.vr(0.095), this.vr(0.095 * 1.45 * TS), this.vr(0.095)), steelDarkVox);
            cuisse.userData.part = 'cuisse';
            cuisse.position.y = -0.115 * TS;
            // 대퇴 상단 패딩 링 — 스커트(판금)와 사슬이 맞물리는 경계에 누빔천을 끼워 재질이 3층으로 읽히게
            // 🧊 0.092/0.088 → 0.095/0.0925 (voxel 대퇴 전환). 칸 폭이 홀수라 대퇴 바깥 면이
            //    이 구간에서 0.088 에 서는데, 12각 원통은 각 사이 평평한 면이 반지름×cos15°
            //    = 0.085 까지 들어와 **사슬이 누빔천을 뚫었다**. 평면 기준으로 0.088 을 넘게 잡는다.
            const thighPad = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.0925, 0.055, 12), padding);
            thighPad.position.y = -0.022 * TS;
            // 대퇴 가터 스트랩 — 사슬 위를 감는 니어블랙 띠 (금속 명도 덩어리를 가로로 끊는다)
            const garter = new THREE.Mesh(new THREE.CylinderGeometry(0.089, 0.086, 0.03, 12), deepHide);
            garter.position.y = -0.2 * TS;
            const knee = new THREE.Group();
            knee.position.y = -THIGH_L;
            // 무릎 폴린(poleyn): 슬개 돔 + 측면 팬 윙 + 상하 라메 2겹 — 관절이 '캡슐 이음매'가 아니라 관절 장갑으로 보이게
            // 🧊 슬개 돔 — 구 → 큐브 타원체(축별 배율 1.05/0.95/1.15 를 칸 반지름에 흡수).
            const kneeCap = this.voxPart(
                Voxel.ellipsoid(this.vr(0.062 * 1.05), this.vr(0.062 * 0.95), this.vr(0.062 * 1.15)), steelVox);
            kneeCap.userData.part = 'kneeCap';
            kneeCap.position.z = 0.008;
            // 🧊 폴린 윙 — 반구(theta 0~π/2) → 큐브 타원체의 위쪽 절반. `ellipsoid` 를 만들고 y≥0 만
            //    남기면 원본과 같은 '펼친 원반'이 되고, 회전·위치는 그대로 쓴다.
            const wingVox = Voxel.ellipsoid(this.vr(0.052), this.vr(0.052 * 0.55), this.vr(0.052 * 1.1))
                .filter(v => v.y >= 0);
            const poleynWing = this.voxPart(wingVox, steelDarkVox, { center: false });
            poleynWing.userData.part = 'poleynWing';
            poleynWing.position.set(side * 0.045, -0.006, -0.004);
            poleynWing.rotation.z = side * -1.35; // 바깥쪽으로 펼쳐지는 원반 날개
            // 🧊 무릎 라메 2겹 — 원통(테이퍼) → 큐브 테이퍼. 높이도 칸으로 환산한다.
            const kneeLameUp = this.voxPart(
                Voxel.taper(this.vr(0.068), this.vr(0.072), Math.max(1, Math.round(this.vr(0.026)))), steelVox);
            kneeLameUp.userData.part = 'kneeLame';
            kneeLameUp.position.y = 0.042;
            const kneeLameDn = this.voxPart(
                Voxel.taper(this.vr(0.062), this.vr(0.066), Math.max(1, Math.round(this.vr(0.024)))), steelVox);
            kneeLameDn.userData.part = 'kneeLame';
            kneeLameDn.position.y = -0.044;
            const kneeRivet = Voxel.build(Voxel.box(1, 1, 1, 0xffffff), { size: 0.015, material: goldVox, color: 0xd9a441, center: true, jitter: 0 }); // 🧊 무릎 리벳 — 구 → 큐브
            kneeRivet.position.set(side * 0.052, 0.006, 0.012);
            // 무릎 개스킷 — 라메 2겹 사이로 드러나는 니어블랙 관절 슬리브. 접합부 벌어짐도 함께 가린다.
            const kneeGasket = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.056, 0.088, 12), deepGasket);
            kneeGasket.position.y = -0.002;
            knee.add(kneeGasket, poleynWing, kneeLameUp, kneeLameDn, kneeRivet);
            const shin = this.voxLimb(0.06, 0.052, SHIN_L, mailVoxMat);
            shin.userData.part = 'shin';
            // 정강이 장갑판 (그리브)
            // 🧊 그리브 — 구 → 큐브 타원체(0.95 / 1.7·SS / 0.95 를 칸 반지름에 흡수).
            const greave = this.voxPart(
                Voxel.ellipsoid(this.vr(0.068 * 0.95), this.vr(0.068 * 1.7 * SS), this.vr(0.068 * 0.95)), steelDarkVox);
            greave.userData.part = 'greave';
            greave.position.set(0, -0.128 * SS, 0.012);
            knee.add(greave);
            // ⓒ-2 무릎 아래 판독(mount-ride 비평가 D의 F): 정강이 아래가 mail(0x070a0d)·steelDark·
            // 니어블랙 부츠로만 이어져 **검은 띠**로 뭉개진다 — 사바톤(발끝)까지 밝은 값이 하나도 없다.
            // 처방은 판금 관절이 이미 쓰는 언어의 재사용: 그리브 정면 **능선 키라인**(스틸). 폴린 윙·
            // 사바톤과 같은 밝기라 '장갑판의 하이라이트'로 읽히고, 면이 아니라 선이라 값 구조(다리는
            // 어두운 대역)를 흔들지 않는다. 조형 가드(부츠 4꺾임·평바닥)는 부츠 그룹 밖이라 무관.
            const greaveRidge = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0055, 0.115 * SS * 1.7, 6), steel());
            greaveRidge.position.set(0, -0.128 * SS, 0.012 + 0.068 * 0.95 - 0.004);
            knee.add(greaveRidge);
            // 부츠: 라운드 토 (구+원통 결합) + 강철 사바톤
            // 0x4a3728은 r128의 리니어 해석 + sRGB 출력 + 밝은 가죽 텍스처(#c9b8a6)가 겹쳐 화면에서 살구빛 탄으로 떠
            // 정면·측면샷에서 '맨발'로 읽혔다 — 건틀릿이 이미 겪은 함정(0x6b4e3a → 0x241408)과 같은 원인이라 같은 방식으로 역보정한다.
            // …그런데 0x2a1a0d조차 조명 후 화면 명도 0.35~0.45로 떠, 값 구조 기준(0.10~0.18)에는 여전히 밝다.
            // 부츠는 캐릭터에서 가장 큰 '어두워야 마땅한' 면적이므로 니어블랙(DEEP)으로 내린다.
            // ⚠️ 비평가 잔여 지적 ⓖ: "부츠가 발가락·굽·발목 꺾임 없는 둥근 포드".
            //    원인은 발이 **타원체 한 덩어리**(구 r0.075 를 0.9/0.55/1.55 로 늘린 것)였다는 것이다 —
            //    타원체는 어느 단면을 잘라도 타원이라 발가락도 굽도 만들 수 없고, 목단(0.062→0.072)이
            //    아래로 벌어지며 그 타원으로 바로 흘러내려 발목마저 사라졌다(꺾임 0개).
            // → 실루엣에 꺾임을 4군데 만든다: ① 발목 조임 ② 발등 ③ 가늘어지며 들리는 발가락 ④ 굽 블록.
            // ⚠️ 최하단 y 는 건드리지 않는다 — 이전 밑창·굽의 바닥이 -0.368 이었고 지면 접지가 여기 맞춰져
            //    있다. 새 굽·앞꿈치 밑창 **둘 다 -0.368** 에 맞춰 놓았으니 이 값을 바꾸지 말 것.
            const bootMat = deepHide;
            const bootTop = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.056, 0.082, 10), bootMat); // 아래로 좁아진다(전에는 벌어졌다)
            bootTop.position.y = -0.258;
            // ① 발목 조임 — 0.056 → 0.046 으로 한 번 조인 뒤 발등에서 다시 벌어진다
            const ankleNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.046, 0.036, 12), bootMat);
            ankleNeck.position.y = -0.313;
            // ② 발등·발허리 — 짧고 두껍게. 발 전체를 여기서 끝내지 않는 것이 핵심(전에는 이게 발 전부였다).
            const midFoot = new THREE.Mesh(new THREE.SphereGeometry(0.066, 10, 8), bootMat);
            midFoot.position.set(0, -0.330, 0.028);
            midFoot.scale.set(0.92, 0.55, 1.25);
            // ③ 발가락 — 발등보다 **가늘고**(반폭 0.045 < 0.061) 끝이 살짝 들린다(토 스프링).
            //    rotation.x 음수라야 앞쪽이 올라간다(+z 점의 y' = -z·sinθ).
            const toe = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 7), bootMat);
            toe.position.set(0, -0.3295, 0.113);
            toe.scale.set(0.86, 0.48, 1.05);
            toe.rotation.x = -0.14;
            // 사바톤(발등 판금) + 발목 라메 — 관절 장갑(폴린·쿠터)과 같은 언어로 발끝까지 마감
            const sabaton = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), steel());
            sabaton.position.set(0, -0.322, 0.070);
            sabaton.scale.set(0.95, 0.62, 1.55);
            sabaton.rotation.x = -0.10;                      // 발가락 들림과 같은 각으로 얹힌다
            const ankleLame = new THREE.Mesh(new THREE.CylinderGeometry(0.060, 0.066, 0.026, 12), steelDark());
            ankleLame.position.y = -0.296;
            // ④ 굽 — 뒤쪽만 아래로 내려간 블록. 앞꿈치 밑창과 **분리**돼 있어 옆에서 보면 그 사이가
            //    아치로 떠 보인다. 이게 발바닥선의 꺾임이고, 통짜 밑창 하나로는 절대 안 생긴다.
            const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.040, 0.045, 0.036, 8), deepGasket);
            heel.position.set(0, -0.3495, -0.030);
            heel.scale.set(1.05, 1, 1.15);
            // 앞꿈치 밑창 — 니어블랙 판. 지면 접지선을 어둡게 눌러 캐릭터가 '떠 있지 않게' 하고,
            // 실루엣 최하단(카메라가 내려다보므로 실제로 보이는 면)에 확실한 다크 앵커를 준다.
            // ⚠️ 반구(SphereGeometry 아래 절반)였다 — 그래서 바닥이 **곡면**이라 접지가 선이 아니라 점이었다.
            //    비평가가 "밑창 슬래브 없음, 매끈한 콩"이라 지적했고 **실측으로 확인됐다**
            //    (probe-boot-profile.js 신설: 접지선 평탄도 = 최저행 ±1px 가로길이 ÷ 발길이 = 28/119 = 0.235).
            //    같은 지적의 나머지 둘은 오측정이었다 — 발목 조임 27.1%, 뒤꿈치 수직면 40px 로 둘 다 실재한다.
            // → 바닥이 평평한 원통 슬래브로 교체. 갑피(발등 반폭 0.061)보다 사방으로 조금 넓게(0.063) 잡아
            //    밑창이 갑피 밖으로 돌출하게 한다 — 실제 신발의 웰트가 그렇고, 옆에서 볼 때 접지선이 산다.
            const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.016, 14), deepGasket);
            sole.position.set(0, -0.3596, 0.088);      // 바닥 -0.3676 — 굽과 같은 높이 (접지 회귀 방지)
            sole.scale.set(1.02, 1, 1.40);
            // 접지 접촉 암부(㉡) — 사바톤·발가락이 밝은 스틸이라 발이 지면에 '닿는' 자리에 그늘이 0이다
            //    (`probe-contact-ao.js`: 부츠 접지 창 최소 L ~100). 지면 블롭(scene3d)은 소프트하고 발에서
            //    떨어져 있어 접촉 단서가 못 된다. 발등·발가락 **밑면**을 감싸는 납작한 니어블랙 링을 얹어
            //    갑피가 사바톤 밑으로 말려 들어가는 그늘을 직접 만든다(관절 aoRing 과 같은 언어, 무조명).
            //    sole 바닥(-0.3676)보다 살짝 위(-0.352)에 둬 접지선을 가리지 않고 밑면만 어둡게 한다.
            const footAO = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.03, 6, 16), aoMat);
            footAO.rotation.x = Math.PI / 2;
            footAO.position.set(0, -0.352, 0.075);
            footAO.scale.set(1.05, 1.42, 0.34);       // z(상하 두께) 납작 · y(전후) 길게 — 발 형상 추종
            // ⓒ-2 부츠 커프 — 부츠 상단에 스틸 밴드+골드 버클 한 점. 정강이(사슬)↔부츠(니어블랙)
            // 경계에 명도 단차를 세워 '검은 막대'가 '사슬 정강이 + 부츠'로 갈라져 읽히게 한다.
            // ankleLame(발목 라메)와 같은 관절 장갑 언어. ⚠️ 부츠 기존 파츠 좌표는 한 자도 안 건드린다
            // (probe-boot-profile 확정 형상) — 커프는 bootTop 윗단(−0.217) 바로 밑에 **추가**만 한다.
            const bootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.0645, 0.0605, 0.018, 12), steel());
            bootCuff.position.y = -0.2265;
            const cuffBuckle = Voxel.build(Voxel.box(1, 1, 1, 0xffffff), { size: 0.013, material: goldVox, color: 0xd9a441, center: true, jitter: 0 }); // 🧊 부츠 커프 버클 — 구 → 큐브
            cuffBuckle.position.set(0, -0.2265, 0.060);
            // ㉢ 연장 후에도 **부츠 조형은 한 자도 건드리지 않는다** — 4꺾임 실루엣(발목·발등·발가락·굽)과
            // 평바닥 밑창은 `probe-boot-profile.js` 가 지키는 확정 형상이라, 좌표를 개별로 다시 계산하면
            // 그 판정이 통째로 무너진다. 그래서 **부츠 전체를 한 그룹으로 묶어 정강이 연장분만큼 내린다**
            // (그룹 안 로컬 좌표는 그대로 → 형상·접지선 평탄도·발AO 링 위치 관계가 전부 보존된다).
            // ⚠️ 내리기만 하면 **부츠가 사라진다** — 실제로 첫 판에서 그렇게 됐다(캡처로 확인). 다리가
            // 55% 길어졌는데 발은 그대로라, 부츠가 다리에서 차지하는 세로 비중이 17% → 11% 로 떨어져
            // 정강이가 '발 없는 막대'로 읽혔다. 발을 함께 키워 비중을 되돌린다(BOOT_S).
            // 키우는 기준점은 **부츠 상단**(로컬 y −0.217 = bootTop 윗면)이다 — 여기를 고정해야
            // 정강이 밑단과의 겹침(조형이 기대는 이음매)이 배율과 무관하게 유지된다. 밑창이 더 내려가는
            // 만큼은 마지막 접지 보정(bbox 기반)이 알아서 흡수한다.
            const BOOT_S = 1.28, BOOT_ANCHOR = -0.217;
            const footG = new THREE.Group();
            footG.scale.setScalar(BOOT_S);
            footG.position.y = -(SHIN_L - SHIN_L0) + BOOT_ANCHOR * (1 - BOOT_S);
            footG.add(bootTop, ankleNeck, midFoot, toe, sabaton, ankleLame, sole, heel, footAO, bootCuff, cuffBuckle);
            knee.add(kneeCap, shin, footG);
            hip.add(thigh, thighPad, garter, cuisse, knee);
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
        // ⚠️ 프로파일 재작성 (비평가 1위 '몸통이 달걀, 허리가 없어 눈사람 스택'). 이전 프로파일은
        //    [0.185,0] [0.225,0.09] [0.245,0.2] [0.235,0.3] [0.19,0.4] [0.12,0.46] 로,
        //    **최대 반지름이 y 0.2 = 흉갑 높이의 43%** 에 있었다. 즉 가장 굵은 곳이 배였고 밑단(0.185)이
        //    최대폭의 76%밖에 안 좁아져 허리가 읽히지 않았다 — 아래에서 위로 부풀다가 다시 좁아지는
        //    곡선은 정의상 달걀이다. 신설 `probe-torso-profile.js` 실측: 허리÷가슴 0.94(달걀 판정선 1.0).
        // → 최대 반지름을 y 0.345 = **높이의 74%(가슴)** 로 올리고 밑단을 0.163까지 조여
        //    허리÷가슴을 0.64로 만든다. 그래야 골반 플레어 → 잘록한 허리 → 부푼 가슴 → 어깨선의
        //    4단 꺾임이 생긴다(전에는 꺾임이 1개였다).
        const prof = [
            [0.163, 0],      // 허리 — 벨트에 조여지는 가장 좁은 지점
            [0.171, 0.05],
            [0.196, 0.12],   // 갈비 아래
            [0.228, 0.21],
            [0.249, 0.30],
            [0.254, 0.345],  // 가슴 최대폭 — 흉갑 높이의 74% 지점
            [0.243, 0.395],
            [0.196, 0.435],  // 어깨 요크로 수렴
            [0.132, 0.465],
        ];
        // ⚠️ 측면 S자 프로파일 (비평가 잔여 지적 ⓔ "정면은 해소됐고 측면만 남았다 — 균일 깊이 달걀").
        //    라테는 **정의상 회전체**라 위 prof 반지름을 아무리 다듬어도, scale.z 를 아무리 눌러도
        //    옆에서 본 실루엣의 **중심선은 완벽한 수직 직선**이다 — 즉 측면은 언제나 앞뒤 대칭 달걀이다.
        //    실측(신설 `probe-torso-profile.js side`): 중심선 이동폭 8px 이지만 단조 증감이 아닌 ±노이즈,
        //    깊이 프로파일도 폭 프로파일의 상수배(허리÷가슴 깊이 0.561 ≒ 폭비 0.64)일 뿐이었다.
        //    → 고치는 방법은 하나뿐: **높이별 z 오프셋**. 흉곽을 앞으로 내밀고 요추를 뒤로 당겨
        //    (사람 몸통의 실제 시상면 곡선) 중심선 자체를 휘게 한다. 깊이 배수도 함께 갈라
        //    가슴은 두껍게·허리는 얇게 눌러 '같은 비율로 축소된 같은 타원'이 되지 않게 한다.
        // ⚠️ 오프셋 상한은 **벨트**가 정한다 — 허리를 뒤로 너무 밀면 흉갑 뒷면이 벨트(z 반경 0.15) 밖으로
        //    튀어나와 판금이 가죽을 뚫는다. 허리 z 반경 0.163×0.8×0.85=0.111 + 오프셋 0.016 = 0.127 < 0.15.
        const TORSO_TOP = 0.465;                 // 라테 최상단 y (제어점 t 정규화 기준)
        const CUIRASS_SZ = 0.8;                  // 아래 scale.z 와 반드시 같은 값 (부착물 z 계산에 재사용)
        const TZ = [                             // [t, 깊이배수, z오프셋] — 허리(뒤·얇게) → 가슴(앞·두껍게) → 어깨(복귀)
            [0.00, 0.85, -0.020],
            [0.26, 0.90, -0.012],
            [0.50, 0.98, 0.006],
            [0.74, 1.04, 0.020],                 // 가슴 최대폭 지점 = 최대 전방 돌출
            [1.00, 0.96, 0.010],
        ];
        const torsoZ = t => {
            t = Math.min(1, Math.max(0, t));
            for (let i = 1; i < TZ.length; i++) {
                if (t <= TZ[i][0]) {
                    const a = TZ[i - 1], b = TZ[i], k = (t - a[0]) / (b[0] - a[0]);
                    const s = k * k * (3 - 2 * k);   // smoothstep — 제어점에서 각지지 않게
                    return { d: a[1] + (b[1] - a[1]) * s, o: a[2] + (b[2] - a[2]) * s };
                }
            }
            const l = TZ[TZ.length - 1];
            return { d: l[1], o: l[2] };
        };
        const profR = y => {                     // prof 제어점 사이 반지름 선형 보간 (부착물 접지 계산용)
            if (y <= prof[0][1]) return prof[0][0];
            for (let i = 1; i < prof.length; i++) {
                if (y <= prof[i][1]) {
                    const a = prof[i - 1], b = prof[i];
                    return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
                }
            }
            return prof[prof.length - 1][0];
        };
        // 흉갑 표면의 앞면 z (spine 로컬) — 문장·스트랩처럼 흉갑에 '붙는' 파츠가 새 곡면을 따라가게 한다.
        // 이걸 안 하면 가슴을 앞으로 내민 만큼 문장이 판금 **속으로 매몰**된다(tassetStrap 이 정확히 그렇게 죽어 있었다).
        // x 를 주면 그 지점의 타원 단면 깊이까지 반영한다 — 오프셋 o 는 곡면 전체의 평행이동이라
        // 타원 보정 **밖**에 있어야 한다(안에 넣으면 중심에서 멀어질수록 S자 오프셋이 사라진다).
        const torsoSurfZ = (y, x) => {
            const m = torsoZ(y / TORSO_TOP), r = profR(y);
            const k = x ? Math.sqrt(Math.max(0, 1 - Math.pow(x / (1.04 * r), 2))) : 1;
            return (r * m.d * k + m.o) * CUIRASS_SZ;
        };
        // 🧊 **흉갑 = 큐브 회전체** (LatheGeometry 22세그 → `Voxel.shell`). 화면 점유 단일 최대 파츠라
        //    여기가 안 바뀌면 영웅은 계속 매끈한 달걀로 읽힌다.
        //    ⚠️ **위 `prof` 숫자를 그대로 쓴다** — `Voxel.shell` 이 링 목록을 받는 이유가 정확히 이것이다
        //       (실루엣을 다시 디자인하지 않는다. 허리÷가슴 0.657, 가슴 최대폭 74% 지점이 그대로 산다).
        //    ⚠️ **옛 `mesh.scale(1.04, 1.08, 0.8)` 을 그대로 옮기면 안 된다** — 비등방 scale 은 큐브를
        //       직육면체로 누른다(`probe-vox-plate` ② 가 잡는다). 세 배율을 전부 **링 치수에 흡수**한다:
        //       x 배율 → rx, y 배율 → 링 y, z 배율·깊이배수·S자 오프셋 → rz 와 z 중심.
        //    ⚠️ **S자(측면 중심선)는 칸 단위로 계단이 된다.** 오프셋 −0.020~+0.020 에 z배율 0.8 을 물리면
        //       ±0.016 = **±1칸**이라 이동폭이 2칸으로 양자화된다 — 렌더 배율에서 약 7px 로, 옛 실측
        //       7px 과 같은 폭이다(`probe-torso-profile side` 의 'S자면 6px 이상' 기준선을 지킨다).
        //       칸을 더 키우면 이 S자가 통째로 사라지므로 `VOX` 를 올릴 때 이 판정을 반드시 다시 볼 것.
        const CU_SX = 1.04, CU_SY = 1.08;        // 옛 scale.x / scale.y — 칸 치수로 흡수한다
        const cuRings = prof.map(([r, y]) => {
            const m = torsoZ(y / TORSO_TOP);
            return {
                y: this.vr(y * CU_SY),
                rx: this.vr(r * CU_SX),
                rz: this.vr(r * m.d * CUIRASS_SZ),
                z: this.vr(m.o * CUIRASS_SZ),
            };
        });
        // `shell` 은 마지막 링의 층을 안 만든다(구간 [y_i, y_{i+1}) 를 채운다) — 한 칸짜리 닫는 링을 더한다.
        cuRings.push(Object.assign({}, cuRings[cuRings.length - 1], { y: cuRings[cuRings.length - 1].y + 1 }));
        // 🚨 **`hollow` 를 쓰지 않는다 — 한 번 썼다가 되돌렸다. voxel.js 가 정확히 이 함정을 적어 뒀다.**
        //    "겉면 칸만 남기니 면 수는 같고 칸만 준다"고 생각했는데 **반대다**: 면 제거 규칙이 이미
        //    속 칸의 면을 전부 버리고 있어서 **속 칸의 렌더 비용은 0** 이고, 파내는 순간 **공동의
        //    안쪽 벽이 새 면으로 생긴다**(voxel.js 의 `hollow` 위 주석 — 6³ 예시에서 216면 → 312면).
        //    실측도 같았다: 흉갑 `hollow` 16,968 tri → 솔리드 **8,700 tri**(-49%). 속이 비어야 하는
        //    조형은 파내는 게 아니라 `ring`/`taper({t})` 로 처음부터 비워서 만드는 것이 이 저장소 규약이다.
        //    (`t` 로 관을 만드는 쪽도 답이 아니다 — 위아래가 뚫려 목 구멍으로 안쪽 면이 보인다.)
        const cuirass = this.voxPart(Voxel.shell(cuRings), steelVox, { center: false });
        cuirass.userData.part = 'cuirass';
        // 목 링 — 고젯 라메 스택(아래 collar*)의 **맨 밑 테**. 스택이 흉갑에 얹히는 지점을 매듭짓는다.
        // ⚠️ 위치·굵기는 스택 최하단(y 0.434, r 0.133)에서 역산한 값이다. 스택 치수를 바꾸면 같이 옮길 것 —
        //    예전 값(y 0.45 · major 0.1 · tube 0.032)은 스택 한가운데를 뚫고 나온다.
        //    스택 최하단은 y 0.432 · r 0.099 이므로 그 바로 밑에 같은 반경으로 앉힌다.
        // 🧊 목 링 — 토러스 → 큐브 링(`Voxel.ring`). 바깥 반경 = major 0.101 + tube 0.021 = 0.122,
        //    두께·높이 = tube 지름 0.042. 토러스가 XZ 평면에 눕는 회전(rotation.x)은 `ring` 이
        //    처음부터 그 평면이라 **필요 없어졌다**(회전을 남겨 두면 링이 세로로 선다).
        const gorget = this.voxPart(
            Voxel.ring(this.vr(0.122), this.vr(0.042), Math.max(1, Math.round(this.vr(0.042)))), steelDarkVox);
        gorget.userData.part = 'gorget';
        gorget.position.y = 0.428;
        // 가슴 문장 (등급 발광용)
        R.emblemMat = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.6, roughness: 0.32 });
        R.emblemMat.vertexColors = true;   // voxel 조형은 색·AO 를 정점 색에 싣는다(이 재질은 영웅 문장 전용)
        R.emblemMat.flatShading = true;
        // 🧊 문장 — 구 + `scale.z 0.4` → 납작한 큐브 타원체(z 배율을 칸 반지름에 흡수).
        const emblem = this.voxPart(
            Voxel.ellipsoid(this.vr(0.055), this.vr(0.055), this.vr(0.055 * 0.4)), R.emblemMat);
        emblem.userData.part = 'emblem';
        // z 상수(0.2)를 곡면 계산으로 교체 — 가슴이 앞으로 나온 만큼 문장도 따라 나와야 매몰되지 않는다
        emblem.position.set(0, 0.3, torsoSurfZ(0.3) + 0.002);
        // 🧊 문장 테 — 토러스 → 큐브 링. 이건 **가슴을 향해 서 있는** 링이라(원본에 회전이 없다)
        //    XZ 평면으로 나오는 `ring` 을 `rotX` 로 한 번 세운다.
        const emblemRim = this.voxPart(
            Voxel.rotX(Voxel.ring(this.vr(0.072), this.vr(0.024), Math.max(1, Math.round(this.vr(0.024)))), 1), goldVox);
        emblemRim.userData.part = 'emblemRim';
        emblemRim.position.copy(emblem.position);
        // 고젯 안쪽 — 목 링 안에 니어블랙 원통을 세워 목-흉갑 사이가 뚫린 밝은 틈이 아니라
        // 깊은 그늘로 읽히게. 캐릭터 상단부의 유일한 다크 앵커라 실루엣 판독에 크게 기여한다.
        const gorgetIn = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.092, 0.1, 12, 1, true), deepLine);
        gorgetIn.position.y = 0.452;
        // 가슴 가로 스트랩 — 흉갑 위를 사선으로 지나는 니어블랙 띠 (밝은 판금 덩어리를 분할)
        const chestStrap = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.3, 0.014), deepHide);
        // x 가 중심에서 벗어난 만큼 그 지점의 곡면 z 는 얕아진다(타원 단면) — 그 보정까지 넣어야
        // 스트랩이 위쪽에서만 뜨고 아래쪽에서 파묻히는 일이 없다.
        chestStrap.position.set(-0.055, 0.26, torsoSurfZ(0.26, -0.055) + 0.004);
        chestStrap.rotation.set(-0.14, 0, 0.42);
        // 어깨 요크(클라비클 플레이트) — 흉갑 상단이 한 점으로 수렴해 두상이 몸통에 바로 얹힌
        // '눈사람'으로 읽히던 문제의 나머지 절반. 허리를 조이는 것만으로는 상단이 여전히 뾰족하다.
        // 가슴에서 견갑 안쪽(x ±0.2)까지 **수평으로** 잇는 납작한 판을 얹어 몸통이 어깨선으로 끝나게 한다.
        // x 확장 0.251 > 견갑 내측 0.2 이므로 둘 사이의 빈 틈(달걀 어깨의 실체)이 실제로 메워진다.
        // 🧊 어깨 요크 — 잘린 구(theta 0~0.58π) + `scale(1.62, 0.5, 0.92)` → 큐브 타원체를 같은
        //    자리에서 자른 것. 세 배율은 칸 반지름에 흡수하고, 자르는 높이는 원본과 같은 식으로 낸다:
        //    theta 0.58π 까지 = y/ry ≥ cos(0.58π) = −0.2487.
        const YK_R = 0.155, YK = [1.62, 0.5, 0.92];
        const yRy = this.vr(YK_R * YK[1]);
        let yokeVox = Voxel.ellipsoid(this.vr(YK_R * YK[0]), yRy, this.vr(YK_R * YK[2]))
            .filter(v => v.y >= Math.cos(Math.PI * 0.58) * yRy);
        // 🚨 **옛 `yokeLine`(니어블랙 반구 껍데기)을 지웠다 — 되살리지 말 것.** 그건 요크가 두께 없는
        //    **면**이라 "종잇장으로 읽힌다"는 지적을 메우려고 안쪽에 덧댄 가짜 두께였다. voxel 요크는
        //    속이 찬 덩어리라 밑면이 실제로 존재하고 이음새 AO 까지 붙으므로 그 역할이 사라진다.
        //    게다가 매끈한 구(r 0.15)를 계단진 voxel(r 0.155) 안에 두면 여유가 0.005 뿐이라
        //    **칸 반올림(최대 0.008)에 그대로 뚫고 나온다** — 남겨 두는 쪽이 오히려 회귀였다.
        //    대신 두께 판독은 **맨 아랫층을 어둡게 굽는 것**으로 낸다(같은 메시 = 드로우콜 추가 0).
        //    ⚠️ 색은 절대값이 아니라 **곱셈 계수**여야 한다 — 재질 색을 시대 틴트가 바꾸므로,
        //       여기에 검정을 박으면 틴트가 바뀌어도 테만 안 따라와 붕 뜬다.
        {
            const yb = Voxel.bounds(yokeVox).y0;
            yokeVox = Voxel.recolor(yokeVox, v => (v.y === yb ? 0x4a4a4a : 0xffffff));
        }
        const yoke = this.voxPart(yokeVox, steelVox);
        yoke.userData.part = 'yoke';
        yoke.position.y = 0.375;
        spine.add(cuirass, gorget, gorgetIn, chestStrap, emblem, emblemRim, yoke);
        aoRing(0.1, 0.022, spine, 0.435, 0.5);   // 목 링 아래 접촉 그림자
        aoRing(0.172, 0.02, spine, 0.005, 0.5);  // 흉갑 밑단-허리 경계 (밑단 0.185→0.163 조임에 맞춰 축소)
        aoRing(0.235, 0.018, spine, 0.352, 0.45); // 요크 밑면-가슴 경계 — 어깨선 아래 접촉 그림자

        // 망토 — 어깨 뒤에서 늘어지는 곡면 판 (걷기/공격 시 스윙)
        // 직조 텍스처 + 스캘럽 밑단 + 위 모서리 라운딩 + 어두운 안감(깊이감) + 금 클래스프
        const makeCapeGeo = () => {
            const geo = new THREE.PlaneGeometry(0.44, 0.6, 10, 12);
            const p = geo.attributes.position;
            const kArr = new Float32Array(p.count); // 정점별 세로 계수(0=어깨,1=밑단) — 프레임별 천 물결의 진폭 가중치
            for (let i = 0; i < p.count; i++) {
                const x = p.getX(i), y = p.getY(i);
                const k = 0.5 - y / 0.6;                        // 0(위) → 1(아래)
                kArr[i] = k;
                let nx = x * (0.55 + k * 0.75);                 // 위는 좁게(어깨 폭), 아래로 퍼짐
                const edge = Math.abs(x) / 0.22;                // 0(중앙)→1(가장자리)
                if (k < 0.12) nx *= 0.75 + 2.1 * k;             // 위 모서리가 어깨 안쪽으로 말려 들어감(뾰족귀 제거)
                p.setX(i, nx);
                // 밑단 스캘럽: 아래 12%에서 물결로 y를 끌어올림
                if (k > 0.88) p.setY(i, y + Math.sin(x * 46) * 0.022 * ((k - 0.88) / 0.12));
                p.setZ(i, -Math.abs(x) * (0.45 + k * 0.9)       // 좌우가 뒤로 말리는 원통 곡률
                    - Math.sin(k * Math.PI) * 0.035
                    + Math.sin(x * 33 + k * 2.2) * 0.052 * k);  // 세로 드레이프 주름 심화 — 0.034는 정지샷에서 '강체 판자'로 읽힘 (비평가 6.9 6번)
            }
            geo.computeVertexNormals();
            geo.userData.kArr = kArr;
            return geo;
        };
        R.capeMat = new THREE.MeshStandardMaterial({ color: 0x8c2a2a, metalness: 0, roughness: 0.92, side: THREE.DoubleSide, map: this.capeTex() }); // 천 — 무광 직물
        const cape = new THREE.Mesh(makeCapeGeo(), R.capeMat);
        // 천 시뮬 흉내: 베이스 정점을 저장해 두고 update()가 매 프레임 이동파를 얹음 (비평가: '판자 망토')
        R.capeMesh = cape;
        R._capeBase = cape.geometry.attributes.position.array.slice();
        R._capeK = cape.geometry.userData.kArr;
        R._capePhase = 0;
        const capeG = new THREE.Group();
        capeG.position.set(0, 0.42, -0.16);
        cape.position.y = -0.31;
        capeG.add(cape);
        // 다크 라이닝 — 같은 지오메트리 공유(천 시뮬 동기 무료)로 살짝 뒤에 겹쳐 실루엣 가장자리에서 두께로 읽힘 (비평가 7.1 6번 '종이 망토')
        // 0x4d1616는 조명 후 0.3대라 '어두운 붉은 천'일 뿐 값 구조에는 기여하지 못했다 — 니어블랙으로 내리되
        // 순수 무채색이 아니라 아주 약한 적색기를 남겨 망토와 같은 옷감 계열로 읽히게 한다.
        const lining = new THREE.Mesh(cape.geometry, this.deepMat({ color: 0x0a0407, roughness: 1, env: 0.05, side: THREE.DoubleSide }));
        lining.position.set(0, -0.31, -0.014);
        lining.scale.set(1.03, 1.012, 1);
        capeG.add(lining);
        capeG.rotation.x = 0.14;
        // 클래스프: 양어깨 금 원판 + 가슴을 가로지르는 가죽 스트랩
        for (const sx of [-1, 1]) {
            const clasp = Voxel.build(Voxel.gem(this.vr(0.035), 0xffffff), { size: this.VOX, material: goldVox, color: 0xd9a441, center: true, jitter: 0.04 }); // 🧊 어깨 클래스프 원판 — 구 → 큐브 젬
            clasp.position.set(sx * 0.13, 0.04, 0.02);
            clasp.scale.z = 0.5;
            capeG.add(clasp);
        }
        spine.add(capeG);
        capeG.visible = false;   // 망토 제거 (사용자 2026-08-21 "망토 없애고")
        R.bones.cape = capeG;

        // 팔: 견갑(2겹 셸) → 상완 → 팔꿈치 → 하완+건틀릿 → 손
        R.arms = [];
        for (const side of [-1, 1]) {
            const shoulder = new THREE.Group();
            shoulder.position.set(side * 0.29, 0.385, 0); // 어깨 폭 15% 추가 확장 — 역삼각 실루엣 (비평가 지적)
            // 견갑 — 라메(판금 밴드) 3겹 셸 (관절과 함께 회전)
            // ⚠️ 비평가 잔여 지적 ⓔ: "견갑이 문자 그대로 구 2개 — 요크가 만든 수평선 위에 다시 둥근
            //    스택을 얹는다". 반구가 반구로 읽히는 이유는 실루엣에 **꺾임이 하나도 없기** 때문이다
            //    (반구는 어느 각도에서 봐도 같은 원호라 크기만 바뀐다). 그래서 이전 세션들이 반지름을
            //    줄이고(0.105) 각도를 눕혀도 '작은 구'가 됐을 뿐 판금으로 넘어가지 못했다.
            // → 처방대로 **아래로 각진 라메 밴드**로 교체한다: ① 캡을 라테로 깎아 윗면은 눕히고
            //    어깨 모서리에서 급강하시켜 실루엣에 꺾임을 만들고 ② 그 아래를 바깥으로 벌어지는
            //    원뿔대 밴드 2겹으로 덮되 ③ 밴드마다 밑단 림(밝은 금속 테)과 니어블랙 안감을 붙여
            //    경계마다 명암 띠가 생기게 한다. 구는 매끈한 그라디언트 하나지만 라메는 띠가 3줄이다.
            const pauldronG = new THREE.Group();
            // 파츠 식별 태그 — 프로브가 `shoulder.children` 순서에 기대지 않게 한다(순서로 찾으면
            // 파츠를 하나 더 붙이는 순간 조용히 엉뚱한 걸 잰다). ⚠️ **설계 상수는 넣지 말 것** —
            // 여기 든 값을 읽어 판정하면 '의도'만 확인하고 실제 지오메트리는 못 본다(이 저장소가
            // `probe-tasset` 에서 이미 밟은 함정). 태그는 **이름표일 뿐** 이고 치수는 정점에서 잰다.
            pauldronG.userData.part = 'pauldron';
            pauldronG.position.set(side * 0.012, 0.012, 0);
            pauldronG.rotation.z = side * 0.3;  // 바깥으로 흘러내리는 견갑 각
            // 캡(최상단 라메) — 윗면 거의 수평 → 어깨 모서리에서 급강하. 이 꺾임이 '구가 아님'의 핵심.
            // ⚠️ 2026-08-18 6차 비평가 재지적 ㉣(양쪽 합의)로 아래 밴드 구성을 뒤집었다.
            //    A: "속이 비어 있는 원뿔 = 갓등, 밑면 캡이 없어 내부 면이 보인다" / B: "동일 반경 링 균등 적층 = 아코디언 호스".
            //    직전 판은 밴드가 **아래로 갈수록 넓어졌다**(0.099 → 0.110 → 0.119). 그게 정확히 갓등이다 —
            //    실제 스폴더의 라메는 어깨 캡이 가장 넓고 팔을 따라 **좁아지며** 내려간다.
            //    처방 교집합대로 ① 반경비를 1.0 / 0.85 / 0.72 로 벌리고 ② 각 장을 바깥-아래로 14°씩 누적 회전시켜
            //    동축 튜브가 아니라 삼각근을 타고 흘러내리는 판으로 만들고 ③ 밑면 캡을 닫는다.
            const PR = 0.113;                       // 캡 최대 반경(=1.0 기준). 직전 최대 0.119 보다 좁다 — 실루엣 폭은 안 키운다.
            const capPts = [];
            for (const [r, y] of [[0.005, 0.062], [0.043, 0.058], [0.077, 0.047], [0.101, 0.026], [0.110, 0.002], [PR, -0.020]])
                capPts.push(new THREE.Vector2(r, y));
            // 🧊 **캡 voxel 전환** — 라테 회전체 → 같은 프로파일 숫자를 **칸으로 환산한** 큐브 회전체.
            //    실루엣을 다시 디자인하지 않는다는 게 이 전환의 전제라 위 capPts 는 한 자도 안 바꾼다.
            //    `center: false` 로 굽고 밑단(프로파일 최저 y)을 직접 맞춘다 — center 를 쓰면 층 수
            //    반올림에 따라 중심이 움직여 밴드 체인의 기준점(lastY)이 흔들린다.
            const CAP_BASE = -0.020;                // capPts 의 최저 y = 캡 밑단
            let capVox = Voxel.revolve(capPts.map(v => [this.vr(v.x), (v.y - CAP_BASE) / this.VOX]));
            // 두께 판독 — 맨 아랫층을 **곱셈 계수**로 어둡게 굽는다(규약 ⑸). 옛 `pCapLine`(캡 안감)이
            // 하던 일이고, 그 가짜 안감은 지웠다: voxel 캡은 속이 차 밑면이 실재하는데 매끈한 안감을
            // 계단진 겉면 안에 두면 칸 반올림(최대 반 칸 = 0.008)에 그대로 뚫고 나온다(요크에서 겪은 것).
            { const b = Voxel.bounds(capVox).y0; capVox = Voxel.recolor(capVox, v => (v.y === b ? 0x4a4a4a : 0xffffff)); }
            const pCap = this.voxPart(capVox, steelVox, { center: false });
            // 🏷 **본체 판(라메) 표식** — `probe-pauldron` ② 가 이 태그로 판만 쥐고 **구워진 정점에서**
            //    실루엣 반폭 프로파일을 잰다. 림(장식 테)·안감·아웃라인은 태그가 없어 빠진다.
            //    태그는 이름표일 뿐이고 치수는 정점에서 나온다(설계 상수를 읽는 자 함정 회피).
            pCap.userData.part = 'pauldronPlate';
            pCap.position.y = CAP_BASE + this.VOX * 0.5;   // 칸 y=0 의 **밑면**을 캡 밑단에 맞춘다
            pauldronG.add(pCap);
            // 라메 밴드 2겹 — 반경비 0.85 · 0.72, 각 장 14° 씩 바깥-아래 누적 회전.
            // 회전을 누적시키려고 밴드를 **중첩 그룹 체인**으로 단다(부모 장의 기울기를 물려받아야
            // '한 장씩 꺾여 흘러내리는' 판이 된다 — 형제로 달면 각도만 다른 링 3개가 되어 아코디언 그대로다).
            const LAME_TILT = 0.245;                // ≈14° (처방 12~18°)
            // 🚨 **드리움(세로 길이)은 폭과 분리해서 잡는다 — 상완이 보이려면 여기가 짧아야 한다.**
            //    2026-08-19 인계 "견갑이 팔꿈치 건틀릿에 거의 닿는다"의 원인이 정확히 이 값이었다.
            //    `probe-upperarm.js` 실측: 견갑 밑단 −0.133 vs 쿠터 윗단 −0.145 → **드러난 상완이
            //    0.012**(자기 지름 0.150 의 8%)뿐이라 실루엣이 '견갑 → 곧바로 팔꿈치'로 뭉갠다.
            //    라메 높이 0.042/0.036 → 0.024/0.020 으로 줄여 드리움만 걷어낸다.
            //    ⚠️ **반경(PR·ratio)은 한 자도 건드리지 말 것** — 견갑 폭을 줄이면 역삼각 실루엣이
            //    같이 죽는다(비평가 2인이 함께 '되돌리지 말 것'으로 꼽은 신호). `probe-upperarm` ③이
            //    최대 반경 ≥0.112 로 그 선을 지킨다. 줄이는 건 세로뿐이다.
            let node = pauldronG, lastR = PR, lastY = -0.020;
            for (const [ratio, hh] of [[0.85, 0.024], [0.72, 0.020]]) {
                const seg = new THREE.Group();
                // 🚨 **기울기 보정 — 라메를 눕히면 바깥이 아니라 '안쪽 가장자리'가 내려앉는다.**
                //    z 회전은 축을 중심으로 돌므로 팔 안쪽(x = −r) 정점이 r·sin(tilt) 만큼 **아래로**
                //    끌려간다. 그런데 상완을 실제로 가리는 건 바로 그 안쪽 가장자리다 —
                //    `probe-upperarm` 실측에서 라메 높이를 0.042+0.036 → 0.024+0.020(합 −0.034)으로
                //    깎았는데 견갑 밑단은 −0.133 → −0.106(0.027)밖에 안 올라간 이유가 이것이다.
                //    누적 기울기(2장이면 28°)에서는 높이보다 이 항이 더 크다.
                //    → 내려앉는 만큼 장을 되올린다. 위 장과 겹쳐지는데, **겹치는 게 실제 라메다**
                //    (판이 서로 미끄러지며 포개진다). 실루엣 폭·반경비는 회전축과 무관하므로
                //    `probe-pauldron` ①②③은 그대로 유지된다.
                seg.position.y = lastY + lastR * 0.98 * Math.sin(LAME_TILT);
                seg.rotation.z = side * LAME_TILT;
                node.add(seg);
                const rt = lastR * 0.98, rb = PR * ratio; // 위는 앞 장 밑단에 맞물리고 아래로 좁아진다
                // 🧊 **밴드 voxel 전환** — 열린 원통 → 큐브 판. **속을 비우지 않는다.**
                //    처음엔 라메가 실제로 튜브라 `{t: 1.5}` 로 벽만 세웠는데, 접사(`shot-pauldron`)에서
                //    **뚫린 속이 그대로 보였다** — 캡 밑단보다 라메 윗면이 기울기 보정만큼 올라와 있어
                //    안쪽 고리 면이 노출되고, 그 구멍으로 패딩 소매가 비친다. 그게 비평가 A 가 지적한
                //    "속이 비어 있는 원뿔 = 갓등" 바로 그 그림이라 되돌렸다. voxel 판은 속이 차 있어야
                //    한다(규약 ⑸) — 상완은 그 속에 묻히고, 라메 밑으로 다시 나온다.
                //    높이는 **내림**으로 칸을 잡는다(0.024·0.020 → 각 1칸). 반올림이면 2칸이 돼 드리움이
                //    0.008 늘어나는데, 드리움은 상완 노출 구간을 그대로 먹는다(`probe-upperarm` ①).
                const hCells = Math.max(1, Math.floor(hh / this.VOX));
                const bandVox = Voxel.taper(this.vr(rb), this.vr(rt), hCells);
                const band = this.voxPart(bandVox, steelVox, { center: false });
                band.userData.part = 'pauldronPlate';
                band.position.y = -(hCells - 0.5) * this.VOX;   // 맨 **윗면**을 앞 장 밑단(=seg 원점)에 맞춘다
                seg.add(band);
                node = seg; lastR = rb; lastY = -hCells * this.VOX;
            }
            // 밑면 캡 (A 의 "밑면 캡이 없어 내부 면이 보인다") — 마지막 라메 밑단을 니어블랙 링으로 막는다.
            // 원판이 아니라 **링**인 이유: 가운데로 상완이 지나가므로 원판이면 팔을 뚫고 나온 판으로 보인다.
            // 안쪽 반경은 굵어진 상완(0.073)보다 살짝 크게 잡아 팔이 링을 관통하지 않게 한다.
            // 🧊 밑면 마개 — **링이 아니라 원판**이고, 라메 스택의 **맨 아래 한 층**이다.
            //    ⑴ 옛 링(0.079~0.0814)은 두께 0.0024 = 0.15칸이라 그대로 옮기면 끊긴 점선이 된다
            //       (voxel.js `ring` 주석: t < 1칸이면 링이 끊긴다) → 원판으로 바꾼다. 가운데는 상완이
            //       지나가지만 상완이 더 굵어(0.0712 > 마개 안쪽) 묻히므로 '팔을 뚫고 나온 판'으로 안 보인다.
            //    ⑵ 색은 니어블랙 **칸 색 계수**로 낸다 — 옛 `deepLine` 은 bumpMap 을 물고 있어 uv 없는
            //       voxel 에 붙이면 한 텍셀만 샘플링돼 무늬가 아니라 단색 곱셈이 된다(규약 ⑶).
            //    ⑶ 이 한 층이 곧 옛 `rim`(밴드 밑단 밝은 테)의 대응이기도 하다 — 별도 메시 없이
            //       라메 밑단에 명암 띠가 생긴다(어깨당 드로우콜 4개 감소: 안감2·림2).
            //    🚨 드리움 예산: 라메 1칸 + 1칸 + 마개 1칸 = 0.048. 이 위로 한 칸만 더 늘려도
            //       `probe-upperarm` ①(노출/지름 ≥0.55)이 떨어진다 — 실측으로 0.495 까지 갔었다.
            const pFloor = this.voxPart(
                Voxel.disc(this.vr(lastR), 1, 0x3c3c3c), steelDarkVox, { center: false });
            pFloor.userData.part = 'pauldronFloor';  // ③ 이 타입(RingGeometry)이 아니라 이 태그로 찾는다
            pFloor.position.y = lastY - this.VOX * 0.5;   // 칸 y=0 의 **윗면**을 마지막 라메 밑단에 맞춘다
            node.add(pFloor);
            // 🧊 리벳 — 구(6×5) → 큐브 보석. 작은 알은 `ball` 이 그냥 큐브로 보여서 `gem`(45° 계단)이 낫다.
            const rivet = this.voxPart(Voxel.gem(this.vr(0.019), 0xffffff), goldVox);
            rivet.position.set(side * 0.012, 0.080, 0); // 캡 꼭대기 리벳 (셸 상단 0.062 + 견갑 y 0.012 위)
            // 견갑 안쪽-상완 경계 접촉 그림자 — 견갑 밑단이 −0.133 → −0.061 로 올라왔으므로 같이 올린다.
            // ⚠️ 종전 y −0.03 은 밑단보다 **한참 위**라 판금 속에 묻혀 있었다(경계에 그림자가 없었다).
            //    새로 드러난 상완 구간의 맨 위에 걸어야 '판금 밑에서 팔이 나온다'로 읽힌다.
            aoRing(0.075, 0.018, shoulder, -0.068, 0.5);
            // 상완 굵기 — 처방 "상완을 견갑 지름의 0.6배 이상". 견갑 지름 2×0.113 = 0.226 → 상완 지름 ≥ 0.136.
            // 0.062 → 0.073 (지름 0.146 = 견갑 지름의 0.646배). 이게 A 의 "오버행 21px > 상완 두께 18px",
            // B 의 "가는 막대에 씌운 갓등" 을 동시에 푼다 — 오버행을 줄이는 쪽이 아니라 팔을 굵히는 쪽을 택한 건
            // 견갑 폭을 줄이면 역삼각 실루엣(양쪽이 '되돌리지 말 것'으로 꼽은 것)이 같이 죽기 때문이다.
            const upperArm = this.voxLimb(0.073, 0.060, 0.19, mailVoxMat);
            upperArm.userData.part = 'upperArm';
            // 상완 패딩 소매 — 견갑 아래로 삐져나오는 누빔천 (판금 → 천 → 사슬 3층 경계).
            // 상완을 0.062→0.073 으로 굵히면서 같이 키운다 — 안 키우면 사슬에 파묻혀 3층 경계가 사라진다.
            // 🚨 **이 소매는 지금까지 화면에 한 번도 안 나왔다** (`probe-upperarm` ②로 확정).
            //    y −0.02 · 높이 0.05 이면 밑단이 −0.045 인데 견갑은 −0.133 까지 덮고 있었다 —
            //    즉 통째로 판금 속에 묻힌 **죽은 지오메트리**였다(이 저장소가 '태싯 스트랩'에서 이미
            //    한 번 겪은 것과 같은 자리). 주석이 선언한 '판금 → 천 → 사슬 3층 경계'는 존재하지
            //    않았고, 그래서 상완이 사슬 민짜 튜브 한 겹으로만 읽혔다.
            //    → 견갑 밑단(−0.061) **아래로** 내려 실제로 삐져나오게 한다.
            //    반경은 0.079 → 0.077 — 견갑 밑면 링(pFloor)의 안쪽 반경이 정확히 0.079 라
            //    같은 값이면 두 면이 겹쳐 z-파이팅이 난다. 상완(이 높이에서 반경 0.069)보다는
            //    여전히 0.008 굵어 누빔천이 판금 밑에서 부풀어 나온 것으로 읽힌다.
            // 🧊 0.077/0.073 → 0.0785/0.0765 (voxel 상완 전환). 위 대퇴 패드와 같은 이유 —
            //    voxel 상완 바깥 면이 이 구간에서 0.0712 에 서는데 12각 평면이 0.0705 까지
            //    들어왔다. **상한은 0.079**(견갑 밑면 링 pFloor 안쪽 반경 = z-파이팅 선)이라
            //    그 아래로 붙여 잡는다.
            const armPad = new THREE.Mesh(new THREE.CylinderGeometry(0.0785, 0.0765, 0.055, 12), padding);
            armPad.userData.part = 'armPad';
            armPad.position.y = -0.055;
            const elbow = new THREE.Group();
            elbow.position.y = -0.19;
            // 팔꿈치 쿠터(couter): 돔 + 측면 팬 윙 — 무릎 폴린과 같은 관절 장갑 언어로 통일
            const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), steel());
            elbowCap.scale.set(1.05, 0.9, 1.15);
            const couterWing = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), steelDark());
            couterWing.position.set(side * 0.036, -0.004, -0.004);
            couterWing.rotation.z = side * -1.35;
            couterWing.scale.set(1, 0.5, 1.1);
            const couterRivet = Voxel.build(Voxel.box(1, 1, 1, 0xffffff), { size: 0.013, material: goldVox, color: 0xd9a441, center: true, jitter: 0 }); // 🧊 쿠터 리벳 — 구 → 큐브
            couterRivet.position.set(side * 0.042, 0.004, 0.01);
            // 팔꿈치 개스킷 — 무릎과 같은 언어(니어블랙 관절 슬리브)
            const elbowGasket = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.044, 0.072, 12), deepGasket);
            const forearm = this.voxLimb(0.046, 0.042, 0.13, mailVoxMat);
            forearm.userData.part = 'forearm';
            // 뱀브레이스 라메 2겹 — 하완이 민짜 튜브로 남지 않게 판금 밴드를 감는다
            const vambraceA = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.028, 12), steel());
            vambraceA.userData.part = 'vambrace';
            vambraceA.position.y = -0.038;
            const vambraceB = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.048, 0.024, 12), steelDark());
            vambraceB.position.y = -0.072;
            // 건틀릿 커프(원뿔 링) + 손
            const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.065, 0.07, 10), steel());
            cuff.position.y = -0.11;
            // 주먹: 손바닥 블록 + 손가락 4지(기절·말절 2분절 컬) + 엄지 2분절 + 강철 너클 가드 — 근접샷에서 '손가락 없는 스텁' 오독 해소 (비평가 1번)
            // 가죽 PBR — 범프로 근접 그레인 (비평가 7.1 5번). 헥스는 두 번의 역보정을 거쳤지만(0x6b4e3a→0x241408)
            // 조명 후 명도가 여전히 0.3대여서 값 구조에는 못 낀다 — 부츠와 같은 이유로 니어블랙으로 통일한다.
            // 손등 너클 가드(밝은 스틸)와 골드 리벳이 그대로 남으므로 '검은 뭉치'로 뭉개지지 않는다.
            // 🧊 **voxel 건틀릿 주먹** — 구·원통 11개(손바닥 구·손가락 실린더·관절/손끝/너클 구·엄지
            //   실린더·가드 구·리벳 구·손목 토러스)를 축정렬 큐브 덩어리로 전환(화풍 확정 2026-08-20).
            //   ⚠️ 손가락 화면 크기가 ~15px 라 매끈 손가락은 캡처에서 이미 검은 뭉치로 뭉갠다 —
            //     voxel 에선 **청키 미튼(가죽 블록) + 앞면 세로 그루브 3줄 + 밝은 스틸 너클 큐브 4개**
            //     로 옮겨야 손가락 수 단서가 오히려 또렷하다(크로시로드 블록 손 원리). handMount(무기
            //     그립)은 별도 그룹이라 그립 외형은 안 바뀐다. `probe-arm-taper` 태그·반경비 유지.
            const leatherVox = new THREE.MeshStandardMaterial({ color: 0x2b2620, metalness: 0.14, roughness: 0.86, envMapIntensity: 0.14, vertexColors: true, flatShading: true });
            const steelHandVox = voxSteel('steel');   // 너클·가드 — R.armorMats 에 실려 등급 틴트를 받는다
            // ⚠️ **칸을 굵게(FVOX 0.020) — 화풍 '큐브가 굵게' + `probe-hero-tris` 예산 둘 다 만족.**
            //   0.017·그루브 판이었을 때 리그 합계가 66818 > 66000(게이트)이었다 — 잔 칸은 노출 면이
            //   많아 삼각형을 잡아먹는다. 손가락 수 단서는 그루브가 아니라 **밝은 너클 큐브 4개**가
            //   지므로(원판 너클 구가 하던 역할) 가죽 덩어리는 민 미튼으로 둬도 손이 읽힌다.
            const FVOX = 0.020;
            const fist = new THREE.Group();
            fist.userData.part = 'fist';
            fist.position.y = -0.16;
            // 손 덩어리 = 베벨 미튼(가죽). slab x-3..3 · y0..5 · z-1..1, 모서리 계단 1.
            const handMesh = Voxel.build(Voxel.slab(7, 6, 3, 0xffffff, 1), { size: FVOX, material: leatherVox, color: 0xffffff, center: false, jitter: 0.06 });
            handMesh.position.y = -2.5 * FVOX;   // y 0..5 → 중심 정렬(x·z 는 slab 이 이미 중심)
            fist.add(handMesh);
            // 엄지 — 안쪽(side*-x)에서 앞으로 올라오는 2칸 덩어리
            const thumbVox = Voxel.merge(
                Voxel.box(1, 2, 2, 0xffffff),
                Voxel.at(Voxel.box(1, 1, 2, 0xffffff), 0, 2, 1));
            const thumbMesh = Voxel.build(thumbVox, { size: FVOX, material: leatherVox, color: 0xffffff, center: false, jitter: 0.05 });
            thumbMesh.position.set(side * -3 * FVOX, -1.5 * FVOX, 1.2 * FVOX);
            fist.add(thumbMesh);
            // 강철 너클 가드 — 손등 위 밝은 스틸 판(가죽과 명도 대비)
            const guardMesh = Voxel.build(Voxel.slab(7, 2, 2, 0xffffff, 1), { size: FVOX, material: steelHandVox, color: 0xffffff, center: false, jitter: 0.05 });
            guardMesh.position.set(0, 3.0 * FVOX, 0.6 * FVOX);
            fist.add(guardMesh);
            // 너클 큐브 4개 — 손가락마다 하나, 앞날에 나란히(손가락 개수 단서)
            for (const kx of [-3, -1, 1, 3]) {
                const knuck = Voxel.build(Voxel.box(1, 1, 1, 0xffffff), { size: FVOX, material: steelHandVox, color: 0xffffff, center: false, jitter: 0 });
                knuck.position.set(kx * FVOX, 2.4 * FVOX, 1.9 * FVOX);
                fist.add(knuck);
            }
            // 골드 리벳 — 가드 위 한 칸
            const gRivet = Voxel.build(Voxel.box(1, 1, 1, 0xffffff), { size: FVOX, material: goldVox, color: 0xd9a441, center: false, jitter: 0 });
            gRivet.position.set(0, 3.7 * FVOX, 1.8 * FVOX);
            fist.add(gRivet);
            // 손목 가죽 스트랩(커프-주먹 경계) — 토러스 → 큐브 링(XZ 평면이라 회전 불필요)
            const strap = Voxel.build(Voxel.ring(2.6, 1, 1, 0xffffff), { size: FVOX, material: leatherVox, color: 0xffffff, center: true, jitter: 0.06 });
            strap.position.y = -0.135;
            const handMount = new THREE.Group();
            handMount.position.y = -0.17;
            elbow.add(elbowGasket, elbowCap, couterWing, couterRivet, forearm, vambraceA, vambraceB, cuff, fist, strap, handMount);
            shoulder.add(pauldronG, rivet, upperArm, armPad, elbow);
            spine.add(shoulder);
            R.arms.push({ shoulder, elbow, handMount });
            R.bones['shoulder' + (side < 0 ? 'L' : 'R')] = shoulder;
            R.bones['elbow' + (side < 0 ? 'L' : 'R')] = elbow;
        }
        R.handL = R.arms[0].handMount;
        R.handR = R.arms[1].handMount;

        // 방패 (왼손) — 🧊 **voxel 히터 실드** (화풍 확정 2026-08-20: 원형 셸/디스크/토러스를 전부 폐기).
        //   비평가 2인이 공통 2순위로 "방패는 매끈한 원형 디스크"라 지적한 그것이다 → 조형을
        //   **위 넓고 아래 뾰족한 히터(방패) 실루엣**으로 바꿔 '디스크'로 안 읽히게 하고, 스틸판·금
        //   테·문장·보스·리벳을 전부 축정렬 큐브 적층으로 옮긴다. 곡면 생성자(Sphere×3·Torus×1·
        //   Cylinder×2) 6개가 여기서 0이 된다(래칫 174→168).
        //   ⚠️ 옛 개방 셸(SphereGeometry phi 0.35π)이 안쪽에서 배경을 비치던 버그(probe-shield.js
        //     안쪽 기여 0픽셀)는 **판이 앞뒤로 꽉 찬 큐브 덩어리라 구조적으로 사라진다**(양면 그린다).
        const shieldG = new THREE.Group();
        {
            const SVOX = 0.024;                  // 방패 전용 칸 — 굵은 블록으로 읽히게 리그 VOX(0.016)보다 크게
            const yTop = 7, yBot = -8;
            // 행별 반폭(칸). 위는 각진 사각(모서리 계단 베벨) → 아래로 좁아져 뾰족한 끝 = 히터 실루엣.
            const halfW = (y) => {
                if (y >= 5) return 6 - (y - 5);          // y5:6 y6:5 y7:4 — 윗변 모서리 계단
                if (y >= -1) return 6;                    // 곧은 옆면
                const t = -1 - y;                         // 1..8 아래로
                return Math.max(1, Math.round(6 * Math.sqrt(Math.max(0, 1 - (t / 7.6) * (t / 7.6)))));
            };
            // 스틸판 — 앞뒤 2칸 두께(꽉 찬 덩어리라 안쪽 관통 없음). voxSteel 은 R.armorMats 에 실려 등급 틴트를 받는다.
            const plate = [];
            for (let y = yBot; y <= yTop; y++) {
                const hw = halfW(y);
                for (let x = -hw; x <= hw; x++) for (let z = 0; z <= 1; z++) plate.push({ x, y, z, c: 0xffffff });
            }
            const plateMesh = Voxel.build(plate, { size: SVOX, material: voxSteel('steel'), color: 0xffffff, center: false, jitter: 0.05 });
            // 금 테 — 실루엣 바깥 한 칸을 금색으로 한 칸 앞(z=2)으로 돌출시켜 굵은 블록 테. goldVox 는 태싯 블록에서 내려온다.
            const rim = [];
            for (let y = yBot; y <= yTop; y++) {
                const hw = halfW(y), hwUp = halfW(Math.min(yTop, y + 1)), hwDn = halfW(Math.max(yBot, y - 1));
                for (let x = -hw; x <= hw; x++)
                    if (Math.abs(x) === hw || y === yTop || y === yBot || Math.abs(x) > hwUp || Math.abs(x) > hwDn)
                        rim.push({ x, y, z: 2, c: 0xffffff });
            }
            const rimMesh = Voxel.build(rim, { size: SVOX, material: goldVox, color: 0xd9a441, center: false, jitter: 0.07 });
            // 문장 필드 — 중앙 블록 마름모(장비 없을 땐 청강색, 갑옷 장착 시 등급색). vertexColors 로 틴트가 흰 정점색에 곱해진다.
            R.shieldFaceMat = new THREE.MeshStandardMaterial({ color: 0x3f5a74, metalness: 0.55, roughness: 0.42, vertexColors: true, flatShading: true });
            const field = [];
            for (let y = -2; y <= 3; y++) for (let x = -3; x <= 3; x++)
                if (Math.abs(x) + Math.abs(y - 0.5) <= 3.5) field.push({ x, y, z: 2, c: 0xffffff });
            const fieldMesh = Voxel.build(field, { size: SVOX, material: R.shieldFaceMat, color: 0xffffff, center: false, jitter: 0.04 });
            // 중앙 보스 — 금 큐브 젬(팔면체), 문장 위로 돌출
            const bossMesh = Voxel.build(Voxel.at(Voxel.gem(2.2, 0xffffff), 0, 0, 4), { size: SVOX, material: goldVox, color: 0xd9a441, center: false, jitter: 0.05 });
            // 림 리벳 — 실루엣 둘레 6곳 작은 금 큐브(z=3, 테보다 반 칸 앞)
            for (const rp of [[0, 7], [-5, 4], [5, 4], [-5, -1], [5, -1], [0, -8]]) {
                shieldG.add(Voxel.build(Voxel.at(Voxel.box(1, 1, 1, 0xffffff), rp[0], rp[1], 3), { size: SVOX, material: goldVox, color: 0xd9a441, center: false, jitter: 0 }));
            }
            // 뒷판(니어블랙) — ① 두께감 ② 비평가 공통 1위 '진짜 어두운 값 부재'에 면적 보탬 ③ 손잡이 근거.
            //   실루엣 그대로 z=-1 한 칸. deepHide 는 map/bump 를 물어 vertexColors 를 안 켠 매끈 재질이라
            //   전용 voxel 재질(니어블랙 무광)을 쓴다.
            const backMat = new THREE.MeshStandardMaterial({ color: 0x241f1b, metalness: 0.12, roughness: 0.9, envMapIntensity: 0.12, vertexColors: true, flatShading: true });
            const back = [];
            for (let y = yBot; y <= yTop; y++) { const hw = halfW(y); for (let x = -hw; x <= hw; x++) back.push({ x, y, z: -1, c: 0xffffff }); }
            const backMesh = Voxel.build(back, { size: SVOX, material: backMat, color: 0xffffff, center: false, jitter: 0.05 });
            shieldG.add(plateMesh, rimMesh, fieldMesh, bossMesh, backMesh);
            // 팔을 지나는 가로 가죽 스트랩 2줄(손잡이) — Box 는 곡면이 아니라 그대로 둔다(뒷판보다 뒤).
            for (const sy of [-1, 1]) {
                const strap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.028, 0.016), deepHide);
                strap.position.set(0, sy * 0.062, -0.045);
                shieldG.add(strap);
            }
        }
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
        // hero-chibi(사용자 지시 2026-08-18): 머리를 크게(0.48 → 1.0) — 두신비 2.5~3 치비 비례.
        // 종전 '보블헤드 완화'(0.78→0.48 축소 이력)는 성인 비례 ㉢ 기준이라 이 지시로 폐기.
        // position.y 를 0.1 → 0.16 으로 올려 커진 머리의 턱이 고젯 칼라를 뚫지 않게 한다
        // (치비 문법대로 목 없이 어깨 위에 얹힌 머리 — 턱이 칼라 상단에 살짝 얹히는 높이).
        // 🔁 **머리 더 크게 (사용자 추가 2026-08-19: "머리가 좀 더 컸으면 좋겠음")** — 1.0 → 1.30.
        //    두신비 2.93 → 2.48. `probe-head-sweep.js` 로 1.15~1.40 을 재서 고른 값이다
        //    (1.15=2.68 · 1.25=2.54 · 1.30=2.48 · 1.40=2.38 — 지시가 준 대역 2.0~2.5 에 처음 드는 지점).
        // ⚠️ **scale 과 position.y 는 한 세트다.** 칼라·고젯은 spine 소속이라 머리와 같이 안 움직인다
        //    (`neck` 이 아니라 `spine` 에 붙인 이유는 아래 주석 참조). 그래서 배율만 올리면 턱이
        //    아래로 자라 칼라를 삼킨다(6차 비평가 ㉦ 이 짚었던 그 결함이 되살아난다). position.y 를
        //    같이 올려 **턱끝을 제자리(로컬 y 불변)에 두고 머리는 위로만 자라게** 한다.
        //    0.16 → 0.197 = 턱 오프셋 × (1.0 − 1.30) 을 되민 값(스윕이 실측으로 뽑아 준 보정).
        headG.position.y = 0.197;
        headG.scale.setScalar(1.30);
        neck.add(headG);
        R.bones.head = headG;
        // 목 기둥 — 머리가 몸통 위에 떠 보이던 문제 (비평가: 목 연결부 부재)
        // 밝은 살색 긴 기둥은 '노출된 흰 실린더'로 오독(비평가 6.9 3번) — 짧게+그늘 톤, 사슬 카울로 상단 커버
        const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.078, 0.1, 10),
            new THREE.MeshStandardMaterial({ color: 0xd9b28c, metalness: 0, roughness: 0.65 }));
        neckMesh.position.y = 0.015;
        const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.07, 12), mailMat); // 사슬 카울 — 이름대로 실제 사슬 직조로(사지와 동일 재질) 목-흉갑 경계 마감
        cowl.position.y = -0.02;
        neck.add(neckMesh, cowl);
        // 스탠딩 고젯 칼라 — 비평가 잔여 지적 ⓔ "목 기둥 부재: 요크와 투구가 2~3px 어두운 이음선으로 만난다".
        // ⚠️ 앞선 세션이 "밝은 살색 긴 기둥은 노출된 흰 실린더로 오독된다"며 목을 의도적으로 짧게 만든
        //    이력이 있다(위 neckMesh 주석). 그래서 **살색 기둥을 늘리는 방향으로 가면 안 된다** —
        //    지적이 처방한 대로 판금 칼라를 세운다. 살은 그대로 짧게 두고, 고젯 링에서 턱 밑까지
        //    **판금**이 올라가 머리와 몸통 사이에 실제 높이를 가진 기둥을 만든다.
        // ⚠️ 몸통(spine)에 붙인다 — 실제 고젯은 흉갑에 얹히는 파츠라 고개를 돌려도 따라 돌지 않는다.
        //    neck 에 붙이면 칼라가 머리와 같이 회전해 '목도리'가 된다.
        // ⚠️ 2026-08-18 6차 비평가 재지적 ㉦(양쪽 합의): 앞 세션이 칼라를 세워 기여 992px·기둥 16px 을
        //    만들었는데도 양쪽이 여전히 "목이 없다 / 공 위의 막대"라고 했다. 진단이 명확하다 —
        //    **"높이가 아니라 단(段)과 암부가 모자란다."** 처방: 3단 라메 스택(아래로 갈수록 넓어짐,
        //    총 높이 ≈ 머리 높이의 0.35) + 최상단 라메 안쪽 L 20대 암부.
        // ⚠️⚠️ **처방 중 '아래로 갈수록 넓어짐' 한 조각은 실측으로 기각했다 — 다음 세션은 다시 뒤집지 말 것.**
        //    실제 고젯 라메가 밑단이 넓은 건 맞지만, 이 리그에서는 그 방향이 칼라를 통째로 죽인다.
        //    아래로 넓어지는 스택은 **요크(가슴~견갑 내측 수평판) 안쪽으로 들어가** 실루엣을 못 만든다.
        //    `probe-collar.js` 대응 비교(칼라만 껐다 켠 차분) 실측:
        //      종전 위로 벌어지는 칼라 ......... 기여 992px
        //      3단 + 아래로 넓어짐(0.413~0.560) . 기여 **10px** ← 사실상 완전 매몰
        //      3단 + 위로 벌어짐(채택) ......... 아래 참조
        //    즉 이 몸통에서 목을 만드는 건 '고젯다운 방향'이 아니라 **요크 위로 솟는 부분**이다.
        //    (근본 원인은 ㉢ 비례 — 머리 밑면(spine y 0.514)과 몸통 윗면이 거의 붙어 목이 들어갈 세로 공간
        //     자체가 없다. 방향을 어떻게 잡든 이 항목만으로는 못 푼다.)
        // 처방에서 **살린 것 = 실제로 모자랐던 것**: ⑴ 단(段) 3개와 단 경계 테 ⑵ 목 구멍 안쪽 암부
        //    ⑶ 총 높이 ≈ 머리 높이(투구 포함 0.419)의 0.35 대역.
        // ⚠️ ㉢ 비례 교정(머리 0.68→0.48)의 파생 — `probe-collar` ㉦② 가 잡았다. 칼라 높이(0.128)는
        //    안 건드렸는데 **머리가 작아지자 비가 0.35 → 0.497 로 튀어** 칼라가 턱을 삼켰다(정면
        //    캡처에서 목이 아예 안 보이고 '어깨에 얹은 머리'로 읽힌다). 높이를 0.77 배로 낮춘다.
        // ⚠️ **줄이는 기준점은 밑단(y 0.432)이다.** 윗단을 고정하고 줄이면 밑단이 요크에서 떨어져
        //    ⓔ '요크와 투구가 이음선으로 만난다' 를 그대로 되살린다 — 칼라가 애초에 그걸 메우려고
        //    생긴 파츠다. 밑단을 붙여 두면 위로 드러나는 구간은 사슬 카울(0.445~0.565)이 받는다.
        const CB = 0.432, CH = 0.77;                     // 밑단 기준 · 높이 배율
        const cy = y => +(CB + (y - CB) * CH).toFixed(4);
        const COLLAR_LAMES = [   // [밑단r, 윗단r, 밑단y, 윗단y] — 위로 벌어진다(실측으로 채택한 방향)
            [0.099, 0.095, cy(0.432), cy(0.472)],
            [0.101, 0.108, cy(0.470), cy(0.512)],
            [0.112, 0.121, cy(0.510), cy(0.560)],
        ];
        const collarParts = [];
        for (const [rb, rt, y0, y1] of COLLAR_LAMES) {
            const h = y1 - y0;
            const lame = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16, 1, true), steel());
            lame.position.y = (y0 + y1) / 2;
            // 라메 안감 — 셸이 열려 있어 안쪽이 보인다. 니어블랙이라야 목이 '뚫린 밝은 구멍'이 아니라 그늘이 된다.
            const lameIn = new THREE.Mesh(new THREE.CylinderGeometry(rt * 0.93, rb * 0.93, h * 1.02, 16, 1, true), deepLine);
            lameIn.position.y = lame.position.y;
            // 밑단 테 — 단 경계를 눈에 보이게 만드는 실질 요소. 이게 없으면 3단이 매끈한 원뿔 하나로 뭉개진다.
            const rim = new THREE.Mesh(new THREE.TorusGeometry(rt, 0.0075, 5, 18), steelDark());
            rim.rotation.x = Math.PI / 2;
            rim.position.y = y1;          // 위로 벌어지므로 단 경계는 **윗단**에 온다
            collarParts.push(lame, lameIn, rim);
        }
        // 최상단 라메 **안쪽** 암부 (처방 "L 20대") — 목 구멍 안으로 니어블랙 원통을 한 단 더 세운다.
        // 안감(lameIn)은 라메 벽 바로 뒤라 정면에서 거의 안 보인다. 실제로 어두워야 하는 건 그 **안쪽 구멍**이다.
        const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.098, 0.09, 16, 1, true), deepLine);
        throat.position.y = cy(0.512);   // 목 구멍 암부도 칼라와 함께 내려온다(안 내리면 라메 위로 삐져나온다)
        spine.add(...collarParts, throat);
        // 🧊 **두상 = 축정렬 큐브 상자 (2026-08-20 voxel 전환, `prochar-aaa`).**
        //   종전은 `SphereGeometry` 두 개(두개 0.19 · 턱 0.145)를 비균등 scale 로 눌러 만든 **매끈한 구**였다.
        //   `cute-art-direction` 0차 채점에서 **비평가 2인이 서로의 점수를 모른 채 이걸 1순위로 같이 짚었다**:
        //   "몸통·팔·다리는 큐브인데 머리만 구라서 한 캐릭터 안에서 조형 언어가 충돌한다"(A/B 요지).
        //   3D 씬에서 가장 큰 단일 오브젝트가 화풍 밖에 있으니 다른 걸 아무리 고쳐도 점수가 안 올랐다.
        //
        //   ⚠️ **둥근 복셀(타원체 적층)로 바꾸면 안 된다.** 화풍 블록이 "치비 = 비례만 · 큐브를 둥글리지 말 것"
        //      이라고 못 박았다 — 크로시로드 캐릭터가 네모나면서 귀여운 그 원리다. 그래서 **상자**로 간다.
        //      모서리는 계단 베벨만 준다(화풍 ㉲ "각지거나 픽셀-라운드(계단)").
        //   ⚠️ **비례는 옛 구에서 그대로 물려받는다** — 두상 반축 (0.1805, 0.1995, 0.1805)·중심 y=0.08,
        //      턱 반축 (0.1378, 0.1015, 0.1305)·중심 (0,-0.01,0.02). 세로 점유 −0.12~0.28(높이 0.40)을
        //      유지해야 `hero-chibi` 의 두신비 2.48 과 `probe-head-sweep` 이 안 흔들린다.
        //   ⚠️ 칸은 리그 공용 `VOX`(0.016)다. `headG.scale` 이 1.30 이라 머리 큐브는 몸통보다 1.3배 크게
        //      보이는데, **투구 파츠도 같은 headG 아래서 같은 격자로 굽고 있으므로** 머리와 투구는 서로 맞는다.
        const HEAD_CRAN = { w: 23, d: 23, h: 16, bevel: 2 };   // 두개 — 23칸 = 0.368 ≈ 옛 폭 0.361
        const HEAD_JAW = { w: 17, d: 17, h: 9, bevel: 1, dz: 1 }; // 턱 — 한 단 좁고 한 칸 앞으로(턱선 계단)
        const HEAD_Y0 = -0.112;   // 층 0 의 **아랫면**이 −0.12 에 오도록(build(center:false) 는 칸 중심 기준)
        // 두개와 턱을 **한 목록으로** 굽는다 — 맞닿는 면이 서로 가려져 사라지므로 삼각형이 준다
        // (따로 구우면 그 경계면 두 벌이 그대로 남는다).
        const headVox = Voxel.merge(
            Voxel.at(Voxel.slab(HEAD_JAW.w, HEAD_JAW.h, HEAD_JAW.d, undefined, HEAD_JAW.bevel), 0, 0, HEAD_JAW.dz),
            Voxel.at(Voxel.slab(HEAD_CRAN.w, HEAD_CRAN.h, HEAD_CRAN.d, undefined, HEAD_CRAN.bevel), 0, HEAD_JAW.h, 0));
        // 살색 voxel 재질 — `mailVoxMat` 과 같은 이유로 인스턴스를 가른다(정점 색이 없는 메시에 같은
        // 재질을 물리면 그쪽이 attribute 기본값 0 이라 통째로 검게 죽는다. 코·손은 아직 매끈이다).
        const skinVox = new THREE.MeshStandardMaterial({
            color: skin.color.getHex(), metalness: 0, roughness: 0.6, vertexColors: true, flatShading: true,
        });
        const head = this.voxPart(headVox, skinVox, { center: false });
        head.position.y = HEAD_Y0;
        headG.add(head);
        // 얼굴 판이 붙을 **앞면 z** — 상자라 평면이다. 손으로 적지 말고 상자에서 파생시킨다
        // (칸 수를 바꾸면 얼굴도 같이 따라와야 한다. 옛 판은 구 표면 z 를 손으로 베껴 적어 뒀었다).
        const FACE_ZC = (HEAD_CRAN.d / 2) * this.VOX;                    // 두개 앞면 (= 0.184)
        const FACE_ZJ = (HEAD_JAW.d / 2 + HEAD_JAW.dz) * this.VOX;       // 턱 앞면 (= 0.152)
        // 얼굴 이목구비 그룹 — 풀커버 투구(visor/mask/tech) 착용 시 통째로 숨김 (투구 밖으로 코/눈 뚫림 방지)
        const faceG = new THREE.Group();
        headG.add(faceG);
        R.faceMesh = faceG;
        // ===== 이목구비 — 1930년대 러버호스 카툰 화풍 (`cute-art-direction` 사용자 확정 2026-08-19) =====
        // 사용자 원문: "1930년대 미국 카툰 스타일로 귀엽게" — 파이컷/큰 원형 눈 + 검은 점 동공, 넓은 미소.
        // 종전은 흰자+파란 홍채+글로시 하이라이트의 '캐주얼 3D 마스코트' 눈이었다(미키/컵헤드 계열이 아님).
        //
        // 🔑 **이목구비를 전부 '평평한 판'으로 짠 이유** — 파이컷은 원판에서 부채꼴 하나를 도려낸 2D 도형이라
        //    구(球) 프리미티브로는 안 나온다(SphereGeometry 의 phi 절단은 오렌지 조각이지 파이컷이 아니다).
        //    그래서 눈 한 짝을 **접선 평면에 놓인 판 그룹**으로 만들고 흰자·파이 쐐기·동공·글린트를 그 안에서
        //    z 로만 쌓는다 — 판끼리는 완전 평행이라 z-파이팅이 원천적으로 없다. 1930s 카툰 얼굴이 원래
        //    '두상 위에 그려진 그림'이라 화풍상으로도 이쪽이 맞다.
        // 🔑 **판의 기울기는 눈대중이 아니라 두상 타원체의 접평면 각이다.** 스컬은 반지름 0.19 에
        //    scale(0.95, 1.05, 0.95) 라 반축이 (0.1805, 0.1995, 0.1805)·중심 y=0.08 이고, 눈 중심
        //    (±0.082, 0.082) 에서의 법선이 +z 와 이루는 각이 0.47rad·그 자리 표면 z 가 0.161 이다. 이 각으로 눌러 놓으면 판 가장자리가
        //    두상에서 뜨는 양이 w²/2R ≈ 0.0087 밖에 안 된다(w=반폭 0.056, R≈0.18). 각을 바꾸면 이 값이
        //    급격히 커져 **눈이 얼굴에서 떠 보이므로**, 눈 위치를 옮기면 이 각도 같이 다시 풀 것.
        // 🚨 **크기·높이는 투구 가림률로 잡은 값이다 — 눈대중으로 키우지 말 것.** 눈을 키우고 올리면
        //    챙이 낮은 투구가 흰자를 덮는다. `probe-face-eye-sweep.js` 로 한 세션 안에서 7조합을 재 보면
        //    (y, 세로배율) = (0.095, 1.22) 에서 cone 76%·plume 60% 까지 떨어지고 (0.082, 1.16) 에서
        //    cone 88%·plume 72% 로 회복한다. 회귀 게이트는 `probe-face-helmet-clear.js`.
        const EYE_R = 0.056;                 // 눈 판 반지름 (종전 구형 흰자 0.046 대비 +22%)
        const EYE_SY = 1.16;                 // 흰자 세로배율
        const EYE_Y = 0.082, EYE_X = 0.082;  // 눈 중심 (두상 로컬)
        // 🧊 **두상이 상자가 되면서 접평면 계산이 통째로 사라졌다 (2026-08-20).** 위 주석의 '반지름
        //    0.19·scale(0.95,1.05,0.95) 타원체의 접선 각 0.47rad, 표면 z 0.161' 은 **구였을 때의 유도**다.
        //    상자의 앞면은 **평면**이라 기울기가 0 이고, 판을 얹을 z 는 그 평면 바로 앞 한 자리다.
        //    ⚠️ 숫자를 손으로 다시 적지 말 것 — `FACE_ZC`(두개 앞면)에서 파생시킨다. 안 그러면 상자 칸
        //       수를 바꾼 다음 세션에서 **눈이 머리 속으로 잠긴다**(옛 0.161 을 그대로 두면 지금 당장 잠긴다.
        //       두개 앞면이 0.184 라 0.161 은 23칸 상자의 **안쪽**이다).
        //    ⚠️ 기울기 0 이 조형적으로도 맞다 — 크로시로드 계열은 상자 앞면에 **정면으로** 얼굴이 얹힌다.
        //       기울기를 남기면 판이 앞면과 어긋나 모서리에서 살이 비쳐 나온다.
        const EYE_Z = FACE_ZC + 0.002, EYE_TILT = 0;
        const inkMat = new THREE.MeshBasicMaterial({ color: 0x121316 });     // 동공·입술선 공용 잉크색
        for (const dx of [-EYE_X, EYE_X]) {
            const sgn = dx < 0 ? -1 : 1;     // +1 = 화면 오른쪽 눈
            const eye = new THREE.Group();
            eye.position.set(dx, EYE_Y, EYE_Z);
            eye.rotation.y = sgn * EYE_TILT;
            faceG.add(eye);
            // 흰자 — 흰 칸 덩어리에서 **모서리 하나를 진짜로 빼고 그린다**(옛 파이컷의 격자판).
            //   🚨 처음엔 온전한 판 위에 잉크색 쐐기를 덮었는데, 쐐기가 동공과 같은 색이라 둘이 한 덩어리로
            //      뭉쳐 **'파이컷'이 아니라 그냥 큰 검은 홍채**로 읽혔다(실측 캡처 face-front). 도형을 실제로
            //      도려내 **피부가 그 사이로 비치게** 해야 빠진 조각이 보인다 — 노치도 같은 규약이라
            //      **덮지 말고 빼야 한다**(그래서 L자를 사각형 2장으로 굽는다).
            // 🚨 **`toneMapped = false` 가 이 재질의 핵심이다 — 빼면 흰 눈이 피부에 묻힌다.**
            //   흰자를 순백(0xffffff)으로 둔 의도는 "피부보다 밝아야 눈이 형태로 읽힌다" 인데,
            //   기본값(toneMapped = true)이면 ACES 가 상단을 압축해 **255 가 234 로 눌린다.** 반면 피부는
            //   조명을 받는 Standard 라 1.0 을 넘겨 들어와 압축 뒤에도 225 까지 올라온다 — 즉 흰자와
            //   피부 차가 **ΔL 9.1** 밖에 안 남아 눈이 두상에 묻혔다. **재질 색만 보면 통과인데 화면에서는
            //   실패하는 자리**라, 이건 화풍 문제가 아니라 렌더 버그다(그래서 화풍이 바뀌어도 유효하다).
            //   흰자는 조명을 안 받는 플랫 도형이므로 톤매핑 대상이 아니다 — 빼면 255 로 나가 ΔL 30.0.
            //   ⚠️ 눈을 voxel 큐브로 다시 짜더라도 **흰 면에는 이 플래그를 그대로 들고 갈 것**
            //      (화풍 확정 2026-08-20 = voxel + 치비, "면당 플랫 색"이라 눌린 흰색은 그때 더 치명적이다).
            //   게이트: `tools/probe-eye-contrast.js` (ΔL ≥ 30, 음성 대조 + 표본 독립성 검증 내장).
            // 🧊 **원판 → 칸 패치 (2026-08-20, `prochar-aaa` 눈·입 슬라이스).** 두상만 상자로 옮긴
            //    앞 세션이 "남은 것 = 눈·입을 큐브 패치로"라 예고한 자리다. 비평가 지적의 절반이
            //    *"눈·입이 안티에일리어싱된 부드러운 데칼"* 이었는데, 두상이 상자가 된 뒤로는 매끈한
            //    원판만 화풍에서 튀어 있었다. 격자는 **리그 공용 `VOX`(0.016)** 를 그대로 쓴다 —
            //    두상·투구와 같은 칸이라야 '같은 세계의 픽셀'로 읽힌다.
            // 🔑 **칸 수는 옛 원판 치수에서 그대로 파생시킨다**(눈대중 금지 — 위 🚨 의 투구 가림률
            //    스윕으로 잡은 값이라 크기가 바뀌면 `probe-face-helmet-clear` 가 흔들린다):
            //      가로 2·EYE_R = 0.112 = **7칸** · 세로 2·EYE_R·EYE_SY = 0.130 ≈ **8칸**(0.128).
            const CELL = this.VOX;
            const EW = 7, EH = 8;                       // 눈 격자 (칸)
            const cx = c => (c - (EW - 1) / 2) * CELL;  // 칸 열 → 로컬 x (열 0..6)
            const cy = r => (r - (EH - 1) / 2) * CELL;  // 칸 행 → 로컬 y (행 0..7, 0=아래)
            // 흰자 — **파이컷이 모서리 노치가 된다.** 옛 부채꼴(PIE = 0.30π = 54°)은 원판 면적의 15%를
            //   도려냈는데, 7×8 격자에서 **3×3 노치(9/56 = 16%)** 가 그 비율을 그대로 잇는다.
            //   ⚠️ 노치는 **바깥쪽 위** 그대로 — 안쪽에 두면 두 눈의 빈 자리가 코 양옆에서 마주 봐
            //      얼굴 가운데가 뚫린 것처럼 읽힌다(옛 주석의 이유가 격자에서도 똑같이 성립한다).
            //   L자를 **직사각형 2장**으로 굽는다(칸당 굽기 금지 — `flatPatch` 머리말 참조).
            const NOTCH = 3;
            const sclera = this.flatPatch([
                [0, cy((EH - NOTCH - 1) / 2), EW * CELL, (EH - NOTCH) * CELL],                 // 아래 5행 전폭
                [-sgn * (NOTCH / 2) * CELL, cy(EH - (NOTCH + 1) / 2), (EW - NOTCH) * CELL, NOTCH * CELL], // 위 3행에서 바깥 3칸을 뺀 폭
            ], this.noBloom(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })));
            sclera.userData.pieEye = true;   // 투구 가림 판정기(`probe-face-helmet-clear.js`)가 이 태그로 흰자만 집는다
            eye.add(sclera);
            // 동공 — 검은 '점'(사용자 지시 원문). **3×3칸**으로 굽는다.
            //   ⚠️ 옛 원판 면적(지름 0.0336 × 세로 1.18)을 그대로 옮기면 2×3칸인데, 거기서 글린트 한 칸을
            //      빼면 남는 게 **가느다란 L자 5칸**이라 동공이 아니라 '얼룩'으로 읽혔다(실측 캡처).
            //      3×3 에서 한 칸을 빼면 **모서리가 베어 물린 사각 8칸**이라 동공으로 읽힌다 — 격자에서는
            //      면적 충실도보다 **한 칸을 빼고도 형태가 남는지**가 먼저다(칸이 굵어 반 칸이 없다).
            const pupil = this.flatPatch([[0, -0.5 * CELL, 3 * CELL, 3 * CELL]], inkMat);
            pupil.position.z = 0.0032;
            eye.add(pupil);
            // 글린트 — **한 칸짜리 흰 사각** 하나. 1930s 카툰은 3D 글로시 하이라이트를 쓰지 않는다.
            //   동공 위 안쪽 모서리 칸에 얹는다(동공 안에 있어야 '눈빛'으로 읽힌다 — 밖에 두면 흰자에
            //   찍힌 점이라 티가 안 난다).
            const glint = this.flatPatch([[-sgn * CELL, 0.5 * CELL, CELL, CELL]], new THREE.MeshBasicMaterial({ color: 0xffffff }));
            glint.position.z = 0.0048;
            eye.add(glint);
            // 볼터치 — 반투명 분홍 (캐주얼 3D 표정 온기). 🧊 눌린 구(8×6 ≈ 96 tri) → **칸 패치 2 tri**.
            //   옛 스케일(0.026 × (1.2, 0.7)) 이 0.062×0.036 이라 격자로는 **4×2칸**이다.
            //   ⚠️ 얼굴 앞면(`FACE_ZC`)에서 파생시킨다 — 옛 z 0.144 는 **구 시절 곡면 값**이라 상자
            //      앞면(0.184) 기준으로는 한참 **안쪽**이다(눈·눈썹이 같은 이유로 이미 옮겨졌다).
            //      그대로 두면 볼터치가 두상 속에 잠겨 아예 안 보인다.
            const blush = this.flatPatch([[0, 0, 4 * CELL, 2 * CELL]], new THREE.MeshBasicMaterial({ color: 0xf29a8a, transparent: true, opacity: 0.38 }));
            blush.position.set(dx * 1.28, -0.006, FACE_ZC + 0.002);
            faceG.add(blush);
            // 눈썹 — 눈 위로 올린 굵은 칸 막대. 🧊 6각 실린더(≈24 tri) → **계단 2단 패치(4 tri)**.
            //   비평가가 *"눈·눈썹·입"* 을 한 묶음으로 짚었고, 매끈한 원통 막대만 남으면 칸 눈 위에서
            //   그 하나가 화풍을 깬다. 기울기는 회전이 아니라 **한 칸 계단**으로 낸다 — 격자에서 각도를
            //   회전으로 주면 칸 경계가 어긋나 가장자리가 지저분해진다(계단이 곧 화풍이다).
            //   바깥쪽이 한 칸 위로 올라가 옛 `rotation.z` 의 방향(바깥이 높다)을 그대로 잇는다.
            const BROW_W = 4, BROW_Y = 0.170;
            const brow = this.flatPatch([
                [-sgn * BROW_W * CELL / 4, 0, (BROW_W / 2) * CELL, CELL],           // 안쪽 절반 — 아래 단
                [sgn * BROW_W * CELL / 4, CELL, (BROW_W / 2) * CELL, CELL],          // 바깥쪽 절반 — 한 칸 위
            // 🚨 **재질을 `MeshBasicMaterial` 로 바꾸지 말 것 — 실측으로 한 번 당했다.** 같은 색
            //   `0x33281a` 를 Basic 으로 물렸더니 화면에서 **밝은 탠(≈122,110,90)** 으로 떠서 옛 주석이
            //   경고한 바로 그 '금색 막대'가 됐다. 원인은 블룸이 아니라 **선형→sRGB 출력 변환**이다 —
            //   Basic 은 조명을 안 받아 색이 그대로 나가는데 그 값이 선형으로 해석돼 감마가 걸린다
            //   (51/255)^(1/2.2)·255 ≈ 122. 눈 동공·입술선(`inkMat`)이 새까맣지 않고 슬레이트 회색으로
            //   보이는 것도 같은 이유다(그쪽은 그 톤을 전제로 이미 자리를 잡았다). 눈썹은 **Lambert 라야**
            //   옛 잉크 갈색이 유지된다.
            ], new THREE.MeshLambertMaterial({ color: 0x33281a }));   // 잉크 갈색 — 종전 0x6e4e1a 는 이 조명에서 '금색 막대'로 읽혔다
            brow.position.set(dx, BROW_Y, FACE_ZC + 0.002);         // 눈썹도 상자 앞면에 (구 시절 0.144 는 곡률 몫이었다)
            faceG.add(brow);
        }
        // 코 — 러버호스 벌브(버튼) 코. 🧊 구(12×9 = 216 tri) → **칸 상자**. 코는 얼굴에서 **튀어나오므로**
        //   납작한 패치가 아니라 진짜 입체다 — 두상과 같은 `skinVox` 로 구워 AO·이음새까지 같이 맞춘다.
        // 🚨 **폭이 3칸인 건 취향이 아니라 눈과의 간섭 때문이다 — 줄이지 말고 늘리지도 말 것.**
        //   옛 주석은 눈 판 안쪽 가장자리를 `0.082 − 0.056·cos(0.47) = 0.032` 로 잡고 코 반폭 0.031 을
        //   그 안이라 봤는데, **눈이 사각 흰자가 되면서 그 유도가 무효가 됐다**: 이제 안쪽 가장자리는
        //   `EYE_X − 3.5칸 = 0.026` 이라 **6.1mm 안쪽**이고, 옛 코(반폭 0.031)는 흰자를 **5.0mm 파고든다.**
        //   코가 앞으로 튀어나와 있어 눈판보다 앞이라 실제로 흰자 안쪽 아래 모서리를 덮었다.
        //   ⚠️ **어느 게이트도 이걸 안 잡는다** — `probe-eye-contrast` 는 흰자 한가운데를,
        //   `probe-face-helmet-clear` 는 투구 가림률을 볼 뿐 **코와 눈 사이는 아무도 안 본다.**
        //   허용 폭 = 0.026×2 = 0.052 = 3.25칸 → **3칸(0.048, 반폭 0.024)**. 4칸(0.064)이면 다시 겹친다.
        //   깊이는 **2칸**이다 — 3칸(0.048)으로 구웠더니 3/4 뷰에서 얼굴 밖으로 튀어나온 **선반**처럼
        //   읽혔다(실측 캡처). 옛 구의 돌출량이 0.223−0.184 = **0.039** 였으니 2칸(0.032)이 그 자리다.
        // 🚨 **평평한 앞면 한 장짜리 상자는 정면에서 통째로 사라진다 — 실측으로 확인했다.** 3×3×2 를
        //   민짜로 구웠더니 정면 캡처에서 코가 **가느다란 가로선 하나**로만 남았다. 당연하다: 앞면이
        //   얼굴 평면과 **같은 방향을 보고 같은 빛을 받아** 색이 똑같고, 옆면은 정면에서 안 보인다.
        //   옛 구는 곡률이 있어 그라디언트로 읽혔던 것이라 **상자로 옮기는 순간 그 신호가 없어진다.**
        //   → **두 단 계단**으로 깎는다: 밑단 3×3×1 위에 코끝 3×2×1 을 **아래 두 행에만** 한 칸 더 앞으로.
        //   그러면 코끝 **윗면(수평면)** 이 생겨 얼굴 평면과 다른 빛을 받아 **정면에서도 단이 읽힌다.**
        //   아래가 더 튀어나오는 건 실제 코의 생김새(콧대는 얕고 코끝이 나온다)와도 맞는다.
        const NOSE_W = 3, NOSE_H = 3, NOSE_D = 2;
        // 🚨 **계단만으로는 부족했다 — 색을 한 단 내려야 정면에서 읽힌다(2차 실측).** 계단을 넣으니
        //   3/4 뷰에서는 코가 살아났는데 **정면에서는 여전히 가느다란 가로선 두 줄**이었다. 이유는
        //   위와 같다: 앞을 보는 면끼리는 **법선이 같아 빛도 같으므로** 아무리 단을 나눠도 색이 안 갈린다.
        //   복셀 아트가 이걸 푸는 방법은 조명이 아니라 **팔레트 한 단**이다(이 파일이 `dark`/`light` 를
        //   `offsetHSL` 로 파생시켜 쓰는 것과 같은 수법). 명도 −0.06 이면 '다른 물건'이 아니라
        //   **'그늘진 같은 살'** 로 읽히는 선이다 — 더 내리면 코가 붙여 놓은 스티커가 된다.
        const noseMat = skinVox.clone();
        noseMat.color = skinVox.color.clone().offsetHSL(0, 0, -0.14);
        const nose = this.voxPart(Voxel.merge(
            Voxel.box(NOSE_W, NOSE_H, 1),                       // 콧대 — 얼굴에 붙는 칸
            Voxel.at(Voxel.box(NOSE_W, NOSE_H - 1, 1), 0, 0, 1), // 코끝 — 아래 두 행만 한 칸 앞으로
        ), noseMat);
        //   z: 상자 **뒷면**을 얼굴 앞면에 붙여 앞으로만 튀어나오게 한다(옛 구는 절반이 머리에 묻혀 있었다).
        nose.position.set(0, 0.028, FACE_ZC + (NOSE_D / 2) * this.VOX);
        faceG.add(nose);
        // 입 — 넓은 미소(사용자 지시 "넓은 미소"). 반원 구강 + 아랫니 띠 + 잉크 입술선 3겹.
        //   종전은 폭 0.032 의 옅은 아크라 얼굴 대비 1/6 도 안 됐다. 1930s 카툰 입은 얼굴 폭의 절반 이상이다.
        const MOUTH_W = 0.078;
        const mouthG = new THREE.Group();
        mouthG.position.set(0, -0.030, FACE_ZJ + 0.002);   // 입은 **턱 상자** 앞면 (0.154 — 옛 값과 사실상 같다)
        // 🧊 **기울기를 0 으로 내렸다 (2026-08-20).** 옛 `rotation.x = 0.18` 은 *"턱 곡면을 따라 살짝
        //    아래를 보게"* 한 값인데, 턱이 상자가 된 뒤로 그 앞면은 **평면**이라 기울일 곡면이 없다
        //    (눈이 `EYE_TILT = 0` 으로 간 것과 같은 이유·같은 판단).
        // 🚨 그냥 화풍 문제가 아니라 **실제로 입이 얼굴 속으로 잠겼다** — 기울이면 원점에서 먼 아래
        //    행일수록 z 가 뒤로 밀린다(맨 아래 행 y −0.040 → z −0.0072). 턱 앞면이 0.152, 입 그룹이
        //    0.154 라 **0.0072 를 빼면 0.147 로 앞면 뒤쪽**이 된다. 실측 캡처에서 계단 두 행이 통째로
        //    사라지고 윗니 띠만 남아 **미소가 일자 막대**로 보였다(반원 시절엔 도형이 낮고 둥글어
        //    가장자리만 얕게 잠겨 티가 덜 났다). 기울기를 되살리려면 그 z 손실부터 되갚을 것.
        faceG.add(mouthG);
        // 🧊 **반원 → 계단 미소 (2026-08-20, 눈과 같은 슬라이스).** 옛 입은 반원 구강 + 반원 띠 +
        //    **반토러스 입술선**이었는데, 그 토러스 하나가 `TorusGeometry(_, _, 6, 22, π)` = **264 tri**
        //    로 얼굴에서 제일 비싼 물건이었다(입 전체 310 tri). 계단으로 옮기면 12 tri 다 — 화풍도 맞고
        //    빠듯한 `probe-hero-tris` 예산도 같이 푼다.
        // 🔑 **곡선은 '칸 수를 줄여 가며' 낸다.** 폭 2·MOUTH_W = 0.156 ≈ **10칸**, 깊이는 옛 세로배율
        //    (MOUTH_W·0.62 = 0.048) 그대로 **3칸**. 행마다 10 → 8 → 6칸으로 좁히면 아래로 볼록한
        //    미소가 된다(칸을 하나씩 줄여야 계단이 고르다 — 2칸씩 줄이면 세 행이 삼각형이 된다).
        //   ⚠️ 칸 수는 **`MOUTH_W` 에서 파생시킨다** — 손으로 10 이라 적어 두면 폭을 바꾼 다음 세션에서
        //      입만 옛 크기로 남는다(두상 상자가 얼굴 앵커를 무효로 만들었던 위 🚨 와 같은 사고다).
        const MCELL = this.VOX, MW = Math.round(MOUTH_W * 2 / MCELL), MROWS = [MW, MW - 2, MW - 4];
        const mrow = i => -(i + 0.5) * MCELL;                // 행 i(0=위)의 중심 y — 입은 원점 **아래**로 걸린다
        // 입술선 — 계단 실루엣을 **한 겹 뒤에서 살짝 키워** 두른다. 테두리를 따로 그리면 사각형이
        //   여러 장 필요하지만, 같은 계단을 키워 뒤에 깔면 3장으로 균일한 외곽선이 나온다.
        //   ⚠️ 행끼리 세로로 LIP 만큼 겹치므로 계단 모서리에서도 선이 끊기지 않는다.
        const LIP = 0.006;
        const lip = this.flatPatch(MROWS.map((w, i) => [0, mrow(i), w * MCELL + LIP * 2, MCELL + LIP * 2]), inkMat);
        lip.position.z = -0.0008;
        mouthG.add(lip);
        // 구강 — 윗니 아래 두 행만 진홍. 맨 윗행은 아래 윗니가 통째로 덮으므로 굽지 않는다.
        const maw = this.flatPatch(MROWS.slice(1).map((w, i) => [0, mrow(i + 1), w * MCELL, MCELL]), new THREE.MeshBasicMaterial({ color: 0x5a1f24 }));
        mouthG.add(maw);
        // 윗니 띠 — 입술선 바로 아래에 붙는 흰 띠. **아래쪽에 깔면 '혀'로 읽힌다**(실측 캡처에서
        //   분홍 덩어리가 턱 쪽에 고여 그렇게 보였다). 1930s 카툰 웃음은 윗니가 위에 붙어 있다.
        //   격자에서는 **맨 윗행 한 칸**이 그 띠다(옛 세로배율 0.17 ≈ 0.8칸).
        const teeth = this.flatPatch([[0, mrow(0), MW * MCELL, MCELL]], new THREE.MeshBasicMaterial({ color: 0xf7f2e6 }));
        teeth.position.z = 0.0016;
        mouthG.add(teeth);
        // 머리카락 없음 — 기본형은 대머리 치비 (사용자 지시 2026-08-18: "아무것도 장착 안 했을 때
        // 대머리 치비 캐릭터가 기본형"). 투구는 종전대로 headMount 에 얹힌다.
        // 기존 헬멧 시스템 부착점 (Scene3D.helmetG가 여기 붙음 — 머리 중심 기준)
        const headMount = new THREE.Group();
        headMount.position.y = 0.08;
        headG.add(headMount);
        R.headMount = headMount;

        root.position.y = 0.08; // 발바닥이 지면에 닿는 보정 — 다리 연장분은 pelvis 상향으로 상쇄돼 있다
        const outer = new THREE.Group();
        outer.add(root);
        // ---- ㉢ 비례 교정의 마지막 한 수: 전신 높이 되돌리기 ----
        // 다리를 +55% 늘이면 영웅이 통째로 12% 커진다. 그러면 **비례가 아니라 크기가 바뀐 것**이라
        // 적과의 대비·카메라 프레이밍·탈것 안장 높이(`heroPelvisLocalY` 기반)까지 전부 끌려간다.
        // 바깥 그룹에 역배율을 걸어 **화면에서 차지하는 높이는 교정 전과 같게** 두고, 바뀐 것이
        // 오직 두신비·다리비뿐이게 만든다.
        // 접지 보정 — 배율을 걸면 발바닥이 지면 위로 뜬다(그룹 원점이 발이 아니므로).
        // 상수로 박지 않고 **실제 bbox 하단**에서 되돌린다(부츠·다리 길이를 또 손봐도 따라온다).
        // ⚠️ bbox 는 배율을 **걸기 전에** 뜬다 — setFromObject 는 월드 기준이라, 배율을 먼저 걸면
        //    outer 공간 값이 아니라 축소된 월드 값이 나와 보정이 좌표계를 섞는다.
        root.updateWorldMatrix(true, true);
        const footLocal = new THREE.Box3().setFromObject(root).min.y;
        outer.scale.setScalar(this.BODY_SCALE);
        root.position.y += this.GROUND_Y / this.BODY_SCALE - footLocal;
        R.group = outer;
        R.root = root;

        // 🧊 진짜 단순 큐브 캐릭터 (사용자 2026-08-21 "머리1·몸통1·팔다리 각1 큐브, 맨살") —
        //    기사 리그의 모든 몸 메시를 숨기고, 관절에 살색 박스 하나씩만 얹는다. 머리(두상+눈)만 유지.
        {
            R._simple = true;   // 통짜 박스 리그 — update 에서 팔 각도 클램프(머리 관통 방지)에 씀
            // 갑옷·스커트·눈 등 기존 몸 메시 전부 **제거**(숨김은 refreshHeroEquip 이 되살린다).
            const kill = [];
            const scan = g => g && g.traverse(o => { if (o.isMesh && !(o.userData && o.userData.simpleBox)) kill.push(o); });
            scan(outer); scan(root);
            kill.forEach(o => { if (o.parent) o.parent.remove(o); });
            const skinM = new THREE.MeshStandardMaterial({ color: 0xe0a074, metalness: 0, roughness: 0.62, flatShading: true }); // 더 살색(사용자 2026-08-21)
            const inkM = new THREE.MeshBasicMaterial({ color: 0x1c1c22 });
            const whiteM = new THREE.MeshBasicMaterial({ color: 0xffffff }); whiteM.toneMapped = false;
            const pupilM = new THREE.MeshBasicMaterial({ color: 0x111114 }); pupilM.toneMapped = false; // 검정 동공
            const add = (parent, mat, w, h, d, x, y, z) => {
                const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
                b.position.set(x, y, z); b.userData.simpleBox = true; parent.add(b); return b;
            };
            // 🎮 마인크래프트 비율 (1px=0.05): 머리8 · 몸통 8×12×4 · 팔다리 각 4×12×4.
            // 🔑 애니: 다리는 hipL/hipR(골반 자식), 팔은 shoulderL/shoulderR(척추 자식) 본에 넣는다 —
            //    걷기/공격/죽음 클립이 이 본들을 돌리므로 박스가 자동으로 스윙·낙하한다. 피벗=관절, 박스는 아래로.
            const PX = 0.05;
            const headS = 8 * PX, torW = 8 * PX, torH = 12 * PX, torD = 4 * PX;
            const limbW = 4 * PX, limbH = 12 * PX, limbD = 4 * PX, armW = 4 * PX;
            const FEET = -0.44, hipY = FEET + limbH, torTop = hipY + torH;   // 골반 로컬
            const spineY = R.bones.spine.position.y;
            // 🧥 장비 의상(equip-full-set-build)이 같은 치수로 옷 박스를 지어야 해서 리그에 공개한다.
            //    Scene3D.dressMcHero(착용)·makeArmorPreview(썸네일)가 이 값을 읽는다 — 여기 치수를
            //    바꾸면 옷이 몸을 못 감싼다(치수는 한 곳, 여기서만 정의할 것).
            R.mc = { PX, headS, torW, torH, torD, limbW, limbH, limbD, armW, FEET, hipY, torTop, spineY };
            // 다리
            [['hipL', -1], ['hipR', 1]].forEach(([k, s]) => {
                const j = R.bones[k]; j.position.set(s * (limbW / 2), hipY, 0); j.rotation.set(0, 0, 0);
                add(j, skinM, limbW, limbH, limbD, 0, -limbH / 2, 0);
            });
            // 팔 (피벗=몸통 top)
            [['shoulderL', -1], ['shoulderR', 1]].forEach(([k, s]) => {
                const j = R.bones[k]; j.position.set(s * (torW / 2 + armW / 2), torTop - spineY, 0); j.rotation.set(0, 0, 0);
                add(j, skinM, armW, limbH, limbD, 0, -limbH / 2, 0);
            });
            // 몸통 (척추)
            add(R.bones.spine, skinM, torW, torH, torD, 0, (hipY + torH / 2) - spineY, 0);
            // 머리 (headG = neck 자식). headG 의 골반-로컬 y 를 본 체인으로 구해 머리를 몸통 위에 얹는다.
            const hH = R.bones.head; hH.scale.setScalar(1); hH.rotation.set(0, 0, 0);
            const headGY = spineY + R.bones.neck.position.y + hH.position.y;
            const hy = (torTop + headS / 2) - headGY;   // headG 로컬 머리 중심
            add(hH, skinM, headS, headS, headS, 0, hy, 0);
            // 마인크래프트식 얼굴 — **평면 디캘**(사용자 2026-08-21: 얼굴을 디캘 방식으로).
            //   튀어나온 큐브가 아니라 머리 앞면에 납작하게 그린 판. whiteM/pupilM 의 toneMapped=false 는
            //   흰자가 피부에 묻히지 않게 하는 핵심이라 유지(위 probe-eye-contrast 주석 참조).
            const fz = headS / 2 + 0.002, eyeY = hy + headS * 0.06;
            const decal = (mat, w, h, x, y, z) => {
                const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
                m.position.set(x, y, z); m.userData.simpleBox = true; hH.add(m); return m;
            };
            for (const sx of [-1, 1]) {
                decal(whiteM, 0.12, 0.13, sx * 0.115, eyeY, fz);
                decal(pupilM, 0.06, 0.13, sx * 0.115, eyeY, fz + 0.002);
                decal(inkM, 0.13, 0.028, sx * 0.105, eyeY + 0.093, fz + 0.001);   // 눈썹
            }
            decal(inkM, 0.14, 0.03, 0, hy - headS * 0.22, fz + 0.001);            // 입
        }

        // 베이스 포즈 기록 (매 프레임 여기서 시작해 클립 오프셋을 얹음)
        // ⚠️ 스케일도 기록한다 — 스쿼시&스트레치 트랙(`sx/sy/sz`)이 **곱셈 오프셋**이라 매 프레임
        //    본래 배율로 되돌린 뒤 곱해야 한다. headG 처럼 빌드 때 이미 1.30 이 걸린 본이 있어서
        //    1 로 리셋하면 치비 머리가 통째로 작아진다(`probe-hero-proportion` 의 두신비 게이트가 잡는다).
        const rec = (o) => ({ rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, px: o.position.x, py: o.position.y, pz: o.position.z,
            sx: o.scale.x, sy: o.scale.y, sz: o.scale.z });
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
                // 팔꿈치·무릎 미세 굽힘 — 차렷 막대기 자세 탈피 (사용자 지적)
                'elbowL.rx': [[0, -0.22], [0.5, -0.16], [1, -0.22]],
                'elbowR.rx': [[0, -0.18], [0.5, -0.25], [1, -0.18]],
                'kneeL.rx': [[0, -0.05], [0.5, -0.08], [1, -0.05]],
                'kneeR.rx': [[0, -0.08], [0.5, -0.05], [1, -0.08]],
                'hipL.rx': [[0, 0.04], [1, 0.04]],
                'hipR.rx': [[0, 0.06], [1, 0.06]],
                // ===== 1930s 카툰 대기 — "정지가 없다" + 스쿼시&스트레치 (사용자 추가 2026-08-19) =====
                // ⚠️ **접지를 건드리지 않으려면 스쿼시는 root 가 아니라 spine 에 건다.** root 는 원점이
                //    발 위에 있어 sy 를 만지면 발이 지면을 뚫거나 뜬다(GROUND_Y 보정이 통째로 어긋난다).
                // ⚠️ 진폭 상한은 `probe-hero-proportion` 의 **크기 불변 게이트(전신 1.785 ±3%)** 다.
                //    척추 위에 머리가 얹혀 있어 척추 sy 의 증분이 전신 높이에 거의 그대로 실린다 —
                //    +3.5% 를 걸고 머리로 −2.2% 를 되받아 순증을 게이트 안에 둔다. 더 키우려면
                //    그 프로브부터 다시 돌릴 것.
                // 실측(`probe-hero-squash`): 아래 값에서 척추 배율이 0.997~1.032(진폭 3.5%)로 흔들리고
                // **전신 높이의 사이클 변동폭은 2.3%** 다(back 이징의 오버슈트가 키 값보다 조금 더 간다 —
                // 키에 적은 3.2% 를 그대로 예산으로 잡으면 안 된다).
                'spine.sy': [[0, 1], [0.5, 1.028, 'back'], [1, 1, 'back']],   // 들숨에 늘어났다 오버슈트하며 안착
                'spine.sx': [[0, 1], [0.5, 0.986], [1, 1]],                   // 부피 보존 — 늘어나면 가늘어진다
                'spine.sz': [[0, 1], [0.5, 0.986], [1, 1]],
                'head.sy': [[0, 1], [0.5, 0.975, 'back'], [1, 1, 'back']],    // 머리는 **반대로** 눌린다(카툰 대비)
                'head.sx': [[0, 1], [0.5, 1.025], [1, 1]],
                // 까딱임 2겹 — 느린 좌우 기울임(back 이징으로 지나쳤다 돌아옴) + 그 2배속 도리질.
                //   ⚠️ 요우(ry)는 `hero-gaze-forward-attack` 규약(시선 전방)에 걸리는 채널이라 0.04rad
                //      이하로만 쓴다. `probe-hero-gaze` 절대 게이트가 0.25rad 이다.
                'head.rz': [[0, 0], [0.28, 0.05, 'back'], [0.66, -0.038, 'back'], [1, 0, 'back']],
                'head.ry': [[0, 0], [0.25, 0.04], [0.5, 0], [0.75, -0.04], [1, 0]],
            }
        },
        Walking: {
            // 4포즈 보행 사이클(토오프→스윙 최대 접힘→콘택트→하중 수용→패싱) — 사용자 재검수 반영:
            // 왼다리 기준 0=토오프(뒤), 0~0.5=스윙(0.15에 무릎 72° 접힘·발꿈치 차올림), 0.45=전방 콘택트(무릎 폄),
            // 0.6=하중 수용 굽힘, 0.75=패싱. 오른다리는 +0.5 위상. 정지 프레임에서도 무릎 접힘이 보이게 과장.
            dur: 0.66, loop: true, tracks: {
                'hipL.rx': [[0, 0.62], [0.15, 0.1], [0.3, -0.4], [0.45, -0.65], [0.55, -0.55], [0.75, 0], [1, 0.62]],
                'kneeL.rx': [[0, -0.5], [0.15, -1.25], [0.35, -0.5], [0.48, -0.12], [0.6, -0.45], [0.75, -0.18], [0.9, -0.35], [1, -0.5]],
                'hipR.rx': [[0, -0.6], [0.05, -0.55], [0.25, 0], [0.5, 0.62], [0.65, 0.1], [0.8, -0.4], [0.95, -0.65], [1, -0.6]],
                'kneeR.rx': [[0, -0.3], [0.1, -0.45], [0.25, -0.18], [0.4, -0.35], [0.5, -0.5], [0.65, -1.25], [0.85, -0.5], [0.98, -0.12], [1, -0.3]],
                'shoulderL.rx': [[0, -0.6], [0.25, -0.2], [0.5, 0.5], [0.75, 0.1], [1, -0.6]],
                'shoulderR.rx': [[0, 0.5], [0.25, 0.1], [0.5, -0.6], [0.75, -0.2], [1, 0.5]],
                // 팔꿈치: 뒤 스윙에서 뚜렷이 굽고 앞 스윙에서 살짝 펴짐 (강체 튜브 팔 금지)
                'elbowL.rx': [[0, -0.25], [0.5, -0.8], [1, -0.25]],
                'elbowR.rx': [[0, -0.8], [0.5, -0.25], [1, -0.8]],
                'spine.rx': [[0, 0.1], [1, 0.1]],
                // 어깨·골반 역위상 요우 — 골반이 왼쪽 돌 때 상체는 오른쪽 (걷기 판독성, 비평가 지적)
                'spine.ry': [[0, 0.3], [0.5, -0.3], [1, 0.3]],
                'pelvis.ry': [[0, -0.17], [0.5, 0.17], [1, -0.17]],
                'pelvis.rz': [[0, 0.05], [0.5, -0.05], [1, 0.05]],
                // ===== 러버호스 바운스 워크 (`cute-art-direction` 사용자 추가 2026-08-19) =====
                // 1930s 카툰 걷기는 **매 발디딤에 몸이 통통 튄다**. 바운스 진폭을 키우고(0.045→0.075) 착지에
                // `bounce`, 도약에 `back` 이징을 얹어 '오른다/떨어진다'가 기계적 사인이 아니게 한다.
                // 스트라이드당 접지가 2번(0.45·0.95)이라 스쿼시도 2주기다.
                'root.py': [[0, 0.075, 'back'], [0.22, 0.012, 'bounce'], [0.45, 0.004], [0.72, 0.078, 'back'], [0.95, 0.004, 'bounce'], [1, 0.075, 'back']],
                // 스쿼시&스트레치 — **접지에서 눌리고(sy<1) 도약 정점에서 늘어난다(sy>1)**. 척추에 건다
                //   (root 에 걸면 접지가 어긋난다 — 대기 클립과 같은 이유). 부피 보존으로 sx/sz 는 반대.
                //   ⚠️ 걷기는 대기보다 크게 써도 된다(접지가 다리 포즈로 잡히고 root.py 가 이미 튄다) —
                //      다만 도약 정점에서 발이 뜨는 건 카툰에선 정상이라 접지 게이트를 walk 엔 안 건다.
                'spine.sy': [[0, 1.05, 'back'], [0.22, 0.95, 'bounce'], [0.45, 0.97], [0.72, 1.05, 'back'], [0.95, 0.95, 'bounce'], [1, 1.05, 'back']],
                'spine.sx': [[0, 0.975], [0.22, 1.03], [0.45, 1.02], [0.72, 0.975], [0.95, 1.03], [1, 0.975]],
                'spine.sz': [[0, 0.975], [0.22, 1.03], [0.45, 1.02], [0.72, 0.975], [0.95, 1.03], [1, 0.975]],
                'head.sy': [[0, 0.965], [0.22, 1.04], [0.45, 1.02], [0.72, 0.965], [0.95, 1.04], [1, 0.965]],  // 머리는 반대 위상(카툰 대비)
                'head.sx': [[0, 1.025], [0.22, 0.97], [0.45, 0.985], [0.72, 1.025], [0.95, 0.97], [1, 1.025]],
                // 머리 상하 까딱 — 도약마다 살짝 늦게 따라 오르는 오버슈트(팔로스루)
                'head.py': [[0, 0.006, 'back'], [0.28, -0.004, 'bounce'], [0.72, 0.006, 'back'], [1, 0.006, 'back']],
                'cape.rx': [[0, 0.26], [0.25, 0.44], [0.5, 0.3], [0.75, 0.44], [1, 0.26]], // 걸음마다 출렁 — 강체 삼각형 오독 (비평가 6번)
                'cape.rz': [[0, 0.06], [0.5, -0.06], [1, 0.06]],
                'neck.rx': [[0, -0.08], [1, -0.08]],
            }
        },
        // ═══ 근접 공격 클립 공통 규약 (swing-snap 재작업 2026-08-21) ═══════════════════════════
        //  ⓐ **양 끝값은 Idle 0초 포즈와 같게** 둔다(shoulderR.rx −0.14 / rz −0.06, spine.rx 0.02,
        //     hip 0.04·0.06, knee −0.05·−0.08). 예전엔 −0.2 로 시작·종료해 공격 진입/이탈마다
        //     0.06rad 씩 툭 튀었다(실측 diag: 클립 종료 다음 프레임 ΔshR +0.060).
        //  ⓑ **4박자**: 반대 방향 예비(counter, ~8%) → 와인드업 상승 → 무빙 홀드(정지감, ~10%)
        //     → 가속 타격('in') → 오버슈트 팔로스루('out') → 느린 회복. 타격 대비 회복이 1.5배 길다
        //     ("빠르게 치고 느리게 회복").
        //  ⓒ **하체가 같이 친다**: hip/knee 트랙 필수. 예전 근접 클립엔 다리 트랙이 아예 없어
        //     (chop 의 kneeL 하나 빼고) 상체만 휘두르고 발이 마네킹이었다(실측 진폭 0.000).
        //     탑승 중엔 ProChar.update 가 이 4관절 트랙을 건너뛴다(안장 자세 보호).
        //  ⓓ **rz 는 [−0.5, 0.6] 밖으로 쓰지 않는다**(박스 팔 머리 관통 클램프). 특히 팔이 머리 위로
        //     올라간 와인드업에서 rz 를 **음수(몸 안쪽)로 주면 팔이 머리를 관통**한다 — 위로 들 땐
        //     바깥(양수)으로, 몸을 가로지르는 건 팔이 내려온 팔로스루에서만.
        slash: { // 대각 베기: 예비 → 어깨 위 와인드업 → 홀드 → 가속 베기 → 팔로스루 → 회복
            dur: 0.5, tracks: {
                'shoulderR.rx': [[0, -0.14], [0.075, 0.16], [0.27, -2.10, 'out'], [0.345, -2.04], [0.45, -0.30, 'in'], [0.55, 1.00, 'out'], [0.76, 0.34], [1, -0.14]],
                'shoulderR.rz': [[0, -0.06], [0.0675, -0.02], [0.27, 0.34, 'out'], [0.345, 0.32], [0.45, -0.08, 'in'], [0.55, -0.42, 'out'], [0.76, -0.18], [1, -0.06]],
                'elbowR.rx': [[0, -0.15], [0.27, -0.30], [0.45, -0.06], [0.55, -0.02], [1, -0.15]],   // 박스 팔엔 팔꿈치 마디가 없다 — 여기 진폭은 곧 **무기 힌지**라 크게 쓰면 무기만 따로 논다
                'spine.ry': [[0, 0], [0.0675, 0.07], [0.27, -0.58, 'out'], [0.345, -0.56], [0.45, 0.20, 'in'], [0.55, 0.55, 'out'], [0.76, 0.22], [1, 0]],
                // 하체: 뒷발에 체중을 실었다가(0.27) 앞발을 내디디며 친다(0.45~0.58)
                'hipL.rx': [[0, 0.04], [0.0675, 0.16], [0.27, 0.24], [0.45, -0.34, 'in'], [0.58, -0.44, 'out'], [0.79, -0.12], [1, 0.04]],
                'hipR.rx': [[0, 0.06], [0.0675, -0.10], [0.27, -0.16], [0.45, 0.30, 'in'], [0.58, 0.40, 'out'], [0.79, 0.14], [1, 0.06]],
                'kneeL.rx': [[0, -0.05], [0.0675, -0.22], [0.27, -0.32], [0.45, -0.10], [0.58, -0.06], [0.79, -0.14], [1, -0.05]],
                'kneeR.rx': [[0, -0.08], [0.0675, -0.16], [0.27, -0.26], [0.45, -0.34], [0.58, -0.48, 'bounce'], [0.79, -0.18], [1, -0.08]],
                'pelvis.ry': [[0, 0], [0.27, 0.18], [0.45, -0.14], [0.58, -0.20], [1, 0]],   // 골반이 상체와 역위상으로 돌아 허리에서 힘이 난다
                // 🚨 hero-gaze-forward-attack(사용자 지시 2026-08-19): 공격 중 시선이 뒤로 돌면 안 된다.
                // spine.ry 비틀림이 목·머리까지 통째로 끌고 가서(neck 이 spine 하위) 와인드업마다
                // 얼굴이 적 반대편을 봤다 — 치비 큰 머리라 특히 눈에 띈다. spine.ry 를 쓰는 공격 클립은
                // 반드시 neck.ry 를 **같은 키 시각에 −0.85배**로 얹어 머리를 전방(적)에 남길 것
                // (bow 클립의 기존 neck.ry 조준 유지와 같은 문법 — 15%만 따라가 목이 뻣뻣하지 않게).
                'neck.ry': [[0, 0], [0.0675, -0.06], [0.27, 0.49, 'out'], [0.345, 0.48], [0.45, -0.17, 'in'], [0.55, -0.47, 'out'], [0.76, -0.19], [1, 0]],
                'spine.rx': [[0, 0.02], [0.0675, -0.09], [0.27, -0.16], [0.45, 0.12, 'in'], [0.55, 0.30, 'out'], [0.76, 0.15], [1, 0.02]],
                'shoulderL.rx': [[0, -0.1], [0.0675, -0.26], [0.27, 0.34], [0.45, -0.30], [0.55, -0.62], [0.76, -0.28], [1, -0.1]],
                'cape.rx': [[0, 0.05], [0.3, 0.5], [0.58, 0.22], [1, 0.05]],
                // ===== 1930s 카툰 예비동작·팔로스루 (`cute-art-direction` 사용자 추가 2026-08-19) =====
                // 🚨 **접촉 창(0.38~0.55)에서는 척추 배율을 정확히 1.0 으로 둔다** — 여기를 만지면 어깨→팔→무기
                //    끝이 딸려 움직여 `probe-impact-sync`(무기 끝 접촉 시각 vs 임팩트 연출)가 어긋난다.
                //    스쿼시는 **와인드업(0~0.35)과 팔로스루 착지(0.55~1.0)에만** 얹는다.
                // 와인드업 = 몸을 뒤·위로 세워 코일(stretch), 스윙 직전 0.38 에서 1.0 복귀 → 휘두르며 아래로.
                'spine.sy': [[0, 1], [0.15, 1.055, 'back'], [0.27, 1.05], [0.375, 1.0], [0.55, 1.0], [0.73, 0.955, 'bounce'], [1, 1, 'back']],
                'spine.sx': [[0, 1], [0.15, 0.97], [0.27, 0.975], [0.375, 1.0], [0.55, 1.0], [0.73, 1.03], [1, 1]],
                'spine.sz': [[0, 1], [0.15, 0.97], [0.27, 0.975], [0.375, 1.0], [0.55, 1.0], [0.73, 1.03], [1, 1]],
                // 머리는 반대 위상(카툰 대비) — 와인드업에 눌리고 착지에 늘어난다. 접촉 창은 1.0.
                'head.sy': [[0, 1], [0.15, 0.955], [0.27, 0.96], [0.375, 1.0], [0.55, 1.0], [0.73, 1.045], [1, 1]],
                'head.sx': [[0, 1], [0.15, 1.03], [0.27, 1.025], [0.375, 1.0], [0.55, 1.0], [0.73, 0.97], [1, 1]],
            }
        },
        chop: { // 도끼: 머리 위로 크게 들어(홀드) 내려찍고 무릎으로 충격을 받는다
            dur: 0.55, tracks: {
                // rz 는 0 부근으로 — 정면 내려찍기라 팔이 **머리 위를 지난다**(안쪽으로 끌면 관통)
                'shoulderR.rx': [[0, -0.14], [0.0758, 0.20], [0.2881, -2.40, 'out'], [0.3639, -2.34], [0.47, -0.55, 'in'], [0.57, 0.92, 'out'], [0.785, 0.30], [1, -0.14]],
                'shoulderR.rz': [[0, -0.06], [0.2881, 0.12], [0.47, -0.02], [0.57, -0.06], [1, -0.06]],
                'elbowR.rx': [[0, -0.15], [0.2881, -0.32], [0.47, -0.05], [0.57, -0.02], [1, -0.15]],
                'shoulderL.rx': [[0, -0.1], [0.0682, -0.26], [0.2881, 0.30], [0.47, -0.32], [0.57, -0.55], [0.785, -0.26], [1, -0.1]],
                'spine.rx': [[0, 0.02], [0.0682, -0.12], [0.2881, -0.28], [0.47, 0.22, 'in'], [0.57, 0.46, 'out'], [0.785, 0.20], [1, 0.02]],
                'spine.ry': [[0, 0], [0.2881, -0.24], [0.47, 0.12, 'in'], [0.57, 0.22, 'out'], [1, 0]],
                'neck.ry': [[0, 0], [0.2881, 0.20], [0.47, -0.10], [0.57, -0.19], [1, 0]],   // 시선 전방 유지 (slash 주석 참조)
                // 하체: 뒤로 체중 → 내려찍으며 앞발 착지 → 무릎이 접히며 충격 흡수(bounce)
                'hipL.rx': [[0, 0.04], [0.0682, 0.18], [0.2881, 0.26], [0.47, -0.30, 'in'], [0.6007, -0.40, 'out'], [0.8157, -0.12], [1, 0.04]],
                'hipR.rx': [[0, 0.06], [0.0682, -0.12], [0.2881, -0.18], [0.47, 0.26, 'in'], [0.6007, 0.36, 'out'], [0.8157, 0.12], [1, 0.06]],
                'kneeL.rx': [[0, -0.05], [0.2881, -0.28], [0.47, -0.30], [0.6007, -0.44, 'bounce'], [0.8157, -0.16], [1, -0.05]],
                'kneeR.rx': [[0, -0.08], [0.2881, -0.30], [0.47, -0.40], [0.6007, -0.54, 'bounce'], [0.8157, -0.18], [1, -0.08]],
                'root.py': [[0, 0], [0.2881, 0.045, 'back'], [0.47, -0.012], [0.6007, -0.024, 'bounce'], [0.8464, 0.004], [1, 0]],
                'cape.rx': [[0, 0.05], [0.3184, 0.55], [0.6007, 0.2], [1, 0.05]],
                // 예비동작·팔로스루 스쿼시 (slash 주석 참조 — 접촉 창 0.39~0.57 은 1.0 고정). 접촉 ~0.47.
                'spine.sy': [[0, 1], [0.1819, 1.06, 'back'], [0.2881, 1.05], [0.3942, 1.0], [0.57, 1.0], [0.785, 0.95, 'bounce'], [1, 1, 'back']],
                'spine.sx': [[0, 1], [0.1819, 0.968], [0.2881, 0.975], [0.3942, 1.0], [0.57, 1.0], [0.785, 1.03], [1, 1]],
                'spine.sz': [[0, 1], [0.1819, 0.968], [0.2881, 0.975], [0.3942, 1.0], [0.57, 1.0], [0.785, 1.03], [1, 1]],
                'head.sy': [[0, 1], [0.1819, 0.95], [0.2881, 0.96], [0.3942, 1.0], [0.57, 1.0], [0.785, 1.05], [1, 1]],
                'head.sx': [[0, 1], [0.1819, 1.032], [0.2881, 1.025], [0.3942, 1.0], [0.57, 1.0], [0.785, 0.968], [1, 1]],
            }
        },
        thrust: { // 창: 당겨 코킹(홀드) → 앞발 런지와 함께 찌르고 → 천천히 회수
            dur: 0.45, tracks: {
                // 예전 −1.62 는 어깨 클램프(−0.85)에 반토막 나 창이 아예 안 뻗었다 — 클램프를 푼 지금이 제 값이다
                'shoulderR.rx': [[0, -0.14], [0.2464, 0.26], [0.3286, 0.24], [0.46, -1.72, 'in'], [0.55, -1.88, 'out'], [0.7618, -1.10], [1, -0.14]],
                'elbowR.rx': [[0, -0.2], [0.2464, -0.48], [0.46, 0.02], [0.55, 0.06], [1, -0.2]],
                'spine.ry': [[0, 0], [0.2464, 0.34, 'out'], [0.3286, 0.32], [0.46, -0.42, 'in'], [0.55, -0.50, 'out'], [0.7618, -0.18], [1, 0]],
                'neck.ry': [[0, 0], [0.2464, -0.29], [0.3286, -0.27], [0.46, 0.36], [0.55, 0.43], [0.7618, 0.15], [1, 0]],   // 시선 전방 유지 — 특히 찌르는 순간에 얼굴이 뒤로 가면 안 된다 (slash 주석 참조)
                'spine.rx': [[0, 0.02], [0.2464, -0.14], [0.46, 0.18, 'in'], [0.55, 0.26, 'out'], [0.7618, 0.12], [1, 0.02]],
                'shoulderL.rx': [[0, -0.1], [0.2464, -0.45], [0.46, 0.42], [0.55, 0.52], [0.7618, 0.2], [1, -0.1]],
                // 하체: 뒷발로 밀며 앞발을 깊게 내딛는 런지 — 찌르기는 다리가 만드는 기술이다
                'hipL.rx': [[0, 0.04], [0.2464, 0.30], [0.46, -0.46, 'in'], [0.5765, -0.54, 'out'], [0.8015, -0.16], [1, 0.04]],
                'hipR.rx': [[0, 0.06], [0.2464, -0.14], [0.46, 0.40, 'in'], [0.5765, 0.50, 'out'], [0.8015, 0.16], [1, 0.06]],
                'kneeL.rx': [[0, -0.05], [0.2464, -0.36], [0.46, -0.12], [0.5765, -0.08], [0.8015, -0.14], [1, -0.05]],
                'kneeR.rx': [[0, -0.08], [0.2464, -0.22], [0.46, -0.30], [0.5765, -0.40], [0.8015, -0.16], [1, -0.08]],
                'spine.sy': [[0, 1], [0.1643, 1.05, 'back'], [0.2464, 1.045], [0.3779, 1.0], [0.6559, 1.0], [0.8147, 0.96, 'bounce'], [1, 1, 'back']],
                'spine.sz': [[0, 1], [0.1643, 0.972], [0.2464, 0.976], [0.3779, 1.0], [0.6559, 1.0], [0.8147, 1.025], [1, 1]],
                'cape.rx': [[0, 0.05], [0.2793, 0.42], [0.55, 0.16], [1, 0.05]],
            }
        },
        slam: { // 해머: 양손으로 머리 위까지 들어(홀드) 지면째 내려찍고 크게 주저앉는다
            dur: 0.6, tracks: {
                'shoulderR.rx': [[0, -0.14], [0.0859, 0.22], [0.3125, -2.28, 'out'], [0.3906, -2.22], [0.5, -0.50, 'in'], [0.6, 0.80, 'out'], [0.8154, 0.26], [1, -0.14]],
                'shoulderL.rx': [[0, -0.1], [0.0859, 0.20], [0.3125, -2.22, 'out'], [0.3906, -2.16], [0.5, -0.45, 'in'], [0.6, 0.74, 'out'], [0.8154, 0.24], [1, -0.1]],
                'elbowR.rx': [[0, -0.15], [0.3125, -0.34], [0.5, -0.05], [0.6, -0.02], [1, -0.15]],
                'elbowL.rx': [[0, -0.15], [0.3125, -0.34], [0.5, -0.05], [0.6, -0.02], [1, -0.15]],
                'spine.rx': [[0, 0.02], [0.0781, -0.14], [0.3125, -0.34], [0.5, 0.26, 'in'], [0.6, 0.50, 'out'], [0.8154, 0.22], [1, 0.02]],
                'root.py': [[0, 0], [0.3125, 0.075, 'back'], [0.4844, -0.014], [0.6308, -0.030, 'bounce'], [0.8462, 0.006], [1, 0]],
                // 하체: 양발로 버티고 무릎을 깊게 접어 충격을 받는다(해머는 좌우 대칭 스탠스)
                'hipL.rx': [[0, 0.04], [0.0781, 0.20], [0.3125, 0.24], [0.5, -0.26, 'in'], [0.6308, -0.34, 'out'], [0.8462, -0.10], [1, 0.04]],
                'hipR.rx': [[0, 0.06], [0.0781, 0.18], [0.3125, 0.22], [0.5, -0.20, 'in'], [0.6308, -0.28, 'out'], [0.8462, -0.08], [1, 0.06]],
                'kneeL.rx': [[0, -0.05], [0.3125, -0.20], [0.5, -0.46], [0.6308, -0.64, 'bounce'], [0.8462, -0.18], [1, -0.05]],
                'kneeR.rx': [[0, -0.08], [0.3125, -0.22], [0.5, -0.48], [0.6308, -0.66, 'bounce'], [0.8462, -0.20], [1, -0.08]],
                'cape.rx': [[0, 0.05], [0.3594, 0.6], [0.6615, 0.2], [1, 0.05]],
                'spine.sy': [[0, 1], [0.2031, 1.062, 'back'], [0.3125, 1.055], [0.4219, 1.0], [0.6, 1.0], [0.8, 0.945, 'bounce'], [1, 1, 'back']],
                'spine.sx': [[0, 1], [0.2031, 0.966], [0.3125, 0.972], [0.4219, 1.0], [0.6, 1.0], [0.8, 1.032], [1, 1]],
                'spine.sz': [[0, 1], [0.2031, 0.966], [0.3125, 0.972], [0.4219, 1.0], [0.6, 1.0], [0.8, 1.032], [1, 1]],
                'head.sy': [[0, 1], [0.2031, 0.948], [0.3125, 0.958], [0.4219, 1.0], [0.6, 1.0], [0.8, 1.052], [1, 1]],
                'head.sx': [[0, 1], [0.2031, 1.034], [0.3125, 1.026], [0.4219, 1.0], [0.6, 1.0], [0.8, 0.966], [1, 1]],
            }
        },
        double: { // 단검: 좌우 2연타 — 각 타는 짧은 예비 + 급가속, 두 번째가 더 크게 팔로스루
            dur: 0.55, tracks: {
                'shoulderR.rx': [[0, -0.14], [0.0655, 0.22], [0.18, -1.48, 'out'], [0.2945, 0.62, 'in'], [0.36, 0.80, 'out'],
                    [0.5, -1.40, 'out'], [0.6273, 0.55, 'in'], [0.7, 0.74, 'out'], [0.8636, 0.16], [1, -0.14]],
                'shoulderR.rz': [[0, -0.06], [0.18, 0.34], [0.2945, -0.36], [0.36, -0.44], [0.5, 0.30], [0.6273, -0.40], [0.7, -0.46], [0.8636, -0.14], [1, -0.06]],
                'spine.ry': [[0, 0], [0.18, -0.38], [0.3273, 0.34], [0.5, -0.30], [0.6636, 0.28], [1, 0]],
                'neck.ry': [[0, 0], [0.18, 0.32], [0.3273, -0.29], [0.5, 0.26], [0.6636, -0.24], [1, 0]],   // 시선 전방 유지 (slash 주석 참조)
                'elbowR.rx': [[0, -0.15], [0.18, -0.26], [0.2945, -0.04], [0.5, -0.24], [0.6273, -0.04], [1, -0.15]],
                // 하체: 두 번 밟아 들어가는 잔발 — 타마다 앞발이 한 번씩 나간다
                'hipL.rx': [[0, 0.04], [0.1145, 0.18], [0.2945, -0.28, 'in'], [0.43, 0.10], [0.6273, -0.30, 'in'], [0.8091, -0.10], [1, 0.04]],
                'hipR.rx': [[0, 0.06], [0.1145, -0.10], [0.2945, 0.26, 'in'], [0.43, -0.04], [0.6273, 0.28, 'in'], [0.8091, 0.10], [1, 0.06]],
                'kneeL.rx': [[0, -0.05], [0.18, -0.24], [0.3273, -0.10], [0.5364, -0.24], [0.7, -0.10], [1, -0.05]],
                'kneeR.rx': [[0, -0.08], [0.18, -0.28], [0.3273, -0.18], [0.5364, -0.30], [0.7, -0.20], [1, -0.08]],
                'spine.rx': [[0, 0.02], [0.18, -0.10], [0.3273, 0.18], [0.5, -0.08], [0.6636, 0.22], [0.8364, 0.10], [1, 0.02]],
                'cape.rx': [[0, 0.05], [0.2455, 0.4], [0.5545, 0.42], [0.7955, 0.14], [1, 0.05]],
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
                'neck.ry': [[0, 0], [0.25, -0.17], [0.5, -0.27], [1, 0]],   // 시선 전방 유지 (slash 주석 참조)
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
                'neck.ry': [[0, 0], [0.32, 0.43], [0.58, -0.38], [1, 0]],   // 시선 전방 유지 (slash 주석 참조)
                'spine.rx': [[0, 0.02], [0.58, 0.24], [1, 0.02]],
                'kneeL.rx': [[0, 0], [0.58, -0.2], [1, 0]],
            }
        },
        // 2단 붕괴: 비틀 → 무릎이 먼저 꺾여 주저앉음(t≈0.38) → **옆으로** 무너져 접지(t≈0.78, 오버슈트 후 반동) → 잔여 정착.
        // ⚠️ 왜 옆(root.rz)인가 — 예전처럼 root.rx로만 뒤로 눕히면 몸의 장축이 **카메라 시선축과 나란히** 놓여
        //    화면에서는 발끝에서 몸을 내려다보는 최악의 각이 된다(실측: 머리~발 화면 가로/세로비 0.47, 길이 0.20).
        //    rz로 옆으로 무너뜨리면 같은 리그가 가로로 눕는다(비 2.9~4.0, 길이 0.31) — 실루엣이 읽힌다.
        // ⚠️ rz는 **양수**여야 왼쪽(방패 쪽)이 바닥에 깔린다(리그 로컬 −x가 왼쪽; 실측 handLx<0).
        //    깔리는 쪽 팔은 몸 아래 끼면 몸통을 0.12 들어올려 '떠 보임'이 재발하므로 **머리 위로 뻗어** 치운다.
        // ⚠️ root 피벗은 **발바닥 높이**(root.position.y=0.08)라 몸을 눕히면 root.py는 오히려 **올라가야** 한다.
        //    (예전 값 −0.44는 몸을 지하 0.78로 처박아 상체만 남겼다 = 사용자가 말한 '공중에 뜬 채 젖혀짐'.)
        //    모든 높이 값은 tools/probe-death-ground.js 실측 — 붕괴 전 구간에서 리그 최저 정점이 지면 ±0.06.
        Death: {
            // groundPose: 지면에 쓰러지는 클립 — 탑승 하체 포즈를 가산하지 않는다(다리를 감은 채 쓰러지면 더 어색하다)
            dur: 1.45, once: true, groundPose: true, tracks: {
                'spine.rx': [[0, 0], [0.07, -0.55], [0.2, -0.3], [0.38, 0.34], [0.62, 0.22], [0.8, 0.1], [1, 0.06]],
                'spine.ry': [[0, 0], [0.16, 0.28], [0.6, 0.14], [1, 0.1]],
                'spine.rz': [[0, 0], [0.55, 0.1], [0.8, 0.26], [1, 0.22]],     // 무너지는 쪽으로 몸통이 먼저 기운다
                'neck.rx': [[0, 0], [0.07, -0.52], [0.2, -0.3], [0.38, 0.3], [0.78, 0.04], [1, 0.16]],
                'neck.ry': [[0, 0], [0.5, 0.16], [0.82, 0.5], [1, 0.62]],       // 고개가 옆으로 굴러 떨어진다
                'neck.rz': [[0, 0], [0.62, 0.12], [0.82, 0.42], [1, 0.36]],     // 머리 무게가 지면 쪽으로 (착지 후 반동 0.06)
                // 무릎 꺾임(0.38): 정강이가 지면에 눕는 진짜 무릎꿇기 — 실측상 정강이 합각이 ~1.57일 때
                //   무릎과 발이 같은 높이가 돼 root를 0.25 내리면 둘 다 바닥에 닿는다(hip −0.75 + knee 2.3).
                // 누운 뒤: 위쪽(오른) 다리가 앞으로 미끄러지고 아래(왼) 다리는 펴진 **비대칭** 시체 자세.
                'hipL.rx': [[0, 0], [0.38, -0.75], [0.6, -0.6], [0.85, 0.1], [1, 0.06]],
                'hipR.rx': [[0, 0], [0.38, -0.62], [0.6, -0.45], [0.85, 0.5], [1, 0.6]],
                'kneeL.rx': [[0, 0], [0.38, 2.3], [0.6, 1.9], [0.85, -0.22], [1, -0.16]],
                'kneeR.rx': [[0, 0], [0.38, 2.15], [0.6, 1.75], [0.85, -0.7], [1, -0.82]],
                'hipL.rz': [[0, 0], [0.7, -0.06], [1, -0.1]],
                'hipR.rz': [[0, 0], [0.7, -0.12], [1, -0.38]],   // 위쪽 다리 무릎이 앞·아래로 떨어져 지면에 닿는다
                'root.rx': [[0, 0], [0.07, 0.14], [0.22, 0.1], [0.38, 0.16], [0.6, -0.06], [0.78, -0.42], [1, -0.45]],
                'root.rz': [[0, 0], [0.38, 0.05], [0.55, 0.3], [0.72, 1.12], [0.78, 1.5], [0.86, 1.36], [1, 1.42]], // 오버슈트 1.5 → 반동 1.36 → 정착
                'root.py': [[0, 0], [0.16, 0], [0.38, -0.25], [0.6, 0], [0.7, 0.19], [0.78, 0.37], [0.86, 0.31], [1, 0.345]],
                // 깔리는 왼팔은 머리 위로 뻗어 몸 밑에서 빼고(−2.1), 위쪽 오른팔은 가슴 위로 늘어뜨린다
                'shoulderL.rx': [[0, -0.1], [0.07, -0.42], [0.26, -0.55], [0.6, -1.1], [0.85, -2.0], [1, -2.1]],
                'shoulderR.rx': [[0, -0.14], [0.26, -0.62], [0.6, -0.3], [0.85, 0.06], [1, 0.12]],
                'shoulderL.rz': [[0, 0], [0.5, -0.18], [1, -0.3]],   // ⚠️ 왼쪽으로 누우므로 왼팔 '벌림'은 곧 지면 방향 — 키우면 팔이 바닥을 뚫는다(실측 −0.2)
                'shoulderR.rz': [[0, 0], [0.5, 0.1], [0.85, -0.26], [1, -0.32]],  // 위쪽 팔이 몸 옆으로 늘어짐 — 무기가 하늘로 솟지 않게
                'elbowL.rx': [[0, -0.15], [0.6, -0.42], [1, -0.24]],   // ⚠️ 더 접어도 방패가 지면을 뚫는다(실측 −0.18)
                'elbowR.rx': [[0, -0.15], [0.6, -0.6], [0.85, -0.35], [1, -0.25]],
                'cape.rx': [[0, 0.05], [0.38, 0.5], [0.8, -0.02], [1, -0.1]],
                'cape.rz': [[0, 0], [0.8, -0.16], [1, -0.22]],   // 천이 무너진 쪽으로 쏠려 깔린다
            },
            capeFlat: [[0, 0], [0.6, 0], [0.84, 0.85], [1, 1]],
        },
        Revive: { // 기상: 옆으로 누운 몸을 굴려 무릎으로 세우고 일어선다
            // ⚠️ 0초 값은 **Death 끝값과 한 글자도 다르면 안 된다** — 다르면 기상 첫 프레임에 순간이동한다.
            //    (tools/probe-death-ground.js가 Death 끝 ↔ Revive 0초 최저 정점 차를 찍어 준다. 0.00이어야 정상)
            dur: 0.85, once: true, groundPose: true, tracks: {   // Death와 같은 이유로 탑승 하체 포즈 미가산
                'root.rz': [[0, 1.42], [0.3, 1.05], [0.62, 0.3], [0.85, -0.06], [1, 0]],   // 먼저 몸을 굴려 세우고
                'root.rx': [[0, -0.45], [0.35, -0.25], [0.7, 0.14], [1, 0]],
                'root.py': [[0, 0.345], [0.3, 0.05], [0.55, -0.22], [0.9, 0.03], [1, 0]],   // 무릎 자세를 거쳐 키가 돌아온다
                'hipL.rx': [[0, 0.06], [0.4, -0.7], [0.62, -0.8], [1, 0]],
                'hipR.rx': [[0, 0.6], [0.4, -0.5], [0.62, -0.62], [1, 0]],
                'kneeL.rx': [[0, -0.16], [0.4, 1.9], [0.62, 2.0], [1, 0]],
                'kneeR.rx': [[0, -0.82], [0.4, 1.6], [0.62, 1.75], [1, 0]],
                'hipL.rz': [[0, -0.1], [0.6, -0.04], [1, 0]],
                'hipR.rz': [[0, -0.38], [0.6, -0.14], [1, 0]],
                'spine.rx': [[0, 0.06], [0.45, 0.34], [0.85, -0.12], [1, 0]],   // 몸을 일으키며 숙였다 마지막에 가슴을 펴는 오버슈트
                'spine.ry': [[0, 0.1], [1, 0]],
                'spine.rz': [[0, 0.22], [0.6, 0.08], [1, 0]],
                'shoulderL.rx': [[0, -2.1], [0.35, -1.3], [0.7, -0.5], [1, -0.1]],  // 뻗어 있던 팔로 땅을 짚고 당겨 일어난다
                'shoulderR.rx': [[0, 0.12], [0.35, -0.55], [0.7, -0.4], [1, -0.14]],
                'shoulderL.rz': [[0, -0.3], [0.6, -0.14], [1, 0]],
                'shoulderR.rz': [[0, -0.32], [0.6, -0.12], [1, 0]],
                'elbowL.rx': [[0, -0.22], [0.35, -0.95], [0.7, -0.5], [1, -0.15]],
                'elbowR.rx': [[0, -0.25], [0.35, -0.7], [1, -0.15]],
                'neck.rx': [[0, 0.16], [0.5, -0.22], [1, 0]],
                'neck.ry': [[0, 0.62], [0.6, 0.2], [1, 0]],
                'neck.rz': [[0, 0.36], [0.6, 0.1], [1, 0]],
                'cape.rx': [[0, -0.1], [0.5, 0.18], [1, 0.02]],
                'cape.rz': [[0, -0.22], [0.6, -0.06], [1, 0]],
            },
            capeFlat: [[0, 1], [0.4, 0.4], [1, 0]],
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
        [/Revive|GetUp/, 'Revive'],
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

    // 피격 반동을 건다(위 update 의 플린치 층이 이 값을 읽는다). sev = 최대 HP 대비 피해 비중.
    hit(R, sev) {
        if (!R) return;
        R.hitT = R.hitDur = 0.30;
        R.hitAmp = 0.5 + Math.min(0.5, (sev || 0) * 1.6);
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
                const u = (t - t0) / Math.max(0.0001, t1 - t0);
                // 키의 3번째 원소 = **그 키로 들어오는 구간**의 이징 이름. 없으면 종전대로 smoothstep.
                const fn = this.EASES[keys[i][2]];
                const k = fn ? this[fn](u) : this.ease(u);
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
            bone.scale.set(base.sx, base.sy, base.sz);
        };
        for (const k in R.bones) apply(R.bones[k], R.base[k]);
        apply(R.root, R.base.root);
        if (R.restX) R.bones.shoulderR.rotation.x += R.restX; // 무기별 거치 자세 (활/총=전방 조준)
        // 무기별 다관절 거치 자세(rx 가산) — 공격/사망(once) 클립 중에는 클립이 양팔을 전부 정의하므로 미적용
        // 값이 숫자면 rx 가산(기존 무기 거치 자세), 객체면 {rx,ry,rz} 축별 가산 —
        // 탑승 포즈는 다리를 '벌려서' 감싸야 해서 rz(좌우 벌림)가 필수다.
        const addPose = (pose, w) => {
            const s = w === undefined ? 1 : w;
            if (!s) return;
            for (const bn in pose) {
                const b = R.bones[bn]; if (!b) continue;
                const v = pose[bn];
                if (typeof v === 'number') b.rotation.x += v * s;
                else {
                    if (v.rx) b.rotation.x += v.rx * s;
                    if (v.ry) b.rotation.y += v.ry * s;
                    if (v.rz) b.rotation.z += v.rz * s;
                }
            }
        };
        // 탑승 하체 포즈는 **공격 클립(once) 중에도 유지**한다 — restPose를 통째로 끄면 안장에 감겨 있던
        // 다리가 공격 한 번에 곧게 펴져 '올라탄 게 아니라 위에 떠서 지나가는' 프레임이 나온다
        // (실측: 4계열 전부 공격 중 hip/knee가 0으로 복귀). 공격 클립이 정의하는 건 어깨·팔꿈치·척추뿐이라
        // 하체를 가산해도 상체 아크는 그대로다. 사망·기상 클립만 예외 — 쓰러진 몸이 다리를 감고 있으면 더 어색하다.
        if (!R._once) { if (R.restPose) addPose(R.restPose); }
        else if (R._clip.groundPose) { /* 사망·기상: 어떤 거치 자세도 얹지 않는다 */ }
        else if (R.ridePose) addPose(R.ridePose);   // 탑승 중 공격 — 종전 규약 그대로(하체는 안장이 소유)
        else {
            // ⚔️ 지상 공격(once): 무기 파지 자세를 **한 프레임에 끊지 않는다**(swing-snap 진단).
            //    restPose 에는 파지 팔꿈치각이 들어 있고(도끼 elbowR −0.85 등) 손목 아래에 무기가 달려
            //    있어서, 공격 시작 프레임에 이게 통째로 사라지면 **무기가 0.88rad 튄다**(실측 axe).
            //    끝날 때도 같은 크기로 되튄다. 그래서 앞 16% 에서 녹여 빼고 뒤 26% 에서 녹여 되돌린다 —
            //    임팩트 구간(16~74%)은 종전대로 클립이 팔을 100% 소유한다.
            const IN = 0.16, OUT = 0.74;
            const u = t < IN ? 1 - t / IN : (t > OUT ? (t - OUT) / (1 - OUT) : 0);
            if (u > 0 && R.restPose) addPose(R.restPose, this.ease(u));
        }
        // 탑승 중이면 하체는 ridePose 가 소유한다 — 지상 공격용 스텝(hip/knee) 트랙이 안장 자세를
        // 흔들지 않게 건너뛴다(RIDE_STAND_POSE 보호). 버팀 가산은 Scene3D.rideBrace 가 따로 얹는다.
        const rideLower = !!(R.ridePose && R._once && !R._clip.groundPose);
        // 트랙 오프셋
        for (const key in R._clip.tracks) {
            const dot = key.indexOf('.');
            const boneName = key.slice(0, dot), ch = key.slice(dot + 1);
            const bone = boneName === 'root' ? R.root : R.bones[boneName];
            if (!bone) continue;
            if (rideLower && (boneName === 'hipL' || boneName === 'hipR' || boneName === 'kneeL' || boneName === 'kneeR')) continue;
            const v = this.sample(R._clip.tracks[key], t);
            if (ch === 'rx') bone.rotation.x += v;
            else if (ch === 'ry') bone.rotation.y += v;
            else if (ch === 'rz') bone.rotation.z += v;
            else if (ch === 'px') bone.position.x += v;
            else if (ch === 'py') bone.position.y += v;
            else if (ch === 'pz') bone.position.z += v;
            // 스쿼시&스트레치 — 1930s 러버호스 카툰 모션 언어(`cute-art-direction` 사용자 추가 2026-08-19).
            //   회전·위치와 달리 **곱셈**이다(1.0 = 원래 크기). 위 apply 가 매 프레임 베이스 배율로
            //   되돌려 놓으므로 여기서 그대로 곱하면 된다.
            else if (ch === 'sx') bone.scale.x *= v;
            else if (ch === 'sy') bone.scale.y *= v;
            else if (ch === 'sz') bone.scale.z *= v;
        }
        // 통짜 박스 팔(팔꿈치 없음)은 어깨가 **몸 안쪽으로** 크게 돌면 머리를 관통한다 — 안전 클램프.
        //   (죽음=groundPose 는 팔이 바닥에 늘어지는 게 자연스러우니 제외. 걷기 스윙은 작아서 영향 없음.)
        // 🚨 rx 상한(−0.85)이 **스윙 부자연스러움의 주범이었다**(swing-snap 진단 2026-08-21):
        //    공격 클립의 와인드업 키는 전부 −2.35~−2.95 인데 −0.85 에서 잘려, 와인드업 정점 부근
        //    5프레임(83ms)이 **완전 정지 평지**가 되고 그 뒤 한 프레임에 68°(1.185rad)가 순간이동했다.
        //    그런데 rx 는 팔을 x축으로만 돌리므로 **어깨의 x 좌표(±0.30)가 변하지 않는다** — 머리 폭이
        //    ±0.20, 팔 반폭 0.05 라 rx 만으로는 머리·몸통과 원리상 겹칠 수 없다(관통을 만드는 건
        //    팔을 몸 안쪽으로 끌어오는 rz 뿐이다). 그래서 rx 는 풀고 rz 클램프만 남긴다.
        if (R._simple && !(R._clip && R._clip.groundPose)) {
            for (const bn of ['shoulderL', 'shoulderR']) {
                const b = R.bones[bn]; if (!b) continue;
                b.rotation.x = Math.max(-2.95, Math.min(2.35, b.rotation.x));
                b.rotation.z = Math.max(-0.5, Math.min(0.6, b.rotation.z));
            }
        }
        // ── 피격 플린치 (hp-juicy 7차 잔여 ㉳ '영웅 피격 포즈 반동 부재') ──────────────────────
        // 적 쪽에서 먼저 확인된 것과 **같은 결함**이다: `Scene3D.heroHit` 은 몸통 넉백(x)과 롤(rz),
        // 플래시·셰이크·비네트를 걸지만 **관절은 한 개도 안 움직인다.** 그래서 화면은 요란한데
        // 영웅 자세는 맞기 전과 똑같아 '내가 맞았다'가 포즈로 안 읽힌다(비평가 A #7 / B #5 일치).
        // 여기서는 되돌리기가 필요 없다 — 이 함수는 매 프레임 `R.base` 에서 포즈를 새로 쌓기 때문에
        // (적 쪽은 대기 분기가 곱셈 감쇠라 `undoFlinch` 가 필요했다) **가산 한 번이면 끝이다.**
        // 클립보다 뒤에 얹으므로 공격 모션 중에 맞아도 반동이 살아 있다.
        if (R.hitT > 0 && !(R._clip && R._clip.groundPose)) {   // 쓰러진 시체는 제외
            R.hitT = Math.max(0, R.hitT - dt);
            const v = 1 - R.hitT / R.hitDur;
            const RISE = 0.06;   // 즉발 스냅 — 타격은 예고 없이 들어온다(예비동작 없음). 적 쪽과 같은 곡선.
            let w;
            if (v < RISE) w = v / RISE;
            else { const u = (v - RISE) / (1 - RISE); w = Math.exp(-3.6 * u) * Math.cos(u * Math.PI * 2.4); }
            const a = (R.hitAmp || 0) * w;
            if (a) addPose({
                // 적은 +x(오른쪽)에 서므로 영웅은 **왼쪽으로** 접힌다 — 넉백·롤과 같은 방향이라
                // 몸통 이동과 관절 반동이 한 덩어리로 읽힌다(반대로 주면 서로 상쇄돼 제자리걸음이 된다).
                spine: { rz: a * 0.20, rx: -a * 0.15 },
                neck: { rz: a * 0.30, rx: -a * 0.22 },   // 머리가 가장 크게 젖혀진다(무게가 가벼우니까)
                head: { rz: a * 0.16 },
                shoulderL: { rx: a * 0.46, rz: a * 0.30 },
                shoulderR: { rx: a * 0.34, rz: a * 0.24 }, // 무기 든 팔은 덜 흔들린다(쥐고 버틴다)
                elbowL: { rx: -a * 0.30 },
                elbowR: { rx: -a * 0.18 },
                hipL: { rx: -a * 0.13 }, hipR: { rx: -a * 0.13 },
                kneeL: { rx: -a * 0.28 }, kneeR: { rx: -a * 0.24 }, // 무릎이 접히며 충격을 받는다
                cape: { rx: a * 0.30 },                             // 천은 한 박자 늦게 따라 출렁인다
            });
        }
        // 망토 천 물결 — 세로 진행파+가로 미세 플러터 2겹, 걷기 중 증폭 (비평가: '두께 없는 판자 망토')
        // `capeFlat`(0~1) 채널은 천을 자기 평면(z=0)으로 눌러 편다 — 쓰러져 누웠을 때 등 뒤로 부풀어 있던
        // 곡면(로컬 z −0.28)이 그대로면 지면을 0.38 뚫고 들어간다. 바닥에 깔린 천처럼 납작해져야 접지가 성립.
        if (R.capeMesh) {
            const flat = R._clip.capeFlat ? this.sample(R._clip.capeFlat, t) : 0;
            const walkAmp = (R.state === 'Walking' ? 1.9 : 1) * (1 - flat * 0.86); // 완전 0으로 죽이면 시체가 통째로 얼어붙는다 — 14%는 남겨 천이 계속 숨쉬게
            R._capePhase += dt * (2.1 + (walkAmp - 1) * 1.6);
            const p = R.capeMesh.geometry.attributes.position;
            const base = R._capeBase, kA = R._capeK, ph = R._capePhase, keep = 1 - flat;
            for (let i = 0; i < p.count; i++) {
                const k = kA[i], bx = base[i * 3];
                p.array[i * 3 + 2] = base[i * 3 + 2] * keep +
                    (Math.sin(ph * 1.15 + k * 3.1) * 0.062 + Math.sin(ph * 1.9 + bx * 9 + k * 1.4) * 0.028) * k * walkAmp; // 진폭 상향 — 정지 프레임에서도 물결이 읽히게
                p.array[i * 3 + 1] = base[i * 3 + 1] + Math.sin(ph * 1.5 + bx * 11 + k * 2) * 0.009 * k * keep; // 밑단 플러터
            }
            p.needsUpdate = true;
            R.capeMesh.geometry.computeVertexNormals();
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
                // 시대색을 스틸 베이스에 '섞음' — setHex 직치환은 전신이 시대색 풍선이 되던 문제(비평가: 플라스틱 단색).
                // 베이스 금속 명도 단차를 살린 채 lerp로 색 정체성만 부여, 다크 파츠는 혼합비 낮춰 음영 대비 유지.
                m.color.setHex(m.userData.baseColor)
                    .lerp(new THREE.Color(color), isDark ? 0.34 : 0.48)
                    .offsetHSL(0, isDark ? -0.08 : -0.02, isDark ? -0.05 : 0);
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
        // 머리카락 없음 — 기본형 = 대머리 치비 (사용자 지시 2026-08-18). 투구만 headMount 로 얹힌다.
        // 풀커버 투구(visor/mask/tech)는 이목구비도 숨김 — 코/눈이 투구 밖으로 뚫고 나오던 문제 (비평가 1위 결함)
        if (R.faceMesh) {
            const hStyle = equipment.helmet ? itemStyleOf(equipment.helmet) : null;
            // skull(짐승 두개골, equip-era-theming ④)도 얼굴을 덮는다 — 눈구멍·주둥이가
            // 정확히 얼굴 높이라, 얼굴을 켜 두면 두개골 속에서 사람 눈이 튀어나온다.
            // sealed(밀폐 여압 투구, equip-era-theming ⑦)도 마찬가지 — 전면창이 얼굴 전체를
            // 덮는 **불투명 스모크 유리**라, 얼굴을 켜 두면 창 안에서 코가 뚫고 나온다.
            R.faceMesh.visible = !(hStyle === 'visor' || hStyle === 'mask' || hStyle === 'tech'
                || hStyle === 'skull' || hStyle === 'sealed');
        }
    },
};
