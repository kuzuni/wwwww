// 제작 결과 리빌 카드 정지 프레임 시트 (사용자 지시 2026-08-18 `craft-reveal-card`)
// 망치질이 끝난 뒤 비교 팝업 앞에 끼는 0.56초 카드 연출을 60ms 간격 10프레임으로 굳혀 찍는다.
// 소프트웨어 GL에서 스크린샷 1장이 ~1초라 '자고 찍기'는 프레임 시각이 거짓이 된다 —
// shot-anvil-strike.js와 같은 방식으로 animation-delay를 음수로 밀어 결정론적으로 굳힌다.
// 사용: node shot-craft-reveal.js  → tools/craft-reveal.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const STEP = 60, FRAMES = 10;   // 0 ~ 540ms

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errors = [];
    page.on('pageerror', e => errors.push((e.stack || String(e)).split('\n').slice(0, 2).join(' | ')));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Forge !== 'undefined' && UI.els && UI.els.craftModal, null, { timeout: 20000 });
    await page.evaluate(() => {
        if (typeof Combat !== 'undefined') Combat.tick = () => {};
        if (typeof Scene3D !== 'undefined') Scene3D.update = () => {};
        S.bestChapter = 5; S.bestStage = 9; S.hammers = 500; S.forgeLevel = 20;
        UI.switchTab(null);
    });
    await page.waitForTimeout(500);

    const shots = [], poses = [];
    for (let i = 0; i < FRAMES; i++) {
        poses.push(await page.evaluate((ms) => {
            document.querySelectorAll('.auto-drop-card').forEach(n => n.remove());
            const item = Forge.craft(1)[0];
            UI.showCraftReveal(item, () => {});
            const el = document.querySelector('.auto-drop-card.craft-reveal');
            for (const n of [el, ...el.querySelectorAll('*')]) {
                n.style.animationPlayState = 'paused';
                n.style.animationDelay = `-${ms}ms`;
            }
            const cs = getComputedStyle(el);
            return { transform: cs.transform, opacity: cs.opacity, shadow: cs.boxShadow, name: item.name, age: item.age };
        }, i * STEP));
        const clip = await page.evaluate(() => {
            const b = document.querySelector('.anvil-btn').getBoundingClientRect();
            const pad = 78;
            return { x: Math.max(0, Math.round(b.x - pad)), y: Math.max(0, Math.round(b.y - pad * 1.6)),
                     width: Math.round(b.width + pad * 2), height: Math.round(b.height + pad * 2.4) };
        });
        shots.push(await page.screenshot({ clip }));
    }
    const errsBeforeCompose = errors.length;
    const b64 = shots.map(b => 'data:image/png;base64,' + b.toString('base64'));
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.evaluate(([imgs, step]) => {
        document.body.innerHTML = `<div id="sheet" style="background:#111;padding:6px;width:1168px;display:flex;flex-wrap:wrap;gap:4px">`
            + imgs.map((d, i) => `<div style="width:284px"><img src="${d}" style="width:284px;display:block"><div style="font:12px sans-serif;color:#eee;text-align:center">${i * step}ms</div></div>`).join('')
            + `</div>`;
    }, [b64, STEP]);
    await page.locator('#sheet').screenshot({ path: path.join(__dirname, 'craft-reveal.png') });

    let bad = 0;
    const chk = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) bad++; };
    const tSet = new Set(poses.map(p => p.transform));
    chk(tSet.size >= 6, `카드가 실제로 움직임 (${FRAMES}프레임 중 ${tSet.size}종 transform)`);
    chk(+poses[0].opacity < 0.35, `첫 프레임은 투명에서 시작 (opacity ${poses[0].opacity})`);
    chk(+poses[FRAMES - 1].opacity > 0.9, `마지막 프레임은 또렷하게 머묾 (opacity ${poses[FRAMES - 1].opacity})`);
    const sSet = new Set(poses.map(p => p.shadow));
    chk(sSet.size >= 4, `시대색 링이 퍼짐 (${sSet.size}종 box-shadow)`);
    const gameErrs = errors.slice(0, errsBeforeCompose);
    console.log(gameErrs.length ? '✗ 콘솔 에러 ' + gameErrs.length + '건: ' + gameErrs.slice(0, 4).join(' | ') : '✓ 콘솔 에러 0건');
    console.log('→ tools/craft-reveal.png');
    await browser.close();
    process.exit(bad || gameErrs.length ? 1 : 0);
})();
