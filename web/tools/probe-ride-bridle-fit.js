// 굴레 정합 실측 (`dragon-bridle-detached`) — **굴레·재갈이 실제로 머리에 씌워져 있는가**를 전 종에서 잰다.
//
// 왜 필요한가: 굴레 자리는 `bridleRig(hy, hz, …)` 에 **머리 좌표를 손으로 다시 넘기는** 구조다. 그래서
// 머리를 옮기는 변경(미니 드래곤의 `dy +0.18` 재스윕이 그랬다)이 들어오면 **굴레만 옛 자리에 남는다.**
// 코드에 "상수를 다시 적으면 머리를 옮길 때 굴레만 허공에 남는다"는 경고까지 적혀 있었는데도 실제로
// 그렇게 됐다 — 경고 대신 **자**로 막는다.
//
// 재는 법: `userData.bridle` 표식이 붙은 파츠(코끈·정수리 고리·금색 띠·볼끈·재갈 고리)의 bbox 가
// **머리 파츠(`userData.part === 'head'` 중 굴레가 아닌 것)의 bbox 와 겹치는가**. 굴레는 머리를 감는
// 물건이라 겹치지 않으면 그건 허공에 뜬 것이다. 겹치지 않는 파츠는 **머리까지의 최단 거리**를 찍는다.
// ⚠️ 고삐(rein straps)는 판정에서 뺀다 — 재갈 고리에서 라이더 손까지 늘어나는 게 정상이라 머리 밖이 맞다
//    (그래서 `bridleRig` 이 고삐에는 표식을 안 붙인다 — 그 규약을 그대로 쓴다).
// ⚠️ 배율이 걸리기 전 **탈것 로컬**에서 잰다(탑승 배율은 굴레와 머리에 똑같이 걸려 비율을 바꾸지 않는다).
//
// 사용: node probe-ride-bridle-fit.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
// 허용 틈 — 머리 반높이의 절반. 굴레는 머리에 닿아 있어야 하고, 이 값을 넘으면 화면에서 '떠 있다'로 보인다.
// (미니 드래곤의 결함은 낙차 0.18 · 머리 반높이 0.070 이었다 = 2.6배.)
const TOL = 0.02;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && !!Scene3D.scene && !!S', { timeout: 60000, label: '3D 부팅' });

    const rows = await page.evaluate((TOL) => {
        const out = [];
        for (const rarity in mountNames) for (const name of mountNames[rarity]) {
            const g = Scene3D.makeMountMesh(name, rarity);
            g.updateMatrixWorld(true);
            const bridle = [], head = [];
            g.traverse(o => {
                if (!o.geometry || !o.userData) return;
                if (o.userData.bridle) bridle.push(o);
                else if (o.userData.part === 'head') head.push(o);
            });
            if (!bridle.length) { out.push({ name, rarity, none: true }); continue; }
            const headBox = new THREE.Box3();
            for (const h of head) headBox.expandByObject(h);
            if (headBox.isEmpty()) { out.push({ name, rarity, noHead: true, bridle: bridle.length }); continue; }
            let worst = 0, worstKind = '';
            const p = new THREE.Vector3();
            for (const b of bridle) {
                const bb = new THREE.Box3().expandByObject(b);
                if (bb.intersectsBox(headBox)) continue;
                // 겹치지 않으면 최단 거리 — bbox 의 중심을 머리 bbox 로 클램프해 잰다(bbox 간 최단거리 근사).
                bb.getCenter(p);
                const d = headBox.clampPoint(p.clone(), new THREE.Vector3()).distanceTo(p)
                    - 0.5 * Math.min(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
                if (d > worst) { worst = d; worstKind = b.geometry.type; }
            }
            out.push({
                name, rarity, bridle: bridle.length, head: head.length,
                gap: +worst.toFixed(3), worstKind,
                headH: +(headBox.max.y - headBox.min.y).toFixed(3),
                ok: worst <= TOL,
            });
        }
        return out;
    }, TOL);

    console.log('굴레 정합 실측 — `userData.bridle` 파츠가 머리 bbox 와 겹치는가 (겹치면 틈 0)');
    console.log('  종                            굴레  머리   최대 틈   판정');
    let fails = 0, none = 0;
    for (const r of rows) {
        if (r.none) { none++; continue; }
        if (r.noHead) { console.log(`  ${r.name.padEnd(28)}  ${String(r.bridle).padStart(3)}    0        -     FAIL(머리 파츠가 없는데 굴레가 있다)`); fails++; continue; }
        const verdict = r.ok ? 'OK' : `FAIL(허공 ${r.gap} — 머리 높이 ${r.headH} 의 ${(r.gap / r.headH).toFixed(1)}배)`;
        if (!r.ok) fails++;
        console.log(`  ${r.name.padEnd(28)}  ${String(r.bridle).padStart(3)}  ${String(r.head).padStart(3)}   ${String(r.gap).padStart(7)}   ${verdict}`);
    }
    console.log(`굴레 없는 종 ${none}개(평판·바퀴·이족 기계는 굴레 대신 조종 손잡이를 쓴다 — 정상)`);
    console.log(fails ? `FAIL 굴레가 머리에서 떠 있는 종 ${fails}건` : 'PASS 모든 굴레가 머리에 씌워져 있다');
    if (errs.length) console.log('콘솔 에러: ' + errs.slice(0, 3).join(' | '));
    else console.log('PASS 콘솔 에러 0건');
    await browser.close();
})();
