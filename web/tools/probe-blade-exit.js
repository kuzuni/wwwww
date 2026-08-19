// 처형 칼날이 '벤 뒤 언제 화면에서 사라지는가'를 재는 자 (slug: skill-fx)
// 사용: node probe-blade-exit.js            (처형 guillotine)
//       node probe-blade-exit.js --selftest (음성 대조 — 퇴장을 느리게 되돌려 반드시 FAIL 이 나야 한다)
//
// 왜 — 비평가 2인이 2차에서 **일치로 최악급**으로 꼽은 결함: "칼날이 600ms 에 적 뒤에 박힌 뒤
// 1050ms 까지 그 자리에 주차한다 / 관통 직후 칼날은 사라지고 지면 데칼만 남아야 한다".
// 코드에서도 확인된다 — 퇴장 단계가 `opacity *= (1 - k*0.25)` 라 **프레임마다 곱하는 감쇠**였다:
//   ⑴ 프레임 수에 따라 결과가 달라지고(프레임레이트 의존) ⑵ 0 에 **영원히 도달하지 않는다**.
//   게다가 퇴장 중 칼날이 **위로 떠올라** 화면 안에 계속 남는다 — 그게 '주차'로 읽힌 실체다.
//
// 판정(둘 다 통과해야 exit 0):
//   ① 잔류시간 = 절단(GUILLOTINE_IMPACT_MS) 이후 칼날 잉크가 사라질 때까지 ≤ LINGER_MAX_MS
//   ② 되살아나지 않을 것 = 절단 이후 칼날 잉크가 **뚜렷이** 다시 늘어나는 구간이 없을 것.
//      ⚠️ 허용치를 절대 화소로 두면 안 된다 — 여운 단계의 **의도된 날 명멸**(edge opacity ±0.3)이
//      3,000화소짜리 칼날에서 ±250화소(8%)를 만들어, 멀쩡한 연출이 '되살아남'으로 잡힌다(실제로 그랬다).
//      진짜 '되살아남'은 절단 전 수준(6,300화소)으로 돌아가는 것이라 규모가 다르다 → **절단 직후
//      잉크의 15%** 를 문턱으로 쓴다(명멸은 못 넘고 재출현은 반드시 넘는다).
// ⚠️ 칼날만 잰다 — 폭발·파편·그을음·충격파는 남아야 정상이라, 그것들이 섞이면 판정이 뒤집힌다.
//    `guillotineDrop` 이 만든 그룹 안에서 **칼날 서브그룹만** 끄고/켜고 두 번 렌더해 차분한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { VCLOCK_SRC } = require('./virtual-clock.js');
const SELFTEST = process.argv.includes('--selftest');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const LINGER_MAX_MS = 260, REBOUND_FRAC = 0.15;
const STEP_MS = 30, N = 45;          // 0~1320ms

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

        // 음성 대조: 교정 전 수명으로 되돌린다(여운 0.22s · 퇴장 0.3s · 위로 부상).
        // 이때 반드시 불통과가 나와야 이 자가 살아 있는 것이다.
        if (SELFTEST) { Scene3D.GUILLOTINE_HOLD_S = 0.22; Scene3D.GUILLOTINE_EXIT_S = 0.3; Scene3D.GUILLOTINE_SINK = -0.18; }

        const def = SKILL_DEFS.find(d => d.fx === 'guillotine');
        const tier = Scene3D.skillTier(def), col = new THREE.Color(def.color);
        const wait = Scene3D.castMsFor(def.fx, tier);
        const impact = wait + Scene3D.GUILLOTINE_IMPACT_MS;

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
        let bladeRef = null;
        for (let i = 1; i < N; i++) {
            const t = i * STEP_MS;
            VClock.pump(t);
            if (!fired && t >= wait) { fired = true; Scene3D.skillPayload(def.fx, col, [999], tier); VClock.pump(t); }
            realUpdate(STEP_MS / 1000);
            // 연출 그룹 안에서 칼날 서브그룹만 집는다 — 칼날은 자식이 4개(몸판·날·등·고리)인 Group 이고
            // 나머지(선고 원·테)는 Mesh 라 구분된다. 타입으로 찾지 않고 이 연출의 그룹 안에서만 찾는다.
            if (!bladeRef) {
                const fxG = Scene3D.scene.children.find(c => c.userData && c.userData.guillotineFx);
                if (fxG) bladeRef = fxG.children.find(c => c.isGroup) || null;
            }
            if (!bladeRef || !bladeRef.parent) { if (fired && t > impact) shots.push({ t, n: 0, y: null }); continue; }
            bladeRef.visible = false;
            const without = grab();
            bladeRef.visible = true;
            const withB = grab();
            let n = 0;
            for (let p = 0; p < withB.length; p += 4) {
                const d = Math.abs((0.299 * withB[p] + 0.587 * withB[p + 1] + 0.114 * withB[p + 2])
                    - (0.299 * without[p] + 0.587 * without[p + 1] + 0.114 * without[p + 2]));
                if (d >= 12) n++;                       // 칼날은 근흑이라 '밝아짐'이 아니라 '달라짐'으로 잡는다
            }
            shots.push({ t, n, y: +bladeRef.position.y.toFixed(3) });
        }
        VClock.restore();
        return { shots, impact, wait };
    }, { STEP_MS, N, SELFTEST });

    await browser.close();
    if (errors.length) { console.log('콘솔 에러 ' + errors.length + '건: ' + errors[0]); process.exit(2); }
    const after = res.shots.filter(s => s.t >= res.impact);
    if (!after.length) { console.log('절단 이후 표본이 0 — 자가 고장났다.'); process.exit(2); }

    console.log(`처형 칼날 퇴장 판정 — 절단 ${res.impact}ms (2박지연 ${res.wait} + ${res.impact - res.wait})${SELFTEST ? '  [--selftest]' : ''}`);
    for (const s of res.shots.filter(s => s.n > 0 || s.t >= res.impact))
        console.log(`  ${String(s.t).padStart(4)}ms  칼날 잉크 ${String(s.n).padStart(6)}화소  y=${s.y === null ? '(없음)' : s.y}${s.t === res.impact ? '   ← 절단' : ''}`);

    // ① 잔류: 절단 이후 잉크가 마지막으로 남아 있던 시각
    const lastInk = after.filter(s => s.n > 200).reduce((a, s) => Math.max(a, s.t), -1);
    const linger = lastInk < 0 ? 0 : lastInk - res.impact;
    // ② 되살아남: 절단 이후 잉크가 그때까지의 최저치보다 '규모 있게' 늘어난 구간
    const tol = Math.max(200, Math.round((after[0] ? after[0].n : 0) * REBOUND_FRAC));
    let rebound = 0, prev = Infinity;
    for (const s of after) { if (s.n - prev > tol) rebound++; prev = Math.min(prev, s.n); }
    const okLinger = linger <= LINGER_MAX_MS, okMono = rebound === 0;
    console.log(`\n  ${okLinger ? '✅' : '❌'} 절단 후 칼날 잔류 = ${linger}ms  (기준 ≤ ${LINGER_MAX_MS}ms)`);
    console.log(`  ${okMono ? '✅' : '❌'} 절단 후 잉크 되살아남 ${rebound}구간  (기준 0 · 문턱 ${tol}화소)`);
    if (okLinger && okMono) { console.log('통과: 칼날이 베고 나서 곧 거둬진다.'); process.exit(0); }
    console.log('불통과: 칼날이 벤 자리에 주차한다.');
    process.exit(1);
})();
