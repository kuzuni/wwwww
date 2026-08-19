// 리그 도전(상대 선택) 팝업 shot-042228 요소 실측 — '전 UI 비율 전수 검증 패스'(ui-ratio-audit)의
// 밴드 미실측 화면. **원본 PNG 와 클론 캡처를 같은 픽셀 코드로** 잰다(DOM rect 를 안 쓰는 이유는 아래 ⚠️).
//
// 📏 **자 = 흰 카드 폭(CW), 가로세로 모두 같은 단위**(probe-fl-head.js 와 같은 규약).
//    이 저장소에서 '원본 이미지 폭 ≠ 앱 폭'이 여러 번 나왔고(인계 메모 함정 ㉠), 이 컷도 원본 497 /
//    클론 499 로 다르다. 두 그림에 공통으로 있고 앞 세션이 이미 맞춰 둔 흰 카드를 자로 쓰면
//    앱 폭을 몰라도 성립하고, 세로도 같은 단위로 재서 등방으로 비교된다.
//
// ⚠️ DOM rect 로 재면 안 된다 — 팝업 등장 transform 이 걸린 프레임에서는 상자가 0.7배로 줄어 나온다
//    (이 저장소에서 반복해 나온 함정. probe-tn-dom·probe-fl-head 주석 참조).
//
// 🚨 이 화면에서 실제로 밟은 측정 함정 3가지:
//   ⑴ **흰 카드 좌우를 '조건을 만족하는 첫 행'에서 잡으면 안 된다** — 라운드 모서리에 걸려 두 그림이
//      서로 다른 곡률 지점을 재고, 카드 폭이 363 vs 371 처럼 어긋난다. → **전 행의 최대 흰 구간**을 쓴다.
//   ⑵ **아바타 타일의 검은 키라인을 행 앵커로 쓰면 안 된다** — 원본 아바타는 굵은 검정 테인데
//      클론은 얇은 회색 테라, 같은 임계값에서 원본만 5행이 잡히고 클론은 2덩어리로 깨진다.
//      (이 색 차이 자체는 아래 '게이트 밖 차이'로 인쇄한다.)
//   ⑶ **행을 세로 스캔할 x 를 카드 왼쪽 가까이 잡으면 안 된다** — 원본 행은 카드 안쪽 깊이까지 오지만
//      클론 행은 더 안쪽에서 시작해서, x=카드좌+12 에서는 클론이 통째로 흰색으로만 읽힌다.
//      → 행 회색이 실제로 잡히는 x 를 **카드 안쪽을 훑어 자동으로 고른다**.
// 자기검증: 두 그림 모두 흰 카드가 잡히고 **회색 행이 정확히 5개**이며 피치가 고르게 나오는지 본다.
//           하나라도 어긋나면 수치를 인쇄하지 않고 exit 2(측정기 고장).
//
// 사용: node tools/probe-lc-dom.js
// 종료코드 0=PASS(±2%p 초과 0건) / 1=비율 초과 / 2=측정기 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const REF = path.resolve(__dirname, '../ref/screens/shot-042228.png');
const CLONE = path.resolve(__dirname, 'ref-cmp/clone/league-challenge.png');
const TOL = 2.0;

const MEASURE = async ([src]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const W = c.width, H = c.height, D = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    // 🚨 문턱 238→215 (2026-08-19, probe-ccmp-px 와 같은 수리): ui-quality-up 팝업 카드 스킨의
    //    하단 그늘(rgba(0,0,0,.08~.14))이 카드 아래쪽 흰 바탕을 255→219까지 눌러, 238 문턱에서는
    //    카드 하부가 잘려 행 밴드가 5→2개로 나왔다. 행 회색(202)·행 간격 판정과는 안 겹친다(<215).
    // 🚨 무채색 문턱 12→22 (2026-08-19, 같은 스킨의 **두 번째** 재발): 밝기는 위에서 고쳤지만
    //    `|R−B| < 12` 가 남아 이번엔 **따뜻함**에 걸렸다. 지금 카드 바탕은 순백이 아니라 아래로 갈수록
    //    따뜻해지는 종이다 — 열 실측(클론 x73): y604 `246,243,236`(R−B 10) → y700 `244,240,233`(11)
    //    → y740 `230,226,219`(11), 그리고 y748 부터 배경 `23,24,26`. 12 문턱은 이 11 위에 아슬하게
    //    걸쳐 있어 종이 결 잡음에 따라 켜졌다 꺼졌다 하고, 그 결과 **카드 하단이 y746→625 로 잘려**
    //    5행 중 마지막 행이 통째로 사라졌다(`회색 행이 4개로 잡힘`). 레이아웃은 안 바뀌었다.
    //    22 로 두면 관측 최대 11 위로 여유가 두 배고, 행 회색(202,202,202 — R−B 0)·배경(23,24,26)
    //    어느 쪽과도 안 겹친다. 원본은 카드가 순백/배경이 근흑이라 이 문턱에 아예 반응하지 않는다
    //    (238→215→22 를 훑는 동안 원본 카드 63..433 · y119..739 로 불변 — 자가 낡았다는 증거).
    const white = p => p[0] > 215 && p[1] > 215 && p[2] > 215 && Math.abs(p[0] - p[2]) < 22;
    // 행 카드 회색 — 원본 rgb(202) · 클론 rgb(207) 실측. 무채색이고 흰색보다 확실히 어둡다.
    const rowGray = p => Math.abs(p[0] - p[1]) < 10 && Math.abs(p[1] - p[2]) < 10 && p[0] > 180 && p[0] < 225;
    const bad = m => ({ err: m });

    // ── 흰 카드 (함정 ⑴: 최대 흰 구간) ──────────────────────────────────────
    let cl = 0, cr = 0, ct = -1, cb = -1, bestAll = 0;
    for (let y = 0; y < H; y++) {
        let run = 0, best = 0, bs = 0, s = 0;
        for (let x = 0; x < W; x++) {
            if (white(at(x, y))) { if (run === 0) s = x; run++; if (run > best) { best = run; bs = s; } }
            else run = 0;
        }
        if (best > W * 0.55) { if (ct < 0) ct = y; cb = y; if (best > bestAll) { bestAll = best; cl = bs; cr = bs + best - 1; } }
    }
    if (ct < 0) return bad('흰 카드를 못 찾음');
    const CW = cr - cl + 1, CH = cb - ct + 1;
    const pc = v => +((v / CW) * 100).toFixed(2);   // 가로세로 공통 단위 = 카드 폭

    // ── 행 밴드 — **세로 한 줄로 훑으면 안 된다.** 행 카드는 모서리가 둥글어서, 두 그림에서
    //    회색이 처음 잡히는 x 가 다르면(원본 73 / 클론 86) 같은 행인데 높이가 74 vs 67 로 달라진다.
    //    → **행 전체 폭에 걸친 회색 화소 수**로 밴드를 잡는다. 모서리·아바타·버튼에 안 흔들린다.
    const grayN = [];
    for (let y = ct; y <= cb; y++) {
        let n = 0;
        for (let x = cl; x <= cr; x++) if (rowGray(at(x, y))) n++;
        grayN.push(n);
    }
    // ⚠️ '회색이 카드 폭의 40% 이상인 행'으로 잡으면 안 된다 — 행 한가운데는 아바타·이름·[도전] 버튼이
    //    회색을 많이 먹어 임계값 아래로 내려가고, 행 하나가 위/아래 두 토막이 된다(원본에서 9덩어리).
    //    **행 사이 간격은 회색이 거의 0** 이라 훨씬 뚜렷하다 → 간격을 찾고 그 사이를 행으로 본다.
    const bands = [];
    { let cur = null;
      for (let i = 0; i < grayN.length; i++) {
          const on = grayN[i] > CW * 0.05;
          if (on) { const y = ct + i; if (!cur) cur = { y0: y, y1: y }; else cur.y1 = y; }
          else if (cur) { if (cur.y1 - cur.y0 >= 30) bands.push(cur); cur = null; }
      }
      if (cur && cur.y1 - cur.y0 >= 30) bands.push(cur); }
    if (bands.length !== 5) return bad(`회색 행이 ${bands.length}개로 잡힘 (5개를 기대)`);

    // 행 좌우: 첫 행 중간 높이에서 회색 구간
    const yMid = Math.round((bands[0].y0 + bands[0].y1) / 2);
    let rl = -1, rr = -1;
    // ⚠️ '가장 긴 연속 구간'을 쓰면 안 된다 — 행 안의 흰 아바타 타일과 [도전] 버튼이 회색을 끊어
    //    371px 짜리 행이 169px(45%CW)로 읽힌다. 행 좌우 끝은 **회색 화소의 min/max x** 다.
    { let a = 1e9, b = -1, n = 0;
      for (let x = cl; x <= cr; x++) if (rowGray(at(x, yMid))) { n++; if (x < a) a = x; if (x > b) b = x; }
      if (n < 20 || b - a + 1 < CW * 0.5) return bad(`첫 행 가로 범위가 카드 폭의 절반 미만 (${b - a + 1}px, 회색 ${n}개)`);
      rl = a; rr = b; }

    // ── 티켓 알약: 제목/부제 아래, 첫 행 위의 어두운 가로 덩어리 ──────────────
    // ⚠️ 이 알약을 골라내는 게 이 화면에서 제일 까다로웠다. 실패한 방법 둘:
    //    ⓐ '어두운 화소가 많은 행' → 제목('상대 선택')·부제 글자까지 삼켜 높이가 29.65%CW(=110px)로 나온다.
    //    ⓑ '최장 연속 어두운 구간이 넓은 행' → **알약 속이 비어 있다**(파란 티켓 아이콘 + 흰 '0/5' 글자가
    //       끊는다). 70px 짜리 알약의 최장 연속 구간이 51px(13.7%CW)까지 떨어져 임계값을 못 넘는다.
    //    → 갈라내는 건 **밀도**다: 알약은 어두운 화소의 min~max 범위를 거의 꽉 채우고(≥0.6),
    //      글자는 같은 범위를 듬성듬성 채운다(≈0.4). 범위 폭도 12~35%CW 로 제한한다.
    const darkP = p => p[0] < 80 && p[1] < 80 && p[2] < 90;
    const darkRow = (y) => {
        let n = 0, a = 1e9, b = -1;
        for (let x = cl; x <= cr; x++) if (darkP(at(x, y))) { n++; if (x < a) a = x; if (x > b) b = x; }
        return b < 0 ? null : { a, b, n, span: b - a + 1, dens: n / (b - a + 1) };
    };
    // ⓒ 밀도 0.6 만으로도 안 갈린다 — 원본 제목('상대 선택')은 굵은 한글이라 같은 폭 대역에서
    //    밀도가 0.6 을 넘는다(그 판에서 알약 높이가 26.42%CW 로 나왔다. 실제 ≈7.7%CW).
    //    → **씨앗 + 확장**으로 잡는다: 먼저 밀도 0.9 이상인 행(알약의 둥근 위/아래 마구리)을 씨앗으로
    //      고르고, 거기서 위아래로 **x 범위가 씨앗과 겹치는 동안만** 넓힌다. 제목은 x 범위가 달라 안 붙는다.
    let seed = null, seedY = -1;
    for (let y = ct; y < bands[0].y0; y++) {
        const r = darkRow(y);
        if (!r || r.span < CW * 0.12 || r.span > CW * 0.35 || r.dens < 0.9) continue;
        if (!seed || r.dens > seed.dens) { seed = r; seedY = y; }
    }
    if (!seed) return bad('티켓 알약 씨앗(밀도 0.9 이상 어두운 막대)을 못 찾음');
    let pt = seedY, pb = seedY, pl = seed.a, pr = seed.b;
    const near = (r) => r && Math.abs(r.a - seed.a) < 10 && Math.abs(r.b - seed.b) < 10;
    for (let y = seedY - 1; y >= ct; y--) { const r = darkRow(y); if (!near(r)) break; pt = y; if (r.a < pl) pl = r.a; if (r.b > pr) pr = r.b; }
    for (let y = seedY + 1; y < bands[0].y0; y++) { const r = darkRow(y); if (!near(r)) break; pb = y; if (r.a < pl) pl = r.a; if (r.b > pr) pr = r.b; }

    // ── 자기검증 ────────────────────────────────────────────────────────────
    const pitches = bands.slice(1).map((b, i) => b.y0 - bands[i].y0);
    const spread = Math.max(...pitches) - Math.min(...pitches);
    if (spread > 4) return bad(`행 피치가 고르지 않음 ${JSON.stringify(pitches)}`);
    const hs = bands.map(b => b.y1 - b.y0 + 1);
    if (Math.max(...hs) - Math.min(...hs) > 4) return bad(`행 높이가 고르지 않음 ${JSON.stringify(hs)}`);

    // ── [도전] 버튼 (첫 행) ──────────────────────────────────────────────────
    // 🚨 **이걸 안 재고 있었던 탓에 진짜 결함이 '유령 지적'으로 기각된 적이 있다.** 기각 근거가
    //    "probe-lc-dom 10/10 통과"였는데 이 도구는 위 10지표(카드·행·티켓 알약)뿐이고 버튼은
    //    쳐다본 적도 없었다. 실제로는 원본 108px(21.73%W) vs 클론 56px(11.22%W)로 **폭이 절반**
    //    이었다(부모가 column flex 라 `flex: 0 0 26%` 가 폭이 아니라 높이에 걸려 있었다).
    //    **'프로브가 통과했다'는 그 프로브가 그 요소를 잴 때만 반증이 된다** — 그래서 여기 넣는다.
    // 버튼은 회색 행(#cacaca) 위에 얹힌 어두운 덩어리다. 행 오른쪽 45% 안에서 4-연결 최대 성분을
    // 쓴다(왼쪽 절반은 아바타 초상이라 더 큰 어두운 덩어리가 있다). 별 배지(+N)는 버튼 위에 떨어져
    // 있어 성분이 안 붙는다 — 원본·클론 모두에서 확인했다.
    const btnInk = (x, y) => { const p = at(x, y); return Math.max(...p) < 120; };
    const bx0 = Math.round(rl + (rr - rl) * 0.55), bx1 = rr, by0 = bands[0].y0, by1 = bands[0].y1;
    let btn = null;
    { const lab = new Int32Array((bx1 - bx0 + 1) * (by1 - by0 + 1)).fill(-1);
      const idx = (x, y) => (y - by0) * (bx1 - bx0 + 1) + (x - bx0);
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
          if (lab[idx(x, y)] !== -1 || !btnInk(x, y)) continue;
          const st = [[x, y]]; lab[idx(x, y)] = 1;
          let n = 0, ax = W, bxx = -1, ay = H, byy = -1;
          while (st.length) {
              const [px, py] = st.pop(); n++;
              if (px < ax) ax = px; if (px > bxx) bxx = px; if (py < ay) ay = py; if (py > byy) byy = py;
              for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                  const nx = px + dx, ny = py + dy;
                  if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1) continue;
                  if (lab[idx(nx, ny)] === -1 && btnInk(nx, ny)) { lab[idx(nx, ny)] = 1; st.push([nx, ny]); }
              }
          }
          if (!btn || n > btn.n) btn = { n, l: ax, r: bxx + 1, t: ay, b: byy + 1 };
      } }
    if (!btn || btn.r - btn.l < CW * 0.05) return bad(`[도전] 버튼을 못 잡음 (행1 ${by0}..${by1} · x${bx0}~${bx1}${btn ? ` · 최대 성분 w${btn.r - btn.l}` : ''})`);

    return {
        size: [W, H],
        card: { l: cl, t: ct, r: cr, b: cb, w: CW, h: CH },
        rows: bands.map(b => `${b.y0}..${b.y1}`),
        m: {
            '카드 높이': pc(CH),
            '도전 버튼 폭': pc(btn.r - btn.l),
            '도전 버튼 좌': pc(btn.l - cl),
            '행 좌 인셋': pc(rl - cl),
            '행 폭': pc(rr - rl + 1),
            '행 높이': pc(hs[0]),
            '행 피치': pc(pitches[0]),
            '첫 행 상단': pc(bands[0].y0 - ct),
            '끝 행 하단': pc(bands[4].y1 - ct),
            '티켓 알약 상단': pc(pt - ct),
            '티켓 알약 높이': pc(pb - pt + 1),
            '티켓 알약 폭': pc(pr - pl + 1),
        },
    };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.goto('about:blank');
    const read = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const ref = await page.evaluate(MEASURE, [read(REF)]);
    const clone = await page.evaluate(MEASURE, [read(CLONE)]);
    await browser.close();

    for (const [k, o] of [['REF', ref], ['CLONE', clone]]) {
        if (o.err) { console.log(`측정기 고장 (${k}): ${o.err}`); process.exit(2); }
        console.log(`${k.padEnd(5)} ${o.size.join('x')} · 카드 ${o.card.w}x${o.card.h} @(${o.card.l},${o.card.t}) · 행 ${o.rows.join(' ')}`);
    }
    console.log('\n단위 = 흰 카드 폭 대비 % (가로세로 공통)');
    console.log('요소                 원본     클론      Δ%p   판정(게이트 ±2%p)');
    let fail = 0;
    for (const k of Object.keys(ref.m)) {
        const a = ref.m[k], b = clone.m[k], d = +(b - a).toFixed(2), ok = Math.abs(d) <= TOL;
        if (!ok) fail++;
        console.log(`${k.padEnd(20)} ${a.toFixed(2).padStart(7)} ${b.toFixed(2).padStart(8)} ${(d > 0 ? '+' : '') + d.toFixed(2)}   ${ok ? 'PASS' : 'FAIL'}`);
    }
    // 게이트 밖이지만 매번 인쇄한다 — 통과에 묻혀 사라지면 '전부 같다'로 읽힌다.
    console.log('\n※ 비율 게이트 밖 차이: 원본 아바타 타일은 굵은 검정 키라인인데 클론은 얇은 회색 테다(아이콘/스킨 소관).');
    console.log(fail === 0 ? '\nPASS — 초과 0건' : `\nFAIL — 초과 ${fail}건`);
    process.exit(fail === 0 ? 0 : 1);
})();
