// 비평가 5차 지적 ⓑ(A #3) 교차검증 — "임팩트 프레임에 무기가 적에 닿아 있지 않다.
// a1·a4 모두 곤봉이 **어깨 뒤 위**에 세워져 있고 적 방향으로 뻗은 프레임이 세트에 없다."
//
// 🚨 **착수 전 반드시 이 프로브를 돌릴 것.** 같은 프레임·같은 판독 방식으로 나온 A #1
//    ("스파크가 공격자 몸에 붙어 있다")은 5차에서 **실측으로 기각**됐다 — 채점자 2인이
//    독립적으로 같은 결론을 냈지만 둘 다 휘도 임계값 군집을 썼고, 이 게임 영웅은 은색 판금
//    갑옷이라 평상시에도 near-white 라 오검출이었다. 그래서 ⓑ도 **휘도가 아니라 무기 메시의
//    월드 좌표를 투영**해 잰다(`probe-spark-anchor.js` 와 같은 방식).
//
// 재는 것: 공격 클립을 1/60초 서브스텝으로 돌리며 프레임마다
//   ⒜ 무기 끝(weaponG 바운딩박스의 자루 반대쪽 끝)의 화면 좌표
//   ⒝ 적 실루엣 bbox
//   ⒞ 둘 사이 거리(겹치면 음수) — **한 프레임이라도 접촉하는가**
//   ⒟ 그 프레임이 임팩트(데미지 적용) 시각과 얼마나 떨어져 있는가
// 판정: 임팩트 ±80ms 안에 무기 끝이 적 bbox 에 닿는(거리 ≤ 0) 프레임이 하나도 없으면 지적이 맞다.
//
// ── 2026-08-18 세션: 인계된 전제 2건(㉠㉡)을 풀었다. 아래는 그때 밝혀진 함정이다. ──
//  ㉠ **`heroRig.state.clip` 은 원래 없는 필드였다(프로브 쪽 버그).** ProChar 리그의 `R.state` 는
//     *문자열*이고, **once 클립(공격 전부)은 설계상 `state=''` 로 둔다**(`prochar.js:play` — 루프
//     클립 중복 재시작 방지용). 그래서 `state.clip` 은 영원히 undefined 였고, 앞 세션은 그걸
//     "클립이 안 물렸다"는 증거로 읽었다. 실제 현재 클립은 `heroRig._clip` 이고, 이름은
//     `ProChar.resolveClip(후보배열)` 로 얻는다. 공격 클립은 정상적으로 물린다(club→slam).
//  ㉡ **스윙이 안 돈 진짜 원인은 헤드리스에서 rAF 가 사실상 안 도는 것.** Combat 은 별도 고정
//     인터벌이라 계속 도는데 Scene3D.update 는 rAF 라, 2.5초 대기 뒤 `Scene3D.anims` 에 **연출
//     121개가 밀려 있고**(전부 과거 공격의 런지 애니메이션) 적 메시는 논리 좌표에서 3.4 유닛
//     떨어진 자리에 멈춰 있었다. 그 상태로 `heroAttack` 을 한 번 더 태우면 밀린 런지 122개가
//     같은 `heroG.position.x` 를 서로 덮어써 톱니처럼 튀고(실측: -0.61→-1.35 반복), 무기 끝
//     이동폭은 대기 호흡 수준(47px)으로 뭉개진다. **측정 전에 백로그를 비우고 좌표를 스냅**해야
//     한 번의 스윙을 깨끗이 잴 수 있다.
//  ㉢ 임팩트 시각은 HP 감소로 짚지 않는다 — 데미지는 `Combat.pending` 이 넣으므로 `Combat.update`
//     를 같이 돌려야 하고, 그러면 실전투가 끼어들어 측정 도중 적이 죽고 표적이 바뀐다(앞 세션이
//     본 bbox 158px 점프). 임팩트는 **해석적으로** 정한다: `combat.js` 가 `heroAttack` 직후
//     `pending.push({t: wt.impact})` 로 예약하므로 임팩트 = 스윙 시작 + `WEAPON_TYPES[…].impact`.
//
// 전제가 안 서면 수치는 인쇄하되 **판정하지 않고 exit 2**(`probe-techoverview-dom` 계열 규약).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 20000 });
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });

    // ⚠️ 측정 전체를 **한 번의 evaluate 안**에서 한다 — 페이지의 setInterval(Combat)·rAF 는 그
    //    동기 블록 동안 끼어들 수 없으므로, 이것 자체가 ㉡ 의 "전투를 얼린다" 장치다.
    const out = await page.evaluate(() => {
        const S = Scene3D;

        // 적 실루엣 = **메시 정점을 하나씩 월드로 옮겨 투영**한 화면 bbox.
        // ⚠️ 월드 AABB 의 여덟 꼭짓점만 투영하면 안 된다(2026-08-18 세션이 그 판으로 한 번 쟀다):
        //    AABB 는 z 깊이까지 감싸므로 투영 폭이 실루엣보다 넓어지고, 골렘처럼 큰 적은 좌변이
        //    **영웅 자리(화면 x 167)보다 왼쪽인 153** 까지 뻗어 나온다. 그러면 무기가 파지점에
        //    가만히 있어도 "적 bbox 안"이라 접촉이 공짜로 참이 된다 — 지적 ⓑ 를 절대 못 잡는 자다.
        const V = new THREE.Vector3();
        const screenBox = (obj) => {
            if (!obj) return null;
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
            obj.updateWorldMatrix(true, true);
            obj.traverse(o => {
                const pos = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
                if (!pos || o.visible === false) return;
                const stride = Math.max(1, Math.floor(pos.count / 240)); // 큰 메시는 균등 샘플링
                for (let i = 0; i < pos.count; i += stride) {
                    V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                    const p = S.project(V);
                    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
                    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
                    n++;
                }
            });
            return n ? [x0, y0, x1, y1].map(v => +v.toFixed(1)) : null;
        };
        // 무기 '끝' = weaponG 정점 중 파지점에서 가장 먼 **실제 정점**(AABB 꼭짓점은 허공이라 금지)
        // + 접촉 판정용 '헤드 영역' = 파지에서 먼 25% 정점 전부. ⚠️ 접촉을 최원점 하나로 재면 안 된다 —
        //   weapon-size-2x(2026-08-19) 로 무기가 2배가 되자 **최원점의 호가 적 bbox 를 감싸고 돌아**
        //   헤드 부피가 시각적으로 적을 관통하는 프레임에서도 최원점은 0.5~4px 바깥을 지났다(유령 FAIL).
        //   원 지적 ⓑ(무기가 어깨 뒤)는 헤드 영역 전체가 적에서 멀므로 이 자로도 그대로 잡힌다.
        const weaponTip = () => {
            const w = S.weaponG;
            if (!w) return null;
            w.updateWorldMatrix(true, true);
            const grip = w.getWorldPosition(new THREE.Vector3());
            const pts = [];
            let best = null, bestD = -1;
            w.traverse(o => {
                const pos = o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position;
                if (!pos || o.visible === false) return;
                const stride = Math.max(1, Math.floor(pos.count / 240));
                for (let i = 0; i < pos.count; i += stride) {
                    V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                    const d = V.distanceTo(grip);
                    if (d > bestD) { bestD = d; best = V.clone(); }
                    pts.push({ d, v: V.clone() });
                }
            });
            if (!best) return null;
            return { screen: S.project(best), grip: S.project(grip), len: +bestD.toFixed(3),
                head: pts.filter(p => p.d >= bestD * 0.75).map(p => S.project(p.v)) };
        };
        // 점 → 사각형 거리(안이면 음수 = 가장 가까운 변까지 파고든 깊이)
        const distToBox = (p, b) => {
            if (!p || !b) return null;
            const dx = Math.max(b[0] - p.x, 0, p.x - b[2]);
            const dy = Math.max(b[1] - p.y, 0, p.y - b[3]);
            if (dx === 0 && dy === 0) {
                return -Math.min(p.x - b[0], b[2] - p.x, p.y - b[1], b[3] - p.y);
            }
            return Math.hypot(dx, dy);
        };

        const e = Combat.enemies.find(x => x.alive);
        const m = S.enemyMap.get(e.id);

        // ── ㉡ 정리: 밀린 연출 백로그를 비우고 좌표를 논리값에 스냅한다 ──
        const backlog = S.anims.length;
        S.anims.length = 0;
        S._hitStop = 0;
        S._attacking = false;
        S._trailOn = false;
        e.x = Combat.stopXOf(e);                 // 근접 정지선 = 실제로 때리는 그 자리
        m.g.position.set(e.x + S.worldX, m.g.position.y, e.z || 0);
        S.heroG.position.set(Combat.HERO_X + S.worldX, S.rideY || 0, 0);
        S.heroG.rotation.set(0, 0.55, 0);
        const snapGap = +(m.g.position.x - S.heroG.position.x).toFixed(3);

        // ── ㉢ 임팩트 시각: combat.js 가 heroAttack 직후 pending.push({t: wt.impact}) 로 예약한다 ──
        const wt = WEAPON_TYPES[S.wtypeId];
        const impactT = wt ? Math.round(wt.impact * 1000) : null;
        // ── ㉠ 클립: state 가 아니라 _clip / resolveClip 으로 확인한다 ──
        const CLIP_MAP = { slash: ['1H_Melee_Attack_Slice_Diagonal'], chop: ['1H_Melee_Attack_Chop'], thrust: ['1H_Melee_Attack_Stab'],
            slam: ['2H_Melee_Attack_Chop'], double: ['Dualwield_Melee_Attack_Slice'], bow: ['2H_Ranged_Shoot'],
            gun: ['1H_Ranged_Shoot'], cast: ['Spellcast_Shoot'], throw: ['Throw'] };
        const motion = wt ? wt.motion : 'slash';
        const clipName = (typeof ProChar !== 'undefined' && S.heroRig) ? ProChar.resolveClip(CLIP_MAP[motion] || CLIP_MAP.slash) : '(리그 없음)';

        const sample = (t) => {
            const tip = weaponTip(), ebox = screenBox(m.g);
            return {
                t,
                tip: tip && { x: +tip.screen.x.toFixed(1), y: +tip.screen.y.toFixed(1), len: tip.len },
                grip: tip && { x: +tip.grip.x.toFixed(1), y: +tip.grip.y.toFixed(1) },
                enemy: ebox,
                dist: tip && ebox ? +Math.min(...tip.head.map(p => distToBox(p, ebox))).toFixed(1) : null,
            };
        };

        // ── 대조군: **때리지 않은 채로** 같은 길이를 돌려 대기 호흡의 무기 끝 이동폭을 잰다 ──
        // 전제 검사의 임계값을 감으로 정하지 않기 위한 자체 교정치다. 앞 세션의 '≥120px' 은
        // 근거 없는 어림수였고, 이번 실측(스윙 60px)에서 **정상 스윙을 측정 불가로 튕겼다**.
        S.heroPlay(['Idle']);
        const idle = [];
        for (let i = 0; i < 48; i++) { idle.push(sample(Math.round(i * 1000 / 60))); S.update(1 / 60); }
        const spanOf = (arr) => {
            const xs = arr.filter(f => f.tip).map(f => f.tip.x), ys = arr.filter(f => f.tip).map(f => f.tip.y);
            return xs.length ? +Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)).toFixed(1) : 0;
        };
        const idleTravel = spanOf(idle);
        const idleReach = Math.max(...idle.filter(f => f.tip && f.grip).map(f => f.tip.x - f.grip.x));

        S.heroG.position.set(Combat.HERO_X + S.worldX, S.rideY || 0, 0);
        S.heroG.rotation.set(0, 0.55, 0);
        S.heroAttack(e.id);
        const clipLive = !!(S.heroRig && S.heroRig._clip);
        const frames = [];
        for (let i = 0; i < 48; i++) {           // 48프레임 = 800ms (스윙 0.36s + 여유)
            frames.push(sample(Math.round(i * 1000 / 60)));
            S.update(1 / 60);                    // ⚠️ Combat.update 는 부르지 않는다(㉢)
        }
        return { frames, idleTravel, idleReach: +idleReach.toFixed(1), swingTravel: spanOf(frames),
                 impactT, clipName, clipLive, backlog, snapGap, wtypeId: S.wtypeId, motion };
    });

    console.log('== 임팩트 프레임 무기 접촉 실측 (지적 ⓑ / A #3 교차검증) ==');
    console.log('  무기=%s(모션 %s)  클립=%s(물림 %s)  임팩트=+%sms  · 정리: 밀린 연출 %d개 비움 · 영웅↔적 간격 %s유닛',
        out.wtypeId, out.motion, out.clipName, out.clipLive ? '✓' : '✗', out.impactT, out.backlog, out.snapGap);
    const touching = out.frames.filter(f => f.dist !== null && f.dist <= 0);
    const nearest = out.frames.filter(f => f.dist !== null).sort((a, b) => a.dist - b.dist)[0];
    for (const f of out.frames.filter((_, i) => i % 3 === 0)) {
        console.log('  +%sms  무기끝=(%s,%s)  적bbox=%s  거리 %s',
            String(f.t).padStart(4), f.tip && f.tip.x, f.tip && f.tip.y,
            JSON.stringify(f.enemy), f.dist === null ? '?' : f.dist.toFixed(1));
    }
    console.log('\n  무기 끝이 적 bbox 에 닿는 프레임: %d개 / %d', touching.length, out.frames.length);
    if (touching.length) {
        console.log('  닿는 구간: +%sms ~ +%sms (최대 파고듦 %s px)',
            touching[0].t, touching[touching.length - 1].t,
            Math.min(...touching.map(f => f.dist)).toFixed(1));
    }
    console.log('  가장 가까웠던 프레임: +%sms 거리 %s px', nearest && nearest.t, nearest && nearest.dist.toFixed(1));
    // ── 전제 검사 — 스윙이 실제로 돌았는가. 안 돌았으면 판정하지 않는다 ──
    // 임계값은 어림수가 아니라 **같은 실행의 대기 대조군**으로 잡는다(스윙 이동폭 ≥ 대기의 3배).
    const travel = out.swingTravel, idleTravel = out.idleTravel;
    const travelOk = travel >= Math.max(3 * idleTravel, 20);
    // 적 bbox 가 도중에 크게 점프하면 표적이 바뀐 것(적이 죽고 다음 적이 들어옴)
    let jump = 0;
    for (let i = 1; i < out.frames.length; i++) {
        const a = out.frames[i - 1].enemy, b = out.frames[i].enemy;
        if (a && b) jump = Math.max(jump, Math.abs(b[0] - a[0]));
    }
    const preOk = out.impactT !== null && out.clipLive && travelOk && jump < 40;
    console.log('\n  전제: 임팩트 시각 %s · 공격 클립 %s · 무기끝 이동폭 %spx(대기 대조군 %spx의 %s배, ≥3배 필요) · 표적 점프 %spx(<40 필요)',
        out.impactT === null ? '없음(✗)' : '+' + out.impactT + 'ms(✓)',
        out.clipLive ? out.clipName + '(✓)' : '안 물림(✗)',
        travel.toFixed(0), idleTravel.toFixed(0), (travel / Math.max(0.1, idleTravel)).toFixed(1), jump.toFixed(0));
    if (!preOk) {
        console.log('\n  ⚠️ 측정 불가 — 스윙 전제가 안 섰다. **이 실행으로는 ⓑ를 판정하지 않는다.**');
        console.log('     (파일 머리의 함정 ㉠㉡㉢ 를 먼저 확인할 것. 전제 없이 나온 "닿는 프레임 0개"는');
        console.log('      스윙을 안 시켰다는 뜻이지 무기가 안 닿는다는 뜻이 아니다.)');
        console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
        await browser.close();
        process.exit(2);
    }
    // 임팩트 ±80ms 창 안에서만 본다 — 스윙 끝나고 팔이 늘어지며 스치는 건 타격 프레임이 아니다
    const win = out.frames.filter(f => Math.abs(f.t - out.impactT) <= 80);
    const winTouch = win.filter(f => f.dist !== null && f.dist <= 0);
    const winNear = win.filter(f => f.dist !== null).sort((a, b) => a.dist - b.dist)[0];
    console.log('  임팩트 창(+%d±80ms) %d프레임 중 접촉 %d프레임 · 창 내 최근접 +%sms %spx',
        out.impactT, win.length, winTouch.length, winNear && winNear.t, winNear && winNear.dist.toFixed(1));
    // ── 지적 ⓑ 의 문장 그대로를 재는 두 번째 잣대: "적 방향으로 뻗은 프레임이 세트에 없다" ──
    // 적은 화면 오른쪽이므로 '뻗음' = 무기 끝이 파지점보다 오른쪽(+x)으로 나간 정도.
    // 어깨 뒤 위에 세워 둔 대기 자세면 이 값이 대기 대조군을 못 넘는다.
    const reach = win.filter(f => f.tip && f.grip).map(f => ({ t: f.t, r: +(f.tip.x - f.grip.x).toFixed(1) }));
    const bestReach = reach.sort((a, b) => b.r - a.r)[0];
    const reachOk = bestReach && bestReach.r > out.idleReach;
    console.log('  창 내 무기 전방 도달: 최대 %spx(+%sms) vs 대기 자세 %spx → %s',
        bestReach && bestReach.r, bestReach && bestReach.t, out.idleReach,
        reachOk ? '적 쪽으로 뻗는다' : '대기 자세를 못 넘는다(어깨 뒤에 세워둔 채)');
    const verdict = winTouch.length > 0 && reachOk;
    console.log(`\n  판정: ${verdict ? 'PASS — 임팩트 프레임에 무기가 적 쪽으로 뻗어 닿는다(지적 ⓑ는 오지적)' :
        'FAIL — 임팩트 프레임에 무기가 적에 안 닿거나 적 쪽으로 뻗지 않는다(지적 ⓑ가 맞다)'}`);
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    await browser.close();
    process.exit(verdict && !errors.length ? 0 : 1);
})();
