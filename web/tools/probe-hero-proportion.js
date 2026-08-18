// 영웅 비례 실측 — hero-chibi(사용자 지시 2026-08-18) 판정기.
//   사용자 원문 "주인공 캐릭터 쨋든 치비 형으로 해줘" — 치비 = 두신비 2.5~3, 큰 머리·짧은 다리.
//   ⚠️ 종전 게이트(성인 비례: 두신비 ≥6.60·다리 ≥49%, 6차 비평가 ㉢)는 이 지시로 **반전 폐기**됐다.
//   되돌리지 말 것 — 성인 비례로 되돌리면 사용자 지시 위반이다(TODO hero-chibi 항목 참조).
//
// ⚠️ 픽셀 실루엣으로 두신비를 재지 말 것. 머리/턱 경계가 고젯·카울과 같은 명도라 화소로는 갈리지
//    않고(앞 세션이 색 임계값으로 시도했다가 칼라를 머리로 먹었다), 무기·망토가 실루엣 상단을 넘어
//    전신 높이까지 오염시킨다. **월드 AABB** 로 재면 파츠 소속이 확정적이라 흔들리지 않는다.
//
// 재는 값 (전부 월드 y, 투구 착용 상태 기준):
//   headTop    = 머리 그룹(headG: 두개골·턱·얼굴·머리카락·headMount 에 붙은 투구) AABB 상단
//   headBot    = 같은 그룹 AABB 하단 (= 턱끝)
//   footBot    = 두 다리 hip 서브트리 AABB 하단 (= 접지면)
//   crotch     = 고관절 피벗 월드 y (가랑이)
//   두신비     = (headTop - footBot) / (headTop - headBot)
//   다리비     = (crotch - footBot) / (headTop - footBot)
//   가랑이위치 = (crotch - footBot) / (headTop - footBot)  ← 전신 중점이면 0.5
//
// ⚠️ 무기·방패·망토·HP바는 전신 높이에서 **뺀다** — 손에 든 검이 머리 위로 솟아 전신을 20% 부풀린다
//    (실제로 R.group AABB 로 재면 두신비가 통째로 거짓말한다).
// 판정: 두신비 2.30~3.20(치비 대역) · 다리비 ≤ 0.360(짧은 다리) · 전신높이 1.785 ±3% ·
//   접지 -0.053 ±0.01 · 콘솔 에러 0.
//   두신비를 대역(상·하한 양쪽)으로 거는 이유: 상한이 없으면 성인 비례(6.9)로 되돌아가도 통과해
//   버려 게이트가 치비를 못 지킨다. 하한은 과도한 초변형(2두신 미만 보블헤드)을 막는다.
// ⚠️ 뒤의 두 항목(전신높이·접지)이 이 프로브의 진짜 회귀 방어선이다. 다리를 늘이면 전신이 12% 커지는데,
//    그걸 안 되돌리면 '비례를 고쳤다'가 아니라 '영웅을 키웠다'가 되고 적 대비·카메라·탈것 안장 높이가
//    전부 따라 움직인다(`ProChar.BODY_SCALE`).
// 사용: node probe-hero-proportion.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
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
        // 포즈를 Idle 0프레임으로 **스냅한 뒤** update 를 막는다.
        // ⚠️ 그냥 비우면 마지막에 흘러가던 포즈가 그대로 굳어 런마다 다리 각도가 달라진다
        //    (앞 세션에서 프로브 4개가 이 함정을 밟았다).
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        Scene3D.heroAttack = () => {};
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
        Scene3D.anims = [];
        Scene3D.walking = false;
        const R = Scene3D.heroRig;
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0);
        ProChar.update = () => {};
        R.group.updateWorldMatrix(true, true);

        const V = THREE.Vector3;
        const boxOf = (obj, skip) => {
            const b = new THREE.Box3();
            obj.updateWorldMatrix(true, true);
            obj.traverse(o => {
                if (!o.geometry || o.visible === false) return;
                for (let p = o; p; p = p.parent) { if (skip && skip.has(p)) return; }
                b.expandByObject(o);
            });
            return b;
        };

        // 전신 높이에서 뺄 것들 — 무기/방패/망토/HP바/트레일
        const skip = new Set();
        for (const k of ['weaponG', 'shield', 'cape', 'capeG']) if (R[k]) skip.add(R[k]);
        if (Scene3D.weaponG) skip.add(Scene3D.weaponG);
        if (Scene3D.heroHpG) skip.add(Scene3D.heroHpG);
        if (R.handR) for (const c of R.handR.children) if (c.type === 'Group' && c !== R.handR) skip.add(c);
        if (R.handL) for (const c of R.handL.children) if (c.type === 'Group' && c !== R.handL) skip.add(c);

        const head = R.bones.head;
        const hb = boxOf(head, null);       // 머리는 투구까지 포함해서 잰다 (skip 없음)
        const bodyBox = boxOf(R.root, skip);

        const hips = [R.bones.hipL, R.bones.hipR].filter(Boolean);
        const legBox = new THREE.Box3();
        for (const h of hips) legBox.union(boxOf(h, skip));
        const crotch = hips.length
            ? hips.reduce((s, h) => s + h.getWorldPosition(new V()).y, 0) / hips.length
            : bodyBox.min.y;

        const headTop = hb.max.y, headBot = hb.min.y, footBot = legBox.min.y;
        const total = headTop - footBot;
        const headH = headTop - headBot;
        const legLen = crotch - footBot;

        // 참고: 팔까지 포함한 최대 가로폭 / 전신 (어깨폭이 아니다 — Idle 은 팔이 벌어져 있어
        // 견갑 지름 0.806 보다 크게 나온다. 추세만 보는 값이고 판정에는 안 쓴다).
        const shW = bodyBox.max.x - bodyBox.min.x;

        // ---- 팔 길이 (참고 지표) ----
        // ⚠️ Idle 포즈 그대로 재면 안 된다 — 검을 든 팔이라 손끝 y 가 포즈에 딸려 다닌다.
        //    해부학 계측과 같은 방식으로 **어깨·팔꿈치 회전을 0으로 내려 팔을 늘어뜨린 뒤** 잰다.
        //    (사람 기준 어깨→손끝 ≈ 키의 44%, 손끝이 대퇴 중간에 닿는다.)
        const midThigh = crotch - (crotch - footBot) * 0.5 * 0.52;   // 대퇴는 다리의 약 52%
        let armLen = null, armOverH = null;
        const sh = R.bones.shoulderR, el = R.bones.elbowR;
        if (sh && el) {
            sh.rotation.set(0, 0, 0); el.rotation.set(0, 0, 0);
            sh.updateWorldMatrix(true, true);
            const shY = sh.getWorldPosition(new V()).y;
            const ab = boxOf(sh, skip);
            armLen = shY - ab.min.y;
            armOverH = armLen / total;
        }

        return {
            armLen, armOverH, midThigh,
            headTop, headBot, footBot, crotch,
            total, headH, legLen,
            heads: total / headH,
            legRatio: legLen / total,
            crotchAt: legLen / total,
            bodyTop: bodyBox.max.y,
            widthOverHeight: shW / total,
            helmet: !!(Scene3D.helmetG && Scene3D.helmetG.children.length),
        };
    });

    const f = (n, d) => Number(n).toFixed(d === undefined ? 3 : d);
    console.log('--- 영웅 비례 실측 (Idle 0프레임, 투구 ' + (out.helmet ? '착용' : '없음') + ') ---');
    console.log('머리 상단 y      ' + f(out.headTop) + '   턱끝 y ' + f(out.headBot) + '   접지 y ' + f(out.footBot));
    console.log('전신 높이        ' + f(out.total) + '   머리 높이 ' + f(out.headH) + '   다리 길이 ' + f(out.legLen));
    console.log('두신비           ' + f(out.heads, 2) + '  (목표 2.30~3.20 · 치비 2.5~3)');
    console.log('다리비           ' + f(out.legRatio * 100, 1) + '%  (목표 ≤ 36.0% · 치비 짧은 다리)');
    console.log('가랑이 위치      ' + f(out.crotchAt * 100, 1) + '%  (전신 중점 = 50%)');
    console.log('최대폭/키        ' + f(out.widthOverHeight, 3) + '  (참고값 — 팔 벌림 포함, 판정 아님)');
    if (out.armLen != null)
        console.log('팔 길이/키       ' + f(out.armOverH * 100, 1) + '%  (어깨→손끝, 팔 늘어뜨린 기준 · 사람 ≈ 44%)');

    const okHeads = out.heads >= 2.30 && out.heads <= 3.20;
    const okLeg = out.legRatio <= 0.360;
    // 크기 불변 — 비례 교정이 **프레이밍 교정으로 새지 않았는지** 지킨다. 다리만 늘이면 전신이 12%
    // 커져 적 대비·카메라·탈것 안장이 전부 끌려간다(`ProChar.BODY_SCALE` 이 되돌리는 부분).
    const okH = Math.abs(out.total - 1.785) <= 1.785 * 0.03;
    const okGround = Math.abs(out.footBot - (-0.053)) <= 0.01;
    const okErr = errs.length === 0;
    if (!okErr) console.log('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 3).join(' | '));
    console.log('크기 불변        전신 ' + f(out.total) + ' (기준 1.785 ±3%) · 접지 ' + f(out.footBot) + ' (기준 -0.053 ±0.01)');
    const pass = okHeads && okLeg && okH && okGround && okErr;
    console.log((pass ? 'PASS' : 'FAIL') + ' — 두신비 ' + (okHeads ? 'OK' : 'NG') + ' · 다리비 ' + (okLeg ? 'OK' : 'NG')
        + ' · 전신높이 ' + (okH ? 'OK' : 'NG') + ' · 접지 ' + (okGround ? 'OK' : 'NG') + ' · 콘솔 ' + (okErr ? 'OK' : 'NG'));
    await browser.close();
    process.exit(pass ? 0 : 1);
})();
