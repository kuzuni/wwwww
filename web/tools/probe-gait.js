// 종별 보행 프로파일(ⓓ 종별 고유 모션) 실측 — 사용: node probe-gait.js [종...]  (기본: golem·goblin·imp)
// TODO '적 몬스터 퀄리티 업'(slug: enemy-quality) ⓓ. 적용 전 **골렘·고블린·임프가 완전히 같은 이족
// 사이클**(clk*8, 같은 진폭)을 돌았고, 골렘은 **다리가 아예 안 움직였다**(다리·발이 둘 다 g 에 고정돼
// 몸통만 까딱이는 '미끄러지는 석상'). 이제 `Scene3D.ENEMY_GAIT` 에서 박자·진폭을 종별로 뽑는다.
//
// ⚠️ 함정 ③(헤드리스에서는 연출 시간이 안 흐른다)을 그대로 지킨다 — `Scene3D.update` 는 rAF 라
//    swiftshader 에서 사실상 안 돈다. **한 번의 evaluate 안에서** Combat 틱을 끊고, 밀린 백로그를
//    비우고, `Scene3D.update(1/60)` 를 손으로 흘리며 샘플링한다. 안 그러면 밀린 애니메이션 수십 개가
//    같은 좌표를 서로 덮어써 톱니로 튄다.
// ⚠️ 함정 ④⑴(자가 코드보다 낡으면 판정 무효)도 지킨다 — 게이트 수치를 프로브에 베껴 두지 않고
//    `Scene3D.ENEMY_GAIT` 가 준 값을 **코드에서 읽어** 기대 주기를 만든 뒤 실측 주기와 맞춰 본다.
//
// 지표 4종:
//  ① 다리가 실제로 움직이는가 — 골렘 회귀 방지. 스윙 진폭이 0 이면 '미끄러지는 석상'이 돌아온 것이다.
//  ② 박자가 코드와 일치하는가 — 상하 진동의 실측 주기 vs `ENEMY_GAIT.rate` 에서 계산한 주기.
//     상하 운동은 |sin| 이라 **주기가 rate 의 절반**(π/rate)이다.
//  ③ 체공 곡선(bobPow) — 무거운 종은 아래에, 가벼운 종은 위에 오래 머문다. 정규화 높이의 중앙값으로
//     본다. ⚠️ 중립선은 0.5 가 **아니라** 0.7071 이다(높이가 |sin|^p 이고 위상이 균일하면 중앙값이
//     sin(π/4)^p 이므로). 기대치를 코드의 bobPow 에서 직접 만들어 맞춰 본다.
//  ④ 종끼리 실제로 다른가 — 위 셋이 종별로 갈리는지. 같으면 ⓓ 가 안 된 것이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2) : ['golem', 'goblin', 'imp'];

const N = 480;          // 8초분 @60fps
const PERIOD_TOL = 0.12; // 실측 주기가 코드 기대치에서 벗어나도 되는 비율

const runKind = async (browser, KIND) => {
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    // ⚠️ enemyMap.size 만 기다리면 부족하다 — 그 사이 웨이브가 전멸해 `Combat.enemies` 에 살아 있는
    //    개체가 하나도 없는 순간에 걸린다(실측: imp 런이 여기서 undefined.id 로 죽었다).
    //    **살아 있는 적 + 그 적의 메시**가 둘 다 있을 때까지 기다린다.
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && typeof Combat !== 'undefined'
        && Combat.enemies && Combat.enemies.some(x => x.alive && Scene3D.enemyMap.get(x.id)), null, { timeout: 60000 });

    const res = await page.evaluate((N) => {
        // ── 한 번의 evaluate 안에서 전부 끝낸다(함정 ③) ──
        Combat.tick = () => { };                 // 별도 인터벌이라 계속 돌면 좌표를 덮어쓴다
        Scene3D.anims.length = 0;                // 밀린 백로그 비우기

        // ⚠️ 영웅이 계속 때리므로 waitForFunction 을 통과한 직후에도 웨이브가 전멸할 수 있다(실측:
        //    같은 프로브가 imp 런에서 한 번, golem 런에서 한 번 여기서 죽었다). 그래서 위에서 Combat 틱을
        //    **먼저** 끊고, 그래도 산 개체가 없으면 **메시가 남아 있는 적을 되살려** 쓴다.
        let e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id))
            || Combat.enemies.find(x => Scene3D.enemyMap.get(x.id));
        if (!e) return { error: '메시가 붙은 적이 하나도 없다' };
        const m = Scene3D.enemyMap.get(e.id);
        e.alive = true;                          // 샘플링 도중 죽어 루프에서 빠지지 않게 고정
        e.hp = Math.max(e.hp || 0, 1e12);
        m.g.userData.landed = true;              // 등장 스케일인이 안 끝났으면 보행 분기에 안 들어간다
        e.x = Combat.stopXOf(e) + 5;             // walking = true 로 고정
        Scene3D.worldX = 0;

        const gait = Scene3D.ENEMY_GAIT[m.anim.kind] || Scene3D.ENEMY_GAIT._default;  // 코드가 준 값을 읽는다

        const ys = [], legs = [];
        for (let i = 0; i < N; i++) {
            e.x = Combat.stopXOf(e) + 5;         // 매 프레임 보행 상태 유지(update 가 x 를 당긴다)
            e.alive = true;
            Scene3D.update(1 / 60);
            ys.push(m.g.position.y);
            const rig = m.anim.gleg || (m.anim.bleg && m.anim.bleg.map(L => L.hip));
            legs.push(rig ? rig.map(o => o.rotation.x) : []);
        }

        // 다리 스윙 진폭 = 각 다리 회전각의 p-p
        const nLeg = legs[0].length;
        const swing = [];
        for (let j = 0; j < nLeg; j++) {
            const col = legs.map(r => r[j]);
            swing.push(Math.max(...col) - Math.min(...col));
        }

        return { kind: m.anim.kind, gait, ys, swing, nLeg };
    }, N);

    await page.close();
    if (res.error) return { fails: [`[${KIND}] ${res.error}`], sig: { kind: KIND, period: 0, medN: 0, amp: 0 } };

    const fails = [];
    const { ys, gait, swing } = res;
    const yMin = Math.min(...ys), yMax = Math.max(...ys);

    // ② 실측 주기 — 상승 방향 제로크로스(평균선 통과) 간격의 중앙값
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const cross = [];
    for (let i = 1; i < ys.length; i++) if (ys[i - 1] <= mean && ys[i] > mean) cross.push(i);
    const gaps = [];
    for (let i = 1; i < cross.length; i++) gaps.push((cross[i] - cross[i - 1]) / 60);
    gaps.sort((a, b) => a - b);
    const period = gaps.length ? gaps[gaps.length >> 1] : 0;
    const expect = Math.PI / gait.rate;   // |sin(rate·t)| 의 주기

    // ③ 체공 곡선 — 정규화 높이의 중앙값
    const norm = ys.map(y => (y - yMin) / Math.max(1e-9, yMax - yMin)).sort((a, b) => a - b);
    const medN = norm[norm.length >> 1];

    const minSwing = Math.min(...swing);
    console.log(`\n[${res.kind}] rate ${gait.rate} · bobPow ${gait.bobPow} · 다리 ${res.nLeg}개`);
    if (!res.nLeg) fails.push('① 다리 리그가 없다 — anim.gleg/bleg 확인');
    if (minSwing < 0.05) fails.push(`① 다리 스윙 진폭 최소 ${minSwing.toFixed(4)} rad — 다리가 안 움직인다`);
    console.log(`① 다리 스윙 p-p ${swing.map(v => v.toFixed(3)).join(' / ')} rad ... ${res.nLeg && minSwing >= 0.05 ? 'PASS' : 'FAIL'}`);

    const err = expect ? Math.abs(period - expect) / expect : 1;
    if (err > PERIOD_TOL) fails.push(`② 실측 주기 ${period.toFixed(4)}s 가 코드 기대치 ${expect.toFixed(4)}s 에서 ${(err * 100).toFixed(1)}% 벗어남`);
    console.log(`② 박자 실측 ${period.toFixed(4)}s vs 코드 ${expect.toFixed(4)}s (오차 ${(err * 100).toFixed(1)}%, 허용 ${PERIOD_TOL * 100}%) ... ${err <= PERIOD_TOL ? 'PASS' : 'FAIL'}`);

    // ⚠️ 기준선은 0.5 가 아니다. 높이가 |sin|^p 이므로 위상이 균일하면 |sin| 의 중앙값은 sin(π/4)=0.7071,
    //    따라서 정규화 중앙값의 기대치는 **0.7071^p** 다(p=1 이면 0.707). 처음 이걸 0.5 로 놓고 재서
    //    골렘(실측 0.510, 기대 0.523)을 '의도와 반대'라고 **오반려**했다 — 함정 ①(측정 오류를 좇아
    //    멀쩡한 값을 건드리지 말 것)의 교과서적인 사례라 자를 고쳤다.
    //    기대치를 코드의 bobPow 에서 직접 만들어 맞춰 보므로, bobPow 가 실제로 먹었는지까지 같이 검증된다.
    const NEUTRAL = Math.SQRT1_2;
    const expectMed = Math.pow(NEUTRAL, gait.bobPow);
    const medErr = Math.abs(medN - expectMed) / expectMed;
    const dirOk = gait.bobPow > 1.15 ? medN < NEUTRAL - 0.02
        : gait.bobPow < 0.85 ? medN > NEUTRAL + 0.02 : true;
    const shapeOk = medErr <= 0.08 && dirOk;
    if (medErr > 0.08) fails.push(`③ 정규화 높이 중앙값 ${medN.toFixed(3)} 이 bobPow ${gait.bobPow} 의 기대치 ${expectMed.toFixed(3)} 에서 ${(medErr * 100).toFixed(1)}% 벗어남 — bobPow 가 안 먹었다`);
    if (!dirOk) fails.push(`③ bobPow ${gait.bobPow} 인데 중앙값 ${medN.toFixed(3)} 이 중립선 ${NEUTRAL.toFixed(3)} 의 반대쪽이다`);
    console.log(`③ 체공 곡선 중앙값 ${medN.toFixed(3)} vs 기대 ${expectMed.toFixed(3)} (중립선 ${NEUTRAL.toFixed(3)}, ${gait.bobPow > 1.15 ? '무겁게' : gait.bobPow < 0.85 ? '가볍게' : '중립'}) ... ${shapeOk ? 'PASS' : 'FAIL'}`);
    console.log(`   상하 진폭 ${(yMax - yMin).toFixed(4)} · 콘솔 에러 ${errors.length}건`);

    if (errors.length) fails.push(`콘솔 에러 ${errors.length}건: ${errors.slice(0, 2).join(' | ')}`);
    return { fails: fails.map(f => `[${res.kind}] ${f}`), sig: { kind: res.kind, period: +period.toFixed(4), medN: +medN.toFixed(3), amp: +(yMax - yMin).toFixed(4) } };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    let all = [], sigs = [];
    for (const k of KINDS) { const r = await runKind(browser, k); all = all.concat(r.fails); sigs.push(r.sig); }
    await browser.close();

    // ④ 종끼리 실제로 갈리는가 — 주기가 같으면 ⓓ 가 안 된 것이다
    console.log('\n④ 종간 구분:');
    for (let i = 0; i < sigs.length; i++) {
        for (let j = i + 1; j < sigs.length; j++) {
            const a = sigs[i], b = sigs[j];
            const same = Math.abs(a.period - b.period) / Math.max(a.period, b.period) < 0.05;
            console.log(`   ${a.kind} ${a.period}s vs ${b.kind} ${b.period}s ... ${same ? 'FAIL(같음)' : 'PASS'}`);
            if (same) all.push(`④ ${a.kind}·${b.kind} 의 보행 주기가 사실상 같다 (${a.period}s vs ${b.period}s)`);
        }
    }

    if (all.length) { console.log('\nFAIL:\n - ' + all.join('\n - ')); process.exit(1); }
    console.log(`\n${KINDS.length}종 전부 PASS`);
})();
