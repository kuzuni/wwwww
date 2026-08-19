// 자전거 탑승에서 **손이 핸들바를 잡고 있는가 — 공격 중에도** .
// 사용: node probe-ride-hands.js
//
// 왜 필요한가: 비평가 2인이 독립적으로 "공격 컷에서는 양쪽 그립이 둘 다 노출된 채(손 0개) 주행
//   중"이라고 지적했다. 대기 프레임만 재는 probe 로는 절대 안 걸린다 — 공격은 once 클립이라
//   `restPose`(바 파지 각이 실린 곳)가 통째로 꺼지고, 공격 클립이 **양팔 어깨·팔꿈치를 전부 정의**한다.
//   그래서 **대기와 공격 중을 같은 자로 재서 나란히** 찍는다.
//
// 판정: 빈 손(무기 안 든 쪽) ↔ 그 쪽 그립 거리가 **대기·공격 양쪽 모두** 임계 이내.
//   무기 든 손은 판정하지 않는다 — 한 손을 떼고 휘두르는 건 실제 기병도 그렇다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitReady } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TOL = 0.20;   // 월드 단위. 그립 반길이(≈0.07)+주먹 반경 여유. 이보다 멀면 '허공을 쥔' 것으로 읽힌다.

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    // ⚠️ page.waitForFunction 금지 — 페이지 안 폴링(raf/타이머)이 three.js + swiftshader 소프트웨어
    //    렌더로 포화된 메인 스레드에 밀려 아예 안 도는 컨테이너가 있다. 같은 시점에 page.evaluate 는
    //    정상 응답하므로 폴링을 노드 쪽에서 돌린다(wait-ready.js 주석 ②). 판정 조건은 불변.
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG', { timeout: 60000, label: '3D 부팅' });
    await page.waitForTimeout(1500);

    const out = await page.evaluate(() => {
        Combat.tick = () => { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        S.mounts = { Bike: { rarity: 'epic', count: 1, level: 1 } };
        S.activeMount = 'Bike';
        Scene3D.refreshMount();
        for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        const measure = () => {
            const g = Scene3D.mountGroup, rig = Scene3D.heroRig;
            Scene3D.heroG.updateWorldMatrix(true, true); g.updateWorldMatrix(true, true);
            const bar = g.userData.bar;
            const weaponHand = (Scene3D.gripOf(Scene3D.wtypeId) || {}).hand === 'L' ? 'L' : 'R';
            const free = weaponHand === 'L' ? 'R' : 'L';
            const hand = free === 'L' ? rig.handL : rig.handR;
            const hp = hand.getWorldPosition(V(0, 0, 0));
            // ⚠️ **대기 중 그립 위치와 재면 안 된다** — `alignHandlebar` 가 매 프레임 그립을 손 밑으로
            //    옮기므로 거리가 **구조적으로 0**이 나온다(첫 판이 전부 0.000 이었다). 정렬은 공격 중
            //    멈추므로(그때 바는 마지막 자리에 그대로 서 있다), **그 고정된 그립 자리**와 재야
            //    '손이 바를 놓았는가'를 재는 것이 된다.
            let best = Infinity;
            for (const gp of bar.grips) best = Math.min(best, hp.distanceTo(gp.getWorldPosition(V(0, 0, 0))));
            return { free, d: +best.toFixed(3), once: !!rig._once, clip: rig._clip ? rig._clip.dur : 0 };
        };
        const idle = measure();
        // 공격 클립을 **실제 전투 경로로** 태운다. `heroPlay` 만 부르면 `_attacking` 이 안 서고
        // update 가 다음 프레임에 Idle 로 되돌려, 정작 재고 싶은 구간이 한 프레임도 안 나온다
        // (첫 판에서 'once 클립 아님' 이 6프레임 내리 찍혔다).
        Scene3D.clearEnemies();
        const e = { id: 951, x: Combat.MELEE_X, alive: true, hp: Big.of(1e6), maxHp: Big.of(1e6), isBoss: false, kind: 'goblin' };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
        Scene3D.anims = [];
        const m = Scene3D.enemyMap.get(951);
        m.g.position.set(e.x + Scene3D.worldX, 0, 0);
        m.g.userData.landed = true;
        Combat.phase = 'fight';
        Scene3D.heroAttack(951);
        const mid = [];
        for (let i = 0; i < 40; i++) {
            Scene3D.update(1 / 60);
            if (i % 8 === 7) mid.push(measure());
        }
        return { idle, mid };
    });

    console.log('[Bike] 빈 손 ↔ 핸들바 그립 거리 (임계 ' + TOL + ')\n');
    console.log(`  대기      ${String(out.idle.d).padStart(6)}  ${out.idle.d <= TOL ? 'OK(잡고 있다)' : '⚠️ 허공을 쥐고 있다'}   (빈 손 = ${out.idle.free})`);
    let bad = out.idle.d > TOL ? 1 : 0, worst = 0;
    out.mid.forEach((m, i) => {
        worst = Math.max(worst, m.d);
        console.log(`  공격 ${String((i + 1) * 8).padStart(2)}f ${String(m.d).padStart(6)}  ${m.d <= TOL ? 'OK(잡고 있다)' : '⚠️ 바를 놓았다'}${m.once ? '' : '   (once 클립 아님 — 공격이 안 걸렸다)'}`);
        if (m.d > TOL) bad++;
    });
    console.log(`\n공격 중 최대 이탈 ${worst.toFixed(3)}`);
    console.log(bad === 0 ? '\n전부 통과' : `\n불합격 ${bad}건`);
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
})();
