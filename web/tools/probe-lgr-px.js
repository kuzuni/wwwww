// 리그 보상 팝업(shot-042208 / league-rewards) 비율 대조 — **원본 PNG 와 클론 캡처를 같은 픽셀 코드로** 잰다.
// (`probe-techov-px.js` 와 같은 방식. DOM rect 는 테두리 포함·그림자 제외라 원본의 '보이는 잉크'와
//  기준이 달라진다 — 채점 함정 ①('한쪽만 부속 포함')을 구조적으로 피한다.)
//
// 이 화면에서 색으로 확실히 잡히는 것 넷을 잰다:
//   ① 빨간 리본 — **좌우 제비꼬리(화살촉)까지 포함**해서 잰다. TODO 채점 함정 ① 이 바로 이
//      화면에서 나왔다(한쪽만 본체를 재 '8.9%p 좁다'는 헛 지적이 나왔다). 양쪽 다 포함이 원칙.
//   ② 흰 보상표 — 어두운 카드 위의 유일한 큰 흰 덩어리라 행별 최장 밝은 구간으로 잡힌다.
//   ③ 초록 '수집까지' 칩
//   ④ 하단 빨간 ✕ 원
// 카드(남색) 자체는 뒤 리그 화면도 남색이라 색으로 못 가른다 → 위 넷의 위치·폭으로 대신 본다.
//
// 사용: node probe-lgr-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const REF = path.resolve(__dirname, '../ref/screens/shot-042208.png');
const CLONE = path.resolve(__dirname, 'ref-cmp/clone/league-rewards.png');
const TOL = 2;

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
    const log = [];

    // ---- 앱 상자: 이 화면은 전체가 어두워 흰 행으로는 못 잡는다. 탭바가 앱 폭을 꽉 채우므로
    //      맨 아래쪽 행에서 '완전한 검정이 아닌' 구간을 앱 폭으로 본다. 폭이 이미지와 같으면 쏠림 없음.
    // ⚠️ 원본 PNG 는 **좌우 맨 끝 열에 앱이 아닌 밝은 띠**가 있다(x=501 이 35,38,66) — 그대로 두면
    //    카드 우끝이 99.80%W 라는 헛값이 나온다(실제 86.45%). 양쪽 3px 을 잘라 낸다.
    let ax0 = 3, ax1 = W - 4;
    log.push(`이미지 ${W}×${H} · 앱 중심 ${((ax0 + ax1) / 2).toFixed(1)} vs 이미지 중심 ${(W / 2).toFixed(1)}`);
    const AW = ax1 - ax0 + 1;
    const pw = v => +(v / AW * 100).toFixed(2);
    const ph = v => +(v / H * 100).toFixed(2);

    // 색 마스크의 바운딩 박스 (y 범위 제한 가능)
    const bbox = (test, y0, y1) => {
        let x0 = W, x1 = -1, yy0 = H, yy1 = -1, n = 0;
        for (let y = y0; y < y1; y++) for (let x = ax0; x <= ax1; x++) {
            if (!test(at(x, y))) continue;
            n++;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < yy0) yy0 = y; if (y > yy1) yy1 = y;
        }
        return x1 < 0 ? null : { x0, x1, y0: yy0, y1: yy1, n };
    };

    const R = {};
    // ---- ① 빨간 리본 (제비꼬리 포함) — 화면 위쪽 절반의 채도 높은 빨강 ----
    const isRed = p => p[0] > 150 && p[1] < 90 && p[2] < 90;
    const rib = bbox(isRed, Math.round(H * 0.06), Math.round(H * 0.28));
    if (rib) {
        R['리본 좌'] = pw(rib.x0 - ax0); R['리본 우'] = pw(rib.x1 - ax0); R['리본 폭'] = pw(rib.x1 - rib.x0 + 1);
        R['리본 상단'] = ph(rib.y0); R['리본 높이'] = ph(rib.y1 - rib.y0 + 1);
        log.push(`리본 x${rib.x0}~${rib.x1} y${rib.y0}~${rib.y1}`);
    }
    // ---- ①-b 카드 좌우 끝 — 리본 아래 '재화 pill' 행에서 배경→카드 남색 전이를 잡는다 ----
    // 카드와 뒤 리그 화면이 둘 다 남색이라 색 마스크로는 못 가르지만, **한 행에서 좌끝 색과
    // 28 이상 달라지는 첫/마지막 x** 로는 확실히 갈린다(원본 64/434, 클론 68/430 — 실측).
    if (rib) {
        const cy = Math.min(H - 2, rib.y1 + Math.round(H * 0.06));
        const edge = at(ax0, cy);
        const diff = x => { const q = at(x, cy); return Math.abs(q[0] - edge[0]) + Math.abs(q[1] - edge[1]) + Math.abs(q[2] - edge[2]) > 28; };
        let l = -1, r = -1;
        for (let x = ax0; x <= ax1; x++) if (diff(x)) { l = x; break; }
        for (let x = ax1; x >= ax0; x--) if (diff(x)) { r = x; break; }
        if (l >= 0 && r > l) {
            R['카드 좌'] = pw(l - ax0); R['카드 우'] = pw(r - ax0); R['카드 폭'] = pw(r - l + 1);
            log.push(`카드(y=${cy}) x${l}~${r}`);
        }
    }
    // ---- ② 흰 보상표 — 행마다 '가장 긴 밝은 연속 구간'을 구해 최빈 폭의 구간을 쓴다 ----
    const bright = (x, y) => lum(x, y) > 0.82;
    let tx0 = W, tx1 = -1, ty0 = -1, ty1 = -1;
    for (let y = Math.round(H * 0.3); y < Math.round(H * 0.95); y++) {
        let best = 0, bs = -1, s = -1;
        for (let x = ax0; x <= ax1 + 1; x++) {
            const b = x <= ax1 && bright(x, y);
            if (b && s < 0) s = x;
            if (!b && s >= 0) { if (x - s > best) { best = x - s; bs = s; } s = -1; }
        }
        if (best > AW * 0.4) { if (ty0 < 0) ty0 = y; ty1 = y; if (bs < tx0) tx0 = bs; if (bs + best - 1 > tx1) tx1 = bs + best - 1; }
    }
    if (ty1 > 0) {
        R['표 좌'] = pw(tx0 - ax0); R['표 폭'] = pw(tx1 - tx0 + 1);
        R['표 상단'] = ph(ty0); R['표 하단'] = ph(ty1); R['표 높이'] = ph(ty1 - ty0 + 1);
        log.push(`흰 표 x${tx0}~${tx1} y${ty0}~${ty1}`);
    }
    // ---- ③ 초록 '수집까지' 칩 ----
    // ⚠️ 단순 색 마스크 bbox 는 못 쓴다 — 위쪽 재화 pill 의 **초록 아이콘**이 같이 잡혀
    //    원본 칩 높이가 10.79%H(96px)라는 헛값이 나왔다(실제 칩은 그 1/3 이하).
    //    칩은 '가로로 긴 초록 덩어리'라는 게 구분점이므로 **행별 최장 초록 런이 8%W를 넘는 행**만 쓴다.
    const isGreen = p => p[1] > 110 && p[1] > p[0] + 30 && p[1] > p[2] + 30;
    const longestRun = (y, test) => {
        let best = 0, bs = -1, s = -1;
        for (let x = ax0; x <= ax1 + 1; x++) {
            const b = x <= ax1 && test(at(x, y));
            if (b && s < 0) s = x;
            if (!b && s >= 0) { if (x - s > best) { best = x - s; bs = s; } s = -1; }
        }
        return [best, bs];
    };
    let cx0 = W, cx1 = -1, cy0 = -1, cy1 = -1;
    for (let y = Math.round(H * 0.25); y < (ty0 > 0 ? ty0 : Math.round(H * 0.45)); y++) {
        const [len, s] = longestRun(y, isGreen);
        if (len > AW * 0.08) { if (cy0 < 0) cy0 = y; cy1 = y; if (s < cx0) cx0 = s; if (s + len - 1 > cx1) cx1 = s + len - 1; }
    }
    if (cy1 > 0) {
        R['칩 좌'] = pw(cx0 - ax0); R['칩 폭'] = pw(cx1 - cx0 + 1);
        R['칩 상단'] = ph(cy0); R['칩 높이'] = ph(cy1 - cy0 + 1);
        log.push(`초록 칩 x${cx0}~${cx1} y${cy0}~${cy1}`);
    }
    // ---- ④ 하단 빨간 ✕ 원 — 표 아래 구간의 빨강 ----
    // ⚠️ 클론은 **하단 네비의 빨간 ✕ 탭**이 같은 밴드에 있어 bbox 가 둘을 삼킨다(폭 83.17%W 라는
    //    헛값이 나왔다). 모달 ✕ 는 항상 화면 중앙이므로 가로를 25~75%W 로 제한한다.
    const midOnly = p => isRed(p);
    // 25~75% 로도 부족했다 — 클론 하단 밴드에 빨간 요소가 더 있어 ✕ 좌가 25.25%W 로 잡혔다.
    // 모달 ✕ 는 정중앙이므로 35~65% 로 좁힌다(원본 ✕ 44.62~54.78%W 는 여유롭게 들어온다).
    const xLo = ax0 + Math.round(AW * 0.35), xHi = ax0 + Math.round(AW * 0.65);
    const bboxX = (test, y0, y1) => {
        let x0 = W, x1 = -1, yy0 = H, yy1 = -1;
        for (let y = y0; y < y1; y++) for (let x = xLo; x <= xHi; x++) {
            if (!test(at(x, y))) continue;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < yy0) yy0 = y; if (y > yy1) yy1 = y;
        }
        return x1 < 0 ? null : { x0, x1, y0: yy0, y1: yy1 };
    };
    const xb = bboxX(midOnly, ty1 > 0 ? ty1 - Math.round(H * 0.02) : Math.round(H * 0.8), Math.round(H * 0.95));
    if (xb) {
        R['✕ 좌'] = pw(xb.x0 - ax0); R['✕ 폭'] = pw(xb.x1 - xb.x0 + 1);
        R['✕ 상단'] = ph(xb.y0); R['✕ 높이'] = ph(xb.y1 - xb.y0 + 1);
        R['✕ 중심x'] = pw((xb.x0 + xb.x1) / 2 - ax0);
        log.push(`✕ x${xb.x0}~${xb.x1} y${xb.y0}~${xb.y1}`);
    }
    return { size: [W, H], log, R };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.setContent('<body style="margin:0">');
    const run = async f => page.evaluate(MEASURE, ['data:image/png;base64,' + fs.readFileSync(f).toString('base64')]);
    const ref = await run(REF);
    const clone = await run(CLONE);
    for (const [label, o] of [['원본 shot-042208', ref], ['클론 league-rewards', clone]]) {
        console.log(`\n${label} ${o.size.join('×')}`);
        o.log.forEach(l => console.log('  ' + l));
    }
    console.log('\n요소'.padEnd(16) + '원본'.padStart(8) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    const ng = []; let worst = 0;
    for (const [k, v] of Object.entries(ref.R)) {
        const got = clone.R[k];
        if (got == null) { ng.push(`${k}: 클론 측정 불가`); console.log(k.padEnd(14) + v.toFixed(2).padStart(11) + '        —  (측정 불가)'); continue; }
        const d = +(got - v).toFixed(2);
        if (Math.abs(d) > Math.abs(worst)) worst = d;
        const ok = Math.abs(d) <= TOL;
        if (!ok) ng.push(`${k} ${d > 0 ? '+' : ''}${d}%p`);
        console.log(k.padEnd(14) + v.toFixed(2).padStart(11) + got.toFixed(2).padStart(9) + `${d > 0 ? '+' : ''}${d}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%p 초과`));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ':\n  ' + ng.join('\n  ') : ''}`);
    console.log(ng.length ? 'FAIL' : `PASS — 전 요소 ±${TOL}%p 이내`);
    await browser.close();
    process.exit(ng.length ? 1 : 0);
})();
