// 제작 비교 팝업(판매/장착 강제 선택)이 뜬 채로 새로고침하면 제작품이 장착도 판매도
// 되지 않고 사라지던 버그의 회귀 검증 도구.
// 전투 수입 간섭을 없애려고 Combat.tick을 무력화한 뒤 세 경로를 잰다:
//   (A) 탭 전환      — UI.onTabClick('summon')으로 팝업을 접는다 → autoResolve로 장착돼야 한다
//                     ('방' 탭은 2026-08-18 사용자 지시로 삭제 — 남은 시트 탭인 소환으로 옮겼다)
//   (B) 새로고침      — 팝업이 뜬 채로 F5 → 제작품이 살아 있어야 한다
//   (C) 직접 선택 후 새로고침 — [장착]을 고른 뒤 F5 → 정확히 1개만 남아야 한다(복제 금지)
// (B)의 '살아 있다'는 두 형태를 모두 인정한다 — 부팅 시 자동 판정으로 장착되거나(구현 A),
// 비교 팝업이 그대로 복원돼 선택권이 남거나(구현 B, 현재 코드). 둘 다 유실이 아니다.
// 해머만 빠지고 아무 데도 남지 않으면 실패.
//
// 주의: 판정 근거를 코인 증가로 잡으면 안 된다 — 방치 수입과 구분되지 않아 수정 전 코드에서도
// 통과해 버린다. 그래서 장착칸을 비워 autoResolve가 반드시 '장착' 가지를 타게 하고,
// 결과를 아이템 '이름'으로 대조한다.
// 사용: node probe-craft-unload.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 팝업이 실제로 뜰 때까지 제작을 반복한다(자동 제련 설정에 따라 바로 안 뜰 수 있다).
const SETUP = () => {
    Combat.tick = function () {}; // 전투 수입이 코인/장비를 흔들지 않게
    S.autoForgeOn = false;
    S.hammers = 100;
    saveGame();
};

// 장착 장비는 S.equipment[slot], 코인은 Big 이라 문자열을 거쳐 수로 읽는다.
const SNAP = () => ({
    hammers: S.hammers,
    coins: Number(String(S.coins)) || 0,
    equippedCount: Object.values(S.equipment || {}).filter(Boolean).length,
    equippedName: (Object.values(S.equipment || {}).filter(Boolean)[0] || {}).name || null,
    pending: UI._pendingItem ? UI._pendingItem.name : null,
    savedPending: S.pendingCraft ? S.pendingCraft.name : null,
    craftOpen: !document.getElementById('craft-modal').classList.contains('hidden'),
});

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    let fail = 0;

    for (const mode of ['A-탭전환', 'B-새로고침', 'C-직접선택후새로고침']) {
        const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
        page.on('pageerror', e => errs.push(`${mode} ${e.message}`));
        page.on('console', m => { if (m.type() === 'error') errs.push(`${mode} ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 20000 });
        await page.waitForTimeout(500);

        await page.evaluate(SETUP);
        const before = await page.evaluate(SNAP);

        // 비교 팝업이 뜰 때까지 제작. 장착칸을 비워 두면 autoResolve가 반드시 '장착' 가지를
        // 타므로(빈 슬롯보다 약한 장비는 없다), 결과를 이름으로 정확히 확인할 수 있다 —
        // '판매' 가지는 코인만 늘어 방치 수입과 구분되지 않는다.
        const opened = await page.evaluate(async () => {
            S.equipment = {};
            for (let i = 0; i < 12; i++) {
                UI.onCraft();
                await new Promise(r => setTimeout(r, 120));
                if (!document.getElementById('craft-modal').classList.contains('hidden')) { S.equipment = {}; return true; }
            }
            return false;
        });
        const mid = await page.evaluate(SNAP);

        if (!opened) {
            console.log(`\n== ${mode} == 비교 팝업이 뜨지 않아 측정 불가 (craftOpen=${mid.craftOpen})`);
            fail++; await page.close(); continue;
        }

        if (mode === 'A-탭전환') {
            await page.evaluate(() => UI.onTabClick('summon'));
            await page.waitForTimeout(300);
        } else if (mode === 'C-직접선택후새로고침') {
            // 사용자가 [장착]을 직접 고른 뒤 새로고침 — 세이브의 대기품이 남아 있으면
            // 부팅 복구가 같은 장비를 한 번 더 지급해(복제) 버린다. 정확히 1개여야 한다.
            await page.evaluate(() => UI.resolveCraft('equip'));
            await page.waitForTimeout(300);
            await page.reload({ waitUntil: 'load' });
            await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 20000 });
            await page.evaluate(() => { Combat.tick = function () {}; });
            await page.waitForTimeout(500);
        } else {
            await page.reload({ waitUntil: 'load' });
            await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 20000 });
            await page.evaluate(() => { Combat.tick = function () {}; });
            await page.waitForTimeout(500);
        }
        const after = await page.evaluate(SNAP);

        // 해머 소모는 '제작 시점'(before→mid)에만 잰다 — 새로고침 뒤에는 해머가 다시 차올라
        // before→after 차이로는 소모를 판정할 수 없다.
        const hammerSpent = before.hammers - mid.hammers;
        // 제작품이 실제로 살아남았는지는 이름으로 확인한다. 코인 증가는 방치 수입과
        // 구분되지 않아 판정 근거가 못 된다(수정 전에도 +12가 찍힌다).
        // 제작품이 살아남은 형태 두 가지 — 장착됐거나(자동 판정), 팝업이 복원돼 아직 고를 수 있거나.
        const equipped = after.equippedName === mid.pending && after.equippedCount === 1;
        const restored = after.pending === mid.pending && after.craftOpen;
        let ok, how;
        if (mode === 'C-직접선택후새로고침') {
            // 이미 사용자가 고른 뒤라 복원되면 안 된다 — 정확히 1개 장착, 대기품 흔적 없음.
            ok = hammerSpent > 0 && equipped && !after.pending && !after.savedPending;
            how = equipped ? '장착 1개(복제 없음)' : '유실 또는 복제';
        } else {
            ok = hammerSpent > 0 && (equipped || restored);
            how = equipped ? '자동 판정으로 장착' : restored ? '비교 팝업 복원(선택권 유지)' : '유실';
        }
        if (!ok) fail++;
        console.log(`\n== ${mode} == ${ok ? 'OK' : 'FAIL'} — ${how}`);
        console.log(`  제작 대기품: ${mid.pending}`);
        console.log(`  해머 ${before.hammers} → ${mid.hammers} (제작 소모 ${hammerSpent}) → ${after.hammers}`);
        console.log(`  정리 후 장착품: ${after.equippedName} / 장착 수 ${mid.equippedCount} → ${after.equippedCount}`);
        console.log(`  _pendingItem: ${after.pending} / S.pendingCraft: ${after.savedPending} / 팝업 열림: ${after.craftOpen}`);
        await page.close();
    }

    console.log(`\n실패 ${fail}건 / 콘솔 에러 ${errs.length}건`);
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fail || errs.length ? 1 : 0);
})();
