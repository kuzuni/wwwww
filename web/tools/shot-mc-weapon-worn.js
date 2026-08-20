// 박스 캐릭터가 무기(+투구+갑옷)를 든 착용 컷 — makeWeapon 이 새 박스 히어로 손에 맞는지 육안 검증.
// 사용: node shot-mc-weapon-worn.js → tools/mc-weapon-worn.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.heroG && typeof Combat !== "undefined"');
    await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        for (const sel of ['#topbar', '#equip-sheet', '#skill-bar', '#stage-label', '#wave-pips', '#chat-preview', '#loot-feed', '#hero-hp-wrap', '#offline-btn'])
            document.querySelectorAll(sel).forEach(el => el.style.visibility = 'hidden');
        if (Scene3D.fxLayer) Scene3D.fxLayer.style.visibility = 'hidden';
    });
    const canvasBox = await page.evaluate(() => {
        const r = Scene3D.renderer.domElement.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const ages = ['primitive', 'medieval', 'earlyModern', 'modern', 'space', 'interstellar', 'multiverse', 'quantum', 'underworld', 'divine'];
    const crops = [];
    for (const age of ages) {
        await page.evaluate((age) => {
            const ai = AGES.indexOf(age);
            const wlist = weaponsOfAge(age);
            const wt = wlist[ai % wlist.length];
            S.equipment.armor = { slot: 'armor', age, rarity: 'epic', nameIdx: (ai + 1) % 5, stars: 0 };
            S.equipment.helmet = { slot: 'helmet', age, rarity: 'epic', nameIdx: (ai + 2) % 5, stars: 0 };
            S.equipment.weapon = { slot: 'weapon', age, ageIdx: ai, rarity: 'epic', wtype: wt, nameIdx: ai % wlist.length, stars: 0 };
            Scene3D.wtypeId = wt;
            Scene3D.refreshHeroEquip();
            Scene3D.heroG.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(Scene3D.heroG);
            const c = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const r = Math.max(size.x, size.y, size.z);
            const dist = r * 1.5 + 0.3;
            const fwd = new THREE.Vector3();
            Scene3D.heroG.getWorldDirection(fwd);
            fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.55);
            Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.22, 0)), look: c.clone() };
        }, age);
        await page.waitForTimeout(250);
        const f = path.join(__dirname, `mcw-${age}.png`);
        await page.screenshot({ path: f, clip: { x: canvasBox.x, y: canvasBox.y + canvasBox.height * 0.08, width: canvasBox.width, height: canvasBox.height * 0.72 }, timeout: 60000 });
        crops.push([age, f]);
        console.log('worn', age);
    }
    const datas = {};
    for (const [age, f] of crops) datas[age] = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const sheet = await page.evaluate((datas) => {
        const keys = Object.keys(datas);
        return new Promise(resolve => {
            const imgs = {}; let n = 0;
            keys.forEach(k => { const im = new Image(); im.onload = im.onerror = () => { imgs[k] = im; if (++n === keys.length) done(); }; im.src = datas[k]; });
            function done() {
                const w = imgs[keys[0]].width, h = imgs[keys[0]].height, sc = 0.6;
                const cv = document.createElement('canvas');
                cv.width = w * sc * 5; cv.height = h * sc * 2;
                const ctx = cv.getContext('2d');
                ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, cv.width, cv.height);
                keys.forEach((k, i) => {
                    const c = i % 5, r = (i / 5) | 0;
                    ctx.drawImage(imgs[k], c * w * sc, r * h * sc, w * sc, h * sc);
                    ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 14px sans-serif';
                    ctx.fillText(AGE_KR[k] || k, c * w * sc + 6, r * h * sc + 18);
                });
                resolve(cv.toDataURL());
            }
        });
    }, datas);
    fs.writeFileSync(path.join(__dirname, 'mc-weapon-worn.png'), Buffer.from(sheet.split(',')[1], 'base64'));
    for (const [, f] of crops) fs.unlinkSync(f);
    console.log('mc-weapon-worn.png 저장 · 콘솔 에러', errors.length, errors.slice(0, 5));
    await browser.close();
})();
