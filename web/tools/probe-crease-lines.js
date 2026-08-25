// 크리스 항이 **실제로 그 두 선을 그리는가** — 임계를 올릴 때 제일 먼저 죽는 두 곳만 콕 집어 잰다.
// (slug: uniform-outline-postfx, 2026-08-25 3D 스트림)
//
// 왜 따로 재나: `probe-outline-strata.js` 는 crease 층의 **화소 수와 두께**만 본다. 임계를 올려
// 꼬리를 자르면 두께는 좋아지는데 **선 자체가 사라져도** 층 표본(n≥120)은 다른 접힘선들이 채워 준다.
// 그래서 TODO 가 이름을 못박은 두 경계를 좌표로 찾아 **열 커버리지**로 잰다:
//   ① 영웅 **턱↔가슴**  — 수리 전 실측 9/45 열(20%)만 선이 있었다(얼굴이 몸통에 흘러 붙었다).
//   ② 탈것 **발굽↔지면** — 수리 전 8/61 열(13%)(발이 바닥에 녹았다).
// 두 경계는 깊이 계단이 작아 실루엣 항이 통째로 놓치는 자리라, 여기 커버리지가 곧 크리스 항의 존재 증명이다.
//
// 사용: node probe-crease-lines.js          (종료코드 0=통과, 기준 커버리지 ≥60%)
//       CREASE_K=0.010 node probe-crease-lines.js   ← 임계를 갈아 끼워 비교
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 통과선. 두 선의 기준이 다른 이유: **턱선은 곡률 항이 단독으로 그리는** 선이라 임계에 직결되고
// (K=0.010 87% → K=0.015 26%), **접지선은 실루엣·법선 항이 대부분 그린다** — 임계를 4종으로 쓸어도
// 69~71% 로 꿈쩍 않는다(실측). 그래서 접지선 기준은 낮게 두되, 수리 전 실측(13%)보다 한참 위로 잡는다.
const MIN_JAW = 0.60, MIN_HOOF = 0.45;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const KS = (process.env.CREASE_K ? [+process.env.CREASE_K] : [0.010, 0.015, 0.020, 0.030]);
    const out = await page.evaluate(({ KS }) => {
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (t) => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        S.mounts = { 'Brown Horse': { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Brown Horse'; Scene3D.refreshMount();
        S.pets = []; S.activePets = []; Scene3D.refreshPets();
        Scene3D.clearEnemies();
        Scene3D._clock = 0;      // 위상 고정 (판정기와 같은 프레임)
        step(0.9);

        const gl = Scene3D.renderer.domElement;
        const W = gl.width, H = gl.height;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const u = Scene3D._compMat.uniforms;
        const grab = () => { Scene3D.renderFrame(); ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0); return ctx.getImageData(0, 0, W, H).data; };
        const OFFV = { edgeK: 1e9, creaseK: 1e9, normalK: 9.0 };
        const saved = {}; for (const k in OFFV) if (u[k]) saved[k] = u[k].value;

        // ── 대상 경계의 화면 좌표를 **씬에서 직접 뽑는다**(상수로 박으면 조형이 바뀔 때 조용히 거짓말한다) ──
        const sx = W / Scene3D.renderer.domElement.clientWidth || 1;
        const proj = (v) => { const p = v.clone().project(Scene3D.camera); return { x: (p.x * 0.5 + 0.5) * W, y: (1 - (p.y * 0.5 + 0.5)) * H }; };
        const bboxOf = (o) => { const b = new THREE.Box3(); b.setFromObject(o); return b; };

        const head = Scene3D.heroRig && Scene3D.heroRig.bones && Scene3D.heroRig.bones.head;
        const hb = head ? bboxOf(head) : null;
        // ① 턱↔가슴: 머리 bbox 의 **아랫면 앞모서리**(카메라 쪽 z=max)를 좌→우로 훑는다.
        const jaw = [];
        if (hb) {
            for (let t = 0.12; t <= 0.88; t += 0.02) {
                const x = hb.min.x + (hb.max.x - hb.min.x) * t;
                jaw.push(proj(new THREE.Vector3(x, hb.min.y, hb.max.z)));
            }
        }
        // ② 발굽↔지면: **좌표를 투영하지 않는다.** bbox 아랫면-앞모서리를 쏘면 코끝 z 가 잡혀
        //    발굽에서 수십 px 어긋난다(첫 판에서 전 임계 0/60 이 나와 '선이 없다'고 오판할 뻔했다).
        //    대신 탈것을 켠 프레임과 끈 프레임의 **색 차분으로 탈것 화소를 직접 찾아**, 열마다
        //    **가장 아래 탈것 화소**를 접지점으로 삼는다 — 정의상 그게 발굽↔지면 경계다.
        //    (다리 사이 빈 열은 탈것 화소가 없으므로 표본에서 저절로 빠진다.)
        const mg = Scene3D.mountGroup;
        const hoofCols = (() => {
            const prevH = Scene3D.heroG.visible, prevM = mg ? mg.visible : false;
            Scene3D.heroG.visible = false; if (mg) mg.visible = true;
            const withM = grab();
            if (mg) mg.visible = false;
            const noM = grab();
            Scene3D.heroG.visible = prevH; if (mg) mg.visible = prevM;
            const cols = [];
            for (let x = 1; x < W - 1; x++) {
                let bottom = -1;
                for (let y = H - 1; y >= 0; y--) {
                    const p = (y * W + x) * 4;
                    if (Math.abs(withM[p] - noM[p]) > 10 || Math.abs(withM[p + 1] - noM[p + 1]) > 10 || Math.abs(withM[p + 2] - noM[p + 2]) > 10) { bottom = y; break; }
                }
                if (bottom > 0) cols.push({ x, y: bottom });
            }
            return cols;
        })();
        // 접지선은 다리 4개에만 있다 — 탈것 화소가 있는 열을 균등 표집한다.
        const hoof = [];
        { const stride = Math.max(1, Math.floor(hoofCols.length / 70)); for (let i = 0; i < hoofCols.length; i += stride) hoof.push(hoofCols[i]); }

        const cover = (mask, pts, win) => {
            let hit = 0, seen = 0;
            for (const p of pts) {
                const cx = Math.round(p.x); if (cx < 1 || cx >= W - 1) continue;
                seen++;
                let ok = false;
                for (let dy = -win; dy <= win && !ok; dy++) {
                    const y = Math.round(p.y) + dy; if (y < 0 || y >= H) continue;
                    for (let dx = -1; dx <= 1 && !ok; dx++) if (mask[y * W + cx + dx]) ok = true;
                }
                if (ok) hit++;
            }
            return { hit, seen, cov: seen ? hit / seen : 0 };
        };

        const rows = [];
        for (const K of KS) {
            // 영웅만 → 턱선 / 탈것만 → 접지선 (서로 가리지 않게 격리)
            const meas = (showHero) => {
                Scene3D.heroG.visible = showHero; if (mg) mg.visible = !showHero;
                for (const k in OFFV) if (u[k]) u[k].value = saved[k];
                if (u.creaseK) u.creaseK.value = K;
                const on = grab();
                for (const k in OFFV) if (u[k]) u[k].value = OFFV[k];
                const off = grab();
                for (const k in OFFV) if (u[k]) u[k].value = saved[k];
                const m = new Uint8Array(W * H);
                for (let i = 0, p = 0; i < W * H; i++, p += 4) if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) m[i] = 1;
                return m;
            };
            const mH = meas(true), mM = meas(false);
            Scene3D.heroG.visible = true; if (mg) mg.visible = true;
            rows.push({ K, jaw: cover(mH, jaw, 6), hoof: cover(mM, hoof, 6) });
        }
        return { rows, jawN: jaw.length, hoofN: hoof.length, hasHead: !!hb, shipK: saved.creaseK };
    }, { KS });

    console.log('턱선 표본열', out.jawN, '· 접지선 표본열', out.hoofN, '· head 본 찾음:', out.hasHead);
    console.log('creaseK | 영웅 턱↔가슴 열커버 | 탈것 발굽↔지면 열커버');
    // 🚨 판정은 **지금 셰이더에 박혀 있는 creaseK**(= 사용자가 실제로 보는 값)로만 한다.
    //    나머지 행은 '임계를 올리면 무엇이 죽는가'를 보여 주는 **참고 스윕**이다 — 그걸 같이
    //    판정하면 스윕을 넓힐 때마다 게이트가 빨개진다.
    const ship = out.shipK;
    let bad = [];
    for (const r of out.rows) {
        const f = (c) => `${c.hit}/${c.seen} (${(c.cov * 100).toFixed(0)}%)`;
        const isShip = Math.abs(r.K - ship) < 1e-9;
        console.log(String(r.K).padEnd(7), '|', f(r.jaw).padEnd(19), '|', f(r.hoof), isShip ? '  ← 배포값(판정 대상)' : '');
        if (!isShip) continue;
        if (r.jaw.cov < MIN_JAW) bad.push(`턱선 ${(r.jaw.cov * 100).toFixed(0)}% < ${MIN_JAW * 100}%`);
        if (r.hoof.cov < MIN_HOOF) bad.push(`접지선 ${(r.hoof.cov * 100).toFixed(0)}% < ${MIN_HOOF * 100}%`);
    }
    if (!out.rows.some(r => Math.abs(r.K - ship) < 1e-9)) bad.push('스윕에 배포값(' + ship + ')이 없다 — KS 에 넣을 것');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no console errors)');
    const pass = bad.length === 0 && errors.length === 0;
    console.log('판정 :', pass ? `PASS (배포값 creaseK=${ship} 에서 턱선·접지선 모두 살아 있다)` : 'FAIL ' + bad.join(' · '));
    await browser.close();
    process.exit(pass ? 0 : 1);
})();
