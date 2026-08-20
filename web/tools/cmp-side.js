// 원본 ↔ 클론을 **같은 세로 배율로 나란히** 붙여 한 장으로 만든다 — 비평가 채점용 합성.
//
// 왜 도구로 두나: 이 저장소의 UI 항목 상당수가 "원본 나란히 합성으로 비평가 판정을 받을 것"을
// 통과 조건으로 걸고 있는데, 매번 즉석 스크립트를 쓰다 보니 **두 판을 다른 배율로 붙여 놓고
// '비율이 다르다'는 지적을 받는** 사고가 난다. 여기서 세로를 맞춰 붙이는 것으로 못박는다.
//
// 🚨 세로를 맞추는 이유 — 원본(497×890)과 클론 캡처(499×892)는 크기가 미세하게 다르다.
//    가로를 맞추면 세로가 어긋나 행 위치가 밀리고, 그러면 비평가가 **없는 세로 어긋남을 본다.**
//    이 게임의 레이아웃은 전부 '앱 세로폭 대비 %'로 정의돼 있으므로(TODO 비율 규약) 세로가 기준이다.
//
// 사용: node cmp-side.js <원본.png> <클론.png> <출력.png> [세로높이] [여백]
//   예: node cmp-side.js ref/screens/shot-042340.png tools/ref-cmp/clone/skills.png /tmp/cmp.png 890
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

(async () => {
    const [a, b, out = 'cmp.png', hArg, gapArg] = process.argv.slice(2);
    if (!a || !b) { console.error('사용: node cmp-side.js <원본.png> <클론.png> <출력.png> [세로높이] [여백]'); process.exit(2); }
    for (const f of [a, b]) if (!fs.existsSync(f)) { console.error('없음: ' + f); process.exit(2); }
    const H = parseInt(hArg || '890', 10), GAP = parseInt(gapArg || '24', 10);

    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    const url = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const b64 = await page.evaluate(async (o) => {
        const load = async (u) => { const i = new Image(); await new Promise(r => { i.onload = r; i.src = u; }); return i; };
        const A = await load(o.a), B = await load(o.b);
        const LABEL = 30;                                   // 머리 라벨 띠 높이
        const wA = Math.round(A.naturalWidth * o.H / A.naturalHeight);
        const wB = Math.round(B.naturalWidth * o.H / B.naturalHeight);
        const cv = document.createElement('canvas');
        cv.width = wA + o.GAP + wB; cv.height = o.H + LABEL;
        const g = cv.getContext('2d');
        g.fillStyle = '#20242c'; g.fillRect(0, 0, cv.width, cv.height);
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(A, 0, LABEL, wA, o.H);
        g.drawImage(B, wA + o.GAP, LABEL, wB, o.H);
        g.font = '600 17px system-ui, sans-serif'; g.textBaseline = 'middle';
        g.fillStyle = '#ffd479'; g.fillText('원본 (ORIGINAL)', 8, LABEL / 2);
        g.fillStyle = '#79d4ff'; g.fillText('클론 (CLONE)', wA + o.GAP + 8, LABEL / 2);
        return cv.toDataURL('image/png').split(',')[1];
    }, { a: url(a), b: url(b), H, GAP });
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log(`저장 ${out} — 세로 ${H}px 로 맞춰 나란히 (${a} | ${b})`);
    await browser.close();
})();
