// 아이콘을 **인게임 표시 크기로 그린 뒤** 실제 출력 팔레트(색·칸수·루마)를 인쇄한다.
//
// 왜 따로 필요한가 (2026-08-25 UI 스트림, `ui-icon-blockify` 종별 재작화):
//   `_blockify` 는 명도를 5칸({0,.25,.5,.75,1})에만 떨어뜨린다. 그래서 **소스에서 눈으로 고른
//   두 톤이 화면에서는 한 색**이 되는 일이 반복됐다(`shop_gems` 의 WOOD/WOOD_DK, 이번 `age_*`).
//   `diag-icon-zoom` 은 색 '수'만 세므로 어느 톤끼리 합쳐졌는지를 못 답한다 — 이 자는 색마다
//   화소 수와 HSL 명도를 같이 찍어 **어느 밴드에 앉았는지**를 보게 한다.
//   👉 톤을 고칠 때는 밴드 _한가운데_ 를 겨냥해 역산할 것(l = piv + (target − piv)/LCON).
//
// 사용: node diag-icon-palette.js <이름[,이름...]> [표시px]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const NAMES = (process.argv[2] || '').split(',').filter(Boolean);
const PX = +(process.argv[3] || 48);
const ICONGEN = path.resolve(__dirname, '../js/icongen.js');
const AVATARS = path.resolve(__dirname, '../js/avatars.js');
if (!NAMES.length) { console.error('사용: node diag-icon-palette.js <이름[,이름...]> [표시px]'); process.exit(2); }

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.setContent('<!doctype html><meta charset="utf-8"><body style="margin:0"></body>');
    await page.addScriptTag({ content: fs.readFileSync(ICONGEN, 'utf8') });
    if (fs.existsSync(AVATARS)) await page.addScriptTag({ content: fs.readFileSync(AVATARS, 'utf8') });

    const res = await page.evaluate(async ({ names, px }) => {
        const out = [];
        for (const n of names) {
            const url = IconGen.url(n);
            if (!url) { out.push({ n, err: '이름 없음' }); continue; }
            const im = new Image(); im.src = url;
            await im.decode();
            const c = document.createElement('canvas'); c.width = c.height = px;
            const g = c.getContext('2d');
            g.imageSmoothingEnabled = false;          // 제품의 image-rendering:pixelated 와 같은 판
            g.drawImage(im, 0, 0, px, px);
            const d = g.getImageData(0, 0, px, px).data;
            const map = new Map();
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 8) continue;
                const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
                map.set(k, (map.get(k) || 0) + 1);
            }
            const pal = [...map.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => {
                const [r, gg, b] = k.split(',').map(Number);
                const mx = Math.max(r, gg, b) / 255, mn = Math.min(r, gg, b) / 255;
                return { rgb: k, px: v, L: +(((mx + mn) / 2)).toFixed(3), luma: Math.round(0.299 * r + 0.587 * gg + 0.114 * b) };
            });
            out.push({ n, colors: pal.length, pal });
        }
        return out;
    }, { names: NAMES, px: PX });

    for (const r of res) {
        if (r.err) { console.log(r.n.padEnd(18), r.err); continue; }
        console.log(`\n${r.n}  ${PX}px  색 ${r.colors}`);
        for (const p of r.pal) console.log(`   rgb(${r.pal === p ? '' : ''}${p.rgb})`.padEnd(24) + `화소 ${String(p.px).padStart(4)}  L ${p.L}  루마 ${p.luma}`);
    }
    if (errs.length) { console.log('\n콘솔 오류:', errs.slice(0, 5)); }
    await browser.close();
})();
