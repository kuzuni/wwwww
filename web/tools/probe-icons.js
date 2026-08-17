// IconGen 적용 검증 — 재화 아이콘이 들어간 화면 캡처 + '프레임 대비 아이콘 채움률' / pill 높이 회귀 실측
// 사용: PW_PATH=<playwright 경로> node probe-icons.js [출력디렉터리]
// (부팅·시드 절차는 shot-screens.js 와 동일한 검증된 패턴을 따른다)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || path.join(__dirname, 'icon-cmp');
fs.mkdirSync(OUT, { recursive: true });

const SCREENS = [
    ['main', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();`],
    ['pets', `UI.switchTab('summon'); UI.switchSummonSub('pets')`],
    ['skills', `UI.switchTab('summon'); UI.switchSummonSub('skills')`],
    ['mounts', `UI.openMounts()`],
    ['shop', `UI.openShop()`],
    ['forge-info', `UI.openForgeInfo()`],
    ['pet-upgrade', `UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.openPetUpgrade(0)`],
];

const SEED = () => {
    S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9;
    S.hammers = 3.02e5; S.coins = 2.71e7; S.gems = 8150;
    S.forgeLevel = 29; S.summonCount = 260;
    S.tickets = 99999; Skills.summon(false, 30); S.tickets = 160;
    S.eggCurrency = 5000; Pets.summon(30);
    for (let i = 0; i < 6 && S.eggs.length; i++) {
        const e = S.eggs.shift();
        S.pets.push({ name: 'pet' + i, rarity: e.rarity, level: 10 + i * 3, dupes: 4 });
    }
    if (S.hatching.length < 2 && S.eggs.length) S.hatching.push({ rarity: S.eggs.shift().rarity, endsAt: U.now() + 3600e3 });
    S.activePets = [0, 1, 2].filter(i => S.pets[i]);
    S.eggCurrency = 900;
    S.winders = 4000; Mounts.summon(12); S.winders = 320;
    S.potions = 45;
    saveGame();
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && typeof Forge !== 'undefined', null, { timeout: 20000 });
    await page.evaluate(SEED);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && S.forgeLevel === 29, null, { timeout: 20000 });
    await page.waitForTimeout(2200);

    for (const [name, src] of SCREENS) {
        try {
            await page.evaluate(() => {
                try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
            });
            await page.waitForTimeout(120);
            await page.evaluate(new Function(src));
            await page.waitForTimeout(650);
            await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
            await page.screenshot({ path: path.join(OUT, name + '.png') });
        } catch (e) {
            errors.push('SCREEN ' + name + ': ' + e.message);
        }
    }

    // 채움률 + pill 높이 실측 (화면을 돌아다닌 뒤 메인으로 복귀해 측정)
    const metrics = await page.evaluate(() => {
        try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        UI.switchTab('summon'); UI.switchSummonSub('pets');
        const rows = [];
        document.querySelectorAll('.ico').forEach((img) => {
            const frame = img.closest('.pill, .cur-pill, .fi-pill-ico, .hatch-egg, .tile-face, small');
            if (!frame) return;
            const a = img.getBoundingClientRect(), b = frame.getBoundingClientRect();
            if (!a.height || !b.height) return;
            rows.push({
                frame: (frame.className || frame.tagName.toLowerCase()).split(' ').slice(0, 2).join('.'),
                icoH: +a.height.toFixed(1), frameH: +b.height.toFixed(1),
                fill: +(a.height / b.height * 100).toFixed(1),
            });
        });
        const pills = [...document.querySelectorAll('.currency-pills .pill')].map(p => +p.getBoundingClientRect().height.toFixed(2));
        const tb = document.querySelector('.topbar');
        return { rows, pillHeights: pills, topbarH: tb ? +tb.getBoundingClientRect().height.toFixed(2) : null };
    });

    fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log('pill heights:', metrics.pillHeights, '| topbar:', metrics.topbarH);
    const seen = {};
    metrics.rows.forEach(r => { (seen[r.frame] = seen[r.frame] || []).push(r.fill); });
    Object.entries(seen).forEach(([k, v]) => console.log(`  ${k}: ${v[0]}% (n=${v.length}, 프레임 ${metrics.rows.find(r => r.frame === k).frameH}px)`));
    console.log(errors.length ? '\nERRORS(' + errors.length + '):\n' + errors.slice(0, 15).join('\n') : '\n(no console errors)');
    await browser.close();
})();
