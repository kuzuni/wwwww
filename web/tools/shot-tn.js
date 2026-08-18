// 기술 노드 팝업(shot-042605) 단일 캡처 — '전 UI 비율 전수 검증 패스'용.
// 원본은 **skillpet 분기의 '추가 알 획득 기회 IV' 노드가 연구 진행 중**인 상태다(제목 '스킬, 펫 & 기술').
// shot-screens.js 는 forge 분기/forgeTimer 로 찍어 배경 노드 수·제목이 원본과 달랐다 — 여기서는 원본 상태에 맞춘다.
// 사용: node tools/shot-tn.js [출력파일]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const SC = require('./shot-screens-seed.js');
const OUT = process.argv[2] || path.join(__dirname, 'ref-cmp/clone/tech-node.png');

(async () => {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 491, height: 881 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 40000 });
    await page.evaluate(SC.SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S && S.forgeLevel === 29, null, { timeout: 40000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; });
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
    const info = await page.evaluate(() => {
        // 원본 노드 = '추가 알 획득 기회 IV' → 우리 트리의 extraEgg 4단계. 레벨 1/5 · 연구 진행 중.
        const branch = 'skillpet';
        const pick = TechTree.nid('extraEgg', 4);
        S.tech = S.tech || {};
        for (let t = 1; t < 4; t++) S.tech[TechTree.nid('extraEgg', t)] = 5;      // 부모 사슬 해금
        S.tech[pick] = 1;                                                        // 원본 배지 '1/5'
        S.techResearch = { id: pick, endsAt: U.now() + (13 * 60 + 30) * 60e3 };   // 원본 '13시 30분'
        UI.switchTab('summon'); UI.switchSummonSub('tech');
        UI.openTechBranch(branch); UI.openTechNode(pick);
        return { branch, pick, name: (TechTree.def(pick) || {}).name, lv: TechTree.level(pick) };
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT });
    await browser.close();
    console.log(JSON.stringify(info));
    console.log(`저장: ${OUT} · 에러 ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
})();
