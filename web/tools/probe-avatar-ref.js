// 원본 아바타 타일을 **도트 격자로 되읽는** 도구 — 도트 초상(avatar-pool)의 화풍 기준을 눈대중하지
// 않기 위한 것이다. 원본(shot-043500)의 아바타는 44px 타일 안에 32×32급 도트가 들어간 형태라,
// 타일 안쪽을 32등분해 각 칸의 대표색을 뽑으면 **원본이 실제로 쓴 격자·팔레트·비례**가 그대로 나온다.
//
// 사용: node tools/probe-avatar-ref.js <shotId> <tileX> <tileY> [tileW]
//   예: node tools/probe-avatar-ref.js 043500 63 58 44
// 출력: ⑴ 칸별 대표색을 문자로 찍은 32×32 지도 ⑵ 등장 색 목록(빈도순, 팔레트) ⑶ 실루엣 bbox 비율
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const [shotId, tx, ty, tw] = process.argv.slice(2);
if (!shotId || tx === undefined) { console.error('사용: node tools/probe-avatar-ref.js <shotId> <x> <y> [w]'); process.exit(2); }
const W = +(tw || 44);
const REF = shotId.includes('/') || shotId.endsWith('.png')
    ? path.resolve(process.cwd(), shotId)
    : path.resolve(__dirname, `../ref/screens/shot-${shotId}.png`);

(async () => {
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(REF).toString('base64');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const r = await page.evaluate(async ([src, x0, y0, w]) => {
        const img = new Image();
        await new Promise(res => { img.onload = res; img.src = src; });
        const c = document.getElementById('c');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(x0, y0, w, w).data;
        const at = (px, py) => {
            const i = (py * w + px) * 4;
            return [d[i], d[i + 1], d[i + 2]];
        };
        // 32등분 — 각 칸 중앙 픽셀을 대표색으로 (도트 격자와 위상이 맞으면 이게 가장 깨끗하다)
        const N = 32, cell = w / N, grid = [];
        for (let j = 0; j < N; j++) {
            const row = [];
            for (let i = 0; i < N; i++) {
                const px = Math.min(w - 1, Math.round((i + 0.5) * cell));
                const py = Math.min(w - 1, Math.round((j + 0.5) * cell));
                row.push(at(px, py));
            }
            grid.push(row);
        }
        return { grid, w: img.width, h: img.height };
    }, [dataUrl, +tx, +ty, W]);
    await browser.close();

    const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
    // 색 빈도 → 문자 배정 (흰/투명 계열은 '.' 로)
    const freq = new Map();
    for (const row of r.grid) for (const c of row) {
        const h = hex(c);
        freq.set(h, (freq.get(h) || 0) + 1);
    }
    const isBg = h => {
        const v = parseInt(h.slice(1), 16);
        const R = v >> 16, G = (v >> 8) & 255, B = v & 255;
        return R > 235 && G > 235 && B > 235;
    };
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const map = new Map();
    let ci = 0;
    for (const [h] of sorted) {
        if (isBg(h)) { map.set(h, '.'); continue; }
        map.set(h, chars[ci++] || '?');
    }
    console.log(`원본 ${path.basename(REF)} 타일 (${tx},${ty}) ${W}px → 32×32 격자`);
    let minX = 99, maxX = -1, minY = 99, maxY = -1;
    r.grid.forEach((row, j) => {
        let s = '';
        row.forEach((c, i) => {
            const ch = map.get(hex(c));
            s += ch;
            if (ch !== '.') { if (i < minX) minX = i; if (i > maxX) maxX = i; if (j < minY) minY = j; if (j > maxY) maxY = j; }
        });
        console.log(String(j).padStart(2) + ' ' + s);
    });
    console.log('\n팔레트(빈도순):');
    sorted.slice(0, 24).forEach(([h, n]) => console.log(`  ${map.get(h)} ${h} ×${n}`));
    console.log(`\n실루엣 bbox: x ${minX}..${maxX} (${maxX - minX + 1}칸, ${((maxX - minX + 1) / 32 * 100).toFixed(1)}%) · y ${minY}..${maxY} (${maxY - minY + 1}칸, ${((maxY - minY + 1) / 32 * 100).toFixed(1)}%)`);
})();
