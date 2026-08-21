// 바이옴별 프롭 조형 시트 — 사용: node shot-props.js [출력파일]
// `map-props-minecraft` 검수용. `shot-biomes.js` 는 **인게임 화면**이라 프롭이 서로 겹치고 안개에
// 잠겨 조형 자체를 못 본다 — 이 자는 프롭을 **한 기씩 중립 배경에 세워** 실루엣만 보여 준다.
// 각 칸 = 바이옴이 실제로 뽑는 소품(주 소품 2종 · 부 소품 1종 · 지면 장식 1종), 라벨 포함.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || 'props-sheet.png';

// 바이옴 테마 + 그 바이옴에서 뽑아 볼 소품(라벨은 조형 이름으로 — 무엇이 나오는지가 시트의 목적).
const ROWS = [
    { t: { biome: 'forest', sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 }, picks: [['makePine', 1.2], ['makeRoundTree', 1.2], ['makeBoulder', 1.0, false, true], ['bush']] },
    { t: { biome: 'desert', sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b }, picks: [['makeCactus', 1.2], ['makeStrata', 1.2], ['makeBones', 1.2], ['makeDryShrub', 1.4]] },
    { t: { biome: 'rock', sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x8a7c68 }, picks: [['makeRockSpire', 1.2], ['makeSlab', 1.2], ['makeBoulder', 1.0, false, true], ['pebble']] },
    { t: { biome: 'snow', sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, celestial: 'moon' }, picks: [['makePine', 1.2, true], ['makeRoundTree', 1.1], ['makeBoulder', 1.0, true], ['pebble']] },
    { t: { biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, celestial: 'moon' }, picks: [['makeCrystal', 1.1], ['makeRoundTree', 1.1], ['makeBoulder', 1.0, false, true], ['flowers']] },
    { t: { biome: 'lava', sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17 }, picks: [['makeDeadTree', 1.2], ['makeVolcanicRock', 1.2], ['makeRockSpire', 1.1], ['pebble']] },
    { t: { biome: 'marsh', sky: 0x6f8f6a, fog: 0x8aa07a, ground: 0x5d7a3a }, picks: [['makeMushroom', 1.2], ['makeDeadTree', 1.1], ['makeRoundTree', 1.1], ['fern']] },
    { t: { biome: 'bamboo', sky: 0x9ed7e8, fog: 0xbfe3d0, ground: 0x7cae4a }, picks: [['makeBamboo', 1.2], ['makeRoundTree', 1.2], ['makeBoulder', 1.0, false, true], ['flowers']] },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => {
        let s = 0x2ab19f3;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForTimeout(1500);

    const cells = await page.evaluate(async (ROWS) => {
        // 전용 미니 렌더러 — 게임 씬은 안개·후처리가 걸려 조형 검수에 안 맞는다.
        const S = 260;
        const cv = document.createElement('canvas');
        cv.width = S; cv.height = S;
        const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
        R.setPixelRatio(1);
        R.outputEncoding = THREE.sRGBEncoding;
        R.toneMapping = THREE.ACESFilmicToneMapping;
        // ⚠️ 노출·광량을 게임보다 세게 주면 **색이 날아간다** — 첫 판(노출 1.15 · 1.05/1.55)에서
        //    선인장·대나무·바위가 전부 흰 상자로 찍혀 바이옴 색을 검수할 수 없었다.
        R.toneMappingExposure = 0.92;
        const sc = new THREE.Scene();
        sc.background = new THREE.Color(0x20262e);
        sc.add(new THREE.HemisphereLight(0xdfe9f5, 0x4a4a52, 0.62));
        const dl = new THREE.DirectionalLight(0xfff3e0, 1.05);
        dl.position.set(4, 7, 5); sc.add(dl);
        const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
        const out = [];
        for (const row of ROWS) {
            Scene3D.setTheme(row.t);              // 재질 색이 바이옴을 따라가야 시트가 의미가 있다
            await new Promise(r => setTimeout(r, 120));
            for (const p of row.picks) {
                let g;
                if (p[0] === 'bush') g = Scene3D.vxModel(Props.bush(0.5));
                else if (p[0] === 'pebble') g = Scene3D.vxModel(Props.pebble(0.5, Math.random() < 0.5, 'stone'));
                else if (p[0] === 'flowers') g = Scene3D.vxModel(Props.flowers());
                else if (p[0] === 'fern') g = Scene3D.vxModel(Props.fern());
                else g = Scene3D[p[0]](p[1], p[2], p[3]);
                sc.add(g);
                const box = new THREE.Box3().setFromObject(g);
                const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
                const rad = Math.max(sz.x, sz.y, sz.z) * 0.5 || 0.3;
                const dist = rad / Math.tan(Math.PI / 180 * 16) * 1.35;
                cam.position.set(c.x + dist * 0.62, c.y + dist * 0.42, c.z + dist * 0.72);
                cam.lookAt(c);
                cam.updateProjectionMatrix();
                R.render(sc, cam);
                out.push({ biome: row.t.biome, name: p[0].replace('make', ''), url: cv.toDataURL() });
                sc.remove(g);
                g.traverse(m => { if (m.isMesh && m.geometry && !m.userData.sharedGeometry) m.geometry.dispose(); });
            }
        }
        R.dispose();
        return out;
    }, ROWS);

    const sheet = await page.evaluate(async ({ cells, cols }) => {
        const S = 260, PAD = 26;
        const rows = Math.ceil(cells.length / cols);
        const cv = document.createElement('canvas');
        cv.width = S * cols; cv.height = (S + PAD) * rows;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#12161c'; cx.fillRect(0, 0, cv.width, cv.height);
        for (let i = 0; i < cells.length; i++) {
            const im = new Image();
            await new Promise(res => { im.onload = res; im.onerror = res; im.src = cells[i].url; });
            const x = (i % cols) * S, y = ((i / cols) | 0) * (S + PAD);
            cx.drawImage(im, x, y + PAD);
            cx.fillStyle = '#ffe082'; cx.font = 'bold 15px sans-serif';
            cx.fillText(cells[i].biome + ' · ' + cells[i].name, x + 8, y + 18);
        }
        return cv.toDataURL();
    }, { cells, cols: 4 });

    fs.writeFileSync(path.resolve(process.cwd(), OUT), Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(OUT + ' 저장 · 칸 ' + cells.length + ' · 콘솔 에러 ' + errors.length);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    await browser.close();
})();
