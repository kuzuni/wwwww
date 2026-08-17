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
const FREEZE_3D = `Scene3D.update = function () {};`;

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
    for (const a of document.getAnimations()) {
        const el = a.effect && a.effect.target;
        if (!el || !el.getRootNode) continue;
        let base = 0;
        const cell = el.closest ? el.closest('.sr-cell') : null;
        if (a.animationName && HERO_ANIM.indexOf(a.animationName) >= 0) base = last;
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
    for (let t = 0; t <= 3000; t += 60) {
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
