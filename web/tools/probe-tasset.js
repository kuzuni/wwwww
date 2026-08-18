// 스커트 태싯 절개 실측 — 6차 비평가 재지적 ㉤(A·B 양쪽 합의)의 두 조건을 수치로 판정한다.
//   "스커트가 완벽한 원형 헴을 가진 원뿔(= 갓등) + 헴이 어깨만큼 넓어 역삼각이 죽는다"
//   처방: 헴을 5~7장 개별 태싯으로 절개(간극 4~6°, 전면 중앙 V 노치), 헴 지름을 어깨의 0.62배 이하로.
//
// 판정
//   ① 헴 지름 / 어깨 지름 ≤ 0.62
//   ② 태싯 5~7장 · 간극 평균 4~6° · 아래 간극 > 위 간극(틈이 V 로 열린다)
//   ③ 전면 중앙(θ≈0) 간극이 나머지 간극보다 크다 (V 노치)
//
// ⚠️ 각도는 **구워진 정점에서 되재는다** — 설계 상수를 userData 에 넣어 두고 그걸 읽으면
//    "의도"를 확인할 뿐이고 지오메트리가 실제로 그렇게 만들어졌는지는 판정하지 못한다.
// 사용: node probe-tasset.js
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
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0);            // 포즈를 t=0 에 스냅한 뒤 얼린다
        ProChar.update = () => {};
        R.group.updateWorldMatrix(true, true);

        // ── 어깨 지름 ──────────────────────────────────────────────────
        // ⚠️ 어깨 **그룹 전체**를 재면 안 된다 — 하완·손·방패·검이 다 딸려 들어와 '팔 벌린 폭'이 잡힌다
        //    (첫 판이 그랬다: 0.909, 실제 어깨 반경의 2배 이상). 재야 하는 것은 **견갑까지의 어깨 덩어리**다.
        //    견갑 그룹은 캡(LatheGeometry)을 가진 유일한 서브트리이므로 그것으로 찾아 AABB 를 뜬다.
        const bodyX = new THREE.Vector3(); R.root.getWorldPosition(bodyX);
        let shX = 0;
        for (const arm of (R.arms || [])) {
            const sh = arm.shoulder; if (!sh) continue;
            let cap = null;
            sh.traverse(o => { if (!cap && o.isMesh && !o.userData.isOutline && o.geometry.type === 'LatheGeometry') cap = o; });
            const pg = cap ? cap.parent : null;
            if (!pg) continue;
            const b = new THREE.Box3().setFromObject(pg);
            shX = Math.max(shX, Math.abs(b.max.x - bodyX.x), Math.abs(b.min.x - bodyX.x));
        }

        // ── 태싯 판 찾기 ───────────────────────────────────────────────
        // 태싯은 인덱스 있는 커스텀 BufferGeometry(21정점 = 7×3 격자)로 만들어진다.
        const pelvis = R.bones.pelvis;
        const plates = [];
        for (const o of pelvis.children) {
            if (!o.isMesh || o.userData.isOutline) continue;
            const g = o.geometry;
            if (!g || g.type !== 'BufferGeometry' || !g.index) continue;
            const p = g.attributes.position;
            if (!p || p.count !== 21) continue;
            const ys = [];
            for (let i = 0; i < p.count; i++) ys.push(p.getY(i));
            const yMax = Math.max(...ys), yMin = Math.min(...ys);
            if (yMax - yMin < 0.05) continue;          // 헴 테(높이 0.018)는 제외 — 본체 판만
            const rowTh = (yTarget) => {
                const th = [];
                for (let i = 0; i < p.count; i++) {
                    if (Math.abs(p.getY(i) - yTarget) > 1e-4) continue;
                    th.push(Math.atan2(p.getX(i), p.getZ(i)));
                }
                return th;
            };
            const norm = a => a.map(t => (t < 0 ? t + Math.PI * 2 : t));
            const tTop = norm(rowTh(yMax)), tBot = norm(rowTh(yMin));
            let rBot = 0;
            for (let i = 0; i < p.count; i++) if (Math.abs(p.getY(i) - yMin) < 1e-4)
                rBot = Math.max(rBot, Math.hypot(p.getX(i), p.getZ(i)));
            plates.push({
                top: [Math.min(...tTop), Math.max(...tTop)],
                bot: [Math.min(...tBot), Math.max(...tBot)],
                rBot: +rBot.toFixed(4),
            });
        }
        plates.sort((a, b) => a.top[0] - b.top[0]);
        // 이웃 판 사이 간극(도) — 마지막→첫 판은 2π 를 넘어 돌아온다
        const gapsT = [], gapsB = [];
        for (let i = 0; i < plates.length; i++) {
            const cur = plates[i], nxt = plates[(i + 1) % plates.length];
            const wrap = i === plates.length - 1 ? Math.PI * 2 : 0;
            gapsT.push({ at: +(((cur.top[1] + nxt.top[0] + wrap) / 2) * 180 / Math.PI).toFixed(1), deg: +((nxt.top[0] + wrap - cur.top[1]) * 180 / Math.PI).toFixed(2) });
            gapsB.push({ at: +(((cur.bot[1] + nxt.bot[0] + wrap) / 2) * 180 / Math.PI).toFixed(1), deg: +((nxt.bot[0] + wrap - cur.bot[1]) * 180 / Math.PI).toFixed(2) });
        }
        const hemR = Math.max(...plates.map(p => p.rBot));
        return { shoulderR: +shX.toFixed(4), hemR: +hemR.toFixed(4), n: plates.length, gapsT, gapsB };
    });

    const ratio = +(out.hemR / out.shoulderR).toFixed(3);
    console.log(`어깨 반경 ${out.shoulderR} · 헴 반경 ${out.hemR} · 태싯 ${out.n}장`);
    console.log(`상단 간극(°): ${out.gapsT.map(g => `${g.deg}@${g.at}`).join(' · ')}`);
    console.log(`하단 간극(°): ${out.gapsB.map(g => `${g.deg}@${g.at}`).join(' · ')}`);
    const ok = [];
    const p1 = ratio <= 0.62;
    console.log(`① 헴/어깨 지름비 ${ratio} (처방 ≤0.62) ${p1 ? '✅' : '❌'}`); ok.push(p1);
    // ⚠️ 평균에서 **전면 중앙 노치는 뺀다** — 처방의 '간극 4~6°'는 일반 간극에 대한 것이고,
    //    노치는 일부러 그보다 크게 벌린 것이다. 노치를 섞으면 처방대로 만들어도 평균이 6°를 넘는다.
    const near0 = g => Math.min(Math.abs(g.at), Math.abs(g.at - 360));
    const notchB = out.gapsB.reduce((a, b) => (near0(b) < near0(a) ? b : a));
    const notchIdx = out.gapsB.indexOf(notchB);
    const plainT = out.gapsT.filter((_, i) => i !== notchIdx), plainB = out.gapsB.filter((_, i) => i !== notchIdx);
    const mean = a => a.reduce((s, g) => s + g.deg, 0) / a.length;
    const mT = +mean(plainT).toFixed(2), mB = +mean(plainB).toFixed(2), mAll = (mT + mB) / 2;
    const p2 = out.n >= 5 && out.n <= 7 && mAll >= 4 && mAll <= 6 && mB > mT;
    console.log(`② 태싯 ${out.n}장(처방 5~7) · 일반 간극 평균 위 ${mT}° 아래 ${mB}° → 전체 ${mAll.toFixed(2)}° (처방 4~6°, 노치 제외) · V 열림(아래>위)=${mB > mT} ${p2 ? '✅' : '❌'}`); ok.push(p2);
    // ③ 전면 중앙(θ≈0 또는 360) 간극이 최대
    const front = notchB;
    const others = plainB;
    const p3 = near0(front) < 8 && front.deg > Math.max(...others.map(g => g.deg)) * 1.3;
    console.log(`③ 전면 중앙 간극 ${front.deg}°@${front.at} vs 나머지 최대 ${Math.max(...others.map(g => g.deg))}° (노치는 1.3배 초과) ${p3 ? '✅' : '❌'}`); ok.push(p3);
    console.log(errs.length ? '콘솔 에러:\n' + errs.join('\n') : '(no console errors)');
    console.log(ok.every(Boolean) ? '\n전부 통과' : '\n미통과 있음');
    await browser.close();
    process.exit(ok.every(Boolean) ? 0 : 1);
})();
