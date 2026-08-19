// 지면 **텍스처 타일** 이음매 실측 (map-quality-up)
// ⚠️ 이름이 비슷한 `probe-ground-seam.js` 와 **다른 도구**다 — 그쪽은 화면에 보이는 '사각 이음매'
//    (그림자 프러스텀 경계·흙길 데칼)를 캔버스 캡처로 재고, 이쪽은 **텍스처 자체가 타일링되는지**를
//    캔버스 화소로 잰다. 둘 다 필요하니 지우지 말 것.
// 왜: 지면 텍스처는 12×6 으로 **반복**되는데, 절차 생성 도형을 한 번만 그리면 오른쪽 끝에서 잘린
//     얼룩이 왼쪽 끝에 이어지지 않아 타일 경계마다 줄이 선다. 화면에서는 지면 한가운데를 가르는
//     곧은 세로선으로 보인다(ch3 하단에서 육안 확인, 비평가 B 도 "UV 심과 타일링이 노출"로 지적).
// 재는 법: 랩 경계(열 0 ↔ 열 W-1, 행 0 ↔ 행 H-1)의 화소 차를 **내부 인접 화소 차**와 비교한다.
//     이음매가 없으면 둘이 비슷해야 한다(경계도 그냥 '인접한 두 열'일 뿐이므로).
//     ⚠️ 절대값으로 판정하면 안 된다 — 바이옴마다 노이즈 세기가 달라 내부 차가 4~20 으로 널뛴다.
//     그래서 **비(seam/inner)** 로 본다. 1.0 이 이상적, 1.25 초과면 눈에 보이는 줄이다.
// 사용: node probe-ground-seam.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
// ⚠️ **한 번 돌려 판정하지 말 것.** 텍스처는 매 부팅 `Math.random()` 으로 새로 굽기 때문에 비율이
//     런마다 흔들린다(실측 5회: 4회 전부 통과, 1회가 게이트를 스쳤다). 값은 보통 0.91~1.13 대역이라
//     여유가 있지만, 경계에 걸리면 **3회 중앙값**으로 볼 것.
const GATE = 1.25;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).split('\n')[0]));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });

    const rows = await page.evaluate(() => {
        const measure = (tex) => {
            const im = tex.image;
            const c = document.createElement('canvas');
            c.width = im.width; c.height = im.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
            const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
            const diff = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
            let sV = 0, iV = 0, sH = 0, iH = 0;
            for (let y = 0; y < H; y++) { sV += diff(px(0, y), px(W - 1, y)); iV += diff(px(W >> 1, y), px((W >> 1) + 1, y)); }
            for (let x = 0; x < W; x++) { sH += diff(px(x, 0), px(x, H - 1)); iH += diff(px(x, H >> 1), px(x, (H >> 1) + 1)); }
            return { sV: sV / H, iV: iV / H, sH: sH / W, iH: iH / W };
        };
        const out = [];
        for (const b of ['forest', 'desert', 'rock', 'snow', 'lava', 'magic']) {
            const gt = Scene3D.groundTexFor(b);
            for (const [kind, tex] of [['albedo', gt.map], ['normal', gt.normal]]) {
                const m = measure(tex);
                out.push({ biome: b, kind,
                    ratioV: +(m.sV / Math.max(0.01, m.iV)).toFixed(2), ratioH: +(m.sH / Math.max(0.01, m.iH)).toFixed(2),
                    sV: +m.sV.toFixed(1), iV: +m.iV.toFixed(1), sH: +m.sH.toFixed(1), iH: +m.iH.toFixed(1) });
            }
        }
        return out;
    });
    await browser.close();

    let fails = 0;
    console.log(`바이옴     종류    세로비  가로비   (경계/내부 — 1.00 이상적, ${GATE} 초과 = 줄이 보인다)`);
    for (const r of rows) {
        const bad = r.ratioV > GATE || r.ratioH > GATE;
        if (bad) fails++;
        console.log(`${bad ? 'FAIL' : 'OK  '} ${r.biome.padEnd(7)} ${r.kind.padEnd(7)} ${String(r.ratioV).padStart(5)} ${String(r.ratioH).padStart(6)}   (세로 ${r.sV}/${r.iV} · 가로 ${r.sH}/${r.iH})`);
    }
    if (errors.length) { console.log(`콘솔 에러 ${errors.length}건: ${errors[0]}`); fails++; }
    console.log(fails ? `\n실패 ${fails}건` : '\n전부 통과 — 타일 경계에 줄 없음');
    process.exit(fails ? 1 : 0);
})();
