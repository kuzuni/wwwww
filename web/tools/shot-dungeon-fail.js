// 던전 실패 → 본대 복귀 연속 프레임 캡처. 사용: node tools/shot-dungeon-fail.js
// 실패 직전/직후 0.3초 간격으로 8장을 떠서 라벨·배경·몹이 **같은 프레임에** 본대로 넘어가는지
// 눈으로 확인한다(수치 판정은 tools/probe-dungeon-fail-label.js).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

(async () => {
    const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 430, height: 860 } });
    await p.goto('file://' + path.resolve(__dirname, '../index.html'), { waitUntil: 'load' });
    await p.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });
    await p.waitForTimeout(1500);

    await p.evaluate(() => {
        S.chapter = 1; S.stage = 5; S.bestChapter = 9; S.bestStage = 10;
        Dungeons.ensure(); S.dungeons.keys.ghost = 2; S.dungeons.best.ghost = 7;
        Dungeons.run = null;
        Combat.downUntil = 0; Combat.riseUntil = 0;
        Combat.setupStage();
        Dungeons.enter('ghost', 8);
    });
    // 적이 실제로 붙어 서 있는 상태에서 죽어야 "몹이 남아 있나"가 보인다.
    // 대열이 짜일 때까지 기다리는 동안 진짜로 죽어 버리면 안 되므로 그 구간만 무적으로 둔다.
    // ⚠️ damageEnemy 도 같이 막아야 한다 — 영웅만 무적으로 두면 그 사이 던전을 **클리어**해 버려서
    //    (onClear → 본대 복귀) 정작 찍히는 건 던전 실패가 아니라 본대에서의 일반 사망이 된다.
    await p.evaluate(() => {
        window.__dh = Combat.damageHero; window.__de = Combat.damageEnemy;
        Combat.damageHero = () => {}; Combat.damageEnemy = () => {};
    });
    await p.waitForTimeout(2600);
    await p.screenshot({ path: path.resolve(__dirname, 'dungeonfail-0000ms.png') });

    // ⚠️ 파일명은 **실측 경과**로 찍는다 — WebGL 페이지의 screenshot() 한 장이 수백 ms를 먹어서
    //    waitForTimeout 목표치를 파일명에 박으면 뒤 프레임일수록 실제와 크게 어긋난다(실측 2000ms
    //    목표 컷이 실제로는 setupStage 이후였다). 시간 판정은 probe 쪽이 담당하고 여기는 눈 검증용.
    const t0 = await p.evaluate(() => { Combat.damageHero = window.__dh; Combat.damageEnemy = window.__de; Combat.onDefeat(); return performance.now(); });
    let at = 0;
    for (const ms of [80, 300, 700]) {
        await p.waitForTimeout(Math.max(0, ms - at)); at = ms;
        const el = Math.round(await p.evaluate(t => performance.now() - t, t0));
        await p.screenshot({ path: path.resolve(__dirname, `dungeonfail-${String(el).padStart(4, '0')}ms.png`) });
    }
    await b.close();
})();
