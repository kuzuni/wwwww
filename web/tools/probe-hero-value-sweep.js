// 영웅 명도 분리 **스윕** — "판금 값을 얼마나 어떻게 내려야 배경과 갈리는가"를 표로 낸다.
//
// 배경: 비평가 2인이 독립적으로 "캐릭터가 배경과 값으로 분리되지 않는다"를 1~2순위로 올렸고
//       `probe-hero-value.js` 실측으로 확인됐다(명도 델타 ~14, 처방 ≥45).
//       그런데 이 항목에는 **실패한 처방이 이미 두 개 기록돼 있다**:
//         · 라이트 하향 → 화면 면적 대부분인 능선 3겹이 MeshBasic 무조명이라 화면 중간값이 오히려 올랐다
//         · HSL 틴트 albedo → 전후 3회씩 재니 개선이 측정 노이즈 안이라 기각
//       그래서 이번엔 손대기 전에 **어떤 손잡이가 실제로 델타를 움직이는지부터 잰다.**
//       prochar.js 주석의 가설("metalness 0.85 금속은 albedo 가 아니라 env 반사가 화면값을 지배한다")도
//       여기서 검증된다 — 사실이면 albedo 열은 거의 안 움직이고 env 열만 움직인다.
//
// ⚠️ 한 브라우저 세션 안에서 설정만 바꿔 가며 재므로 프레이밍·소품·포즈가 전 조합에서 동일하다.
//    (조합마다 브라우저를 새로 띄우면 그 차이가 지표에 섞인다.)
// ⚠️ 이 스크립트는 **아무것도 저장하지 않는다** — 측정 전용이다. 채택은 사람이 표를 보고 정한다.
//
// 사용: node probe-hero-value-sweep.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; };
    });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    const out = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); if (typeof Combat !== 'undefined') Combat.enemies = [];
        ProChar.update = () => {};
        const R = Scene3D.heroRig;
        R._t = 0; R._idleT = 0;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;

        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = Math.max(size.x, size.y, size.z) * 1.9 + 0.4;
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.18, 0)), look: c.clone() };
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(Scene3D.camLock.look);

        // 영웅의 MeshStandardMaterial 을 모아 원본 상태를 저장 (조합마다 원복 후 적용)
        const mats = [];
        Scene3D.heroG.traverse(o => {
            if (o.isMesh && o.material && o.material.isMeshStandardMaterial && mats.indexOf(o.material) < 0) mats.push(o.material);
        });
        const orig = mats.map(m => ({ m, col: m.color.clone(), env: m.envMapIntensity, rough: m.roughness }));
        const restore = () => { for (const o of orig) { o.m.color.copy(o.col); o.m.envMapIntensity = o.env; o.m.roughness = o.rough; } };

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        // 배경 프레임은 재질과 무관하므로 한 번만 뜬다
        Scene3D.heroG.visible = false;
        const off = grab();
        Scene3D.heroG.visible = true;

        const pts = [];
        for (const sx of [box.min.x, box.max.x]) for (const sy of [box.min.y, box.max.y]) for (const sz of [box.min.z, box.max.z]) {
            const v = new THREE.Vector3(sx, sy, sz).project(Scene3D.camera);
            pts.push([(v.x * 0.5 + 0.5) * w, (v.y * 0.5 + 0.5) * h]);
        }
        const rx0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0])))), rx1 = Math.min(w - 1, Math.ceil(Math.max(...pts.map(p => p[0]))));
        const ry0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1])))), ry1 = Math.min(h - 1, Math.ceil(Math.max(...pts.map(p => p[1]))));
        const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];

        const measure = () => {
            const on = grab();
            const hv = [], bv = [];
            for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
                const i = (y * w + x) * 4;
                const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
                if (d > 14) { hv.push(lum(on, i)); bv.push(lum(off, i)); }
            }
            if (!hv.length) return null;
            const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
            const hm = mean(hv), bm = mean(bv);
            return {
                maskPx: hv.length, hero: +hm.toFixed(1), bg: +bm.toFixed(1), delta: +Math.abs(hm - bm).toFixed(1),
                darkPct: +(100 * hv.filter(v => v < 45).length / hv.length).toFixed(1),
            };
        };

        // 스윕 조합 — albedo 배수 × envMapIntensity 배수 × roughness 가산
        const rows = [];
        const combos = [
            ['기준(현재)', 1.0, 1.0, 0],
            // 1차 스윕 결론(이 표는 재현용으로 남긴다): albedo 와 env 는 둘 다 델타를 크게 움직이고
            // **roughness 는 사실상 무효**(13.4 → 12.8)다. prochar.js 주석의 'albedo 는 천장이 낮다'는
            // 가설은 darkPct 목표에는 맞았을지 몰라도 **명도 델타에는 안 맞는다**(albedo ×0.35 단독으로 46.6).
            ['albedo ×0.70', 0.70, 1.0, 0],
            ['albedo ×0.50', 0.50, 1.0, 0],
            ['albedo ×0.35', 0.35, 1.0, 0],
            ['env ×0.50', 1.0, 0.50, 0],
            ['env ×0.25', 1.0, 0.25, 0],
            ['env ×0.00', 1.0, 0.00, 0],
            ['rough +0.25', 1.0, 1.0, 0.25],
            // 2차 — 게이트(45)를 **가장 적게 어둡게 하고** 넘는 지점을 찾는다.
            // 과하게 내리면 두 비평가가 '되돌리지 말 것'으로 꼽은 컬러 스킴(쿨 블루그레이 + 골드 트림)이
            // 검은 덩어리로 뭉개진다 — 지표만 좇다 멀쩡한 것을 망치는 전형적 함정이다.
            ['albedo ×0.80 + env ×0.55', 0.80, 0.55, 0],
            ['albedo ×0.75 + env ×0.50', 0.75, 0.50, 0],
            ['albedo ×0.70 + env ×0.50', 0.70, 0.50, 0],
            ['albedo ×0.65 + env ×0.45', 0.65, 0.45, 0],
            ['albedo ×0.60 + env ×0.40', 0.60, 0.40, 0],
            ['albedo ×0.55 + env ×0.55', 0.55, 0.55, 0],
            ['albedo ×0.50 + env ×0.25', 0.50, 0.25, 0],
        ];
        // 3차 — **차가운 재질에만** 적용하는 변형. 위 조합들은 70개 재질 전부를 내리는데, 그러면
        // 두 비평가가 '되돌리지 말 것'으로 꼽은 **골드 트림**과 웜 액센트(망토·가죽)까지 같이 죽는다.
        // 판금·사슬(차가운 계열)만 내렸을 때 델타가 얼마나 나오는지 따로 재야 채택이 가능하다.
        // 판별: r <= b (푸른 기) = 차가운 재질. 금(r>g>b)·살색·적색 망토는 제외된다.
        const isCool = c => c.r <= c.b + 0.02;
        for (const [ka, ke] of [[0.55, 0.55], [0.50, 0.45], [0.45, 0.40], [0.40, 0.35], [0.35, 0.30]])
            combos.push([`[차가운 재질만] albedo ×${ka} + env ×${ke}`, ka, ke, 0, true]);

        for (const [name, ka, ke, dr, coolOnly] of combos) {
            restore();
            for (const o of orig) {
                if (coolOnly && !isCool(o.col)) continue;
                o.m.color.setRGB(o.col.r * ka, o.col.g * ka, o.col.b * ka);
                o.m.envMapIntensity = o.env * ke;
                o.m.roughness = Math.min(1, o.rough + dr);
            }
            const r = measure();
            rows.push(Object.assign({ name }, r || { err: 'mask empty' }));
        }
        restore();
        return { px: { w, h }, mats: mats.length, rows };
    });

    console.log('canvas', JSON.stringify(out.px), '· 영웅 MeshStandardMaterial', out.mats + '개');
    console.log('');
    console.log('조합'.padEnd(38) + '영웅L   배경L   델타   L<45%   마스크px');
    console.log('-'.repeat(80));
    for (const r of out.rows) {
        if (r.err) { console.log(r.name.padEnd(38) + r.err); continue; }
        console.log(r.name.padEnd(38)
            + String(r.hero).padStart(6) + String(r.bg).padStart(8) + String(r.delta).padStart(7)
            + String(r.darkPct).padStart(8) + String(r.maskPx).padStart(10)
            + (r.delta >= 45 ? '  ✅' : ''));
    }
    console.log('');
    console.log('처방 기준: 델타 ≥45 · L<45 비율 ≥20%');
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
