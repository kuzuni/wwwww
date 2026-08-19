// 플린치 가산 층이 **실전 전투에서 새지 않는가** (hp-juicy ㉮·㉳ 의 회귀 방지선)
// 사용: node tools/probe-flinch-soak.js   (종료코드 0 = 통과)
//
// 왜 따로 두는가: `probe-flinch-visibility`·`probe-hero-flinch` 는 **얼린 무대**에서 프레임을 손으로
// 돌려 잰다. 그런데 가산 층의 진짜 위험은 얼린 무대가 아니라 **실전에서 누적되는 것**이다 —
// 적이 죽고 새로 스폰되고, 연출이 겹치고, 탭이 멈췄다 풀리는 20초 동안 되돌리기를 한 번이라도
// 놓치면 그 적은 **남은 판 내내 팔을 젖힌 채로 굳는다**(이 저장소는 플래시에서 같은 종류의 사고를
// 이미 겪었다 — 밝은 채로 굳은 적이 판 내내 하얗게 떴다).
//
// 그래서 이 도구는 아무것도 얼리지 않는다. **그냥 게임을 20초 돌리고** 남은 찌꺼기를 본다:
//   ⓐ 콘솔/페이지 에러 0
//   ⓑ 살아 있는 적 중 `_flinchOff`(되돌리지 않은 가산분)를 들고 있는 개체가 0
//     — 매 프레임 되돌렸다 다시 더하므로, 연출이 끝난 뒤에는 아무도 들고 있으면 안 된다.
//   ⓒ 적 몸통 회전이 기저값 근처에 있을 것(플린치가 누적되면 여기부터 부풀어 오른다)
//   ⓓ 영웅 피격 반동이 **감쇠하는가** — ⚠️ 스냅샷으로 `hitT == 0` 을 요구하면 안 된다(이 도구가
//     처음에 그렇게 짰다가 멀쩡한 코드를 반려했다: 20초 소크가 **마침 피격 직후에 끝나면** hitT 가
//     0.2 로 살아 있는 게 정상이다). 새 피격이 안 들어오게 전투를 세운 뒤 흘려서 0 이 되는지 본다.
//   ⓔ 씬 자식 수가 폭주하지 않을 것 — 연출 메시 누수의 조기 경보
// ⚠️ 20초는 '적이 여러 번 죽고 새로 스폰되는' 구간을 담기 위한 최소치다. 줄이면 사망 경로
//    (`killEnemy` 의 되돌리기)를 한 번도 안 타고 통과할 수 있다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const SOAK_MS = 20000;
const ROT_MAX = 0.45;      // 적 몸통 회전 상한(rad) — 종별 기저 기울기(G.lean 최대 0.1)+넉백 여유. 누적되면 이걸 넘는다
const CHILD_MAX = 400;     // 씬 자식 수 상한 — 실측 정상값 ≈103. 연출 메시가 새면 수백으로 부푼다

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 860 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 45000 });
    await page.waitForTimeout(SOAK_MS);

    const r = await page.evaluate(() => {
        const o = { enemies: 0, withOff: 0, maxRotZ: 0, maxRotX: 0, kills: 0, heroHitT: Scene3D.heroRig ? (Scene3D.heroRig.hitT || 0) : -1, children: Scene3D.scene.children.length, anims: Scene3D.anims.length };
        o.heroHitDur = Scene3D.heroRig ? (Scene3D.heroRig.hitDur || 0) : 0;
        for (const [, m] of Scene3D.enemyMap) {
            o.enemies++;
            if (m.dead) { o.kills++; continue; }              // 죽는 중인 개체는 별도로 센다
            if (m._flinchOff) o.withOff++;
            o.maxRotZ = Math.max(o.maxRotZ, Math.abs(m.g.rotation.z));
            o.maxRotX = Math.max(o.maxRotX, Math.abs(m.g.rotation.x));
        }
        return o;
    });
    // 전투를 세우고(새 피격 차단) 수명보다 넉넉히 흘려 반동이 실제로 꺼지는지 본다.
    const decayed = await page.evaluate(() => {
        Combat.tick = () => {};
        const real = Scene3D.update.bind(Scene3D);
        for (let i = 0; i < 90; i++) real(1 / 60);   // +1.5초
        const R = Scene3D.heroRig;
        let stuck = 0;
        for (const [, m] of Scene3D.enemyMap) if (m._flinchOff || (m.flinchT || 0) > 0) stuck++;
        return { heroHitT: R ? (R.hitT || 0) : -1, stuck };
    });

    let ok = true;
    const say = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) ok = false; };
    console.log(`  · ${SOAK_MS / 1000}초 실전 후 — 적 ${r.enemies}마리(사망 진행 ${r.kills}) · 씬 자식 ${r.children} · 대기 애니 ${r.anims}`);
    say(errors.length === 0, `ⓐ 콘솔/페이지 에러 0건 (실제 ${errors.length}건)`);
    say(r.withOff === 0, `ⓑ 되돌리지 않은 플린치 가산분을 든 적 0마리 (실제 ${r.withOff}마리)`);
    say(r.maxRotZ <= ROT_MAX && r.maxRotX <= ROT_MAX, `ⓒ 적 몸통 회전이 기저 근처 (최대 rotZ ${r.maxRotZ.toFixed(3)} · rotX ${r.maxRotX.toFixed(3)} <= ${ROT_MAX})`);
    say(r.heroHitT <= r.heroHitDur + 1e-6, `ⓓ-1 영웅 반동이 수명을 넘겨 쌓이지 않는다 (hitT ${r.heroHitT.toFixed(3)} <= 수명 ${r.heroHitDur})`);
    say(decayed.heroHitT === 0, `ⓓ-2 전투를 세우고 1.5초 흘리면 영웅 반동이 꺼진다 (hitT ${decayed.heroHitT})`);
    say(decayed.stuck === 0, `ⓓ-3 같은 조건에서 플린치가 남은 적 0마리 (실제 ${decayed.stuck}마리)`);
    say(r.children <= CHILD_MAX, `ⓔ 씬 자식 수가 정상 범위 (${r.children} <= ${CHILD_MAX})`);
    errors.slice(0, 5).forEach(e => console.log('  ! ' + e));
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
