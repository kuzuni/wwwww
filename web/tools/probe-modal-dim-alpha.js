// 팝업 딤의 실효 불투명도 실측 (`modal-dim-opacity`, 사용자 지시 2026-08-18 — "50퍼 정도").
//
// CSS 값만 읽으면 거짓 통과가 난다: 딤은 **겹칠 수 있다**(비교 팝업 위에 판매 경고가 겹치면
// .modal 이 두 겹이라 실효 α = 1-(1-.5)² = .75). 그래서 선언값과 **화면 픽셀** 둘 다 잰다.
//   순검정 딤이면 B = A·(1-α) → α = 1 - B/A  (probe-dim.js 가 원본에 쓰는 것과 같은 역산)
// 팝업을 열기 전/후의 같은 좌표를 캡처해 밝은 배경 화소에서 α 를 뽑는다.
//
// 판정: ⑴ `.modal` 선언 α = .50 ±.02 ⑵ 한 겹 팝업의 실측 α = .50 ±.06(캡처 압축·AA 여유)
//       ⑶ 겹친 팝업은 실패가 아니라 **보고만** 한다(겹침은 구조라 값으로 못 고친다)
//       ⑷ 건드리면 안 되는 둘이 그대로인지: `.lgr-overlay` α=.90(리그 보상 가림막) ·
//          `#summon-result-modal` 은 딤이 아니라 불투명 연출 씬(배경이 gradient)
//       ⑸ 콘솔 에러 0
// 사용: node probe-modal-dim-alpha.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// [이름, 여는 코드] — 한 겹으로 뜨는 대표 팝업들
const POPUPS = [
    ['profile', 'UI.openProfile()'],
    ['settings', "UI.openProfile(); UI._profileView='settings'; UI.renderProfile()"],
    ['player-info', 'UI.openPlayerInfo()'],
    ['forge-info', 'UI.openForgeInfo()'],
    // 겹치는 대표 케이스 — 비교 팝업(craft-modal) 위에 판매 경고(detail-modal)가 얹힌다.
    // 실효 α 가 .75 로 보고되는 게 정상이다(둘 다 .5). 값으로 고칠 게 아니라 구조라 실패로 안 친다.
    ['craft+sellwarn', `(() => {
        const kept = Object.assign(Forge.rollItem(), { slot: 'weapon', age: AGES[0] });
        S.equipment.weapon = kept;
        const it = Object.assign(Forge.rollItem(), { slot: 'weapon', age: AGES[2] });
        UI.setPendingCraft(it); UI.showCraftModal(it); UI.resolveCraft('sell');
    })()`],
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);
    // 3D 씬이 프레임마다 움직이면 '열기 전/후' 두 캡처가 딤 말고도 달라진다 — 멈춰 세운다
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
    });
    await page.waitForTimeout(300);

    // ⑴ 선언값
    const decl = await page.evaluate(() => {
        const m = document.querySelector('.modal');
        const bg = getComputedStyle(m).backgroundColor;               // rgba(0, 0, 0, 0.5)
        const lgr = document.createElement('div'); lgr.className = 'lgr-overlay';
        document.body.appendChild(lgr);
        const lbg = getComputedStyle(lgr).backgroundColor;
        lgr.remove();
        const sr = document.getElementById('summon-result-modal');
        return { bg, lbg, srBg: sr ? getComputedStyle(sr).backgroundImage.slice(0, 24) : 'none' };
    });
    const alphaOf = s => { const p = (s.match(/[\d.]+/g) || []).map(Number); return p.length > 3 ? p[3] : 1; };
    const dimA = alphaOf(decl.bg);
    ok(Math.abs(dimA - 0.5) <= 0.02, `.modal 선언 α 가 ${dimA} (기대 .50±.02) — ${decl.bg}`);
    ok(Math.abs(alphaOf(decl.lbg) - 0.90) <= 0.02, `.lgr-overlay α 가 ${alphaOf(decl.lbg)} (리그 보상 가림막은 .90 유지)`);
    ok(/gradient/.test(decl.srBg), `#summon-result-modal 배경이 gradient 가 아니다 (${decl.srBg}) — 소환 연출 씬은 딤이 아니다`);
    console.log(`  선언  .modal ${decl.bg} · .lgr-overlay ${decl.lbg} · summon-result ${decl.srBg}…`);

    // ⑵ 픽셀 역산 — 팝업 열기 전/후 같은 좌표
    const shot = async () => (await page.screenshot()).toString('base64');
    const close = () => page.evaluate(() => {
        UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();
        UI.closeDetail && UI.closeDetail();
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    });

    await close();
    await page.waitForTimeout(250);
    const before = await shot();

    for (const [name, opener] of POPUPS) {
        await close();
        await page.waitForTimeout(150);
        const layers = await page.evaluate((src) => {
            try { eval(src); } catch (e) { return { err: e.message }; }
            return { n: [...document.querySelectorAll('.modal')].filter(m => !m.classList.contains('hidden')).length };
        }, opener);
        if (layers.err) { errs.push(`[${name}] ${layers.err}`); continue; }
        await page.waitForTimeout(250);
        const after = await shot();

        // 팝업 카드가 아닌 **딤만 걸린** 화소에서 재야 한다 — 카드는 화면 가운데를 차지하므로
        // 위쪽 12% 띠에서, 원본이 충분히 밝은(≥40) 화소만 골라 α 중앙값을 낸다.
        const est = await page.evaluate(async ([a, b]) => {
            const load = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + src; });
            const [ia, ib] = await Promise.all([load(a), load(b)]);
            const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height;
            const cx = cv.getContext('2d', { willReadFrequently: true });
            cx.drawImage(ia, 0, 0); const A = cx.getImageData(0, 0, cv.width, cv.height).data;
            cx.clearRect(0, 0, cv.width, cv.height);
            cx.drawImage(ib, 0, 0); const B = cx.getImageData(0, 0, cv.width, cv.height).data;
            const band = Math.floor(cv.height * 0.12), alphas = [];
            for (let y = 0; y < band; y++) {
                for (let x = 0; x < cv.width; x += 2) {
                    const i = (y * cv.width + x) * 4;
                    for (let c = 0; c < 3; c++) {
                        if (A[i + c] >= 40) alphas.push(1 - B[i + c] / A[i + c]);
                    }
                }
            }
            alphas.sort((p, q) => p - q);
            return { n: alphas.length, med: alphas.length ? alphas[alphas.length >> 1] : null };
        }, [before, after]);

        if (est.med === null || est.n < 200) { fails.push(`${name}: 표본이 ${est.n}개뿐 — 밝은 배경 화소를 못 찾았다`); continue; }
        const expect = 1 - Math.pow(1 - dimA, layers.n);        // 겹친 만큼 곱해진다
        const line = `  실측  ${name.padEnd(12)} α=${est.med.toFixed(3)} (딤 ${layers.n}겹 → 기대 ${expect.toFixed(3)}, 표본 ${est.n})`;
        if (layers.n === 1) {
            ok(Math.abs(est.med - 0.5) <= 0.06, `${name}: 실효 딤 α 가 ${est.med.toFixed(3)} (기대 .50±.06)`);
            console.log(line);
        } else {
            console.log(line + '  ※ 겹침 — 값이 아니라 구조 문제라 보고만 한다');
        }
    }

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
