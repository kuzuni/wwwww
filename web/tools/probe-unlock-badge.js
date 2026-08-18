// 해금 표시 즉시 반영 검증 (QA 9차 버그): 스테이지 2-10 클리어로 오토 포지가 해금되면
// 장비 시트 [자동🔄] 버튼이 다음 tickSecond 안에 🔒 → OFF 로 바뀌어야 한다.
//  ① 해금 전: 🔒 + disabled  ② 실제 stageClear 경로로 2-10 클리어  ③ 1초 틱 뒤 OFF + disabled 해제 + 해금 토스트
//  ④ 부팅 시점에 이미 해금돼 있으면 토스트가 뜨지 않는다(중복 알림 방지)
// 사용: node probe-unlock-badge.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

// 페이지 안에서 쓰는 헬퍼 — 매 evaluate마다 주입한다
// ⚠️ 잠김 표시는 더 이상 🔒 **이모지가 아니다** — icon-gen 이 `IconGen.img('lock')` 으로 바꿔서
// `textContent` 에는 아무것도 안 남는다(이 프로브가 그 뒤로 계속 FAIL 이었다). 아이콘 **노드**로 본다.
const BTN_SRC = `(() => {
    const b = [...document.querySelectorAll('#equip-sheet button')].find(x => /자동/.test(x.textContent));
    return b ? { txt: b.textContent.replace(/\\s+/g, ''), disabled: b.className.includes('disabled'),
                 locked: !!b.querySelector('[class*="ico-lock"]') } : null;
})()`;
const btnState = page => page.evaluate(BTN_SRC);

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
    await page.waitForFunction(() => typeof UI !== 'undefined' && typeof S !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(400);

    // ① 해금 전 상태 — 2-9까지만 도달시키고 시트를 다시 그린다
    await page.evaluate(() => {
        if (typeof Scene3D !== 'undefined') Scene3D.update = function () {};
        S.bestChapter = 2; S.bestStage = 9; S.chapter = 2; S.stage = 9;
        UI._unlockSeen = null;          // 새 부팅과 같은 기준
        UI.renderEquipSheet(); UI.tickSecond();
    });
    const before = await btnState(page);
    ok(before && before.locked, `해금 전 버튼에 자물쇠 아이콘이 없음: ${JSON.stringify(before)}`);
    ok(before && before.disabled, '해금 전 버튼에 disabled 클래스가 없음');

    // ② 실제 클리어 경로 — Combat.stageClear()가 도는 동안 renderEquipSheet는 불리지 않는다
    await page.evaluate(() => {
        S.chapter = 2; S.stage = 10;
        document.querySelectorAll('.toast').forEach(t => t.remove());
        Combat.stageClear();
    });
    const justAfter = await btnState(page);
    ok(justAfter && justAfter.locked, `stageClear 직후에 이미 갱신됨(테스트 전제 확인용, 실패 아님): ${JSON.stringify(justAfter)}`);

    // ③ 1초 틱 뒤 — 자동 갱신 + 토스트
    await page.waitForTimeout(1400);
    const after = await page.evaluate(`({
        btn: ${BTN_SRC}, unlocked: isUnlocked('autoForge'),
        toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|'),
    })`);
    ok(after.unlocked, 'isUnlocked(autoForge)가 여전히 false');
    ok(after.btn && /OFF/.test(after.btn.txt) && !after.btn.locked, `틱 후에도 잠김 표시: ${JSON.stringify(after.btn)}`);
    ok(after.btn && !after.btn.disabled, 'disabled 클래스가 남아 있음');
    ok(/해금/.test(after.toast), `해금 토스트 미출력: "${after.toast}"`);

    // ④ 이미 해금된 상태로 부팅하면 토스트 없음
    await page.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); UI._unlockSeen = null; });
    await page.waitForTimeout(1400);
    const boot = await page.evaluate(() => [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|'));
    ok(!/해금/.test(boot), `이미 해금된 상태에서 토스트가 떴다: "${boot}"`);

    console.log('before:', JSON.stringify(before), '\nafter :', JSON.stringify(after));
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    console.log(fails.length ? '❌ FAIL\n - ' + fails.join('\n - ') : '✅ PASS — 해금 즉시 표시 갱신');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
