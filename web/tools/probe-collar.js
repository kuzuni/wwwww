// 스탠딩 고젯 칼라 기여도 실측 — "목 기둥 부재: 요크와 투구가 2~3px 어두운 이음선으로 만난다"
// (비평가 잔여 지적 ⓔ) 를 고쳤는지 판정한다.
//
// ⚠️ 눈으로 "칼라가 보인다"고 판단하면 안 된다 — 투구·턱·카울이 겹치는 구간이라 새로 넣은 판금이
//    통째로 다른 파츠 뒤에 숨어도 스크린샷은 멀쩡해 보인다(tassetStrap 이 정확히 그렇게 죽어 있었다).
//    그래서 **칼라를 껐다 켠 두 프레임을 차분**해 실제로 화면에 기여한 픽셀만 센다.
//
// 지표 ① 기여 픽셀 수(0 이면 완전 매몰 = 죽은 지오메트리) ② 기여 영역의 세로 범위(px)
//      = 요크 윗선과 투구 밑선 사이에 실제로 생긴 '기둥'의 높이. 지적이 말한 2~3px 이음선을
//        넘어섰는지 이 값으로 본다.
//
// 사용: node probe-collar.js
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
        // 포즈 고정 — ⚠️ update 를 그냥 비우면 **마지막 프레임 위상이 그대로 남아** 런마다 값이 흔들린다
        //    (이 프로브에서 기여 픽셀이 907px / 0px 로 오갔다). 반드시 t=0 로 스냅한 뒤 비울 것.
        const R = Scene3D.heroRig;
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0);
        ProChar.update = () => {};
        R.group.updateWorldMatrix(true, true);
        if (Scene3D.heroHpG) Scene3D.heroHpG.visible = false;
        Scene3D._trailOn = false; Scene3D.trailPts = [];
        if (Scene3D.trailMesh) Scene3D.trailMesh.visible = false;

        // 칼라 파츠를 이름 대신 **기하 특징**으로 찾는다 — spine 직속 자식 중 로컬 y 0.42~0.56 대역에
        // 들어오고 반경 0.16 이하인 메시.
        // ⚠️ 종전 판정은 `position.y === 0.547` 과 `LatheGeometry` 라는 **그때의 구현 형태**에 묶여 있었다.
        //    2026-08-18 에 칼라를 3단 라메 스택(개방 CylinderGeometry + Torus 테)으로 바꾸자 한 개도 못 찾았다.
        //    구현이 바뀌면 못 찾는 파인더는 '기여 0px'과 구분이 안 되므로, 형태가 아니라 **위치**로 찾는다.
        const spine = R.bones.spine;
        const inBand = (o) => {
            if (!o.isMesh || !o.geometry || o.userData.isOutline) return false;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            // ⚠️ 지오메트리 bbox 에 position.y 만 더하면 **회전한 메시가 틀리게 잡힌다** — 단 경계 테는
            //    rotation.x=π/2 인 토러스라, 회전 전 bbox 의 y 범위가 ±(major+tube) 로 잡혀 대역 밖으로
            //    밀려나고 '테 0개'로 읽혔다. 8정점을 o.matrix(=오브젝트→spine 로컬)로 옮겨 재야 한다.
            o.updateMatrix();
            const gb = o.geometry.boundingBox;
            const v = new THREE.Vector3();
            let y0 = Infinity, y1 = -Infinity, r = 0;
            for (let i = 0; i < 8; i++) {
                v.set(i & 1 ? gb.max.x : gb.min.x, i & 2 ? gb.max.y : gb.min.y, i & 4 ? gb.max.z : gb.min.z).applyMatrix4(o.matrix);
                y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
                r = Math.max(r, Math.abs(v.x), Math.abs(v.z));
            }
            // ⚠️ 대역을 칼라 치수에 딱 맞추면 안 된다 — 치수를 조금만 늘려도 파츠가 조용히 빠지고
            //    '기여 0px(죽은 지오메트리)'과 구별이 안 된다(실제로 겪었다). 넉넉히 잡고 반경으로 거른다
            //    (흉갑·요크는 반경 0.16 을 넘으므로 대역을 넓혀도 안 걸린다).
            return y0 > 0.38 && y1 < 0.60 && r < 0.16;
        };
        const collar = spine.children.filter(inBand);
        if (!collar.length) return { error: '칼라 파츠를 못 찾음 — 판정 불가' };
        // 단(段) 수 = 개방 실린더 라메 중 **판금 본체**만.
        // ⚠️ 니어블랙 안감·목구멍(deepLine)도 개방 실린더라 그냥 세면 단수가 부풀어 오른다(실제로 4~5단으로 셌다).
        //    그 재질들은 DoubleSide 로 만들어지므로 그것으로 가른다.
        const cyl = collar.filter(o => o.geometry.type === 'CylinderGeometry' && o.geometry.parameters.openEnded
            && o.material && o.material.side !== THREE.DoubleSide);
        const tiers = cyl;
        const byY = tiers.slice().sort((a, b) => a.position.y - b.position.y);
        // 단 경계 테(Torus) 수 — 단이 3개여도 경계 테가 없으면 화면에서는 매끈한 원뿔 하나로 뭉개진다.
        const rims = collar.filter(o => o.geometry.type === 'TorusGeometry').length;
        // 벌어지는 방향은 **판정이 아니라 기록**이다 — 아래 주석(㉦①) 참조.
        const flare = byY.length < 2 ? 'n/a'
            : (byY[byY.length - 1].geometry.parameters.radiusTop > byY[0].geometry.parameters.radiusBottom ? '위로' : '아래로');
        // 총 높이 / 머리 높이
        let cy0 = 1e9, cy1 = -1e9;
        for (const o of tiers) { const p = o.geometry.parameters; cy0 = Math.min(cy0, o.position.y - p.height / 2); cy1 = Math.max(cy1, o.position.y + p.height / 2); }
        const headBox = new THREE.Box3().setFromObject(R.bones.head);
        const headH = headBox.max.y - headBox.min.y;

        // 정면 카메라, 어깨~머리 근접
        const nk = R.bones.neck, c = new THREE.Vector3();
        nk.getWorldPosition(c);
        const fwd = new THREE.Vector3();
        Scene3D.heroG.getWorldDirection(fwd);
        const dist = 1.6;
        Scene3D.camLock = { pos: c.clone().add(fwd.multiplyScalar(dist)), look: c.clone() };
        Scene3D.camera.position.copy(Scene3D.camLock.pos);
        Scene3D.camera.lookAt(Scene3D.camLock.look);

        const Rr = Scene3D.renderer, gl = Rr.getContext();
        const w = Rr.domElement.width, h = Rr.domElement.height;
        const grab = () => { Rr.render(Scene3D.scene, Scene3D.camera); const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return b; };
        // hero-chibi(2026-08-18): 머리를 **숨기고** 차분한다 — 커진 치비 턱이 칼라 상단·목구멍
        // 샘플점을 카메라 미세각에 따라 가렸다 안 가렸다 해서 기여 736↔435px, 목구멍 L 26↔225 로
        // 런마다 튀었다(실측). 이 프로브의 목적은 '요크 뒤 매몰(죽은 지오메트리) 검출'이지 턱 가림
        // 판정이 아니므로, 머리를 치우고 재면 목적을 유지한 채 결정적이 된다.
        const headWas = R.bones.head.visible;
        R.bones.head.visible = false;
        const on = grab();
        for (const o of collar) o.visible = false;
        const off = grab();
        for (const o of collar) o.visible = true;
        R.bones.head.visible = headWas;

        let n = 0, yMin = 1e9, yMax = -1, xMin = 1e9, xMax = -1;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]);
            if (d > 12) { n++; if (y < yMin) yMin = y; if (y > yMax) yMax = y; if (x < xMin) xMin = x; if (x > xMax) xMax = x; }
        }
        // 목 구멍 안쪽 암부 — 최상단 라메의 **안쪽 구멍**이 실제로 어두운지 (처방 "L 20대").
        // 라메 안감이 아니라 구멍 안을 봐야 한다: 최상단 라메 상단 중심을 화면에 투영하고
        // 그 주변 작은 창의 최소 휘도를 읽는다(투구 턱이 가리면 그 값도 어둡지만, 그건 '어둡다'는 결론에 무해하다).
        let throatL = null;
        if (byY.length) {
            const top = byY[byY.length - 1];
            const wp = new THREE.Vector3(0, top.position.y + top.geometry.parameters.height / 2 - 0.01, 0);
            spine.localToWorld(wp);
            const pv = wp.clone().project(Scene3D.camera);
            const px = Math.round((pv.x * 0.5 + 0.5) * w), py = Math.round((pv.y * 0.5 + 0.5) * h);
            let mn = 255;
            for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
                const xx = px + dx, yy = py + dy;
                if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
                const i = (yy * w + xx) * 4;
                mn = Math.min(mn, 0.2126 * on[i] + 0.7152 * on[i + 1] + 0.0722 * on[i + 2]);
            }
            throatL = +mn.toFixed(1);
        }
        return {
            px: { w, h }, parts: collar.length, contribPx: n,
            spanY: yMax < 0 ? 0 : yMax - yMin + 1, spanX: xMax < 0 ? 0 : xMax - xMin + 1,
            tiers: tiers.length, rims, flare,
            collarH: +(cy1 - cy0).toFixed(4), headH: +headH.toFixed(4), hRatio: +((cy1 - cy0) / headH).toFixed(3),
            throatL,
        };
    });

    if (out.error) { console.log('ERROR: ' + out.error); await browser.close(); process.exit(1); }
    console.log('canvas', JSON.stringify(out.px), '· 칼라 파츠', out.parts + '개');
    console.log('기여 픽셀   :', out.contribPx + 'px', out.contribPx === 0 ? '❌ 완전 매몰(죽은 지오메트리)' : '✅ 화면에 보임');
    console.log('기둥 세로높이:', out.spanY + 'px', '(지적한 이음선 2~3px 대비)');
    console.log('기둥 가로폭 :', out.spanX + 'px');
    // ── 6차 비평가 재지적 ㉦ ("높이가 아니라 단(段)과 암부가 모자란다") 판정 ──
    const ok = [];
    // ⚠️ 처방 문구의 '아래로 갈수록 넓어짐'은 **실측으로 기각**했으므로 판정에 넣지 않는다(기록만 한다).
    //    이 리그에서 아래로 넓어지는 스택은 요크 안쪽으로 들어가 기여 992px → 10px 로 죽는다.
    //    판정해야 하는 것은 방향이 아니라 "단(段)이 실제로 있고 경계가 보이는가" 다.
    const t1 = out.tiers >= 3 && out.rims >= 3;
    console.log(`㉦① 라메 단수 ${out.tiers}단 · 단 경계 테 ${out.rims}개 (처방 3단) · 벌어지는 방향 ${out.flare}(판정 제외) ${t1 ? '✅' : '❌'}`); ok.push(t1);
    // hero-chibi(사용자 지시 2026-08-18) 재캘리브레이션: 종전 허용 0.28~0.45 는 성인 비례 머리
    // (scale 0.48, 높이 0.258) 기준의 처방 ≈0.35 였다. 치비 머리(scale 1.0, 높이 0.605)에서는
    // 같은 칼라 절대 높이가 비율로 0.163 이 된다 — 치비는 목 없이 머리가 어깨에 얹히는 문법이라
    // 칼라를 머리의 1/3 로 키우면 오히려 턱을 삼킨다. 절대 높이 유지를 전제로 대역을 낮춘다.
    const t2 = out.hRatio >= 0.10 && out.hRatio <= 0.45;
    console.log(`㉦② 총 높이 ${out.collarH} / 머리 높이 ${out.headH} = ${out.hRatio} (치비 허용 0.10~0.45) ${t2 ? '✅' : '❌'}`); ok.push(t2);
    const t3 = out.throatL != null && out.throatL < 45;
    console.log(`㉦③ 목 구멍 안쪽 최소 휘도 L ${out.throatL} (처방 L 20대 = 암부, 판정 <45) ${t3 ? '✅' : '❌'}`); ok.push(t3);
    // ㉦④ 매몰 방지선 — 칼라를 손대면 조용히 요크 뒤로 들어가기 쉽다.
    // hero-chibi 재캘리브레이션: 머리 숨김 차분 기준 실측 777~781px (종전 성인 비례·머리 포함
    // 기준선 992px 과 측정 조건이 다르니 비교하지 말 것). 하한은 실측의 약 3/4 — 이 밑이면 진짜 매몰.
    const t4 = out.contribPx >= 590;
    console.log(`㉦④ 기여 픽셀 ${out.contribPx}px (치비 기준선 ~780px · 하한 590px — 이하면 요크 뒤로 매몰) ${t4 ? '✅' : '❌'}`); ok.push(t4);
    console.log(ok.every(Boolean) ? '㉦ 전부 통과' : '㉦ 미통과 있음');
    console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : '(no console errors)');
    await browser.close();
})();
