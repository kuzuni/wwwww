// 시대별 무기 세트 독립 검증 — 실제 게임에서 시대를 강제해 Forge.rollItem을 굴려
// ① 그 시대 세트 밖 무기가 나오는지 ② 원시·중세에 화약/에너지가 섞이는지 ③ 표시 이름
// ④ 무기 전종 3D 썸네일·실장착(리그 조립) ⑤ 구세이브 폴백 ⑥ 콘솔 에러
// 사용: node probe-age-weapons.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 480, height: 854 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof Forge !== 'undefined' && typeof Scene3D !== 'undefined' && Scene3D.heroG, null, { timeout: 20000 });

    const res = await page.evaluate(() => {
        const out = { ages: {}, thumbFail: [], equipFail: [], display: [] };
        const ENERGY = ['energy'], POWDER = ['blackpowder', 'gunmetal'];
        for (const age of AGES) {
            const set = weaponsOfAge(age), ids = new Set(set);
            const seen = {}, stray = [], anachronism = [];
            // 시대 확률표만 가로채 그 시대로 고정 + 무기 슬롯만 나오게 (등급 추첨은 원래대로)
            const realPick = U.weightedPick, realChoice = U.choice;
            U.weightedPick = (t) => (t && t.primitive !== undefined) ? age : realPick(t);
            U.choice = (a) => (a === SLOTS ? 'weapon' : realChoice(a));
            for (let i = 0; i < 600; i++) {
                const it = Forge.rollItem();
                if (it.slot !== 'weapon' || it.age !== age) continue;
                if (!ids.has(it.wtype)) stray.push(it.wtype);
                seen[it.wtype] = it.name;
                // 원시·중세에 화약·에너지 무기가 섞이면 이 항목의 수용 조건 위반
                if (age === 'primitive' || age === 'medieval') {
                    const m = (WEAPON_TYPES[it.wtype] || {}).mat;
                    if (ENERGY.includes(m) || POWDER.includes(m)) anachronism.push(it.wtype + '(' + m + ')');
                }
            }
            U.weightedPick = realPick; U.choice = realChoice;
            out.ages[age] = {
                kr: AGE_KR[age], seen: Object.keys(seen).length, total: set.length,
                stray: [...new Set(stray)].slice(0, 3), anachronism: [...new Set(anachronism)].slice(0, 3),
                names: set.map(w => WEAPON_TYPES[w].kr),
                sample: Object.values(seen)[0] || '',
            };
            // 썸네일 + 실제 장착(3D 리그 조립)까지 전 무기 검사
            for (let i = 0; i < set.length; i++) {
                const w = set[i];
                const item = { name: WEAPON_TYPES[w].kr, slot: 'weapon', age, ageIdx: AGES.indexOf(age), rarity: 'legendary', level: 10, main: 'atk', value: 1, subs: [], wtype: w, nameIdx: i };
                const t = Scene3D.itemThumb(item);
                if (!t || t.length < 500) out.thumbFail.push(age + '/' + w);
                try { S.equipment.weapon = item; Scene3D.refreshHeroEquip(); }
                catch (e) { out.equipFail.push(age + '/' + w + ': ' + e.message); }
            }
        }
        // 표시 이름 — UI가 '[시대] 이름'으로 감싸므로(ui.js itemCardHTML) 이름 자체에 시대가 또 붙으면 중복 표기가 된다.
        // 실제로 굴려 나온 이름을 그대로 읽는다(직접 조립하면 rollItem이 바뀌어도 안 잡힌다).
        for (const age of ['primitive', 'medieval', 'divine']) {
            const nm = out.ages[age].sample;
            out.display.push({ shown: `[${AGE_KR[age]}] ${nm}`, dup: nm.startsWith(AGE_KR[age] + ' ') });
        }
        // 구세이브 호환: 시대 분리 이전 조합(원시 + 검/총)도 렌더돼야 한다
        for (const [age, wt] of [['primitive', 'sword'], ['medieval', 'gun'], ['divine', 'staff']]) {
            try { S.equipment.weapon = { name: '구세이브', slot: 'weapon', age, ageIdx: AGES.indexOf(age), rarity: 'rare', level: 1, main: 'atk', value: 1, subs: [], wtype: wt, nameIdx: -1 }; Scene3D.refreshHeroEquip(); }
            catch (e) { out.equipFail.push('구세이브 ' + age + '/' + wt + ': ' + e.message); }
        }
        return out;
    });

    let bad = 0;
    for (const r of Object.values(res.ages)) {
        const ok = r.seen === r.total && !r.stray.length && !r.anachronism.length;
        if (!ok) bad++;
        console.log(`${ok ? '✓' : '✗'} ${r.kr.padEnd(5)} ${r.seen}/${r.total}종  ${r.names.join(' · ')}`
            + (r.stray.length ? `  ⚠세트이탈 ${r.stray}` : '') + (r.anachronism.length ? `  ⚠시대착오 ${r.anachronism}` : ''));
    }
    for (const d of res.display) console.log(`${d.dup ? '✗ 이름 중복' : '✓ 표시'}: ${d.shown}`);
    if (res.display.some(d => d.dup)) bad++;
    if (res.thumbFail.length) { console.log('✗ 썸네일 실패: ' + res.thumbFail.join(', ')); bad++; }
    else console.log('✓ 무기 전종 3D 썸네일 생성');
    if (res.equipFail.length) { console.log('✗ 장착 실패: ' + res.equipFail.join(' | ')); bad++; }
    else console.log('✓ 무기 전종 + 구세이브 조합 장착(3D 조립) 성공');
    console.log(errors.length ? '✗ 콘솔 에러 ' + errors.length + '건: ' + errors.slice(0, 5).join(' | ') : '✓ 콘솔 에러 0건');
    await browser.close();
    process.exit(bad || errors.length ? 1 : 0);
})();
