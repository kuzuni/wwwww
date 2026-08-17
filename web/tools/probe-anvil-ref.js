// 원본 모루(shot-042120)의 실루엣을 색 임계값으로 스캔해 형태 비율을 수치로 뽑는다.
// 모루는 붉은 계열(r이 g·b보다 확실히 크고 어둡지 않음) + 검은 외곽선으로 이뤄져 있어,
// '붉은 몸통 또는 그 안의 검은 선'을 한 덩어리로 잡으면 실루엣이 나온다.
//
// ⚠️ TODO '비평가 채점 함정' 경고대로, 임계값이 **다른 요소를 함께 잡는지** 반드시 확인할 것.
// 모루 오른쪽에 파란 [대장간 레벨] 버튼, 아래에 초록 풀 클럼프, 위에 장비 그리드가 있다.
// 그래서 스캔 창을 모루 주변으로 좁히고, 행별 '가장 긴 연속 구간'만 채택한다.
//
// 사용: PW_PATH=<playwright 경로> node probe-anvil-ref.js [png] [x] [y] [w] [h]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PNG = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042120.png');
const BOX = [+(process.argv[3] || 180), +(process.argv[4] || 668), +(process.argv[5] || 130), +(process.argv[6] || 84)];

const SCAN = async ([src, bx, by, bw, bh]) => {
    {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(bx, by, bw, bh).data;
    // 모루 픽셀 판정: ① 붉은 몸통(r > g + 22 && r > b + 22 && r > 55) 또는 ② 검은 외곽선(전부 어두움)
    const isBody = (r, gg, b) => (r > gg + 22 && r > b + 22 && r > 55) || (r < 62 && gg < 52 && b < 52);
    const rows = [];
    for (let y = 0; y < bh; y++) {
        // 행별로 '가장 긴 연속 구간'만 채택 — 파란 버튼·풀 클럼프가 끼어들어도 덩어리가 분리된다
        let best = null, cur = null;
        for (let x = 0; x < bw; x++) {
            const i = (y * bw + x) * 4;
            if (isBody(d[i], d[i + 1], d[i + 2])) {
                if (!cur) cur = { x0: x, x1: x }; else cur.x1 = x;
            } else if (cur) {
                if (!best || cur.x1 - cur.x0 > best.x1 - best.x0) best = cur;
                cur = null;
            }
        }
        if (cur && (!best || cur.x1 - cur.x0 > best.x1 - best.x0)) best = cur;
        rows.push(best ? { y, x0: best.x0, x1: best.x1, w: best.x1 - best.x0 + 1 } : { y, w: 0 });
    }
    return rows;
    }
};

(async () => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(PNG).toString('base64');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.setContent('<body></body>');
    const rows = await page.evaluate(SCAN, [dataUrl, ...BOX]);
    await browser.close();

    const live = rows.filter(r => r.w > 3);
    if (!live.length) { console.log('모루 픽셀을 못 찾았다 — 스캔 창을 확인할 것'); return; }
    const top = live[0].y, bot = live[live.length - 1].y;
    const H = bot - top + 1;
    const left = Math.min(...live.map(r => r.x0)), right = Math.max(...live.map(r => r.x1));
    const W = right - left + 1;
    console.log(`스캔창 x${BOX[0]} y${BOX[1]} ${BOX[2]}×${BOX[3]}`);
    console.log(`모루 바운딩: x ${BOX[0] + left}~${BOX[0] + right} (w ${W})  y ${BOX[1] + top}~${BOX[1] + bot} (h ${H})  종횡비 W/H = ${(W / H).toFixed(3)}`);
    console.log('\n  y(창)  %H     좌     우    폭   %W');
    for (const r of rows) {
        if (r.w <= 3) continue;
        const ph = ((r.y - top) / (H - 1) * 100).toFixed(1);
        console.log(String(r.y).padStart(6), String(ph).padStart(6),
            String(r.x0).padStart(6), String(r.x1).padStart(6),
            String(r.w).padStart(5), (r.w / W * 100).toFixed(1).padStart(6));
    }
})();
