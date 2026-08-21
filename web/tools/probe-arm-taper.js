// 팔 굵기 프로파일 실측 — "팔이 동일 지름 실린더 3개"(비평가 A 단독 P3 잔여, prochar-aaa 인계) 판정기.
//
// 🚫 **2026-08-21 은퇴 처리 — 이 판정기가 재던 팔 판금은 맨살 치비로 사라졌다 (slug: armtaper-legacy-retire).**
//   사용자 2026-08-21 "옷을 왜 입히냐 기본인데" → `scene3d.js setupHeroProc`(396~)이 레거시 판금 팔
//   메시를 전부 숨기고 `simpleBox` 치비 박스 + 얼굴만 남긴다. 실측: vambrace 는 통째로 부재,
//   upperArm·forearm·fist 는 빈 피벗 본(자식 0)만 남았다 → 옛 판은 여기서 태그를 못 찾아 FAIL 했다.
//   `probe-vox-plate` 와 같은 뿌리(판금 갑옷 영웅 → mc 천 갑옷 + 맨살 치비). → **의도적으로 제거된
//   파츠(메시 없음/부재)는 FAIL 이 아니라 '은퇴(n/a)' 로 넘기고 EXIT 0.** 네 파츠가 모두 메시를 갖고
//   다시 나타나면(누가 팔 판금을 되살리면) 그때 원래 ①②③ 굵기 판정을 그대로 잰다.
//
// 🚨 **이 프로브는 지적을 검증하러 만든 것이지 전제하고 만든 게 아니다.** 이 항목의 인계는
//    같은 계열의 지적에서 **두 번 연속** '지적이 이미 해소됐거나 원인이 다른 쪽'이었다:
//    ⓐ '팔이 키의 20.4%' → `hero-chibi` 전환으로 무효(치비는 정의상 팔다리가 짧다)
//    ⓑ '견갑이 팔꿈치에 닿는다' → 길이가 아니라 **덮임**이 원인이었다.
//    그래서 인계가 "리그만 만지는 세션은 **재실측부터** 하라"고 못 박아 뒀다. 이 파일이 그 자다.
//
// 재는 것 = **마디마다 자기 축에서 잰 최대 반경**(= 그 마디의 실루엣 반폭).
//   각도·설계 상수(userData 숫자)를 읽지 않고 **구워진 정점**에서 잰다 — `probe-tasset` 교훈대로
//   '의도'가 아니라 '지오메트리가 실제로 그렇게 만들어졌는가'를 봐야 하기 때문이다.
//   파츠는 타입이 아니라 **`userData.part` 태그**로 찾는다(같은 타입이 여럿이라 타입으로 고르면
//   다른 파츠가 섞여 수치가 늘었다 줄었다 한다 — 이 저장소의 '함정 ④⑵' 그대로다).
//
// 판정 3건 (전부 **파츠 자기 로컬 프레임** · Idle 0프레임 스냅 · 왼팔=방패쪽이라 검이 안 가린다)
//   ① **상완/하완 반경비 ≥ 1.25** — '동일 지름'이면 1.0 이다. 팔이 한 굵기로 안 흐른다는 뜻.
//   ② **주먹/하완 반경비 ≥ 1.30** — 끝이 안 굵으면 팔이 '막대'로 끝난다(부츠가 사라져 정강이가
//      '발 없는 막대'로 읽혔던 ㉢ 회귀와 같은 종류의 신호다).
//   ③ **뱀브레이스 밴드 > 하완**(band > fore) — 하완이 민짜 튜브로 안 남았는지. 밴드가 하완보다
//      가늘면 살 속에 묻혀 화면에 없는 것과 같다(`armPad` 가 실제로 그랬던 전례가 이 항목에 있다).
//
// 🚨 **반경은 반드시 '그 파츠의 자기 로컬 프레임'에서 잰다 — 이 프로브의 1차 판이 여기서 틀렸다.**
//    처음엔 상완 정점 무게중심으로 축(x,z)을 하나 잡고 팔 전체를 그 축에서 쟀다. 그런데 하완·주먹은
//    **팔꿈치 아래로 꺾여** 그 축에서 통째로 비켜나 있어서, 거리(반경)에 **꺾인 만큼의 오프셋이
//    그대로 더해졌다** — 하완이 0.046 인데 0.068 로, 손목 대역이 0.25 로 찍혔다(주먹 0.119 보다
//    '손목'이 굵다는 불가능한 값이 나와서 잡았다). `capsule()` 이 만드는 그룹은 자식이 자기 원점의
//    y축에 정렬돼 있으므로, **그 그룹의 matrixWorld 역행렬**로 되돌리면 hypot(x,z) 가 곧 반경이다.
//    (교훈: 마디마다 회전 피벗이 따로 있는 리그에서 '공용 축 하나'는 자가 아니다.)
// ⚠️ 아웃라인 인버티드 헐은 법선만큼 부풀어 있어 반경을 오염시킨다 — 제외한다(probe-upperarm 과 동일).
// 사용: node probe-arm-taper.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const RATIO_MIN = 1.25;
const FIST_MIN = 1.30;

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
        // 포즈를 t=0 으로 스냅한 뒤 얼린다(그냥 비우면 마지막 Idle 위상이 굳어 런마다 달라진다).
        R._clip = ProChar.CLIPS.Idle; R._t = 0; R._once = false; R._speed = 1; R._idleT = 0;
        ProChar.update(R, 0);
        ProChar.update = () => {};
        R.group.updateWorldMatrix(true, true);

        const arm = R.arms && R.arms[0];
        if (!arm) return { error: 'R.arms[0] 없음' };
        const shoulder = arm.shoulder;
        if (!shoulder) return { error: 'shoulder 없음' };

        const byTag = {};
        shoulder.traverse(o => { if (o.userData && o.userData.part) byTag[o.userData.part] = byTag[o.userData.part] || o; });
        // 🚫 은퇴 감지 — 팔 판금이 맨살 치비로 사라지면 태그가 아예 없다(부재). 빈 본만 남은 경우는
        //    아래 measure 의 정점 수 0 으로 갈린다. 태그 부재는 여기서, 메시 부재는 verdict 에서 은퇴 처리.
        const missing = ['upperArm', 'forearm', 'fist', 'vambrace'].filter(t => !byTag[t]);

        const isShell = o => !!(o.userData && (o.userData.outlineShell || o.userData.isOutline)) ||
            (o.material && o.material.side === THREE.BackSide && o.userData && o.userData.outline);

        // 파츠를 **자기 로컬 프레임**으로 되돌려 재는 자. 자식 메시의 정점을 파츠 원점 기준으로 옮긴다.
        const measure = (root) => {
            root.updateWorldMatrix(true, true);
            const toSelf = new THREE.Matrix4().copy(root.matrixWorld).invert();
            let mx = 0, top = -Infinity, bot = Infinity, n = 0;
            const v = new THREE.Vector3();
            root.traverse(o => {
                if (!o.isMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
                if (isShell(o)) return;
                const pos = o.geometry.attributes.position;
                const m = new THREE.Matrix4().multiplyMatrices(toSelf, o.matrixWorld);
                for (let i = 0; i < pos.count; i++) {
                    v.fromBufferAttribute(pos, i).applyMatrix4(m);
                    // 🚨 **`hypot` 이 아니라 축별 최댓값이다 — 2026-08-20 수정.**
                    //    이 파일 머리말이 선언한 재는 대상은 "그 마디의 **실루엣 반폭**"인데,
                    //    `hypot` 최댓값은 단면이 원일 때만 그것과 같다. 사지가 voxel 기둥으로
                    //    바뀌자 `hypot` 이 **단면의 모서리 대각선**을 잡아 하완이 0.046 →
                    //    0.0575 로 굵어졌다고 보고했고, 판정 ③(밴드가 하완보다 굵어야 한다)이
                    //    **조형을 안 건드렸는데** 뒤집혔다. 대각선은 어느 방향에서도 안 보이는
                    //    길이라 실루엣이 아니다. 축별 최댓값은 원통에서는 그대로 반지름이라
                    //    옛 판정과 호환된다(실측: 상완 0.0815 → 0.0730 = 정확히 설계값).
                    const r = Math.max(Math.abs(v.x), Math.abs(v.z));
                    if (r > mx) mx = r;
                    if (v.y > top) top = v.y;
                    if (v.y < bot) bot = v.y;
                    n++;
                }
            });
            return { r: mx, top, bot, n };
        };

        const z = { r: 0, top: 0, bot: 0, n: 0 };   // 태그 부재 파츠용 빈 측정
        const ua = byTag.upperArm ? measure(byTag.upperArm) : z,
              fa = byTag.forearm ? measure(byTag.forearm) : z,
              fi = byTag.fist ? measure(byTag.fist) : z,
              vb = byTag.vambrace ? measure(byTag.vambrace) : z;

        return {
            missing,
            upperR: ua.r, foreR: fa.r, fistR: fi.r, bandR: vb.r,
            upperLen: ua.top - ua.bot, foreLen: fa.top - fa.bot, fistLen: fi.top - fi.bot,
            counts: [ua.n, fa.n, fi.n, vb.n],
        };
    });

    if (out.error) { console.log('FAIL  ' + out.error); await browser.close(); process.exit(1); }

    // 🚫 은퇴 상태 — 팔 판금이 맨살 치비로 사라졌으면(태그 부재 또는 메시 정점 0) 굵기 판정은 무의미하다.
    //    FAIL 이 아니라 n/a 로 넘기고 EXIT 0. 네 파츠가 모두 메시를 갖고 돌아오면 아래 ①②③ 을 잰다.
    const empty = out.counts.filter(n => n === 0).length;
    if ((out.missing && out.missing.length) || empty) {
        const names = ['상완', '하완', '주먹', '밴드'];
        const gone = out.counts.map((n, i) => n === 0 ? names[i] : null).filter(Boolean);
        console.log('n/a  팔 판금 은퇴(맨살 치비, scene3d setupHeroProc)');
        if (out.missing && out.missing.length) console.log('  태그 부재: ' + out.missing.join(', '));
        if (gone.length) console.log('  빈 본(정점 0): ' + gone.join(', '));
        console.log('콘솔 에러', errs.length, errs.slice(0, 3));
        console.log('→ 팔 판금이 되살아나면 ①②③ 굵기 판정을 다시 잰다.');
        await browser.close();
        process.exit(errs.length ? 1 : 0);
    }

    const f = (n) => n.toFixed(4);
    console.log('상완 반경 %s · 길이 %s', f(out.upperR), f(out.upperLen));
    console.log('하완 반경 %s · 길이 %s', f(out.foreR), f(out.foreLen));
    console.log('주먹 반경 %s · 길이 %s', f(out.fistR), f(out.fistLen));
    console.log('뱀브레이스 밴드 반경 %s', f(out.bandR));
    console.log('정점 수(상완/하완/주먹/밴드) %s', out.counts.join('/'));

    let fail = 0;
    const judge = (ok, label) => { console.log((ok ? 'PASS  ' : 'FAIL  ') + label); if (!ok) fail++; };
    const rUF = out.upperR / out.foreR, rHF = out.fistR / out.foreR;
    judge(rUF >= RATIO_MIN, `① 상완/하완 반경비 ${rUF.toFixed(3)} (≥ ${RATIO_MIN})`);
    judge(rHF >= FIST_MIN, `② 주먹/하완 반경비 ${rHF.toFixed(3)} (≥ ${FIST_MIN})`);
    judge(out.bandR > out.foreR, `③ 뱀드(${f(out.bandR)}) > 하완(${f(out.foreR)})`);
    console.log('콘솔 에러', errs.length, errs.slice(0, 3));
    if (errs.length) fail++;
    console.log(fail ? `\n미통과 ${fail}건` : '\nPASS — 팔은 동일 지름 실린더가 아니다');
    await browser.close();
    process.exit(fail ? 1 : 0);
})();
