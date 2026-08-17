// 확률 정보 팝업(shot-042831 / forge-info) **원본 PNG 픽셀 실측** — 클론 DOM 실측(probe-fi-dom.js)의 목표치를 뽑는다.
// 사용: PW_PATH=<playwright> node probe-fi-ref.js [png경로]
// 원본을 캔버스로 디코드해 색 마스크로 요소 실루엣을 스캔한다(TODO '비평가 채점 함정' 절의 권장 방식).
//
// ⚠️ 이 화면에서 실제로 밟은 함정 2개 — 다음 세션이 같은 임계값을 재사용하지 말 것:
//   ① **시대 막대에는 검정 테두리가 없다.** 처음엔 '넓은 검정 잉크 런'으로 막대를 찾으려 했는데
//      원본 막대는 테두리 없이 색면만 있어서(y=259 흰색 → y=260 rgb(28,175,255)) 한 줄도 안 걸렸다.
//      막대는 '카드 왼쪽 안쪽 여백보다 오른쪽에 있는 비(非)흰색 색면'으로 잡는다.
//   ② **빨간 마스크는 '우주' 막대(rgb(255,28,28))를 함께 잡는다.** ✕ 버튼만 보려면 카드 아래(y>카드바닥)로
//      범위를 잘라야 한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const PNG = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042831.png');

(async () => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(PNG).toString('base64');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const out = await page.evaluate(async (src) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.getElementById('c');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const isWhite = p => p[0] >= 232 && p[1] >= 232 && p[2] >= 232;
        const isRed = p => p[0] > 170 && p[1] < 90 && p[2] < 90;
        const rowRun = (y, pred, x0, x1) => {
            let best = 0, bs = -1, cur = 0, s = -1;
            for (let x = x0; x <= x1; x++) {
                if (pred(at(x, y))) { if (cur === 0) s = x; cur++; if (cur > best) { best = cur; bs = s; } }
                else cur = 0;
            }
            return { len: best, x0: bs, x1: bs + best - 1 };
        };

        // ── 카드(흰 종이) bbox
        let cardTop = -1, cardBot = -1, cardL = 1e9, cardR = -1;
        for (let y = 0; y < H; y++) {
            const r = rowRun(y, isWhite, 0, W - 1);
            if (r.len > 300) {
                if (cardTop < 0) cardTop = y;
                cardBot = y; if (r.x0 < cardL) cardL = r.x0; if (r.x1 > cardR) cardR = r.x1;
            }
        }

        // ── 시대 막대: 카드 안쪽 왼쪽 여백 바로 오른쪽 열을 세로로 훑어 '비흰색 색면' 구간을 뽑는다.
        //    막대 안 아이콘/글자를 피하려고 막대 왼쪽 끝에서 몇 px 안쪽 열을 쓴다.
        const probeX = cardL + 8;
        const bars = [];
        let run = null;
        for (let y = cardTop; y <= cardBot; y++) {
            const p = at(probeX, y);
            const solid = !isWhite(p);
            if (solid) { if (!run) run = { y0: y, y1: y, rgb: p }; else run.y1 = y; }
            else if (run) { if (run.y1 - run.y0 >= 12) bars.push(run); run = null; }
        }
        if (run && run.y1 - run.y0 >= 12) bars.push(run);

        // 각 막대의 좌우 끝 + 우측 '다음 레벨' 세그먼트 경계(같은 행에서 색이 어두운 변주로 바뀌는 x)
        const barGeo = bars.map(b => {
            const my = Math.round((b.y0 + b.y1) / 2);
            let x0 = -1, x1 = -1;
            for (let x = cardL; x <= cardR; x++) if (!isWhite(at(x, my))) { x0 = x; break; }
            for (let x = cardR; x >= cardL; x--) if (!isWhite(at(x, my))) { x1 = x; break; }
            // 우측 세그먼트: 오른쪽 끝 색을 기준으로, 그 색과 확연히 다른 색이 시작되는 지점까지 왼쪽으로 이동
            const rp = at(x1 - 4, my);
            let seg = x1;
            for (let x = x1 - 4; x >= x0; x--) {
                const p = at(x, my);
                const diff = Math.abs(p[0] - rp[0]) + Math.abs(p[1] - rp[1]) + Math.abs(p[2] - rp[2]);
                if (diff > 60) { seg = x + 1; break; }
            }
            return { y0: b.y0, y1: b.y1, h: b.y1 - b.y0 + 1, x0, x1, w: x1 - x0 + 1, segX: seg, segW: x1 - seg + 1, rgb: b.rgb };
        });

        // ── 빨간 ✕ (카드 아래에서만 — '우주' 막대와 섞이지 않게)
        let xTop = -1, xBot = -1, xL = 1e9, xR = -1;
        for (let y = cardBot + 1; y < H; y++) {
            const r = rowRun(y, isRed, 0, W - 1);
            if (r.len > 12) { if (xTop < 0) xTop = y; xBot = y; if (r.x0 < xL) xL = r.x0; if (r.x1 > xR) xR = r.x1; }
        }

        // ── 카드 아래쪽 블록: 진행바(어두운 트랙)와 [건너뛰기](회색 버튼)
        //    막대 마지막 아래 ~ 카드 바닥 사이에서 '카드 중앙 열'의 비흰색 구간을 뽑는다.
        const lastBar = barGeo[barGeo.length - 1];
        const midX = Math.round((cardL + cardR) / 2);
        const lower = [];
        run = null;
        for (let y = lastBar.y1 + 2; y <= cardBot; y++) {
            const solid = !isWhite(at(midX, y));
            if (solid) { if (!run) run = { y0: y, y1: y }; else run.y1 = y; }
            else if (run) { if (run.y1 - run.y0 >= 3) lower.push(run); run = null; }
        }
        if (run && run.y1 - run.y0 >= 3) lower.push(run);
        const lowerGeo = lower.map(b => {
            const my = Math.round((b.y0 + b.y1) / 2);
            let x0 = -1, x1 = -1;
            for (let x = cardL; x <= cardR; x++) if (!isWhite(at(x, my))) { x0 = x; break; }
            for (let x = cardR; x >= cardL; x--) if (!isWhite(at(x, my))) { x1 = x; break; }
            return { y0: b.y0, y1: b.y1, h: b.y1 - b.y0 + 1, x0, x1, w: x1 - x0 + 1, rgb: at(midX, my) };
        });

        return { W, H, cardTop, cardBot, cardL, cardR, barGeo, lowerGeo, x: { xTop, xBot, xL, xR } };
    }, dataUrl);

    await browser.close();

    const { W, H } = out;
    const pw = v => (v / W * 100).toFixed(2);
    const ph = v => (v / H * 100).toFixed(2);
    console.log(`\n원본 ${path.basename(PNG)} — ${W}x${H}\n`);
    console.log(`카드   x ${pw(out.cardL)} ~ ${pw(out.cardR)} %W  (w ${pw(out.cardR - out.cardL + 1)})   y ${ph(out.cardTop)} ~ ${ph(out.cardBot)} %H  (h ${ph(out.cardBot - out.cardTop + 1)})`);
    console.log(`\n시대 막대 ${out.barGeo.length}개 — x/w 는 %W, y/h 는 %H`);
    console.log(`  #   y상     y하     h      x좌    x우    w      다음%세그 w   막대색`);
    out.barGeo.forEach((b, i) => {
        console.log(`  ${String(i + 1).padStart(2)}  ${ph(b.y0).padStart(6)}  ${ph(b.y1).padStart(6)}  ${ph(b.h).padStart(5)}  ${pw(b.x0).padStart(5)}  ${pw(b.x1).padStart(5)}  ${pw(b.w).padStart(5)}  ${pw(b.segW).padStart(6)} (${(b.segW / b.w * 100).toFixed(1)}% 막대폭)  rgb(${b.rgb})`);
    });
    if (out.barGeo.length > 1) {
        const gaps = out.barGeo.slice(1).map((b, i) => b.y0 - out.barGeo[i].y1 - 1);
        const pitch = out.barGeo.slice(1).map((b, i) => b.y0 - out.barGeo[i].y0);
        console.log(`  막대 간격 ${gaps.join(',')} px (${ph(gaps.reduce((a, b) => a + b) / gaps.length)} %H 평균)   피치 ${pitch.join(',')} px`);
    }
    console.log(`\n카드 하단 블록:`);
    out.lowerGeo.forEach((b, i) => console.log(`  ${i + 1}  y ${ph(b.y0)}~${ph(b.y1)} %H (h ${ph(b.h)})  x ${pw(b.x0)}~${pw(b.x1)} %W (w ${pw(b.w)})  rgb(${b.rgb})`));
    console.log(`\n빨간 ✕  x ${pw(out.x.xL)}~${pw(out.x.xR)} %W (w ${pw(out.x.xR - out.x.xL + 1)})  y ${ph(out.x.xTop)}~${ph(out.x.xBot)} %H (h ${ph(out.x.xBot - out.x.xTop + 1)})`);
})();
