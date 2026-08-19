// 시트 헤더 **재화 알약**(`.sheet-head .cur-pill`) 비율 대조 — ui-ratio-audit.
//
// 왜 생겼나: 비평가 3라운드에서 pets·pets-2 두 화면에 **'상단 재화 알약 폭 Δ5~6'** 지적이 2인 일치로
// 새로 나왔다(1·2차엔 없던 지적). 인계 메모가 "2인 일치지만 **픽셀 프로브로 확정부터**"라고 못 박아
// 둔 건, 이 저장소에서 ±2%p 지적의 절반이 유령이었기 때문이다(함정 ①②). 그 확정용 자다.
//
// 📏 자 = **앱 폭**(원본은 하단 탭바 행에서 앱 좌우 끝을 찾아 구한다 — 이미지 폭 ≠ 앱 폭 함정 ㉠).
//
// 🚨 **이 알약은 content-width 다(고정 폭이 아니다)** — 폭이 안의 숫자 길이에 따라 늘어난다.
//    그래서 비율(=같은 내용일 때 같은 모양인가)을 재려면 **클론 재화 값을 원본과 같은 자릿수로
//    맞춘 뒤** 시트를 그려야 한다. 시드값 그대로면 gem "8.15k"(5글자)가 원본 "62"(2글자)보다
//    넓어 가짜 'Δ' 가 뜬다. 클론 setup 에서 `S.eggCurrency=28; S.gems=62` 로 맞춘다.
//
// 🚨 측정 함정(원본 스캔):
//   ⑴ **숫자가 바 안에서 흰색**이라 바를 세로 훑으면 흰 숫자 열에서 어두운 런이 토막난다.
//      → 자격 열(연속 어두운 런 ≥ MINRUN)을 잡고 숫자 폭만큼(≤40px) 메운다. 좌우 **끝**은
//      숫자가 없어 안 갈리므로, 세로 중앙 행을 따라 걸어 라운드 끝까지 찾는다.
//   ⑵ **아이콘이 바 좌단 밖으로 걸친다**(원본 규약: 아이콘은 바 좌단 위에 얹힌 스티커). 아이콘은
//      **가는 윤곽선**이라 연속 어두운 런이 짧아 MINRUN 필터에서 떨어진다 — 그래서 **바 본체만**
//      잡힌다. 클론도 `.cur-pill` **상자**를 재므로 둘 다 '바 본체' 기준이라 함정 ①(한쪽만 부속
//      포함)이 없다. 참고로 아이콘 왼쪽 끝(ax)은 따로 찍는다.
//   ⑶ 가운데 제목('펫 N/250')도 어둡지만 **가는 획**이라 MINRUN 에서 떨어진다 — 남는 넓은
//      덩어리(≥3%AW)는 좌·우 알약 둘뿐이다.
//
// 자기검증: 원본에서 넓은 덩어리가 **정확히 2개**(좌·우 알약)이고 좌우 알약 높이가 ±3px 이내이며,
//           두 원본 컷(pets·pets-2)의 알약 폭이 서로 ±1%p 이내인지 본다. 어긋나면 수치를 인쇄하지
//           않고 exit 2.
//
// 사용: node tools/probe-sheet-cur-pill.js
// 종료코드 0=PASS(±2%p 초과 0건) / 1=비율 초과 / 2=측정기 고장
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REFS = [['pets', '../ref/screens/shot-042356.png'], ['pets-2', '../ref/screens/shot-042445.png']];
const TOL = 2.0;

const SCAN = async ([src]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = src; });
    const W = img.width, H = img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const D = g.getImageData(0, 0, W, H).data;
    const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };

    // ── 앱 폭 = 맨 아래 탭바 행에서 '바탕이 아닌' 최장 구간 (probe-pets2-dom 과 같은 규약)
    const yBot = H - 3, bg = at(1, yBot);
    const sameBg = p => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 24;
    let appL = 0, appR = W - 1, best = 0, run = -1;
    for (let x = 0; x <= W; x++) {
        const on = x < W && !sameBg(at(x, yBot));
        if (on && run < 0) run = x;
        if (!on && run >= 0) { if (x - run > best) { best = x - run; appL = run; appR = x - 1; } run = -1; }
    }
    if (best < W * 0.5) { appL = 0; appR = W - 1; }
    const AW = appR - appL + 1;

    // ── 헤더 밴드의 어두운 클러스터 (함정 ⑴⑶⑷)
    const dark = p => p[0] < 70 && p[1] < 70 && p[2] < 70;
    const BAND = 62;                     // 시트 헤더는 화면 최상단 — 여유 있게 62px 만 본다
    // 🚨 함정 ⑷ **아이콘 테두리도 어둡다** — '어두운 화소가 하나라도 있는 열'로 잡으면 바 좌단 밖으로
    //    걸친 알/젬 아이콘의 검은 키라인이 통째로 딸려 와, 좌 알약이 x4~91 로 **아이콘까지 포함**해
    //    잡힌다(실측: 그래서 좌우 알약 높이가 32 vs 29 로 갈렸다 — 함정 ① '한쪽만 부속 포함' 그대로).
    //    바 본체는 **속이 꽉 찬 검정**이고 아이콘은 **가는 윤곽선**이라, 열 안의 **연속** 어두운 런
    //    길이로 가른다(바 ≈30px 연속 / 윤곽선 ≈3px + 밝은 속). 숫자('28')가 흰색이라 글자 열은
    //    런이 토막나 떨어지지만, 바 좌우 **끝**은 글자가 없어 min/max x 는 그대로 바 끝이다.
    const runAt = (x) => {               // 열 x 의 최장 연속 어두운 런 → [시작y, 끝y, 길이]
        let s = -1, bs = -1, be = -1, bl = 0;
        for (let y = 0; y <= BAND; y++) {
            const on = y < BAND && dark(at(x, y));
            if (on && s < 0) s = y;
            if (!on && s >= 0) { if (y - s > bl) { bl = y - s; bs = s; be = y - 1; } s = -1; }
        }
        return [bs, be, bl];
    };
    const MINRUN = 18;
    const cols = new Array(W).fill(false);
    const runs = new Array(W).fill(null);
    for (let x = appL; x <= appR; x++) { const r = runAt(x); if (r[2] >= MINRUN) { cols[x] = true; runs[x] = r; } }
    // ⚠️ 여기서 **작은 조각을 버리면 안 된다** — 숫자가 가른 오른쪽 토막(x85~88 같은 4px)이 통째로
    //    떨어져 알약 폭이 40px(참값 63px)로 나온다(실측). 폭 필터는 **메운 뒤**에 건다.
    const clusters = [];
    { let s = -1;
      for (let x = appL; x <= appR + 1; x++) {
          const on = x <= appR && cols[x];
          if (on && s < 0) s = x;
          if (!on && s >= 0) { clusters.push([s, x - 1]); s = -1; }
      } }
    // 🚨 **바 안의 흰 숫자가 바를 두 토막으로 가른다**(함정 ⑴) — 실측: 좌 알약이 x29~68 로 잡혀
    //    오른쪽 끝(≈x95)이 통째로 떨어져 나갔다('28' 이 x70~88 을 흰색으로 비운다).
    //    MINRUN 필터가 아이콘·제목을 이미 떨궈서 **자격 열은 바 본체뿐**이므로, 숫자 폭(≈30px)보다
    //    넉넉한 40px 까지 메워도 다른 요소와는 안 붙는다(좌·우 알약 사이 간격은 ≈350px).
    const merged = [];
    for (const cl of clusters) {
        const last = merged[merged.length - 1];
        if (last && cl[0] - last[1] <= 40) last[1] = cl[1]; else merged.push([...cl]);
    }
    const wide = merged.filter(cl => cl[1] - cl[0] + 1 >= AW * 0.03);
    if (wide.length !== 2) return { err: `헤더에서 재화 알약 2개가 아니라 ${wide.length}덩어리가 잡혔다 — ${JSON.stringify(wide)} (메우기 전 ${JSON.stringify(merged)})` };
    // 세로는 **자격 열들의 연속 런 중앙값**으로 잡는다 — min/max 로 뭉치면 알약 아래 다른 요소가
    // 같은 밴드에 걸릴 때 통째로 늘어난다(pets-2 우 알약이 y3~61 로 잡혔던 실패).
    //
    // 🚨 가로는 자격 열의 min/max 로 재면 **양 끝이 잘린다** — 알약이 라운드 사각형이라 끝으로 갈수록
    //    세로 런이 짧아져 MINRUN(18) 밑으로 떨어진다(실측: 참 좌단 x29·우단 x91 인데 자격 열은
    //    x29~88 까지만 — 우단 3px 이 라운드 테이퍼로 탈락). 그래서 **알약 세로 중앙 행을 따라
    //    좌우로 걸어** 끝을 찾는다. 중앙 행에서는 라운드가 가장 넓고, 흰 숫자는 위아래로 비켜 있지
    //    않으므로 **시작점을 자격 열 안**(숫자가 아닌 solid 열)에서 잡아야 한다.
    //    ⚠️ 왼쪽으로 걸어도 아이콘에 안 붙는다 — 아이콘은 가는 윤곽선이라 중앙 행에서 이미 밝다
    //    (실측: 알 아이콘 x4~27 의 어두운 런은 전부 y10~21/y27~37 대역이라 중앙 y24 를 안 덮는다).
    const boxOf = (cl) => {
        const a = [], b = [];
        for (let x = cl[0]; x <= cl[1]; x++) if (runs[x]) { a.push(runs[x][0]); b.push(runs[x][1]); }
        const med = arr => { const s = [...arr].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
        const y1 = med(a), y2 = med(b), yc = Math.round((y1 + y2) / 2);
        let x1 = cl[0], x2 = cl[1];
        while (x1 - 1 >= appL && dark(at(x1 - 1, yc))) x1--;
        while (x2 + 1 <= appR && dark(at(x2 + 1, yc))) x2++;
        // 아이콘 끝(= 알약 조립체의 진짜 왼쪽 끝) — 바 좌단에서 왼쪽으로, 밴드 안 어두운 화소가
        // 20px 넘게 끊길 때까지. 원본은 아이콘이 바 좌단 **밖으로 걸치는 스티커**라 이게 있어야
        // '한쪽만 부속 포함'(함정 ①) 없이 두 그림을 같은 술어로 잴 수 있다.
        let ax = x1;
        for (let x = x1 - 1, gap = 0; x >= appL && gap <= 20; x--) {
            let any = false;
            for (let y = 0; y < BAND; y++) if (dark(at(x, y))) { any = true; break; }
            if (any) { ax = x; gap = 0; } else gap++;
        }
        return { x1, x2, y1, y2, ax };
    };
    const left = boxOf(wide[0]), right = boxOf(wide[1]);
    return { W, H, appL, appR, AW, left, right, nCluster: wide.length };
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && UI.els && !!UI.els.equipSheet, null, { timeout: 90000 });

    const refs = [];
    for (const [name, rel] of REFS) {
        const r = await page.evaluate(SCAN, ['data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, rel)).toString('base64')]);
        refs.push([name, r]);
    }

    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29 && UI.els && !!UI.els.equipSheet, null, { timeout: 90000 });
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () { };
        UI.toast = () => { }; UI.bossWarning = () => { }; UI.flashDamage = () => { };
        // 🚨 **재화 값을 원본과 같은 자릿수로 맞춘 뒤** 시트를 그린다 — 이게 이 도구의 핵심이다.
        //    이 알약은 폭이 **내용(숫자 길이)에 따라 늘어나는** content-width 다(고정 폭이 아니다).
        //    시드값(gems 8150 → "8.15k" 5글자)으로 그리면 알약이 원본("62" 2글자)보다 넓게 나와
        //    '재화 알약 폭 Δ' 가 뜨는데, 그건 **레이아웃 비율 결함이 아니라 숫자가 길 뿐**이다
        //    (실측: egg "2k"=68px vs gem "8.15k"=86px — 패딩·아이콘 동일, 글자 수만 다르다).
        //    비율(=같은 내용일 때 같은 모양인가)을 재려면 내용을 원본과 같게 고정해야 한다.
        //    원본 shot-042356/042445 는 egg "28" · gem "62" 다.
        S.eggCurrency = 28; S.gems = 62;
        UI.switchTab('summon'); UI.switchSummonSub('pets');
    });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => { });
    await page.waitForTimeout(600);
    const clone = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const vis = e => e && e.offsetParent !== null;
        const R = e => { const r = e.getBoundingClientRect(); return { x: r.x - app.x, y: r.y - app.y, w: r.width, h: r.height }; };
        const q = s => { const e = document.querySelector(s); return vis(e) ? R(e) : null; };
        return {
            app: { w: app.width, h: app.height },
            egg: q('#panel-pets .sheet-head .cur-pill.egg'),
            gem: q('#panel-pets .sheet-head .cur-pill.gem'),
        };
    });
    await browser.close();

    const bad = [];
    for (const [name, r] of refs) {
        if (r.err) { bad.push(`원본 ${name}: ${r.err}`); continue; }
        console.log(`REF ${name.padEnd(7)} ${r.W}x${r.H} · 앱 폭 ${r.AW} · 좌알약 바 x${r.left.x1}~${r.left.x2}(아이콘끝 x${r.left.ax}) y${r.left.y1}~${r.left.y2} · 우알약 바 x${r.right.x1}~${r.right.x2}(아이콘끝 x${r.right.ax})`);
        const lh = r.left.y2 - r.left.y1, rh2 = r.right.y2 - r.right.y1;
        if (Math.abs(lh - rh2) > 3) bad.push(`원본 ${name}: 좌우 알약 높이가 다르다(${lh} vs ${rh2}) — 제목/아이콘을 알약으로 잡았을 수 있다`);
    }
    if (!clone.egg || !clone.gem) bad.push(`클론 셀렉터 실패(알=${!!clone.egg} 젬=${!!clone.gem}) — 펫 시트가 안 열렸거나 마크업이 바뀌었다`);
    else console.log(`CLONE DOM · 앱 ${clone.app.w.toFixed(1)}x${clone.app.h.toFixed(1)} · 알 x${clone.egg.x.toFixed(1)} w${clone.egg.w.toFixed(1)} h${clone.egg.h.toFixed(1)} · 젬 x${clone.gem.x.toFixed(1)} w${clone.gem.w.toFixed(1)} h${clone.gem.h.toFixed(1)}`);
    if (bad.length) { console.log('\n=> 측정기 고장(exit 2): ' + bad.join(' · ')); process.exit(2); }

    // 두 원본 컷은 같은 헤더다 — 평균을 기준으로 쓰고, 둘이 서로 어긋나면 그것부터 인쇄한다.
    const rw = (r, v) => (v / r.AW) * 100, rh = (r, v) => (v / r.H) * 100;
    const cw = v => (v / clone.app.w) * 100, ch = v => (v / clone.app.h) * 100;
    const avg = fn => refs.reduce((s, [, r]) => s + fn(r), 0) / refs.length;
    const spread = fn => Math.max(...refs.map(([, r]) => fn(r))) - Math.min(...refs.map(([, r]) => fn(r)));

    // 🚨 **'좌'는 판정하지 않는다(참고만)** — 비평가 지적은 '폭 Δ5~6'(폭)이지 좌 위치가 아니고,
    //    좌 위치는 원본과 클론이 **구조가 달라 같은 술어로 못 잰다**: 원본은 재화 아이콘이 바 좌단
    //    **밖으로 걸치는 스티커**(shop-sheet 규약과 같은 오버행)이고 클론은 아이콘을 **상자 안에**
    //    품는다. 그래서 원본 조립체 좌(아이콘 픽셀 ax≈2%W)와 클론 상자 좌(13.5px=2.70%W)를 대면
    //    아이콘이 상자 밖이냐 안이냐라는 스킨/구조 차이가 그대로 Δ로 찍힌다(폭·비율 결함이 아니다).
    //    이 오버행 정합은 별도 폴리싱 소관 — 여기서는 참고로만 찍는다.
    const ROWS = [
        ['알 알약 폭', avg(r => rw(r, r.left.x2 + 1 - r.left.x1)), cw(clone.egg.w)],
        ['알 알약 높이', avg(r => rh(r, r.left.y2 + 1 - r.left.y1)), ch(clone.egg.h)],
        ['젬 알약 우단', avg(r => rw(r, r.right.x2 + 1 - r.appL)), cw(clone.gem.x + clone.gem.w)],
        ['젬 알약 폭', avg(r => rw(r, r.right.x2 + 1 - r.right.x1)), cw(clone.gem.w)],
        ['젬 알약 높이', avg(r => rh(r, r.right.y2 + 1 - r.right.y1)), ch(clone.gem.h)],
    ];
    const refLeftAsm = avg(r => rw(r, r.left.ax - r.appL));
    console.log(`\n원본 두 컷 편차(같은 헤더라 0에 가까워야 한다): 알 폭 ${spread(r => rw(r, r.left.x2 + 1 - r.left.x1)).toFixed(2)}%p · 젬 폭 ${spread(r => rw(r, r.right.x2 + 1 - r.right.x1)).toFixed(2)}%p`);
    console.log('\n단위 = 앱 폭/높이 대비 % · 허용 ±2%p');
    console.log('요소                 원본     클론      Δ%p   판정');
    let fail = 0;
    for (const [k, a, b] of ROWS) {
        const d = +(b - a).toFixed(2), ok = Math.abs(d) <= TOL;
        if (!ok) fail++;
        console.log(`${k.padEnd(20)} ${a.toFixed(2).padStart(7)} ${b.toFixed(2).padStart(8)} ${(d > 0 ? '+' : '') + d.toFixed(2)}   ${ok ? 'PASS' : 'FAIL'}`);
    }
    console.log(`\n[미판정 참고] 조립체 좌 — 원본 아이콘끝 ${refLeftAsm.toFixed(2)}%W(바 밖 오버행) vs 클론 상자 좌 ${cw(clone.egg.x).toFixed(2)}%W(아이콘 안품음) — 스킨/구조 차이라 폭 판정에서 제외(머리말)`);
    console.log(`콘솔/페이지 에러: ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    const pass = fail === 0 && errors.length === 0;
    console.log(pass ? '\nPASS — 초과 0건' : `\nFAIL — 초과 ${fail}건`);
    process.exit(pass ? 0 : 1);
})();
