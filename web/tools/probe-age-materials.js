// 시대별 재질 정체성 실측 — 사용: node probe-age-materials.js
// 예전엔 투구·갑옷·장신구가 전 시대 똑같이 '스틸 32% 혼합 + metalness .85' 하나였다(시대색만 다름).
// 판정: ① 시대 재질 계열이 5구획으로 갈리는가 ② 계열마다 PBR 서명(금속도/러프니스/맵/플랫셰이딩)이
//       실제로 다른가 ③ 계열별 시대 디테일(리벳/발광라인/가죽끈+뼈/황동스터드/벤트)이 실제로 붙는가
//       ④ 같은 스타일을 시대만 바꿔 찍은 썸네일이 서로 다른 픽셀인가 ⑤ 콘솔 에러 0.
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Scene3D !== 'undefined' && Scene3D.ageGearMats && Scene3D.itemThumb, null, { timeout: 20000 });

    const data = await page.evaluate(() => {
        const out = [];
        for (const age of AGES) {
            const kind = Scene3D.ageGearKind(age);
            const mats = Scene3D.ageGearMats(age);
            const b = mats.body;
            // 시대 디테일 개수 — 트림 재질을 쓰는 메시가 몇 개 붙었는지 센다
            const count = g => { let n = 0; g.traverse(o => { if (o.isMesh && o.userData.ageTrim) n++; }); return n; };
            const helm = Scene3D.makeHelmet(age, 'visor');
            const armor = Scene3D.makeArmorPreview(age, 'plate');
            const acc = Scene3D.makeAccessoryPreview('belt', 0, age);
            let meshes = 0; armor.traverse(o => { if (o.isMesh) meshes++; });
            out.push({
                age, kind,
                metalness: +b.metalness.toFixed(3), roughness: +b.roughness.toFixed(3),
                hasMap: !!b.map, flat: !!b.flatShading,
                trimUnlit: mats.trim && mats.trim.type === 'MeshBasicMaterial',
                helmTrim: count(helm), armorTrim: count(armor), accMeshes: (() => { let n = 0; acc.traverse(o => { if (o.isMesh) n++; }); return n; })(),
                armorMeshes: meshes,
                thumb: Scene3D.itemThumb({ slot: 'armor', age, ageIdx: AGES.indexOf(age), rarity: 'rare', nameIdx: 0 }),
            });
        }
        return out;
    });

    const sig = r => [r.metalness, r.roughness, r.hasMap, r.flat].join('/');
    const kinds = [...new Set(data.map(r => r.kind))];
    const sigs = [...new Set(data.map(r => r.kind + '=' + sig(r)))];
    const kindSigs = [...new Set(data.map(r => sig(r)))];
    const noTrim = data.filter(r => r.helmTrim < 1 || r.armorTrim < 1);
    const thumbs = data.map(r => r.thumb);
    const dupThumb = thumbs.length !== new Set(thumbs).size;
    const nullThumb = thumbs.filter(t => !t).length;

    for (const r of data) {
        console.log(`${String(r.age).padEnd(13)} ${r.kind.padEnd(8)} metal ${String(r.metalness).padEnd(5)} rough ${String(r.roughness).padEnd(5)} map ${r.hasMap ? 'Y' : 'n'} flat ${r.flat ? 'Y' : 'n'} 트림(투구/갑옷) ${r.helmTrim}/${r.armorTrim}`);
    }
    const pass = [
        ['① 재질 계열 5구획', kinds.length === 5, kinds.join(',')],
        ['② 계열별 PBR 서명 고유', kindSigs.length === 5 && sigs.length === 5, `서명 ${kindSigs.length}종`],
        ['③ 전 시대 디테일 부착', noTrim.length === 0, noTrim.map(r => r.age).join(',') || '누락 없음'],
        ['④ 시대별 썸네일 상이', !dupThumb && nullThumb === 0, `중복 ${dupThumb ? 'Y' : 'n'} / null ${nullThumb}`],
        ['⑤ 콘솔 에러 0', errors.length === 0, errors.slice(0, 3).join(' | ') || '없음'],
    ];
    console.log('');
    for (const [name, ok, note] of pass) console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${note}`);
    await browser.close();
    process.exit(pass.every(p => p[1]) ? 0 : 1);
})();
