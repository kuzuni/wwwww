// 확률 정보 팝업(forge-info) 요소 실측 — 원본 shot-042831 의 픽셀 목표치와 %W·%H 로 나란히 대조.
// 사용: PW_PATH=<playwright> node probe-fi-dom.js
//
// 🚨 이 화면의 가장 큰 함정: **원본 이미지(498px)가 앱(491px)보다 넓다.**
//    앱 콘텐츠 중심은 x=245.5(카드 중심 246 · ✕ 중심 245.5 · 상단바 12~478 중심 245)인데
//    이미지 중심은 249다 — 오른쪽에 앱이 아닌 7px 띠가 붙어 있다. 이미지 폭 498로 %W 를 내면
//    정중앙 정렬이 정답인 클론이 가로마다 가짜 오차를 먹는다(인계 메모 ㉠과 같은 계열, 3번째).
//    그래서 원본 목표치는 **앱 폭 491 기준**으로 환산했다. 세로는 881 그대로.
//
// 원본 실측 방법: probe-fi-ref.js(색면 스캔) + 행 잉크 프로파일. 픽셀 원값은 아래 주석에 남긴다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

// 원본(shot-042831) 목표치 — x/w 는 앱폭 491 기준 %, y/h 는 881 기준 %
const TARGET = {
    // 카드는 검정 테두리 바깥선 기준(px 57~435 / 80~793) — DOM 도 border-box 라 같은 기준이다.
    // 🚨 카드 바닥을 762 로 읽은 1차 측정은 틀렸다: '흰 픽셀 연속 300px 넘는 행'으로 찾았는데
    //    카드 하단은 ✕ 원이 행을 두 토막(각 ~160px)으로 갈라 임계값에 안 걸렸다. 실제 흰 바닥은 789,
    //    테두리 포함 793 이다(x=100 열 프로파일로 확인). 같은 착시로 ✕ 도 '카드 아래 별개'로 보였는데
    //    실제로는 종전 공통 규칙대로 **카드 하단에 절반 걸침**이다(✕ 상단 763 vs 카드 바닥 793).
    'card': { x: 11.61, w: 77.19, y: 9.08, h: 81.04 },
    'title': { x: 41.75, w: 16.90, y: 11.46, h: 2.61 },          // px 205~287 / 101~123 (글자 잉크)
    'sub': { x: 44.60, w: 11.20, y: 14.76, h: 1.59 },            // px 219~273 / 130~143 (글자 잉크)
    'info-btn': { x: 80.24, w: 4.28, y: 13.96, h: 2.50 },        // px 394~414 / 123~144
    'pills': { x: 28.72, w: 41.14, y: 17.48, h: 3.41 },          // px 141~342 / 154~183
    'level-row': { x: 57.23, w: 29.12, y: 23.27, h: 1.48 },      // px 281~423 / 205~217
    'age-bar1': { x: 13.24, w: 73.93, y: 25.77, h: 3.29 },       // px 65~427 / 227~255
    'age-bar10': { x: 13.24, w: 73.93, y: 59.48, h: 3.29 },      // px 65~427 / 524~552
    'age-next-seg': { x: 0, w: 19.14, y: 0, h: 3.29 },           // 세그먼트 폭 94px = 막대폭의 25.9%
    'upg-label': { x: 37.47, w: 25.66, y: 67.76, h: 1.59 },      // px 184~309 / 597~610 (글자 잉크)
    'progress': { x: 17.11, w: 66.19, y: 69.81, h: 3.41 },       // px 84~408 / 615~644
    'skip-btn': { x: 34.42, w: 31.57, y: 75.48, h: 8.74 },       // px 169~323 / 665~741
    'x-btn': { x: 44.40, w: 11.61, y: 86.61, h: 6.47 },          // px 218~274 / 763~819 (테두리 포함 원)
};
// 막대 피치(연속 막대 top 간격) — 원본 33px = 3.75%H, 간격 4px = 0.45%H
const PITCH_TARGET = 3.75;

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && UI.els && UI.els.craftModal && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(() => {
        // 원본과 같은 상태: 대장간 Lv.29 · 업그레이드 진행 중(하단 진행바 + [건너뛰기])
        S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9;
        S.forgeLevel = 29; S.coins = 2.71e7; S.gems = 8150;
        S.forgeUpgradeEndsAt = U.now() + 98 * 3600e3;   // 원본은 "4일 2시" — 진행바 채움까지 같은 상태로
        UI.toast = () => { };
        UI.openForgeInfo();
    });
    await page.waitForTimeout(320);
    // 열림 애니메이션(cardpop)은 scale(.7)에서 시작한다 — 끝나기 전에 재면 전부 70%로 찍힌다(af 프로브와 같은 함정)
    await page.evaluate(() => {
        document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening'));
        document.querySelectorAll('.modal-card').forEach(c => { c.style.animation = 'none'; c.style.transform = 'none'; });
    });
    await page.waitForTimeout(120);

    const data = await page.evaluate(() => {
        // 기준 프레임은 뷰포트가 아니라 **#app 상자**다 — 9:16 레터박스라 뷰포트(499x892)와 앱(499x887)이
        // 다르고, 앱이 세로로 2.4px 내려 앉아 있다. 원본도 앱 프레임(491x881) 기준으로 환산했으니
        // 여기서 뷰포트를 쓰면 세로마다 0.3~0.6%p 짜리 기준 불일치가 섞인다.
        const app = document.getElementById('app').getBoundingClientRect();
        const W = app.width, H = app.height;
        const box = (r) => ({ x: +((r.left - app.left) / W * 100).toFixed(2), w: +(r.width / W * 100).toFixed(2), y: +((r.top - app.top) / H * 100).toFixed(2), h: +(r.height / H * 100).toFixed(2) });
        const pick = (sel, label) => { const el = document.querySelector(sel); return el ? Object.assign({ label }, box(el.getBoundingClientRect())) : null; };
        // 글자/자식 묶음은 **블록 상자가 아니라 잉크 범위**로 재야 원본 픽셀 스캔과 같은 기준이 된다
        // (블록은 카드 폭을 꽉 채우므로 원본의 글자 폭과 대면 +50%p 짜리 가짜 오차가 난다 — 실제로 한 번 속았다).
        const inkPick = (sel, label) => {
            const el = document.querySelector(sel); if (!el) return null;
            const rng = document.createRange(); rng.selectNodeContents(el);
            const r = rng.getBoundingClientRect();
            return Object.assign({ label }, box(r));
        };
        const spanPick = (sel, label) => {   // 자식 여러 개(pill 2개·레벨 줄 3칸)의 좌우 끝 범위
            const el = document.querySelector(sel); if (!el) return null;
            const ks = [...el.children].map(c => c.getBoundingClientRect());
            if (!ks.length) return inkPick(sel, label);
            const left = Math.min(...ks.map(k => k.left)), right = Math.max(...ks.map(k => k.right));
            const top = Math.min(...ks.map(k => k.top)), bot = Math.max(...ks.map(k => k.bottom));
            return Object.assign({ label }, box({ left, top, width: right - left, height: bot - top }));
        };
        const bars = [...document.querySelectorAll('.fi-age-bar')];
        const out = [pick('.fi-card', 'card'), inkPick('.fi-title', 'title'), inkPick('.fi-sub', 'sub'),
        pick('.fi-info-btn', 'info-btn'), spanPick('.fi-pills', 'pills'), spanPick('.fi-level-row', 'level-row')];
        if (bars.length) {
            out.push(Object.assign({ label: 'age-bar1' }, box(bars[0].getBoundingClientRect())));
            out.push(Object.assign({ label: 'age-bar10' }, box(bars[bars.length - 1].getBoundingClientRect())));
            const seg = bars[0].querySelector('.fi-age-next');
            if (seg) out.push(Object.assign({ label: 'age-next-seg' }, box(seg.getBoundingClientRect())));
        }
        out.push(inkPick('.fi-upg-label', 'upg-label'), pick('.fi-prog', 'progress'), pick('.fi-skip', 'skip-btn'), pick('.x-btn', 'x-btn'));
        const pitch = bars.length > 1 ? +((bars[1].getBoundingClientRect().top - bars[0].getBoundingClientRect().top) / H * 100).toFixed(2) : 0;
        const segRatio = bars.length && bars[0].querySelector('.fi-age-next')
            ? +(bars[0].querySelector('.fi-age-next').getBoundingClientRect().width / bars[0].getBoundingClientRect().width * 100).toFixed(1) : 0;
        return { rows: out.filter(Boolean), pitch, count: bars.length, segRatio };
    });

    console.log('\n확률 정보 팝업(shot-042831) — 원본 vs 클론  ·  원본 x/w 는 **앱폭 491** 기준(이미지 498 아님)\n');
    console.log('요소'.padEnd(15) + 'x%W'.padStart(8) + 'w%W'.padStart(8) + 'y%H'.padStart(8) + 'h%H'.padStart(8) + '     Δx      Δw      Δy      Δh');
    let worst = 0, worstLabel = '';
    for (const r of data.rows) {
        const t = TARGET[r.label];
        let d = '';
        if (t) {
            const ds = [r.x - t.x, r.w - t.w, r.y - t.y, r.h - t.h];
            // 세그먼트는 폭·높이만 의미가 있다(막대 안 오른쪽 끝 정렬이라 x 는 막대 폭에 따라간다)
            const use = r.label === 'age-next-seg' ? [ds[1], ds[3]] : ds;
            for (const v of use) if (Math.abs(v) > worst) { worst = Math.abs(v); worstLabel = r.label; }
            d = ds.map(v => (v >= 0 ? '+' : '') + v.toFixed(2)).map(s => s.padStart(8)).join('');
            if (r.label === 'age-next-seg') d = '       -' + d.slice(8, 16) + '       -' + d.slice(24);
        }
        console.log(r.label.padEnd(15) + String(r.x).padStart(8) + String(r.w).padStart(8) + String(r.y).padStart(8) + String(r.h).padStart(8) + '  ' + d);
    }
    const dp = data.pitch - PITCH_TARGET;
    if (Math.abs(dp) > worst) { worst = Math.abs(dp); worstLabel = 'bar-pitch'; }
    console.log(`\n막대 개수 ${data.count} (원본 10)   피치 ${data.pitch}%H (원본 ${PITCH_TARGET}, Δ ${dp >= 0 ? '+' : ''}${dp.toFixed(2)})   다음%세그 폭 ${data.segRatio}% of 막대 (원본 25.9%)`);
    console.log(`최대 오차 ${worst.toFixed(2)}%p (${worstLabel})  — 통과 기준 ±2.00%p`);
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    console.log(worst <= 2 && !errs.length && data.count === 10 ? '✅ PASS' : '❌ FAIL');
    await browser.close();
    process.exit(worst <= 2 && !errs.length && data.count === 10 ? 0 : 1);
})();
