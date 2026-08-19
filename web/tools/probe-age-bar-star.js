// age-bar-star-ascension 검증 — 시대(등급) 막대의 ★ 개수 = 장비 라인 승천 횟수(Ascension.count('forge')).
// 확률 정보(fi-age-star)·모든 장비 목록(fi-age-star)·자동 제련(af-age-star) 세 화면 모두.
// 승천 0=별 0개, N=별 N개, 6+='★N' 접기. 전 시대 막대가 같은 개수(라인 공통값).
// 사용: node probe-age-bar-star.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

// '★★★' 또는 '★7' → 개수로 환산 (텍스트 글리프 규약)
function starCount(txt) {
    const t = (txt || '').trim();
    if (!t) return 0;
    const m = t.match(/^★+(\d+)?$/);
    if (!m) return -999;                 // 예상 밖 글리프
    return m[1] ? parseInt(m[1], 10) : t.length;
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Ascension !== "undefined"', { label: '스크립트 로드' });

    // 세 화면의 시대 막대 별 텍스트를 수집한다. 승천 횟수를 인자로 세팅해 준다.
    const collect = (ascN) => page.evaluate((n) => {
        Ascension.ensure();
        S.lineAscend.forge = n;
        // 자동 제련 해금 조건(스테이지 2-10)
        S.bestChapter = 20; S.bestStage = 9; S.chapter = 4; S.stage = 1; S.forgeLevel = 29;
        const out = {};
        // 확률 정보(level view)
        UI.openForgeInfo();
        out.fiLevel = [...document.querySelectorAll('#forge-info-modal .fi-age-star, .fi-card .fi-age-star')].map(e => e.textContent);
        // 모든 장비 목록(list view)
        UI.openForgeList();
        out.fiList = [...document.querySelectorAll('.fl-head .fi-age-star')].map(e => e.textContent);
        // 자동 제련
        UI.closeForgeInfo();
        UI.openAutoForge();
        out.af = [...document.querySelectorAll('.af-age-star')].map(e => e.textContent);
        UI.closeAutoForge();
        return { count: Ascension.count('forge'), out };
    }, ascN);

    let fail = 0;
    const check = (label, texts, expect) => {
        if (!texts.length) { console.log(`  FAIL ${label} — 별 span 을 못 찾음`); fail++; return; }
        const counts = texts.map(starCount);
        const bad = counts.filter(c => c !== expect);
        const ok = bad.length === 0;
        if (!ok) fail++;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(22)} span ${texts.length}개 · 기대 ${expect}개 · 실측 [${[...new Set(counts)].join(',')}]`);
    };

    for (const n of [0, 1, 2, 5, 6, 7]) {
        const { count, out } = await collect(n);
        console.log(`\n승천 ${n} (Ascension.count='forge'=${count}) — 기대 별 ${n <= 5 ? n : '★' + n + '(=' + n + '개)'}`);
        if (count !== n) { console.log(`  FAIL Ascension.count 불일치 ${count} ≠ ${n}`); fail++; }
        check('확률 정보', out.fiLevel, n);
        check('모든 장비 목록', out.fiList, n);
        check('자동 제련', out.af, n);
    }

    await browser.close();
    console.log(`\n콘솔 에러: ${errors.length}건${errors.length ? ' — ' + errors.slice(0, 3).join(' | ') : ''}`);
    const verdict = (fail || errors.length) ? `FAIL — 불일치 ${fail}건 / 콘솔 ${errors.length}건` : 'PASS — 세 화면 전부 승천 횟수와 별 개수 일치';
    console.log(verdict);
    process.exit((fail || errors.length) ? 1 : 0);
})();
