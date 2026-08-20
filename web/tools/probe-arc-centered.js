// 눕힌 **호(arc)** 가 몸의 정중선을 벗어나 있지 않은가 — 좌표 합성 버그 자동 검출.
// 사용: node probe-arc-centered.js      (LIST=1 이면 통과한 것까지 다 찍는다)
//
// 무엇을 잡는가 — `THREE.Object3D` 의 회전은 오일러 XYZ **한 벌로 합성**된다. 그래서
//   mesh.rotation.x = Math.PI / 2;   // 링을 눕히고
//   mesh.rotation.z = θ;             // "눕힌 평면 위에서 호를 돌린다" (← 틀렸다)
// 라고 쓰면 두 번째 줄이 **눕힌 링을 통째로 다시 기울인다.** 부분 호(thetaLength < 2π)에서는
// 그 결과가 눈에 띄게 드러난다: 호가 한쪽으로 쏠린 채 비스듬히 서서, 몸에서 **비어져 나온
// 휘어진 막대**로 보인다. 2026-08-20 3D 스트림이 `cape` 에서 이걸 확정했고, 그게 비평가 R1 의
// "`cape` 10시대 공통의 **고양이 꼬리** 곡선이 망토로 안 읽힌다" 지적의 실체였다.
//   실측(중세 '기사단 망토'): 밑단 링 x중심 **+0.113**(원뿔은 0.000) · 어깨 요크 x중심 **−0.120**.
//   고친 뒤 둘 다 **0.000**.
// 🚨 **뿌리가 하나 더 있다 — `scale` 이 같이 걸린 자리 (2026-08-20 `arc-rotz-tilt` 에서 확정).**
//   오브젝트 행렬은 `T·R·S` 라 **S 가 먼저** 먹는다. 그래서 `mesh.scale.y = 0.68`(링 평면 안에서
//   눌러 몸통 타원을 만드는 상투 수단)이 걸린 토러스에 `rotation.z` 를 주면, **눌러 만든 타원을
//   통째로 돌려** 단축이 앞뒤(Z)가 아닌 비스듬한 방향으로 선다. 이때는 x중심만 어긋나는 게 아니라
//   **띠가 몸을 90° 어긋나게 감는다.** 실측(`sealed` 여압 리브): 좌우로 0.274 밖에 못 감으면서
//   앞뒤로는 0.500 을 뻗어 몸통(앞뒤 ±0.17)을 뚫고 나갔다 — 고친 뒤 좌우 0.517 · 앞뒤 0.235.
//   → 이런 자리는 시작각을 굽는 것만으로 안 되고 누르는 축을 **`scale.z` 로 옮겨야** 한다
//     (지오메트리를 이미 눕혔으므로 앞뒤가 z 다). `scale.y` 를 두면 띠의 **세로 두께**가 눌린다.
// 고치는 법: 호의 시작각을 **지오메트리에 굽는다** — `geo.rotateZ(θ); geo.rotateX(Math.PI/2);`
//   (지오메트리 회전은 정점 데이터를 순서대로 돌리므로 '평면에서 돌린 뒤 눕히기'가 그대로 된다.)
//   ⚠️ 시작각 규약도 같이 확인할 것: `rotateX(π/2)` 뒤에는 평면각 φ 가 **+X 에서 +Z 로 재는
//      방위각**이 된다. 등 뒤가 중심이면 φ중심 = −90° 이므로 시작각 = −90° − (호폭/2).
//
// 판정 대상은 **부분 호**(thetaLength < 2π)뿐이다. 부분 호는 이 파일에서 '몸을 두르다 뒤/앞에서
//   끊기는 띠'로만 쓰이므로 정중선에 대칭이어야 한다(|x중심| ≤ 0.012).
// ⚠️ **온전한 링(2π)은 재지 않는다 — 초판이 그래서 오검출을 55개 냈다.** 사슬 고리 격자·암홀 커프·
//    외골격 관절 링처럼 **좌우로 짝지어 다는 온전한 링**이 정상적으로 x ±0.2 에 놓인다.
// ⚠️ 부분 호도 **좌우 쌍이면 통과**시킨다 — 같은 반경·같은 호폭이 x 대칭 위치에 하나 더 있으면
//    그건 의도적으로 어깨 좌우에 단 것이다(짝이 없는 외톨이 호만 이 버그의 모양이다).
// ⚠️ **GATED 밖 스타일은 재기만 하고 반려하지 않는다** — 아직 안 고친 자리가 남아 있고
//    (아래 표가 그 목록이다), 지금 전부 물리면 `regress.sh` 가 HEAD 에서 빨개진다.
//    한 스타일을 고칠 때마다 그 이름을 GATED 에 추가할 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const OFF_MAX = 0.012;
const GATED = ['cape', 'vest'];   // vest 추가 2026-08-20 (arc-rotz-tilt — sealed 여압 리브 · radiant 금 테)
const LIST = !!process.env.LIST;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.makeArmorPreview, null, { timeout: 30000 });

    const res = await page.evaluate(() => {
        const rows = [];
        const buildErrs = [];
        for (const age of AGES) {
            const styles = ARMOR_STYLES[age] || [];
            for (let i = 0; i < styles.length; i++) {
                const st = styles[i];
                const nm = (typeof itemNameOf === 'function') ? itemNameOf({ slot: 'armor', age, nameIdx: i }) : '';
                let g;
                try { g = Scene3D.makeArmorPreview(age, 'rare', st, nm); }
                catch (e) { buildErrs.push(st + '@' + age + ': ' + e.message); continue; }
                // 🚨 **`updateMatrixWorld(true)` 를 빼지 말 것.** 이 그룹은 씬에 붙은 적이 없어
                //    자식 월드행렬이 갱신돼 있지 않다 — 빼면 `extras` 그룹의 y 오프셋(−0.65)이
                //    반영되지 않은 좌표가 나와 **없는 결함을 보고하고 있는 결함을 놓친다**
                //    (이 판정기의 초판이 그렇게 틀렸다).
                g.updateMatrixWorld(true);
                let n = 0;
                g.traverse(o => {
                    if (!o.isMesh || !o.geometry || o.geometry.type !== 'TorusGeometry') return;
                    n++;
                    // 🚨 **`Box3.setFromObject` 로 재지 말 것 — 회전한 부분 호에서 값이 부풀려진다.**
                    //    그 함수는 지오메트리의 AABB **모서리 8개**를 행렬로 옮긴 뒤 다시 AABB 를
                    //    씌운다. 부분 호는 AABB 가 이미 원점 비대칭이라, 회전하면 실제 정점이 없는
                    //    허공까지 상자가 불어난다(반경 0.225 짜리 호가 z ±0.27 로 찍혔다 — 기하학적으로
                    //    불가능한 값이다). **중심**은 정확히 옮겨지므로 x중심 판정에는 문제가 없지만,
                    //    치수를 인용하려면 정점을 직접 훑어야 한다.
                    const pos = o.geometry.attributes.position;
                    const v = new THREE.Vector3();
                    const bb = new THREE.Box3();
                    for (let k = 0; k < pos.count; k++) {
                        v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
                        bb.expandByPoint(v);
                    }
                    const cx = (bb.max.x + bb.min.x) / 2;
                    const par = o.geometry.parameters || {};
                    rows.push({
                        age, style: st, name: nm, cx,
                        arc: par.arc !== undefined ? par.arc / Math.PI : null,
                        r: par.radius !== undefined ? par.radius : null,
                        h: bb.max.y - bb.min.y,
                    });
                });
                if (!n) rows.push({ age, style: st, name: nm, cx: 0, arc: null, r: null, h: 0, none: true });
            }
        }
        return { rows, buildErrs };
    });

    const arcs = res.rows.filter(r => !r.none && r.arc !== null && r.arc < 1.99);
    // 좌우 쌍 판별 — 같은 칸에 같은 반경·호폭이 x 대칭 자리에 하나 더 있으면 의도된 짝이다.
    const byCell = {};
    for (const r of arcs) (byCell[r.style + '@' + r.age] = byCell[r.style + '@' + r.age] || []).push(r);
    const hasTwin = r => (byCell[r.style + '@' + r.age] || []).some(o =>
        o !== r && o.r === r.r && o.arc === r.arc && Math.abs(o.cx + r.cx) < OFF_MAX * 2);
    for (const r of arcs) r.twin = hasTwin(r);

    const bad = arcs.filter(r => Math.abs(r.cx) > OFF_MAX && !r.twin);
    const gatedBad = bad.filter(r => GATED.includes(r.style));
    const freeBad = bad.filter(r => !GATED.includes(r.style));

    console.log(`갑옷 칸 ${new Set(res.rows.map(r => r.style + '@' + r.age)).size} · 토러스 ${res.rows.filter(r => !r.none).length}개(그중 부분 호 ${arcs.length}) · 게이트 [${GATED.join(', ')}]`);
    console.log(`판정: 부분 호는 |x중심| ≤ ${OFF_MAX} (좌우 쌍이면 통과)`);
    if (LIST) for (const r of arcs)
        console.log(`  ${(Math.abs(r.cx) > OFF_MAX && !r.twin) ? 'FAIL' : 'ok  '} ${(r.style + '@' + r.age).padEnd(24)} r ${r.r.toFixed(3)} 호 ${r.arc.toFixed(2)}π x중심 ${r.cx.toFixed(4)}${r.twin ? ' (좌우 쌍)' : ''}`);
    console.log(`— 게이트 대상 위반 ${gatedBad.length} —`);
    for (const r of gatedBad) console.log(`  FAIL ${(r.style + '@' + r.age).padEnd(24)} ${r.name} r ${r.r} 호 ${r.arc.toFixed(2)}π x중심 ${r.cx.toFixed(4)}`);
    // 게이트 밖은 (스타일, 반경, 호폭) 으로 묶어 **같은 코드 한 줄**이 몇 시대에 번지는지 보인다.
    const grp = {};
    for (const r of freeBad) {
        const k = `${r.style} r${r.r} 호${r.arc.toFixed(2)}π`;
        (grp[k] = grp[k] || []).push(r);
    }
    console.log(`— 게이트 밖(아직 안 고친 자리, 코드 한 줄 단위로 묶음) —`);
    for (const k of Object.keys(grp).sort((a, b) => grp[b].length - grp[a].length))
        console.log(`       ${k.padEnd(30)} ${String(grp[k].length).padStart(2)}칸 · x중심 ${grp[k][0].cx.toFixed(4)} · ${[...new Set(grp[k].map(r => r.age))].join(',')}`);

    if (res.buildErrs.length) console.log('모델 빌드 실패:', res.buildErrs.join(' | '));
    console.log(`콘솔 에러 ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 4).join('\n'));
    console.log(gatedBad.length ? `\n반려 — 게이트 대상 쏠린 호 ${gatedBad.length}개` : `\nPASS — 게이트 대상 쏠린 호 0개 (게이트 밖 ${freeBad.length}개는 위 표 참조)`);
    await browser.close();
    process.exit(gatedBad.length || res.buildErrs.length || errors.length ? 1 : 0);
})();
