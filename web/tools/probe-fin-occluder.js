// fin 투구의 **어느 파츠가** 흰자를 가리는지 자식 하나씩 껐다 켜서 가른다.
// `probe-face-helmet-clear.js` 는 합계만 주므로 미달일 때 원인 파츠를 못 짚는다.
// 사용: node probe-fin-occluder.js [style]   (기본 fin)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const STYLE = process.argv[2] || 'fin';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const camInfo = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); Combat.enemies = [];
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        if (Scene3D.weaponG) Scene3D.weaponG.visible = false;
        Scene3D.heroG.updateMatrixWorld(true);
        const head = Scene3D.heroRig.bones.head;
        const box = new THREE.Box3().setFromObject(head);
        const c = box.getCenter(new THREE.Vector3());
        const r = Math.max(...box.getSize(new THREE.Vector3()).toArray());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(r * 1.4 + 0.12)), look: c.clone() };
        Scene3D.heroRig.faceMesh.traverse(o => {
            if (o.userData && o.userData.pieEye && o.material) o.material.color.setHex(0xff00ff);
        });
        // 눈 월드 좌표 → 투구 로컬로 되돌려 실제 좌표계를 확인한다(가정 검산).
        const hl = [];
        Scene3D.heroRig.faceMesh.traverse(o => {
            if (o.userData && o.userData.pieEye) {
                const w = o.getWorldPosition(new THREE.Vector3());
                const l = Scene3D.helmetG.worldToLocal(w.clone());
                hl.push([l.x.toFixed(3), l.y.toFixed(3), l.z.toFixed(3)].join(','));
            }
        });
        return { camDist: r * 1.4 + 0.12, headR: r, eyeLocal: hl };
    });
    console.log(`카메라 거리 ${camInfo.camDist.toFixed(3)} (머리 bbox 최대변 ${camInfo.headR.toFixed(3)})`);
    console.log(`흰자 중심의 투구 로컬 좌표: ${camInfo.eyeLocal.join(' | ')}`);
    await page.waitForTimeout(500);

    const rect = await page.evaluate(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.round(r.width), height: Math.round(r.height) };
    });
    const keyPixels = async () => {
        const b64 = (await page.screenshot({ clip: rect, timeout: 60000 })).toString('base64');
        return page.evaluate(async (b64) => {
            const im = new Image();
            await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
            const c = document.createElement('canvas');
            c.width = im.width; c.height = im.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            const d = g.getImageData(0, 0, im.width, im.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i] > 170 && d[i + 2] > 170 && d[i + 1] < 90) n++;
            return n;
        }, b64);
    };

    await page.evaluate(() => { Scene3D.helmetG.visible = false; });
    await page.waitForTimeout(200);
    const base = await keyPixels();
    console.log(`기준(투구 없음) = ${base}`);

    const parts = await page.evaluate((style) => {
        const slot = Scene3D.helmetG;
        while (slot.children.length) slot.remove(slot.children[0]);
        const m = Scene3D.makeHelmet(0, 'common', style, style);
        slot.add(m); slot.visible = true;
        Scene3D.heroG.updateMatrixWorld(true);
        window.__fin = m;
        return m.children.map((o, i) => {
            const b = new THREE.Box3().setFromObject(o);
            return { i, type: o.type, geo: (o.geometry && o.geometry.type) || '-', kids: o.children.length,
                box: [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => +v.toFixed(3)) };
        });
    }, STYLE);
    await page.waitForTimeout(200);
    const all = await keyPixels();
    console.log(`전체 착용 = ${all} (${(all / base * 100).toFixed(1)}%)\n`);

    console.log('자식별 — 그 파츠만 껐을 때 되찾는 흰자 (되찾는 양이 클수록 그 파츠가 범인):');
    for (const p of parts) {
        await page.evaluate((i) => { window.__fin.children[i].visible = false; }, p.i);
        await page.waitForTimeout(140);
        const n = await keyPixels();
        await page.evaluate((i) => { window.__fin.children[i].visible = true; }, p.i);
        const gain = n - all;
        console.log(`  [${String(p.i).padStart(2)}] ${p.type}/${p.geo} kids=${p.kids} box=${JSON.stringify(p.box)}  →  +${gain} (${(gain / base * 100).toFixed(1)}%p)`);
    }

    await page.evaluate(() => { window.__fin.visible = true; });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.resolve(__dirname, `face-helm-${STYLE}.png`), clip: rect });
    console.log(`\n캡처: web/tools/face-helm-${STYLE}.png`);
    console.log(errors.length ? `콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}` : '콘솔 에러 0건');
    await browser.close();
})();
