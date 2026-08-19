// probe-keyline-ink-ref.js — 원본 30장 / 클론 31장에서 **키라인의 잉크 색**을 census 한다.
//
// 왜: `aaa-skin` ⓖ 가 만든 `probe-keyline-ref` 는 키라인의 **두께**만 쟀고(클론이 이미 더 두꺼워
//     그 축은 기각됐다), **색**은 아무도 안 쟀다. 그런데 이 세션이 모서리 census 를 돌리다
//     문턱을 좁히자(순검정 ≤8) **클론 모서리가 원본의 1/6 로 줄어드는** 이상을 봤고, 원인을
//     따라가니 클론 팝업 외곽선 토큰이 `--pp-line: #17181a`(23,24,26) 였다 — 순검정이 아니다.
//     화풍 ⓕ-㉱ 는 "청키한 테두리"를 요구하고, 이 저장소 규약은 지적을 좇기 전에 픽셀로
//     교차검증하라고 한다. 이 도구가 그 근거다. 판정기가 아니라 census 다(항상 exit 0).
//
// 무엇을 재는가 — **밝은 바탕 위에 놓인 가로 어두운 선**의 잉크 색.
//   ⑴ 길이 ≥12%W (글자 획 제거) ⑵ 두께 ≤8px (검은 '면'이 아니라 '선') ⑶ 선 위·아래 2px 가
//   둘 다 선보다 훨씬 밝다(밝기 차 ≥40) — 즉 진짜 외곽선이지 어두운 패널의 가장자리가 아니다.
//   이 세 조건이 팝업·카드·행의 검정 키라인만 남긴다.
//
// ⚠️ 함정 대비:
//   ⓐ **어두운 패널의 가장자리를 키라인으로 세면 안 된다** — 위·아래가 둘 다 밝아야 한다는
//      ⑶ 이 그것을 막는다(패널 가장자리는 한쪽만 밝다).
//   ⓑ **안티에일리어싱된 선은 가장자리 행이 흐리다** — 잉크는 선 **가운데 행**에서만 읽는다.
//   ⓒ 원본 488~499px / 클론 499px 로 폭이 다르다 — 길이 문턱은 %W 로 잡는다.
//   ⓓ 게임 페이지 안에서는 `new Function` 이 막힌다 — 픽셀 계측은 **빈 페이지**에서 돈다.
//      `page.evaluate(<문자열>, arg)` 는 문자열을 식으로 보고 arg 를 안 넘긴다(함수로 감쌀 것).
//
// 사용: node tools/probe-keyline-ink-ref.js            (원본 + 클론 대조표)
//       node tools/probe-keyline-ink-ref.js ref|clone  (한쪽만)
//       node tools/probe-keyline-ink-ref.js both gray  (회색 잉크 선만 — 길이·위치·바탕색까지)
//
// 🔎 `gray` 모드는 왜 있나: 잉크 census 1차에서 **원본 외곽선의 32%가 회색 대역**
//    (rgb(50,49,50)/rgb(53,53,53))인데 클론은 10%뿐이었다. 검정 대역을 맞춘 뒤 남은 유일한
//    어긋남이라, "그 회색 선이 원본에서 **무엇**이냐"를 갈라야 다음 처방이 나온다. 색만으로는
//    알 수 없으니 **길이(%W)·세로 위치(%H)·선 위아래 바탕색**을 같이 찍어 요소를 지목한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const REF_DIR = path.resolve(__dirname, '../ref/screens');
const CLONE_DIR = path.resolve(__dirname, 'ref-cmp/clone');
const WHICH = (process.argv[2] || 'both').toLowerCase();
const GRAY = process.argv.includes('gray');
const isGray = (l) => l.ink >= 40 && l.ink <= 60;   // 회색 대역 rgb(50,49,50)~rgb(53,53,53)

const SRC = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const L = (x, y) => {                       // 밝기 = 최대 채널 (검정 판정과 같은 척도)
        if (x < 0 || y < 0 || x >= W || y >= H) return -1;
        const k = (y * W + x) * 4;
        return Math.max(d[k], d[k+1], d[k+2]);
    };
    const RGB = (x, y) => { const k = (y * W + x) * 4; return [d[k], d[k+1], d[k+2]]; };

    const DARK = 60;                              // '어두운' 상한
    const MINRUN = Math.round(W * 0.12);
    const MAXT = 8;                               // 선 두께 상한
    const CONTRAST = 40;                          // 위·아래가 선보다 이만큼 밝아야 외곽선

    // 🚨 **한 줄이 아니라 한 '선'을 한 번만 센다.** 1차 판은 행마다 셌는데, 그러면 **두께가 곧
    //    표수**가 된다 — 7~8px 두꺼운 회색 띠는 7~8표, 1~3px 검정 키라인은 1~3표라 **비율이
    //    두께로 왜곡**된다(원본 회색 129 '개'는 실제로 띠 17개쯤이었다). 띠를 잡으면 그 화소를
    //    통째로 소비해 아래 행에서 다시 세지 않는다(probe-keyline-ref 와 같은 처방).
    const seen = new Uint8Array(W * H);
    const lines = [];
    for (let y = 1; y < H - 1; y++) {
        let x = 0;
        while (x < W) {
            if (L(x, y) > DARK || seen[y * W + x]) { x++; continue; }
            let x1 = x; while (x1 < W && L(x1, y) <= DARK) x1++;
            const len = x1 - x;
            if (len < MINRUN) { x = x1; continue; }
            for (let s = x; s < x1; s++) {           // 이 띠의 세로 범위를 소비
                let yv = y, yw = y;
                while (yv > 0 && L(s, yv - 1) <= DARK) yv--;
                while (yw < H - 1 && L(s, yw + 1) <= DARK) yw++;
                if (yw - yv + 1 > MAXT) { yv = y; yw = y; }   // 검정 '면'은 소비하지 않는다
                for (let t = yv; t <= yw; t++) seen[t * W + s] = 1;
            }
            // 가운데 열들에서 두께와 위·아래 밝기를 잰다(양끝 25% 는 모서리라 뺀다)
            const samples = [];
            for (let s = x + (len >> 2); s < x1 - (len >> 2); s += Math.max(1, len >> 4)) {
                let yv = y; while (yv > 0 && L(s, yv - 1) <= DARK) yv--;
                let yw = y; while (yw < H - 1 && L(s, yw + 1) <= DARK) yw++;
                const th = yw - yv + 1;
                if (th > MAXT) { samples.length = 0; break; }             // ⓐ 선이 아니라 면
                const above = L(s, yv - 2), below = L(s, yw + 2);
                if (above < 0 || below < 0) { samples.length = 0; break; }
                const mid = (yv + yw) >> 1;                                // ⓑ 가운데 행에서만 잉크를 읽는다
                const ink = L(s, mid);
                if (above - ink < CONTRAST || below - ink < CONTRAST) continue;  // ⓐ 한쪽만 밝으면 패널 가장자리
                samples.push({ th, ink, rgb: RGB(s, mid), y: mid, up: RGB(s, yv - 2), dn: RGB(s, yw + 2) });
            }
            x = x1;
            if (samples.length < 4) continue;
            samples.sort((p, q) => p.ink - q.ink);
            const m = samples[samples.length >> 1];
            lines.push({ len, th: m.th, ink: m.ink, rgb: m.rgb, lenPct: +(len / W * 100).toFixed(1),
                         yPct: +(m.y / H * 100).toFixed(1), up: m.up, dn: m.dn });
        }
    }
    return { W, H, lines };
})`;

function summarize(all, label) {
    const inks = [], hist = new Map();
    for (const f of all) for (const l of f.lines) {
        inks.push(l.ink);
        const key = l.rgb.join(',');
        hist.set(key, (hist.get(key) || 0) + 1);
    }
    inks.sort((a, b) => a - b);
    const med = inks.length ? inks[inks.length >> 1] : -1;
    const mean = inks.length ? inks.reduce((s, x) => s + x, 0) / inks.length : 0;
    const pure = inks.filter(v => v <= 8).length;
    const rows = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`${label}: 외곽선 ${inks.length}개`);
    console.log(`  잉크 밝기(최대채널) 중앙값 ${med} · 평균 ${mean.toFixed(1)}`);
    console.log(`  순검정(≤8) 비율 ${(pure / (inks.length || 1) * 100).toFixed(1)}%  (${pure}/${inks.length})`);
    console.log(`  잉크 색 분포(상위8) ${rows.map(([k, n]) => `rgb(${k})×${n}`).join(' · ')}`);
    return { n: inks.length, med, mean, purePct: pure / (inks.length || 1) * 100 };
}

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
            all.push({ file: f, lines: r.lines });
        }
        console.log(`\n===== ${label} (${files.length}장) =====`);
        const s = summarize(all, '키라인 잉크');
        if (GRAY) {
            const rows = [];
            for (const f of all) for (const l of f.lines) if (isGray(l)) rows.push({ f: f.file.replace(/\.png$/, ''), l });
            console.log(`  ── 회색 잉크 선 ${rows.length}개 (길이%W · 세로위치%H · 두께 · 위/아래 바탕)`);
            const byFile = new Map();
            for (const r of rows) { if (!byFile.has(r.f)) byFile.set(r.f, []); byFile.get(r.f).push(r.l); }
            for (const [f, ls] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
                const l0 = ls.slice().sort((p, q) => p.yPct - q.yPct);
                console.log(`    ${f} (${ls.length}개) ` + l0.slice(0, 6).map(l =>
                    `[${l.lenPct}%W y${l.yPct}%H ${l.th}px ↑rgb(${l.up}) ↓rgb(${l.dn})]`).join(' '));
            }
        }
        const per = all.map(f => {
            const v = f.lines.map(l => l.ink).sort((a, b) => a - b);
            return { file: f.file, n: v.length, med: v.length ? v[v.length >> 1] : -1 };
        }).filter(x => x.n >= 3).sort((a, b) => b.med - a.med);
        console.log('  화면별 중앙 잉크(밝은 순 상위8): ' + per.slice(0, 8).map(x => `${x.file.replace(/\.png$/, '')} ${x.med}/${x.n}`).join(' · '));
        return { s, all };
    }

    const out = {};
    if (WHICH === 'ref' || WHICH === 'both') out.ref = await run(REF_DIR, '원본');
    if (WHICH === 'clone' || WHICH === 'both') out.clone = await run(CLONE_DIR, '클론');

    if (out.ref && out.clone) {
        console.log('\n===== 대조 =====');
        console.log(`잉크 밝기 중앙값 — 원본 ${out.ref.s.med}  ↔  클론 ${out.clone.s.med}   (양수 차이 = 클론이 흐리다)`);
        console.log(`순검정 비율   — 원본 ${out.ref.s.purePct.toFixed(1)}%  ↔  클론 ${out.clone.s.purePct.toFixed(1)}%`);
    }
    await browser.close();
})();
