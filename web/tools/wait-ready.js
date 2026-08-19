// 캡처/계측 스크립트 공용 '준비될 때까지 기다리기' 헬퍼.
//
// 왜 필요한가 — page.waitForFunction 이 이 프로젝트에서 두 번 배신한다:
//  ① 최상위 렉시컬 전역(`const UI`, `let S`)은 window 프로퍼티가 아니라서 격리 컨텍스트에서 안 보인다.
//     (state.js/ui.js/forge.js 에서 window 접근자를 노출해 이 부분은 해소했다.)
//  ② 그걸 고쳐도 waitForFunction 의 내부 폴링(raf/타이머)이 **three.js + swiftshader 소프트웨어 렌더로
//     메인 스레드가 포화된 구간에서 아예 돌지 못해** 20초 타임아웃으로 죽는다 — 정작 page.evaluate 는
//     같은 시점에 정상 응답한다(실측). 그래서 폴링을 노드 쪽에서 돌리고 매 회 evaluate 로 확인한다.
//
// 사용:
//   const { waitReady } = require('./wait-ready.js');
//   await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"');
//   await waitReady(page, 'S && S.forgeLevel === 29', { timeout: 60000, label: '시드 로드' });
async function waitReady(page, exprSrc, opts = {}) {
    const timeout = opts.timeout || 60000;
    const interval = opts.interval || 250;
    const label = opts.label || exprSrc;
    const deadline = Date.now() + timeout;
    let last = null;
    while (Date.now() < deadline) {
        try {
            const ok = await page.evaluate(`(() => { try { return !!(${exprSrc}); } catch (e) { return false; } })()`);
            if (ok) return true;
        } catch (e) {
            last = e; // 내비게이션 중 컨텍스트 파괴 등 — 다음 회차에 다시 시도
        }
        await page.waitForTimeout(interval);
    }
    throw new Error('waitReady 타임아웃(' + timeout + 'ms): ' + label + (last ? ' / 마지막 오류: ' + String(last).slice(0, 200) : ''));
}

/* 🚨 **`UI` 가 정의됐다고 화면이 준비된 건 아니다.** `UI.init()` 이 `els` 를 채우기 전에
   `UI.els.craftModal.classList…` / `UI.renderEquipSheet()` 를 부르면 프로브가 통째로 터진다
   ("Cannot read/set properties of undefined"). 부팅이 빠른 런에서는 우연히 지나가고 느린 런에서만
   죽어서, **간헐 크래시 = 게임 결함**으로 오독되기 딱 좋다(2026-08-19 icon-gen 세션에서
   `probe-cell-icon-size` 는 상시 크래시로, `probe-skills-dom` 은 간헐 크래시로 각각 발견).
   ⚠️ 이 저장소의 프로브 상당수가 `waitReady(… typeof UI !== 'undefined' …)` 뒤에 곧바로
      `UI.els.*` 를 만진다 — 같은 병을 앓고 있을 가능성이 높다. 새 프로브는 이걸 쓸 것. */
async function waitUiReady(page, opts = {}) {
    return waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof S !== "undefined"',
        Object.assign({ label: 'UI.init() 이 els 를 채움' }, opts));
}

/* 🚨 **`UI.els` 가 찼다고 부팅이 끝난 것도 아니다 — 그리고 여기엔 훨씬 고약한 함정이 있다.**
   (2026-08-19 icon-gen 세션 실측. `probe-debug-icons` 가 이 사슬을 통째로 드러냈다.)

   `main.js` 의 `boot()` 는 단계마다 `blYield()` = `requestAnimationFrame(() => setTimeout(res, 0))`
   로 양보하는 **비동기 사슬**이다. `UI.init()` 은 그 사슬의 24% 지점이라 `waitUiReady` 는
   **부팅이 한참 남았을 때** 돌아온다. `?tab=` 딥링크·`restorePendingCraft`·자동 제작 재개 같은
   **뒷단계에 기대는 도구는 그 시점에 재면 아무것도 없는 화면을 잰다.**

   ⚠️ 그런데 진짜 함정은 이것이다 — **헤드리스에서 `page.evaluate` 한 번은 rAF 펌프를 멈춘다.**
   실측(`?tab=debug` 로 부팅, 1.5초 뒤 `UI.activeTab` 확인):
     ① evaluate 안 함        → tab='debug' 아이콘 13  (부팅 완주)
     ② goto 직후 evaluate 1번 → tab=null  아이콘 0   ← **부팅이 rAF 양보에서 멈춘다**
     ③ 300ms 뒤 evaluate 1번  → tab=null  아이콘 0
     ④ 1500ms 뒤(부팅 후) 1번 → tab='debug' 아이콘 13
     ⑤ goto 직후 evaluate 5번 → tab='debug' 아이콘 13  ← **계속 부르면 다시 돈다**
   즉 **한 번만 부르면 죽고, 계속 부르면 산다.** `waitReady` 계열이 헤드리스에서 잘 도는 이유가
   이거였다(폴링이 rAF 펌프를 계속 걷어차고 있었다). 반대로 **조건이 일찍 참이 돼 폴링을 일찍
   멈추면, 그 뒤 부팅은 아무도 안 걷어차서 그대로 굳는다** — `waitUiReady` 만 부른 도구가 딱 그
   모양이 된다. 고정 `waitForTimeout` 도 같은 이유로 못 구한다(태우는 건 노드 쪽 시간이다).

   그래서 **부팅 뒷단계에 기대는 도구는 이걸 쓸 것** — 폴링이 부팅 끝까지 이어져 두 문제를
   한꺼번에 없앤다. 판정 기준은 `boot()` 마지막 줄의 `blDone()`(로딩 오버레이에 `bl-done` 을
   붙이고 450ms 뒤 제거)이다. `boot()` 가 중간에 터져도 `.finally(blDone)` 이 붙여 주므로
   여기서 영원히 기다리는 일은 없다. */
async function waitBootDone(page, opts = {}) {
    return waitReady(page,
        'typeof UI !== "undefined" && UI.els && typeof S !== "undefined" && (() => { const b = document.getElementById("boot-loading"); return !b || b.classList.contains("bl-done"); })()',
        Object.assign({ label: 'boot() 완주(로딩 오버레이 해제)' }, opts));
}

module.exports = { waitReady, waitUiReady, waitBootDone };
