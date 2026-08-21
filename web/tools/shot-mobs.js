// 새 박스 모델(마인크래프트 문법) 종 시트 — pet-mount-minecraft-remake.
// 사용: node shot-mobs.js pets|mounts [출력이름]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const KIND = process.argv[2] || 'pets';
const OUT = process.argv[3] || (KIND + '-new');
(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto('file://' + path.resolve(__dirname, 'mobsheet.html'), { waitUntil: 'load' });
    const names = await page.evaluate(k => Object.keys(k === 'pets' ? PET_MODELS : MOUNT_MODELS), KIND);
    const shots = [];
    for (const n of names) {
        const two = await page.evaluate(({ n, k }) => {
            const m = (k === 'pets' ? PET_MODELS : MOUNT_MODELS)[n];
            return [renderMob(m, 260, 0.62), renderMob(m, 260, Math.PI / 2)];
        }, { n, k: KIND });
        shots.push({ n, two });
    }
    const KRmap = KIND === 'pets' ? 'PET_KR' : 'MOUNT_KR';
    const html = `<html><head><meta charset="utf-8"><style>
      body{margin:0;background:#191d22;font:13px/1.4 system-ui,sans-serif;color:#cfd6de;padding:10px}
      .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .cell{background:#23272e;border-radius:8px;padding:6px;text-align:center}
      .cell img{width:48%;vertical-align:top}
      .cell div{margin-top:2px;font-size:12px;color:#9fb0c0}
    </style></head><body><div class="grid">${shots.map(s =>
        `<div class="cell">${s.two.map(u => `<img src="${u}">`).join('')}<div>${s.n}</div></div>`).join('')}
    </div></body></html>`;
    const tmp = path.resolve(__dirname, '_mobsheet-out.html');
    fs.writeFileSync(tmp, html);
    await page.goto('file://' + tmp, { waitUntil: 'load' });
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width: 1200, height: Math.min(9000, h + 20) });
    await page.screenshot({ path: path.resolve(__dirname, OUT + '.png'), fullPage: true });
    fs.unlinkSync(tmp);
    await browser.close();
    console.log(`→ tools/${OUT}.png · ${names.length}종 · 에러 ${errs.length}건`);
    if (errs.length) console.log(errs.slice(0, 5).join('\n'));
})();
