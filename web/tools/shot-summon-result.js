// 소환 결과 연출 팝업 캡처 — 등장 연출 타이밍(연속 프레임) + x1/x5/x75 그리드 확인
// 사용: PW_PATH=<playwright 경로> node shot-summon-result.js [출력디렉터리]
const { chromium } = require(process.env.PW_PATH || 'playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.join(__dirname, 'summon-result');
fs.mkdirSync(OUT, { recursive: true });

// 소환이 실제로 굴러가도록 재화를 채운다 (밸런스 수치는 건드리지 않고 세이브 값만 주입)
const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9;
    saveGame();
`;

// [이름, 소환 실행 소스, 연속 캡처할 시각(ms)]
const CASES = [
    ['skill-x5', `S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`,
        [120, 380, 620, 900, 1400, 3400]],
    ['pet-x5', `S.summonMult = {pet:5}; UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.onSummonPetEgg();`, [900, 3400]],
    ['mount-x5', `S.summonMult = {mount:5}; UI.openMounts(); UI.onSummonMount();`, [900, 3400]],
    ['skill-x1', `S.summonMult = {skill:1}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, [900, 3400]],
    ['skill-x75', `S.summonMult = {skill:75}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, [900, 3400]],
    // 고등급 광채/광선 확인 — 소환 레벨을 만렙으로 올려 전설 이상이 나오게 한다
    ['skill-x5-hi', `S.summonCount = 5000; S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`, [1400, 3400]],
    ['mount-x1-hi', `S.mountOpens = 5000; S.summonMult = {mount:1}; UI.openMounts(); UI.onSummonMount();`, [1400, 3400]],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const errors = [];
    for (const [name, open, times] of CASES) {
        const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
        page.on('pageerror', e => errors.push(`${name} PAGEERROR ${e}`));
        page.on('console', m => { if (m.type() === 'error') errors.push(`${name} CONSOLE ${m.text()}`); });
        await page.goto(INDEX);
        await page.waitForFunction('typeof UI !== "undefined" && UI.els');
        await page.evaluate(SEED);
        await page.waitForTimeout(300);
        const t0 = Date.now();
        await page.evaluate(open);
        for (const t of times) {
            const wait = t - (Date.now() - t0);
            if (wait > 0) await page.waitForTimeout(wait);
            await page.screenshot({ path: path.join(OUT, `${name}-${t}.png`) });
        }
        // 상태 점검: 연출 종료 여부 + 셀 수 + 확인 버튼 노출
        const st = await page.evaluate(`(() => {
            const m = UI.els.summonResultModal;
            const ok = m.querySelector('.sr-ok');
            return {
                open: !m.classList.contains('hidden'),
                done: m.classList.contains('done'),
                cells: m.querySelectorAll('.sr-cell').length,
                revealed: m.querySelectorAll('.sr-cell.on').length,
                okVisible: !!(ok && ok.offsetParent !== null),
                okRect: ok ? ok.getBoundingClientRect().toJSON() : null,
                appRect: document.getElementById('app').getBoundingClientRect().toJSON(),
            };
        })()`);
        console.log(name, JSON.stringify(st));
        // 탭으로 닫히는지 확인
        await page.evaluate(`UI.onSummonResultTap()`);
        const closed = await page.evaluate(`UI.els.summonResultModal.classList.contains('hidden')`);
        console.log(`${name} closed-by-tap: ${closed}`);
        await page.close();
    }
    await browser.close();
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO CONSOLE/PAGE ERRORS');
})();
