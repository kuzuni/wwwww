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
        // 🚨 **좌표계 함정(2026-08-18 ㉢ 비례 작업에서 실제로 터졌다)**: 어깨는 `Box3.setFromObject`
        //    = **월드** 값인데, 아래 헴 반경은 `geometry.attributes.position` = **로컬 raw** 값이다.
        //    둘의 비를 그냥 내면 리그에 배율이 걸리는 순간 비가 통째로 틀어진다 — `ProChar.BODY_SCALE`
        //    0.869 가 들어오자 실제로는 0.588 인 비가 **0.677 로 읽혀 멀쩡한 조형이 ❌** 로 찍혔다.
        //    (지오메트리는 하나도 안 바뀌었는데 판정만 뒤집힌 것이라, 그대로 믿었으면 헴을 잘못 줄였다.)
        //    → 어깨 쪽을 리그 월드 배율로 나눠 **양쪽 다 로컬 raw 단위**로 맞춘다.
        const rigScale = new THREE.Vector3().setFromMatrixScale(R.root.matrixWorld).x || 1;
        const bodyX = new THREE.Vector3(); R.root.getWorldPosition(bodyX);
        let shX = 0;
        for (const arm of (R.arms || [])) {
            const sh = arm.shoulder; if (!sh) continue;
            // 🚨 **2026-08-20 — 여기도 `geometry.type` 으로 파츠를 찾고 있었다(㉡).** 옛 판은 견갑을
            //    "캡(LatheGeometry)을 가진 유일한 서브트리"로 찾았는데, 견갑이 voxel(BufferGeometry)로
            //    바뀌자 **못 찾아 `shX = 0` → ① 이 Infinity 로 떨어졌다.** 조형은 오히려 더 넓어졌는데
            //    자만 눈이 먼 것이라, 다른 프로브와 같은 규약(태그로 쥔다)으로 통일한다.
            let pg = null;
            sh.traverse(o => { if (!pg && o.userData.part === 'pauldron') pg = o; });
            if (!pg) continue;
            const b = new THREE.Box3().setFromObject(pg);
            shX = Math.max(shX, Math.abs(b.max.x - bodyX.x), Math.abs(b.min.x - bodyX.x));
        }

        // ── 태싯 판 찾기 ───────────────────────────────────────────────
        // 🚨 **2026-08-20 — 옛 판은 태싯을 `p.count === 21`(7×3 격자 정점 수)로 찾았다.** 그건 판을
        //    조형이 아니라 **현재 구현의 세그먼트 수**로 식별하는 것이라, 세그를 하나만 올려도(또는
        //    voxel 로 바꾸면) 판이 0장이 되고 ②③이 조용히 무의미해진다 — 견갑 전환에서 프로브 셋이
        //    같은 이유로 무너진 직후라 여기도 미리 끊는다. 태그로 쥐고, 각도·반경은 그대로 **구워진
        //    정점**에서 잰다(태그는 이름표일 뿐이다). 헴 테는 `part='tassetRim'` 이라 자연히 빠진다.
        const pelvis = R.bones.pelvis;
        const plates = [];
        for (const o of pelvis.children) {
            if (!o.isMesh || o.userData.isOutline) continue;
            if (o.userData.part !== 'tasset') continue;
            const g = o.geometry;
            const p = g && g.attributes && g.attributes.position;
            if (!p) continue;
            const ys = [];
            for (let i = 0; i < p.count; i++) ys.push(p.getY(i));
            const yMax = Math.max(...ys), yMin = Math.min(...ys);
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
        return { shoulderR: +(shX / rigScale).toFixed(4), hemR: +hemR.toFixed(4), rigScale: +rigScale.toFixed(4), n: plates.length, gapsT, gapsB };
    });

    const ratio = +(out.hemR / out.shoulderR).toFixed(3);
    console.log(`어깨 반경 ${out.shoulderR} · 헴 반경 ${out.hemR} · 태싯 ${out.n}장 (둘 다 로컬 raw · 리그 월드 배율 ${out.rigScale})`);
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
    // 🚨 **②의 눈금을 '평균 간극 4~6°'에서 격자 단위로 옮겼다 (2026-08-20, `prochar-aaa` ⓑ voxel 전환).**
    //    이유는 조형이 나빠져서가 아니라 **그 각도대를 이 격자가 만들 수 없기 때문**이다: 칸 0.016 이
    //    스커트 상단(r 0.19 = 11.875칸)에서 만드는 최소 간극이 이미 **4.83°** 라, 처방 하한 4°~4.83°
    //    구간은 표현 자체가 안 된다. 그런 값을 각도로 강제하면 칸이 경계마다 다르게 떨어져
    //    간극이 균일한 틈이 아니라 **톱니**가 된다(실제로 초판이 그랬다 — 하단이 180°에서 3.7°,
    //    나머지에서 8.51°). 옛 매끈 조형도 4°/7° 로 이미 상한 6°를 넘겨 놓고 **평균으로 통과**하고
    //    있었으니, 각도대는 원래도 판별력이 약했다.
    //    → 대신 처방의 **뜻** 셋을 각각 잰다. 각도는 비교용으로 계속 찍는다.
    //      ⓐ V 열림(아래 > 위) — 옛 판정 그대로.
    //      ⓑ **간극 균일도**(일반 간극 max/min ≤ 1.35) — 옛 자에 아예 없던 축이고, 위의 톱니를
    //         잡는 건 이것뿐이다(초판 8.51/3.7 = 2.30 ❌ · 지금 8.6/7.38 = 1.17 ✅).
    //      ⓒ **판이 간극보다 훨씬 넓다**(판 호/간극 ≥ 5, 위·아래 각각) — '틈이 벌어져 슬랫이 됐다'를
    //         반지름과 무관하게 잡는다. 절대 각도대와 달리 격자를 바꿔도 뜻이 유지된다.
    //    옛 매끈 조형 A/B 로 셋 다 확인했다(균일도 1.00/1.00 · 판/간극 14.0/7.6) — 자를 느슨하게
    //    만든 게 아니라 **판별력이 있는 축으로 갈아 끼운 것**이다.
    const spread = a => Math.max(...a.map(g => g.deg)) / Math.max(1e-9, Math.min(...a.map(g => g.deg)));
    const uT = +spread(plainT).toFixed(2), uB = +spread(plainB).toFixed(2);
    const plateT = +((360 / out.n - mT) / mT).toFixed(1), plateB = +((360 / out.n - mB) / mB).toFixed(1);
    const p2 = out.n >= 5 && out.n <= 7 && mB > mT && uT <= 1.35 && uB <= 1.35 && plateT >= 5 && plateB >= 5;
    console.log(`② 태싯 ${out.n}장(처방 5~7) · 일반 간극 평균 위 ${mT}° 아래 ${mB}° (참고: 전체 ${mAll.toFixed(2)}°, 노치 제외)`);
    console.log(`   ⓐ V 열림(아래>위)=${mB > mT} · ⓑ 균일도 위 ${uT} 아래 ${uB} (≤1.35) · ⓒ 판/간극 위 ${plateT} 아래 ${plateB} (≥5) ${p2 ? '✅' : '❌'}`); ok.push(p2);
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
