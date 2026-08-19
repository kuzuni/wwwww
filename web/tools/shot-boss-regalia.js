// shot-boss-regalia.js — 보스 7종을 같은 각·같은 프레이밍으로 찍어 한 장에 잇는다.
// 수치 게이트(probe-boss-crown-seat)가 통과해도 '보스로 보이는가'는 눈으로 봐야 한다.
// 결과: tools/boss-regalia-sheet.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const KINDS = process.argv.slice(2).length ? process.argv.slice(2)
    : ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const BOSS = process.env.NOBOSS ? false : true;

const INPAGE = `(kind, isBoss) => {
    Combat.tick = () => {};
    Scene3D.walking = false;
    Scene3D.heroG.visible = false;
    Scene3D._trailOn = false; Scene3D.trailPts = []; if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
    if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
    if (Scene3D.mountGroup) Scene3D.mountGroup.visible = false;
    Scene3D.petGroups.forEach(p => p.visible = false);
    Scene3D.clearEnemies();
    const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100, isBoss: !!isBoss };
    Combat.enemies = [e];
    Scene3D.heroAttack = () => {};
    Scene3D.spawnEnemy(e);
    const m = Scene3D.enemyMap.get(999);
    for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
    Scene3D.anims = [];
    m.g.position.y = 0; m.g.userData.landed = true;
    m.g.position.x = e.x + Scene3D.worldX;
    if (kind === 'wolf') m.g.rotation.y = -1.15;
    m.g.updateMatrixWorld(true);
    for (const o of [...Scene3D.trees, ...Scene3D.rocks]) { if (Math.abs(o.position.x - m.g.position.x) < 7) o.visible = false; }
    const box = new THREE.Box3().setFromObject(m.g);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z), dist = r * 1.9 + 0.4;
    Scene3D.camLock = { pos: new THREE.Vector3(c.x - dist * 0.55, c.y + dist * 0.3, c.z + dist * 0.95), look: c.clone() };
    Scene3D.camera.position.copy(Scene3D.camLock.pos);
    Scene3D.camera.lookAt(Scene3D.camLock.look);
    Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
}`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errs = [];
    const shots = [];
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
        page.on('pageerror', e => errs.push(kind + ': ' + e));
        await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 60000 });
        await page.waitForTimeout(600);
        await page.evaluate(() => {
            for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '.waypoint', '#offline-btn'])
                document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
            if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
            Scene3D.__frozenUpdate = Scene3D.update; Scene3D.update = () => {};
        });
        await page.evaluate(([s, k, b]) => (new Function('return ' + s))()(k, b), [INPAGE, kind, BOSS]);
        const f = path.resolve(__dirname, `boss-${kind}.png`);
        await page.locator('canvas').screenshot({ path: f });
        shots.push(f);
        await page.close();
        console.log('찍음:', path.basename(f));
    }
    // 가로로 잇는다 — 한 장에 놓고 봐야 종끼리 비교가 된다
    const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
    const b64 = shots.map(f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64'));
    const sheet = await page.evaluate(async (imgs) => {
        const loaded = await Promise.all(imgs.map(src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; })));
        const w = loaded[0].width, h = loaded[0].height;
        const cv = document.createElement('canvas');
        cv.width = w * loaded.length; cv.height = h;
        const cx = cv.getContext('2d');
        loaded.forEach((i, k) => cx.drawImage(i, k * w, 0));
        return cv.toDataURL('image/png').split(',')[1];
    }, b64);
    const out = path.resolve(__dirname, 'boss-regalia-sheet.png');
    fs.writeFileSync(out, Buffer.from(sheet, 'base64'));
    console.log('\n시트:', out);
    console.log(`콘솔 에러 ${errs.length}건${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''}`);
    await browser.close();
})();
