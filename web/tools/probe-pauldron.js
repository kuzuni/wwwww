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

        // ── 라메 실루엣 반폭 프로파일 수집 ─────────────────────────────
        // 🚨 **2026-08-20 자 교체 — 옛 판은 voxel 앞에서 통째로 눈이 멀었다.**
        //    옛 ②는 밴드를 `geometry.type === 'CylinderGeometry'` + `parameters.openEnded` 로 열거하고
        //    캡 반경을 `LatheGeometry.parameters.points` 에서 뽑았다. 둘 다 **설계 인자를 읽는 자**라,
        //    판을 큐브 적층(`BufferGeometry`, `parameters` 없음)으로 바꾸는 순간 `lames`·`capR` 이
        //    **조용히 빈 배열·0** 이 된다 — ①의 `armR` 이 상완 voxel 전환 때 정확히 그렇게 죽었다(㉡).
        //    → 판정을 조형 무관한 말로 바꾼다: **실루엣 반폭 프로파일이 최대점 아래로 단조 비증가**이고
        //      **밑단 ≤ 0.82 × 최대**(옛 '0.72 대역 0.62~0.82' 와 같은 뜻). 프리미티브를 뭘 쓰든 같은 값이 나온다.
        //
        //    ⚠️ **프로파일은 판마다 그 판의 로컬 프레임에서 잰다.** 라메는 장마다 14°씩 누적으로
        //       기울어 있어서, 견갑 전체를 한 y 축으로 훑으면 기울기가 반폭에 섞여 들어간다(판은 안 넓어졌는데
        //       넓어진 것으로 읽힌다). 각 판은 자기 축에 대한 회전체이므로 자기 프레임에서 재는 게 곧 실루엣이다.
        //    ⚠️ 반폭은 `max(|x|,|z|)` — `hypot` 은 각진 단면에서 모서리 대각선(정사각이면 ×√2)을 잡아
        //       조형을 안 건드렸는데 "굵어졌다"고 보고한다(㉠, 팔 프로브 3종이 실제로 뒤집혔다).
        //    ⚠️ 판 순서는 **중첩 깊이** — 라메는 앞 장의 자식으로 매달리므로 깊이가 곧 적층 순서다.
        //       월드 y 중심으로 정렬하면 안 된다(장이 서로 겹치게 설계돼 있어 중심이 뒤집힌다).
        const BIN = 0.006;                            // 프로파일 y 구간(칸 0.016 보다 잘게)
        const plates = [];
        let armR = 0;
        shoulder.traverse(o => {
            if (!o.isMesh || o.userData.isOutline || o.userData.part !== 'pauldronPlate') return;
            let depth = 0;
            for (let p = o.parent; p; p = p.parent) { depth++; if (p.userData.part === 'pauldron') break; }
            o.updateWorldMatrix(true, false);
            const pos = o.geometry.attributes.position;
            const bins = new Map();
            const v = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) {
                v.fromBufferAttribute(pos, i);
                const b = Math.round(v.y / BIN);
                const r = Math.max(Math.abs(v.x), Math.abs(v.z));
                if (!(bins.get(b) >= r)) bins.set(b, r);
            }
            const prof = [...bins.entries()].sort((a, b) => b[0] - a[0])   // 위 → 아래
                .map(([b, r]) => ({ y: +(b * BIN).toFixed(4), r: +r.toFixed(4) }));
            plates.push({ depth, prof });
        });
        plates.sort((a, b) => a.depth - b.depth);
        const profile = plates.flatMap(p => p.prof.map(s => s.r));

        // 상완 — 🚨 **`userData.part` 태그로 찾고 구워진 정점에서 잰다 (2026-08-20 수정).**
        //    옛 판은 `geometry.parameters.radiusTop`(= CylinderGeometry 설계 인자)을 읽었다.
        //    상완이 voxel 기둥(BufferGeometry, parameters 없음)으로 바뀌자 조용히 **armR = 0**
        //    이 돼 ① 이 '지름비 0' 으로 떨어졌다 — 조형은 오히려 그대로인데 자가 눈이 먼 것이다.
        //    이 저장소가 반복해 밟은 '설계 상수를 읽는 자 / 타입으로 찾는 자' 함정(㉡·④⑵)이라,
        //    다른 두 팔 프로브(`probe-arm-taper`·`probe-upperarm`)와 같은 규약으로 통일한다:
        //    **태그로 파츠를 쥐고, 자기 로컬 프레임에서 축별 최댓값(= 실루엣 반폭)으로 잰다.**
        const ua = (() => { let g = null; shoulder.traverse(o => { if (!g && o.userData.part === 'upperArm') g = o; }); return g; })();
        if (ua) {
            ua.updateWorldMatrix(true, true);
            const toSelf = new THREE.Matrix4().copy(ua.matrixWorld).invert();
            const v = new THREE.Vector3();
            ua.traverse(o => {
                if (!o.isMesh || o.userData.isOutline || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
                const m = new THREE.Matrix4().multiplyMatrices(toSelf, o.matrixWorld);
                const pos = o.geometry.attributes.position;
                for (let i = 0; i < pos.count; i++) {
                    v.fromBufferAttribute(pos, i).applyMatrix4(m);
                    if (v.y < -0.15) continue;                    // 끝 캡(팔꿈치 쪽)은 몸통 굵기가 아니다
                    const r = Math.max(Math.abs(v.x), Math.abs(v.z));
                    if (r > armR) armR = r;
                }
            });
        }

        // ── ③ 밑면 막힘 레이캐스트 ─────────────────────────────────────
        // ⚠️ **월드 수직으로 쏘면 안 된다.** 라메는 바깥-아래로 14°씩 누적 회전해 있어, 수직 레이는
        //    기울어진 밑단 옆으로 그냥 빠져나간다(막혀 있어도 '뚫림'으로 읽힌다). 판정해야 하는 것은
        //    "견갑 자기 축 방향에서 올려다볼 때 속이 보이는가" 이므로 **마지막 라메의 로컬 +Y**로 쏜다.
        // 🚨 **2026-08-20 — ③ 도 같은 함정이었다.** 옛 판은 밑면 캡을 `geometry.type === 'RingGeometry'`
        //    로 찾고 구멍 반경을 `parameters.innerRadius/outerRadius` 에서 읽었다. 캡을 큐브 링으로
        //    바꾸면 **찾지도 못하고**(에러 종료) 반경도 못 읽는다. → 태그로 찾고, 반경은 정점에서 잰다.
        const floorMesh = (() => { let f = null; shoulder.traverse(o => { if (!f && o.isMesh && !o.userData.isOutline && o.userData.part === 'pauldronFloor') f = o; }); return f; })();
        if (!floorMesh) return { error: '밑면 캡(part=pauldronFloor) 이 없다 — ③ 미구현' };
        const segM = floorMesh.parent.matrixWorld;
        const up = new THREE.Vector3(0, 1, 0).transformDirection(segM).normalize();
        const ax = new THREE.Vector3(1, 0, 0).transformDirection(segM).normalize();
        const az = new THREE.Vector3(0, 0, 1).transformDirection(segM).normalize();
        const hemC = new THREE.Vector3(0, floorMesh.position.y, 0).applyMatrix4(segM);
        // 상완과 견갑 밑단 **사이**를 노린다 — 거기가 뚫려 있으면 안감 내부 면이 그대로 보인다.
        // 링의 안·바깥 반경은 **부모(라메) 프레임으로 옮긴 정점**에서 잰다 — 옛 RingGeometry 는 XY 평면에
        // 누워 있어 자기 프레임에서 재면 z 가 0 이고, voxel 링은 이미 XZ 평면이라 프레임이 서로 다르다.
        // 부모 프레임에서 재면 둘 다 같은 뜻이 된다(옛 값 재현 확인함).
        const fp = floorMesh.geometry.attributes.position;
        let rIn = Infinity, rOut = 0;
        {
            const v = new THREE.Vector3();
            for (let i = 0; i < fp.count; i++) {
                v.fromBufferAttribute(fp, i).applyMatrix4(floorMesh.matrix);
                const r = Math.hypot(v.x - floorMesh.position.x, v.z - floorMesh.position.z);
                if (r < rIn) rIn = r;
                if (r > rOut) rOut = r;
            }
        }
        const off = (rIn + rOut) / 2;
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
        const maxR = Math.max(...profile);
        const iMax = profile.indexOf(maxR);
        const below = profile.slice(iMax);            // 최대점 **아래**만 본다(캡 꼭대기 → 최대는 원래 넓어진다)
        // 단조 비증가 — 넓어지는 구간이 하나라도 있으면 그게 '갓등'이다. 어디서 뒤집혔는지 같이 남긴다.
        let rise = null;
        for (let i = 1; i < below.length; i++)
            if (below[i] > below[i - 1] + 1e-6) { rise = { i: iMax + i, from: below[i - 1], to: below[i] }; break; }
        // 🚨 **단조 판정만으로는 갓등이 안 잡힌다 — 실측으로 확인하고 조건을 하나 더 걸었다.**
        //    아래로 갈수록 **계속** 넓어지는 형태는 최대점이 맨 밑이라 `below` 가 한 칸뿐이고
        //    "단조 비증가 = true" 로 통과해 버린다(A/B: 반경비를 1.10·1.20 으로 뒤집어 재현했다).
        //    처방 원문이 "어깨 캡이 가장 넓고 팔을 따라 좁아지며 내려간다" 이므로, **최대점이 캡(맨 위 판)
        //    안에 있어야 한다**를 같이 건다. 밑단비만 걸면 밑단만 좁힌 항아리형도 통과한다.
        const capLen = plates.length ? plates[0].prof.length : 0;
        return {
            maxR: +maxR.toFixed(4),
            capOwnsMax: iMax < capLen, capLen,
            profile: profile.map(r => +r.toFixed(4)),
            plateProfiles: plates.map(p => ({ depth: p.depth, prof: p.prof })),
            iMax, rise,
            hemRatio: +(profile[profile.length - 1] / maxR).toFixed(3),
            armR: +armR.toFixed(4),
            armOverPauldron: +((armR * 2) / (maxR * 2)).toFixed(3),
            overhang: +(maxR - armR).toFixed(4),
            floorR: [+rIn.toFixed(4), +rOut.toFixed(4)],
            rayHits: hits, openRays: open,
        };
    });

    if (out.error) { console.log('ERROR ' + out.error); await browser.close(); process.exit(1); }
    console.log(`견갑 최대반경 ${out.maxR} · 상완 반경 ${out.armR} · 오버행 ${out.overhang} · 밑면 링 ${out.floorR.join('~')}`);
    console.log('판별 실루엣 반폭 프로파일(위→아래, 판마다 자기 프레임):');
    for (const p of out.plateProfiles)
        console.log(`   깊이${p.depth}: ` + p.prof.map(s => `${s.y}:${s.r}`).join(' '));
    const ok = [];
    // ① 상완 지름 ≥ 견갑 지름 × 0.6
    const p1 = out.armOverPauldron >= 0.6;
    console.log(`① 상완/견갑 지름비 ${out.armOverPauldron} (처방 ≥0.60) ${p1 ? '✅' : '❌'}`); ok.push(p1);
    // ② 최대점 아래로 단조 비증가 + 밑단 ≤ 0.82×최대 (옛 '반경비 1.0/0.85/0.72' 와 같은 뜻, 조형 무관)
    const p2 = !out.rise && out.capOwnsMax && out.hemRatio >= 0.62 && out.hemRatio <= 0.82;
    console.log(`② 최대 ${out.maxR}(프로파일 ${out.iMax}번째 / 캡 ${out.capLen}칸) 아래 단조 비증가=${!out.rise}`
        + (out.rise ? ` — ${out.rise.i}번째에서 ${out.rise.from}→${out.rise.to} 로 넓어진다(갓등)` : '')
        + ` · 최대점이 캡 안=${out.capOwnsMax}`
        + ` · 밑단비 ${out.hemRatio} (처방 0.62~0.82) ${p2 ? '✅' : '❌'}`); ok.push(p2);
    // ③ 밑면 막힘
    const p3 = out.openRays === 0;
    console.log(`③ 밑면 레이 8발 중 뚫린 것 ${out.openRays}발 ${p3 ? '✅ 막힘' : '❌ 열려 있다'}`); ok.push(p3);
    console.log(errs.length ? '콘솔 에러:\n' + errs.join('\n') : '(no console errors)');
    console.log(ok.every(Boolean) ? '\n전부 통과' : '\n미통과 있음');
    await browser.close();
    process.exit(ok.every(Boolean) ? 0 : 1);
})();
