// 두 컨택트 시트(같은 격자)의 타일별 화소 차분 — 사용: node cmp-sheet.js A.png B.png [열수]
// 왜: `shot-biomes.js` 는 시드를 고정해도 **비트 단위로는 재현되지 않는다**(swiftshader 래스터화 편차).
//     md5 비교는 항상 "다름"을 내놓아 회귀 판정에 못 쓴다. 대신 타일별 평균 절대차(MAD)를 재고,
//     **같은 코드로 두 번 찍은 값(노이즈 바닥)** 과 비교해 진짜 변화만 가려낸다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const A = process.argv[2], B = process.argv[3];
const COLS = parseInt(process.argv[4] || '3', 10);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto('about:blank');
    const out = await page.evaluate(async ({ a, b, cols }) => {
        const load = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = src; });
        const ia = await load(a), ib = await load(b);
        if (ia.width !== ib.width || ia.height !== ib.height) return { err: `크기 불일치 ${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
        const cv = document.createElement('canvas');
        cv.width = ia.width; cv.height = ia.height;
        const cx = cv.getContext('2d');
        cx.drawImage(ia, 0, 0); const da = cx.getImageData(0, 0, cv.width, cv.height).data;
        cx.clearRect(0, 0, cv.width, cv.height);
        cx.drawImage(ib, 0, 0); const db = cx.getImageData(0, 0, cv.width, cv.height).data;
        const rows = Math.round(ia.height / (ia.width / cols));
        const tw = Math.floor(ia.width / cols), th = Math.floor(ia.height / rows);
        const tiles = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            let sum = 0, n = 0, max = 0;
            for (let y = r * th; y < (r + 1) * th; y++) for (let x = c * tw; x < (c + 1) * tw; x++) {
                const i = (y * cv.width + x) * 4;
                const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3;
                sum += d; n++; if (d > max) max = d;
            }
            tiles.push({ idx: r * cols + c, mad: +(sum / n).toFixed(3), max: +max.toFixed(1) });
        }
        return { rows, cols, tw, th, tiles };
    }, { a: 'data:image/png;base64,' + fs.readFileSync(A).toString('base64'), b: 'data:image/png;base64,' + fs.readFileSync(B).toString('base64'), cols: COLS });
    await browser.close();
    if (out.err) { console.error(out.err); process.exit(1); }
    for (const t of out.tiles) console.log(`타일 ${t.idx}  MAD ${t.mad}  최대 ${t.max}`);
    console.log(`전체 평균 MAD ${(out.tiles.reduce((s, t) => s + t.mad, 0) / out.tiles.length).toFixed(3)}`);
})();
