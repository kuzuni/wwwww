/* 던전 배너 한 종을 **인게임 표시 크기로** 그린 뒤, `probe-dungeon-value` 와 **같은 창·같은 12밴드**로
 * 잘라 밴드마다 평균 휘도·암부%·상위 색을 찍는다.
 *
 * 왜 따로 필요한가 (2026-08-25 UI 스트림, slug `dg-band-luma`):
 *   `probe-dungeon-value` 는 '몇 번 밴드가 원본보다 몇 밝다'까지만 말한다 — **무엇이 밝히는지**는
 *   안 말한다. 배너는 층(하늘/원경/근경)이 겹쳐 있어서 그 답 없이 손대면 엉뚱한 층을 만진다
 *   (달 헤일로를 줄여야 할 자리에서 언덕을 어둡게 하는 식). 이 자는 밴드별 **상위 색과 그 점유율**을
 *   같이 찍어 "이 밴드의 39% 를 루마 71 짜리 한 색이 채우고 있다" 까지 보여 준다.
 *
 * 🚨 표시 크기를 추정하지 말 것 — 인게임 `.dg-banner` 는 **387.2×112.2**(DOM 실측)이고, 칸은 5.6px 다.
 *    48px 로 보면 칸이 2.4px 라 층이 전부 뭉개져 아무것도 안 보인다(`diag-icon-zoom` 의 교훈과 같은 계열).
 * 🚨 창(가로 72%)은 `probe-dungeon-value` 와 **반드시 같아야** 한다 — 우측 28% 는 배경 아트가 아니라
 *    UI 열(열쇠·[열기])이라, 거기까지 재면 이 자의 숫자와 게이트의 숫자가 서로 안 맞는다.
 *
 * 사용: node tools/diag-dg-band.js [이름] [상위색개수]
 *   예: node tools/diag-dg-band.js dg_ghost 4
 */
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const NAME = process.argv[2] || 'dg_ghost';
const TOPN = +(process.argv[3] || 4);
const ICONGEN = path.resolve(__dirname, '../js/icongen.js');
const BW = 387.2, BH = 112.2;                 // `.dg-banner` DOM 실측(390x844 뷰포트)
const XWIN = 0.72;                            // probe-dungeon-value 와 같은 창

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 900, height: 300 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0"></body>');
    await page.addScriptTag({ content: fs.readFileSync(ICONGEN, 'utf8') });

    const r = await page.evaluate(async ({ name, bw, bh, xwin, topn }) => {
        const im = new Image();
        im.src = IconGen.url(name);
        await im.decode();
        const W = Math.round(bw), H = Math.round(bh);
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = false;                      // 제품 CSS = image-rendering:pixelated
        g.drawImage(im, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        const XLIM = Math.round(W * xwin);
        const bands = [];
        for (let b = 0; b < 12; b++) {
            let sum = 0, n = 0, dark = 0;
            const hist = new Map();
            for (let y = Math.floor(b * H / 12); y < Math.floor((b + 1) * H / 12); y++)
                for (let x = 0; x < XLIM; x++) {
                    const i = (y * W + x) * 4;
                    const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                    sum += L; n++; if (L < 62) dark++;
                    const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
                    hist.set(k, (hist.get(k) || 0) + 1);
                }
            const top = [...hist.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, topn)
                .map(([k, v]) => {
                    const [rr, gg, bb] = k.split(',').map(Number);
                    return { k, pct: +(100 * v / n).toFixed(1), L: +(0.2126 * rr + 0.7152 * gg + 0.0722 * bb).toFixed(0) };
                });
            bands.push({ L: +(sum / n).toFixed(1), dark: +(100 * dark / n).toFixed(1), top });
        }
        return { W, H, XLIM, bands };
    }, { name: NAME, bw: BW, bh: BH, xwin: XWIN, topn: TOPN });

    console.log(`${NAME} — 표시 ${r.W}x${r.H} · 측정창 x<${r.XLIM} (가로 ${XWIN * 100}%)`);
    r.bands.forEach((b, i) => {
        const y0 = (i / 12 * 100).toFixed(0), y1 = ((i + 1) / 12 * 100).toFixed(0);
        console.log(
            `밴드 ${String(i).padStart(2)} (y ${String(y0).padStart(2)}~${String(y1).padStart(3)}%)  루마 ${String(b.L).padStart(5)}  암부 ${String(b.dark).padStart(5)}%  ` +
            b.top.map(t => `${t.k}(L${t.L}) ${t.pct}%`).join(' · ')
        );
    });
    if (errs.length) console.log('콘솔 에러', errs.length, errs.slice(0, 3));
    await browser.close();
})();
