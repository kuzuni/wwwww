// 기술트리 연결선 검증 (사용자 지시 2026-08-17 — "선을 부모 관계대로").
//  ① 그려진 선 = TechTree.parentsOf가 정의한 부모→자식 쌍과 **정확히 1:1** (개수·양끝 모두)
//  ② 같은 타입은 모든 단계에서 같은 x — 즉 대부분의 연결선이 **꺾임 없는 세로 레일**이어야 한다
//  ③ 트리 맨 위 행·맨 아래 행은 **노드 1개**로 수렴한다
//  ④ 선은 부모 원 아래 테두리에서 자식 원 위 테두리까지만 — 첫 노드 위·마지막 노드 아래로 안 삐져나온다
//  ⑤ 분기 3개 전부 + 콘솔 에러 0건
// 사용: node probe-techtree-links.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.potions = 1e9; S.gems = 1e9;
    });

    for (const bid of ['power', 'forge', 'skillpet']) {
        const r = await page.evaluate(id => {
            UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch(id);
            const col = document.querySelector('.tech-tree-col');
            const cb = col.getBoundingClientRect();
            const nodes = {};
            col.querySelectorAll('.tech-tree-node[data-tid]').forEach(n => {
                const b = n.getBoundingClientRect();
                nodes[n.dataset.tid] = {
                    x: b.left - cb.left + b.width / 2, y: b.top - cb.top + b.height / 2,
                    top: b.top - cb.top, bot: b.bottom - cb.top, r: b.height / 2,
                };
            });
            // 기대 쌍: 분기의 모든 노드에 대한 parentsOf
            const want = [];
            for (const nid of TechTree.nodesOf(id)) for (const p of TechTree.parentsOf(nid)) want.push(p + '>' + nid);
            const paths = [...col.querySelectorAll('.tech-tree-links .tt-link')].map(p => ({
                key: p.dataset.from + '>' + p.dataset.to,
                from: p.dataset.from, to: p.dataset.to,
                box: (() => { const b = p.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })(),
            }));
            const rows = [...col.querySelectorAll('.tech-tree-row')].map(row => row.querySelectorAll('.tech-tree-node').length);
            const ys = Object.values(nodes);
            return {
                want, got: paths.map(p => p.key), paths, rows, nodeCount: Object.keys(nodes).length,
                firstTop: Math.min(...ys.map(n => n.top)), lastBot: Math.max(...ys.map(n => n.bot)),
                nodes,
            };
        }, bid);

        const want = new Set(r.want), got = new Set(r.got);
        const missing = [...want].filter(k => !got.has(k));
        const extra = [...got].filter(k => !want.has(k));
        ok(missing.length === 0, `${bid}: 부모-자식인데 선이 없다 ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` 외 ${missing.length - 4}건` : ''}`);
        ok(extra.length === 0, `${bid}: 부모-자식이 아닌데 선이 있다 ${extra.slice(0, 4).join(', ')}`);
        ok(r.paths.length === r.want.length, `${bid}: 선 개수 ${r.paths.length} ≠ 부모-자식 쌍 ${r.want.length}`);

        // ③ 맨 위·맨 아래 행이 단일 노드
        ok(r.rows[0] === 1, `${bid}: 트리 맨 위 행이 노드 ${r.rows[0]}개 (1개여야 한다)`);
        ok(r.rows[r.rows.length - 1] === 1, `${bid}: 트리 맨 아래 행이 노드 ${r.rows[r.rows.length - 1]}개 (1개여야 한다)`);

        // ④ 삐져나옴: 모든 선이 첫 노드 위·마지막 노드 아래를 넘지 않는다 + 양끝이 노드 테두리에 닿는다
        let over = 0, offEnd = 0, straight = 0;
        for (const p of r.paths) {
            if (p.box.y < r.firstTop - 1 || p.box.y + p.box.h > r.lastBot + 1) over++;
            const a = r.nodes[p.from], c = r.nodes[p.to];
            if (!a || !c) { offEnd++; continue; }
            if (Math.abs(p.box.y - a.bot) > 2 || Math.abs(p.box.y + p.box.h - c.top) > 2) offEnd++;
            if (Math.abs(a.x - c.x) < 0.5) straight++;
        }
        ok(over === 0, `${bid}: 첫 노드 위/마지막 노드 아래로 삐져나온 선 ${over}개`);
        ok(offEnd === 0, `${bid}: 양끝이 노드 테두리에 안 닿는 선 ${offEnd}개`);
        const straightPct = 100 * straight / r.paths.length;
        ok(straightPct >= 80, `${bid}: 꺾임 없는 세로 레일이 ${straightPct.toFixed(0)}%뿐 (같은 타입은 모든 단계에서 같은 x여야 한다)`);

        console.log(`${bid} — 노드 ${r.nodeCount} · 선 ${r.paths.length}/${r.want.length} (부모-자식 일치) · 행 [${r.rows.join(',')}] · 세로 레일 ${straightPct.toFixed(0)}% · 삐져나옴 ${over} · 끝점 어긋남 ${offEnd}`);
    }

    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n')); else console.log('콘솔 에러 0건');
    console.log(fails.length || errs.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n') : '\n✅ PASS — 연결선이 부모-자식과 1:1, 위·아래 단일 노드 수렴');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
