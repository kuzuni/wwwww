// probe-shadow-hardness-ref.js — 원본 30장 / 클론 31장에서 **가로 경계의 무름(ramp 길이)** 을 census 한다.
//
// 왜: 화풍 ⓕ-㉱ 가 "하드 오프셋 그림자(블러 대신)"를 요구한다. 그런데 css 에는 블러 있는 그림자
//     층이 136 개(드롭 43 · 글로우 34 · inset 59) 남아 있다. **손대기 전에 원본이 실제로 어느
//     쪽인지부터 잰다** — `aaa-skin` ⓐ 가 통했던 방법이고, 바로 앞 축(검정 키라인)은 이 census 로
//     '클론이 이미 더 두껍다'가 나와 착수 전에 기각됐다. 이 도구도 판정기가 아니라 census 다(exit 0).
//
// 무엇을 재는가 — 밝은 면에서 어두운 쪽으로 넘어가는 **세로 방향 전이의 길이**.
//   하드 그림자·테두리는 1~2행 만에 끝나고, 블러 그림자는 여러 행에 걸쳐 완만하게 떨어진다.
//   열마다 위→아래로 훑어 '충분히 큰 하강 전이'를 찾고, 그 전이가 10%→90% 를 지나는 **행 수**를 잰다.
//
// ⚠️ 함정 대비:
//   ⓐ **아래로 내려가는 전이만** 본다(면 → 그림자). 위로 올라가는 전이는 다음 요소의 시작이다.
//   ⓑ 3D 전투 씬·일러스트는 원래 부드러운 그라디언트라 여기 걸리면 표가 오염된다 — 전이 **앞뒤가
//      충분히 평평한** 곳만 센다(면 8행·바닥 4행이 각각 ±6 안). 씬의 하늘·지형은 계속 변해서 빠진다.
//   ⓒ 한 경계가 열마다 한 표씩 들어가면 넓은 패널이 표를 지배한다 — 열 24개마다 하나씩만 샘플링한다.
//
// 사용: node tools/probe-shadow-hardness-ref.js [ref|clone|both]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const REF_DIR = path.resolve(__dirname, '../ref/screens');
const CLONE_DIR = path.resolve(__dirname, 'ref-cmp/clone');
const WHICH = (process.argv[2] || 'both').toLowerCase();

const SRC = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const L = (x, y) => { const k = (y * W + x) * 4; return .2126*d[k] + .7152*d[k+1] + .0722*d[k+2]; };
    const flat = (x, y0, y1, tol) => {           // [y0,y1) 이 평평한가
        let lo = 1e9, hi = -1e9;
        for (let y = y0; y < y1; y++) { const v = L(x, y); if (v < lo) lo = v; if (v > hi) hi = v; }
        return (hi - lo) <= tol;
    };
    const ramps = [];
    for (let x = 6; x < W - 6; x += 24) {                    // ⓒ 열 샘플링
        for (let y = 10; y < H - 20; y++) {
            const top = L(x, y), bot = L(x, y + 1);
            if (top - bot < 12) continue;                    // ⓐ 하강 전이 시작 후보
            if (!flat(x, y - 8, y, 6)) continue;             // ⓑ 위가 평평한 면인가
            // 전이가 끝나는 곳 = 다시 4행 이상 평평해지는 지점 (최대 18행까지 본다)
            let e = -1;
            for (let k = y + 1; k < Math.min(H - 5, y + 18); k++) {
                if (flat(x, k, k + 4, 6)) { e = k; break; }
            }
            if (e < 0) { y += 4; continue; }
            const face = L(x, y), floor = L(x, e);
            const drop = face - floor;
            if (drop < 40) { y = e; continue; }              // 얕은 결은 그림자가 아니다
            // 10%→90% 를 지나는 행 수
            let a10 = -1, a90 = -1;
            for (let k = y; k <= e; k++) {
                const f = (face - L(x, k)) / drop;
                if (a10 < 0 && f >= 0.1) a10 = k;
                if (f >= 0.9) { a90 = k; break; }
            }
            if (a10 >= 0 && a90 >= a10) ramps.push(a90 - a10 + 1);
            y = e;
        }
    }
    return { W, H, ramps };
})`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto('about:blank');

    async function run(dir, label) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
        const all = [];
        for (const f of files) {
            const dataUrl = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
            const r = await page.evaluate(({ src, a }) => (new Function('return ' + src))()(a), { src: SRC, a: { dataUrl } });
            all.push(...r.ramps);
        }
        all.sort((p, q) => p - q);
        const hist = new Map();
        for (const v of all) hist.set(v, (hist.get(v) || 0) + 1);
        const rows = [...hist.entries()].sort((a, b) => a[0] - b[0]);
        const med = all[all.length >> 1] || 0;
        const hard = all.filter(v => v <= 2).length;
        console.log(`\n===== ${label} (${files.length}장) =====`);
        console.log(`전이 ${all.length}개 · 중앙 ramp ${med}행 · 평균 ${(all.reduce((s, x) => s + x, 0) / (all.length || 1)).toFixed(2)}행`);
        console.log(`  하드(≤2행) 비율 ${(hard / (all.length || 1) * 100).toFixed(1)}%`);
        console.log(`  ramp 분포 ${rows.slice(0, 8).map(([v, c]) => `${v}행×${c}`).join(' · ')}`);
        return { med, hard: hard / (all.length || 1), n: all.length };
    }

    const out = {};
    if (WHICH === 'ref' || WHICH === 'both') out.ref = await run(REF_DIR, '원본');
    if (WHICH === 'clone' || WHICH === 'both') out.clone = await run(CLONE_DIR, '클론');
    if (out.ref && out.clone) {
        console.log('\n===== 대조 =====');
        console.log(`중앙 ramp — 원본 ${out.ref.med}행 ↔ 클론 ${out.clone.med}행`);
        console.log(`하드(≤2행) 비율 — 원본 ${(out.ref.hard * 100).toFixed(1)}% ↔ 클론 ${(out.clone.hard * 100).toFixed(1)}%`);
        console.log(out.clone.hard < out.ref.hard - 0.05
            ? '→ 클론이 원본보다 무르다: ㉱ 하드 오프셋 전환에 근거가 있다'
            : '→ 클론이 원본만큼(또는 더) 하드하다: 이 축은 손댈 것이 없다');
    }
    await browser.close();
})();
