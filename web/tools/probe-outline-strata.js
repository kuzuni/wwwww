// 검정 아웃라인 — **경계로부터의 거리** 자 + **파츠 단위 침식** 축 (slug: uniform-outline-postfx).
//
// 🚨 왜 자를 갈아 끼웠나 (2026-08-25, 3D 스트림 — 종전 '런 길이' 자의 사각지대):
//    종전 판정기는 두께를 **검정 화소의 런 길이**로 쟀다. 그런데 화면상 폭이 2~4px 인 얇은 파츠
//    (펫 다리·귀)는 좌·우 두 모서리가 **각각** 근측 2px 을 칠하므로 파츠가 통째로 검어진다.
//    런 길이 자는 이 '겹친 두 선'을 '한 두꺼운 선'과 **구분하지 못해** `pets/crease` 를 3px 로
//    읽었다. 임계를 아무리 쓸어도(NORMAL_K 0.8·0.9·1.0) 안 내려간 이유가 이것이다 —
//    **값 튜닝이 아니라 자가 틀렸다.** (12× 확대 `tools/outline-thick-pets.png` 로 눈 확정.)
//
//    📌 **런 길이 자는 다른 쪽으로도 거짓말을 한다**(병렬 3D 세션이 같은 날 독립으로 확인, 커밋
//       6abb9a6c — 두께 지도로 확정). ⓐ 두 선이 각을 이루는 **볼록 코너**는 가로·세로 런이 둘 다
//       길어져 `min(h,v)` 이 3~4px 로 찍히는데 선은 2px 다. ⓑ 4방향 **최솟값**을 쓰면 비스듬한 선의
//       **계단 화소**에서 한 대각 런이 1 이라 1px 로 깎인다. 그쪽은 '4방향 중 두 번째로 작은 값'으로
//       두 오차를 동시에 눌렀는데, 그 보정으로도 **'겹친 두 선'과 '한 두꺼운 선'은 여전히 못 가른다**
//       — 런 길이라는 축 자체가 그 구분을 담지 못하기 때문이다. 아래 거리 자는 코너·계단·겹침을
//       한꺼번에 없앤다(코너도 계단도 제 경계에서 D≤1 이다).
//
// 🧭 새 자 — 두께는 '얼마나 길게 이어졌나'가 아니라 **'경계에서 얼마나 멀리 번졌나'** 다.
//    깊이맵에서 **경계(seed)를 먼저 뽑고**, 검정 화소마다 *깊이가 이어진 경로로* 가장 가까운
//    seed 까지의 거리 D 를 BFS 로 잰다. 두께 = D+1.
//    · 얇은 파츠의 '겹친 두 선' → 두 선 다 자기 모서리에서 D≤1 이라 **위반이 아니다**(정상).
//    · 진짜로 부푼 선 / 계단을 건너뛴 선 → D≥2 로 **잡힌다**(건너뛴 쪽은 깊이 연결이 끊겨
//      우회 경로만 남으므로 거리가 커진다).
//
// 세 축으로 나눠 잰다 — **두께·덮임·침식은 서로 다른 결함**이고 하나로 뭉치면 서로를 덮는다:
//   Ⓐ 부풂(bloat)  : 검정 화소의 D+1 분포. 경계 종류·계열과 무관하게 같아야 한다.
//   Ⓑ 덮임(coverage): seed 중 실제로 검게 칠해진 비율. '선이 아예 없는 경계'(종전 턱↔가슴·
//                     발굽↔지면)를 잡는 축. 두께가 아무리 고와도 여기가 낮으면 조형이 흐른다.
//   Ⓒ 침식(erosion) : 실루엣 경계마다 **안으로 걸어 들어가 파츠의 화면폭 w** 를 잰다. 선 반경이
//                     R 이면 양쪽에서 R 씩 칠하므로 **w ≤ 2R 인 자리는 통째로 먹힌다**.
//                     고정 반경 창으로는 못 푼다는 게 2026-08-25 실패 2회로 확정됐고(TODO 🧪),
//                     연결성분(flood fill)도 이번에 실패했다 — 접힘선은 1px 짜리 **구멍 뚫린
//                     울타리**라 한 화소만 새도 온몸이 성분 하나가 된다(실측: 영웅 8434px = 파츠 1개).
//                     걸어서 재는 자는 파츠를 나누지 않으므로 그 누수가 원천적으로 없다.
//
// ⚖️ **Ⓐ 가 부분적으로 순환(circular)이라는 점을 숨기지 않는다.** seed 를 셰이더와 같은 기하 규칙
//    (실루엣·법선·곡률)으로 뽑으므로, 셰이더가 제 규칙대로 칠하기만 하면 Ⓐ 는 통과한다. 그래도
//    무의미하진 않다 — seed 는 **16bit 로 리드백한 깊이맵**에서 독립으로 뽑고, 확산은 **깊이가
//    이어진 경로로만** 하므로 ⑴ 계단을 건너뛰어 먼 쪽까지 칠한 선 ⑵ 어떤 경계와도 안 이어진 검정
//    은 그대로 잡힌다(실측: 곡률 항을 seed 에서 빼먹었을 때 crease p99 가 6~7px 로 튀고 미연결
//    검정이 105개 나왔다). Ⓐ 는 '규칙대로 칠했나'를, Ⓑ·Ⓒ 는 '그 규칙이 조형에 뭘 하나'를 잰다.
//
// 🚨 **'몸통 검정비율'은 게이트가 아니라 진단이다 — 게이트로 올리면 안 된다.** 실측상 펫 30%,
//    영웅 17%, 적 13% 로 2.3배 차가 난다. 그런데 이건 결함이 아니라 **기하학적 필연**이다:
//    선 폭이 균일하면 화면상 작은 물체일수록 둘레/넓이 비가 커서 더 많이 먹힌다. 이걸 게이트로
//    걸면 '펫만 선을 얇게' = **사용자 요구("펫도 탈것 무기 전부 다 아웃라인 크기 같아야함")의
//    정반대**로 몰린다. 그래서 수치는 찍되 판정에는 안 쓴다.
//
// 층(strata) — 아웃라인 화소마다 반경 2 이웃의 선형깊이를 보고 분류한다:
//   ① sky  : 이웃 중 배경(깊이≈far)이 있다 → 하늘과 맞닿은 실루엣
//   ② step : 이웃과의 깊이 계단이 크다(≥ STEP_Z) → 물체끼리 겹친 경계
//   ③ crease: 깊이 계단이 작다(< STEP_Z) → 턱↔가슴·발굽↔지면 같은 **법선 불연속** 경계
//
// 깊이는 추측하지 않는다 — 컴포짓과 같은 `_rtScene.depthTexture` 를 16bit 로 패킹해 캔버스로 뽑는다.
// 오브젝트 마스크도 **색이 아니라 깊이 차분**으로 뽑는다(색 차분은 그림자가 딸려 온다).
//
// 사용: node probe-outline-strata.js   (종료코드 0=통과)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const MIN_N = 120;          // 층마다 이 정도는 있어야 '그 종류 경계에 선이 있다'고 말할 수 있다
const COVER_MIN = 0.90;     // Ⓑ seed 중 이 비율 이상은 검게 칠해져 있어야 한다
const EROSION_MAX = 0.20;   // Ⓒ '통째로 먹힌 파츠'에 속한 오브젝트 화소가 이 비율을 넘으면 FAIL
const LINE_R = 2;           // 셰이더의 선 반경(반경 1 검출 + 1px 팽창) — 침식 판정의 기준자

const runOne = async (browser, label, ua) => {
    const page = await browser.newPage(Object.assign({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 }, ua ? { userAgent: ua } : {}));
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    // 튜닝 스윕용 노브 — `CREASE_K=0.004 node probe-outline-strata.js` 처럼 임계만 갈아 끼워 재본다
    // (셰이더 소스를 고쳐 가며 재면 '어느 값에서 재 본 수치인지'가 커밋 사이에서 흐려진다).
    const OV = { creaseK: process.env.CREASE_K ? +process.env.CREASE_K : null, edgeK: process.env.EDGE_K ? +process.env.EDGE_K : null, normalK: process.env.NORMAL_K ? +process.env.NORMAL_K : null };
    const out = await page.evaluate(({ MIN_N, OV, COVER_MIN, EROSION_MAX, LINE_R }) => {
        const R = { postOn: !!Scene3D.postOn, postEdge: !!Scene3D.postEdge };
        for (const k of ['creaseK', 'edgeK', 'normalK']) if (OV[k] !== null && Scene3D._compMat.uniforms[k]) Scene3D._compMat.uniforms[k].value = OV[k];
        R.ov = OV;
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (t) => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        // ── 씬: 탈것 탑승 + 펫 3 + 적 1 (짝 판정기와 동일 구성) ──
        S.mounts = { 'Brown Horse': { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Brown Horse'; Scene3D.refreshMount();
        S.pets = Object.keys(PET_ICONS).slice(0, 3).map(nm => ({ name: nm, rarity: 'epic', level: 1, dupes: 0 }));
        S.activePets = [0, 1, 2]; Scene3D.refreshPets();
        Scene3D.clearEnemies();
        const e = { id: 951, x: Combat.MELEE_X, alive: true, hp: Big.of(1e6), maxHp: Big.of(1e6), isBoss: false, kind: 'goblin' };
        Combat.enemies = [e]; Scene3D.spawnEnemy(e);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
        Scene3D.anims = [];
        const em = Scene3D.enemyMap.get(951);
        em.g.position.set(e.x + Scene3D.worldX, 0, 0); em.g.userData.landed = true;
        // 🚨 **애니메이션 위상을 고정한다 — 안 하면 판정이 실행마다 흔들린다.** 로드 뒤
        //    `waitForTimeout` 동안 rAF 가 몇 프레임 돌았는지가 매번 달라서, 그대로 재면 같은 셰이더로도
        //    커버리지가 75.9% ↔ 83.3% 로 널뛴다(실측). 마스터 시계 `_clock` 과 리그 시계 `_t` 를 0 으로
        //    놓고 항상 같은 시간만큼 돌려야 **게이트가 재현 가능**해진다.
        Scene3D._clock = 0;
        if (Scene3D.heroRig) Scene3D.heroRig._t = 0;
        step(0.9);

        const gl = Scene3D.renderer.domElement;
        const cv = document.createElement('canvas'); cv.width = gl.width; cv.height = gl.height;
        const ctx = cv.getContext('2d');
        const W = cv.width, H = cv.height;
        R.buf = { w: W, h: H };
        const u = Scene3D._compMat.uniforms;
        // 🚨 **블룸·비네트를 끄고 잰다.** 엣지 항은 깊이만 보므로 이 둘은 어느 화소가 검게 칠해지는지에
        //    전혀 관여하지 않는다 — 그런데 마스크 조건이 '켠 프레임이 검정 + 끈 프레임은 아님' 이라,
        //    비네트가 화면 가장자리를 16 밑으로 눌러 놓으면 **그 자리 선이 마스크에서 통째로 빠지고**
        //    런이 쪼개져 두께가 낮게 찍힌다(실측: 데스크톱만 한 칸이 1px 로 찍혔고 모바일은 vig=0 이라
        //    멀쩡했다 — 셰이더가 아니라 판정기의 착시였다).
        //    ⚠️ strength 는 renderFrame 이 매 프레임 `_bloomStrength` 에서 다시 넣으므로 원본을 0 으로 둔다.
        if (u.vig) u.vig.value = 0.0;
        Scene3D._bloomStrength = 0.0;
        if (u.strength) u.strength.value = 0.0;

        // ── 깊이 리드백 재질: 선형 뷰깊이를 R:G 16bit 로 패킹 ──
        //    (컴포짓과 **같은 depthTexture·같은 near/far** 를 쓰므로 셰이더가 본 값과 일치한다.)
        const V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
        const depthMat = new THREE.ShaderMaterial({
            uniforms: { tDepth: { value: null }, camNear: { value: 0.1 }, camFar: { value: 100 } },
            vertexShader: V,
            fragmentShader: '#include <packing>\n' +
                'varying vec2 vUv; uniform sampler2D tDepth; uniform float camNear; uniform float camFar;\n' +
                'void main(){ float d = texture2D(tDepth, vUv).x;\n' +
                '  float z = -perspectiveDepthToViewZ(d, camNear, camFar);\n' +
                '  float t = clamp(z / camFar, 0.0, 1.0) * 255.0;\n' +
                '  float hi = floor(t); float lo = floor((t - hi) * 255.0);\n' +
                '  gl_FragColor = vec4(hi / 255.0, lo / 255.0, 0.0, 1.0); }',
            depthTest: false, depthWrite: false,
        });

        // 🚨 **아웃라인은 세 항의 합이다** — 실루엣(edgeK) + 법선 불연속(normalK) + 곡률(creaseK).
        //    'off' 프레임을 만들 때 **셋을 다 꺼야** 한다. 하나라도 살려 두면 그 선은 on/off 양쪽에
        //    똑같이 검정으로 찍혀 **차분에서 지워지고**, 마스크가 통째로 비어 버린다(실측 2026-08-25:
        //    normalK 를 빼먹었더니 엣지 화소 5353 → 1065, 하늘 경계는 0 개로 사라졌다).
        //    normalK 는 `1 - dot(n,n')` 을 재므로 이론 최대가 2 다 — 9 를 넣으면 확실히 안 걸린다.
        const edgeOff = (u, off, restore) => {
            const keys = { edgeK: 1e9, creaseK: 1e9, normalK: 9.0 };
            const saved = {};
            for (const k in keys) {
                if (!u[k]) continue;
                saved[k] = u[k].value;
                if (off) u[k].value = keys[k];
                else if (restore) u[k].value = restore[k];
            }
            return saved;
        };
        const grab = () => {
            Scene3D.renderFrame();
            ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0);
            return ctx.getImageData(0, 0, W, H).data;
        };
        // 깊이맵은 renderFrame() 으로 _rtScene 을 채운 **직후** 풀스크린 쿼드를 캔버스에 한 번 더 쏴서 뽑는다.
        const grabDepth = () => {
            Scene3D.renderFrame();
            const r = Scene3D.renderer;
            const prevMat = Scene3D._fsQuad.material;
            depthMat.uniforms.tDepth.value = Scene3D._rtScene.depthTexture;
            depthMat.uniforms.camNear.value = Scene3D.camera.near;
            depthMat.uniforms.camFar.value = Scene3D.camera.far;
            Scene3D._fsQuad.material = depthMat;
            r.setRenderTarget(null); r.render(Scene3D._fsScene, Scene3D._fsCam);
            Scene3D._fsQuad.material = prevMat;
            ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0);
            const px = ctx.getImageData(0, 0, W, H).data;
            const far = Scene3D.camera.far;
            const z = new Float32Array(W * H);
            for (let i = 0, p = 0; i < W * H; i++, p += 4) z[i] = (px[p] + px[p + 1] / 255) / 255 * far;
            return z;
        };

        const FAR = Scene3D.camera.far * 0.9;   // 이 위면 배경(하늘)
        const STEP_Z = 0.30;                    // 이보다 큰 깊이 계단 = '물체끼리 겹침'
        const EK = u.edgeK.value, NK = u.normalK.value, CK = u.creaseK ? u.creaseK.value : null;
        R.k = { edgeK: EK, normalK: NK, creaseK: u.creaseK ? u.creaseK.value : null };

        // ── 깊이에서 뷰공간 법선 복원 — **셰이더와 같은 식**(pnrm) 을 JS 로 옮긴 것 ──
        //    q=1/z 가 시야평면 좌표의 1차식이라는 원근의 성질을 쓴다: n ∝ (q_u, q_v, −(q − u·q_u − v·q_v)).
        //    캔버스는 y 가 아래로 가므로 vUv.y = 1 − (y+0.5)/H 로 되돌린다(부호가 dot 에는 안 남지만,
        //    이웃 오프셋과 짝이 맞아야 접힘 각이 정확하다).
        const PX = u.proj.value.x, PY = u.proj.value.y;
        const DU = 2 * PX / W, DV = -2 * PY / H;   // 캔버스 x/y 를 +1 옮길 때의 (u,v) 변화
        const normals = (z) => {
            const nx = new Float32Array(W * H), ny = new Float32Array(W * H), nz = new Float32Array(W * H);
            for (let y = 1; y < H - 1; y++) {
                for (let x = 1; x < W - 1; x++) {
                    const i = y * W + x;
                    const q = 1 / z[i];
                    const gu = (1 / z[i + 1] - 1 / z[i - 1]) / (2 * DU);
                    const gv = (1 / z[i + W] - 1 / z[i - W]) / (2 * DV);
                    const uu = (((x + 0.5) / W) * 2 - 1) * PX, vv = ((1 - (y + 0.5) / H) * 2 - 1) * PY;
                    let a = gu, b = gv, c = -(q - uu * gu - vv * gv);
                    const L = Math.hypot(a, b, c) || 1;
                    nx[i] = a / L; ny[i] = b / L; nz[i] = c / L;
                }
            }
            return { nx, ny, nz };
        };
        const stat = (hist, m) => {
            const ks = Object.keys(hist).map(Number).sort((a, b) => a - b);
            const pct = (q) => { let c = 0; for (const kk of ks) { c += hist[kk]; if (c >= m * q) return kk; } return ks[ks.length - 1] || 0; };
            return { n: m, median: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: ks[ks.length - 1] || 0, hist: ks.slice(0, 5).map(kk => [kk, hist[kk]]) };
        };

        // ── 계열 하나를 띄우고 그 프레임에서 세 축을 낸다 ──
        //    계열 격리가 필요한 이유: 다 켜 놓으면 펫이 탈것을 가려 '펫의 하늘 경계'가 '겹침 경계'로
        //    둔갑한다 — 계열별 요구("펫도 탈것 무기 전부 다 아웃라인 크기 같아야함")를 못 재게 된다.
        const all = [Scene3D.heroG, Scene3D.mountGroup, ...(Scene3D.petGroups || []), em.g].filter(Boolean);

        // 빈 씬 깊이 — 오브젝트 마스크를 **깊이 차분**으로 뽑는 기준 (그림자·색은 안 딸려 온다)
        const prevAll = all.map(g => g.visible);
        all.forEach(g => { g.visible = false; });
        const zBase = grabDepth();
        all.forEach((g, i) => { g.visible = prevAll[i]; });

        const measure = (showFn) => {
            const prev = all.map(g => g.visible);
            all.forEach(g => { g.visible = false; });
            showFn();
            const saved = edgeOff(u, false);       // 엣지 켠 채로 저장만
            const on = grab();                     // 엣지 켠 프레임
            edgeOff(u, true);                      // 세 항 전부 임계 무한 = 엣지 0
            const off = grab();
            edgeOff(u, false, saved);              // 복구
            const z = grabDepth();
            all.forEach((g, i) => { g.visible = prev[i]; });

            const mask = new Uint8Array(W * H);    // 아웃라인 화소(on/off 차분)
            let n = 0;
            for (let i = 0, p = 0; i < W * H; i++, p += 4) {
                if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) { mask[i] = 1; n++; }
            }
            const { nx, ny, nz } = normals(z);

            // ── seed = 깊이맵이 말하는 **경계 위치** (셰이더 결정이 아니라 기하로 뽑는다) ──
            //    ⒜ 실루엣 seed: 4-이웃 중 나보다 **유의하게 먼** 화소가 있다 → 나는 계단의 근측이다.
            //    ⒝ 접힘 seed : 4-이웃과의 법선 각이 크다 → 턱↔가슴·발굽↔지면 같은 접힘.
            //    ⒝ 는 좌우 대칭이라 접힘선은 양쪽에서 각각 seed 가 된다(셰이더의 crs 항과 같은 성질).
            const seed = new Uint8Array(W * H);
            const seedSil = new Uint8Array(W * H);
            let nSeed = 0;
            const NB = [-1, 1, -W, W];
            for (let y = 1; y < H - 1; y++) {
                for (let x = 1; x < W - 1; x++) {
                    const i = y * W + x;
                    const z0 = z[i];
                    if (z0 > FAR) continue;                       // 하늘 자신은 경계의 근측이 아니다
                    if (z0 > u.edgeMaxZ.value) continue;          // 지평선 컷 — 셰이더도 여기선 안 그린다
                    let sil = false, fold = false;
                    for (const d of NB) {
                        const j = i + d;
                        if (z[j] - z0 >= EK * z0) sil = true;
                        else if (Math.abs(z[j] - z0) < EK * z0) {
                            const dt = nx[i] * nx[j] + ny[i] * ny[j] + nz[i] * nz[j];
                            if (1 - dt >= NK) fold = true;
                        }
                    }
                    // 🚨 곡률 항을 빼먹으면 안 된다 — 셰이더의 접힘은 `normalK`(법선 각) **또는**
                    //    `creaseK`(역깊이 2차 차분) 로 그려진다. 법선 항만 seed 로 잡으면 곡률로 그린
                    //    선들이 '경계 없는 검정'이 돼 거리 D 가 4~7px 로 치솟는다 — 셰이더가 아니라
                    //    **자가 만든 거짓 FAIL** 이다(실측 2026-08-25: 전 계열 crease p99 = 6~7).
                    if (!sil && !fold && CK !== null) {
                        const q0 = 1 / z0;
                        const cx = Math.abs(1 / z[i - 1] + 1 / z[i + 1] - 2 * q0);
                        const cy = Math.abs(1 / z[i - W] + 1 / z[i + W] - 2 * q0);
                        if (Math.max(cx, cy) >= CK * q0) fold = true;
                    }
                    if (sil || fold) { seed[i] = 1; nSeed++; if (sil) seedSil[i] = 1; }
                }
            }

            // ── Ⓐ 부풂: seed 에서 **깊이가 이어진 경로로만** BFS. 두께 = D+1 ──
            //    깊이가 끊긴 이웃으로 안 퍼지므로, 계단을 건너뛰어 칠해진 화소는 우회 경로만 남아
            //    거리가 크게 나온다 — '먼 쪽까지 칠했다'는 결함이 이 축에 잡힌다.
            const D = new Int32Array(W * H).fill(-1);
            let head = 0; const q = new Int32Array(W * H);
            for (let i = 0; i < W * H; i++) if (seed[i]) { D[i] = 0; q[head++] = i; }
            let tail = 0;
            while (tail < head) {
                const i = q[tail++]; const z0 = z[i]; const d0 = D[i];
                if (d0 >= 6) continue;                            // 6px 넘게 번진 건 이미 명백한 위반
                for (const dd of NB) {
                    const j = i + dd;
                    if (j < 0 || j >= W * H || D[j] >= 0) continue;
                    if (Math.abs(z[j] - z0) >= EK * z0) continue; // 깊이가 끊긴 이웃으로는 안 퍼진다
                    D[j] = d0 + 1; q[head++] = j;
                }
            }

            // ── 층화 + 축별 집계 ──
            const strata = { sky: {}, step: {}, crease: {} };
            const cnt = { sky: 0, step: 0, crease: 0 };
            const cover = { sky: [0, 0], step: [0, 0], crease: [0, 0] };  // [칠해짐, 전체]
            let orphan = 0;                                        // seed 와 이어지지 않은 검정 화소
            const clsOf = (i) => {
                const z0 = z[i];
                let sky = false, mx = 0;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        if (dx * dx + dy * dy > 4 || (!dx && !dy)) continue;
                        const zn = z[i + dy * W + dx];
                        if (zn > FAR) sky = true;
                        const d = Math.abs(zn - z0); if (d > mx) mx = d;
                    }
                }
                return sky ? 'sky' : (mx >= STEP_Z ? 'step' : 'crease');
            };
            for (let y = 2; y < H - 2; y++) {
                for (let x = 2; x < W - 2; x++) {
                    const i = y * W + x;
                    if (mask[i]) {
                        const c = clsOf(i);
                        if (D[i] < 0) { orphan++; }
                        else { const t = D[i] + 1; strata[c][t] = (strata[c][t] || 0) + 1; cnt[c]++; }
                    }
                    // Ⓑ 덮임은 **실루엣 seed** 로만 잰다 — 접힘 seed 는 억제 규칙(계단 반경 안에서
                    //    ②③을 끈다)이 걸려 '안 칠하는 게 정답'인 자리가 섞여 있어 자로 못 쓴다.
                    if (seedSil[i]) { const c = clsOf(i); cover[c][1]++; if (mask[i]) cover[c][0]++; }
                }
            }

            // ── Ⓒ 침식: **경계에서 안으로 걸어 들어가 파츠의 화면상 폭을 잰다** ──
            //    🚨 연결성분(flood fill)으로 파츠를 나누려던 첫 판은 실패했다 — 접힘선은 1px 짜리
            //       **구멍 뚫린 울타리**라, 한 화소만 새도 온몸이 성분 하나로 합쳐진다(실측: 영웅
            //       8434px 이 파츠 1개). 고정 반경 창도 못 쓴다(TODO 🧪 실패 2회).
            //    ✅ 그래서 **파츠를 나누지 않는다.** 실루엣 seed 마다 '먼 이웃'의 반대쪽으로 걸어가
            //       오브젝트를 벗어나거나 깊이가 끊길 때까지 센다 = 그 경계에서 파츠의 **가로폭 w**.
            //       선 폭이 R 이면 양쪽에서 R 씩 칠하므로 **w ≤ 2R 인 자리는 통째로 먹힌다.**
            //       파츠 크기에 **상대적인** 자이고(고정 창이 아니다), 울타리 구멍에 안 새고,
            //       하늘 경계가 통째로 빨려 들어가지도 않는다.
            const obj = new Uint8Array(W * H);
            let nObj = 0, nBlackObj = 0;
            for (let i = 0; i < W * H; i++) if (z[i] < FAR && zBase[i] - z[i] > 0.01) { obj[i] = 1; nObj++; if (mask[i]) nBlackObj++; }
            const wHist = {}; let nW = 0, narrow = 0;
            const LIM = 48;
            for (let y = 2; y < H - 2; y++) {
                for (let x = 2; x < W - 2; x++) {
                    const i = y * W + x;
                    if (!seedSil[i] || !obj[i]) continue;
                    const z0 = z[i];
                    let bd = 0, best = 0;
                    for (const d of NB) { const g = z[i + d] - z0; if (g > best) { best = g; bd = d; } }
                    if (!bd) continue;
                    // 반대 방향(-bd)으로 안쪽을 향해 걸어간다
                    let w = 1, j = i, zp = z0;
                    while (w < LIM) {
                        const k = j - bd;
                        if (k < 0 || k >= W * H || !obj[k]) break;
                        if (Math.abs(z[k] - zp) >= EK * zp) break;   // 깊이가 끊기면 다른 파츠다
                        j = k; zp = z[k]; w++;
                    }
                    wHist[w] = (wHist[w] || 0) + 1; nW++;
                    if (w <= 2 * LINE_R) narrow++;
                }
            }

            const o = { total: n, seed: nSeed, orphan, obj: nObj, blackObj: nBlackObj };
            for (const c of ['sky', 'step', 'crease']) {
                o[c] = stat(strata[c], cnt[c]);
                o[c].cover = cover[c][1] ? cover[c][0] / cover[c][1] : null;
                o[c].coverN = cover[c][1];
            }
            const ws = stat(wHist, nW);
            o.erosion = { n: nW, narrow, rate: nW ? narrow / nW : 0, wMedian: ws.median, wP10: (() => {
                const ks = Object.keys(wHist).map(Number).sort((a, b) => a - b);
                let c = 0; for (const kk of ks) { c += wHist[kk]; if (c >= nW * 0.1) return kk; } return 0;
            })(), blackShare: nObj ? nBlackObj / nObj : 0 };
            return o;
        };

        R.per = {};
        R.per.hero = measure(() => { Scene3D.heroG.visible = true; });
        R.per.mount = measure(() => { Scene3D.mountGroup.visible = true; });
        R.per.pets = measure(() => { (Scene3D.petGroups || []).forEach(g => { g.visible = true; }); });
        R.per.enemy = measure(() => { em.g.visible = true; });
        R.per.all = measure(() => { all.forEach(g => { g.visible = true; }); });
        R.hasCrease = !!u.creaseK;
        return R;
    }, { MIN_N, OV, COVER_MIN, EROSION_MAX, LINE_R });

    console.log(`\n═══ ${label} ═══`);
    console.log('override:', JSON.stringify(out.ov), '  uniforms:', JSON.stringify(out.k));
    console.log('postOn:', out.postOn, ' postEdge:', out.postEdge, ' buffer:', out.buf.w + 'x' + out.buf.h, ' creaseK uniform:', out.hasCrease);
    console.log('--- Ⓐ 부풂: 계열 × 경계종류 두께(=경계로부터의 거리+1, px) ---');
    const rows = [];   // [계열, 종류, stat]
    for (const [g, v] of Object.entries(out.per)) {
        const parts = ['sky', 'step', 'crease'].map(c => `${c}:n=${String(v[c].n).padStart(5)} 중앙=${v[c].median} p90=${v[c].p90} p99=${v[c].p99}`);
        console.log(`  ${g.padEnd(6)} 총${String(v.total).padStart(6)} 미연결${String(v.orphan).padStart(4)} | ${parts.join(' | ')}`);
        for (const c of ['sky', 'step', 'crease']) rows.push([g, c, v[c]]);
    }
    console.log('--- Ⓑ 덮임: 실루엣 seed 중 검게 칠해진 비율 ---');
    for (const [g, v] of Object.entries(out.per)) {
        console.log(`  ${g.padEnd(6)} ` + ['sky', 'step', 'crease'].map(c => `${c}:${v[c].cover === null ? '  --  ' : (v[c].cover * 100).toFixed(1) + '%'}(n=${v[c].coverN})`).join(' | '));
    }
    console.log('--- Ⓒ 침식: 경계에서 잰 파츠 화면폭 w (w ≤ 2R=' + (2 * 2) + 'px 면 양쪽 선이 만나 통째로 먹힌다) ---');
    for (const [g, v] of Object.entries(out.per)) {
        const e = v.erosion;
        console.log(`  ${g.padEnd(6)} w중앙=${String(e.wMedian).padStart(3)}px p10=${String(e.wP10).padStart(2)}px | 먹힌 경계 ${(e.rate * 100).toFixed(1)}% (${e.narrow}/${e.n}) | 몸통 검정비율 ${(e.blackShare * 100).toFixed(1)}%`);
    }

    // 'all' 은 계열끼리 서로 가려 층 분류가 흐려지므로 참고용으로만 찍고 게이트에서는 뺀다.
    const gated = rows.filter(([g]) => g !== 'all');
    const gatedSeries = Object.entries(out.per).filter(([g]) => g !== 'all');
    const thin = gated.filter(([, , v]) => v.n < MIN_N).map(([g, c]) => g + '/' + c);
    const meds = [...new Set(gated.filter(([, , v]) => v.n >= MIN_N).map(([, , v]) => v.median))];
    const spread = gated.filter(([, , v]) => v.n >= MIN_N && v.p99 > v.median + 1).map(([g, c, v]) => g + '/' + c + '(p99=' + v.p99 + ')');
    const orphans = gatedSeries.filter(([, v]) => v.orphan > v.total * 0.02).map(([g, v]) => g + '(' + v.orphan + ')');
    const uncov = gated.filter(([, , v]) => v.cover !== null && v.coverN >= MIN_N && v.cover < COVER_MIN).map(([g, c, v]) => g + '/' + c + '=' + (v.cover * 100).toFixed(0) + '%');
    const eroded = gatedSeries.filter(([, v]) => v.erosion.rate > EROSION_MAX).map(([g, v]) => g + '=' + (v.erosion.rate * 100).toFixed(0) + '%');

    const pass = thin.length === 0 && meds.length === 1 && spread.length === 0 && orphans.length === 0
        && uncov.length === 0 && eroded.length === 0 && errors.length === 0;
    console.log('--- 판정 ---');
    console.log(`  칸별 표본 확보 : ${thin.length === 0 ? 'PASS (전 계열이 세 종류 경계를 다 그린다)' : 'FAIL 비어있음(그 경계에 선이 없다): ' + thin.join(',')}  (기준 n≥${MIN_N})`);
    console.log(`  Ⓐ 칸 간 중앙값 : ${meds.length === 1 ? 'PASS (전부 ' + meds[0] + 'px)' : 'FAIL ' + JSON.stringify(gated.filter(([, , v]) => v.n >= MIN_N).map(([g, c, v]) => g + '/' + c + '=' + v.median))}`);
    console.log(`  Ⓐ 칸 내 퍼짐   : ${spread.length === 0 ? 'PASS (p99 ≤ 중앙+1)' : 'FAIL ' + spread.join(',')}`);
    console.log(`  Ⓐ 미연결 검정  : ${orphans.length === 0 ? 'PASS (검정이 전부 경계에서 이어진다)' : 'FAIL ' + orphans.join(',')}  (기준 총 검정의 2% 미만)`);
    console.log(`  Ⓑ 경계 덮임    : ${uncov.length === 0 ? 'PASS (실루엣 seed ≥' + (COVER_MIN * 100) + '% 칠해짐)' : 'FAIL ' + uncov.join(',')}`);
    console.log(`  Ⓒ 파츠 침식    : ${eroded.length === 0 ? 'PASS (통째로 먹힌 파츠 화소 ≤' + (EROSION_MAX * 100) + '%)' : 'FAIL ' + eroded.join(',')}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no console errors)');
    await page.close();
    return { pass, median: meds.length === 1 ? meds[0] : null };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const d = await runOne(browser, '데스크톱 UA', null);
    const m = await runOne(browser, '모바일 UA', MOBILE_UA);
    await browser.close();
    const cross = d.median !== null && d.median === m.median;
    console.log('\n═══ 종합 ═══');
    console.log('  기기 간 두께 일치 :', cross ? 'PASS (양쪽 ' + d.median + 'px)' : 'FAIL (데스크톱=' + d.median + ', 모바일=' + m.median + ')');
    console.log('  최종 :', d.pass && m.pass && cross ? 'PASS' : 'FAIL');
    process.exit(d.pass && m.pass && cross ? 0 : 1);
})();
