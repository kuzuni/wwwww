// 초신성의 '숨 끊김'과 '화면 태우기'를 재는 자 (slug: skill-fx)
// 사용: node probe-nova-beat.js            (초신성 nova)
//       node probe-nova-beat.js --selftest (음성 대조 — 교정 전 붕괴/폭발 값으로 되돌려 FAIL 이 나야 한다)
//
// 왜 — 2차 비평가 2인이 **일치로** 지적한 둘이다.
//   ㉠ "660~750ms 에 코어가 소멸해 **빈 프레임**이 난다 / 720ms 에는 화면에 아무것도 없다" —
//      붕괴 단계가 `s = max(0.06, 1-k)` 로 코어를 사실상 0 까지 조여 스킬이 취소된 것처럼 보인다.
//      원신은 폭발 직전 코어를 죽이지 않는다: 최소 크기에서 **밝기를 더 올리며 홀드**해 긴장을 만든다.
//   ㉡ "폭발 구체가 하드엣지 **순백**이라 화면 절반을 240ms 간 지운다" — 화염구와 **같은 기전**이다
//      (가산 + DoubleSide 라 밝은 배경 위에서 세 채널이 전부 1.0 으로 클리핑된다).
//
// 판정(둘 다 통과해야 exit 0):
//   ① 숨 끊김 없음 = 시전~폭발 사이 연출 잉크가 BLANK_MIN 화소 밑으로 떨어지는 컷이 없을 것
//   ② 화면 태우기 = 순백(세 채널 ≥ 235) 화소가 화면의 WHITE_MAX 를 넘는 컷이 WHITE_FRAMES 컷 이하
// ⚠️ ①은 **연출만** 센다(연출 그룹을 끄고/켜고 두 번 렌더해 차분) — 배경·적이 섞이면 '빈 프레임'이
//    영원히 안 잡힌다. ②는 반대로 **화면 전체**로 센다(플레이어가 보는 건 화면이다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { VCLOCK_SRC } = require('./virtual-clock.js');
const SELFTEST = process.argv.includes('--selftest');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const BLANK_MIN = 600, WHITE_MAX = 0.25, WHITE_FRAMES = 2;
const STEP_MS = 30, N = 48;          // 0~1410ms

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

        // 음성 대조: 교정 전 값으로 되돌린다(코어를 0 까지 조이고, 폭발 껍질을 순백 가산으로).
        // ⚠️ **교정 전 값을 하나라도 빠뜨리면 음성 대조가 조용히 통과한다** — 2026-08-20 실측으로
        //    실제로 그랬다. 붕괴 바닥(`NOVA_SQUEEZE_MIN`)만 되돌려 놓고 그 뒤에 들어온 두 교정
        //    (충전 코로나 · 폭발을 붙잡은 크기에서 시작)을 안 되돌리니, 코어를 0 까지 조여도
        //    코로나가 프레임을 채워 `빈 컷 0개` 로 **통과**했다. 새 교정을 넣는 세션은 그 되돌림도
        //    반드시 여기 한 줄로 같이 넣을 것 — 안 그러면 이 판정기는 자기가 못 잡는 걸 모른다.
        if (SELFTEST) {
            Scene3D.NOVA_SQUEEZE_MIN = 0.06; Scene3D.NOVA_SHELL_ADDITIVE = true; Scene3D.NOVA_SHELL_ALPHA = 0.8;
            Scene3D.NOVA_CORONA_ALPHA = 0; Scene3D.NOVA_BLAST_FROM_HOLD = false;
        }

        const def = SKILL_DEFS.find(d => d.fx === 'nova');
        const tier = Scene3D.skillTier(def), col = new THREE.Color(def.color);
        const wait = Scene3D.castMsFor(def.fx, tier);
        const impact = wait + Scene3D.NOVA_IMPACT_MS;

        const cv = document.querySelector('canvas');
        const r = cv.getBoundingClientRect();
        const W = Math.round(r.width), H = Math.round(r.height);
        const off = document.createElement('canvas'); off.width = W; off.height = H;
        const ctx = off.getContext('2d');
        const grab = () => { Scene3D.renderer.render(Scene3D.scene, Scene3D.camera); ctx.clearRect(0, 0, W, H); ctx.drawImage(cv, 0, 0, W, H); return ctx.getImageData(0, 0, W, H).data; };
        const px = W * H;

        VClock.install();
        Scene3D.skillCastBeat(col, def.fx, tier);
        let fired = false;
        const shots = [];
        for (let i = 1; i < N; i++) {
            const t = i * STEP_MS;
            VClock.pump(t);
            if (!fired && t >= wait) { fired = true; Scene3D.skillPayload(def.fx, col, [999], tier); VClock.pump(t); }
            realUpdate(STEP_MS / 1000);
            const fxG = Scene3D.scene.children.find(c => c.userData && c.userData.novaFx);
            if (fxG) fxG.visible = false;
            const without = grab();
            if (fxG) fxG.visible = true;
            const withFx = grab();
            let ink = 0, white = 0;
            for (let p = 0; p < withFx.length; p += 4) {
                const d = Math.abs((0.299 * withFx[p] + 0.587 * withFx[p + 1] + 0.114 * withFx[p + 2])
                    - (0.299 * without[p] + 0.587 * without[p + 1] + 0.114 * without[p + 2]));
                if (d >= 12) ink++;
                if (withFx[p] >= 235 && withFx[p + 1] >= 235 && withFx[p + 2] >= 235) white++;
            }
            shots.push({ t, ink, white: white / px, alive: !!fxG });
        }
        VClock.restore();
        return { shots, impact, wait };
    }, { STEP_MS, N, SELFTEST });

    await browser.close();
    if (errors.length) { console.log('콘솔 에러 ' + errors.length + '건: ' + errors[0]); process.exit(2); }

    console.log(`초신성 박자 판정 — 2박지연 ${res.wait}ms · 폭발 ${res.impact}ms${SELFTEST ? '  [--selftest]' : ''}`);
    for (const s of res.shots.filter(s => s.alive))
        console.log(`  ${String(s.t).padStart(4)}ms  연출 잉크 ${String(s.ink).padStart(6)}화소  순백 ${(s.white * 100).toFixed(1)}%${s.t === res.impact ? '   ← 폭발' : ''}`);

    // ① 숨 끊김 — 연출이 살아 있는 동안(그룹이 씬에 있고 폭발 전) 잉크가 바닥나는 컷
    const span = res.shots.filter(s => s.alive && s.t >= res.wait && s.t <= res.impact);
    const blanks = span.filter(s => s.ink < BLANK_MIN);
    // ② 화면 태우기
    const burn = res.shots.filter(s => s.white > WHITE_MAX);
    const okBlank = blanks.length === 0, okBurn = burn.length <= WHITE_FRAMES;
    console.log(`\n  ${okBlank ? '✅' : '❌'} 시전~폭발 사이 빈 컷 ${blanks.length}개${blanks.length ? ' (' + blanks.map(s => s.t + 'ms').join(', ') + ')' : ''}  (기준 0 · 문턱 ${BLANK_MIN}화소)`);
    console.log(`  ${okBurn ? '✅' : '❌'} 순백이 화면 ${WHITE_MAX * 100}% 를 넘는 컷 ${burn.length}개  (기준 ≤ ${WHITE_FRAMES}컷 = ${WHITE_FRAMES * STEP_MS}ms)` + (burn.length ? ` · 최대 ${(Math.max(...burn.map(s => s.white)) * 100).toFixed(1)}%` : ''));
    if (okBlank && okBurn) { console.log('통과: 숨이 안 끊기고 화면도 안 탄다.'); process.exit(0); }
    console.log('불통과.');
    process.exit(1);
})();
