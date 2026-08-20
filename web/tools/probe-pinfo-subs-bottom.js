// 플레이어 정보 팝업(shot-043313) 스탯 목록의 **아랫끝** 비율 대조 —
// 'ui-ratio-audit'(전 UI 비율 전수 검증 패스)의 화면별 실측기.
//
// 📌 **짝 도구와 역할이 다르다 — 겹치지 말 것.**
//   · `probe-pinfo-px.js`   = 장비 그리드 / 오브 줄(목록 **위**)의 비율.
//   · `probe-pinfo-loadout.js` = 오브 3종이 서로 같은 지름인지(원본과 무관한 QA).
//   · 이 도구 = 스탯 목록(`.pinfo-subs-list`)의 **아랫끝이 카드 안 어디서 끊기는가**.
//     목록의 위(줄 피치·좌 인셋)는 style.css 주석에 실측이 있지만 **아랫끝을 보는 자는 없었다**
//     — 그래서 +8.46%p 짜리 어긋남을 두고도 전수 스윕이 조용히 초록이었다
//     (`probe-pets-timer-px`·`probe-equipped-label` 과 같은 계열의 사각지대다).
//
// ══════════════════════════════════════════════════════════════════════════════
// 🚨 **원본만 픽셀, 클론은 DOM.** 이 자리에서 앞 세션이 "DOM 과 캡처가 서로 다른 말을 한다"며
//    판정을 보류했는데, 갈라 보니 **틀린 쪽은 캡처 자**였다. 클론 카드의 종이 스킨
//    (`#fff→#efeef2` + 결)이 흰 화소 술어를 죽여 카드 하단이 y703 에서 끊긴다(DOM 은 753.2) —
//    그 아래를 아예 안 보므로 목록 아랫끝이 잡히지 않는다. 이 저장소가 `probe-pinfo-px`·
//    `probe-lc-dom` 에서 이미 두 번 밟은 고장이라 규약대로 클론은 DOM rect 로 잰다.
//    ⚠️ 이 도구를 '픽셀 대 픽셀'로 되돌리지 말 것 — 되돌리면 같은 고장이 재발한다.
//
// 🚨 **줄 개수 차이로 기각되는 건이 아니다**(원본 7줄 ↔ 클론 10~12줄). forge-list 타일 23↔30 과
//    다르다: 이 목록은 `flex:1` 이라 상자 높이가 **내용이 아니라 플렉스 배분**으로 정해진다.
//    실측 증거 — 시드를 안 먹여 자식이 1개(13.2px)뿐일 때도 상자는 그대로 148px 로 늘어났다.
//    그래서 아랫끝은 내용과 무관한 레이아웃 값이고 비율 판정 대상이 맞다.
//
// ⚠️ **원본도 마지막 줄이 세로로 잘려 있다**(확대 크롭에서 글리프가 가로로 끊긴다) — 원본 역시
//    스크롤 상자다. '잘리니까 결함'이 아니라 **잘리는 자리의 높이**가 판정 대상이다.
// ══════════════════════════════════════════════════════════════════════════════
//
// 🚨 원본(REF) 스캔의 측정 함정 — 밟은 것만 적는다:
//   ⑴ 카드 행을 '최장 흰 **런**'으로 잡으면 **글자가 촘촘한 스탯 목록 줄에서 런이 끊겨** 카드가
//      목록 **아래 조각**(y650~751)만으로 잡힌다(실측). 흰 화소 **개수**로 볼 것.
//   ⑵ 카드 하단에 반쯤 걸친 **✕ 버튼(빨간 원)** 이 '어두운 잉크 띠'로 같이 잡힌다 — 글자 줄은
//      가로로 넓고 ✕ 는 좁은 원이라 **잉크 띠의 가로 폭**(카드 폭의 30%)으로 가른다.
//   ⑶ 스캔 구간은 카드의 **아래쪽 흰 덩어리**다(위쪽 장비 그리드·오브 줄은 컬러라 흰 개수 문턱에
//      안 걸려 애초에 빠진다) — 그래서 여기서 잡히는 글자 띠는 곧 스탯 줄이다.
//
// 자기검증: 원본에서 ⓐ 흰 카드가 잡히고 ⓑ 그 안 글자 줄 띠가 **5개 이상**이며 ⓒ 마지막 띠 아래
//           흰 여백이 실제로 남는지(>0) 본다. 어긋나면 수치를 인쇄하지 않고 **진단과 함께** exit 2.
//           클론은 `.pinfo-subs-list`·카드가 실제로 잡히고 목록이 카드 안에 있는지 본다.
//
// 사용: node tools/probe-pinfo-subs-bottom.js [--selftest]
//   `--selftest` 는 `margin-bottom` 을 0 으로 되돌려 **FAIL 이 실제로 나는지** 확인한다
//   (게이트가 헐거워서 통과하는 게 아님을 보이는 용도 — probe-profile-dom 규약).
// 종료코드 0=PASS(±2%p 초과 0건 · 콘솔 에러 0건) / 1=비율 초과 / 2=측정기 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const ROOT = path.resolve(__dirname, '..');
const REF_PNG = path.resolve(ROOT, 'ref/screens/shot-043313.png');
const SELFTEST = process.argv.includes('--selftest');
const GATE = 2;                       // ±2%p (항목 규약)
const VPS = [[499, 892], [430, 932], [390, 844]];   // 캡처 뷰포트 + 대표 폰 2종

const dataUrl = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

// ── 원본 픽셀 스캔 ────────────────────────────────────────────────────────────
async function scanRef(page) {
    return page.evaluate(async (url) => {
        const img = new Image(); img.src = url; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const D = g.getImageData(0, 0, c.width, c.height).data;
        const W = c.width, H = c.height;
        const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
        const white = (x, y) => { const [r, gg, b] = at(x, y); return r >= 214 && gg >= 214 && b >= 214 && (Math.max(r, gg, b) - Math.min(r, gg, b)) <= 22; };

        // ⑴ 흰 화소 **개수**로 카드 행을 잡는다(런으로 잡으면 글자 줄에서 끊긴다)
        const rows = [];
        for (let y = 0; y < H; y++) {
            let n = 0, f = -1, l = -1;
            for (let x = 0; x < W; x++) if (white(x, y)) { n++; if (f < 0) f = x; l = x; }
            rows.push({ y, n, f, l });
        }
        const on = rows.filter(r => r.n > W * 0.55).map(r => r.y);
        let best = null, seg = null;
        for (const y of on) {
            if (!seg) seg = { a: y, b: y };
            else if (y === seg.b + 1) seg.b = y;
            else { if (!best || seg.b - seg.a > best.b - best.a) best = seg; seg = { a: y, b: y }; }
        }
        if (seg && (!best || seg.b - seg.a > best.b - best.a)) best = seg;
        if (!best) return { W, H, err: '흰 카드 행을 못 찾음' };
        const ct = best.a, cb = best.b;
        const ins = rows.filter(r => r.y >= ct && r.y <= cb);
        const cl = Math.min(...ins.map(r => r.f)), cr = Math.max(...ins.map(r => r.l));

        // ⑵ 카드 안 어두운 잉크 → 글자 줄만(✕ 는 좁은 원이라 가로 폭으로 뺀다)
        const dark = (x, y) => { const [r, gg, b] = at(x, y); return (r * .299 + gg * .587 + b * .114) < 140; };
        const bands = [];
        for (let y = ct; y <= cb; y++) {
            let n = 0, f = -1, l = -1;
            for (let x = cl + 4; x <= cr - 4; x++) if (dark(x, y)) { n++; if (f < 0) f = x; l = x; }
            const wdt = n ? l - f + 1 : 0;
            if (n >= 6 && wdt > (cr - cl) * 0.30) {
                const L = bands[bands.length - 1];
                if (L && y - L.b <= 3) L.b = y; else bands.push({ a: y, b: y });
            }
        }
        return { W, H, ct, cb, cl, cr, bands };
    }, dataUrl(REF_PNG));
}

// ── 클론 DOM 측정 ────────────────────────────────────────────────────────────
async function measureClone(browser, w, h, zeroOut) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.waitForTimeout(1200);
    await page.evaluate(new Function(SC.SEED_SRC));
    await page.waitForTimeout(400);
    // shot-screens.js 와 **같은 타이밍**으로 연다(열림 애니 한복판이면 카드 상단이 흔들린다)
    await page.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        try { UI.switchTab && UI.switchTab(null); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.waitForTimeout(120);
    await page.evaluate(() => UI.openPlayerInfo());
    await page.waitForTimeout(650);
    await page.evaluate(() => document.querySelectorAll('.modal, .modal-card').forEach(m => m.classList.remove('opening')));
    if (zeroOut) await page.evaluate(() => {   // --selftest: 교정 전 상태로 되돌린다
        const s = document.createElement('style');
        s.textContent = '.pinfo-subs-list { margin-bottom: 0 !important; }';
        document.head.appendChild(s);
    });
    await page.waitForTimeout(150);
    const d = await page.evaluate(() => {
        const q = s => document.querySelector(s);
        const app = q('#app'), card = q('#player-info-modal .modal-card.wide'), list = q('.pinfo-subs-list');
        if (!app || !card || !list) return { err: `셀렉터 못 찾음(app=${!!app} card=${!!card} list=${!!list})` };
        const A = app.getBoundingClientRect(), C = card.getBoundingClientRect(), L = list.getBoundingClientRect();
        return {
            appT: A.top, appH: A.height,
            cardT: C.top, cardB: C.bottom, listT: L.top, listB: L.bottom, listH: L.height,
            sh: list.scrollHeight, ch: list.clientHeight, kids: list.children.length,
        };
    });
    await page.close();
    return { d, errs };
}

(async () => {
    const browser = await chromium.launch();
    const p0 = await browser.newPage();
    const ref = await scanRef(p0);
    await p0.close();

    // ── 원본 자기검증
    if (ref.err || !ref.bands || ref.bands.length < 5) {
        console.log(`측정기 고장 (REF): ${ref.err || '카드 안 글자 줄 띠가 ' + (ref.bands ? ref.bands.length : 0) + '개(5개 이상을 기대)'}`);
        await browser.close(); process.exit(2);
    }
    const lastBand = ref.bands[ref.bands.length - 1];
    const gapPx = ref.cb - lastBand.b;
    if (gapPx <= 0) {
        console.log(`측정기 고장 (REF): 마지막 글자 줄(y${lastBand.b}) 아래 흰 여백이 없다(카드 하단 y${ref.cb}) — ✕ 버튼을 글자 줄로 물었을 수 있다`);
        await browser.close(); process.exit(2);
    }
    const refListB = +(lastBand.b / ref.H * 100).toFixed(2);
    const refCardB = +(ref.cb / ref.H * 100).toFixed(2);
    const refGap = +(gapPx / ref.H * 100).toFixed(2);

    console.log(`\n플레이어 정보(shot-043313) 스탯 목록 아랫끝 — 원본 ${ref.W}×${ref.H} 픽셀 · 클론 DOM${SELFTEST ? '  [--selftest: margin-bottom 0 으로 되돌림]' : ''}`);
    console.log(`원본: 흰 카드 x${ref.cl}~${ref.cr} y${ref.ct}~${ref.cb} · 글자 줄 ${ref.bands.length}개 · 마지막 줄 하단 y${lastBand.b}`);
    console.log(`      목록 아랫끝 ${refListB}%H · 카드 하단 ${refCardB}%H · 아래 흰 여백 ${gapPx}px = ${refGap}%H\n`);
    console.log('뷰포트      목록아랫끝%H(Δ)        카드하단%H(Δ)         아래여백%H(Δ)        보이는줄  판정');

    let over = 0, broken = 0, errTotal = 0;
    for (const [w, h] of VPS) {
        const { d, errs } = await measureClone(browser, w, h, SELFTEST);
        errTotal += errs.length;
        if (d.err) { console.log(`${w}×${h}  측정기 고장 (CLONE): ${d.err}`); broken++; continue; }
        const pct = v => +(((v - d.appT) / d.appH) * 100).toFixed(2);
        if (!(d.listB <= d.cardB + 0.5 && d.listT >= d.cardT - 0.5)) {
            console.log(`${w}×${h}  측정기 고장 (CLONE): 목록이 카드 밖이다(목록 ${d.listT.toFixed(1)}~${d.listB.toFixed(1)} · 카드 ${d.cardT.toFixed(1)}~${d.cardB.toFixed(1)})`);
            broken++; continue;
        }
        const lb = pct(d.listB), cb = pct(d.cardB), gp = +(cb - lb).toFixed(2);
        const dLb = +(lb - refListB).toFixed(2), dCb = +(cb - refCardB).toFixed(2), dGp = +(gp - refGap).toFixed(2);
        const bad = [dLb, dCb, dGp].filter(v => Math.abs(v) > GATE).length;
        over += bad;
        const sgn = v => (v >= 0 ? '+' : '') + v;
        const vis = d.kids ? Math.floor(d.ch / (d.sh / d.kids)) : 0;
        console.log(`${String(w + '×' + h).padEnd(10)}  ${String(lb).padStart(6)} (${sgn(dLb).padStart(6)})   ${String(cb).padStart(6)} (${sgn(dCb).padStart(6)})   ` +
            `${String(gp).padStart(6)} (${sgn(dGp).padStart(6)})   ${String(vis + '/' + d.kids).padStart(7)}  ${bad ? '초과 ' + bad : 'ok'}`);
    }
    await browser.close();

    if (broken) { console.log(`\n측정기 고장 ${broken}건`); process.exit(2); }
    console.log(`\n최대 게이트 ±${GATE}%p · 초과 ${over}건 · 콘솔 에러 ${errTotal}건`);
    console.log('판정: ' + (over === 0 && errTotal === 0 ? '통과' : '불통과'));
    process.exit(over === 0 && errTotal === 0 ? 0 : 1);
})();
