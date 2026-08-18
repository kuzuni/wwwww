// 리그 화면(shot-042149 / league) **판정** 프로브 — 원본 PNG 와 클론 캡처를 같은 픽셀 코드로 재고
// ±2%p 로 통과/불통과를 찍는다(전 UI 비율 전수 검증 패스, `ui-ratio-audit`).
//
// 왜 새로 만드나 — 이 화면에는 이미 도구가 넷 있는데 **판정을 내는 게 하나도 없다**:
//   `probe-league-dom.js` 는 클론 rect 를 JSON 으로 덤프만 하고(목표치 자체가 없다),
//   `probe-league-px.js` 는 원본만 스캔하며, 둘을 나란히 놓는 일은 사람이 눈으로 했다.
//   그래서 `probe-bands-all.js` 가 리그를 최대Δ 27.81%p 로 1위에 올려놓고도 **그게 진짜인지
//   오매칭인지 아무도 판정하지 못한 채**로 남아 있었다(2026-08-18 스윕 정정 메모 참조).
//
// 무엇을 재나 — 색으로 확실히 분리되는 하단 3요소를 **연결 성분**으로 잡는다:
//   ⓐ 회색 고정 밴드 ⓑ 그 안의 파란 [내 순위] 고정 행 ⓒ 파란 [도전] 버튼 ⓓ 빨간 뒤로 버튼.
//   🚨 **연결 성분이어야 한다** — 단순 색 마스크의 bbox 로 회색을 잡으면 랭킹 행 안의 **밝은 아바타**가
//      같이 걸려 밴드 상단을 38px 위로 읽는다(`probe-league-px.js` 머리말의 `grayFoot` 오염 사고,
//      그 값을 좇아 고쳤다가 밴드가 2.1%p 올라간 적이 있다). 성분으로 잡으면 아바타는 따로 떨어져 나간다.
//      이 프로브가 원본에서 내는 밴드 상단이 **667px(74.44%H)** 이면 그 사고가 재발하지 않은 것이다.
//
// 클론 상태는 `shot-screens.js` 의 league 오프너 경로를 그대로 재현한다(시드 → 리로드 → 탭·모달 정리
// → `UI.openLeague()`).
//
// 사용: PW_PATH=<playwright> node tools/probe-league-verdict.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042149.png');
const TOL = 2;

const MEASURE = (async (srcs) => {
    const out = [];
    for (const src of srcs) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const W = img.width, H = img.height, d = g.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const gray = (x, y) => { const p = at(x, y); return p[0] >= 150 && p[0] <= 215 && Math.max(...p) - Math.min(...p) <= 12; };
        const blue = (x, y) => { const p = at(x, y); return p[2] >= 150 && p[2] - p[0] >= 70 && p[2] - p[1] >= 40; };
        const red = (x, y) => { const p = at(x, y); return p[0] >= 140 && p[0] - p[1] >= 70 && p[0] - p[2] >= 70; };
        // 4-연결 성분 목록 (크기 내림차순). 창(win)을 주면 그 안에서만 훑는다.
        const comps = (test, win) => {
            const [X0, Y0, X1, Y1] = win || [0, 0, W, H];
            const seen = new Uint8Array(W * H), res = [];
            for (let y0 = Y0; y0 < Y1; y0++) for (let x0 = X0; x0 < X1; x0++) {
                const i0 = y0 * W + x0;
                if (seen[i0] || !test(x0, y0)) continue;
                const st = [i0]; seen[i0] = 1;
                let n = 0, a = W, b = -1, t = H, u = -1;
                while (st.length) {
                    const i = st.pop(); n++;
                    const x = i % W, y = (i - x) / W;
                    if (x < a) a = x; if (x > b) b = x; if (y < t) t = y; if (y > u) u = y;
                    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                        const nx = x + dx, ny = y + dy;
                        if (nx < X0 || ny < Y0 || nx >= X1 || ny >= Y1) continue;
                        const ni = ny * W + nx;
                        if (!seen[ni] && test(nx, ny)) { seen[ni] = 1; st.push(ni); }
                    }
                }
                res.push({ n, left: a, right: b + 1, top: t, bottom: u + 1 });
            }
            return res.sort((p, q) => q.n - p.n);
        };
        const band = comps(gray)[0];
        if (!band) { out.push({ err: '회색 밴드를 못 찾음' }); continue; }
        const win = [0, band.top, W, band.bottom];
        // 밴드 안 파란 덩어리 둘 = 위가 고정 행, 아래가 [도전] 버튼.
        const bl = comps(blue, win).slice(0, 2).sort((p, q) => p.top - q.top);
        const rd = comps(red, win)[0] || null;
        out.push({ W, H, band, pinned: bl[0] || null, cta: bl[1] || null, back: rd });
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
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 150000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 150000 });
    await page.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        const bw = document.getElementById('boss-warning'); if (bw) bw.classList.add('hidden');
        const df = document.getElementById('dmg-flash'); if (df) { df.classList.remove('on'); df.style.display = 'none'; }
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        try { UI.switchTab && UI.switchTab(null); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => UI.openLeague());
    // 헤드리스에서 팝업 등장 애니메이션이 중간 프레임(scale≈.69)에 얼어붙는다 — 전부 끈다.
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(500);
    const shot = await page.screenshot({ timeout: 180000 });

    const [ref, clone] = await page.evaluate(MEASURE, [dataUrl(REF_PNG), 'data:image/png;base64,' + shot.toString('base64')]);
    if (ref.err || clone.err) { console.log('측정 실패:', ref.err || '', clone.err || ''); await browser.close(); process.exit(2); }

    const pct = (m, v, u) => +(v / (u === 'W' ? m.W : m.H) * 100).toFixed(2);
    const ROWS = [
        ['밴드 상단', 'H', m => m.band.top], ['밴드 하단', 'H', m => m.band.bottom], ['밴드 높이', 'H', m => m.band.bottom - m.band.top],
        ['고정행 좌', 'W', m => m.pinned.left], ['고정행 폭', 'W', m => m.pinned.right - m.pinned.left],
        ['고정행 상단', 'H', m => m.pinned.top], ['고정행 높이', 'H', m => m.pinned.bottom - m.pinned.top],
        ['도전 좌', 'W', m => m.cta.left], ['도전 우', 'W', m => m.cta.right], ['도전 폭', 'W', m => m.cta.right - m.cta.left],
        ['도전 상단', 'H', m => m.cta.top], ['도전 높이', 'H', m => m.cta.bottom - m.cta.top],
        ['뒤로 좌', 'W', m => m.back.left], ['뒤로 폭', 'W', m => m.back.right - m.back.left],
        ['뒤로 상단', 'H', m => m.back.top], ['뒤로 높이', 'H', m => m.back.bottom - m.back.top],
    ];
    console.log(`\n리그(shot-042149) — 원본 ${ref.W}×${ref.H} vs 클론 ${clone.W}×${clone.H} · 같은 픽셀 코드\n`);
    console.log('요소'.padEnd(14) + '단위'.padStart(4) + '원본'.padStart(9) + '클론'.padStart(9) + 'Δ%p'.padStart(9) + '  판정');
    let worst = 0; const ng = [];
    for (const [label, unit, get] of ROWS) {
        if (!ref.pinned || !clone.pinned || !ref.cta || !clone.cta || !ref.back || !clone.back) { console.log('요소 누락 — 원본/클론 중 한쪽에서 파랑/빨강 덩어리를 못 찾았다'); break; }
        const a = pct(ref, get(ref), unit), b = pct(clone, get(clone), unit), dd = +(b - a).toFixed(2);
        if (Math.abs(dd) > Math.abs(worst)) worst = dd;
        const ok = Math.abs(dd) <= TOL;
        if (!ok) ng.push(`${label} ${dd > 0 ? '+' : ''}${dd}%p`);
        console.log(label.padEnd(12) + `%${unit}`.padStart(4) + a.toFixed(2).padStart(9) + b.toFixed(2).padStart(9) + `${dd > 0 ? '+' : ''}${dd}`.padStart(9) + (ok ? '  ok' : `  ← ±${TOL}%p 초과`));
    }
    console.log(`\n최대 편차 ${worst > 0 ? '+' : ''}${worst}%p · 초과 ${ng.length}건${ng.length ? ': ' + ng.join(', ') : ''}`);
    console.log(`판정: ${ng.length ? '불통과' : '통과'}`);
    console.log(`(원본 밴드 y${ref.band.top}~${ref.band.bottom} · 클론 y${clone.band.top}~${clone.band.bottom} — 원본 상단이 667 이 아니면 회색 마스크가 아바타에 오염된 것이다)`);
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : '(콘솔 에러 0건)');
    await browser.close();
    process.exit(ng.length || errors.length ? 1 : 0);
})();
