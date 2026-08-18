// 견갑(스폴더) 마감 실측 — 6차 비평가 재지적 ㉣(A·B 양쪽 합의)의 세 조건을 수치로 판정한다.
//   A: "속이 비어 있는 원뿔 = 갓등, 오버행 21px > 상완 두께 18px, 밑면 캡이 없어 내부 면이 보인다"
//   B: "동일 반경 링 균등 적층 = 아코디언 호스"
// 처방 교집합 → 이 프로브의 3판정
//   ① 상완 지름 ≥ 견갑 지름 × 0.6            (오버행을 줄이는 대신 팔을 굵히는 쪽을 택했다)
//   ② 라메 반경비가 1.0 / 0.85 / 0.72 근처    (아래로 갈수록 **좁아져야** 한다 — 넓어지면 그게 갓등이다)
//   ③ 밑면이 막혀 있다                        (밑에서 위로 쏜 레이가 견갑 안으로 들어가기 전에 막힌다)
//
// ③을 실루엣 캡처가 아니라 **레이캐스트**로 재는 이유: 밑면 구멍은 카메라를 아래에 두고 올려다봐야
// 보이는데, 그 각도에서는 스커트·상완·망토가 앞을 가려 화소로는 '안 보이니 막힌 것'과 구별이 안 된다.
// 사용: node probe-pauldron.js
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
        const R = Scene3D.heroRig;
        // ⚠️ 포즈를 **먼저 t=0 로 스냅한 뒤** 얼리는다. update 를 그냥 비우면 마지막 프레임의 Idle 위상이
        //    그대로 남아 어깨 회전이 런마다 달라지고, 밑면 레이 판정이 0발/2발로 오간다(실제로 겪었다).
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0);
        ProChar.update = () => {};
        R.group.updateWorldMatrix(true, true);

        // 왼팔(방패쪽) 어깨 — 검이 안 가리는 쪽
        const shoulder = R.arms && R.arms[0] ? R.arms[0].shoulder : null;
        if (!shoulder) return { error: 'R.arms[0].shoulder 없음' };

        // ── 라메 반경 수집 ──────────────────────────────────────────────
        // 밴드는 CylinderGeometry(rt, rb, ...) 로 만들어지므로 parameters 에서 바로 읽는다.
        // 안감(bandIn)·림(Torus)·아웃라인 셸은 제외 — 본체 밴드만 센다.
        const lames = [];
        let capR = 0, armR = 0;
        shoulder.traverse(o => {
            if (!o.isMesh || o.userData.isOutline) return;
            const p = o.geometry && o.geometry.parameters;
            if (!p) return;
            if (o.geometry.type === 'CylinderGeometry' && p.openEnded && p.radiusTop > 0.05) {
                // 안감은 본체보다 정확히 5% 작게 만든다 — 같은 값이 두 번 잡히지 않게 걸러낸다
                lames.push({ rt: +p.radiusTop.toFixed(4), rb: +p.radiusBottom.toFixed(4), h: +p.height.toFixed(4), y: +o.position.y.toFixed(4) });
            }
            if (o.geometry.type === 'LatheGeometry') {
                for (const v of (p.points || [])) capR = Math.max(capR, v.x);
            }
        });
        // 안감 걸러내기 — 본체와 반경비 0.95 로 짝지어지는 것을 뺀다
        const body = lames.filter(a => !lames.some(b => b !== a && Math.abs(b.rt * 0.95 - a.rt) < 1e-3));
        body.sort((a, b) => b.rt - a.rt);

        // 상완 — 캡슐(this.capsule)이 만든 CylinderGeometry(openEnded 아님) 중 가장 굵은 것
        shoulder.traverse(o => {
            if (!o.isMesh || o.userData.isOutline) return;
            const p = o.geometry && o.geometry.parameters;
            if (!p || o.geometry.type !== 'CylinderGeometry' || p.openEnded) return;
            if (p.height > 0.15 && p.radiusTop > armR) armR = p.radiusTop; // 길이 0.15+ = 상완 몸통
        });

        // ── ③ 밑면 막힘 레이캐스트 ─────────────────────────────────────
        // ⚠️ **월드 수직으로 쏘면 안 된다.** 라메는 바깥-아래로 14°씩 누적 회전해 있어, 수직 레이는
        //    기울어진 밑단 옆으로 그냥 빠져나간다(막혀 있어도 '뚫림'으로 읽힌다). 판정해야 하는 것은
        //    "견갑 자기 축 방향에서 올려다볼 때 속이 보이는가" 이므로 **마지막 라메의 로컬 +Y**로 쏜다.
        const floorMesh = (() => { let f = null; shoulder.traverse(o => { if (!f && o.isMesh && !o.userData.isOutline && o.geometry.type === 'RingGeometry') f = o; }); return f; })();
        if (!floorMesh) return { error: '밑면 캡(RingGeometry) 이 없다 — ③ 미구현' };
        const segM = floorMesh.parent.matrixWorld;
        const up = new THREE.Vector3(0, 1, 0).transformDirection(segM).normalize();
        const ax = new THREE.Vector3(1, 0, 0).transformDirection(segM).normalize();
        const az = new THREE.Vector3(0, 0, 1).transformDirection(segM).normalize();
        const hemC = new THREE.Vector3(0, floorMesh.position.y, 0).applyMatrix4(segM);
        // 상완과 견갑 밑단 **사이**를 노린다 — 거기가 뚫려 있으면 안감 내부 면이 그대로 보인다.
        const rp = floorMesh.geometry.parameters;
        const off = (rp.innerRadius + rp.outerRadius) / 2;
        const rc = new THREE.Raycaster();
        const hits = [];
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const origin = hemC.clone()
                .addScaledVector(ax, Math.cos(a) * off)
                .addScaledVector(az, Math.sin(a) * off)
                .addScaledVector(up, -0.05);
            rc.set(origin, up);
            const hs = rc.intersectObject(shoulder, true).filter(h => !h.object.userData.isOutline);
            hits.push(hs.length ? +(hs[0].distance).toFixed(4) : null);
        }
        const open = hits.filter(h => h === null).length;

        // ⚠️ '견갑 지름'은 캡 반경이 아니라 **가장 넓은 지점**이다. 직전 판은 캡(0.099)보다 밑단 밴드
        //    (0.119)가 더 넓었으므로, 캡만 보면 판정 ①이 낡은 갓등 형상에서도 통과해 버린다(실제로 0.626).
        const maxR = Math.max(capR, ...body.map(b => Math.max(b.rt, b.rb)));
        return {
            capR: +capR.toFixed(4),
            maxR: +maxR.toFixed(4),
            lames: body,
            ratios: body.map(b => +(b.rb / maxR).toFixed(3)),
            armR: +armR.toFixed(4),
            armOverPauldron: +((armR * 2) / (maxR * 2)).toFixed(3),
            overhang: +(maxR - armR).toFixed(4),
            rayHits: hits, openRays: open,
        };
    });

    if (out.error) { console.log('ERROR ' + out.error); await browser.close(); process.exit(1); }
    console.log(`캡 반경 ${out.capR} · 견갑 최대반경 ${out.maxR} · 상완 반경 ${out.armR} · 오버행 ${out.overhang}`);
    console.log('라메(본체) 밴드:');
    for (const l of out.lames) console.log(`   rt=${l.rt} rb=${l.rb} h=${l.h} y=${l.y}`);
    const ok = [];
    // ① 상완 지름 ≥ 견갑 지름 × 0.6
    const p1 = out.armOverPauldron >= 0.6;
    console.log(`① 상완/견갑 지름비 ${out.armOverPauldron} (처방 ≥0.60) ${p1 ? '✅' : '❌'}`); ok.push(p1);
    // ② 아래로 갈수록 좁아지고, 최하단 비율이 0.72 근처
    const desc = out.ratios.every((r, i, a) => i === 0 || r < a[i - 1]);
    const last = out.ratios[out.ratios.length - 1];
    const p2 = desc && last >= 0.62 && last <= 0.82;
    console.log(`② 라메 반경비 [1.0, ${out.ratios.join(', ')}] — 단조 감소=${desc} · 최하단 ${last} (처방 0.72 대역 0.62~0.82) ${p2 ? '✅' : '❌'}`); ok.push(p2);
    // ③ 밑면 막힘
    const p3 = out.openRays === 0;
    console.log(`③ 밑면 레이 8발 중 뚫린 것 ${out.openRays}발 ${p3 ? '✅ 막힘' : '❌ 열려 있다'}`); ok.push(p3);
    console.log(errs.length ? '콘솔 에러:\n' + errs.join('\n') : '(no console errors)');
    console.log(ok.every(Boolean) ? '\n전부 통과' : '\n미통과 있음');
    await browser.close();
    process.exit(ok.every(Boolean) ? 0 : 1);
})();
