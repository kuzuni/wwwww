// 소환 결과 연출 타임라인 실측 — 비평가 5차 지적 ⑴⑷⑸는 전부 '시간축' 문제라
// 눈대중이 아니라 프레임별 수치로 확인해야 한다.
//   ⑴ 인과 붕괴  → 화면 휘도의 **정점 시각**이 첫 아이콘 등장(UI.SR_CHARGE_MS)과 붙어 있는가
//   ⑷ 홀드백 정지 → 대기 구간의 **프레임 간 변화량**이 0이 아닌가
//   ⑸ 아이들 정지 → 연출 종료 후 구간의 프레임 간 변화량이 0이 아닌가
// 사용: PW_PATH=<playwright 경로> node probe-sr-timeline.js
//
// 캡처는 shot-summon-result.js와 같은 방식(3D 루프 정지 + 애니메이션 currentTime 시크).
// 픽셀 통계는 별도 빈 페이지에서 PNG를 캔버스로 디코드해 낸다(노드에 이미지 라이브러리 없음).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; S.summonCount = 5000;
    saveGame();
`;
const FREEZE_3D = `Scene3D.update = function () {};
    // 🚨 부팅 오버레이(#boot-loading)를 지운다 — 소등이 CSS transition 이라 시크의
    // getAnimations() 일괄 pause 에 걸리면 t0 프레임이 통째로 로딩 화면이 된다(실제로
    // tl-*/t0000 두 세트가 그렇게 구워졌고, 11차 B 9번 't0000 이 완전히 같은 프레임'
    // 지적의 정체가 이것이다). 경쟁이라 회차마다 걸리기도 안 걸리기도 한다.
    const bl = document.getElementById('boot-loading'); if (bl) bl.remove();`;

const SEEK = `(T => {
    const m = UI.els.summonResultModal;
    const cells = [...UI._srCells], d = UI._srDelays, last = d[d.length - 1];
    cells.forEach((c, i) => c.classList.toggle('on', d[i] <= T));
    m.classList.toggle('flash', !!UI._srHoldback && last <= T);
    m.classList.toggle('hero', UI._srHeroIdx >= 0 && last <= T);
    m.classList.toggle('charging', !!UI._srHoldback && d[d.length - 2] !== undefined
        && d[d.length - 2] <= T && T < last);
    m.classList.toggle('done', T >= last + UI.SR_TAIL_MS);
    // 바닥 반사는 finishSummonResult가 만든다 — 시크 경로는 타이머를 죽여 놓으므로 직접 부른다
    if (m.classList.contains('done')) UI.buildSummonReflection();
    else { const r = m.querySelector('.sr-reflect'); if (r) r.remove(); }
    const HERO_ANIM = ['srrecede', 'srheropop', 'srbeam', 'srheroring', 'srshakehit', 'srgridlift'];
    // 🚨 축적 구간 애니메이션의 원점은 0이 아니라 d[n-2]다 — 0으로 두면 currentTime이 지속시간을
    //    넘겨 전부 마지막 프레임에 고정되고, 그래서 '홀드백이 죽어 있다'가 계측상 항상 참이 된다.
    const CHARGE_ANIM = ['srfloorcharge', 'srtickup', 'srhalocharge', 'srvig'];
    for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        if (!el || !el.getRootNode) continue;
        let base = 0;
        const cell = el.closest ? el.closest('.sr-cell') : null;
        if (a.animationName && HERO_ANIM.indexOf(a.animationName) >= 0) base = last;
        else if (a.animationName && CHARGE_ANIM.indexOf(a.animationName) >= 0) base = d[d.length - 2] || 0;
        else if (cell) base = d[cells.indexOf(cell)] || 0;
        else if (el.classList && el.classList.contains('sr-flash')) base = last;
        a.pause();
        try { a.currentTime = Math.max(0, T - base); } catch (e) { /* 무한 반복 외 예외 무시 */ }
    }
})`;

// 4픽셀마다 표본을 뜬다(전 픽셀은 프레임 90장 × 412×915라 느리다 — 통계값은 동일 수준)
const STATS = `(async (b64, prev) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0, n = 0, max = 0, diff = 0;
    const cur = [];
    for (let i = 0; i < px.length; i += 16) { // 4픽셀 간격
        const l = (px[i] * .2126 + px[i + 1] * .7152 + px[i + 2] * .0722) / 255;
        sum += l; n++; if (l > max) max = l;
        cur.push(l);
        if (prev) diff += Math.abs(l - prev[n - 1]);
    }
    return { mean: sum / n, max, diff: prev ? diff / n : null, cur };
})`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && UI.els');
    await page.evaluate(SEED);
    await page.evaluate(FREEZE_3D);
    await page.waitForTimeout(200);

    await page.evaluate(`S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`);
    await page.evaluate(`UI.clearSummonTimers()`);
    const info = await page.evaluate(`({
        delays: UI._srDelays, hero: UI._srHeroIdx, holdback: !!UI._srHoldback,
        charge: UI.SR_CHARGE_MS, tail: UI.SR_TAIL_MS,
        rarities: [...UI._srCells].map(c => c.dataset.tier),
    })`);
    console.log('delays', JSON.stringify(info));

    const shot = await browser.newPage();
    await shot.goto('about:blank');

    const rows = [];
    let prev = null;
    // 🚨 예전엔 3000ms에서 끊었다. 아이들 루프의 주기가 1.9~3.6초인데 표본 구간이
    //    800ms(2200~3000)뿐이라 **한 호흡도 다 담기지 않았고**, 그래서 어떤 진폭을 넣어도
    //    "아이들이 정지"로 계측됐다(느린 루프를 짧은 창으로 재면 항상 평평하다).
    //    가장 느린 아이들 루프(3.6s 스윕)가 한 바퀴 이상 도는 5600ms까지 본다.
    for (let t = 0; t <= 5600; t += 60) {
        await page.evaluate(`(${SEEK})(${t})`);
        const buf = await page.screenshot();
        const st = await shot.evaluate(`(${STATS})(${JSON.stringify(buf.toString('base64'))}, ${prev ? JSON.stringify(prev) : 'null'})`);
        prev = st.cur;
        rows.push({ t, mean: st.mean, max: st.max, diff: st.diff, vec: st.cur });
    }

    const last = info.delays[info.delays.length - 1];
    console.log('\n  t(ms)   mean    max    Δ(직전프레임)');
    for (const r of rows) {
        const mark = r.t === info.charge ? ' ← 첫 아이콘' : (Math.abs(r.t - last) < 30 ? ' ← 주역 착지' : '');
        console.log(`  ${String(r.t).padStart(4)}   ${r.mean.toFixed(4)}  ${r.max.toFixed(3)}  `
            + `${r.diff === null ? '   -  ' : r.diff.toFixed(4)}${mark}`);
    }
    const peak = rows.reduce((a, b) => (b.mean > a.mean ? b : a));
    console.log(`\n⑴ 휘도 정점 t=${peak.t}ms (mean ${peak.mean.toFixed(4)}) / 첫 아이콘 t=${info.charge}ms`
        + ` → 간격 ${Math.abs(peak.t - info.charge)}ms`);
    // ⚠️ '프레임 간 변화 최소값'으로 정지 여부를 판정하면 **부드러운 맥동의 극점**(속도 0인 순간)을
    // 정지로 오독한다. 구간의 첫 프레임 대비 최대 차이(스프레드)를 함께 봐야 '같은 그림이 계속
    // 떠 있는가'라는 원래 지적에 답할 수 있다.
    const spread = win => {
        if (win.length < 2) return NaN;
        const a = win[0].vec;
        let mx = 0;
        for (const r of win.slice(1)) {
            let d = 0;
            for (let i = 0; i < a.length; i++) d += Math.abs(r.vec[i] - a[i]);
            mx = Math.max(mx, d / a.length);
        }
        return mx;
    };
    const report = (label, win) => {
        const ds = win.map(r => r.diff).filter(d => d !== null);
        const mean = ds.reduce((s, d) => s + d, 0) / ds.length;
        console.log(`${label} 프레임 간 변화 평균 ${mean.toFixed(5)} / 첫 프레임 대비 최대 차 ${spread(win).toFixed(5)}`
            + ` (둘 다 0이면 정지 화면)`);
    };
    report(`⑷ 홀드백 대기(${last - 300}~${last}ms)`, rows.filter(r => r.t >= last - 300 && r.t < last));
    report(`⑸ 종료 후 아이들(${last + info.tail + 120}ms~)`, rows.filter(r => r.t >= last + info.tail + 120));
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE/PAGE ERRORS');
    await browser.close();
})();
