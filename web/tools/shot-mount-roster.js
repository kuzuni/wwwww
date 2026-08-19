// 로스터 교체(mount-animal-machine-dynamic ①)로 들어온 5종을 눈으로 확인 —
// 인게임에 세운 채로 찍는다(썸네일이 아니라 실제 탑승 화면이 판정 대상이다).
// 태엽 감개가 도는 걸 보려면 한 종은 **연속 프레임**으로 찍는다.
//
// 사용: node shot-mount-roster.js  → tools/mount-<종>.png · tools/mount-key-<t>ms.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = __dirname;
const NEW5 = ['Pony', 'Donkey', 'Alpaca', 'Clockwork Mouse', 'Clockwork Beetle'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && !!S && !!UI.els)) break;
        await page.waitForTimeout(200);
    }
    // 전투 화면을 조용히 — 적·연출이 탈것을 가리면 형태 판독이 안 된다
    await page.evaluate(() => { Combat.enemies.length = 0; Scene3D.clearEnemies(); Scene3D.walking = true; });

    for (const name of NEW5) {
        await page.evaluate((n) => {
            S.mounts = [{ name: n, rarity: 'epic', level: 20, xp: 0, stars: 0, subs: [] }];
            S.activeMounts = [0];
            Scene3D.refreshMount();
            for (let i = 0; i < 40; i++) Scene3D.update(1 / 60);   // 대기 자세가 자리를 잡을 만큼만
        }, name);
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(OUT, `mount-${name.toLowerCase().replace(/ /g, '-')}.png`) });
    }

    // 태엽 감개 회전 — 같은 종을 프레임만 흘리며 4장(감개 날개의 각이 달라야 한다)
    await page.evaluate(() => {
        S.mounts = [{ name: 'Clockwork Beetle', rarity: 'mythic', level: 20, xp: 0, stars: 0, subs: [] }];
        S.activeMounts = [0];
        Scene3D.refreshMount();
    });
    for (let k = 0; k < 4; k++) {
        await page.evaluate(() => { for (let i = 0; i < 10; i++) Scene3D.update(1 / 60); });
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(OUT, `mount-key-${k}.png`) });
    }
    console.log('캡처 완료: ' + NEW5.map(n => `mount-${n.toLowerCase().replace(/ /g, '-')}.png`).join(', ') + ' + mount-key-0..3.png');
    await browser.close();
})();
