// 부팅(게임 시작) 렉 판정기 — startup-lag-loading
// 구조: 시작 렉의 본체는 첫 렌더의 셰이더 컴파일(수 초, 제거 불가)이라, 대응은
//       ① 로딩 오버레이가 즉시 뜨고 ② 무거운 구간(컴파일 = Scene3D.warmup)을 오버레이가 덮고
//       ③ 오버레이가 사라진 뒤에는 눈에 보이는 스톨이 남지 않는 것이다. 그걸 그대로 판정한다.
//  A. DOMContentLoaded 시점에 #boot-loading 이 보이고 크기가 있다
//  B. 진행률(#bl-fill)이 단조 증가로 여러 번 갱신됐다 (한 방에 0→100 이 아니라 단계별로)
//  C. 오버레이가 결국 제거된다 (+ 벽시계 시간 보고)
//  D. 오버레이 제거 후 3초 안에 300ms+ Long Task 가 없다 (= 컴파일이 로딩창 아래에서 끝났다)
//  E. 콘솔 에러 0
// ⚠️ 헤드리스 swiftshader 는 실기보다 훨씬 느리다 — D 의 문턱은 '컴파일 태스크(수 초)가 새는가'를
//    가르는 값이지 프레임 예산이 아니다.
// 사용: node probe-startup-lag.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

    await page.addInitScript(() => {
        window.__prof = { long: [], fills: [], overlayAtDCL: null, removedAt: -1 };
        try {
            const po = new PerformanceObserver(l => { for (const e of l.getEntries()) window.__prof.long.push({ start: Math.round(e.startTime), ms: Math.round(e.duration) }); });
            po.observe({ entryTypes: ['longtask'] });
        } catch (e) { /* longtask 미지원 */ }
        document.addEventListener('DOMContentLoaded', () => {
            const P = window.__prof;
            const el = document.getElementById('boot-loading');
            const r = el && el.getBoundingClientRect();
            P.overlayAtDCL = el ? { w: Math.round(r.width), h: Math.round(r.height), visible: getComputedStyle(el).display !== 'none' } : null;
            const fill = document.getElementById('bl-fill');
            if (fill) new MutationObserver(() => {
                P.fills.push({ t: Math.round(performance.now()), pct: parseFloat(fill.style.width) || 0 });
            }).observe(fill, { attributes: true, attributeFilter: ['style'] });
            if (el) new MutationObserver(() => {
                if (!document.getElementById('boot-loading') && P.removedAt < 0) P.removedAt = Math.round(performance.now());
            }).observe(document.body, { childList: true });
        });
    });

    const t0 = Date.now();
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__prof && window.__prof.removedAt >= 0, null, { timeout: 180000 });
    const overlayWall = Date.now() - t0;
    await page.waitForTimeout(3200); // 제거 후 long task 수집
    const P = await page.evaluate(() => window.__prof);

    const fail = [];
    // A
    if (!P.overlayAtDCL || !P.overlayAtDCL.visible || P.overlayAtDCL.w < 100 || P.overlayAtDCL.h < 100)
        fail.push(`A: DCL 시점 오버레이 부재/축소 ${JSON.stringify(P.overlayAtDCL)}`);
    // B — 최소 4단계, 단조 증가, 100 도달
    const pcts = P.fills.map(f => f.pct);
    const mono = pcts.every((v, i) => i === 0 || v >= pcts[i - 1]);
    if (pcts.length < 4 || !mono || Math.max(0, ...pcts) < 100)
        fail.push(`B: 진행률 갱신 이상 (n=${pcts.length}, mono=${mono}, max=${Math.max(0, ...pcts)}) ${JSON.stringify(pcts)}`);
    // C 는 waitForFunction 통과로 이미 성립. D:
    const after = P.long.filter(t => t.start >= P.removedAt);
    const bigAfter = after.filter(t => t.ms >= 300);
    if (bigAfter.length) fail.push(`D: 오버레이 제거 후 300ms+ 태스크 ${JSON.stringify(bigAfter)}`);
    if (errs.length) fail.push(`E: 콘솔 에러 ${errs.join(' | ')}`);

    console.log(`오버레이 표시 구간(벽시계): ${overlayWall}ms · 제거 시각 t+${P.removedAt}ms`);
    console.log(`진행률 갱신: ${JSON.stringify(pcts)}`);
    console.log(`Long Tasks 전체: ${JSON.stringify(P.long)}`);
    console.log(`제거 후 태스크: ${JSON.stringify(after)}`);
    if (fail.length) { console.log('FAIL\n - ' + fail.join('\n - ')); await browser.close(); process.exit(1); }
    console.log('PASS — 컴파일 스톨이 전부 로딩창 아래에서 소화됨, 제거 후 잔여 스톨 없음, 콘솔 에러 0');
    await browser.close();
})();
