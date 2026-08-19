// probe-nearfield-mass.js — 근경이 '펠트 카펫'이냐 '무게가 실린 전경'이냐를 **화면 점유 면적**으로 잰다.
//   (`map-quality-up` 갭 ⑶. 비평가 2인이 라운드마다 공통으로 지목: "근경=중경 동일 스케일·밀도, 펠트 카펫")
//
// ── 왜 개수가 아니라 면적인가 ────────────────────────────────────────────────────
//   선행 자 `probe-scatter-depth` 는 **개수 밀도 위계**를 재고 근/중 1.2~2.4 로 **통과**한다. 그런데도
//   비평가 두 명이 같은 화면을 보고 "근경과 중경이 같은 스케일·밀도"라고 했다. 둘 다 맞다 —
//   **개수 위계는 있는데 요소가 전부 작은 풀날이라 시각적 무게가 안 실린다.** 원신급 근경은 큰 클럼프·
//   프롭이 화면을 채워 시선을 잡는다. 그래서 재야 하는 건 '몇 개 있나'가 아니라
//   **큰 요소가 화면을 얼마나 덮나**다(TODO 갭 ⑶ 원문: "개수비가 아니라 화면 점유 면적").
//
// ── 재는 것 ────────────────────────────────────────────────────────────────────
//   씬에 **실제로 만들어진** 인스턴스·프롭을 카메라로 투영해 요소마다 화면 점유 면적(px²)을 낸다.
//   (코드 상수를 베끼지 않는다 — TODO 함정 ④.) 그리고 화면을 지평선~바닥 3띠로 나눠 띠마다:
//     · `점유%`   = 요소 면적 합 ÷ 띠 면적. **겹침을 빼지 않은 합산치**라 100% 를 넘을 수 있다.
//                   절대량이 아니라 띠 사이 비교용 숫자로 읽을 것.
//     · `최대`    = 그 띠에서 **가장 큰 요소 하나**의 면적. 카펫이면 이게 작다(앵커가 없다).
//     · `큰것몫`  = 면적 합 중 **큰 요소(≥ BIG_PX)** 가 차지하는 비율. 카펫이면 0 에 가깝다.
//   판정의 핵심은 `큰것몫`과 `최대`다. 점유%만 보면 **작은 걸 더 많이 뿌려도 올라가서** 카펫을 더
//   두껍게 깐 것이 개선으로 잡힌다 — 그게 이 자가 피하려는 실패다.
//
// 🚨 **면적은 요소의 실제 크기에서 나와야 한다.** 인스턴스는 지오메트리 바운딩스피어 반경에 그
//   인스턴스 행렬의 스케일을 곱해 월드 반경을 얻고, 큰 프롭은 `Box3.setFromObject` 로 잰다.
//   그 월드 반경을 **카메라 오른쪽 방향으로 띄운 점을 같이 투영**해 화면 반경(px)으로 바꾼다 —
//   깊이에 따른 원근 축소가 자동으로 들어간다.
//
// 🚨 **카메라 한 자리에서만 재지 말 것.** 스캐터가 군집 배치라 한 자리에서는 '덩어리가 시야에
//   들었는지 운'이 값을 지배한다(선행 자가 같은 코드로 챕터마다 0.16~2.07 로 튀었다). 지면은 주기
//   30 으로 순환하므로 한 주기를 13자리로 패닝하며 합산한다. 빌드 난수 노이즈는 3회 재빌드로 눌렀다.
//
// 사용: node probe-nearfield-mass.js            # 출력의 판정 줄로 읽는다(아직 게이트 아님)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const CHAPTERS = [1, 2, 3, 5, 7, 9];   // 초원·사막·바위산·밤숲·마법·용암
const VW = 480, VH = 854;
const BIG_PX = 400;      // '큰 요소' 하한(px²) ≈ 지름 23px. 480 폭 화면에서 눈에 덩어리로 읽히는 최소치.
const REBUILDS = 3, PANS = 13, PERIOD = 30;

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
        const r = await page.evaluate(([chapter, VW, VH, BIG_PX, REBUILDS, PANS, PERIOD]) => {
            const acc = [0, 1, 2].map(() => ({ area: 0, max: 0, big: 0, n: 0 }));
            for (let rep = 0; rep < REBUILDS; rep++) {
                Scene3D.setChapterTheme(chapter);
                const cam = Scene3D.camera;
                Scene3D.scene.updateMatrixWorld(true);
                cam.updateMatrixWorld(true); cam.updateProjectionMatrix();

                // 지평선 ndc.y — 시선의 수평 성분만 남긴 아주 먼 점을 실제로 투영해 구한다.
                const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
                const hp = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(1e4).add(cam.position);
                hp.project(cam);
                const yHor = Math.min(1, hp.y);

                // ── 요소 목록: (월드 중심, 월드 반경) ──────────────────────────────
                const items = [];
                const m = new THREE.Matrix4(), v = new THREE.Vector3(), sc = new THREE.Vector3();
                for (const key of ['scatter', 'scatter3', 'scatter2']) {
                    const im = Scene3D[key];
                    if (!im || !im.geometry) continue;
                    if (!im.geometry.boundingSphere) im.geometry.computeBoundingSphere();
                    const br = im.geometry.boundingSphere.radius;
                    for (let i = 0; i < im.count; i++) {
                        im.getMatrixAt(i, m);
                        m.premultiply(im.matrixWorld);
                        v.setFromMatrixPosition(m);
                        // 행렬의 축 길이 중 최대 = 이 인스턴스의 실효 배율
                        const e = m.elements;
                        const s = Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
                        items.push([v.x, v.y, v.z, br * s]);
                    }
                }
                // 큰 프롭(나무·바위·선인장·크리스탈 …) — 인스턴싱이 아니라 개별 그룹이다.
                for (const o of (Scene3D.trees || [])) {
                    if (!o || !o.visible) continue;
                    const box = new THREE.Box3().setFromObject(o);
                    if (box.isEmpty()) continue;
                    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
                    items.push([c.x, c.y, c.z, Math.max(sz.x, sz.y, sz.z) / 2]);
                }

                // ── 13자리 패닝하며 투영 ─────────────────────────────────────────
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
                        const wz = ctr.clone().project(cam);
                        if (wz.z > 1 || wz.x < -1.25 || wz.x > 1.25 || wz.y < -1 || wz.y > yHor) continue;
                        // 화면 반경: 중심에서 카메라 오른쪽으로 월드 반경만큼 띄운 점을 같이 투영
                        off.copy(ctr).addScaledVector(right, it[3]).project(cam);
                        const rpx = Math.abs(off.x - wz.x) * VW / 2;
                        if (!(rpx > 0)) continue;
                        const area = Math.PI * rpx * rpx;
                        const t = (wz.y + 1) / (yHor + 1);
                        const b = Math.max(0, Math.min(2, Math.floor(t * 3)));
                        const a = acc[b];
                        a.area += area; a.n++;
                        if (area > a.max) a.max = area;
                        if (area >= BIG_PX) a.big += area;
                    }
                }
                cam.position.x = baseX; cam.lookAt(baseX, 0.9, 0); cam.updateMatrixWorld(true);
            }
            return { acc };
        }, [ch, VW, VH, BIG_PX, REBUILDS, PANS, PERIOD]);
        rows.push({ ch, acc: r.acc });
    }

    // 띠 면적: 화면 폭 × 띠 높이. 띠 높이는 (바닥~지평선)/3 인데 지평선 ndc 를 노드로 못 받았으므로
    // 페이지에서 한 번 더 받아 온다(값 자체는 챕터와 무관하다).
    const yHor = await page.evaluate(() => {
        const cam = Scene3D.camera; cam.updateMatrixWorld(true);
        const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
        const hp = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(1e4).add(cam.position);
        hp.project(cam);
        return Math.min(1, hp.y);
    });
    await page.close(); await browser.close();

    const bandPx = VW * (VH * (yHor + 1) / 2 / 3) * REBUILDS * PANS;   // 합산 기준 면적
    const NAME = ['근경', '중경', '원경'];
    console.log(`\n===== 근경 시각 무게 — 화면 점유 면적 (띠 면적 ${(bandPx / REBUILDS / PANS | 0)}px² · ${REBUILDS}빌드×${PANS}패닝 합산) =====`);
    console.log(`큰 요소 기준 ≥ ${BIG_PX}px²(지름 ${(2 * Math.sqrt(BIG_PX / Math.PI)).toFixed(0)}px)\n`);
    console.log('챕터  띠     개수      점유%    최대요소(px²)   큰것몫%');
    const nearBig = [];
    for (const r of rows) {
        for (let b = 0; b < 3; b++) {
            const a = r.acc[b];
            const share = a.area > 0 ? 100 * a.big / a.area : 0;
            if (b === 0) nearBig.push(share);
            console.log(`ch${String(r.ch).padEnd(3)} ${NAME[b]}  ${String(a.n).padStart(6)} ${(100 * a.area / bandPx).toFixed(1).padStart(8)} `
                + `${a.max.toFixed(0).padStart(13)} ${share.toFixed(1).padStart(9)}`);
        }
        console.log('');
    }
    const avg = nearBig.reduce((s, v) => s + v, 0) / (nearBig.length || 1);
    console.log(`근경 '큰것몫' 평균 ${avg.toFixed(1)}%  (챕터별 ${nearBig.map(v => v.toFixed(0)).join('/')})`);
    console.log(`콘솔 에러 ${errs.length}건${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    console.log('⚠️ 아직 게이트가 아니다 — 육안 정답(캡처)과 대조해 참고선을 정한 뒤에 종료코드를 붙일 것.');
    process.exit(0);
})();
