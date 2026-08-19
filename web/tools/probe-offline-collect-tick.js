// 오프라인 보상 [수집] 버튼이 매초 재렌더로 씹히지 않는지 검증 (slug: offline-collect-tick-rerender).
//
// 버그: tickSecond 가 팝업이 열린 동안 매초 `showOffline` 을 다시 불러 팝업 전체를 innerHTML 로
//   새로 그렸다 → [수집] 버튼 노드가 통째로 교체되고, 그 찰나에 눌린 클릭이 옛 노드로 가 씹혔다
//   (실측 ~1.7%). 처방: 숫자 span 만 id 로 갱신(`updateOfflineValues`), 버튼 노드는 그대로 둔다.
//
// 재는 것: 팝업을 열고 tickSecond 를 여러 번 강제로 돌린 뒤
//   ① [수집] 버튼 노드가 **처음 그대로**인가(재생성 0회 — WeakRef 로 동일 노드 확인)
//   ② 그런데도 수집 시간·코인·해머 **숫자는 갱신**되는가(정지 아님)
//   ③ 빠르게 반복 클릭해도 매번 수집이 실행되는가(노드가 안 갈리므로 유실 0)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX);
    await page.waitForFunction('typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof pendingOffline === "function"');

    // 오프라인이 상한 아래로 쌓인 상태(2분)에서 팝업을 연다 — 매초 숫자가 자라는 걸 보려면 상한 밑이어야 한다.
    const res = await page.evaluate(() => {
        S.lastOfflineClaim = U.now() - 120 * 1000;   // 2분 — 오프라인 상한 아래에서 시작해 숫자가 자라게
        UI.showOffline(pendingOffline());
        const btn0 = document.querySelector('#offline-modal .offline-collect-btn');
        window.__btnRef = btn0;   // 같은 노드인지 나중에 === 로 비교
        const readNums = () => ({
            counted: (document.getElementById('offline-counted') || {}).textContent,
            coins: (document.getElementById('offline-coins') || {}).textContent,
            hammers: (document.getElementById('offline-hammers') || {}).textContent,
        });
        window.__nums0 = readNums();
        // 누적이 자라도록 기준 시각을 뒤로 더 밀며 tickSecond 를 8번 돌린다.
        let replaced = 0;
        for (let i = 0; i < 8; i++) {
            S.lastOfflineClaim -= 20 * 1000;   // 20초씩 더 쌓인 것처럼(상한 아래 유지)
            UI.tickSecond();
            const now = document.querySelector('#offline-modal .offline-collect-btn');
            if (now !== window.__btnRef) replaced++;   // 노드가 갈렸으면 카운트
        }
        return { replaced, nums0: window.__nums0, nums1: readNums(), open: !document.getElementById('offline-modal').classList.contains('hidden') };
    });

    // 빠른 반복 클릭 유실 검사 — 노드가 안 갈리므로 매번 실행돼야 한다.
    const click = await page.evaluate(async () => {
        // 팝업을 다시 열고(닫혔을 수 있음), onCollectOffline 이 부르는 실지급 함수를 스파이한다.
        S.lastOfflineClaim = U.now() - 4 * 3600 * 1000;
        UI.showOffline(pendingOffline());
        let exec = 0;
        const orig = UI.onCollectOffline.bind(UI);
        UI.onCollectOffline = function () { exec++; S.lastOfflineClaim = U.now() - 4 * 3600 * 1000; return orig(); };
        const btn = document.querySelector('#offline-modal .offline-collect-btn');
        let miss = 0;
        for (let i = 0; i < 40; i++) {
            UI.tickSecond();   // 매 클릭 사이에 틱을 끼워 재렌더 유무를 압박
            const b = document.querySelector('#offline-modal .offline-collect-btn');
            if (!b) { miss++; continue; }
            const before = exec;
            b.click();
            if (exec === before) miss++;
        }
        return { exec, miss };
    });
    await browser.close();

    let fail = 0;
    console.log(`팝업 tickSecond 8회 — 버튼 노드 재생성 ${res.replaced}회 (0이어야 함) · 팝업 열림=${res.open}`);
    console.log(`  숫자 갱신: 수집시간 ${res.nums0.counted}→${res.nums1.counted} · 코인 ${res.nums0.coins}→${res.nums1.coins} · 해머 ${res.nums0.hammers}→${res.nums1.hammers}`);
    console.log(`  반복 클릭 40회(사이사이 tick) — 실행 ${click.exec} · 유실 ${click.miss}`);
    if (res.replaced !== 0) { console.log('  ✗ 버튼 노드가 재생성됐다 — showOffline 을 매초 다시 부르는 경로가 남았다'); fail++; }
    else console.log('  ✓ 버튼 노드 유지(재생성 0)');
    if (res.nums0.counted === res.nums1.counted && res.nums0.coins === res.nums1.coins) { console.log('  ✗ 숫자가 안 자란다 — 갱신 경로가 죽었다(과잉 정지)'); fail++; }
    else console.log('  ✓ 숫자 갱신 정상');
    if (click.miss !== 0) { console.log(`  ✗ 반복 클릭에서 ${click.miss}회 유실 — 노드 교체가 남아 있다`); fail++; }
    else console.log('  ✓ 반복 클릭 유실 0');
    if (errs.length) { console.log(`  🚨 콘솔 에러 ${errs.length}건:`); errs.slice(0, 5).forEach(e => console.log('     · ' + e)); fail++; }
    console.log(fail ? `\n결과: FAIL ${fail}건` : '\n결과: PASS');
    process.exit(fail ? 2 : 0);
})();
