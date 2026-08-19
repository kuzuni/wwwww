// 기술 트리 검증 — 구조는 '타입 × 5단계 격자' (사용자 재정정 2026-08-17 4회차)
//  ① 한 분기에서 각 타입이 5번(단계마다) 나타난다 — 노드 수 = 타입 수 × 5
//  ② 해금: 선으로 이어진 **그래프 부모(TechTree.parentsOf)가 전부 1레벨 이상**이면 열린다
//     (사용자 재정정 2026-08-17 — '같은 타입 한 단계 위'는 폐기된 규칙이다. 부모는 화면에
//      그려지는 레일에서 뽑으므로 같은 타입 위 단계가 아닐 수 있다: weaponMastery@2 의 부모는
//      weaponMastery@1 이 아니라 mountCost@1·extraMount@1 이다). 여기서는 스모크 수준만 보고,
//      전 노드 전수 검증은 probe-techtree-unlock.js 가 한다.
//  ③ 노드당 상한 5, 라벨 N/5
//  ④ 보너스는 그 타입의 5단계 노드 레벨 합산
//  ⑤ 단계가 높을수록 비용·시간이 비싸다
//  ⑥ 연결선은 단계 사이에만, 첫 노드 위·마지막 노드 아래로 삐져나오지 않는다
// 사용: node probe-techtree.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const VIEWPORTS = [
    { width: 499, height: 892 },   // 원본 대조용
    { width: 412, height: 915 },
    { width: 360, height: 800 },
];
const BRANCHES = ['power', 'forge', 'skillpet'];

// UI·S·TechTree는 최상위 const라 waitForFunction 술어에서 안 보인다 — evaluate 폴링으로 기다린다.
async function waitBooted(page, timeout = 20000) {
    const t0 = Date.now();
    for (;;) {
        const ok = await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S).catch(() => false);
        if (ok) return;
        if (Date.now() - t0 > timeout) throw new Error('부팅 대기 시간 초과');
        await page.waitForTimeout(100);
    }
}

async function openBranch(page, branch) {
    await page.evaluate((b) => {
        // 렌더 루프가 도는 동안은 swiftshader 캡처가 15~30초다 — 먼저 멈춘다(const 전역이라 typeof로 확인)
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        UI.openTechTree();
        UI.openTechBranch(b);
    }, branch);
    await page.waitForTimeout(400);
}

// 노드/연결선 기하 실측. 선은 ::before가 그리므로 getComputedStyle로 실제 구간을 잰다.
const GEOM = () => {
    const col = document.querySelector('.tech-tree-col');
    const cr = col.getBoundingClientRect();
    const px = v => parseFloat(v) || 0;
    const nodes = [...col.querySelectorAll('.tech-tree-node')].map(n => {
        const r = n.getBoundingClientRect();
        return { cy: r.top + r.height / 2, top: r.top, bottom: r.bottom, cls: n.className };
    });
    // 연결선은 이제 SVG 오버레이(.tech-tree-links .tt-link)다 — 부모→자식 한 쌍당 path 하나.
    // (예전에는 단계 사이 공용 세로선 하나였다. 사용자 재지시 2026-08-17로 부모 관계대로 바뀜.)
    const lines = [...col.querySelectorAll('.tech-tree-links .tt-link')].map(pth => {
        const b = pth.getBBox();
        return { y0: cr.top + b.y, y1: cr.top + b.y + b.height, from: pth.dataset.from, to: pth.dataset.to };
    });
    return {
        col: { top: cr.top, left: cr.left, w: cr.width },
        nodes, lines,
        labels: [...col.querySelectorAll('.tech-tree-label')].map(el => el.textContent.trim()),
        tags: [...col.querySelectorAll('.tech-tier-tag')].map(el => el.textContent.trim()),
    };
};

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };

    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp });
        page.on('pageerror', e => errs.push(`${vp.width}x${vp.height} ${e.message}`));
        page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(`${vp.width}x${vp.height} ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await waitBooted(page);
        await page.waitForTimeout(300);
        console.log(`\n===== ${vp.width}x${vp.height} =====`);

        for (const branch of BRANCHES) {
            await openBranch(page, branch);
            const g = await page.evaluate(GEOM);
            const meta = await page.evaluate(b => {
                const br = TechTree.BRANCHES.find(x => x.id === b);
                const ids = TechTree.nodesOf(b);
                // 각 타입이 몇 번 등장하는지 (전부 5번이어야 한다)
                const perType = {};
                ids.forEach(id => { const t = TechTree.typeOf(id); perType[t] = (perType[t] || 0) + 1; });
                return {
                    types: br.types.length, nodes: ids.length, tiers: TechTree.TIERS, max: TechTree.MAX_LEVEL,
                    everyTypeFiveTimes: br.types.every(t => perType[t] === TechTree.TIERS),
                };
            }, branch);

            // ① 타입 × 5단계
            ok(meta.nodes === meta.types * meta.tiers, `${branch}: 노드 ${meta.nodes} ≠ 타입 ${meta.types} × ${meta.tiers}단계`);
            ok(meta.everyTypeFiveTimes, `${branch}: 5단계에 전부 반복되지 않는 타입이 있다`);
            ok(g.nodes.length === meta.nodes, `${branch}: 그려진 노드 ${g.nodes.length} ≠ ${meta.nodes}`);
            // ③ 라벨 N/5 · 단계 태그 5개
            ok(g.labels.every(t => /^\d+\/5$/.test(t)), `${branch}: 노드 라벨이 N/5 형식이 아님`);
            ok(g.tags.join(',') === 'I,II,III,IV,V', `${branch}: 단계 태그 ${g.tags.join(',')} ≠ I,II,III,IV,V`);

            // ⑥ 연결선 — 골격 자체의 판정은 probe-techtree-links.js가 한다(사용자 재지적 2026-08-18로
            //    '부모-자식 1:1'에서 '이웃 행을 잇는 다이아몬드 골격'으로 바뀌어 개수 공식이 없어졌다).
            //    여기서는 이 화면의 기하 불변식만 본다: 선이 노드 밖으로 삐져나오지 않는다.
            ok(g.lines.length > 0, `${branch}: 연결선이 하나도 없다`);
            const firstTop = Math.min(...g.nodes.map(n => n.top)), lastBot = Math.max(...g.nodes.map(n => n.bottom));
            ok(!g.lines.some(l => l.y0 < firstTop - 1.5), `${branch}: 첫 노드 위로 뻗은 선이 있다`);
            ok(!g.lines.some(l => l.y1 > lastBot + 1.5), `${branch}: 마지막 노드 아래로 뻗은 선이 있다`);
            // 세로 선분은 양끝이 노드 테두리나 가로 바에 물려야 한다(가로 바 자신은 높이 0이라 제외)
            for (const l of g.lines) {
                if (l.y1 - l.y0 < 1.5) continue;                       // 가로 바
                const touches = (y) => g.nodes.some(n => Math.abs(n.bottom - y) < 2.5 || Math.abs(n.top - y) < 2.5)
                    || g.lines.some(o => o.y1 - o.y0 < 1.5 && Math.abs(o.y0 - y) < 2.5);
                ok(touches(l.y0) && touches(l.y1), `${branch}: 연결선 끝이 노드/가로바에 안 닿는다 (${l.y0.toFixed(0)}~${l.y1.toFixed(0)})`);
            }
            console.log(`  ${branch}: 타입 ${meta.types} × ${meta.tiers}단계 = 노드 ${g.nodes.length} · 연결선 ${g.lines.length} · 태그 ${g.tags.join('')}`);
        }

        // ② 해금 — 그래프 부모가 전부 1레벨 이상이면 열리고, 이어지지 않은 노드는 그대로 잠긴다.
        //    ⚠️ 노드 id 를 손으로 박지 말 것 — 레일이 바뀌면 그 순간 프로브만 낡아 상시 FAIL 이 된다
        //    (2026-08-19 techtree-probe-stale 이 정확히 그 사고였다). 대상은 전부 parentsOf 로 뽑는다.
        await openBranch(page, 'power');
        const lock = await page.evaluate(() => {
            S.potions = 1e9;
            // NODES 키는 **타입**(weaponMastery)이고 실제 노드 id 는 'weaponMastery@2' 다 — 노드 id 로 지운다.
            const ALL = [].concat(...TechTree.BRANCHES.map(b => TechTree.nodesOf(b.id)));
            const zero = () => { for (const id of ALL) S.tech[id] = 0; };

            const flat = [].concat(...TechTree.rows('power').map(r => r.ids));
            const root = flat.find(id => TechTree.parentsOf(id).length === 0);
            const single = flat.find(id => TechTree.parentsOf(id).length === 1);          // 부모 1개
            const dual = flat.find(id => TechTree.parentsOf(id).length === 2);            // 부모 2개
            const far = [...flat].reverse().find(id => TechTree.parentsOf(id).length > 0); // 맨 끝(미연결 대조군)
            if (!root || !single || !dual || !far) return { missing: { root, single, dual, far } };
            const sp = TechTree.parentsOf(single)[0], dp = TechTree.parentsOf(dual);

            zero();
            const before = {
                root: TechTree.isUnlocked(root),
                single: TechTree.isUnlocked(single),
                dual: TechTree.isUnlocked(dual),
                far: TechTree.isUnlocked(far),
            };
            zero(); S.tech[sp] = 1;                       // 딱 1레벨만 (만렙 아님)
            const opened = { open: TechTree.isUnlocked(single), canStart: TechTree.canStart(single), far: TechTree.isUnlocked(far) };
            zero(); S.tech[dp[0]] = 1;
            const half = TechTree.isUnlocked(dual);       // 2부모 중 한쪽만 → 잠김이어야
            zero(); dp.forEach(p => { S.tech[p] = 1; });
            const both = TechTree.isUnlocked(dual);       // 양쪽 다 → 열림이어야
            zero();
            return { root, single, sp, dual, dp, far, before, opened, half, both };
        });
        ok(!lock.missing, `power 분기에서 검사 대상 노드를 못 찾았다 ${JSON.stringify(lock.missing || {})}`);
        if (!lock.missing) {
            ok(lock.before.root, `부모 없는 첫 노드 ${lock.root} 가 처음부터 잠겨 있다`);
            ok(!lock.before.single && !lock.before.dual && !lock.before.far, '부모가 전부 0레벨인데 열려 있는 노드가 있다');
            ok(lock.opened.open && lock.opened.canStart, `부모 ${lock.sp} 를 1레벨 찍었는데 ${lock.single} 이 안 열렸다`);
            ok(!lock.opened.far, `선으로 안 이어진 ${lock.far} 이 같이 열렸다`);
            ok(!lock.half, `2부모 ${lock.dual} 이 한쪽(${lock.dp[0]})만 1레벨인데 열렸다`);
            ok(lock.both, `2부모 ${lock.dual} 이 부모(${lock.dp.join('+')}) 전부 1레벨인데 안 열렸다`);
            console.log(`  해금: ${lock.sp}↑1렙 → ${lock.single} 열림 ${lock.opened.open} · 미연결 ${lock.far} 잠김 ${!lock.opened.far} · 2부모 ${lock.dual} 한쪽 잠김 ${!lock.half}/양쪽 열림 ${lock.both}`);
        }

        // ③ 상한 5 ④ 보너스 5단계 합산 ⑤ 단계가 오를수록 비용·시간 증가
        const calc = await page.evaluate(() => {
            for (const k in S.tech) S.tech[k] = 0;
            S.tech[TechTree.nid('weaponMastery', 1)] = 9;   // 상한 초과 세이브
            TechTree.ensure();
            const capped = TechTree.level(TechTree.nid('weaponMastery', 1));
            // 5단계 전부 3레벨 → 타입 총 레벨 15, per=2 → +30%
            for (let t = 1; t <= TechTree.TIERS; t++) S.tech[TechTree.nid('weaponMastery', t)] = 3;
            const sum = { typeLevel: TechTree.typeLevel('weaponMastery'), pct: TechTree.pct('weaponMastery'),
                          nodeOnly: TechTree.nodeTotal(TechTree.nid('weaponMastery', 1)),
                          mult: +TechTree.gearAtkMult().toFixed(3) };
            const cost = [1, 2, 3, 4, 5].map(t => TechTree.cost(TechTree.nid('weaponMastery', t), 1));
            const time = [1, 2, 3, 4, 5].map(t => TechTree.time(TechTree.nid('weaponMastery', t), 1));
            return { capped, sum, cost, time };
        });
        ok(calc.capped === 5, `상한 초과 세이브가 ${calc.capped}로 남음 (5여야 함)`);
        ok(calc.sum.typeLevel === 15 && calc.sum.pct === 30 && calc.sum.mult === 1.3,
            `보너스가 5단계 합산이 아니다 ${JSON.stringify(calc.sum)}`);
        ok(calc.sum.nodeOnly === 6, `노드 단독 기여가 틀렸다 (${calc.sum.nodeOnly}, 3레벨×2 = 6이어야)`);
        const inc = a => a.every((v, i) => i === 0 || v > a[i - 1]);
        ok(inc(calc.cost) && inc(calc.time), `단계가 올라도 비용·시간이 안 오른다 ${calc.cost} / ${calc.time}`);
        console.log(`  집계: 5단계 각 3렙 → 타입 15렙 · +${calc.sum.pct}% · 배율 ${calc.sum.mult} (노드 하나는 +${calc.sum.nodeOnly}%)`);
        console.log(`  단계별 1레벨 비용 ${calc.cost.join(' → ')} · 시간 ${calc.time.join(' → ')}초`);
        await page.close();
    }

    console.log(`\n실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
