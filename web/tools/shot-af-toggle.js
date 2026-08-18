// 자동 제련 [필터] 토글 — 클론 OFF/ON 을 원본 크롭과 나란히 4배 확대 합성.
// 노브가 트랙 안팎 어디에 서는지는 숫자보다 그림으로 갈라내는 게 빠르다(초승달/두 구슬 판독 문제).
// 출력: web/tools/af-toggle-cmp.png (위=원본 OFF/ON, 아래=클론 OFF/ON, 전부 원본 앱 폭 491 기준으로 정규화)
// 사용: node tools/shot-af-toggle.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = path.resolve(__dirname, 'af-toggle-cmp.png');
const SCREENS = path.resolve(__dirname, '../ref/screens');
// 원본 크롭 상자(이미지 좌표). 043117 은 appL=-2 라 x 를 2 왼쪽으로 잡아 앱 좌표를 맞춘다.
const REF = [
    { file: 'shot-043117.png', label: '원본 OFF', x: 330, y: 341, w: 96, h: 34 },
    { file: 'shot-042950.png', label: '원본 ON', x: 332, y: 328, w: 96, h: 34 },
];
const ZOOM = 4;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"', { label: '스크립트 로드' });

    const shots = {};
    for (const on of [false, true]) {
        await page.evaluate((v) => {
            S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9; S.forgeLevel = 29;
            S.autoForge.filterOn = v; UI.openAutoForge();
        }, on);
        await page.waitForTimeout(350);
        await page.evaluate(() => {
            document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening'));
            document.querySelectorAll('.modal-card').forEach(c => { c.style.animation = 'none'; c.style.transform = 'none'; });
            document.querySelectorAll('.af-toggle .knob').forEach(k => { k.style.transition = 'none'; });
        });
        await page.waitForTimeout(120);
        // 행 전체가 아니라 '글자+토글'만 — 원본 크롭과 같은 구도로 맞춘다(라벨 오른쪽 96px, 앱폭 환산).
        const box = await page.evaluate(() => {
            const app = document.getElementById('app').getBoundingClientRect();
            const t = document.querySelector('.af-toggle').getBoundingClientRect();
            const k = document.querySelector('.af-toggle .knob').getBoundingClientRect();
            const right = Math.max(t.right, k.right);
            const w = 96 / 491 * app.width, h = 34 / 491 * app.width;
            const cy = (t.top + t.bottom) / 2;
            // 원본 크롭은 토글 오른쪽 끝에서 왼쪽으로 (426-330)=96 → 오른쪽 여백 8px(491 기준)
            return { x: right + 8 / 491 * app.width - w, y: cy - h / 2, width: w, height: h };
        });
        shots[on ? 'on' : 'off'] = (await page.screenshot({ clip: box })).toString('base64');
    }

    const refB64 = REF.map(r => ({ ...r, b64: fs.readFileSync(path.join(SCREENS, r.file)).toString('base64') }));
    const png = await page.evaluate(async ([refs, clone, zoom]) => {
        const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
        const cellW = 96 * zoom, cellH = 34 * zoom, pad = 8, lab = 18;
        const c = document.createElement('canvas');
        c.width = pad + (cellW + pad) * 2; c.height = (lab + cellH + pad) * 2 + pad;
        const g = c.getContext('2d');
        g.fillStyle = '#20242c'; g.fillRect(0, 0, c.width, c.height);
        g.imageSmoothingEnabled = false;
        g.font = '13px monospace'; g.textBaseline = 'top';
        const draw = async (src, sx, sy, sw, sh, col, row, label) => {
            const img = await load('data:image/png;base64,' + src);
            const x = pad + col * (cellW + pad), y = pad + row * (lab + cellH + pad);
            g.fillStyle = '#cfd6e4'; g.fillText(label, x, y);
            g.drawImage(img, sx, sy, sw, sh, x, y + lab, cellW, cellH);
            g.strokeStyle = '#4b5costume'; g.strokeStyle = '#4b5566'; g.lineWidth = 1;
            g.strokeRect(x + .5, y + lab + .5, cellW - 1, cellH - 1);
        };
        for (let i = 0; i < refs.length; i++) await draw(refs[i].b64, refs[i].x, refs[i].y, refs[i].w, refs[i].h, i, 0, refs[i].label);
        // 클론 캡처는 dpr3 라 자기 크기 그대로 셀에 맞춰 늘린다(등배율 비교가 목적이 아니라 형상 비교다)
        const co = await load('data:image/png;base64,' + clone.off);
        const cn = await load('data:image/png;base64,' + clone.on);
        await draw(clone.off, 0, 0, co.width, co.height, 0, 1, '클론 OFF');
        await draw(clone.on, 0, 0, cn.width, cn.height, 1, 1, '클론 ON');
        return c.toDataURL('image/png').split(',')[1];
    }, [refB64, shots, ZOOM]);

    fs.writeFileSync(OUT, Buffer.from(png, 'base64'));
    console.log('wrote', OUT);
    await browser.close();
})();
