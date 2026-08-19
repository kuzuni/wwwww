// 기술 노드 팝업(shot-042605) 요소 실측 — '전 UI 비율 전수 검증 패스'의 미실측 화면 중 밴드 최상위(3.5).
//
// probe-techoverview-dom.js 와 같은 규약: **원본 PNG 스캔과 클론 DOM 실측을 한 런에서** 한다
// (인계 메모 함정 ㉡ — 등재 수치를 베끼면 이미 해소된 편차를 좇게 된다).
//
// 🚨 앞 세션들이 밟은 계측 함정 대비:
//   ⑴ 원본 이미지 폭 ≠ 앱 폭일 수 있다 → 맨 아래 탭바 행에서 앱 좌우 끝을 먼저 찾는다.
//   ⑵ 흰 카드 폭을 '흰 화소가 처음 길게 이어지는 행'으로 잡으면 **라운드 모서리 안쪽**을 재서
//      18~35px 좁게 읽힌다 → 카드 대역 전체 행의 **최대 폭**을 쓴다.
//   ⑶ 팝업 등장 transform 이 걸린 프레임의 DOM rect 는 0.73배로 축소돼 나온다 → 애니메이션 무효화.
//
// 재는 요소: 흰 카드 좌/폭/상/높이 · 아이콘 원 좌/폭/상 · 진행바 좌/폭/상/높이 ·
//            버튼 행 상/높이 · 좌버튼 좌/폭 · 우버튼 좌/폭 · 버튼 간격 · 빨간 X 중심/지름
//
// 사용: node tools/probe-tn-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042605.png');
const TOL = 2.0;   // ±2%p (사용자 확정 통과 기준)

const SCAN_REF = function (src) {
    return new Promise(async (resolve) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const white = (p) => p[0] > 235 && p[1] > 235 && p[2] > 235;
        const red = (p) => p[0] > 165 && p[1] < 85 && p[2] < 85;
        const navy = (p) => p[0] < 45 && p[1] < 50 && p[2] < 80;            // 진행바 트랙
        const blue = (p) => p[2] > 150 && p[2] - p[0] > 60 && p[1] < 160;   // 진행바 채움


        // ── 앱 폭: 맨 아래 행에서 '여백이 아닌' 가장 긴 연속 구간
        const yBot = H - 3;
        const bg = at(1, yBot);
        const sameBg = (p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 24;
        let appL = 0, appR = W - 1, best = 0, run = -1;
        for (let x = 0; x <= W; x++) {
            const isApp = x < W && !sameBg(at(x, yBot));
            if (isApp && run < 0) run = x;
            if (!isApp && run >= 0) { if (x - run > best) { best = x - run; appL = run; appR = x - 1; } run = -1; }
        }
        if (best < W * 0.5) { appL = 0; appR = W - 1; }
        const AW = appR - appL + 1;

        // 행별 헬퍼 — [좌,우] 최장 연속 구간과 개수
        const runsIn = (y, test, minLen, x0, x1) => {
            const out = []; let r = -1;
            for (let x = x0; x <= x1 + 1; x++) {
                const on = x <= x1 && test(at(x, y));
                if (on && r < 0) r = x;
                if (!on && r >= 0) { if (x - r >= minLen) out.push([r, x - 1]); r = -1; }
            }
            return out;
        };
        const colRuns = (x, test, minLen, y0, y1) => {
            const out = []; let r = -1;
            for (let y = y0; y <= y1 + 1; y++) {
                const on = y <= y1 && test(at(x, y));
                if (on && r < 0) r = y;
                if (!on && r >= 0) { if (y - r >= minLen) out.push([r, y - 1]); r = -1; }
            }
            return out;
        };

        // ── ① 흰 카드
        // 🚨 '흰 구간이 넓은 연속 행 대역'으로 잡으면 안 된다 — 카드 안의 **진행바·버튼 행은 흰 구간이
        //    짧아 대역을 끊어** 카드가 4~5토막 나고, 그중 가장 긴 토막(제목 아래 여백)만 카드로 잡힌다.
        //    (1차 시도에서 카드 높이가 5.56%H 로 나온 원인.) 그래서 ⓐ 이미지 전체에서 가장 긴 흰 구간으로
        //    카드 **폭**을 먼저 확정하고, ⓑ 그 폭 안쪽 여백 열(좌·우 padding)을 위아래로 훑어 **높이**를 잡는다.
        let cardL = 0, cardR = 0, cw = 0, cwY = 0;
        for (let y = 0; y < H; y++) {
            for (const r of runsIn(y, white, 8, appL, appR)) {
                if (r[1] - r[0] + 1 > cw) { cw = r[1] - r[0] + 1; cardL = r[0]; cardR = r[1]; cwY = y; }
            }
        }
        // ⓑ 카드 좌우 안쪽 여백 열은 카드 높이 전체가 흰색이다(아이콘·버튼은 그보다 안쪽에서 시작).
        //    양쪽 열이 **동시에** 흰 구간인 세로 범위를 카드 본문으로 본다.
        const padX1 = cardL + Math.max(4, Math.round(cw * 0.012));
        const padX2 = cardR - Math.max(4, Math.round(cw * 0.012));
        let cardTop = cwY, cardBot = cwY;
        while (cardTop > 0 && white(at(padX1, cardTop - 1)) && white(at(padX2, cardTop - 1))) cardTop--;
        while (cardBot < H - 1 && white(at(padX1, cardBot + 1)) && white(at(padX2, cardBot + 1))) cardBot++;
        // 카드 검정 키라인 포함 외곽: 흰 대역 위/아래로 3px 정도가 테두리다 — 원본 테두리 두께를 실측
        let kTop = cardTop; while (kTop > 0 && !white(at(Math.round((cardL + cardR) / 2), kTop - 1))) { kTop--; if (cardTop - kTop > 8) break; }
        let kBot = cardBot; while (kBot < H - 1 && !white(at(Math.round((cardL + cardR) / 2), kBot + 1))) { kBot++; if (kBot - cardBot > 8) break; }

        // ── ② 진행바: 카드 안에서 navy 또는 blue 가 카드 폭의 40% 이상 이어지는 행 대역
        const barRows = [];
        for (let y = cardTop; y <= cardBot; y++) {
            const rs = runsIn(y, (p) => navy(p) || blue(p), 6, cardL, cardR);
            const longest = rs.reduce((m, r) => Math.max(m, r[1] - r[0] + 1), 0);
            barRows.push(longest > cw * 0.4 ? y : -1);
        }
        const barYs = barRows.filter(y => y >= 0);
        const barTop = barYs.length ? barYs[0] : -1, barBot = barYs.length ? barYs[barYs.length - 1] : -1;
        let barL = 0, barR = 0, bw = 0;
        for (const y of barYs) {
            for (const r of runsIn(y, (p) => navy(p) || blue(p), 6, cardL, cardR)) {
                if (r[1] - r[0] + 1 > bw) { bw = r[1] - r[0] + 1; barL = r[0]; barR = r[1]; }
            }
        }

        // ── ③ 빨간 취소 버튼 + 빨간 X 원
        // 🚨 '최장 연속 빨강 구간'으로 대역을 잡으면 안 된다 — X 원 가운데의 **흰 ✕ 글리프가 행을 반으로
        //    쪼개** 원의 아래 2/3 가 통째로 대역에서 빠졌다(1차 시도: X 원이 y 568~579, 12행으로만 잡힘).
        //    행별 **빨강 화소 총개수**로 대역을 잡고, 폭은 그 행의 min~max x(글리프 구멍을 메운 전폭)로 낸다.
        const redRows = [];
        for (let y = 0; y < H; y++) {
            let n = 0;
            for (let x = appL; x <= appR; x++) if (red(at(x, y))) n++;
            redRows.push(n);
        }
        const redBands = [];
        let s = -1;
        for (let y = 0; y < H; y++) {
            const on = redRows[y] > AW * 0.04;
            if (on && s < 0) s = y;
            if (!on && s >= 0) { if (y - s >= 6) redBands.push([s, y - 1]); s = -1; }
        }
        const bandBox = (band) => {
            let l = 1e9, r = -1, wmax = 0;
            for (let y = band[0]; y <= band[1]; y++) {
                let a = -1, b = -1;
                for (let x = appL; x <= appR; x++) if (red(at(x, y))) { if (a < 0) a = x; b = x; }
                if (a >= 0 && b - a + 1 > wmax) { wmax = b - a + 1; l = a; r = b; }
            }
            return { l, r, w: wmax, top: band[0], bot: band[1] };
        };
        // 빨강 대역은 위에서부터 [버튼 행] → [X 원] 두 개다. 대역의 **세로 위치만** 여기서 쓰고,
        // 가로 폭은 아래 ④ 에서 따로 낸다 — 🚨 버튼 행의 빨강 min~max x 를 그대로 쓰면
        // **건너뛰기 버튼 안의 빨간 젬 아이콘(◆112)까지 한 덩어리로 묶여** 취소 버튼이 l=143·w=246
        // (실제 l≈253·w≈139)으로 잡혔다. 인계 메모 함정 ①('부속을 한쪽만 포함') 의 같은 계열이다.
        const redBoxes = redBands.map(bandBox).filter(b => b.w > AW * 0.05).sort((a, b) => a.top - b.top);
        const btnBand = redBoxes.length >= 2 ? redBoxes[0] : null;
        const xbtn = redBoxes.length >= 2 ? redBoxes[redBoxes.length - 1] : null;

        // ── ④ 버튼 2개: 색이 아니라 **'흰 카드 바탕이 아닌 덩어리'** 로 잡는다.
        //    버튼 행 중앙에서 카드 안쪽을 훑으면 [회색 건너뛰기][흰 간격][빨강 취소] 로 정확히 2덩어리가 나온다.
        const notWhite = (p) => !white(p);
        let skip = null, cancel = null;
        if (btnBand) {
            const yMid = Math.round((btnBand.top + btnBand.bot) / 2);
            const rs = runsIn(yMid, notWhite, Math.round(cw * 0.08), cardL + 3, cardR - 3);
            const two = rs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 2).sort((a, b) => a[0] - b[0]);
            const vext = (r) => {
                const xMid = Math.round((r[0] + r[1]) / 2);
                const cr = colRuns(xMid, notWhite, 10, cardTop, cardBot).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
                return cr ? { top: cr[0], bot: cr[1] } : { top: btnBand.top, bot: btnBand.bot };
            };
            // 좌버튼(회색)은 이 방식으로 정확히 잡힌다. 우버튼은 **안의 흰 글자 '취소'가 덩어리를 쪼개서**
            // 오른쪽 조각(w 57px)만 잡혔다 — 원본 폭 139px 의 41%. 그래서 우버튼만은 빨강 마스크의
            // min~max x 로 재되, **좌버튼 오른쪽 끝보다 오른쪽** 으로 한정해 젬 아이콘을 배제한다.
            if (two.length >= 1) {
                skip = { l: two[0][0], r: two[0][1], w: two[0][1] - two[0][0] + 1, ...vext(two[0]) };
                // 🚨 우버튼을 **빨강** 마스크로 재면 좌버튼(notWhite = 검정 키라인 포함)과 기준이 달라져
                //    폭이 키라인 두께만큼(6px, 1.2%p) 작게 나온다 — 인계 메모 함정 ①('양쪽 동일 기준') 그대로다.
                //    좌버튼과 같은 notWhite 로 재되, 좌버튼 오른쪽부터 카드 안쪽 끝까지의 **전체 min~max** 를
                //    쓴다(그 구간의 비-흰색은 우버튼뿐이라, 안의 흰 글자 '취소'가 쪼개도 전폭이 복원된다).
                let a = 1e9, b = -1;
                for (let y = btnBand.top; y <= btnBand.bot; y++) {
                    for (let x = skip.r + 4; x <= cardR - 3; x++) if (notWhite(at(x, y))) { if (x < a) a = x; if (x > b) b = x; }
                }
                if (b > 0) {
                    // 세로는 min~max 로 재면 안 된다 — 같은 열이 위쪽 **진행바**도 지나가서 둘이 한 덩어리로
                    // 묶인다(버튼 상단이 421 = 진행바 상단으로 잡혔다). 최장 연속 구간을 쓴다.
                    const cr = colRuns(Math.round((a + b) / 2), notWhite, 10, cardTop, cardBot)
                        .sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
                    cancel = { l: a, r: b, w: b - a + 1, top: cr ? cr[0] : btnBand.top, bot: cr ? cr[1] : btnBand.bot };
                }
            }
        }

        // ── ⑤ 아이콘 원: 색 임계값(주황)은 원본 아이콘이 초록 발바닥+갈색 링이라 **6px 조각**밖에 못 잡았다.
        //    대신 기하로 잡는다 — 카드 상단 40% 에서 열마다 '흰색이 아닌' 최장 세로 구간을 재면
        //    아이콘 원은 ~60px, 제목 글자는 ~25px 이라 확실히 갈린다. 가장 왼쪽 덩어리가 아이콘이다.
        let icon = null;
        {
            const y1 = cardTop, y2 = cardTop + Math.round((cardBot - cardTop) * 0.4);
            const colH = [];
            for (let x = cardL; x <= cardR; x++) {
                const cr = colRuns(x, notWhite, 3, y1, y2);
                colH.push(cr.reduce((m, r) => Math.max(m, r[1] - r[0] + 1), 0));
            }
            const maxH = Math.max(...colH);
            const thr = Math.max(maxH * 0.6, 20);
            let i = 0; while (i < colH.length && colH[i] < thr) i++;
            let j = i; while (j < colH.length && colH[j] >= thr * 0.5) j++;
            if (i < colH.length && j - i > 8) {
                const xMid = Math.round((cardL + i + cardL + j - 1) / 2);
                const cr = colRuns(xMid, notWhite, 3, y1, y2).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
                // 🚨 '세로 구간이 임계 이상인 열의 범위'를 폭으로 쓰면 **원의 위아래가 얇아지는 구간이 잘려**
                //    지름보다 좁게 나온다(45px vs 실제 50px). 원의 **세로 중앙 행**에서 가로 구간을 재야 지름이다.
                const yMidI = cr ? Math.round((cr[0] + cr[1]) / 2) : -1;
                let bl = cardL + i, br = cardL + j - 1;
                if (yMidI > 0) {
                    const hr = runsIn(yMidI, notWhite, 6, cardL, cardL + Math.round(cw * 0.35))
                        .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
                    if (hr) { bl = hr[0]; br = hr[1]; }
                }
                icon = { l: bl, r: br, w: br - bl + 1, top: cr ? cr[0] : -1, bot: cr ? cr[1] : -1, maxH, thr };
            }
        }

        resolve({
            W, H, appL, appR, AW,
            card: { l: cardL, r: cardR, w: cw, top: cardTop, bot: cardBot, kTop, kBot },
            bar: { l: barL, r: barR, w: bw, top: barTop, bot: barBot },
            cancel, skip, xbtn, icon,
            redBands, redBoxes, btnBand,
        });
    });
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 491, height: 881 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    // 항상 `UI.els` 까지 확인한다 — `UI`는 선언되자마자 보이지만 `els` 는 `UI.init()` 안에서야 대입된다(ui.js:678~).
    // 그 틈에 화면을 열면 `this.els.panels`·`this.els.mountModal` 에서 그대로 터진다(probe-grid-empty 에서 실제로 밟았다).
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!UI.els && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    // ---- 원본 스캔 ----
    const refSrc = 'data:image/png;base64,' + fs.readFileSync(REF_PNG).toString('base64');
    const ref = await page.evaluate(([src, fnSrc]) => (new Function('return ' + fnSrc)())(src), [refSrc, SCAN_REF.toString()]);

    // ---- 클론: 원본과 같은 상태로 열고 DOM 실측 ----
    await page.evaluate(() => {
        const pick = TechTree.nid('extraEgg', 4);
        S.tech = S.tech || {};
        for (let t = 1; t < 4; t++) S.tech[TechTree.nid('extraEgg', t)] = 5;
        // 🚨 해금 규칙이 '같은 타입 세로 레일'에서 **바로 위 행에 그려진 노드 전부**로 바뀌었다
        //    (`techtree-node-logic` 2026-08-19). 같은 타입 하위 티어만 채운 옛 시드로는 이 노드가
        //    **잠긴 채**여서 팝업이 진행바 대신 [잠김]을 그렸고, 프로브가 `clone.bar = null` 로
        //    죽었다(측정기 고장이 아니라 시드가 낡은 것 — 함정 ㉣ '자가 코드보다 낡은 프로브').
        //    조상을 전부 1레벨로 펴서 원본(연구 진행 중)과 같은 상태를 만든다.
        const openUp = (id, depth) => {
            if (depth > 12) return;
            for (const p of TechTree.parentsOf(id)) {
                if (!(S.tech[p] >= 1)) S.tech[p] = 1;
                openUp(p, depth + 1);
            }
        };
        openUp(pick, 0);
        S.tech[pick] = 1;
        S.techResearch = { id: pick, endsAt: U.now() + (13 * 60 + 30) * 60e3 };
        UI.switchTab('summon'); UI.switchSummonSub('tech');
        UI.openTechBranch('skillpet'); UI.openTechNode(pick);
    });
    // 🚨 폰트가 아직 안 붙은 프레임에서 재면 글자 폭이 달라져 **같은 페이지인데 런마다 수치가 바뀐다**
    //    (펫 화면에서 x1 pill 45.6→39.5px 로 갈린 실제 사례 — 통과 판정이 통째로 무의미해진다).
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const clone = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const pick = (sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null);
        const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x - app.x, y: r.y - app.y, w: r.width, h: r.height }; };
        const one = (s) => { const g = pick(s); return g.length ? box(g[0]) : null; };
        return {
            app: { w: app.width, h: app.height },
            card: one('.item-detail[data-tech-node]'),
            icon: one('.item-detail[data-tech-node] .idet-icon'),
            bar: one('.item-detail[data-tech-node] .tech-prog'),
            btns: pick('.item-detail[data-tech-node] .tech-btns .btn').map(box),
            xbtn: one('#detail-modal .x-btn'),
            lead: one('.item-detail[data-tech-node] > .idet-lead'),
        };
    });
    // 캡처는 shot-tn.js 몫이다 — 여기서 또 찍으면 swiftshader 환경에서 30s 스크린샷 타임아웃으로
    // 보고 출력까지 통째로 날아간다(실측 1회 손실). 이 프로브는 수치만 낸다.
    await browser.close();

    // ---- 보고 ----
    const AW = ref.AW, AH = ref.H;
    const rw = v => (v / AW) * 100, rh = v => (v / AH) * 100;
    const cw = v => (v / clone.app.w) * 100, ch = v => (v / clone.app.h) * 100;
    console.log(`원본 ${ref.W}×${ref.H} · 앱 x ${ref.appL}~${ref.appR}(폭 ${AW}) ${AW === ref.W ? '= 이미지 폭' : `🚨 이미지보다 ${ref.W - AW}px 좁다`}`);
    console.log(`클론 앱 ${clone.app.w.toFixed(1)}×${clone.app.h.toFixed(1)}`);
    console.log(`원본 카드 px: ${JSON.stringify(ref.card)}`);
    console.log(`원본 진행바 px: ${JSON.stringify(ref.bar)}`);
    console.log(`원본 취소 px: ${JSON.stringify(ref.cancel)} · 건너뛰기 px: ${JSON.stringify(ref.skip)}`);
    console.log(`원본 X 원 px: ${JSON.stringify(ref.xbtn)} · 아이콘 px: ${JSON.stringify(ref.icon)}`);

    // ---- 측정기 자기검증 (고장은 exit 2 — 요소 FAIL 과 섞지 않는다) ----
    const bad = [];
    if (!(ref.card.w > AW * 0.6 && ref.card.w < AW * 0.95)) bad.push(`카드 폭 ${rw(ref.card.w).toFixed(2)}%W 가 60~95%W 밖`);
    if (!(ref.card.bot - ref.card.top > AH * 0.2)) bad.push(`카드 높이 ${rh(ref.card.bot - ref.card.top).toFixed(2)}%H 가 20%H 미만`);
    if (!ref.bar || ref.bar.w < ref.card.w * 0.5) bad.push('진행바를 못 잡았다');
    if (!ref.cancel) bad.push('취소 버튼(카드 안 빨강)을 못 잡았다');
    if (!ref.xbtn) bad.push('X 원(카드 아래 빨강)을 못 잡았다');
    if (!ref.skip) bad.push('건너뛰기 버튼을 못 잡았다');
    if (!clone.card) bad.push('클론 카드 셀렉터 실패');
    if (bad.length) {
        console.log('\n=> 측정기 고장(exit 2): ' + bad.join(' · '));
        console.log(`   원본 빨강 대역: ${JSON.stringify(ref.redBands)} → 박스 ${JSON.stringify(ref.redBoxes)}`);
        if (clone.card) {
            console.log(`   참고 클론 DOM: 카드 x${cw(clone.card.x).toFixed(2)} w${cw(clone.card.w).toFixed(2)} y${ch(clone.card.y).toFixed(2)} h${ch(clone.card.h).toFixed(2)}`);
            if (clone.bar) console.log(`             진행바 x${cw(clone.bar.x).toFixed(2)} w${cw(clone.bar.w).toFixed(2)} y${ch(clone.bar.y).toFixed(2)} h${ch(clone.bar.h).toFixed(2)}`);
            clone.btns.forEach((b, i) => console.log(`             버튼[${i}] x${cw(b.x).toFixed(2)} w${cw(b.w).toFixed(2)} y${ch(b.y).toFixed(2)} h${ch(b.h).toFixed(2)}`));
            if (clone.xbtn) console.log(`             X원 x${cw(clone.xbtn.x).toFixed(2)} w${cw(clone.xbtn.w).toFixed(2)} y${ch(clone.xbtn.y).toFixed(2)} h${ch(clone.xbtn.h).toFixed(2)}`);
        }
        process.exit(2);
    }

    const rows = [];
    const divergence = [];   // 원본과 **사양이 갈린** 자리(측정 실패가 아니다)
    const add = (name, refV, cloneV) => rows.push({ name, refV, cloneV, d: cloneV - refV });
    add('카드 좌', rw(ref.card.l - ref.appL), cw(clone.card.x));
    add('카드 폭', rw(ref.card.w), cw(clone.card.w));
    add('카드 상단', rh(ref.card.kTop), ch(clone.card.y));
    add('카드 높이', rh(ref.card.kBot - ref.card.kTop + 1), ch(clone.card.h));
    if (clone.icon && ref.icon) {
        add('아이콘 좌', rw(ref.icon.l - ref.appL), cw(clone.icon.x));
        add('아이콘 폭', rw(ref.icon.w), cw(clone.icon.w));
        add('아이콘 상단', rh(ref.icon.top), ch(clone.icon.y));
    }
    add('진행바 좌', rw(ref.bar.l - ref.appL), cw(clone.bar.x));
    add('진행바 폭', rw(ref.bar.w), cw(clone.bar.w));
    add('진행바 상단', rh(ref.bar.top), ch(clone.bar.y));
    add('진행바 높이', rh(ref.bar.bot - ref.bar.top + 1), ch(clone.bar.h));
    if (clone.btns.length >= 2) {
        add('좌버튼 좌', rw(ref.skip.l - ref.appL), cw(clone.btns[0].x));
        add('좌버튼 폭', rw(ref.skip.w), cw(clone.btns[0].w));
        add('우버튼 좌', rw(ref.cancel.l - ref.appL), cw(clone.btns[1].x));
        add('우버튼 폭', rw(ref.cancel.w), cw(clone.btns[1].w));
        add('버튼 간격', rw(ref.cancel.l - ref.skip.r - 1), cw(clone.btns[1].x - (clone.btns[0].x + clone.btns[0].w)));
        add('버튼 상단', rh(ref.cancel.top), ch(clone.btns[1].y));
        add('버튼 높이', rh(ref.cancel.bot - ref.cancel.top + 1), ch(clone.btns[1].h));
    } else if (clone.btns.length === 1) {
        // 원본은 [건너뛰기][취소] 2분할이지만 클론은 **의도적으로 [건너뛰기] 하나**다
        // (사용자 지시 2026-08-19 `techtree-node-logic` "연구 시작하면 취소 불가" → [취소] 폐기).
        // 사양이 원본과 갈린 자리라 '버튼 2개'를 기대하면 이 화면은 영영 못 잰다 — 남은 한 개를
        // 원본의 같은 버튼(건너뛰기)과 대조하고, 갈린 사실을 출력에 남긴다.
        divergence.push('원본 [건너뛰기][취소] 2분할 → 클론 [건너뛰기] 1개 (취소 불가 사양)');
        // 🚨 **가로(좌·폭·간격)는 대조하지 않는다** — 2분할의 한 칸과 1개짜리 줄은 원리상 같을 수
        //    없다(첫 판에서 좌 Δ+9.76%p, 폭 Δ+12.24%p 로 FAIL 이 났다. 사양 분기를 비율 결함으로 읽은 것).
        //    원본에는 '버튼 하나만 있는 상태'가 아예 없어서 폭의 정답이 없다 — 값만 참고로 찍는다.
        // 세로(줄 상단·높이)와 중심 정렬은 그대로 성립하므로 그건 대조한다.
        // ⚠️ 세로는 **취소 버튼 박스**를 쓴다 — `ref.skip` 의 세로는 은색 본체에서 끊겨(bot 513)
        //    실제 버튼(≈474~542, 확대 크롭으로 두 버튼 높이가 같은 것을 확인)보다 29px 짧다.
        add('버튼 상단', rh(ref.cancel.top), ch(clone.btns[0].y));
        add('버튼 높이', rh(ref.cancel.bot - ref.cancel.top + 1), ch(clone.btns[0].h));
        add('버튼 중심x(카드중심 대비)', rw((ref.card.l + ref.card.r) / 2 - ref.appL),
            cw(clone.btns[0].x + clone.btns[0].w / 2));
        divergence.push(`참고 폭: 원본 한 칸 ${rw(ref.skip.w).toFixed(2)}%W → 클론 ${cw(clone.btns[0].w).toFixed(2)}%W`);
    }
    if (clone.xbtn) {
        add('X원 폭', rw(ref.xbtn.w), cw(clone.xbtn.w));
        add('X원 중심x', rw((ref.xbtn.l + ref.xbtn.r) / 2 - ref.appL), cw(clone.xbtn.x + clone.xbtn.w / 2));
        add('X원 상단', rh(ref.xbtn.top), ch(clone.xbtn.y));
    }

    if (divergence.length) console.log('\n사양 분기(대조 제외): ' + divergence.join(' · '));
    console.log('\n요소별 대조 (원본 → 클론, Δ%p · 기준 ±2.0%p):');
    let fails = 0;
    for (const r of rows) {
        if (!Number.isFinite(r.cloneV) || !Number.isFinite(r.refV)) { console.log(`  ${r.name.padEnd(12)} 측정 실패`); fails++; continue; }
        const ok = Math.abs(r.d) <= TOL;
        if (!ok) fails++;
        console.log(`  ${r.name.padEnd(12)} 원본 ${r.refV.toFixed(2).padStart(6)}  클론 ${r.cloneV.toFixed(2).padStart(6)}  Δ ${(r.d >= 0 ? '+' : '') + r.d.toFixed(2)}%p  ${ok ? 'OK' : 'FAIL'}`);
    }
    console.log(`\n콘솔/페이지 에러: ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`=> ${fails === 0 && errors.length === 0 ? 'PASS' : `불통과 ${fails}건`}`);
    process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
})();
