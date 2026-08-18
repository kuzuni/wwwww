// 수 축약이 단위 경계에서 `1000k`·`1000m`·`1000b`·`1000aa` 를 내지 않는지. (slug: fmt-1000k-rollover)
//
// 실체: 축약은 **먼저 1000 으로 나누고 → 그 뒤 반올림**하는 순서라, 999.9999 같은 경계 바로 아래
// 값은 나누기 루프(`>= 1000`)를 통과하지 못한 채 반올림에서 가수가 1000 으로 올라간다.
// 접미사 체계의 목적이 "가수를 3자리 이하로 줄이는 것"이라 `1000k` 는 규칙을 스스로 깨는 표기다.
//
// 세 경로(`U.fmt` / `U.fmtDec` / `fmtBig`)가 **같은 결함을 각자 복제**하고 있었으므로 셋 다 잰다.
// 회귀도 같이 본다 — 원본 실측 표기(782k · 20.7b · 32b · 2.15k · 4k)가 그대로여야 한다.
// 사용: node probe-fmt-rollover.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// [식, 기대값] — 식은 페이지 안에서 그대로 평가된다.
const CASES = [
    // ── 경계 넘김(이 항목의 본체). 999.5 이상은 위 단위로 올라가야 한다.
    ["U.fmt(999499)", '999k'],
    ["U.fmt(999500)", '1m'],
    ["U.fmt(999999)", '1m'],
    ["U.fmt(1000000)", '1m'],
    ["U.fmt(999499999)", '999m'],
    ["U.fmt(999500000)", '1b'],
    ["U.fmt(999499999999)", '999b'],
    ["U.fmt(999500000000)", '1t'],
    // t 위는 접미사 표가 aa 부터라, 넘길 자리가 있는지도 같이 본다
    ["U.fmt(999999999999999)", '1aa'],
    // ── Big 경로(세이브를 거쳐 온 문자열 포함)
    ["fmtBig(Big.of('999999'))", '1m'],
    ["U.fmt('999999')", '1m'],
    ["fmtBig(Big.of(9.999e17))", '1ab'],
    ["fmtBig(Big.of(9.999e20))", '1ac'],
    // ── 소수 보존 경로
    ["U.fmtDec(999999)", '1.00m'],
    // ⚠️ fmtDec 의 넘김 지점은 fmt 와 다르다 — 소수 2자리를 남기므로 `999.50m` 은 가수가 아직
    //    3자리라 정상이고, `toFixed(2)` 가 1000 이 되는 999.995 이상에서만 위 단위로 올라간다.
    ["U.fmtDec(999500000)", '999.50m'],
    ["U.fmtDec(999999000)", '1.00b'],
    ["U.fmtDec(8870)", '8.87k'],
    // ── 음수도 부호만 붙고 규칙은 같아야 한다(자릿수 판정이 음수에서 뒤집히던 자리다)
    ["U.fmt(-999999)", '-1m'],
    ["U.fmt(-1234)", '-1.23k'],
    ["U.fmtDec(-999999)", '-1.00m'],
    // ── 회귀: 원본 실측 표기가 그대로여야 한다(shot-042120 · 042149 · 042632)
    ["U.fmt(782000)", '782k'],
    ["U.fmt(20700000000)", '20.7b'],
    ["U.fmt(32000000000)", '32b'],
    ["U.fmt(2150)", '2.15k'],
    ["U.fmt(4000)", '4k'],
    ["U.fmt(999)", '999'],
    ["U.fmt(1234)", '1.23k'],
    ["U.fmt(99950)", '100k'],
    ["U.fmt(0)", '0'],
    ["U.fmtDec(1.13)", '1.13'],
];

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && !/favicon\.ico/.test(m.text()) && errs.push(m.text()));
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof U !== 'undefined' && typeof fmtBig !== 'undefined', null, { timeout: 150000 });

    const got = await page.evaluate(cases => cases.map(([expr]) => {
        try { return String(eval(expr)); } catch (e) { return 'ERR: ' + e.message; }
    }), CASES);

    const bad = [];
    CASES.forEach(([expr, want], i) => {
        const ok = got[i] === want;
        console.log(`  ${ok ? 'OK ' : 'X  '} ${expr.padEnd(34)} → ${String(got[i]).padEnd(10)} ${ok ? '' : '(기대 ' + want + ')'}`);
        if (!ok) bad.push(`${expr} → ${got[i]} ≠ ${want}`);
    });

    // 위 표는 손으로 고른 값이라 놓친 경계가 있을 수 있다 — 넓게 훑어 **네 자리 가수**를 통째로 잡는다.
    const sweep = await page.evaluate(() => {
        const out = [];
        const check = (label, s) => { if (/^-?\d{4,}(\.\d+)?[a-z]/.test(s)) out.push(`${label} → ${s}`); };
        for (let e = 3; e <= 14; e++) {
            for (const f of [0.9994, 0.9995, 0.99949, 0.99951, 0.9999, 0.99999, 1, 1.0001]) {
                const n = Math.round(Math.pow(10, e + 1) * f);
                check(`U.fmt(${n})`, U.fmt(n));
                check(`U.fmtDec(${n})`, U.fmtDec(n));
            }
        }
        for (let e = 3; e <= 60; e++) {
            for (const f of [0.9995, 0.9999, 0.99999, 1]) {
                const b = Big.of(Math.pow(10, 15) * f).mul(Math.pow(10, e - 15 > 0 ? e - 15 : 0));
                check(`fmtBig(1e${e}×${f})`, fmtBig(b));
            }
        }
        return out;
    });
    console.log(`\n  경계 훑기(가수 4자리 이상 검출): ${sweep.length ? sweep.length + '건' : '0건'}`);
    sweep.slice(0, 12).forEach(s => console.log('    ' + s));
    if (sweep.length) bad.push(`경계 훑기에서 네 자리 가수 ${sweep.length}건`);
    if (errs.length) bad.push('콘솔 에러 ' + errs.length + '건: ' + errs.slice(0, 2).join(' | '));

    console.log(bad.length ? '\nFAIL — ' + bad.slice(0, 8).join(' · ')
        : `\nPASS — 표기 ${CASES.length}건 전부 기대값 · 경계 훑기 0건 · 콘솔 에러 0건`);
    await browser.close();
    process.exit(bad.length ? 1 : 0);
})();
