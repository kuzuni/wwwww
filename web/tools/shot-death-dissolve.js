// 적 처치 → 쓰러짐 → 노이즈 알파 클립 디졸브 연속 프레임 촬영 (hp-juicy 잔여 지적 ③ 눈 대조용).
// 사용: node tools/shot-death-dissolve.js [enemyKind] [outDir]
//
// ⚠️ 헤드리스는 rAF 가 안 도니 `Scene3D.update` 를 손으로 흘린다(TODO 상단 함정 ③).
//    프레임 라벨은 처치 시각 기준 경과 시간이다 — 접지 0.30s · 디졸브 0.48~1.00s.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const KIND = process.argv[2] || 'golem';
const OUT = process.argv[3] || __dirname;
const FRAMES = [0.02, 0.12, 0.30, 0.48, 0.62, 0.74, 0.86, 0.98];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=' + KIND, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 180000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive && Scene3D.enemyMap.get(e.id)), null, { timeout: 180000 });

    await page.evaluate(() => {
        const e = Combat.enemies.find(x => x.alive && Scene3D.enemyMap.get(x.id));
        window.__eid = e.id;
        Combat.tick = () => { };
        Scene3D.walking = false;
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => { };
        window.__step = (sec) => { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) realUpdate(1 / 120); };
        Scene3D.anims.length = 0;
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        __step(0.4);
        // 무리 중 나머지는 숨긴다 — 골렘 3마리가 겹쳐 서 있으면 어느 게 시체인지 눈으로 못 가른다.
        Combat.enemies.forEach(x => { const mm = Scene3D.enemyMap.get(x.id); if (mm && x.id !== e.id) { mm.g.visible = false; if (mm.hpG) mm.hpG.visible = false; if (mm.blob) mm.blob.visible = false; } });
        const m = Scene3D.enemyMap.get(e.id);
        m.g.position.set(Scene3D.heroG.position.x + 1.9, 0, 0);   // 화면 안 고정 위치 (규칙 ㉠)
        __step(0.05);
        Scene3D.killEnemy(e.id, false);
        e.alive = false;
    });

    let prev = 0;
    for (const t of FRAMES) {
        await page.evaluate(dt => __step(dt), t - prev);
        prev = t;
        await page.evaluate(() => Scene3D.renderFrame());
        const f = path.join(OUT, `dissolve-${KIND}-${String(Math.round(t * 1000)).padStart(4, '0')}ms.png`);
        await page.screenshot({ path: f, clip: { x: 200, y: 150, width: 280, height: 230 } });
        console.log('saved', f);
    }
    console.log('콘솔 에러', errors.length, '건');
    await browser.close();
})();
