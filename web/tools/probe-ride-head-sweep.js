// 탑승 중 **머리·목 자리 2차원 스윕** — `probe-ride-clear` ②의 '머리/목이 먼 다리를 추가로 가림'을
// 푸는 오프셋을 찾는다. `probe-ride-dragon-neck.js`(드래곤 전용·y 1축)를 **종을 인자로 받고 y·z 두 축**을
// 훑도록 일반화한 것이다.
//
// 왜 스윕인가: 이 자리는 **라이더 안장 높이에 딸린 종속값**이다. 카메라(탈것 앞-왼쪽 위)에서 먼 다리로
// 가는 시선이 지나는 띠가 좁은데 라이더가 오르내리면 띠도 같이 움직인다. 드래곤은 이 자리를 눈으로
// 맞추려다 **세 번 왕복**했다(그 항목 주석 ⚠️⚠️). 새 계열을 넣을 때마다 같은 왕복을 하지 않으려면
// 종마다 이 표를 뽑아 **가림 0 구간의 가운데**를 고를 것(가장자리를 고르면 다음 변경에 다시 걸린다).
//
// z 축을 더한 이유: 드래곤은 목이 이미 앞으로 길어 y 만으로 풀렸지만, 앞·위로 짧게 내민 머리(이족
// 로봇의 센서 헤드)는 **앞으로 빼는 것이 y 보다 잘 듣는다** — 축을 하나만 훑으면 통과 구간을 통째로
// 놓친다(실제로 이족 로봇이 y 단축 스윕에서 전 구간 실패로 보였다).
//
// ⚠️ 측정 전용 — 채택은 표를 보고 사람이 정한다. 재는 규약(레이캐스트·머리 껐다 켠 차분)은
//    `probe-ride-clear` ②와 **글자 그대로 같게** 유지할 것. 다르게 재면 통과시켜도 그쪽이 다시 잡는다.
//
// 사용: node probe-ride-head-sweep.js "Bipedal Mech" [--dy 최소:최대:간격] [--dz 최소:최대:간격]
//       (기본 Mini Dragon · dy -0.32:0.56:0.08 · dz -0.16:0.40:0.08)
// 범위를 넓힐 수 있게 해 둔 이유: 좁게 훑으면 **통과 띠의 가장자리를 가운데로 착각**한다. 이족 로봇
// 첫 판이 그랬다 — dy 0.40 까지만 봐서 거기가 띠의 끝인지 안쪽인지 알 수 없었다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const ARGS = process.argv.slice(2);
const flag = (k, def) => {
    const i = ARGS.indexOf('--' + k);
    if (i < 0 || !ARGS[i + 1]) return def;
    const [a, b, s] = ARGS[i + 1].split(':').map(Number);
    const out = [];
    for (let v = a; v <= b + 1e-9; v += s) out.push(+v.toFixed(3));
    return out;
};
const NAME = (ARGS[0] && !ARGS[0].startsWith('--')) ? ARGS[0] : 'Mini Dragon';
const DY = flag('dy', (() => { const o = []; for (let v = -0.32; v <= 0.561; v += 0.08) o.push(+v.toFixed(2)); return o; })());
const DZ = flag('dz', (() => { const o = []; for (let v = -0.16; v <= 0.401; v += 0.08) o.push(+v.toFixed(2)); return o; })());

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG && Scene3D.heroRig', { timeout: 60000, label: '3D 부팅' });

    const out = await page.evaluate(({ NAME, DY, DZ }) => {
        Combat.tick = () => { };
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => { };
        Scene3D.heroAttack = () => { };
        // ⚠️ 부유 위상과 시계를 못박지 않으면 같은 코드가 실행마다 다른 가림 수치를 낸다.
        Scene3D.ridePhase = 0;
        Scene3D.clearEnemies(); Combat.enemies = [];
        const rarity = Object.keys(mountNames).find(r => mountNames[r].includes(NAME)) || 'epic';
        S.mounts = {}; S.mounts[NAME] = { rarity, count: 1, level: 1 };
        S.activeMount = NAME;
        Scene3D.refreshMount();
        Scene3D._clock = 0;
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        if (!Scene3D.mountGroup) return { err: '탈것이 안 세워졌다' };
        Scene3D.heroG.updateWorldMatrix(true, true);
        Scene3D.mountGroup.updateWorldMatrix(true, true);

        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const rig = Scene3D.heroRig, cam = Scene3D.camera;
        cam.updateMatrixWorld(true);
        const camPos = cam.getWorldPosition(V(0, 0, 0));

        // 표적 = probe-ride-clear ②와 같은 14점(허벅지 40~100% 3점 + 정강이~발끝 4점, 좌우)
        const targets = [];
        for (const s of ['L', 'R']) {
            const hip = rig.bones['hip' + s], knee = rig.bones['knee' + s];
            for (let i = 0; i < 3; i++) targets.push([`thigh${s}`, hip, V(0, -0.33 * (0.4 + 0.3 * i), 0)]);
            for (let i = 0; i <= 3; i++) targets.push([`shin${s}`, knee, V(0, -0.315 * i / 3, 0.045 * i / 3)]);
        }
        const headParts = [];
        Scene3D.mountGroup.traverse(o => { if (o.userData && o.userData.part === 'head') headParts.push(o); });
        if (!headParts.length) return { err: '이 종엔 머리 파츠(part:head)가 없다 — 스윕할 것이 없다' };
        const base = headParts.map(o => o.position.clone());
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
        for (const dy of DY) for (const dz of DZ) {
            headParts.forEach((o, i) => { o.position.set(base[i].x, base[i].y + dy, base[i].z + dz); });
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
                dy: +dy.toFixed(2), dz: +dz.toFixed(2),
                thighR: +(add.thighR.a / add.thighR.n).toFixed(2), shinR: +(add.shinR.a / add.shinR.n).toFixed(2),
                thighL: +(add.thighL.a / add.thighL.n).toFixed(2), shinL: +(add.shinL.a / add.shinL.n).toFixed(2),
            });
        }
        headParts.forEach((o, i) => { o.position.copy(base[i]); });
        return { rows, headCount: headParts.length };
    }, { NAME, DY, DZ });

    if (out.err) { console.log('스윕 불가: ' + out.err); await browser.close(); return; }
    console.log(`--- ${NAME} 머리·목 자리 스윕 (머리 파츠 ${out.headCount}개를 통째로 옮겨 가며 '추가 가림'을 잰다) ---`);
    console.log('행 = dy, 열 = dz. 값 = 네 부위(thighR/shinR/thighL/shinL) 추가 가림의 최댓값. `.` = 0(통과)');
    console.log('   dy \\ dz ' + DZ.map(z => String(z.toFixed(2)).padStart(7)).join(''));
    for (const dy of DY) {
        const cells = DZ.map(dz => {
            const r = out.rows.find(v => v.dy === +dy.toFixed(2) && v.dz === +dz.toFixed(2));
            const m = Math.max(r.thighR, r.shinR, r.thighL, r.shinL);
            return (m === 0 ? '.' : m.toFixed(2)).padStart(7);
        });
        console.log('  ' + String(dy.toFixed(2)).padStart(6) + '  ' + cells.join(''));
    }
    const clear = out.rows.filter(r => !r.thighR && !r.shinR && !r.thighL && !r.shinL);
    console.log(`통과 조합 ${clear.length}/${out.rows.length}` +
        (clear.length ? ' — 예: ' + clear.slice(0, 8).map(r => `(dy ${r.dy}, dz ${r.dz})`).join(' ') : ''));
    console.log('⚠️ 채택은 통과 구간의 **가운데**로 — 가장자리를 고르면 안장 높이가 조금만 바뀌어도 다시 걸린다.');
    if (errs.length) console.log('ERRORS: ' + errs.slice(0, 3).join(' | '));
    await browser.close();
})();
