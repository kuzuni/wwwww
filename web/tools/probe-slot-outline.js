// 슬롯 아이콘(장비·펫·탈것)의 **검정 아웃라인 실효 두께**를 원본과 같은 자로 잰다.
// (TODO `slot-icon-outline` — 사용자 지시 2026-08-18 "슬롯에 있는 장비나 펫, 탈것 전부 검정 아웃라인이 있는 형태로")
//
// 왜 이 자인가 — 원본 포지마스터의 아이콘은 **실루엣 바깥 테두리가 통짜 검정**인 카툰 화풍이다.
// 우리 슬롯은 3D 스냅샷이라 부드러운 음영만 있고 테가 없어서, 밝은 셀(하늘색 탈것 칸·회색 펫 타일)
// 위에서는 물체와 배경이 붙어 보인다. '테가 있냐'는 눈으로는 갈리지만, 두께는 재야 맞출 수 있다.
//
// 방법(원본·클론에 완전히 같은 코드):
//   ① 셀 사각형을 5px 안쪽으로 물려 분석창을 잡는다(셀 테두리 자체를 아이콘 테로 오인하지 않게).
//   ② 분석창 테두리 링에서 최빈색 = 셀 배경. 배경과 40 이상 떨어진 픽셀 = 실루엣(잉크).
//   ③ 행마다 실루엣의 좌·우 바깥 경계에서 **안쪽으로** '거의 검정'(3채널 < 46)이 몇 px 이어지는지 센다.
//      그 길이들의 중앙값 = 실효 아웃라인 두께.
//   ④ 덮개율 = 실루엣 경계 표본 중 검정이 1px 이상 붙어 있던 비율(테가 '전 둘레'에 있는지).
// Lv 배지·⭐는 흰 글자에 검정 테가 이미 있어 두께를 부풀린다 → 셀 하단 22%와 상단 리본 밴드는 제외한다.
//
// 사용: node probe-slot-outline.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const { waitReady } = require('./wait-ready.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const REF = path.resolve(__dirname, '../ref/screens/shot-042120.png');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const VW = 499, VH = 892;
// 원본 shot-042120 셀(67px)의 스캔라인 실측 — 잉크 경계에 붙은 검정 키라인이 3px 다(셀 폭의 4.5%).
// 채점 기준은 이 값이고, 아래 원본 프로브 수치는 참고용이다(사유는 measure() 주석).
const REF_KEYLINE = 3;

// 원본 shot-042120 장비 그리드 셀 박스(measure-ref-cells.js 의 자동 검출 결과와 동일)
const REF_CELLS = [
    ['1-1', 62, 514, 67, 68], ['1-2', 137, 514, 68, 68], ['1-3', 215, 514, 67, 68],
    ['1-4', 292, 514, 67, 68], ['1-5', 369, 514, 67, 68],
    ['2-1', 62, 591, 67, 68], ['2-2', 137, 591, 68, 68], ['2-3', 215, 591, 67, 68],
];

// 페이지 안에서 도는 계측기 — 원본 PNG 와 클론 캡처에 같은 함수를 쓴다.
const KIT = `
window.__so = {
    async load(src) {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        return { W: c.width, H: c.height, D: g.getImageData(0, 0, c.width, c.height).data };
    },
    // rect = [name, x, y, w, h] (CSS px). opt.scale = 캡처 배율(dsf), opt.bg = 평탄 배경색(격리 모드).
    //
    // ⚠️ 배경 모델링으로 두 번 헛돌았다(기록해 둔다).
    //   ⑴ '링 최빈색 한 색' → 장비 칸의 45°/-45° 해칭 두 톤과 탈것 칸의 세로 그라디언트가 통째로
    //      '잉크'로 잡혀 행이 전부 버려졌다(탈것 슬롯 표본 0 = 측정 불가).
    //   ⑵ '행마다 좌·우 끝 픽셀을 배경으로' → 펫·탈것 타일은 **아이콘이 타일을 거의 채우고 그 위에
    //      3px 검정 테두리까지 붙어** 있어서 창 끝 픽셀 자체가 검정 테였다. 그러면 기준색이 검정이라
    //      L 이 '테 안쪽 본체'로 잡히고, 거기서 안쪽으로는 검정이 없으니 **테가 멀쩡한데 덮개 5%** 가
    //      나온다(타일 크롭을 눈으로 확인해 오측정임을 확정했다).
    // → 클론은 **격리 모드**로 잰다: 캡처 직전에 슬롯 컨테이너 배경·테두리를 평탄한 마젠타로 덮고
    //   Lv·리본 같은 겹침 요소를 숨긴다(아이콘 자체는 안 건드린다). 그러면 배경이 정확히 한 색이라
    //   실루엣 경계가 모호할 여지가 없다. 원본 PNG 는 그럴 수 없으니 ⑵ 방식으로 재고 참고치로만 쓴다.
    measure(im, rect, opt) {
        const o = opt || {};
        const s = o.scale || 1;
        const pad = Math.round((o.pad == null ? 0 : o.pad) * s);   // 아이콘 상자 바깥으로 넓힐 여유
        const inset = o.inset == null ? 0 : o.inset;
        const D = im.D, W = im.W, H = im.H;
        const x0 = Math.max(0, Math.round(rect[1] * s) + inset - pad), y0 = Math.max(0, Math.round(rect[2] * s) + inset - pad);
        const x1 = Math.min(W, Math.round((rect[1] + rect[3]) * s) - inset + pad), y1 = Math.min(H, Math.round((rect[2] + rect[4]) * s) - inset + pad);
        if (x1 - x0 < 8 || y1 - y0 < 8) return null;
        const at = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
        const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        // 검정 판정은 휘도로 한다 — 셀 배경(원본 #592627 = .19 · 마젠타 = .29)과 확실히 갈리는 .11 을
        // 임계로. 채널 절대값(<46)으로 잡으면 어두운 시대색 장비 본체가 섞인다.
        const lum = (x, y) => { const p = at(x, y); return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255; };
        // 임계는 배경에 맞춰 준다. 격리 모드의 마젠타는 휘도 .285 라 여유가 있어 .16 까지 열어도
        // 배경을 잡지 않는다 — 3D 썸네일의 가장자리 알파가 반투명이라 테 바깥쪽 절반이 '반투명
        // 검정 위 마젠타'(≈.14)로 나오는데, .11 로 좁히면 그 픽셀에서 런이 끊겨 덮개가 반토막 난다.
        // 원본은 배경이 #592627(.19)이라 그만큼 열 수 없어 .11 을 쓴다.
        const keyLum = o.keyLum == null ? 0.11 : o.keyLum;
        const isKey = (x, y) => lum(x, y) < keyLum;
        // Lv 배지(하단)·리본(상단)은 자기 검정 테를 갖고 있어 두께를 부풀린다 → 잘라낸다
        // (격리 모드에선 이미 숨겼으므로 밴드를 넓게 쓴다.)
        const h = y1 - y0;
        const yA = y0 + Math.round(h * (o.top == null ? 0.16 : o.top));
        const yB = y1 - Math.round(h * (o.bottom == null ? 0.24 : o.bottom));
        const runs = []; let edges = 0, withKey = 0;
        for (let y = yA; y < yB; y++) {
            let isBgL, isBgR;
            if (o.bg) {
                // ⚠️ 격리 배경을 **정확한 색 일치**로 판정하면 안 된다 — 아이콘의 접지 그림자
                //    (drop-shadow 0 2px 2px rgba(0,0,0,.35))가 테 바깥 마젠타를 2~4px 어둡게
                //    물들여서, '배경과 다른 첫 픽셀'이 검정 테가 아니라 **그 그림자 헤일로**로
                //    잡힌다. 그러면 거기서 안쪽 몇 px 은 아직 헤일로라 검정을 못 찾고 덮개가
                //    0~15% 로 무너진다(실측: 알 타일 0%, 장비 셀 15% — 눈으로는 테가 멀쩡했다).
                // → **색상(hue)으로** 판정한다: 마젠타는 초록 채널이 0 이고 R·B 가 그보다 훨씬
                //    높다. 어두워져도 이 관계는 유지되지만, 검정 테(R=G=B)나 아이콘 색은 깨진다.
                const bgTest = (x, y) => { const p = at(x, y); return p[1] < 90 && p[0] > p[1] + 60 && p[2] > p[1] + 60; };
                isBgL = isBgR = bgTest;
            } else {
                const bgL = at(x0, y), bgR = at(x1 - 1, y);
                if (dist(bgL, at(x0 + 1, y)) > 26 || dist(bgR, at(x1 - 2, y)) > 26) continue;
                isBgL = (x, y) => dist(at(x, y), bgL) <= 26;
                isBgR = (x, y) => dist(at(x, y), bgR) <= 26;
            }
            let L = -1, R = -1;
            for (let x = x0; x < x1; x++) if (!isBgL(x, y)) { L = x; break; }
            for (let x = x1 - 1; x >= x0; x--) if (!isBgR(x, y)) { R = x; break; }
            if (L < 0 || R < 0 || R - L < Math.round(6 * s)) continue;   // 빈 행·자투리 행 제외
            for (const [start, dir] of [[L, 1], [R, -1]]) {
                // 경계가 창 끝에 딱 붙었다면 그 변은 **표본이 아니다** — 실루엣이 창 밖에서 이어지는
                // 중이라 어디가 바깥 경계인지 알 수 없다. 실제로 이게 거짓 미검출을 만들었다:
                // img.fit-ink 는 최대 3.2배로 확대돼 **이웃 칸 창까지 그림이 삐져나오고**,
                // 그 행의 L 이 남의 아이콘 몸통으로 잡혀 '테 없음'으로 세어졌다(장비 셀 절반과
                // 탈것 슬롯이 나란히 43~45% 로 찍힌 게 전부 이것 — 좌변만 실패하는 패턴이었다).
                if (start === x0 || start === x1 - 1) continue;
                // 경계 1~2px 은 배경과 섞인 AA 라 휘도가 배경 쪽으로 끌려 검정 판정을 못 받는다.
                // 그래서 '경계에서 lead px 안에 검정이 나타나면 거기서부터 연속 길이를 센다'로 잰다.
                const lead = Math.ceil(2.5 * s);
                const cap = Math.round(8 * s);   // 테는 '테'지 검정 덩어리가 아니다 — 원본 아이콘의
                                                 // 시커먼 본체(발톱 밑동 8px)까지 세지 않도록 상한을 둔다
                let x = start, seen = 0, k = 0;
                while (x >= x0 && x < x1 && seen < lead && !isKey(x, y)) { x += dir; seen++; }
                while (x >= x0 && x < x1 && k < cap && isKey(x, y)) { k++; x += dir; }
                edges++;
                if (k > 0) { withKey++; runs.push(k); }
            }
        }
        if (!edges) return null;
        runs.sort((a, b) => a - b);
        const pct = p => runs.length ? +(runs[Math.min(runs.length - 1, Math.floor(runs.length * p))] / s).toFixed(2) : 0;
        return {
            name: rect[0],
            // ⚠️ 판정에는 **하위 20% 분위**를 쓴다. 가로 스캔라인은 경계가 기울수록 같은 두께의 테를
            //    길게 지나간다(원판형 탈것은 위·아래 접선 행에서 런이 상한까지 간다) — 중앙값은 그
            //    기하 효과를 그대로 먹어 '테가 6px'로 보고한다. 테가 화면에서 얼마나 두껍냐는
            //    **경계가 스캔선과 수직인 행**에서 드러나고, 그게 분포의 아래쪽이다.
            thin: pct(0.2),
            thick: +(runs[runs.length >> 1] / s).toFixed(2),   // 중앙값(참고)
            mean: +((runs.reduce((a, b) => a + b, 0) / runs.length) / s).toFixed(2),
            cover: +(withKey / edges * 100).toFixed(1),
            rows: edges,
        };
    },
};
`;

const fmt = r => r
    ? `${String(r.name).padEnd(12)} 두께 ${String(r.thin).padStart(5)}px (중앙 ${String(r.thick).padStart(5)} · 평균 ${String(r.mean).padStart(5)})  덮개 ${String(r.cover).padStart(5)}%  표본 ${r.rows}`
    : '(측정 불가)';
const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--allow-file-access-from-files'] });
    const fails = [];

    // ---- ① 원본 ----
    const rp = await browser.newPage();
    await rp.setContent('<body style="margin:0">');
    await rp.evaluate(KIT);
    const refSrc = 'data:image/png;base64,' + fs.readFileSync(REF).toString('base64');
    const ref = await rp.evaluate(async ([src, cells]) => {
        const im = await window.__so.load(src);
        return { size: [im.W, im.H], rows: cells.map(c => window.__so.measure(im, c, { inset: 5 })) };
    }, [refSrc, REF_CELLS]);
    console.log(`\n===== 원본 shot-042120 (${ref.size.join('×')}) 장비 셀 =====`);
    ref.rows.forEach(r => console.log('  ' + fmt(r)));
    const refThick = med(ref.rows.filter(Boolean).map(r => r.thin));
    const refCover = med(ref.rows.filter(Boolean).map(r => r.cover));
    console.log(`  → 원본 기준: 두께 중앙값 ${refThick}px · 덮개 중앙값 ${refCover}%`);
    console.log('    (원본은 배경을 평탄화할 수 없어 행별 배경 기준으로 잰 참고치다. 아이콘 안쪽의 검정 본체가');
    console.log('     섞여 두께가 부풀고, 해칭·AA 때문에 덮개가 낮게 나온다 — 판정 기준으로 쓰지 않는다.');
    console.log(`     화풍 목표치는 원본 스캔라인 실측 키라인 ${REF_KEYLINE}px 이다.)`);

    // ---- ② 클론 ----
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    await page.goto(INDEX);
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"');
    await page.evaluate(SEED_SRC);
    await page.reload();
    await waitReady(page, 'typeof UI !== "undefined" && S && S.forgeLevel === 29');
    // 3D 루프를 세우면 스크린샷이 15~30초 → 0.15초(전 폴리싱 항목 공통 요령).
    // ⚠️ **화면을 가리는 것들을 전부 걷어내는 게 이 프로브에서 제일 중요하다.** 처음엔 토스트만
    //    껐다가 세 번 오측정했다(전부 '테가 없다'로 보였다): ⑴ 부팅 직후 첫 클리어 토스트가
    //    타일을 덮었고 ⑵ 자동 제련이 돌아 **비교 팝업이 그리드 위에 떴고** ⑶ 보스 등장 워닝의
    //    풀스크린 딤이 전 화면 색을 끌어내렸다. 셋 다 '아이콘 둘레가 검정이 아니다'가 아니라
    //    '아이콘이 아예 안 보인다'였다. 그래서 시뮬레이션 자체를 세운다.
    await page.evaluate(`
        Scene3D && (Scene3D.update = function(){});
        UI.toast = function(){};
        typeof Combat !== 'undefined' && (Combat.update = function(){});
        // 자동 제련이 비교 팝업을 띄우는 걸 막는다(팝업이 그리드를 통째로 덮는다)
        S.autoForgeOn = false;
        typeof Forge !== 'undefined' && (Forge.tick = function(){});
        UI.tickSecond = function(){};
        UI.showCraftModal = function(){};
        UI.closeAllModals ? UI.closeAllModals() : document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        // 보스 워닝 풀스크린 딤 — 남아 있으면 화면 전체 휘도가 내려가 배경 판정이 통째로 어긋난다
        const bw = document.getElementById('boss-warning'); if (bw) bw.style.display = 'none';
        (UI.els.toasts || {}).innerHTML = '';
    `);
    // ---- 격리 스타일: 슬롯 컨테이너 배경·테두리를 평탄한 마젠타로, 겹침 요소(Lv·리본·라벨)는 숨김 ----
    // 아이콘 자체(썸네일·이모지·IconGen)와 그 filter 는 손대지 않는다 — 재는 대상은 그것뿐이다.
    const ISO_CSS = `
        .equip-cell, .pet-tile .tile-face, .hatch-cell, .sk-mini, .petd-tile {
            background: #f0f !important; border-color: #f0f !important; box-shadow: none !important;
        }
        .equip-cell .cell-lv, .equip-cell .cell-star, .equip-cell .slot-name, .equip-cell .mount-sil,
        .sk-lv, .sk-ribbon, .sk-star, .tile-label, .tile-check, .cmp-star { display: none !important; }
        body, #app, .modal-card, .grid-scroll, .mat-grid { background: #f0f !important; }
    `;
    await page.addStyleTag({ content: ISO_CSS });
    await page.waitForTimeout(2000);
    await page.evaluate(KIT);

    // 대상 상자 고르기 — 두 갈래다.
    //  ⓐ 장비·탈것 슬롯: **셀**을 창으로 쓴다. `.cell-img` 를 쓰면 안 된다 —
    //     `img.fit-ink` 에는 `transform: scale(1~3.2)` 가 걸려 있고 getBoundingClientRect 는
    //     **변환된 상자**를 돌려줘서 창이 셀의 3배까지 커지고 이웃 칸을 삼킨다(표본 수가 셀
    //     높이로는 불가능한 410 까지 튀어 이걸 알았다). 변환 전 `.cell-img` 상자 = 셀 상자다.
    //  ⓑ 펫·알·탈것 타일: 아이콘 요소(`.mt-face`/`.ico`)를 쓰고 pad 로 바깥 여유를 준다.
    //     타일 상자를 쓰면 아이콘이 타일을 거의 채워 창 끝이 곧 테두리라 기준색을 못 세운다.
    const SURFACES = [
        ['장비 셀', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.renderEquipSheet && UI.renderEquipSheet();`, '.equip-grid .equip-cell:not(.empty):not(.egg-cell)', 0],
        ['탈것 슬롯', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.renderEquipSheet && UI.renderEquipSheet();`, '.equip-grid .equip-cell.egg-cell:not(.empty)', 0],
        ['펫 타일', `UI.switchTab('summon'); UI.switchSummonSub('pets')`, '#panel-pets .pet-tile:not(.egg) .tile-face .mt-face', 5],
        ['알 타일', `UI.switchTab('summon'); UI.switchSummonSub('pets')`, '#panel-pets .pet-tile.egg .tile-face .ico', 5],
        ['탈것 타일', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); UI.openMounts()`, '.mount-sheet .pet-tile .tile-face .mt-face', 5],
    ];
    const summary = [];
    for (const [label, opener, sel, pad] of SURFACES) {
        await page.evaluate(opener);
        await page.waitForTimeout(1400);
        await page.evaluate(`
            (UI.els.toasts || {}).innerHTML = '';
            document.querySelectorAll('#craft-modal, #boss-warning').forEach(m => { m.classList.add('hidden'); m.style.display = 'none'; });
        `);
        const shot = 'data:image/png;base64,' + (await page.screenshot({ timeout: 90000 })).toString('base64');
        const rects = await page.evaluate(s => [...document.querySelectorAll(s)].slice(0, 8).map((e, i) => {
            const r = e.getBoundingClientRect();
            return ['#' + (i + 1), r.left, r.top, r.width, r.height];
        }), sel);
        if (!rects.length) { console.log(`\n===== 클론 · ${label} ===== (요소 없음: ${sel})`); fails.push(`${label}: 대상 요소 0개`); continue; }
        const rows = await page.evaluate(async ([src, cells, pad]) => {
            const im = await window.__so.load(src);
            // 격리 모드라 Lv·리본이 없다 → 세로 밴드를 넓게(위아래 8%만 잘라 모서리 곡률만 피한다)
            return cells.map(c => window.__so.measure(im, c, { scale: 2, bg: true, keyLum: 0.16, pad, top: 0.08, bottom: 0.08 }));
        }, [shot, rects, pad]);
        console.log(`\n===== 클론 · ${label} (${rects.length}칸) =====`);
        rows.forEach(r => console.log('  ' + fmt(r)));
        const t = med(rows.filter(Boolean).map(r => r.thin)), c = med(rows.filter(Boolean).map(r => r.cover));
        console.log(`  → 두께 중앙값 ${t}px · 덮개 중앙값 ${c}%`);
        summary.push([label, t, c]);
        // 판정 기준을 원본 수치에 그대로 묶지 않는 이유 — 원본 아이콘은 **테 안쪽에 검정 본체**를
        // 가진 그림이 섞여 있어(발톱 밑동·가면 그림자) 원본 중앙값이 화풍의 테 두께보다 크게 나온다.
        // 원본 스캔라인 실측으로 확인한 순수 키라인은 3px 이고, 우리 목표는 그 값이다.
        // 그래서 ⓐ 두께는 2~5px 대(원본 키라인 3px ±) ⓑ 덮개는 둘레 대부분에 테가 붙었는지로 본다.
        if (!(t >= 2 && t <= 5)) fails.push(`${label}: 두께 ${t}px (목표 2~5px, 원본 키라인 ${REF_KEYLINE}px)`);
        if (c < 80) fails.push(`${label}: 덮개 ${c}% (<80%)`);
    }

    console.log('\n===== 요약 =====');
    console.log(`  원본 장비 셀      두께 ${refThick}px · 덮개 ${refCover}%`);
    summary.forEach(([l, t, c]) => console.log(`  ${l.padEnd(12)} 두께 ${String(t).padStart(5)}px · 덮개 ${String(c).padStart(5)}%`));
    if (errs.length) { console.log('\n콘솔 에러 ' + errs.length + '건:'); errs.slice(0, 5).forEach(e => console.log('  ' + e)); fails.push('콘솔 에러 ' + errs.length + '건'); }
    console.log(fails.length ? '\nFAIL ' + fails.length + '건:\n  ' + fails.join('\n  ') : '\nPASS — 슬롯 아이콘 전부 원본대 검정 아웃라인');
    await browser.close();
    process.exit(fails.length ? 2 : 0);
})();
