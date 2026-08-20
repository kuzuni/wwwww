// 플레이어 정보 팝업(shot-043313) **머리줄**(아바타 + 이름 3줄 + 우측 스탯 3줄) 비율 대조 —
// 'ui-ratio-audit' 의 화면별 실측기.
//
// 📌 **짝 도구와 역할이 다르다 — 겹치지 말 것.**
//   · `probe-pinfo-px.js`          = 장비 그리드 / 오브 줄(머리줄 **아래**).
//   · `probe-pinfo-subs-bottom.js` = 스탯 목록의 아랫끝.
//   · 이 도구 = 그 위 **머리줄**. 2026-08-20 R6 채점에서 비평가 2인이 **교집합으로 두 자리**를
//     짚어 만들었다. 하나는 실결함이었고(우측 3줄 블록) 하나는 유령이었다(좌·우 인셋) —
//     **둘 다** 이 도구가 지킨다. 고친 값에만 자를 붙이면 기각한 자리는 다시 지적으로 올라온다.
//
// ══════════════════════════════════════════════════════════════════════════════
// 🚨 **잉크 대 잉크로 재라 — 이 화면이 준 가장 비싼 교훈이다.**
//   원본 **잉크** vs 클론 **박스**(`getBoundingClientRect`)로 재면 `line-height` 만큼 부풀어
//   블록 높이가 Δ+2.94%p 로 나온다. 실제(양쪽 다 잉크)는 **Δ+2.11%p** 였다. 부호는 같아도
//   크기가 40% 부풀어, '얼마나 줄여야 하는가'를 그 값으로 잡으면 과교정한다.
//   그래서 이 도구는 클론도 **캡처 PNG 의 칠해진 화소**로 잰다(rect 는 스캔 범위를 주는 데만 쓴다).
//
// 🚨 **한 줄만 보고 닫지 말 것.** 교정 전 실측에서 줄 피치(Δ+0.89)와 줄 잉크 높이(Δ+0.25)는
//   **각각 ±2%p 게이트 안**인데 블록 세로폭은 **Δ+2.11 로 초과**였다 — 3줄이라 줄마다 쌓인다.
//   `probe-pinfo-px` 의 '스탯 6칸 누적'과 같은 계열이다. 그래서 셋을 다 인쇄하고 다 판정한다.
//
// ⛔ **좌·우 인셋은 '기각을 지키는' 줄이다.** R6 비평가 A·B 가 교집합으로 '패딩이 원본의 60%
//    (Δ−2.2%p)'라 했지만 **같은 픽셀 코드로 재니 Δ−0.04%p** 였다(원본 29px/5.85%W ↔ 클론
//    29px/5.81%W). DOM 교차검증도 일치했다(`.pinfo-id .avatar` left = 91.3 ↔ 픽셀 잉크 좌단 x91).
//    **2인 교집합이라도 게이트 안이면 결함이 아니다** — 교집합은 '볼 만한 자리'라는 신호지 판정이
//    아니다(이 항목이 `gear-detail` 아이콘 타일에서 이미 배운 것의 두 번째 사례).
// ══════════════════════════════════════════════════════════════════════════════
//
// 🚨 측정 함정 — 밟은 것만:
//   ⑴ 카드 행을 '최장 흰 **런**'으로 잡으면 글자가 촘촘한 줄에서 런이 끊긴다 → 흰 화소 **개수**.
//   ⑵ 카드는 세로로 **여러 흰 조각**(머리줄 · 스탯 목록)으로 갈린다 → **맨 위 조각**이 머리줄이다.
//   ⑶ 카드 **맨 윗줄은 라운드 모서리 + 키라인**이라 '카드 좌단에 어두운 화소'가 잡혀 좌 인셋이
//      0px 로 읽힌다 → 머리줄의 **세로 중앙 60%** 안에서만 걷는다.
//
// 자기검증: 원본·클론 양쪽에서 ⓐ 머리줄 흰 조각이 잡히고 ⓑ 우측 잉크 줄이 **정확히 3개**이며
//           ⓒ 좌·우 인셋이 0 보다 큰지 본다. 어긋나면 수치를 인쇄하지 않고 **진단과 함께** exit 2.
//
// 사용: node tools/probe-pinfo-header.js [--selftest]
//   `--selftest` 는 `.pinfo-right` 를 교정 전 값(`.76rem`/`1.55`)으로 되돌려 **FAIL 이 실제로
//   나는지** 확인한다(게이트가 헐거워서 통과하는 게 아님을 보이는 용도 — probe-profile-dom 규약).
// 종료코드 0=PASS(±2%p 초과 0건 · 콘솔 에러 0건) / 1=비율 초과 / 2=측정기 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const ROOT = path.resolve(__dirname, '..');
const REF_PNG = path.resolve(ROOT, 'ref/screens/shot-043313.png');
const SELFTEST = process.argv.includes('--selftest');
const GATE = 2;
const dataUrl = p => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

// 한 장의 PNG 에서 머리줄 기하를 낸다(원본·클론 **같은 코드**).
const SCAN = async (page, url, bandWin) => page.evaluate(async ([url, bandWin]) => {
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const D = g.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    // 종이 스킨(#fff→#efeef2 + 결)이 순백 술어를 죽인다 — geardetail 이 쓰는 완화값
    const white = (x, y) => { const [r, gg, b] = at(x, y); return r >= 214 && gg >= 214 && b >= 214 && (Math.max(r, gg, b) - Math.min(r, gg, b)) <= 22; };
    const dark = (x, y) => { const [r, gg, b] = at(x, y); return (r * .299 + gg * .587 + b * .114) < 140; };

    const rows = [];
    for (let y = 0; y < H; y++) { let n = 0, f = -1, l = -1; for (let x = 0; x < W; x++) if (white(x, y)) { n++; if (f < 0) f = x; l = x; } rows.push({ y, n, f, l }); }
    const on = rows.filter(r => r.n > W * 0.55).map(r => r.y);
    if (!on.length) return { err: '흰 카드 행을 못 찾음' };
    const segs = [];
    for (const y of on) { const L = segs[segs.length - 1]; if (L && y - L.b <= 6) L.b = y; else segs.push({ a: y, b: y }); }
    const head = segs[0];                                   // ⑵ 맨 위 조각 = 머리줄
    const ins = rows.filter(r => r.y >= head.a && r.y <= head.b);
    const cl = Math.min(...ins.map(r => r.f)), cr = Math.max(...ins.map(r => r.l));

    // ⑶ 머리줄 위·아래 8px 을 뺀 창에서만 걷는다(라운드 모서리·키라인 회피).
    //    🚨 **비율(중앙 60%)로 자르지 말 것** — 교정 전처럼 블록이 크면 셋째 줄이 창 밖으로 나가
    //       띠가 2개로 잡혀 `--selftest` 가 '측정기 고장'으로 끝난다(밟았다). 창은 결함 크기에
    //       따라 움직이면 안 된다 — 고정 여백이라야 교정 전·후를 **같은 창**으로 잰다.
    const y0 = head.a + 8, y1 = head.b - 8;
    let lMin = 1e9, rMax = -1;
    for (let y = y0; y <= y1; y++) {
        for (let x = cl + 2; x <= cr - 2; x++) if (dark(x, y)) { if (x < lMin) lMin = x; break; }
        for (let x = cr - 2; x >= cl + 2; x--) if (dark(x, y)) { if (x > rMax) rMax = x; break; }
    }

    // 우측 3줄 블록 = 카드 오른쪽 45% 의 잉크 줄.
    // 🚨 **창을 머리줄 흰 조각에 매달지 말 것 — 이 도구가 두 번 터진 자리다.**
    //    ⓐ 창이 없으면 카드 맨 윗줄의 라운드 모서리·키라인이 네 번째 띠(클론 실측 y125~129)로 잡힌다.
    //    ⓑ 그렇다고 흰 조각(head)에 맞추면, **블록이 커진 상태에서 셋째 줄이 조각 밖으로 나가**
    //       띠가 2개로 잡힌다(`--selftest` 실측: head 가 125~213 → 125~186 으로 줄고 y187~198 이 잘렸다).
    //       즉 '결함이 클수록 자가 못 재는' 창이 되어 **교정 전을 못 재는 자**가 된다.
    //    → 클론은 `.pinfo-right` 의 **DOM rect** 를 창으로 받는다(저장소 규약: 원본은 픽셀, 클론은 DOM).
    //      원본은 흰 조각 창을 그대로 쓴다 — 원본은 블록이 조각 안에 들어와 있는 게 확인된 상태다.
    const bands = [];
    const by0 = bandWin ? bandWin[0] : y0, by1 = bandWin ? bandWin[1] : y1;
    for (let y = Math.max(0, by0); y <= Math.min(H - 1, by1); y++) {
        let n = 0;
        for (let x = Math.round(cl + (cr - cl) * 0.55); x <= cr - 2; x++) if (dark(x, y)) n++;
        if (n >= 3) { const L = bands[bands.length - 1]; if (L && y - L.b <= 2) L.b = y; else bands.push({ a: y, b: y }); }
    }
    return { W, H, cl, cr, headA: head.a, headB: head.b, lIns: lMin - cl, rIns: cr - rMax, bands };
}, [url, bandWin]);

const geom = (s) => {
    const b = s.bands;
    return {
        span: b[b.length - 1].b - b[0].a + 1,
        pitch: (b[b.length - 1].a - b[0].a) / (b.length - 1),
        ink: b.reduce((t, x) => t + (x.b - x.a + 1), 0) / b.length,
    };
};

(async () => {
    const browser = await chromium.launch();

    // ── 클론: 캡처를 이 런에서 직접 찍는다(낡은 그림을 재는 유령 방지 — regress-ratio 머리말 함정)
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + path.join(ROOT, 'index.html'));
    await page.waitForTimeout(1200);
    await page.evaluate(new Function(SC.SEED_SRC));
    await page.waitForTimeout(400);
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
    if (SELFTEST) await page.evaluate(() => {              // 교정 전 값으로 되돌린다
        const s = document.createElement('style');
        s.textContent = '.pinfo-right { font-size: .76rem !important; line-height: 1.55 !important; }';
        document.head.appendChild(s);
    });
    await page.waitForTimeout(150);
    const dom = await page.evaluate(() => {
        const a = document.querySelector('.pinfo-id .avatar');
        const r = document.querySelector('.pinfo-right');
        const rb = r.getBoundingClientRect();
        return { av: a ? +a.getBoundingClientRect().left.toFixed(1) : null, win: [Math.floor(rb.top) - 4, Math.ceil(rb.bottom) + 4] };
    });
    const domAv = dom.av;
    const shot = await page.screenshot();
    await page.close();

    const p1 = await browser.newPage();
    const ref = await SCAN(p1, dataUrl(REF_PNG));
    const clo = await SCAN(p1, 'data:image/png;base64,' + shot.toString('base64'), dom.win);
    await browser.close();

    // ── 자기검증
    for (const [tag, s] of [['REF', ref], ['CLONE', clo]]) {
        if (s.err) { console.log(`측정기 고장 (${tag}): ${s.err}`); process.exit(2); }
        if (!s.bands || s.bands.length !== 3) {
            console.log(`측정기 고장 (${tag}): 우측 잉크 줄이 ${s.bands ? s.bands.length : 0}개다(3개를 기대) — 머리줄 조각을 잘못 잡았을 수 있다`);
            process.exit(2);
        }
        if (!(s.lIns > 0 && s.rIns > 0)) {
            console.log(`측정기 고장 (${tag}): 인셋이 0 이하(좌 ${s.lIns} · 우 ${s.rIns}) — 카드 키라인을 잉크로 물었다`);
            process.exit(2);
        }
    }
    // DOM 교차검증(클론) — 픽셀이 잡은 잉크 좌단과 아바타 rect 가 어긋나면 자를 못 믿는다
    const pixAvL = clo.cl + clo.lIns;
    if (domAv != null && Math.abs(pixAvL - domAv) > 3) {
        console.log(`측정기 고장 (CLONE): 잉크 좌단 x${pixAvL} 과 아바타 DOM left ${domAv} 가 ${Math.abs(pixAvL - domAv).toFixed(1)}px 어긋난다`);
        process.exit(2);
    }

    const G = geom(ref), C = geom(clo);
    const pr = v => v / ref.H * 100, pc = v => v / clo.H * 100;
    const prw = v => v / ref.W * 100, pcw = v => v / clo.W * 100;
    const rowsOut = [
        ['우측 블록 잉크 세로폭', '%H', pr(G.span), pc(C.span)],
        ['우측 줄 피치', '%H', pr(G.pitch), pc(C.pitch)],
        ['우측 줄 잉크 높이', '%H', pr(G.ink), pc(C.ink)],
        ['머리줄 좌 인셋', '%W', prw(ref.lIns), pcw(clo.lIns)],
        ['머리줄 우 인셋', '%W', prw(ref.rIns), pcw(clo.rIns)],
    ];

    console.log(`\n플레이어 정보 머리줄(shot-043313) — 원본 ${ref.W}×${ref.H} · 클론 ${clo.W}×${clo.H} · 같은 픽셀 코드${SELFTEST ? '  [--selftest: .pinfo-right 교정 전 값]' : ''}`);
    console.log(`원본 머리줄 카드 x${ref.cl}~${ref.cr} y${ref.headA}~${ref.headB} · 클론 x${clo.cl}~${clo.cr} y${clo.headA}~${clo.headB}`);
    console.log(`(클론 잉크 좌단 x${pixAvL} ↔ 아바타 DOM left ${domAv} — 교차검증 일치)\n`);
    console.log('요소                     단위     원본     클론      Δ%p  판정');
    let over = 0;
    for (const [name, unit, a, b] of rowsOut) {
        const d = b - a;
        const bad = Math.abs(d) > GATE; if (bad) over++;
        console.log(`${name.padEnd(22)} ${unit.padStart(4)} ${a.toFixed(2).padStart(8)} ${b.toFixed(2).padStart(8)} ${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(8)}  ${bad ? '초과' : 'ok'}`);
    }
    console.log(`\n최대 게이트 ±${GATE}%p · 초과 ${over}건 · 콘솔 에러 ${errs.length}건`);
    console.log('판정: ' + (over === 0 && errs.length === 0 ? '통과' : '불통과'));
    process.exit(over === 0 && errs.length === 0 ? 0 : 1);
})();
