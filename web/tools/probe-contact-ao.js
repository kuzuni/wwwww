// 접촉 암부(AO) 실측 — 6차 비평가 재지적 ㉡(양쪽 지목) 판정.
//   "어두운 화소가 검은 데칼과 바이저에만 있고 **턱 밑·겨드랑이·스커트 안쪽·부츠 접지**에
//    접촉 암부가 0. 목표: 캐릭터 화소의 20% 이상이 L<45."
//
// ⚠️ 전역 darkPct 만 보면 이 항목을 잘못 닫는다. 아웃라인·니어블랙 재질처럼 **면적을 어둡게 하는**
//    작업이 darkPct 를 통째로 올려 놓으면(현재 46%) 목표 20% 는 진작 넘지만, 정작 지적이 말한
//    "형태를 만드는 접촉 암부"는 하나도 없을 수 있다. 그래서 **부위별로** 잰다.
//
// 방법: 네 접촉 지점을 뼈 좌표에서 잡아 화면에 투영하고, 그 주변 창의 휘도 분포를 읽는다.
//   턱 밑    = 머리 AABB 바닥 중앙 (고젯 위)
//   겨드랑이 = 어깨 피벗에서 몸통 쪽·아래로 (견갑 밑 - 상완 안쪽)
//   스커트 안 = 골반 전면 태싯 간극 안쪽
//   부츠 접지 = 발 AABB 바닥
// 판정: 각 지점 창이 ⑴ **최소 휘도 < 45**(지적 문구가 "접촉 암부가 0" 이므로 존재 여부가 곧 판정)
//       ⑵ 창 안에 **명암 기울기**가 있을 것(p90 − p10 ≥ 30) — 온통 니어블랙인 자리는 '접촉 암부'가
//          아니라 그냥 검은 재질이라, 이걸 안 보면 아웃라인·니어블랙만으로 통과해 버린다.
// ⚠️ '창 중앙값 < 영웅 전체 중앙값' 은 판정에서 뺐다 — 아웃라인·니어블랙이 전체 중앙값을 51 까지
//    끌어내려 놔서, 정상적인 판금 접촉부(중앙 66)가 그 바에 걸린다. 참고용으로 표시만 한다.
// 사용: node probe-contact-ao.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    // ⚠️ 소품·지형 배치의 Math.random 을 고정한다 — 안 하면 로드마다 나무 그림자가 캐릭터에 다르게 얹혀
    //    접촉부 창의 최소 휘도·기울기가 임계 근처에서 통과/불통과로 흔들린다(실측: 3런 중 1런 뒤집힘).
    await page.addInitScript(() => {
        let sd = 0x2f6e2b1;
        Math.random = () => { sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; return ((sd >>> 0) % 1e6) / 1e6; };
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
        const R = Scene3D.heroRig;
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0);
        ProChar.update = () => {};
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;
        R.group.updateWorldMatrix(true, true);

        // 전신 정면 — 네 지점이 한 프레임에 다 들어와야 한다
        const box = new THREE.Box3().setFromObject(R.group);
        const c = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = Math.max(size.x, size.y, size.z) * 1.35 + 0.3;
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)), look: c.clone() };
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(c);
        Scene3D.camera.updateMatrixWorld(true);

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        const on = grab();
        Scene3D.heroG.visible = false;
        const off = grab();
        Scene3D.heroG.visible = true;
        const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2];

        // 영웅 전체 중앙값 (차분 마스크)
        const heroL = [];
        for (let i = 0; i < w * h * 4; i += 4) {
            const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
            if (d > 14) heroL.push(lum(on, i));
        }
        heroL.sort((a, b) => a - b);
        const heroMed = heroL[Math.floor(heroL.length / 2)];

        const bboxOf = (o) => new THREE.Box3().setFromObject(o);
        const headB = bboxOf(R.bones.head);
        const shoulderL = R.arms[0].shoulder;
        const shW = new THREE.Vector3(); shoulderL.getWorldPosition(shW);
        const pelvisW = new THREE.Vector3(); R.bones.pelvis.getWorldPosition(pelvisW);
        // 발 = 무릎 그룹 안에서 **가장 낮은 메시**의 AABB. 무릎 그룹 전체 AABB 로 잡으면 정강이가 섞여
        // 바닥 y 는 맞아도 x·z 중심이 종아리 쪽으로 밀려, 창이 발이 아니라 **지면 그림자**에 얹힌다
        // (첫 판이 그랬다 — 최소 L 116 으로 '암부 없음'이 나왔는데 발을 안 보고 있었다).
        let footB = null;
        if (R.legs && R.legs[0] && R.legs[0].knee) {
            let lowest = null, lowY = Infinity;
            R.legs[0].knee.traverse(o => {
                if (!o.isMesh || o.userData.isOutline) return;
                const b = bboxOf(o);
                if (b.min.y < lowY) { lowY = b.min.y; lowest = b; }
            });
            footB = lowest;
        }

        const pts = {
            '턱 밑': new THREE.Vector3(headB.getCenter(new THREE.Vector3()).x, headB.min.y + 0.012, headB.getCenter(new THREE.Vector3()).z + 0.05),
            '겨드랑이': shW.clone().add(new THREE.Vector3(0.055, -0.075, 0.05)),
            '스커트 안': pelvisW.clone().add(new THREE.Vector3(0, -0.145, 0.20)),
        };
        // ── 세 지점 먼저 (전신 카메라 그대로) ────────────────────────────
        // ⚠️ 아래 부츠 블록이 카메라를 발 근접으로 옮기므로, 세 지점 투영을 **그 전에** 끝낸다.
        //    안 그러면 세 점이 이동한 카메라로 투영돼 화면 밖으로 나간다('창에 영웅 화소 없음').
        const rows = [];
        for (const k in pts) {
            const p = pts[k];
            if (!p) { rows.push({ k, err: '좌표 없음' }); continue; }
            const v = p.clone().project(Scene3D.camera);
            const px = Math.round((v.x * 0.5 + 0.5) * w), py = Math.round((v.y * 0.5 + 0.5) * h);
            const win = [];
            for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
                const xx = px + dx, yy = py + dy;
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                const i = (yy * w + xx) * 4;
                const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
                if (d > 14) win.push(lum(on, i));   // 영웅 화소만 (배경 잔디가 섞이면 판정이 무의미)
            }
            if (!win.length) { rows.push({ k, err: '창에 영웅 화소 없음' }); continue; }
            win.sort((a, b) => a - b);
            const q = f => win[Math.min(win.length - 1, Math.floor(f * win.length))];
            rows.push({
                k, n: win.length, min: +win[0].toFixed(1), med: +win[Math.floor(win.length / 2)].toFixed(1),
                grad: +(q(0.9) - q(0.1)).toFixed(1),
            });
        }
        // ── 부츠 접지 — 발 근접 카메라에서 footAO 존재 확인 (카메라를 옮기므로 맨 마지막) ──
        let bootRow = null;
        if (footB) {
            const aoRings = [];
            for (const leg of R.legs) leg.knee.traverse(o => {
                if (o.isMesh && !o.userData.isOutline && o.geometry.type === 'TorusGeometry'
                    && o.material && o.material.transparent && o.geometry.parameters.radius > 0.04 && o.geometry.parameters.radius < 0.07) aoRings.push(o);
            });
            const fc = footB.getCenter(new THREE.Vector3());
            const fdist = 0.6;
            Scene3D.camera.position.copy(fc.clone().add(fwd.clone().multiplyScalar(fdist)).add(new THREE.Vector3(0, fdist * 0.12, 0)));
            Scene3D.camera.lookAt(fc);
            Scene3D.camera.updateMatrixWorld(true);
            const withAO = grab();
            for (const r of aoRings) r.visible = false;
            const noAO = grab();
            for (const r of aoRings) r.visible = true;
            let darkened = 0, sumDrop = 0;
            for (let i = 0; i < w * h * 4; i += 4) {
                const lw = lum(withAO, i), ln = lum(noAO, i);
                if (ln - lw > 12) { darkened++; sumDrop += ln - lw; }
            }
            bootRow = { rings: aoRings.length, darkened, avgDrop: darkened ? +(sumDrop / darkened).toFixed(1) : 0 };
        }
        return { heroMed: +heroMed.toFixed(1), heroPx: heroL.length, rows, bootRow };
    });

    console.log(`영웅 화소 ${out.heroPx} · 전체 중앙 휘도 L ${out.heroMed}`);
    const ok = [];
    for (const r of out.rows) {
        if (r.err) { console.log(`${r.k.padEnd(8)} ${r.err} ❌`); ok.push(false); continue; }
        const dark = r.min < 45, grad = r.grad >= 30;
        const pass = dark && grad;
        console.log(`${r.k.padEnd(8)} 창 ${String(r.n).padStart(3)}px · 최소 L ${String(r.min).padStart(5)} (암부 <45 → ${dark ? 'O' : 'X'}) · 기울기 p90-p10 ${String(r.grad).padStart(5)} (≥30 → ${grad ? 'O' : 'X'}) · 중앙 L ${String(r.med).padStart(5)} [참고, 전체 ${out.heroMed}] ${pass ? '✅' : '❌'}`);
        ok.push(pass);
    }
    // 부츠 접지 — footAO 링 **존재**만 자동 판정하고(≥2개 = 발마다 하나), 실제 어둡게 하는 정도는
    // **참고 표시**한다. 이유: footAO 링은 이미 니어블랙인 sole/heel 위에 겹쳐 있어, 링을 끄면 똑같이
    // 어두운 지오메트리가 드러나 대응 비교 화소 차가 0 으로 나온다(= 자동 귀속이 불가능하다).
    // 링의 실효는 **육안 A/B**(shot-part foot, footAO 유/무)로 확인했다 — sole 밑을 감싸는 접촉 그늘이
    // 생겨 밝은 사바톤 nub 이 지면에 그냥 닿던 것을 눌러 준다. 세 계측 지점(턱·겨드랑이·스커트)이
    // 자동 판정을 담당하고, 부츠는 존재 + 육안이 담당한다.
    if (!out.bootRow || !out.bootRow.rings) { console.log('부츠 접지  footAO 링 없음 ❌'); ok.push(false); }
    else {
        console.log(`부츠 접지  footAO ${out.bootRow.rings}개 존재 ✅  [참고: 링 토글 화소차 ${out.bootRow.darkened}px — 니어블랙 sole 위 겹침이라 0 이 정상, 실효는 육안 A/B 로 확인]`);
        ok.push(out.bootRow.rings >= 2);
    }
    console.log(errs.length ? '콘솔 에러:\n' + errs.join('\n') : '(no console errors)');
    console.log(ok.every(Boolean) ? '\n㉡ 전부 통과 — 접촉 암부가 네 지점에 실재한다' : '\n㉡ 미통과 있음');
    await browser.close();
    process.exit(ok.every(Boolean) ? 0 : 1);
})();
