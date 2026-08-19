/* 던전 4행 하늘 구름의 **대비·형상** 실측 (dungeon-row-quality).
 *
 * 왜: 4행 구름은 9라운드 동안 캡슐→혹→키라인으로 계속 모양만 바뀌었는데 비평가는 매번
 * '로딩 바 / 구슬 꿴 철사'로 읽었다. 모양이 아니라 **대비**가 문제일 수 있다 —
 * 원본 구름이 하늘과 몇 단 차이인지 재 본 적이 없다. 그걸 잰다.
 *
 * 재는 법: 카드 상단 하늘 띠(카드 높이 0.06~0.34H, 좌 0~0.72W)를 원본/클론에서 같은 비율로 뽑아
 *   ⑴ 휘도 히스토그램의 최빈값(=하늘 바탕)
 *   ⑵ 바탕보다 밝은 픽셀(구름)의 평균 휘도와 **바탕 대비 Δ**
 *   ⑶ 구름 픽셀 비율
 *   ⑷ 세로 방향 밝기 급변(= 키라인/경계) 횟수 — 행마다 |ΔL|>18 인 인접쌍 수의 평균
 * 을 나란히 찍는다. ⑷ 가 원본보다 크면 '외곽선이 있는 딱딱한 도형'이라는 뜻이다.
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

(async () => {
    const row = parseInt(process.argv[2] || '4', 10) - 1;
    if (!(row >= 0 && row < 4)) { console.error('행번호는 1~4'); process.exit(1); }
    if (!process.argv.includes('--keep') || !fs.existsSync(SHOT)) {
        execFileSync('node', [path.join(__dirname, 'shot-dungeon-rows.js')], { stdio: 'inherit' });
    }
    const b64 = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id="c"></canvas>');
    const res = await page.evaluate(async ([refSrc, clSrc, refR, clR]) => {
        const load = src => new Promise(k => { const im = new Image(); im.onload = () => k(im); im.src = src; });
        /* ⚠️ 창을 좁게 잡는 이유: 처음엔 좌 0~0.72W 를 통째로 쟀는데 **제목 글자와 고목 잔가지**가
           같이 들어와 '경계/행' 이 68 까지 치솟았다(둘 다 하늘이 아니다 — 그 수치로는 구름을
           판정할 수 없다). 4행에서 원본·클론 **양쪽 다 하늘만 있는** 창이 여기다:
           좌 0.33~0.52W(제목 오른쪽 끝 ~0.32W, 고목 왼쪽 끝 ~0.55W), 상 0.06~0.30H. */
        const NW = 400, NH = 116;
        const X0 = Math.round(NW * 0.33), XLIM = Math.round(NW * 0.52);
        const Y0 = Math.round(NH * 0.06), Y1 = Math.round(NH * 0.30);
        const out = {};
        for (const [tag, src, r] of [['orig', refSrc, refR], ['clone', clSrc, clR]]) {
            const im = await load(src);
            const c = document.getElementById('c'); c.width = NW; c.height = NH;
            const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
            x.clearRect(0, 0, NW, NH);
            x.drawImage(im, r[0], r[1], r[2], r[3], 0, 0, NW, NH);
            const d = x.getImageData(X0, Y0, XLIM - X0, Y1 - Y0).data;
            const L = [], hist = new Array(256).fill(0);
            for (let i = 0; i < d.length; i += 4) {
                const l = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
                L.push(l); hist[l]++;
            }
            /* 바탕 = 최빈 휘도(±3 묶음의 무게중심) */
            let best = 0, bi = 0;
            for (let v = 0; v < 256; v++) {
                let s = 0; for (let k = -3; k <= 3; k++) s += hist[v + k] || 0;
                if (s > best) { best = s; bi = v; }
            }
            /* ⚠️ 처음엔 '구름 = 바탕보다 밝은 픽셀' 로만 셌는데, 클론 구름은 바탕보다 **어둡고**
               원본 구름은 **밝아서** 그 지표가 클론에서는 하늘 그라데이션 꼭대기를 세고 있었다.
               양방향을 따로 찍어 어느 쪽으로 벗어나는지 보이게 한다. */
            const bright = L.filter(l => l > bi + 6), dark = L.filter(l => l < bi - 6);
            const w = XLIM - X0, h = Y1 - Y0;
            let edges = 0;
            for (let yy = 0; yy < h; yy++) for (let xx = 1; xx < w; xx++) {
                if (Math.abs(L[yy * w + xx] - L[yy * w + xx - 1]) > 18) edges++;
            }
            out[tag] = {
                sky: bi,
                cloudL: bright.length ? Math.round(bright.reduce((a, b) => a + b, 0) / bright.length) : bi,
                delta: bright.length ? Math.round(bright.reduce((a, b) => a + b, 0) / bright.length) - bi : 0,
                pct: +(bright.length / L.length * 100).toFixed(1),
                darkL: dark.length ? Math.round(dark.reduce((a, b) => a + b, 0) / dark.length) : bi,
                darkDelta: dark.length ? Math.round(dark.reduce((a, b) => a + b, 0) / dark.length) - bi : 0,
                darkPct: +(dark.length / L.length * 100).toFixed(1),
                edgesPerRow: +(edges / h).toFixed(2),
            };
        }
        return out;
    }, [b64(REF), b64(SHOT), REF_ROWS[row], CL_ROWS[row]]);
    await browser.close();
    const o = res.orig, c = res.clone;
    console.log('=== ' + NAMES[row] + ' 하늘 띠(0.06~0.34H)');
    console.log('              바탕L  밝은구름L   +Δ   밝은%  어두운L   -Δ  어두운%  경계/행');
    const fmt = (t, r) => console.log('  ' + t.padEnd(12) + String(r.sky).padStart(5) + String(r.cloudL).padStart(9) + String(r.delta).padStart(7) + String(r.pct).padStart(7) + String(r.darkL).padStart(9) + String(r.darkDelta).padStart(6) + String(r.darkPct).padStart(8) + String(r.edgesPerRow).padStart(9));
    fmt('원본', o); fmt('클론', c);
    console.log('');
    /* 게이트: 구름 대비 Δ 는 원본의 ±10 안, 경계/행은 원본의 2배 이내 */
    const bad = [];
    if (Math.abs(c.delta - o.delta) > 10) bad.push('구름 대비 Δ 가 원본과 ' + (c.delta - o.delta) + ' 차 (허용 ±10) — 구름이 하늘에서 너무 ' + (c.delta > o.delta ? '튄다' : '묻힌다'));
    if (c.edgesPerRow > o.edgesPerRow * 2 + 0.5) bad.push('가로 경계가 행당 ' + c.edgesPerRow + ' 개로 원본 ' + o.edgesPerRow + ' 의 2배 초과 — 딱딱한 외곽선 도형으로 읽힌다');
    if (bad.length) { bad.forEach(b => console.log('  ✗ ' + b)); console.log('\nFAIL'); process.exit(1); }
    console.log('PASS');
})();
