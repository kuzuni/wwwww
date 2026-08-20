// 기술 트리 개요(shot-042407 / tech-overview) 비율 대조 — **원본 PNG 와 클론 캡처를 같은 픽셀 코드로** 잰다.
//
// 왜 DOM 실측이 아니라 양쪽 다 픽셀인가 — 이 화면의 판정 요소가 **테두리·그림자를 가진 상자**라
// DOM rect(테두리 포함/그림자 제외)와 원본 픽셀(눈에 보이는 잉크)이 서로 다른 것을 재게 된다.
// TODO 의 채점 함정 ① '한쪽만 부속 포함'이 정확히 이 실수다. 같은 스캔 코드를 두 이미지에 돌리면
// 그 여지가 없다. (클론 캡처는 `tools/shot-screens.js` 가 만든 ref-cmp/clone/tech-overview.png)
//
// ⚠️ 세션 인계 메모 ㉠ 의 함정을 먼저 친다: **원본 캡처가 앱보다 넓거나 높을 수 있다.**
//    (chat 은 세로가 804, shot-042449 는 가로 중심이 앱 중심과 1.8%p 어긋나 있었다.)
//    그래서 먼저 앱 좌우 끝과 중심을 찾아 이미지 중심과 비교하고, %W 는 **앱 폭 기준**으로 환산한다.
//    이번 원본은 497×890 에 앱 0~496(중심 248.0 vs 이미지 248.5) — 쏠림 없음을 확인했다.
//
// 사용: node probe-techov-px.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { assertFresh } = require('./clone-fresh.js');
/* 🚨 **이 자는 브라우저를 안 띄운다 — 커밋된 클론 캡처 PNG 를 원본과 맞대기만 한다.**
   그래서 게임 코드를 고치고 캡처를 다시 굽지 않으면 **옛 화면을 재면서 아무 말도 안 한다.**
   그 사고가 실제로 났다(`probe-skill-orb-ink` — `clone-fresh.js` 머리말에 전말이 있다).
   ⚠️ 지금은 **경고 전용**이다: 소스 목록이 `web/js`·`web/css` 로 넓어서 무관한 작업에도 자주
      걸리기 때문에 끊지는 않는다. 이 화면을 그리는 파일만으로 목록을 **좁힌 뒤** 네 번째 인자를
      빼면 하드 게이트(exit 2)가 된다. */
assertFresh('tools/ref-cmp/clone/tech-overview.png', ['web/js', 'web/css'], 'node tools/shot-screens.js', { warnOnly: true });

const REF = path.resolve(__dirname, '../ref/screens/shot-042407.png');
const CLONE = path.resolve(__dirname, 'ref-cmp/clone/tech-overview.png');
const TOL = 2;   // ±2%p (TODO 상단 UI 규칙)
// --selftest: 클론 쪽 **카드 밴드만** 30px 아래로 밀어 놓고 잰다. '통과만 찍어 보고 믿지 않는다'
// (인계 규칙 ㉣⑶)를 이 화면에서도 지키기 위한 것이다 — 스캐너가 진짜 픽셀에서 어긋남을 잡아내는지
// 확인한다. 30px = 3.37%H — 클론이 이미 최대 0.33%p 낮게 앉아 있어 20px(2.24%H) 로는 한 지표가 1.91%p 로 문턱 아래에 남는다(실측). 밀어 넣는 양은 **문턱 + 기존 편차**보다 넉넉해야 한다: 카드 행 4지표가 FAIL 로 뒤집혀야 정상이다.
// (이미지 전체를 밀면 앱 좌우 끝·탭바가 같이 밀려 상대 좌표가 그대로라 아무것도 안 잡힌다.)
const SELFTEST = process.argv.includes('--selftest');
// --selftest-back: 뒤로 버튼 축 전용 음성 대조(아래 MEASURE 의 backMode 주석 참조).
const SELFTEST_BACK = process.argv.includes('--selftest-back');

const MEASURE = async ([src, shiftCards, backMode]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        if (shiftCards) {
            // 카드가 사는 대역만 오려서 아래로 옮긴다(뒤로 버튼·서브탭·탭바는 제자리).
            const y0 = Math.round(c.height * 0.08), bh = Math.round(c.height * 0.5);
            const band = g.getImageData(0, y0, c.width, bh);
            g.fillStyle = '#fff'; g.fillRect(0, y0, c.width, bh);
            g.putImageData(band, 0, y0 + shiftCards);
        }
        const W = c.width, H = c.height, D = g.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
        const lum = (x, y) => { const p = at(x, y); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; };
        const near = (p, q, t) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) <= t;

        const log = [];
        // ---- 앱 상자: 화면 배경(흰색)과 그 바깥 띠를 가른다 ----
        // 이 화면은 본문이 흰색이라 y=500 행(빈 영역)에서 흰 구간을 훑으면 앱 좌우 끝이 나온다.
        let ax0 = -1, ax1 = -1;
        for (let x = 0; x < W; x++) if (lum(x, 500) > 0.9) { if (ax0 < 0) ax0 = x; ax1 = x; }
        log.push(`앱 가로 ${ax0}~${ax1} (폭 ${ax1 - ax0 + 1}) · 이미지 폭 ${W} · 앱 중심 ${((ax0 + ax1) / 2).toFixed(1)} vs 이미지 중심 ${(W / 2).toFixed(1)}`);
        if (ax0 < 0) { ax0 = 0; ax1 = W - 1; }
        const AW = ax1 - ax0 + 1;

        // ---- 세로: 탭바 상단(어두운 밴드) ----
        const rowDark = y => { let n = 0; for (let x = ax0; x <= ax1; x++) if (lum(x, y) < 0.22) n++; return n / AW; };
        let tabTop = -1;
        for (let y = H - 1; y > H * 0.6; y--) { if (rowDark(y) > 0.8) tabTop = y; else if (tabTop > 0) break; }
        // ---- 서브탭 회색 밴드(스킬/펫/기술 트리) 상단 ----
        const rowGrayish = y => { let n = 0; for (let x = ax0; x <= ax1; x++) { const p = at(x, y); if (Math.abs(p[0] - p[1]) < 12 && Math.abs(p[1] - p[2]) < 12 && p[0] > 140 && p[0] < 215) n++; } return n / AW; };
        let subTop = -1;
        for (let y = tabTop - 1; y > H * 0.6; y--) { if (rowGrayish(y) > 0.6) subTop = y; else if (subTop > 0) break; }

        // ---- 분기 카드 4장: 검정 테두리 사각형 ----
        // 카드 헤더가 남색(#1c2333 계열), 몸통이 흰색, 테두리가 검정이다.
        // 열 위치는 카드 상단 헤더 행에서 검정 구간으로, 행 위치는 열 중앙에서 검정 구간으로 잡는다.
        const isBlack = (x, y) => lum(x, y) < 0.12;
        // 헤더 밴드가 있는 y 를 찾는다: 어두운 픽셀이 가로로 25~85% 인 첫 행
        let hy = -1;
        for (let y = Math.round(H * 0.10); y < Math.round(H * 0.20); y++) { const f = rowDark(y); if (f > 0.25 && f < 0.85) { hy = y; break; } }
        const runs = [];
        if (hy > 0) {
            let s = -1;
            for (let x = ax0; x <= ax1; x++) {
                const d = lum(x, hy) < 0.35;
                if (d && s < 0) s = x;
                if ((!d || x === ax1) && s >= 0) { if (x - s > AW * 0.15) runs.push([s, x - 1]); s = -1; }
            }
        }
        log.push(`헤더 행 y=${hy} · 카드 열 구간 ${JSON.stringify(runs)}`);
        // 각 카드 행의 세로 범위 — 열 중앙 한 픽셀로는 못 잡는다(아이콘·글자가 섞인다).
        // **카드 열 폭 전체에서 어두운 픽셀 비율이 80% 넘는 행**만 골라 덩어리로 묶는다:
        // 위 덩어리 = 상단 테두리 + 남색 헤더(붙어 있다), 아래 한 줄 = 하단 테두리.
        const bands = [];
        if (runs.length) {
            const [cx0, cx1] = runs[0];
            let s = -1;
            for (let y = Math.round(H * 0.08); y < Math.round(H * 0.55); y++) {
                let n = 0;
                for (let x = cx0; x <= cx1; x++) if (lum(x, y) < 0.35) n++;
                const d = n / (cx1 - cx0 + 1) > 0.8;
                if (d && s < 0) s = y;
                if (!d && s >= 0) { bands.push([s, y - 1]); s = -1; }
            }
            if (s >= 0) bands.push([s, Math.round(H * 0.55) - 1]);
        }
        log.push(`카드 열1 어두운 행 덩어리 ${JSON.stringify(bands)}`);
        // ⚠️ 헤더 덩어리가 **제목 글자 때문에 쪼개진다** — 2행 헤더('스킬, 펫 & 기술')는 흰 글자가
        //    길어 어두운 비율이 80% 아래로 내려가는 행이 생겨 [281,287]+[299,308] 로 갈렸다
        //    (1행 '대장간'은 짧아서 안 갈렸다). 가까운 덩어리를 먼저 합치지 않으면 카드 2장이
        //    엉뚱하게 짝지어져 2행 하단이 34.61% 로 나온다(실제 47.19%).
        const merged = [];
        for (const b of bands) {
            const last = merged[merged.length - 1];
            if (last && b[0] - last[1] <= 15) last[1] = b[1];
            else merged.push([b[0], b[1]]);
        }
        log.push(`합친 덩어리 ${JSON.stringify(merged)}`);
        // 이제 [헤더덩어리, 하단테두리] × 2 로 접힌다
        const cardsY = [];
        for (let i = 0; i + 1 < merged.length; i += 2) cardsY.push([merged[i][0], merged[i + 1][1], merged[i][1]]);
        log.push(`카드 행 구간 ${JSON.stringify(cardsY)}`);

        // ⚠️ 가로 치수는 **헤더 밴드에서 가장 짙은 행**에서 다시 잰다. 두 번 데었다:
        //   ⑴ 위에서 쓴 hy 는 '어두운 비율이 25~85% 인 첫 행'이라 사실상 **카드 맨 윗줄 = 라운드
        //      모서리**다. 모서리에서는 카드가 실제보다 좁게 나오고, 코너 반경이 조금만 달라도
        //      폭 Δ 가 2%p 가까이 흔들린다(같은 빌드에서 +0.47 → −1.93%p 로 뒤집혔다 — 코드는
        //      그대로였고 행 위치만 바뀌었다).
        //   ⑵ 그렇다고 **밴드 한가운데**를 쓰면 이번엔 헤더의 **흰 제목 글자**가 어두운 구간을
        //      토막 내서, 폭 필터(15%W)에 걸린 조각만 남아 카드 하나가 통째로 사라진다
        //      (원본 카드열1 좌가 52.31%W 로 나와 Δ −36%p 라는 헛것이 나왔다).
        //   → 모서리도 글자도 아닌 행 = **밴드 안에서 어두운 비율이 최대인 행**이 정답이다.
        if (cardsY.length) {
            let my = cardsY[0][0], best = -1;
            for (let y = cardsY[0][0]; y <= cardsY[0][2]; y++) { const f = rowDark(y); if (f > best) { best = f; my = y; } }
            const runs2 = [];
            let s = -1;
            for (let x = ax0; x <= ax1; x++) {
                const d = lum(x, my) < 0.35;
                if (d && s < 0) s = x;
                if ((!d || x === ax1) && s >= 0) { if (x - s > AW * 0.15) runs2.push([s, x - 1]); s = -1; }
            }
            if (runs2.length >= 2) { runs.length = 0; runs.push(...runs2); log.push(`헤더 최짙은 행 y=${my}(어두움 ${(best * 100).toFixed(0)}%) 재측정 열 구간 ${JSON.stringify(runs2)}`); }
        }

        // ---- 뒤로 버튼(빨강 ◀) ----
        // 🚨 **밴드 안 빨강 화소의 '합집합'으로 재면 안 된다 — 2026-08-20 실측으로 터졌다.**
        //    크로미엄이 흰 글자를 파란 서브탭('기술 트리') 위에 그리면 서브픽셀 렌더링이 글자
        //    오른쪽 모서리에 **붉은 프린지**를 남긴다(실측 `151,71,52`·`167,87,45` — 좌우 이웃이
        //    `255,255,223` 과 `10,51,95` 라 글자 가장자리인 게 드러난다). 그 화소가 **4개** 밴드에
        //    들어오는 순간 합집합 상자가 29px → 382px 로 늘어 `뒤로 폭 +70.31%p`·`뒤로 높이
        //    +7.39%p` 라는 유령 불통과가 났다. 정작 버튼은 x15~43·y692~714 로 멀쩡했다.
        //    ⚠️ 원본 PNG 에는 이 프린지가 없다 = **클론에서만 터지는 오염**이다. 이 자의 설계
        //    원칙이 '양쪽에 같은 코드'인데, 한쪽만 오염되는 경로는 그 원칙으로 막히지 않는다.
        //    → 합집합 대신 **가장 큰 연결 성분(4-이웃)** 하나만 잰다. 프린지는 1~2화소짜리
        //    고립점이라 자동으로 진다. '가장 붉은 것'이 아니라 '가장 큰 덩어리'로 고르는 이유는,
        //    문턱을 조이는 처방은 프린지 색이 배경색에 딸려 움직여서 다음 색 변경에 또 뚫린다.
        const isRed = (x, y) => { const p = at(x, y); return p[0] > 150 && p[1] < 90 && p[2] < 90; };
        const yTop = Math.round(H * 0.6), yBot = (subTop > 0 ? subTop : H);
        let nBlobs = 0;
        const findRedBlob = () => {
            const seen = new Uint8Array(W * H);
            let best = null; nBlobs = 0;
            for (let y = yTop; y < yBot; y++) for (let x = ax0; x <= ax1; x++) {
                const k0 = y * W + x;
                if (seen[k0] || !isRed(x, y)) continue;
                let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
                const st = [k0]; seen[k0] = 1;
                while (st.length) {
                    const cur = st.pop(), cx = cur % W, cy = (cur - cx) / W;
                    n++;
                    if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
                    if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
                    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
                        if (nx < ax0 || nx > ax1 || ny < yTop || ny >= yBot) continue;
                        const nk = ny * W + nx;
                        if (seen[nk] || !isRed(nx, ny)) continue;
                        seen[nk] = 1; st.push(nk);
                    }
                }
                nBlobs++;
                if (!best || n > best.n) best = { n, x0, x1, y0, y1 };
            }
            return best;
        };
        // 🔬 음성 대조 두 종(--selftest-back). 이 축은 **판정기에 자기검증이 아예 없어서** 위 사고가
        //    조용히 났다 — 고친 성질을 그대로 겨누는 대조를 붙여 둔다. 좌표는 하나도 안 박는다
        //    (인계 함정 ④⑴: 손으로 베낀 인자는 코드가 변하면 유령 결과를 낸다).
        //    ⓐ fringe = **고립 빨강 화소**를 밴드 오른쪽에 심는다 → 합집합 시절이면 상자가 통째로
        //       늘어나 FAIL, 연결 성분이면 **아무것도 안 변해야** 한다(면역 확인).
        //    ⓑ grow  = 찾은 덩어리 **오른쪽에 이어 붙여** 20px 넓힌다 → 이 축이 아직 살아 있으면
        //       `뒤로 폭` 이 FAIL 로 뒤집혀야 한다(판정력 확인).
        const paintRed = (x0, y0, x1, y1) => {
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const i = (y * W + x) * 4; D[i] = 220; D[i + 1] = 40; D[i + 2] = 40;
            }
        };
        if (backMode === 'fringe') {
            const fy = Math.round((yTop + yBot) / 2);
            for (let j = 0; j < 4; j++) paintRed(ax0 + Math.round(AW * 0.75) + j * 7, fy + j * 5, ax0 + Math.round(AW * 0.75) + j * 7, fy + j * 5);
            log.push(`[selftest-back:fringe] 고립 빨강 4화소를 x≈${ax0 + Math.round(AW * 0.75)} y≈${fy} 에 심었다`);
        } else if (backMode === 'grow') {
            const b0 = findRedBlob();
            if (b0) { paintRed(b0.x1 + 1, b0.y0, Math.min(ax1, b0.x1 + 20), b0.y1); log.push(`[selftest-back:grow] 덩어리 오른쪽에 20px 이어 붙였다(x${b0.x1 + 1}~${Math.min(ax1, b0.x1 + 20)})`); }
        }
        const blob = findRedBlob(), blobs = nBlobs;
        let bx0 = W, bx1 = -1, by0 = H, by1 = -1;
        if (blob) {
            ({ x0: bx0, x1: bx1, y0: by0, y1: by1 } = blob);
            log.push(`뒤로 빨강 덩어리 ${blobs}개 중 최대 ${blob.n}화소 x${bx0}~${bx1} y${by0}~${by1}(나머지는 서브픽셀 프린지)`);
            // 자기검증: 버튼 한 개치고 말이 안 되는 덩어리면 수치를 내지 않는다(인계 규칙 — 측정기 고장).
            const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
            if (blob.n < 100 || bw > AW * 0.25 || bh > H * 0.1) { log.push(`⚠️ 측정기 고장 — 뒤로 덩어리가 버튼 크기가 아니다(${blob.n}화소 ${bw}×${bh})`); bx1 = -1; }
        }

        const pw = v => +((v) / AW * 100).toFixed(2);
        const ph = v => +((v) / H * 100).toFixed(2);
        const R = {};
        if (runs.length >= 2) {
            R['카드열1 좌'] = pw(runs[0][0] - ax0); R['카드열1 폭'] = pw(runs[0][1] - runs[0][0] + 1);
            R['카드열2 좌'] = pw(runs[1][0] - ax0); R['카드열2 폭'] = pw(runs[1][1] - runs[1][0] + 1);
            R['카드 가로간격'] = pw(runs[1][0] - runs[0][1] - 1);
        }
        if (cardsY.length >= 2) {
            R['카드1행 상단'] = ph(cardsY[0][0]); R['카드1행 하단'] = ph(cardsY[0][1]); R['카드 높이'] = ph(cardsY[0][1] - cardsY[0][0] + 1);
            R['헤더 높이'] = ph(cardsY[0][2] - cardsY[0][0] + 1);
            R['카드2행 상단'] = ph(cardsY[1][0]); R['카드2행 하단'] = ph(cardsY[1][1]);
            R['카드 세로간격'] = ph(cardsY[1][0] - cardsY[0][1] - 1);
        }
        if (bx1 > 0) { R['뒤로 좌'] = pw(bx0 - ax0); R['뒤로 폭'] = pw(bx1 - bx0 + 1); R['뒤로 상단'] = ph(by0); R['뒤로 높이'] = ph(by1 - by0 + 1); }
        if (subTop > 0) R['서브탭 상단'] = ph(subTop);
        if (tabTop > 0) R['탭바 상단'] = ph(tabTop);
        return { size: [W, H], app: [ax0, ax1], log, R };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.setContent('<body style="margin:0">');
    const run = async (f, shift, backMode) => page.evaluate(MEASURE, ['data:image/png;base64,' + fs.readFileSync(f).toString('base64'), shift || 0, backMode || '']);
    const ref = await run(REF);
    const clone = await run(CLONE, SELFTEST ? 30 : 0);
    if (SELFTEST) console.log('[selftest] 클론 카드 밴드를 30px(3.37%H) 아래로 밀어 잰다 — 카드 행 지표가 FAIL 로 뒤집혀야 판정기가 살아 있는 것이다.');

    // ---- --selftest-back: 뒤로 버튼 축의 음성 대조 2종 ----
    // 카드 밴드를 미는 기존 --selftest 는 이 축을 전혀 안 건드린다. 그래서 '합집합으로 재던 사고'가
    // 판정기가 초록인 채로 지나갔다(정확히는 유령 빨강이 났고, 그게 UI 결함으로 오해될 뻔했다).
    if (SELFTEST_BACK) {
        const keys = ['뒤로 좌', '뒤로 폭', '뒤로 상단', '뒤로 높이'];
        const fringe = await run(CLONE, 0, 'fringe');
        const grow = await run(CLONE, 0, 'grow');
        const same = keys.every(k => fringe.R[k] === clone.R[k]);
        const grew = grow.R['뒤로 폭'] != null && Math.abs(grow.R['뒤로 폭'] - ref.R['뒤로 폭']) > TOL;
        console.log('\n[selftest-back] 뒤로 버튼 축 음성 대조');
        fringe.log.filter(l => l.startsWith('[selftest') || l.startsWith('뒤로')).forEach(l => console.log('  ⓐ ' + l));
        console.log(`  ⓐ 고립 프린지 면역: ${keys.map(k => `${k} ${clone.R[k]}→${fringe.R[k]}`).join(' · ')} → ${same ? 'OK(안 변함)' : 'FAIL(합집합으로 재고 있다)'}`);
        grow.log.filter(l => l.startsWith('[selftest') || l.startsWith('뒤로')).forEach(l => console.log('  ⓑ ' + l));
        console.log(`  ⓑ 20px 확장 검출: 뒤로 폭 ${clone.R['뒤로 폭']}→${grow.R['뒤로 폭']}(원본 ${ref.R['뒤로 폭']}) → ${grew ? 'OK(FAIL 로 뒤집힘)' : 'FAIL(판정력 없음)'}`);
        console.log(same && grew ? '\nSELFTEST-BACK OK — 프린지엔 면역이고 진짜 확장은 잡는다' : '\nSELFTEST-BACK FAIL — 판정기 고장');
        await browser.close();
        process.exit(same && grew ? 0 : 1);
    }

    for (const [label, o] of [['원본 shot-042407', ref], ['클론 tech-overview', clone]]) {
        console.log(`\n${label} ${o.size.join('×')} · 앱 ${o.app.join('~')}`);
        o.log.forEach(l => console.log('  ' + l));
    }

    console.log('\n요소'.padEnd(16) + '원본'.padStart(8) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    const ng = [];
    let worst = 0;
    for (const [k, v] of Object.entries(ref.R)) {
        const got = clone.R[k];
        if (got == null) { ng.push(`${k}: 클론 측정 불가`); console.log(k.padEnd(14) + v.toFixed(2).padStart(11) + '     —' + '        (측정 불가)'); continue; }
        const d = +(got - v).toFixed(2);
        if (Math.abs(d) > Math.abs(worst)) worst = d;
        const ok = Math.abs(d) <= TOL;
        if (!ok) ng.push(`${k} ${d > 0 ? '+' : ''}${d}%p`);
        console.log(k.padEnd(14) + v.toFixed(2).padStart(11) + got.toFixed(2).padStart(9) + `${d > 0 ? '+' : ''}${d}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%p 초과`));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ':\n  ' + ng.join('\n  ') : ''}`);
    console.log(ng.length ? 'FAIL' : 'PASS — 전 요소 ±' + TOL + '%p 이내');
    await browser.close();
    if (SELFTEST) {
        // 카드 행 지표(상단·하단 × 2행)가 전부 넘어야 스캐너가 실제로 판별하는 것이다.
        const need = ['카드1행 상단', '카드1행 하단', '카드2행 상단', '카드2행 하단'];
        const caught = need.filter(k => ng.some(s => s.startsWith(k)));
        console.log(caught.length === need.length
            ? `\nSELFTEST OK — 밀어 놓은 카드 행 ${caught.length}/4 지표를 전건 검출`
            : `\nSELFTEST FAIL — 30px 를 밀었는데 ${caught.length}/4 만 잡혔다(판정기 고장)`);
        process.exit(caught.length === need.length ? 0 : 1);
    }
    process.exit(ng.length ? 1 : 0);
})();
