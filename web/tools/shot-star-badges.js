// ⭐ 배지가 붙는 화면을 찍는다 — 장비 그리드(cell-star), 스킬/펫/탈것 타일(sk-star),
// 비교 팝업(cmp-star), 리그(league-score), 승천 팝업.
// 별이 실제로 보이도록 승천 카운트와 아이템 별을 시드로 넣는다.
// 사용: node shot-star-badges.js  → tools/star-badges-*.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 공용 시드(장비 8부위·스킬 15종·펫·탈것)를 그대로 쓰고 별만 얹는다 —
// 갓 만든 세이브는 장비·펫이 비어 있어 별 배지가 아예 안 그려진다.
const { SEED_SRC } = require('./shot-screens-seed.js');
const STARS = () => {
    Ascension.ensure();
    for (const l of Ascension.LINES) S.lineAscend[l] = 3;
    Object.values(S.equipment || {}).forEach(it => { if (it) it.stars = 3; });
    Object.values(S.skills || {}).forEach(k => { if (k && typeof k === 'object') k.stars = 2; });
    Object.values(S.mounts || {}).forEach(m => { if (m && typeof m === 'object') m.stars = 2; });
    (S.pets || []).forEach(p => { if (p && typeof p === 'object') p.stars = 2; });
    S.bestChapter = 5; S.bestStage = 5;
};
// 서브탭 id 는 복수형('skills'/'pets'/'tech')이다 — 단수로 부르면 조용히 무시돼 직전 서브탭
// (기술 트리)이 그대로 찍힌다. 빈 화면처럼 보여 '스킬 그리드가 깨졌다'로 오해하기 쉽다.
const SHOTS = [
    ['gear', () => { UI.switchTab('forge'); }],
    ['skills', () => { UI.switchTab('summon'); UI.switchSummonSub('skills'); }],
    ['pets', () => { UI.switchTab('summon'); UI.switchSummonSub('pets'); }],
    ['league', () => { UI.openLeague(); }],
    ['ascension', () => { document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden')); UI.openAscension(); }],
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
    await page.evaluate(SEED_SRC);
    await page.evaluate(`(${STARS.toString()})()`);
    await page.waitForTimeout(500);
    for (const [name, fn] of SHOTS) {
        await page.evaluate(`(${fn.toString()})()`);
        await page.waitForTimeout(800);
        // 시드를 넣으면 3D 씬이 무거워져 screenshot 내부의 폰트 대기가 30초를 넘긴다
        // (shot-screens.js 가 쓰는 우회 그대로: fonts.ready 를 상한 걸어 먼저 소화 + 타임아웃 상향).
        await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => {});
        await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
        await page.screenshot({ path: path.resolve(__dirname, `star-badges-${name}.png`), timeout: 60000 });
        console.log('찍음', name);
    }
    console.log('콘솔 에러', errs.length + '건', errs.slice(0, 3));
    await browser.close();
})();
