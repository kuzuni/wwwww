// `silhouette-after-outline` 전/후 육안 대조 — 같은 부팅에서 uniforms/블롭만 되돌려 촬영하므로
// 포즈·배경·개체가 완전히 같다. before = 아웃라인 삭제 직후 상태(영웅 컨투어값 + 블롭 0.17),
// after = 처방 적용(ENEMY_RIM + 블롭 0.26 + 필요시 rim 셸은 안 켬 — 상시 화면이 대상이다).
// 사용: node tools/shot-enemy-sep.js [kind]   (기본 goblin) → enemy-sep-<kind>-before/after.png
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const kind = process.argv[2] || 'goblin';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?enemy=' + kind, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const setup = await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.update = () => {};
        Scene3D.heroAttack = () => {}; // 동결 후 잔여 setTimeout발 공격 차단 — 죽은 적을 찍는 사고 방지
        // 라이브 구간의 적은 체력·연출 상태가 런마다 다르다(죽는 중일 수도) — 전부 걷고 새로 하나 스폰
        Scene3D.clearEnemies();
        const e = { id: 999, x: Combat.MELEE_X + 0.6, alive: true, hp: 100, maxHp: 100 };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(999);
        if (!m) return null;
        // 진행 중 연출을 전부 끝내고 파티클을 걷는다 — 얼린 프레임에 플레어가 떠 있으면 판독을 가린다
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        m.g.position.set(Scene3D.heroG.position.x + 1.7, 0, 0);
        m.g.userData.landed = true;
        if (m.hpG) m.hpG.position.set(m.g.position.x, m.g.position.y, 0);
        if (m.blob) m.blob.position.set(m.g.position.x, 0.03, m.g.position.z);
        Scene3D.renderFrame();
        const p = Scene3D.project(m.g.position.clone().setY(0.6));
        // project() 는 캔버스 로컬 좌표 — screenshot clip 은 뷰포트 좌표라 캔버스 오프셋을 더해야 한다
        const cr = Scene3D.renderer.domElement.getBoundingClientRect();
        return { cx: p.x + cr.left, cy: p.y + cr.top };
    });
    if (!setup) { console.log('FAIL 적 준비 실패'); process.exit(1); }
    const clip = { x: Math.max(0, setup.cx - 110), y: Math.max(0, setup.cy - 110), width: 220, height: 190 };
    const shoot = async (mode, file) => {
        await page.evaluate((mode) => {
            const before = mode === 'before';
            for (const u of Scene3D._rimUniforms) {
                u.uRimDarkStr.value = before ? Scene3D.RIM.darkStrength : Scene3D.ENEMY_RIM.darkStrength;
                u.uRimDarkPow.value = before ? Scene3D.RIM.darkPower : Scene3D.ENEMY_RIM.darkPower;
            }
            Scene3D.blobShadowFoeMat.opacity = before ? 0.17 : 0.26;
            Scene3D.renderFrame();
        }, mode);
        await page.screenshot({ path: path.join(__dirname, file), clip });
        console.log(file);
    };
    await shoot('before', `enemy-sep-${kind}-before.png`);
    await shoot('after', `enemy-sep-${kind}-after.png`);
    await browser.close();
})();
