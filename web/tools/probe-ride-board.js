// 평판형(호버보드·연잎류) 탑승이 **보드 스탠스인가, 그냥 차렷인가**.
// 사용: node probe-ride-board.js [탈것이름]      (기본 Hover Board)
//
// 왜 필요한가: 비평가 2인이 독립적으로 "발이 진행 방향으로 나란히, 무릎 굽힘 0, 상체 비틀림 0 —
//   보드를 타는 게 아니라 판때기 위에 차렷하고 서 있다"고 지적했다. 접지(발바닥-보드)는 전 계열
//   중 유일하게 깨끗한데 **자세만 없다**는 것이라, 접지 probe 로는 절대 안 걸린다.
//
// 판정(넷 다 만족해야 통과):
//   ① 발이 보드 **가로 방향**을 본다 — 발 전방축과 보드 진행축(+z)의 각이 55° 이상.
//   ② 두 발이 보드 **길이 방향으로 벌어져** 있다 — z 간격이 보드 길이의 20% 이상.
//   ③ 무릎이 굽어 있다 — 굴곡 15° 이상(차렷은 10° 언저리).
//   ④ 그러고도 **두 발이 발판 위**에 있다 — 접지 y 오차와 발판 밖 이탈이 없을 것.
//      (③④를 같이 걸어야 "굽히기만 하고 발이 판 밖으로 나가는" 해로 도망가지 않는다.)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const NAME = process.argv[2] || 'Hover Board';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const out = await page.evaluate((name) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
        S.activeMount = name;
        Scene3D.refreshMount();
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        const g = Scene3D.mountGroup, rig = Scene3D.heroRig;
        Scene3D.heroG.updateWorldMatrix(true, true); g.updateWorldMatrix(true, true);
        const inner = g.children[0];
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        // 발판 치수 — 상수로 박지 않고 실제 bbox 에서 잰다(종마다 다르고 모델을 손봐도 따라온다).
        // ⚠️ **단위를 섞지 말 것.** 처음엔 발판 bbox 를 월드로 재고 발 좌표는 탈것 로컬로 재서
        //    비율이 배율(≈1.4배)만큼 틀렸다 — 스탠스 폭이 15%인데 11%로 보였다.
        //    발판 치수도 발과 같은 **안쪽 메시 그룹 로컬**로 환산해 비교한다.
        const deck = g.userData.deck || inner.children[0];
        const bbW = new THREE.Box3().setFromObject(deck);
        const lo = inner.worldToLocal(bbW.min.clone()), hi = inner.worldToLocal(bbW.max.clone());
        const deckLen = Math.abs(hi.z - lo.z), deckW = Math.abs(hi.x - lo.x), deckTop = bbW.max.y;
        const r = {};
        for (const side of ['L', 'R']) {
            const knee = rig.bones['knee' + side], hip = rig.bones['hip' + side];
            const footW = knee.localToWorld(V(0, -0.315, 0.045));
            // 발 전방축 = 무릎 뼈의 로컬 +z 를 월드로 (부츠가 향하는 방향)
            const q = knee.getWorldQuaternion(new THREE.Quaternion());
            const fwd = V(0, 0, 1).applyQuaternion(q);
            // 무릎 굴곡 — 상수를 되읽지 않고 대퇴·정강이 사잇각을 직접 잰다
            const hp = hip.getWorldPosition(V(0, 0, 0)), kp = knee.getWorldPosition(V(0, 0, 0));
            const a = hp.clone().sub(kp).normalize(), b = footW.clone().sub(kp).normalize();
            r[side] = {
                local: inner.worldToLocal(footW.clone()),
                fwd: inner.worldToLocal(footW.clone().add(fwd)).sub(inner.worldToLocal(footW.clone())),
                knee: 180 - Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI,
                footY: footW.y,
            };
        }
        // 보드 진행축 = 탈것 로컬 +z
        const yawOf = (v) => Math.abs(Math.atan2(v.x, v.z)) * 180 / Math.PI;
        return {
            deckLen: +deckLen.toFixed(3), deckW: +deckW.toFixed(3), deckTop: +deckTop.toFixed(3),
            yawL: +yawOf(r.L.fwd).toFixed(1), yawR: +yawOf(r.R.fwd).toFixed(1),
            zGap: +Math.abs(r.L.local.z - r.R.local.z).toFixed(3),
            xL: +r.L.local.x.toFixed(3), xR: +r.R.local.x.toFixed(3),
            zL: +r.L.local.z.toFixed(3), zR: +r.R.local.z.toFixed(3),
            kneeL: +r.L.knee.toFixed(1), kneeR: +r.R.knee.toFixed(1),
            footYL: +r.L.footY.toFixed(3), footYR: +r.R.footY.toFixed(3),
            spineRY: +(rig.bones.spine ? rig.bones.spine.rotation.y : 0).toFixed(3),
        };
    }, NAME);

    const o = out;
    const half = { z: o.deckLen / 2, x: o.deckW / 2 };
    // 탈것 로컬은 배율이 걸린 안쪽 그룹 기준이라 발판 bbox(월드)와 단위가 다르다 — 비율로만 본다.
    console.log(`[${NAME}] 보드 스탠스 판정  (발판 길이 ${o.deckLen} / 폭 ${o.deckW} / 윗면 y ${o.deckTop})\n`);
    console.log(`  발 전방축 ↔ 보드 진행축 각   L ${o.yawL}° / R ${o.yawR}°   (기준 55° 이상)`);
    console.log(`  두 발 z 간격                 ${o.zGap}  (발판 길이 대비 ${(o.zGap / o.deckLen * 100).toFixed(0)}%, 기준 20% 이상)`);
    console.log(`  무릎 굴곡                    L ${o.kneeL}° / R ${o.kneeR}°   (기준 15° 이상)`);
    console.log(`  발 로컬 좌표                 L(${o.xL}, ${o.zL}) / R(${o.xR}, ${o.zR})`);
    console.log(`  발 월드 y                    L ${o.footYL} / R ${o.footYR}  (발판 윗면 ${o.deckTop})`);
    console.log(`  상체 비틀림(spine.ry)        ${o.spineRY}rad`);

    const fail = [];
    if (o.yawL < 55 || o.yawR < 55) fail.push('발이 진행 방향을 그대로 본다(보드 스탠스가 아니다)');
    if (o.zGap / o.deckLen < 0.20) fail.push('두 발이 나란하다(길이 방향 스탠스 없음)');
    if (o.kneeL < 15 || o.kneeR < 15) fail.push('무릎이 안 굽었다');
    // 발이 발판 밖으로 나가면 '자세는 잡혔는데 공중을 딛는' 해로 도망간 것이다.
    // ⚠️ 기준을 느슨하게 잡으면 **한 발이 판 위에 떠 있는 채로 PASS** 한다(첫 통과 판이 그랬다 —
    //    앞발이 0.067 떠 있었다). 보더는 두 발 다 판을 딛는다. 0.035 = 부츠 두께 정도.
    for (const [s, x, z, y] of [['L', o.xL, o.zL, o.footYL], ['R', o.xR, o.zR, o.footYR]]) {
        if (Math.abs(y - o.deckTop) > 0.035) fail.push(`${s} 발이 발판 윗면에서 ${(y - o.deckTop).toFixed(3)} 떨어졌다`);
    }
    console.log(fail.length ? '\n판정: FAIL\n  - ' + fail.join('\n  - ') : '\n판정: PASS');
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
