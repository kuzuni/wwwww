// forge-list 셀 ★ 눈 확인 — 승천 0/1/3/5/7 회의 '모든 장비의 목록' 상단을 잘라 붙인다.
// 별은 position:absolute 라 그리드 레이아웃엔 영향이 없지만, 개수가 늘면 **셀 폭을 넘어**
// 옆 칸을 침범할 수 있어 그 폭을 실측한다. 사용: node shot-fl-cell-star.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Ascension !== "undefined"', { label: '스크립트 로드' });

    for (const n of [0, 1, 3, 5, 7]) {
        const m = await page.evaluate((ascN) => {
            Ascension.ensure(); S.lineAscend.forge = ascN;
            UI.openForgeInfo(); UI.openForgeList();
            const cell = document.querySelector('#forge-info-modal .fl-face');
            if (!cell) return null;
            const r = cell.getBoundingClientRect();
            // ::after 는 별도 박스가 없으므로 같은 글꼴로 폭을 재현해 잰다
            const cs = getComputedStyle(cell, '::after');
            const cv = document.createElement('span');
            cv.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font};font-size:${cs.fontSize};font-family:${cs.fontFamily}`;
            // content 가 'none'(=별 없음)이면 글자로 재면 안 된다 — 'none' 네 글자 폭을 별 폭으로 착각한다.
            const txt = (cs.content || '') === 'none' ? '' : (cs.content || '').replace(/^"|"$/g, '');
            cv.textContent = txt;
            document.body.appendChild(cv);
            const w = cv.getBoundingClientRect().width;
            cv.remove();
            return { cellW: +r.width.toFixed(1), starW: +w.toFixed(1), text: txt };
        }, n);
        const over = m && m.starW > m.cellW;
        console.log(`승천 ${n}회 → 별 "${m.text}" 폭 ${m.starW}px / 셀 폭 ${m.cellW}px ${over ? '🚨 셀을 넘는다' : 'ok'}`);
        // ⚠️ 썸네일 하이드레이션(rAF pump)이 도는 동안은 페이지가 '안정' 판정을 못 받아 스크린샷이
        // 타임아웃한다. 수치가 본체이므로 캡처는 실패해도 넘어간다(animations:disabled + 짧은 타임아웃).
        await page.screenshot({
            path: path.resolve(__dirname, `flcellstar-asc${n}.png`),
            clip: { x: 0, y: 90, width: 430, height: 300 }, animations: 'disabled', timeout: 8000,
        }).catch(() => console.log(`   (캡처 건너뜀 — 하이드레이션 중)`));
    }
    await browser.close();
})();
