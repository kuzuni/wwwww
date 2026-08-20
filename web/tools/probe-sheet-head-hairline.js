// 시트 헤더 아래에 **원본에 없는 전폭 가로선**이 생기지 않았는가 (slug: sheet-head-hairline).
// 사용: PW_PATH=<playwright> node probe-sheet-head-hairline.js
//
// 🚨 **이 자는 '있어야 할 것'이 아니라 '없어야 할 것'을 지킨다.** 헤더 그늘은 폴리싱 패스가
//    '헤더 위계'를 이유로 넣었다가 철회된 줄이다 — 비평가는 원본을 안 보고 "위계가 약하다"고
//    말할 수 있으므로, 같은 이유로 **다시 들어오는 것**을 막을 자가 없으면 조용히 재발한다.
//    (원본 대조 없이 들어온 스킨 결정이 원본과 어긋난 채 굳는 것 = 이 저장소의 반복 사고다.)
//
// 판정: 원본 3화면(스킬·펫·상점)에는 헤더 아래 전폭 가로선이 **없어야** 하고, 클론도 **없어야** 한다.
//       원본에서 선이 잡히면 그건 전제가 틀린 것이므로 `exit 2`(측정기 고장)로 끊는다.
// 술어: '그 행이 두 줄 위보다 고르게 어둡다'가 검사 폭의 80% 를 넘으면 가로선으로 본다.
//       (배경색 절대값이 아니라 **위아래 대비**라 흰 시트·회색 시트 어디서나 같은 뜻을 갖는다.)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const REFS = [
    ['스킬 원본', '../ref/screens/shot-042340.png'],
    ['펫 원본', '../ref/screens/shot-042356.png'],
    ['상점 원본', '../ref/screens/shot-042632.png'],
];
const CLONE = ['스킬 클론', 'ref-cmp/clone/skills.png'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');

    const scan = (file) => page.evaluate(async (src) => {
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.getElementById('c'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, W, H).data;
        const lum = (x, y) => { const i = (y * W + x) * 4; return .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; };
        const hits = [];
        for (let y = Math.round(H * .02); y < Math.round(H * .11); y++) {
            let n = 0, tot = 0;
            for (let x = Math.round(W * .06); x < Math.round(W * .94); x++) { tot++; if (lum(x, y) < lum(x, y - 2) - 6) n++; }
            const frac = n / tot;
            if (frac > .8) hits.push({ y, pct: +(y / H * 100).toFixed(2), frac: +frac.toFixed(2) });
        }
        return { W, H, hits };
    }, 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'));

    let refBad = 0, cloneBad = 0;
    console.log('■ 헤더 아래 전폭 가로선 — 원본에는 없어야 한다(전제)');
    for (const [label, rel] of REFS) {
        const f = path.resolve(__dirname, rel);
        if (!fs.existsSync(f)) { console.log(`  ${label.padEnd(10)} 원본 없음 — 건너뜀 (${rel})`); continue; }
        const r = await scan(f);
        const has = r.hits.length > 0;
        if (has) refBad++;
        console.log(`  ${label.padEnd(10)} ${r.W}x${r.H} → ${has ? '✗ 선이 있다: ' + r.hits.map(h => `y${h.y}(${h.pct}%H,${h.frac})`).join(' ') : '없음 OK'}`);
    }
    if (refBad) {
        console.error(`\n측정기 고장 — 원본 ${refBad}장에서 가로선이 잡혔다. 이 자의 전제('원본엔 없다')가 깨졌으니 판정을 믿지 말 것.`);
        await browser.close(); process.exit(2);
    }

    console.log('\n■ 클론');
    const cf = path.resolve(__dirname, CLONE[1]);
    if (!fs.existsSync(cf)) { console.error(`클론 캡처가 없다: ${CLONE[1]} — tools/shot-skills.js 를 먼저 돌릴 것.`); await browser.close(); process.exit(2); }
    const c = await scan(cf);
    if (c.hits.length) { cloneBad = 1; console.log(`  ${CLONE[0].padEnd(10)} ${c.W}x${c.H} → ✗ 원본에 없는 선: ` + c.hits.map(h => `y${h.y}(${h.pct}%H, 채움 ${h.frac})`).join(' ')); }
    else console.log(`  ${CLONE[0].padEnd(10)} ${c.W}x${c.H} → 없음 OK`);

    console.log('\n' + (cloneBad ? 'FAIL — 원본에 없는 헤더 헤어라인이 다시 들어왔다' : 'PASS'));
    await browser.close();
    process.exit(cloneBad ? 1 : 0);
})();
