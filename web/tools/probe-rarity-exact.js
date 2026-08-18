// 등급 6색이 원본 소환 확률 팝업(shot-042521) 실측값과 같은지 — 클론을 실제로 띄워 픽셀로 재고
// 파생색(펫 타일 면 등)까지 함께 본다. (slug: rarity-css-exact)
//
// ⚠️ `RARITY_CSS` 상수만 비교하면 의미가 없다 — 화면에 실제로 칠해지는 값은 CSS 합성·투명도·
//    파생 계산을 거친 뒤라 상수와 다를 수 있다. 그래서 **렌더된 픽셀**을 읽는다.
// 사용: PW_PATH=... node probe-rarity-exact.js
//
// 🚨 2026-08-18 UI 스트림 보강: ⑴⑵ 는 위 머리말이 약속한 '렌더된 픽셀' 이 **아니라 JS 상수와
//    JS 계산값**이었다. 그래서 ⑶ 을 새로 붙였다 — 확률 팝업과 펫 화면을 실제로 띄워 **캡처 픽셀**로
//    막대 6색과 타일 면을 잰다. 이게 있어야 CSS 쪽 파생(`color-mix(in srgb, var(--rc) 60%, #fff)`)이
//    JS 쪽 `UI.srShade(…, 0.40)` 와 갈라졌을 때 잡힌다(지금은 둘 다 #ff7777 로 우연히 일치한다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 원본 shot-042521 을 x=200 세로 스캔해 얻은 값(막대 6개, 각 높이 29px)
const ORIG = {
    common: '#e0e0e0', rare: '#1cafff', epic: '#1cff41',
    legendary: '#f8ff1c', ultimate: '#ff1c1c', mythic: '#aa1cff',
};
const hex = a => '#' + a.map(v => v.toString(16).padStart(2, '0')).join('');
const dist = (a, b) => Math.max(...[0, 1, 2].map(i => Math.abs(a[i] - b[i])));
const toRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && !/favicon\.ico/.test(m.text()) && errs.push(m.text()));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 150000 });
    await page.waitForTimeout(800);
    // ⚠️ 3D 렌더 루프를 세우지 않으면 `page.screenshot` 이 30초 타임아웃으로 죽는다(소프트웨어 GL
    //    에서 rAF 한 프레임이 통째로 몇 초씩 걸린다). probe-screens-errors.js 와 같은 조치다.
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; });

    const r = await page.evaluate((ORIG) => {
        const out = { consts: {}, derived: {} };
        for (const k of Object.keys(ORIG)) out.consts[k] = RARITY_CSS[k];
        // 파생색 — 펫 타일 면은 등급색 60% + 흰색 40% 로 잡혀 있다(항목 검증 ⑵)
        out.derived.ultimateMix = UI.srShade ? UI.srShade(RARITY_CSS.ultimate, 0.40) : null;
        // 흰 카드용 잉크(대비 보정)도 같이 찍어 둔다 — 팔레트가 바뀌면 여기도 따라 움직인다
        // 흰 카드용 잉크는 색이 아니라 **대비**가 계약이다(AA 4.5:1) — 값이 아니라 대비를 검사한다.
        out.derived.ink = {};
        for (const k of Object.keys(ORIG)) {
            const ink = UI.inkRarity(RARITY_CSS[k]);
            out.derived.ink[k] = { hex: ink, contrast: +UI.contrastOnWhite(ink).toFixed(2) };
        }
        return out;
    }, ORIG);

    console.log('=== ⑴ RARITY_CSS 상수 대조 ===');
    const bad = [];
    for (const k of Object.keys(ORIG)) {
        const got = (r.consts[k] || '').toLowerCase(), want = ORIG[k];
        const d = got.length === 7 ? dist(toRgb(got), toRgb(want)) : 999;
        const ok = d === 0;
        console.log(`  ${k.padEnd(10)} 클론 ${got}  원본 ${want}  Δ최대채널 ${d}  ${ok ? 'OK' : 'X'}`);
        if (!ok) bad.push(`${k} ${got}≠${want}`);
    }
    console.log('\n=== ⑵ 파생색(팔레트에서 런타임 계산되는 값) ===');
    console.log('  궁극의 +40% 흰색 =', r.derived.ultimateMix, '(원본 펫 타일 면 #ff7777 수렴 기대)');
    console.log('  흰 카드용 잉크(AA 4.5:1 계약):');
    for (const [k, v] of Object.entries(r.derived.ink)) {
        const ok = v.contrast >= 4.5;
        console.log(`    ${k.padEnd(10)} ${v.hex}  대비 ${v.contrast}  ${ok ? 'OK' : 'X'}`);
        if (!ok) bad.push(`${k} 잉크 대비 ${v.contrast} < 4.5`);
    }
    if (r.derived.ultimateMix) {
        const d = dist(toRgb(r.derived.ultimateMix), toRgb('#ff7777'));
        console.log(`  → #ff7777 과의 최대채널 차 ${d}`);
        if (d > 8) bad.push(`펫 타일 파생면이 #ff7777 에서 ${d} 벗어남 (${r.derived.ultimateMix})`);
    }
    // ================= ⑶ 렌더된 픽셀 =================
    // 상수가 맞아도 화면이 맞다는 보장이 없다(투명도·합성·CSS 파생이 그 뒤에 붙는다).
    // 확률 팝업 막대 6개와 펫 타일 면을 **캡처해서** 재고, 글자·별에 안 맞게 '최빈색'으로 고른다.
    const shots = [];

    // 🚨 rect 는 **캡처 직전에** 읽어야 한다. 팝업을 연 evaluate 안에서 같이 읽었더니 그 뒤
    //    모달이 자리를 잡으면서 한 줄 높이만큼 밀려, 막대 6개가 통째로 **한 칸씩 어긋난 색**으로
    //    측정됐다(common 자리에서 rare 색이 나왔다 — 값이 그럴듯해서 '팔레트가 틀렸다'로 오독하기
    //    딱 좋은 형태였다). 열기 → 대기 → **그 다음** rect → 캡처 순서를 지킬 것.
    const rectsOf = sel => page.evaluate(s => [...document.querySelectorAll(s)].map(e => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
    }), sel);

    // ⓐ 소환 확률 팝업 — RARITIES 순서대로 .rate-bar 6줄
    const order = await page.evaluate(() => { UI.openSummonRates('skill'); return RARITIES.slice(); });
    await page.waitForTimeout(600);
    const barRects = { order, rects: await rectsOf('.rate-bar') };
    shots.push({ what: 'rates', png: (await page.screenshot()).toString('base64'), rects: barRects.rects });

    // ⓑ 펫 타일 면 — 시드가 궁극의 펫 3장을 심는다(원본 shot-042356 과 같은 구성)
    await page.evaluate(() => UI.closeDetail());
    await page.evaluate(PETS_STATE_SRC);
    await page.waitForFunction(
        () => document.querySelectorAll('#panel-pets .pet-tile:not(.egg) .tile-face').length >= 3,
        null, { timeout: 60000 });
    await page.waitForTimeout(600);
    const tileRects = (await rectsOf('#panel-pets .pet-tile:not(.egg) .tile-face')).slice(0, 3);
    // 브라우저가 실제로 푼 color-mix 값. **우리 JS(`UI.srShade`)가 아니라 CSS 엔진의 답**이라
    // 두 경로가 갈라지면 여기서 갈린다. 면을 크리처 썸네일이 100% 덮고 있어(실측: 썸네일 44.9×49.4
    // = 면 안쪽과 같은 크기, 게다가 위에 리본까지 얹힌다) '면 한가운데 픽셀' 은 잴 수가 없다 —
    // 그래서 ⓘ 계산값은 computed style 로, ⓙ 화면에 정말 그 색이 칠해졌는지는 '존재 검사' 로 나눈다.
    const faceComputed = await page.evaluate(() =>
        [...document.querySelectorAll('#panel-pets .pet-tile:not(.egg) .tile-face')].slice(0, 3).map(t => {
            const m = getComputedStyle(t).backgroundColor.match(/[\d.]+/g).map(Number);
            // color(srgb 1 0.46 0.46) 도 rgb(255,119,119) 도 같은 형식으로 받는다
            const to255 = v => Math.round(v <= 1 ? v * 255 : v);
            return '#' + m.slice(0, 3).map(v => to255(v).toString(16).padStart(2, '0')).join('');
        }));
    shots.push({ what: 'petface', mode: 'present', want: '#ff7777', png: (await page.screenshot()).toString('base64'), rects: tileRects });

    // 디코드는 별도 페이지에서 — 게임 페이지를 setContent 로 갈아엎으면 안 된다.
    const dec = await browser.newPage();
    await dec.setContent('<canvas id=c></canvas>');
    const px = await dec.evaluate(async (shots) => {
        const c = document.getElementById('c'), cx = c.getContext('2d');
        const out = {};
        for (const s of shots) {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + s.png; });
            c.width = img.width; c.height = img.height;
            cx.drawImage(img, 0, 0);
            const d = cx.getImageData(0, 0, c.width, c.height).data;
            out[s.what] = s.rects.map(r => {
                // 테두리(약 3px)와 글자를 피해 안쪽만 본다. 글자는 소수라 최빈색이 바탕이 된다.
                // ⚠️ 요소가 뷰포트 밖(스크롤 아래)이면 캡처에 없다 — 클램프해서 조용히 빈 구간을
                //    읽지 말고 밖이라는 사실을 그대로 돌려준다(빈 구간을 '측정 성공'으로 세면 안 된다).
                const cl = (v, hi) => Math.max(0, Math.min(hi, Math.round(v)));
                const x0 = cl(r.x + 4, c.width), x1 = cl(r.x + r.w - 4, c.width);
                // 막대는 글자만 피하면 되지만, 펫 타일 면은 **가운데를 크리처 그림이 거의 다 덮는다**
                // — 한가운데를 재면 면 색이 아니라 크리처 색이 나온다(실측 최빈 3~8%, 회색 덩어리).
                // 면 색은 테두리 바로 안쪽 윗띠에서 잡는다.
                const y0 = cl(r.y + r.h * 0.10, c.height), y1 = cl(r.y + r.h * 0.90, c.height);
                if (x1 - x0 < 2 || y1 - y0 < 2) {
                    return { hex: null, share: 0, offscreen: true,
                             rect: [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)] };
                }
                const tally = new Map();
                for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
                    const i = (y * c.width + x) * 4;
                    const k = '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
                    tally.set(k, (tally.get(k) || 0) + 1);
                }
                let best = null, n = 0, tot = 0;
                for (const [k, v] of tally) { tot += v; if (v > n) { n = v; best = k; } }
                // 'present' 모드 — 최빈색이 아니라 **기대색이 실제로 칠해졌는지**를 본다.
                if (s.mode === 'present') {
                    const hit = tally.get(s.want) || 0;
                    return { hex: best, share: +(n / tot).toFixed(3), want: s.want, wantShare: +(hit / tot).toFixed(4) };
                }
                return { hex: best, share: +(n / tot).toFixed(3) };
            });
        }
        return out;
    }, shots);

    console.log('\n=== ⑶ 렌더된 픽셀(캡처 실측) ===');
    console.log('  소환 확률 팝업 막대:');
    barRects.order.forEach((k, i) => {
        const got = px.rates[i], want = ORIG[k];
        if (!got || !got.hex) { bad.push(`${k} 막대를 화면에서 못 잼${got && got.offscreen ? '(뷰포트 밖 rect=' + got.rect.join(',') + ')' : ''}`); return; }
        const d = dist(toRgb(got.hex), toRgb(want));
        console.log(`    ${k.padEnd(10)} 화면 ${got.hex} (면적 ${Math.round(got.share * 100)}%)  원본 ${want}  Δ ${d}  ${d === 0 ? 'OK' : 'X'}`);
        if (d > 0) bad.push(`${k} 막대 렌더값 ${got.hex}≠${want}`);
    });
    if (barRects.rects.length !== 6) bad.push(`확률 팝업 막대가 ${barRects.rects.length}줄(6줄이어야 한다)`);

    console.log('  펫 타일 면(궁극의 · CSS color-mix 60%+흰 40% 경로):');
    if (!px.petface || !px.petface.length || !faceComputed.length) bad.push('펫 타일을 화면에서 못 찾았다(시드 실패)');
    faceComputed.forEach((hexv, i) => {
        const d = dist(toRgb(hexv), toRgb('#ff7777'));
        const t = px.petface[i] || {};
        // 썸네일이 면을 덮으므로 '면적' 이 아니라 **그 색이 타일 안에 존재하는가**로 본다.
        const seen = (t.wantShare || 0) > 0.01;
        console.log(`    타일${i + 1} CSS해석 ${hexv} (Δ ${d})  화면에 #ff7777 픽셀 ${((t.wantShare || 0) * 100).toFixed(1)}%  ${d === 0 && seen ? 'OK' : 'X'}`);
        if (d !== 0) bad.push(`펫 타일 면 CSS해석 ${hexv} ≠ #ff7777`);
        if (!seen) bad.push(`펫 타일${i + 1} 화면에 #ff7777 픽셀이 사실상 없다(${((t.wantShare || 0) * 100).toFixed(2)}%) — 면이 완전히 가려졌거나 색이 안 칠해졌다`);
    });

    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');
    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ')
        : '\nPASS — 6색 원본 일치(상수·렌더 둘 다) · 펫 타일 면 #ff7777 · 잉크 AA 4.5:1 · 콘솔 에러 0건');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
