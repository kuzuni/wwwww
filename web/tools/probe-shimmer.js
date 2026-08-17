// 텍스처 에일리어싱(시머) 실측 — 비평가 2인이 공통 지목한 "사슬이 흑백 체커로 뭉개지고
// 움직이면 지글거릴 것"을 정량화한다. 카메라를 아주 조금(서브픽셀 수준) 움직인 두 프레임의
// 캐릭터 영역 픽셀 차이를 잰다: 에일리어싱이 심하면 미세 이동에도 픽셀이 크게 튄다.
// 사용: node probe-shimmer.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig, null, { timeout: 60000 });

    const r = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        ProChar.update = () => {};
        Scene3D.heroRig._t = 0; Scene3D.heroRig._idleT = 0;
        const R = Scene3D.renderer, gl = R.getContext();
        const w = R.domElement.width, h = R.domElement.height;
        const cam = Scene3D.camera;
        // 영웅을 화면 가득 채워 사지(원통)를 크게 — 사슬 텍스처가 판독되는 거리
        const box = new THREE.Box3().setFromObject(Scene3D.heroRig.group);
        const c = box.getCenter(new THREE.Vector3());
        const baseP = c.clone().add(new THREE.Vector3(0.55, 0.28, 1.5));
        const shoot = (dx) => {
            cam.position.copy(baseP).add(new THREE.Vector3(dx, 0, 0));
            cam.lookAt(c); cam.updateMatrixWorld();
            R.render(Scene3D.scene, cam);
            const d = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
            return d;
        };
        const lum = (d, i) => (Math.max(d[i], d[i + 1], d[i + 2]) / 255 + Math.min(d[i], d[i + 1], d[i + 2]) / 255) / 2;
        // 캐릭터 마스크 (배경 제외) — 영웅 숨긴 프레임과 차분
        // ⚠️ A/B를 **같은 페이지 세션 안에서** 한다. 소품 스캐터가 실행마다 랜덤이라
        // 프로세스를 다시 띄워 비교하면 마스크 크기가 62k~68k로 흔들려 1%p 차이를 분간할 수 없다.
        const setAniso = (v) => {
            for (const k in ProChar._texCache) {
                const t = ProChar._texCache[k];
                if (t.anisotropy !== v) { t.anisotropy = v; t.needsUpdate = true; }
            }
        };
        const run = () => {
            const a = shoot(0);
            const visSave = Scene3D.heroG.visible;
            Scene3D.heroG.visible = false;
            const bg = shoot(0);
            Scene3D.heroG.visible = visSave;
            const b = shoot(0.006);   // 서브픽셀~1픽셀 수준 미세 이동
            let n = 0, shimmer = 0, big = 0, sd = 0, mean = 0;
            const vals = [];
            for (let p = 0; p < w * h; p++) {
                const i = p * 4;
                if (Math.abs(a[i] - bg[i]) + Math.abs(a[i + 1] - bg[i + 1]) + Math.abs(a[i + 2] - bg[i + 2]) <= 14) continue;
                const la = lum(a, i), lb = lum(b, i), dd = Math.abs(la - lb);
                n++; shimmer += dd; vals.push(la); mean += la;
                if (dd > 0.12) big++;   // 미세 이동으로 명도가 12%p 이상 튄 픽셀 = 명백한 에일리어싱
            }
            mean /= n;
            for (const v of vals) sd += (v - mean) * (v - mean);
            return {
                maskPx: n,
                shimmerMean: +(shimmer / n).toFixed(5),          // 낮을수록 안정 (에일리어싱 적음)
                shimmerBigPct: +(big / n * 100).toFixed(2),      // 크게 튄 픽셀 비율
                lumStd: +Math.sqrt(sd / n).toFixed(4),           // 캐릭터 내부 명도 분산 (체커면 커진다)
            };
        };
        const out = {};
        setAniso(1);  out.aniso1 = run();
        setAniso(16); out.aniso16 = run();
        setAniso(ProChar.maxAnisotropy);
        return out;
    });
    console.log(JSON.stringify(r));
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
