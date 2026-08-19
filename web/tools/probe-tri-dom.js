// 클론의 뒤로가기 ◀ · 좌우 스텝 ◀▶ 삼각형을 **원본과 같은 픽셀 코드로** 재서 계약 대조
// — `probe-tri-ref.js` 의 짝.
//
// 계약(원본 실측, probe-tri-ref.js + ASCII 확대):
//   ⓐ 빨간 뒤로 버튼 안 **흰 삼각형 잉크 12×13px**(shot-042149, 앱 498×896)
//      → 잉크 세로 = 앱 세로의 **1.451%** · 잉크 가로/세로 = **0.923**
//   ⓑ 소환 확률 팝업의 **파란 잉크 25×27px**(shot-042521, 앱 499×894)
//      → 세로 **3.020%H** · 가로/세로 **0.926**
//   ⓒ 던전 상세의 **파란 잉크 26×29px**(shot-042304, 앱 498×888)
//      → 세로 **3.266%H** · 가로/세로 **0.897**
//   ⓓ 세 경우 모두 잉크 둘레에 **순검정 키라인**이 있다(원본 ASCII 에서 2~3px).
//
// 🚨 **버튼 상자 대비 비로 재면 안 된다.** 클론의 뒤로 버튼은 자리마다 상자가 다르다
//    (리그 2.1×1.75rem · 소환 바 7.06%W×3.26%H · 부화장 2.4rem 정사각). 같은 삼각형을
//    넣어도 상자 비는 자리마다 달라져 멀쩡한 화면이 FAIL 로 나온다. 원본이 실제로 고정해
//    두는 건 **화면 대비 잉크 크기**라 그걸 계약으로 쓴다(앱 세로 대비 %).
// 🚨 **잉크만 잰다 — 키라인은 바운딩에서 뺀다.** 흰/파랑 술어로 잡으므로 검정 테는 자동으로
//    빠진다. ref 판과 술어를 글자 그대로 같게 두는 이유가 이것이다(TODO '채점 함정 ①').
// ⚠️ 스캔은 **DOM 이 알려 준 버튼 상자 안**만 훑는다. 화면 다른 곳의 흰 글자·파란 pill 이
//    같은 술어에 걸려 바운딩을 통째로 뻥튀기한다(xmark 판이 밟은 그 함정).
//
// 사용: node probe-tri-dom.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// ⚠️ **시드를 `shot-screens.js` 와 공유한다.** 던전 상세의 ◀▶ 는 `Dungeons.unlocked(id)` 가 거짓이면
//    팝업 자체가 안 뜨고(초기 상태), 떠도 최고 클리어가 0이면 둘 다 `visibility:hidden` 이라
//    '화면에 없다'가 나온다 — 결함이 아니라 시드 부족이다. 지어낸 시드를 쓰지 말고 캡처와 같은 걸 쓴다.
const { SEED_SRC } = require('./shot-screens-seed.js');
// [이름, 오프너, 셀렉터, 색, 계약 세로비, 계약 가로/세로]
// 오프너는 `shot-screens.js` 가 쓰는 것과 같은 문자열이다(손으로 지어내면 조용히 터진다).
const CASES = [
    ['league(◀)', `UI.openLeague()`, '.league-back-btn', 'white', 0.01451, 0.923],
    ['dungeons(◀)', `UI.openDungeons()`, '.sheet-back-btn', 'white', 0.01451, 0.923],
    ['skills(◀)', `UI.switchTab('summon'); UI.switchSummonSub('skills')`, '.summon-bar .back-btn', 'white', 0.01451, 0.923],
    ['rates(◀)', `UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.openSummonRates('skill')`, '.tri-btn', 'blue', 0.03020, 0.926],
    ['dgd(◀)', `UI.openDungeons(); UI.openDungeonDetail('hammer')`, '.dgd-stage-row .tri-btn', 'blue', 0.03266, 0.897],
];
const TOL = 0.02;
/* 🚨 **±2%p 만으로는 이 항목의 게이트가 안 된다.** 삼각형 잉크는 앱 세로의 1.45%(흰)~3.27%(파랑)
   밖에 안 돼서, ±2%p 를 그대로 쓰면 **크기를 2.4배 틀려도 통과**한다(실측: 아이콘을 0.0179→0.0129
   로 28% 줄여 놓고 돌렸더니 Δ가 겨우 −0.55%p 라 PASS 가 나왔다 — 자에 눈금이 없는 것이다).
   그래서 절대 ±2%p 와 **상대 ±10%** 를 함께 건다. 10%는 잡음 한계에서 나온 값이다:
   클론 삼각형은 축소된 PNG 라 가장자리가 부드러워, 원본(1x 크리스프 래스터)과 같은 흰 문턱(>220)
   으로 재면 사방 1 장치px 씩 덜 잡힌다(24px 잉크에서 ≈8%). 세 흰 자리가 **전부 똑같이 22×24** 로
   나오는 것이 이게 기하 차이가 아니라 안티에일리어싱임을 말해 준다. */
const REL = 0.10;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 497, height: 897 }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && typeof IconGen !== "undefined"');
    await page.waitForFunction('document.fonts ? document.fonts.status === "loaded" : true').catch(() => { });
    // 3D 캔버스는 이 판정과 무관하고 프레임마다 픽셀이 흔들린다 — 멈춰 둔다.
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () { }; });
    await page.evaluate(SEED_SRC);
    /* 🚨 **자동 제련을 끈다.** 시드가 `S.autoForgeOn = true` 로 두는데, 자동 제련은 화면을 연 뒤
       **비동기로** 카드판 모달을 띄우고 그 딤이 화면 전체를 덮는다(던전 목록에서 흰 삼각형이
       회색으로 찍혀 '잉크를 못 찾음' 이 났다 — 전체 캡처를 떠 보고서야 정체를 알았다).
       뜨는 타이밍이 망치 수·경과 시간에 따라 달라 **런마다 결과가 갈리던 진짜 원인**이다. */
    await page.evaluate(() => { S.autoForgeOn = false; try { saveGame(); } catch (e) { } });
    await page.waitForTimeout(300);

    const rows = [];
    for (const [name, open, sel, color, wantH, wantAR] of CASES) {
        /* 🚨 **화면 간 오염 제거는 `shot-screens.js` 의 처방을 그대로 쓴다.**
           `UI.close*()` 를 하나씩 부르는 방식은 못 믿는다 — 오프라인 보상처럼 MODAL_TAB 에 등록
           안 된 모달이 남아 **딤이 다음 화면 위에 깔리고**, 그러면 멀쩡히 그려진 흰 삼각형이
           회색(≈180)으로 찍혀 흰 술어(>220)에 안 걸린다. 그게 '잉크를 못 찾음' 의 정체였다
           (캡처로 규명 — 버튼은 정상, 화면 전체가 어두웠다). 런마다 결과가 갈린 것도 이 때문이다
           (오프라인 보상은 경과 시간에 따라 떴다 안 떴다 한다). `.modal` 을 전부 강제로 닫는다. */
        await page.evaluate(() => {
            try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
            try { UI.switchTab && UI.switchTab(null); } catch (e) { }
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
        });
        await page.waitForTimeout(150);
        try { await page.evaluate(open); } catch (e) { rows.push({ name, err: String(e) }); continue; }
        // ⚠️ **고정 대기는 못 믿는다.** 시트·모달은 열릴 때 transform/opacity 전이가 있어, 400ms
        //    고정으로는 어떤 런에서는 버튼이 아직 뷰포트 밖(또는 반투명)이라 '화면에 없다'가
        //    간헐적으로 났다 — 같은 코드가 런마다 갈리면 그건 결함이 아니라 프로브 경합이다.
        //    아래 술어가 참이 될 때까지 **기다린다**(못 기다리면 그때 진짜 없는 것이다).
        const VISIBLE = `(sel => [...document.querySelectorAll(sel)].some(el => {
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0 || getComputedStyle(el).visibility === 'hidden') return false;
            if (el.closest('.hidden') || el.offsetParent === null) return false;
            return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
        }))`;
        try { await page.waitForFunction(`${VISIBLE}(${JSON.stringify(sel)})`, null, { timeout: 8000 }); }
        catch (e) { rows.push({ name, err: `${sel} 이 8초 안에 화면에 안 뜸` }); continue; }
        // 열림 애니메이션(scale/opacity) 한복판에서 찍으면 잉크가 작게 잡힌다 — 최종 상태로 스냅.
        await page.evaluate(() => document.querySelectorAll('.modal, .modal-card').forEach(m => m.classList.remove('opening')));
        await page.waitForTimeout(400);
        const anchor = await page.evaluate((sel) => {
            // 🚨 **크기가 0이 아닌 첫 요소를 고르면 안 된다.** 탭 패널은 닫혀도 DOM 에 남아,
            //    같은 클래스의 버튼이 화면 밖/뒤에 여러 개 살아 있다(던전 목록을 재는데
            //    기술 개요 시트의 `.sheet-back-btn` 이 잡혀 엉뚱한 좌표를 냈다 — 1차 실행 실측).
            //    실제로 **보이는** 것만 남긴다: 닫힌(.hidden) 조상이 없고, 상자가 뷰포트 안에
            //    온전히 들어오는 것. (elementFromPoint 히트 테스트는 못 쓴다 — 탭바가 이 버튼
            //    위를 덮는 화면이 있어 멀쩡한 버튼이 전부 떨어진다.)
            const e = [...document.querySelectorAll(sel)].find(el => {
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0 || getComputedStyle(el).visibility === 'hidden') return false;
                if (el.closest('.hidden') || el.offsetParent === null) return false;   // 닫힌 패널·모달 안
                return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
            });
            if (!e) return null;
            const r = e.getBoundingClientRect(), s = window.devicePixelRatio || 1;
            const app = document.getElementById('app') || document.body;
            return {
                x0: r.left * s, y0: r.top * s, x1: r.right * s, y1: r.bottom * s,
                appH: app.getBoundingClientRect().height * s,
            };
        }, sel);
        if (!anchor) { rows.push({ name, err: `${sel} 이 화면에 없다` }); continue; }
        const shot = await page.screenshot();
        const found = await page.evaluate(async ([b64, a, color]) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
            const W = img.width, H = img.height;
            const c = document.createElement('canvas');
            c.width = W; c.height = H;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, W, H).data;
            const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
            // ── 술어는 probe-tri-ref.js 와 글자 그대로 같다 ──
            const isWhite = (p) => p[0] > 220 && p[1] > 220 && p[2] > 220;
            const isBlue = (p) => p[2] > 130 && p[2] - p[0] > 55 && p[2] - p[1] > 30;
            const isBlack = (p) => p[0] < 70 && p[1] < 70 && p[2] < 70;
            const hit = color === 'white' ? isWhite : isBlue;
            // 🚨 스캔 범위는 색마다 달라야 한다.
            //  · 흰 삼각형은 **빨간 버튼 안**에 있고, 버튼 바로 바깥이 시트의 **흰 카드**인 화면이
            //    있다(던전 목록·소환 바). 상자를 조금이라도 넓히면 카드 전체가 '잉크'로 잡혀
            //    126×118 같은 값이 나온다(1차 실행에서 실제로 나왔다 — 결함이 아니라 스캔 범위였다).
            //    → 상자 안만 훑는다.
            //  · 파란 삼각형은 버튼 배경이 없고 아이콘이 상자보다 넓으므로 둘레를 넓혀야 한다.
            //    주변이 흰 카드라 파랑 술어에는 안 걸린다.
            //    🚨 흰 술어는 **상자 그대로도 넓다** — 버튼이 라운드 사각이라 네 모서리에 바깥
            //    배경이 들어오는데, 시트 바탕이 크림색(247,244,236)이라 '흰'에 걸린다(1차 실행에서
            //    잉크가 버튼 상자 그대로인 72×59 로 나왔다). 그래서 흰 쪽은 상자를 **안으로** 깎는다.
            const PAD = color === 'white' ? -Math.min(a.x1 - a.x0, a.y1 - a.y0) * 0.18 : Math.max(6, (a.x1 - a.x0) * 0.45);
            const bx0 = Math.max(0, Math.round(a.x0 - PAD)), bx1 = Math.min(W - 1, Math.round(a.x1 + PAD));
            const by0 = Math.max(0, Math.round(a.y0 - PAD)), by1 = Math.min(H - 1, Math.round(a.y1 + PAD));
            let ix0 = 1e9, iy0 = 1e9, ix1 = -1, iy1 = -1, n = 0;
            for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
                if (!hit(at(x, y))) continue;
                n++;
                if (x < ix0) ix0 = x; if (x > ix1) ix1 = x;
                if (y < iy0) iy0 = y; if (y > iy1) iy1 = y;
            }
            if (ix1 < 0) return null;
            // 키라인 유무 — 잉크 세로 중앙 행에서 잉크 **바로 바깥** 3px 안에 거의-검정이 있는가.
            // ◀ 는 그 행이 뾰족한 꼭짓점이라 좌우 어느 쪽이든 곧바로 테를 만난다.
            const my = Math.round((iy0 + iy1) / 2);
            let rim = 0;
            for (let k = 1; k <= 4; k++) {
                if (ix0 - k >= 0 && isBlack(at(ix0 - k, my))) rim++;
                if (ix1 + k < W && isBlack(at(ix1 + k, my))) rim++;
            }
            return { iw: ix1 - ix0 + 1, ih: iy1 - iy0 + 1, n, rim };
        }, [shot.toString('base64'), anchor, color]);
        if (!found && process.env.DBG) {
            require('fs').writeFileSync(`/tmp/tri-${name.replace(/[^a-z]/gi, '')}.png`, shot);
            console.log('  [DBG] 저장:', `/tmp/tri-${name.replace(/[^a-z]/gi, '')}.png`, JSON.stringify(anchor));
        }
        rows.push({ name, wantH, wantAR, appH: anchor.appH, ...(found || { err: '삼각형 잉크를 못 찾음' }) });
    }
    await browser.close();

    let fail = 0;
    console.log('  화면          잉크 w×h(dev)  세로/앱세로(Δ)          가로/세로(Δ)           키라인   판정');
    for (const r of rows) {
        if (r.err) { console.log(`  ${r.name.padEnd(13)} ✕ ${r.err}`); fail++; continue; }
        const rh = r.ih / r.appH, ar = r.iw / r.ih;
        const dh = rh - r.wantH, dar = ar - r.wantAR;
        // 키라인은 **유무만** 본다 — 두께는 잉크가 13px 급이라 ±2%p 로 잴 수 없다(xmark 판과 같은 이유).
        const bad = Math.abs(dh) > TOL || Math.abs(dh) > r.wantH * REL || Math.abs(dar) > 0.12 || r.rim < 2;
        if (bad) fail++;
        const f = (v, dv, p) => `${v.toFixed(4)}(${dv >= 0 ? '+' : ''}${(dv * 100).toFixed(2)}%${p})`;
        console.log(`  ${r.name.padEnd(13)} ${String(r.iw).padStart(3)}×${String(r.ih).padStart(3)}      ` +
            `${f(rh, dh, 'p').padEnd(23)}${f(ar, dar, 'p').padEnd(23)}${String(r.rim).padStart(4)}   ${bad ? 'FAIL' : 'PASS'}`);
    }
    console.log(`\n  계약 — 잉크 세로/앱세로 ±${TOL * 100}%p **이면서** 상대 ±${REL * 100}% · 가로/세로비 ±0.12 · 키라인 픽셀 ≥2`);
    console.log('         (획 두께는 측정 한계로 게이트 제외 — 잉크가 13px 급이라 ±2%p 로는 못 잰다)');
    if (errs.length) { console.log(`\n  🚨 콘솔 에러 ${errs.length}건:`); errs.slice(0, 5).forEach(e => console.log('   · ' + e)); fail++; }
    console.log(fail ? `\n결과: FAIL ${fail}건` : '\n결과: PASS');
    process.exit(fail ? 2 : 0);
})();
