// 수령 연출이 **누른 버튼에서** 터지는가 (`reward-claim-fx` 규약, slug `shop-deal-burst-anchor`).
//
// 왜 이 자가 필요한가: 이건 **인자 하나가 안 넘어가면 조용히 생기는** 결함이다. 지급액은 정확하고
// 콘솔도 깨끗하고 카드도 '수령 완료'로 바뀐다 — 오직 이펙트 **스폰 좌표**만 화면 한가운데로 간다.
// 그러면 엉뚱한 카드 위에 `+300🔨` 가 떠서 **다른 거래를 수령한 것처럼 보인다.** 정적 검사로는
// `onClaimDeal(key, btn)` 의 `btn` 이 옵셔널인지 필수인지 구별이 안 되고(이 저장소엔 진짜 옵셔널
// 인자를 쓰는 메서드가 여럿이다), 스크린샷 비교로는 연출이 한 프레임짜리라 안 잡힌다.
//
// 그래서 **DOM 에서 실제 스폰 좌표를 떠서 버튼 중심과의 거리**를 잰다.
// 🚨 **음성 대조 내장** — `this` 를 안 넘기던 옛 호출부를 그 자리에서 재현해(핸들러를 감싸 `btn` 을
// 지운다) 그 판이 반드시 멀리 터지는지 확인한다. 대조가 안 깨지면 이 자는 아무 빌드나 통과시킨다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');

const NEAR = 60;   // 버튼 중심에서 이 거리(px) 안이면 '버튼에서 터졌다'. 버튼 자체가 100px 남짓이다
const log = (s) => console.log(s);

async function measure(page, { breakFix }) {
    await page.evaluate(() => {
        document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
        UI.openShop();
    });
    await page.waitForTimeout(300);
    if (breakFix) {
        // 옛 호출부 재현 — 템플릿이 `this` 를 안 넘기던 판과 동치다(btn === undefined).
        await page.evaluate(() => {
            const orig = UI.onClaimDeal.bind(UI);
            UI.onClaimDeal = (key) => orig(key, undefined);
        });
    }
    const r = await page.evaluate(async () => {
        const btn = document.querySelector('.shop-price-btn:not(.disabled)');
        if (!btn) return { noButton: true };
        const b = btn.getBoundingClientRect();
        const bx = b.left + b.width / 2, by = b.top + b.height / 2;
        btn.click();
        await new Promise(r => requestAnimationFrame(r));
        // 연출 조각은 #reward-burst 레이어에 잠깐 산다 — 뜬 즉시 좌표를 뜬다.
        const fx = [...document.querySelectorAll('#reward-burst *')]
            .map(e => e.getBoundingClientRect())
            .filter(q => q.width || q.height);
        if (!fx.length) return { noFx: true, bx, by };
        // 스폰점 대표값 = 조각들의 중심 중앙값(퍼지는 중이라 평균보다 중앙값이 안정적이다)
        const mid = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
        const fxx = mid(fx.map(q => q.left + q.width / 2));
        const fyy = mid(fx.map(q => q.top + q.height / 2));
        return { bx, by, fxx, fyy, n: fx.length, appW: document.getElementById('app').getBoundingClientRect().width };
    });
    if (r.noButton || r.noFx) return r;
    r.dist = Math.round(Math.hypot(r.fxx - r.bx, r.fyy - r.by));
    return r;
}

(async () => {
    const browser = await chromium.launch();
    const errs = [];
    const open = async () => {
        const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
        page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
        page.on('pageerror', (e) => errs.push(String(e)));
        await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
        await page.waitForFunction(() => typeof UI !== 'undefined' && typeof Shop !== 'undefined', null, { timeout: 60000 });
        await page.evaluate(() => { if (window.Scene3D) Scene3D.update = function () { }; });
        await page.waitForTimeout(400);
        return page;
    };

    const p1 = await open();
    const prod = await measure(p1, { breakFix: false });
    await p1.close();
    if (prod.noButton || prod.noFx) {
        log(`🚨 준비 실패 — ${prod.noButton ? '수령 가능한 특가 버튼이 없다' : '연출 조각이 안 떴다'} (하네스 고장)`);
        await browser.close(); process.exit(2);
    }
    log('① 제품 판 — 상점 오늘의 특가 첫 카드 수령');
    log(`   버튼 중심 (${Math.round(prod.bx)}, ${Math.round(prod.by)}) · 연출 스폰 (${Math.round(prod.fxx)}, ${Math.round(prod.fyy)}) · 거리 ${prod.dist}px · 조각 ${prod.n}개`);

    const p2 = await open();
    const neg = await measure(p2, { breakFix: true });
    await p2.close();
    if (neg.noButton || neg.noFx) { log('🚨 대조 준비 실패'); await browser.close(); process.exit(2); }
    log('② 음성 대조 — `this` 를 안 넘기던 옛 호출부 재현');
    log(`   버튼 중심 (${Math.round(neg.bx)}, ${Math.round(neg.by)}) · 연출 스폰 (${Math.round(neg.fxx)}, ${Math.round(neg.fyy)}) · 거리 ${neg.dist}px`);

    await browser.close();
    log('');
    log(`콘솔 에러 ${errs.length}건` + (errs.length ? ' — ' + errs.slice(0, 3).join(' / ') : ''));
    if (!(neg.dist > NEAR)) {
        log(`\n🚨 측정기 고장 — 음성 대조가 안 깨졌다(거리 ${neg.dist}px ≤ ${NEAR}). 이 자는 스폰 어긋남을 못 본다.`);
        process.exit(2);
    }
    log(`  음성 대조는 정상으로 깨졌다(거리 ${neg.dist}px — 화면 중앙 폴백) → 이 자는 스폰점을 본다 ✔`);
    if (prod.dist > NEAR || errs.length) {
        log(`\n❌ FAIL — 수령 연출이 누른 버튼(±${NEAR}px)에서 안 터진다: ${prod.dist}px`);
        process.exit(1);
    }
    log(`\n✅ PASS — 수령 연출이 누른 버튼에서 터진다 (${prod.dist}px ≤ ${NEAR})`);
})();
