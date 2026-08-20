// probe-midground-depth.js — '중경(카메라 15~60m) 공백'을 **월드 깊이 대역별 시각 질량**으로 잰다.
//   (`map-quality-up` 2026-08-19(16) 채점 잔여: 비평가 2인 공통 지적 "중경이 비었다".)
//
// ── 왜 새 자가 필요한가 ────────────────────────────────────────────────────────
//   선행 자 `probe-nearfield-mass` 는 **화면 띠**(바닥~지평선 3등분)로 나눈다. 그런데 지적은
//   **월드 깊이** 대역(15~60m)이다. 이 둘은 같지 않다 — 화면 '중경 띠'에는 카메라에서 8m 인 큰
//   소품의 윗동도, 30m 인 능선 밑동도 같이 들어간다. 실제로 선행 자는 중경 띠 점유 10~27% 로
//   **전 챕터 통과**를 찍는데 비평가 두 명은 같은 화면을 "중경 공백"이라 했다. 둘 다 맞다 —
//   **띠는 찼는데 그 안을 채운 게 근경 소품의 상단과 원경 능선이고, 그 사이 깊이엔 아무것도 없다.**
//
// ── 재는 것 ────────────────────────────────────────────────────────────────────
//   씬에 실제로 만들어진 요소(인스턴스 스캐터 + `trees`/`rocks` 프롭)를 **카메라로부터의 거리**로
//   3대역에 넣고, 대역마다 화면 점유 면적(px²)과 '큰 요소' 수를 낸다.
//     · 근경  = 거리 < NEAR_D
//     · 중경  = NEAR_D ~ MID_D      ← 지적 대상
//     · 원경  = MID_D 초과 (능선은 스크롤 대상이 아니라 제외 — 아래 참조)
//   🚨 **능선(mountains/hills)은 세지 않는다.** 능선은 `fog:false` 순색 판이고 카메라를 따라다니는
//      배경 벽이라, 넣으면 중·원경이 항상 포화돼 이 자가 재려는 '깊이의 물체'가 통째로 가려진다.
//      원경 능선의 층 분리는 별도 자(`probe-ridge-layers`)가 이미 맡고 있다.
//
// 🚨 **거리는 코드 상수가 아니라 실제 `camera.position` 에서 잰다** (TODO 함정 ④ — 상수 베끼기 금지).
// 🚨 **접지 블롭 제외 · `rocks` 까지 훑기 · 재빌드 시드 고정** — 셋 다 선행 자가 밟고 기록한 함정이라
//    같은 규약을 그대로 따른다(`probe-nearfield-mass` 머리말 참조).
//
// ── 안정성 (regress.sh 등재 전에 확인한 것) ────────────────────────────────────
//   같은 코드 3회의 챕터별 중경 점유%: 최악 챕터(용암)가 7.32 / 7.47 / 7.32 로 폭 0.15,
//   전 챕터 폭도 ≤0.98. 기준선 6.0 대비 최소값이 22% 여유다(재빌드 시드 고정 덕분).
//
// 사용: node probe-midground-depth.js      # 게이트. 중경 지표 미달이면 종료코드 1
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CHAPTERS = [1, 2, 3, 5, 7, 9];   // 초원·사막·바위산·밤숲·마법·용암
const VW = 480, VH = 854;
const NEAR_D = 15, MID_D = 60;   // 카메라로부터의 거리(유닛=m) 경계 — 지적 원문 '15~60m'
const BIG_PX = 400;              // 선행 자와 같은 '큰 요소' 하한(지름 23px)
const REBUILDS = 3, PANS = 13, PERIOD = 30;

// 게이트 — 수정 전 실측(전 챕터 중경 점유 0.3~4.5% · 큰 요소 0~2개)과
// 수정 후 실측 사이에서 잡은 선. 두 지표를 **함께** 걸어야 한다:
// 점유%만 걸면 잔자갈을 더 뿌려 통과할 수 있고(그게 근경에서 이미 겪은 실패다),
// 큰 요소 수만 걸면 덩치 하나 놓고 나머지를 비워도 통과한다.
const GATE_OCC = 6.0, GATE_BIG = 6;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && Scene3D.scatter, null, { timeout: 60000 });
    await page.waitForTimeout(1200);

    const rows = [];
    for (const ch of CHAPTERS) {
        const r = await page.evaluate(([chapter, VW, BIG_PX, REBUILDS, PANS, PERIOD, NEAR_D, MID_D]) => {
            const acc = [0, 1, 2].map(() => ({ area: 0, big: 0, n: 0, max: 0 }));
            for (let rep = 0; rep < REBUILDS; rep++) {
                // 재빌드마다 **고정** 시드(선행 자와 같은 이유 — 안 하면 실행 간 재현성이 없어 게이트로 못 쓴다)
                let rs = (0x9e3779b9 ^ Math.imul(rep + 1, 0x85ebca6b)) >>> 0;
                Math.random = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
                Scene3D.setChapterTheme(chapter);
                const cam = Scene3D.camera;
                Scene3D.scene.updateMatrixWorld(true);
                cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

                const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
                const hp = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(1e4).add(cam.position);
                hp.project(cam);
                const yHor = Math.min(1, hp.y);

                const items = [];
                const m = new THREE.Matrix4(), v = new THREE.Vector3();
                for (const key of ['scatter', 'scatter3', 'scatter2']) {
                    const im = Scene3D[key];
                    if (!im || !im.geometry) continue;
                    if (!im.geometry.boundingSphere) im.geometry.computeBoundingSphere();
                    const br = im.geometry.boundingSphere.radius;
                    for (let i = 0; i < im.count; i++) {
                        im.getMatrixAt(i, m);
                        m.premultiply(im.matrixWorld);
                        v.setFromMatrixPosition(m);
                        const e = m.elements;
                        const s = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
                        items.push([v.x, v.y, v.z, br * s]);
                    }
                }
                // 블롭 제외 박스 — 블롭은 실루엣의 1.9배라 그냥 재면 박스를 지배한다(선행 자 실측 3.6배 부풀음)
                const boxNoBlob = (root) => {
                    const b = new THREE.Box3();
                    root.traverse(c => {
                        if (!c.isMesh || (c.userData && c.userData.sharedGeometry)) return;
                        c.updateWorldMatrix(false, false);
                        if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
                        b.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld));
                    });
                    return b;
                };
                for (const o of [...(Scene3D.trees || []), ...(Scene3D.rocks || [])]) {
                    if (!o || !o.visible) continue;
                    const box = boxNoBlob(o);
                    if (box.isEmpty()) continue;
                    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
                    items.push([c.x, c.y, c.z, Math.max(sz.x, sz.y, sz.z) / 2]);
                }

                const right = new THREE.Vector3(), off = new THREE.Vector3(), ctr = new THREE.Vector3();
                const baseX = 0.15;
                for (let s = 0; s < PANS; s++) {
                    const dx = -PERIOD / 2 + PERIOD * s / PANS;
                    cam.position.x = baseX + dx;
                    cam.lookAt(baseX + dx, 0.9, 0);
                    cam.updateMatrixWorld(true);
                    right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
                    for (const it of items) {
                        ctr.set(it[0], it[1], it[2]);
                        const d = ctr.distanceTo(cam.position);          // ← 실제 카메라에서 잰 거리
                        const wz = ctr.clone().project(cam);
                        if (wz.z > 1 || wz.x < -1.25 || wz.x > 1.25 || wz.y < -1 || wz.y > yHor) continue;
                        off.copy(ctr).addScaledVector(right, it[3]).project(cam);
                        const rpx = Math.abs(off.x - wz.x) * VW / 2;
                        if (!(rpx > 0)) continue;
                        const area = Math.PI * rpx * rpx;
                        const b = d < NEAR_D ? 0 : d <= MID_D ? 1 : 2;
                        const a = acc[b];
                        a.area += area; a.n++;
                        if (area > a.max) a.max = area;
                        if (area >= BIG_PX) a.big++;
                    }
                }
                cam.position.x = baseX; cam.lookAt(baseX, 0.9, 0); cam.updateMatrixWorld(true);
            }
            return { acc };
        }, [ch, VW, BIG_PX, REBUILDS, PANS, PERIOD, NEAR_D, MID_D]);
        rows.push({ ch, acc: r.acc });
    }

    const yHor = await page.evaluate(() => {
        const cam = Scene3D.camera; cam.updateMatrixWorld(true);
        const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
        const hp = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(1e4).add(cam.position);
        hp.project(cam);
        return Math.min(1, hp.y);
    });
    await page.close(); await browser.close();

    // 기준 면적 = 지평선 아래 화면 전체(대역은 화면을 나누는 게 아니라 깊이로 나누므로 분모가 하나다)
    const refPx = VW * (VH * (yHor + 1) / 2) * REBUILDS * PANS;
    const NAME = [`근경(<${NEAR_D}m)`, `중경(${NEAR_D}~${MID_D}m)`, `원경(>${MID_D}m)`];
    console.log(`\n===== 중경 시각 질량 — 월드 깊이 대역 (지평선 아래 화면 ${(refPx / REBUILDS / PANS | 0)}px² · ${REBUILDS}빌드×${PANS}패닝 합산) =====`);
    console.log(`능선 3겹은 제외(배경 벽) · 큰 요소 ≥ ${BIG_PX}px²\n`);
    console.log('챕터  대역             개수     점유%   큰요소수   최대(px²)');
    const mid = [];
    for (const r of rows) {
        for (let b = 0; b < 3; b++) {
            const a = r.acc[b];
            const occ = 100 * a.area / refPx;
            if (b === 1) mid.push({ ch: r.ch, occ, big: a.big / (REBUILDS * PANS) });
            console.log(`ch${String(r.ch).padEnd(3)} ${NAME[b].padEnd(16)} ${String(a.n).padStart(6)} ${occ.toFixed(2).padStart(8)} `
                + `${(a.big / (REBUILDS * PANS)).toFixed(1).padStart(9)} ${a.max.toFixed(0).padStart(11)}`);
        }
        console.log('');
    }
    const fails = mid.filter(m => m.occ < GATE_OCC || m.big < GATE_BIG);
    console.log(`참고선 중경 점유≥${GATE_OCC}% · 큰요소 ≥${GATE_BIG}개(패닝 1자리 평균)`);
    for (const f of fails) console.log(`  ✗ ch${f.ch} 중경 점유 ${f.occ.toFixed(2)}% · 큰요소 ${f.big.toFixed(1)}개`);
    console.log(fails.length ? `❌ ${fails.length}건 미달 — 중경이 비어 있다` : '✅ 전 챕터 통과 — 중경에 깊이를 만드는 물체가 있다');
    console.log(`콘솔 에러 ${errs.length}건`);
    if (errs.length) errs.slice(0, 5).forEach(e => console.log('  ' + e));
    process.exit(fails.length || errs.length ? 1 : 0);
})();
