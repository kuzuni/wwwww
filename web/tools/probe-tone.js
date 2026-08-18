// 원본 스크린샷의 표면 색을 좌표로 뽑는 범용 도구 — AAA 스킨 패스 ② 용.
// 회색 톤을 눈대중으로 정하면 매번 틀린다(인계 메모의 '명암 오독' 7회 + 이 세션 1회). 픽셀을 직접 본다.
//
// 사용:
//   node tools/probe-tone.js <shotId> p:<x>,<y> [p:<x>,<y> …]        점 색
//   node tools/probe-tone.js <shotId> col:<x>,<y0>,<y1>              세로 단면(색 바뀌는 지점만)
//   node tools/probe-tone.js <shotId> row:<y>,<x0>,<x1>              가로 단면
// 예: node tools/probe-tone.js 042705 p:100,385 col:150,350,430
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const [shotId, ...specs] = process.argv.slice(2);
if (!shotId || !specs.length) { console.error('사용: node tools/probe-tone.js <shotId> p:x,y | col:x,y0,y1 | row:y,x0,x1'); process.exit(2); }
// shotId 대신 파일 경로를 줘도 된다 — 클론 캡처(tools/ref-cmp/clone/*.png)를 같은 방식으로 재려면 필요하다.
const REF_PNG = shotId.includes('/') || shotId.endsWith('.png')
    ? path.resolve(process.cwd(), shotId)
    : path.resolve(__dirname, `../ref/screens/shot-${shotId}.png`);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    await page.setContent('<canvas id=c></canvas>');
    const out = await page.evaluate(async ([src, specs]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.getElementById('c');
        c.width = img.width; c.height = img.height;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, c.width, c.height).data;
        const hex = (px, py) => {
            if (px < 0 || py < 0 || px >= c.width || py >= c.height) return 'OOB';
            const i = (py * c.width + px) * 4;
            return '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
        };
        const res = [];
        for (const s of specs) {
            const [kind, argstr] = s.split(':');
            const a = argstr.split(',').map(Number);
            if (kind === 'p') res.push([`점 (${a[0]},${a[1]})`, hex(a[0], a[1])]);
            else if (kind === 'col') {
                const seg = []; let prev = null;
                for (let y = a[1]; y <= a[2]; y++) { const h = hex(a[0], y); if (h !== prev) { seg.push(`y=${y} ${h}`); prev = h; } }
                res.push([`세로 x=${a[0]} y ${a[1]}~${a[2]}`, seg.join('  ')]);
            } else if (kind === 'row') {
                const seg = []; let prev = null;
                for (let x = a[1]; x <= a[2]; x++) { const h = hex(x, a[0]); if (h !== prev) { seg.push(`x=${x} ${h}`); prev = h; } }
                res.push([`가로 y=${a[0]} x ${a[1]}~${a[2]}`, seg.join('  ')]);
            }
        }
        return { size: [c.width, c.height], res };
    }, ['data:image/png;base64,' + fs.readFileSync(REF_PNG).toString('base64'), specs]);
    await browser.close();
    console.log(`${shotId} ${out.size.join('×')}`);
    for (const [n, v] of out.res) console.log(`  ${n}\n    ${v}`);
})();
