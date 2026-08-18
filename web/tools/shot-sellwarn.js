// 상위 시대 판매 경고 팝업 캡처 + 레이아웃 실측 (`sell-warn-by-age`, 2026-08-18).
// 비교 축이 rarity → 시대로 바뀌면서 칩에 들어가는 글자가 길어졌다('지하 세계'는 5자,
// 옛 rarity 최장 '궁극의'보다 2자 길다). 칩은 좌우 두 칸이 폭을 반씩 나눠 갖는 자리라
// **줄바꿈·잘림·칸 밖 유출**이 제일 먼저 나는 곳이다 — 지원 최소폭(360)과 기준폭(430) 둘 다 본다.
// 판정: ⑴ 칩이 잘리지 않음(scrollWidth <= clientWidth+1) ⑵ 칩이 제 칸(.swc-col) 밖으로 안 샘
//       ⑶ 칩이 한 줄 ⑷ 좌우 두 칸의 폭 차이가 화면폭 대비 2%p 이내(대칭이어야 '견주기'로 읽힌다)
//       ⑸ 콘솔 에러 0
// 사용: node shot-sellwarn.js  → sellwarn-<width>-<케이스>.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 최장 이름끼리, 그리고 사용자가 실제로 겪은 원문 케이스(원시적 장착 + 중세의 판매)
const CASES = [
    ['underworld', 'multiverse', 'longest'],   // '지하 세계' vs '다중 우주' — 글자 수 최악
    ['medieval', 'primitive', 'userreport'],   // 사용자 원문: 원시 장착하고 중세의 판매
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const fails = [], errs = [];
    const ok = (c, m) => { if (!c) fails.push(m); };

    for (const width of [360, 430]) {
        const page = await browser.newPage({ viewport: { width, height: 932 } });
        page.on('pageerror', e => errs.push(`${width}: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${width}: ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
        await page.waitForTimeout(400);
        await page.evaluate(() => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            Combat.tick = function () {};
        });

        for (const [soldAge, keptAge, tag] of CASES) {
            const m = await page.evaluate(({ soldAge, keptAge }) => {
                document.querySelectorAll('.modal').forEach(el => el.classList.add('hidden'));
                const sold = Object.assign(Forge.rollItem(), { age: soldAge });
                const kept = Object.assign(Forge.rollItem(), { age: keptAge, slot: sold.slot });
                UI.showSellConfirm({ sold, kept });
                const chips = [...document.querySelectorAll('.swc-age')].map(el => {
                    const r = el.getBoundingClientRect(), pr = el.parentElement.getBoundingClientRect();
                    const fs = parseFloat(getComputedStyle(el).fontSize);
                    return {
                        text: el.textContent.trim(),
                        clipped: el.scrollWidth > el.clientWidth + 1,
                        spill: Math.round((Math.max(r.right - pr.right, pr.left - r.left)) * 100) / 100,
                        lines: Math.round(r.height / (fs * 1.35)),
                    };
                });
                const cols = [...document.querySelectorAll('.swc-col')].map(el => el.getBoundingClientRect().width);
                const card = document.querySelector('.sellwarn-card').getBoundingClientRect();
                return { chips, cols, cardW: card.width, note: document.querySelector('.sellwarn-note').innerText.replace(/\s+/g, ' ') };
            }, { soldAge, keptAge });

            // ⚠️ `.modal.opening .modal-card` 의 cardpop 이 .25s 동안 opacity 0→1 로 띄운다 —
            // 곧바로 찍으면 카드가 반투명한 유령으로 찍혀 '딤이 카드를 씻어냈다'로 오독하게 된다
            // (실제로 한 번 그렇게 찍혔다). 기하 실측은 getBoundingClientRect 라 영향이 없지만
            // 캡처는 애니메이션이 끝난 뒤여야 한다.
            await page.waitForTimeout(400);
            await page.screenshot({ path: `sellwarn-${width}-${tag}.png` });
            for (const c of m.chips) {
                ok(!c.clipped, `${width}/${tag}: 칩 "${c.text}" 가 잘렸다`);
                ok(c.spill <= 0.5, `${width}/${tag}: 칩 "${c.text}" 가 칸 밖으로 ${c.spill}px 샜다`);
                ok(c.lines <= 1, `${width}/${tag}: 칩 "${c.text}" 가 ${c.lines}줄로 접혔다`);
            }
            const gapPct = Math.abs(m.cols[0] - m.cols[1]) / width * 100;
            ok(gapPct <= 2, `${width}/${tag}: 좌우 칸 폭이 ${gapPct.toFixed(2)}%p 어긋났다(≤2%p)`);
            console.log(`  ${width} ${tag.padEnd(10)} 칩=[${m.chips.map(c => c.text).join(' | ')}] 칸폭 ${m.cols.map(v => Math.round(v)).join('/')} 차이 ${gapPct.toFixed(2)}%p`);
            console.log(`       "${m.note}"`);
        }
        await page.close();
    }

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
