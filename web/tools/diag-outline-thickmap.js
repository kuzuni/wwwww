// 아웃라인 **두께 지도** — 판정기가 낸 숫자가 '진짜 굵은 선'인지 '측정 아티팩트'인지 눈으로 가른다.
//
// 왜 필요한가: 두께를 `min(가로런, 세로런)` 으로 재면 **모서리와 45° 대각선이 부풀어 보인다**
// (2px 대각선의 가로런은 2.8px, ㄱ자 모서리는 가로·세로런이 둘 다 길다). 그래서 p90 이 4 로 뜨면
// ⓐ 정말 어딘가 4px 로 두꺼운 건지 ⓑ 모서리만 그렇게 세진 건지 숫자만 봐선 못 가른다.
// → 아웃라인 화소를 **두께별로 색칠**해 원본 위에 얹고 6× 확대한다. 빨강이 선을 따라 **길게 이어지면**
//   진짜 결함이고, 꺾이는 점에만 **점점이** 박히면 모서리 아티팩트다.
//
// 색: 2px=초록 · 3px=노랑 · 4px 이상=빨강 · 1px=파랑(너무 얇은 곳)
// 사용: node diag-outline-thickmap.js [출력경로]   기본 tools/outline-thickmap.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.resolve(__dirname, 'outline-thickmap.png');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate((t) => { window.__TERM = t; }, process.env.TERM_MODE || 'both');
    const b64 = await page.evaluate(() => {
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
        step(0.9);

        const gl = Scene3D.renderer.domElement;
        const W = gl.width, H = gl.height;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const u = Scene3D._compMat.uniforms;
        const grab = () => { Scene3D.renderFrame(); ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0); return ctx.getImageData(0, 0, W, H); };
        // 🚨 아웃라인 = 실루엣(edgeK) + 법선 불연속(normalK) + 곡률(creaseK) **세 항의 합**.
        //    'off' 프레임은 셋을 다 꺼야 한다(하나라도 남으면 차분에서 그 선이 지워진다).
        const KEYS = { edgeK: 1e9, creaseK: 1e9, normalK: 9.0 };
        const saved = {};
        for (const kk in KEYS) if (u[kk]) saved[kk] = u[kk].value;
        // TERM=sil → 실루엣만 / TERM=crs → 법선+곡률만 / 기본 both. 항별로 갈라 봐야 점 노이즈가
        // 어느 항 소행인지 나온다(합쳐 보면 실루엣 선에 묻힌다).
        if (window.__TERM === 'sil') { if (u.creaseK) u.creaseK.value = 1e9; if (u.normalK) u.normalK.value = 9.0; }
        if (window.__TERM === 'crs') u.edgeK.value = 1e9;
        const onImg = grab(), on = onImg.data;
        for (const kk in KEYS) if (u[kk]) u[kk].value = KEYS[kk];
        const offImg = grab(), off = offImg.data;
        for (const kk in saved) u[kk].value = saved[kk];

        const mask = new Uint8Array(W * H);
        for (let i = 0, p = 0; i < W * H; i++, p += 4) {
            if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) mask[i] = 1;
        }
        const runs = (horiz) => {
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
        const hr = runs(true), vr = runs(false);
        // 원본(엣지 끈 프레임)을 절반 밝기로 깔고 그 위에 두께색을 얹는다 — 조형과 선을 같이 보려고.
        const outI = ctx.createImageData(W, H);
        const o = outI.data;
        const COL = { 1: [70, 130, 255], 2: [40, 220, 90], 3: [255, 220, 40], 4: [255, 50, 40] };
        for (let i = 0, p = 0; i < W * H; i++, p += 4) {
            o[p] = off[p] * 0.45; o[p + 1] = off[p + 1] * 0.45; o[p + 2] = off[p + 2] * 0.45; o[p + 3] = 255;
            if (!mask[i]) continue;
            const t = Math.min(hr[i], vr[i]);
            const c = COL[Math.min(4, Math.max(1, t))];
            o[p] = c[0]; o[p + 1] = c[1]; o[p + 2] = c[2];
        }
        ctx.putImageData(outI, 0, 0);

        // 6× 최근접 확대 크롭 — 영웅 머리·탈것 접지·펫 무리
        const crops = [
            ['hero-head', 0.37, 0.49], ['mount-body', 0.40, 0.66], ['pets', 0.20, 0.69], ['mount-foot', 0.42, 0.72],
        ];
        const CW = 90, CH = 80, Z = 6, PAD = 6;
        const sheet = document.createElement('canvas');
        sheet.width = W + PAD * 3 + CW * Z; sheet.height = Math.max(H, (CH * Z + PAD) * crops.length);
        const sx = sheet.getContext('2d');
        sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
        sx.drawImage(cv, 0, 0);
        sx.imageSmoothingEnabled = false;
        crops.forEach(([nm, fx, fy], i) => {
            const x = Math.round(W * fx - CW / 2), y = Math.round(H * fy - CH / 2);
            const dy = i * (CH * Z + PAD);
            sx.drawImage(cv, x, y, CW, CH, W + PAD, dy, CW * Z, CH * Z);
            sx.strokeStyle = '#666'; sx.strokeRect(W + PAD, dy, CW * Z, CH * Z);
            sx.fillStyle = '#fff'; sx.font = '18px sans-serif'; sx.fillText(nm, W + PAD + 6, dy + 20);
        });
        sx.fillStyle = '#fff'; sx.font = '16px sans-serif';
        sx.fillText('1px=파랑  2px=초록  3px=노랑  4px+=빨강   TERM=' + (window.__TERM || 'both'), 8, H - 10);
        return sheet.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
    console.log('wrote', OUT, errors.length ? 'ERRORS: ' + errors.join('|') : '(no errors)');
    await browser.close();
})();
