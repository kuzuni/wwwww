// 스텁 모달 3종(파워 랭킹 · 클랜 랭킹 · 미스터리 상자) 캡처 — 이모지→코드 생성 아이콘 교체 확인용.
// 사용: PW_PATH=... node shot-stub.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const CASES = [
    ['trophy', () => UI.openStub('파워 랭킹', '서버 내 전투력 랭킹은 준비 중입니다.', 'trophy')],
    ['clanbadge', () => UI.openStub('클랜 랭킹', '클랜 시스템은 준비 중입니다.', 'clanbadge')],
    ['wp_mystery', () => UI.onWaypointMystery()],
];

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    await page.waitForTimeout(900);
    for (const [name, fn] of CASES) {
        await page.evaluate(`(${fn.toString()})()`);
        await page.waitForTimeout(350);
        const info = await page.evaluate(() => {
            const card = document.querySelector('#stub-modal .modal-card') || document.querySelector('.modal-card');
            const icos = [...card.querySelectorAll('.ico')];
            return {
                box: (b => [b.x, b.y, b.width, b.height])(card.getBoundingClientRect()),
                // 빈 문자열이 돌아오면 아이콘 노드 자체가 없다 — img() 의 조용한 실패를 여기서 잡는다
                icons: icos.map(i => {
                    const s = getComputedStyle(i), b = i.getBoundingClientRect();
                    return `${i.className.replace('ico ', '')} ${b.width.toFixed(1)}x${b.height.toFixed(1)} bg=${s.backgroundImage.slice(0, 22)}`;
                }),
            };
        });
        console.log(`[${name}] 아이콘 ${info.icons.length}개`);
        info.icons.forEach(i => console.log('   ' + i));
        const card = await page.$('.modal-card');
        await card.screenshot({ path: path.join(__dirname, `stub-${name}.png`) });
        await page.evaluate(() => UI.closeStub());
        await page.waitForTimeout(200);
    }
    console.log('콘솔 에러', errs.length, '건');
    if (errs.length) errs.slice(0, 5).forEach(e => console.log('  !', e));
    await browser.close();
})();
