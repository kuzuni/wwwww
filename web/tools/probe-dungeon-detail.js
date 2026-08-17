// 던전 상세 팝업(원본 shot-042304) 요소 실측 — 원본 PNG와 클론 PNG에 **같은 색 스캔**을 걸어
// 카드/배너/보상 pill/버튼 2개/✕ 의 x·y·폭·높이를 %W·%H로 나란히 출력한다.
// 눈대중·합성 이미지 축소 판단 금지 규칙(TODO ⚠️ 채점 함정) 때문에 원본도 클론도 픽셀로 잰다.
// 스캔 열/행을 요소마다 따로 잡는 이유: 화면 중앙 열은 버튼 두 개 사이 '틈'을 지나 버튼을 놓친다.
// 사용: PW_PATH=... node probe-dungeon-detail.js [원본] [클론]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs'), path = require('path');

const REF = process.argv[2] || path.resolve(__dirname, '../ref/screens/shot-042304.png');
const CLONE = process.argv[3] || path.resolve(__dirname, 'ref-cmp/clone/dungeon-detail.png');

const measure = async (page, file) => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    return page.evaluate(async (dataUrl) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = dataUrl; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const P = (v, t) => +(v / t * 100).toFixed(2);

        const isWhite = p => p[0] > 244 && p[1] > 244 && p[2] > 244;
        // 버튼/pill 회색 = 무채색. 상한 238 — 클론 실버 버튼은 그라디언트 상단이 rgb(227)까지 올라가
        // 상한을 218로 두면 버튼 윗부분을 통째로 놓친다(원본·클론 같은 판정을 써야 비교가 성립).
        const isGray = p => Math.abs(p[0] - p[1]) < 14 && Math.abs(p[1] - p[2]) < 14 && p[0] > 148 && p[0] < 239;
        const isRed = p => p[0] > 150 && p[1] < 90 && p[2] < 90;

        // 세로 구간들 (x는 픽셀)
        const colRuns = (x, test, minRun) => {
            const out = []; let sy = -1;
            for (let y = 0; y <= H; y++) {
                const ok = y < H && test(at(x, y));
                if (ok && sy < 0) sy = y;
                else if (!ok && sy >= 0) { if (y - sy >= minRun) out.push({ y: P(sy, H), h: P(y - sy, H), bot: P(y, H), px: `${sy}..${y - 1}` }); sy = -1; }
            }
            return out;
        };
        // 가로 구간들 (y는 픽셀)
        const rowRuns = (y, test, minRun) => {
            const out = []; let sx = -1;
            for (let x = 0; x <= W; x++) {
                const ok = x < W && test(at(x, y));
                if (ok && sx < 0) sx = x;
                else if (!ok && sx >= 0) { if (x - sx >= minRun) out.push({ x: P(sx, W), w: P(x - sx, W), right: P(x, W), px: `${sx}..${x - 1}` }); sx = -1; }
            }
            return out;
        };
        const longest = a => a.slice().sort((p, q) => (q.h ?? q.w) - (p.h ?? p.w))[0] || null;

        // ① 카드 흰 본문 — 카드 왼쪽 안쪽 열(콘텐츠가 없는 x)에서 가장 긴 흰 구간
        let white = null, whiteX = null;
        for (const xf of [0.17, 0.18, 0.19, 0.16]) {
            const r = longest(colRuns(Math.round(xf * W), isWhite, 20));
            if (r && (!white || r.h > white.h)) { white = r; whiteX = xf; }
        }
        // ② 카드 좌우 끝 — 흰 본문 하단 근처 행(버튼 아래 여백)에서
        const yBottomBand = Math.round((white.bot / 100 * H) - 6);
        const cardLR = longest(rowRuns(yBottomBand, isWhite, 60));
        // ③ 배너(카드 상단 ~ 흰 본문 상단): 카드 상단을 찾기 위해 흰 본문 위쪽에서
        //    '배경(어두운 딤)이 아닌' 첫 행을 카드 왼쪽 안쪽 열에서 찾는다.
        const cx = Math.round((cardLR.x + cardLR.w / 2) / 100 * W);
        const xIn = Math.round((cardLR.x / 100 * W) + 8);
        const bgTop = at(xIn, Math.round(white.y / 100 * H) - 60); // 배너 안 색(참고용)
        let cardTop = null;
        {
            // 카드 바깥(딤) 색을 카드 위쪽 여백에서 표본으로 잡고, 그와 달라지는 첫 y를 카드 상단으로 본다
            const yProbe = Math.round(white.y / 100 * H);
            const dim = at(xIn, Math.max(0, yProbe - 260));
            const nearDim = p => Math.abs(p[0] - dim[0]) < 12 && Math.abs(p[1] - dim[1]) < 12 && Math.abs(p[2] - dim[2]) < 12;
            for (let y = Math.max(0, yProbe - 250); y < yProbe; y++) {
                if (!nearDim(at(xIn, y)) && !nearDim(at(xIn, y + 1)) && !nearDim(at(xIn, y + 2))) { cardTop = y; break; }
            }
        }
        // ④ 회색 요소들 — pill 은 카드 중앙 열, 버튼은 좌/우 1/3 열에서
        const grayCenter = colRuns(cx, isGray, 4);
        const grayLeft = colRuns(Math.round((cardLR.x / 100 + cardLR.w / 100 * 0.22) * W), isGray, 6);
        const grayRight = colRuns(Math.round((cardLR.x / 100 + cardLR.w / 100 * 0.78) * W), isGray, 6);
        // ④-2 카드 좌우 끝 재측정 — 흰 본문 상단 바로 아래 행(콘텐츠 없는 띠)에서
        const cardRow2 = longest(rowRuns(Math.round(white.y / 100 * H) + 6, isWhite, 60));
        // ④-3 파란 삼각형(◀) 박스
        let bl = { minX: 1e9, maxX: -1, minY: 1e9, maxY: -1, n: 0 };
        const isBlue = p => p[2] > 150 && p[2] - p[0] > 60 && p[2] - p[1] > 40;
        for (let y = Math.round(white.y / 100 * H); y < Math.round(H * 0.62); y++)
            for (let x = 0; x < W; x++) if (isBlue(at(x, y))) { bl.n++; bl.minX = Math.min(bl.minX, x); bl.maxX = Math.max(bl.maxX, x); bl.minY = Math.min(bl.minY, y); bl.maxY = Math.max(bl.maxY, y); }
        const tri = bl.n > 40 ? { x: P(bl.minX, W), w: P(bl.maxX - bl.minX + 1, W), y: P(bl.minY, H), h: P(bl.maxY - bl.minY + 1, H), px: `x${bl.minX}..${bl.maxX} y${bl.minY}..${bl.maxY}` } : null;
        // ④-4 흰 본문 안 '어두운 글자줄' 세로 위치 — 난이도/단계/열쇠 텍스트 밴드
        const darkRows = [];
        {
            const x0 = Math.round(white.y ? (cardRow2 ? cardRow2.x / 100 * W : 0) : 0), x1 = cardRow2 ? cardRow2.right / 100 * W : W;
            let sy = -1;
            for (let y = Math.round(white.y / 100 * H); y < Math.round(white.bot / 100 * H); y++) {
                let dark = 0;
                for (let x = Math.round(x0) + 4; x < Math.round(x1) - 4; x++) { const p = at(x, y); if (p[0] < 120 && p[1] < 120 && p[2] < 120) dark++; }
                const on = dark >= 6;
                if (on && sy < 0) sy = y;
                else if (!on && sy >= 0) { if (y - sy >= 3) darkRows.push({ y: P(sy, H), h: P(y - sy, H), bot: P(y, H), px: `${sy}..${y - 1}` }); sy = -1; }
            }
        }
        // ⑤ ✕ 빨강 원
        let rx = { minX: 1e9, maxX: -1, minY: 1e9, maxY: -1, n: 0 };
        for (let y = Math.round(H * 0.6); y < Math.round(H * 0.86); y++)
            for (let x = 0; x < W; x++) if (isRed(at(x, y))) { rx.n++; rx.minX = Math.min(rx.minX, x); rx.maxX = Math.max(rx.maxX, x); rx.minY = Math.min(rx.minY, y); rx.maxY = Math.max(rx.maxY, y); }
        const xBtn = rx.n ? { x: P(rx.minX, W), w: P(rx.maxX - rx.minX + 1, W), y: P(rx.minY, H), h: P(rx.maxY - rx.minY + 1, H), bot: P(rx.maxY + 1, H), px: `x${rx.minX}..${rx.maxX} y${rx.minY}..${rx.maxY}` } : null;

        return {
            size: [W, H], whiteX, bgTop: bgTop.join(','),
            cardTop: cardTop == null ? null : { y: P(cardTop, H), px: cardTop },
            bannerH: cardTop == null ? null : +(P(white.y / 100 * H - cardTop, H)).toFixed(2),
            whiteBody: white,
            card: { x: cardLR.x, w: cardLR.w, right: cardLR.right, bot: white.bot, px: cardLR.px },
            grayCenter, grayLeft, grayRight, xBtn, cardRow2, tri, darkRows,
            // 회색 각 덩어리의 가로 수치 (세로 중앙 행에서)
            grayCenterRows: grayCenter.map(r => rowRuns(Math.round((r.y + r.h / 2) / 100 * H), isGray, 16)),
            grayLeftRows: grayLeft.map(r => rowRuns(Math.round((r.y + r.h / 2) / 100 * H), isGray, 16)),
        };
    }, dataUrl);
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage();
    for (const [tag, file] of [['원본', REF], ['클론', CLONE]]) {
        const r = await measure(page, file);
        console.log('\n===', tag, path.basename(file), r.size.join('x'), '(흰열 xf=' + r.whiteX + ', 배너색 ' + r.bgTop + ') ===');
        console.log('카드 상단 y :', JSON.stringify(r.cardTop), ' 배너 높이:', r.bannerH, '%H');
        console.log('흰 본문     :', JSON.stringify(r.whiteBody));
        console.log('카드 좌우/하:', JSON.stringify(r.card));
        console.log('중앙열 회색 :', JSON.stringify(r.grayCenter));
        console.log('  └ 가로    :', JSON.stringify(r.grayCenterRows));
        console.log('좌1/3 회색  :', JSON.stringify(r.grayLeft));
        console.log('  └ 가로    :', JSON.stringify(r.grayLeftRows));
        console.log('우1/3 회색  :', JSON.stringify(r.grayRight));
        console.log('✕ 빨강      :', JSON.stringify(r.xBtn));
        console.log('카드 좌우(2):', JSON.stringify(r.cardRow2));
        console.log('파란 삼각형 :', JSON.stringify(r.tri));
        console.log('글자줄      :', JSON.stringify(r.darkRows));
    }
    await browser.close();
})();
