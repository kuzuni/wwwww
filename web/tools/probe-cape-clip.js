// 망토-견갑 관통 실측 — 비평가 잔여 지적 ⓕ "망토가 견갑 관통".
//
// ⚠️ 이 항목은 눈대중으로 판정하면 안 된다. 망토는 매 프레임 정점이 움직이는 천 시뮬이라
//    "어느 프레임에 겹쳐 보였다"가 관통인지 원근 겹침인지 스크린샷으로는 구분이 안 된다.
//    (같은 함정: 소환 팝업 '이름판이 옆 셀과 겹친다'는 실측하니 겹침 0건이었다.)
// → 망토 **변형 후 정점의 월드 좌표**를 뽑아 견갑 메시의 월드 AABB 안에 들어가는 개수를 센다.
//    AABB 는 느슨한 경계라 **0 이면 관통 없음이 확정**이고, >0 이면 그 프레임·정점을 좁혀 본다.
//
// ⚠️ 한 프레임만 재면 안 된다 — 망토는 idle 호흡·걷기 스윙·공격 반동으로 진폭이 달라진다.
//    idle 과 walk 를 각각 여러 위상에서 돌려 최악값을 본다.
//
// 사용: node probe-cape-clip.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    const out = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        Scene3D.clearEnemies(); if (typeof Combat !== 'undefined') Combat.enemies = [];
        const R = Scene3D.heroRig;

        // 견갑 = 어깨 그룹 자식 중 `userData.part === 'pauldron'` 인 Group(pauldronG).
        // ⚠️ 'Group 이고 y>-0.02' 로만 거르면 상완 캡슐(this.capsule 이 Group 을 돌려준다)까지 잡혀
        //    견갑이 4개로 세어진다 — 첫 판이 그랬다. 판정 자체는 더 엄격해질 뿐이라 결론은 안 바뀌지만
        //    '최소 여유' 가 견갑이 아니라 팔까지의 거리가 돼 수치의 의미가 흐려진다.
        // 🚨 **2026-08-20 — 옛 판은 "LatheGeometry 캡을 가진 Group" 으로 찾았다(㉡).** 캡이 voxel
        //    (BufferGeometry)로 바뀌자 하나도 못 찾아 `ERROR: 견갑 그룹을 못 찾음` 으로 죽었다.
        //    태그로 쥔다 — 이름표만 태그이고 치수·거리는 여전히 구워진 정점에서 나온다.
        const pauldrons = [];
        for (const a of R.arms) {
            for (const ch of a.shoulder.children) {
                if (!ch.isGroup || ch === a.elbow) continue;
                if (ch.userData.part === 'pauldron') pauldrons.push(ch);
            }
        }
        if (!pauldrons.length) return { error: '견갑 그룹을 못 찾음' };

        const cape = R.capeMesh;
        if (!cape) return { error: '망토 메시 없음' };

        const sample = () => {
            Scene3D.heroG.updateMatrixWorld(true);
            const boxes = pauldrons.map(p => new THREE.Box3().setFromObject(p));
            const pos = cape.geometry.attributes.position;
            const v = new THREE.Vector3();
            let inside = 0, minDist = 1e9;
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i).applyMatrix4(cape.matrixWorld);
                for (const b of boxes) {
                    if (b.containsPoint(v)) inside++;
                    // 상자까지의 거리 — 0 이면 안쪽. 여유가 얼마나 남았는지 본다.
                    const d = b.distanceToPoint(v);
                    if (d < minDist) minDist = d;
                }
            }
            return { inside, minDist: +minDist.toFixed(4) };
        };

        const rows = [];
        for (const mode of ['idle', 'walk']) {
            Scene3D.walking = (mode === 'walk');
            let worst = { inside: -1, minDist: 1e9 }, worstT = 0;
            for (let step = 0; step < 40; step++) {          // 위상 40개 — 한 프레임만 재면 최악값을 놓친다
                ProChar.update(R, 0.05);
                const s = sample();
                if (s.inside > worst.inside || (s.inside === worst.inside && s.minDist < worst.minDist)) { worst = s; worstT = step; }
            }
            rows.push({ mode, worstStep: worstT, inside: worst.inside, minDist: worst.minDist });
        }
        Scene3D.walking = false;
        return { pauldrons: pauldrons.length, capeVerts: cape.geometry.attributes.position.count, rows };
    });

    if (out.error) { console.log('ERROR: ' + out.error); await browser.close(); process.exit(1); }
    console.log('견갑', out.pauldrons + '개 · 망토 정점', out.capeVerts + '개 · 위상 40스텝×2모드');
    for (const r of out.rows)
        console.log(`  ${r.mode.padEnd(5)} 최악 위상 ${String(r.worstStep).padStart(2)} · 견갑 AABB 안 정점 ${r.inside}개 · 최소 여유 ${r.minDist}`,
            r.inside === 0 ? '✅ 관통 없음(AABB 는 느슨한 경계라 0 이면 확정)' : '❌ 관통');
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
