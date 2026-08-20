// 빛 모임(.sr-charge)이 자기 박스에 잘려 세로 직선 경계를 만드는지 실측한다.
//
// 10차 비평가 A ⓵ · B ⓵ [치명] "차징 오라가 직사각형으로 하드 클리핑된다" 검증기 (2인 독립 일치).
//   A: tl-x5-hi/t0420 y=430 에서 x=99(131) → x=100(216), x=311(206) → x=312(140), 160행 직선
//   B: skill-x5-380 y=440 에서 x=121→122(116→207)·x=294(207→132) 폭 172px,
//      tl-x75/t0450 y=450 에서 x=46·x=369 폭 323px (스케일이 커서 가장 노골적)
//
// 원인(코드에서 확인): `.sr-charge` 는 `inset: 0` 이라 `.sr-wrap` 과 같은 **직사각형**(412×732)인데
// 배경이 `radial-gradient(circle at 50% 50%, ...)` 다. 크기 키워드가 없으면 `circle` 은
// **farthest-corner** 로 풀려 반지름이 √(206²+366²) ≈ 420px 가 된다. 알파가 0 이 되는 마지막
// 스톱은 63%+ ≈ 265px 인데 박스는 가로로 **206px** 밖에 안 뻗으므로, 좌우 박스 모서리에서
// 그라디언트가 아직 밝은 채로 **잘린다**. 세로는 366px(반지름의 87%)라 0 스톱을 지나 부드럽게
// 사라진다 — 두 비평가가 함께 관측한 "위아래는 부드러운데 좌우만 면도날"인 비대칭이 이 구조다.
// 게다가 요소가 scale 로 커지므로 렌더된 반폭은 206×s — 절단선이 **화면 안쪽**에 생겨
// 차징이 자라는 동안 바깥으로 행진한다(A 의 x=118 → 115 → 100 진행이 이것).
//
// 판정: 차징 구간 프레임에서 '한 열을 경계로 1px 휘도가 급변하고, 그 급변이 여러 행에 걸쳐
// **같은 열에 정렬**되는' 세로 직선 경계를 찾는다. 원형 그라디언트의 등고선은 곡선이라
// 자연스러운 감쇠에서는 열마다 경계가 흩어져야 한다 — 한 열에 쌓이면 그건 박스 절단이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9;
    saveGame();
`;
const RNG = seed => `(() => { let a = ${seed} >>> 0; Math.random = function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}; })()`;

// 차징 구간(0~480ms)만 본다 — 셀이 뜨기 전이라 세로 경계를 만들 다른 요소가 없다.
// 케이스를 둘 두는 이유: B 가 지적한 대로 **x75 는 --sr-e 가 커서 절단이 훨씬 넓다**(폭 323px).
const CASES = [
    ['x5-hi', `S.summonCount = 5000; S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 14],
    ['x75', `S.summonCount = 5000; S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, 3],
];
// ⚠️ 표본 시각을 하드코딩하지 말 것 — 차징 창은 UI.SR_CHARGE_MS 로 끝난다(그 시각에 첫 셀이
//    뜬다). summon-anim-halve(480→240ms)에서 옛 고정 시각(180~470)이 셀 등장 이후를 찍어
//    셀 테두리의 세로 직선을 '절단'으로 오인했다. 정점 대비 비율로 페이지에서 유도한다.
const TIME_FRACS = [0.375, 0.5, 0.625, 0.75, 0.875, 0.98];

const SEEK = `(T => {
    const cells = [...UI._srCells], d = UI._srDelays;
    cells.forEach((c, i) => c.classList.toggle('on', d[i] <= T));
    for (const a of document.getAnimations()) {
        a.pause();
        try { a.currentTime = T; } catch (e) { /* 무한 반복 예외 무시 */ }
    }
})`;

const GATE = 40; // 같은 열에 정렬된 급변 행 수가 이 이상이면 직선 절단으로 본다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    let worst = 0, worstAt = '';
    console.log('== 빛 모임(.sr-charge) 세로 절단 경계 실측 ==');
    console.log(`  기준: 같은 열에서 1px 휘도 급변(≥26)이 ${GATE}행 이상 정렬되면 박스 절단으로 본다\n`);

    for (const [name, open, seed] of CASES) {
        const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
        page.on('pageerror', e => errors.push(`${name} PAGEERROR ${e}`));
        page.on('console', m => { if (m.type() === 'error') errors.push(`${name} CONSOLE ${m.text()}`); });
        await page.goto(INDEX);
        await page.waitForFunction('typeof UI !== "undefined" && UI.els');
        await page.evaluate(SEED);
        await page.evaluate(`Scene3D.update = function () {}; const bl = document.getElementById('boot-loading'); if (bl) bl.remove();`);
        // ⚠️ 시드와 소환은 한 evaluate 안에 — 따로 부르면 그 사이 게임 루프가 난수를 먹는다
        await page.evaluate(RNG(seed) + ';' + open);
        await page.evaluate(`UI.clearSummonTimers()`);

        const chargeMs = await page.evaluate('UI.SR_CHARGE_MS');
        const TIMES = TIME_FRACS.map(f => Math.round(f * chargeMs));
        console.log(`[${name}] (정점 ${chargeMs}ms 기준 표본 ${TIMES.join('/')})`);
        for (const T of TIMES) {
            await page.evaluate(`(${SEEK})(${T})`);
            // ⚠️ 이 환경엔 pngjs가 없다 — 스크린샷을 base64로 페이지에 넣고 캔버스로 디코드한다
            //    (probe-sr-band 등 다른 폴리싱 프로브와 같은 경로).
            const b64 = (await page.screenshot({ timeout: 60000 })).toString('base64');
            const res = await page.evaluate(async ({ b64, gate }) => {
                const im = new Image();
                await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = 'data:image/png;base64,' + b64; });
                const c = document.createElement('canvas');
                c.width = im.width; c.height = im.height;
                const g = c.getContext('2d'); g.drawImage(im, 0, 0);
                const app = document.getElementById('app').getBoundingClientRect();
                const sc = im.height / window.innerHeight;
                const y0 = Math.max(0, Math.round((app.top + 4) * sc)), y1 = Math.min(im.height, Math.round((app.bottom - 4) * sc));
                const d = g.getImageData(0, y0, im.width, y1 - y0).data;
                const W = im.width, lum = (x, y) => { const i = (y * W + x) * 4; return (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; };
                const hits = new Map();
                for (let y = 0; y < y1 - y0; y++) {
                    for (let x = 1; x < W; x++) {
                        if (Math.abs(lum(x, y) - lum(x - 1, y)) >= 26) hits.set(x, (hits.get(x) || 0) + 1);
                    }
                }
                // ⚠️ 급변 열이 곧 절단은 아니다 — **수렴 빛줄기(.sr-streaks i)는 폭 3px 안팎의
                //    세로 막대**라 그 좌우 모서리도 여러 행에 걸쳐 같은 열에 정렬된다(실측 41~46행).
                //    그건 의도된 조형이지 클리핑이 아니다. 둘을 가르는 것은 **경계 양쪽 넓은 면의
                //    휘도 단차**다: 박스 절단은 한쪽이 수백 px 넓이로 밝고 반대쪽이 배경이라
                //    24px 창 평균이 크게 갈리지만, 얇은 막대는 24px 창에서 보면 양쪽이 모두 배경이다.
                const H = y1 - y0, my = (H >> 1);
                const win = (xa, xb) => { // 경계 중심 행 근처 5행의 [xa,xb) 평균 휘도
                    let s = 0, n = 0;
                    for (let y = Math.max(0, my - 2); y < Math.min(H, my + 3); y++)
                        for (let x = Math.max(0, xa); x < Math.min(W, xb); x++) { s += lum(x, y); n++; }
                    return n ? s / n : 0;
                };
                const strong = [...hits.entries()].filter(([x, n]) =>
                    n >= gate && Math.abs(win(x - 25, x - 1) - win(x + 1, x + 25)) >= 18);
                // ⚠️ 마지막 관문: **좌우 대칭쌍**만 박스 절단으로 인정한다. 박스는 중심 대칭이라
                //    잘리면 반드시 양쪽 모서리가 같이 잘린다(실측: 수정 전 x75 t0300 에 99/313,
                //    t0420 에 76/336 — 중심 206 에 대해 2·206−x 가 정확히 맞는다). 반면 빛줄기·
                //    아이콘 같은 국소 요소의 하드 엣지는 짝이 없다. 이 조건 하나로 '자를 무디게
                //    만들어 통과시키는' 사고를 막는다 — 수정 전 빌드는 이 필터를 넣고도 그대로 FAIL 이다.
                const cx = (document.getElementById('app').getBoundingClientRect().left
                          + document.getElementById('app').getBoundingClientRect().right) / 2 * sc;
                const cuts = strong.filter(([x]) => strong.some(([x2]) => Math.abs((x + x2) / 2 - cx) <= 6 && Math.abs(x - x2) > 20))
                    .sort((a, b) => b[1] - a[1]);
                return { cuts: cuts.slice(0, 4), total: cuts.length, strong: strong.length };
            }, { b64, gate: GATE });
            const top = res.cuts.map(([x, n]) => `x=${x}(${n}행)`).join(' · ');
            const n = res.cuts.length ? res.cuts[0][1] : 0;
            if (n > worst) { worst = n; worstAt = `${name} t${String(T).padStart(4, '0')} x=${res.cuts[0][0]}`; }
            console.log(`  t${String(T).padStart(4, '0')}  절단 열 ${res.total}개  ${top || '없음'}`);
        }
        await page.close();
    }

    console.log('');
    console.log(`  최악: ${worst}행 정렬 ${worstAt ? '(' + worstAt + ')' : ''}  게이트: < ${GATE}행`);
    console.log(errors.length ? errors.join('\n') : '콘솔/페이지 에러 0건');
    console.log('판정: ' + (worst < GATE ? 'PASS' : 'FAIL — 빛 모임이 자기 박스에 잘린다'));
    await browser.close();
    process.exit(worst < GATE ? 0 : 1);
})();
