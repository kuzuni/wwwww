#!/usr/bin/env node
/* apply-outline-tokens.js — art-outline-scale 의 style.css 전역 스윕을 기계적으로 수행한다.
 *
 * 왜 스크립트인가: 이 스윕은 140여 곳을 건드리는데, 손으로 하면 편집이 몇 분씩 걸려
 * 같은 파일을 쓰는 다른 세션(aaa-skin·ui-ratio-audit)과 리베이스 충돌 창이 그만큼 벌어진다.
 * 스크립트면 락이 비는 순간 초 단위로 원자적으로 끝나고, 충돌이 나도 리베이스 후 재실행하면 된다.
 *
 * 하는 일: `border[-side]` / `border-width` 선언의 **두께 px 리터럴만** `var(--olN)` 로 바꾸고
 * `:root` 에 `--olN: min(Npx, calc(N/16rem + .49px))` 을 정의한다.
 *   - 기준 뷰포트(499x892, 루트 폰트 16px)에서는 계산값이 정확히 원래 px 이라 등재 실측치가 안 흔들린다.
 *   - 앱이 기준보다 작아지면 루트 폰트가 같이 줄어 아웃라인도 같은 비율로 얇아진다.
 *   - `+.49px` 는 Chrome 의 `used = max(1, floor(v))` 계단을 반올림처럼 쓰기 위한 것(probe-outline-scale ⑶ 실측).
 *
 * 안 건드리는 것: `border-radius`(두께가 아님) · 주석 안 · `0`/`0px` · 이미 `var(...)` 인 선언.
 *
 * 사용법:
 *   node tools/apply-outline-tokens.js --check   # 미리보기(파일 안 씀), 바뀔 곳 집계
 *   node tools/apply-outline-tokens.js           # 실제 적용
 *   node tools/apply-outline-tokens.js --revert  # var(--olN) → 원래 px 되돌리기(대조용)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CSS = path.join(__dirname, '..', 'css', 'style.css');
const MODE = process.argv.includes('--revert') ? 'revert'
           : process.argv.includes('--check') ? 'check' : 'apply';

/* px 값 → 토큰 이름. 소수점은 이름에 못 쓰니 `1.5` → `ol15`. */
function tokenName(px) { return '--ol' + String(px).replace('.', ''); }
/* min(Npx, calc(N/16rem + .49px)) — N/16 을 rem 소수로 그대로 적는다(계산 오차 없이 정확히 N px). */
function tokenValue(px) {
    const rem = (px / 16).toString().replace(/^0\./, '.');
    return `min(${px}px, calc(${rem}rem + .49px))`;
}

/* ── 주석 밖 구간만 고르기 ────────────────────────────────────────────────
 * style.css 에는 `/* 원본 30px *​/ border: 3px solid …` 처럼 주석과 실선언이 한 줄에 붙은 곳이 있다.
 * 주석 안의 px 를 건드리면 메모가 거짓말이 되므로 구간을 갈라서 본문만 치환한다. */
function spans(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
        const c = src.indexOf('/*', i);
        if (c < 0) { out.push({ code: true, text: src.slice(i) }); break; }
        if (c > i) out.push({ code: true, text: src.slice(i, c) });
        let e = src.indexOf('*/', c + 2);
        if (e < 0) e = src.length - 2;
        out.push({ code: false, text: src.slice(c, e + 2) });
        i = e + 2;
    }
    return out;
}

/* `border`, `border-top|right|bottom|left`, `border-block*|inline*`, `border-width` 의 값부를 잡는다.
 * `border-radius`/`border-color`/`border-style` 은 이 패턴에 안 걸린다(뒤에 `-radius` 가 오면 `:` 가 아니라서). */
const DECL = /\b(border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?)(\s*:\s*)([^;{}]+)/g;
/* 값부 안의 길이 리터럴 — `0`·`0px` 과 이미 토큰인 것은 아래에서 걸러낸다. */
const LEN = /(?<![\w.#-])(\d*\.?\d+)px\b/g;

const seen = new Map();   // px → 치환 횟수
const sites = [];         // 보고용

function convert(codeText) {
    return codeText.replace(DECL, (m, prop, colon, value) => {
        if (/var\(--ol/.test(value)) return m;                 // 이미 스윕된 곳
        let hit = false;
        const nv = value.replace(LEN, (lm, num) => {
            const px = parseFloat(num);
            if (!(px > 0)) return lm;                          // 0px 은 두께가 아니라 '없음'
            hit = true;
            seen.set(px, (seen.get(px) || 0) + 1);
            sites.push({ prop, px, snippet: (prop + colon + value).trim().slice(0, 72) });
            return `var(${tokenName(px)})`;
        });
        return hit ? prop + colon + nv : m;
    });
}

function revert(codeText) {
    return codeText.replace(DECL, (m, prop, colon, value) =>
        prop + colon + value.replace(/var\(--ol(\d+)\)/g, (vm, digits) => {
            const px = digits.length > 1 && digits[0] !== '0' && digits !== '15' ? digits
                     : digits === '15' ? '1.5' : digits;
            return px + 'px';
        }));
}

let src = fs.readFileSync(CSS, 'utf8');

if (MODE === 'revert') {
    let out = spans(src).map(s => (s.code ? revert(s.text) : s.text)).join('');
    /* 선언만 되돌리고 `:root` 정의를 남기면 트리가 안 깨끗해진다(실측: 8줄이 남았다). 같이 지운다. */
    const before = out.length;
    out = out.replace(/\/\* art-outline-scale:[^*]*\*\/\n:root \{[^}]*\}\n/, '');
    fs.writeFileSync(CSS, out);
    console.log(`되돌림 완료 — var(--olN) → Npx${before === out.length ? ' (:root 블록 없음)' : ' + :root 토큰 블록 제거'}`);
    process.exit(0);
}

const body = spans(src).map(s => (s.code ? convert(s.text) : s.text)).join('');

/* ── :root 토큰 정의 주입 ─────────────────────────────────────────────── */
const used = [...seen.keys()].sort((a, b) => a - b);
const defs = used.map(px => `    ${tokenName(px)}: ${tokenValue(px)};`).join('\n');
const BLOCK_START = '/* art-outline-scale: 아웃라인 두께 토큰 — 기준(루트 16px)에선 원래 px, 앱이 작아지면 같은 비율로 얇아진다 */';
const block = `${BLOCK_START}\n:root {\n${defs}\n}\n`;

let out = body;
if (out.includes(BLOCK_START)) {
    out = out.replace(new RegExp(BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n:root \\{[^}]*\\}\\n'), block);
} else {
    /* 파일 맨 앞 `:root { color-scheme… }` 바로 뒤에 넣는다 — 어떤 선언보다 먼저 정의돼야 한다. */
    const anchor = out.indexOf('\n', out.indexOf(':root { color-scheme'));
    out = out.slice(0, anchor + 1) + block + out.slice(anchor + 1);
}

/* ── 보고 ─────────────────────────────────────────────────────────────── */
const total = [...seen.values()].reduce((a, b) => a + b, 0);
console.log('=== 치환 집계 (border 두께 px → var(--olN)) ===');
for (const px of used) console.log(`  ${String(px).padStart(4)}px → ${tokenName(px).padEnd(7)} ${String(seen.get(px)).padStart(3)}곳`);
console.log(`  합계 ${total}곳 · 토큰 ${used.length}종`);
console.log('\n=== :root 주입 ===');
console.log(defs);

/* 안 잡힌 두께가 남았는지 역검사 — 스윕 완결성 검사(프로브 ⑸ 예측이 어긋나는 원인 1순위) */
const leftover = [];
for (const s of spans(out)) {
    if (!s.code) continue;
    let m;
    const re = new RegExp(DECL.source, 'g');
    while ((m = re.exec(s.text))) {
        const val = m[3];
        if (/var\(--ol/.test(val)) continue;
        const l = val.match(/(?<![\w.#-])(\d*\.?\d+)px\b/g);
        if (l && l.some(x => parseFloat(x) > 0)) leftover.push((m[1] + m[2] + val).trim().slice(0, 72));
    }
}
console.log(`\n=== 미치환 잔여: ${leftover.length}곳 ===`);
leftover.slice(0, 10).forEach(x => console.log('  ! ' + x));

if (MODE === 'check') {
    console.log('\n[--check] 파일은 쓰지 않았다.');
} else {
    fs.writeFileSync(CSS, out);
    console.log('\ncss/style.css 적용 완료.');
}
process.exit(leftover.length ? 1 : 0);
