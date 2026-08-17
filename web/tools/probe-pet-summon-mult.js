// 펫 소환 배수 x1·x5·x25·x75가 전부 실제로 쓰이는지 (QA 8차: x25·x75가 알 보관 상한 때문에
// 빈 보관함에서도 항상 실패해 영구히 사용 불가였다). 기준은 "제공되는 배수는 반드시 사용 가능해야 한다".
// 계산 자체는 Pets.EGG_CAP/eggSpace()/summonCount()가 담당한다 — 이 도구는 그 결과를 **브라우저에서**
// 본다: 버튼 라벨·disabled 같은 화면 상태와, 같은 배수 목록을 쓰는 스킬·탈것의 회귀까지 함께 잡는다.
//  ① 네 배수 모두 알이 늘어난다  ② 나간 개수만큼만 과금  ③ 버튼 라벨·비용이 실제 개수를 보여준다
//  ④ 보관함이 가득 찼을 때만 버튼이 죽는다  ⑤ 스킬·탈것 배수 8종 회귀 없음
// 사용: node probe-pet-summon-mult.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// UI·S·Pets는 최상위 const라 waitForFunction 술어에서 안 보인다 — evaluate 폴링으로 부팅을 기다린다.
async function waitBooted(page, timeout = 20000) {
    const t0 = Date.now();
    for (;;) {
        const ok = await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S).catch(() => false);
        if (ok) return;
        if (Date.now() - t0 > timeout) throw new Error('부팅 대기 시간 초과');
        await page.waitForTimeout(100);
    }
}

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
    await waitBooted(page);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.eggCurrency = 1e7; S.tickets = 1e7; S.winders = 1e7;
    });

    // ① ② ③ 네 배수를 빈 보관함에서 각각 눌러 본다
    for (const mult of [1, 5, 25, 75]) {
        const r = await page.evaluate((mult) => {
            S.eggs = []; S.hatching = [];
            S.summonMult.pet = mult;
            UI.switchTab('summon'); UI.switchSummonSub('pets');
            const btn = document.querySelector('.summon-btn');
            const label = btn ? btn.textContent.replace(/\s+/g, ' ').trim() : '';
            const disabled = btn ? btn.classList.contains('disabled') : true;
            const cur0 = S.eggCurrency, n0 = S.eggs.length;
            const eff = Pets.summonCount(mult);   // 소환 '전'에 재야 한다 (소환 후엔 여유가 줄어든다)
            UI.onSummonPetEgg();
            return {
                label, disabled, gained: S.eggs.length - n0, spent: cur0 - S.eggCurrency,
                eff, cost: Pets.SUMMON_EGG_COST, cap: Pets.EGG_CAP,
            };
        }, mult);
        ok(!r.disabled, `x${mult}: 빈 보관함인데 소환 버튼이 죽어 있다`);
        ok(r.gained > 0, `x${mult}: 소환이 되지 않았다 (알 +${r.gained})`);
        ok(r.gained >= r.eff, `x${mult}: 나간 개수 ${r.gained} < 예상 ${r.eff}`);
        ok(r.spent === r.cost * r.eff, `x${mult}: 과금 ${r.spent} ≠ 실제 소환분 ${r.cost * r.eff}`);
        ok(r.label.indexOf('x' + r.eff) >= 0, `x${mult}: 버튼 라벨이 실제 개수를 안 보여준다 — "${r.label}"`);
        console.log(`  x${mult}: 라벨 "${r.label}" · 알 +${r.gained} · 알화폐 -${r.spent} (실제 ${r.eff}개, 상한 ${r.cap})`);
    }

    // ④ 보관함이 가득 차면 그때만 죽는다
    const full = await page.evaluate(() => {
        S.eggs = Array.from({ length: Pets.EGG_CAP }, () => ({ rarity: 'common' }));
        S.summonMult.pet = 25;
        UI.renderPets();
        const btn = document.querySelector('.summon-btn');
        const cur0 = S.eggCurrency;
        UI.onSummonPetEgg();
        return { disabled: btn.classList.contains('disabled'), spent: cur0 - S.eggCurrency, n: S.eggs.length, cap: Pets.EGG_CAP };
    });
    ok(full.disabled && full.spent === 0 && full.n === full.cap,
        `보관함이 가득 찼는데 소환이 됐다 ${JSON.stringify(full)}`);
    console.log(`  가득참(${full.cap}개): 버튼 비활성 ${full.disabled} · 과금 ${full.spent}`);

    // ⑤ 스킬·탈것 배수 회귀 확인 (같은 UI.SUMMON_MULTS 목록을 공유한다)
    const others = await page.evaluate(() => {
        const out = {};
        for (const mult of [1, 5, 25, 75]) {
            const t0 = S.tickets;
            const r = Skills.summon(false, mult);   // (useGems, count) — 티켓 경로
            out['skill x' + mult] = { ok: !!r, spent: t0 - S.tickets };
        }
        for (const mult of [1, 5, 25, 75]) {
            const w0 = S.winders;
            const r = Mounts.summon(mult);
            out['mount x' + mult] = { ok: !!r, spent: w0 - S.winders };
        }
        return out;
    });
    for (const k of Object.keys(others)) ok(others[k].ok, `${k} 소환 실패 — 회귀`);
    console.log('  스킬·탈것: ' + Object.keys(others).map(k => `${k}${others[k].ok ? '✓' : '✗'}(-${others[k].spent})`).join(' '));

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
