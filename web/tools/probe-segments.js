// 원본·클론의 '세로로 이어지는 같은 색 구간'을 나란히 뽑는다 — 비율 전수 검증 패스(TODO ②)에서
// 화면 하나를 실제로 판정할 때 쓰는 주력 도구.
//
// probe-bands-all.js 는 '어느 화면부터 볼지' 고르는 분류용이고(원본 경계마다 클론에서 가장 가까운
// 경계를 찾는 방식이라 클론 쪽 경계가 약하면 엉뚱한 데 붙어 점수가 튄다), 판정은 이 도구로 한다:
// 두 이미지에서 같은 x구간의 행 평균색을 내고 색이 바뀌는 지점을 그대로 나열하므로
// '원본 몇 %H의 무엇이 클론 몇 %H에 있나'를 사람이 직접 짝지어 볼 수 있다.
//
// 사용: PW_PATH=... node probe-segments.js <원본.png> <클론.png> [x시작=0.42] [x끝=0.52] [최소높이=6]
//   x구간은 재고 싶은 요소가 지나가는 세로 띠를 고른다(예: 목록 줄무늬는 라벨과 토글 사이가 깨끗하다).
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');

const segs = (page, file, x0, x1, minH) => page.evaluate(async ({ dataUrl, x0, x1, minH }) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
    const xa = Math.round(W * x0), xb = Math.round(W * x1);
    const rows = [];
    for (let y = 0; y < H; y++) {
        let r = 0, gg = 0, b = 0;
        for (let p = xa; p < xb; p++) { const i = (y * W + p) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
        const n = xb - xa; rows.push([r / n, gg / n, b / n]);
    }
    const out = [];
    for (let y = 0; y < H; y++) {
        const p = out[out.length - 1];
        if (p && Math.abs(p.c[0] - rows[y][0]) < 3 && Math.abs(p.c[1] - rows[y][1]) < 3 && Math.abs(p.c[2] - rows[y][2]) < 3) p.h++;
        else out.push({ y, h: 1, c: rows[y] });
    }
    return { W, H, seg: out.filter(s => s.h >= minH).map(s => ({ y: s.y, h: s.h, pct: +(s.y / H * 100).toFixed(2), c: s.c.map(v => Math.round(v)).join(',') })) };
}, { dataUrl: 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'), x0, x1, minH });

(async () => {
    const [A, B] = process.argv.slice(2, 4);
    if (!A || !B) { console.error('사용: node probe-segments.js <원본.png> <클론.png> [x0] [x1] [minH]'); process.exit(1); }
    const x0 = Number(process.argv[4] || 0.42), x1 = Number(process.argv[5] || 0.52), minH = Number(process.argv[6] || 6);
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.goto('about:blank');
    const [a, b] = [await segs(page, A, x0, x1, minH), await segs(page, B, x0, x1, minH)];
    await browser.close();
    console.log(`x구간 ${(x0 * 100).toFixed(0)}~${(x1 * 100).toFixed(0)}%W · 최소높이 ${minH}px`);
    console.log(`\n원본 ${a.W}x${a.H}                     클론 ${b.W}x${b.H}`);
    const n = Math.max(a.seg.length, b.seg.length);
    for (let i = 0; i < n; i++) {
        const p = a.seg[i], q = b.seg[i];
        const f = s => s ? `${String(s.pct).padStart(6)}% h=${String(s.h).padStart(3)} rgb=${s.c}`.padEnd(34) : ''.padEnd(34);
        const gap = p && q ? (q.pct - p.pct).toFixed(2).padStart(7) : '';
        console.log(`  ${f(p)}  ${f(q)}  Δ${gap}`);
    }
    console.log('\n※ 두 목록의 i번째끼리 자동으로 짝지어 Δ를 찍는다 — 한쪽에만 있는 구간이 끼면 그 아래가 통째로 밀리니,');
    console.log('  rgb·h를 보고 같은 요소끼리 맞는지 눈으로 확인한 뒤 숫자를 쓸 것.');
})();
