// UI 아이콘이 '마인크래프트식 블록'인지를 **수치로** 판정한다 (slug `ui-icon-blockify`).
//
// 왜 판정기를 따로 두는가: 블록 화법은 `IconGen.url()` 한 곳(`_blockify`)이 150여 종에 동시에
// 건다. 그 말은 **누가 그 한 줄을 되돌리면 150종이 한꺼번에 옛 매끈 화법으로 조용히 돌아간다**는
// 뜻이다. 눈검사 시트(`shot-icons-block.js`)는 사람이 봐야 알지만, 이 자는 exit 코드로 끊는다.
//
// 재는 것 — '블록다움'을 셋으로 쪼갠다:
//   ① **칸 격자 정합**: 출력 PNG 를 PX×PX 블록으로 잘랐을 때 블록 안 픽셀이 전부 같은 색인가.
//      최근접 확대로 되박았으면 **정확히 100%** 다. 매끈 화법(보간 축소)은 여기서 즉시 무너진다.
//   ② **각진 알파**: 알파가 0 아니면 255 뿐인가. 반투명이 섞이면 경계가 부드러워져 블록이 아니다.
//   ③ **제한 팔레트**: 불투명 화소의 서로 다른 색 수가 상한 이하인가. 그라디언트는 수백 색을 낸다.
//
// 🚨 **음성 대조가 이 자의 핵심이다.** 세 지표 모두 '블록이면 자동으로 좋아지는' 값이라, 자가 진짜
//    화법을 보는지 아니면 아무 그림에나 통과를 주는지 알 수 없다. 그래서 같은 아이콘을 **블록화를
//    끈 옛 경로**로도 굽고, 그쪽이 **떨어지는 것**까지 확인해야 통과다(TODO '함정 ④⑶' 대비 —
//    지표가 대상과 무관하게 움직이면 판정 전부가 무효다).
//
// 사용: node probe-icon-blockify.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const ICONGEN = path.resolve(__dirname, '../js/icongen.js');

/* 아이콘 한 종의 서로 다른 색 수 상한. 실측(2026-08-25) 평균 9.8색 · 최대 23색(shop_tech)이라
   1.4배 여유로 32 를 잡았다. 옛 매끈 화법은 평균 **957색** 이라 이 선 근처에도 못 온다 —
   즉 이 상한은 '조금 줄었나'가 아니라 **화법이 바뀌었나**를 가르는 자리에 놓여 있다. */
const PALETTE_CAP = 32;
const GRID_GATE = 100;       // 칸 격자 정합 %. 최근접 확대라 정확히 100 이라야 한다
const ALPHA_GATE = 100;      // 각진 알파 %

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    await page.addScriptTag({ content: fs.readFileSync(ICONGEN, 'utf8') });

    // 페이지 안에서 도는 측정기. `blockOff` 면 블록화를 건너뛰는 옛 경로로 굽는다(음성 대조).
    const measure = async (blockOff) => page.evaluate(async (off) => {
        const wait = (u) => new Promise((res, rej) => {
            const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u;
        });
        const PX = IconGen.BLOCK.PX;
        const names = Object.keys(IconGen.draw).filter((n) => !IconGen._blockSkip(n));
        if (off) { IconGen._blockSkipReal = IconGen._blockSkip; IconGen._blockSkip = () => true; }
        IconGen.cache = {};                       // 화법을 바꿔 다시 구우려면 캐시를 비워야 한다
        const rows = [];
        for (const n of names) {
            const u = IconGen.url(n);
            if (!u) continue;
            const im = await wait(u);
            const cv = document.createElement('canvas');
            cv.width = im.naturalWidth; cv.height = im.naturalHeight;
            const c = cv.getContext('2d');
            c.imageSmoothingEnabled = false;
            c.drawImage(im, 0, 0);
            const d = c.getImageData(0, 0, cv.width, cv.height).data;
            const key = (i) => d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3];
            // ① 칸 격자 정합 — PX 로 안 떨어지면 그 자체가 실패(칸이 널뛴다는 뜻)
            const gx = Math.floor(cv.width / PX), gy = Math.floor(cv.height / PX);
            let blocks = 0, uni = 0;
            if (gx * PX === cv.width && gy * PX === cv.height) {
                for (let by = 0; by < gy; by++) for (let bx = 0; bx < gx; bx++) {
                    blocks++;
                    const k0 = key(((by * PX) * cv.width + bx * PX) * 4);
                    let same = true;
                    for (let y = 0; y < PX && same; y++) for (let x = 0; x < PX; x++) {
                        if (key((((by * PX + y) * cv.width) + bx * PX + x) * 4) !== k0) { same = false; break; }
                    }
                    if (same) uni++;
                }
            }
            // ②③ 각진 알파 · 제한 팔레트
            let px = 0, hard = 0; const pal = new Set();
            for (let i = 0; i < d.length; i += 4) {
                px++;
                const a = d[i + 3];
                if (a === 0 || a === 255) hard++;
                if (a === 255) pal.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
            }
            rows.push({
                n, w: cv.width, h: cv.height,
                grid: blocks ? (uni * 100) / blocks : 0,
                alpha: (hard * 100) / px,
                pal: pal.size,
            });
        }
        if (off) IconGen._blockSkip = IconGen._blockSkipReal;
        return rows;
    }, blockOff);

    const rows = await measure(false);
    const neg = await measure(true);
    await browser.close();

    const worstGrid = rows.reduce((a, b) => (b.grid < a.grid ? b : a), rows[0]);
    const worstAlpha = rows.reduce((a, b) => (b.alpha < a.alpha ? b : a), rows[0]);
    const worstPal = rows.reduce((a, b) => (b.pal > a.pal ? b : a), rows[0]);
    const badGrid = rows.filter((r) => r.grid < GRID_GATE);
    const badAlpha = rows.filter((r) => r.alpha < ALPHA_GATE);
    const badPal = rows.filter((r) => r.pal > PALETTE_CAP);

    const avg = (k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length);
    const navg = (k) => (neg.reduce((s, r) => s + r[k], 0) / neg.length);

    console.log(`대상 ${rows.length}종 (BLOCK_SKIP 제외) · 칸 ${'PX'}=8`);
    console.log(`① 칸 격자 정합  평균 ${avg('grid').toFixed(2)}%  최저 ${worstGrid.grid.toFixed(2)}% (${worstGrid.n})   게이트 ${GRID_GATE}%`);
    console.log(`② 각진 알파     평균 ${avg('alpha').toFixed(2)}%  최저 ${worstAlpha.alpha.toFixed(2)}% (${worstAlpha.n})   게이트 ${ALPHA_GATE}%`);
    console.log(`③ 제한 팔레트   평균 ${avg('pal').toFixed(1)}색  최대 ${worstPal.pal}색 (${worstPal.n})   상한 ${PALETTE_CAP}색`);
    console.log(`\n음성 대조(블록화 끈 옛 매끈 경로) — 격자 ${navg('grid').toFixed(2)}% · 알파 ${navg('alpha').toFixed(2)}% · 팔레트 평균 ${navg('pal').toFixed(0)}색`);
    const negFails = navg('grid') < GRID_GATE && navg('pal') > PALETTE_CAP;
    console.log(`  → ${negFails ? '떨어졌다 = 이 자는 블록 화법을 본다 ✔' : '🚨 옛 경로도 통과했다 = 이 자는 아무거나 통과시킨다(판정 무효)'}`);

    for (const r of badGrid.slice(0, 8)) console.log(`  ❌ 격자 ${r.n} ${r.grid.toFixed(2)}% (${r.w}×${r.h})`);
    for (const r of badAlpha.slice(0, 8)) console.log(`  ❌ 알파 ${r.n} ${r.alpha.toFixed(2)}%`);
    for (const r of badPal.slice(0, 8)) console.log(`  ❌ 팔레트 ${r.n} ${r.pal}색`);
    if (errs.length) console.log('콘솔 에러', errs.slice(0, 5));

    const ok = !badGrid.length && !badAlpha.length && !badPal.length && negFails && !errs.length;
    console.log(ok ? '\n✅ PASS — 아이콘 전종이 블록 화법(칸 정합·각진 알파·제한 팔레트)'
        : `\n❌ FAIL — 격자 ${badGrid.length} · 알파 ${badAlpha.length} · 팔레트 ${badPal.length} · 음성대조 ${negFails ? 'OK' : '깨짐'}`);
    process.exit(ok ? 0 : 1);
})();
