// summon-bar-back-box-ref 검증 — 소환 바·부화장 좌하단 ◀ 의 **상자 크기·위치**를 원본과 비교한다.
//
// 자[尺] 규약 — 🚨 **양쪽을 같은 기준으로 잰다**(이 저장소의 함정 ①: 한쪽만 부속 포함):
//   · 원본 = 화면 픽셀에서 ◀ 의 **바깥 상자**(밝은 빨강 연결요소 + 그 둘레의 검정 테)를 잰다.
//     빨간 면만 재면 클론의 `getBoundingClientRect`(= 테 포함 보더 박스)와 기준이 어긋난다.
//     탭바의 빨간 ✕ 가 같은 색이라 **연결요소로 분리**해야 한다(통짜 bbox 는 높이가 140px 로 부푼다).
//   · 클론 = 그 버튼의 `getBoundingClientRect`(보더 박스). 검정 테는 `--ol3` border 라 여기 포함된다.
// 비교 단위는 화면 폭·높이 대비 % 이고, 게이트는 이 저장소 공통 **±2%p**.
//
// 사용: node probe-summon-back-box.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const CASES = [
    { label: '스킬 소환 바 ◀', shot: 'shot-042340.png', nav: 'UI.switchTab("summon"); UI.switchSummonSub("skills");', sel: '#panel-summon .summon-bar .back-btn' },
    { label: '펫 부화장 ◀', shot: 'shot-042356.png', nav: 'UI.switchTab("summon"); UI.switchSummonSub("pets");', sel: '#panel-summon .hatch-back' },
];
const GATE = 2.0;

// 원본 PNG 에서 ◀ 바깥 상자를 찾는다: 밝은 빨강 연결요소(가로세로비 1.1~2.2 · 면적 300~2500) 중
// 가장 위에 있는 것 = ◀ (그 아래 덩어리는 탭바 ✕). 찾은 빨간 면을 어두운 테 방향으로 넓힌다.
const findOriginalBox = async (page, b64) => page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const at = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const isRed = ([r, gg, bb]) => r > 150 && gg < 80 && bb < 80;
    // 🚨 테를 '어둡다'로만 좇으면 안 된다 — 부화장 ◀ 는 **남색 패널** 위에 있어서(#1b2038 계열)
    // 배경이 그 조건을 그대로 통과해 테가 사방 8px(상한)로 잡히고 바깥 상자가 47×37 로 부푼다(실측).
    // 그래서 '배경색과 다른가'로 좇는다. 배경은 빨간 덩어리 왼쪽 12px 지점에서 뜬다.
    const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const x1 = Math.round(c.width * 0.22), y0 = Math.round(c.height * 0.55);
    const seen = new Uint8Array(c.width * c.height), comps = [];
    for (let y = y0; y < c.height; y++) for (let x = 0; x < x1; x++) {
        const id = y * c.width + x; if (seen[id] || !isRed(at(x, y))) continue;
        const qx = [x], qy = [y]; seen[id] = 1;
        let bx0 = x, bx1 = x, by0 = y, by1 = y, n = 0;
        while (qx.length) {
            const cx = qx.pop(), cy = qy.pop(); n++;
            if (cx < bx0) bx0 = cx; if (cx > bx1) bx1 = cx; if (cy < by0) by0 = cy; if (cy > by1) by1 = cy;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < y0 || nx >= x1 || ny >= c.height) continue;
                const nid = ny * c.width + nx; if (seen[nid] || !isRed(at(nx, ny))) continue;
                seen[nid] = 1; qx.push(nx); qy.push(ny);
            }
        }
        comps.push({ bx0, by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1, n });
    }
    const k = comps.filter(o => o.n > 200 && o.n < 2500 && o.w / o.h > 1.05 && o.w / o.h < 2.2).sort((a, b) => a.by0 - b.by0)[0];
    if (!k) return { err: '◀ 덩어리를 못 찾았다' };
    // 빨간 면 둘레의 어두운 테를 좌우·상하로 각각 몇 px 인지 세어 바깥 상자를 만든다.
    const midY = k.by0 + Math.floor(k.h / 2), midX = k.bx0 + Math.floor(k.w / 2);
    const bg = at(Math.max(0, k.bx0 - 12), midY);
    const grow = (fromX, fromY, dx, dy) => { let n = 0, x = fromX, y = fromY;
        while (n < 10) { x += dx; y += dy; if (x < 0 || y < 0 || x >= c.width || y >= c.height) break; if (dist(at(x, y), bg) <= 60) break; n++; }
        return n; };
    const L = grow(k.bx0, midY, -1, 0), R = grow(k.bx0 + k.w - 1, midY, 1, 0);
    const T = grow(midX, k.by0, 0, -1), B = grow(midX, k.by0 + k.h - 1, 0, 1);
    return { W: c.width, H: c.height, bg, face: [k.bx0, k.by0, k.w, k.h], ring: [L, R, T, B],
        outer: [k.bx0 - L, k.by0 - T, k.w + L + R, k.h + T + B] };
}, b64);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"', { label: '스크립트 로드' });
    await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });

    const fails = [];
    for (const cs of CASES) {
        const b64 = fs.readFileSync(path.resolve(__dirname, '../ref/screens/' + cs.shot)).toString('base64');
        const o = await findOriginalBox(page, b64);
        if (o.err) { fails.push(`${cs.label}: 원본 ${o.err}`); continue; }

        await page.evaluate((nav) => { try { UI.closeModal && UI.closeModal(); } catch (e) { } new Function(nav)(); }, cs.nav);
        await page.waitForTimeout(500);   // 전환 직후 재면 아직 안 그려진 버튼을 놓친다
        const cl = await page.evaluate((sel) => {
            const el = [...document.querySelectorAll(sel)].find(e => {
                const r = e.getBoundingClientRect(); if (r.width <= 0) return false;
                const h = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                return h && (h === e || e.contains(h));
            });
            if (!el) return null;
            const r = el.getBoundingClientRect(), app = document.getElementById('app').getBoundingClientRect();
            return { x: r.x - app.x, y: r.y - app.y, w: r.width, h: r.height, W: app.width, H: app.height };
        }, cs.sel);
        if (!cl) { fails.push(`${cs.label}: 클론 버튼을 못 찾았다 (${cs.sel})`); continue; }

        const [ox, oy, ow, oh] = o.outer;
        const rows = [
            ['좌', ox / o.W * 100, cl.x / cl.W * 100],
            ['상', oy / o.H * 100, cl.y / cl.H * 100],
            ['폭', ow / o.W * 100, cl.w / cl.W * 100],
            ['높이', oh / o.H * 100, cl.h / cl.H * 100],
        ];
        console.log(`\n${cs.label}  (원본 ${cs.shot} ${o.W}×${o.H} · 빨간면 ${o.face[2]}×${o.face[3]} + 테 좌${o.ring[0]}우${o.ring[1]}상${o.ring[2]}하${o.ring[3]} · 배경 rgb(${o.bg}) → 바깥 ${ow}×${oh})`);
        console.log('  지표   원본%     클론%     Δ%p');
        for (const [name, a, b] of rows) {
            const d = b - a, bad = Math.abs(d) > GATE;
            console.log(`  ${name.padEnd(4)} ${a.toFixed(2).padStart(7)} ${b.toFixed(2).padStart(9)} ${(d >= 0 ? '+' : '') + d.toFixed(2)}  ${bad ? 'FAIL' : 'ok'}`);
            if (bad) fails.push(`${cs.label} ${name}: 원본 ${a.toFixed(2)}% vs 클론 ${b.toFixed(2)}% (Δ${d.toFixed(2)}%p)`);
        }
        const oAR = ow / oh, cAR = cl.w / cl.h;
        console.log(`  가로세로비 원본 ${oAR.toFixed(2)} vs 클론 ${cAR.toFixed(2)}`);
        if (Math.abs(cAR - oAR) / oAR > 0.12) fails.push(`${cs.label} 가로세로비: 원본 ${oAR.toFixed(2)} vs 클론 ${cAR.toFixed(2)} (12% 초과)`);
    }
    if (errors.length) fails.push(`콘솔 에러 ${errors.length}건: ${errors.slice(0, 3).join(' / ')}`);
    await browser.close();

    if (fails.length) { console.log('\nFAIL ' + fails.length + '건'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
    console.log('\nPASS — 전 지표 ±' + GATE + '%p 이내');
})();
