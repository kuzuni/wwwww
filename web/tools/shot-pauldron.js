// 견갑(스폴더) 접사 — voxel 전환 판독용. 왼쪽 어깨(방패쪽, 검이 안 가린다)를 정면·측면·아래에서 본다.
//   ⚠️ '아래에서' 컷이 있는 이유: `probe-pauldron` ③(밑면 막힘)은 레이캐스트라 숫자만 나오고,
//      실제로 속이 보이는지는 그 각도의 화소로만 확인된다. 숫자와 그림을 같이 남긴다.
// 사용: node shot-pauldron.js
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
        // 왼쪽 어깨(arms[0]) 월드 좌표를 표적으로 잡는다
        const t = new THREE.Vector3();
        R.arms[0].shoulder.getWorldPosition(t);
        // ⚠️ 카메라를 직접 옮기고 renderer.render 를 부르면 **다음 프레임에 게임 루프가 도로 덮는다**
        //    (첫 판이 그래서 통째로 평소 화면이 찍혔다). `Scene3D.camLock` 이 루프가 존중하는 자리다.
        // ⚠️ 궤도각은 **영웅 정면 기준**이다 — 월드 절대 yaw 로 잡으면 영웅이 어느 쪽을 보고 있느냐에
        //    따라 등짝만 찍힌다(`shot-hero` 가 같은 함정을 밟고 고쳐 둔 것).
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
        ['pauldron-front.png', -0.75, 0.16, 0.80],
        ['pauldron-side.png', -1.55, 0.10, 0.80],
        ['pauldron-under.png', -0.75, -0.50, 0.80],
    ];
    for (const [name, yaw, pitch, dist] of shots) {
        await aim(yaw, pitch, dist);
        await page.waitForTimeout(500);
        await hideUI();
        await shot(name);
    }
    console.log('pauldron shots done ' + (errs.length ? '\n' + errs.join('\n') : '(no console errors)'));
    await browser.close();
})();
