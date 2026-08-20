// 화염 연출이 실제로 '불색'인가를 재는 자 (slug: skill-fx)
// 사용: node probe-fire-color.js            (화염구 explode 경로)
//       node probe-fire-color.js --selftest (음성 대조 — 불꽃을 흰색으로 눌러 반드시 FAIL 이 나야 한다)
//
// 왜 — 비평가 2인이 독립으로 "화염구에 불이 한 픽셀도 없다 / 흰 원뿔 더미"라고 적었고,
// 고친 촬영기의 시트(600~870ms)에서도 그대로 보인다. 원인은 색값이 아니라 **합성 방식**이다:
// `firePillar` 의 3겹이 전부 가산(Additive) 합성 + DoubleSide 라 한 픽셀에 앞뒤 면이 6번 더해지고,
// 배경이 밝은 초원(휘도 0.55~0.75)이라 **어떤 색을 넣어도 세 채널이 다 1.0 으로 클리핑**된다.
// 즉 '불색을 진하게' 로는 절대 못 고친다 — 지배색 껍질은 알파 합성이어야 배경을 덮어쓴다.
//
// 판정(둘 다 통과해야 exit 0):
//   ① 온기  = 불꽃 잉크의 평균 (R − B) ≥ WARM_MIN      … 주황이 파랑을 확실히 이기는가
//   ② 백열비 = 세 채널이 다 0.92 이상인 순백 화소 비율 ≤ WHITE_MAX … 흰 덩어리로 뭉개지지 않는가
// ⚠️ 지표가 면적에 딸려 가지 않게, 둘 다 **변화 화소(잉크) 집합 안에서만** 잰다.
// 🚨 **재는 대상은 불기둥만이다.** 첫 판에서 '잉크 최대 컷'으로 판정했더니 그 컷이 불기둥이 아니라
//    **지면 폭발 플래시**였고(450ms, 온기 0.164), 정작 흰 덩어리로 뭉개지는 불기둥 구간(750~870ms,
//    순백비 46~55%)은 판정에서 빠졌다 — 저장소 함정 ④⑶ '지표가 면적에 딸려 움직인다'의 재판이다.
//    그래서 `firePillar` 가 만든 그룹만 손에 쥐고(생성 후킹), **같은 프레임을 그것만 끄고/켜고 두 번
//    렌더해 차분**한다. 다른 층(폭발·불티·충격파·데칼)은 양쪽에 똑같이 들어 있어 통째로 상쇄된다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { VCLOCK_SRC } = require('./virtual-clock.js');
const SELFTEST = process.argv.includes('--selftest');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const WARM_MIN = 0.18, WHITE_MAX = 0.25;
const STEP_MS = 30, N = 30;          // 0~870ms — 화염 기둥이 다 서는 구간까지

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(VCLOCK_SRC);

    const res = await page.evaluate(async ({ STEP_MS, N, SELFTEST }) => {
        Combat.tick = () => { };
        Scene3D.walking = false; Scene3D.heroAttack = () => { };
        Scene3D.clearEnemies();
        const e = { id: 999, x: Combat.MELEE_X + 0.9, alive: true, hp: 1e9, maxHp: 1e9 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        m.g.position.x = e.x + Scene3D.worldX; m.g.position.y = 0; m.g.userData.landed = true;
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
        Scene3D.anims = [];
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        const realUpdate = Scene3D.update.bind(Scene3D);

        // 불기둥 그룹만 손에 쥔다 — 호출 전후 씬 자식 차분(저장소 함정 ④⑵: 타입으로 찾으면
        // 다른 연출이 같이 잡혀 수치가 늘었다 줄었다 한다).
        const pillars = [];
        const origPillar = Scene3D.firePillar.bind(Scene3D);
        Scene3D.firePillar = function (pos, color, tier) {
            const before = new Set(Scene3D.scene.children);
            // 음성 대조: 불꽃을 흰색으로 눌러, 이 자가 '흰 덩어리'를 잡아내는지 본다.
            // ⚠️ 복셀 화염(2026-08-20)은 층 색이 상수라 색 인자로는 흰 불꽃이 안 만들어진다(백색
            //    내성) — 전용 레버 FIREPILLAR_WHITE 로 층 색 자체를 민다.
            if (SELFTEST) Scene3D.FIREPILLAR_WHITE = true;
            const r = origPillar(pos, SELFTEST ? new THREE.Color(0xffffff) : color, tier);
            // ⚠️ **Group 만 쥔다** — firePillar 는 호출 중에 불티(riseParticle, 씬 직속 Mesh)도 뿌리는데
            //    그것까지 차분에 걸리면 '불기둥만 잰다'는 이 자의 전제가 깨진다. 실측: 기둥이 다
            //    꺼진 810~870ms 에 불티 잔재만 남아 R−B 0.03 회색으로 재였다(기둥 결함이 아닌 FAIL).
            for (const c of Scene3D.scene.children) if (!before.has(c) && c.isGroup) pillars.push(c);
            return r;
        };

        const def = SKILL_DEFS.find(d => d.id === 'fireball');
        const tier = Scene3D.skillTier(def), col = new THREE.Color(def.color);
        const wait = Scene3D.castMsFor(def.fx, tier);

        const cv = document.querySelector('canvas');
        const r = cv.getBoundingClientRect();
        const W = Math.round(r.width), H = Math.round(r.height);
        const off = document.createElement('canvas'); off.width = W; off.height = H;
        const ctx = off.getContext('2d');
        const grab = () => { Scene3D.renderer.render(Scene3D.scene, Scene3D.camera); ctx.clearRect(0, 0, W, H); ctx.drawImage(cv, 0, 0, W, H); return ctx.getImageData(0, 0, W, H).data; };

        VClock.install();
        Scene3D.skillCastBeat(col, def.fx, tier);
        let fired = false;
        const shots = [];
        for (let i = 1; i < N; i++) {
            const t = i * STEP_MS;
            VClock.pump(t);
            if (!fired && t >= wait) { fired = true; Scene3D.skillPayload(def.fx, col, [999], tier); VClock.pump(t); }
            realUpdate(STEP_MS / 1000);
            const live = pillars.filter(p => p.parent === Scene3D.scene);
            if (!live.length) continue;
            // 같은 프레임을 불기둥만 끄고/켜고 두 번 — 차이가 곧 불기둥의 잉크다
            for (const p of live) p.visible = false;
            const without = grab();
            for (const p of live) p.visible = true;
            const withP = grab();
            let n = 0, sr = 0, sg = 0, sb = 0, white = 0;
            for (let p = 0; p < withP.length; p += 4) {
                const dl = (0.299 * withP[p] + 0.587 * withP[p + 1] + 0.114 * withP[p + 2])
                    - (0.299 * without[p] + 0.587 * without[p + 1] + 0.114 * without[p + 2]);
                if (dl < 18) continue;                 // 이 화소는 불기둥이 실제로 칠한 자리다
                n++; sr += withP[p]; sg += withP[p + 1]; sb += withP[p + 2];
                if (withP[p] >= 235 && withP[p + 1] >= 235 && withP[p + 2] >= 235) white++;
            }
            if (n > 400) shots.push({ t, n, r: sr / n / 255, g: sg / n / 255, b: sb / n / 255, white: white / n });
        }
        VClock.restore();
        return { shots };
    }, { STEP_MS, N, SELFTEST });

    await browser.close();
    if (errors.length) { console.log('콘솔 에러 ' + errors.length + '건: ' + errors[0]); process.exit(2); }
    if (!res.shots.length) { console.log('잉크가 잡힌 프레임이 0 — 자가 아무것도 못 재고 있다(고장 의심).'); process.exit(2); }

    // 🚨 '가장 좋은 컷'이 아니라 **가장 나쁜 컷**으로 판정한다 — 불기둥이 서 있는 동안 한 프레임이라도
    //    흰 덩어리로 뭉개지면 플레이어는 그걸 본다. (첫 판은 잉크 최대 컷 하나만 봐서 정작 뭉개지는
    //    구간을 놓쳤다.)
    console.log(`화염구 firePillar 색 판정 — 불기둥만 분리해 잼${SELFTEST ? '  [--selftest: 불꽃을 흰색으로 눌렀다]' : ''}`);
    for (const s of res.shots)
        console.log(`  ${String(s.t).padStart(4)}ms  기둥 잉크 ${String(s.n).padStart(6)}화소  RGB ${s.r.toFixed(2)}/${s.g.toFixed(2)}/${s.b.toFixed(2)}  온기 R−B ${(s.r - s.b).toFixed(3)}  순백비 ${(s.white * 100).toFixed(1)}%`);
    const worstWarm = res.shots.reduce((a, b) => ((b.r - b.b) < (a.r - a.b) ? b : a));
    const worstWhite = res.shots.reduce((a, b) => (b.white > a.white ? b : a));
    const warm = worstWarm.r - worstWarm.b;
    const okWarm = warm >= WARM_MIN, okWhite = worstWhite.white <= WHITE_MAX;
    console.log(`\n기둥이 서 있는 컷 ${res.shots.length}개 중 최악값으로 판정`);
    console.log(`  ${okWarm ? '✅' : '❌'} 최저 온기 R−B = ${warm.toFixed(3)} (${worstWarm.t}ms)  (기준 ≥ ${WARM_MIN})`);
    console.log(`  ${okWhite ? '✅' : '❌'} 최대 순백비 = ${(worstWhite.white * 100).toFixed(1)}% (${worstWhite.t}ms)  (기준 ≤ ${WHITE_MAX * 100}%)`);
    if (okWarm && okWhite) { console.log('통과: 불꽃이 서 있는 내내 불색으로 읽힌다.'); process.exit(0); }
    console.log('불통과: 화염 연출이 흰 덩어리로 뭉개지는 구간이 있다.');
    process.exit(1);
})();
