// 제작(뽑기) 버튼이 ⚒️ 이모지가 아니라 모루 그림으로 렌더되는지 확인하는 도구.
// 원본 shot-042120에서 모루는 화면 높이의 ≈8.5%(499×892 중 76px)를 차지한다 — 같은 비율로
// 그려지는지, 타격 연출 오버레이(.anvil-fx)가 여전히 모루 위에 정확히 얹히는지 함께 잰다.
// 화면 캡처는 scratch/anvil-<w>x<h>.png 로 저장한다.
// 사용: node probe-anvil.js [출력디렉터리]
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || '.';

const VIEWPORTS = [
    { width: 430, height: 932 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
];
const REF_H_PCT = 8.5;   // 원본 실측 76 / 892
const TOL = 2.0;         // ±2%p

// UI·S는 최상위 const/let이라 window의 속성이 아니다 — waitForFunction의 술어에서는 안 보인다.
async function waitBooted(page, timeout = 20000) {
    const t0 = Date.now();
    for (;;) {
        const ok = await page.evaluate(() => typeof UI !== 'undefined' && typeof S !== 'undefined' && !!S).catch(() => false);
        if (ok) return;
        if (Date.now() - t0 > timeout) throw new Error('부팅 대기 시간 초과');
        await page.waitForTimeout(100);
    }
}

(async () => {
    const browser = await chromium.launch({
        executablePath: '/opt/pw-browsers/chromium',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });
    const errs = [];
    let fail = 0;

    for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: vp });
        page.on('pageerror', e => errs.push(`${vp.width}x${vp.height} ${e.message}`));
        page.on('console', m => { if (m.type() === 'error') errs.push(`${vp.width}x${vp.height} ${m.text()}`); });
        await page.goto(INDEX, { waitUntil: 'load' });
        await waitBooted(page);
        await page.waitForTimeout(1200);

        const r = await page.evaluate(() => {
            const btn = document.querySelector('.anvil-btn');
            if (!btn) return { found: false };
            const svg = btn.querySelector('.anvil-svg');
            const app = document.getElementById('app').getBoundingClientRect();
            const br = btn.getBoundingClientRect();
            const sr = svg && svg.getBoundingClientRect();
            return {
                found: true,
                hasSvg: !!svg,
                // 이모지가 남아 있으면 텍스트 노드에 ⚒ 가 그대로 보인다
                emojiLeft: /[⚒🔨]/.test((btn.childNodes[0] && btn.childNodes[0].nodeValue) || ''),
                paths: svg ? svg.querySelectorAll('path').length : 0,
                svgHPct: sr ? +(sr.height / app.height * 100).toFixed(2) : null,
                svgWPct: sr ? +(sr.width / app.width * 100).toFixed(2) : null,
                btnRect: [+br.left.toFixed(1), +br.top.toFixed(1), +br.width.toFixed(1), +br.height.toFixed(1)],
            };
        });

        // 타격 연출을 걸고 오버레이가 모루 위에 정확히 얹히는지 확인
        const fx = await page.evaluate(async () => {
            UI.onCraft();
            await new Promise(r => setTimeout(r, 120));
            const btn = document.querySelector('.anvil-btn');
            const el = document.querySelector('.anvil-fx');
            if (!btn || !el) return { fxFound: false };
            const a = btn.getBoundingClientRect(), f = el.getBoundingClientRect();
            return {
                fxFound: true,
                striking: btn.classList.contains('striking'),
                aligned: Math.abs(a.left - f.left) <= 1 && Math.abs(a.top - f.top) <= 1
                    && Math.abs(a.width - f.width) <= 1 && Math.abs(a.height - f.height) <= 1,
            };
        });

        await page.screenshot({ path: path.join(OUT, `anvil-${vp.width}x${vp.height}.png`) });

        const ratioOk = r.found && r.svgHPct != null && Math.abs(r.svgHPct - REF_H_PCT) <= TOL;
        const ok = r.found && r.hasSvg && !r.emojiLeft && r.paths >= 6 && ratioOk && fx.fxFound && fx.aligned;
        if (!ok) fail++;
        console.log(`\n== ${vp.width}x${vp.height} == ${ok ? 'OK' : 'FAIL'}`);
        console.log(`  모루 SVG: ${r.hasSvg ? `있음(path ${r.paths}개)` : '없음'} / 이모지 잔존: ${r.emojiLeft}`);
        console.log(`  높이 ${r.svgHPct}%H (원본 ${REF_H_PCT}%H, 허용 ±${TOL}%p) → ${ratioOk ? '일치' : '어긋남'} / 폭 ${r.svgWPct}%W`);
        console.log(`  타격 오버레이: ${fx.fxFound ? '생성됨' : '없음'} / 모루와 정렬: ${fx.aligned} / striking 클래스: ${fx.striking}`);
        await page.close();
    }

    console.log(`\n실패 ${fail}건 / 콘솔 에러 ${errs.length}건`);
    errs.slice(0, 8).forEach(e => console.log('  ERR ' + e));
    await browser.close();
    process.exit(fail || errs.length ? 1 : 0);
})();
