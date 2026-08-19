// 정보 버튼(검정 원형 ⓘ)의 **글리프 + 흑백** 계약 검증 (slug: tech-info-glyph · equip-sheet-info-glyph).
//
// 원본(`ref/screens/shot-042546.png` 우상단, 젬 pill 아래)은 **검정 원 안 흰 소문자 `i`** 다.
// 클론은 기술 분기 화면만 `!` 로 그려서, **같은 스타일의 버튼 두 개가 화면마다 다른 글자**를 썼다.
//
// 그래서 '기술 분기가 i 인가' 하나만 보지 않는다 — 이 버튼이 나오는 **모든 화면**을 열어
// 전부 같은 글자인지 본다(새 화면에 이 버튼을 달면서 또 다른 글자를 쓰면 그 순간 FAIL).
//
// 🚨 **계약을 클래스 3종으로 넓혔다 (2026-08-19, equip-sheet-info-glyph)** — 종전엔 `.fi-info-btn`
//   만 훑어서, 장비 시트의 `.info-btn` 이 `!` 로 남아 있는 걸 **두 번째로 놓쳤다**. 같은 실수가
//   빠져나간 경로가 정확히 '오프너 없는 화면에 새 클래스로 달면서 다른 글자를 썼다' 였다.
//   이제 `.fi-info-btn` · `.info-btn` · `.info-dot` 을 전부 본다.
// 🚨 **흑백도 같이 잰다** — 장비 시트 ⓘ 는 글자만 맞고 **면이 흰색, 글자가 검정**으로 뒤집혀
//   있었다(원본은 검정 원 + 흰 i). 글리프만 보는 계약으로는 그 절반이 통째로 안 걸린다.
// 원본 대조는 글자 모양이 아니라 **글자 값**으로 건다: 원본에서 실측한 것은 'i' 이고, 이건
// 비율 채점이 아니라 되고 안 되고가 명확한 계약이다.
//
// 사용: PW_PATH=... node probe-info-glyph.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const GLYPH = 'i';   // 원본 shot-042546 실측 (8배 확대로 눈확인: 검정 원 + 흰 소문자 i, 점+세로획)
const CLASSES = ['fi-info-btn', 'info-btn', 'info-dot'];
const SEL = CLASSES.map(c => '.' + c).join(', ');

// 이 버튼이 실제로 뜨는 화면들 — `shot-screens.js` 의 오프너를 그대로 가져온다(진입 경로가 다르면
// 다른 것을 재게 된다는 앞 세션들의 함정 ㉢ 을 피하려는 것).
const SCREENS = [
    ['main-equip', `UI.switchTab('main');`],          // 장비 시트 ⓘ (.info-btn) — 부팅 화면 그대로
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
        const found = await page.evaluate(async ([src, SEL_]) => {
            eval(src);
            await new Promise(r => setTimeout(r, 220));
            // 보이는 것만 센다 — 숨은 패널 안의 버튼까지 세면 화면과 무관한 것을 재게 된다.
            const lum = (c) => { const n = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number); return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]; };
            return [...document.querySelectorAll(SEL_)]
                .filter(b => b.getBoundingClientRect().width > 0)
                .map(b => { const cs = getComputedStyle(b); return { g: b.textContent.trim(), cls: b.className, bg: lum(cs.backgroundColor), fg: lum(cs.color) }; });
        }, [opener, SEL]);
        if (!found.length) { console.log(`${name.padEnd(15)} (버튼 없음)   ${GLYPH}    SKIP`); continue; }
        for (const f of found) {
            seen++;
            // 원본은 **검정 면 + 흰 글리프**다. 뒤집힘을 잡으려고 면이 어둡고(밝기<90) 글자가
            // 밝은지(>150) 같이 본다 — 글리프만 보면 흑백 반전이 통째로 안 걸린다.
            const okG = f.g === GLYPH, okC = f.bg < 90 && f.fg > 150;
            if (!okG || !okC) bad++;
            console.log(`${name.padEnd(15)} ${f.g.padEnd(7)} ${GLYPH}     ${okG && okC ? 'PASS' : 'FAIL'}`
                + `  (${f.cls} · 면 ${f.bg.toFixed(0)} / 글자 ${f.fg.toFixed(0)}${okC ? '' : ' ← 흑백 뒤집힘'})`);
        }
    }

    // 소스 전수 검사 — 아직 오프너가 없는 화면에 이 버튼이 새로 붙어도 잡히게 한다.
    const fs = require('fs');
    const src = fs.readFileSync(path.resolve(__dirname, '../js/ui.js'), 'utf8');
    const inline = [...src.matchAll(new RegExp(`class="(?:${CLASSES.join('|')})[^"]*"[^>]*>([^<]*)<`, 'g'))].map(m => m[1].trim());
    const inlineBad = inline.filter(g => g !== GLYPH);
    console.log(`\n소스 내 ${CLASSES.map(c => '.' + c).join('·')} ${inline.length}곳 — 글리프: ${JSON.stringify(inline)}`);
    if (inlineBad.length) { bad += inlineBad.length; console.log(`  🚨 다른 글자 ${inlineBad.length}곳: ${JSON.stringify(inlineBad)}`); }

    console.log(`\n판정: 렌더 ${seen - bad >= 0 ? seen : seen}곳 중 불일치 ${bad}건 · 콘솔 에러 ${errs.length}건 → ${bad === 0 && !errs.length ? 'PASS' : 'FAIL'}`);
    if (errs.length) console.log('  ' + errs.join('\n  '));

    await browser.close();
    process.exit(bad === 0 && errs.length === 0 ? 0 : 1);
})();
