// 펫 화면(shot-042356) 요소 실측 — '전 UI 비율 전수 검증 패스'의 미실측 화면 중 밴드 3.3.
//
// probe-tn-dom.js 와 같은 규약: **원본 PNG 스캔과 클론 DOM 실측을 한 런에서** 한다.
// 원본 실측 크기 490×882 (화면마다 다르다 — 042605 는 491×881, 042905 는 481×874).
//
// 상태 정합이 먼저다: shot-pets.js 의 PETS_STATE_SRC 로 원본과 같은 보유 수(펫3+알7·부화3칸)를 맞춘다.
// 안 맞추면 그리드 행 수가 달라 그 아래 요소가 전부 밀린 채 '레이아웃 불일치'로 잡힌다.
//
// 재는 요소: 타일 그리드(첫 타일 좌/폭, 열 피치, 1·2행 상단, 행 피치) · 장착됨 행(좌/폭/상/높이) ·
//            소환 버튼(좌/폭/상/높이) · 부화장 패널(상/높이) · 서브탭 바(상/높이) · 하단 탭바 상단
//
// 사용: node tools/probe-pets-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const SC = require('./shot-screens-seed.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 042445(pets-2)는 042356 과 **같은 화면·같은 상태**를 조금 다른 크기(490×876)로 찍은 컷이다 —
// REF=042445 로 같은 프로브를 돌려 교차검증한다(한쪽만 맞는 우연을 거른다).
const REF_ID = process.env.REF || '042356';
const REF_PNG = path.resolve(__dirname, `../ref/screens/shot-${REF_ID}.png`);
const TOL = 2.0;

const SCAN_REF = function (src) {
    return new Promise(async (resolve) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const W = img.width, H = img.height;
        const c = document.createElement('canvas');
        c.width = W; c.height = H;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, W, H).data;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const white = (p) => p[0] > 235 && p[1] > 235 && p[2] > 235;
        const notWhite = (p) => !white(p);

        const runsIn = (y, test, minLen, x0, x1) => {
            const out = []; let r = -1;
            for (let x = x0; x <= x1 + 1; x++) {
                const on = x <= x1 && test(at(x, y));
                if (on && r < 0) r = x;
                if (!on && r >= 0) { if (x - r >= minLen) out.push([r, x - 1]); r = -1; }
            }
            return out;
        };
        const colRuns = (x, test, minLen, y0, y1) => {
            const out = []; let r = -1;
            for (let y = y0; y <= y1 + 1; y++) {
                const on = y <= y1 && test(at(x, y));
                if (on && r < 0) r = y;
                if (!on && r >= 0) { if (y - r >= minLen) out.push([r, y - 1]); r = -1; }
            }
            return out;
        };

        // 앱 폭 — 맨 아래 행의 '여백 아닌' 최장 구간
        const yBot = H - 3;
        const bg = at(1, yBot);
        const sameBg = (p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) < 24;
        let appL = 0, appR = W - 1, best = 0, run = -1;
        for (let x = 0; x <= W; x++) {
            const isApp = x < W && !sameBg(at(x, yBot));
            if (isApp && run < 0) run = x;
            if (!isApp && run >= 0) { if (x - run > best) { best = x - run; appL = run; appR = x - 1; } run = -1; }
        }
        if (best < W * 0.5) { appL = 0; appR = W - 1; }
        const AW = appR - appL + 1;


        // ── 아래쪽 큰 판 3장(부화장 · 서브탭 바 · 하단 탭바)
        // 🚨 '해당 색 화소가 행의 55% 이상'식 판정은 이 화면에서 안 먹힌다 — 부화장 안의 램프 원뿔(노랑)·
        //    알·흰 글자가 남색 비율을 떨어뜨려 패널이 [581,662] 로 잘리고(실제 ~565~730),
        //    서브탭/탭바 경계도 통째로 어긋났다. **행 평균 밝기**로 판을 나누는 편이 안정적이다.
        const mean = [];
        for (let y = 0; y < H; y++) {
            let r = 0, g = 0, b = 0;
            for (let x = appL; x <= appR; x++) { const p = at(x, y); r += p[0]; g += p[1]; b += p[2]; }
            mean.push([r / AW, g / AW, b / AW]);
        }
        const lum = (y) => (mean[y][0] + mean[y][1] + mean[y][2]) / 3;
        // ① 탭바 = 맨 아래에서 이어지는 가장 어두운 판.
        let tb1 = H - 1; while (tb1 > 0 && lum(tb1) < 70) tb1--;
        const tabbar = [tb1 + 1, H - 1];
        // ② 서브탭 바 = 밝은 회색 판 · ③ 부화장 = 그 위의 어두운 판.
        // 🚨 두 번 실패한 자리다: ⓐ '아래에서 위로 조건이 깨질 때까지 걷기'는 탭바 바로 위 검은 구분선
        //    한 줄에 걸려 즉시 멈췄고(부화장 4행·서브탭 null), ⓑ '푸른 판'으로 가르려 했더니
        //    **서브탭의 파란 활성 탭('펫')** 이 걸려 부화장이 [751,785] 로 잡혔다.
        //    한 줄짜리 예외에 안 흔들리게 **구간 중 가장 긴 것**을 고른다.
        const longestRun = (test, y0, y1) => {
            let s = -1, best = null;
            for (let y = y0; y <= y1; y++) {
                const on = y < y1 && test(y);
                if (on && s < 0) s = y;
                if (!on && s >= 0) { if (!best || y - s > best[1] - best[0] + 1) best = [s, y - 1]; s = -1; }
            }
            return best;
        };
        const grayRun = longestRun((y) => lum(y) >= 120 && lum(y) < 235, Math.round(H * 0.7), tabbar[0]);
        const hatch = longestRun((y) => lum(y) < 120, Math.round(H * 0.45), grayRun ? grayRun[0] : tabbar[0]);
        // 🚨 서브탭 바는 '밝은 회색 구간' 그대로 쓰면 안 된다 — 판 위쪽 여백(17행)만 밝고
        //    **탭 pill 이 놓인 아래쪽(48행)은 어두워** 높이가 1.93%H(실제 7.37%H)로 나온다.
        //    부화장 끝과 탭바 시작 사이 전부가 서브탭 바다.
        const subtab = hatch ? [hatch[1] + 1, tabbar[0] - 1] : grayRun;

        // ── 위쪽 흰 영역의 '내용 밴드' — notWhite 가 조금이라도 이어지는 행 대역들
        const top = hatch ? hatch[0] - 1 : Math.round(H * 0.6);
        const content = [];
        {
            let s = -1;
            for (let y = 0; y <= top; y++) {
                const on = runsIn(y, notWhite, 12, appL, appR).length > 0;
                if (on && s < 0) s = y;
                if (!on && s >= 0) { if (y - s >= 6) content.push([s, y - 1]); s = -1; }
            }
            if (s >= 0) content.push([s, top]);
        }
        // 각 밴드의 중앙 행에서 덩어리(=요소) 목록
        const chunksOf = (band, minLen) => {
            const yMid = Math.round((band[0] + band[1]) / 2);
            return runsIn(yMid, notWhite, minLen, appL, appR);
        };
        const detail = content.map(b => ({ band: b, chunks: chunksOf(b, Math.round(AW * 0.03)) }));
        // 타일 열은 **밴드 중앙 행의 가로 구간**으로 재면 안 된다 — 그 행이 타일 안의 흰 'Lv.61' 글자를
        //    지나가서 타일 하나가 조각 여럿으로 쪼개진다(타일 5장인데 덩어리 8개 · 폭 3.27%W = 실제의 1/4).
        //    밴드 안에서 **열마다 notWhite 행 수**를 세면 타일 기둥과 흰 거터가 깨끗하게 갈린다.
        const colsOfBand = (band) => {
            const hgt = band[1] - band[0] + 1;
            const on = [];
            for (let x = appL; x <= appR; x++) {
                let n = 0;
                for (let y = band[0]; y <= band[1]; y++) if (notWhite(at(x, y))) n++;
                on.push(n > hgt * 0.3);
            }
            const out = []; let r = -1;
            for (let i = 0; i <= on.length; i++) {
                const v = i < on.length && on[i];
                if (v && r < 0) r = i;
                if (!v && r >= 0) { if (i - r >= AW * 0.05) out.push([appL + r, appL + i - 1]); r = -1; }
            }
            return out;
        };
        // 타일 행 = 덩어리 3개 이상. 🚨 '5열이니 4개 이상'으로 잡으면 안 된다 — 원본 2행은 알 **3개**뿐이라
        //    통째로 빠졌다(타일 행 1개로 잡혀 행 피치를 못 냈다).
        const tileRows = detail.filter(x => x.chunks.length >= 3).map(x => ({ ...x, cols: colsOfBand(x.band) }));
        const lastTile = tileRows.length ? tileRows[tileRows.length - 1].band[1] : 0;
        // 밴드의 좌우 끝 — 🚨 최장 연속 덩어리로 재면 안 된다: '장착됨' 판은 안의 **흰 라벨 pill 이
        //    덩어리를 쪼개** 판 전체(71%AW)가 아니라 조각만 잡힌다. min~max 로 판 전폭을 쓴다.
        const extent = (band, x0, x1) => {
            let l = 1e9, r = -1;
            for (let y = band[0]; y <= band[1]; y++) {
                for (let x = x0; x <= x1; x++) if (notWhite(at(x, y))) { if (x < l) l = x; if (x > r) r = x; }
            }
            return r < 0 ? null : { l, r, w: r - l + 1 };
        };
        // 세로 범위는 요소의 **왼쪽 테두리 근처 열**에서 잰다 — 🚨 가운데 열로 재면 안의 흰 글자·
        //    밝은 하이라이트에서 끊겨 소환 버튼이 39px(실제 ~60px)로 잡혔다. 검정 키라인은 안 끊긴다.
        const vext = (xLeft, band) => {
            const cr = colRuns(xLeft + 4, notWhite, 8, Math.max(0, band[0] - 30), Math.min(H - 1, band[1] + 30))
                .sort((p, q) => (q[1] - q[0]) - (p[1] - p[0]))[0];
            return cr ? { top: cr[0], bot: cr[1] } : { top: band[0], bot: band[1] };
        };
        // 그리드 아래 밴드: [장착됨 행] → [소환 바] 순서
        const below = detail.filter(x => x.band[0] > lastTile && (!hatch || x.band[1] < hatch[0]));
        const equipped = below[0] || null, summonBand = below[1] || null;
        let equipBox = null, summonBtn = null;
        if (equipped) {
            const e = extent(equipped.band, appL, appR);
            if (e) equipBox = { ...e, ...vext(e.l, equipped.band) };
        }
        if (summonBand) {
            // 소환 바는 [x1 pill][소환 버튼][ⓘ·Lv·게이지] 3덩어리다 — 버튼은 그중 가장 넓은 것.
            const w = summonBand.chunks.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
            if (w) summonBtn = { l: w[0], r: w[1], w: w[1] - w[0] + 1, ...vext(w[0], summonBand.band) };
        }

        resolve({
            W, H, appL, appR, AW,
            hatch, subtab, tabbar,
            content, detail: detail.map(x => ({ band: x.band, n: x.chunks.length, chunks: x.chunks.slice(0, 6) })),
            tileRows: tileRows.map(x => ({ band: x.band, chunks: x.chunks, cols: x.cols })),
            equipBox, summonBtn,
            // 🚨 컷마다 **앱이 이미지 중심에 있지 않다**: 소환 버튼은 원본에서 정확히 앱 중앙인데
            //    042356 은 중심 245(=490/2, 어긋남 0)인 반면 042445 는 239 로 6px 왼쪽이다.
            //    보정하지 않으면 042445 의 모든 가로 수치가 −1.2%p 씩 통째로 밀려 가짜 FAIL 이 난다.
            xOff: summonBtn ? ((summonBtn.l + summonBtn.r) / 2) - (appL + AW / 2) : 0,
            summonChunks: summonBand ? colsOfBand(summonBand.band) : [],
        });
    });
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const refDim = { '042356': [490, 882], '042445': [490, 876] }[REF_ID] || [490, 882];
    const page = await browser.newPage({ viewport: { width: refDim[0], height: refDim[1] }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    const refSrc = 'data:image/png;base64,' + fs.readFileSync(REF_PNG).toString('base64');
    const ref = await page.evaluate(([src, fnSrc]) => (new Function('return ' + fnSrc)())(src), [refSrc, SCAN_REF.toString()]);

    await page.evaluate(PETS_STATE_SRC);
    // 🚨 폰트가 아직 안 붙은 프레임에서 재면 글자 폭이 달라져 **같은 페이지인데 런마다 수치가 바뀐다**
    //    (042356 런과 042445 런에서 x1 pill 45.6→39.5px · 소환 정보 69.3→45.4px 로 갈렸다).
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const clone = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const pick = (sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null);
        const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x - app.x, y: r.y - app.y, w: r.width, h: r.height }; };
        const one = (s) => { const g = pick(s); return g.length ? box(g[0]) : null; };
        return {
            app: { w: app.width, h: app.height },
            tiles: pick('#panel-pets .pet-tile').map(box),
            equipped: one('#panel-pets .equipped-row'),
            summonBtn: one('#panel-pets .summon-btn'),
            x5: one('#panel-pets .summon-bar .x5-toggle'),
            info: one('#panel-pets .summon-info'),
            hatchery: one('#panel-pets .hatchery'),
            subtabs: one('#summon-subtabs'),
            bar: one('#panel-pets .summon-bar'),
            cs: (() => {
                const b = pick('#panel-pets .summon-bar')[0];
                if (!b) return null;
                const kids = [...b.children].map(e => {
                    const c = getComputedStyle(e);
                    return { cls: e.className, pos: c.position, ml: c.marginLeft, mr: c.marginRight, fb: c.flexBasis, w: e.getBoundingClientRect().width };
                });
                const bc = getComputedStyle(b);
                return { kids, disp: bc.display, jc: bc.justifyContent, gap: bc.gap, pad: bc.paddingLeft + '/' + bc.paddingRight };
            })(),
            tabbar: one('#tabbar'),
        };
    });
    await browser.close();

    const AW = ref.AW, AH = ref.H;
    const rw = v => (v / AW) * 100, rh = v => (v / AH) * 100;
    const RX = ref.appL + ref.xOff;   // 원본 x 기준점(크롭 어긋남 보정 포함)
    const cw = v => (v / clone.app.w) * 100, ch = v => (v / clone.app.h) * 100;
    console.log(`원본 shot-${REF_ID} ${ref.W}×${ref.H} · 앱 x ${ref.appL}~${ref.appR}(폭 ${AW})`);
    console.log(`클론 앱 ${clone.app.w.toFixed(1)}×${clone.app.h.toFixed(1)} · 타일 ${clone.tiles.length}개`);
    console.log(`원본 밴드: 부화장 ${JSON.stringify(ref.hatch)} · 서브탭 ${JSON.stringify(ref.subtab)} · 탭바 ${JSON.stringify(ref.tabbar)}`);
    console.log(`원본 내용 밴드: ${JSON.stringify(ref.detail.map(x => [x.band, x.n]))}`);
    console.log(`원본 타일 행: ${JSON.stringify(ref.tileRows.map(x => [x.band, x.cols]))}`);
    console.log(`원본 장착됨 ${JSON.stringify(ref.equipBox)} · 소환버튼 ${JSON.stringify(ref.summonBtn)}`);
    console.log(`원본 소환 바 열: ${JSON.stringify(ref.summonChunks)} · 앱중심 어긋남 ${ref.xOff.toFixed(1)}px`);
    console.log(`클론 소환바 ${JSON.stringify(clone.bar)} · x1 ${JSON.stringify(clone.x5)} · 정보 ${JSON.stringify(clone.info)}`);
    console.log(`클론 소환바 계산값 ${JSON.stringify(clone.cs)}`);

    const bad = [];
    if (!ref.hatch) bad.push('부화장 패널을 못 잡았다');
    if (!ref.tabbar) bad.push('하단 탭바를 못 잡았다');
    if (ref.tileRows.length < 2) bad.push(`타일 행이 ${ref.tileRows.length}개 (원본 2행)`);
    else if (ref.tileRows[0].cols.length < 5) bad.push(`1행 타일 열이 ${ref.tileRows[0].cols.length}개 (원본 5열)`);
    if (!ref.equipBox) bad.push('장착됨 행을 못 잡았다');
    if (!ref.summonBtn) bad.push('소환 버튼을 못 잡았다');
    if (clone.tiles.length !== 10) bad.push(`클론 타일 ${clone.tiles.length}개 (원본 10개) — 상태 정합 실패`);
    if (bad.length) {
        console.log('\n=> 측정기 고장/상태 불일치(exit 2): ' + bad.join(' · '));
        process.exit(2);
    }

    const rows = [];
    const add = (name, refV, cloneV) => rows.push({ name, refV, cloneV, d: cloneV - refV });
    const r1 = ref.tileRows[0], r2 = ref.tileRows[1];
    add('타일 좌', rw(r1.cols[0][0] - RX), cw(clone.tiles[0].x));
    add('타일 폭', rw(r1.cols[0][1] - r1.cols[0][0] + 1), cw(clone.tiles[0].w));
    add('열 피치', rw(r1.cols[1][0] - r1.cols[0][0]), cw(clone.tiles[1].x - clone.tiles[0].x));
    add('1행 상단', rh(r1.band[0]), ch(clone.tiles[0].y));
    add('행 피치', rh(r2.band[0] - r1.band[0]), ch(clone.tiles[5].y - clone.tiles[0].y));
    add('장착됨 좌', rw(ref.equipBox.l - RX), cw(clone.equipped.x));
    add('장착됨 폭', rw(ref.equipBox.w), cw(clone.equipped.w));
    add('장착됨 상단', rh(ref.equipBox.top), ch(clone.equipped.y));
    add('장착됨 높이', rh(ref.equipBox.bot - ref.equipBox.top + 1), ch(clone.equipped.h));
    add('소환버튼 좌', rw(ref.summonBtn.l - RX), cw(clone.summonBtn.x));
    add('소환버튼 폭', rw(ref.summonBtn.w), cw(clone.summonBtn.w));
    add('소환버튼 상단', rh(ref.summonBtn.top), ch(clone.summonBtn.y));
    add('소환버튼 높이', rh(ref.summonBtn.bot - ref.summonBtn.top + 1), ch(clone.summonBtn.h));
    if (ref.summonChunks.length >= 3 && clone.x5 && clone.info) {
        const c = ref.summonChunks.slice().sort((a, b) => a[0] - b[0]);
        add('x1 pill 좌', rw(c[0][0] - RX), cw(clone.x5.x));
        add('x1 pill 폭', rw(c[0][1] - c[0][0] + 1), cw(clone.x5.w));
        add('소환정보 좌', rw(c[2][0] - RX), cw(clone.info.x));
        add('소환정보 폭', rw(c[2][1] - c[2][0] + 1), cw(clone.info.w));
    }
    add('부화장 상단', rh(ref.hatch[0]), ch(clone.hatchery.y));
    add('부화장 높이', rh(ref.hatch[1] - ref.hatch[0] + 1), ch(clone.hatchery.h));
    if (ref.subtab && clone.subtabs) {
        add('서브탭 상단', rh(ref.subtab[0]), ch(clone.subtabs.y));
        add('서브탭 높이', rh(ref.subtab[1] - ref.subtab[0] + 1), ch(clone.subtabs.h));
    }
    if (clone.tabbar) add('탭바 상단', rh(ref.tabbar[0]), ch(clone.tabbar.y));

    console.log('\n요소별 대조 (원본 → 클론, Δ%p · 기준 ±2.0%p):');
    let fails = 0;
    for (const r of rows) {
        if (!Number.isFinite(r.cloneV) || !Number.isFinite(r.refV)) { console.log(`  ${r.name.padEnd(12)} 측정 실패`); fails++; continue; }
        const ok = Math.abs(r.d) <= TOL;
        if (!ok) fails++;
        console.log(`  ${r.name.padEnd(12)} 원본 ${r.refV.toFixed(2).padStart(6)}  클론 ${r.cloneV.toFixed(2).padStart(6)}  Δ ${(r.d >= 0 ? '+' : '') + r.d.toFixed(2)}%p  ${ok ? 'OK' : 'FAIL'}`);
    }
    console.log(`\n콘솔/페이지 에러: ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`=> ${fails === 0 && errors.length === 0 ? 'PASS' : `불통과 ${fails}건`}`);
    process.exit(fails === 0 && errors.length === 0 ? 0 : 1);
})();
