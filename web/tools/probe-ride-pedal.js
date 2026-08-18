// 자전거 탑승에서 **발이 실제로 페달 위에 있는가**.
// 사용: node probe-ride-pedal.js
//
// 왜 필요한가: 비평가 2인이 독립적으로 "빈 페달 면이 그대로 노출되고 부츠는 그보다 위에 떠 있다"고
//   지적했다(양쪽 상위 순위). 원인은 좌우 크랭크가 **같은 위상으로 박혀 있던 것**이다 — 자전거
//   크랭크는 180° 반대이고 탑승 포즈도 그 전제로 좌우 비대칭(무릎 111°/61°)이라, 고정 위상에서는
//   어느 한쪽이 반드시 빈다. `Scene3D.alignPedals()` 가 매 프레임 발을 재서 위상을 푼다.
//
// 판정: 좌우 **부츠 밑면 ↔ 페달 밟는 면**의 거리가 둘 다 임계 이내일 것.
//   ⚠️ 0을 요구하면 안 된다 — 크랭크는 반지름이 고정된 원 위에만 있을 수 있어서, 발이 그 원에서
//   벗어난 만큼은 구조적으로 남는다. 사람 눈이 '닿았다'로 읽는 범위(부츠 두께 정도)를 기준으로 잡는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SWEEP = process.argv.includes('--sweep');   // 오른다리 hip/knee 각을 훑어 페달에 닿는 조합을 고른다
const TOL = 0.06;   // 월드 단위, **수직 간격**만. 부츠 밑면과 페달 면 사이가 이보다 벌어지면 눈에 보인다.

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const out = await page.evaluate((sweep) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        const rows = [];
        // 등급을 양극단으로 — 탈것 배율이 1.1배와 1.5배로 갈려 상수를 박아 둔 자리가 있으면 여기서 걸린다.
        const RAR = sweep ? ['common'] : ['common', 'mythic'];
        const combos = sweep ? [] : [null];
        // 양다리를 같이 훑는다 — 한쪽만 돌리면 위상 해가 그 다리로 끌려가 **반대쪽이 항상 빈다**
        // (첫 스윕 20조합이 전부 'L만' 또는 'R만' 이었던 이유가 이것이다). 크랭크는 좌우가 180°
        // 반대라, 두 발이 축을 사이에 두고 지름만큼 떨어져 있어야 비로소 동시에 닿는다.
        if (sweep) for (const hl of [0.70, 0.86, 1.02]) for (const kl of [-1.20, -1.45, -1.72])
                   for (const hr of [0.30, 0.46, 0.62]) for (const kr of [-0.45, -0.70, -0.95]) combos.push([hl, kl, hr, kr]);
        for (const combo of combos) {
        if (combo) {
            const P = Scene3D.MOUNT_FORMS.wheeled.pose;
            P.hipL = { rx: combo[0], rz: -0.26 }; P.kneeL = { rx: combo[1] };
            P.hipR = { rx: combo[2], rz: 0.24 };  P.kneeR = { rx: combo[3] };
        }
        for (const rarity of RAR) {
            S.mounts = { Bike: { rarity, count: 1, level: 1 } };
            S.activeMount = 'Bike';
            Scene3D.refreshMount();
            for (let i = 0; i < (sweep ? 8 : 60); i++) Scene3D.update(1 / 60);
            const g = Scene3D.mountGroup, rig = Scene3D.heroRig;
            Scene3D.heroG.updateWorldMatrix(true, true); g.updateWorldMatrix(true, true);
            const ck = g.userData.cranks;
            if (!ck) { rows.push({ rarity, err: 'cranks 없음 — 자전거 메시가 크랭크 그룹을 안 내보낸다' }); continue; }
            const V = (x, y, z) => new THREE.Vector3(x, y, z);
            for (const c of ck.list) {
                const side = c.side < 0 ? 'L' : 'R';
                const knee = rig.bones['knee' + side];
                // 부츠 **밑면**과 페달 **윗면**을 비교한다 — 중심끼리 재면 부츠 두께만큼 늘 벌어져 보인다.
                const footW = knee.localToWorld(V(0, -0.315, 0.045));
                const bootBottom = footW.clone(); bootBottom.y -= 0.05;
                const pedW = c.pedal.getWorldPosition(V(0, 0, 0));
                const pedTop = pedW.clone(); pedTop.y += 0.009 * (g.userData.cranks ? 1 : 1);
                // ⚠️ 중심 간 3D 거리로 판정하면 **페달 폭 안에 발이 얹혀 있는데도 FAIL** 이 난다
                //    (첫 판에서 Δy 0.01·Δz −0.006 인데 거리 0.094 로 불합격 — 남은 건 전부 x 오프셋이고,
                //    그 x 는 페달 밟는 면 안쪽이었다). 사람이 '밟았다'로 읽는 조건 그대로 나눠 잰다:
                //    ⑴ 수직 간격이 작을 것 ⑵ 발이 페달 **밟는 면 위**에 있을 것(x·z 가 면 안쪽).
                const sX = g.userData.cranks ? c.pedal.getWorldScale(V(0, 0, 0)) : V(1, 1, 1);
                rows.push({
                    rarity, side,
                    dy: +(bootBottom.y - pedTop.y).toFixed(3),
                    dx: +Math.abs(bootBottom.x - pedTop.x).toFixed(3),
                    dz: +Math.abs(bootBottom.z - pedTop.z).toFixed(3),
                    halfX: +(0.035 * sX.x).toFixed(3), halfZ: +(0.045 * sX.z).toFixed(3),
                    phase: +(c.group.rotation.x).toFixed(2),
                    combo,
                });
            }
        }
        }
        return rows;
    }, SWEEP);

    if (SWEEP) {
        console.log('[Bike] 오른다리 각 스윕 — hipR.rx / kneeR.rx, 양발이 다 페달에 닿는 조합을 찾는다\n');
        console.log('  hipL  kneeL  hipR kneeR |  L Δy    L Δz  |  R Δy    R Δz   판정');
        const seen = new Map();
        for (const r of out) { if (!r.combo) continue; const k = r.combo.join(','); if (!seen.has(k)) seen.set(k, {}); seen.get(k)[r.side] = r; }
        let best = null;
        for (const [k, v] of seen) {
            if (!v.L || !v.R) continue;
            const on = x => Math.abs(x.dy) <= TOL && x.dx <= x.halfX + 0.02 && x.dz <= x.halfZ + 0.02;
            const okL = on(v.L), okR = on(v.R);
            const score = Math.abs(v.L.dy) + v.L.dz + Math.abs(v.R.dy) + v.R.dz;
            if (okL || okR) console.log(`  ${k.split(',').map(x => x.padStart(5)).join(' ')} | ${String(v.L.dy).padStart(6)} ${String(v.L.dz).padStart(6)} | ${String(v.R.dy).padStart(6)} ${String(v.R.dz).padStart(6)}   ${okL && okR ? '양발 OK' : okL ? 'L만' : 'R만'}`);
            if (okL && okR && (!best || score < best.score)) best = { k, score };
        }
        console.log(best ? `\n→ 양발 통과 중 최소 오차 = hipL ${best.k.split(',')[0]} / kneeL ${best.k.split(',')[1]} / hipR ${best.k.split(',')[2]} / kneeR ${best.k.split(',')[3]}`
                         : `\n→ 양발 통과 조합 없음 (${seen.size}조합 훑음) — 각만으로는 부족하다(크랭크 반지름·BB 위치도 봐야 한다)`);
        console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
        await browser.close();
        return;
    }
    console.log('[Bike] 부츠 밑면 ↔ 페달 밟는 면 (수직 간격 ' + TOL + ' 이내 + 발이 면 위)\n');
    let bad = 0;
    for (const r of out) {
        if (r.err) { console.log(`  ${r.rarity}  ✗ ${r.err}`); bad++; continue; }
        const onFace = r.dx <= r.halfX + 0.02 && r.dz <= r.halfZ + 0.02;
        const ok = Math.abs(r.dy) <= TOL && onFace;
        if (!ok) bad++;
        console.log(`  ${r.rarity.padEnd(8)} ${r.side}  Δy ${String(r.dy).padStart(6)}  |Δx| ${String(r.dx).padStart(5)}/${r.halfX}  |Δz| ${String(r.dz).padStart(5)}/${r.halfZ}  위상 ${String(r.phase).padStart(6)}rad  `
            + (ok ? 'OK(밟고 있다)' : (Math.abs(r.dy) > TOL ? '⚠️ 페달에서 떠 있다' : '⚠️ 발이 밟는 면 밖')));
    }
    // 좌우 위상이 정확히 180° 반대인지도 본다 — 같은 위상으로 되돌아가면 이 항목이 통째로 재발한다.
    const ph = out.filter(r => !r.err);
    for (const rarity of ['common', 'mythic']) {
        const L = ph.find(r => r.rarity === rarity && r.side === 'L'), R = ph.find(r => r.rarity === rarity && r.side === 'R');
        if (!L || !R) continue;
        const gap = Math.abs(((R.phase - L.phase) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
        console.log(`  ${rarity.padEnd(8)} 좌우 위상차 ${(Math.PI - gap).toFixed(2)}rad ${gap < 0.02 ? 'OK(정확히 180°)' : '⚠️ 크랭크가 180° 반대가 아니다'}`);
        if (gap >= 0.02) bad++;
    }
    console.log(bad === 0 ? '\n전부 통과' : `\n불합격 ${bad}건`);
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
