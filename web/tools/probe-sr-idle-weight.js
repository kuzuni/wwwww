// 소환 결과 — **아이들(연출 종료 후) 구간의 셀별 생동 진폭**이 등급 위계를 따르는지 실측.
// 사용: node probe-sr-idle-weight.js
//
// 9차 비평가 A ⑹: "아이들 구간 변화폭이 **주역 1.68 vs 조연 19.58**로 주역이 12배 죽어 있다."
// 즉 화면에 남은 뒤의 '살아 있음'이 등급과 **거꾸로** 붙어 있다는 지적이다.
//
// 재는 법: `.done`이 걸린 뒤(=아이들 루프만 도는 상태) 셀마다 **고정 상자**를 잡고
// **애니메이션 시각을 고정 격자로 세워 가며** 그 안의 평균 휘도를 찍어 (max-min) 진폭을 낸다.
//  ⚠️ ㉠ 상자는 **셀이 숨쉬며 움직이기 전(정지 rect)** 에 잡고 여유(margin)를 준다 —
//        움직이는 요소를 매 프레임 다시 재면 진폭이 아니라 추적 오차를 재게 된다.
//  🚨 ㉡ **실시간(wall-clock) 표집은 못 쓴다 — 첫 판에서 이걸로 태웠다.** 스크린샷 왕복 지연이
//        들쭉날쭉해 34표본이 2.6s(호흡)·1.6s(펄스)·3.6s(스윕) 세 주기의 임의 위상에 떨어지고,
//        **같은 코드·같은 판인데 주역 진폭이 14.48 / 10.82 / 9.92 로 흔들려 G1이 PASS↔FAIL을
//        오갔다.** (max-min 이라 간격이 불규칙해도 된다고 적었던 앞 주석이 틀렸다 — 불규칙한 게
//        아니라 **성기게** 떨어지는 게 문제다.) 그래서 전 애니메이션을 pause 하고
//        `currentTime` 을 200ms 격자로 세워 가며 찍는다. 무한 루프는 T 를 그대로 주고,
//        유한(`forwards`) 애니메이션은 **끝 프레임에 고정**한다 — 그게 실제 아이들 상태다.
//        (`shot-summon-result.js` 의 시크 함정과 다른 점: 저기는 도입부 원점 보정이 필요했지만
//         여기서 재는 건 원점이 의미 없는 **무한 루프**뿐이다.)
//  ⚠️ ㉢ 3D 루프를 안 멈추면 스크린샷 한 장이 15~30초다 — Scene3D.update를 비운다.
//
// 두 가지를 따로 낸다(원인이 다르다):
//  ⒜ **휘도 진폭** — 상자 안 평균휘도의 max-min. 화면에서 '얼마나 살아 보이는가'에 가깝지만,
//     스윕·펄스 같은 **광량** 성분이 대부분을 먹어서 호흡(기하) 변화에는 둔하다.
//  ⒝ **호흡 진폭(기하)** — orbwrap 렌더 폭의 (max-min)/min. `--idle` 계단이 실제로 먹었는지는
//     이쪽으로만 보인다. ⒜만 보고 '효과 없음'이라 결론 내지 말 것(실제로 한 번 그럴 뻔했다).
//
// 게이트:
//   G1 **위계 역전 없음** — 주역(최고 등급) 휘도 진폭 ≥ 조연 최대.
//   G2 **아무도 정지 아님** — 전 셀 휘도 진폭 ≥ 0.5 (휘도 0~255 기준).
//   G3 **호흡이 등급을 따른다** — 주역 호흡 진폭 ≥ 조연 최대 호흡 진폭 × 1.15.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

// 아이들 루프 최장 주기 3.6s의 두 배를 200ms 격자로 훑는다(37표본)
const T_STEP = 200, T_END = 7200;
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

    // 전 애니메이션을 멈추고 시각을 직접 세운다(재현성의 핵심 — 위 ㉡)
    const SEEK = `(T => {
        for (const a of document.getAnimations()) {
            a.pause();
            let inf = false;
            try { inf = a.effect.getTiming().iterations === Infinity; } catch (e) { /* 무시 */ }
            try { a.currentTime = inf ? T : (a.effect.getComputedTiming().endTime || 0); } catch (e) { /* 무시 */ }
        }
    })`;

    const series = cells.map(() => []);
    const widths = cells.map(() => []);
    for (let T = 0; T <= T_END; T += T_STEP) {
        await page.evaluate(`${SEEK}(${T})`);
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
        const ws = await page.evaluate(`[...document.querySelectorAll('.sr-body > .sr-grid > .sr-cell')]
            .map(c => c.querySelector('.sr-orbwrap').getBoundingClientRect().width)`);
        ws.forEach((v, i) => widths[i].push(v));
    }

    const RK = ['일반', '희귀한', '서사시', '전설', '궁극의', '신화'];
    const rows = cells.map((c, i) => {
        const s = series[i], w = widths[i];
        const wmin = Math.min(...w), wmax = Math.max(...w);
        return { ...c, amp: Math.max(...s) - Math.min(...s), breath: (wmax - wmin) / (wmin || 1) };
    });
    console.log('== 아이들 구간 셀별 생동 진폭 ==');
    for (const r of rows) {
        console.log(`  셀${r.i}  ${RK[r.tier].padEnd(8)} ${r.hero ? '주역' : '조연'}`
            + `  휘도진폭 ${r.amp.toFixed(2)}  호흡진폭 ${(r.breath * 100).toFixed(2)}%`);
    }
    const hero = rows.find(r => r.hero) || rows[rows.length - 1];
    const side = rows.filter(r => r !== hero);
    const sideMax = Math.max(...side.map(r => r.amp));
    const minAmp = Math.min(...rows.map(r => r.amp));
    const sideBreath = Math.max(...side.map(r => r.breath));
    const g1 = hero.amp >= sideMax;
    const g2 = minAmp >= 0.5;
    const g3 = hero.breath >= sideBreath * 1.15;
    console.log(`\n  주역 진폭 ${hero.amp.toFixed(2)} vs 조연 최대 ${sideMax.toFixed(2)}`
        + `  → G1 위계 ${g1 ? 'PASS' : 'FAIL (주역이 죽어 있다)'}`);
    console.log(`  최소 휘도진폭 ${minAmp.toFixed(2)} (하한 0.5) → G2 ${g2 ? 'PASS' : 'FAIL (정지한 셀 있음)'}`);
    console.log(`  주역 호흡 ${(hero.breath * 100).toFixed(2)}% vs 조연 최대 ${(sideBreath * 100).toFixed(2)}%`
        + ` (1.15배 이상 요구) → G3 ${g3 ? 'PASS' : 'FAIL (호흡이 등급을 안 따른다)'}`);
    console.log(errs.length ? `콘솔/페이지 에러 ${errs.length}건:\n  ` + errs.join('\n  ') : '콘솔/페이지 에러 0건');
    console.log(g1 && g2 && g3 && !errs.length ? '판정: PASS' : '판정: FAIL');
    await browser.close();
    process.exit(g1 && g2 && g3 && !errs.length ? 0 : 1);
})();
