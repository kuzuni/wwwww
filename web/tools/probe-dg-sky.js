/* 던전 배너 하늘의 **점유·대비·경계** 게이트 (dungeon-row-quality).
 *
 * 왜 필요했나: 4행 구름은 R4~R9 동안 캡슐→뭉게 혹→키라인 착탈로 *모양만* 계속 바뀌었는데
 * 비평가는 매 라운드 '스켈레톤 로딩 바 / 구슬 꿴 철사'로 읽었다. 모양을 의심하는 대신
 * **원본의 같은 자리를 재 보니** 원인이 한 줄로 나왔다 — 원본은 그 자리를 **비워 두는데**
 * 클론이 덩어리로 **채우고** 있었다(4행 어두운 픽셀 6.3% 대 51.2%). 2행의 '하늘 얼룩'도
 * 같은 병이다(밝은 픽셀 1.6% 대 41.2%). 그래서 이 도구의 핵심 지표는 대비가 아니라 **점유율**이다.
 *
 * 재는 것(원본/클론 같은 창):
 *   ⑴ 바탕 = 휘도 히스토그램 최빈값(±3 묶음)
 *   ⑵ 바탕보다 밝은/어두운 픽셀의 **비율**과 평균 Δ   ← ⑵의 비율이 주 게이트
 *   ⑶ 가로 경계 수(|ΔL|>18 인 좌우 인접쌍)/행 — 외곽선 있는 딱딱한 도형이면 치솟는다
 *
 * 🚨 창은 **행마다 다르다.** 처음엔 4행용 창 하나로 네 행을 다 쟀는데, 다른 행에서는 그 창에
 *    제목 글자·고목 잔가지·깃발이 들어와 경계가 68/행까지 치솟는 **의미 없는 수치**가 나왔다.
 *    아래 표는 원본에서 '최빈색 점유율이 가장 높은 = 하늘만 있는' 창을 탐색해 고른 값이고,
 *    괄호의 점유율이 그 근거다. 레이아웃이나 아트가 크게 바뀌면 다시 탐색할 것.
 *    ⚠️ 3행(침략)은 **지원하지 않는다** — 깃발과 구름이 하늘을 가로질러 원본에서조차 가장 깨끗한
 *      창이 47.5% 밖에 안 된다(하늘만 있는 창이 없다). 3행 하늘은 probe-dungeon-value.js 로 볼 것.
 *
 * 사용: node tools/probe-dg-sky.js [행번호=4] [--keep]
 */
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const REF = path.resolve(__dirname, '../ref/screens/shot-042251.png');
const SHOT = path.resolve(__dirname, 'dungeon-rows.png');
const REF_ROWS = [[56, 126, 385, 112], [56, 248, 385, 111], [56, 369, 385, 112], [56, 491, 385, 111]];
const CL_ROWS = [[88, 328, 604, 181], [88, 518, 604, 183], [88, 710, 604, 183], [88, 902, 604, 176]];
const NAMES = ['① 망치 도둑', '② 유령 마을', '③ 침략', '④ 좀비 러시'];
/* [x0, y0, x1, y1] (카드 비율) — 원본 최빈색 점유율은 주석에. null = 지원 안 함. */
const WIN = [
    [0.28, 0.05, 0.44, 0.21],   // ① 69.1% rgb(180,216,255) — 원본도 분홍 구름 줄이 있어 100% 는 원래 안 나온다
    [0.36, 0.05, 0.52, 0.21],   // ② 90.4% rgb(36,38,61)
    null,                       // ③ 최선이 47.5% — 하늘만 있는 창 없음(위 주석)
    /* ④ 원본은 x0.32~0.48·y0.05~0.21 이 완전 단색(100% rgb(204,177,255))이지만, **클론은 그
       자리로 좀비가 치켜든 뼈(전경 캐릭터)가 들어온다** — 원본 좀비의 팔보다 높고 왼쪽이라
       겹친다. 그건 하늘 결함이 아니라 포즈 차이라 창을 **뼈 위쪽 얇은 띠**(y0.04~0.12)로 올려
       둘 다 하늘만 있게 한다. 이 높이면 옛 '구름 막대'(y0.10~0.30)나 재유입된 가로 띠는 여전히
       걸린다. 4행 하늘 본체는 probe-dungeon-value 밴드 1~3 이 함께 지킨다(-4.0/+10.2/+0.4). */
    [0.42, 0.04, 0.54, 0.15],   // ④ (치켜든 뼈는 x≤0.42·아래로 대각, 우측 고목은 0.64W~ — 그 사이 창)
];

(async () => {
    const row = parseInt(process.argv[2] || '4', 10) - 1;
    if (!(row >= 0 && row < 4)) { console.error('행번호는 1~4'); process.exit(1); }
    if (!WIN[row]) {
        console.log('=== ' + NAMES[row] + ' — 이 행은 지원하지 않는다.');
        console.log('  원본에서조차 하늘만 있는 창이 없다(최선 47.5%: 깃발·구름이 가로지른다).');
        console.log('  3행 하늘 구조는 probe-dungeon-value.js 의 밴드 1~4 로 볼 것.');
        process.exit(0);
    }
    if (!process.argv.includes('--keep') || !fs.existsSync(SHOT)) {
        execFileSync('node', [path.join(__dirname, 'shot-dungeon-rows.js')], { stdio: 'inherit' });
    }
    const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id="c"></canvas>');
    const res = await page.evaluate(async ([refSrc, clSrc, refR, clR, win]) => {
        const load = src => new Promise(k => { const im = new Image(); im.onload = () => k(im); im.src = src; });
        const NW = 400, NH = 116;
        const X0 = Math.round(NW * win[0]), X1 = Math.round(NW * win[2]);
        const Y0 = Math.round(NH * win[1]), Y1 = Math.round(NH * win[3]);
        const out = {};
        for (const [tag, src, r] of [['orig', refSrc, refR], ['clone', clSrc, clR]]) {
            const im = await load(src);
            const c = document.getElementById('c'); c.width = NW; c.height = NH;
            const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
            x.clearRect(0, 0, NW, NH);
            x.drawImage(im, r[0], r[1], r[2], r[3], 0, 0, NW, NH);
            const d = x.getImageData(X0, Y0, X1 - X0, Y1 - Y0).data;
            const L = [], hist = new Array(256).fill(0);
            for (let i = 0; i < d.length; i += 4) {
                const l = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
                L.push(l); hist[l]++;
            }
            let best = 0, bi = 0;
            for (let v = 0; v < 256; v++) {
                let s = 0; for (let k = -3; k <= 3; k++) s += hist[v + k] || 0;
                if (s > best) { best = s; bi = v; }
            }
            const avg = a => a.length ? Math.round(a.reduce((p, q) => p + q, 0) / a.length) : bi;
            const bright = L.filter(l => l > bi + 6), dark = L.filter(l => l < bi - 6);
            const w = X1 - X0, h = Y1 - Y0;
            let edges = 0;
            for (let yy = 0; yy < h; yy++) for (let xx = 1; xx < w; xx++) {
                if (Math.abs(L[yy * w + xx] - L[yy * w + xx - 1]) > 18) edges++;
            }
            out[tag] = {
                sky: bi,
                brightL: avg(bright), brightD: avg(bright) - bi, brightPct: +(bright.length / L.length * 100).toFixed(1),
                darkL: avg(dark), darkD: avg(dark) - bi, darkPct: +(dark.length / L.length * 100).toFixed(1),
                edges: +(edges / h).toFixed(2),
            };
        }
        return out;
    }, [b64(REF), b64(SHOT), REF_ROWS[row], CL_ROWS[row], WIN[row]]);
    await browser.close();
    const o = res.orig, c = res.clone, W = WIN[row];
    console.log('=== ' + NAMES[row] + '  하늘 창 x' + W[0] + '~' + W[2] + 'W · y' + W[1] + '~' + W[3] + 'H');
    console.log('           바탕L   밝은L    +Δ   밝은%   어두운L    -Δ  어두운%  경계/행');
    const fmt = (t, r) => console.log('  ' + t.padEnd(9) + String(r.sky).padStart(5) + String(r.brightL).padStart(8) + String(r.brightD).padStart(6)
        + String(r.brightPct).padStart(8) + String(r.darkL).padStart(9) + String(r.darkD).padStart(6) + String(r.darkPct).padStart(8) + String(r.edges).padStart(9));
    fmt('원본', o); fmt('클론', c);
    console.log('');
    const bad = [];
    /* 🚨 주 게이트 = **점유율**. 원본이 거의 비운 창(≤10%)을 클론이 25%p 넘게 채웠으면
       그게 '얼룩/막대로 읽힌다'의 실측형이다. 2행은 대비·경계를 둘 다 통과하면서
       밝은 픽셀만 1.6% 대 41.2% 였다 — 이 줄이 없으면 그 결함을 놓친다. */
    [['밝은', o.brightPct, c.brightPct], ['어두운', o.darkPct, c.darkPct]].forEach(([k, op, cp]) => {
        if (op <= 10 && cp - op > 25) bad.push(k + ' 픽셀 ' + op + '% → ' + cp + '% — 원본이 비워 둔 하늘을 덩어리가 덮었다');
    });
    if (Math.abs(c.sky - o.sky) > 20) bad.push('하늘 바탕 휘도가 ' + (c.sky - o.sky) + ' 차 (허용 ±20)');
    if (c.edges > o.edges * 2 + 3) bad.push('가로 경계 ' + c.edges + '/행 (원본 ' + o.edges + ') — 외곽선 있는 딱딱한 도형');
    if (bad.length) { bad.forEach(b => console.log('  ✗ ' + b)); console.log('\nFAIL'); process.exit(1); }
    console.log('PASS');
})();
