// 비평가 5차 최상위 지적 ⓐ("타격 스파크가 피격자가 아니라 **공격자 몸**에 붙어 있다", A #1 치명 · B #7) 교차검증.
// 사용: node probe-spark-anchor.js
//
// ⚠️ 이 지적의 근거는 두 채점자 모두 **휘도 임계값 군집**(R>245,G>235)의 centroid 였다. 그런데 이 게임의
//    영웅은 **은색 판금 갑옷**이라 평상시에도 near-white 이고, 지적이 말한 x 대역(322~412)이 정확히
//    영웅이 서 있는 자리다 — TODO '비평가 채점 함정 ②(겹친 요소 오인)'와 같은 계열일 수 있다.
//    그래서 휘도가 아니라 **실제로 생성된 파티클의 월드 좌표를 투영**해 어디에 붙었는지 잰다.
//
// 재는 것: 타격으로 새로 생긴 파티클(파편+불티)의 화면 bbox 를, 같은 프레임의 **적 bbox·영웅 bbox**와
//          나란히 놓고 겹침을 본다. 스파크가 적 실루엣 안/가장자리면 지적은 오지적이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    // ⚠️ waitForFunction 금지 — 페이지 안 폴링이 3D 렌더 프레임에 밀려 안 도는 컨테이너가 있다.
    //    게다가 '적이 살아 있다'를 밖에서 기다리면 **기다림과 evaluate 사이에 그 적이 죽어** 안에서
    //    `e` 가 undefined 가 된다(2026-08-19 실측: `Cannot read properties of undefined (reading 'id')`
    //    로 이 프로브가 통째로 죽어 있었다). 부팅만 밖에서 폴링하고, **적 확보는 evaluate 안에서
    //    전투를 먼저 멈춘 뒤** 한다.
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof Scene3D !== "undefined" && !!Scene3D.heroG && typeof Combat !== "undefined"').catch(() => false);
        if (ready) break;
        if (w > 900) throw new Error('부팅 대기 초과');
        await page.waitForTimeout(200);
    }

    const out = await page.evaluate(() => {
        Combat.tick = () => { };
        Scene3D.walking = false;
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (sec) => { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) real(1 / 120); };

        const cv = Scene3D.renderer.domElement, rect = cv.getBoundingClientRect();
        const proj = (v) => {
            const p = v.clone().project(Scene3D.camera);
            return [rect.left + (p.x * 0.5 + 0.5) * rect.width, rect.top + (0.5 - p.y * 0.5) * rect.height];
        };
        const boxOf = (obj) => {
            obj.updateWorldMatrix(true, true);
            const b = new THREE.Box3().setFromObject(obj);
            if (b.isEmpty()) return null;
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const xi of [b.min.x, b.max.x]) for (const yi of [b.min.y, b.max.y]) for (const zi of [b.min.z, b.max.z]) {
                const [px, py] = proj(new THREE.Vector3(xi, yi, zi));
                x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
            }
            return [x0, y0, x1, y1].map(v => +v.toFixed(1));
        };
        const partBox = (list) => {
            if (!list.length) return null;
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const p of list) { const [px, py] = proj(p.position); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
            return { box: [x0, y0, x1, y1].map(v => +v.toFixed(1)), n: list.length, cx: +((x0 + x1) / 2).toFixed(1), cy: +((y0 + y1) / 2).toFixed(1) };
        };

        // 전투를 이미 멈춘 뒤라 여기서 확보한 적은 측정 내내 살아 있다.
        // 살아 있는 적이 없으면(웨이브 사이 등) 하나 만들어 세운다 — 밖에서 기다리는 것보다 결정적이다.
        let e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
        if (!e) {
            Combat.setupStage();
            e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
        }
        if (!e) return { err: '살아 있는 적을 못 세웠다' };
        const m = Scene3D.enemyMap.get(e.id);
        const before = new Set(Scene3D.particles);
        Combat.damageEnemy(e, Big.of(140), false, null);
        const fresh = Scene3D.particles.filter(p => !before.has(p));   // 이 타격이 만든 파티클만

        const snap = (t) => {
            const alive = fresh.filter(p => Scene3D.particles.includes(p));
            return {
                t,
                spark: partBox(alive),
                enemy: boxOf(m.body || m.g),
                hero: boxOf(Scene3D.heroG),
            };
        };
        const res = [];
        step(0.016); res.push(snap(16));
        step(0.05); res.push(snap(66));
        return { res, freshCount: fresh.length };
    });

    const inside = (pt, b) => pt[0] >= b[0] && pt[0] <= b[2] && pt[1] >= b[1] && pt[1] <= b[3];
    console.log('\n타격으로 생성된 파티클 %d개 — 화면 bbox 를 적·영웅과 대조한다 (뷰포트 px)\n', out.freshCount);
    for (const r of out.res) {
        console.log('+%dms', r.t);
        console.log('  스파크 bbox=%s  중심=(%s, %s)  n=%d', JSON.stringify(r.spark.box), r.spark.cx, r.spark.cy, r.spark.n);
        console.log('  적    bbox=%s', JSON.stringify(r.enemy));
        console.log('  영웅  bbox=%s', JSON.stringify(r.hero));
        const c = [r.spark.cx, r.spark.cy];
        console.log('  → 스파크 중심이 적 안: %s / 영웅 안: %s', inside(c, r.enemy) ? 'YES' : 'no', inside(c, r.hero) ? 'YES' : 'no');
        const gap = r.enemy[0] - r.spark.box[2];   // 적 왼쪽 모서리 − 스파크 오른쪽 모서리
        console.log('  → 스파크 오른쪽 끝과 적 왼쪽 모서리 간격: %spx (음수면 겹쳐 있다 = 적에 붙어 있다)', gap.toFixed(1));
    }
    console.log('\n판정: 스파크 중심이 적 bbox 안이거나 간격이 음수면, "공격자 몸에 붙어 있다"는 지적은');
    console.log('      휘도 임계값이 영웅의 은색 갑옷을 함께 잡은 **오측정**이다 (함정 ② 계열).');
    console.log(errors.length ? '\nCONSOLE ERRORS: ' + errors.join(' | ') : '\n(no console errors)');
    await browser.close();
    process.exit(errors.length ? 1 : 0);
})();
