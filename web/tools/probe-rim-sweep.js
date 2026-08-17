// 림/다크컨투어 파라미터 스윕 — 한 브라우저 세션에서 유니폼만 바꿔가며 실루엣 분리도·다크 비율을 잰다.
// 주입 지점이 톤매핑 '앞'(선형 공간)이라 sRGB 인코딩 후 값이 크게 밝아진다 — 목표값을 실측으로 찾는다.
// 사용: node probe-rim-sweep.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });

    const rows = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        ProChar.update = () => {};   // 포즈 고정 (결정성)
        if (Scene3D.heroRig) { Scene3D.heroRig._t = 0; Scene3D.heroRig._idleT = 0; }
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
            let bn = 0, step = 0, signed = 0, inN = 0, dh = 0, bodyL = 0;
            for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                const p = y * w + x; if (!mask[p]) continue;
                const l = lum(fg, p * 4);
                inN++; bodyL += l; if (l <= 0.18) dh++;
                if (mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w]) continue;
                bn++;
                const lf = l, lb = lum(bg, p * 4);
                step += Math.abs(lf - lb); signed += lf - lb;
            }
            return {
                edgeStep: +(step / bn).toFixed(4), edgeSigned: +(signed / bn).toFixed(4),
                bodyLum: +(bodyL / inN).toFixed(4), darkPctHero: +(dh / inN * 100).toFixed(2),
            };
        };
        const set = (o) => {
            for (const u of Scene3D._rimUniforms) {
                if (o.darkStr !== undefined) u.uRimDarkStr.value = o.darkStr;
                if (o.darkPow !== undefined) u.uRimDarkPow.value = o.darkPow;
                if (o.darkHex !== undefined) u.uRimDark.value.setHex(o.darkHex);
                if (o.str !== undefined) u.uRimStr.value = o.str;
                if (o.pow !== undefined) u.uRimPow.value = o.pow;
            }
        };
        const out = [];
        // 기준선: 림/컨투어 전부 끄기
        set({ darkStr: 0, str: 0 });
        out.push(Object.assign({ tag: 'OFF (baseline)' }, measure()));
        // 다크 컨투어 강도 스윕 (near-black, 선형공간이라 강하게 필요)
        for (const ds of [0.4, 0.6, 0.75, 0.88, 0.95]) {
            set({ darkStr: ds, darkPow: 1.7, darkHex: 0x0a1119, str: 0 });
            out.push(Object.assign({ tag: `dark ${ds} pow1.7` }, measure()));
        }
        // 폭(power) 스윕 — 낮을수록 넓게 깔린다
        for (const dp of [1.1, 2.4, 3.2]) {
            set({ darkStr: 0.88, darkPow: dp, darkHex: 0x0a1119, str: 0 });
            out.push(Object.assign({ tag: `dark 0.88 pow${dp}` }, measure()));
        }
        // 다크 컨투어 + 좁은 밝은 림 병행
        for (const rs of [0.35, 0.6, 0.9]) {
            set({ darkStr: 0.88, darkPow: 1.7, darkHex: 0x0a1119, str: rs, pow: 5.0 });
            out.push(Object.assign({ tag: `dark0.88 + rim ${rs} pow5` }, measure()));
        }
        return out;
    });
    console.log('tag'.padEnd(26), 'edgeStep  signed    bodyLum  darkPctHero');
    for (const r of rows) console.log(String(r.tag).padEnd(26), String(r.edgeStep).padEnd(9), String(r.edgeSigned).padEnd(9), String(r.bodyLum).padEnd(8), r.darkPctHero);
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
