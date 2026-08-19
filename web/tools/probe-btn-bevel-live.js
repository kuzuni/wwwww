// probe-btn-bevel-live.js — 클론의 파랑·빨강 액션 버튼 **아래턱이 실제로 보이는가** (aaa-skin ⓐ)
//
// 왜: R3 비평가 2인이 화면마다 "버튼에 아래턱이 없어 비활성 판때기로 읽힌다"고 짚었다.
//     원본 전수 census(`probe-btn-bevel-ref.js`)로 원본 값이 확정됐다 —
//       파랑  면 rgb(0,93,255) ×57  ·  턱 rgb(0,28,78) ×50
//       빨강  면 rgb(255,16,23)(액션) / rgb(242,25,29)(✕)  ·  턱 rgb(78,5,7) / rgb(74,7,9)
//     클론은 턱을 `--pp-blue-dk #0049c9` / `--pp-red-dk #a51710` 로 줘 **면보다 밝거나 비슷**했다.
//     게다가 `ui-quality-up` 의 파란 유리막이 면 아래쪽을 어둡게 깎아 턱과 붙여 버린다 —
//     그래서 '턱이 있는데 안 보이는' 상태였다(실측: 파랑 면 바닥 L 61.5 vs 턱 L 65.8, **턱이 더 밝다**).
//
// 재는 것: 버튼을 세로로 훑어 **면 마지막 줄**과 **턱 띠**의 명도차를 잰다. 원본 census 값의
//          명도차(파랑 58.3 · 빨강 61.2)의 70% 는 나와야 사람 눈에 '턱'으로 읽힌다.
//          유리막이 있어도 상관없다 — 이 자는 '턱이 면과 갈리는가'만 묻는다.
// ⚠️ 면 **최빈색**과 비교하면 안 된다 — 유리막이 아래를 아무리 깎아도 윗부분 밝은 색이 최빈이라
//    통과해 버린다. 낙차 **바로 위 줄**과 비교해야 '유리막이 턱을 삼켰다'가 잡힌다.
//
// 사용: node tools/probe-btn-bevel-live.js
// 종료: 0 통과 / 1 불통과 / 2 측정 불가(자 고장)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { waitReady } = require('./wait-ready.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 원본 census 값 — `probe-btn-bevel-ref.js` 가 원본 30장 전수에서 뽑았다.
const REF = {
    blue: { face: [0, 93, 255], lip: [0, 28, 78] },
    red:  { face: [255, 16, 23], lip: [78, 5, 7] },
};
const lum = p => .299 * p[0] + .587 * p[1] + .114 * p[2];
const GAP = { blue: lum(REF.blue.face) - lum(REF.blue.lip), red: lum(REF.red.face) - lum(REF.red.lip) };

// 대상 — 화면·선택자·기대 색상. 클론에서 실제로 눌리는 액션 버튼만 고른다.
const TARGETS = [
    { screen: '제작 비교', open: `UI._realShowCraftModal(Object.assign(Forge.rollItem(), { subs: U.rollSubs(2) }))`, sel: '#craft-modal .btn.equip', kind: 'blue' },
    { screen: '제작 비교', open: null, sel: '#craft-modal .btn.sell', kind: 'red' },
    { screen: '펫 상세', open: `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.openPetDetail(0)`, sel: '.petd-btn.primary', kind: 'blue' },
];

const SCAN_SRC = `(async (a) => {
    const img = new Image();
    await new Promise(ok => { img.onload = ok; img.src = a.dataUrl; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, W = c.width;
    const at = (x, y) => { const k = (y * W + x) * 4; return [d[k], d[k+1], d[k+2]]; };
    const L = (p) => .299*p[0] + .587*p[1] + .114*p[2];
    // 🚨 술어로 면과 턱을 가르면 안 된다 — **턱이 면만큼 밝은 것이 바로 이 항목이 재는 결함**이라
    //    밝기 문턱을 쓰면 턱이 면으로 먹히고(실측: 턱 0,73,201 이 면 술어를 통과했다) 자가
    //    '턱 없음'을 낸다. 그래서 색상만 보는 **느슨한** 술어로 기둥(면+턱)을 통째로 잡고,
    //    기둥 안에서 **가장 큰 명도 낙차**를 찾아 그 아래를 턱으로 본다.
    const colored = a.kind === 'blue'
        ? (p) => p[2] > 40 && p[2] - p[0] > 25 && p[2] - p[1] > 12
        : (p) => p[0] > 40 && p[0] - p[1] > 25 && p[0] - p[2] > 25;
    let best = null;
    for (let x = Math.round(a.x + a.w * .06); x < a.x + a.w * .94; x += 3) {
        let y = Math.round(a.y); const bot = Math.round(a.y + a.h + 4);
        while (y < bot) {
            if (!colored(at(x, y))) { y++; continue; }
            const y0 = y; while (y < bot && colored(at(x, y))) y++;
            const len = y - y0;
            if (len >= 14 && (!best || len > best.len)) best = { x, y0, y1: y, len };
        }
    }
    if (!best) return null;
    // 기둥 아래 45% 에서 가장 큰 내림 낙차를 찾는다.
    const from = best.y0 + Math.floor(best.len * .55);
    let cut = -1, drop = 0;
    for (let j = from; j < best.y1 - 1; j++) {
        const dd = L(at(best.x, j)) - L(at(best.x, j + 1));
        if (dd > drop) { drop = dd; cut = j; }
    }
    if (cut < 0) return { x: best.x, len: best.len, faceLast: at(best.x, best.y1 - 1), lip: null, lipN: 0, drop: 0 };
    const faceLast = at(best.x, cut);
    const lipRows = [];
    for (let j = cut + 1; j < best.y1; j++) lipRows.push(at(best.x, j));
    // 턱 대표색 = 낙차 바로 아래 줄들의 최빈색
    const t = new Map();
    for (const p of lipRows) { const k = p.join(','); t.set(k, (t.get(k) || 0) + 1); }
    const lip = lipRows.length ? [...t.entries()].sort((u, v) => v[1] - u[1])[0][0].split(',').map(Number) : null;
    return { x: best.x, len: best.len, faceLast, lip, lipN: lipRows.length, drop: +drop.toFixed(1) };
})`;


(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const flat = await browser.newPage();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined" && UI.els && !!UI.els.equipSheet && typeof Scene3D !== "undefined" && !!Scene3D.scene', { label: '스크립트 로드' });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && S && S.forgeLevel === 29 && UI.els && !!UI.els.equipSheet && typeof Scene3D !== "undefined" && !!Scene3D.scene', { label: '시드 상태 로드' });
    await page.evaluate(() => {
        if (window.Scene3D) Scene3D.update = function () {};
        UI.toast = () => {};
        UI._realShowCraftModal = UI.showCraftModal; UI.showCraftModal = () => {};
        UI.resolvePendingCraft = () => {}; UI.autoSeqStep = () => {}; UI.coinBurst = () => {};
        UI.clearPendingCraft(); UI.renderEquipSheet();
    });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    const rows = [], fails = [];
    for (const t of TARGETS) {
        if (t.open) { await page.evaluate(t.open); await page.waitForTimeout(450); }
        const box = await page.evaluate((sel) => {
            const el = [...document.querySelectorAll(sel)]
                .find(n => { const r = n.getBoundingClientRect(); return r.width > 4 && r.height > 4; });
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
        }, t.sel);
        if (!box) { console.log(`FAIL ${t.screen} ${t.sel} — 버튼을 못 찾았다(측정 불가)`); await browser.close(); process.exit(2); }
        const shot = path.join(os.tmpdir(), 'bbl.png');
        await page.screenshot({ path: shot });
        const r = await flat.evaluate(({ src, a }) => (new Function('return ' + src))()(a),
            { src: SCAN_SRC, a: { dataUrl: 'data:image/png;base64,' + fs.readFileSync(shot).toString('base64'), kind: t.kind, x: box.x, y: box.y, w: box.w, h: box.h } });
        fs.unlinkSync(shot);
        if (!r) { console.log(`FAIL ${t.screen} ${t.sel} — 버튼 면 기둥을 못 잡았다(자 고장 — 색 술어를 볼 것)`); await browser.close(); process.exit(2); }
        const gap = r.lip ? lum(r.faceLast) - lum(r.lip) : null;
        const need = GAP[t.kind] * .7;
        rows.push({ t, r, gap, need });
        console.log(`[${t.screen} ${t.kind}] ${t.sel}`);
        console.log(`    면 마지막 줄 ${r.faceLast.join(',').padEnd(14)} 턱 ${(r.lip ? r.lip.join(',') : '없음').padEnd(14)} 턱 두께 ${r.lipN}px`);
        console.log(`    턱↔면 명도차 ${gap === null ? '—' : gap.toFixed(1)}  (원본 ${GAP[t.kind].toFixed(1)} · 필요 ≥ ${need.toFixed(1)})`);
        if (!r.lip || r.lipN < 2) fails.push(`${t.screen} ${t.kind} — 아래턱 띠가 없다(${r.lipN}px)`);
        else if (gap < need) fails.push(`${t.screen} ${t.kind} — 아래턱이 면과 안 갈린다: 명도차 ${gap.toFixed(1)} < ${need.toFixed(1)}`);
    }
    await browser.close();
    if (errors.length) fails.push(`콘솔 에러 ${errors.length}건: ${errors.slice(0, 2).join(' | ')}`);
    if (fails.length) { console.log('\n판정: 불통과 ' + fails.length + '건'); fails.forEach(f => console.log('  · ' + f)); process.exit(1); }
    console.log('\n판정: 통과 — 파랑·빨강 버튼 아래턱이 원본만큼 면과 갈린다 (콘솔 에러 0)');
    process.exit(0);
})();
