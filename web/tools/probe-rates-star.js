// 소환 확률 팝업의 별 개수 = 그 라인의 승천 횟수 검증 (사용자 재지적 2026-08-19 `ascend-star-count-fix`)
//   "승천 안 한 상태인데 여전히 별 표시 있다. 승천 0회면 별 0개, 1회면 1개, 2회면 2개."
// 검사 항목
//  ① 승천 0회 → 등급 행에 별이 하나도 없다 (종전 결함: 행마다 무조건 별 1개)
//  ② 승천 N회(1·2·3) → 모든 등급 행에 별이 정확히 N개
//  ③ 라인별로 따로 센다 — 스킬만 승천했으면 펫·탈것 팝업은 여전히 별 0개
//  ④ 6회 이상은 '별 1개 + 숫자'로 접힌다(행 폭 방어) — 숫자가 승천 횟수와 같아야 한다
//  ⑤ 콘솔 에러 0
// 사용: node probe-rates-star.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

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
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
    });

    // 한 라인의 승천 횟수를 n으로 두고 그 라인 확률 팝업의 행별 별 개수를 센다
    const count = (kind, line, n) => page.evaluate(([kind, line, n]) => {
        Ascension.ensure();
        S.lineAscend[line] = n;
        UI.openSummonRates(kind);
        const rows = [...document.querySelectorAll('#detail-modal .rate-bar .rate-name')];
        return {
            rows: rows.length,
            stars: rows.map(el => el.querySelectorAll('.rate-star .ico, .rate-star img').length),
            // 접힘 표기('별+숫자')일 때의 숫자
            texts: rows.map(el => (el.querySelector('.rate-star') || {}).textContent || ''),
        };
    }, [kind, line, n]);

    for (const [kind, line] of [['skill', 'skill'], ['pet', 'pet'], ['mount', 'mount']]) {
        const z = await count(kind, line, 0);
        ok(z.rows > 0, `${kind}: 확률 행을 못 읽었다`);
        ok(z.stars.every(s => s === 0), `① ${kind} 승천 0회인데 별이 있다 (행별 ${z.stars.join(',')})`);
        for (const n of [1, 2, 3]) {
            const r = await count(kind, line, n);
            ok(r.stars.length === r.rows && r.stars.every(s => s === n),
                `② ${kind} 승천 ${n}회면 행마다 별 ${n}개여야 한다 (행별 ${r.stars.join(',')})`);
        }
        const big = await count(kind, line, 7);
        ok(big.stars.every(s => s === 1) && big.texts.every(t => t.includes('7')),
            `④ ${kind} 승천 7회는 '별+7'로 접혀야 한다 (별 ${big.stars.join(',')} · 표기 ${JSON.stringify(big.texts[0])})`);
        await page.evaluate(([line]) => { S.lineAscend[line] = 0; }, [line]);
    }

    // ③ 라인 분리 — 스킬만 3회 승천시킨 뒤 펫 팝업을 보면 별이 없어야 한다
    const cross = await page.evaluate(() => {
        Ascension.ensure();
        S.lineAscend.skill = 3; S.lineAscend.pet = 0;
        UI.openSummonRates('skill');
        const s = [...document.querySelectorAll('#detail-modal .rate-bar .rate-name')].map(el => el.querySelectorAll('.rate-star .ico, .rate-star img').length);
        UI.openSummonRates('pet');
        const p = [...document.querySelectorAll('#detail-modal .rate-bar .rate-name')].map(el => el.querySelectorAll('.rate-star .ico, .rate-star img').length);
        S.lineAscend.skill = 0;
        return { s, p };
    });
    ok(cross.s.every(v => v === 3) && cross.p.every(v => v === 0),
        `③ 라인별로 따로 세야 한다 (스킬 ${cross.s.join(',')} · 펫 ${cross.p.join(',')})`);

    ok(errs.length === 0, `⑤ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    console.log(fails.length ? `❌ FAIL (${fails.length}건)\n` + fails.join('\n')
        : '✅ PASS — 소환 확률 팝업 별 개수 = 라인 승천 횟수 (0회=0개, N회=N개, 6회 이상은 별+숫자)');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
