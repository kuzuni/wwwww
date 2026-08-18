// 던전 클리어 → 보상 팝업 → [보상 수령] → 수령 연출 → 본대 복귀 흐름 검증 — slug: dungeon-clear-reward-popup
//
// 재는 것:
//   ⑴ 던전 클리어 순간 보상 팝업이 뜬다(토스트가 아니라) + 보상이 즉시 지급돼 있다 + phase='dungeonClear'
//   ⑵ 자동 진행이 없다 — 3초를 기다려도 팝업이 그대로고 본대로 넘어가지 않는다
//      (예전 stageDelay 2.2s 회귀 검출: 그 코드면 3초 뒤 setupStage 가 이미 돌았다)
//   ⑶ [보상 수령] 클릭 → 수령 연출(#reward-fly 에 날아가는 아이콘) → 팝업 닫힘 → 본대 복귀
//      (라벨이 본대 스테이지로, phase 가 dungeonClear 를 벗어남, 던전 몹 논리 목록 비움)
//   ⑷ 더블클릭해도 finishDungeonClear 가 두 번 돌지 않는다(가드) + 콘솔 에러 0
//
// ⚠️ 이 저장소의 Playwright 는 문자열 화살표 함수를 식으로 평가해 undefined 를 준다 —
//    반드시 `page.evaluate('(' + FN + ')()')` 즉시호출 형태로 쓸 것.
// ⚠️ 함정 ③(TODO 42행): 헤드리스에서 Scene3D.update 는 rAF 라 안 돈다. 이 프로브는 DOM/논리만
//    판정하므로 연출 백로그와 무관 — 3D 좌표는 재지 않는다.
//
// 사용: node probe-dgclear-popup.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const ev = (page, body) => page.evaluate(`(() => { ${body} })()`);

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Dungeons !== 'undefined' && Combat.phase !== 'idle', null, { timeout: 60000 });

    const fails = [];
    const ok = (c, m) => { if (!c) fails.push(m); };

    // ---- 준비: 해금 + 열쇠 + 입장 (웨이브 1 로 굳혀 보스 단판) ----
    // ⚠️ 영웅 피해는 끈다 — 헤드리스는 로직 루프가 캐치업 버스트(한 발화에 최대 5초치)로 돌아
    //    보스 스폰→접근→공격→맨몸 영웅(HP 180) 즉사가 150ms 킬 폴 '사이'에 통째로 지나간다.
    //    그러면 onDefeat(실패 경로)로 빠져 팝업이 영영 안 뜨는 거짓 FAIL 이 된다(실측 재현 ~50%).
    const before = await ev(page, `
        Combat.damageHero = function () {};
        S.bestChapter = 5; S.bestStage = 10; Dungeons.ensure();
        Dungeons.DEFS.forEach(d => S.dungeons.keys[d.id] = 2);
        const entered = Dungeons.enter('hammer', 1);
        Dungeons.run.waves = 1; Combat.setupStage();   // 마지막(=첫) 웨이브가 보스 — bossWarn 을 거쳐 스폰된다
        return { entered, hammers: S.hammers, coins: S.coins };
    `);
    ok(before.entered, '던전 입장 실패');

    // ---- 스폰되는 족족 죽여 클리어까지 간다 (bossWarn 1.55s 를 실시간으로 지난다) ----
    const t0 = Date.now();
    let cleared = false;
    while (Date.now() - t0 < 30000) {
        const st = await ev(page, `
            for (const e of Combat.aliveEnemies()) Combat.damageEnemy(e, Big.of(1e30), false, null);
            return { phase: Combat.phase, run: !!Dungeons.run,
                     popup: !UI.els.dungeonClearModal.classList.contains('hidden') };
        `);
        if (st.popup) { cleared = true; break; }
        await page.waitForTimeout(150);
    }
    ok(cleared, '⑴ 30초 안에 클리어 팝업이 안 떴다');

    if (cleared) {
        const p1 = await ev(page, `
            const m = UI.els.dungeonClearModal;
            return { phase: Combat.phase, run: !!Dungeons.run,
                     cells: m.querySelectorAll('.dgc-cell').length,
                     btn: !!m.querySelector('.dgclear-btn'),
                     hammers: S.hammers, coins: S.coins };
        `);
        ok(p1.phase === 'dungeonClear', `⑴ phase 가 dungeonClear 가 아니라 ${p1.phase}`);
        ok(!p1.run, '⑴ 팝업 시점에 Dungeons.run 이 안 비었다');
        ok(p1.cells >= 2, `⑴ 보상 칸이 2개(해머·코인) 미만: ${p1.cells}`);
        ok(p1.btn, '⑴ [보상 수령] 버튼이 없다');
        ok(p1.hammers > before.hammers && p1.coins > before.coins, '⑴ 보상(해머·코인)이 즉시 지급되지 않았다');

        // ---- ⑵ 자동 진행 금지: 3초 대기(예전 2.2s stageDelay 면 이미 본대로 넘어갔을 시간) ----
        await page.waitForTimeout(3000);
        const p2 = await ev(page, `
            return { phase: Combat.phase,
                     popup: !UI.els.dungeonClearModal.classList.contains('hidden'),
                     walking: Scene3D.walking };
        `);
        ok(p2.popup, '⑵ 3초 뒤 팝업이 저절로 닫혔다(자동 진행 회귀)');
        ok(p2.phase === 'dungeonClear', `⑵ 3초 뒤 phase 가 ${p2.phase} — 자동 진행 회귀`);
        ok(p2.walking === false, '⑵ 팝업 대기 중인데 영웅이 행군한다');

        // ---- ⑶ 클릭(더블클릭 가드 포함) → 연출 → 복귀 ----
        const p3 = await ev(page, `
            const btn = UI.els.dungeonClearModal.querySelector('.dgclear-btn');
            btn.click(); btn.click();   // 더블클릭 — finishDungeonClear 가 두 번 돌면 안 된다
            const layer = document.getElementById('reward-burst'); // 공통 수령 연출(rewardBurst) 레이어
            return { flying: layer ? layer.querySelectorAll('.rw-fly').length : 0 };
        `);
        ok(p3.flying >= 2, `⑶ 클릭 직후 날아가는 보상 아이콘이 없다(rewardBurst 미발동): ${p3.flying}`);

        await page.waitForFunction(() => UI.els.dungeonClearModal.classList.contains('hidden'), null, { timeout: 5000 })
            .catch(() => fails.push('⑶ 클릭 후 5초가 지나도 팝업이 안 닫혔다'));
        await page.waitForTimeout(1600); // stageDelay 0.8s + rewardBurst 잔여(~1.3s) — setupStage 까지 지나 본대가 선다
        const p4 = await ev(page, `
            const layer = document.getElementById('reward-burst');
            return { phase: Combat.phase, run: !!Dungeons.run,
                     label: UI.els.stageLabel.textContent,
                     enemies: Combat.enemies.length,
                     fly: layer ? layer.querySelectorAll('.rw-fly').length : 0 };
        `);
        ok(p4.phase !== 'dungeonClear', `⑶ 복귀 후에도 phase 가 dungeonClear 다`);
        ok(!p4.run, '⑶ 복귀 후 Dungeons.run 이 살아 있다');
        ok(/스테이지|STAGE|\d-\d/.test(p4.label) && !/도둑|유령|침공|좀비/.test(p4.label),
            `⑶ 라벨이 본대가 아니다: "${p4.label}"`);
        ok(p4.fly === 0, `⑶ 연출이 끝났는데 날아가는 아이콘이 남아 있다: ${p4.fly}`);

        // ---- ⑷ 두 번째 판도 같은 흐름이 돈다 (팝업 재사용 — 잔상 클래스가 안 남는지) ----
        const again = await ev(page, `
            const entered = Dungeons.enter('hammer', 1);
            if (entered) { Dungeons.run.waves = 1; Combat.setupStage(); }
            return entered;
        `);
        ok(again, '⑷ 두 번째 입장 실패(열쇠 소모 확인 겸)');
        if (again) {
            const t1 = Date.now();
            let popup2 = false;
            while (Date.now() - t1 < 30000) {
                const st = await ev(page, `
                    for (const e of Combat.aliveEnemies()) Combat.damageEnemy(e, Big.of(1e30), false, null);
                    return !UI.els.dungeonClearModal.classList.contains('hidden');
                `);
                if (st) { popup2 = true; break; }
                await page.waitForTimeout(150);
            }
            ok(popup2, '⑷ 두 번째 판 클리어 팝업이 안 떴다');
            if (popup2) {
                const dim = await ev(page, `
                    const m = UI.els.dungeonClearModal;
                    return { out: m.classList.contains('dgclear-out'),
                             bg: getComputedStyle(m).backgroundColor };
                `);
                ok(!dim.out, '⑷ 직전 판의 dgclear-out(딤 걷힘) 클래스가 남아 재사용 팝업의 딤이 투명하다');
            }
        }
    }

    ok(errs.length === 0, `콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    await browser.close();

    if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
    console.log('PASS probe-dgclear-popup — 팝업 노출·자동진행 금지·수령 연출·본대 복귀·재사용 전부 통과');
})();
