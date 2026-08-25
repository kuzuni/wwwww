// 아이콘 몇 종을 **인게임 표시 크기로 그린 다음 그 픽셀을 최근접 확대**해 나란히 찍는다.
//
// 왜 이 자가 따로 필요한가 (2026-08-25 UI 스트림):
//   `shot-icons-block.js` 는 전수 48px 시트라 '한 종이 왜 안 읽히나'를 못 답한다.
//   블록 화법의 결함은 전부 **칸 단위**(칸이 뭉쳤나 · 테가 속살을 먹었나 · 색이 몇 개나 서나)인데
//   48px 시트에서는 칸이 2.4px 라 눈으로 셀 수가 없다. 이 자는 같은 표시 크기(=제품과 동일한
//   다운스케일을 실제로 거친 판)를 찍은 뒤 **`image-rendering:pixelated` 로 8배 확대**해
//   칸을 눈으로 세게 한다 — 제품이 보는 것과 같은 픽셀을, 사람이 볼 수 있는 크기로.
//   🚨 소스 PNG(160×160)를 그냥 크게 그리면 안 된다 — 그건 제품이 보는 판이 아니다
//      (라운드4 가 그 함정으로 '각진 알파 100% PASS' 를 받고도 화면은 뿌옜다).
//
// 사용: node diag-icon-zoom.js <이름[,이름...]> [표시px] [배율]
//   예: node diag-icon-zoom.js shop_gems2,shop_gems3,shop_gems4 48 8
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const NAMES = (process.argv[2] || '').split(',').filter(Boolean);
const PX = +(process.argv[3] || 48);
const ZOOM = +(process.argv[4] || 8);
const OUT = process.env.OUT || path.join(__dirname, 'icon-zoom.png');
const ICONGEN = path.resolve(__dirname, '../js/icongen.js');
const AVATARS = path.resolve(__dirname, '../js/avatars.js');

if (!NAMES.length) { console.error('사용: node diag-icon-zoom.js <이름[,이름...]> [표시px] [배율]'); process.exit(2); }

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1200, height: 400 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#171b21"><div id="s"></div></body>');
    await page.addScriptTag({ content: fs.readFileSync(ICONGEN, 'utf8') });
    if (fs.existsSync(AVATARS)) await page.addScriptTag({ content: fs.readFileSync(AVATARS, 'utf8') });

    const stats = await page.evaluate(async ({ names, px, zoom }) => {
        const out = [];
        const host = document.getElementById('s');
        host.style.cssText = 'display:flex;gap:14px;padding:12px;flex-wrap:wrap;align-items:flex-start';
        for (const nm of names) {
            const asp = (IconGen.ASPECT && IconGen.ASPECT[nm]) || 1;
            const w = Math.round(px * asp), h = px;
            // ① 제품과 동일한 다운스케일: 소스 PNG 를 표시 크기 캔버스에 그린다.
            const im = new Image();
            im.src = IconGen.url(nm);
            await im.decode();
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const g = c.getContext('2d');
            g.imageSmoothingEnabled = false;           // 제품 CSS = image-rendering:pixelated
            g.drawImage(im, 0, 0, w, h);
            const d = g.getImageData(0, 0, w, h).data;
            const cols = new Set(); let semi = 0;
            for (let i = 0; i < d.length; i += 4) {
                const a = d[i + 3];
                if (a > 8 && a < 247) semi++;
                if (a > 8) cols.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
            }
            // ② 그 픽셀을 최근접 확대
            const z = document.createElement('canvas');
            z.width = w * zoom; z.height = h * zoom;
            const zg = z.getContext('2d');
            zg.imageSmoothingEnabled = false;
            zg.drawImage(c, 0, 0, z.width, z.height);
            const box = document.createElement('div');
            box.style.cssText = 'text-align:center;color:#e8edf4;font:10px sans-serif';
            z.style.cssText = 'background:#2b323b;display:block';
            box.appendChild(z);
            const lab = document.createElement('div');
            lab.textContent = `${nm} · ${w}x${h} · ${cols.size}색 · 반투명 ${semi}`;
            lab.style.marginTop = '3px';
            box.appendChild(lab);
            host.appendChild(box);
            out.push({ nm, w, h, colors: cols.size, semi });
        }
        return out;
    }, { names: NAMES, px: PX, zoom: ZOOM });

    await page.evaluate(() => new Promise(r => setTimeout(r, 200)));
    const bh = await page.evaluate(() => document.body.scrollHeight);
    const bw = await page.evaluate(() => document.body.scrollWidth);
    await page.setViewportSize({ width: Math.min(bw + 10, 2400), height: Math.min(bh + 10, 4000) });
    await page.screenshot({ path: OUT, fullPage: true });
    await browser.close();
    for (const s of stats) console.log(`${s.nm.padEnd(16)} ${String(s.w).padStart(3)}x${s.h}  색 ${String(s.colors).padStart(3)}  반투명 ${s.semi}`);
    console.log(`saved ${OUT}${errs.length ? ' · 콘솔 ' + errs.length + '건' : ''}`);
})();
