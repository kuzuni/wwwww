// 판매 코인이 **착지할 때까지 또렷한가** — 사용: node probe-coin-opacity.js
//
// 왜 필요한가(사용자 지적 `sell-coin-land-visible`): "코인 효과가 바닥에 착지하기 전에 투명해져서
//   착지하는 게 잘 안 보인다". 원인은 `@keyframes coinFlyY` 가 opacity 를 **100% 키프레임에만**
//   적었던 것 — CSS 는 한 키프레임에만 있는 속성을 **바탕값(1)에서 그 키프레임까지 전 구간 선형
//   보간**하므로, 착지 시점(72%)에 이미 0.28 까지 흐려져 있었다.
//
// 재는 법: 스크린샷 눈대중이 아니라 **애니메이션 시계를 직접 감아** 각 진행률에서
//   `getComputedStyle().opacity` 를 읽는다(Web Animations API `currentTime`). 프레임 타이밍·
//   스로틀링과 무관하게 결정적이다.
// 판정: 착지(72%)와 바운스(84%)에서 opacity ≥ 0.95, 흡수 끝(100%)에서 ≤ 0.05,
//       그리고 비행 중(45%)에도 ≥ 0.95(날아가는 동안 흐려지면 같은 결함이다). 콘솔 에러 0.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MARKS = [0, 0.45, 0.72, 0.84, 1.0];
const NEED_OPAQUE = 0.95, NEED_GONE = 0.05;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof UI.coinBurst === 'function', null, { timeout: 20000 });
    await page.waitForTimeout(800);

    const rows = await page.evaluate((marks) => {
        UI.coinBurst(12345);
        const out = [];
        const flies = [...document.querySelectorAll('#coin-burst .coin-fly-y')];
        if (!flies.length) return [{ err: '코인 노드가 하나도 안 생겼다' }];
        for (const el of flies.slice(0, 3)) {
            // 이 노드의 coinFlyY 애니메이션만 골라 시계를 감는다(coinSpin·coinFlyX 는 건드리지 않는다)
            const anim = el.getAnimations().find(a => a.animationName === 'coinFlyY');
            if (!anim) { out.push({ err: 'coinFlyY 애니메이션이 없다' }); continue; }
            const t = anim.effect.getComputedTiming();
            const dur = t.duration, delay = t.delay || 0;
            const row = { dur, delay, op: {} };
            for (const m of marks) {
                anim.currentTime = delay + dur * m;      // 지연 뒤 진행률 m 지점
                row.op[m] = +getComputedStyle(el).opacity;
            }
            out.push(row);
        }
        return out;
    }, MARKS);

    console.log('판매 코인 opacity — 착지(0.72)·바운스(0.84)에서 ' + NEED_OPAQUE + ' 이상, 끝(1.0)에서 ' + NEED_GONE + ' 이하\n');
    let bad = 0;
    rows.forEach((r, i) => {
        if (r.err) { console.log('  ⚠️ ' + r.err); bad++; return; }
        const need = (m) => m === 1 ? r.op[m] <= NEED_GONE : r.op[m] >= NEED_OPAQUE;
        const okAll = MARKS.every(need);
        if (!okAll) bad++;
        console.log(`  코인#${i + 1} (dur ${r.dur}ms, delay ${r.delay}ms)  ` +
            MARKS.map(m => `${(m * 100).toFixed(0)}%=${r.op[m].toFixed(2)}${need(m) ? '' : '⚠️'}`).join('  ') +
            `  ${okAll ? 'OK' : '불합격'}`);
    });
    console.log(bad === 0 ? '\n전부 통과 — 착지까지 또렷하고 흡수될 때만 사라진다' : `\n불합격 ${bad}건`);
    console.log(errors.length ? '\nERRORS:\n' + errors.join('\n') : '\n(no page errors)');
    await browser.close();
    process.exit(bad === 0 ? 0 : 1);
})();
