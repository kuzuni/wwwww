// hp-juicy 6차 지적 ⓐ('처치 시 HP바가 흰 풀바로 보인다', A #5) 실측.
// 항목 규칙상 6차 지적은 미검증이라 착수 전에 재는 게 먼저다.
//
// 코드를 읽으면 원인 후보가 뚜렷하다(killEnemy): 처치 순간 앞바(hpFg)는 0.001 로 스냅(비움)되지만,
// **트랙(hpBg)이 흰색으로 물들어(fl = 1 − t/0.17) 0.17초간 full-width 로 밝게 유지**된다.
// HP바는 '밝은 면적이 얼마냐'로 읽히므로, full-width 흰 사각이 0.17초 떠 있으면 '가득 찬 바'로 읽힌다
// — 처치가 전하려는 '비웠다'의 정반대 신호다.
//
// 재는 것: 처치 순간부터 바가 사라질 때까지, **렌더된 바 스트립 픽셀을 직접 읽어**(readRenderTargetPixels,
//   스크린샷 아님 — probe-flash-gl 과 같은 이유) 프레임마다
//   ⒜ 바 폭 중 '밝게 읽히는(=채워 보이는)' 구간의 비율  ⒝ 바 영역 평균 채도(흰색이면 낮다)
// 판정: 밝은 폭 비율이 FULL_FRAC 이상이면서 채도가 낮은(=흰) 프레임이 HOLD_MS 이상 지속되면
//       '흰 풀바'가 실재한다.
//
// ⚠️ 자가검증: 바를 껐다 켜서 '바가 실제로 그 스트립에 그려지는지'를 먼저 확인한다(안 그리면 판정 무효).
// 사용: node tools/probe-killbar-read.js [enemyKind]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KIND = process.argv[2] || 'golem';
const FULL_FRAC = 0.7;   // 바 폭의 70% 이상이 밝으면 '채워 보인다'
const LOW_SAT = 0.25;    // 채도가 이 아래면 '흰색'으로 읽힌다
const HOLD_MS = 100;     // 그 상태가 100ms 이상 지속되면 '풀바'로 각인된다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 180000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive && Scene3D.enemyMap.get(e.id)), null, { timeout: 180000 });

    const out = await page.evaluate(() => {
        Combat.tick = () => { };
        Scene3D.walking = false;
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        const step = (sec) => { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) realUpdate(1 / 120); };
        Scene3D.anims.length = 0;
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        step(0.5);
        if (!Scene3D.postOn || !Scene3D._rtScene) return { fatal: 'postOn off' };

        const r = Scene3D.renderer;
        const db = new THREE.Vector2(); r.getDrawingBufferSize(db);
        const W = Math.floor(db.x), H = Math.floor(db.y);
        const cap = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
        cap.texture.encoding = THREE.sRGBEncoding;
        const grab = () => {
            Scene3D.renderFrame();
            Scene3D._fsQuad.material = Scene3D._compMat;
            r.setRenderTarget(cap); r.render(Scene3D._fsScene, Scene3D._fsCam);
            r.setRenderTarget(null);
            const b = new Uint8Array(W * H * 4); r.readRenderTargetPixels(cap, 0, 0, W, H, b); return b;
        };

        const e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
        const m = Scene3D.enemyMap.get(e.id);
        const cv = r.domElement, rect = cv.getBoundingClientRect();
        const sx = W / rect.width, sy = H / rect.height;
        const projGL = (v) => {
            const p = v.clone().project(Scene3D.camera);
            return [((p.x * 0.5 + 0.5) * rect.width) * sx, H - ((0.5 - p.y * 0.5) * rect.height) * sy];
        };
        // 바 스트립 bbox — hpBg(트랙, full width) 기준
        const barBox = () => {
            m.hpG.updateWorldMatrix(true, true);
            const b = new THREE.Box3().setFromObject(m.hpBg);
            let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
            for (const xi of [b.min.x, b.max.x]) for (const yi of [b.min.y, b.max.y]) {
                const [px, py] = projGL(new THREE.Vector3(xi, yi, b.max.z));
                x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
            }
            return [Math.max(0, Math.floor(x0)), Math.max(0, Math.floor(y0)), Math.min(W, Math.ceil(x1)), Math.min(H, Math.ceil(y1))];
        };

        const srgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const lumAt = (b, i) => 0.2126 * srgb(b[i]) + 0.7152 * srgb(b[i + 1]) + 0.0722 * srgb(b[i + 2]);
        const satAt = (b, i) => { const R = b[i] / 255, G = b[i + 1] / 255, B = b[i + 2] / 255; const mx = Math.max(R, G, B), mn = Math.min(R, G, B); return mx <= 0 ? 0 : (mx - mn) / mx; };

        // 자가검증: 바를 껐다 켠 차분이 바가 그려진 픽셀
        const box = barBox();
        const bump = () => grab();
        m.hpG.visible = false; const off = bump();
        m.hpG.visible = true; const on = bump();
        let barPix = 0;
        for (let y = box[1]; y < box[3]; y++) for (let x = box[0]; x < box[2]; x++) {
            const i = (y * W + x) * 4;
            if (Math.abs(off[i] - on[i]) + Math.abs(off[i + 1] - on[i + 1]) + Math.abs(off[i + 2] - on[i + 2]) > 10) barPix++;
        }
        if (barPix < 60) return { fatal: 'SELFCHECK', barPix, box };

        // 프레임 분석: 바 스트립 각 열의 '밝은 픽셀 유무' → 밝은 폭 비율, 스트립 평균 채도
        const analyze = () => {
            const b = grab();
            const bx = barBox();
            const cols = bx[2] - bx[0];
            if (cols <= 0) return null;
            let brightCols = 0, satSum = 0, satN = 0, lumSum = 0, lumN = 0;
            for (let x = bx[0]; x < bx[2]; x++) {
                let anyBright = false;
                for (let y = bx[1]; y < bx[3]; y++) {
                    const i = (y * W + x) * 4;
                    const l = lumAt(b, i);
                    lumSum += l; lumN++;
                    if (l > 0.55) anyBright = true;
                    satSum += satAt(b, i); satN++;
                }
                if (anyBright) brightCols++;
            }
            return { brightFrac: +(brightCols / cols).toFixed(3), sat: +(satSum / Math.max(1, satN)).toFixed(3), lum: +(lumSum / Math.max(1, lumN)).toFixed(3) };
        };

        const rows = [];
        Combat.damageEnemy(e, Big.of(e.hp).mul(10), false, null);   // 진짜 처치
        for (let t = 0; t <= 340; t += 16) { rows.push({ t, ...analyze() }); step(0.016); }
        return { rows, box, barPix, kind: m.kind };
    });

    if (out.fatal === 'SELFCHECK') { console.log('\n🚨 자 고장 — 바가 스트립에 안 그려진다(barPix=%d). 판정 안 함.', out.barPix); await browser.close(); process.exit(2); }
    if (out.fatal) { console.log('\n🚨 %s', out.fatal); await browser.close(); process.exit(1); }

    const pad = (v, n) => String(v).padStart(n);
    console.log('\n== 처치 바 렌더 판독 (%s, 바 스트립 %d px 확인) ==', out.kind, out.barPix);
    console.log('   시각    밝은폭비율  채도    평균휘도   판정');
    let holdStart = null, worstHold = 0;
    for (const r of out.rows) {
        const whiteFull = r.brightFrac >= FULL_FRAC && r.sat <= LOW_SAT;
        if (whiteFull) { if (holdStart === null) holdStart = r.t; worstHold = Math.max(worstHold, r.t - holdStart + 16); }
        else holdStart = null;
        console.log('  +%sms  %s  %s  %s   %s', pad(r.t, 3), pad(r.brightFrac, 9), pad(r.sat, 6), pad(r.lum, 8), whiteFull ? '⚠️ 흰 풀바' : '');
    }
    console.log('\n  흰 풀바(밝은폭≥%d%% & 채도≤%s)로 읽히는 최장 지속 = %dms (한계 %dms)', FULL_FRAC * 100, LOW_SAT, worstHold, HOLD_MS);
    const fail = worstHold >= HOLD_MS;
    console.log('  판정 ⓐ: %s', fail ? '❌ 지적이 맞다 — 처치 바가 흰 풀바로 각인된다' : '✅ 흰 풀바로 읽히지 않는다');
    console.log('\n콘솔 에러 %d건%s', errors.length, errors.length ? ': ' + errors.slice(0, 3).join(' | ') : '');
    await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
