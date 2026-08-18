// 기술 노드 팝업 3상태 회귀 확인 — 연구 중 카드에서 회색 설명 패널을 뺀 변경(shot-042605 정합)이
// 나머지 상태(연구 가능 · 잠김 · MAX)를 깨지 않았는지 본다. 콘솔 에러 0 + 각 상태의 필수 요소 존재.
// 사용: node tools/probe-tn-states.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    const page = await browser.newPage({ viewport: { width: 491, height: 881 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && S.forgeLevel === 29, null, { timeout: 60000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });

    const out = await page.evaluate(() => {
        const seen = [];
        const look = (label) => {
            const card = document.querySelector('.item-detail[data-tech-node]');
            const app = document.getElementById('app').getBoundingClientRect();
            const r = card ? card.getBoundingClientRect() : null;
            seen.push({
                label,
                card: !!card,
                researchingClass: card ? card.classList.contains('tn-researching') : null,
                subsPanel: !!(card && card.querySelector('.idet-subs')),
                lead: card ? (card.querySelector('.idet-lead') || {}).textContent : null,
                btns: card ? card.querySelectorAll('.btn').length : 0,
                hPct: r ? +(r.height / app.height * 100).toFixed(2) : null,
            });
        };
        UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch('skillpet');

        // ① 연구 중
        const a = TechTree.nid('extraEgg', 4);
        S.tech = S.tech || {};
        for (let t = 1; t < 4; t++) S.tech[TechTree.nid('extraEgg', t)] = 5;
        S.tech[a] = 1;
        S.techResearch = { id: a, endsAt: U.now() + 13.5 * 3600e3 };
        UI.openTechNode(a); look('연구 중');

        // ② 연구 가능(진행 중인 연구 없음, 1단계 노드)
        S.techResearch = null;
        const b = TechTree.nid('petHp', 1);
        S.potions = 9999;
        UI.openTechNode(b); look('연구 가능');

        // ③ 잠김(부모 0레벨인 상위 단계)
        const c = TechTree.nid('petHp', 3);
        UI.openTechNode(c); look('잠김');

        // ④ MAX
        const dnode = TechTree.nid('petDmg', 1);
        S.tech[dnode] = TechTree.MAX_LEVEL;
        UI.openTechNode(dnode); look('MAX');
        return seen;
    });
    await browser.close();

    let bad = 0;
    for (const s of out) {
        const wantSubs = s.label !== '연구 중';
        const ok = s.card && s.subsPanel === wantSubs && (s.label !== '연구 중' || s.researchingClass) && s.hPct > 10;
        if (!ok) bad++;
        console.log(`${s.label.padEnd(6)} 카드 ${s.card ? 'O' : 'X'} · tn-researching ${s.researchingClass} · 설명패널 ${s.subsPanel}(기대 ${wantSubs}) · 버튼 ${s.btns} · 높이 ${s.hPct}%H  ${ok ? 'OK' : 'FAIL'}`);
    }
    console.log(`콘솔/페이지 에러: ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    console.log(`=> ${bad === 0 && errors.length === 0 ? 'PASS' : `불통과 ${bad}건`}`);
    process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
})();
