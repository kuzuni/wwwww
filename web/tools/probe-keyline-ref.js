// probe-keyline-ref.js — 원본 30장 / 클론 31장에서 **검정 키라인(테두리)의 두께**를 census 한다.
//
// 왜: `aaa-skin` R3 메모의 결론이 "고칠 목록은 소진됐다, 다음은 **원본이 갖고 있는데 클론에 없는
//     조형 언어**를 census 로 찾아 넓게 적용하는 것"이었고, 남은 축으로 **카드 테두리·아이콘
//     키라인**을 지목했다. 화풍 확정(2026-08-20 ⓕ-㉱ "청키한 테두리 + 플랫 채움")도 같은 축을
//     가리킨다. 이 도구는 판정기가 아니라 그 근거를 만드는 census 다(그래서 항상 exit 0).
//
// 무엇을 재는가 — '가로로 길게 이어지는 검정 띠'의 **세로 두께**(와 그 전치인 세로 띠의 가로 두께).
//   카드·패널·배지·버튼의 위/아래 테두리가 여기 걸린다. 글자 획은 가로로 짧아 걸러진다.
//
// ⚠️ 함정 대비(이 저장소가 반복해 밟은 것들):
//   ⓐ **레터박스가 검정이다** — `#0d1117`(최대 채널 23)이 술어를 통과한다. 그래서 띠가 **양쪽 다
//      비검정으로 닫혀 있을 때만** 센다(이미지 가장자리에 닿는 띠는 버린다).
//   ⓑ **큰 검정 면(어두운 패널·씬)이 두께를 무한대로 만든다** — 두께 상한(MAXT)을 두고 넘으면 버린다.
//   ⓒ **한 띠를 열마다 세면 긴 띠가 표를 지배한다** — 그래서 '띠(연결된 검정 구간) 1개 = 1표'로
//      세고, 각 띠의 두께는 그 띠 안 여러 열의 **중앙값**으로 잡는다(안티에일리어싱 흔들림 제거).
//   ⓓ **원본 490×882 / 클론 499×892 로 크기가 다르다** — 두께를 px 과 %W 둘 다 찍는다.
//   ⓔ 게임 페이지 안에서는 `new Function` 이 조용히 막힌다 — 픽셀 계측은 **빈 페이지**에서 돈다.
//
// 사용: node tools/probe-keyline-ref.js            (원본 30 + 클론 31 을 다 돌고 대조표를 찍는다)
//       node tools/probe-keyline-ref.js ref|clone  (한쪽만)
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
    const blk = new Uint8Array(W * H);
    for (let i = 0, k = 0; i < W * H; i++, k += 4) {
        blk[i] = (Math.max(d[k], d[k+1], d[k+2]) <= 45) ? 1 : 0;
    }
    const B = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : blk[y * W + x];
    const MINRUN = Math.round(W * 0.12);   // 띠로 인정할 최소 길이 (원본 490 기준 59px) — 글자 획 제거
    const MAXT = 16;                       // 두께 상한 — 넘으면 테두리가 아니라 검정 면이다
    const med = (v) => { const s = v.slice().sort((p, q) => p - q); return s[s.length >> 1]; };

    // 방향별 census. horiz=true 면 '가로로 긴 띠의 세로 두께'.
    function scan(horiz) {
        const LONG = horiz ? W : H, CROSS = horiz ? H : W;
        const px = (u, v) => horiz ? B(u, v) : B(v, u);   // u=긴 축, v=짧은 축
        const bands = [];
        const seen = new Uint8Array(W * H);
        const mark = (u, v) => { const i = horiz ? (v * W + u) : (u * W + v); seen[i] = 1; };
        const got = (u, v) => { const i = horiz ? (v * W + u) : (u * W + v); return seen[i]; };
        for (let v = 0; v < CROSS; v++) {
            let u = 0;
            while (u < LONG) {
                if (!px(u, v) || got(u, v)) { u++; continue; }
                // 이 v 줄에서 검정이 이어지는 구간 [u0, u1)
                let u1 = u; while (u1 < LONG && px(u1, v)) u1++;
                const len = u1 - u;
                if (len < MINRUN) { u = u1; continue; }
                // 구간 안 여러 열에서 짧은축 두께를 잰다(양끝 10%는 모서리라 뺀다)
                const a0 = u + Math.floor(len * 0.1), a1 = u1 - Math.floor(len * 0.1);
                const ts = [];
                let openEdge = false;
                for (let s = a0; s < a1; s += Math.max(1, Math.floor((a1 - a0) / 24))) {
                    let vv = v; while (vv > 0 && px(s, vv - 1)) vv--;          // 위로 확장
                    let vw = v; while (vw < CROSS - 1 && px(s, vw + 1)) vw++;  // 아래로 확장
                    if (vv === 0 || vw === CROSS - 1) { openEdge = true; break; }   // ⓐ 레터박스
                    ts.push(vw - vv + 1);
                }
                // 이 띠가 차지한 화소를 통째로 소비(같은 띠를 다음 줄에서 또 세지 않게)
                for (let s = u; s < u1; s++) {
                    let vv = v; while (vv > 0 && px(s, vv - 1)) vv--;
                    let vw = v; while (vw < CROSS - 1 && px(s, vw + 1)) vw++;
                    if (vw - vv + 1 > 200) { vv = v; vw = v; }
                    for (let t = vv; t <= vw; t++) mark(s, t);
                }
                u = u1;
                if (openEdge || !ts.length) continue;
                const t = med(ts);
                if (t > MAXT) continue;                                        // ⓑ 검정 면
                bands.push({ len, t });
            }
        }
        return bands;
    }
    const h = scan(true), v = scan(false);
    return { W, H, h, v };
})`;

function summarize(all, label, W0) {
    const hist = new Map();
    let n = 0;
    for (const r of all) for (const b of r.bands) { hist.set(b.t, (hist.get(b.t) || 0) + 1); n++; }
    const rows = [...hist.entries()].sort((a, b) => b[1] - a[1]);
    let acc = 0, med = 0;
    const flat = [];
    for (const r of all) for (const b of r.bands) flat.push(b.t);
    flat.sort((a, b) => a - b);
    med = flat[flat.length >> 1] || 0;
    const mean = flat.length ? flat.reduce((s, x) => s + x, 0) / flat.length : 0;
    console.log(`${label}: 띠 ${n}개 · 중앙값 ${med}px (${(med / W0 * 100).toFixed(2)}%W) · 평균 ${mean.toFixed(2)}px`);
    console.log(`  두께 분포(상위6) ${rows.slice(0, 6).map(([t, c]) => `${t}px×${c}`).join(' · ')}`);
    return { n, med, mean, hist: rows };
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto('about:blank');

    async function run(dir, label) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
        const H = [], V = [];
        let W0 = 0;
        for (const f of files) {
            const dataUrl = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
            // ⚠️ ⓔ 함정: `page.evaluate(<문자열>, arg)` 는 문자열을 **식**으로 보고 arg 를 안 넘긴다.
            //    함수를 넘기고 그 안에서 `new Function` 으로 되살린다(빈 페이지라 CSP 에 안 막힌다).
            const r = await page.evaluate(({ src, a }) => (new Function('return ' + src))()(a), { src: SRC, a: { dataUrl } });
            W0 = r.W;
            H.push({ file: f, bands: r.h });
            V.push({ file: f, bands: r.v });
        }
        console.log(`\n===== ${label} (${files.length}장, ${W0}px 폭) =====`);
        const hs = summarize(H, '가로 띠(위/아래 테두리)', W0);
        const vs = summarize(V, '세로 띠(좌/우 테두리)', W0);
        return { W0, hs, vs, H, V };
    }

    const out = {};
    if (WHICH === 'ref' || WHICH === 'both') out.ref = await run(REF_DIR, '원본');
    if (WHICH === 'clone' || WHICH === 'both') out.clone = await run(CLONE_DIR, '클론');

    if (out.ref && out.clone) {
        console.log('\n===== 대조 =====');
        const f = (o, k) => `${o[k].med}px (${(o[k].med / o.W0 * 100).toFixed(2)}%W)`;
        console.log(`가로 테두리 중앙 두께 — 원본 ${f(out.ref, 'hs')}  ↔  클론 ${f(out.clone, 'hs')}`);
        console.log(`세로 테두리 중앙 두께 — 원본 ${f(out.ref, 'vs')}  ↔  클론 ${f(out.clone, 'vs')}`);
        const rp = out.ref.hs.med / out.ref.W0 * 100, cp = out.clone.hs.med / out.clone.W0 * 100;
        console.log(`차이 ${(cp - rp).toFixed(2)}%p (가로) — 음수면 클론이 얇다`);
    }
    await browser.close();
})();
