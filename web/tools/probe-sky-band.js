// `sky-band-composition` 판정용 **자(尺)** — "하늘 그라디언트·산란 로브를 걸 자리가 있는가".
//
// 배경(TODO `sky-band-composition`): 2026-08-19(16) 에 하늘 돔 세그먼트를 72×36 으로 올리고
// 광원 로브(pow6/pow40)까지 넣었는데 **숲만 4.78% 변하고 사막·용암은 변화 화소 0.00%** 였다.
// 원인은 셰이딩이 아니라 **구도**였다: 카메라 피치 −18.8°·세로 FOV 50° 라 지평선 위 가시 하늘이
// 6° 남짓이고, `SUN_DAY` 방위가 카메라 쪽(+z)이라 화면에 보이는 하늘(−z)은 반태양 쪽이다.
// → **먼저 잴 것은 '하늘이 예쁜가'가 아니라 '하늘이 화면에 몇 도·몇 화소 있는가'** 다.
//
// 재는 법 — 색 임계값 추측을 쓰지 않는다(TODO 함정 ①②). 두 축을 각각 독립적으로 잰다:
//   ⓐ **기하(카메라만 보면 나오는 값)**: 피치 = asin(-forward.y), 세로 half-FOV = fov/2.
//      가시 하늘 대역 = (half-FOV − 피치). 렌더와 무관하게 결정적이라 회귀에 강하다.
//   ⓑ **화소(실제로 그려진 것)**: `skyDome.visible` 을 껐다 켜서 **실제로 달라지는 화소**를
//      하늘의 가시 면적으로 삼는다(probe-ridge-layers·probe-flash-gl 이 세운 규약과 같다).
//      마스크가 곧 자가검증이다 — 껐는데 안 변하면 하늘은 화면에 없는 것이다.
//   ⓒ **그라디언트 여지**: ⓑ 마스크 안에서 휘도 p95−p05. 이게 좁으면 램프를 아무리 잘 칠해도
//      화면에서는 단색이다(= '걸 자리가 없다'의 정량 표현).
//   ⓓ **태양이 화면 쪽인가**: 카메라 forward 와 태양 방위(수평 성분)의 내적.
//      음수 = 태양이 카메라 뒤 → 보이는 하늘은 반태양 쪽이라 산란 로브를 걸 자리가 구조적으로 없다.
//
// ⚠️ 이 자는 '예쁨'을 재지 않는다. **선행 조건(자리가 났는가)** 만 잰다 — 미술 판정은 비평가 몫이다.
//
// 사용: node tools/probe-sky-band.js [바이옴]
// exit 0 = 전 바이옴 통과 · 1 = 미달 · 2 = 자 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const ONLY = process.argv[2] || '';

const BIOMES = [
    { biome: 'forest', sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 },
    { biome: 'desert', sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b },
    { biome: 'rock', sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x8a7c68 },
    { biome: 'snow', sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, celestial: 'moon' },
    { biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, celestial: 'moon' },
    { biome: 'lava', sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17 },
];

// 판정선 — 근거는 전부 '되돌린 2026-08-19(16) 판'의 실측이다.
//  · MIN_BAND_DEG 11: 종전 6.15° 에서 로브가 통째로 프레임 밖이었다. 현행 채택값은 12.15° 다.
//    ⚠️ **12 로 조이지 말 것** — 채택값과 1.2% 차이라 FOV 를 한 칸만 건드려도 뒤집히는 '붙은 게이트'가
//    된다(이 저장소가 `probe-nova-beat` 에서 이미 겪고 있는 병이다: 문턱 600 에 실측 582~632 라
//    부하에 따라 빨강/초록이 바뀐다). 11 은 실패 상태(6.15)와 확실히 갈리면서 위로 여유가 있다.
//  · MIN_SKY_PCT 0.055: 종전 숲 A/B 변화가 화면의 4.78% 였고 그게 6바이옴 중 최대였다.
//  · MIN_RAMP 14: 램프가 이보다 좁으면 ACES 압축 뒤 화면에서 단색으로 읽힌다(paintSky 주석의 실측).
const MIN_BAND_DEG = 11;
const MIN_SKY_PCT = 0.055;
const MIN_RAMP = 14;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(INDEX);
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.renderer && Scene3D.heroG', { timeout: 180000, label: '전장 부팅' });

    const list = ONLY ? BIOMES.filter(b => b.biome === ONLY) : BIOMES;
    const rows = [];
    let fail = 0;

    for (const b of list) {
        const r = await page.evaluate(async (theme) => {
            Scene3D.setTheme(theme);
            if (!Scene3D.skyDome) return { broken: '하늘 돔 없음' };
            // 🚨 TODO 함정 ③: 헤드리스에서는 `Scene3D.update` 가 rAF 라 사실상 안 돌고 연출이 수십 개
            //    밀린다. 밀린 `fovPunch` 하나가 FOV 를 49.93 처럼 남겨 두면 **가시 대역이 런마다 흔들린다**
            //    (실측: 용암만 50 이 아니라 49.93 으로 찍혔다). 백로그를 비우고 FOV 를 기준값으로 되돌린다.
            Scene3D.anims.length = 0;
            if (Scene3D._fov0 !== undefined) Scene3D.camera.fov = Scene3D._fov0;
            Scene3D.camera.updateProjectionMatrix();

            // ⓐ 기하 — 렌더와 무관. 카메라 행렬에서 직접 뽑는다(리터럴을 베끼면 코드와 갈린다).
            const cam = Scene3D.camera;
            cam.updateMatrixWorld(true);
            const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
            const pitchDeg = Math.asin(-fwd.y) * 180 / Math.PI;      // 아래를 보면 +
            const halfFovDeg = cam.fov / 2;
            const bandDeg = halfFovDeg - pitchDeg;                    // 지평선 위 가시 하늘 각도

            // ⓓ 태양이 화면 쪽인가 — 수평 성분끼리의 내적(+1 정면, −1 등 뒤)
            const sunPos = Scene3D.sun ? Scene3D.sun.position : null;
            let sunFacing = null, sunAzDeg = null;
            if (sunPos) {
                const s = new THREE.Vector3(sunPos.x, 0, sunPos.z).normalize();
                const f = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
                sunFacing = s.dot(f);
                sunAzDeg = Math.acos(Math.max(-1, Math.min(1, sunFacing))) * 180 / Math.PI;
            }

            // ⓑ 화소 — 돔을 껐다 켜서 실제 달라지는 화소를 마스크로.
            const gl = Scene3D.renderer.getContext();
            const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
            const grab = () => {
                Scene3D.renderFrame();
                const px = new Uint8Array(w * h * 4);
                gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
                return px;
            };
            const withSky = grab();
            Scene3D.skyDome.visible = false;
            const noSky = grab();
            Scene3D.skyDome.visible = true;

            const lum = [];
            let n = 0, topY = -1, botY = -1;
            for (let i = 0; i < w * h; i++) {
                const o = i * 4;
                const d = Math.abs(withSky[o] - noSky[o]) + Math.abs(withSky[o + 1] - noSky[o + 1]) + Math.abs(withSky[o + 2] - noSky[o + 2]);
                if (d <= 8) continue;                                  // 경계 화소 잡음 컷(probe-ridge-layers 와 같은 문턱)
                n++;
                lum.push(0.2126 * withSky[o] + 0.7152 * withSky[o + 1] + 0.0722 * withSky[o + 2]);
                const row = Math.floor(i / w);                          // readPixels 는 아래가 0
                if (topY < 0 || row > topY) topY = row;
                if (botY < 0 || row < botY) botY = row;
            }
            let ramp = 0, mean = 0;
            if (n > 0) {
                lum.sort((a, b) => a - b);
                ramp = lum[Math.floor(n * 0.95)] - lum[Math.floor(n * 0.05)];
                mean = lum.reduce((s, v) => s + v, 0) / n;
            }
            return {
                bandDeg, pitchDeg, fov: cam.fov, sunFacing, sunAzDeg,
                skyPct: n / (w * h), ramp, mean,
                // 하늘 마스크가 화면에서 차지하는 세로 구간(위=1) — 띠가 실제로 어디 있는지
                bandTop: topY < 0 ? null : topY / h, bandBot: botY < 0 ? null : botY / h,
            };
        }, b);

        if (r.broken) { console.log('자 고장:', r.broken); await browser.close(); process.exit(2); }

        const okBand = r.bandDeg >= MIN_BAND_DEG;
        const okPct = r.skyPct >= MIN_SKY_PCT;
        const okRamp = r.ramp >= MIN_RAMP;
        const okSun = r.sunFacing === null || r.sunFacing > 0;
        if (!(okBand && okPct && okRamp && okSun)) fail = 1;
        rows.push({ b: b.biome, r, okBand, okPct, okRamp, okSun });
    }

    console.log('바이옴     가시대역°  피치°  FOV   하늘%   램프   평균L  태양방위°(내적)   판정');
    for (const { b, r, okBand, okPct, okRamp, okSun } of rows) {
        console.log(
            b.padEnd(9),
            r.bandDeg.toFixed(2).padStart(8) + (okBand ? ' ' : '!'),
            r.pitchDeg.toFixed(1).padStart(6),
            String(r.fov).padStart(5),
            (r.skyPct * 100).toFixed(2).padStart(6) + (okPct ? ' ' : '!'),
            r.ramp.toFixed(1).padStart(6) + (okRamp ? ' ' : '!'),
            r.mean.toFixed(1).padStart(6),
            (r.sunAzDeg === null ? '   —' : r.sunAzDeg.toFixed(1).padStart(7) + '(' + r.sunFacing.toFixed(2) + ')') + (okSun ? ' ' : '!'),
            (okBand && okPct && okRamp && okSun) ? '  ✅' : '  ❌'
        );
    }
    console.log(`\n기준: 가시대역 ≥${MIN_BAND_DEG}° · 하늘 ≥${(MIN_SKY_PCT * 100).toFixed(1)}% · 램프 ≥${MIN_RAMP} · 태양 내적 >0(화면 쪽)`);
    if (errs.length) { console.log('콘솔 에러:', errs.slice(0, 3)); fail = 1; }
    console.log(fail ? '❌ 미달 — 하늘 그라디언트/산란을 걸 자리가 아직 없다' : '✅ 통과 — 하늘 대역이 열렸다');
    await browser.close();
    process.exit(fail);
})();
