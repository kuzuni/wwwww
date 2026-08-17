// 원본 PNG와 클론 PNG의 '가로 밴드' 경계를 같은 방법으로 잡아 세로 비율(%H)로 비교한다.
// 전 UI 비율 전수 검증 패스(TODO ②)의 계량 도구 — 눈대중 대신 숫자로 어긋난 화면을 고른다.
//
// 방법: 각 행의 평균 RGB를 구하고, 이웃 행과의 색 거리(Δ)가 임계값을 넘는 지점을 경계로 본다.
// 원본은 플랫 2D라 밴드 경계가 뚜렷하고, 클론도 시트/탭바 경계가 뚜렷해 같은 기준이 통한다.
// 3D 뷰포트 안쪽처럼 잡음이 많은 구간은 Δ가 계속 흔들리므로, 연속된 경계는 하나로 뭉친다.
//
// 사용: node probe-bands.js <원본.png> <클론.png> [임계값]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const fs = require('fs');

const rowsOf = async (page, file) => page.evaluate(async (dataUrl) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const rows = [];
    for (let y = 0; y < c.height; y++) {
        let r = 0, g = 0, b = 0;
        for (let px = 0; px < c.width; px++) {
            const i = (y * c.width + px) * 4;
            r += d[i]; g += d[i + 1]; b += d[i + 2];
        }
        rows.push([r / c.width, g / c.width, b / c.width]);
    }
    return { rows, w: c.width, h: c.height };
}, 'data:image/png;base64,' + fs.readFileSync(file).toString('base64'));

// Δ가 임계값을 넘는 행을 경계 후보로 잡고, 8px 안에 붙은 후보는 한 경계로 병합한다.
const bands = (rows, thr) => {
    const marks = [];
    for (let y = 1; y < rows.length; y++) {
        const [a, b, c] = rows[y - 1], [d, e, f] = rows[y];
        const delta = Math.abs(a - d) + Math.abs(b - e) + Math.abs(c - f);
        if (delta > thr) marks.push({ y, delta });
    }
    const merged = [];
    for (const m of marks) {
        const last = merged[merged.length - 1];
        if (last && m.y - last.y <= 8) { if (m.delta > last.delta) { last.y = m.y; last.delta = m.delta; } }
        else merged.push({ ...m });
    }
    return merged;
};

(async () => {
    const [refFile, cloneFile, thrArg] = process.argv.slice(2);
    const thr = Number(thrArg || 60);
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.goto('about:blank');

    for (const [label, file] of [['원본', refFile], ['클론', cloneFile]]) {
        const { rows, w, h } = await rowsOf(page, file);
        const bs = bands(rows, thr);
        console.log(`\n=== ${label} ${file.split('/').pop()} (${w}x${h}) — 경계 ${bs.length}개, 임계 ${thr} ===`);
        console.log(bs.map(b => `${(b.y / h * 100).toFixed(2)}%(Δ${Math.round(b.delta)})`).join('  '));
    }
    await browser.close();
})();
