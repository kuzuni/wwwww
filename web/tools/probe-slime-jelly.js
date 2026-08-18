// probe-slime-jelly.js — 슬라임 젤리 웨이브가 **정말 파도인지** 잰다 (enemy-quality ⓑ)
// 사용: node probe-slime-jelly.js
//
// 왜: 예전 슬라임은 `body.scale.y/x` 를 통째로 흔드는 **강체 스케일**이었다. 그건 젤리가 아니라
// 크기가 변하는 풍선이고, 캡처 한 장으로는 새 코드와 구분이 안 된다(둘 다 '눌린 슬라임'으로 보인다).
// 구분되는 지점은 딱 하나 — **바닥과 정수리가 같은 위상으로 눌리는가, 늦게 따라오는가.**
//
// 재는 것 (한 페이지에서 시간을 수동으로 흘리며 정점을 직접 읽는다)
//  ① 위상 지연 — 바닥 띠와 정수리 띠의 세로 압축 시계열이 **몇 프레임 어긋나는가**. 0 이면 강체다.
//  ② 비강체성 — 높이별 압축률의 차이(최대−최소)가 유의미한가. 강체 스케일이면 전 높이가 같은 값이다.
//  ③ 부피 근사 보존 — 세로가 눌릴 때 가로가 부푸는가(눌렸는데 홀쭉하면 그냥 작아지는 것).
//  ④ 몸에 얹힌 부속(핵·눈·입)이 같이 따라오는가 — 안 따라오면 눌릴 때 얼굴이 몸 밖으로 빠진다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const N = 24;          // 표본 프레임 수
const DT = 0.055;      // 프레임 간 가상 시간(초)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=slime', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const out = await page.evaluate(({ N, DT }) => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        Scene3D.clearEnemies();
        const e = { id: 0, x: Combat.MELEE_X + 3, alive: true, hp: 100, maxHp: 100 }; // stopX 보다 멀리 = walking 상태
        Combat.enemies = [e];
        Scene3D.heroAttack = () => {};
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(0);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.userData.landed = true;
        const J = m.anim && m.anim.jelly;
        if (!J) return { err: 'anim.jelly 없음 — 젤리 웨이브가 안 걸렸다' };

        // 바닥 띠 / 정수리 띠의 대표 정점 인덱스(원본 높이 기준)
        const base = J.base, h = J.h;
        const bandIdx = (lo, hi) => {
            const idx = [];
            for (let i = 0; i < base.length; i += 3) {
                const t = base[i + 1] / h;
                if (t >= lo && t < hi) idx.push(i);
            }
            return idx;
        };
        const lowB = bandIdx(0.05, 0.2), midB = bandIdx(0.45, 0.6), topB = bandIdx(0.8, 0.98);
        if (!lowB.length || !topB.length) return { err: '표본 띠가 비었다' };

        const pa = () => J.mesh.geometry.attributes.position.array;
        // 띠의 평균 세로 압축률(현재y / 원본y)과 평균 가로 배율
        const bandRatio = (idx) => {
            const p = pa();
            let sy = 0, sr = 0, n = 0;
            for (const i of idx) {
                const by = base[i + 1];
                if (by < 1e-4) continue;
                sy += p[i + 1] / by;
                const br = Math.hypot(base[i], base[i + 2]);
                if (br > 1e-4) { sr += Math.hypot(p[i], p[i + 2]) / br; n++; }
            }
            const c = idx.length || 1;
            return { sy: sy / c, sr: n ? sr / n : 1 };
        };

        const series = { low: [], mid: [], top: [], lowR: [], core: [] };
        // 핵(가장 큰 follow 대상)의 y 를 같이 본다 — 부속 추종 검사
        const coreF = J.follow.length ? J.follow.reduce((a, b) => (Math.abs(b.y - 0.3) < Math.abs(a.y - 0.3) ? b : a)) : null;
        for (let f = 0; f < N; f++) {
            Scene3D._clock = f * DT;
            Scene3D.driveJelly(m, Scene3D._clock, 0.16, 0);
            const L = bandRatio(lowB), M = bandRatio(midB), T = bandRatio(topB);
            series.low.push(L.sy); series.lowR.push(L.sr);
            series.mid.push(M.sy); series.top.push(T.sy);
            if (coreF) series.core.push(coreF.o.position.y);
        }
        return { series, coreBaseY: coreF ? coreF.y : null, nFollow: J.follow.length, lag: J.lag };
    }, { N, DT });

    await browser.close();
    if (out.err) { console.error('실패: ' + out.err); process.exit(1); }

    const { series } = out;
    // ① 위상 지연 — 바닥 시계열을 k 프레임 밀었을 때 정수리와 가장 잘 맞는 k (정규화 상관)
    const norm = a => { const mu = a.reduce((x, y) => x + y, 0) / a.length; return a.map(v => v - mu); };
    const corrAt = (a, b, k) => {
        const A = norm(a), B = norm(b);
        let s = 0, na = 0, nb = 0;
        for (let i = 0; i + k < A.length; i++) { s += A[i] * B[i + k]; na += A[i] * A[i]; nb += B[i + k] * B[i + k]; }
        return s / Math.sqrt((na || 1) * (nb || 1));
    };
    let bestK = 0, bestC = -2;
    for (let k = 0; k < 10; k++) { const c = corrAt(series.low, series.top, k); if (c > bestC) { bestC = c; bestK = k; } }

    let fail = 0;
    const ok = (c, msg, extra) => { if (!c) fail++; console.log(`${c ? '  OK  ' : ' FAIL '} ${msg}${extra !== undefined ? '  — ' + extra : ''}`); };

    const rng = a => Math.max(...a) - Math.min(...a);
    console.log(`띠별 세로 압축 진폭 — 바닥 ${rng(series.low).toFixed(4)} · 중간 ${rng(series.mid).toFixed(4)} · 정수리 ${rng(series.top).toFixed(4)}`);
    console.log(`바닥 대비 정수리 최적 지연 ${bestK} 프레임 (상관 ${bestC.toFixed(3)}) · lag 파라미터 ${out.lag}`);

    ok(rng(series.low) > 0.02, '① 바닥이 실제로 눌린다', rng(series.low).toFixed(4));
    ok(bestK >= 1, '② 정수리가 바닥보다 **늦게** 눌린다(강체 스케일이면 0)', `${bestK}프레임`);
    // ③ 같은 프레임에서 높이별 압축률이 갈리는가 = 강체가 아니다
    let maxSpread = 0;
    for (let f = 0; f < series.low.length; f++) {
        maxSpread = Math.max(maxSpread, Math.abs(series.low[f] - series.top[f]));
    }
    ok(maxSpread > 0.03, '③ 같은 순간에 높이마다 압축률이 다르다(비강체)', maxSpread.toFixed(4));
    // ④ 세로가 가장 눌린 프레임에서 가로는 부풀어 있다
    const fMin = series.low.indexOf(Math.min(...series.low));
    ok(series.lowR[fMin] > 1.01, '④ 가장 눌린 순간 가로가 부푼다(부피 근사 보존)', `세로 ${series.low[fMin].toFixed(3)} · 가로 ${series.lowR[fMin].toFixed(3)}`);
    // ⑤ 부속 추종
    ok(out.nFollow > 0, '⑤ 몸에 얹힌 부속을 추종 대상으로 잡았다', `${out.nFollow}개`);
    if (series.core.length) ok(rng(series.core) > 0.002, '⑥ 핵이 몸을 따라 위아래로 움직인다', rng(series.core).toFixed(4));

    console.log('콘솔 에러: ' + errors.length + (errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''));
    if (errors.length) fail++;
    console.log(fail === 0 ? '\nPASS — 젤리 웨이브가 파도로 전파된다' : `\n반려 — ${fail}건`);
    process.exit(fail === 0 ? 0 : 1);
})();
