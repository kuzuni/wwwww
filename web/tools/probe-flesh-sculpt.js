// 살·털 종 조형(ⓒ 유기 변형) 실측 — 사용: node probe-flesh-sculpt.js [종...]  (기본: 늑대·고블린·임프)
// TODO '적 몬스터 퀄리티 업'(slug: enemy-quality) ⓒ 의 골렘 이후 분. 골렘은 `boulderGeo` 로 **각지게**
// 깎았지만 늑대·고블린·임프는 살이라 같은 자를 대면 '수정 늑대'가 된다 — `Scene3D.sculptOrganic` 은
// 저주파·저진폭으로 **부드럽게** 윤곽만 깬다. 그래서 게이트도 golem 쪽(probe-golem-bevel)과 다르다.
//
// ⚠️ 인자를 손으로 베끼지 않는다(함정 ④⑴) — 늑대는 `Scene3D.monsterMesh()` 를 진짜로 태워서 잰다.
//    ②④ 만 헬퍼 계약 자체를 재는 것이라 직접 호출한다.
//
// 지표 4종:
//  ① 실루엣 비대칭 — 완전구는 반경 변동계수 0 이다. 유기 변형은 골렘보다 **일부러 약하므로** 게이트도 낮다.
//  ② 이음새 무결성 — `SphereGeometry` 는 인덱스 지오메트리지만 **uv 이음새(u=0/u=1)와 극점에 같은
//     좌표의 정점이 여러 벌** 있다. 인덱스로 변위를 뽑으면 그 사본들이 제각각 움직여 이음새가 찢어진다.
//     변형 **전에 같은 좌표였던 정점 무리가 변형 후에도 한 점에 모여 있는가**를 직접 본다.
//  ③ 부드러움 — 이웃 삼각형 법선 사이 각. 각지게 깎였으면(=boulderGeo 를 잘못 쓴 것) 여기서 튄다.
//  ④ 결정론 — 같은 seed 두 번이면 정점이 비트 단위로 같아야 한다(전역 RNG 불소비).
//  ⑤ 개체차 — 파츠끼리 사실상 같은 덩어리면 '복붙'이다. ⚠️ 상관계수 금지(기반 형상이 공통이면 자동 1).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CV_MIN = 0.022;    // 완전구는 0. 유기 변형은 골렘(0.055)보다 약하게 거는 게 의도다.
const SMOOTH_MAX = 34;   // 이웃 면 법선각 평균 상한(도) — 넘으면 결정처럼 각졌다는 뜻
const DIFF_MIN = 0.015;  // 파츠 간 정규화 반경 RMS 차
const KINDS = process.argv.slice(2).length ? process.argv.slice(2) : ['wolf', 'goblin', 'imp'];

const runKind = async (browser, KIND) => {
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene, null, { timeout: 60000 });
    await page.waitForTimeout(1200);

    const res = await page.evaluate(() => {
        const out = { masses: [], seam: null, det: null, pairs: [], nSphere: 0, nCapsule: 0 };

        const g = Scene3D.monsterMesh({ id: 1 }).g;   // .g 가 씬 그룹 (monsterMesh 는 파츠 묶음을 준다)

        // `ProChar.capsule`(Cylinder + 아래쪽 반구 캡)은 영웅도 쓰는 **공용 사지 프리미티브**라
        // ⓒ 대상이 아니다 — 피벗이 위쪽 끝인 분절 리그가 얹혀 있어 지오메트리를 갈면 굽힘이 틀어진다.
        // 캡도 furM/furD 를 물고 있어 재질 필터만으로는 안 걸러진다(실측: 8개가 그대로 섞여 들어와
        // 좌우 대칭 캡끼리 최소차 0.0000 을 냈다). golem 쪽 프로브와 같은 판별을 쓴다.
        const isCapsulePart = m => {
            // ⚠️ 자식 수로 판별하지 말 것 — 분절 사지는 캡슐 그룹에 **다음 마디를 매달아** 키운다
            //    (`upper.add(lower)`·`lower.add(paw)`). 늑대는 그래서 자식이 3개라 '정확히 2개' 조건이
            //    통째로 빗나갔고 캡 8개가 게이트에 섞여 들어왔다(실측: 좌우 대칭 캡끼리 최소차 0.0000).
            //    구조로 본다 — 같은 재질의 Cylinder 형제가 있으면 그건 캡슐의 반구 캡이다.
            //    ⚠️ 반대로 '같은 재질 Cylinder 형제가 있으면 캡슐'로 느슨하게 보면 이번엔 **몸통이
            //    통째로 제외된다** — 늑대는 `belly`·`neckW` 원기둥이 흉곽·골반과 같은 furM 을 물고
            //    같은 그룹에 있다(실측: 측정 대상이 19개에서 7개로 줄었다).
            //    캡슐의 캡은 기하학적으로 확정된다: 캡 반지름 = 원기둥 아래 반지름이고,
            //    원기둥이 y=-len/2, 캡이 y=-len 이라 **캡의 y 는 정확히 원기둥 y 의 2배**다.
            //    캡슐은 두 피스 다 게이트 밖이라 **양쪽 역할을 다 본다** — 캡만 걸러내면 원기둥 6개가
            //    그대로 '프리미티브 잔존'으로 잡힌다(실측).
            const p = m.parent;
            if (!p || !p.isGroup) return false;
            const pair = (sph, cyl) => {
                const r = sph.geometry.parameters && sph.geometry.parameters.radius;
                const cp = cyl.geometry.parameters || {};
                return r !== undefined && Math.abs(cp.radiusBottom - r) < 1e-9
                    && Math.abs(sph.position.y - 2 * cyl.position.y) < 1e-9;
            };
            const t = m.geometry.type;
            if (t !== 'SphereGeometry' && t !== 'CylinderGeometry') return false;
            return p.children.some(c => {
                if (c === m || !c.isMesh || c.material !== m.material) return false;
                if (t === 'SphereGeometry') return c.geometry.type === 'CylinderGeometry' && pair(m, c);
                return c.geometry.type === 'SphereGeometry' && pair(c, m);
            });
        };

        // ── ① 실루엣: 늑대의 구 유래 메시를 진짜 코드 경로에서 잰다 ──
        g.traverse(m => {
            if (!m.isMesh || m.geometry.type !== 'SphereGeometry') return;
            // 털 재질(hideTex 맵을 문 것)만 — 눈알(흰자·홍채·동공·하이라이트)은 **완전구가 정답**이라
            // 여기에 섞이면 ①⑤ 가 영원히 FAIL 한다(실측: 필터 없이 34개가 잡혀 최소차 0.0000).
            // 코(MeshBasic, 맵 없음)도 광택 구슬이라 그대로 둔다.
            if (!m.material || !m.material.map) return;
            if (isCapsulePart(m)) { out.nCapsule++; return; }
            const pos = m.geometry.attributes.position;
            out.nSphere++;
            let cx = 0, cy = 0, cz = 0;
            for (let i = 0; i < pos.count; i++) { cx += pos.getX(i); cy += pos.getY(i); cz += pos.getZ(i); }
            cx /= pos.count; cy /= pos.count; cz /= pos.count;
            const rs = [];
            for (let i = 0; i < pos.count; i++) rs.push(Math.hypot(pos.getX(i) - cx, pos.getY(i) - cy, pos.getZ(i) - cz));
            const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
            const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rs.length);

            // ③ 부드러움 — 인덱스를 공유하는 이웃 삼각형끼리 법선각
            const idx = m.geometry.index;
            let angSum = 0, angN = 0, angMax = 0;
            if (idx) {
                const triN = [], edge = new Map();
                const V = i => [pos.getX(i), pos.getY(i), pos.getZ(i)];
                for (let f = 0; f < idx.count; f += 3) {
                    const a = V(idx.getX(f)), b = V(idx.getX(f + 1)), c = V(idx.getX(f + 2));
                    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
                    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
                    const L = Math.hypot(n[0], n[1], n[2]) || 1;
                    triN.push([n[0] / L, n[1] / L, n[2] / L]);
                    const t = triN.length - 1;
                    for (const [p1, p2] of [[idx.getX(f), idx.getX(f + 1)], [idx.getX(f + 1), idx.getX(f + 2)], [idx.getX(f + 2), idx.getX(f)]]) {
                        const k = [p1, p2].sort((x, y) => x - y).join('_');
                        if (edge.has(k)) {
                            const o = triN[edge.get(k)];
                            const d = Math.min(1, Math.max(-1, o[0] * triN[t][0] + o[1] * triN[t][1] + o[2] * triN[t][2]));
                            const ang = Math.acos(d) * 180 / Math.PI;
                            angSum += ang; angN++; angMax = Math.max(angMax, ang);
                        } else edge.set(k, t);
                    }
                }
            }
            out.masses.push({ n: pos.count, cv: mean ? sd / mean : 0, angMean: angN ? angSum / angN : 0, angMax, prof: rs.map(r => r / mean) });
        });

        // ── ② 이음새 무결성: 변형 **전** 좌표로 무리를 짓고, 변형 후에도 한 점인지 본다 ──
        {
            const raw = new THREE.SphereGeometry(0.19, 12, 9);
            const rp = raw.attributes.position;
            const groups = new Map();
            for (let i = 0; i < rp.count; i++) {
                const k = [rp.getX(i), rp.getY(i), rp.getZ(i)].map(v => Math.round(v * 1e6)).join(',');
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k).push(i);
            }
            const shared = [...groups.values()].filter(a => a.length > 1);
            const sc = Scene3D.sculptOrganic(new THREE.SphereGeometry(0.19, 12, 9), 2, { amp: 0.10 }).attributes.position;
            let split = 0, worst = 0;
            for (const grp of shared) {
                for (let j = 1; j < grp.length; j++) {
                    const d = Math.max(
                        Math.abs(sc.getX(grp[0]) - sc.getX(grp[j])),
                        Math.abs(sc.getY(grp[0]) - sc.getY(grp[j])),
                        Math.abs(sc.getZ(grp[0]) - sc.getZ(grp[j])));
                    worst = Math.max(worst, d);
                    if (d > 1e-9) split++;
                }
            }
            out.seam = { groups: shared.length, split, worst };
        }

        // ── ④ 결정론 ──
        {
            const a = Scene3D.sculptOrganic(new THREE.SphereGeometry(0.16, 11, 8), 3, { amp: 0.10 }).attributes.position;
            const b = Scene3D.sculptOrganic(new THREE.SphereGeometry(0.16, 11, 8), 3, { amp: 0.10 }).attributes.position;
            let worst = 0;
            for (let i = 0; i < a.count; i++) {
                worst = Math.max(worst, Math.abs(a.getX(i) - b.getX(i)), Math.abs(a.getY(i) - b.getY(i)), Math.abs(a.getZ(i) - b.getZ(i)));
            }
            out.det = { n: a.count, worst };
        }

        // ── ⑤ 개체차 ──
        for (let i = 0; i < out.masses.length; i++) {
            for (let j = i + 1; j < out.masses.length; j++) {
                const A = out.masses[i].prof, B = out.masses[j].prof;
                if (A.length !== B.length) continue;
                let s = 0;
                for (let k = 0; k < A.length; k++) s += (A[k] - B[k]) * (A[k] - B[k]);
                out.pairs.push(Math.sqrt(s / A.length));
            }
        }
        for (const m of out.masses) delete m.prof;
        return out;
    });

    await page.close();
    const fails = [];
    console.log(`\n[${KIND}] 구 유래 덩어리 ${res.nSphere}개 · 공용 캡슐 캡 ${res.nCapsule}개(게이트 제외)`);

    const cvs = res.masses.map(m => m.cv);
    const minCv = Math.min(...cvs);
    if (!res.masses.length) fails.push('① 덩어리가 하나도 안 잡혔다 — 코드 경로 확인 필요');
    if (minCv < CV_MIN) fails.push(`① 반경 변동계수 최소 ${minCv.toFixed(4)} < ${CV_MIN} (완전구가 남아 있다)`);
    console.log(`① 실루엣 비대칭 min ${minCv.toFixed(4)} / max ${Math.max(...cvs).toFixed(4)} (게이트 ${CV_MIN}) ... ${minCv >= CV_MIN ? 'PASS' : 'FAIL'}`);

    if (res.seam.split) fails.push(`② 이음새 ${res.seam.split}쌍이 찢어졌다 (최대 ${res.seam.worst})`);
    console.log(`② 이음새 공유 정점군 ${res.seam.groups}개 · 찢어진 쌍 ${res.seam.split}개 ... ${res.seam.split === 0 ? 'PASS' : 'FAIL'}`);

    const angMean = Math.max(...res.masses.map(m => m.angMean));
    if (angMean > SMOOTH_MAX) fails.push(`③ 이웃 법선각 평균 최대 ${angMean.toFixed(1)}° > ${SMOOTH_MAX}° (각졌다 — 살에 바위 자를 댄 것)`);
    console.log(`③ 부드러움 이웃 법선각 평균 최대 ${angMean.toFixed(1)}° (상한 ${SMOOTH_MAX}°) ... ${angMean <= SMOOTH_MAX ? 'PASS' : 'FAIL'}`);

    if (res.det.worst !== 0) fails.push(`④ 같은 seed 인데 정점이 다르다 (최대 ${res.det.worst})`);
    console.log(`④ 결정론 정점 ${res.det.n}개 최대 차 ${res.det.worst} ... ${res.det.worst === 0 ? 'PASS' : 'FAIL'}`);

    const minPair = res.pairs.length ? Math.min(...res.pairs) : 0;
    if (res.pairs.length && minPair < DIFF_MIN) fails.push(`⑤ 파츠 간 최소차 ${minPair.toFixed(4)} < ${DIFF_MIN}`);
    console.log(`⑤ 개체차 ${res.pairs.length}쌍 최소 ${minPair.toFixed(4)} (게이트 ${DIFF_MIN}) ... ${res.pairs.length === 0 || minPair >= DIFF_MIN ? 'PASS' : 'FAIL'}`);

    if (errors.length) fails.push(`콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}`);
    console.log(`콘솔 에러 ${errors.length}건`);

    return fails.map(f => `[${KIND}] ${f}`);
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    let all = [];
    for (const k of KINDS) all = all.concat(await runKind(browser, k));
    await browser.close();
    if (all.length) { console.log('\nFAIL:\n - ' + all.join('\n - ')); process.exit(1); }
    console.log(`\n${KINDS.length}종 전부 PASS`);
})();
