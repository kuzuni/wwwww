// 전 화면 생이모지 전수 조사 — `icon-gen` 이 어디까지 왔고 무엇이 남았는지 **화면 기준**으로 센다.
//
// 왜 필요한가: 남은 이모지를 소스에서 grep 하면 **렌더되지 않는 데이터 폴백까지 같이 잡혀**
// 실제보다 훨씬 많아 보이고(앞 세션들이 이걸로 여러 번 헛돌았다), 반대로 문자열 조립으로 들어가는
// 자리는 grep 에 안 잡힌다. 그래서 화면을 실제로 열어 **텍스트 노드에 남은 이모지**만 센다.
//
// 이 도구는 게이트가 아니라 **현황판**이다(exit 0 고정, `--strict` 를 주면 0건을 요구한다).
// 화면 목록·오프너·시드는 `shot-screens.js` 를 그대로 쓴다.
//
// 사용: node probe-emoji-sweep.js [--strict]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const STRICT = process.argv.includes('--strict');

const SRC = fs.readFileSync(path.join(__dirname, 'shot-screens.js'), 'utf8');
const SCREENS = [...SRC.matchAll(/^\s*\['([\w-]+)',\s*(?:'[\d]+'|null),\s*(`[^`]*`|[A-Z_][\w]*)\],/gm)].map(m => {
    const raw = m[2];
    if (raw[0] === '`') return [m[1], raw.slice(1, -1)];
    const req = SRC.match(new RegExp(`const\\s*\\{[^}]*\\b${raw}\\b[^}]*\\}\\s*=\\s*require\\('([^']+)'\\)`));
    const val = req && require(req[1])[raw];
    if (typeof val !== 'string') throw new Error(`오프너 상수 ${raw} 를 못 풀었다 — 화면이 조용히 빠진다`);
    return [m[1], val];
});

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 497, height: 897 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 150000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; });
    await page.evaluate(() => {
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => {}; UI.resolvePendingCraft = () => {}; UI.autoSeqStep = () => {};
    });
    const seedAt = SRC.indexOf('const SEED = () => {');
    const seedSrc = SRC.slice(seedAt + 'const SEED = '.length, SRC.indexOf('\n};', seedAt) + 2);
    await page.evaluate(s => { try { eval('(' + s + ')()'); } catch (e) {} }, seedSrc);

    const found = new Map();   // 이모지 → { count, screens:Set, sample }
    let screensSeen = 0;
    for (const [name, opener] of SCREENS) {
        // 🚨 **화면을 여는 것과 세는 것을 같은 evaluate 안에서 하지 말 것** (2026-08-19 규명).
        //    탈것·펫 얼굴(`.mt-face`)은 **이모지를 먼저 깔고 다음 프레임에 3D 썸네일로 갈아치운다**
        //    (`UI.creatureFace`/`hydrateMountThumbs` — 첫 썸네일 굽기가 무거워 동기로 못 한다).
        //    그 교체는 `requestAnimationFrame` 안에서 도는데, **한 evaluate 안에서 열고 바로 세면
        //    rAF 가 돌 틈이 없다** — 그래서 아직 안 구워진 얼굴이 전부 '남은 이모지'로 잡힌다.
        //    실측(고치기 전): 🐴🐾🦙🪲🫏🐑🐭 7종이 mounts·pets·player-info 에 남았다고 나왔는데,
        //    구워질 때까지 기다리면 **0종**이다. 사용자가 볼 일 없는 첫 프레임을 쫓고 있던 것이다.
        //    (스크롤 밖 셀을 세지 말라는 아래 함정과 같은 계열 — '사용자가 실제로 보는 것만 센다'.)
        const opened = await page.evaluate((src) => {
            try {
                UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();
                UI.closeDetail && UI.closeDetail();
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                eval(src);
            } catch (e) { return false; }
            return true;
        }, opener);
        if (!opened) continue;
        // 얼굴 하이드레이트가 끝날 때까지(또는 예산까지) 기다린다. 폴링은 노드 쪽에서 돈다 —
        // `waitForFunction` 은 swiftshader 포화 구간에서 아예 안 돌아간다(`wait-ready.js` 머리말).
        for (let i = 0; i < 40; i++) {
            const left = await page.evaluate(() => document.querySelectorAll('.mt-face[data-mt]:not(.has-thumb)').length);
            if (!left) break;
            await page.waitForTimeout(150);
        }
        const hits = await page.evaluate(() => {
            // 화면에 **실제로 보이는** 텍스트 노드만 본다 — hidden 안의 잔재도, 스크롤 밖도 사용자가 못 본다.
            const EMO = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;
            const out = [];
            const seen = new Set();
            const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let n;
            while ((n = walk.nextNode())) {
                const t = n.textContent;
                if (!t || !t.trim()) continue;
                const el = n.parentElement;
                if (!el || el.closest('.hidden')) continue;
                const r = el.getBoundingClientRect();
                if (r.width < 1 || r.height < 1) continue;     // 안 보이는 자리
                // 🚨 **스크롤 밖은 세면 안 된다.** '모든 장비의 목록'은 셀이 306개인데 이모지를 먼저
                //    깔고 **화면에 들어온 셀만** 3D 썸네일로 바꾼다(`hydrateForgeThumbs`, 뷰포트 지연).
                //    레이아웃 크기만 보면 스크롤 밖 294개가 전부 '남은 이모지'로 잡혀, 사용자가 볼 일
                //    없는 자리를 쫓게 된다. 실제로 이 함정 때문에 무기 16종이 할 일 목록에 잘못 올랐다.
                if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
                const m = t.match(EMO);
                if (!m) continue;
                for (const e of m) {
                    const key = e + '|' + (el.className || el.tagName);
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push({ emo: e, where: (el.className || el.tagName).toString().slice(0, 40), text: t.trim().slice(0, 28) });
                }
            }
            return out;
        });
        await page.waitForTimeout(100);
        if (hits === null) continue;
        screensSeen++;
        for (const h of hits) {
            const e = found.get(h.emo) || { count: 0, screens: new Set(), where: new Set(), sample: h.text };
            e.count++; e.screens.add(name); e.where.add(h.where);
            found.set(h.emo, e);
        }
    }

    const rows = [...found.entries()].sort((a, b) => b[1].screens.size - a[1].screens.size);
    console.log(`화면 ${screensSeen}개 훑음 — 화면에 보이는 생이모지 ${rows.length}종\n`);
    for (const [emo, e] of rows) {
        console.log(`  ${emo}  화면 ${e.screens.size}곳 [${[...e.screens].slice(0, 5).join(', ')}]`);
        console.log(`      자리: ${[...e.where].slice(0, 3).join(' | ')}   예: "${e.sample}"`);
    }
    if (!rows.length) console.log('  (없음 — 화면에 보이는 생이모지 0종)');
    if (errs.length) console.log(`\n⚠️ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);

    const fail = STRICT && rows.length;
    console.log(fail ? `\nFAIL — 생이모지 ${rows.length}종이 화면에 남아 있다`
        : `\n${rows.length ? '현황판' : 'PASS'} — 화면 ${screensSeen}개 · 생이모지 ${rows.length}종`);
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
