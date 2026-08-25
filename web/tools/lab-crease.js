// 크리스 항 후보 규칙 **비교 실험대** (slug: uniform-outline-postfx, 2026-08-25 3D 스트림).
//
// 왜 따로 두나: 규칙 하나 고칠 때마다 `scene3d.js` 를 고쳐 `probe-outline-strata.js` 를 통째로 돌리면
// 한 판에 몇 분이고, '어느 판에서 잰 수치인지'가 흐려진다. 여기서는 **브라우저 한 판**에서
// `_compMat.fragmentShader` 를 문자열 치환으로 갈아 끼워(재컴파일) 후보 여러 개를 **같은 프레임·
// 같은 씬**에서 잰다. 통과 후보만 `scene3d.js` 에 옮겨 심고 진짜 판정기로 확인한다.
//
// 재는 것: `hero`(넓은 파츠 = 기준선, 2px 이어야 한다) 와 `pets`(좁은 파츠 = 결함) 의 경계종류별 두께.
// 후보가 **펫 crease 를 2px 로 내리면서 영웅 crease 를 2px 로 유지**해야 답이다
// (펫만 보고 고르면 '크리스를 통째로 끄는' 후보가 1등이 된다 — 영웅 턱↔가슴 선이 다시 사라진다).
//
// 사용: node lab-crease.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 후보 = `float edge = max(sil, crs)` 직전에 끼워 넣을 GLSL 한 토막(crs 를 덮어쓴다).
// 스코프에 살아 있는 것: n0/nL/nR/nU/nD(복원 법선), dmin, qc·qL..q2U, z0·zl..z2u, nearv, sil,
//                       e0/eL/eR/eU/eD(반경1 실루엣 검출), cx·cy(곡률), edgeK/creaseK/normalK.
const CANDS = [
    ['base(현행=띠폭억제)', ''],
    // 남은 꼬리는 이제 **크리스가 실루엣선에 맞닿는 자리**다(해부: 두께≥3 화소 44개 중 39개가 mixed).
    // 실루엣은 이미 2px 인데 그 옆에 크리스가 붙으면 합이 3~4px 이 된다 → 붙지 못하게 막는다.
    ['+실루엣 비접촉(반경1)', 'crs *= 1.0 - max(max(e0, eL), max(max(eR, eU), eD));'],
    ['+실루엣 비접촉(이웃만)', 'crs *= 1.0 - max(max(eL, eR), max(eU, eD));'],
    ['+실루엣 비접촉(sil 자체)', 'crs *= 1.0 - sil;'],
    // 실루엣 검출을 대각까지 넓혀 본 판
    ['+실루엣 비접촉(반경1)+법선도',
        'float sn2 = max(max(e0, eL), max(max(eR, eU), eD));\n' +
        'crs = max(w0 * (1.0 - sn2), step(normalK, 1.0 - dmin) * (1.0 - wN) * (1.0 - sn2)) * (1.0 - step(edgeK * z0, nearv));'],
];

const SCENE = () => {
    Combat.tick = () => { };
    const real = Scene3D.update.bind(Scene3D);
    Scene3D.update = () => { };
    const step = (t) => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
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
    // 🚨 애니 위상 고정 — `update()` 의 누적 시계(`_clock`)를 0 으로 물리고 나서 밟아야
    //    판마다 같은 프레임이 나온다(안 하면 로드 대기 1.5초 동안 흐른 만큼 위상이 달라져
    //    같은 후보가 판마다 p90 3~6 으로 튄다 — 실측).
    Scene3D._clock = 0;
    step(0.9);
    return em;
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const out = await page.evaluate(({ CANDS, SRC }) => {
        const em = new Function('return (' + SRC + ')')()();
        const gl = Scene3D.renderer.domElement;
        const W = gl.width, H = gl.height;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const u = Scene3D._compMat.uniforms;
        const ORIG = Scene3D._compMat.fragmentShader;
        const ANCHOR = '  float edge = max(sil, crs)';
        if (ORIG.indexOf(ANCHOR) < 0) return { fatal: 'anchor not found' };

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
        const grab = () => { Scene3D.renderFrame(); ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0); return ctx.getImageData(0, 0, W, H).data; };
        const grabDepth = () => {
            Scene3D.renderFrame();
            const r = Scene3D.renderer, pm = Scene3D._fsQuad.material;
            depthMat.uniforms.tDepth.value = Scene3D._rtScene.depthTexture;
            depthMat.uniforms.camNear.value = Scene3D.camera.near;
            depthMat.uniforms.camFar.value = Scene3D.camera.far;
            Scene3D._fsQuad.material = depthMat;
            r.setRenderTarget(null); r.render(Scene3D._fsScene, Scene3D._fsCam);
            Scene3D._fsQuad.material = pm;
            ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0);
            const px = ctx.getImageData(0, 0, W, H).data, far = Scene3D.camera.far;
            const z = new Float32Array(W * H);
            for (let i = 0, p = 0; i < W * H; i++, p += 4) z[i] = (px[p] + px[p + 1] / 255) / 255 * far;
            return z;
        };
        const OFFV = { edgeK: 1e9, creaseK: 1e9, normalK: 9.0 };
        const saved = {}; for (const k in OFFV) if (u[k]) saved[k] = u[k].value;
        const setK = (o) => { for (const k in OFFV) if (u[k]) u[k].value = (k in o) ? o[k] : saved[k]; };
        const runs = (mask, horiz) => {
            const r = new Uint16Array(W * H);
            const A = horiz ? H : W, L = horiz ? W : H;
            const idx = (a, b) => horiz ? a * W + b : b * W + a;
            for (let a = 0; a < A; a++) { let b = 0; while (b < L) { if (!mask[idx(a, b)]) { b++; continue; } const s = b; while (b < L && mask[idx(a, b)]) b++; for (let i = s; i < b; i++) r[idx(a, i)] = b - s; } }
            return r;
        };
        const stat = (hist, m) => { const ks = Object.keys(hist).map(Number).sort((a, b) => a - b); const pct = q => { let c = 0; for (const k of ks) { c += hist[k]; if (c >= m * q) return k; } return ks[ks.length - 1] || 0; }; return { n: m, med: pct(0.5), p90: pct(0.9) }; };

        const all = [Scene3D.heroG, Scene3D.mountGroup, ...(Scene3D.petGroups || []), em.g].filter(Boolean);
        const measure = (showFn) => {
            const prev = all.map(g => g.visible);
            all.forEach(g => { g.visible = false; }); showFn();
            setK({}); const on = grab();
            setK(OFFV); const off = grab();
            setK({});
            const zmap = grabDepth();
            all.forEach((g, i) => { g.visible = prev[i]; });
            const mask = new Uint8Array(W * H);
            for (let i = 0, p = 0; i < W * H; i++, p += 4) if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) mask[i] = 1;
            const hr = runs(mask, true), vr = runs(mask, false);
            const FAR = Scene3D.camera.far * 0.9, STEP_Z = 0.30;
            const st = { sky: {}, step: {}, crease: {} }, cnt = { sky: 0, step: 0, crease: 0 };
            for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
                const i = y * W + x; if (!mask[i]) continue;
                const z0 = zmap[i]; let sky = false, mx = 0;
                for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                    if (dx * dx + dy * dy > 4 || (!dx && !dy)) continue;
                    const zn = zmap[i + dy * W + dx]; if (zn > FAR) sky = true;
                    const d = Math.abs(zn - z0); if (d > mx) mx = d;
                }
                const c = sky ? 'sky' : (mx >= STEP_Z ? 'step' : 'crease');
                const t = Math.min(hr[i], vr[i]); st[c][t] = (st[c][t] || 0) + 1; cnt[c]++;
            }
            const o = {}; for (const c of ['sky', 'step', 'crease']) o[c] = stat(st[c], cnt[c]);
            return o;
        };

        const rows = [];
        for (const [name, snip] of CANDS) {
            Scene3D._compMat.fragmentShader = snip ? ORIG.replace(ANCHOR, '  ' + snip.split('\n').join('\n  ') + '\n' + ANCHOR) : ORIG;
            Scene3D._compMat.needsUpdate = true;
            Scene3D.renderFrame();   // 컴파일 강제
            rows.push({ name, hero: measure(() => { Scene3D.heroG.visible = true; }), pets: measure(() => { (Scene3D.petGroups || []).forEach(g => { g.visible = true; }); }), mount: measure(() => { Scene3D.mountGroup.visible = true; }) });
        }
        Scene3D._compMat.fragmentShader = ORIG; Scene3D._compMat.needsUpdate = true;
        return { rows };
    }, { CANDS, SRC: SCENE.toString() });

    if (out.fatal) { console.log('FATAL', out.fatal); await browser.close(); process.exit(1); }
    const f = (v) => `${String(v.n).padStart(4)}/${v.med}/${v.p90}`;
    console.log('후보'.padEnd(24), '| hero  sky/step/crease (n/중앙/p90)'.padEnd(46), '| pets', ' | mount');
    for (const r of out.rows) {
        const s = (g) => ['sky', 'step', 'crease'].map(c => f(r[g][c])).join(' ');
        console.log(r.name.padEnd(24), '|', s('hero'), '|', s('pets'), '|', s('mount'));
    }
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no console errors)');
    await browser.close();
})();
