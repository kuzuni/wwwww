// 버프가 **걸려 있는 동안** 화면에 증거가 남는가 (slug: skill-fx ㉥)
//
// 비평가 2차 2인 일치 지적 ㉥: "**전투의 함성**: 510ms 이후 버프가 걸렸다는 시각 증거가 0
// (지속 오라 필요)".
//
// 실체(2026-08-20 3D 스트림 실측): `warCryShout` 은 **0.6초짜리 일회성 포효**다. 그런데 버프
// 자체는 `Combat.buffs` 에 `until = now + d.dur*1000` 으로 **8초** 산다. 즉 연출이 끝난 뒤
// **7.4초 동안 화면에는 아무 흔적도 없고**, 플레이어는 공격력이 올라 있다는 걸 숫자로만 안다.
// 이건 '연출이 약하다'가 아니라 **상태와 화면이 어긋난 것**이라 채점 이전의 문제다.
//
// 판정(오라 그룹을 껐다 켠 **차분**으로 잰다 — 배경·캐릭터를 빼고 오라만 센다):
//   ① 포효가 끝난 뒤(0.9초)에도 오라 잉크가 임계 이상이다.
//   ② 버프가 살아 있는 내내 유지된다(중간 표본에서도 임계 이상).
//   ③ 버프가 끝나면 사라진다(만료 1.2초 뒤 잉크 0).
//   ④ 오라 회전이 **프레임률 무관**하다 — 같은 가상 시간을 60fps/30fps 로 몰아 각도가 5% 이내.
//      (㉤ 에서 고친 rad/프레임 함정을 새 코드에 다시 들이지 않기 위한 못이다.)
//   ⑤ 콘솔 에러 0건.
//
// 🚨 **벽시계 대기로 표본을 잡으면 안 된다 — 이 판정기가 실제로 밟았다(2026-08-20).** 첫 판은
//    `setTimeout(900)` 뒤에 표본을 잡았는데, swiftshader 헤드리스는 3D 씬이 메인 스레드를 물고
//    있어 `page.evaluate` 왕복 하나가 **수 초**씩 걸린다. 실측: 내가 400ms 를 잔 사이 페이지의
//    `U.now()` 는 **4,370ms** 흘렀다 — 3초짜리 버프가 첫 표본 전에 이미 만료돼, 멀쩡한 오라가
//    '1.8초에 사라짐'으로 읽혔다(TODO 함정 ⑤ 와 같은 뿌리). → **벽시계에 아무것도 걸지 않는다.**
//    버프 수명은 넉넉히 두고, 표본은 `Scene3D.update` 를 **손으로 민 프레임 수**로 잡는다.
//    만료 축(③)도 기다리지 않고 `Combat.buffs` 를 직접 비워서 본다 — 오라의 계약이 '매 프레임
//    버프 상태를 읽는다'이므로, 상태를 지우는 게 곧 만료다.
// ⚠️ 다른 스킬이 자동 시전돼 다른 버프가 끼면 표본이 오염된다 — 측정 동안 `tryCast` 를 막는다.
//
// 사용: node probe-buff-aura.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const DUR_MS = 120000;   // 버프 수명은 넉넉히 — 이 판정기는 벽시계에 기대지 않는다(위 🚨)
const INK_MIN = 260;     // 오라로 인정할 최소 차분 화소

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX);
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof Scene3D !== "undefined" && !!Scene3D.scene && !!Scene3D.heroG').catch(() => false);
        if (ready) break;
        if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
        await new Promise(r => setTimeout(r, 500));
    }

    // ── 준비: 자동 시전을 막고, 전투의 함성 버프를 손으로 건다 ──────────────────────
    await page.evaluate(({ DUR_MS }) => {
        window.__auraProbe = {};
        Combat.tryCast = () => false;                    // 다른 버프가 끼지 않게
        Combat.buffs = [];
        const def = SKILL_DEFS.find(d => d.id === 'warCry');
        window.__auraProbe.def = def;
        Combat.buffs.push({ id: def.id, buff: { atkFlat: null }, until: U.now() + DUR_MS });
        Scene3D.skillEffect(def.fx, def.color, [], def);

        const cv = document.querySelector('canvas');
        const r = cv.getBoundingClientRect();
        const W = Math.round(r.width), H = Math.round(r.height);
        const off = document.createElement('canvas'); off.width = W; off.height = H;
        const ctx = off.getContext('2d');
        window.__auraProbe.ink = function () {
            const grab = () => {
                Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
                ctx.clearRect(0, 0, W, H); ctx.drawImage(cv, 0, 0, W, H);
                return ctx.getImageData(0, 0, W, H).data;
            };
            const g = Scene3D.buffAuraG;
            if (!g) return { ink: 0, alive: false, buffs: Combat.buffs.length, dead: !!Scene3D.heroDead };
            const vis = g.visible;
            g.visible = false; const without = grab();
            g.visible = vis; const withFx = grab();
            let ink = 0;
            for (let p = 0; p < withFx.length; p += 4) {
                const d = Math.abs((0.299 * withFx[p] + 0.587 * withFx[p + 1] + 0.114 * withFx[p + 2])
                    - (0.299 * without[p] + 0.587 * without[p + 1] + 0.114 * without[p + 2]));
                if (d >= 12) ink++;
            }
            return { ink, alive: true, buffs: Combat.buffs.length, dead: !!Scene3D.heroDead, k: Scene3D._buffAuraK };
        };
        window.__auraProbe.step = function (ms) {        // 벽시계 경과분을 애니에 먹인다
            const n = Math.max(1, Math.round(ms / 16.7));
            for (let i = 0; i < n; i++) Scene3D.update(1 / 60);
        };
    }, { DUR_MS });

    // 표본은 **민 프레임 수**로 잡는다(벽시계 금지 — 위 🚨). 0.9/1.8/2.7초분을 차례로 민다.
    const samples = [];
    for (const t of [900, 1800, 2700]) {
        await page.evaluate(ms => window.__auraProbe.step(ms), 900);
        samples.push({ t, ...(await page.evaluate(() => window.__auraProbe.ink())) });
    }
    // 만료 — 상태를 직접 지우고 1.5초분을 민다(오라는 매 프레임 `Combat.buffs` 를 읽는다)
    await page.evaluate(() => { Combat.buffs = []; window.__auraProbe.step(1500); });
    const after = { t: 'expired', ...(await page.evaluate(() => window.__auraProbe.ink())) };

    // ④ 프레임률 무관 — 오라 회전을 60fps/30fps 로 각각 몰아 비교
    const spin = await page.evaluate(() => {
        const def = SKILL_DEFS.find(d => d.id === 'warCry');
        function run(fps) {
            Combat.buffs = [{ id: def.id, buff: { atkFlat: null }, until: U.now() + 20000 }];
            for (let i = 0; i < 20; i++) Scene3D.update(1 / 60);      // 오라를 띄운다
            const g = Scene3D.buffAuraG;
            if (!g) return null;
            const a0 = g.rotation.y;
            const dt = 1 / fps, n = Math.round(0.6 * fps);
            for (let i = 0; i < n; i++) Scene3D.update(dt);
            const turn = Math.abs(g.rotation.y - a0);
            Combat.buffs = [];
            for (let i = 0; i < 90; i++) Scene3D.update(1 / 60);      // 정리
            return turn;
        }
        return { a: run(60), b: run(30) };
    });

    // ── 판정 ────────────────────────────────────────────────────────────────
    const live = samples.filter(s => s.ink >= INK_MIN).length;
    const drift = (spin && spin.a && spin.b) ? Math.abs(spin.a - spin.b) / Math.max(spin.a, spin.b, 1e-9) : 1;
    const checks = [
        ['① 포효가 끝난 뒤(0.9초)에도 오라가 화면에 있다', samples[0] && samples[0].ink >= INK_MIN,
            `0.9초 잉크 ${samples[0] ? samples[0].ink : '-'}화소 (기준 ≥${INK_MIN})`],
        ['② 버프가 살아 있는 내내 유지된다', live === samples.length,
            samples.map(s => `${s.t}ms:${s.ink}(버프${s.buffs}·사망${s.dead})`).join(' · ')],
        ['③ 버프가 끝나면 사라진다', after.ink === 0,
            `상태 제거 1.5초분 뒤 잉크 ${after.ink}화소 · 남은 버프 ${after.buffs === undefined ? '-' : after.buffs}개`],
        ['④ 오라 회전이 프레임률 무관하다(60fps↔30fps 5% 이내)', drift <= 0.05,
            spin && spin.a ? `60fps ${spin.a.toFixed(3)} rad · 30fps ${spin.b.toFixed(3)} rad · 편차 ${(drift * 100).toFixed(1)}%` : '오라 없음'],
        ['⑤ 콘솔 에러 0건', errors.length === 0, errors.slice(0, 3).join(' | ') || '없음'],
    ];
    console.log('버프 지속 오라 판정 (전투의 함성)');
    let pass = true;
    for (const [name, ok, detail] of checks) {
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
        if (!ok) pass = false;
    }
    await browser.close();
    console.log(pass ? '\nPASS' : '\nFAIL');
    process.exit(pass ? 0 : 1);
})();
