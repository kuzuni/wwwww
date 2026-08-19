// 탑승 다리 '감싸기' 각도 스윕 — 무릎을 깊게 접으면 발이 안쪽으로 말려 몸통에 묻힌다.
// 고관절 외회전(ry)·외전(rz)을 훑어 **발이 배럴 밖으로 나오는** 조합을 실측으로 고른다.
// 사용: node probe-ride-wrap.js [form]     (기본 quad)
// ⚠️ 눈대중으로 상수를 올리지 말 것 — rx(굴곡)·ry(외회전)·rz(외전)은 오일러 XYZ 로 섞여
//    한 축만 키우면 다른 축 효과가 상쇄된다(rz 만 키우면 발이 아니라 무릎만 벌어졌다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const FORM = process.argv[2] || 'quad';
const NAME = { quad: 'Brown Horse', fly: 'Mini Dragon', wheeled: 'Bike' }[FORM] || 'Brown Horse';
const BARREL = { flat: 0.578, wheeled: 0.03, fly: 0.152, quad: 0.180 }[FORM];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForTimeout(1500);

    const rows = await page.evaluate(({ form, name }) => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
        S.activeMount = name;
        const base = Scene3D.MOUNT_FORMS[form].pose;
        const orig = JSON.parse(JSON.stringify(base));
        const out = [];
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        for (const ry of [0, 0.15, 0.3, 0.45, 0.6]) {
            for (const rz of [0.5, 0.58, 0.66, 0.74]) {
                for (const kz of [0, 0.15, 0.3]) {
                    base.hipL = { rx: orig.hipL.rx, ry: -ry, rz: -rz };
                    base.hipR = { rx: orig.hipR.rx, ry: ry, rz: rz };
                    base.kneeL = { rx: orig.kneeL.rx, rz: -kz };
                    base.kneeR = { rx: orig.kneeR.rx, rz: kz };
                    Scene3D.refreshMount();
                    for (let i = 0; i < 30; i++) Scene3D.update(1 / 60);
                    Scene3D.heroG.updateWorldMatrix(true, true);
                    Scene3D.mountGroup.updateWorldMatrix(true, true);
                    const rig = Scene3D.heroRig, inner = Scene3D.mountGroup.children[0];
                    const foot = (s) => inner.worldToLocal(rig.bones['knee' + s].localToWorld(V(0, -0.315, 0.045)));
                    const fL = foot('L'), fR = foot('R');
                    // 무릎 자체도 배럴 밖이어야 '감쌌다'로 읽힌다 — 발만 밖이면 정강이가 몸통을 통과한다
                    const knee = (s) => inner.worldToLocal(rig.bones['knee' + s].localToWorld(V(0, 0, 0)));
                    const kL = knee('L'), kR = knee('R');
                    out.push({
                        ry, rz, kz,
                        footClear: +(Math.min(Math.abs(fL.x), Math.abs(fR.x))).toFixed(3),
                        kneeClear: +(Math.min(Math.abs(kL.x), Math.abs(kR.x))).toFixed(3),
                        footZ: +((fL.z + fR.z) / 2).toFixed(3),
                        footY: +((fL.y + fR.y) / 2).toFixed(3),
                    });
                }
            }
        }
        base.hipL = orig.hipL; base.hipR = orig.hipR; base.kneeL = orig.kneeL; base.kneeR = orig.kneeR;
        return out;
    }, { form: FORM, name: NAME });

    console.log(`[${FORM}] ${NAME} — 몸통 반폭 ${BARREL} (발·무릎 |x| 가 이보다 커야 다리가 몸통 밖)`);
    console.log('  hip.ry  hip.rz  knee.rz | 발|x|   무릎|x|  발여유    무릎여유  발 z    발 y');
    const ok = [];
    for (const r of rows) {
        const fc = r.footClear - BARREL, kc = r.kneeClear - BARREL;
        const good = fc > 0.02 && kc > 0.02;
        if (good) ok.push(r);
        console.log(`  ${String(r.ry).padEnd(7)} ${String(r.rz).padEnd(7)} ${String(r.kz).padEnd(8)}| ` +
            `${String(r.footClear).padEnd(7)} ${String(r.kneeClear).padEnd(8)} ` +
            `${(fc >= 0 ? '+' : '') + fc.toFixed(3)}   ${(kc >= 0 ? '+' : '') + kc.toFixed(3)}   ` +
            `${String(r.footZ).padEnd(7)} ${r.footY}  ${good ? 'OK' : ''}`);
    }
    console.log(`\n통과 조합 ${ok.length}개` + (ok.length ? ` — 최소 각(가장 자연스러운) 후보: ry ${ok[0].ry} / rz ${ok[0].rz} / knee.rz ${ok[0].kz}` : ' ⚠️ 없음 — 배럴을 좁히거나 굴곡을 줄여야 한다'));
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
    process.exit(ok.length ? 0 : 2);
})();
