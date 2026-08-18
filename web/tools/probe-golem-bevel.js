// 골렘 조형(ⓒ 베벨 지오메트리) 실측 — 사용: node probe-golem-bevel.js
// TODO '적 몬스터 퀄리티 업'(slug: enemy-quality) 의 잔여 ⓒ "베벨 지오메트리 — 구·박스 그대로인 부위" 검증.
// 적용 전 골렘의 어깨 볼더·팔꿈치·주먹·너클·골반·발·머리는 전부 `SphereGeometry`, 눈두덩은 `BoxGeometry`,
// 목은 `CylinderGeometry` 였다. `flatShading` 이 켜져 있어 **면은** 갈려 있었지만 **실루엣이 완전한 원**이라
// 가까이서 '눈사람'으로 읽혔다(골렘 주석이 스스로 '눈사람 금지'라 적어 둔 바로 그것).
//
// ⚠️ 이 프로브는 인자를 손으로 베끼지 않는다 — 함정 ④⑴('자가 코드보다 낡으면 판정 전부가 무효')에 걸린다.
//    `Scene3D.monsterMesh()` 를 **진짜 코드 경로로** 태워 나온 메시를 재고, 게이트에 쓰는 수치는 전부
//    측정값에서 뽑는다. 유일한 예외는 ④(결정론)로, 그건 헬퍼 계약 자체를 재는 것이라 직접 호출한다.
//
// 지표 5종:
//  ① 프리미티브 잔존 — 바위 재질(rockTex 맵을 문 메시)에 `SphereGeometry`/`BoxGeometry` 가 남아 있으면 실패.
//     ⚠️ 이끼(MeshLambert, 맵 없음)와 마그마 균열(MeshBasic)은 **일부러 구·박스로 남긴 것**이라 제외한다 —
//        이끼는 무른 유기물이고, 균열은 0.013 폭이라 베벨을 넣어도 화면에 아무 차이가 없다.
//  ② 실루엣 비대칭 — 중심에서 정점까지 거리의 변동계수(sd/mean). 완전구는 0 이다.
//  ③ 무결성 — 위치로 정점을 병합했을 때 **모든 모서리가 정확히 삼각형 2개에 공유**돼야 한다(닫힌 다면체).
//     좌표 해시가 아니라 정점 인덱스로 변위를 주면 중복 정점이 갈라져 여기서 경계 모서리로 잡힌다.
//     `IcosahedronGeometry` 는 비인덱스라 같은 모서리 정점이 여러 벌 있고, detail>0 이면 세분 보간이
//     면마다 미세하게 달라 **생좌표로 해시하면 그 오차만큼 갈라진다** — 그래서 양자화가 필수다.
//  ④ 결정론 — 같은 seed 로 두 번 부르면 정점이 비트 단위로 같아야 한다(프로브 재현성 · 전역 RNG 불소비).
//  ⑤ 개체차 — 파츠끼리 같은 덩어리면 '복붙'이다. ⚠️ **상관계수로 재지 말 것** — 기반 형상이 공통이면
//     노이즈가 아무리 달라도 상관은 자동으로 1 에 가깝다(잎 조형에서 0.9968 로 오반려된 함정).
//     반지름을 평균으로 정규화한 뒤 **같은 자리 정점끼리의 RMS 차**로 본다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CV_MIN = 0.055;   // 반경 변동계수 하한 — 완전구는 0
const DIFF_MIN = 0.040; // 파츠 간 정규화 반경 RMS 차 (잎/바위 조형과 같은 게이트)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene, null, { timeout: 60000 });
    await page.waitForTimeout(1200);

    const res = await page.evaluate(() => {
        const out = { rockPrims: [], boulders: [], det: null, pairs: [], nRock: 0, nCapsule: 0 };

        // ── 진짜 코드 경로: 골렘을 그대로 조립시킨다 ──
        const g = Scene3D.monsterMesh({ id: 1 }).g;   // monsterMesh 는 그룹이 아니라 파츠 묶음을 준다 — .g 가 씬 그룹

        const radii = (pos, cx, cy, cz) => {
            const r = [];
            for (let i = 0; i < pos.count; i++) r.push(Math.hypot(pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz));
            return r;
        };
        const centroid = pos => {
            let x = 0, y = 0, z = 0;
            for (let i = 0; i < pos.count; i++) { x += pos.getX(i); y += pos.getY(i); z += pos.getZ(i); }
            return [x / pos.count, y / pos.count, z / pos.count];
        };

        // `ProChar.capsule` 은 Cylinder + 아래쪽 반구 캡 2피스다. 이건 **영웅도 쓰는 공용 사지 프리미티브**라
        // ⓒ 가 말하는 '구·박스 그대로인 부위'가 아니다 — 피벗이 위쪽 끝인 분절 리그가 여기 얹혀 있어
        // 지오메트리를 갈아끼우면 굽힘이 통째로 틀어진다. 그래서 ① 게이트에서 제외한다.
        // 판별: 부모 그룹의 자식이 정확히 2개이고, 같은 재질의 Cylinder + Sphere 인가.
        const isCapsulePart = m => {
            const p = m.parent;
            if (!p || !p.isGroup || p.children.length !== 2) return false;
            const ts = p.children.map(c => c.isMesh ? c.geometry.type : '').sort().join('+');
            return ts === 'CylinderGeometry+SphereGeometry' && p.children[0].material === p.children[1].material;
        };

        g.traverse(m => {
            if (!m.isMesh || !m.material) return;
            // 바위 재질 = rockTex 맵을 문 것(이끼 MeshLambert·마그마 MeshBasic 제외)
            if (!m.material.map) return;
            out.nRock++;
            const t = m.geometry.type;
            if (isCapsulePart(m)) { out.nCapsule++; return; }
            if (t === 'SphereGeometry' || t === 'BoxGeometry' || t === 'CylinderGeometry') out.rockPrims.push(t);
            if (t !== 'IcosahedronGeometry') return;

            const pos = m.geometry.attributes.position;
            const [cx, cy, cz] = centroid(pos);
            const rs = radii(pos, cx, cy, cz);
            const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
            const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rs.length);

            // ③ 무결성 — 위치 병합 후 모든 모서리가 삼각형 2개에 공유되는가(구멍/갈라짐 검사)
            const key = i => [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => Math.round(v * 1e5)).join(',');
            const edges = new Map();
            for (let f = 0; f < pos.count; f += 3) {
                const k = [key(f), key(f + 1), key(f + 2)];
                for (let e = 0; e < 3; e++) {
                    const ek = [k[e], k[(e + 1) % 3]].sort().join('|');
                    edges.set(ek, (edges.get(ek) || 0) + 1);
                }
            }
            let openEdges = 0;
            for (const c of edges.values()) if (c !== 2) openEdges++;

            out.boulders.push({ n: pos.count, cv: mean ? sd / mean : 0, mean, openEdges, prof: rs.map(r => r / mean) });
        });

        // ④ 결정론 — 같은 seed 두 번. 헬퍼 계약이라 여기만 직접 호출한다.
        {
            const a = Scene3D.boulderGeo(0.17, 41, { amp: 0.24 }).attributes.position;
            const b = Scene3D.boulderGeo(0.17, 41, { amp: 0.24 }).attributes.position;
            let worst = 0;
            for (let i = 0; i < a.count; i++) {
                worst = Math.max(worst, Math.abs(a.getX(i) - b.getX(i)), Math.abs(a.getY(i) - b.getY(i)), Math.abs(a.getZ(i) - b.getZ(i)));
            }
            out.det = { n: a.count, worst };
        }

        // ⑤ 개체차 — 같은 정점 수를 가진 파츠끼리 정규화 반경 RMS 차
        for (let i = 0; i < out.boulders.length; i++) {
            for (let j = i + 1; j < out.boulders.length; j++) {
                const A = out.boulders[i].prof, B = out.boulders[j].prof;
                if (A.length !== B.length) continue;
                let s = 0;
                for (let k = 0; k < A.length; k++) s += (A[k] - B[k]) * (A[k] - B[k]);
                out.pairs.push(Math.sqrt(s / A.length));
            }
        }
        for (const b of out.boulders) delete b.prof;
        return out;
    });

    const fails = [];
    console.log(`바위 재질 메시 ${res.nRock}개 · boulderGeo ${res.boulders.length}개 · 공용 캡슐 사지 파츠 ${res.nCapsule}개(게이트 제외)`);

    // ①
    if (res.rockPrims.length) fails.push(`① 바위 재질에 프리미티브 잔존: ${res.rockPrims.join(', ')}`);
    console.log(`① 프리미티브 잔존 ... ${res.rockPrims.length === 0 ? 'PASS (0)' : 'FAIL ' + res.rockPrims.join(',')}`);

    // ②③
    const cvs = res.boulders.map(b => b.cv);
    const minCv = Math.min(...cvs), open = res.boulders.reduce((a, b) => a + b.openEdges, 0);
    if (!res.boulders.length) fails.push('② boulderGeo 메시가 하나도 안 잡혔다 — 코드 경로 확인 필요');
    if (minCv < CV_MIN) fails.push(`② 반경 변동계수 최소 ${minCv.toFixed(4)} < ${CV_MIN} (완전구에 가깝다)`);
    console.log(`② 실루엣 비대칭 min ${minCv.toFixed(4)} / max ${Math.max(...cvs).toFixed(4)} (게이트 ${CV_MIN}) ... ${minCv >= CV_MIN ? 'PASS' : 'FAIL'}`);
    if (open) fails.push(`③ 갈라진 모서리 ${open}개 — 메시에 구멍이 뚫렸다`);
    console.log(`③ 무결성 경계 모서리 ${open}개 ... ${open === 0 ? 'PASS' : 'FAIL'}`);

    // ④
    if (res.det.worst !== 0) fails.push(`④ 같은 seed 인데 정점이 다르다 (최대 ${res.det.worst})`);
    console.log(`④ 결정론 정점 ${res.det.n}개 최대 차 ${res.det.worst} ... ${res.det.worst === 0 ? 'PASS' : 'FAIL'}`);

    // ⑤
    const minPair = res.pairs.length ? Math.min(...res.pairs) : 0;
    if (res.pairs.length && minPair < DIFF_MIN) fails.push(`⑤ 파츠 간 최소차 ${minPair.toFixed(4)} < ${DIFF_MIN} (사실상 같은 덩어리)`);
    console.log(`⑤ 개체차 ${res.pairs.length}쌍 최소 ${minPair.toFixed(4)} (게이트 ${DIFF_MIN}) ... ${res.pairs.length === 0 || minPair >= DIFF_MIN ? 'PASS' : 'FAIL'}`);

    if (errors.length) fails.push(`콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);
    console.log(`콘솔 에러 ${errors.length}건`);

    await browser.close();
    if (fails.length) { console.log('\nFAIL:\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('\n전부 PASS');
})();
