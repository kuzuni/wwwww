// 영웅 파츠 근접 샷 — 실루엣 꺾임을 육안 판독하기 위한 부위별 클로즈업.
// 전신샷(shot-hero.js)에서는 견갑이 40px·발이 25px 남짓이라 라메 밴드 경계, 발가락 테이퍼,
// 굽 블록 같은 '꺾임'이 통째로 뭉개진다 — 비평가 잔여 지적 ⓔ(견갑·목)·ⓖ(부츠) 판독 전용.
// 사용: node shot-part.js [shoulder|foot] [sil]   (기본 shoulder / sil = 평면 배경 실루엣 모드)
//
// ⚠️ shot-hero.js 의 공격 컷(슬로모 90초 대기)은 이 컨테이너에서 상시 타임아웃이라 여기선 아예 안 찍는다
//    — 이 스크립트는 정지 포즈 3각(정면/45°/측면) 근접만 찍고 끝낸다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = __dirname;
const PART = process.argv[2] === 'foot' ? 'foot' : 'shoulder';
// 실루엣 모드 — 지형·소품·안개를 끄고 평면 배경에 파츠만 렌더한다.
// ⚠️ 부츠는 니어블랙(deepHide)인데다 캐릭터 자신의 그림자 안에 들어가 인게임 프레임에서는
//    형태가 거의 안 읽힌다 — '둥근 포드'라는 지적도 결국 실루엣 판정이다. 발가락 테이퍼·굽 블록·
//    발목 조임이 실제로 생겼는지는 이 모드로 봐야 판정이 된다.
const SIL = process.argv.includes('sil');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 60000 });

    await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        ProChar.update = () => {};                 // 포즈 고정 — 팔·다리가 흔들리면 각도가 컷마다 달라진다
        const R = Scene3D.heroRig; R._t = 0; R._idleT = 0;
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
    });

    // 조준점을 파츠 월드 좌표로 잡고 바짝 붙는다 (바운딩 박스 중심이 아니라 — 그러면 항상 배가 잡힌다)
    const aim = (orbit) => page.evaluate(([orbit, PART]) => {
        const R = Scene3D.heroRig;
        // shoulder: 조준점 = 목(고젯 칼라) — 좌우 견갑이 대칭으로 들어오고 칼라 높이도 같이 판독된다.
        //           한쪽 어깨를 조준하면 반대쪽이 프레임 밖으로 나가고, 오른팔은 검이 견갑을 가린다.
        // foot:     조준점 = 왼 무릎 아래 — 발목·발가락·굽이 한 프레임에 들어온다.
        const tgt = PART === 'foot'
            ? (R.legs && R.legs[0] ? R.legs[0].knee : null)
            : (R.bones && R.bones.neck);
        const c = new THREE.Vector3();
        if (PART === 'foot' && tgt) {
            // ⚠️ 무릎 **피벗**을 조준하면 정강이가 잡히고 발은 프레임 아래로 밀린다(첫 판이 그랬다).
            //    무릎 그룹 전체의 월드 바운딩 박스를 떠서 그 **하단 18%** 지점을 조준해야 발이 중앙에 온다.
            const b = new THREE.Box3().setFromObject(tgt);
            b.getCenter(c);
            c.y = b.min.y + (b.max.y - b.min.y) * 0.18;
        } else if (tgt && tgt.getWorldPosition) tgt.getWorldPosition(c);
        else new THREE.Box3().setFromObject(Scene3D.heroG).getCenter(c);
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit);
        // ⚠️ 발은 카메라 높이가 중요하다 — 지면 높이에서 수평으로 보면 발 실루엣이 지면선과 겹쳐
        //    발가락·굽 꺾임이 통째로 안 읽힌다(두 번째 판이 그랬다). 거리의 0.45 만큼 띄워 내려다본다.
        const dist = PART === 'foot' ? 0.75 : 2.1;  // 발은 더 작으니 더 붙는다(2.1은 발이 25px)
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * (PART === 'foot' ? 0.45 : 0.12), 0)), look: c.clone() };
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(Scene3D.camLock.look);
    }, [orbit, PART]);

    for (const [name, orbit] of [['front', 0], ['q45', -Math.PI / 4], ['side', -Math.PI / 2]]) { // 음수 = 방패쪽(왼팔) — 검이 견갑을 가리지 않는 각
        await aim(orbit);
        await page.waitForTimeout(500);
        if (SIL) await page.evaluate(() => {
            if (window.__silDone) return;
            window.__silDone = true;
            for (const ch of Scene3D.scene.children) if (ch !== Scene3D.heroG && !ch.isLight) ch.visible = false;
            Scene3D.scene.fog = null;
            Scene3D.renderer.setClearColor(0xff00ff);
            Scene3D.renderer.shadowMap.enabled = false;   // 자기 그림자가 니어블랙 부츠를 통째로 먹는다
        });
        const box = await page.evaluate(() => { const r = Scene3D.renderer.domElement.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
        await page.screenshot({ path: OUT + '/' + PART + '-' + name + (SIL ? '-sil' : '') + '.png', clip: box });
        console.log(PART + '-' + name + (SIL ? '-sil' : '') + '.png');
    }
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
