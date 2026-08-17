// 사망 시 영웅이 하늘로 올라가지 않는다 — **실게임 경로** 검증 (사용자 3회 재지적 `death-float-sky`)
// probe-death-ground.js는 Death '클립의 포즈'만 재서 계속 통과했는데, 사용자가 본 건 그게 아니었다:
// 탈것을 타고 있을 때 update의 탈것 바운스가 `heroG.position.y += bob`을 **사망 구간 내내 누적**해
// 시체가 초당 몇 유닛씩 솟아올랐다(수정 전 실측: 1.8초에 y=3.9, 그 뒤로도 계속 상승).
// 그래서 이 검증기는 클립이 아니라 **Combat.onDefeat → Scene3D.update 프레임 루프**를 그대로 돌린다.
//  ⑴ 탈것 없이 사망 — 사망 전 구간 heroG.y가 지면(0)에서 벗어나지 않는다
//  ⑵ 탈것 타고 사망 — 안장 높이(rideY)에서 지면으로 내려오고, 그 뒤 **단조 상승이 없다**
//  ⑶ 리그 최저 정점이 지면에 붙어 있다(몸 전체가 뜨지 않았는지 — 그룹 y만 0이어도 포즈가 뜰 수 있다)
//  ⑷ 기상 — 탈것 높이로 되돌아오고, 기상이 끝나면 정확히 rideY에 안착(스냅·잔여 오차 없음)
//  ⑸ 사망 중 탈것 기울기가 시체에 남지 않는다(heroG.rotation.x === 0)
//  ⑹ 콘솔 에러 0건
// 사용: node probe-death-float.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 사망 → 프레임 루프. Combat.tick의 벽시계(downUntil/riseUntil)를 실제로 태우기 위해
// 페이지 안에서 setTimeout으로 실시간을 흘린다.
const RUN = async (mounted) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // 픽셀은 안 본다 — 소프트웨어 GL 렌더가 rAF마다 ~250ms씩 메인 스레드를 잡아
    // 4초 창에서 표본이 16개밖에 안 나온다(실측). 좌표만 필요하므로 렌더를 끈다.
    if (Scene3D.renderer) Scene3D.renderer.render = () => {};
    if (mounted) { S.winders = 1e6; Mounts.summon(5); Scene3D.refreshMount(); }
    else { S.activeMount = null; Scene3D.refreshMount(); }
    const rideY = Scene3D.rideY || 0;
    Scene3D.clearEnemies(); Combat.enemies = [];
    Combat.hero.hp = Combat.hero.maxHp;
    const rows = [];
    const lowest = () => {
        // 리그 전체 메시의 최저 world Y — 그룹 y만 0이어도 포즈가 떠 있으면 여기서 잡힌다
        let lo = Infinity;
        Scene3D.heroG.traverse(o => {
            if (!o.isMesh || !o.geometry) return;
            // 지오메트리 bbox는 정적이라 한 번만 계산한다 — 매 프레임 computeBoundingBox를 돌리면
            // 소프트웨어 GL에서 한 표본에 ~260ms가 걸려 4초 동안 16프레임밖에 못 찍는다(실측).
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
            if (bb.min.y < lo) lo = bb.min.y;
        });
        return lo;
    };
    Combat.onDefeat();
    const t0 = performance.now();
    // 사망(2.4초) + 기상(0.85초) + 여유
    while (performance.now() - t0 < 4200) {
        Scene3D.update(1 / 60);
        Combat.tick(1 / 60);
        Scene3D.heroG.updateMatrixWorld(true);
        rows.push({
            t: Math.round(performance.now() - t0),
            y: +Scene3D.heroG.position.y.toFixed(4),
            low: +lowest().toFixed(4),
            rot: +Scene3D.heroG.rotation.x.toFixed(4),
            dead: !!Scene3D.heroDead,
            rev: +(Scene3D._heroReviveT || 0).toFixed(3),
        });
        await sleep(10);
    }
    return { rideY: +rideY.toFixed(4), rows, endY: +Scene3D.heroG.position.y.toFixed(4), dead: !!Scene3D.heroDead };
};

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    const report = [];
    for (const mounted of [false, true]) {
        const tag = mounted ? '탈것 탑승' : '탈것 없음';
        const r = await page.evaluate(RUN, mounted);
        const dead = r.rows.filter(x => x.dead);
        const alive = r.rows.filter(x => !x.dead);
        ok(dead.length > 10, `${tag}: 사망 구간 표본이 너무 적다 (${dead.length})`);

        // ⑴⑵ 사망 구간은 지면에 붙어 있어야 하고, 무엇보다 **올라가면 안 된다**
        const maxDeadY = dead.length ? Math.max(...dead.map(x => x.y)) : 0;
        ok(maxDeadY <= 0.05, `${tag}: 사망 중 영웅이 지면 위 ${maxDeadY.toFixed(3)}까지 떠올랐다`);
        // 단조 상승 검출 — 누적 버그는 '값이 크다'보다 '계속 는다'로 잡는 게 확실하다
        const rise = dead.length > 1 ? dead[dead.length - 1].y - dead[0].y : 0;
        ok(rise <= 0.02, `${tag}: 사망 구간 동안 y가 ${rise.toFixed(3)} 상승했다 (누적 상승 = 하늘로 올라감)`);

        // ⑶ 몸 전체(리그 최저 정점)도 지면에 붙어 있어야 한다
        const maxDeadLow = dead.length ? Math.max(...dead.map(x => x.low)) : 0;
        ok(maxDeadLow <= 0.2, `${tag}: 사망 중 몸 최저점이 지면 위 ${maxDeadLow.toFixed(3)} (포즈째로 떠 있다)`);

        // ⑸ 탈것 기울기가 시체에 남지 않는다
        const maxRot = dead.length ? Math.max(...dead.map(x => Math.abs(x.rot))) : 0;
        ok(maxRot <= 0.001, `${tag}: 사망 중 heroG.rotation.x=${maxRot.toFixed(3)} — 탈것 기울기가 시체에 남았다`);

        // ⑷ 기상 뒤 안착 — 탈것이면 rideY, 아니면 0
        ok(!r.dead, `${tag}: 4.2초가 지나도 사망 상태가 안 풀렸다`);
        ok(Math.abs(r.endY - r.rideY) <= 0.12, `${tag}: 기상 후 높이 ${r.endY} (기대 rideY=${r.rideY})`);
        if (mounted) {
            ok(r.rideY > 0.15, `${tag}: rideY가 ${r.rideY}라 탑승 상태가 아니다(검사 전제 실패)`);
            // 기상 구간에서 안장 높이로 '되돌아오는' 보간이 실제로 관측되는가
            const reviving = r.rows.filter(x => !x.dead && x.rev > 0);
            ok(reviving.length > 3 && Math.max(...reviving.map(x => x.y)) > 0.02,
                `${tag}: 기상 중 안장 높이로 복귀하는 보간이 없다`);
        }
        report.push(`${tag}: rideY=${r.rideY} · 사망중 y ${dead.length ? dead[0].y : '-'}→${dead.length ? dead[dead.length - 1].y : '-'} (최대 ${maxDeadY.toFixed(3)}, 몸최저 ${maxDeadLow.toFixed(3)}) · 기상후 ${r.endY} · 표본 ${r.rows.length}(사망 ${dead.length}/생존 ${alive.length})`);
    }

    ok(errs.length === 0, `⑹ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    console.log('--- 사망 부양 검증 (실게임 경로) ---');
    report.forEach(l => console.log(l));
    if (fails.length) { console.log('FAIL ' + fails.length + '건'); fails.forEach(f => console.log('  ✗ ' + f)); }
    else console.log('PASS — 죽어도 하늘로 올라가지 않는다');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
