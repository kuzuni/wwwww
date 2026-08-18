// `.fi-info-btn`(검정 원형 정보 버튼)의 글리프 계약 검증 (slug: tech-info-glyph).
//
// 원본(`ref/screens/shot-042546.png` 우상단, 젬 pill 아래)은 **검정 원 안 흰 소문자 `i`** 다.
// 클론은 기술 분기 화면만 `!` 로 그려서, **같은 스타일의 버튼 두 개가 화면마다 다른 글자**를 썼다.
//
// 그래서 '기술 분기가 i 인가' 하나만 보지 않는다 — `.fi-info-btn` 이 나오는 **모든 화면**을 열어
// 전부 같은 글자인지 본다(새 화면에 이 버튼을 달면서 또 다른 글자를 쓰면 그 순간 FAIL).
// 원본 대조는 글자 모양이 아니라 **글자 값**으로 건다: 원본에서 실측한 것은 'i' 이고, 이건
// 비율 채점이 아니라 되고 안 되고가 명확한 계약이다.
//
// 사용: PW_PATH=... node probe-info-glyph.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const GLYPH = 'i';   // 원본 shot-042546 실측 (8배 확대로 눈확인: 검정 원 + 흰 소문자 i, 점+세로획)

// 이 버튼이 실제로 뜨는 화면들 — `shot-screens.js` 의 오프너를 그대로 가져온다(진입 경로가 다르면
// 다른 것을 재게 된다는 앞 세션들의 함정 ㉢ 을 피하려는 것).
const SCREENS = [
    ['tech-branch', `(() => {
        const ids = TechTree.nodesOf('skillpet');
        S.tech = S.tech || {};
        for (let i = 0; i < 7; i++) S.tech[ids[i]] = 1;
        UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch('skillpet');
    })()`],
    ['forge-info', `UI.switchTab('forge'); UI.openForgeInfo && UI.openForgeInfo();`],
];

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto(INDEX);
    await page.waitForFunction(() => typeof UI !== 'undefined' && UI.els && UI.els.panels, null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);

    let bad = 0, seen = 0;
    console.log('화면            글리프  기대  판정');
    for (const [name, opener] of SCREENS) {
        const found = await page.evaluate(async (src) => {
            eval(src);
            await new Promise(r => setTimeout(r, 220));
            // 보이는 것만 센다 — 숨은 패널 안의 버튼까지 세면 화면과 무관한 것을 재게 된다.
            return [...document.querySelectorAll('.fi-info-btn')]
                .filter(b => b.getBoundingClientRect().width > 0)
                .map(b => b.textContent.trim());
        }, opener);
        if (!found.length) { console.log(`${name.padEnd(15)} (버튼 없음)   ${GLYPH}    SKIP`); continue; }
        for (const g of found) {
            seen++;
            const ok = g === GLYPH;
            if (!ok) bad++;
            console.log(`${name.padEnd(15)} ${g.padEnd(7)} ${GLYPH}     ${ok ? 'PASS' : 'FAIL'}`);
        }
    }

    // 소스 전수 검사 — 아직 오프너가 없는 화면에 이 버튼이 새로 붙어도 잡히게 한다.
    const fs = require('fs');
    const src = fs.readFileSync(path.resolve(__dirname, '../js/ui.js'), 'utf8');
    const inline = [...src.matchAll(/class="fi-info-btn[^"]*"[^>]*>([^<]*)</g)].map(m => m[1].trim());
    const inlineBad = inline.filter(g => g !== GLYPH);
    console.log(`\n소스 내 .fi-info-btn ${inline.length}곳 — 글리프: ${JSON.stringify(inline)}`);
    if (inlineBad.length) { bad += inlineBad.length; console.log(`  🚨 다른 글자 ${inlineBad.length}곳: ${JSON.stringify(inlineBad)}`); }

    console.log(`\n판정: 렌더 ${seen - bad >= 0 ? seen : seen}곳 중 불일치 ${bad}건 · 콘솔 에러 ${errs.length}건 → ${bad === 0 && !errs.length ? 'PASS' : 'FAIL'}`);
    if (errs.length) console.log('  ' + errs.join('\n  '));

    await browser.close();
    process.exit(bad === 0 && errs.length === 0 ? 0 : 1);
})();
