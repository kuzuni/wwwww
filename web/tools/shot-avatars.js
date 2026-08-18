// 아바타 24종 대조판 — 원본 타일(44px)과 **같은 크기**로 늘어놓고, 아래에 9배 확대판을 붙인다.
// 왜 두 배율인가: 실제로 보이는 크기(44px)에서 정체가 읽히는지와, 도트가 격자에 딱 떨어지는지를
// 한 장에서 같이 봐야 하기 때문이다. 큰 것만 보면 44px 에서 뭉개지는 걸 못 잡는다(원본 화풍의 핵심이
// '작아도 안 뭉개진다'는 것이다).
//
// 사용: node tools/shot-avatars.js [out.png]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.resolve(__dirname, 'avatars-sheet.png');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 760, height: 1200 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    await page.waitForFunction(() => typeof IconGen !== 'undefined' && typeof AVATAR_POOL !== 'undefined', null, { timeout: 150000 });

    const html = await page.evaluate(() => {
        const rows = AVATAR_POOL.map(e => ({ e, u: IconGen.url(IconGen.avatarKey(e)) }));
        // 원본 타일과 같은 겉모습: 흰 면 + 2px 순검정 키라인 + 라운드 6px.
        const tile = (u, px) => `<div style="width:${px}px;height:${px}px;background:#fff;border:${Math.max(2, px / 22) | 0}px solid #000;border-radius:${px / 7}px;box-sizing:border-box">`
            + `<img src="${u}" style="width:100%;height:100%;image-rendering:pixelated;display:block">` + '</div>';
        const small = rows.map(r => `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">${tile(r.u, 44)}<span style="font:10px monospace">${r.e}</span></div>`).join('');
        const big = rows.map(r => tile(r.u, 108)).join('');
        return `<div style="background:#e9edf2;padding:12px;font-family:sans-serif">
          <div style="font:bold 13px sans-serif;margin:4px 0">실제 표시 크기 44px (원본 타일과 동일)</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">${small}</div>
          <div style="font:bold 13px sans-serif;margin:12px 0 4px">확대 108px</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">${big}</div>
        </div>`;
    });
    await page.setContent(`<body style="margin:0">${html}</body>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: OUT, fullPage: true });
    console.log('wrote', OUT, errs.length ? `⚠️ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}` : '· 콘솔 에러 0건');
    await browser.close();
})();
