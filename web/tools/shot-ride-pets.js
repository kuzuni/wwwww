// 탈것 탑승(4계열) + 펫 배치 검증 촬영 — TODO '탈것 탑승'·'펫 배치' 항목의 비평가 판정용.
// 사용: node shot-ride-pets.js [outDir]
// ⚠️ 촬영기 주의 두 가지:
//  ① 카메라는 **영웅 기준 상대 좌표**로 놓을 것 — 월드 원점 기준 상수로 두면 worldX(행군 오프셋) 때문에
//     프레임이 통째로 빗나가 빈 초원만 찍힌다(첫 시도에서 side 샷 4장을 그렇게 날렸다).
//  ② 대기/배치 샷은 `Combat.enemies`를 비우고 찍는다 — 로드 직후 적이 교전선에 붙어 있으면
//     탑승 정합을 볼 때 적 실루엣이 영웅과 겹쳐 판독을 방해한다.
// 렌더는 수동 스텝(Combat.tick 무력화 + __step)으로 동결해 계열별로 같은 포즈 시각에서 비교한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || __dirname;

// 계열 대표 4종 (Scene3D.MOUNT_FORM_OF 기준: flat/wheeled/fly/quad)
const MOUNTS = [
    ['flat', 'Hover Board'],
    ['wheeled', 'Bike'],
    ['fly', 'Mini Dragon'],
    ['quad', 'Brown Horse'],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.__t = 0;
        Scene3D.update = () => { };
        window.__step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { Scene3D.__t += 1 / 120; real(1 / 120); }
        };
        window.__clearEnemies = () => { Scene3D.clearEnemies(); Combat.enemies = []; Combat.phase = 'walk'; };
        window.__setMount = (name) => {
            S.mounts = {}; S.mounts[name] = { rarity: 'epic', count: 1, level: 1 };
            S.activeMount = name;
            Scene3D.refreshMount();
        };
        window.__clearMount = () => { S.activeMount = null; Scene3D.refreshMount(); };
        window.__setPets = (n) => {
            const names = Object.keys(PET_ICONS).slice(0, 3);
            S.pets = names.map(nm => ({ name: nm, rarity: 'epic', level: 1, dupes: 0 }));
            S.activePets = [];
            for (let i = 0; i < n; i++) S.activePets.push(i);
            Scene3D.refreshPets();
        };
        window.__walk = (on) => { Scene3D.walking = !!on; };
        window.__attack = () => {
            Scene3D.clearEnemies();
            const e = { id: 951, x: Combat.MELEE_X, alive: true, hp: Big.of(1e6), maxHp: Big.of(1e6), isBoss: false, kind: 'goblin' };
            Combat.enemies = [e];
            Scene3D.spawnEnemy(e);
            for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) { } }
            Scene3D.anims = [];
            const m = Scene3D.enemyMap.get(951);
            m.g.position.set(e.x + Scene3D.worldX, 0, 0);
            m.g.userData.landed = true;
            Combat.phase = 'fight';
            Scene3D.heroAttack(951);
        };
        // 영웅 기준 상대 배치 — yaw(도), 거리, 높이, 바라보는 높이.
        // ⚠️ camera.position을 직접 쓰면 소용없다 — update()가 매 프레임 `0.15 + worldX`로 덮어쓴다.
        //    엔진이 검증 스크립트용으로 열어 둔 `Scene3D.camLock` 훅을 써야 고정된다(scene3d.js:5235).
        // camY/lookY는 **영웅 발 높이 기준 상대값** — 비행형은 영웅이 공중에 뜨므로 절대 높이로 두면
        // 머리가 프레임 위로 잘려 나간다(계열 비교가 성립하지 않는다).
        // x도 영웅의 **실제 위치**를 쓴다 — 공격은 앞으로 돌진하므로 HERO_X로 고정하면 프레임 밖으로 나간다.
        window.__camera = (yawDeg, dist, camY, lookY) => {
            const hx = Scene3D.heroG ? Scene3D.heroG.position.x : Combat.HERO_X + Scene3D.worldX;
            const hy = Scene3D.heroG ? Scene3D.heroG.position.y : 0;
            const a = yawDeg * Math.PI / 180;
            Scene3D.camLock = {
                pos: new THREE.Vector3(hx + Math.sin(a) * dist, hy + camY, Math.cos(a) * dist),
                look: new THREE.Vector3(hx, hy + lookY, 0),
            };
        };
        window.__camDefault = () => { Scene3D.camLock = null; };
        window.__reset = () => { __clearEnemies(); __clearMount(); __setPets(0); __walk(false); };
        __reset();
        __step(0.5);
    });

    // 3D 뷰포트만 잘라 찍는다 — 하단 장비 시트/탭바는 이 항목 판정과 무관
    const clip = await page.evaluate(() => {
        const r = document.getElementById('game-area').getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
    const shot = async (name) => {
        await page.screenshot({ path: path.join(OUT, name + '.png'), clip, timeout: 60000 });
        console.log('shot ' + name);
    };

    // ── 1) 탈것 4계열 × (기본 3/4 근접 / 측면 / 걷기 / 공격) ──
    for (const [form, name] of MOUNTS) {
        await page.evaluate((n) => { __reset(); __setMount(n); __camera(0, 3.4, 1.7, 0.95); __step(0.9); }, name);
        await shot(`ride-${form}-near`);
        await page.evaluate(() => { __camera(-78, 3.2, 1.35, 0.9); __step(0.05); });
        await shot(`ride-${form}-side`);
        await page.evaluate(() => { __camera(0, 3.4, 1.7, 0.95); __walk(true); __step(0.62); });
        await shot(`ride-${form}-walk`);
        // 돌진이 끝난 자리에서 카메라를 다시 물린다 — 안 그러면 영웅이 프레임 밖으로 나간 컷이 남는다
        await page.evaluate(() => { __walk(false); __attack(); __step(0.22); __camera(0, 3.4, 1.7, 0.95); __step(1 / 120); });
        await shot(`ride-${form}-attack`);
    }

    // ── 2) 펫 배치: 1마리 / 3마리 / 3마리+탈것 / 3마리 걷기 (게임 기본 카메라로) ──
    await page.evaluate(() => { __reset(); __camDefault(); __setPets(1); __step(0.9); });
    await shot('pets-1');
    await page.evaluate(() => { __setPets(3); __step(0.9); });
    await shot('pets-3');
    await page.evaluate(() => { __setMount('Brown Horse'); __step(0.9); });
    await shot('pets-3-mount');
    await page.evaluate(() => { __walk(true); __step(0.62); });
    await shot('pets-3-walk');

    // ── 3) 게임 기본 카메라로 4계열 — 실제 플레이 화면에서 프레임에 온전히 들어오는지 ──
    for (const [form, name] of MOUNTS) {
        await page.evaluate((n) => { __reset(); __camDefault(); __setMount(n); __step(0.9); }, name);
        await shot(`ingame-${form}`);
    }

    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(no console errors)');
    await browser.close();
})();
