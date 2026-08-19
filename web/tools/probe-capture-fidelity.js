// probe-capture-fidelity.js — **캡처가 코드를 진짜로 찍고 있는지** 잰다.
//   (1차 비평가 2인이 독립적으로 '영웅 걷기에 다리가 안 움직인다'·'버섯이 안 뛴다'를 최우선 결함으로
//    올렸는데, 같은 코드를 수치로 재는 `probe-enemy-cartoon` 은 PASS 다. 둘 중 하나가 거짓말을 한다.)
// 사용: node probe-capture-fidelity.js
//
// 재는 것
//   ① **클립 진실값** — `Walking` 클립을 `_t` 로 훑으면 발이 실제로 움직이는가(월드 좌표).
//   ② **rAF 오염** — `shot-walk-seq.js` 와 **똑같이** 포즈를 찍고 90ms 기다린 뒤 다시 읽으면
//      포즈가 남아 있는가. `Scene3D.update` 는 `walking=false` 면 매 프레임 `heroPlay(['Idle'])` 를
//      부르므로, 캡처 도구가 월드 스크롤을 끄려고 `walking=false` 로 둔 순간 **rAF 한 프레임이
//      클립을 Idle 로 되돌린다** — 그러면 저장되는 건 걷기가 아니라 대기 포즈다.
//   ③ **처방 검증** — `heroPlay` 를 잠그면(클립 전환 차단) 같은 대기 후에도 포즈가 유지되는가.
//   ④ **위상 정렬** — 적 홉의 스쿼시는 접지 부근에만 몰려 있다(체공 38%는 중립). 균등 표본으로
//      6장을 찍으면 전부 중립 구간에 걸릴 수 있다. 접지/이륙/정점 위상에서 실제로 값이 갈리는지 잰다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=mushroom', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 60000 });

    // ── ① 클립 진실값 ────────────────────────────────────────────────────────────
    const truth = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        const R = Scene3D.heroRig;
        R.play('Walking');
        const feet = [];
        const footOf = () => {
            // 발끝 = 리그에서 가장 낮은 정점의 x·y (발이 스윙하면 x 가 크게 흔들린다)
            const v = new THREE.Vector3(); let best = null;
            R.root.traverse(o => {
                if (!o.geometry || o.visible === false) return;
                const b = new THREE.Box3().setFromObject(o);
                if (!best || b.min.y < best.y) best = { y: b.min.y, x: b.getCenter(v).x };
            });
            return best;
        };
        const dur = R._clip.dur;
        for (let i = 0; i < 12; i++) {
            R._t = dur * i / 12; R.update(0);
            Scene3D.heroG.updateMatrixWorld(true);
            feet.push(footOf());
        }
        return { dur, clip: R._clip.name || '(이름없음)', feet };
    });
    const fy = truth.feet.map(f => f.y), fx = truth.feet.map(f => f.x);
    const spreadY = Math.max(...fy) - Math.min(...fy), spreadX = Math.max(...fx) - Math.min(...fx);

    // ── ② rAF 오염 (shot-walk-seq.js 와 같은 절차) ───────────────────────────────
    // 🚨 클립 **이름**으로 판정하려다 실패했다 — `_clip` 에 name 이 없어 전부 '(이름없음)'이다.
    //    포즈 자체의 **서명**(가장 낮은 정점의 x·y)으로 재는 쪽이 이름보다 강하다(이름이 같아도
    //    `_t` 가 흐르면 포즈는 달라지고, 그게 캡처에 찍히는 실체다).
    await page.evaluate(() => {
        const R = Scene3D.heroRig;
        window.__poseAt = (u) => { R._t = R._clip.dur * u; R.update(0); };
        window.__sig = () => {
            const v = new THREE.Vector3(); let best = null;
            Scene3D.heroG.updateMatrixWorld(true);
            R.root.traverse(o => {
                if (!o.geometry || o.visible === false) return;
                const b = new THREE.Box3().setFromObject(o);
                if (!best || b.min.y < best.y) best = { y: b.min.y, x: b.getCenter(v).x };
            });
            return { x: best.x, y: best.y, t: R._t };
        };
        R.play('Walking');
    });
    // 🚨 '포즈 → 90ms 대기 → 다시 읽기'로 쟀더니 이동이 0.0003 이라 무오염처럼 보였다. **자가 늦은 것이다** —
    //    포즈 직후의 서명조차 이미 다음 CDP 왕복(수 ms) 사이에 rAF 가 Idle 로 갈아치운 뒤 값이었다
    //    (`_t` 가 내가 넣은 0.33 이 아니라 1.500 으로 읽혔다). 그래서 기준값은 **포즈와 같은 턴 안에서**
    //    읽고, 비교값을 다음 턴에서 읽는다. 이 차이가 곧 '코드가 만든 포즈 vs 스크린샷이 찍는 포즈'다.
    // 🚨 서명 이동으로도 못 잡았다(0.0001) — **포즈가 흔들린 게 아니라 애초에 다른 클립을 포즈한 것**이기
    //    때문이다. `_t` 가 내가 넣은 `0.66×0.5=0.33` 이 아니라 1.4 로 읽혔다 = 그 순간 `_clip` 이 이미
    //    Idle(dur 2.8)이었다. rAF 한 프레임이 `heroPlay(['Idle'])` 로 갈아치운 뒤라 `__poseAt` 은
    //    **Idle 을 절반 위상으로 포즈**한다. 그래서 판정을 '클립 길이가 걷기 것인가'로 바꾼다 —
    //    포즈가 흔들리는지가 아니라 **무엇을 포즈했는지**가 문제였다.
    const naive = await page.evaluate(() => { window.__poseAt(0.5); return { dur: Scene3D.heroRig._clip.dur, sig: window.__sig() }; });
    await page.waitForTimeout(90);                       // 캡처 도구가 스크린샷 전에 두는 바로 그 대기
    const naive2 = await page.evaluate(() => ({ dur: Scene3D.heroRig._clip.dur, sig: window.__sig() }));

    // ── ③ 처방: 클립 전환 잠금 + **핀 고정 update** ──────────────────────────────
    //    heroPlay 만 잠그면 부족하다 — rAF 의 `heroRig.update(dt)` 가 `_t` 를 계속 민다.
    //    update 를 감싸 매 프레임 **핀 위상으로 되돌린 뒤 dt=0 으로** 돌리면 rAF 가 몇 번 끼어들든
    //    화면은 항상 그 위상이다(렌더는 update 안에 있어 얼리면 안 된다 — main.js rAF 참조).
    await page.evaluate(() => {
        const R = Scene3D.heroRig;
        Scene3D.heroPlay = () => {};
        R.play('Walking');
        const ORIG = Scene3D.update.bind(Scene3D);
        window.__pin = null;
        Scene3D.update = (dt) => { if (window.__pin != null) { R._t = R._clip.dur * window.__pin; ORIG(0); } else ORIG(dt); };
        window.__pin = 0.5;
    });
    const lockBefore = await page.evaluate(() => { window.__poseAt(0.5); return { dur: Scene3D.heroRig._clip.dur, sig: window.__sig() }; });
    await page.waitForTimeout(90);
    const lockAfter = await page.evaluate(() => ({ dur: Scene3D.heroRig._clip.dur, sig: window.__sig() }));
    const lockDx = Math.abs(lockAfter.sig.x - lockBefore.sig.x) + Math.abs(lockAfter.sig.y - lockBefore.sig.y);

    // ── ④ 적 홉 위상 정렬 ────────────────────────────────────────────────────────
    const phase = await page.evaluate(() => {
        Scene3D.clearEnemies();
        const e = { id: 888, x: Combat.MELEE_X + 1.4, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(888);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.userData.landed = true; m._scaleLocked = false; m.punchT = 0;
        const G = Scene3D.gaitOf(m.anim && m.anim.kind, false), b = m.baseScale || 1;
        // 균등 6표본 vs 위상 정렬 5표본
        const at = (hopU) => {
            // hopU(0~1) 를 만드는 시각: hopU = (clk*rate + id)/π  →  clk = (hopU*π − id)/rate
            let clk = (hopU * Math.PI - e.id) / G.rate;
            while (clk < 0) clk += Math.PI * 2 / G.rate * 8;
            Scene3D._clock = clk; Scene3D.update(0);
            return { sy: m.g.scale.y / b, y: m.g.position.y };
        };
        const gc = Math.min(0.34, Math.max(0.05, 0.11 * G.bobPow));
        const even = [], aligned = [];
        const period = 2 * Math.PI / G.rate;
        for (let i = 0; i < 6; i++) { Scene3D._clock = period * i / 6; Scene3D.update(0); even.push({ sy: m.g.scale.y / b, y: m.g.position.y }); }
        for (const u of [0.01, gc * 0.6, gc + 0.10, gc + (1 - gc) * 0.47, gc + (1 - gc) * 0.93]) aligned.push(at(u));
        return { even, aligned, gc, rate: G.rate };
    });
    const evenSpread = Math.max(...phase.even.map(p => p.sy)) - Math.min(...phase.even.map(p => p.sy));
    const alignSpread = Math.max(...phase.aligned.map(p => p.sy)) - Math.min(...phase.aligned.map(p => p.sy));

    const chk = [
        ['① 걷기 클립은 실제로 다리를 움직인다', spreadX >= 0.05 || spreadY >= 0.03,
            `발 x 진폭 ${spreadX.toFixed(4)} · y 진폭 ${spreadY.toFixed(4)} (클립 ${truth.clip}, dur ${truth.dur})`],
        ['② rAF 가 걷기 클립을 Idle 로 갈아친다(=캡처 결함 재현)', Math.abs(naive.dur - truth.dur) > 0.01,
            `포즈한 클립 dur ${naive.dur} (걷기는 ${truth.dur}) · 90ms 뒤 ${naive2.dur} — 즉 저장된 건 걷기가 아니라 대기 포즈다`],
        ['③ 핀 고정 update 가 걷기 포즈를 지킨다(처방)', Math.abs(lockAfter.dur - truth.dur) <= 0.01 && lockDx <= 0.002,
            `dur ${lockAfter.dur} · 90ms 대기 뒤 서명 이동 ${lockDx.toFixed(4)} (_t ${lockBefore.sig.t.toFixed(3)} → ${lockAfter.sig.t.toFixed(3)})`],
        ['④ 위상 정렬이 스쿼시를 드러낸다', alignSpread > evenSpread * 1.5,
            `균등 6표본 sy 폭 ${evenSpread.toFixed(4)} vs 위상정렬 5표본 ${alignSpread.toFixed(4)} (접지비 gc=${phase.gc.toFixed(3)})`],
        ['⑤ 콘솔 0', errors.length === 0, `${errors.length}건`],
    ];
    console.log('캡처 정합성 — 비평가가 본 프레임이 코드를 찍은 것인가');
    for (const c of chk) console.log(`   ${c[1] ? '✅' : '❌'} ${c[0]}: ${c[2]}`);
    console.log('   균등 표본 sy:', phase.even.map(p => p.sy.toFixed(3)).join(' '));
    console.log('   정렬 표본 sy:', phase.aligned.map(p => p.sy.toFixed(3)).join(' '), '| y:', phase.aligned.map(p => p.y.toFixed(3)).join(' '));
    if (errors.length) console.log('   err:', errors.slice(0, 3).join(' | '));
    await browser.close();
    const bad = chk.filter(c => !c[1]).length;
    console.log(bad ? `미확인 ${bad}건` : '전 항목 확인');
    process.exit(bad ? 1 : 0);
})();
