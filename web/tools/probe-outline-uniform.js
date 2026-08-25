// 검정 아웃라인 두께 **균일도** 게이트 — 사용자 지시 "검은 아웃라인이 어떤거는 두껍고 어떤거는
// 얇다. 다 일정해야함" (slug: uniform-outline-postfx).
//
// 🚨 **아웃라인 화소를 색으로 찾지 말 것.** 마크 문법 조형은 눈·입·발굽·가죽에 거의 검은 칸 색을 쓴다
//    — '어두운 화소'를 세면 그 칸들이 통째로 아웃라인으로 잡혀(첫 판에서 영웅 n=906 중 대부분이
//    눈·입이었다) 두께 통계가 조형에 오염된다. 그래서 **엣지 켠 프레임 − 끈 프레임의 차분**으로
//    아웃라인 화소를 정확히 집는다(컴포짓이 그 화소만 vec3(0) 으로 덮으므로 차분이 곧 마스크다).
//
// 두께 = 마스크 안에서 **가로 런 길이와 세로 런 길이의 최솟값**(수평 엣지는 가로 런이 수십 px 이라
// 가로만 보면 두께가 뻥튀기된다). 계열(영웅+무기·탈것·펫·적)을 하나씩만 보이게 하고 따로 잰다.
//
// ⚠️ 캔버스 읽기는 `renderFrame()` **직후 같은 JS 태스크 안에서** drawImage 해야 한다
//    (메인 렌더러는 preserveDrawingBuffer:false 라 태스크가 끝나면 드로잉버퍼가 날아간다).
// 사용: node probe-outline-uniform.js   (종료코드 0=통과)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 🚨 **데스크톱만 재면 반쪽이다.** 사용자 요구("다 일정해야함")는 기기를 가리지 않는데, 모바일은
//    2026-08-25 이전까지 인버티드 헐 폴백(밀집부 두께 누적)이었다. 그래서 두 UA 를 다 돌린다.
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const runOne = async (browser, label, ua) => {
    const page = await browser.newPage(Object.assign({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 }, ua ? { userAgent: ua } : {}));
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const out = await page.evaluate(() => {
        const R = { postOn: !!Scene3D.postOn, postEdge: !!Scene3D.postEdge };
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (t) => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        // ── 씬: 탈것 + 펫 3 + 적 1 ──
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
        let shells = 0; Scene3D.scene.traverse(o => { if (o.userData && o.userData.__outlineShell) shells++; });
        R.hullShells = shells;

        const gl = Scene3D.renderer.domElement;
        const cv = document.createElement('canvas'); cv.width = gl.width; cv.height = gl.height;
        const ctx = cv.getContext('2d');
        const W = cv.width, H = cv.height;
        R.buf = { w: W, h: H };
        const u = Scene3D._compMat.uniforms;
        const grab = () => {
            Scene3D.renderFrame();
            ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0);
            return ctx.getImageData(0, 0, W, H).data;
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
        const measure = (showFn) => {
            const all = [Scene3D.heroG, Scene3D.mountGroup, ...(Scene3D.petGroups || []), em.g].filter(Boolean);
            const prev = all.map(g => g.visible);
            all.forEach(g => { g.visible = false; });
            showFn();
            const k = u.edgeK.value;
            const on = grab();                       // 엣지 켠 프레임
            u.edgeK.value = 1e9;                     // 임계 무한 = 엣지 0
            const off = grab();
            u.edgeK.value = k;
            all.forEach((g, i) => { g.visible = prev[i]; });
            // 아웃라인 마스크 = 켠 쪽이 검정인데 끈 쪽은 아니었던 화소
            const mask = new Uint8Array(W * H);
            let n = 0;
            for (let i = 0, p = 0; i < W * H; i++, p += 4) {
                if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) { mask[i] = 1; n++; }
            }
            const hr = runs(mask, true), vr = runs(mask, false);
            const hist = {}; let m = 0;
            for (let i = 0; i < W * H; i++) {
                if (!mask[i]) continue;
                const t = Math.min(hr[i], vr[i]);
                hist[t] = (hist[t] || 0) + 1; m++;
            }
            const ks = Object.keys(hist).map(Number).sort((a, b) => a - b);
            const pct = (q) => { let c = 0; for (const kk of ks) { c += hist[kk]; if (c >= m * q) return kk; } return ks[ks.length - 1] || 0; };
            return { n, median: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: ks[ks.length - 1] || 0, hist: ks.slice(0, 6).map(kk => [kk, hist[kk]]) };
        };

        R.per = {};
        R.per.hero = measure(() => { Scene3D.heroG.visible = true; });
        R.per.mount = measure(() => { Scene3D.mountGroup.visible = true; });
        R.per.pets = measure(() => { (Scene3D.petGroups || []).forEach(g => { g.visible = true; }); });
        R.per.enemy = measure(() => { em.g.visible = true; });
        R.per.all = measure(() => { [Scene3D.heroG, Scene3D.mountGroup, ...(Scene3D.petGroups || []), em.g].filter(Boolean).forEach(g => { g.visible = true; }); });
        return R;
    });

    console.log(`\n═══ ${label} ═══`);
    console.log('postOn(블룸):', out.postOn, ' postEdge(아웃라인):', out.postEdge, ' 헐 셸:', out.hullShells, '(엣지 경로면 0)');
    console.log('buffer      :', out.buf.w + 'x' + out.buf.h);
    console.log('--- 계열별 아웃라인 두께 (px, 엣지 차분 마스크) ---');
    const rows = [];
    for (const [k, v] of Object.entries(out.per)) {
        console.log(`  ${k.padEnd(6)} 화소=${String(v.n).padStart(6)}  중앙=${v.median}  p90=${v.p90}  p99=${v.p99}  최대=${v.max}  hist=${JSON.stringify(v.hist)}`);
        if (k !== 'all' && v.n > 200) rows.push([k, v.median, v.p90]);
    }
    const meds = [...new Set(rows.map(r => r[1]))];
    const spread = rows.filter(r => r[2] > r[1] + 1);
    const empty = Object.entries(out.per).filter(([, v]) => v.n < 200).map(([k]) => k);
    const pass = out.postEdge && out.hullShells === 0 && empty.length === 0 && meds.length === 1 && spread.length === 0 && errors.length === 0;
    console.log('--- 판정 ---');
    console.log('  엣지 경로 활성 :', out.postEdge && out.hullShells === 0 ? 'PASS' : 'FAIL (postEdge=' + out.postEdge + ', 헐=' + out.hullShells + ')');
    console.log('  아웃라인 존재  :', empty.length === 0 ? 'PASS (전 계열 마스크 있음)' : 'FAIL 비어있음: ' + empty.join(','));
    console.log('  계열 간 중앙값 :', meds.length === 1 ? 'PASS (전부 ' + meds[0] + 'px)' : 'FAIL ' + JSON.stringify(rows.map(r => r[0] + '=' + r[1])));
    console.log('  계열 내 퍼짐   :', spread.length === 0 ? 'PASS (p90 ≤ 중앙+1)' : 'FAIL ' + JSON.stringify(spread));
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no console errors)');
    await page.close();
    return { pass, median: meds.length === 1 ? meds[0] : null };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const d = await runOne(browser, '데스크톱 UA', null);
    const m = await runOne(browser, '모바일 UA', MOBILE_UA);
    await browser.close();
    // 기기 간에도 같은 두께여야 한다 — 한쪽만 균일한 건 '다 일정'이 아니다.
    const cross = d.median !== null && d.median === m.median;
    console.log('\n═══ 종합 ═══');
    console.log('  기기 간 두께 일치 :', cross ? 'PASS (양쪽 ' + d.median + 'px)' : 'FAIL (데스크톱=' + d.median + ', 모바일=' + m.median + ')');
    console.log('  최종 :', d.pass && m.pass && cross ? 'PASS' : 'FAIL');
    process.exit(d.pass && m.pass && cross ? 0 : 1);
})();
