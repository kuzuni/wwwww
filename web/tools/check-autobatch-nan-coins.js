// `S.autoBatch` 에 온전치 않은 항목이 남아 있어도 `S.coins` 가 NaN 으로 오염되지 않는다
// — 회귀 검사 (slug: autobatch-partial-item-nan-coins, 2026-08-19 QA 18차 등재)
//
// 배경: `UI.drainAutoBatch()` 의 손상 세이브 가드가 `if (!it || !it.slot) continue;` 로
//       **`slot` 만** 봤다. `{"slot":"weapon"}` 같은 반쪽 항목이 그대로 통과해
//       `Forge.autoResolve → sell → sellPrice` 로 갔고, `level`·`rarity` 가 없으니
//       `Math.floor(20 * Math.pow(1.01, NaN) * undefined * …)` = NaN,
//       즉 `S.coins += NaN` 이 됐다. 더 나쁜 건 **아무 소리도 안 났다는 것** —
//       `U.fmt(NaN)` 이 `0` 을 돌려주므로 화면엔 '코인 0' 으로 멀쩡히 찍히고,
//       세이브에는 `null` 로 직렬화돼(NaN → JSON null) 새로고침하면 기본값 500 으로
//       되돌아간다 = 모은 코인이 통째로 사라진다.
//
// 검증 항목:
//  ① 반쪽 항목 세이브로 부팅해도 `Number.isFinite(S.coins)` 가 참이고 값이 기본값 그대로다
//  ② 걸러낸 항목을 **`console.error` 로 짖는다** (조용하면 이 결함 자체가 안 보인다 —
//     `probe-screens-errors` 의 '콘솔 에러 0건' 판정에도 안 걸린다. `probe-creature-framing-crash`
//     항목과 같은 논지)
//  ③ `S.autoBatch` 는 비워진다 (반쪽 항목이 남아 매 부팅마다 되풀이되면 안 된다)
//  ④ **대조군**: 온전한 제작물 1개가 담긴 배치는 정상적으로 판매돼 코인이 **늘어난다**
//     (가드를 넓히다 멀쩡한 항목까지 버리면 자동 제련이 조용히 망가진다)
//  ⑤ 대조군 부팅에서는 `pageerror` 0건
//
// ⚠️ 세이브는 반드시 `addInitScript` 로 심고 `goto` 할 것 — 먼저 goto 한 뒤 심고 `reload()`
//    하면 **떠나는 페이지의 자동 저장이 심은 값을 덮어쓴다**(등재 메모의 계측 함정).
//
// 사용: node check-autobatch-nan-coins.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitBootDone } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 온전한 제작물의 최소 형태 — `Forge.rollItem()` 이 내놓는 모양 그대로.
const GOOD_ITEM = {
    name: '헌 검', slot: 'weapon', age: 'primitive', ageIdx: 0, rarity: 'common',
    level: 1, main: 'atk', value: 10, subs: [], wtype: 'club', nameIdx: 0, stars: 0,
};
const PARTIAL_ITEM = { slot: 'weapon' };   // 등재 메모의 재현 세이브 그대로

async function bootWith(browser, save) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [], consoleErrors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.addInitScript(s => {
        try { localStorage.setItem('forgeclone_save_v1', s); } catch (e) { /* 무시 */ }
    }, JSON.stringify(save));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitBootDone(page);
    const state = await page.evaluate(() => ({
        coins: String(S.coins),
        finite: Number.isFinite(S.coins),
        batch: S.autoBatch == null ? 'null' : JSON.stringify(S.autoBatch),
    }));
    await page.close();
    return { state, errors, consoleErrors };
}

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const fails = [];
    const check = (name, ok, detail) => {
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
        if (!ok) fails.push(name + (detail ? ' (' + detail + ')' : ''));
    };

    try {
        // ── A. 반쪽 항목 (버그 재현 세이브)
        console.log('── A. 반쪽 항목 배치 {"slot":"weapon"}');
        const a = await bootWith(browser, { version: 1, autoBatch: [PARTIAL_ITEM] });
        check('① S.coins 가 유한값', a.state.finite, 'coins=' + a.state.coins);
        check('① S.coins 가 기본값 500 그대로', a.state.coins === '500', 'coins=' + a.state.coins);
        const barked = a.consoleErrors.some(t => /autoBatch|손상|제작물의 최소 형태/.test(t));
        check('② 걸러낸 항목을 console.error 로 짖는다', barked,
            barked ? a.consoleErrors.find(t => /autoBatch|손상|제작물의 최소 형태/.test(t)).slice(0, 90)
                   : 'console.error ' + a.consoleErrors.length + '건 중 해당 없음');
        check('③ S.autoBatch 가 비워졌다', a.state.batch === 'null' || a.state.batch === '[]', 'autoBatch=' + a.state.batch);
        check('  (참고) pageerror 0건', a.errors.length === 0, a.errors.slice(0, 1).join(' | '));

        // ── B. 대조군 — 온전한 항목은 정상 판매돼 코인이 늘어야 한다
        console.log('── B. 대조군: 온전한 제작물 1개');
        const b = await bootWith(browser, { version: 1, autoBatch: [GOOD_ITEM] });
        check('④ 온전한 항목은 판매돼 코인이 늘었다', b.state.finite && Number(b.state.coins) > 500,
            'coins=' + b.state.coins + ' (기본 500)');
        check('④ S.autoBatch 가 비워졌다', b.state.batch === 'null' || b.state.batch === '[]', 'autoBatch=' + b.state.batch);
        check('⑤ pageerror 0건', b.errors.length === 0, b.errors.slice(0, 1).join(' | '));
        check('⑤ console.error 0건', b.consoleErrors.length === 0, b.consoleErrors.slice(0, 1).join(' | '));
    } finally {
        await browser.close();
    }

    console.log(fails.length ? '\n❌ FAIL ' + fails.length + '건\n  - ' + fails.join('\n  - ') : '\n✅ 전부 통과');
    process.exit(fails.length ? 1 : 0);
})();
