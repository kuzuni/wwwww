// 리그 문장(엠블럼)의 **잉크 상자** 비율 대조 — 원본 PNG 와 클론 캡처를 같은 픽셀 코드로 잰다.
// (`probe-lgr-px.js`·`probe-techov-px.js` 와 같은 방식. DOM rect 는 테두리 포함·그림자 제외라 원본의
//  '보이는 잉크'와 기준이 달라진다 — 채점 함정 ①('한쪽만 부속 포함')을 구조적으로 피한다.)
//
// 📌 **짝 도구와 역할이 다르다 — 겹치지 말 것.**
//   · `probe-league-header.js` = 문장/제목/시즌바/목록/밴드/버튼의 **DOM 상자** 배치(그쪽이 본 판정).
//   · 이 도구 = 문장 **캔버스에 실제로 칠해진 잉크**의 상자. 상자가 맞아도 그림이 상자를 덜 채우면
//     화면에서는 작아 보인다 — `.ico` 상자는 102x102 인데 잉크는 102x71 인 게 바로 그 경우다.
//   제목·시즌바·목록 치수는 여기서 재지 않는다: 원본 랭킹 행은 속이 시트 배경과 같은 색이라
//   잉크 프로파일에서 행 상단이 두 토막으로 잡히고(그쪽 메모 참조), 잉크 기준으로는 경계가 안 선다.
//
// 🚨 이 화면에서 실제로 밟은 측정 함정 3가지. 자기검증으로 전부 exit 2 에 걸리게 해 뒀다:
//   ⑴ **원본에는 폰 상태바가 있고 클론에는 없다.** 원본 shot-042149 의 y0..9 는 배경이 rgb(40,40,72)
//      인 상태바다. 이걸 안 빼면 '문장 잉크 상자'가 화면 전폭(100%AW)으로 잡혀 −85%p 짜리 거짓
//      FAIL 이 나온다(첫 판에서 실제로 나왔다). → 앱 상단은 **시트 배경색이 연속으로 나오는 첫 행**.
//   ⑵ **원본 우측 끝 2열(x496..497)이 앱 밖 여백**이다. 앱 좌우 끝은 하단 회색 발판으로 잡는다.
//   ⑶ **덩어리 사이의 빈 행 개수가 두 이미지에서 다르다** — '빈 행 N줄'로 요소를 가르면 재는 대상이
//      어긋난다. 원본은 제목과 시즌 바가 빈 행 1줄로 붙어 한 덩어리가 되는데 클론은 16줄 떨어져
//      둘로 갈렸고, 머리 블록을 원본대로 조인 뒤엔 이번엔 시즌 바와 목록이 5줄로 붙었다.
//      → 문장만 잰다. **문장 아래에는 두 이미지 모두 빈 줄이 있다**(유일하게 안정적인 경계).
// 자기검증: 문장이 잡히고, 좌우 대칭(중심 ±3%AW)이고, 가로가 세로보다 길고(원본 102x71),
//           문장 아래에 제목 잉크가 따로 있는지 본다. 어긋나면 수치를 인쇄하지 않고 exit 2.
//
// 사용: node probe-league-emblem.js
// 종료코드 0=PASS(±2%p 초과 0건) / 1=비율 초과 / 2=측정기 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const REF = path.resolve(__dirname, '../ref/screens/shot-042149.png');
const CLONE = path.resolve(__dirname, 'ref-cmp/clone/league.png');

const MEASURE = async ([src]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const W = c.width, H = c.height, D = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    const lum = (x, y) => { const p = at(x, y); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; };
    const dist = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
    const bad = m => ({ err: m });

    // ── ⑵ 앱 좌우 끝: 화면 아래쪽에서 **전폭을 채우는 최장 균일색 가로 구간** ────────────
    // 🚨 **색으로 찾지 말 것** (2026-08-19 `league-footer-band-dark` 로 규명). 종전 규칙은
    //    '밝은 회색(무채색 130~215)' 이었는데, 클론의 발판 띠(`.league-foot`)는 **의도적으로
    //    다크로 전환**돼 있다 — `css/style.css` 의 `.league-foot` 주석에 근거가 적혀 있다:
    //    "원본 실측 #afafaf 회색 밴드가 다크 리스트(#0e111b)와 단절 — 4라운드 연속 교집합
    //    결함이라 인계 결정(사용자 지시>원본 톤)대로 다크 전환한다"(`#1a1f2b`). 즉 **띠가
    //    어두운 건 회귀가 아니라 확정된 스킨**이라 되돌릴 수 없고, 그 색에 기대던 이 자가
    //    통째로 `측정기 고장 (CLONE)` 으로 죽어 문장 잉크 감사가 **아예 안 돌고 있었다.**
    // → 잰다는 건 '띠가 무슨 색인가'가 아니라 '앱이 좌우 어디서 끝나는가'다. 그래서 색 조건을
    //    버리고 **아래쪽 대역에서 한 색으로 이어지는 가장 긴 가로 구간**을 쓴다(띠든 시트
    //    배경이든 앱을 가로로 꽉 채우는 면이면 된다). 원본의 '앱 밖 여백'(우측 x496..497)은
    //    앱 안과 색이 달라 구간에서 저절로 떨어져 나간다 — 함정 ⑵ 가 막으려던 그 자리다.
    //    실측: 원본 x0..495(AW 496 · 폭 498 중 우측 2열이 앱 밖) · 클론 x0..498(AW 499, 여백 없음).
    // ⚠️ 첫 행이 아니라 **최댓값**을 고른다 — 첫 행으로 끊으면 띠 위에 얹힌 요소(핀 행·버튼)가
    //    걸친 행을 잡아 앱보다 좁게 잰다.
    let appL = -1, appR = -1, appRowY = -1, bestAll = 0;
    for (let y = Math.round(H * 0.70); y < Math.round(H * 0.95); y++) {
        let best = 0, bs = 0, run = 1, s = 0, ref = at(0, y);
        for (let x = 1; x < W; x++) {
            const p = at(x, y);
            const near = Math.abs(p[0] - ref[0]) <= 6 && Math.abs(p[1] - ref[1]) <= 6 && Math.abs(p[2] - ref[2]) <= 6;
            if (near) run++;
            else { if (run > best) { best = run; bs = s; } run = 1; s = x; ref = p; }
        }
        if (run > best) { best = run; bs = s; }
        if (best > bestAll) { bestAll = best; appL = bs; appR = bs + best - 1; appRowY = y; }
    }
    if (appL < 0 || bestAll <= W * 0.9) return bad(`앱 좌우 끝을 못 찾음(최장 균일 구간 ${bestAll}/${W}px)`);
    const AW = appR - appL + 1;

    // ── ⑴ 앱 상단: 시트 배경색이 8행 연속으로 전폭을 채우는 첫 행 ────────────────────
    const rowMode = y => {
        const hist = new Map();
        for (let x = appL; x <= appR; x++) { const p = at(x, y), k = p.map(v => v >> 4).join(','); hist.set(k, (hist.get(k) || 0) + 1); }
        let bk = null, bn = -1;
        for (const [k, n] of hist) if (n > bn) { bn = n; bk = k; }
        return { c: bk.split(',').map(v => (+v << 4) + 8), n: bn };
    };
    const sheetBg = rowMode(Math.round(H * 0.10)).c;   // 문장 좌우는 확실히 시트 배경이다
    let appT = -1;
    for (let y = 0; y < Math.round(H * 0.06); y++) {
        let ok = true;
        for (let k = 0; k < 8; k++) { const m = rowMode(y + k); if (dist(m.c, sheetBg) > 40 || m.n < AW * 0.9) { ok = false; break; } }
        if (ok) { appT = y; break; }
    }
    if (appT < 0) return bad('앱 상단(시트 배경 시작 행)을 못 찾음');
    const AH = H - appT;
    const pctW = v => +((v / AW) * 100).toFixed(2);
    const pctH = v => +((v / AH) * 100).toFixed(2);

    const TOL = 40;
    const rowInk = y => {
        let minX = 1e9, maxX = -1, n = 0;
        for (let x = appL; x <= appR; x++) {
            if (dist(at(x, y), sheetBg) < TOL) continue;
            n++; if (x < minX) minX = x; if (x > maxX) maxX = x;
        }
        return { n, minX, maxX };
    };
    // 문장 = 앱 상단의 첫 잉크부터 잉크가 끊긴 첫 행까지 (위 함정 ⑶ 참조)
    let ey0 = -1, ey1 = -1, eMinX = 1e9, eMaxX = -1;
    for (let y = appT; y < appT + Math.round(AH * 0.30); y++) {
        const r = rowInk(y);
        if (r.n > 0) {
            if (ey0 < 0) ey0 = y;
            ey1 = y; if (r.minX < eMinX) eMinX = r.minX; if (r.maxX > eMaxX) eMaxX = r.maxX;
        } else if (ey0 >= 0) break;
    }
    if (ey0 < 0) return bad('문장 잉크를 못 찾음');
    const emblem = {
        px: `x${eMinX}..${eMaxX} y${ey0}..${ey1} (${eMaxX - eMinX + 1}x${ey1 - ey0 + 1})`,
        x: pctW(eMinX - appL), w: pctW(eMaxX - eMinX + 1),
        y: pctH(ey0 - appT), h: pctH(ey1 - ey0 + 1),
        cx: pctW((eMinX + eMaxX) / 2 - appL),
    };
    // ── 자기검증 ────────────────────────────────────────────────────────────
    if (Math.abs(emblem.cx - 50) > 3) return bad(`문장이 좌우 대칭이 아님 (중심 ${emblem.cx}%AW)`);
    if (emblem.h < 3 || emblem.w < 8) return bad(`문장 상자가 비정상적으로 작음 ${emblem.px}`);
    if (emblem.w / emblem.h < 1.0) return bad(`문장이 세로로 길다 (${emblem.px}) — 원본은 가로로 넓다(102x71)`);
    // 문장 아래에 제목 잉크가 오는지만 확인한다(제목·시즌바·목록 치수는 probe-league-header.js 담당)
    let below = 0;
    for (let y = ey1 + 2; y < appT + Math.round(AH * 0.30); y++) if (rowInk(y).n > 0) { below = y; break; }
    if (!below) return bad('문장 아래에 제목 잉크가 없음 — 문장이 제목까지 삼켰을 수 있다');

    // `appRow` = 좌우 끝을 잡은 행(과 그 색). 자를 다시 의심할 때 **어디를 보고 앱 폭을 정했는지**가
    // 로그에 남아 있어야 한다 — 종전엔 '회색 발판' 이라는 전제가 코드에만 있고 출력엔 없어서, 띠 색이
    // 바뀌자 `측정기 고장` 한 줄만 남고 원인을 매번 다시 캐야 했다.
    return {
        size: [W, H], app: { l: appL, r: appR, t: appT, w: AW, h: AH },
        appRow: { y: appRowY, run: bestAll, c: at(appL + Math.floor(AW / 2), appRowY).join(',') },
        sheetBg: sheetBg.join(','), emblem,
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
        console.log(k.padEnd(5), JSON.stringify(o));
    }
    const ROWS = [
        ['문장 폭 %AW', o => o.emblem.w],
        ['문장 높이 %H', o => o.emblem.h],
        ['문장 상단 %H', o => o.emblem.y],
        ['문장 하단 %H', o => +(o.emblem.y + o.emblem.h).toFixed(2)],
        ['문장 중심 %AW', o => o.emblem.cx],
    ];
    let fail = 0;
    console.log('\n요소                 원본     클론      Δ%p   판정(게이트 ±2%p)');
    for (const [name, f] of ROWS) {
        const a = f(ref), b = f(clone), d = +(b - a).toFixed(2), ok = Math.abs(d) <= 2;
        if (!ok) fail++;
        console.log(`${name.padEnd(20)} ${a.toFixed(2).padStart(7)} ${b.toFixed(2).padStart(8)} ${(d > 0 ? '+' : '') + d.toFixed(2)}   ${ok ? 'PASS' : 'FAIL'}`);
    }
    console.log(fail === 0 ? '\nPASS — 초과 0건' : `\nFAIL — 초과 ${fail}건`);
    process.exit(fail === 0 ? 0 : 1);
})();
