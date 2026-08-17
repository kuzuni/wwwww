// 소환 결과 — **아이들(연출 종료 후) 구간의 셀별 생동 진폭**이 등급 위계를 따르는지 실측.
// 사용: node probe-sr-idle-weight.js
//
// 9차 비평가 A ⑹: "아이들 구간 변화폭이 **주역 1.68 vs 조연 19.58**로 주역이 12배 죽어 있다."
// 즉 화면에 남은 뒤의 '살아 있음'이 등급과 **거꾸로** 붙어 있다는 지적이다.
//
// 재는 법: `.done`이 걸린 뒤(=아이들 루프만 도는 상태) 셀마다 **고정 상자**를 잡고
// 프레임마다 그 안의 평균 휘도를 찍어 (max-min) 진폭을 낸다.
//  ⚠️ ㉠ 상자는 **셀이 숨쉬며 움직이기 전(정지 rect)** 에 잡고 여유(margin)를 준다 —
//        움직이는 요소를 매 프레임 다시 재면 진폭이 아니라 추적 오차를 재게 된다.
//  ⚠️ ㉡ 표본 간격이 아니라 **커버리지**가 중요하다. 아이들 루프는 2.6s(호흡)·1.6s(펄스)·
//        3.6s(스윕) 세 주기가 겹치므로 최소 두 주기(≈7.2s)를 덮어야 한다. 스크린샷 왕복 때문에
//        간격이 들쭉날쭉해도 (max-min)에는 영향이 없다(앞 세션이 타이밍 계측에서 밟은 함정과
//        달리 여기선 위상이 아니라 진폭만 본다).
//  ⚠️ ㉢ 3D 루프를 안 멈추면 스크린샷 한 장이 15~30초다 — Scene3D.update를 비운다.
//
// 게이트:
//   G1 **위계 역전 없음** — 주역(최고 등급) 진폭 ≥ 조연 최대 진폭.
//   G2 **아무도 정지 아님** — 전 셀 진폭 ≥ 0.5 (휘도 0~255 기준).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const FRAMES = 34, GAP = 60;
const SEED = `
    S.tickets = 999999; S.gems = 999999; S.eggCurrency = 999999; S.winders = 999999;
    S.bestChapter = 20; S.bestStage = 9; S.summonCount = 5000; saveGame();
    Scene3D.update = function () {};
`;
// 주역(전설 이상)이 확실히 서게 만렙 소환 레벨로 x5를 굴린다.
// ⚠️ 등급 구성이 난수면 실행마다 셀 수·등급이 달라져 **수정 전/후 비교가 성립하지 않는다**
//    (실제로 같은 코드에서 한 번은 PASS, 한 번은 FAIL이 났다 — 코드가 아니라 뽑기가 달랐다).
//    게임 코드는 손대지 않고 Math.random 만 고정 LCG로 갈아 끼운다. **시드는 소환을 부르기
//    직전 같은 evaluate 안에서 심을 것** — 시드와 소환 사이에 다른 코드(챗·파티클)가 난수를
//    몇 번 쓰는지가 타이밍에 따라 달라져, 페이지 로드 직후에 심으면 재현이 깨진다.
const RUN = `
    Math.random = (s => () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)(20260818);
    S.summonMult = {skill:5}; UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.onSummon(false);`;

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction('typeof UI !== "undefined"');
    await page.evaluate(SEED);
    await page.evaluate(RUN);
    await page.waitForFunction('document.querySelector("#summon-result-modal.done")', { timeout: 30000 });
    await page.waitForTimeout(400);

    // 정지 상태의 셀 상자(여유 12px) — 숨쉬는 동안에도 셀이 상자를 벗어나지 않게
    // ⚠️ `.sr-cell` 로 전부 긁으면 **바닥 반사(.sr-reflect)의 복제 셀까지** 잡힌다
    //    (x5인데 셀이 10개로 나온다). 반사는 `.sr-reflect` 안에 **`.sr-grid` 를 통째로 복제**하므로
    //    `.sr-grid > .sr-cell` 로도 안 걸러진다 — 게임 코드(onSummonResultTap)와 같은
    //    `.sr-body > .sr-grid > .sr-cell` 를 써야 원본 줄만 잡힌다.
    const cells = await page.evaluate(`[...document.querySelectorAll('.sr-body > .sr-grid > .sr-cell')].map((c, i) => {
        const w = c.querySelector('.sr-orbwrap').getBoundingClientRect();
        return { i, tier: +c.dataset.tier, hero: c.classList.contains('heroic'),
                 x: Math.round(w.x - 12), y: Math.round(w.y - 12),
                 w: Math.round(w.width + 24), h: Math.round(w.height + 24) };
    })`);

    const series = cells.map(() => []);
    for (let f = 0; f < FRAMES; f++) {
        const shot = await page.screenshot();
        const vals = await page.evaluate(`(async () => {
            const img = new Image();
            img.src = 'data:image/png;base64,' + ${JSON.stringify(shot.toString('base64'))};
            await img.decode();
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            return ${JSON.stringify(cells)}.map(b => {
                const d = g.getImageData(b.x, b.y, b.w, b.h).data;
                let s = 0;
                for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                return s / (d.length / 4);
            });
        })()`);
        vals.forEach((v, i) => series[i].push(v));
        await page.waitForTimeout(GAP);
    }

    const RK = ['일반', '희귀한', '서사시', '전설', '궁극의', '신화'];
    const rows = cells.map((c, i) => {
        const s = series[i];
        return { ...c, amp: Math.max(...s) - Math.min(...s) };
    });
    console.log('== 아이들 구간 셀별 생동 진폭 (프레임 평균휘도 max-min) ==');
    for (const r of rows) {
        console.log(`  셀${r.i}  ${RK[r.tier].padEnd(8)} ${r.hero ? '주역' : '조연'}  진폭 ${r.amp.toFixed(2)}`);
    }
    const hero = rows.find(r => r.hero) || rows[rows.length - 1];
    const side = rows.filter(r => r !== hero);
    const sideMax = Math.max(...side.map(r => r.amp));
    const minAmp = Math.min(...rows.map(r => r.amp));
    const g1 = hero.amp >= sideMax;
    const g2 = minAmp >= 0.5;
    console.log(`\n  주역 진폭 ${hero.amp.toFixed(2)} vs 조연 최대 ${sideMax.toFixed(2)}`
        + `  → G1 위계 ${g1 ? 'PASS' : 'FAIL (주역이 죽어 있다)'}`);
    console.log(`  최소 진폭 ${minAmp.toFixed(2)} (하한 0.5) → G2 ${g2 ? 'PASS' : 'FAIL (정지한 셀 있음)'}`);
    console.log(errs.length ? `콘솔/페이지 에러 ${errs.length}건:\n  ` + errs.join('\n  ') : '콘솔/페이지 에러 0건');
    console.log(g1 && g2 && !errs.length ? '판정: PASS' : '판정: FAIL');
    await browser.close();
    process.exit(g1 && g2 && !errs.length ? 0 : 1);
})();
