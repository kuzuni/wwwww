// 던전 이름 회귀 검사 — `dungeon-name-hammer` (2026-08-19)
//
// 원본 표기(3배 확대 대조로 확인): 목록 배너 shot-042251 · 상세 팝업 제목 shot-042304 가
// **`망치 도둑`**, 세 번째 던전이 **`침략`**이다(유령 마을·좀비 러시는 원래 일치).
// 종전 클론은 `해머 도둑`·`침공`이라 두 화면 모두 다른 글자를 찍었다.
//
// 이름이 한 곳이 아니라는 게 이 건의 함정이다 — 기술 트리 노드(이름·설명·보너스 라벨)도 같은 이름을
// 쓴다. 그래서 **던전 화면과 기술 트리 화면을 같이** 보고, 옛 표기가 화면 어디에도 안 남았는지 본다.
//
// 사용: node tools/check-dungeon-names.js
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
        if (!ok) fails.push(name + (detail ? ` (${detail})` : ''));
    };

    // ── 던전 목록 배너 ──
    const list = await page.evaluate(() => {
        S.bestChapter = 20; S.bestStage = 9;
        Dungeons.ensure();
        UI.openDungeons();
        return {
            text: document.getElementById('dungeon-modal').textContent,
            names: Dungeons.DEFS.map(d => d.kr),
        };
    });
    check('던전 정의 이름', list.names[0] === '망치 도둑' && list.names[2] === '침략', list.names.join(' · '));
    check('목록 화면에 망치 도둑', list.text.includes('망치 도둑'));
    check('목록 화면에 침략', list.text.includes('침략'));
    check('목록에 옛 표기 없음', !list.text.includes('해머 도둑') && !list.text.includes('침공'));

    // ── 상세 팝업 제목 ──
    const detail = await page.evaluate(() => {
        UI.openDungeonDetail('hammer');
        return document.getElementById('dungeon-modal').textContent;
    });
    check('상세 팝업 제목', detail.includes('망치 도둑') && !detail.includes('해머 도둑'));

    // ── 기술 트리(노드 이름·설명·보너스 라벨) ──
    const tech = await page.evaluate(() => {
        UI.closeDungeons ? UI.closeDungeons() : UI.switchTab(null);
        TechTree.ensure();
        UI.switchTab('summon'); UI.switchSummonSub('tech');
        UI.openTechBranch('forge');
        const branch = document.body.textContent;
        UI.openTechBonuses && UI.openTechBonuses();
        return {
            defs: [TechTree.def('thiefHammer@1').name, TechTree.def('thiefHammer@1').desc,
                   TechTree.def('thiefCoin@1').name, TechTree.def('thiefCoin@1').desc],
            labels: [TechTree.LABELS ? '' : ''],
            body: branch + document.body.textContent,
        };
    });
    check('기술 노드 이름·설명', tech.defs.every(t => !/해머\s?도둑/.test(t)) && tech.defs.some(t => t.includes('망치 도둑')),
        tech.defs.join(' / '));
    check('기술 화면에 옛 표기 없음', !/해머\s?도둑/.test(tech.body) && !tech.body.includes('침공'));

    console.log(errors.length ? '\n콘솔 에러:\n' + errors.join('\n') : '\n콘솔 에러 0');
    if (errors.length) fails.push('콘솔 에러 ' + errors.length + '건');
    console.log(fails.length ? `\n실패 ${fails.length}건:\n- ` + fails.join('\n- ') : '\n전부 통과');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
