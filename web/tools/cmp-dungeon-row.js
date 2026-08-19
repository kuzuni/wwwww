/* 던전 배너 한 행을 원본(shot-042251) / 클론(dungeon-rows.png) 같은 폭으로 정규화해
 * 위아래로 붙인 확대 비교 이미지를 굽는다 — dungeon-row-quality 채점/자가검수용.
 *
 * 왜: 이 항목의 지적은 대부분 '무엇이 무엇으로 읽히는가'라서 400px 폭 원본으로는 판독이 안 된다.
 * probe-dungeon-value.js 와 **같은 카드 rect** 를 써서 두 판의 같은 자리를 확실히 맞춘다.
 *
 * 사용: node tools/cmp-dungeon-row.js <행번호 1~4> [배율=3]
 *       node tools/cmp-dungeon-row.js all [배율=2]   (4행 세로로 전부)
 * 출력: tools/cmp-dg-row<N>.png (all 이면 tools/cmp-dg-all.png)
 */
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const REF = path.resolve(__dirname, '../ref/screens/shot-042251.png');
const SHOT = path.resolve(__dirname, 'dungeon-rows.png');

/* probe-dungeon-value.js 와 동일한 값 — 저쪽이 바뀌면 여기도 같이 바꿀 것 */
const REF_ROWS = [[56, 126, 385, 112], [56, 248, 385, 111], [56, 369, 385, 112], [56, 491, 385, 111]];
const CL_ROWS = [[88, 328, 604, 181], [88, 518, 604, 183], [88, 710, 604, 183], [88, 902, 604, 176]];
const NAMES = ['1-hammer', '2-ghost', '3-invasion', '4-zombie'];

(async () => {
    const arg = (process.argv[2] || '1').toLowerCase();
    const all = arg === 'all';
    const rows = all ? [0, 1, 2, 3] : [parseInt(arg, 10) - 1];
    const MAG = parseInt(process.argv[3] || (all ? '2' : '3'), 10);
    if (rows.some(i => !(i >= 0 && i < 4))) { console.error('행번호는 1~4 또는 all'); process.exit(1); }

    const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id="c"></canvas>');
    const out = await page.evaluate(async ([refSrc, clSrc, refRects, clRects, rows, MAG]) => {
        const load = src => new Promise(k => { const im = new Image(); im.onload = () => k(im); im.src = src; });
        const [ref, cl] = [await load(refSrc), await load(clSrc)];
        /* 카드 폭을 W 로 통일하고 원본 비율대로 높이를 잡는다 */
        const W = 385 * MAG, PAD = 8, LBL = 16;
        const cell = r => {
            const [, , , h] = r; return Math.round(h * (W / r[2]));
        };
        const heights = rows.map(i => cell(refRects[i]) + cell(clRects[i]) + LBL * 2 + PAD);
        const c = document.getElementById('c');
        c.width = W + PAD * 2;
        c.height = heights.reduce((a, b) => a + b, 0) + PAD;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
        x.fillStyle = '#202020'; x.fillRect(0, 0, c.width, c.height);
        let y = PAD;
        for (const i of rows) {
            for (const [im, rects, tag] of [[ref, refRects, 'ORIG'], [cl, clRects, 'CLONE']]) {
                const r = rects[i], h = Math.round(r[3] * (W / r[2]));
                x.fillStyle = '#8ad'; x.font = 'bold 12px sans-serif';
                x.fillText(tag + '  row' + (i + 1), PAD, y + 12);
                y += LBL;
                x.drawImage(im, r[0], r[1], r[2], r[3], PAD, y, W, h);
                y += h;
            }
            y += PAD;
        }
        return c.toDataURL('image/png');
    }, [b64(REF), b64(SHOT), REF_ROWS, CL_ROWS, rows, MAG]);
    await browser.close();
    const dest = path.resolve(__dirname, all ? 'cmp-dg-all.png' : 'cmp-dg-row' + (rows[0] + 1) + '.png');
    fs.writeFileSync(dest, Buffer.from(out.split(',')[1], 'base64'));
    console.log('wrote', dest, '(' + (all ? 'all' : NAMES[rows[0]]) + ' x' + MAG + ')');
})();
