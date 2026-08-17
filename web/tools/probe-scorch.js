// 지면 그을음 데칼 실측 — 3차 지적 ⑤ "비평가는 주변보다 +20 RGB **밝게** 계측했다(설계 의도와 반대)"를
// 눈대중이 아니라 픽셀로 재확인한다.
// 사용: node probe-scorch.js
// 방법: 적을 지우고 빈 지면에 scorchDecal 하나만 띄운 뒤, 데칼 중심부와 같은 높이의
//       바깥 대조 구간을 같은 프레임에서 비교한다(데칼 전/후 두 장 diff — 조명·바이옴 변수 제거).
// ⚠️ 데칼은 3D 오브젝트라 렌더 루프를 완전히 멈추면 안 된다 — addAnim이 안 돌아 opacity가 0에 머문다.
//    대신 update를 수동 구동해 시간축을 통제한다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const W = 480, H = 854;

async function decode(page, buf) {
    return page.evaluate(async (b64) => {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, img.width, img.height).data;
        return { w: img.width, h: img.height, d: Array.from(d) };
    }, buf.toString('base64'));
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await page.waitForTimeout(1500);

    // 전투·행군 정지 — 두 장이 같은 배경이어야 diff가 데칼만 잡는다
    await page.evaluate(() => {
        Combat.tick = function () { };
        Scene3D.clearEnemies(); Combat.enemies = [];
        Scene3D.walking = false;
        Scene3D._probeRAF = Scene3D.update;
        Scene3D.update = function () { };   // 자동 루프 정지(수동 구동으로 대체)
    });
    await page.waitForTimeout(400);

    // 데칼을 띄우고 수동으로 시간을 흘려 최대 불투명(k≈0.08) 근처에 세운다.
    // ⚠️ '데칼 전' 장면을 시간을 흘리기 **전에** 찍으면 구름·풀 바람·영웅 아이들이 그 사이 움직여
    //    배경이 통째로 달라진다(첫 시도에서 대조 지면 명도가 118→188로 뛰었다). 시간을 다 흘린 뒤
    //    **같은 프레임에서 데칼만 껐다 켜서** 두 장을 찍는 게 유일하게 깨끗한 비교다.
    const spot = await page.evaluate(() => {
        const pos = new THREE.Vector3(Combat.HERO_X + 1.4, 0, 0);
        const n0 = Scene3D.scene.children.length;
        Scene3D.scorchDecal(pos, 0.62, 2.2);
        Scene3D._probeDecal = Scene3D.scene.children[n0];        // 방금 추가된 데칼 메시
        // 페이드인은 dur의 8% = 0.176초 → 12프레임 흘려야 최대 불투명(0.72) 근처에 선다
        for (let i = 0; i < 12; i++) Scene3D._probeRAF.call(Scene3D, 1 / 60);
        Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
        const v = pos.clone().project(Scene3D.camera);
        const r = Scene3D.renderer.domElement.getBoundingClientRect();
        return {
            x: Math.round((v.x * 0.5 + 0.5) * r.width + r.left),
            y: Math.round((-v.y * 0.5 + 0.5) * r.height + r.top),
            opacity: +Scene3D._probeDecal.material.opacity.toFixed(3),
            isDecal: Scene3D._probeDecal.material.map === Scene3D._scorchTex,
        };
    });
    await page.waitForTimeout(150);
    const after = await decode(page, await page.screenshot());
    // 시간은 그대로 두고 데칼만 끈 뒤 재렌더 → 완전히 같은 배경의 '데칼 전'
    await page.evaluate(() => {
        Scene3D._probeDecal.visible = false;
        Scene3D.renderer.render(Scene3D.scene, Scene3D.camera);
    });
    await page.waitForTimeout(150);
    const before = await decode(page, await page.screenshot());

    // 데칼 중심 반경 10px 평균과, 같은 y에서 좌우로 90px 떨어진 대조 구간 평균
    const avg = (img, cx, cy, r) => {
        let n = 0, s = [0, 0, 0];
        for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
            if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
            const i = (y * img.w + x) * 4;
            s[0] += img.d[i]; s[1] += img.d[i + 1]; s[2] += img.d[i + 2]; n++;
        }
        return s.map(v => v / n);
    };
    const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const cIn = avg(after, spot.x, spot.y, 10);
    const cInBefore = avg(before, spot.x, spot.y, 10);
    const cOut = avg(after, spot.x + 90, spot.y, 10);
    const cOutBefore = avg(before, spot.x + 90, spot.y, 10);

    const dSelf = lum(cIn) - lum(cInBefore);         // 같은 픽셀의 데칼 전/후 (가장 신뢰도 높은 지표)
    const dNeighbor = lum(cIn) - lum(cOut);          // 데칼 안 vs 옆 지면
    console.log('=== 그을음 데칼 밝기 실측 (데칼 중심 %d,%d, opacity %s, 데칼맞음=%s) ===',
        spot.x, spot.y, spot.opacity, spot.isDecal);
    console.log('데칼 전 중심 RGB:', cInBefore.map(v => v.toFixed(1)).join(','), '명도', lum(cInBefore).toFixed(1));
    console.log('데칼 후 중심 RGB:', cIn.map(v => v.toFixed(1)).join(','), '명도', lum(cIn).toFixed(1));
    console.log('옆 지면(대조) RGB:', cOut.map(v => v.toFixed(1)).join(','), '명도', lum(cOut).toFixed(1),
        '(데칼 전', lum(cOutBefore).toFixed(1) + ' — 변화 없어야 정상)');
    console.log('\n같은 픽셀 전/후 명도차:', dSelf.toFixed(1), dSelf < -6 ? '→ OK (어두워짐)' : '→ NG (안 어두워지거나 밝아짐)');
    console.log('데칼 안 − 옆 지면 명도차:', dNeighbor.toFixed(1), dNeighbor < -6 ? '→ OK' : '→ NG');
    console.log('\n콘솔 에러:', errors.length, errors.slice(0, 3).join(' | '));
    await browser.close();
})();
