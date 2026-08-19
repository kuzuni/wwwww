// 신의 창 광륜이 '화면에 떠 있는 동안 계속 도는가'를 재는 자 (slug: skill-fx)
// 사용: node probe-halo-spin.js            (신의 창 spear)
//       node probe-halo-spin.js --selftest (음성 대조 — 개천 이후 회전을 끄면 반드시 FAIL)
//
// 왜 — 2차 비평가 2인이 **일치로** "하늘 원반이 240ms 부터 끝까지 정지해 있다 / 배경에 붙은
// 스티커"라고 적었다. 실측해 보니 **지적의 절반은 틀렸다**: 광륜은 팝인하지 않고(불투명도
// 0.2→0.85 · 스케일 0.618→1.0 으로 램프인) 착탄 뒤 실제로 감쇠한다(0.85→0.155).
// 하지만 절반은 맞았다 — `rotation.z` 를 **개천 단계에서만** 돌려서 570ms 에 0.72 로 얼어붙고
// 그 뒤 **600ms 동안 한 번도 안 돈다**. 크기·밝기는 변하는데 문양이 안 도니 '정지'로 읽힌다.
// (저장소 규칙 ㉠: 지적이 실재하는지 · 지목한 대상이 맞는지 · 촬영 구멍인지를 먼저 물을 것.
//  여기서는 '실재하지만 대상이 절반만 맞은' 사례라 **회전축만** 고쳤다.)
//
// 판정: 광륜이 보이는(불투명도 ≥ VISIBLE_OP) 동안, 회전이 STALL_MAX_MS 넘게 멈춰 있으면 안 된다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { VCLOCK_SRC } = require('./virtual-clock.js');
const SELFTEST = process.argv.includes('--selftest');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const VISIBLE_OP = 0.12, STALL_MAX_MS = 90, EPS = 0.004;
const STEP_MS = 30, N = 50;

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
        Combat.tick = () => { }; Scene3D.walking = false; Scene3D.heroAttack = () => { };
        Scene3D.clearEnemies();
        const e = { id: 999, x: Combat.MELEE_X + 0.9, alive: true, hp: 1e9, maxHp: 1e9 };
        Combat.enemies = [e]; Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        m.g.position.x = e.x + Scene3D.worldX; m.g.position.y = 0; m.g.userData.landed = true;
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (x) { } }
        Scene3D.anims = [];
        const realUpdate = Scene3D.update.bind(Scene3D);
        if (SELFTEST) Scene3D.GODSPEAR_SPIN_AFTER = false;   // 교정 전 = 개천 단계에서만 회전

        const def = SKILL_DEFS.find(d => d.fx === 'spear');
        const tier = Scene3D.skillTier(def), col = new THREE.Color(def.color);
        const wait = Scene3D.castMsFor(def.fx, tier);
        VClock.install();
        Scene3D.skillCastBeat(col, def.fx, tier);
        let fired = false; const rows = [];
        for (let i = 1; i < N; i++) {
            const t = i * STEP_MS;
            VClock.pump(t);
            if (!fired && t >= wait) { fired = true; Scene3D.skillPayload(def.fx, col, [999], tier); VClock.pump(t); }
            realUpdate(STEP_MS / 1000);
            const g = Scene3D.scene.children.find(c => c.userData && c.userData.godspearFx);
            if (!g) { rows.push({ t, op: null }); continue; }
            const halo = g.children[0];
            rows.push({ t, op: +halo.material.opacity.toFixed(4), rot: +halo.rotation.z.toFixed(4), sc: +halo.scale.x.toFixed(4) });
        }
        VClock.restore();
        return { rows, wait };
    }, { STEP_MS, N, SELFTEST });

    await browser.close();
    if (errors.length) { console.log('콘솔 에러 ' + errors.length + '건: ' + errors[0]); process.exit(2); }

    const vis = res.rows.filter(r => r.op !== null && r.op >= VISIBLE_OP);
    if (vis.length < 4) { console.log('광륜이 보이는 컷이 거의 없다 — 자가 고장났다.'); process.exit(2); }
    console.log(`신의 창 광륜 회전 판정 — 2박지연 ${res.wait}ms${SELFTEST ? '  [--selftest: 개천 이후 회전 끔]' : ''}`);
    let stallRun = 0, worstStall = 0, stallFrom = null, worstFrom = null;
    for (let i = 1; i < vis.length; i++) {
        const d = Math.abs(vis[i].rot - vis[i - 1].rot);
        const gap = vis[i].t - vis[i - 1].t;
        if (d < EPS) { if (stallRun === 0) stallFrom = vis[i - 1].t; stallRun += gap; if (stallRun > worstStall) { worstStall = stallRun; worstFrom = stallFrom; } }
        else stallRun = 0;
        console.log(`  ${String(vis[i].t).padStart(4)}ms  불투명 ${vis[i].op.toFixed(3)}  회전 ${vis[i].rot.toFixed(3)}  (Δ${d.toFixed(4)})${d < EPS ? '  ← 멈춤' : ''}`);
    }
    const ok = worstStall <= STALL_MAX_MS;
    console.log(`\n  ${ok ? '✅' : '❌'} 광륜이 보이는 동안 최장 회전 정지 = ${worstStall}ms${worstFrom !== null && worstStall ? ` (${worstFrom}ms 부터)` : ''}  (기준 ≤ ${STALL_MAX_MS}ms)`);
    if (ok) { console.log('통과: 개천이 닫힐 때까지 계속 돈다.'); process.exit(0); }
    console.log('불통과: 광륜이 화면에 떠 있는 채로 얼어붙는다.');
    process.exit(1);
})();
