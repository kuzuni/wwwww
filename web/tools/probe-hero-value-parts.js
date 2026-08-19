// 영웅 명도 분리 **부위별 분해** — "델타를 끌어내리는 밝은 덩어리가 어디냐"를 지목한다.
//
// 배경: `probe-hero-value.js` 는 캐릭터 전체 한 숫자(델타)만 준다. 그 숫자가 45 게이트에 못 미친다는
//       건 여러 세션이 알고 있었는데, **어느 부위가 범인인지**를 안 재서 매번 판금 albedo 만 다시
//       내리는 걸로 갔다. 치비 전환(머리 0.48 → 1.0 → 1.30)으로 화면에서 머리·투구가 차지하는
//       면적이 크게 늘었으므로, 지금은 그 가정 자체를 다시 세워야 한다.
//
// 재는 법: `probe-hero-value.js` 와 같은 **켠/끈 차분 마스크**를 부위마다 따로 낸다.
//   ⑴ 영웅 전체를 켠 프레임 `on` 을 기준으로 잡고
//   ⑵ 부위 하나만 숨긴 프레임을 찍어 `on` 과 다른 화소 = 그 부위가 화면에서 실제로 차지한 화소
//   ⑶ 그 화소들의 **`on` 값**(= 최종 화면 값)으로 평균 L·면적을 낸다.
//   색 임계값을 안 쓰므로 재질·조명이 바뀌어도 마스크가 흔들리지 않는다.
// ⚠️ 부위가 서로 가리므로 면적 합은 전체와 정확히 안 맞는다(가려진 쪽이 덜 잡힌다). 그게 맞다 —
//    화면에 실제로 보이는 만큼만 델타에 기여한다.
//
// 판정 없음(측정 전용). 채택은 표를 보고 사람이 정한다.
// 사용: node probe-hero-value-parts.js
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

        // `probe-hero-value.js` 와 같은 프레이밍(값은 프레이밍에 딸리므로 두 도구가 어긋나면 안 된다)
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = Math.max(size.x, size.y, size.z) * 1.9 + 0.4;
        Scene3D.camera.position.copy(c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.18, 0)));
        Scene3D.camera.lookAt(c);
        Scene3D.camLock = { pos: Scene3D.camera.position.clone(), look: c.clone() };

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
        const on = grab();

        // 부위 목록 — 없는 것은 조용히 건너뛴다(리그가 바뀌어도 도구가 안 죽게).
        const head = R.bones.head;
        const helmet = Scene3D.helmetG;
        // 맨머리(피부·얼굴)는 '머리 그룹 − 투구'다. 투구를 숨긴 상태에서 머리 그룹을 마저 숨겨 잰다.
        const parts = [];
        const push = (name, objs) => { const a = (Array.isArray(objs) ? objs : [objs]).filter(Boolean); if (a.length) parts.push({ name, objs: a }); };
        push('투구(helmetG)', helmet);
        push('머리 그룹 전체', head);
        push('망토', [R.bones.cape, R.capeMesh]);
        push('방패', R.shield);
        push('무기(검)', Scene3D.weaponG);
        push('팔 2개', (R.arms || []).map(a => a.shoulder || a.root || a).filter(Boolean));
        push('다리 2개', [R.bones.hipL, R.bones.hipR]);
        push('몸통(spine 하위 전부)', R.bones.spine);

        const rows = [];
        for (const p of parts) {
            const prev = p.objs.map(o => o.visible);
            for (const o of p.objs) o.visible = false;
            const off = grab();
            p.objs.forEach((o, i) => { o.visible = prev[i]; });
            const vals = [];
            for (let i = 0; i < w * h; i++) {
                const j = i * 4;
                const d = Math.abs(on[j] - off[j]) + Math.abs(on[j + 1] - off[j + 1]) + Math.abs(on[j + 2] - off[j + 2]);
                if (d > 14) vals.push(lum(on, j));
            }
            if (!vals.length) { rows.push({ name: p.name, px: 0 }); continue; }
            vals.sort((a, b) => a - b);
            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
            rows.push({
                name: p.name, px: vals.length,
                mean: +mean.toFixed(1),
                p50: +vals[Math.floor(vals.length * 0.5)].toFixed(1),
                p95: +vals[Math.floor(vals.length * 0.95)].toFixed(1),
                brightPct: +(100 * vals.filter(v => v >= 140).length / vals.length).toFixed(1),
            });
        }

        // 전체 기준값(= probe-hero-value 와 같은 정의)
        Scene3D.heroG.visible = false;
        const offAll = grab();
        Scene3D.heroG.visible = true;
        const hv = [], bv = [];
        for (let i = 0; i < w * h; i++) {
            const j = i * 4;
            const d = Math.abs(on[j] - offAll[j]) + Math.abs(on[j + 1] - offAll[j + 1]) + Math.abs(on[j + 2] - offAll[j + 2]);
            if (d > 14) { hv.push(lum(on, j)); bv.push(lum(offAll, j)); }
        }
        const m = a => a.reduce((s, v) => s + v, 0) / a.length;
        return { rows, all: { px: hv.length, hero: +m(hv).toFixed(1), bg: +m(bv).toFixed(1), delta: +Math.abs(m(hv) - m(bv)).toFixed(1) } };
    });

    console.log('--- 영웅 명도 부위별 분해 (최종 화면 값) ---');
    console.log('전체: 화소 ' + out.all.px + ' · 영웅 L ' + out.all.hero + ' vs 배경 L ' + out.all.bg + ' → 델타 ' + out.all.delta + ' (게이트 ≥45)');
    console.log('부위                     화소     평균L   p50    p95   밝은화소(L≥140)');
    for (const r of out.rows.sort((a, b) => (b.px || 0) - (a.px || 0))) {
        if (!r.px) { console.log('  ' + r.name.padEnd(22) + '  (화면에 안 보임)'); continue; }
        console.log('  ' + r.name.padEnd(22) + String(r.px).padStart(6) + '  ' + String(r.mean).padStart(6)
            + '  ' + String(r.p50).padStart(5) + '  ' + String(r.p95).padStart(5) + '   ' + r.brightPct + '%');
    }
    // 델타를 45 로 끌어올리려면 영웅 평균 L 이 얼마여야 하는지 — 부위별 목표를 잡는 기준선
    console.log('참고: 델타 45 를 만들려면 영웅 평균 L ≤ ' + (out.all.bg - 45).toFixed(1) + ' 여야 한다(현재 ' + out.all.hero + ').');
    if (errs.length) console.log('ERRORS: ' + errs.join(' | '));
    await browser.close();
})();
