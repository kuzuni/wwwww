// 투구 얼굴 가림 검증 (equip-build-helmet) — 사용자 스펙 "얼굴 디캘 가리지 말 것".
// 눈을 덮을 위험이 큰 밀폐형 스타일(mask/sealed/tech/bubble/visor/skull)을 강제로 씌워
// 박스 히어로 얼굴을 클로즈업 캡처 → 디캘 눈(흰자+동공)이 보이는지 육안 확인.
// 사용: node shot-helmet-face.js → tools/helmet-face.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

// [라벨, age, nameIdx] — nameIdx 는 HELMET_STYLES[age][idx] 가 밀폐형이 되게 고른 값.
const CASES = [
    ['NONE (bare face)', null, 0],
    ['visor · medieval', 'medieval', 0],
    ['skull · primitive', 'primitive', 3],
    ['mask · primitive', 'primitive', 1],
    ['bubble · modern', 'modern', 1],
    ['tech · space', 'space', 1],
    ['sealed · space', 'space', 3],
    ['mask · space', 'space', 2],
    ['tech · quantum', 'quantum', 0],
];

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
        Scene3D.anims = []; Scene3D.walking = false;
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
    const crops = [];
    for (const [label, age, ni] of CASES) {
        const style = await page.evaluate(({ age, ni }) => {
            if (age === null) { delete S.equipment.helmet; } else
            S.equipment.helmet = { slot: 'helmet', age, rarity: 'epic', nameIdx: ni, stars: 0 };
            Scene3D.refreshHeroEquip();
            Scene3D.heroG.updateMatrixWorld(true);
            // 머리 = helmetG(머리 마운트에 붙음) 월드 좌표를 정본으로 프레이밍
            const headC = new THREE.Vector3();
            (Scene3D.helmetG || Scene3D.heroG).getWorldPosition(headC);
            const dist = 0.95;
            const fwd = new THREE.Vector3(); Scene3D.heroG.getWorldDirection(fwd);
            fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
            Scene3D.camLock = { pos: headC.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.12, 0)), look: headC.clone() };
            return (typeof HELMET_STYLES !== 'undefined' && HELMET_STYLES[age] && HELMET_STYLES[age][ni]) || '?';
        }, { age, ni });
        await page.waitForTimeout(250);
        const f = path.join(__dirname, `hf-${age}-${ni}.png`);
        await page.screenshot({ path: f, clip: { x: canvasBox.x, y: canvasBox.y + canvasBox.height * 0.18, width: canvasBox.width, height: canvasBox.height * 0.4 }, timeout: 60000 });
        crops.push([`${label} [${style}]`, f]);
        console.log('face', label, '→', style);
    }
    const datas = {};
    for (const [lbl, f] of crops) datas[lbl] = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const sheet = await page.evaluate((datas) => {
        const keys = Object.keys(datas);
        return new Promise(resolve => {
            const imgs = {}; let n = 0;
            keys.forEach(k => { const im = new Image(); im.onload = im.onerror = () => { imgs[k] = im; if (++n === keys.length) done(); }; im.src = datas[k]; });
            function done() {
                const w = imgs[keys[0]].width, h = imgs[keys[0]].height, sc = 0.55, cols = 4;
                const cv = document.createElement('canvas');
                cv.width = w * sc * cols; cv.height = h * sc * Math.ceil(keys.length / cols);
                const ctx = cv.getContext('2d');
                ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, cv.width, cv.height);
                keys.forEach((k, i) => {
                    const c = i % cols, r = (i / cols) | 0;
                    ctx.drawImage(imgs[k], c * w * sc, r * h * sc, w * sc, h * sc);
                    ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 13px sans-serif';
                    ctx.fillText(k, c * w * sc + 6, r * h * sc + 16);
                });
                resolve(cv.toDataURL());
            }
        });
    }, datas);
    fs.writeFileSync(path.join(__dirname, 'helmet-face.png'), Buffer.from(sheet.split(',')[1], 'base64'));
    for (const [, f] of crops) fs.unlinkSync(f);
    console.log('helmet-face.png 저장 · 콘솔 에러', errors.length, errors.slice(0, 5));
    await browser.close();
})();
