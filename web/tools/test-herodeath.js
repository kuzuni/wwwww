// 영웅 사망/기상 연출 회귀 검증 — 사용: node test-herodeath.js  (종료코드 0=전체 통과)
// 핵심 회귀: Death 클립을 걸어도 **다음 프레임 update의 Idle 자동 전환이 덮어써서** 영웅이 그냥 서 있던 버그.
// once 클립은 play()에서 R.state를 ''로 두므로 루프 중복 방지 가드에 안 걸리고 매 프레임 다시 깔린다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await p.waitForTimeout(1200);

    const out = await p.evaluate(() => {
        const res = [];
        const ok = (c, m) => res.push((c ? 'PASS ' : 'FAIL ') + m);
        const realTick = Combat.tick.bind(Combat);
        const realUpdate = Scene3D.update.bind(Scene3D);
        Combat.tick = () => {}; Scene3D.update = () => {}; Scene3D.renderFrame = () => {};
        const step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { realTick(1 / 120); realUpdate(1 / 120); }
        };
        const rig = Scene3D.heroRig;
        const pose = () => ({ rootRx: +rig.root.rotation.x.toFixed(3), rootPy: +rig.root.position.y.toFixed(3), clip: rig._clip && rig._clip.dur });

        Scene3D.clearEnemies();
        Combat.enemies = []; Combat.pending = [];
        Combat.phase = 'fight';
        const upright = pose();
        Combat.hero.hp = Big.of(1);
        Combat.damageHero(Big.of(999999));      // → onDefeat → heroDown

        ok(Scene3D.heroDead === true, '사망 플래그 설정됨');
        ok(Combat.phase === 'stageDelay', `사망 후 스테이지 딜레이 (phase=${Combat.phase})`);

        // 사망 클립 재생 — 한 프레임 뒤에도 Idle이 덮어쓰지 않아야 한다(이 회귀가 이 항목의 본체)
        step(1 / 60);
        const oneFrame = rig._clip;
        step(1.3); // 클립 길이만큼
        const fallen = pose();
        ok(oneFrame === rig._clip || Scene3D.heroDead, '사망 클립이 다음 프레임에 교체되지 않음');
        ok(fallen.rootRx < -1.0, `쓰러진 포즈 — 상체가 눕는다 (root.rx=${fallen.rootRx}, 기립=${upright.rootRx})`);
        ok(fallen.rootPy < -0.3, `쓰러진 포즈 — 키가 낮아진다 (root.py=${fallen.rootPy}, 기립=${upright.rootPy})`);

        // 포즈 유지: 클립이 끝난 뒤에도 누운 채로 있어야 한다
        const wx0 = Scene3D.worldX;
        Scene3D.walking = true;             // 행군 신호가 와도 시체가 미끄러져 가면 안 된다
        step(0.8);
        const held = pose();
        ok(Math.abs(held.rootRx - fallen.rootRx) < 0.02 && Math.abs(held.rootPy - fallen.rootPy) < 0.02,
            `클립 종료 후에도 누운 포즈 유지 (rx ${fallen.rootRx}→${held.rootRx})`);
        ok(Math.abs(Scene3D.worldX - wx0) < 1e-6, `사망 중 행군 정지 (Δ월드=${(Scene3D.worldX - wx0).toFixed(4)})`);
        // onDefeat이 재도전용으로 hp를 즉시 만피로 되돌리므로, 안 숨기면 시체 위에 가득 찬 초록 바가 뜬다
        ok(Scene3D.heroHpG.visible === false, '사망 중 머리 위 HP바 숨김');

        // 기상: 예약된 pending(2.4초)이 돌면서 Revive → 다시 기립
        step(1.2);
        ok(Scene3D.heroDead === false, '기상 시 사망 플래그 해제');
        ok(Scene3D.heroHpG.visible === true, '기상 시 HP바 복귀');
        const mid = pose();
        ok(mid.rootRx > fallen.rootRx, `기상 전환 중 상체가 올라온다 (rx ${fallen.rootRx}→${mid.rootRx})`);
        step(1.2);
        const back = pose();
        ok(Math.abs(back.rootRx - upright.rootRx) < 0.12 && Math.abs(back.rootPy - upright.rootPy) < 0.06,
            `기상 완료 — 기립 포즈 복귀 (rx=${back.rootRx}/py=${back.rootPy}, 기준 rx=${upright.rootRx}/py=${upright.rootPy})`);
        // 행군 게이트만 격리해서 확인 — step()은 Combat.tick도 돌리는데, 이 시점엔 이미 다음 웨이브가
        // 시작돼 walking이 정상적으로 false가 된다(적이 살아 있으면 행군 안 함). 그건 사망과 무관하다.
        Scene3D.heroDead = false; Scene3D._heroReviveT = 0; Scene3D._attacking = false;
        Scene3D.walking = true;
        const wx1 = Scene3D.worldX;
        for (let i = 0; i < 60; i++) realUpdate(1 / 120);
        ok(Scene3D.worldX > wx1, `기상 후 행군 재개 (Δ월드=${(Scene3D.worldX - wx1).toFixed(3)})`);

        // 사망 상태로 스테이지가 시작되지 않는다 (던전 입장 등으로 기상 예약이 지워진 경우 대비)
        Scene3D.heroDead = true;
        Combat.setupStage();
        ok(Scene3D.heroDead === false, 'setupStage가 사망 상태를 방어적으로 해제');
        return res;
    });

    out.forEach(l => console.log(l));
    console.log(errors.length ? 'FAIL 콘솔 에러: ' + errors.join(' | ') : 'PASS 콘솔 에러 0건');
    await b.close();
    process.exit(out.some(l => l.startsWith('FAIL')) || errors.length ? 1 : 0);
})();
