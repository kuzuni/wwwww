// 타격/스킬 파티클이 **청키 큐브**인지 자동 게이트 — 사용: node probe-spark-voxel.js
// TODO `skill-fx-exaggerated` / 화풍 확정 블록(2026-08-20 voxel + 치비) 전용.
//   "스킬 이펙트 = 청키 큐브 파티클 + 블록 투사체 + 볼드 플랫 섬광(부드러운 사실 VFX 아님)"
// 예전 `spawnSparks` 는 가산 블렌딩 **빌보드 스프라이트**(소프트 글로우 원반)였다 — 확정 화풍이
// 명시적으로 배제한 그것이다. 눈으로 보는 프레임 캡처만으로는 스프라이트로 되돌아가도 못 막으므로
// 여기서 수치로 굳힌다.
//
// 판정:
//   ① 스프라이트가 **0개**, 전부 Mesh + BoxGeometry
//   ② 지오메트리는 **공유 1개** (파티클마다 새로 만들면 드로우콜·GC 가 튄다)
//   ③ 텍스처 없음(면당 플랫 색) + 큐브별 명도 변화가 실재 (표준편차 > 0.01)
//   ④ 3축 텀블 — 한 스텝 흘린 뒤 x·y·z 회전이 **전부** 변한 파티클이 90% 이상
//   ⑤ 수명 동안 수축 — scale 이 baseScale 보다 작아진다 (예전 코드는 `p.isSprite &&` 조건 탓에
//      메시 파티클이 수축을 못 받아 '꺼지듯' 사라졌다)
//   ⑥ 뒷정리 — 수명이 지나면 particles 0, 씬 자식이 원래대로
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.scene && Scene3D.spawnSparks, null, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const res = await page.evaluate(() => {
        // ⚠️ 함정 ③(TODO 채점 함정) — 백로그가 밀려 있으면 남의 연출이 섞여 수치가 튄다.
        //    `Combat.tick` 을 끊고 파티클 배열을 비운 뒤 **단발로** 태운다.
        if (typeof Combat !== 'undefined') Combat.tick = () => { };
        for (const p of Scene3D.particles.slice()) Scene3D.scene.remove(p);
        Scene3D.particles.length = 0;
        const base0 = Scene3D.scene.children.length;

        const pos = new THREE.Vector3(0, 1, 0);
        Scene3D.spawnSparks(pos, 24, 0xffcc44, {});
        Scene3D.spawnSparks(pos, 24, 0x66ddff, { solid: true, scale: 1.3 });
        const ps = Scene3D.particles.slice();

        const geos = new Set(), lums = [];
        let sprites = 0, boxes = 0, textured = 0;
        for (const p of ps) {
            if (p.isSprite) { sprites++; continue; }
            if (p.geometry) {
                geos.add(p.geometry.uuid);
                if (p.geometry.type === 'BoxGeometry') boxes++;
            }
            const m = p.material;
            if (m && m.map) textured++;
            if (m && m.color) lums.push(0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b);
        }
        const mean = lums.reduce((a, b) => a + b, 0) / (lums.length || 1);
        const lumSd = Math.sqrt(lums.reduce((a, b) => a + (b - mean) ** 2, 0) / (lums.length || 1));

        const before = ps.map(p => ({ rx: p.rotation.x, ry: p.rotation.y, rz: p.rotation.z, s: p.scale.x, bs: p.userData.baseScale }));
        Scene3D.update(1 / 60);
        let tumble3 = 0;
        ps.forEach((p, i) => {
            const b = before[i];
            if (p.rotation.x !== b.rx && p.rotation.y !== b.ry && p.rotation.z !== b.rz) tumble3++;
        });
        // 수명의 절반쯤 흘려 수축을 확인
        for (let i = 0; i < 18; i++) Scene3D.update(1 / 60);
        const alive = Scene3D.particles.slice();
        let shrunk = 0;
        for (const p of alive) if (p.userData.baseScale && p.scale.x < p.userData.baseScale * 0.995) shrunk++;

        // 수명을 다 흘려 뒷정리 확인
        for (let i = 0; i < 90; i++) Scene3D.update(1 / 60);
        return {
            n: ps.length, sprites, boxes, geoCount: geos.size, textured,
            lumSd, tumble3, aliveMid: alive.length, shrunk,
            leftover: Scene3D.particles.length, childDelta: Scene3D.scene.children.length - base0,
        };
    });

    const f = [];
    console.log(`파티클 ${res.n}개 · 스프라이트 ${res.sprites} · BoxGeometry ${res.boxes} · 공유 지오 ${res.geoCount}개 · 텍스처 입은 것 ${res.textured}`);
    console.log(`큐브별 명도 표준편차 ${res.lumSd.toFixed(4)} · 3축 텀블 ${res.tumble3}/${res.n}`);
    console.log(`중반 생존 ${res.aliveMid} 중 수축한 것 ${res.shrunk} · 수명 후 잔존 ${res.leftover} · 씬 자식 증분 ${res.childDelta}`);
    if (res.sprites) f.push(`스프라이트 ${res.sprites}개 — 빌보드로 되돌아갔다`);
    if (res.boxes !== res.n) f.push(`BoxGeometry 가 ${res.boxes}/${res.n}`);
    if (res.geoCount !== 1) f.push(`지오메트리가 ${res.geoCount}개 — 공유 1개여야 한다`);
    if (res.textured) f.push(`텍스처 입은 파티클 ${res.textured}개 — 면당 플랫 색 규칙 위반`);
    if (res.lumSd < 0.01) f.push(`큐브별 명도 변화 없음 (sd ${res.lumSd.toFixed(4)})`);
    if (res.tumble3 < res.n * 0.9) f.push(`3축 텀블 ${res.tumble3}/${res.n} < 90%`);
    if (!res.aliveMid || res.shrunk < res.aliveMid * 0.9) f.push(`수축 ${res.shrunk}/${res.aliveMid} < 90%`);
    if (res.leftover) f.push(`뒷정리 안 됨 — 잔존 ${res.leftover}`);
    if (res.childDelta) f.push(`씬 자식이 ${res.childDelta} 남았다`);
    if (errors.length) f.push('콘솔 에러 ' + errors.length);
    console.log('콘솔 에러:', errors.length, errors.slice(0, 4));
    console.log(f.length ? '\nFAIL:\n - ' + f.join('\n - ') : '\nPASS — 청키 큐브 파티클(공유 지오·플랫 색·3축 텀블·수축·뒷정리)');
    await browser.close();
    process.exit(f.length ? 1 : 0);
})();
