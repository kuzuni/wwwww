// 적 보행 사이클 연속 프레임 — 1930s 카툰 모션(착지 스쿼시·체공 스트레치·접지 홀드)을 눈으로 본다.
//   POLISH.md 기준대로 **정지 화면이 아니라 연속 프레임**으로 타이밍·이징을 평가한다.
//   ⚠️ 헤드리스에서는 rAF 가 사실상 안 돈다(TODO 함정 ③) — `Scene3D._clock` 을 직접 찍고
//      `Scene3D.update(0)` 로 포즈만 먹인다(dt=0 이라 위치 lerp·펀치가 안 흘러 표본이 정확히 그 시각이다).
// 사용: node shot-enemy-seq.js <kind> [프레임수(기본 8)]      예: node shot-enemy-seq.js imp 8
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = __dirname;
const KIND = process.argv[2] || 'imp';
const N = +(process.argv[3] || 8);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const period = await page.evaluate((kind) => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        Scene3D.walking = false;
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
        Scene3D.petGroups.forEach(p => p.visible = false);
        Scene3D.clearEnemies();
        // 걷는 상태로 세운다 — 정지 위치(stopXOf)보다 앞이어야 보행 분기로 간다.
        const e = { id: 999, x: Combat.MELEE_X + 1.4, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.userData.landed = true; m._scaleLocked = false; m.punchT = 0;
        m.g.position.x = e.x + Scene3D.worldX;
        if (kind === 'wolf') m.g.rotation.y = -1.15;
        m.g.updateMatrixWorld(true);
        for (const o of [...Scene3D.trees, ...Scene3D.rocks]) {
            if (Math.abs(o.position.x - m.g.position.x) < 4.5 && o.position.z > -6) o.visible = false;
            o.traverse(mm => { if (mm.isMesh) mm.castShadow = false; });
        }
        const hpG = m.g.children.find(c => c.children && c.children.some(cc => cc.geometry && cc.geometry.type === 'PlaneGeometry'));
        if (hpG) hpG.visible = false;
        if (m.hpG) m.hpG.visible = false;
        // 프레이밍 — 스쿼시 정점에서 몸이 커지므로 여유를 더 준다(잘리면 타이밍 판독이 안 된다).
        const box = new THREE.Box3().setFromObject(m.g);
        const c = box.getCenter(new THREE.Vector3());
        const r = Math.max(...box.getSize(new THREE.Vector3()).toArray());
        const dist = r * 2.05 + 0.45;
        Scene3D.camLock = {
            pos: new THREE.Vector3(c.x - dist * 0.55, c.y + dist * 0.30, c.z + dist * 0.95),
            look: new THREE.Vector3(c.x, Math.max(0.05, c.y * 0.86), c.z),   // 접지선이 프레임에 들어와야 홀드가 읽힌다
        };
        const G = Scene3D.gaitOf(m.anim && m.anim.kind, false);
        window.__poseAt = (t) => { Scene3D._clock = t; Scene3D.update(0); };
        return 2 * Math.PI / G.rate;   // 한 보행 사이클(홉 2회)
    }, KIND);
    await page.evaluate(() => {
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
    });
    await page.waitForTimeout(600);

    const rect = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
    });
    for (let i = 0; i < N; i++) {
        const u = i / N;
        await page.evaluate((t) => window.__poseAt(t), period * u);
        await page.waitForTimeout(80);
        await page.evaluate((t) => window.__poseAt(t), period * u);  // 대기 중 rAF 가 한 번 흘렸을 수 있으니 다시 찍는다
        const name = `enemyseq-${KIND}-${String(Math.round(u * 100)).padStart(3, '0')}.png`;
        await page.screenshot({ path: OUT + '/' + name, clip: rect });
        console.log('saved ' + name);
    }
    console.log(errors.length ? ('콘솔 에러 ' + errors.length + '건: ' + errors.slice(0, 3).join(' | ')) : '(no console errors)');
    await browser.close();
})();
