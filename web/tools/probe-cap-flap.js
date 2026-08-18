// probe-cap-flap.js — 버섯 갓 테두리 플랩이 **정말 테두리만 늦게 처지는지** 잰다 (enemy-quality ⓑ)
// 사용: node probe-cap-flap.js
//
// 왜: 갓은 원래 `capG.rotation.z` 로 통째로 기울기만 했다(딱딱한 모자). 우산 살처럼 보이려면
// ⑴ 꼭지는 거의 안 움직이고 ⑵ 테두리만 크게 처지며 ⑶ 그 처짐이 중심보다 **늦게** 와야 한다.
// 정지 캡처로는 셋 다 확인이 불가능하다 — 시간을 흘리며 정점을 직접 읽는다.
// (같은 계열 검사: 슬라임은 `probe-slime-jelly.js` — 저쪽은 높이축, 이쪽은 반지름축이다.)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const N = 24, DT = 0.05;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=mushroom', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const out = await page.evaluate(({ N, DT }) => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        Scene3D.clearEnemies();
        const e = { id: 0, x: Combat.MELEE_X + 3, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.heroAttack = () => {};
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(0);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.userData.landed = true;
        const F = m.anim && m.anim.capFlap;
        if (!F) return { err: 'anim.capFlap 없음 — 갓 플랩이 안 걸렸다' };

        const base = F.base, rMax = F.rMax;
        const band = (lo, hi) => {
            const idx = [];
            for (let i = 0; i < base.length; i += 3) {
                const t = Math.hypot(base[i], base[i + 2]) / rMax;
                if (t >= lo && t < hi) idx.push(i);
            }
            return idx;
        };
        const apex = band(0, 0.25), mid = band(0.45, 0.6), rim = band(0.9, 1.001);
        if (!apex.length || !rim.length) return { err: '표본 띠가 비었다(꼭지 ' + apex.length + ' 테두리 ' + rim.length + ')' };

        const pa = () => F.mesh.geometry.attributes.position.array;
        const dyOf = idx => {                    // 원본 대비 평균 y 변위
            const p = pa();
            let s = 0;
            for (const i of idx) s += p[i + 1] - base[i + 1];
            return s / idx.length;
        };
        const series = { apex: [], mid: [], rim: [], lip: [] };
        const lipPart = F.parts[0];
        for (let f = 0; f < N; f++) {
            Scene3D._clock = f * DT;
            Scene3D.driveCapFlap(m, Scene3D._clock, 0.035, 0);
            series.apex.push(dyOf(apex));
            series.mid.push(dyOf(mid));
            series.rim.push(dyOf(rim));
            series.lip.push(lipPart.o.position.y - lipPart.y);
        }
        return { series, nParts: F.parts.length, lag: F.lag, rMax };
    }, { N, DT });

    await browser.close();
    if (out.err) { console.error('실패: ' + out.err); process.exit(1); }
    const { series } = out;

    const rng = a => Math.max(...a) - Math.min(...a);
    const norm = a => { const mu = a.reduce((x, y) => x + y, 0) / a.length; return a.map(v => v - mu); };
    const corrAt = (a, b, k) => {
        const A = norm(a), B = norm(b);
        let s = 0, na = 0, nb = 0;
        for (let i = 0; i + k < A.length; i++) { s += A[i] * B[i + k]; na += A[i] * A[i]; nb += B[i + k] * B[i + k]; }
        return s / Math.sqrt((na || 1) * (nb || 1));
    };
    let bestK = 0, bestC = -2;
    for (let k = 0; k < 10; k++) { const c = corrAt(series.mid, series.rim, k); if (c > bestC) { bestC = c; bestK = k; } }

    let fail = 0;
    const ok = (c, msg, extra) => { if (!c) fail++; console.log(`${c ? '  OK  ' : ' FAIL '} ${msg}${extra !== undefined ? '  — ' + extra : ''}`); };

    console.log(`변위 진폭 — 꼭지 ${rng(series.apex).toFixed(5)} · 중간 ${rng(series.mid).toFixed(5)} · 테두리 ${rng(series.rim).toFixed(5)}`);
    console.log(`중간 대비 테두리 최적 지연 ${bestK} 프레임 (상관 ${bestC.toFixed(3)}) · lag ${out.lag} · rMax ${out.rMax.toFixed(3)}`);

    ok(rng(series.rim) > 0.02, '① 테두리가 실제로 처졌다 되돌아온다', rng(series.rim).toFixed(5));
    ok(rng(series.apex) < rng(series.rim) * 0.25, '② 꼭지는 거의 안 움직인다(통째 위아래 = 플랩이 아니다)',
        `꼭지 ${rng(series.apex).toFixed(5)} < 테두리의 25% ${(rng(series.rim) * 0.25).toFixed(5)}`);
    ok(bestK >= 1, '③ 테두리가 중간보다 **늦게** 처진다(강체 기울기면 0)', `${bestK}프레임`);
    ok(rng(series.lip) > 0.02, '④ 테두리 립이 갓과 같이 움직인다(갓이 두 조각으로 안 갈린다)', rng(series.lip).toFixed(5));
    ok(out.nParts >= 2, '⑤ 립·주름살을 추종 대상으로 잡았다', `${out.nParts}개`);

    console.log('콘솔 에러: ' + errors.length + (errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''));
    if (errors.length) fail++;
    console.log(fail === 0 ? '\nPASS — 갓 테두리가 우산 살처럼 늦게 처진다' : `\n반려 — ${fail}건`);
    process.exit(fail === 0 ? 0 : 1);
})();
