// 기술 트리 로직 회귀 검사 — `techtree-node-logic` (사용자 지시 2026-08-19)
//
// 세 가지를 실제 게임 상태로 검증한다:
//  ① 해금 = **바로 위 행에 그려진 노드 전부** 1레벨 이상 (2개면 둘 다, 1개면 그것)
//     — 사용자가 준 두 예시를 그대로 재현한다: 방어구@1 ← 무기@1, 무기@2 ← 탈것소환비용@1 + 추가탈것@1
//     — 그려진 선(drawTechLinks)의 부모-자식 쌍과 parentsOf 가 **완전히 일치**하는지도 본다
//       (예전엔 선은 이웃 행, 잠금은 같은 타입 세로 레일이라 서로 어긋나 있었다)
//  ② 연구 시작 후 취소 불가 — cancel() 이 거절하고 물약이 환불되지 않는다, UI 에 [취소] 버튼이 없다
//  ③ 시간이 끝나도 레벨은 그대로, [완료](claim)를 눌러야 오른다. 완료 전에는 다른 연구도 못 건다.
//
// 사용: PW_PATH=... node check-techtree-logic.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const fails = [];
    const check = (name, ok, detail) => {
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`);
        if (!ok) fails.push(name + (detail ? ' (' + detail + ')' : ''));
    };

    // ── ① 부모 규칙 ──
    const p = await page.evaluate(() => {
        TechTree.ensure();
        for (const k of Object.keys(S.tech)) S.tech[k] = 0;   // 깨끗한 트리에서 판정
        S.techResearch = null;
        const P = id => TechTree.parentsOf(id);
        return {
            armor1: P('armorMastery@1'),
            weapon1: P('weaponMastery@1'),
            weapon2: P('weaponMastery@2'),
            armorUnlockedAt0: TechTree.isUnlocked('armorMastery@1'),
            weapon1Unlocked: TechTree.isUnlocked('weaponMastery@1'),
        };
    });
    check('방어구@1 의 부모 = [무기@1]', JSON.stringify(p.armor1) === '["weaponMastery@1"]', JSON.stringify(p.armor1));
    check('무기@1 은 부모 없음(트리 첫 행)', p.weapon1.length === 0 && p.weapon1Unlocked === true);
    check('무기@2 의 부모 = [탈것소환비용@1, 추가탈것@1]',
        JSON.stringify(p.weapon2) === '["mountCost@1","extraMount@1"]', JSON.stringify(p.weapon2));
    check('부모가 0레벨이면 잠김', p.armorUnlockedAt0 === false);

    // 부모 둘 중 하나만 올리면 아직 잠김, 둘 다 올려야 열린다
    const two = await page.evaluate(() => {
        S.tech['mountCost@1'] = 1;
        const half = TechTree.isUnlocked('weaponMastery@2');
        S.tech['extraMount@1'] = 1;
        const full = TechTree.isUnlocked('weaponMastery@2');
        S.tech['mountCost@1'] = 0; S.tech['extraMount@1'] = 0;
        return { half, full };
    });
    check('부모 2개 중 1개만 1레벨 → 여전히 잠김', two.half === false);
    check('부모 2개 다 1레벨 → 열림', two.full === true);

    // 그려진 선과 parentsOf 의 일치 — 분기 화면을 열어 실제 SVG 를 읽는다
    const links = await page.evaluate(() => {
        UI.switchTab('summon'); UI.switchSummonSub('tech');
        UI.openTechBranch('power');
        const svg = document.querySelector('.tech-tree-links');
        const pairs = new Set();
        // 스텁이 가상 노드 'barN' 을 거치므로 bar 를 허브로 보고 위→아래를 펼친다
        const up = {}, down = {};
        [...svg.querySelectorAll('.tt-link')].forEach(el => {
            const f = el.dataset.from, t = el.dataset.to;
            if (f === t) return;                       // 가로 바 자체
            if (/^bar/.test(t)) (up[t] = up[t] || []).push(f);
            else if (/^bar/.test(f)) (down[f] = down[f] || []).push(t);
            else pairs.add(f + '>' + t);
        });
        for (const bar of Object.keys(down)) for (const a of (up[bar] || [])) for (const c of down[bar]) pairs.add(a + '>' + c);
        const fromParents = new Set();
        TechTree.nodesOf('power').forEach(id => TechTree.parentsOf(id).forEach(par => fromParents.add(par + '>' + id)));
        const onlyDrawn = [...pairs].filter(x => !fromParents.has(x));
        const onlyLogic = [...fromParents].filter(x => !pairs.has(x));
        return { drawn: pairs.size, logic: fromParents.size, onlyDrawn: onlyDrawn.slice(0, 5), onlyLogic: onlyLogic.slice(0, 5) };
    });
    check('그려진 선 = parentsOf 부모-자식 쌍 (완전 일치)',
        links.drawn > 0 && links.onlyDrawn.length === 0 && links.onlyLogic.length === 0,
        `선 ${links.drawn} · 로직 ${links.logic} · 선만 ${JSON.stringify(links.onlyDrawn)} · 로직만 ${JSON.stringify(links.onlyLogic)}`);

    // ── ② 취소 불가 ──
    const cancel = await page.evaluate(() => {
        S.potions = 1e9;
        const id = 'weaponMastery@1';
        const before = S.potions;
        TechTree.start(id);
        const spent = before - S.potions;
        const r = TechTree.cancel();
        return { started: !!S.techResearch, spent, cancelReturned: r, stillResearching: !!S.techResearch, potions: S.potions, refunded: S.potions > before - spent };
    });
    check('연구가 시작된다', cancel.started === true && cancel.spent > 0);
    check('cancel() 이 거절한다', cancel.cancelReturned === false && cancel.stillResearching === true);
    check('취소 환불이 없다', cancel.refunded === false);

    const uiCancel = await page.evaluate(() => {
        UI.openTechNode('weaponMastery@1');
        const card = document.querySelector('[data-tech-node]');
        return { hasCancel: !!card.querySelector('.tn-cancel'), hasSkip: !!card.querySelector('.tn-skip'), html: card.innerHTML.indexOf('취소 불가') >= 0 };
    });
    check('노드 팝업에 [취소] 버튼이 없다', uiCancel.hasCancel === false);
    check('[건너뛰기] 는 남아 있다', uiCancel.hasSkip === true);
    check("'취소 불가' 안내가 뜬다", uiCancel.html === true);

    // ── ③ 시간이 끝나도 [완료] 를 눌러야 레벨업 ──
    const done = await page.evaluate(() => {
        const id = S.techResearch.id;
        S.techResearch.endsAt = U.now() - 1;            // 시간만 끝낸다
        TechTree.tick();                                 // 예전 구현은 여기서 레벨을 올렸다
        const lvAfterTick = TechTree.level(id);
        const isDone = TechTree.isDone();
        const blocked = !TechTree.canStart('armorMastery@1'); // 수령 전에는 다른 연구 못 건다
        UI.openTechNode(id);
        const hasClaim = !!document.querySelector('[data-tech-node] .tn-claim');
        const claimed = TechTree.claim();
        return { id, lvAfterTick, isDone, blocked, hasClaim, claimed, lvAfterClaim: TechTree.level(id), research: S.techResearch };
    });
    check('시간이 끝나도 tick() 이 레벨을 안 올린다', done.lvAfterTick === 0, 'Lv.' + done.lvAfterTick);
    check('isDone() = 수령 대기', done.isDone === true);
    check('수령 전에는 다른 연구를 못 건다', done.blocked === true);
    check('팝업에 [완료] 버튼이 뜬다', done.hasClaim === true);
    check('[완료] 를 누르면 레벨이 오른다', done.claimed === true && done.lvAfterClaim === 1, 'Lv.' + done.lvAfterClaim);
    check('수령 후 연구 슬롯이 비워진다', done.research === null);

    await page.evaluate(() => { UI.closeDetail(); UI.openTechBranch('power'); });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.resolve(__dirname, 'techtree-logic.png') });

    if (errors.length) { console.log('콘솔 에러:'); errors.slice(0, 8).forEach(e => console.log('   ' + e)); }
    console.log(fails.length ? `\nFAIL ${fails.length}건 — ` + fails.join(' / ') : '\nPASS — 해금·취소불가·완료버튼 전부 통과');
    await browser.close();
    process.exit(fails.length || errors.length ? 1 : 0);
})();
