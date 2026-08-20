// `IconGen._EMBLEM_STEP`(엠블럼 평면 3단 채움의 단별 밝기 + 상단 하이라이트 알파) 조합을 훑어
// **속살(readability)과 채도(㉢)의 파레토 경계**를 한 런에서 찾는다.
//
// 왜 필요한가 (2026-08-20 UI 스트림, 락 `icon-gen`):
//   미결 ㉢('스킬 글리프 채움이 흰색 지배', 비평가 A#3·B#5)를 고치려면 채움을 어둡고 채도 있게
//   내려야 하는데, `probe-emblem-core` 의 속살은 어둡게 할수록 나빠진다. 두 지표가 정면으로
//   상충하므로 **눈대중으로 한 조합씩 고쳐 재면 안 된다** —
//   한 조합을 재는 데 브라우저를 새로 띄우면 조합당 30초가 들어 실제로 몇 개 못 본다.
//   그래서 한 페이지에서 `IconGen.cache = {}` 로 캐시만 비우며 조합을 갈아 끼워 전부 잰다.
//
// 재는 값(둘 다 `probe-emblem-core`·`probe-skill-orb-ink` 와 **같은 정의**를 쓴다):
//   ① 속살% = 38px 로 줄인 뒤 실루엣(알파 ≥120) 중 **루마 ≥50** 인 화소 비율. 24종의 **최솟값**을
//      본다(평균이 아니다 — 게이트가 종별로 걸리기 때문). 문턱 50 의 근거는 probe-emblem-core.js
//      머리말 참조(음성 대조로 고른 값이다).
//   ② 채도% = 같은 38px 이미지에서 **키라인이 아닌** 화소(루마 ≥50)의 평균 HSV 채도.
//      ⚠️ `probe-skill-orb-ink` 의 채도와 **자리가 다르다**(그쪽은 화면 캡처의 오브 위쪽 표본).
//         여기 값은 조합 간 **상대 비교용**이고, 절대 대조는 그쪽 자로 따로 한다.
//      🚨 **이 열은 실제 이득을 과장한다 — 그대로 믿고 조합을 고르지 말 것**
//         (2026-08-20 UI 스트림이 실측으로 확인. `.30 → .24` 한 칸에서 이 열은 51.4 → 56.8
//          (+5.4%p)인데, `probe-skill-orb-ink` 의 ⓑ(검정 뺀 채움 채도)는 **44.8 → 44.7 로 무변**,
//          전체 잉크 채도는 33.0 → 34.0 (+1.0%p) 였다).
//         원인은 `IconGen._shade` 에 있다: `amt < 0` 은 **채널별 곱셈**(`v * (1+amt)`)이라
//         HSV 채도 `(max-min)/max` 가 **스케일 불변 — 즉 하나도 안 변한다.** 채도를 바꾸는 건
//         흰색을 섞는 `amt > 0` 쪽뿐이다. 그래서 **`bot` 밴드는 채도 레버로서 죽은 값**이고,
//         `top`·`mid`·`gloss` 도 **양수일 동안만** 듣는다(0 에 닿으면 거기서 끝 = 블록 팔레트
//         원색 채도 69.2%). 이 열이 계속 오르는 것처럼 보이는 건 밝기 변화가 섞여 들어와서다.
//         👉 조합을 고를 때는 이 열로 **순위만** 보고, 채택 전후에 반드시 `probe-skill-orb-ink`
//            로 ⓑ 를 재서 **실제로 움직였는지** 확인할 것.
//
// 사용: node sweep-emblem-step.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const AT = 38;      // probe-emblem-core 와 같은 표시 크기
const GATE = 34;    // probe-emblem-core 의 속살 하한

// [top, mid, bot, gloss] — 위에서 아래로 갈수록 어둡고 채도가 높다.
const COMBOS = [
    [0.30, 0.05, -0.24, 0.22],   // 블록 팔레트 이전의 제품값
    [0.24, 0.02, -0.26, 0.18],
    [0.18, -0.02, -0.28, 0.16],
    [0.12, -0.06, -0.30, 0.14],
    [0.06, -0.10, -0.32, 0.12],
    [0.00, -0.14, -0.34, 0.10],
    [-0.08, -0.20, -0.36, 0.08],
    [-0.16, -0.26, -0.40, 0.06],
];

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof IconGen !== "undefined"');
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () { }; if (typeof Combat !== 'undefined') Combat.tick = function () { }; });

    const rows = await page.evaluate(async (a) => {
        const names = Object.keys(IconGen.draw).filter(n => /^sk_|^tm_/.test(n));
        const out = [];
        for (const combo of a.COMBOS) {
            IconGen._EMBLEM_STEP = { top: combo[0], mid: combo[1], bot: combo[2], floorL: 116, gloss: combo[3] };
            IconGen.cache = {};                       // 캐시를 비워야 새 노브로 다시 굽는다
            let minCore = 101, minName = '', nBad = 0, satSum = 0, satN = 0, broken = 0;
            for (const name of names) {
                let u = '';
                try { u = IconGen.url(name); } catch (e) { }
                if (!u) { broken++; continue; }
                const im = new Image();
                await new Promise(r => { im.onload = r; im.onerror = r; im.src = u; });
                const c = document.createElement('canvas');
                c.width = a.AT; c.height = a.AT;
                const x = c.getContext('2d', { willReadFrequently: true });
                x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
                x.drawImage(im, 0, 0, a.AT, a.AT);
                const d = x.getImageData(0, 0, a.AT, a.AT).data;
                // 속살 정의는 `probe-emblem-core.js` 와 **글자 그대로 같아야** 한다
                // (루마 ≥ 50). 한쪽만 고치면 스윕이 거짓말을 한다.
                const px = [];
                for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] < 120) continue;
                    px.push([0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2], d[i], d[i + 1], d[i + 2]]);
                }
                if (px.length < 40) { broken++; continue; }
                let sil = px.length, core = 0, s = 0, sn = 0;
                for (const [L, r, g, b] of px) {
                    if (L < 50) continue;
                    core++;
                    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
                    s += mx ? (mx - mn) / mx : 0; sn++;
                }
                const pct = core / sil * 100;
                if (pct < minCore) { minCore = pct; minName = name; }
                if (pct < a.GATE) nBad++;
                if (sn) { satSum += s / sn * 100; satN++; }
            }
            out.push({ combo, minCore, minName, nBad, sat: satN ? satSum / satN : 0, broken });
        }
        return out;
    }, { COMBOS, AT, GATE });

    console.log(`엠블럼 24종 · 표시 ${AT}px · 속살 게이트 ${GATE}%\n`);
    console.log('  top   mid   bot  gloss |  최소속살(종)          미달 | 평균채도');
    let best = null;
    for (const r of rows) {
        const pass = r.nBad === 0;
        console.log(
            `  ${r.combo.map(v => String(v).padStart(5)).join(' ')} | ` +
            `${r.minCore.toFixed(1).padStart(5)}% ${(r.minName || '').padEnd(16)} ${String(r.nBad).padStart(2)}종 | ` +
            `${r.sat.toFixed(1).padStart(5)}%  ${pass ? '통과' : '불통과'}`);
        if (pass && (!best || r.sat > best.sat)) best = r;
    }
    if (rows.some(r => r.broken)) { console.log('\n측정기 고장(굽기 실패) — 수치를 쓰지 말 것.'); await browser.close(); process.exit(2); }
    console.log('\n※ 여기 채도는 조합 간 상대 비교용이다 — 원본 대조는 probe-skill-orb-ink.js 로 따로 잰다.');
    if (!best) { console.log('\n속살 게이트를 통과하는 조합이 없다 — 범위를 위로 넓혀 다시 훑을 것.'); await browser.close(); process.exit(1); }
    console.log(`\n▶ 게이트 통과 중 가장 채도 높은 조합: top ${best.combo[0]} · mid ${best.combo[1]} · bot ${best.combo[2]} · gloss ${best.combo[3]}` +
        `  (최소속살 ${best.minCore.toFixed(1)}% · 채도 ${best.sat.toFixed(1)}%)`);
    if (errs.length) console.log('콘솔 에러:', errs.slice(0, 5).join(' | '));
    await browser.close();
    process.exit(0);
})();
