// 아웃라인 **대비(contrast)** 판정기 (slug: uniform-outline-postfx, 2026-08-25 3D 스트림 신설).
//
// 🎯 **왜 이 자가 필요한가 — 기존 자 전부가 못 보는 축이다.**
// `probe-outline-strata`(두께·덮임·침식) · `probe-outline-uniform`(런 길이) · `probe-crease-lines`
// (선 존재) 셋은 전부 **"어느 화소가 검게 칠해졌는가"** 만 본다. 그래서 선이 제자리에 정확한
// 두께로 그려져 있으면 **그 선이 눈에 보이는지와 무관하게** 초록불을 낸다.
//
// 비평가가 2026-08-25 재채점(5/10)에서 그 사각지대를 정확히 짚었다:
//   "무기 행2 x170~320·y180~320(탈것 갈색 갑주)은 표면이 `(35,28,18)` 이라 `#000` 선과의
//    명도차가 **10/255**. 크림색 영웅 위에서 칼같은 1px 인 **같은 선이 여기서는 안 보인다.**"
// 즉 **색 균일(전부 순검정)과 체감 두께 균일은 다른 축**이고, ⑤ 축을 9~10 으로 통과시켜 온
// 자·비평가가 전원 이걸 놓쳤다. 사용자 원문("어떤거는 두껍고 어떤거는 얇다 / 다 일정해야함")은
// **선이 안 보이는 자리에서도 깨진다** — 안 보이는 선은 두께 0 이다.
//
// 📏 **재는 것**: 아웃라인 화소마다 **자기를 그린 그 경계의 바로 바깥 표면**과의 명도차를 잰다.
//   ⓐ 아웃라인 마스크는 다른 자들과 같은 방식(엣지 on/off 차분)으로 뽑는다.
//      🚨 `edgeK`·`normalK`·`creaseK` **셋을 다 꺼야** 한다 — 하나라도 남기면 그 선이 on/off 양쪽에
//         똑같이 찍혀 차분에서 지워진다(판정기 3종이 공유하는 함정. 실측: 5353 → 1065).
//   ⓑ 각 아웃라인 화소에서 **반경 R_LOOK 안의 비-아웃라인 화소들**을 모아, 그 중 **가장 어두운
//      쪽**과의 명도차를 그 화소의 대비로 삼는다. 가장 어두운 쪽을 쓰는 이유: 선의 양옆 중 한쪽만
//      밝아도 선은 '보인다'가 아니라, **어두운 쪽에 묻히는 구간이 곧 결함**이기 때문이다.
//      (밝은 쪽만 보면 크림색 영웅에 붙은 갈색 갑주 경계가 통과해 버린다.)
//   ⓒ 계열(영웅·탈것·펫·적)별로 나눠 재고, **가장 어두운 표면을 가진 계열이 통과할 때만** PASS.
//
// ⚠️ **비네트·블룸을 끄고 잰다.** 비네트는 화면 가장자리 표면을 통째로 눌러 대비를 낮추는데,
//    그건 아웃라인 설계의 결함이 아니라 의도된 연출이다. 여기서 안 끄면 가장자리 개체가
//    전부 거짓 FAIL 한다(`shot-outline-uniform` 이 같은 이유로 끄고 잰다).
//
// 사용: node probe-outline-contrast.js   ·  DSF=1 node probe-outline-contrast.js
//       (종료코드 0=통과)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { SEED_INIT } = require('./lib-seed');   // 씬 전체 재현성 — page.goto 보다 먼저 주입해야 한다
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

// 명도차 문턱. 비평가가 "안 보인다"고 판정한 자리가 **10/255** 였고, 확실히 보인다고 한 자리
// (크림색 영웅 `(235,227,213)` 위)는 **200+** 였다. 그 사이에서 고른다:
//  · 40/255 = 약 16% 명도차. 이보다 낮으면 1px 선은 실사용 밝기에서 표면에 묻힌다.
//  · 게이트는 **중앙값이 아니라 하위 꼬리(p10)** 로 건다 — 결함은 "어두운 표면 위 구간"에만
//    몰려 있어서, 중앙값으로 보면 밝은 표면이 통째로 덮어 버린다(이 항목의 단골 실패 방식).
const MIN_CONTRAST = 40;
const P10_MIN = MIN_CONTRAST;      // 하위 10% 화소도 이 문턱은 넘어야 한다
const BURIED_MAX = 0.08;           // 문턱 미달('묻힌') 화소가 이 비율을 넘으면 FAIL
const R_LOOK = 3;                  // 표면을 찾으러 나가는 반경(버퍼 px)

const runOne = async (browser, label, ua, dsf) => {
    const page = await browser.newPage(Object.assign(
        { viewport: { width: 480, height: 854 }, deviceScaleFactor: dsf }, ua ? { userAgent: ua } : {}));
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.addInitScript(SEED_INIT);
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const out = await page.evaluate(({ MIN_CONTRAST, R_LOOK }) => {
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (t) => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        // ── 씬 구성: 짝 판정기(probe-outline-strata)와 **똑같이** 맞춘다 ──
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
        // 위상 고정 — lib-seed.js 참조. `_clock`·리그 `_t`·`worldX`·개체 phase 를 전부 눌러야
        // 실행마다 같은 그림이 나온다(안 하면 두께·커버리지가 널뛴다).
        {
            const pin = (g) => { if (g && g.userData) g.userData.phase = 0; };
            pin(Scene3D.mountGroup);
            (Scene3D.petGroups || []).forEach(pin);
            if (Scene3D.enemyMap) Scene3D.enemyMap.forEach(v => pin(v && v.g));
        }
        Scene3D._clock = 0; Scene3D.worldX = 0;
        if (Scene3D.heroRig) Scene3D.heroRig._t = 0;
        step(0.9);

        const u = Scene3D._compMat.uniforms;
        // ⚠️ 비네트·블룸 off — 위 헤더 주석 참조(연출이 대비를 눌러 거짓 FAIL 을 만든다).
        const savedVig = u.vig.value, savedStr = u.strength.value;
        u.vig.value = 0.0; u.strength.value = 0.0;

        const gl = Scene3D.renderer.domElement;
        const W = gl.width, H = gl.height;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d');
        const grab = () => { Scene3D.renderFrame(); ctx.clearRect(0, 0, W, H); ctx.drawImage(gl, 0, 0); return ctx.getImageData(0, 0, W, H).data; };

        // ── 아웃라인 마스크: 세 항을 **전부** 꺼서 차분한다 ──
        const saved = { edgeK: u.edgeK.value, normalK: u.normalK.value, creaseK: u.creaseK.value, idOn: u.idOn ? u.idOn.value : 0 };
        const on = grab();
        u.edgeK.value = 1e9; u.normalK.value = 9.0; u.creaseK.value = 1e9; if (u.idOn) u.idOn.value = 0.0;
        const off = grab();
        u.edgeK.value = saved.edgeK; u.normalK.value = saved.normalK; u.creaseK.value = saved.creaseK; if (u.idOn) u.idOn.value = saved.idOn;

        const lum = (a, p) => 0.2126 * a[p] + 0.7152 * a[p + 1] + 0.0722 * a[p + 2];
        const mask = new Uint8Array(W * H);
        for (let i = 0, p = 0; i < W * H; i++, p += 4) {
            if (on[p] <= 8 && on[p + 1] <= 8 && on[p + 2] <= 8 && (off[p] > 16 || off[p + 1] > 16 || off[p + 2] > 16)) mask[i] = 1;
        }

        // ── 계열 마스크: **깊이 차분**으로 뽑는다(색 차분은 그림자가 딸려 온다) ──
        // 개체를 하나씩 숨겼다 켜서, 사라진 화소를 그 계열로 본다.
        const groups = {
            hero: [Scene3D.heroG],
            mount: [Scene3D.mountGroup],
            pets: (Scene3D.petGroups || []).slice(),
            enemy: [em.g],
        };
        const owner = new Uint8Array(W * H);   // 0=없음, 1..4=계열
        const names = ['hero', 'mount', 'pets', 'enemy'];
        names.forEach((nm, gi) => {
            const gs = (groups[nm] || []).filter(Boolean);
            if (!gs.length) return;
            const vis = gs.map(g => g.visible);
            gs.forEach(g => { g.visible = false; });
            const hidden = grab();
            gs.forEach((g, k) => { g.visible = vis[k]; });
            for (let i = 0, p = 0; i < W * H; i++, p += 4) {
                if (owner[i]) continue;
                const d = Math.abs(on[p] - hidden[p]) + Math.abs(on[p + 1] - hidden[p + 1]) + Math.abs(on[p + 2] - hidden[p + 2]);
                if (d > 24) owner[i] = gi + 1;
            }
        });
        const base = grab();   // 마스크 작업이 남긴 프레임을 원상 복구(다음 측정이 이 배열을 쓴다)

        // ── 대비 측정 ──
        // 아웃라인 화소마다 반경 R 안의 **비-아웃라인** 화소 중 **가장 어두운** 것과의 명도차.
        const per = {};
        for (const nm of names) per[nm] = { vals: [], darkest: 255, darkSpot: null };
        for (let y = R_LOOK; y < H - R_LOOK; y++) {
            for (let x = R_LOOK; x < W - R_LOOK; x++) {
                const i = y * W + x;
                if (!mask[i] || !owner[i]) continue;
                let lo = 1e9, loP = -1;
                for (let dy = -R_LOOK; dy <= R_LOOK; dy++) {
                    for (let dx = -R_LOOK; dx <= R_LOOK; dx++) {
                        const j = (y + dy) * W + (x + dx);
                        if (mask[j]) continue;                 // 선 자신은 표본이 아니다
                        const L = lum(base, j * 4);
                        if (L < lo) { lo = L; loP = j; }
                    }
                }
                if (loP < 0) continue;                          // 사방이 전부 선(=먹힌 파츠) → 침식 축 소관
                const nm = names[owner[i] - 1];
                const c = lo - lum(base, i * 4);                // 선은 사실상 0 이라 c ≈ 표면 명도
                per[nm].vals.push(c);
                if (c < per[nm].darkest) { per[nm].darkest = c; per[nm].darkSpot = { x, y }; }
            }
        }
        u.vig.value = savedVig; u.strength.value = savedStr;
        Scene3D.renderFrame();

        const stat = (v) => {
            if (!v.length) return null;
            const s = v.slice().sort((a, b) => a - b);
            const q = (f) => s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * f)))];
            return {
                n: s.length, min: Math.round(s[0]), p10: Math.round(q(0.10)), median: Math.round(q(0.50)),
                buried: v.filter(c => c < MIN_CONTRAST).length / v.length,
            };
        };
        const R = { buf: { w: W, h: H }, per: {} };
        for (const nm of names) R.per[nm] = Object.assign({ darkSpot: per[nm].darkSpot }, stat(per[nm].vals));
        return R;
    }, { MIN_CONTRAST, R_LOOK });

    console.log(`\n═══ ${label} ═══`);
    console.log('버퍼:', out.buf.w + 'x' + out.buf.h);
    console.log('--- 선 vs 가장 어두운 이웃 표면의 명도차(0~255) ---');
    const bad = [];
    for (const [nm, v] of Object.entries(out.per)) {
        if (!v || !v.n) { console.log(`  ${nm.padEnd(6)} 표본 없음`); continue; }
        const spot = v.darkSpot ? ` 최악 지점 (${v.darkSpot.x},${v.darkSpot.y})` : '';
        console.log(`  ${nm.padEnd(6)} n=${String(v.n).padStart(5)} 최소=${String(v.min).padStart(3)} p10=${String(v.p10).padStart(3)} 중앙=${String(v.median).padStart(3)} | 묻힘(<${MIN_CONTRAST}) ${(v.buried * 100).toFixed(1)}%${spot}`);
        if (v.p10 < P10_MIN) bad.push(`${nm} p10=${v.p10}<${P10_MIN}`);
        if (v.buried > BURIED_MAX) bad.push(`${nm} 묻힘 ${(v.buried * 100).toFixed(1)}%>${BURIED_MAX * 100}%`);
    }
    const pass = bad.length === 0 && errors.length === 0;
    console.log('--- 판정 ---');
    console.log(`  선이 표면에서 읽히는가 : ${pass ? 'PASS' : 'FAIL ' + bad.join(' · ')}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no console errors)');
    await page.close();
    return { pass, label };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const DSF = +(process.env.DSF || 2);
    const bands = [
        await runOne(browser, `데스크톱 UA · DPR ${DSF}`, null, DSF),
        await runOne(browser, `모바일 UA · DPR ${DSF}`, MOBILE_UA, DSF),
    ];
    await browser.close();
    const ok = bands.every(b => b.pass);
    console.log('\n═══ 종합 ═══');
    console.log('  최종 :', ok ? 'PASS' : 'FAIL');
    process.exit(ok ? 0 : 1);
})();
