// 프롭 드로우콜·프레임타임 계측 — 사용: node probe-props-perf.js [바이옴...]
// 맵 소품을 갈아엎을 때(`map-props-minecraft`) **성능이 무너지지 않았는지**를 숫자로 남기려고 만들었다.
// 프롭은 바이옴마다 수십 그룹이 흩어지므로, 조형을 바꾸면서 메시를 하나 더 쪼개면 곧바로
// 드로우콜 수십 개가 는다 — 눈으로는 절대 안 보이고 프레임에서만 드러난다.
//
// 재는 것: 바이옴별 `renderer.info.render.calls / triangles`(1프레임) + 60프레임 평균 프레임타임.
//   ⚠️ 드로우콜은 **포스트 스택(블룸 4패스)까지 포함**한 값이다 — 전/후 비교용 상대치로만 쓸 것.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

const THEMES = {
    forest: { biome: 'forest', sky: 0x87ceeb, fog: 0xa8d8ea, ground: 0x7cb342 },
    desert: { biome: 'desert', sky: 0x7cc0e0, fog: 0xffe0b2, ground: 0xbca77b },
    rock: { biome: 'rock', sky: 0x7f9cbd, fog: 0xaebfd4, ground: 0x8a7c68 },
    snow: { biome: 'snow', sky: 0x1a237e, fog: 0x283593, ground: 0xaac2e2, celestial: 'moon' },
    magic: { biome: 'magic', sky: 0x2e1a72, fog: 0x3a2384, ground: 0x352061, celestial: 'moon' },
    lava: { biome: 'lava', sky: 0xbf360c, fog: 0xd84315, ground: 0x231a17 },
    marsh: { biome: 'marsh', sky: 0x6f8f6a, fog: 0x8aa07a, ground: 0x5d7a3a },
    bamboo: { biome: 'bamboo', sky: 0x9ed7e8, fog: 0xbfe3d0, ground: 0x7cae4a },
    canyon: { biome: 'canyon', sky: 0xe0a878, fog: 0xe8c39a, ground: 0xb06a45 },
    glacier: { biome: 'glacier', sky: 0x123a6b, fog: 0x2a5a8a, ground: 0x9fc9de, celestial: 'moon' },
    amethyst: { biome: 'amethyst', sky: 0x2a1250, fog: 0x3d1f6b, ground: 0x4a3070, celestial: 'moon' },
    doomland: { biome: 'doomland', sky: 0x3a0d0d, fog: 0x5c1a14, ground: 0x2a1512 },
};

(async () => {
    const names = process.argv.slice(2).length ? process.argv.slice(2) : ['forest', 'desert', 'rock', 'snow', 'magic', 'lava'];
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // 프롭 배치가 전부 Math.random 이라 시드를 고정해야 전/후 비교가 성립한다(shot-biomes 와 같은 규약).
    await page.addInitScript(() => {
        let s = 0x51f3a7d;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    });
    await page.goto(INDEX + '?debug=gear&w=sword&wage=medieval&rar=rare', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof Combat !== 'undefined', null, { timeout: 60000 });
    await page.waitForTimeout(2000);

    const rows = [];
    for (const n of names) {
        const t = THEMES[n];
        if (!t) { console.log('알 수 없는 바이옴: ' + n); continue; }
        const r = await page.evaluate(async (t) => {
            Combat.tick = () => {};
            if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
            Scene3D.setTheme(t);
            Scene3D.walking = false; Scene3D.worldX = 0;
            await new Promise(res => setTimeout(res, 300));
            // 🚨 `info.autoReset` 을 꺼야 한다 — 켜져 있으면 `render()` 마다 카운터가 초기화돼
            //    포스트 스택의 **마지막 풀스크린 쿼드 1콜**만 남는다(첫 판이 전 바이옴 calls=1 을 찍었다).
            Scene3D.renderer.info.autoReset = false;
            Scene3D.renderer.info.reset();
            Scene3D.renderFrame();
            const calls = Scene3D.renderer.info.render.calls;
            const tris = Scene3D.renderer.info.render.triangles;
            // 프롭 그룹/메시 수 — 드로우콜이 어디서 오는지 귀속하려고 같이 센다
            let groups = 0, meshes = 0;
            for (const o of [...Scene3D.trees, ...Scene3D.rocks]) { groups++; o.traverse(m => { if (m.isMesh) meshes++; }); }
            const t0 = performance.now();
            for (let i = 0; i < 60; i++) Scene3D.renderFrame();
            const ft = (performance.now() - t0) / 60;
            return { calls, tris, groups, meshes, ft };
        }, t);
        rows.push({ biome: n, ...r });
        console.log(`${n.padEnd(9)} calls=${String(r.calls).padStart(4)} tris=${String(r.tris).padStart(7)} ` +
            `propGroups=${String(r.groups).padStart(3)} propMeshes=${String(r.meshes).padStart(4)} frame=${r.ft.toFixed(2)}ms`);
    }
    const avg = (k) => (rows.reduce((a, b) => a + b[k], 0) / rows.length).toFixed(1);
    console.log(`평균 calls=${avg('calls')} tris=${avg('tris')} propMeshes=${avg('meshes')} frame=${avg('ft')}ms · 콘솔 에러 ${errors.length}`);
    if (errors.length) console.log(errors.slice(0, 5).join('\n'));
    await browser.close();
})();
