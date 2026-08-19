// probe-btn-bevel-ref.js — 원본 30장 전수에서 **파랑·빨강 버튼의 면과 아래턱 색**을 census 한다.
//
// 왜: R3 비평가 2인이 화면마다 "버튼에 아래턱이 없어 비활성 판때기로 읽힌다"를 반복했다.
//     소환 버튼(회색)은 원본 대조로 실결함이 확정됐고(`probe-summon-btn-skin`), 남은 것은
//     파랑 CTA·빨강 위험 버튼이다. 그런데 이 저장소는 전역 토큰 `--pp-blue-dk`·`--pp-red-dk`
//     를 **일부러 안 건드려 왔다** — "화면마다 빨강이 다르다"는 이유로 화면별 리터럴을 써 왔고,
//     `.x-btn` 만 '원본 25장 전수 일치'라는 증거가 모여 전역으로 승격됐다.
//     그 승격 조건을 파랑·빨강 아래턱에도 똑같이 걸려면 **전수 census 가 먼저** 있어야 한다.
//     이 도구는 판정기가 아니라 그 근거를 만드는 census 다(그래서 항상 exit 0).
//
// 방법: 원본 PNG 를 세로로 훑어 '파랑(또는 빨강)이 세로로 길게 이어지는 기둥'을 찾고, 그 기둥의
//       ⓐ 최빈색(=면) ⓑ 기둥 바닥에서 검정 테두리를 만나기 전까지의 **더 어두운 띠**(=아래턱)를
//       뽑는다. 기둥마다 한 줄씩 찍는다.
// ⚠️ 색 술어에 채도 조건을 넣는다 — 넣지 않으면 검정 테두리·그림자가 같은 기둥에 붙어
//    '면'이 통째로 어두워진다(이 저장소가 반복해 밟은 '자가 부스러기를 문다' 계열).
// ⚠️ 기둥 최소 길이를 두어 글자 안티에일리어싱·아이콘의 파란 점을 거른다.
//
// 사용: node tools/probe-btn-bevel-ref.js [blue|red]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const DIR = path.resolve(__dirname, '../ref/screens');
const KIND = (process.argv[2] || 'blue').toLowerCase();

const SRC = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
    const at = (x, y) => { const k = (y * W + x) * 4; return [d[k], d[k+1], d[k+2]]; };
    // 면 술어 — 파랑: B 가 R·G 를 크게 앞선다 / 빨강: R 이 G·B 를 크게 앞선다. 둘 다 충분히 밝을 것.
    const isFace = a.kind === 'blue'
        ? (p) => p[2] > 150 && p[2] - p[0] > 90 && p[2] - p[1] > 60
        : (p) => p[0] > 150 && p[0] - p[1] > 90 && p[0] - p[2] > 90;
    // 턱 술어 — 같은 색상인데 어두운 것(면보다 확실히 어둡고, 검정도 아님)
    const isLip = a.kind === 'blue'
        ? (p) => p[2] > 24 && p[2] < 150 && p[2] - p[0] > 20
        : (p) => p[0] > 24 && p[0] < 150 && p[0] - p[1] > 20;

    const out = [];
    for (let x = 4; x < W - 4; x += 7) {          // 7px 간격으로 열을 훑는다
        let y = 0;
        while (y < H) {
            if (!isFace(at(x, y))) { y++; continue; }
            let y0 = y; while (y < H && isFace(at(x, y))) y++;
            const len = y - y0;
            if (len < 18) continue;               // 짧은 기둥 = 글자/아이콘 부스러기
            // 면 최빈색
            const t = new Map();
            for (let j = y0; j < y; j++) { const k = at(x, j).join(','); t.set(k, (t.get(k) || 0) + 1); }
            const top = [...t.entries()].sort((u, v) => v[1] - u[1])[0];
            // 아래턱 — 기둥 바로 밑에서 같은 색상의 어두운 띠
            let lipN = 0, lipC = null;
            const lt = new Map();
            for (let j = y; j < Math.min(H, y + 12); j++) {
                const p = at(x, j);
                if (!isLip(p)) break;
                lipN++; const k = p.join(','); lt.set(k, (lt.get(k) || 0) + 1);
            }
            if (lipN) lipC = [...lt.entries()].sort((u, v) => v[1] - u[1])[0][0];
            out.push({ x, y0, len, face: top[0], facePct: +(100 * top[1] / len).toFixed(0), lip: lipC, lipN });
        }
    }
    return { W, H, cols: out };
})`;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
    const page = await browser.newPage();
    const files = fs.readdirSync(DIR).filter(f => /^shot-\d+\.png$/.test(f)).sort();
    const faceTally = new Map(), lipTally = new Map();
    for (const f of files) {
        const dataUrl = 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, f)).toString('base64');
        const r = await page.evaluate(({ src, a }) => (new Function('return ' + src))()(a), { src: SRC, a: { dataUrl, kind: KIND } });
        // 같은 버튼을 여러 열이 물므로 (면,턱) 쌍으로 접어 버튼 단위로 센다
        const seen = new Map();
        for (const c of r.cols) {
            if (!c.lip || c.lipN < 3 || c.facePct < 80) continue;
            const key = c.face + ' | ' + c.lip + ' | len' + Math.round(c.len / 6);
            if (!seen.has(key)) seen.set(key, 0);
            seen.set(key, seen.get(key) + 1);
        }
        if (!seen.size) continue;
        console.log(`${f} ${r.W}x${r.H}`);
        for (const [k, n] of [...seen.entries()].sort((a, b) => b[1] - a[1])) {
            const [face, lip] = k.split(' | ');
            console.log(`    면 ${face.padEnd(14)} 턱 ${lip.padEnd(14)} (열 ${n})`);
            faceTally.set(face, (faceTally.get(face) || 0) + 1);
            lipTally.set(lip, (lipTally.get(lip) || 0) + 1);
        }
    }
    const fmt = m => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, n]) => `${k}×${n}`).join('  ');
    console.log(`\n[${KIND}] 면 집계 : ${fmt(faceTally)}`);
    console.log(`[${KIND}] 턱 집계 : ${fmt(lipTally)}`);
    await browser.close();
})();
