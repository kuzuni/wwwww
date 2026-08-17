// 타격감(HP 피격 연출) 연속 프레임 촬영 — 스텝 동결 방식
// 사용: node shot-hitfx.js [outDir]
// 렌더 루프를 수동 스텝으로 바꿔(Scene3D.update 무력화 + __step) 연출 시간축을 정확히 통제하고,
// 데미지 숫자의 CSS 애니메이션도 같은 시뮬레이션 시각으로 시크·정지시켜 프레임이 서로 어긋나지 않게 한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' }); // 실루엣이 큰 종 — 바·플래시·넉백 판독에 유리
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    await page.evaluate(() => {
        // 전투 동결 + 렌더 수동 스텝화
        Combat.tick = () => {};
        Scene3D.walking = false;
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false; // 동결 시점에 멈춘 무기 궤적 제거(이후 실제 스윙이 다시 그린다)
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.__t = 0;
        Scene3D.update = () => {};
        // 요청한 "실제 경과 시간"만큼 1/120초 서브스텝으로 진행 — 한 번에 큰 dt를 넣으면 히트스톱(dt 감속)이
        // 스텝 하나를 통째로 삼켜, +96ms 프레임이 실제로는 11ms짜리가 된다(파편이 아직 몸 안에 뭉쳐 있음).
        window.__step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { Scene3D.__t += 1 / 120; real(1 / 120); }
            // 데미지 숫자(CSS 애니메이션)를 시뮬 시각에 맞춰 시크 후 정지 — 실시간 흐름과의 어긋남 제거.
            // 수명 관리도 시뮬 시각으로 옮긴다(원래는 900ms 실시간 setTimeout이라, 스크린샷 대기 동안 다 지워짐).
            // 피격 비네트: 애니메이션 pause+seek는 스크린샷 대기(수백 ms) 사이에 풀려 다 끝나 버리므로,
            // 키프레임(dmgvignette 0→7%→38%→100%, 440ms)을 시뮬 시각으로 직접 계산해 인라인으로 못 박는다.
            const vig = document.getElementById('dmg-flash');
            if (vig.classList.contains('on')) {
                if (vig.__born === undefined) vig.__born = Scene3D.__t;
                const k = (Scene3D.__t - vig.__born) * 1000 / 440;
                const peak = parseFloat(vig.style.getPropertyValue('--vig') || '1');
                const op = k < 0.07 ? peak * k / 0.07 : k < 0.38 ? peak : k < 1 ? peak * (1 - (k - 0.38) / 0.62) : 0;
                // CSS 애니메이션은 인라인 스타일을 이기므로 !important로 못 박아야 한다
                vig.style.setProperty('opacity', op.toFixed(3), 'important');
            }
            for (const el of [...Scene3D.fxLayer.children]) {
                if (el.__born === undefined) { el.__born = Scene3D.__t; el.remove = () => {}; }
                const age = Scene3D.__t - el.__born;
                if (age > 0.95) { Element.prototype.remove.call(el); continue; }
                for (const a of el.getAnimations()) { a.pause(); a.currentTime = Math.max(0, age * 1000); }
            }
        };
        // 적 하나만 근접 위치에 고정 (HP 충분히 커서 여러 번 때려도 안 죽게)
        Scene3D.clearEnemies();
        const e = { id: 901, x: Combat.MELEE_X, alive: true, hp: Big.of(1000), maxHp: Big.of(1000), isBoss: false, kind: 'goblin' };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(901);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.position.set(e.x + Scene3D.worldX, 0, 0);
        m.g.userData.landed = true;
        Combat.hero.hp = Big.of(1000); Combat.hero.maxHp = Big.of(1000);
        Combat.phase = 'fight';
        Scene3D.fxLayer.innerHTML = ''; // 동결 전 전투에서 남은 데미지 숫자 제거(수명 관리를 시뮬 시각으로 옮기면 영원히 남는다)
        window.__step(0.016);
    });

    // 시퀀스: (라벨, 그 프레임 직전에 실행할 액션, 이 시각까지 진행)
    const shots = [];
    const step = async (dt) => page.evaluate(d => window.__step(d), dt);
    // 기본은 전투 영역 확대 크롭(연출 판독용), full=true면 화면 전체(비네트·HUD 확인용)
    const CLIP = { x: 0, y: 96, width: 480, height: 260 };
    const shot = async (name, full) => {
        await page.screenshot({ path: `${OUT}/hitfx-${name}.png`, clip: full ? undefined : CLIP });
        shots.push(name);
    };

    // ── A. 일반 타격 → 크리티컬 (연속 프레임) ──
    await shot('a0-before'); await shot('a0-before-full', true);
    // 영웅이 실제로 칼을 휘두른 뒤 그 임팩트 시점에 피해가 들어가게 — 스윙 없는 캡처는 '동상이 맞는' 그림이 된다
    const swingThenHit = async (amount, crit) => {
        await page.evaluate(() => Scene3D.heroAttack(901));
        await step(0.16); // 검 impact 0.16s
        await page.evaluate(([a, c]) => Combat.damageEnemy(Combat.enemies[0], Big.of(a), c, null), [amount, crit]);
    };
    await swingThenHit(140, false); // 최대 HP의 14%
    await step(0.016); await shot('a1-hit+16ms');     // 흰 플래시 + 앞바 즉시 감소 + 숫자 팝
    await step(0.05);  await shot('a2-hit+66ms');     // 넉백 정점 + 잔상바 지연 + 숫자 아크 상승
    await step(0.08);  await shot('a3-hit+146ms');    // 플래시 감쇠, 잔상바 아직 남음
    await swingThenHit(320, true); // 크리티컬 32%
    await step(0.016); await shot('a4-crit+16ms');    // 히트스톱 + 스케일 펀치 + 주황 버스트
    await step(0.05);  await shot('a5-crit+66ms');
    await step(0.12);  await shot('a6-crit+186ms');
    await step(0.25);  await shot('a7-crit+436ms');   // 잔상바 추격 중
    await step(0.4);   await shot('a8-crit+836ms');   // 잔상 수렴

    // ── B. 처치 버스트 ──
    await swingThenHit(9999, true);
    await step(0.016); await shot('b1-kill+16ms');
    await step(0.08);  await shot('b2-kill+96ms');
    await step(0.25);  await shot('b3-kill+346ms');
    await step(0.5);   await shot('b4-kill+846ms');  // 밝은 파편이 다 꺼진 뒤 — 그을음 데칼만 남는 구간

    // ── C. 영웅 피격(붉은 비네트 + 움찔 + 영웅 HP바) ──
    // 적을 죽이면 phase가 waveDelay로 바뀌어 damageHero가 조기 반환한다 — 다시 fight로 두고 블록도 배제
    await page.evaluate(() => { Combat.phase = 'fight'; Combat.hero.stats.block = 0; Combat.damageHero(Big.of(300)); });
    await step(0.016); await shot('c1-herohit+16ms', true);
    await step(0.06);  await shot('c2-herohit+76ms', true);
    await step(0.3);   await shot('c3-herohit+376ms', true);

    console.log('hitfx shots: ' + shots.join(', '));
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    await browser.close();
    process.exit(errors.length ? 1 : 0);
})();
