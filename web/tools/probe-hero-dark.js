// 캐릭터 값 구조 스윕 — 비평가 2인 공통 1순위 "캐릭터에 진짜 어두운 값이 없다"의 계량 도구.
// 요구치: 캐릭터 면적의 15~20%가 명도 0.10~0.18. 니어블랙 재질(ProChar.DEEP)의 albedo를
// 갈아가며 실루엣 마스크 안 히스토그램을 재고, 동시에 실루엣 경계 단차(edgeStep)가
// 무너지지 않는지 확인한다(너무 어두우면 캐릭터가 검은 덩어리로 뭉개져 형태 판독이 죽는다).
// 사용: node probe-hero-dark.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 15000 });

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
            let inN = 0, bodyL = 0, band = 0, below = 0, crush = 0, bn = 0, step = 0;
            for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
                const p = y * w + x; if (!mask[p]) continue;
                const l = lum(fg, p * 4);
                inN++; bodyL += l;
                if (l >= 0.10 && l <= 0.18) band++;   // 비평가 요구 대역
                if (l <= 0.18) below++;
                if (l < 0.06) crush++;                // 뭉개짐(디테일 소실) 감시
                if (mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w]) continue;
                bn++; step += Math.abs(l - lum(bg, p * 4));
            }
            return {
                maskPx: inN,
                bandPct: +(band / inN * 100).toFixed(2),   // 목표 15~20
                darkPct: +(below / inN * 100).toFixed(2),
                crushPct: +(crush / inN * 100).toFixed(2), // 5% 넘으면 과다
                bodyLum: +(bodyL / inN).toFixed(4),
                edgeStep: +(step / bn).toFixed(4),
            };
        };
        const out = [];
        const relight = () => Scene3D.tintHero(); // 톤 베이스를 바꿨으니 시대색 틴트를 다시 얹어야 실제 화면값이 나온다
        const mailMats = () => (ProChar._toneMats || []).filter(m => m.userData.tone === 'mail');
        const setMail = (metal, env) => { for (const m of mailMats()) { m.metalness = metal; m.envMapIntensity = env; m.needsUpdate = true; } };
        // ① albedo 스윕 (metalness 0.78 · env 0.55 고정)
        for (const m of [0x8e9aa6, 0x2a323c, 0x0e1319]) {
            ProChar.setTone({ mail: m }); relight();
            out.push(Object.assign({ tag: 'albedo ' + m.toString(16) }, measure()));
        }
        // ② 반사 스윕 — 금속은 화면값을 albedo가 아니라 환경 반사가 지배한다는 가설 검증
        ProChar.setTone({ mail: 0x0e1319 }); relight();
        for (const [mt, ev] of [[0.78, 0.55], [0.6, 0.34], [0.45, 0.2], [0.3, 0.12], [0.18, 0.06]]) {
            setMail(mt, ev);
            out.push(Object.assign({ tag: `metal ${mt} env ${ev}` }, measure()));
        }
        return out;
    });
    console.log('deep color'.padEnd(12), 'maskPx  bandPct  darkPct  crushPct  bodyLum  edgeStep');
    for (const r of rows) console.log(String(r.tag).padEnd(12), String(r.maskPx).padEnd(7), String(r.bandPct).padEnd(8), String(r.darkPct).padEnd(8), String(r.crushPct).padEnd(9), String(r.bodyLum).padEnd(8), r.edgeStep);
    console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
