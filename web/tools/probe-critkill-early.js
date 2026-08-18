// hp-juicy 6차 지적 ⓓ('크리와 처치의 첫 100ms 가 구분 안 된다', B #8: "붕괴 시작이 +260ms 라
// 결정타 쾌감이 늦다") 실측. 항목 규칙상 6차 지적은 미검증이라 착수 전에 재는 게 먼저다.
//
// 재는 것: 같은 프레임에 한 적에는 **크리(비살상)**, 다른 적에는 **처치**를 먹이고, 첫 ~200ms 동안
//   두 적의 몸 트랜스폼(기울기 rotation.z, 무릎 굽힘, y 낙하)이 얼마나 **갈라지는지** 프레임마다 잰다.
//   B #8 의 주장이 맞다면 첫 100ms 에 두 값이 거의 같고, 처치 고유의 붕괴는 +200ms 이후에야 벌어진다.
//
// ⚠️ 크리 넉백도 몸을 기울인다(hitEnemy: rotation.z = -p*roll, 큰 크리는 ~19°) — 그래서 '기울기 크기'만으론
//    못 가른다. **처치는 계속 넘어가고 크리는 돌아온다**는 궤적 차이가 핵심이라, 각 시각의 값과 함께
//    '처치−크리 차이'를 같이 낸다.
//
// 사용: node tools/probe-critkill-early.js  (골렘 웨이브 = 적 2+ 필요)
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
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 180000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.filter(e => e.alive && Scene3D.enemyMap.get(e.id)).length >= 2, null, { timeout: 180000 });

    const out = await page.evaluate(() => {
        Combat.tick = () => { };
        Scene3D.walking = false;
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (sec) => { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) realUpdate(1 / 120); };
        Scene3D.anims.length = 0;
        step(0.3);

        const alive = Combat.enemies.filter(e => e.alive && Scene3D.enemyMap.get(e.id));
        const critE = alive[0], killE = alive[1];
        const cm = Scene3D.enemyMap.get(critE.id), km = Scene3D.enemyMap.get(killE.id);
        const kneeOf = (m) => (m.anim && m.anim.bleg && m.anim.bleg[0]) ? +m.anim.bleg[0].knee.rotation.x.toFixed(3) : null;
        const snap = (t) => ({
            t,
            crit: { rz: +cm.g.rotation.z.toFixed(3), y: +cm.g.position.y.toFixed(3), knee: kneeOf(cm), sy: +cm.g.scale.y.toFixed(3) },
            kill: { rz: +km.g.rotation.z.toFixed(3), y: +km.g.position.y.toFixed(3), knee: kneeOf(km), sy: +km.g.scale.y.toFixed(3) },
        });

        // 큰 크리(비살상) — sev 를 키우려 큰 피해를 주되 hp 는 안 넘게: hp 의 40% 만 깎는다
        Combat.damageEnemy(critE, Big.of(critE.hp).mul(0.4), true, null);
        // 처치 — 같은 프레임
        Combat.damageEnemy(killE, Big.of(killE.hp).mul(10), false, null);

        const rows = [];
        for (let t = 0; t <= 260; t += 16) { rows.push(snap(t)); step(0.016); }
        return { rows, critAlive: critE.alive, killAlive: killE.alive };
    });

    const deg = (r) => (r * 180 / Math.PI).toFixed(1);
    const pad = (v, n) => String(v).padStart(n);
    console.log('\n== 크리 vs 처치 첫 260ms 몸 트랜스폼 (크리 생존=%s · 처치 생존=%s) ==', out.critAlive, out.killAlive);
    console.log('   시각    크리 기울기  처치 기울기   Δ기울기    크리 무릎  처치 무릎   Δ무릎');
    let first100Div = 0;
    for (const r of out.rows) {
        const dRz = Math.abs(r.kill.rz - r.crit.rz);
        const dKnee = (r.kill.knee !== null && r.crit.knee !== null) ? Math.abs(r.kill.knee - r.crit.knee) : null;
        if (r.t <= 100) first100Div = Math.max(first100Div, dRz);
        console.log('  +%sms  %s°  %s°   %s°   %s  %s   %s',
            pad(r.t, 3), pad(deg(r.crit.rz), 7), pad(deg(r.kill.rz), 7), pad(deg(r.kill.rz - r.crit.rz), 7),
            pad(r.crit.knee === null ? '—' : r.crit.knee, 6), pad(r.kill.knee === null ? '—' : r.kill.knee, 6),
            pad(dKnee === null ? '—' : dKnee.toFixed(3), 6));
    }
    console.log('\n  첫 100ms 최대 기울기 차 = %s° ', deg(first100Div * Math.PI / 180 * (Math.PI / 180) ** 0)); // (그대로 표시)
    console.log('  ⚠️ 판독은 표로 — 처치 기울기가 첫 100ms 에 이미 크리와 뚜렷이 갈리면 ⓓ 는 약하다.');
    console.log('\n콘솔 에러 %d건%s', errors.length, errors.length ? ': ' + errors.slice(0, 3).join(' | ') : '');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
