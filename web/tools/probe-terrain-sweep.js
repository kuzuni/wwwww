// 지형 값(명도) 스윕 — 비평가 2인이 공통 1위로 지목한 '글로벌 값 붕괴'의 지렛대 검증.
// setTheme()이 지면/산/구릉/식생을 전부 t.ground에서 파생하므로 t.ground의 명도만 낮춰
// 일괄 검증할 수 있다. 지표: 실루엣 경계 단차(edgeStep), 화면 다크 픽셀 비율, 중간값 명도.
// 사용: node probe-terrain-sweep.js
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
            let bn = 0, step = 0, signed = 0, inN = 0, bodyL = 0, darkAll = 0, sum = 0;
            const lums = [];
            for (let p = 0; p < w * h; p++) { const l = lum(fg, p * 4); sum += l; lums.push(l); if (l <= 0.18) darkAll++; }
            for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                const p = y * w + x; if (!mask[p]) continue;
                inN++; bodyL += lum(fg, p * 4);
                if (mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w]) continue;
                bn++;
                const lf = lum(fg, p * 4), lb = lum(bg, p * 4);
                step += Math.abs(lf - lb); signed += lf - lb;
            }
            lums.sort((a, b) => a - b);
            return {
                edgeStep: +(step / bn).toFixed(4), edgeSigned: +(signed / bn).toFixed(4),
                bodyLum: +(bodyL / inN).toFixed(4),
                medianLum: +lums[Math.floor(lums.length / 2)].toFixed(4),
                darkPctAll: +(darkAll / (w * h) * 100).toFixed(2),
            };
        };
        const base = CHAPTER_THEMES[0];
        const out = [];
        const run = (tag, v) => {
            Object.assign(Scene3D.VALUE, v);
            Scene3D.setTheme(base);
            out.push(Object.assign({ tag }, measure()));
        };
        // ① 지면 명도 오프셋 스윕 (식생·채도 보정은 끈 채 단독 효과 확인)
        for (const d of [0, 0.08, 0.12, 0.155, 0.20, 0.26]) {
            run(`ground -${d.toFixed(3)}`, { ground: -d, groundSat: 0, foliage: 0, farDesat: 0 });
        }
        // ② 채택 후보 위에 식생 추가 하향 + 원경 채도 하향을 얹어 최종 조합 확인
        run('adopt(-.155/.07/.2)', { ground: -0.155, groundSat: -0.05, foliage: -0.07, farDesat: 0.2 });
        run('deeper(-.20/.11/.26)', { ground: -0.20, groundSat: -0.07, foliage: -0.11, farDesat: 0.26 });
        return out;
    });
    console.log('tag'.padEnd(18), 'edgeStep  signed    bodyLum  medianLum  darkPctAll');
    for (const r of rows) console.log(String(r.tag).padEnd(18), String(r.edgeStep).padEnd(9), String(r.edgeSigned).padEnd(9), String(r.bodyLum).padEnd(8), String(r.medianLum).padEnd(10), r.darkPctAll);
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
