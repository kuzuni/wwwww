// 엠블럼 24종을 **옛 화법(글로시 흰 그라디언트)** 과 **새 화법(평면 3단)** 으로 각각 구워
// 표시 크기(38px)와 확대(4배)로 나란히 붙인 A/B 시트를 만든다.
//
// 왜: `probe-emblem-core` 의 속살은 **루마 ≥110** 이라 '희다'와 '읽힌다'를 구분하지 못한다.
// 새 화법이 정말 안 읽히는 것인지, 아니면 그저 덜 흰 것인지는 **눈으로 한 번 봐야** 갈린다.
// 수치만 보고 화풍을 되돌리면 확정 화풍(voxel ㉯㉰㉱ 플랫/매트)을 수치가 뒤집는 셈이 된다.
//
// 사용: node shot-emblem-ab.js [출력png]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.join(__dirname, 'emblem-ab.png');

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof IconGen !== "undefined"');
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () { }; if (typeof Combat !== 'undefined') Combat.tick = function () { }; });

    // 오브 바탕은 실제로 아이콘이 앉는 자리를 흉내낸다 — 저등급 오브(#e0e0e0)가 가장 불리하다.
    const html = await page.evaluate(async () => {
        const names = Object.keys(IconGen.draw).filter(n => /^sk_|^tm_/.test(n));
        const bake = () => { IconGen.cache = {}; return names.map(n => IconGen.url(n)); };
        const NEW = bake();
        // 옛 화법 복원: 흰 끝 + 62% 흰섞임 + 알파 .9 소프트 광택
        IconGen._EMBLEM_STEP = { top: 0.62, mid: 0.62, bot: 0.08, floorL: 0, gloss: 0.9, legacy: true };
        const OLD = bake();
        IconGen._EMBLEM_STEP = { top: 0.30, mid: 0.05, bot: -0.24, floorL: 116, gloss: 0.22 };
        IconGen.cache = {};
        return { names, NEW, OLD };
    });

    await page.setContent(`<body style="margin:0;background:#2b2b2b;font:11px sans-serif;color:#ddd">
      <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:8px">
      ${html.names.map((n, i) => `
        <div style="text-align:center">
          <div style="font-size:9px;margin-bottom:2px">${n.replace(/^(sk|tm)_/, '')}</div>
          <div style="display:flex;gap:4px;justify-content:center">
            <div>
              <div style="width:38px;height:38px;background:#e0e0e0;border-radius:50%;display:flex;align-items:center;justify-content:center"><img src="${html.OLD[i]}" style="width:38px;height:38px"></div>
              <div style="width:152px;height:152px;background:#e0e0e0;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-top:2px"><img src="${html.OLD[i]}" style="width:152px;height:152px;image-rendering:pixelated"></div>
              <div style="font-size:8px">옛</div>
            </div>
            <div>
              <div style="width:38px;height:38px;background:#e0e0e0;border-radius:50%;display:flex;align-items:center;justify-content:center"><img src="${html.NEW[i]}" style="width:38px;height:38px"></div>
              <div style="width:152px;height:152px;background:#e0e0e0;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-top:2px"><img src="${html.NEW[i]}" style="width:152px;height:152px;image-rendering:pixelated"></div>
              <div style="font-size:8px">새</div>
            </div>
          </div>
        </div>`).join('')}
      </div></body>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: OUT, fullPage: true });
    console.log('저장:', OUT);
    await browser.close();
})();
