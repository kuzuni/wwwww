// 스킬 '장착됨' 바 안 미니 오브 3개의 **피치·묶음 기하**가 원본과 같은가 (slug: equipped-icons-pitch).
// 사용: PW_PATH=<playwright> node probe-equipped-icons-pitch.js
//
// 🚨 **왜 이 자가 없었나** — `probe-equipped-label` 은 '바'와 '깃발'만 보고 **바 안에 든 오브**는
//    아무 축도 안 본다. `probe-skills-dom` 의 표에도 '장착됨 바' 한 줄뿐이라 **안쪽이 어떻게
//    배분되는지는 어느 게이트도 안 봤다.** 그래서 오브가 원본보다 촘촘히 붙어 묶음이 −2.83%p
//    좁아도 표는 계속 초록이었다(이 저장소가 반복해 밟는 '바깥 상자만 보는' 사각지대).
//
// ⚠️ **측정 규약**: 원본 = PNG 픽셀 · 클론 = DOM (이 저장소 규약). 그래서 **지름은 판정하지 않는다** —
//    픽셀은 '그려진 면', DOM 은 '박스'라 미세 편향이 있다. **피치(중심 간 거리)는 그 편향이 상쇄되므로**
//    그걸 1급 축으로 삼는다.
// 🚨 **원본 술어 함정 2개(실제로 밟았다, 다시 밟지 말 것)**:
//    ⑴ '밝은 화소(lum≥90)'로 재면 아이콘이 어두운 오브 하나만 27px 로 잡혀 **크기가 들쭉날쭉해 보인다**.
//       → **'채도(max−min>30) 또는 밝다'** 로 재면 셋 다 34px 로 균일하다.
//    ⑵ 바 **바깥**까지 훑으면 흰 페이지 배경이 4번째 '오브'로 잡힌다. → 근흑 바의 좌우 끝을 먼저 구해
//       **그 안에서만** 훑을 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const REF = path.resolve(__dirname, '../ref/screens/shot-042340.png');
const GATE = 2.0;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });

    // ── 원본: 픽셀 ──
    const p1 = await browser.newPage();
    await p1.setContent('<canvas id=c></canvas>');
    const ref = await p1.evaluate(async (src) => {
        const img = new Image(); await new Promise(k => { img.onload = k; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.getElementById('c'); c.width = W; c.height = H;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const lum = (x, y) => { const [r, gg, b] = at(x, y); return .299 * r + .587 * gg + .114 * b; };
        // 근흑 '장착됨' 바 찾기
        let y0 = -1, y1 = -1;
        for (let y = Math.round(H * .54); y < Math.round(H * .66); y++) {
            let n = 0; for (let x = 0; x < W; x++) if (lum(x, y) < 70) n++;
            if (n > W * .5) { if (y0 < 0) y0 = y; y1 = y; }
        }
        if (y0 < 0) return { err: '근흑 장착됨 바를 못 찾았다' };
        const my = Math.round((y0 + y1) / 2);
        let bx0 = -1, bx1 = -1;
        for (let x = 0; x < W; x++) if (lum(x, my) < 70) { if (bx0 < 0) bx0 = x; bx1 = x; }
        // 바 **안에서만**, 오브 세로 중앙 띠에서 '채도 있거나 밝은' 열
        const yA = y0 + Math.round((y1 - y0) * .08), yB = y0 + Math.round((y1 - y0) * .86);
        const cols = [];
        for (let x = bx0; x <= bx1; x++) {
            let n = 0;
            for (let y = yA; y <= yB; y++) { const [r, gg, b] = at(x, y); const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); if (mx - mn > 30 || lum(x, y) > 90) n++; }
            if (n >= 5) cols.push(x);
        }
        const gr = []; let a = cols[0], pv = cols[0];
        for (const x of cols.slice(1)) { if (x - pv > 4) { gr.push([a, pv]); a = x; } pv = x; }
        if (cols.length) gr.push([a, pv]);
        // '장착됨' 흰 라벨은 바 왼쪽에 있고 훨씬 넓다 — 오브는 서로 폭이 같은 덩어리들이다
        const blobs = gr.filter(([s, e]) => { const w = e - s + 1; return w >= 20 && w <= (bx1 - bx0) * .18; });
        return { W, H, y0, y1, bx0, bx1, blobs };
    }, 'data:image/png;base64,' + fs.readFileSync(REF).toString('base64'));

    if (ref.err || !ref.blobs || ref.blobs.length !== 3) {
        console.error(`측정기 고장 — 원본에서 미니 오브 3개를 못 잡았다 (${ref.err || (ref.blobs || []).length + '개}'}). 술어·구간을 의심할 것(머리말 함정 2개 참조).`);
        await browser.close(); process.exit(2);
    }

    const RW = ref.W;
    const rCtr = ref.blobs.map(([s, e]) => (s + e) / 2 / RW * 100);
    const rPitch = rCtr.slice(1).map((v, i) => v - rCtr[i]);
    const rL = ref.blobs[0][0] / RW * 100, rR = (ref.blobs[2][1] + 1) / RW * 100;
    console.log(`■ 원본 ${ref.W}x${ref.H} — 바 y${ref.y0}~${ref.y1} x${ref.bx0}~${ref.bx1}`);
    console.log(`  오브 3개 ` + ref.blobs.map(([s, e]) => `x${s}~${e}(${e - s + 1}px)`).join(' ') + `  피치 ${rPitch.map(v => v.toFixed(2)).join('/')}%W · 묶음 ${rL.toFixed(2)}~${rR.toFixed(2)}%W`);

    // ── 클론: DOM ──
    const p2 = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    p2.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    await p2.goto(INDEX, { waitUntil: 'load' });
    await waitReady(p2, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await p2.evaluate(SEED_SRC);
    await p2.reload({ waitUntil: 'load' });
    await waitReady(p2, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && S && S.forgeLevel === 29', { label: '시드 상태 로드' });
    await p2.evaluate(() => {
        UI.toast = () => { }; UI.showCraftModal = () => { }; UI.resolvePendingCraft = () => { };
        S.autoForgeOn = false; S.pendingCraft = null; UI._pendingItem = null;
        UI.els.craftModal.classList.add('hidden');
        S.summonMult = { skill: 5, pet: 1, mount: 1 };
        UI.switchTab('summon'); UI.switchSummonSub('skills');
    });
    // ⚠️ 고정 대기 금지(TODO 함정 ⑤) — 값이 두 번 연속 같을 때까지 폴링한다
    let prev = null, cur = null;
    for (let i = 0; i < 120; i++) {
        cur = await p2.evaluate(() => {
            const app = document.querySelector('#app').getBoundingClientRect();
            const minis = [...document.querySelectorAll('#panel-skills .sk-mini')].map(e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
            return JSON.stringify({ appL: app.left, appW: app.width, minis });
        });
        if (cur === prev) break; prev = cur; await p2.waitForTimeout(120);
    }
    const m = JSON.parse(cur);
    if (m.minis.length !== 3) {
        console.error(`측정기 고장 — 클론 .sk-mini 가 3개가 아니라 ${m.minis.length}개다(시드 장착 스킬 수가 바뀌었나?).`);
        await browser.close(); process.exit(2);
    }
    const pw = v => (v - m.appL) / m.appW * 100;
    const cCtr = m.minis.map(([l, r]) => pw((l + r) / 2));
    const cPitch = cCtr.slice(1).map((v, i) => v - cCtr[i]);
    const cL = pw(m.minis[0][0]), cR = pw(m.minis[2][1]);
    console.log(`■ 클론 (DOM) 앱폭 ${m.appW.toFixed(1)} — 피치 ${cPitch.map(v => v.toFixed(2)).join('/')}%W · 묶음 ${cL.toFixed(2)}~${cR.toFixed(2)}%W`);

    const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
    const rows = [
        ['피치(평균)', avg(rPitch), avg(cPitch)],
        ['묶음 좌단', rL, cL],
        ['묶음 우단', rR, cR],
        ['묶음 폭', rR - rL, cR - cL],
    ];
    console.log('\n===== 대조 (단위 = 각 판 앱 폭 %) =====');
    let fail = 0;
    for (const [label, a, b] of rows) {
        const d = b - a, bad = Math.abs(d) > GATE;
        if (bad) fail++;
        console.log(`${label.padEnd(12)} 원본 ${a.toFixed(2)}  vs  클론 ${b.toFixed(2)}   (Δ ${d >= 0 ? '+' : ''}${d.toFixed(2)}%p) ${bad ? '✗' : 'OK'}`);
    }
    console.log('  ⚠️ 지름은 판정하지 않는다(원본=픽셀 면 / 클론=DOM 박스라 편향이 남는다) — 피치가 그 편향을 상쇄하는 축이다.');
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    console.log('\n' + (fail ? `FAIL — ±${GATE}%p 초과 ${fail}건` : 'PASS'));
    await browser.close();
    process.exit(fail || errs.length ? 1 : 0);
})();
