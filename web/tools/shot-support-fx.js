// 지원계 6종 연출 캡처 — skill-unique-signature 눈 대조용.
// 6종이 서로 다른 그림인지 한 장씩 놓고 본다(프로브 지문 게이트의 육안 대조판).
// 헤드리스는 rAF 가 안 돌아 Scene3D.update 를 손으로 흘리고 renderFrame 을 직접 부른다.
// 사용: node shot-support-fx.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SUPPORT = [
    ['firstAid', 'firstaid'], ['blessing', 'heal'], ['divineShield', 'wardshield'],
    ['warCry', 'warcry'], ['sanctuary', 'aura'], ['timeWarp', 'timewarp'],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    await page.goto(INDEX);
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && !!Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForTimeout(800);

    await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.anims.length = 0;
        // ⚠️ rAF 가 스크린샷 사이에 실시간 dt 로 연출을 앞질러 소화한다 — 끊고 수동 스텝만 민다.
        window.__step = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => {};
        // 페이로드는 setTimeout 뒤라 수동 스텝만으로는 영영 안 온다 — 즉시 실행으로.
        window.setTimeout = (fn, ms, ...a) => { try { typeof fn === 'function' && fn(...a); } catch (e) {} return 0; };
    });

    for (const [id, fx] of SUPPORT) {
        await page.evaluate(([id, fx]) => {
            Scene3D.anims.length = 0;
            const def = SKILL_DEFS.find(d => d.id === id);
            Scene3D.skillEffect(fx, def.color, [], def);
        }, [id, fx]);
        // 연출이 자리를 잡는 지점(각 연출의 정점 대역)
        await page.evaluate(() => { for (let f = 0; f < 16; f++) window.__step(1 / 60); Scene3D.renderFrame(); });
        await page.screenshot({ path: path.join(__dirname, `support-${id}.png`) });
        await page.evaluate(() => { for (let f = 0; f < 140; f++) window.__step(1 / 60); Scene3D.renderFrame(); });
    }
    console.log('캡처 완료: support-' + SUPPORT.map(s => s[0]).join('.png, support-') + '.png');
    await browser.close();
})();
