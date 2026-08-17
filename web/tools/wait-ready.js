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

module.exports = { waitReady };
