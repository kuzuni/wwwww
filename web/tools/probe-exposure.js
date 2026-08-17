// 노출/백화 실측 — 캐릭터·적 픽셀의 채도·명도를 albedo와 대조
// 사용: node probe-exposure.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    page.on('pageerror', e => console.log('ERR', String(e)));
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 15000 });

    const out = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        const res = { lights: {}, samples: [] };
        res.lights = {
            sun: Scene3D.sun.intensity, hemi: Scene3D.hemi.intensity, rim: Scene3D.rim.intensity,
            exposure: Scene3D.renderer.toneMappingExposure,
            env: !!Scene3D.scene.environment,
        };
        // 씬 안 모든 메시의 albedo 채도/명도 vs 실제 화면 픽셀 비교용: 우선 albedo 통계
        const hsl = {};
        const albedos = [];
        Scene3D.scene.traverse(o => {
            if (o.isMesh && o.material && o.material.color && o.visible) {
                o.material.color.getHSL(hsl);
                albedos.push({ s: hsl.s, l: hsl.l });
            }
        });
        res.albedoMean = {
            s: +(albedos.reduce((a, b) => a + b.s, 0) / albedos.length).toFixed(3),
            l: +(albedos.reduce((a, b) => a + b.l, 0) / albedos.length).toFixed(3),
            n: albedos.length,
        };
        return res;
    });
    console.log('lights/exposure:', JSON.stringify(out.lights));
    console.log('albedo mean    :', JSON.stringify(out.albedoMean));

    // 실제 렌더 픽셀 통계 — 캔버스를 읽어 채도/휘도 히스토그램
    const px = await page.evaluate(() => {
        // WebGL 캔버스는 preserveDrawingBuffer:false라 drawImage로 못 읽는다 —
        // 명시적 render 직후 같은 태스크 안에서 gl.readPixels로 백버퍼를 직접 읽는다.
        const r = Scene3D.renderer, gl = r.getContext();
        r.render(Scene3D.scene, Scene3D.camera);
        const w = r.domElement.width, h = r.domElement.height;
        const d = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
        let n = 0, satSum = 0, lumSum = 0, blown = 0, lowSat = 0;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
            const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
            const l = (mx + mn) / 2;
            const s = mx === mn ? 0 : (l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
            n++; satSum += s; lumSum += l;
            if (mx > 0.96) blown++;
            if (s < 0.12) lowSat++;
        }
        // 영웅 화면 바운딩 박스를 투영해 캐릭터 영역 / 배경 영역을 분리 측정
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const cam = Scene3D.camera; cam.updateMatrixWorld();
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (let i = 0; i < 8; i++) {
            const v = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
            const sx = (v.x * 0.5 + 0.5) * w, sy = (v.y * 0.5 + 0.5) * h; // readPixels는 좌하단 원점 — 그대로 사용
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
        const stat = (inBox) => {
            let cn = 0, cs = 0, cl = 0, lo = 1e9, hi = -1e9;
            for (let py = 0; py < h; py++) for (let px2 = 0; px2 < w; px2++) {
                const on = px2 >= x0 && px2 <= x1 && py >= y0 && py <= y1;
                if (on !== inBox) continue;
                const i = (py * w + px2) * 4;
                const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
                const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
                const s = mx === mn ? 0 : (l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
                cn++; cs += s; cl += l; lo = Math.min(lo, l); hi = Math.max(hi, l);
            }
            return { n: cn, sat: +(cs / cn).toFixed(3), lum: +(cl / cn).toFixed(3), min: +lo.toFixed(3), max: +hi.toFixed(3) };
        };
        return {
            all: { n, sat: +(satSum / n).toFixed(3), lum: +(lumSum / n).toFixed(3), blownPct: +(blown / n * 100).toFixed(1), lowSatPct: +(lowSat / n * 100).toFixed(1) },
            hero: stat(true), bg: stat(false),
        };
    });
    console.log('screen all     :', JSON.stringify(px.all));
    console.log('hero box       :', JSON.stringify(px.hero));
    console.log('background     :', JSON.stringify(px.bg));
    console.log('hero-bg 명도차 :', (px.hero.lum - px.bg.lum).toFixed(3), ' 채도차:', (px.hero.sat - px.bg.sat).toFixed(3));
    await browser.close();
})();
