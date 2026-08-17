// IconGen 아이콘 시트 캡처 — 캔버스 생성 아이콘 품질 육안/비평가 채점용
// 사용: PW_PATH=<playwright 경로> node shot-icons.js [출력파일]
const { chromium } = require(process.env.PW_PATH || 'playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || path.join(__dirname, 'icons-sheet.png');
const ICONGEN = path.resolve(__dirname, '../js/icongen.js');

// [아이콘이름, 라벨, 옵션]
const LIST = [
    ['coin', '코인 👑', null],
    ['gem', '젬 ◆', null],
    ['hammer', '해머 🔨', null],
    ['egg', '알 🥚', null],
    ['ticket', '티켓 🎫', null],
    ['potion', '물약 🧪', null],
    ['winder', '태엽 ⚙️', null],
    ['egg', '알(전설)', { tint: '#f0a316' }],
    ['egg', '알(영웅)', { tint: '#a855f7' }],
    ['gem', '젬(청)', { tint: '#3b82f6' }],
];

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 980, height: 620 }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));

    await page.setContent(`<!doctype html><meta charset="utf-8">
<body style="margin:0;background:#171b21;font-family:sans-serif;color:#e8edf4">
<div id="sheet"></div></body>`);
    await page.addScriptTag({ content: fs.readFileSync(ICONGEN, 'utf8') });

    await page.evaluate((list) => {
        const S = document.getElementById('sheet');
        // 3행: 실사용 크기(pill 14px) / 타일 크기(44px) / 확대(128px)
        const rows = [
            { px: 14, bg: '#22272e', label: 'pill 14px · 어두운 상단바 (실사용 크기)' },
            { px: 14, bg: '#c9c9c9', label: 'pill 14px · 밝은 회색 pill (상점 보상 pill #c9c9c9 — 실루엣 생존 확인)' },
            { px: 20, bg: '#c0c0c0', label: '20px · 밝은 회색 버튼 (소환 버튼 #c0c0c0)' },
            { px: 44, bg: '#2b323b', label: 'tile 44px' },
            { px: 128, bg: '#0f1216', label: '확대 128px (품질 점검)' },
        ];
        S.innerHTML = rows.map((r) => `
      <div style="padding:10px 14px">
        <div style="font-size:12px;opacity:.6;margin-bottom:6px">${r.label}</div>
        <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">
          ${list.map(([n, lb, o]) => `
            <div style="text-align:center">
              <div style="background:${r.bg};border-radius:8px;padding:6px;display:inline-flex">
                <img src="${IconGen.url(n, o)}" style="width:${r.px}px;height:${r.px}px;display:block">
              </div>
              ${r.px === 128 ? `<div style="font-size:11px;opacity:.7;margin-top:4px">${lb}</div>` : ''}
            </div>`).join('')}
        </div>
      </div>`).join('');
    }, LIST);

    await page.waitForTimeout(200);
    await page.screenshot({ path: OUT, fullPage: true });
    await browser.close();
    console.log('saved', OUT, 'console errors:', errs.length, errs.slice(0, 5));
})();
