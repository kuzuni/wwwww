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
const { SEED_INIT } = require('./lib-seed');   // 씬 전체 재현성 — page.goto 보다 먼저 주입해야 한다
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(SEED_INIT);
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
        // 🚨 **항 분리는 임계로 하지 않는다 — 셰이더 문자열 치환으로 한다.** (2026-08-25 3D 스트림)
        //    종전 판은 `edgeK: 1e9` 로 실루엣을 꺼서 크리스만 봤는데, 배포 셰이더의 크리스는
        //    `crs * (1 - step(edgeK * z0, amax))` 로 **큰 계단 근처에서 억제**된다. edgeK 를 1e9 로
        //    올리면 그 억제항이 `1 - step(1e9*z0, amax)` = **항상 1** 이 되어 **억제가 통째로 풀린다** —
        //    즉 종전 '크리스 중앙 3px·6123px' 은 **배포되지 않는 항**을 잰 수치였다(배포 총합이 5257px
        //    인데 크리스 하나가 6123px 인 모순이 그 증거다). 임계는 배포값 그대로 두고 `edge` 식만
        //    갈아 끼워야 배포되는 항을 잰다.
        const ORIG = Scene3D._compMat.fragmentShader;
        const A_EDGE = '  float edge = max(sil, crs) * step(z0, edgeMaxZ);';
        const A_CRS = 'max(crv0, step(normalK, 1.0 - dmin) * (1.0 - crvNear))';
        if (ORIG.indexOf(A_EDGE) < 0 || ORIG.indexOf(A_CRS) < 0) return { fatal: 'anchor not found' };
        const variant = (edgeExpr, crsExpr) => {
            let s = ORIG.replace(A_EDGE, '  float edge = ' + edgeExpr + ';');
            if (crsExpr) s = s.replace(A_CRS, crsExpr);
            Scene3D._compMat.fragmentShader = s;
            Scene3D._compMat.needsUpdate = true;
            Scene3D.renderFrame();   // 컴파일 강제
        };
        const grab = () => {
            Scene3D.renderFrame();
            ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0);
            return ctx.getImageData(0, 0, W, H).data;
        };
        // 항 전부 끈 프레임 = 차분 기준 (임계가 아니라 `edge = 0.0` 으로 끈다)
        variant('0.0', null);
        const off = grab();

        const maskOf = (on) => {
            const m = new Uint8Array(W * H); let n = 0;
            for (let i = 0, p = 0; i < W * H; i++, p += 4) {
                if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) { m[i] = 1; n++; }
            }
            return { m, n };
        };
        // 🖊️ **네 방향 런**(가로·세로·대각 2종). `min(가로,세로)` 는 볼록 코너에서 3~4px 로 부풀고,
        //    4방향 최솟값은 비스듬한 선의 계단 화소를 1px 로 깎는다 — 그래서 아래 `stat` 은
        //    **두 번째로 작은 값**을 쓴다(극단 한 방향만 버리면 두 오차가 동시에 눌린다).
        const runsDir = (mask, dx, dy) => {
            const r = new Uint16Array(W * H);
            const seen = new Uint8Array(W * H);
            for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                const i = y * W + x;
                if (!mask[i] || seen[i]) continue;
                // 이 화소가 (dx,dy) 방향 런의 시작인가 (뒤쪽 이웃이 없으면 시작)
                const px = x - dx, py = y - dy;
                if (px >= 0 && px < W && py >= 0 && py < H && mask[py * W + px]) continue;
                let cx = x, cy = y; const cells = [];
                while (cx >= 0 && cx < W && cy >= 0 && cy < H && mask[cy * W + cx]) { cells.push(cy * W + cx); cx += dx; cy += dy; }
                for (const c of cells) { r[c] = cells.length; seen[c] = 1; }
            }
            return r;
        };
        const stat = (mask, n) => {
            const d0 = runsDir(mask, 1, 0), d1 = runsDir(mask, 0, 1), d2 = runsDir(mask, 1, 1), d3 = runsDir(mask, 1, -1);
            const hist = {};
            for (let i = 0; i < W * H; i++) if (mask[i]) {
                const v = [d0[i], d1[i], d2[i], d3[i]].sort((a, b) => a - b);
                const t = v[1];   // 두 번째로 작은 값
                hist[t] = (hist[t] || 0) + 1;
            }
            const ks = Object.keys(hist).map(Number).sort((a, b) => a - b);
            const pct = (q) => { let c = 0; for (const k of ks) { c += hist[k]; if (c >= n * q) return k; } return ks[ks.length - 1] || 0; };
            const share = (k) => ((hist[k] || 0) / n * 100).toFixed(1) + '%';
            return { n, median: pct(0.5), p90: pct(0.9), one: share(1), two: share(2), three: share(3) };
        };

        // ── 항별로 하나씩만 켠다 (임계는 전부 배포값 그대로. `edge` 식과 `crs` 식만 치환) ──
        const NRM = 'step(normalK, 1.0 - dmin) * (1.0 - crvNear)', CRV = 'crv0';
        const TERMS = {
            sil: ['sil * step(z0, edgeMaxZ)', null],   // 실루엣만
            crs: ['crs * step(z0, edgeMaxZ)', null],   // 법선+곡률(억제 포함) — 배포되는 그 항
            nrm: ['crs * step(z0, edgeMaxZ)', NRM],    // 법선만(억제 포함)
            crv: ['crs * step(z0, edgeMaxZ)', CRV],    // 곡률만(억제 포함)
            both: ['max(sil, crs) * step(z0, edgeMaxZ)', null],
        };
        R.terms = {};
        for (const [name, [ee, ce]] of Object.entries(TERMS)) {
            variant(ee, ce);
            const { m, n } = maskOf(grab());
            R.terms[name] = n ? stat(m, n) : { n: 0 };
        }
        Scene3D._compMat.fragmentShader = ORIG; Scene3D._compMat.needsUpdate = true;
        return R;
    });

    console.log('버퍼:', out.buf, ' 임계:', JSON.stringify(out.k));
    console.log('\n항별 검정 띠 두께 (런 길이 — 네 방향 중 두 번째로 작은 값)');
    console.log('  항       화소수   중앙  p90 |  1px비중   2px비중   3px비중');
    const label = { sil: '실루엣', crs: '크리스', nrm: '법선', crv: '곡률', both: '배포(합)' };
    for (const [k, v] of Object.entries(out.terms)) {
        if (!v.n) { console.log(`  ${label[k].padEnd(8)} (없음)`); continue; }
        console.log(`  ${label[k].padEnd(8)} ${String(v.n).padStart(6)}   ${String(v.median).padStart(3)}  ${String(v.p90).padStart(3)} |  ${v.one.padStart(7)}  ${v.two.padStart(7)}  ${v.three.padStart(7)}`);
    }
    console.log('\n읽는 법: 실루엣은 "반경1 검출 + 1칸 팽창"이라 설계상 2px 이다. 크리스가 그와 다르면');
    console.log('        그 차이가 곧 사용자가 말한 "어떤거는 두껍고 어떤거는 얇다" 의 원천이다.');
    console.log('        (항 분리는 임계가 아니라 셰이더 치환으로 한다 — edgeK 를 올리면 크리스의 amax 억제까지 풀린다.)');
    console.log('콘솔 에러:', errors.length ? errors : '0건');
    await browser.close();
})();
