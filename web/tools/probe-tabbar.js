// 하단 탭바 아이콘을 원본과 **같은 기준으로** 실측한다.
//
// 기준 = 아이콘 그림의 **잉크 바운딩박스**(실제로 칠해진 픽셀), 뷰포트 폭·높이 대비 %.
//   원본(shot-042120, 499×892)은 탭바에 라벨 글자가 없다. 클론은 아이콘 아래 라벨이 있어
//   그대로 재면 라벨까지 잉크로 잡혀 세로가 통째로 부풀어 비교가 무효가 된다 →
//   **클론 캡처 때만 라벨을 visibility:hidden 으로 숨겨** 양쪽을 같은 기준으로 맞춘다.
//   (TODO '함정 ① 한쪽만 부속 포함'이 바로 이 계열의 오측정이다.)
//
// 또 하나: 탭바 **밴드 높이**는 아이콘을 키워도 변해선 안 된다(원본 9.42~9.57%H).
//   아이콘 교체가 라인박스를 밀어 밴드가 커지면 전 화면 세로 비율이 통째로 어긋난다.
//
// 사용: node probe-tabbar.js
// 종료코드 0=PASS / 1=측정 불통과 / 2=측정기 고장(캘리브레이션 실패)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REF = path.resolve(__dirname, '../ref/screens/shot-042120.png');
const VW = 499, VH = 892;
const TABS = ['pvp', 'dungeon', 'summon', 'quest', 'shop', 'debug'];   // 배포 탭바에 보이는 6개
// 2026-08-18 `quest-tab`: 소환과 상점 사이에 퀘스트가 들어와 **보이는 탭이 4→5개**가 됐다.
// 셀 분할 수를 안 고치면 4칸으로 5개를 재면서 이웃 아이콘 2개가 한 칸에 잡혀(실측 24.25%W)
// 멀쩡한 아이콘이 '원본보다 +15%p 크다'로 뜬다 — 첫 실행에서 실제로 그렇게 오검출했다.
// 🚨 2026-08-18 `nav-6th-keep-debug`: 디버그가 기본 노출로 바뀌어 **5→6개**다. 같은 함정이
// 그대로 재발했다(고치기 전 실측: dungeon 19.24%W = 이웃 아이콘 둘이 한 칸에 잡힌 값).
// 그래서 클론 셀 분할 수는 이제 **하드코딩하지 않고 실제 보이는 버튼 수**를 쓴다 — 탭이 또
// 늘거나 줄어도 이 프로브가 멀쩡한 아이콘을 회귀로 오인하지 않는다.
// ⚠️ 원본(shot-042120)은 5칸이고 **디버그 탭이 없다** — 디버그는 대응 원본이 없는 클론 전용
// 칸이라 위치·모양 대조 대상이 아니고, 아래에서 '크기가 같은 급인가'만 본다(퀘스트와 같은 취급).

// 이미지 데이터에서 셀별 잉크 bbox 를 낸다. bg 는 셀 테두리 픽셀의 최빈색으로 잡는다.
// (인자에 쓰지 않는 H 를 두면 호출부에서 한 칸씩 밀려 cells=undefined 가 되고 스캔이 조용히
//  0칸을 돌려준다 — 실제로 한 번 그렇게 오통과했다. 쓰는 인자만 남긴다.)
const SCAN = function (data, W, y0, y1, cells) {
    const at = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const out = [];
    for (let c = 0; c < cells; c++) {
        const cx0 = Math.round((c * W) / cells), cx1 = Math.round(((c + 1) * W) / cells);
        // 배경색 = 셀 네 변 테두리의 최빈색(아이콘은 가운데 있으니 테두리는 거의 배경이다)
        const freq = {};
        for (let x = cx0; x < cx1; x++) { for (const y of [y0, y0 + 1, y1 - 2, y1 - 1]) { const k = at(x, y).join(','); freq[k] = (freq[k] || 0) + 1; } }
        for (let y = y0; y < y1; y++) { for (const x of [cx0, cx0 + 1, cx1 - 2, cx1 - 1]) { const k = at(x, y).join(','); freq[k] = (freq[k] || 0) + 1; } }
        const bg = Object.keys(freq).sort((a, b) => freq[b] - freq[a])[0].split(',').map(Number);
        let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, ink = 0;
        const isInk = (x, y) => {
            const p = at(x, y);
            return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 40;
        };
        for (let y = y0; y < y1; y++) {
            // 셀 폭을 거의 다 채우는 행은 아이콘이 아니라 **구조선**(탭바 border-top, 구분선)이다.
            // 이걸 잉크로 세면 bbox 가 셀 폭 전체로 벌어져(실측 25%W) 비교가 통째로 무효가 된다.
            let rowInk = 0;
            for (let x = cx0; x < cx1; x++) if (isInk(x, y)) rowInk++;
            if (rowInk > (cx1 - cx0) * 0.8) continue;
            for (let x = cx0; x < cx1; x++) {
                if (isInk(x, y)) { ink++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
            }
        }
        out.push(ink ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, ink, bg } : null);
    }
    return out;
};

(async () => {
    const browser = await chromium.launch({
        executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push('console: ' + m.text()); });

    // ---- ① 원본 실측 ----
    await page.setContent('<canvas id=c></canvas>');
    const refShot = 'data:image/png;base64,' + fs.readFileSync(REF).toString('base64');
    const ref = await page.evaluate(async ([src, scanSrc]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.getElementById('c');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, img.width, img.height).data;
        const W = img.width, H = img.height;
        const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        // 탭바 밴드 = 화면 아래에서 위로 올라가며 '행 중앙값이 같은 어두운 색'인 구간
        const rowKey = (y) => { const f = {}; for (let x = 0; x < W; x += 3) { const k = at(x, y).join(','); f[k] = (f[k] || 0) + 1; } return Object.keys(f).sort((a, b) => f[b] - f[a])[0]; };
        let bandBot = H - 1;
        while (bandBot > 0 && rowKey(bandBot) !== rowKey(bandBot - 1)) bandBot--;   // 최하단 이물(시스템 바 등) 건너뛰기
        const key = rowKey(bandBot);
        let b1 = bandBot; while (b1 > 0 && rowKey(b1) === key) b1--;
        let b2 = bandBot; while (b2 < H - 1 && rowKey(b2) === key) b2++;
        const scan = new Function('return ' + scanSrc)();
        return { W, H, band: [b1 + 1, b2], cells: scan(d, W, b1 + 1, b2, 5) };
    }, [refShot, SCAN.toString()]);

    // ---- ② 클론 실측 (라벨 숨김 = 원본과 같은 기준) ----
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"');   // waitForFunction 은 3D 포화 구간에서 기아 타임아웃(wait-ready.js 헤더 ②)
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () { }; if (typeof Combat !== 'undefined') Combat.tick = function () { }; });
    await page.waitForTimeout(500);
    const dom = await page.evaluate(() => {
        const bar = document.getElementById('tabbar');
        const br = bar.getBoundingClientRect();
        const btns = [...bar.querySelectorAll('button')].filter(b => getComputedStyle(b).display !== 'none');
        return {
            band: { y: br.top, h: br.height },
            buttons: btns.map(b => {
                const r = b.getBoundingClientRect();
                const ic = b.querySelector('.ico, .tab-ico');
                const ir = ic ? ic.getBoundingClientRect() : null;
                const lb = b.querySelector('span');
                const lr = lb ? lb.getBoundingClientRect() : null;
                return {
                    tab: b.dataset.tab, x: r.x, y: r.y, w: r.width, h: r.height,
                    icoBox: ir ? { x: ir.x, y: ir.y, w: ir.width, h: ir.height } : null,
                    label: lr ? { y: lr.y, h: lr.height } : null,
                    hasIco: !!ic,
                };
            }),
        };
    });
    // 라벨을 숨기고 탭바만 캡처 → 원본과 동일한 잉크 스캔
    // 🚨 탭바 **칠 층(그라디언트·글로우)도 캡처에서만 끈다** (2026-08-19, ui-quality-up 9차 실측):
    // 스킨의 세로 그라디언트 총 진폭이 잉크 임계(합 40)를 넘으면 셀 최빈색이 상/하단 행 색으로
    // 잡히고, 중간 행 전체가 '잉크'가 돼 구조선 필터(80% 규칙)에 걸려 **아이콘 행까지 통째로
    // 버려진다**(summon 9.82→5.21%W 유령 축소). 이 프로브의 판정 대상은 아이콘 잉크 기하이지
    // 밴드 칠이 아니므로, 라벨 숨김과 같은 '기준 맞추기'다. 밴드 칠 자체의 회귀는 probe-sheet-skin
    // (frame-bands 화면)이 지킨다.
    await page.addStyleTag({ content: '#tabbar button span{visibility:hidden!important} #tabbar{background-image:none!important;box-shadow:none!important} #tabbar button.active{background-image:none!important}' });
    const clipShot = await page.screenshot({ clip: { x: 0, y: dom.band.y, width: VW, height: dom.band.h } });
    const clone = await page.evaluate(async ([src, scanSrc, n]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, img.width, img.height).data;
        const scan = new Function('return ' + scanSrc)();
        // 배포에서 **실제로 보이는 탭 수**로 셀을 나눈다 — 하드코딩하면 탭이 늘 때마다 오검출한다
        return { W: img.width, H: img.height, cells: scan(d, img.width, 0, img.height, n) };
    }, ['data:image/png;base64,' + clipShot.toString('base64'), SCAN.toString(), dom.buttons.length]);

    // ---- ③ 캘리브레이션: 측정기가 정말 '탭바 내용'만 잡는가 ----
    // 버튼을 통째로 숨겨 잉크가 사라지는지 본다. 안 사라지면 스캔이 배경/테두리를 잉크로 잡고 있다.
    // (아이콘만 숨기는 방식은 이모지 상태에서 통하지 않는다 — 컬러 이모지는 color/visibility 를
    //  따로 먹지 않는 경로가 있어 '측정기 고장'이 거짓으로 뜬다.)
    await page.addStyleTag({ content: '#tabbar button{visibility:hidden!important}' });
    const blankShot = await page.screenshot({ clip: { x: 0, y: dom.band.y, width: VW, height: dom.band.h } });
    const blank = await page.evaluate(async ([src, scanSrc, n]) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = src; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, img.width, img.height).data;
        const scan = new Function('return ' + scanSrc)();
        return scan(d, img.width, 0, img.height, n);
    }, ['data:image/png;base64,' + blankShot.toString('base64'), SCAN.toString(), dom.buttons.length]);
    // ---- ④ ✕ 상태 왕복: refreshTabX 가 innerHTML 을 통째로 갈았다 되돌리는 경로 ----
    // 여기서 아이콘이 이모지로 되돌아가면 팝업을 한 번 열고 닫은 뒤부터 탭바가 이모지로 남는다.
    // refreshTabX 는 MutationObserver 로 불리므로 **비동기**다 — 클릭 직후 동기로 읽으면
    // 아직 ✕ 로 안 바뀌어 있어 거짓 FAIL 이 난다(한 번 그렇게 잡혔다). 프레임을 넘겨 확인한다.
    const xTrip = await page.evaluate(async () => {
        const tick = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const btn = () => document.querySelector('#tabbar button[data-tab="dungeon"]');
        const has = () => !!btn().querySelector('.tab-ico');
        const before = has();
        UI.onTabClick('dungeon');                        // 던전 팝업 열기 → 그 탭이 ✕ 로 바뀐다
        await tick();
        const xMark = !!btn().querySelector('.tab-x-mark');
        UI.onTabClick('dungeon');                        // 다시 눌러 닫기 → 아이콘이 돌아와야 한다
        await tick();
        return { before, xMark, after: has(), html: btn().innerHTML.slice(0, 120) };
    });
    await browser.close();

    // ---- 보고 ----
    const pctW = v => (v / VW) * 100, pctH = v => (v / VH) * 100;
    if (!ref.cells || ref.cells.length !== 5 || !clone.cells || clone.cells.length !== dom.buttons.length) {
        console.log(`=> 측정기 고장: 스캔이 칸을 못 냈다(원본 ${ref.cells ? ref.cells.length : 'null'}칸 / 클론 ${clone.cells ? clone.cells.length : 'null'}칸, 버튼 ${dom.buttons.length}개).`);
        process.exit(2);
    }
    console.log(`원본 ${ref.W}×${ref.H} · 탭바 밴드 y ${ref.band[0]}~${ref.band[1]} (h ${ref.band[1] - ref.band[0]}px = ${pctH(ref.band[1] - ref.band[0]).toFixed(2)}%H)`);
    console.log(`클론 ${VW}×${VH} · 탭바 밴드 y ${dom.band.y.toFixed(1)} (h ${dom.band.h.toFixed(1)}px = ${pctH(dom.band.h).toFixed(2)}%H)`);
    const bandD = pctH(dom.band.h) - pctH(ref.band[1] - ref.band[0]);
    console.log(`  밴드 높이 Δ ${bandD >= 0 ? '+' : ''}${bandD.toFixed(2)}%p  ${Math.abs(bandD) <= 2 ? 'OK' : 'FAIL'}`);

    // 원본 순서 [해골+단검, 방, 소환, 방패깃발, 상점]. '방'은 삭제됐지만 그 자리에 **퀘스트**가
    // 들어와 다시 5칸이 됐으므로, 신규 퀘스트 아이콘은 원본 1번 칸(방)을 **크기 기준으로만** 견준다
    // (모양은 대응 원본이 없는 신규 아이콘이라 잉크 bbox 치수만 같은 급인지 본다).
    // 🚨 **`pvp-dungeon-icon-swap`(사용자 지시 2026-08-19) 이후 짝이 바뀌었다 — 여기를 안 고치면
    //    멀쩡한 화면이 상시 FAIL 로 뜬다(실측: `pvp` 가 원본 3번 칸과 견줘져 Δ −3.01%p FAIL).**
    //    ⓐ 원본 0번 칸의 **해골+단검**은 이제 클론의 **PVP** 칸이 그린다(그림은 한 획도 안 바뀌었다).
    //    ⓑ 클론의 **던전**은 원본 **1번 칸('방', 삭제된 탭)의 아치문**을 그대로 옮겨 그린 것이다
    //       (2026-08-19 실측 — 앞 메모의 '대응 칸 없음'은 틀렸다). 그래서 1번 칸과 짝짓는다.
    //    ⓒ 퀘스트(두루마리)는 원본에 대응 그림이 아예 없다 — 디버그와 같이 '원본 긴 변 평균'과만
    //       견준다(종전엔 1번 칸을 크기 기준으로 빌려 썼는데, 이제 던전이 그 칸의 진짜 짝이다).
    //    ⓓ 원본 3번 칸(방패 깃발+교차 검)은 '길드 문장으로 읽힌다'는 지적으로 폐기돼 짝이 없다.
    const refIdx = { pvp: 0, dungeon: 1, summon: 2, shop: 4 };
    console.log('\n원본 5칸 잉크 bbox (%W×%H):');
    ref.cells.forEach((c, i) => console.log(`  [${i}] ${c ? `${pctW(c.w).toFixed(2)}×${pctH(c.h).toFixed(2)}  (${c.w}×${c.h}px)  ink=${c.ink}` : '없음'}`));
    const refLong = ref.cells.filter(Boolean).map(c => Math.max(pctW(c.w), pctH(c.h)));
    const refAvg = refLong.reduce((a, b) => a + b, 0) / refLong.length;
    console.log(`  → 원본 긴 변 평균 ${refAvg.toFixed(2)}% (최소 ${Math.min(...refLong).toFixed(2)} / 최대 ${Math.max(...refLong).toFixed(2)})`);

    console.log(`\n클론 ${clone.cells.length}칸 (라벨 숨김 상태):`);
    let fail = 0;
    clone.cells.forEach((c, i) => {
        const tab = dom.buttons[i] ? dom.buttons[i].tab : '?';
        const r = ref.cells[refIdx[tab]];
        if (!c) { console.log(`  [${i}] ${tab}: 잉크 없음 — 아이콘이 안 그려졌다  FAIL`); fail++; return; }
        if (!r) {
            // 대응 원본이 없는 클론 전용 칸(디버그) — 위치·모양은 견줄 대상이 없고,
            // '혼자 크거나 작지 않은가'만 원본 긴 변 평균과 비교한다.
            const long = Math.max(pctW(c.w), pctH(c.h));
            const dl = long - refAvg;
            const okN = Math.abs(dl) <= 2;
            if (!okN) fail++;
            console.log(`  [${i}] ${tab}: ${pctW(c.w).toFixed(2)}×${pctH(c.h).toFixed(2)}  vs 원본 대응 없음 — 긴 변 ${long.toFixed(2)}% vs 원본 평균 ${refAvg.toFixed(2)}%` +
                `  Δ ${dl >= 0 ? '+' : ''}${dl.toFixed(2)}%p  ${okN ? 'OK' : 'FAIL'}`);
            return;
        }
        const dw = pctW(c.w) - pctW(r.w), dh = pctH(c.h) - pctH(r.h);
        const ok = Math.abs(dw) <= 2 && Math.abs(dh) <= 2;
        if (!ok) fail++;
        console.log(`  [${i}] ${tab}: ${pctW(c.w).toFixed(2)}×${pctH(c.h).toFixed(2)}  vs 원본 ${pctW(r.w).toFixed(2)}×${pctH(r.h).toFixed(2)}` +
            `  Δ ${dw >= 0 ? '+' : ''}${dw.toFixed(2)} / ${dh >= 0 ? '+' : ''}${dh.toFixed(2)}%p  ${ok ? 'OK' : 'FAIL'}`);
    });

    // 라벨 겹침: 아이콘 박스 하단이 라벨 상단을 넘지 않아야 한다
    console.log('\n아이콘 박스 / 라벨 겹침:');
    for (const b of dom.buttons) {
        if (!b.hasIco) { console.log(`  ${b.tab}: 아이콘 요소 없음(이모지 상태)`); continue; }
        const over = b.icoBox && b.label ? (b.icoBox.y + b.icoBox.h) - b.label.y : 0;
        const ok = over <= 0.5;
        if (!ok) fail++;
        console.log(`  ${b.tab}: 아이콘 ${b.icoBox.w.toFixed(1)}×${b.icoBox.h.toFixed(1)}px (버튼 높이의 ${((b.icoBox.h / b.h) * 100).toFixed(1)}%)` +
            `  라벨 침범 ${over.toFixed(1)}px  ${ok ? 'OK' : 'FAIL'}`);
    }

    console.log('\n✕ 상태 왕복 (팝업 열고 닫은 뒤 아이콘 생존):');
    const tripOk = xTrip.before && xTrip.xMark && xTrip.after;
    if (!tripOk) fail++;
    console.log(`  열기 전 아이콘 ${xTrip.before ? '있음' : '없음'} · ✕ 로 바뀜 ${xTrip.xMark ? '예' : '아니오'} · 닫은 뒤 아이콘 ${xTrip.after ? '있음' : '없음(이모지로 되돌아갔다)'}  ${tripOk ? 'OK' : 'FAIL'}`);

    const blankInk = blank.reduce((a, c) => a + (c ? c.ink : 0), 0);
    console.log(`\n캘리브레이션: 아이콘 숨김 시 잉크 ${blankInk}px (0에 가까워야 측정기가 아이콘을 잡고 있는 것)`);
    if (errs.length) console.log('콘솔/페이지 에러:\n  ' + errs.join('\n  '));
    else console.log('콘솔/페이지 에러: 0건');

    if (blankInk > 200) { console.log('\n=> 측정기 고장: 아이콘을 숨겨도 잉크가 남는다(배경/라벨을 잡고 있다).'); process.exit(2); }
    console.log(fail ? `\n=> FAIL ${fail}건` : '\n=> PASS');
    process.exit(fail ? 1 : 0);
})();
