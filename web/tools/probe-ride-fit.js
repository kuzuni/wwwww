// 탑승 정합 실측 — 비평가 지적을 눈대중이 아니라 수치로 확인/반증한다.
// 사용: node probe-ride-fit.js
// 재는 것: ① 영웅 yaw vs 탈것 yaw(‘90° 어긋남’ 주장 검증) ② 골반이 몸통 윗면 위인가 아래인가(파묻힘)
//          ③ 두 부츠의 x가 몸통 반폭 밖인가(다리 노출) ④ 탈것 최하단 y(비행형이 실제로 떠 있는가)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MOUNTS = [['flat', 'Hover Board'], ['wheeled', 'Bike'], ['fly', 'Mini Dragon'], ['quad', 'Brown Horse'],
    // 로스터 확장(2026-08-18)으로 들어온 종 — 머리·뿔·혹처럼 **안장 앞에 서는 파츠**가 붙은 것만 골랐다.
    // 그런 파츠가 먼 쪽 다리를 가리는 게 이 검사의 표적이라, 계열 대표 1종만 보면 새 종을 통째로 놓친다.
    ['quad', 'Elk'], ['quad', 'Armored Rhino'], ['quad', 'Camel'], ['quad', 'Mech Spider'],
    ['fly', 'Star Whale'], ['flat', 'Hover Board'], ['flat', 'Hover Disk']];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && !!Scene3D.heroG', { timeout: 180000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const rows = await page.evaluate((list) => {
        Combat.tick = () => { };
        // ⚠️ **부유 위상과 시계를 못박지 않으면 같은 코드가 실행마다 다른 수치를 낸다** — `probe-ride-clear`
        //    가 이미 밟은 함정인데 이 프로브에는 빠져 있었다. 실측(2026-08-19): 코드를 안 바꾸고 두 번
        //    돌렸더니 비행형 발 여유가 Mini Dragon +0.002 / Star Whale −0.010 ↔ Mini Dragon −0.011 /
        //    Star Whale −0.005 로 **좌우 대칭차까지 0.001 ↔ 0.027 을 오갔다**. 그 흔들림 때문에 멀쩡한
        //    포즈 변경을 개선/개악으로 오독할 뻔했다(실제로 한 번 오독했다). 여기서 고정하고 잰다.
        Scene3D.ridePhase = 0;
        Scene3D.clearEnemies(); Combat.enemies = [];
        const out = [];
        for (const [form, name] of list) {
            S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = name;
            Scene3D.refreshMount();
            Scene3D._clock = 0;                                    // 바운스는 `_clock + phase` 의 함수다 — 위상만 고정해선 부족
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
            // 안장에 실제로 닿는 면 = 스커트(태싯) 밑단. 골반 뼈로 재면 그 아래로 늘어진 천이
            // 몸통에 박혀도 '+0.000 정합'으로 찍힌다(비평가 지적 ⓑ가 수치 통과 뒤에 숨어 있던 이유).
            let seatY = Infinity;
            for (const part of (rig.seatParts || [])) {
                const geo = part.geometry; if (!geo) continue;
                if (!geo.boundingBox) geo.computeBoundingBox();
                const bb2 = geo.boundingBox;
                for (let i = 0; i < 8; i++) {
                    const v = V(i & 1 ? bb2.max.x : bb2.min.x, i & 2 ? bb2.max.y : bb2.min.y, i & 4 ? bb2.max.z : bb2.min.z);
                    seatY = Math.min(seatY, inner.worldToLocal(part.localToWorld(v)).y);
                }
            }
            // 무릎 굴곡 실측 — **상수를 그대로 되읽지 않고** 대퇴·정강이 두 선분의 사잇각을 잰다.
            // 이 probe의 원래 구멍이 여기였다: "설정한 상수대로 적용됐는가"만 봐서 53°짜리 얕은
            // 무릎이 계속 통과했다. 각도로 재면 상수를 잘못 잡는 순간 바로 걸린다.
            const kneeAngle = (side) => {
                const hip = rig.bones['hip' + side], knee = rig.bones['knee' + side];
                const hp = wp(hip, V(0, 0, 0)), kp = wp(knee, V(0, 0, 0)), fp = wp(knee, V(0, -0.315, 0.045));
                const a = hp.sub(kp).normalize(), b = fp.sub(kp).normalize();
                return +(180 - Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI).toFixed(1);
            };
            const BARREL = { flat: 0.578, wheeled: 0.03, fly: 0.152, quad: 0.180 }[form]; // 로컬 반폭(코드 상수)
            out.push({
                form, name,
                heroYaw: +Scene3D.heroG.rotation.y.toFixed(3),
                mountYaw: +Scene3D.mountGroup.rotation.y.toFixed(3),
                yawGapDeg: +(Math.abs(Scene3D.heroG.rotation.y - Scene3D.mountGroup.rotation.y) * 180 / Math.PI).toFixed(1),
                saddleLocalY: Scene3D.riding.form.saddle,
                pelvisLocalY: +lp.y.toFixed(3),
                seatLocalY: isFinite(seatY) ? +seatY.toFixed(3) : null,
                kneeDegL: kneeAngle('L'), kneeDegR: kneeAngle('R'),
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
            // 판정 기준은 골반이 아니라 **스커트 밑단**이다 — 골반은 그 위로 낙차만큼 떠 있는 게 정상.
            const dSeat = r.seatLocalY == null ? null : r.seatLocalY - r.saddleLocalY;
            console.log(`  접촉  스커트 밑단 ${r.seatLocalY} / 안장 윗면 ${r.saddleLocalY} → ${dSeat == null ? 'n/a' :
                (dSeat >= 0 ? '+' : '') + dSeat.toFixed(3) + ' ' +
                (Math.abs(dSeat) < 0.03 ? 'OK(안장에 얹힘)' : dSeat < 0 ? '⚠️ 안장 아래로 파묻힘' : '⚠️ 안장 위에 뜸')}`);
            console.log(`  (참고) 골반 ${r.pelvisLocalY} → 안장 대비 ${dSaddle >= 0 ? '+' : ''}${dSaddle.toFixed(3)} (스커트 낙차만큼 떠 있는 게 정상)`);
            console.log(`  발 x  L ${r.footLlx} / R ${r.footRlx} (몸통 반폭 ${r.barrelHalfW}) → 여유 ${clear >= 0 ? '+' : ''}${clear.toFixed(3)} ` +
                `${clear > 0.02 ? 'OK(다리가 몸통 밖)' : clear > 0 ? '△ 아슬아슬(각도 조금만 틀어도 묻힘)' : '⚠️ 다리가 몸통에 묻힘'} / 좌우 대칭차 ${Math.abs(Math.abs(r.footLlx) - Math.abs(r.footRlx)).toFixed(3)}`);
        }
        // 무릎 굴곡 — 앉는 계열은 95~110°가 하한선(이보다 얕으면 정강이가 수직으로 떨어져 '뒤에 서 있는' 실루엣).
        // 자전거는 좌우 페달 위상이 반대라 **비대칭이 정답**이므로 한쪽만 깊으면 통과다.
        if (!stands) {
            const deep = Math.max(r.kneeDegL, r.kneeDegR), shallow = Math.min(r.kneeDegL, r.kneeDegR);
            const pass = r.form === 'wheeled' ? (deep >= 95 && shallow >= 35) : (deep >= 95 && shallow >= 95);
            console.log(`  무릎  굴곡 L ${r.kneeDegL}° / R ${r.kneeDegR}° → ${pass ? 'OK(다리가 몸통을 감쌈)' : '⚠️ 얕음 — 정강이가 수직으로 떨어진다'}` +
                `${r.form === 'wheeled' ? ' (자전거는 좌우 비대칭이 정답)' : ''}`);
        }
        if (r.form === 'fly') console.log(`  고도  탈것 최하단 y ${r.mountBottomY} ${r.mountBottomY > 0.15 ? 'OK(떠 있음)' : '⚠️ 지면에 붙음'}`);
    }
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
