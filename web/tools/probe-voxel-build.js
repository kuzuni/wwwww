// `Voxel.build` 가 실제 페이지에서 THREE 지오메트리를 제대로 뱉는가 — 화면 쪽 검증.
//   순수 계산부(면 제거·AO·색 해시)는 `test-voxel.js` 가 node 로 잠갔다. 여기서는 그 결과가
//   **BufferGeometry 로 옳게 옮겨졌는지**만 본다(정점 수·속성 존재·AO 가 정점 색에 실제로
//   반영됐는지·경계 상자 크기).
// 사용: node probe-voxel-build.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof THREE !== 'undefined' && typeof Voxel !== 'undefined', null, { timeout: 60000 });

    const r = await page.evaluate(() => {
        const out = {};
        // 2×2×2, 복셀 한 변 0.1 → 겉면 24면 × 정점 6개 = 144 정점, 월드 한 변 0.2
        const m = Voxel.build(Voxel.box(2, 2, 2, 0x88cc44), { size: 0.1 });
        const g = m.geometry;
        out.verts = g.getAttribute('position').count;
        out.hasNormal = !!g.getAttribute('normal');
        out.hasColor = !!g.getAttribute('color');
        out.vertexColors = m.material.vertexColors === true;
        const bb = new THREE.Box3().setFromObject(m);
        const sz = bb.getSize(new THREE.Vector3());
        out.size = [+sz.x.toFixed(4), +sz.y.toFixed(4), +sz.z.toFixed(4)];
        const c = bb.getCenter(new THREE.Vector3());
        out.center = [+c.x.toFixed(4), +c.y.toFixed(4), +c.z.toFixed(4)];

        // AO 가 정점 색에 실제로 반영됐는가 — 오목한 구석을 만든 덩어리는 색의 최솟값이
        // 최댓값보다 뚜렷하게 어두워야 한다. (평평한 외톨이는 그 차이가 색 변화 폭뿐이다.)
        const cup = Voxel.build([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }], { size: 0.1, color: 0xffffff, jitter: 0 });
        const col = cup.geometry.getAttribute('color');
        let mn = 1, mx = 0;
        for (let i = 0; i < col.count; i++) { const v = col.getX(i); if (v < mn) mn = v; if (v > mx) mx = v; }
        out.aoMin = +mn.toFixed(4); out.aoMax = +mx.toFixed(4);

        // 음성 대조 — ao:0 으로 끄면 색이 평평해져야 한다(자가 AO 를 정말 보고 있다는 증거).
        const flat = Voxel.build([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 0, y: 1, z: 1 }], { size: 0.1, color: 0xffffff, jitter: 0, ao: 0 });
        const fc = flat.geometry.getAttribute('color');
        let fmn = 1, fmx = 0;
        for (let i = 0; i < fc.count; i++) { const v = fc.getX(i); if (v < fmn) fmn = v; if (v > fmx) fmx = v; }
        out.flatMin = +fmn.toFixed(4); out.flatMax = +fmx.toFixed(4);
        return out;
    });

    const bad = [];
    if (r.verts !== 144) bad.push(`2×2×2 정점이 ${r.verts}개(기대 144 = 24면×6)`);
    if (!r.hasNormal) bad.push('normal 속성이 없다');
    if (!r.hasColor) bad.push('color 속성이 없다');
    if (!r.vertexColors) bad.push('재질의 vertexColors 가 꺼져 있다');
    if (Math.abs(r.size[0] - 0.2) > 1e-3 || Math.abs(r.size[1] - 0.2) > 1e-3) bad.push(`월드 크기가 ${r.size}(기대 0.2 정육면체)`);
    if (Math.max(...r.center.map(Math.abs)) > 1e-3) bad.push(`center:true 인데 중심이 ${r.center}`);
    if (!(r.aoMin < r.aoMax - 0.1)) bad.push(`AO 가 정점 색에 안 실렸다(최소 ${r.aoMin} · 최대 ${r.aoMax})`);
    if (!(r.flatMax - r.flatMin < 1e-6)) bad.push(`ao:0 인데 색이 평평하지 않다(${r.flatMin}~${r.flatMax}) — 음성 대조 실패`);
    if (errors.length) bad.push(`콘솔 오류 ${errors.length}건: ${errors.slice(0, 2).join(' | ')}`);

    console.log(`정점 ${r.verts} · 크기 ${r.size.join('×')} · 중심 ${r.center.join(',')}`);
    console.log(`AO 실린 정점색 ${r.aoMin} ~ ${r.aoMax} · ao:0 음성 대조 ${r.flatMin} ~ ${r.flatMax}`);
    if (bad.length) { console.log('❌ FAIL\n   - ' + bad.join('\n   - ')); await browser.close(); process.exit(1); }
    console.log('✅ PASS — Voxel.build 가 면 제거·AO·중심정렬을 지오메트리로 옳게 옮긴다');
    await browser.close();
    process.exit(0);
})();
