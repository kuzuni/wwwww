// 기술트리 '자물쇠 표시 없음' 검증 (`techtree-no-lock-icon`, 사용자 지시 2026-08-19)
//   "기술트리에서 강화 아직 못하는 것들 자물쇠 표시는 하지 말자. 뭐가 있는지는 사람들이 볼 수 있어야 함."
// 게이트:
//   ① 분기 상세의 **잠긴 노드(.tlocked)에 자물쇠 아이콘이 0건** (`.ico-lock` / 🔒 문자 모두)
//   ② 잠긴 노드도 **내용 아이콘이 그려져 있다**(빈 원 금지 — techIcon 이 실제로 붙었는지 확인)
//   ③ 잠긴 노드의 아이콘이 열린 노드와 **같은 종류**(내용이 가려지지 않았다)
//   ④ 잠긴 노드 팝업: 자물쇠 0건 + 헤더 아이콘 = 그 노드 내용 아이콘 + 선행조건 안내는 그대로
//   ⑤ 잠김은 비활성 처리로만 구분 — `.tlocked` 가 붙어 있고 회색조 필터가 실제 계산값에 있다
//   ⑥ 콘솔 에러 0
// 사용: node tools/probe-techtree-nolock.js
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
    await page.waitForTimeout(400);

    const res = await page.evaluate(() => {
        const out = { fails: [], branches: [], popup: null };
        const ALL = [].concat(...TechTree.BRANCHES.map(b => TechTree.nodesOf(b.id)));
        for (const id of ALL) S.tech[id] = 0;   // 전부 0레벨 = 잠긴 노드가 가장 많은 상태
        TechTree.ensure();

        const iconKey = (el) => {
            if (!el) return null;
            const ico = el.querySelector('.ico, img');
            if (!ico) return null;
            if (ico.tagName === 'IMG') return 'img:' + (ico.getAttribute('alt') || ico.src.slice(-24));
            return [...ico.classList].filter(c => c !== 'ico').join('.') || 'ico';
        };

        for (const b of TechTree.BRANCHES) {
            UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch(b.id);
            const rec = { id: b.id, locked: 0, open: 0, lockIcons: 0, emptyLocked: [], lockedKinds: {}, openKinds: {}, grayscale: null };
            const nodes = [...document.querySelectorAll('.tech-tree-node')];
            for (const n of nodes) {
                const tid = n.dataset.tid;
                const isLocked = n.classList.contains('tlocked');
                const key = iconKey(n);
                // 자물쇠 흔적: IconGen lock 아이콘 클래스 또는 🔒 문자
                const hasLock = !!n.querySelector('.ico-lock, [class*="lock"]') || /\u{1F512}/u.test(n.textContent);
                if (hasLock) { rec.lockIcons++; out.fails.push(`${b.id}/${tid}: 노드에 자물쇠 표시가 남아 있다`); }
                if (isLocked) {
                    rec.locked++;
                    if (!key) rec.emptyLocked.push(tid);
                    else rec.lockedKinds[TechTree.typeOf(tid)] = key;
                    if (rec.grayscale === null) rec.grayscale = getComputedStyle(n.querySelector('.ico, img') || n).filter;
                } else {
                    rec.open++;
                    if (key) rec.openKinds[TechTree.typeOf(tid)] = key;
                }
            }
            if (rec.emptyLocked.length) out.fails.push(`${b.id}: 잠긴 노드가 빈 원이다 — ${rec.emptyLocked.join(',')}`);
            // ③ 같은 타입이면 잠김/열림 아이콘이 동일해야 한다(내용이 가려지지 않음)
            for (const t of Object.keys(rec.lockedKinds)) {
                if (rec.openKinds[t] && rec.openKinds[t] !== rec.lockedKinds[t]) {
                    out.fails.push(`${b.id}/${t}: 잠긴 노드 아이콘(${rec.lockedKinds[t]})이 열린 노드(${rec.openKinds[t]})와 다르다`);
                }
            }
            if (!rec.locked) out.fails.push(`${b.id}: 잠긴 노드가 하나도 없어 검사가 무의미하다`);
            out.branches.push(rec);
        }

        // ④ 잠긴 노드 팝업
        const brId = TechTree.BRANCHES[0].id;
        UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch(brId);
        const lockedNode = [...document.querySelectorAll('.tech-tree-node.tlocked')][0];
        const lid = lockedNode && lockedNode.dataset.tid;
        const nodeKey = iconKey(lockedNode);
        UI.openTechNode(lid);
        const card = document.querySelector('[data-tech-node]');
        const head = card && card.querySelector('.idet-icon');
        out.popup = {
            id: lid,
            nodeKey,
            headKey: iconKey(head),
            hasLock: !!(card && (card.querySelector('.ico-lock, [class*="lock"]') || /\u{1F512}/u.test(card.textContent))),
            guide: !!(card && /1레벨 이상 올리면 열립니다/.test(card.textContent)),
            name: !!(card && card.querySelector('.idet-name') && card.querySelector('.idet-name').textContent.trim()),
            desc: !!(card && card.querySelector('.idet-lead')),
            dim: !!(head && head.classList.contains('tn-dim')),
            headFilter: head ? getComputedStyle(head.querySelector('.ico, img') || head).filter : null,
        };
        if (out.popup.hasLock) out.fails.push('노드 팝업에 자물쇠 표시가 남아 있다');
        if (!out.popup.headKey) out.fails.push('노드 팝업 헤더 아이콘이 비어 있다');
        if (out.popup.headKey !== out.popup.nodeKey) out.fails.push(`팝업 헤더 아이콘(${out.popup.headKey}) ≠ 노드 아이콘(${out.popup.nodeKey})`);
        if (!out.popup.guide) out.fails.push('선행조건 안내 문구가 사라졌다');
        if (!out.popup.desc) out.fails.push('노드 설명(내용)이 안 보인다');
        if (!out.popup.dim) out.fails.push('팝업 헤더에 비활성(tn-dim) 처리가 없다');
        return out;
    });

    // 스크린샷: 잠긴 노드가 가장 많은 상태의 분기 상세 + 잠긴 노드 팝업
    await page.evaluate(() => { UI.closeDetail(); UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch(TechTree.BRANCHES[0].id); });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.resolve(__dirname, 'techtree-nolock-branch.png') });
    await page.evaluate(() => {
        const n = [...document.querySelectorAll('.tech-tree-node.tlocked')][0];
        UI.openTechNode(n.dataset.tid);
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.resolve(__dirname, 'techtree-nolock-popup.png') });

    for (const b of res.branches) {
        console.log(`[${b.id}] 잠김 ${b.locked} · 열림 ${b.open} · 자물쇠 ${b.lockIcons} · 잠김필터 ${b.grayscale}`);
    }
    console.log('팝업:', JSON.stringify(res.popup));
    const filterOk = res.branches.every(b => b.grayscale && b.grayscale !== 'none');
    if (!filterOk) res.fails.push('잠긴 노드 아이콘에 비활성(회색조) 처리가 없다');
    console.log('콘솔 에러', errs.length, errs.slice(0, 5));
    if (res.fails.length || errs.length) {
        console.log('❌ FAIL\n - ' + res.fails.concat(errs).join('\n - '));
        await browser.close(); process.exit(1);
    }
    console.log('✅ PASS — 잠긴 노드 자물쇠 0건 · 내용 아이콘 노출 · 비활성 처리만으로 구분');
    await browser.close();
})();
