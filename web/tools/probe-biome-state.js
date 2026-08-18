// 바이옴 상태 덤프 — 사용: node probe-biome-state.js [출력.json]
// 왜: 맵 25종 확장(main-stage-25-maps)에서 **원본 6종의 룩이 한 톨도 안 바뀌었는지**를 증명해야 하는데,
//     `shot-biomes.js` 픽셀 비교는 못 쓴다 — 같은 코드로 두 번 찍어도 타일 MAD 가 12.6 이나 나온다
//     (swiftshader 래스터화 편차). 대신 **JS 값**을 덤프한다. 이건 시드 고정으로 완전히 결정적이라
//     변경 전/후 JSON 이 한 글자라도 다르면 그게 곧 회귀다.
// 재는 것: 안개 근/원, 태양·반구·림 광량, 노출, 지면/능선/식생 색, 잔돌색, 지면 발광(용암 균열),
//          결정 재질, 오로라, 그리고 **소품·스캐터의 실제 구성**(프롭 종류 히스토그램·인스턴스 수).
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const OUT = process.argv[2] || '';

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX + '?debug=gear', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.heroG && typeof CHAPTER_THEMES !== 'undefined', null, { timeout: 60000 });

    const dump = await page.evaluate(() => {
        Combat.tick = () => {};
        if (typeof Skills !== 'undefined' && Skills.tick) Skills.tick = () => {};
        const hex = c => '#' + c.getHexString();
        const out = {};
        for (let ch = 1; ch <= CHAPTER_THEMES.length; ch++) {
            const t = CHAPTER_THEMES[ch - 1];
            // 시드 고정 — 프롭 배치/추첨이 Math.random 이라 챕터마다 같은 자리에서 시작해야 비교가 성립한다
            let sd = 0x51f3a7d;
            const orig = Math.random;
            Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
            Scene3D._biome = null;              // 강제 재빌드 (같은 바이옴이면 buildProps 를 건너뛰므로)
            Scene3D.setTheme(t);
            Math.random = orig;
            const S3 = Scene3D;
            // 프롭 구성 — 그룹별 자식 메시의 지오메트리 타입 히스토그램(조형이 바뀌면 여기가 움직인다)
            const hist = {};
            let meshes = 0;
            for (const g of S3.trees) g.traverse(m => {
                if (!m.isMesh) return;
                meshes++;
                const k = m.geometry.type + (m.geometry.userData && m.geometry.userData.parts ? ':' + m.geometry.userData.parts : '');
                hist[k] = (hist[k] || 0) + 1;
            });
            out[ch + ':' + (t.biome || 'forest')] = {
                kin: S3.bkin ? S3.bkin(t.biome || 'forest') : (t.biome || 'forest'), // 변경 전 코드에는 bkin 이 없다
                fog: [S3.scene.fog.near, S3.scene.fog.far, hex(S3.scene.fog.color)],
                light: [+S3.sun.intensity.toFixed(4), +S3.hemi.intensity.toFixed(4), +S3.rim.intensity.toFixed(4),
                    +S3.renderer.toneMappingExposure.toFixed(4), hex(S3.sun.color), hex(S3.rim.color), hex(S3.hemi.groundColor)],
                mats: [hex(S3.terrainMat.color), hex(S3.mountainMat.color), hex(S3.hillMat.color), hex(S3.farHillMat.color),
                    hex(S3.foliageMat.color), hex(S3.bushMat.color), hex(S3.stoneMat.color)],
                terrainEm: [hex(S3.terrainMat.emissive), +S3.terrainMat.emissiveIntensity.toFixed(3), !!S3.terrainMat.emissiveMap],
                crystal: [hex(S3.crystalMat.color), hex(S3.crystalMat.emissive), +S3.crystalMat.emissiveIntensity.toFixed(3)],
                foliageEm: [hex(S3.foliageMat.emissive), +S3.foliageMat.emissiveIntensity.toFixed(3)],
                aurora: !!(S3.aurora && S3.aurora.visible),
                counts: [S3.trees.length, S3.rocks.length, meshes,
                    S3.scatter ? S3.scatter.count : 0, S3.scatter2 ? S3.scatter2.count : 0, S3.scatter3 ? S3.scatter3.count : 0],
                scatterCol: [S3.scatter ? hex(S3.scatter.material.color) : '', S3.scatter2 ? hex(S3.scatter2.material.color) : ''],
                accents: S3.accents.map(a => [+a.intensity.toFixed(2), hex(a.color)]),
                propHist: hist,
            };
        }
        return out;
    });
    await browser.close();
    const json = JSON.stringify(dump, null, 1);
    if (OUT) fs.writeFileSync(OUT, json);
    console.log(json);
    console.error(`챕터 ${Object.keys(dump).length} · 콘솔 에러 ${errors.length}`);
    if (errors.length) { errors.slice(0, 8).forEach(e => console.error('  ' + e)); process.exit(1); }
})();
