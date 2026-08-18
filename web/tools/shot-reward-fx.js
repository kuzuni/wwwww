// 수령 연출(reward-claim-fx) 연속 프레임 캡처 — 육안/비평가 검수용
// 퀘스트 수령 버튼을 누른 뒤 0/150/320/500/700/850ms 프레임을 저장한다.
// 사용: node shot-reward-fx.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    // 앞선 프로브가 남긴 세이브를 지우고 새 판에서 찍는다 — 어떤 퀘스트가 done인지가 매번 같아야 프레임이 재현된다
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.evaluate(async () => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 9; S.bestStage = 9;
        Quests.ensure();
        S.quests[0].prog = S.quests[0].need;
        S.quests[0].rw = { cur: 'coins', amt: 1200 };   // 코인 → 상단 코인 pill 도착 경로가 보이게
        UI.openQuests();
        await new Promise(r => setTimeout(r, 150));
    });
    const stamps = [0, 90, 180, 320, 500, 700, 850, 1000];   // 850·1000: 도착 잔불꽃·마침표 구간
    await page.evaluate(() => document.querySelector('.qst-row.done .btn.primary').click());
    let prev = 0;
    for (const ms of stamps) {
        await page.waitForTimeout(ms - prev);
        prev = ms;
        await page.screenshot({ path: path.join(__dirname, `rewardfx-${String(ms).padStart(4, '0')}ms.png`) });
    }
    console.log('저장: rewardfx-{' + stamps.join(',') + '}ms.png');
    await browser.close();
})();
