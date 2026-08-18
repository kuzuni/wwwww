// 잎 조형(비대칭 변형 + 버텍스 컬러 음영) 실측 — 사용: node probe-foliage-sculpt.js
// TODO '맵 프롭 퀄리티 업'(slug: map-props) 의 "단순 도형 티가 나는 프롭에 … 비대칭 변형/버텍스 컬러
// 음영" 검증. 적용 전 침엽수는 **정원뿔 3개**, 활엽수는 **정십이면체 2개**였다.
//
// 지표 4종:
//  ① 비대칭  — 정점의 반경이 한 값에 몰려 있으면 정다면체다. 반경 변동계수(sd/mean)로 잰다.
//  ② 개체차  — 나무마다 달라야 한다. ⚠️ 처음엔 **반경 프로파일의 상관계수**로 쟀는데 잘못된 자였다:
//              원뿔의 반경은 높이에 따라 줄어드는 게 지배적이라, 노이즈가 얼마나 다르든 두 원뿔의
//              상관은 자동으로 1에 가깝다(실측 0.9968 로 '복붙'이라 반려됐지만 실제로는 갈려 있었다).
//              **같은 자리 정점끼리의 반경 차이(RMS)를 평균 반경으로 정규화**해서 본다 — 기반 형상이
//              공통이든 말든 '노이즈가 실제로 다른가'만 남는다.
//  ③ 음영    — `color` 속성이 있고 위아래로 실제 기울기가 있어야 한다.
//  ④ 무결성  — 비인덱스 지오메트리에 **정점 인덱스 기준** 난수를 주면 중복 정점이 제각각 움직여
//              메시가 갈라진다. 같은 좌표에 있던 정점들이 변형 후에도 같은 자리인지 본다(구멍 검사).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CV_MIN = 0.055;    // 반경 변동계수 하한 — 정다면체는 0에 가깝다
const SHADE_MIN = 0.20;  // 버텍스 컬러 위아래 기울기 하한
const DIFF_MIN = 0.040;  // 개체 간 반경 RMS 차 / 평균반경 — 이보다 작으면 사실상 같은 메시

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForTimeout(1500);

    const res = await page.evaluate(() => {
        const out = { kinds: [], seams: 0, seamWorst: 0, drawGroups: 0 };
        const collect = (make, label) => {
            const metrics = [];
            for (let t = 0; t < 6; t++) {           // 나무 6그루
                const g = make();
                g.traverse(m => {
                    if (!m.isMesh || !m.material || !m.material.vertexColors) return;   // 잎 메시만
                    const pos = m.geometry.attributes.position, col = m.geometry.attributes.color;
                    if (!col) { metrics.push({ noColor: true }); return; }
                    const rs = [], ys = [], cs = [];
                    for (let i = 0; i < pos.count; i++) {
                        rs.push(Math.hypot(pos.getX(i), pos.getZ(i)));
                        ys.push(pos.getY(i));
                        cs.push(col.getX(i));
                    }
                    const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
                    const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rs.length);
                    // 음영 기울기: 위쪽 30% 정점의 평균 색 − 아래쪽 30%
                    const idx = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
                    const q = Math.max(1, Math.floor(idx.length * 0.3));
                    const loC = idx.slice(0, q).reduce((a, i) => a + cs[i], 0) / q;
                    const hiC = idx.slice(-q).reduce((a, i) => a + cs[i], 0) / q;
                    metrics.push({ cv: mean ? sd / mean : 0, shade: hiC - loC, prof: rs.slice(0, 60), n: pos.count });
                });
            }
            out.kinds.push({ label, metrics });
        };
        collect(() => Scene3D.makePine(1.2), 'pine');
        collect(() => Scene3D.makeRoundTree(1.2), 'roundTree');

        // ④ 무결성(구멍 검사) — 변형 **전**에 같은 자리에 있던 정점들이 변형 **후**에도 한 점인가.
        // 비인덱스 지오메트리는 같은 모서리의 정점이 여러 벌 중복돼 있어서, 변위를 정점 인덱스로 뽑으면
        // 사본들이 제각각 움직여 메시가 갈라진다. 여기서 직접 재현해 확인한다.
        {
            const ref = new THREE.ConeGeometry(0.6, 0.7, 7).toNonIndexed();
            const rp = ref.attributes.position;
            const groups = new Map();
            for (let i = 0; i < rp.count; i++) {
                const k = Math.round(rp.getX(i) * 1e4) + ',' + Math.round(rp.getY(i) * 1e4) + ',' + Math.round(rp.getZ(i) * 1e4);
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k).push(i);
            }
            const sc = Scene3D.sculptFoliage(new THREE.ConeGeometry(0.6, 0.7, 7), { amp: 0.16, seed: 12.5 });
            const sp = sc.attributes.position;
            let worst = 0, split = 0, shared = 0;
            for (const idxs of groups.values()) {
                if (idxs.length < 2) continue;
                shared++;
                for (let a2 = 1; a2 < idxs.length; a2++) {
                    const d = Math.hypot(
                        sp.getX(idxs[0]) - sp.getX(idxs[a2]),
                        sp.getY(idxs[0]) - sp.getY(idxs[a2]),
                        sp.getZ(idxs[0]) - sp.getZ(idxs[a2]));
                    if (d > worst) worst = d;
                    if (d > 1e-6) { split++; break; }
                }
            }
            out.seam = { sharedGroups: shared, split, worst };
        }
        return out;
    });

    // 같은 자리 정점끼리의 반경 차이(RMS)를 평균 반경으로 정규화 — 위 ② 참고
    const rmsDiff = (a, b) => {
        const n = Math.min(a.length, b.length);
        if (n < 4) return 1;
        let s2 = 0, m = 0;
        for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s2 += d * d; m += a[i]; }
        m /= n;
        return m ? Math.sqrt(s2 / n) / m : 1;
    };

    const fails = [];
    for (const k of res.kinds) {
        const ms = k.metrics.filter(m => !m.noColor);
        if (k.metrics.some(m => m.noColor)) fails.push(`${k.label}: color 속성 없는 잎 메시 — vertexColors 재질인데 속성이 없으면 검게 찍힌다`);
        if (!ms.length) { fails.push(`${k.label}: 잎 메시를 하나도 못 찾았다`); continue; }
        const cvMin = Math.min.apply(null, ms.map(m => m.cv));
        const shMin = Math.min.apply(null, ms.map(m => m.shade));
        let dMin = Infinity, pairs = 0;
        for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
            if (ms[i].n !== ms[j].n) continue;              // 크기가 다른 단은 비교 대상이 아니다
            dMin = Math.min(dMin, rmsDiff(ms[i].prof, ms[j].prof));
            pairs++;
        }
        if (!pairs) dMin = 0;
        console.log(`${k.label.padEnd(10)} 잎메시 ${String(ms.length).padStart(2)}  반경변동계수 min ${cvMin.toFixed(4)}  음영기울기 min ${shMin.toFixed(3)}  개체간 최소차 ${dMin.toFixed(4)} (${pairs}쌍)`);
        if (cvMin < CV_MIN) fails.push(`${k.label}: 반경 변동계수 ${cvMin.toFixed(4)} < ${CV_MIN} — 아직 정다면체다`);
        if (shMin < SHADE_MIN) fails.push(`${k.label}: 음영 기울기 ${shMin.toFixed(3)} < ${SHADE_MIN} — 버텍스 컬러가 평평하다`);
        if (dMin < DIFF_MIN) fails.push(`${k.label}: 개체 간 최소차 ${dMin.toFixed(4)} < ${DIFF_MIN} — 나무가 복붙이다`);
    }
    const sm = res.seam || {};
    console.log(`무결성     공유정점군 ${sm.sharedGroups}  갈라진 군 ${sm.split}  최대 벌어짐 ${(sm.worst || 0).toExponential(2)}`);
    if (sm.split) fails.push(`변형 후 정점이 갈라진 공유군 ${sm.split}개(최대 ${sm.worst.toFixed(5)}) — 메시에 구멍이 뚫린다`);
    console.log(`콘솔 에러 ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 4).join('\n'));
    console.log(fails.length ? '\n반려 —\n  ' + fails.join('\n  ') : `\nPASS — 비대칭 ≥ ${CV_MIN} · 음영 ≥ ${SHADE_MIN} · 개체 간 차 ≥ ${DIFF_MIN}`);
    await browser.close();
    process.exit(fails.length || errors.length ? 1 : 0);
})();
