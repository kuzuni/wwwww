// 펫 칸 제한 해제 + 탈것 무리 렌더 — 실게임(브라우저) 검증. TODO `pet-mount-slot-unlimited`.
// ⚠️ **탈것 '장착'은 2026-08-18 사용자 지시(`mount-single-equip`)로 1마리로 되돌아갔다.**
//    그래서 이 프로브의 탈것 파트는 `Mounts.equip` 을 쓰지 않고 `S.activeMounts` 를 **직접 세워서**
//    여러 마리가 들어왔을 때의 **자리 배치·추종 렌더**만 본다(4번째 펫에서 죽던 `spots[i]` 회귀 그물).
//    장착 규칙 자체는 `probe-mount-single.js`/`test-slot-unlimited.js` 가 따로 못박는다.
// 사용: node tools/probe-slot-unlimited.js
//
// tools/test-slot-unlimited.js 가 순수 로직·기하를 재는 반면, 여기서는 **실제로 페이지를 띄워**
// ① 콘솔 에러 없이 부팅하는가 ② 펫 12마리·탈것 8마리를 장착하면 그만큼 장면에 서는가
// ③ 서로 겹치지 않고 화면 안에 들어오는가 ④ 탑승이 그대로 성립하는가(rideY·riding)
// ⑤ 따라오는 탈것이 영웅 전진을 따라오는가 를 확인한다.
//
// ⚠️ 예전 자리 배열은 3칸 하드코딩이라 4번째 펫에서 `spots[i]`가 undefined → TypeError로 죽었다.
//    그 회귀를 잡는 게 이 프로브의 첫 번째 목적이므로, 콘솔 에러 0건은 통과 조건에 포함된다.
// 종료 코드: 0=PASS, 1=FAIL
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const out = await page.evaluate(() => {
        // 논리 틱을 멈추고 프레임을 손으로 돌린다 — 이 환경은 rAF가 초 단위로 튀어서
        // 실시간에 기대면 표본이 통째로 빠진다(다른 프로브들이 실측으로 밟은 함정).
        Combat.tick = () => { };
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = sec => { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) real(1 / 120); };
        Scene3D.clearEnemies(); Combat.enemies = []; Combat.phase = 'walk';

        const petPool = Object.keys(PET_ICONS);
        const mountPool = Object.keys(MOUNT_KR).length ? Object.keys(MOUNT_KR) : Object.values(mountNames).flat();

        const setPets = n => {
            S.pets = petPool.slice(0, n).map(nm => ({ name: nm, rarity: 'epic', level: 1, dupes: 0, xp: 0, subs: [] }));
            S.activePets = [];
            for (let i = 0; i < S.pets.length; i++) S.activePets.push(i);
            Scene3D.refreshPets();
            return S.activePets.length;
        };
        const setMounts = n => {
            S.mounts = {};
            const names = mountPool.slice(0, n);
            for (const nm of names) S.mounts[nm] = { rarity: 'epic', level: 1, dupes: 0, stars: 0, xp: 0, subs: [] };
            S.activeMounts = names.slice();
            Scene3D.refreshMount();
            return names;
        };

        // 화면 좌표(0~1). 뷰포트 밖이면 null.
        const screenOf = g => {
            const box = new THREE.Box3().setFromObject(g);
            if (box.isEmpty()) return null;
            const c = box.getCenter(new THREE.Vector3()).project(Scene3D.camera);
            return { x: +((c.x + 1) / 2).toFixed(3), y: +((1 - c.y) / 2).toFixed(3), z: +c.z.toFixed(3) };
        };
        const minPairGap = groups => {
            let m = Infinity;
            for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
                const a = groups[i].position, b = groups[j].position;
                m = Math.min(m, Math.hypot(a.x - b.x, a.z - b.z));
            }
            return groups.length < 2 ? Infinity : +m.toFixed(3);
        };

        const r = {};

        // ── 펫 12마리 ───────────────────────────────────────────────────────
        setMounts(0);
        r.petAsked = setPets(12);
        step(0.6);
        r.petGroups = Scene3D.petGroups.length;
        r.petGap = minPairGap(Scene3D.petGroups);
        r.petFinite = Scene3D.petGroups.every(g => isFinite(g.position.x) && isFinite(g.position.y) && isFinite(g.position.z));
        r.petScreens = Scene3D.petGroups.map(screenOf);
        r.petOnScreen = r.petScreens.filter(s => s && s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1).length;

        // ── 탈것 8마리(1마리 탑승 + 7마리 무리) ─────────────────────────────
        const mountNamesUsed = setMounts(8);
        step(0.6);
        r.mountAsked = mountNamesUsed.length;
        r.ridden = Mounts.ridden();
        r.hasMountGroup = !!Scene3D.mountGroup;
        r.followers = Scene3D.mountFollowers.length;
        r.riding = !!Scene3D.riding;
        r.rideY = +(Scene3D.rideY || 0).toFixed(3);
        r.heroY = +Scene3D.heroG.position.y.toFixed(3);
        r.followerGap = minPairGap(Scene3D.mountFollowers);
        r.followerFinite = Scene3D.mountFollowers.every(g => isFinite(g.position.x) && isFinite(g.position.y) && isFinite(g.position.z));
        r.followerScreens = Scene3D.mountFollowers.map(screenOf);
        r.followerOnScreen = r.followerScreens.filter(s => s && s.x > 0 && s.x < 1 && s.y > 0 && s.y < 1).length;
        // 무리는 영웅 뒤(z<0)에 서야 전투선·앞줄 펫을 안 가린다
        r.followersBehind = Scene3D.mountFollowers.every(g => g.position.z < 0);

        // 펫 + 탈것 무리를 같이 켠 상태에서 서로 안 겹치는지
        setPets(12); step(0.4);
        r.mixedGap = minPairGap([...Scene3D.petGroups, ...Scene3D.mountFollowers]);
        r.mixedCount = Scene3D.petGroups.length + Scene3D.mountFollowers.length + (Scene3D.mountGroup ? 1 : 0);

        // ── 전진 추종: 무리가 영웅을 따라오는가 ─────────────────────────────
        const wx0 = Scene3D.worldX;
        const f0 = Scene3D.mountFollowers.map(g => g.position.x);
        const p0 = Scene3D.petGroups.map(g => g.position.x);
        Scene3D.walking = true; step(1.2); Scene3D.walking = false;
        r.worldMoved = +(Scene3D.worldX - wx0).toFixed(3);
        r.followerDrift = Scene3D.mountFollowers.map((g, i) => +(g.position.x - f0[i]).toFixed(3));
        r.petDrift = Scene3D.petGroups.map((g, i) => +(g.position.x - p0[i]).toFixed(3));

        // ── 타는 탈것 교체 ──────────────────────────────────────────────────
        const second = S.activeMounts[1];
        Mounts.setRidden(second);
        step(0.4);
        r.swapTarget = second;
        r.swapRidden = Mounts.ridden();
        r.swapFollowers = Scene3D.mountFollowers.length;
        r.swapActiveCount = S.activeMounts.length;
        r.swapRiding = !!Scene3D.riding && Scene3D.riding.name === second;

        // ── 전부 해제 ───────────────────────────────────────────────────────
        S.activeMounts = []; Scene3D.refreshMount(); step(0.3);
        r.clearedFollowers = Scene3D.mountFollowers.length;
        r.clearedMountGroup = !!Scene3D.mountGroup;
        r.clearedHeroY = +Scene3D.heroG.position.y.toFixed(3);

        // ── 구 API 호환(검증 스크립트 12개가 쓰는 경로) ─────────────────────
        S.activeMount = mountNamesUsed[0]; Scene3D.refreshMount(); step(0.3);
        r.compatRidden = Mounts.ridden();
        r.compatMountGroup = !!Scene3D.mountGroup;
        r.compatFollowers = Scene3D.mountFollowers.length;

        return r;
    });

    console.log('■ 부팅·에러');
    check('콘솔/페이지 에러 0건 (4번째 개체에서 죽던 회귀)', errors.length === 0, errors.slice(0, 5));

    console.log('■ 펫 12마리 출전');
    check('요청 12마리가 전부 출전 상태', out.petAsked === 12, out.petAsked);
    check('장면에 12개 펫 그룹이 선다 (예전 상한 3)', out.petGroups === 12, out.petGroups);
    check('좌표에 NaN 없음', out.petFinite === true);
    check(`서로 겹치지 않는다 (최소 간격 ${out.petGap})`, out.petGap >= 0.6, out.petGap);
    check(`화면 안에 들어온 펫 ${out.petOnScreen}/12 (과반 이상)`, out.petOnScreen >= 7, out.petScreens);

    console.log('■ 탈것 8마리 장착 (1 탑승 + 7 무리)');
    check('8마리 전부 장착', out.mountAsked === 8);
    check('탑승 그룹 1개 생성', out.hasMountGroup === true);
    check('따라오는 무리 7마리', out.followers === 7, out.followers);
    check('탑승 상태 유지(riding)', out.riding === true);
    check(`영웅이 안장 높이로 올라가 있다 (rideY ${out.rideY})`, out.rideY > 0.05, out.rideY);
    check('영웅 y가 rideY에 스냅', Math.abs(out.heroY - out.rideY) < 0.2, [out.heroY, out.rideY]);
    check('무리 좌표에 NaN 없음', out.followerFinite === true);
    check(`무리끼리 안 겹친다 (최소 간격 ${out.followerGap})`, out.followerGap >= 0.85, out.followerGap);
    check('무리는 전부 영웅 뒤(z<0)에 선다', out.followersBehind === true);
    check(`화면 안에 들어온 무리 ${out.followerOnScreen}/7 (최소 3)`, out.followerOnScreen >= 3, out.followerScreens);

    console.log('■ 펫 12 + 탈것 8 동시');
    check(`총 ${out.mixedCount}개 개체가 동시에 선다`, out.mixedCount === 20, out.mixedCount);
    check(`펫 자리와 탈것 자리가 안 섞인다 (최소 간격 ${out.mixedGap})`, out.mixedGap >= 0.6, out.mixedGap);

    console.log('■ 전진 추종');
    // 자리는 `HERO_X + spotX + worldX`라, 잘 따라오면 개체 x가 worldX와 **같은 만큼** 늘어야 한다.
    // (초기 구현에서 이 검사를 "이동량 ≈ 0"으로 잘못 썼다 — 따라오는 걸 이탈로 읽는 검사였다.
    //  기준은 영웅과의 상대 거리가 유지되는가지, 절대 x가 안 움직이는가가 아니다.)
    check(`영웅이 전진했다 (worldX +${out.worldMoved})`, out.worldMoved > 0.3, out.worldMoved);
    check('무리가 영웅 전진을 그대로 따라온다(상대 간격 유지)',
        out.followerDrift.every(d => Math.abs(d - out.worldMoved) < 0.2), [out.worldMoved, out.followerDrift]);
    // 펫은 종별 몸짓(스커틀·미끄러짐)으로 ±0.06 정도 x 흔들림이 얹힌다 — 그만큼 여유를 준다
    check('펫도 마찬가지(종별 몸짓 흔들림 ±0.1 허용)',
        out.petDrift.every(d => Math.abs(d - out.worldMoved) < 0.1), [out.worldMoved, out.petDrift]);

    console.log('■ 타는 탈것 교체');
    check('setRidden이 탑승 대상을 바꾼다', out.swapRidden === out.swapTarget, [out.swapRidden, out.swapTarget]);
    check('3D 탑승도 그 탈것으로 바뀐다', out.swapRiding === true);
    // `setRidden` 은 단일 슬롯 교체다(`mount-single-equip`) — 교체하면 그 1마리만 남고 무리는 사라진다.
    check('교체하면 장착은 그 1마리', out.swapActiveCount === 1, out.swapActiveCount);
    check('교체 후 무리는 0마리(단일 슬롯)', out.swapFollowers === 0, out.swapFollowers);

    console.log('■ 전부 해제 / 구 API 호환');
    check('해제하면 무리가 사라진다', out.clearedFollowers === 0, out.clearedFollowers);
    check('해제하면 탑승 그룹도 사라진다', out.clearedMountGroup === false);
    check('해제하면 영웅이 지면으로 복귀', Math.abs(out.clearedHeroY) < 0.05, out.clearedHeroY);
    check('구 API(S.activeMount = 이름)로도 탑승한다', out.compatRidden && out.compatMountGroup === true, [out.compatRidden, out.compatMountGroup]);
    check('구 API는 1마리만 장착 → 무리 0', out.compatFollowers === 0, out.compatFollowers);

    console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
    console.log(errors.length ? errors.join('\n') : '(no console errors)');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
