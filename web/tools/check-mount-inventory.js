// 탈것 인벤 개체화 + 펫·탈것 250 상한 회귀 검사 — `mount-inventory-like-pet-250` (사용자 지시 2026-08-19)
//
// 사용자 원문: "탈것 인벤토리가 펫처럼 되어야 함. (…) [신화]호버보드,[신화]호버보드,… 이렇게 같은 종류도
// 여러 개 있을 수 있게. 그리고 펫도 생쥐 같은 거 여러 개 있을 수 있게. 이유는 같은 생쥐여도 옵션 다 다를 수
// 있고, 그것들 다 합성해서 업글해야 함. 인벤토리 개수 250개가 최대로 해줘야 함 각각."
//
// 검사 항목
//  ① 같은 종류를 여러 개 보유할 수 있다(소환 반복 → 중복 개체가 실제로 늘어난다)
//  ② 개체마다 옵션(subs)이 따로 굴려진다
//  ③ 합성(흡수 업글)이 **개체 단위**로 동작하고, 삭제 후 장착·대상 인덱스가 안 어긋난다
//  ④ 보유 상한 250 — 탈것·펫 각각. 넘겨서 소환되지 않는다
//  ⑤ 구세이브(이름→객체 맵 + dupes) 이관: dupes 만큼 실제 개체로 펼쳐지고 장착이 안 벗겨진다
//  ⑥ 장착(출전) 상한은 그대로 탈것 1마리 — 인벤 상한과 헷갈리지 않았는지
//  ⑦ 3D 경로(Mounts.ridden()=이름)와 UI 렌더가 안 터진다
//
// 사용: PW_PATH=... node check-mount-inventory.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 } });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + e));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const fails = [];
    const check = (name, ok, detail) => {
        console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail !== undefined ? '  — ' + detail : ''}`);
        if (!ok) fails.push(name + (detail !== undefined ? ' (' + detail + ')' : ''));
    };

    // ── ①② 같은 종류 다중 보유 + 개체별 옵션 ──
    const dup = await page.evaluate(() => {
        Mounts.ensure();
        S.mounts = []; S.activeMounts = []; S.winders = 1e9; S.mountOpens = 0;
        for (let i = 0; i < 60; i++) Mounts.summon(1);
        const byName = {};
        S.mounts.forEach(m => { byName[m.name] = (byName[m.name] || 0) + 1; });
        const dupName = Object.keys(byName).find(n => byName[n] >= 2);
        const sameName = dupName ? S.mounts.filter(m => m.name === dupName) : [];
        const subsSets = new Set(sameName.map(m => JSON.stringify(m.subs)));
        return {
            total: S.mounts.length,
            isArray: Array.isArray(S.mounts),
            maxOfOneName: Math.max(...Object.values(byName)),
            dupName, sameCount: sameName.length,
            distinctSubs: subsSets.size,
            allHaveSubs: S.mounts.every(m => Array.isArray(m.subs) && m.subs.length > 0),
        };
    });
    check('S.mounts 가 개체 배열이다', dup.isArray === true);
    check('같은 종류를 여러 개 보유한다', dup.maxOfOneName >= 2, `한 종류 최대 ${dup.maxOfOneName}개 (총 ${dup.total}개)`);
    check('개체마다 옵션(subs)이 있다', dup.allHaveSubs === true);
    check('같은 종류라도 옵션이 개체별로 다르다', dup.distinctSubs >= 2,
        `${dup.dupName} ${dup.sameCount}개 중 서로 다른 옵션 ${dup.distinctSubs}종`);

    // ── ⑥ 장착은 1마리 (인벤 상한과 다른 개념) ──
    const eq = await page.evaluate(() => {
        Mounts.equip(0); Mounts.equip(1); Mounts.equip(2);
        return { active: S.activeMounts.slice(), riddenName: Mounts.ridden(), riddenIsName: typeof Mounts.ridden() === 'string' };
    });
    check('장착은 1마리로 유지된다', eq.active.length === 1, JSON.stringify(eq.active));
    check('Mounts.ridden() 은 3D 호환으로 **이름**을 돌려준다', eq.riddenIsName === true, eq.riddenName);

    // ── ③ 합성(흡수)이 개체 단위 + 인덱스 보정 ──
    const merge = await page.evaluate(() => {
        S.activeMounts = [5];                       // 재료보다 뒤에 있는 개체를 장착해 둔다
        const riddenBefore = S.mounts[5].name;
        const before = S.mounts.length;
        const targetName = S.mounts[7].name;
        const lvBefore = S.mounts[7].level;
        // 재료는 대상보다 앞·뒤를 섞어 고른다 — 앞에서 지우면 인덱스가 당겨지는 함정을 밟는지 본다
        const ok = Mounts.absorbMaterials(7, [1, 3, 9]);
        const targetIdxNow = 7 - 2;                 // 앞쪽 재료 2개(1,3)만큼 당겨진다
        return {
            ok, before, after: S.mounts.length,
            targetStillThere: !!S.mounts[targetIdxNow] && S.mounts[targetIdxNow].name === targetName,
            leveled: !!S.mounts[targetIdxNow] && S.mounts[targetIdxNow].level > lvBefore,
            riddenStillSame: Mounts.ridden() === riddenBefore,
            activeValid: S.activeMounts.every(i => !!S.mounts[i]),
        };
    });
    check('흡수로 재료 개체가 사라진다', merge.ok === true && merge.after === merge.before - 3, `${merge.before} → ${merge.after}`);
    check('대상 개체가 인덱스 이동 후에도 그대로다', merge.targetStillThere === true);
    check('대상 레벨이 오른다', merge.leveled === true);
    check('장착 인덱스가 안 어긋난다(타던 탈것 유지)', merge.riddenStillSame === true && merge.activeValid === true);

    // ── ④ 보유 상한 250 ──
    const cap = await page.evaluate(() => {
        S.mounts = []; S.activeMounts = []; S.winders = 1e9;
        for (let i = 0; i < 400; i++) if (!Mounts.summon(5)) break;
        const mountCount = S.mounts.length;
        const overflow = Mounts.summon(5);          // 꽉 찬 상태에서 한 번 더
        S.pets = []; S.activePets = [];
        for (let i = 0; i < Pets.INV_CAP + 10; i++) S.pets.push({ name: 'x', rarity: 'common', level: 1, dupes: 0, xp: 0, stars: 0, subs: [] });
        return { mountCap: Mounts.INV_CAP, petCap: Pets.INV_CAP, mountCount, overflow, space: Mounts.space() };
    });
    check('탈것 보유 상한이 250이다', cap.mountCap === 250);
    check('펫 보유 상한이 250이다', cap.petCap === 250);
    check('상한을 넘겨 소환되지 않는다', cap.mountCount === 250 && cap.overflow === null, `보유 ${cap.mountCount} · 초과 소환 ${cap.overflow}`);

    // ── ⑤ 구세이브 이관 (맵 + dupes + 이름 장착) ──
    const mig = await page.evaluate(() => {
        S.mounts = { 'Brown Horse': { rarity: 'rare', level: 4, dupes: 2, stars: 1, xp: 7, subs: [{ key: 'atkPct', val: 3 }] } };
        S.activeMounts = ['Brown Horse'];
        Mounts.migrateInventory();
        Mounts.ensure();
        return {
            isArray: Array.isArray(S.mounts),
            count: S.mounts.length,
            firstKeepsLevel: S.mounts[0] && S.mounts[0].level === 4 && S.mounts[0].xp === 7,
            spreadAreFresh: S.mounts.slice(1).every(m => m.level === 1 && Array.isArray(m.subs)),
            active: S.activeMounts.slice(),
            riddenName: Mounts.ridden(),
        };
    });
    check('구세이브 맵이 배열로 이관된다', mig.isArray === true);
    check('dupes 만큼 실제 개체로 펼쳐진다', mig.count === 3, `${mig.count}개 (원본 1 + dupes 2)`);
    check('원본 개체의 레벨·경험치가 보존된다', mig.firstKeepsLevel === true);
    check('펼친 개체는 새 개체로 굴려진다', mig.spreadAreFresh === true);
    check('이름 장착이 인덱스로 옮겨져 안 벗겨진다', JSON.stringify(mig.active) === '[0]' && mig.riddenName === 'Brown Horse',
        `${JSON.stringify(mig.active)} / ${mig.riddenName}`);

    // ── ⑦ 실제 화면 렌더 (탈것 시트·상세·업그레이드·펫 시트) ──
    await page.evaluate(() => {
        S.mounts = []; S.activeMounts = []; S.winders = 1e9;
        for (let i = 0; i < 12; i++) Mounts.summon(1);
        Mounts.equip(0);
        UI.openMounts();
    });
    await page.waitForTimeout(700);
    const sheet = await page.evaluate(() => ({
        tiles: document.querySelectorAll('#mount-modal .pet-tile').length,
        title: (document.querySelector('#mount-modal .sheet-title') || {}).textContent,
    }));
    check('탈것 시트가 개체 수만큼 타일을 그린다', sheet.tiles === 12, `${sheet.tiles}칸`);
    check('시트 제목에 보유/상한이 보인다', /\/\s*250/.test(sheet.title || ''), sheet.title);
    await page.screenshot({ path: path.resolve(__dirname, 'mount-inventory.png') });

    await page.evaluate(() => { UI.openMountDetail(3); });
    await page.waitForTimeout(400);
    const det = await page.evaluate(() => ({ open: !!document.querySelector('#detail-modal .petd-card'), txt: document.querySelector('#detail-modal .petd-subs') ? document.querySelector('#detail-modal .petd-subs').textContent : '' }));
    check('탈것 상세가 인덱스로 열린다', det.open === true, det.txt.replace(/\s+/g, ' ').slice(0, 40));

    await page.evaluate(() => { UI.closeDetail(); UI.openMountUpgrade(3); });
    await page.waitForTimeout(400);
    const upg = await page.evaluate(() => ({ chips: document.querySelectorAll('#mount-upgrade-modal .mat-chip').length }));
    check('업그레이드 재료 칩이 다른 개체 전부를 낸다', upg.chips === 11, `${upg.chips}개`);

    await page.evaluate(() => { UI.closeMountUpgrade(); UI.closeMounts(); UI.switchTab('summon'); UI.switchSummonSub('pets'); });
    await page.waitForTimeout(500);
    const petTitle = await page.evaluate(() => (document.querySelector('#panel-pets .sheet-title') || {}).textContent);
    check('펫 시트 제목에도 보유/상한이 보인다', /\/\s*250/.test(petTitle || ''), petTitle);

    if (errors.length) { console.log('콘솔 에러:'); errors.slice(0, 8).forEach(e => console.log('   ' + e)); }
    console.log(fails.length ? `\nFAIL ${fails.length}건 — ` + fails.join(' / ') : '\nPASS — 개체화·옵션 차등·합성·250 상한·구세이브 이관 전부 통과');
    await browser.close();
    process.exit(fails.length || errors.length ? 1 : 0);
})();
