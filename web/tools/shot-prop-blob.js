// 접지 블롭 수정(map-quality-up ㉠′)의 육안 확인 — 비평가가 이름 대 이름으로 지목한 챕터를 찍는다
// ("ch3 좌상단에 드리울 물체가 화면에 없는 거대한 새까만 아메바 얼룩", "ch9 지면에 회색 로젠지 얼룩 3~4개").
//
// ⚠️ 소품 배치는 `U.rand` 라 실행마다 다르다 — **같은 페이지에서 블롭만 껐다 켜서** A/B 를 찍는다.
//    씬을 두 번 지으면 배치가 달라져 비교가 성립하지 않는다(TODO 함정 ④ 계열).
//
// 사용: node shot-prop-blob.js  → tools/blob-ch<N>-{on,off}.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = __dirname;
const CHAPTERS = [3, 9, 1];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && !!Scene3D.trees)) break;
        await page.waitForTimeout(200);
    }
    // 적·연출을 치워 지면만 보이게 — 얼룩 판독이 목적이다
    await page.evaluate(() => { Combat.enemies.length = 0; Scene3D.clearEnemies(); });

    for (const ch of CHAPTERS) {
        await page.evaluate((c) => { Scene3D.setChapterTheme(c); for (let i = 0; i < 30; i++) Scene3D.update(1 / 60); }, ch);
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, `blob-ch${ch}-on.png`) });
        // 블롭만 끈 같은 프레임 — 남은 어둠은 전부 실그림자(섀도맵) 몫이라, 둘을 견주면
        // '얼룩이 블롭인지 실그림자인지'가 갈린다(원인 귀속 도구).
        await page.evaluate(() => { Scene3D.blobShadowMat.visible = false; for (let i = 0; i < 3; i++) Scene3D.update(1 / 60); });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT, `blob-ch${ch}-off.png`) });
        await page.evaluate(() => { Scene3D.blobShadowMat.visible = true; });
    }
    console.log('캡처 완료: ' + CHAPTERS.map(c => `blob-ch${c}-{on,off}.png`).join(', '));
    await browser.close();
})();
