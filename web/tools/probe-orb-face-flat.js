// 스킬 오브 **면이 납작한가**(원본처럼) 를 원본 PNG 와 클론을 같은 자로 재서 판정한다.
//
// 왜 이 자가 따로 필요한가 — `probe-skill-orb-ink` 는 '오브 바탕 = 휘도 최빈값' **하나**를 전제로
// 모티프를 가른다. 그 전제는 **면이 평평할 때만** 성립하는데, 클론 오브는 오래도록 유광
// (스페큘러 + 세로 그라디언트 + 등급색 글로우)이라 **면 자체가 잉크로 잡혔다** — 글리프를 하나도
// 안 그려도 잉크율 16.5% 가 나왔고, 세 세션이 그 수치를 '글리프 탓'으로 읽었다. 즉 이 자는
// `probe-skill-orb-ink` 의 **전제를 지키는 자**다. 이게 빨개지면 저쪽 절대 대조도 같이 무의미해진다.
//
// 판정축 3가지 — 전부 **원본 12개 ↔ 클론 12개(미장착만)** 평균으로 맞댄다.
//   ⓐ **면 색 응집도**: 오브 원반(r < 0.80R)에서 색을 16단위로 양자화해 최빈색을 면 색으로 잡고,
//      그 색과 RGB 거리 ≤ 20 인 화소 비율. 평평한 면은 한 색으로 뭉치고, 그라디언트는 안 뭉친다.
//      🚨 이 값은 **글리프가 면을 얼마나 덮느냐에도 좌우된다** — 그래서 절대값이 아니라 **원본과의
//         격차**로만 판정한다(원본도 글리프가 큰 오브에선 30% 아래로 떨어진다).
//      🚨 그리고 **캡처마다 ±1%p 안팎으로 흔들린다** — `shot-screens.js` 가 캡처마다 보유 스킬을
//         새로 굴려 글리프 구성이 달라지기 때문이다(실측: 같은 코드로 27.3% / 28.4%). 그래서
//         하한을 −10%p 로 넉넉히 뒀다. **ⓐ 만 갖고 1~2%p 차이를 논하지 말 것** — 그 눈금은 없다.
//         갈리는 축은 ⓑ 다(0.0 ↔ 20.1, 200배).
//   ⓑ **옆구리 채도**: 테 **바깥** 띠(1.10~1.36R)에서, 꼬리·별·게이지를 피해 **3시·9시 옆구리만**
//      (|dy| < 0.42R) 골라 평균 채도(max−min). 등급색 글로우가 있으면 여기가 물든다.
//      실측: 원본 **0.1** ↔ 유광 시절 클론 **20.1**(200배). 이 축이 셋 중 가장 결정적이다.
//   ⓒ **스펙큘러 화소율**: 원반 위쪽에서 '면 색보다 L 이 28 이상 밝으면서 면보다 훨씬 무채색'인
//      화소 비율. 좌상단 유광 한 점이 여기 잡힌다.
//
// 🚨 **자기검증(음성 대조)을 자 안에 박아 두었다.** 이 저장소가 반복해 데인 자리다 — '일부러 틀리게
//    만들어 FAIL 이 나는지' 를 확인하지 않은 게이트는 무의미하다(`probe-tri-dom` 이 28% 크기 오차를
//    통과시킨 적이 있다). 그래서 아래는 **살아 있는 페이지에 옛 유광 스킨을 도로 주입해** 찍고,
//    그 판이 **반드시 FAIL 이 나는지**까지 확인한다. 음성 대조가 통과해 버리면 측정기 고장(exit 2)이다.
//
// 사용: node probe-orb-face-flat.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const { assertFresh } = require('./clone-fresh.js');

assertFresh('tools/ref-cmp/clone/skills.png',
    ['web/js/icongen.js', 'web/js/skills.js', 'web/js/ui.js', 'web/css'],
    'node tools/shot-skills.js   # → tools/ref-cmp/clone/skills.png 를 다시 굽는다');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 오브 격자 기하 — `probe-skill-orb-ink` 와 같은 값(거기서 자기검증까지 끝난 좌표다).
const REF = { file: path.resolve(__dirname, '../ref/screens/shot-042340.png'), label: '원본 shot-042340', R: 22, x0: 90, dx: 77.2, y0: 114, dy: 88, cols: 5, rows: 3, equipped: ['2,2', '2,3', '2,4'] };
const CLONE_GEO = { R: 25, x0: 94, dx: 77.6, y0: 111, dy: 89, cols: 5, rows: 3, equipped: ['0,0', '0,1', '0,2'] };

// 되돌린 유광 스킨 — 음성 대조에서만 주입한다(2026-08-20 이전의 실제 값 그대로).
const GLOSS_CSS = `
.sk-orb.sk-orb.sk-orb {
    background:
        radial-gradient(circle at 30% 20%, rgba(255,255,255,.85), rgba(255,255,255,0) 22%),
        radial-gradient(circle at 34% 26%, rgba(255,255,255,.50), rgba(255,255,255,0) 48%),
        radial-gradient(circle at 50% 118%, rgba(0,0,0,.50), rgba(0,0,0,0) 60%),
        var(--rc, #ccc);
    box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.28),
        inset 0 .12rem .22rem rgba(255,255,255,.34),
        inset 0 -.2rem .12rem rgba(0,0,0,.34),
        0 0 0 1px rgba(12,16,28,.85),
        0 0 .3rem -.06rem var(--rc, #ccc),
        0 0 .8rem -.2rem var(--rc, #ccc),
        0 .1rem .2rem rgba(0,0,0,.35);
}`;

// 페이지 안에서 도는 계측 — PNG 한 장 + 격자 기하를 받아 오브별 수치를 낸다.
const MEASURE = async (a) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = a.dataUrl; });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const D = g.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height;
    const lum = p => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    const chroma = p => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
    return a.cells.map(c2 => {
        const R = a.R, disc = [], side = [];
        const lim = Math.ceil(1.45 * R);
        for (let dy = -lim; dy <= lim; dy++) for (let dx = -lim; dx <= lim; dx++) {
            const x = Math.round(c2.cx + dx), y = Math.round(c2.cy + dy);
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const i = (y * W + x) * 4, p = [D[i], D[i + 1], D[i + 2]];
            const rr = Math.hypot(dx, dy) / R;
            if (rr <= 0.80) disc.push({ p, dy });
            if (rr >= 1.10 && rr <= 1.36 && Math.abs(dy) < 0.42 * R) side.push(p);
        }
        if (disc.length < 60 || side.length < 20) return { key: c2.key, broken: true, nDisc: disc.length, nSide: side.length };
        const m = new Map();
        for (const { p } of disc) { const k = `${p[0] >> 4},${p[1] >> 4},${p[2] >> 4}`; m.set(k, (m.get(k) || 0) + 1); }
        let bk = null, bc = -1; for (const [k, n] of m) if (n > bc) { bc = n; bk = k; }
        let sr = 0, sg = 0, sb = 0, n = 0;
        for (const { p } of disc) if (`${p[0] >> 4},${p[1] >> 4},${p[2] >> 4}` === bk) { sr += p[0]; sg += p[1]; sb += p[2]; n++; }
        const face = [sr / n, sg / n, sb / n];
        const coh = disc.filter(({ p }) => Math.hypot(p[0] - face[0], p[1] - face[1], p[2] - face[2]) <= 20).length / disc.length * 100;
        const fc = chroma(face), Lf = lum(face);
        const spec = disc.filter(o => o.dy < 0 && lum(o.p) > Lf + 28 && chroma(o.p) < Math.max(20, fc * 0.55)).length / disc.length * 100;
        const sideC = side.reduce((s, p) => s + chroma(p), 0) / side.length;
        return { key: c2.key, face: face.map(Math.round), coh, spec, sideC, nDisc: disc.length, nSide: side.length };
    });
};

function cellsOf(geo) {
    const out = [];
    for (let r = 0; r < geo.rows; r++) for (let k = 0; k < geo.cols; k++) out.push({ key: `${r},${k}`, cx: geo.x0 + geo.dx * k, cy: geo.y0 + geo.dy * r });
    return out;
}

function summarize(res, geo, label) {
    const eq = new Set(geo.equipped);
    const broken = res.filter(o => o.broken);
    const un = res.filter(o => !o.broken && !eq.has(o.key));
    const av = f => un.reduce((s, o) => s + f(o), 0) / un.length;
    console.log(`\n■ ${label}`);
    console.log('   key   면RGB          응집도   스펙큘러  옆구리채도');
    for (const o of res) {
        if (o.broken) { console.log(`   ${o.key}  🚨 표본 부족 (원반 ${o.nDisc} · 옆구리 ${o.nSide})`); continue; }
        console.log(`   ${o.key}${eq.has(o.key) ? '*' : ' '} ${o.face.join(',').padEnd(14)} ${o.coh.toFixed(1).padStart(5)}%  ${o.spec.toFixed(1).padStart(5)}%   ${o.sideC.toFixed(1).padStart(5)}`);
    }
    const out = { label, coh: av(o => o.coh), spec: av(o => o.spec), sideC: av(o => o.sideC), n: un.length, broken: broken.length };
    console.log(`  ▶ 미장착 ${out.n}개 — 응집도 ${out.coh.toFixed(1)}%  스펙큘러 ${out.spec.toFixed(1)}%  옆구리채도 ${out.sideC.toFixed(1)}   (* = 장착, 평균에서 뺀다)`);
    return out;
}

// 원본 대비 판정 — 셋 다 통과해야 PASS.
//   ⓐ 응집도는 원본보다 **10%p 이상 낮으면** 안 된다(면이 한 색으로 안 뭉친다는 뜻).
//   ⓑ 옆구리 채도는 원본 + 3.0 을 넘으면 안 된다(원본 0.1 이므로 사실상 '글로우 금지').
//   ⓒ 스펙큘러 화소율은 원본 + 3.0%p 를 넘으면 안 된다(원본 2.1% — 글리프 흰 획 몫이다).
function verdict(ref, got) {
    return {
        a: got.coh >= ref.coh - 10,
        b: got.sideC <= ref.sideC + 3.0,
        c: got.spec <= ref.spec + 3.0,
    };
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const measurePage = await browser.newPage();
    const measure = async (file, geo) => {
        if (!fs.existsSync(file)) { console.error('없음: ' + file); process.exit(2); }
        const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
        return measurePage.evaluate(MEASURE, { dataUrl, R: geo.R, cells: cellsOf(geo) });
    };

    const refRes = await measure(REF.file, REF);
    const ref = summarize(refRes, REF, REF.label);
    const cloneRes = await measure(path.resolve(__dirname, 'ref-cmp/clone/skills.png'), CLONE_GEO);
    const clone = summarize(cloneRes, CLONE_GEO, '클론 skills.png');

    // ── 음성 대조: 옛 유광 스킨을 도로 주입한 판을 찍어 **떨어지는지** 확인한다 ──
    console.log('\n───── 음성 대조(유광 스킨 재주입) ─────');
    const shot = path.join(__dirname, 'ref-cmp/clone/_orbflat-gloss-neg.png');
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && S && S.forgeLevel === 29', { label: '시드 상태 로드' });
    await page.evaluate(() => {
        UI.toast = () => { }; UI.showCraftModal = () => { }; UI.resolvePendingCraft = () => { };
        S.autoForgeOn = false; S.pendingCraft = null; UI._pendingItem = null;
        UI.els.craftModal.classList.add('hidden');
        S.summonMult = { skill: 5, pet: 1, mount: 1 };
        UI.switchTab('summon'); UI.switchSummonSub('skills');
    });
    await page.addStyleTag({ content: GLOSS_CSS });
    await page.waitForTimeout(650);
    await page.evaluate(() => {
        document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => { });
    await page.screenshot({ path: shot, timeout: 60000 });
    const negRes = await measure(shot, CLONE_GEO);
    const neg = summarize(negRes, CLONE_GEO, '음성 대조(유광 재주입)');
    fs.unlinkSync(shot);
    await browser.close();

    const v = verdict(ref, clone), nv = verdict(ref, neg);
    const negFails = !(nv.a && nv.b && nv.c);

    console.log('\n===== 대조 =====');
    console.log(`ⓐ 면 색 응집도    원본 ${ref.coh.toFixed(1)}%  vs  클론 ${clone.coh.toFixed(1)}%   (차 ${(clone.coh - ref.coh).toFixed(1)}%p · 하한 −10%p)  ${v.a ? 'OK' : '✗'}`);
    console.log(`ⓑ 옆구리 채도     원본 ${ref.sideC.toFixed(1)}   vs  클론 ${clone.sideC.toFixed(1)}    (차 ${(clone.sideC - ref.sideC).toFixed(1)} · 상한 +3.0)   ${v.b ? 'OK' : '✗'}`);
    console.log(`ⓒ 스펙큘러 화소율  원본 ${ref.spec.toFixed(1)}%  vs  클론 ${clone.spec.toFixed(1)}%   (차 ${(clone.spec - ref.spec).toFixed(1)}%p · 상한 +3.0%p) ${v.c ? 'OK' : '✗'}`);
    console.log(`\n음성 대조(유광 재주입) — 응집도 ${neg.coh.toFixed(1)}%  옆구리채도 ${neg.sideC.toFixed(1)}  스펙큘러 ${neg.spec.toFixed(1)}%`);
    console.log(`  → ${negFails ? '떨어졌다 = 이 자는 유광을 본다 ✔' : '🚨 통과해 버렸다 = 자가 유광을 못 본다'}`);

    if (ref.broken || clone.broken || neg.broken) { console.log('\n측정기 고장 — 표본 부족 오브가 있다. 수치를 쓰지 말 것.'); process.exit(2); }
    if (!negFails) { console.log('\n측정기 고장 — 음성 대조가 통과했다. 변별력 없는 게이트다.'); process.exit(2); }

    const ok = v.a && v.b && v.c;
    console.log(ok ? '\nPASS' : '\nFAIL — 오브 면이 원본만큼 납작하지 않다(유광·글로우가 남아 있다).');
    process.exit(ok ? 0 : 1);
})();
