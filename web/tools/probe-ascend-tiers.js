// 승천 디자인 티어 골격 판정 — ascend-design-tiers (사용자 지시 2026-08-19)
// "승천을 했을 때마다 각각 디자인의 차이가 있어야 함. 스킬·탈것·펫·장비 모두. … 5승천까지고
//  그 이후는 0승천이었던 걸로 해서 순환."
// 판정: ① tier = stars % 6 순환 (0..5 → 6이면 0)
//       ② 펫: 별 0~5에서 데코 노드 수가 단조 증가, 별 6 = 별 0 (누적 데코 실장착, refreshPets 실경로)
//       ③ 탈것: 같은 규칙 (refreshMount 실경로, mountGroup)
//       ④ 장비: 영웅 무기(refreshHeroEquip)에 별 수만큼 데코 + 썸네일(itemThumb)이 별 티어별로
//          다른 캐시 키/이미지 (키에 티어가 빠지면 별이 달라도 같은 그림 재사용)
//       ⑤ 스킬: ascendSkillColor 가 별 1~5에서 베이스와 다른 색, 별 6 = 별 0 (불→얼음→… 순환 골격)
//       ⑥ 콘솔 에러 0
// 사용: node probe-ascend-tiers.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('boot-loading') && typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 180000 });

    const r = await page.evaluate(() => {
        const out = [];
        const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
        Combat.tick = () => {};

        // ---- ① 순환 ----
        const cyc = [0, 1, 2, 3, 4, 5, 6, 7, 12].map(s => Scene3D.ascendTier(s));
        ok(JSON.stringify(cyc) === JSON.stringify([0, 1, 2, 3, 4, 5, 0, 1, 0]), '① tier = stars % 6 순환 (' + cyc.join(',') + ')');

        const countDecor = root => { let n = 0; root.traverse(o => { if (o.userData && o.userData.ascendDecor) n++; }); return n; };

        // ---- ② 펫 ----
        const petName = petStats.common[0].name;
        const petCounts = [];
        for (const stars of [0, 1, 2, 3, 4, 5, 6]) {
            S.pets = [{ name: petName, rarity: 'common', level: 1, dupes: 0, xp: 0, stars, subs: [] }];
            S.activePets = [0];
            Scene3D.refreshPets();
            petCounts.push(countDecor(Scene3D.petGroups[0]));
        }
        const mono = a => a.slice(0, 6).every((v, i) => i === 0 || a[i] > a[i - 1]);
        ok(petCounts[0] === 0 && mono(petCounts), '② 펫 데코 누적 단조 증가 (' + petCounts.join(',') + ')');
        ok(petCounts[6] === petCounts[0], '② 펫 별 6 = 별 0 디자인 (' + petCounts[6] + ')');

        // ---- ③ 탈것 ----
        const mtName = Object.keys(MOUNT_ICONS)[0];
        const mtCounts = [];
        for (const stars of [0, 2, 5, 6]) {
            S.mounts = [{ name: mtName, rarity: 'common', level: 1, xp: 0, stars, subs: [] }];
            S.activeMounts = [0];
            Scene3D.refreshMount();
            mtCounts.push(countDecor(Scene3D.mountGroup));
        }
        ok(mtCounts[0] === 0 && mtCounts[0] < mtCounts[1] && mtCounts[1] < mtCounts[2] && mtCounts[3] === mtCounts[0],
            '③ 탈것 데코 누적 + 순환 (' + mtCounts.join(',') + ')');
        S.mounts = []; S.activeMounts = []; Scene3D.refreshMount();

        // ---- ④ 장비: 영웅 무기 + 썸네일 ----
        const item = Forge.rollItem();
        item.slot = 'weapon'; item.wtype = item.wtype || 'sword';
        const eqCounts = [];
        for (const stars of [0, 3, 6]) {
            S.equipment.weapon = Object.assign({}, item, { stars });
            Scene3D.refreshHeroEquip();
            eqCounts.push(countDecor(Scene3D.weaponG));
        }
        ok(eqCounts[0] === 0 && eqCounts[1] > 0 && eqCounts[2] === eqCounts[0],
            '④ 영웅 무기 승천 데코 + 순환 (' + eqCounts.join(',') + ')');
        const th0 = Scene3D.itemThumb(Object.assign({}, item, { stars: 0 }));
        const th3 = Scene3D.itemThumb(Object.assign({}, item, { stars: 3 }));
        const th6 = Scene3D.itemThumb(Object.assign({}, item, { stars: 6 }));
        ok(!!th0 && !!th3 && th0 !== th3, '④ 장비 썸네일이 별 티어별로 다른 이미지');
        ok(th6 === th0, '④ 장비 썸네일 별 6 = 별 0 (캐시 키 순환 일치)');
        S.equipment.weapon = null; Scene3D.refreshHeroEquip();

        // ---- ⑤ 스킬 색 변주 ----
        S.skills.powerStrike = { level: 1, dupes: 0, stars: 0 };
        const base = Scene3D.ascendSkillColor(0x66bb6a, { id: 'powerStrike' });
        const cols = [];
        for (const stars of [1, 2, 3, 4, 5]) {
            S.skills.powerStrike.stars = stars;
            cols.push(Scene3D.ascendSkillColor(0x66bb6a, { id: 'powerStrike' }));
        }
        ok(base === 0x66bb6a, '⑤ 별 0 = 베이스 색 무변주');
        ok(cols.every(c => c !== base) && new Set(cols).size === 5, '⑤ 별 1~5 각각 다른 속성 색 (' + cols.map(c => c.toString(16)).join(',') + ')');
        S.skills.powerStrike.stars = 6;
        ok(Scene3D.ascendSkillColor(0x66bb6a, { id: 'powerStrike' }) === base, '⑤ 별 6 = 별 0 색 (순환)');
        S.skills.powerStrike.stars = 0;

        // ---- ⑥ UI 셀 아이콘의 stars 축 (ascend-design-tiers ⑴ — 셀 아이콘이 티어 0으로 굽히던 구멍) ----
        // creatureFace 가 data-stars 를 심고, hydrate 가 그 값을 petThumb/mountThumb 에 넘겨야
        // 인벤 타일에서도 승천 데코가 보인다. 썸네일 캐시 키가 ':a티어' 를 포함하므로 url 비교로 판정.
        const faceHtml = UI.petFace(petName, 'mt-inline', 2);
        ok(faceHtml.includes('data-stars="2"'), '⑥ petFace 가 data-stars 를 심는다');
        const pth0 = Scene3D.petThumb(petName, 0), pth2 = Scene3D.petThumb(petName, 2), pth6 = Scene3D.petThumb(petName, 6);
        ok(!!pth0 && !!pth2 && pth0 !== pth2, '⑥ 펫 썸네일이 별 티어별로 다른 이미지');
        ok(pth6 === pth0, '⑥ 펫 썸네일 별 6 = 별 0 (순환)');
        // hydrate 경로 — 헤드리스는 rAF 가 안 돌므로 즉시 실행으로 바꿔 태운다
        const div = document.createElement('div');
        div.innerHTML = UI.creatureFace('pet', petName, '', 'mt-inline', '🐾', 2);
        document.body.appendChild(div);
        const realRAF = window.requestAnimationFrame;
        window.requestAnimationFrame = fn => { fn(); return 0; };
        try { UI.hydrateMountThumbs(div); } finally { window.requestAnimationFrame = realRAF; }
        const img = div.querySelector('img');
        ok(!!img && img.src === pth2, '⑥ hydrate 가 data-stars 티어 썸네일로 굽는다');
        div.remove();
        // 이름만 아는 호출부(mountFace 기본 경로)도 개체의 stars 를 찾아 쓴다
        S.mounts = [{ name: mtName, rarity: 'common', level: 1, xp: 0, stars: 2, subs: [] }];
        ok(UI.mountFace(mtName, 'x').includes('data-stars="2"'), '⑥ mountFace 가 개체 stars 를 기본값으로 찾는다');
        S.mounts = [];

        return out;
    });

    for (const line of r) console.log(' ', line);
    const fails = r.filter(x => x.startsWith('FAIL'));
    for (const e of errs.slice(0, 5)) console.log('콘솔 에러 —', e);
    console.log(fails.length || errs.length ? `실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건` : 'PASS — 승천 티어 골격(별%6 순환·누적 데코·스킬 속성 변주)이 4개 카테고리에 실장착');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
