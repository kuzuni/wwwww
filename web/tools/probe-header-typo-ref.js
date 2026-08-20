// probe-header-typo-ref.js — 원본 30장 / 클론 31장에서 **글자 획의 굵기**를 census 한다.
//
// 왜: 화풍 ⓕ-㉴("헤더 타이포 = 블록/픽셀 폰트 악센트 가능, 본문 가독은 유지")는 `aaa-skin`
//     메모가 세 번 연속 "다음 축 후보"로 지목했는데 **아직 아무도 재지 않았다**(ⓖ·ⓗ·ⓙ 메모).
//     코드 census 로는 이미 답이 나와 있다 — `css/style.css` 의 font-family 는 **한 벌뿐**이고
//     (@font-face 0개), 제목 규칙 15개가 전부 `font-weight:900` + 크기만 다르다. 즉 헤더와 본문이
//     **같은 활자를 굵기만 바꿔 쓴다**. 그런데 그게 원본 대비 얇은지 두꺼운지는 아무 근거가 없었다.
//
// 무엇을 재는가 — **밝은 바탕 위 어두운 글자**의 (획 굵기 ÷ 글자 높이).
//   ⑴ 4-연결 성분을 잡아 ⑵ 크기·채움비로 글자만 남기고 ⑶ 성분마다
//   **획 굵기 = 잉크 화소별 min(가로런, 세로런) 의 중앙값** ⑷ 글자 높이 = 성분 높이.
//   ⑸ 성분을 y 로 묶어 '글자줄'을 만들고, 줄의 글자 높이 상위 10% = **헤더 줄**로 본다.
//   획/높이 비가 클수록 '블록·청키한 활자'다. 폰트가 같아도 weight·text-stroke 를 올리면 올라간다.
//
// ⚠️ 함정 대비(이 저장소가 반복해 밟은 것들):
//   ⓐ **아이콘·색 타일을 글자로 세면 안 된다** — 채움비(잉크÷bbox) 0.15~0.85 · 크기 상한
//      (높이 ≤8%H, 폭 ≤8%W) · **bbox 둘레 2px 가 밝아야 함**(밝은 바탕 위 글자) 세 조건이 막는다.
//   ⓑ **가로획을 가로로 재면 굵기가 아니라 길이가 나온다** — min(가로런,세로런) 이 그래서 필요하다.
//   ⓒ 원본 488~499px / 클론 499px 로 폭이 다르다 — 크기 문턱은 %W·%H 로 잡는다.
//   ⓓ 게임 페이지 안에서는 `new Function` 이 막힌다 — 픽셀 계측은 **빈 페이지**에서 돈다.
//   ⓔ **자가 진단이 있다**(probe-tabbar·probe-techoverview-dom 규약). 글자 아닌 것을 세고 있으면
//      수치를 인쇄하지 않고 **exit 2(측정기 고장)** 로 끊는다 — 거짓 FAIL 을 좇지 않게.
//
// 사용: node tools/probe-header-typo-ref.js            (원본 + 클론 대조표)
//       node tools/probe-header-typo-ref.js ref|clone  (한쪽만)
//       node tools/probe-header-typo-ref.js both files (화면별 헤더 줄까지)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const REF_DIR = path.resolve(__dirname, '../ref/screens');
const CLONE_DIR = path.resolve(__dirname, 'ref-cmp/clone');
const WHICH = (process.argv[2] || 'both').toLowerCase();
const FILES = process.argv.includes('files');

const SRC = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const L = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return -1;
        const k = (y * W + x) * 4;
        return Math.max(d[k], d[k+1], d[k+2]);
    };

    const INK = 90;                               // 잉크 상한(안티에일리어싱 반톤까지 포함)
    const PAPER = 150;                            // bbox 둘레가 이보다 밝아야 '밝은 바탕 위 글자'
    const MAXH = Math.max(6, Math.round(H * 0.08));
    const MAXW = Math.max(6, Math.round(W * 0.08));

    // ── 잉크 마스크 + 런 길이 테이블(획 굵기용) ───────────────────────────────
    const ink = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (L(x, y) <= INK) ink[y * W + x] = 1;
    const hrun = new Uint16Array(W * H), vrun = new Uint16Array(W * H);
    for (let y = 0; y < H; y++) {
        let x = 0;
        while (x < W) {
            if (!ink[y * W + x]) { x++; continue; }
            let x1 = x; while (x1 < W && ink[y * W + x1]) x1++;
            for (let s = x; s < x1; s++) hrun[y * W + s] = x1 - x;
            x = x1;
        }
    }
    for (let x = 0; x < W; x++) {
        let y = 0;
        while (y < H) {
            if (!ink[y * W + x]) { y++; continue; }
            let y1 = y; while (y1 < H && ink[y1 * W + x]) y1++;
            for (let s = y; s < y1; s++) vrun[s * W + x] = y1 - y;
            y = y1;
        }
    }

    // ── 4-연결 성분 ───────────────────────────────────────────────────────────
    const seen = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    const glyphs = [];
    for (let y0 = 1; y0 < H - 1; y0++) for (let x0 = 1; x0 < W - 1; x0++) {
        const p0 = y0 * W + x0;
        if (!ink[p0] || seen[p0]) continue;
        let sp = 0; stack[sp++] = p0; seen[p0] = 1;
        let minx = x0, maxx = x0, miny = y0, maxy = y0, n = 0, edge = false;
        const px = [];
        while (sp > 0) {
            const p = stack[--sp];
            const x = p % W, y = (p / W) | 0;
            n++; px.push(p);
            if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
            if (x < minx) minx = x; if (x > maxx) maxx = x;
            if (y < miny) miny = y; if (y > maxy) maxy = y;
            if (n > 40000) break;                                  // 폭주 방지(패널 같은 큰 면)
            if (x > 0     && ink[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
            if (x < W - 1 && ink[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
            if (y > 0     && ink[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
            if (y < H - 1 && ink[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
        }
        const w = maxx - minx + 1, h = maxy - miny + 1;
        if (edge) continue;
        if (h < 6 || h > MAXH || w < 2 || w > MAXW) continue;       // ⓐ 크기
        const fill = n / (w * h);
        if (fill < 0.15 || fill > 0.85) continue;                   // ⓐ 채움비 — 솔리드 타일 제거
        // ⓐ bbox 둘레 2px 가 밝아야 밝은 바탕 위 글자다
        let halo = [], dark = 0;
        for (let x = minx - 2; x <= maxx + 2; x++) { halo.push(L(x, miny - 2), L(x, maxy + 2)); }
        for (let y = miny - 2; y <= maxy + 2; y++) { halo.push(L(minx - 2, y), L(maxx + 2, y)); }
        halo = halo.filter(v => v >= 0);
        if (!halo.length) continue;
        for (const v of halo) if (v < PAPER) dark++;
        if (dark / halo.length > 0.5) continue;                     // 절반 넘게 어두우면 어두운 판 위 — 제외
        // ⓑ 획 굵기 = min(가로런, 세로런) 의 중앙값
        const sw = [];
        for (const p of px) { const a1 = hrun[p], b1 = vrun[p]; sw.push(a1 < b1 ? a1 : b1); }
        sw.sort((a1, b1) => a1 - b1);
        const st = sw[sw.length >> 1];
        // 🚨 **성분 단위로 '활자가 아닌 것'을 여기서 끊는다**(1차 판이 놓쳤다 — 화면별 출력에
        //    '44px 획30'(솔리드 덩어리) · '37px 획1'(가는 원 테두리) 같은 줄이 섞여 들어와
        //    큰 글자 구간의 중앙값을 통째로 흔들었다). 활자의 획/높이는 어떤 굵기 폰트라도
        //    0.06~0.40 안이다: 0.4 를 넘으면 덩어리, 0.06 미만이면 테두리 선이다.
        if (st / h < 0.06 || st / h > 0.40) continue;
        glyphs.push({ x: minx, y: miny, w, h, stroke: st, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2 });
    }

    // ── 성분 → 글자줄(세로 겹침 ≥50% + 가로 간격 ≤ 3×높이) ─────────────────────
    glyphs.sort((p, q) => p.cy - q.cy || p.x - q.x);
    const used = new Uint8Array(glyphs.length);
    const lines = [];
    for (let i = 0; i < glyphs.length; i++) {
        if (used[i]) continue;
        const grp = [glyphs[i]]; used[i] = 1;
        for (let j = i + 1; j < glyphs.length; j++) {
            if (used[j]) continue;
            const gj = glyphs[j];
            if (gj.cy - grp[0].cy > grp[0].h * 1.2) break;
            const last = grp[grp.length - 1];
            const ov = Math.min(last.y + last.h, gj.y + gj.h) - Math.max(last.y, gj.y);
            if (ov < Math.min(last.h, gj.h) * 0.5) continue;
            if (gj.x - (last.x + last.w) > last.h * 3) continue;
            grp.push(gj); used[j] = 1;
        }
        if (grp.length < 2) continue;                               // 홑 성분은 글자줄로 안 본다
        const hs = grp.map(p => p.h).sort((a1, b1) => a1 - b1);
        const ss = grp.map(p => p.stroke).sort((a1, b1) => a1 - b1);
        const gaps = [];
        for (let k = 1; k < grp.length; k++) gaps.push(grp[k].x - (grp[k-1].x + grp[k-1].w));
        gaps.sort((a1, b1) => a1 - b1);
        const gh = hs[hs.length >> 1], st = ss[ss.length >> 1];
        // 줄 안에서 획이 제각각이면(최대가 중앙값의 2.5배 넘음) 활자 줄이 아니라 잡동사니다.
        if (ss[ss.length - 1] > st * 2.5) continue;
        lines.push({
            n: grp.length, gh, stroke: st,
            ratio: +(st / gh).toFixed(3),
            gap: gaps.length ? gaps[gaps.length >> 1] : 0,
            yPct: +(grp[0].cy / H * 100).toFixed(1),
            ghPct: +(gh / H * 100).toFixed(2),
        });
    }
    return { W, H, nGlyph: glyphs.length, lines };
})`;

const med = (v) => v.length ? v.slice().sort((a, b) => a - b)[v.length >> 1] : 0;

// 🚨 **헤더 문턱은 백분위가 아니라 고정 %H 다.** 1차 판은 '글자 높이 상위 10%'로 잘랐는데,
//    원본은 21px·클론은 16px 에서 잘려 **두 코퍼스가 서로 다른 인구를 비교**했다(클론 쪽에만
//    16~21px 중간 글자가 섞여 들어와 획/높이를 끌어내린다 — 거짓 격차 0.015 가 그렇게 나왔다).
//    같은 자로 재려면 문턱이 코퍼스와 무관해야 한다. 원본 488~499px / 클론 499px 로 폭은
//    다르지만 세로는 890~900 으로 거의 같아 %H 문턱이 곧 px 문턱이다.
const HEAD_PCT = 2.2;                                               // 글자 높이 ≥2.2%H(≈20px) = 헤더

function summarize(all, label) {
    const lines = all.flatMap(f => f.lines);
    if (!lines.length) return null;
    const cut = HEAD_PCT;
    const head = lines.filter(l => l.ghPct >= cut);
    const body = lines.filter(l => l.ghPct < cut);
    const R = (v) => +med(v).toFixed(3);
    const out = {
        n: lines.length, nGlyph: all.reduce((s, f) => s + f.nGlyph, 0),
        cut,
        headN: head.length, headGh: med(head.map(l => l.gh)), headStroke: med(head.map(l => l.stroke)),
        headRatio: R(head.map(l => l.ratio)), headGap: med(head.map(l => l.gap)),
        headGhPct: +med(head.map(l => l.ghPct)).toFixed(2),
        bodyGh: med(body.map(l => l.gh)), bodyRatio: R(body.map(l => l.ratio)),
        buckets: bucketize(lines),
    };
    console.log(`${label}: 글자줄 ${out.n}개 (성분 ${out.nGlyph}개) · 헤더 문턱 ${cut}%H`);
    console.log(`  헤더줄 ${out.headN}개 — 글자높이 ${out.headGh}px(${out.headGhPct}%H) · 획 ${out.headStroke}px · **획/높이 ${out.headRatio}**`);
    console.log(`  본문줄 ${out.n - out.headN}개 — 글자높이 ${out.bodyGh}px · 획/높이 ${out.bodyRatio}`);
    console.log('  ── 글자높이 구간별 획/높이(=키 맞춰 비교): ' + out.buckets.map(b => `${b.lo}~${b.hi}px ${b.ratio}(${b.n})`).join(' · '));
    return out;
}

// 키를 맞춰 비교한다 — 글자가 클수록 획/높이는 원래 내려간다(광학 사이즈 없는 폰트의 성질).
// 구간을 나누지 않고 중앙값만 보면 **두 코퍼스의 글자 크기 분포 차이가 굵기 차이로 둔갑**한다.
const BUCKETS = [[8, 11], [12, 15], [16, 19], [20, 23], [24, 27], [28, 99]];
function bucketize(lines) {
    return BUCKETS.map(([lo, hi]) => {
        const v = lines.filter(l => l.gh >= lo && l.gh <= hi);
        return { lo, hi, n: v.length, ratio: +med(v.map(l => l.ratio)).toFixed(3) };
    }).filter(b => b.n >= 8);
}

// ⓔ 자가 진단 — 글자가 아닌 것을 세고 있으면 수치를 인쇄하지 말고 끊는다.
function selfCheck(o, label) {
    const bad = [];
    if (!o || o.n < 150) bad.push(`글자줄 ${o ? o.n : 0}개(<150) — 글자를 못 잡고 있다`);
    if (o && (o.headRatio < 0.06 || o.headRatio > 0.45)) bad.push(`헤더 획/높이 ${o.headRatio}(정상 0.06~0.45 밖) — 글자가 아닌 것을 재는 중`);
    if (o && (o.headGh < 8 || o.headGh > 60)) bad.push(`헤더 글자높이 ${o.headGh}px(정상 8~60 밖)`);
    if (bad.length) { console.error(`\n🚨 측정기 고장(${label}): ` + bad.join(' · ')); return false; }
    return true;
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
            all.push({ file: f.replace(/\.png$/, ''), lines: r.lines, nGlyph: r.nGlyph });
        }
        console.log(`\n===== ${label} (${files.length}장) =====`);
        const s = summarize(all, '글자 획');
        if (FILES && s) {
            console.log('  ── 화면별 헤더줄(글자높이 상위, 위에서부터 3줄)');
            for (const f of all) {
                const h = f.lines.filter(l => l.ghPct >= s.cut).sort((a, b) => b.gh - a.gh).slice(0, 3);
                if (!h.length) continue;
                console.log(`    ${f.file}: ` + h.map(l => `[y${l.yPct}%H ${l.gh}px 획${l.stroke} 비${l.ratio}]`).join(' '));
            }
        }
        return s;
    }

    const out = {};
    let ok = true;
    if (WHICH === 'ref' || WHICH === 'both') { out.ref = await run(REF_DIR, '원본'); ok = selfCheck(out.ref, '원본') && ok; }
    if (WHICH === 'clone' || WHICH === 'both') { out.clone = await run(CLONE_DIR, '클론'); ok = selfCheck(out.clone, '클론') && ok; }

    if (out.ref && out.clone && ok) {
        console.log('\n===== 대조 =====');
        console.log(`헤더 글자높이 — 원본 ${out.ref.headGhPct}%H  ↔  클론 ${out.clone.headGhPct}%H   (Δ ${(out.clone.headGhPct - out.ref.headGhPct).toFixed(2)}%p)`);
        console.log(`헤더 획/높이  — 원본 ${out.ref.headRatio}  ↔  클론 ${out.clone.headRatio}   (음수 = 클론이 얇다: ${(out.clone.headRatio - out.ref.headRatio).toFixed(3)})`);
        console.log(`본문 획/높이  — 원본 ${out.ref.bodyRatio}  ↔  클론 ${out.clone.bodyRatio}`);
        console.log('구간별(키 맞춘) 획/높이 — 원본 ↔ 클론');
        for (const b of out.ref.buckets) {
            const c = out.clone.buckets.find(q => q.lo === b.lo);
            if (!c) continue;
            const d = c.ratio - b.ratio;
            console.log(`  ${String(b.lo).padStart(2)}~${b.hi}px : ${b.ratio}(${b.n})  ↔  ${c.ratio}(${c.n})   Δ ${d >= 0 ? '+' : ''}${d.toFixed(3)}${Math.abs(d) >= 0.012 ? (d < 0 ? '  ← 클론이 얇다' : '  ← 클론이 두껍다') : ''}`);
        }
    }
    await browser.close();
    process.exit(ok ? 0 : 2);
})();
