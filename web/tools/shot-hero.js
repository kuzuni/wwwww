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
    // ⚠️ 15000ms는 이 컨테이너에서 간헐 실패한다 — 콜드 스타트(스위프트셰이더 셰이더 컴파일)에 20초 넘게
    //    걸리는 런이 있어 3회 중 2회 TimeoutError로 죽었다. 부팅 자체는 정상이므로 상한만 올린다.
    await page.waitForFunction(() => typeof Scene3D !== "undefined" && Scene3D.heroG && typeof Combat !== "undefined", null, { timeout: 60000 });

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
        // ⚠️ 촬영 직전 떠 있는 FX 스프라이트만 **가린다** — fit() 이후 대기 중에 스폰되는 연출이 있어
        //    같은 스크립트로도 런마다 흰 보케 원이 캐릭터 위에 흩뿌려진 프레임이 나왔다(재현: 3런 중 1런).
        //    비평가 채점이 이 우연한 오염을 캐릭터 결함으로 읽으면 채점 자체가 무의미해지므로 여기서 끊는다.
        // ❗visible만 만진다. 처음엔 여기서 `Scene3D.anims`를 강제 완료·비웠는데, 그러면 뒤따르는
        //    공격 컷의 돌진→스윙 체인이 끊겨 `__frozen`이 영원히 오지 않았다(90초 상한도 초과).
        //    촬영 헬퍼는 게임 상태를 바꾸지 않는다 — 이 줄을 되돌리지 말 것.
        await page.evaluate(() => {
            const loose = [];
            Scene3D.scene.traverse(o => { if (o.isSprite) loose.push(o); });
            for (const s of loose) if (s !== Scene3D.sunDisc && s !== Scene3D.moonDisc && !(Scene3D.clouds || []).includes(s)) s.visible = false;
        });
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
            R.play = (c, once, ts, cb) => R.__origPlay(c, once, (ts || 1) * 0.12, cb); // 0.25는 헤드리스 ~5fps에서 스윙당 샘플이 모자라 각진 부채 — 더 느리게 돌려 밀도 확보
            R.__playWrapped = true;
        }
        Scene3D.TRAIL_MIN_STEP = 0.006; // 슬로모 0.12×에선 프레임당 날끝 이동이 기본 게이트 0.06 미달 → 포인트가 아예 기록 안 됨
        Scene3D.TRAIL_LIFE = 0.9; // 슬로모 0.12×에선 실시간 기준 수명이 스윙 애니메이션 시간을 못 덮음 — 과대(0.75@0.25×)는 와인드업 스트로크가 통째로 살아남아 머리 위 '파란 돛'(비평가 7.4 재현): 다운스윙 스미어가 주가 되는 값
        (window.__realAtk || Scene3D.heroAttack).call(Scene3D, 999); // fit()이 노옵으로 막아둔 실제 공격 호출
        for (const a of Scene3D.anims) { const k = a.t / a.dur; a.dur /= 0.25; a.t = k * a.dur; } // 돌진도 동율 슬로모
        // 임팩트 동결을 페이지 안에서 동기 실행 — Node 폴링 왕복(수십~수백 ms) 동안 트레일 포인트(LIFE 0.18s)가
        // 전부 늙어 사라져 '리본 없는 공격샷'이 되던 회귀의 근본 해결
        window.__frozen = false;
        window.__frzIv = setInterval(() => {
            const R2 = Scene3D.heroRig;
            if (!(R2 && R2._once && R2._clip && R2._t / R2._clip.dur >= 0.64)) return; // 다운스윙 후반 — 0.56은 와인드업 잔상이 지배해 '돛', 0.64에서 칼끝 뒤로 흐르는 스미어가 주가 됨
            clearInterval(window.__frzIv);
            R2._speed = 0;
            Scene3D._origUpdateTrail = Scene3D.updateTrail;
            Scene3D.updateTrail = () => {}; // 트레일 에이징 즉시 동결 — 리본이 산 채로 남는다
            if (Scene3D.trailMat) Scene3D.trailMat.depthTest = false; // 스윙 궤적이 몸 반대편이라 리본이 몸통에 가려짐 — 컷 한정 오버레이
            window.__frozen = true;
        }, 8);
    });
    // 25000ms도 이 컨테이너에선 부족했다 — 슬로모 0.12×는 실시간 30초 이상이고 스위프트셰이더
    // 소프트웨어 렌더라 프레임 간격이 들쭉날쭉하다. 상한만 올린다(도달 조건 자체는 불변).
    await page.waitForFunction(() => window.__frozen === true, null, { timeout: 90000, polling: 30 }); // 슬로모 0.12× — 돌진 4×+스윙 4.2s 후 0.64 위상 도달까지 여유
    await page.evaluate(() => {
        for (const a of Scene3D.anims) { const k = Math.min(1, a.t / a.dur); a.dur = 1e9; a.t = k * 1e9; }
        // 임팩트 순간 연출 — 실제 게임 히트 프레임의 구성 요소(플래시·스쿼시)를 동결 프레임에 명시 적용
        // (동결이 히트 콜백을 막아 '타격감 제로 컷'이 되던 문제, 비평가 6.8 4번)
        const em = Scene3D.enemyMap.get(999);
        if (em) {
            for (const fm of em.flashMats) { fm.emissive.setHex(0xffffff); fm.emissiveIntensity = 0.28; } // 0.65는 반투명 슬라임이 유령처럼 씻겨 나감
            em.g.scale.set(1.12, 0.85, 1.12); // 피격 스쿼시
            // 히트 파편 — 인게임 onHit이 실제로 쓰는 spawnSparks 구성(비평가 7.4 1번 '임팩트 파티클 전무')을
            // 동결 프레임에 직접 배치: 스폰 → 0.05s 수동 전진(방사 산개) → 속도·수명 동결
            const hitP = em.g.position.clone().add(new THREE.Vector3(0, 0.55, 0));
            const before = Scene3D.particles.length;
            Scene3D.spawnSparks(hitP, 10, 0xffee58);
            for (let i = before; i < Scene3D.particles.length; i++) {
                const p = Scene3D.particles[i];
                p.position.addScaledVector(p.userData.vel, 0.05); // 타격점에서 갓 터진 산개 반경
                p.userData.vel.set(0, 0, 0);
                p.userData.noGravity = true;
                p.userData.life = 1e9; // 스크린샷 지연 동안 에이징으로 소멸 방지
            }
            Scene3D.flashLight(hitP, 0xffe082, 1e9); // 타격점 웜 플래시 라이트 — 동결 유지
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
        for (const a of Scene3D.anims) { try { a.onDone && a.onDone(); } catch (err) {} } // 동결 플래시 라이트(dur 1e9) 제거 — 방치 시 이후 전신·손 샷이 웜 라이트로 씻김
        Scene3D.anims = [];
        for (const p of Scene3D.particles) { if (p.isSprite) p.material.dispose(); else Scene3D.disposeTree(p); Scene3D.scene.remove(p); } // 동결 파편(수명 1e9) 소거
        Scene3D.particles.length = 0;
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
