// 가로 모드(및 좁은 세로)에서 앱 상자 밖으로 삐져나오는 UI 가 있는지 검증 — slug: landscape-font-floor
//
// 배경: `fitLayout()` 은 9:16 레터박스로 #app 을 줄이고 루트 폰트를 `h/844*16` 로 같이 줄여
//       "세로 모드와 같은 그림이 그대로 작아지는" 것을 노린다. 그런데 폰트에만 12px 하한이 걸려 있어
//       앱 높이가 633px 아래로 내려가면 **폰트만 축소가 멈춘다** → rem 기반 레이아웃이 앱 폭을 넘는다.
//
// 재는 것 (전부 DOM rect, 화면 캡처 불필요):
//   ⑴ #app 안 모든 보이는 button 의 rect 가 #app rect 안에 들어오는가 (오른쪽/왼쪽/아래 이탈 px)
//   ⑵ [대장간 레벨 N] 버튼의 **시각적 줄 수** (Range.getClientRects() 로 줄상자를 직접 센다 —
//      height/lineHeight 나눗셈은 버튼 패딩 때문에 반올림에서 틀린다). 사양상 `<br>` 하나라 2줄이 정상.
//   ⑶ 잘린 글자: overflow 가 hidden 인 요소에서 scrollWidth > clientWidth (상단바 젬 수치·장비 셀 이름·탭바 라벨)
//   ⑷ 루트 폰트 실측값과 비례값(h/844*16) 의 차이 — 하한이 발동했는지 한 줄로 보인다
//
// ⚠️ 대장간 레벨에 따라 버튼 라벨 길이가 바뀐다(레벨 1 / 20 / 35 = 1자리·2자리·만렙 라벨) → 3개 다 잰다.
// ⚠️ 헤드리스는 rAF 가 1~2fps 라 Scene3D.update·Combat.tick 을 비워야 측정이 안정된다(QA 15차 ⓐ).
//
// 사용: node probe-landscape-fit.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 가로 4종(항목 실측 조건) + 지원 최소 세로 + 기준 세로
const VIEWPORTS = [
    { w: 932, h: 430 }, { w: 844, h: 390 }, { w: 640, h: 360 }, { w: 568, h: 320 },
    { w: 320, h: 568 }, { w: 390, h: 844 },
];
const FORGE_LEVELS = [1, 20, 35];
const EPS = 0.5;   // 서브픽셀 반올림 허용치

const MEASURE = `() => {
    const app = document.getElementById('app');
    const a = app.getBoundingClientRect();
    const out = { app: { w: +a.width.toFixed(1), h: +a.height.toFixed(1) },
                  root: parseFloat(getComputedStyle(document.documentElement).fontSize),
                  spill: [], lines: null, clipped: [] };
    out.want = +(a.height / 844 * 16).toFixed(2);

    const visible = el => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0.5 && r.height > 0.5;
    };
    // 닫힌 패널/모달은 화면 밖에 대기하는 게 정상이다 — 열린 표면만 본다.
    const parked = el => !!el.closest('.panel:not(.open), .modal:not(.open), #fx-layer');

    for (const b of app.querySelectorAll('button')) {
        if (!visible(b) || parked(b)) continue;
        const r = b.getBoundingClientRect();
        const d = {
            right: +(r.right - a.right).toFixed(1),
            left: +(a.left - r.left).toFixed(1),
            bottom: +(r.bottom - a.bottom).toFixed(1),
            top: +(a.top - r.top).toFixed(1),
        };
        const worst = Math.max(d.right, d.left, d.bottom, d.top);
        if (worst > ${EPS}) out.spill.push({
            label: (b.innerText || b.title || b.className).trim().replace(/\\s+/g, ' ').slice(0, 18),
            cls: b.className.slice(0, 24), ...d, w: +r.width.toFixed(1),
        });
    }

    // [대장간 레벨 N]/[대장간 최고 레벨]/[승천 가능] 과 [자동🔄 ON/OFF] — 둘 다 br 로 2줄이 정상이다.
    // 라벨이 3줄 이상이면 안쪽 폭이 모자라 자동 줄바꿈이 끼어든 것이다(가로 모드에서 '자/ㅌ/OF' 로 쪼개졌다).
    out.lines = [];
    for (const b of app.querySelectorAll('.forge-actions button')) {
        const rng = document.createRange();
        rng.selectNodeContents(b);
        const boxes = [...rng.getClientRects()].filter(r => r.height > 1 && r.width > 0.5);
        // 같은 줄에 여러 조각(텍스트+아이콘)이 잡히므로 y 로 묶는다
        const ys = [], br = b.getBoundingClientRect();
        let outBtn = 0;
        for (const r of boxes) {
            if (!ys.some(y => Math.abs(y - r.top) < 2)) ys.push(r.top);
            outBtn = Math.max(outBtn, r.right - br.right, br.left - r.left);   // nowrap 이 글자를 밖으로 밀어냈는지
        }
        out.lines.push({ n: ys.length, text: b.innerText.replace(/\\n/g, '/').trim(), spillTxt: +outBtn.toFixed(1),
            w: +br.width.toFixed(1), h: +br.height.toFixed(1) });
    }

    // 잘린 글자 — overflow 가 잘리는 요소만(스크롤 컨테이너는 제외)
    for (const el of app.querySelectorAll('*')) {
        if (!visible(el) || parked(el) || !el.textContent.trim()) continue;
        const s = getComputedStyle(el);
        if (!/hidden|clip/.test(s.overflowX)) continue;
        if (el.scrollWidth > el.clientWidth + 1) out.clipped.push({
            cls: el.className.toString().slice(0, 26),
            text: el.innerText.trim().replace(/\\s+/g, ' ').slice(0, 14),
            over: el.scrollWidth - el.clientWidth,
        });
    }
    return out;
}`;

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const fails = [], errs = [];
    const rows = [];

    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
        page.on('pageerror', e => errs.push(`${vp.w}x${vp.h}: ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${vp.w}x${vp.h}: ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
        await page.evaluate(() => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            if (typeof Combat !== 'undefined') Combat.tick = function () {};
        });

        for (const lv of FORGE_LEVELS) {
            await page.evaluate((lv) => {
                S.forgeLevel = lv;
                S.hammers = 1e6; S.coins = 1e12; S.gems = 1e6;
                S.bestChapter = 9; S.bestStage = 9;   // 자동🔄 해금 (isUnlocked 는 best* 를 본다)
                UI.renderEquipSheet(); UI.renderTopbar && UI.renderTopbar();
            }, lv);
            await page.waitForTimeout(120);
            // ⚠️ 이 Playwright 는 문자열 화살표 함수를 '함수'로 못 알아채고 식으로 평가해 undefined 를 준다 →
            //    반드시 즉시호출 식으로 감싼다.
            const m = await page.evaluate(`(${MEASURE})()`);
            rows.push({ vp: `${vp.w}x${vp.h}`, lv, ...m });

            const tag = `${vp.w}x${vp.h} Lv.${lv}`;
            for (const s of m.spill) fails.push(`${tag} [${s.label}] 앱 밖으로 ${Math.max(s.right, s.left, s.bottom, s.top)}px (폭 ${s.w})`);
            for (const L of m.lines) {
                if (L.n > 2) fails.push(`${tag} 버튼 "${L.text}" 가 ${L.n}줄 (${L.w}x${L.h})`);
                if (L.spillTxt > EPS) fails.push(`${tag} 버튼 "${L.text}" 글자가 상자 밖으로 ${L.spillTxt}px`);
            }
            for (const c of m.clipped) fails.push(`${tag} 글자 잘림 .${c.cls} "${c.text}" ${c.over}px`);
        }
        await page.close();
    }
    await browser.close();

    console.log('vp        Lv  앱          rootFont(실측/비례)  이탈  버튼줄  잘림');
    for (const r of rows) {
        const flag = Math.abs(r.root - r.want) > 0.05 ? ' ⚠하한' : '';
        console.log(`${r.vp.padEnd(9)} ${String(r.lv).padStart(2)}  ${(r.app.w + 'x' + r.app.h).padEnd(11)} `
            + `${(r.root.toFixed(2) + '/' + r.want.toFixed(2) + flag).padEnd(20)} `
            + `${String(r.spill.length).padStart(3)}  ${r.lines.map(L => L.n).join('·').padStart(5)}  ${String(r.clipped.length).padStart(4)}`);
    }
    if (errs.length) { console.log('\n콘솔 에러:'); errs.slice(0, 10).forEach(e => console.log('  ' + e)); }
    console.log('\n' + (fails.length ? `FAIL ${fails.length}건` : 'PASS — 전 뷰포트에서 앱 밖 이탈 0 · 대장간 버튼 2줄 이하 · 글자 잘림 0'));
    fails.slice(0, 40).forEach(f => console.log('  ✗ ' + f));
    if (errs.length) console.log(`  ✗ 콘솔 에러 ${errs.length}건`);
    process.exit(fails.length || errs.length ? 1 : 0);
})();
