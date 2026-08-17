// 기술트리 연결선 검증 (사용자 재지적 2026-08-18 — "한 세트씩 다 연결돼 한 덩어리처럼 보여야 한다").
// 이전 판(2026-08-17)은 '선 = parentsOf와 1:1'을 쟀는데, 그 골격이 바로 사용자가 재지적한
// '평행한 막대들'이라 검증 기준 자체를 사용자가 그려 준 다이아몬드 골격으로 갈아엎었다.
//  ① **한 덩어리**: 선을 따라가면 트리의 모든 노드가 서로 이어진다(연결 성분 1개, 고립 노드 0개)
//  ② **열끼리 가로로 묶인다**: 좌·우 열을 잇는 가로 바가 단계 경계마다 있다(가로선 0개 = 불합격)
//  ③ **다이아몬드**: 단독 행 → 2노드 행은 갈라지고(fork), 2노드 행 → 단독 행은 모인다(converge)
//  ④ 2노드 행끼리는 좌·우 열이 각자 세로 레일 — 열이 어긋나 사선으로 엉키지 않는다
//  ⑤ 선은 원 테두리에서 시작·끝나고 첫 노드 위·마지막 노드 아래로 안 삐져나온다
//  ⑥ 분기 3개 전부 + 콘솔 에러 0건
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
            const paths = [...col.querySelectorAll('.tech-tree-links .tt-link')].map(p => {
                const b = p.getBBox();
                return { from: p.dataset.from, to: p.dataset.to, x: b.x, y: b.y, w: b.width, h: b.height };
            });
            // 행 구성(노드 수)과 행별 노드 x — fork/converge/레일 판정용
            const rows = [...col.querySelectorAll('.tech-tree-row')]
                .map(row => [...row.querySelectorAll('.tech-tree-node[data-tid]')].map(n => n.dataset.tid))
                .filter(ids => ids.length);
            const ys = Object.values(nodes);
            return {
                paths, rows, nodes, nodeCount: Object.keys(nodes).length,
                firstTop: Math.min(...ys.map(n => n.top)), lastBot: Math.max(...ys.map(n => n.bot)),
            };
        }, bid);

        // ① 한 덩어리 — 노드 + 가로 바를 정점으로 두고 선을 간선으로 이어 연결 성분을 센다
        const parent = {};
        const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
        const add = (a) => { if (!(a in parent)) parent[a] = a; };
        Object.keys(r.nodes).forEach(add);
        for (const p of r.paths) { add(p.from); add(p.to); parent[find(p.from)] = find(p.to); }
        const comps = new Set(Object.keys(r.nodes).map(find));
        ok(comps.size === 1, `${bid}: 트리가 ${comps.size}덩어리로 끊겨 있다 (1덩어리여야 한다 — 열끼리 안 묶임)`);

        // ② 가로 바(열을 묶는 선)가 실제로 그려졌는가
        const bars = r.paths.filter(p => p.h <= 1.5 && p.w > 2);
        ok(bars.length > 0, `${bid}: 열과 열을 잇는 가로선이 0개 — 세로 일자선만 있다(사용자 재지적 그대로)`);

        // ③ 다이아몬드: 폭이 다른 행 경계마다 fork/converge가 있어야 한다
        let wantBars = 0, gotFC = 0;
        for (let i = 0; i + 1 < r.rows.length; i++) {
            if (r.rows[i].length === r.rows[i + 1].length) continue;
            wantBars++;
            const barId = 'bar' + i;
            const stubs = r.paths.filter(p => p.from === barId || p.to === barId);
            // 가로 바 1개 + 위 행 스텁 + 아래 행 스텁
            if (stubs.length === 1 + r.rows[i].length + r.rows[i + 1].length) gotFC++;
        }
        ok(gotFC === wantBars, `${bid}: 갈라짐/모임(fork·converge)이 ${gotFC}/${wantBars}곳에만 있다`);
        ok(bars.length === wantBars, `${bid}: 가로 바 ${bars.length}개 ≠ 단계 경계 ${wantBars}곳`);

        // ④ 2노드 행끼리는 세로 레일(사선 금지)
        let rails = 0, slanted = 0;
        for (let i = 0; i + 1 < r.rows.length; i++) {
            if (r.rows[i].length !== r.rows[i + 1].length) continue;
            r.rows[i].forEach((aid, k) => {
                const a = r.nodes[aid], c = r.nodes[r.rows[i + 1][k]];
                rails++;
                if (Math.abs(a.x - c.x) > 0.5) slanted++;
            });
        }
        ok(slanted === 0, `${bid}: 같은 폭 행 사이에 꺾인 선 ${slanted}개 (열 x가 어긋났다)`);

        // ⑤ 삐져나옴 + 끝점이 노드 테두리에 닿는가(노드가 끝점인 선만)
        let over = 0, offEnd = 0;
        for (const p of r.paths) {
            if (p.y < r.firstTop - 1 || p.y + p.h > r.lastBot + 1) over++;
            const a = r.nodes[p.from], c = r.nodes[p.to];
            if (a && Math.abs(p.y - a.bot) > 2) offEnd++;
            if (c && Math.abs(p.y + p.h - c.top) > 2) offEnd++;
        }
        ok(over === 0, `${bid}: 첫 노드 위/마지막 노드 아래로 삐져나온 선 ${over}개`);
        ok(offEnd === 0, `${bid}: 끝점이 노드 테두리에 안 닿는 선 ${offEnd}개`);

        console.log(`${bid} — 노드 ${r.nodeCount} · 선 ${r.paths.length} · 덩어리 ${comps.size} · 가로바 ${bars.length}/${wantBars} · 세로레일 ${rails}(사선 ${slanted}) · 행 [${r.rows.map(x => x.length).join(',')}] · 삐져나옴 ${over} · 끝점 어긋남 ${offEnd}`);
    }

    if (errs.length) console.log('콘솔 에러:\n' + errs.join('\n')); else console.log('콘솔 에러 0건');
    console.log(fails.length || errs.length ? `\n❌ FAIL (${fails.length}건)\n` + fails.join('\n') : '\n✅ PASS — 트리가 한 덩어리, 열끼리 가로 바로 묶임(다이아몬드 골격)');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
