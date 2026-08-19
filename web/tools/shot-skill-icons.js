// 스킬 아이콘 18종 대조 시트 — `skill-name-icon-match-fx` 눈 대조용.
// 위: 실제 표시 크기(38px, 스킬 오브 글리프 실측) / 아래: 4배 확대. 이름·fx 를 함께 찍어
// "이름·아이콘만 보고 연출이 짐작되는가"를 사람이 바로 판정할 수 있게 한다.
// 사용: node tools/shot-skill-icons.js [출력.png]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.resolve(__dirname, 'skill-icons-sheet.png');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 200; i++) {
        if (await page.evaluate(() => typeof IconGen !== 'undefined' && typeof SKILL_DEFS !== 'undefined').catch(() => false)) break;
        await page.waitForTimeout(100);
    }
    await page.evaluate(() => {
        // 시트를 만들려고 body 를 통째로 갈아 끼우므로, 게임 틱이 먼저 멎어야 한다 —
        // 안 멈추면 다음 틱이 사라진 DOM 을 만져 콘솔 에러가 난다(도구 탓인데 게임 탓으로 보인다).
        for (let i = 1; i < 5000; i++) { clearInterval(i); clearTimeout(i); }
        const rows = SKILL_DEFS.map(d => `
            <div style="width:180px;text-align:center;font:700 12px sans-serif;color:#eee;padding:8px 0">
                <div style="display:flex;align-items:flex-end;justify-content:center;gap:10px;height:160px">
                    <div style="width:38px;height:38px">${IconGen.img('sk_' + d.id)}</div>
                    <div style="width:152px;height:152px">${IconGen.img('sk_' + d.id)}</div>
                </div>
                <div style="margin-top:6px">${d.name}</div>
                <div style="color:#8fd; font-weight:400">fx: ${d.fx}</div>
            </div>`).join('');
        document.body.innerHTML = `<div id="sheet" style="background:#2a2f3a;display:flex;flex-wrap:wrap;padding:6px">${rows}</div>`;
        document.querySelectorAll('#sheet img, #sheet .ico').forEach(el => { el.style.width = '100%'; el.style.height = '100%'; });
    });
    await page.waitForTimeout(400);
    const el = await page.$('#sheet');
    await el.screenshot({ path: OUT });
    console.log('저장:', OUT, '· 콘솔 에러', errs.length, errs.slice(0, 3));
    await browser.close();
})();
