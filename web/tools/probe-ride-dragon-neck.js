// 미니 드래곤 목·머리 자리 스윕 — `probe-ride-clear` [fly] Mini Dragon 의 '머리/목이 먼 정강이를
// 추가로 가림'을 풀 y 오프셋을 찾는다.
//
// 왜 스윕이 필요한가: 이 자리는 **라이더 안장 높이에 딸린 값**이다. 카메라(탈것 앞-왼쪽 위)에서 먼
// 정강이로 가는 시선이 지나는 띠가 좁은데, 라이더가 올라가면 그 띠도 같이 올라간다. 실제로 앞 세션이
// 스윕으로 잡아 둔 자리(base y 0.52 · tip 0.34)가 **`heroPelvisLocalY` 가드 수정으로 라이더가
// 0.34 올라오자** 다시 띠 한가운데에 들어갔다. 코드에 상수로 박고 눈으로 맞추면 이 왕복이 반복된다.
//
// 재는 법: `probe-ride-clear` ②와 **같은 레이캐스트 규약**(머리 파츠 껐다 켠 차분 = 추가 가림)을 쓰되,
// 머리 파츠 전체를 y 로 dy 만큼 옮겨 가며 잰다. 한 페이지 안에서 돌려 카메라·포즈가 전 조합 동일하다.
// ⚠️ 측정 전용 — 채택은 표를 보고 사람이 정한다(가림 0 구간의 **가운데**를 고를 것. 가장자리를 고르면
//    다음에 안장 높이가 조금만 바뀌어도 다시 걸린다).
//
// 사용: node probe-ride-dragon-neck.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG && Scene3D.heroRig', { timeout: 60000, label: '3D 부팅' });

    const out = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        // ⚠️ 탑승 상태는 `S.mounts` + `S.activeMount` 로 만든다(`probe-ride-clear` 규약) —
        //    `S.mount` 를 세워도 refreshMount 가 탈것을 안 만들어 mountGroup 이 null 로 남는다.
        // ⚠️ 부유 위상과 시계를 못박지 않으면 같은 코드가 실행마다 다른 가림 수치를 낸다.
        Scene3D.ridePhase = 0;
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = { 'Mini Dragon': { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Mini Dragon';
        Scene3D.refreshMount();
        Scene3D._clock = 0;
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        Scene3D.heroG.updateWorldMatrix(true, true);
        Scene3D.mountGroup.updateWorldMatrix(true, true);

        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const rig = Scene3D.heroRig, cam = Scene3D.camera;
        cam.updateMatrixWorld(true);
        const camPos = cam.getWorldPosition(V(0, 0, 0));

        const targets = [];
        for (const s of ['L', 'R']) {
            const hip = rig.bones['hip' + s], knee = rig.bones['knee' + s];
            for (let i = 0; i < 3; i++) targets.push([`thigh${s}`, hip, V(0, -0.33 * (0.4 + 0.3 * i), 0)]);
            for (let i = 0; i <= 3; i++) targets.push([`shin${s}`, knee, V(0, -0.315 * i / 3, 0.045 * i / 3)]);
        }
        const headParts = [];
        Scene3D.mountGroup.traverse(o => { if (o.userData && o.userData.part === 'head') headParts.push(o); });
        const baseY = headParts.map(o => o.position.y);
        const setHead = (v) => headParts.forEach(o => { o.visible = v; });
        const inStirrup = (o) => {
            const st = Scene3D.mountGroup.userData.stirrups || [];
            for (let p = o; p; p = p.parent) if (st.includes(p)) return true;
            return false;
        };
        const rc = new THREE.Raycaster();
        const cast = (wp) => {
            const dir = wp.clone().sub(camPos);
            const dist = dir.length();
            rc.set(camPos, dir.normalize());
            rc.far = dist - 0.02;
            return rc.intersectObject(Scene3D.mountGroup, true).find(h => h.object.visible && !inStirrup(h.object));
        };

        const rows = [];
        for (let dy = -0.24; dy <= 0.281; dy += 0.04) {
            headParts.forEach((o, i) => { o.position.y = baseY[i] + dy; });
            Scene3D.mountGroup.updateWorldMatrix(true, true);
            const add = {};
            for (const [label, bone, off] of targets) {
                const wp = bone.localToWorld(off.clone());
                setHead(true); const blk = cast(wp);
                setHead(false); const noHead = cast(wp);
                setHead(true);
                add[label] = add[label] || { n: 0, a: 0 };
                add[label].n++;
                if (blk && !noHead) add[label].a++;
            }
            rows.push({
                dy: +dy.toFixed(2),
                thighR: +(add.thighR.a / add.thighR.n).toFixed(2),
                shinR: +(add.shinR.a / add.shinR.n).toFixed(2),
                thighL: +(add.thighL.a / add.thighL.n).toFixed(2),
                shinL: +(add.shinL.a / add.shinL.n).toFixed(2),
            });
        }
        headParts.forEach((o, i) => { o.position.y = baseY[i]; });
        return rows;
    });

    console.log('--- 미니 드래곤 머리·목 y 오프셋 스윕 (머리 껐다 켠 차분 = 추가 가림) ---');
    console.log('   dy    thighR  shinR   thighL  shinL   판정');
    for (const r of out) {
        const ok = !r.thighR && !r.shinR && !r.thighL && !r.shinL;
        console.log('  ' + String(r.dy).padStart(5) + '   ' + String(r.thighR).padStart(5) + '   ' + String(r.shinR).padStart(5)
            + '   ' + String(r.thighL).padStart(5) + '   ' + String(r.shinL).padStart(5) + '   ' + (ok ? '✅ 추가 가림 0' : ''));
    }
    if (errs.length) console.log('ERRORS: ' + errs.slice(0, 3).join(' | '));
    await browser.close();
})();
