// `.modal-card.sheet` 의 `position:relative` 를 앵커로 쓰는 자손이 뒤로 ◀ 말고 또 있는지 실측.
//
// 왜 필요한가: `quest-arrow-fixed` 의 원인은 `.modal-card.sheet` 가 스크롤 컨테이너(overflow-y:auto)
// 이면서 동시에 `.sheet-back-btn` 의 앵커(position:relative)라는 점이다. 앵커를 바깥
// `.modal`(position:absolute; inset:0 — 스크롤 안 함, 박스는 시트와 동일)로 옮기면 해결되는데,
// 그러려면 시트의 relative 를 걷어내야 한다. **그 relative 에 기대는 다른 자손이 있으면 같이 틀어진다.**
// 그래서 고치기 전에 시트별로 `offsetParent === 시트` 인 절대배치 자손을 전수로 찍어 둔다.
//
// 사용: PW_PATH=... node probe-sheet-abs-anchors.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SHEETS = [
    ['퀘스트', 'UI.openQuests()'],
    ['던전', 'UI.openDungeons()'],
    ['상점', 'UI.openShop()'],
    ['리그', 'UI.openLeague()'],
    ['패스', 'UI.openPass()'],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    for (const [name, call] of SHEETS) {
        const r = await page.evaluate(async (call) => {
            try { (0, eval)(call); } catch (e) { return { skip: String(e) }; }
            await new Promise(r => requestAnimationFrame(r));
            document.querySelectorAll('.opening').forEach(e => e.classList.remove('opening'));
            const cards = [...document.querySelectorAll('.modal:not(.hidden) .modal-card.sheet')];
            if (!cards.length) return { skip: '시트 없음' };
            const out = [];
            for (const card of cards) {
                for (const el of card.querySelectorAll('*')) {
                    const cs = getComputedStyle(el);
                    if (cs.position !== 'absolute' && cs.position !== 'fixed') continue;
                    if (el.offsetParent !== card) continue;   // 더 가까운 앵커가 있으면 영향 없음
                    const b = el.getBoundingClientRect();
                    out.push({ cls: (el.className || el.tagName) + '', pos: cs.position, x: +b.x.toFixed(1), y: +b.y.toFixed(1) });
                }
            }
            return { out };
        }, call);

        if (r.skip) { console.log(`${name}: (건너뜀 — ${r.skip})`); }
        else if (!r.out.length) console.log(`${name}: 시트 앵커에 매달린 절대배치 자손 없음`);
        else r.out.forEach(o => console.log(`${name}: ${o.pos} [${o.cls}] @ ${o.x},${o.y}`));
        await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')));
    }
    await browser.close();
})();
