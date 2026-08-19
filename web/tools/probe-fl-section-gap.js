// forge-list(shot-042905) **시대 섹션 사이 간격** 판정기 — 원본 PNG 와 클론 캡처를 같은 픽셀 코드로 잰다.
//
// 왜 새로 만드나: `probe-fl-body` 는 머리말에 적힌 대로 **타일 개수가 원본 23종 vs 클론 30종이라
// '패널 높이·파란 중세의 필 위치·카드 세로 내부 배분'을 일부러 미판정**으로 두었다. 그건 옳은
// 판단이지만, 그 그늘에 **개수와 무관한 값**이 하나 숨어 있었다 — `.forge-age-list` 의 flex `gap`,
// 즉 **회색 그리드 패널 하단 ↔ 다음 시대 막대 상단** 간격이다. 이건 타일이 몇 개든 같은 값이라
// 판정할 수 있는데 아무도 안 봤고, 2026-08-19 R4 채점에서 비평가 2인이 독립적으로 짚었다
// (A '카드 하단 여백 −3.1%p' · B '등급 그룹 하단↔다음 헤더 −3.8%p' — 같은 자리를 다르게 불렀다).
//
// 재는 것: **패널 하단 ↔ 다음(중세의) 막대 상단 간격**(%H). 개수 의존 값은 재지 않는다.
//
// 측정 방식 — 원본은 픽셀, **클론은 DOM**이다:
//   ⓐ 원본: 파란 '중세의' 막대 = 가로로 이미지 폭 35% 이상 이어지는 파랑(b−r≥60·b≥170) 런이 있는
//      행들의 첫 덩어리. 거기서 위로 올라가며 막대 좌우 폭 안의 화소가 **밝은 카드 바탕**인 비율이
//      절반 아래로 떨어지는 첫 행을 회색 패널 하단으로 잡는다(막대 자신의 키라인 줄은 건너뛴다).
//   ⓑ 클론: `.forge-age-section` 두 개의 rect 로 잰다 = 앞 섹션 하단 → 다음 섹션 상단.
//      🚨 **클론을 캡처로 재면 안 된다(밟았다)** — 클론은 원시적 시대가 30종(6행)이라 이 간격을
//      원본대로 벌리는 순간 파란 막대가 스크롤 뷰포트 **밖으로 밀려나** 그림에서 사라진다.
//      그러면 판정기가 '막대를 못 잡았다'로 고장 나서, 고친 뒤에 오히려 못 재게 된다.
//      DOM 은 스크롤과 무관하므로 개수 차이에 흔들리지 않는다.
//
// 🚨 자기검증: 두 그림 다 ⑴ 막대를 찾았고 ⑵ 패널 하단이 막대 상단보다 위에 있으며
//    ⑶ 간격이 0~15%H 범위여야 한다. 어긋나면 수치를 인쇄하지 않고 exit 2(측정기 고장)로 끊는다.
//
// 사용: node tools/probe-fl-section-gap.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const REF_PNG = path.resolve(__dirname, '../ref/screens/shot-042905.png');
const SC = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TOL = 2.0;

const SCAN = function (src) {
    return new Promise(async (resolve) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const blue = p => p[2] >= 170 && p[2] - p[0] >= 60;
        const paper = p => Math.min(...p) >= 210 && Math.max(...p) >= 232 && (Math.max(...p) - Math.min(...p)) <= 20;

        // ⓐ 파란 시대 막대 — 폭 35%W 이상 이어지는 파랑 런이 있는 행들의 첫 덩어리
        const minRun = Math.round(W * 0.35);
        const hits = [];
        for (let y = 0; y < H; y++) {
            let s = -1, bestRun = null;
            for (let x = 0; x <= W; x++) {
                const on = x < W && blue(at(x, y));
                if (on && s < 0) s = x;
                if (!on && s >= 0) { if (!bestRun || x - s > bestRun[1] - bestRun[0]) bestRun = [s, x - 1]; s = -1; }
            }
            if (bestRun && bestRun[1] - bestRun[0] + 1 >= minRun) hits.push({ y, a: bestRun[0], b: bestRun[1] });
        }
        if (!hits.length) return resolve({ W, H, bar: null });
        const groups = [];
        for (const h of hits) {
            const g = groups[groups.length - 1];
            if (g && h.y <= g.y1 + 2) { g.y1 = h.y; g.rows.push(h); } else groups.push({ y0: h.y, y1: h.y, rows: [h] });
        }
        groups.sort((p, q) => (q.y1 - q.y0) - (p.y1 - p.y0));
        const g = groups[0];
        const barL = Math.min(...g.rows.map(v => v.a)), barR = Math.max(...g.rows.map(v => v.b));
        const bar = { top: g.y0, bot: g.y1, l: barL, r: barR };

        // ⓑ 막대 위로 올라가며 '카드 바탕' 비율이 절반 아래로 떨어지는 첫 행 = 회색 패널 하단
        // 🚨 막대 바로 위 몇 줄은 막대 자신의 검정 키라인/그림자다(클론은 그라데이션이라 파랑
        //    술어가 그 줄을 놓친다) — 먼저 **카드 바탕이 나오는 줄까지 건너뛴 뒤** 위로 걷는다.
        //    안 그러면 클론 간격이 0 으로 읽혀 교정 후에도 1%p 가량 낮게 나온다(밟았다).
        let panelBot = null;
        const yStop = Math.max(0, bar.top - Math.round(H * 0.15));
        const frac = y => { let n = 0, tot = 0; for (let x = barL; x <= barR; x++) { tot++; if (paper(at(x, y))) n++; } return n / tot; };
        let y = bar.top - 1;
        while (y >= yStop && frac(y) < 0.5) y--;      // 키라인 건너뛰기
        const gapTop = y;                              // 여기부터가 진짜 카드 바탕(간격)이다
        for (; y >= yStop; y--) if (frac(y) < 0.5) { panelBot = y; break; }
        if (panelBot != null) return resolve({ W, H, bar, panelBot, gapTop });
        resolve({ W, H, bar, panelBot: null, gapTop: null });
    });
};

const MEASURE_CLONE = () => {
    const secs = [...document.querySelectorAll('.forge-age-list > .forge-age-section')];
    if (secs.length < 2) return { err: `시대 섹션이 ${secs.length}개다(2개 이상이라야 간격을 잰다)` };
    const a = secs[0].getBoundingClientRect(), b = secs[1].getBoundingClientRect();
    const app = document.getElementById('app').getBoundingClientRect();
    return { gap: b.top - a.bottom, appH: app.height };
};

(async () => {
    if (!fs.existsSync(REF_PNG)) { console.log(`원본 컷이 없다: ${REF_PNG}`); process.exit(2); }
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('CONSOLE ' + m.text()); });
    const ref = await page.evaluate(SCAN, 'data:image/png;base64,' + fs.readFileSync(REF_PNG).toString('base64'));

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!UI.els && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.evaluate(() => { UI.openForgeInfo(); UI.openForgeList(); });
    await page.waitForTimeout(500);
    const clone = await page.evaluate(MEASURE_CLONE);
    await browser.close();
    if (clone.err) { console.log('측정기 고장(BROKEN) — ' + clone.err); process.exit(2); }

    const broken = [];
    if (!ref.bar) broken.push('원본에서 파란 시대 막대를 못 잡았다');
    else if (ref.panelBot == null) broken.push('원본에서 막대 위 회색 패널 하단을 못 잡았다');
    else {
        const g = ref.gapTop - ref.panelBot;
        if (!(g >= 0 && g / ref.H <= 0.15)) broken.push(`원본 간격이 ${(g / ref.H * 100).toFixed(2)}%H 다(0~15% 밖)`);
    }
    if (!(clone.gap >= 0 && clone.gap / clone.appH <= 0.15)) broken.push(`클론 간격이 ${(clone.gap / clone.appH * 100).toFixed(2)}%H 다(0~15% 밖)`);
    if (broken.length) {
        console.log(`측정기 고장(BROKEN) — 수치를 인쇄하지 않는다:\n  · ${broken.join('\n  · ')}`);
        process.exit(2);
    }

    const a = (ref.gapTop - ref.panelBot) / ref.H * 100;
    const b = clone.gap / clone.appH * 100;
    console.log(`원본 042905 ${ref.W}x${ref.H} · 막대 y${ref.bar.top}~${ref.bar.bot} x${ref.bar.l}~${ref.bar.r} · 패널 하단 y${ref.panelBot} · 간격 ${ref.gapTop - ref.panelBot}px`);
    console.log(`클론 forge-list 앱 높이 ${clone.appH} · 섹션 간격 ${clone.gap.toFixed(1)}px`);
    const dd = b - a;
    const bad = Math.abs(dd) > TOL;
    console.log(`  ${bad ? '✗' : '·'} 섹션 간격(패널하단→다음막대)  원본 ${a.toFixed(2)}  클론 ${b.toFixed(2)}  Δ${dd >= 0 ? '+' : ''}${dd.toFixed(2)}%p${bad ? '  ← ±2%p 초과' : ''}`);
    if (errors.length) console.log('콘솔 에러:\n' + errors.join('\n'));
    console.log(`\n판정: ${bad || errors.length ? '불통과' : '통과'} — 초과 ${bad ? 1 : 0}건 · 최대 편차 ${dd >= 0 ? '+' : ''}${dd.toFixed(2)}%p · 콘솔 에러 ${errors.length}건`);
    process.exit(bad || errors.length ? 1 : 0);
})();
