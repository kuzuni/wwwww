// 사망 → 리빌 연속 프레임 캡처 (death-enemy-remnant) — 암전이 걷히는 그 순간에 무엇이 보이나.
//
// 🚨 이 컨테이너는 소프트웨어 렌더러라 4~5fps 다. 실시간으로 찍으면 프레임 사이가 200ms 씩
//    벌어져 정작 봐야 할 리빌 구간(3400~4100ms, 700ms)이 3~4장으로 뭉갠다. 게다가 로직 루프
//    (setInterval)까지 같은 스레드에서 굶어 ms 가 통째로 밀린다 — 우리 코드가 아니라 상자 탓인
//    지연이 사진에 섞인다.
// → **가상 벽시계**로 찍는다: `U.now()` 를 우리가 굴리는 값으로 갈아끼우고, 로직 틱도 우리가
//    한 걸음씩 부르고, 암전 커버(WAAPI)의 currentTime 도 같은 값으로 박는다. 그러면 각 사진이
//    "실기기에서 사망 후 T ms 에 보이는 화면"에 정확히 대응한다. (probe-death-fade.js 가 쓰는
//    `a.pause(); a.currentTime = …` 결정적 샘플링과 같은 수법을 시퀀스로 늘린 것.)
//
// 사용: node tools/shot-death-reveal.js [출력디렉터리]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.resolve(__dirname, 'death-reveal');
const STEP = 100;          // 가상 시계 한 걸음 = main.js 로직 틱(100ms)
const UNTIL = 4400;        // 연출 전체(4100ms) + 꼬리

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('boot-loading') && typeof Combat !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.scene, null, { timeout: 180000 });
    await page.waitForFunction(() => Combat.phase === 'fight' && Scene3D.enemyMap.size > 0, null, { timeout: 120000 });

    // 가상 시계 설치 + 로직 틱을 우리 손으로 (setInterval 이 제멋대로 돌지 않게 실물을 떼어 둔다)
    await page.evaluate(() => {
        window.__v = { t0: U.now(), now: U.now(), tick: Combat.tick.bind(Combat) };
        window.__v.oldIds = [...Scene3D.enemyMap.keys()];   // 죽기 전 적 — 리빌에 이게 남으면 결함
        U.now = () => window.__v.now;
        Combat.tick = () => {};                       // main.js 의 인터벌은 여기서 막고
        Scene3D.update = (u => dt => u.call(Scene3D, Math.min(dt, 0.1)))(Scene3D.update);
        // 사망 시퀀스가 거는 setTimeout 도 가상 시계에 태운다 — 이 상자에서는 한 걸음 찍는 데
        // 실시간 1초가 넘어, 진짜 타이머를 두면 가상 300ms 에 이미 실시간 4.5초가 지나 연출이
        // 통째로 끝나 버린다(첫 시도에서 실제로 그랬다). onDefeat 이 거는 타이머만 가로챈다.
        const realST = window.setTimeout, q = [];
        window.setTimeout = (fn, ms) => { q.push({ at: window.__v.now + (ms || 0), fn }); return 0; };
        Combat.onDefeat();
        window.setTimeout = realST;
        window.__v.drain = () => { for (let i = q.length - 1; i >= 0; i--) if (q[i].at <= window.__v.now) { const f = q[i].fn; q.splice(i, 1); f(); } };
        // 암전 커버(+배너 자식)의 WAAPI 를 멈춰 세운다 — 아래에서 프레임마다 currentTime 을 박는다
        const cover = [...Scene3D.fxLayer.children].find(d => d.style && d.style.zIndex === '15');
        window.__v.cover = cover;
        window.__v.anims = () => (cover ? [cover, ...cover.children].flatMap(el => el.getAnimations()) : []);
        window.__v.anims().forEach(a => a.pause());
        // 🚨 `deathFade` 의 잔류 방지 폴백(`setTimeout(cover.remove, total+400)`)과 `onfinish` 은
        //    **실시간**으로 돈다. 5fps 상자에서는 한 장 찍는 데 1초 넘게 걸려, 가상 시계가 300ms 일
        //    때 이미 실시간 4.5초가 지나 커버가 통째로 사라졌다(첫 시도에서 실제로 그랬다).
        //    이 인스턴스의 remove 만 막는다 — 브라우저를 닫으면 같이 사라지니 뒤처리는 필요 없다.
        if (cover) cover.remove = () => {};
    });

    const rows = [];
    for (let t = 0; t <= UNTIL; t += STEP) {
        const info = await page.evaluate(async T => {
            window.__v.now = window.__v.t0 + T;
            window.__v.tick(0.1);                      // 로직 한 걸음
            window.__v.drain();                        // 가상 시계에 걸린 타이머
            window.__v.anims().forEach(a => { try { a.currentTime = T; } catch (e) { /* 이미 끝난 애니 */ } });
            // rAF **한 번**만 — 두 번 돌리면 addAnim 이 가상 한 걸음(100ms)당 두 걸음 나가서
            // 연출이 벽시계보다 2배 빨리 흐른다(첫 시도에서 적 소멸이 800ms 에 끝난 원인).
            await new Promise(r => requestAnimationFrame(() => r()));
            const cover = window.__v.cover;
            return {
                cover: cover && cover.isConnected ? +getComputedStyle(cover).opacity : null,
                enemyMeshes: Scene3D.enemyMap.size,
                oldLeft: window.__v.oldIds.filter(id => Scene3D.enemyMap.has(id)).length,
                phase: Combat.phase,
                logicEnemies: Combat.enemies.length,
            };
        }, t);
        const name = `t${String(t).padStart(4, '0')}.png`;
        await page.screenshot({ path: path.join(OUT, name) });
        rows.push({ t, name, ...info });
    }
    await browser.close();

    console.log('t(ms)  cover  적메시  옛적  논리적  phase        파일');
    for (const r of rows)
        console.log(String(r.t).padStart(5), String(r.cover === null ? '-' : r.cover.toFixed(2)).padStart(6),
            String(r.enemyMeshes).padStart(6), String(r.oldLeft).padStart(5), String(r.logicEnemies).padStart(7),
            '  ' + r.phase.padEnd(11), r.name);
    const ghost = rows.filter(r => r.oldLeft > 0 && (r.cover === null || r.cover < 0.6) && r.t > 900);
    console.log(ghost.length ? `\n🚨 옛 적이 보이는 프레임 ${ghost.length}장: ` + ghost.map(g => g.t + 'ms').join(', ')
        : '\n옛 적이 보이는 프레임 0장 (암전 이후 잔존 없음)');
    console.log('\n출력: ' + OUT + ' (' + rows.length + '장)');
    if (errs.length) console.log('페이지 에러 ' + errs.length + ': ' + errs.slice(0, 3).join(' | '));
})();
