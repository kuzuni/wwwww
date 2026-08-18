// 아웃라인(테두리) 두께가 앱 축소를 따라가는지 검증 — slug: art-outline-scale
//
// 배경: `fitLayout()`(js/main.js)은 9:16 레터박스로 #app 을 줄이고 루트 폰트를 `h/844*16` 로 같이 줄여
//       "세로 모드와 같은 그림이 그대로 작아지는" 것을 노린다. 레이아웃 치수는 전부 rem 이라 같이 줄지만,
//       `css/style.css` 의 테두리는 전부 `px` 고정이라 **앱이 작아질수록 상대적으로 두꺼워진다.**
//
// 재는 것 (전부 DOM 실측, 화면 캡처 불필요):
//   ⑴ 뷰포트별 앱 상자·루트 폰트·기준(499x892) 대비 축소율
//   ⑵ #app 안 **보이는 테두리 요소 전부**를 DOM 인덱스 경로로 식별해, 기준 뷰포트와 같은 요소끼리
//      `테두리두께 / 요소폭 * 100` (=화풍 비중) 을 비교 → %p 편차. 이게 이 항목의 결함 그 자체다.
//   ⑶ Chrome 의 테두리 **사용값(used value) 계단** — 소수 px 을 주면 어디서 3→2px 로 떨어지는지.
//      항목이 제안한 `min(3px, .1875rem)` 처방의 임계 뷰포트를 정하려면 이 계단을 먼저 알아야 한다.
//   ⑷ 처방 시뮬레이션 — style.css 를 **건드리지 않고** 프로브 요소에 후보 식을 먹여
//      뷰포트별로 실제 몇 px 이 되는지 미리 본다(기준 뷰포트에서 정확히 3px 인지가 핵심).
//
// ⚠️ 이 저장소의 Playwright 는 문자열 화살표 함수를 '식'으로 평가해 undefined 를 준다 →
//    반드시 `page.evaluate('(' + FN + ')()')` 로 즉시호출할 것 (UI 인계 메모 ㉠).
// ⚠️ 헤드리스는 rAF 가 1~2fps 라 Scene3D.update·Combat.tick 을 비워야 측정이 안정된다(QA 15차 ⓐ).
//
// 사용: node probe-outline-scale.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 기준(합성 대조 캡처가 쓰는 크기)을 **맨 앞**에 둔다 — 뒤 뷰포트는 전부 이 값과 비교된다.
const REF = { w: 499, h: 892 };
const VIEWPORTS = [
    REF,
    { w: 390, h: 844 }, { w: 932, h: 430 }, { w: 844, h: 390 },
    { w: 640, h: 360 }, { w: 568, h: 320 }, { w: 320, h: 568 },
];
const TOL = 2.0;      // 항목 검증 기준: 기준 뷰포트 비중 대비 ±2%p
const MIN_W = 8;      // 이보다 좁은 요소는 비중이 폭발해 의미가 없다(구분선·아이콘 조각)

const MEASURE = `() => {
    const app = document.getElementById('app');
    const a = app.getBoundingClientRect();
    const out = {
        app: { w: +a.width.toFixed(1), h: +a.height.toFixed(1) },
        root: parseFloat(getComputedStyle(document.documentElement).fontSize),
        els: [], step: [], rx: {},
    };

    const visible = el => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0.5 && r.height > 0.5;
    };
    // 닫힌 패널/모달은 화면 밖에 대기하는 게 정상이다 — 열린 표면만 본다.
    const parked = el => !!el.closest('.panel:not(.open), .modal:not(.open), #fx-layer');
    // 뷰포트가 달라도 같은 요소를 가리키는 안정 키 — #app 기준 자식 인덱스 경로.
    const pathOf = el => {
        const p = [];
        for (let n = el; n && n !== app; n = n.parentElement) p.unshift([...n.parentElement.children].indexOf(n));
        return p.join('/');
    };

    for (const el of app.querySelectorAll('*')) {
        if (!visible(el) || parked(el)) continue;
        const s = getComputedStyle(el);
        // 사용값(used value). Chrome 은 소수 지정을 계단으로 내려 쓰므로 이 값이 화면에 실제로 그려진 두께다.
        const bw = parseFloat(s.borderTopWidth) || 0;
        if (bw < 0.5) continue;
        if (s.borderTopStyle === 'none' || s.borderTopStyle === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width < ${MIN_W}) continue;
        out.els.push({
            p: pathOf(el),
            cls: (el.className.toString() || el.tagName.toLowerCase()).trim().replace(/\\s+/g, '.').slice(0, 30),
            bw: +bw.toFixed(2), w: +r.width.toFixed(2),
            ratio: +(bw / r.width * 100).toFixed(3),
        });
    }

    // ⑶ 테두리 사용값 계단 — 0.5~4.0px 을 0.05 간격으로 먹여 실제 사용값을 읽는다.
    const t = document.createElement('div');
    t.style.cssText = 'position:absolute;left:-9999px;top:0;width:40px;height:40px;border-style:solid';
    document.body.appendChild(t);
    for (let v = 0.5; v <= 4.001; v += 0.05) {
        const q = Math.round(v * 100) / 100;
        t.style.borderTopWidth = q + 'px';
        out.step.push([q, +parseFloat(getComputedStyle(t).borderTopWidth).toFixed(3)]);
    }
    // ⑷ 처방 시뮬레이션 — style.css 는 안 건드리고 후보 식만 먹여 본다.
    for (const [name, expr] of [
        ['3px', '3px'], ['min(3px,.1875rem)', 'min(3px, .1875rem)'],
        ['2px', '2px'], ['min(2px,.125rem)', 'min(2px, .125rem)'],
        ['1px', '1px'], ['min(1px,.0625rem)', 'min(1px, .0625rem)'],
    ]) {
        t.style.borderTopWidth = expr;
        out.rx[name] = +parseFloat(getComputedStyle(t).borderTopWidth).toFixed(3);
    }
    t.remove();
    return out;
}`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    const rows = [];

    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        page.on('pageerror', e => errs.push(`${vp.w}x${vp.h}: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${vp.w}x${vp.h}: ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
        await page.evaluate(() => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            if (typeof Combat !== 'undefined') Combat.tick = function () {};
            // 캡처 시드가 자동 제련을 켠 채 저장돼 부팅 직후 보류 제작 팝업이 떠 있다(UI 인계 메모 ㉤).
            // 팝업이 뜬 채로 재면 메인 화면 테두리가 절반쯤 parked 로 빠진다.
            if (typeof S !== 'undefined') { S.pendingCraft = null; }
            if (typeof UI !== 'undefined') { UI._pendingItem = null; }
            const cm = document.getElementById('craftModal');
            if (cm) cm.classList.remove('open');
        });
        await page.waitForTimeout(200);
        const m = await page.evaluate(`(${MEASURE})()`);
        rows.push({ vp: `${vp.w}x${vp.h}`, ...m });
        await page.close();
    }
    await browser.close();

    const ref = rows[0];
    const refMap = new Map(ref.els.map(e => [e.p, e]));
    const refH = ref.app.h;

    console.log('=== ⑴ 뷰포트별 앱 상자 / 루트 폰트 / 기준 대비 축소율 ===');
    console.log('vp          앱상자        rootFont  기준대비  테두리요소');
    for (const r of rows) {
        console.log(`${r.vp.padEnd(11)} ${(r.app.w + 'x' + r.app.h).padEnd(13)} `
            + `${r.root.toFixed(2).padStart(6)}px  ${(r.app.h / refH * 100).toFixed(1).padStart(6)}%  ${String(r.els.length).padStart(6)}개`);
    }

    console.log('\n=== ⑵ 화풍 비중(테두리두께 / 요소폭 %) — 기준 499x892 대비 편차 ===');
    console.log('   같은 요소(DOM 경로 일치)끼리만 비교한다. 편차 > ' + TOL + '%p 가 이 항목의 결함이다.');
    const worstAll = [];
    for (const r of rows.slice(1)) {
        const diffs = [];
        for (const e of r.els) {
            const b = refMap.get(e.p);
            if (!b) continue;
            diffs.push({ ...e, base: b.ratio, d: +(e.ratio - b.ratio).toFixed(3) });
        }
        diffs.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
        const over = diffs.filter(d => Math.abs(d.d) > TOL);
        const maxD = diffs.length ? diffs[0].d : 0;
        worstAll.push({ vp: r.vp, n: diffs.length, over: over.length, maxD });
        console.log(`\n  ${r.vp}  대조 ${diffs.length}개 · ±${TOL}%p 초과 ${over.length}개 · 최대 ${maxD >= 0 ? '+' : ''}${maxD}%p`);
        for (const d of diffs.slice(0, 6)) {
            console.log(`    ${(d.d >= 0 ? '+' : '') + d.d.toFixed(2).padStart(6)}%p  .${d.cls.padEnd(30)} `
                + `${d.bw}px/${d.w}px = ${d.ratio.toFixed(2)}%  (기준 ${d.base.toFixed(2)}%)`);
        }
    }

    console.log('\n=== ⑶ Chrome 테두리 사용값 계단 (지정 → 실제) ===');
    const st = ref.step;
    const edges = [];
    for (let i = 1; i < st.length; i++) if (st[i][1] !== st[i - 1][1]) edges.push(`${st[i - 1][0]}px→${st[i - 1][1]} | ${st[i][0]}px→${st[i][1]}`);
    console.log('   경계: ' + (edges.length ? edges.join('   ') : '없음(지정값 그대로 쓴다)'));

    console.log('\n=== ⑷ 처방 시뮬레이션 — 후보 식이 뷰포트별로 실제 몇 px 이 되는가 ===');
    const keys = Object.keys(ref.rx);
    console.log('vp          ' + keys.map(k => k.padStart(18)).join(''));
    for (const r of rows) console.log(r.vp.padEnd(11) + ' ' + keys.map(k => (r.rx[k] + 'px').padStart(18)).join(''));

    // ⑸ 처방을 **적용했다고 치고** 요소별 비중 편차를 미리 계산한다 — style.css 는 손대지 않는다.
    //    ⑶ 에서 잰 Chrome 계단이 `used(v) = max(1, floor(v))` 임을 확인했으므로 그대로 쓴다.
    //    (기준 뷰포트의 사용값 = 선언값이다. 선언이 소수였다면 이미 계단을 탄 뒤라 여기서도 같은 값이 나온다.)
    const stepFn = v => Math.max(1, Math.floor(v + 1e-6));
    const stepOK = st.every(([q, u]) => u === stepFn(q));
    console.log('\n=== ⑸ 처방(`min(Npx, N/16rem)`) 적용 시 예상 화풍 비중 편차 ===');
    console.log(`   계단식 used(v)=max(1,floor(v)) 가 ⑶ 실측과 일치: ${stepOK ? 'YES' : 'NO ⚠ 아래 예측은 신뢰 불가'}`);
    // 계단이 **내림**이라 `min(Npx, N/16rem)` 은 항상 아래로 떨어진다(2.46px 이 2px 이 아니라… 은 맞지만
    // 1.64px 이 1px 로 간다). `+.49px` 을 얹으면 내림이 반올림처럼 동작한다 — 두 후보를 나란히 잰다.
    const CANDS = [
        { name: 'min(Npx, N/16rem)', f: (bw, root) => Math.min(bw, bw / 16 * root) },
        { name: 'min(Npx, N/16rem + .49px)', f: (bw, root) => Math.min(bw, bw / 16 * root + 0.49) },
    ];
    const b0 = d => `${d.sim}px/${d.w.toFixed(1)}px = ${(d.sim / d.w * 100).toFixed(2)}% (기준 ${d.base.toFixed(2)}%)`;
    const simBadByCand = [];
    for (const c of CANDS) {
        console.log(`\n  [${c.name}]`);
        console.log('  vp          대조  ±' + TOL + '%p초과  최대편차   최악 요소');
        const simRows = [];
        for (const r of rows) {
            const diffs = [];
            for (const e of r.els) {
                const b = refMap.get(e.p);
                if (!b) continue;
                // 선언값(=기준 뷰포트 사용값) b.bw 에 처방을 먹인다.
                const sim = stepFn(c.f(b.bw, r.root));
                diffs.push({ ...e, sim, base: b.ratio, d: +(sim / e.w * 100 - b.ratio).toFixed(3) });
            }
            diffs.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
            const over = diffs.filter(d => Math.abs(d.d) > TOL);
            const w0 = diffs[0];
            simRows.push({ vp: r.vp, over: over.length, maxD: w0 ? w0.d : 0 });
            console.log(`  ${r.vp.padEnd(11)} ${String(diffs.length).padStart(4)}  ${String(over.length).padStart(8)}  `
                + `${((w0 && w0.d >= 0 ? '+' : '') + (w0 ? w0.d.toFixed(2) : '0')).padStart(7)}%p  `
                + (w0 ? `.${w0.cls} ${b0(w0)}` : ''));
        }
        simBadByCand.push({ name: c.name, bad: simRows.filter(s => s.over > 0) });
    }
    const simBad = simBadByCand[0].bad;
    for (const s of simBadByCand.slice(1)) {
        console.log(`   · [${s.name}] ±${TOL}%p 초과 뷰포트 ${s.bad.length}개` + (s.bad.length ? ' — ' + s.bad.map(b => `${b.vp}(${b.over}개, 최대 ${b.maxD > 0 ? '+' : ''}${b.maxD}%p)`).join(' · ') : ''));
    }
    console.log(simBad.length
        ? `   → 처방 후에도 ${simBad.length}개 뷰포트가 ±${TOL}%p 를 넘는다: ` + simBad.map(s => `${s.vp}(${s.over}개, 최대 ${s.maxD > 0 ? '+' : ''}${s.maxD}%p)`).join(' · ')
          + `\n     ⚠ Chrome 은 실선 테두리를 **1px 밑으로 못 그린다**(⑶ 계단의 하한). 작은 뷰포트의 좁은 요소는`
          + `\n       이상 비례값이 1px 미만이라 처방으로도 못 내려간다 — 이건 처방 결함이 아니라 물리적 하한이다.`
        : `   → 처방 후 전 뷰포트 ±${TOL}%p 이내`);

    console.log('\n=== 판정 ===');
    const refOK = keys.filter(k => /^min/.test(k)).every(k => {
        const plain = k.replace(/^min\(([0-9.]+px).*/, '$1');
        return ref.rx[k] === ref.rx[plain];
    });
    console.log(`  · 기준 뷰포트(499x892)에서 min() 처방 = 고정 px 과 동일한가: ${refOK ? 'YES (등재 실측치 안 흔들림)' : 'NO ⚠ 처방 재설계 필요'}`);
    const bad = worstAll.filter(w => w.over > 0);
    if (bad.length) {
        console.log(`  · FAIL — ${bad.length}개 뷰포트에서 ±${TOL}%p 초과: ` + bad.map(b => `${b.vp}(${b.over}개, 최대 ${b.maxD > 0 ? '+' : ''}${b.maxD}%p)`).join(' · '));
    } else {
        console.log(`  · PASS — 전 뷰포트에서 화풍 비중 편차 ±${TOL}%p 이내`);
    }
    if (errs.length) { console.log('\n콘솔 에러:'); errs.slice(0, 10).forEach(e => console.log('  ' + e)); }
    process.exit(bad.length || errs.length ? 1 : 0);
})();
