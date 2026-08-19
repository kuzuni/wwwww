// 핸들바 파지 각 스윕 — 빈 손이 **자전거 앞쪽 바 자리**에 오는 팔 각을 실측으로 고른다.
// 사용: node probe-ride-grip.js
// ⚠️ 이 값을 눈대중으로 넣으면 안 된다: 어깨는 척추(탑승 시 앞으로 0.2 숙임) 아래에 달려 있어
//    같은 rx라도 상체 피치만큼 손끝이 앞뒤로 밀린다. 첫 판에서 rx −1.16 을 넣었더니 손이 골반 옆에
//    남아 **바가 허리까지 끌려와 몸통을 관통**했다(캡처로 확인).
// 판정: 손이 바 기준자리(로컬 z 0.255 / y 0.45)보다 **앞(+z)** 이고, 시트튜브(z −0.07)보다 훨씬 앞일 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REST = { y: 0.60, z: 0.215 };   // makeMountMesh 의 바 기준자리(로컬) — 여기를 바꾸면 같이 고칠 것

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForTimeout(1500);

    const rows = await page.evaluate(() => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = { Bike: { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Bike';
        const form = Scene3D.MOUNT_FORMS.wheeled;
        const orig = Object.assign({}, form.barReach);
        const out = [];
        for (const sh of [-1.2, -1.5, -1.8, -2.1, -2.4]) {
            for (const el of [0, -0.2, -0.45, -0.7]) {
                for (const sz of [0.1, 0.26, 0.42]) {
                    form.barReach = { shoulder: sh, shoulderZ: sz, elbow: el };
                    Scene3D.refreshMount();
                    for (let i = 0; i < 20; i++) Scene3D.update(1 / 60);
                    Scene3D.heroG.updateWorldMatrix(true, true);
                    Scene3D.mountGroup.updateWorldMatrix(true, true);
                    const rig = Scene3D.heroRig, inner = Scene3D.mountGroup.children[0];
                    // 무기 안 든 쪽 = 바를 잡을 손 (기본 무기는 오른손 파지 → 왼손이 빈 손)
                    const weaponHand = (Scene3D.gripOf(Scene3D.wtypeId) || {}).hand === 'L' ? 'L' : 'R';
                    const hand = weaponHand === 'L' ? rig.handR : rig.handL;
                    const p = inner.worldToLocal(hand.getWorldPosition(new THREE.Vector3()));
                    out.push({ sh, el, sz, x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) });
                }
            }
        }
        form.barReach = orig;
        return out;
    });

    console.log(`바 기준자리: y ${REST.y} / z ${REST.z} (손이 이 근처여야 스템이 안 늘어나고, z 가 작으면 바가 허리로 끌려온다)`);
    console.log('  어깨rx  팔꿈치  어깨rz | 손 x     손 y    손 z    Δz(바 대비)  판정');
    const ok = [];
    for (const r of rows) {
        const dz = r.z - REST.z, dy = r.y - REST.y;
        // 바는 손으로 따라오므로 '정확히 일치'가 아니라 **앞쪽·적정 높이**면 된다.
        const good = r.z > 0.16 && r.y > 0.30 && r.y < 0.62;
        if (good) ok.push(Object.assign({ dz, dy }, r));
        console.log(`  ${String(r.sh).padEnd(7)} ${String(r.el).padEnd(7)} ${String(r.sz).padEnd(7)}| ` +
            `${String(r.x).padEnd(8)} ${String(r.y).padEnd(7)} ${String(r.z).padEnd(7)} ` +
            `${(dz >= 0 ? '+' : '') + dz.toFixed(3)}       ${good ? 'OK' : (r.z <= 0.16 ? '뒤로 처짐' : '높이 벗어남')}`);
    }
    // 바가 제자리에서 가장 덜 움직이는 후보 = 스템 왜곡이 가장 작다
    ok.sort((a, b) => (Math.abs(a.dz) + Math.abs(a.dy)) - (Math.abs(b.dz) + Math.abs(b.dy)));
    console.log(`\n통과 ${ok.length}개` + (ok.length ? ` — 바 이동이 가장 작은 후보: 어깨 ${ok[0].sh} / 팔꿈치 ${ok[0].el} / 어깨rz ${ok[0].sz} (Δz ${ok[0].dz.toFixed(3)}, Δy ${ok[0].dy.toFixed(3)})` : ' ⚠️ 없음'));
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
    process.exit(ok.length ? 0 : 2);
})();
