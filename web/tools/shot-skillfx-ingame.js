// 실제 전투 중 스킬 발동 스크린샷 — 연출이 '촬영기 안'이 아니라 게임 안에서 서는지 본다.
//   (slug: skill-fx-minecraft-actors, 2026-08-21)
// 사용: node shot-skillfx-ingame.js [출력경로]   기본 tools/skillfx-ingame.png
//
// 왜 별도 도구인가 — 시퀀스 시트(`shot-skillfx-actors.js`)는 rAF 를 끊고 가상 시각으로 찍는다.
// 그건 타이밍을 정확히 보기 위한 것이고, **실제 전투의 조명·적 대열·UI·카메라 흔들림** 아래에서
// 액터가 읽히는지는 못 본다. 이 도구는 아무것도 끊지 않고 게임을 그대로 돌린 뒤, 스킬이 실제로
// 시전되는 순간(`skillEffect` 훅)을 잡아 찍는다.
// ⚠️ 소프트웨어 GL 이라 스크린샷 한 장에 150~220ms 가 걸린다 — '언제'를 이 도구로 채점하지 말 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || path.resolve(__dirname, 'skillfx-ingame.png');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 잡을 스킬 — 근접 실체(검사 로봇)와 대형 실체(화룡) 두 축을 한 장씩.
const PICKS = [['powerStrike', '연속 참격 — 검사 로봇'], ['apocalypse', '종말의 화룡 — 화룡 브레스']];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 90000 });
    await page.evaluate(() => {
        // 시전 훅 — 게임 루프를 건드리지 않고 '언제 터졌는지'만 기록한다.
        const orig = Scene3D.skillEffect.bind(Scene3D);
        Scene3D.skillEffect = function (fx, c, ids, def) { window.__lastCast = { fx, t: Date.now() }; return orig(fx, c, ids, def); };
    });
    await page.waitForTimeout(4000);

    const shots = [];
    for (const [id, label] of PICKS) {
        await page.evaluate((id) => {
            // 스킬을 보유·장착시키고 쿨다운만 0 으로 — 시전은 `Combat.tick` 이 평소대로 한다
            // (전투 로직을 우회하지 않는다는 뜻이다).
            if (!S.skills[id]) S.skills[id] = { level: 1, dupes: 0, stars: 0 };
            S.equippedSkills = [id];
            Combat.recalcHero();
            Combat.cooldowns[id] = 0;
            window.__lastCast = null;
        }, id);
        // 시전이 걸릴 때까지 대기(적이 없으면 공격 스킬은 안 나간다 — 웨이브를 기다린다)
        await page.waitForFunction(() => window.__lastCast, null, { timeout: 60000 }).catch(() => { });
        await page.waitForTimeout(260);                 // 액터가 등장·타격 자세에 드는 구간
        shots.push({ label, png: await page.screenshot() });
        await page.waitForTimeout(1800);
    }

    const sheet = await page.evaluate(async ({ shots }) => {
        const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
        const imgs = []; for (const s of shots) imgs.push(await load(s.png));
        const HEAD = 36, W = imgs[0].width, H = imgs[0].height;
        const c = document.createElement('canvas');
        c.width = W * imgs.length; c.height = H + HEAD;
        const x = c.getContext('2d');
        x.fillStyle = '#0e0f12'; x.fillRect(0, 0, c.width, c.height);
        imgs.forEach((im, i) => {
            x.drawImage(im, i * W, HEAD);
            x.font = 'bold 22px sans-serif'; x.fillStyle = '#ffe08a';
            x.fillText(shots[i].label, i * W + 12, 26);
        });
        return c.toDataURL('image/png');
    }, { shots: shots.map(s => ({ label: s.label, png: 'data:image/png;base64,' + s.png.toString('base64') })) });

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(`${OUT}  (${shots.length}장)  콘솔 에러 ${errors.length}건`);
    errors.slice(0, 8).forEach(e => console.log('  ' + e));
    await browser.close();
})();
