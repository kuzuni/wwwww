// 전 UI 화면 캡처 — 원본 shot-*.png 대조용 (TODO ② '전 UI 비율 전수 검증 패스' 2차 재채점)
// 사용: PW_PATH=<playwright 경로> node shot-screens.js [출력디렉터리]  — 기본 출력 web/tools/ref-cmp/clone/
// 짝: compose-ref.js 가 이 출력과 web/ref/screens/shot-*.png 를 좌우 합성(ref-cmp/cmp/)해 비평가 채점용 이미지를 만든다
const { chromium } = require(process.env.PW_PATH || '/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const INDEX = 'file://' + path.resolve(__dirname, '../index.html');
const { waitReady } = require('./wait-ready.js');
const { PETS_STATE_SRC } = require('./shot-pets.js');
const OUT = process.argv[2] || path.join(__dirname, 'ref-cmp/clone');
fs.mkdirSync(OUT, { recursive: true });

// 화면 목록: [출력이름, 원본shot, 페이지 안에서 실행할 오프너 소스]
const SCREENS = [
    ['main', '042120', `UI.closeAllTabSurfaces && UI.closeAllTabSurfaces();`],
    ['offline', '042110', `UI.showOffline(offlineRewardFor(4*3600))`],
    ['league', '042149', `UI.openLeague()`],
    ['league-rewards', '042208', `UI.openLeague(); UI.openLeagueRewards()`],
    ['league-challenge', '042228', `UI.openLeague(); UI.openLeagueChallenge()`],
    ['dungeons', '042251', `UI.openDungeons()`],
    ['dungeon-detail', '042304', `UI.openDungeons(); UI.openDungeonDetail('hammer')`],
    ['skills', '042340', `UI.switchTab('summon'); UI.switchSummonSub('skills')`],
    // 원본 042356·042445 는 **같은 상태**다(펫 3 Lv.61/6/3 + 알 7 + 부화 3칸 8시 26분 · Lv.69).
    // 기본 시드는 펫 8 + 알 12 라 그리드가 2행 더 쌓여 아래 판이 전부 밀린 채 대조된다 —
    // 두 화면 모두 shot-pets.js 의 원본 상태 주입을 쓴다.
    ['pets', '042356', PETS_STATE_SRC],
    ['pets-2', '042445', PETS_STATE_SRC],
    ['tech-overview', '042407', `UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechOverview()`],
    // 원본 042426 은 **장착 안 한** 스킬(화살 Lv.61 · 조각 1/8)을 연 상태다 — [장착] 버튼과 활성
    // [업그레이드] 가 보인다. 인덱스 0~2 는 시드가 장착해 둔 스킬이라 열면 버튼이 [해제] 로 바뀌고
    // 업그레이드가 비활성으로 찍혀, 같은 팝업인데 내용이 달라진 채 대조하게 된다.
    ['skill-detail', '042426', `UI.switchTab('summon'); UI.switchSummonSub('skills'); UI.openSkillDetail(Object.keys(S.skills)[3])`],
    ['pet-detail', '042449', `UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.openPetDetail(0)`],
    ['pet-upgrade', '042503', `UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.openPetUpgrade(0)`],
    // 원본 042521은 **펫** 확률표다(레벨 69 · "달걀을(를) 소환하여") — 스킬로 열면 배경 그리드와 문구가 달라
    // 비율 말고 내용까지 어긋난 채로 대조하게 된다. tech-branch 를 원본 분기에 맞춘 것과 같은 이유.
    ['summon-rates', '042521', `UI.switchTab('summon'); UI.switchSummonSub('pets'); UI.openSummonRates('pet')`],
    // 원본 042546의 제목은 '스킬, 펫 & 기술'이다 — 대장간 분기(10노드)를 찍어 놓고 이 원본과 대조하면
    // 노드 수부터 달라 비율 비교가 무의미해진다. 원본과 같은 skillpet 분기(12노드)를 찍는다.
    // 원본 042546 은 앞쪽 노드 7개가 **1/5 로 올라간** 상태이고 7번째에 '13시 30분' 연구 배지가 달린다.
    // 시드는 S.tech 가 비어 전부 0/5(회색)이라, 클론 캡처에는 원본의 브론즈 원반이 하나도 안 나온다
    // — 색을 대조할 수가 없다. 원본과 같은 진행도로 맞춘다(펫·스킬 상세에서 쓴 상태 정합과 같은 계열).
    ['tech-branch', '042546', `(() => {
        const ids = TechTree.nodesOf('skillpet');
        S.tech = S.tech || {};
        for (let i = 0; i < 7; i++) S.tech[ids[i]] = 1;
        S.techResearch = { id: ids[6], endsAt: U.now() + (13 * 60 + 30) * 60e3 };
        UI.switchTab('summon'); UI.switchSummonSub('tech'); UI.openTechBranch('skillpet');
    })()`],
    // 원본 042605의 배경은 **skillpet 분기**(제목 '스킬, 펫 & 기술')이고 팝업 노드는 '추가 알 획득 기회 IV'
    // = 우리 트리의 extraEgg 4단계, 레벨 1/5, 연구 진행 중이다. forge 분기/forgeTimer 로 찍으면 배경 노드 수와
    // 제목부터 달라 비율 대조가 무의미해진다(tech-branch 를 원본 분기에 맞춘 것과 같은 이유).
    ['tech-node', '042605', `(() => {
        const id = TechTree.nid('extraEgg', 4);
        S.tech = S.tech || {};
        for (let t = 1; t < 4; t++) S.tech[TechTree.nid('extraEgg', t)] = 5;   // 부모 사슬 해금
        S.tech[id] = 1;
        S.techResearch = { id, endsAt: U.now() + (13 * 60 + 30) * 60e3 };      // 원본 '13시 30분'
        UI.switchTab('summon'); UI.switchSummonSub('tech');
        UI.openTechBranch('skillpet'); UI.openTechNode(id);
    })()`],
    ['shop', '042632', `UI.openShop()`],
    ['pass', '042705', `UI.openPass()`],
    ['profile', '042724', `UI.openProfile()`],
    ['settings', '042744', `UI.openProfile(); UI._profileView='settings'; UI.renderProfile()`],
    ['forge-info', '042831', `UI.openForgeInfo()`],
    ['forge-list', '042905', `UI.openForgeInfo(); UI.openForgeList()`],
    ['forge-detail', '042931', `UI.openForgeInfo(); UI.openForgeList(); UI.openForgeDetail(AGES[0], 'weapon', Object.keys(WEAPON_TYPES)[0])`],
    // ⚠️ 원본 짝이 뒤집혀 있었다: 042950 은 **필터 ON**(토글 초록 + 서브옵션 목록 노출),
    // 043117 이 **필터 OFF**(토글 남색 + 목록 없음)다. 기본 시드는 filterOn=false 라
    // 'autoforge'(OFF)를 042950(ON)과, 'autoforge-filter'(ON)를 043117(OFF)과 대조하고 있었다 —
    // 좌우 합성이 두 장 다 어긋나 비율·스킨 채점이 통째로 무의미해진다.
    ['autoforge', '043117', `UI.openAutoForge()`],
    ['autoforge-filter', '042950', `S.autoForge.filterOn=true; UI.openAutoForge()`],
    // 새 장비도 원본처럼 서브옵션 2줄로 고정 (랜덤 1~4줄이면 카드 높이가 매 런 달라져 대조가 안 된다)
    ['craft-compare', '043224', `UI._realShowCraftModal(Object.assign(Forge.rollItem(), { subs: U.rollSubs(2) }))`],
    ['gear-detail', '043244', `UI.openGearDetail('weapon')`],
    ['player-info', '043313', `UI.openPlayerInfo()`],
    ['chat', '043500', `UI.openChat()`],
    ['mounts', null, `UI.openMounts()`],
];

// 캡처용 진행 상태 주입 — 빈 화면/잠금으로 레이아웃이 안 보이는 걸 방지
const SEED = () => {
    S.chapter = 4; S.stage = 1; S.bestChapter = 20; S.bestStage = 9; // 원본(어려움 4-1) 정합 + 영웅 생존(20-9은 즉사해 사망 토스트가 캡처 오염)
    S.hammers = 3.02e5; S.coins = 2.71e7; S.gems = 8150; S.tickets = 160;
    S.winders = 320; S.potions = 45; S.eggCurrency = 900; S.kills = 48210;
    S.forgeLevel = 29; S.name = '용사';
    S.autoForgeOn = true;
    S.autoForge.hammersPerBatch = 22;
    // ⚠️ 둘 다 실제 키가 아니라 캡처에서 체크가 하나도 안 켜졌다 — keepAges 는 인덱스가 아니라
    // 시대 문자열(renderAutoForge 의 cfg.keepAges.includes(age)), filterSubs 는 SUBSTATS 의 키다.
    // 원본 042950 은 마지막 두 시대 + 치명타 확률·피해가 켜진 상태라 같은 상태로 맞춘다.
    S.autoForge.keepAges = ['underworld', 'divine'];
    S.autoForge.filterSubs = ['critCh', 'critDmg'];
    S.autoForge.stopOnTarget = false;      // '계속하기' 체크 표시 — 원본 042950/043117 둘 다 이 체크가 켜져 있다
    // 장비 8부위 풀장착
    for (const slot of Object.keys(S.equipment)) {
        let it = null;
        for (let i = 0; i < 40 && !it; i++) { const r = Forge.rollItem(); if (r.slot === slot) it = r; }
        if (it) { it.level = 20 + (it.ageIdx || 0); S.equipment[slot] = it; }
    }
    // 원본 카드(shot-043244 장비 상세 · shot-043224 제작 비교)의 장비는 **서브옵션 2줄**짜리다.
    // rollItem은 등급에 따라 1~4줄을 랜덤으로 굴려서, 1줄짜리가 걸리면 카드가 줄당 약 2%H씩 짧게 찍혀
    // '카드 높이·위치가 원본과 다르다'는 가짜 불일치가 잡힌다 — 캡처용으로 전 부위를 2줄로 고정한다.
    for (const slot of Object.keys(S.equipment)) { const it = S.equipment[slot]; if (it) it.subs = U.rollSubs(2); }
    if (S.equipment.weapon) S.equipment.weapon.rarity = 'mythic';
    // 스킬 — 소환 비용을 먼저 채워야 실제로 뽑힌다(티켓 160으론 30연차 960이 모자라 그리드가 비어버림)
    // 원본(042340)은 **15/18 보유(3줄 그리드)** 상태다. 소환을 굴려서는 등급 확률 때문에 아무리 많이
    // 돌려도 낮은 등급 4~6종에서 멈춰 그리드가 1줄로 찍힌다(30연차·360연차 모두 실측) — 캡처용으로 직접 세운다.
    S.skills = {}; S.equippedSkills = [];
    SKILL_DEFS.slice(0, 15).forEach((d, i) => { S.skills[d.id] = { level: 20 + i * 3, dupes: (i * 3) % 8, stars: 0 }; });
    S.summonCount = 260;
    S.equippedSkills = Object.keys(S.skills).slice(0, 3);
    Combat.recalcHero();
    // 펫 — 알/부화/보유 모두 채움
    S.eggCurrency = 5000; Pets.summon(30);
    for (let i = 0; i < 8 && S.eggs.length; i++) { const e = S.eggs.shift(); S.pets.push({ name: Pets.LIST ? Pets.LIST[i % Pets.LIST.length].name : ('펫' + i), rarity: e.rarity, level: 10 + i * 3, dupes: 4 }); }
    if (S.hatching.length < 2 && S.eggs.length) S.hatching.push({ rarity: S.eggs.shift().rarity, endsAt: U.now() + 3600e3 });
    S.activePets = [0, 1, 2].filter(i => S.pets[i]);
    S.petSummonCount = 150;
    // 탈것
    S.winders = 4000; Mounts.summon(12); S.mountOpens = 90;
    const mn = Object.keys(S.mounts)[0]; if (mn) S.activeMount = mn;
    S.winders = 320;
    // 대장간 업그레이드 진행 중 (확률 정보 팝업 하단 진행바)
    S.forgeUpgradeEndsAt = U.now() + 96 * 60e3;
    // 기술 연구 진행 중 (기술 노드 초록 배지)
    try { S.techResearch = { id: 'forgeTimer', endsAt: U.now() + 42 * 60e3 }; } catch (e) { }
    // 던전 최고 기록 — 상세 팝업(042304)의 난이도가 원본과 **같은 값**으로 찍히도록 198 로 둔다.
    // 원본은 `20-9`(= 챕터-스테이지 쌍, 챕터당 10단계 규약 → 선형 199단계)이고 팝업 기본값은 최고+1 이다.
    // 옛 값 19 는 표기가 `N단계` 한 수뿐이던 시절 '20단계'로 숫자만 맞춰 보이게 한 것이라,
    // 표기를 원본 꼴로 고친 지금 그대로 두면 `2-10` 이 찍혀 **상태가 다른 화면**을 대조하게 된다.
    // ⚠️ 같은 SEED 사본이 shot-screens-seed.js 에도 있다 — 한쪽만 고치면 스크립트마다 다른 상태로 찍힌다.
    try { Dungeons.ensure(); for (const d of Dungeons.DEFS) { S.dungeons.best[d.id] = 198; S.dungeons.keys[d.id] = 2; } } catch (e) { }
    saveGame();
};

(async () => {
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 499, height: 892 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
    await page.goto(INDEX, { waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && typeof S !== "undefined" && typeof Forge !== "undefined"', { label: '스크립트 로드' });
    await page.evaluate(SEED);
    await page.reload({ waitUntil: 'load' });
    await waitReady(page, 'typeof UI !== "undefined" && S && S.forgeLevel === 29', { label: '시드 상태 로드' });
    // 캡처 중에는 토스트를 아예 막는다 — innerHTML 비우기만으로는 부족하다: 전투 틱이 clear 와
    // screenshot 사이에 새 토스트를 띄워 원본에 없는 알림 pill 이 화면에 찍힌다(리그 캡처에서
    // 시즌 종료 pill 위에 '첫 클리어' 토스트가 겹쳐 찍힌 사례). 채점용 캡처가 오염되면 안 된다.
    await page.evaluate(() => { UI.toast = () => { }; });
    // ⚠️ 자동 제련(S.autoForgeOn=true 시드)이 캡처 대기 중에 제작을 돌려 **비교 팝업이 화면 위에 떠 버린다**
    // — skills 캡처가 통째로 비교 팝업으로 덮인 실제 사례. '런마다 내용이 달라진다'던 흔들림의 원인이기도 하다.
    // [자동 ON] 배지는 살려야 하므로 S.autoForgeOn은 그대로 두고, 제작 진입과 팝업만 막는다.
    // (craft-compare 화면은 오프너에서 _realShowCraftModal로 직접 띄운다)
    await page.evaluate(() => {
        UI._realShowCraftModal = UI.showCraftModal;
        UI.showCraftModal = () => { };
        UI.resolvePendingCraft = () => { };
        UI.autoSeqStep = () => { };
        UI.clearPendingCraft(); UI.renderEquipSheet();
        UI.coinBurst = () => { };   // 대기품 자동 판정 판매의 코인 분출(780ms)이 다음 화면 위로 날아와 찍힌다
        // 보스 경고 마퀴(#boss-warning)와 피격 비네트(#dmg-flash)는 둘 다 **화면 전체를 덮는** 연출이라
        // 캡처가 통째로 붉게 물들고 상단에 WARNING 띠가 찍힌다 — 원본 shot 에는 없는 것이라
        // 비율 채점이 그대로 무의미해진다(main 캡처가 전면 적색 베일로 나온 실제 사례).
        // 전투는 계속 돌게 두고 이 두 연출만 막는다.
        UI.bossWarning = () => { };
        UI.flashDamage = () => { };
        const bw = document.getElementById('boss-warning'); if (bw) bw.classList.add('hidden');
        const df = document.getElementById('dmg-flash'); if (df) { df.classList.remove('on'); df.style.display = 'none'; }
    });
    // 전투 씬이 자리잡을 시간 (메인/플레이어 정보 프리뷰)
    await page.waitForTimeout(2500);
    // 디버그 탭 숨김 유지 확인용 로그
    const done = [];
    // ONLY=main,chat 처럼 화면을 골라 찍는다 — 한 화면만 고치는 반복 루프에서 30화면 전수(수 분)를
    // 매번 돌릴 이유가 없다. 미지정이면 종전대로 전체.
    const ONLY = (process.env.ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
    const TARGETS = ONLY.length ? SCREENS.filter(s => ONLY.includes(s[0])) : SCREENS;
    for (const [name, ref, src] of TARGETS) {
        try {
            // 화면 간 오염 제거: closeAllTabSurfaces는 MODAL_TAB 등록 모달만 닫으므로
            // 오프라인 보상·상세 툴팁 같은 미등록 모달이 다음 화면 위에 그대로 남아 캡처를 덮는다
            // (비평가 6인 전원이 '오프라인 모달이 화면 53%를 가려 채점 불가'로 지적) — 전 .modal 강제 닫기 + 토스트 소거
            // 탭 패널(소환/방 등)은 .modal이 아니라 switchTab이 관리하는 별도 면이라 위 두 줄로는 안 닫힌다
            // — 앞 화면에서 켠 탭이 남아 다음 화면의 '배경'으로 찍힌다(gear-detail 배경에 기술 트리가 깔려
            // 원본 대비 밴드가 33%p 어긋난 것으로 잡혔다). 탭 상태까지 되돌려야 배경이 원본과 같은 메인이 된다.
            await page.evaluate(() => {
                try { UI.closeAllTabSurfaces && UI.closeAllTabSurfaces(); } catch (e) { }
                try { UI.switchTab && UI.switchTab(null); } catch (e) { }
                document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
                const t = document.getElementById('toasts'); if (t) t.innerHTML = '';
            });
            await page.waitForTimeout(120);
            await page.evaluate(new Function(src));
            await page.waitForTimeout(650); // 열림 애니메이션(300ms) + 렌더 여유
            await page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; });
            // 첫 화면(main)이 'waiting for fonts to load'에서 30초 타임아웃으로 통째로 빠지던 것 해소 —
            // screenshot 내부의 폰트 대기는 조절할 수 없으므로 document.fonts.ready 를 먼저 상한을 걸어 소화하고
            // (여기서 안 끝나도 렌더는 폴백 폰트로 정상), screenshot 자체 타임아웃도 올린다.
            await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 3000))])).catch(() => { });
            await page.screenshot({ path: path.join(OUT, name + '.png'), timeout: 180000 });   // 병렬 세션이 많으면 60s 도 터진다(pass 캡처 실패 사례)
            done.push(name + (ref ? '←' + ref : ''));
        } catch (e) {
            errors.push('SCREEN ' + name + ': ' + e.message);
        }
    }
    console.log("captured " + done.length + "/" + TARGETS.length);
    console.log(done.join(', '));
    if (errors.length) console.log('\nERRORS(' + errors.length + '):\n' + errors.slice(0, 25).join('\n'));
    else console.log('\n(no console errors)');
    await browser.close();
})();
