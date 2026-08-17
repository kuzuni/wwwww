// '이미 열린 화면을 open*으로 다시 그리는' 경로에서 스크롤이 맨 위로 튀는지 (QA 기록 항목).
// installScrollKeeper()는 render* 만 감싸므로 open* 재렌더는 보존에서 빠져 있었다.
//
// 재현 조건은 '스크롤러가 실제로 넘칠 때'뿐이다 — 기본 콘텐츠(탈것 16종·던전 4종)로는 넘치지 않아
// QA도 "현재는 재현 불가"로 적어 뒀다. 그래서 목록을 일부러 채우고 세로가 짧은 뷰포트에서 잰다.
// 또한 **계측이 실제로 튐을 잡는지** 스스로 확인한다: keepScroll을 잠시 무력화해 같은 동작을 시키면
// 반드시 0으로 튀어야 한다(안 튀면 이 검사는 아무것도 지키지 못하는 것이므로 실패로 본다).
// 사용: node probe-open-scroll.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

async function waitBooted(page, timeout = 20000) {
    const t0 = Date.now();
    for (;;) {
        const ok = await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S).catch(() => false);
        if (ok) return;
        if (Date.now() - t0 > timeout) throw new Error('부팅 대기 시간 초과');
        await page.waitForTimeout(100);
    }
}

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    // 세로가 짧을수록 목록이 잘 넘친다 — 튐이 드러나는 조건에서 잰다
    const page = await browser.newPage({ viewport: { width: 430, height: 480 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await waitBooted(page);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.winders = 1e7; S.gems = 1e7; S.coins = 1e9; S.bestChapter = 20;
        Mounts.ensure();
        Mounts.summon(30);
        // 실제 탈것은 16종뿐이라 그리드가 안 넘친다 — 넘치게 만들어야 이 검사가 의미를 갖는다
        for (let i = 0; i < 40; i++) S.mounts['테스트탈것' + i] = { rarity: 'common', level: 1, count: 1, subs: [] };
        S.activeMount = null;
        Dungeons.ensure();
        for (const d of Dungeons.DEFS) { S.dungeons.best[d.id] = 19; S.dungeons.keys[d.id] = 9; }
    });

    // 스크롤러를 내려놓고 액션을 시킨 뒤 그 자리에 있는지 본다. neuter=true면 keepScroll을 잠시 꺼서
    // '수정이 없었다면 튄다'는 걸 같은 조건에서 확인한다.
    const measure = (sel, actionSrc, neuter) => page.evaluate(({ sel, actionSrc, neuter }) => {
        const el = document.querySelector(sel);
        if (!el) return { missing: true };
        const over = el.scrollHeight - el.clientHeight;
        if (over <= 4) return { noOverflow: true, over };
        el.scrollTop = Math.min(60, over);
        const set = el.scrollTop;
        const orig = UI.keepScroll;
        if (neuter) UI.keepScroll = fn => fn();     // 보존 없이 = 수정 전과 같은 동작
        try { eval(actionSrc); } finally { UI.keepScroll = orig; }
        const after = document.querySelector(sel);
        return { set, after: after ? after.scrollTop : null, over };
    }, { sel, actionSrc, neuter });

    const check = async (name, sel, actionSrc) => {
        const bad = await measure(sel, actionSrc, true);    // 보존을 끄면 튀어야 한다(계측 민감도 확인)
        const good = await measure(sel, actionSrc, false);  // 지금 코드 — 유지돼야 한다
        if (good.missing) { fails.push(`${name}: 스크롤러(${sel})를 찾지 못했다`); return; }
        if (good.noOverflow) { console.log(`  ${name}: 목록이 안 넘쳐(여유 ${good.over}px) 계측 생략 — 콘텐츠가 늘면 이 경로도 검사 대상`); return; }
        ok(bad.after === 0, `${name}: 보존을 꺼도 안 튄다 — 이 검사가 회귀를 못 잡는다 (${bad.set} → ${bad.after})`);
        ok(good.after === good.set, `${name}: 재렌더 후 스크롤이 튀었다 (${good.set} → ${good.after})`);
        console.log(`  ${name}: 넘침 ${good.over}px · 보존 OFF ${bad.set}→${bad.after} / 현재 ${good.set}→${good.after}`);
    };

    await page.evaluate(() => UI.openMounts());
    await page.waitForTimeout(250);
    await check('탈것 [장착]', '#mount-modal .grid-scroll', `UI.onEquipMount(Object.keys(S.mounts)[0])`);
    await check('탈것 배수 토글', '#mount-modal .grid-scroll', `UI.cycleSummonMult('mount')`);
    await check('탈것 소환', '#mount-modal .grid-scroll', `UI.onSummonMount()`);

    // 던전·대장간은 현재 콘텐츠로는 스크롤러가 안 넘쳐(QA 기록과 같음) 계측이 생략된다 —
    // 수정 자체는 같은 구조라 함께 넣어 뒀고, 종류가 늘면 위와 같은 방식으로 잡힌다.
    await page.evaluate(() => { UI.closeMounts(); UI.openDungeons(); });
    await page.waitForTimeout(250);
    await check('던전 소탕', '#dungeon-modal .dungeon-list', `UI.onSweepDungeon(Dungeons.DEFS[0].id)`);

    console.log(`실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
