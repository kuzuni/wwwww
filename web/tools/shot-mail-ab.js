// 사슬 텍스처 비등방 필터링 A/B 근접샷 — 같은 세션에서 anisotropy만 갈아 2장을 뽑는다.
// 시머 지표(probe-shimmer.js)는 '흐릿할수록 안정'으로 나와 비등방 필터를 오히려 불리하게
// 평가하므로, 그레이징 각도에서 고리 직조가 실제로 판독되는지는 육안 대조가 유일한 판정법이다.
// ⚠️ 카메라를 직접 set하면 게임 렌더 루프가 매 프레임 되돌린다 — `Scene3D.camLock`을 써야 한다.
// 사용: node shot-mail-ab.js  → mail-aniso1.png / mail-aniso16.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = __dirname;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && Scene3D.heroRig.bones.hipR, null, { timeout: 15000 });

    await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        ProChar.update = () => {};                       // 포즈 고정
        Scene3D.heroRig._t = 0; Scene3D.heroRig._idleT = 0;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';

        // 대퇴(사슬)를 화면 가득 + 그레이징 각도 — 원통 표면이 시선에 대해 급히 기울어야
        // 비등방 필터의 차이가 드러난다(정면에서 보면 등방 밉맵으로도 충분히 선명하다).
        Scene3D.heroG.updateMatrixWorld(true);
        const t = new THREE.Vector3();
        Scene3D.heroRig.bones.hipR.getWorldPosition(t);
        t.y -= 0.16;                                     // 대퇴 중앙쯤
        Scene3D.camLock = {
            pos: t.clone().add(new THREE.Vector3(0.30, 0.06, 0.20)),  // 거의 접선 방향에서
            look: t.clone(),
        };
    });
    await page.waitForTimeout(400);

    // 고리 타일 밀도 A/B — repeat 1(수정 전) vs 현재 설정값
    for (const rep of [1, 3]) {
        await page.evaluate((r) => {
            const t = ProChar._texCache['mail'];
            t.repeat.set(r, r); t.needsUpdate = true;
        }, rep);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `mail-rep${rep}.png`), clip: { x: 60, y: 180, width: 360, height: 300 } });
        console.log(`mail-rep${rep}.png`, errs.length ? 'ERR: ' + errs.join('|') : '(clean)');
    }
    await browser.close();
})();
