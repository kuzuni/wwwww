// 임팩트 프레임 변위 실측 — 비평가 4차 지적 ⓐ("접촉 프레임에 적의 변위가 없다") 교차검증용.
// 사용: node probe-knockback.js
// 월드 유닛이 아니라 **화면 픽셀**로 잰다 — 비평가가 보는 건 프레임이지 좌표가 아니다.
// 적의 몸 실루엣을 카메라로 투영해 프레임별 x 중심을 뽑고, 히트 직전 프레임 대비 변위를 표로 낸다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const out = await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.__t = 0;
        Scene3D.update = () => {};
        window.__step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { Scene3D.__t += 1 / 120; real(1 / 120); }
        };
        Scene3D.clearEnemies();
        const e = { id: 901, x: Combat.MELEE_X, alive: true, hp: Big.of(100000), maxHp: Big.of(100000), isBoss: false, kind: 'goblin' };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(901);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.position.set(e.x + Scene3D.worldX, 0, 0);
        m.g.userData.landed = true;
        Combat.phase = 'fight';
        window.__step(0.016);

        // 몸통 중앙 높이의 월드점을 스크린 좌표로 — 카메라 셰이크는 카메라에 걸리므로 몸 변위만 보려면
        // 카메라 흔들림을 뺀 순수 투영이 필요하다. Scene3D.camera를 그대로 쓰되 셰이크는 0으로 고정한다.
        const proj = () => {
            Scene3D.shakeMag = 0;
            const eh = (m.topY || 1.1) * (m.baseScale || 1);
            const v = new THREE.Vector3(m.g.position.x, eh * 0.46, m.g.position.z);
            v.project(Scene3D.camera);
            const cw = Scene3D.renderer.domElement.clientWidth;
            return { px: (v.x * 0.5 + 0.5) * cw, wx: m.g.position.x, sx: m.g.scale.x, sy: m.g.scale.y, sz: m.g.scale.z, rz: m.g.rotation.z };
        };

        const runs = [];
        const doCase = (label, amount, crit) => {
            // 히트 직전 정착 상태를 기준선으로
            window.__step(0.5);
            const base = proj();
            Combat.damageEnemy(Combat.enemies[0], Big.of(amount), crit, null);
            const frames = [];
            // 접촉 직후 프레임들 (60fps 기준 1·2·4·8프레임)
            const marks = [0.0167, 0.0167, 0.0333, 0.0667];
            let t = 0;
            for (const d of marks) {
                window.__step(d); t += d;
                const p = proj();
                frames.push({ ms: Math.round(t * 1000), dpx: +(p.px - base.px).toFixed(2), dwx: +(p.wx - base.wx).toFixed(4), sx: +p.sx.toFixed(4), sy: +p.sy.toFixed(4), rz: +(p.rz * 180 / Math.PI).toFixed(2) });
            }
            runs.push({ label, base: +base.px.toFixed(2), frames });
            window.__step(0.6);
            Combat.enemies[0].hp = Big.of(100000);
        };
        // sev = 피해/최대HP. 아이들 게임의 95%는 소액 타격이다.
        doCase('일반 sev=0.02', 2000, false);
        doCase('일반 sev=0.10', 10000, false);
        doCase('일반 sev=0.30', 30000, false);
        doCase('크리 sev=0.30', 30000, true);
        return { runs, bodyPx: (() => {
            // 적 몸통의 화면 폭 — 변위를 몸 크기 대비 %로 읽기 위한 기준
            const box = new THREE.Box3().setFromObject(m.g);
            const cw = Scene3D.renderer.domElement.clientWidth;
            const a = new THREE.Vector3(box.min.x, box.max.y * 0.46, 0).project(Scene3D.camera);
            const b = new THREE.Vector3(box.max.x, box.max.y * 0.46, 0).project(Scene3D.camera);
            return +(Math.abs(b.x - a.x) * 0.5 * cw).toFixed(1);
        })() };
    });

    console.log('적 몸통 화면 폭 = ' + out.bodyPx + 'px (480px 뷰포트)');
    for (const r of out.runs) {
        console.log('\n[' + r.label + '] 기준 x=' + r.base + 'px');
        for (const f of r.frames) {
            console.log('  +' + String(f.ms).padStart(3) + 'ms  Δ화면 ' + String(f.dpx).padStart(7) + 'px (' +
                String((f.dpx / out.bodyPx * 100).toFixed(1)).padStart(5) + '% 몸폭)  Δ월드 ' + String(f.dwx).padStart(7) +
                '  scale x/y ' + f.sx + '/' + f.sy + '  rotZ ' + f.rz + '°');
        }
    }
    console.log(errors.length ? '\nCONSOLE ERRORS: ' + errors.join(' | ') : '\n(no console errors)');
    await browser.close();
})();
