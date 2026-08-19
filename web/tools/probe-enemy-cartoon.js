// probe-enemy-cartoon.js — 적 모션이 **1930s 카툰 언어로 도는지** 종별로 실측한다.
//   (`cute-art-direction` ⓔ, 사용자 "애니메이션들도 1930년대 카툰 느낌으로 과장되게")
// 사용: node probe-enemy-cartoon.js [kind...]     (기본 7종 전부)
//       node probe-enemy-cartoon.js --neg          (음성 대조 — 옛 사인 모션으로 되돌려 FAIL 재현)
//
// 무엇을 재는가: 종전 적 모션은 `pow(|sin ph|, bobPow)` 한 줄이었다. 그 곡선은
//   ⓐ 오르내림이 **완전 대칭**이고 ⓑ 바닥에 **머무는 시간이 0**(sin 이 정확히 0 인 순간뿐)이며
//   ⓒ 몸이 **한 번도 안 눌린다**(강체가 위아래로 평행이동). 셋 다 카툰 바운스의 정반대다.
// 그래서 게이트도 그 셋을 정면으로 겨눈다 — '보기 좋은가'가 아니라 **곡선이 카툰인가**:
//   ① 스쿼시 진폭 — 사이클 안 scale.y 변동폭이 하한 이상 (강체면 0)
//   ② 위상 정합 — **접지 프레임에서 눌리고(sy<1) 체공에서 늘어난다**. 위상이 어긋나면
//      공중에서 눌리는 프레임이 생겨 '고무 인형이 아니라 고장 난 인형'이 된다.
//   ③ 부피 보존 — sx·sy·sz 가 기준 배율의 세제곱에서 ±2% 안 (한 축만 늘리면 몸이 자란다)
//   ④ 접지 유지 — **스쿼시가 발을 지면 아래로 더 밀어넣지 않는가**. 🚨 절대 임계로 재면 안 된다:
//      골렘은 스쿼시가 없던 시절에도 bbox 최저가 −0.052 다(기둥 다리 밑동이 원점 아래로 모델링돼
//      있고 롤 기울기가 얹힌다). 절대값 −0.03 으로 재면 **멀쩡한 조형이 스쿼시 탓으로 FAIL** 난다
//      (이 저장소의 반복되는 함정 — 코드보다 자를 먼저 의심할 것). 그래서 같은 페이지에서
//      `gaitSquash → 0` 한 판을 더 돌려 **차분**으로 잰다.
//   ⑤ **접지 홀드** — 한 홉 주기에서 높이 0 인 프레임이 실제로 존재한다. 옛 곡선의 홀드는 0 이라
//      이 게이트가 옛 코드/새 코드를 가르는 결정적인 자다(--neg 로 재현할 것).
//
// ⚠️ 헤드리스에서는 rAF 가 사실상 안 돈다(TODO 함정 ③) — `Scene3D.update(dt)` 를 손으로 흘리고
//    연출 백로그(`Scene3D.anims`)는 먼저 비운다. 안 그러면 밀린 애니메이션이 같은 좌표를 덮어쓴다.
// ⚠️ 슬라임은 설계상 그룹 스쿼시가 **없다**(젤리 정점 웨이브가 그 역할 — ENEMY_GAIT 주석).
//    박쥐는 비행이라 접지 홀드가 없다. 둘은 해당 게이트를 면제하고 그 사실을 출력에 적는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const argv = process.argv.slice(2);
const NEG = argv.includes('--neg');
const KINDS = argv.filter(a => !a.startsWith('--')).length ? argv.filter(a => !a.startsWith('--'))
    : ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const MIN_AMP = 0.045;     // ① scale.y 변동폭 하한 — 이 아래는 '과장'이 아니다
const VOL_TOL = 0.02;      // ③ 부피 보존 허용
const FOOT_TOL = 0.02;     // ④ 스쿼시가 접지를 더 내려도 되는 여유(무스쿼시 판 대비 차분)
const MIN_HOLD = 0.04;     // ⑤ 접지 홀드 비율 하한 (옛 곡선 ≈ 0)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    let fail = 0;
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });

        const r = await page.evaluate(({ kind, NEG }) => {
            Combat.tick = () => {};
            if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
            Scene3D.heroAttack = () => {};
            Scene3D.walking = false;
            Scene3D.clearEnemies();
            // 걷는 상태로 세운다 — `walking` 판정은 stopXOf 기준이라 그보다 앞에 둬야 보행 분기로 간다.
            const e = { id: 777, x: Combat.MELEE_X + 1.4, alive: true, hp: 100, maxHp: 100 };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            const m = Scene3D.enemyMap.get(777);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
            Scene3D.anims = [];
            m.g.userData.landed = true;
            m._scaleLocked = false;
            m.punchT = 0;
            if (NEG) {
                // 음성 대조 — 옛 모션(대칭 사인 + 스쿼시 없음)으로 되돌린다. 이 자가 유효하면 FAIL 이 나야 한다.
                Scene3D.hopCurve = (u, bp) => Math.pow(Math.abs(Math.sin(u * Math.PI)), bp || 1);
                Scene3D.gaitSquash = () => 0;
            }
            const G = Scene3D.gaitOf(m.anim && m.anim.kind, false);
            const b = m.baseScale || 1;
            // 한 홉 주기 = π/rate 초. 두 주기를 240 표본으로 훑는다(경계 효과 배제).
            const dur = 2 * Math.PI / G.rate, N = 240, dt = dur / N;
            const out = { kind, rate: G.rate, sq: G.sq === undefined ? null : G.sq, walking: null, sy: [], vol: [], hy: [], foot: [], footFlat: [] };
            const sweep = (arrFoot, arrRest) => {
                Scene3D._clock = 0;
                for (let i = 0; i < N; i++) {
                    Scene3D.update(dt);
                    m.g.updateMatrixWorld(true);
                    if (arrRest) {
                        out.sy.push(m.g.scale.y / b);
                        out.vol.push((m.g.scale.x * m.g.scale.y * m.g.scale.z) / (b * b * b));
                        out.hy.push(m.g.position.y);
                    }
                    arrFoot.push(new THREE.Box3().setFromObject(m.g).min.y);
                }
            };
            sweep(out.foot, true);
            // ④ 의 기준선 — **높이 곡선은 그대로 두고 스쿼시만 끈** 같은 사이클. 같은 페이지·같은
            //    개체·같은 위상이라 조형/롤이 만드는 선재 침하는 양쪽에 똑같이 들어간다.
            const realSq = Scene3D.gaitSquash;
            Scene3D.gaitSquash = () => 0;
            m._gaitSq = 0;
            sweep(out.footFlat, false);
            Scene3D.gaitSquash = realSq;
            out.walking = e.x > Combat.stopXOf(e) + 0.05;
            out.fly = !!(m.anim && m.anim.fly);
            return out;
        }, { kind, NEG });

        const amp = Math.max(...r.sy) - Math.min(...r.sy);
        const volErr = Math.max(...r.vol.map(v => Math.abs(v - 1)));
        const foot = Math.min(...r.foot), footFlat = Math.min(...r.footFlat), footDrop = footFlat - foot;
        const hold = r.hy.filter(y => y <= 1e-6).length / r.hy.length;
        // ② 위상 — 접지(높이 최저 10%) 표본의 평균 sy 가 체공(높이 상위 30%) 평균보다 확실히 작아야 한다
        const idx = r.hy.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
        const lowN = Math.max(1, Math.round(idx.length * 0.10)), hiN = Math.max(1, Math.round(idx.length * 0.30));
        const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
        const syLow = mean(idx.slice(0, lowN).map(i => r.sy[i]));
        const syHi = mean(idx.slice(-hiN).map(i => r.sy[i]));

        const exSq = r.sq === 0;                  // 슬라임 — 젤리 웨이브가 대신한다
        const exHold = r.fly;                     // 박쥐 — 비행이라 접지가 없다
        const chk = [];
        chk.push(['① 스쿼시 진폭', exSq ? null : amp >= MIN_AMP, `${amp.toFixed(4)} (≥${MIN_AMP})`]);
        chk.push(['② 접지-체공 위상', (exSq || r.fly) ? null : syLow < syHi - 0.02, `접지 ${syLow.toFixed(3)} < 체공 ${syHi.toFixed(3)}`]);
        chk.push(['③ 부피 보존', volErr <= VOL_TOL, `오차 ${(volErr * 100).toFixed(2)}% (≤${VOL_TOL * 100}%)`]);
        // ⚠️ 비행종은 ④ 를 면제한다 — 애초에 접지가 없고, 그 위 차분 기준선도 성립하지 않는다
        //    (박쥐 스쿼시는 `gaitSquash` 가 아니라 날갯짓 위상에서 나오므로 그 함수를 꺼도 안 꺼진다.
        //     그걸 '침하 0.0000 통과'로 찍으면 **재지도 않고 준 PASS** 다 — 이 저장소가 금지한 공짜 PASS).
        chk.push(['④ 접지 유지', r.fly ? null : footDrop <= FOOT_TOL, `스쿼시 침하 ${footDrop.toFixed(4)} (≤${FOOT_TOL}) · 발 y ${foot.toFixed(4)} / 무스쿼시 ${footFlat.toFixed(4)}`]);
        chk.push(['⑤ 접지 홀드', exHold ? null : hold >= MIN_HOLD, `${(hold * 100).toFixed(1)}% (≥${MIN_HOLD * 100}%)`]);
        chk.push(['⑥ 콘솔 0', errors.length === 0, `${errors.length}건`]);

        const bad = chk.filter(c => c[1] === false);
        if (!r.walking) { console.log(`${kind}: ⚠️ 보행 분기로 안 갔다 — 자 무효`); fail++; await page.close(); continue; }
        console.log(`${kind}${r.fly ? '(비행)' : ''}${exSq ? '(젤리)' : ''} rate=${r.rate} sq=${r.sq}`);
        for (const c of chk) console.log(`   ${c[1] === null ? '—면제' : c[1] ? '✅' : '❌'} ${c[0]}: ${c[2]}`);
        if (bad.length) fail++;
        if (errors.length) console.log('   err:', errors.slice(0, 3).join(' | '));
        await page.close();
    }
    await browser.close();
    if (NEG) {
        console.log(`\n[음성 대조] 실패 종 ${fail}/${KINDS.length} — 옛 모션에서 FAIL 이 나야 자가 유효하다.`);
        process.exit(fail > 0 ? 0 : 1);
    }
    console.log(`\n${fail ? `미통과 ${fail}/${KINDS.length}종` : `전 종 통과 ${KINDS.length}/${KINDS.length}`}`);
    process.exit(fail ? 1 : 0);
})();
