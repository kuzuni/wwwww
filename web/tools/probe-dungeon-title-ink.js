/* 던전 배너 제목 가독 + 일러스트 가시성 판정 (`dungeon-row-quality`).
 *
 * 왜 새 프로브인가 — 종전 판정은 **제목을 감추고 그 자리 배경 평균색 대 흰 글자**로 대비를 쟀다.
 * 그 계측은 외곽선(키라인) 있는 글자에는 맞지 않는다: 글리프가 실제로 맞닿는 이웃 픽셀은 배경이
 * 아니라 **순검정 키라인**이라 눈이 읽는 대비는 21:1 인데, 배경 평균으로 재면 1.98:1 로 나온다.
 * 그 과소평가가 `.dg-banner::before` 스크림을 .86 까지 끌어올렸고, 카드 왼쪽 절반이 통째로 검게
 * 죽어 사용자 지시("던전 행마다 던전 썸네일처럼")의 그림이 사라졌다.
 *
 * 그래서 두 가지를 대신 잰다.
 *   ① 키라인 실재 — 제목 글자 상자 안 **최암(最暗) 픽셀**이 충분히 어두운가(외곽선이 있는가).
 *      흰 글리프(≈255)와의 대비비로 환산해 4.5:1 이상을 요구한다.
 *   ② 일러스트 가시성 — 카드 **왼쪽 절반**의 평균 휘도가 바닥(≒검정)이 아닌가.
 *      스크림이 다시 짙어지면 여기서 걸린다.
 *
 * 사용: node tools/probe-dungeon-title-ink.js
 */
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const MIN_RATIO = 4.5;    // 글리프 대 키라인 대비 하한(WCAG AA 본문 기준과 같은 값)
const MIN_LEFT_L = 26;    // 카드 왼쪽 절반 평균 휘도 하한(0~255). 스크림이 그림을 죽이면 여기서 FAIL

(async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    p.on('pageerror', e => errs.push('PAGEERROR ' + e));
    await p.goto(INDEX, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await p.evaluate(SC.SEED_SRC);
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    await p.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; UI.toast = () => { }; });
    await p.waitForTimeout(600);
    await p.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        UI.openDungeons();
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('opening'));
    });
    await p.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    await p.waitForTimeout(400);

    // 배너·제목의 CSS 픽셀 사각형을 DOM 에서 받아 온다(캡처는 deviceScaleFactor 2 배).
    const rects = await p.evaluate(() => [...document.querySelectorAll('.dg-banner')].map(el => {
        const t = el.querySelector('.item-name');
        const r = el.getBoundingClientRect(), q = t.getBoundingClientRect();
        return { name: t.textContent.trim(), card: [r.x, r.y, r.width, r.height], title: [q.x, q.y, q.width, q.height] };
    }));
    const shot = await p.screenshot({ timeout: 180000 });

    const res = await p.evaluate(async ({ b64, rects, DSF }) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        // 상대 휘도(WCAG) — 대비비 계산용
        const rel = (r, gg, bb) => {
            const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(bb);
        };
        return rects.map(o => {
            const [tx, ty, tw, th] = o.title.map(v => Math.round(v * DSF));
            const d = g.getImageData(tx, ty, Math.max(1, tw), Math.max(1, th)).data;
            let lo = 1, hi = 0;
            for (let i = 0; i < d.length; i += 4) {
                const L = rel(d[i], d[i + 1], d[i + 2]);
                if (L < lo) lo = L;
                if (L > hi) hi = L;
            }
            const ratio = (hi + 0.05) / (lo + 0.05);
            // 카드 왼쪽 절반 평균 휘도(0~255) — 그림이 스크림에 죽었는지
            const [cx, cy, cw, ch] = o.card.map(v => Math.round(v * DSF));
            const e = g.getImageData(cx, cy, Math.max(1, Math.round(cw / 2)), Math.max(1, ch)).data;
            let sum = 0, n = 0;
            for (let i = 0; i < e.length; i += 4) { sum += (e[i] + e[i + 1] + e[i + 2]) / 3; n++; }
            return { name: o.name, ratio, leftL: sum / n };
        });
    }, { b64: shot.toString('base64'), rects, DSF: 2 });

    console.log('\n던전 배너 제목 키라인 대비 + 일러스트 가시성\n');
    console.log('행'.padEnd(12), '글리프:키라인'.padStart(14), '왼쪽절반 평균휘도'.padStart(18), '  판정');
    let fail = 0;
    for (const r of res) {
        const ok = r.ratio >= MIN_RATIO && r.leftL >= MIN_LEFT_L;
        if (!ok) fail++;
        console.log(r.name.padEnd(12), (r.ratio.toFixed(2) + ':1').padStart(14), r.leftL.toFixed(1).padStart(18), '  ' + (ok ? 'ok' : 'FAIL'));
    }
    console.log(`\n기준: 대비 ≥ ${MIN_RATIO}:1 · 왼쪽절반 평균휘도 ≥ ${MIN_LEFT_L}`);
    console.log('판정:', fail ? `실패 ${fail}건` : '통과');
    console.log(`(콘솔 에러 ${errs.length}건)`, errs.slice(0, 5));
    await b.close();
    process.exit(fail || errs.length ? 1 : 0);
})();
