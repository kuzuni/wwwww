// 비평가 5차 지적 ⓑ(A #3) 교차검증 — "임팩트 프레임에 무기가 적에 닿아 있지 않다.
// a1·a4 모두 곤봉이 **어깨 뒤 위**에 세워져 있고 적 방향으로 뻗은 프레임이 세트에 없다."
//
// 🚨 **착수 전 반드시 이 프로브를 돌릴 것.** 같은 프레임·같은 판독 방식으로 나온 A #1
//    ("스파크가 공격자 몸에 붙어 있다")은 5차에서 **실측으로 기각**됐다 — 채점자 2인이
//    독립적으로 같은 결론을 냈지만 둘 다 휘도 임계값 군집을 썼고, 이 게임 영웅은 은색 판금
//    갑옷이라 평상시에도 near-white 라 오검출이었다. 그래서 ⓑ도 **휘도가 아니라 무기 메시의
//    월드 좌표를 투영**해 잰다(`probe-spark-anchor.js` 와 같은 방식).
//
// 재는 것: 공격 클립을 0.016초 서브스텝으로 돌리며 프레임마다
//   ⒜ 무기 끝(weaponG 바운딩박스의 자루 반대쪽 끝)의 화면 좌표
//   ⒝ 적 실루엣 bbox
//   ⒞ 둘 사이 거리(겹치면 음수) — **한 프레임이라도 접촉하는가**
//   ⒟ 그 프레임이 임팩트(데미지 적용) 시각과 얼마나 떨어져 있는가
// 판정: 임팩트 ±80ms 안에 무기 끝이 적 bbox 에 닿는(거리 ≤ 0) 프레임이 하나도 없으면 지적이 맞다.
//
// 🚨🚨 **이 프로브는 아직 완성이 아니다 — 전제(스윙이 실제로 돌았는가)를 못 세웠다.**
// 2026-08-18 3D 세션이 여기까지 만들어 놓고 인계한다. 지금 상태로 돌리면 **'측정 불가'로 끊긴다.**
// 남은 숙제는 아래 두 가지이고, 그 전에는 ⓑ 에 대해 어떤 결론도 내지 말 것:
//  ㉠ `S.heroAttack(e.id)` 를 불러도 `heroRig.state.clip` 이 undefined 로 읽히고 **적 HP 가 안 깎인다**
//     (=임팩트 프레임을 못 짚는다). 무기 끝 이동폭도 60프레임 내내 x 167~196 뿐이라 대기 호흡 수준이다.
//     `heroAttack` 이 실제로 스윙을 몰려면 어떤 전제(사거리·쿨다운·`Combat` 상태)가 필요한지 먼저 확인할 것.
//  ㉡ 강제 호출과 **실전투가 동시에 돈다** — 측정 도중 적이 죽고 다음 적이 들어와 bbox 가 통째로
//     점프한다(+351ms 에 291→169). 전투를 얼리고 스윙만 태우거나, 클립 진행을 수동 구동할 것.
// ⚠️ 첫 판은 `heroPlay('attack')` 로 태웠는데 그런 이름의 클립이 없어 **아무 일도 안 일어난 채**
//    '닿는 프레임 0개 → 지적이 맞다'는 판정을 냈다. 스윙을 안 시켜 놓고 낸 판정이다.
//    그래서 아래에 **전제 검사**를 박았다 — 전제가 안 서면 수치를 인쇄하되 **판정은 내지 않는다**
//    (`probe-techoverview-dom` 계열이 쓰는 '측정기 고장이면 exit 2' 규약과 같다).
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

    const out = await page.evaluate(() => {
        const S = Scene3D;
        const step = (dt) => { S.update(dt); if (typeof Combat.update === 'function') Combat.update(dt); };

        // 메시 정점을 월드로 옮겨 화면 bbox 를 낸다(휘도 판독 금지 — 위 주석 참조)
        const screenBox = (obj) => {
            if (!obj) return null;
            const box = new THREE.Box3().setFromObject(obj);
            if (box.isEmpty()) return null;
            const pts = [];
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
                pts.push(S.project(new THREE.Vector3(x, y, z)));
            }
            return [Math.min(...pts.map(p => p.x)), Math.min(...pts.map(p => p.y)),
                    Math.max(...pts.map(p => p.x)), Math.max(...pts.map(p => p.y))].map(v => +v.toFixed(1));
        };
        // 무기 '끝' = weaponG 로컬 바운딩박스에서 파지점(원점)에서 가장 먼 꼭짓점
        const weaponTip = () => {
            const w = S.weaponG;
            if (!w) return null;
            const box = new THREE.Box3().setFromObject(w);
            if (box.isEmpty()) return null;
            const grip = w.getWorldPosition(new THREE.Vector3());
            let best = null, bestD = -1;
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
                const v = new THREE.Vector3(x, y, z), d = v.distanceTo(grip);
                if (d > bestD) { bestD = d; best = v; }
            }
            return { world: best, screen: S.project(best), len: +bestD.toFixed(3) };
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
        const m = Scene3D.enemyMap.get(e.id);
        const frames = [];
        let impactT = null;
        const hp0 = e.hp && e.hp.toNumber ? e.hp.toNumber() : null;
        let lastHp = hp0;

        // 🚨 **`heroPlay('attack')` 로 태우면 안 된다(첫 판에서 밟았다).** 그건 클립 이름 후보를
        //    받는 저수준 API 라 'attack' 이라는 이름의 클립이 없어 아무 일도 안 일어났고,
        //    무기 끝이 60프레임 내내 x 167~197 에서 거의 안 움직였는데도 프로브는 '닿는 프레임 0개'
        //    라며 **지적이 맞다는 결론**을 냈다 — 스윙을 한 번도 안 시켜 놓고 낸 판정이다.
        //    실제 스윙은 `Scene3D.heroAttack(targetId)` 가 팔 애니메이션까지 통째로 몬다.
        S.heroAttack(e.id);
        for (let i = 0; i < 60; i++) {
            const t = +(i * 16.7).toFixed(0);
            const tip = weaponTip(), ebox = screenBox(m.g);
            const hp = e.hp && e.hp.toNumber ? e.hp.toNumber() : null;
            if (impactT === null && hp !== null && lastHp !== null && hp < lastHp) impactT = t;
            lastHp = hp;
            frames.push({
                t,
                tip: tip && { x: +tip.screen.x.toFixed(1), y: +tip.screen.y.toFixed(1), len: tip.len },
                enemy: ebox,
                dist: tip && ebox ? +distToBox(tip.screen, ebox).toFixed(1) : null,
            });
            step(0.0167);
        }
        return { frames, impactT, clip: S.heroRig && S.heroRig.state && S.heroRig.state.clip };
    });

    console.log('== 임팩트 프레임 무기 접촉 실측 (지적 ⓑ / A #3 교차검증) ==');
    console.log('  클립=%s  데미지 적용 시각=%s', out.clip, out.impactT === null ? '(구간 내 없음)' : '+' + out.impactT + 'ms');
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
    const xs = out.frames.filter(f => f.tip).map(f => f.tip.x);
    const ys = out.frames.filter(f => f.tip).map(f => f.tip.y);
    const travel = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) : 0;
    // 적 bbox 가 도중에 크게 점프하면 표적이 바뀐 것(적이 죽고 다음 적이 들어옴)
    let jump = 0;
    for (let i = 1; i < out.frames.length; i++) {
        const a = out.frames[i - 1].enemy, b = out.frames[i].enemy;
        if (a && b) jump = Math.max(jump, Math.abs(b[0] - a[0]));
    }
    const preOk = out.impactT !== null && travel >= 120 && jump < 40;
    console.log('\n  전제: 임팩트 시각 %s · 무기끝 이동폭 %spx(≥120 필요) · 표적 점프 %spx(<40 필요)',
        out.impactT === null ? '없음(✗)' : '+' + out.impactT + 'ms(✓)',
        travel.toFixed(0), jump.toFixed(0));
    if (!preOk) {
        console.log('\n  ⚠️ 측정 불가 — 스윙 전제가 안 섰다. **이 실행으로는 ⓑ를 판정하지 않는다.**');
        console.log('     (파일 머리의 남은 숙제 ㉠㉡ 를 먼저 해결할 것. 전제 없이 나온 "닿는 프레임 0개"는');
        console.log('      스윙을 안 시켰다는 뜻이지 무기가 안 닿는다는 뜻이 아니다.)');
        console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
        await browser.close();
        process.exit(2);
    }
    const verdict = touching.length > 0;
    console.log(`\n  판정: ${verdict ? 'PASS — 무기가 적에 닿는 프레임이 실재한다(지적 ⓑ는 오지적)' :
        'FAIL — 스윙 전 구간에서 무기가 적에 안 닿는다(지적 ⓑ가 맞다)'}`);
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    await browser.close();
    process.exit(errors.length ? 1 : 0);
})();
