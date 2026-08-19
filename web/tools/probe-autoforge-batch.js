// autoforge-cards-at-once 검증 — 망치 N개를 쓰면 결과 카드 N장이 **한 번에** 뜨는가.
// 사용자 지시(2026-08-20): "10개 망치 썼으면 카드 10개 한 번에 보여달라니까. 1초에 1개씩 10개 보여주고 지랄이냐."
//
// 재는 것 ⑴ 한 배치에 카드가 **동시에 N장** 떠 있는가(순차면 어느 시점에도 1장뿐이다)
//        ⑵ 등장 시차가 없는가 — 카드판이 뜬 직후 한 프레임에 이미 N장이 다 있는가
//        ⑶ 🔑 **지속성**: 카드가 떠 있는 동안 새로고침해도 뽑은 N개가 증발하지 않는가
//           (해머는 이미 나갔다 — 이 항목의 핵심 난점이자 종전에 1개씩 뽑던 이유)
// 사용: node probe-autoforge-batch.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const READY = 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, READY, { label: '스크립트 로드' });

    let fail = 0;
    const N = 10;

    // ---- ⑴⑵ 한 배치에 카드 N장이 동시에 ----
    // ⚠️ 시간으로 재지 않는다. 이 환경(swiftshader)은 메인 스레드가 포화돼 `setTimeout(60)` 이
    //    실제로는 700ms, `setTimeout(200)` 이 7초로 늘어난다(실측) — 시계로 '동시'를 재면
    //    코드가 멀쩡해도 카드판이 이미 만료돼 FAIL 로 보인다(저장소 함정 ③의 같은 뿌리).
    //    대신 **구조로** 잰다: 카드판이 생긴 그 동기 시점에 N장이 다 있는가 + 장마다 등장
    //    지연(animation-delay)이 0인가. 시차 노출은 이 둘 중 하나로 반드시 드러난다.
    const seen = await page.evaluate((n) => {
        S.hammers = n; S.autoForgeOn = true;
        S.autoForge = S.autoForge || {};
        S.autoForge.hammersPerBatch = n;
        UI.playAnvilStrike = (cb) => cb();          // 망치질 연출 시간은 이 항목의 대상이 아니다
        UI._autoSeq = { stopAfterPick: false };
        UI.autoSeqBatch();                           // 동기적으로 카드판이 붙는다
        const cards = [...document.querySelectorAll('.craft-batch .cb-card')];
        // 등장 지연: 카드 자신 + 카드판 그리드 어디에도 per-card delay 가 없어야 한다
        const delays = cards.map(c => getComputedStyle(c).animationDelay).filter(d => d && d !== '0s');
        return {
            atOnce: cards.length,
            wraps: document.querySelectorAll('.craft-batch').length,
            staggered: delays.length,
            batchLen: Array.isArray(S.autoBatch) ? S.autoBatch.length : 0,
            hammers: S.hammers,
        };
    }, N);

    console.log('=== ⑴⑵ 한 배치 카드 동시 노출 ===');
    console.log(`  카드판이 뜬 그 시점의 카드 수 = ${seen.atOnce} (기대 ${N}) · 카드판 ${seen.wraps}개`);
    console.log(`  장별 등장 지연(animation-delay≠0) ${seen.staggered}건 (기대 0 — 1장씩 뜨는 정체)`);
    console.log(`  S.autoBatch 적재 ${seen.batchLen}개 · 남은 망치 ${seen.hammers}`);
    const allAtOnce = seen.atOnce === N && seen.staggered === 0;
    console.log(`  ${allAtOnce ? `PASS — ${N}장이 시차 없이 한 번에 뜬다` : 'FAIL — 동시 노출이 아니다'}`);
    if (!allAtOnce) fail++;
    if (seen.batchLen !== N) { console.log(`  🚨 FAIL — 배치가 세이브에 ${seen.batchLen}개만 적재됐다(기대 ${N})`); fail++; }

    // ---- ⑶ 카드가 떠 있는 동안 새로고침 — 뽑은 N개가 증발하지 않는가 ----
    // 새 페이지로 부팅해 배치를 태운 **직후 저장 상태 그대로** 다시 로드한다.
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, READY, { label: '스크립트 로드(2)' });
    const before = await page.evaluate(async (n) => {
        S.hammers = n; S.autoForgeOn = true;
        S.autoForge = S.autoForge || {};
        S.autoForge.hammersPerBatch = n;
        S.autoForge.keepAges = [];                 // 목표 없음 → 탈락 경로(자동 판정)로 흘러야 한다
        S.coins = 0;
        UI.playAnvilStrike = (cb) => cb();
        UI._autoSeq = { stopAfterPick: false };
        UI.autoSeqBatch();                          // 카드판이 뜬 상태 = S.autoBatch 에 N개 적재 + 저장됨
        return { batch: (S.autoBatch || []).length, hammers: S.hammers, coins: S.coins, crafts: S.totalCrafts };
    }, N);
    console.log(`\n=== ⑶ 카드 노출 중 새로고침 — 결과물 지속성 ===`);
    console.log(`  새로고침 직전: 배치 ${before.batch}개 · 망치 ${before.hammers} · 코인 ${before.coins} · 누적제작 ${before.crafts}`);

    // 저장된 채로 리로드 (카드판은 연출이라 사라지고, 배치는 복원 경로가 처리해야 한다)
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, READY, { label: '스크립트 로드(3)' });
    // 부팅 복원이 돌 때까지 **조건으로** 기다린다 — 이 환경에선 복원이 10초 넘게 밀린다(실측).
    await waitReady(page, '!(Array.isArray(S.autoBatch) && S.autoBatch.length)', { timeout: 60000, label: '배치 복원 처리' })
        .catch(() => console.log('  (복원 대기 타임아웃 — 아래 수치로 판정)'));
    const after = await page.evaluate(() => {
        return {
            batch: Array.isArray(S.autoBatch) ? S.autoBatch.length : 0,
            queue: Array.isArray(S.autoMatchQueue) ? S.autoMatchQueue.length : 0,
            pending: S.pendingCraft ? 1 : 0,
            coins: S.coins, hammers: S.hammers, crafts: S.totalCrafts,
        };
    });
    console.log(`  새로고침 후: 배치 ${after.batch} · 큐 ${after.queue} · 대기품 ${after.pending} · 코인 ${after.coins} · 누적제작 ${after.crafts}`);
    // 증발하지 않았다 = 배치가 비었고(처리됨), 그 값이 어딘가로 갔다: 코인이 늘었거나 큐/대기품에 남았다.
    const recovered = after.batch === 0 && (after.coins > before.coins || after.queue + after.pending > 0);
    console.log(`  ${recovered ? 'PASS — 뽑은 장비가 증발하지 않고 판매(코인)/큐로 회수됐다' : 'FAIL — 해머만 나가고 결과물이 사라졌다'}`);
    if (!recovered) fail++;

    console.log(`\n콘솔 에러 ${errors.length}건`);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    console.log(fail === 0 ? '\n✅ PASS — 카드 N장 동시 노출 + 배치 지속성' : `\n❌ FAIL ${fail}건`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})();
