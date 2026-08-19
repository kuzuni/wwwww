// 부팅 CPU 샘플링 프로파일 — probe-startup-lag 이 못 잡는 '미계측 구간'의 범인을 함수 단위로 지목
// CDP Profiler 로 goto→부팅 완료+3초 를 샘플링해 self time 상위 함수를 URL:line 과 함께 출력.
// 사용: node probe-startup-cpuprofile.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); // 0.5ms
    await cdp.send('Profiler.start');
    await page.goto(INDEX, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.renderer, null, { timeout: 120000 });
    await page.waitForTimeout(4000);
    const { profile } = await cdp.send('Profiler.stop');

    // self time 집계: node.hitCount × interval
    const nodes = new Map(profile.nodes.map(n => [n.id, n]));
    const total = profile.nodes.reduce((s, n) => s + (n.hitCount || 0), 0);
    const label = n => {
        const f = n.callFrame;
        const url = (f.url || '').split('/').pop() || '(native)';
        return `${f.functionName || '(anon)'} @ ${url}:${f.lineNumber + 1}`;
    };
    const by = new Map();
    for (const n of profile.nodes) {
        if (!n.hitCount) continue;
        const k = label(n);
        by.set(k, (by.get(k) || 0) + n.hitCount);
    }
    const wall = (profile.endTime - profile.startTime) / 1000;
    console.log(`샘플 ${total}개 · 구간 ${(wall / 1000).toFixed(1)}s · 1샘플≈${(wall / total).toFixed(2)}ms`);
    const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    for (const [k, hits] of top) {
        const ms = hits * wall / total;
        console.log(`${(ms).toFixed(0).padStart(6)}ms  ${(hits / total * 100).toFixed(1).padStart(5)}%  ${k}`);
    }
    await browser.close();
})();
