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
// 사용: node probe-nearfield-mass.js            # 게이트. 근경 세 지표 중 하나라도 미달이면 종료코드 1
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
                // 🚨 **재빌드마다 시드를 고정한다 — 안 하면 게이트로 못 쓴다.** 배치가 전부 Math.random
                //    이라 같은 코드로 두 번 돌려도 근경 점유가 66.9→73.9→85.9 로 흔들렸다(수정 여부와
                //    무관한 흔들림이 개선폭만큼 커질 수 있다). rep 마다 **다른** 고정 시드를 줘서
                //    3벌 평균이라는 원래 취지는 지키면서 실행 간 재현성을 얻는다.
                let rs = (0x9e3779b9 ^ Math.imul(rep + 1, 0x85ebca6b)) >>> 0;
                Math.random = () => { rs ^= rs << 13; rs >>>= 0; rs ^= rs >>> 17; rs ^= rs << 5; rs >>>= 0; return rs / 4294967296; };
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
                // 개별 그룹 프롭 — 인스턴싱이 아니다.
                // 🚨 **`trees` 만 훑으면 안 된다.** 큰 랜드마크만 거기 있고 **덤불·잔돌·꽃·양치류·근경
                //    앵커는 전부 `rocks`** 에 들어간다(`grounded()` 로 감싼 별도 그룹). 처음에 `trees` 만
                //    훑었다가 근경 앵커 6개를 새로 넣고도 수치가 **1px 도 안 움직여서** 알았다.
                //    (같은 사각지대를 `probe-prop-blob` 도 한 번 밟았다 — 그때도 작은 소품이 통째로 빠졌다.)
                const boxNoBlob = (root) => {
                    // 🚨 **접지 블롭을 빼고 잰다.** 소품은 `grounded()` 로 감싸며 발밑에 소프트 그림자
                    //    원판을 다는데, 그게 실루엣 반경의 1.9배라 `Box3.setFromObject` 를 그냥 쓰면
                    //    **박스를 블롭이 지배한다**(면적이 3.6배 부풀어 오른다). 블롭은 납작한 그림자
                    //    데칼이지 시선을 잡는 덩치가 아니다 — 이 자가 재려는 건 후자다.
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

    // ── 판정 ────────────────────────────────────────────────────────────────────
    // 참고선은 이론값이 아니라 **전/후 실측의 양쪽 끝**에서 잡았다(시드 고정 A/B, 근경 띠 기준):
    //   점유%      수정 전 최악 2.9  → 수정 후 최악 12.1   → 선 10
    //   최대요소   수정 전 최악 317  → 수정 후 최악 11269  → 선 3000
    //   큰것몫%    수정 전 최악 0.0  → 수정 후 최악 61.1   → 선 40
    // 세 지표를 **함께** 걸어야 한다. 점유%만 걸면 **잔자갈을 더 뿌려서** 통과할 수 있고(그게 바로
    // 이 결함을 만든 방식이다), 최대요소만 걸면 큰 것 하나 놓고 나머지를 카펫으로 둬도 통과한다.
    const FLOOR = { cover: 10, max: 3000, big: 40 };
    const fails = [];
    for (const r of rows) {
        const a = r.acc[0], cover = 100 * a.area / bandPx, big = a.area > 0 ? 100 * a.big / a.area : 0;
        if (cover < FLOOR.cover) fails.push(`ch${r.ch} 점유 ${cover.toFixed(1)}% < ${FLOOR.cover}`);
        if (a.max < FLOOR.max) fails.push(`ch${r.ch} 최대요소 ${a.max.toFixed(0)} < ${FLOOR.max}`);
        if (big < FLOOR.big) fails.push(`ch${r.ch} 큰것몫 ${big.toFixed(1)}% < ${FLOOR.big}`);
    }
    console.log(`\n참고선 근경 점유≥${FLOOR.cover}% · 최대요소≥${FLOOR.max}px² · 큰것몫≥${FLOOR.big}%`);
    if (fails.length) console.log('❌ 미달: ' + fails.join(' / '));
    else console.log('✅ 전 챕터 통과 — 근경에 시선을 잡는 덩치가 있다');
    console.log(`콘솔 에러 ${errs.length}건${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    process.exit(fails.length || errs.length ? 1 : 0);
})();
