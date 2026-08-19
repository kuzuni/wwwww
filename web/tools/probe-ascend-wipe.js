// 승천 시 라인 인벤 소멸 판정 — ascend-wipe-line-items (사용자 지시 2026-08-19)
// "펫·스킬·장비·탈것 전부 승천했으면 기존에 있었던 거 각각 다 사라져야 함."
// 판정: ① forge 승천 → 착용 장비 8슬롯 전부 null (+ 다른 라인 무손실)
//       ② skill 승천 → S.skills {} · S.equippedSkills [] — UI.onAscendLine 경로로 태워
//          빈 스킬 인벤에서 renderSkills/스킬바가 에러 없이 그려지는 것까지 확인
//       ③ pet 승천 → S.pets [] · S.activePets [] — 단 알(S.eggs)·부화 중(S.hatching)은 유지
//          (별은 부화 시점에 찍히므로 남은 알은 승천 후 ⭐N 으로 부화 — 정합)
//       ④ mount 승천 → S.mounts [] · S.activeMounts [] (유령 인덱스 방지)
//       ⑤ 각 승천은 자기 라인만 지운다 — 순서를 두고 갈수록 다른 라인 잔여를 교차 확인
//       ⑥ 승천 확인 팝업에 소멸 경고 문구('전부 사라집니다')가 있다
//       ⑦ 승천 후 부화한 펫의 별 = 새 Ascension.count('pet') (알 유지 결정의 근거 실측)
//       ⑧ 콘솔 에러 0
// 사용: node probe-ascend-wipe.js
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const INDEX = 'file://' + require('path').resolve(__dirname, '../index.html');

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('boot-loading') && typeof Ascension !== 'undefined' && typeof UI !== 'undefined', null, { timeout: 180000 });

    const r = await page.evaluate(() => {
        const out = [];
        const ok = (c, m) => out.push((c ? 'PASS ' : 'FAIL ') + m);
        Combat.tick = () => {};

        // ---- 시드: 네 라인 전부 승천 조건 충족 + 인벤을 채워 둔다 ----
        S.forgeLevel = Ascension.FORGE_LEVEL;
        S.summonCount = 1e9; S.petSummonCount = 1e9; S.mountOpens = 1e9;
        for (const slot of SLOTS) S.equipment[slot] = { slot, era: 'primitive', rarity: 'common', level: 3, stars: 0 };
        S.skills = { powerStrike: { level: 2, dupes: 1, stars: 0 }, warCry: { level: 1, dupes: 0, stars: 0 } };
        S.equippedSkills = ['powerStrike', 'warCry'];
        S.pets = [{ name: '아기 슬라임', rarity: 'common', level: 2, dupes: 0, xp: 0, stars: 0, subs: [] },
                  { name: '아기 골렘', rarity: 'rare', level: 1, dupes: 0, xp: 0, stars: 0, subs: [] }];
        S.activePets = [0];
        S.eggs = [{ rarity: 'epic' }];
        S.hatching = [];
        S.mounts = [{ name: '조랑말', rarity: 'common', level: 1, xp: 0, stars: 0, subs: [] },
                    { name: '당나귀', rarity: 'rare', level: 1, xp: 0, stars: 0, subs: [] }];
        S.activeMounts = [1];
        S.lineAscend = { forge: 0, skill: 0, pet: 0, mount: 0 };

        // ---- ⑥ 확인 팝업 경고 문구 ----
        UI.openAscension('pet');
        const modal = document.getElementById('ascend-modal');
        ok(modal.innerHTML.includes('전부 사라집니다'), '⑥ 승천 확인 팝업에 소멸 경고 문구');
        UI.closeAscension();

        // ---- ① forge ----
        ok(Ascension.ascend('forge') === true, '① forge 승천 성공');
        ok(SLOTS.every(s => S.equipment[s] === null), '① 착용 장비 8슬롯 전부 소멸');
        ok(S.forgeLevel === 1, '① 대장간 레벨 1로 초기화');
        ok(S.lineAscend.forge === 1, '① lineAscend.forge = 1');
        ok(Object.keys(S.skills).length === 2 && S.pets.length === 2 && S.mounts.length === 2,
            '⑤ forge 승천이 다른 라인(스킬2·펫2·탈것2)을 건드리지 않음');

        // ---- ② skill — UI 경로로 (빈 스킬 인벤 렌더까지 검증) ----
        UI.openAscension('skill');
        UI.onAscendLine('skill');
        ok(Object.keys(S.skills).length === 0, '② S.skills 전부 소멸');
        ok(S.equippedSkills.length === 0, '② 장착 스킬 전부 해제');
        ok(S.lineAscend.skill === 1, '② lineAscend.skill = 1');
        UI.renderSkillBar && UI.renderSkillBar(); // 빈 장착 상태 렌더가 안 터지는지 (에러는 ⑧이 잡는다)
        ok(S.pets.length === 2 && S.mounts.length === 2, '⑤ skill 승천이 펫·탈것을 건드리지 않음');

        // ---- ③ pet ----
        ok(Ascension.ascend('pet') === true, '③ pet 승천 성공');
        ok(S.pets.length === 0 && S.activePets.length === 0, '③ 보유·출전 펫 전부 소멸');
        ok(S.eggs.length === 1 && Array.isArray(S.hatching), '③ 알·부화 슬롯은 유지');
        ok(S.lineAscend.pet === 1, '③ lineAscend.pet = 1');
        ok(S.mounts.length === 2, '⑤ pet 승천이 탈것을 건드리지 않음');

        // ---- ⑦ 남은 알을 부화시키면 새 승천 횟수의 별이 찍힌다 ----
        S.hatching = [{ rarity: 'epic', endsAt: U.now() - 1000 }];
        S.eggs = [];
        Pets.tick();
        const hatched = S.pets[S.pets.length - 1];
        ok(!!hatched && hatched.stars === Ascension.count('pet'),
            '⑦ 승천 후 부화 펫의 별 = 승천 횟수 (' + (hatched && hatched.stars) + ' vs ' + Ascension.count('pet') + ')');

        // ---- ④ mount ----
        ok(Ascension.ascend('mount') === true, '④ mount 승천 성공');
        ok(Array.isArray(S.mounts) && S.mounts.length === 0, '④ 보유 탈것 전부 소멸 (배열 유지)');
        ok(S.activeMounts.length === 0, '④ 장착 탈것 해제 (유령 인덱스 없음)');
        ok(S.lineAscend.mount === 1, '④ lineAscend.mount = 1');

        return out;
    });

    for (const line of r) console.log(' ', line);
    const fails = r.filter(x => x.startsWith('FAIL'));
    for (const e of errs.slice(0, 5)) console.log('콘솔 에러 —', e);
    console.log(fails.length || errs.length ? `실패 ${fails.length}건 / 콘솔 에러 ${errs.length}건` : 'PASS — 승천이 자기 라인 인벤만 깨끗이 지운다');
    await browser.close();
    process.exit(fails.length || errs.length ? 1 : 0);
})();
