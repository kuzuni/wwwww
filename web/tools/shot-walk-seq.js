// 걷기 사이클 연속 프레임 — 1930s 카툰 모션(스쿼시&스트레치·까딱임)을 눈으로 보기 위한 캡처.
//   POLISH.md 기준대로 **정지 화면이 아니라 연속 프레임**으로 타이밍·이징을 본다.
//
// 🚨 **2026-08-19 수리 — 그전까지 이 도구는 걷기가 아니라 '대기'를 찍고 있었다.**
//    비평가 2인이 독립적으로 "걷기 6프레임에서 다리가 1px도 안 움직인다"를 최우선 결함으로 올렸는데,
//    `probe-capture-fidelity.js` 로 재니 **클립 자체가 걷기가 아니었다**: 이 도구는 월드 스크롤을 끄려고
//    `Scene3D.walking = false` 로 두는데, `Scene3D.update` 는 그 상태에서 매 프레임
//    `heroPlay(['Idle'])` 를 부른다 → rAF 한 프레임이 끼어드는 순간 클립이 Idle 로 바뀌고,
//    그다음 `__poseAt(u)` 는 **Idle 을 u 위상으로** 포즈한다(실측: 포즈된 클립 dur 2.8 = Idle,
//    걷기는 0.66). 대기는 원래 거의 안 움직이므로 '다리가 안 움직인다'는 프레임이 저장됐다.
//    **처방(둘 다 필요)** ⓐ `Scene3D.heroPlay` 를 잠가 자동 전환을 막는다 ⓑ `Scene3D.update` 를 감싸
//    매 프레임 **핀 위상으로 되돌린 뒤 dt=0 으로** 돌린다 — 그러면 rAF 가 몇 번 끼어들든 화면은 그 위상이다.
//    ⚠️ update 를 통째로 얼리면 안 된다 — main.js 의 rAF 가 update 안에서 렌더까지 한다.
// 사용: node shot-walk-seq.js [프레임수(기본 6)]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = __dirname;
const N = +(process.argv[2] || 6);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 60000 });

    await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;   // 월드 스크롤은 끈다 — 클립은 _t 로 포즈되므로 걷기 모드가 필요 없다
        Scene3D.clearEnemies(); Combat.enemies = [];
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        const R = Scene3D.heroRig;
        R.play('Walking');
        R.update(0);
        Scene3D.heroG.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(R.root);
        const c = box.getCenter(new THREE.Vector3());
        const d = Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 1.15 + 0.3;
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(d)).add(new THREE.Vector3(0, d * 0.30, 0)), look: c.clone() };
        // ⓐ 자동 클립 전환 차단 — 이게 없으면 rAF 가 걷기를 Idle 로 갈아친다(머리말 참조)
        Scene3D.heroPlay = () => {};
        R.play('Walking');
        // ⓑ 핀 고정 — rAF 가 부르는 update 도 매번 같은 위상으로 되돌린 뒤 dt=0 으로 돈다
        const ORIG = Scene3D.update.bind(Scene3D);
        window.__pin = null;
        Scene3D.update = (dt) => {
            if (window.__pin != null) { R._t = R._clip.dur * window.__pin; ORIG(0); } else ORIG(dt);
            // update 는 매 프레임 `heroHpG.visible = !heroDead` 로 바를 되살린다 — 캡처에서 머리 위
            // 초록 바가 계속 찍히던 원인이다. 셋업의 visible=false 로는 못 막으므로 여기서 다시 끈다.
            if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        };
        window.__poseAt = (u) => { window.__pin = u; R._t = R._clip.dur * u; R.update(0); };
        window.__clipDur = () => R._clip.dur;
    });
    await page.waitForTimeout(600);

    const rect = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
    });
    for (let i = 0; i < N; i++) {
        const u = i / N;
        await page.evaluate((u) => window.__poseAt(u), u);
        await page.waitForTimeout(90);
        await page.evaluate((u) => window.__poseAt(u), u);   // 대기 중 rAF 가 한 번 흘렸을 수 있으니 다시 찍는다
        const name = `walk-seq-${String(Math.round(u * 100)).padStart(3, '0')}.png`;
        await page.screenshot({ path: OUT + '/' + name, clip: rect });
        // 🚨 클립 길이를 매 프레임 찍는다 — 이 값이 걷기(0.66)가 아니라 대기(2.8)면 위 수리가
        //    풀린 것이다(같은 사고가 두 번 나지 않게 도구가 스스로 자백하게 둔다).
        const dur = await page.evaluate(() => window.__clipDur());
        console.log(`saved ${name}  (clip dur ${dur}${Math.abs(dur - 0.66) > 0.01 ? '  🚨 걷기 클립이 아니다 — 대기가 찍히고 있다' : ''})`);
    }
    console.log(errors.length ? ('콘솔 에러 ' + errors.length + '건: ' + errors.slice(0, 3).join(' | ')) : '(no console errors)');
    await browser.close();
})();
