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
    // 결정론적 월드 (probe-silhouette.js와 동일 시드) — 대응 비교라 필수는 아니지만 재현성을 위해
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 15000 });

    await page.waitForTimeout(2500);
    const rows = await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.walking = false; Scene3D.worldX = 0;
        ProChar.update = () => {};
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
        // ⚠️ **절대값 비교 금지** — 소품 배치·전투 이펙트·걷기 위상 때문에 로드마다 darkPctHero가
        // 5.5~10.2로 흔들린다(Math.random 시드 고정 + 걷기 정지 후에도 잔존). 그래서 이 도구는
        // **한 프레임 안에서 조건만 토글하는 대응 비교(paired A/B)**만 한다 — 같은 월드·같은 포즈라
        // 차분이 곧 그 조건의 효과다.
        const out = [];
        const relight = () => Scene3D.tintHero();
        const setRecv = v => Scene3D.heroG.traverse(o => { if (o.isMesh) o.receiveShadow = v; });
        // A/B ①: 캐릭터 셀프 섀도 (receiveShadow)
        setRecv(false); out.push(Object.assign({ tag: 'selfShadow OFF' }, measure()));
        setRecv(true); out.push(Object.assign({ tag: 'selfShadow ON' }, measure()));
        // A/B ②: 니어블랙 재질층 (DEEP albedo를 기존 가죽 톤으로 되돌린 대조군)
        ProChar.setDeep({ color: 0x2a1a0d }); out.push(Object.assign({ tag: 'DEEP off(구 가죽)' }, measure()));
        ProChar.setDeep({ color: 0x04050a }); out.push(Object.assign({ tag: 'DEEP on' }, measure()));
        // A/B ③: 블랙엔드 사슬
        ProChar.setTone({ mail: 0x8e9aa6 }); relight(); out.push(Object.assign({ tag: 'mail 구톤' }, measure()));
        ProChar.setTone({ mail: 0x0e1319 }); relight(); out.push(Object.assign({ tag: 'mail 블랙엔드' }, measure()));
        // A/B ④: 섀도맵 텍셀 밀도. **이 행들은 셀프 섀도가 아니라 지면 접지 그림자의 선명도를 잰다** —
        // 아래 결과를 보고 '캐릭터 전용 근접 캐스케이드'를 실제로 구현했다가 되돌린 기록이 TODO에 있으니
        // 같은 길을 다시 파지 말 것(요약: 키라이트를 둘로 쪼개면 넓은 그림자가 그만큼 옅어져 상쇄된다).
        setRecv(true);
        for (const half of [10, 6, 3, 1.5]) {
            const c = Scene3D.sun.shadow.camera;
            c.left = -half; c.right = half; c.top = half; c.bottom = -half;
            c.updateProjectionMatrix();
            out.push(Object.assign({ tag: `shadowCam ±${half}` }, measure()));
        }
        return out;
    });
    console.log('deep color'.padEnd(12), 'maskPx  bandPct  darkPct  crushPct  bodyLum  edgeStep');
    for (const r of rows) console.log(String(r.tag).padEnd(12), String(r.maskPx).padEnd(7), String(r.bandPct).padEnd(8), String(r.darkPct).padEnd(8), String(r.crushPct).padEnd(9), String(r.bodyLum).padEnd(8), r.edgeStep);
    console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
