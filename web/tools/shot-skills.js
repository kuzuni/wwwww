// 스킬 화면 한 장만 캡처 (원본 shot-042340 대조용) — 전체 31화면 캡처보다 빠른 반복용
// 사용: PW_PATH=<playwright> node shot-skills.js [출력png]
//
// shot-screens.js 의 캡처 규약을 그대로 따른다(안 지키면 캡처가 오염된다):
//   · 시드를 넣고 **reload** 해야 시드 상태로 부팅한 화면이 나온다
//   · `UI.toast` 를 막는다 — 전투 틱이 캡처 직전에 '첫 클리어' 토스트를 띄워 그리드를 덮은 실제 사례
//   · 자동 제련이 캡처 대기 중 제작을 돌려 **비교 팝업이 화면을 통째로 덮는다** — showCraftModal 를 막는다
//   · `document.fonts.ready` 를 상한을 걸어 먼저 소화하지 않으면 screenshot 이 폰트 대기에서 30초 타임아웃 난다
// 원본은 소환 배수가 **x5**(비용 160 = 32×5)라 같은 상태로 맞춘다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const { SEED_SRC } = require('./shot-screens-seed.js');
const OUT = process.argv[2] || path.join(__dirname, 'ref-cmp/clone/skills.png');
const { stampFresh } = require('./clone-fresh.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(SEED_SRC);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && S && S.forgeLevel === 29', { label: '시드 상태 로드' });
    await page.evaluate(() => {
        UI.toast = () => { };
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        // ⚠️ showCraftModal 을 막는 것만으로는 부족하다 — 시드가 자동 제련을 켠 채 저장하므로
        // **부팅 직후 보류 제작품(S.pendingCraft)이 비교 팝업으로 이미 떠 있다.** 그 상태로 찍으면
        // 스킬 그리드가 통째로 팝업에 덮인다(실제로 한 번 그렇게 찍혔다).
        S.autoForgeOn = false; S.pendingCraft = null; UI._pendingItem = null;
        UI.els.craftModal.classList.add('hidden');
        S.summonMult = { skill: 5, pet: 1, mount: 1 };   // 원본 042340 은 x5 상태다
        UI.switchTab('summon'); UI.switchSummonSub('skills');
    });
    await page.waitForTimeout(650);
    await page.evaluate(() => {
        document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening'));
        const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
    });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => { });
    await page.screenshot({ path: OUT, timeout: 60000 });
    stampFresh(OUT);   // 재굽기 스탬프 — 캡처가 바이트 동일해도 '다시 구웠다'가 커밋에 남는다
    console.log('wrote ' + OUT);
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    await browser.close();
})();
