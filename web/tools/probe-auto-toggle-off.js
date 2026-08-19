// 메인 [자동 ON/OFF] 버튼 동작 검증 (사용자 지시 2026-08-19 `auto-toggle-click-off`)
//   "자동 OFF/자동 ON 버튼, 그거 자동모드일 때 클릭하면 자동모드 끝난 거로 처리하기."
// 검사 항목
//  ① 자동 OFF 상태에서 누르면 종전대로 자동 제련 설정 팝업이 열린다
//  ② 자동 ON(배치가 도는 중)에서 누르면 **즉시 종료** — autoForgeOn=false · 시퀀스 없음 ·
//     망치질 연출(.striking) 정지 · 설정 팝업은 안 열림 · 이후 망치가 더 안 줄어든다
//  ③ 버튼 라벨이 ON → OFF 로 돌아온다
//  ④ 해금 전(2-10 미도달)에는 아무 일도 없다(안내 토스트만)
//  ⑤ 콘솔 에러 0
// 사용: node probe-auto-toggle-off.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

const AUTO_BTN = '.forge-actions .btn.sm:last-child';

async function until(page, fnSrc, ms = 8000) {
    const t0 = Date.now();
    for (;;) {
        if (await page.evaluate(fnSrc).catch(() => false)) return true;
        if (Date.now() - t0 > ms) return false;
        await page.waitForTimeout(50);
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
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.craftModal && typeof S !== 'undefined', null, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        Combat.tick = function () {};
        S.bestChapter = 5; S.bestStage = 9; S.hammers = 200; S.forgeLevel = 20;
        S.autoForgeOn = false; UI._autoSeq = null; UI.clearPendingCraft();
        S.autoMatchQueue = [];
        UI.els.craftModal.classList.add('hidden');
        UI.closeAutoForge();
        UI.switchTab('forge');
        UI.renderEquipSheet();
    });

    // ---- ④ 해금 전: 눌러도 팝업이 안 열리고 자동도 안 켜진다 ----
    await page.evaluate(() => { S.bestChapter = 1; S.bestStage = 1; UI.renderEquipSheet(); });
    await page.click(AUTO_BTN, { force: true });
    const locked = await page.evaluate(() => ({
        modal: !UI.els.autoForgeModal.classList.contains('hidden'), on: S.autoForgeOn,
    }));
    ok(!locked.modal && !locked.on, `④ 해금 전인데 팝업/자동이 켜졌다 ${JSON.stringify(locked)}`);
    await page.evaluate(() => { S.bestChapter = 5; S.bestStage = 9; UI.renderEquipSheet(); });

    // ---- ① 자동 OFF에서 누르면 설정 팝업 ----
    await page.click(AUTO_BTN, { force: true });
    const offClick = await page.evaluate(() => ({
        modal: !UI.els.autoForgeModal.classList.contains('hidden'), on: S.autoForgeOn,
    }));
    ok(offClick.modal, '① 자동 OFF에서 눌렀는데 설정 팝업이 안 열렸다');
    ok(!offClick.on, '① 설정 팝업만 열려야 하는데 자동이 바로 켜졌다');

    // ---- ② 자동 ON(도는 중)에서 누르면 즉시 종료 ----
    await page.evaluate(() => {
        S.autoForge = { keepAges: [], filterOn: false, filterSubs: [], hammersPerBatch: 10, stopOnTarget: false };
        S.hammers = 200;
        UI.onToggleAutoForge();          // 설정 팝업의 [시작]과 같은 경로
    });
    ok(await until(page, `S.autoForgeOn === true && !!UI._autoSeq`, 4000), '② 자동 제련이 시작되지 않았다(전제 실패)');
    ok(await until(page, `document.querySelector('.anvil-btn.striking') !== null`, 5000), '② 망치질 연출이 관측되지 않았다(전제 실패)');
    await page.click(AUTO_BTN, { force: true });
    const off = await page.evaluate(() => ({
        on: S.autoForgeOn, seq: !!UI._autoSeq,
        striking: !!document.querySelector('.anvil-btn.striking'),
        modal: !UI.els.autoForgeModal.classList.contains('hidden'),
        label: (document.querySelector('.forge-actions .btn.sm:last-child') || {}).textContent || '',
        h: S.hammers,
    }));
    ok(!off.on, '② 자동 ON에서 버튼을 눌렀는데 자동모드가 안 꺼졌다');
    ok(!off.seq, '② 껐는데 시퀀스(_autoSeq)가 남아 있다');
    ok(!off.striking, '② 껐는데 망치질 연출이 계속 돈다');
    ok(!off.modal, '② 껐을 뿐인데 설정 팝업이 열렸다 (ON 상태 클릭은 종료여야 한다)');
    ok(/OFF/.test(off.label), `③ 버튼 라벨이 OFF로 안 돌아왔다 (${JSON.stringify(off.label.trim())})`);
    await page.waitForTimeout(2500);      // 안전망 틱(3초)·잔여 타이머가 다시 돌리지 않는지
    const later = await page.evaluate(() => ({ on: S.autoForgeOn, seq: !!UI._autoSeq, h: S.hammers }));
    ok(!later.on && !later.seq, '② 껐는데 잠시 뒤 자동이 되살아났다');
    ok(later.h === off.h, `② 껐는데 망치가 계속 줄었다 (${off.h} → ${later.h})`);

    ok(errs.length === 0, `⑤ 콘솔 에러 ${errs.length}건: ${errs.slice(0, 3).join(' | ')}`);
    console.log(`① OFF 클릭 → 설정 팝업 ${offClick.modal} · ② ON 클릭 → 종료(on=${off.on} seq=${off.seq} 망치질=${off.striking} 팝업=${off.modal} 망치 ${off.h}→${later.h}) · ④ 해금 전 무반응`);
    console.log(fails.length ? `❌ FAIL (${fails.length}건)\n` + fails.join('\n') : '✅ PASS — 자동 ON에서 버튼 클릭 = 자동모드 즉시 종료');
    await browser.close();
    process.exit(fails.length ? 1 : 0);
})();
