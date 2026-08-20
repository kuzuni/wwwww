// probe-ring-sweep.js — '흰 채움 + 검정 링' 활자가 **화면 전체에서 얼마나 쓰이는지** 를
// 원본 30장 ↔ 클론 31장으로 census 한다(화풍 ⓕ-㉴ 의 확장 축).
// 짝: tools/probe-header-ring.js(같은 지표를 **제목 띠 하나**에만 적용하는 판정기).
//
// 왜: ⓚ 가 팝업 제목 9종에 흰+링을 넣었지만, 원본에서 이 활자는 **제목만이 아니다** —
//     HUD 수치(`8.87k`·`149.05`) · 던전 열쇠(`0/2`) · 리본 제목까지 전부 같은 활자다.
//     어디가 더 남았는지 알려면 요소 하나씩 짚기 전에 **화면 단위로 얼마나 벌어졌는지** 를
//     먼저 봐야 한다(요소부터 짚으면 눈에 띈 것만 고치고 끝난다 — 이 저장소의 반복된 실패).
//
// 무엇을 재는가 — probe-header-ring 과 **같은 지표**를 화면 전체에 건다:
//   가로 단면에서 '검정런 → 밝은 속살 → 검정런' 이 몇 번 나오나. 속살비 = 속살 수 ÷ 검정런 수.
//   민무늬 활자는 속살이 없고, 외곽선 활자는 검정런마다 속살이 낀다.
//
// ⚠️ 함정 대비:
//   ⓐ **이건 판정기가 아니라 census 다** — 화면 전체를 재므로 아이콘·테두리의 검정런도 섞인다.
//      절대값이 아니라 **원본 대비 격차**와 **화면 순위**를 보는 데 쓸 것.
//   ⓑ 원본 488~499px / 클론 499px 로 폭이 다르다 — 화면 전체를 재니 폭 차이는 비율에 안 섞인다.
//   ⓒ 클론 캡처가 **낡았으면 옛 CSS 를 재게 된다** — 돌리기 전에 `node tools/shot-screens.js` 로
//      다시 찍을 것(ⓚ 세션이 이 순서를 지켰다).
//   ⓓ 게임 페이지 안에서는 `new Function` 이 막힌다 — 화소 계측은 **빈 페이지**에서 돈다.
//
// 사용: node tools/probe-ring-sweep.js         (원본 ↔ 클론 화면별 대조표)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const REF_DIR = path.resolve(__dirname, '../ref/screens');
const CLONE_DIR = path.resolve(__dirname, 'ref-cmp/clone');

// 화면 이름 ↔ 원본 shot 짝은 shot-screens.js 가 단일 출처다.
function loadPairs() {
    const src = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
    const out = [];
    const re = /\[\s*'([a-z0-9-]+)'\s*,\s*'(\d{6})'/g;
    let m;
    while ((m = re.exec(src))) out.push([m[1], m[2]]);
    return out;
}

const SWEEP = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const d = g.getImageData(0, 0, W, H).data;
    const L = (x, y) => { const k = (y * W + x) * 4; return Math.max(d[k], d[k+1], d[k+2]); };
    const BLACK = 70, LIGHT = 170;
    const MAXRUN = Math.round(W * 0.03);   // 검정 '면'(패널·테두리)은 활자 획이 아니다

    let blk = 0, core = 0;
    const coreW = [];
    for (let y = 1; y < H - 1; y++) {
        let x = 0;
        while (x < W) {
            if (L(x, y) > BLACK) { x++; continue; }
            let e = x; while (e < W && L(e, y) <= BLACK) e++;
            const len = e - x;
            if (x > 0 && e < W && len <= MAXRUN) {
                blk++;
                let w2 = e; while (w2 < W && L(w2, y) >= LIGHT) w2++;
                if (w2 > e && w2 < W && L(w2, y) <= BLACK && (w2 - e) <= MAXRUN) { core++; coreW.push(w2 - e); }
            }
            x = e;
        }
    }
    coreW.sort((p, q) => p - q);
    return { blk, core, rate: +(core / (blk || 1)).toFixed(3), coreMed: coreW.length ? coreW[coreW.length >> 1] : 0 };
})`;

(async () => {
    const pairs = loadPairs();
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto('about:blank');
    const run = (file) => page.evaluate(({ src, a }) => (new Function('return ' + src))()(a),
        { src: SWEEP, a: { dataUrl: 'data:image/png;base64,' + fs.readFileSync(file).toString('base64') } });

    console.log('화면              ── 원본 속살비 ──   ── 클론 속살비 ──   Δ');
    const rows = [];
    for (const [name, ref] of pairs) {
        const cf = path.join(CLONE_DIR, name + '.png');
        const rf = path.join(REF_DIR, 'shot-' + ref + '.png');
        if (!fs.existsSync(cf) || !fs.existsSync(rf)) continue;
        const c = await run(cf), r = await run(rf);
        rows.push({ name, r, c, d: +(c.rate - r.rate).toFixed(3) });
    }
    await browser.close();
    rows.sort((a, b) => a.d - b.d);
    for (const q of rows) {
        console.log(`${q.name.padEnd(17)} ${String(q.r.rate + ' (' + q.r.core + '/' + q.r.blk + ')').padEnd(19)} ${String(q.c.rate + ' (' + q.c.core + '/' + q.c.blk + ')').padEnd(19)} ${q.d >= 0 ? '+' : ''}${q.d}`);
    }
    const ds = rows.map(q => q.d).sort((a, b) => a - b);
    const med = ds[ds.length >> 1];
    console.log(`\n화면 ${rows.length}개 — Δ 중앙값 ${med >= 0 ? '+' : ''}${med.toFixed(3)} (음수 = 클론에 흰+링 활자가 덜 쓰였다)`);
    console.log(`가장 벌어진 5화면(여기부터 볼 것): ` + rows.slice(0, 5).map(q => `${q.name} ${q.d}`).join(' · '));
})();
