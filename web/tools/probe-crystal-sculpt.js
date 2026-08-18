// 크리스탈 조형(육방 기둥 + 종단 뿔) 실측 — 사용: node probe-crystal-sculpt.js
// TODO '맵 프롭 퀄리티 업'(slug: map-props) 의 "구조물·크리스탈 계열 조형" 검증.
// 적용 전 `makeCrystal` 은 **ConeGeometry(r, h, 5) 3개**였다 — 밑동에서 꼭짓점까지 한 번에 좁아지는
// 고깔이라 어떤 발광을 걸어도 '죽창'으로 읽혔다.
//
// 지표 6종 — 전부 **굽힌 정점에서 되뽑는다**(의도값을 그대로 읽어 오면 자기 자신을 검사하는 꼴이다).
//  ① 기둥성  — 결정은 어깨까지 **곧게 오른다**. 높이 45% 지점 반경 / 5% 지점 반경.
//              정원뿔이면 자동으로 ≈0.61 이 나온다(1-0.45)/(1-0.05). 기둥이면 0.85 언저리.
//  ② 단면 비대칭 — 정육각형이면 또 다른 정다면체다. 밑동 링 반경의 변동계수(sd/mean).
//  ③ 음영 기울기 — `color` 속성의 위아래 차(위 30% 평균 − 아래 30% 평균).
//  ④ 면 변주  — 같은 높이대의 정점끼리도 색이 갈려야 '깎인 면'으로 읽힌다. 밑동 링 색의 sd.
//  ⑤ 법선 방향 — 감기 방향을 뒤집으면 옆면이 통째로 컬링돼 결정이 **뚫려** 보인다.
//              기둥 구간 삼각형의 면 법선이 축에서 바깥을 보는지(dot > 0) 전수 검사.
//  ⑥ 개체차  — 클러스터마다 달라야 한다. 같은 순번 결정끼리 반경 프로파일 RMS 차 / 평균반경.
//              (⚠️ 상관계수로 재지 말 것 — 기반 형상이 공통이면 노이즈가 달라도 1에 가깝게 나온다.
//               `probe-foliage-sculpt.js` 에서 값 주고 배운 함정이다.)
// + 드로우콜: 클러스터당 crystalMat 메시 개수(교체 전 3 → 후 1 이어야 한다. 결정은 6개로 늘었다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const COL_MIN = 0.70;    // ① 기둥성 하한 — 정원뿔은 0.61
const CV_MIN = 0.06;     // ② 단면 반경 변동계수 하한 — 정육각형은 0
const SHADE_MIN = 0.20;  // ③ 음영 기울기 하한
const FACET_MIN = 0.012; // ④ 면 변주(밑동 링 색 sd) 하한
const DIFF_MIN = 0.040;  // ⑥ 개체 간 반경 RMS 차 / 평균반경

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForTimeout(1200);

    const res = await page.evaluate(() => {
        const out = { clusters: [], meshCount: [], noColor: 0 };
        // 드로우콜 — 클러스터 하나가 crystalMat 메시 몇 개로 그려지는가
        for (let t = 0; t < 3; t++) {
            const g = Scene3D.makeCrystal(1.2);
            let n = 0;
            g.traverse(o => { if (o.isMesh && o.material === Scene3D.crystalMat) n++; });
            out.meshCount.push(n);
        }
        for (let t = 0; t < 5; t++) {                 // 클러스터 5개
            const geo = Scene3D.crystalGeo(1.2);
            const pos = geo.attributes.position, col = geo.attributes.color;
            if (!col) { out.noColor++; continue; }
            const parts = [];
            for (const p of geo.userData.parts) {
                // 배치 행렬을 되돌려 **결정 자신의 축** 기준으로 잰다(기울여 심은 파편도 같은 자로 본다)
                const inv = new THREE.Matrix4().fromArray(p.mat).invert();
                const v = new THREE.Vector3();
                const ys = [], rs = [], cs = [], loc = [];
                for (let i = p.start; i < p.start + p.count; i++) {
                    v.fromBufferAttribute(pos, i).applyMatrix4(inv);
                    loc.push(v.x, v.y, v.z);
                    ys.push(v.y); rs.push(Math.hypot(v.x, v.z)); cs.push(col.getX(i));
                }
                // ① 기둥성 — 특정 높이의 **표면 반경**. ⚠️ '그 높이대의 정점 평균'으로 재면 안 된다:
                //    기둥은 밑동 링과 어깨 링 사이에 정점이 아예 없어 중간 높이 표본이 0개가 된다
                //    (첫 판이 이걸로 0.000 을 뱉었다). 삼각형 모서리를 y=목표 평면과 잘라 반경을 뽑는다.
                const radiusAt = y => {
                    const hit = [];
                    for (let i = 0; i < loc.length / 9; i++) {
                        const o = i * 9;
                        const P = [[loc[o], loc[o + 1], loc[o + 2]], [loc[o + 3], loc[o + 4], loc[o + 5]], [loc[o + 6], loc[o + 7], loc[o + 8]]];
                        for (let a = 0; a < 3; a++) {
                            const A = P[a], B = P[(a + 1) % 3];
                            if ((A[1] - y) * (B[1] - y) > 0 || A[1] === B[1]) continue;
                            const t = (y - A[1]) / (B[1] - A[1]);
                            hit.push(Math.hypot(A[0] + (B[0] - A[0]) * t, A[2] + (B[2] - A[2]) * t));
                        }
                    }
                    return hit.length ? hit.reduce((x, y2) => x + y2, 0) / hit.length : 0;
                };
                const lo = radiusAt(0.05 * p.h), mid = radiusAt(0.45 * p.h);
                // ② 단면 비대칭 + ④ 면 변주 — 밑동 링(y ≈ 0) 정점들
                const baseIdx = [];
                for (let i = 0; i < ys.length; i++) if (Math.abs(ys[i]) < 1e-4 * p.h + 1e-5) baseIdx.push(i);
                const mean = a => a.reduce((x, y2) => x + y2, 0) / (a.length || 1);
                const sd = a => { const m2 = mean(a); return Math.sqrt(mean(a.map(x => (x - m2) * (x - m2)))); };
                const baseR = baseIdx.map(i => rs[i]), baseC = baseIdx.map(i => cs[i]);
                // ③ 음영 기울기
                const ord = ys.map((y2, i) => [y2, i]).sort((a, b) => a[0] - b[0]).map(q => q[1]);
                const q30 = Math.max(1, Math.floor(ord.length * 0.3));
                const shade = mean(ord.slice(-q30).map(i => cs[i])) - mean(ord.slice(0, q30).map(i => cs[i]));
                // ⑤ 법선 방향 — 기둥 구간(어깨 아래) 삼각형만
                let inward = 0, sideTris = 0;
                for (let i = 0; i < loc.length / 9; i++) {
                    const o = i * 9;
                    const ax = loc[o], ay = loc[o + 1], az = loc[o + 2];
                    const bx = loc[o + 3], by = loc[o + 4], bz = loc[o + 5];
                    const cx = loc[o + 6], cy = loc[o + 7], cz = loc[o + 8];
                    const cyMid = (ay + by + cy) / 3;
                    if (cyMid < 0.06 * p.h || cyMid > p.shoulder * 0.85) continue;   // 밑면·추면 제외
                    const ux = bx - ax, uy = by - ay, uz = bz - az;
                    const wx = cx - ax, wy = cy - ay, wz = cz - az;
                    const nx = uy * wz - uz * wy, nz = ux * wy - uy * wx;
                    const cxm = (ax + bx + cx) / 3, czm = (az + bz + cz) / 3;
                    sideTris++;
                    if (nx * cxm + nz * czm <= 0) inward++;
                }
                parts.push({
                    col: lo ? mid / lo : 0, cv: mean(baseR) ? sd(baseR) / mean(baseR) : 0,
                    shade, facet: sd(baseC), inward, sideTris,
                    prof: baseIdx.map(i => rs[i]), verts: p.count,
                });
            }
            out.clusters.push({ parts, verts: pos.count, tris: pos.count / 3 });
        }
        return out;
    });

    const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
    const rmsDiff = (a, b) => {
        const n = Math.min(a.length, b.length);
        if (n < 4) return 1;
        let s2 = 0, m = 0;
        for (let i = 0; i < n; i++) { const d = a[i] - b[i]; s2 += d * d; m += a[i]; }
        m /= n;
        return m ? Math.sqrt(s2 / n) / m : 1;
    };

    const fails = [];
    if (res.noColor) fails.push(`color 속성 없는 클러스터 ${res.noColor}개 — vertexColors 재질인데 속성이 없으면 검게 찍힌다`);
    const all = res.clusters.flatMap(c => c.parts);
    if (!all.length) fails.push('결정을 하나도 못 찾았다');
    const colMin = Math.min.apply(null, all.map(p => p.col));
    const cvMin = Math.min.apply(null, all.map(p => p.cv));
    const shMin = Math.min.apply(null, all.map(p => p.shade));
    const fcMin = Math.min.apply(null, all.map(p => p.facet));
    const inward = all.reduce((a, p) => a + p.inward, 0);
    const sideTris = all.reduce((a, p) => a + p.sideTris, 0);
    // ⑥ 개체차 — 클러스터 간 같은 순번끼리
    let dMin = Infinity, pairs = 0;
    for (let k = 0; k < 6; k++) {
        const ps = res.clusters.map(c => c.parts[k]).filter(Boolean);
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
            dMin = Math.min(dMin, rmsDiff(ps[i].prof, ps[j].prof)); pairs++;
        }
    }
    if (!pairs) dMin = 0;

    console.log(`결정 ${all.length}개 (클러스터 ${res.clusters.length} × ${all.length / res.clusters.length})  삼각형/클러스터 ${mean(res.clusters.map(c => c.tris)).toFixed(0)}`);
    console.log(`① 기둥성 min      ${colMin.toFixed(3)}  (정원뿔이면 ≈0.61, 게이트 ${COL_MIN})`);
    console.log(`② 단면 변동계수 min ${cvMin.toFixed(4)} (게이트 ${CV_MIN})`);
    console.log(`③ 음영 기울기 min   ${shMin.toFixed(3)}  (게이트 ${SHADE_MIN})`);
    console.log(`④ 면 변주 min      ${fcMin.toFixed(4)} (게이트 ${FACET_MIN})`);
    console.log(`⑤ 안쪽 향한 기둥면  ${inward} / ${sideTris}`);
    console.log(`⑥ 개체 간 최소차    ${dMin.toFixed(4)} (${pairs}쌍, 게이트 ${DIFF_MIN})`);
    console.log(`드로우콜 crystalMat 메시/클러스터 ${res.meshCount.join(',')} (교체 전 3)`);

    if (colMin < COL_MIN) fails.push(`기둥성 ${colMin.toFixed(3)} < ${COL_MIN} — 아직 원뿔이다(어깨선이 없다)`);
    if (cvMin < CV_MIN) fails.push(`단면 변동계수 ${cvMin.toFixed(4)} < ${CV_MIN} — 정육각형이다`);
    if (shMin < SHADE_MIN) fails.push(`음영 기울기 ${shMin.toFixed(3)} < ${SHADE_MIN} — 버텍스 컬러가 평평하다`);
    if (fcMin < FACET_MIN) fails.push(`면 변주 ${fcMin.toFixed(4)} < ${FACET_MIN} — 면끼리 색이 안 갈린다`);
    if (inward) fails.push(`기둥면 ${inward}개의 법선이 안쪽을 본다 — 컬링돼 결정이 뚫려 보인다`);
    if (dMin < DIFF_MIN) fails.push(`개체 간 최소차 ${dMin.toFixed(4)} < ${DIFF_MIN} — 클러스터가 복붙이다`);
    if (res.meshCount.some(n => n !== 1)) fails.push(`클러스터당 crystalMat 메시가 1이 아니다(${res.meshCount.join(',')}) — 합쳐 굽는 의도가 깨졌다`);

    console.log(`콘솔 에러 ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 4).join('\n'));
    console.log(fails.length ? '\n반려 —\n  ' + fails.join('\n  ') : '\nPASS');
    await browser.close();
    process.exit(fails.length || errors.length ? 1 : 0);
})();
