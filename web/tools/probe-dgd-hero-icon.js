// 던전 상세 히어로에 주인공 아이콘이 중복으로 얹히지 않는지 검사.
// 배너 일러스트가 주인공을 직접 그리게 바뀐 뒤(dungeon-row-quality), 상세 팝업이 `.dg-icon` 을
// 그대로 얹으면 같은 물건이 그림 안 하나 + 아이콘 하나로 둘이 된다.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('/home/user/wwwww/web/tools/wait-ready.js');
const SC = require('/home/user/wwwww/web/tools/shot-screens-seed.js');
(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + e));
    p.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await p.goto('file://' + path.resolve('/home/user/wwwww/web/index.html'), { waitUntil: 'load' });
    await waitReady(p, 'typeof UI!=="undefined" && typeof S!=="undefined" && typeof Forge!=="undefined"');
    await p.evaluate(SC.SEED_SRC);
    await p.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    let bad = 0;
    for (const id of ['hammer', 'ghost', 'invasion', 'zombie']) {
        const r = await p.evaluate(i => {
            UI.toast = () => { }; UI.openDungeons(); UI.openDungeonDetail(i);
            const h = document.querySelector('.dg-detail-hero');
            const cs = getComputedStyle(h);
            return {
                id: i, icons: h.querySelectorAll('.dg-icon').length,
                art: cs.backgroundImage.includes('data:image'), size: cs.backgroundSize,
                title: (h.querySelector('.dgd-title') || {}).textContent,
            };
        }, id);
        const ok = r.art && r.icons === 0;          // 그림이 붙는 4종은 아이콘 0개여야 한다
        if (!ok) bad++;
        console.log(`${ok ? 'PASS' : 'FAIL'} ${r.id}  art=${r.art} .dg-icon=${r.icons} size=${r.size} title=${r.title}`);
    }
    // 그림이 없는 던전은 아이콘 폴백이 남아야 한다 — DG_SCENE 에 없는 id 로 확인
    const fb = await p.evaluate(() => {
        const d = { id: '__nope__', kr: '테스트', icon: '?' };
        return { cls: UI.dgSceneCls(d), html: UI.dgHeroIcon(d) };
    });
    const fbOk = fb.cls === '' && fb.html.indexOf('dg-icon') >= 0;
    if (!fbOk) bad++;
    console.log(`${fbOk ? 'PASS' : 'FAIL'} 폴백: 그림 없는 던전은 아이콘 유지 (cls="${fb.cls}")`);
    console.log('console errors:', errs.length, errs.slice(0, 3));
    console.log(bad === 0 ? '판정: 통과' : `판정: 실패 ${bad}건`);
    await b.close();
    process.exit(bad === 0 ? 0 : 1);
})();
