// 스킬 발동 렉 판정기 — skill-cast-lag-optimize
// 렉의 본체는 실측상 두 가지였다:
//  ⑴ 연출이 PointLight 를 씬에 넣었다 빼서 라이트 '개수'가 출렁일 때마다 three 가 라이트 받는
//     재질 전체의 셰이더를 재컴파일 (프로그램 38→97개 폭증의 주범)
//  ⑵ 발동마다 같은 치수의 지오메트리(충격 링 토러스 등)를 새로 만들어 GPU 업로드 반복
// 대응(풀+공유 지오) 뒤 이 프로브는 다음을 판정한다:
//  A. 씬의 포인트라이트 개수가 스킬 난사 중에도 **상수**다 (accents 3 + fx 풀 4 = 7)
//  B. 셰이더 프로그램 수가 1차 난사 후 수렴한다 — 2차 난사에서 **한 개도 늘지 않는다**
//  C. 지오메트리 수가 난사를 반복해도 계단식으로 늘지 않는다 (2차 난사 후 ≤ 1차 난사 후 + 여유 2)
//  D. 콘솔 에러 0
// ⚠️ 함정 ③(TODO 상단): 헤드리스에서 rAF 는 못 믿는다 — 연출 배수는 한 evaluate 안에서
//    Combat.tick 차단 + Scene3D.update 수동 스텝으로 한다.
// 사용: node probe-skill-cast-lag.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('boot-loading') && typeof Scene3D !== 'undefined' && Scene3D.renderer, null, { timeout: 180000 });

    // 한 번의 evaluate 안에서: 전투 정지 → 스킬 fx 전종 난사 → 수동 스텝으로 연출 소화 → 계측.
    // setTimeout 기반 페이로드(2·3박, 낙뢰 연발)는 즉시 실행으로 바꿔 같은 동기 블록에서 태운다(함정 ④⑴).
    const volley = () => page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        const origTimeout = window.setTimeout;
        window.setTimeout = (fn, ms, ...a) => { try { typeof fn === 'function' && fn(...a); } catch (e) { console.error('immediate-timeout', e); } return 0; };
        const lightCounts = [];
        const countLights = () => { let n = 0; Scene3D.scene.traverse(o => { if (o.isPointLight) n++; }); return n; };
        try {
            const ids = Combat.enemies.filter(e => e.alive).map(e => e.id);
            const defs = Object.values(SKILL_DEFS);
            const seen = new Set();
            lightCounts.push(countLights());
            for (const d of defs) {
                if (seen.has(d.fx + '|' + d.type)) continue;
                seen.add(d.fx + '|' + d.type);
                Scene3D.skillEffect(d.fx, d.color, d.type === 'heal' || d.type === 'buff' ? [] : ids, d);
                lightCounts.push(countLights());
                Scene3D.update(1 / 60);
            }
            // 처치 플래시 계열도 발동 렉의 일부다 — 폭발 3연
            for (let i = 0; i < 3; i++) { Scene3D.explosion(new THREE.Vector3(i - 1, 0.5, 0), new THREE.Color(0xffaa33)); lightCounts.push(countLights()); }
            // 연출 소화: 수동 스텝 240프레임 + 잔여 강제 배수
            for (let i = 0; i < 240; i++) { Scene3D.update(1 / 60); if (i % 40 === 0) lightCounts.push(countLights()); }
            for (const a of Scene3D.anims.splice(0)) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (e) {} }
            for (let i = 0; i < 60; i++) Scene3D.update(1 / 60);
        } finally { window.setTimeout = origTimeout; }
        Scene3D.renderFrame();
        lightCounts.push(countLights());
        return {
            lights: { min: Math.min(...lightCounts), max: Math.max(...lightCounts) },
            programs: Scene3D.renderer.info.programs.length,
            geometries: Scene3D.renderer.info.memory.geometries,
        };
    });

    const v1 = await volley();
    const v2 = await volley();
    const v3 = await volley();
    console.log('1차 난사:', JSON.stringify(v1));
    console.log('2차 난사:', JSON.stringify(v2));
    console.log('3차 난사:', JSON.stringify(v3));

    const fail = [];
    for (const [i, v] of [v1, v2, v3].entries())
        if (v.lights.min !== v.lights.max) fail.push(`A: ${i + 1}차 난사 중 포인트라이트 개수 출렁임 ${v.lights.min}~${v.lights.max} (개수 변화 = 전면 재컴파일)`);
    if (v2.programs > v1.programs || v3.programs > v2.programs)
        fail.push(`B: 프로그램 수가 난사마다 는다 ${v1.programs}→${v2.programs}→${v3.programs} (발동 경로가 새 프로그램을 계속 만든다)`);
    if (v3.geometries > v2.geometries + 2)
        fail.push(`C: 지오메트리 수 계단식 증가 ${v1.geometries}→${v2.geometries}→${v3.geometries}`);
    if (errs.length) fail.push(`D: 콘솔 에러 ${errs.join(' | ')}`);

    if (fail.length) { console.log('FAIL\n - ' + fail.join('\n - ')); await browser.close(); process.exit(1); }
    console.log(`PASS — 라이트 개수 상수(${v1.lights.min}), 프로그램 수렴(${v1.programs}→${v3.programs}), 지오메트리 무증식, 콘솔 에러 0`);
    await browser.close();
})();
