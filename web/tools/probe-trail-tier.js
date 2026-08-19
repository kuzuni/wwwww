// 무기 궤적 트레일이 **타격 티어에 따라 갈리는가** (hp-juicy 7차 잔여 ㉲)
// 사용: node tools/probe-trail-tier.js   (종료코드 0 = 통과)
//
// 배경: 7차 비평가 A #6 이 "140 과 10k 가 같은 트레일"이라고 했다. 사실이었다 — 트레일은
// **스윙 시작**에 무기 시대색으로 켜지는데 그 시점엔 이번 타격이 얼마짜리인지 아직 안 정해진다
// (피해는 0.16초 뒤 접촉에서 굴린다). 그래서 접촉 순간에 남은 리본을 **소급해서** 티어 색으로
// 갈아타게 했고(`trailImpact`), 이 도구가 그 위계를 잰다.
//
// 지표는 `probe-hit-hierarchy` 와 **같은 두 축**이다(한 화면에서 같은 사다리로 읽혀야 하므로):
//   lum  = 리본 화소 평균 휘도 · warm = 리본 화소 평균 R-B
// 판정: 세 티어가 **쌍마다** 둘 중 한 축에서 최소 격차 이상 갈릴 것.
//
// 🚨 하네스 규약:
// ① **자 점검 먼저** — 리본을 껐다 켜면 그 영역이 변하는가. 안 변하면(스윙이 이미 끝났거나
//    트레일이 화면 밖이면) 어떤 판정도 하지 않는다. 이 저장소는 '연출이 안 뜬다'는 유령 결과를
//    여기서 여러 번 봤다.
// ② 리본만 **참조로** 쥔다(`Scene3D.trailMesh`) — 타입으로 찾으면 같은 프레임의 플레어·파편이 섞인다.
// ③ 프레임은 직접 돌린다. 소프트 렌더는 한 프레임에 0.1초가 지나 연출이 통째로 끝난다.
// ④ 스윙은 **실제 경로**(`Scene3D.heroAttack` → `Combat.damageEnemy`)로 낸다 — 인자를 손으로 베끼면
//    코드가 준 티어가 아니라 옛 값을 재게 된다(함정 ④⑴).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const LUM_MIN = 0.012;   // 쌍별 휘도차 하한
const WARM_MIN = 12;     // 쌍별 온기(R-B, 0~255) 차 하한

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(({ LUM_MIN, WARM_MIN }) => {
        const out = { lines: [], ok: true, nums: {} };
        const say = (c, m) => { out.lines.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) out.ok = false; };
        const note = m => out.lines.push('  · ' + m);

        Combat.tick = () => {};
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => {};
        const step = t => { const n = Math.max(1, Math.round(t * 120)); for (let i = 0; i < n; i++) real(1 / 120); };

        const cw = Scene3D.renderer.domElement.width, ch = Scene3D.renderer.domElement.height;
        const gl = Scene3D.renderer.getContext();
        const rect = { x: 0, y: 0, w: cw, h: ch };   // 리본은 스윙 궤적을 따라 넓게 퍼진다 — 화면 전체에서 차분으로 쥔다
        const read = () => {
            Scene3D.renderFrame();
            const b = new Uint8Array(rect.w * rect.h * 4);
            gl.readPixels(0, 0, rect.w, rect.h, gl.RGBA, gl.UNSIGNED_BYTE, b);
            return b;
        };
        // 리본 화소 = '트레일 메시를 숨기면 달라지는 화소'
        const ribbonStats = () => {
            if (!Scene3D.trailMesh || !Scene3D.trailMesh.visible) return null;
            const on = read();
            Scene3D.trailMesh.visible = false;
            const off = read();
            Scene3D.trailMesh.visible = true;
            let n = 0, lum = 0, warm = 0;
            for (let i = 0; i < rect.w * rect.h; i++) {
                const dr = on[i * 4] - off[i * 4], dg = on[i * 4 + 1] - off[i * 4 + 1], db = on[i * 4 + 2] - off[i * 4 + 2];
                if (Math.sqrt(dr * dr + dg * dg + db * db) <= 18) continue;
                n++;
                lum += (0.299 * on[i * 4] + 0.587 * on[i * 4 + 1] + 0.114 * on[i * 4 + 2]) / 255;
                warm += on[i * 4] - on[i * 4 + 2];
            }
            return n ? { n, lum: lum / n, warm: warm / n } : null;
        };

        const setup = () => {
            Scene3D.clearEnemies();
            const e = { id: 901, x: Combat.MELEE_X, alive: true, hp: Big.of(100000), maxHp: Big.of(100000), isBoss: false, kind: 'goblin' };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(901);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
            Scene3D.anims = [];
            Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
            Scene3D.particles.length = 0;
            m.g.position.set(e.x + Scene3D.worldX, 0, 0);
            m.g.userData.landed = true;
            Combat.phase = 'fight';
            Scene3D.fxLayer.innerHTML = '';
            step(0.016);
            return e;
        };

        // 한 티어를 실제 경로로 내고 접촉 직후 리본을 잰다
        const tierStats = (amount, crit, kill) => {
            const e = setup();
            if (kill) e.hp = Big.of(1);
            Scene3D.heroAttack(901);
            step(0.16);                                   // 검 임팩트 시점
            Combat.damageEnemy(e, Big.of(amount), crit, null);
            step(0.016);                                  // 접촉 프레임
            return ribbonStats();
        };

        const N = tierStats(140, false, false);
        if (!N) { say(false, '자 점검: 일반 타격에서 리본 화소를 못 잡았다(스윙이 이미 끝났거나 트레일이 화면 밖)'); Scene3D.update = real; return out; }
        say(N.n > 90, `자 점검: 리본을 껐다 켜면 영역이 변한다 (일반 리본 화소 ${N.n} > 90)`);
        if (!out.ok) { Scene3D.update = real; return out; }
        const C = tierStats(320, true, false);
        const K = tierStats(99999, true, true);
        if (!C || !K) { say(false, '크리/처치 리본 화소를 못 잡았다'); Scene3D.update = real; return out; }

        for (const [nm, v] of [['일반', N], ['크리', C], ['처치', K]])
            note(`${nm}: 리본 ${v.n}px · 휘도 ${v.lum.toFixed(4)} · 온기(R-B) ${v.warm.toFixed(1)}`);
        out.nums = {
            normal: { n: N.n, lum: +N.lum.toFixed(4), warm: +N.warm.toFixed(1) },
            crit: { n: C.n, lum: +C.lum.toFixed(4), warm: +C.warm.toFixed(1) },
            kill: { n: K.n, lum: +K.lum.toFixed(4), warm: +K.warm.toFixed(1) },
        };
        const pair = (an, a, bn, b) => {
            const dl = Math.abs(a.lum - b.lum), dw = Math.abs(a.warm - b.warm);
            say(dl >= LUM_MIN || dw >= WARM_MIN, `${an} ↔ ${bn}: 휘도차 ${dl.toFixed(4)} · 온기차 ${dw.toFixed(1)} (둘 중 하나가 ${LUM_MIN}/${WARM_MIN} 이상)`);
        };
        pair('일반', N, '크리', C);
        pair('크리', C, '처치', K);
        pair('일반', N, '처치', K);
        // 색 사다리 방향 — 몸 플래시·데미지 숫자와 같은 언어여야 한다(청백 < 주황)
        say(C.warm > N.warm, `ⓐ 크리 리본이 일반보다 따뜻하다 (${C.warm.toFixed(1)} > ${N.warm.toFixed(1)})`);

        // 누수: 다음 스윙이 티어 색을 물려받으면 안 된다(한 번 크리를 내면 모든 스윙이 크리처럼 보인다)
        setup();
        Scene3D.heroAttack(901);
        step(0.05);
        const u = Scene3D.trailMat.uniforms;
        out.nums.afterSwingGain = +u.uGain.value.toFixed(3);
        say(Math.abs(u.uGain.value - 1) < 0.01 && Math.abs(u.uCore.value - 0.35) < 0.01,
            `ⓑ 다음 스윙이 티어 증폭을 물려받지 않는다 (uGain ${u.uGain.value.toFixed(3)} · uCore ${u.uCore.value.toFixed(3)})`);

        Scene3D.update = real;
        return out;
    }, { LUM_MIN, WARM_MIN });

    for (const l of r.lines) console.log(l);
    if (r.nums) console.log('nums=' + JSON.stringify(r.nums));
    if (errors.length) { console.log('FAIL 콘솔 에러 ' + errors.length + '건'); errors.slice(0, 5).forEach(e => console.log('  ! ' + e)); }
    await browser.close();
    process.exit(r.ok && !errors.length ? 0 : 1);
})();
