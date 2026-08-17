// 영웅 vs 배경 **명도 분리** 실측 — 비평가 2인이 독립적으로 1~2순위로 올린 결함
// ("캐릭터가 배경과 값으로 분리되지 않는다 / 진짜 어두운 값이 형태를 안 만든다").
//
// ── 왜 새로 만드는가 ────────────────────────────────────────────────────────────
// ⓐ `probe-silhouette.js` 는 **델타 측정에 쓸 수 없다** — 앞 세션 기록대로 같은 코드로 maskPx 가
//    3074~3477(13%) 흔들려 darkPct·edgeStep 이 런마다 달라진다. 값 구조 작업이 그 때문에
//    여러 세션 막혀 있었다.
// ⓑ 비평가 A 는 '고정 픽셀 사각형'(흉부 205,150~265,225 / 잔디 60,150~150,230)으로 쟀다.
//    수치는 옳지만 **소품이 Math.random 으로 배치돼** 그 잔디 사각형에 다음 런에는 바위가 들어온다.
//
// ── 이 프로브의 방법 ───────────────────────────────────────────────────────────
// **같은 픽셀을 영웅 켠 프레임과 끈 프레임에서 두 번 읽는다.** 그러면
//   · 영웅 마스크 = 두 프레임이 다른 픽셀 (임계값·색 조건 불필요 — 어떤 albedo 에도 안전)
//   · 배경 값     = 바로 **그 픽셀들의 영웅 없는 값** = 영웅이 실제로 가리고 있는 배경
// 이 되어, 프레이밍이나 소품 배치가 흔들려도 '이 캐릭터가 자기 뒤 배경과 얼마나 갈리는가'는
// 정확히 같은 것을 잰다. 소품 시드도 고정하지만, 고정이 실패해도 지표가 안 망가진다.
//
// 지표
//   heroMean/heroP5/P50/P95/Max : 영웅 화소의 sRGB 휘도(0~255) 분포. Max 255 = 스펙큘러 클리핑.
//   bgMean                      : 영웅이 가린 배경의 평균 휘도
//   delta                       : |heroMean - bgMean| — 비평가 처방은 ≥45
//   darkPct                     : 영웅 화소 중 L<45 비율 — 비평가 목표는 ≥20%
//   clipPct                     : L≥250 비율 (하이라이트 클리핑 면적)
//
// 사용: node probe-hero-value.js [noweapon]
//   noweapon = 검·방패를 숨기고 잰다. 무기는 별도 항목 소관인데다 흰 검신이 밝은 면적을 크게 차지해
//   '갑옷 값 구조'의 지표를 오염시킨다 — 갑옷만의 기여를 보려면 이 모드로 재라.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const NOWEAPON = process.argv.includes('noweapon');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    // 소품·지형 배치의 Math.random 을 고정 — 프레이밍 재현성을 올린다(지표 자체는 이것 없이도 성립).
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; };
    });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig && typeof ProChar !== 'undefined', null, { timeout: 60000 });

    const out = await page.evaluate((NOWEAPON) => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        Scene3D.clearEnemies(); if (typeof Combat !== 'undefined') Combat.enemies = [];
        ProChar.update = () => {};                       // 포즈 고정
        const R = Scene3D.heroRig;
        R._t = 0; R._idleT = 0;
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        if (NOWEAPON) { if (Scene3D.weaponG) Scene3D.weaponG.visible = false; if (R.shield) R.shield.visible = false; }

        // 인게임과 같은 조명·안개·톤매핑을 그대로 쓴다 — 값 구조는 **최종 화면**에서 판정해야 한다
        // (선형 albedo 를 아무리 내려도 노출·톤매핑 뒤에 중간톤으로 뜨는 함정이 이 항목에 기록돼 있다).
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = Math.max(size.x, size.y, size.z) * 1.9 + 0.4;
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)).add(new THREE.Vector3(0, dist * 0.18, 0)), look: c.clone() };
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(Scene3D.camLock.look);

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        const on = grab();
        Scene3D.heroG.visible = false;
        const off = grab();
        Scene3D.heroG.visible = true;

        // ⚠️ 그림자도 영웅을 끄면 사라진다 — 지면의 그림자 화소까지 '영웅'으로 세면 darkPct 가
        //    공짜로 부풀어 지표가 거짓말을 한다. 그림자는 **어두워지기만** 하므로, 영웅 켠 값이
        //    배경보다 **밝아진 경우**와 '충분히 다른 어두운 덩어리'를 가르기 위해 위쪽 절반만 쓰지 않고
        //    ROI 를 영웅 바운딩 박스의 화면 투영으로 제한한다(그림자는 발밑 바깥으로 길게 뻗는다).
        const pts = [];
        for (const sx of [box.min.x, box.max.x]) for (const sy of [box.min.y, box.max.y]) for (const sz of [box.min.z, box.max.z]) {
            const v = new THREE.Vector3(sx, sy, sz).project(Scene3D.camera);
            pts.push([(v.x * 0.5 + 0.5) * w, (v.y * 0.5 + 0.5) * h]);
        }
        const rx0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[0])))), rx1 = Math.min(w - 1, Math.ceil(Math.max(...pts.map(p => p[0]))));
        const ry0 = Math.max(0, Math.floor(Math.min(...pts.map(p => p[1])))), ry1 = Math.min(h - 1, Math.ceil(Math.max(...pts.map(p => p[1]))));

        const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];
        const hv = [], bv = [];
        for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
            const i = (y * w + x) * 4;
            const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
            if (d > 14) { hv.push(lum(on, i)); bv.push(lum(off, i)); }
        }
        if (!hv.length) return { error: '영웅 마스크가 비었다' };
        const sorted = hv.slice().sort((a, b) => a - b);
        const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
        const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
        const heroMean = mean(hv), bgMean = mean(bv);
        return {
            px: { w, h }, roi: { rx0, rx1, ry0, ry1 }, maskPx: hv.length,
            heroMean: +heroMean.toFixed(1), bgMean: +bgMean.toFixed(1), delta: +Math.abs(heroMean - bgMean).toFixed(1),
            p5: +q(0.05).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +sorted[sorted.length - 1].toFixed(1),
            darkPct: +(100 * hv.filter(v => v < 45).length / hv.length).toFixed(2),
            clipPct: +(100 * hv.filter(v => v >= 250).length / hv.length).toFixed(2),
        };
    }, NOWEAPON);

    if (out.error) { console.log('ERROR: ' + out.error); await browser.close(); process.exit(1); }
    console.log(NOWEAPON ? '[검·방패 숨김]' : '[전체]', 'canvas', JSON.stringify(out.px), '· ROI', JSON.stringify(out.roi), '· 영웅 화소', out.maskPx);
    console.log('영웅 평균 L :', out.heroMean, ' / 가려진 배경 평균 L :', out.bgMean);
    console.log('  ▶ 명도 델타 :', out.delta, out.delta >= 45 ? '✅ 분리됨' : '❌ 배경에 녹는다 (비평가 처방 ≥45)');
    console.log('분포 p5 / p50 / p95 / max :', `${out.p5} / ${out.p50} / ${out.p95} / ${out.max}`);
    console.log('  ▶ 어두운 값 비율 (L<45) :', out.darkPct + '%', out.darkPct >= 20 ? '✅' : '❌ (목표 ≥20%)');
    console.log('  ▶ 하이라이트 클리핑 (L≥250) :', out.clipPct + '%', out.clipPct <= 0.3 ? '✅' : '❌ 스펙큘러가 흰색으로 타버림');
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
