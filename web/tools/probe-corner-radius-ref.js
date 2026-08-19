// probe-corner-radius-ref.js — 원본 30장 / 클론 31장에서 **모서리 곡률(border-radius)** 을 census 한다.
//
// 왜: 화풍 확정(2026-08-20) ⓕ-㉲ 가 "각지거나 **계단식 픽셀-라운드** 모서리"를 요구하는데,
//     `aaa-skin` ⓖ 메모가 남긴 '다음 축 후보' 중 아직 아무도 재 보지 않은 자리가 이것이다.
//     ⓖ 가 키라인 두께를 census 로 재서 **착수 전에 기각**했던 것과 같은 순서를 따른다 —
//     "원본이 실제로 각졌는가"를 먼저 픽셀로 확인하고, 그 다음에만 CSS 를 건드린다.
//     판정기가 아니라 근거를 만드는 census 다(그래서 항상 exit 0).
//
// 무엇을 재는가 — **가로 키라인 띠의 끝이 세로 키라인보다 얼마나 안쪽에서 끝나는가(= 인셋)**.
//   각진 모서리는 가로 띠가 세로 스트로크 바깥 끝까지 그대로 간다 → 인셋 0.
//   반지름 r 인 라운드 모서리는 가로 띠가 **정확히 r 만큼** 안쪽에서 끝난다 → 인셋 ≈ r.
//   (첫 판에서 쓴 '대각선 침투 깊이'(0.2929·r)는 **버렸다** — ⑴ 값이 정수 k 로 양자화돼
//    r 이 0/3.4/6.8/10.2px 세 계단밖에 안 나오고 ⑵ 연결요소 bbox 를 쓰는데 클론은 키라인이
//    서로 이어져 한 덩어리가 되면서 31장에서 **사각형 7개**밖에 못 잡았다. 인셋은 국소 측정이라
//    연결에 안 휘둘리고 신호가 3.4배 크다.)
//
// ⚠️ 함정 대비:
//   ⓐ **어두운 배경이 전부 '검정'으로 잡히면 화면이 통째로 한 덩어리가 된다** — 원본 배경은
//      `1,18,10`(어두운 초록) · `25,25,25`(딤) · `14,17,27`(카드 바탕)이고 **키라인만 0~8** 이다.
//      그래서 문턱을 **max 채널 ≤ 8** 로 좁혀 순검정만 남긴다(≤45 를 쓰면 전 화면이 한 컴포넌트).
//      클론도 같은 대역(`0,0,0`·`3,4,7`·`2,3,5`)이라 같은 문턱이 그대로 통한다(실측 확인).
//   ⓑ **검은 글자 획도 검정이다** — 띠 최소 길이(12%W)로 거른다.
//   ⓒ **검정 면(어두운 패널·씬 실루엣)은 테두리가 아니다** — 띠 두께 상한 MAXT 로 거른다.
//   ⓓ **띠 끝 근처의 무관한 검정이 인셋을 부풀린다** — 세로로 2행 이상 이어지는 화소만
//      '세로 스트로크'로 인정하고, 창(window)도 24px 로 좁힌다.
//   ⓔ **원본 488~499px / 클론 499px 로 폭이 다르다** — 인셋을 px 과 %W 둘 다 찍는다.
//   ⓕ 게임 페이지 안에서는 `new Function` 이 막힌다 — 픽셀 계측은 **빈 페이지**에서 돈다.
//      그리고 `page.evaluate(<문자열>, arg)` 는 문자열을 식으로 보고 arg 를 안 넘긴다(함수로 감쌀 것).
//
// 사용: node tools/probe-corner-radius-ref.js            (원본 + 클론 대조표)
//       node tools/probe-corner-radius-ref.js ref|clone  (한쪽만)
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

    // ⓐ 순검정만 — 배경(최소 max 18)과 키라인(0~8) 사이에 문턱을 둔다.
    const blk = new Uint8Array(W * H);
    for (let i = 0, k = 0; i < W * H; i++, k += 4) {
        blk[i] = (Math.max(d[k], d[k+1], d[k+2]) <= 8) ? 1 : 0;
    }
    const B = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : blk[y * W + x];

    const MINRUN = Math.round(W * 0.12);  // ⓑ 띠로 인정할 최소 길이 — 글자 획 제거
    const MAXT = 16;                      // ⓒ 두께 상한 — 넘으면 테두리가 아니라 검정 면
    const WIN = 40;                       // ⓓ 인셋을 찾을 행 수 (모서리 반지름 상한)
    const STEP = 3;                       // ⓓ 한 행에 경계가 움직일 수 있는 최대 거리

    // 한 모서리의 인셋 = 가로 띠 끝 xa 에서, **모서리 호(弧)의 바깥 경계를 한 행씩 따라가며**
    // 도달하는 가장 바깥 x 까지의 거리. 라운드 사각형이면 그게 곧 반지름이다.
    //   🚨 첫 판은 "창 안 어디든 세로 스트로크가 있으면 그 바깥 x" 로 쟀는데, **무관한 검정이
    //      창 끝에 있으면 인셋이 창 크기로 포화**했다(원본 모서리의 42%가 정확히 WIN=24px 로
    //      나왔다 — 자가 진단으로 잡은 함정이다). 그래서 경계를 **행당 ±STEP 안에서만** 잇는다:
    //      멀리 떨어진 검정으로 건너뛸 수 없으니 다른 요소를 주워 담지 않는다.
    //   두 방향(아래/위)을 다 보고 큰 쪽을 쓴다 — 띠가 위 테두리면 아래로, 아래 테두리면 위로 이어진다.
    function inset(xa, y, sign, dy) {
        // sign=+1: 왼쪽 끝(바깥이 x 작은 쪽) / sign=-1: 오른쪽 끝
        let cur = xa, best = 0, miss = 0;
        for (let k = 1; k <= WIN; k++) {
            const yy = y + dy * k;
            if (yy < 1 || yy >= H - 1) break;
            let nxt = null;
            for (let t = STEP; t >= -STEP; t--) {        // 바깥쪽부터 훑어 가장 바깥 것을 쥔다
                const x = cur - sign * t;
                if (x < 0 || x >= W) continue;
                if (B(x, yy)) { nxt = x; break; }
            }
            if (nxt === null) { if (++miss > 1) break; continue; }   // 안티에일리어싱 1행 구멍 허용
            miss = 0; cur = nxt;
            const ins = sign * (xa - cur);
            if (ins > best) best = ins;
        }
        return best;
    }

    const corners = [];
    const seen = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        let x = 0;
        while (x < W) {
            if (!B(x, y) || seen[y * W + x]) { x++; continue; }
            let x1 = x; while (x1 < W && B(x1, y)) x1++;
            const len = x1 - x;
            if (len < MINRUN) { x = x1; continue; }
            // 이 띠의 두께(가운데 몇 열의 중앙값) — 검정 면 거르기
            const ts = [];
            let openEdge = false;
            for (let s = x + (len >> 2); s < x1 - (len >> 2); s += Math.max(1, len >> 4)) {
                let yv = y; while (yv > 0 && B(s, yv - 1)) yv--;
                let yw = y; while (yw < H - 1 && B(s, yw + 1)) yw++;
                if (yv === 0 || yw === H - 1) { openEdge = true; break; }
                ts.push(yw - yv + 1);
            }
            // 이 띠 화소를 소비(같은 띠를 아래 행에서 또 세지 않게)
            for (let s = x; s < x1; s++) {
                let yv = y, yw = y;
                while (yv > 0 && B(s, yv - 1)) yv--;
                while (yw < H - 1 && B(s, yw + 1)) yw++;
                if (yw - yv + 1 > MAXT) { yv = y; yw = y; }
                for (let t = yv; t <= yw; t++) seen[t * W + s] = 1;
            }
            x = x1;
            if (openEdge || !ts.length) continue;
            ts.sort((p, q) => p - q);
            const th = ts[ts.length >> 1];
            if (th > MAXT) continue;
            // 화면 좌우 끝에 붙은 띠는 앱 프레임이라 모서리가 없다
            if (x - len <= 1 || x1 >= W - 1) continue;
            for (const [xa, sign] of [[x - len, 1], [x1 - 1, -1]]) {
                let v = null;
                for (const dy of [1, -1]) {
                    const r = inset(xa, y, sign, dy);
                    if (r !== null && (v === null || r > v)) v = r;
                }
                if (v !== null) corners.push({ ins: v, len, th });
            }
        }
    }
    return { W, H, corners };
})`;

function summarize(all, label, W0) {
    const v = [];
    for (const f of all) for (const c of f.corners) v.push(c.ins);
    v.sort((a, b) => a - b);
    const med = v.length ? v[v.length >> 1] : 0;
    const mean = v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
    const hard = v.filter(x => x <= 2).length;      // 각진 모서리 = 인셋 ≤2px
    const hist = new Map();
    for (const x of v) hist.set(x, (hist.get(x) || 0) + 1);
    const rows = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`${label}: 모서리 ${v.length}개`);
    console.log(`  인셋(≈반지름) 중앙값 ${med}px (${(med / W0 * 100).toFixed(2)}%W) · 평균 ${mean.toFixed(2)}px`);
    console.log(`  각진 모서리(인셋≤2px) 비율 ${(hard / (v.length || 1) * 100).toFixed(1)}%  (${hard}/${v.length})`);
    console.log(`  분포(상위8) ${rows.map(([t, c]) => `${t}px×${c}`).join(' · ')}`);
    return { n: v.length, med, mean, hardPct: hard / (v.length || 1) * 100 };
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto('about:blank');

    async function run(dir, label) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
        const all = [];
        let W0 = 0;
        for (const f of files) {
            const dataUrl = 'data:image/png;base64,' + fs.readFileSync(path.join(dir, f)).toString('base64');
            const r = await page.evaluate(({ src, a }) => (new Function('return ' + src))()(a), { src: SRC, a: { dataUrl } });
            W0 = r.W;
            all.push({ file: f, corners: r.corners });
        }
        console.log(`\n===== ${label} (${files.length}장, ${W0}px 폭) =====`);
        const s = summarize(all, '모서리 인셋', W0);
        const per = all.map(f => {
            const v = f.corners.map(c => c.ins).sort((a, b) => a - b);
            return { file: f.file, n: v.length, med: v.length ? v[v.length >> 1] : 0 };
        }).filter(x => x.n).sort((a, b) => b.med - a.med);
        console.log('  화면별 중앙 인셋(둥근 순 상위8): ' + per.slice(0, 8).map(x => `${x.file.replace(/\.png$/, '')} ${x.med}px/${x.n}`).join(' · '));
        return { W0, s, all };
    }

    const out = {};
    if (WHICH === 'ref' || WHICH === 'both') out.ref = await run(REF_DIR, '원본');
    if (WHICH === 'clone' || WHICH === 'both') out.clone = await run(CLONE_DIR, '클론');

    if (out.ref && out.clone) {
        console.log('\n===== 대조 =====');
        const rp = out.ref.s.med / out.ref.W0 * 100, cp = out.clone.s.med / out.clone.W0 * 100;
        console.log(`모서리 인셋 중앙값 — 원본 ${out.ref.s.med}px (${rp.toFixed(2)}%W)  ↔  클론 ${out.clone.s.med}px (${cp.toFixed(2)}%W)`);
        console.log(`차이 ${(cp - rp).toFixed(2)}%p — 양수면 **클론이 더 둥글다**(화풍 ㉲ 위반 방향)`);
        console.log(`각진 비율 — 원본 ${out.ref.s.hardPct.toFixed(1)}%  ↔  클론 ${out.clone.s.hardPct.toFixed(1)}%`);
    }
    await browser.close();
})();
