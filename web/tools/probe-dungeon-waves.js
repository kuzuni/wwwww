// 던전 웨이브 1~3 + 선형 보상 검증 (사용자 지시 2026-08-18 `dungeon-waves-1to3`)
//  ⑴ 던전 입장 시 총 웨이브가 1~3, 그 판 내내 값이 고정된다(프레임마다 다시 뽑히지 않는다)
//  ⑵ 웨이브 pip이 총 웨이브 수만큼만 뜨고, 마지막 pip이 보스로 표시된다
//  ⑶ 마지막 웨이브가 실제 보스 웨이브(isBoss)이고, 그 수만큼 깨면 클리어(Dungeons.onClear)된다
//  ⑷ 메인 스테이지는 5웨이브 그대로다 (회귀 금지)
//  ⑸ 보상은 1단계 100, 단계마다 +2 (선형) — 4던전 전부
//  ⑹ 해머 도둑은 🔨망치 + 🪙골드 2종만 (태엽 ⚙️ 제거)
//  ⑺ 콘솔 에러 0건
// 사용: node probe-dungeon-waves.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

async function waitBooted(page, timeout = 20000) {
    const t0 = Date.now();
    for (;;) {
        const ok = await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S).catch(() => false);
        if (ok) return;
        if (Date.now() - t0 > timeout) throw new Error('부팅 대기 시간 초과');
        await page.waitForTimeout(100);
    }
}

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
    await waitBooted(page);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};                 // 전투 루프는 끄고 웨이브 진행만 손으로 돌린다
        S.bestChapter = 9; S.bestStage = 9;           // 4던전 전부 해금
        Dungeons.ensure();
    });

    // ================= ⑷ 메인 스테이지는 5웨이브 유지 =================
    const main = await page.evaluate(() => {
        Dungeons.run = null;
        Combat.setupStage();
        return { total: Combat.totalWaves(), pips: document.querySelectorAll('#wave-pips .pip').length };
    });
    ok(main.total === 5, `⑷ 메인 스테이지 총 웨이브가 5가 아니다 (${main.total})`);
    ok(main.pips === 5, `⑷ 메인 스테이지 pip이 5개가 아니다 (${main.pips})`);

    // ================= ⑴⑵⑶ 던전 =================
    // 입장 → (보스 웨이브면 워닝 페이즈를 건너뛰고 스폰) → 전원 처치를 총 웨이브 수만큼 반복
    const runs = [];
    for (let i = 0; i < 12; i++) {
        runs.push(await page.evaluate((id) => {
            Dungeons.run = null;
            S.dungeons.keys[id] = 2;
            Dungeons.enter(id, 1);
            const total = Combat.totalWaves();
            const stable = [Combat.totalWaves(), Combat.totalWaves(), Combat.totalWaves()].every(v => v === total);
            const pipTotal = document.querySelectorAll('#wave-pips .pip').length;
            const lastPipBoss = (() => {
                const ps = document.querySelectorAll('#wave-pips .pip');
                return ps.length ? ps[ps.length - 1].classList.contains('boss') : false;
            })();
            // 웨이브를 끝까지 손으로 밀어 본다
            const seen = [];
            let cleared = false;
            for (let w = 0; w < total + 2; w++) {
                if (Combat.phase === 'bossWarn') Combat.spawnWave();       // 워닝 대기 생략
                const alive = Combat.aliveEnemies();
                if (!alive.length) break;
                seen.push({ wave: Combat.wave, n: alive.length, boss: alive.some(e => e.isBoss) });
                // 전원 처치
                for (const e of alive.slice()) {
                    e.alive = false;
                    if (!Combat.aliveEnemies().length) {
                        if (Combat.wave >= Combat.totalWaves()) { Dungeons.onClear(); cleared = true; }
                        else Combat.nextWave();
                    }
                }
                if (cleared) break;
            }
            return { id, total, stable, pipTotal, lastPipBoss, seen, cleared, best: S.dungeons.best[id] };
        }, ['hammer', 'ghost', 'invasion', 'zombie'][i % 4]));
    }
    const totals = runs.map(r => r.total);
    ok(totals.every(t => t >= 1 && t <= 3), `⑴ 던전 총 웨이브가 1~3 밖 (${JSON.stringify(totals)})`);
    ok(runs.every(r => r.stable), '⑴ 같은 판에서 총 웨이브 수가 흔들린다 (호출마다 다시 뽑힘)');
    ok(runs.every(r => r.pipTotal === r.total), `⑵ pip 개수가 총 웨이브와 다르다 ${JSON.stringify(runs.map(r => [r.total, r.pipTotal]))}`);
    ok(runs.every(r => r.lastPipBoss), '⑵ 마지막 pip이 보스로 표시되지 않는다');
    ok(runs.every(r => r.seen.length && r.seen[r.seen.length - 1].boss),
        `⑶ 마지막 웨이브가 보스가 아니다 ${JSON.stringify(runs.map(r => r.seen))}`);
    ok(runs.every(r => r.seen.every(s => !s.boss || s.wave === r.total)), '⑶ 보스가 마지막이 아닌 웨이브에 나왔다');
    ok(runs.every(r => r.cleared && r.best >= 1), '⑶ 총 웨이브를 다 깼는데 클리어되지 않았다');

    // ================= ⑸⑹ 보상 선형식 =================
    const rw = await page.evaluate(() => {
        const out = {};
        for (const d of Dungeons.DEFS) {
            out[d.id] = [1, 2, 3, 10].map(st => ({ st, r: Dungeons.rewards(d.id, st), text: Dungeons.rewardText(d.id, st) }));
        }
        // 기술트리 배율이 켜져 있으면 선형식 위에 곱해진다 — 배율 1인 기본 상태로 검사한다
        out._mults = { hammer: TechTree.thiefHammerMult(), coin: TechTree.thiefCoinMult(),
                       ticket: TechTree.dungeonTicketMult(), potion: TechTree.dungeonPotionMult() };
        out._amount = [1, 2, 3, 10].map(st => Dungeons.rewardAmount(st));
        return out;
    });
    const flat = rw._mults.hammer === 1 && rw._mults.coin === 1 && rw._mults.ticket === 1 && rw._mults.potion === 1;
    ok(JSON.stringify(rw._amount) === JSON.stringify([100, 102, 104, 118]),
        `⑸ 보상 수량 선형식이 100 + 2*(단계-1)이 아니다 (${JSON.stringify(rw._amount)})`);
    if (flat) {
        for (const d of ['hammer', 'ghost', 'invasion', 'zombie']) {
            for (const row of rw[d]) {
                const want = 100 + 2 * (row.st - 1);
                const got = Object.entries(row.r).filter(([k]) => k !== 'coins' || d === 'hammer').map(([, v]) => v);
                ok(got.every(v => v === want), `⑸ ${d} ${row.st}단계 보상 수량 ${JSON.stringify(row.r)} (기대 ${want})`);
            }
        }
    } else ok(false, `⑸ 기술트리 배율이 1이 아니라 선형식을 순수하게 못 잰다 ${JSON.stringify(rw._mults)}`);
    const h1 = rw.hammer[0];
    ok(Object.keys(h1.r).sort().join(',') === 'coins,hammers', `⑹ 해머 도둑 보상 종류가 망치+골드 2종이 아니다 ${JSON.stringify(h1.r)}`);
    ok(!/⚙️/.test(h1.text), `⑹ 해머 도둑 보상 표기에 태엽이 남았다 "${h1.text}"`);
    const defText = await page.evaluate(() => Dungeons.def('hammer').reward);
    ok(!/태엽/.test(defText), `⑹ 던전 목록 보상 설명에 태엽이 남았다 "${defText}"`);
    const winderGrant = await page.evaluate(() => {
        const w0 = S.winders; Dungeons.grantRewards('hammer', 3); return S.winders - w0;
    });
    ok(winderGrant === 0, `⑹ 해머 도둑 클리어가 태엽을 ${winderGrant}개 줬다`);

    ok(errs.length === 0, `⑺ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);

    console.log('--- 던전 웨이브/보상 검증 ---');
    console.log(`메인 총 웨이브 ${main.total} · pip ${main.pips}`);
    console.log(`던전 12판 총 웨이브 분포: ${JSON.stringify(totals)}`);
    console.log(`보상 수량 1/2/3/10단계: ${JSON.stringify(rw._amount)} · 해머도둑 1단계 "${h1.text}"`);
    if (fails.length) { console.log('FAIL ' + fails.length + '건'); fails.forEach(f => console.log('  ✗ ' + f)); }
    else console.log('PASS — 던전 1~3웨이브 · 선형 보상 · 태엽 제거');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
