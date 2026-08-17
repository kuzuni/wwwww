// 소환 결과 팝업의 '빈 밴드' 실측 — 타이틀과 아이콘 줄 사이(위 밴드)가 정말 비어 있는지 수치로 본다.
// 사용: node probe-sr-band.js
// 왜: 6~8차 비평가가 반복해서 "위아래 세로 밴드가 비어 있다"고 지적했는데, 고치고 나서
//     "덜 비었다"를 눈으로만 판정하면 다음 세션이 또 같은 자리를 판다. 밴드별로
//     ① 평균 휘도 ② 표준편차(=구조가 있는가) ③ 밝은 픽셀 비율을 내서 비교 가능하게 만든다.
// 판정: 위 밴드의 표준편차가 '빈 배경'(맨 위 여백 밴드)과 같은 수준이면 여전히 빈 것이다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; saveGame();
`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Scene3D !== 'undefined', null, { timeout: 20000 });
    await page.evaluate(SEED);
    await page.evaluate(() => { Scene3D.update = function () { }; });   // 3D 루프를 멈춰야 캡처가 빠르다
    await page.waitForTimeout(600);

    // 저등급만 나오는 x5 — 주역(전설 이상)이 없어야 이 항목(ⓕ)의 화면이다
    await page.evaluate(() => {
        // 스킬 소환 결과는 `{def, isNew}` 형태다 — 저등급만 골라 주역(전설 이상)이 없는 판을 만든다
        const low = SKILL_DEFS.filter(d => d.rarity === 'common' || d.rarity === 'rare').slice(0, 3);
        const rolls = [0, 1, 2, 0, 1].map((k, i) => ({ def: low[k % low.length], isNew: i < 2 }));
        UI.openSummonResult('skill', rolls);
        UI.skipSummonResult && UI.skipSummonResult();
    });
    await page.waitForTimeout(1400);

    const out = await page.evaluate(() => {
        const m = document.getElementById('summon-result-modal');
        const q = (s) => m.querySelector(s);
        const r = (el) => el ? el.getBoundingClientRect() : null;
        return {
            done: m.classList.contains('done'),
            canopy: !!q('.sr-canopy'),
            title: r(q('.sr-title')), grid: r(q('.sr-grid')), arch: r(q('.sr-canopy')),
            h: window.innerHeight, w: window.innerWidth,
        };
    });
    if (!out.grid) { console.log('그리드를 못 찾았다 — 팝업이 안 떴다'); await browser.close(); process.exit(1); }

    // ⚠️ 이 환경엔 pngjs가 없다 — 스크린샷을 base64로 페이지에 넣고 **캔버스로 디코드**해 읽는다
    //    (다른 폴리싱 프로브들이 쓰는 것과 같은 경로).
    const b64 = (await page.screenshot({ timeout: 60000 })).toString('base64');
    const rows = await page.evaluate(async ({ b64, title, grid, h }) => {
        const im = new Image();
        await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const scale = im.height / h;
        const band = (y0, y1, label) => {
            y0 = Math.max(0, Math.round(y0 * scale)); y1 = Math.min(im.height, Math.round(y1 * scale));
            if (y1 - y0 < 4) return null;
            const d = g.getImageData(0, y0, im.width, y1 - y0).data;
            let n = 0, s = 0, s2 = 0, bright = 0;
            for (let i = 0; i < d.length; i += 4) {
                const v = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
                n++; s += v; s2 += v * v; if (v > 0.34) bright++;
            }
            const mean = s / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
            return { label, y0, y1, mean: +mean.toFixed(4), sd: +sd.toFixed(4), bright: +(bright / n).toFixed(4) };
        };
        return [
            band(0, title.top, '기준: 팝업 맨 위 여백'),
            band(title.bottom, grid.top, '위 밴드(타이틀↔아이콘)'),
            band(grid.top, grid.bottom, '아이콘 줄'),
        ].filter(Boolean);
    }, { b64, title: out.title, grid: out.grid, h: out.h });

    console.log(`천개(.sr-canopy) ${out.canopy ? '있음' : '없음'} / done=${out.done}`);
    for (const b of rows) console.log(`  ${b.label.padEnd(22)} y ${b.y0}~${b.y1}  평균휘도 ${b.mean}  표준편차 ${b.sd}  밝은픽셀 ${(b.bright * 100).toFixed(1)}%`);
    {
        const empty = rows[0], top = rows[1];
        if (empty && top) {
            const ratio = top.sd / Math.max(1e-6, empty.sd);
            // 기준선(실측 기록): 천개(.sr-canopy) 도입 **전 2.51배 / 후 4.59배**.
            // 절대 합격선을 박아 두면 나중에 그 숫자에 맞춰 목표를 옮기게 되므로, 이 두 값을
            // 회귀 기준으로만 쓴다 — 4.0 아래로 떨어지면 위 밴드를 채우던 무언가가 죽은 것이다.
            console.log(`  → 위 밴드 구조도(표준편차 / 빈 배경 표준편차) = ${ratio.toFixed(2)}배`
                        + `  (기준선: 천개 도입 전 2.51 / 후 4.59)  ${ratio >= 4.0 ? 'OK' : '✗ 회귀 의심'}`);
        }
    }
    console.log(errors.length ? 'PAGE ERRORS:\n' + errors.join('\n') : '(no page errors)');
    await browser.close();
})();
