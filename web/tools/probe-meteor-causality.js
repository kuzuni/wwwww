// 운석 세례 — **낙하와 지상 폭발이 인과로 붙는가** + 낙하체가 트레일을 끄는가 (slug: skill-fx ㉣)
//
// 비평가 2차 2인 일치 지적 ㉣: "낙하체가 무회전·무트레일 납작 다각형이고 **낙하와 지상 폭발이
// 인과로 안 붙는다(폭발 시각에 운석이 아직 상공)**".
//
// 원인(2026-08-20 3D 스트림 실측): `skillPayload` 가 `skillImpactWeight`(화면 플래시·FOV 펀치·
// 큰 셰이크 = 연출의 '무게') 를 **하드코딩 340ms** 뒤에 태운다. 이 340 은 운석이 타깃당 1발이고
// 조준 링이 없던 시절의 낙하 0.35초에서 온 값이다. 그 뒤 `METEOR_TELL_MS: 200`(조준 링 예고)이
// 생기면서 **첫 착탄이 540ms 로 밀렸는데 무게는 340 에 그대로 남았다** — 즉 무게가 첫 돌보다
// 200ms 먼저 터진다. 다른 fx 는 전부 `*_IMPACT_MS` 상수를 두고 "skillImpactWeight 지연과 동기"
// 라고 적어 두었는데 메테오만 그 규약 밖에 있었다.
//
// 판정:
//   ① **무게는 어떤 착탄과도 60ms 이상 어긋나면 안 된다** — 무게 발화 시각이 착탄 시각 중
//      하나와 ±60ms 안에서 만나야 '저 돌이 저걸 터뜨렸다'로 읽힌다.
//   ② **무게 시각에 이미 착탄한 돌이 하나라도 있어야 한다** — 전부 상공이면 지적 그대로다.
//   ③ **무게 시각에 살아 있는 돌의 최저 높이 > 1.0** 이면 "폭발 시각에 운석이 아직 상공"의
//      직접 증거다(음성 대조 축 — 고친 뒤에는 무게가 착탄과 붙으므로 이 축이 무의미해진다).
//   ④ 낙하체가 **트레일을 끈다**: 돌 하나당 남기는 꼬리 오브젝트가 6개 이상이고,
//      그 위치가 돌보다 **뒤(위·주인공 쪽)** 에 놓인다(진행 방향 반대).
//   ⑤ 콘솔 에러 0건.
//
// ⚠️ 계측 함정(TODO 함정 ③④): rAF 가 안 도는 헤드리스라 벽시계 setTimeout 을 그대로 두면
//    예약이 전부 뭉개진다. `virtual-clock.js` 심을 걸어 **가상 시각**으로 예약을 발화시키고,
//    같은 가상 시각으로 `Scene3D.update(dt)` 를 몰아 두 축(예약/애니)을 한 시계에 묶는다.
//
// 사용: node probe-meteor-causality.js  [--selftest]
//   --selftest = 무게 지연을 옛 하드코딩 340ms 로 되돌려 재는 **음성 대조**(FAIL 이 나야 정상).
//   ⚠️ 정직하게 적어 둔다 — 음성 대조가 되돌리는 건 **인과 축(①②③)뿐**이다. 꼬리 축(④)은
//      되돌리는 손잡이를 안 만들었으므로 selftest 에서도 PASS 로 남는다. ④ 의 음성 근거는
//      **교정 전 본 코드의 실측**이다: 꼬리가 `riseParticle`(0.06 구, 위로 상승)이라 이 판정기가
//      세는 `meteorTrail` 오브젝트가 **발별 0,0,0,0,0,0,0 개**였다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { VCLOCK_SRC } = require('./virtual-clock.js');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SELFTEST = process.argv.includes('--selftest');
const STEP = 10;         // 가상 프레임 간격(ms)
const SPAN = 1600;       // 관측 창(ms) — 미식 9발이 다 떨어지고도 남는다
const NEAR_MS = 60;      // ① 허용 어긋남

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX);
    for (let w = 0; ; w++) {
        const ready = await page.evaluate('typeof Scene3D !== "undefined" && !!Scene3D.scene && !!Scene3D.heroG').catch(() => false);
        if (ready) break;
        if (w >= 120) throw new Error('게임 부팅 대기 60초 초과');
        await new Promise(r => setTimeout(r, 500));
    }
    await page.evaluate(VCLOCK_SRC);

    const res = await page.evaluate(({ STEP, SPAN, SELFTEST }) => {
        Scene3D.anims.length = 0;
        const rocks = [];       // { obj, born, y0, impact, trail:[{t,pos}] }
        let weightAt = null;
        const trailTypes = ['meteorTrail'];

        // 무게 층 발화 시각을 가상 시각으로 잡는다
        const realWeight = Scene3D.skillImpactWeight.bind(Scene3D);
        // **첫 발화만** 잡는다. 음성 대조에서는 옛 배선(340ms)과 새 배선(마지막 착탄)이 둘 다
        // 돌아 무게가 두 번 터지는데, 덮어쓰면 늦은 쪽이 남아 옛 배선이 통과해 버린다.
        // 판정 대상은 '무게가 처음 터지는 순간'이다.
        Scene3D.skillImpactWeight = function (...a) { if (weightAt === null) weightAt = VClock._now; return realWeight(...a); };

        // 씬 add 훅 — 돌과 꼬리를 생성 순간에 잡는다
        const realAdd = Scene3D.scene.add.bind(Scene3D.scene);
        Scene3D.scene.add = function (...objs) {
            for (const o of objs) {
                const u = o && o.userData;
                if (!u) continue;
                if (u.meteorRock) rocks.push({ obj: o, born: VClock._now, y0: o.position.y, impact: null, trail: [] });
                else if (trailTypes.some(k => u[k])) {
                    // ⚠️ **'가장 최근에 생긴 돌' 로 귀속시키면 안 된다** (2026-08-20 실측으로 밟았다).
                    //    운석은 시차로 쏟아지므로 낙하 구간이 겹친다 — 1번 돌의 꼬리가 5번 돌
                    //    것으로 세어져 '발별 3,5,8,10,14,10,27' 처럼 총합만 맞고 분포가 엉킨다
                    //    (총합 77 = 7발 × 11마디로 코드는 멀쩡했다). **자리로 귀속시킨다.**
                    let best = null, bd = Infinity;
                    for (const r of rocks) {
                        if (r.impact !== null || !r.obj.parent) continue;      // 날고 있는 돌만
                        const d = r.obj.position.distanceTo(o.position);
                        if (d < bd) { bd = d; best = r; }
                    }
                    if (best) best.trail.push({ t: VClock._now, pos: o.position.clone(), rock: best.obj.position.clone() });
                }
            }
            return realAdd(...objs);
        };

        VClock.install();
        // 실전 경로 그대로 — 살아 있는 적 전부를 타깃으로 레전더리 메테오
        const ids = [...Scene3D.enemyMap.keys()];
        if (SELFTEST) {
            // 음성 대조: 옛 하드코딩(340ms) 배선을 되살린다
            const realPayload = Scene3D.skillPayload.bind(Scene3D);
            Scene3D.skillPayload = function (fx, color, targetIds, tier, scene) {
                if (fx === 'meteor' && tier !== undefined) {
                    const t = tier;
                    setTimeout(() => Scene3D.skillImpactWeight(fx, color, targetIds, t), 340);
                    Scene3D.meteorStorm(targetIds, color, t || 0);
                    return;
                }
                return realPayload(fx, color, targetIds, tier, scene);
            };
        }
        Scene3D.skillEffect('meteor', 0xff7043, ids, { rarity: 'legendary' });

        // 가상 시각을 STEP 씩 흘린다 — 예약(pump)과 애니(update)를 같은 시계에 묶는다
        for (let t = 0; t <= SPAN; t += STEP) {
            VClock.pump(t);
            Scene3D.update(STEP / 1000);
            for (const r of rocks) if (r.impact === null && !r.obj.parent) r.impact = t;
        }
        // 무게 시각에 살아 있던 돌의 최저 높이 — 재현하려면 다시 굴려야 하므로 기록해 둔 궤적으로 계산
        VClock.restore();
        Scene3D.scene.add = realAdd;
        Scene3D.skillImpactWeight = realWeight;

        return {
            weightAt,
            impacts: rocks.map(r => r.impact),
            born: rocks.map(r => r.born),
            y0: rocks.map(r => r.y0),
            trailCounts: rocks.map(r => r.trail.length),
            // 꼬리가 돌보다 뒤(위·낮은 x)에 놓이는가 — 진행 방향은 +x/−y
            trailBehind: rocks.map(r => {
                let ok = 0;
                for (const s of r.trail) if (s.pos.y >= s.rock.y - 0.02 && s.pos.x <= s.rock.x + 0.02) ok++;
                return { n: r.trail.length, behind: ok };
            }),
            fallMs: Scene3D.METEOR_FALL_S * 1000,
            tellMs: Scene3D.METEOR_TELL_MS,
        };
    }, { STEP, SPAN, SELFTEST });

    // ── 판정 ────────────────────────────────────────────────────────────────
    const imp = res.impacts.filter(v => v !== null);
    const W = res.weightAt;
    const nearest = imp.length && W !== null ? imp.reduce((b, v) => Math.abs(v - W) < Math.abs(b - W) ? v : b, imp[0]) : null;
    const gap = nearest === null ? Infinity : Math.abs(nearest - W);
    const landedByWeight = imp.filter(v => v <= W).length;
    // ③ 무게 시각의 최저 돌 높이 — 낙하는 start.y(6.6) → 0 을 k² 로 보간한다(코드와 같은 식)
    let minY = Infinity;
    res.born.forEach((b, i) => {
        const impact = res.impacts[i];
        if (impact === null || W === null) return;
        if (W < b || W > impact) return;                 // 그 시각에 날고 있던 돌만
        const k = Math.max(0, Math.min(1, (W - b) / res.fallMs));
        const y = res.y0[i] * (1 - k * k);
        if (y < minY) minY = y;
    });

    const trailMin = res.trailCounts.length ? Math.min(...res.trailCounts) : 0;
    const behindBad = res.trailBehind.filter(t => t.n > 0 && t.behind / t.n < 0.8).length;

    const checks = [
        ['① 무게가 어떤 착탄과 ±' + NEAR_MS + 'ms 안에서 만난다', gap <= NEAR_MS, `무게 ${W}ms · 가장 가까운 착탄 ${nearest}ms · 어긋남 ${gap}ms`],
        ['② 무게 시각에 이미 착탄한 돌이 있다', landedByWeight >= 1, `착탄 완료 ${landedByWeight}/${imp.length}발 (착탄 ${imp.join(',')}ms)`],
        ['③ 무게 시각에 상공에 떠 있는 돌의 최저 높이 ≤ 1.0', !(minY > 1.0), minY === Infinity ? '그 시각에 나는 돌 없음(=이미 착탄, 정상)' : `최저 y=${minY.toFixed(2)}`],
        ['④ 돌 하나당 꼬리 6개 이상 · 80% 이상이 진행 방향 뒤', trailMin >= 6 && behindBad === 0, `꼬리 최소 ${trailMin}개 · 방향 불량 ${behindBad}발 (발별 ${res.trailCounts.join(',')})`],
        ['⑤ 콘솔 에러 0건', errors.length === 0, errors.slice(0, 3).join(' | ') || '없음'],
    ];
    console.log(`운석 인과 판정 ${SELFTEST ? '[음성 대조 — FAIL 이 나야 정상]' : ''}`);
    console.log(`  예고 ${res.tellMs}ms + 낙하 ${res.fallMs}ms → 첫 착탄 기대 ${res.tellMs + res.fallMs}ms · 돌 ${res.impacts.length}발`);
    let pass = true;
    for (const [name, ok, detail] of checks) {
        console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
        if (!ok) pass = false;
    }
    await browser.close();
    if (SELFTEST) {
        console.log(pass ? '\n음성 대조 실패 — 옛 배선인데도 통과했다(자가 고장)' : '\n음성 대조 OK — 옛 배선은 제대로 FAIL 한다');
        process.exit(pass ? 1 : 0);
    }
    console.log(pass ? '\nPASS' : '\nFAIL');
    process.exit(pass ? 0 : 1);
})();
