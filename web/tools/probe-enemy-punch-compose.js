// probe-enemy-punch-compose.js — 히트 스쿼시 × 보행 스쿼시 **합성**이 서로를 지우지 않는지 잰다.
//   왜: `cute-art-direction` ⓔ 로 보행 스쿼시가 매 프레임 `m.g.scale` 을 쓰게 되면서, 예전에
//   펀치가 단독으로 쓰던 자리를 둘이 나눠 쓰게 됐다. 잘못 합치면(더하기·후자 우선) **피격 순간
//   가로 압축이 보행 스트레치에 상쇄돼** 타격감이 통째로 사라지는데, 콘솔 에러도 캡처 이상도 없다.
//   게이트 ① 펀치 중 가로(x)가 기준보다 확실히 눌린다 ② 그 압축이 보행 위상과 무관하게 유지된다
//        ③ 펀치가 끝나면 보행 스쿼시만 남는다(누적 잔류 없음).
// 사용: node probe-enemy-punch-compose.js [kind(기본 goblin)]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const KIND = process.argv[2] || 'goblin';
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const r = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        Scene3D.walking = false;
        Scene3D.clearEnemies();
        const e = { id: 555, x: Combat.MELEE_X + 1.4, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(555);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.userData.landed = true; m._scaleLocked = false;
        const b = m.baseScale || 1, dt = 1 / 60;
        const run = (withPunch) => {
            Scene3D._clock = 0; m.punchT = 0;
            Scene3D.update(dt);
            if (withPunch) { m.punchT = m.punchDur = 0.24; m.punchHold = 0.055; m.punchAmp = 0.12; }
            const sx = [], sy = [];
            for (let i = 0; i < 24; i++) { Scene3D.update(dt); sx.push(m.g.scale.x / b); sy.push(m.g.scale.y / b); }
            return { sx, sy, punchLeft: m.punchT };
        };
        // 같은 위상에서 두 판을 돌린다 — 보행 스쿼시는 `_clock` 만의 함수라 완전히 재현된다.
        const off = run(false), on = run(true);
        // 펀치가 끝난 뒤(0.24s = 15프레임 이후)도 계속 돌려 잔류를 본다
        const after = [];
        for (let i = 0; i < 12; i++) { Scene3D.update(dt); after.push(m.g.scale.x / b); }
        return { off, on, after, punchLeft: on.punchLeft };
    });

    // 두 판은 `_clock` 위상이 같으므로 차분이 **펀치 성분만** 남긴다(보행 성분은 상쇄된다).
    const drop = [];
    for (let i = 0; i < 8; i++) drop.push(r.off.sx[i] - r.on.sx[i]);
    const maxDrop = Math.max(...drop), minDrop = Math.min(...drop);
    // ③ 펀치 종료 후 x 가 무펀치 사이클 대역 안으로 돌아오는가
    const offMin = Math.min(...r.off.sx), offMax = Math.max(...r.off.sx);
    const resid = r.after.filter(v => v < offMin - 0.02 || v > offMax + 0.02).length;

    const chk = [
        // 🚨 여기서 **최솟값으로 재면 안 된다** — 펀치는 유지 뒤 elastic 복귀라 반대쪽 오버슈트
        //    (x 가 기준보다 넓어지는 구간)가 설계상 들어 있다(punch 블록 주석 '오버슈트 정점 22%').
        //    최솟값 게이트는 그 의도된 오버슈트를 '상쇄됐다'로 오독한다(초안이 실제로 −0.030 으로 FAIL).
        ['① 펀치 최대 압축', maxDrop >= 0.08, `무펀치 대비 x 최대 압축 ${maxDrop.toFixed(4)} (≥0.08)`],
        ['①ʹ elastic 오버슈트 생존', minDrop < -0.005, `반대쪽 정점 ${minDrop.toFixed(4)} (<−0.005)`],
        ['② 유지 구간 상쇄 없음', drop.slice(0, 3).every(d => d >= 0.08), `초기 3프레임 압축 ${drop.slice(0, 3).map(d => d.toFixed(3)).join('/')} (각 ≥0.08)`],
        ['③ 종료 후 잔류 없음', resid === 0, `대역 이탈 ${resid}프레임 (무펀치 x ${offMin.toFixed(3)}~${offMax.toFixed(3)})`],
        ['④ 콘솔 0', errors.length === 0, `${errors.length}건`],
    ];
    console.log(`${KIND} — 히트×보행 스쿼시 합성`);
    for (const c of chk) console.log(`   ${c[1] ? '✅' : '❌'} ${c[0]}: ${c[2]}`);
    if (errors.length) console.log('   err:', errors.slice(0, 3).join(' | '));
    await browser.close();
    const bad = chk.filter(c => !c[1]).length;
    console.log(bad ? `미통과 ${bad}건` : '전 항목 통과');
    process.exit(bad ? 1 : 0);
})();
