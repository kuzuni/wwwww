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
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const NAME = process.argv[2] || 'Hover Board';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 60000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const out = await page.evaluate((name) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
        S.activeMount = name;
        // ⚠️ **부유 위상과 시계를 못박지 않으면 같은 코드가 실행마다 다른 판정을 낸다** — `probe-ride-clear`·
        //    `probe-ride-fit` 이 이미 밟은 함정인데 이 프로브에만 빠져 있었다. 실측(2026-08-19): 코드를
        //    한 자도 안 바꾸고 두 번 돌렸더니 ④(발이 발판 위) 가 **FAIL(L −0.038) ↔ PASS(L −0.032)** 로
        //    뒤집혔다 — 임계가 0.035 라 부유 바운스 폭이 그대로 판정을 갈랐다. 그 흔들림 때문에 하마터면
        //    멀쩡한 스탠스를 '내용 결함'으로 등재할 뻔했다. `ridePhase` 는 `refreshMount` 가 읽는 훅이라
        //    **호출 전에** 세우고, 바운스는 `_clock + phase` 의 함수라 `_clock` 도 같이 0 으로 못박는다.
        Scene3D.ridePhase = 0;
        Scene3D.refreshMount();
        Scene3D._clock = 0;
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        const g = Scene3D.mountGroup, rig = Scene3D.heroRig;
        Scene3D.heroG.updateWorldMatrix(true, true); g.updateWorldMatrix(true, true);
        const inner = g.children[0];
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        // 발판 치수 — 상수로 박지 않고 실제 bbox 에서 잰다(종마다 다르고 모델을 손봐도 따라온다).
        // ⚠️ **월드 AABB 를 worldToLocal 로 옮겨 로컬 범위로 쓰면 안 된다.** 탈것이 yaw 0.55 로
        //    돌아가 있어 그 두 꼭짓점은 범위가 아니라 **대각선**이다 — 실제 데크가 1:1.4 인데
        //    4.4:1(길이 1.57 / 폭 0.355)로 찍혀, 스탠스 비율 판정이 통째로 거짓이었다.
        //    파츠의 지오메트리 bbox 는 이미 그 파츠 로컬이므로, 자기 scale·position 만 얹으면 된다.
        // ⚠️ 훅은 **탈것 메시 그룹(inner)** 에 심겨 있다 — `Scene3D.mountGroup` 의 userData 는 그중 몇
        //    개만 골라 복사받으므로 `deck` 이 없다. 예전엔 그 사실을 모른 채 `g.userData.deck` 만 보고
        //    항상 폴백(`inner.children[0]` = 눌린 타원체 선체)으로 떨어졌고, 그래서 ②의 분모(발판 치수)와
        //    ④의 자(발판 윗면)가 둘 다 딛는 면이 아니라 **선체**였다.
        const deck = inner.userData.deck || g.userData.deck || inner.children[0];
        if (!deck.geometry.boundingBox) deck.geometry.computeBoundingBox();
        const gb = deck.geometry.boundingBox;
        const deckLen = (gb.max.z - gb.min.z) * Math.abs(deck.scale.z);
        const deckW = (gb.max.x - gb.min.x) * Math.abs(deck.scale.x);
        const deckTop = new THREE.Box3().setFromObject(deck).max.y;   // 접지 비교용이라 이건 월드가 맞다
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
                world: footW.clone(),
                local: inner.worldToLocal(footW.clone()),
                fwd: inner.worldToLocal(footW.clone().add(fwd)).sub(inner.worldToLocal(footW.clone())),
                knee: 180 - Math.acos(Math.max(-1, Math.min(1, a.dot(b)))) * 180 / Math.PI,
                footY: footW.y,
            };
        }
        // 🚨 ④의 자는 **발 밑 발판 표면**이다 — AABB 꼭대기가 아니다.
        //    호버 디스크의 발판은 눌린 타원체라 **가운데가 봉긋한 돔**이고, 보더는 그 중심이 아니라
        //    앞뒤로 벌려 선다(스탠스가 판정 ②의 요구다). 그러면 발은 돔 꼭대기보다 낮은 게 **정상**인데
        //    꼭대기를 자로 삼아 −0.051/−0.041 로 반려했다(실측 2026-08-19). 발 (x,z) 에서 수직으로
        //    레이캐스트해 그 자리의 표면 높이를 쓴다 — 평평한 데크(호버보드)에서는 결과가 같고,
        //    뱅킹으로 판이 기울어도 따라온다. **못 맞히면 그 발은 발판 밖**이라 그 자체가 실패다
        //    (기존 주석이 약속만 하고 실제로는 검사하지 않던 '발판 밖 이탈'이 이걸로 처음 걸린다).
        const deckTopMax = new THREE.Box3().setFromObject(deck).max.y;
        const rc = new THREE.Raycaster(); rc.far = 8;
        const surfAt = (w) => {
            rc.set(V(w.x, deckTopMax + 0.5, w.z), V(0, -1, 0));
            const hit = rc.intersectObject(deck, true);
            return hit.length ? hit[0].point.y : null;
        };
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
            surfL: (v => v == null ? null : +v.toFixed(3))(surfAt(r.L.world)),
            surfR: (v => v == null ? null : +v.toFixed(3))(surfAt(r.R.world)),
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
    console.log(`  발 월드 y                    L ${o.footYL} / R ${o.footYR}  (발 밑 발판면 L ${o.surfL == null ? '없음(판 밖)' : o.surfL} / R ${o.surfR == null ? '없음(판 밖)' : o.surfR} · 판 AABB 꼭대기 ${o.deckTop})`);
    console.log(`  상체 비틀림(spine.ry)        ${o.spineRY}rad`);

    const fail = [];
    if (o.yawL < 55 || o.yawR < 55) fail.push('발이 진행 방향을 그대로 본다(보드 스탠스가 아니다)');
    if (o.zGap / o.deckLen < 0.20) fail.push('두 발이 나란하다(길이 방향 스탠스 없음)');
    if (o.kneeL < 15 || o.kneeR < 15) fail.push('무릎이 안 굽었다');
    // 발이 발판 밖으로 나가면 '자세는 잡혔는데 공중을 딛는' 해로 도망간 것이다.
    // ⚠️ 기준을 느슨하게 잡으면 **한 발이 판 위에 떠 있는 채로 PASS** 한다(첫 통과 판이 그랬다 —
    //    앞발이 0.067 떠 있었다). 보더는 두 발 다 판을 딛는다. 0.035 = 부츠 두께 정도.
    for (const [s, y, surf] of [['L', o.footYL, o.surfL], ['R', o.footYR, o.surfR]]) {
        if (surf == null) { fail.push(`${s} 발이 발판 밖이다(수직 레이가 발판을 못 맞혔다)`); continue; }
        if (Math.abs(y - surf) > 0.035) fail.push(`${s} 발이 발판면에서 ${(y - surf).toFixed(3)} 떨어졌다`);
    }
    console.log(fail.length ? '\n판정: FAIL\n  - ' + fail.join('\n  - ') : '\n판정: PASS');
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
