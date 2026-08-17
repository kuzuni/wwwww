// 기술트리 해금 규칙 검증 — '단계 통째 만렙'이 아니라 '선으로 이어진 부모가 전부 1레벨 이상'.
// 분기 3개의 모든 노드를 훑어 아래를 확인한다:
//   ① 첫 행 노드는 부모가 없어 항상 열려 있다
//   ② 부모 1개짜리: 부모 0레벨 → 잠김 / 부모를 딱 1레벨만 찍으면 → 즉시 열림(만렙 불필요)
//   ③ 부모 2개짜리: 한쪽만 1레벨이면 여전히 잠김 / 양쪽 1레벨이면 열림
//   ④ 노드 상한 5레벨
//   ⑤ 화면에 그려진 세로선/가로바가 부모 관계와 일치(선이 있는 곳에만 부모가 있다)
// 사용: node probe-techtree-unlock.js
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

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
    const errs = [];
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitBooted(page);
    await page.waitForTimeout(500);

    const res = await page.evaluate(() => {
        const out = { maxLevel: TechTree.MAX_LEVEL, branches: [], fails: [] };
        // ⚠️ TechTree.NODES는 **타입**으로 키가 잡혀 있고(weaponMastery) 실제 노드 id는
        // 'weaponMastery@2'다 — 예전 zero()는 NODES 키만 돌아 S.tech를 하나도 못 지웠다.
        // 그래서 아래 ④ 레벨 상한 검사가 남긴 5레벨이 다음 노드 검사로 새어, 2단계 이상이
        // 전부 '부모가 0레벨인데 열림'으로 오탐했다. 실제 노드 id 전부를 지운다.
        const ALL = [].concat(...TechTree.BRANCHES.map(b => TechTree.nodesOf(b.id)));
        const zero = () => { for (const id of ALL) S.tech[id] = 0; };

        for (const b of TechTree.BRANCHES) {
            const rows = TechTree.rows(b.id);
            const info = { id: b.id, rows: rows.map(r => r.ids.slice()), nodes: [] };

            for (const row of rows) for (const id of row.ids) {
                const parents = TechTree.parentsOf(id);
                const rec = { id, parents: parents.slice(), checks: {} };

                zero();
                const openAtZero = TechTree.isUnlocked(id);
                if (parents.length === 0) {
                    // ① 뿌리 노드는 항상 열림
                    rec.checks.rootOpen = openAtZero === true;
                    if (!rec.checks.rootOpen) out.fails.push(`${id}: 부모 없는 첫 행인데 잠김`);
                } else {
                    // 부모 전부 0레벨 → 잠김
                    rec.checks.lockedAtZero = openAtZero === false;
                    if (openAtZero) out.fails.push(`${id}: 부모가 전부 0레벨인데 열림`);

                    if (parents.length === 1) {
                        // ② 부모 1레벨만 찍으면 열려야 한다 (만렙 아님)
                        zero(); S.tech[parents[0]] = 1;
                        rec.checks.openAtParentLv1 = TechTree.isUnlocked(id) === true;
                        if (!rec.checks.openAtParentLv1) out.fails.push(`${id}: 부모 ${parents[0]} 1레벨인데 안 열림`);
                    } else {
                        // ③ 한쪽만 1레벨이면 잠김, 양쪽이면 열림
                        let partialOpen = false;
                        for (const p of parents) {
                            zero(); S.tech[p] = 1;
                            if (TechTree.isUnlocked(id)) partialOpen = true;
                        }
                        rec.checks.lockedOnPartial = partialOpen === false;
                        if (partialOpen) out.fails.push(`${id}: 2부모 중 한쪽만 1레벨인데 열림`);

                        zero(); parents.forEach(p => { S.tech[p] = 1; });
                        rec.checks.openOnAllParentsLv1 = TechTree.isUnlocked(id) === true;
                        if (!rec.checks.openOnAllParentsLv1) out.fails.push(`${id}: 부모 전부 1레벨인데 안 열림`);
                    }
                }

                // ④ 레벨 상한
                zero(); S.tech[id] = 99; TechTree.ensure();
                rec.checks.capped = S.tech[id] === TechTree.MAX_LEVEL;
                if (!rec.checks.capped) out.fails.push(`${id}: 레벨 상한이 ${S.tech[id]} (5여야 함)`);

                info.nodes.push(rec);
            }
            out.branches.push(info);
        }
        zero();
        return out;
    });

    // ⑤ 그려진 선과 부모 관계가 맞는지: 각 분기 화면을 그려 세로선/가로바 개수를 센다.
    const draw = [];
    for (const b of ['power', 'forge', 'skillpet']) {
        const d = await page.evaluate((bid) => {
            for (const id in TechTree.NODES) S.tech[id] = 0;
            UI.openTechTree();          // 소환 탭의 '기술 트리' 서브탭을 실제로 띄워야 패널이 그려진다
            UI.openTechBranch(bid);
            const col = document.querySelector('.tech-tree-col');
            if (!col) return { bid, missing: true };
            const rows = TechTree.rows(bid);
            // 연결선은 SVG 오버레이의 path — **부모→자식 쌍 하나당 하나**여야 한다
            // (예전 규약: 행 사이 공용 세로선 1개. 사용자 재지시 2026-08-17로 부모 관계대로 바뀜)
            const links = col.querySelectorAll('.tech-tree-links .tt-link').length;
            const rowEls = col.querySelectorAll(':scope > .tech-tree-row').length;
            let pairs = 0;
            for (const nid of TechTree.nodesOf(bid)) pairs += TechTree.parentsOf(nid).length;
            // 첫/마지막 자식은 행이어야 한다 — SVG 오버레이(className이 문자열이 아님)는 세지 않는다
            const kids = [...col.children].filter(e => e.tagName !== 'svg').map(e => String(e.getAttribute('class') || '').split(' ')[0]);
            return {
                bid, rowEls, links, expectLinks: pairs,
                firstIsRow: kids[0] === 'tech-tree-row',
                lastIsRow: kids[kids.length - 1] === 'tech-tree-row',
            };
        }, b);
        draw.push(d);
    }

    console.log(`노드 상한: ${res.maxLevel}`);
    for (const b of res.branches) {
        console.log(`\n== ${b.id} ==`);
        b.rows.forEach((r, i) => console.log(`  행${i + 1}: ${r.join(' , ')}`));
        for (const n of b.nodes) {
            const c = n.checks;
            const tag = n.parents.length === 0 ? '뿌리' : `부모 ${n.parents.length}개: ${n.parents.join(' + ')}`;
            console.log(`   ${Object.values(c).every(Boolean) ? 'OK  ' : 'FAIL'} ${n.id.padEnd(18)} ${tag}`);
        }
    }
    console.log('\n-- 그려진 선 --');
    let drawFail = 0;
    for (const d of draw) {
        if (d.missing) { drawFail++; console.log(`  FAIL ${d.bid}: 기술트리 패널이 그려지지 않음`); continue; }
        const ok = d.links === d.expectLinks && d.firstIsRow && d.lastIsRow;
        if (!ok) drawFail++;
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${d.bid}: 행 ${d.rowEls}개, 연결선 ${d.links}개(기대 ${d.expectLinks}) 위삐짐없음=${d.firstIsRow} 아래삐짐없음=${d.lastIsRow}`);
    }

    console.log(`\n규칙 실패 ${res.fails.length}건 / 선 실패 ${drawFail}건 / 콘솔 에러 ${errs.length}건`);
    res.fails.slice(0, 15).forEach(f => console.log('  ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(res.fails.length || drawFail || errs.length ? 1 : 0);
})();
