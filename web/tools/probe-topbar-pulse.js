// 수령 연출의 '도착 박동'이 상단 바를 앱 상자 밖으로 밀어내지 않는가
// (slug: topbar-pulse-overflow, 2026-08-19 QA 19차 등재).
//
// 무엇이 문제였나: `rewardBurst()` 의 도착 pill 탐색이 **코인·젬에서만** 성공한다. 그 외 재화
//   (해머·티켓·물약·깨진 알…)는 `pulseEl()` 이 **상단 바(`#topbar`)로 폴백**하는데, 상단 바는
//   앱 폭 전체를 차지하는 밴드라 `.rw-pulse` 의 `scale(1.26)` 을 걸면 좌우가 `#app{overflow:hidden}`
//   에 잘리고(430 → 541.8px · 좌우 각 55.9px) 아래로 전투 화면을 덮는다. 코인·젬은 pill 이 작은
//   알약이라 1.26배로도 안 잘려서 **이 폴백 경로만 눈에 안 띄었다.**
//
// 재는 것(뷰포트 3종):
//  ① pill 없는 재화(물약) 수령 → 박동 **정점에서** `#topbar` 가 `#app` 폭을 안 넘는가(이탈 ≤ 0.5px)
//  ② 같은 정점에서 상단 바 하단이 아래로 안 자라는가(전투 화면 침범 0)
//  ③ 대조군 — 코인 수령 시 `.pill.coin` 박동(`.rw-pulse`)은 **그대로 살아 있는가**
//     (`.rw-pulse` 의 scale 자체를 줄여 때우면 이쪽이 같이 죽는다 — 그래서 클래스를 나눴다)
//
// ⚠️ **폴링으로는 정점을 못 잡는다** — 박동은 460ms 이고 정점이 35%(≈161ms) 라 표본 사이로 샌다.
//    WAAPI 로 애니메이션을 찾아 `currentTime` 을 정점에 **고정**하고 잰다(등재 메모가 쓴 방법 그대로).
// 사용: node probe-topbar-pulse.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const { waitBootDone } = require('./wait-ready.js');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const VIEWPORTS = [{ width: 430, height: 932 }, { width: 390, height: 844 }, { width: 360, height: 640 }];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };

    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp });
        page.on('pageerror', e => errs.push(`${vp.width} ${e}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${vp.width} ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await waitBootDone(page, { timeout: 180000 });
        await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; Combat.tick = function () {}; });
        await page.waitForTimeout(300);

        // 수령을 태우고 **박동이 붙을 때까지** 기다린 뒤, 그 애니메이션을 정점에 고정해서 잰다.
        const measure = (rewards) => page.evaluate(async (rewards) => {
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            UI.rewardBurst(rewards);
            const bar = UI.els.topbar;
            const isPulsing = () => document.querySelector('.rw-pulse, .rw-pulse-band');
            for (let i = 0; i < 200 && !isPulsing(); i++) await sleep(25);
            const el = isPulsing();
            if (!el) return { none: true };
            // 정점 고정 — 이 한 줄이 이 판정기의 전부다(폴링으로는 161ms 짜리 정점을 못 잡는다).
            for (const a of el.getAnimations()) { a.pause(); a.currentTime = 460 * 0.35; }
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const app = document.getElementById('app').getBoundingClientRect();
            const b = bar.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            return {
                cls: el.className, isBar: el === bar,
                appW: +app.width.toFixed(1), barW: +b.width.toFixed(1),
                overLeft: +(app.left - b.left).toFixed(1), overRight: +(b.right - app.right).toFixed(1),
                barBottom: +(b.bottom - app.top).toFixed(2),
                pulseW: +r.width.toFixed(1),
                transform: getComputedStyle(el).transform,
            };
        }, rewards);

        // ① ② pill 이 없는 재화 — 상단 바 폴백 경로
        const base = await page.evaluate(() => {
            const app = document.getElementById('app').getBoundingClientRect();
            const b = UI.els.topbar.getBoundingClientRect();
            return { barW: +b.width.toFixed(1), barBottom: +(b.bottom - app.top).toFixed(2) };
        });
        const potions = await measure({ potions: 300 });
        ok(!potions.none, `[${vp.width}] 물약 수령에서 박동 요소를 못 찾았다`);
        if (!potions.none) {
            ok(potions.overLeft <= 0.5 && potions.overRight <= 0.5,
                `[${vp.width}] 상단 바가 앱 상자를 벗어났다 — 좌 ${potions.overLeft}px · 우 ${potions.overRight}px (폭 ${base.barW} → ${potions.barW})`);
            ok(potions.barBottom - base.barBottom <= 0.5,
                `[${vp.width}] 상단 바 하단이 아래로 자라 전투 화면을 덮는다 — ${base.barBottom} → ${potions.barBottom}`);
            console.log(`[${vp.width}] 물약 수령 · 박동=${potions.cls}${potions.isBar ? '(상단 바)' : ''} · 폭 ${base.barW} → ${potions.barW} · 이탈 좌 ${potions.overLeft} / 우 ${potions.overRight} · 하단 ${base.barBottom} → ${potions.barBottom}`);
        }

        // ③ 대조군 — 코인은 pill 이 있으니 종전 박동(크기 변화 포함)이 그대로여야 한다
        await page.reload({ waitUntil: 'load' });
        await waitBootDone(page, { timeout: 180000 });
        await page.evaluate(() => { if (typeof Scene3D !== 'undefined') Scene3D.update = function () {}; Combat.tick = function () {}; });
        await page.waitForTimeout(300);
        const coins = await measure({ coins: 500 });
        ok(!coins.none, `[${vp.width}] 코인 수령에서 박동 요소를 못 찾았다`);
        if (!coins.none) {
            ok(!coins.isBar && /\brw-pulse\b/.test(coins.cls),
                `[${vp.width}] 코인은 pill 이 .rw-pulse 로 박동해야 한다 — 실제 "${coins.cls}"${coins.isBar ? ' (상단 바로 폴백됐다)' : ''}`);
            ok(/matrix\(1\.2/.test(coins.transform),
                `[${vp.width}] 코인 pill 박동의 확대가 죽었다 — transform "${coins.transform}"`);
            ok(coins.overLeft <= 0.5 && coins.overRight <= 0.5,
                `[${vp.width}] 코인 수령에서도 상단 바가 벗어났다 — 좌 ${coins.overLeft} · 우 ${coins.overRight}`);
            console.log(`[${vp.width}] 코인 수령 · 박동=${coins.cls} · ${coins.transform} · 이탈 좌 ${coins.overLeft} / 우 ${coins.overRight}`);
        }
        await page.close();
    }

    ok(!errs.length, `콘솔/페이지 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    await browser.close();
    if (fails.length) { console.log('\nFAIL\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('\nPASS — 상단 바 박동이 앱 상자를 안 벗어난다');
})();
