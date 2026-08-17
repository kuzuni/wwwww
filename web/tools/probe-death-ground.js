// 사망 최종 프레임에서 리그의 최저 world Y와 주요 본 위치를 실측한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    await page.evaluate(() => {
        const realTick = Combat.tick.bind(Combat);
        const realUpdate = Scene3D.update.bind(Scene3D);
        Combat.tick = () => {}; Scene3D.update = () => {};
        let vt = Date.now();
        U.now = () => vt;
        window.__step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { vt += 1000 / 120; realTick(1 / 120); realUpdate(1 / 120); }
        };
        Scene3D.clearEnemies();
        Combat.enemies = []; Combat.pending = [];
        Combat.phase = 'fight';
        Combat.hero.hp = Big.of(1);
        Combat.damageHero(Big.of(999999));
    });

    const measure = async (label) => {
        const st = await page.evaluate(() => {
            const rig = Scene3D.heroRig;
            const root = rig.root;
            root.updateWorldMatrix(true, true);
            let minY = Infinity, maxY = -Infinity;
            const V = new THREE.Vector3();
            rig.group.traverse(o => {
                if (!o.isMesh || !o.geometry) return;
                const pos = o.geometry.attributes.position;
                if (!pos) return;
                o.updateWorldMatrix(true, false);
                // 바운딩만 world로 변환해 근사 (모든 버텍스는 비용 큼)
                if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
                const bb = o.geometry.boundingBox;
                for (const cx of [bb.min.x, bb.max.x]) for (const cy of [bb.min.y, bb.max.y]) for (const cz of [bb.min.z, bb.max.z]) {
                    V.set(cx, cy, cz).applyMatrix4(o.matrixWorld);
                    if (V.y < minY) minY = V.y;
                    if (V.y > maxY) maxY = V.y;
                }
            });
            const wp = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) }; };
            return {
                rootRx: +root.rotation.x.toFixed(3),
                rootPy: +root.position.y.toFixed(3),
                groupY: +rig.group.position.y.toFixed(3),
                minWorldY: +minY.toFixed(3),
                maxWorldY: +maxY.toFixed(3),
                pelvis: rig.bones.pelvis ? wp(rig.bones.pelvis) : null,
                head: rig.headMount ? wp(rig.headMount) : null,
            };
        });
        console.log(label, JSON.stringify(st));
    };

    let prev = 0;
    for (const t of [0.45, 0.75, 1.0, 1.3, 2.0]) {
        await page.evaluate(d => window.__step(d), t - prev); prev = t;
        await measure(`t=${t}s`);
    }
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '콘솔 에러 0건');
    await browser.close();
})();
