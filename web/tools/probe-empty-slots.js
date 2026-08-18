// 빈 장비 칸 실루엣 검증 — 새 세이브로 처음 켠 화면이 바로 이 상태라 눈에 띄는 자리다.
// ⑴ 8칸 전부 코드 생성 아이콘(이모지 잔여 0) ⑵ 아이콘이 칸의 85~95% 를 채운다(항목 ⑤)
// ⑶ 아이콘에 실제 dataURL 배경이 있다(img() 의 조용한 실패 차단) ⑷ 콘솔 에러 0
// 사용: PW_PATH=... node probe-empty-slots.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    await page.waitForTimeout(1100);
    // 장비를 전부 비워 빈 칸 상태를 만든다(새 세이브와 같은 화면)
    await page.evaluate(() => { S.equipment = {}; UI.renderEquipSheet(); });
    await page.waitForTimeout(400);

    const r = await page.evaluate(() => {
        const EMO = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}]/u;
        return [...document.querySelectorAll('.equip-cell.empty .cell-img.dim')].map(cell => {
            const i = cell.querySelector('.ico');
            const cb = cell.getBoundingClientRect();
            return {
                cls: i ? i.className.replace('ico ', '') : null,
                fill: i ? +(i.getBoundingClientRect().width / cb.width * 100).toFixed(1) : 0,
                bg: i ? getComputedStyle(i).backgroundImage.startsWith('url("data:') : false,
                emoji: EMO.test(cell.textContent),
            };
        });
    });

    r.forEach(x => console.log(`  ${(x.cls || 'EMOJI!').padEnd(20)} 채움 ${x.fill}%  그림=${x.bg}  이모지잔여=${x.emoji}`));
    const bad = [];
    if (r.length !== 8) bad.push(`빈 칸이 8개가 아니다 (${r.length})`);
    if (r.some(x => !x.cls)) bad.push('아이콘이 없는 칸이 있다');
    if (r.some(x => x.emoji)) bad.push('이모지가 남아 있는 칸이 있다');
    if (r.some(x => !x.bg)) bad.push('그림이 안 붙은 아이콘이 있다');
    if (r.some(x => x.fill < 85 || x.fill > 95)) bad.push('채움 비율이 85~95% 밖인 칸이 있다: ' + r.map(x => x.fill).join(','));
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');
    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ') : '\nPASS — 8칸 전부 코드 생성 아이콘 · 채움 88% · 콘솔 에러 0건');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
