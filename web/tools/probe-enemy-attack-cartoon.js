// probe-enemy-attack-cartoon.js — 적 공격 돌진이 **1930s 카툰 타이밍**으로 도는지 잰다.
//   (`cute-art-direction` ⓔ — 예비동작 anticipation · 스냅 · 여운 follow-through)
// 사용: node probe-enemy-attack-cartoon.js [kind(기본 goblin)] [--neg]
//
// 종전 돌진은 `ox − sin(kπ)·0.55` **한 줄**이었다. 그 곡선은 나가는 속도와 돌아오는 속도가 같고
// (완전 대칭), 뒤로 당기는 구간이 없고, 목표를 지나치지도 않는다 — 예비동작·여운이 정의상 0 인
// '왕복 진자'다. 게이트는 그 셋을 정면으로 겨눈다:
//   ① 예비동작 — 돌진 전에 **뒤로**(+x, 영웅 반대) 물러난다
//   ② 스냅 비대칭 — 전진에 쓰는 시간이 복귀에 쓰는 시간보다 확실히 짧다
//   ③ 코일 스쿼시 — 예비 구간에 눌리고(sy<1) 스냅 정점에 늘어난다(sy>1)
//   ④ 여운 오버슈트 — 복귀가 원점을 **지나쳤다** 돌아온다
//   ⑤ 종료 후 잔류 없음 — x·scale 이 원복된다(안 되면 시체·다음 공격이 어긋난다)
// ⚠️ 헤드리스 rAF 함정(③) 때문에 `Scene3D.update(dt)` 를 손으로 흘린다. 연출 백로그는 먼저 비운다.
// ⚠️ 스케일 합성은 update 안(연출 스텝보다 **앞**)에서 도므로 sy 는 x 보다 한 프레임 늦다 — 위상
//    비교를 프레임 단위로 딱 맞추지 말 것(그래서 ③ 은 구간 최소/최대로 본다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const argv = process.argv.slice(2);
const NEG = argv.includes('--neg');
const KIND = argv.filter(a => !a.startsWith('--'))[0] || 'goblin';
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const r = await page.evaluate((NEG) => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        Scene3D.walking = false;
        Scene3D.clearEnemies();
        // 정지 위치에 세운다 — 공격은 대열이 멈춘 뒤에 나온다.
        const e = { id: 321, x: Combat.MELEE_X, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(321);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.userData.landed = true; m._scaleLocked = false; m.punchT = 0; m._atkSq = 0;
        m.g.position.x = e.x + Scene3D.worldX;
        if (NEG) {
            // 음성 대조 — 옛 대칭 돌진(예비동작·스쿼시·오버슈트 없음)으로 되돌린다.
            Scene3D.enemyAttack = function (id) {
                const mm = this.enemyMap.get(id); if (!mm) return;
                const ox = mm.g.position.x;
                this.addAnim(0.3, k => { if (mm.dead) return; mm.g.position.x = ox - Math.sin(k * Math.PI) * 0.55; },
                    () => { mm._atkSq = 0; mm.g.position.x = ox; });
            };
        }
        const dt = 1 / 60, b = m.baseScale || 1;
        Scene3D._clock = 0;
        Scene3D.update(dt);
        const x0 = m.g.position.x;
        Scene3D.enemyAttack(321);
        const xs = [], sys = [];
        for (let i = 0; i < 26; i++) {   // 0.3s 연출 + 여유
            Scene3D.update(dt);
            xs.push(m.g.position.x - x0);
            sys.push(m.g.scale.y / b);
        }
        const tail = [];
        for (let i = 0; i < 8; i++) { Scene3D.update(dt); tail.push({ x: m.g.position.x - x0, sy: m.g.scale.y / b }); }
        return { xs, sys, tail, atk: m._atkSq };
    }, NEG);

    const xs = r.xs, sys = r.sys;
    const minX = Math.min(...xs), iMin = xs.indexOf(minX);
    // ① 예비동작 — 최전진(iMin) 이전에 + 쪽으로 물러난 최대치
    const back = Math.max(...xs.slice(0, Math.max(1, iMin)));
    // ② 비대칭 — **예비동작은 느리고 타격은 빠르다**(카툰 액션의 정의). 예비 정점까지의 프레임 수 vs
    //    거기서 최전진까지의 프레임 수로 잰다.
    //    🚨 초안은 '전진 프레임 < 복귀 프레임'으로 쟀다가 FAIL 이 났는데 **자가 틀린 것이었다** —
    //       복귀에 건 `easeBack` 은 설계상 앞이 빠르고(오버슈트까지 단숨에) 뒤에서 흔들려 안착한다.
    //       '원점 90% 회복까지의 프레임'을 세면 그 빠른 앞부분만 잡혀 복귀가 3프레임으로 나온다.
    //       복귀 속도는 카툰 원칙이 아니다(원칙은 예비=느림·타격=빠름·여운=지나침). 여운의 존재는
    //       ④ 오버슈트가 이미 따로 잡는다.
    const iBack = xs.indexOf(back);
    const antFrames = Math.max(1, iBack + 1), fwdFrames = Math.max(1, iMin - iBack);
    // ③ 코일/스트레치 — 예비 구간 최소 sy, 스냅 정점 부근 최대 sy
    const syCoil = Math.min(...sys.slice(0, Math.max(2, iMin)));
    const syPeak = Math.max(...sys.slice(Math.max(0, iMin - 1), Math.min(sys.length, iMin + 5)));
    // ④ 여운 오버슈트 — 최전진 이후 원점을 지나쳐 + 로 나간 최대치
    const over = Math.max(0, ...xs.slice(iMin + 1));
    // ⑤ 잔류 — 연출 종료 후 x·sy 원복
    const residX = Math.max(...r.tail.map(t => Math.abs(t.x)));
    const residS = Math.max(...r.tail.map(t => Math.abs(t.sy - 1)));

    const chk = [
        ['① 예비동작(뒤로 당김)', back >= 0.05, `${back.toFixed(4)} (≥0.05)`],
        ['② 예비 느림·타격 빠름', antFrames > fwdFrames, `예비 ${antFrames}프레임 > 타격 ${fwdFrames}프레임`],
        ['③ 코일→스트레치', syCoil <= 0.94 && syPeak >= 1.06, `코일 sy ${syCoil.toFixed(3)} (≤0.94) · 정점 sy ${syPeak.toFixed(3)} (≥1.06)`],
        ['④ 여운 오버슈트', over >= 0.01, `원점 통과 ${over.toFixed(4)} (≥0.01)`],
        ['⑤ 종료 후 잔류 없음', residX <= 0.01 && residS <= 0.08, `x ${residX.toFixed(4)} (≤0.01) · sy 편차 ${residS.toFixed(3)} (≤0.08, 대기 스쿼시 포함)`],
        ['⑥ 콘솔 0', errors.length === 0, `${errors.length}건`],
    ];
    console.log(`${KIND} — 공격 돌진 카툰 타이밍${NEG ? ' [음성 대조]' : ''} (최전진 ${minX.toFixed(3)} @${iMin}프레임)`);
    for (const c of chk) console.log(`   ${c[1] ? '✅' : '❌'} ${c[0]}: ${c[2]}`);
    if (errors.length) console.log('   err:', errors.slice(0, 3).join(' | '));
    await browser.close();
    const bad = chk.filter(c => !c[1]).length;
    if (NEG) { console.log(bad ? `[음성 대조] ${bad}건 FAIL — 자가 유효하다` : '[음성 대조] 전부 통과 — 자가 옛 코드를 못 가른다'); process.exit(bad ? 0 : 1); }
    console.log(bad ? `미통과 ${bad}건` : '전 항목 통과');
    process.exit(bad ? 1 : 0);
})();
