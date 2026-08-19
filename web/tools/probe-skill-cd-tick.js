// 스킬 쿨타임 페이즈 무관 감소 + 스테이지 전환 리셋 판정 — skill-cd-tick-and-reset (사용자 지시 2026-08-19)
// "전투 중 아닐 때는 스킬 쿨타임 안 흐르는 거 같은데 그거 흐르게 수정하고, 보스 깨고 다음 스테이지
//  가거나 혹은 던전 입장하거나 혹은 죽어서 전 스테이지로 가거나 그럴 때 쿨타임 초기화돼야 함."
// 판정: ① waveDelay·stageDelay·bossWarn 페이즈에서도 Combat.tick 이 쿨을 깎는다 (fight 게이트 위로 이동)
//       ② 비전투 페이즈에서는 쿨이 0이어도 autoCast 발동이 안 된다 (허공 발사 방지 — 감소/발동 분리)
//       ③ fight 페이즈에서는 기존처럼 감소+발동 둘 다 동작
//       ④ setupStage()(= 보스 클리어 후 전진·사망 후퇴가 지나는 경로)가 쿨을 1~3초 스태거로 리셋
//       ⑤ 던전 입장(Dungeons.enter → setupStage)도 같은 리셋을 탄다
//       ⑥ 콘솔 에러 0
// 사용: node probe-skill-cd-tick.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('boot-loading') && typeof Combat !== 'undefined' && Combat.hero, null, { timeout: 180000 });

    const r = await page.evaluate(() => {
        const out = [];
        const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
        // 메인 로직 루프와 경합하지 않게 자동 tick 을 끊고 수동으로 돌린다
        const realTick = Combat.tick.bind(Combat);
        Combat.tick = () => {};
        S.equippedSkills = ['powerStrike', 'warCry'];
        if (!S.skills.powerStrike) S.skills.powerStrike = { level: 1, dupes: 0, stars: 0 };
        if (!S.skills.warCry) S.skills.warCry = { level: 1, dupes: 0, stars: 0 };

        // ---- ① 비전투 페이즈 3종에서 쿨이 흐른다 ----
        for (const ph of ['waveDelay', 'stageDelay', 'bossWarn']) {
            Combat.phase = ph;
            Combat.phaseTimer = 9999;           // 페이즈 전이가 끼어들지 않게
            Combat.downUntil = 0; Combat.riseUntil = 0;
            Combat.cooldowns = { powerStrike: 5, warCry: 8 };
            for (let i = 0; i < 10; i++) realTick(0.1); // 1.0초
            ok(Math.abs(Combat.cooldowns.powerStrike - 4) < 1e-9 && Math.abs(Combat.cooldowns.warCry - 7) < 1e-9,
                `① ${ph} 중 쿨 감소 (5→${Combat.cooldowns.powerStrike.toFixed(2)}, 8→${Combat.cooldowns.warCry.toFixed(2)})`);
        }

        // ---- ② 비전투에서는 쿨 0이어도 발동 안 함 ----
        let casts = 0;
        const realTry = Combat.tryCast.bind(Combat);
        Combat.tryCast = id => { casts++; return realTry(id); };
        S.autoCast = true;
        Combat.phase = 'waveDelay'; Combat.phaseTimer = 9999;
        Combat.cooldowns = { powerStrike: 0, warCry: 0 };
        for (let i = 0; i < 5; i++) realTick(0.1);
        ok(casts === 0, `② 비전투 페이즈에서 autoCast 발동 0회 (${casts})`);

        // ---- ③ fight 에서는 발동된다 (버프 스킬 warCry 는 적이 없어도 성립) ----
        Combat.phase = 'fight';
        Combat.cooldowns = { powerStrike: 99, warCry: 0 };
        casts = 0;
        realTick(0.1);
        ok(casts >= 1, `③ fight 중 쿨 0 스킬이 발동 시도됨 (${casts}회)`);
        ok(Combat.cooldowns.warCry > 5, `③ 발동 후 쿨이 다시 걸림 (${Combat.cooldowns.warCry.toFixed(1)}s)`);
        Combat.tryCast = realTry;

        // ---- ④ setupStage 리셋 = 1~3초 스태거 ----
        Combat.cooldowns = { powerStrike: 12.7, warCry: 13.9 };
        Combat.setupStage();
        const inBand = id => Combat.cooldowns[id] >= 1 && Combat.cooldowns[id] <= 3;
        ok(inBand('powerStrike') && inBand('warCry'),
            `④ setupStage 후 쿨 1~3초 스태거 (${Combat.cooldowns.powerStrike.toFixed(2)}, ${Combat.cooldowns.warCry.toFixed(2)})`);

        // ---- ⑤ 던전 입장 경로 ----
        Dungeons.ensure();
        S.dungeons.keys.hammer = 9;
        S.bestChapter = 99; S.bestStage = 99; // 해금 조건 통과
        Combat.cooldowns = { powerStrike: 11.2, warCry: 12.4 };
        const entered = Dungeons.enter('hammer', 1);
        ok(entered !== false && inBand('powerStrike') && inBand('warCry'),
            `⑤ 던전 입장 시 쿨 리셋 (${Combat.cooldowns.powerStrike.toFixed(2)}, ${Combat.cooldowns.warCry.toFixed(2)})`);
        Combat.leaveDungeon && Combat.leaveDungeon();

        return out;
    });

    for (const line of r) console.log(' ', line);
    const fails = r.filter(x => x.startsWith('FAIL'));
    for (const e of errs.slice(0, 5)) console.log('콘솔 에러 —', e);
    console.log(fails.length || errs.length ? `실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건` : 'PASS — 쿨은 전 페이즈에서 흐르고, 스테이지 전환마다 스태거로 리셋된다');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
