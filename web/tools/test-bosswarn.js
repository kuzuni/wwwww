// 보스 등장 워닝 연출 회귀 검증 — 사용: node test-bosswarn.js  (종료코드 0=전체 통과)
// 검증 축: ① 연출 → 등장 순서(경고 중에는 보스가 없다) ② 착지 임팩트와 스폰이 같은 시점
// ③ 배너가 '화면 전체'를 덮는가(#dmg-flash가 3D 영역만 덮던 전례) ④ 카메라 돌리/광주가 새지 않는가
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await p.waitForTimeout(1200);

    // ---- A. 논리/3D: 자동 루프를 끊고 고정 서브스텝으로 시간축을 통제 ----
    const a = await p.evaluate(() => {
        const out = [];
        const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
        const realTick = Combat.tick.bind(Combat);
        const realUpdate = Scene3D.update.bind(Scene3D);
        Combat.tick = () => {};        // setInterval 루프 무력화
        Scene3D.update = () => {};     // rAF 루프 무력화
        Scene3D.renderFrame = () => {};
        const step = (total) => {      // 1/120초 서브스텝 — 로직과 연출을 같은 시계로 민다
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { realTick(1 / 120); realUpdate(1 / 120); }
        };
        // 등장 프레임의 y를 그 자리에서 잡아둔다 — 이후 프레임은 걷기 바운스가 섞여 '낙하 여부' 판정이 흐려진다
        let spawnY = null;
        const realSpawn = Scene3D.spawnEnemy.bind(Scene3D);
        Scene3D.spawnEnemy = (e) => { realSpawn(e); if (e.isBoss) spawnY = Scene3D.enemyMap.get(e.id).g.position.y; };
        const pillars = () => Scene3D.scene.children.filter(o =>
            o.isMesh && o.geometry && o.geometry.type === 'CylinderGeometry' && o.material && o.material.blending === THREE.AdditiveBlending).length;

        // 4웨이브 종료 직후 상태를 만든다
        Scene3D.clearEnemies();
        Combat.enemies = []; Combat.pending = [];
        Combat.wave = 4; Combat.phase = 'waveDelay'; Combat.phaseTimer = 0.005;
        const worldX0 = Scene3D.worldX;
        step(0.02); // → nextWave() 진입

        ok(Combat.phase === 'bossWarn', `경고 페이즈 진입 (phase=${Combat.phase})`);
        ok(Combat.wave === 5, `보스 웨이브 번호 (wave=${Combat.wave})`);
        ok(Combat.enemies.length === 0, `경고 중에는 보스가 아직 없다 (enemies=${Combat.enemies.length})`);
        ok(Scene3D.walking === false, '경고 중 행군 정지 (착지 지점이 흘러가면 안 된다)');
        ok(SFX._musicPendingMode === 'boss', `보스 BGM 전환 예약 (${SFX._musicPendingMode})`);
        ok(pillars() === 1, `경고 광주 1개 생성 (${pillars()}개)`);
        const warnEl = document.getElementById('boss-warning');
        ok(!warnEl.classList.contains('hidden'), '배너 표시됨');
        ok(warnEl.style.getPropertyValue('--bw-dur') === Scene3D.BOSS_WARN_DUR + 's',
            `배너 길이 = BOSS_WARN_DUR (${warnEl.style.getPropertyValue('--bw-dur')})`);

        // 임팩트 직전까지 — 카메라가 밀려 들어가고 보스는 아직 없다
        step(1.4);
        const push14 = Scene3D.camPush;
        ok(push14 > 0.5, `임팩트 직전 카메라 돌리 인 (camPush=${push14.toFixed(3)})`);
        ok(Combat.enemies.length === 0, '임팩트 전까지 보스 미등장');
        ok(Math.abs(Scene3D.worldX - worldX0) < 1e-6, `경고 중 월드 정지 (Δ=${(Scene3D.worldX - worldX0).toFixed(4)})`);

        // 임팩트 통과 → 보스 스폰
        step(0.25);
        const boss = Combat.enemies[0];
        ok(Combat.phase === 'fight', `임팩트 후 전투 재개 (phase=${Combat.phase})`);
        ok(!!boss && boss.isBoss, '보스 스폰됨');
        ok(!!boss && Math.abs(boss.x - Scene3D.BOSS_SPAWN_X) < 0.5,
            `보스가 워닝이 지목한 자리 근처 (x=${boss ? boss.x.toFixed(2) : 'n/a'}, 지목=${Scene3D.BOSS_SPAWN_X})`);
        const m = boss && Scene3D.enemyMap.get(boss.id);
        ok(!!m, '보스 메시 생성됨');
        // 하늘 낙하 금지: 등장하는 그 프레임에 이미 발이 지면에 있어야 한다
        ok(spawnY !== null && Math.abs(spawnY) < 0.02, `등장 프레임 접지 (y=${spawnY === null ? 'n/a' : spawnY.toFixed(3)})`);
        ok(!!m && m.baseScale > 1.5, `보스 대형 스케일 + 대형 HP바 (baseScale=${m ? m.baseScale : 'n/a'})`);
        // 화면 안에 들어와 있는가 (NDC |x|<1)
        let ndcX = 9;
        if (m) {
            Scene3D.camera.updateMatrixWorld();
            const v = m.g.position.clone().project(Scene3D.camera);
            ndcX = v.x;
        }
        ok(Math.abs(ndcX) < 1, `보스가 화면 안에서 등장 (NDC x=${ndcX.toFixed(3)})`);

        // 연출 종료 후 뒷정리
        step(0.9);
        ok(Math.abs(Scene3D.camPush) < 1e-6, `카메라 돌리 복귀 (camPush=${Scene3D.camPush})`);
        ok(pillars() === 0, `경고 광주 정리됨 (${pillars()}개 잔존)`);
        return out;
    });

    a.forEach(l => console.log(l));
    if (errors.length) console.log('  (A 구간 콘솔: ' + errors.join(' | ') + ')');

    // ---- B. 실시간 DOM: 배너가 '화면 전체'를 덮고 제때 사라지는가 ----
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await p.waitForTimeout(1000);
    // 소프트웨어 GL이라 한 프레임 렌더가 수백 ms다 — 렌더를 끄지 않으면 rAF가 0.5fps로 떨어지고
    // 밀린 로직 틱이 한 번에 몰려(캐치업 최대 5초분) 1.55초짜리 경고가 프레임 하나에 다 지나간다.
    // B 구간이 보는 건 DOM 레이아웃뿐이라 픽셀은 필요 없다. 끈 뒤 600ms는 밀린 틱을 배출하는 시간.
    await p.evaluate(() => { Scene3D.renderFrame = () => {}; });
    await p.waitForTimeout(600);
    await p.evaluate(() => {
        Scene3D.clearEnemies();
        Combat.enemies = []; Combat.pending = [];
        Combat.wave = 4; Combat.phase = 'waveDelay'; Combat.phaseTimer = 0.05;
    });
    try {
        await p.waitForFunction(() => Combat.phase === 'bossWarn', null, { timeout: 5000 });
    } catch (e) {
        console.log('FAIL 실시간 경고 페이즈 진입 — ' + JSON.stringify(await p.evaluate(() => ({ phase: Combat.phase, wave: Combat.wave, timer: Combat.phaseTimer }))));
        console.log(errors.length ? '콘솔: ' + errors.join(' | ') : '콘솔 에러 없음');
        await b.close();
        process.exit(1);
    }
    await p.waitForTimeout(500);
    const bres = await p.evaluate(() => {
        const out = [];
        const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
        const app = document.getElementById('app').getBoundingClientRect();
        const w = document.getElementById('boss-warning').getBoundingClientRect();
        // #dmg-flash가 3D 영역만 덮어 화면 아래 절반에 비네트가 없던 전례 — 같은 실수 방지
        ok(Math.abs(w.height - app.height) < 2 && Math.abs(w.width - app.width) < 2,
            `배너 오버레이가 화면 전체를 덮는다 (배너 ${w.width.toFixed(0)}×${w.height.toFixed(0)} / 앱 ${app.width.toFixed(0)}×${app.height.toFixed(0)})`);
        const track = document.querySelector('#boss-warning .bw-track');
        const anims = track.getAnimations();
        ok(anims.length > 0 && anims[0].playState === 'running', '마퀴 텍스트가 흐르는 중');
        const banner = document.querySelector('#boss-warning .bw-banner').getBoundingClientRect();
        ok(banner.width >= app.width - 1, `경고 배너가 화면 가로를 가로지른다 (${banner.width.toFixed(0)}px)`);
        ok(banner.height > 8, `배너가 펼쳐진 상태 (h=${banner.height.toFixed(1)}px)`);
        return out;
    });
    await p.waitForTimeout(2000);
    const bres2 = await p.evaluate(() => {
        const out = [];
        const el = document.getElementById('boss-warning');
        out.push((el.classList.contains('hidden') ? 'PASS ' : 'FAIL ') + '연출 종료 후 배너 숨김');
        out.push((Combat.enemies.some(e => e.isBoss && e.alive) || Combat.wave !== 5 ? 'PASS ' : 'FAIL ') + '보스 전투 진행 중');
        return out;
    });

    const all = [...a, ...bres, ...bres2];
    [...bres, ...bres2].forEach(l => console.log(l)); // A 구간은 위에서 이미 출력
    console.log(errors.length ? 'FAIL 콘솔 에러: ' + errors.join(' | ') : 'PASS 콘솔 에러 0건');
    await b.close();
    process.exit(all.some(l => l.startsWith('FAIL')) || errors.length ? 1 : 0);
})();
