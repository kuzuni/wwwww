// 스킬 화면 — 버튼행과 소환 바 사이의 **전폭 점선 구분선**이 원본과 같은가 (slug: skills-dashed-divider).
// 사용: PW_PATH=<playwright> node probe-skills-dashed-divider.js [원본.png] [클론.png]
//
// 🚨 **왜 이 자가 필요한가** — 이 선은 **아예 없었는데** 어떤 게이트도 빨개지지 않았다.
//    `probe-skills-dom` 은 14요소를 ±2%p 로 재고 전부 통과인데, 그 표는 **있는 요소의 좌표**만 본다.
//    **없는 요소는 표에 줄이 안 생기므로 영원히 초록이다.** 이 저장소가 반복해 밟는 사각지대
//    (`probe-equipped-label` 이 깃발을 안 본 것, `probe-skills-dom` 이 제목을 안 본 것)의 '누락' 판이다.
//    → 그래서 이 자는 **크기 대조가 아니라 존재·구조 판정**부터 한다.
//
// ⚠️ **기준계**: 원본 PNG(496x890)는 앱 상자 그 자체지만 클론 캡처(499x892)는 앱(높이 887.1)이
//    y2.4 에 앉아 위아래로 레터박스가 남는다. 그래서 **세로는 이미지가 아니라 앱 기준**으로 환산한다
//    (안 그러면 없는 0.27%p 어긋남이 생긴다). 가로는 앱 = 이미지 폭이라 그대로 쓴다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const REF = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042340.png');
const CLONE = process.argv[3] || path.resolve(__dirname, 'ref-cmp/clone/skills.png');
// 클론 캡처의 앱 상자(shot-skills.js 뷰포트 499x892 · #app 은 499x887.1 이 y2.4 에)
const CLONE_APP = { top: 2.4, h: 887.1 };
const GATE = 2.0;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const url = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

    // 버튼행~소환 바 사이(64~73%H)에서 '띄엄띄엄 어두운' 행 = 점선을 찾는다.
    const scan = (file, appTop, appH) => page.evaluate(async (o) => {
        const img = new Image();
        await new Promise(ok => { img.onload = ok; img.src = o.src; });
        const W = img.width, H = img.height;
        const c = document.getElementById('c'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, W, H).data;
        const lum = (x, y) => { const i = (y * W + x) * 4; return .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]; };

        const y0 = Math.round(o.appTop + o.appH * .685), y1 = Math.round(o.appTop + o.appH * .725);
        const rows = [];
        for (let y = y0; y <= y1; y++) {
            const runs = []; let s = -1;
            for (let x = 0; x < W; x++) {
                const dk = lum(x, y) < 128;
                if (dk && s < 0) s = x;
                if (!dk && s >= 0) { runs.push([s, x - 1]); s = -1; }
            }
            if (s >= 0) runs.push([s, W - 1]);
            // 대시는 굵다(≥15px). 글자 획 같은 잔 런은 버린다.
            const dash = runs.filter(([a, b]) => b - a + 1 >= 15);
            // 점선의 조건: 굵은 런이 4개 이상이고, 첫 런~마지막 런이 화면을 가로지른다
            if (dash.length >= 4 && (dash[dash.length - 1][1] - dash[0][0] + 1) > W * .9) rows.push({ y, dash });
        }
        return { W, H, rows };
    }, { src: url(file), appTop, appH });

    const R = await scan(REF, 0, (await page.evaluate(() => 0), 890));
    const C = await scan(CLONE, CLONE_APP.top, CLONE_APP.h);

    const desc = (label, m, appTop, appH) => {
        if (!m.rows.length) { console.log(`  ${label}: 점선 **없음**`); return null; }
        const ys = m.rows.map(r => r.y);
        const top = Math.min(...ys), bot = Math.max(...ys);
        const d0 = m.rows[0].dash;
        const spans = d0.map(([a, b]) => b - a + 1);
        const gaps = d0.slice(1).map(([a], i) => a - d0[i][1] - 1);
        const inner = spans.slice(1, -1), innerG = gaps;                 // 양끝 대시는 잘려 있으니 뺀다
        const dash = inner.reduce((s, v) => s + v, 0) / (inner.length || 1);
        const gap = innerG.reduce((s, v) => s + v, 0) / (innerG.length || 1);
        const r = {
            yPct: (top - appTop) / appH * 100, thick: bot - top + 1,
            spanPct: (d0[d0.length - 1][1] - d0[0][0] + 1) / m.W * 100,
            n: d0.length, dashPct: dash / m.W * 100, gapPct: gap / m.W * 100,
        };
        console.log(`  ${label}: y${top}~${bot} = **${r.yPct.toFixed(2)}%H**(앱기준) · 두께 ${r.thick}px · 가로 ${r.spanPct.toFixed(2)}%W · 대시 ${r.n}개 · 대시폭 ${r.dashPct.toFixed(2)}%W · 간격 ${r.gapPct.toFixed(2)}%W`);
        return r;
    };

    console.log('■ 점선 구분선 (버튼행 ↔ 소환 바 사이)');
    const rr = desc('원본', R, 0, 890);
    const cc = desc('클론', C, CLONE_APP.top, CLONE_APP.h);

    // 🔬 자기검증 — 원본에서 못 찾으면 자가 고장 난 것이다(원본에는 확실히 있다).
    if (!rr) { console.error('측정기 고장 — 원본에서 점선을 못 찾았다(원본 y630 에 분명히 있다). 임계·구간을 의심할 것.'); await browser.close(); process.exit(2); }

    console.log('\n===== 대조 =====');
    if (!cc) {
        console.log('구조 판정: ✗ **클론에 점선이 아예 없다** — 크기 대조 이전의 결함이다.');
        console.log('\nFAIL — 점선 누락');
        await browser.close(); process.exit(1);
    }
    const rows = [
        ['세로 위치 %H', rr.yPct, cc.yPct, GATE],
        ['가로 범위 %W', rr.spanPct, cc.spanPct, GATE],
        ['대시 폭 %W', rr.dashPct, cc.dashPct, GATE],
        ['대시 간격 %W', rr.gapPct, cc.gapPct, GATE],
    ];
    let fail = 0;
    for (const [label, a, b, gate] of rows) {
        const dd = b - a, bad = Math.abs(dd) > gate;
        if (bad) fail++;
        console.log(`${label.padEnd(14)} 원본 ${a.toFixed(2)}  vs  클론 ${b.toFixed(2)}   (Δ ${dd >= 0 ? '+' : ''}${dd.toFixed(2)}%p) ${bad ? '✗' : 'OK'}`);
    }
    console.log(`두께           원본 ${rr.thick}px  vs  클론 ${cc.thick}px ${rr.thick === cc.thick ? 'OK' : '✗'}`);
    if (rr.thick !== cc.thick) fail++;
    console.log(`대시 개수      원본 ${rr.n}개  vs  클론 ${cc.n}개 ${rr.n === cc.n ? 'OK' : '✗'}`);
    if (rr.n !== cc.n) fail++;

    console.log('\n' + (fail ? `FAIL — ${fail}건 어긋남` : 'PASS'));
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
