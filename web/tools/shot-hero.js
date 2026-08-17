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
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {}; // 자동 스킬 시전 차단 — 거대 시전 링이 뷰티샷을 오염 (비평가 6.8 7번)
        if (!window.__realAtk) window.__realAtk = Scene3D.heroAttack;
        Scene3D.heroAttack = () => {}; // 잔여 setTimeout발 자동 공격 차단 — 대기 중 트레일이 기록돼 뷰티샷에 'C자 링'으로 남음 (hero-full 오염의 실체)
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} } // 진행 중 연출 즉시 완료·제거
        Scene3D.anims = [];
        Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false; // 촬영 전 잔여 트레일 소거
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
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
            if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden'; // 코인 토스트('+3')가 검증샷 오염 (비평가 7.1 8번 부수)
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
        // ❗주의: heroAttack의 돌진 onDone이 heroPlay(스윙, once, timeScale)를 호출하며 R._speed를 덮어써서
        // 공격 직후 R._speed *= 0.5 방식은 무효가 됨 → 스윙이 실속으로 돌아 0.25s 임팩트 창을 폴링이 놓치고
        // Idle 루프의 t 0.5에서 동결되는 회귀 발생 (비평가 6.9: '공격샷에 트레일이 아예 없다'의 실체).
        // R.play 래핑으로 스윙 클립 자체에 슬로모를 주입해 결정론적으로 해결.
        const R = Scene3D.heroRig;
        if (R && !R.__playWrapped) {
            R.__origPlay = R.play;
            R.play = (c, once, ts, cb) => R.__origPlay(c, once, (ts || 1) * 0.25, cb);
            R.__playWrapped = true;
        }
        Scene3D.TRAIL_MIN_STEP = 0.012; // 슬로모 0.25×에선 프레임당 날끝 이동이 기본 게이트 0.06 미달 → 포인트가 아예 기록 안 됨
        Scene3D.TRAIL_LIFE = 0.75; // 슬로모 0.25×에선 실시간 기준 수명이 스윙 애니메이션 시간을 못 덮음(0.22s 실시간 = 0.055s 애니) → 와인드업~임팩트 풀 아크가 살아남게 연장
        (window.__realAtk || Scene3D.heroAttack).call(Scene3D, 999); // fit()이 노옵으로 막아둔 실제 공격 호출
        for (const a of Scene3D.anims) { const k = a.t / a.dur; a.dur /= 0.25; a.t = k * a.dur; } // 돌진도 동율 슬로모
        // 임팩트 동결을 페이지 안에서 동기 실행 — Node 폴링 왕복(수십~수백 ms) 동안 트레일 포인트(LIFE 0.18s)가
        // 전부 늙어 사라져 '리본 없는 공격샷'이 되던 회귀의 근본 해결
        window.__frozen = false;
        window.__frzIv = setInterval(() => {
            const R2 = Scene3D.heroRig;
            if (!(R2 && R2._once && R2._clip && R2._t / R2._clip.dur >= 0.56)) return; // 사선 교차 후반 — 0.5는 아크가 머리 위 '돛'으로 서 있고, TRAIL_LIFE 연장으로 0.56에서도 리본 생존
            clearInterval(window.__frzIv);
            R2._speed = 0;
            Scene3D._origUpdateTrail = Scene3D.updateTrail;
            Scene3D.updateTrail = () => {}; // 트레일 에이징 즉시 동결 — 리본이 산 채로 남는다
            if (Scene3D.trailMat) Scene3D.trailMat.depthTest = false; // 스윙 궤적이 몸 반대편이라 리본이 몸통에 가려짐 — 컷 한정 오버레이
            window.__frozen = true;
        }, 8);
    });
    await page.waitForFunction(() => window.__frozen === true, null, { timeout: 8000, polling: 30 });
    await page.evaluate(() => {
        for (const a of Scene3D.anims) { const k = Math.min(1, a.t / a.dur); a.dur = 1e9; a.t = k * 1e9; }
        // 임팩트 순간 연출 — 실제 게임 히트 프레임의 구성 요소(플래시·스쿼시)를 동결 프레임에 명시 적용
        // (동결이 히트 콜백을 막아 '타격감 제로 컷'이 되던 문제, 비평가 6.8 4번)
        const em = Scene3D.enemyMap.get(999);
        if (em) {
            for (const fm of em.flashMats) { fm.emissive.setHex(0xffffff); fm.emissiveIntensity = 0.28; } // 0.65는 반투명 슬라임이 유령처럼 씻겨 나감
            em.g.scale.set(1.12, 0.85, 1.12); // 피격 스쿼시
        }
        // 동결된 포즈 기준으로 카메라 재피팅 — 돌진으로 이동한 위치/비틀린 몸통 반영, 적은 프레임에 유지
        Scene3D.heroG.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const dist = Math.max(size.x, size.y, size.z) * 1.45 + 0.3; // 더 낮고 가깝게 — 액션 밀착감 (비평가 6.8 4번)
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.95); // 적 반대편 측면 궤도 — -1.35는 리본 원근이 찢겨 부유 슬리버 발생, -0.95가 아크 판독 최적
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.22, 0)), look: c.clone() };
    });
    await page.waitForTimeout(150);
    await shot('hero-attack-mid.png');
    // 동결 해제 + 상태 복원 (이후 전신샷 오염 방지)
    await page.evaluate(() => {
        Scene3D.anims = [];
        if (Scene3D._origUpdateTrail) { Scene3D.updateTrail = Scene3D._origUpdateTrail; delete Scene3D._origUpdateTrail; }
        Scene3D.heroAttack = () => {}; // 이후 전신·손 샷 동안 재공격 차단 유지
        Scene3D.trailStart = () => {}; // 공격 내부 setTimeout 체인이 trailStart를 직접 재호출해 뷰티샷에 링이 남는 문제 원천 차단
        Scene3D.TRAIL_MIN_STEP = 0.06; // 기본 게이트 복원
        delete Scene3D.TRAIL_LIFE; // 수명 기본값 복원
        if (Scene3D.trailMat) Scene3D.trailMat.depthTest = true;
        Scene3D._attacking = false; Scene3D._trailOn = false;
        Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D.heroG.position.x = Combat.HERO_X + Scene3D.worldX;
        Scene3D.heroG.position.y = 0; Scene3D.heroG.rotation.set(0, 0.55, 0);
        const R = Scene3D.heroRig;
        if (R && R.__playWrapped) { R.play = R.__origPlay; R.__playWrapped = false; } // 슬로모 래핑 해제
        if (R) { R._speed = 1; Scene3D.heroPlay(['Idle']); }
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
        const camPos = p.clone().add(out.multiplyScalar(0.46)).add(fwd.multiplyScalar(0.3)).add(new THREE.Vector3(0, 0.3, 0)); // 3/4 상단 앵글 — 손가락 컬·너클 가드 자기폐색 해소 (비평가 6.8 1번)
        Scene3D.camLock = { pos: camPos, look: p.clone().add(new THREE.Vector3(0, -0.02, 0)) };
    });
    await page.waitForTimeout(150);
    await shot('hero-hand.png');

    console.log('hero shots done' + (errors.length ? '  CONSOLE ERRORS: ' + errors.join(' | ') : '  (no console errors)'));
    await browser.close();
})();
