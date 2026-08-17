// 새 아이콘(자물쇠·열쇠·선물·트로피)이 실제로 붙는 화면을 찍는다 — 던전 목록/상세, 리그, 리그 보상, 기술 트리.
// 사용: node shot-icon-badges.js  → tools/icon-badges-*.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SHOTS = [
    ['dungeons', () => UI.openDungeons()],
    ['dungeon-detail', () => { UI.openDungeons(); UI.openDungeonDetail('hammer'); }],
    ['league', () => UI.openLeague()],
    ['league-rewards', () => { UI.openLeague(); UI.openLeagueRewards(); }],
    // 앞 컷에서 연 팝업들이 그대로 덮으므로 전부 닫고 간다(샷마다 상태가 누적된다).
    ['tech', () => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch('power');
    }],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof IconGen !== "undefined"');
    await page.waitForTimeout(1500);
    for (const [name, fn] of SHOTS) {
        await page.evaluate(`(${fn.toString()})()`);
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.resolve(__dirname, `icon-badges-${name}.png`) });
        console.log('찍음', name);
    }
    console.log('콘솔 에러', errs.length + '건', errs.slice(0, 3));
    await browser.close();
})();
