// 데미지 숫자 궤적 실측 — 비평가 4차 지적 ⓑ("상승 거리 190~250px로 과해 상단 HUD까지 올라간다") 교차검증.
// 사용: node probe-dmgnum.js
// 스폰 y(슬롯 회피 포함)와 CSS 애니메이션이 실제로 옮기는 거리를 **분리해서** 잰다 —
// 둘을 합친 값만 보면 어느 쪽을 줄여야 하는지 알 수 없다. HUD 침범은 상단 밴드와의 겹침으로 판정.
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

    const out = await page.evaluate(() => {
        Combat.tick = () => {};
        Scene3D.walking = false;
        const real = Scene3D.update.bind(Scene3D);
        Scene3D.__t = 0;
        Scene3D.update = () => {};
        window.__step = (total) => {
            const n = Math.max(1, Math.round(total * 120));
            for (let i = 0; i < n; i++) { Scene3D.__t += 1 / 120; real(1 / 120); }
            for (const el of [...Scene3D.fxLayer.children]) {
                if (el.__born === undefined) { el.__born = Scene3D.__t; el.remove = () => {}; }
                const age = Scene3D.__t - el.__born;
                for (const a of el.getAnimations()) { a.pause(); a.currentTime = Math.max(0, age * 1000); }
            }
        };
        Scene3D.clearEnemies();
        const e = { id: 901, x: Combat.MELEE_X, alive: true, hp: Big.of(1000), maxHp: Big.of(1000), isBoss: false, kind: 'goblin' };
        Combat.enemies = [e];
        Scene3D.spawnEnemy(e);
        const m = Scene3D.enemyMap.get(901);
        for (const a of Scene3D.anims) { try { a.fn && a.fn(1); a.onDone && a.onDone(); } catch (err) {} }
        Scene3D.anims = [];
        m.g.position.set(e.x + Scene3D.worldX, 0, 0);
        m.g.userData.landed = true;
        Combat.phase = 'fight';
        window.__step(0.016);

        // HUD 상단 밴드(재화 바 등)의 실제 하단 y — 숫자가 이 위로 올라가면 침범이다
        const hudBottom = (() => {
            let b = 0;
            for (const sel of ['#topbar', '#top-bar', '.top-bar', '#hud-top', 'header']) {
                const el = document.querySelector(sel);
                if (el) b = Math.max(b, el.getBoundingClientRect().bottom);
            }
            return b;
        })();
        const gameTop = Scene3D.container.getBoundingClientRect().top;

        const runs = [];
        const doCase = (label, amount, crit, repeats) => {
            Scene3D.fxLayer.innerHTML = '';
            window.__step(0.4);
            e.hp = Big.of(1000);
            // 연타 — 슬롯 회피가 몇 칸까지 밀어 올리는지 함께 본다
            for (let i = 0; i < repeats; i++) { Combat.damageEnemy(e, Big.of(amount), crit, null); window.__step(0.03); }
            const els = [...Scene3D.fxLayer.children];
            if (!els.length) { runs.push({ label, err: '숫자 없음' }); return; }
            const el = els[els.length - 1];
            const spawnTop = parseFloat(el.style.top);
            const rise = parseFloat(el.style.getPropertyValue('--rise') || '-42');
            // 애니메이션을 시각별로 시크해 실제 화면 y(변환 포함)를 읽는다
            const track = [];
            for (const ms of [0, 40, 100, 190, 340, 550, 620]) {
                for (const a of el.getAnimations()) { a.pause(); a.currentTime = ms; }
                const r = el.getBoundingClientRect();
                track.push({ ms, top: +r.top.toFixed(1), cy: +((r.top + r.bottom) / 2).toFixed(1) });
            }
            const cy0 = track[0].cy, minCy = Math.min(...track.map(t => t.cy));
            runs.push({
                label, spawnTop: +spawnTop.toFixed(1), rise: +rise.toFixed(1),
                slotPush: +(spawnTop - pt0).toFixed(1),
                animTravel: +(cy0 - minCy).toFixed(1),
                topReached: +Math.min(...track.map(t => t.top)).toFixed(1),
                track
            });
        };
        // 슬롯 회피 없는 기준 스폰 y를 먼저 잡는다
        let pt0 = 0;
        {
            Scene3D.fxLayer.innerHTML = '';
            Combat.damageEnemy(e, Big.of(140), false, null);
            window.__step(0.12); // 히트스톱 프리즈(최대 45ms)보다 길게 — 짧으면 숫자가 아직 없어 0이 박힌다
            const el = Scene3D.fxLayer.children[0];
            pt0 = el ? parseFloat(el.style.top) : 0;
            Scene3D.fxLayer.innerHTML = '';
        }
        doCase('일반 단발', 140, false, 1);
        doCase('크리 단발', 320, true, 1);
        doCase('연타 5발(슬롯 회피 최대)', 140, false, 5);
        return { runs, hudBottom: +hudBottom.toFixed(1), gameTop: +gameTop.toFixed(1), baseSpawnTop: +pt0.toFixed(1), vh: window.innerHeight };
    });

    console.log('뷰포트 높이 ' + out.vh + 'px · HUD 상단 밴드 하단 y=' + out.hudBottom + 'px · 3D 캔버스 top=' + out.gameTop + 'px');
    console.log('슬롯 회피 없는 기준 스폰 top = ' + out.baseSpawnTop + 'px\n');
    for (const r of out.runs) {
        if (r.err) { console.log('[' + r.label + '] ' + r.err); continue; }
        console.log('[' + r.label + '] 스폰 top=' + r.spawnTop + 'px (슬롯 회피 ' + r.slotPush + 'px) · --rise=' + r.rise + 'px');
        console.log('   애니메이션 실이동 ' + r.animTravel + 'px · 최고점 top=' + r.topReached + 'px' +
            (r.topReached < out.hudBottom ? '  ⚠️ HUD 침범' : '  (HUD 아래)'));
        console.log('   궤적: ' + r.track.map(t => t.ms + 'ms→' + t.cy).join('  '));
    }
    console.log(errors.length ? '\nCONSOLE ERRORS: ' + errors.join(' | ') : '\n(no console errors)');
    await browser.close();
})();
