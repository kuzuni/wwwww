// 새 IconGen 아이콘(lock/key/gift/trophy)을 원본 크기와 실사용 배지 크기로 나란히 찍는다.
// 사용: node shot-icons-new.js  → tools/icons-new.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const NAMES = process.argv.slice(2).length ? process.argv.slice(2) : ['lock', 'key', 'gift', 'trophy'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 760, height: 300 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof IconGen !== "undefined"');
    const urls = await page.evaluate(ns => ns.map(n => [n, IconGen.url(n)]), NAMES);
    const missing = urls.filter(([, u]) => !u).map(([n]) => n);
    const html = `<body style="margin:0;background:#20242a;font:12px sans-serif;color:#ddd">
      <div style="display:flex;gap:26px;padding:18px">${urls.map(([n, u]) => `
        <div style="text-align:center">
          <img src="${u}" style="width:96px;height:96px;image-rendering:auto"><br>
          <img src="${u}" style="width:44px;height:44px"> <img src="${u}" style="width:22px;height:22px"> <img src="${u}" style="width:14px;height:14px">
          <div style="margin-top:6px">${n}</div>
        </div>`).join('')}</div>
      <div style="display:flex;gap:26px;padding:0 18px;background:#f2f2f2">${urls.map(([, u]) => `
        <div style="width:96px;text-align:center;padding:8px 0"><img src="${u}" style="width:44px;height:44px"> <img src="${u}" style="width:14px;height:14px"></div>`).join('')}</div></body>`;
    const p2 = await browser.newPage({ viewport: { width: 760, height: 260 } });
    await p2.setContent(html);
    await p2.screenshot({ path: path.resolve(__dirname, 'icons-new.png') });
    console.log(missing.length ? `누락: ${missing.join(',')}` : `생성 OK: ${NAMES.join(', ')}`, '· 에러', errs.length + '건');
    if (errs.length) console.log(errs.slice(0, 3));
    await browser.close();
})();
