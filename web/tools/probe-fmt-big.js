// U.fmt / U.fmtDec 대형값 표기 검증 프로브 (slug: fmt-beyond-qi)
// node web/tools/probe-fmt-big.js  — 브라우저 없이 bignum.js + util.js만 로드해 검사한다.
// 판정: number 경로 출력이 ① 지수 표기(e+/e-)·'Infinity'·'NaN' 를 안 내고
//       ② 같은 값의 Big 경로 출력과 문자 단위로 일치하고 ③ 숫자부가 10자를 안 넘길 것.
// exit 0 = PASS, 1 = FAIL.
const fs = require('fs'), path = require('path'), vm = require('vm');

const webDir = path.resolve(__dirname, '..');
const ctx = vm.createContext({ Math, Number, String, Object, Array, JSON, isNaN, isFinite, parseFloat, parseInt, Date, console });
// 두 파일의 top-level `const` 는 실행 단위 안에서만 보이므로 한 스크립트로 이어 붙여 한 번에 돌린다
const src = ['js/bignum.js', 'js/util.js']
    .map(f => fs.readFileSync(path.join(webDir, f), 'utf8')).join('\n;\n') + '\n;({ U, Big, fmtBig })';
const { U, Big, fmtBig } = vm.runInContext(src, ctx, { filename: 'bignum+util' });

const CASES = [
    1e3, 1e6, 1e9, 1e12, 1e15, 1e17, 1e18, 1e21, 1e24, 1e30, 1e40, 1e60,
    1e100, 1e300, 1.7e308, Infinity, -1e40, -Infinity, 0, 999, 1234.5,
];

// 표기에서 접미사를 뗀 숫자부 (길이·지수 검사용)
const numPart = s => String(s).replace(/[A-Za-z∞]+$/, '');

let fails = 0;
const rows = [];
for (const n of CASES) {
    const got = U.fmt(n);
    const gotDec = U.fmtDec(n);
    const want = fmtBig(Big.of(n));
    const wantDec = fmtBig(Big.of(n), 2);
    const bad = [];
    for (const [label, s] of [['fmt', got], ['fmtDec', gotDec]]) {
        if (/e[+-]\d/i.test(s)) bad.push(`${label}: 지수 표기 누출`);
        if (/Infinity|NaN/.test(s)) bad.push(`${label}: ${s} 원시 토큰 누출`);
        if (numPart(s).replace(/[-.]/g, '').length > 10) bad.push(`${label}: 숫자부 ${numPart(s).length}자`);
    }
    // 1e15 미만은 number 경로가 자체 소수 규칙을 갖는 구간이라 대조 대상이 아니다.
    // 위임이 시작되는 1e15 이상에서만 Big 경로와 문자 단위로 같아야 한다.
    if (!(Math.abs(n) < 1e15)) {
        if (got !== want) bad.push(`fmt≠Big경로 (${got} vs ${want})`);
        if (gotDec !== wantDec) bad.push(`fmtDec≠Big경로 (${gotDec} vs ${wantDec})`);
    }
    if (bad.length) fails++;
    rows.push({ n, got, gotDec, want, bad });
}

const pad = (s, w) => String(s).padEnd(w);
console.log(pad('입력', 12) + pad('U.fmt', 16) + pad('U.fmtDec', 16) + pad('Big 경로', 16) + '판정');
for (const r of rows) {
    console.log(pad(r.n, 12) + pad(r.got, 16) + pad(r.gotDec, 16) + pad(r.want, 16) +
        (r.bad.length ? 'FAIL — ' + r.bad.join(' / ') : 'ok'));
}

// 세이브 왕복(Big → 문자열 → Big)도 같은 표기를 내는지 (문자열 경로 회귀 방지)
const rt = Big.of('1e40');
if (U.fmt(rt) !== U.fmt(1e40)) { console.log(`FAIL — 문자열 경로 ${U.fmt(rt)} ≠ number 경로 ${U.fmt(1e40)}`); fails++; }

console.log(fails ? `\n결과: FAIL ${fails}건` : `\n결과: PASS (${CASES.length}개 전부 통과)`);
process.exit(fails ? 1 : 0);
