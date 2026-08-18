// 기술 트리 개요(shot-042407) 요소 실측 — '전 UI 비율 전수 검증 패스'의 미실측 화면 중 밴드 최상위(4.1).
//
// 이 프로브는 **원본 PNG 스캔과 클론 DOM 실측을 한 런에서** 한다. 앞선 화면들처럼 원본 수치를
// 상수로 베껴 두지 않는 이유: 인계 메모의 함정 ㉡("진단 메모의 수치를 그대로 믿고 착수하지 말 것")
// 대로 등재 수치가 이미 해소돼 있던 사례가 있었고, 같은 런에서 재면 그 위험이 없다.
//
// 🚨 측정 전 필수 확인 2건 (인계 메모의 함정 ㉠ 계열)
//   ⑴ 원본 세로 크기: 다른 shot 은 892 인데 chat 만 804 였다 → 이 화면은 497×890 (실측).
//   ⑵ **앱 중심 = 이미지 중심인가** — 원본 캡처가 앱보다 넓으면 가로 위치가 통째로 가짜가 된다.
//      shot-042449 가 이미지 중심 244.5 vs 앱 중심 236 이라 정중앙 정렬 클론이 -1.8%p 벌점을 먹었다.
//      그래서 여기서는 **탭바 밴드의 좌우 끝**으로 원본의 앱 폭을 먼저 찾고, 가로 %는 그 폭 기준으로 낸다.
//
// 재는 요소: 카드(2열 그리드)의 좌/폭 + 열 피치 · 1·2행 카드 상단 + 행 피치 · 헤더 띠 높이 · 1행 카드 높이
//
// 🩺 **2026-08-18: 원본 스캔이 고장나 있던 것을 고쳤다(그전까지 이 화면은 exit 2 라 한 번도 못 쟀다).**
//    앞 판은 '거짓 FAIL 6건'을 내고 스스로 exit 2 로 끊었는데, **레이아웃은 처음부터 멀쩡했고
//    측정기만 틀렸다** — 고친 뒤 9요소 전부 ±2%p 통과(최대 +0.94). 고장 원인 둘 다 같은 부류였다:
//    '흰 카드 위에 그림·글자가 얹혀 있는데 흰색이 끊기지 않는다고 가정한 것'.
//      ⑴ **카드 좌우를 헤더 띠에서 잡았다** — 띠는 어두운 바탕 + 흰 글자라 글자가 어두운 구간을
//         끊어 카드 하나가 반쪽 2개로 잡혔다(카드 폭 15.69%W ← 실제 33.20%W). 게다가 글자 구멍(~40px)이
//         카드 사이 간격(24px)보다 넓어 **구간을 이어 붙이는 방식으로도 못 가른다**(붙이면 둘이 합쳐진다).
//         → 띠 아래 **본문 흰 박스 행**을 쓴다. 좌우 검은 키라인이 카드 단위로 흰 구간을 끊어 준다.
//      ⑵ **카드 하단을 중앙 열로 훑었다** — 가운데엔 일러스트와 퍼센트 글자가 있어 흰색이 곧바로 끊겨
//         1행 카드 높이가 4.72%H 로 나왔다(실제 15.51%H). → **왼쪽 키라인 바로 안쪽 열**로 훑는다.
//      ⑶ 본문 행도 고정 오프셋이면 안 된다 — 2행 카드는 띠 아래 +12px 이 펫 아이콘에 걸린다.
//         → 띠 아래 2~26px 을 훑어 **2열 그리드 기하를 만족하는 첫 행**을 쓴다.
//
// 사용: node tools/probe-techoverview-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042407.png');
const TOL = 2.0;   // ±2%p (사용자 확정 통과 기준)

// 원본 PNG 를 캔버스로 디코드해 요소 실루엣을 스캔한다. 브라우저 안에서 도는 함수다.
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
        const dark = (p) => p[0] < 90 && p[1] < 90 && p[2] < 110;          // 카드 헤더 띠·키라인
        const white = (p) => p[0] > 235 && p[1] > 235 && p[2] > 235;

        // ⑵ 앱 폭 찾기: 맨 아래 탭바 밴드는 앱 폭을 꽉 채운다. 마지막 행에서 '앱이 아닌' 여백을 잘라낸다.
        //    여백은 순백이 아니라 페이지 바깥 여백색이므로, 행에서 가장 긴 '비-여백' 연속 구간을 앱으로 본다.
        const yBot = H - 3;
        const bg = at(1, yBot);
        const sameBg = (p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 24;
        let appL = 0, appR = W - 1, best = 0, run = -1;
        for (let x = 0; x <= W; x++) {
            const isApp = x < W && !sameBg(at(x, yBot));
            if (isApp && run < 0) run = x;
            if (!isApp && run >= 0) { if (x - run > best) { best = x - run; appL = run; appR = x - 1; } run = -1; }
        }
        if (best < W * 0.5) { appL = 0; appR = W - 1; }                    // 여백이 없으면 이미지 전체가 앱
        const AW = appR - appL + 1;

        // 카드 헤더 띠: 어두운 가로 막대. 행별로 '어두운 픽셀이 카드 폭만큼 이어지는' 구간을 찾는다.
        const rows = [];
        for (let y = 0; y < H; y++) {
            let cnt = 0;
            for (let x = appL; x <= appR; x++) if (dark(at(x, y))) cnt++;
            rows.push(cnt);
        }
        // 헤더 띠가 있는 y 대역 = 어두운 픽셀이 앱 폭의 25% 이상인 연속 행 (2열이라 카드 2장 합쳐 ~60%)
        const bands = [];
        let s = -1;
        for (let y = 0; y < H; y++) {
            const on = rows[y] > AW * 0.25;
            if (on && s < 0) s = y;
            if (!on && s >= 0) { if (y - s >= 4) bands.push([s, y - 1]); s = -1; }
        }
        // 카드의 가로 범위 — 🚨 **헤더 띠 중간 행을 쓰면 안 된다.** 띠는 어두운 바탕 + 흰 글자라
        //   글자가 어두운 구간을 끊어 카드 하나가 좌/우 반쪽 2개로 잡힌다. 게다가 **글자가 만드는
        //   구멍(~40px)이 카드 사이 간격(24px)보다 넓어서**, 구간을 이어 붙이는 방식으로도 못 가른다
        //   (붙이면 카드 둘이 하나로 합쳐진다). 앞 판이 여기서 '카드 폭 15.69%W'(실제 ≈33%W)를 냈다.
        // → 대신 **띠 바로 아래 카드 본문(흰 박스) 행**을 훑는다. 카드마다 검은 키라인이 좌우에 있어
        //   흰 구간이 카드 단위로 딱 끊긴다: 배경(좁음) · 카드1(넓음) · 카드사이(좁음) · 카드2(넓음) · 배경.
        //   폭 20%AW 이상만 남기면 카드 둘만 남는다. 반환값은 키라인 1px 을 포함한 상자다.
        // ⚠️ 본문 행을 **고정 오프셋으로 잡으면 안 된다** — 카드 안 일러스트가 흰 바탕을 끊는다.
        //    2행 카드에서 실측: 띠 아래 +12px(y320)은 펫 아이콘에 걸려 카드1 이 92+64 두 토막이 되고,
        //    +2px(y310)은 깨끗하다. 그래서 **띠 아래 몇 줄을 훑어 2열 기하를 만족하는 첫 행**을 쓴다.
        const runsAt = (y) => {
            const out = [];
            let r = -1;
            for (let x = appL; x <= appR + 1; x++) {
                const on = x <= appR && white(at(x, y));
                if (on && r < 0) r = x;
                if (!on && r >= 0) { if (x - r > AW * 0.20) out.push([r - 1, x]); r = -1; }
            }
            return out;
        };
        const isGrid2 = (cols) => cols.length === 2 &&
            cols.every(c => (c[1] - c[0] + 1) > AW * 0.25 && (c[1] - c[0] + 1) < AW * 0.42) &&
            Math.abs((cols[0][1] - cols[0][0]) - (cols[1][1] - cols[1][0])) < AW * 0.03;
        const colsOf = (band) => {
            let last = [];
            for (let dy = 2; dy <= 26; dy++) {
                const y = band[1] + dy;
                if (y >= H) break;
                last = runsAt(y);
                if (isGrid2(last)) return last;
            }
            return last;
        };
        // 카드 본문(흰 박스)의 아래 끝 — ⚠️ **카드 중앙 열로 내려가면 안 된다.** 가운데는 일러스트와
        //   퍼센트 글자가 있어 흰색이 곧바로 끊긴다(앞 판: 1행 카드 높이를 4.72%H 로 읽었다. 실제 ≈15%H).
        //   카드 **왼쪽 키라인 바로 안쪽 열**은 위에서 아래까지 흰 여백이라 하단 키라인에서만 끊긴다.
        const cardBottom = (yFrom, xIn) => {
            for (let y = yFrom; y < H; y++) if (!white(at(xIn, y))) return y - 1;
            return H - 1;
        };
        // 🚨 어두운 가로 대역은 카드 헤더만이 아니다 — 상단바 재화 pill(y 20~40)과 하단 서브탭 바(y 759~793)도
        //    같은 조건에 걸린다(첫 판에서 bands[0]/[1] 이 pill 이라 카드 열 스캔이 통째로 빈 배열이었다).
        //    카드 헤더는 **그 대역 안에서 어두운 구간이 좌우 2덩어리(2열 그리드)** 라는 구조로 골라낸다.
        const withCols = bands.map(b => ({ band: b, cols: colsOf(b) }));
        // 2열 그리드 기하를 만족하는 대역만 카드 헤더로 인정한다 — 하단 서브탭 바(3분할)와
        // 상단바 재화 pill 은 아래 흰 본문이 없어 여기서 걸러진다.
        const cardBands = withCols.filter(x => isGrid2(x.cols));
        resolve({
            W, H, appL, appR, AW,
            bands, allCols: withCols.map(x => ({ y: x.band, n: x.cols.length })),
            cardBands: cardBands.map(x => x.band),
            cols1: cardBands[0] ? cardBands[0].cols : [],
            cols2: cardBands[1] ? cardBands[1].cols : [],
            cardBottoms: cardBands.slice(0, 2).map(x => cardBottom(x.band[1] + 2, x.cols[0][0] + 4)),
        });
    });
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    // 원본과 같은 화면 크기로 잡는다(원본 497×890)
    const page = await browser.newPage({ viewport: { width: 497, height: 890 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 40000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S && S.forgeLevel === 29, null, { timeout: 40000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () {}; });
    // 열림 애니메이션 무효화 — swiftshader 에서 cardpop 이 scale(.7) 로 얼어붙어 크기가 가짜로 작게 잡힌다
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    // ---- 원본 스캔 ----
    const refSrc = 'data:image/png;base64,' + fs.readFileSync(REF_PNG).toString('base64');
    const ref = await page.evaluate(([src, fnSrc]) => (new Function('return ' + fnSrc)())(src), [refSrc, SCAN_REF.toString()]);

    // ---- 클론: 화면 열고 DOM 실측 ----
    await page.evaluate(() => { UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechOverview(); });
    await page.waitForTimeout(500);
    const clone = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const pick = (sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null);
        const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x - app.x, y: r.y - app.y, w: r.width, h: r.height }; };
        // renderTechOverview() 의 실제 마크업: .tech-branch-grid > button.tech-branch-card
        //   안에 .tech-branch-head(어두운 제목 띠) · .tech-branch-icon · .tech-branch-pct
        const cards = pick('.tech-branch-card').map(box);
        const heads = pick('.tech-branch-head').map(box);
        const pcts = pick('.tech-branch-pct').map(box);
        const one = (s) => { const g = pick(s); return g.length ? box(g[0]) : null; };
        return {
            app: { w: app.width, h: app.height },
            cards, heads, pcts,
            grid: one('.tech-branch-grid'),
            back: one('.sheet-back-btn'),
            subtab: one('#summon-subtabs'),
            title: one('#panel-tech .sheet-title'),
            html: cards.length ? '' : document.getElementById('panel-tech').innerHTML.slice(0, 600),
        };
    });
    // ⚠️ 캡처는 **보조 산출물**이다 — 여기서 던지면 위에서 다 잰 수치를 인쇄도 못 하고 죽는다
    //    (실제로 3D 씬이 도는 화면에서 30초 기본 타임아웃에 걸려 PASS 인데도 비정상 종료했다).
    //    타임아웃을 늘리고 애니메이션을 멈추되, 그래도 실패하면 경고만 남기고 보고를 계속한다.
    try {
        const dir = path.resolve(__dirname, 'ref-cmp/clone');
        fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, 'tech-overview.png'), timeout: 90000, animations: 'disabled' });
    } catch (e) {
        console.warn('⚠️ 클론 캡처 실패(수치 보고는 계속한다):', e.message.split('\n')[0]);
    }
    await browser.close();

    // ---- 보고 ----
    const AW = ref.AW, AH = ref.H;
    const rw = v => (v / AW) * 100, rh = v => (v / AH) * 100;
    const cw = v => (v / clone.app.w) * 100, ch = v => (v / clone.app.h) * 100;
    console.log(`원본 ${ref.W}×${ref.H} · 앱 x ${ref.appL}~${ref.appR} (폭 ${AW})  ${AW === ref.W ? '= 이미지 폭' : `🚨 이미지보다 ${ref.W - AW}px 좁다 — 가로 %는 앱 폭 기준으로 낸다`}`);
    console.log(`클론 앱 ${clone.app.w.toFixed(1)}×${clone.app.h.toFixed(1)}`);
    console.log(`원본 어두운 대역 전체: ${JSON.stringify(ref.allCols)}  → 카드 헤더로 고른 것: ${JSON.stringify(ref.cardBands)}`);
    console.log(`원본 1행 카드 열: ${JSON.stringify(ref.cols1)}  2행: ${JSON.stringify(ref.cols2)}`);
    console.log(`원본 카드 하단 추정: ${JSON.stringify(ref.cardBottoms)}`);

    // ---- 측정기 자기검증 (probe-tabbar 와 같은 규약: 고장은 exit 2 로, 요소 FAIL 과 섞지 않는다) ----
    // 🚨 이 화면의 원본 스캔은 아래 두 가지에 걸려 **거짓 FAIL 6건**을 낸 적이 있다(2026-08-18 실측).
    //   ⑴ 카드 헤더 띠는 어두운 바탕에 **흰 글자**라, 띠 중간 행에서 어두운 구간이 글자에서 끊긴다 →
    //      한 카드의 헤더가 좌/우 반쪽 두 구간으로 잡혀 '카드 폭 15.69%W'(실제 ≈33%W)가 나왔다.
    //   ⑵ 하단 **서브탭 바**(스킬|펫|기술 트리)도 어두운 대역이고 3분할이라 구간이 2개로 잡혀
    //      '2행 카드 헤더'로 뽑혔다 → 2행 카드 상단 85.28%H(실제 ≈31%H), 행 피치 72.25%p.
    // 그래서 뽑은 대역이 '2열 그리드 카드 헤더'의 기하(같은 폭 두 덩어리, 각 25~40%AW)를 만족하는지
    // 먼저 본다. 안 맞으면 요소 수치를 인쇄하지 않고 고장으로 끊는다 — 다음 세션이 거짓 FAIL 을 좇지 않게.
    const geomOk = (cols) => cols.length === 2 &&
        cols.every(c => { const w = rw(c[1] - c[0] + 1); return w >= 25 && w <= 40; }) &&
        Math.abs(rw(ref.cols1[0][1] - ref.cols1[0][0]) - rw(ref.cols1[1][1] - ref.cols1[1][0])) <= 3;
    if (!geomOk(ref.cols1) || ref.cardBands.length < 2 || !geomOk(ref.cols2)) {
        console.log('\n=> 측정기 고장(exit 2): 원본 카드 헤더 스캔이 2열 그리드 기하를 못 만족한다.');
        console.log(`   1행 열: ${JSON.stringify(ref.cols1)} → 폭 ${ref.cols1.map(c => rw(c[1] - c[0] + 1).toFixed(2) + '%W').join(' / ')}`);
        console.log(`   2행 열: ${JSON.stringify(ref.cols2)} → 폭 ${ref.cols2.map(c => rw(c[1] - c[0] + 1).toFixed(2) + '%W').join(' / ')}`);
        console.log('   원인 후보 ⑴ 헤더 띠의 흰 글자가 어두운 구간을 끊는다(카드 하나가 반쪽 2개로 잡힘)');
        console.log('           ⑵ 하단 서브탭 바가 카드 헤더로 오인된다(3분할이라 구간 2개)');
        console.log('   고치는 방향: 헤더 띠 대신 **카드 외곽 검정 키라인**을 잡거나, 띠 대역 안에서');
        console.log('           어두운 픽셀의 min/max x(글자 사이 공백을 메운 전체 폭)를 쓸 것.');
        console.log('   참고 — 클론 DOM 실측치는 원본과 무관하게 유효하다:');
        clone.cards.forEach((c, i) => console.log(`     카드[${i}] x ${cw(c.x).toFixed(2)}%W w ${cw(c.w).toFixed(2)}%W · y ${ch(c.y).toFixed(2)}%H h ${ch(c.h).toFixed(2)}%H`));
        console.log(`     열 피치 ${clone.cards.length > 1 ? cw(clone.cards[1].x - clone.cards[0].x).toFixed(2) : '—'}%W · ` +
            `행 피치 ${clone.cards.length > 2 ? ch(clone.cards[2].y - clone.cards[0].y).toFixed(2) : '—'}%H · ` +
            `헤더 높이 ${clone.heads.length ? ch(clone.heads[0].h).toFixed(2) : '—'}%H`);
        console.log(`   🚨 카드 수: 원본 4장(대장간·힘·스킬,펫&기술·ANIMALS) vs 클론 ${clone.cards.length}장 — ` +
            '개수·이름이 다르면 비율 대조 전에 상태부터 맞춰야 한다(인계 메모 함정 ㉢ 계열).');
        process.exit(2);
    }

    if (!clone.cards.length) {
        console.log('\n🚨 클론에서 개요 카드 셀렉터를 못 찾았다 — 셀렉터 후보를 고쳐야 한다. panel-tech 앞부분:');
        console.log(clone.html);
        process.exit(2);
    }
    console.log(`\n클론 카드 ${clone.cards.length}장:`);
    clone.cards.forEach((c, i) => console.log(`  [${i}] x ${cw(c.x).toFixed(2)}%W w ${cw(c.w).toFixed(2)}%W · y ${ch(c.y).toFixed(2)}%H h ${ch(c.h).toFixed(2)}%H`));

    const rows = [];
    const add = (name, refV, cloneV) => rows.push({ name, refV, cloneV, d: cloneV - refV });
    if (ref.cols1.length >= 2 && clone.cards.length >= 2) {
        add('카드 좌(1열)', rw(ref.cols1[0][0] - ref.appL), cw(clone.cards[0].x));
        add('카드 폭', rw(ref.cols1[0][1] - ref.cols1[0][0] + 1), cw(clone.cards[0].w));
        add('카드 좌(2열)', rw(ref.cols1[1][0] - ref.appL), cw(clone.cards[1].x));
        add('열 피치', rw(ref.cols1[1][0] - ref.cols1[0][0]), cw(clone.cards[1].x - clone.cards[0].x));
    }
    if (ref.cardBands.length >= 2 && clone.cards.length >= 3) {
        add('1행 카드 상단', rh(ref.cardBands[0][0]), ch(clone.cards[0].y));
        add('헤더 띠 높이', rh(ref.cardBands[0][1] - ref.cardBands[0][0] + 1), clone.heads.length ? ch(clone.heads[0].h) : NaN);
        add('2행 카드 상단', rh(ref.cardBands[1][0]), ch(clone.cards[2].y));
        add('행 피치', rh(ref.cardBands[1][0] - ref.cardBands[0][0]), ch(clone.cards[2].y - clone.cards[0].y));
    }
    if (ref.cardBottoms[0]) add('1행 카드 높이', rh(ref.cardBottoms[0] - ref.cardBands[0][0] + 1), ch(clone.cards[0].h));

    console.log('\n요소별 대조 (원본 → 클론, Δ%p · 기준 ±2.0%p):');
    let bad = 0;
    for (const r of rows) {
        if (!Number.isFinite(r.cloneV)) { console.log(`  ${r.name.padEnd(14)} 원본 ${r.refV.toFixed(2)}  클론 —(측정 실패)`); continue; }
        const ok = Math.abs(r.d) <= TOL;
        if (!ok) bad++;
        console.log(`  ${r.name.padEnd(14)} 원본 ${r.refV.toFixed(2).padStart(6)}  클론 ${r.cloneV.toFixed(2).padStart(6)}  Δ ${(r.d >= 0 ? '+' : '') + r.d.toFixed(2)}%p  ${ok ? 'OK' : 'FAIL'}`);
    }
    // 🚨 게이트에 안 걸리지만 **매번 인쇄한다** — 통과 판정에 묻혀 사라지면 '전부 맞다'로 읽힌다.
    //    원본은 카드가 4장(대장간·힘·스킬,펫&기술·ANIMALS)이고 클론은 3장이다. 비율(폭·피치·높이)은
    //    2열 그리드라 3장으로도 성립하지만, **4번째 분기는 게임 데이터 문제**라 여기서 못 고친다.
    console.log(`\n※ 비율 게이트 밖 차이: 카드 수 원본 4장(대장간·힘·스킬,펫&기술·ANIMALS) vs 클론 ${clone.cards.length}장 — 분기 데이터 소관.`);
    console.log(`\n콘솔/페이지 에러: ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`=> ${bad === 0 && errors.length === 0 ? 'PASS' : `불통과 ${bad}건`}`);
    process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
})();
