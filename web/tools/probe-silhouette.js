// 실루엣 분리도 실측 — 영웅을 숨긴 프레임/보이는 프레임을 차분해 정확한 마스크를 얻고,
// 실루엣 경계에서 "캐릭터 픽셀 vs 그 뒤에 있던 배경 픽셀"의 명도 단차를 잰다.
// 이 값이 작으면 윤곽이 배경에 녹아든다(원신급 스타일라이즈드의 1순위 결함).
// 사용: node probe-silhouette.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    // 결정론적 월드 — 소품 배치·풀 위치가 Math.random에 걸려 있어 로드마다 지표가 크게 흔들렸다
    // (같은 코드로 darkPctHero 2.95 / 7.27 / 9.88 관측). 시드 PRNG로 고정해야 전/후 비교가 성립한다.
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });

    await page.waitForTimeout(2500); // 콜드스타트 정착 — 첫 런만 마스크가 300px 작게 잡히던 타이밍 편차 제거
    const r = await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.walking = false; Scene3D.worldX = 0; // 월드 스크롤·걷기 위상 고정
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        // 포즈 고정 — Idle 모션이 계속 돌면 팔·망토 위치가 실행마다 달라 지표가 크게 흔들린다.
        ProChar.update = () => {};
        if (Scene3D.heroRig) { Scene3D.heroRig._t = 0; Scene3D.heroRig._idleT = 0; }
        const R = Scene3D.renderer, gl = R.getContext();
        const w = R.domElement.width, h = R.domElement.height;
        const grab = () => {
            R.render(Scene3D.scene, Scene3D.camera);
            const d = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
            return d;
        };
        const lum = (d, i) => {
            const a = Math.max(d[i], d[i + 1], d[i + 2]) / 255, b = Math.min(d[i], d[i + 1], d[i + 2]) / 255;
            return (a + b) / 2;
        };
        // 영웅(+무기/방패)만 숨긴 배경 프레임 — 그림자는 남아 있어도 경계 비교에는 영향이 적다
        const vis = Scene3D.heroG.visible;
        Scene3D.heroG.visible = false;
        const bg = grab();
        Scene3D.heroG.visible = vis;
        const fg = grab();

        // 마스크: 두 프레임이 유의하게 다른 픽셀 = 영웅이 덮은 자리
        const mask = new Uint8Array(w * h);
        for (let p = 0; p < w * h; p++) {
            const i = p * 4;
            const df = Math.abs(fg[i] - bg[i]) + Math.abs(fg[i + 1] - bg[i + 1]) + Math.abs(fg[i + 2] - bg[i + 2]);
            if (df > 14) mask[p] = 1;
        }
        // 경계 픽셀: 마스크 안이면서 4이웃 중 하나가 마스크 밖
        let bn = 0, stepSum = 0, rimSum = 0;
        let inN = 0, inLum = 0;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            const p = y * w + x;
            if (!mask[p]) continue;
            inN++; inLum += lum(fg, p * 4);
            if (mask[p - 1] && mask[p + 1] && mask[p - w] && mask[p + w]) continue;
            bn++;
            const lf = lum(fg, p * 4), lb = lum(bg, p * 4);
            stepSum += Math.abs(lf - lb);
            rimSum += (lf - lb);            // 양수면 캐릭터 테두리가 배경보다 밝다(=림)
        }
        // 값 구조 — 비평가 2인이 공통 1위로 지목한 '진짜 어두운 값의 부재'.
        // 기준: 화면 전체 중 명도 0.18 이하 픽셀 비율(비평가 B 실측 0.15% 미만), 그리고
        // 캐릭터 실루엣 안에서의 같은 비율(AAA는 캐릭터 면적의 15~20%가 0.10~0.18에 있어야 한다).
        let darkAll = 0, darkHero = 0, allLumSum = 0;
        const lums = [];
        for (let p = 0; p < w * h; p++) {
            const l = lum(fg, p * 4);
            allLumSum += l; lums.push(l);
            if (l <= 0.18) { darkAll++; if (mask[p]) darkHero++; }
        }
        lums.sort((a, b) => a - b);
        return {
            w, h, maskPx: inN, edgePx: bn,
            edgeStep: +(stepSum / bn).toFixed(4),     // 실루엣 경계 평균 명도 단차 (클수록 분리 좋음)
            edgeSigned: +(rimSum / bn).toFixed(4),    // 부호 있는 단차 (+ = 밝은 테두리)
            bodyLum: +(inLum / inN).toFixed(4),
            screenLum: +(allLumSum / (w * h)).toFixed(4),
            medianLum: +lums[Math.floor(lums.length / 2)].toFixed(4),
            darkPctAll: +(darkAll / (w * h) * 100).toFixed(2),   // 목표: 뚜렷한 다크 엔드 존재
            darkPctHero: +(darkHero / inN * 100).toFixed(2),     // 목표 15~20%
        };
    });
    console.log(JSON.stringify(r));
    console.log(errs.length ? 'CONSOLE ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
