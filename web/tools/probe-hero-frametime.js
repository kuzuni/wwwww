// 영웅이 화면에 있는 상태의 **rAF 프레임 시간** 실측기 (voxel 전환 2026-08-20 신설).
//
// 왜: voxel 전환은 삼각형을 크게 늘린다(영웅 리그 21.8k → 50.8k). 그게 '느려졌다'인지
// '숫자만 커졌다'인지는 세 수를 봐야 정해지는데, 이 저장소엔 프레임 시간을 재는 자가
// 없었다 — 캡처가 느려지면 전부 '부하'(함정 ⑤)로 처리돼 왔다.
//
// ⚠️ **세션 간 비교를 하지 말 것.** swiftshader 헤드리스는 다른 브라우저가 하나만 더 붙어도
//    rAF 가 몇 배로 느려진다(함정 ⑤ 실측). 그래서 이 자는 **한 번의 실행 안에서** 재고,
//    A/B 를 하려면 두 판을 각각 여러 번 돌려 **중앙값**을 볼 것(평균은 스파이크에 끌려간다).
// 사용: node probe-hero-frametime.js [프레임수=180]
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');
const N = Number(process.argv[2] || 180);

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare&hage=medieval&aage=medieval', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroRig, null, { timeout: 60000 });

    const out = await page.evaluate((N) => new Promise(res => {
        const dt = [];
        let last = performance.now(), warm = 30;      // 워밍업 — 셰이더 컴파일·첫 업로드를 뺀다
        const step = () => {
            const now = performance.now();
            if (warm > 0) warm--; else dt.push(now - last);
            last = now;
            if (dt.length < N) requestAnimationFrame(step); else res(dt);
        };
        requestAnimationFrame(step);
    }), N);

    out.sort((a, b) => a - b);
    const q = p => out[Math.min(out.length - 1, Math.floor(out.length * p))];
    console.log(`프레임 ${out.length}개 · 중앙 ${q(0.5).toFixed(1)}ms · p90 ${q(0.9).toFixed(1)}ms · 최대 ${out[out.length - 1].toFixed(1)}ms`);
    console.log('콘솔 에러 ' + errs.length);
    await browser.close();
})();
