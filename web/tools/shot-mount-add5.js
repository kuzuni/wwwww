// `mount-roster-add5` 눈 대조 — 새 4종(익룡·두발 로봇·덤프트럭·청소로봇)을 **인게임 탑승 화면**으로 찍는다.
// 썸네일이 아니라 실제로 타고 있는 화면이 판정 대상이다(로스터 교체 때와 같은 규약).
//
// ⚠️ 정지 한 장으로는 이 4종을 판정할 수 없다 — 판정 대상의 절반이 **움직임**이다(이족 교대보행 ·
//    막날개 펄럭임 · 바퀴/브러시 누적 회전). 그래서 종마다 **연속 프레임**을 찍는다.
// ⚠️ 헤드리스는 rAF 가 사실상 안 돈다 → 프레임은 `Scene3D.update(1/60)` 를 손으로 흘려 만든다.
//    `waitForTimeout` 으로 기다리는 방식으로 바꾸지 말 것(그러면 전 프레임이 같은 그림이 된다).
//
// ⚠️ **전체 화면 샷만으로는 조형을 판독할 수 없다** — 480×854 화면에서 탈것은 200px 남짓이라 부리·볏·
//    브러시·그리퍼가 몇 픽셀로 뭉갠다(첫 판에서 실제로 그랬다). 그래서 `deviceScaleFactor 3` 으로 띄우고
//    탈것 자리만 `clip` 해 **3배 해상도 근접 샷**을 같이 남긴다(`add5-<종>-zoom<프레임>.png`).
//    ⚠️ CSS 확대(page zoom)로 대신하지 말 것 — 캔버스가 같은 픽셀을 늘리기만 해 정보가 안 늘어난다.
//
// 사용: node shot-mount-add5.js [종이름 …]  → tools/add5-<종>-<프레임>.png · add5-<종>-zoom<프레임>.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = __dirname;
const ARGS = process.argv.slice(2);
// 탈것이 서는 자리(영웅 발밑) — 전 종 공통이라 상수로 둔다. 씬 배치를 바꾸면 여기도 같이 본다.
const CLIP = { x: 96, y: 150, width: 210, height: 200 };
const ZOOM_FRAMES = [0, 2, 4];   // 보행/펄럭임 한 주기를 훑는 3장
// 등급은 실제 풀 등급으로 — 등급이 배율(sc)과 틴트를 정하므로 임의 등급으로 찍으면 실물과 다르다.
const SPECIES = ARGS.length ? ARGS : ['Pterosaur', 'Bipedal Mech', 'Dump Truck', 'Cleaning Robot'];
const FRAMES = 6, STEP = 7;   // 프레임 사이 7틱 ≈ 0.117s — 보행 한 주기가 6장 안에 들어온다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 3 });
    await page.goto(INDEX, { waitUntil: 'load' });
    for (let i = 0; i < 600; i++) {
        if (await page.evaluate(() => typeof Scene3D !== 'undefined' && !!Scene3D.scene && !!S && !!UI.els)) break;
        await page.waitForTimeout(200);
    }
    // 전투 화면을 조용히 — 적·연출이 탈것을 가리면 형태 판독이 안 된다.
    await page.evaluate(() => { Combat.tick = () => { }; Combat.enemies.length = 0; Scene3D.clearEnemies(); Scene3D.walking = true; });

    for (const name of SPECIES) {
        const rarity = await page.evaluate((n) => {
            const r = Object.keys(mountNames).find(k => mountNames[k].includes(n)) || 'epic';
            S.mounts = [{ name: n, rarity: r, level: 20, xp: 0, stars: 0, subs: [] }];
            S.activeMounts = [0];
            Scene3D.refreshMount();
            Scene3D.ridePhase = 0; Scene3D._clock = 0;      // 프레임 간 차이가 애니 탓임을 보장한다
            for (let i = 0; i < 30; i++) Scene3D.update(1 / 60);   // 대기 자세가 자리를 잡을 만큼만
            return r;
        }, name);
        const slug = name.toLowerCase().replace(/ /g, '-');
        for (let k = 0; k < FRAMES; k++) {
            await page.evaluate((step) => { for (let i = 0; i < step; i++) Scene3D.update(1 / 60); }, STEP);
            await page.waitForTimeout(120);
            await page.screenshot({ path: path.join(OUT, `add5-${slug}-${k}.png`) });
            if (ZOOM_FRAMES.includes(k)) await page.screenshot({ path: path.join(OUT, `add5-${slug}-zoom${k}.png`), clip: CLIP });
        }
        console.log(`찍음: ${name} (${rarity}) → add5-${slug}-0..${FRAMES - 1}.png`);
    }
    await browser.close();
})();
