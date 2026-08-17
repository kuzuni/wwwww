// 대형 재화값이 실제 상단바에 어떻게 찍히는지 인앱 검증 (slug: fmt-beyond-qi)
// 사용: node web/tools/probe-fmt-topbar.js
// 검사: ① 상단바 재화 텍스트에 지수 표기(e+)·Infinity·NaN 가 없다 ② pill 이 앱 밖으로 안 밀린다
//       ③ 콘솔 에러 0건. exit 0 = PASS, 1 = FAIL.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');

const VALUES = [1e12, 1e15, 1e18, 1e21, 1e30, 1e40, 1e60, 1e300, Infinity];

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined"', { label: '스크립트 로드' });

    let fails = 0;
    for (const v of VALUES) {
        // Infinity 는 evaluate 인자로 직렬화되지 않으므로 문자열로 넘겨 페이지 안에서 되살린다
        const r = await page.evaluate((sv) => {
            const n = Number(sv);
            S.coins = n; S.gems = n; S.hammers = n;
            UI.renderTopBar();
            const bar = document.querySelector('#topbar') || document.querySelector('.topbar');
            const app = document.querySelector('#app');
            const ab = app.getBoundingClientRect();
            const over = [...(bar ? bar.querySelectorAll('*') : [])]
                .filter(el => !el.children.length)
                .map(el => el.getBoundingClientRect())
                .filter(b => b.width > 0 && (b.left < ab.left - 0.5 || b.right > ab.right + 0.5)).length;
            return { text: (bar ? bar.innerText : '').replace(/\s+/g, ' ').trim(), over };
        }, String(v));

        const bad = [];
        if (/e[+-]\d/i.test(r.text)) bad.push('지수 표기 누출');
        if (/Infinity|NaN/.test(r.text)) bad.push('원시 토큰 누출');
        if (r.over) bad.push(`앱 가로 경계 밖 요소 ${r.over}개`);
        if (bad.length) fails++;
        console.log(`${String(v).padEnd(10)} 상단바="${r.text}" ${bad.length ? 'FAIL — ' + bad.join(' / ') : 'ok'}`);
    }

    if (errors.length) { fails++; console.log('콘솔 에러:\n  ' + errors.join('\n  ')); }
    else console.log('콘솔 에러 0건');
    console.log(fails ? `\n결과: FAIL ${fails}건` : `\n결과: PASS (${VALUES.length}개 값 전부 통과)`);
    await browser.close();
    process.exit(fails ? 1 : 0);
})();
