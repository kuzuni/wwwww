// 디버그 탭 '재화 지급' 토스트가 **버튼과 같은 한글 라벨**을 쓰는지 검증한다 (slug: debug-currency-toast-kr).
//
// 이 버그는 두 번 났다 — 데이터 필드가 `label` → `kr` 로 바뀌었는데 토스트 쪽 조회만 `?.label` 로
// 남아 폴백인 **내부 상태 키**(`eggCurrency`·`potions`…)가 그대로 노출됐다. 그래서 이 프로브는
// '한글이 뜨는가'가 아니라 **버튼 라벨과 토스트 라벨이 같은가**를 계약으로 건다 — 표시 이름이
// 어느 필드에서 오든, 두 자리가 갈라지는 순간 FAIL 이 난다.
//
// ⚠️ 함정 — 토스트를 `textContent` 로 읽으면 아이콘이 안 보여 통과처럼 읽힌다. 반대로 버튼은
//    `IconGen.img()` 아이콘 노드를 앞에 달고 있어서 `textContent` 에 아이콘이 안 섞인다.
//    양쪽 다 **텍스트 노드만** 모아 같은 기준으로 비교한다.
//
// 사용: PW_PATH=... node probe-debug-currency-toast.js
//       node probe-debug-currency-toast.js --regress   ← 고치기 전 코드(`?.label`)를 재현해 FAIL 이 나는지 확인
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REGRESS = process.argv.includes('--regress');

// 기대 라벨 — TODO 항목의 '기대 동작'에 적힌 값 그대로 (버튼 라벨과 같아야 한다)
const EXPECT = {
    hammers: '해머', coins: '코인', gems: '젬', tickets: '티켓',
    winders: '태엽', potions: '물약', eggCurrency: '깨진 알',
};

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX + '?tab=debug');
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.activeTab === 'debug', null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);   // 폰트 전 프레임 실측 금지(인계 메모 ㉠)
    await page.waitForTimeout(300);

    if (REGRESS) {
        // 고치기 전 경로를 그대로 되살린다 — 프로브가 진짜로 판별하는지 확인하는 용도.
        await page.evaluate(() => {
            UI.onDebugAddCurrency = function (key) {
                S[key] = (S[key] || 0) + 100000;
                const label = this.DEBUG_CURRENCIES.find(c => c.key === key)?.label || key;
                this.toast(`${label} +100000`);
            };
        });
    }

    const r = await page.evaluate(async (keys) => {
        // 요소에서 **텍스트 노드만** 이어 붙인다(아이콘 노드는 제외).
        const textOf = el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
        const out = [];
        for (const key of keys) {
            const btn = [...UI.els.panels.debug.querySelectorAll('button')]
                .find(b => (b.getAttribute('onclick') || '').includes(`onDebugAddCurrency('${key}')`));
            if (!btn) { out.push({ key, err: '버튼 없음' }); continue; }
            const btnLabel = textOf(btn).replace(/\s*\+100000$/, '');
            // ⚠️ 전투 루프가 계속 돌아 `🏆 1-1 첫 클리어! 🪙+60` 같은 **남의 토스트가 끼어든다**
            //    (실측으로 밟았다 — '젬' 자리에 클리어 토스트가 잡혀 가짜 FAIL 이 났다).
            //    앞을 비우는 것만으로는 부족하고, **클릭으로 새로 생긴 것 중 `+100000` 짜리**를 골라야 한다.
            const before = new Set(UI.els.toasts.children);
            btn.click();
            await new Promise(res => setTimeout(res, 60));
            const fresh = [...UI.els.toasts.children].filter(n => !before.has(n));
            const t = fresh.reverse().find(n => textOf(n).endsWith('+100000'));
            const toastLabel = t ? textOf(t).replace(/\s*\+100000$/, '') : '(토스트 없음)';
            out.push({ key, btnLabel, toastLabel });
        }
        return out;
    }, Object.keys(EXPECT));

    let bad = 0;
    console.log('key            버튼라벨      토스트라벨    기대        판정');
    for (const row of r) {
        const exp = EXPECT[row.key];
        // ① 토스트가 기대 한글과 같은가 ② 버튼과 토스트가 같은가 ③ 내부 키가 새지 않았는가
        const ok = !row.err && row.toastLabel === exp && row.btnLabel === exp && row.toastLabel !== row.key;
        if (!ok) bad++;
        console.log(
            `${row.key.padEnd(14)} ${String(row.btnLabel ?? row.err).padEnd(12)} ` +
            `${String(row.toastLabel ?? '-').padEnd(12)} ${exp.padEnd(10)} ${ok ? 'PASS' : 'FAIL'}`);
    }
    console.log(`\n판정: ${r.length - bad}/${r.length} PASS · 불일치 ${bad}건 · 콘솔 에러 ${errs.length}건`);
    if (errs.length) console.log('  ' + errs.join('\n  '));

    // 라벨 없는 키에 콘솔 경고가 붙는지 — 조용한 폴백이 이 버그를 두 번 숨겼다.
    if (!REGRESS) {
        const warns = [];
        page.on('console', m => m.type() === 'warning' && warns.push(m.text()));
        const fell = await page.evaluate(() => UI.debugCurrencyLabel('존재하지않는키'));
        await page.waitForTimeout(80);
        const warnOk = fell === '존재하지않는키' && warns.some(w => w.includes('존재하지않는키'));
        console.log(`미등록 키 폴백: '${fell}' · 콘솔 경고 ${warns.length}건 → ${warnOk ? 'PASS' : 'FAIL'}`);
        if (!warnOk) bad++;
    }

    await browser.close();
    process.exit(bad === 0 && errs.length === 0 ? 0 : 1);
})();
