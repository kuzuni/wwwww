// 눈 판 높이·세로배율 스윕 — 투구 가림률이 게이트를 넘는 조합을 **한 세션 안에서** 찾는다.
//   ⚠️ 세션 간 비교는 조명·프레임 타이밍 노이즈가 끼므로(`probe-hero-grade-sweep` 이 남긴 교훈)
//      조합을 런타임에 갈아 끼우며 같은 런에서 잰다.
//   가림률 정의·키컬러 방식은 `probe-face-helmet-clear.js` 와 동일.
// 사용: node probe-face-eye-sweep.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const STYLES = ['cone', 'plume', 'crown', 'tophat', 'halo'];   // 가림이 문제되는 대역 + 기준 통과군
const COMBOS = [                                                // [눈 중심 y(두상로컬), 흰자 세로배율]
    [0.095, 1.22], [0.090, 1.22], [0.086, 1.16], [0.082, 1.16], [0.082, 1.10], [0.078, 1.10], [0.074, 1.06],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });

    await page.evaluate(() => {
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
        // 눈 판 그룹(= 흰자의 부모)을 잡아 두고 흰자를 키 컬러로
        window.__eyes = [];
        Scene3D.heroRig.faceMesh.traverse(o => {
            if (o.userData && o.userData.pieEye) { window.__eyes.push(o); o.material.color.setHex(0xff00ff); }
        });
        return window.__eyes.length;
    });
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
    const setCombo = (y, sy) => page.evaluate(([y, sy]) => {
        for (const s of window.__eyes) { s.parent.position.y = y; s.scale.set(1, sy, 1); }
        Scene3D.heroG.updateMatrixWorld(true);
    }, [y, sy]);
    const setHelmet = (style) => page.evaluate((style) => {
        const slot = Scene3D.helmetG;
        while (slot.children.length) slot.remove(slot.children[0]);
        if (style) { slot.add(Scene3D.makeHelmet(0, 'common', style, style)); slot.visible = true; }
        else slot.visible = false;
        Scene3D.heroG.updateMatrixWorld(true);
    }, style);

    console.log(`조합               ${STYLES.map(s => s.padStart(7)).join('')}   최저`);
    for (const [y, sy] of COMBOS) {
        await setCombo(y, sy);
        await setHelmet(null); await page.waitForTimeout(160);
        const base = await keyPixels();
        const cells = [];
        for (const st of STYLES) {
            await setHelmet(st); await page.waitForTimeout(140);
            cells.push(base ? (await keyPixels()) / base : 0);
        }
        const worst = Math.min(...cells);
        console.log(`y=${y.toFixed(3)} sy=${sy.toFixed(2)} (기준 ${String(base).padStart(5)}px) ${cells.map(v => (v * 100).toFixed(1).padStart(7)).join('')}   ${(worst * 100).toFixed(1)}%`);
    }
    console.log(errors.length ? `콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' | ')}` : '콘솔 에러 0건');
    await browser.close();
})();
