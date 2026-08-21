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
//  ⑥ 개체차  — 클러스터마다 달라야 한다. 같은 순번 결정끼리 **높이 16단 실루엣 반경** RMS 차 / 평균반경.
//              (밑동 링 반경으로 재던 옛 식은 사각 단면에서 정수 두 개로 고정돼 무효다 — 본문 🚨 참고.)
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
const SHOULDER_MIN = 0.72; // ⑧ 어깨 높이 / 전체 높이 — 종단 뿔이 28% 를 넘으면 중경에서 어깨가 소실된다
// ⑨ 접지 델타는 게이트로 못 쓴다(아래 주석 참고) — 참고치로만 찍는다.
// ⑪ 주상면 하나의 폭(월드 유닛). flatShading 은 면 하나에 값 하나라, 이 폭이 곧 '민짜로 보이는 폭'이다.
// **값의 근거**: 비평가가 육안으로 통과시킨 중경 결정(6면·r≈0.25)의 면 폭이 약 0.25, 반려한 랜드마크
// 모노리스(s=3.3)가 약 0.63 이었다. 그 사이에서 여유를 두고 0.30 으로 잡는다.
// ⚠️ 이 값을 더 조이지 말 것 — 면 폭을 0.15 로 낮추려면 작은 결정에도 30면이 필요해지고, 30면짜리
//    주상체는 결정이 아니라 **원기둥**이다. 큰 자리는 면을 쪼갤 게 아니라 결정을 여러 기로 늘려야 한다.
const FACEW_MAX = 0.30;
const SLENDER_MIN = 0.13;  // ⑧ 밑동 반경 / 높이 — 이보다 가늘면 '바늘'

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // 🚨 **난수를 고정한다(2026-08-21).** ⑦(순백 클리핑)은 결정 배치·프레이밍에 통째로 흔들려서,
    //    같은 코드로 연달아 돌려도 0.95 / 1.28 / 2.73 / 4.94 / 7.21% 가 나온다(실측 5회). 그 상태로는
    //    '고쳤는가'를 물을 수 없다 — 이 파일 안의 옛 메모("난수 미고정이라 0.00~6.43% 로 널뛰었다")가
    //    같은 함정을 이미 적어 뒀는데 자에는 반영돼 있지 않았다. 시드를 박아 A/B 가 성립하게 한다.
    await page.addInitScript(() => {
        let sd0 = 0x51f3a7d;
        Math.random = () => { sd0 = (sd0 * 1664525 + 1013904223) >>> 0; return sd0 / 4294967296; };
    });
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
        // ⚠️ **랜드마크 배율(3.3)도 반드시 표본에 넣는다** — 실패는 늘 거기서 났다(비평가: 중경 평탄 런
        //    13px 인데 랜드마크만 42px). 일반 소품(1.2)만 재면 그 결함이 안 보인다.
        const SCALES = [1.2, 1.2, 1.2, 1.2, 3.3];
        for (let t = 0; t < SCALES.length; t++) {
            const geo = Scene3D.crystalGeo(SCALES[t]);
            const pos = geo.attributes.position, col = geo.attributes.color, nor = geo.attributes.normal;
            if (!col) { out.noColor++; continue; }
            const parts = [];
            for (const p of geo.userData.parts) {
                // 배치 행렬을 되돌려 **결정 자신의 축** 기준으로 잰다(기울여 심은 파편도 같은 자로 본다)
                const inv = new THREE.Matrix4().fromArray(p.mat).invert();
                const v = new THREE.Vector3();
                const ys = [], rs = [], cs = [], loc = [], wld = [], wn = [];
                for (let i = p.start; i < p.start + p.count; i++) {
                    // ⑤·⑪ 은 **월드 좌표에서** 잰다 — 감기 방향과 수평 폭은 배치 변환을 되돌릴 필요가
                    // 없고(전단은 방향을 보존한다), 되돌리면 계단 눕힘의 반 칸 잔차만 섞여 든다.
                    v.fromBufferAttribute(pos, i);
                    wld.push(v.x, v.y, v.z);
                    if (nor) { wn.push(nor.getX(i), nor.getY(i), nor.getZ(i)); } else { wn.push(0, 0, 0); }
                    v.applyMatrix4(inv);
                    loc.push(v.x, v.y, v.z);
                    ys.push(v.y); rs.push(Math.hypot(v.x, v.z));
                    // ⚠️ 색은 채널마다 다른 틴트가 곱해져 있다 — R 하나만 읽으면 램프가 아니라 틴트를 잰다. 휘도로 본다.
                    cs.push(0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i));
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
                    // 🚨 **평균이 아니라 상위 퍼센타일이다.** 복셀 전환 뒤로는 결정끼리 겹친 칸을 먼저 온
                    //    쪽이 가져가므로(z-파이팅 방지) 뒤에 온 결정에 구멍이 생기고, 그 **속면**이 평면에
                    //    같이 잘려 평균을 아래로 끈다. 실루엣 반경을 묻는 지표이므로 p85 로 읽는다
                    //    (옛 육방 기둥은 한 높이의 히트가 전부 같은 링 반경이라 평균과 p85 가 같다 = 호환).
                    if (!hit.length) return 0;
                    hit.sort((a, b) => a - b);
                    return hit[Math.min(hit.length - 1, Math.floor(hit.length * 0.85))];
                };
                const lo = radiusAt(0.05 * p.h), mid = radiusAt(0.45 * p.h);
                // ⑧ 비율 — 중경에서 '바늘'로 무너지지 않으려면 **주상부가 길고 뿔이 짧아야** 한다.
                //    어깨 높이는 굽힌 정점의 y 중에서 밑동(0)도 꼭짓점(h)도 아닌 링의 평균으로 되뽑는다.
                // 🚨 **'중간 정점들의 평균 y' 로 재던 옛 식을 버렸다 — 조형에 기대는 자였다.**
                //    옛 육방 기둥은 정점이 **밑동 링과 어깨 링 두 곳에만** 있어서 그 평균이 우연히 어깨
                //    높이 언저리(0.735)였다. 복셀은 층마다 정점이 있어 같은 식이 **언제나 ≈0.5** 를 뱉는다
                //    (전환 첫 판 0.358 — 조형이 아니라 자가 틀린 것이다. 함정 ④ '자가 낡으면 판정 무효').
                //    재정의: **실루엣 반경이 밑동의 75% 아래로 내려가기 시작하는 높이.** 주상부는 taper
                //    (0.80~0.97)만큼만 좁아져 전부 0.75 위에 있고, 어깨를 지나면 뿔이 선형으로 0 까지
                //    떨어져 곧바로 걸린다 — 검출값 = 참 어깨 +0.01~0.05h(두 조형 모두).
                const rBase0 = radiusAt(0.05 * p.h);
                let shoulderK = 0;
                for (let q = 5; q <= 98; q++) if (radiusAt(q / 100 * p.h) >= 0.75 * rBase0) shoulderK = q / 100;
                const slender = rBase0 / p.h;   // r/h — 작을수록 바늘
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
                // ⑤ 법선 방향 — 🚨 **'축에서 바깥을 보는가(dot>0)' 로 재던 옛 식을 버렸다.**
                //    그 식은 결정이 **곧게 선 것**을 전제한다. 복셀은 임의 각도 회전이 금지라 눕힘을
                //    **층마다 반올림해 미는 계단**으로 내는데, 그러면 축이 층마다 최대 반 칸 어긋나
                //    축 반대편 가장자리 면의 dot 이 음수로 떨어진다(전환 첫 판 893/6070 — 조형은 멀쩡했다).
                //    실제로 묻고 싶은 것은 **'감기 방향이 뒤집혀 컬링되는가'** 이므로 그것을 직접 잰다:
                //    삼각형의 **감기에서 나온 법선**과 지오메트리에 **저장된 법선**의 부호가 같은가.
                //    복셀은 법선을 `Voxel.build` 가 면의 진짜 바깥 방향으로 직접 써 넣으므로 자기 참조가
                //    아니다(옛 판은 `computeVertexNormals` 라 볼록 프리즘에서 같은 값이 나온다 = 호환).
                let inward = 0, sideTris = 0;
                for (let i = 0; i < loc.length / 9; i++) {
                    const o = i * 9;
                    const cyMid = (loc[o + 1] + loc[o + 4] + loc[o + 7]) / 3;
                    if (cyMid < 0.06 * p.h || cyMid > p.shoulder * 0.85) continue;   // 밑면·추면 제외
                    const o3 = i * 9;
                    const ax = wld[o3], ay = wld[o3 + 1], az = wld[o3 + 2];
                    const bx = wld[o3 + 3], by = wld[o3 + 4], bz = wld[o3 + 5];
                    const cx = wld[o3 + 6], cy = wld[o3 + 7], cz = wld[o3 + 8];
                    const ux = bx - ax, uy = by - ay, uz = bz - az;
                    const wx = cx - ax, wy = cy - ay, wz = cz - az;
                    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
                    sideTris++;
                    if (nx * wn[o3] + ny * wn[o3 + 1] + nz * wn[o3 + 2] <= 0) inward++;
                }
                // ⑩ 면 투영 폭 — flatShading 은 면 하나에 값 하나라, 화면에서 '한 값으로 이어지는 가로 폭'은
                //    곧 **면의 폭**이다. 굽힌 정점에서 이웃 밑동 정점 사이의 최대 거리로 되뽑는다(월드 단위).
                //    ⚠️ 픽셀로 재려던 시도는 버렸다 — 프레임마다 노출·프레이밍이 흔들려 24↔57px 로 널뛴다.
                // 🚨 **'밑동 링 이웃 정점 거리' 로 재던 옛 식을 버렸다 — 이것도 조형에 기대는 자였다.**
                //    옛 육방 기둥은 y=0 에 **링 정점 SIDES 개만** 있어서 각도순 이웃 거리가 곧 주상면 폭이었다.
                //    복셀은 밑면이 통째로 막혀 있어 y=0 정점에 **밑면 격자 전체**가 들어오고, 각도가 비슷한
                //    안쪽 점과 바깥쪽 점이 이웃으로 잡혀 반경만 한 거리가 나온다(전환 첫 판 0.707).
                //    재정의: **주상면(옆면) 삼각형의 수평 변 최대 길이.** flatShading 은 삼각형 하나에 값
                //    하나이므로 화면의 '한 값으로 이어지는 가로 폭'은 곧 이 값이다 — 옛 판에서는 프리즘
                //    면의 가로 폭과 같은 수를 낸다(= 게이트 0.30 의 근거가 그대로 산다).
                //    ⚠️ 세로 변은 넣지 않는다. 옛 지적은 **가로** 민짜 런(41px)이었고, 세로를 넣으면 옛
                //       조형의 기둥 한 면(높이 ≈0.8h)이 무조건 걸려 게이트가 의미를 잃는다.
                //    ⚠️ 윗면(±y)도 넣지 않는다 — 복셀의 윗면은 한 칸 대각(u√2)이 잡혀 실제로 보이는
                //       민짜 폭보다 크게 나오고, 원래 지적 대상은 옆면이었다.
                let faceW = 0;
                for (let i = 0; i < wld.length / 9; i++) {
                    const o = i * 9;
                    if (Math.abs(wn[o + 1]) >= 0.5) continue;                          // 윗면·밑면 제외
                    const cyMid = (loc[o + 1] + loc[o + 4] + loc[o + 7]) / 3;
                    if (cyMid < 0.06 * p.h || cyMid > p.shoulder * 0.85) continue;     // 주상 구간만
                    for (let a = 0; a < 3; a++) {
                        const A = o + a * 3, B = o + ((a + 1) % 3) * 3;
                        faceW = Math.max(faceW, Math.hypot(wld[A] - wld[B], wld[A + 2] - wld[B + 2]));
                    }
                }
                // ⑥ 개체차용 실루엣 프로파일 — **높이 16단의 실루엣 반경**.
                // 🚨 **밑동 링 정점 반경 목록으로 재던 옛 식을 버렸다(2026-08-21, map-props-minecraft).**
                //    마크 문법으로 옮기면서 결정 단면이 **축정렬 직사각형**이 됐는데, 그 밑동 링의 반경
                //    목록은 (반폭x, 반폭z) **정수 두 개**로 완전히 결정된다 — 즉 서로 다른 두 결정이라도
                //    반폭이 같으면 목록이 **정확히 같다**(실측 min 0.0000). 조형을 아무리 흔들어도(옆구리
                //    새끼 결정·단차·높이) 밑동 링은 안 움직이므로 **그 식으로는 개체차를 물을 수 없다.**
                //    ⚠️ 그렇다고 조형을 억지로 맞추면 안 된다 — 밑동을 넓히거나 기둥을 중간에서 좁히면
                //       ⑧(어깨 높이)이 0.81 → 0.41 로 무너진다. 두 자가 서로 반대를 요구하는 셈이었다.
                //    새 식은 **전 높이의 실루엣**을 보므로 조형의 개체차(높이·기울임·옆구리 결정)를 그대로
                //    읽고, 옛 육방 기둥에서도 같은 의미다(호환). 판단 기준값(0.04)은 그대로 둔다.
                const profH = [];
                for (let q = 0; q < 16; q++) profH.push(radiusAt((q + 0.5) / 16 * p.h));
                parts.push({
                    shoulderK, slender, faceW,
                    col: lo ? mid / lo : 0, cv: mean(baseR) ? sd(baseR) / mean(baseR) : 0,
                    shade, facet: sd(baseC), inward, sideTris,
                    prof: profH, verts: p.count,
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
        // ⚠️ 배율이 다른 클러스터끼리 비교하면 '크기 차이'를 개체차로 착각한다 — 1.2 배율끼리만 본다.
        const ps = res.clusters.slice(0, 4).map(c => c.parts[k]).filter(Boolean);
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
    const shK = Math.min.apply(null, all.map(p => p.shoulderK));
    const slMin = Math.min.apply(null, all.map(p => p.slender));
    console.log(`⑧ 어깨높이/전체 min ${shK.toFixed(3)} (게이트 ${SHOULDER_MIN} — 뿔이 ${((1 - SHOULDER_MIN) * 100).toFixed(0)}% 를 넘으면 원뿔로 읽힌다)  세장 r/h min ${slMin.toFixed(3)} (게이트 ${SLENDER_MIN})`);
    if (shK < SHOULDER_MIN) fails.push(`어깨 높이 ${shK.toFixed(3)} < ${SHOULDER_MIN} — 종단 뿔이 실루엣을 너무 먹는다`);
    if (slMin < SLENDER_MIN) fails.push(`세장비 r/h ${slMin.toFixed(3)} < ${SLENDER_MIN} — 중경에서 바늘로 무너진다`);
    const fwMax = Math.max.apply(null, all.map(p => p.faceW));
    console.log(`⑪ 면 폭 max      ${fwMax.toFixed(3)} 월드유닛 (게이트 ${FACEW_MAX} 이하 — 면이 넓으면 그 폭만큼 화면에서 민짜다)`);
    if (fwMax > FACEW_MAX) fails.push(`면 폭 ${fwMax.toFixed(3)} > ${FACEW_MAX} — 굵은 개체의 면을 더 쪼갤 것(SIDES 를 반경에 더 비례시킨다)`);
    console.log(`드로우콜 crystalMat 메시/클러스터 ${res.meshCount.join(',')} (교체 전 3)`);

    if (colMin < COL_MIN) fails.push(`기둥성 ${colMin.toFixed(3)} < ${COL_MIN} — 아직 원뿔이다(어깨선이 없다)`);
    if (cvMin < CV_MIN) fails.push(`단면 변동계수 ${cvMin.toFixed(4)} < ${CV_MIN} — 정육각형이다`);
    if (shMin < SHADE_MIN) fails.push(`음영 기울기 ${shMin.toFixed(3)} < ${SHADE_MIN} — 버텍스 컬러가 평평하다`);
    if (fcMin < FACET_MIN) fails.push(`면 변주 ${fcMin.toFixed(4)} < ${FACET_MIN} — 면끼리 색이 안 갈린다`);
    if (inward) fails.push(`기둥면 ${inward}개의 법선이 안쪽을 본다 — 컬링돼 결정이 뚫려 보인다`);
    if (dMin < DIFF_MIN) fails.push(`개체 간 최소차 ${dMin.toFixed(4)} < ${DIFF_MIN} — 클러스터가 복붙이다`);
    if (res.meshCount.some(n => n !== 1)) fails.push(`클러스터당 crystalMat 메시가 1이 아니다(${res.meshCount.join(',')}) — 합쳐 굽는 의도가 깨졌다`);

    // ⑦ 인게임 명도 — 조형을 아무리 깎아도 **발광에 씻기면 화면에서는 흰 덩어리**다.
    // 크리스탈만 껐다 켠 같은 프레임을 비교해 크리스탈 픽셀만 골라 명도 분포를 낸다
    // (probe-embers 와 같은 기법 — 시차·과도 구간에 오염되지 않는다).
    const val = await (async () => {
        await page.close();   // ⚠️ 소프트웨어 GL 이라 WebGL 페이지 둘을 동시에 띄우면 screenshot 이 타임아웃 난다
        const p2 = await browser.newPage({ viewport: { width: 480, height: 854 } });
        p2.on('pageerror', e => errors.push(String(e)));
        p2.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        // 🚨 **씬 배치 난수를 못 박는다 — 안 그러면 ⑦ 이 같은 코드에서 0.00%↔6.43% 로 널뛴다.**
        //    카메라·월드 스크롤·맥동을 다 세워도 남는 변인이 하나 있었다: **부팅 때 굴린 소품 배치.**
        //    크리스탈 픽셀 수가 실행마다 25,905↔38,644 로 흔들린 게 그 증거다(화면에 든 결정 수·거리가
        //    매번 달랐다). 5회 실측: 0.00 / 0.81 / 1.28 / 3.03 / 6.43% — **게이트가 동전던지기였다.**
        //    `Math.random` 을 LCG 로 갈아 끼워 부팅 전체를 결정론으로 만든다(이 저장소의 다른 프로브가
        //    쓰는 것과 같은 수단 — `probe-coin-overlap.js`·`probe-boss-identity.js`).
        //    ⚠️ `addInitScript` 라 **반드시 `goto` 앞**이다. `goto` 뒤에 심으면 소품은 이미 배치된 뒤다.
        await p2.addInitScript(() => {
            let sd = 20260820 >>> 0;
            Math.random = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296;
        });
        await p2.goto(INDEX, { waitUntil: 'load' });
        await p2.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });
        await p2.evaluate(() => {
            if (typeof Combat !== 'undefined') Combat.update = () => {};
            Scene3D.setTheme({ biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, celestial: 'moon' });
            Scene3D.setTheme = () => {}; Scene3D.setChapterTheme = () => {};
        });
        await p2.waitForTimeout(1400);   // ⚠️ 테마 전환 직후 수십 프레임은 페이드·그림자맵 워밍업 구간이다
        // ⚠️ 🚨 **맥동 위상을 고정하지 않으면 이 지표는 매 실행 다른 값을 뱉는다.** 발광·할로·글로우가 전부
        //    `_clock` 기반 사인이라 캡처 시점에 따라 크리스탈 평균 명도가 91↔117 로 흔들렸다(실측).
        //    맥동이 쓰는 **세 값만** 읽기 전용으로 못 박는다(update 의 대입은 조용히 무시된다).
        //    ⚠️ `_clock` 자체를 얼리지 말 것 — 노출·페이드까지 같이 멎어 지면 평균이 88 → 40 으로
        //    엉뚱하게 튀고 크리스탈 픽셀 판정이 46% 로 부풀었다(실측, 첫 판이 그렇게 망가졌다).
        await p2.evaluate(() => {
            const pin = (o, k, v) => Object.defineProperty(o, k, { value: v, writable: false, configurable: true });
            pin(Scene3D.crystalMat, 'emissiveIntensity', 0.30);   // 맥동 중앙값
            if (Scene3D.crystalHaloMat) pin(Scene3D.crystalHaloMat, 'opacity', 0.31);
            if (Scene3D.crystalGlowMat) pin(Scene3D.crystalGlowMat, 'opacity', 0.49);
            // ⚠️ 🚨 **카메라를 못 박지 않으면 두 프레임 차분이 크리스탈이 아니라 시차를 잰다.**
            //    인게임 카메라는 가만히 있어도 매 프레임 0.034 씩 움직여서, 배경 전체가 흘러
            //    '크리스탈 픽셀'이 뷰포트의 95%(182,603px)로 부풀었다(실측). `camLock` 으로 세운다.
            //    — 이건 `probe-wind.js` 머리말의 함정 ㉠ 과 같은 것이다. 같은 덫에 두 번 빠졌다.
            Scene3D.camLock = { pos: new THREE.Vector3(0, 2.6, 6.2), look: new THREE.Vector3(0, 0.8, -3.2) };
            // ⚠️ **월드 스크롤도 못 박는다** — 소품은 worldX 주기 26 으로 재배치되므로, 이걸 안 세우면
            //    실행마다 화면에 든 크리스탈 수·거리가 달라 클리핑 비율이 0.73%↔3.45% 로 널뛴다(실측).
            pin(Scene3D, 'worldX', 0);
        });
        await p2.waitForTimeout(400);
        // ⚠️ 🚨 **두 프레임 차분으로 크리스탈 픽셀을 고르려던 시도는 버렸다.** 카메라를 못 박아도
        //    안개·불씨·풀 셰이더·월드 스크롤이 계속 움직여 '바뀐 픽셀'이 뷰포트의 95% 로 나왔다
        //    (실측 182,603px → camLock 후에도 100,648px). `probe-wind.js` 머리말의 함정 ㉠~㉢ 과 같은 계열이다.
        //    대신 **크리스탈만 남기고 전부 끈 프레임**을 따로 굽는다 — 조명·안개는 그대로라 크리스탈이
        //    화면에서 갖는 명도는 인게임과 동일하고, 검은 배경 대비로 픽셀 판정이 결정론적이 된다.
        // ⚠️ 클립은 **캔버스 사각형만** — 페이지 전체를 찍으면 DOM HUD 가 픽셀 통계에 섞인다.
        const clip = await p2.evaluate(() => {
            const r = document.querySelector('canvas').getBoundingClientRect();
            return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.round(r.width), height: Math.round(r.height) };
        });
        const full = await p2.screenshot({ timeout: 120000, clip });
        // ⚠️ 🚨 **DOM HUD 와 전투 FX 를 안 끄면 그것들이 '크리스탈 픽셀'로 잡힌다.** 첫 판은 클립 영역이
        //    캔버스가 아니라 페이지 전체라 오프라인 배지·스테이지 라벨·데미지 숫자·타격 스파크·코인 토스트가
        //    전부 들어왔다 — 순백 클리핑의 정체가 **크리스탈이 아니라 타격 스파크**였고, 매 프레임 달라지는
        //    FX 때문에 픽셀 수가 22k↔157k 로 널뛰었다. DOM 을 숨기고, 3D FX 는 늦게 스폰되므로
        //    **숨김 순회를 두 번** 돌린 직후에 찍는다.
        const hideAll = () => p2.evaluate(() => {
            // ⚠️ **선택자 목록으로 숨기면 반드시 뭔가 남는다** — 보스 경고 배너·테마 페이드 판처럼
            //    상황에 따라 뜨는 오버레이가 그때그때 다르게 섞여 픽셀 수가 25k↔137k 로 널뛴다.
            //    `page.screenshot` 은 캔버스로 clip 해도 그 위에 겹친 DOM 을 같이 굽는다.
            //    캔버스와 그 조상만 남기고 **전부** 숨긴다.
            const cvs = document.querySelector('canvas');
            document.querySelectorAll('body *').forEach(el => {
                if (el !== cvs && !el.contains(cvs)) el.style.visibility = 'hidden';
            });
            if (!Scene3D._keep) {
                Scene3D._keep = [];
                Scene3D.scene.traverse(o => { if (o.isMesh && o.material === Scene3D.crystalMat) Scene3D._keep.push(o); });
            }
            const keep = new Set();
            for (const m of Scene3D._keep) { let n = m; while (n) { keep.add(n); n = n.parent; } }
            Scene3D._hidden = Scene3D._hidden || [];
            Scene3D.scene.traverse(o => {
                if ((o.isMesh || o.isSprite || o.isPoints || o.isLine) && !keep.has(o) && o.visible) {
                    o.visible = false; Scene3D._hidden.push(o);
                }
            });
            Scene3D.renderer.setClearColor(0x000000);
            Scene3D.scene.background = null;
        });
        await hideAll();
        await p2.waitForTimeout(300);
        await hideAll();                       // 그 사이 스폰된 FX 까지 잡는다
        const only = await p2.screenshot({ timeout: 120000, clip });
        if (process.env.CRYSTAL_DUMP) require('fs').writeFileSync(process.env.CRYSTAL_DUMP, only);
        await p2.evaluate(() => { for (const o of Scene3D._hidden) o.visible = true; });
        const stats = await p2.evaluate(async ([a, b]) => {
            const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
            const [ia, ib] = await Promise.all([load(a), load(b)]);
            const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
            const cx = cv.getContext('2d');
            cx.drawImage(ia, 0, 0); const A = cx.getImageData(0, 0, cv.width, cv.height).data;
            cx.clearRect(0, 0, cv.width, cv.height);
            cx.drawImage(ib, 0, 0); const B = cx.getImageData(0, 0, cv.width, cv.height).data;
            const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            const ls = []; let clipN = 0;
            const gr = [];
            for (let i = 0; i < B.length; i += 4) {
                if (L(B, i) > 20) {                                 // 크리스탈만 남긴 프레임의 비검정 픽셀
                    //   ⚠️ 문턱을 6 으로 두면 검은 배경과 섞인 안티에일리어싱 가장자리(L 6~7)가 대량으로 들어와
                    //      하위 10% 가 7 로 깔린다 — 몸통 명도가 아니라 외곽선을 재는 꼴이다.
                    ls.push(L(B, i));
                    if (B[i] > 250 && B[i + 1] > 250 && B[i + 2] > 250) clipN++;
                } else if (((i / 4) / cv.width | 0) > cv.height * 0.72) gr.push(L(A, i));  // 지면 대역(전체 프레임에서)
            }
            // ⑨ 접지 — 결정 밑동 **바로 아래** 지면이 옆쪽 기준 지면보다 어두워야 '얹힌 것'으로 읽힌다.
            //    격리 프레임을 마스크로 써서 각 열의 최하단 크리스탈 픽셀을 찾고, 그 아래 4px 과
            //    좌우 ±35px(마스크 밖) 지면을 전체 프레임에서 비교한다. 비평가가 쓴 것과 같은 자다.
            const W = cv.width, H = cv.height;
            const mask = new Uint8Array(W * H);
            for (let i = 0; i < B.length; i += 4) if (L(B, i) > 20) mask[i / 4] = 1;
            const deltas = [];
            for (let x = 0; x < W; x++) {
                let bot = -1;
                for (let y = H - 1; y >= 0; y--) if (mask[y * W + x]) { bot = y; break; }
                if (bot < 0 || bot + 6 >= H) continue;
                const py = bot + 4;
                const under = L(A, (py * W + x) * 4);
                // ⚠️ 기준점을 가까이(±35px) 잡으면 **접지 암부 안**에서 표본을 뜨게 돼 델타가 늘 0 근처로 나온다.
                //    데칼 반경이 결정 반경에 비례해 커졌으므로 기준은 확실히 바깥(±95px)에서 뜬다.
                const ref = [];
                for (const dx of [-95, 95, -130, 130]) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= W || mask[py * W + nx]) continue;
                    ref.push(L(A, (py * W + nx) * 4));
                }
                if (ref.length) deltas.push(under - ref.reduce((a2, b2) => a2 + b2, 0) / ref.length);
            }
            const contact = deltas.length ? deltas.reduce((a2, b2) => a2 + b2, 0) / deltas.length : 0;
            // ⑩ 평탄면 — 한 행 안에서 **루마가 ±2 안에 머무는 최장 가로 런**
            //    ⚠️ 허용폭을 ±4 로 두면 **기울어진 면을 가로지르는 완만한 그라디언트가 계속 이어져** 붙는다
            //    (면을 6 → 28 로 쪼개도 24~27px 에서 안 내려갔다). ±2 라야 '진짜 민짜 판'만 잡힌다.. 면을 아무리 갈라도
            //    굵은 개체가 넓은 민짜 판을 하나 갖고 있으면 거기서 '판때기'로 읽힌다(비평가 ②:
            //    중경 13px 인데 랜드마크만 42px). 격리 프레임에서 크리스탈 픽셀만 보고 잰다.
            let flatRun = 0;
            for (let y = 0; y < H; y++) {
                let run = 0, base = -1;
                for (let x = 0; x < W; x++) {
                    const i = (y * W + x) * 4;
                    if (!mask[y * W + x]) { run = 0; base = -1; continue; }
                    const l = L(B, i);
                    if (base >= 0 && Math.abs(l - base) <= 2) { run++; }
                    else { base = l; run = 1; }
                    if (run > flatRun) flatRun = run;
                }
            }
            ls.sort((x, y) => x - y); gr.sort((x, y) => x - y);
            return ls.length ? {
                contact, contactN: deltas.length, flatRun,
                n: ls.length, min: ls[0], p10: ls[Math.floor(ls.length * 0.1)],
                mean: ls.reduce((x, y) => x + y, 0) / ls.length, max: ls[ls.length - 1],
                clip: clipN, ground: gr.length ? gr[Math.floor(gr.length * 0.5)] : 0,
            } : null;
        }, ['data:image/png;base64,' + full.toString('base64'), 'data:image/png;base64,' + only.toString('base64')]);
        await p2.close();
        return stats;
    })();
    if (!val) fails.push('인게임 명도: 크리스탈 픽셀을 못 찾았다(껐다 켠 프레임이 동일)');
    else {
        // ⚠️ 🚨 **⑨ 는 게이트가 아니라 참고치다 — 수렴하지 않았다.** 같은 코드에서 −12.5 ↔ +13.3 로 널뛴다.
        //    기준점을 밑동에서 ±95~130px 떨어뜨려도 그 자리가 지면 그라디언트·자갈·영웅 그림자에 걸리고,
        //    어느 결정이 화면에 드는지도 실행마다 달라 부호까지 바뀐다. **접지는 눈으로 판정할 것**
        //    (`shot-biomes.js magic` 프레임에서 밑동 아래 어두운 웅덩이가 보이는지) — 데칼 자체는 확실히 그려진다.
        console.log(`⑨ 접지(참고) 밑동 직하 − 측면 기준 지면 ${val.contact.toFixed(1)} (${val.contactN}열 — 실행 간 ±13 편차, 게이트 아님)`);
        console.log(`⑩ 평탄면(참고) 격리 프레임 최장 가로 런 ${val.flatRun}px — 프레임 노출·프레이밍에 흔들려 게이트로는 못 쓴다(⑪ 로 대체)`);
        console.log(`⑦ 인게임 명도  픽셀 ${val.n}  min ${val.min.toFixed(0)}  p10 ${val.p10.toFixed(0)}  평균 ${val.mean.toFixed(0)}  max ${val.max.toFixed(0)}  순백클립 ${val.clip}(${(val.clip / val.n * 100).toFixed(2)}%)  지면평균 ${val.ground.toFixed(0)}`);
        // 게이트: 어두운 면이 실제로 존재할 것(p10) · 평균이 지면 대비 과하게 뜨지 않을 것 · 순백 클립 없을 것
        if (val.p10 > 150) fails.push(`명도 하위 10% ${val.p10.toFixed(0)} > 150 — 어두운 면이 없다(발광이 조형을 씻는다)`);
        if (val.mean > val.ground + 110) fails.push(`평균 명도 ${val.mean.toFixed(0)} 가 지면 ${val.ground.toFixed(0)} 보다 110 이상 높다 — 흰 덩어리로 뜬다`);
        // 클리핑은 **비율**로 본다 — 끝단의 소량 클립은 의도한 반짝임이고, 씻긴 덩어리는 자릿수가 다르다.
        // (절대 픽셀 수로 걸면 결정을 크게 키우기만 해도 반려된다.)
        if (val.clip > val.n * 0.02) fails.push(`순백 클리핑 ${val.clip}px = 크리스탈 픽셀의 ${(val.clip / val.n * 100).toFixed(1)}% > 2% — 발광이 화이트로 증발한다`);
    }

    console.log(`콘솔 에러 ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 4).join('\n'));
    console.log(fails.length ? '\n반려 —\n  ' + fails.join('\n  ') : '\nPASS');
    await browser.close();
    process.exit(fails.length || errors.length ? 1 : 0);
})();
