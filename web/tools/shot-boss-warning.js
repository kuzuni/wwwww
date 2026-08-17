// 보스 등장 워닝 연출 — 연속 프레임 캡처 + 실시간 타임라인 실측
// 사용: node shot-boss-warning.js  → tools/boss-warning.png (+ 프레임 로그)
//
// 스크린샷 1장이 소프트웨어 GL에서 ~1초라 "200ms 자고 찍기"로는 연출 구간을 못 따라간다.
// 그래서 둘로 나눈다:
//   ⑴ 판정 — 연출을 실제 속도로 돌리면서 rAF마다 비네트 불투명도·배너 높이·마퀴 위치를
//      인페이지에 기록한 타임라인으로 본다(스크린샷 없음 → 시간이 정확하다).
//   ⑵ 그림 — CSS 애니메이션을 일시정지하고 animation-delay를 음수로 밀어 원하는 시각의
//      정지 프레임을 결정론적으로 만들어 찍는다(캡처가 느려도 프레임 시각이 흔들리지 않는다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const STEP = 200, FRAMES = 11;   // 0 ~ 2000ms

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push((e.stack || String(e)).split('\n').slice(0, 2).join(' | ')));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Combat !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });

    // 전투 틱 동결 — 보스가 즉사해 스테이지가 넘어가면 측정 대상이 사라진다(연출만 판독한다)
    await page.evaluate(() => { Combat.tick = () => {}; if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {}; });

    // 콜드스타트 직후에는 셰이더 컴파일 때문에 rAF가 수 초씩 멈춰, 타임라인이 1~2프레임만 잡히고
    // 측정이 통째로 흔들린다. 프레임 간격이 실제로 안정될 때까지 기다린 뒤에 연출을 건다.
    await page.evaluate(() => new Promise(res => {
        let last = performance.now(), stable = 0;
        const w = () => {
            const now = performance.now(), dt = now - last; last = now;
            stable = dt < 220 ? stable + 1 : 0;
            if (stable >= 10 || now > 20000) res(); else requestAnimationFrame(w);
        };
        requestAnimationFrame(w);
    }));

    // ── ⑴ 실시간 타임라인 ────────────────────────────────────────
    await page.evaluate(() => {
        const el = document.getElementById('boss-warning');
        window.__tl = [];
        const t0 = performance.now();
        const tick = () => {
            const t = performance.now() - t0;
            if (t > 2600) return;
            const v = el.querySelector('.bw-vignette'), b = el.querySelector('.bw-banner'), k = el.querySelector('.bw-track');
            window.__tl.push({
                t: Math.round(t), vis: !el.classList.contains('hidden'),
                vig: v ? +(parseFloat(getComputedStyle(v).opacity) || 0).toFixed(2) : 0,
                bh: b ? +b.getBoundingClientRect().height.toFixed(1) : 0,
                tx: k ? getComputedStyle(k).transform : 'none',
            });
            requestAnimationFrame(tick);
        };
        Combat.enemies = []; Scene3D.clearEnemies(); Combat.wave = 4; Combat.nextWave();
        requestAnimationFrame(tick);
    });
    await page.waitForTimeout(2800);
    const tl = await page.evaluate(() => window.__tl);

    // ── ⑵ 결정론적 정지 프레임 ───────────────────────────────────
    const shots = [];
    for (let i = 0; i < FRAMES; i++) {
        await page.evaluate((ms) => {
            const el = document.getElementById('boss-warning');
            el.classList.remove('hidden');
            // 애니메이션을 처음부터 다시 건 뒤 원하는 시각으로 밀어 정지시킨다
            for (const n of [el, ...el.querySelectorAll('*')]) {
                n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
                n.style.animationPlayState = 'paused';
                n.style.animationDelay = `-${ms}ms`;
            }
        }, i * STEP);
        shots.push(await page.screenshot());
    }

    const errsBeforeCompose = errors.length;
    const b64 = shots.map(b => 'data:image/png;base64,' + b.toString('base64'));
    await page.setViewportSize({ width: 1240, height: 1160 });
    await page.evaluate(([imgs, step]) => {
        document.body.innerHTML = `<div id="sheet" style="background:#111;padding:6px;width:1228px;display:flex;flex-wrap:wrap;gap:4px">`
            + imgs.map((d, i) => `<div style="width:240px"><img src="${d}" style="width:240px;display:block"><div style="font:12px sans-serif;color:#eee;text-align:center">${i * step}ms</div></div>`).join('')
            + `</div>`;
    }, [b64, STEP]);
    await page.locator('#sheet').screenshot({ path: path.join(__dirname, 'boss-warning.png') });

    // ── 판정 (전부 ⑴ 타임라인 기준) ──────────────────────────────
    let bad = 0;
    const on = tl.filter(f => f.vis);
    console.log(`타임라인 ${tl.length}프레임 / 배너 표시 ${on.length}프레임`);
    if (!on.length) { console.log('✗ 경고 연출이 한 프레임도 표시되지 않음'); bad++; }
    else {
        const dur = on[on.length - 1].t - on[0].t;
        const peakVig = Math.max(...on.map(f => f.vig)), peakBh = Math.max(...on.map(f => f.bh));
        // 비네트 점멸 횟수 = 0.7 위로 올라간 구간의 개수
        let blinks = 0, up = false;
        for (const f of on) { if (!up && f.vig > 0.7) { blinks++; up = true; } else if (up && f.vig < 0.35) up = false; }
        const okDur = dur >= 1500 && dur <= 2500;   // TODO 요구: 총 길이 1.5~2.5초
        console.log(`${okDur ? '✓' : '✗'} 연출 길이 ${dur}ms (요구 1500~2500ms)`); if (!okDur) bad++;
        // 소프트웨어 GL에서 rAF가 ~8fps라 점멸 봉우리(약 120ms 폭)의 꼭대기를 정확히 밟지 못한다.
        // 키프레임상 최대는 1.0이고, 샘플이 0.85를 넘으면 봉우리에 올라탄 것으로 본다.
        const fps = Math.round(tl.length / (tl[tl.length - 1].t / 1000));
        console.log(`${peakVig >= 0.85 ? '✓' : '✗'} 붉은 비네트 최대 ${peakVig} (샘플 ${fps}fps)`); if (peakVig < 0.85) bad++;
        console.log(`${blinks >= 2 ? '✓' : '✗'} 비네트 점멸 ${blinks}회 (요구 2~3회)`); if (blinks < 2) bad++;
        console.log(`${peakBh >= 30 ? '✓' : '✗'} 배너 최대 높이 ${peakBh}px`); if (peakBh < 30) bad++;
        const moved = new Set(on.map(f => f.tx)).size;
        console.log(`${moved >= 3 ? '✓' : '✗'} 마퀴 텍스트 이동 (${moved}종 transform)`); if (moved < 3) bad++;
        const last = tl[tl.length - 1];
        console.log(`${!last.vis ? '✓' : '✗'} ${last.t}ms 시점에 연출 종료`); if (last.vis) bad++;
        const marks = [0, 200, 400, 1000, 1600, 1900, 2100].map(ms => {
            const f = on.reduce((a, b) => Math.abs(b.t - ms) < Math.abs(a.t - ms) ? b : a, on[0]);
            return `${ms}ms:vig${f.vig}/h${Math.round(f.bh)}`;
        });
        console.log('  궤적 ' + marks.join('  '));
    }
    const gameErrs = errors.slice(0, errsBeforeCompose);  // 합성 단계는 #app을 지우므로 그 뒤 에러는 도구 아티팩트
    console.log(gameErrs.length ? '✗ 콘솔 에러 ' + gameErrs.length + '건: ' + gameErrs.slice(0, 4).join(' | ') : '✓ 콘솔 에러 0건');
    console.log('→ tools/boss-warning.png');
    await browser.close();
    process.exit(bad || gameErrs.length ? 1 : 0);
})();
