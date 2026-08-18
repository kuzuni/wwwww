// 인버티드 헐 아웃라인 육안 판독용 — 같은 페이지 세션에서 셸 설정만 갈아가며 같은 프레임을 찍는다.
// 수치(probe-outline.js)만 보면 '더 두껍고 더 검을수록' 무조건 이기므로, 굵기가 만화 테두리로
// 넘어가는 지점은 반드시 눈으로 봐야 한다 (원신 기준: 테두리가 형태를 정의하되 선으로 읽히면 안 됨).
// 사용: node shot-outline.js [w=... k=...]  → tools/outline-<label>.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const OUT = __dirname;
const argOf = (k, d) => {
    const a = process.argv.find(s => s.startsWith(k + '='));
    return a ? a.slice(k.length + 1).split(',').map(Number) : d;
};
const WS = argOf('w', [0.0085, 0.014, 0.022]), KS = argOf('k', [0.04]);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; };
    });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); if (typeof Combat !== 'undefined') Combat.enemies = [];
        ProChar.update = () => {};
        Scene3D.heroRig._t = 0; Scene3D.heroRig._idleT = 0;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        // 상반신 근접 — 테두리 굵기는 전신 축소본에서 판독 불가
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = Math.max(size.x, size.y, size.z) * 1.15;
        const look = c.clone().setY(c.y + size.y * 0.22);
        Scene3D.camLock = { pos: look.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.1, 0)), look };
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(look);
        window.__shells = [];
        Scene3D.heroG.traverse(o => { if (o.userData && o.userData.isOutline) window.__shells.push(o); });
    });

    const shoot = async (label, on, w, k) => {
        await page.evaluate(([on, w, k]) => {
            window.__shells.forEach(s => { s.visible = on; });
            if (on) ProChar.setOutline({ w, k });
            Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
        }, [on, w, k]);
        const buf = await page.locator('canvas').first().screenshot();
        fs.writeFileSync(`${OUT}/outline-${label}.png`, buf);
        console.log(`outline-${label}.png`);
    };

    await shoot('off', false);
    for (const w of WS) for (const k of KS) await shoot(`w${w}-k${k}`, true, w, k);
    console.log(errs.length ? '콘솔 에러:\n' + errs.join('\n') : '(no console errors)');
    await browser.close();
})();
