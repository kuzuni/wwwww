// 영웅 검증 스크린샷 — idle/걷기/공격 중간 프레임, Box3 피팅 (5차 인계 ⑴)
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('file:///home/user/wwwww/web/index.html?debug=gear&w=sword&hage=medieval&aage=medieval');
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        // 캐릭터 품질 채점용: 디바인 대검 대신 중세 검 (캐릭터가 가려지지 않게)
        Forge.equip({ name: 'test', slot: 'weapon', age: 'medieval', ageIdx: AGES.indexOf('medieval'), rarity: 'rare', level: 10, main: SLOT_MAIN.weapon, value: 100, subs: [], wtype: 'sword' });
    });

    // 촬영 직전 항상 재피팅 — 걷기 스크롤/모션 드리프트 대응
    const fit = async () => page.evaluate(() => {
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const sz = box.getSize(new THREE.Vector3());
        const r = Math.max(sz.x, sz.y, sz.z);
        Scene3D.camLock = { pos: c.clone().add(new THREE.Vector3(r * 0.8, r * 0.45, r * 1.1)), look: c };
    });
    const shot = async (name) => {
        await fit();
        await page.waitForTimeout(60);
        const clip = await page.evaluate(() => {
            const b = document.getElementById('game3d').getBoundingClientRect();
            return { x: b.x, y: b.y, width: b.width, height: b.height };
        });
        await page.screenshot({ path: path.join(OUT, name), clip });
    };

    // 포즈 프리즈: update(0)으로 모든 모션 정지 (렌더는 계속)
    const freeze = async (on) => page.evaluate((on) => {
        if (on && !Scene3D._origUpdate) { Scene3D._origUpdate = Scene3D.update; Scene3D.update = () => Scene3D._origUpdate(0); }
        if (!on && Scene3D._origUpdate) { Scene3D.update = Scene3D._origUpdate; Scene3D._origUpdate = null; }
    }, on);

    await page.waitForTimeout(400);
    await freeze(true); await shot('hero-idle.png'); await freeze(false);

    // 걷기 중간 프레임
    await page.evaluate(() => { Scene3D.walking = true; Scene3D.heroPlay(['Walking']); });
    await page.waitForTimeout(430);
    await freeze(true); await shot('hero-walk.png'); await freeze(false);
    await page.evaluate(() => { Scene3D.walking = false; Scene3D.heroPlay(['Idle']); });

    // 베기 공격 중간 프레임 (스냅 구간)
    await page.evaluate(() => { Scene3D.heroPlay(['1H_Melee_Attack_Slice_Diagonal', 'slash'], true, 1); });
    await page.waitForTimeout(200);
    await freeze(true); await shot('hero-attack.png'); await freeze(false);

    if (errors.length) console.log('CONSOLE ERRORS:', errors.slice(0, 5));
    else console.log('hero ok');
    await browser.close();
})();
