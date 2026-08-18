// 메인 화면 장비 셀의 '실제로 보이는 아이콘 그림'이 셀의 몇 %를 차지하는지 정밀 측정.
// .cell-img 의 박스 크기만 재면 안 된다 — 3D 스냅샷 썸네일은 투명 여백을 품고 있어서
// 박스가 커도 그림은 작을 수 있다. 그래서 이미지를 캔버스에 그려 **불투명 픽셀 바운딩 박스**를 잡고,
// 그걸 셀 크기 대비 %로 환산한다(원본 PNG 쪽 실측치와 같은 자).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SC = require('./shot-screens-seed.js');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && S && S.forgeLevel === 29', { label: '시드 상태 로드' });
    await page.evaluate(() => { UI.toast = () => { }; UI.showCraftModal = () => { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await page.waitForTimeout(2500);

    const out = await page.evaluate(async () => {
        // ⚠️ 루프 안에서 await 하면 게임 틱이 renderEquipSheet 로 셀을 통째로 갈아끼워 이후 셀의
        //    getBoundingClientRect 가 0x0 으로 나온다(실제로 밟음) — 측정값을 먼저 동기로 스냅샷한다.
        const snap = [...document.querySelectorAll('.equip-grid .equip-cell')].map(cell => {
            const cr = cell.getBoundingClientRect();
            const img = cell.querySelector('.cell-img');
            const ir = img ? img.getBoundingClientRect() : null;
            return {
                cls: cell.className,
                cw: cr.width, ch: cr.height,
                iw: ir ? ir.width : 0, ih: ir ? ir.height : 0,
                tag: img ? img.tagName : null,
                src: img && img.tagName === 'IMG' ? img.src : null,
                emoji: img && img.tagName !== 'IMG' ? img.textContent.trim() : null,
                font: img ? getComputedStyle(img).fontSize : null,
            };
        });
        const gridR = document.querySelector('.equip-grid').getBoundingClientRect();
        const res = [];
        for (const s of snap) {
            const rec = {
                cls: s.cls, cell: [+s.cw.toFixed(1), +s.ch.toFixed(1)],
                box: [+s.iw.toFixed(1), +s.ih.toFixed(1)],
                boxPctW: +((s.iw / s.cw) * 100).toFixed(1),
                boxPctH: +((s.ih / s.ch) * 100).toFixed(1),
                emoji: s.emoji, font: s.font,
            };
            if (s.src) {
                try {
                    const im = new Image();
                    await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = s.src; });
                    const c = document.createElement('canvas');
                    c.width = im.naturalWidth; c.height = im.naturalHeight;
                    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
                    const D = g.getImageData(0, 0, c.width, c.height).data;
                    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
                    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
                        if (D[(y * c.width + x) * 4 + 3] > 24) {
                            if (x < x0) x0 = x; if (x > x1) x1 = x;
                            if (y < y0) y0 = y; if (y > y1) y1 = y;
                        }
                    }
                    rec.src = [c.width, c.height];
                    if (x1 >= 0) {
                        const sc = Math.min(s.iw / c.width, s.ih / c.height);   // object-fit: contain
                        const artW = (x1 - x0 + 1) * sc, artH = (y1 - y0 + 1) * sc;
                        rec.artPx = [+artW.toFixed(1), +artH.toFixed(1)];
                        rec.artPctW = +((artW / s.cw) * 100).toFixed(1);
                        rec.artPctH = +((artH / s.ch) * 100).toFixed(1);
                        rec.srcFill = +(((x1 - x0 + 1) / c.width) * 100).toFixed(1) + '\u00d7' + +(((y1 - y0 + 1) / c.height) * 100).toFixed(1);
                    }
                } catch (e) { rec.err = String(e).slice(0, 80); }
            }
            res.push(rec);
        }
        return { grid: [+gridR.width.toFixed(1), +gridR.height.toFixed(1)], cells: res };
    });

    console.log('grid', out.grid.join('x'));
    out.cells.forEach((r, i) => {
        console.log(`#${i} cell ${r.cell.join('x')} box ${r.box ? r.box.join('x') : '-'} (${r.boxPctW}%W ${r.boxPctH}%H)  art ${r.artPx ? r.artPx.join('x') : (r.emoji ? 'emoji ' + r.emoji + ' ' + r.font : '-')}  → 셀대비 ${r.artPctW || '-'}%W ${r.artPctH || '-'}%H  [src ${r.src ? r.src.join('x') : '-'} 채움 ${r.srcFill || '-'}]`);
    });
    console.log(errors.length ? '\nERRORS:\n' + errors.slice(0, 10).join('\n') : '\n(no console errors)');
    await browser.close();
})();
