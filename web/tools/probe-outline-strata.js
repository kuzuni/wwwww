// 검정 아웃라인 두께 — **경계 종류별 층화** 게이트 (slug: uniform-outline-postfx, 2026-08-25).
//
// 🚨 왜 짝 판정기(`probe-outline-uniform.js`)로 부족한가:
//    그쪽은 **엣지 화소 전체의 두께 분포**만 본다. 그런데 두께는 '경계 종류'를 따라 갈린다 —
//    하늘과 맞닿은 실루엣은 1px, 물체끼리 겹친 곳은 2px 이었는데도(2배 차!) 하늘 경계가 전체의
//    5% 뿐이라 **중앙값이 안 움직여** 통과해 버렸다. 평균이 결함을 덮은 것이다.
//    → 여기서는 화소를 **깊이로 층화**해서 종류별 중앙값이 **같을 때만** PASS 로 둔다.
//
// 층(strata) — 아웃라인 화소마다 반경 2 이웃의 선형깊이를 보고 분류한다:
//   ① sky    : 이웃 중 배경(깊이≈far)이 있다 → 하늘과 맞닿은 실루엣
//   ② step   : 이웃과의 깊이 계단이 크다(≥ STEP_Z) → 물체끼리 겹친 경계
//   ③ crease : 깊이 계단이 작다(< STEP_Z) → 턱↔가슴·발굽↔지면 같은 **법선 불연속** 경계.
//              깊이 4-이웃만 보던 종전 셰이더는 이 층을 **아예 못 그렸다**(그래서 n≈0 이면 FAIL).
//
// 깊이는 추측하지 않는다 — 컴포짓과 같은 `_rtScene.depthTexture` 를 16bit 로 패킹해 캔버스로 뽑아
// 화소마다 실제 뷰공간 깊이를 읽는다(색으로 어림잡으면 검은 칸 색에 오염된다).
//
// 사용: node probe-outline-strata.js   (종료코드 0=통과)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const MIN_N = 120;      // 층마다 이 정도는 있어야 '그 종류 경계에 선이 있다'고 말할 수 있다

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
    const out = await page.evaluate(({ MIN_N, OV }) => {
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
        // 화소를 지나는 런 길이 — 방향 (dx,dy) 로 훑는다.
        // 🚨 **가로·세로 둘만 보면 자가 거짓말을 한다** (2026-08-25 3D 스트림 실측, 두께 지도로 확정):
        //    ⓐ 두 선이 각을 이루는 **볼록 코너**는 가로 런도 세로 런도 길어져 `min(h,v)` 이 3~4px 로
        //       찍히는데 선 자체는 2px 다. ⓑ 반대로 4방향 **최솟값**을 쓰면 비스듬한 선의 **계단 화소**
        //       에서 한 대각 방향만 런이 1 이라 1px 로 깎인다. 둘 다 지도(`diag-outline-thick.js`)에서
        //       색이 **코너와 계단에만** 앉는 걸로 확인했다 — 직선 구간은 전부 2px 이었다.
        //    → 그래서 **네 방향 런 중 '두 번째로 작은 값'** 을 쓴다. 가장 극단인 한 방향만 버리면
        //      코너 부풀림과 계단 깎임이 **동시에** 잡힌다.
        const runs = (mask, dx, dy) => {
            const r = new Uint16Array(W * H), line = [];
            const walk = (sx, sy) => {
                line.length = 0;
                let x = sx, y = sy;
                while (x >= 0 && x < W && y >= 0 && y < H) { line.push(y * W + x); x += dx; y += dy; }
                let b = 0;
                while (b < line.length) {
                    if (!mask[line[b]]) { b++; continue; }
                    const s = b; while (b < line.length && mask[line[b]]) b++;
                    for (let i = s; i < b; i++) r[line[i]] = b - s;
                }
            };
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const px = x - dx, py = y - dy;
                if (px >= 0 && px < W && py >= 0 && py < H) continue;
                walk(x, y);
            }
            return r;
        };

        const FAR = Scene3D.camera.far * 0.9;   // 이 위면 배경(하늘)
        const STEP_Z = 0.30;                    // 이보다 큰 깊이 계단 = '물체끼리 겹침'
        const stat = (hist, m) => {
            const ks = Object.keys(hist).map(Number).sort((a, b) => a - b);
            const pct = (q) => { let c = 0; for (const kk of ks) { c += hist[kk]; if (c >= m * q) return kk; } return ks[ks.length - 1] || 0; };
            return { n: m, median: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: ks[ks.length - 1] || 0, hist: ks.slice(0, 5).map(kk => [kk, hist[kk]]) };
        };

        // ── 계열 하나를 띄우고 그 프레임에서 경계 종류별 두께를 낸다 ──
        //    계열 격리가 필요한 이유: 다 켜 놓으면 펫이 탈것을 가려 '펫의 하늘 경계'가 '겹침 경계'로
        //    둔갑한다 — 계열별 요구("펫도 탈것 무기 전부 다 아웃라인 크기 같아야함")를 못 재게 된다.
        const all = [Scene3D.heroG, Scene3D.mountGroup, ...(Scene3D.petGroups || []), em.g].filter(Boolean);
        const measure = (showFn) => {
            const prev = all.map(g => g.visible);
            all.forEach(g => { g.visible = false; });
            showFn();
            const saved = edgeOff(u, false);       // 엣지 켠 채로 저장만
            const on = grab();                     // 엣지 켠 프레임
            edgeOff(u, true);                      // 세 항 전부 임계 무한 = 엣지 0
            const off = grab();
            edgeOff(u, false, saved);              // 복구
            const zmap = grabDepth();
            all.forEach((g, i) => { g.visible = prev[i]; });

            const mask = new Uint8Array(W * H);
            let n = 0;
            for (let i = 0, p = 0; i < W * H; i++, p += 4) {
                if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) { mask[i] = 1; n++; }
            }
            const rH = runs(mask, 1, 0), rV = runs(mask, 0, 1), rA = runs(mask, 1, 1), rB = runs(mask, 1, -1);
            // ── 층화: 반경 2 이웃 깊이로 분류 ──
            const strata = { sky: {}, step: {}, crease: {} };
            const cnt = { sky: 0, step: 0, crease: 0 };
            for (let y = 2; y < H - 2; y++) {
                for (let x = 2; x < W - 2; x++) {
                    const i = y * W + x;
                    if (!mask[i]) continue;
                    const z0 = zmap[i];
                    let sky = false, mx = 0;
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            if (dx * dx + dy * dy > 4 || (!dx && !dy)) continue;
                            const zn = zmap[i + dy * W + dx];
                            if (zn > FAR) sky = true;
                            const d = Math.abs(zn - z0); if (d > mx) mx = d;
                        }
                    }
                    const cls = sky ? 'sky' : (mx >= STEP_Z ? 'step' : 'crease');
                    const t = [rH[i], rV[i], rA[i], rB[i]].sort((a, b) => a - b)[1];
                    strata[cls][t] = (strata[cls][t] || 0) + 1; cnt[cls]++;
                }
            }
            const o = { total: n };
            for (const c of ['sky', 'step', 'crease']) o[c] = stat(strata[c], cnt[c]);
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
    }, { MIN_N, OV });

    console.log(`\n═══ ${label} ═══`);
    console.log('override:', JSON.stringify(out.ov), '\npostOn:', out.postOn, ' postEdge:', out.postEdge, ' buffer:', out.buf.w + 'x' + out.buf.h, ' creaseK uniform:', out.hasCrease);
    console.log('--- 계열 × 경계종류 아웃라인 두께 (px) ---');
    const rows = [];   // [계열, 종류, stat]
    for (const [g, v] of Object.entries(out.per)) {
        const parts = ['sky', 'step', 'crease'].map(c => `${c}:n=${String(v[c].n).padStart(5)} 중앙=${v[c].median} p90=${v[c].p90}`);
        console.log(`  ${g.padEnd(6)} 총${String(v.total).padStart(6)} | ${parts.join(' | ')}`);
        for (const c of ['sky', 'step', 'crease']) rows.push([g, c, v[c]]);
    }
    // 'all' 은 계열끼리 서로 가려 층 분류가 흐려지므로 참고용으로만 찍고 게이트에서는 뺀다.
    const gated = rows.filter(([g]) => g !== 'all');
    const thin = gated.filter(([, , v]) => v.n < MIN_N).map(([g, c]) => g + '/' + c);
    const meds = [...new Set(gated.filter(([, , v]) => v.n >= MIN_N).map(([, , v]) => v.median))];
    const spread = gated.filter(([, , v]) => v.n >= MIN_N && v.p90 > v.median + 1).map(([g, c]) => g + '/' + c);
    const pass = thin.length === 0 && meds.length === 1 && spread.length === 0 && errors.length === 0;
    console.log('--- 판정 ---');
    console.log(`  칸별 표본 확보 : ${thin.length === 0 ? 'PASS (전 계열이 세 종류 경계를 다 그린다)' : 'FAIL 비어있음(그 경계에 선이 없다): ' + thin.join(',')}  (기준 n≥${MIN_N})`);
    console.log(`  칸 간 중앙값   : ${meds.length === 1 ? 'PASS (전부 ' + meds[0] + 'px)' : 'FAIL ' + JSON.stringify(gated.filter(([, , v]) => v.n >= MIN_N).map(([g, c, v]) => g + '/' + c + '=' + v.median))}`);
    console.log(`  칸 내 퍼짐     : ${spread.length === 0 ? 'PASS (p90 ≤ 중앙+1)' : 'FAIL ' + spread.join(',')}`);
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
