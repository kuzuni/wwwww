// 펫/스킬/탈것 소환 바의 '게이지와 버튼 사이 간격' 실측 — `pet-popup-gauge-gap` 진단용.
// 사용자 지적: "펫 팝업 게이지 부분이 버튼이랑 딱 붙어 있는 게 별로. 스킬 부분은 띄어져 있더만, 그렇게."
// 스킬 시트를 기준선으로 두고 펫 시트가 얼마나 붙어 있는지 숫자로 본다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await b.newPage({ viewport: { width: 499, height: 892 } });
    page.on('pageerror', e => console.log('PAGEERROR', e));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    for (const [kind, sub] of [['스킬', 'skills'], ['펫', 'pets']]) {
        await page.evaluate(s => { UI.switchTab('summon'); UI.switchSummonSub(s); }, sub);
        await page.waitForTimeout(600);
        const m = await page.evaluate(() => {
            const vis = sel => [...document.querySelectorAll(sel)].find(e => e.getBoundingClientRect().width > 0);
            const bar = vis('.summon-bar'); if (!bar) return { err: 'no .summon-bar' };
            const btn = bar.querySelector('.summon-btn'), info = bar.querySelector('.summon-info');
            const g = bar.querySelector('.summon-gauge'), lv = info && info.querySelector('b');
            if (!btn || !info || !g) return { err: 'missing parts' };
            const R = e => e.getBoundingClientRect();
            const cs = getComputedStyle(info), bcs = getComputedStyle(bar);
            return {
                barGap: bcs.gap, barPad: bcs.padding,
                btnToInfo: +(R(info).left - R(btn).right).toFixed(1),
                lvToGauge: lv ? +(R(g).top - R(lv).bottom).toFixed(1) : null,
                infoGap: cs.gap, infoPad: cs.padding, infoDisplay: cs.display, infoFlow: cs.flexDirection,
                gaugeW: +R(g).width.toFixed(1), gaugeH: +R(g).height.toFixed(1),
                barBottom: +R(bar).bottom.toFixed(1),
                nextTop: bar.nextElementSibling ? +R(bar.nextElementSibling).top.toFixed(1) : null,
            };
        });
        console.log(kind.padEnd(4), JSON.stringify(m));
        await page.screenshot({ path: path.resolve(__dirname, `summon-gap-${sub}.png`) });
    }
    await b.close();
})();
