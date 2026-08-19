// 영웅 장비 명도 그레이딩 **스윕** — `Scene3D.HERO_VALUE_GRADE` 의 (dl, env) 를 표로 고른다.
//
// `probe-hero-value-parts.js` 가 범인을 투구·검으로 지목한 뒤, 얼마나 내려야 게이트(델타 ≥45)에
// 닿는지를 재는 도구. **실제 코드 경로를 그대로 탄다** — 파라미터를 바꾸고 `refreshHeroEquip()` 을
// 다시 불러 모델을 재조립하므로, 여기서 통과한 값이 곧 인게임 값이다(재질만 흉내 내면 어긋난다).
// ⚠️ 한 브라우저 세션 안에서 돌린다 — 조합마다 페이지를 새로 띄우면 프레이밍·포즈 차이가 지표에 섞인다.
// ⚠️ 측정 전용. 채택은 표를 보고 사람이 정한다.
//
// 사용: node probe-hero-grade-sweep.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

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

    const out = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); if (typeof Combat !== 'undefined') Combat.enemies = [];
        ProChar.update = () => {};
        const R = Scene3D.heroRig;
        R._t = 0; R._idleT = 0;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;

        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = Math.max(size.x, size.y, size.z) * 1.9 + 0.4;
        Scene3D.camera.position.copy(c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.18, 0)));
        Scene3D.camera.lookAt(c);
        Scene3D.camLock = { pos: Scene3D.camera.position.clone(), look: c.clone() };

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];

        const measure = () => {
            const on = grab();
            Scene3D.heroG.visible = false;
            const off = grab();
            Scene3D.heroG.visible = true;
            const hv = [], bv = [];
            for (let i = 0; i < w * h; i++) {
                const j = i * 4;
                const d = Math.abs(on[j] - off[j]) + Math.abs(on[j + 1] - off[j + 1]) + Math.abs(on[j + 2] - off[j + 2]);
                if (d > 14) { hv.push(lum(on, j)); bv.push(lum(off, j)); }
            }
            if (!hv.length) return null;
            hv.sort((a, b) => a - b);
            const m = a => a.reduce((s, v) => s + v, 0) / a.length;
            const hero = m(hv), bg = m(bv);
            return {
                px: hv.length, hero: +hero.toFixed(1), bg: +bg.toFixed(1), delta: +Math.abs(hero - bg).toFixed(1),
                p95: +hv[Math.floor(hv.length * 0.95)].toFixed(1),
                darkPct: +(100 * hv.filter(v => v < 45).length / hv.length).toFixed(1),
                clipPct: +(100 * hv.filter(v => v >= 250).length / hv.length).toFixed(2),
            };
        };

        const combos = [
            { dl: 0, env: 1 },        // 그레이딩 없음 = 기준선
            { dl: -0.10, env: 1 },    // albedo 만
            { dl: 0, env: 0.40 },     // env 만
            { dl: -0.10, env: 0.60 },
            { dl: -0.17, env: 0.42 },
            { dl: -0.24, env: 0.32 },
            { dl: -0.30, env: 0.25 },
            { dl: -0.38, env: 0.18 },
        ];
        const rows = [];
        for (const g of combos) {
            Scene3D.HERO_VALUE_GRADE = g;
            Scene3D.refreshHeroEquip(false);
            Scene3D.heroG.updateMatrixWorld(true);
            const r = measure();
            rows.push(Object.assign({ dl: g.dl, env: g.env }, r || { px: 0 }));
        }
        return rows;
    });

    console.log('--- 영웅 장비 명도 그레이딩 스윕 (투구·무기 인스턴스만) ---');
    console.log('   dl    env    화소   영웅L   배경L   델타   p95   L<45     클리핑');
    for (const r of out) {
        console.log('  ' + String(r.dl).padStart(5) + '  ' + String(r.env).padStart(4) + '  ' + String(r.px).padStart(6)
            + '  ' + String(r.hero).padStart(6) + '  ' + String(r.bg).padStart(6) + '  ' + String(r.delta).padStart(5)
            + '  ' + String(r.p95).padStart(5) + '  ' + String(r.darkPct).padStart(5) + '%  ' + r.clipPct + '%'
            + (r.delta >= 45 ? '  ← 게이트 통과' : ''));
    }
    if (errs.length) console.log('ERRORS: ' + errs.slice(0, 4).join(' | '));
    await browser.close();
})();
