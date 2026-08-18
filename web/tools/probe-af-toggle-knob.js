// 자동 제련 [필터] 토글 — 트랙/노브 기하와 **꺼짐↔켜짐 판별성** 실측.
//
// 왜 별도 프로브인가: `probe-af-dom.js` 는 `.af-toggle`(트랙) 의 바깥 상자만 재서
// **노브가 트랙 밖 어디에 있는지**를 못 본다. 이 항목의 결함은 트랙 크기가 아니라
// 노브의 `left` 였다(트랙은 거의 맞았는데 OFF 노브만 안 나가서 켜짐처럼 읽혔다).
//
// 원본 실측(shot-042950 = 필터 ON / shot-043117 = 필터 OFF · **앱 폭 491px 기준**):
//   ⚠️ 원본 이미지 폭(503 / 494)은 앱 폭이 아니다 — probe-affilter-dom.js 머리말 참조.
//      042950 은 appL=0, 043117 은 appL=-2 라 043117 의 이미지 x 에 +2 해서 앱 좌표로 맞춘다.
//   트랙      x 383~413 (폭 31) · 높이 21   ← 두 컷 모두 높이 21 로 일치
//   노브      지름 27 정원                  ← 두 컷 모두 27, 트랙 위아래로 3px 씩 넘침
//   노브 left  OFF 트랙 왼쪽 -14 · ON 트랙 왼쪽 +17(= 트랙 오른쪽 밖 13) → 좌우 대칭
//   드러난 트랙 OFF 노브 오른쪽~트랙 오른쪽 18 · ON 트랙 왼쪽~노브 왼쪽 17
//   '필터' 글자 오른쪽 끝 x 363(두 컷 일치) → OFF 노브 왼쪽까지 틈 6px
// 위 값들을 %W(÷491)로 환산해 목표치로 쓴다. 통과 기준 ±2%p.
//
// 사용: node tools/probe-af-toggle-knob.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const { waitReady } = require('./wait-ready.js');

const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const REFW = 491;
const pct = px => +(px / REFW * 100).toFixed(3);

// label → { off, on } 목표 %W (null = 그 상태에선 안 잼)
const TARGET = {
    '트랙 폭':            { off: pct(31), on: pct(31) },
    '트랙 높이':          { off: pct(21), on: pct(21) },
    '노브 지름':          { off: pct(27), on: pct(27) },
    '노브 세로 지름':     { off: pct(27), on: pct(27) },
    '노브 left(트랙기준)': { off: pct(-14), on: pct(17) },
    '드러난 트랙 토막':    { off: pct(18), on: pct(17) },
    '글자~노브 틈':       { off: pct(6), on: null },
};
const TOL = 2.0;

async function measure(page, on) {
    await page.evaluate((v) => {
        S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9; S.forgeLevel = 29;
        S.autoForge.filterOn = v; S.autoForge.hammersPerBatch = 22;
        UI.openAutoForge();
    }, on);
    await page.waitForTimeout(350);
    // 열림 애니메이션(cardpop scale(.7))이 남아 있으면 rect 가 통째로 70% 로 찍힌다 — 무효화 후 잰다.
    await page.evaluate(() => {
        document.querySelectorAll('.modal.opening').forEach(m => m.classList.remove('opening'));
        document.querySelectorAll('.modal-card').forEach(c => { c.style.animation = 'none'; c.style.transform = 'none'; });
        document.querySelectorAll('.af-toggle .knob').forEach(k => { k.style.transition = 'none'; });
    });
    await page.waitForTimeout(120);
    return page.evaluate(() => {
        const appEl = document.getElementById('app');
        const W = appEl.getBoundingClientRect().width;
        const t = document.querySelector('.af-toggle').getBoundingClientRect();
        const k = document.querySelector('.af-toggle .knob').getBoundingClientRect();
        // '필터' 는 raw 텍스트 노드다 — Range 로 글리프 실제 오른쪽 끝을 잡는다(요소 상자가 아니다).
        const row = document.querySelector('.af-filter-row');
        const tn = [...row.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        const rg = document.createRange(); rg.selectNodeContents(tn);
        const tx = rg.getBoundingClientRect();
        const p = px => +(px / W * 100).toFixed(3);
        return {
            '트랙 폭': p(t.width), '트랙 높이': p(t.height),
            '노브 지름': p(k.width), '노브 세로 지름': p(k.height),
            '노브 left(트랙기준)': p(k.left - t.left),
            '드러난 트랙 토막': p(k.left - t.left < 0 ? t.right - k.right : k.left - t.left),
            '글자~노브 틈': p(k.left - tx.right),
            _rect: { t: [t.left, t.top, t.width, t.height], k: [k.left, k.top, k.width, k.height] },
        };
    });
}

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"', { label: '스크립트 로드' });

    const off = await measure(page, false);
    const shotOff = await page.locator('.af-filter-row').screenshot();
    const on = await measure(page, true);
    const shotOn = await page.locator('.af-filter-row').screenshot();

    console.log('자동 제련 [필터] 토글 — 클론 390x844(앱 390x693, dpr3) vs 원본(앱 491)  단위 %W');
    console.log('항목'.padEnd(22) + 'OFF'.padStart(9) + '원본'.padStart(9) + 'Δ'.padStart(8) + '  |' + 'ON'.padStart(9) + '원본'.padStart(9) + 'Δ'.padStart(8) + '  판정');
    let fail = 0;
    for (const key of Object.keys(TARGET)) {
        const tg = TARGET[key];
        const cells = [];
        let bad = false;
        for (const [st, val] of [['off', off[key]], ['on', on[key]]]) {
            if (tg[st] === null) { cells.push('—'.padStart(9) + '—'.padStart(9) + '—'.padStart(8)); continue; }
            const d = val - tg[st];
            if (Math.abs(d) > TOL) bad = true;
            cells.push(String(val).padStart(9) + String(tg[st]).padStart(9) + d.toFixed(2).padStart(8));
        }
        if (bad) fail++;
        console.log(key.padEnd(22) + cells[0] + '  |' + cells[1] + '  ' + (bad ? `❌ >±${TOL}%p` : '✅'));
    }

    // 판별성 — 두 상태의 그림이 실제로 다른가(색만 바뀌고 실루엣이 같으면 '켜짐처럼 읽히는' 결함이 남는다).
    // 노브가 트랙 안에서 좌↔우로 미끄러지므로 노브 중심 이동량이 노브 지름의 절반은 넘어야 한다.
    const travel = on['노브 left(트랙기준)'] - off['노브 left(트랙기준)'];
    const halfKnob = on['노브 지름'] / 2;
    const travelOK = travel > halfKnob;
    console.log(`\n노브 이동량 ${travel.toFixed(3)}%W (노브 지름의 ${(travel / on['노브 지름'] * 100).toFixed(0)}%) — 원본 ${pct(31)}%W · 반지름 초과 ${travelOK ? '✅' : '❌'}`);
    if (!travelOK) fail++;

    // 프레임 픽셀 차이 — 같은 상자를 찍어 얼마나 다른 그림인지
    const diff = shotOff.length && shotOn.length ? Math.abs(shotOn.length - shotOff.length) : 0;
    console.log(`행 캡처 바이트 OFF ${shotOff.length} / ON ${shotOn.length} (Δ${diff})`);

    console.log(fail === 0 ? '\nPASS — 전 항목 ±2%p 이내' : `\nFAIL — ${fail}개 항목 이탈`);
    await browser.close();
    process.exit(fail === 0 ? 0 : 1);
})();
