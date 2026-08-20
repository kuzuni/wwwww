// 배경 프롭(식생·바위)이 **정말로 큐브 조형인지** 기계적으로 재는 게이트 (`cute-art-direction` ③ 배경).
//
// 왜 이 자가 필요한가: 장비 쪽에서 화풍 정합 2/10 을 받은 이유는 '매끈해서'가 아니라 **면이
//   축정렬이 아니어서**였다(비스듬한 삼각형이 보이면 그 순간 voxel 로 안 읽힌다). 눈으로 "복셀
//   같은데?" 하는 판정은 비평가 채점에서 매번 뒤집혔으므로, 여기서는 **법선을 직접 센다**.
//
// 무엇을 재는가 (프롭 종별로):
//   ① **축정렬 법선 비율** — 지오메트리의 모든 법선이 ±x/±y/±z 여야 한다(허용 오차 1e-3).
//      100% 가 아니면 그 프롭에 아직 원뿔/라테/구가 남아 있다는 뜻이다.
//   ② **정점 색 존재** — `vertexColors` 재질을 쓰는 메시에 color 속성이 없으면 **통째로 검게**
//      찍힌다(scene3d 의 foliageMat 주석이 경고하는 사고). 하나라도 없으면 FAIL.
//   ③ **치수 유지** — 전환 전 실루엣 대역을 벗어나면 `probe-prop-blob`·`probe-nearfield-mass`
//      같은 기존 게이트가 같이 흔들린다. 종별 높이/폭을 옛 판 기준으로 견준다.
//   ④ **겹친 칸 없음** — 같은 자리에 면이 두 벌 있으면 z-파이팅으로 지글거린다. 프롭 안의 모든
//      메시를 모아 **같은 좌표·같은 법선의 면**이 두 번 나오는지 센다(0 이어야 한다).
//   ⑤ **개체차** — 8번 지어 (정점 수·높이·폭) 서명이 몇 가지 나오는가. 🚨 이게 필요한 이유:
//      옛 조형은 `sculptFoliage`/`rockGeo` 의 정점 노이즈가 개체차를 대신 내 주고 있었는데,
//      복셀은 격자를 지켜야 해서 정점을 못 흔든다. 전환 첫 판이 정확히 그 함정에 빠져
//      **침엽수 8그루가 바운딩 박스까지 완전히 동일**했다(`probe-foliage-sculpt` 가 잡아 줬다).
//      복셀에서 개체차는 **치수·단 수·`Voxel.rock` 의 seed** 로 낸다.
//
// ⚠️ 이 프로브는 exit 코드가 아니라 출력의 판정 줄로 읽을 것.
// 사용: node probe-prop-voxel.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const MIN_VARIANTS = 3;   // 8번 지어 최소 3가지 — 2가지면 이지선다(분기 하나)일 뿐 '개체차'가 아니다.

// [빌더, 인자, 기대 높이 대역(×s), 기대 폭 대역(×s)] — 대역은 전환 전 조형의 실측 치수에서 왔다.
const PROPS = [
    // 대역이 한 점이 아닌 이유: 복셀은 정점 노이즈로 개체차를 못 내므로 **단 수·치수로** 낸다(의도).
    ['makePine', [1], [1.45, 2.05], [0.85, 1.35]],
    ['makePine', [1, true], [1.45, 2.05], [0.85, 1.35]],
    ['makeRoundTree', [1], [1.2, 1.7], [0.8, 1.25]],
    ['makeDeadTree', [1], [0.9, 1.4], [0.5, 1.6]],
    ['makeCactus', [1], [0.9, 1.4], [0.25, 1.0]],
    ['makeDryShrub', [1], [0.15, 0.7], [0.3, 1.2]],
    ['makeBamboo', [1], [1.4, 2.7], [0.15, 1.0]],
    // 버섯 폭 대역이 넓은 건 조형이 흔들려서가 아니라 **곁 개체가 무작위 방위·거리에 붙기 때문**이다.
    // 전환 전 판의 산술: 곁 개체 거리 0.36~0.62s + 그 갓 반경 ≤0.46×0.55s → 한쪽 최대 0.87s,
    // 양쪽이면 폭 ≤1.75s. 하한은 곁 개체가 갓 아래 들어간 경우의 본체 갓 지름(0.68~0.92s).
    ['makeMushroom', [1], [0.5, 1.3], [0.85, 1.8]],
    // 바위 계열 — 전환 전 치수: 첨탑 ~1.5~2.2s, 볼더 0.67s 높이 × 0.9s 폭, 슬라브/지층은 납작하고 넓다.
    ['makeRockSpire', [1], [1.0, 2.4], [0.5, 1.6]],
    ['makeBoulder', [1], [0.4, 1.0], [0.6, 1.1]],
    ['makeBoulder', [1, true], [0.4, 1.2], [0.6, 1.1]],
    ['makeSlab', [1], [0.5, 1.5], [0.6, 1.6]],
    ['makeStrata', [1], [0.4, 1.2], [0.7, 1.8]],
    ['makeRockCluster', [1], [0.4, 1.3], [0.9, 2.0]],
    ['makeVolcanicRock', [1], [0.4, 1.2], [0.5, 1.4]],
    ['makeBones', [1], [0.15, 0.7], [0.5, 1.4]],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && !!Scene3D.trees)) break;
        await page.waitForTimeout(200);
    }

    const rows = await page.evaluate((PROPS) => {
        const out = [];
        for (const [fn, args, hBand, wBand] of PROPS) {
            // 같은 빌더를 여러 번 부른다 — 조형에 `Math.random` 분기가 있어(팔 유무·마디 수) 한 개체만
            // 재면 분기 하나를 통째로 못 본다. 최악값을 모아 판정한다.
            const agg = { name: fn + (args[1] ? '+snow' : ''), n: 0, meshes: 0, offAxis: 0, noColor: 0, dupFaces: 0, hMin: 1e9, hMax: -1e9, wMin: 1e9, wMax: -1e9 };
            const sigs = new Set();
            for (let it = 0; it < 8; it++) {
                const g = Scene3D[fn].apply(Scene3D, args);
                let verts = 0;
                g.traverse(m => { if (m.isMesh) verts += m.geometry.getAttribute('position').count; });
                const box = new THREE.Box3().setFromObject(g);
                const sz = box.getSize(new THREE.Vector3());
                agg.hMin = Math.min(agg.hMin, sz.y); agg.hMax = Math.max(agg.hMax, sz.y);
                const w = Math.max(sz.x, sz.z);
                agg.wMin = Math.min(agg.wMin, w); agg.wMax = Math.max(agg.wMax, w);
                const seen = new Set();
                g.traverse(m => {
                    if (!m.isMesh) return;
                    agg.meshes++;
                    const geo = m.geometry;
                    const nor = geo.getAttribute('normal'), pos = geo.getAttribute('position');
                    if (m.material && m.material.vertexColors && !geo.getAttribute('color')) agg.noColor++;
                    if (!nor) return;
                    for (let i = 0; i < nor.count; i++) {
                        const a = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))].sort((p, q) => q - p);
                        // 축정렬이면 최대 성분이 1, 나머지 둘이 0 이다.
                        if (Math.abs(a[0] - 1) > 1e-3 || a[1] > 1e-3) agg.offAxis++;
                    }
                    // 면 중복 — 삼각형의 무게중심 + 법선을 반올림해 키로 쓴다. 같은 프롭 안에서
                    // 두 메시가 같은 칸을 채우면 여기서 정확히 걸린다.
                    const wp = m.matrixWorld ? null : null;
                    m.updateMatrixWorld(true);
                    const v = new THREE.Vector3();
                    for (let t = 0; t < pos.count; t += 3) {
                        let cx = 0, cy = 0, cz = 0;
                        for (let k = 0; k < 3; k++) {
                            v.fromBufferAttribute(pos, t + k).applyMatrix4(m.matrixWorld);
                            cx += v.x / 3; cy += v.y / 3; cz += v.z / 3;
                        }
                        const key = [cx, cy, cz].map(q => Math.round(q * 2000)).join(',')
                            + '|' + [nor.getX(t), nor.getY(t), nor.getZ(t)].map(q => Math.round(q)).join(',');
                        if (seen.has(key)) agg.dupFaces++; else seen.add(key);
                    }
                });
                sigs.add(verts + ':' + Math.round(sz.y * 400) + ':' + Math.round(w * 400));
                agg.n++;
            }
            agg.variants = sigs.size;
            agg.hBand = hBand; agg.wBand = wBand;
            out.push(agg);
        }
        return out;
    }, PROPS);

    let fail = 0;
    console.log('프롭            메시  비축정렬법선  색없음  중복면  개체차   높이(×s)        폭(×s)');
    for (const r of rows) {
        const okAxis = r.offAxis === 0, okColor = r.noColor === 0, okDup = r.dupFaces === 0;
        const okH = r.hMin >= r.hBand[0] && r.hMax <= r.hBand[1];
        const okW = r.wMin >= r.wBand[0] && r.wMax <= r.wBand[1];
        const okVar = r.variants >= MIN_VARIANTS;
        if (!(okAxis && okColor && okDup && okH && okW && okVar)) fail++;
        console.log(
            r.name.padEnd(16) + String(r.meshes).padStart(4)
            + String(r.offAxis).padStart(13) + (okAxis ? ' ' : '✗')
            + String(r.noColor).padStart(7) + (okColor ? ' ' : '✗')
            + String(r.dupFaces).padStart(7) + (okDup ? ' ' : '✗')
            + (String(r.variants) + '/8').padStart(6) + (okVar ? ' ' : '✗')
            + ('  ' + r.hMin.toFixed(2) + '~' + r.hMax.toFixed(2)).padEnd(14) + (okH ? ' ' : '✗')
            + ('  ' + r.wMin.toFixed(2) + '~' + r.wMax.toFixed(2)).padEnd(14) + (okW ? ' ' : '✗'));
    }
    console.log('콘솔 에러: ' + errs.length + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
    console.log(fail === 0 && errs.length === 0 ? '판정: PASS — 배경 프롭 전부 축정렬 큐브 조형' : `판정: FAIL (${fail}종 미달)`);
    await browser.close();
})();
