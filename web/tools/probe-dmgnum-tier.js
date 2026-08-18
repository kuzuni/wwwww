// 데미지 숫자 3티어 위계 실측 (hp-juicy 지적 ⓒ / A #8 · B #3).
//
// 지적: "크리 `320`(42px 주황)과 처치 `10.00K`(40px 같은 주황)가 동급 — 처치에 고유 위계가 없다."
// 코드에서도 확인됐다: `hitEnemy` 의 `cls` 가 skill/crit/일반 셋뿐이라 **마지막 한 방이 크리와
// 완전히 같은 클래스로 태어났다**(처치타라는 사실이 연출 쪽에 전달조차 안 됐다).
//
// 재는 법 — 세 티어를 같은 텍스트·같은 `--pop` 으로 나란히 띄우고, CSS 애니메이션을
// `animation-delay` 음수값으로 **원하는 시각에 정지 시킨(seek)** 다음 프레임의
//   ⒜ 실제 렌더 크기(`getBoundingClientRect`, transform scale 이 반영된 값)
//   ⒝ 채움 색 / 글로우(text-shadow) 반경
// 을 읽는다. 시계에 의존하지 않으므로 헤드리스에서도 프레임이 흔들리지 않는다.
// 판정: 스폰 프레임과 피크 프레임 **양쪽에서** 처치 > 크리 > 일반 순서가 서고,
//       처치와 크리가 색·크기 중 **적어도 두 축**에서 갈리면 PASS.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const TIERS = [['일반', 'dmg'], ['크리', 'dmg-crit'], ['처치', 'dmg-kill']];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.fxLayer, null, { timeout: 20000 });
    await page.evaluate(() => { Scene3D.update = function () {}; });   // 렌더 루프 정지(캡처 규약)

    const read = await page.evaluate((TIERS) => {
        const layer = Scene3D.fxLayer;
        // 세 티어를 서로 멀리 떨어뜨려 슬롯 회피·겹침이 크기 측정에 안 섞이게 한다
        const els = TIERS.map(([, cls], i) => {
            const el = document.createElement('div');
            el.className = 'float-dmg ' + cls;
            el.textContent = '10.00K';
            el.style.left = (60 + i * 140) + 'px';
            el.style.top = '400px';
            el.style.setProperty('--pop', '1');
            el.style.setProperty('--dx', '0px');
            el.style.setProperty('--rise', '-42px');
            layer.appendChild(el);
            return el;
        });
        const at = (sec) => els.map(el => {
            el.style.animationPlayState = 'paused';
            el.style.animationDelay = (-sec) + 's';
            const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
            return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), color: cs.color, font: cs.fontSize,
                     shadow: cs.textShadow.length, opacity: +cs.opacity };
        });
        // 0s = 태어나는 프레임(임팩트 프레임), 0.04s ≈ 7~9% = 각 티어의 펀치 피크
        const spawn = at(0), peak = at(0.04);
        els.forEach(el => el.remove());
        return { spawn, peak };
    }, TIERS);

    // ── 통합 확인: 실제 전투 경로에서 마지막 한 방에만 dmg-kill 이 붙는가 ──
    // 스타일만 있고 아무도 그 클래스를 안 붙이면 위계는 종이 위에서만 성립한다. `Combat.damageEnemy`
    // 는 hp 를 깎은 직후 `hitEnemy(..., kill)` 을 부르므로, 소액 타격 → 마무리 타격 순으로 태워
    // **앞 것에는 안 붙고 뒤 것에만 붙는지**를 본다.
    await page.goto(INDEX + '?enemy=golem', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Combat !== 'undefined' && Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    // ⚠️ waitForFunction 이 참을 돌려준 뒤에도 전투는 계속 돌아 그 사이 적이 죽는다(앞 세션이
    //    같은 함정을 밟았다 — 항목 메모 ㉣). 살아 있는 적이 잡힐 때까지 evaluate 안에서 다시 확인한다.
    await page.waitForFunction(() => Combat.enemies && Combat.enemies.some(e => e.alive), null, { timeout: 20000 });
    const live = await page.evaluate(() => {
        const e = Combat.enemies.find(x => x.alive);
        if (!e) return { err: '살아 있는 적 없음' };
        Scene3D.update = function () {};
        e.hp = Big.of(e.maxHp);
        Scene3D.fxLayer.innerHTML = '';
        Combat.damageEnemy(e, Big.of(e.maxHp).mul(0.2), false, null);        // 소액
        const after1 = [...Scene3D.fxLayer.children].map(el => el.className);
        Combat.damageEnemy(e, Big.of(e.maxHp).mul(5), false, null);          // 마무리
        const after2 = [...Scene3D.fxLayer.children].map(el => el.className);
        return { after1, after2, alive: e.alive };
    });
    if (live.err) { console.log('\n  실전 경로 측정 불가 — ' + live.err); await browser.close(); process.exit(2); }
    const killClasses = live.after2.filter(c => c.includes('dmg-kill'));
    console.log('\n  실전 경로: 소액 타격 뒤 클래스 %j · 마무리 뒤 %j · 적 생존 %s',
        live.after1, live.after2, live.alive);
    const liveOk = live.after1.every(c => !c.includes('dmg-kill')) && killClasses.length === 1 && live.alive === false;
    console.log('  마지막 한 방에만 dmg-kill: %s', liveOk ? '✓' : '✗');

    const rgb = (s) => (s.match(/\d+/g) || []).slice(0, 3).map(Number);
    const lum = (s) => { const [r, g, b] = rgb(s); return +(0.299 * r + 0.587 * g + 0.114 * b).toFixed(1); };
    console.log('== 데미지 숫자 3티어 위계 (지적 ⓒ / A #8 · B #3) ==');
    for (const key of ['spawn', 'peak']) {
        console.log('  %s 프레임:', key === 'spawn' ? '스폰(임팩트)' : '피크(+40ms)');
        read[key].forEach((r, i) => console.log(`    ${TIERS[i][0].padEnd(3)} 렌더 폭 ${String(r.w).padStart(6)}px · 높이 ${String(r.h).padStart(5)}px · font ${r.font} · 채움 ${r.color}(명도 ${lum(r.color)}) · 글로우 ${r.shadow}자`));
    }
    const w = (k) => read[k].map(r => r.w);
    const ordered = (a) => a[2] > a[1] && a[1] > a[0];
    const okSpawn = ordered(w('spawn')), okPeak = ordered(w('peak'));
    // 크리와 처치가 갈리는 축이 둘 이상인가 — 지적의 핵심은 '같은 주황·같은 크기'였다
    const crit = read.spawn[1], kill = read.spawn[2];
    const axes = [];
    if (Math.abs(kill.w - crit.w) / crit.w > 0.08) axes.push('크기');
    if (Math.abs(lum(kill.color) - lum(crit.color)) > 25) axes.push('채움 명도');
    if (Math.abs(kill.shadow - crit.shadow) > 8) axes.push('글로우');
    console.log('\n  스폰 프레임 크기 순서 처치>크리>일반: %s (%s)', okSpawn ? '✓' : '✗', w('spawn').join(' < '));
    console.log('  피크 프레임 크기 순서 처치>크리>일반: %s (%s)', okPeak ? '✓' : '✗', w('peak').join(' < '));
    console.log('  처치가 크리와 갈리는 축: %s (2축 이상 필요)', axes.length ? axes.join('·') : '없음');
    const pass = okSpawn && okPeak && axes.length >= 2 && liveOk;
    console.log(`\n  판정: ${pass ? 'PASS — 처치타가 크리와 다른 티어로 읽힌다' : 'FAIL — 처치타가 크리와 동급이거나 실전 경로에서 클래스가 안 붙는다(지적 ⓒ가 맞다)'}`);
    console.log(errors.length ? 'CONSOLE ERRORS: ' + errors.join(' | ') : '(no console errors)');
    await browser.close();
    process.exit(pass && !errors.length ? 0 : 1);
})();
