// 밝은 프레임 위 아이콘 대비 실측 — `icon-gen` 재채점 지적 ① '밝은 프레임 대비'.
//
// 지적 원문(TODO icon-gen 1차 재채점, 2026-08-17): "밝은 회색 pill(#c9c9c9)·소환 버튼(#c0c0c0)에서
// 알·물약·해머·티켓의 **휘도차가 부족**(평균Δ **21.8~29.3**, 목표 **≥40**)."
//
// ⚠️ 이 도구는 **재기만 한다**. 지적이 아직 사실인지부터 확인하는 용도다 — 이 저장소는 낡은 지적을
//    좇아 멀쩡한 값을 건드린 사고가 반복됐다(TODO '비평가 채점 함정').
//
// 재는 법: 화면을 돌며 `.ico` 중 **밝은 바탕 위에 앉은 것**만 고른다(프레임 배경 휘도 ≥150).
//   그 아이콘 상자를 캡처해 ⓐ 아이콘 잉크 평균 휘도 ⓑ 프레임 바탕 평균 휘도 를 재고 Δ 를 낸다.
//   🚨 **잉크/바탕 가르기를 퍼센타일로 하지 않는다** — 아이콘마다 잉크 면적이 달라 고정 퍼센타일은
//      바탕을 잉크로 집는다(같은 함정을 `check-sr-ok-gold` 에서 실제로 밟았다). **Otsu 이진화**로
//      문턱을 데이터가 정하게 하고, 어두운 무리를 잉크로 본다.
//   🚨 아이콘 상자에는 **투명 여백**이 있다(`background-size: contain`). 투명 화소는 바탕으로 잡히므로
//      바탕 표본이 프레임 색과 같아지는 게 정상이다 — 그래서 바탕은 **프레임 요소에서 따로** 잰다.
//
// 사용: node probe-icon-light-frame.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const LIGHT = 150;    // 이 휘도 이상이면 '밝은 프레임'
const TARGET = 40;    // 지적이 제시한 목표 Δ

const SCREENS = [
    { key: 'main', open: () => { UI.switchTab(null); } },
    { key: 'skills', open: () => { UI.onTabClick('summon'); UI.switchSummonSub('skills'); } },
    { key: 'pets', open: () => { UI.onTabClick('summon'); UI.switchSummonSub('pets'); } },
    { key: 'mounts', open: () => { UI.switchTab(null); UI.openMounts(); } },
    { key: 'shop', open: () => { UI.onTabClick('shop'); } },
    { key: 'quests', open: () => { UI.onTabClick('quest'); } },
    { key: 'dungeon', open: () => { UI.onTabClick('dungeon'); } },
];

const lumOf = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 120)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text().slice(0, 120)); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitBootDone(page, { timeout: 180000 });
    await page.evaluate(() => {
        S.gems = 999999; S.coins = 1e9; S.hammers = 99999; S.tickets = 9999;
        S.eggCurrency = 9999; S.winders = 9999; S.potions = 9999;
    });

    const found = [];
    for (const sc of SCREENS) {
        try { await page.evaluate(`(${sc.open.toString()})()`); } catch (e) { continue; }
        await page.waitForTimeout(450);
        // 밝은 프레임 위 아이콘 후보를 DOM 에서 고른다
        const cands = await page.evaluate((LIGHT) => {
            const parse = (c) => { const m = (c || '').match(/(\d+(?:\.\d+)?)/g); return m && m.length >= 3 ? [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1] : null; };
            const out = [];
            for (const el of document.querySelectorAll('.ico')) {
                const r = el.getBoundingClientRect();
                if (r.width < 6 || r.height < 6) continue;
                // ⚠️ 뷰포트 밖(스크롤로 내려간 것)은 캡처가 통째로 터진다
                //    ("Clipped area is either empty or outside the resulting image") — 먼저 걸러낸다.
                if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) continue;
                // 🚨 **가려진 아이콘을 재면 통째로 헛수치가 된다.** 팝업이 열린 화면(mounts·dungeon)에서는
                //    뒤 패널의 아이콘이 딤에 덮여 있는데 `getComputedStyle` 은 그 밑 요소의 배경색을
                //    그대로 알려 준다 — 그래서 캡처(딤 화소)와 바탕색(원래 색)이 어긋나 **Δ 가 음수**로
                //    나온다. 실제로 같은 `lock / btn sm disabled` 이 화면에 따라 −49.4 와 +168.4 로
                //    갈렸다. 아이콘 중심의 히트테스트로 **정말 맨 위에 보이는 것만** 남긴다.
                const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const top = document.elementFromPoint(cx, cy);
                if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
                let bg = null, host = null;
                for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                    const c = parse(getComputedStyle(a).backgroundColor);
                    if (c && c[3] > 0.5) { bg = c; host = a; break; }
                }
                if (!bg) continue;
                const L = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
                if (L < LIGHT) continue;
                const name = ([...el.classList].find(c => c.startsWith('ico-')) || 'ico').replace('ico-', '');
                out.push({
                    name, hostCls: (host.className || host.tagName).toString().slice(0, 28),
                    bg: [bg[0], bg[1], bg[2]], bgL: +L.toFixed(1),
                    x: r.x, y: r.y, w: r.width, h: r.height,
                });
            }
            return out;
        }, LIGHT);

        if (!cands.length) continue;
        // ⚡ 아이콘마다 `page.screenshot` 을 부르면 왕복이 수백 번이라 몇 분이 지나도 안 끝난다
        //    (첫 판이 그렇게 매달렸다). **화면당 캡처 한 장**을 떠서 페이지 안에서 전부 잘라 낸다.
        const shot = await page.screenshot();
        const metrics = await page.evaluate(async ({ b64, boxes }) => {
            const img = new Image();
            await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
            const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
            const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
            const sx = img.width / innerWidth, sy = img.height / innerHeight;   // deviceScaleFactor 보정
            const out = [];
            for (const b of boxes) {
                const x = Math.round(b.x * sx), y = Math.round(b.y * sy);
                const w = Math.max(1, Math.round(b.w * sx)), h = Math.max(1, Math.round(b.h * sy));
                if (x < 0 || y < 0 || x + w > cv.width || y + h > cv.height) { out.push(null); continue; }
                const d = g.getImageData(x, y, w, h).data;
                const lums = [];
                for (let i = 0; i < d.length; i += 4) lums.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
                // Otsu — 잉크(어두운 무리)와 바탕(밝은 무리)을 데이터가 가르게 한다
                const hist = new Array(256).fill(0);
                for (const v of lums) hist[Math.min(255, Math.round(v))]++;
                const total = lums.length;
                let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
                let sumB = 0, wB = 0, best = -1, thr = 128;
                for (let t = 0; t < 256; t++) {
                    wB += hist[t]; if (!wB) continue;
                    const wF = total - wB; if (!wF) break;
                    sumB += t * hist[t];
                    const between = wB * wF * Math.pow(sumB / wB - (sum - sumB) / wF, 2);
                    if (between > best) { best = between; thr = t; }
                }
                // 🚨 **어두운 무리를 잉크로 놓고 `바탕−잉크` 를 재면 안 된다** — 아이콘이 프레임보다
                //    **밝은** 경우(은색 태엽이 회색 버튼 위)에 Δ 가 음수로 나와 **잘 보이는 아이콘이
                //    불통과로 잡힌다**(실측: winder Δ −83.4 = 실제로는 83 만큼 또렷하다).
                //    지적이 말한 '휘도차'는 **방향이 없는 크기**다. 그래서 프레임 휘도에서 얼마나
                //    떨어졌는지(|편차|)로 재고, 그 편차의 **상위 25% 평균**(획의 몸통)을 대표값으로 쓴다.
                //    평균 전체를 쓰면 투명 여백(=프레임 색 그대로)이 분모를 채워 어떤 아이콘도 못 넘는다.
                const dev = lums.map(v => Math.abs(v - b.bgL)).sort((p, q) => q - p);
                const topN = Math.max(1, Math.round(dev.length * 0.25));
                const core = dev.slice(0, topN).reduce((a, b2) => a + b2, 0) / topN;
                const strong = dev.filter(v => v >= 40).length;
                const ink = lums.filter(v => v <= thr);
                out.push({
                    dev: core,
                    strongPct: +(strong / total * 100).toFixed(1),
                    inkL: ink.length ? ink.reduce((a, b2) => a + b2, 0) / ink.length : 0,
                    inkPct: +(ink.length / total * 100).toFixed(1),
                });
            }
            return out;
        }, { b64: shot.toString('base64'), boxes: cands.map(c => ({ x: c.x, y: c.y, w: c.w, h: c.h, bgL: c.bgL })) });

        cands.forEach((c, i) => {
            const m = metrics[i];
            if (!m) return;
            found.push({ screen: sc.key, name: c.name, hostCls: c.hostCls, bgL: c.bgL, d: +m.dev.toFixed(1), strongPct: m.strongPct, inkPct: m.inkPct, w: +c.w.toFixed(1) });
        });
    }
    await browser.close();

    if (!found.length) {
        console.log(`밝은 프레임(휘도 ≥${LIGHT}) 위 아이콘을 못 찾았다 — 지적의 표면이 화면에서 사라졌을 수 있다.`);
        console.log(`콘솔 에러 ${errors.length}건`);
        process.exit(errors.length ? 1 : 0);
    }
    // 같은 (화면·이름·프레임) 중복은 접는다
    const seen = new Set(), rows = [];
    for (const f of found) { const k = `${f.screen}|${f.name}|${f.hostCls}`; if (seen.has(k)) continue; seen.add(k); rows.push(f); }
    rows.sort((a, b) => a.d - b.d);

    console.log(`밝은 프레임(휘도 ≥${LIGHT}) 위 아이콘 ${found.length}개 / 자리 ${rows.length}곳 · 목표 |Δ| ≥${TARGET}`);
    console.log(`Δ = 프레임 휘도에서 벗어난 정도의 **상위 25% 평균**(방향 무시 — 밝은 아이콘도 또렷하면 통과)`);
    console.log(`강한% = |편차| ≥40 인 화소 비율 (아이콘이 프레임에서 확실히 떨어져 나온 몫)\n`);
    console.log(`     Δ   바탕L   강한%  잉크%   폭    화면      아이콘 / 프레임`);
    for (const r of rows) {
        const mark = r.d < TARGET ? '❌' : '  ';
        console.log(`${mark}${String(r.d).padStart(6)} ${String(r.bgL).padStart(6)} ${String(r.strongPct).padStart(6)} ${String(r.inkPct).padStart(6)} ${String(r.w).padStart(6)}   ${r.screen.padEnd(8)} ${r.name} / ${r.hostCls}`);
    }
    const bad = rows.filter(r => r.d < TARGET);
    const avg = rows.reduce((a, b) => a + b.d, 0) / rows.length;
    console.log(`\n평균 Δ ${avg.toFixed(1)} · 최저 ${rows[0].d} · 목표 미달 ${bad.length}/${rows.length}자리 · 콘솔 에러 ${errors.length}건`);
    for (const e of errors.slice(0, 5)) console.log('  ' + e);

    const fail = bad.length > 0 || errors.length > 0;
    console.log(fail ? `\n❌ FAIL — 밝은 프레임 위에서 대비가 목표(|Δ|${TARGET})에 못 미치는 아이콘이 있다` : `\n✅ PASS — 밝은 프레임 위 아이콘이 전부 |Δ| ${TARGET} 이상`);
    process.exit(fail ? 1 : 0);
})();
