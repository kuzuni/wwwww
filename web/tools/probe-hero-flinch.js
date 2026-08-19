// 영웅이 맞았을 때 **포즈로 반동하는가** (hp-juicy 7차 잔여 ㉳ '영웅 피격 포즈 반동 부재')
// 사용: node tools/probe-hero-flinch.js   (종료코드 0 = 통과)
//
// 배경: 비평가 A #7 · B #5 가 나란히 "영웅이 맞아도 자세가 그대로"라고 했다. 실제로 `heroHit` 은
// 넉백(x)·롤(rz)·플래시·셰이크·비네트를 걸지만 **관절은 한 개도 안 움직였다** — 적 쪽에서 먼저
// 확인된 것과 같은 결함이다(`probe-flinch-visibility.js` 참조: 몸통을 통째로 움직이는 것은 '포즈'가
// 아니다). 이 도구는 그 반동이 관절에 실제로 실리는지, 그리고 화면 실루엣이 갈리는지 잰다.
//
// 🚨 측정 요령 — 영웅 리그는 **매 프레임 `R.base` 에서 포즈를 새로 쌓는다.** 그래서 적 쪽처럼
//    가산분을 기록해 둘 필요 없이, **같은 클립 시각에서 `hitT` 만 0 으로 두고 다시 쌓으면**
//    플린치가 빠진 포즈가 그대로 나온다. 그 차이가 곧 플린치의 순수 기여분이다.
//    (대기 애니메이션·클립 진행이 섞이지 않는다 — 클립 시각 `_t` 를 되돌려 놓고 재기 때문이다.)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const POSE_MIN = 0.10;      // 최대 관절 변화 하한(rad, ≈5.7°)
const JOINTS_MIN = 6;       // 함께 반응해야 하는 관절 수 — 한둘만 움직이면 '기울었다'로만 읽힌다
const XOR_MIN = 0.06;       // 실루엣 XOR 하한 — 플린치를 껐다 켰을 때 실루엣의 6% 이상이 갈릴 것

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.addInitScript(() => {
        let s = 0x2f6e2b1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && Scene3D.heroRig, null, { timeout: 45000 });
    await page.waitForTimeout(1500);

    const r = await page.evaluate(({ POSE_MIN, JOINTS_MIN, XOR_MIN }) => {
        const out = { lines: [], ok: true, nums: {} };
        const say = (c, m) => { out.lines.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) out.ok = false; };
        const note = m => out.lines.push('  · ' + m);

        Combat.tick = () => {};
        const realUpdate = Scene3D.update.bind(Scene3D);
        Scene3D.update = () => {};
        Scene3D.heroAttack = () => {};
        Scene3D.clearEnemies();
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.particles.slice().forEach(p => { if (p.parent) p.parent.remove(p); });
        Scene3D.particles.length = 0;
        realUpdate(1 / 60);

        const R = Scene3D.heroRig;
        const NAMES = ['spine', 'neck', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'cape'];
        const bones = NAMES.filter(n => R.bones[n]);
        const poseOf = () => bones.map(n => {
            const b = R.bones[n];
            return [b.rotation.x, b.rotation.y, b.rotation.z];
        });

        // ── 화면 실루엣 도구 (적 쪽 probe 와 같은 규약: 자 점검 먼저, gl.readPixels 직독) ──
        const cw = Scene3D.renderer.domElement.width, ch = Scene3D.renderer.domElement.height;
        const dpr = cw / Scene3D.container.clientWidth;
        const gl = Scene3D.renderer.getContext();
        const box = new THREE.Box3().setFromObject(Scene3D.heroG);
        const pts = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z])
            pts.push(Scene3D.project(new THREE.Vector3(x, y, z)));
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
        const pad = 26;
        const rx = Math.max(0, Math.round((x0 - pad) * dpr)), rw = Math.min(cw - rx, Math.round((x1 - x0 + pad * 2) * dpr));
        const ryTop = Math.max(0, Math.round((y0 - pad) * dpr)), rh = Math.min(ch - ryTop, Math.round((y1 - y0 + pad * 2) * dpr));
        const rect = { x: rx, y: Math.max(0, ch - (ryTop + rh)), w: Math.max(1, rw), h: Math.max(1, rh) };
        const read = () => { Scene3D.renderFrame(); const b = new Uint8Array(rect.w * rect.h * 4); gl.readPixels(rect.x, rect.y, rect.w, rect.h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        const maskNow = () => {
            const on = read();
            const vis = Scene3D.heroG.visible; Scene3D.heroG.visible = false;
            const off = read();
            Scene3D.heroG.visible = vis;
            const mask = new Uint8Array(rect.w * rect.h);
            let n = 0;
            for (let i = 0; i < rect.w * rect.h; i++) {
                const dr = on[i * 4] - off[i * 4], dg = on[i * 4 + 1] - off[i * 4 + 1], db = on[i * 4 + 2] - off[i * 4 + 2];
                if (Math.sqrt(dr * dr + dg * dg + db * db) > 24) { mask[i] = 1; n++; }
            }
            return { mask, n };
        };

        // 자 점검 — 영웅을 숨기면 이 영역이 실제로 변하는가
        const base = maskNow();
        out.nums.cover = +(base.n / (rect.w * rect.h)).toFixed(4);
        say(base.n / (rect.w * rect.h) >= 0.08, `자 점검: 영웅을 숨기면 영역이 변한다 (커버리지 ${(base.n / (rect.w * rect.h) * 100).toFixed(1)}% >= 8%)`);
        if (!out.ok) { Scene3D.update = realUpdate; return out; }

        // ── 접촉 프레임(+16ms) ──
        Scene3D.heroHit(0.3, 300);
        out.nums.hitAmp = +(R.hitAmp || 0).toFixed(4);
        realUpdate(1 / 60);
        const poseHit = poseOf();
        const hitMask = maskNow();
        // 같은 클립 시각에서 플린치만 빼고 다시 쌓는다(리그가 매 프레임 base 에서 새로 쌓으므로 가능)
        const tKeep = R._t, hitKeep = R.hitT;
        R.hitT = 0; R.update(0);
        const poseNo = poseOf();
        const noMask = maskNow();
        R.hitT = hitKeep; R._t = tKeep; R.update(0);

        let maxD = 0, maxName = '-', moved = 0;
        for (let i = 0; i < bones.length; i++) {
            let d = 0;
            for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(poseHit[i][k] - poseNo[i][k]));
            if (d > 0.02) moved++;
            if (d > maxD) { maxD = d; maxName = bones[i]; }
        }
        out.nums.poseMaxRad = +maxD.toFixed(4);
        out.nums.movedJoints = moved;
        note(`플린치 기여분: 최대 ${maxD.toFixed(3)}rad(${(maxD * 180 / Math.PI).toFixed(1)}도) @${maxName} · 움직인 관절 ${moved}/${bones.length} (${bones.join(', ')})`);
        say(maxD >= POSE_MIN, `ⓐ 관절 포즈 반동: 최대 ${(maxD * 180 / Math.PI).toFixed(1)}도 (>= ${(POSE_MIN * 180 / Math.PI).toFixed(1)}도)`);
        say(moved >= JOINTS_MIN, `ⓑ 여러 관절이 함께 반응: ${moved}개 (>= ${JOINTS_MIN}개)`);

        let xor = 0;
        for (let i = 0; i < rect.w * rect.h; i++) if (hitMask.mask[i] !== noMask.mask[i]) xor++;
        const dXor = xor / Math.max(1, noMask.n);
        out.nums.silXor = +dXor.toFixed(4);
        note(`실루엣: 플린치 끔 ${noMask.n}px vs 켬 ${hitMask.n}px · XOR ${xor}px`);
        say(dXor >= XOR_MIN, `ⓒ 화면 실루엣이 갈린다: XOR ${(dXor * 100).toFixed(2)}% (>= ${(XOR_MIN * 100).toFixed(0)}%)`);

        // ── 방향: 넉백·롤과 같은 쪽으로 접혀야 한다(반대면 서로 상쇄돼 제자리걸음이 된다) ──
        const si = bones.indexOf('spine');
        const spineRz = si >= 0 ? poseHit[si][2] - poseNo[si][2] : 0;
        out.nums.spineRz = +spineRz.toFixed(4);
        out.nums.heroRollZ = +Scene3D.heroG.rotation.z.toFixed(4);
        say(spineRz * Scene3D.heroG.rotation.z > 0, `ⓓ 반동 방향이 넉백 롤과 같다 (spine.rz ${spineRz.toFixed(3)} · heroG.rotation.z ${Scene3D.heroG.rotation.z.toFixed(3)})`);

        // ── 여운과 원상복구 ──
        for (let i = 0; i < 12; i++) realUpdate(1 / 60); // +216ms
        const t2 = R._t, k2 = R.hitT;
        const p2 = poseOf();
        R.hitT = 0; R.update(0);
        const p2no = poseOf();
        R.hitT = k2; R._t = t2; R.update(0);
        let maxD2 = 0;
        for (let i = 0; i < bones.length; i++) for (let k = 0; k < 3; k++) maxD2 = Math.max(maxD2, Math.abs(p2[i][k] - p2no[i][k]));
        out.nums.poseAt216ms = +maxD2.toFixed(4);
        say(maxD2 > 0.004 && maxD2 < maxD, `ⓔ 여운이 남고 되돌아온다 (${maxD.toFixed(3)} -> ${maxD2.toFixed(3)}rad)`);

        for (let i = 0; i < 40; i++) realUpdate(1 / 60); // +880ms, 수명(0.30s) 한참 뒤
        out.nums.hitTEnd = +(R.hitT || 0).toFixed(4);
        const t3 = R._t;
        const p3 = poseOf();
        R.update(0); R._t = t3;
        let leak = 0;
        for (let i = 0; i < bones.length; i++) for (let k = 0; k < 3; k++) leak = Math.max(leak, Math.abs(p3[i][k] - poseOf()[i][k]));
        say((R.hitT || 0) === 0, `ⓕ 수명 뒤 반동 해제됨 (hitT=${out.nums.hitTEnd})`);

        Scene3D.update = realUpdate;
        return out;
    }, { POSE_MIN, JOINTS_MIN, XOR_MIN });

    for (const l of r.lines) console.log(l);
    if (r.nums) console.log('nums=' + JSON.stringify(r.nums));
    if (errors.length) { console.log('FAIL 콘솔 에러 ' + errors.length + '건'); errors.slice(0, 5).forEach(e => console.log('  ! ' + e)); }
    await browser.close();
    process.exit(r.ok && !errors.length ? 0 : 1);
})();
