// 블록 화법(`ui-icon-blockify`) 전수 시트 — IconGen.draw 에 등록된 아이콘을 **전부** 굽는다.
// 사용: node shot-icons-block.js [출력파일]
//
// 왜 전수인가: 블록화는 `url()` 한 곳에서 150여 종에 동시에 걸린다. 표본 10종만 보고 넘기면
// 가로로 긴 상점 일러스트(ASPECT 1.52)나 획이 가는 글리프(체크·자물쇠)처럼 **화법 전환이
// 유독 아프게 오는 종**을 못 본 채로 지나간다. 종별로 다시 그리는 대신 한 곳에서 바꾼 대가로
// 전수 눈검사가 의무가 된다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || path.join(__dirname, 'icons-block.png');
const ICONGEN = path.resolve(__dirname, '../js/icongen.js');
const AVATARS = path.resolve(__dirname, '../js/avatars.js');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1240, height: 400 }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    // `.ico` 규칙은 css/style.css 에 있는데 이 시트는 그걸 안 싣는다 — 최소 규칙을 직접 준다.
    // (안 주면 `<i>` 가 0×0 이라 **전 종이 빈 칸으로 찍힌다**. 실제로 한 번 그렇게 찍혔다.)
    // 🚨 `image-rendering` 을 **반드시 제품(`.ico`, style.css 7191행)과 같이 줄 것.** 이게 빠지면
    //    시트는 브라우저 보간으로 뿌예진 판을 보여 주는데 게임 화면은 칸이 서 있다 = **시트가
    //    거짓말을 한다**(칸 폭 종횡비를 안 줘서 dg_* 가 거짓 감점을 받았던 라운드2 와 같은 계열의 결함).
    await page.setContent(`<!doctype html><meta charset="utf-8">
<style>.ico{display:block;width:100%;height:100%;background-size:contain;background-repeat:no-repeat;background-position:center;image-rendering:crisp-edges;image-rendering:pixelated}</style>
<body style="margin:0;background:#171b21;font-family:sans-serif;color:#e8edf4">
<div id="sheet"></div></body>`);
    await page.addScriptTag({ content: fs.readFileSync(ICONGEN, 'utf8') });
    if (fs.existsSync(AVATARS)) await page.addScriptTag({ content: fs.readFileSync(AVATARS, 'utf8') });

    const n = await page.evaluate(() => {
        const names = Object.keys(IconGen.draw).sort();
        /* 🚨 **칸을 종횡비대로 넓힌다 — 정사각 48px 에 다 밀어 넣으면 시트가 거짓말을 한다.**
         * 라운드1·2 비평가 4인이 전부 `dg_*`(배너, 3.45:1)를 최악으로 집었는데, 라운드2 지적 사유가
         * "레터박스로 낀 가로 스트립이라 주제가 안 읽힌다"였다 — 그건 **제품이 아니라 이 시트**가
         * 3.45:1 그림을 48px 정사각에 넣어 48×14 로 눌러 버린 탓이다(인게임 배너 슬롯은 302px 폭).
         * `background-size:contain` 이라 칸이 좁으면 그림이 통째로 축소돼 칸 격자까지 안 보인다.
         * → 칸 폭을 `48 × ASPECT`(상한 176px)로 준다. 정사각 종은 종전과 완전히 같다(ASPECT 1). */
        const H = 48, MAXW = 176;
        document.getElementById('sheet').innerHTML = `
      <div style="padding:10px 14px">
        <div style="font-size:12px;opacity:.6;margin-bottom:8px">IconGen 전수 ${names.length}종 · 높이 ${H}px 고정, 폭은 종횡비대로 (블록 화법 눈검사)</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
          ${names.map((nm) => {
            const w = Math.min(MAXW, Math.round(H * (IconGen.ASPECT[nm] || 1)));
            return `<div style="text-align:center;width:${Math.max(76, w + 8)}px">
              <div style="width:${w}px;height:${H}px;margin:0 auto;background:#2b323b;display:flex;align-items:center;justify-content:center">${IconGen.img(nm)}</div>
              <div style="font-size:8px;opacity:.55;margin-top:2px;word-break:break-all">${nm}</div>
            </div>`;
        }).join('')}
        </div>
      </div>`;
        return names.length;
    });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width: 1240, height: Math.min(h + 20, 6000) });
    await page.screenshot({ path: OUT, fullPage: true });
    await browser.close();
    console.log(`saved ${OUT} · ${n}종 · 콘솔 에러 ${errs.length}건`, errs.slice(0, 5));
})();
