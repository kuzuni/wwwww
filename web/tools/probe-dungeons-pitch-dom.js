/* 던전 카드 **피치를 DOM 으로** 잰다 (slug `dungeons-card-pitch-2p`).
 *
 * 왜 따로 필요한가: 같은 축을 이미 `probe-dungeons-px` 가 보지만 그 자는 **화소 추정기**다 —
 * 카드를 '비흰 화소가 행의 50% 초과인 밴드'로 찾으므로, **배너 그림의 값이 바뀌면 밴드 경계가
 * 같이 움직인다.** 실제로 이 저장소에서 그 일이 두 번 났다:
 *   · 2026-08-25 `MODE_MAJ` 도입 → 배너 하늘이 밝아져 밴드가 쪼개짐 → 피치 −4.36%p 로 **오측**
 *   · 2026-08-25 `dg-band-luma`  → 배너가 어두워짐 → 두 세션이 '선재 결함'으로 등재해 둔
 *     **피치 +2.04%p 가 +0.13%p 로 사라짐**
 * 두 번 다 **CSS 는 한 줄도 안 바뀌었다.** 즉 그 축의 빨강·초록은 레이아웃이 아니라 그림이
 * 정하고 있었다. 이 자는 **아트와 무관한 답**을 준다 — `getBoundingClientRect` 로 카드 위치를
 * 직접 읽으므로 배너 색이 무엇이든 같은 수치가 나온다.
 *
 * 🚨 그래서 이 자와 `probe-dungeons-px` 의 피치가 어긋나면 **이 자가 맞다.**
 *    `probe-dungeons-px` 쪽이 흔들리거든 배너 아트를 의심하고, CSS 를 건드리지 말 것.
 *
 * 재는 것: 카드 4장의 **피치**(연속한 두 카드 상단 사이 거리)와 **높이**를 앱 세로(#app 높이)
 * 대비 %H 로. 원본 목표치는 `shot-042251` 실측(카드 높이 11.87%H · 피치 13.66%H — 두 값 모두
 * `probe-dungeons-px` 의 원본 스캔이 낸 값이고, 원본 PNG 는 아트가 안 바뀌므로 재사용해도 안전하다).
 *
 * 사용: node tools/probe-dungeons-pitch-dom.js
 */
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TOL = 2;                        // ±2%p
const REF = { pitch: 13.66, height: 11.87 };   // 원본 shot-042251 실측(%H)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(INDEX, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await p.evaluate(SC.SEED_SRC);
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    await p.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; });
    await p.waitForTimeout(500);
    await p.evaluate(() => {
        try { Dungeons.ensure(); for (const d of Dungeons.DEFS) { S.dungeons.best[d.id] = 198; S.dungeons.keys[d.id] = 2; } } catch (e) { }
        UI.openDungeons();
    });
    await p.waitForTimeout(400);
    await p.evaluate(() => document.fonts && document.fonts.ready);

    const m = await p.evaluate(() => {
        const app = document.getElementById('app');
        const AH = app.getBoundingClientRect().height;
        const cards = [...document.querySelectorAll('.dg-banner')]
            .filter(e => e.offsetParent !== null)
            .map(e => { const r = e.getBoundingClientRect(); return { top: r.top, h: r.height }; })
            .sort((a, b) => a.top - b.top);
        return { AH, cards };
    });

    if (m.cards.length < 2) { console.error(`측정기 고장 — 보이는 던전 카드가 ${m.cards.length}장이다(4장이어야 한다)`); await browser.close(); process.exit(2); }

    const pitches = m.cards.slice(1).map((c, i) => c.top - m.cards[i].top);
    const spread = Math.max(...pitches) - Math.min(...pitches);
    if (spread > 1.5) { console.error(`측정기 고장 — 카드 피치가 장마다 다르다(${pitches.map(v => v.toFixed(1)).join(' / ')}px). 균일 그리드 전제가 깨졌다`); await browser.close(); process.exit(2); }

    const pitch = 100 * pitches.reduce((a, b) => a + b, 0) / pitches.length / m.AH;
    const height = 100 * m.cards.reduce((a, c) => a + c.h, 0) / m.cards.length / m.AH;
    const rows = [
        ['카드 피치', pitch, REF.pitch],
        ['카드 높이', height, REF.height],
    ];
    console.log(`던전 카드 DOM 실측 — 앱 세로 ${m.AH.toFixed(1)}px · 카드 ${m.cards.length}장 · 화소 추정기와 무관`);
    console.log('');
    console.log('요소        단위     원본      클론     Δ%p  판정');
    let bad = 0;
    for (const [name, cl, ref] of rows) {
        const d = cl - ref;
        const ok = Math.abs(d) <= TOL;
        if (!ok) bad++;
        console.log(`${name.padEnd(10)}  %H  ${ref.toFixed(2).padStart(7)}  ${cl.toFixed(2).padStart(7)}  ${(d >= 0 ? '+' : '') + d.toFixed(2).padStart(6)}  ${ok ? 'ok' : '← 불통과'}`);
    }
    console.log(`\n카드 사이 여백 = 피치 − 높이 = ${(pitch - height).toFixed(2)}%H (원본 ${(REF.pitch - REF.height).toFixed(2)}%H)`);
    console.log(`\n${bad ? `FAIL — 초과 ${bad}건` : 'PASS — 전 축 ±2%p'}${errs.length ? ` · 콘솔 에러 ${errs.length}건` : ' · 콘솔 에러 0건'}`);
    await browser.close();
    process.exit(bad || errs.length ? 1 : 0);
})();
