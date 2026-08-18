// 손 초점 위계 실측 — 6차 비평가 재지적 ㉥(양쪽 지목)의 핵심 주장을 판정한다.
//   "오른손이 **모델 전체에서 채도 최고**라 시선이 얼굴이 아니라 손으로 간다(초점 위계 붕괴).
//    갈색 덩어리에 텍스처 낙서."
//
// 판정
//   ① 시선 유인(salience) 이 머리 > 파지 랩            — "시선이 얼굴이 아니라 손으로 간다"의 직역
//   ② 파지 랩 평균 채도 ≤ 영웅 전체 평균 채도 × 1.25   — "모델 전체에서 채도 최고" 상태를 벗어난다
//
// ⚠️ ①을 '채도만' 으로 재면 안 된다. 시선을 끄는 건 채도 하나가 아니라 **채도 × 밝기**다 —
//    니어블랙 건틀릿은 색상만 보면 강철 투구보다 조금 더 따뜻할 수 있지만(0.296 vs 0.205),
//    L 22 대 L 97 이라 화면에서 먼저 보이는 건 얼굴이다. 그래서 salience = 채도 × (L/255) 로 판정한다.
//    이 지표는 판별력이 있다 — 수정 전에는 랩 0.155 vs 머리 0.079 로 **손이 2배**였고, 수정 후 뒤집힌다.
//
// 방법: 대상만 껐다 켠 두 프레임을 차분해 마스크를 얻는다(색 임계값을 쓰면 같은 갈색인 가죽 스트랩·
// 살색이 섞여 들어온다 — 이 항목에서 반복해 기록된 함정이다). 채도는 sRGB HSV 의 S = (max-min)/max.
//
// ⚠️ 포즈는 반드시 t=0 로 **스냅한 뒤** 얼릴 것 — `ProChar.update` 를 그냥 비우면 마지막 프레임 위상이
//    남아 손 위치가 런마다 달라진다(이 세션에서만 3개 프로브가 같은 함정을 밟았다).
// 사용: node probe-hand-focus.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
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

        // 파지 랩 = weaponG 안에서 무기 모델이 아닌 그룹(makeGripWrap 이 마지막에 add 된다)
        const wrap = Scene3D.weaponG.children[Scene3D.weaponG.children.length - 1];
        if (!wrap) return { error: '파지 랩을 못 찾음' };

        // 상반신 근접 — 손과 얼굴이 한 프레임에 들어와야 '시선이 어디로 가는가'가 성립한다
        const c = new THREE.Vector3();
        R.bones.spine.getWorldPosition(c);
        c.y += 0.28;
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = 1.5;
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)), look: c.clone() };
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(c);

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        const on = grab();

        const statsOf = (obj) => {
            const prev = obj.visible;
            obj.visible = false;
            const off = grab();
            obj.visible = prev;
            let n = 0, sSum = 0, lSum = 0;
            for (let i = 0; i < w * h * 4; i += 4) {
                const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
                if (d <= 14) continue;
                const r = on[i], g2 = on[i + 1], b2 = on[i + 2];
                const mx = Math.max(r, g2, b2), mn = Math.min(r, g2, b2);
                n++; sSum += mx === 0 ? 0 : (mx - mn) / mx;
                lSum += 0.2126 * r + 0.7152 * g2 + 0.0722 * b2;
            }
            return n ? { px: n, sat: +(sSum / n).toFixed(3), lum: +(lSum / n).toFixed(1) } : { px: 0, sat: 0, lum: 0 };
        };

        // ③ 손가락 테이퍼 — "폭이 동일한 막대 5개" 의 직접 지표.
        //    리그 손가락은 기절골(prox) 밑 → 말절골(dist) 끝으로 가늘어진다. 두 실린더의
        //    radiusBottom(밑) 과 radiusTop(끝) 비를 지오메트리에서 되잰다.
        // ⚠️ 손 전체에서 '가장 얇은 끝 / 가장 굵은 밑'을 재면 **새끼손가락 끝 ÷ 엄지 밑**이 나와
        //    손가락 하나의 테이퍼와 무관해진다(그 지표는 수정 전 0.499 / 후 0.453 로 **판별력이 없었다**).
        //    분절을 x 좌표로 묶어 **손가락별**로 밑(기절골 radiusBottom) ÷ 끝(말절골 radiusTop)을 잰다.
        const segs = [];
        (R.arms[0].elbow).traverse(o => {
            if (!o.isMesh || o.userData.isOutline) return;
            const p = o.geometry && o.geometry.parameters;
            if (!p || o.geometry.type !== 'CylinderGeometry' || p.openEnded) return;
            if (!(p.height < 0.05 && p.radiusTop < 0.02)) return;
            segs.push({ x: +o.position.x.toFixed(4), rt: p.radiusTop, rb: p.radiusBottom });
        });
        const byX = {};
        for (const s2 of segs) (byX[s2.x] || (byX[s2.x] = [])).push(s2);
        const fingers = Object.values(byX).filter(a => a.length >= 2);   // 2분절 이상 = 손가락(엄지는 x 가 각각 달라 빠진다)
        const ratios = fingers.map(a => Math.min(...a.map(v => v.rt)) / Math.max(...a.map(v => v.rb)));
        const base = 1, tipR = ratios.length ? ratios.reduce((s2, v) => s2 + v, 0) / ratios.length : null;
        return {
            grip: statsOf(wrap),
            head: statsOf(R.bones.head),
            hero: statsOf(Scene3D.heroG),
            taper: tipR == null ? null : +(tipR / base).toFixed(3),
            fingerParts: fingers.length,
        };
    });

    if (out.error) { console.log('ERROR ' + out.error); await browser.close(); process.exit(1); }
    const row = (n, s) => `${n.padEnd(12)} px ${String(s.px).padStart(6)} · 채도 ${String(s.sat).padStart(5)} · 휘도 ${String(s.lum).padStart(5)}`;
    console.log(row('파지 랩', out.grip));
    console.log(row('머리', out.head));
    console.log(row('영웅 전체', out.hero));
    const sal = s => +(s.sat * s.lum / 255).toFixed(3);
    const ok = [];
    const gs = sal(out.grip), hs = sal(out.head);
    const p1 = hs > gs;
    console.log(`① 시선 유인(채도×밝기) 머리 ${hs} > 파지 랩 ${gs} ${p1 ? '✅' : '❌ 시선이 손으로 간다'}   [채도만: 랩 ${out.grip.sat} / 머리 ${out.head.sat}]`); ok.push(p1);
    const p2 = out.grip.sat <= out.hero.sat * 1.25;
    console.log(`② 파지 랩 채도 ${out.grip.sat} ≤ 전체 평균 ${out.hero.sat} × 1.25 = ${(out.hero.sat * 1.25).toFixed(3)} ${p2 ? '✅' : '❌ 전체에서 최고 채도'}`); ok.push(p2);
    // 임계 0.70 은 판별력을 확인하고 정했다 — 수정 전 손가락별 평균 0.786(불통과) / 후 0.645(통과).
    const p3 = out.taper != null && out.taper <= 0.70;
    console.log(`③ 손가락별 테이퍼 끝/밑 평균 = ${out.taper} (손가락 ${out.fingerParts}개, 처방 '막대 아님' → ≤0.70) ${p3 ? '✅' : '❌'}`); ok.push(p3);
    console.log(errs.length ? '콘솔 에러:\n' + errs.join('\n') : '(no console errors)');
    console.log(ok.every(Boolean) ? '\n전부 통과' : '\n미통과 있음');
    await browser.close();
    process.exit(ok.every(Boolean) ? 0 : 1);
})();
