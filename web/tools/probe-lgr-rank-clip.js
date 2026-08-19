// 리그 보상 팝업 4위 이하 등수 라벨이 오른쪽 보상 pill 을 파고들지 않는지 검증
// (slug: lgr-rank-label-overflow).
//
// 버그: `fitLeagueRankLabels` 가 "라벨이 칸 가운데 정렬이라 좌우 대칭으로 삐져나온다"는
//   틀린 전제로 여유 폭을 ~7px 과대 산정 → `11-20`·`21위 이하` 잉크가 pill 밑으로 8px 파고들어
//   마지막 글자가 반쯤 잘렸다. 실측은 오버플로가 **오른쪽 전용**(ink.left≈cell.left)임을 보였다.
// 판정: 4위 이하 모든 텍스트 라벨에서 **잉크 오른쪽 ≤ 보상 그리드(pill) 왼쪽**(침범 ≤ 0px).
//   외곽선(-webkit-text-stroke)이 잉크 밖으로 번지므로 2px 안전 마진을 요구한다(획까지 안 잘리게).
//
// ⚠️ 여러 뷰포트에서 재현됐으므로 두 폭(430×932·360×640)에서 확인한다.
// ⚠️ fitLeagueRankLabels 는 폰트 로드 뒤 한 번 더 도므로 열고 넉넉히 기다린다.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const VIEWPORTS = [{ width: 430, height: 932 }, { width: 360, height: 640 }];
const MARGIN = 2;   // 외곽선·반올림 안전 마진(px)

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    let fail = 0;
    const allErrs = [];
    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
        page.on('pageerror', e => allErrs.push(String(e)));
        page.on('console', m => { if (m.type() === 'error') allErrs.push(m.text()); });
        await page.goto(INDEX);
        await page.waitForFunction('typeof UI !== "undefined" && UI.els && UI.els.craftModal');
        await page.evaluate(() => { UI.openLeague(); UI.openLeagueRewards(); });
        await page.waitForTimeout(500);
        const rows = await page.evaluate(() => {
            const out = [];
            for (const el of document.querySelectorAll('.lgr-overlay .league-tier-rank.text')) {
                const grid = el.nextElementSibling;
                if (!grid) continue;
                const rg = document.createRange(); rg.selectNodeContents(el);
                const ink = rg.getBoundingClientRect();
                out.push({
                    text: el.textContent,
                    inkRight: +ink.right.toFixed(1),
                    pillLeft: +grid.getBoundingClientRect().left.toFixed(1),
                    font: +parseFloat(getComputedStyle(el).fontSize).toFixed(1),
                });
            }
            return out;
        });
        await page.close();
        console.log(`■ 뷰포트 ${vp.width}×${vp.height} — 4위 이하 ${rows.length}줄`);
        for (const r of rows) {
            const over = r.inkRight - (r.pillLeft - MARGIN);   // >0 이면 침범
            const bad = over > 0;
            if (bad) fail++;
            console.log(`   ${r.text.padEnd(8)} 잉크오른쪽 ${r.inkRight} vs pill ${r.pillLeft} (마진 ${MARGIN}) → 여유 ${(-over).toFixed(1)}px · font ${r.font}px  ${bad ? '✗ 침범' : '✓'}`);
        }
    }
    await browser.close();
    if (allErrs.length) { console.log(`\n  🚨 콘솔 에러 ${allErrs.length}건:`); allErrs.slice(0, 5).forEach(e => console.log('   · ' + e)); fail++; }
    console.log(fail ? `\n결과: FAIL ${fail}건` : '\n결과: PASS — 모든 등수 라벨이 pill 을 파고들지 않는다');
    process.exit(fail ? 2 : 0);
})();
