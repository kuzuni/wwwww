// 스커트 태싯 접사 — voxel 전환 판독용. 정면·측면·아래(밑단)에서 본다.
//   ⚠️ 왜 전용 컷이 필요한가: `probe-tasset` 은 간극을 **각도**로만 뱉는다. 그런데 이 전환에서
//      실제로 갈리는 건 '간극이 균일한가 · 큐브가 큐브로 읽히는가 · 금 립이 밑단에 살아 있는가'
//      라 그림이 있어야 판독된다(견갑 인계 ㉯ 가 남긴 교훈: 숫자만 보고 넘기지 말 것).
//   ⚠️ `shot-hero.js` 는 이 컨테이너에서 타임아웃한다(스위프트셰이더 콜드 스타트). 이 자는
//      `shot-pauldron.js` 와 같은 최소 경로(포즈 동결 + camLock)만 쓴다.
// 사용: node shot-tasset.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    const aim = async (yaw, pitch, dist) => page.evaluate(([yaw, pitch, dist]) => {
        // 포즈를 Idle 0프레임으로 얼린다 — 프로브와 같은 상태여야 숫자와 그림이 같은 것을 가리킨다.
        const R = Scene3D.heroRig;
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0); ProChar.update = () => {};
        if (typeof Combat !== 'undefined') Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        Scene3D.walking = false;
        Scene3D.clearEnemies(); if (typeof Combat !== 'undefined') Combat.enemies = [];
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D.heroG.updateMatrixWorld(true);
        // 표적 = 태싯 덩어리의 월드 중심(파츠 태그로 잡는다 — 조형이 바뀌어도 안 흔들린다)
        const box = new THREE.Box3();
        Scene3D.heroG.traverse(o => {
            if (o.userData && (o.userData.part === 'tasset' || o.userData.part === 'tassetRim')) box.expandByObject(o);
        });
        const t = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
        // ⚠️ 궤도각은 **영웅 정면 기준**이다(월드 절대 yaw 로 잡으면 등짝만 찍힌다).
        // ⚠️ 카메라를 직접 옮기면 다음 프레임에 게임 루프가 덮는다 — `Scene3D.camLock` 이 그 자리다.
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).normalize();
        Scene3D.camLock = {
            pos: t.clone()
                .addScaledVector(fwd, Math.cos(pitch) * dist)
                .add(new THREE.Vector3(0, Math.sin(pitch) * dist, 0)),
            look: t.clone(),
        };
        return true;
    }, [yaw, pitch, dist]);

    const hideUI = () => page.evaluate(() => {
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
    });
    const shot = async (file) => {
        const rect = await page.evaluate(() => {
            const r = document.querySelector('canvas').getBoundingClientRect();
            return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
        });
        await page.screenshot({ path: OUT + '/' + file, clip: rect });
    };

    const shots = [
        ['tasset-front.png', 0, 0.10, 0.62],     // 정면 — 중앙 V 노치가 보이는 자리
        ['tasset-quarter.png', -0.9, 0.12, 0.62],// 3/4 — 간극이 여러 개 한꺼번에 보인다
        ['tasset-under.png', 0, -0.45, 0.62],    // 아래 — 밑단 금 립과 셸 두께
    ];
    for (const [name, yaw, pitch, dist] of shots) {
        await aim(yaw, pitch, dist);
        await page.waitForTimeout(600);
        await hideUI();
        await shot(name);
    }
    console.log('tasset shots done ' + (errs.length ? '\n' + errs.join('\n') : '(no console errors)'));
    await browser.close();
})();
