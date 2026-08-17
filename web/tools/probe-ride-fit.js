// 탑승 정합 실측 — 비평가 지적을 눈대중이 아니라 수치로 확인/반증한다.
// 사용: node probe-ride-fit.js
// 재는 것: ① 영웅 yaw vs 탈것 yaw(‘90° 어긋남’ 주장 검증) ② 골반이 몸통 윗면 위인가 아래인가(파묻힘)
//          ③ 두 부츠의 x가 몸통 반폭 밖인가(다리 노출) ④ 탈것 최하단 y(비행형이 실제로 떠 있는가)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MOUNTS = [['flat', 'Hover Board'], ['wheeled', 'Bike'], ['fly', 'Mini Dragon'], ['quad', 'Brown Horse']];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const rows = await page.evaluate((list) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        const out = [];
        for (const [form, name] of list) {
            S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = name;
            Scene3D.refreshMount();
            for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);   // 포즈·정렬이 안정될 때까지 돌린다
            Scene3D.heroG.updateWorldMatrix(true, true);
            Scene3D.mountGroup.updateWorldMatrix(true, true);
            const rig = Scene3D.heroRig;
            const wp = (o, v) => o.localToWorld(v.clone());
            const V = (x, y, z) => new THREE.Vector3(x, y, z);
            const pelvis = wp(rig.bones.pelvis, V(0, 0, 0));
            const footL = wp(rig.bones.kneeL, V(0, -0.315, 0.045));
            const footR = wp(rig.bones.kneeR, V(0, -0.315, 0.045));
            const bb = new THREE.Box3().setFromObject(Scene3D.mountGroup);
            // ⚠️ 발/골반은 **탈것 로컬**로 재야 한다 — 탈것도 영웅도 yaw 0.55로 돌아가 있어서 월드 x로 재면
            //    좌우 오프셋이 좌우가 아니라 비스듬한 축의 값이 나온다(첫 판에서 좌 -0.325/우 +0.207로
            //    대칭인 포즈가 비대칭으로 찍혔다 — 포즈 버그가 아니라 자로 잰 축이 틀린 것이었다).
            // 또 '탈것 윗면'을 바운딩박스로 잡으면 말 머리·목까지 포함돼 안장 높이와 무관한 값이 된다.
            const inner = Scene3D.mountGroup.children[0];       // 배율이 걸린 메시 그룹
            const S_ = Scene3D.riding.scale;                     // sc * rideScale
            const lp = inner.worldToLocal(pelvis.clone());
            const lL = inner.worldToLocal(footL.clone());
            const lR = inner.worldToLocal(footR.clone());
            const BARREL = { flat: 0.578, wheeled: 0.03, fly: 0.152, quad: 0.180 }[form]; // 로컬 반폭(코드 상수)
            out.push({
                form, name,
                heroYaw: +Scene3D.heroG.rotation.y.toFixed(3),
                mountYaw: +Scene3D.mountGroup.rotation.y.toFixed(3),
                yawGapDeg: +(Math.abs(Scene3D.heroG.rotation.y - Scene3D.mountGroup.rotation.y) * 180 / Math.PI).toFixed(1),
                saddleLocalY: Scene3D.riding.form.saddle,
                pelvisLocalY: +lp.y.toFixed(3),
                barrelHalfW: BARREL,
                footLlx: +lL.x.toFixed(3), footRlx: +lR.x.toFixed(3),
                footLly: +lL.y.toFixed(3),
                mountBottomY: +bb.min.y.toFixed(3),
                scale: +S_.toFixed(3),
            });
        }
        return out;
    }, MOUNTS);

    for (const r of rows) {
        const dSaddle = r.pelvisLocalY - r.saddleLocalY;
        const clear = Math.min(Math.abs(r.footLlx), Math.abs(r.footRlx)) - r.barrelHalfW;
        // 평판형은 '앉는' 게 아니라 발판 위에 **두 발로 서는** 유일한 계열이라 안장 접촉·다리 벌림
        // 기준이 애초에 적용되지 않는다 — 여기에 ⚠️를 띄우면 다음 세션이 없는 버그를 쫓는다.
        const stands = r.form === 'flat';
        console.log(`\n[${r.form}] ${r.name}  (탈것 배율 ${r.scale})${stands ? '  ※ 기립 계열 — 안장/다리벌림 기준 해당 없음' : ''}`);
        console.log(`  yaw   영웅 ${r.heroYaw} / 탈것 ${r.mountYaw} → 차이 ${r.yawGapDeg}°  ${r.yawGapDeg < 5 ? 'OK(같은 방향)' : '⚠️ 어긋남'}`);
        if (stands) {
            console.log(`  발판  발 y ${r.footLly} / 발판 윗면 ${r.saddleLocalY} → ${(r.footLly - r.saddleLocalY).toFixed(3)} ` +
                `${Math.abs(r.footLly - r.saddleLocalY) < 0.05 ? 'OK(판 위에 섬)' : '⚠️ 판에서 뜸/파묻힘'}`);
        } else {
            console.log(`  골반  로컬 y ${r.pelvisLocalY} / 안장 윗면 ${r.saddleLocalY} → ${dSaddle >= 0 ? '+' : ''}${dSaddle.toFixed(3)} ` +
                `${Math.abs(dSaddle) < 0.03 ? 'OK(안장에 얹힘)' : dSaddle < 0 ? '⚠️ 안장 아래로 파묻힘' : '⚠️ 안장 위에 뜸'}`);
            console.log(`  발 x  L ${r.footLlx} / R ${r.footRlx} (몸통 반폭 ${r.barrelHalfW}) → 여유 ${clear >= 0 ? '+' : ''}${clear.toFixed(3)} ` +
                `${clear > 0.02 ? 'OK(다리가 몸통 밖)' : clear > 0 ? '△ 아슬아슬(각도 조금만 틀어도 묻힘)' : '⚠️ 다리가 몸통에 묻힘'} / 좌우 대칭차 ${Math.abs(Math.abs(r.footLlx) - Math.abs(r.footRlx)).toFixed(3)}`);
        }
        if (r.form === 'fly') console.log(`  고도  탈것 최하단 y ${r.mountBottomY} ${r.mountBottomY > 0.15 ? 'OK(떠 있음)' : '⚠️ 지면에 붙음'}`);
    }
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
