// 박스 캐릭터 시대 의상(equip-build-armor) 검증 시트 — 사용: node shot-mc-armor.js
//  ⓐ mc-armor-thumbs.png : 갑옷 썸네일 10시대 × 5종 (새 makeArmorPreview 경로)
//  ⓑ mc-armor-worn.png   : 영웅 착용 컷 10시대 (dressMcRig 경로 — 소매·바지가 관절 본에 붙는지)
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
    await waitReady(page, 'typeof Scene3D !== "undefined" && !!Scene3D.itemThumb && typeof Combat !== "undefined"');

    // ⓐ 썸네일 시트
    const url = await page.evaluate(() => {
        const S = 160;
        Scene3D.itemThumb({ slot: 'armor', age: 'medieval', ageIdx: 1, rarity: 'rare', nameIdx: 0 }); // 렌더러 초기화
        Scene3D._thumbR.setSize(S, S);
        Scene3D._thumbCache = {};
        const cv = document.createElement('canvas');
        cv.width = S * 5; cv.height = S * AGES.length;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#1b2230'; ctx.fillRect(0, 0, cv.width, cv.height);
        const jobs = [];
        AGES.forEach((age, r) => {
            for (let ni = 0; ni < 5; ni++) {
                const u = Scene3D.itemThumb({ slot: 'armor', age, ageIdx: AGES.indexOf(age), rarity: 'rare', nameIdx: ni });
                if (!u) continue;
                jobs.push(new Promise(res => {
                    const im = new Image();
                    im.onload = () => {
                        ctx.drawImage(im, ni * S, r * S, S, S);
                        ctx.fillStyle = '#ffffff'; ctx.font = '11px sans-serif';
                        ctx.fillText(ITEM_NAMES[age].armor[ni] || '', ni * S + 4, r * S + S - 6);
                        res();
                    };
                    im.onerror = () => res();
                    im.src = u;
                }));
            }
            jobs.push(Promise.resolve().then(() => { ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(AGE_KR[age], 4, r * S + 16); }));
        });
        return Promise.all(jobs).then(() => cv.toDataURL());
    });
    fs.writeFileSync(path.join(__dirname, 'mc-armor-thumbs.png'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('mc-armor-thumbs.png 저장');

    // ⓑ 착용 컷 — 시대마다 갑옷을 갈아입혀 영웅 근접 캡처(정면 3/4), 5×2 시트로 합침
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
    const crops = [];
    for (const age of ['primitive', 'medieval', 'earlyModern', 'modern', 'space', 'interstellar', 'multiverse', 'quantum', 'underworld', 'divine']) {
        await page.evaluate((age) => {
            S.equipment.armor = { slot: 'armor', age, rarity: 'epic', nameIdx: (AGES.indexOf(age) + 1) % 5, stars: 0 };
            Scene3D.refreshHeroEquip();
            Scene3D.heroG.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(Scene3D.heroG);
            const c = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const r = Math.max(size.x, size.y, size.z);
            const dist = r * 1.55 + 0.3;
            const fwd = new THREE.Vector3();
            Scene3D.heroG.getWorldDirection(fwd);
            fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.55);
            Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.28, 0)), look: c.clone() };
        }, age);
        await page.waitForTimeout(250);
        const f = path.join(__dirname, `mc-worn-${age}.png`);
        await page.screenshot({ path: f, clip: { x: canvasBox.x, y: canvasBox.y + canvasBox.height * 0.12, width: canvasBox.width, height: canvasBox.height * 0.62 }, timeout: 60000 });
        crops.push([age, f]);
        console.log('worn', age);
    }
    // 시트 합성 (node 쪽 캔버스가 없으므로 페이지 안에서 합친다)
    const datas = {};
    for (const [age, f] of crops) datas[age] = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const sheet = await page.evaluate((datas) => {
        const keys = Object.keys(datas);
        return new Promise(resolve => {
            const imgs = {};
            let n = 0;
            keys.forEach(k => {
                const im = new Image();
                im.onload = im.onerror = () => { imgs[k] = im; if (++n === keys.length) done(); };
                im.src = datas[k];
            });
            function done() {
                const w = imgs[keys[0]].width, h = imgs[keys[0]].height;
                const sc = 0.6;
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
    fs.writeFileSync(path.join(__dirname, 'mc-armor-worn.png'), Buffer.from(sheet.split(',')[1], 'base64'));
    for (const [, f] of crops) fs.unlinkSync(f);
    console.log('mc-armor-worn.png 저장 · 콘솔 에러', errors.length, errors.slice(0, 5));
    await browser.close();
})();
