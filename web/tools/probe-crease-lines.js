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
const { SEED_INIT } = require('./lib-seed');   // 씬 전체 재현성 — page.goto 보다 먼저 주입해야 한다
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 통과선. 두 선의 기준이 다른 이유: **턱선은 곡률 항이 단독으로 그리는** 선이라 임계에 직결되고
// (K=0.010 87% → K=0.015 26%), **접지선은 실루엣·법선 항이 대부분 그린다** — 임계를 4종으로 쓸어도
// 69~71% 로 꿈쩍 않는다(실측). 그래서 접지선 기준은 낮게 두되, 수리 전 실측(13%)보다 한참 위로 잡는다.
const MIN_JAW = 0.60, MIN_HOOF = 0.45;
// ③ 머리 앞면↔옆면 90° 접힘. 이 자리는 **깊이 계단이 없는 순수 접힘**이라 `normalK`(84°)가
//    잡아야만 선이 생긴다 — 즉 크리스 항의 존재 증명으로 앞의 둘보다 직접적이다. 표본 위치를
//    그림에서 찾으므로(음영 계단) 표본이 있는 행은 **정의상 접힘이 있는 행**이고, 따라서 기준을
//    높게 둔다. 실측 배포값에서 **엄격±2 로 12/12(100%)** 다.
const MIN_FACE = 0.80;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    // 🚨 **DPR 대역을 갈아 끼울 수 있어야 한다** (2026-08-25 3D 스트림에서 신설).
    //    선 두께는 드로잉버퍼 화소 기준이고, `_compMat` 의 `dilate` 는 **DPR 1 에서 팽창을 끈다**.
    //    즉 DPR 1 은 선이 1 버퍼px 로 얇아지는 **다른 코드 경로**다 — 여기서 선이 죽는지는
    //    dsf 2 만 재서는 알 수 없다. `DSF=1 node probe-crease-lines.js` 로 그 대역을 직접 잰다.
    const DSF = +(process.env.DSF || 2);
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: DSF });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.addInitScript(SEED_INIT);
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const KS = (process.env.CREASE_K ? [+process.env.CREASE_K] : [0.010, 0.015, 0.020, 0.030]);
    const out = await page.evaluate(({ KS }) => {
        let R_DBG = null;
        window.__reseed && window.__reseed();   // 난수 스트림 되감기 — lib-seed.js 참조
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (t) => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        S.mounts = { 'Brown Horse': { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Brown Horse'; Scene3D.refreshMount();
        S.pets = []; S.activePets = []; Scene3D.refreshPets();
        Scene3D.clearEnemies();
        // 🚨 **위상 고정은 `_clock` 만으로는 안 된다 — `worldX` 까지 못박아야 한다** (2026-08-25 3D 스트림).
        //    로드 뒤 대기 1500ms 동안 진짜 `update` 가 rAF 로 돌면서 `worldX += 1.7*dt` 를 쌓는데,
        //    프레임 수가 매번 달라 **탈것이 서는 x 가 런마다 다르다**. 지형 높이는 x 의 함수라
        //    (`heightAt`) 발굽↔지면 접점이 통째로 옮겨 가고, 표본 열 수까지 달라진다.
        //    실측: **같은 셰이더·같은 커밋에서 접지선 열커버가 22% ↔ 72%** 로 튀었다(연속 2회).
        //    이 자는 특정 경계 한 줄을 재므로 분포 자와 달리 이 흔들림을 평균으로 못 덮는다.
        //    ⚠️ 이 자로 잰 과거 수치(67~72%)와 오늘의 22% 는 **셰이더 차이가 아니라 위상 차이**다.
        // 위상 고정 ②: **측정 대상 그룹의 개체 위상**을 0 으로 눌러 시드 스트림 위치에 안 흔들리게 한다.
        //    (`lib-seed.js` 의 시드만으로는 부족하다 — 대기 중 공격 한 번이 더 돌면 `Math.random`
        //     호출 수가 달라져 **그 뒤에 만들어진** 탈것·펫의 `userData.phase` 가 통째로 밀린다.
        //     실측: 4회 중 1회에서 mountY 0.0301 → 0.0499 로 튀었다. 여기 phase 는 '개체별 위상차'
        //     용도뿐이라 0 으로 눌러도 조형이 안 바뀐다 — 이펙트 링의 의도적 위상차와는 다른 자리다.)
        {
            const pin = (g) => { if (g && g.userData) g.userData.phase = 0; };
            pin(Scene3D.mountGroup);
            (Scene3D.petGroups || []).forEach(pin);
            if (Scene3D.enemyMap) Scene3D.enemyMap.forEach(v => pin(v && v.g));
        }
        Scene3D._clock = 0;      // 위상 고정 (판정기와 같은 프레임)
        Scene3D.worldX = 0;
        if (Scene3D.heroRig) Scene3D.heroRig._t = 0;
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

        // ③ 영웅 **머리 앞면↔옆면 90° 세로 모서리** — 비평가(2026-08-25)가 "선이 한 화소도 없다"고
        //    짚은 자리다. 여기는 깊이 계단이 아니라 **순수 90° 접힘**이라 `normalK`(0.9 ≈ 84°)가 반드시
        //    잡아야 하는 곳이고, 안 잡히면 두께 문제가 아니라 **크리스 항의 구멍**이다.
        //    🚨 **좌표를 투영해서 찾지 않는다** — 접지선에서 이미 밟은 함정이다(bbox 모서리를 쏘면
        //       머리에 붙은 다른 파츠가 bbox 를 키워 수 px 어긋난다. 실측: 투영점 기준 ±6 창에서 86%
        //       인데 ±2 로 조이면 6% 로 떨어졌다 = 선은 근처에 있지만 **그 점 위에는 없다**).
        //    → 접지선과 같은 방식으로 **그림에서 직접 찾는다**: 아웃라인을 끈 프레임에서 머리 행마다
        //      가로로 훑어 **밝기 계단이 가장 큰 x**(= 앞면↔옆면 경계)를 잡는다. 두 면은 같은 색인데
        //      법선이 90° 달라 음영만 갈리므로, 그 계단이 곧 접힘의 화면 위치다.
        const faceEdge = (() => {
            if (!hb) return [];
            const prevM = mg ? mg.visible : false; if (mg) mg.visible = false;
            for (const k in OFFV) if (u[k]) u[k].value = OFFV[k];     // 아웃라인 끈 프레임
            const off2 = grab();
            for (const k in OFFV) if (u[k]) u[k].value = saved[k];
            if (mg) mg.visible = prevM;
            const top = proj(new THREE.Vector3(hb.min.x, hb.max.y, hb.max.z));
            const bot = proj(new THREE.Vector3(hb.min.x, hb.min.y, hb.max.z));
            const y0 = Math.round(Math.min(top.y, bot.y)), y1 = Math.round(Math.max(top.y, bot.y));
            const cx = Math.round((top.x + bot.x) / 2);
            const pts = [];
            for (let y = y0 + Math.round((y1 - y0) * 0.15); y <= y0 + Math.round((y1 - y0) * 0.85); y += 2) {
                if (y < 1 || y >= H - 1) continue;
                let bx = -1, bd = 0;
                for (let x = Math.max(1, cx - 14); x <= Math.min(W - 2, cx + 14); x++) {
                    const a = (y * W + x - 1) * 4, b = (y * W + x + 1) * 4;
                    // 아웃라인이 꺼진 프레임이라 순검정은 없다 — 순수 음영 계단만 남는다
                    const d = Math.abs(off2[a] - off2[b]) + Math.abs(off2[a + 1] - off2[b + 1]) + Math.abs(off2[a + 2] - off2[b + 2]);
                    if (d > bd) { bd = d; bx = x; }
                }
                if (bx > 0 && bd >= 12) pts.push({ x: bx, y });     // 계단이 너무 약하면 접힘이 아니다
            }
            return pts;
        })();
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

        // 세로선은 **가로로** 훑어야 한다 — `cover` 는 가로선용(세로 ±win)이라 그대로 쓰면 거짓 통과한다.
        const coverV = (mask, pts, win) => {
            let hit = 0, seen = 0;
            for (const p of pts) {
                const cy = Math.round(p.y); if (cy < 1 || cy >= H - 1) continue;
                seen++;
                let ok = false;
                for (let dx = -win; dx <= win && !ok; dx++) {
                    const x = Math.round(p.x) + dx; if (x < 0 || x >= W) continue;
                    for (let dy = -1; dy <= 1 && !ok; dy++) if (mask[(cy + dy) * W + x]) ok = true;
                }
                if (ok) hit++;
            }
            return { hit, seen, cov: seen ? hit / seen : 0 };
        };

        // 🔬 **재현성 지문** — 이 줄이 런마다 같아야 아래 커버리지 숫자를 믿을 수 있다.
        //    다르면 셰이더를 의심하기 전에 **위상부터** 의심할 것(lib-seed.js 의 경위 참조).
        R_DBG = { worldX: Scene3D.worldX, clock: +Scene3D._clock.toFixed(6),
                  mountY: mg ? +mg.position.y.toFixed(4) : null,
                  heroY: +Scene3D.heroG.position.y.toFixed(4), nCols: hoofCols.length,
                  hoofYmid: hoof.length ? hoof[hoof.length >> 1].y : -1 };
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
            rows.push({ K, jaw: cover(mH, jaw, 6), hoof: cover(mM, hoof, 6), face: coverV(mH, faceEdge, 6), face2: coverV(mH, faceEdge, 2) });
        }
        return { dbg: R_DBG, rows, jawN: jaw.length, hoofN: hoof.length, faceN: faceEdge.length, hasHead: !!hb, shipK: saved.creaseK };
    }, { KS });

    console.log('대역: DPR', DSF, DSF >= 2 ? '(팽창 on · 선 2 버퍼px)' : '(팽창 off · 선 1 버퍼px)');
    console.log('재현성 지문:', JSON.stringify(out.dbg));
    console.log('턱선 표본열', out.jawN, '· 접지선 표본열', out.hoofN, '· 머리 모서리 표본행', out.faceN, '· head 본 찾음:', out.hasHead);
    console.log('creaseK | 영웅 턱↔가슴 열커버 | 탈것 발굽↔지면 열커버 | 영웅 머리 앞면↔옆면 행커버');
    // 🚨 판정은 **지금 셰이더에 박혀 있는 creaseK**(= 사용자가 실제로 보는 값)로만 한다.
    //    나머지 행은 '임계를 올리면 무엇이 죽는가'를 보여 주는 **참고 스윕**이다 — 그걸 같이
    //    판정하면 스윕을 넓힐 때마다 게이트가 빨개진다.
    const ship = out.shipK;
    let bad = [];
    for (const r of out.rows) {
        const f = (c) => `${c.hit}/${c.seen} (${(c.cov * 100).toFixed(0)}%)`;
        const isShip = Math.abs(r.K - ship) < 1e-9;
        console.log(String(r.K).padEnd(7), '|', f(r.jaw).padEnd(19), '|', f(r.hoof).padEnd(19), '|', (f(r.face) + ' / 엄격±2 ' + f(r.face2)), isShip ? '  ← 배포값(판정 대상)' : '');
        if (!isShip) continue;
        if (r.jaw.cov < MIN_JAW) bad.push(`턱선 ${(r.jaw.cov * 100).toFixed(0)}% < ${MIN_JAW * 100}%`);
        if (r.face.seen >= 6 && r.face2.cov < MIN_FACE) bad.push(`머리 앞면↔옆면 ${(r.face2.cov * 100).toFixed(0)}% < ${MIN_FACE * 100}% (엄격±2)`);
        if (r.hoof.cov < MIN_HOOF) bad.push(`접지선 ${(r.hoof.cov * 100).toFixed(0)}% < ${MIN_HOOF * 100}%`);
    }
    if (!out.rows.some(r => Math.abs(r.K - ship) < 1e-9)) bad.push('스윕에 배포값(' + ship + ')이 없다 — KS 에 넣을 것');
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no console errors)');
    const pass = bad.length === 0 && errors.length === 0;
    console.log('판정 :', pass ? `PASS (배포값 creaseK=${ship} 에서 턱선·접지선·머리 모서리 전부 살아 있다)` : 'FAIL ' + bad.join(' · '));
    await browser.close();
    process.exit(pass ? 0 : 1);
})();
