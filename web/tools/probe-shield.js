// 방패 개방 셸 관통 검증 — 방패의 오목한(안쪽) 면이 카메라를 향하는 각도에서
// 방패가 화면에 기여하는 픽셀이 있는지 센다. SphereGeometry(phiLength 0.35π)는 뚜껑 없는
// 개방 셸이고 기본 side=FrontSide이므로, 안쪽에서 보면 아무것도 그려지지 않아 배경이 비친다.
// 사용: node probe-shield.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && Scene3D.heroRig.shield, null, { timeout: 15000 });

    const r = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        // 결정성 확보 — 영웅은 Idle 모션이 계속 돌아 팔(=방패) 방향과 가림이 실행마다 달라진다.
        // 리그 시간을 0에 고정하고 갱신을 끊어 매 실행 같은 포즈에서 재기. (고정 없이 재면
        // 같은 코드로도 0~1500픽셀까지 흔들려 전후 비교가 불가능하다.)
        ProChar.update = () => {};
        Scene3D.heroRig._t = 0; Scene3D.heroRig._idleT = 0;
        const R = Scene3D.renderer, gl = R.getContext();
        const w = R.domElement.width, h = R.domElement.height;
        const sh = Scene3D.heroRig.shield;
        sh.updateWorldMatrix(true, true);
        const c = new THREE.Vector3(); sh.getWorldPosition(c);
        // 방패 로컬 -z 방향이 오목한 뒷면 — 그 쪽에 카메라를 놓아 '안쪽'을 본다
        const inward = new THREE.Vector3(0, 0, -1).applyQuaternion(sh.getWorldQuaternion(new THREE.Quaternion())).normalize();
        const cam = Scene3D.camera;
        const savedP = cam.position.clone(), savedQ = cam.quaternion.clone();
        cam.position.copy(c).add(inward.clone().multiplyScalar(1.1)).add(new THREE.Vector3(0, 0.06, 0));
        cam.lookAt(c);
        cam.updateMatrixWorld();

        const grab = () => {
            R.render(Scene3D.scene, cam);
            const d = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
            return d;
        };
        // 방패만 숨긴 프레임과 보이는 프레임을 차분 → 방패가 실제로 그린 픽셀 수
        const countDiff = () => {
            const a = grab();
            sh.visible = false;
            const b = grab();
            sh.visible = true;
            let n = 0;
            for (let p = 0; p < w * h; p++) {
                const i = p * 4;
                if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 12) n++;
            }
            return n;
        };
        const diff = countDiff();
        // 대조군: 볼록한(바깥) 면에서 본 기여 픽셀 — 이게 0이면 프로브 카메라 배치가 잘못된 것
        cam.position.copy(c).add(inward.clone().multiplyScalar(-1.1)).add(new THREE.Vector3(0, 0.06, 0));
        cam.lookAt(c); cam.updateMatrixWorld();
        const diffOutside = countDiff();
        // 참고: 방패 돔의 side 설정과 지오메트리 파라미터를 함께 보고한다
        let domeSide = null, domePhi = null;
        sh.traverse(o => {
            if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.thetaLength < Math.PI) {
                domeSide = o.material.side; domePhi = o.geometry.parameters.thetaLength;
            }
        });
        cam.position.copy(savedP); cam.quaternion.copy(savedQ); cam.updateMatrixWorld();
        return { shieldPixelsFromInside: diff, shieldPixelsFromOutside: diffOutside, domeSide, domePhi: domePhi && +domePhi.toFixed(3), FrontSide: THREE.FrontSide, DoubleSide: THREE.DoubleSide };
    });
    console.log(JSON.stringify(r));
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
