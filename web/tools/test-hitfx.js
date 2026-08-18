// 타격감(HP 피격 연출) 회귀 검증 — 사용: node test-hitfx.js  (종료코드 0=전체 통과)
// 검증 항목: 플래시가 원래 emissive를 복구하는가, 연타/처치 후 상태가 남지 않는가, 넉백 후 좌표가 복귀하는가
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    p.on('pageerror', e => errors.push(String(e)));
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + path.resolve(__dirname, '../index.html') + '?enemy=imp', { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
        const out = [];
        const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
        Combat.tick = () => {}; Scene3D.heroAttack = () => {};
        Scene3D.renderFrame = () => {};
        // 행군 정지 — 페이지 로드 시점이 행군 구간에 걸리면 update()가 worldX를 매 프레임 밀고(0.75초에 1.19유닛)
        // 적이 그 목표를 따라가느라 '넉백 후 제자리 복귀'가 3회 중 1회꼴로 거짓 실패했다. 넉백과 무관한 월드 이동이다.
        Scene3D.walking = false;
        Scene3D.clearEnemies();
        const mk = (id) => { const e = { id, x: Combat.MELEE_X, alive: true, hp: Big.of(1000), maxHp: Big.of(1000) }; Combat.enemies = [e]; Scene3D.spawnEnemy(e); const m = Scene3D.enemyMap.get(id); for (const a of Scene3D.anims) { try { a.fn(1); a.onDone && a.onDone(); } catch (x) {} } Scene3D.anims = []; m.g.position.set(e.x + Scene3D.worldX, 0, 0); m.g.userData.landed = true; return { e, m }; };
        const step = n => { for (let i = 0; i < n; i++) Scene3D.update(1 / 120); };

        // 1) 원래 emissive 복구 (예전 구현은 흰색을 영구히 덮어써 발광 재질이 죽었다)
        let { e, m } = mk(801);
        const before = m.flashMats.filter(x => x.emissive).map(x => ({ hex: x.emissive.getHex(), i: x.emissiveIntensity }));
        Combat.damageEnemy(e, Big.of(100), true, null);
        step(60); // 0.5초
        const after = m.flashMats.filter(x => x.emissive).map(x => ({ hex: x.emissive.getHex(), i: x.emissiveIntensity }));
        ok(before.every((b0, i) => b0.hex === after[i].hex && Math.abs(b0.i - after[i].i) < 1e-6),
            '플래시 후 emissive 색·세기가 원래대로 복구 (' + before.length + '개 재질)');

        // 2) 연타 중 마지막 플래시만 복구를 소유 (앞선 플래시의 onDone이 뒤 플래시를 지우면 안 됨)
        Combat.damageEnemy(e, Big.of(50), false, null);
        step(6);
        Combat.damageEnemy(e, Big.of(50), true, null);
        step(8); // 첫 플래시의 종료 시점 통과
        const mid = m.flashMats.find(x => x.emissive);
        ok(mid.emissive.getHex() === 0xffffff && mid.emissiveIntensity > 0.05,
            '연타 시 나중 플래시가 살아있음 (앞 플래시 종료가 덮어쓰지 않음)');
        step(60);
        ok(m.flashMats.filter(x => x.emissive).every((x, i) => x.emissive.getHex() === before[i].hex), '연타 후에도 최종 복구');

        // 3) 넉백/펀치 후 좌표·스케일 복귀
        const x0 = m.g.position.x, s0 = m.g.scale.x;
        Combat.damageEnemy(e, Big.of(300), true, null);
        step(90);
        ok(Math.abs(m.g.scale.x - s0) < 1e-6, '스케일 펀치 후 원래 크기 복귀 (' + m.g.scale.x.toFixed(4) + ' vs ' + s0 + ')');
        ok(Math.abs(m.g.rotation.z) < 0.02, '움찔 회전 복귀');
        ok(Math.abs(m.g.position.x - x0) < 0.05, '넉백 후 제자리 복귀');

        // 3-b) 히트축 스쿼시가 **소액 타격에도** 걸리고, 축이 맞고, 정점이 프레임에 남는다
        // (비평가 4차 ⓐ: 예전엔 sev>0.1 게이트라 95%를 차지하는 소액 타격의 몸 변형이 0이었다)
        Combat.damageEnemy(e, Big.of(2), false, null); // sev ≈ 0.002 — 게이트 시절이면 변형 0
        step(2);
        const sqX = m.g.scale.x / s0, sqY = m.g.scale.y / s0;
        ok(sqX < 0.97 && sqY > 1.02, '소액 타격도 히트축 압축 (x ' + sqX.toFixed(3) + ' / y ' + sqY.toFixed(3) + ')');
        ok(sqX < 1 && sqY > 1, '스쿼시 축이 히트축(x 압축·y 팽창) — 옛 착지형 스쿼시의 반대');
        step(3); // 유지 구간(55ms ≈ 6.6프레임) 안쪽
        ok(Math.abs(m.g.scale.x / s0 - sqX) < 1e-6, '최대 압축 유지 — 정점이 프레임 사이로 빠지지 않음');
        step(90);
        ok(Math.abs(m.g.scale.x - s0) < 1e-6, '소액 타격 스쿼시도 원래 크기 복귀');

        // 3-c) 처치 시 진행 중이던 스쿼시가 접힌다 (안 접으면 시체가 눌린 채 굳는다)
        Combat.damageEnemy(e, Big.of(1), false, null);
        step(2);
        Scene3D.killEnemy(e.id, false);
        ok(Math.abs(m.g.scale.x - s0) < 1e-6 && !m.punchT,
            '처치가 진행 중 스쿼시를 접는다 (x ' + m.g.scale.x.toFixed(4) + ')');
        step(300); // 사망 연출(1.05초) 종료 + enemyMap 정리까지
        ({ e, m } = mk(801)); // 이후 검사들이 쓸 개체를 같은 id로 되살린다

        // 3-d) 크리(히트스톱 있음)도 **임팩트 프레임에** 숫자가 있고, 프리즈 동안엔 아크가 멈춰 있다
        // (비평가 4차 ⓑ: 예전엔 프리즈가 끝난 +66ms에야 생성돼 숫자가 타격과 다른 사건으로 갈렸다)
        Scene3D.fxLayer.innerHTML = '';
        Combat.damageEnemy(e, Big.of(300), true, null);
        const born = [...Scene3D.fxLayer.children];
        ok(born.length > 0, '크리 숫자가 임팩트 프레임에 존재 (' + born.length + '개)');
        ok(born.length > 0 && born[born.length - 1].style.animationPlayState === 'paused',
            '프리즈 동안 아크 정지 — 월드는 멈췄는데 숫자만 날아가지 않는다');
        step(12); // 프리즈(45ms = 5.4프레임)를 넘긴다
        ok(born.length > 0 && born[born.length - 1].style.animationPlayState !== 'paused',
            '프리즈가 풀리면 아크 재개');
        step(60);

        // 3-e) 연타로 슬롯이 쌓여도 숫자가 3D 캔버스 위(상단 HUD)로 넘어가지 않는다
        Scene3D.fxLayer.innerHTML = '';
        for (let i = 0; i < 8; i++) { Combat.damageEnemy(e, Big.of(140), i % 2 === 0, null); step(4); }
        const tops = [...Scene3D.fxLayer.children].map(o => parseFloat(o.style.top));
        ok(tops.length > 0 && Math.min(...tops) >= 12,
            '연타 슬롯이 HUD를 침범하지 않음 (최고 top ' + Math.min(...tops).toFixed(1) + 'px)');
        Scene3D.fxLayer.innerHTML = '';
        step(60);

        // 3-e2) 처치 숫자는 3티어 최상단이라 크고(1.3rem) 1.62배까지 오버슛한다 — 그 정점이
        //       상단 HUD(3D 캔버스 위)를 넘지 않는지. 월드 Y 를 +0.22 더 띄운 것도 여기서 걸린다.
        // ⚠️ 앞 항목들이 이미 이 적을 죽여 뒀다 — `damageEnemy` 는 `!e.alive` 면 즉시 반환하므로
        //    hp 만 되돌리면 아무 일도 안 일어난다(첫 판에서 밟았다). 새 개체로 다시 세운다.
        const k = mk(806); e = k.e; m = k.m;
        Scene3D.fxLayer.innerHTML = '';
        Combat.damageEnemy(e, Big.of(e.maxHp).mul(5), true, null);   // 크리 + 처치
        const killEl = [...Scene3D.fxLayer.children].find(x => x.className.includes('dmg-kill'));
        let killTop = null;
        if (killEl) {
            const tops2 = [];
            for (let t = 0; t <= 0.55; t += 0.02) {   // CSS 아크를 시크해 정점을 찾는다
                killEl.style.animationPlayState = 'paused';
                killEl.style.animationDelay = (-t) + 's';
                tops2.push(killEl.getBoundingClientRect().top);
            }
            killTop = Math.min(...tops2);
        }
        const canvasTop = document.querySelector('canvas').getBoundingClientRect().top;
        ok(!!killEl, '처치타에 dmg-kill 티어가 붙음');
        ok(killTop !== null && killTop >= canvasTop,
            '처치 숫자 아크 정점이 HUD를 침범하지 않음 (정점 top ' + (killTop === null ? '?' : killTop.toFixed(1)) +
            'px vs 캔버스 상단 ' + canvasTop.toFixed(1) + 'px)');
        Scene3D.fxLayer.innerHTML = '';
        step(60);
        { const k2 = mk(807); e = k2.e; m = k2.m; }   // 뒤 항목들이 살아 있는 적을 전제로 한다

        // 3-f) 피아 구분: 만피에서 적 바는 빨강 계열, 영웅 바는 초록 계열 (비평가 4차 ⓓ)
        e.hp = Big.of(e.maxHp);
        Combat.hero.hp = Big.of(Combat.hero.maxHp);
        step(3);
        const foeC = m.hpFg.material.color, heroC = Scene3D.heroBar.hpFg.material.color;
        ok(foeC.r > foeC.g * 2 && foeC.r > foeC.b * 2, '적 바 = 적대 빨강 (r ' + foeC.r.toFixed(3) + ' g ' + foeC.g.toFixed(3) + ')');
        ok(heroC.g > heroC.r * 2, '영웅 바 = 초록 (g ' + heroC.g.toFixed(3) + ' r ' + heroC.r.toFixed(3) + ')');
        // 잔상은 채움과 갈려야 손실 폭이 읽힌다 — 적 바가 빨강이 된 뒤 잔상까지 빨강이면 사라진다
        Combat.damageEnemy(e, Big.of(300), false, null);
        step(3);
        const gC = m.hpGhost.material.color;
        ok(gC.g > gC.b * 1.5 && gC.r > 0.3, '적 잔상바가 빨강 채움과 갈림 (노랑~살구)');

        // 4) 히트스톱이 반드시 풀린다 (연출이 영구 슬로모로 남지 않게)
        Combat.damageEnemy(e, Big.of(300), true, null);
        step(30);
        ok(!Scene3D._hitStop, '히트스톱 자동 해제 (' + Scene3D._hitStop + ')');

        // 5) 처치 후 정리: enemyMap·바 잔존 없음
        const nAnimBefore = Scene3D.anims.length;
        Combat.damageEnemy(e, Big.of(99999), true, null);
        step(300); // 2.5초 — 사망 연출 1.05초보다 충분히 김
        ok(!Scene3D.enemyMap.has(801), '처치 후 enemyMap에서 제거');
        ok(Scene3D.anims.length <= nAnimBefore + 2, '사망 연출 종료 후 애니메이션 큐 누적 없음 (' + Scene3D.anims.length + ')');

        // 6) 새 적의 잔상바는 가득 찬 상태로 시작 (이전 개체 상태 누수 없음)
        const n2 = mk(802);
        Scene3D.update(1 / 120);
        ok(n2.m.hpGhost.scale.x > 0.99 && !n2.m.hpGhost.visible, '새 적 잔상바는 만피·비표시로 시작');

        // 7) 영웅 피격: 비네트·바 흔들림이 걸렸다가 풀린다
        Combat.phase = 'fight'; Combat.hero.hp = Big.of(1000); Combat.hero.maxHp = Big.of(1000);
        Combat.damageHero(Big.of(250));
        // 세기는 --vig(키프레임이 읽는 커스텀 속성)에 실린다. 계산 opacity는 애니메이션 진행 중간값이라 판정에 못 쓴다
        const vigEl = document.getElementById('dmg-flash');
        const vigOf = () => parseFloat(vigEl.style.getPropertyValue('--vig'));
        const vigAnim = vigEl.getAnimations().map(a => a.animationName).join(',');
        ok(vigEl.classList.contains('on') && vigOf() > 0.4 && vigAnim === 'dmgvignette',
            '영웅 피격 즉시 붉은 비네트 켜짐 (--vig ' + vigOf() + ', anim=' + vigAnim + ')');
        const vigSev = (() => { UI.flashDamage(0.05); const a = vigOf(); UI.flashDamage(0.5); const b = vigOf(); return [a, b]; })();
        ok(vigSev[1] > vigSev[0], '피해가 클수록 비네트가 진함 (' + vigSev[0] + ' → ' + vigSev[1] + ')');
        ok(Scene3D.heroBar.barShake > 0, '영웅 HP바 흔들림 시작');
        step(120);
        ok(Scene3D.heroBar.barShake === 0 && Scene3D.heroBar.shakeX === 0, '1초 뒤 영웅 바 흔들림 소멸');
        ok(Math.abs(Scene3D.heroG.rotation.z) < 0.02, '영웅 움찔 회전 복귀');

        // 8) 파티클 상한
        for (let i = 0; i < 60; i++) Scene3D.spawnSparks(new THREE.Vector3(0, 1, 0), 20, 0xff0000);
        ok(Scene3D.particles.length <= 340, '파티클 상한 동작 (' + Scene3D.particles.length + ')');
        return out;
    });
    r.forEach(l => console.log('  ' + l));
    const fails = r.filter(l => l.startsWith('FAIL')).length;
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    console.log(fails ? `\n${fails}건 실패` : '\n전체 통과');
    await b.close();
    process.exit(fails || errors.length ? 1 : 0);
})();
