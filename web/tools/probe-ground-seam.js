// 지면 '사각 이음매' 실측 (비평가 4차 지적 ⓔ — "오버레이가 켜진 프레임 b1·b4·c1·c3에서 지면에 사각 이음매가 보인다").
// 지적이 '미확인'으로 등재된 건이라 **고치기 전에 있는지부터 재고, 있으면 원인을 귀속시킨다.**
// 사용: node probe-ground-seam.js
//
// 재는 것
//  ① 3D 캔버스만 찍어 **행 평균 휘도 프로파일**을 뽑고, 인접 행 대비 급변(step)을 찾는다 — '선'이 실재하는가.
//  ② 그 행에서 **열 방향으로 경계 y가 어디서 꺾이는지**(jog)를 찾는다 — 꺾임이 있으면 광원 프러스텀 같은
//     축 정렬 사각 경계라는 뜻이고, 없으면 원근에 따른 자연스러운 밴드다.
//  ③ A/B 토글로 귀속: 그림자 전체 / 지면 receiveShadow / 흙길 데칼 / 섀도 카메라 확대.
//  ④ 비네트(오버레이) on/off — "오버레이가 켜진 프레임에서만 보인다"는 지적 부분을 검증한다.
//
// ⚠️ 3D 루프가 도는 동안 swiftshader 스크린샷은 15~30초다 → Scene3D.update 를 먼저 멈추고 수동 렌더한다.
// ⚠️ 좌표는 **캔버스 로컬 픽셀**이다(캔버스 element 만 찍는다). 뷰포트 좌표와 섞지 말 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const W = 480, H = 854;
const OUT = path.resolve(__dirname);

// 페이지 안에서 PNG 를 디코드한다 (외부 이미지 라이브러리 금지)
async function analyze(page, buf) {
    return page.evaluate(async (b64) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, img.width, img.height).data;
        const Wd = img.width, Hd = img.height;
        const lum = (x, y) => { const i = (y * Wd + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
        // 지면 밴드 = 아래 45% (지평선·나무 위쪽을 뺀다)
        const y0 = Math.floor(Hd * 0.55), y1 = Hd - 2;
        const rows = [];
        for (let y = y0; y < y1; y++) {
            let s = 0; for (let x = 2; x < Wd - 2; x++) s += lum(x, y);
            rows.push(s / (Wd - 4));
        }
        // 행 간 단차 — 지면은 원근 때문에 완만히 변하므로, 한 행에서 튀면 그게 '선'이다
        const steps = [];
        for (let i = 2; i < rows.length - 2; i++) {
            const before = (rows[i - 2] + rows[i - 1]) / 2, after = (rows[i + 1] + rows[i + 2]) / 2;
            steps.push([y0 + i, +(after - before).toFixed(3)]);
        }
        const sorted = [...steps].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
        const absSteps = steps.map(s => Math.abs(s[1])).sort((a, b) => a - b);
        const medStep = absSteps[Math.floor(absSteps.length / 2)] || 1e-6;
        const top = sorted.slice(0, 5).map(s => [s[0], s[1], +(Math.abs(s[1]) / medStep).toFixed(1)]);
        // 최대 단차 행에서 열별로 경계 y 를 추적한다 (jog 검출)
        const seamY = sorted[0][0];
        const jog = [];
        for (let x = 4; x < Wd - 4; x += Math.max(1, Math.floor(Wd / 24))) {
            let best = 0, bestY = -1;
            for (let y = Math.max(y0 + 2, seamY - 26); y < Math.min(y1 - 2, seamY + 26); y++) {
                const g = Math.abs((lum(x, y + 2) + lum(x, y + 1)) / 2 - (lum(x, y - 1) + lum(x, y - 2)) / 2);
                if (g > best) { best = g; bestY = y; }
            }
            jog.push([x, bestY, +best.toFixed(1)]);
        }
        return { size: [Wd, Hd], medStep: +medStep.toFixed(3), topSteps: top, seamY, jog };
    }, buf.toString('base64'));
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1800);

    await page.evaluate(() => {
        Scene3D.update = function () { };
        Combat.tick = function () { };
        window.__render = () => Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
    });
    await page.waitForTimeout(300);

    const canvas = page.locator('canvas').first();
    const run = async (label) => {
        await page.evaluate(() => window.__render());
        const b = await canvas.screenshot({ timeout: 90000 });
        const a = await analyze(page, b);
        console.log('%s  단차중앙값=%s | 최대단차 행: %s',
            label.padEnd(20), String(a.medStep).padStart(6),
            a.topSteps.map(s => `y${s[0]} ${s[1] > 0 ? '+' : ''}${s[1]}(중앙값×${s[2]})`).join(', '));
        return { a, buf: b };
    };
    const jogReport = (a) => {
        const ys = a.jog.map(j => j[1]);
        const uniq = [...new Set(ys)].sort((p, q) => p - q);
        console.log('   경계 y (열별): %s', a.jog.map(j => `${j[0]}:${j[1]}`).join(' '));
        console.log('   → 경계 y 범위 %d..%d (폭 %d px) — 꺾임이 크면 축정렬 사각 경계다', uniq[0], uniq[uniq.length - 1], uniq[uniq.length - 1] - uniq[0]);
    };

    console.log('\n── ① 기준 프레임 ──');
    const base = await run('base');
    fs.writeFileSync(path.join(OUT, 'gseam-base.png'), base.buf);
    jogReport(base.a);

    console.log('\n── ② 오버레이(비네트) 켠 상태 — 지적이 말한 조건 ──');
    await page.evaluate(() => {
        const el = document.getElementById('dmg-flash');
        el.style.setProperty('--vig', '1');
        el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
        el.style.animationPlayState = 'paused'; el.style.animationDelay = '-0.014s';
    });
    await page.waitForTimeout(120);
    const vig = await run('vignette-on');
    fs.writeFileSync(path.join(OUT, 'gseam-vignette.png'), vig.buf);
    await page.evaluate(() => {
        const el = document.getElementById('dmg-flash');
        el.classList.remove('on'); el.style.animationPlayState = ''; el.style.animationDelay = '';
    });
    await page.waitForTimeout(80);

    console.log('\n── ③ 원인 귀속 A/B ──');
    const toggles = [
        ['shadowMap-off', () => { Scene3D.renderer.shadowMap.enabled = false; Scene3D.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); },
            () => { Scene3D.renderer.shadowMap.enabled = true; Scene3D.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }],
        ['ground-noRecv', () => { Scene3D.ground.receiveShadow = false; Scene3D.terrainMat.needsUpdate = true; },
            () => { Scene3D.ground.receiveShadow = true; Scene3D.terrainMat.needsUpdate = true; }],
        ['path-off', () => { Scene3D.pathMesh.visible = false; }, () => { Scene3D.pathMesh.visible = true; }],
        ['shadowCam-x3', () => {
            const s = Scene3D.sun.shadow.camera;
            Scene3D._sc = [s.left, s.right, s.top, s.bottom, s.far];
            s.left = -30; s.right = 30; s.top = 30; s.bottom = -30; s.far = 60; s.updateProjectionMatrix();
            Scene3D.sun.shadow.needsUpdate = true;
        }, () => {
            const s = Scene3D.sun.shadow.camera, v = Scene3D._sc;
            s.left = v[0]; s.right = v[1]; s.top = v[2]; s.bottom = v[3]; s.far = v[4]; s.updateProjectionMatrix();
            Scene3D.sun.shadow.needsUpdate = true;
        }],
    ];
    for (const [name, on, off] of toggles) {
        await page.evaluate(`(${on.toString()})()`);
        await page.waitForTimeout(80);
        const r = await run(name);
        fs.writeFileSync(path.join(OUT, 'gseam-' + name + '.png'), r.buf);
        jogReport(r.a);
        await page.evaluate(`(${off.toString()})()`);
        await page.waitForTimeout(80);
    }

    console.log('\n판정: 어떤 토글에서 "최대단차 중앙값 배율"이 무너지면 그것이 원인이다.');
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    await browser.close();
    process.exit(errors.length ? 1 : 0);
})();
