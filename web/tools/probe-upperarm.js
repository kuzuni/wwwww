// 상완 노출 구간 실측 — "견갑이 팔꿈치 건틀릿에 거의 닿는다"(비평가 A P3 계열, 2026-08-19 인계) 판정기.
//
// 🚨 **이 프로브가 재는 것은 팔 '길이'가 아니라 팔이 '보이느냐'다. 둘을 헷갈리지 말 것.**
//   앞 세션이 남긴 처방은 "팔이 키의 20.4% 밖에 안 된다(사람 ≈ 44%) → 팔을 1.45~2배로"였는데,
//   그 근거는 **성인 비례 시절(6.93두신)** 이다. 그 뒤 사용자 지시로 `hero-chibi` 가 들어와
//   비례가 반전됐다(현재 2.48두신 · 다리 24.8%). **치비는 정의상 팔다리가 짧다** —
//   지금 팔 21.1% : 다리 24.8% 는 팔/다리 = 0.85 로 사람(0.94)과 거의 같은 비다.
//   즉 **'팔이 짧다'는 지적은 치비 전환으로 무효**가 됐고, `probe-hero-proportion` 의 치비
//   게이트(두신비 2.15~2.70 · 다리비 ≤36%)를 지키는 한 팔을 사람 비례로 늘리면 안 된다.
//   ⚠️ 다음 세션은 팔 길이를 늘리는 쪽으로 이 항목을 다시 열지 말 것 — 그건 사용자 지시 위반이다.
//
//   **그런데 관측 자체는 살아 있다.** 정면 캡처에서 견갑 밑단과 팔꿈치 쿠터 사이에 상완이
//   거의 안 보인다. 원인은 길이가 아니라 **덮임**이다: 견갑 라메 3겹이 상완을 위에서 덮고
//   쿠터 돔이 아래에서 올라와, 상완 실루엣이 '견갑 → 곧바로 팔꿈치'로 뭉개진다.
//   그래서 이 프로브는 길이가 아니라 **드러난 구간**을 잰다.
//
// 판정 3건 (전부 어깨 로컬 좌표 · Idle 0프레임 스냅 · 왼팔=방패쪽, 검이 안 가린다)
//   ① 노출 상완 / 상완 지름 ≥ 0.55
//        견갑 밑단(상완 축 근처만)에서 쿠터 윗단까지의 세로 구간을 상완 자기 지름으로 나눈 값.
//        지름으로 정규화하는 이유: 팔을 굵히면(0.062→0.073, ㉣ 처방) 같은 노출 길이라도
//        더 뭉툭해 보인다 — 절대 길이로 걸면 그 변경이 판정을 통과한 채 실루엣만 나빠진다.
//   ② 패딩 소매가 견갑 **밖으로** 나온다 (padOut > 0)
//        `armPad` 는 주석이 "견갑 아래로 삐져나오는 누빔천 (판금 → 천 → 사슬 3층 경계)"라고
//        선언해 둔 파츠다. 그런데 실측하면 통째로 견갑 안에 들어 있어 **화면에 한 번도 안 보인다**
//        (이 저장소가 '태싯 스트랩'에서 이미 한 번 겪은 죽은 지오메트리다). 주석이 주장하는
//        3층 경계가 실제로 화면에 있는지를 이 항목이 지킨다.
//   ③ 견갑 최대 반경 불변 (≥ 0.112)
//        노출을 벌겠다고 견갑을 통째로 줄이면 역삼각 실루엣이 죽는다 — 비평가 2인이 함께
//        '되돌리지 말 것'으로 꼽은 신호다. 드리움(세로)만 줄이고 **폭은 건드리지 말라**는 제약.
//
// ⚠️ **견갑 밑단은 '상완 축 근처'에서만 잰다 — 서브트리 전체 최저점이 아니다.**
//    (실측 참고: 지금 형상에서는 둘이 우연히 같은 점이다. 라메를 바깥-아래로 눕히면 회전축이
//     중심이라 **안쪽** 가장자리가 가장 많이 내려앉기 때문이다 — 착수 전 예상은 '바깥 끝이
//     최저점'이었는데 실측이 그 반대였고, 그 사실이 그대로 수정의 핵심 단서가 됐다. 그래도
//     반경 필터는 남긴다: 라메를 밖으로 더 벌리는 변경이 들어오면 그 순간 둘이 갈라지고,
//     그때 전체 최저점으로 재면 팔을 안 가리는 치맛단을 '덮임'으로 오독한다.)
//    필터 반경 = 상완 반지름 + 0.02.
// ⚠️ 각도가 아니라 **구워진 정점**에서 잰다 — 설계 상수(userData)를 읽으면 '의도'만 확인하고
//    지오메트리가 실제로 그렇게 만들어졌는지는 판정하지 못한다(`probe-tasset` 교훈).
// 사용: node probe-upperarm.js
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
        // 포즈를 t=0 으로 **스냅한 뒤** 얼린다(그냥 비우면 마지막 Idle 위상이 굳어 런마다 달라진다).
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0);
        ProChar.update = () => {};
        R.group.updateWorldMatrix(true, true);

        const arm = R.arms && R.arms[0];
        if (!arm) return { error: 'R.arms[0] 없음' };
        const shoulder = arm.shoulder, elbow = arm.elbow;
        if (!shoulder || !elbow) return { error: 'shoulder/elbow 없음' };

        const byTag = {};
        shoulder.traverse(o => { if (o.userData && o.userData.part) byTag[o.userData.part] = byTag[o.userData.part] || o; });
        for (const t of ['pauldron', 'upperArm', 'armPad'])
            if (!byTag[t]) return { error: 'userData.part=' + t + ' 태그를 못 찾음 (prochar.js 태그가 지워졌나?)' };

        // 어깨 로컬로 되돌리는 행렬 — 어깨 자체 회전(Idle 스윙)을 빼야 런 간 재현성이 생긴다.
        const toLocal = new THREE.Matrix4().copy(shoulder.matrixWorld).invert();
        // 아웃라인 인버티드 헐 셸은 본체보다 법선만큼 부풀어 있어 치수를 오염시킨다 — 제외.
        const isShell = o => !!(o.userData && (o.userData.outlineShell || o.userData.isOutline)) ||
            (o.material && o.material.side === THREE.BackSide && o.userData && o.userData.outline);

        // 서브트리 정점을 어깨 로컬로 모은다.
        const verts = (root, filter) => {
            const pts = [];
            root.updateWorldMatrix(true, true);
            root.traverse(o => {
                if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
                if (isShell(o)) return;
                if (filter && !filter(o)) return;
                const pos = o.geometry.attributes.position;
                const m = new THREE.Matrix4().multiplyMatrices(toLocal, o.matrixWorld);
                const v = new THREE.Vector3();
                for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); pts.push(v.clone()); }
            });
            return pts;
        };

        // ── 상완 축·지름 ────────────────────────────────────────────────
        // 상완은 어깨 원점에서 아래로 늘어진 캡슐이라 축 = 어깨 로컬 y축, 축 위치 = (x,z)=(0,0) 근처.
        const uaPts = verts(byTag.upperArm);
        let uaR = 0, uaBot = Infinity, uaTop = -Infinity, cx = 0, cz = 0;
        for (const p of uaPts) { cx += p.x; cz += p.z; }
        cx /= uaPts.length; cz /= uaPts.length;
        for (const p of uaPts) {
            const r = Math.hypot(p.x - cx, p.z - cz);
            if (r > uaR) uaR = r;
            if (p.y < uaBot) uaBot = p.y;
            if (p.y > uaTop) uaTop = p.y;
        }
        const uaDia = uaR * 2;
        const NEAR = uaR + 0.02;   // 상완을 실제로 가리는 반경대

        // ── 견갑: 상완 축 근처에서의 최저점(= 팔을 덮는 밑단) + 전체 최대 반경 ──
        const pPts = verts(byTag.pauldron);
        let pauldronCover = Infinity, pauldronMaxR = 0, pauldronLowest = Infinity;
        for (const p of pPts) {
            const r = Math.hypot(p.x - cx, p.z - cz);
            if (r > pauldronMaxR) pauldronMaxR = r;
            if (p.y < pauldronLowest) pauldronLowest = p.y;
            if (r <= NEAR && p.y < pauldronCover) pauldronCover = p.y;
        }

        // ── 쿠터(팔꿈치 장갑) 윗단: 팔꿈치 서브트리 중 상완 축 근처의 최고점 ──
        // 하완·손·스트랩까지 다 들어오지만 그것들은 전부 더 아래라 max 에 영향이 없다.
        const ePts = verts(elbow);
        let couterTop = -Infinity;
        for (const p of ePts) {
            const r = Math.hypot(p.x - cx, p.z - cz);
            if (r <= NEAR + 0.03 && p.y > couterTop) couterTop = p.y;
        }

        // ── 패딩 소매가 견갑 밖으로 나온 길이 ──
        const padPts = verts(byTag.armPad);
        let padBot = Infinity;
        for (const p of padPts) if (p.y < padBot) padBot = p.y;

        return {
            uaDia, uaTop, uaBot,
            pauldronCover, pauldronLowest, pauldronMaxR,
            couterTop, padBot,
            exposed: pauldronCover - couterTop,
            padOut: pauldronCover - padBot,
        };
    });

    console.log('--- 상완 노출 실측 (어깨 로컬 · Idle 0프레임 · 왼팔) ---');
    if (out.error) { console.log('❌ ' + out.error); await browser.close(); process.exit(1); }
    const ratio = out.exposed / out.uaDia;
    const f = n => (n >= 0 ? ' ' : '') + n.toFixed(4);
    console.log('상완 지름        ' + f(out.uaDia) + '   (캡슐 상단 y' + f(out.uaTop) + ' → 하단 y' + f(out.uaBot) + ')');
    console.log('견갑 덮음 밑단   ' + f(out.pauldronCover) + '   (상완 축 반경 ' + f(out.uaDia / 2 + 0.02) + ' 안 · 서브트리 최저점은 ' + f(out.pauldronLowest) + ' = 바깥 끝이라 판정에 안 씀)');
    console.log('쿠터 윗단        ' + f(out.couterTop));
    console.log('패딩 소매 밑단   ' + f(out.padBot));
    console.log('');
    const c1 = ratio >= 0.55, c2 = out.padOut > 0, c3 = out.pauldronMaxR >= 0.112;
    console.log('① 노출/지름      ' + ratio.toFixed(3) + '  (노출 ' + f(out.exposed) + ' · 목표 ≥ 0.55) ' + (c1 ? '✅' : '❌'));
    console.log('② 패딩 노출      ' + f(out.padOut) + '  (견갑 밑단 아래로 나온 길이 · 목표 > 0) ' + (c2 ? '✅' : '❌'));
    console.log('③ 견갑 최대반경  ' + f(out.pauldronMaxR) + '  (역삼각 실루엣 보존 · 목표 ≥ 0.112) ' + (c3 ? '✅' : '❌'));
    console.log('콘솔 에러        ' + errs.length + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''));
    const ok = c1 && c2 && c3 && errs.length === 0;
    console.log(ok ? 'PASS — 세 판정 전부 통과' : '미통과 있음');
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
