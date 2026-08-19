// 플레이어 정보 팝업 shot-043313 의 **장비 그리드 / 오브 줄** 비율 대조 —
// '전 UI 비율 전수 검증 패스'(ui-ratio-audit)의 화면별 실측기.
//
// 📌 **짝 도구와 역할이 다르다 — 겹치지 말 것.**
//   · `probe-pinfo-loadout.js`(QA 11차) = 오브 3종(스킬·펫·탈것)이 **서로 같은 지름**이고 찌부러지지
//     않았는지. 뷰포트 3종을 돌며 **렌더 절대 지름**을 본다(원본과는 무관한 검사다).
//   · 이 도구 = 그 줄이 **원본과 같은 비율**인지. 자는 흰 카드 폭(CW), 가로세로 공통.
//
// 📏 자 = 카드 폭 — 원본 이미지 폭과 클론 앱 폭이 다를 수 있어서다(인계 메모 함정 ㉠).
//
// ══════════════════════════════════════════════════════════════════════════════
// 🚨 2026-08-19 수리: **클론 쪽을 픽셀 스캔에서 DOM rect 로 옮겼다** (인계 메모 ⓓ '측정기 고장').
//
//   증상: `측정기 고장 (CLONE): 오브 줄을 못 찾음` (exit 2). 장비 밴드는 351..476 로 잡히는데
//         그 아래 밴드가 **하나도 없다**고 나왔다.
//   진범: 처음엔 '오브가 밝아져 비흰색 술어에 안 걸린다'로 의심했는데 **실측하니 반대였다** —
//         오브 행의 비흰색 화소는 260개(문턱 37.5)로 넉넉하다. 진짜 원인은 **카드 바탕에 깔린
//         크로스해치 스킨 텍스처**다(`ui-quality-up`/`aaa-skin` 패스). 카드 바탕이 240~243 인데
//         13px 주기로 **235~237 짜리 실오라기**가 지나간다. `white()` 문턱이 `>238` 이라 그 실이
//         전부 비흰색으로 잡혀 **흰 런이 10px 마다 끊긴다**(실측: y600 에서 최장 흰 런 10px).
//         카드 행 조건이 `최장 흰 런 > 이미지폭×0.55`(=274) 이므로 **카드 하단(cb)이 y492 에서
//         멈추고**, 오브 줄(y493~535)이 통째로 스캔 범위 밖으로 나갔다. 밴드를 못 찾은 게 아니라
//         **카드가 오브 줄 위에서 잘렸다.**
//   교훈: 카드 바탕색에 매달린 술어는 스킨 패스 한 번에 죽는다(`probe-fl-face` 의 등급색 사례와
//         같은 계열). 문턱을 235 로 내리는 건 **다음 텍스처가 더 진해지면 또 죽는** 미봉책이라,
//         이 저장소 규약대로(probe-tn-dom · probe-fl-face · probe-lgr-dom · probe-pets2-dom)
//         **원본만 픽셀 스캔하고 클론은 DOM rect** 로 잰다. 색이 또 바뀌어도 안 깨진다.
//   ⚠️ 그러니 이 도구를 '픽셀 대 픽셀'로 되돌리지 말 것 — 되돌리면 같은 고장이 재발한다.
// ══════════════════════════════════════════════════════════════════════════════
//
// 🚨 원본(REF) 스캔의 측정 함정 — 이쪽은 그대로 유효하다:
//   ⑴ 흰 카드 좌우는 **전 행의 최대 흰 구간**으로 잡는다(첫 행은 라운드 모서리라 좁게 잡힌다).
//   ⑵ 오브/타일을 **색으로** 잡으면 안 된다 — 원본 오브는 빨강이다. '흰 카드 위의 비흰색 덩어리'로 잡는다.
//   ⑶ **밴드 안에서 어느 행을 재느냐**가 제일 까다롭다 — 원본 오브는 안쪽 밝은 면 때문에 한 칸이
//      두 조각으로 갈리는 행이 있고, 오브 줄 가운데는 'Lv.N' 라벨 줄이다(colsOf 주석 참조).
//   ⑷ **머리줄(아바타+이름+우측 3줄)이 장비 그리드로 오인된다** — 밴드 높이로 가른다(타일 줄은 두껍다).
//
// 자기검증: 원본은 카드가 잡히고 장비 그리드가 **폭이 고른 5열**이며 오브 줄이 그보다 작은 칸 5개
//           이상인지, 클론은 셀렉터 4종이 실제로 잡히고 장비 1행이 5칸인지 본다.
//           어긋나면 수치를 인쇄하지 않고 **진단과 함께** exit 2.
//
// 사용: node tools/probe-pinfo-px.js  [--selftest]
//   `--selftest` 는 오브를 일부러 1.3배로 부풀려 **FAIL 이 실제로 나는지** 확인한다 — 자를 DOM 으로
//   옮긴 뒤 '전부 통과'가 게이트가 헐거워진 탓이 아님을 보이는 용도다(probe-profile-dom 규약).
// 종료코드 0=PASS(±2%p 초과 0건 · 콘솔 에러 0건) / 1=비율 초과 / 2=측정기 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF = path.resolve(__dirname, '../ref/screens/shot-043313.png');
const TOL = 2.0;
const SELFTEST = process.argv.includes('--selftest');

// ── 원본 PNG 픽셀 스캔 ────────────────────────────────────────────────────────
const SCAN = async ([src]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const W = c.width, H = c.height, D = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
    const white = p => p[0] > 238 && p[1] > 238 && p[2] > 238;
    const bad = m => ({ err: m });

    // ── 흰 카드 (함정 ⑴) ────────────────────────────────────────────────────
    let cl = 0, cr = 0, ct = -1, cb = -1, bestAll = 0;
    for (let y = 0; y < H; y++) {
        let run = 0, best = 0, bs = 0, s = 0;
        for (let x = 0; x < W; x++) {
            if (white(at(x, y))) { if (run === 0) s = x; run++; if (run > best) { best = run; bs = s; } }
            else run = 0;
        }
        if (best > W * 0.55) { if (ct < 0) ct = y; cb = y; if (best > bestAll) { bestAll = best; cl = bs; cr = bs + best - 1; } }
    }
    if (ct < 0) return bad('흰 카드를 못 찾음');
    const CW = cr - cl + 1;

    // ── 카드 안 비흰색 밴드 (함정 ⑵) ────────────────────────────────────────
    const bands = [];
    { let cur = null;
      for (let y = ct; y <= cb; y++) {
          let n = 0;
          for (let x = cl; x <= cr; x++) if (!white(at(x, y))) n++;
          if (n > CW * 0.10) { if (!cur) cur = { y0: y, y1: y }; else cur.y1 = y; }
          else if (cur) { if (cur.y1 - cur.y0 >= 12) bands.push(cur); cur = null; }
      }
      if (cur && cur.y1 - cur.y0 >= 12) bands.push(cur); }

    // 밴드 안에서 **어느 행을 재느냐**가 이 화면의 핵심 함정이다. 실패한 방법 셋:
    //   ⓐ '열이 가장 많이 잡히는 행' → 타일이 잘게 쪼개진 행을 골라 장비 칸 폭이 52px 대신 38px 로 나온다.
    //   ⓑ '밴드의 가운데 행' → 오브 줄의 가운데는 **'Lv.N' 글자 줄**이라 5px 짜리 파편만 잡힌다
    //      (오브 지름이 31px 인데 16px 로 읽혔다).
    //   ⓒ '작은 틈은 메우기' → **상대 임계값으로는 절대 못 가른다.** 원본 오브가 갈리는 틈은 4px/31px
    //      = 12.9% 인데, 장비 타일 사이의 진짜 틈은 5px/52px = 9.6% 로 **오히려 더 좁다**.
    // → **파편은 폭으로 버린다**: 한 행 안에서 가장 넓은 칸의 60% 에 못 미치는 런은 조각으로 보고 버린다.
    const runsAt = (y) => {
        const runs = [];
        let r = -1;
        for (let x = cl; x <= cr + 1; x++) {
            const on = x <= cr && !white(at(x, y));
            if (on && r < 0) r = x;
            if (!on && r >= 0) { if (x - r >= 3) runs.push([r, x - 1]); r = -1; }
        }
        if (!runs.length) return runs;
        const max = Math.max(...runs.map(v => v[1] - v[0] + 1));
        return runs.filter(v => (v[1] - v[0] + 1) >= max * 0.6);
    };
    const colsOf = (b, minW) => {
        // 밴드의 **위쪽 60%** 만 본다 — 아래쪽에는 'Lv.N' 라벨이 깔려 있어, 칸 하나가 라벨 때문에
        //    넓게 잡히면 60% 폭 필터가 나머지를 죄다 조각으로 버린다.
        const yEnd = b.y0 + Math.max(4, Math.round((b.y1 - b.y0) * 0.6));
        let best = [], bestMed = -1, bestSpread = 1e9, bestY = -1;
        for (let y = b.y0; y <= yEnd; y++) {
            const runs = runsAt(y);
            if (runs.length < 3) continue;
            const ws = runs.map(v => v[1] - v[0] + 1).sort((p, q) => p - q);
            const med = ws[Math.floor(ws.length / 2)];
            const spread = ws[ws.length - 1] - ws[0];
            // 동점 처리 순서가 중요하다: 중앙값 → **칸 수** → 폭 균일도.
            const better = med > bestMed
                || (med === bestMed && runs.length > best.length)
                || (med === bestMed && runs.length === best.length && spread < bestSpread);
            if (better) { bestMed = med; bestSpread = spread; best = runs; bestY = y; }
        }
        // ⚠️ '좌 인셋'은 **필터 전** 잉크의 왼쪽 끝으로 잰다 — 원본 첫 오브는 안쪽 밝은 면 때문에
        //    13+15 로 갈려 60% 폭 필터에 둘 다 버려진다. 왼쪽 끝만은 원본 그대로 쓴다.
        colsOf.lastY = bestY; colsOf.lastMed = bestMed;
        colsOf.lastLeft = -1;
        if (bestY >= 0) for (let x = cl; x <= cr; x++) if (!white(at(x, bestY))) { colsOf.lastLeft = x; break; }
        return best.filter(v => v[1] - v[0] + 1 >= minW);
    };
    // 장비 그리드 = 5열이 잡히는 첫 밴드. 5열이면 다 장비 그리드인 건 아니다 — 머리줄도 5조각으로
    // 잡힐 수 있어 **서로 폭이 거의 같다**는 것으로 가른다(글자 조각은 폭이 들쭉날쭉하다).
    const evenCols = (cols) => {
        const ws = cols.map(v => v[1] - v[0] + 1);
        return Math.max(...ws) - Math.min(...ws) < CW * 0.03;
    };
    // 🚨 밴드 높이 조건이 없으면 **머리줄이 장비 그리드로 잡힌다** — 타일 줄은 두껍고
    //    (장비 14.6%CW · 오브 9.1%CW) 머리줄은 얇다(3.9%CW).
    const tall = (b) => (b.y1 - b.y0 + 1) >= CW * 0.08;
    const diag = () => bands.map(b => {
        const cc = colsOf(b, Math.round(CW * 0.03));
        return `${b.y0}..${b.y1}[행y${colsOf.lastY} 칸${cc.length}개 두꺼움${tall(b)}]`;
    }).join(' ');
    let gear = null, gearCols = null;
    for (const b of bands) {
        if (!tall(b)) continue;
        const cols = colsOf(b, Math.round(CW * 0.06));
        if (cols.length === 5 && evenCols(cols)) { gear = b; gearCols = cols; break; }
    }
    if (!gear) return bad(`장비 그리드(폭이 고른 5열 밴드)를 못 찾음 — 밴드 ${diag()}`);
    const gearW = gearCols[0][1] - gearCols[0][0] + 1;
    let orb = null, orbCols = null;
    for (const b of bands) {
        if (b.y0 <= gear.y1 || !tall(b)) continue;
        const cols = colsOf(b, Math.round(CW * 0.03));
        if (cols.length >= 5 && evenCols(cols) && (cols[0][1] - cols[0][0] + 1) < gearW * 0.85) { orb = b; orbCols = cols; break; }
    }
    if (!orb) return bad(`오브 줄을 못 찾음 — gear ${gear.y0}..${gear.y1} w${gearW} · 밴드별 ${diag()}`);

    colsOf(orb, Math.round(CW * 0.03));            // lastLeft 를 오브 줄 기준으로 다시 채운다
    const orbLeft = colsOf.lastLeft;
    const orbW = orbCols[0][1] - orbCols[0][0] + 1;
    if (orbW < CW * 0.03) return bad(`오브 지름이 비정상적으로 작음 (${orbW}px)`);

    // ── 장비 2행 **탈것 셀**(밝은 시안 span-2) 폭 (인계 ⓑ) ────────────────────
    // 비평가가 '장비 2행 파란 대형 타일 폭 Δ7' 을 냈다. 원본에도 span-2(정상 칸 2개 폭)인지가
    // 먼저라 밝은 시안 채움의 가로 범위를 잰다 — 시안은 이 카드에서 이 셀에만 있어 색으로 잡아도
    // 다른 요소에 안 걸린다(오브 빨강·타일 갈색·바탕 흰색과 구분됨). 장비 그리드와 오브 줄 사이
    // 밴드에서 시안 화소가 가장 넓은 행을 쓴다.
    const cyan = p => p[2] > 180 && p[1] > 150 && p[0] < 170 && (p[2] - p[0]) > 30;
    let mtL = -1, mtR = -1;
    for (let y = gear.y1 + 1; y < orb.y0; y++) {
        let l = -1, r = -1;
        for (let x = cl; x <= cr; x++) if (cyan(at(x, y))) { if (l < 0) l = x; r = x; }
        if (l >= 0 && r - l > mtR - mtL) { mtL = l; mtR = r; }
    }
    const mountW = mtL >= 0 ? mtR - mtL + 1 : null;   // null 이면 시안 셀 없음(상태 다름) — 판정 제외

    return {
        size: [W, H], card: { l: cl, t: ct, r: cr, b: cb, w: CW },
        gearBand: `${gear.y0}..${gear.y1}`, orbBand: `${orb.y0}..${orb.y1}`, orbN: orbCols.length,
        px: {
            gearW, gearPitch: gearCols[1][0] - gearCols[0][0], gearLeft: gearCols[0][0] - cl,
            orbW, orbPitch: orbCols[1][0] - orbCols[0][0], orbLeft: orbLeft - cl, orbTop: orb.y0 - ct,
            mountW,
        },
    };
};

// ── 클론 라이브 DOM 실측 ─────────────────────────────────────────────────────
const DOM = () => {
    const vis = e => e && e.offsetParent !== null;
    const card = document.querySelector('.pinfo-card');
    if (!vis(card)) return { err: '.pinfo-card 가 없다(팝업이 안 열렸다)' };
    const cr = card.getBoundingClientRect();
    const R = e => { const r = e.getBoundingClientRect(); return { x: r.x - cr.x, y: r.y - cr.y, w: r.width, h: r.height }; };
    const cells = [...document.querySelectorAll('.equip-grid.pinfo-gear .equip-cell')].filter(vis).map(R);
    // 장비 1행 = **가장 위 행**. 칸 수를 5로 가정하지 않고 top 으로 묶는다 — 2행은 탈것 넓은 칸이
    // 섞여 있어 폭 기준이 다르고, 행 수가 바뀌어도 이 묶음은 안 깨진다.
    let row1 = [];
    if (cells.length) {
        const top = Math.min(...cells.map(c => c.y));
        row1 = cells.filter(c => Math.abs(c.y - top) <= c.h * 0.5).sort((a, b) => a.x - b.x);
    }
    // 오브 = 로드아웃 줄의 각 칸 안 .sk-orb (없으면 칸 자체 — 펫/탈것 칸 구조가 달라질 때 대비)
    const orbs = [...document.querySelectorAll('.pinfo-loadout-row .sk-cell')].filter(vis)
        .map(c => R(c.querySelector('.sk-orb') || c)).sort((a, b) => a.x - b.x);
    // 장비 2행 탈것 셀 = span-2 넓은 칸 (인계 ⓑ)
    const mountEl = document.querySelector('.equip-grid.pinfo-gear .pinfo-mount-wide');
    const mount = vis(mountEl) ? R(mountEl) : null;
    return { card: { w: cr.width, h: cr.height }, cellN: cells.length, row1, orbs, mount };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    // UI.els 까지 기다린다 — `S.forgeLevel` 은 스크립트 파싱 시점에 참이 되는데 `UI.els` 는
    // DOMContentLoaded 가 채워서, 느린 컨테이너에서 시드가 undefined 로 죽는다(probe-main-px 의 그 레이스).
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && UI.els && !!UI.els.equipSheet, null, { timeout: 90000 });

    const ref = await page.evaluate(SCAN, ['data:image/png;base64,' + fs.readFileSync(REF).toString('base64')]);

    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29 && UI.els && !!UI.els.equipSheet, null, { timeout: 90000 });
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        UI.openPlayerInfo();
    });
    // 열림 애니(cardpop scale .7) 한복판에서 재면 카드가 0.7배로 잡힌다 — 규약대로 애니를 끄고
    // opening 클래스를 떼어 최종 상태로 스냅시킨다.
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => document.querySelectorAll('.modal, .modal-card').forEach(m => m.classList.remove('opening')));
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => { });
    if (SELFTEST) await page.addStyleTag({ content: '.pinfo-loadout-row .sk-orb { width: 130% !important; height: 130% !important; }' });
    await page.waitForTimeout(700);
    const clone = await page.evaluate(DOM);
    await browser.close();

    // ── 자기검증 ────────────────────────────────────────────────────────────
    const bad = [];
    if (ref.err) bad.push(`원본 스캔: ${ref.err}`);
    if (clone.err) bad.push(`클론 DOM: ${clone.err}`);
    if (!ref.err) console.log(`REF   ${ref.size.join('x')} · 카드폭 ${ref.card.w} · 장비밴드 ${ref.gearBand} · 오브밴드 ${ref.orbBand}(${ref.orbN}칸)`);
    if (!clone.err) console.log(`CLONE DOM · 카드 ${clone.card.w.toFixed(1)}x${clone.card.h.toFixed(1)} · 장비칸 ${clone.cellN}개(1행 ${clone.row1.length}칸) · 오브 ${clone.orbs.length}개`);
    if (!clone.err && clone.row1.length !== 5) bad.push(`클론 장비 1행이 5칸이 아니다(${clone.row1.length}칸 — 마크업이 바뀌었으면 머리말대로 셀렉터를 고칠 것)`);
    if (!clone.err && clone.orbs.length < 2) bad.push(`클론 오브가 ${clone.orbs.length}개다(피치를 못 잰다 — 시드가 스킬/펫을 안 채웠다)`);
    if (bad.length) { console.log('\n=> 측정기 고장(exit 2): ' + bad.join(' · ')); process.exit(2); }

    // ── 대조 (자 = 카드 폭, 가로세로 공통) ───────────────────────────────────
    const rp = v => (v / ref.card.w) * 100, cp = v => (v / clone.card.w) * 100;
    const r1 = clone.row1, ob = clone.orbs;
    const rows = [
        ['장비 칸 폭', rp(ref.px.gearW), cp(r1[0].w)],
        ['장비 열 피치', rp(ref.px.gearPitch), cp(r1[1].x - r1[0].x)],
        ['장비 좌 인셋', rp(ref.px.gearLeft), cp(r1[0].x)],
        ['오브 지름', rp(ref.px.orbW), cp(ob[0].w)],
        ['오브 열 피치', rp(ref.px.orbPitch), cp(ob[1].x - ob[0].x)],
        ['오브 좌 인셋', rp(ref.px.orbLeft), cp(ob[0].x)],
        ['오브 줄 상단', rp(ref.px.orbTop), cp(Math.min(...ob.map(o => o.y)))],
    ];
    // 탈것 셀(span-2 시안 칸) — 원본 시안이 잡히고 클론에 .pinfo-mount-wide 가 있을 때만 판정(인계 ⓑ)
    if (ref.px.mountW != null && clone.mount) rows.push(['탈것 셀 폭(span2)', rp(ref.px.mountW), cp(clone.mount.w)]);
    else console.log(`\n[미판정 참고] 탈것 셀 — 원본 시안 ${ref.px.mountW == null ? '없음(상태 다름)' : rp(ref.px.mountW).toFixed(2) + '%CW'} · 클론 ${clone.mount ? cp(clone.mount.w).toFixed(2) + '%CW' : '.pinfo-mount-wide 없음'}`);
    console.log('\n단위 = 카드 폭 대비 % (가로세로 공통)');
    console.log('요소                 원본     클론      Δ%p   판정(게이트 ±2%p)');
    let fail = 0;
    for (const [k, a, b] of rows) {
        const d = +(b - a).toFixed(2), ok = Math.abs(d) <= TOL;
        if (!ok) fail++;
        console.log(`${k.padEnd(20)} ${a.toFixed(2).padStart(7)} ${b.toFixed(2).padStart(8)} ${(d > 0 ? '+' : '') + d.toFixed(2)}   ${ok ? 'PASS' : 'FAIL'}`);
    }
    // 게이트 밖이지만 매번 인쇄한다 — 통과에 묻혀 사라지면 '전부 같다'로 읽힌다.
    console.log(`\n※ 비율 게이트 밖 차이: 오브 칸 수 원본 ${ref.orbN} vs 클론 ${ob.length} (장착 스킬·출전 펫 수 = 시드 상태 소관).`);
    console.log(`콘솔/페이지 에러: ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    const pass = fail === 0 && errors.length === 0;
    console.log(pass ? '\nPASS — 초과 0건' : `\nFAIL — 초과 ${fail}건${errors.length ? ` · 콘솔 에러 ${errors.length}건` : ''}`);
    process.exit(pass ? 0 : 1);
})();
