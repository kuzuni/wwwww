// 상점 시트 맨 아래 '보석' 결제 카드 3장의 가격 버튼이 하단 탭바에 가려져
// 클릭이 닿지 않던 버그의 검증 도구.
// 시트를 스크롤 최대치까지 내린 뒤 세 버튼의 rect가 탭바 위(top < 탭바 top)로
// 올라오는지, elementFromPoint가 버튼 자신을 잡는지, 실제 클릭이 토스트를 띄우고
// 상점이 열린 채로 남는지를 잰다.
// 사용: node probe-shop-gems.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const VIEWPORTS = [
    { width: 430, height: 932 },
    { width: 412, height: 915 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    let fail = 0;

    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp });
        page.on('pageerror', e => errs.push(`${vp.width}x${vp.height} ${e.message}`));
        page.on('console', m => { if (m.type() === 'error') errs.push(`${vp.width}x${vp.height} ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 15000 });
        await page.waitForTimeout(400);

        // 상점 열고 시트를 끝까지 내린다
        await page.evaluate(() => { UI.onTabClick('shop'); });
        // 등장 트랜지션(.modal.opening)은 scale을 걸어 rect를 줄인다 — 끝나야 실측이 맞다.
        await page.waitForFunction(() => !document.querySelector('.modal.opening'), null, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(250);
        await page.evaluate(() => {
            const sh = document.querySelector('.modal-card.sheet.shop-sheet');
            sh.scrollTop = sh.scrollHeight;
        });
        await page.waitForTimeout(150);

        const res = await page.evaluate(() => {
            const sh = document.querySelector('.modal-card.sheet.shop-sheet');
            const tabbar = document.querySelector('#tabbar');
            const tb = tabbar.getBoundingClientRect();
            // '오늘의 특가' 카드도 .shop-price-btn 을 쓰므로 보석 카드 안쪽으로만 한정한다.
            const btns = [...document.querySelectorAll('.shop-gem-card .shop-price-btn')];
            return {
                scrollHeight: sh.scrollHeight, clientHeight: sh.clientHeight, scrollTop: sh.scrollTop,
                tabbarTop: Math.round(tb.top),
                btns: btns.map(b => {
                    const r = b.getBoundingClientRect();
                    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                    const hit = document.elementFromPoint(cx, cy);
                    return {
                        label: b.textContent.trim(),
                        top: Math.round(r.top), bottom: Math.round(r.bottom),
                        underTabbar: r.bottom > tb.top,
                        hitSelf: hit === b || b.contains(hit),
                        hitTag: hit ? (hit.className || hit.tagName) : null,
                    };
                }),
            };
        });

        // 실제 클릭: 토스트가 뜨고 상점이 열린 채로 남아야 통과
        const clicks = [];
        for (let i = 0; i < res.btns.length; i++) {
            const r = await page.evaluate(async (idx) => {
                const b = document.querySelectorAll('.shop-gem-card .shop-price-btn')[idx];
                const rect = b.getBoundingClientRect();
                // UI.toast()는 호출마다 .toast div를 새로 append 하고 2.9초 뒤 지운다.
                // 개수 비교(slice)는 그 사이 옛 토스트가 사라지면 새 토스트를 잘라먹으므로,
                // 클릭 전에 살아 있는 것들에 표식을 달고 표식 없는 것만 새 토스트로 읽는다.
                document.querySelectorAll('.toast').forEach(t => t.dataset.seen = '1');
                const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
                const target = document.elementFromPoint(cx, cy);
                if (target) target.click();
                await new Promise(r => setTimeout(r, 150));
                const fresh = [...document.querySelectorAll('.toast:not([data-seen])')];
                return {
                    shopStillOpen: !document.getElementById('shop-modal').classList.contains('hidden'),
                    toastText: fresh.map(t => t.textContent.trim()).join(' | '),
                };
            }, i);
            clicks.push(r);
            // 다음 클릭을 위해 상점 복구
            await page.evaluate(() => {
                if (document.getElementById('shop-modal').classList.contains('hidden')) UI.onTabClick('shop');
                const sh = document.querySelector('.modal-card.sheet.shop-sheet');
                if (sh) sh.scrollTop = sh.scrollHeight;
            });
            await page.waitForTimeout(180);
        }

        console.log(`\n== ${vp.width}x${vp.height} == 탭바 top=${res.tabbarTop} 시트 scroll=${res.scrollTop}/${res.scrollHeight - res.clientHeight} (sh=${res.scrollHeight} ch=${res.clientHeight})`);
        res.btns.forEach((b, i) => {
            const c = clicks[i];
            const ok = !b.underTabbar && b.hitSelf && c.shopStillOpen && /결제/.test(c.toastText);
            if (!ok) fail++;
            console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${b.label} y=${b.top}~${b.bottom} underTabbar=${b.underTabbar} hitSelf=${b.hitSelf} (${b.hitTag}) shopOpen=${c.shopStillOpen} toast="${c.toastText}"`);
        });
        await page.close();
    }

    console.log(`\n실패 ${fail}건 / 콘솔 에러 ${errs.length}건`);
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fail || errs.length ? 1 : 0);
})();
