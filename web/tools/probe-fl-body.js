// '모든 장비의 목록'(shot-042905 / forge-list) **본문** 실측 — 그리드 패널·타일 격자·X 버튼을
// 원본 PNG 와 클론 캡처에 **같은 픽셀 코드**로 재서 대조한다(전 UI 비율 전수 검증, `ui-ratio-audit`).
// 헤더 막대(시대 필)는 probe-fl-head.js 가 이미 판정한다 — 여기는 그 아래(본문)를 맡는다.
//
// 🚨 자(단위)는 probe-fl-head.js 와 같은 **흰 카드 폭(%CW)** 이다 — 이 컷은 앱이 좌우로 잘려
//    이미지 폭 ≠ 앱 폭이라 이미지 %W 로 나누면 통째로 어긋난다(그쪽 머리말 참조). 카드는 앞
//    세션이 앱 71.3%W 로 맞춰 둔 공통 요소다. 그래서 판정 허용치도 앱 ±2%p 를 카드 단위로
//    환산한 **±2.8%CW**(= 2 / 0.713) 를 쓴다. 세로 항목은 이 자가 앱 %H ±2%p 보다 엄격하다
//    — 세로에서 2.8 을 살짝 넘는 값이 나오면 결함 등재 전에 앱 %H 로 환산해 볼 것.
//
// 🚨 판정하지 않는 것(내용 차이 — 비율 결함이 아니다):
//  · **타일 개수**: 원본 원시적 시대는 23종(5·5·5·5·3), 클론은 30종(6행) — 장비 로스터는
//    gamedata/equip-design 계열(3D 스트림 크로스컷) 도메인이라 여기서 세지 않는다.
//    개수가 다르니 **패널 높이·파란 '중세의' 필 위치·카드 세로 내부 배분도 미판정**이다
//    (첫 두 행의 격자 기하만 잰다 — 그건 개수와 무관하다).
//  · 타일 속 썸네일 화풍(원본 픽셀 아이콘 vs 클론 3D 썸네일) — equip-design 계열.
//  · 백드롭(원본은 확률 정보 시트가 비치고 클론은 본대 화면) — 카드 밖이라 이 프로브 무관.
//
// 측정 방식(원본 탐색으로 검증):
//  · 카드 = 최대 흰(≥238·채도차≤8) 4-연결 성분. 팔레트 실측: 카드 255 · 시대 필 224 ·
//    패널 214 · **타일 채움 224**(흰색이 아니다! 흰 성분으로 타일을 찾으면 0개가 나온다 — 밟았다).
//  · 패널 = 카드 안 최대 '회색'(채도차≤12·밝기 190~237) 성분 — 타일 채움도 같은 회색대지만
//    타일 테두리(어두움)가 갈라 놓아 패널 성분에 안 섞인다.
//  · 타일 = 패널 bbox 안에서 '패널보다 밝은 회색'(밝기 ≥ 패널최빈+5) 성분들. 아이콘(유채색)은
//    채움에 둘러싸인 구멍이라 bbox 를 안 깨되, 아이콘이 테두리에 닿아 채움이 쪼개질 수 있어
//    **최빈 크기 ±4px 인 성분만** 격자 통계에 쓴다(쪼개진 조각은 자연히 빠진다).
//  · X 버튼 = 카드 하단 ±50px · 중앙 ±20%CW 창 안의 최대 빨강(r>190·g<90·b<90) 성분.
//    별 배지(주황 g≈150)와 아이템 아이콘의 빨강은 창 밖이라 안 걸린다.
//
// 사용: node tools/probe-fl-body.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042905.png');
const TOL = 2.8;   // 앱 ±2%p 를 카드 폭 단위로 환산(2 / 0.713)

const MEASURE = (async (srcs) => {
    const out = [];
    for (const src of srcs) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const chroma = p => Math.max(...p) - Math.min(...p);
        const bright = p => Math.max(...p);
        // 4-연결 성분 일반화
        const comps = (pred, x1, y1, x2, y2) => {
            const lab = new Int32Array(W * H).fill(-1);
            const list = [];
            for (let yy = y1; yy <= y2; yy++) for (let xx = x1; xx <= x2; xx++) {
                const i0 = yy * W + xx;
                if (lab[i0] !== -1 || !pred(xx, yy)) continue;
                const id = list.length, st = [i0]; lab[i0] = id;
                let n = 0, a = W, b2 = -1, t = H, bo = -1;
                while (st.length) {
                    const i = st.pop(); n++;
                    const x = i % W, y = (i - x) / W;
                    if (x < a) a = x; if (x > b2) b2 = x; if (y < t) t = y; if (y > bo) bo = y;
                    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < x1 || nx > x2 || ny < y1 || ny > y2) continue;
                        const ni = ny * W + nx;
                        if (lab[ni] === -1 && pred(nx, ny)) { lab[ni] = id; st.push(ni); }
                    }
                }
                list.push({ n, x1: a, x2: b2, y1: t, y2: bo });
            }
            return list;
        };
        const white = (x, y) => { const p = at(x, y); return Math.min(...p) >= 238 && chroma(p) <= 8; };
        const cardC = comps(white, 0, 0, W - 1, H - 1).sort((a, b) => b.n - a.n)[0];
        if (!cardC) { out.push({ err: '카드 없음' }); continue; }
        const card = { x1: cardC.x1, x2: cardC.x2, y1: cardC.y1, y2: cardC.y2 };
        const grey = (x, y) => { const p = at(x, y); return chroma(p) <= 12 && bright(p) >= 190 && bright(p) <= 237; };
        const greys = comps(grey, card.x1, card.y1, card.x2, card.y2).sort((a, b) => b.n - a.n);
        const panel = greys[0];
        if (!panel) { out.push({ err: '패널 없음' }); continue; }
        // 패널 최빈 밝기(패널 성분 안 샘플)
        const bcnt = new Map();
        for (let y = panel.y1; y <= panel.y2; y += 2) for (let x = panel.x1; x <= panel.x2; x += 2) {
            const p = at(x, y);
            if (chroma(p) <= 12 && bright(p) >= 190 && bright(p) <= 237) {
                const b2 = bright(p); bcnt.set(b2, (bcnt.get(b2) || 0) + 1);
            }
        }
        let panelB = 214, pbc = 0;
        for (const [k, v] of bcnt) if (v > pbc) { pbc = v; panelB = k; }
        const fill = (x, y) => { const p = at(x, y); return chroma(p) <= 12 && bright(p) >= panelB + 5 && bright(p) <= 250; };
        const raw = comps(fill, panel.x1, panel.y1, panel.x2, panel.y2).filter(t => t.n > 150);
        const mode = arr => { const m = new Map(); let bv = null, bc2 = 0; for (const v of arr) { const n = (m.get(v) || 0) + 1; m.set(v, n); if (n > bc2) { bc2 = n; bv = v; } } return bv; };
        const wm = mode(raw.map(t => t.x2 + 1 - t.x1)), hm = mode(raw.map(t => t.y2 + 1 - t.y1));
        const tiles = raw.filter(t => Math.abs(t.x2 + 1 - t.x1 - wm) <= 4 && Math.abs(t.y2 + 1 - t.y1 - hm) <= 4)
            .sort((a, b) => (a.y1 - b.y1) || (a.x1 - b.x1));
        if (!tiles.length) { out.push({ err: '타일 없음' }); continue; }
        const firstY = tiles[0].y1;
        const row1 = tiles.filter(t => Math.abs(t.y1 - firstY) <= 4).sort((a, b) => a.x1 - b.x1);
        const colPitch = row1.length >= 2 ? mode(row1.slice(1).map((t, i) => t.x1 - row1[i].x1)) : null;
        const col1 = tiles.filter(t => Math.abs(t.x1 - row1[0].x1) <= 4).sort((a, b) => a.y1 - b.y1);
        const rowPitch = col1.length >= 2 ? mode(col1.slice(1).map((t, i) => t.y1 - col1[i].y1)) : null;
        // X 버튼(카드 하단 중앙 창)
        const cx = (card.x1 + card.x2) / 2, cw = card.x2 + 1 - card.x1;
        const redP = (x, y) => { const p = at(x, y); return p[0] > 190 && p[1] < 90 && p[2] < 90; };
        const xw = Math.round(cw * 0.2);
        const reds = comps(redP,
            Math.max(0, Math.round(cx - xw)), Math.max(0, card.y2 - 50),
            Math.min(W - 1, Math.round(cx + xw)), Math.min(H - 1, card.y2 + 50)).sort((a, b) => b.n - a.n);
        const xbtn = reds[0] || null;
        out.push({
            W, H, card, cw,
            panel: { x1: panel.x1, x2: panel.x2, y1: panel.y1, y2: panel.y2 },
            tileW: wm, tileH: hm, colPitch, rowPitch,
            t0: { x: row1[0].x1, y: row1[0].y1 },
            row1N: row1.length, tileN: tiles.length, rawN: raw.length,
            xbtn: xbtn && { x1: xbtn.x1, x2: xbtn.x2, y1: xbtn.y1, y2: xbtn.y2 },
        });
    }
    return out;
});

const dataUrl = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    // 캡처 오염원 무력화 — shot-screens.js 전체 목록(토스트·보스경고·비네트 + 자동 제련 팝업·코인)
    await page.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        const bw = document.getElementById('boss-warning'); if (bw) bw.classList.add('hidden');
        const df = document.getElementById('dmg-flash'); if (df) { df.classList.remove('on'); df.style.display = 'none'; }
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
        UI.clearPendingCraft(); UI.renderEquipSheet();
        UI.coinBurst = () => { };
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => { UI.openForgeInfo(); UI.openForgeList(); });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(500);
    const shot = await page.screenshot({ timeout: 180000 });

    const [ref, clone] = await page.evaluate(MEASURE,
        [dataUrl(REF_PNG), 'data:image/png;base64,' + shot.toString('base64')]);
    if (ref.err || clone.err) {
        console.log('측정 실패:', ref.err || '', clone.err || '');
        await browser.close();
        process.exit(2);
    }
    console.log(`\n장비 목록 본문(shot-042905) — 원본 ${ref.W}×${ref.H} 카드폭 ${ref.cw} vs 클론 ${clone.W}×${clone.H} 카드폭 ${clone.cw} · 같은 픽셀 코드`);
    console.log(`원본 타일 ${ref.tileN}(1행 ${ref.row1N}) · 클론 타일 ${clone.tileN}(1행 ${clone.row1N}) — 개수는 내용 차이라 미판정(머리말)\n`);
    const pctCW = (m, v) => +(v / m.cw * 100).toFixed(2);
    const ROWS = [
        ['패널 좌', m => m.panel.x1 - m.card.x1],
        ['패널 우 여백', m => m.card.x2 - m.panel.x2],
        ['패널 상단(카드 기준)', m => m.panel.y1 - m.card.y1],
        ['타일 채움 폭', m => m.tileW],
        ['타일 채움 높이', m => m.tileH],
        ['열 피치', m => m.colPitch],
        ['행 피치', m => m.rowPitch],
        ['1타일 좌(패널 기준)', m => m.t0.x - m.panel.x1],
        ['1타일 상단(패널 기준)', m => m.t0.y - m.panel.y1],
    ];
    if (ref.xbtn && clone.xbtn) {
        ROWS.push(
            ['X 지름', m => m.xbtn.x2 + 1 - m.xbtn.x1],
            ['X 중심 x(카드중심 기준)', m => (m.xbtn.x1 + m.xbtn.x2) / 2 - (m.card.x1 + m.card.x2) / 2],
            ['X 상단(카드하단 기준)', m => m.xbtn.y1 - m.card.y2],
        );
    } else console.log(`⚠️ X 버튼 미검출(원본 ${!!ref.xbtn} / 클론 ${!!clone.xbtn}) — X 항목 미판정`);
    console.log('요소'.padEnd(18) + '원본'.padStart(9) + '클론'.padStart(9) + 'Δ%CW'.padStart(9) + '  판정  (단위: 카드폭 %)');
    let worst = 0; const ng = [];
    for (const [label, get] of ROWS) {
        const ra = get(ref), rb = get(clone);
        if (ra == null || rb == null) { console.log(label.padEnd(18) + '  — 측정 불가(미판정)'); continue; }
        const a = pctCW(ref, ra), b = pctCW(clone, rb);
        const dd = +(b - a).toFixed(2);
        if (Math.abs(dd) > Math.abs(worst)) worst = dd;
        const ok = Math.abs(dd) <= TOL;
        if (!ok) ng.push(`${label} ${dd > 0 ? '+' : ''}${dd}%CW`);
        console.log(label.padEnd(18) + a.toFixed(2).padStart(9) + b.toFixed(2).padStart(9) + `${dd > 0 ? '+' : ''}${dd}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%CW 초과`));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%CW · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(`판정: ${ng.length ? '불통과' : '통과'}`);
    console.log(`(원본 카드 x${ref.card.x1}~${ref.card.x2} y${ref.card.y1}~${ref.card.y2} · 클론 x${clone.card.x1}~${clone.card.x2} y${clone.card.y1}~${clone.card.y2})`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
