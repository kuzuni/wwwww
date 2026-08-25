// 진단: 후처리 엣지 아웃라인의 **두꺼운 구간이 화면 어디에 있나** — slug: uniform-outline-postfx
//
// `probe-top3-verify` 가 '중앙값 2px 인데 p99 17px·최대 38px' 을 냈다. 어느 대역이 굵은지 모르면
// 원인(지오메트리? 지면? 원경?)을 못 고른다 → 굵은 런(≥5px)의 위치를 화면 격자로 찍는다.
// 굵은 런만 빨강, 얇은 런은 초록으로 칠한 마스크 PNG 도 같이 남긴다.
//
// 사용: NODE_PATH=$(npm root -g) node tools/diag-edge-bands.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    await page.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await waitReady(page, 'typeof Scene3D !== "undefined" && Scene3D.scene && typeof S !== "undefined"');

    const shots = await page.evaluate(() => {
        S.pets = ['Cerberus', 'Griffin', 'Baby Dragon'].map(n => ({ name: n, rarity: 'mythic', level: 1, dupes: 0, stars: 0 }));
        S.activePets = [0, 1, 2];
        Scene3D.refreshPets(); Scene3D.refreshMount(); Scene3D.anims.length = 0;
        const u = Scene3D._compMat.uniforms.edgeMaxZ, z0 = u.value;
        Scene3D.renderFrame();
        const on = Scene3D.renderer.domElement.toDataURL();
        u.value = 0; Scene3D.renderFrame();
        const off = Scene3D.renderer.domElement.toDataURL();
        u.value = z0;
        return { on, off };
    });

    const out = await page.evaluate(async ([onUrl, offUrl]) => {
        const load = u => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = u; });
        const grab = async u => {
            const im = await load(u);
            const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
            const g = c.getContext('2d'); g.drawImage(im, 0, 0);
            return { d: g.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
        };
        const A = await grab(onUrl), B = await grab(offUrl);
        const isEdge = i => (B.d[i] - A.d[i]) + (B.d[i + 1] - A.d[i + 1]) + (B.d[i + 2] - A.d[i + 2]) > 60;

        // 마스크 캔버스 + 굵은 런 위치 수집
        const c = document.createElement('canvas'); c.width = A.W; c.height = A.H;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, A.W, A.H);
        const img = g.getImageData(0, 0, A.W, A.H);
        const fat = [];                       // {x, y, len}
        const GRID = 8;
        const grid = Array.from({ length: GRID }, () => new Array(GRID).fill(0));
        const gridAll = Array.from({ length: GRID }, () => new Array(GRID).fill(0));
        for (let y = 0; y < A.H; y++) {
            let run = 0;
            const flush = (xEnd) => {
                if (!run) return;
                const gx = Math.min(GRID - 1, ((xEnd - run / 2) / A.W * GRID) | 0);
                const gy = Math.min(GRID - 1, (y / A.H * GRID) | 0);
                gridAll[gy][gx]++;
                if (run >= 5) { fat.push({ x: xEnd - run, y, len: run }); grid[gy][gx]++; }
                for (let k = 0; k < run; k++) {
                    const i = (y * A.W + (xEnd - run + k)) * 4;
                    img.data[i] = run >= 5 ? 255 : 0; img.data[i + 1] = run >= 5 ? 0 : 170; img.data[i + 2] = 0; img.data[i + 3] = 255;
                }
                run = 0;
            };
            for (let x = 0; x < A.W; x++) {
                if (isEdge((y * A.W + x) * 4)) run++; else flush(x);
            }
            flush(A.W);
        }
        g.putImageData(img, 0, 0);
        return { mask: c.toDataURL(), fat: fat.slice(0, 40), nFat: fat.length, grid, gridAll, W: A.W, H: A.H };
    }, [shots.on, shots.off]);

    fs.writeFileSync(path.resolve(__dirname, 'edge-bands-mask.png'), Buffer.from(out.mask.split(',')[1], 'base64'));
    fs.writeFileSync(path.resolve(__dirname, 'edge-bands-on.png'), Buffer.from(shots.on.split(',')[1], 'base64'));
    console.log('캔버스 ' + out.W + '×' + out.H + ' / 굵은 런(≥5px) ' + out.nFat + '개');
    console.log('\n굵은 런 밀도 격자 (행=화면 위→아래, 열=좌→우, 8×8):');
    out.grid.forEach((row, r) => {
        const yTop = Math.round(r / 8 * 100), yBot = Math.round((r + 1) / 8 * 100);
        console.log('  y ' + String(yTop).padStart(3) + '~' + String(yBot).padStart(3) + '%  '
            + row.map((v, i) => String(v).padStart(4) + '/' + String(out.gridAll[r][i]).padEnd(4)).join(' '));
    });
    console.log('\n(칸 값 = 굵은런/전체런)');
    console.log('\n가장 굵은 런 상위:');
    out.fat.sort((a, b) => b.len - a.len).slice(0, 12).forEach(f =>
        console.log('  len=' + String(f.len).padStart(3) + 'px  x=' + f.x + ' y=' + f.y
            + '  (화면 ' + (f.x / out.W * 100).toFixed(0) + '%, ' + (f.y / out.H * 100).toFixed(0) + '%)'));
    await browser.close();
})();
