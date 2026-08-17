// 영웅 근접 샷 — 정면 기준 궤도 카메라(getWorldDirection) + 캔버스 크롭 + 공격 슬로모 임팩트 동결
// 사용: node shot-hero.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html') + '';
const OUT = __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' }); // 검 장착(공격샷 스윙 판독) — 중세·레어로 발광 오브·에너지 링 없이 캐릭터 본체 품질만 판독
    await page.waitForFunction(() => typeof Scene3D !== "undefined" && Scene3D.heroG && typeof Combat !== "undefined", null, { timeout: 15000 });

    // 영웅 '정면' 기준 궤도 카메라 — 이전 절대 yaw 방식은 등짝만 찍혔음(비평가: "팔이 없다"의 실체)
    const fit = async (mult, orbit, hOff = 0.3) => page.evaluate(([mult, orbit, hOff]) => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D.heroG.updateMatrixWorld(true);
        const hpG = Scene3D.heroHpG; if (hpG) hpG.visible = false;
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const r = Math.max(size.x, size.y, size.z);
        const dist = r * mult + 0.3;
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd); // 영웅 로컬 +z(정면)의 월드 방향
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit); // 정면 기준 좌우 궤도각
        Scene3D.camLock = {
            pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * hOff, 0)),
            look: c.clone()
        };
    }, [mult, orbit, hOff]);

    const hideUI = () => page.evaluate(() => {
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
    });

    // 캔버스 영역만 크롭 — 검정 데드스페이스/디버그 탭바 제거 (비평가 4번 결함)
    const shot = async (file) => {
        const rect = await page.evaluate(() => {
            const cv = document.querySelector('canvas');
            const r = cv.getBoundingClientRect();
            return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
        });
        await page.screenshot({ path: OUT + '/' + file, clip: rect });
    };

    // 1) Idle 정면/측면 근접 (정면 3/4 + 반대쪽 3/4)
    await fit(1.15, 0.35); await page.waitForTimeout(600); await hideUI();
    await shot('hero-idle-front.png');
    await fit(1.15, -0.9); await page.waitForTimeout(300);
    await shot('hero-idle-side.png');

    // 2) 걷기 중간 프레임 — 전진 동결 + 클립 위상 고정(스트라이드 극점)
    // ❗fit()은 walking=false로 되돌리므로 여기선 쓰지 않는다 — 걷기 진입·회전 완료 후 동결하고 인라인 피팅
    await page.evaluate(() => { window.__wx = Scene3D.worldX; Scene3D.walking = true; });
    await page.waitForTimeout(350); // Walking 클립 전환+진행방향 회전 대기
    await page.evaluate(() => {
        Object.defineProperty(Scene3D, 'worldX', { get() { return window.__wx; }, set() {}, configurable: true });
        if (Scene3D.heroRig) { Scene3D.heroRig._speed = 0; Scene3D.heroRig._t = 0; } // t=0 = 발 교차 최대 극점
        // 동결 포즈 기준 측면 3/4 저앵글 — 정면은 흉갑·스커트가 보폭을 가림 (비평가 7번)
        Scene3D.heroG.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const dist = Math.max(size.x, size.y, size.z) * 1.3 + 0.3;
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.15);
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.2, 0)), look: c.clone() };
    });
    await page.waitForTimeout(120);
    await shot('hero-walk.png');
    await page.evaluate(() => {
        delete Scene3D.worldX; Scene3D.worldX = window.__wx;
        if (Scene3D.heroRig) Scene3D.heroRig._speed = 1;
        Scene3D.walking = false;
    });

    // 3) 공격 임팩트 동결 — 슬로모(트레일 리본 축적)로 스윙 후 t=0.5 임팩트 순간 정지
    await page.evaluate(() => {
        const e = { id: 999, x: Combat.MELEE_X, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e]; Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = []; m.g.position.y = 0; m.g.userData.landed = true;
        m.hpBg.visible = m.hpFg.visible = false; // 적 HP바 숨김 — 컷에서 '부유하는 청록 막대'로 오독됨 (비평가 2번의 실체)
    });
    await page.evaluate(() => {
        Scene3D.heroAttack(999);
        const R = Scene3D.heroRig;
        if (R) R._speed *= 0.5; // 슬로모 — 트레일 포인트(LIFE 0.18s)가 궤적 리본으로 쌓이게 (0.3은 리본이 짧아 스텁만 남음)
        for (const a of Scene3D.anims) { const k = a.t / a.dur; a.dur /= 0.5; a.t = k * a.dur; } // 돌진도 동율 슬로모
    });
    await page.waitForFunction(() => {
        const R = Scene3D.heroRig;
        return R && R._clip && R._t / R._clip.dur >= 0.5; // 내려치기 임팩트 직후 — 팔로스루 직전이 날 판독 최적
    }, null, { timeout: 8000, polling: 30 });
    await page.evaluate(() => {
        const R = Scene3D.heroRig; R._speed = 0; // 임팩트 프레임 동결
        Scene3D._origUpdateTrail = Scene3D.updateTrail;
        Scene3D.updateTrail = () => {}; // 트레일 에이징도 동결 — 안 멈추면 스크린샷 시점(수백 ms 뒤)에 리본이 전부 소멸 (비평가 6.4 6번 'VFX 전무'의 실체)
        for (const a of Scene3D.anims) { const k = Math.min(1, a.t / a.dur); a.dur = 1e9; a.t = k * 1e9; }
        // 동결된 포즈 기준으로 카메라 재피팅 — 돌진으로 이동한 위치/비틀린 몸통 반영, 적은 프레임에 유지
        Scene3D.heroG.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const dist = Math.max(size.x, size.y, size.z) * 1.7 + 0.3;
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.95); // 적 반대편 측면 궤도 확대 — 검·트레일이 머리 뒤에 숨지 않게 (비평가 6.4 6번)
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.3, 0)), look: c.clone() };
    });
    await page.waitForTimeout(150);
    await shot('hero-attack-mid.png');
    // 동결 해제 + 상태 복원 (이후 전신샷 오염 방지)
    await page.evaluate(() => {
        Scene3D.anims = [];
        if (Scene3D._origUpdateTrail) { Scene3D.updateTrail = Scene3D._origUpdateTrail; delete Scene3D._origUpdateTrail; }
        Scene3D._attacking = false; Scene3D._trailOn = false;
        Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D.heroG.position.x = Combat.HERO_X + Scene3D.worldX;
        Scene3D.heroG.position.y = 0; Scene3D.heroG.rotation.set(0, 0.55, 0);
        const R = Scene3D.heroRig; if (R) { R._speed = 1; Scene3D.heroPlay(['Idle']); }
    });
    await page.waitForTimeout(400);

    // 4) 전신 룩 (조금 멀리, 정면 3/4)
    await fit(1.5, 0.55); await page.waitForTimeout(400);
    await shot('hero-full.png');

    // 5) 손 근접 — 검 파지 주먹(엄지·너클·건틀릿) 디테일 검증 (인계 ⑹)
    await page.evaluate(() => {
        const R = Scene3D.heroRig;
        Scene3D.heroG.updateMatrixWorld(true);
        const p = new THREE.Vector3();
        R.handR.getWorldPosition(p);
        const c = new THREE.Vector3();
        Scene3D.heroG.getWorldPosition(c);
        // 몸 중심→손 방향(수평)으로 카메라를 빼서 주먹이 프레임 중앙에 오게 — 몸통이 프레임을 먹던 문제 재프레이밍
        const out = p.clone().sub(c); out.y = 0; out.normalize();
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const camPos = p.clone().add(out.multiplyScalar(0.42)).add(fwd.multiplyScalar(0.3)).add(new THREE.Vector3(0, 0.1, 0));
        Scene3D.camLock = { pos: camPos, look: p.clone().add(new THREE.Vector3(0, -0.02, 0)) };
    });
    await page.waitForTimeout(150);
    await shot('hero-hand.png');

    console.log('hero shots done' + (errors.length ? '  CONSOLE ERRORS: ' + errors.join(' | ') : '  (no console errors)'));
    await browser.close();
})();
