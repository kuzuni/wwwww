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
const SHOULDER_MIN = 0.72; // ⑧ 어깨 높이 / 전체 높이 — 종단 뿔이 28% 를 넘으면 중경에서 어깨가 소실된다
const SLENDER_MIN = 0.13;  // ⑧ 밑동 반경 / 높이 — 이보다 가늘면 '바늘'

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
                // ⑧ 비율 — 중경에서 '바늘'로 무너지지 않으려면 **주상부가 길고 뿔이 짧아야** 한다.
                //    어깨 높이는 굽힌 정점의 y 중에서 밑동(0)도 꼭짓점(h)도 아닌 링의 평균으로 되뽑는다.
                const midYs = ys.filter(y2 => y2 > p.h * 0.05 && y2 < p.h * 0.97);
                const shoulderK = midYs.length ? (midYs.reduce((x, y2) => x + y2, 0) / midYs.length) / p.h : 0;
                const slender = radiusAt(0.05 * p.h) / p.h;   // r/h — 작을수록 바늘
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
                    shoulderK, slender,
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
    const shK = Math.min.apply(null, all.map(p => p.shoulderK));
    const slMin = Math.min.apply(null, all.map(p => p.slender));
    console.log(`⑧ 어깨높이/전체 min ${shK.toFixed(3)} (게이트 ${SHOULDER_MIN} — 뿔이 ${((1 - SHOULDER_MIN) * 100).toFixed(0)}% 를 넘으면 원뿔로 읽힌다)  세장 r/h min ${slMin.toFixed(3)} (게이트 ${SLENDER_MIN})`);
    if (shK < SHOULDER_MIN) fails.push(`어깨 높이 ${shK.toFixed(3)} < ${SHOULDER_MIN} — 종단 뿔이 실루엣을 너무 먹는다`);
    if (slMin < SLENDER_MIN) fails.push(`세장비 r/h ${slMin.toFixed(3)} < ${SLENDER_MIN} — 중경에서 바늘로 무너진다`);
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
            for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview',
                '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn', '#tabbar', '#dmg-layer'])
                document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
            if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
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
            ls.sort((x, y) => x - y); gr.sort((x, y) => x - y);
            return ls.length ? {
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
