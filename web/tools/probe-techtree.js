// 기술 트리 5단계(티어) 세로 트리 검증 도구 (사용자 정정 2026-08-17 항목)
//  ① 노드 상한 5레벨 · 노드 라벨 'N/5'
//  ② 1단계 미완료 시 2단계 잠김 / 1단계 전부 만렙이면 2단계 해금 (실클릭으로 연구 시작까지)
//  ③ 연결선이 노드 중심 ~ 노드 중심으로 끊김 없이 이어짐(::before 실측)
//  ④ 첫 노드 위·마지막 노드 아래로 삐져나온 선이 없음(픽셀 스캔)
// 사용: node probe-techtree.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const VIEWPORTS = [
    { width: 499, height: 892 },   // 원본 대조용
    { width: 412, height: 915 },
    { width: 390, height: 844 },
    { width: 360, height: 800 },
];
const BRANCHES = ['power', 'forge', 'skillpet'];

// 트리 화면 열기 — 3D 렌더 루프는 캡처가 15~30초씩 걸리므로 먼저 멈춘다(인계 메모)
async function openBranch(page, branch) {
    await page.evaluate((b) => {
        // 렌더 루프가 도는 동안은 swiftshader 스크린샷 한 장이 15~30초다 — 먼저 멈춘다.
        // (const 전역이라 window.Scene3D로는 안 잡힌다 — typeof로 확인할 것)
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        UI.openTechTree();
        UI.openTechBranch(b);
    }, branch);
    await page.waitForTimeout(450); // 패널 전환·아이콘 로드가 끝나 레이아웃이 굳을 때까지
}

// 노드/연결선 기하 실측. 선은 ::before가 그리므로 getComputedStyle로 실제 그려지는 구간을 잰다.
const GEOM = () => {
    const col = document.querySelector('.tech-tree-col');
    const cr = col.getBoundingClientRect();
    const px = v => parseFloat(v) || 0;
    const nodes = [...col.querySelectorAll('.tech-tree-node')].map(n => {
        const r = n.getBoundingClientRect();
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, top: r.top, bottom: r.bottom, d: r.width, cls: n.className };
    });
    // 세로선: 레이아웃 박스 + ::before 오프셋으로 실제 선의 y 구간을 만든다
    const lines = [];
    for (const el of col.querySelectorAll('.tech-tree-vline, .tech-tree-vrow i')) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el, '::before');
        lines.push({ x: r.left + r.width / 2, y0: r.top + px(cs.top), y1: r.bottom - px(cs.bottom) });
    }
    const bars = [...col.querySelectorAll('.tech-tree-hline')].map(el => {
        const r = el.getBoundingClientRect();
        return { x0: r.left, x1: r.right, cy: r.top + r.height / 2 };
    });
    const labels = [...col.querySelectorAll('.tech-tree-label')].map(el => el.textContent.trim());
    const tags = [...col.querySelectorAll('.tech-tier-tag')].map(el => el.textContent.trim());
    return { col: { top: cr.top, bottom: cr.bottom, left: cr.left, right: cr.right, w: cr.width }, nodes, lines, bars, labels, tags };
};

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [], fails = [];
    const ok = (cond, msg) => { if (!cond) fails.push(msg); return cond; };

    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp });
        page.on('pageerror', e => errs.push(`${vp.width}x${vp.height} ${e.message}`));
        page.on('console', m => { if (m.type() === 'error') errs.push(`${vp.width}x${vp.height} ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        // waitForFunction 컨텍스트에서는 페이지 스크립트의 const 전역이 다 보이지 않는다(TechTree 미인식) —
        // 로드 판정은 UI·S로 하고 실제 조회는 전부 page.evaluate로 한다.
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 15000 });
        await page.waitForTimeout(400);
        console.log(`\n===== ${vp.width}x${vp.height} =====`);

        for (const branch of BRANCHES) {
            await openBranch(page, branch);
            const g = await page.evaluate(GEOM);
            const meta = await page.evaluate(b => {
                const br = TechTree.BRANCHES.find(x => x.id === b);
                return { tiers: br.tiers, nodes: br.nodes, max: TechTree.MAX_LEVEL, tiersN: TechTree.TIERS };
            }, branch);

            // ① 구조: 5단계 · 노드 상한 5 · 라벨 N/5 · 단계 태그 I~V 5개
            ok(meta.tiers.length === 5, `${branch}: 단계 수 ${meta.tiers.length} ≠ 5`);
            ok(meta.max === 5, `${branch}: MAX_LEVEL ${meta.max} ≠ 5`);
            ok(g.nodes.length === meta.nodes.length, `${branch}: 그려진 노드 ${g.nodes.length} ≠ ${meta.nodes.length}`);
            ok(g.labels.every(t => /^\d+\/5$/.test(t)), `${branch}: 노드 라벨이 N/5 형식이 아님 — ${g.labels.join(',')}`);
            ok(g.tags.join(',') === 'I,II,III,IV,V', `${branch}: 단계 태그 ${g.tags.join(',')} ≠ I,II,III,IV,V`);

            // ② 연결선 연속성: 세로선이 위 노드 중심 ~ 아래 노드 중심을 덮는지 (오차 1.5px)
            const rowsY = [...new Set(g.nodes.map(n => Math.round(n.cy)))].sort((a, b) => a - b);
            let gaps = 0;
            for (let i = 0; i < rowsY.length - 1; i++) {
                const covered = g.lines.some(l => l.y0 <= rowsY[i] + 1.5 && l.y1 >= rowsY[i + 1] - 1.5);
                if (!covered) { gaps++; console.log(`   [gap] ${branch} y ${rowsY[i]}→${rowsY[i + 1]} 미연결`); }
            }
            ok(gaps === 0, `${branch}: 세로 연결선 끊김 ${gaps}구간`);

            // ③ 가로 바가 좌우 노드 안쪽 가장자리에 맞물리는지 (원본 정합 — 오차 1px)
            for (const bar of g.bars) {
                const pair = g.nodes.filter(n => Math.abs(n.cy - bar.cy) < 2).sort((a, b) => a.cx - b.cx);
                if (pair.length !== 2) { fails.push(`${branch}: 가로 바 y=${bar.cy.toFixed(0)}에 짝 노드 ${pair.length}개`); continue; }
                ok(bar.x0 <= pair[0].cx + pair[0].d / 2 + 1 && bar.x1 >= pair[1].cx - pair[1].d / 2 - 1,
                    `${branch}: 가로 바가 노드에 안 닿음 ${bar.x0.toFixed(1)}~${bar.x1.toFixed(1)}`);
            }

            // ④ 첫 노드 위·마지막 노드 아래로 삐져나온 선 없음
            const firstCy = rowsY[0], lastCy = rowsY[rowsY.length - 1];
            const above = g.lines.filter(l => l.y0 < firstCy - 1.5);
            const below = g.lines.filter(l => l.y1 > lastCy + 1.5);
            ok(above.length === 0, `${branch}: 첫 노드 위로 뻗은 선 ${above.length}개 (y0=${above.map(l => l.y0.toFixed(0))})`);
            ok(below.length === 0, `${branch}: 마지막 노드 아래로 뻗은 선 ${below.length}개`);
            // 픽셀 스캔 교차검증 — 트리 축의 '진행률 텍스트 아래 ~ 첫 노드 위' 구간에 선 픽셀이 없어야 한다.
            // (트렁크를 지운 뒤로 .tech-tree-col 자체가 첫 노드에서 시작하므로, 옛 트렁크가 그려지던
            //  바깥 여백까지 담으려면 패널을 통째로 찍어야 한다. 진행률 텍스트는 축에 걸리므로 제외한다.)
            const shot = (await page.locator('#panel-tech').screenshot()).toString('base64');
            // 좌표는 스크린샷과 같은 순간의 DOM에서 다시 잰다 — 앞서 잰 rect를 쓰면 그 사이 레이아웃이
            // 움직였을 때(아이콘 로드·패널 전환) 엉뚱한 구간을 스캔한다.
            const stray = await page.evaluate(async ({ b64 }) => {
                const panel = document.getElementById('panel-tech');
                const pr = panel.getBoundingClientRect();
                const pctEl = panel.querySelector('.tech-branch-detail-pct');
                const col = panel.querySelector('.tech-tree-col');
                const colR = col.getBoundingClientRect();
                const cx = colR.left + colR.width / 2;
                const firstTop = Math.min(...[...col.querySelectorAll('.tech-tree-node')].map(n => n.getBoundingClientRect().top));
                const yStart = (pctEl ? pctEl.getBoundingClientRect().bottom : pr.top) + 2 - pr.top;
                const img = new Image();
                await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
                const cv = document.createElement('canvas');
                cv.width = img.width; cv.height = img.height;
                const ctx = cv.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const sx = img.width / pr.width;                  // 스크린샷은 CSS px과 배율이 같지만 방어적으로 환산
                const x = Math.round((cx - pr.left) * sx);
                const y0 = Math.round(yStart * sx);
                const y1 = Math.round((firstTop - pr.top) * sx) - 2; // 첫 노드 윗변 2px 위까지
                if (y1 - y0 <= 0) return { hit: 0, scanned: 0 };
                const h = y1 - y0;
                const strip = ctx.getImageData(Math.max(0, x - 2), y0, 5, h).data; // 한 번에 읽는다(픽셀별 호출은 느리다)
                let hit = 0;
                for (let y = 0; y < h; y++) {
                    for (let dx = 0; dx < 5; dx++) {
                        const p = (y * 5 + dx) * 4;
                        if (strip[p + 3] > 40 && strip[p] < 120 && strip[p + 1] < 120 && strip[p + 2] < 120) { hit++; break; }
                    }
                }
                return { hit, scanned: h };
            }, { b64: shot });
            ok(stray.hit === 0, `${branch}: 첫 노드 위 픽셀 스캔에서 선 ${stray.hit}px 검출`);

            console.log(`  ${branch}: 노드 ${g.nodes.length} · 행 ${rowsY.length} · 세로선 ${g.lines.length} · 가로바 ${g.bars.length}`
                + ` · 단계태그 ${g.tags.join('')} · 첫노드위 스캔 ${stray.scanned}px 중 선 ${stray.hit}px`);
        }

        // ⑤ 잠금/해금 로직 — 실제 화면·실클릭으로 확인 (forge 분기: 1단계 2노드)
        await openBranch(page, 'forge');
        const lockBefore = await page.evaluate(() => {
            S.potions = 1e9;
            UI.openTechBranch('forge');
            const t1 = TechTree.tierNodes('forge', 1), t2 = TechTree.tierNodes('forge', 2);
            return {
                t1open: t1.every(id => TechTree.isUnlocked(id)),
                t2open: t2.some(id => TechTree.isUnlocked(id)),
                t2start: TechTree.canStart(t2[0]),
                locked: [...document.querySelectorAll('.tech-tree-node.tlocked')].length,
            };
        });
        ok(lockBefore.t1open, '1단계 노드가 잠겨 있음');
        ok(!lockBefore.t2open && !lockBefore.t2start, '1단계 미완료인데 2단계가 열려 있음');
        ok(lockBefore.locked > 0, '잠긴 노드 표시(.tlocked)가 0개');

        // 잠긴 노드 팝업: [연구 시작]이 아니라 잠김 안내가 떠야 한다
        const lockedPopup = await page.evaluate(() => {
            UI.openTechNode(TechTree.tierNodes('forge', 2)[0]);
            const t = document.getElementById('detail-modal').innerText;
            UI.closeDetail();
            return t;
        });
        ok(/잠김/.test(lockedPopup) && /단계를 모두 완료하면 열립니다/.test(lockedPopup),
            `잠긴 노드 팝업 문구 이상: ${JSON.stringify(lockedPopup.slice(0, 80))}`);

        // 상한 확인: 6레벨을 넣어도 5로 잘리는지 + 만렙 노드는 연구 시작 불가
        const capped = await page.evaluate(() => {
            const t1 = TechTree.tierNodes('forge', 1);
            S.tech[t1[0]] = 9; TechTree.ensure();
            return { lv: TechTree.level(t1[0]), start: TechTree.canStart(t1[0]) };
        });
        ok(capped.lv === 5, `상한 초과 세이브가 ${capped.lv}로 남음 (5여야 함)`);
        ok(capped.start === false, '만렙 노드에서 연구 시작이 가능함');

        // 1단계를 전부 만렙으로 → 2단계 해금 + 실클릭으로 연구 시작
        const unlocked = await page.evaluate(() => {
            TechTree.tierNodes('forge', 1).forEach(id => { S.tech[id] = 5; });
            UI.openTechBranch('forge');
            const t2 = TechTree.tierNodes('forge', 2);
            return { open: t2.every(id => TechTree.isUnlocked(id)), can: TechTree.canStart(t2[0]), id: t2[0],
                     t3open: TechTree.tierNodes('forge', 3).some(id => TechTree.isUnlocked(id)) };
        });
        ok(unlocked.open && unlocked.can, '1단계 완료 후에도 2단계가 잠겨 있음');
        ok(!unlocked.t3open, '2단계 미완료인데 3단계가 열려 있음');

        // 노드 → 팝업 → [연구 시작] 실클릭 (좌표 히트 테스트 포함)
        const nodeBox = await page.evaluate((id) => {
            const idx = TechTree.BRANCHES.find(b => b.id === 'forge').nodes.indexOf(id);
            const el = document.querySelectorAll('.tech-tree-node')[idx];
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, self: hit === el };
        }, unlocked.id);
        ok(nodeBox.self, '2단계 노드 중앙이 다른 요소에 덮임');
        await page.mouse.click(nodeBox.x, nodeBox.y);
        await page.waitForTimeout(150);
        const started = await page.evaluate(() => {
            const btn = [...document.querySelectorAll('#detail-modal button')].find(b => /연구 시작/.test(b.textContent));
            if (!btn) return { err: 'no-start-btn' };
            const r = btn.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            btn.click();
            return { self: hit === btn || btn.contains(hit), running: !!S.techResearch, id: S.techResearch && S.techResearch.id };
        });
        ok(!started.err && started.self && started.running,
            `2단계 노드 연구 시작 실패: ${JSON.stringify(started)}`);

        // 연구 중 배지가 붙어도 행 피치(=선 연속성)가 안 흔들리는지
        const pitchOk = await page.evaluate(() => {
            UI.closeDetail(); UI.openTechBranch('forge');
            const ys = [...new Set([...document.querySelectorAll('.tech-tree-node')]
                .map(n => Math.round(n.getBoundingClientRect().top)))].sort((a, b) => a - b);
            const d = ys.slice(1).map((y, i) => y - ys[i]);
            return { d, uniform: d.every(v => Math.abs(v - d[0]) <= 1) };
        });
        ok(pitchOk.uniform, `연구 중 행 피치가 흔들림: ${pitchOk.d.join(',')}`);
        console.log(`  잠금/해금: 1단계 열림·2단계 잠김 → 1단계 만렙 → 2단계 해금·연구 시작 OK · 행 피치 ${pitchOk.d.join('/')}`);
        await page.close();
    }

    console.log(`\n실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건`);
    fails.forEach(f => console.log('  FAIL ' + f));
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
