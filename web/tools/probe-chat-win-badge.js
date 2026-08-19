// 채팅 전투 공유 카드의 `승리` 배지 판정기 (slug: chat-win-badge)
//
// 재는 것 — 원본 `shot-043500` 과 클론을 **같은 픽셀 코드로** 재서 둘을 비교한다:
//   ⓐ 세로 위치: `승리` 주황 잉크가 아바타 타일 **하단 모서리에 걸터앉는가**.
//      원본은 모서리를 위 4px · 아래 7px 로 문다. 앱 폭 대비 %로 ±2%p 판정.
//   ⓑ 검정 키라인: 주황 잉크 둘레(8-이웃 중 잉크가 아닌 화소)에서 **어두운 화소 비율**.
//      원본은 글리프에 1px 검정 링이 돌아 있다.
//   ⓒ 콘솔/스크립트 에러 0건.
//
// 🚨 **왜 ⓑ 가 필요한가 — 원본 스크린샷만 보면 이 결함이 안 보인다.**
//    원본 승자 아바타는 **검은 실루엣**이라 링이 없어도 주황 글자가 그냥 읽힌다. 클론 아바타는
//    IconGen 이 그리는 흰·하늘·살구색 도트라, 링이 빠지면 주황 글자가 그림에 그대로 녹는다.
//    그래서 '원본과 같아 보이나'가 아니라 '링이 실제로 있나'를 따로 잰다.
//
// 📏 자 = 이미지/앱 폭. 원본 컷과 클론 캡처를 **같은 499px 폭**으로 맞춰 찍으므로 px 가 곧 비교 가능하다.
//
// ⚠️ 측정 함정(전부 밟았다):
//   ⑴ **타일을 '흰색'으로 잡으면 안 된다** — 원본 타일 속은 검은 실루엣이 거의 다 채워서 행마다
//      흰 화소가 20개도 안 나온다. 타일은 **초록 판 위의 '비초록 연속 구간 44px'** 로 잡는다
//      (`.chat-share-side`(#39ab36) 는 CSS 상수이고 원본 실측색과 같다).
//   ⑵ **주황 덩어리를 위에서부터 그냥 첫 개를 집으면 안 된다** — 아바타 그림 안의 주황 도트
//      몇 개가 먼저 걸린다(클론에서 4화소짜리 유령을 집었다). 타일 범위 안팎 20px 창에서
//      **화소 수가 가장 많은** 덩어리를 `승리` 로 본다. 전투력 수치(주황)는 그 창 밖이라 안 섞인다.
//   ⑶ 초록 판은 **승자 쪽만** 이다(패자 쪽은 #cecece). 색으로 잡으면 자동으로 승자 판만 걸린다.
//
// 자기검증: 원본에서 초록 판·타일·주황 덩어리가 다 잡히고 타일이 44px 인지 본다. 어긋나면
//           수치를 인쇄하지 않고 **진단과 함께** exit 2 (측정기 고장을 통과로 뭉개지 않는다).
//
// 사용: node tools/probe-chat-win-badge.js [--selftest]
//   `--selftest` 는 교정 전 CSS(`bottom:-.008` · 스트로크 없음)를 그대로 주입해 **FAIL 이 실제로
//   나는지** 확인한다. 음성 대조 없는 새 PASS 는 믿지 말 것(저장소 규약).
// 종료코드 0=PASS / 1=불통과 / 2=측정기 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF = path.resolve(__dirname, '../ref/screens/shot-043500.png');
const VW = 499, VH = 892;          // 원본 컷과 같은 폭으로 맞춘다(자 정합)
const TOL = 2.0;                   // ±2%p
const RING_MIN = 55.0;             // 검정 링 커버리지 하한(원본 실측 64.3%)
const SELFTEST = process.argv.includes('--selftest');

// ── 원본/클론 공용 픽셀 스캔 (page 안에서 실행) ────────────────────────────────
const SCAN = async ([src]) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const W = c.width, H = c.height, D = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    const green = p => Math.abs(p[0] - 57) < 26 && Math.abs(p[1] - 171) < 26 && Math.abs(p[2] - 54) < 26;
    const orange = p => p[0] > 210 && p[1] > 100 && p[1] < 185 && p[2] < 90;
    const dark = p => (p[0] * .299 + p[1] * .587 + p[2] * .114) < 80;
    const bad = m => ({ err: m });

    // 승자 초록 판
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (green(at(x, y))) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return bad('초록 승자 판(#39ab36)을 못 찾음');

    // 타일 = 판 위의 '비초록 연속 구간'이 가장 넓은 행들 (함정 ⑴)
    const runs = [];
    for (let y = y0; y <= y1; y++) {
        let run = 0, best = 0;
        for (let x = x0; x <= x1; x++) { if (!green(at(x, y))) { run++; if (run > best) best = run; } else run = 0; }
        runs.push(best);
    }
    const wide = Math.max(...runs);
    if (wide < 20) return bad('아바타 타일을 못 찾음(최대 비초록 구간 ' + wide + 'px)');
    // 🚨 '가장 넓은 행 전부'로 잡으면 안 된다 — 전투력 줄(`⚔ 4.1t`)도 타일과 **똑같이 44px** 짜리
    //    연속 구간을 낸다(원본 오프셋 88). 첫 행~마지막 행으로 감싸면 타일 높이가 78px 로 나온다.
    //    그래서 문턱(최대폭의 75%) 이상인 행들을 **덩어리로 묶어 가장 긴 것**만 타일로 본다.
    //    ⚠️ 묶을 때 1~2행 구멍은 이어 준다 — 클론 아바타 그림에 초록 도트가 섞인 행이 있어
    //       (실측: 오프셋 41 에서 29px) 안 이으면 타일이 34px 로 잘린다.
    const TH = wide * .75;
    const blocks = []; let blk = null;
    for (let i = 0; i < runs.length; i++) {
        if (runs[i] >= TH) { if (blk && i - blk.b <= 3) blk.b = i; else { blk = { a: i, b: i }; blocks.push(blk); } }
    }
    if (!blocks.length) return bad('아바타 타일 행 덩어리를 못 찾음');
    const tile = blocks.sort((p, q) => (q.b - q.a) - (p.b - p.a))[0];
    const tTop = tile.a, tBot = tile.b, tileH = tBot - tTop + 1;

    // 주황 덩어리 — 타일 창 안에서 화소 수 최대 (함정 ⑵)
    const rowN = new Map();
    for (let y = y0; y <= y1; y++) {
        let n = 0;
        for (let x = x0; x <= x1; x++) if (orange(at(x, y))) n++;
        if (n) rowN.set(y - y0, n);
    }
    const ys = [...rowN.keys()].sort((a, b) => a - b);
    const groups = []; let cur = null;
    for (const dy of ys) {
        if (cur && dy - cur.b <= 3) { cur.b = dy; cur.n += rowN.get(dy); }
        else { cur = { a: dy, b: dy, n: rowN.get(dy) }; groups.push(cur); }
    }
    const win = groups.filter(G => G.a >= tTop - 4 && G.b <= tBot + 20).sort((a, b) => b.n - a.n)[0];
    if (!win) return bad('`승리` 주황 잉크 덩어리를 타일 창에서 못 찾음(덩어리 ' + groups.length + '개)');

    // 잉크 집합 + 링 커버리지
    const ink = new Set(); let ix0 = 1e9, ix1 = -1;
    for (let dy = win.a; dy <= win.b; dy++) for (let x = x0; x <= x1; x++) {
        const y = y0 + dy;
        if (orange(at(x, y))) { ink.add(y * W + x); if (x < ix0) ix0 = x; if (x > ix1) ix1 = x; }
    }
    let ring = 0, ringDark = 0;
    for (const k of ink) {
        const x = k % W, y = (k - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (ink.has(ny * W + nx)) continue;
            ring++; if (dark(at(nx, ny))) ringDark++;
        }
    }
    return {
        W, panel: [x0, y0, x1 - x0 + 1, y1 - y0 + 1],
        tileTop: tTop, tileBot: tBot, tileH,
        inkTop: win.a, inkBot: win.b, inkW: ix1 - ix0 + 1, inkN: win.n,
        topVsTile: win.a - tBot, botVsTile: win.b - tBot,
        ringPct: ring ? +(100 * ringDark / ring).toFixed(1) : 0,
    };
};

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], fails = [];
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    const die = (code, msg) => { console.log(msg); browser.close().then(() => process.exit(code)); };

    // ── 원본 ──────────────────────────────────────────────────────────────────
    // ⚠️ 원본 PNG 는 **base64 data URL** 로 넘긴다 — `file://` 이미지를 캔버스에 그리면 tainted 라
    //    getImageData 가 막힌다(저장소 규약, probe-pinfo-px 와 동일).
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && typeof Forge !== 'undefined' && UI.els && !!UI.els.equipSheet, null, { timeout: 90000 });
    const ref = await page.evaluate(SCAN, ['data:image/png;base64,' + fs.readFileSync(REF).toString('base64')]);
    if (ref.err) return die(2, '측정기 고장 (원본): ' + ref.err);
    if (ref.tileH < 40 || ref.tileH > 48) return die(2, '측정기 고장 (원본): 타일 높이 ' + ref.tileH + 'px (44 근처여야 함)');

    // ── 클론 ──────────────────────────────────────────────────────────────────
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29 && UI.els && !!UI.els.equipSheet, null, { timeout: 90000 });
    await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
    if (SELFTEST) {
        // 교정 전 상태 재현: 타일 안쪽으로 올리고 키라인을 없앤다
        await page.addStyleTag({ content: '.chat-share-label{bottom:calc(var(--app-w)*-.008)!important;-webkit-text-stroke:0!important}' });
    }
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; Combat.tick = function () {}; });
    await page.evaluate(() => UI.openChat());
    await page.waitForTimeout(600);
    const has = await page.evaluate(() => !!document.querySelector('.chat-share-side.win .chat-share-label'));
    if (!has) return die(2, '측정기 고장 (클론): 채팅에 전투 공유 카드가 없다(시드 확인)');
    const buf = await page.screenshot();
    const cl = await page.evaluate(SCAN, ['data:image/png;base64,' + buf.toString('base64')]);
    if (cl.err) return die(2, '측정기 고장 (클론): ' + cl.err);
    if (cl.tileH < 40 || cl.tileH > 48) return die(2, '측정기 고장 (클론): 타일 높이 ' + cl.tileH + 'px');

    // ── 판정 ──────────────────────────────────────────────────────────────────
    const pct = px => 100 * px / ref.W;
    const line = (label, r, c) => {
        const d = pct(c) - pct(r);
        const okd = Math.abs(d) <= TOL;
        if (!okd) fails.push(label + ' Δ' + d.toFixed(2) + '%p');
        console.log('  ' + (okd ? 'PASS' : 'FAIL') + '  ' + label.padEnd(28) +
            ' 원본 ' + String(r).padStart(4) + 'px(' + pct(r).toFixed(2) + '%W)' +
            ' · 클론 ' + String(c).padStart(4) + 'px(' + pct(c).toFixed(2) + '%W)' +
            ' · Δ' + (d >= 0 ? '+' : '') + d.toFixed(2) + '%p');
    };
    console.log('=== 채팅 전투 공유 `승리` 배지 — 원본 shot-043500 대조 (' + VW + 'x' + VH + ')' + (SELFTEST ? ' [selftest]' : '') + ' ===');
    console.log('  타일: 원본 판+' + ref.tileTop + '..' + ref.tileBot + '(' + ref.tileH + 'px) · 클론 판+' + cl.tileTop + '..' + cl.tileBot + '(' + cl.tileH + 'px)');
    line('잉크 상단 − 타일 하단', ref.topVsTile, cl.topVsTile);
    line('잉크 하단 − 타일 하단', ref.botVsTile, cl.botVsTile);
    line('잉크 폭', ref.inkW, cl.inkW);

    const ringOk = cl.ringPct >= RING_MIN;
    if (!ringOk) fails.push('검정 키라인 커버리지 ' + cl.ringPct + '% < ' + RING_MIN + '%');
    console.log('  ' + (ringOk ? 'PASS' : 'FAIL') + '  검정 키라인 커버리지        원본 ' + ref.ringPct + '% · 클론 ' + cl.ringPct + '% (하한 ' + RING_MIN + '%)');

    if (errs.length) fails.push('콘솔 에러 ' + errs.length + '건');
    console.log('  콘솔 에러 ' + errs.length + '건' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));

    console.log(fails.length ? '판정: FAIL — ' + fails.join(' · ') : '판정: PASS');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
