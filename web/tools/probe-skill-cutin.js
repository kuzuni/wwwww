// 스킬 컷인 아이콘 검증 — 18종 전부 아이콘 노드가 붙고, 태그가 글자로 찍히지 않는지.
// 사용: PW_PATH=... node probe-skill-cutin.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
        const el = document.getElementById('skill-cutin');
        const rows = [];
        for (const def of SKILL_DEFS) {
            UI.skillCutin(def);
            const ico = el.querySelector('.ico');
            rows.push({
                id: def.id,
                ico: !!ico,
                cls: ico ? ico.className : '',
                bg: ico ? getComputedStyle(ico).backgroundImage.startsWith('url("data:') : false,
                // 태그가 글자로 찍혔는지 — textContent 에 '<' 가 보이면 실패
                raw: /[<>]/.test(el.textContent),
                text: el.textContent,
                name: def.name,
            });
        }
        return rows;
    });
    r.forEach(x => console.log(`  ${x.id.padEnd(14)} ico=${x.ico} 그림=${x.bg} 글자="${x.text}"`));
    const bad = [];
    const noIco = r.filter(x => !x.ico).map(x => x.id);
    if (noIco.length) bad.push('아이콘이 안 붙은 스킬: ' + noIco.join(','));
    if (r.some(x => !x.bg)) bad.push('그림이 없는 아이콘이 있다(img() 조용한 실패)');
    if (r.some(x => x.raw)) bad.push('태그가 글자로 찍혔다');
    if (r.some(x => x.text !== x.name)) bad.push('글자가 스킬 이름과 다르다');
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');
    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ') : `\nPASS — 스킬 ${r.length}종 전부 아이콘 · 태그 노출 0 · 콘솔 에러 0건`);
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
