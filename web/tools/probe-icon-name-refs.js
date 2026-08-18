// UI 가 참조하는 아이콘 이름이 **실제로 `IconGen.draw` 에 있는지** 확인한다.
//
// 왜 필요한가: `IconGen.img('없는이름')` 은 예외를 던지지 않고 **빈 문자열**을 돌려준다. 호출부는
// 대부분 `img(...) || 이모지` 꼴이라 **조용히 이모지로 떨어지고 아무도 모른다.** 실제로 이 세션이
// `WEAPON_SHAPE_ICON` 을 `{sword:'sword', axe:'axe', spear:'spear', hammer:'hammer'}` 로 썼는데
// 앞 셋은 등록된 아이콘이 아니라 **그리기용 내부 헬퍼 함수 이름**이었다 — 소스에서 `이름(ctx, S)` 를
// 긁어 목록을 만든 게 화근이었다. 화면은 안 깨지고 그냥 이모지가 그대로 남았다.
//
// 그래서 UI 의 이름 표들을 실제 레지스트리와 대조한다. 표에 없는 모양·슬롯이 있는 건 정상이고
// (아직 안 그린 것), **표에 적힌 이름이 레지스트리에 없는 것**만 실패로 본다.
//
// 사용: node probe-icon-name-refs.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 497, height: 897 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof IconGen !== 'undefined', null, { timeout: 150000 });

    const r = await page.evaluate(() => {
        const have = new Set(Object.keys(IconGen.draw));
        // UI 가 들고 있는 '이름 표'들. 새 표를 만들면 여기 한 줄 더할 것.
        const TABLES = {
            TOAST_ICON: UI.TOAST_ICON,
            WEAPON_SHAPE_ICON: UI.WEAPON_SHAPE_ICON,
            TECH_ICON: UI.TECH_ICON,
            DG_ICON: UI.DG_ICON,
            WP_ICON: UI.WP_ICON,
        };
        const missing = [];
        const checked = {};
        for (const t in TABLES) {
            const tbl = TABLES[t] || {};
            checked[t] = Object.keys(tbl).length;
            for (const k in tbl) {
                const name = tbl[k];
                if (typeof name !== 'string') continue;
                // 이름이 있어도 img() 가 빈 문자열이면 같은 결과다 — 둘 다 본다.
                if (!have.has(name) || !IconGen.img(name)) missing.push(`${t}["${k}"] → '${name}'`);
            }
        }
        // 코드가 직접 문자열로 부르는 자리 중 표에 안 들어가는 것들도 몇 개 못 박아 둔다.
        const DIRECT = ['coin', 'gem', 'hammer', 'egg', 'ticket', 'star', 'pencil', 'chatbubble',
            'horse', 'paw', 'lock', 'zzz', 'shard', 'potion', 'winder',
            'slot_weapon', 'slot_helmet', 'slot_armor', 'slot_gloves',
            'slot_necklace', 'slot_ring', 'slot_shoes', 'slot_belt'];
        const directMissing = DIRECT.filter(n => !have.has(n) || !IconGen.img(n));
        return { total: have.size, checked, missing, directMissing };
    });

    console.log(`IconGen 레지스트리 ${r.total}종`);
    for (const t in r.checked) console.log(`  ${t.padEnd(20)} ${r.checked[t]}개 참조`);
    console.log(`  직접 호출 상수      ${23}개 참조`);

    const bad = [];
    if (r.missing.length) {
        console.log('\n없는 이름을 가리키는 표 항목:');
        r.missing.forEach(m => console.log('    ' + m));
        bad.push(`표에서 없는 아이콘 이름 ${r.missing.length}건`);
    }
    if (r.directMissing.length) {
        console.log('\n코드가 직접 부르는데 없는 이름: ' + r.directMissing.join(' '));
        bad.push(`직접 호출에서 없는 이름 ${r.directMissing.length}건`);
    }
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건');

    console.log(bad.length ? '\nFAIL — ' + bad.join(' · ')
        : '\nPASS — UI 가 참조하는 아이콘 이름이 전부 레지스트리에 있고 그림도 난다 · 콘솔 에러 0건');
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
