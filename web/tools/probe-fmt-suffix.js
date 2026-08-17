// 큰 수 표기 규칙 회귀 — 원본 스크린샷에서 읽은 실제 표기와 `U.fmt`/`fmtBig` 출력을 대조한다.
// 사용: PW_PATH=<playwright> node probe-fmt-suffix.js
//
// 원본 근거(전부 눈으로 확인한 값):
//   shot-042120 상단바 `782k` · 전투력 `20.7b`
//   shot-042149 랭킹 행 `32b` · `41.7b` · `35.7b` · `20.7b`
//   shot-042632 상점 pill `2.15k` · `4k`, 상단바 `782k`
// → 규칙 두 가지: ① 접미사는 **소문자** ② 유효 3자리로 줄인 뒤 **꼬리 0을 버린다**(4000 → `4k`).
//   `U.fmtDec` 는 '소수점 보존' 용도라 꼬리 0을 남기는 것이 정상이다(여기서도 그렇게 검사한다).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const CASES = [
    // [식, 기대값, 근거]
    ['U.fmt(782000)', '782k', '원본 shot-042120·042632 상단바'],
    ['U.fmt(4000)', '4k', '원본 shot-042632 탈것 거래 해머'],
    ['U.fmt(2150)', '2.15k', '원본 shot-042632 탈것 거래 태엽'],
    ['U.fmt(32e9)', '32b', '원본 shot-042149 5위 loui'],
    ['U.fmt(41.7e9)', '41.7b', '원본 shot-042149 6위 Sarah21'],
    ['U.fmt(20.7e9)', '20.7b', '원본 shot-042120 전투력'],
    ['U.fmt(150)', '150', '1000 미만은 그대로'],
    ['U.fmt(999)', '999', '1000 미만 경계'],
    ['U.fmt(1000)', '1k', '경계 — 꼬리 0 제거'],
    ['U.fmt(1100)', '1.1k', '꼬리 0 하나만 제거'],
    ['U.fmt(1234567)', '1.23m', 'm 구간'],
    ['U.fmt(-4000)', '-4k', '음수도 같은 규칙'],
    ['U.fmt(0)', '0', '0'],
    // ⚠️ 구간 경계: tier = floor(지수/3) 이라 t = 1e12, **aa 는 1e15 부터**다(1e18 은 ab).
    // 처음 이 표를 aa=1e18 로 적었다가 헛FAIL 2건을 냈다 — 접미사 소문자화와는 무관한 기존 사다리다.
    ['fmtBig(Big.of(4.5e12))', '4.5t', 't 구간'],
    ['fmtBig(Big.of(1e15))', '1aa', 't 위 구간은 aa/ab/… (소문자 사다리 연속)'],
    ['U.fmtDec(4000)', '4.00k', 'fmtDec 는 자릿수 보존이라 꼬리 0을 남긴다'],
    ['U.fmtDec(8870)', '8.87k', 'fmtDec 소수 2자리'],
];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('pageerror', e => errs.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof U !== "undefined" && typeof fmtBig !== "undefined"', { label: '스크립트 로드' });

    let fail = 0;
    for (const [expr, want, why] of CASES) {
        const got = await page.evaluate(e => String(eval(e)), expr);
        const ok = got === want;
        if (!ok) fail++;
        console.log(`${ok ? 'OK  ' : 'FAIL'} ${expr.padEnd(26)} → ${String(got).padEnd(8)} (기대 ${want.padEnd(8)}) ${why}`);
    }
    await browser.close();
    console.log(fail ? `실패 ${fail}건` : '실패 0건');
    console.log(errs.length ? '콘솔 에러: ' + errs.join(' / ') : '콘솔 에러 0건');
    process.exit(fail ? 1 : 0);
})();
