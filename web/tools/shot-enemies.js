// 적 7종 검증 스크린샷 — Box3 자동 피팅 + Combat 틱 정지 (5차 인계 ⑴)
const { chromium } = require('playwright');
const path = require('path');
const KINDS = ['slime', 'golem', 'goblin', 'bat', 'mushroom', 'wolf', 'imp'];
const OUT = path.join(__dirname, 'shots');
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    for (const kind of KINDS) {
        const page = await browser.newPage({ viewport: { width: 700, height: 700 } });
        const errors = [];
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', e => errors.push(String(e)));
        await page.goto('file:///home/user/wwwww/web/index.html?enemy=' + kind);
        // 적이 스폰될 때까지 대기
        await page.waitForFunction(() => {
            return typeof Scene3D !== 'undefined' && Scene3D.enemyMap && [...Scene3D.enemyMap.values()].some(m => !m.dead);
        }, { timeout: 20000 });
        await page.waitForTimeout(1300); // 스폰 낙하 연출이 끝나 자리를 잡을 때까지 대기
        // 로직 정지 + Box3 피팅 카메라
        await page.evaluate(() => {
            Combat.tick = () => {};            // 전투 로직 완전 정지 (이동/공격/사망 없음)
            Scene3D.walking = false;
            for (const mm of Scene3D.enemyMap.values()) { // 전 개체 HP바 제거 (채점 제외 + Box3 오염 방지)
                if (mm.hpBg && mm.hpBg.parent) mm.hpBg.parent.remove(mm.hpBg);
                if (mm.hpFg && mm.hpFg.parent) mm.hpFg.parent.remove(mm.hpFg);
            }
            const m = [...Scene3D.enemyMap.values()].find(m => !m.dead);
            const box = new THREE.Box3().setFromObject(m.g);
            const c = box.getCenter(new THREE.Vector3());
            const sz = box.getSize(new THREE.Vector3());
            const r = Math.max(sz.x, sz.y, sz.z);
            Scene3D.camLock = {
                pos: c.clone().add(new THREE.Vector3(-r * 1.05, r * 0.55, r * 1.4)),
                look: c
            };
        });
        await page.waitForTimeout(150); // 카메라 반영 (피팅 직후 바로 촬영 — 스폰 낙하 드리프트 방지)
        await page.evaluate(() => { // 호핑 등 idle 이동 보정 — 촬영 직전 재피팅
            const m = [...Scene3D.enemyMap.values()].find(m => !m.dead);
            const box = new THREE.Box3().setFromObject(m.g);
            const c = box.getCenter(new THREE.Vector3());
            const sz = box.getSize(new THREE.Vector3());
            const r = Math.max(sz.x, sz.y, sz.z);
            Scene3D.camLock = { pos: c.clone().add(new THREE.Vector3(-r * 1.05, r * 0.55, r * 1.4)), look: c };
        });
        await page.waitForTimeout(60);
        const clip = await page.evaluate(() => {
            const b = document.getElementById('game3d').getBoundingClientRect();
            return { x: b.x, y: b.y, width: b.width, height: b.height };
        });
        await page.screenshot({ path: path.join(OUT, 'enemy-' + kind + '.png'), clip });
        if (errors.length) console.log(kind, 'CONSOLE ERRORS:', errors.slice(0, 3));
        else console.log(kind, 'ok');
        await page.close();
    }
    await browser.close();
})();
