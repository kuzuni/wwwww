// 영웅 피격 비네트의 정점 플래토·피크 알파 실측 (hp-juicy 지적 ⓖ / B #5).
//
// 지적: "비네트가 최대 강도로 60ms 이상 평평하다 — c1·c2 코너 픽셀이 **바이트 단위로 동일**.
//        플래토 ~30ms 로 줄이고 피크 알파 30% 낮출 것(풀스크린 자체는 사용자 지시라 유지)."
//
// 재는 법 — 코너 픽셀을 스크린샷으로 비교하지 않는다(그 방식은 '몇 ms 평평했나'를 못 준다).
// `#dmg-flash` 의 키프레임을 **음수 `animation-delay` 로 1ms 단위로 seek 해 정지**시키고
// `getComputedStyle().opacity` 를 직접 읽는다 — 플래토 길이가 ms 단위로 그대로 나온다.
// 세기(`--vig`)는 JS 가 피해 비율로 주므로, **실제 최대 피해 경로**(`UI.flashDamage(1)`)를 태워
// 코드가 주는 값 그대로를 잰다(상수를 프로브에 베끼지 않는다 — 자가 코드보다 낡는 함정).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const MAX_PLATEAU = 60;   // 정점 유지 상한 ms (권고 ~30ms + 프레임 여유)
const MAX_PEAK = 0.66;    // 피크 알파 상한 (권고 '30% 낮출 것' = 0.92 → 0.64)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.dmgFlash, null, { timeout: 20000 });
    await page.evaluate(() => { Scene3D.update = () => {}; });

    const out = await page.evaluate(() => {
        const el = UI.els.dmgFlash;
        UI.flashDamage(1);                       // 최대 피해 — 코드가 주는 --vig 를 그대로 받는다
        const vig = +getComputedStyle(el).getPropertyValue('--vig');
        const cs = getComputedStyle(el);
        const dur = parseFloat(cs.animationDuration) * 1000;
        el.style.animationPlayState = 'paused';
        const samples = [];
        for (let t = 0; t <= dur; t += 1) {
            el.style.animationDelay = (-t / 1000) + 's';
            samples.push({ t, o: +getComputedStyle(el).opacity });
        }
        return { vig, dur, samples, bg: getComputedStyle(el).backgroundImage.slice(0, 60) };
    });

    const peak = Math.max(...out.samples.map(s => s.o));
    const flat = out.samples.filter(s => s.o >= peak * 0.99);
    const plateau = flat.length ? flat[flat.length - 1].t - flat[0].t : 0;
    const riseTo = flat.length ? flat[0].t : null;
    console.log('== 영웅 피격 비네트 정점 플래토 실측 (지적 ⓖ / B #5) ==');
    console.log('  코드가 준 --vig=%s · 애니메이션 길이 %sms', out.vig, out.dur);
    for (const s of out.samples.filter(s => s.t % 20 === 0)) {
        const bar = '█'.repeat(Math.round(s.o * 40));
        console.log(`  +${String(s.t).padStart(3)}ms  opacity ${s.o.toFixed(3)} ${bar}`);
    }
    console.log('\n  피크 알파 %s (상한 %s) · 정점 도달 +%sms · **정점 플래토 %sms** (상한 %sms)',
        peak.toFixed(3), MAX_PEAK, riseTo, plateau, MAX_PLATEAU);
    const okPeak = peak <= MAX_PEAK, okFlat = plateau <= MAX_PLATEAU;
    console.log('  피크 %s · 플래토 %s', okPeak ? '✓' : '✗', okFlat ? '✓' : '✗');
    const pass = okPeak && okFlat;
    console.log(`\n  판정: ${pass ? 'PASS — 비네트가 때린 순간에 터지고 곧장 빠진다' : 'FAIL — 정점이 오래 평평하거나 너무 진하다(지적 ⓖ가 맞다)'}`);
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    await browser.close();
    process.exit(pass && !errors.length ? 0 : 1);
})();
