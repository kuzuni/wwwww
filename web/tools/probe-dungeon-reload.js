// 던전 진행이 새로고침을 견디는가 (slug: dungeon-run-lost-on-reload, 2026-08-19 QA 18차 등재).
//
// 종전: `Dungeons.run` 이 **모듈 필드**라 `saveGame()`(=`JSON.stringify(S)`)에 애초에 안 담겼다.
//   `enter()` 가 바로 뒤에서 `saveGame()` 을 부르는데도 새로고침하면 진행이 **아무 안내 없이**
//   사라지고 상단 라벨이 본대("쉬움 1-1")로 돌아갔다. 다른 진행 상태(제작 대기품·보류 카드·
//   부화 타이머·기술 연구·자동 제련 ON)는 전부 견디는데 이것만 튀었다.
//
// 재는 것:
//  ① 입장 직후 세이브에 진행이 남는가 (`S.dungeonRun`)
//  ② 새로고침 뒤 진행이 이어지는가 — `Dungeons.run` 이 같은 던전·같은 단계이고 상단 라벨이 던전 라벨
//  ③ 열쇠가 그대로인가 (열쇠는 클리어 시점 소모 — 새로고침으로 새면 안 된다)
//  ④ **손상된 진행 상태는 조용히 사라지지 않는다** — 못 쓰는 `dungeonRun` 을 심어 두면 본대로
//     돌려보내되 **안내 토스트**가 뜬다(이 항목이 고치려던 게 '조용함' 그 자체다)
//
// ⚠️ 세이브를 심는 사례(④)는 `addInitScript` 로 심는다 — `goto` 뒤에 심고 `reload()` 하면
//    떠나는 페이지의 자동 저장이 덮어쓴다(저장소 계측 함정 ⓐ).
// 사용: node probe-dungeon-reload.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const KEY = 'forgeclone_save_v1';

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };

    // ---------- ①②③ 정상 진행이 새로고침을 견딘다 ----------
    {
        const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
        const perrs = [];
        page.on('pageerror', e => perrs.push(String(e)));
        await page.goto(INDEX, { waitUntil: 'load' });
        await waitBootDone(page, { timeout: 180000 });
        await page.waitForTimeout(400);

        const before = await page.evaluate(() => {
            if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
            S.bestChapter = 5; S.bestStage = 9;          // 던전 해금 조건 충족
            Dungeons.ensure();
            S.dungeons.keys.hammer = 2;
            Dungeons.enter('hammer', 1);
            return {
                entered: !!Dungeons.run && Dungeons.run.id,
                stage: Dungeons.run && Dungeons.run.stage,
                keys: S.dungeons.keys.hammer,
                // 세이브에 실제로 담기는가 — 이 항목의 뿌리다
                inSave: (() => { try { return !!JSON.parse(localStorage.getItem('forgeclone_save_v1')).dungeonRun; } catch (e) { return false; } })(),
                label: (document.getElementById('stage-label') || {}).textContent || '',
            };
        });
        ok(before.entered === 'hammer', `① 던전 입장이 안 됐다 (${before.entered})`);
        ok(before.inSave, '① 입장 직후 세이브에 진행(dungeonRun)이 안 담겼다 — 새로고침을 견딜 수 없다');

        await page.reload({ waitUntil: 'load' });
        await waitBootDone(page, { timeout: 180000 });
        await page.waitForTimeout(800);
        const after = await page.evaluate(() => ({
            id: Dungeons.run && Dungeons.run.id,
            stage: Dungeons.run && Dungeons.run.stage,
            waves: Dungeons.run && Dungeons.run.waves,
            keys: (S.dungeons && S.dungeons.keys || {}).hammer,
            label: (document.getElementById('stage-label') || {}).textContent || '',
            toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | '),
        }));
        ok(after.id === 'hammer', `② 새로고침 뒤 던전 진행이 사라졌다 (Dungeons.run=${JSON.stringify(after.id)})`);
        ok(after.stage === before.stage, `② 새로고침 뒤 단계가 달라졌다 (${before.stage} → ${after.stage})`);
        ok(Number.isFinite(after.waves) && after.waves >= 1, `② 웨이브 수가 복원되지 않았다 (${after.waves})`);
        ok(after.label.includes('망치 도둑'), `② 상단 라벨이 던전을 잇지 않는다 ("${after.label}")`);
        ok(after.keys === before.keys, `③ 새로고침으로 열쇠가 샜다 (${before.keys} → ${after.keys})`);
        ok(!perrs.length, `pageerror ${perrs.length}건: ${perrs.slice(0, 2).join(' | ')}`);
        console.log(`①②③ 입장 "${before.label.trim()}" → 새로고침 → "${after.label.trim()}" · run=${after.id}@${after.stage} (웨이브 ${after.waves}) · 열쇠 ${before.keys}→${after.keys} · 세이브적재 ${before.inSave}`);
        await page.close();
    }

    // ---------- ④ 손상된 진행 상태는 안내를 남기고 본대로 ----------
    {
        const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
        const perrs = [];
        page.on('pageerror', e => perrs.push(String(e)));
        await page.addInitScript(([k, v]) => {
            try { localStorage.setItem(k, v); } catch (e) {}
            // ⚠️ **토스트를 폴링으로 잡으면 안 된다** — 이 안내는 로딩 오버레이가 걷히기 **전에**
            //    뜨고 2.6초 만에 스스로 사라진다. `waitBootDone` 이 250ms 간격 폴링이라 그 사이에
            //    떴다 사라지면 '조용하다'로 잘못 읽힌다(실측으로 간헐 FAIL 이 났다).
            //    그래서 페이지 스크립트보다 먼저 관찰자를 심어 **뜬 적이 있는가**를 기록한다.
            window.__toastLog = [];
            const start = () => new MutationObserver(ms => {
                for (const m of ms) for (const n of m.addedNodes) {
                    if (n.nodeType === 1 && n.classList && n.classList.contains('toast')) window.__toastLog.push(n.textContent);
                }
            }).observe(document.documentElement, { childList: true, subtree: true });
            if (document.documentElement) start();
            else document.addEventListener('readystatechange', start, { once: true });
        }, [KEY, JSON.stringify({ version: 1, dungeonRun: { id: 'nope', stage: 3, waves: 2 } })]);
        await page.goto(INDEX, { waitUntil: 'load' });
        await waitBootDone(page, { timeout: 180000 });
        // 관찰자가 부팅 내내 기록한 토스트를 본다(지금 화면에 남아 있는지와 무관하다).
        let seen = '';
        for (let i = 0; i < 40 && !/복귀|나와/.test(seen); i++) {
            seen = await page.evaluate(() => (window.__toastLog || []).join(' | '));
            if (/복귀|나와/.test(seen)) break;
            await page.waitForTimeout(200);
        }
        const bad = await page.evaluate(() => ({ run: Dungeons.run }));
        bad.toasts = seen;
        ok(!bad.run, `④ 못 쓰는 진행 상태가 그대로 남았다 (${JSON.stringify(bad.run)})`);
        ok(/복귀|나와/.test(bad.toasts), `④ 조용히 사라졌다 — 복귀 안내가 없다 (토스트: "${bad.toasts}")`);
        ok(!perrs.length, `④ pageerror ${perrs.length}건: ${perrs.slice(0, 2).join(' | ')}`);
        console.log(`④ 손상 진행 상태 → run=${JSON.stringify(bad.run)} · 토스트 "${bad.toasts}"`);
        await page.close();
    }

    await browser.close();
    if (fails.length) { console.log('\nFAIL\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('\nPASS — 던전 진행이 새로고침을 견딘다');
})();
