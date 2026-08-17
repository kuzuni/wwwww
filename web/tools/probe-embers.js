// 발광 먼지/불씨(Scene3D.embers) 실측 — 'HP 타격감' 3차 메모의 배경 관찰
// "초원 바이옴의 발광 먼지가 블룸과 겹쳐 화면 우측에 허연 뭉텅이로 뜬다"를 수치로 확인한다.
// 사용: node probe-embers.js
// 재는 것: ① 매 프레임 실제 material.opacity 범위(빌드 시 의도값과 같은가)
//          ② 같은 프레임에서 불씨만 껐다 켜서 diff — 불씨가 만든 밝은 픽셀 수·최대 밝기
//            (밝은 하늘에 가산 합성이라, '뭉텅이'인지 '반짝임'인지는 이 diff로만 갈린다)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const W = 480, H = 854;

async function decode(page, buf) {
    return page.evaluate(async (b64) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, d: Array.from(x.getImageData(0, 0, img.width, img.height).data) };
    }, buf.toString('base64'));
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.embers && Scene3D.embers.length, null, { timeout: 60000 });
    await page.waitForTimeout(2500);

    // 불투명도 범위: 라이브 루프를 몇 초 돌리며 매 프레임 값을 모은다
    const op = await page.evaluate(async () => {
        const seen = [];
        const t0 = performance.now();
        while (performance.now() - t0 < 2500) {
            for (const e of Scene3D.embers) seen.push(e.material.opacity);
            await new Promise(r => requestAnimationFrame(r));
        }
        return { min: Math.min(...seen), max: Math.max(...seen), n: seen.length };
    });

    // 불씨만 껐다 켜서 화면 기여분 diff
    await page.evaluate(() => { Scene3D.update = function () { }; Combat.tick = function () { }; });
    await page.waitForTimeout(300);
    await page.evaluate(() => { Scene3D.renderer.render(Scene3D.scene, Scene3D.camera); });
    const on = await decode(page, await page.screenshot());
    await page.evaluate(() => {
        Scene3D.embers.forEach(e => e.visible = false);
        Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
    });
    await page.waitForTimeout(150);
    const off = await decode(page, await page.screenshot());
    const geo = await page.evaluate(() => {
        const r = Scene3D.renderer.domElement.getBoundingClientRect();
        return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    });

    const [gx, gy, gw, gh] = geo;
    let lifted = 0, big = 0, maxLift = 0, sumLift = 0;
    const cols = new Array(4).fill(0);   // 화면을 가로 4등분 — '우측에 몰린다'를 확인
    for (let y = gy; y < gy + gh; y++) {
        for (let x = gx; x < gx + gw; x++) {
            const i = (y * on.w + x) * 4;
            const a = (on.d[i] + on.d[i + 1] + on.d[i + 2]) / 3;
            const b = (off.d[i] + off.d[i + 1] + off.d[i + 2]) / 3;
            const dl = a - b;
            if (dl > 4) {
                lifted++; sumLift += dl; maxLift = Math.max(maxLift, dl);
                cols[Math.min(3, Math.floor((x - gx) / (gw / 4)))]++;
                if (dl > 40) big++;   // 40 이상 밀어올린 픽셀 = '허연 뭉텅이'의 실체
            }
        }
    }
    console.log('=== 불씨 실측 ===');
    console.log('material.opacity 범위: %s ~ %s (%d 샘플)  ※ buildEmbers 의도값 0.22',
        op.min.toFixed(3), op.max.toFixed(3), op.n);
    console.log('의도값 대비 최대 배율:', (op.max / 0.22).toFixed(2) + '배',
        op.max > 0.3 ? '→ NG (빌드 시 설정이 update에서 덮어써짐)' : '→ OK');
    console.log('\n불씨가 밝힌 픽셀: %d개 (3D영역 %d px의 %s%%)', lifted, gw * gh, (lifted / (gw * gh) * 100).toFixed(2));
    console.log('그중 +40 이상 밀어올린 픽셀:', big, big > 300 ? '→ NG (허연 뭉텅이)' : '→ OK (반짝임 수준)');
    console.log('최대 밝기 상승:', maxLift.toFixed(1), ' 평균 상승:', lifted ? (sumLift / lifted).toFixed(1) : 0);
    console.log('가로 4등분 분포(좌→우):', cols.join(' | '));
    console.log('\n콘솔 에러:', errors.length, errors.slice(0, 3).join(' | '));
    await browser.close();
})();
