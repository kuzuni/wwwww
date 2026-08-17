// 조명 총량 스윕 — "캐릭터에 진짜 어두운 값이 없다"(비평가 2인 공통 1위)의 근본 원인 검증.
// 가설: 부츠 albedo가 이미 0x2a1a0d(니어블랙)인데도 중간톤으로 렌더된다. 즉 재질을 더
// 어둡게 해도 안 되고, **조명 총량**(sun 1.85 + hemi 0.3 + rim 0.3 + env IBL)이 원인이다.
// 선형 0.1은 sRGB 인코딩 후 약 0.35가 되므로, 최종 0.18 이하를 얻으려면 선형 0.026 이하가 필요하다.
// 사용: node probe-light-sweep.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const rows = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        ProChar.update = () => {};                       // 포즈 고정 (결정성)
        Scene3D.heroRig._t = 0; Scene3D.heroRig._idleT = 0;
        const R = Scene3D.renderer, gl = R.getContext();
        const w = R.domElement.width, h = R.domElement.height;
        const grab = () => {
            R.render(Scene3D.scene, Scene3D.camera);
            const d = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
            return d;
        };
        const lum = (d, i) => (Math.max(d[i], d[i + 1], d[i + 2]) / 255 + Math.min(d[i], d[i + 1], d[i + 2]) / 255) / 2;
        const measure = () => {
            const vis = Scene3D.heroG.visible;
            Scene3D.heroG.visible = false; const bg = grab();
            Scene3D.heroG.visible = vis; const fg = grab();
            const mask = new Uint8Array(w * h);
            for (let p = 0; p < w * h; p++) {
                const i = p * 4;
                if (Math.abs(fg[i] - bg[i]) + Math.abs(fg[i + 1] - bg[i + 1]) + Math.abs(fg[i + 2] - bg[i + 2]) > 14) mask[p] = 1;
            }
            let bn = 0, step = 0, inN = 0, bodyL = 0, darkH = 0, darkA = 0, blown = 0;
            const lums = [];
            for (let p = 0; p < w * h; p++) {
                const l = lum(fg, p * 4); lums.push(l);
                if (l <= 0.18) darkA++;
                if (l >= 0.85) blown++;   // 비평가가 쓴 임계 — 0.96은 완전 클리핑만 잡아 '떠버린 하이라이트'를 놓친다
            }
            for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                const p = y * w + x; if (!mask[p]) continue;
                const l = lum(fg, p * 4);
                inN++; bodyL += l; if (l <= 0.18) darkH++;
                if (mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w]) continue;
                bn++;
                step += Math.abs(l - lum(bg, p * 4));
            }
            lums.sort((a, b) => a - b);
            return {
                edgeStep: +(step / bn).toFixed(4), bodyLum: +(bodyL / inN).toFixed(4),
                medianLum: +lums[Math.floor(lums.length / 2)].toFixed(4),
                darkPctHero: +(darkH / inN * 100).toFixed(2), darkPctAll: +(darkA / (w * h) * 100).toFixed(2),
                blownPct: +(blown / (w * h) * 100).toFixed(2),
            };
        };
        // env IBL 기여도 조절 — scene.environment는 전역이라 재질별 envMapIntensity로 스케일한다
        const envMats = [];
        Scene3D.scene.traverse(o => {
            if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material]))
                if (m && m.isMeshStandardMaterial) { if (m.userData.__env0 === undefined) m.userData.__env0 = m.envMapIntensity; envMats.push(m); }
        });
        const setLights = (sun, hemi, rim, expo, envScale) => {
            Scene3D.sun.intensity = sun; Scene3D.hemi.intensity = hemi; Scene3D.rim.intensity = rim;
            R.toneMappingExposure = expo;
            for (const m of envMats) { m.envMapIntensity = m.userData.__env0 * envScale; }
        };
        const out = [];
        const cases = [
            ['수정 전 1.85/.30/.30 e1.00', 1.85, 0.30, 0.30, 1.00, 1.0],
            ['현재 채택 1.15/.18/.20 e1.10', 1.15, 0.18, 0.20, 1.10, 1.0],
            ['노출만 내림 1.15/.18/.20 e1.02', 1.15, 0.18, 0.20, 1.02, 1.0],
            ['노출만 내림 1.15/.18/.20 e0.96', 1.15, 0.18, 0.20, 0.96, 1.0],
            ['광량 더 1.00/.15/.18 e1.02', 1.00, 0.15, 0.18, 1.02, 1.0],
            ['광량 더 0.90/.12/.16 e1.00', 0.90, 0.12, 0.16, 1.00, 1.0],
        ];
        for (const [tag, s, hm, rm, e, ev] of cases) {
            setLights(s, hm, rm, e, ev);
            out.push(Object.assign({ tag }, measure()));
        }
        setLights(1.85, 0.30, 0.30, 1.00, 1.0);   // 원복
        return out;
    });
    console.log('case'.padEnd(38), 'edgeStep bodyLum medLum  darkHero darkAll blown');
    for (const r of rows) console.log(String(r.tag).padEnd(38),
        String(r.edgeStep).padEnd(8), String(r.bodyLum).padEnd(7), String(r.medianLum).padEnd(7),
        String(r.darkPctHero).padEnd(8), String(r.darkPctAll).padEnd(7), r.blownPct);
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
