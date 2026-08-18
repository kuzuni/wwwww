// 인버티드 헐 아웃라인의 **대응 비교(paired A/B)** 실측.
//
// ── 왜 probe-hero-value.js 를 두 번 돌리면 안 되는가 ─────────────────────────────
// 그 프로브는 카메라를 `Box3.setFromObject(Scene3D.heroG)` 로 매 런 새로 잡는데, heroG 에는
// 보이지 않는 레거시 자식·무기·궤적이 섞여 있어 **런마다 ROI 가 흔들린다**(실측: 아웃라인 도입
// 전후로 rx 115~355 → 142~328). 그 상태로 델타를 비교하면 프레이밍 차이를 효과로 오독한다.
// 앞 세션들이 값 구조에서 반복해 밟은 함정이라(인계 메모 ①), 여기서는 **한 페이지 세션 안에서
// 카메라·포즈·소품을 완전히 고정한 채 셸의 visible 만 토글**해 같은 픽셀을 비교한다.
//
// 지표는 probe-hero-value.js 와 같은 정의(영웅 켠/끈 두 프레임의 차분을 마스크로 사용):
//   delta   : |영웅 평균 L − 가려진 배경 평균 L| — 비평가 처방 ≥45
//   darkPct : 영웅 화소 중 L<45 비율 — 비평가 목표 ≥20%
//   maskPx  : 영웅 화소 수 (아웃라인이 배경을 얼마나 잠식했는지 = 순증 면적)
//
// 사용: node probe-outline.js [noweapon] [w=0.0085,0.012,...] [k=0.22,0.3,...]
//   w/k 를 주면 그 조합을 전부 스윕한다(같은 세션 안이라 조합 간 비교도 대응 비교다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const NOWEAPON = process.argv.includes('noweapon');
const argOf = (k, d) => {
    const a = process.argv.find(s => s.startsWith(k + '='));
    return a ? a.slice(k.length + 1).split(',').map(Number) : d;
};
const WS = argOf('w', null), KS = argOf('k', null);

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

    const out = await page.evaluate(({ NOWEAPON, WS, KS }) => {
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
        if (NOWEAPON) { if (Scene3D.weaponG) Scene3D.weaponG.visible = false; if (R.shield) R.shield.visible = false; }

        // 셸 목록을 먼저 모은다(카메라·ROI 를 잡기 전에 — 셸은 원 지오메트리와 바운딩이 같아 박스에 영향 없음)
        const shells = [];
        Scene3D.heroG.traverse(o => { if (o.userData && o.userData.isOutline) shells.push(o); });

        // 카메라·ROI 는 **한 번만** 계산해 전 조건에 재사용한다 (대응 비교의 핵심)
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = Math.max(size.x, size.y, size.z) * 1.9 + 0.4;
        Scene3D.camera.position.copy(c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.18, 0)));
        Scene3D.camera.lookAt(c);

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        Scene3D.camera.updateMatrixWorld(true); // ⚠️ project() 전에 필수 — 원본 프로브는 grab() 이 먼저 돌아 우연히 갱신됐다
        const pts = [];
        for (const sx of [box.min.x, box.max.x]) for (const sy of [box.min.y, box.max.y]) for (const sz of [box.min.z, box.max.z]) {
            const v = new THREE.Vector3(sx, sy, sz).project(Scene3D.camera);
            pts.push([(v.x * 0.5 + 0.5) * w, (v.y * 0.5 + 0.5) * h]);
        }
        // ROI 를 6px 넓힌다 — 아웃라인은 실루엣 **바깥**에 그려지므로 바운딩 박스 투영에 딱 맞추면 잘린다.
        const PAD = 6;
        const rx0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0]))) - PAD), rx1 = Math.min(w - 1, Math.ceil(Math.max(...pts.map(p => p[0]))) + PAD);
        const ry0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1]))) - PAD), ry1 = Math.min(h - 1, Math.ceil(Math.max(...pts.map(p => p[1]))) + PAD);

        const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
        const measure = () => {
            const on = grab();
            Scene3D.heroG.visible = false;
            const off = grab();
            Scene3D.heroG.visible = true;
            const hv = [], bv = [];
            for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
                const i = (y * w + x) * 4;
                const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
                if (d > 14) { hv.push(lum(on, i)); bv.push(lum(off, i)); }
            }
            if (!hv.length) return { error: '마스크 비었음' };
            const sorted = hv.slice().sort((a, b) => a - b);
            const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
            const heroMean = mean(hv), bgMean = mean(bv);
            return {
                maskPx: hv.length,
                heroMean: +heroMean.toFixed(1), bgMean: +bgMean.toFixed(1),
                delta: +Math.abs(heroMean - bgMean).toFixed(1),
                p50: +sorted[Math.floor(sorted.length * 0.5)].toFixed(1),
                max: +sorted[sorted.length - 1].toFixed(1),
                darkPct: +(100 * hv.filter(v => v < 45).length / hv.length).toFixed(2),
                clipPct: +(100 * hv.filter(v => v >= 250).length / hv.length).toFixed(2),
            };
        };

        const rows = [];
        const setShells = v => shells.forEach(s => { s.visible = v; });
        setShells(false);
        rows.push(Object.assign({ label: 'OFF (아웃라인 없음)' }, measure()));
        const ws = WS || [ProChar.OUTLINE.w], ks = KS || [ProChar.OUTLINE.k];
        setShells(true);
        for (const wv of ws) for (const kv of ks) {
            ProChar.setOutline({ w: wv, k: kv });
            rows.push(Object.assign({ label: `w=${wv} k=${kv}` }, measure()));
        }
        return { roi: { rx0, rx1, ry0, ry1 }, shells: shells.length, rows };
    }, { NOWEAPON, WS, KS });

    console.log(`${NOWEAPON ? '[검·방패 숨김]' : '[전체]'} ROI ${JSON.stringify(out.roi)} · 셸 ${out.shells}개`);
    const base = out.rows[0];
    console.log('조건'.padEnd(22) + 'maskPx'.padStart(8) + 'heroL'.padStart(8) + 'bgL'.padStart(8) + 'delta'.padStart(8) + 'Δ대비OFF'.padStart(10) + 'dark%'.padStart(8) + 'clip%'.padStart(7));
    for (const r of out.rows) {
        if (r.error) { console.log(r.label.padEnd(22) + '  ' + r.error); continue; }
        const d = (r.delta - base.delta);
        const ds = (d >= 0 ? '+' : '') + d.toFixed(1);
        console.log(r.label.padEnd(22) + String(r.maskPx).padStart(8) + String(r.heroMean).padStart(8) + String(r.bgMean).padStart(8)
            + String(r.delta).padStart(8) + ds.padStart(10) + String(r.darkPct).padStart(8) + String(r.clipPct).padStart(7));
    }
    console.log(errs.length ? '콘솔 에러:\n' + errs.join('\n') : '(no console errors)');
    await browser.close();
})();
