// 던전 클리어 보상 팝업을 탭바로 닫아도 **전투가 계속 도는가** (slug `dungeon-clear-popup-softlock`).
//
// 왜 이 자가 필요한가: 이건 화면이 안 깨지는 결함이다. 팝업은 얌전히 사라지고 배경도 멀쩡한데
// `Combat.phase` 만 `'dungeonClear'` 에 걸려 **방치형 게임의 방치 수익이 0** 이 된다. 눈검사·
// 스크린샷 비교로는 절대 안 잡히고(정지 화면이 정상 화면과 똑같이 생겼다), 사용자는 새로고침
// 말고는 회복 경로를 모른다. 그래서 **'시간이 흘렀을 때 전투 페이즈가 움직이는가'** 로 잰다.
//
// 🚨 **음성 대조를 같이 굽는다.** 이 판정의 축(페이즈 풀림·팝업 닫힘·루프 살아있음)은 전부
// '고쳐져 있으면 자동으로 참'인 값이라, 대조 없이는 이 자가 아무 빌드나 통과시킨다.
// `UI.resolveDungeonClear` 를 빈 함수로 갈아 끼워 **수리 이전 코드를 그 자리에서 재현**하고,
// 그 판이 반드시 FAIL 하는지까지 확인한다(FAIL 안 하면 자가 고장이므로 exit 2).
//
// ⚠️ **코인 증가량으로 재지 말 것**(첫 판에서 그렇게 짰다가 자가 고장으로 걸렸다). 등재 메모의
// '코인 +0' 은 맨몸 플레이 기준이고, 이 하네스는 디버그 시드를 태우므로 **전투와 무관한 수입**
// (오프라인 정산·자동 판매 등)이 계속 들어와 **멈춘 판에서도 코인이 는다**(실측: 고착 판 +99883).
// ⚠️ **살아있는 적 수로도 재지 말 것**(두 번째 판에서 그렇게 짰다가 또 걸렸다). 웨이브 사이
// `waveDelay` 구간에서는 정상 빌드도 순간적으로 0 이라, 표본을 언제 뜨느냐로 판정이 뒤집힌다.
// **남는 축은 `Combat.phase` 하나다.** 이 페이즈는 **타이머가 없고**(combat.js `stageClear`)
// 푸는 곳이 `finishDungeonClear()` 뿐이라, **'dungeonClear 를 벗어났다' = 정상 종결이 돌았다**
// 와 동치다. 여기에 **살아있음(liveness)** 표본을 하나 더 얹는다 — 시간을 두고 페이즈를 두 번
// 떠서 **한 번이라도 바뀌면 전투 루프가 실제로 돌고 있는 것**이다(고착 판은 계속 같은 값이다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const SC = require('./shot-screens-seed.js');

const IDLE_MS = 4000;      // 재개를 기다리는 창. 정상이면 leaveDungeon → stageDelay 0.8s → 본대 전투가 선다
const OUT = [];
const log = (s) => { OUT.push(s); console.log(s); };

async function run(page, { breakFix }) {
    await page.evaluate(SC.SEED_SRC);
    await page.waitForTimeout(400);
    // 수리를 무력화한 판 = 이 항목을 고치기 전의 closeOpened() 그대로
    if (breakFix) await page.evaluate(() => { UI.resolveDungeonClear = function () { }; });
    await page.evaluate(() => {
        S.dungeonKeys = 99;
        // 클리어를 기다리지 않고 **클리어 직후 상태를 직접 만든다** — 전투 시간에 기대면 런마다 흔들린다.
        Dungeons.enter('hammer', 1);
        Combat.stageClear();          // Dungeons.run 이 있으므로 onClear() + phase='dungeonClear'
    });
    await page.waitForTimeout(300);
    const armed = await page.evaluate(() => ({
        phase: Combat.phase,
        popup: !document.getElementById('dungeon-clear-modal').classList.contains('hidden'),
    }));
    if (armed.phase !== 'dungeonClear' || !armed.popup) {
        log(`  🚨 준비 실패 — phase=${armed.phase} popup=${armed.popup} (재현 하네스가 고장났다)`);
        return { setupFailed: true };
    }
    // 재현 경로 ⓐ: 상점 탭을 열고 같은 탭을 다시 눌러 닫는다(= X 상태 재클릭 = closeOpened)
    await page.evaluate(() => UI.onTabClick('shop'));
    await page.waitForTimeout(120);
    await page.evaluate(() => UI.onTabClick('shop'));
    // 살아있음 표본 — 시간을 두고 페이즈를 여러 번 떠서 '값이 한 번이라도 바뀌는가'를 본다.
    const seen = [];
    for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(IDLE_MS / 8);
        seen.push(await page.evaluate(() => Combat.phase));
    }
    const after = await page.evaluate(() => ({
        phase: Combat.phase,
        popup: !document.getElementById('dungeon-clear-modal').classList.contains('hidden'),
    }));
    return { ...after, moved: new Set(seen).size > 1, seen: [...new Set(seen)].join('>') };
}

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 497, height: 890 } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; });

    log('① 제품 판 — 클리어 팝업이 뜬 채로 상점 탭 열고 닫기');
    const prod = await run(page, { breakFix: false });
    if (prod.setupFailed) { await browser.close(); process.exit(2); }
    log(`   phase=${prod.phase} · 팝업열림=${prod.popup} · 루프 살아있음=${prod.moved} (${prod.seen})`);

    // 같은 페이지에서 대조를 돌리면 앞 런의 상태가 남는다 — 새 페이지로 갈아탄다.
    await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; });
    log('② 음성 대조 — 수리를 무력화한 판(resolveDungeonClear 를 빈 함수로)');
    const neg = await run(page, { breakFix: true });
    if (neg.setupFailed) { await browser.close(); process.exit(2); }
    log(`   phase=${neg.phase} · 팝업열림=${neg.popup} · 루프 살아있음=${neg.moved} (${neg.seen})`);

    await browser.close();

    // 제품: 페이즈가 dungeonClear 를 벗어났고(=정상 종결이 돌았다) 루프가 실제로 돌고 있다.
    const prodOk = prod.phase !== 'dungeonClear' && !prod.popup && prod.moved;
    // 대조: 페이즈가 dungeonClear 에 고착이고 표본 내내 한 번도 안 움직인다 = 등재 메모의 그 정지 상태.
    const negBroken = neg.phase === 'dungeonClear' && !neg.moved;
    log('');
    log(`콘솔 에러 ${errs.length}건` + (errs.length ? ' — ' + errs.slice(0, 3).join(' / ') : ''));
    if (!negBroken) {
        log(`\n🚨 측정기 고장 — 음성 대조가 안 깨졌다(phase=${neg.phase}, 루프 살아있음=${neg.moved}).`
            + ' 이 자는 소프트락을 못 본다는 뜻이니 수치를 쓰지 말 것.');
        process.exit(2);
    }
    log(`  음성 대조는 정상으로 깨졌다(phase=dungeonClear 고착 · 표본 내내 부동) → 이 자는 소프트락을 본다 ✔`);
    if (!prodOk || errs.length) {
        log('\n❌ FAIL — 탭바로 팝업을 닫은 뒤 전투가 재개되지 않는다(소프트락).');
        process.exit(1);
    }
    log('\n✅ PASS — 탭바로 닫아도 페이즈가 풀리고 본대 전투가 다시 선다');
})();
