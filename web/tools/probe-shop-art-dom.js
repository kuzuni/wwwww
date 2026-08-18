// 상점 특가 카드 '상품 일러스트' 프레임 — **클론 DOM 실측** + 원본 목표치 대조 (±2%p 판정).
// 사용: PW_PATH=<playwright> node probe-shop-art-dom.js
//
// 목표치는 `probe-shop-art-ref.js`(원본 shot-042632 픽셀 스캔)에서 뽑은 값이다:
//   일러 폭 22.24%W(기술) / 21.84%W(펫) / 21.02%W(탈것) · 카드 상단 대비 top +28~37px(3.2~4.2%H)
//   · 카드 우끝 대비 right 12~13px.
// ⚠️ 원본 일러의 **아래 끝은 못 잰다** — 가격 버튼의 검정 키라인·드롭섀도가 일러와 같은 잉크라
//    바닥이 카드 밑동까지 끌려간다. 그래서 높이는 상단(191/341/484)에서 소품 바닥(≈260)까지를
//    손으로 확인한 7.9%H 를 목표로 쓰고, 판정은 폭·top·right 3개로 한다.
// ⚠️ `cardpop` scale(.7) 이 끝나기 전에 재면 전 수치가 0.7배로 나온다(인계 메모 ㉤).
//    아래에서 `.opening` 을 벗기고, 그래도 남을 수 있어 스케일 자기검증을 넣는다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

// 원본 목표치 (%는 앱 폭 490 · 앱 높이 878 기준)
const REF = [
    { key: 'tech', w: 22.24, top: 3.19, right: 2.45 },
    { key: 'pet', w: 21.84, top: 4.10, right: 2.65 },
    { key: 'mount', w: 21.02, top: 4.21, right: 2.65 },
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Shop !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(() => { S.coins = 782000; S.gems = 62; UI.toast = () => { }; UI.onTabClick('shop'); });
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening')));
    await page.waitForTimeout(300);

    const out = await page.evaluate(() => {
        const app = document.getElementById('app').getBoundingClientRect();
        const cards = [...document.querySelectorAll('.shop-deal-card')];
        // 스케일 자기검증 — cardpop 이 아직 도는 중이면 rect 폭이 offsetWidth 보다 작다
        const sheet = document.querySelector('.shop-sheet');
        const scale = sheet ? sheet.getBoundingClientRect().width / sheet.offsetWidth : 1;
        return {
            appW: app.width, appH: app.height, scale,
            rows: cards.map(c => {
                const cr = c.getBoundingClientRect();
                const a = c.querySelector('.shop-deal-art');
                const ar = a.getBoundingClientRect();
                const ico = a.querySelector('.ico');
                const ir = ico ? ico.getBoundingClientRect() : null;
                return {
                    w: ar.width, h: ar.height, top: ar.top - cr.top, right: cr.right - ar.right,
                    hasIcon: !!ico, icoW: ir ? ir.width : 0, icoH: ir ? ir.height : 0,
                    bg: ico ? getComputedStyle(ico).backgroundImage.slice(0, 24) : '',
                };
            }),
        };
    });
    await browser.close();

    if (Math.abs(out.scale - 1) > 0.02) {
        console.log(`측정기 고장: 카드 스케일 ${out.scale.toFixed(3)} — cardpop 애니가 안 끝났다. 대기 시간을 늘릴 것.`);
        process.exit(2);
    }
    console.log(`앱 ${out.appW.toFixed(1)}x${out.appH.toFixed(1)} · 카드 ${out.rows.length}장 · 스케일 ${out.scale.toFixed(3)}`);
    let fail = 0;
    out.rows.forEach((r, i) => {
        const ref = REF[i] || REF[2];
        const w = r.w / out.appW * 100, top = r.top / out.appH * 100, right = r.right / out.appW * 100;
        const d = (a, b) => (a - b >= 0 ? '+' : '') + (a - b).toFixed(2);
        const bad = [Math.abs(w - ref.w), Math.abs(top - ref.top), Math.abs(right - ref.right)].some(v => v > 2);
        if (bad || !r.hasIcon) fail++;
        console.log(`${ref.key.padEnd(6)} w ${w.toFixed(2)}%W(Δ${d(w, ref.w)}) · top ${top.toFixed(2)}%H(Δ${d(top, ref.top)})`
            + ` · right ${right.toFixed(2)}%W(Δ${d(right, ref.right)}) · h ${(r.h / out.appH * 100).toFixed(2)}%H`
            + ` · 아이콘 ${r.hasIcon ? `${r.icoW.toFixed(1)}x${r.icoH.toFixed(1)} ${r.bg}` : '없음(이모지 폴백)'}`
            + `  ${bad || !r.hasIcon ? 'FAIL' : 'PASS'}`);
    });
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    console.log(fail ? `판정 FAIL ${fail}건` : '판정 PASS — 3장 전부 ±2%p 이내 + IconGen 아이콘 부착');
    process.exit(fail || errs.length ? 1 : 0);
})();
