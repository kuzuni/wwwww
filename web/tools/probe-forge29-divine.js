// 대장간 29레벨 시대 확률표 회귀 검사 (slug: forge29-divine)
// 원본 게임 스크린샷 ref/screens/shot-042950(필터 ON)·shot-043117(필터 OFF)의 자동 제련 '유지' 목록은
// 항성간 6.99% / 다중 우주 68% / 양자 23% / 지하 세계 2% / 신성한 0.02% 의 **5줄**이다.
// 추출원(ForgeMasterCalculator = data/raw/app.js)은 이 행을 divine 없는 4줄 + interstellar 7.00 으로 적어
// 뒀고 클론이 그걸 그대로 따르는 바람에 한 줄이 모자랐다 → 아래 스택 y 가 통째로 한 피치 어긋났다.
//
// ⚠️ 시대 '이름'은 대조하지 않는다. 클론의 AGE_KR(성간/다중우주/명계/천상)이 원본 표기
//    (항성간/다중 우주/지하 세계/신성한)와 다른 건 게임 전역의 별도 사안이라 QA 항목으로 따로 등재돼 있다.
//    여기서 보는 건 **줄 수와 퍼센트 표기**뿐이다.
// 사용: node tools/probe-forge29-divine.js   (exit 0 = PASS, 2 = FAIL)
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const EXPECT_PCT = ['6.99%', '68%', '23%', '2%', '0.02%'];
const EXPECT_AGES = ['interstellar', 'multiverse', 'quantum', 'underworld', 'divine'];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"', { label: '스크립트 로드' });

    let fail = 0;
    for (const on of [true, false]) {
        await page.evaluate((f) => {
            S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9; S.forgeLevel = 29;
            S.autoForge.filterOn = f; S.autoForge.hammersPerBatch = 22;
            UI.openAutoForge();
            // 열림 애니메이션(scale .7)이 걸린 채로 재면 위치가 70%로 찍힌다 — 무효화 후 측정.
            document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening'));
            document.querySelectorAll('.modal-card').forEach(c => { c.style.animation = 'none'; c.style.transform = 'none'; });
        }, on);
        await page.waitForTimeout(250);
        const rows = await page.evaluate(() => {
            const H = innerHeight;
            return [...document.querySelectorAll('.af-age-bar')].map(el => ({
                age: el.dataset.age,
                pct: el.querySelector('.af-age-pct').textContent.trim(),
                y: +(el.getBoundingClientRect().top / H * 100).toFixed(2),
            }));
        });
        const label = on ? '필터 ON (shot-042950)' : '필터 OFF (shot-043117)';
        console.log(`\n[${label}] 줄 수 ${rows.length} (원본 5)`);
        if (rows.length !== EXPECT_PCT.length) fail++;
        rows.forEach((r, i) => {
            const ok = r.age === EXPECT_AGES[i] && r.pct === EXPECT_PCT[i];
            if (!ok) fail++;
            console.log(`  ${i + 1}. ${ok ? 'OK  ' : 'FAIL'} ${r.age} ${r.pct}  y=${r.y}%  기대=${EXPECT_AGES[i] || '(없음)'} ${EXPECT_PCT[i] || ''}`);
        });
    }

    console.log('\n콘솔 에러:', errs.length ? errs : '없음');
    await browser.close();
    if (fail || errs.length) { console.log('\n결과: FAIL'); process.exit(2); }
    console.log('\n결과: PASS — 29레벨 유지 목록이 원본과 같은 5줄·같은 퍼센트 표기');
})();
