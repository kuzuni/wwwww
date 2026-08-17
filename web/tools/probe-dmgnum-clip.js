// 데미지 숫자 **가로 화면 이탈** 실측 — QA 14차 `dmgnum-right-clip`("오른쪽 끝 적을 때린 피해가
// #fx-layer 밖으로 흘러 잘리거나 통째로 안 보인다")을 픽셀로 확인/반증한다.
// 사용: node probe-dmgnum-clip.js
//
// 재는 것: ① 결정적 스윕 — damageNumber 를 x=-1~3.5 월드좌표로 훑고, **아크(--dx 드리프트)가 다 흐른
//              프레임까지** getBoundingClientRect() 가 fx-layer 안에 완전히 드는가(visibleFrac===1).
//          ② 실전 — hitEnemy 로 오른쪽에서 걸어오는 적을 연타하며 float-dmg rect 이탈 비율을 센다.
// ⚠️ 스폰 시점만 재면 안 된다 — 드리프트가 스폰 후에 얹히므로 반드시 애니메이션 타임라인을 훑어야 한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    // ── ① 결정적 스윕 ─────────────────────────────────────────────
    const sweep = await page.evaluate(async () => {
        const fx = Scene3D.fxLayer.getBoundingClientRect();
        const rows = [];
        // 오른쪽 편향 재현: 양의 드리프트(적 피해)로 x 를 훑는다. 크리(더 큰 폭)도 포함.
        const dxRight = 26; // hitEnemy 의 U.rand(6,26) 최댓값
        for (let x = -1; x <= 3.5001; x += 0.25) {
            for (const crit of [false, true]) {
                const el = Scene3D.damageNumber(
                    new THREE.Vector3(x, 1.2, 0), '999999',
                    crit ? 'dmg-crit' : 'dmg', { dx: dxRight, rise: -60, scale: crit ? 1.3 : 1.1 });
                if (!el) continue;
                const anim = el.getAnimations()[0];
                let worst = 1; // visibleFrac 최소
                let sample = (r) => {
                    const visW = Math.min(r.right, fx.right) - Math.max(r.left, fx.left);
                    const frac = r.width > 0 ? Math.max(0, visW) / r.width : 1;
                    worst = Math.min(worst, frac);
                };
                if (anim) {
                    const dur = anim.effect.getTiming().duration;
                    for (let f = 0; f <= 1.0001; f += 0.05) {
                        anim.currentTime = dur * f;
                        sample(el.getBoundingClientRect());
                    }
                    anim.currentTime = 0;
                } else sample(el.getBoundingClientRect());
                rows.push({ x: +x.toFixed(2), crit, vf: +worst.toFixed(3) });
                el.remove();
            }
        }
        return { fxW: +fx.width.toFixed(1), rows };
    });
    const bad = sweep.rows.filter(r => r.vf < 0.999);
    console.log(`[스윕] fx-layer 폭=${sweep.fxW}px, 표본 ${sweep.rows.length}개, 완전가시(vf=1) 밖=${bad.length}개`);
    if (bad.length) console.log('  이탈:', bad.slice(0, 12).map(r => `x${r.x}${r.crit ? 'c' : ''}=${r.vf}`).join(' '));

    // ── ② 실전 연타 관찰 ──────────────────────────────────────────
    const live = await page.evaluate(async () => {
        Combat.tick = () => { };               // 전투 진행 동결 — 적이 스윕 중 죽지 않게
        const fx = Scene3D.fxLayer.getBoundingClientRect();
        let worst = 1;
        // 오른쪽 가장자리(월드 x 큰 값)에서 연타 — 걸어오는 적 재현
        for (let i = 0; i < 40; i++) {
            const e = Combat.enemies.find(x => x.alive);
            if (!e) break;
            e.hp = e.maxHp;                    // 죽지 않게 유지
            Scene3D.hitEnemy(e.id, e.maxHp.mul(0.02 + 0.28 * (i % 3 === 0 ? 1 : 0)), i % 4 === 0, 'melee');
            Scene3D.update(1 / 120);
            for (const el of Scene3D.fxLayer.querySelectorAll('.float-dmg')) {
                const anim = el.getAnimations()[0];
                if (!anim) continue;
                const dur = anim.effect.getTiming().duration;
                const save = anim.currentTime;
                for (let f = 0.3; f <= 1.0001; f += 0.1) { // 드리프트가 실린 후반 구간
                    anim.currentTime = dur * f;
                    const r = el.getBoundingClientRect();
                    const visW = Math.min(r.right, fx.right) - Math.max(r.left, fx.left);
                    const frac = r.width > 0 ? Math.max(0, visW) / r.width : 1;
                    worst = Math.min(worst, frac);
                }
                anim.currentTime = save;
            }
        }
        // 유일 카운트를 위해 마지막 잔존 상태만 별도 집계
        let total = 0, out = 0;
        for (const el of Scene3D.fxLayer.querySelectorAll('.float-dmg')) {
            const r = el.getBoundingClientRect();
            total++;
            if (r.left < fx.left - 0.5 || r.right > fx.right + 0.5) out++;
        }
        return { total, out, worst: +worst.toFixed(3) };
    });
    console.log(`[실전] 잔존 숫자 ${live.total}개 중 경계이탈 ${live.out}개, 애니 최저 visibleFrac=${live.worst}`);

    const pass = bad.length === 0 && live.worst >= 0.999 && errors.length === 0;
    if (errors.length) console.log('콘솔에러:', errors.slice(0, 5));
    console.log(pass ? 'PASS — 모든 데미지 숫자가 게임 영역 안에 완전히 든다' : 'FAIL');
    await browser.close();
    process.exit(pass ? 0 : 1);
})();
