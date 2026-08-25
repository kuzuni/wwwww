// 아웃라인 **항별 두께 분해** — 어느 항이 몇 px 을 그리는지 숫자로 가른다 (slug: uniform-outline-postfx).
//
// 왜 필요한가 (2026-08-25 3D 스트림): 비평가가 "실루엣 옆에 1px 파란 선이 나란히 선다"고 짚었고,
// `probe-outline-strata.js` 의 p90 게이트도 `sky/step p90=2` vs **`crease p90=1`** 로 같은 곳을
// 가리켰다. 가설은 **"크리스 항(`crs`)에 팽창이 없어 태생이 1px"** 인데, 배포 프레임은 두 항이
// 겹쳐 있어 그걸 눈으로도 자로도 못 가른다. 그래서 **항을 하나씩만 켜서** 각 항이 만드는 검정 띠의
// 폭을 직접 잰다.
//
// 자: 각 항만 켠 마스크의 **런 길이**(가로·세로 중 짧은 쪽). 여기서는 런 길이가 맞는 자다 —
//     한 항만 켜면 '겹친 두 선' 문제가 아예 없기 때문이다(그 문제 때문에 게이트 쪽은 거리 자를 쓴다).
//
// 사용: node diag-outline-terms.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const out = await page.evaluate(() => {
        const R = {};
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
        Scene3D._clock = 0; if (Scene3D.heroRig) Scene3D.heroRig._t = 0;
        step(0.9);

        const gl = Scene3D.renderer.domElement;
        const cv = document.createElement('canvas'); cv.width = gl.width; cv.height = gl.height;
        const ctx = cv.getContext('2d');
        const W = cv.width, H = cv.height;
        const u = Scene3D._compMat.uniforms;
        if (u.vig) u.vig.value = 0.0;
        Scene3D._bloomStrength = 0.0; if (u.strength) u.strength.value = 0.0;
        R.buf = W + 'x' + H;

        const K0 = { edgeK: u.edgeK.value, normalK: u.normalK.value, creaseK: u.creaseK.value };
        R.k = K0;
        const setK = (o) => { for (const k in o) if (u[k]) u[k].value = o[k]; };
        const grab = () => {
            Scene3D.renderFrame();
            ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0);
            return ctx.getImageData(0, 0, W, H).data;
        };
        // 항 전부 끈 프레임 = 차분 기준
        setK({ edgeK: 1e9, normalK: 9.0, creaseK: 1e9 });
        const off = grab();

        const maskOf = (on) => {
            const m = new Uint8Array(W * H); let n = 0;
            for (let i = 0, p = 0; i < W * H; i++, p += 4) {
                if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) { m[i] = 1; n++; }
            }
            return { m, n };
        };
        const runs = (mask, horiz) => {
            const r = new Uint16Array(W * H);
            const A = horiz ? H : W, B = horiz ? W : H;
            const idx = (a, b) => horiz ? a * W + b : b * W + a;
            for (let a = 0; a < A; a++) {
                let b = 0;
                while (b < B) {
                    if (!mask[idx(a, b)]) { b++; continue; }
                    const s = b; while (b < B && mask[idx(a, b)]) b++;
                    for (let i = s; i < b; i++) r[idx(a, i)] = b - s;
                }
            }
            return r;
        };
        const stat = (mask, n) => {
            const hr = runs(mask, true), vr = runs(mask, false);
            const hist = {};
            for (let i = 0; i < W * H; i++) if (mask[i]) { const t = Math.min(hr[i], vr[i]); hist[t] = (hist[t] || 0) + 1; }
            const ks = Object.keys(hist).map(Number).sort((a, b) => a - b);
            const pct = (q) => { let c = 0; for (const k of ks) { c += hist[k]; if (c >= n * q) return k; } return ks[ks.length - 1] || 0; };
            const share = (k) => ((hist[k] || 0) / n * 100).toFixed(1) + '%';
            return { n, median: pct(0.5), p90: pct(0.9), one: share(1), two: share(2), three: share(3) };
        };

        // ── 항별로 하나씩만 켠다 ──
        const TERMS = {
            sil: { edgeK: K0.edgeK, normalK: 9.0, creaseK: 1e9 },          // 실루엣만
            crs: { edgeK: 1e9, normalK: K0.normalK, creaseK: K0.creaseK }, // 법선+곡률만
            nrm: { edgeK: 1e9, normalK: K0.normalK, creaseK: 1e9 },        // 법선만
            crv: { edgeK: 1e9, normalK: 9.0, creaseK: K0.creaseK },        // 곡률만
            both: K0,
        };
        R.terms = {};
        for (const [name, kk] of Object.entries(TERMS)) {
            setK(kk);
            const { m, n } = maskOf(grab());
            R.terms[name] = n ? stat(m, n) : { n: 0 };
        }
        setK(K0);
        return R;
    });

    console.log('버퍼:', out.buf, ' 임계:', JSON.stringify(out.k));
    console.log('\n항별 검정 띠 두께 (런 길이, 가로·세로 중 짧은 쪽)');
    console.log('  항       화소수   중앙  p90 |  1px비중   2px비중   3px비중');
    const label = { sil: '실루엣', crs: '크리스', nrm: '법선', crv: '곡률', both: '배포(합)' };
    for (const [k, v] of Object.entries(out.terms)) {
        if (!v.n) { console.log(`  ${label[k].padEnd(8)} (없음)`); continue; }
        console.log(`  ${label[k].padEnd(8)} ${String(v.n).padStart(6)}   ${String(v.median).padStart(3)}  ${String(v.p90).padStart(3)} |  ${v.one.padStart(7)}  ${v.two.padStart(7)}  ${v.three.padStart(7)}`);
    }
    console.log('\n읽는 법: 실루엣은 "반경1 검출 + 1칸 팽창"이라 2px 이어야 한다.');
    console.log('        크리스가 1px 로 나오면 = 팽창이 없다는 가설이 맞다(= 다음 세션의 1순위 수리 지점).');
    console.log('콘솔 에러:', errors.length ? errors : '0건');
    await browser.close();
})();
