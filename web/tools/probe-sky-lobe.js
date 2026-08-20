// `map-quality-up` — 태양 산란 로브가 **화면에서 실제로 보이는가**를 재는 자.
//
// ── 왜 이 자가 따로 필요한가 ───────────────────────────────────────────────────
// 2026-08-19(16) 이 같은 연출(돔 72×36 + pow6/pow40 로브 + 방위각 항)을 **구현하고 되돌렸다.**
// 코드는 멀쩡했는데 A/B 를 재니 **숲만 4.78% 변하고 사막·용암은 변화 화소 0.00%** 였다.
// 원인은 셰이딩이 아니라 구도였다(`sky-band-composition` 에서 해결):
//   ⓐ 가시 하늘이 6.15° 뿐이라 로브가 프레임 밖  ⓑ `SUN_DAY` 방위가 카메라 뒤.
// 그래서 이 연출만은 "코드를 넣었다"가 아니라 **"켜고 끄면 화면이 달라진다"** 로 판정한다.
//
// 재는 법 — `Scene3D.SKY_LOBE` 를 0/1 로 두고 각각 다시 칠해(`setTheme`) 렌더한 두 프레임의
// 차분. 색 임계값 추측이 없다: 로브 자체가 유일한 변인이다.
//   · 변화 화소 비율  → 0 이면 '걸 자리가 없다'(옛 실패 재현)
//   · 최대 채널 델타  → 변하긴 하는데 눈에 안 보일 만큼인지
//   · 변화 화소의 무게중심 화면 y → 로브가 **하늘 대역 안**에 앉았는지(지면을 물들인 게 아닌지)
//
// 사용: node tools/probe-sky-lobe.js
// exit 0 = 전 바이옴 통과 · 1 = 미달 · 2 = 자 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const BIOMES = [
    { biome: 'forest', sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 },
    { biome: 'desert', sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b },
    { biome: 'rock', sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x8a7c68 },
    { biome: 'snow', sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, celestial: 'moon' },
    { biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, celestial: 'moon' },
    { biome: 'lava', sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17 },
];

// 기준선: 옛 실패값(숲 4.78% · 나머지 0.00%)보다 확실히 위. 전 바이옴이 넘어야 한다.
const MIN_PCT = 0.02;    // 화면의 2%
const MIN_DELTA = 8;     // 최대 채널 델타(이보다 작으면 A/B 로만 보이고 눈엔 안 보인다)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(INDEX);
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.renderer && Scene3D.heroG', { timeout: 180000, label: '전장 부팅' });

    let fail = 0;
    const rows = [];
    for (const b of BIOMES) {
        const r = await page.evaluate(async (theme) => {
            if (Scene3D.SKY_LOBE === undefined) return { broken: 'SKY_LOBE 훅 없음' };
            Scene3D.anims.length = 0;
            if (Scene3D._fov0 !== undefined) Scene3D.camera.fov = Scene3D._fov0;
            Scene3D.camera.updateProjectionMatrix();
            const gl = Scene3D.renderer.getContext();
            const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
            const shot = (lobe) => {
                Scene3D.SKY_LOBE = lobe;
                Scene3D.setTheme(theme);            // 다시 칠한다 — 로브는 정점색이라 repaint 가 유일한 경로
                Scene3D.renderFrame();
                const p = new Uint8Array(w * h * 4);
                gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, p);
                return p;
            };
            const off = shot(0), on = shot(1);
            let n = 0, maxD = 0, sumY = 0;
            for (let i = 0; i < w * h; i++) {
                const o = i * 4;
                const d = Math.max(Math.abs(on[o] - off[o]), Math.abs(on[o + 1] - off[o + 1]), Math.abs(on[o + 2] - off[o + 2]));
                if (d > maxD) maxD = d;
                if (d >= 3) { n++; sumY += 1 - Math.floor(i / w) / h; }   // readPixels 는 아래가 0 → 위=0 으로 뒤집는다
            }
            return { pct: n / (w * h), maxD, cy: n ? sumY / n : null };
        }, b);
        if (r.broken) { console.log('자 고장:', r.broken); await browser.close(); process.exit(2); }
        const ok = r.pct >= MIN_PCT && r.maxD >= MIN_DELTA;
        if (!ok) fail = 1;
        rows.push({ b: b.biome, r, ok });
    }

    console.log('바이옴    변화화소%   최대Δ   변화 무게중심 화면y   판정');
    for (const { b, r, ok } of rows)
        console.log(b.padEnd(9), (r.pct * 100).toFixed(2).padStart(8), String(r.maxD).padStart(7),
            (r.cy === null ? '     —' : r.cy.toFixed(3)).padStart(20), ok ? '   ✅' : '   ❌');
    console.log(`\n기준: 변화 화소 ≥${MIN_PCT * 100}% · 최대Δ ≥${MIN_DELTA}  (옛 실패값: 숲 4.78% · 사막·용암 0.00%)`);
    if (errs.length) { console.log('콘솔 에러:', errs.slice(0, 3)); fail = 1; }
    console.log(fail ? '❌ 미달 — 로브가 화면에 안 걸린다' : '✅ 통과 — 산란 로브가 화면에서 실제로 보인다');
    await browser.close();
    process.exit(fail);
})();
