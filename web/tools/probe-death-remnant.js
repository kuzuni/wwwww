// 사망 리빌 잔존 적('적 찌꺼기') 실측기 — slug: death-enemy-remnant
//
// 무엇을 재나: 영웅이 죽은 순간부터 6초간 60ms 간격으로
//   ⓐ 사망 커버(#fx-layer 안 z-index:15 검은 판)의 **실제 합성 opacity**(WAAPI 진행 중 값)
//   ⓑ 그 시점에 씬에 남아 있는 **죽기 전 적 메시**의 수 (id 기준 — enemyMap 안/밖 둘 다)
//   ⓒ Combat.phase / downUntil·riseUntil 잔여
// 를 찍는다.
//
// 판정 규약(🚨 여기서 한 번 틀렸다 — 남긴다): 사망 직후 0~900ms 는 커버가 **일부러 투명**하다.
// 자기가 쓰러지는 걸 보여 주는 구간이라 그때 적이 보이는 건 정상이다. 그래서 '커버가 걷혔는데
// 적이 보인다'를 그냥 opacity 로만 재면 정상 구간까지 실패로 잡는다.
//   → **암전이 완전히 닫힌 시점(opacity >= 0.95)을 지난 뒤**의 프레임만 본다. 그 뒤로 커버가
//     다시 걷히는(opacity < 0.6) 구간이 사용자가 말한 '화면이 걷힌 뒤'다.
// 왜 0.6 인가: 0.6 이면 배경 대비가 40% 남아 적 실루엣이 사람 눈에 확실히 읽힌다
// (완전 투명 0 을 기준으로 잡으면 '거의 걷힌 화면에 유령이 서 있는' 구간을 통째로 놓친다).
//
// 사용: node web/tools/probe-death-remnant.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '../index.html');
const REVEAL_OPACITY = 0.6;   // 이 아래면 '보이는 화면'으로 친다
const SAMPLE_MS = 60;
const WATCH_MS = 6000;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('boot-loading') && typeof Combat !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.scene, null, { timeout: 180000 });

    // 전투가 실제로 붙어 적 메시가 씬에 올라올 때까지 기다린다
    await page.waitForFunction(() => Combat.phase === 'fight' && Scene3D.enemyMap.size > 0, null, { timeout: 120000 });

    const samples = await page.evaluate(async ([SAMPLE_MS, WATCH_MS]) => {
        const before = [...Scene3D.enemyMap.keys()];
        // 죽기 전 적 메시의 루트 오브젝트를 붙잡아 둔다 — enemyMap 에서 빠져도 씬에 남았는지 본다
        const beforeMeshes = before.map(id => ({ id, g: Scene3D.enemyMap.get(id).g }));
        const inScene = o => { let p = o; while (p) { if (p === Scene3D.scene) return true; p = p.parent; } return false; };
        const coverOpacity = () => {
            const fx = Scene3D.fxLayer;
            if (!fx) return null;
            // 사망 커버 = z-index 15 인 판
            const el = [...fx.children].find(c => c.style && c.style.zIndex === '15');
            if (!el) return null;
            return +getComputedStyle(el).opacity;
        };
        const t0 = performance.now();
        Combat.damageHero(Combat.hero.maxHp.mul(99));
        const out = [];
        while (performance.now() - t0 < WATCH_MS) {
            await new Promise(r => setTimeout(r, SAMPLE_MS));
            const t = Math.round(performance.now() - t0);
            const live = beforeMeshes.filter(m => inScene(m.g));
            out.push({
                t,
                cover: coverOpacity(),
                oldInScene: live.length,
                oldInMap: before.filter(id => Scene3D.enemyMap.has(id)).length,
                mapSize: Scene3D.enemyMap.size,
                phase: Combat.phase,
            });
        }
        return out;
    }, [SAMPLE_MS, WATCH_MS]);

    await browser.close();

    // ---- 판정 ----
    // 커버가 없어진(null) 프레임은 opacity 0 과 같다 — 화면이 완전히 보인다.
    const vis = s => (s.cover === null ? 0 : s.cover);
    const peakIdx = samples.findIndex(s => vis(s) >= 0.95);   // 암전이 완전히 닫힌 프레임
    const after = peakIdx < 0 ? [] : samples.slice(peakIdx);  // 그 뒤가 '걷히는' 구간
    const bad = after.filter(s => vis(s) < REVEAL_OPACITY && s.oldInScene > 0);
    const firstReveal = after.find(s => vis(s) < REVEAL_OPACITY);
    const cleared = samples.find(s => s.oldInScene === 0);

    console.log('t(ms)  cover  oldInScene  oldInMap  mapSize  phase');
    for (const s of samples)
        console.log(String(s.t).padStart(5), String(s.cover === null ? '-' : s.cover.toFixed(2)).padStart(6),
            String(s.oldInScene).padStart(11), String(s.oldInMap).padStart(9),
            String(s.mapSize).padStart(8), '  ' + s.phase);
    console.log('---');
    console.log('암전 완전 폐쇄(cover>=0.95): ' + (peakIdx < 0 ? '관측 안 됨 — 커버 자체가 안 떴다' : samples[peakIdx].t + 'ms'));
    console.log('그 뒤 첫 리빌(cover<' + REVEAL_OPACITY + '): ' + (firstReveal ? firstReveal.t + 'ms' : '없음'));
    console.log('옛 적 메시 정리 완료: ' + (cleared ? cleared.t + 'ms' : '6초 내 안 됨'));
    console.log('노출 프레임 수: ' + bad.length + (bad.length ? ' (첫 ' + bad[0].t + 'ms ~ 끝 ' + bad[bad.length - 1].t + 'ms, 약 ' + (bad[bad.length - 1].t - bad[0].t + SAMPLE_MS) + 'ms 동안 보임)' : ''));
    if (errs.length) console.log('콘솔 에러: ' + errs.length + '\n  ' + errs.slice(0, 5).join('\n  '));
    console.log(bad.length ? 'FAIL — 화면이 걷힌 뒤 옛 적이 보인다' : 'PASS — 리빌 시점에 옛 적 메시 없음');
    process.exit(bad.length ? 1 : 0);
})();
