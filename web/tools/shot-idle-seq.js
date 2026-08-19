// 대기 사이클 연속 프레임 — 1930s 카툰 모션(스쿼시&스트레치·까딱임)을 눈으로 보기 위한 캡처.
//   POLISH.md 기준대로 **정지 화면이 아니라 연속 프레임**으로 타이밍·이징을 본다.
//   ⚠️ 헤드리스에서는 rAF 가 사실상 안 도므로 `heroRig._t` 를 직접 찍어 포즈를 먹인다(TODO 함정 ③).
//      매 프레임 `update(0)` 로 부르면 _t 가 안 흘러 표본이 정확히 그 시각이 된다.
// 사용: node shot-idle-seq.js [프레임수(기본 6)]
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
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
        const R = Scene3D.heroRig;
        R.play('Idle');
        R.update(0);
        Scene3D.heroG.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(R.root);
        const c = box.getCenter(new THREE.Vector3());
        const d = Math.max(...box.getSize(new THREE.Vector3()).toArray()) * 1.15 + 0.3;
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35);
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(d)).add(new THREE.Vector3(0, d * 0.30, 0)), look: c.clone() };
        // 🚨 rAF 가 _t 를 밀지 못하게 **핀 고정**(2026-08-19 — `shot-walk-seq.js` 와 같은 수리).
        //    종전처럼 찍기만 하면 스크린샷 직전에 rAF 가 `heroRig.update(dt)` 로 _t 를 밀어 다른 위상이
        //    저장된다. 대기는 진폭이 작아 눈에 잘 안 띄지만, '4프레임이 다 같아 보인다'의 일부는 이것이다.
        //    (걷기 쪽은 같은 함정이 **클립 자체를 Idle 로** 바꿔 놨다 — 그쪽 머리말 참조.)
        Scene3D.heroPlay = () => {};
        R.play('Idle');
        const ORIG = Scene3D.update.bind(Scene3D);
        window.__pin = null;
        Scene3D.update = (dt) => {
            if (window.__pin != null) { R._t = R._clip.dur * window.__pin; ORIG(0); } else ORIG(dt);
            // update 는 매 프레임 `heroHpG.visible = !heroDead` 로 바를 되살린다 — 캡처에서 머리 위
            // 초록 바가 계속 찍히던 원인이다. 셋업의 visible=false 로는 못 막으므로 여기서 다시 끈다.
            if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        };
        window.__poseAt = (u) => { window.__pin = u; R._t = R._clip.dur * u; R.update(0); };
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
        const name = `idle-seq-${String(Math.round(u * 100)).padStart(3, '0')}.png`;
        await page.screenshot({ path: OUT + '/' + name, clip: rect });
        console.log('saved ' + name);
    }
    console.log(errors.length ? ('콘솔 에러 ' + errors.length + '건: ' + errors.slice(0, 3).join(' | ')) : '(no console errors)');
    await browser.close();
})();
