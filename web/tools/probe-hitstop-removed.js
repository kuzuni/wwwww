// 히트스톱 제거 검증 (skill-cast-lag-optimize 재오픈, 사용자 지시 "데미지 들어갈 때마다 일부러
// 시간 멈춘 거면 그것도 없애라"): 스킬·타격 난사 중 씬 dt 가 0 으로 얼어붙는 프레임이 **0%** 여야 한다.
//  ① Scene3D.update 를 래핑해 실제 rAF 루프가 넘기는 dt 를 전부 기록
//  ② 전투를 살린 채(적 스폰·피격·처치) 에픽~미식 스킬 이펙트 + 크리 타격을 난사
//  ③ dt===0 프레임 비율 0% · _clock 이 난사 구간에서 계속 전진 · hitStop 메커니즘 부재 · 콘솔 0
// (제거 전 이 시나리오는 크리 0.045s·처치 0.045~0.07s·스킬 0.035~0.09s 정지가 촘촘히 겹쳐
//  dt=0 프레임이 상당 비율로 나왔다 — 그게 사용자가 본 '씬만 멈추는 렉'이다.)
// 사용: node probe-hitstop-removed.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [], fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });

    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.scene, null, { timeout: 60000 });
    await page.waitForTimeout(600);

    await page.evaluate(() => {
        window.__dts = [];
        const orig = Scene3D.update.bind(Scene3D);
        Scene3D.update = dt => { window.__dts.push(dt); return orig(dt); };
    });

    // 난사: 크리 타격 + 처치 + 등급별 스킬 이펙트를 1.6초간 겹쳐 쏜다 (전투 루프는 살아 있는 채로)
    await page.evaluate(() => {
        window.__clock0 = Scene3D._clock;
        const defs = Object.values(SKILL_DEFS);
        let n = 0;
        window.__spam = setInterval(() => {
            n++;
            const e = Combat.enemies.find(x => x.alive);
            if (e) Combat.damageEnemy(e, Big.of(n % 3 ? 240 : 99999), true, null); // 크리 연타 + 주기적 처치
            const d = defs[n % defs.length];
            const ids = Combat.enemies.filter(x => x.alive).map(x => x.id);
            Scene3D.skillEffect(d.fx, d.color, d.type === 'heal' || d.type === 'buff' ? [] : ids, d);
        }, 90);
    });
    await page.waitForTimeout(3500); // swiftshader 헤드리스는 ~8fps — 표본 확보용으로 길게 돌린다
    const r = await page.evaluate(() => {
        clearInterval(window.__spam);
        const dts = window.__dts;
        const zero = dts.filter(d => d === 0).length;
        return {
            frames: dts.length, zero,
            clockAdvance: Scene3D._clock - window.__clock0,
            hitStopType: typeof Scene3D.hitStop, hitStopField: Scene3D._hitStop,
        };
    });

    ok(r.frames >= 15, `표본 프레임이 너무 적다 (${r.frames})`); // swiftshader 헤드리스 실측 ~5fps 대역
    ok(r.zero === 0, `난사 중 dt=0 프레임 ${r.zero}/${r.frames} — 히트스톱이 되살아났다`);
    // rAF dt 는 상한(≈0.1s)으로 잘리므로 벽시계 3.5s 전부는 못 채운다 — 프레임 수 × 상한의 절반이면 전진 중
    ok(r.clockAdvance > r.frames * 0.03, `난사 구간에서 씬 시계가 ${r.clockAdvance.toFixed(2)}s 만 전진(${r.frames}프레임) — 어딘가 dt 를 먹고 있다`);
    ok(r.hitStopType === 'undefined' && !r.hitStopField, `히트스톱 메커니즘 잔존 (hitStop=${r.hitStopType}, _hitStop=${r.hitStopField})`);
    console.log(`프레임 ${r.frames} · dt=0 ${r.zero}건(${(r.zero / r.frames * 100).toFixed(1)}%) · 씬 시계 전진 ${r.clockAdvance.toFixed(2)}s · hitStop=${r.hitStopType}`);

    for (const f of fails) console.log('FAIL —', f);
    for (const e of errs.slice(0, 5)) console.log('콘솔 에러 —', e);
    console.log(fails.length || errs.length ? `실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건` : 'PASS — 난사 중 dt=0 프레임 0%, 히트스톱 완전 제거');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
