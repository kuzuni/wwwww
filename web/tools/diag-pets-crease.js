// 펫 아웃라인 '3px 크리스' 한 줄기 해부기 (slug: uniform-outline-postfx, 2026-08-25 3D 스트림).
//
// 왜: `probe-outline-strata.js` 가 12칸 중 **`pets/crease` 중앙 3px**(p90 6) 하나만 빨간불로 남겼다.
// 숫자만 보면 '크리스 선이 3px 로 굵다'로 읽히지만, 두께는 `min(가로런, 세로런)` 이라 **다른 항이
// 옆에 붙어 만든 런**도 그렇게 잡힌다. 그래서 항을 갈라 **런의 성분비**를 센다:
//   - 실루엣(edgeK)만 켠 마스크 `S`, 법선+곡률(normalK·creaseK)만 켠 마스크 `C`, 둘 다 켠 `B`.
//   - `B` 의 crease 층 화소 중 두께 ≥3 인 것들을 모아, **그 런이 S 로만 이뤄졌는지 / C 가 섞였는지 /
//     C 뿐인지** 를 센다. 이게 '선이 굵다' 와 '선 두 개가 붙었다' 를 가른다.
//
// 사용: node diag-pets-crease.js [출력png]     (수치는 stdout, 8× 확대 시트는 png)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.resolve(__dirname, 'pets-crease-anat.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const res = await page.evaluate(() => {
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (t) => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        // 판정기와 **같은 씬**(탈것 탑승 + 펫 3 + 적 1)을 세운 뒤 펫만 보이게 격리한다.
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
        step(0.9);
        [Scene3D.heroG, Scene3D.mountGroup, em.g].forEach(g => { if (g) g.visible = false; });

        const gl = Scene3D.renderer.domElement;
        const W = gl.width, H = gl.height;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const u = Scene3D._compMat.uniforms;
        const grab = () => { Scene3D.renderFrame(); ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0); return ctx.getImageData(0, 0, W, H).data; };
        const OFFV = { edgeK: 1e9, creaseK: 1e9, normalK: 9.0, idOn: 0.0 };
        const saved = {}; for (const k in OFFV) if (u[k]) saved[k] = u[k].value;
        const setK = (o) => { for (const k in OFFV) if (u[k]) u[k].value = (k in o) ? o[k] : saved[k]; };

        setK({});                                   // 세 항 전부 on
        const both = grab();
        setK({ creaseK: 1e9, normalK: 9.0 });       // 실루엣만
        const silf = grab();
        setK({ edgeK: 1e9 });                       // 법선+곡률만
        const crsf = grab();
        setK(OFFV);                                 // 전부 off
        const off = grab();
        setK({});

        // 깊이맵(층 분류용) — 판정기와 같은 방식
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
        Scene3D.renderFrame();
        const prevMat = Scene3D._fsQuad.material;
        depthMat.uniforms.tDepth.value = Scene3D._rtScene.depthTexture;
        depthMat.uniforms.camNear.value = Scene3D.camera.near;
        depthMat.uniforms.camFar.value = Scene3D.camera.far;
        Scene3D._fsQuad.material = depthMat;
        Scene3D.renderer.setRenderTarget(null); Scene3D.renderer.render(Scene3D._fsScene, Scene3D._fsCam);
        Scene3D._fsQuad.material = prevMat;
        ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0);
        const dpx = ctx.getImageData(0, 0, W, H).data;
        const far = Scene3D.camera.far;
        const zmap = new Float32Array(W * H);
        for (let i = 0, p = 0; i < W * H; i++, p += 4) zmap[i] = (dpx[p] + dpx[p + 1] / 255) / 255 * far;

        const maskOf = (on) => { const m = new Uint8Array(W * H); for (let i = 0, p = 0; i < W * H; i++, p += 4) if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) m[i] = 1; return m; };
        const B = maskOf(both), Sm = maskOf(silf), Cm = maskOf(crsf);

        const runsOf = (mask, horiz) => {
            const r = new Uint16Array(W * H), st = new Int32Array(W * H);
            const A = horiz ? H : W, L = horiz ? W : H;
            const idx = (a, b) => horiz ? a * W + b : b * W + a;
            for (let a = 0; a < A; a++) {
                let b = 0;
                while (b < L) {
                    if (!mask[idx(a, b)]) { b++; continue; }
                    const s = b; while (b < L && mask[idx(a, b)]) b++;
                    for (let i = s; i < b; i++) { r[idx(a, i)] = b - s; st[idx(a, i)] = idx(a, s); }
                }
            }
            return { r, st };
        };
        const hr = runsOf(B, true), vr = runsOf(B, false);

        const FAR = far * 0.9, STEP_Z = 0.30;
        const cls = new Uint8Array(W * H);   // 1 sky 2 step 3 crease
        for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
            const i = y * W + x; if (!B[i]) continue;
            const z0 = zmap[i]; let sky = false, mx = 0;
            for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
                if (dx * dx + dy * dy > 4 || (!dx && !dy)) continue;
                const zn = zmap[i + dy * W + dx];
                if (zn > FAR) sky = true;
                const d = Math.abs(zn - z0); if (d > mx) mx = d;
            }
            cls[i] = sky ? 1 : (mx >= STEP_Z ? 2 : 3);
        }

        // ── 두꺼운 crease 런의 성분비 ──
        //   런 = 두께를 준 축(가로/세로 중 짧은 쪽)의 연속 구간. 그 구간이 S 로만 / C 로만 / 섞여
        //   있는지를 세면 '선이 굵다' 와 '선 둘이 붙었다' 가 갈린다.
        const comp = { silOnly: 0, crsOnly: 0, mixed: 0, neither: 0 };
        const thickHist = {};
        let nC = 0;
        const hotspots = [];
        for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
            const i = y * W + x; if (cls[i] !== 3) continue;
            nC++;
            const t = Math.min(hr.r[i], vr.r[i]);
            thickHist[t] = (thickHist[t] || 0) + 1;
            if (t < 3) continue;
            const horiz = hr.r[i] <= vr.r[i];
            const start = horiz ? hr.st[i] : vr.st[i], len = t, stride = horiz ? 1 : W;
            let s = 0, c = 0;
            for (let k = 0; k < len; k++) { const j = start + k * stride; if (Sm[j]) s++; if (Cm[j]) c++; }
            if (s && c) comp.mixed++; else if (s) comp.silOnly++; else if (c) comp.crsOnly++; else comp.neither++;
            if (hotspots.length < 4000) hotspots.push([x, y]);
        }
        // 핫스팟 무게중심 몇 개 (확대 크롭 위치 잡기용)
        let cxs = 0, cys = 0;
        for (const [x, y] of hotspots) { cxs += x; cys += y; }
        const centroid = hotspots.length ? [Math.round(cxs / hotspots.length), Math.round(cys / hotspots.length)] : [W / 2, H / 2];

        // ── 시트: 성분색(파랑=실루엣만, 빨강=크리스만, 노랑=둘 다) + 두꺼운 crease 화소 흰 테두리 ──
        const outI = ctx.createImageData(W, H), o = outI.data;
        for (let i = 0, p = 0; i < W * H; i++, p += 4) {
            o[p] = off[p] * 0.4; o[p + 1] = off[p + 1] * 0.4; o[p + 2] = off[p + 2] * 0.4; o[p + 3] = 255;
            if (!B[i]) continue;
            const s = Sm[i], c = Cm[i];
            let col = s && c ? [255, 220, 40] : s ? [70, 140, 255] : c ? [255, 60, 50] : [160, 160, 160];
            if (cls[i] === 3 && Math.min(hr.r[i], vr.r[i]) >= 3) col = [255, 255, 255];
            o[p] = col[0]; o[p + 1] = col[1]; o[p + 2] = col[2];
        }
        ctx.putImageData(outI, 0, 0);
        const CW = 76, CH = 64, Z = 8, PAD = 6;
        const crops = [['pets-centroid', centroid[0], centroid[1]], ['pets-left', Math.round(W * 0.16), Math.round(H * 0.70)], ['pets-mid', Math.round(W * 0.26), Math.round(H * 0.70)]];
        const sheet = document.createElement('canvas');
        sheet.width = W + PAD * 3 + CW * Z; sheet.height = Math.max(H, (CH * Z + PAD) * crops.length);
        const sx = sheet.getContext('2d');
        sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
        sx.drawImage(cv, 0, 0); sx.imageSmoothingEnabled = false;
        crops.forEach(([nm, cx2, cy2], i) => {
            const x = Math.max(0, Math.round(cx2 - CW / 2)), y = Math.max(0, Math.round(cy2 - CH / 2));
            const dy = i * (CH * Z + PAD);
            sx.drawImage(cv, x, y, CW, CH, W + PAD, dy, CW * Z, CH * Z);
            sx.strokeStyle = '#666'; sx.strokeRect(W + PAD, dy, CW * Z, CH * Z);
            sx.fillStyle = '#fff'; sx.font = '18px sans-serif'; sx.fillText(nm + ' @' + x + ',' + y, W + PAD + 6, dy + 20);
        });
        sx.fillStyle = '#fff'; sx.font = '15px sans-serif';
        sx.fillText('파랑=실루엣만 · 빨강=크리스만 · 노랑=둘다 · 흰색=crease층 두께>=3', 8, H - 10);

        return { W, H, nC, thickHist, comp, sil: Sm.reduce((a, b) => a + b, 0), crs: Cm.reduce((a, b) => a + b, 0), both: B.reduce((a, b) => a + b, 0), png: sheet.toDataURL('image/png').split(',')[1] };
    });

    fs.writeFileSync(OUT, Buffer.from(res.png, 'base64'));
    console.log('버퍼', res.W + 'x' + res.H, '| 마스크 화소  both=' + res.both, 'sil=' + res.sil, 'crs=' + res.crs);
    console.log('crease 층 n=' + res.nC, '두께분포', JSON.stringify(res.thickHist));
    console.log('두께>=3 인 crease 화소의 런 성분:', JSON.stringify(res.comp));
    console.log('wrote', OUT, errors.length ? 'ERRORS: ' + errors.join('|') : '(no errors)');
    await browser.close();
})();
