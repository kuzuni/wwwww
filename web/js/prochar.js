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
    TONE: { steel: 0x9fb2c2, steelDark: 0x232a33, mail: 0x0e1319 },
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
            const m = new THREE.MeshStandardMaterial({ color: T.steel, metalness: 0.85, roughness: 0.34, map: mTex, bumpMap: mTex, bumpScale: 0.006, envMapIntensity: 0.72 }); // 브러시드 스틸 — env 0.9/러프 0.3은 근접샷 흉갑이 순백 블로우아웃 (비평가 7.3 1번)
            m.userData.tone = 'steel';
            m.userData.baseColor = m.color.getHex();
            R.armorMats.push(m);
            (this._toneMats || (this._toneMats = [])).push(m);
            return m;
        };
        const steelDark = () => {
            const m = new THREE.MeshStandardMaterial({ color: T.steelDark, metalness: 0.8, roughness: 0.5, map: mTex, bumpMap: mTex, bumpScale: 0.006, envMapIntensity: 0.65 });
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
            const m = new THREE.MeshStandardMaterial({ color: T.mail, metalness: 0.78, roughness: 0.56, map: mailTex, bumpMap: mailTex, bumpScale: 0.02, envMapIntensity: 0.55 });
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

        // ---------- 하체 ----------
        const pelvis = new THREE.Group();
        pelvis.position.y = 0.615; // 다리 연장(대퇴 0.32·정강이 0.275)에 맞춰 상향 — 두상 축소만으론 '유아 마스코트' 비율 잔존 (비평가 지적)
        root.add(pelvis);
        R.bones.pelvis = pelvis;
        // 골반 장갑(스커트 판) — 앞뒤 곡면 판 + 벨트
        const skirtMat = steelDark();
        skirtMat.side = THREE.DoubleSide;
        // 상단 0.205→0.19 / 밑단 0.295→0.30 — 흉갑 밑단을 0.163으로 조인 것에 맞춰 스커트 상단도
        // 함께 좁힌다. 안 좁히면 스커트 림이 잘록해진 허리보다 밖으로 튀어나와 허리 꺾임을 덮어버린다.
        // 상수로 뽑아 둔다 — 아래 태싯 스트랩이 스커트 원뿔면 위에 정확히 얹히도록 여기서 역산한다
        const SK_TOP = 0.19, SK_BOT = 0.30, SK_H = 0.18, SK_Y = -0.045;
        const skirt = new THREE.Mesh(new THREE.CylinderGeometry(SK_TOP, SK_BOT, SK_H, 14, 1, true), skirtMat); // 밑단 플레어 — 허리→밑단 벌어지는 실루엣 꺾임
        skirt.position.y = SK_Y;
        const hem = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.014, 6, 16), gold);
        hem.rotation.x = Math.PI / 2;
        hem.position.y = -0.135;
        // 스커트 안감 — 판금 셸 바로 안쪽에 니어블랙 원통을 겹쳐 밑단 플레어 아래가 '빈 껍데기'가 아니라
        // 그늘진 두께로 읽히게. 실루엣 하단에 어두운 값 면적을 크게 확보하는 핵심 파츠다.
        const skirtLine = new THREE.Mesh(new THREE.CylinderGeometry(0.182, 0.291, 0.178, 14, 1, true), deepLine);
        skirtLine.position.y = -0.048;
        // 벨트 — 허리를 실제로 '조이는' 파츠. 폭을 흉갑 밑단(x 0.170)과 스커트 상단(0.19) 사이로 좁히고
        // 높이를 0.07→0.1로 늘려 스커트 상단(월드 0.615)부터 흉갑 밑단(0.715)까지 빈틈 없이 잇는다.
        // 전에는 벨트가 0.2/0.21로 흉갑 밑단(0.192)보다 넓어, 조여야 할 지점이 오히려 몸통의
        // 최대 돌출부였다 — 허리가 안 읽힌 직접 원인.
        const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.176, 0.19, 0.1, 16), deepHide);
        belt.position.y = 0.05;
        belt.scale.z = 0.85;
        const buckle = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), gold);
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
        pelvis.add(skirt, skirtLine, hem, belt, buckle);
        aoRing(0.186, 0.02, pelvis, 0.005, 0.5); // 벨트 아래 접촉 그림자 (벨트 축소 0.2→0.176에 맞춰)

        // 다리: 고관절 → 대퇴 → 무릎 → 정강이 → 부츠 (분절 피벗)
        R.legs = [];
        const mailMat = mail(); // 사지 공용 — 인스턴스를 하나로 묶어 틴트·드로우콜을 아낀다
        for (const side of [-1, 1]) {
            const hip = new THREE.Group();
            hip.position.set(side * 0.13, -0.06, 0);
            const thigh = this.capsule(0.085, 0.07, 0.32, mailMat); // 다리 연장 — 마스코트 비율 완화
            const cuisse = new THREE.Mesh(new THREE.SphereGeometry(0.095, 10, 8), steelDark()); // 대퇴 장갑판
            cuisse.position.y = -0.115;
            cuisse.scale.set(1, 1.45, 1);
            // 대퇴 상단 패딩 링 — 스커트(판금)와 사슬이 맞물리는 경계에 누빔천을 끼워 재질이 3층으로 읽히게
            const thighPad = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.088, 0.055, 12), padding);
            thighPad.position.y = -0.022;
            // 대퇴 가터 스트랩 — 사슬 위를 감는 니어블랙 띠 (금속 명도 덩어리를 가로로 끊는다)
            const garter = new THREE.Mesh(new THREE.CylinderGeometry(0.089, 0.086, 0.03, 12), deepHide);
            garter.position.y = -0.2;
            const knee = new THREE.Group();
            knee.position.y = -0.32;
            // 무릎 폴린(poleyn): 슬개 돔 + 측면 팬 윙 + 상하 라메 2겹 — 관절이 '캡슐 이음매'가 아니라 관절 장갑으로 보이게
            const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), steel());
            kneeCap.scale.set(1.05, 0.95, 1.15);
            kneeCap.position.z = 0.008;
            const poleynWing = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), steelDark());
            poleynWing.position.set(side * 0.045, -0.006, -0.004);
            poleynWing.rotation.z = side * -1.35; // 바깥쪽으로 펼쳐지는 원반 날개
            poleynWing.scale.set(1, 0.55, 1.1);
            const kneeLameUp = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.068, 0.026, 12), steel());
            kneeLameUp.position.y = 0.042;
            const kneeLameDn = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.062, 0.024, 12), steel());
            kneeLameDn.position.y = -0.044;
            const kneeRivet = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), gold);
            kneeRivet.position.set(side * 0.052, 0.006, 0.012);
            // 무릎 개스킷 — 라메 2겹 사이로 드러나는 니어블랙 관절 슬리브. 접합부 벌어짐도 함께 가린다.
            const kneeGasket = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.056, 0.088, 12), deepGasket);
            kneeGasket.position.y = -0.002;
            knee.add(kneeGasket, poleynWing, kneeLameUp, kneeLameDn, kneeRivet);
            const shin = this.capsule(0.06, 0.052, 0.275, mailMat);
            // 정강이 장갑판 (그리브)
            const greave = new THREE.Mesh(new THREE.SphereGeometry(0.068, 9, 7), steelDark());
            greave.position.set(0, -0.128, 0.012);
            greave.scale.set(0.95, 1.7, 0.95);
            knee.add(greave);
            // 부츠: 라운드 토 (구+원통 결합) + 강철 사바톤
            // 0x4a3728은 r128의 리니어 해석 + sRGB 출력 + 밝은 가죽 텍스처(#c9b8a6)가 겹쳐 화면에서 살구빛 탄으로 떠
            // 정면·측면샷에서 '맨발'로 읽혔다 — 건틀릿이 이미 겪은 함정(0x6b4e3a → 0x241408)과 같은 원인이라 같은 방식으로 역보정한다.
            // …그런데 0x2a1a0d조차 조명 후 화면 명도 0.35~0.45로 떠, 값 구조 기준(0.10~0.18)에는 여전히 밝다.
            // 부츠는 캐릭터에서 가장 큰 '어두워야 마땅한' 면적이므로 니어블랙(DEEP)으로 내린다.
            const bootMat = deepHide;
            const bootTop = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.1, 10), bootMat);
            bootTop.position.y = -0.265;
            const foot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bootMat);
            foot.position.set(0, -0.315, 0.045);
            foot.scale.set(0.9, 0.55, 1.55);
            // 사바톤(발등 판금) + 발목 라메 — 관절 장갑(폴린·쿠터)과 같은 언어로 발끝까지 마감
            const sabaton = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55), steel());
            sabaton.position.set(0, -0.305, 0.052);
            sabaton.scale.set(0.92, 0.62, 1.5);
            const ankleLame = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.08, 0.028, 12), steelDark());
            ankleLame.position.y = -0.298;
            // 밑창 — 발 바닥면에 깔리는 니어블랙 판. 지면 접지선을 어둡게 눌러 캐릭터가 '떠 있지 않게' 하고,
            // 실루엣 최하단(카메라가 내려다보므로 실제로 보이는 면)에 확실한 다크 앵커를 준다.
            const sole = new THREE.Mesh(new THREE.SphereGeometry(0.076, 10, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), deepGasket);
            sole.position.set(0, -0.336, 0.045);
            sole.scale.set(0.94, 0.42, 1.58);
            const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.03, 10), deepGasket);
            heel.position.set(0, -0.345, -0.012);
            knee.add(kneeCap, shin, bootTop, foot, sabaton, ankleLame, sole, heel);
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
        const cuirassPts = [];
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
        for (const [r, y] of prof) cuirassPts.push(new THREE.Vector2(r, y));
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
        const cuirassGeo = new THREE.LatheGeometry(cuirassPts, 22); // 세그먼트 18→22 (허리 곡률이 급해 각지던 것)
        {
            const p = cuirassGeo.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const m = torsoZ(p.getY(i) / TORSO_TOP);
                p.setZ(i, p.getZ(i) * m.d + m.o);
            }
            cuirassGeo.computeVertexNormals();   // 곡면이 바뀌었으므로 필수 — 안 하면 음영이 옛 회전체를 그린다
        }
        const cuirass = new THREE.Mesh(cuirassGeo, steel());
        cuirass.scale.set(1.04, 1.08, CUIRASS_SZ); // 역삼각 실루엣 — 가슴 상향+좌우 확장, 앞뒤 눌림 (비평가: 실루엣 꺾임)
        // 목 링
        const gorget = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.032, 8, 14), steelDark());
        gorget.rotation.x = Math.PI / 2;
        gorget.position.y = 0.45;
        // 가슴 문장 (등급 발광용)
        R.emblemMat = new THREE.MeshStandardMaterial({ color: 0x78909c, metalness: 0.6, roughness: 0.32 });
        const emblem = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), R.emblemMat);
        // z 상수(0.2)를 곡면 계산으로 교체 — 가슴이 앞으로 나온 만큼 문장도 따라 나와야 매몰되지 않는다
        emblem.position.set(0, 0.3, torsoSurfZ(0.3) + 0.002);
        emblem.scale.z = 0.4;
        const emblemRim = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), gold);
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
        const yoke = new THREE.Mesh(new THREE.SphereGeometry(0.155, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), steel());
        yoke.position.y = 0.375;
        yoke.scale.set(1.62, 0.5, 0.92); // 좌우로 넓고 위아래로 눌린 판 — '어깨 폭'을 담당
        // 요크 밑면 니어블랙 — 견갑 안감(pauldronLine)과 같은 언어로 판금 두께를 만든다.
        // 이게 없으면 요크가 종잇장으로 읽혀 어깨선이 그려지기만 하고 입체가 안 생긴다.
        const yokeLine = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 10, 0, Math.PI * 2, Math.PI * 0.36, Math.PI * 0.3), deepLine);
        yokeLine.position.copy(yoke.position);
        yokeLine.scale.copy(yoke.scale);
        spine.add(cuirass, gorget, gorgetIn, chestStrap, emblem, emblemRim, yoke, yokeLine);
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
            pauldronG.position.set(side * 0.012, 0.012, 0);
            pauldronG.rotation.z = side * 0.3;  // 바깥으로 흘러내리는 견갑 각
            // 캡(최상단 라메) — 윗면 거의 수평 → 어깨 모서리에서 급강하. 이 꺾임이 '구가 아님'의 핵심.
            const capPts = [];
            for (const [r, y] of [[0.005, 0.062], [0.038, 0.058], [0.068, 0.047], [0.089, 0.028], [0.097, 0.005], [0.099, -0.016]])
                capPts.push(new THREE.Vector2(r, y));
            const pCap = new THREE.Mesh(new THREE.LatheGeometry(capPts, 14), steel());
            const pCapLine = new THREE.Mesh(new THREE.LatheGeometry(
                capPts.map(v => new THREE.Vector2(v.x * 0.95, v.y - 0.004)), 14), deepLine); // 캡 안감(두께)
            pauldronG.add(pCap, pCapLine);
            // 라메 밴드 2겹 — [상단r, 하단r, 높이, y]. 아래로 갈수록 넓어져(원뿔대) 어깨가 '흘러내린다'.
            // ⚠️ 반지름 상한은 **실루엣 폭**이 정한다 — 첫 판에서 0.117/0.129 로 잡았더니 근접샷에서
            //    어깨가 '판금 선반'으로 읽혔다(구 문제를 반대편으로 넘긴 셈). 원래 반구가 0.105 였으므로
            //    최대 0.119 = +13% 선에서 멈춘다. 라메 판독은 폭이 아니라 **밴드 경계 수**가 만든다.
            for (const [rt, rb, hh, ly] of [[0.097, 0.110, 0.040, -0.035], [0.108, 0.119, 0.035, -0.069]]) {
                const band = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, 14, 1, true), steel());
                band.position.y = ly;
                // 안감은 DoubleSide(deepLine)라 열린 밑단으로 올려다볼 때 어두운 속이 보인다 — 판금 두께
                const bandIn = new THREE.Mesh(new THREE.CylinderGeometry(rt * 0.95, rb * 0.95, hh * 1.04, 14, 1, true), deepLine);
                bandIn.position.y = ly;
                // 밑단 림 — 밴드 경계마다 밝은 금속 테. 구의 매끈한 그라디언트를 가로로 끊는 실질 요소.
                const rim = new THREE.Mesh(new THREE.TorusGeometry(rb, 0.0075, 5, 16), steelDark());
                rim.rotation.x = Math.PI / 2;
                rim.position.y = ly - hh / 2;
                pauldronG.add(band, bandIn, rim);
            }
            const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.019, 6, 5), gold);
            rivet.position.set(side * 0.012, 0.080, 0); // 캡 꼭대기 리벳 (셸 상단 0.062 + 견갑 y 0.012 위)
            aoRing(0.075, 0.018, shoulder, -0.03, 0.5); // 견갑 안쪽-상완 경계 접촉 그림자
            const upperArm = this.capsule(0.062, 0.052, 0.19, mailMat);
            // 상완 패딩 소매 — 견갑 아래로 삐져나오는 누빔천 (판금 → 천 → 사슬 3층 경계)
            const armPad = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.064, 0.05, 12), padding);
            armPad.position.y = -0.02;
            const elbow = new THREE.Group();
            elbow.position.y = -0.19;
            // 팔꿈치 쿠터(couter): 돔 + 측면 팬 윙 — 무릎 폴린과 같은 관절 장갑 언어로 통일
            const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), steel());
            elbowCap.scale.set(1.05, 0.9, 1.15);
            const couterWing = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), steelDark());
            couterWing.position.set(side * 0.036, -0.004, -0.004);
            couterWing.rotation.z = side * -1.35;
            couterWing.scale.set(1, 0.5, 1.1);
            const couterRivet = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5), gold);
            couterRivet.position.set(side * 0.042, 0.004, 0.01);
            // 팔꿈치 개스킷 — 무릎과 같은 언어(니어블랙 관절 슬리브)
            const elbowGasket = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.044, 0.072, 12), deepGasket);
            const forearm = this.capsule(0.046, 0.042, 0.13, mailMat);
            // 뱀브레이스 라메 2겹 — 하완이 민짜 튜브로 남지 않게 판금 밴드를 감는다
            const vambraceA = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.028, 12), steel());
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
            const gloveMat = deepHide;
            const palmMat = this.deepMat({ roughness: 0.88, metalness: 0.1 });
            const fist = new THREE.Group();
            fist.position.y = -0.16;
            const palm = new THREE.Mesh(new THREE.SphereGeometry(0.052, 9, 8), palmMat);
            palm.scale.set(1.0, 1.05, 0.72); // 앞뒤로 눌린 손등 블록
            fist.add(palm);
            const creaseMat = new THREE.MeshBasicMaterial({ color: 0x2e2115 }); // 손가락 사이 다크 크리즈 — 같은 살구색 융합 방지 (비평가 6.8 1번)
            for (let fi = 0; fi < 4; fi++) { // 4지 — 손등 앞면에 나란히, 아래·안쪽으로 말아쥔 2분절
                const fx = (fi - 1.5) * 0.0235;
                const fw = fi === 3 ? 0.017 : 0.02; // 새끼손가락만 가늘게
                const prox = new THREE.Mesh(new THREE.CylinderGeometry(fw * 0.52, fw * 0.56, 0.042, 6), gloveMat);
                prox.position.set(fx, -0.008, 0.045);
                prox.rotation.x = -0.85; // 기절골 — 앞으로 뻗다 아래로 꺾임
                const dist = new THREE.Mesh(new THREE.CylinderGeometry(fw * 0.44, fw * 0.5, 0.036, 6), gloveMat);
                dist.position.set(fx, -0.045, 0.052);
                dist.rotation.x = -2.1; // 말절골 — 손바닥 쪽으로 말림
                const joint = new THREE.Mesh(new THREE.SphereGeometry(fw * 0.56, 6, 5), gloveMat);
                joint.position.set(fx, -0.028, 0.058); // 두 분절 사이 관절 볼록
                fist.add(prox, dist, joint);
                if (fi < 3) { // 손가락 사이 홈 — 얇은 다크 판이 분절 경계를 실루엣 안에서도 판독시킴
                    const crease = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.045), creaseMat);
                    crease.position.set(fx + 0.0118, -0.026, 0.05);
                    crease.rotation.x = -1.4;
                    fist.add(crease);
                }
            }
            // 엄지 — 손 안쪽에서 손가락들 앞을 가로지르는 2분절
            const thumbA = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.045, 6), gloveMat);
            thumbA.position.set(side * -0.045, -0.022, 0.03);
            thumbA.rotation.set(-0.5, 0, side * -0.85);
            const thumbB = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.036, 6), gloveMat);
            thumbB.position.set(side * -0.022, -0.05, 0.052);
            thumbB.rotation.set(-1.4, 0, side * -0.35);
            fist.add(thumbA, thumbB);
            // 강철 너클 가드 — 손등 위 장갑판 (건틀릿다움 + 프리미티브 접합 은폐)
            // 다크 스틸은 가죽과 명도가 붙어 안 읽힘(비평가 6.8 1번) — 밝은 스틸 + 골드 리벳으로 재질 대비 확보
            const guard = new THREE.Mesh(new THREE.SphereGeometry(0.048, 9, 7), steel());
            guard.position.set(0, 0.012, 0.012);
            guard.scale.set(1.15, 0.75, 0.85);
            const gRivet = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), gold);
            gRivet.position.set(0, 0.03, 0.038);
            fist.add(guard, gRivet);
            // 손목 가죽 스트랩 — 클로즈업 중간 디테일 (커프-주먹 경계 정의)
            const strap = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.012, 6, 12), gloveMat);
            strap.rotation.x = Math.PI / 2;
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

        // 방패 (왼손) — 축소 라운드 셸 + 림 리벳 + 문장 필드(등급색 틴트 대상) + 방사 보강대
        const shieldG = new THREE.Group();
        // ⚠️ 이 돔은 thetaLength 0.35π의 **뚜껑 없는 개방 셸**이다. 기본 side=FrontSide면
        // 오목한 안쪽에서 볼 때 한 픽셀도 그리지 않아, 문장 원판(r 0.105)과 금색 림(r 0.155)
        // 사이 고리 영역으로 **배경이 그대로 비친다**(probe-shield.js: 안쪽 시점에서 돔 기여
        // 0픽셀, domeSide=FrontSide, domePhi=1.1 실측 / 비평가 B가 "림 안으로 풀과 꽃이
        // 보인다"고 지목한 것의 실체). 팔이 스윙하며 안쪽이 카메라를 향하는 순간이 실제로 있다.
        const shieldShellMat = steel();
        shieldShellMat.side = THREE.DoubleSide;   // steel()은 호출마다 새 인스턴스라 다른 파츠에 영향 없음
        const shieldBody = new THREE.Mesh(
            new THREE.SphereGeometry(0.185, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), shieldShellMat);
        shieldBody.rotation.x = Math.PI / 2;
        shieldBody.scale.set(1, 1, 1.25);
        const shieldRim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.017, 6, 22), gold);
        // 문장 필드 — 중앙 원판(장비 없을 땐 청강색, 갑옷 장착 시 등급색)
        R.shieldFaceMat = new THREE.MeshStandardMaterial({ color: 0x3f5a74, metalness: 0.55, roughness: 0.42 });
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
        // 뒷판 + 가죽 손잡이 끈 — ① 개방 셸을 실제로 막아 두께가 있는 방패로 읽히게 하고
        // ② 비평가 2인이 공통 1위로 지목한 '캐릭터에 진짜 어두운 값이 없다'는 결함에
        // 니어블랙 가죽 면적을 보태며 ③ "들고 있지 않고 떠 있다"는 지적(손잡이 부재)을 해소한다.
        const shieldBack = new THREE.Mesh(new THREE.CylinderGeometry(0.163, 0.163, 0.012, 20), deepHide);
        shieldBack.rotation.x = Math.PI / 2;
        shieldBack.position.z = -0.012;
        shieldG.add(shieldBack);
        for (const sy of [-1, 1]) {   // 팔을 지나는 가로 스트랩 2줄 (뒷판보다 앞=팔 쪽)
            const strap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.028, 0.016), deepHide);
            strap.position.set(0, sy * 0.062, -0.03);
            shieldG.add(strap);
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
        headG.scale.setScalar(0.68); // 보블헤드 완화 4차 — 다리 연장과 병행해도 두신비 1:3 '아기 로봇' 지적 잔존 (0.78→0.73→0.68)
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
        const collarPts = [];
        for (const [r, y] of [[0.099, 0.432], [0.092, 0.468], [0.097, 0.502], [0.111, 0.533], [0.114, 0.547]])
            collarPts.push(new THREE.Vector2(r, y));
        const collar = new THREE.Mesh(new THREE.LatheGeometry(collarPts, 16), steel());
        // 칼라 안감 — 위가 열린 셸이라 안쪽이 보인다. 니어블랙으로 채워야 목이 '뚫린 밝은 구멍'이 아니라
        // 그늘로 읽힌다(gorgetIn 이 같은 일을 링 안쪽에서 하고 있고, 그 위를 이어받는다).
        const collarIn = new THREE.Mesh(new THREE.LatheGeometry(
            collarPts.map(v => new THREE.Vector2(v.x * 0.93, v.y)), 16), deepLine);
        // 칼라 상단 림 — 견갑 라메와 같은 언어(밴드 밑단 밝은 테)로 칼라 끝을 매듭짓는다
        const collarRim = new THREE.Mesh(new THREE.TorusGeometry(0.114, 0.008, 5, 18), steelDark());
        collarRim.rotation.x = Math.PI / 2;
        collarRim.position.y = 0.547;
        spine.add(collar, collarIn, collarRim);
        // 얼굴 — 둥근 두상 + 턱 라운딩 (헬멧 미착용 시 노출)
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), skin);
        skull.position.y = 0.08;
        skull.scale.set(0.95, 1.05, 0.95);
        const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 9), skin);
        jaw.position.set(0, -0.01, 0.02);
        jaw.scale.set(0.95, 0.7, 0.9);
        headG.add(skull, jaw);
        // 얼굴 이목구비 그룹 — 풀커버 투구(visor/mask/tech) 착용 시 통째로 숨김 (투구 밖으로 코/눈 뚫림 방지)
        const faceG = new THREE.Group();
        headG.add(faceG);
        R.faceMesh = faceG;
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
            faceG.add(sclera, iris, pupil, hl);
            // 볼터치 — 반투명 분홍 (캐주얼 3D 표정 온기)
            const blush = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf29a8a, transparent: true, opacity: 0.38 }));
            blush.position.set(dx * 1.35, 0.008, 0.148);
            blush.scale.set(1.2, 0.7, 0.35);
            faceG.add(blush);
            // 눈썹 — 살짝 기울인 가는 캡슐 (결의 있는 인상)
            const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), new THREE.MeshLambertMaterial({ color: 0x6e4e1a })); // r128엔 CapsuleGeometry 없음
            brow.position.set(dx, 0.128, 0.168);
            brow.rotation.z = Math.PI / 2 + (dx < 0 ? -0.16 : 0.16);
            brow.rotation.y = (dx < 0 ? -1 : 1) * 0.35;
            faceG.add(brow);
        }
        // 코 — 작은 라운드 범프
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), skin);
        nose.position.set(0, 0.045, 0.19);
        nose.scale.set(0.8, 1, 0.85);
        faceG.add(nose);
        // 입 — 옅은 미소 라인 (얇은 토러스 하단 아크, 절제된 톤)
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0045, 5, 10, Math.PI * 0.6), new THREE.MeshBasicMaterial({ color: 0xb5786a }));
        mouth.position.set(0, -0.028, 0.172);
        mouth.rotation.z = Math.PI + Math.PI * 0.2;
        mouth.rotation.x = -0.3;
        faceG.add(mouth);
        // 머리카락 (헬멧 없을 때) — 스웹트 숏컷: 베이스 캡 + 납작한 사이드스윕 프린지 (뭉게뭉게 금지)
        const hairG = new THREE.Group();
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x8f6a26, metalness: 0, roughness: 0.5 }); // 머릿결 광택 — 낮은 러프니스
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

        root.position.y = 0.08; // 발바닥(pelvis 0.615 - 고관절 0.06 - 대퇴 0.32 - 정강이/부츠 0.315)이 y=0에 닿는 보정 — 연장분은 pelvis 상향으로 상쇄
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
                // 팔꿈치·무릎 미세 굽힘 — 차렷 막대기 자세 탈피 (사용자 지적)
                'elbowL.rx': [[0, -0.22], [0.5, -0.16], [1, -0.22]],
                'elbowR.rx': [[0, -0.18], [0.5, -0.25], [1, -0.18]],
                'kneeL.rx': [[0, -0.05], [0.5, -0.08], [1, -0.05]],
                'kneeR.rx': [[0, -0.08], [0.5, -0.05], [1, -0.08]],
                'hipL.rx': [[0, 0.04], [1, 0.04]],
                'hipR.rx': [[0, 0.06], [1, 0.06]],
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
                // 바운스: 콘택트(0.45/0.95 부근)에서 낮고 패싱에서 높음
                'root.py': [[0, 0.04], [0.2, 0.01], [0.45, 0.005], [0.7, 0.045], [0.95, 0.005], [1, 0.04]],
                'cape.rx': [[0, 0.26], [0.25, 0.44], [0.5, 0.3], [0.75, 0.44], [1, 0.26]], // 걸음마다 출렁 — 강체 삼각형 오독 (비평가 6번)
                'cape.rz': [[0, 0.06], [0.5, -0.06], [1, 0.06]],
                'neck.rx': [[0, -0.08], [1, -0.08]],
            }
        },
        slash: { // 대각 베기: 와인드업(뒤·위) → 스냅 스윙 → 팔로스루
            dur: 0.5, tracks: {
                'shoulderR.rx': [[0, -0.2], [0.3, -2.45], [0.55, 1.05], [1, -0.2]], // 아크 과장 — 어깨 위 와인드업에서 반대편 허리까지 사선 풀 아크 (비평가: '블레이드 옆 스텁')
                'shoulderR.rz': [[0, -0.06], [0.3, -1.05], [0.55, 0.62], [1, -0.06]],
                'elbowR.rx': [[0, -0.15], [0.3, -0.5], [0.55, -0.05], [1, -0.15]],
                'spine.ry': [[0, 0], [0.3, -0.65], [0.55, 0.58], [1, 0]],
                'spine.rx': [[0, 0.02], [0.3, -0.06], [0.55, 0.22], [1, 0.02]],
                'shoulderL.rx': [[0, -0.1], [0.3, 0.3], [0.55, -0.5], [1, -0.1]],
                'cape.rx': [[0, 0.05], [0.45, 0.5], [1, 0.05]],
            }
        },
        chop: { // 머리 위로 크게 들어 내려찍기
            dur: 0.55, tracks: {
                'shoulderR.rx': [[0, -0.2], [0.35, -2.9], [0.6, 0.9], [1, -0.2]], // 팔로스루 연장 — 내려찍기 아크가 허리 아래까지
                'elbowR.rx': [[0, -0.15], [0.35, -0.75], [0.6, -0.05], [1, -0.15]],
                'spine.rx': [[0, 0.02], [0.35, -0.18], [0.6, 0.36], [1, 0.02]],
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
        // 무기별 다관절 거치 자세(rx 가산) — 공격/사망(once) 클립 중에는 클립이 양팔을 전부 정의하므로 미적용
        // 값이 숫자면 rx 가산(기존 무기 거치 자세), 객체면 {rx,ry,rz} 축별 가산 —
        // 탑승 포즈는 다리를 '벌려서' 감싸야 해서 rz(좌우 벌림)가 필수다.
        const addPose = (pose) => {
            for (const bn in pose) {
                const b = R.bones[bn]; if (!b) continue;
                const v = pose[bn];
                if (typeof v === 'number') b.rotation.x += v;
                else {
                    if (v.rx) b.rotation.x += v.rx;
                    if (v.ry) b.rotation.y += v.ry;
                    if (v.rz) b.rotation.z += v.rz;
                }
            }
        };
        if (R.restPose && !R._once) addPose(R.restPose);
        // 탑승 하체 포즈는 **공격 클립(once) 중에도 유지**한다 — restPose를 통째로 끄면 안장에 감겨 있던
        // 다리가 공격 한 번에 곧게 펴져 '올라탄 게 아니라 위에 떠서 지나가는' 프레임이 나온다
        // (실측: 4계열 전부 공격 중 hip/knee가 0으로 복귀). 공격 클립이 정의하는 건 어깨·팔꿈치·척추뿐이라
        // 하체를 가산해도 상체 아크는 그대로다. 사망·기상 클립만 예외 — 쓰러진 몸이 다리를 감고 있으면 더 어색하다.
        else if (R.ridePose && R._once && !R._clip.groundPose) addPose(R.ridePose);
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
        // 헬멧 착용 시 머리카락 숨김 (기존 helmetG 시스템이 머리에 붙음)
        if (R.hairMesh) R.hairMesh.visible = !equipment.helmet;
        // 풀커버 투구(visor/mask/tech)는 이목구비도 숨김 — 코/눈이 투구 밖으로 뚫고 나오던 문제 (비평가 1위 결함)
        if (R.faceMesh) {
            const hStyle = equipment.helmet ? itemStyleOf(equipment.helmet) : null;
            R.faceMesh.visible = !(hStyle === 'visor' || hStyle === 'mask' || hStyle === 'tech');
        }
    },
};
