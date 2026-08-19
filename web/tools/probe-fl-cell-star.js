// forge-list-cell-star-unconditional 검증 — '모든 장비의 목록' 팝업 장비 셀의 ★.
// 사양(사용자 확정 age-bar-star-ascension): 장비 라인 승천 0회면 별이 하나도 없어야 한다.
// 승천 N회면 셀마다 별 N개(6+는 '★N' 접기 — rate-star/cell-star 와 같은 규약).
//
// ⚠️ 이 프로브는 '어느 한 선택자'를 믿지 않는다 — 1차 수정이 `.fl-face::after` 만 게이트했는데
// 사용자 화면에는 별이 남아 있었다. 그래서 셀 안의 **모든** 별 출처를 훑는다:
//   ⓐ 셀/자손의 ::before·::after content   ⓑ 마크업 텍스트 글리프   ⓒ 썸네일 캔버스에 구워진 별.
// 사용: node probe-fl-cell-star.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

function starCount(txt) {
    const t = (txt || '').replace(/^"|"$/g, '').trim();
    if (!t || t === 'none') return 0;
    const m = t.match(/^★+(\d+)?$/);
    if (!m) return -999;
    return m[1] ? parseInt(m[1], 10) : t.length;
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Ascension !== "undefined"', { label: '스크립트 로드' });

    // 승천 횟수를 n 으로 세팅하고 '모든 장비의 목록' 을 연 뒤 셀의 별 출처를 전수 조사한다.
    const collect = (n) => page.evaluate((ascN) => {
        Ascension.ensure();
        // 장비 라인 승천 카운트를 직접 세팅 — 저장 자리는 S.lineAscend (ascension.js:34 ensure/40 count).
        // ⚠️ S.ascension 이 아니다: 그 이름으로 쓰면 count() 가 계속 0 을 돌려줘 전 구간이 '별 0개'로 보인다.
        S.lineAscend.forge = ascN;
        if (typeof UI.closeModal === 'function') try { UI.closeModal(); } catch (e) { }
        UI.openForgeInfo();
        UI.openForgeList();

        const root = document.querySelector('#forge-info-modal') || document;
        const cells = [...root.querySelectorAll('.fl-face')];
        const card = root.querySelector('.fl-card');

        // ⓐ 셀 자신과 모든 자손의 두 의사요소 content 를 모은다
        const pseudo = {};
        const addP = (key, v) => { pseudo[key] = (pseudo[key] || 0) + 1; };
        let pseudoStars = 0;
        for (const c of cells.slice(0, 40)) {
            for (const el of [c, ...c.querySelectorAll('*')]) {
                for (const which of ['::before', '::after']) {
                    const ct = getComputedStyle(el, which).content;
                    if (ct && ct !== 'none' && ct !== 'normal' && ct.includes('★')) {
                        pseudoStars++;
                        addP(`${el.className || el.tagName}${which}=${ct}`);
                    }
                }
            }
        }
        // ⓑ 마크업 안의 별 글리프 (텍스트 노드)
        let markupStars = 0;
        for (const c of cells.slice(0, 40)) if ((c.textContent || '').includes('★')) markupStars++;

        // ⓒ 썸네일에 구워진 별: 셀 안 canvas/img 는 코드 생성이라 여기선 존재 여부만 기록
        const thumbs = cells.slice(0, 40).filter(c => c.querySelector('canvas,img')).length;

        // 대표 셀의 ::after content 원문 (1차 수정이 겨눈 그 자리)
        const face0 = cells[0] ? getComputedStyle(cells[0], '::after').content : '(no cell)';

        // ⓓ 별 띠가 셀 폭을 넘는가 — 별은 absolute 라 그리드는 안 밀지만 **옆 칸을 덮는다.**
        // 접기(★N) 규약이 있는 이유가 이 폭 한계다. 셀은 막대보다 좁아 자기 한계를 따로 갖는다.
        let cellW = 0, starW = 0;
        if (cells[0]) {
            cellW = +cells[0].getBoundingClientRect().width.toFixed(1);
            const cs = getComputedStyle(cells[0], '::after');
            const txt = (cs.content || '') === 'none' ? '' : (cs.content || '').replace(/^"|"$/g, '');
            const cv = document.createElement('span');
            cv.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-size:${cs.fontSize};font-family:${cs.fontFamily}`;
            cv.textContent = txt;
            document.body.appendChild(cv);
            starW = +cv.getBoundingClientRect().width.toFixed(1);
            cv.remove();
        }

        return {
            ascCount: Ascension.count('forge'),
            ageStars: UI.ageStars ? UI.ageStars() : '(none)',
            cells: cells.length,
            cardClass: card ? card.className : '(no .fl-card)',
            dataAsc: cells[0] ? (cells[0].getAttribute('data-asc') ?? '(no attr)') : '(no cell)',
            face0After: face0,
            face0AfterStars: (function (t) { const s = (t || '').replace(/^"|"$/g, '').trim(); if (!s || s === 'none') return 0; const m = s.match(/^★+(\d+)?$/); return m ? (m[1] ? +m[1] : s.length) : -999; })(face0),
            pseudoStarCells: pseudoStars,
            pseudoSources: Object.keys(pseudo).slice(0, 8),
            markupStars,
            thumbs,
            cellW, starW,
        };
    }, n);

    const rows = [];
    for (const n of [0, 1, 3, 5, 7]) rows.push([n, await collect(n)]);


    console.log('=== forge-list 장비 셀 ★ — 승천 횟수별 실측 ===');
    let fail = 0;
    for (const [n, r] of rows) {
        const want = n;                       // 승천 N회 → 셀당 별 N개
        const got = r.face0AfterStars;
        const extra = r.pseudoStarCells + r.markupStars;
        const ok = got === want;
        if (!ok) fail++;
        console.log(`\n승천 ${n}회 → Ascension.count('forge')=${r.ascCount} · 시대막대 ageStars='${r.ageStars}'`);
        console.log(`  셀 ${r.cells}개 · data-asc="${r.dataAsc}" · card="${r.cardClass}"`);
        console.log(`  셀 ::after content = ${r.face0After}  → 별 ${got}개 (기대 ${want}) ${ok ? 'PASS' : 'FAIL'}`);
        console.log(`  별을 그리는 의사요소가 있는 셀 ${r.pseudoStarCells}/40 · 마크업 별 셀 ${r.markupStars}/40 · 썸네일 ${r.thumbs}/40`);
        if (r.pseudoSources.length) console.log(`  출처: ${r.pseudoSources.join(' | ')}`);
        const overflow = r.starW > r.cellW;
        console.log(`  별 띠 폭 ${r.starW}px / 셀 폭 ${r.cellW}px ${overflow ? '🚨 셀을 넘어 옆 칸을 덮는다' : 'ok'}`);
        if (overflow) fail++;
        // 승천 0회에서는 별을 그리는 출처가 단 하나도 없어야 한다 (사용자 확정 사양)
        if (n === 0 && extra > 0) { console.log(`  🚨 승천 0회인데 별 출처 ${extra}건 — 사양 위반`); fail++; }
    }

    // ⚠️ 결정적 검사 — **썸네일이 실제로 채워진 뒤**에도 별이 남아 있는가.
    // 위 4회는 여는 즉시 재서 썸네일이 0/40 이었다(아직 안 구워짐). 이 항목의 처방이
    // '별을 자식이 아니라 data-asc 속성에 실었다' 인 이상, innerHTML 이 갈린 뒤를 안 재면
    // 정작 고친 이유를 검증하지 않은 게 된다. 승천 3회로 열고 썸네일이 구워지길 기다렸다 다시 잰다.
    await collect(3);
    await page.waitForFunction(() => {
        const f = document.querySelectorAll('#forge-info-modal .fl-face');
        let n = 0; for (const el of f) if (el.querySelector('img')) n++;
        return n >= 12;                       // CHUNK=6 이라 두 프레임이면 넘는다
    }, null, { timeout: 60000 }).catch(() => { });
    const after = await page.evaluate(() => {
        const cells = [...document.querySelectorAll('#forge-info-modal .fl-face')];
        const hydrated = cells.filter(c => c.querySelector('img'));
        const probe = hydrated[0] || cells[0];
        return {
            hydrated: hydrated.length,
            total: cells.length,
            attr: probe ? probe.getAttribute('data-asc') : '(none)',
            after: probe ? getComputedStyle(probe, '::after').content : '(none)',
        };
    });
    const survStars = starCount(after.after);
    const survOk = after.hydrated > 0 && survStars === 3;
    console.log(`\n=== 썸네일 하이드레이션 후 별 생존 (승천 3회) ===`);
    console.log(`  썸네일 구워진 셀 ${after.hydrated}/${after.total} · data-asc="${after.attr}" · ::after=${after.after} → 별 ${survStars}개`);
    console.log(`  ${survOk ? 'PASS — innerHTML 이 갈려도 별이 살아남는다' : 'FAIL — 하이드레이션이 별을 지웠다(자식 노드로 넣은 것과 같은 사고)'}`);
    if (!survOk) fail++;

    console.log(`\n콘솔 에러 ${errors.length}건`);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    console.log(fail === 0 ? '\n판정: PASS — 셀 ★이 승천 횟수와 1:1' : `\n판정: FAIL — ${fail}건`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})();
