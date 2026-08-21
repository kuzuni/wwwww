// 실제 전투 중 스킬 발동 스크린샷 — 연출이 '촬영기 안'이 아니라 게임 안에서 서는지 본다.
//   (slug: skill-fx-minecraft-actors, 2026-08-21)
// 사용: node shot-skillfx-ingame.js [출력경로]   기본 tools/skillfx-ingame.png
//
// 왜 별도 도구인가 — 시퀀스 시트(`shot-skillfx-actors.js`)는 rAF 를 끊고 가상 시각으로 찍고
// 카메라도 촬영용으로 당긴다. 그건 타이밍·조형을 보기 위한 것이고, **실제 전투의 조명·적 대열·
// UI·카메라 흔들림** 아래에서 액터가 읽히는지는 못 본다. 이 도구는 게임 루프를 그대로 돌리고
// 게임 카메라 그대로 찍는다 — 대신 액션 근처를 **확대한 인셋**을 옆에 붙여 판독을 돕는다.
//
// ⚠️ 소프트웨어 GL 이라 스크린샷 한 장에 150~220ms 가 걸린다 — '언제'를 이 도구로 채점하지 말 것.
// ⚠️ 전투 로직은 우회하지 않는다. 스킬을 보유·장착시키고 **쿨다운만 0** 으로 둔 뒤,
//    시전은 평소대로 `Combat.tick` 이 한다(`tryCast`).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const OUT = process.argv[2] || path.resolve(__dirname, 'skillfx-ingame.png');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
// 잡을 스킬 — 근접 실체(검사 로봇)와 대형 실체(화룡). delay = 시전 훅 이후 몇 ms 에 찍을지.
const PICKS = [
    { id: 'powerStrike', delay: 260, label: '연속 참격 — 검사 로봇 2기가 적을 벤다' },
    { id: 'apocalypse', delay: 900, label: '종말의 화룡 — 화룡이 날아와 브레스를 뿜는다' },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && typeof Combat !== 'undefined', null, { timeout: 90000 });
    await page.evaluate(() => {
        const orig = Scene3D.skillEffect.bind(Scene3D);
        Scene3D.skillEffect = function (fx, c, ids, def) { window.__lastCast = { fx, t: Date.now() }; return orig(fx, c, ids, def); };
    });
    await page.waitForTimeout(4000);

    const shots = [];
    for (const P of PICKS) {
        await page.evaluate((id) => {
            if (!S.skills[id]) S.skills[id] = { level: 1, dupes: 0, stars: 0 };
            S.equippedSkills = [id];
            Combat.recalcHero();
            Combat.cooldowns[id] = 0;
            window.__lastCast = null;
        }, P.id);
        await page.waitForFunction(() => window.__lastCast, null, { timeout: 60000 }).catch(() => { });
        await page.waitForTimeout(P.delay);
        const png = await page.screenshot();
        // 액션 인셋 — 영웅을 화면에 투영해 그 둘레를 잘라 낼 좌표를 얻는다(카메라가 스크롤한다).
        const box = await page.evaluate(() => {
            const cv = document.querySelector('canvas');
            const r = cv.getBoundingClientRect();
            const v = Scene3D.heroG.position.clone(); v.y += 1.0;
            v.project(Scene3D.camera);
            return { x: r.x + (v.x * 0.5 + 0.5) * r.width, y: r.y + (-v.y * 0.5 + 0.5) * r.height, w: r.width, h: r.height };
        });
        shots.push({ label: P.label, png: 'data:image/png;base64,' + png.toString('base64'), box });
        await page.waitForTimeout(1800);
    }

    const sheet = await page.evaluate(async ({ shots }) => {
        const load = (u) => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
        const imgs = []; for (const s of shots) imgs.push(await load(s.png));
        const HEAD = 38, W = imgs[0].width, H = imgs[0].height;
        const IW = 520, IH = 440;                    // 인셋 크기
        const c = document.createElement('canvas');
        c.width = (W + IW) * imgs.length; c.height = H + HEAD;
        const x = c.getContext('2d');
        x.imageSmoothingEnabled = false;             // 확대는 최근접 — 블록 모서리를 뭉개지 않는다
        x.fillStyle = '#0e0f12'; x.fillRect(0, 0, c.width, c.height);
        imgs.forEach((im, i) => {
            const ox = i * (W + IW);
            x.drawImage(im, ox, HEAD);
            // 인셋 — 영웅 기준 오른쪽(적 방향)으로 치우친 상자를 2.2배로 확대해 붙인다.
            const s = shots[i].box;
            const cw = IW / 2.2, ch = IH / 2.2;
            const sx = Math.max(0, Math.min(im.width - cw, s.x - cw * 0.34));
            const sy = Math.max(0, Math.min(im.height - ch, s.y - ch * 0.55));
            x.drawImage(im, sx, sy, cw, ch, ox + W, HEAD, IW, IH);
            x.strokeStyle = '#ffe08a'; x.lineWidth = 2;
            x.strokeRect(ox + W, HEAD, IW, IH);
            x.strokeStyle = '#ffe08a'; x.lineWidth = 1.5;
            x.strokeRect(ox + sx, HEAD + sy, cw, ch);    // 원본 위 어디를 확대했는지
            x.font = 'bold 22px sans-serif'; x.fillStyle = '#ffe08a';
            x.fillText(shots[i].label, ox + 12, 26);
            x.font = 'bold 18px monospace'; x.fillStyle = '#7fff9f';
            x.fillText('2.2× 확대', ox + W + 12, HEAD + IH + 26);
        });
        return c.toDataURL('image/png');
    }, { shots });

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, Buffer.from(sheet.split(',')[1], 'base64'));
    console.log(`${OUT}  (${shots.length}장 + 확대 인셋)  콘솔 에러 ${errors.length}건`);
    errors.slice(0, 8).forEach(e => console.log('  ' + e));
    await browser.close();
})();
