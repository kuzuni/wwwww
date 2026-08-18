// 장비 썸네일의 **조형 쪽** 2차 디테일 실측 — 사용: node probe-equip-drape.js  (종료코드 0 = 통과)
// TODO 'equip-design-dedupe' ⓒ⑶ 전용. 비평가가 요구한 넷 중 둘은 셰이더가 칠하지만
// (`ageDetailGLSL` 의 stitch/rivet/seam — `probe-equip-detail.js` 가 그쪽을 잰다),
// **천 주름과 매듭은 칠로 안 되는 것**이라 조형으로 넣었다. 그 두 층만 여기서 잰다.
//
// ① 천 주름 — `shellFromRings` 의 `fold`. 칠한 주름(sFold)은 **바깥 윤곽을 못 바꾼다**:
//    96px 로 줄이면 로브는 여전히 매끈한 종(鐘)이다. 조형 주름은 둘레를 따라 반경을 오르내리게
//    해 윤곽 자체를 굴곡지게 만든다. 그래서 픽셀이 아니라 **정점을 직접** 잰다 —
//    링(높이)마다 둘레 반경의 변동폭 / 평균반경. 천(hide·robe)은 > 0, 판금은 정확히 0 이어야 하고,
//    **목(0)에서 밑단(1)으로 갈수록 커져야** 한다(어깨에 매달린 천의 드레이프).
//    ⚠️ 픽셀 프록시를 쓰지 않는 이유: 96px 다운샘플 + 3/4 각 투영에서 굴곡 진폭은 한두 화소라
//       조명·형상 그라디언트에 묻힌다. 요구가 조형이면 조형을 재는 게 맞다.
// ② 매듭 — `tieKnot` 이 `userData.knot` 표식을 남긴다. 매듭 그룹만 껐다 켜서 **실제로 화면에
//    보이는지**를 픽셀 차분으로 잰다.
//    ⚠️ 있는지(개수)가 아니라 **보이는지**를 재는 게 핵심이다. 파츠가 몸 안에 파묻히면 0픽셀인데
//       콘솔 에러도 캡처 이상도 안 난다(TODO ㉤⑵ 가 늑대 다리 링 5개로 실제로 밟은 함정).
//    ⚠️ 타입(ConeGeometry 등)으로 찾지 말 것 — 다른 파츠가 같이 잡혀 수치가 늘었다 줄었다 한다
//       (TODO 함정 ④⑵). 코드가 남긴 표식만 본다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 🚨 **조형 층(주름·매듭)을 받는 건 로브뿐이다 — 가죽(hide)은 건드리면 안 된다.**
//    가죽에 주름 0.032 를 걸었더니 `probe-age-shading` 의 primal↔polymer(hide) 재질분리가
//    1.19 → 0.62 로, 매듭 5개만 얹었을 때도 0.70 으로 무너졌다(기준 1.00). 그 지표의 승리 축이
//    ΔSD(두 시대 가죽의 휘도 표준편차 차 2.4)인데, 어두운 매듭·주름 음영이 **무광 기술섬유
//    (polymer) 쪽 SD 를 더 크게 올려**(24.7 → 26.4) 차이를 지운다 = 비평가가 친 '색 스와프'의 부활.
//    가죽을 원상복구하니 정확히 1.21 로 돌아왔다. **남의 회귀 기준선을 고쳐서 통과시키지 말 것.**
//    가죽의 2차 디테일은 `ageDetailGLSL` 의 가죽 결·바늘땀이 이미 진다.
//    ⚠️ 이 게이트는 여유가 19% 뿐이라 **가죽 실루엣/음영을 건드리는 어떤 변경도** 먼저 그쪽부터 돌릴 것.
const DRAPED = ['robe'];                             // fold > 0 · 매듭 있어야 하는 스타일
const UNTOUCHED = ['hide'];                          // 조형 층을 얹으면 안 되는 스타일(위 사유)
const SOFT = DRAPED.concat(UNTOUCHED);
const STIFF = ['plate', 'cape', 'vest', 'suit'];     // fold == 0 이어야 하는 스타일(주름진 강철 금지)
const AGES = ['primitive', 'medieval', 'space'];
const WAVE_MIN = 0.010;   // 밑단 굴곡 하한(반경 대비). 2026-08-18 실측 hide 0.032·robe 0.055 설정값 기준
const KNOT_PX_MIN = 12;   // 96×96 에서 매듭이 바꿔 놓아야 할 최소 화소 수

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.itemThumb, null, { timeout: 20000 });

    const res = await page.evaluate(async (cfg) => {
        const { SOFT, STIFF, AGES, DRAPED } = cfg;
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 });  // 렌더러·환경맵 초기화
        const N = 96;
        const cv = document.createElement('canvas'); cv.width = cv.height = N;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        const out = [], errs = [];

        // ── ① 주름: 토르소 메시의 정점을 높이(링)별로 묶어 둘레 반경의 변동폭을 잰다 ──
        // 토르소는 makeArmorPreview 가 맨 처음 add 하는 메시다. 타입으로 찾지 않고 **위치**로 쥔다.
        // 🚨 함정 2건을 여기서 밟고 고쳤다 — 다음 세션이 같은 걸 다시 짓지 말 것.
        //  ㉠ **타원 반경을 `max|x|`·`max|z|` 로 추정하면 안 된다.** foldN 이 홀수라 a=0(x축)에는
        //     주름 마루가, a=π/2(z축)에는 마루가 없어 rx 만 (1+fold) 만큼 부풀어 오른다 —
        //     기준 타원이 찌그러져 굴곡이 실제보다 크게 나온다.
        //  ㉡ **캡 중심점이 링과 같은 y 를 갖는다.** `shellFromRings` 는 아래·위 캡의 중심(0,y,0)을
        //     밑단·목 링과 **같은 y** 로 넣는다. 이 점의 반경은 0 이라 k=0 이 섞여 굴곡이 통째로
        //     1.0 으로 찍혔다(첫 판이 전 칸 FAIL 난 이유 — 코드가 아니라 자가 계측이 틀렸다).
        // 대신 **정점 순서가 곧 각도**라는 걸 쓴다: shellFromRings 는 링마다 i=0..n-1 을 순서대로
        // 넣으므로 a_i = 2πi/n 이다. rx·rz 는 x_i/cos(a_i)·z_i/sin(a_i) 의 평균으로 잡는다 —
        // 주름 항 cos(foldN·a) 의 한 주기 평균이 0 이라 이 추정은 주름에 오염되지 않는다.
        // ⚠️ `flat:true`(원시 계열 비-soft)면 toNonIndexed 로 정점이 삼각형마다 복제돼 이 순서 가정이
        //    깨진다. 그 칸은 재지 않고 건너뛴다(soft 는 항상 flat 이 아니라 천 판정에는 영향 없다).
        const waveOf = (model, flat) => {
            if (flat) return null;
            let torso = null;
            for (const c of model.children) { if (c.isMesh && c.geometry && c.geometry.attributes.position) { torso = c; break; } }
            if (!torso) return null;
            const pos = torso.geometry.attributes.position;
            const rows = new Map();
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
                if (Math.hypot(x, z) < 1e-6) continue;          // ㉡ 캡 중심점 제거
                const key = y.toFixed(4);
                if (!rows.has(key)) rows.set(key, []);
                rows.get(key).push({ x, z });
            }
            const bands = [];
            for (const [key, pts] of rows) {
                const n = pts.length;
                if (n < 8) continue;
                let sx = 0, cx = 0, sz = 0, cz = 0;
                for (let i = 0; i < n; i++) {
                    const a = 2 * Math.PI * i / n;
                    const ca = Math.cos(a), sa = Math.sin(a);
                    if (Math.abs(ca) > 0.35) { sx += pts[i].x / ca; cx++; }
                    if (Math.abs(sa) > 0.35) { sz += pts[i].z / sa; cz++; }
                }
                if (!cx || !cz) continue;
                const rx = sx / cx, rz = sz / cz;
                if (Math.abs(rx) < 1e-6 || Math.abs(rz) < 1e-6) continue;
                let kMin = Infinity, kMax = -Infinity;
                for (let i = 0; i < n; i++) {
                    const k = Math.hypot(pts[i].x / rx, pts[i].z / rz);
                    if (k < kMin) kMin = k; if (k > kMax) kMax = k;
                }
                bands.push({ y: +key, wave: kMax - kMin });
            }
            bands.sort((a, b) => a.y - b.y);
            return bands;
        };

        // ── ② 매듭: 표식 그룹만 껐다 켜서 화소 차분 ──
        const renderPx = (model) => {
            const sc = Scene3D._thumbScene;
            Scene3D.clearGroup(sc);
            sc.add(Scene3D._thumbAmb, Scene3D._thumbDir, Scene3D._thumbRim);
            const g = new THREE.Group();
            g.add(model); sc.add(g);
            const d = Scene3D.ITEM_THUMB_DIR;
            Scene3D.thumbFrameToFit(Scene3D._thumbCam, g, new THREE.Vector3(d.x, d.y, d.z).normalize(), 1.06);
            Scene3D._thumbR.render(sc, Scene3D._thumbCam);
            return Scene3D._thumbR.domElement.toDataURL();
        };
        const decode = (url) => new Promise(resolve => {
            const im = new Image();
            im.onload = () => { cx.clearRect(0, 0, N, N); cx.drawImage(im, 0, 0, N, N); resolve(cx.getImageData(0, 0, N, N).data); };
            im.onerror = () => resolve(null);
            im.src = url;
        });

        for (const age of AGES) {
            for (const style of SOFT.concat(STIFF)) {
                try {
                    const isSoft = SOFT.indexOf(style) >= 0;
                    const flat = Scene3D.ageGearKind(age) === 'primal' && !isSoft;   // 이 조합만 정점이 복제된다
                    const model = Scene3D.makeArmorPreview(age, 'rare', style, '');
                    const bands = waveOf(model, flat);
                    if (!flat && (!bands || !bands.length)) { errs.push(age + '/' + style + ': 토르소 정점을 못 읽음'); continue; }
                    const has = !!(bands && bands.length);
                    const hem = has ? bands[0].wave : null, neck = has ? bands[bands.length - 1].wave : null;
                    // ⚠️ 프레이밍이 g 를 제자리에서 옮기므로, 두 번 렌더할 땐 **같은 model 을 그대로**
                    //    쓰되 매듭 가시성만 바꾼다(다시 build 하면 좌표가 달라져 차분이 오염된다).
                    const knots = [];
                    model.traverse(o => { if (o.userData && o.userData.knot) knots.push(o); });
                    const a = await decode(renderPx(model));
                    knots.forEach(k => { k.visible = false; });
                    const b = await decode(renderPx(model));
                    knots.forEach(k => { k.visible = true; });
                    let diff = 0;
                    if (a && b) for (let i = 0; i < N * N; i++) {
                        if (Math.abs(a[i * 4] - b[i * 4]) > 6 || Math.abs(a[i * 4 + 1] - b[i * 4 + 1]) > 6
                            || Math.abs(a[i * 4 + 2] - b[i * 4 + 2]) > 6 || Math.abs(a[i * 4 + 3] - b[i * 4 + 3]) > 6) diff++;
                    }
                    out.push({ age, style, soft: isSoft, draped: DRAPED.indexOf(style) >= 0, bands: has ? bands.length : 0, hem, neck, knots: knots.length, knotPx: diff });
                } catch (e) { errs.push(age + '/' + style + ': ' + e.message); }
            }
        }
        return { out, errs };
    }, { SOFT, STIFF, AGES, DRAPED });

    await browser.close();
    const cells = res.out;
    if (!cells.length) { console.log('FAIL — 잰 칸이 0'); process.exit(1); }

    const fails = [];
    const f4 = v => v === null ? '   —  ' : v.toFixed(4);
    console.log('시대        스타일  천?  밑단굴곡  목굴곡  드레이프  매듭수  매듭화소  판정');
    for (const c of cells) {
        const drape = c.hem === null ? null : c.hem > c.neck;
        let ok = true;
        if (c.soft) {
            if (c.draped) {
                if (!(c.hem >= WAVE_MIN)) { ok = false; fails.push(`${c.age}/${c.style} 밑단 굴곡 ${f4(c.hem)} < ${WAVE_MIN}`); }
                if (!drape) { ok = false; fails.push(`${c.age}/${c.style} 드레이프 역전 — 밑단 ${f4(c.hem)} ≤ 목 ${f4(c.neck)}`); }
                if (!c.knots) { ok = false; fails.push(`${c.age}/${c.style} 매듭 0개`); }
                if (c.knotPx < KNOT_PX_MIN) { ok = false; fails.push(`${c.age}/${c.style} 매듭이 화면에 ${c.knotPx}화소만 — 파묻혔다(하한 ${KNOT_PX_MIN})`); }
            } else {
                // 가죽: 조형 층이 **없어야** 통과다(위 사유). 여기가 FAIL 나면 age-shading 도 같이 무너진다.
                if (c.hem > 1e-4) { ok = false; fails.push(`${c.age}/${c.style} 가죽에 굴곡 ${f4(c.hem)} — age-shading 재질분리가 무너진다`); }
                if (c.knots) { ok = false; fails.push(`${c.age}/${c.style} 가죽에 매듭 ${c.knots}개 — age-shading 재질분리가 무너진다`); }
            }
        } else if (c.hem !== null) {   // 원시 판금은 flat 이라 정점 순서가 없어 못 잰다(위 주석)
            if (c.hem > 1e-4) { ok = false; fails.push(`${c.age}/${c.style} 판금인데 굴곡 ${f4(c.hem)} — 주름진 강철은 찌그러진 강철이다`); }
        }
        console.log(`${c.age.padEnd(11)} ${c.style.padEnd(6)} ${(c.draped ? '로브' : c.soft ? '가죽' : '판금').padEnd(4)} ${f4(c.hem).padStart(8)} ${f4(c.neck).padStart(7)}  ${(drape === null ? '측정불가' : drape ? 'ok' : '역전').padStart(7)}  ${String(c.knots).padStart(5)} ${String(c.knotPx).padStart(8)}  ${ok ? 'ok' : 'FAIL'}`);
    }
    for (const e of res.errs) { console.log('빌드 실패: ' + e); fails.push(e); }
    console.log('\n콘솔 에러 ' + errors.length);
    errors.slice(0, 5).forEach(e => console.log('  ' + e));
    if (errors.length) fails.push('콘솔 에러 ' + errors.length);
    console.log(fails.length ? '\nFAIL — ' + fails.length + '건\n  ' + fails.join('\n  ') : '\nPASS — ' + cells.length + '칸');
    process.exit(fails.length ? 1 : 0);
})();
