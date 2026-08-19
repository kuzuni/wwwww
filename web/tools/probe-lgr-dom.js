// 리그 보상 팝업(shot-042208 / league-rewards) 요소 실측 — '전 UI 비율 전수 검증 패스'(ui-ratio-audit).
//
// 규약은 probe-tn-dom.js 와 같다: **원본 PNG 스캔 + 클론 DOM rect 를 한 런에서** 낸다
// (등재 수치를 베끼면 이미 해소된 편차를 좇는다 — 인계 메모 함정 ㉡).
//
// 🚨 이 화면이 늦게까지 미실측으로 남았던 이유: 예전 구현이 `leagueModal.innerHTML` 을 갈아끼워
//    **리그 시트를 지우고** 팝업만 그렸다. 원본은 시트 위에 겹쳐 뜬 팝업이라 배경부터 달랐고
//    비율 대조가 성립하지 않았다. 지금은 `renderLeagueBoard()` + `.lgr-overlay` 로 겹쳐 뜬다
//    (그 교정이 끝났는지도 이 프로브가 같이 확인한다 — 뒤 시트가 없으면 exit 2).
//
// 재는 요소: 리본(빨강 배너) 좌/폭/상단/높이 · 흰 표 좌/폭/상단/높이 · 수집 알약 상단/높이 ·
//            ✕ 원 지름/중심x/상단.
// 미판정(내용 차이): 보상 pill 안 숫자·아이콘 화풍, 표에 보이는 줄 수(스크롤 위치).
//
// 사용: node tools/probe-lgr-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042208.png');
const TOL = 2.0;

const SCAN = (async (src) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const W = img.width, H = img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const comps = (pred, x1, y1, x2, y2) => {
        const lab = new Int32Array(W * H).fill(-1); const list = [];
        for (let yy = y1; yy <= y2; yy++) for (let xx = x1; xx <= x2; xx++) {
            const i0 = yy * W + xx;
            if (lab[i0] !== -1 || !pred(xx, yy)) continue;
            const id = list.length, st = [i0]; lab[i0] = id;
            let n = 0, a = W, b = -1, t = H, bo = -1;
            while (st.length) {
                const i = st.pop(); n++; const x = i % W, y = (i - x) / W;
                if (x < a) a = x; if (x > b) b = x; if (y < t) t = y; if (y > bo) bo = y;
                for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < x1 || nx > x2 || ny < y1 || ny > y2) continue;
                    const ni = ny * W + nx;
                    if (lab[ni] === -1 && pred(nx, ny)) { lab[ni] = id; st.push(ni); }
                }
            }
            list.push({ n, x1: a, x2: b, y1: t, y2: bo });
        }
        return list;
    };
    // ── 앱 폭: 이 컷은 팝업 딤이 화면 전체를 덮어 '바탕색과 다른 최장 구간'이 안 통한다.
    //    대신 **가장 위 행**(상단바 위 여백)이 아니라 **딤이 덮은 앱 영역 자체**를 쓴다 —
    //    이미지 좌우 끝이 앱 밖이면 그 열은 전 행이 같은 한 색이다(캡처 기기 띠).
    let appL = 0, appR = W - 1;
    const colUniform = (x) => {
        const p0 = at(x, 0);
        for (let y = 1; y < H; y += 3) { const p = at(x, y); if (Math.abs(p[0] - p0[0]) + Math.abs(p[1] - p0[1]) + Math.abs(p[2] - p0[2]) > 12) return false; }
        return true;
    };
    while (appL < W * 0.05 && colUniform(appL)) appL++;
    while (appR > W * 0.95 && colUniform(appR)) appR--;
    const AW = appR - appL + 1;

    const red = (x, y) => { const p = at(x, y); return p[0] > 175 && p[1] < 90 && p[2] < 90; };
    const white = (x, y) => { const p = at(x, y); return Math.min(...at(x, y)) >= 238 && Math.max(...p) - Math.min(...p) <= 10; };
    const green = (x, y) => { const p = at(x, y); return p[1] > 120 && p[1] - p[0] > 40 && p[1] - p[2] > 40; };

    const reds = comps(red, appL, 0, appR, H - 1).filter(r => r.n > 400).sort((a, b) => b.n - a.n);
    // 리본 = 위쪽 빨강 중 가장 넓은 것 / ✕ = 아래쪽(이미지 하단 25%) 빨강 중 가장 큰 것
    const banner = reds.filter(r => r.y1 < H * 0.4).sort((a, b) => (b.x2 - b.x1) - (a.x2 - a.x1))[0] || null;
    const xbtn = reds.filter(r => r.y1 > H * 0.72).sort((a, b) => b.n - a.n)[0] || null;
    const table = comps(white, appL, 0, appR, H - 1).filter(r => r.n > 2000).sort((a, b) => b.n - a.n)[0] || null;
    // 수집 알약은 **초록 테두리 + 어두운 면**이라 초록 화소가 얇다 — 임계 300 이면 안 잡힌다(첫 판 null).
    const pill = comps(green, appL, 0, appR, H - 1).filter(r => r.n > 100).sort((a, b) => (b.x2 - b.x1) - (a.x2 - a.x1))[0] || null;
    return { W, H, appL, appR, AW, banner, xbtn, table, pill };
});

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof League !== 'undefined', null, { timeout: 90000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 90000 });

    const ref = await page.evaluate(SCAN, 'data:image/png;base64,' + fs.readFileSync(REF_PNG).toString('base64'));

    await page.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { };
        UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();
        UI.openLeague(); UI.openLeagueRewards();
    });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(900);

    const clone = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const R = e => { const r = e.getBoundingClientRect(); return { x: r.x - app.x, y: r.y - app.y, w: r.width, h: r.height }; };
        const q = s => { const e = document.querySelector(s); return e && e.offsetParent !== null ? R(e) : null; };
        return {
            app: { w: app.width, h: app.height },
            banner: q('.lgr-overlay .league-reward-banner'),
            table: q('.lgr-overlay .league-reward-table'),
            pill: q('.lgr-overlay .league-collect-pill'),
            xbtn: q('.lgr-overlay .x-btn'),
            // 원본은 팝업 **뒤에 리그 시트가 그대로 남아** 딤만 덮인다 — 시트가 없으면 배경부터 달라
            // 비율 대조가 성립하지 않는다(예전 구현이 그랬다). 존재 여부만 확인한다.
            board: !!document.querySelector('#league-modal .league-list'),
        };
    });
    await browser.close();

    console.log(`원본 ${ref.W}×${ref.H} · 앱 x${ref.appL}~${ref.appR}(폭 ${ref.AW}) / 클론 앱 ${clone.app.w.toFixed(1)}×${clone.app.h.toFixed(1)}`);
    console.log(`원본 리본 ${JSON.stringify(ref.banner)}\n원본 흰 표 ${JSON.stringify(ref.table)}\n원본 수집 알약 ${JSON.stringify(ref.pill)}\n원본 ✕ ${JSON.stringify(ref.xbtn)}`);

    const bad = [];
    if (!ref.banner || ref.banner.x2 - ref.banner.x1 < ref.AW * 0.5) bad.push('원본 리본을 못 잡았다');
    if (!ref.table || ref.table.x2 - ref.table.x1 < ref.AW * 0.4) bad.push('원본 흰 표를 못 잡았다');
    if (!ref.xbtn) bad.push('원본 ✕ 를 못 잡았다');
    if (!clone.banner || !clone.table || !clone.xbtn) bad.push('클론 셀렉터 실패(리본/표/✕)');
    if (!clone.board) bad.push('클론 팝업 뒤에 리그 시트가 없다 — 겹쳐 뜨기 교정이 풀렸다');
    if (bad.length) { console.log('\n=> 측정기 고장(exit 2): ' + bad.join(' · ')); process.exit(2); }

    const rw = v => (v / ref.AW) * 100, rh = v => (v / ref.H) * 100;
    const cw = v => (v / clone.app.w) * 100, ch = v => (v / clone.app.h) * 100;
    const rows = [];
    const add = (name, a, b) => rows.push({ name, a, b, d: b - a });
    add('리본 좌', rw(ref.banner.x1 - ref.appL), cw(clone.banner.x));
    add('리본 폭', rw(ref.banner.x2 + 1 - ref.banner.x1), cw(clone.banner.w));
    add('리본 상단', rh(ref.banner.y1), ch(clone.banner.y));
    add('리본 높이', rh(ref.banner.y2 + 1 - ref.banner.y1), ch(clone.banner.h));
    add('흰 표 좌', rw(ref.table.x1 - ref.appL), cw(clone.table.x));
    add('흰 표 폭', rw(ref.table.x2 + 1 - ref.table.x1), cw(clone.table.w));
    add('흰 표 상단', rh(ref.table.y1), ch(clone.table.y));
    add('흰 표 높이', rh(ref.table.y2 + 1 - ref.table.y1), ch(clone.table.h));
    if (!ref.pill || !clone.pill) console.log('⚠️ 수집 알약 미검출(원본 ' + !!ref.pill + ' / 클론 ' + !!clone.pill + ') — 그 두 줄 미판정');
    if (ref.pill && clone.pill) {
        add('수집 알약 상단', rh(ref.pill.y1), ch(clone.pill.y));
        add('수집 알약 높이', rh(ref.pill.y2 + 1 - ref.pill.y1), ch(clone.pill.h));
    }
    add('✕ 지름', rw(ref.xbtn.x2 + 1 - ref.xbtn.x1), cw(clone.xbtn.w));
    add('✕ 중심x', rw((ref.xbtn.x1 + ref.xbtn.x2) / 2 - ref.appL), cw(clone.xbtn.x + clone.xbtn.w / 2));
    add('✕ 상단', rh(ref.xbtn.y1), ch(clone.xbtn.y));

    console.log('\n요소별 대조 (원본 → 클론, Δ%p · 기준 ±2.0%p):');
    let fails = 0;
    for (const r of rows) {
        const ok = Math.abs(r.d) <= TOL;
        if (!ok) fails++;
        console.log(`  ${r.name.padEnd(12)} 원본 ${r.a.toFixed(2).padStart(6)}  클론 ${r.b.toFixed(2).padStart(6)}  Δ ${(r.d >= 0 ? '+' : '') + r.d.toFixed(2)}%p  ${ok ? 'OK' : 'FAIL'}`);
    }
    console.log(`\n콘솔/페이지 에러: ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`=> ${fails === 0 && errors.length === 0 ? 'PASS' : `불통과 ${fails}건`}`);
    process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
})();
