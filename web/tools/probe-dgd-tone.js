// 던전 상세 팝업(shot-042304) 표면 색 실측 — AAA 스킨 패스 ② 용.
// 눈대중으로 회색 톤을 정하면 매번 틀린다(인계 메모의 '명암 오독' 7회). 원본 픽셀을 직접 뽑는다.
// 사용: node tools/probe-dgd-tone.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042304.png');

// 원본 실측 좌표(probe-dgd-dom.js 의 REF 주석 기준, 498×888):
//   보상 pill 109..381 x 437..470 · 좌버튼 채움 97..230 x 544..604 · 우버튼 260..393
const SPOTS = [
    ['pill 면(중앙 왼쪽)', 125, 453],
    ['pill 면(중앙 오른쪽)', 365, 453],
    ['pill 위 테두리', 116, 438],
    ['pill 아래 턱', 125, 468],
    ['좌버튼 면(위)', 110, 552],
    ['좌버튼 면(가운데)', 110, 572],
    ['좌버튼 아래 턱', 160, 600],
    ['좌버튼 왼쪽 테두리', 98, 572],
    ['우버튼 면(가운데)', 275, 572],
    ['카드 흰 바탕', 90, 500],
    ['열쇠 글자 옆 흰 바탕', 300, 507],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const out = await page.evaluate(async ([src, spots]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.getElementById('c');
        c.width = img.width; c.height = img.height;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const at = (px, py) => { const i = (py * c.width + px) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const hex = (p) => '#' + p.map(v => v.toString(16).padStart(2, '0')).join('');
        // 세로 프로파일도 같이 — 버튼 아래턱 두께와 테두리 두께를 재려면 색이 바뀌는 지점이 필요하다
        const col = [];
        for (let y = 538; y <= 615; y++) col.push([y, hex(at(160, y))]);
        const pillCol = [];
        for (let y = 430; y <= 480; y++) pillCol.push([y, hex(at(150, y))]);
        const pillRow = [];
        for (let px = 100; px <= 130; px++) pillRow.push([px, hex(at(px, 453))]);
        return { size: [c.width, c.height], spots: spots.map(([n, px, py]) => [n, hex(at(px, py))]), col, pillCol, pillRow };
    }, ['data:image/png;base64,' + fs.readFileSync(REF_PNG).toString('base64'), SPOTS]);
    await browser.close();
    console.log(`원본 ${out.size.join('×')}`);
    for (const [n, h] of out.spots) console.log(`  ${n.padEnd(20)} ${h}`);
    console.log('\n좌버튼 세로 단면 (x=160, y 538~615):');
    let prev = null;
    for (const [y, h] of out.col) { if (h !== prev) { console.log(`   y=${y}  ${h}`); prev = h; } }
    console.log('\n보상 pill 세로 단면 (x=150, y 430~480):');
    prev = null;
    for (const [y, h] of out.pillCol) { if (h !== prev) { console.log(`   y=${y}  ${h}`); prev = h; } }
    console.log('\n보상 pill 가로 단면 (y=453, x 100~130):');
    prev = null;
    for (const [px, h] of out.pillRow) { if (h !== prev) { console.log(`   x=${px}  ${h}`); prev = h; } }
})();
