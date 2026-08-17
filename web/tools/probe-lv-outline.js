// 장비 셀 `Lv. NNN` 글자가 밝은 아이콘 위에서도 읽히는지 — **글자 주변 3px 띠의 어두운 픽셀 비율**로 실측.
//
// 왜 이 자를 쓰나 — 명암비(대비율)는 '글자색 vs 배경색' 한 쌍만 재는데, 여기서 문제는 배경이 칸마다
// 다른 그림(발광 파츠·금속 하이라이트)이라는 점이다. 원본은 글자 **사방에 검정 테**를 둘러 배경이
// 무엇이든 글자 둘레가 어두워지게 만든다. 그래서 '글자 둘레가 실제로 얼마나 어두운가'를 직접 잰다.
//   띠 = 글자 잉크에서 3px 이내이면서 잉크가 아닌 픽셀 · 어두운 픽셀 = 상대휘도 0.18 미만.
//   원본 shot-042120 목표대 = 57~71% (TODO 기록치, 이 스크립트 재현치 평균 59.7%).
//
// ⚠️ '두께 함정'도 같이 잰다 — 테를 두껍게 두르면 비율은 쉽게 100%가 되지만 글자 뒤가 통짜 검은
// 라벨 칩이 돼 원본의 '아이콘 위에 얹힌 글자' 인상이 깨진다(비평가 감점 기록). 그래서 **글자 획
// 사이로 아이콘이 비치는 정도**를 함께 본다: 글자 bbox 안에서 '잉크도 아니고 어둡지도 않은' 픽셀 비율.
//
// 구조 — 위치 찾기(1패스)와 계측(2패스)을 분리한다. 이유는 두 번 데었기 때문:
//   ⑴ 잉크 임계를 '거의 흰색'(mn>186)으로 느슨히 잡으면 **하단 패널 바탕(#e8e4e0)이 통째로 잉크**가 돼
//      글자가 배경 바다에 연결되고 성분 하나가 이미지 전체로 번진다.
//   ⑵ 그렇다고 순백(mn>234)으로 좁히면 **클론의 12px 안티에일리어싱 글자는 심지 몇 px만 남아**
//      글리프 성분이 아예 안 잡힌다(원본은 고해상도 축소본이라 획이 두꺼워 잘 잡힌다).
//   → 위치는 각자 확실한 방법으로 잡고(원본=순백 글리프 성분, 클론=DOM 사각형),
//     계측은 **그 라벨 상자 안에서만** 같은 잣대(느슨한 잉크 임계)로 한다. 상자 안엔 패널이 없다.
//
// 사용: node probe-lv-outline.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF = path.resolve(__dirname, '../ref/screens/shot-042120.png');
const OUT_DIR = path.resolve(__dirname, '../ref');

// 원본과 같은 자로 재려면 캡처 크기도 원본(499×892)에 맞춘다. 나머지는 뷰포트가 바뀌어도
// 테 두께가 셀 대비 유지되는지 보는 교차 확인용.
// 조건 두 갈래로 잰다 — 원본 배경 어두움이 63.5%라 **최악 조건(전부 밝은 아이콘, 배경 3%)과
// 원본 수치를 맞비교하면 안 된다**. 같은 배경대에서 재는 '일반'이 원본과의 정합 판정용이고,
// '최악'은 테가 혼자 얼마나 버티는지 보는 스트레스 시험이다.
const CASES = [
    { vw: 499, vh: 892, forge: 12, label: '일반(초·중기 장비)' },
    { vw: 499, vh: 892, forge: 95, label: '최악(전부 밝은 고레벨 장비)' },
    { vw: 430, vh: 932, forge: 95, label: '최악' },
    { vw: 360, vh: 800, forge: 95, label: '최악' },
    { vw: 412, vh: 915, forge: 95, label: '최악' },
];

// 브라우저 컨텍스트에 심을 공용 계측 코드 (이미지 dataURL + 라벨 상자 목록 → 상자별 지표)
const KIT = `
window.__lv = {
    async load(src) {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        return { W: c.width, H: c.height, D: g.getImageData(0, 0, c.width, c.height).data };
    },
    lum(D, W, x, y) { const i = (y * W + x) * 4; return (0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2]) / 255; },
    // 계측용 잉크 — 라벨 상자 안에서만 쓰므로 패널 바탕 걱정이 없다. 안티에일리어싱 획까지 포함하도록 느슨하게.
    isInk(D, W, x, y) {
        const i = (y * W + x) * 4, r = D[i], gg = D[i + 1], b = D[i + 2];
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        return mn > 205 && mx - mn < 22;
    },
    // 순백 글리프 성분으로 라벨 줄을 찾는다(원본용). 반환 = 라벨 bbox 목록
    findLines(im, win, o) {
        const { W, H, D } = im;
        const w = win.x1 - win.x0 + 1, h = win.y1 - win.y0 + 1;
        const ink = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = ((win.y0 + y) * W + (win.x0 + x)) * 4;
            const mx = Math.max(D[i], D[i + 1], D[i + 2]), mn = Math.min(D[i], D[i + 1], D[i + 2]);
            if (mn > 234 && mx - mn < 14) ink[y * w + x] = 1;
        }
        const lab = new Int32Array(w * h).fill(-1), comps = [];
        for (let s = 0; s < w * h; s++) {
            if (!ink[s] || lab[s] >= 0) continue;
            const id = comps.length, q = [s]; lab[s] = id;
            let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0;
            while (q.length) {
                const p = q.pop(), cx = p % w, cy = (p / w) | 0;
                n++;
                if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
                if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const np = ny * w + nx;
                    if (ink[np] && lab[np] < 0) { lab[np] = id; q.push(np); }
                }
            }
            comps.push({ x0, x1, y0, y1, n });
        }
        const gl = comps.filter(cp => {
            const cw = cp.x1 - cp.x0 + 1, ch = cp.y1 - cp.y0 + 1;
            return ch >= 4 && ch <= o.maxH && cw <= 15 && cp.n <= 190 && cp.n / (cw * ch) > 0.18;
        });
        gl.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
        const used = new Set(), lines = [];
        for (const seed of gl) {
            if (used.has(seed)) continue;
            const cy = (seed.y0 + seed.y1) / 2;
            const mem = gl.filter(cp => !used.has(cp) && Math.abs((cp.y0 + cp.y1) / 2 - cy) <= 4.5).sort((a, b) => a.x0 - b.x0);
            const si = mem.indexOf(seed), run = [seed];
            for (let i = si + 1; i < mem.length; i++) { if (mem[i].x0 - run[run.length - 1].x1 > 10) break; run.push(mem[i]); }
            for (let i = si - 1; i >= 0; i--) { if (run[0].x0 - mem[i].x1 > 10) break; run.unshift(mem[i]); }
            run.forEach(cp => used.add(cp));
            if (run.length < 3) continue;
            const x0 = Math.min(...run.map(c => c.x0)), x1 = Math.max(...run.map(c => c.x1));
            const y0 = Math.min(...run.map(c => c.y0)), y1 = Math.max(...run.map(c => c.y1));
            if (x1 - x0 < o.minW) continue;
            lines.push({ x: win.x0 + x0, y: win.y0 + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
        }
        return lines.sort((a, b) => a.y - b.y || a.x - b.x);
    },
    // 라벨 상자 하나를 계측 — 상자를 4px 넉넉히 잡아 테/헤일로까지 포함시킨다
    measureBox(im, box) {
        const { W, H, D } = im, R = 3, PAD = 4;
        const x0 = Math.max(0, box.x - PAD), x1 = Math.min(W - 1, box.x + box.w - 1 + PAD);
        const y0 = Math.max(0, box.y - PAD), y1 = Math.min(H - 1, box.y + box.h - 1 + PAD);
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const ink = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
            if (this.isInk(D, W, x0 + x, y0 + y)) ink[y * w + x] = 1;
        // ⚠️ 상자 정의를 양쪽에서 맞춘다 — 원본 상자는 **글자 잉크 bbox**(findLines 산출)인데 클론 상자는
        //    DOM 사각형이라 line-height 여백까지 들어 있었다. 그대로 두면 클론만 빈 공간이 40% 더 잡혀
        //    '배경 비침'이 68%로 부풀고 '근검정'이 눌린다(= 없는 차이를 만든다). 잉크 bbox로 좁힌다.
        {
            let bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                if (!ink[y * w + x]) continue;
                if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
                if (y < by0) by0 = y; if (y > by1) by1 = y;
            }
            if (bx1 >= 0) box = { x: x0 + bx0, y: y0 + by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 };
        }
        let band = 0, dark = 0, inside = 0, through = 0, inkN = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (ink[y * w + x]) { inkN++; continue; }
            let near = false;
            for (let dy = -R; dy <= R && !near; dy++) for (let dx = -R; dx <= R; dx++) {
                if (dx * dx + dy * dy > R * R) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                if (ink[ny * w + nx]) { near = true; break; }
            }
            if (!near) continue;
            band++;
            const isDark = this.lum(D, W, x0 + x, y0 + y) < 0.18;
            if (isDark) dark++;
            // 글자 bbox 안쪽(획 사이·자간)에서 어둡지도 않은 = 아이콘이 비치는 픽셀
            const gx = x0 + x, gy = y0 + y;
            if (gx >= box.x && gx < box.x + box.w && gy >= box.y && gy < box.y + box.h) {
                inside++; if (!isDark) through++;
            }
        }
        // 비평가 2명이 독립적으로 같은 자를 들이댔다 — **라벨 상자 안의 근검정 면적**과 **배경 비침**.
        // 이게 '검은 칩' 판정의 실질 기준이라 원본 목표치와 함께 그대로 계측한다(원본 38.9% / 26.8%).
        let boxN = 0, boxBlack = 0, boxSee = 0;
        for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            boxN++;
            const L = this.lum(D, W, x, y);
            if (L < 40 / 255) boxBlack++;
            else if (!this.isInk(D, W, x, y)) boxSee++;   // 잉크도 근검정도 아닌 = 아이콘이 비치는 픽셀
        }
        // 흰 획 두께 — 비평가 2명이 2라운드에서 나란히 짚은 핵심 지표(원본 2.36~2.5px, 클론 1.63~1.7px).
        // 가로 방향 잉크 런의 평균 길이로 잰다. 세로획이 대부분이라 이 값이 곧 획 굵기다.
        // (KIT 전체가 템플릿 문자열이라 이 안에서는 백틱을 쓸 수 없다)
        const runs = [];
        for (let y = 0; y < h; y++) {
            let run = 0;
            for (let x = 0; x <= w; x++) {
                const on = x < w && ink[y * w + x];
                if (on) run++;
                else { if (run > 0 && run <= 8) runs.push(run); run = 0; }   // 8px 초과는 가로획/붙은 덩어리
            }
        }
        const stroke = runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : 0;
        // 검정 테 두께 — 비평가 2명이 원본을 각각 "1px"과 "2.31px"로 읽어 정반대 처방을 냈다.
        // 갈라야 하므로 직접 잰다: **글자 둘레에 붙은 근검정 면적 / 글자 둘레 길이**.
        // (둘레 = 잉크 픽셀 중 4이웃에 비잉크가 있는 것 = 테가 감싸야 할 길이)
        let ringArea = 0, perim = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const p = y * w + x;
            if (ink[p]) {
                if ((x > 0 && !ink[p - 1]) || (x < w - 1 && !ink[p + 1])
                    || (y > 0 && !ink[p - w]) || (y < h - 1 && !ink[p + w])) perim++;
                continue;
            }
            if (this.lum(D, W, x0 + x, y0 + y) >= 40 / 255) continue;
            // 잉크에서 6px 이내의 근검정만 = 테. 셀 배경이 원래 어두운 경우까지 다 세면 안 된다.
            let near = false;
            for (let dy = -6; dy <= 6 && !near; dy++) for (let dx = -6; dx <= 6; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                if (dx * dx + dy * dy <= 36 && ink[ny * w + nx]) { near = true; break; }
            }
            if (near) ringArea++;
        }
        const rim = perim ? ringArea / perim : 0;
        return {
            ink: inkN, band, dark: band ? dark / band : 0, through: inside ? through / inside : 0,
            black: boxN ? boxBlack / boxN : 0, see: boxN ? boxSee / boxN : 0, stroke, rim,
        };
    },
};
`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], report = [];
    const meas = await browser.newPage({ viewport: { width: 800, height: 800 } });
    await meas.goto('about:blank');
    await meas.evaluate(KIT);
    const asData = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

    // --- 원본: 순백 글리프로 라벨 줄을 찾고 같은 잣대로 계측 ---
    // 계측 창은 원본 하단 패널의 2행 장비 그리드 영역(probe-ref-cellicon 실측 격자대)
    const refOut = await meas.evaluate(async ({ src }) => {
        const im = await window.__lv.load(src);
        const lines = window.__lv.findLines(im, { x0: 55, y0: 495, x1: 445, y1: 690 }, { maxH: 15, minW: 22 });
        // 원본은 라벨을 숨길 수 없으니 배경 기여도를 **같은 셀의 라벨 바로 위 같은 크기 띠**로 추정한다
        // (거기도 아이콘 그림이 깔린 자리다). 이게 있어야 '테가 만든 몫'끼리 비교할 수 있다.
        const base = lines.map(b => {
            let n = 0, d = 0;
            const y0 = b.y - 3 - (b.h + 6), y1 = b.y - 4;
            for (let y = y0; y <= y1; y++) for (let x = b.x - 3; x < b.x + b.w + 3; x++) {
                if (x < 0 || y < 0 || x >= im.W || y >= im.H) continue;
                n++; if (window.__lv.lum(im.D, im.W, x, y) < 0.18) d++;
            }
            return n ? d / n : 0;
        });
        return { rows: lines.map(b => ({ box: b, ...window.__lv.measureBox(im, b) })), base };
    }, { src: asData(REF) });
    report.push({ what: '원본 shot-042120 (499×892)', rows: refOut.rows, base: refOut.base, baseNote: '라벨 바로 위 같은 띠(추정)' });

    // --- 클론: 라벨 위치는 DOM에서 그대로 받아온다 ---
    for (const cs of CASES) {
        const w = cs.vw, h = cs.vh;
        const page = await browser.newPage({ viewport: { width: w, height: h } });
        page.on('pageerror', e => errs.push(`${w}x${h}: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${w}x${h}: ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"');
        await page.evaluate((FORGE) => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            Combat.tick = function () {};
            // 최악 조건 재현: 발광·금속 파츠가 많은 고레벨 장비를 전 슬롯에 강제 장착하고
            // Lv 숫자도 원본과 같은 3자리(107)로 맞춘다.
            S.hammers = 1e6; S.forgeLevel = FORGE;
            for (const slot of SLOTS) {
                const it = Forge.rollItem(); it.slot = slot; it.stars = 1; it.level = 107;
                S.equipment[slot] = it;
            }
            Combat.recalcHero(); UI.renderEquipSheet();
        }, cs.forge);
        await page.waitForTimeout(1200);   // 3D 썸네일 생성 대기
        const geo = await page.evaluate(() => {
            const g = document.querySelector('.equip-grid');
            if (!g) return null;
            const r = g.getBoundingClientRect();
            const clip = { x: Math.floor(r.x), y: Math.floor(r.y) - 4, w: Math.ceil(r.width), h: Math.ceil(r.height) + 10 };
            const boxes = [...document.querySelectorAll('.equip-grid .cell-lv')].map(el => {
                // 라벨 요소는 셀 폭 전체(left:0;right:0)라 실제 글자 범위만 Range로 좁힌다
                const rr = document.createRange(); rr.selectNodeContents(el);
                const b = rr.getBoundingClientRect();
                return { x: Math.round(b.x - clip.x), y: Math.round(b.y - clip.y), w: Math.round(b.width), h: Math.round(b.height) };
            }).filter(b => b.w > 8 && b.h > 4);
            return { clip, boxes };
        });
        if (!geo || !geo.boxes.length) { errs.push(`${w}x${h}: .cell-lv 라벨 상자 없음`); await page.close(); continue; }
        const tag = `${w}x${h}-f${cs.forge}`;
        const file = path.join(OUT_DIR, `lvout-${tag}.png`);
        const clip = { x: geo.clip.x, y: geo.clip.y, width: geo.clip.w, height: geo.clip.h };
        await page.screenshot({ path: file, clip });
        // 기준선 — 라벨을 숨긴 같은 화면. 라벨 자리의 **배경(아이콘)이 원래 얼마나 어두운지**를 재
        // '띠 어두움 중 테가 만든 몫'과 '배경이 원래 어두웠던 몫'을 갈라 본다. 이게 없으면 밝은
        // 아이콘을 깐 최악 조건과 원본의 수치를 그냥 맞비교하게 돼 테 두께 판단이 흐려진다.
        const baseFile = path.join(OUT_DIR, `lvout-${tag}-nolabel.png`);
        await page.evaluate(() => {
            const st = document.createElement('style');
            st.textContent = '.equip-cell .cell-lv{visibility:hidden}';
            document.head.appendChild(st);
        });
        await page.waitForTimeout(120);
        await page.screenshot({ path: baseFile, clip });
        await page.close();

        const rows = await meas.evaluate(async ({ src, boxes }) => {
            const im = await window.__lv.load(src);
            return boxes.map(b => ({ box: b, ...window.__lv.measureBox(im, b) }));
        }, { src: asData(file), boxes: geo.boxes });
        // 기준선은 잉크가 없으므로 라벨 상자 전체의 '어두운 픽셀 비율'만 본다
        const base = await meas.evaluate(async ({ src, boxes }) => {
            const im = await window.__lv.load(src);
            return boxes.map(b => {
                let n = 0, d = 0;
                for (let y = b.y - 3; y < b.y + b.h + 3; y++) for (let x = b.x - 3; x < b.x + b.w + 3; x++) {
                    if (x < 0 || y < 0 || x >= im.W || y >= im.H) continue;
                    n++; if (window.__lv.lum(im.D, im.W, x, y) < 0.18) d++;
                }
                return n ? d / n : 0;
            });
        }, { src: asData(baseFile), boxes: geo.boxes });
        report.push({ what: `클론 ${w}×${h} · ${cs.label}`, rows, base });
    }

    const pct = v => (v * 100).toFixed(1) + '%';
    const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    let refAvg = null;
    for (const r of report) {
        const ds = r.rows.map(x => x.dark), ts = r.rows.map(x => x.through);
        console.log(`\n■ ${r.what} — 라벨 ${r.rows.length}개`);
        if (!r.rows.length) { console.log('  (라벨을 못 찾음 — 계측 창/임계값 확인)'); continue; }
        const a = avg(ds);
        if (refAvg === null) refAvg = a;
        console.log(`  띠(3px) 어두움 평균 ${pct(a)}  범위 ${pct(Math.min(...ds))}~${pct(Math.max(...ds))}`
            + (r.what.startsWith('클론') ? `   [원본 대비 ${(a - refAvg >= 0 ? '+' : '') + ((a - refAvg) * 100).toFixed(1)}%p]` : ''));
        console.log(`  글자 사이 투과율 평균 ${pct(avg(ts))}  범위 ${pct(Math.min(...ts))}~${pct(Math.max(...ts))}`);
        console.log(`  라벨 상자 안 근검정 ${pct(avg(r.rows.map(x => x.black)))} (원본 목표 ≤40%)`
            + ` · 배경 비침 ${pct(avg(r.rows.map(x => x.see)))} (원본 목표 ≥25%)`
            + ` · 흰 획 ${avg(r.rows.map(x => x.stroke)).toFixed(2)}px · 검정 테 ${avg(r.rows.map(x => x.rim)).toFixed(2)}px`);
        if (r.base) console.log(`  (기준선) ${r.baseNote || "라벨 숨긴 같은 자리"}의 배경 어두움 평균 ${pct(avg(r.base))}`
            + `  → 띠 어두움 중 테가 만든 몫 약 ${pct(a - avg(r.base))}`);
    }
    console.log('\n판정: 띠 어두움 57~71%(원본대) · 투과율이 0에 가까우면 검은 칩(불합격)');
    console.log(errs.length ? `\n콘솔/페이지 오류 ${errs.length}건:\n  ` + errs.slice(0, 8).join('\n  ') : '\n콘솔 오류 없음');
    await browser.close();
})();
