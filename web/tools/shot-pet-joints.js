// 펫 관절 리그 연속 프레임 캡처 — `pet-articulated-joints` 눈 대조용.
// 대기/이동 두 상태를 각각 6프레임씩(1/12초 간격) 찍어 관절이 시간축에서 실제로 움직이는지 본다.
// ⚠️ 헤드리스에서는 rAF 가 안 돌아 `Scene3D.update` 를 손으로 흘린다(TODO 함정 ③).
// 사용: node shot-pet-joints.js [펫이름...]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const WEB = path.resolve(__dirname, '..');
const NAMES = process.argv.slice(2).length ? process.argv.slice(2) : ['Dog', 'Unicorn', 'Baby Dragon'];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    await page.goto('file://' + path.join(WEB, 'index.html'), { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene);
    await page.waitForTimeout(800);

    await page.evaluate((names) => {
        S.pets = names.map(n => ({ name: n, rarity: 'legendary', level: 1, dupes: 0, xp: 0, stars: 0, subs: [] }));
        S.activePets = names.map((_, i) => i);
        Scene3D.refreshPets();
        Scene3D.anims.length = 0;
        // 카메라는 **renderFrame 을 감싸서** 그리기 직전에 잡는다. 앞선 두 방법은 다 실패했다:
        // ⑴ evaluate 초반에 한 번 옮기면 Scene3D.update 가 제자리로 되돌리고
        // ⑵ update 를 감싸도 스크린샷 직전에 rAF 프레임이 끼어들어 원래 카메라로 다시 그린다.
        // 화면에 남는 건 **마지막 renderFrame** 이라, 훅은 거기에 걸어야 한다(실측으로 확인).
        const orig = Scene3D.renderFrame.bind(Scene3D);
        Scene3D.renderFrame = () => {
            // 자리를 코드에서 읽는다 — 좌표를 손으로 베끼면 배치가 바뀔 때 프레임 밖을 찍는다(TODO 함정 ④)
            const c = new THREE.Vector3();
            Scene3D.petGroups.forEach(pg => c.add(pg.position));
            c.divideScalar(Scene3D.petGroups.length || 1);
            Scene3D.camera.position.set(c.x + 0.05, c.y + 0.9, c.z + 2.5);
            Scene3D.camera.lookAt(c.x, c.y + 0.25, c.z);
            Scene3D.camera.updateMatrixWorld(true);
            orig();
        };
    }, NAMES);

    const shoot = (walking) => page.evaluate((w) => {
        Scene3D.walking = w;
        for (let k = 0; k < 5; k++) Scene3D.update(1 / 60);
        Scene3D.renderFrame();
    }, walking);

    for (const walking of [false, true]) {
        await page.evaluate((w) => { Scene3D.walking = w; }, walking);
        for (let f = 0; f < 6; f++) {
            await shoot(walking);
            await page.screenshot({ path: path.join(__dirname, `petjoint-${walking ? 'walk' : 'idle'}-${f}.png`), clip: { x: 0, y: 70, width: 499, height: 410 } });
        }
    }
    console.log('캡처 완료: petjoint-idle-0..5.png · petjoint-walk-0..5.png (' + NAMES.join(', ') + ')');
    await browser.close();
})();
