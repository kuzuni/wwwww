// 탑승 가림 — **어디로 얼마나 옮겨야 풀리는지**를 산수로 내놓는 자.
// 사용: node diag-ride-sightline.js Donkey Alpaca Pterosaur   (인자 없으면 상습 실패 7종)
//
// 왜 필요한가: `probe-ride-clear` 는 "가려진다/안 가려진다"만 말한다. 그래서 지난 세 세션이
// 머리·목·부리를 한 칸씩 옮겨 보고 다시 25분짜리 판정기를 돌리는 짓을 반복했고, 3안까지 가고도
// 되돌렸다(TODO `mount-riverbond-remake` 의 A/B 기록). 이 자는 **레이 자체를 수치로 펴서**
// 가린 파츠가 시선 띠 위에 있는지 아래에 있는지, **몇 칸 올리거나 내리면 빠지는지**를 찍는다.
//
// 재는 것(전부 탈것 로컬 = `mountGroup.children[0]` 기준, 단위는 **칸**으로 환산해서도 같이 찍는다):
//   · 카메라 → 먼 쪽 다리(thighR/shinR) 레이 여러 줄
//   · 파츠별 AABB 와, 그 파츠의 z 구간에서 **레이가 지나는 y**
//   · Δy↑ = 레이 위로 빼내는 데 필요한 상승량 / Δy↓ = 레이 아래로 내리는 데 필요한 하강량
//     (둘 중 작은 쪽이 실제로 시도할 만한 처방이다)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 상습 실패 7종(2026-08-25 `probe-ride-clear` 실측) — 전부 '안장 앞에 머리·귀·볏이 서는' 형상이다.
const DEFAULT = ['Donkey', 'Alpaca', 'Elk', 'Goat', 'Camel', 'Dino', 'Pterosaur'];
const NAMES = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && !!Scene3D.heroG', { timeout: 180000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const out = await page.evaluate((names) => {
        Combat.tick = () => { };
        Scene3D.ridePhase = 0;
        Scene3D.clearEnemies(); Combat.enemies = [];
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const res = [];
        for (const name of names) {
            S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = name;
            Scene3D.refreshMount();
            Scene3D._clock = 0;
            for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
            Scene3D.heroG.updateWorldMatrix(true, true);
            Scene3D.mountGroup.updateWorldMatrix(true, true);
            const inner = Scene3D.mountGroup.children[0];
            const rig = Scene3D.heroRig, cam = Scene3D.camera;
            cam.updateMatrixWorld(true);
            const camPos = cam.getWorldPosition(V(0, 0, 0));
            const camL = inner.worldToLocal(camPos.clone());
            // 칸 크기 — 표의 좌표(칸)로 처방을 내려면 이 환산이 있어야 한다.
            // 칸 크기는 `makeMountMesh` 가 **빌더 그룹(=inner)** 에 찍는다 — mountGroup 쪽엔 없다.
            const cell = (inner.userData && inner.userData.cell) || null;

            // 먼 쪽 다리(R) 표본 — probe-ride-clear 와 **같은 점**을 쓴다(두 자가 어긋나면 못 믿는다).
            const rays = [];
            for (let i = 0; i < 3; i++) rays.push(['thighR' + i, rig.bones.hipR.localToWorld(V(0, -0.33 * (0.4 + 0.3 * i), 0))]);
            for (let i = 0; i <= 3; i++) rays.push(['shinR' + i, rig.bones.kneeR.localToWorld(V(0, -0.315 * i / 3, 0.045 * i / 3))]);
            const rayL = rays.map(([lbl, wp]) => [lbl, inner.worldToLocal(wp.clone())]);

            // 파츠 AABB(**탈것 로컬**) — pid 가 찍힌 메시만 모은다.
            // 🚨 `Box3.setFromObject()` 로 잡은 **월드** 축정렬 상자의 두 꼭짓점을 로컬로 되돌리면 안 된다.
            //    씬은 영웅·탈것을 yaw 0.55 로 돌려 놓으므로 그 상자는 로컬 축과 어긋나 있고, 되돌리면
            //    상자가 실제보다 부푼다(당나귀 귀가 z 로 두 배 넓게 찍혔다). 정점을 하나씩 로컬로
            //    옮겨서 재야 처방(몇 칸 올려라)이 맞는다.
            const inv = new THREE.Matrix4().copy(inner.matrixWorld).invert();
            const parts = [];
            const tmp = V(0, 0, 0);
            inner.traverse(o => {
                if (!o.isMesh || !o.userData.pid || !o.geometry || !o.geometry.attributes.position) return;
                o.updateWorldMatrix(true, false);
                const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
                const pos = o.geometry.attributes.position;
                const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
                for (let i = 0; i < pos.count; i++) {
                    tmp.fromBufferAttribute(pos, i).applyMatrix4(m);
                    const v = [tmp.x, tmp.y, tmp.z];
                    for (let k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; }
                }
                parts.push({
                    pid: o.userData.pid + (o.userData.pparent ? '<' + o.userData.pparent : ''),
                    x: [lo[0], hi[0]], y: [lo[1], hi[1]], z: [lo[2], hi[2]],
                });
            });
            res.push({ name, cell, camL: [camL.x, camL.y, camL.z], rays: rayL.map(([l, p]) => [l, p.x, p.y, p.z]), parts });
        }
        return res;
    }, NAMES);

    const f = (v) => (v >= 0 ? ' ' : '') + v.toFixed(3);
    for (const r of out) {
        console.log(`\n=== ${r.name} ===  카메라(로컬) ${r.camL.map(v => +v.toFixed(2)).join(', ')}${r.cell ? `  칸=${r.cell}` : ''}`);
        const [cx, cy, cz] = r.camL;
        for (const [lbl, tx, ty, tz] of r.rays) {
            // 레이 위의 한 점을 z 로 매개화한다: t = (z - cz)/(tz - cz)
            const at = (z) => {
                const t = (z - cz) / (tz - cz);
                return [cx + (tx - cx) * t, cy + (ty - cy) * t, t];
            };
            console.log(`  ${lbl} → 목표(${f(tx)},${f(ty)},${f(tz)})`);
            const hits = [];
            for (const p of r.parts) {
                // 파츠 z 구간 안에서 레이가 그 파츠의 x·y 상자를 지나는가(보수적으로 구간 양끝+중앙 3점)
                let worst = null;
                for (const z of [p.z[0], (p.z[0] + p.z[1]) / 2, p.z[1]]) {
                    const [x, y, t] = at(z);
                    if (t < 0 || t > 1) continue;                       // 목표 뒤/카메라 뒤는 가릴 수 없다
                    if (x < p.x[0] - 1e-6 || x > p.x[1] + 1e-6) continue; // x 로 빗나감
                    const up = p.y[1] - y;    // 파츠 윗면이 레이보다 얼마나 위인가
                    const dn = y - p.y[0];    // 레이가 파츠 밑면보다 얼마나 위인가
                    if (up < 0 || dn < 0) continue;                      // y 로 빗나감 = 안 가림
                    const rec = { z, y, up, dn };
                    if (!worst || Math.min(rec.up, rec.dn) > Math.min(worst.up, worst.dn)) worst = rec;
                }
                if (worst) hits.push({ p, w: worst });
            }
            if (!hits.length) { console.log('      (가리는 파츠 없음)'); continue; }
            for (const { p, w } of hits) {
                const cell = r.cell || 0;
                const kan = (v) => cell ? ` (${(v / cell).toFixed(1)}칸)` : '';
                console.log(`      ✗ ${p.pid}  y[${f(p.y[0])},${f(p.y[1])}] z[${f(p.z[0])},${f(p.z[1])}]`
                    + `  레이 y=${f(w.y)}  →  Δy↑ ${(w.dn + 0.001).toFixed(3)}${kan(w.dn)} 올리거나  Δy↓ ${(w.up + 0.001).toFixed(3)}${kan(w.up)} 내리면 빠진다`);
            }
        }
    }
    console.log(errors.length ? '\nPAGE ERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
