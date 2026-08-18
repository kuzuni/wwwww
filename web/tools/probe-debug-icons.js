// 디버그 탭 아이콘 검증 — 이모지가 남아 있지 않고, 아이콘 노드가 실제 그림을 갖는지 본다.
// 사용: PW_PATH=... node probe-debug-icons.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX + '?tab=debug');
    await page.waitForTimeout(1100);
    const r = await page.evaluate(() => {
        const p = UI.els.panels.debug;
        const icos = [...p.querySelectorAll('.ico')];
        // 이모지가 텍스트로 남아 있는지 — 남아 있으면 교체가 덜 된 것
        const EMO = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u;
        const leftover = [...p.querySelectorAll('*')]
            .filter(n => [...n.childNodes].some(c => c.nodeType === 3 && EMO.test(c.textContent)))
            .map(n => n.textContent.trim().slice(0, 40));
        return {
            open: !p.classList.contains('hidden'),
            icons: icos.map(i => {
                const b = i.getBoundingClientRect();
                return { cls: i.className, w: +b.width.toFixed(1), h: +b.height.toFixed(1),
                         bg: getComputedStyle(i).backgroundImage.startsWith('url("data:') };
            }),
            leftover: [...new Set(leftover)],
        };
    });
    console.log('디버그 탭 열림:', r.open, '· 아이콘', r.icons.length, '개');
    r.icons.forEach(i => console.log(`  ${i.cls.padEnd(30)} ${i.w}x${i.h} 그림=${i.bg}`));
    console.log('이모지 잔여:', r.leftover.length ? r.leftover : '없음');
    const bad = [];
    if (!r.icons.length) bad.push('아이콘이 하나도 없다');
    if (r.icons.some(i => !i.bg)) bad.push('그림이 안 붙은 아이콘이 있다(img() 조용한 실패)');
    if (r.icons.some(i => i.w < 6 || i.h < 6)) bad.push('아이콘이 6px 미만으로 찌그러졌다');
    if (r.leftover.length) bad.push('이모지가 텍스트로 남아 있다: ' + r.leftover.join(' | '));
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');
    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ') : '\nPASS — 디버그 탭 이모지 0 · 아이콘 전부 그림 있음 · 콘솔 에러 0건');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
